/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-NEW-33 — One-shot factor-calibration backtest tool
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Invokable via `npm run b-new-33:factor-backtest`. Three-phase pipeline:
 *
 *   PHASE 1: drain — process ALL pending crypto_spot ablation rows (no 5000
 *            limit). For each row, try DB canonical source then JSONL fallback;
 *            mark matched rows with full replay_outcome; mark unmatched rows
 *            with `unreplayable_real_rejected` so the nightly cron skips them.
 *
 *   PHASE 2: analyze — read all replay-completed rows per factor (10 factors).
 *            Tertile-split on `real_decision.confidence`. Compute WR per tertile,
 *            real_spread (high WR - low WR), counterfactual alt_spread using
 *            `alternate_decision.confidence`, predictive_lift = real - alt.
 *            Chi-square 2x2 test (high vs low) for p-value.
 *
 *   PHASE 3: report — per-lever verdict (KEEP / DROP / INCONCLUSIVE) gated on
 *            n≥150/bucket + spread≥7pp + p<0.05. Plain Markdown to stdout +
 *            file at `Claude Comms and Packages/Batch Completion/B-NEW-33_VERDICTS.md`.
 *
 * Flags:
 *   --dry-run             — analyze only, no DB writes
 *   --dry-run-synthetic   — generate 1000 synthetic rows with random
 *                            alt-confidence noise (negative-control test);
 *                            should produce INCONCLUSIVE for all factors
 *   --chunk-size <N>      — batch size for UPDATE statements (default 1000)
 *   --asset-class <NAME>  — default 'crypto_spot'
 *
 * Reference: B-NEW-33 scope + pre-audit (Langston APPROVE 2026-05-15).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';
import {
  buildVtsTradeIndex,
  loadClosedVtsTradesFromDb,
  findMatchingTrade,
  findNearestForDiagnostic,
  computeReplayOutcomeFromTrade,
  buildUnmatchedReplayOutcome,
} from '../server/services/factor-replay-core.js';

// ────────────────────────────────────────────────────────────────────────────
// CLI args
// ────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const dryRunSynthetic = argv.includes('--dry-run-synthetic');
const chunkSizeIdx = argv.indexOf('--chunk-size');
const chunkSize = chunkSizeIdx >= 0 ? Number(argv[chunkSizeIdx + 1]) || 1000 : 1000;
const assetClassIdx = argv.indexOf('--asset-class');
const assetClass = assetClassIdx >= 0 ? argv[assetClassIdx + 1] : 'crypto_spot';

// ────────────────────────────────────────────────────────────────────────────
// Constants (per Langston Q2 + Q3 approval)
// ────────────────────────────────────────────────────────────────────────────
const MIN_N_PER_BUCKET = 150;
const MIN_SPREAD_PP = 7;
const MAX_P_VALUE = 0.05;

// ────────────────────────────────────────────────────────────────────────────
// Phase 1 — drain pending rows
// ────────────────────────────────────────────────────────────────────────────
async function drainPendingRows(): Promise<{ matched: number; unmatched: number; total: number }> {
  console.log(`\n[B-NEW-33] Phase 1: drain pending ablation rows (asset_class=${assetClass})`);

  // Load all pending VTS-trade rows. NO 5000 limit (the structural cron bug).
  const pendingResult: any = await db.execute(sql`
    SELECT id, pair_symbol, strategy, evaluated_at, vts_trade_id
    FROM regime_factor_alternates
    WHERE source_type = 'vts_trade'
      AND replay_completed_at IS NULL
      AND asset_class = ${assetClass}
    ORDER BY evaluated_at ASC
  `);
  const pendingRows: any[] = (pendingResult as any).rows ?? pendingResult;
  console.log(`[B-NEW-33] Pending rows: ${pendingRows.length}`);

  if (pendingRows.length === 0) {
    return { matched: 0, unmatched: 0, total: 0 };
  }

  // Build the dual-source index. DB primary, JSONL fallback.
  console.log(`[B-NEW-33] Building DB index (vts_open_trades WHERE closed=true since 2026-05-11)...`);
  const dbIndex = await loadClosedVtsTradesFromDb();
  const dbCount = Array.from(dbIndex.values()).reduce((s, l) => s + l.length, 0);
  console.log(`[B-NEW-33]   DB index: ${dbCount} closed trades, ${dbIndex.size} (symbol|strategy) buckets`);

  console.log(`[B-NEW-33] Building JSONL index (last 30 days)...`);
  const jsonlIndex = await buildVtsTradeIndex(30);
  const jsonlCount = Array.from(jsonlIndex.values()).reduce((s, l) => s + l.length, 0);
  console.log(`[B-NEW-33]   JSONL index: ${jsonlCount} closed trades, ${jsonlIndex.size} (symbol|strategy) buckets`);

  let matched = 0;
  let unmatched = 0;
  const matchedUpdates: Array<{ id: number; outcome: Record<string, any> }> = [];
  const unmatchedUpdates: Array<{ id: number; outcome: Record<string, any> }> = [];

  for (const row of pendingRows) {
    const evaluatedAtMs = new Date(row.evaluated_at).getTime();
    const entry = findMatchingTrade(
      dbIndex,
      jsonlIndex,
      row.pair_symbol,
      row.strategy,
      evaluatedAtMs,
    );

    if (entry) {
      const outcome = computeReplayOutcomeFromTrade(entry.trade, row.vts_trade_id, entry.source);
      matchedUpdates.push({ id: row.id, outcome });
      matched++;
    } else {
      // Diagnostic: is there a near-miss outside tolerance? If so we know the
      // signal-to-trade relationship exists but timing is off. If no near-miss
      // exists at all, the signal likely was rejected pre-trade-open.
      const nearest = findNearestForDiagnostic(
        dbIndex,
        jsonlIndex,
        row.pair_symbol,
        row.strategy,
        evaluatedAtMs,
      );
      const outcome = buildUnmatchedReplayOutcome({
        reason: nearest
          ? `no trade within ±5min; nearest in ${nearest.source} was ${nearest.delta}ms away`
          : 'no closed trade for (symbol, strategy) — likely rejected pre-trade-open',
        sourcesTried: ['db', 'jsonl'],
        nearMissMs: nearest?.delta,
      });
      unmatchedUpdates.push({ id: row.id, outcome });
      unmatched++;
    }
  }

  console.log(`[B-NEW-33] Match results: matched=${matched} unmatched=${unmatched}`);

  if (dryRun) {
    console.log(`[B-NEW-33] --dry-run: skipping DB writes`);
    return { matched, unmatched, total: pendingRows.length };
  }

  // Chunked UPDATE pass. Per Langston SIM blast-radius note: 1000-row chunks
  // bound transaction time to <30s.
  console.log(`[B-NEW-33] Writing ${matched + unmatched} updates in chunks of ${chunkSize}...`);
  const allUpdates = [...matchedUpdates, ...unmatchedUpdates];
  for (let i = 0; i < allUpdates.length; i += chunkSize) {
    const chunk = allUpdates.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((u) =>
        db.execute(sql`
          UPDATE regime_factor_alternates
          SET replay_outcome = ${JSON.stringify(u.outcome)}::jsonb,
              replay_completed_at = NOW()
          WHERE id = ${u.id}
        `),
      ),
    );
    if ((i / chunkSize) % 5 === 0) {
      console.log(`[B-NEW-33]   chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(allUpdates.length / chunkSize)} done`);
    }
  }

  return { matched, unmatched, total: pendingRows.length };
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2 — analyze per factor
// ────────────────────────────────────────────────────────────────────────────

interface FactorAnalysis {
  factorName: string;
  nReplayed: number;
  tertileNs: [number, number, number];
  tertileWRs: [number, number, number];
  realSpread: number;
  altTertileWRs: [number, number, number];
  altSpread: number;
  predictiveLift: number;
  pValue: number | null;
  meanAbsConfidenceShift: number;
  verdict: 'KEEP' | 'DROP' | 'INCONCLUSIVE';
  verdictReason: string;
}

async function analyzeFactors(): Promise<FactorAnalysis[]> {
  console.log(`\n[B-NEW-33] Phase 2: analyze per-factor verdicts`);

  // Get list of factors actually emitted
  const factorRows: any = await db.execute(sql`
    SELECT factor_name, COUNT(*) AS n
    FROM regime_factor_alternates
    WHERE asset_class = ${assetClass}
      AND replay_outcome IS NOT NULL
      AND replay_outcome->>'outcome' IN ('admitted_won', 'admitted_lost', 'admitted_breakeven')
    GROUP BY factor_name
    ORDER BY factor_name
  `);
  const factors: any[] = (factorRows as any).rows ?? factorRows;

  const analyses: FactorAnalysis[] = [];

  for (const f of factors) {
    const factorName = f.factor_name;
    console.log(`[B-NEW-33]   analyzing ${factorName} (n=${f.n})...`);

    // Load all replay-completed rows for this factor
    const rowsResult: any = await db.execute(sql`
      SELECT
        (real_decision->>'confidence')::float AS real_conf,
        (alternate_decision->>'confidence')::float AS alt_conf,
        replay_outcome->>'outcome' AS outcome
      FROM regime_factor_alternates
      WHERE factor_name = ${factorName}
        AND asset_class = ${assetClass}
        AND replay_outcome IS NOT NULL
        AND replay_outcome->>'outcome' IN ('admitted_won', 'admitted_lost', 'admitted_breakeven')
    `);
    const rows: any[] = (rowsResult as any).rows ?? rowsResult;
    const analysis = analyzeFactorRows(factorName, rows);
    analyses.push(analysis);
  }

  return analyses;
}

function analyzeFactorRows(factorName: string, rows: any[]): FactorAnalysis {
  const n = rows.length;
  if (n === 0) {
    return {
      factorName,
      nReplayed: 0,
      tertileNs: [0, 0, 0],
      tertileWRs: [0, 0, 0],
      realSpread: 0,
      altTertileWRs: [0, 0, 0],
      altSpread: 0,
      predictiveLift: 0,
      pValue: null,
      meanAbsConfidenceShift: 0,
      verdict: 'INCONCLUSIVE',
      verdictReason: 'no replayed rows',
    };
  }

  // Mean absolute confidence shift — flags degenerate-lever case
  const meanAbsConfidenceShift =
    rows.reduce((sum, r) => sum + Math.abs((r.real_conf ?? 0) - (r.alt_conf ?? 0)), 0) / n;

  // Tertile-split on real_conf
  const realTertiles = computeTertileWRs(rows, (r) => r.real_conf);
  // Tertile-split on alt_conf
  const altTertiles = computeTertileWRs(rows, (r) => r.alt_conf);

  const realSpread = (realTertiles.wrs[2] - realTertiles.wrs[0]) * 100; // percentage points
  const altSpread = (altTertiles.wrs[2] - altTertiles.wrs[0]) * 100;
  const predictiveLift = realSpread - altSpread;

  // Chi-square 2x2 (high tertile vs low tertile, won vs lost+breakeven)
  const pValue = chiSquare2x2(
    realTertiles.wons[2], realTertiles.totalLessWon[2],
    realTertiles.wons[0], realTertiles.totalLessWon[0],
  );

  const minBucketN = Math.min(...realTertiles.ns);

  let verdict: 'KEEP' | 'DROP' | 'INCONCLUSIVE';
  let verdictReason: string;
  if (meanAbsConfidenceShift < 0.01) {
    verdict = 'INCONCLUSIVE';
    verdictReason = `lever effectively dormant (mean abs confidence shift ${meanAbsConfidenceShift.toFixed(4)} < 0.01)`;
  } else if (minBucketN < MIN_N_PER_BUCKET) {
    verdict = 'INCONCLUSIVE';
    verdictReason = `min bucket n=${minBucketN} < ${MIN_N_PER_BUCKET} (insufficient power)`;
  } else if (Math.abs(realSpread) < MIN_SPREAD_PP) {
    verdict = 'INCONCLUSIVE';
    verdictReason = `real spread ${realSpread.toFixed(1)}pp < ${MIN_SPREAD_PP}pp (no monotonic signal)`;
  } else if (pValue === null || pValue > MAX_P_VALUE) {
    verdict = 'INCONCLUSIVE';
    verdictReason = `p-value ${pValue?.toFixed(4) ?? 'NaN'} > ${MAX_P_VALUE}`;
  } else if (predictiveLift > 0) {
    verdict = 'KEEP';
    verdictReason = `decision-grade ADD (lift ${predictiveLift.toFixed(1)}pp, p=${pValue.toFixed(4)})`;
  } else {
    verdict = 'DROP';
    verdictReason = `decision-grade REMOVE (lift ${predictiveLift.toFixed(1)}pp ≤ 0; lever harms signal, p=${pValue.toFixed(4)})`;
  }

  return {
    factorName,
    nReplayed: n,
    tertileNs: realTertiles.ns as [number, number, number],
    tertileWRs: realTertiles.wrs as [number, number, number],
    realSpread,
    altTertileWRs: altTertiles.wrs as [number, number, number],
    altSpread,
    predictiveLift,
    pValue,
    meanAbsConfidenceShift,
    verdict,
    verdictReason,
  };
}

function computeTertileWRs(
  rows: any[],
  getConf: (r: any) => number,
): { ns: number[]; wrs: number[]; wons: number[]; totalLessWon: number[] } {
  const sorted = [...rows].sort((a, b) => getConf(a) - getConf(b));
  const n = sorted.length;
  const lowEnd = Math.floor(n / 3);
  const midEnd = Math.floor((2 * n) / 3);
  const buckets = [
    sorted.slice(0, lowEnd),
    sorted.slice(lowEnd, midEnd),
    sorted.slice(midEnd),
  ];
  const ns = buckets.map((b) => b.length);
  const wons = buckets.map((b) => b.filter((r) => r.outcome === 'admitted_won').length);
  const wrs = buckets.map((b, i) => (b.length > 0 ? wons[i] / b.length : 0));
  const totalLessWon = buckets.map((b, i) => b.length - wons[i]);
  return { ns, wrs, wons, totalLessWon };
}

/**
 * Chi-square 2x2 contingency test for (high tertile WR vs low tertile WR).
 * Returns p-value, or null if expected counts are too low (< 5 per cell).
 * df=1, two-tailed.
 */
function chiSquare2x2(a: number, b: number, c: number, d: number): number | null {
  // a = won_high, b = lost_high, c = won_low, d = lost_low
  const n = a + b + c + d;
  if (n < 30) return null;
  const rowSums = [a + b, c + d];
  const colSums = [a + c, b + d];
  const expected = [
    [(rowSums[0] * colSums[0]) / n, (rowSums[0] * colSums[1]) / n],
    [(rowSums[1] * colSums[0]) / n, (rowSums[1] * colSums[1]) / n],
  ];
  // All expected counts must be ≥5 for chi-square validity
  for (const row of expected) {
    for (const e of row) {
      if (e < 5) return null;
    }
  }
  const observed = [[a, b], [c, d]];
  let chi2 = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const e = expected[i][j];
      chi2 += Math.pow(observed[i][j] - e, 2) / e;
    }
  }
  // df=1 p-value via incomplete gamma function (regularized upper tail)
  // p = 1 - chi2cdf(chi2, 1) = erfc(sqrt(chi2/2))
  return erfc(Math.sqrt(chi2 / 2));
}

function erfc(x: number): number {
  // Numerical approximation of complementary error function.
  // From Abramowitz & Stegun 7.1.26 — max abs error 1.5e-7.
  const t = 1.0 / (1.0 + 0.3275911 * Math.abs(x));
  const y =
    1.0 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? 1 - y : 1 + y;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 3 — Markdown verdict report
// ────────────────────────────────────────────────────────────────────────────

function renderReport(
  analyses: FactorAnalysis[],
  drainStats: { matched: number; unmatched: number; total: number },
): string {
  const lines: string[] = [];
  lines.push(`# B-NEW-33 — Crypto Factor Calibration Verdicts`);
  lines.push('');
  lines.push(`**Asset class:** ${assetClass}`);
  lines.push(`**Run timestamp:** ${new Date().toISOString()}`);
  lines.push(`**Decision-grade gates:** n ≥ ${MIN_N_PER_BUCKET} per tertile bucket AND |spread| ≥ ${MIN_SPREAD_PP}pp AND p < ${MAX_P_VALUE}`);
  lines.push('');
  lines.push('## Drain stats (Phase 1)');
  lines.push(`- Pending rows processed: **${drainStats.total}**`);
  lines.push(`- Matched (replay outcome computed): **${drainStats.matched}**`);
  lines.push(`- Unmatched (marked unreplayable_real_rejected): **${drainStats.unmatched}**`);
  lines.push('');
  lines.push('## Per-factor verdicts');
  lines.push('');
  lines.push('| Factor | n | Real WR tertiles (low/mid/high) | Real spread | Alt spread | Lift | p-value | Mean |Δconf| | Verdict | Reason |');
  lines.push('|---|---:|---|---:|---:|---:|---:|---:|---|---|');
  for (const a of analyses) {
    const tertWR = a.tertileWRs.map((w) => (w * 100).toFixed(1) + '%').join(' / ');
    const pStr = a.pValue === null ? 'N/A' : a.pValue.toFixed(4);
    lines.push(
      `| ${a.factorName} | ${a.nReplayed} | ${tertWR} | ${a.realSpread.toFixed(1)}pp | ${a.altSpread.toFixed(1)}pp | ${a.predictiveLift.toFixed(1)}pp | ${pStr} | ${a.meanAbsConfidenceShift.toFixed(4)} | **${a.verdict}** | ${a.verdictReason} |`,
    );
  }
  lines.push('');
  lines.push('## Verdict summary');
  const keep = analyses.filter((a) => a.verdict === 'KEEP');
  const drop = analyses.filter((a) => a.verdict === 'DROP');
  const incl = analyses.filter((a) => a.verdict === 'INCONCLUSIVE');
  lines.push(`- **KEEP** (decision-grade ADD): ${keep.length} — ${keep.map((a) => a.factorName).join(', ') || '(none)'}`);
  lines.push(`- **DROP** (decision-grade REMOVE): ${drop.length} — ${drop.map((a) => a.factorName).join(', ') || '(none)'}`);
  lines.push(`- **INCONCLUSIVE**: ${incl.length} — ${incl.map((a) => a.factorName).join(', ') || '(none)'}`);
  lines.push('');
  lines.push('## Next step');
  lines.push('B67.5 consumer-gate design reads this report. KEEP factors get wired into the 7 consumer sites with chain-final confidence; DROP factors are removed from the modulation chain; INCONCLUSIVE factors stay shadow-only until more cohort data is available.');
  lines.push('');
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Synthetic dry-run (negative-control test)
// ────────────────────────────────────────────────────────────────────────────

function runSyntheticNegativeControl(): FactorAnalysis[] {
  console.log(`\n[B-NEW-33] --dry-run-synthetic: generating 1000 synthetic rows per factor`);
  const synthFactors = ['synthetic_factor_1', 'synthetic_factor_2', 'synthetic_factor_3'];
  const analyses: FactorAnalysis[] = [];
  for (const factorName of synthFactors) {
    const rows: any[] = [];
    for (let i = 0; i < 1000; i++) {
      const realConf = Math.random();
      // alt_conf = real_conf + noise — degenerate case, no predictive signal
      const altConf = Math.max(0, Math.min(1, realConf + (Math.random() - 0.5) * 0.02));
      // outcome distribution: 30% won, 50% lost, 20% breakeven — RANDOM, no
      // relationship to confidence
      const r = Math.random();
      const outcome = r < 0.3 ? 'admitted_won' : r < 0.8 ? 'admitted_lost' : 'admitted_breakeven';
      rows.push({ real_conf: realConf, alt_conf: altConf, outcome });
    }
    analyses.push(analyzeFactorRows(factorName, rows));
  }
  return analyses;
}

// ────────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[B-NEW-33] One-shot factor-calibration backtest tool');
  console.log(`[B-NEW-33] Mode: ${dryRunSynthetic ? 'SYNTHETIC NEGATIVE-CONTROL' : dryRun ? 'DRY-RUN (no writes)' : 'LIVE (writes to DB)'}`);

  let analyses: FactorAnalysis[];
  let drainStats = { matched: 0, unmatched: 0, total: 0 };

  if (dryRunSynthetic) {
    analyses = runSyntheticNegativeControl();
  } else {
    drainStats = await drainPendingRows();
    analyses = await analyzeFactors();
  }

  const report = renderReport(analyses, drainStats);
  console.log('\n' + report);

  const outPath = path.join(
    process.cwd(),
    'Claude Comms and Packages',
    'Batch Completion',
    'B-NEW-33_VERDICTS.md',
  );
  if (!dryRunSynthetic) {
    writeFileSync(outPath, report, 'utf-8');
    console.log(`[B-NEW-33] Report written to ${outPath}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[B-NEW-33] Fatal error:', err);
    process.exit(1);
  });
