#!/usr/bin/env node
/**
 * #680 — B-TSC-PUSH-GATE: refuse `git push` when the tsc baseline comparator has not been run,
 * or does not pass, for a push that can move the error count.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS — the incident, because a control without its origin gets optimised away
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 2026-08-07 12:35Z (CC-B): a JSX comment placed inside `return (` broke a file's parse. The
 * typecheck reported **13 errors against a baseline of 392**. I ran that check, SAW the number, and
 * pushed and deployed anyway — the push was chained after the check with `&&` and never gated on
 * its result. Staging ran the broken build for ~5 minutes.
 *
 * ⇒ **The failure was not a missing control. It was a control whose result gated nothing.**
 *
 * ★ AND THE DEEPER FINDING: `package.json` declares `"check": "tsc"` — raw tsc, no comparator —
 * and NO script in that file invokes `check-tsc-baseline.mjs`. Its only caller was CI. So the
 * command used all day, and quoted in commit messages as evidence, was structurally incapable of
 * detecting the failure it was standing in for. The detection already existed; what was missing was
 * an ENFORCEMENT POINT (CC-C's framing, which shrank this build to a third of its proposed size).
 *
 * ⚠️ WHAT THIS DOES NOT DO — stated here so nobody reads it as more than it is: it does NOT stop a
 * deploy outrunning CI. That is the incident's actual root cause, it is a DIFFERENT defect, and it
 * is homed at #681. This hook narrows the window; it does not close it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * DESIGN — every constraint here was someone's correction, kept with its reason
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * • ONE COMPARATOR, TWO CALL SITES. Invokes the existing `check-tsc-baseline.mjs`; no second
 *   implementation and no second threshold. A rival comparator with its own number is how two
 *   checks silently disagree (#449).
 *
 * • TRIGGER SET IS WIDER THAN `.ts` (Langston, Finding 1 — and it is the case that motivated the
 *   whole strictness change). A silently-excluded directory comes from **tsconfig, not a .ts file**,
 *   so a `.ts`-only filter would wave through precisely the scenario the gate exists for. Hence
 *   tsconfig*, package.json/lockfile, and the baseline file itself are all triggers.
 *
 * • MARKDOWN PUSHES SKIP (CC-C's cost objection, accepted without argument). The comparator is
 *   ~60-90s; three sessions push constantly and most pushes are governance markdown. A gate that
 *   taxes every documentation push is a gate people campaign to remove — **and a removed gate
 *   protects nothing**. A markdown push cannot move the error count, so paying for it buys nothing.
 *
 * • FAIL CLOSED (Langston's rider). If the comparator cannot be run or its output cannot be read,
 *   the push is REFUSED, loudly, with the reason. An inconclusive check must never read as a pass —
 *   that is the absent-as-valid failure this whole family of guards exists to prevent.
 *
 * • NO SECOND ESCAPE HATCH. `--regen-acknowledged` already exists on the comparator. Inventing a
 *   hook-specific bypass would create a second door with different semantics.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// ⚠️ INPUT ARRIVES ON STDIN, NOT IN AN ENV VAR. The first revision of this hook read
// `process.env.CLAUDE_TOOL_INPUT`, which is never set — so it would have parsed nothing, taken its
// catch branch, and **exited 0 on every push**. A guard documented as fail-closed would have been
// silently fail-OPEN, and nothing would have reported it: an inert hook and a satisfied hook look
// identical from outside. Caught by comparing against `guard-bare-commit.mjs`, which works.
// Same shape as everything else in #680's origin story: the control was present and measuring
// nothing. Payload shape (both spellings accepted, mirroring the working guard):
//   { tool_name | toolName, tool_input | toolInput: { command } }
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => main(raw));

function main(rawPayload) {
let payload;
try {
  payload = JSON.parse(rawPayload);
} catch {
  // Unparseable payload → not a decision we can make. Exit 0 rather than block every tool call:
  // this hook's remit is `git push` only, and a parse failure here says nothing about the push.
  process.exit(0);
}

const tool = payload?.tool_name ?? payload?.toolName;
if (tool !== 'Bash') process.exit(0);
const command = String(payload?.tool_input?.command ?? payload?.toolInput?.command ?? '');

// Only `git push`. Not fetch, not pull, not status.
if (!/\bgit\s+(-[^\s]+\s+)*push\b/.test(command)) process.exit(0);

/** Files whose change can move the tsc error count. See "TRIGGER SET" above — tsconfig is here
 *  because the silently-excluded-directory case originates there, not in any .ts file. */
const TRIGGERS = [
  /\.tsx?$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)\.tsc-baseline\.json$/,
];

function refuse(reason, detail) {
  console.error(`\n⛔ PUSH REFUSED — ${reason}\n`);
  if (detail) console.error(detail.trim() + '\n');
  console.error(
    'Why: on 2026-08-07 a broken parse reached staging because a typecheck was run, its result read,\n' +
      'and the push made anyway. A check whose result gates nothing is decoration (#680).\n' +
      'Run `node scripts/check-tsc-baseline.mjs` and fix what it reports. For a genuine mass-fix,\n' +
      '`--regen-acknowledged` is the single existing escape hatch — there is no hook-specific bypass.\n',
  );
  process.exit(2);
}

// ── Which files would this push send? ────────────────────────────────────────────────────────────
let changed = '';
try {
  const upstream = execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  changed = execSync(`git diff --name-only ${upstream}...HEAD`, { encoding: 'utf8' });
} catch {
  // No upstream (first push of a branch) → cannot enumerate, so cannot prove the push is harmless.
  // FAIL CLOSED by running the check rather than skipping it: the expensive-but-correct branch.
  changed = null;
}

if (changed !== null) {
  const files = changed.split('\n').map((s) => s.trim()).filter(Boolean);
  const relevant = files.filter((f) => TRIGGERS.some((re) => re.test(f)));
  if (files.length && relevant.length === 0) {
    // Nothing here can move the count. Skip silently — see the cost note above.
    process.exit(0);
  }
}

// ── Run the ONE comparator ───────────────────────────────────────────────────────────────────────
if (!existsSync('scripts/check-tsc-baseline.mjs')) {
  refuse(
    'the tsc baseline comparator is missing',
    'Expected scripts/check-tsc-baseline.mjs. Its absence cannot be read as "nothing to check" —\n' +
      'that is exactly the absent-as-valid reading this gate exists to refuse.',
  );
}

// ── The TOUCHED SET, for the comparator's option-(b) unexplained-drop check (#680) ──────────────
// Langston's build specs, each with the reason it is not the obvious thing:
//   • THE WHOLE PUSH RANGE, not the tip commit — a push sends every commit since the upstream, and
//     a drop explained by commit 1 must not be judged against commit 5's file list.
//   • DELETIONS AND RENAME OLD-PATHS COUNT AS TOUCHED — a deleted file's baseline entries dropping
//     is explained by the deletion. Without the old path, every legitimate file removal false-fires,
//     and a gate that cries wolf on routine work is a gate that gets removed.
//   • FAIL CLOSED — if the set cannot be computed we send the sentinel, and the comparator refuses.
//     An unclassifiable drop must never pass as an explained one.
let touchedPayload;
try {
  const upstream = execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const base = execSync(`git merge-base ${upstream} HEAD`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  // -M surfaces renames as `R<score>\told\tnew`; every other status is `X\tpath`.
  const status = execSync(`git diff --name-status -M ${base} HEAD`, { encoding: 'utf8' });
  const set = new Set();
  for (const line of status.split('\n')) {
    const parts = line.trim().split('\t').filter(Boolean);
    if (parts.length < 2) continue;
    const code = parts[0];
    if (code.startsWith('R') || code.startsWith('C')) {
      if (parts[1]) set.add(parts[1]); // OLD path — the one whose baseline entries disappear
      if (parts[2]) set.add(parts[2]);
    } else {
      set.add(parts[1]); // includes D (deleted): its baseline entries dropping IS explained
    }
  }
  touchedPayload = [...set].join('\n');
} catch {
  touchedPayload = '__UNCOMPUTABLE__';
}

const res = spawnSync('node', ['scripts/check-tsc-baseline.mjs'], {
  encoding: 'utf8',
  timeout: 5 * 60 * 1000,
  env: { ...process.env, TSC_GATE_TOUCHED_FILES: touchedPayload },
});

if (res.error || res.status === null) {
  refuse(
    'the baseline check could not be run to completion (FAIL CLOSED)',
    `${res.error?.message ?? 'no exit status — timed out or was killed'}\n` +
      'An inconclusive check is not a pass. It is refused for the same reason a failed one is:\n' +
      'silence and success must never be the same signal.',
  );
}

if (res.status !== 0) {
  refuse('the tsc baseline check FAILED', `${res.stdout ?? ''}\n${res.stderr ?? ''}`);
}

// Passed. Say so, and say what was and was not proved — a gate that overstates its reach is worse
// than none, because it buys confidence it did not earn.
console.error('[push-gate] tsc baseline check PASSED — push allowed.');
console.error('[push-gate] NOTE: this does not prove CI is green, and does not stop a deploy from');
console.error('[push-gate] outrunning CI (#681). It proves the error count did not move unexplained.');
process.exit(0);
}
