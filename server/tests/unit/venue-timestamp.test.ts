/**
 * B-PRICE-SIDE-BY-JOB §14 — THE VENUE'S OWN TIMESTAMP.
 *
 * ⛔ WHY THIS FILE EXISTS, AND IT IS A CORRECTION OF MY OWN WORK. I shipped
 * `recordVenueTimestampPresence` as a shadow-first instrument whose entire purpose is to prove
 * the venue actually sends a timestamp before anything gates on it. It went live and read
 * `ticker 15/0, book 3024/0` — every frame present, zero absent.
 *
 * ⛔⛔ AND A ZERO IN THE `absent` COLUMN IS WORTH NOTHING UNTIL THAT ARM HAS BEEN SHOWN TO FIRE.
 * As shipped, NOTHING in the repo exercised it. That is this project's own standing lesson —
 * *a control that cannot fire is the defect it guards* — committed by the session that wrote
 * the lesson down. The live zero is now a MEASUREMENT rather than an assumption, because the
 * arm that would have contradicted it is proved capable of firing below.
 *
 * ⭐ THE MUTATION THAT MATTERS is `parseVenueTimestampMs` acquiring a `?? Date.now()` fallback.
 * That is the single most plausible "helpful" edit a future session could make to this function,
 * and it would silently rebuild the exact defect the field was added to end: a fabricated venue
 * time is indistinguishable from a real one, whereas `null` is refusable. §14's own words:
 * *"a fabricated venue time is worse than an absent one."* Test 3 exists to make that edit red.
 */
import { describe, it, expect } from 'vitest';
import {
  parseVenueTimestampMs,
  recordVenueTimestampPresence,
  getVenueTimestampPresence,
} from '../../exchanges/kraken/kraken-websocket-adapter.js';

/** The counter is module-global with no reset hook, so every assertion is on a DELTA. */
function presenceOf(channel: string): { present: number; absent: number } {
  const row = getVenueTimestampPresence()[channel];
  return row ? { ...row } : { present: 0, absent: 0 };
}

describe('parseVenueTimestampMs — the venue clock, or nothing', () => {
  it('1. parses Kraken\'s own documented RFC3339 form to the right INSTANT', () => {
    // Kraken's published ticker example. The expected value is built from Date.UTC rather than
    // Date.parse so the assertion does not simply re-run the implementation against itself.
    const expected = Date.UTC(2023, 8 /* Sep */, 25, 9, 4, 31, 742);
    expect(parseVenueTimestampMs('2023-09-25T09:04:31.742648Z')).toBe(expected);
  });

  it('2. returns null for every shape the venue can hand us that is not a timestamp', () => {
    for (const bad of [undefined, null, '', 42, {}, [], 'not-a-date', NaN, true]) {
      expect(parseVenueTimestampMs(bad)).toBeNull();
    }
  });

  it('3. ⛔ NEVER substitutes our own clock for an unparseable venue stamp', () => {
    // The discriminating assertion: a `?? Date.now()` fallback would return a number within a
    // few ms of now. Asserting `toBeNull()` alone would also pass on a fallback returning 0,
    // so the second expectation names the specific wrong value this test is built to catch.
    const before = Date.now();
    const got = parseVenueTimestampMs('garbage');
    const after = Date.now();
    expect(got).toBeNull();
    expect(
      typeof got === 'number' && (got as number) >= before && (got as number) <= after,
    ).toBe(false);
  });
});

describe('recordVenueTimestampPresence — BOTH arms, because the live zero rests on this', () => {
  it('4. the PRESENT arm increments, and only that arm', () => {
    const ch = `__test_present_${Math.random().toString(36).slice(2)}`;
    const before = presenceOf(ch);
    recordVenueTimestampPresence(ch, true);
    const after = presenceOf(ch);
    expect(after.present - before.present).toBe(1);
    expect(after.absent - before.absent).toBe(0);
  });

  it('5. ⭐ the ABSENT arm increments — the arm live traffic has never exercised', () => {
    const ch = `__test_absent_${Math.random().toString(36).slice(2)}`;
    const before = presenceOf(ch);
    recordVenueTimestampPresence(ch, false);
    const after = presenceOf(ch);
    expect(after.absent - before.absent).toBe(1);
    expect(after.present - before.present).toBe(0);
  });

  it('6. counts accumulate per channel and do not bleed across channels', () => {
    const a = `__test_a_${Math.random().toString(36).slice(2)}`;
    const b = `__test_b_${Math.random().toString(36).slice(2)}`;
    recordVenueTimestampPresence(a, true);
    recordVenueTimestampPresence(a, true);
    recordVenueTimestampPresence(a, false);
    recordVenueTimestampPresence(b, false);
    expect(presenceOf(a)).toEqual({ present: 2, absent: 1 });
    expect(presenceOf(b)).toEqual({ present: 0, absent: 1 });
  });

  it('7. the getter returns a COPY — a caller cannot mutate the counter through it', () => {
    const ch = `__test_copy_${Math.random().toString(36).slice(2)}`;
    recordVenueTimestampPresence(ch, true);
    const snapshot = getVenueTimestampPresence();
    snapshot[ch].present = 9999;
    expect(presenceOf(ch).present).toBe(1);
  });
});
