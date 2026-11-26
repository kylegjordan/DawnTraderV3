import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@shared/schema';
import { DatabaseStorage } from '../../storage';
import { clearGlobalActiveEngineManager, setGlobalActiveEngineManager } from '../../services/active-engine-service.js';
import { PAPER_ENTRY_DRAIN_BUDGET_MS, paperEntryPublication } from '../../services/paper-entry-publication.js';

const h = vi.hoisted(() => ({
  managerStart: vi.fn(),
  managerStop: vi.fn(),
  hardReset: vi.fn(),
  readMirror: vi.fn(),
  reanchor: vi.fn(),
  clearRtb: vi.fn(),
  broadcast: vi.fn(async (_event: unknown) => undefined),
  writeContext: vi.fn(async (_mode: string, _patch: unknown) => undefined),
  createSession: vi.fn(),
  readSession: vi.fn(),
  updateSession: vi.fn(),
  getSystemContext: vi.fn(),
  getActiveOpenPosition: vi.fn(),
  isolatedDb: undefined as typeof import('../../db').db | undefined,
}));

vi.mock('../../db', async (original) => {
  const real = await original<typeof import('../../db')>();
  return { ...real, db: new Proxy(real.db, {
    get: (target, key) => {
      const db = h.isolatedDb ?? target;
      const value = Reflect.get(db, key);
      return typeof value === 'function' ? value.bind(db) : value;
    },
  }) };
});

vi.mock('../../storage', async (original) => {
  const real = await original<typeof import('../../storage')>();
  const fixture = {
    getUser: async () => ({ role: 'admin', isAdmin: true }),
    getPortfolioState: async () => ({ balance: '500' }),
    getSystemContext: h.getSystemContext,
    updateSystemContext: h.writeContext,
    getActiveOpenPositions: async () => [],
    getActiveOpenPosition: h.getActiveOpenPosition,
    hardResetActiveEngineTables: h.hardReset,
    getRunningEngineSession: h.readSession,
    createActiveEngineSession: h.createSession,
    updateActiveEngineSession: h.updateSession,
    getWatchlist: async () => [{ symbol: 'BTC/USD' }],
  };
  return { ...real, storage: new Proxy(real.storage, {
    get: (target, key) => key in fixture ? Reflect.get(fixture, key) : Reflect.get(target, key),
  }) };
});
vi.mock('../../services/active-portfolio-manager.js', () => ({
  ActivePortfolioManager: class {
    getIsRunning() { return true; }
    start = h.managerStart;
    stop = h.managerStop;
  },
}));
vi.mock('../../services/context-bridge.js', async (original) => {
  const real = await original<typeof import('../../services/context-bridge.js')>();
  return { ...real, contextBridge: { ...real.contextBridge, broadcast: h.broadcast } };
});
vi.mock('../../services/kraken-mirror-balance.js', () => ({ getKrakenMirrorBalance: h.readMirror }));
vi.mock('../../services/portfolio-anchor-service.js', async (original) => ({
  ...(await original<typeof import('../../services/portfolio-anchor-service.js')>()),
  executeReanchor: h.reanchor,
  getRatioStampInputs: async () => null,
}));
vi.mock('../../services/metrics-core.js', async (original) => ({
  ...(await original<typeof import('../../services/metrics-core.js')>()),
  metricsCore: { reset: vi.fn(async () => undefined) },
}));
vi.mock('../../services/trading-state-sync.js', async (original) => ({
  ...(await original<typeof import('../../services/trading-state-sync.js')>()),
  tradingStateSync: {
    setEngineActive: vi.fn(async () => undefined),
    setTradingMode: vi.fn(async () => undefined),
    broadcastUserUpdate: vi.fn(async () => undefined),
  },
}));
vi.mock('../../services/c5-financial-diagnostics.js', async (original) => ({
  ...(await original<typeof import('../../services/c5-financial-diagnostics.js')>()),
  c5FinancialDiagnostics: { logBalanceReconciliation: vi.fn(async () => undefined) },
}));
vi.mock('../../services/rtb-metrics-service.js', async (original) => ({
  ...(await original<typeof import('../../services/rtb-metrics-service.js')>()),
  rtbMetricsService: { startInvariantCheck: vi.fn() },
}));
vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', async (original) => {
  const real = await original<typeof import('../../exchanges/kraken/kraken-websocket-adapter.js')>();
  const fixture = {
    removeAllListeners: vi.fn(),
    on: vi.fn(),
    getSubscriptionStats: () => ({ subscribedSymbols: 0, symbolStats: 0, priceTickLogs: 0 }),
    clearAllSubscriptions: vi.fn(),
    startPriceTickHealthLogging: vi.fn(),
  };
  return { ...real, krakenWebSocketAdapter: new Proxy(real.krakenWebSocketAdapter, {
    get: (target, key) => key in fixture ? Reflect.get(fixture, key) : Reflect.get(target, key),
  }) };
});
vi.mock('../../utils/clear-routines.js', async (original) => ({
  ...(await original<typeof import('../../utils/clear-routines.js')>()),
  clearReadyToBuy: h.clearRtb,
}));

const SECRET = 'fixed-test-route-key';
const auth = jwt.sign({ id: 'reset-test-user', username: 'reset-test' }, SECRET);
let server: Server;
let base: string;
let started: symbol | undefined;
let positions: Array<{ id: string; mode: 'paper' | 'live' }> = [];
let trades: Array<{ id: string; mode: 'paper' | 'live'; closed: boolean }> = [];

beforeAll(async () => {
  vi.stubEnv('JWT_SECRET', SECRET);
  vi.stubEnv('JWT_REFRESH_SECRET', 'fixed-test-route-refresh-key');
  const { registerRoutes } = await import('../../routes.js');
  const app = express();
  app.use(express.json());
  const routes = await registerRoutes(app);
  app.use('/api', routes.apiRouter);
  server = routes.httpServer.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected the isolated HTTP fixture to listen locally');
  base = `http://127.0.0.1:${address.port}/api/active-engine`;
}, 30_000); // Cold import of the full router with concurrent test workers.

afterAll(async () => {
  if (server?.listening) {
    server.close();
    await once(server, 'close');
  }
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  positions = [{ id: 'unrelated-live-position', mode: 'live' }];
  trades = [{ id: 'unrelated-live-trade', mode: 'live', closed: false }];
  h.readSession.mockResolvedValue(null);
  h.updateSession.mockResolvedValue(undefined);
  h.getSystemContext.mockResolvedValue({ baselineMode: 'persistent' });
  h.getActiveOpenPosition.mockResolvedValue(undefined);
  h.clearRtb.mockResolvedValue(0);
  h.readMirror.mockResolvedValue({ mirrorBalanceUsd: 750 });
  h.reanchor.mockResolvedValue(undefined);
  h.hardReset.mockImplementation(async (mode: 'paper' | 'live', permit?: symbol) => {
    expect(paperEntryPublication.holdsResetPermit(permit)).toBe(true);
    expect(paperEntryPublication.isQuiescent()).toBe(true);
    const removed = positions.filter((p) => p.mode === mode).length;
    const closed = trades.filter((t) => t.mode === mode && !t.closed);
    for (const trade of closed) trade.closed = true;
    positions = positions.filter((p) => p.mode !== mode);
    return { clearedPositions: removed, closedTrades: closed.length };
  });
  h.createSession.mockImplementation(async (session: Record<string, unknown>) => ({ ...session, startedAt: new Date() }));
  h.managerStart.mockImplementation(async (_source: string, permit?: symbol) => {
    started = paperEntryPublication.startRun(permit);
  });
  h.managerStop.mockImplementation(async () => paperEntryPublication.closeRun(started));
});

afterEach(() => {
  paperEntryPublication.closeRun(started);
  started = undefined;
  clearGlobalActiveEngineManager('paper');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function post(action: 'reset' | 'new' | 'continue') {
  const path = action === 'reset' ? 'reset' : 'start';
  const response = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify(action === 'reset' ? {} : { mode: action }),
  });
  return { status: response.status, body: await response.json() };
}

async function postRestore(positionId: string) {
  const response = await fetch(`${base}/positions/${positionId}/restore-record`, {
    method: 'POST', headers: { authorization: `Bearer ${auth}` },
  });
  return { status: response.status, body: await response.json() };
}

describe('#961 paper reset through signed requests on the registered routes', () => {
  it.each([
    ['reset', 'crypto_spot'], ['reset', 'xstock_spot'],
    ['new', 'crypto_spot'], ['new', 'xstock_spot'],
  ] as const)('refuses %s during %s publication and retries after manager removal', async (action, assetClass) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const run = paperEntryPublication.startRun();
    const finish = paperEntryPublication.beginWrite(run);
    if (!finish) throw new Error('Paper fixture was not admitted');
    // The trade insert has returned. The linked position write has not.
    trades.push({ id: `publishing-${assetClass}`, mode: 'paper', closed: false });
    const manager = {
      stop: vi.fn(async () => paperEntryPublication.closeRun(run)),
      resetSessionState: vi.fn(),
    };
    setGlobalActiveEngineManager(manager);
    const drain = vi.spyOn(paperEntryPublication, 'drain');
    try {
      const first = post(action);
      await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1));
      const competing = post('continue');
      await vi.advanceTimersByTimeAsync(PAPER_ENTRY_DRAIN_BUDGET_MS);
      expect(await first).toMatchObject({ status: 409, body: { error: expect.stringContaining('still settling') } });
      expect(await competing).toMatchObject({ status: 409, body: { error: expect.stringContaining('still settling') } });
      expect(manager.stop).toHaveBeenCalledOnce();
      expect(manager.resetSessionState).not.toHaveBeenCalled();
      clearGlobalActiveEngineManager('paper');
      const retry = post(action);
      await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(PAPER_ENTRY_DRAIN_BUDGET_MS);
      expect(await retry).toMatchObject({ status: 409 });
      expect(h.hardReset).not.toHaveBeenCalled();
      expect(h.clearRtb).not.toHaveBeenCalled();
      expect(h.broadcast).not.toHaveBeenCalled();
      expect(h.readMirror).not.toHaveBeenCalled();
      expect(h.writeContext).not.toHaveBeenCalled();
      expect(h.reanchor).not.toHaveBeenCalled();
      expect(trades.find((t) => t.mode === 'paper')?.closed).toBe(false);

      positions.push({ id: `linked-${assetClass}`, mode: 'paper' });
      finish();
      h.reanchor.mockImplementationOnce(async () => {
        expect(paperEntryPublication.allowsStart()).toBe(false);
        expect(() => paperEntryPublication.startRun()).toThrow('still settling');
      });
      expect(await post(action)).toMatchObject({ status: 200, body: { success: true } });
      expect(h.hardReset).toHaveBeenCalledOnce();
      expect(h.clearRtb).toHaveBeenCalledOnce();
      expect(trades.find((t) => t.mode === 'paper')?.closed).toBe(true);
      expect(trades.find((t) => t.mode === 'live')?.closed).toBe(false);
      expect(positions.map((p) => p.id)).toEqual(['unrelated-live-position']);
      expect(h.reanchor).toHaveBeenCalledTimes(action === 'new' ? 1 : 0);
      expect(h.managerStart).toHaveBeenCalledTimes(action === 'new' ? 1 : 0);
      expect(paperEntryPublication.allowsStart()).toBe(true);
    } finally {
      paperEntryPublication.closeRun(run);
      finish();
    }
  });

  it('continues from the stored balance without resetting or mirroring', async () => {
    expect(await post('continue')).toMatchObject({ status: 200, body: { success: true } });
    expect(h.createSession).toHaveBeenCalledWith(expect.objectContaining({ mode: 'paper', startingBalance: '500' }));
    expect(h.hardReset).not.toHaveBeenCalled();
    expect(h.readMirror).not.toHaveBeenCalled();
    expect(h.reanchor).not.toHaveBeenCalled();
    expect(h.managerStart).toHaveBeenCalledWith('api', undefined);
  });

  it.each(['reset', 'new', 'continue'] as const)('stops a partially started Continue before a later %s', async (action) => {
    h.getSystemContext.mockResolvedValue({ baselineMode: 'persistent', isEngineActive: true });
    h.readSession.mockResolvedValue({ id: 'db-row', sessionId: 'lost-manager', mode: 'paper' });
    h.updateSession.mockImplementation(async () => { h.readSession.mockResolvedValue(null); });
    h.managerStart.mockImplementationOnce(async (_source: string, permit?: symbol) => {
      started = paperEntryPublication.startRun(permit);
      throw new Error('fixture: startup failed after opening admission');
    });

    expect(await post('continue')).toMatchObject({ status: 400 });
    expect(h.managerStop).toHaveBeenCalledOnce();
    expect(paperEntryPublication.isQuiescent()).toBe(true);
    expect(h.updateSession).toHaveBeenCalledWith('db-row', { status: 'failed' });

    expect(await post(action)).toMatchObject({ status: 200, body: { success: true } });
    expect(h.hardReset).toHaveBeenCalledTimes(action === 'continue' ? 0 : 1);
    expect(h.managerStart).toHaveBeenCalledTimes(action === 'reset' ? 1 : 2);
  });

  it('releases the reset permit after a failed mirror so Continue can recover', async () => {
    h.readMirror.mockRejectedValueOnce(new Error('test balance read failed'));
    expect(await post('new')).toMatchObject({ status: 502 });
    expect(h.hardReset).toHaveBeenCalledOnce();
    expect(h.reanchor).not.toHaveBeenCalled();
    expect(h.managerStart).not.toHaveBeenCalled();
    expect(await post('continue')).toMatchObject({ status: 200, body: { success: true } });
  });
});

describe('#961 record restore and destructive routes on isolated PostgreSQL tables', () => {
  const namespace = `xstock_961_${randomBytes(6).toString('hex')}`;
  const realStorage = new DatabaseStorage();
  let admin: pg.Pool | undefined;
  let fixture: pg.Pool | undefined;
  let created = false;
  const tables = ['active_open_positions', 'closed_trades', 'active_engine_sessions'];
  const dbUrl = process.env.DATABASE_URL ?? '';

  beforeAll(async () => {
    if (!/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(dbUrl)) {
      if (process.env.CI) throw new Error('The restore race requires an isolated test database in CI');
      return;
    }
    admin = new pg.Pool({ connectionString: dbUrl, connectionTimeoutMillis: 1_500 });
    try {
      await admin.query('SELECT 1');
    } catch (error) {
      if (process.env.CI) throw error;
      return;
    }

    await admin.query(`CREATE SCHEMA ${namespace}`);
    created = true;
    for (const table of tables) await admin.query(`CREATE TABLE ${namespace}.${table} (LIKE public.${table} INCLUDING ALL)`);
    fixture = new pg.Pool({ connectionString: dbUrl, options: `-c search_path=${namespace},public -c statement_timeout=7000` });
    const { rows } = await fixture.query('SELECT current_schema() AS name');
    expect(rows[0].name).toBe(namespace);
  });

  afterAll(async () => {
    if (fixture) await fixture.end();
    if (created) await admin?.query(`DROP SCHEMA ${namespace} CASCADE`);
    if (admin) await admin.end();
  });

  beforeEach(async () => {
    if (fixture) await fixture.query(`TRUNCATE ${tables.map((table) => `${namespace}.${table}`).join(', ')}`);
  });

  afterEach(() => {
    h.isolatedDb = undefined;
  });

  async function seed(positionId: string) {
    if (!fixture) throw new Error('Missing the PostgreSQL fixture');
    h.isolatedDb = drizzle(fixture, { schema });
    h.hardReset.mockImplementation(realStorage.hardResetActiveEngineTables.bind(realStorage));
    h.getActiveOpenPosition.mockImplementation(realStorage.getActiveOpenPosition.bind(realStorage));
    await h.isolatedDb.insert(schema.activeOpenPositions).values({
      id: positionId, mode: 'paper', symbol: 'PDD/USD', assetClass: 'xstock_spot',
      exchange: 'kraken', strategyName: 'strong_bull_trend', side: 'buy', quantity: '1', avgPrice: '96',
      entryFee: '0.1', entrySlippage: '0.2', metadata: { original: 'retain' },
    });
  }

  for (const action of ['reset', 'new'] as const) {
    it(`refuses a restore if ${action} removed its exact position after the first read`, async (ctx) => {
      if (!fixture) return ctx.skip();
      const id = `position-before-${action}`;
      await seed(id);
      let release!: () => void;
      const resume = new Promise<void>((resolve) => { release = resolve; });
      let observed!: () => void;
      const firstRead = new Promise<void>((resolve) => { observed = resolve; });
      h.getActiveOpenPosition.mockImplementationOnce(async () => {
        const position = await realStorage.getActiveOpenPosition('paper', id);
        observed();
        await resume;
        return position;
      });

      const restoring = postRestore(id);
      try {
        await firstRead;
        expect(await post(action)).toMatchObject({ status: 200, body: { success: true } });
      } finally {
        release();
        await restoring;
      }
      expect(await restoring).toMatchObject({ status: 404, body: { ok: false, error: 'position not found' } });
      expect(await h.isolatedDb?.select().from(schema.closedTradesTable)).toEqual([]);
    });
  }

  it('commits its still-present position link, refuses a duplicate and then lets reset close the restored record', async (ctx) => {
    if (!fixture) return ctx.skip();
    const id = 'uninterrupted-position';
    await seed(id);
    const restored = await postRestore(id);
    expect(restored).toMatchObject({ status: 200, body: { ok: true, positionId: id } });
    const recordId = restored.body.recordId;
    expect(await realStorage.getActiveOpenPosition('paper', id)).toMatchObject({ metadata: { tradeId: recordId, original: 'retain' } });
    expect(await realStorage.findOpenTradeRecord('paper', 'PDD/USD', 'xstock_spot')).toMatchObject({ status: 'one', record: { id: recordId } });
    expect(await postRestore(id)).toMatchObject({ status: 409, body: { recordId } });
    expect(await post('reset')).toMatchObject({ status: 200, body: { success: true } });
    expect(await realStorage.getActiveOpenPosition('paper', id)).toBeUndefined();
    expect(await realStorage.getClosedTrade('paper', recordId)).toMatchObject({ closeReason: 'hard_reset' });
  });

  it('waits for a restore holding the mode lock before Reset closes trades', async (ctx) => {
    if (!fixture) return ctx.skip();
    const id = 'restore-before-reset';
    await seed(id);
    const blocker = await fixture.connect();
    let resetting: ReturnType<typeof post> | undefined;
    let restoring: ReturnType<typeof postRestore> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query("SELECT pg_advisory_xact_lock(hashtext('open-record:paper:PDD/USD:xstock_spot'))");
      restoring = postRestore(id);
      await vi.waitFor(async () => {
        const { rows } = await fixture!.query("SELECT pg_try_advisory_xact_lock(hashtext('engine-reset:paper')) AS available");
        expect(rows[0].available).toBe(false);
      });

      resetting = post('reset');
      await vi.waitFor(async () => {
        const { rows } = await fixture!.query(`SELECT EXISTS (SELECT 1 FROM pg_locks
          WHERE locktype = 'advisory' AND objid = hashtext('engine-reset:paper')::oid
            AND mode = 'ExclusiveLock' AND NOT granted) AS waiting`);
        expect(rows[0].waiting).toBe(true);
      });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await Promise.allSettled([restoring, resetting]);
    }
    const restored = await restoring;
    expect(restored).toMatchObject({ status: 200, body: { ok: true } });
    expect(await resetting).toMatchObject({ status: 200, body: { success: true } });
    expect(await realStorage.getActiveOpenPosition('paper', id)).toBeUndefined();
    expect(await realStorage.getClosedTrade('paper', restored?.body.recordId)).toMatchObject({ closeReason: 'hard_reset' });
  });

  it('rolls back the new trade when the position link cannot be written', async (ctx) => {
    if (!fixture) return ctx.skip();
    const id = 'failed-position-link';
    await seed(id);
    await fixture.query(`CREATE FUNCTION ${namespace}.refuse_link() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN RETURN NULL; END; $$`);
    await fixture.query(`CREATE TRIGGER refuse_link BEFORE UPDATE ON ${namespace}.active_open_positions
      FOR EACH ROW EXECUTE FUNCTION ${namespace}.refuse_link()`);
    expect(await postRestore(id)).toMatchObject({ status: 500, body: { ok: false } });
    expect(await realStorage.findOpenTradeRecord('paper', 'PDD/USD', 'xstock_spot')).toEqual({ status: 'none' });
    expect(await realStorage.getActiveOpenPosition('paper', id)).toMatchObject({ metadata: { original: 'retain' } });
  });
});
