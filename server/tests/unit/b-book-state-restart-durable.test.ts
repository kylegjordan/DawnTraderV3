/**
 * `3n.q8` `B-BOOK-STATE-RESTART-DURABLE` (#1066) — the xStock book-state guard's retained rings survive a restart.
 *
 * ✅ DRIVES THE REAL TRACKER (`f73fbfd0d`'s rule: no rule restated in a fixture). Every assertion reads the state
 * the engine branches on — `readBookStateComparator`, the retained entry, the snapshot — never a local boolean.
 *
 * WHAT IT PINS (Step-2 plan P8, Langston-approved r2):
 *   1. the ONE shared predicate: the snapshot's live arm agrees with what a clear retains, case by case;
 *   2. INVARIANT I-1: `retainsRing` is monotone over a chain's life (the snapshot of a live chain rests on it);
 *   3. the snapshot's three arms (live / retained / nothing);
 *   4. restore: a partial store loads its good rows and counts the bad; restore never overwrites live evidence;
 *   5. condition 5: a restored ring judges one seed and is gone — consumed at the first PLAUSIBLE seed only;
 *   6. THE §0 REPLAY (the mechanism proof): ANET's 0.32368 seed is accepted unjudged on an empty ring (today)
 *      and REFUSED once the ring is restored;
 *   7. the whole-store failure path: falls back to empty maps and raises the resolve-never-ack alert;
 *   8. the snapshot write: one upsert per ring plus one delete-absent, in one transaction.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const execute = vi.fn();
const transaction = vi.fn();
vi.mock('../../db', () => ({ db: { execute: (...a: unknown[]) => execute(...a), transaction: (...a: unknown[]) => transaction(...a) } }));
const addAlert = vi.fn();
vi.mock('../../services/system-alerts', () => ({ addAlert: (...a: unknown[]) => addAlert(...a) }));
let configImpl: () => { trailingSpreadWindowSnaps: number } = () => ({ trailingSpreadWindowSnaps: 20 });
vi.mock('../../asset_classes/xstock_spot/book-state-config', () => ({
  resolveBookStateConfigSync: () => configImpl(),
}));

import {
  advanceBookStateComparator,
  clearBookStateComparator,
  readBookStateComparator,
  retainsRing,
  snapshotRetainableRings,
  restoreRetainedRings,
  _peekRetainedRingForTest,
  _resetBookStateComparatorsForTest,
} from '../../asset_classes/xstock_spot/book-state-tracker';
import {
  validateRingRows,
  applyRestoredRings,
  restoreRingsAtBoot,
  persistRingSnapshot,
  RING_RESTORE_ALERT_KEY,
} from '../../asset_classes/xstock_spot/book-state-ring-store';

const K_REL = 3;
const WINDOW = 20;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _resetBookStateComparatorsForTest();
  execute.mockReset();
  transaction.mockReset();
  addAlert.mockReset();
  configImpl = () => ({ trailingSpreadWindowSnaps: 20 });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

/** A live, MOVING, healthy book (spread ≈0.40%): the chain a clear retains. */
function movingHealthyChain(sym: string, atMs = 1_000, frames = 5): void {
  for (let i = 0; i < frames; i++) {
    const d = i * 0.01;
    advanceBookStateComparator(sym, { bid: 247.01 + d, ask: 248.0 + d, last: 247.25 + d, atMs: atMs + i * 1_000 }, WINDOW, true, K_REL);
  }
}
/** A FROZEN book: identical frames, so it never sets `observedMovement`. */
function frozenChain(sym: string, atMs = 1_000, frames = 5): void {
  for (let i = 0; i < frames; i++) {
    advanceBookStateComparator(sym, { bid: 100, ask: 100.4, last: 100.2, atMs: atMs + i * 1_000 }, WINDOW, true, K_REL);
  }
}
const HOLLOW = { bid: 7, ask: 1000, last: 247.25 };

describe('1 — ONE shared predicate: the snapshot agrees with the clear, case by case', () => {
  const cases: Array<[string, (sym: string) => void]> = [
    ['moving healthy (retained)', (s) => movingHealthyChain(s)],
    ['frozen (not retained)', (s) => frozenChain(s)],
    ['implausible seed (not retained)', (s) => { movingHealthyChain(s); clearBookStateComparator(s, 'yield'); advanceBookStateComparator(s, { ...HOLLOW, atMs: 90_000 }, WINDOW, false, K_REL); advanceBookStateComparator(s, { bid: 8, ask: 1000, last: 247, atMs: 91_000 }, WINDOW, false, K_REL); }],
  ];
  for (const [name, build] of cases) {
    it(`${name}: snapshot live-arm ⇔ what the clear retains`, () => {
      const sym = 'EQV/USD';
      build(sym);
      const before = _peekRetainedRingForTest(sym);
      const snap = snapshotRetainableRings().find((e) => e.symbol === sym && e.source === 'live');
      const cmp = readBookStateComparator(sym)!;
      clearBookStateComparator(sym, 'test_clear');
      const after = _peekRetainedRingForTest(sym);
      // The equivalence the shared predicate guarantees: the snapshot has a live entry EXACTLY when the clear
      // writes a new retained entry, and the two carry the same ring and the same provenance.
      expect(Boolean(snap)).toBe(retainsRing(cmp));
      if (snap) {
        expect(after).not.toBe(before);
        expect(after!.restored).toBe(false);
        expect(after!.spreads).toEqual(snap.spreads);
        expect(after!.seedBasis).toBe(snap.seedBasis);
      } else {
        expect(after).toBe(before);
      }
    });
  }
});

describe('2 — INVARIANT I-1: retainsRing is monotone over a chain\'s life', () => {
  it('once a chain retains, every later advance keeps it retaining (moving, frozen, wider-but-two-sided frames)', () => {
    const sym = 'MONO/USD';
    movingHealthyChain(sym);
    expect(retainsRing(readBookStateComparator(sym)!)).toBe(true);
    const later = [
      { bid: 247.05, ask: 248.04 }, { bid: 247.05, ask: 248.04 }, { bid: 246.9, ask: 248.3 },
      { bid: 246.9, ask: 248.3 }, { bid: 247.2, ask: 247.9 },
    ];
    later.forEach((f, i) => {
      advanceBookStateComparator(sym, { ...f, last: 247.3, atMs: 10_000 + i * 1_000 }, WINDOW, true, K_REL);
      expect(retainsRing(readBookStateComparator(sym)!)).toBe(true);
    });
  });
  it('a seed-implausible chain never becomes retaining by advancing (seedImplausible is fixed at the seed)', () => {
    const sym = 'IMPL/USD';
    movingHealthyChain(sym);
    clearBookStateComparator(sym, 'yield');
    advanceBookStateComparator(sym, { ...HOLLOW, atMs: 90_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(sym)!.seedImplausible).toBe(true);
    for (let i = 1; i <= 6; i++) {
      advanceBookStateComparator(sym, { bid: 7 + i, ask: 1000 - i, last: 247, atMs: 90_000 + i * 1_000 }, WINDOW, false, K_REL);
      const c = readBookStateComparator(sym)!;
      expect(c.seedImplausible).toBe(true);
      expect(retainsRing(c)).toBe(false);
    }
  });
});

describe('3 — the snapshot\'s three arms', () => {
  it('live: a moving healthy chain contributes its own spreads', () => {
    movingHealthyChain('LIVE/USD');
    const e = snapshotRetainableRings().find((x) => x.symbol === 'LIVE/USD')!;
    expect(e.source).toBe('live');
    expect(e.spreads).toEqual(readBookStateComparator('LIVE/USD')!.spreads);
    expect(e.seedBasis).toBe('vacuous'); // a cold-start chain: its own seed had no ring
    expect(e.writtenAtMs).toBe(readBookStateComparator('LIVE/USD')!.priorAtMs); // feed time, not the clock
    expect(e.writtenAtMs).toBe(5_000);
  });
  it('retained: an implausible live chain contributes the retained ring, NOT its own spreads', () => {
    const sym = 'RET/USD';
    movingHealthyChain(sym);
    clearBookStateComparator(sym, 'yield');
    const retained = _peekRetainedRingForTest(sym)!;
    advanceBookStateComparator(sym, { ...HOLLOW, atMs: 90_000 }, WINDOW, false, K_REL);
    const e = snapshotRetainableRings().find((x) => x.symbol === sym)!;
    expect(e.source).toBe('retained');
    expect(e.spreads).toEqual(retained.spreads);
  });
  it('nothing: a frozen chain with no retained ring contributes nothing', () => {
    frozenChain('FRZ/USD');
    expect(snapshotRetainableRings().find((x) => x.symbol === 'FRZ/USD')).toBeUndefined();
  });
  it('a chain seeded AGAINST a ring snapshots as judged', () => {
    const sym = 'JDG/USD';
    movingHealthyChain(sym);
    clearBookStateComparator(sym, 'yield');
    movingHealthyChain(sym, 200_000); // plausible reseed against the retained ring ⇒ judged, and moving
    const e = snapshotRetainableRings().find((x) => x.symbol === sym)!;
    expect(e.source).toBe('live');
    expect(e.seedBasis).toBe('judged');
  });
});

describe('4 — restore: per-row validation, partial stores, never over live evidence', () => {
  const good = (symbol: string) => ({ symbol, spreads: [0.004, 0.0041, 0.0039], seed_basis: 'judged', written_at: new Date(1_000_000), persisted_at: new Date(2_000_000) });
  it('a partial store loads its good rows and counts each bad one by reason', () => {
    const v = validateRingRows([
      good('A/USD'), good('B/USD'),
      { ...good('C/USD'), spreads: [] },
      { ...good('D/USD'), spreads: new Array(21).fill(0.004) },
      { ...good('E/USD'), spreads: [0.004, -0.001] },
      { ...good('F/USD'), spreads: [0.004, Number.NaN] },
      { ...good('G/USD'), seed_basis: 'maybe' },
      { ...good('H/USD'), written_at: 'not a date' },
      { ...good(''), },
      { ...good('I/USD'), spreads: '[0.004,0.005]' }, // JSON text is accepted
      { ...good('J/USD'), spreads: '{broken' },
    ], 20);
    expect(v.entries.map((e) => e.symbol)).toEqual(['A/USD', 'B/USD', 'I/USD']);
    expect(v.skippedInvalid).toBe(8);
    expect(v.skipReasons).toEqual({ spreads_length: 2, spreads_value: 2, seed_basis: 1, timestamps: 1, symbol: 1, spreads_unparseable: 1 });
  });
  it('applyRestoredRings loads into S25b as restored, and prints RING_RESTORED with the counts', () => {
    const n = applyRestoredRings(validateRingRows([good('A/USD'), { ...good('B/USD'), seed_basis: 'vacuous' }], 20), 3_000_000);
    expect(n).toBe(2);
    expect(_peekRetainedRingForTest('A/USD')).toMatchObject({ restored: true, seedBasis: 'judged' });
    const line = warn.mock.calls.map((c) => String(c[0])).find((s) => s.includes('RING_RESTORED'))!;
    expect(line).toContain('n=2');
    expect(line).toContain('judged=1 vacuous=1');
    expect(line).toContain('downtimeMin=16.7'); // (3,000,000 − 2,000,000) ms
  });
  it('restore never overwrites a live chain or an existing retained entry', () => {
    movingHealthyChain('LIV/USD');
    movingHealthyChain('KEEP/USD');
    clearBookStateComparator('KEEP/USD', 'yield');
    const keep = _peekRetainedRingForTest('KEEP/USD')!;
    const n = restoreRetainedRings([
      { symbol: 'LIV/USD', spreads: [0.9], seedBasis: 'judged', writtenAtMs: 1 },
      { symbol: 'KEEP/USD', spreads: [0.9], seedBasis: 'judged', writtenAtMs: 1 },
    ]);
    expect(n).toBe(0);
    expect(_peekRetainedRingForTest('LIV/USD')).toBeNull();
    expect(_peekRetainedRingForTest('KEEP/USD')).toBe(keep);
  });
});

describe('5 — condition 5: a restored ring judges one seed and is gone', () => {
  it('an IMPLAUSIBLE seed leaves the restored ring in place; the next PLAUSIBLE seed consumes it', () => {
    const sym = 'CON/USD';
    restoreRetainedRings([{ symbol: sym, spreads: new Array(20).fill(0.004), seedBasis: 'judged', writtenAtMs: 0 }]);
    advanceBookStateComparator(sym, { ...HOLLOW, atMs: 60_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(sym)!.seedImplausible).toBe(true);
    expect(_peekRetainedRingForTest(sym)).not.toBeNull();
    const l1 = warn.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('RESTORED_RING_CONSUMED'));
    expect(l1).toHaveLength(1);
    expect(l1[0]).toContain('verdict=implausible');
    expect(l1[0]).toContain('ringDeleted=false');
    expect(l1[0]).toContain('ringAgeMs=60000');
    // the chain ends (a yield), and a healthy book reseeds against the SAME restored ring — and consumes it
    clearBookStateComparator(sym, 'yield');
    advanceBookStateComparator(sym, { bid: 100, ask: 100.4, last: 100.2, atMs: 120_000 }, WINDOW, false, K_REL);
    expect(readBookStateComparator(sym)!.seedImplausible).toBe(false);
    expect(_peekRetainedRingForTest(sym)).toBeNull();
    const l2 = warn.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('RESTORED_RING_CONSUMED'));
    expect(l2).toHaveLength(2);
    expect(l2[1]).toContain('verdict=plausible');
    expect(l2[1]).toContain('ringDeleted=true');
  });
  it('a ring written by a clear is NOT flagged restored and prints no RESTORED_RING_CONSUMED line', () => {
    const sym = 'CLR/USD';
    movingHealthyChain(sym);
    clearBookStateComparator(sym, 'yield');
    expect(_peekRetainedRingForTest(sym)!.restored).toBe(false);
    movingHealthyChain(sym, 200_000);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('RESTORED_RING_CONSUMED'))).toBe(false);
  });
});

describe('6 — THE §0 REPLAY: ANET 2026-09-19, the same seed judged vs unjudged', () => {
  // First frame after the 00:54:06Z restart: bid ≈150.99 / ask ≈209.30 ⇒ spread 0.32368 (#1066).
  const ANET = { bid: 150.99, ask: 209.30, last: 180.1, atMs: 1_000_000 };
  it('TODAY (empty ring): the seed is accepted unjudged — the defect', () => {
    advanceBookStateComparator('ANET/USD', ANET, WINDOW, false, K_REL);
    const c = readBookStateComparator('ANET/USD')!;
    expect(c.seedImplausible).toBe(false);
    expect(c.seedRetainedMedian).toBeNull();
  });
  it('WITH the restored ring (median 0.00415, the 00:16:29 clear): the same seed is REFUSED', () => {
    restoreRetainedRings([{ symbol: 'ANET/USD', spreads: new Array(20).fill(0.00415), seedBasis: 'vacuous', writtenAtMs: 0 }]);
    advanceBookStateComparator('ANET/USD', ANET, WINDOW, false, K_REL);
    const c = readBookStateComparator('ANET/USD')!;
    expect(c.seedImplausible).toBe(true);
    expect(c.validated).toBe(false);
    expect(c.seedRetainedMedian).toBeCloseTo(0.00415, 6);
    expect(c.seedSpread).toBeCloseTo(0.32368, 4);
    // and a two-sided self-comparison on the next frame cannot promote it
    advanceBookStateComparator('ANET/USD', { ...ANET, atMs: 1_001_000 }, WINDOW, true, K_REL);
    expect(readBookStateComparator('ANET/USD')!.validated).toBe(false);
  });
});

describe('7 — the whole-store failure path: fall back, alert, never throw', () => {
  it('unreadable guard config ⇒ 0 loaded, maps empty, the resolve-never-ack alert', async () => {
    configImpl = () => { throw new Error('knobs missing'); };
    await expect(restoreRingsAtBoot()).resolves.toBe(0);
    expect(addAlert).toHaveBeenCalledTimes(1);
    const a = addAlert.mock.calls[0][0] as { dedupe_key: string; body: string };
    expect(a.dedupe_key).toBe(RING_RESTORE_ALERT_KEY);
    expect(a.body).toMatch(/RESOLVE this row .* do not ACK it/);
    expect(execute).not.toHaveBeenCalled();
  });
  it('unreadable store ⇒ 0 loaded and the alert', async () => {
    execute.mockRejectedValueOnce(new Error('relation does not exist'));
    await expect(restoreRingsAtBoot()).resolves.toBe(0);
    expect(addAlert).toHaveBeenCalledTimes(1);
  });
  it('a healthy store ⇒ rows loaded, no alert', async () => {
    execute.mockResolvedValueOnce({ rows: [{ symbol: 'OK/USD', spreads: [0.004], seed_basis: 'judged', written_at: new Date(1), persisted_at: new Date(2) }] });
    await expect(restoreRingsAtBoot()).resolves.toBe(1);
    expect(addAlert).not.toHaveBeenCalled();
    expect(_peekRetainedRingForTest('OK/USD')).toMatchObject({ restored: true });
  });
});

describe('8 — the snapshot write: one upsert per ring + one delete-absent, in ONE transaction', () => {
  it('writes each snapshot entry and deletes the rest', async () => {
    movingHealthyChain('W1/USD');
    movingHealthyChain('W2/USD');
    const txExec = vi.fn().mockResolvedValue({ rowCount: 3 });
    transaction.mockImplementation(async (fn: (tx: { execute: typeof txExec }) => Promise<void>) => fn({ execute: txExec }));
    const r = await persistRingSnapshot(9_000);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txExec).toHaveBeenCalledTimes(3); // two upserts + the delete
    expect(r).toEqual({ written: 2, deleted: 3 });
  });
});
