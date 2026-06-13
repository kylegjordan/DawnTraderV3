/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B3b — Landmine #2: RTB dropped-signal OBSERVABLE counter
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Before B3b, the signal orchestrator built a `SQESignalInput` that never set
 * `riskScore`/`profitRate` (undeclared on the type), so `queueSQESignal` threw on
 * `input.riskScore.toString()` and the orchestrator's fire-and-forget `.catch`
 * swallowed it with a bare `console.error` — every SQE-qualified signal silently
 * dropped once active-paper turns on, with no metric to notice.
 *
 * B3b adds `riskScore`/`profitRate` to the type (populated from extendedMetrics)
 * and routes the catch to `recordQueueFailure`, an OBSERVABLE counter surfaced via
 * `getQueueFailureStats()` (Langston Q3 — catch the next regression of this exact
 * silent-drop shape with a number, not by reading logs). This test guards that
 * observable surface.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';

// Keep the singleton import light — stub the DB + cost-model the same way the
// other RTB unit tests do (B79.0n.RTB precedent), so importing the service does
// not pull a live DB connection.
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));

import { readyToBuyService } from '../../core/rtb/ready_to_buy_service.js';

describe('P19-B3b landmine #2 — RTB dropped-signal observable counter', () => {
  it('increments the failure count and captures the last failure (Error)', () => {
    const before = readyToBuyService.getQueueFailureStats().count;
    readyToBuyService.recordQueueFailure('BTC/USD', 'vwap_pullback', new Error('boom'));
    const after = readyToBuyService.getQueueFailureStats();
    expect(after.count).toBe(before + 1);
    expect(after.last).toMatchObject({ symbol: 'BTC/USD', strategy: 'vwap_pullback', error: 'boom' });
    expect(typeof after.last?.at).toBe('number');
  });

  it('stringifies a non-Error failure value', () => {
    readyToBuyService.recordQueueFailure('ETH/USD', 'breakout', 'plain string fail');
    const stats = readyToBuyService.getQueueFailureStats();
    expect(stats.last?.symbol).toBe('ETH/USD');
    expect(stats.last?.error).toBe('plain string fail');
  });

  it('monotonically accumulates across multiple drops', () => {
    const start = readyToBuyService.getQueueFailureStats().count;
    readyToBuyService.recordQueueFailure('SOL/USD', 'mean_reversion', new Error('a'));
    readyToBuyService.recordQueueFailure('SOL/USD', 'mean_reversion', new Error('b'));
    expect(readyToBuyService.getQueueFailureStats().count).toBe(start + 2);
  });
});
