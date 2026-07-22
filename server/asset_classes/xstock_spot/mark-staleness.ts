/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P19-B8.5e — the mark-staleness POLICY: how old may a mark be before we refuse
 *             to evaluate a position against it?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REPLACES a single global 90-second constant applied to every xStock alike. That
 * constant was simultaneously TOO LOOSE on the dangerous names and TOO TIGHT on the
 * safe ones — measured (`#548`): we were blind to ~4% of adverse movement on the
 * fastest symbol, while the SAFEST symbol in the book refused to be managed 49×/24h
 * on ordinary quiet trading. One number cannot serve symbols whose risk-per-second
 * differs ~11×.
 *
 * ★ THE RULE, in one line: **the ceiling is the time in which THIS symbol can move at
 * most `budget` against us**, where `budget` is a FRACTION of the position's REMAINING
 * ROOM TO ITS STOP. A trade sitting near its stop therefore gets the TIGHTEST tolerance
 * — which is correct, because that is exactly when acting on a wrong price costs most.
 *
 * ★ SEPARATION OF CONCERNS (deliberate): `sigma-rate.ts` MEASURES (how fast does this
 * symbol move), this module DECIDES (how long may we trust a mark). Measurement is
 * DB-bound and async; policy is PURE and unit-testable. Do not merge them.
 *
 * ★ FAIL-CLOSED EVERYWHERE. Every degenerate input resolves toward the TIGHTEST window,
 * never the widest. Absent σ, absent stop, absent price, non-finite arithmetic — all
 * land on `floorMs`. **The failure direction matters more than the formula:** being too
 * strict costs us a skipped evaluation cycle (seconds, retried immediately); being too
 * loose means acting on a price that has silently gone wrong. Mirrors the S20
 * price-liveness posture.
 *
 * ⚠️ THE CEILING IS AN **AGE THRESHOLD**, NOT A RETRY INTERVAL (Kyle's question,
 * 2026-07-22 — worth stating in code because it is the natural misreading). Evaluation
 * re-runs every cycle, seconds apart. The ceiling only decides whether the mark is
 * TRUSTED on THIS pass. A refusal at ceiling+1s is followed by another check moments
 * later — not by another full ceiling of waiting — and the instant a fresh tick lands
 * the age resets to zero and normal management resumes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** DB-governed knobs (module `mark_staleness`, per asset class). All required — no defaults. */
export interface MarkStalenessConfig {
  /** Fraction of remaining risk-to-stop we accept being blind to. <1. */
  budgetK: number;
  /** Fixed conservative budget (as a fraction) when the position has NO stop. */
  nullStopBudgetPct: number;
  /** Never refuse faster than this, or we skip constantly on every symbol. */
  floorMs: number;
  /** Hard backstop for a regime break the trailing σ has not seen. A REAL safety param. */
  capMs: number;
}

export interface CeilingInput {
  /** Current mark. */
  currentPrice: number;
  /** The position's stop. `null` when the position has none. */
  stopPrice: number | null;
  /** Resolved realized volatility, fractional move per SECOND. `null` when unavailable. */
  sigmaRatePerSec: number | null;
}

export interface CeilingResult {
  ceilingMs: number;
  /** Why this ceiling — for the skip-reason telemetry and for a human reading a log. */
  basis:
    | 'risk_to_stop'      // normal: budget derived from remaining room to the stop
    | 'null_stop_budget'  // position has no stop → fixed conservative budget
    | 'no_sigma'          // σ unavailable → floor (fail-closed)
    | 'degenerate_input'; // unusable price/stop/arithmetic → floor (fail-closed)
  /** The budget actually used, as a fraction. `null` on a fail-closed path. */
  budgetFraction: number | null;
  /** True when the raw computation was clamped by floor or cap — useful to see in logs. */
  clamped: boolean;
}

/**
 * PURE. Compute how old a mark may be, for THIS position, right now.
 *
 * `ceiling = clamp( budget / σ_rate , floorMs , capMs )`
 *
 * where `budget = budgetK × |currentPrice − stopPrice| / currentPrice`, i.e. a fraction
 * of the REMAINING room to the stop — so the tolerance shrinks as the danger rises.
 *
 * ⚠️ KNOWN MODELLING SIMPLIFICATION, recorded not buried: real price diffusion scales
 * with √t, not t, so a linear rate overstates the move available over long horizons and
 * understates it over short ones. This is the approved form for `#548`, it is closest to
 * correct in the seconds-to-minutes band where these ceilings actually land, and the
 * error direction at the long end is TOWARD A TIGHTER window — the safe side. The `capMs`
 * clamp bounds the long end regardless. Revisit only with measurement, never by feel.
 */
export function computeStalenessCeiling(
  input: CeilingInput,
  cfg: MarkStalenessConfig,
): CeilingResult {
  const { currentPrice, stopPrice, sigmaRatePerSec } = input;

  const floor = Number.isFinite(cfg.floorMs) && cfg.floorMs > 0 ? cfg.floorMs : 0;
  const cap = Number.isFinite(cfg.capMs) && cfg.capMs > floor ? cfg.capMs : floor;

  // Fail-closed: no usable volatility ⇒ tightest window. NEVER widen on an absent σ.
  if (sigmaRatePerSec === null || !Number.isFinite(sigmaRatePerSec) || sigmaRatePerSec <= 0) {
    return { ceilingMs: floor, basis: 'no_sigma', budgetFraction: null, clamped: true };
  }
  // Fail-closed: an unusable mark cannot support any derivation.
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { ceilingMs: floor, basis: 'degenerate_input', budgetFraction: null, clamped: true };
  }

  let budget: number;
  let basis: CeilingResult['basis'];

  if (stopPrice === null || !Number.isFinite(stopPrice) || stopPrice <= 0) {
    // No stop ⇒ a fixed conservative budget. NEVER fail open to a wide window.
    budget = cfg.nullStopBudgetPct;
    basis = 'null_stop_budget';
  } else {
    const roomFraction = Math.abs(currentPrice - stopPrice) / currentPrice;
    budget = cfg.budgetK * roomFraction;
    basis = 'risk_to_stop';
  }

  if (!Number.isFinite(budget) || budget <= 0) {
    // Price has reached/crossed the stop ⇒ zero room ⇒ zero tolerance. The floor is the
    // tightest we allow; the caller still refuses on anything older.
    return { ceilingMs: floor, basis, budgetFraction: budget > 0 ? budget : 0, clamped: true };
  }

  const rawMs = (budget / sigmaRatePerSec) * 1000;
  if (!Number.isFinite(rawMs)) {
    return { ceilingMs: floor, basis: 'degenerate_input', budgetFraction: budget, clamped: true };
  }

  const ceilingMs = Math.max(floor, Math.min(cap, rawMs));
  return { ceilingMs, basis, budgetFraction: budget, clamped: ceilingMs !== rawMs };
}
