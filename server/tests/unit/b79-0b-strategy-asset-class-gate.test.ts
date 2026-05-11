/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0b — boundary tests for `isStrategyEnabledForAssetClass`
 * B79.0m.a — REWRITTEN for DB-authoritative gating (code constant deleted).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per Langston Step 1 R1 (B79.0m parent scope): `XSTOCK_SPOT_ENABLED_STRATEGIES`
 * code constant DELETED. `isStrategyEnabledForAssetClass` now reads from
 * `module_constants.strategy_gates.<assetClass>.<strategy>.enabled` via the
 * synchronous `getCachedConstant` resolver. DB seed migration
 * 2026-05-11-b79-0m-a-xstock-strategy-gates-seeds.sql provides the 19
 * explicit rows for xstock_spot (10 enabled, 9 disabled).
 *
 * These tests mock the module-constants-service cache to verify the gating
 * helper's logic in isolation from real DB state.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCache = new Map<string, boolean | undefined>();

vi.mock('../../services/module-constants-service.js', () => ({
  getCachedConstant: vi.fn(
    (moduleName: string, constantName: string, key: { assetClass: string; strategy: string }) => {
      if (moduleName !== 'strategy_gates' || constantName !== 'enabled') return undefined;
      const k = `${key.assetClass}::${key.strategy}`;
      return mockCache.get(k);
    },
  ),
}));

import { isStrategyEnabledForAssetClass } from '../../config/canonical-regime-strategy-map.js';

const ENABLED_FOR_XSTOCK = [
  'vwap_pullback',
  'breakout',
  'mean_reversion',
  'range_trade',
  'sma_trend_ride',
  'vwap_bounce',
  'inside_bar_reversal',
  'morning_star',
  'pivot_shift',
  'orb',
];

const DISABLED_FOR_XSTOCK = [
  'strong_bull_trend',
  'abcd_long',
  'dhma',
  'liquidity_trap',
  'volatility_edge',
  'defensive_hedge',
  'reverse_impulse',
  'support_bounce',
  'adaptive_flow',
];

describe('B79.0m.a — isStrategyEnabledForAssetClass (DB-authoritative)', () => {
  beforeEach(() => {
    mockCache.clear();
    // Seed mock cache to mirror the migration row set.
    for (const s of ENABLED_FOR_XSTOCK) mockCache.set(`xstock_spot::${s}`, true);
    for (const s of DISABLED_FOR_XSTOCK) mockCache.set(`xstock_spot::${s}`, false);
  });

  describe('xstock_spot enabled set (10 strategies — 6 quant + 3 pattern + 1 orb)', () => {
    it.each(ENABLED_FOR_XSTOCK)('%s is enabled for xstock_spot via DB row', (strategy) => {
      expect(isStrategyEnabledForAssetClass(strategy, 'xstock_spot')).toBe(true);
    });

    it('enabled-set size is exactly 10 (regression-lock on B79.0m.a migration row count)', () => {
      expect(ENABLED_FOR_XSTOCK.length).toBe(10);
    });
  });

  describe('xstock_spot disabled set (9 strategies — explicit enabled=false rows)', () => {
    it.each(DISABLED_FOR_XSTOCK)('%s is disabled for xstock_spot via DB row', (strategy) => {
      expect(isStrategyEnabledForAssetClass(strategy, 'xstock_spot')).toBe(false);
    });

    it('disabled-set size is exactly 9 (regression-lock; 19 total xstock strategy rows)', () => {
      expect(DISABLED_FOR_XSTOCK.length).toBe(9);
    });
  });

  describe('crypto_spot — no-touch fence (no rows → default-open)', () => {
    // crypto_spot has zero strategy_gates rows; helper returns true for any strategy.
    it.each([
      'vwap_pullback',
      'strong_bull_trend',
      'liquidity_trap',
      'made_up_strategy_xyz',
      '',
    ])('returns true for crypto_spot/%s (no DB row → default-open)', (strategy) => {
      expect(isStrategyEnabledForAssetClass(strategy, 'crypto_spot')).toBe(true);
    });
  });

  describe('Unknown asset class — default-open back-compat', () => {
    it.each(['crypto_perp', 'xstock_perp', 'fictional_class'])(
      'returns true for %s/any_strategy (no DB row → default-open)',
      (assetClass) => {
        expect(isStrategyEnabledForAssetClass('vwap_pullback', assetClass)).toBe(true);
      },
    );
  });

  describe('Unknown strategy on xstock_spot returns true (no row → default-open)', () => {
    // Per B79.0m.a R1: default-open semantic preserved when no explicit row.
    // Unknown strategy names are NOT denied by the gate — separate concern from
    // strategy registry validity, which is enforced elsewhere.
    it('made_up_strategy_xyz on xstock_spot returns true (no DB row)', () => {
      expect(isStrategyEnabledForAssetClass('made_up_strategy_xyz', 'xstock_spot')).toBe(true);
    });
  });
});
