/**
 * B-ENGINE-HEARTBEAT-DEAD-PATHS (#1158, merged into #521) — one orphan-manager rule (stop, then clear), the
 * heartbeat reduced to a queued backstop, the status contract, the flag-write alerts, and the removals.
 * Record: Claude Comms and Packages/Scope Files/B_ENGINE_HEARTBEAT_DEAD_PATHS_{SCOPE,PRE_AUDIT}.md (§4 r2, §5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const m = vi.hoisted(() => ({
  getSystemContext: vi.fn(),
  getRunningEngineSession: vi.fn(),
  updateSystemContext: vi.fn(),
  updateActiveEngineSession: vi.fn(),
  createActiveEngineSession: vi.fn(),
  getActiveEngineSessionBySessionId: vi.fn(),
  getActiveOpenPositions: vi.fn(),
  getRatioStampInputs: vi.fn(),
  addAlert: vi.fn(),
  managerStart: vi.fn(),
  setEngineActive: vi.fn(),
  busEmit: vi.fn(),
  busPublish: vi.fn(),
  reconcileLog: vi.fn(),
  bus: null as any,
  tss: null as any,
}));
m.bus = { emit: (...a: any[]) => m.busEmit(...a), publish: (...a: any[]) => m.busPublish(...a), on: vi.fn(), off: vi.fn() };
m.tss = {
  broadcastUserUpdate: vi.fn().mockResolvedValue(undefined),
  setEngineActive: (...a: any[]) => m.setEngineActive(...a),
  setTradingMode: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../storage', () => ({
  storage: {
    getSystemContext: (...a: any[]) => m.getSystemContext(...a),
    getRunningEngineSession: (...a: any[]) => m.getRunningEngineSession(...a),
    updateSystemContext: (...a: any[]) => m.updateSystemContext(...a),
    updateActiveEngineSession: (...a: any[]) => m.updateActiveEngineSession(...a),
    createActiveEngineSession: (...a: any[]) => m.createActiveEngineSession(...a),
    getActiveEngineSessionBySessionId: (...a: any[]) => m.getActiveEngineSessionBySessionId(...a),
    getActiveOpenPositions: (...a: any[]) => m.getActiveOpenPositions(...a),
  },
}));
vi.mock('../../services/portfolio-anchor-service.js', () => ({
  getAnchorState: vi.fn(),
  getRatioStampInputs: (...a: any[]) => m.getRatioStampInputs(...a),
}));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: (...a: any[]) => m.addAlert(...a) }));
vi.mock('../../services/active-portfolio-manager.js', () => ({
  ActivePortfolioManager: class { constructor() {} start = m.managerStart; stop = vi.fn().mockResolvedValue(undefined); },
}));
vi.mock('../../services/live-pricing-adapter', () => ({ livePricingAdapter: { setTradingMode: vi.fn() } }));
vi.mock('../../services/live-pricing-adapter.js', () => ({ livePricingAdapter: { setTradingMode: vi.fn() } }));
vi.mock('../../services/cluster-bus.js', () => ({ get clusterBus() { return m.bus; } }));
vi.mock('../../services/cluster-bus', () => ({ get clusterBus() { return m.bus; } }));
vi.mock('../../services/trading-state-sync.js', () => ({ get tradingStateSync() { return m.tss; } }));
vi.mock('../../services/trading-state-sync', () => ({ get tradingStateSync() { return m.tss; } }));
vi.mock('../../services/fx5-24h-window.js', () => ({ reset24hWindow: vi.fn(), resetHourlyScanHistory: vi.fn() }));
vi.mock('../../services/c5-financial-diagnostics.js', () => ({
  c5FinancialDiagnostics: { logBalanceReconciliation: (...a: any[]) => m.reconcileLog(...a) },
}));
vi.mock('../../services/rtb-metrics-service.js', () => ({ rtbMetricsService: { startInvariantCheck: vi.fn(), stopInvariantCheck: vi.fn() } }));
vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', () => ({
  krakenWebSocketAdapter: { startPriceTickHealthLogging: vi.fn(), stopPriceTickHealthLogging: vi.fn() },
}));

import {
  stopAndClearOrphanManager,
  healOrphanManagerQueued,
  getActiveEngineStatus,
  getGlobalActiveEngineManager,
  setGlobalActiveEngineManager,
  clearGlobalActiveEngineManager,
  stopActiveEngine,
  startActiveEngine,
} from '../../services/active-engine-service';
import { activeEngineHeartbeat } from '../../services/active-engine-heartbeat';

const ROW = { id: 'row-1', sessionId: 'paper_X', status: 'running', startedBy: 'manual', startingBalance: '820.00', startedAt: new Date() };
const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  clearGlobalActiveEngineManager('paper');
  clearGlobalActiveEngineManager('live');
  m.updateSystemContext.mockResolvedValue(undefined);
  m.updateActiveEngineSession.mockResolvedValue({});
  m.addAlert.mockResolvedValue(undefined);
  m.managerStart.mockResolvedValue(undefined);
  m.setEngineActive.mockResolvedValue(undefined);
  m.reconcileLog.mockResolvedValue(undefined);
  m.getActiveOpenPositions.mockResolvedValue([]);
  m.getRatioStampInputs.mockResolvedValue(null);
  m.busPublish.mockResolvedValue(undefined);
  m.createActiveEngineSession.mockImplementation(async (s: any) => ({ id: 'row-new', ...s }));
});

describe('one orphan-manager rule — stop, THEN clear (Langston C1, the class not the instance)', () => {
  it('a mapped manager with no running row is stopped before it is cleared', async () => {
    const order: string[] = [];
    const mgr = { stop: vi.fn(async () => { order.push('stop'); expect(getGlobalActiveEngineManager('paper')).toBe(mgr); }) };
    setGlobalActiveEngineManager(mgr, 'paper');
    m.getRunningEngineSession.mockResolvedValue(undefined);
    expect(await stopAndClearOrphanManager('paper', 'test')).toBe(true);
    expect(mgr.stop).toHaveBeenCalledTimes(1);
    expect(getGlobalActiveEngineManager('paper')).toBeNull();
  });
  it('a stop that throws still clears (never leaves a half-dead manager mapped)', async () => {
    const mgr = { stop: vi.fn(async () => { throw new Error('boom'); }) };
    setGlobalActiveEngineManager(mgr, 'paper');
    m.getRunningEngineSession.mockResolvedValue(undefined);
    expect(await stopAndClearOrphanManager('paper', 'test')).toBe(true);
    expect(getGlobalActiveEngineManager('paper')).toBeNull();
  });
  it('a running row means it is not an orphan: no stop, no clear', async () => {
    const mgr = { stop: vi.fn() };
    setGlobalActiveEngineManager(mgr, 'paper');
    m.getRunningEngineSession.mockResolvedValue(ROW);
    expect(await stopAndClearOrphanManager('paper', 'test')).toBe(false);
    expect(mgr.stop).not.toHaveBeenCalled();
    expect(getGlobalActiveEngineManager('paper')).toBe(mgr);
  });
  it('mode-specific: a paper heal never touches a live manager', async () => {
    const live = { stop: vi.fn() };
    setGlobalActiveEngineManager(live, 'live');
    m.getRunningEngineSession.mockResolvedValue(undefined);
    expect(await stopAndClearOrphanManager('paper', 'test')).toBe(false); // no paper manager mapped
    expect(live.stop).not.toHaveBeenCalled();
    expect(getGlobalActiveEngineManager('live')).toBe(live);
    expect(m.getRunningEngineSession).not.toHaveBeenCalledWith('live');
  });
  it('the start path\'s orphan branch now stops before clearing (was: clear only)', async () => {
    const old = { stop: vi.fn().mockResolvedValue(undefined) };
    setGlobalActiveEngineManager(old, 'paper');
    m.getRunningEngineSession.mockResolvedValue(undefined); // no row, a mapped manager
    m.getSystemContext.mockResolvedValue({ isEngineActive: false });
    await startActiveEngine('u1', { startingBalance: 820, skipAutoWatchlist: true });
    expect(old.stop).toHaveBeenCalledTimes(1);
    expect(m.createActiveEngineSession).toHaveBeenCalledTimes(1);
  });
});

describe('the heartbeat is a queued backstop and nothing else', () => {
  it('a cycle heals through the queue: orphan stopped + cleared; no session write, no start, no bus publish', async () => {
    const mgr = { stop: vi.fn().mockResolvedValue(undefined) };
    setGlobalActiveEngineManager(mgr, 'paper');
    m.getRunningEngineSession.mockResolvedValue(undefined);
    await activeEngineHeartbeat.runHeartbeatCheck();
    expect(mgr.stop).toHaveBeenCalledTimes(1);
    expect(getGlobalActiveEngineManager('paper')).toBeNull();
    expect(m.updateActiveEngineSession).not.toHaveBeenCalled();
    expect(m.createActiveEngineSession).not.toHaveBeenCalled();
    expect(m.busPublish).not.toHaveBeenCalled();
  });
  it('two heals in flight at once stop the manager ONCE (queue dedupe on the orphan-heal key)', async () => {
    const mgr = { stop: vi.fn(async () => { await flush(30); }) };
    setGlobalActiveEngineManager(mgr, 'paper');
    m.getRunningEngineSession.mockResolvedValue(undefined);
    await Promise.all([healOrphanManagerQueued(), healOrphanManagerQueued()]);
    expect(mgr.stop).toHaveBeenCalledTimes(1);
  });
});

describe('/status: isRunning means an engine runs (the manager), not that a row exists', () => {
  const cases: Array<[boolean, boolean]> = [[false, false], [true, false], [false, true], [true, true]];
  for (const [row, mgr] of cases) {
    it(`row=${row} manager=${mgr} -> isRunning=${mgr}`, async () => {
      if (mgr) setGlobalActiveEngineManager({ stop: vi.fn() }, 'paper');
      m.getRunningEngineSession.mockResolvedValue(row ? ROW : undefined);
      const s = await getActiveEngineStatus('u1');
      expect(s.isRunning).toBe(mgr);
      expect(s.diagnostics.hasDbSession).toBe(row);
    });
  }
});

describe('the engine flag writes are observable (Langston item 7)', () => {
  it('a failed flag-FALSE write on stop raises the critical stop alert (re-read: the flag still reads ON)', async () => {
    m.getRunningEngineSession.mockResolvedValue(ROW);
    m.getSystemContext.mockResolvedValue({ isEngineActive: true });
    m.setEngineActive.mockRejectedValue(new Error('db down'));
    await stopActiveEngine('u1');
    await flush(10);
    expect(m.addAlert).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: 'engine-stop-flag-write-failed-paper', severity: 'critical', category: 'breakage' }));
  });
  it('a failed flag-TRUE write on start raises the start alert', async () => {
    m.getRunningEngineSession.mockResolvedValue(undefined);
    m.getSystemContext.mockResolvedValue({ isEngineActive: false });
    m.setEngineActive.mockRejectedValue(new Error('db down'));
    await startActiveEngine('u1', { startingBalance: 820, skipAutoWatchlist: true });
    await flush(10);
    expect(m.addAlert).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: 'engine-start-flag-write-failed-paper', category: 'breakage' }));
  });
  // Langston Step-4 r1 BLOCKER: setEngineActive commits the flag and THEN fans out; a rejection after the commit must
  // not claim the flag is wrong. The re-read decides which alert is true.
  it('stop: the promise rejects but the flag re-reads OFF -> the fan-out warning, never the critical flag alert', async () => {
    m.getRunningEngineSession.mockResolvedValue(ROW);
    // commit-then-fan-out: the flag flips to OFF when the write runs, then the broadcast throws
    let flag = true;
    m.getSystemContext.mockImplementation(async () => ({ isEngineActive: flag }));
    m.setEngineActive.mockImplementation(async () => { flag = false; throw new Error('broadcast failed'); });
    await stopActiveEngine('u1');
    await flush(10);
    expect(m.addAlert).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: 'engine-stop-state-fanout-failed-paper', severity: 'warning' }));
    expect(m.addAlert).not.toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: 'engine-stop-flag-write-failed-paper' }));
  });
  it('start: the promise rejects but the flag re-reads ON -> the fan-out warning, never the start flag alert', async () => {
    m.getRunningEngineSession.mockResolvedValue(undefined);
    let flag = false;
    m.getSystemContext.mockImplementation(async () => ({ isEngineActive: flag }));
    m.setEngineActive.mockImplementation(async () => { flag = true; throw new Error('broadcast failed'); });
    await startActiveEngine('u1', { startingBalance: 820, skipAutoWatchlist: true });
    await flush(10);
    expect(m.addAlert).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: 'engine-start-state-fanout-failed-paper', severity: 'warning' }));
    expect(m.addAlert).not.toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: 'engine-start-flag-write-failed-paper' }));
  });
  it('the re-read finds NO system_context row -> the conservative critical form, saying no row was found', async () => {
    m.getRunningEngineSession.mockResolvedValue(ROW);
    m.getSystemContext.mockResolvedValue(undefined);
    m.setEngineActive.mockRejectedValue(new Error('db down'));
    await stopActiveEngine('u1');
    await flush(10);
    expect(m.addAlert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: 'engine-stop-flag-write-failed-paper', severity: 'critical', body: expect.stringContaining('no system_context row'),
    }));
  });
  it('both call sites pass the caller mode, so the re-read and the key follow the write (Langston r2 condition 1)', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'server/services/active-engine-service.ts'), 'utf8');
    expect(src).toMatch(/raiseEngineFlagWriteAlert\('start', err, mode\)/);
    expect(src).toMatch(/raiseEngineFlagWriteAlert\('stop', err, mode\)/);
    expect(src).not.toMatch(/raiseEngineFlagWriteAlert\('(start|stop)', err\)/);
  });
  it('the re-read itself fails -> the conservative critical form, and its body says the flag could not be confirmed', async () => {
    m.getRunningEngineSession.mockResolvedValue(ROW);
    m.getSystemContext.mockRejectedValue(new Error('db gone'));
    m.setEngineActive.mockRejectedValue(new Error('db down'));
    await stopActiveEngine('u1');
    await flush(10);
    expect(m.addAlert).toHaveBeenCalledWith(expect.objectContaining({
      dedupe_key: 'engine-stop-flag-write-failed-paper', severity: 'critical', body: expect.stringContaining('could not be confirmed'),
    }));
  });
});

// ── fences, read at the source ──────────────────────────────────────────────────────────────────────
const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
describe('fences — the removals stay removed', () => {
  it('the harness, its route and the heartbeat\'s dead parts are gone', () => {
    expect(existsSync(join(ROOT, 'server/services/auto_test_harness.ts'))).toBe(false);
    expect(read('server/routes.ts')).not.toMatch(/apiRouter\.post\('\/auto-test\/run'/);
    const hb = read('server/services/active-engine-heartbeat.ts');
    expect(hb).not.toMatch(/async recoverSessions\(|private async checkSession\(|getStatus\(\)\s*:/);
    expect(hb).not.toMatch(/^import .*cluster-bus/m); // code form: it no longer imports the bus at all
    expect(hb).toMatch(/healOrphanManagerQueued\(\)/);
    expect(read('server/index.ts')).not.toMatch(/activeEngineHeartbeat\.recoverSessions\(/);
  });
  it('the unused orphan helper and the bus\'s dead helpers are gone', () => {
    expect(read('server/services/active-engine-service.ts')).not.toMatch(/async function clearStaleBusyFlag\(/);
    const cb = read('server/services/cluster-bus.ts');
    expect(cb).not.toMatch(/async cleanup\(|async getRecentEvents\(/);
  });
  it('the heal is serialized on the queue under its own action', () => {
    expect(read('server/services/active-engine-service.ts')).toMatch(/action: 'orphan-heal'/);
    expect(read('server/utils/operation-queue.ts')).toMatch(/'orphan-heal'/);
  });
  it('cluster_bus_event is on the retention sweep AND its constant is seeded in a registered migration', () => {
    expect(read('server/scripts/b75-retention-sweep.ts')).toMatch(/table: 'cluster_bus_event', timestampColumn: 'created_at', retentionConstantName: 'cluster_bus_event\.hot_retention_days'/);
    const seed = '2026-10-06-b-engine-heartbeat-cluster-bus-retention.sql';
    expect(read(`drizzle/migrations/${seed}`)).toMatch(/'cluster_bus_event\.hot_retention_days', '30'::jsonb/);
    const lines = new Set(read('drizzle/migrations/MANIFEST.txt').split(/\r?\n/).map((l) => l.trim()));
    expect(lines.has(seed)).toBe(true);
    expect(lines.has(seed.replace('.sql', '-rollback.sql'))).toBe(false);
  });
});
