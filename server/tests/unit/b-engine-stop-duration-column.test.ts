/**
 * B-ENGINE-STOP-DURATION-COLUMN (#1067) — the engine stop no longer writes an elapsed duration into the
 * (now dropped) time-limit column, its teardown is not hostage to the session write, and the start path
 * closes a leftover `running` row instead of adopting it when the engine flag is off.
 * Record: Claude Comms and Packages/Scope Files/B_ENGINE_STOP_DURATION_COLUMN_SCOPE.md +
 * B_ENGINE_STOP_DURATION_COLUMN_PRE_AUDIT.md (§2 plan, §4 Langston Step-2 conditions).
 * Payload-based (Langston C3): a mocked storage enforces no integer range, so the proofs assert on the
 * object handed to updateActiveEngineSession, never on an overflow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const m = vi.hoisted(() => ({
  getSystemContext: vi.fn(),
  getRunningEngineSession: vi.fn(),
  updateSystemContext: vi.fn(),
  updateActiveEngineSession: vi.fn(),
  createActiveEngineSession: vi.fn(),
  getActiveEngineSessionBySessionId: vi.fn(),
  getActiveOpenPositions: vi.fn(),
  getAnchorState: vi.fn(),
  getRatioStampInputs: vi.fn(),
  addAlert: vi.fn(),
  managerCtor: vi.fn(),
  managerStart: vi.fn(),
  setEngineActive: vi.fn(),
  reset24h: vi.fn(),
  resetHourly: vi.fn(),
  busEmit: vi.fn(),
  reconcileLog: vi.fn(),
}));

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
  getAnchorState: (...a: any[]) => m.getAnchorState(...a),
  getRatioStampInputs: (...a: any[]) => m.getRatioStampInputs(...a),
}));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: (...a: any[]) => m.addAlert(...a) }));
vi.mock('../../services/active-portfolio-manager.js', () => ({
  ActivePortfolioManager: class {
    constructor(...a: any[]) { m.managerCtor(...a); }
    start = m.managerStart;
  },
}));
vi.mock('../../services/live-pricing-adapter', () => ({ livePricingAdapter: { setTradingMode: vi.fn() } }));
vi.mock('../../services/live-pricing-adapter.js', () => ({ livePricingAdapter: { setTradingMode: vi.fn() } }));
vi.mock('../../services/cluster-bus.js', () => ({ clusterBus: { emit: (...a: any[]) => m.busEmit(...a), on: vi.fn(), off: vi.fn() } }));
vi.mock('../../services/cluster-bus', () => ({ clusterBus: { emit: (...a: any[]) => m.busEmit(...a), on: vi.fn(), off: vi.fn() } }));
vi.mock('../../services/trading-state-sync.js', () => ({
  tradingStateSync: { broadcastUserUpdate: vi.fn().mockResolvedValue(undefined), setEngineActive: (...a: any[]) => m.setEngineActive(...a) },
}));
vi.mock('../../services/trading-state-sync', () => ({
  tradingStateSync: { broadcastUserUpdate: vi.fn().mockResolvedValue(undefined), setEngineActive: (...a: any[]) => m.setEngineActive(...a) },
}));
vi.mock('../../services/fx5-24h-window.js', () => ({
  reset24hWindow: (...a: any[]) => m.reset24h(...a),
  resetHourlyScanHistory: (...a: any[]) => m.resetHourly(...a),
}));
vi.mock('../../services/c5-financial-diagnostics.js', () => ({
  c5FinancialDiagnostics: { logBalanceReconciliation: (...a: any[]) => m.reconcileLog(...a) },
}));
vi.mock('../../services/rtb-metrics-service.js', () => ({ rtbMetricsService: { startInvariantCheck: vi.fn(), stopInvariantCheck: vi.fn() } }));
vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', () => ({
  krakenWebSocketAdapter: { startPriceTickHealthLogging: vi.fn(), stopPriceTickHealthLogging: vi.fn() },
}));

import {
  stopActiveEngine,
  startActiveEngine,
  resumeActiveEngines,
  clearGlobalActiveEngineManager,
} from '../../services/active-engine-service';

const DAY = 86_400_000;
const OLD_ROW = { id: 'row-uuid-old', sessionId: 'paper_OLD', status: 'running', startedBy: 'manual', startingBalance: '2250.00' };

beforeEach(() => {
  vi.clearAllMocks();
  clearGlobalActiveEngineManager('paper');
  m.updateSystemContext.mockResolvedValue(undefined);
  m.updateActiveEngineSession.mockResolvedValue({});
  m.addAlert.mockResolvedValue(undefined);
  m.managerStart.mockResolvedValue(undefined);
  m.setEngineActive.mockResolvedValue(undefined);
  m.reconcileLog.mockResolvedValue(undefined);
  m.getActiveOpenPositions.mockResolvedValue([]);
  m.getRatioStampInputs.mockResolvedValue(null);
  m.createActiveEngineSession.mockImplementation(async (s: any) => ({ id: 'row-uuid-new', ...s }));
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('objective 1 — the stop writes status + stoppedAt and NO duration key (C3: on the payload)', () => {
  it('a session started 30 days ago stops cleanly; the payload carries no runForMs', async () => {
    m.getRunningEngineSession.mockResolvedValue({ ...OLD_ROW, startedAt: new Date(Date.now() - 30 * DAY) });
    const res = await stopActiveEngine('u1');
    expect(res.success).toBe(true);
    const stopCalls = m.updateActiveEngineSession.mock.calls.filter((c) => c[1]?.status === 'stopped');
    expect(stopCalls).toHaveLength(1);
    const [rowId, payload] = stopCalls[0];
    expect(rowId).toBe('row-uuid-old');
    expect(Object.keys(payload).sort()).toEqual(['status', 'stoppedAt']);
    expect(payload).not.toHaveProperty('runForMs');
    expect(payload.stoppedAt).toBeInstanceOf(Date);
  });
});

describe('objective 2 — the resume-refused path likewise writes no duration', () => {
  it('a refused 40-day-old session ends stopped with only status + stoppedAt', async () => {
    m.getSystemContext.mockResolvedValue({ isEngineActive: true });
    m.getRunningEngineSession.mockResolvedValue({ ...OLD_ROW, startedAt: new Date(Date.now() - 40 * DAY) });
    m.getAnchorState.mockResolvedValue(null); // no trustworthy balance -> refused
    await resumeActiveEngines();
    const stopCalls = m.updateActiveEngineSession.mock.calls.filter((c) => c[1]?.status === 'stopped');
    expect(stopCalls).toHaveLength(1);
    expect(Object.keys(stopCalls[0][1]).sort()).toEqual(['status', 'stoppedAt']);
  });
});

describe('objective 3 — a failed session write no longer skips the teardown (C1 list, C2 contract)', () => {
  it('teardown runs to the end, the engine flag is cleared, the stop fails loudly with an alert', async () => {
    m.getRunningEngineSession.mockResolvedValue({ ...OLD_ROW, startedAt: new Date(Date.now() - 2 * DAY) });
    m.updateActiveEngineSession.mockRejectedValueOnce(new Error('value out of range for type integer'));
    const res = await stopActiveEngine('u1');
    await flush();
    // fails loudly, naming the session write
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/session write failed/);
    expect(res.data?.sessionWriteFailed).toBe(true);
    // every post-write step still ran
    expect(m.reset24h).toHaveBeenCalledWith('paper');
    expect(m.resetHourly).toHaveBeenCalledWith('paper');
    expect(m.busEmit).toHaveBeenCalledWith('active_engine_stopped', expect.objectContaining({ sessionId: 'paper_OLD' }));
    expect(m.reconcileLog).toHaveBeenCalledWith('paper', 'stop_reset');
    expect(m.setEngineActive).toHaveBeenCalledWith('u1', false, 'paper');
    // one breakage alert naming the session
    expect(m.addAlert).toHaveBeenCalledTimes(1);
    expect(m.addAlert.mock.calls[0][0]).toMatchObject({ category: 'breakage', dedupe_key: 'engine-stop-session-write-failed-paper', metadata: { sessionId: 'paper_OLD' } });
  });
});

describe('plan item 4 — the start path closes a leftover running row when the engine flag is off', () => {
  it('flag false: the leftover row is closed and a NEW session is created with the CALLER\'s balance', async () => {
    m.getSystemContext.mockResolvedValue({ isEngineActive: false });
    m.getRunningEngineSession.mockResolvedValue({ ...OLD_ROW, startedAt: new Date(Date.now() - 82 * DAY) });
    await startActiveEngine('u1', { startingBalance: 820, skipAutoWatchlist: true });
    const closeCalls = m.updateActiveEngineSession.mock.calls.filter((c) => c[0] === 'row-uuid-old' && c[1]?.status === 'stopped');
    expect(closeCalls).toHaveLength(1);
    expect(Object.keys(closeCalls[0][1]).sort()).toEqual(['status', 'stoppedAt']);
    expect(m.createActiveEngineSession).toHaveBeenCalledTimes(1);
    const created = m.createActiveEngineSession.mock.calls[0][0];
    expect(created.sessionId).not.toBe('paper_OLD');
    expect(created.startingBalance).toBe('820'); // the caller's, not the old row's 2250.00
    expect(created).not.toHaveProperty('runForMs');
    expect(created).not.toHaveProperty('endsAt');
  });

  it('flag true: the row is reconciled exactly as before (no close, no new session)', async () => {
    m.getSystemContext.mockResolvedValue({ isEngineActive: true });
    m.getRunningEngineSession.mockResolvedValue({ ...OLD_ROW, startedAt: new Date(Date.now() - 1 * DAY) });
    const res = await startActiveEngine('u1', { startingBalance: 820, skipAutoWatchlist: true });
    expect(res.data?.wasReconciled).toBe(true);
    expect(m.createActiveEngineSession).not.toHaveBeenCalled();
    expect(m.updateActiveEngineSession.mock.calls.filter((c) => c[1]?.status === 'stopped')).toHaveLength(0);
    expect(m.managerStart).toHaveBeenCalledWith('api');
  });

  it('a leftover row that cannot be closed refuses the start (never two running rows) and alerts', async () => {
    m.getSystemContext.mockResolvedValue({ isEngineActive: false });
    m.getRunningEngineSession.mockResolvedValue({ ...OLD_ROW, startedAt: new Date(Date.now() - 3 * DAY) });
    m.updateActiveEngineSession.mockRejectedValue(new Error('db down'));
    const res = await startActiveEngine('u1', { startingBalance: 820, skipAutoWatchlist: true });
    expect(res.success).toBe(false);
    expect(m.createActiveEngineSession).not.toHaveBeenCalled();
    expect(m.addAlert).toHaveBeenCalledWith(expect.objectContaining({ dedupe_key: 'engine-start-leftover-row-unclosable-paper' }));
  });
});

// ── (e) census fence: the dropped columns have no code reader or writer left ──────────────────────
const ROOT = join(__dirname, '..', '..', '..');
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === 'tests' || n === '__tests__' || n === 'node_modules' || n === 'dist') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
describe('fence (e) — run_for_ms / ends_at have no code use left (tests exempt, Langston nit)', () => {
  it('no field access, property key or column-name literal in server/, shared/ or client/', () => {
    // CODE forms only — comments naming the removed fields are allowed.
    const CODE = /\brunForMs\s*[:?]|\.runForMs\b|["']run_for_ms["']|\bendsAt\s*[:?]|\.endsAt\b|["']ends_at["']/;
    const files = ['server', 'shared', 'client'].flatMap((d) => walk(join(ROOT, d)));
    expect(files.length, 'positive control: the walk reached source files').toBeGreaterThan(100);
    const hits = files.filter((p) => CODE.test(readFileSync(p, 'utf8'))).map((p) => relative(ROOT, p).split(sep).join('/'));
    expect(hits).toEqual([]);
  });
  it('the drop migration is registered; its rollback is not', () => {
    const lines = new Set(readFileSync(join(ROOT, 'drizzle/migrations/MANIFEST.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()));
    expect(lines.has('2026-10-06-b-engine-stop-drop-time-limit-columns.sql')).toBe(true);
    expect(lines.has('2026-10-06-b-engine-stop-drop-time-limit-columns-rollback.sql')).toBe(false);
  });
});
