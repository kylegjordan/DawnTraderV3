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
//   node scripts/check-tsc-baseline.mjs              # compare (CI default)
//   node scripts/check-tsc-baseline.mjs --generate   # rewrite the baseline
//
// Generate mode is for the initial freeze and for deliberate, governance-
// reviewed updates. It MUST be invoked manually — CI never regenerates.

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

function compareBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `[baseline] ERROR: ${BASELINE_PATH} not found. Run with --generate to create it (governance-reviewed, not in CI).`,
    );
    exit(2);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const baselineByPath = new Map(baseline.files.map((f) => [f.path, f.errors]));

  console.log('[baseline] Running tsc and comparing to baseline...');
  const output = runTsc();
  const { counts, total } = parseErrors(output);

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

const cmd = argv[2];
if (cmd === '--generate') {
  generateBaseline();
} else if (cmd === '--help' || cmd === '-h') {
  console.log(`Usage:
  node scripts/check-tsc-baseline.mjs              # compare current tsc output to ${BASELINE_PATH} (CI default)
  node scripts/check-tsc-baseline.mjs --generate   # rewrite ${BASELINE_PATH} from current tsc output (governance-only)
`);
} else {
  compareBaseline();
}
