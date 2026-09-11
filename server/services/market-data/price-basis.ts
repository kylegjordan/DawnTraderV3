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
 * a midpoint or a last trade. The producer's `_mid` / `_last` suffix carries the kind; the SIDE a decision reads
 * is stamped at the decision site when the decision layer (OBJ-8) switches it on. A basis names the SOURCE.
 *
 * ⚠️ ERA, STATED: `kraken_ws_ticker_*` maps to `ticker_bbo` because P-7a subscribes the crypto trading ticker with
 * `event_trigger: 'bbo'`. Rows written BEFORE the P-7a deploy came from the default trade-triggered ticker; a
 * reader of old rows applies the deploy boundary, not this map.
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

/** True only for a price that was actually observed from the venue. */
export function isLiveObservationBasis(basis: PriceBasisOrNone): basis is PriceBasis {
  return basis !== 'not_an_observation';
}
