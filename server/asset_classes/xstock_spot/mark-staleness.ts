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
 * ★★ STALE-LOW σ — THE FAIL-**OPEN** HOLE THIS MODULE ORIGINALLY HAD (found by ANALYST at
 * Step-4 review, 2026-07-22; verified in code before accepting). σ sits in the DENOMINATOR,
 * so **a low σ WIDENS the window**. The original `null`-σ guard covered only ABSENT σ — but
 * null is not the dangerous value, **a SMALL-BUT-WRONG σ is**:
 *
 *   1. symbol is quiet ⇒ σ measured low over the trailing window
 *   2. symbol stops being quiet (news, the open, a block print)
 *   3. the cached σ is still the QUIET one — it is not null, so no guard fires
 *   4. ceiling derived from the pre-spike σ ⇒ WIDE ⇒ we accept an old mark **precisely
 *      during the volatility that makes an old mark worthless**, next to a stop.
 *
 * The bias ran the wrong way: the estimate is least accurate exactly when σ is changing
 * fastest, and the error WIDENED the window. The header used to claim "fail-closed
 * everywhere"; against a volatility regime change that claim was FALSE.
 *
 * ⇒ **`ageInflation` below turns σ's own staleness into a TIGHTENING force.** Past
 * `sigmaFullCreditMs` the σ is inflated with age, so an old σ can never buy a full-width
 * window — a ramp toward the floor, not a cliff at `sigma_max_age_ms`. A `null` age is
 * treated as maximally stale. **The rule in one line: be generous with FRESH evidence,
 * never with STALE evidence.**
 *
 * ⚠️ This bounds the DAMAGE from a lagging σ; it does not make σ track a spike faster.
 * The measurement-side lag (a 30-min trailing window DILUTES a fresh spike even once
 * refreshed) is a separate, named concern — see `#566`.
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
  /**
   * ★ Age below which a cached σ is trusted at FULL credit. Past it, σ is inflated with age
   * (⇒ tighter ceiling), so stale evidence can never buy a full-width window. Set to the
   * refresh cadence: a σ younger than one refresh period is as fresh as the design allows.
   */
  sigmaFullCreditMs: number;
}

/**
 * PURE. How much to inflate σ given how old the σ ESTIMATE is.
 *
 * Fresh ⇒ 1 (no penalty). Past `sigmaFullCreditMs` the multiplier grows linearly: one full
 * credit-period of staleness doubles σ, two triples it, and so on — halving/thirding the
 * ceiling. `null`/non-finite age ⇒ treated as maximally stale.
 *
 * ★ WHY LINEAR-IN-AGE AND NOT A CLIFF: a cliff at `sigma_max_age_ms` gives full-width
 * windows right up to the edge and then slams to the floor — the worst of both (generous
 * while wrong, then abruptly useless). A ramp means confidence and tolerance decay together,
 * which is the honest relationship: **we do not know σ any more, so we do not extend credit.**
 */
export function sigmaAgeInflation(sigmaAgeMs: number | null, sigmaFullCreditMs: number): number {
  if (!Number.isFinite(sigmaFullCreditMs) || sigmaFullCreditMs <= 0) return MAX_SIGMA_AGE_INFLATION;
  if (sigmaAgeMs === null || !Number.isFinite(sigmaAgeMs)) return MAX_SIGMA_AGE_INFLATION;
  if (sigmaAgeMs <= sigmaFullCreditMs) return 1;
  const periodsStale = (sigmaAgeMs - sigmaFullCreditMs) / sigmaFullCreditMs;
  return Math.min(MAX_SIGMA_AGE_INFLATION, 1 + periodsStale);
}

/**
 * Bound on the age penalty. Not a tuning knob — a sanity rail so a pathological clock skew
 * cannot inflate σ to infinity and collapse every ceiling to the floor for a reason nobody
 * can see. The cache's own `sigma_max_age_ms` is the real bound on age; this backstops it.
 */
const MAX_SIGMA_AGE_INFLATION = 6;

export interface CeilingInput {
  /** Current mark. */
  currentPrice: number;
  /** The position's stop. `null` when the position has none. */
  stopPrice: number | null;
  /** Resolved realized volatility, fractional move per SECOND. `null` when unavailable. */
  sigmaRatePerSec: number | null;
  /**
   * ★ How old the σ estimate itself is. `null` ⇒ treated as MAXIMALLY stale (fail-closed).
   * See `STALE-LOW σ` below — this is not bookkeeping, it is the input that stops a
   * pre-spike σ from buying a full-width window during the spike.
   */
  sigmaAgeMs: number | null;
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
  /**
   * How much σ was inflated for its OWN staleness (1 = fresh, >1 = aged ⇒ tightened).
   * Surfaced so a log/telemetry reader can tell "this symbol is genuinely quiet" from
   * "we are extending less credit because our σ is old" — indistinguishable otherwise.
   */
  sigmaAgeInflation: number;
  /**
   * ★ TRUE when the FLOOR is holding the window open wider than this position's remaining
   * room to its stop — i.e. `room < σ_effective × floor`, so the stop is CROSSABLE inside
   * the blind window (Langston Step-4, ship-in-batch). Distinct from `clamped`, which a
   * perfectly calm symbol also sets: without this flag a floor-bound near-stop skip is
   * indistinguishable in the logs from an ordinary quiet one.
   *
   * Carries NO behaviour — it makes the `#563` exposure a MEASURED quantity instead of an
   * argued one, so the decision about what to do with an unpriceable near-stop position is
   * made on counts rather than on anyone's intuition.
   */
  floorBoundNearStop: boolean;
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
    return { ceilingMs: floor, basis: 'no_sigma', budgetFraction: null, clamped: true, sigmaAgeInflation: MAX_SIGMA_AGE_INFLATION, floorBoundNearStop: false };
  }
  // Fail-closed: an unusable mark cannot support any derivation.
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { ceilingMs: floor, basis: 'degenerate_input', budgetFraction: null, clamped: true, sigmaAgeInflation: MAX_SIGMA_AGE_INFLATION, floorBoundNearStop: false };
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
    return { ceilingMs: floor, basis, budgetFraction: budget > 0 ? budget : 0, clamped: true, sigmaAgeInflation: sigmaAgeInflation(input.sigmaAgeMs, cfg.sigmaFullCreditMs), floorBoundNearStop: false };
  }

  // ★ STALE-LOW σ GUARD: inflate σ by how old the ESTIMATE is, so an ageing σ TIGHTENS the
  // window instead of widening it. Without this, a pre-spike σ served up to sigma_max_age_ms
  // buys a full-width window during the spike (the fail-OPEN hole — see header).
  const inflation = sigmaAgeInflation(input.sigmaAgeMs, cfg.sigmaFullCreditMs);
  const effectiveSigma = sigmaRatePerSec * inflation;

  const rawMs = (budget / effectiveSigma) * 1000;
  if (!Number.isFinite(rawMs)) {
    return { ceilingMs: floor, basis: 'degenerate_input', budgetFraction: budget, clamped: true, sigmaAgeInflation: inflation, floorBoundNearStop: false };
  }

  const ceilingMs = Math.max(floor, Math.min(cap, rawMs));

  // The floor is holding the window open, AND the symbol can cover the whole remaining room
  // to the stop within it ⇒ the stop is crossable unseen. Only meaningful against a real
  // stop, so `risk_to_stop` only.
  const roomFraction = basis === 'risk_to_stop' ? budget / cfg.budgetK : null;
  const floorBoundNearStop =
    basis === 'risk_to_stop' &&
    ceilingMs === floor &&
    rawMs < floor &&
    roomFraction !== null &&
    roomFraction < effectiveSigma * (floor / 1000);

  return { ceilingMs, basis, budgetFraction: budget, clamped: ceilingMs !== rawMs, sigmaAgeInflation: inflation, floorBoundNearStop };
}
