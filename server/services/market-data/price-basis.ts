/**
 * B-PRICE-SIDE-BY-JOB r5 — P-7c (decision D3): THE ONE MAPPING FROM "WHICH HANDLER PRODUCED THIS PRICE"
 * TO "WHICH SOURCE IT IS" — order-book top, best-bid/offer ticker, default ticker, REST ticker, venue close.
 *
 * ⛔ WHY A MAPPING AND NOT A NEW COLUMN. Every price that reaches a decision already records its PRODUCER —
 * `closed_trades.entry_price_producer` / `exit_price_producer`, and `LevelBasis.producer` — from a CLOSED
 * union (`PriceProducer`, live-pricing-adapter.ts). The basis is a pure function of that producer. Storing it
 * again beside the producer would create two records of one fact that can drift apart (#641). So the basis is
 * DERIVED, here, once — and `Record<PriceProducer, …>` makes a new producer without a declared basis a COMPILE
 * ERROR, the same "required + closed" guarantee the producer union already gives (#546).
 *
 * ⛔ WHAT A BASIS DOES *NOT* SAY: which SIDE a decision read (bid, ask or mid) and whether a published price was
 * a midpoint or a last trade. Where a producer name carries a `_mid` / `_last` suffix, that suffix states the kind —
 * but not every producer is split by kind: `kraken_rest_poller` is not (see the `PriceProducer` union's comment), so a
 * poller price's kind cannot be read from its producer. The SIDE a decision reads is stamped at the decision site when
 * the decision layer (OBJ-8) switches it on. A basis names the SOURCE.
 *
 * ⚠️ ERA, STATED: `kraken_ws_ticker_*` maps to `ticker_bbo` because P-7a subscribes the crypto trading ticker with
 * `event_trigger: 'bbo'`. Rows written BEFORE the P-7a deploy came from the default trade-triggered ticker; a
 * reader of old rows applies the deploy boundary, not this map. The boundary (the OBJ-7 deploy sha and UTC) is
 * recorded in `Scope Files/PRICING_DECISIONS_2026-09-11.md` under D3.
 *
 * ⛔ TYPE-ONLY IMPORT: erased at runtime, so this stays a runtime leaf like `mark-kind.ts`.
 */
import type { PriceProducer } from '../live-pricing-adapter';

/**
 * The live SOURCE of an observed price.
 * - `book_top`         — the top of our maintained WS order book.
 * - `book_depth`       — a walk over that book's levels (a fill ESTIMATE, not a touch price).
 * - `ticker_bbo`       — the crypto WS ticker, best-bid/offer-triggered (P-7a).
 * - `ticker_default`   — a WS ticker on the venue's default trigger (the xStock equities ticker).
 * - `rest_ticker`      — a REST ticker read (engine fallback or poller). Pre-audit r5 A-9.8.
 * - `archive_ticker_snap` — a walk over the 4-second-throttled xStock ticker snapshot table (a fill ESTIMATE).
 * - `venue_close`      — a venue bar close. No producer emits it; the bar-lane level sites stamp it (OBJ-8).
 */
export type PriceBasis =
  | 'book_top'
  | 'book_depth'
  | 'ticker_bbo'
  | 'ticker_default'
  | 'rest_ticker'
  | 'archive_ticker_snap'
  | 'venue_close';

/**
 * `not_an_observation` — the number was NOT observed from the venue at the moment it is used: a re-serve of a
 * cached price, a seed, a mock, a reused position price, or no price at all. It must never be read as a live
 * basis; a decision that needs a live price must refuse on it.
 */
export type PriceBasisOrNone = PriceBasis | 'not_an_observation';

export const BASIS_BY_PRODUCER: Readonly<Record<PriceProducer, PriceBasisOrNone>> = Object.freeze({
  kraken_ws_ticker_mid: 'ticker_bbo',
  kraken_ws_ticker_last: 'ticker_bbo',
  kraken_ws_book_mid: 'book_top',
  kraken_ws_ticker_v1: 'ticker_default', // unreachable (#742); mapped so the record stays total
  kraken_equities_ws_mid: 'ticker_default',
  kraken_equities_ws_last: 'ticker_default',
  kraken_rest_engine_fallback_mid: 'rest_ticker',
  kraken_rest_engine_fallback_last: 'rest_ticker',
  kraken_rest_poller: 'rest_ticker',
  kraken_rest_rate_limited_reserve: 'not_an_observation',
  xstock_rest_gate_reserve: 'not_an_observation',
  last_known_good_all_apis_failed: 'not_an_observation',
  last_known_good_fetch_exception: 'not_an_observation',
  last_known_good_reserve: 'not_an_observation',
  entry_seed: 'not_an_observation',
  mock: 'not_an_observation',
  crypto_ws_book_walk: 'book_depth',
  xstock_ticker_snap_walk: 'archive_ticker_snap',
  position_entry_price_reused: 'not_an_observation',
  no_price_produced: 'not_an_observation',
});

/** The basis of a recorded producer. */
export function basisOfProducer(producer: PriceProducer): PriceBasisOrNone {
  return BASIS_BY_PRODUCER[producer];
}

/**
 * B-PRICE-SIDE-BY-JOB r5 P-7k: WHICH QUANTITY each producer's price is — the kind its `_mid` / `_last` suffix states,
 * written out, because two live producers carry no suffix. TOTAL over `PriceProducer`, like `BASIS_BY_PRODUCER`, so a
 * new producer must declare its kind. `null` = not one observation of a stated kind: the unsplit REST poller (its
 * caller decides the kind per read with `markKindOf` and passes it directly), every re-serve and seed, and the walks.
 */
export const MARK_KIND_BY_PRODUCER: Readonly<Record<PriceProducer, 'mid' | 'last' | null>> = Object.freeze({
  kraken_ws_ticker_mid: 'mid',
  kraken_ws_ticker_last: 'last',
  kraken_ws_book_mid: 'mid',
  kraken_ws_ticker_v1: 'last', // unreachable (#742); on the raw v1 path `c[0]` is the last trade
  kraken_equities_ws_mid: 'mid',
  kraken_equities_ws_last: 'last',
  kraken_rest_engine_fallback_mid: 'mid',
  kraken_rest_engine_fallback_last: 'last',
  kraken_rest_poller: null,
  kraken_rest_rate_limited_reserve: null,
  xstock_rest_gate_reserve: null,
  last_known_good_all_apis_failed: null,
  last_known_good_fetch_exception: null,
  last_known_good_reserve: null,
  entry_seed: null,
  mock: null,
  crypto_ws_book_walk: null,
  xstock_ticker_snap_walk: null,
  position_entry_price_reused: null,
  no_price_produced: null,
});

/** P-7k: the kind of a recorded producer's price, or `null`. */
export function markKindOfProducer(producer: PriceProducer): 'mid' | 'last' | null {
  return MARK_KIND_BY_PRODUCER[producer];
}

/**
 * B-PRICE-SIDE-BY-JOB r5 (Langston Step-4, chunk 1): the predicate is named for what it answers. A LIVE TOUCH basis is a
 * quote observed from the venue that a touch-price decision may act on at the moment of use: the book top, the two WS
 * tickers, and a REST ticker read. NOT a live touch: `venue_close` (a bar close is printed, not fresh), `book_depth` and
 * `archive_ticker_snap` (fill estimates for a size, not a touch price), and `not_an_observation`.
 * ⛔ Replaces `isLiveObservationBasis`, which returned true for `venue_close` against this module's own definition; it
 * had no caller but its test and never deployed. Total over `PriceBasisOrNone`, so a new basis must declare its answer.
 */
export const LIVE_TOUCH_BY_BASIS = Object.freeze({
  book_top: true,
  ticker_bbo: true,
  ticker_default: true,
  rest_ticker: true,
  book_depth: false,
  archive_ticker_snap: false,
  venue_close: false,
  not_an_observation: false,
} as const satisfies Record<PriceBasisOrNone, boolean>);

/**
 * STEP 4 r2 (Langston chunk-1 r2 C1): DERIVED from the table, never hand-written beside it. The hand-written union was a
 * second source of truth inside the fix that removed one: with the table annotated `Record<…, boolean>`, flipping a value
 * left tsc accepting a type predicate that lied. `satisfies` keeps the table total over `PriceBasisOrNone` without
 * widening its values, so this union is exactly the keys whose value is `true`.
 */
export type LiveTouchBasis = {
  [K in keyof typeof LIVE_TOUCH_BY_BASIS]: (typeof LIVE_TOUCH_BY_BASIS)[K] extends true ? K : never;
}[keyof typeof LIVE_TOUCH_BY_BASIS];

/**
 * True only for a live touch basis (see `LIVE_TOUCH_BY_BASIS`).
 * ⚠️ PRE-PLACED for OBJ-8's decision-side basis stamp: it has NO non-test caller until then (Langston chunk-1 r2 C2), and
 * an unstated caller-free export reads as an orphan at the next sweep.
 */
export function isLiveTouchBasis(basis: PriceBasisOrNone): basis is LiveTouchBasis {
  return LIVE_TOUCH_BY_BASIS[basis];
}

/**
 * B-PRICE-SIDE-BY-JOB r5 — P-7h (Langston's P-7h ruling, condition 2, 2026-09-11): THE NAMED AGE EXEMPTION.
 *
 * The engine's direct REST fallback records `observedAt = null` BY DESIGN: the REST ticker carries no per-quote venue
 * time, and stamping our fetch time as observation time would rebuild `#743`. So an age check keyed on `observedAt`
 * (D7's "every action rechecks against D6", which lands for crypto exits in OBJ-8) cannot judge that branch on its
 * own: failing it closed would disable the exit fallback, failing it open would exempt it silently, and
 * `?? Date.now()` would launder. The honest form is a DECLARED exemption — that price was fetched inside the awaited
 * round trip of the very tick that acts on it, so it is fresh BY CONSTRUCTION — declared here, per producer, and
 * counted where it is used (`restAgeExempt` on the engine's EVAL_EXIT line), never inferred from a null.
 *
 * ⛔ `Record<PriceProducer, …>` keeps it TOTAL, like `BASIS_BY_PRODUCER`: a new producer must say whether it is exempt.
 * ⛔ NOT exempt: the adapter's REST poller (it carries a real `observedAt`) and every re-serve (they carry an OLD one,
 * which is exactly what the age check exists to catch).
 */
export type AgeExemption = 'fetch_fresh_by_construction';

export const AGE_EXEMPTION_BY_PRODUCER: Readonly<Record<PriceProducer, AgeExemption | null>> = Object.freeze({
  kraken_ws_ticker_mid: null,
  kraken_ws_ticker_last: null,
  kraken_ws_book_mid: null,
  kraken_ws_ticker_v1: null,
  kraken_equities_ws_mid: null,
  kraken_equities_ws_last: null,
  kraken_rest_engine_fallback_mid: 'fetch_fresh_by_construction',
  kraken_rest_engine_fallback_last: 'fetch_fresh_by_construction',
  kraken_rest_poller: null,
  kraken_rest_rate_limited_reserve: null,
  xstock_rest_gate_reserve: null,
  last_known_good_all_apis_failed: null,
  last_known_good_fetch_exception: null,
  last_known_good_reserve: null,
  entry_seed: null,
  mock: null,
  crypto_ws_book_walk: null,
  xstock_ticker_snap_walk: null,
  position_entry_price_reused: null,
  no_price_produced: null,
});

/** The declared age exemption of a recorded producer, or null. */
export function ageExemptionOfProducer(producer: PriceProducer): AgeExemption | null {
  return AGE_EXEMPTION_BY_PRODUCER[producer];
}
