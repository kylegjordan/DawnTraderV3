#!/usr/bin/env node
// GUARD 2 (scope OBJ-9(d), KD-28; pre-audit section 9 P1d-5) — PreToolUse on Bash, PM Claude's clone ONLY.
// On EVERY `git commit` (amend and attested commits included): when DECISIONS.md is in the TRIGGER SET, run
// scripts/pm/reconcile-decisions.mjs --index and refuse (exit 2) on placement-citation failures only. Anchor problems are
// printed as warnings (anchors are read at the ref, so a row's own plan edit may not be there yet).
// THE TRIGGER SET is the UNION of `git diff --cached --name-only` and `git diff --cached --name-only HEAD^`:
//   - on --amend, `--cached` alone compares against the commit being replaced and misses a DECISIONS.md already in it (r5 C5);
//   - HEAD^ FAILING (exit 128: no HEAD, or a root commit) routes to the INDEX FALLBACK, `git ls-files` (the whole index),
//     NEVER to the non-blocking fault exit (reviewer condition A);
//   - the command text is never parsed for --amend: git accepts abbreviations such as --ame (r6 C5-B2).
// Over-triggering is safe: a row already committed is cited, `no-slot-check:`, or backfilled `pre-guard`, so it passes.
// Scoping as Guard 1: mapped non-PM clone -> exit 0 silently; unreadable/unmapped -> exit 0 plus a miss-log line;
// the hook's own fault -> exit 0 plus a miss-log line.
// Env overrides, for tests: PM_SLOT_MISS_LOG, PM_RECONCILE_REF (the ref reconcile reads at; default origin/migration/aws-supabase).
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLONES = {
  'DawnTraderV3-pm': 'PM',
  'DawnTraderV3-old': 'other', 'DawnTraderV3-new': 'other', 'DawnTraderV3-analyst': 'other',
  'DawnTraderV3-infra': 'other', 'DawnTraderV3': 'other',
};
const MISS_LOG = process.env.PM_SLOT_MISS_LOG || join(homedir(), '.claude', 'pm-slot-guard-misses.log');
const LEDGER = '1-system-manual/pm/DECISIONS.md';
const RECONCILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'pm', 'reconcile-decisions.mjs');
const miss = (why) => { try { mkdirSync(dirname(MISS_LOG), { recursive: true }); appendFileSync(MISS_LOG, `${new Date().toISOString()} guard-pm-decisions ${why}\n`); } catch { /* never break the hook */ } };
const GIT_COMMIT = /\bgit(?:\s+(?:-[A-Za-z]\s+\S+|--[\w-]+(?:=\S+)?|-[A-Za-z]+))*\s+commit\b/;

function names(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).split(/\r?\n/).filter(Boolean); }

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }
  const tool = payload?.tool_name ?? payload?.toolName;
  if (tool !== 'Bash') process.exit(0);
  const cmd = String((payload?.tool_input ?? payload?.toolInput)?.command ?? '');
  if (!GIT_COMMIT.test(cmd)) process.exit(0);

  const dirEnv = String(process.env.CLAUDE_PROJECT_DIR || '');
  const proj = basename(dirEnv);
  let blocked = null;
  try {
    if (!proj) { miss(`unreadable CLAUDE_PROJECT_DIR (git commit seen)`); process.exit(0); }
    const kind = CLONES[proj];
    if (kind === undefined) { miss(`unmapped project dir "${proj}" (git commit seen); the gate did not run`); process.exit(0); }
    if (kind !== 'PM') process.exit(0);

    const trigger = new Set(names(dirEnv, ['diff', '--cached', '--name-only']));
    let viaFallback = false;
    try { for (const f of names(dirEnv, ['diff', '--cached', '--name-only', 'HEAD^'])) trigger.add(f); }
    catch { viaFallback = true; for (const f of names(dirEnv, ['ls-files'])) trigger.add(f); } // no HEAD / root commit: the whole index
    if (!trigger.has(LEDGER)) process.exit(0);

    const args = [RECONCILE, '--index'];
    if (process.env.PM_RECONCILE_REF) args.push(`--ref=${process.env.PM_RECONCILE_REF}`);
    let out = '', status = 0;
    try { out = execFileSync(process.execPath, args, { cwd: dirEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }); }
    catch (e) { status = typeof e.status === 'number' ? e.status : -1; out = String(e.stdout || ''); if (status === 2 || status < 0) { miss(`reconcile could not read (exit ${status}): ${String(e.stderr || '').split('\n')[0]}`); process.exit(0); } }
    const placement = out.split(/\r?\n/).filter((l) => l.includes('PLACEMENT:'));
    if (placement.length) blocked = { placement, viaFallback };
    else if (status === 1) process.stderr.write(`guard-pm-decisions: anchor warnings (not blocking):\n${out}\n`);
  } catch (e) {
    miss(`fault: ${String(e && e.message).split('\n')[0]}`);
    process.exit(0);
  }
  if (blocked) {
    process.stderr.write(
      `GUARD 2 (KD-28): this commit carries DECISIONS.md${blocked.viaFallback ? ' (trigger set from the whole index: no HEAD^)' : ''} and a placement decision fails its slot-check citation:\n` +
      blocked.placement.join('\n') + '\n' +
      `Run node scripts/pm/slot-check.mjs, stage the record in THIS commit, and cite it as "slot-check: <path>" in the row (kind = placement), or write "no-slot-check: <reason>" where Kyle can see it.\n`);
    process.exit(2);
  }
  process.exit(0);
});
