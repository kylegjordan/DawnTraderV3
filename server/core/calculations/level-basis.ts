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
  /** bid > ask. A genuinely crossed book; no transactable side can be named. */
  | 'crossed_book'
  /**
   * bid === ask. ⛔ SPLIT OUT FROM `crossed_book` 2026-09-05 AND IT IS THE COMMON CASE, NOT
   * THE EXOTIC ONE. `price-cache.ts:408-409` and `:424-425` write `ask: existing?.ask ?? price,
   * bid: existing?.bid ?? price` — so on a FIRST write for a symbol BOTH SIDES BECOME THE MARK
   * and the cache reports a two-sided book that does not exist. A genuinely locked market and a
   * fabricated one are indistinguishable here, which is precisely why this refuses rather than
   * guesses — but it must not be reported as "crossed", because a reader chasing a crossed book
   * would go looking at the venue instead of at our own cache.
   */
  | 'locked_or_synthetic_book'
  /** A side is present but not a finite positive number. */
  | 'non_finite_side'
  /** The book carries no capture time, so its AGE cannot be stated — the age clause fails closed. */
  | 'age_unknown'
  /**
   * The book is older than the caller's declared ceiling.
   *
   * ⛔ ADDED 2026-09-05 ON LANGSTON'S CATCH, AND THE CATCH IS THAT THE CLAUSE WAS DECORATIVE.
   * r1 STATED `ageMs` and never ENFORCED it: a ten-minute-old book returned `ok:true` and the
   * module trusted every caller to look at a field it had no reason to look at. `age_unknown`
   * refuses on the ABSENCE of a stamp, which is a different thing from refusing on STALENESS.
   * ⇒ That is the funnel-that-shipped-inert shape one layer up — a guard present, readable,
   * and incapable of firing.
   *
   * ★ `maxAgeMs` IS THEREFORE A REQUIRED PARAMETER, NOT AN OPTION WITH A DEFAULT. A call site
   * cannot forget it, because omitting it does not compile. That is fail-closed BY CONSTRUCTION
   * rather than by discipline — and it buys the property WITHOUT inventing a threshold we have
   * not measured: the VALUE is the caller's to declare and is set from measurement later
   * (`3b.f-c`), while the OBLIGATION to declare one lands now.
   */
  | 'stale_book'
  /**
   * The book is two-sided and structurally valid but too WIDE to price a level from.
   *
   * ⛔⛔ ADDED 2026-09-05 FROM LIVE EVIDENCE, NOT FROM IMAGINATION. At the weekly xStock
   * shutdown (`2026-09-05T00:15Z` = Fri 20:15 ET), `B-XSTOCK-FEED-SANITY`'s guard recorded
   * real books as liquidity withdrew:
   *   ARKK/USD  bid 80.01 / ask 105.00 — spread 27.0% of mid, ask 22.2% ABOVE the last trade
   *   SLV/USD   bid 55.00 / ask  63.50 — spread 14.3% of mid, ask  6.1% above the last trade
   *   LI/USD    bid 11.70 / ask  12.60 — spread  7.4% of mid
   * ⇒ ★ EVERY ONE OF THOSE PASSES EVERY STRUCTURAL CHECK IN THIS MODULE: two-sided, both
   * positive, `bid < ask`, and freshly stamped. **A taker entry would have anchored on an ask
   * 22% above the last traded price**, and the age clause would have called it fresh — because
   * it WAS fresh. It was current, and it was untradeable.
   *
   * ★ THE POINT: `stale_book` catches a price that is OLD. Nothing was catching a price that is
   * WIDE. They are different faults and only one of them had a guard.
   *
   * ⚠️ AND THIS IS THE SAME REQUIREMENT LANGSTON ALREADY PRE-REGISTERED ON THE OTHER SIDE OF
   * THE TRADE: `F-G-2`'s brake names "a depth/plausibility guard on the bid" as a PRECONDITION
   * of switching exits to the bid. The exit side and the level side need the same guard; this
   * is that guard, arriving at level construction.
   */
  | 'implausible_spread';

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
export function buildLevelBasis(
  input: BookTopInput,
  nowMs: number,
  maxAgeMs: number,
  /**
   * ⛔ REQUIRED, LIKE `maxAgeMs`, AND FOR THE IDENTICAL REASON: a call site cannot forget a
   * parameter that does not compile when omitted. Expressed as a FRACTION OF THE MID so it is
   * comparable across a $12 token and a $127 one — an absolute cent value would be a different
   * rule per symbol, which is how a threshold silently becomes per-pair.
   * ⚠️ THE VALUE IS THE CALLER'S AND IS NOT INVENTED HERE. It is set from measurement at
   * `3b.f-c`; what lands now is the OBLIGATION to declare one.
   */
  maxSpreadFraction: number,
): LevelBasisResult {
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
  if (input.bid > input.ask) return { ok: false, reason: 'crossed_book' };
  if (input.bid === input.ask) return { ok: false, reason: 'locked_or_synthetic_book' };
  if (!isPositiveFinite(input.capturedAtMs)) return { ok: false, reason: 'age_unknown' };

  // ⛔ THE AGE CLAUSE, ENFORCED RATHER THAN STATED. Checked LAST, after every structural fault,
  // so a malformed book is never reported as merely old. A negative age (a capture stamped in
  // the future — clock skew between the venue and this box) is NOT stale and is NOT silently
  // accepted as fresh either: it is a structural fault about the stamp, so it refuses as
  // `age_unknown`, the reason that already means "this stamp cannot date anything".
  const ageMs = nowMs - input.capturedAtMs;
  if (ageMs < 0) return { ok: false, reason: 'age_unknown' };
  if (ageMs > maxAgeMs) return { ok: false, reason: 'stale_book' };

  // ⛔ PLAUSIBILITY, LAST — a wide book is a real book, so this is the weakest fault and must
  // not mask a structural one. Measured against the MID rather than either side, because the
  // question "is this book tradeable?" is symmetric and neither side is privileged.
  const mid = (input.bid + input.ask) / 2;
  if ((input.ask - input.bid) / mid > maxSpreadFraction) {
    return { ok: false, reason: 'implausible_spread' };
  }

  return {
    ok: true,
    basis: {
      bid: input.bid,
      ask: input.ask,
      mid,
      capturedAtMs: input.capturedAtMs,
      ageMs,
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
/**
 * ⛔⛔ KEYED, NOT FLAT — LANGSTON'S CATCH, AND r1 WAS FLAT.
 *
 * Every sibling counter in this system is keyed by lane and class (e.g.
 * `recordActivePreSqeReject(mode, assetClass, …)`). r1's funnel was a pair of module-level
 * singletons — and W-1 wires BOTH the active orchestrator and the VTS runner, so a VTS
 * xStock refusal and an active crypto refusal would have landed in ONE bucket and neither
 * would have been readable. A counter that aggregates two populations answers questions
 * about neither.
 *
 * ⇒ The key is `<lane>:<assetClass>`, both REQUIRED, so a call site cannot omit the
 * dimension that makes the number mean something.
 */
export type LevelBasisLane = 'active' | 'vts';

/**
 * ⛔⛔ THE RUNG IS A REQUIRED KEY DIMENSION, AND IT IS REQUIRED FOR THE SAME REASON `lane` AND
 * `assetClass` ARE — Langston's condition 1 on `8c` Step 2, 2026-09-13.
 *
 * `8c` makes the level shadow call D3's full ladder (`selectTouchPrice`) instead of assessing the
 * book alone. That changes what `attempted` COUNTS: before, one attempt was one book assessment;
 * after, one attempt is one ladder walk that may fall through to the ticker. **Those are two
 * different populations and a reader comparing them would be comparing two instruments.**
 *
 * ⇒ Rather than forbid the pooling in prose, the key makes it IMPOSSIBLE: `book` counts the book
 * rung's own verdict and `ladder` counts the ladder's overall verdict, in separate cells, so the
 * book rung's series continues uninterrupted across the change and the new number arrives beside
 * it instead of on top of it. **A boundary that is a key cannot be forgotten; a boundary that is a
 * date in a document can.**
 */
export type LevelBasisRung = 'book' | 'ladder';

export interface LevelBasisFunnelKey {
  lane: LevelBasisLane;
  assetClass: string;
}

/**
 * ⛔ THE RUNG IS A SEPARATE KEY TYPE, NOT A FIELD ON THE SHARED ONE — and tsc caught me trying it
 * the other way. `LevelBasisFunnelKey` is shared by three recorders: this funnel, the side-age
 * probe and the feed-agreement probe. The latter two are not rung-scoped and never will be, so a
 * required `rung` on the shared type would have forced a meaningless value at two call sites that
 * have no rung to name — which is how a key dimension stops meaning anything.
 */
export interface LevelBasisRungKey extends LevelBasisFunnelKey {
  rung: LevelBasisRung;
}

/**
 * ⛔ `book_not_eligible` is a FUNNEL reason and deliberately NOT a `LevelBasisRefusal`: this module
 * never judges eligibility — the caller does, and `touch-price.ts` owns that policy. Widening
 * `LevelBasisRefusal` would let a pure basis assessment return a verdict it has no standing to make.
 */
export type FunnelRefusal = LevelBasisRefusal | 'book_not_eligible';

/** Structural, so a `LevelBasisResult` satisfies it without the recorder depending on that shape. */
export interface FunnelOutcome {
  ok: boolean;
  reason?: FunnelRefusal;
}

interface FunnelCell {
  accepted: number;
  byReason: Record<FunnelRefusal, number>;
}

function emptyCell(): FunnelCell {
  return {
    accepted: 0,
    byReason: {
      no_book: 0,
      one_sided_book: 0,
      crossed_book: 0,
      locked_or_synthetic_book: 0,
      non_finite_side: 0,
      age_unknown: 0,
      stale_book: 0,
      implausible_spread: 0,
      book_not_eligible: 0,
    },
  };
}

const _funnel = new Map<string, FunnelCell>();

function keyOf(k: LevelBasisRungKey): string {
  return `${k.lane}:${k.assetClass}:${k.rung}`;
}

export function recordLevelBasisOutcome(key: LevelBasisRungKey, result: FunnelOutcome): void {
  const id = keyOf(key);
  let cell = _funnel.get(id);
  if (!cell) {
    cell = emptyCell();
    _funnel.set(id, cell);
  }
  if (result.ok) {
    cell.accepted++;
    return;
  }
  if (result.reason) cell.byReason[result.reason]++;
}

export interface LevelBasisFunnelRow {
  key: string;
  attempted: number;
  accepted: number;
  refused: number;
  byReason: Record<LevelBasisRefusal, number>;
}

/**
 * The funnel, as an invariant rather than a bag of numbers: for every row, `attempted`
 * must equal `accepted` plus every refusal. A reader can check the arithmetic without
 * trusting it.
 *
 * ⛔ RETURNS ROWS, NEVER A TOTAL. A single summed figure across lanes and classes is the
 * very thing the keying exists to prevent, so this does not offer one.
 */
export function getLevelBasisFunnel(): LevelBasisFunnelRow[] {
  return [...(_funnel.entries())].map(([key, cell]) => {
    const byReason = { ...cell.byReason };
    const refused = Object.values(byReason).reduce((a, b) => a + b, 0);
    return { key, attempted: cell.accepted + refused, accepted: cell.accepted, refused, byReason };
  });
}

/** One row, or `undefined` when that lane/class/rung has never been attempted. */
export function getLevelBasisFunnelRow(key: LevelBasisRungKey): LevelBasisFunnelRow | undefined {
  return getLevelBasisFunnel().find((r) => r.key === keyOf(key));
}

/** Test-only reset. Never called from the running system. */
export function __resetLevelBasisFunnelForTest(): void {
  _funnel.clear();
}

/**
 * ⛔⛔ OBSERVATION CEILINGS — FOR THE SHADOW ARM ONLY. **THESE ARE NOT LIVE GATES AND MUST NOT
 * BECOME ONE BY DEFAULT.**
 *
 * Nothing gates on these: at this commit the basis is built and COUNTED, and no level is
 * derived from it. They exist so the shadow arm has a declared ceiling to declare — the
 * parameters are REQUIRED by construction, which is the whole point, so an observation run
 * still has to name its numbers.
 *
 * ★ THEY ARE DELIBERATELY GENEROUS, AND THAT MAKES THE MEASUREMENT READABLE IN ONE DIRECTION:
 * a refusal under these ceilings is a book that is structurally broken or grossly wide, so the
 * `accepted` count is an **UPPER BOUND** on what any tighter live gate would accept. A tighter
 * gate can only accept fewer. That is a true and useful statement without pretending either
 * number is calibrated.
 *
 * ⛔ THE LIVE VALUES ARE DB-GOVERNED AND ARE OWED TO `3b.f-c`, which is measuring exactly this.
 * ⚠️ WHEN THEY LAND THEY ARE RESOLVED FROM THE DB AND FAIL HARD ON AN EMPTY READ — never
 * silently defaulted to these (`CLAUDE.md`: no hard-coded fallbacks for DB-governed settings).
 * ⇒ These two constants are then DELETED, not repurposed.
 */
export const LEVEL_BASIS_OBSERVATION_MAX_AGE_MS = 60_000;
export const LEVEL_BASIS_OBSERVATION_MAX_SPREAD_FRACTION = 0.50;


/* ────────────────────────────────────────────────────────────────────────────
 * SIDE-AGE OBSERVATION — HOW OLD IS THE QUOTE WE WOULD BUILD A LEVEL FROM?
 *
 * ⛔ WHY THIS IS NOT THE ARCHIVE. I answered "how fresh is our pricing" from the durable ticker
 * archive and Langston refused it as a proxy: the archiver is a DIFFERENT SUBSCRIBER — its own
 * socket, its own 4 s write throttle, its own shards — so it bounds the VENUE'S cadence and says
 * nothing about the entry THIS process holds when a level is built. Different quantities; only
 * the second one can set a gate.
 *
 * ⛔⛔ A HISTOGRAM, NOT A RESERVOIR. A reservoir SAMPLES, and any sampling scheme here would have
 * to be defended against the exact length-bias that made the archive number wrong by ~65x. A
 * histogram counts every observation. Quantiles are reported as bucket RANGES, never interpolated
 * points — inventing precision the instrument lacks is the same sin one level down.
 *
 * ⚠️ THREE OUTCOMES, KEPT APART, because collapsing them is #546's shape:
 *   absent (no cache entry) · unstamped (entry exists, no writer ever supplied a side) ·
 *   observed. AN UNSTAMPED ENTRY IS NOT AGE 0 — age 0 is the freshest possible reading and
 *   "we never observed a side" is the least informative one.
 *
 * ★★ WHY THREE TERMS AND NOT ONE — LANGSTON, 2026-09-06, CORRECTING ME.
 * I proposed gating on age AND feed-not-live. ⛔ A TERM ANDED ONTO A FAIL-CLOSED GATE CAN ONLY
 * WIDEN IT, and that conjunction opens the one door we most need shut: PER-SYMBOL SUBSCRIPTION
 * DEATH BEHIND A HEALTHY SOCKET — a resubscribe that did not take, a delist, a silent drop. The
 * feed reads green, the other ~460 symbols are fine, and that symbol's quote is a memory we may
 * hold a position against. Age-only would refuse it; my conjunction would have passed it.
 * ⇒ THREE CELLS, NOT TWO: (a) old + feed dead -> refuse, whole-feed · (b) old + feed live ->
 * PER-SYMBOL SUSPICION, NO AUTOMATIC PASS · (c) fresh -> transact.
 *
 * ★ AND THE TERM THAT DISCRIMINATES INSIDE (b) IS THE SYMBOL'S OWN EXPECTED INTER-ARRIVAL, not
 * feed liveness. "Quiet" is symbol-specific: 20 minutes silent is normal for USDC/USD and
 * alarming for BTC/USD. Age-only fails because it measures every symbol against ONE CONSTANT —
 * the same defect that produced this batch's decile-10 artifact. Feed liveness is the THIRD term
 * and it is a CLASSIFIER, not a gate.
 *
 * ⛔⛔ LIVENESS IS COUNTED IN DISTINCT SYMBOLS, NEVER AS A FEED-WIDE LAST-MESSAGE AGE. One chatty
 * name keeps a recency gauge green — measured proof from this batch: THREE stablecoins carried
 * decile 10 of a 460-symbol pool. Counting symbols is the only form of the control that works.
 *
 * ⛔ EVERY CLOCK IS CARRIED RAW AND SEPARATE — never a stored difference, never a precomputed
 * "live" boolean. Langston: "A delta can't be re-derived when one side turns out to be the wrong
 * object." This batch has already had two numbers turn out to be about the wrong population.
 *
 * ⛔ NOTHING GATES ON ANY OF THIS. Shadow arm only. No threshold is pre-registered until the
 * read-site distribution exists and the refusal rate has been measured PER CELL — pooled would be
 * carried by the quiet tail exactly as the repeat rate was.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * WHERE in the pipeline the attempt happened. ⛔ Langston's condition 1: quantiles come out PER
 * STAGE, never classwide. A stage in this union that is never recorded is ABSENT from the rows —
 * the honest rendering of "not instrumented", which is not the same as zero.
 */
export type LevelBasisStage =
  | 'active_signal_birth'
  | 'vts_signal_birth'
  | 'rtb_refresh'
  | 'exit_trigger';

/** ⛔ RAW FIELDS ONLY. The recorder derives; the call site never hands over a difference. */
export interface SideAgeAttempt {
  stage: LevelBasisStage;
  symbol: string;
  nowMs: number;
  cacheEntryPresent: boolean;
  sidesCapturedAtMs: number | null;
  venueObservedAtMs: number | null;
  symbolLastMessageAtMs: number | null;
  /** DISTINCT symbols with ANY cache write inside the trailing window. */
  feedDistinctSymbolsInWindow: number | null;
  /**
   * ⭐⭐ DISTINCT symbols the venue PUSHED to us in the same window — the liveness term that can
   * actually see a dead socket.
   * ⛔ BOTH COUNTS TRAVEL, never just this one: their DIFFERENCE is what says whether the REST
   * poller is masking a WebSocket outage. The first version of this instrument recorded only the
   * any-write count, which tracked OUR OWN POLL LOOP and could never have detected the failure it
   * was built for — measured on staging within minutes of deploy, 161 of 170 entries were
   * REST-sourced. Found by reading the live numbers, not the code.
   */
  feedDistinctWsSymbolsInWindow: number | null;
  feedWindowMs: number | null;
}

/**
 * Upper edges in ms. A value lands in the first bucket whose edge it is strictly below.
 *
 * ⛔⛔ 15 s AND 45 s WERE ADDED 2026-09-06 BECAUSE THE FIRST READING HAD NO RESOLUTION WHERE IT
 * MATTERED. Every observation — 1,634 active and 546 VTS — landed in the single `30000-60000`
 * bucket at BOTH p50 and p95, which is not evidence of a tight distribution: it is evidence that
 * the bucket was wider than the thing being measured. **A histogram whose modal bucket contains
 * everything has told you nothing except where to put the next edge.**
 *
 * ★ THE EDGES ARE CHOSEN AGAINST THE CACHE'S OWN REFRESH CADENCE (`price-cache.ts:95-98`:
 * 2 s / 15 s / 30 s / 60 s), because that is what the distribution is made of — the ages are one
 * poll cycle, not market staleness. ⇒ **edges at 15 s, 30 s, 45 s and 60 s let a reader see WHICH
 * bucket's cadence a symbol is being served by**, which the previous edges could not distinguish.
 * ⚠️ Deliberately NOT tuned to make the numbers look better: 45 s is a midpoint with no cadence of
 * its own, and it is there precisely so the 30 s and 60 s populations cannot hide in one cell.
 */
export const SIDE_AGE_BUCKET_EDGES_MS: readonly number[] = [
  1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 45_000, 60_000,
  120_000, 300_000, 900_000, 1_800_000, 3_600_000,
];

function newBuckets(): number[] { return new Array(SIDE_AGE_BUCKET_EDGES_MS.length + 1).fill(0); }

function bucketIndex(v: number): number {
  const i = SIDE_AGE_BUCKET_EDGES_MS.findIndex((edge) => v < edge);
  return i < 0 ? SIDE_AGE_BUCKET_EDGES_MS.length : i;
}

function bucketLabel(i: number): string {
  const lo = i === 0 ? 0 : SIDE_AGE_BUCKET_EDGES_MS[i - 1];
  const hi = i === SIDE_AGE_BUCKET_EDGES_MS.length ? null : SIDE_AGE_BUCKET_EDGES_MS[i];
  return hi === null ? String(lo) + '+' : String(lo) + '-' + String(hi);
}

interface SideAgeCell {
  observed: number;
  absent: number;
  unstamped: number;
  /**
   * ⛔ COUNTED SEPARATELY BECAUSE THE HISTOGRAM CANNOT SHOW IT. A negative age and a zero age
   * both land in the first bucket and leave maxMs untouched, so without this field the
   * "recorded, not clamped" promise above is UNVERIFIABLE — a clamp could be added and every
   * test would still pass. Found by asking whether the test would come out differently if the
   * code were wrong; it would not have.
   */
  negative: number;
  maxMs: number;
  buckets: number[];
  venueStampPresent: number;
  venueStampAbsent: number;
  symbolGapBuckets: number[];
  symbolGapObserved: number;
  symbolGapUnknown: number;
  feedCountN: number;
  feedCountMin: number | null;
  feedCountMax: number | null;
  wsCountMin: number | null;
  wsCountMax: number | null;
  feedWindowMs: number | null;
}

function emptySideAgeCell(): SideAgeCell {
  return {
    observed: 0, absent: 0, unstamped: 0, negative: 0, maxMs: 0, buckets: newBuckets(),
    venueStampPresent: 0, venueStampAbsent: 0,
    symbolGapBuckets: newBuckets(), symbolGapObserved: 0, symbolGapUnknown: 0,
    feedCountN: 0, feedCountMin: null, feedCountMax: null,
    wsCountMin: null, wsCountMax: null, feedWindowMs: null,
  };
}

/** Per-symbol gap summary — bounded by the symbol universe, four numbers each. */
interface SymbolGapSummary { n: number; sum: number; sumsq: number; max: number }

const _sideAge = new Map<string, SideAgeCell>();
const _symbolGap = new Map<string, SymbolGapSummary>();

function sideAgeKey(k: LevelBasisFunnelKey, stage: LevelBasisStage): string {
  return k.lane + ':' + k.assetClass + ':' + stage;
}

/**
 * ⛔ A NEGATIVE AGE IS RECORDED, NOT CLAMPED. It means the capture stamp sits in this process's
 * future — clock skew, or a venue stamp differenced against ours — and it is exactly what
 * capturing the venue timestamp exists to expose. Clamping to zero would report the healthiest
 * possible number for the unhealthiest possible state.
 */
export function recordSideAgeAttempt(key: LevelBasisFunnelKey, a: SideAgeAttempt): void {
  const id = sideAgeKey(key, a.stage);
  let cell = _sideAge.get(id);
  if (!cell) { cell = emptySideAgeCell(); _sideAge.set(id, cell); }

  if (a.feedDistinctSymbolsInWindow !== null) {
    cell.feedCountN++;
    const c = a.feedDistinctSymbolsInWindow;
    cell.feedCountMin = cell.feedCountMin === null ? c : Math.min(cell.feedCountMin, c);
    cell.feedCountMax = cell.feedCountMax === null ? c : Math.max(cell.feedCountMax, c);
  }
  if (a.feedDistinctWsSymbolsInWindow !== null) {
    const w = a.feedDistinctWsSymbolsInWindow;
    cell.wsCountMin = cell.wsCountMin === null ? w : Math.min(cell.wsCountMin, w);
    cell.wsCountMax = cell.wsCountMax === null ? w : Math.max(cell.wsCountMax, w);
  }
  if (a.feedWindowMs !== null) cell.feedWindowMs = a.feedWindowMs;

  if (a.symbolLastMessageAtMs === null) {
    cell.symbolGapUnknown++;
  } else {
    const gap = a.nowMs - a.symbolLastMessageAtMs;
    cell.symbolGapObserved++;
    cell.symbolGapBuckets[bucketIndex(gap)]++;
    let sum = _symbolGap.get(a.symbol);
    if (!sum) { sum = { n: 0, sum: 0, sumsq: 0, max: 0 }; _symbolGap.set(a.symbol, sum); }
    sum.n++; sum.sum += gap; sum.sumsq += gap * gap;
    if (gap > sum.max) sum.max = gap;
  }

  if (!a.cacheEntryPresent) { cell.absent++; return; }
  if (a.sidesCapturedAtMs === null) { cell.unstamped++; return; }

  if (a.venueObservedAtMs === null) cell.venueStampAbsent++; else cell.venueStampPresent++;

  const ageMs = a.nowMs - a.sidesCapturedAtMs;
  cell.observed++;
  if (ageMs < 0) cell.negative++;
  if (ageMs > cell.maxMs) cell.maxMs = ageMs;
  cell.buckets[bucketIndex(ageMs)]++;
}

export interface SideAgeRow {
  key: string;
  attempted: number;
  observed: number;
  absent: number;
  unstamped: number;
  negative: number;
  maxMs: number;
  histogram: Record<string, number>;
  p50Bucket: string | null;
  p95Bucket: string | null;
  venueStampPresent: number;
  venueStampAbsent: number;
  symbolGapObserved: number;
  symbolGapUnknown: number;
  symbolGapHistogram: Record<string, number>;
  feedDistinctSymbolsMin: number | null;
  feedDistinctSymbolsMax: number | null;
  feedDistinctWsSymbolsMin: number | null;
  feedDistinctWsSymbolsMax: number | null;
  feedWindowMs: number | null;
}

function quantileBucket(buckets: number[], total: number, q: number): string | null {
  if (total === 0) return null;
  const target = q * total;
  let cum = 0;
  for (let i = 0; i < buckets.length; i++) {
    cum += buckets[i];
    if (cum >= target) return bucketLabel(i);
  }
  return bucketLabel(buckets.length - 1);
}

function histogramOf(buckets: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  buckets.forEach((n, i) => { h[bucketLabel(i)] = n; });
  return h;
}

/**
 * ⛔ ROWS, NEVER A TOTAL — and now keyed by STAGE as well as lane and class, because a figure
 * pooled across stages describes none of them.
 */
export function getSideAgeRows(): SideAgeRow[] {
  return [...(_sideAge.entries())].map(([key, c]) => ({
    key,
    attempted: c.observed + c.absent + c.unstamped,
    observed: c.observed,
    absent: c.absent,
    unstamped: c.unstamped,
    negative: c.negative,
    maxMs: c.maxMs,
    histogram: histogramOf(c.buckets),
    p50Bucket: quantileBucket(c.buckets, c.observed, 0.5),
    p95Bucket: quantileBucket(c.buckets, c.observed, 0.95),
    venueStampPresent: c.venueStampPresent,
    venueStampAbsent: c.venueStampAbsent,
    symbolGapObserved: c.symbolGapObserved,
    symbolGapUnknown: c.symbolGapUnknown,
    symbolGapHistogram: histogramOf(c.symbolGapBuckets),
    feedDistinctSymbolsMin: c.feedCountMin,
    feedDistinctSymbolsMax: c.feedCountMax,
    feedDistinctWsSymbolsMin: c.wsCountMin,
    feedDistinctWsSymbolsMax: c.wsCountMax,
    feedWindowMs: c.feedWindowMs,
  }));
}

export interface SymbolGapRow { symbol: string; n: number; meanMs: number; sdMs: number; maxMs: number }

/**
 * ⭐ THE SYMBOL'S OWN EXPECTED INTER-ARRIVAL, DERIVED AT THE READ SITE — not from the archive.
 * ⛔ Langston's condition 3 binds the NORMALISER as hard as it binds the threshold: an
 * archive-derived "normal quiet" would smuggle the same wrong-population inference back in
 * through the side door.
 */
export function getSymbolGapRows(): SymbolGapRow[] {
  return [...(_symbolGap.entries())].map(([symbol, s]) => {
    const mean = s.sum / s.n;
    const variance = Math.max(0, s.sumsq / s.n - mean * mean);
    return { symbol, n: s.n, meanMs: mean, sdMs: Math.sqrt(variance), maxMs: s.max };
  });
}

/** Test-only reset. Never called from the running system. */
export function __resetSideAgeForTest(): void {
  _sideAge.clear();
  _symbolGap.clear();
}

/* ────────────────────────────────────────────────────────────────────────────
 * TICKER vs ORDER BOOK — DO THE TWO FEEDS AGREE ON THE TRANSACTABLE PRICE?
 *
 * ⛔ WHY THIS EXISTS AND WHY IT CANNOT BE DONE FROM HISTORY. Kyle asked for this comparison
 * directly: *"we need to know what we're working with, and whether or not the data matches up."*
 * **The order book is NEVER PERSISTED** — it lives only in memory, only while the process runs,
 * and only for the symbols we hold or promote. The ticker IS persisted. ⇒ **there is no pair of
 * stored rows to compare, and no amount of querying the archive can produce one.** The two feeds
 * can only be compared by reading BOTH AT THE SAME INSTANT, in-process, which is this.
 *
 * ⛔⛔ THE CONCLUSION IS ONE-DIRECTIONAL, PRE-REGISTERED BEFORE ANY DATA (Langston's condition on
 * the divergence study, and it binds the reading of this instrument):
 *   **DIVERGENCE ⇒ DISPOSITIVE.** If the two disagree on a symbol where both exist, the ticker's
 *   two sides are not the book's two sides, and anything setting a level from the ticker is
 *   setting it somewhere the book says you cannot trade.
 *   ⛔ **AGREEMENT ⇒ INCONCLUSIVE, AND MAY NEVER BE READ AS A LICENCE.** Both feeds coexist ONLY
 *   where the book is subscribed — the hot set, i.e. what we already hold or promote, i.e. the
 *   most liquid names. **That is exactly the population where they would agree anyway.** It says
 *   nothing about the ~200 symbols carrying a ticker and no book.
 *
 * ⛔ NO TOLERANCE IS BUILT IN. The difference is recorded in basis points and bucketed; what
 * counts as "agreement" is a judgement made LATER, from the distribution, by a human. A threshold
 * chosen now would be chosen before seeing the data, which is the thing pre-registration exists
 * to prevent — and it would decide the answer by picking the bucket edge.
 *
 * ⛔ COVERAGE IS COUNTED SEPARATELY FROM AGREEMENT, because "we could not compare" and "they
 * matched" are different states and collapsing them reports the healthiest possible reading for
 * the least informative one. Four outcomes: both present · book only · ticker only · neither.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Absolute difference buckets in BASIS POINTS (1 bp = 0.01%). */
export const FEED_AGREEMENT_BPS_EDGES: readonly number[] = [
  0.0001, 1, 2, 5, 10, 25, 50, 100, 250, 1000,
];

export interface FeedAgreementSample {
  assetClass: string;
  /** Top-of-book from the reconstructed order book. `null` when no book exists for the symbol. */
  bookBid: number | null;
  bookAsk: number | null;
  /** The two sides carried on the ticker-fed shared cache. `null` when no entry/sides exist. */
  tickerBid: number | null;
  tickerAsk: number | null;
}

interface AgreementCell {
  bothPresent: number;
  bookOnly: number;
  tickerOnly: number;
  neither: number;
  /** |ticker − book| in bps, bucketed, per side. */
  bidBuckets: number[];
  askBuckets: number[];
  /** Direction, counted rather than averaged: an average of signed errors hides a two-sided spread. */
  bidTickerHigher: number;
  bidTickerLower: number;
  bidExact: number;
  askTickerHigher: number;
  askTickerLower: number;
  askExact: number;
  /**
   * ⛔ THE ONE THAT WOULD BE A REAL DEFECT: the two feeds CROSSED against each other — the
   * ticker's bid at or above the book's ask, or the ticker's ask at or below the book's bid.
   * That is not a difference of degree; it means one feed says you can sell where the other says
   * you can buy, and a level built on either is unsafe.
   */
  crossedAgainstBook: number;
  maxBidBps: number;
  maxAskBps: number;
}

function newAgreementBuckets(): number[] {
  return new Array(FEED_AGREEMENT_BPS_EDGES.length + 1).fill(0);
}

function emptyAgreementCell(): AgreementCell {
  return {
    bothPresent: 0, bookOnly: 0, tickerOnly: 0, neither: 0,
    bidBuckets: newAgreementBuckets(), askBuckets: newAgreementBuckets(),
    bidTickerHigher: 0, bidTickerLower: 0, bidExact: 0,
    askTickerHigher: 0, askTickerLower: 0, askExact: 0,
    crossedAgainstBook: 0, maxBidBps: 0, maxAskBps: 0,
  };
}

function agreementBucketIndex(bps: number): number {
  const i = FEED_AGREEMENT_BPS_EDGES.findIndex((edge) => bps < edge);
  return i < 0 ? FEED_AGREEMENT_BPS_EDGES.length : i;
}

function agreementBucketLabel(i: number): string {
  const lo = i === 0 ? 0 : FEED_AGREEMENT_BPS_EDGES[i - 1];
  const hi = i === FEED_AGREEMENT_BPS_EDGES.length ? null : FEED_AGREEMENT_BPS_EDGES[i];
  if (i === 0) return 'exact';
  return hi === null ? `${lo}bp+` : `${lo}-${hi}bp`;
}

const _agreement = new Map<string, AgreementCell>();

export function recordFeedAgreement(s: FeedAgreementSample): void {
  let cell = _agreement.get(s.assetClass);
  if (!cell) { cell = emptyAgreementCell(); _agreement.set(s.assetClass, cell); }

  const haveBook = s.bookBid !== null && s.bookAsk !== null
    && Number.isFinite(s.bookBid) && Number.isFinite(s.bookAsk)
    && (s.bookBid as number) > 0 && (s.bookAsk as number) > 0;
  const haveTicker = s.tickerBid !== null && s.tickerAsk !== null
    && Number.isFinite(s.tickerBid) && Number.isFinite(s.tickerAsk)
    && (s.tickerBid as number) > 0 && (s.tickerAsk as number) > 0;

  if (!haveBook && !haveTicker) { cell.neither++; return; }
  if (!haveBook) { cell.tickerOnly++; return; }
  if (!haveTicker) { cell.bookOnly++; return; }

  cell.bothPresent++;
  const bb = s.bookBid as number, ba = s.bookAsk as number;
  const tb = s.tickerBid as number, ta = s.tickerAsk as number;

  // ⛔ CROSSED CHECK FIRST — it is the qualitative failure and must not be diluted into a bucket.
  if (tb >= ba || ta <= bb) cell.crossedAgainstBook++;

  const bidBps = Math.abs(tb - bb) / bb * 10_000;
  const askBps = Math.abs(ta - ba) / ba * 10_000;
  cell.bidBuckets[agreementBucketIndex(bidBps)]++;
  cell.askBuckets[agreementBucketIndex(askBps)]++;
  if (bidBps > cell.maxBidBps) cell.maxBidBps = bidBps;
  if (askBps > cell.maxAskBps) cell.maxAskBps = askBps;

  if (tb > bb) cell.bidTickerHigher++; else if (tb < bb) cell.bidTickerLower++; else cell.bidExact++;
  if (ta > ba) cell.askTickerHigher++; else if (ta < ba) cell.askTickerLower++; else cell.askExact++;
}

export interface FeedAgreementRow {
  assetClass: string;
  attempted: number;
  bothPresent: number;
  bookOnly: number;
  tickerOnly: number;
  neither: number;
  bidHistogram: Record<string, number>;
  askHistogram: Record<string, number>;
  bidDirection: { tickerHigher: number; tickerLower: number; exact: number };
  askDirection: { tickerHigher: number; tickerLower: number; exact: number };
  crossedAgainstBook: number;
  maxBidBps: number;
  maxAskBps: number;
}

export function getFeedAgreementRows(): FeedAgreementRow[] {
  return [...(_agreement.entries())].map(([assetClass, c]) => {
    const hist = (b: number[]) => {
      const h: Record<string, number> = {};
      b.forEach((n, i) => { h[agreementBucketLabel(i)] = n; });
      return h;
    };
    return {
      assetClass,
      attempted: c.bothPresent + c.bookOnly + c.tickerOnly + c.neither,
      bothPresent: c.bothPresent,
      bookOnly: c.bookOnly,
      tickerOnly: c.tickerOnly,
      neither: c.neither,
      bidHistogram: hist(c.bidBuckets),
      askHistogram: hist(c.askBuckets),
      bidDirection: { tickerHigher: c.bidTickerHigher, tickerLower: c.bidTickerLower, exact: c.bidExact },
      askDirection: { tickerHigher: c.askTickerHigher, tickerLower: c.askTickerLower, exact: c.askExact },
      crossedAgainstBook: c.crossedAgainstBook,
      maxBidBps: c.maxBidBps,
      maxAskBps: c.maxAskBps,
    };
  });
}

/** Test-only reset. Never called from the running system. */
export function __resetFeedAgreementForTest(): void {
  _agreement.clear();
}
