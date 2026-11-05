/**
 * B-XSTOCK-DBS-TO-STRATEGIES (#1235, OBJ-1) — the object every xStock strategy's detect receives.
 *
 * Until this batch the xStock loop handed detect `mceContext.indicators` as is. The MCE builds that
 * object without the directional score (market-context-engine.ts, the MarketIndicators literal), so
 * every xStock strategy read `dbsScore ?? 0` and every DBS gate and guard was inert
 * (strong_bull_trend could never fire; the counter-trend and strong-DBS guards never refused).
 * Crypto has always built its detect object with the score (vts-runner.ts generatePhase10Signal).
 *
 * This is a SPREAD COPY of every MCE field plus the scanner's score. The caller's object is NOT
 * mutated: in eval-cycle.ts the provenance capture, the hybrid score, the reach gate and the paper
 * hand-off read `mceContext.indicators` directly. Do not narrow it to crypto's seven-field pick —
 * that pick drops volatility/momentum/adx, and a narrower object is how the score went missing.
 *
 * With `propagatedDbs` absent (the scanner lacked history, ATR or a sector) the three fields are
 * undefined and the strategies' `?? 0` applies, exactly as on crypto. No new fallback.
 */
export interface PropagatedDbs {
  score: number;
  category: string;
  slope: number;
}

export function buildXstockDetectIndicators<T extends object>(
  mceIndicators: T,
  propagatedDbs: PropagatedDbs | undefined,
): T & { dbsScore?: number; dbsCategory?: string; dbsSlope?: number } {
  return {
    ...mceIndicators,
    dbsScore: propagatedDbs?.score,
    dbsCategory: propagatedDbs?.category,
    dbsSlope: propagatedDbs?.slope,
  };
}

/** The score as the archive records it (`features.detectDbsScore`): a finite number, else null. */
export function detectDbsScoreOf(indicators: { dbsScore?: number }): number | null {
  return Number.isFinite(indicators.dbsScore) ? (indicators.dbsScore as number) : null;
}
