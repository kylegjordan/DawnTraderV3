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

/**
 * B-PHANTOM-FILL-RECONSTRUCT (#507 follow-on): THE honest realized P&L for one closed trade.
 *
 * Defined ONCE and imported everywhere, because "the same number computed two ways in two
 * places" is the failure this entire arc documents. The SQL side carries the matching expression
 * at `DatabaseStorage.HONEST_PNL`; a fence asserts the two agree on the same rows.
 *
 * Prefers `reconstructedNetPnl` -- what the exit WOULD have been at the real market bid, measured
 * from retained ticker data, for trades whose recorded exit came from a ghost book level. Falls
 * back to the recorded values, which are NEVER mutated (Kyle: flag and remove from the accounts,
 * but do not delete the trades). A flagged row with no reconstruction keeps its recorded figure
 * and stays flagged -- the truthful answer when the market data simply does not exist.
 *
 * Lives HERE because this module is the pure metric maths and imports nothing; putting it in a
 * heavier module would have forced this one to take a dependency it does not need.
 */
export function honestNetPnl(t: {
  reconstructedNetPnl?: unknown;
  /** B-OBSERVATION-EPOCH: needed for both-leg epoch keying. */
  openedAt?: Date | string | null;
  netPnl?: unknown;
  pnl?: unknown;
}): number {
  const pick = t.reconstructedNetPnl ?? t.netPnl ?? t.pnl;
  const n = parseFloat(String(pick ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export interface ClosedTradeLike {
  pnl?: unknown;
  netPnl?: unknown;
  // #507 follow-on: the honest exit reconstructed from retained market data, for trades whose
  // recorded exit came from a ghost book level. Preferred by honestNetPnl(); the originals
  // above are never mutated.
  reconstructedNetPnl?: unknown;
  /** B-OBSERVATION-EPOCH: needed for both-leg epoch keying. */
  openedAt?: Date | string | null;
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
/**
 * ★ B-OBSERVATION-EPOCH (Kyle 2026-08-24) — THE ROLLING WINDOWS ARE CLAMPED TO THE OBSERVATION EPOCH.
 *
 * Kyle: *"day one of trading is today… the seven day metric should probably match the twenty four
 * hour. Same with the thirty day, same with the lifetime. It all starts today."*
 *
 * ⛔ WHY THIS WAS A REAL DEFECT AND NOT A COSMETIC ONE. These windows were plain `now − N days` with
 * no epoch term, while `getLifetimeScoreboard` IS epoch-scoped. So the moment an epoch was set the
 * dashboard would have shown a clean lifetime figure beside a 30-day figure silently summing the
 * ENTIRE pre-fix era — two numbers on one card, disagreeing, each looking authoritative.
 *
 * ★ AND THE WINDOW IS KEYED ON **BOTH LEGS**, WHICH IS A DECISION, NOT A FALL-OUT (Langston's
 * condition). A trade OPENED before the epoch and CLOSED after it carries an entry price taken
 * through the contaminated mini-book, so it is not "properly traded with the right pricing data" —
 * which is the entire point of the reset. MEASURED at the reset: 11 closes after the fix line, but
 * only **4** with both legs after it; and **3 of 7 still-open positions opened pre-fix**, so
 * close-time keying would keep admitting contaminated entries for days.
 */
/**
 * ★ THE OBSERVATION-EPOCH MEMBERSHIP TEST — **ONE HOME, because a keying rule with two homes is
 * how this batch shipped a bug.** B-OBSERVATION-EPOCH decided BOTH-LEG keying and pinned it with
 * four tests, but the predicate lived INLINE inside `computeRollingEarnings` — so the rolling
 * windows honoured it while `/active-engine/trades/analytics` and `getLifetimeScoreboard` kept
 * close-only keying. MEASURED on staging 2026-08-24, all three on ONE card at ONE moment:
 * rolling **-$4.91 over 6 trades** (both-leg) beside Lifetime **+$5.76 over 13** (close-keyed)
 * beside a **66.7% win rate over 9** (24h close-keyed). Three answers, one question, each
 * looking authoritative — the exact failure §3 of that scope says the batch exists to prevent.
 * ⇒ EXTRACTED AND EXPORTED. Every epoch-aware reader calls THIS. Do not re-inline it.
 *
 * A trade counts only when BOTH legs fall at or after the epoch: a trade OPENED before it carries
 * an entry price taken through the contaminated mini-book (#741), so it is not "properly traded
 * with the right pricing data", which is the whole purpose of the reset.
 *
 * FAIL-CLOSED on an unplaceable trade: an absent open time cannot be SHOWN to satisfy the test, so
 * it does not count — the "absent wearing a value's clothes" case (#546) the epoch exists to remove.
 * NO epoch ⇒ `true` for everything, i.e. the pre-epoch behaviour, unchanged.
 */
export function isInObservationEpoch(t: ClosedTradeLike, epochStartedAt: Date | null): boolean {
  if (!epochStartedAt) return true;
  if (!t.closedAt || new Date(t.closedAt) < epochStartedAt) return false;
  // `openedAt` is a declared field on ClosedTradeLike — NOT cast through `any`. The cast that used
  // to sit here would have let a renamed field compile silently and exclude every row.
  return !!t.openedAt && new Date(t.openedAt) >= epochStartedAt;
}

/** A rolling window can never reach back past the epoch. Returns the later of the two bounds. */
export function clampWindowToEpoch(since: Date, epochStartedAt: Date | null): Date {
  return epochStartedAt && epochStartedAt > since ? epochStartedAt : since;
}

export function computeRollingEarnings(
  validTrades: ClosedTradeLike[],
  now: Date,
  /** Observation epoch. Trades are counted only when BOTH legs fall at or after it. */
  epochStartedAt: Date | null,
): { last24h: number; last7d: number; last30d: number } {
  const scoped = validTrades.filter(t => isInObservationEpoch(t, epochStartedAt));
  const sumSince = (since: Date) => {
    const from = clampWindowToEpoch(since, epochStartedAt);
    return scoped
      .filter(t => t.closedAt && new Date(t.closedAt) >= from)
      .reduce((sum, t) => sum + honestNetPnl(t), 0);
  };
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
    rSum += honestNetPnl(t) / riskUsd;
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
    running += honestNetPnl(t);
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
    byAssetClass[ac].netPnl += honestNetPnl(t);
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
