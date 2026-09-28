/**
 * F-G-1 REOPEN (OBJ-9 ① and ②, #1031) — THE OHLC WRITER NO LONGER DEPENDS ON ORDER
 *
 * Plan: `Claude Comms and Packages/Scope Files/F_G_1_REOPEN_PRE_AUDIT.md` r3 (Step 2 cleared).
 *   P1 — rows leave the buffer only AFTER a successful write.
 *   P2 — one flush per class at a time; a second call is coalesced into the one in flight, and
 *        COUNTED (Langston condition 3); the shutdown drain waits the flight out, then flushes.
 *   P3 — every row is stamped with its arrival at `bufferOhlcBar`; the dedupe keeps the latest
 *        arrival, ties to the last inserted (condition 2); the upsert carries the arrival guard.
 *
 * Everything here CALLS the writer or OBSERVES what it hands the database. The SQL guard's
 * behaviour against a real table is proved in the integration fence
 * (`server/tests/integration/f-g-1-ohlc-arrival-guard.test.ts`); this file proves the writer
 * hands that guard to the database at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

// ── db mocked: each insert records its rows and its conflict config, and can be held open ──────
const _db: {
  calls: { rows: any[]; cfg: any }[];
  throwWith: Error | null;
  /** Awaited INSIDE the insert, after the rows are recorded: holds a flush in flight on demand. */
  hold: null | (() => Promise<void>);
} = { calls: [], throwWith: null, hold: null };
vi.mock('../../db.js', () => ({
  db: {
    insert: () => ({
      values: (rows: any) => ({
        onConflictDoUpdate: async (cfg: any) => {
          _db.calls.push({ rows, cfg });
          if (_db.hold) { const h = _db.hold; _db.hold = null; await h(); }
          if (_db.throwWith) throw _db.throwWith;
        },
      }),
    }),
  },
}));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: async (o: any) => o }));
vi.mock('../../services/passive-archive/ticker-batch-writer.js', () => ({ stopTickerWriter: async () => {} }));

import {
  bufferOhlcBar,
  stopBatchWriter,
  flushAssetClass,
  dedupeLatestArrival,
  getOhlcWriterCoalescedFlushes,
} from '../../services/passive-archive/ohlc-batch-writer';

const MIN = new Date('2026-09-15T00:00:00.000Z');
const bar = (sym: string, close: string, extra: Record<string, unknown> = {}) => ({
  symbol: sym, intervalBegin: MIN, open: '1', high: '1', low: '1', close, volume: '1',
  assetClass: 'crypto_spot', exchange: 'kraken', ...extra,
}) as any;

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((r) => { release = r; });
  return { promise, release };
}

beforeEach(() => { _db.calls.length = 0; _db.throwWith = null; _db.hold = null; });
afterEach(async () => { _db.throwWith = null; _db.hold = null; await stopBatchWriter(); _db.calls.length = 0; });

describe('P3 — the arrival stamp is set at the chokepoint', () => {
  // MUTATION: remove the stamp in `bufferOhlcBar` and this fails.
  it('stamps every buffered row with its arrival', async () => {
    const before = Date.now();
    bufferOhlcBar('crypto_spot', bar('A/USD', '1'));
    await stopBatchWriter();
    const row = _db.calls.flatMap((c) => c.rows)[0];
    expect(row.arrivedAt).toBeInstanceOf(Date);
    expect(row.arrivedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  // MUTATION: put the stamp BEFORE the spread (`{ arrivedAt, ...row }`) and this fails. A producer
  // row carrying its own `arrivedAt` must not be able to set the guard's input.
  it('a producer cannot supply its own arrival stamp', async () => {
    const forged = new Date('2020-01-01T00:00:00.000Z');
    bufferOhlcBar('crypto_spot', bar('A/USD', '1', { arrivedAt: forged }));
    await stopBatchWriter();
    const row = _db.calls.flatMap((c) => c.rows)[0];
    expect(row.arrivedAt.getTime()).not.toBe(forged.getTime());
  });
});

describe('P3 — the dedupe keeps the latest ARRIVAL, ties to the last inserted', () => {
  const t = (ms: number) => new Date(1_790_000_000_000 + ms);

  // MUTATION: revert to plain last-inserted (Map.set unconditionally) and this fails.
  it('keeps the latest arrival even when it sits EARLIER in the buffer', () => {
    const late = bar('A/USD', 'late', { arrivedAt: t(2000) });
    const early = bar('A/USD', 'early', { arrivedAt: t(1000) });
    const out = dedupeLatestArrival([late, early]);
    expect(out).toHaveLength(1);
    expect(out[0].close).toBe('late');
  });

  // MUTATION: flip the tie-break to strict `>` (first-inserted wins) and this fails (condition 2).
  it('on EQUAL stamps keeps the last inserted — today\'s semantics, unchanged', () => {
    const first = bar('A/USD', 'first', { arrivedAt: t(1000) });
    const second = bar('A/USD', 'second', { arrivedAt: t(1000) });
    expect(dedupeLatestArrival([first, second])[0].close).toBe('second');
  });

  it('an unstamped row never beats a stamped one, and two unstamped rows keep last-inserted', () => {
    const stamped = bar('A/USD', 'stamped', { arrivedAt: t(1) });
    const bare = bar('A/USD', 'bare');
    expect(dedupeLatestArrival([stamped, bare])[0].close).toBe('stamped');
    expect(dedupeLatestArrival([bar('A/USD', 'x'), bar('A/USD', 'y')])[0].close).toBe('y');
  });

  it('CONTROL — different minutes or symbols are never merged', () => {
    const other = { ...bar('A/USD', 'b'), intervalBegin: new Date(MIN.getTime() + 60_000) };
    expect(dedupeLatestArrival([bar('A/USD', 'a'), other, bar('B/USD', 'c')])).toHaveLength(3);
  });
});

describe('P3 — the upsert hands the arrival guard to the database', () => {
  // MUTATION: remove `setWhere` (or its `<=` arm) from the upsert and this fails.
  it('carries setWhere "arrived_at IS NULL OR arrived_at <= EXCLUDED.arrived_at", and sets arrived_at', async () => {
    bufferOhlcBar('crypto_spot', bar('A/USD', '1'));
    await stopBatchWriter();
    const cfg = _db.calls[0].cfg;
    expect(cfg.setWhere).toBeDefined();
    const q = new PgDialect().sqlToQuery(cfg.setWhere).sql;
    expect(q).toBe('"crypto_spot_ohlc_1m"."arrived_at" IS NULL OR "crypto_spot_ohlc_1m"."arrived_at" <= EXCLUDED.arrived_at');
    expect(cfg.set.arrivedAt).toBeDefined();
    expect(new PgDialect().sqlToQuery(cfg.set.arrivedAt).sql).toBe('EXCLUDED.arrived_at');
  });
});

describe('P1 — rows leave the buffer only after a successful write', () => {
  // MUTATION: splice before the write (and no re-add) and this fails — the transient failure
  // would lose the rows. MUTATION: splice after success removed and this fails the second half.
  it('a transient failure keeps the rows; a success removes them', async () => {
    _db.throwWith = new Error('deadlock detected');
    bufferOhlcBar('crypto_spot', bar('A/USD', '1'));
    await flushAssetClass('crypto_spot');
    _db.throwWith = null;
    _db.calls.length = 0;
    await flushAssetClass('crypto_spot');
    expect(_db.calls.flatMap((c) => c.rows)).toHaveLength(1); // retained and re-offered
    _db.calls.length = 0;
    await flushAssetClass('crypto_spot');
    expect(_db.calls).toHaveLength(0);                         // and gone after the success
  });

  // The #1031 shape: a fresher bar lands DURING a flush that then fails transiently. The fresher
  // bar must win the retry, and the retried rows must never be queued ahead of it.
  // MUTATION: the dedupe back to last-inserted with the old `unshift` re-add — covered above; here,
  // the proof that rows pushed mid-flight survive a failed flight and the NEWER arrival is written.
  it('a bar arriving mid-flush survives a failed flush, and the fresher arrival wins the retry', async () => {
    const gate = deferred();
    _db.hold = () => gate.promise;
    _db.throwWith = new Error('deadlock detected');
    bufferOhlcBar('crypto_spot', bar('A/USD', 'stale'));
    const flight = flushAssetClass('crypto_spot');
    await new Promise((r) => setTimeout(r, 5));          // the flush is now in flight, held
    bufferOhlcBar('crypto_spot', bar('A/USD', 'fresh'));  // same symbol + minute, later arrival
    gate.release();
    await flight;                                          // fails transiently
    _db.throwWith = null;
    _db.calls.length = 0;
    await flushAssetClass('crypto_spot');
    const rows = _db.calls.flatMap((c) => c.rows);
    expect(rows).toHaveLength(1);
    expect(rows[0].close).toBe('fresh');
  });
});

describe('P2 — one flush per class, coalesced and counted', () => {
  // MUTATION: remove the in-flight guard and this fails — the second call snapshots the same
  // unwritten rows (P1 leaves them in place) and writes them a second time.
  // MUTATION: stop incrementing the counter and this fails (condition 3's positive control).
  it('a second call during a flight starts no second insert, returns the same flight, and is counted', async () => {
    const gate = deferred();
    _db.hold = () => gate.promise;
    const before = getOhlcWriterCoalescedFlushes().xstock_perp;
    bufferOhlcBar('xstock_perp', bar('B/USD', '1'));
    const first = flushAssetClass('xstock_perp');
    await new Promise((r) => setTimeout(r, 5));
    const second = flushAssetClass('xstock_perp');
    expect(second).toBe(first);
    gate.release();
    await Promise.all([first, second]);
    expect(_db.calls).toHaveLength(1);
    expect(getOhlcWriterCoalescedFlushes().xstock_perp).toBe(before + 1);
  });

  it('CONTROL — a call AFTER the flight ends starts a fresh flush and is not counted as coalesced', async () => {
    const before = getOhlcWriterCoalescedFlushes().crypto_perp;
    bufferOhlcBar('crypto_perp', bar('C/USD', '1'));
    await flushAssetClass('crypto_perp');
    bufferOhlcBar('crypto_perp', bar('C/USD', '2'));
    await flushAssetClass('crypto_perp');
    expect(_db.calls).toHaveLength(2);
    expect(getOhlcWriterCoalescedFlushes().crypto_perp).toBe(before);
  });

  // MUTATION: drop the `await Promise.allSettled(Object.values(inFlight))` from `stopBatchWriter`
  // and this fails — the drain's call is coalesced into the flight and returns without writing
  // the row that arrived during it.
  it('the shutdown drain waits out a flight, then writes the rows that arrived during it', async () => {
    const gate = deferred();
    _db.hold = () => gate.promise;
    bufferOhlcBar('xstock_spot', bar('D/USD', 'one'));
    const flight = flushAssetClass('xstock_spot');
    await new Promise((r) => setTimeout(r, 5));
    bufferOhlcBar('xstock_spot', { ...bar('E/USD', 'two') });
    const drain = stopBatchWriter();
    await new Promise((r) => setTimeout(r, 5));
    gate.release();
    await Promise.all([flight, drain]);
    const written = _db.calls.flatMap((c) => c.rows).map((r) => r.close).sort();
    expect(written).toEqual(['one', 'two']);
  });
});
