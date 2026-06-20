/**
 * P19 reorg-B2 (Piece A) — central target-floor normalizer + universal RR gate.
 *
 * ONE pure helper applied at BOTH signal convergence points — the active path
 * (`signal-orchestrator.ts` post-validation, ~line 1397) AND the VTS path
 * (`vts-runner.ts` `callStrategyDetect`, ~line 885) — so the two paths floor and
 * gate IDENTICALLY. The pre-audit (V1) proved VTS calls `strategyEngine.detect*`
 * directly and does NOT route through the orchestrator, so a single orchestrator-only
 * site would break sim-to-live parity; this shared helper is the multi-path-consistent
 * placement for Piece A (Kyle directive 2026-06-20).
 *
 * It is FORMULA-AGNOSTIC: the 21 strategies (12 file-based `mult×ATR`, 9 in-class
 * heterogeneous R-multiple/measured-move/percent) all set a final entry/stop/target;
 * this helper sees only those three + the injected per-class knobs, so a per-strategy
 * floor (21 drifting edits) is avoided.
 *
 * PURE FUNCTION — the caller injects the resolved per-class `floorPct` + `minRR`
 * (from `module_constants`, Piece B). No DB dependency → unit-testable in isolation
 * and free of the hot-path resolver.
 *
 * Behavior (Langston Step-2 resolutions, 2026-06-20):
 *  - LIFT: `target' = max(nativeTarget, entry × (1 + floorPct))` (long-only today).
 *  - UNIVERSAL RR GATE: `rr = (target' − entry) / (entry − stop)`, applied to ALL
 *    converged signals (native OR lifted) — NOT lift-only — so the lift path is never
 *    stricter than the native path (Langston condition 2).
 *  - `rr < minRR` → REJECT (drop + by-reason `rr_below_min`). NEVER co-move a
 *    structural stop to manufacture RR (Langston condition 1 / pre-audit V3): the stop
 *    sits at structure; squeezing it inward to fake the ratio plants it in noise →
 *    premature stop-outs that quietly degrade Net Expectancy.
 *
 * Reachability (Piece C, the movement filter) is the upstream companion that ensures
 * the lifted target is actually achievable; this helper enforces the geometry.
 */

export type TargetNormalizeInput = {
  /** Entry price (long-only). */
  entryPrice: number;
  /** Structural stop price (below entry for a long). NOT modified by this helper. */
  stopPrice: number;
  /** Native target from the strategy. */
  targetPrice: number;
  /** Per-class target floor as a decimal ROI (e.g. 0.035 = 3.5%). Injected (Piece B). */
  floorPct: number;
  /** Per-class minimum reward-to-risk ratio (e.g. 2.5). Injected (Piece B). */
  minRR: number;
};

export type TargetNormalizeReason = 'rr_below_min' | 'invalid_geometry';

export type TargetNormalizeResult = {
  /** True iff the signal passes the floor-lift + the universal RR gate. */
  ok: boolean;
  /** The (possibly lifted) target price. */
  targetPrice: number;
  /** Reward-to-risk after the lift. */
  rr: number;
  /** True iff the floor lifted the native target. */
  lifted: boolean;
  /** Present iff `!ok`. */
  reason?: TargetNormalizeReason;
};

/**
 * Lift the target to the per-class floor and apply the universal RR gate.
 * Long-only. Drop (never co-move the stop) when RR < minRR.
 */
export function normalizeAndGateTarget(input: TargetNormalizeInput): TargetNormalizeResult {
  const { entryPrice, stopPrice, targetPrice: nativeTarget, floorPct, minRR } = input;

  // Geometry guard (long-only): finite, positive, stop strictly below entry.
  if (
    !Number.isFinite(entryPrice) || !Number.isFinite(stopPrice) || !Number.isFinite(nativeTarget) ||
    entryPrice <= 0 || stopPrice <= 0 || stopPrice >= entryPrice
  ) {
    return { ok: false, targetPrice: nativeTarget, rr: 0, lifted: false, reason: 'invalid_geometry' };
  }

  const floorTarget = entryPrice * (1 + floorPct);
  const lifted = floorTarget > nativeTarget;
  const targetPrice = lifted ? floorTarget : nativeTarget;

  const risk = entryPrice - stopPrice;   // > 0 by the guard above
  const reward = targetPrice - entryPrice;
  const rr = reward / risk;

  if (rr < minRR) {
    // DROP + by-reason. Do NOT tighten the structural stop to manufacture RR.
    return { ok: false, targetPrice, rr, lifted, reason: 'rr_below_min' };
  }

  return { ok: true, targetPrice, rr, lifted };
}
