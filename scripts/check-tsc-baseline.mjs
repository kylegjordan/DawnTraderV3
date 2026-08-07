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
  // #579 (B-TSC-BASELINE-FIX): force a NON-INCREMENTAL full check.
  // tsconfig sets `incremental: true` with a persisted tsBuildInfoFile. That makes
  // consecutive tsc runs NON-DETERMINISTIC: a run against a STALE buildinfo (e.g. right
  // after a git pull) reports a partial/incorrect error set (measured: 401 vs the true
  // 394), and the exact (file, code, MESSAGE) attribution of long anonymous-type errors
  // shifts with cache depth — so a baseline generated in one cache state produces false
  // regressions when compared in another. `--incremental false` disables the cache
  // entirely (no read, no write) → every run is a full check → generate, compare, and CI
  // are byte-for-byte identical. CI is inherently cold (npm ci wipes node_modules, so no
  // buildinfo exists), so this is exactly the environment the gate must match. Verified
  // clean against this tsconfig (no tsBuildInfoFile conflict).
  // #579 --noErrorTruncation: tsc truncates long type messages ('…columnType: "PgV…')
  // at a fixed CHARACTER budget that INCLUDES the (host-varying-length) absolute paths —
  // so on a long-path host (CI: /home/runner/work/DawnTraderV3/DawnTraderV3/…) the budget
  // is consumed faster and the truncation cuts at a DIFFERENT point, losing different
  // content. Normalizing paths to <ROOT> AFTER truncation can't recover the lost chars, so
  // the surviving tail still differs cross-host (CI caught this: 2 drizzle TS2741s keyed
  // apart even with <ROOT>). Disabling truncation renders the FULL type identically on every
  // host; combined with the <ROOT> path strip the message is byte-identical + fully
  // discriminating (no info lost). Messages get long, but correctness beats file size.
  let output = '';
  try {
    output = execSync('npx tsc --noEmit --incremental false --noErrorTruncation', {
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
// a stable, PORTABLE identity. Collapse whitespace + stabilize the volatile
// `... N more ...` type-expansion count, THEN strip host-specific absolute paths.
//
// ★ PORTABILITY (CI caught this): tsc embeds ABSOLUTE paths inside messages, e.g.
// `import("<repo-root>/server/foo")`, and the repo root differs by environment — a dev
// clone `C:/DawnTraderV3-new`, a CI checkout `/home/runner/work/DawnTraderV3/DawnTraderV3`.
// Left raw, the SAME error keys to a DIFFERENT message-identity per machine, so a baseline
// generated on one host throws false regressions on another (CI reported 9 identical errors
// as 9 drops + 9 regressions, the absolute path the only difference). We canonicalize the
// repo-root prefix to a stable `<ROOT>` token two ways: (1) strip the actual runtime cwd
// (precise, forward-slash + case-insensitive since tsc emits `/` and may lowercase a drive);
// (2) a host-independent anchor pass strips ANY absolute prefix that precedes a known repo
// top-level dir — covers every dev clone (-old/-new/-analyst), CI, and staging. The
// normalizer runs IDENTICALLY at generate and compare, so canonicalizing host-varying text
// can only ever under-normalize into a false regression, never hide a real error (real
// errors differ in the property/type name, not just the path).
function normalizeMessage(msg) {
  const root = cwd().replace(/\\/g, '/');
  const rootRe = new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return msg
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.\.\. \d+ more \.\.\./g, '... N more ...')
    .replace(rootRe, '<ROOT>')
    .replace(
      /(?:[A-Za-z]:)?\/[^"'()\s]*?\/(?=(?:server|client|shared|node_modules|scripts|drizzle|migrations)\/)/g,
      '<ROOT>/',
    )
    // #579 size bound: with --noErrorTruncation the full type is rendered (a drizzle
    // TS2741 hit 53KB), so clip to a fixed length. Safe because it runs AFTER the path
    // strip on a now host-identical string — both hosts clip the same string at the same
    // index → still byte-identical. 300 chars keeps full discrimination (the property +
    // table/type name + type head live in the first ~150); the tail is boilerplate column
    // types. Keeps the committed baseline diff-able instead of multi-KB single lines.
    .slice(0, 300);
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
    // ★ #680 (CC-C's hole, Langston-confirmed at the ref): a drop is NOT automatically good news.
    // The >50% guard above catches a total collapse; it cannot see 392→390, which is exactly what a
    // PARTIAL parse failure or a silently-excluded directory produces — and which prints here as
    // "errors fixed — good" and exits 0. That is an absent-as-valid reading of the friendliest kind.
    // The gate does not fail on a drop by itself (the baseline is REQUIRED to net-shrink as fixes
    // land — the anti-graveyard discipline), so failing every drop would fight the file's purpose.
    // What it does is stop calling an unexamined drop good, and give the push gate a machine-readable
    // signal to require acknowledgement for. `--regen-acknowledged` is the existing, single hatch.
    console.log(`[baseline] ${drops.length} (file, code, message) counts BELOW baseline — VERIFY, do not assume fixed:`);
    console.log('[baseline]   a drop can mean errors were fixed OR that tsc did not see the code at all');
    console.log('[baseline]   (partial parse failure, excluded directory, moved file). Check before syncing.');
    for (const d of drops) console.log(`   - ${d.file} ${d.code}: ${d.baseline} -> ${d.current}  [${clip(d.message)}]`);

    // ★ #680 option (b), Langston-ruled 2026-08-07 — MECHANIZE "UNEXPLAINED".
    //
    // Failing EVERY drop was rejected: this baseline is REQUIRED to net-shrink as fixes land, so
    // fail-on-any-drop refuses every legitimate fix and makes `--regen-acknowledged` routine — which
    // is Finding 2's reflex-escape failure one door over. Warn-only was rejected too: a warning
    // nobody must read is #546-shaped.
    //
    // (b) matches the actual THREAT MODEL: a partial parse failure or a silently-excluded directory
    // clears errors in files the push NEVER TOUCHED. A genuine fix clears errors in files it edited.
    // So an untouched-file drop is the unexplained one, and that is what fails.
    //
    // ⚠️ ONE HONEST FALSE-POSITIVE CLASS, named rather than hidden (Langston): cross-file type
    // propagation — fixing an exported type in touched file A legitimately clears errors in untouched
    // consumer B. Those route through `--regen-acknowledged` with a stated reason, and that is
    // CORRECT FRICTION, not a defect: the acknowledgement IS the explanation the qualifier demands.
    // No second hatch.
    //
    // The touched set is supplied by the caller (the push hook computes it over the whole push
    // range). ABSENT ⇒ this check does not run, so CI behaviour is unchanged — the strictness lives
    // at the enforcement point that was missing, not in a second comparator.
    const touchedRaw = process.env.TSC_GATE_TOUCHED_FILES;
    if (!regenAcknowledged && touchedRaw !== undefined) {
      if (touchedRaw.trim() === '__UNCOMPUTABLE__') {
        // FAIL CLOSED (Langston's rider): if the caller could not determine what the push touches,
        // it cannot classify any drop, and an unclassifiable drop must not pass as explained.
        console.error(
          '\n[baseline] FAIL — the pushed file set could not be computed, so drops cannot be classified as explained or not. Refusing rather than assuming. (#680)',
        );
        exit(1);
      }
      const touched = new Set(
        touchedRaw.split('\n').map((s) => s.trim().replace(/\\/g, '/')).filter(Boolean),
      );
      const unexplained = drops.filter((d) => !touched.has(String(d.file).replace(/\\/g, '/')));
      if (unexplained.length) {
        console.error(
          `\n[baseline] FAIL — ${unexplained.length} (file, code, message) counts dropped in files this push DID NOT TOUCH.`,
        );
        for (const d of unexplained) {
          console.error(`   ! ${d.file} ${d.code}: ${d.baseline} -> ${d.current}  [${clip(d.message)}]`);
        }
        console.error(
          '\nErrors vanishing from files you did not edit is the signature of tsc not seeing the code —\n' +
            'a partial parse failure, an excluded directory, or a moved file — NOT of a fix. On 2026-08-07\n' +
            'that exact reading ("errors fixed — good") let a broken parse reach staging.\n' +
            'If this is genuine cross-file type propagation from a file you DID edit, re-run with\n' +
            '--regen-acknowledged and state the reason: the acknowledgement is the explanation. (#680)',
        );
        exit(1);
      }
    }
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

  // ★ #680 Finding 2 (Langston, 2026-08-07): THE SAME SILENT-CRASH GUARD MUST BIND SYNC.
  //
  // Compare mode has refused a >50% drop since chunk 5. Sync did NOT — it absorbed ANY drop
  // silently (`!current → removed++`, entry dropped). That asymmetry was survivable only while
  // compare tolerated small drops too. It stops being survivable the moment the push gate makes
  // ANY unexplained drop fail, because that change hands everyone a reason to reach for `--sync`
  // as the routine way past a red gate.
  //
  // ⛔ THE FAILURE THAT CREATES: a parse-failure run reports 13 errors instead of 392; the gate
  // refuses the push; the reflex is `--sync`; sync writes 13 as the new truth — and from then on
  // EVERYTHING IS GREEN, permanently, against a baseline built from a crash. The bypass would be
  // created BY the strictness change that was supposed to close the hole. Fix both or neither.
  //
  // Same threshold and same escape hatch as compare, deliberately: one invariant, two call sites
  // (#449 — a second comparator with its own number is how the two drift apart).
  const syncDerivedTotal = baseline.files.reduce((sum, f) => sum + sumFileErrors(f.errors), 0);
  if (!argv.includes('--regen-acknowledged') && total < syncDerivedTotal * 0.5) {
    console.error(
      `[baseline] SYNC REFUSED — tsc reported ${total} errors against a baseline of ${syncDerivedTotal}. ` +
        `A drop >50% in one run almost certainly means tsc did not actually run (toolchain breakage, ` +
        `stack trace instead of errors, missing dependencies) — and syncing it would BAKE THAT CRASH IN ` +
        `as the new baseline, turning every later run green against a number that was never real. ` +
        `If you genuinely cleared >50% of errors in one batch, re-run with --regen-acknowledged.`,
    );
    exit(1);
  }

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
