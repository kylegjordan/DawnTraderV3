#!/usr/bin/env node
// scripts/check-tsc-baseline.mjs
// B-NEW-43 chunk 5 (2026-05-23): TypeScript baseline-comparison gate.
//
// Purpose: replace the ci.yml typecheck `continue-on-error: true` mechanism
// (which silently swallowed ALL tsc errors) with a per-file-per-error-code
// comparison against a frozen baseline. CI fails if any (file, code) error
// count rises above its baseline value OR a new (file, code) pair appears.
//
// Discipline (B-NEW-43 anti-graveyard, CC ↔ Langston consensus 2026-05-23):
//   - NO @ts-expect-error / @ts-ignore / `as any` / `!` suppression in source.
//     The errors stay live in the tsc output — this script only chooses what
//     to gate on.
//   - Per-FILE per-CODE per-MESSAGE comparison (#579, 2026-07-27; was per-(file,
//     code) count, which allowed a NEW error to hide under a stale (file,code)
//     ceiling's headroom, AND allowed trading a fixed error for a distinct new one
//     of the same code silently — exactly the graveyard mechanism we prevent).
//     The identity is the tsc PRIMARY-line message (property/type name = the
//     distinguishing detail); a new message fails regardless of count headroom.
//   - Baseline file is human-readable JSON with per-file phase tags + context.
//     Diffs are review-worthy governance.
//   - Batches that grow the baseline must enumerate + justify each addition
//     in the completion report (else the batch is incomplete at Step 8).
//
// Modes:
//   node scripts/check-tsc-baseline.mjs                       # compare (CI default)
//   node scripts/check-tsc-baseline.mjs --generate            # rewrite the baseline
//   node scripts/check-tsc-baseline.mjs --regen-acknowledged  # compare; skip the silent-tsc-crash sanity check
//
// Generate mode is for the initial freeze and for deliberate, governance-
// reviewed updates. It MUST be invoked manually — CI never regenerates.
//
// Note on file renames: a file rename registers as a regression (old file
// vanishes, new file is unknown to baseline). That is correct governance
// behavior — you cannot silently rename a file to dodge the gate. To rename
// a file, regenerate the baseline as part of the same rename commit.
//
// Note on the silent-tsc-crash sanity check: if `npx tsc` exits with no
// parseable error output (toolchain breakage, stack trace instead of errors),
// the script would otherwise parse 0 current errors and treat the delta as
// `baseline.total_errors` drops — i.e. mistake a tool failure for a clean
// state. The check fails the gate if `current_total < baseline_total * 0.5`
// to surface that case. Pass `--regen-acknowledged` to bypass it when you
// genuinely cleared > 50% of errors in one batch (rare).

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { argv, exit, cwd } from 'node:process';
import { pathToFileURL } from 'node:url';

const BASELINE_PATH = '.tsc-baseline.json';

function runTsc() {
  let output = '';
  try {
    output = execSync('npx tsc --noEmit', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      cwd: cwd(),
    });
  } catch (e) {
    // tsc exits 1 on type errors; that is expected — capture its output.
    output = (e.stdout || '') + (e.stderr || '');
  }
  return output;
}

// #579 (B-TSC-BASELINE-FIX, 2026-07-27): normalize a tsc primary-line MESSAGE into
// a stable identity. Collapse whitespace + stabilize the volatile `... N more ...`
// type-expansion count (rare on a primary line, but harmless to normalize). The
// primary-line message carries the distinguishing detail (property/type name), which
// is what makes a NEW error distinct from a baselined one even under (file,code)
// headroom — the whole point of moving from count-identity to message-identity.
function normalizeMessage(msg) {
  return msg
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.\.\. \d+ more \.\.\./g, '... N more ...');
}

// Parse `tsc --noEmit` output into { counts: {file: {code: {message: n}}}, total }.
// Expected line shape: `path/to/file.ts(line,col): error TS####: message`.
// #579: keyed by (file, code, MESSAGE) — NOT just (file, code) count — so a new
// error is detected by its distinct message even when a stale (file,code) ceiling
// leaves headroom (the pre-fix gate only compared per-(file,code) counts, so a new
// error that fit under the ceiling passed green). The regex still matches only the
// PRIMARY error line (continuation/type-expansion lines never start with
// `file(line,col): error`), so the message is the short, stable primary-line text.
function parseErrors(output) {
  const counts = {};
  let total = 0;
  const re = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
  for (const line of output.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/'); // normalize to forward slashes
    const code = m[4];
    const message = normalizeMessage(m[5]);
    if (!counts[file]) counts[file] = {};
    if (!counts[file][code]) counts[file][code] = {};
    counts[file][code][message] = (counts[file][code][message] || 0) + 1;
    total++;
  }
  return { counts, total };
}

// #579 helper: total error count within a per-file `errors` object of the new
// nested shape { code: { message: count } }.
function sumFileErrors(errorsByCode) {
  let n = 0;
  for (const messages of Object.values(errorsByCode)) {
    for (const c of Object.values(messages)) n += c;
  }
  return n;
}

// #579: PURE comparison (no I/O, no exit) of current tsc counts
// {file:{code:{message:n}}} against baseline files[] ({path, errors:{code:{message:n}}}).
// Returns { regressions, newPaths, drops }:
//   - regressions: (file,code,message) whose CURRENT count exceeds baseline. A NEW
//     message has baseline 0, so ANY occurrence is a regression — REGARDLESS of the
//     file's (file,code) count headroom. That is what closes #579 (and the 1-for-1
//     swap: the new message regresses even though the (file,code) total is flat).
//   - newPaths: files with errors not in the baseline at all.
//   - drops: (file,code,message) below baseline (fixed — good news).
// Exported so the 3-case guarantee is unit-tested.
function computeDiff(counts, baselineFiles) {
  const baselineByPath = new Map(baselineFiles.map((f) => [f.path, f.errors]));
  const regressions = [];
  const newPaths = [];
  for (const [path, codes] of Object.entries(counts)) {
    const baselineCodes = baselineByPath.get(path);
    if (!baselineCodes) {
      newPaths.push({ path, codes });
      continue;
    }
    for (const [code, messages] of Object.entries(codes)) {
      const baselineMessages = baselineCodes[code] || {};
      for (const [message, count] of Object.entries(messages)) {
        const baselineCount = baselineMessages[message] || 0;
        if (count > baselineCount) {
          regressions.push({ file: path, code, message, baseline: baselineCount, current: count });
        }
      }
    }
  }
  const drops = [];
  for (const f of baselineFiles) {
    const currentCodes = counts[f.path] || {};
    for (const [code, messages] of Object.entries(f.errors)) {
      const currentMessages = currentCodes[code] || {};
      for (const [message, baselineCount] of Object.entries(messages)) {
        const currentCount = currentMessages[message] || 0;
        if (currentCount < baselineCount) {
          drops.push({ file: f.path, code, message, baseline: baselineCount, current: currentCount });
        }
      }
    }
  }
  return { regressions, newPaths, drops };
}

function gitShortHead() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function generateBaseline() {
  console.log('[baseline] Running tsc to generate baseline...');
  const output = runTsc();
  const { counts, total } = parseErrors(output);
  const sortedFiles = Object.keys(counts).sort();
  const files = sortedFiles.map((path) => ({
    path,
    phase_tag: 'TBD (audit pending)',
    context:
      'Per-(code, message) baseline (v2, #579). CI fails on any current (file, code, message) count rising above these OR any new message appearing for a (file, code) — closing the pre-fix headroom hole where a new error hid under a stale (file, code) count ceiling.',
    errors: counts[path],
  }));
  const baseline = {
    version: 2,
    format: 'per-file per-code per-MESSAGE counts (#579, B-TSC-BASELINE-FIX 2026-07-27; was v1 per-file per-code counts)',
    frozen_at_commit: gitShortHead(),
    frozen_at_iso: new Date().toISOString(),
    frozen_by_batch: 'B-TSC-BASELINE-FIX (#579 — message-identity gate)',
    total_errors: total,
    file_count: files.length,
    files,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(
    `[baseline] Generated ${BASELINE_PATH}: ${total} errors across ${files.length} files (commit ${baseline.frozen_at_commit}).`,
  );
}

function compareBaseline({ regenAcknowledged }) {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `[baseline] ERROR: ${BASELINE_PATH} not found. Run with --generate to create it (governance-reviewed, not in CI).`,
    );
    exit(2);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

  // Polish (Langston chunk-5 observation 2): re-derive total_errors / file_count
  // from files[] and warn if the stored metadata disagrees. Prevents a future
  // hand-edit landing inconsistent metadata.
  const derivedTotal = baseline.files.reduce(
    (sum, f) => sum + sumFileErrors(f.errors),
    0,
  );
  const derivedFileCount = baseline.files.length;
  if (
    typeof baseline.total_errors === 'number' &&
    baseline.total_errors !== derivedTotal
  ) {
    console.warn(
      `[baseline] WARNING: stored total_errors=${baseline.total_errors} disagrees with files[] derived total=${derivedTotal}. Hand-edit drift? Regenerating would resync.`,
    );
  }
  if (
    typeof baseline.file_count === 'number' &&
    baseline.file_count !== derivedFileCount
  ) {
    console.warn(
      `[baseline] WARNING: stored file_count=${baseline.file_count} disagrees with files[] derived count=${derivedFileCount}.`,
    );
  }

  console.log('[baseline] Running tsc and comparing to baseline...');
  const output = runTsc();
  const { counts, total } = parseErrors(output);

  // Polish (Langston chunk-5 observation 1): silent-tsc-crash sanity check.
  // If `npx tsc` produced no parseable errors and we are well below the
  // baseline total, that almost certainly means tsc did not actually run
  // (toolchain breakage, stack-trace-instead-of-errors). Fail loudly so
  // we do not mistake a tool failure for "everything is fixed!".
  if (!regenAcknowledged && total < derivedTotal * 0.5) {
    console.error(
      `[baseline] FAIL — current tsc reported ${total} errors but baseline is ${derivedTotal}. A drop >50% in one run almost certainly means tsc did not actually run (toolchain breakage, stack trace instead of errors, missing dependencies). If you genuinely cleared >50% of errors in one batch, re-run with --regen-acknowledged to bypass this check.`,
    );
    exit(1);
  }

  // #579: per-(file, code, MESSAGE) diff via the pure, exported computeDiff (so the
  // 3-case guarantee is unit-tested: new-message-under-ceiling caught; same-message
  // shifted-line passes; the 1-for-1 swap caught — the case a per-(file,code)-count
  // gate silently passes).
  const { regressions, newPaths, drops } = computeDiff(counts, baseline.files);

  console.log(`[baseline] Current: ${total} errors. Baseline: ${baseline.total_errors} errors.`);
  const clip = (s) => (s.length > 90 ? s.slice(0, 87) + '...' : s);
  if (drops.length) {
    console.log(`[baseline] ${drops.length} (file, code, message) counts BELOW baseline (errors fixed — good):`);
    for (const d of drops) console.log(`   - ${d.file} ${d.code}: ${d.baseline} -> ${d.current}  [${clip(d.message)}]`);
  }
  if (regressions.length) {
    console.log(`[baseline] REGRESSION — ${regressions.length} (file, code, message) counts ABOVE baseline:`);
    for (const r of regressions) console.log(`   ! ${r.file} ${r.code}: ${r.baseline} -> ${r.current}  [${clip(r.message)}]`);
  }
  if (newPaths.length) {
    console.log(`[baseline] REGRESSION — ${newPaths.length} files with errors not in baseline:`);
    for (const n of newPaths) console.log(`   ! ${n.path}: ${JSON.stringify(n.codes)}`);
  }

  if (regressions.length > 0 || newPaths.length > 0) {
    console.error(
      `\n[baseline] FAIL — typecheck regressed above baseline. Either fix the regressions, OR if the addition is intentional, update ${BASELINE_PATH} in the same commit and enumerate + justify the additions in the batch completion report (B-NEW-43 anti-graveyard discipline — per-batch soft cap ~10 additions without explicit Kyle approval).`,
    );
    exit(1);
  }
  console.log('[baseline] OK — no regressions above baseline.');
}

// --sync mode: update per-file error counts to match current tsc output
// (so the baseline reflects the post-fix state) while PRESERVING phase_tag,
// context, and frozen_* provenance. Used by chunks 7+ after they fix
// confidently-clean errors — the baseline should net-shrink as fixes land,
// per the anti-graveyard discipline (PHASE_HISTORY tracks baseline size at
// phase close, net-shrinking required by Phase 19 completion).
function syncBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(`[baseline] ERROR: ${BASELINE_PATH} not found — cannot sync.`);
    exit(2);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  console.log('[baseline] Running tsc and syncing counts into baseline...');
  const output = runTsc();
  const { counts, total } = parseErrors(output);

  let cleared = 0;
  let removed = 0;
  const newFiles = baseline.files
    .map((f) => {
      const current = counts[f.path];
      if (!current) {
        removed++;
        return null; // file has no current errors — drop entry
      }
      // #579: per-code value is now a { message: count } map. Record reality
      // (current messages+counts); the COMPARE gate rejects regressions.
      const newErrors = {};
      for (const [code, messages] of Object.entries(current)) {
        newErrors[code] = messages;
      }
      const baselineTotal = sumFileErrors(f.errors);
      const currentTotal = sumFileErrors(newErrors);
      if (currentTotal < baselineTotal) cleared += baselineTotal - currentTotal;
      return { ...f, errors: newErrors };
    })
    .filter(Boolean);

  // Also include any files that have NEW errors not in the baseline (the
  // sync step records reality — the COMPARE gate is what rejects regressions,
  // so a separate manual decision is required before syncing in regressions.
  // For sync-mode we abort if regressions are detected to force the user to
  // either fix them OR explicitly --include-regressions.
  const baselineByPath = new Set(baseline.files.map((f) => f.path));
  const newPathRegressions = [];
  for (const [path, codes] of Object.entries(counts)) {
    if (!baselineByPath.has(path)) {
      newPathRegressions.push({ path, codes });
    } else {
      // #579: per-(code, MESSAGE) regression check on existing files.
      const baselineCodes = baseline.files.find((f) => f.path === path).errors;
      for (const [code, messages] of Object.entries(codes)) {
        const baselineMessages = baselineCodes[code] || {};
        for (const [message, count] of Object.entries(messages)) {
          if (count > (baselineMessages[message] || 0)) {
            newPathRegressions.push({ path, code, message, baseline: baselineMessages[message] || 0, current: count });
          }
        }
      }
    }
  }
  if (newPathRegressions.length && !argv.includes('--include-regressions')) {
    console.error(
      `[baseline] FAIL — sync detected ${newPathRegressions.length} regression(s) above baseline; sync mode REFUSES to silently absorb them. Either fix them (preferred — that is the whole point of the gate) OR re-run with --include-regressions to ACK-grow the baseline (anti-graveyard: must be enumerated + justified in the batch completion report).`,
    );
    for (const r of newPathRegressions) console.error(`   ! ${JSON.stringify(r)}`);
    exit(1);
  }

  baseline.files = newFiles;
  baseline.total_errors = total;
  baseline.file_count = newFiles.length;
  baseline.last_synced_at_iso = new Date().toISOString();
  baseline.last_synced_by_batch = 'B-NEW-43 (chunk 7+ — sync after clean-error fixes)';

  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  // Note (Langston chunk-7 nit): `cleared` counts errors cleared on files that
  // REMAIN in the baseline (count > 0 after sync). Errors on files that were
  // dropped entirely (count went to 0) are NOT included in `cleared` — they
  // are tallied via `removed` instead. So the two numbers together describe
  // the full shrinkage; reading `cleared` alone can look contradictory next
  // to `removed`. Both are reported here for transparency.
  console.log(
    `[baseline] Synced. ${cleared} errors cleared on files still in baseline, ${removed} files dropped entirely (their counts went to 0). New baseline: ${total} errors across ${newFiles.length} files.`,
  );
}

// #579: pure helpers exported for unit testing (the CLI dispatch below is guarded
// so an `import` never triggers a tsc run / exit).
export { parseErrors, normalizeMessage, sumFileErrors, computeDiff };

// Run the CLI dispatch ONLY when executed directly (`node scripts/check-tsc-baseline.mjs`),
// not when imported by a test. Without this guard, importing the module would fall
// through to `compareBaseline()` and shell out to tsc.
const isMain = import.meta.url === pathToFileURL(argv[1] || '').href;
if (isMain) {
  const flags = argv.slice(2);
  if (flags.includes('--generate')) {
    generateBaseline();
  } else if (flags.includes('--sync')) {
    syncBaseline();
  } else if (flags.includes('--help') || flags.includes('-h')) {
    console.log(`Usage:
  node scripts/check-tsc-baseline.mjs                       # compare current tsc output to ${BASELINE_PATH} (CI default)
  node scripts/check-tsc-baseline.mjs --generate            # rewrite ${BASELINE_PATH} from current tsc output (governance-only, loses phase_tag/context)
  node scripts/check-tsc-baseline.mjs --sync                # update per-file counts in ${BASELINE_PATH} after clean fixes (preserves phase_tag/context/frozen_*)
  node scripts/check-tsc-baseline.mjs --regen-acknowledged  # compare; skip the silent-tsc-crash sanity check (for genuine big drops)
`);
  } else {
    compareBaseline({ regenAcknowledged: flags.includes('--regen-acknowledged') });
  }
}
