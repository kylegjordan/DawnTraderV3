/**
 * P19-B6 FORCE-TRIP integration test (gate 7: "auto-trip armed AND force-trip-tested —
 * trip + recovery proven"). Drives the real evaluateDailyLossBudgetOnClose with mocked leaf
 * deps simulating active trading + a crossing 24h loss, and asserts the auto-trip fires, latches,
 * alerts on both surfaces, is idempotent, recovers on reset, and is gated off when trading is off.
 * (The LIVE close-driven exercise lands at B7b when active paper turns on — scope §4.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const tripSpy = vi.fn(async () => {});
const isTrippedSpy = vi.fn(async () => false);
const addAlertSpy = vi.fn(async () => ({}));
const createAlertSpy = vi.fn(async () => ({}));
const getSystemContextSpy = vi.fn(async () => ({ isEngineActive: true }));

vi.mock('../../storage', () => ({
  storage: {
    getSystemContext: (...a: any[]) => getSystemContextSpy(...a),
    getGuardrailsV2: vi.fn(async () => ({
      dailyLossKillSwitchPct: '10', dailyLossWarning1Pct: '50', dailyLossWarning2Pct: '75',
    })),
    getClosedTrades: vi.fn(async () => [{ closedAt: new Date(), pnl: '-9999' }]), // ~99% loss
    getTrades: vi.fn(async () => []),
    getAllUsers: vi.fn(async () => [{ id: 'u1', role: 'owner' }]),
  },
}));
vi.mock('../../services/guardrail-policy', () => ({
  guardrailPolicy: {
    isKillSwitchTripped: (...a: any[]) => isTrippedSpy(...a),
    tripKillSwitch: (...a: any[]) => tripSpy(...a),
  },
}));
vi.mock('../../services/guardrail-settings', () => ({ getPortfolioBalanceV2: vi.fn(async () => 10000) }));
vi.mock('../../services/active-execution-engine', () => ({ getEngineSessionStart: vi.fn(() => new Date(Date.now() - 3_600_000)) }));
vi.mock('../../services/system-alerts', () => ({ addAlert: (...a: any[]) => addAlertSpy(...a) }));
vi.mock('../../services/alerts-service', () => ({ AlertsService: { createAlert: (...a: any[]) => createAlertSpy(...a) } }));

import {
  evaluateDailyLossBudgetOnClose,
  resetDailyLossBudgetState,
  peekDailyLossBudgetState,
} from '../../services/daily-loss-budget';

describe('P19-B6 force-trip (gate 7: trip + recovery + idempotency + gating)', () => {
  beforeEach(() => {
    tripSpy.mockClear();
    addAlertSpy.mockClear();
    createAlertSpy.mockClear();
    isTrippedSpy.mockClear();
    isTrippedSpy.mockResolvedValue(false);
    getSystemContextSpy.mockResolvedValue({ isEngineActive: true });
    resetDailyLossBudgetState('paper');
  });

  it('a crossing 24h loss AUTO-TRIPS tripKillSwitch (mode + reason + lossPct + threshold), latches, alerts both surfaces', async () => {
    await evaluateDailyLossBudgetOnClose('paper');
    expect(tripSpy).toHaveBeenCalledTimes(1);
    expect(tripSpy.mock.calls[0][0]).toBe('paper');
    expect(String(tripSpy.mock.calls[0][1])).toContain('DAILY_LOSS_THRESHOLD_EXCEEDED');
    expect(tripSpy.mock.calls[0][3]).toBe(10); // threshold passed through
    expect(peekDailyLossBudgetState('paper')?.killInProgress).toBe(true);
    expect(addAlertSpy).toHaveBeenCalled();   // operational/Discord-alerts surface
    expect(createAlertSpy).toHaveBeenCalled(); // user-facing website banner
  });

  it('idempotent: a second close while the latch is set does NOT re-trip', async () => {
    await evaluateDailyLossBudgetOnClose('paper');
    tripSpy.mockClear();
    await evaluateDailyLossBudgetOnClose('paper');
    expect(tripSpy).not.toHaveBeenCalled();
  });

  it('recovery: resetDailyLossBudgetState clears the latch so a fresh breach trips again', async () => {
    await evaluateDailyLossBudgetOnClose('paper');
    resetDailyLossBudgetState('paper');
    expect(peekDailyLossBudgetState('paper')?.killInProgress).toBe(false);
    tripSpy.mockClear();
    await evaluateDailyLossBudgetOnClose('paper');
    expect(tripSpy).toHaveBeenCalledTimes(1);
  });

  it('gated: with active trading OFF (isEngineActive=false), the evaluator does NOT trip', async () => {
    getSystemContextSpy.mockResolvedValue({ isEngineActive: false });
    tripSpy.mockClear();
    await evaluateDailyLossBudgetOnClose('paper');
    expect(tripSpy).not.toHaveBeenCalled();
  });

  it('already-tripped (DB): if isKillSwitchTripped returns true, the evaluator no-ops', async () => {
    isTrippedSpy.mockResolvedValue(true);
    tripSpy.mockClear();
    await evaluateDailyLossBudgetOnClose('paper');
    expect(tripSpy).not.toHaveBeenCalled();
  });
});
