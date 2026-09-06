/**
 * B-PRICE-SIDE-BY-JOB — SIDE-AGE AT LEVEL-BUILD TIME.
 *
 * ⛔ WHAT THIS INSTRUMENT IS FOR. Langston required the age of the quote we would build a level
 * from, AT READ TIME, and correctly refused my archive-derived figure as a proxy — the archiver
 * is a different subscriber with its own socket and throttle, so it bounds the venue's cadence
 * and says nothing about the entry this process holds. This measures the second quantity.
 *
 * ⛔⛔ THE PROPERTY THAT MATTERS MOST IS TEST 3, AND IT IS THE ONE A REASONABLE PERSON WOULD
 * GET WRONG: an entry that exists but whose sides no writer ever supplied is UNSTAMPED, and
 * must NOT be recorded as age zero. Age zero is the freshest possible reading; "we never
 * observed a side" is the least informative one. Collapsing them reports the healthiest
 * possible number for a state we know nothing about — #546's shape, in a histogram.
 *
 * ⛔ AND TEST 5: a NEGATIVE age is recorded, not clamped. It means the capture stamp sits in
 * this process's future — clock skew, or a venue stamp differenced against ours — which is
 * precisely what capturing the venue timestamp exists to expose. Clamping to zero would hide
 * the unhealthiest state behind the healthiest number.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSideAgeObservation,
  getSideAgeRows,
  __resetSideAgeForTest,
  SIDE_AGE_BUCKET_EDGES_MS,
} from '../../core/calculations/level-basis.js';

const K = { lane: 'active' as const, assetClass: 'crypto_spot' };
const row = () => getSideAgeRows().find((r) => r.key === 'active:crypto_spot');

describe('side-age instrument', () => {
  beforeEach(() => __resetSideAgeForTest());

  it('1. an observation lands in the bucket whose upper edge it is strictly below', () => {
    recordSideAgeObservation(K, { kind: 'observed', ageMs: 500 });      // < 1000
    recordSideAgeObservation(K, { kind: 'observed', ageMs: 1_000 });    // NOT < 1000 -> next
    recordSideAgeObservation(K, { kind: 'observed', ageMs: 250_000 });  // 120k-300k
    const r = row()!;
    expect(r.histogram['0-1000']).toBe(1);
    expect(r.histogram['1000-2000']).toBe(1);
    expect(r.histogram['120000-300000']).toBe(1);
  });

  it('2. an age past the last edge lands in the open-ended top bucket', () => {
    const last = SIDE_AGE_BUCKET_EDGES_MS[SIDE_AGE_BUCKET_EDGES_MS.length - 1];
    recordSideAgeObservation(K, { kind: 'observed', ageMs: last * 10 });
    const r = row()!;
    expect(r.histogram[`${last}+`]).toBe(1);
    expect(r.maxMs).toBe(last * 10);
  });

  it('3. ⛔ absent and unstamped are counted apart and NEVER as age zero', () => {
    recordSideAgeObservation(K, { kind: 'absent' });
    recordSideAgeObservation(K, { kind: 'unstamped' });
    recordSideAgeObservation(K, { kind: 'unstamped' });
    const r = row()!;
    expect(r.absent).toBe(1);
    expect(r.unstamped).toBe(2);
    expect(r.observed).toBe(0);
    // The discriminating assertion: none of them leaked into the freshest bucket.
    expect(r.histogram['0-1000']).toBe(0);
    // And with nothing observed, a quantile is null rather than a fabricated "0-1000".
    expect(r.p50Bucket).toBeNull();
    expect(r.p95Bucket).toBeNull();
  });

  it('4. attempted equals observed + absent + unstamped — the arithmetic a reader can check', () => {
    recordSideAgeObservation(K, { kind: 'observed', ageMs: 10 });
    recordSideAgeObservation(K, { kind: 'absent' });
    recordSideAgeObservation(K, { kind: 'unstamped' });
    const r = row()!;
    expect(r.attempted).toBe(r.observed + r.absent + r.unstamped);
    expect(r.attempted).toBe(3);
  });

  it('5. ⛔ a negative age is recorded, not clamped to zero', () => {
    recordSideAgeObservation(K, { kind: 'observed', ageMs: -5_000 });
    recordSideAgeObservation(K, { kind: 'observed', ageMs: 0 });
    const r = row()!;
    expect(r.observed).toBe(2);
    // ⛔ THE DISCRIMINATING ASSERTION, and my first version of this test did NOT have it.
    // Both values land in the first bucket and neither moves `maxMs`, so bucket-and-max
    // assertions alone pass identically whether or not a clamp exists. The separate counter
    // is the only thing that can tell -5000 from 0.
    expect(r.negative).toBe(1);
    expect(r.histogram['0-1000']).toBe(2);
  });

  it('6. quantiles are bucket RANGES, never interpolated points', () => {
    for (let i = 0; i < 95; i++) recordSideAgeObservation(K, { kind: 'observed', ageMs: 500 });
    for (let i = 0; i < 5; i++) recordSideAgeObservation(K, { kind: 'observed', ageMs: 1_000_000 });
    const r = row()!;
    expect(r.p50Bucket).toBe('0-1000');
    expect(r.p95Bucket).toBe('0-1000');
    // A range, not a number — asserting the SHAPE is what stops a later "helpful" interpolation.
    expect(typeof r.p50Bucket).toBe('string');
    expect(r.p50Bucket).toMatch(/^\d+(-\d+|\+)$/);
  });

  it('7. the p95 moves into the tail bucket once the tail is big enough', () => {
    // ⚠️ 5_000_000 ms, not 1_000_000. My first version of this test asserted the open-ended
    // top bucket for a value of 1_000_000, which sits in `900000-1800000` — the test was wrong
    // and the code was right. Recorded rather than silently corrected: the temptation on a red
    // test is to adjust the implementation, and here that would have broken correct bucketing.
    for (let i = 0; i < 90; i++) recordSideAgeObservation(K, { kind: 'observed', ageMs: 500 });
    for (let i = 0; i < 10; i++) recordSideAgeObservation(K, { kind: 'observed', ageMs: 5_000_000 });
    expect(row()!.p95Bucket).toBe('3600000+');
  });

  it('8. lanes and asset classes never pool', () => {
    recordSideAgeObservation({ lane: 'active', assetClass: 'crypto_spot' }, { kind: 'observed', ageMs: 100 });
    recordSideAgeObservation({ lane: 'vts', assetClass: 'crypto_spot' }, { kind: 'absent' });
    recordSideAgeObservation({ lane: 'active', assetClass: 'xstock_spot' }, { kind: 'unstamped' });
    const rows = getSideAgeRows();
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.key === 'active:crypto_spot')!.observed).toBe(1);
    expect(rows.find((r) => r.key === 'vts:crypto_spot')!.absent).toBe(1);
    expect(rows.find((r) => r.key === 'active:xstock_spot')!.unstamped).toBe(1);
    // No row carries another's counts.
    expect(rows.find((r) => r.key === 'vts:crypto_spot')!.observed).toBe(0);
  });
});
