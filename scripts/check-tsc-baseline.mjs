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
//   - Per-FILE per-CODE comparison (not total-count). Total-count gating
//     allows trading a fixed error for a new one silently — exactly the
//     graveyard mechanism we are preventing.
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

// Parse `tsc --noEmit` output into { counts: {file: {code: n}}, total }.
// Expected line shape: `path/to/file.ts(line,col): error TS####: message`.
function parseErrors(output) {
  const counts = {};
  let total = 0;
  const re = /^(.+?)\((\d+),(\d+)\): error (TS\d+):/;
  for (const line of output.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/'); // normalize to forward slashes
    const code = m[4];
    if (!counts[file]) counts[file] = {};
    counts[file][code] = (counts[file][code] || 0) + 1;
    total++;
  }
  return { counts, total };
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
    phase_tag: 'TBD (audit pending — B-NEW-43 chunk 6)',
    context:
      'TBD — to be filled by the B-NEW-43 chunk 6 audit (Phase-19 intake seed). Until then the per-file error counts below are the mechanical comparison baseline; CI fails on any (file, code) count rising above these or any new (file, code) pair appearing.',
    errors: counts[path],
  }));
  const baseline = {
    version: 1,
    frozen_at_commit: gitShortHead(),
    frozen_at_iso: new Date().toISOString(),
    frozen_by_batch: 'B-NEW-43 (chunk 5 — baseline-gate infrastructure)',
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
  const baselineByPath = new Map(baseline.files.map((f) => [f.path, f.errors]));

  // Polish (Langston chunk-5 observation 2): re-derive total_errors / file_count
  // from files[] and warn if the stored metadata disagrees. Prevents a future
  // hand-edit landing inconsistent metadata.
  const derivedTotal = baseline.files.reduce(
    (sum, f) => sum + Object.values(f.errors).reduce((s, n) => s + n, 0),
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

  const regressions = []; // (file, code) count above baseline
  const newPaths = []; // file with errors that is not in baseline at all
  for (const [path, codes] of Object.entries(counts)) {
    const baselineCodes = baselineByPath.get(path);
    if (!baselineCodes) {
      newPaths.push({ path, codes });
      continue;
    }
    for (const [code, count] of Object.entries(codes)) {
      const baselineCount = baselineCodes[code] || 0;
      if (count > baselineCount) {
        regressions.push({ file: path, code, baseline: baselineCount, current: count });
      }
    }
  }

  // Drops (errors fixed since baseline) — good news, surface for visibility.
  const drops = [];
  for (const f of baseline.files) {
    const currentCodes = counts[f.path] || {};
    for (const [code, baselineCount] of Object.entries(f.errors)) {
      const currentCount = currentCodes[code] || 0;
      if (currentCount < baselineCount) {
        drops.push({ file: f.path, code, baseline: baselineCount, current: currentCount });
      }
    }
  }

  console.log(`[baseline] Current: ${total} errors. Baseline: ${baseline.total_errors} errors.`);
  if (drops.length) {
    console.log(`[baseline] ${drops.length} (file, code) counts BELOW baseline (errors fixed — good):`);
    for (const d of drops) console.log(`   - ${d.file} ${d.code}: ${d.baseline} -> ${d.current}`);
  }
  if (regressions.length) {
    console.log(`[baseline] REGRESSION — ${regressions.length} (file, code) counts ABOVE baseline:`);
    for (const r of regressions) console.log(`   ! ${r.file} ${r.code}: ${r.baseline} -> ${r.current}`);
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

const flags = argv.slice(2);
if (flags.includes('--generate')) {
  generateBaseline();
} else if (flags.includes('--help') || flags.includes('-h')) {
  console.log(`Usage:
  node scripts/check-tsc-baseline.mjs                       # compare current tsc output to ${BASELINE_PATH} (CI default)
  node scripts/check-tsc-baseline.mjs --generate            # rewrite ${BASELINE_PATH} from current tsc output (governance-only)
  node scripts/check-tsc-baseline.mjs --regen-acknowledged  # compare; skip the silent-tsc-crash sanity check (for genuine big drops)
`);
} else {
  compareBaseline({ regenAcknowledged: flags.includes('--regen-acknowledged') });
}
