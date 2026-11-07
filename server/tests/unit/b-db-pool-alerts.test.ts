import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { attachPoolInstrument, subscribePoolFlush, isAcquireTimeout, ACQUIRE_TIMEOUT_MESSAGE, type PoolFlushRecord } from '../../db-pool-instrument.js';
import { attachPoolGuards, subscribeCheckedOutClientErrors } from '../../db-pool-guards.js';
import {
  evaluateWaitLevel, nextIdleState, parseIdleRow, evaluateRestart, raiseIncident, startDbPoolAlerts,
  RESTART_PREFIX, RESTART_BLIND_KEY, IDLE_IN_TX_POLL_MS, IDLE_IN_TX_BOUND_S, ACTOR, type AlertDeps, type RestartInputs,
} from '../../db-pool-alerts.js';
import { ALERT_ACTORS } from '../../services/system-alerts.js';

// B-DB-POOL-GUARD P4 (#1239, increment 3b r2): the OBJ-5 pages. Pure evaluators first, then the wiring through a
// stand-in pool and fake alert deps (mint once, no re-mint while open, the clear edge, the blind keys).

const MIN = 60_000;
const rec = (startMin: number, endMin: number, o: Partial<PoolFlushRecord> = {}): PoolFlushRecord => ({
  label: 'p', startWallMs: startMin * MIN, endWallMs: endMin * MIN, checkouts: 10, waitsOver1s: 0, waitsOver5s: 0,
  acquireTimeouts: 0, maxWaitMs: 0, maxWaitSite: '-', open: 1, total: 3, idle: 2, waiting: 0, ...o,
});

describe('OBJ-5(a) — the wait LEVEL, windowed by covered time', () => {
  it('fires at 3 waits over 1 s inside 5 minutes, not at 2 (the measured worst window held 2)', () => {
    const two = [rec(0, 1, { waitsOver1s: 1 }), rec(1, 2, { waitsOver1s: 1 })];
    expect(evaluateWaitLevel(two, 2 * MIN).fire).toBe(false);
    const three = [...two, rec(2, 3, { waitsOver1s: 1, maxWaitMs: 1400, maxWaitSite: 'x' })];
    const v = evaluateWaitLevel(three, 3 * MIN);
    expect(v.fire).toBe(true);
    expect(v.window).toMatchObject({ waitsOver1s: 3, maxWaitMs: 1400, maxWaitSite: 'x' });
  });
  it('fires on ONE wait over 5 s', () => {
    expect(evaluateWaitLevel([rec(0, 1, { waitsOver5s: 1, waitsOver1s: 1 })], MIN).fire).toBe(true);
  });
  it('selects records by their covered interval, not by counting lines (an irregular flush gap)', () => {
    // three waits, but the first record ENDED more than 5 min ago, so only two are in the window
    const rs = [rec(0, 1, { waitsOver1s: 1 }), rec(5.5, 6.5, { waitsOver1s: 1 }), rec(6.5, 7, { waitsOver1s: 1 })];
    expect(evaluateWaitLevel(rs, 7 * MIN).fire).toBe(false);
  });
  it('clears only after 10 minutes of COVERED time at zero', () => {
    const quiet = Array.from({ length: 10 }, (_, i) => rec(i, i + 1));
    expect(evaluateWaitLevel(quiet, 10 * MIN).clear).toBe(true);
    expect(evaluateWaitLevel(quiet.slice(1), 10 * MIN).clear).toBe(false); // only 9 minutes covered
    const noisy = quiet.map((r, i) => (i === 3 ? { ...r, waitsOver1s: 1 } : r));
    expect(evaluateWaitLevel(noisy, 10 * MIN).clear).toBe(false);
  });
});

describe('OBJ-5(b) — the idle-in-transaction sampler', () => {
  it('samples at most every 25 s: period <= kill (60 s) - bound (30 s) (Langston C1)', () => {
    expect(IDLE_IN_TX_POLL_MS).toBeLessThanOrEqual((60 - IDLE_IN_TX_BOUND_S) * 1000);
  });
  it('fires on one, clears only after two consecutive zero reads; a failed read is BLIND, never a zero', () => {
    expect(nextIdleState(0, { ok: true, n: 1, maxS: 40 })).toMatchObject({ fire: true, clear: false, zeroRun: 0 });
    const a = nextIdleState(0, { ok: true, n: 0, maxS: 0 });
    expect(a).toMatchObject({ clear: false, zeroRun: 1 });
    expect(nextIdleState(a.zeroRun, { ok: true, n: 0, maxS: 0 })).toMatchObject({ clear: true, zeroRun: 2 });
    expect(nextIdleState(1, { ok: false, error: 'x' })).toMatchObject({ blind: true, clear: false, zeroRun: 0 });
  });
  it('a malformed or empty result reads as a failure, not as zero', () => {
    expect(parseIdleRow([])).toMatchObject({ ok: false });
    expect(parseIdleRow([{ n: 'x', max_s: 1 }])).toMatchObject({ ok: false });
    expect(parseIdleRow([{ n: 0, max_s: 0 }])).toEqual({ ok: true, n: 0, maxS: 0 });
  });
});

const base = (o: Partial<RestartInputs> = {}): RestartInputs => ({
  liveRestartTime: '682', recordText: 'sha=aaa\nrestart_time=682\n',
  lock: { exists: false, pid: null, holder: null, since: null, sha: null },
  pidAlive: () => false, liveDeployProcess: false, repoHead: 'aaa', ...o,
});

describe('OBJ-5(c) — the restart comparator', () => {
  it('match, HIGHER (with the delta) and LOWER', () => {
    expect(evaluateRestart(base())).toEqual({ kind: 'match', live: 682 });
    expect(evaluateRestart(base({ liveRestartTime: '684' }))).toMatchObject({ kind: 'mismatch', direction: 'HIGHER', live: 684, record: 682 });
    expect(evaluateRestart(base({ liveRestartTime: '3' }))).toMatchObject({ kind: 'mismatch', direction: 'LOWER' });
  });
  it('the record\'s LAST restart_time is read (the record appends)', () => {
    expect(evaluateRestart(base({ recordText: 'restart_time=1\nsha=x\nrestart_time=682\n' }))).toMatchObject({ kind: 'match' });
  });
  it('a live-pid lock SUPPRESSES; a dead-pid lock does NOT (SIGKILL skips the trap)', () => {
    const lock = { exists: true, pid: 99, holder: 'cc-a', since: 't', sha: 's' };
    expect(evaluateRestart(base({ liveRestartTime: '684', lock, pidAlive: () => true })).kind).toBe('suppress');
    expect(evaluateRestart(base({ liveRestartTime: '684', lock, pidAlive: () => false })).kind).toBe('mismatch');
  });
  it('an unreadable pid SUPPRESSES only while a dt-deploy process runs, otherwise reads BLIND — no clock (Langston)', () => {
    const lock = { exists: true, pid: null, holder: 'cc-a', since: '2026-11-07T18:00:00Z', sha: 's' };
    expect(evaluateRestart(base({ lock, liveDeployProcess: true })).kind).toBe('suppress');
    const v = evaluateRestart(base({ lock, liveDeployProcess: false }));
    expect(v.kind).toBe('blind');
    expect((v as { why: string }).why).toMatch(/holder=cc-a.*since=2026-11-07T18:00:00Z/);
  });
  it('every silent input reads BLIND: a non-numeric record (`unknown`), a missing record, no live count', () => {
    expect(evaluateRestart(base({ recordText: 'restart_time=unknown\n' })).kind).toBe('blind');
    expect(evaluateRestart(base({ recordText: null })).kind).toBe('blind');
    expect(evaluateRestart(base({ liveRestartTime: undefined })).kind).toBe('blind');
  });
});

describe('the incident helper', () => {
  const deps = (open: { id: string } | null, mergeResult: unknown): AlertDeps & { minted: string[] } => {
    const minted: string[] = [];
    return {
      minted,
      addAlert: async (o) => { minted.push(o.dedupe_key); return { id: 'n' }; },
      resolveByKey: async () => [], resolveByPrefix: async () => [],
      openRow: () => open, merge: async () => mergeResult,
    };
  };
  it('merges into an open row', async () => {
    const d = deps({ id: 'r1' }, { ok: true });
    expect(await raiseIncident(d, 'k', 'warning', 't', 'b', 1, 'now')).toBe('merged');
    expect(d.minted).toEqual([]);
  });
  it('MINTS when the merge finds no open row (mergeAlertMetadata returns null on a resolved row — Langston cond. 1)', async () => {
    const d = deps({ id: 'r1' }, null);
    expect(await raiseIncident(d, 'k', 'warning', 't', 'b', 1, 'now')).toBe('minted');
    expect(d.minted).toEqual(['k']);
  });
});

// ── the wiring, through a stand-in pool ──────────────────────────────────────────────────────────────────────────
class FakeClient extends EventEmitter {
  constructor(private pool: FakePool) { super(); }
  release() { this.pool.emit('release', undefined, this); }
}
class FakePool extends EventEmitter {
  failNext: Error | null = null;
  totalCount = 1; idleCount = 1; waitingCount = 0;
  connect(cb?: (err: Error | undefined, client?: FakeClient) => void) {
    if (this.failNext) { const e = this.failNext; this.failNext = null; if (cb) { cb(e); return undefined; } return Promise.reject(e); }
    const client = new FakeClient(this);
    this.emit('connect', client); this.emit('acquire', client);
    if (cb) { cb(undefined, client); return undefined; }
    return Promise.resolve(client);
  }
  query() { return Promise.resolve({ rows: [] }); }
}

// `fired` models the dispatcher's promotion stamp (fired_at). Seeded rows and, by default, minted rows count as promoted,
// so the clear edges below test the evaluators; `memDeps({ promote: false })` mints UNPROMOTED rows for the deferral.
type MemRow = { id: string; open: boolean; metadata: Record<string, unknown>; fired?: boolean };
function memDeps(opt: { promote?: boolean } = {}): AlertDeps & { rows: Map<string, MemRow>; log: string[] } {
  const rows = new Map<string, MemRow>();
  const log: string[] = [];
  let n = 0;
  return {
    rows, log,
    addAlert: async (o) => {
      const cur = rows.get(o.dedupe_key);
      if (cur?.open) return { id: cur.id }; // the non-terminal dedupe
      const row = { id: `id${++n}`, open: true, metadata: o.metadata ?? {}, fired: opt.promote ?? true };
      rows.set(o.dedupe_key, row); log.push(`mint ${o.dedupe_key}`);
      return { id: row.id };
    },
    resolveByKey: async (key) => { const r = rows.get(key); if (r?.open) { r.open = false; log.push(`resolve ${key}`); return [r.id]; } return []; },
    resolveByPrefix: async (prefix, exclude) => {
      const out: string[] = [];
      for (const [k, r] of rows) if (k.startsWith(prefix) && !exclude.has(k) && r.open) { r.open = false; log.push(`resolve ${k}`); out.push(r.id); }
      return out;
    },
    openRow: (key) => { const r = rows.get(key); return r?.open ? { id: r.id, metadata: r.metadata, fired_at: r.fired === false ? null : 'promoted' } : null; },
    merge: async (id, patch) => { for (const r of rows.values()) if (r.id === id && r.open) { r.metadata = patch(r.metadata); return r; } return null; },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the wiring', () => {
  it('subscribing to a pool that was never instrumented or guarded THROWS (Langston C5)', () => {
    expect(() => subscribePoolFlush('never-attached', () => {})).toThrow(/not instrumented/);
    expect(() => subscribeCheckedOutClientErrors('never-attached', () => {})).toThrow(/not guarded/);
  });

  it('the acquire-timeout literal is pg-pool 3.7.0\'s own text, matched exactly', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../node_modules/pg-pool/index.js'), 'utf8');
    expect(src).toContain(`new Error('${ACQUIRE_TIMEOUT_MESSAGE}')`);
    expect(isAcquireTimeout(new Error(ACQUIRE_TIMEOUT_MESSAGE))).toBe(true);
    expect(isAcquireTimeout(new Error(`${ACQUIRE_TIMEOUT_MESSAGE} (wrapped)`))).toBe(false);
  });

  it('a rejected acquire is counted, reaches the flush record, and mints ONE incident; a second merges', async () => {
    const pool = new FakePool();
    const inst = attachPoolInstrument(pool as unknown as pg.Pool, 'w1', { log: () => {}, intervalMs: 3_600_000 });
    attachPoolGuards(pool as unknown as pg.Pool, 'w1');
    inst.stop();
    const d = memDeps();
    const mon = startDbPoolAlerts({ label: 'w1', deps: d, flushIntervalMs: 3_600_000 });
    pool.failNext = new Error(ACQUIRE_TIMEOUT_MESSAGE);
    await expect((pool as unknown as pg.Pool).connect()).rejects.toThrow(ACQUIRE_TIMEOUT_MESSAGE);
    inst.flush(); await tick(); await tick();
    expect(d.log).toEqual(['mint db-pool-acquire-timeout:w1']);
    pool.failNext = new Error(ACQUIRE_TIMEOUT_MESSAGE);
    await expect((pool as unknown as pg.Pool).connect()).rejects.toThrow();
    inst.flush(); await tick(); await tick();
    expect(d.log).toEqual(['mint db-pool-acquire-timeout:w1']); // merged, not re-minted
    expect(d.rows.get('db-pool-acquire-timeout:w1')!.metadata.count).toBe(2);
    mon.stop();
  });

  it('the CALLBACK connect path (pg-pool query() at index.js:399, i.e. every drizzle query) counts an acquire timeout too (Langston C-2)', async () => {
    const pool = new FakePool();
    const inst = attachPoolInstrument(pool as unknown as pg.Pool, 'w1cb', { log: () => {}, intervalMs: 3_600_000 });
    attachPoolGuards(pool as unknown as pg.Pool, 'w1cb');
    inst.stop();
    const d = memDeps();
    const mon = startDbPoolAlerts({ label: 'w1cb', deps: d, flushIntervalMs: 3_600_000 });
    pool.failNext = new Error(ACQUIRE_TIMEOUT_MESSAGE);
    const got = await new Promise<Error | undefined>((res) => { (pool as unknown as { connect: (cb: (e?: Error) => void) => void }).connect((e) => res(e)); });
    expect(got?.message).toBe(ACQUIRE_TIMEOUT_MESSAGE); // the caller still receives the error unchanged
    pool.failNext = new Error('some other connect error');
    await new Promise<void>((res) => { (pool as unknown as { connect: (cb: (e?: Error) => void) => void }).connect(() => res()); });
    inst.flush(); await tick(); await tick();
    expect(d.log).toEqual(['mint db-pool-acquire-timeout:w1cb']);
    expect(d.rows.get('db-pool-acquire-timeout:w1cb')!.metadata.count).toBe(1); // the other error is not counted
    mon.stop();
  });

  it('the wait blind key RE-MINTS after a person resolves it while the monitor is still blind (Langston C-1)', async () => {
    vi.useFakeTimers();
    try {
      const pool = new FakePool();
      const inst = attachPoolInstrument(pool as unknown as pg.Pool, 'wb', { log: () => {}, intervalMs: 3_600_000 });
      attachPoolGuards(pool as unknown as pg.Pool, 'wb');
      inst.stop();
      const d = memDeps();
      const mon = startDbPoolAlerts({ label: 'wb', deps: d, flushIntervalMs: 1_000 });
      await vi.advanceTimersByTimeAsync(4_100); // > 3 intervals with no flush
      expect(d.log.filter((l) => l === 'mint db-pool-wait:blind')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2_000); // still blind, row open: no second mint (addAlert's dedupe)
      expect(d.log.filter((l) => l === 'mint db-pool-wait:blind')).toHaveLength(1);
      d.rows.get('db-pool-wait:blind')!.open = false; // a person resolves it while still blind
      await vi.advanceTimersByTimeAsync(1_000);
      expect(d.log.filter((l) => l === 'mint db-pool-wait:blind')).toHaveLength(2);
      await mon.onFlush(rec(0, 1, { label: 'wb' })); // a flush arrives: the blind row clears
      expect(d.log).toContain('resolve db-pool-wait:blind');
      mon.stop();
    } finally { vi.useRealTimers(); }
  });

  it('the wait level mints once, does not re-mint while open, and clears at the edge', async () => {
    const pool = new FakePool();
    const inst = attachPoolInstrument(pool as unknown as pg.Pool, 'w2', { log: () => {}, intervalMs: 3_600_000 });
    attachPoolGuards(pool as unknown as pg.Pool, 'w2');
    inst.stop();
    const d = memDeps();
    const mon = startDbPoolAlerts({ label: 'w2', deps: d, flushIntervalMs: 3_600_000 });
    await mon.onFlush(rec(0, 1, { label: 'w2', waitsOver5s: 1, waitsOver1s: 1 }));
    await mon.onFlush(rec(1, 2, { label: 'w2', waitsOver5s: 1, waitsOver1s: 1 }));
    expect(d.log.filter((l) => l.startsWith('mint db-pool-wait:w2'))).toHaveLength(1);
    for (let i = 2; i < 13; i++) await mon.onFlush(rec(i, i + 1, { label: 'w2' }));
    expect(d.log).toContain('resolve db-pool-wait:w2');
    mon.stop();
  });

  it('25P03 on a checked-out client mints the incident; the code=none follow-on is NOT counted (no 2:1)', async () => {
    const pool = new FakePool();
    attachPoolGuards(pool as unknown as pg.Pool, 'w3');
    attachPoolInstrument(pool as unknown as pg.Pool, 'w3', { log: () => {}, intervalMs: 3_600_000 }).stop();
    const d = memDeps();
    const mon = startDbPoolAlerts({ label: 'w3', deps: d, flushIntervalMs: 3_600_000 });
    const client = await (pool as unknown as { connect: () => Promise<FakeClient> }).connect();
    const err = (msg: string, code?: string) => Object.assign(new Error(msg), code ? { code } : {});
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    client.emit('error', err('terminating connection due to idle-in-transaction timeout', '25P03'));
    client.emit('error', err('Connection terminated unexpectedly'));
    spy.mockRestore();
    await tick(); await tick();
    expect(d.log).toEqual(['mint db-pool-idle-in-tx-ended:w3']);
    const body = d.rows.get('db-pool-idle-in-tx-ended:w3');
    expect(body!.metadata.count).toBe(1);
    mon.stop();
  });

  it('the restart family: two crash rows, then one deploy resolves BOTH, never the blind key (Langston C2)', async () => {
    const pool = new FakePool();
    attachPoolInstrument(pool as unknown as pg.Pool, 'w4', { log: () => {}, intervalMs: 3_600_000 }).stop();
    attachPoolGuards(pool as unknown as pg.Pool, 'w4');
    const d = memDeps();
    d.rows.set(`${RESTART_PREFIX}683`, { id: 'a', open: true, metadata: {} });
    d.rows.set(`${RESTART_PREFIX}684`, { id: 'b', open: true, metadata: {} });
    d.rows.set(RESTART_BLIND_KEY, { id: 'c', open: true, metadata: {} });
    let inputs = base({ liveRestartTime: '684' });
    vi.useFakeTimers();
    const mon = startDbPoolAlerts({ label: 'w4', deps: d, flushIntervalMs: 3_600_000, restartInputs: () => inputs });
    inputs = base({ liveRestartTime: '684', recordText: 'sha=aaa\nrestart_time=684\n' }); // the next dt-deploy recorded 684
    await vi.advanceTimersByTimeAsync(MIN + 10);
    vi.useRealTimers();
    expect(d.rows.get(`${RESTART_PREFIX}683`)!.open).toBe(false);
    expect(d.rows.get(`${RESTART_PREFIX}684`)!.open).toBe(false);
    expect(d.log).toContain(`resolve ${RESTART_BLIND_KEY}`); // the blind key clears on a READABLE decision, separately
    mon.stop();
  });

  it('a self-clearing level does NOT resolve until the dispatcher has promoted its row, then resolves on the next clean pass (Step-7 fold)', async () => {
    vi.useFakeTimers();
    try {
      const pool = new FakePool();
      attachPoolInstrument(pool as unknown as pg.Pool, 'wd', { log: () => {}, intervalMs: 3_600_000 }).stop();
      attachPoolGuards(pool as unknown as pg.Pool, 'wd');
      const d = memDeps({ promote: false });
      const logs: string[] = [];
      let read: { ok: true; n: number; maxS: number } = { ok: true, n: 1, maxS: 35 };
      const mon = startDbPoolAlerts({ label: 'wd', deps: d, flushIntervalMs: 3_600_000, idleRead: async () => read, log: (l) => logs.push(l) });
      await vi.advanceTimersByTimeAsync(IDLE_IN_TX_POLL_MS);
      expect(d.log).toEqual(['mint db-pool-idle-in-tx:wd']);
      read = { ok: true, n: 0, maxS: 0 };
      await vi.advanceTimersByTimeAsync(4 * IDLE_IN_TX_POLL_MS); // four clean reads: clear is due from the 2nd
      expect(d.rows.get('db-pool-idle-in-tx:wd')!.open).toBe(true); // ...but the row is not promoted: deferred
      expect(logs.filter((l) => l.includes('resolve deferred'))).toHaveLength(1); // said once, not every pass
      d.rows.get('db-pool-idle-in-tx:wd')!.fired = true; // the dispatcher tick promotes it
      await vi.advanceTimersByTimeAsync(IDLE_IN_TX_POLL_MS);
      expect(d.rows.get('db-pool-idle-in-tx:wd')!.open).toBe(false);
      expect(d.log).toEqual(['mint db-pool-idle-in-tx:wd', 'resolve db-pool-idle-in-tx:wd']);
      mon.stop();
    } finally { vi.useRealTimers(); }
  });

  it('a level re-firing into its pending row MERGES (fires, last_at, the running max) and never mints a second row (Langston condition 2)', async () => {
    vi.useFakeTimers();
    try {
      const pool = new FakePool();
      attachPoolInstrument(pool as unknown as pg.Pool, 'wm', { log: () => {}, intervalMs: 3_600_000 }).stop();
      attachPoolGuards(pool as unknown as pg.Pool, 'wm');
      const d = memDeps({ promote: false });
      let read: { ok: true; n: number; maxS: number } = { ok: true, n: 1, maxS: 35 };
      const mon = startDbPoolAlerts({ label: 'wm', deps: d, flushIntervalMs: 3_600_000, idleRead: async () => read, log: () => {} });
      await vi.advanceTimersByTimeAsync(IDLE_IN_TX_POLL_MS);
      read = { ok: true, n: 0, maxS: 0 };
      await vi.advanceTimersByTimeAsync(3 * IDLE_IN_TX_POLL_MS); // clear due, deferred (unpromoted)
      read = { ok: true, n: 2, maxS: 52 }; // a second, bigger leak while the first row waits
      await vi.advanceTimersByTimeAsync(IDLE_IN_TX_POLL_MS);
      read = { ok: true, n: 1, maxS: 40 }; // a smaller one does not lower the worst
      await vi.advanceTimersByTimeAsync(IDLE_IN_TX_POLL_MS);
      const row = d.rows.get('db-pool-idle-in-tx:wm')!;
      expect(d.log).toEqual(['mint db-pool-idle-in-tx:wm']);
      expect(row.metadata).toMatchObject({ fires: 3, n: 2, max_s: 52 });
      expect(row.metadata.first_at).toBeDefined();
      expect(row.metadata.last_at).toBeDefined();
      mon.stop();
    } finally { vi.useRealTimers(); }
  });

  it('the wait level defers its clear too, and merges a later window\'s worst into the open row', async () => {
    const pool = new FakePool();
    attachPoolInstrument(pool as unknown as pg.Pool, 'ww', { log: () => {}, intervalMs: 3_600_000 }).stop();
    attachPoolGuards(pool as unknown as pg.Pool, 'ww');
    const d = memDeps({ promote: false });
    const mon = startDbPoolAlerts({ label: 'ww', deps: d, flushIntervalMs: 3_600_000, log: () => {} });
    await mon.onFlush(rec(0, 1, { label: 'ww', waitsOver5s: 1, waitsOver1s: 1, maxWaitMs: 6_000, maxWaitSite: 'a' }));
    await mon.onFlush(rec(1, 2, { label: 'ww', waitsOver5s: 1, waitsOver1s: 1, maxWaitMs: 9_000, maxWaitSite: 'b' }));
    for (let i = 2; i < 14; i++) await mon.onFlush(rec(i, i + 1, { label: 'ww' }));
    const row = d.rows.get('db-pool-wait:ww')!;
    expect(row.open).toBe(true); // clear due (10 covered quiet minutes), deferred: unpromoted
    // fires 6: the 5 s waits ending at minutes 1-2 stay inside the 5-minute window through the flush ending at minute 6
    expect(row.metadata).toMatchObject({ fires: 6, waitsOver5s: 2, maxWaitMs: 9_000, maxWaitSite: 'b' });
    row.fired = true;
    await mon.onFlush(rec(14, 15, { label: 'ww' }));
    expect(row.open).toBe(false);
    expect(d.log.filter((l) => l.startsWith('mint'))).toHaveLength(1);
    mon.stop();
  });

  it('the machine actor is in the one canonical table', () => {
    expect(ALERT_ACTORS.some((a) => a.value === ACTOR && a.tag === 'machine')).toBe(true);
  });
});
