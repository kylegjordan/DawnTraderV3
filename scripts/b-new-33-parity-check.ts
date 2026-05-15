/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-NEW-33 parity check — compare CLI methodology vs existing aggregator
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Kyle directive 2026-05-15: before B-NEW-33's "all 10 INCONCLUSIVE" verdict is
 * acted on, prove the CLI's calculation matches the existing aggregator's
 * calculation on the SAME pre-stall data window. If they match, the verdict
 * is methodologically sound and the upstream-artifact hypothesis (B-NEW-36)
 * stands. If they DON'T match, fix the CLI before proceeding.
 *
 * What this script does:
 *
 *   1. Defines a PRE-DRAIN row set — rows where replay_completed_at < 2026-05-15
 *      (= rows replayed by the old cron pre-stall, NOT by B-NEW-33's drain).
 *      Empirically: 7,593 rows across 10 factors.
 *
 *   2. Runs the existing aggregator (`computeFactorCalibration`'s logic, copied
 *      inline for clean isolation) on those rows. This reproduces what Kyle was
 *      observing in the UI panel pre-stall.
 *
 *   3. Runs the B-NEW-33 CLI's verdict logic (`analyzeFactorRows`-equivalent,
 *      copied inline) on the SAME rows.
 *
 *   4. Side-by-sides the per-factor results. Spread, p-value, decision-grade
 *      status, verdict.
 *
 *   5. Diagnoses any deltas:
 *      - B76 frozen-factor filter (existing aggregator applies; CLI does not)
 *      - Tertile rounding / sort stability (Math.floor boundaries)
 *      - Outcome inclusion (existing aggregator counts unreplayable rows with
 *        WR=0; CLI excludes them — but pre-drain has zero unreplayable rows,
 *        so this diff is invisible in the pre-drain comparison)
 *
 * Output: stdout table + write to `Claude Comms and Packages/Batch Completion/
 * B-NEW-33_PARITY_CHECK.md`.
 *
 * Reference: Kyle directive 2026-05-15 evening.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

const ASSET_CLASS = 'crypto_spot';
const PRE_DRAIN_CUTOFF = '2026-05-15'; // B-NEW-33 drain ran 2026-05-15 15:42 UTC

// B76 frozen-factor filter — these factor_names need calibrationFrameworkVersion
// = 'b76_chain_final' to be included (else pre-B76 structural bias contaminates).
const B76_FILTERED_FACTORS = new Set([
  'b67_1_btc_dominance', 'b67_1_funding_rates', 'b67_1_mcap_momentum',
  'b67_1_macro_modifier', 'b67_2_phase_preference', 'b67_2_phase_dimension',
]);

const MIN_N_PER_BUCKET = 150;
const MIN_SPREAD_PP = 7;
const MAX_P_VALUE = 0.05;

interface Row {
  factor_name: string;
  real_conf: number;
  alt_conf: number;
  outcome: string;
  calibration_version: string | null;
}

async function loadRows(applyB76Filter: boolean, cohort: 'pre-drain' | 'post-drain' | 'all'): Promise<Row[]> {
  const cohortClause = cohort === 'pre-drain'
    ? sql`AND replay_completed_at < ${PRE_DRAIN_CUTOFF}::timestamptz`
    : cohort === 'post-drain'
      ? sql`AND replay_completed_at >= ${PRE_DRAIN_CUTOFF}::timestamptz`
      : sql``;
  const b76Clause = applyB76Filter
    ? sql`AND (
        factor_name NOT IN ('b67_1_btc_dominance', 'b67_1_funding_rates', 'b67_1_mcap_momentum',
                            'b67_1_macro_modifier', 'b67_2_phase_preference', 'b67_2_phase_dimension')
        OR real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final'
      )`
    : sql``;
  const result: any = await db.execute(sql`
    SELECT
      factor_name,
      (real_decision->>'confidence')::float AS real_conf,
      (alternate_decision->>'confidence')::float AS alt_conf,
      COALESCE(replay_outcome->>'outcome', '') AS outcome,
      real_decision->'metadata'->>'calibrationFrameworkVersion' AS calibration_version
    FROM regime_factor_alternates
    WHERE asset_class = ${ASSET_CLASS}
      AND replay_completed_at IS NOT NULL
      AND real_decision->>'confidence' IS NOT NULL
      AND alternate_decision->>'confidence' IS NOT NULL
      ${cohortClause}
      ${b76Clause}
    ORDER BY factor_name
  `);
  const rows = (result as any).rows ?? result;
  return rows.map((r: any) => ({
    factor_name: r.factor_name,
    real_conf: Number(r.real_conf),
    alt_conf: Number(r.alt_conf),
    outcome: r.outcome,
    calibration_version: r.calibration_version,
  }));
}

async function loadPreDrainRows(applyB76Filter: boolean): Promise<Row[]> {
  // Pre-drain rows = replay_completed_at strictly before 2026-05-15 (the date
  // my drain ran). Earliest pre-drain replay was 2026-04-30.
  const b76Clause = applyB76Filter
    ? sql`AND (
        factor_name NOT IN ('b67_1_btc_dominance', 'b67_1_funding_rates', 'b67_1_mcap_momentum',
                            'b67_1_macro_modifier', 'b67_2_phase_preference', 'b67_2_phase_dimension')
        OR real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final'
      )`
    : sql``;

  const result: any = await db.execute(sql`
    SELECT
      factor_name,
      (real_decision->>'confidence')::float AS real_conf,
      (alternate_decision->>'confidence')::float AS alt_conf,
      COALESCE(replay_outcome->>'outcome', '') AS outcome,
      real_decision->'metadata'->>'calibrationFrameworkVersion' AS calibration_version
    FROM regime_factor_alternates
    WHERE asset_class = ${ASSET_CLASS}
      AND replay_completed_at IS NOT NULL
      AND replay_completed_at < ${PRE_DRAIN_CUTOFF}::timestamptz
      AND real_decision->>'confidence' IS NOT NULL
      AND alternate_decision->>'confidence' IS NOT NULL
      ${b76Clause}
    ORDER BY factor_name
  `);
  const rows = (result as any).rows ?? result;
  return rows.map((r: any) => ({
    factor_name: r.factor_name,
    real_conf: Number(r.real_conf),
    alt_conf: Number(r.alt_conf),
    outcome: r.outcome,
    calibration_version: r.calibration_version,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Existing aggregator logic (copied inline from drift-dashboard-aggregator.ts
// lines 1000-1138 for clean comparison)
// ────────────────────────────────────────────────────────────────────────────

interface AggregatorOutput {
  factorName: string;
  n: number;
  realLowWR: number;
  realMidWR: number;
  realHighWR: number;
  realSpreadPP: number;
  altSpreadPP: number;
  predictiveLiftPP: number;
  minBucketN: number;
  isDecisionGrade: boolean;
}

function aggregatorAnalyze(rows: Row[]): AggregatorOutput {
  const n = rows.length;
  const realTertiles = splitTertiles(rows, 'real_conf');
  const altTertiles = splitTertiles(rows, 'alt_conf');
  const realLow = bucketWR(realTertiles.low);
  const realMid = bucketWR(realTertiles.mid);
  const realHigh = bucketWR(realTertiles.high);
  const altLow = bucketWR(altTertiles.low);
  const altHigh = bucketWR(altTertiles.high);
  const realSpreadPP = realHigh.winRatePct - realLow.winRatePct;
  const altSpreadPP = altHigh.winRatePct - altLow.winRatePct;
  const minBucketN = Math.min(realLow.n, realMid.n, realHigh.n);
  return {
    factorName: rows[0]?.factor_name ?? '',
    n,
    realLowWR: realLow.winRatePct,
    realMidWR: realMid.winRatePct,
    realHighWR: realHigh.winRatePct,
    realSpreadPP,
    altSpreadPP,
    predictiveLiftPP: realSpreadPP - altSpreadPP,
    minBucketN,
    isDecisionGrade: minBucketN >= MIN_N_PER_BUCKET,
  };
}

function splitTertiles(rows: Row[], field: 'real_conf' | 'alt_conf'): { low: Row[]; mid: Row[]; high: Row[] } {
  if (rows.length === 0) return { low: [], mid: [], high: [] };
  const sorted = [...rows].sort((a, b) => a[field] - b[field]);
  const n = sorted.length;
  const lowEnd = Math.floor(n / 3);
  const midEnd = Math.floor((2 * n) / 3);
  return { low: sorted.slice(0, lowEnd), mid: sorted.slice(lowEnd, midEnd), high: sorted.slice(midEnd) };
}

function bucketWR(rows: Row[]): { n: number; winRatePct: number } {
  if (rows.length === 0) return { n: 0, winRatePct: 0 };
  const wins = rows.filter(r => r.outcome === 'admitted_won').length;
  return { n: rows.length, winRatePct: (wins / rows.length) * 100 };
}

// ────────────────────────────────────────────────────────────────────────────
// B-NEW-33 CLI logic (copied inline from scripts/b-new-33-factor-backtest.ts)
// ────────────────────────────────────────────────────────────────────────────

interface CliOutput extends AggregatorOutput {
  pValue: number | null;
  verdict: 'KEEP' | 'DROP' | 'INCONCLUSIVE';
  reason: string;
  meanAbsConfShift: number;
}

function cliAnalyze(rows: Row[]): CliOutput {
  const base = aggregatorAnalyze(rows);
  const n = rows.length;

  // CLI extras: chi-square p-value + verdict gate + degenerate-lever check
  const meanAbsConfShift = n > 0
    ? rows.reduce((s, r) => s + Math.abs(r.real_conf - r.alt_conf), 0) / n
    : 0;

  // Reproduce chi-square 2x2 from CLI
  const realTertiles = splitTertiles(rows, 'real_conf');
  const lowWonLost = bucketWonLost(realTertiles.low);
  const highWonLost = bucketWonLost(realTertiles.high);
  const pValue = chiSquare2x2(highWonLost.won, highWonLost.notWon, lowWonLost.won, lowWonLost.notWon);

  // Verdict gate
  let verdict: 'KEEP' | 'DROP' | 'INCONCLUSIVE';
  let reason: string;
  if (meanAbsConfShift < 0.01) {
    verdict = 'INCONCLUSIVE';
    reason = `dormant (mean abs conf shift ${meanAbsConfShift.toFixed(4)} < 0.01)`;
  } else if (base.minBucketN < MIN_N_PER_BUCKET) {
    verdict = 'INCONCLUSIVE';
    reason = `n=${base.minBucketN} < ${MIN_N_PER_BUCKET}`;
  } else if (Math.abs(base.realSpreadPP) < MIN_SPREAD_PP) {
    verdict = 'INCONCLUSIVE';
    reason = `spread ${base.realSpreadPP.toFixed(1)}pp < ${MIN_SPREAD_PP}pp`;
  } else if (pValue === null || pValue > MAX_P_VALUE) {
    verdict = 'INCONCLUSIVE';
    reason = `p=${pValue?.toFixed(4) ?? 'NaN'} > ${MAX_P_VALUE}`;
  } else if (base.predictiveLiftPP > 0) {
    verdict = 'KEEP';
    reason = `lift ${base.predictiveLiftPP.toFixed(1)}pp p=${pValue.toFixed(4)}`;
  } else {
    verdict = 'DROP';
    reason = `lift ${base.predictiveLiftPP.toFixed(1)}pp p=${pValue.toFixed(4)}`;
  }

  return { ...base, pValue, verdict, reason, meanAbsConfShift };
}

function bucketWonLost(rows: Row[]): { won: number; notWon: number } {
  const won = rows.filter(r => r.outcome === 'admitted_won').length;
  return { won, notWon: rows.length - won };
}

function chiSquare2x2(a: number, b: number, c: number, d: number): number | null {
  const n = a + b + c + d;
  if (n < 30) return null;
  const rowSums = [a + b, c + d];
  const colSums = [a + c, b + d];
  const expected = [
    [(rowSums[0] * colSums[0]) / n, (rowSums[0] * colSums[1]) / n],
    [(rowSums[1] * colSums[0]) / n, (rowSums[1] * colSums[1]) / n],
  ];
  for (const row of expected) for (const e of row) if (e < 5) return null;
  const observed = [[a, b], [c, d]];
  let chi2 = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    chi2 += Math.pow(observed[i][j] - expected[i][j], 2) / expected[i][j];
  }
  return erfc(Math.sqrt(chi2 / 2));
}

function erfc(x: number): number {
  const t = 1.0 / (1.0 + 0.3275911 * Math.abs(x));
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? 1 - y : 1 + y;
}

// ────────────────────────────────────────────────────────────────────────────
// Main: load rows, run both analyses, compare side-by-side
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[B-NEW-33 PARITY] Loading pre-drain rows (replay_completed_at < 2026-05-15)...');

  const rowsRaw = await loadPreDrainRows(false);
  const rowsB76 = await loadPreDrainRows(true);
  console.log(`[B-NEW-33 PARITY] Raw (no B76 filter): ${rowsRaw.length}, B76-filtered: ${rowsB76.length}`);

  // Group by factor
  const groupBy = (rows: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      if (!m.has(r.factor_name)) m.set(r.factor_name, []);
      m.get(r.factor_name)!.push(r);
    }
    return m;
  };
  const groupedRaw = groupBy(rowsRaw);
  const groupedB76 = groupBy(rowsB76);
  const allFactors = Array.from(new Set([...groupedRaw.keys(), ...groupedB76.keys()])).sort();

  const lines: string[] = [];
  lines.push('# B-NEW-33 Parity Check — CLI Methodology vs Existing Aggregator');
  lines.push('');
  lines.push(`**Run timestamp:** ${new Date().toISOString()}`);
  lines.push(`**Pre-drain cohort:** rows with replay_completed_at < ${PRE_DRAIN_CUTOFF} (cron-replayed, pre-B-NEW-33-drain)`);
  lines.push(`**Total rows:** raw=${rowsRaw.length} / B76-filtered=${rowsB76.length}`);
  lines.push('');
  lines.push('## TOP TABLE — Confidence-shift distribution (the panel Kyle was watching pre-stall)');
  lines.push('');
  lines.push('Reproduces the existing aggregator\'s top table (`drift-dashboard-aggregator.ts:1106-1126`): avgConfidenceShift, avgAbsConfidenceShift, maxAbsConfidenceShift, shiftIsZeroFraction. These metrics describe HOW MUCH each lever moves the confidence number — independent of trade outcomes. **B76 frozen-factor filter applied** (matching the aggregator).');
  lines.push('');
  lines.push('| Factor | n | avg shift | avg abs shift | max abs shift | % at zero | shape |');
  lines.push('|---|---:|---:|---:|---:|---:|---|');
  for (const factor of allFactors) {
    const rows = groupedB76.get(factor) ?? [];
    if (rows.length === 0) {
      lines.push(`| ${factor} | 0 | — | — | — | — | (no rows after B76 filter) |`);
      continue;
    }
    const n = rows.length;
    const shifts = rows.map(r => r.real_conf - r.alt_conf);
    const absShifts = shifts.map(s => Math.abs(s));
    const avgShift = shifts.reduce((s, x) => s + x, 0) / n;
    const avgAbsShift = absShifts.reduce((s, x) => s + x, 0) / n;
    const maxAbsShift = Math.max(...absShifts);
    const pctAtZero = (absShifts.filter(s => s < 1e-9).length / n) * 100;
    const shape = avgAbsShift < 0.005
      ? 'dormant'
      : avgAbsShift < 0.02
        ? 'small movement'
        : avgAbsShift < 0.05
          ? 'meaningful movement'
          : 'large movement';
    lines.push(`| ${factor} | ${n} | ${avgShift.toFixed(4)} | ${avgAbsShift.toFixed(4)} | ${maxAbsShift.toFixed(4)} | ${pctAtZero.toFixed(1)}% | ${shape} |`);
  }
  lines.push('');
  lines.push('## BOTTOM TABLE — Tertile WR + predictive lift (B76 frozen-factor filter APPLIED)');
  lines.push('');
  lines.push('| Factor | n | Agg low/mid/high WR | Real spread | Alt spread | Lift | min n/bkt | Decision-grade? |');
  lines.push('|---|---:|---|---:|---:|---:|---:|---|');
  for (const factor of allFactors) {
    const rows = groupedB76.get(factor) ?? [];
    if (rows.length === 0) {
      lines.push(`| ${factor} | 0 | (no rows after B76 filter) | — | — | — | — | — |`);
      continue;
    }
    const r = aggregatorAnalyze(rows);
    const tertWR = `${r.realLowWR.toFixed(1)}% / ${r.realMidWR.toFixed(1)}% / ${r.realHighWR.toFixed(1)}%`;
    lines.push(`| ${factor} | ${r.n} | ${tertWR} | ${r.realSpreadPP.toFixed(1)}pp | ${r.altSpreadPP.toFixed(1)}pp | ${r.predictiveLiftPP.toFixed(1)}pp | ${r.minBucketN} | ${r.isDecisionGrade ? 'YES' : 'NO'} |`);
  }
  lines.push('');
  lines.push('## Per-factor comparison (B76 filter NOT applied — what the CLI currently does)');
  lines.push('');
  lines.push('| Factor | n | CLI low/mid/high WR | Real spread | Alt spread | Lift | p-value | Mean |Δconf| | Verdict |');
  lines.push('|---|---:|---|---:|---:|---:|---:|---:|---|');
  for (const factor of allFactors) {
    const rows = groupedRaw.get(factor) ?? [];
    if (rows.length === 0) {
      lines.push(`| ${factor} | 0 | — | — | — | — | — | — | — |`);
      continue;
    }
    const r = cliAnalyze(rows);
    const tertWR = `${r.realLowWR.toFixed(1)}% / ${r.realMidWR.toFixed(1)}% / ${r.realHighWR.toFixed(1)}%`;
    const pStr = r.pValue === null ? 'N/A' : r.pValue.toFixed(4);
    lines.push(`| ${factor} | ${r.n} | ${tertWR} | ${r.realSpreadPP.toFixed(1)}pp | ${r.altSpreadPP.toFixed(1)}pp | ${r.predictiveLiftPP.toFixed(1)}pp | ${pStr} | ${r.meanAbsConfShift.toFixed(4)} | **${r.verdict}** |`);
  }
  lines.push('');
  lines.push('## Pre-drain vs post-drain confidence-shift comparison');
  lines.push('');
  lines.push('Same top-table metrics computed on (a) pre-drain rows only (cron-replayed, what Kyle saw before the stall) vs (b) post-drain rows only (the 13,830 newly-matched + 19,219 unreplayable rows from B-NEW-33). Looks at whether the data character changed during the stall window.');
  lines.push('');
  const preDrainRowsB76 = await loadRows(true, 'pre-drain');
  const postDrainRowsB76 = await loadRows(true, 'post-drain');
  const groupedPre = (() => { const m = new Map<string, Row[]>(); for (const r of preDrainRowsB76) { if (!m.has(r.factor_name)) m.set(r.factor_name, []); m.get(r.factor_name)!.push(r); } return m; })();
  const groupedPost = (() => { const m = new Map<string, Row[]>(); for (const r of postDrainRowsB76) { if (!m.has(r.factor_name)) m.set(r.factor_name, []); m.get(r.factor_name)!.push(r); } return m; })();
  const allFactorsBoth = Array.from(new Set([...groupedPre.keys(), ...groupedPost.keys()])).sort();
  lines.push('| Factor | Pre n | Post n | Pre avg abs shift | Post avg abs shift | Pre max abs | Post max abs | Δ avg abs shift |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  function shiftMetrics(rows: Row[]): { n: number; avgAbsShift: number; maxAbsShift: number } {
    if (rows.length === 0) return { n: 0, avgAbsShift: 0, maxAbsShift: 0 };
    const abs = rows.map(r => Math.abs(r.real_conf - r.alt_conf));
    return { n: rows.length, avgAbsShift: abs.reduce((s, x) => s + x, 0) / rows.length, maxAbsShift: Math.max(...abs) };
  }
  for (const factor of allFactorsBoth) {
    const pre = shiftMetrics(groupedPre.get(factor) ?? []);
    const post = shiftMetrics(groupedPost.get(factor) ?? []);
    const delta = post.avgAbsShift - pre.avgAbsShift;
    lines.push(`| ${factor} | ${pre.n} | ${post.n} | ${pre.avgAbsShift.toFixed(4)} | ${post.avgAbsShift.toFixed(4)} | ${pre.maxAbsShift.toFixed(4)} | ${post.maxAbsShift.toFixed(4)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(4)} |`);
  }
  lines.push('');
  lines.push('**Interpretation guide:**');
  lines.push('- If Δ avg abs shift is near zero across the board → confidence-shift character is stable; the all-INCONCLUSIVE verdict is about TERTILE WR, not lever activity.');
  lines.push('- If Δ is large for some factors → factor producers may have changed behavior during the stall window. Worth investigating before re-running B-NEW-33.');
  lines.push('- If "post avg abs shift" is much smaller than "pre" for the levers Kyle remembered as active → the recent two weeks have a structurally different confidence signal.');
  lines.push('');
  lines.push('## Methodology delta analysis');
  lines.push('');
  lines.push('Two known differences between the existing aggregator and the B-NEW-33 CLI:');
  lines.push('');
  lines.push('1. **B76 frozen-factor filter.** The aggregator excludes pre-B76 rows for `b67_1_*` and `b67_2_phase_*` factors via `calibrationFrameworkVersion = "b76_chain_final"` predicate (drift-dashboard-aggregator.ts:1063-1069). The B-NEW-33 CLI does NOT apply this filter. Impact: for the 6 affected factor_names, the CLI may include pre-B76 structurally-biased rows that dilute spreads toward zero.');
  lines.push('');
  lines.push('2. **Unreplayable-row inclusion in WR denominator.** The aggregator includes ALL `replay_completed_at IS NOT NULL` rows (including `unreplayable_real_rejected`) and counts them as zero-win contributions in tertile WR. The B-NEW-33 CLI excludes unreplayable rows from analysis. Pre-drain: no unreplayable rows exist (cron left unmatched as pending) so this delta is invisible in THIS comparison. Post-drain: 19,219 unreplayable rows exist and would dilute the aggregator\'s WR figures.');
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push('Compare the two tables above:');
  lines.push('- If the per-factor spreads are IDENTICAL between the B76-filtered and unfiltered tables for the SIX b67_1_* / b67_2_phase_* factors: the B76 filter has no impact on pre-drain data (rows are already all b76_chain_final).');
  lines.push('- If they DIFFER: the CLI was including pre-B76 contamination, and re-running B-NEW-33 with the B76 filter applied would produce different verdicts.');
  lines.push('- For the OTHER 4 factors (b67_4, b68_1-5): the B76 filter does not apply; the two methods should produce identical real/alt spreads. Differences would indicate a deeper tertile-bucketing or sort-stability bug.');
  lines.push('');
  lines.push('## Recommendation');
  lines.push('');
  lines.push('- Re-run the B-NEW-33 verdict pipeline with the B76 filter applied (mirroring the existing aggregator).');
  lines.push('- Compare verdicts: if the all-INCONCLUSIVE outcome persists, the upstream-artifact hypothesis (B-NEW-36) stands.');
  lines.push('- If the post-fix verdicts show some KEEP/DROP factors that match what Kyle observed pre-stall, then B67.5 design proceeds with the corrected CLI output.');

  const report = lines.join('\n');
  console.log('\n' + report);
  const outPath = path.join(process.cwd(), 'Claude Comms and Packages', 'Batch Completion', 'B-NEW-33_PARITY_CHECK.md');
  writeFileSync(outPath, report, 'utf-8');
  console.log(`[B-NEW-33 PARITY] Report written to ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[B-NEW-33 PARITY] Error:', err); process.exit(1); });
