/**
 * B-OHLC-FRAME-GUARD r6 (item 46, RUNNING_ISSUES.md:723) — the Passive Archive panel's window counts.
 *
 * The defect this pins: `safeCount` sent `BEGIN; SET LOCAL …; SELECT …; COMMIT;` as ONE string, node-postgres
 * answered with an ARRAY of four Results, and the parse read element [0] (BEGIN's, no rows) — so every window
 * count read 0 with `timedOut: false`, and the panel printed 0 rows / OK for every universe from 2026-05-01.
 * Measured on staging 2026-09-28 through the app's own driver before this fix was written.
 *
 * POSITIVE CONTROL: against the pre-fix aggregator, test 1 fails (every count is 0, not the mocked value) and
 * tests 3-6 fail (an unknown count is 0 and the status is OK).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;
type CountReply = { rows: Row[] } | Error | unknown;

const h = vi.hoisted(() => ({
  // table name -> what the SELECT for that table returns (or throws)
  replies: new Map<string, unknown>(),
  // table name -> artificial latency in ms
  delays: new Map<string, number>(),
  txLog: [] as string[][],
  inFlight: 0,
  maxInFlight: 0,
  stats: {} as Record<string, any>,
}));

function sqlText(q: any): string {
  if (typeof q === 'string') return q;
  const chunks = q?.queryChunks ?? [];
  return chunks.map((c: any) => (Array.isArray(c?.value) ? c.value.join('') : typeof c === 'string' ? c : '')).join('');
}

function tableOf(text: string): string {
  const m = text.match(/FROM\s+([a-z_0-9]+)/i);
  return m ? m[1] : '';
}

vi.mock('../../db.js', () => ({
  db: {
    // disk-size lookups only
    execute: vi.fn(async () => ({ rows: [{ bytes: 1024 }] })),
    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => {
      const log: string[] = [];
      h.txLog.push(log);
      h.inFlight++;
      h.maxInFlight = Math.max(h.maxInFlight, h.inFlight);
      try {
        const tx = {
          execute: async (q: unknown) => {
            const text = sqlText(q);
            log.push(text);
            if (/SET LOCAL statement_timeout/.test(text)) return { rows: [] };
            const table = tableOf(text);
            const delay = h.delays.get(table) ?? 0;
            if (delay) await new Promise((r) => setTimeout(r, delay));
            const reply = h.replies.get(table);
            if (reply instanceof Error) throw reply;
            return reply;
          },
        };
        return await cb(tx);
      } finally {
        h.inFlight--;
      }
    }),
  },
}));

const statsFor = (name: string) => () => h.stats[name];
vi.mock('../../services/passive-archive/equity-spot-archiver.js', () => ({ getEquitySpotStats: statsFor('xstock_spot') }));
vi.mock('../../services/passive-archive/equity-perp-archiver.js', () => ({ getEquityPerpStats: statsFor('xstock_perp') }));
vi.mock('../../services/passive-archive/crypto-spot-archiver.js', () => ({ getCryptoSpotStats: statsFor('crypto_spot') }));
vi.mock('../../services/passive-archive/crypto-perp-archiver.js', () => ({ getCryptoPerpStats: statsFor('crypto_perp') }));

import { computePassiveArchiveStatus } from '../../services/drift-dashboard-aggregator.js';

const UNIVERSES = ['xstock_spot', 'xstock_perp', 'crypto_spot', 'crypto_perp'] as const;
const count = (row_count: number, sym_count: number): CountReply => ({ rows: [{ row_count, sym_count }] });
const TIMEOUT = new Error('canceling statement due to statement timeout');

function setAll(ohlc: (u: string) => CountReply, ticker: (u: string) => CountReply) {
  for (const u of UNIVERSES) {
    h.replies.set(`${u}_ohlc_1m`, ohlc(u));
    h.replies.set(`${u}_ticker_snap`, ticker(u));
  }
}

beforeEach(() => {
  h.replies.clear();
  h.delays.clear();
  h.txLog.length = 0;
  h.inFlight = 0;
  h.maxInFlight = 0;
  for (const u of UNIVERSES) {
    h.stats[u] = { configuredSymbols: 500, cumulativeOhlcRows: 1000, cumulativeTickerSnaps: 4000, ohlcFramesSkipped: 0, connected: true };
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('passive archive window counts — read the SELECT, not the transaction wrapper', () => {
  it('1. a readable count is carried through, with active = max of the two symbol counts', async () => {
    setAll(() => count(800, 480), () => count(3000, 500));
    const r = await computePassiveArchiveStatus('rolling_24h');
    for (const u of r.universes) {
      expect(u.ohlcRowsInWindow).toBe(800);
      expect(u.tickerRowsInWindow).toBe(3000);
      expect(u.activeSymbolsInWindow).toBe(500);
      expect(u.ohlcStoreFraction).toBeCloseTo(0.8);
      expect(u.tickerStoreFraction).toBeCloseTo(0.75);
      expect(u.status).toBe('OK');
      expect(u.countUnknownReason).toBeNull();
    }
  });

  it('2. the timeout is set INSIDE the transaction, before the count, on the same client', async () => {
    setAll(() => count(1, 1), () => count(1, 1));
    await computePassiveArchiveStatus('rolling_24h');
    expect(h.txLog).toHaveLength(8);
    for (const log of h.txLog) {
      expect(log).toHaveLength(2);
      expect(log[0]).toMatch(/^SET LOCAL statement_timeout = 4000$/);
      expect(log[1]).toMatch(/^SELECT count\(\*\)::int AS row_count/);
      expect(log[1]).not.toMatch(/BEGIN|COMMIT/); // never a multi-statement string again
    }
  });

  it('3. a timed-out count is UNKNOWN, and so is everything derived from it', async () => {
    setAll(() => TIMEOUT, () => count(3000, 500));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await computePassiveArchiveStatus('rolling_24h');
    for (const u of r.universes) {
      expect(u.ohlcRowsInWindow).toBeNull();
      expect(u.ohlcStoreFraction).toBeNull();
      expect(u.activeSymbolsInWindow).toBeNull(); // max over an unknown is unknown
      expect(u.tickerRowsInWindow).toBe(3000); // the other side stays known
      expect(u.tickerStoreFraction).toBeCloseTo(0.75);
      expect(u.status).toBe('COUNT_UNKNOWN');
      expect(u.countUnknownReason).toBe('timeout');
    }
    expect(warn).not.toHaveBeenCalled(); // a timeout is expected load, not an error line
  });

  it('4. a real query error is UNKNOWN and is logged', async () => {
    setAll(() => count(1, 1), () => new Error('relation does not exist'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await computePassiveArchiveStatus('rolling_24h');
    expect(r.universes.every((u) => u.tickerRowsInWindow === null && u.status === 'COUNT_UNKNOWN')).toBe(true);
    // an error is NOT reported as load: the reason keeps the two apart (Langston rider (a))
    expect(r.universes.every((u) => u.countUnknownReason === 'error')).toBe(true);
    // ONE line per aggregation call, naming how many counts failed (Langston Step 4 C2), not one per count
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/4 of 8 window counts unreadable .*first: relation does not exist/);
  });

  it('4c. a persistent fault on every count still writes ONE line per call (C2 — the #1037 check reads this stream)', async () => {
    setAll(() => new Error('connection terminated'), () => ({ rows: [] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await computePassiveArchiveStatus('rolling_24h');
    await computePassiveArchiveStatus('rolling_24h');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[PassiveArchive\] 8 of 8 window counts unreadable/);
  });

  it('4b. with a timeout on one side and an error on the other, the reason is the fault, not the load', async () => {
    setAll(() => TIMEOUT, () => new Error('connection terminated'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await computePassiveArchiveStatus('rolling_24h');
    expect(r.universes.every((u) => u.countUnknownReason === 'error')).toBe(true);
    setAll(() => TIMEOUT, () => ({ rows: [] }));
    const r2 = await computePassiveArchiveStatus('rolling_24h');
    expect(r2.universes.every((u) => u.countUnknownReason === 'shape')).toBe(true);
  });

  it('5. an unexpected result SHAPE is UNKNOWN, never 0 — including the old four-Result array', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const multiResult = [
      { command: 'BEGIN', rows: [] },
      { command: 'SET', rows: [] },
      { command: 'SELECT', rows: [{ row_count: 206012, sym_count: 503 }] },
      { command: 'COMMIT', rows: [] },
    ];
    const shapes: CountReply[] = [
      multiResult,
      { rows: [] },
      { rows: [{ row_count: 5, sym_count: 1 }, { row_count: 6, sym_count: 1 }] },
      { rows: [{ row_count: '5', sym_count: 1 }] },
      { rows: [{ row_count: 5 }] },
      { rows: [{ row_count: -1, sym_count: 1 }] },
      undefined,
    ];
    for (const shape of shapes) {
      setAll(() => shape, () => count(3000, 500));
      const r = await computePassiveArchiveStatus('rolling_24h');
      for (const u of r.universes) {
        expect(u.ohlcRowsInWindow).toBeNull();
        expect(u.status).toBe('COUNT_UNKNOWN');
        expect(u.countUnknownReason).toBe('shape');
      }
    }
    expect(warn).toHaveBeenCalled();
  });

  it('6. a GENUINE zero still reads as zero and keeps its count-based status', async () => {
    for (const u of UNIVERSES) h.stats[u].cumulativeOhlcRows = 0;
    setAll(() => count(0, 0), () => count(3000, 500));
    const r = await computePassiveArchiveStatus('rolling_24h');
    for (const u of r.universes) {
      expect(u.ohlcRowsInWindow).toBe(0);
      expect(u.activeSymbolsInWindow).toBe(500);
      expect(u.status).toBe('NO_OHLC_DATA');
    }
  });

  it('6b. a side KNOWN to be dead is reported even when the other side is unknown (Langston Step 4 C1)', async () => {
    for (const u of UNIVERSES) h.stats[u].cumulativeTickerSnaps = 0;
    setAll(() => TIMEOUT, () => count(0, 0));
    const r = await computePassiveArchiveStatus('rolling_24h');
    for (const u of r.universes) expect(u.status).toBe('NO_TICKER_DATA');
    for (const u of UNIVERSES) { h.stats[u].cumulativeTickerSnaps = 4000; h.stats[u].cumulativeOhlcRows = 0; }
    setAll(() => count(0, 0), () => TIMEOUT);
    const r2 = await computePassiveArchiveStatus('rolling_24h');
    for (const u of r2.universes) {
      expect(u.status).toBe('NO_OHLC_DATA');
      expect(u.countUnknownReason).toBe('timeout'); // the unknown side is still reported
    }
  });

  it('7. a disconnected feed reports DISCONNECTED even when its counts are unknown', async () => {
    h.stats.crypto_perp.connected = false;
    setAll(() => TIMEOUT, () => TIMEOUT);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await computePassiveArchiveStatus('rolling_24h');
    const byName = Object.fromEntries(r.universes.map((u) => [u.universe, u]));
    expect(byName.crypto_perp.status).toBe('DISCONNECTED');
    expect(byName.crypto_spot.status).toBe('COUNT_UNKNOWN');
  });
});

describe('passive archive window counts — bounded fan-out', () => {
  it('8. never more than three counts in flight, all eight run, and the output order is fixed', async () => {
    setAll((u) => count(UNIVERSES.indexOf(u as any) + 1, 1), (u) => count(10 * (UNIVERSES.indexOf(u as any) + 1), 1));
    // uneven latencies so that completion order differs from request order
    const lat = [30, 5, 20, 1, 25, 10, 2, 15];
    UNIVERSES.forEach((u, i) => {
      h.delays.set(`${u}_ohlc_1m`, lat[2 * i]);
      h.delays.set(`${u}_ticker_snap`, lat[2 * i + 1]);
    });
    const r = await computePassiveArchiveStatus('rolling_24h');
    expect(h.txLog).toHaveLength(8);
    expect(h.maxInFlight).toBe(3);
    expect(r.universes.map((u) => u.universe)).toEqual([...UNIVERSES]);
    expect(r.universes.map((u) => u.ohlcRowsInWindow)).toEqual([1, 2, 3, 4]);
    expect(r.universes.map((u) => u.tickerRowsInWindow)).toEqual([10, 20, 30, 40]);
  });
});
