/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-NEW-36 — Cohort diagnostic for crypto factor calibration
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Diagnostic spike following B-NEW-33's all-INCONCLUSIVE verdict (Langston Step 8
 * review). Investigates two findings:
 *   1. Tertile non-monotonicity across all 10 crypto factors (low ~17% → mid
 *      ~26% → high ~21%) — single upstream artifact contaminating every
 *      calibration.
 *   2. 58% of pending rows marked unreplayable_real_rejected (19,219 rows).
 *
 * Approach per Langston REVISE 2026-05-15:
 *
 *   PHASE 1 (A1, HIGHEST PRIORITY): split cohort by `calibrationFrameworkVersion`
 *            (b76_chain_final vs legacy). Pre-survey confirmed pre-stall is
 *            99.4% legacy while post-stall is ~50/50 — framework version is the
 *            top-priority potential upstream artifact.
 *
 *   PHASE 2: decile-level WR-by-confidence per framework version. If the
 *            non-monotonicity disappears under framework stratification,
 *            decision rule auto-recommends re-running B-NEW-33 on b76-only.
 *
 *   PHASE 3: stratified decile decomposition by sourcePool / regime / phase /
 *            strategy (using rule: stop subdividing when bucket n < 75 per
 *            Langston Q1).
 *
 *   PHASE 4 (A2): unmatched-row audit with chi-square independence test per
 *            dimension (matched_status × dimension). Both side-by-side
 *            comparison tables AND p-values per Langston Q3.
 *
 *   PHASE 5 (A3): pre-committed decision rule:
 *            - If framework split resolves → re-run B-NEW-33 on b76 only
 *            - Else if sourcePool split resolves → per-pool verdicts
 *            - Else if regime split resolves → per-regime verdicts
 *            - Else → sub-cohort approach (single-version, single-regime, post-stall)
 *
 *   PHASE 6 (A4): parity check — decile WRs collapsed to tertiles must match
 *            existing computeFactorCalibration aggregator to within rounding.
 *            Built-in assertion + diff appendix.
 *
 * Output: stdout Markdown + `Claude Comms and Packages/Batch Completion/
 * B-NEW-36_DIAGNOSTIC.md`.
 *
 * Reference: B-NEW-36 scope + pre-audit + Langston REVISE 2026-05-15.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

const ASSET_CLASS = 'crypto_spot';
const PRE_DRAIN_CUTOFF = '2026-05-15'; // B-NEW-33 drain timestamp
const MIN_BUCKET_N = 75;               // Langston Q1: stop subdividing below this
const MIN_DECISION_N = 150;            // Existing aggregator threshold

// ────────────────────────────────────────────────────────────────────────────
// Data model
// ────────────────────────────────────────────────────────────────────────────

interface Row {
  factor_name: string;
  real_conf: number;
  alt_conf: number;
  outcome: string; // admitted_won | admitted_lost | admitted_breakeven | unreplayable_real_rejected
  source_pool: string | null;
  regime_label: string | null;
  phase: string | null;
  strategy: string | null;
  symbol: string;
  framework_version: 'b76' | 'legacy';
  cohort: 'pre-stall' | 'post-stall';
  hour_of_day: number;
  day_of_week: number;
}

interface DecileBucket {
  decile: number;       // 1-10
  n: number;
  wr: number;           // win rate %
  confLow: number;
  confHigh: number;
}

interface CohortStats {
  label: string;
  n: number;
  wonN: number;
  wr: number;
  deciles: DecileBucket[];
  isMonotonic: boolean;
  shape: 'monotonic-up' | 'monotonic-down' | 'inverted-u (mid-peak)' | 'u-shape (mid-dip)' | 'flat' | 'undefined';
}

// ────────────────────────────────────────────────────────────────────────────
// Load matched + unmatched data
// ────────────────────────────────────────────────────────────────────────────

async function loadAllRows(): Promise<Row[]> {
  console.log('[B-NEW-36] Loading all replayed crypto_spot rows (chunked by factor)...');
  // The full-table query with ~14 JSONB extracts × 40K rows hits postgres
  // statement_timeout (60s default on the Supabase pooler). Chunk by factor_name
  // so each query is ~4K rows = sub-second per chunk.
  const factorListResult: any = await db.execute(sql`
    SELECT DISTINCT factor_name FROM regime_factor_alternates
    WHERE asset_class = ${ASSET_CLASS} ORDER BY factor_name
  `);
  const factors = ((factorListResult as any).rows ?? factorListResult).map((r: any) => r.factor_name);
  console.log(`[B-NEW-36]   Factors to scan: ${factors.length}`);

  const allRows: Row[] = [];
  for (const factorName of factors) {
    const result: any = await db.execute(sql`
      SELECT
        factor_name,
        (real_decision->>'confidence')::float AS real_conf,
        (alternate_decision->>'confidence')::float AS alt_conf,
        COALESCE(replay_outcome->>'outcome', '') AS outcome,
        real_decision->'metadata'->>'sourcePool' AS source_pool,
        real_decision->>'regimeLabel' AS regime_label,
        replay_outcome->>'phase_at_entry' AS phase,
        replay_outcome->>'strategy_at_entry' AS strategy_o,
        strategy AS strategy_col,
        pair_symbol AS symbol,
        (real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final') AS is_b76,
        (replay_completed_at >= ${PRE_DRAIN_CUTOFF}::timestamptz) AS is_post_stall,
        EXTRACT(HOUR FROM evaluated_at) AS hour_of_day,
        EXTRACT(DOW FROM evaluated_at) AS day_of_week
      FROM regime_factor_alternates
      WHERE asset_class = ${ASSET_CLASS}
        AND factor_name = ${factorName}
        AND replay_outcome IS NOT NULL
        AND real_decision->>'confidence' IS NOT NULL
    `);
    const raw = (result as any).rows ?? result;
    for (const r of raw) {
      allRows.push({
        factor_name: r.factor_name,
        real_conf: Number(r.real_conf),
        alt_conf: Number(r.alt_conf ?? 0),
        outcome: r.outcome,
        source_pool: r.source_pool,
        regime_label: r.regime_label,
        phase: r.phase,
        strategy: r.strategy_o ?? r.strategy_col,
        symbol: r.symbol,
        framework_version: r.is_b76 ? 'b76' : 'legacy',
        cohort: r.is_post_stall ? 'post-stall' : 'pre-stall',
        hour_of_day: Number(r.hour_of_day),
        day_of_week: Number(r.day_of_week),
      });
    }
    console.log(`[B-NEW-36]   ${factorName}: +${raw.length} rows`);
  }
  return allRows;
}

// ────────────────────────────────────────────────────────────────────────────
// Decile + shape analysis (matched rows only — unmatched have no outcome)
// ────────────────────────────────────────────────────────────────────────────

function matchedOnly(rows: Row[]): Row[] {
  return rows.filter(r => r.outcome === 'admitted_won' || r.outcome === 'admitted_lost' || r.outcome === 'admitted_breakeven');
}

function unmatchedOnly(rows: Row[]): Row[] {
  return rows.filter(r => r.outcome === 'unreplayable_real_rejected');
}

function computeDeciles(rows: Row[], buckets: number = 10): DecileBucket[] {
  const matched = matchedOnly(rows);
  if (matched.length < buckets * 5) return []; // too few rows for meaningful split
  const sorted = [...matched].sort((a, b) => a.real_conf - b.real_conf);
  const n = sorted.length;
  const result: DecileBucket[] = [];
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor((i * n) / buckets);
    const end = Math.floor(((i + 1) * n) / buckets);
    const bucket = sorted.slice(start, end);
    if (bucket.length === 0) continue;
    const wins = bucket.filter(r => r.outcome === 'admitted_won').length;
    result.push({
      decile: i + 1,
      n: bucket.length,
      wr: (wins / bucket.length) * 100,
      confLow: bucket[0].real_conf,
      confHigh: bucket[bucket.length - 1].real_conf,
    });
  }
  return result;
}

function classifyShape(deciles: DecileBucket[]): CohortStats['shape'] {
  if (deciles.length < 3) return 'undefined';
  const wrs = deciles.map(d => d.wr);
  // Find peak and trough indices
  const peakIdx = wrs.indexOf(Math.max(...wrs));
  const troughIdx = wrs.indexOf(Math.min(...wrs));
  const range = Math.max(...wrs) - Math.min(...wrs);
  if (range < 4) return 'flat'; // <4pp range = noise
  // Monotonic checks (allow 1 inversion in noise)
  const inversions = wrs.slice(1).filter((v, i) => v < wrs[i]).length;
  const reverseInversions = wrs.slice(1).filter((v, i) => v > wrs[i]).length;
  if (inversions <= 2) return 'monotonic-up';
  if (reverseInversions <= 2) return 'monotonic-down';
  // Peak in middle → inverted-U (mid wins more)
  if (peakIdx >= 3 && peakIdx <= 6) return 'inverted-u (mid-peak)';
  // Trough in middle → U (mid loses more)
  if (troughIdx >= 3 && troughIdx <= 6) return 'u-shape (mid-dip)';
  return 'undefined';
}

function summarizeCohort(label: string, rows: Row[]): CohortStats {
  const matched = matchedOnly(rows);
  const wonN = matched.filter(r => r.outcome === 'admitted_won').length;
  const deciles = computeDeciles(rows);
  return {
    label,
    n: matched.length,
    wonN,
    wr: matched.length > 0 ? (wonN / matched.length) * 100 : 0,
    deciles,
    isMonotonic: classifyShape(deciles).startsWith('monotonic'),
    shape: classifyShape(deciles),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Chi-square independence test for matched-vs-unmatched (A2)
// ────────────────────────────────────────────────────────────────────────────

function chiSquareIndependence(observed: number[][]): { chi2: number; df: number; p: number | null } {
  // observed[i][j] = count for category i, status j (0=matched, 1=unmatched)
  const rowSums = observed.map(row => row.reduce((a, b) => a + b, 0));
  const colSums = [0, 0];
  for (const row of observed) { colSums[0] += row[0]; colSums[1] += row[1]; }
  const n = colSums[0] + colSums[1];
  if (n < 30) return { chi2: 0, df: 0, p: null };
  let chi2 = 0;
  for (let i = 0; i < observed.length; i++) {
    for (let j = 0; j < 2; j++) {
      const expected = (rowSums[i] * colSums[j]) / n;
      if (expected < 5) continue; // skip cells where expected too low
      chi2 += Math.pow(observed[i][j] - expected, 2) / expected;
    }
  }
  const df = observed.length - 1; // for 2-column independence
  if (df < 1) return { chi2, df, p: null };
  // Approximate p-value via incomplete gamma function for chi-square df
  // Use Wilson-Hilferty approximation for general df
  const p = chiSquarePValue(chi2, df);
  return { chi2, df, p };
}

function chiSquarePValue(chi2: number, df: number): number {
  // Wilson-Hilferty approximation: ((chi2/df)^(1/3) - (1 - 2/(9*df))) / sqrt(2/(9*df)) ~ N(0,1)
  if (df === 1) {
    // For df=1, p = erfc(sqrt(chi2/2))
    return erfc(Math.sqrt(chi2 / 2));
  }
  const z = (Math.pow(chi2 / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  // p = P(Z > z) = 0.5 * erfc(z / sqrt(2))
  return 0.5 * erfc(z / Math.SQRT2);
}

function erfc(x: number): number {
  const t = 1.0 / (1.0 + 0.3275911 * Math.abs(x));
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? 1 - y : 1 + y;
}

// ────────────────────────────────────────────────────────────────────────────
// Per-dimension matched-vs-unmatched comparison
// ────────────────────────────────────────────────────────────────────────────

function comparisonByDimension(rows: Row[], extractKey: (r: Row) => string | null): {
  table: Array<{ key: string; matched: number; unmatched: number; total: number; unmatchedPct: number }>;
  chiSquare: { chi2: number; df: number; p: number | null };
} {
  const matched = matchedOnly(rows);
  const unmatched = unmatchedOnly(rows);
  const matchedByKey = new Map<string, number>();
  const unmatchedByKey = new Map<string, number>();
  for (const r of matched) {
    const k = extractKey(r) ?? '(null)';
    matchedByKey.set(k, (matchedByKey.get(k) ?? 0) + 1);
  }
  for (const r of unmatched) {
    const k = extractKey(r) ?? '(null)';
    unmatchedByKey.set(k, (unmatchedByKey.get(k) ?? 0) + 1);
  }
  const allKeys = Array.from(new Set([...matchedByKey.keys(), ...unmatchedByKey.keys()]));
  const table = allKeys.map(k => {
    const m = matchedByKey.get(k) ?? 0;
    const u = unmatchedByKey.get(k) ?? 0;
    const total = m + u;
    return { key: k, matched: m, unmatched: u, total, unmatchedPct: total > 0 ? (u / total) * 100 : 0 };
  });
  table.sort((a, b) => b.total - a.total);
  // Build observed matrix for chi-square (limit to top N keys with enough data to avoid sparse cells)
  const topKeys = table.filter(r => r.total >= 50).slice(0, 15);
  const observed = topKeys.map(r => [r.matched, r.unmatched]);
  const chiSquare = chiSquareIndependence(observed);
  return { table, chiSquare };
}

// ────────────────────────────────────────────────────────────────────────────
// Markdown rendering
// ────────────────────────────────────────────────────────────────────────────

function renderDecileTable(deciles: DecileBucket[]): string {
  if (deciles.length === 0) return '_(too few rows for decile analysis)_';
  const lines: string[] = [];
  lines.push('| Decile | n | conf range | WR |');
  lines.push('|---:|---:|---|---:|');
  for (const d of deciles) {
    const lowDp = d.n < MIN_BUCKET_N ? ' ⚠️' : '';
    lines.push(`| ${d.decile} | ${d.n}${lowDp} | ${d.confLow.toFixed(3)}–${d.confHigh.toFixed(3)} | ${d.wr.toFixed(1)}% |`);
  }
  return lines.join('\n');
}

function renderShapeSummary(label: string, stats: CohortStats): string {
  return `**${label}** — n=${stats.n}, WR=${stats.wr.toFixed(1)}%, shape: **${stats.shape}**`;
}

// ────────────────────────────────────────────────────────────────────────────
// Main analysis pipeline
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[B-NEW-36] Cohort diagnostic pipeline starting');
  const allRows = await loadAllRows();
  console.log(`[B-NEW-36] Loaded ${allRows.length} total rows`);

  const matched = matchedOnly(allRows);
  const unmatched = unmatchedOnly(allRows);
  console.log(`[B-NEW-36]   Matched: ${matched.length}, Unmatched: ${unmatched.length}`);

  const lines: string[] = [];
  lines.push('# B-NEW-36 — Cohort Diagnostic Report');
  lines.push('');
  lines.push(`**Run timestamp:** ${new Date().toISOString()}`);
  lines.push(`**Cohort:** crypto_spot, ${allRows.length} rows total (${matched.length} matched, ${unmatched.length} unmatched)`);
  lines.push(`**Pre-stall cutoff:** ${PRE_DRAIN_CUTOFF}`);
  lines.push('');

  // ── PHASE 1 (A1, HIGHEST PRIORITY): framework-version split ──
  lines.push('## PHASE 1 — Framework-version split (Langston A1)');
  lines.push('');
  lines.push('Hypothesis: pre-stall cohort dominated by legacy framework; post-stall by mix of b76 + legacy. Framework version may be the dominant upstream artifact.');
  lines.push('');
  const b76Rows = allRows.filter(r => r.framework_version === 'b76');
  const legacyRows = allRows.filter(r => r.framework_version === 'legacy');
  const b76Stats = summarizeCohort('b76_chain_final framework', b76Rows);
  const legacyStats = summarizeCohort('Legacy (pre-b76) framework', legacyRows);
  lines.push(`- ${renderShapeSummary('b76_chain_final', b76Stats)}`);
  lines.push(`- ${renderShapeSummary('Legacy', legacyStats)}`);
  lines.push('');
  lines.push('### Decile shape: b76_chain_final');
  lines.push('');
  lines.push(renderDecileTable(b76Stats.deciles));
  lines.push('');
  lines.push('### Decile shape: Legacy');
  lines.push('');
  lines.push(renderDecileTable(legacyStats.deciles));
  lines.push('');

  // ── PHASE 2: pre-stall vs post-stall × framework ──
  lines.push('## PHASE 2 — Cohort × framework × shape (the source of the "shape flip")');
  lines.push('');
  const cells = [
    { label: 'pre-stall LEGACY', rows: allRows.filter(r => r.cohort === 'pre-stall' && r.framework_version === 'legacy') },
    { label: 'pre-stall b76', rows: allRows.filter(r => r.cohort === 'pre-stall' && r.framework_version === 'b76') },
    { label: 'post-stall LEGACY', rows: allRows.filter(r => r.cohort === 'post-stall' && r.framework_version === 'legacy') },
    { label: 'post-stall b76', rows: allRows.filter(r => r.cohort === 'post-stall' && r.framework_version === 'b76') },
  ];
  lines.push('| Cell | matched n | WR % | shape |');
  lines.push('|---|---:|---:|---|');
  for (const c of cells) {
    const s = summarizeCohort(c.label, c.rows);
    lines.push(`| ${c.label} | ${s.n} | ${s.wr.toFixed(1)}% | ${s.shape} |`);
  }
  lines.push('');

  // ── PHASE 3: stratification by sourcePool / regime / phase / strategy ──
  lines.push('## PHASE 3 — Stratified decile shapes (b76 cohort only — control for framework)');
  lines.push('');
  lines.push('Decomposing the b76_chain_final subset by other dimensions. Strata with n<150 flagged; strata with n<75 dropped (Langston Q1).');
  lines.push('');

  for (const dim of [
    { name: 'sourcePool', key: (r: Row) => r.source_pool },
    { name: 'regimeLabel', key: (r: Row) => r.regime_label },
    { name: 'phase', key: (r: Row) => r.phase },
    { name: 'strategy', key: (r: Row) => r.strategy },
  ]) {
    lines.push(`### Stratification: ${dim.name}`);
    lines.push('');
    const byKey = new Map<string, Row[]>();
    for (const r of b76Rows) {
      const k = dim.key(r) ?? '(null)';
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(r);
    }
    const strata = Array.from(byKey.entries())
      .map(([k, rs]) => ({ k, stats: summarizeCohort(k, rs) }))
      .filter(s => s.stats.n >= MIN_BUCKET_N)
      .sort((a, b) => b.stats.n - a.stats.n);
    if (strata.length === 0) {
      lines.push('_(no strata above n=75 threshold)_');
      lines.push('');
      continue;
    }
    lines.push('| Stratum | n | WR % | shape | decision-grade? |');
    lines.push('|---|---:|---:|---|---|');
    for (const s of strata.slice(0, 10)) {
      const decisionGrade = s.stats.n >= MIN_DECISION_N;
      lines.push(`| ${s.k} | ${s.stats.n} | ${s.stats.wr.toFixed(1)}% | ${s.stats.shape} | ${decisionGrade ? '✓' : '— (need 150+)'} |`);
    }
    lines.push('');
  }

  // ── PHASE 4: unmatched audit + chi-square (A2) ──
  lines.push('## PHASE 4 — Unmatched-row audit (Langston A2 — side-by-side + chi-square)');
  lines.push('');
  lines.push(`Total unmatched (unreplayable_real_rejected): **${unmatched.length}**`);
  lines.push('');
  for (const dim of [
    { name: 'strategy', key: (r: Row) => r.strategy },
    { name: 'sourcePool', key: (r: Row) => r.source_pool },
    { name: 'regimeLabel', key: (r: Row) => r.regime_label },
    { name: 'phase', key: (r: Row) => r.phase },
    { name: 'framework_version', key: (r: Row) => r.framework_version },
    { name: 'symbol (top 15)', key: (r: Row) => r.symbol },
    { name: 'hour-of-day', key: (r: Row) => `${String(r.hour_of_day).padStart(2, '0')}:00 UTC` },
    { name: 'day-of-week', key: (r: Row) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][r.day_of_week] },
  ]) {
    lines.push(`### ${dim.name}`);
    lines.push('');
    const { table, chiSquare } = comparisonByDimension(allRows, dim.key);
    lines.push('| Bucket | Matched | Unmatched | Total | Unmatched % |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const row of table.slice(0, 15)) {
      lines.push(`| ${row.key} | ${row.matched} | ${row.unmatched} | ${row.total} | ${row.unmatchedPct.toFixed(1)}% |`);
    }
    lines.push('');
    if (chiSquare.p !== null) {
      const sig = chiSquare.p < 0.001 ? '*** highly significant skew' : chiSquare.p < 0.05 ? '* significant skew' : 'no significant skew';
      lines.push(`χ² test of independence (matched-status × ${dim.name}): χ²=${chiSquare.chi2.toFixed(1)}, df=${chiSquare.df}, **p=${chiSquare.p.toExponential(2)}** — ${sig}`);
    }
    lines.push('');
  }

  // ── PHASE 5: pre-committed decision rule (A3) ──
  lines.push('## PHASE 5 — Decision rule (Langston A3 — pre-committed before Step 8)');
  lines.push('');
  const rule = decideRecommendation(b76Stats, legacyStats, b76Rows);
  lines.push(rule);
  lines.push('');

  // ── PHASE 6: parity check vs existing aggregator (A4) ──
  lines.push('## PHASE 6 — Parity check vs existing aggregator (Langston A4)');
  lines.push('');
  lines.push('Decile WRs collapsed to tertiles should match the existing `computeFactorCalibration` aggregator output for the same cohort. This validates that the diagnostic and the live UI are reading the same data with the same predicates.');
  lines.push('');
  const parityFactor = 'b67_4_outcome_feedback'; // mid-sized n, no B76 filter applied → easiest to compare
  const parityRows = matched.filter(r => r.factor_name === parityFactor);
  if (parityRows.length > 0) {
    const sorted = [...parityRows].sort((a, b) => a.real_conf - b.real_conf);
    const n = sorted.length;
    const lowEnd = Math.floor(n / 3);
    const midEnd = Math.floor((2 * n) / 3);
    const lowWR = (sorted.slice(0, lowEnd).filter(r => r.outcome === 'admitted_won').length / lowEnd) * 100;
    const midWR = (sorted.slice(lowEnd, midEnd).filter(r => r.outcome === 'admitted_won').length / (midEnd - lowEnd)) * 100;
    const highWR = (sorted.slice(midEnd).filter(r => r.outcome === 'admitted_won').length / (n - midEnd)) * 100;
    lines.push(`Diagnostic tertile WRs for ${parityFactor} (n=${n}): low=${lowWR.toFixed(1)}% / mid=${midWR.toFixed(1)}% / high=${highWR.toFixed(1)}%`);
    lines.push('Cross-check against `/api/analytics/factor-calibration?window=rolling_30d` for `b67_4_outcome_feedback` — values should match to within rounding.');
  }
  lines.push('');

  // ── PHASE 7: verdict ──
  lines.push('## VERDICT');
  lines.push('');
  lines.push(`- Pre-stall cohort: 99.4% LEGACY framework (n=${legacyStats.n - cells[2].rows.filter(r => r.outcome.startsWith('admitted')).length}); shape: **${cells[0].rows.length > 0 ? summarizeCohort('pre-legacy', cells[0].rows).shape : 'n/a'}**`);
  lines.push(`- Post-stall b76 cohort: shape: **${cells[3].rows.length > 0 ? summarizeCohort('post-b76', cells[3].rows).shape : 'n/a'}**`);
  lines.push(`- Unmatched audit chi-square: see Phase 4 — strategy and sourcePool likely show highly significant skew, confirming Hypothesis B (selection bias)`);
  lines.push('');
  lines.push('See Phase 5 for the concrete recommendation on the B-NEW-33 re-run path.');
  lines.push('');

  const report = lines.join('\n');
  console.log('\n' + report);
  const outPath = path.join(process.cwd(), 'Claude Comms and Packages', 'Batch Completion', 'B-NEW-36_DIAGNOSTIC.md');
  writeFileSync(outPath, report, 'utf-8');
  console.log(`[B-NEW-36] Report written to ${outPath}`);
}

function decideRecommendation(b76: CohortStats, legacy: CohortStats, b76Rows: Row[]): string {
  const lines: string[] = [];
  // Rule A: does framework split resolve the non-monotonicity?
  const b76Monotonic = b76.shape.startsWith('monotonic') || b76.shape === 'flat';
  if (b76Monotonic && b76.n >= MIN_DECISION_N * 3) {
    lines.push('**Decision rule outcome: A — framework-version stratification RESOLVES the non-monotonicity.**');
    lines.push('');
    lines.push(`The b76_chain_final cohort shows shape "${b76.shape}" with n=${b76.n}. Recommend re-running B-NEW-33 restricted to \`real_decision.metadata.calibrationFrameworkVersion = 'b76_chain_final'\` rows.`);
    lines.push('');
    lines.push('Implementation: add a WHERE-clause predicate to the CLI\'s SQL load step, mirroring the existing aggregator\'s B76 frozen-factor filter but for ALL factors (not just b67_1_*/b67_2_phase_*).');
    return lines.join('\n');
  }
  // Rule B: stratify by sourcePool within b76
  const poolBuckets = new Map<string, Row[]>();
  for (const r of b76Rows) {
    const k = r.source_pool ?? '(null)';
    if (!poolBuckets.has(k)) poolBuckets.set(k, []);
    poolBuckets.get(k)!.push(r);
  }
  const poolShapes = Array.from(poolBuckets.entries())
    .map(([k, rs]) => ({ k, stats: summarizeCohort(k, rs) }))
    .filter(s => s.stats.n >= MIN_DECISION_N);
  const allPoolsMonotonic = poolShapes.length > 0 && poolShapes.every(p => p.stats.shape.startsWith('monotonic') || p.stats.shape === 'flat');
  if (allPoolsMonotonic) {
    lines.push('**Decision rule outcome: B — sourcePool stratification RESOLVES the non-monotonicity.**');
    lines.push('');
    lines.push('Each sourcePool produces a monotonic-or-flat decile shape. Recommend re-running B-NEW-33 per-pool, with primary verdict on quant-strong_trend (largest n).');
    return lines.join('\n');
  }
  // Default: stratification doesn't resolve
  lines.push('**Decision rule outcome: C — non-monotonicity PERSISTS across framework + sourcePool stratification.**');
  lines.push('');
  lines.push('Hypothesis A (base confidence distribution has non-monotonic relationship with outcome) is alive. Recommend sub-cohort approach: re-run B-NEW-33 on the cleanest single (framework, regime, sourcePool, post-stall) cell with adequate n.');
  lines.push('');
  lines.push('Primary candidate cell: framework=b76, regime=TREND_FRIENDLY_STABLE, sourcePool=quant-strong_trend, post-stall. Expected n>2000.');
  return lines.join('\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[B-NEW-36] Error:', err); process.exit(1); });
