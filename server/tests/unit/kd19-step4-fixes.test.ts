/**
 * KD-19 (b) + (c) exit leg — Langston's Step-4 ruling (CHANGES-1 + folds 2-4), `B-PRICE-SIDE-BY-JOB` row 17.
 * Record: `B_PRICE_SIDE_BY_JOB_KD19_PRE_AUDIT.md` §11.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bookVtsExit } from '../../core/trading/vts-exit-booking.js';
import { countVtsExitWalk, formatVtsExitCounters, newVtsExitCounters } from '../../core/trading/vts-exit-counters.js';

const ROOT = join(__dirname, '..', '..', '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const RUNNER = src('server/services/vts-runner.ts');

describe('CHANGES-1 — only a PRICED close carries exitWalk (carrying it == priced)', () => {
  it('the real-lane push site writes exitWalk only when the booking has a price', () => {
    expect(RUNNER).toContain('...(_vtsBooked.price !== null ? { exitWalk: exitWalkRecord(_vtsBooked) } : {}),');
    // mutation guard: the unconditional form must not come back
    expect(RUNNER).not.toMatch(/^\s*exitWalk: exitWalkRecord\(_vtsBooked\),\s*$/m);
  });
  it('the tradesToClose field is optional, and the recompose reads it optionally', () => {
    expect(RUNNER).toMatch(/exitWalk\?: VtsExitWalkRecord;\n\s*\}> = \[\];/);
    expect(RUNNER).toContain('recomposeVtsCloseFriction(trade, exitArm, exitWalk?.impactPriced === true)');
  });
  it('the three durable sinks pass exitWalk through, so an unpriced close (undefined) writes no key', () => {
    expect(RUNNER).toContain('...(exitWalk ? { exitWalk } : {}),');
    expect((RUNNER.match(/exitBookingArm: exitArm, exitWalk,/g) ?? []).length).toBe(2);
  });
  it('an unpriced booking is the case the guard keys on: price null, sizeBasis absent', () => {
    const r = bookVtsExit({ observedBid: null, observedMark: 100, quantity: 2, depth: null, penaltyBps: 50 });
    expect(r.price).toBeNull();
    expect(r.sizeBasis).toBe('absent');
  });
});

describe('fold 2 — a priced real-lane unit_lane exit is counted, so the pass line sums', () => {
  it('counts unit_lane and prints it', () => {
    const c = newVtsExitCounters();
    const w = bookVtsExit({ observedBid: 100, observedMark: 100.05, quantity: 0, depth: null, penaltyBps: 50 });
    expect(w.sizeBasis).toBe('unit_lane');
    countVtsExitWalk(c.crypto_spot, w);
    expect(c.crypto_spot.unitLane).toBe(1);
    expect(formatVtsExitCounters(c)).toContain('noDepthConfig=0 unitLane=1}');
  });
  it('an UNPRICED booking is not counted by the walk counter (its arm counter owns it)', () => {
    const c = newVtsExitCounters();
    countVtsExitWalk(c.crypto_spot, bookVtsExit({ observedBid: null, observedMark: 100, quantity: 0, depth: null, penaltyBps: 50 }));
    expect(c.crypto_spot).toMatchObject({ walked: 0, sizeAbsent: 0, noDepthConfig: 0, unitLane: 0 });
  });
});

describe('fold 3 — the WS ticker sizes are read through the narrowed type, not a cast', () => {
  it('no `as any` on bid_qty / ask_qty', () => {
    const ADAPTER = src('server/exchanges/kraken/kraken-websocket-adapter.ts');
    expect(ADAPTER).toContain("sideSizesOf(update.bid_qty, update.ask_qty, 'exact')");
    expect(ADAPTER).not.toMatch(/\(update as any\)\?\.(bid_qty|ask_qty)/);
  });
});

describe('fold 4 — the open table passes the trade to both share readers', () => {
  it('slippage share mirrors the spread share', () => {
    expect(RUNNER).toContain('const _sh = vtsSpreadShareByLeg(trade, false);');
    expect(RUNNER).toContain('const _sl = vtsSlippageShareByLeg(trade, false);');
  });
});
