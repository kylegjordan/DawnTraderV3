/**
 * B-PRICE-SIDE-BY-JOB r5 — P-7e (decision D3; pre-audit A-9.7, rewritten in r6 on Langston's C1 and judgement 2):
 * THE BOOK-VERSUS-TICKER DISAGREEMENT ALERT, SHIPPED RECORD-ONLY.
 *
 * ⛔ WHAT A FIRE MEANS. The crypto trading ticker is subscribed with `event_trigger: 'bbo'` (P-7a), and Kraken emits that
 * ticker from its own top of book. On a healthy feed its two sides therefore EQUAL the top of a correctly maintained
 * book BY CONSTRUCTION — the live probe found 46,344 of 46,344 aligned pairs exact. So a disagreement says OUR maintained
 * book has drifted from the venue's own top (desynced, untruncated or stale). Its subject is LOCAL BOOK MAINTENANCE, not a
 * disagreement between two venue feeds, and the alert copy says exactly that.
 *
 * THE RULE (A-9.7), ported from the validated probe (`scripts/analysis/book_ticker_alignment_probe.mjs` r2):
 * - an ALIGNED pair is a ticker frame compared with the book whose last update we received within 250 ms;
 * - a pair DISAGREES when either side differs by ONE TICK OR MORE;
 * - a symbol FIRES once, on the THIRD CONSECUTIVE disagreeing aligned pair (a single asynchronous delivery is absorbed);
 * - an agreeing aligned pair resets the streak; an unaligned frame neither extends nor resets it;
 * - a crossed or locked book is excluded and counted; a symbol with no published tick is counted and not judged.
 *
 * ⛔ RECORD-ONLY (A-9.7): a fire is logged and counted; NO ALERT IS RAISED until its first real fires have been read, and
 * arming is a reviewed change to `BOOK_TICKER_ALERT_ARMED`. ⛔ ALERT ONLY, EVER: if this number ever gates a price-dependent
 * refusal it becomes a trading knob and needs its own argument.
 * ⛔ CRYPTO ONLY TODAY: the instrument is not yet valid for xStock (crossed books dominated the probe's xStock pairs — a
 * property of that probe's book maintenance, not of the equities feed). xStock stays out until its maintained book passes
 * a checksum-validated control.
 *
 * PURE STATE AND COUNTERS: no clock read, no feed import. The adapter hands over both observations and `nowMs`.
 */

/** The probe's validated alignment window (A-9.7). */
export const BOOK_TICKER_ALIGN_MS = 250;
/** A symbol fires on this many consecutive disagreeing aligned pairs. */
export const BOOK_TICKER_FIRE_CONSECUTIVE = 3;
/** A pair disagrees at this many price ticks or more, on either side. */
export const BOOK_TICKER_FIRE_TICKS = 1;
/** ⛔ Record-only until the first real fires are read (A-9.7). Arming is a reviewed code change. */
export const BOOK_TICKER_ALERT_ARMED: boolean = false;

/** A difference this close under one tick is floating-point residue on a one-tick move, not a sub-tick disagreement. */
const TICK_EPSILON = 1e-6;

export interface BookTickerObservation {
  symbol: string;
  tickerBid: number;
  tickerAsk: number;
  bookBid: number;
  bookAsk: number;
  /** When we received the book update this top came from (our receipt clock, as in the probe). */
  bookReceivedAtMs: number;
  /** The instrument's published price tick; `null` when the venue map has none, and then the pair is not judged. */
  tick: number | null;
}

export type BookTickerVerdict = 'invalid' | 'unaligned' | 'crossed_book' | 'no_tick' | 'agree' | 'disagree' | 'fire';

export interface BookTickerResult {
  verdict: BookTickerVerdict;
  bidTicks: number | null;
  askTicks: number | null;
  streak: number;
}

const _streak = new Map<string, number>();
const _firesBySymbol = new Map<string, number>();
const _counts = { invalid: 0, unaligned: 0, crossedBook: 0, noTick: 0, aligned: 0, agree: 0, disagree: 0, fires: 0 };

function positive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export function observeBookTickerPair(o: BookTickerObservation, nowMs: number): BookTickerResult {
  const streak = _streak.get(o.symbol) ?? 0;
  if (!positive(o.tickerBid) || !positive(o.tickerAsk) || !positive(o.bookBid) || !positive(o.bookAsk)
      || !Number.isFinite(o.bookReceivedAtMs)) {
    _counts.invalid++;
    return { verdict: 'invalid', bidTicks: null, askTicks: null, streak };
  }
  if (Math.abs(nowMs - o.bookReceivedAtMs) > BOOK_TICKER_ALIGN_MS) {
    _counts.unaligned++;
    return { verdict: 'unaligned', bidTicks: null, askTicks: null, streak };
  }
  if (!(o.bookBid < o.bookAsk)) {
    _counts.crossedBook++;
    return { verdict: 'crossed_book', bidTicks: null, askTicks: null, streak };
  }
  if (o.tick === null || !positive(o.tick)) {
    _counts.noTick++;
    return { verdict: 'no_tick', bidTicks: null, askTicks: null, streak };
  }

  _counts.aligned++;
  const bidTicks = Math.abs(o.tickerBid - o.bookBid) / o.tick;
  const askTicks = Math.abs(o.tickerAsk - o.bookAsk) / o.tick;
  const disagrees = bidTicks >= BOOK_TICKER_FIRE_TICKS - TICK_EPSILON || askTicks >= BOOK_TICKER_FIRE_TICKS - TICK_EPSILON;

  if (!disagrees) {
    _streak.set(o.symbol, 0);
    _counts.agree++;
    return { verdict: 'agree', bidTicks, askTicks, streak: 0 };
  }

  const next = streak + 1;
  _streak.set(o.symbol, next);
  _counts.disagree++;
  if (next === BOOK_TICKER_FIRE_CONSECUTIVE) {
    _counts.fires++;
    _firesBySymbol.set(o.symbol, (_firesBySymbol.get(o.symbol) ?? 0) + 1);
    return { verdict: 'fire', bidTicks, askTicks, streak: next };
  }
  return { verdict: 'disagree', bidTicks, askTicks, streak: next };
}

/** The alert copy. Its subject is our book maintenance, stated so no reader goes looking at the venue. */
export function buildBookTickerAlertCopy(symbol: string, bidTicks: number, askTicks: number): { title: string; body: string } {
  return {
    title: `Our order book for ${symbol} has drifted from Kraken's own top of book`,
    body: `For ${BOOK_TICKER_FIRE_CONSECUTIVE} consecutive aligned updates, Kraken's best bid/offer ticker for ${symbol} differed from the top of the order book we maintain by at least one price tick (bid ${bidTicks.toFixed(1)} ticks, ask ${askTicks.toFixed(1)} ticks). Kraken emits that ticker from its own top of book, so on a healthy feed the two are identical. This means OUR local book maintenance for ${symbol} is desynced, untruncated or stale. It is not a disagreement between two venue feeds.`,
  };
}

/** Cumulative since process start. The constants travel with the counts so a reading states its own rule. */
export function getBookTickerDisagreementStats() {
  return {
    rule: {
      alignMs: BOOK_TICKER_ALIGN_MS,
      fireConsecutive: BOOK_TICKER_FIRE_CONSECUTIVE,
      fireTicks: BOOK_TICKER_FIRE_TICKS,
      armed: BOOK_TICKER_ALERT_ARMED,
      subject: 'local book maintenance',
      scope: 'crypto_spot trading ticker only',
    },
    counts: { ..._counts },
    firesBySymbol: Object.fromEntries(_firesBySymbol),
  };
}

/** Test-only reset. Never called from the running system. */
export function __resetBookTickerForTest(): void {
  _streak.clear();
  _firesBySymbol.clear();
  for (const k of Object.keys(_counts) as Array<keyof typeof _counts>) _counts[k] = 0;
}
