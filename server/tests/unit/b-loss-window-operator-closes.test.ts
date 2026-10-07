/**
 * B-LOSS-WINDOW-OPERATOR-CLOSES (row 183b, #1154) — the kill switch's loss window starts no earlier than the last
 * OPERATOR re-anchor, so closes booked against the previous balance (a reset's own flatten, and any loss before it)
 * leave the count. Measured case it closes: 2026-10-06, with no engine session the window fell back to 24 h and carried
 * −$40.96 of pre-reset stop losses against the $820 anchor set after them.
 *
 * (a) the pure window: the latest of the three terms, and NEVER earlier than the old `max(now − 24 h, sessionStart)`.
 * (b) the wiring: the snapshot reads the anchor WITH the operator reasons, and the window it passes to the paper
 *     numerator is that anchor; the live leg filters by the same window.
 * MUTATIONS: drop the rebase term from resolveLossWindowStart → (a)1 fails; read the anchor without `reasons` → (b)1
 * fails (the mock then answers with a later automatic re-anchor).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = 60 * 60 * 1000;
const NOW = Date.now();
const T_OPERATOR = new Date(NOW - 2 * H); // the reset's anchor
const T_AUTO = new Date(NOW - 1 * H);     // a later automatic re-anchor — must NOT move the window

const getRealizedPnlSince = vi.fn(async () => ({ realizedPnl: 0, tradeCount: 0 }));
const getTrades = vi.fn(async () => [] as any[]);
const getLastAnchorAt = vi.fn(async (_mode: string, opts?: { reasons?: readonly string[] }) =>
  opts?.reasons && !opts.reasons.includes('auto_divergence') ? T_OPERATOR : T_AUTO);
let sessionStart: Date | null = null;

vi.mock('../../storage', () => ({
  storage: {
    getGuardrailsV2: vi.fn(async () => ({ dailyLossKillSwitchPct: '15', dailyLossWarning1Pct: '50', dailyLossWarning2Pct: '75' })),
    getRealizedPnlSince: (...a: any[]) => (getRealizedPnlSince as any)(...a),
    getTrades: (...a: any[]) => (getTrades as any)(...a),
  },
}));
vi.mock('../../services/guardrail-settings', () => ({ getPortfolioBalanceV2: vi.fn(async () => 1000) }));
vi.mock('../../services/active-execution-engine', () => ({ getEngineSessionStart: vi.fn(() => sessionStart) }));
vi.mock('../../services/portfolio-anchor-service', () => ({
  getLastAnchorAt: (...a: any[]) => (getLastAnchorAt as any)(...a),
  OPERATOR_REBASE_REASONS: ['start_new', 'measurement_override', 'launch_snap'],
}));

import { resolveLossWindowStart, computeDailyLossVerdict } from '../../services/daily-loss-budget';

describe('(a) resolveLossWindowStart — the latest of now − 24 h, the session start and the last operator re-anchor', () => {
  const day = NOW - 24 * H;
  it('1 — an operator re-anchor later than both moves the window to it', () => {
    expect(resolveLossWindowStart(NOW, new Date(NOW - 5 * H), T_OPERATOR).getTime()).toBe(T_OPERATOR.getTime());
  });
  it('2 — a later session start wins over an earlier re-anchor', () => {
    expect(resolveLossWindowStart(NOW, new Date(NOW - H), T_OPERATOR).getTime()).toBe(NOW - H);
  });
  it('3 — no re-anchor: exactly the old window', () => {
    expect(resolveLossWindowStart(NOW, null, null).getTime()).toBe(day);
    expect(resolveLossWindowStart(NOW, new Date(NOW - 3 * H), null).getTime()).toBe(NOW - 3 * H);
  });
  it('4 — a re-anchor older than 24 h changes nothing', () => {
    expect(resolveLossWindowStart(NOW, null, new Date(NOW - 30 * H)).getTime()).toBe(day);
  });
  it('5 — INVARIANT: over a grid of inputs the window is never EARLIER than the old max(now − 24 h, session)', () => {
    const offsets = [null, 0, 0.5, 6, 23.9, 24, 24.1, 48, 500];
    for (const s of offsets) for (const r of offsets) {
      const session = s === null ? null : new Date(NOW - s * H);
      const rebase = r === null ? null : new Date(NOW - r * H);
      const old = Math.max(day, session ? session.getTime() : -Infinity);
      expect(resolveLossWindowStart(NOW, session, rebase).getTime()).toBeGreaterThanOrEqual(old);
    }
  });
});

describe('(b) the snapshot reads the OPERATOR anchor and windows both legs by it', () => {
  beforeEach(() => {
    sessionStart = null; // the #585 null-session case — the one the measured −$40.96 came through
    getRealizedPnlSince.mockClear();
    getLastAnchorAt.mockClear();
    getTrades.mockReset();
    getTrades.mockResolvedValue([]);
  });

  it('1 — paper: the numerator window is the operator re-anchor, not 24 h and not the later automatic one', async () => {
    await computeDailyLossVerdict('paper');
    expect(getLastAnchorAt).toHaveBeenCalledTimes(1);
    expect(getLastAnchorAt.mock.calls[0][1]?.reasons).toEqual(['start_new', 'measurement_override', 'launch_snap']);
    const [mode, since] = getRealizedPnlSince.mock.calls[0] as unknown as [string, Date];
    expect(mode).toBe('paper');
    expect(since.getTime()).toBe(T_OPERATOR.getTime());
  });

  it('2 — live: a close before the operator re-anchor is outside the window, one after it counts', async () => {
    getTrades.mockResolvedValue([
      { exitTime: new Date(T_OPERATOR.getTime() - 60_000), realizedPL: '-500' },
      { exitTime: new Date(T_OPERATOR.getTime() + 60_000), realizedPL: '-1' },
    ]);
    const v = await computeDailyLossVerdict('live');
    expect(v?.lossPercent).toBeCloseTo(0.1, 6); // −$1 of $1,000; the −$500 before the re-anchor is gone
  });
});
