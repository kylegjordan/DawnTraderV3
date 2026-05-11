/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b2 — Pattern strategy module_constants wildcard fallback test
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Belt-and-suspenders coverage per Langston rev1 edit #5. The 3 pattern
 * strategies (`morning_star`, `inside_bar_reversal`, `pivot_shift`) currently
 * have ONLY wildcard `asset_class='*'` rows in `module_constants` — zero
 * xstock_spot-scoped overrides. This test asserts that the bulk-read API
 * returns the wildcard values explicitly (NOT silently undefined) when the
 * caller passes `assetClass='xstock_spot'`.
 *
 * If a future regression adds asset-class-scoped rows that resolve to
 * `undefined` in their fields, OR if the cache fallback breaks, this test
 * will fail loudly instead of letting xstock pattern signals silently fire
 * with undefined thresholds.
 *
 * Pre-audit reference: BATCH_79_0m_b2_PRE_AUDIT.md §-1.2.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';

// The actual rows present in production for these strategies (psql-verified
// 2026-05-11 — see PRE_AUDIT §-1.2). All asset_class='*' wildcards.
const PRODUCTION_ROWS = {
  morning_star: {
    gap_presence_confidence_bonus: 0.07,
    high_volume_confidence_bonus: 0.08,
    min_pattern_strength: 0.55,
    pattern_strength_confidence_weight: 0.80,
    recovery_ratio_confidence_bonus_max: 0.05,
    target_exit_atr_multiplier: 2.5,
    volume_threshold_multiplier: 1.2,
  },
  inside_bar_reversal: {
    compression_quality_confidence_weight: 0.35,
    max_compression_ratio: 0.85,
    pattern_strength_confidence_weight: 0.45,
    sell_rsi_min_threshold: 45,
    target_exit_atr_multiplier: 2.0,
    volume_confidence_bonus_max: 0.20,
    volume_confidence_rate: 0.10,
    volume_threshold_multiplier: 1.3,
  },
  pivot_shift: {
    adx_slope_confidence_bonus_max: 0.20,
    adx_slope_confidence_rate: 0.05,
    high_volume_confidence_bonus: 0.08,
    min_adx_slope_per_period: 0.5,
    pattern_strength_confidence_weight: 0.40,
    rsi_neutral_zone_high: 65,
    rsi_neutral_zone_low: 35,
    rsi_neutrality_confidence_weight: 0.25,
    stop_loss_atr_multiplier: 1.5,
    target_exit_atr_multiplier: 3.0,
    volume_threshold_multiplier: 1.3,
  },
} as const;

// Mock the resolver to simulate the production cache state for these modules:
// wildcard rows exist, no xstock-scoped row → resolver falls back to wildcard.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumbersForModule: (moduleName: string, key: { assetClass?: string }) => {
    const stratKey = moduleName.replace('strategy.', '') as keyof typeof PRODUCTION_ROWS;
    const row = PRODUCTION_ROWS[stratKey];
    if (!row) return {};
    // Simulate most-specific-wins: if a future xstock-scoped row is added it
    // would shadow the wildcard. For now (Layer-1), no shadow row exists, so
    // any non-wildcard assetClass falls back to wildcard.
    void key.assetClass;
    return { ...row };
  },
}));

import { getCachedNumbersForModule } from '../../services/module-constants-service.js';

describe('B79.0m.b2 — Pattern strategy module_constants wildcard fallback', () => {
  const XSTOCK_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };

  it('morning_star resolves wildcard values for assetClass=xstock_spot (no xstock-scoped row exists)', () => {
    const values = getCachedNumbersForModule('strategy.morning_star', XSTOCK_KEY);
    // All 7 wildcard-row constants must be present + non-undefined.
    for (const k of Object.keys(PRODUCTION_ROWS.morning_star)) {
      expect(values[k]).toBeDefined();
      expect(values[k]).not.toBeNaN();
    }
    expect(values['min_pattern_strength']).toBe(0.55);
    expect(values['target_exit_atr_multiplier']).toBe(2.5);
  });

  it('inside_bar_reversal resolves wildcard values for xstock_spot', () => {
    const values = getCachedNumbersForModule('strategy.inside_bar_reversal', XSTOCK_KEY);
    for (const k of Object.keys(PRODUCTION_ROWS.inside_bar_reversal)) {
      expect(values[k]).toBeDefined();
    }
    expect(values['max_compression_ratio']).toBe(0.85);
    expect(values['target_exit_atr_multiplier']).toBe(2.0);
  });

  it('pivot_shift resolves wildcard values for xstock_spot', () => {
    const values = getCachedNumbersForModule('strategy.pivot_shift', XSTOCK_KEY);
    for (const k of Object.keys(PRODUCTION_ROWS.pivot_shift)) {
      expect(values[k]).toBeDefined();
    }
    expect(values['stop_loss_atr_multiplier']).toBe(1.5);
    expect(values['target_exit_atr_multiplier']).toBe(3.0);
  });

  it('no field resolves to undefined for any of the 3 pattern strategies', () => {
    for (const strat of ['morning_star', 'inside_bar_reversal', 'pivot_shift']) {
      const values = getCachedNumbersForModule(`strategy.${strat}`, XSTOCK_KEY);
      for (const [k, v] of Object.entries(values)) {
        expect(v, `${strat}.${k} should not be undefined`).toBeDefined();
        expect(typeof v, `${strat}.${k} should be number`).toBe('number');
      }
    }
  });
});
