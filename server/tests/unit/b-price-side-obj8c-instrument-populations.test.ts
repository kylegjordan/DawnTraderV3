// B-PRICE-SIDE-BY-JOB row `8c` — THE THREE INSTRUMENT DEFECTS (F2, F4, F5), fixed 2026-09-13.
//
// ⛔ WHY THESE THREE ARE ONE FILE. They are the same defect wearing three faces: A NUMBER PUBLISHED
// WITHOUT THE POPULATION IT WAS COUNTED OVER. Each was found by asking, of a shadow counter already
// deployed, "what would a reader have to already know for this figure to mean what it looks like it
// means?" — and in all three cases the answer was something the payload did not carry.
//
//   F5 — `venueTimestampPresence` prints a `ticker` cell counted over HUNDREDS of subscribed
//        symbols beside a `book` cell counted over THREE (`#1060`, whole-day distinct count). Two
//        rates over populations two orders of magnitude apart, under one key, with nothing saying
//        so. FIX: each cell carries its own `distinctSymbols`.
//   F2 — `tickerVsBookAgreement`'s `bothPresent` pools two structurally different comparisons.
//        `kraken-websocket-adapter.ts:1151-1153` writes the BOOK'S OWN TOP into the cache's
//        `bid`/`ask` under producer `kraken_ws_book_mid` — the very fields this instrument reads as
//        its "ticker" leg. So a sample is either a real cross-channel comparison or the book
//        against an older copy of itself, and the cache carries no field that separates them.
//        FIX: split by the ticker leg's `lastSource`; only the REST subset is interpretable.
//   F4 — `sideAgeAtLevelBuild` publishes ONE p50 over a distribution that is bimodal by
//        construction: pushed sides (venue-stamped, sub-second) and polled sides (unstamped, at the
//        bucket cadence). The pooled quantile tracks the WRITER MIX — which `3n.l` is about to
//        change — so it would move for a reason that has nothing to do with feed health.
//        FIX: publish both modes, each with its own n.
//
// ⭐ THE MUTATIONS THAT PROVE THIS SUITE CAN FAIL — MEASURED, NOT PREDICTED, 2026-09-13, each
// applied with an assertion that the substitution actually matched, run, then reverted. A predicted
// mutation result may never be cited, and a passing run under an unfired mutation looks exactly
// like success — that has already cost this batch a round.
//   (results recorded in the change list once run)
//
// ⛔ EVERY TEST HERE HAS TWO ARMS THAT DIFFER IN THE THING UNDER TEST. A fixture whose arms are
// identical cannot discriminate however many assertions it makes — that is mutation 2's lesson from
// the sibling file, and it bit this batch again at `8c` test 3.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordVenueTimestampPresence,
  getVenueTimestampPresence,
  __resetVenueTimestampPresenceForTest,
} from '../../exchanges/kraken/kraken-websocket-adapter.js';
import {
  recordFeedAgreement,
  getFeedAgreementRows,
  __resetFeedAgreementForTest,
  recordSideAgeAttempt,
  getSideAgeRows,
  __resetSideAgeForTest,
} from '../../core/calculations/level-basis.js';

const NOW = 1_700_000_000_000;
const LANE = { lane: 'active' as const, assetClass: 'crypto_spot' };

/** Total samples a published histogram actually holds — the check that a stated `n` is honest. */
const sumBuckets = (h: Record<string, number>) => Object.values(h).reduce((a, b) => a + b, 0);

describe('F5 — venue-timestamp presence carries its own population per channel', () => {
  beforeEach(() => { __resetVenueTimestampPresenceForTest(); });

  it('counts DISTINCT symbols per channel, so the two cells are not read as one population', () => {
    // The live shape, in miniature: ticker spans many symbols, book spans few.
    for (const s of ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD']) {
      recordVenueTimestampPresence('ticker', true, s);
      recordVenueTimestampPresence('ticker', true, s); // repeat: frames, not symbols
    }
    recordVenueTimestampPresence('book', true, 'BTC/USD');
    recordVenueTimestampPresence('book', true, 'BTC/USD');

    const out = getVenueTimestampPresence();
    expect(out.ticker.present).toBe(8);
    expect(out.book.present).toBe(2);
    // ⛔ THE POINT: identical present-counts would still describe different populations. The
    // distinct-symbol figure is what makes the two cells comparable AS populations.
    expect(out.ticker.distinctSymbols).toBe(4);
    expect(out.book.distinctSymbols).toBe(1);
    expect(out.ticker.distinctSymbols).toBeGreaterThan(out.book.distinctSymbols);
  });

  it('counts a frame whose symbol is unreadable instead of dropping it', () => {
    recordVenueTimestampPresence('book', true, 'BTC/USD');
    recordVenueTimestampPresence('book', false, undefined);
    recordVenueTimestampPresence('book', true, '');

    const out = getVenueTimestampPresence();
    // absent/present still total every frame...
    expect(out.book.present + out.book.absent).toBe(3);
    // ...and the two unreadable ones are VISIBLE rather than silently shrinking the denominator.
    expect(out.book.distinctSymbols).toBe(1);
    expect(out.book.framesWithNoSymbol).toBe(2);
  });

  it('keeps present/absent separable — a zero must be readable as "venue silent", not "parse broken"', () => {
    recordVenueTimestampPresence('ticker', false, 'BTC/USD');
    recordVenueTimestampPresence('ticker', false, 'ETH/USD');
    const out = getVenueTimestampPresence();
    expect(out.ticker.present).toBe(0);
    expect(out.ticker.absent).toBe(2);
    // The denominator exists, so present=0 is a measurement rather than an instrument gap.
    expect(out.ticker.distinctSymbols).toBe(2);
  });
});

describe('F2 — feed agreement splits the interpretable subset from the ambiguous one', () => {
  beforeEach(() => { __resetFeedAgreementForTest(); });

  const sample = (tickerSidesSource: string | null | undefined) => ({
    assetClass: 'crypto_spot',
    bookBid: 100, bookAsk: 100.2,
    tickerBid: 99.9, tickerAsk: 100.3,
    tickerSidesSource,
  });

  it('files a REST-written ticker leg as interpretable and a WS-written one as ambiguous', () => {
    recordFeedAgreement(sample('kraken_rest'));
    recordFeedAgreement(sample('kraken_ws'));
    recordFeedAgreement(sample('kraken_ws'));

    const row = getFeedAgreementRows().find(r => r.assetClass === 'crypto_spot')!;
    expect(row.bothPresent).toBe(3);
    // ⭐ REST provably never writes the book channel's top, so this subset IS a cross-feed test.
    expect(row.bothPresentTickerRest).toBe(1);
    // ⛔ A `kraken_ws` leg may BE the book's own top one write earlier. Not evidence either way.
    expect(row.bothPresentTickerWs).toBe(2);
    expect(row.bothPresentTickerUnknown).toBe(0);
  });

  it('files an unstated source as Unknown rather than folding it into either real cell', () => {
    recordFeedAgreement(sample(null));
    recordFeedAgreement(sample(undefined));
    recordFeedAgreement(sample(''));

    const row = getFeedAgreementRows().find(r => r.assetClass === 'crypto_spot')!;
    expect(row.bothPresentTickerUnknown).toBe(3);
    expect(row.bothPresentTickerRest).toBe(0);
    expect(row.bothPresentTickerWs).toBe(0);
  });

  it('keeps the three cells summing to bothPresent, so a reclassification cannot hide', () => {
    recordFeedAgreement(sample('kraken_rest'));
    recordFeedAgreement(sample('kraken_ws'));
    recordFeedAgreement(sample('kraken_equities_ws'));
    recordFeedAgreement(sample(null));

    const row = getFeedAgreementRows().find(r => r.assetClass === 'crypto_spot')!;
    expect(row.bothPresentTickerRest + row.bothPresentTickerWs + row.bothPresentTickerUnknown)
      .toBe(row.bothPresent);
    // `kraken_equities_ws` is not REST, so it must land on the ambiguous side, not the clean one.
    expect(row.bothPresentTickerRest).toBe(1);
    expect(row.bothPresentTickerWs).toBe(2);
  });

  it('does not classify a sample that never reached bothPresent', () => {
    // Book present, ticker absent → `bookOnly`, and none of the three splits may move.
    recordFeedAgreement({ assetClass: 'crypto_spot', bookBid: 100, bookAsk: 100.2, tickerBid: null, tickerAsk: null, tickerSidesSource: 'kraken_rest' });
    const row = getFeedAgreementRows().find(r => r.assetClass === 'crypto_spot')!;
    expect(row.bookOnly).toBe(1);
    expect(row.bothPresent).toBe(0);
    expect(row.bothPresentTickerRest).toBe(0);
  });
});

describe('F4 — side age publishes its two modes, each with its own n', () => {
  beforeEach(() => { __resetSideAgeForTest(); });

  const attempt = (o: { venueObservedAtMs: number | null; ageMs: number }) => ({
    stage: 'level_build' as const,
    symbol: 'BTC/USD',
    nowMs: NOW,
    cacheEntryPresent: true,
    sidesCapturedAtMs: NOW - o.ageMs,
    venueObservedAtMs: o.venueObservedAtMs,
    symbolLastMessageAtMs: NOW - 500,
    feedDistinctSymbolsInWindow: null,
    feedDistinctWsSymbolsInWindow: null,
    feedWindowMs: null,
  });

  it('routes a stamped sample to the pushed mode and an unstamped one to the polled mode', () => {
    // ⛔ THE TWO ARMS DIFFER IN BOTH the stamp AND the age, which is the real shape: pushed sides
    // are fresh, polled sides are a bucket-cadence old. Identical ages would not discriminate.
    recordSideAgeAttempt(LANE, attempt({ venueObservedAtMs: NOW - 40, ageMs: 40 }));
    recordSideAgeAttempt(LANE, attempt({ venueObservedAtMs: null, ageMs: 45_000 }));
    recordSideAgeAttempt(LANE, attempt({ venueObservedAtMs: null, ageMs: 50_000 }));

    const row = getSideAgeRows().find(r => r.key === 'active:crypto_spot:level_build')!;
    expect(row.observed).toBe(3);
    expect(row.byAgeMode.venueStamped.n).toBe(1);
    expect(row.byAgeMode.venueUnstamped.n).toBe(2);
    // The modes sum to the pooled observed count — no sample is invented or lost.
    expect(row.byAgeMode.venueStamped.n + row.byAgeMode.venueUnstamped.n).toBe(row.observed);
    // ⭐ AND THEY SEPARATE: the fast mode's max cannot have absorbed the slow mode's sample.
    expect(row.byAgeMode.venueStamped.maxMs).toBe(40);
    expect(row.byAgeMode.venueUnstamped.maxMs).toBe(50_000);

    // ⛔⛔ ASSERT THE HISTOGRAM CONTENTS, NOT ONLY THE COUNTERS BESIDE THEM. `n` and `maxMs` are
    // written on a DIFFERENT branch from the bucket write, so a mutation sending every sample to
    // one histogram leaves both of them correct — MEASURED: that mutation SURVIVED this suite until
    // these two lines were added. A histogram whose buckets do not sum to its own stated `n` is
    // publishing a quantile over samples it does not hold.
    expect(sumBuckets(row.byAgeMode.venueStamped.histogram)).toBe(row.byAgeMode.venueStamped.n);
    expect(sumBuckets(row.byAgeMode.venueUnstamped.histogram)).toBe(row.byAgeMode.venueUnstamped.n);
  });

  it('gives each mode a quantile over its OWN n, not over the pooled total', () => {
    // Nine fast samples and one very slow one. A pooled p50 sits in the fast bucket and hides the
    // polled mode entirely — which is exactly the reading F4 exists to prevent.
    for (let i = 0; i < 9; i++) recordSideAgeAttempt(LANE, attempt({ venueObservedAtMs: NOW - 10, ageMs: 10 }));
    recordSideAgeAttempt(LANE, attempt({ venueObservedAtMs: null, ageMs: 60_000 }));

    const row = getSideAgeRows().find(r => r.key === 'active:crypto_spot:level_build')!;
    expect(row.byAgeMode.venueStamped.n).toBe(9);
    expect(row.byAgeMode.venueUnstamped.n).toBe(1);
    // The polled mode's own p50 reports the slow reality rather than being outvoted 9-to-1.
    expect(row.byAgeMode.venueUnstamped.p50Bucket).not.toBeNull();
    expect(row.byAgeMode.venueUnstamped.p50Bucket).not.toBe(row.byAgeMode.venueStamped.p50Bucket);
    // ⛔ And each quantile is taken over buckets that actually hold that mode's samples. Without
    // this, an all-zero histogram still yields a non-null, different-looking p50 — a bucket label
    // computed from nothing, which is the most convincing way to be wrong.
    expect(sumBuckets(row.byAgeMode.venueStamped.histogram)).toBe(9);
    expect(sumBuckets(row.byAgeMode.venueUnstamped.histogram)).toBe(1);
  });

  it('leaves both modes empty when the sample never reached the observed branch', () => {
    // No cache entry → `absent`, and neither histogram may move. A mode that counts refusals
    // would report an age for a quote that was never read.
    recordSideAgeAttempt(LANE, { ...attempt({ venueObservedAtMs: null, ageMs: 0 }), cacheEntryPresent: false });
    // Entry present but sides never stamped → `unstamped`, same rule.
    recordSideAgeAttempt(LANE, { ...attempt({ venueObservedAtMs: null, ageMs: 0 }), sidesCapturedAtMs: null });

    const row = getSideAgeRows().find(r => r.key === 'active:crypto_spot:level_build')!;
    expect(row.absent).toBe(1);
    expect(row.unstamped).toBe(1);
    expect(row.observed).toBe(0);
    expect(row.byAgeMode.venueStamped.n).toBe(0);
    expect(row.byAgeMode.venueUnstamped.n).toBe(0);
  });
});
