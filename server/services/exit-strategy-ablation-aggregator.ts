/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B73 — Exit-Strategy Ablation: Aggregator
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Reads exit_strategy_alternates and returns per-variant statistics for the
 * dashboard. Selection criterion (Sharpe-like, paired-diff vs Variant A
 * baseline) per BATCH_73_SCOPE.md §5 (pre-registered).
 *
 * Query params:
 *   window: 'rolling_24h' | 'rolling_7d' | 'rolling_30d' | 'cohort_latest'
 *   regime: optional regime filter (TFS, HVU, RBS, IE, ST or '*')
 *
 * No cron needed — virtual_pnl_pct is fully resolved at write time by
 * exit-strategy-replay-service.ts (B73 is post-trade, not pre-trade).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export type AblationWindow = 'rolling_24h' | 'rolling_7d' | 'rolling_30d' | 'cohort_latest';

export interface ExitStrategyVariantStats {
  variantId: string;
  variantName: string;
  n: number;
  meanPnlPct: number | null;
  stdPnlPct: number | null;
  meanDiffVsBaseline: number | null;
  stdDiffVsBaseline: number | null;
  sharpeScore: number | null;       // (mean_diff / std_diff) × sqrt(n)
  winRatePct: number | null;        // % of trades with virtual_pnl_pct > 0
  exitReasonBreakdown: Record<string, number>;
  meanDurationMin: number | null;
}

export interface ExitStrategyAblationResponse {
  window: AblationWindow;
  windowStart: string;
  windowEnd: string;
  regimeFilter: string | null;
  totalTrades: number;            // distinct trade_id count
  totalRows: number;              // total variant rows
  variants: ExitStrategyVariantStats[];
  minNTotal: number;              // from module_constants
  minNPerRegime: number;
  /** Whether headline winner can be declared (n >= minNTotal) */
  ready: boolean;
}

const WINDOW_INTERVALS: Record<AblationWindow, string> = {
  rolling_24h: '24 hours',
  rolling_7d: '7 days',
  rolling_30d: '30 days',
  cohort_latest: '24 hours', // alias — used same as 24h until cohort logic added
};

export async function computeExitStrategyAblation(
  window: AblationWindow,
  regimeFilter: string | null = null,
  assetClass: string | null = null, // B79.0i.b: optional asset_class filter for xstock_spot tab. When null, behavior byte-identical to pre-B79.0i.b (no WHERE filter on asset_class — all rows including legacy unscoped).
): Promise<ExitStrategyAblationResponse> {
  const interval = WINDOW_INTERVALS[window];
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - parseIntervalMs(interval));

  // Build WHERE clauses
  const regimeClause = regimeFilter && regimeFilter !== '*'
    ? sql`AND regime = ${regimeFilter}`
    : sql``;
  const assetClassClause = assetClass
    ? sql`AND asset_class = ${assetClass}`
    : sql``;

  // Per-variant aggregation
  const variantRows = await db.execute(sql`
    SELECT
      variant_id,
      variant_name,
      count(*)::int                                                   AS n,
      avg(virtual_pnl_pct)::float                                     AS mean_pnl_pct,
      stddev_samp(virtual_pnl_pct)::float                             AS std_pnl_pct,
      avg(virtual_pnl_pct - baseline_pnl_pct)::float                  AS mean_diff,
      stddev_samp(virtual_pnl_pct - baseline_pnl_pct)::float          AS std_diff,
      sum(case when virtual_pnl_pct > 0 then 1 else 0 end)::int       AS winning,
      avg(virtual_duration_min)::float                                AS mean_duration_min
    FROM exit_strategy_alternates
    WHERE created_at >= ${windowStart}
      AND virtual_pnl_pct IS NOT NULL
      ${regimeClause}
      ${assetClassClause}
    GROUP BY variant_id, variant_name
    ORDER BY variant_id
  `);

  // Per-variant exit-reason breakdown
  const reasonRows = await db.execute(sql`
    SELECT variant_id, virtual_exit_reason, count(*)::int AS n
    FROM exit_strategy_alternates
    WHERE created_at >= ${windowStart}
      ${regimeClause}
      ${assetClassClause}
    GROUP BY variant_id, virtual_exit_reason
  `);

  const reasonByVariant: Record<string, Record<string, number>> = {};
  for (const r of reasonRows.rows as any[]) {
    const v = r.variant_id;
    if (!reasonByVariant[v]) reasonByVariant[v] = {};
    reasonByVariant[v][r.virtual_exit_reason] = r.n;
  }

  // Distinct trade count
  const tradeCountRow = await db.execute(sql`
    SELECT count(DISTINCT trade_id)::int AS n
    FROM exit_strategy_alternates
    WHERE created_at >= ${windowStart}
      ${regimeClause}
      ${assetClassClause}
  `);
  const totalTrades = (tradeCountRow.rows[0] as any)?.n ?? 0;

  // Read minN thresholds from module_constants (best-effort)
  let minNTotal = 200;
  let minNPerRegime = 50;
  try {
    const { getModuleConstants } = await import('./module-constants-service');
    const constants = await getModuleConstants('exit_strategy_replay', {
      exchange: '*', assetClass: '*', strategy: '*', regime: '*',
    });
    if (typeof constants.b73_min_n_total === 'number') minNTotal = constants.b73_min_n_total;
    if (typeof constants.b73_min_n_per_regime === 'number') minNPerRegime = constants.b73_min_n_per_regime;
  } catch {
    // fallback to defaults
  }

  const variants: ExitStrategyVariantStats[] = (variantRows.rows as any[]).map(r => {
    const sharpe = (r.mean_diff != null && r.std_diff && r.std_diff > 0 && r.n > 0)
      ? (r.mean_diff / r.std_diff) * Math.sqrt(r.n)
      : null;
    return {
      variantId: r.variant_id,
      variantName: r.variant_name,
      n: r.n,
      meanPnlPct: r.mean_pnl_pct ?? null,
      stdPnlPct: r.std_pnl_pct ?? null,
      meanDiffVsBaseline: r.mean_diff ?? null,
      stdDiffVsBaseline: r.std_diff ?? null,
      sharpeScore: sharpe,
      winRatePct: r.n > 0 ? (r.winning / r.n) * 100 : null,
      exitReasonBreakdown: reasonByVariant[r.variant_id] ?? {},
      meanDurationMin: r.mean_duration_min ?? null,
    };
  });

  // Total rows
  const totalRows = variants.reduce((s, v) => s + v.n, 0);

  return {
    window,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    regimeFilter: regimeFilter ?? null,
    totalTrades,
    totalRows,
    variants,
    minNTotal,
    minNPerRegime,
    ready: regimeFilter && regimeFilter !== '*' ? totalTrades >= minNPerRegime : totalTrades >= minNTotal,
  };
}

function parseIntervalMs(interval: string): number {
  if (interval === '24 hours') return 86_400_000;
  if (interval === '7 days') return 7 * 86_400_000;
  if (interval === '30 days') return 30 * 86_400_000;
  return 86_400_000;
}
