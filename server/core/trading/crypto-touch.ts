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
  /** Exact local time this book frame was accepted. */
  updatedAtMs: number;
}

export interface CryptoTouchReaders {
  normalize: (rawSymbol: string) => string;
  getBook: (internalSymbol: string) => CryptoBookTop | null;
  /** #1220: whether the book's checksum circuit breaker still trusts it. `getBook` already returns null when it does not;
   *  this says WHY, so the refusal is `book_untrusted` rather than an indistinguishable `no_book`. */
  isBookTrusted: (internalSymbol: string) => boolean;
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

/**
 * `B-RTB-REFRESH-LIVE-PRICE` (row 59e, Langston Step-2 C8): the PAPER EXIT's crypto trigger policy, MOVED HERE from
 * `active-execution-engine.ts` with its derivations unchanged, so the exit and the RTB refresh's retirement contract read one
 * value without an import cycle. The engine imports both back.
 */
/**
 * ⭐⭐ `8a-P2` — THE EXIT TRIGGER'S FRESHNESS CEILING. RISK-DERIVED, NOT INHERITED.
 *
 * A stale quote costs nothing while price is far from the stop; it costs exactly the error in
 * the exit decision when price is NEAR it. So the ceiling answers: **how long until this quote
 * could be wrong by enough to matter against the level it is compared to?**
 *
 *   t = 60 · ( f · stop / move60 )²          [range-over-t: a missed stop is an EXCURSION,
 *                                             not a displacement, so RANGE is the right estimand]
 *
 *   f      = 0.10 — the share of the stop distance we accept as decision error.
 *            ⛔ LOAD-BEARING, AND THE DEPENDENCE IS QUADRATIC: halving f QUARTERS the bound
 *            (2.50 s → 625 ms), which would put THIS 2,000 ms value 3.2× ABOVE it. f is not a
 *            formality and may not be lowered without re-deriving. A tightening of f is Kyle's.
 *   stop   = 0.926 % — p10 of |entry − stop| / entry, crypto, 30 d, n=147. The TIGHT stop, not
 *            the median: the tight trade is where a stale trigger does its damage.
 *   move60 = the WORST CELL of a `trade_count` sweep over held-name 1-minute bars.
 *
 * ⛔⛔ THE BOUND IS NOT A PROPERTY OF `f` ALONE — IT IS A PROPERTY OF `f` **AND WHICH CELL IS
 * WORST**, AND THE WORST CELL BELONGS TO THE DATA, NOT TO THIS FILE (Langston, 2026-09-14).
 * So the cell is NAMED here, with its n and its date, and a reader can see what falsifies it:
 *
 *   WORST CELL, as measured 2026-09-14: held-name crypto (68 symbols with a close in 30 d),
 *   `crypto_spot_ohlc_1m`, 24 h, `trade_count > 10`, n = 7,435 bars, p90 move60 = 0.4534 %
 *   ⇒ bound = 60 · (0.10 · 0.926 / 0.4534)² = **2.50 s at f = 0.10**.
 *   (Least-worst cell for contrast: `trade_count > 1`, n = 27,439, p90 0.2567 % ⇒ 7.81 s.)
 *
 * ⚠️ **THE HALVER IS NOT THE ONLY WAY THIS GOES FALSE — SO IS THE NEXT PERSON WHO SIMPLY ADDS
 * DATA.** A new symbol with a higher stop/move60 ratio moves the worst cell and lowers the bound
 * with `f` untouched. **Re-derive when the traded universe changes materially.**
 * ⛔ THE POOL IS THE WRONG POPULATION: all-455-symbol p90 runs ~41 % HIGHER because ~400 thin
 *   names we never trade drag it up. Held-name only. (Pool sensitivity 4.8× vs held-name 1.77×.)
 *
 * ⇒ SHIP VALUE 2,000 ms is a **TIGHTENING BELOW** that 2.50 s bound, chosen to equal the exit
 *   loop's own mark fetch (`getPriceWithFallback(symbol, 2000)`) so trigger and mark are held to
 *   ONE standard. ⛔ THEY ARE NOT COUPLED IN CODE: changing that call does NOT move this, and
 *   moving this does not move that. Re-derive before dragging one with the other.
 * ⚠️ RESIDUAL, RECORDED RATHER THAN DISSOLVED: at 2,000 ms the effective f is 0.051 at the
 *   held p90 but **0.165 at the held p99** — holding 0.10 there needs 730 ms, which no feed
 *   delivers. A tighter ceiling does not buy that back; it only converts a mispriced trigger
 *   into a refused one. The per-symbol form is the real answer and is homed at plan row `3n.o`.
 */
export const EXIT_TRIGGER_MAX_AGE_MS = 2_000;

/**
 * ⭐⭐ `8a-P2` B-4 — THE EXIT TRIGGER'S SPREAD CEILING. RISK-DERIVED, EXIT-LANE ONLY.
 *
 * ⛔⛔ WHY THIS EXISTS RATHER THAN REUSING `LEVEL_BASIS_OBSERVATION_MAX_SPREAD_FRACTION`:
 * P2-4 gave the exit lane its own AGE ceiling because the level lane's 60,000 ms was harmless
 * for a recorder and wrong for a decider. Re-using the shared SPREAD constant after splitting
 * the age one would be the same inconsistency, one field over. **And the lanes fail differently:
 * on the level/VTS lanes a too-wide spread produces a worse ESTIMATE; on THIS lane it produces a
 * trigger far below the mark and BOOKS A CLAMPED STOP NOBODY COULD HAVE FILLED.** The shared
 * constant is untouched at its other three sites (`signal-orchestrator.ts`, `vts-runner.ts`) —
 * that number stays `3b.f-c`'s open question and is deliberately NOT answered here.
 *
 * ⛔⛔ `D` IS DOING DOUBLE DUTY, AND THAT IS THIS CONSTANT'S LOAD-BEARING ASSUMPTION (Langston).
 * `stop − bid = spread/2 − D` is right, but the `D` in it is the **LIVE mid-to-stop distance AT
 * THE TRIGGER INSTANT**, not the entry-time stop distance. This is calibrated at `D_live` = the
 * full entry distance — the **LOOSEST** member of that family. As the mid legitimately walks down
 * toward the stop, `D_live → 0` and the residual overbooking → `spread/2`, i.e. **up to 1.0 % at
 * this ceiling**. ⚠️ THAT RESIDUAL IS REAL AND IS NOT BOUNDED HERE.
 *
 * ⚠️ I FIRST WROTE THAT MY EARLIER `spread ≤ 2·f·stop` = 0.185 % CUT WAS "NONSENSE — IT TREATED A
 * KNOWN PRICE AS AN ERROR TERM." **THAT RETRACTION WAS ITSELF HALF WRONG AND IS WITHDRAWN.**
 * 0.185 % and 2.037 % are THE SAME FORMULA AT THE TWO ENDS OF `D_live` — the first is the
 * `D_live → 0` corner, not a different and mistaken idea. ⛔ AND LEAVING THE GENERAL CLAIM
 * STANDING WOULD TELL A FUTURE READER THE BID-SIDE HARM IS IMAGINARY. IT IS NOT — `F-G-2` EXISTS
 * BECAUSE IT IS NOT.
 *
 * ⇒ SO WHY NOT TAKE THE WORST CASE? **BECAUSE THE HARM IS TWO-SIDED, AND THAT — NOT A WRONG
 * FORMULA — IS THE REASON.** A refused trigger is a SKIPPED STOP CHECK (`NO_TRIGGER_STREAK_ALERT_AT`
 * exists for precisely that). 0.185 % sits at roughly the held-name p90, so the tight bound would
 * refuse ~10 % of exit checks and ride positions through their stops. **This constant is a
 * TRADEOFF BETWEEN OVERBOOKING A STOP AND NOT CHECKING ONE**, resolved toward checking.
 *
 * ⇒ THE REAL HARM IS IN THE BOOKING, NOT THE TRIGGER. On a stop hit the exit is booked at the
 * CLAMPED STOP, not at the bid. So the quantity to bound is `stop − bid` at the instant the
 * trigger fires:
 *     bid = mid − spread/2 ·  stop = mid − D  (D = stop distance)
 *     stop − bid = spread/2 − D  ≤  f · D     ⇒  spread ≤ 2·D·(1 + f)
 * At the limit the mid sits `1.1·D` above the stop when the bid crosses it — i.e. the stop fires
 * while the trade is still in profit ON THE MID. That is exactly the pathology, and it is what
 * the ceiling is for.
 *
 *   f = 0.10 (the `EXIT_TRIGGER_MAX_AGE_MS` parameter — ⛔ SAME `f`, so a change to it moves BOTH
 *             ceilings; it is load-bearing in both and quadratically so in the age one)
 *   D = 0.926 % — p10 of |entry − stop| / entry, crypto, 30 d, n = 147. The TIGHT stop again:
 *       a ceiling safe for the median stop is wrong for the tight trade, and the tight trade is
 *       where a spread-driven stop does its damage.
 *   ⇒ spread ≤ 2 × 0.926 % × 1.10 = 2.037 %  ⇒ SHIPPED AT 2.0 %.
 *
 * ⛔ THE CELL, NAMED WITH ITS n AND DATE SO A READER CAN SEE WHAT FALSIFIES IT (the r8 rule):
 *   held-name crypto (crypto closes in 30 d), `crypto_spot_ticker_snap`, 24 h to 2026-09-14,
 *   n = 90,833 quotes: p50 0.0473 % · p90 0.1839 % · p99 0.5961 % · p99.9 1.6012 % · max 4.407 %.
 *   ⛔⛔ AND THE TAIL MOVED WITHIN ONE DAY — THE CAVEAT FIRED BEFORE THE INK DRIED:
 *     2026-09-14 (mine, n=90,833):     p99.9 1.6012 % · max 4.407 %
 *     2026-09-15 (Langston, n=91,226): p99.9 **2.0095 %** · max **5.5319 %**
 *   ⇒ "2.0 % refuses between p99.9 and the max" WAS TRUE FOR ONE DAY AND IS NOW FALSE: the ceiling
 *     sits just BELOW p99.9 — **ON THE TAIL KNEE, NOT ABOVE IT.** Both dated pairs are kept rather
 *     than collapsed into one number that will drift again.
 * ⚠️ THIS IS NOT A WARNING TO REMEMBER, IT IS A SCHEDULED RE-DERIVATION: the tail moves with the
 *   traded universe, so the number has an owner and a home — plan row `3n.o`, with the per-symbol
 *   ceiling, where a per-name bound DISSOLVES the drift instead of chasing it.
 *
 * ★ FOR SCALE: the shared constant this replaces on THIS lane is 0.50 — **25× looser**, and ~9×
 *   looser than the widest spread observed in a 24 h window. It admitted a bid at 0.75 × mid.
 *
 * ⛔⛔ AND THE HONEST LIMIT OF THIS WHOLE CONSTANT: **IT TREATS A *BOOKING* DEFECT AT THE *TRIGGER*.**
 * The trigger knows the bid EXACTLY; the booking then throws it away and clamps to the stop.
 * **Clamp to `min(stop, touch)` instead and the quantity bounded above goes to ZERO with no ceiling
 * at all.** ⇒ THIS CEILING IS A MITIGATION, NOT THE ANSWER, and it must not be left standing as
 * one. HOME: `F-G-2`'s transactable-booking leg. (Langston, §9.4 disposition 3.)
 */
export const EXIT_TRIGGER_MAX_SPREAD_FRACTION = 0.02;

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
            arrivalMs: book.updatedAtMs,
            clockBasis: 'receipt',
            producer: 'kraken_ws_book',
          }
        : null,
      bookEligible: true,
      bookTrusted: readers.isBookTrusted(internalSymbol),
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
