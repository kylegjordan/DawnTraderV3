/**
 * P19-B8.3 — pure dashboard-metric math for /api/active-engine/trades/analytics.
 *
 * Extracted from the route so every denominator guard is directly unit-testable
 * (Langston Step-4 conditions). All functions are pure over closed-trade-shaped
 * rows; the route owns data fetching, windowing, and the anchor-balance read.
 *
 * Honesty contract (the batch's thesis): a metric whose denominator doesn't
 * exist returns null — NEVER a fake 0, NEVER NaN/Infinity. The client renders
 * null as "—" (or an explained label like "∞ (no losses)").
 */

export interface ClosedTradeLike {
  pnl?: unknown;
  netPnl?: unknown;
  grossPnl?: unknown;
  totalFee?: unknown;
  fees?: unknown;
  chosenEntryMode?: string | null;
  entryPrice?: unknown;
  stopLoss?: unknown;
  quantity?: unknown;
  closedAt?: Date | string | null;
  assetClass?: string | null;
}

export const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Calendar earnings buckets (the legacy dashboard's Earnings card semantics —
 * calendar Today/Week/Month, NOT rolling). Computed over the ALL-TIME valid
 * set so the card is range-selector-independent: an empty selected window must
 * still show this week's/month's real closes (Langston Step-4 §1.7 — the
 * empty-window zero-shape defect this hoist fixes).
 */
/** P19-B8.11 (Kyle 2026-07-19): ROLLING earnings windows — last 24h / 7d / 30d
 *  from `now` — replacing the calendar buckets (since-midnight / since-Sunday /
 *  since-the-1st), whose boundary resets made the numbers read oddly. Matches the
 *  standing rolling-windows-over-snapshots rule (CLAUDE.md §5.13). Renamed per
 *  rule 18 (no alias left behind); field names are honest about the semantics. */
export function computeRollingEarnings(
  validTrades: ClosedTradeLike[],
  now: Date,
): { last24h: number; last7d: number; last30d: number } {
  const sumSince = (since: Date) => validTrades
    .filter(t => t.closedAt && new Date(t.closedAt) >= since)
    .reduce((sum, t) => sum + num(t.netPnl ?? t.pnl), 0);
  const ms = now.getTime();
  return {
    last24h: sumSince(new Date(ms - 24 * 60 * 60 * 1000)),
    last7d: sumSince(new Date(ms - 7 * 24 * 60 * 60 * 1000)),
    last30d: sumSince(new Date(ms - 30 * 24 * 60 * 60 * 1000)),
  };
}

/** Fee drag: total fees + the share of GROSS profit consumed. pctOfGross is
 *  null when gross <= 0 (ratio meaningless on a negative-gross window). */
export function computeFeeDrag(trades: ClosedTradeLike[]): { totalFees: number; pctOfGross: number | null } {
  const totalFees = trades.reduce((sum, t) => sum + num(t.totalFee ?? t.fees), 0);
  const grossPnlSum = trades.reduce((sum, t) => sum + num(t.grossPnl), 0);
  return { totalFees, pctOfGross: grossPnlSum > 0 ? (totalFees / grossPnlSum) * 100 : null };
}

/** Maker/taker entry mix. makerShare null when no row carries a known mode
 *  (unknown rows are excluded from the denominator, honestly counted). */
export function computeMakerTakerMix(trades: ClosedTradeLike[]): {
  makerCount: number; takerCount: number; unknownCount: number; makerShare: number | null;
} {
  const makerCount = trades.filter(t => t.chosenEntryMode === 'maker').length;
  const takerCount = trades.filter(t => t.chosenEntryMode === 'taker').length;
  return {
    makerCount,
    takerCount,
    unknownCount: trades.length - makerCount - takerCount,
    makerShare: (makerCount + takerCount) > 0 ? (makerCount / (makerCount + takerCount)) * 100 : null,
  };
}

/** Average net R-multiple: netPnl ÷ (|entry − stop| × qty). Rows with a NULL
 *  stop or non-positive risk are EXCLUDED and surfaced — never coerced. */
export function computeAvgNetR(trades: ClosedTradeLike[]): {
  value: number | null; sampleCount: number; excludedCount: number;
} {
  let rSum = 0, rCount = 0, rExcluded = 0;
  for (const t of trades) {
    const entry = num(t.entryPrice), stop = num(t.stopLoss), qty = num(t.quantity);
    const riskUsd = Math.abs(entry - stop) * qty;
    if (!t.stopLoss || !(riskUsd > 0)) { rExcluded++; continue; }
    rSum += num(t.netPnl ?? t.pnl) / riskUsd;
    rCount++;
  }
  return { value: rCount > 0 ? rSum / rCount : null, sampleCount: rCount, excludedCount: rExcluded };
}

/** In-window max drawdown (USD) on the REALIZED basis: running cumulative
 *  netPnl over the window's trades in close order, deepest peak-to-trough.
 *  Peak seeds at 0 (window-relative). The % against the anchor balance is
 *  derived at the route (it owns the balance read). */
export function computeMaxDrawdownUsd(trades: ClosedTradeLike[]): number {
  const byCloseTime = [...trades].sort(
    (a, b) => new Date(a.closedAt as any).getTime() - new Date(b.closedAt as any).getTime(),
  );
  let running = 0, peak = 0, maxDdUsd = 0;
  for (const t of byCloseTime) {
    running += num(t.netPnl ?? t.pnl);
    if (running > peak) peak = running;
    if (peak - running > maxDdUsd) maxDdUsd = peak - running;
  }
  return maxDdUsd;
}

/** Per-asset-class breakdown. Win basis = pnl > 0 — the SAME basis as the
 *  headline winRate (routes.ts `wins`), so the per-class rates reconcile with
 *  the top line (Langston Step-4 §1.6 consistency check). */
export function computeByAssetClass(trades: ClosedTradeLike[]): Record<string, {
  count: number; wins: number; netPnl: number; fees: number; winRate: number;
}> {
  const byAssetClass: Record<string, { count: number; wins: number; netPnl: number; fees: number; winRate: number }> = {};
  for (const t of trades) {
    const ac = t.assetClass || 'crypto_spot';
    if (!byAssetClass[ac]) byAssetClass[ac] = { count: 0, wins: 0, netPnl: 0, fees: 0, winRate: 0 };
    byAssetClass[ac].count++;
    if (num(t.pnl) > 0) byAssetClass[ac].wins++;
    byAssetClass[ac].netPnl += num(t.netPnl ?? t.pnl);
    byAssetClass[ac].fees += num(t.totalFee ?? t.fees);
  }
  Object.values(byAssetClass).forEach(r => { r.winRate = r.count > 0 ? (r.wins / r.count) * 100 : 0; });
  return byAssetClass;
}

/**
 * Profit-factor honesty (Langston Step-4 finding A): with NO losses there is no
 * denominator — return null (client renders "∞ (no losses)" when trades exist),
 * NEVER coerce Infinity to 0 ("0.00" on an all-wins window reads as the WORST
 * case on the best day — the exact inversion of the batch's null-honesty thesis).
 * A genuine 0 (zero profit, real losses) still returns 0.
 */
export function profitFactorOrNull(totalProfit: number, totalLoss: number): number | null {
  return totalLoss > 0 ? totalProfit / totalLoss : null;
}
