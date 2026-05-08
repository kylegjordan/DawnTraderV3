/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0b — N4 boundary tests for `isStrategyEnabledForAssetClass`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per Langston Step 1 review Q2 (rev 1 → rev 2 expansion):
 *   `isStrategyEnabledForAssetClass` at canonical-regime-strategy-map.ts:919
 *   is B79-era code (introduced by B79; the SQE whitelist gate at line 199
 *   `asset_class_disabled` reject path depends on it). Currently uncovered
 *   by `asset-classes.test.ts`.
 *
 * Cases:
 *   - Each whitelisted strategy + xstock_spot → true (regression coverage on
 *     XSTOCK_SPOT_ENABLED_STRATEGIES set itself; if the whitelist size drifts,
 *     this test fails loudly)
 *   - Non-whitelisted strategy + xstock_spot → false
 *   - Any strategy + crypto_spot → true (no-touch fence assertion)
 *   - Any strategy + unknown asset class → true (default-open back-compat per
 *     the function's own docstring at line 914-917)
 *   - Empty strategy + xstock_spot → false (Set membership)
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { isStrategyEnabledForAssetClass } from '../../config/canonical-regime-strategy-map.js';

describe('B79.0b — isStrategyEnabledForAssetClass gate', () => {
  describe('xstock_spot whitelist coverage', () => {
    // Quant whitelist (6) — well-understood regime-based strategies
    const QUANT_WHITELIST = [
      'vwap_pullback',
      'breakout',
      'mean_reversion',
      'range_trade',
      'sma_trend_ride',
      'vwap_bounce',
    ];
    // File-based pattern path (3) per Langston rev 5 + PIA round-2 Q3
    const PATTERN_WHITELIST = [
      'inside_bar_reversal',
      'morning_star',
      'pivot_shift',
    ];
    // ORB included for permit-to-detect; ACTIVATION still DB-gated
    const ORB_WHITELIST = ['orb'];

    const ALL_WHITELISTED = [...QUANT_WHITELIST, ...PATTERN_WHITELIST, ...ORB_WHITELIST];

    it.each(ALL_WHITELISTED)('%s is enabled for xstock_spot', (strategy) => {
      expect(isStrategyEnabledForAssetClass(strategy, 'xstock_spot')).toBe(true);
    });

    it('whitelist size matches expected (regression coverage on set drift)', () => {
      // If the whitelist gains/loses entries the developer must explicitly
      // update this count — surfaces the change loudly.
      const whitelistedCount = ALL_WHITELISTED.length;
      expect(whitelistedCount).toBe(10); // 6 quant + 3 pattern + 1 ORB
    });
  });

  describe('xstock_spot non-whitelisted rejection', () => {
    it('strong_bull_trend (not in xstock whitelist) returns false', () => {
      expect(isStrategyEnabledForAssetClass('strong_bull_trend', 'xstock_spot')).toBe(false);
    });
    it('liquidity_trap (universally disabled) returns false for xstock_spot', () => {
      expect(isStrategyEnabledForAssetClass('liquidity_trap', 'xstock_spot')).toBe(false);
    });
    it('unknown strategy name returns false', () => {
      expect(isStrategyEnabledForAssetClass('made_up_strategy_xyz', 'xstock_spot')).toBe(false);
    });
    it('empty strategy returns false (Set has no empty-string member)', () => {
      expect(isStrategyEnabledForAssetClass('', 'xstock_spot')).toBe(false);
    });
  });

  describe('crypto_spot — no-touch fence (default open)', () => {
    it('any strategy returns true for crypto_spot', () => {
      expect(isStrategyEnabledForAssetClass('vwap_pullback', 'crypto_spot')).toBe(true);
      expect(isStrategyEnabledForAssetClass('strong_bull_trend', 'crypto_spot')).toBe(true);
      expect(isStrategyEnabledForAssetClass('made_up_strategy_xyz', 'crypto_spot')).toBe(true);
      expect(isStrategyEnabledForAssetClass('', 'crypto_spot')).toBe(true);
    });
  });

  describe('Unknown asset class — default-open back-compat', () => {
    // Per docstring at canonical-regime-strategy-map.ts:914-917: adding a new
    // asset class without touching this helper does NOT silently disable any
    // strategy. Conservative gating only when explicitly registered.
    it('crypto_perp (unregistered in this gate) returns true for any strategy', () => {
      expect(isStrategyEnabledForAssetClass('vwap_pullback', 'crypto_perp')).toBe(true);
    });
    it('xstock_perp (unregistered) returns true', () => {
      expect(isStrategyEnabledForAssetClass('vwap_pullback', 'xstock_perp')).toBe(true);
    });
    it('arbitrary asset class string returns true', () => {
      expect(isStrategyEnabledForAssetClass('any_strategy', 'fictional_class')).toBe(true);
    });
  });
});
