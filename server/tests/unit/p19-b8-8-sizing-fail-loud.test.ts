/**
 * P19-B8.8 — sizing-fallback fail-loud sweep.
 *
 * The contract under test: a missing/unparseable/non-positive DB-governed sizing
 * input REFUSES the signal (invalidResult → the engine's SIZING_INVALID path) —
 * never a substituted number, never NaN downstream, never a blocked loop. The old
 * behavior silently sized on fabricated inputs ('1.50'/'10.00'/null→100 — the last
 * one UNCAPPING exposure on a failed read).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/system-alerts.js', () => ({
  addAlert: vi.fn(async () => ({ id: 'test-alert' })),
}));

// module-constants: the sizer reads max_position_buffer_factor via the cached-
// required path; seed it so a valid-row control case can size.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: vi.fn(() => 0.97),
}));

import { sizeActivePositionForSignal } from '../../services/active-position-sizing.js';
import { rtbMetricsService } from '../../services/rtb-metrics-service.js';
import { addAlert } from '../../services/system-alerts.js';
import { GoalFeasibilityService } from '../../services/goal-feasibility.js';

const VALID_GUARDRAILS = {
  portfolioRiskPerTradePct: '1.95',
  maxPositionPercentPct: '6.67',
  maxTotalExposurePct: '100.00',
} as any;

const BASE_PARAMS = {
  mode: 'paper' as const,
  portfolioValue: 2250,
  entryPrice: 100,
  stopPrice: 97,
  symbol: 'TEST/USD',
  strategy: 'breakout' as any,
  assetClass: 'crypto_spot' as any,
};

function sizeWith(guardrails: any) {
  return sizeActivePositionForSignal({ ...BASE_PARAMS, guardrails });
}

beforeEach(() => {
  rtbMetricsService.recordSizingGuardrailReadOk(); // reset the rail between tests
  vi.mocked(addAlert).mockClear();
});

describe('P19-B8.8 sizer: refuse-the-signal-loudly, no fallback substitution', () => {
  it('control: a valid guardrails row sizes a position', () => {
    const r = sizeWith(VALID_GUARDRAILS);
    expect(r.quantity).toBeGreaterThan(0);
    expect(r.estimatedValue).toBeGreaterThan(0);
  });

  const FIELDS = ['portfolioRiskPerTradePct', 'maxPositionPercentPct', 'maxTotalExposurePct'] as const;
  const BAD_VALUES: Array<[string, unknown]> = [
    ['missing (undefined)', undefined],
    ['null', null],
    ['unparseable string', 'not-a-number'],
    ['zero', '0.00'],
    ['negative', '-5.00'],
  ];

  for (const field of FIELDS) {
    for (const [label, bad] of BAD_VALUES) {
      it(`${field} ${label} → invalidResult (never a substituted number)`, () => {
        const r = sizeWith({ ...VALID_GUARDRAILS, [field]: bad });
        expect(r.quantity).toBe(0);
        expect(r.estimatedValue).toBe(0);
      });
    }
  }

  it('whole row null → invalidResult (the old null→100 exposure-uncap is gone)', () => {
    const r = sizeWith(null);
    expect(r.quantity).toBe(0);
    expect(r.estimatedValue).toBe(0);
  });
});

describe('P19-B8.8 rail: consecutive-refusal counter + alert latch', () => {
  it('increments per refusal, resets on a successful read', () => {
    sizeWith({ ...VALID_GUARDRAILS, maxTotalExposurePct: null });
    sizeWith({ ...VALID_GUARDRAILS, maxTotalExposurePct: null });
    expect(rtbMetricsService.getSizingReadFailRail().consecutive).toBe(2);

    sizeWith(VALID_GUARDRAILS); // success resets
    expect(rtbMetricsService.getSizingReadFailRail().consecutive).toBe(0);
    expect(rtbMetricsService.getSizingReadFailRail().alerted).toBe(false);
  });

  it('latches ONE system alert at the threshold, not one per refusal', async () => {
    const { threshold } = rtbMetricsService.getSizingReadFailRail();
    for (let i = 0; i < threshold + 5; i++) {
      sizeWith({ ...VALID_GUARDRAILS, portfolioRiskPerTradePct: 'broken' });
    }
    const rail = rtbMetricsService.getSizingReadFailRail();
    expect(rail.consecutive).toBe(threshold + 5);
    expect(rail.alerted).toBe(true);
    await vi.waitFor(() => expect(vi.mocked(addAlert)).toHaveBeenCalledTimes(1));
    const call = vi.mocked(addAlert).mock.calls[0][0];
    expect(call.dedupe_key).toBe('sizing-guardrail-read-fail');
    expect(call.severity).toBe('warning');
  });
});

describe('P19-B8.8 goal-feasibility: unreadable limits BLOCK (never assume 100%)', () => {
  function serviceWith(row: any) {
    const fakeStorage = { getGuardrailsV2: vi.fn(async () => row) } as any;
    return new GoalFeasibilityService(fakeStorage);
  }

  it('unreadable maxTotalExposurePct → BLOCK with the unreadable reason', async () => {
    const svc = serviceWith({ ...VALID_GUARDRAILS, maxTotalExposurePct: undefined });
    const r = await svc.evaluateGoal('u1', 'paper', { targetPerTrade: 10, portfolioBalance: 2250 } as any);
    expect(r.status).toBe('BLOCK');
    expect(r.reason).toContain('unreadable');
    expect(r.reason).toContain('maxTotalExposurePct');
  });

  it('control: readable limits do not hit the unreadable BLOCK', async () => {
    const svc = serviceWith(VALID_GUARDRAILS);
    const r = await svc.evaluateGoal('u1', 'paper', { targetPerTrade: 10, portfolioBalance: 2250 } as any);
    expect(r.reason ?? '').not.toContain('unreadable');
  });
});
