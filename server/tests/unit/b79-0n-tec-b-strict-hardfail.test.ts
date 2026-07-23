/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B79.0n.TEC.b (P19-B1, 2026-06-13) — strict full-key HARD-FAIL regression lock (13 keys as of P19-B8.5i)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * RUNNING_ISSUES #141: the soft `pick(key, TEC_DEFAULTS.x)` fallback in
 * refreshTECConfigForClass was promoted to strict `requireKey` after the 48h
 * verify-gate (passed 2026-05-28) + a 2026-06-13 staging-log grep both
 * measured ZERO fallback fires in production. This suite locks the strict
 * behavior so it can never silently regress to defaults-backfill:
 *
 *   (a) full key rowset → primeTECConfig boots clean
 *   (b) rung_floor_slippage_buffer_multiplier absent → boot REJECTS, the
 *       aggregate error names TEC_MISSING_KEY + the exact key (this was the
 *       key the soft path silently backfilled for weeks — the park-record bug)
 *   (c) a different key absent (moonbag_cap_mode) → also rejects naming it
 *       (strictness is per-key, not special-cased to one key)
 *   (d) the observability scaffolding (getTECPickFallbackStats) is GONE —
 *       its export ceased with the promotion (zero consumers verified)
 *   (e) the FULL_ROWS fixture covers exactly ALL_TEC_KEYS — if a NEW key is
 *       ever added to the snapshot, this fails until the fixture (and every
 *       sibling TEC mock) is updated, which is precisely the B-NEW-40-era
 *       stale-mock failure mode this batch repaired
 *
 * Mock pattern mirrors b-new-40-tec-refresh-hang.test.ts (the 11/11 model
 * fixture identified in the P19-B1 pre-audit).
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Declared before vi.mock so the hoisted factory closes over initialized
// bindings by the time the SUT import resolves (b-new-40 pattern).
const FULL_ROWS: Record<string, unknown> = {
  break_even_enabled: false,
  break_even_trigger_r: 1.0,
  target_lock_r: 1.5,
  trail_distance_atr_multiplier: 1.0,
  rung_floor_slippage_buffer_multiplier: 1.0,
  persistence_debounce_ms: 5000,
  moonbag_qualifying_strategies: ['strong_bull_trend'],
  moonbag_qualifying_source_pools: {},
  moonbag_max_duration_ms: 14_400_000,
  moonbag_cap_mode: 'reserved_slots',
  moonbag_reserved_slots: 1,
  // P19-B8.5i — the two trailing master switches. Seeded here because THIS is the
  // VALID-config fixture; the deliberate missing-key cases are produced by
  // `control.omitKey` below, which is left untouched so (b)/(c) still assert the
  // per-key hard-fail. Seeded FALSE = the shipped default (trailing stays off).
  trailing_enabled_vts: false,
  trailing_enabled_active: false,
};
const control: { omitKey: string | null } = { omitKey: null };

vi.mock('../../services/module-constants-service.js', () => ({
  getModuleConstants: vi.fn(async () => {
    const rows: Record<string, unknown> = { ...FULL_ROWS };
    if (control.omitKey) delete rows[control.omitKey];
    return rows;
  }),
  hasExplicitAssetClassRow: vi.fn(async () => true),
}));

vi.mock('../../storage.js', () => ({
  storage: {
    getActiveOpenPositions: async () => [],
    updateActiveOpenPosition: async () => undefined,
  },
}));

vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0, slippage: 0, spread: 0, takerFee: 0, totalCost: 0 }),
  computeNetBreakeven: (entry: number) => entry,
  computeNetTargetFloor: (target: number) => target,
  computeTotalRoundTripCost: () => 0,
}));

import * as tec from '../../services/trailing-exit-controller.js';

describe('B79.0n.TEC.b — strict full-key HARD-FAIL (#141)', () => {
  beforeEach(() => {
    control.omitKey = null;
    tec._testClearEngineConfigCache();
  });

  it('(a) full key rowset → primeTECConfig boots clean', async () => {
    await expect(tec.primeTECConfig()).resolves.toBeUndefined();
  });

  it('(b) missing rung_floor_slippage_buffer_multiplier → boot rejects naming the key', async () => {
    control.omitKey = 'rung_floor_slippage_buffer_multiplier';
    const err = await tec.primeTECConfig().then(
      () => null,
      (e: Error) => e,
    );
    expect(err).not.toBeNull();
    expect(err!.message).toContain('[TEC_BOOTSTRAP_FAIL]');
    expect(err!.message).toContain('TEC_MISSING_KEY');
    expect(err!.message).toContain('rung_floor_slippage_buffer_multiplier');
  });

  it('(c) strictness is per-key — missing moonbag_cap_mode also rejects naming it', async () => {
    control.omitKey = 'moonbag_cap_mode';
    const err = await tec.primeTECConfig().then(
      () => null,
      (e: Error) => e,
    );
    expect(err).not.toBeNull();
    expect(err!.message).toContain('TEC_MISSING_KEY');
    expect(err!.message).toContain('moonbag_cap_mode');
  });

  it('(d) PICK_FALLBACK scaffolding is gone — no getTECPickFallbackStats export', () => {
    expect((tec as Record<string, unknown>).getTECPickFallbackStats).toBeUndefined();
  });

  it('(e) FULL_ROWS fixture covers exactly ALL_TEC_KEYS (new-key tripwire)', () => {
    expect(Object.keys(FULL_ROWS).sort()).toEqual([...tec.ALL_TEC_KEYS].sort());
  });
});
