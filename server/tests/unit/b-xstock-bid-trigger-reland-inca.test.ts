/**
 * B-XSTOCK-BID-TRIGGER-RELAND increment A (row 2) — P1 the ring-independent release, P2 the yield keeps an implausible
 * chain, P3 entry spread plausibility, P4 the newest-row depth verdict, P5 the refusal-duration tally.
 * Plan: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCA_PRE_AUDIT.md` r5 (Langston-accepted).
 *
 * ⛔ P1 drives the REAL tracker (`advanceBookStateComparator`) — the state machine the engine branches on. Each refusal
 *   case is paired with a release case on the same shape so no test can pass because the release never runs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dbExecute = vi.hoisted(() => vi.fn());
vi.mock('../../db.js', () => ({ db: { execute: (q: unknown) => dbExecute(q) } }));

import {
  advanceBookStateComparator,
  clearBookStateComparator,
  readBookStateComparator,
  readRetainedRingMedian,
  readRiLastMiss,
  _peekRetainedRingForTest,
  _resetBookStateComparatorsForTest,
} from '../../asset_classes/xstock_spot/book-state-tracker';
import { judgeEntrySpread, resolveEntryYardstick } from '../../asset_classes/xstock_spot/entry-spread-plausibility';
import { getDepthSnapshot } from '../../services/execution/depth-source';
import { newExitRefusalTally, noteRefusal, noteRelease, snapshotExitRefusal, EPISODE_GAP_MS } from '../../services/exit-refusal-tally';

const SYM = 'HUT/USD';
const K_REL = 3;
const WINDOW = 20;
const CEIL = 0.01; // 1%, the seeded value
let warn: ReturnType<typeof vi.spyOn>;
let t = 1_000;
const tick = () => (t += 1_500);

/** A live, moving, tight daytime book (spread ≈ 0.054%, HUT's retained median at its 10-06 seed), then a yield-clear. */
function retainTightRing(): void {
  for (let i = 0; i < 25; i++) {
    const bid = 92 + i * 0.01;
    advanceBookStateComparator(SYM, { bid, ask: bid + 0.05, last: bid + 0.02, atMs: tick() }, WINDOW, true, K_REL, CEIL);
  }
  clearBookStateComparator(SYM, 'yield_after_60_hollow');
}
/** One frame at a spread fraction around a moving mid (both sides move with `i`). */
function moving(spreadFrac: number, i: number, ceil: number | null = CEIL): void {
  const mid = 92 + (i % 7) * 0.03;
  const half = (mid * spreadFrac) / 2;
  advanceBookStateComparator(SYM, { bid: mid - half, ask: mid + half, last: mid, atMs: tick() }, WINDOW, true, K_REL, ceil);
}
const riLines = () => warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes(' SEED_ESCAPED_RI '));

beforeEach(() => {
  _resetBookStateComparatorsForTest();
  dbExecute.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('P1 — the ring-independent release (objective 1b)', () => {
  it('RELEASES a tight, moving after-hours book the ring calls implausible (the GLW/HUT shape)', () => {
    retainTightRing();
    moving(0.006, 0); // 0.6% against a 0.054% ring = ratio ~11 ⇒ SEED_IMPLAUSIBLE; under the 1% ceiling
    expect(readBookStateComparator(SYM)?.seedImplausible).toBe(true);
    for (let i = 1; i <= WINDOW + 2 && riLines().length === 0; i++) moving(0.006, i);
    expect(riLines()).toHaveLength(1);
    const c = readBookStateComparator(SYM)!;
    expect(c.seedImplausible).toBe(false);   // the new chain is not judged against the ring it overrode
    expect(c.seedRetainedMedian).toBeNull(); // seeded `vacuous`, honestly
    expect(_peekRetainedRingForTest(SYM)).toBeNull(); // the ring is consumed, as any plausible seed consumes it
    expect(c.validated).toBe(false);         // not on the release frame itself …
    moving(0.006, 99);
    expect(readBookStateComparator(SYM)!.validated).toBe(true); // … but on the next two-sided frame
  });

  it('CONTROL — the same book with the ceiling unset (null) is held, exactly as before this batch', () => {
    retainTightRing();
    for (let i = 0; i < 40; i++) moving(0.006, i, null);
    expect(riLines()).toHaveLength(0);
    expect(readBookStateComparator(SYM)?.seedImplausible).toBe(true);
  });

  it('a STUB ASK (only the bid moves) is never released — clause (d), both sides moved', () => {
    retainTightRing();
    const ask = 92.3;
    for (let i = 0; i < 40; i++) {
      const bid = 91.9 + (i % 5) * 0.01; // spread ≈ 0.4-0.43%, under the ceiling; the ask never moves
      advanceBookStateComparator(SYM, { bid, ask, last: 92.1, atMs: tick() }, WINDOW, true, K_REL, CEIL);
    }
    expect(riLines()).toHaveLength(0);
    expect(readRiLastMiss(SYM)?.failed).toEqual(['both_sides']);
    expect(readRiLastMiss(SYM)?.bidMoved).toBe(true);
    expect(readRiLastMiss(SYM)?.askMoved).toBe(false);
  });

  it('the collapsed 7.00/503 book is never released — the ceiling', () => {
    retainTightRing();
    for (let i = 0; i < 40; i++) {
      advanceBookStateComparator(SYM, { bid: 7 + (i % 3) * 0.01, ask: 1000 - (i % 4), last: 247, atMs: tick() }, WINDOW, true, K_REL, CEIL);
    }
    expect(riLines()).toHaveLength(0);
    expect(readRiLastMiss(SYM)?.failed).toContain('frame');
    expect(readRiLastMiss(SYM)?.failed).toContain('window_median');
  });

  it('a single tight print inside a blown book is never released — the full window', () => {
    retainTightRing();
    for (let i = 0; i < 25; i++) moving(0.05, i); // 5% blown
    moving(0.004, 30);                             // one tight print
    expect(riLines()).toHaveLength(0);
    expect(readRiLastMiss(SYM)?.failed).toContain('window_median');
  });

  it('a FROZEN tight book is never released — the moves clause', () => {
    retainTightRing();
    for (let i = 0; i < 40; i++) {
      advanceBookStateComparator(SYM, { bid: 91.8, ask: 92.3, last: 92, atMs: tick() }, WINDOW, true, K_REL, CEIL);
    }
    expect(riLines()).toHaveLength(0);
    expect(readRiLastMiss(SYM)?.failed).toEqual(['moves', 'both_sides']);
  });

  it('a chain that was NOT seeded implausible is never touched by the release', () => {
    for (let i = 0; i < 40; i++) moving(0.006, i);
    expect(riLines()).toHaveLength(0);
    expect(readRiLastMiss(SYM)).toBeNull();
  });
});

describe('P2 — the hollow yield keeps a seedImplausible chain (fence on the engine source)', () => {
  const AEE = readFileSync(join(__dirname, '..', '..', 'services', 'active-execution-engine.ts'), 'utf8');
  const yieldAt = AEE.indexOf('clearBookStateComparator(position.symbol, `yield_after_${_next}_hollow`)');
  it('CONTROL: the yield clear exists', () => { expect(yieldAt).toBeGreaterThan(0); });
  it('the yield clear is guarded by the chain NOT being seedImplausible', () => {
    const before = AEE.slice(Math.max(0, yieldAt - 200), yieldAt);
    expect(before).toMatch(/readBookStateComparator\(position\.symbol\)\?\.seedImplausible !== true\)\s*\{\s*$/);
  });
  it('CONTROL: an unguarded fixture is caught', () => {
    const fixture = "                  bookStateYielded = true;\n                  clearBookStateComparator(position.symbol, `yield_after_${_next}_hollow`)";
    const at = fixture.indexOf('clearBookStateComparator(');
    expect(fixture.slice(0, at)).not.toMatch(/seedImplausible !== true\)\s*\{\s*$/);
  });
});

describe('P3 — entry spread plausibility (hour-invariant yardstick)', () => {
  it('refuses an off-hours 2.9% book whose regular-session norm is 0.03% (Langston 10-08 02:00Z shape)', () => {
    expect(judgeEntrySpread(0.029, 0.0003, K_REL, 1.0)).toEqual({ refuse: true, threshold: 0.01 });
  });
  it('passes a normal book, and the 1% floor admits a book under 1% whatever the norm', () => {
    expect(judgeEntrySpread(0.0009, 0.0009, K_REL, 1.0).refuse).toBe(false);
    expect(judgeEntrySpread(0.0099, 0.0001, K_REL, 1.0).refuse).toBe(false);
  });
  it('a stub ask and a collapsed bid both WIDEN the spread, so both are refused', () => {
    const mid = (100 + 180) / 2; // stub ask
    expect(judgeEntrySpread((180 - 100) / mid, 0.001, K_REL, 1.0).refuse).toBe(true);
    const mid2 = (60 + 100.1) / 2; // collapsed bid
    expect(judgeEntrySpread((100.1 - 60) / mid2, 0.001, K_REL, 1.0).refuse).toBe(true);
  });
  it('prefers the LIVE retained ring and never touches the DB when one exists', async () => {
    for (let i = 0; i < 25; i++) {
      const bid = 50 + i * 0.01;
      advanceBookStateComparator('RING/USD', { bid, ask: bid + 0.02, last: bid, atMs: tick() }, WINDOW, true, K_REL, CEIL);
    }
    clearBookStateComparator('RING/USD', 'yield_after_60_hollow');
    expect(readRetainedRingMedian('RING/USD')).toBeGreaterThan(0);
    const y = await resolveEntryYardstick('RING/USD', WINDOW);
    expect(y.basis).toBe('ring');
    expect(dbExecute).not.toHaveBeenCalled();
  });
  it('else reads the regular-session snapshots, and under a full window it passes LABELLED', async () => {
    dbExecute.mockResolvedValueOnce({ rows: [{ n: '20', med: '0.0003' }] });
    expect(await resolveEntryYardstick('ABC/USD', WINDOW)).toEqual({ median: 0.0003, basis: 'regular_session', n: 20 });
    const q = JSON.stringify(dbExecute.mock.calls[0][0]);
    expect(q).toContain('is_extended_hours = false'); // MUTATION: a trailing window without this filter fails here
    dbExecute.mockResolvedValueOnce({ rows: [{ n: '7', med: '0.0004' }] });
    expect((await resolveEntryYardstick('ABC/USD', WINDOW)).basis).toBe('under_window');
    dbExecute.mockRejectedValueOnce(new Error('boom'));
    expect((await resolveEntryYardstick('ABC/USD', WINDOW)).basis).toBe('read_failed');
  });
});

describe('P4 — the newest xStock row and its per-side verdict', () => {
  const row = (bid: string | null, bq: string | null, ask: string | null, aq: string | null) => ({ rows: [{ bid, bid_qty: bq, ask, ask_qty: aq, age_ms: '1200' }] });
  it('a complete newest row returns as before, verdict ok/ok', async () => {
    dbExecute.mockResolvedValueOnce(row('100', '5', '100.2', '7'));
    const s = await getDepthSnapshot('ABC/USD', 'xstock_spot');
    expect(s?.verdict).toEqual({ bid: 'ok', ask: 'ok' });
    expect(s?.bids[0]).toEqual({ price: 100, qty: 5 });
    expect(dbExecute).toHaveBeenCalledTimes(1);
  });
  it('a newest row with the bid SIZE missing returns qty_absent with qty 0 — never the older row', async () => {
    dbExecute.mockResolvedValueOnce(row('100', null, '100.2', '7'));
    const s = await getDepthSnapshot('ABC/USD', 'xstock_spot');
    expect(s?.verdict).toEqual({ bid: 'qty_absent', ask: 'ok' });
    expect(s?.bids[0]).toEqual({ price: 100, qty: 0 });
    expect(s?.fromLastTwoSided).toBeUndefined();
    expect(dbExecute).toHaveBeenCalledTimes(1);
  });
  it('a missing PRICE leaves that side empty', async () => {
    dbExecute.mockResolvedValueOnce(row(null, null, '100.2', '7'));
    const s = await getDepthSnapshot('ABC/USD', 'xstock_spot');
    expect(s?.verdict?.bid).toBe('price_absent');
    expect(s?.bids).toEqual([]);
  });
  it('the FLATTEN (allowLastTwoSided) gets the last complete row, exactly the pre-P4 read', async () => {
    dbExecute.mockResolvedValueOnce(row('100', null, '100.2', '7'));
    dbExecute.mockResolvedValueOnce(row('99.9', '4', '100.1', '6'));
    const s = await getDepthSnapshot('ABC/USD', 'xstock_spot', { allowLastTwoSided: true });
    expect(s?.fromLastTwoSided).toBe(true);
    expect(s?.bids[0]).toEqual({ price: 99.9, qty: 4 }); // an off-hours flatten still resolves a price
    expect(s?.verdict).toEqual({ bid: 'qty_absent', ask: 'ok' });
    expect(JSON.stringify(dbExecute.mock.calls[1][0])).toContain('bid_qty > 0');
  });
});

describe('P5 — the refusal-duration tally', () => {
  it('counts episodes split by the gap, time within an episode, the longest, and the release distance', () => {
    const tl = newExitRefusalTally(true);
    noteRefusal(tl, 'unvalidated', 0);
    noteRefusal(tl, 'unvalidated', 1_500);
    noteRefusal(tl, 'hollow_skip', 3_000);
    expect(tl.episodes).toBe(1);
    expect(tl.refusedMs).toBe(3_000);
    expect(noteRelease(tl, 99, 100)).toBe(true);           // bid 1% under the stop at release
    expect(tl.lastReleaseBidToStopPct).toBeCloseTo(-1, 6);
    expect(noteRelease(tl, 99, 100)).toBe(false);          // one release per episode
    noteRefusal(tl, 'yield_refused', 3_000 + EPISODE_GAP_MS + 1);
    expect(tl.episodes).toBe(2);
    expect(tl.refusedMs).toBe(3_000);                      // the gap is not refused time
    const snap = snapshotExitRefusal(tl);
    expect(snap).toMatchObject({ sinceRestart: true, refusedTicks: 4, episodes: 2, releases: 1, open: true });
    expect(snap.byKind).toEqual({ hollow_skip: 1, yield_refused: 1, unvalidated: 2 });
    expect('lastRefuseAtMs' in snap).toBe(false);
  });
  it('a release with no bid or no stop counts, and leaves the distance null rather than inventing one', () => {
    const tl = newExitRefusalTally(false);
    noteRefusal(tl, 'unvalidated', 0);
    expect(noteRelease(tl, null, 100)).toBe(true);
    expect(tl.lastReleaseBidToStopPct).toBeNull();
  });
});
