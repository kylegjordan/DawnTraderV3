/**
 * B-ARCHIVE-NETWORK-RETRY (#705, Kyle KD-97) — the network family is transient, and a shed at the
 * buffer cap raises the writer's own alert.
 *
 * Everything here CALLS the code (the F-G-1 fence's rule: a text fence is greenest when doc and code
 * have diverged). The fixtures for OBJ-1 are the REAL message shapes from staging's error stream,
 * 2026-11-02 → 2026-11-16 (pre-audit A3): 3,036 `connect ECONNREFUSED <addr>:5432` lines, plus the
 * 7-line control that must stay permanent (3 statement timeouts, 4 `Query read timeout`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const _dbState: { throwWith: Error | null; inserted: any[][]; onInsert: null | (() => void); delayMs: number } = { throwWith: null, inserted: [], onInsert: null, delayMs: 0 };
// One mock serves both writers: the OHLC writer awaits `.onConflictDoUpdate()`, the ticker writer
// awaits the `.values()` result itself, so `values` returns a thenable that also carries the method.
vi.mock('../../db.js', () => ({
  db: {
    transaction: async (fn: (tx: { execute: () => Promise<unknown> }) => Promise<unknown>) => fn({
      execute: async () => ({ rows: [] }),
    }),
    insert: () => ({
      values: (rows: any) => {
        const run = async () => {
          if (_dbState.delayMs > 0) await new Promise((r) => setTimeout(r, _dbState.delayMs));
          if (_dbState.onInsert) _dbState.onInsert();
          if (_dbState.throwWith) throw _dbState.throwWith;
          _dbState.inserted.push(rows);
        };
        return {
          then: (a: any, b: any) => run().then(a, b),
          onConflictDoUpdate: run,
          onConflictDoNothing: run,
        };
      },
    }),
  },
}));

const _alerts: any[] = [];
let _addAlertThrows = false;
let _addAlertDelayMs = 0;
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: async (opts: any) => {
    if (_addAlertDelayMs > 0) await new Promise((r) => setTimeout(r, _addAlertDelayMs));
    if (_addAlertThrows) throw new Error('alert store unavailable');
    _alerts.push(opts);
    return opts;
  },
}));

const _handoffs: any[] = [];
let _handoffThrows = false;
vi.mock('../../services/passive-archive/xstock-bar-availability.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/passive-archive/xstock-bar-availability.js')>();
  return {
    ...actual,
    recordXstockWriterHandoff: async (state: unknown) => {
      _handoffs.push(state);
      if (_handoffThrows) throw new Error('xStock handoff refused');
    },
  };
});

import {
  isTransientWriteError,
  TRANSIENT_NETWORK_CODES,
  alertWriterShed,
  alertShutdownResidue,
  clearShedAlertLatch,
  SHED_REFETCHABLE,
  bufferOhlcBar,
  stopBatchWriter,
  drainArchiveBuffersForShutdown,
  RETRY_BUFFER_MAX,
} from '../../services/passive-archive/ohlc-batch-writer';
import { bufferTickerSnap, stopTickerWriter, getTickerResidueBefore } from '../../services/passive-archive/ticker-batch-writer';

async function waitFor(cond: () => boolean, ms = 1000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
}

const bar = (n: number) => ({
  symbol: `N${n}/USD`,
  intervalBegin: new Date(1_700_000_000_000 + n * 60_000),
  open: '1', high: '1', low: '1', close: '1', volume: '1',
  assetClass: 'crypto_spot', exchange: 'kraken',
}) as any;
const snap = (n: number) => ({
  symbol: `S${n}/USD`, assetClass: 'crypto_spot', exchange: 'kraken', capturedAt: new Date(),
  bid: '1', ask: '1.01', last: '1',
}) as any;

/** Node's own shape for a refused connect to a host with more than one address (pre-audit A2,
 *  measured on staging's v20.20.0 with the default `autoSelectFamily`). */
function aggregate(code: string): Error {
  const inner = [
    Object.assign(new Error(`connect ${code} ::1:5432`), { code }),
    Object.assign(new Error(`connect ${code} 127.0.0.1:5432`), { code }),
  ];
  const e = new AggregateError(inner, '');
  return Object.assign(e, { code });
}

beforeEach(() => {
  _dbState.throwWith = null;
  _dbState.onInsert = null;
  _dbState.delayMs = 0;
  _dbState.inserted.length = 0;
  _alerts.length = 0;
  _addAlertThrows = false;
  _addAlertDelayMs = 0;
  _handoffs.length = 0;
  _handoffThrows = false;
});

describe('OBJ-1 — the network family is TRANSIENT, ENOTFOUND stays PERMANENT', () => {
  // MUTATION: remove the `econnrefused` message arm and this fails. The real 2026-11-16 line, verbatim.
  it('the real refused line from the 2026-11-16 outage is transient', () => {
    expect(isTransientWriteError(new Error('connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432'))).toBe(true);
  });

  // MUTATION: remove any one message arm and its line fails.
  it('each pre-connect network code is transient when it arrives as text', () => {
    expect(isTransientWriteError(new Error('connect EHOSTUNREACH 10.0.0.9:5432'))).toBe(true);
    expect(isTransientWriteError(new Error('connect ENETUNREACH 10.0.0.9:5432'))).toBe(true);
    expect(isTransientWriteError(new Error('getaddrinfo EAI_AGAIN db.example.supabase.co'))).toBe(true);
  });

  // MUTATION: remove the code test (`errorCodes(...)`) and this fails — the aggregate's message is EMPTY.
  it('a refused connect to a multi-address host (AggregateError, empty message) is transient', () => {
    const e = aggregate('ECONNREFUSED');
    expect(e.message).toBe('');            // the control: no text to match
    expect(isTransientWriteError(e)).toBe(true);
  });

  it('the code test reads the INNER errors when the outer carries no code', () => {
    const e = new AggregateError([Object.assign(new Error(''), { code: 'EHOSTUNREACH' })], '');
    expect(isTransientWriteError(e)).toBe(true);
  });

  // Judgement call A (Langston, YES): the two codes already transient by message carry in the code test.
  it('ECONNRESET and ETIMEDOUT in their empty-message aggregate form are transient', () => {
    expect(isTransientWriteError(aggregate('ECONNRESET'))).toBe(true);
    expect(isTransientWriteError(aggregate('ETIMEDOUT'))).toBe(true);
  });

  it('every code in the set is honoured by the code test alone', () => {
    for (const code of TRANSIENT_NETWORK_CODES) {
      expect(isTransientWriteError(Object.assign(new Error(''), { code }))).toBe(true);
    }
  });

  // ⛔ C4: MUTATION — ADD a `getaddrinfo` arm and this fails. Removal cannot catch an over-broad arm.
  it('ENOTFOUND stays PERMANENT, by message and by code', () => {
    expect(isTransientWriteError(new Error('getaddrinfo ENOTFOUND db.example.supabase.co'))).toBe(false);
    expect(isTransientWriteError(Object.assign(new Error('getaddrinfo ENOTFOUND db.example.supabase.co'), { code: 'ENOTFOUND' }))).toBe(false);
    expect(isTransientWriteError(aggregate('ENOTFOUND'))).toBe(false);
  });

  // The real 7-line control from 2026-11-04 (pre-audit A3): unchanged, permanent.
  it('CONTROL — the real timeout lines stay permanent', () => {
    expect(isTransientWriteError(new Error('canceling statement due to statement timeout'))).toBe(false);
    expect(isTransientWriteError(new Error('Query read timeout'))).toBe(false);
    // a server statement timeout carries 57014; the guard catches it first, whatever the code
    expect(isTransientWriteError(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }))).toBe(false);
  });

  it('a refused connection now RETAINS the rows in the bar writer instead of dropping them', async () => {
    _dbState.throwWith = new Error('connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432');
    bufferOhlcBar('crypto_spot', bar(1));
    await stopBatchWriter();
    expect(_alerts.filter((a) => String(a.dedupe_key).includes('permanent'))).toHaveLength(0);
    _dbState.throwWith = null;
    _dbState.inserted.length = 0;
    await stopBatchWriter();
    expect(_dbState.inserted.flat()).toHaveLength(1);   // re-offered and written
  });

  it('a refused connection now RETAINS the rows in the ticker writer instead of dropping them', async () => {
    _dbState.throwWith = new Error('connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432');
    bufferTickerSnap('crypto_spot', snap(1));
    await stopTickerWriter();
    _dbState.throwWith = null;
    _dbState.inserted.length = 0;
    await stopTickerWriter();
    expect(_dbState.inserted.flat()).toHaveLength(1);
  });
});

describe('OBJ-2 — a shed at the cap raises the writer\'s own alert', () => {
  it('the alert carries the right key, category, severity, re-fetch flag and resolve-only wording', async () => {
    clearShedAlertLatch('ticker', 'xstock_spot');
    await alertWriterShed('ticker', 'xstock_spot', 7, RETRY_BUFFER_MAX);
    expect(_alerts).toHaveLength(1);
    const a = _alerts[0];
    expect(a.dedupe_key).toBe('ticker-writer-shed-xstock_spot');
    expect(a.category).toBe('breakage');
    expect(a.severity).toBe('critical');
    expect(a.metadata.refetchable).toBe(false);
    expect(a.metadata.shed).toBe(7);
    expect(String(a.body)).toMatch(/never\s+acknowledge/i);
  });

  // C1: five of the seven shedding pairs cannot be re-fetched.
  it('the re-fetch map covers all seven shedding pairs, and only the two futures bar legs are re-fetchable', () => {
    expect(Object.keys(SHED_REFETCHABLE).sort()).toEqual([
      'ohlc:crypto_perp', 'ohlc:crypto_spot', 'ohlc:xstock_perp',
      'ticker:crypto_perp', 'ticker:crypto_spot', 'ticker:xstock_perp', 'ticker:xstock_spot',
    ]);
    expect(Object.entries(SHED_REFETCHABLE).filter(([, v]) => v).map(([k]) => k).sort())
      .toEqual(['ohlc:crypto_perp', 'ohlc:xstock_perp']);
  });

  // MUTATION: remove the latch check and this fails (three sheds would raise three alerts).
  it('a PERSISTING shed raises only once per writer:class', async () => {
    clearShedAlertLatch('ticker', 'crypto_perp');
    for (let i = 0; i < 3; i++) await alertWriterShed('ticker', 'crypto_perp', 1, RETRY_BUFFER_MAX);
    expect(_alerts).toHaveLength(1);
  });

  // MUTATION: remove the ticker writer's `clearShedAlertLatch` call on success and this fails.
  it('a SUCCESSFUL ticker flush clears the latch, so the next shed raises again', async () => {
    clearShedAlertLatch('ticker', 'crypto_spot');
    await alertWriterShed('ticker', 'crypto_spot', 1, RETRY_BUFFER_MAX);
    expect(_alerts).toHaveLength(1);
    bufferTickerSnap('crypto_spot', snap(2));
    await stopTickerWriter();                       // succeeds → clears
    await alertWriterShed('ticker', 'crypto_spot', 1, RETRY_BUFFER_MAX);
    expect(_alerts).toHaveLength(2);
  });

  // MUTATION: remove the bar writer's `clearShedAlertLatch` call on success and this fails.
  it('a SUCCESSFUL bar flush clears the latch, so the next shed raises again', async () => {
    clearShedAlertLatch('ohlc', 'crypto_perp');
    await alertWriterShed('ohlc', 'crypto_perp', 1, RETRY_BUFFER_MAX);
    expect(_alerts).toHaveLength(1);
    bufferOhlcBar('crypto_perp', { ...bar(3), assetClass: 'crypto_perp' });
    await stopBatchWriter();
    await alertWriterShed('ohlc', 'crypto_perp', 1, RETRY_BUFFER_MAX);
    expect(_alerts).toHaveLength(2);
  });

  // MUTATION: remove the release in the catch and this fails — a failed raise would mute the class.
  it('a raise that FAILS releases the latch, so the next shed tries again', async () => {
    clearShedAlertLatch('ohlc', 'xstock_perp');
    _addAlertThrows = true;
    await alertWriterShed('ohlc', 'xstock_perp', 1, RETRY_BUFFER_MAX);
    expect(_alerts).toHaveLength(0);
    _addAlertThrows = false;
    await alertWriterShed('ohlc', 'xstock_perp', 1, RETRY_BUFFER_MAX);
    expect(_alerts).toHaveLength(1);
  });

  // MUTATION: remove the bar writer's `void alertWriterShed(...)` call and this fails.
  it('the bar writer raises the shed alert when its buffer passes the cap', async () => {
    clearShedAlertLatch('ohlc', 'crypto_spot');
    _dbState.throwWith = new Error('connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432');
    for (let i = 0; i < RETRY_BUFFER_MAX + 3; i++) bufferOhlcBar('crypto_spot', bar(1000 + i));
    await stopBatchWriter();
    await waitFor(() => _alerts.some((a) => a.dedupe_key === 'ohlc-writer-shed-crypto_spot'));
    const a = _alerts.find((x) => x.dedupe_key === 'ohlc-writer-shed-crypto_spot');
    expect(a).toBeDefined();
    expect(a.metadata.shed).toBe(3);
    expect(a.metadata.refetchable).toBe(false);
    _dbState.throwWith = null;
    await stopBatchWriter();
  }, 30_000);

  // MUTATION: remove the ticker writer's `void alertWriterShed(...)` call and this fails.
  it('the ticker writer raises the shed alert when its buffer passes the cap', async () => {
    clearShedAlertLatch('ticker', 'xstock_perp');
    _dbState.throwWith = new Error('connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432');
    for (let i = 0; i < RETRY_BUFFER_MAX + 4; i++) bufferTickerSnap('xstock_perp', { ...snap(5000 + i), assetClass: 'xstock_perp' });
    await stopTickerWriter();
    await waitFor(() => _alerts.some((a) => a.dedupe_key === 'ticker-writer-shed-xstock_perp'));
    const a = _alerts.find((x) => x.dedupe_key === 'ticker-writer-shed-xstock_perp');
    expect(a).toBeDefined();
    expect(a.metadata.shed).toBe(4);
    _dbState.throwWith = null;
    await stopTickerWriter();
  }, 30_000);

  // ⛔ C-1 (Langston, Step 4): rows retained for retry die with the process. MUTATION: remove the
  // `await alertShutdownResidue(...)` call in the drain and this fails.
  it('a shutdown INSIDE an outage pages the rows still held, per writer:class, before the xStock handoff', async () => {
    _dbState.throwWith = new Error('connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432');
    bufferOhlcBar('crypto_spot', bar(77_001));
    bufferOhlcBar('crypto_spot', bar(77_002));
    bufferTickerSnap('crypto_perp', { ...snap(77_003), assetClass: 'crypto_perp' });
    _handoffThrows = true;     // the xStock handoff refusing must not skip the page
    // a SLOW alert store: if the drain fired the page without awaiting it, the alert would land AFTER the
    // drain settles and the assertion below would see nothing (MUTATION: `await` -> `void` fails here).
    _addAlertDelayMs = 150;
    await expect(drainArchiveBuffersForShutdown()).rejects.toThrow(/handoff refused/);
    const a = _alerts.find((x) => x.dedupe_key === 'archive-writer-shutdown-residue');
    expect(a).toBeDefined();   // already written: the drain AWAITS it, no polling
    expect(a.metadata.residue).toEqual({ 'ohlc:crypto_spot': 2, 'ticker:crypto_perp': 1 });
    expect(a.metadata.total).toBe(3);
    expect(a.category).toBe('breakage');
    expect(a.severity).toBe('critical');
    expect(String(a.body)).toMatch(/never\s+acknowledge/i);
    // leave nothing behind for the next test
    _dbState.throwWith = null;
    _handoffThrows = false;
    await stopBatchWriter();
    await stopTickerWriter();
  });

  // ⛔ C-1 RE-GATE (Langston, measured): on the live box the crypto and futures feeds keep running through the
  // ~2 s drain, so rows ARRIVE DURING the final flushes and are still buffered when the drain counts. They are
  // not retry residue and must not page. MUTATION: count every buffered row, ignoring the mark, and this fails.
  // ⚠️ It kills 'spin removed' only PROBABILISTICALLY (when a late row shares the mark's millisecond); the
  // deterministic fence on `<=` is the 'mark is inclusive' test below.
  it('CONTROL — a CLEAN shutdown with live intake during the final flushes raises no residue alert', async () => {
    let pushed = 0;
    _dbState.onInsert = () => {
      if (pushed++ > 0) return;      // one burst of late arrivals, from inside the final flush
      bufferOhlcBar('crypto_spot', bar(79_002));
      bufferTickerSnap('crypto_perp', { ...snap(79_003), assetClass: 'crypto_perp' });
    };
    bufferOhlcBar('crypto_spot', bar(79_001));
    await drainArchiveBuffersForShutdown();
    expect(pushed).toBeGreaterThan(0);   // the control: rows really did arrive during the drain
    expect(_alerts.filter((x) => x.dedupe_key === 'archive-writer-shutdown-residue')).toHaveLength(0);
    _dbState.onInsert = null;
    await stopBatchWriter();
    await stopTickerWriter();
  });

  // ⛔ C-1 re-gate FINDING (Langston): a ticker flush still awaiting the database when the drain counts holds its rows in
  // NO buffer (spliced out before the insert). MUTATION: drop the in-flight wait in `stopTickerWriter` and this fails.
  it('a ticker flush still RUNNING at shutdown is waited out, and its retained rows are paged', async () => {
    _dbState.throwWith = new Error('connect ECONNREFUSED 2a05:d018:135e:16c7:82b8:28a7:565c:6ebf:5432');
    _dbState.delayMs = 120;               // a slow, failing insert: the condition the page exists for
    bufferTickerSnap('xstock_spot', { ...snap(81_001), assetClass: 'xstock_spot' });
    const running = stopTickerWriter();   // stands in for a timer flush already in flight
    await drainArchiveBuffersForShutdown();
    await running;
    const a = _alerts.find((x) => x.dedupe_key === 'archive-writer-shutdown-residue');
    expect(a).toBeDefined();
    expect(a.metadata.residue).toEqual({ 'ticker:xstock_spot': 1 });
    _dbState.throwWith = null;
    _dbState.delayMs = 0;
    await stopTickerWriter();
  });

  it('retains the exact xStock source receipt through a transient writer retry', async () => {
    const capture = {
      ...snap(81_002),
      assetClass: 'xstock_spot',
      exchange: 'kraken-equities',
      metadata: {
        schema_version: 1,
        equityTickerSource: {
          bootId: 'boot-fixture', generation: 7, frameOrdinal: 12, rowOrdinal: 1,
          role: 'update', receivedMonotonicMs: 1350,
        },
      },
    };
    const attempts = vi.fn();
    _dbState.onInsert = attempts;
    _dbState.throwWith = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    try {
      expect(bufferTickerSnap('xstock_spot', capture)).toBe(true);
      await stopTickerWriter();
      expect(attempts).toHaveBeenCalled();
      expect(_dbState.inserted.flat().find(row => row.symbol === capture.symbol)).toBeUndefined();
      expect(getTickerResidueBefore(Date.now()).xstock_spot).toBeGreaterThan(0);

      _dbState.throwWith = null;
      await stopTickerWriter();
      expect(_dbState.inserted.flat().filter(row => row.symbol === capture.symbol)).toEqual([capture]);
    } finally {
      _dbState.throwWith = null;
      _dbState.onInsert = null;
      await stopTickerWriter();
    }
  });

  // ⛔ THE DETERMINISTIC FENCE ON `<=` (Langston): the live-intake CONTROL kills 'spin removed' only when a late row lands
  // inside the mark's millisecond, i.e. PROBABILISTICALLY (it failed only inside the full file). This pins the semantics
  // directly: a row stamped exactly at the mark is residue, one stamped a millisecond later is not.
  // MUTATION: `<=` -> `<` on either side and this fails.
  it('the mark is inclusive: a row stamped AT the mark counts, one stamped 1 ms later does not', async () => {
    const mark = 1_800_000_000_000;
    bufferTickerSnap('crypto_spot', { ...snap(82_001), capturedAt: new Date(mark) });
    bufferTickerSnap('crypto_spot', { ...snap(82_002), capturedAt: new Date(mark + 1) });
    expect(getTickerResidueBefore(mark).crypto_spot).toBe(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(mark);
      bufferOhlcBar('crypto_spot', bar(82_003));      // arrivedAt = mark
      vi.setSystemTime(mark + 1);
      bufferOhlcBar('crypto_spot', bar(82_004));      // arrivedAt = mark + 1
    } finally {
      vi.useRealTimers();
    }
    await alertShutdownResidue(mark, { xstock_spot: 0, xstock_perp: 0, crypto_spot: 0, crypto_perp: 0 });
    const a = _alerts.find((x) => x.dedupe_key === 'archive-writer-shutdown-residue');
    expect(a.metadata.residue).toEqual({ 'ohlc:crypto_spot': 1 });
    await stopBatchWriter();
    await stopTickerWriter();
  });

  // CONTROL: a clean shutdown raises nothing. MUTATION: drop the `total === 0` early return and this fails.
  it('CONTROL — a shutdown with every buffer empty raises no residue alert', async () => {
    bufferOhlcBar('crypto_spot', bar(78_001));
    await drainArchiveBuffersForShutdown();
    expect(_alerts.filter((x) => x.dedupe_key === 'archive-writer-shutdown-residue')).toHaveLength(0);
    expect(_handoffs).toHaveLength(1);   // the drain ran to the handoff
  });

  // CONTROL: below the cap there is no shed and no alert.
  it('CONTROL — a transient failure below the cap raises no shed alert', async () => {
    clearShedAlertLatch('ticker', 'crypto_spot');
    _dbState.throwWith = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    bufferTickerSnap('crypto_spot', snap(9_000_001));
    await stopTickerWriter();
    await waitFor(() => _alerts.length > 0, 200);
    expect(_alerts).toHaveLength(0);
    _dbState.throwWith = null;
    await stopTickerWriter();
  });
});
