import express from 'express';
import jwt from 'jsonwebtoken';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlobalActiveEngineManager, setGlobalActiveEngineManager } from '../../services/active-engine-service.js';
import { PAPER_ENTRY_DRAIN_BUDGET_MS, paperEntryPublication } from '../../services/paper-entry-publication.js';

const h = vi.hoisted(() => ({
  managerStart: vi.fn(),
  hardReset: vi.fn(),
  readMirror: vi.fn(),
  reanchor: vi.fn(),
  clearRtb: vi.fn(),
  broadcast: vi.fn(async (_event: unknown) => undefined),
  writeContext: vi.fn(async (_mode: string, _patch: unknown) => undefined),
  createSession: vi.fn(),
  readSession: vi.fn(),
}));

vi.mock('../../storage', async (original) => {
  const real = await original<typeof import('../../storage')>();
  const fixture = {
    getUser: async () => ({ role: 'admin', isAdmin: true }),
    getPortfolioState: async () => ({ balance: '500' }),
    getSystemContext: async () => ({ baselineMode: 'persistent' }),
    updateSystemContext: h.writeContext,
    getActiveOpenPositions: async () => [],
    hardResetActiveEngineTables: h.hardReset,
    getRunningEngineSession: h.readSession,
    createActiveEngineSession: h.createSession,
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
});

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

  it('releases the reset permit after a failed mirror so Continue can recover', async () => {
    h.readMirror.mockRejectedValueOnce(new Error('test balance read failed'));
    expect(await post('new')).toMatchObject({ status: 502 });
    expect(h.hardReset).toHaveBeenCalledOnce();
    expect(h.reanchor).not.toHaveBeenCalled();
    expect(h.managerStart).not.toHaveBeenCalled();
    expect(await post('continue')).toMatchObject({ status: 200, body: { success: true } });
  });
});
