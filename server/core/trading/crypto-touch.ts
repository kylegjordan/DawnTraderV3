/**
 * `8a-P3` (B-PRICE-SIDE-BY-JOB, `PHASE_19_PLAN` row `3n.q`, crypto half) — ONE HOME FOR THE CRYPTO
 * TOUCH READ THAT A RESTING FILL, A PLACEMENT CHECK OR A VTS EXIT DECIDES ON.
 *
 * THE RULE (`SYSTEM_MANUAL` §18.0; Langston's `#741` bucket-2 ruling, 2026-09-14): a price that
 * TRIGGERS an action — including a resting order FILLING — or that is BOOKED, takes the TRANSACTABLE
 * side. A SELL is judged on the BID (a buyer fills it); a BUY on the ASK (a seller fills it). The feed
 * midpoint is a price nobody can transact at.
 * ⛔ A refused selection means NO DECISION / NO FILL THIS TICK — never a midpoint fallback.
 *
 * PURE BY INJECTION: every venue/cache read is passed in, so the symbol form and every policy can be
 * driven offline. ⛔ The book lookup ALWAYS goes through `readers.normalize` first (Langston r4
 * CONDITION-1): a caller that skipped it would get `null` for every symbol whose external form differs
 * from the internal one, silently demoting every fill to the ticker rung — invisibly, because `null`
 * is a legal value on that rung.
 */
import {
  selectTouchPrice,
  tickerLegFromCachedQuote,
  type CachedQuoteSides,
  type TouchSelection,
} from '../calculations/touch-price.js';

/** The WS mini-book shape `krakenWebSocketAdapter.getBookForFill` returns — an IN-MEMORY read, not a venue call. */
export interface CryptoBookTop {
  bids: ReadonlyArray<{ price: number }>;
  asks: ReadonlyArray<{ price: number }>;
  ageMs: number;
}

export interface CryptoTouchReaders {
  normalize: (rawSymbol: string) => string;
  getBook: (internalSymbol: string) => CryptoBookTop | null;
  getCached: (internalSymbol: string) => CachedQuoteSides | null;
}

export interface CryptoTouchPolicy {
  maxAgeMs: number;
  maxSpreadFraction: number;
}

/**
 * ⛔⛔ PAPER RESTING-ENTRY FILL AGE CEILING (C1) — 8,000 ms, MEASURED ON THE PRODUCER THAT FEEDS IT.
 * WHICH STAMP: the ticker rung ages the SIDES (`venueObservedAtMs ?? sidesCapturedAtMs`,
 * `touch-price.ts` `tickerLegFromCachedQuote`) — never the mark's `lastUpdatedAt`.
 * PRODUCER: a pending crypto position is a held row, so `P-7g` reconciles its symbol into the 2-second
 * `openTrade` price-cache lane (`getActiveOpenPositions` has no state filter).
 * MEASURED, staging `out` logs 2026-09-12 06:33 → 2026-09-15 04:37 Z, 1-s granularity, per file:
 * pass interval p50 2 s · p90 3 s · p99 3 s · p99.9 3-4 s · max 3-7 s; ≈ 10-12 % of intervals above 2 s
 * (outliers: one 22 s; one 16,607 s gap that is the lane holding no members — 09-14 18:52:38 → 23:29:25 Z
 * holds 549 `[PriceCache][vtsSimulation] refreshed` lines and 0 `openTrade` lines, so the loop was alive).
 * RE-DERIVE: the `[PriceCache][openTrade] refreshed` lines across staging `/var/log/dawntrader/out__*.log`; a pass is
 * the first line after a gap of more than 1 s; the statistic is the interval between consecutive passes.
 * ⇒ The r3 figure of 2,000 ms sat at the nominal period with zero headroom. 8,000 ms is above every
 * normal-operation maximum and 2× the p99.9. PRE-REGISTERED: steady-state refusal ≈ 0 while the lane
 * is healthy. ⚠️ FIRST-LOOK refusals are expected and benign (the first look after placement can read
 * sides left by the bucket that last held the symbol — readyToBuy 15 s / fx5Snapshot 30 s), so they are
 * counted SEPARATELY; raising the ceiling is the wrong repair for them.
 * COST: f = (move60/stop)·√(t/60) ≈ 0.18 at 8 s on the held-name cell (move60 p90 0.4534 %, stop p10
 * 0.926 %), which IS this population.
 * NO SPREAD CEILING ON THIS LEG (`ENTRY_LEG_NO_SPREAD_CEILING`): a wider spread makes `ask ≤ limit`
 * HARDER, so it cannot make a fill optimistic; a spread ceiling would only refuse fills and hard-drop orders.
 */
export const ENTRY_FILL_TOUCH_MAX_AGE_MS = 8_000;

/**
 * ⛔⛔ VTS CRYPTO TOUCH AGE CEILING (C3 entry fill, C4/C7 placement, C5 trigger, C6 booking) — 90,000 ms.
 * WHICH STAMP: the SIDES (`sidesCapturedAtMs`), as above — NOT the mark's re-serve sawtooth.
 * PRODUCERS OF THE SIDES: `refreshBucket` for the `vtsSimulation` bucket (nominal 60,000 ms, the binding
 * one), `getBatch`'s own fetch when the MARK is stale, `updateFromWebSocket` for WS-fed names. The last
 * two only make sides FRESHER, and `getBatch` judges freshness by the mark, so the pass interval sets
 * the worst case.
 * MEASURED, staging `out.log` 2026-09-15 06:55:48 → 10:22:59 Z: 207 pass intervals, min 60 · p50 60 ·
 * p99 61 · max 61 s; none above 61 s.
 * RE-DERIVE: the `[PriceCache][vtsSimulation] refreshed` lines in staging `/var/log/dawntrader/out.log`; a pass is the
 * first line after a gap of more than 5 s; the statistic is the interval between consecutive passes.
 * ⇒ 60,000 ms would be the production period with zero headroom — every overrun refuses, correlated
 * across a whole pass. 90,000 ms = 29 s above the measured maximum.
 * PRE-REGISTERED AS A PAIR: refusal rate ≈ 0 AND bucket size 157-159 symbols per pass (the interval is a
 * function of bucket size: `BATCH_SIZE` 100 per chunk, four buckets serialised behind one flag, and VTS
 * membership is unbounded). A refusal is a pass overrun beyond 90 s — a feed-impairment signal.
 * ⛔ COST, AND ON WHICH POPULATION: f ≈ 0.60 at 90 s on the HELD-NAME cell; that cell is NOT this lane's
 * population (VTS is the pool, which the exit derivation itself forbids) — the pool direction is
 * f ≥ 0.85. Neither is a VTS-corpus derivation; that derivation is homed at `3n.o`.
 */
export const VTS_EXIT_TOUCH_MAX_AGE_MS = 90_000;

/**
 * VTS CRYPTO EXIT SPREAD CEILING — 0.02, A STATED CHOICE, NOT AN INHERITANCE. `2·D·(1+f)` at the
 * pool-direction f ≥ 0.85 allows ≥ 3.42 %; 0.02 is tighter, so VTS and paper refuse the same implausible
 * books. NOT the shared 0.50, which admits a bid at 0.75 × mid. Entry legs take no spread ceiling.
 */
export const VTS_EXIT_TOUCH_MAX_SPREAD_FRACTION = 0.02;

/** Entry legs: `Infinity` is inert at `buildLevelBasis`'s `>` spread test; book-validity checks still apply. */
export const ENTRY_LEG_NO_SPREAD_CEILING = Number.POSITIVE_INFINITY;

export function selectCryptoTouch(
  rawSymbol: string,
  readers: CryptoTouchReaders,
  nowMs: number,
  policy: CryptoTouchPolicy,
): { internalSymbol: string; selection: TouchSelection } {
  const internalSymbol = readers.normalize(rawSymbol);
  const book = readers.getBook(internalSymbol);
  const selection = selectTouchPrice(
    {
      book: book
        ? {
            bid: book.bids.length > 0 ? book.bids[0].price : null,
            ask: book.asks.length > 0 ? book.asks[0].price : null,
            // The book hands back an AGE, not a capture instant, so the instant is reconstructed.
            stampMs: nowMs - book.ageMs,
            clockBasis: 'receipt',
            producer: 'kraken_ws_book',
          }
        : null,
      bookEligible: true,
      ticker: tickerLegFromCachedQuote(readers.getCached(internalSymbol)),
      tickerBasis: 'ticker_bbo',
    },
    nowMs,
    policy,
  );
  return { internalSymbol, selection };
}

/** The side a counterparty fills: a BUY on the ASK, a SELL on the BID. A refused selection ⇒ `null`. */
export function transactableSide(selection: TouchSelection, side: 'buy' | 'sell'): number | null {
  if (!selection.ok) return null;
  return side === 'buy' ? selection.quote.ask : selection.quote.bid;
}
