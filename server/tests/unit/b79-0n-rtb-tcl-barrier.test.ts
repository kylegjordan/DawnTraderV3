/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — TCL barrier serializes concurrent promotions (T4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per Langston Step 2 ACK C-9 (5-run determinism check) + JSDoc on
 * checkSignalThresholdLive in tcl_watchdog.ts: TCL stays GLOBAL — counts
 * signals across all asset classes — and per-class promotion ordering inside
 * the barrier is by LOCK ACQUISITION ORDER (deterministic per JS event-loop
 * ordering, first-call-wins).
 *
 * This test verifies:
 *   T4.1 — Concurrent checkSignalThresholdLive() calls for the same mode
 *          do not double-activate TCL (debounce + isActive guards hold).
 *   T4.2 — Global count semantics: live pool count sums rows across ALL
 *          asset classes (crypto + xstock co-mingled).
 *   T4.3 — Five-run determinism: identical seed sequence produces identical
 *          activation outcome 5 times (no stochasticity at the barrier).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
  },
}));

// Global per-class signal store for TCL pool count.
const tableByMode: Record<string, any[]> = {};

vi.mock('../../storage', () => ({
  storage: {
    getRtbSignals: vi.fn(async (filters: any) => {
      const { mode, status } = filters;
      let rows = (tableByMode[mode] ?? []).slice();
      if (status) rows = rows.filter((r) => r.status === status);
      return rows;
    }),
  },
}));

// Stub the data aggregator / pool bus / centralClock / performance monitor.
vi.mock('../../services/central-clock', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
  ClockTick: undefined,
}));
vi.mock('../../services/pool-broadcast', () => ({
  poolBus: { on: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../services/data-aggregator.js', () => ({
  dataAggregator: { capture: vi.fn(async () => undefined) },
}));
vi.mock('../../core/diagnostics/performance_monitor', () => ({
  performanceMonitor: { recordTCLActivation: vi.fn() },
}));

import { tclWatchdog } from '../../core/rtb/tcl_watchdog';
import { eventBus } from '../../lib/event-bus';

function seedQueue(mode: string, perClassCounts: Record<string, number>) {
  const rows: any[] = [];
  for (const [cls, count] of Object.entries(perClassCounts)) {
    for (let i = 0; i < count; i++) {
      rows.push({
        id: `${mode}-${cls}-${i}`,
        mode,
        status: 'active',
        assetClass: cls,
        symbol: `S_${cls}_${i}`,
        strategy: 'fx5',
      });
    }
  }
  tableByMode[mode] = rows;
}

async function resetTclState(mode: string) {
  tclWatchdog.stop(mode as any);
  // stop() does NOT clear lastThresholdCheckMs. Reach into the private state
  // map to nuke the debounce timestamp so concurrent test runs each get a
  // fresh "proceed" window. This is the test-only equivalent of advancing
  // the system clock past the 5s debounce.
  const internalStates = (tclWatchdog as any).states as Map<string, any>;
  if (internalStates && internalStates.has(mode)) {
    const s = internalStates.get(mode);
    s.lastThresholdCheckMs = 0;
    s.isActive = false;
    s.activatedAt = null;
    s.activationReason = null;
  }
  // Drain promotion + activation events.
  eventBus.removeAllListeners('TCL_ACTIVATED');
}

describe('B79.0n.RTB — TCL barrier serializes concurrent promotions (T4)', () => {
  beforeEach(async () => {
    for (const k of Object.keys(tableByMode)) delete tableByMode[k];
    await resetTclState('paper');
    await resetTclState('live');
    process.env.TCL_SIGNAL_THRESHOLD = '15';
  });

  it('T4.1 — concurrent checkSignalThresholdLive calls do NOT double-activate TCL', async () => {
    // Seed 16 signals across 2 classes (> threshold=15).
    seedQueue('paper', { crypto_spot: 10, xstock_perp: 6 });

    let activations = 0;
    eventBus.onTCLActivated(() => { activations += 1; });

    // Fire 5 concurrent threshold checks.
    await Promise.all([
      tclWatchdog.checkSignalThresholdLive('paper' as any),
      tclWatchdog.checkSignalThresholdLive('paper' as any),
      tclWatchdog.checkSignalThresholdLive('paper' as any),
      tclWatchdog.checkSignalThresholdLive('paper' as any),
      tclWatchdog.checkSignalThresholdLive('paper' as any),
    ]);
    // Allow event-bus queue to flush.
    await new Promise((r) => setTimeout(r, 50));

    expect(tclWatchdog.isActive('paper' as any)).toBe(true);
    // Activation events fire once; subsequent calls hit the isActive guard.
    expect(activations).toBe(1);
  });

  it('T4.2 — global count semantics: pool count sums ALL classes', async () => {
    // 8 + 7 = 15 (threshold met by aggregate, not by any single class).
    seedQueue('live', { crypto_spot: 8, xstock_perp: 7 });

    await tclWatchdog.checkSignalThresholdLive('live' as any);
    await new Promise((r) => setTimeout(r, 30));

    expect(tclWatchdog.isActive('live' as any)).toBe(true);
  });

  it('T4.3 — sub-threshold aggregate (sum < 15) does NOT activate', async () => {
    seedQueue('paper', { crypto_spot: 5, xstock_perp: 5, crypto_perp: 4 }); // sum=14

    await tclWatchdog.checkSignalThresholdLive('paper' as any);
    await new Promise((r) => setTimeout(r, 30));

    expect(tclWatchdog.isActive('paper' as any)).toBe(false);
  });

  it('T4.4 — five-run determinism: identical seed → identical activation outcome', async () => {
    // Each "run" uses a separate mode tag so the per-mode debounce state
    // (lastThresholdCheckMs) starts fresh — no need to fake-clock advance
    // 5000ms between runs.
    const outcomes: boolean[] = [];
    const modes = ['paper', 'live'] as const;

    for (let run = 0; run < 5; run++) {
      const mode = modes[run % 2];
      await resetTclState(mode);
      // Recreate a fresh TCL state by stopping then start fresh below.
      tclWatchdog.stop(mode as any);
      seedQueue(mode, { crypto_spot: 10, xstock_perp: 5 }); // sum=15 = threshold

      // Space calls by 6s would be flaky; instead use distinct mode + reset.
      // First call after stop() proceeds because isActive=false and we don't
      // re-check debounce against ancient state — the previous run already
      // set lastThresholdCheckMs but we only test the threshold-met → activates
      // contract, which is governed by the post-debounce currentPoolSize check.
      await tclWatchdog.checkSignalThresholdLive(mode as any);
      await new Promise((r) => setTimeout(r, 20));

      outcomes.push(tclWatchdog.isActive(mode as any));
    }

    // All 5 runs MUST produce the same outcome (true). With the debounce
    // state reset between runs, threshold-met → activation is deterministic.
    expect(outcomes).toEqual([true, true, true, true, true]);
  });
});
