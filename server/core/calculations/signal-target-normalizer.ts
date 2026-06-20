/**
 * P19 reorg-B2 (Piece A + Piece C) — central target normalizer: floor-lift + universal RR gate
 * + reachability gate. ONE pure helper applied at BOTH signal convergence points — the active
 * path (`signal-orchestrator.ts` `buildSizedSignalForStrategy`, pre-geometry) AND the VTS path
 * (`vts-runner.ts` ~:1176) — so the two paths normalize IDENTICALLY (V1: VTS calls
 * `strategyEngine.detect*` directly, NOT via the orchestrator, so a single orchestrator-only site
 * would break sim-to-live parity).
 *
 * FORMULA-AGNOSTIC: the 21 strategies (12 file-based `mult×ATR`, 9 in-class heterogeneous
 * R-multiple/measured-move/percent) all set a final entry/stop/target; this helper sees only those
 * + the injected per-class knobs, so a per-strategy floor (21 drifting edits) is avoided.
 *
 * PURE FUNCTION — the caller injects the resolved per-class `floorPct` / `minRR` / `reachAtrMax`
 * (from `module_constants` `expectancy_gates`, via `getPerClassTargetGate`) + the pair ATR. No DB
 * dependency → unit-testable in isolation and off the hot-path resolver.
 *
 * Order: LIFT → universal RR gate → reachability gate.
 *  - LIFT: `target' = max(nativeTarget, entry × (1 + floorPct))` (long-only). Weak targets lift to
 *    the floor; STRONGER signals ride to their native target ABOVE the floor (dispersion is preserved —
 *    nothing clamps the top).
 *  - UNIVERSAL RR GATE: `rr = (target' − entry) / (entry − stop)`, applied to ALL signals (native OR
 *    lifted) — never lift-only. `rr < minRR` → DROP (`rr_below_min`). NEVER co-move a structural stop
 *    to manufacture RR (Langston Step-2): the stop sits at structure; squeezing it plants it in noise.
 *  - REACHABILITY GATE (Piece C): `atrsToTarget = (target' − entry) / ATR ≤ reachAtrMax` (the √H-scaled
 *    reachable bound, c·√H). A pair whose volatility can't physically traverse the (possibly lifted)
 *    target within the ATR horizon is dropped (`unreachable`). **Reachability is PATH-INVARIANT by
 *    design** — it is a FEASIBILITY check, not a quality bar, so it is per-CLASS (BTC vs xStock ATR
 *    scales genuinely differ) but NOT per-filterPath: a VTS-relaxed path lowers QUALITY floors to widen
 *    learning data, but an unreachable target is garbage data for VTS too, not a softer pass (Langston).
 */

export type TargetNormalizeInput = {
  /** Entry price (long-only). */
  entryPrice: number;
  /** Structural stop price (below entry). NOT modified by this helper. */
  stopPrice: number;
  /** Native target from the strategy. */
  targetPrice: number;
  /** Per-class target floor as a decimal ROI (e.g. 0.040 = 4%). Injected (Piece B). */
  floorPct: number;
  /** Per-class minimum reward-to-risk ratio (e.g. 2.5). Injected (Piece B). */
  minRR: number;
  /** Pair ATR in price units (e.g. `mceContext.indicators.atr`). Reorg-B2 Piece C. */
  atr: number;
  /** Per-class max ATRs-to-target (c·√H, path-INVARIANT feasibility bound). Injected. */
  reachAtrMax: number;
};

export type TargetNormalizeReason = 'rr_below_min' | 'unreachable' | 'invalid_atr' | 'invalid_geometry';

export type TargetNormalizeResult = {
  /** True iff the signal passes the floor-lift + the universal RR gate + the reachability gate. */
  ok: boolean;
  /** The (possibly lifted) target price. */
  targetPrice: number;
  /** Reward-to-risk after the lift. */
  rr: number;
  /** ATRs the (possibly lifted) target sits from entry — `(target' − entry) / ATR`. */
  atrsToTarget: number;
  /** True iff the floor lifted the native target. */
  lifted: boolean;
  /** Present iff `!ok`. */
  reason?: TargetNormalizeReason;
};

/** Lift the target to the per-class floor, then apply the universal RR gate and the reachability gate.
 *  Long-only. Drop (never co-move the stop, never relax reachability per-path) on a failed gate. */
export function normalizeAndGateTarget(input: TargetNormalizeInput): TargetNormalizeResult {
  const { entryPrice, stopPrice, targetPrice: nativeTarget, floorPct, minRR, atr, reachAtrMax } = input;

  // Geometry guard (long-only): finite, positive, stop strictly below entry.
  if (
    !Number.isFinite(entryPrice) || !Number.isFinite(stopPrice) || !Number.isFinite(nativeTarget) ||
    entryPrice <= 0 || stopPrice <= 0 || stopPrice >= entryPrice
  ) {
    return { ok: false, targetPrice: nativeTarget, rr: 0, atrsToTarget: Number.POSITIVE_INFINITY, lifted: false, reason: 'invalid_geometry' };
  }

  const floorTarget = entryPrice * (1 + floorPct);
  const lifted = floorTarget > nativeTarget;
  const targetPrice = lifted ? floorTarget : nativeTarget;

  const risk = entryPrice - stopPrice;   // > 0 by the guard above
  const reward = targetPrice - entryPrice;
  const rr = reward / risk;
  const atrsToTarget = atr > 0 ? reward / atr : Number.POSITIVE_INFINITY;

  if (rr < minRR) {
    // DROP + by-reason. Do NOT tighten the structural stop to manufacture RR.
    return { ok: false, targetPrice, rr, atrsToTarget, lifted, reason: 'rr_below_min' };
  }

  if (!(atr > 0)) {
    // ATR genuinely unavailable (a wiring/data bug, NOT a feasibility drop) — distinct loud reason so
    // it is never silently masked as `unreachable` (Langston Step-4: fail loud, don't coerce-to-0).
    return { ok: false, targetPrice, rr, atrsToTarget, lifted, reason: 'invalid_atr' };
  }
  if (atrsToTarget > reachAtrMax) {
    // The pair's volatility can't physically traverse the target within the ATR horizon → unreachable.
    return { ok: false, targetPrice, rr, atrsToTarget, lifted, reason: 'unreachable' };
  }

  return { ok: true, targetPrice, rr, atrsToTarget, lifted };
}
