/**
 * B-PRICE-SIDE-BY-JOB (plan row 3n) — THE LEVEL BASIS.
 *
 * ⛔ THE RULE THIS MODULE IMPLEMENTS, ruled with Langston 2026-09-04 and recorded in
 * `B_PRICE_SIDE_BY_JOB_LEVEL_CENSUS.md` §7-§8:
 *
 *   A LEVEL'S BASIS MUST BE A PRICE THE MARKET EITHER ACTUALLY PRINTED — CARRYING ITS
 *   AGE, STATED AT THE SITE — OR ONE WE COULD ACTUALLY TRANSACT AT. AN UNBOUNDED-AGE
 *   PRINT IS NOT AN ANCHOR, IT IS A MEMORY. A MIDPOINT IS NEITHER: no transaction ever
 *   occurred there and no counterparty ever offered it. A SMOOTHED midpoint is neither,
 *   and is additionally lagged.
 *
 * ★ WHAT THIS MODULE IS *NOT* FOR, and the boundary is the whole reason the batch is a
 * SEVERANCE rather than a removal (pre-audit "THE BOUNDARY THAT MUST NOT BE OVER-CUT"):
 * the adaptive filter keeps its ESTIMATOR job in full — ATR, VWAP, SMA, the regime
 * classification, the noise metrics. A damped input is the CORRECT choice for a
 * noise-sensitive estimator. `MarketIndicators.currentPrice` is unchanged and stays the
 * smoothed value. THE FILTER KEEPS ESTIMATING; IT STOPS PRICING.
 *
 * ⇒ Disposition (2) on the 2025-12-30 midpoint decision (`b4c0d2d67`, "implement midpoint
 * pricing for improved accuracy on low-volume pairs"): its reasoning is HALF RIGHT and was
 * never wrong about what it was deciding. On a thin book against a stale print the midpoint
 * genuinely IS the more accurate ESTIMATE. Accuracy-of-an-estimate and
 * transactability-of-a-level are different requirements, and that decision never
 * distinguished them because nothing then asked it to.
 *
 * ⛔ WHY NOT THE VENUE'S LAST PRINT (option (b), ruled against): the arm EXISTS — Kraken's
 * v2 ticker carries `last` on every tick (`kraken-v2-translator.ts:64`) and we use it only
 * when the book is empty (`:73`). It was rejected because a last print on a thin pair is an
 * unbounded-age print, which the age clause above calls a memory. The DECIDING reason is
 * narrower and better: the consistency that carries fidelity is between the LEVEL and its
 * COMPARATOR, not across lanes. A stop built on basis X and compared against a mark read on
 * basis Y differs from its stated distance by (X−Y) — which is the spread, so the error
 * VARIES WITH LIQUIDITY AND WIDENS EXACTLY WHEN IT HURTS.
 */

/**
 * ⛔ FOUR ROLES, NOT THREE — AND THE ENTRY SPLIT IS THE POINT (Langston BLOCKER-1,
 * re-derived at `active-execution-engine.ts:3820-3841`).
 *
 * "Ask for entry" is an INCOMPLETE rule because the entry arm is not always a taker.
 * `:3822` sets the maker limit to `signal.entryPrice` — the maker limit IS the level — and
 * `:3839` RESTS it as a `state='pending'` position until the market trades through it.
 *
 * ⇒ A RESTING BUY LIMIT *IS A BID*. It is filled by a seller crossing INTO it; it never
 * lifts an ask. Anchoring it on the ask would overstate the entry by a full spread on the
 * one arm that pays no spread at all — and would systematically push maker promotions into
 * the `MARKETABLE_TAKER_FALLBACK` / `MAKER_MARKETABLE_DROPPED` branches at `:3830`/`:3832`,
 * because a limit set at the current ask is marketable at placement by construction.
 *
 * ⛔ THE CONSTRUCTOR IS *TOLD* THE EXECUTION INTENT. It never infers it. A module that
 * guesses whether an entry will rest or cross has re-created the defect one layer down.
 *
 * ⚠️ DELIBERATELY NOT `PriceRole` from `venue-price-grid.ts`. That type has three members
 * and belongs to F-G-1, which is deployed. Widening a deployed type to carry this batch's
 * distinction would edit a live module for a reason that has nothing to do with rounding.
 * The two are related and NOT the same: `PriceRole` picks a rounding DIRECTION for a price
 * that already exists; `LevelRole` picks WHICH PRICE EXISTS in the first place. This module
 * runs FIRST and the grid rounds what it produces.
 */
export type LevelRole =
  /** A buy that crosses the spread now. Lifts the ask. */
  | 'entry_taker'
  /** A post-only buy that RESTS at the limit. It is a bid. */
  | 'entry_maker_resting'
  /** A sell for a long. Hits the bid. */
  | 'stop'
  /** A sell for a long. Hits the bid. */
  | 'target';

/**
 * ⛔ WHY A REFUSAL AND NEVER A FALLBACK (Langston BLOCKER-2, accepted in full).
 *
 * If the book is absent or one-sided at construction time this REFUSES. It does not
 * `?? mid`. A `?? mid` fallback is `#546` exactly: an absent basis wearing a plausible
 * number's clothes — and WORSE than today's behaviour, because today's midpoint is at
 * least UNIFORM while a silent fallback would be intermittent and invisible.
 *
 * ⚠️ NOT HYPOTHETICAL: `B-XSTOCK-FEED-SANITY` measured hollow books on live xStock names
 * in the week this was written.
 */
export type LevelBasisRefusal =
  /** No book at all for this symbol. */
  | 'no_book'
  /** One side present, the other absent or non-positive. A mid is undefined here. */
  | 'one_sided_book'
  /** bid >= ask. Crossed or locked; no transactable side can be named. */
  | 'crossed_book'
  /** A side is present but not a finite positive number. */
  | 'non_finite_side'
  /** The book carries no capture time, so its AGE cannot be stated — the age clause fails closed. */
  | 'age_unknown';

/**
 * A transactable basis for level construction.
 *
 * ⛔ `mid` IS CARRIED AND IS NEVER A LEVEL. It is published so a reader can size the error
 * this batch corrects, and so the level-vs-comparator gap is measurable rather than
 * asserted. `priceForLevelRole` cannot return it — that is enforced by the function, not by
 * a comment, because a comment is not a control.
 */
export interface LevelBasis {
  readonly bid: number;
  readonly ask: number;
  /** ⛔ TELEMETRY ONLY. Never a level. See `priceForLevelRole`. */
  readonly mid: number;
  /** When the venue's book was captured, not when we read it. */
  readonly capturedAtMs: number;
  /** ⛔ THE AGE CLAUSE, STATED AT THE SITE. Callers record this beside any level they build. */
  readonly ageMs: number;
  /** Which feed produced the book — so a level's provenance survives into the row. */
  readonly producer: string;
}

export interface LevelBasisResult {
  ok: boolean;
  reason?: LevelBasisRefusal;
  basis?: LevelBasis;
}

/** Input shape, kept structural so this module imports no feed code and stays pure. */
export interface BookTopInput {
  bid: number | null | undefined;
  ask: number | null | undefined;
  capturedAtMs: number | null | undefined;
  producer: string;
}

function isPositiveFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Build a level basis from a book top, or REFUSE with a named reason.
 *
 * ⛔ `nowMs` is injected rather than read from the clock, so the age is testable and the
 * module stays pure — the same pure-with-injected-constants shape as
 * `computeRankRiskFloor` and the net-expectancy kernel.
 *
 * ⛔ ORDER OF CHECKS IS LOAD-BEARING and reads outward-in: absence, then shape, then
 * relationship, then age. A crossed book with a missing capture time must report
 * `crossed_book` — the structural fault — rather than `age_unknown`, because the two send a
 * reader to different places.
 */
export function buildLevelBasis(input: BookTopInput, nowMs: number): LevelBasisResult {
  const bidPresent = input.bid !== null && input.bid !== undefined;
  const askPresent = input.ask !== null && input.ask !== undefined;

  if (!bidPresent && !askPresent) return { ok: false, reason: 'no_book' };
  if (!bidPresent || !askPresent) return { ok: false, reason: 'one_sided_book' };
  if (!isPositiveFinite(input.bid) || !isPositiveFinite(input.ask)) {
    // A zero or negative side is not a side. `one_sided_book` would be the friendlier
    // reason and the wrong one: the feed sent us a value and it was unusable, which is a
    // different fault from a side never arriving.
    return { ok: false, reason: 'non_finite_side' };
  }
  if (input.bid >= input.ask) return { ok: false, reason: 'crossed_book' };
  if (!isPositiveFinite(input.capturedAtMs)) return { ok: false, reason: 'age_unknown' };

  return {
    ok: true,
    basis: {
      bid: input.bid,
      ask: input.ask,
      mid: (input.bid + input.ask) / 2,
      capturedAtMs: input.capturedAtMs,
      ageMs: nowMs - input.capturedAtMs,
      producer: input.producer,
    },
  };
}

/**
 * ⛔ THE ONE FUNCTION THAT DECIDES WHICH SIDE A LEVEL SITS ON.
 *
 * Long-only by construction, matching the system (`POST_AUDIT_ROADMAP`: short trading
 * deferred indefinitely; `venue-price-grid.ts` carries the same constraint as
 * `short_side_unexercised`). If shorts are ever taken, every arm here inverts and this
 * function is the ONE place that changes — which is the reason it exists as a function
 * rather than four expressions at four call sites.
 *
 * ⇒ There is deliberately NO branch that returns `basis.mid`. The midpoint is unreachable
 * from this function, so a level cannot be built on it by accident.
 */
export function priceForLevelRole(basis: LevelBasis, role: LevelRole): number {
  switch (role) {
    // A taker buy lifts the ask. This is the price we actually pay.
    case 'entry_taker':
      return basis.ask;
    // A resting post-only buy IS a bid. It never lifts the ask (BLOCKER-1).
    case 'entry_maker_resting':
      return basis.bid;
    // Both exits are SELLS for a long, so both hit the bid. They are OPPOSITE to a taker
    // entry by construction — which is why the level error is a FULL spread and not half,
    // and why R:R moves in opposite directions on the two legs.
    case 'stop':
    case 'target':
      return basis.bid;
    default: {
      // Exhaustiveness: a new role must be given a side here, not defaulted to one.
      const _never: never = role;
      throw new Error(`priceForLevelRole: unhandled LevelRole ${String(_never)}`);
    }
  }
}

/**
 * ⛔ THE REFUSAL FUNNEL — A COUNTER, NOT A LOG LINE (Langston BLOCKER-2, to F-G-1's 3/3
 * standard).
 *
 * A log line alone cannot answer "how often did this refuse?" once the log rotates — and
 * `B-XSTOCK-FEED-SANITY` spent a deploy cycle on exactly that: a guard that shipped INERT
 * while every deploy check passed, because nothing counted what it did.
 *
 * ⛔ AND THE COUNTER SHIPS WITH ITS POSITIVE CONTROL. A zero here is indistinguishable
 * from a counter that never fires until the counter has been SHOWN incrementing — that is
 * `#661` leg 3 and it is the defect this batch's sibling shipped once already. The unit
 * tests drive every refusal reason.
 */
const _refusals: Record<LevelBasisRefusal, number> = {
  no_book: 0,
  one_sided_book: 0,
  crossed_book: 0,
  non_finite_side: 0,
  age_unknown: 0,
};
let _accepted = 0;

export function recordLevelBasisOutcome(result: LevelBasisResult): void {
  if (result.ok) {
    _accepted++;
    return;
  }
  if (result.reason) _refusals[result.reason]++;
}

/**
 * The funnel, as an invariant rather than a bag of numbers: `attempted` must equal
 * `accepted` plus every refusal. A reader can check the arithmetic without trusting it.
 */
export function getLevelBasisFunnel(): {
  attempted: number;
  accepted: number;
  refused: number;
  byReason: Record<LevelBasisRefusal, number>;
} {
  const byReason = { ..._refusals };
  const refused = Object.values(byReason).reduce((a, b) => a + b, 0);
  return { attempted: _accepted + refused, accepted: _accepted, refused, byReason };
}

/** Test-only reset. Never called from the running system. */
export function __resetLevelBasisFunnelForTest(): void {
  _accepted = 0;
  (Object.keys(_refusals) as LevelBasisRefusal[]).forEach((k) => {
    _refusals[k] = 0;
  });
}
