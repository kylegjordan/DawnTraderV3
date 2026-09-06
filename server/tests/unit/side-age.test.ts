/**
 * B-PRICE-SIDE-BY-JOB — SIDE-AGE AT LEVEL-BUILD TIME.
 *
 * ⛔ WHAT THIS INSTRUMENT IS FOR. Langston required the age of the quote we would build a level
 * from, AT READ TIME, and correctly refused my archive-derived figure as a proxy — the archiver
 * is a different subscriber with its own socket and throttle, so it bounds the venue's cadence
 * and says nothing about the entry this process holds.
 *
 * ⛔⛔ AND IT CARRIES THREE TERMS BECAUSE ONE IS NOT ENOUGH, WHICH I GOT WRONG FIRST.
 * I proposed gating on `age AND feed-not-live`. A term ANDed onto a fail-CLOSED gate can only
 * WIDEN it, and that conjunction passes exactly the state we most need to refuse: per-symbol
 * subscription death behind a healthy socket. Tests 8-10 pin the fields that make the three-cell
 * split possible; nothing here gates, and no threshold is pinned by any test.
 *
 * THE PROPERTIES A REASONABLE PERSON WOULD GET WRONG, and each has a mutation that proves it:
 *  - test 3: an UNSTAMPED entry is not age 0. Age 0 is the freshest possible reading; "no writer
 *    ever supplied a side" is the least informative one. Collapsing them reports the healthiest
 *    number for a state we know nothing about.
 *  - test 5: a NEGATIVE age is recorded, not clamped — and it needs its own counter, because a
 *    clamped -5000 and a real 0 land in the same bucket and leave maxMs identical. My first
 *    version of this test could not have failed.
 *  - test 10: liveness is counted in DISTINCT SYMBOLS, never as feed-wide recency. One chatty
 *    name keeps a recency gauge green — measured in this batch, where three stablecoins carried
 *    the busiest decile of a 460-symbol pool.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSideAgeAttempt,
  getSideAgeRows,
  getSymbolGapRows,
  __resetSideAgeForTest,
  SIDE_AGE_BUCKET_EDGES_MS,
  type SideAgeAttempt,
} from '../../core/calculations/level-basis.js';

const K = { lane: 'active' as const, assetClass: 'crypto_spot' };
const NOW = 1_700_000_000_000;

/** A fully-populated healthy attempt; each test overrides only the field it is about. */
function attempt(over: Partial<SideAgeAttempt> = {}): SideAgeAttempt {
  return {
    stage: 'active_signal_birth',
    symbol: 'BTC/USD',
    nowMs: NOW,
    cacheEntryPresent: true,
    sidesCapturedAtMs: NOW - 500,
    venueObservedAtMs: NOW - 600,
    symbolLastMessageAtMs: NOW - 500,
    feedDistinctSymbolsInWindow: 460,
    feedDistinctWsSymbolsInWindow: 455,
    feedWindowMs: 60_000,
    ...over,
  };
}

const row = (key = 'active:crypto_spot:active_signal_birth') =>
  getSideAgeRows().find((r) => r.key === key);

describe('side-age instrument', () => {
  beforeEach(() => __resetSideAgeForTest());

  it('1. an age lands in the bucket whose upper edge it is strictly below', () => {
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW - 500 }));     // < 1000
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW - 1_000 }));   // NOT < 1000 -> next
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW - 250_000 })); // 120k-300k
    const r = row()!;
    expect(r.histogram['0-1000']).toBe(1);
    expect(r.histogram['1000-2000']).toBe(1);
    expect(r.histogram['120000-300000']).toBe(1);
  });

  it('2. an age past the last edge lands in the open-ended top bucket', () => {
    const last = SIDE_AGE_BUCKET_EDGES_MS[SIDE_AGE_BUCKET_EDGES_MS.length - 1];
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW - last * 10 }));
    const r = row()!;
    expect(r.histogram[`${last}+`]).toBe(1);
    expect(r.maxMs).toBe(last * 10);
  });

  it('3. ⛔ absent and unstamped are counted apart and NEVER as age zero', () => {
    recordSideAgeAttempt(K, attempt({ cacheEntryPresent: false }));
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: null }));
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: null }));
    const r = row()!;
    expect(r.absent).toBe(1);
    expect(r.unstamped).toBe(2);
    expect(r.observed).toBe(0);
    // The discriminating assertion: none of them leaked into the freshest bucket.
    expect(r.histogram['0-1000']).toBe(0);
    // With nothing observed a quantile is null, never a fabricated "0-1000".
    expect(r.p50Bucket).toBeNull();
    expect(r.p95Bucket).toBeNull();
  });

  it('4. attempted equals observed + absent + unstamped — arithmetic a reader can check', () => {
    recordSideAgeAttempt(K, attempt());
    recordSideAgeAttempt(K, attempt({ cacheEntryPresent: false }));
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: null }));
    const r = row()!;
    expect(r.attempted).toBe(r.observed + r.absent + r.unstamped);
    expect(r.attempted).toBe(3);
  });

  it('5. ⛔ a negative age is recorded and counted, not clamped to zero', () => {
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW + 5_000 })); // stamp in our future
    recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW }));         // exactly zero
    const r = row()!;
    expect(r.observed).toBe(2);
    // ⛔ THE DISCRIMINATING ASSERTION. Both land in the first bucket and neither moves maxMs, so
    // bucket-and-max assertions alone pass identically whether or not a clamp exists. The
    // separate counter is the only thing that can tell -5000 from 0.
    expect(r.negative).toBe(1);
    expect(r.histogram['0-1000']).toBe(2);
  });

  it('6. quantiles are bucket RANGES, never interpolated points', () => {
    for (let i = 0; i < 95; i++) recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW - 500 }));
    for (let i = 0; i < 5; i++) recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW - 1_000_000 }));
    const r = row()!;
    expect(r.p50Bucket).toBe('0-1000');
    expect(r.p95Bucket).toBe('0-1000');
    expect(r.p50Bucket).toMatch(/^\d+(-\d+|\+)$/);
  });

  it('7. the p95 moves into the tail bucket once the tail is big enough', () => {
    // ⚠️ 5_000_000, not 1_000_000. My first version asserted the open-ended top bucket for a
    // value that sits in `900000-1800000` — the TEST was wrong and the code was right. Recorded
    // because the reflex on a red test is to adjust the implementation, and here that would have
    // broken correct bucketing.
    for (let i = 0; i < 90; i++) recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW - 500 }));
    for (let i = 0; i < 10; i++) recordSideAgeAttempt(K, attempt({ sidesCapturedAtMs: NOW - 5_000_000 }));
    expect(row()!.p95Bucket).toBe('3600000+');
  });

  it('8. ⛔ STAGE is part of the key — two stages never pool', () => {
    recordSideAgeAttempt(K, attempt({ stage: 'active_signal_birth' }));
    recordSideAgeAttempt(K, attempt({ stage: 'rtb_refresh' }));
    recordSideAgeAttempt(K, attempt({ stage: 'rtb_refresh' }));
    expect(row('active:crypto_spot:active_signal_birth')!.observed).toBe(1);
    expect(row('active:crypto_spot:rtb_refresh')!.observed).toBe(2);
    // A stage never recorded is ABSENT from the rows, which is not the same as zero.
    expect(row('active:crypto_spot:exit_trigger')).toBeUndefined();
  });

  it('9. the venue clock is counted present/absent and never differenced away', () => {
    recordSideAgeAttempt(K, attempt({ venueObservedAtMs: NOW - 600 }));
    recordSideAgeAttempt(K, attempt({ venueObservedAtMs: null }));
    const r = row()!;
    expect(r.venueStampPresent).toBe(1);
    expect(r.venueStampAbsent).toBe(1);
    // Both attempts still count as observed — an absent VENUE stamp does not make the side
    // unobserved. Conflating the two clocks is the failure this separation exists to prevent.
    expect(r.observed).toBe(2);
  });

  it('10. ⛔ feed liveness is the DISTINCT-SYMBOL COUNT, with its window recorded beside it', () => {
    recordSideAgeAttempt(K, attempt({ feedDistinctSymbolsInWindow: 460 }));
    recordSideAgeAttempt(K, attempt({ feedDistinctSymbolsInWindow: 3 }));   // the socket-death shape
    recordSideAgeAttempt(K, attempt({ feedDistinctSymbolsInWindow: 455 }));
    const r = row()!;
    // MIN is the interesting end: it is the worst moment the feed was seen in.
    expect(r.feedDistinctSymbolsMin).toBe(3);
    expect(r.feedDistinctSymbolsMax).toBe(460);
    // ⛔ A COUNT WITHOUT ITS WINDOW IS UNINTERPRETABLE, so the window travels with it.
    expect(r.feedWindowMs).toBe(60_000);
  });

  it('10b. ⛔ the WS-push count is tracked SEPARATELY — a REST poller cannot mask a dead socket', () => {
    // The shape that matters: any-write count stays high because REST keeps polling, while the
    // push count collapses. Recording only the first would have reported a healthy feed.
    recordSideAgeAttempt(K, attempt({ feedDistinctSymbolsInWindow: 460, feedDistinctWsSymbolsInWindow: 455 }));
    recordSideAgeAttempt(K, attempt({ feedDistinctSymbolsInWindow: 458, feedDistinctWsSymbolsInWindow: 0 }));
    const r = row()!;
    // ⛔ THE DISCRIMINATING ASSERTION: the any-write floor never dropped, and the push floor did.
    expect(r.feedDistinctSymbolsMin).toBe(458);
    expect(r.feedDistinctWsSymbolsMin).toBe(0);
    expect(r.feedDistinctWsSymbolsMax).toBe(455);
    // A single "is the feed healthy" number built on the first count would read 458 and be wrong.
    expect(r.feedDistinctSymbolsMin! - r.feedDistinctWsSymbolsMin!).toBe(458);
  });

  it('11. the symbol gap is recorded even when the sides are unusable', () => {
    // An attempt that refuses on the side still tells us when we last heard from the symbol —
    // and that is precisely the case where we most need to know.
    recordSideAgeAttempt(K, attempt({ cacheEntryPresent: false, symbolLastMessageAtMs: NOW - 250_000 }));
    const r = row()!;
    expect(r.absent).toBe(1);
    expect(r.symbolGapObserved).toBe(1);
    expect(r.symbolGapHistogram['120000-300000']).toBe(1);
  });

  it('12. an unknown symbol gap is counted as unknown, not as a gap of zero', () => {
    recordSideAgeAttempt(K, attempt({ symbolLastMessageAtMs: null }));
    const r = row()!;
    expect(r.symbolGapUnknown).toBe(1);
    expect(r.symbolGapObserved).toBe(0);
    expect(r.symbolGapHistogram['0-1000']).toBe(0);
  });

  it('13. ⭐ per-symbol expected inter-arrival is derived at the read site, per symbol', () => {
    recordSideAgeAttempt(K, attempt({ symbol: 'BTC/USD', symbolLastMessageAtMs: NOW - 1_000 }));
    recordSideAgeAttempt(K, attempt({ symbol: 'BTC/USD', symbolLastMessageAtMs: NOW - 3_000 }));
    recordSideAgeAttempt(K, attempt({ symbol: 'USDC/USD', symbolLastMessageAtMs: NOW - 900_000 }));
    const rows = getSymbolGapRows();
    const btc = rows.find((r) => r.symbol === 'BTC/USD')!;
    const usdc = rows.find((r) => r.symbol === 'USDC/USD')!;
    expect(btc.n).toBe(2);
    expect(btc.meanMs).toBe(2_000);
    expect(btc.maxMs).toBe(3_000);
    expect(usdc.meanMs).toBe(900_000);
    // ⭐ THE WHOLE POINT OF THE SECOND TERM: 900s of silence is normal for one of these and
    // alarming for the other, and a single constant threshold cannot tell them apart.
    expect(usdc.meanMs).toBeGreaterThan(btc.meanMs * 100);
  });

  it('14. lanes, asset classes and stages never pool', () => {
    recordSideAgeAttempt({ lane: 'active', assetClass: 'crypto_spot' }, attempt());
    recordSideAgeAttempt({ lane: 'vts', assetClass: 'crypto_spot' }, attempt({ stage: 'vts_signal_birth', cacheEntryPresent: false }));
    recordSideAgeAttempt({ lane: 'active', assetClass: 'xstock_spot' }, attempt({ sidesCapturedAtMs: null }));
    const rows = getSideAgeRows();
    expect(rows).toHaveLength(3);
    expect(row('active:crypto_spot:active_signal_birth')!.observed).toBe(1);
    expect(row('vts:crypto_spot:vts_signal_birth')!.absent).toBe(1);
    expect(row('active:xstock_spot:active_signal_birth')!.unstamped).toBe(1);
    expect(row('vts:crypto_spot:vts_signal_birth')!.observed).toBe(0);
  });
});
