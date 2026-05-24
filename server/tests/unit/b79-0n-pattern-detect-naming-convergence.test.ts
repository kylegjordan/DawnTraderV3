/**
 * B79.0n.PATTERN-DETECT — DB naming-convergence regression-lock test.
 *
 * Locks the expected post-migration shape of `module_constants.pattern_pool_
 * gates.xstock_spot.*`:
 *   - pattern_final_score_min  = 0.45    (renamed from final_score_floor)
 *   - pattern_max_position_pct = 0.50    (renamed from max_position_pct)
 *   - pattern_rsi_min          = 15      (NEW seed, crypto default clone)
 *   - pattern_rsi_max          = 85      (NEW seed, crypto default clone)
 *
 * AND locks the expected shape of `xstock_spot/pattern-pool-filters.ts`
 * getters reading those rows.
 *
 * If a future commit reverts the migration OR breaks the resolver path,
 * this test fails. Catches both directions of drift.
 *
 * Strategy: vitest can't reach the live Supabase DB at unit-test time
 * (CI runs against a fresh in-memory mock, not the production seeded DB).
 * So this test uses vitest's module mocking to STUB
 * `getCachedNumberRequired` and verify that the getters call it with the
 * expected key shape. The actual DB row values are exercised by the staging
 * Step 7 psql verification, not by unit tests.
 *
 * This split is the same pattern STRATEGY used for
 * `b79-0n-strategy-se-key-factory.test.ts` — type-shape + key-shape locked
 * at unit-test time; runtime values verified at staging.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the module-constants-service before importing the consumer file.
// This intercepts the getter resolver calls so we can assert the key shape.
const mockGetCachedNumberRequired = vi.fn();
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (...args: any[]) => mockGetCachedNumberRequired(...args),
}));

describe('B79.0n.PATTERN-DETECT — DB naming-convergence (getter key shape)', () => {

  beforeEach(() => {
    mockGetCachedNumberRequired.mockReset();
  });

  describe('xstock_spot/pattern-pool-filters.ts XSTOCK_PATTERN_POOL_GUARDRAILS', () => {
    it('FINAL_SCORE_FLOOR reads pattern_final_score_min @ xstock_spot scope', async () => {
      mockGetCachedNumberRequired.mockReturnValueOnce(0.45);
      const { XSTOCK_PATTERN_POOL_GUARDRAILS } = await import(
        '../../asset_classes/xstock_spot/pattern-pool-filters'
      );

      const value = XSTOCK_PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR;

      expect(value).toBe(0.45);
      expect(mockGetCachedNumberRequired).toHaveBeenCalledWith(
        'pattern_pool_gates',
        'pattern_final_score_min',
        { exchange: '*', assetClass: 'xstock_spot', strategy: 'pattern', regime: '*' },
      );
    });

    it('MAX_POSITION_PCT reads pattern_max_position_pct @ xstock_spot scope', async () => {
      mockGetCachedNumberRequired.mockReturnValueOnce(0.50);
      const { XSTOCK_PATTERN_POOL_GUARDRAILS } = await import(
        '../../asset_classes/xstock_spot/pattern-pool-filters'
      );

      const value = XSTOCK_PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT;

      expect(value).toBe(0.50);
      expect(mockGetCachedNumberRequired).toHaveBeenCalledWith(
        'pattern_pool_gates',
        'pattern_max_position_pct',
        { exchange: '*', assetClass: 'xstock_spot', strategy: 'pattern', regime: '*' },
      );
    });
  });

  describe('xstock_spot/pattern-pool-filters.ts XSTOCK_PATTERN_POOL_THRESHOLDS', () => {
    it('RSI_MIN reads pattern_rsi_min @ xstock_spot scope', async () => {
      mockGetCachedNumberRequired.mockReturnValueOnce(15);
      const { XSTOCK_PATTERN_POOL_THRESHOLDS } = await import(
        '../../asset_classes/xstock_spot/pattern-pool-filters'
      );

      const value = XSTOCK_PATTERN_POOL_THRESHOLDS.RSI_MIN;

      expect(value).toBe(15);
      expect(mockGetCachedNumberRequired).toHaveBeenCalledWith(
        'pattern_pool_gates',
        'pattern_rsi_min',
        { exchange: '*', assetClass: 'xstock_spot', strategy: 'pattern', regime: '*' },
      );
    });

    it('RSI_MAX reads pattern_rsi_max @ xstock_spot scope', async () => {
      mockGetCachedNumberRequired.mockReturnValueOnce(85);
      const { XSTOCK_PATTERN_POOL_THRESHOLDS } = await import(
        '../../asset_classes/xstock_spot/pattern-pool-filters'
      );

      const value = XSTOCK_PATTERN_POOL_THRESHOLDS.RSI_MAX;

      expect(value).toBe(85);
      expect(mockGetCachedNumberRequired).toHaveBeenCalledWith(
        'pattern_pool_gates',
        'pattern_rsi_max',
        { exchange: '*', assetClass: 'xstock_spot', strategy: 'pattern', regime: '*' },
      );
    });
  });

  describe('crypto_spot/pattern-pool-filters.ts PATTERN_POOL_GUARDRAILS (regression lock)', () => {
    it('FINAL_SCORE_FLOOR still reads pattern_final_score_min @ crypto_spot scope (byte-identical)', async () => {
      mockGetCachedNumberRequired.mockReturnValueOnce(0.45);
      const { PATTERN_POOL_GUARDRAILS } = await import(
        '../../asset_classes/crypto_spot/pattern-pool-filters'
      );

      const value = PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR;

      expect(value).toBe(0.45);
      expect(mockGetCachedNumberRequired).toHaveBeenCalledWith(
        'pattern_pool_gates',
        'pattern_final_score_min',
        { exchange: '*', assetClass: 'crypto_spot', strategy: 'pattern', regime: '*' },
      );
    });
  });

  describe('Legacy deprecated shim const exports (Phase 16 register #136 (u))', () => {
    it('XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR remains 0.45 (back-compat)', async () => {
      const { XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR } = await import(
        '../../asset_classes/xstock_spot/pattern-pool-filters'
      );
      expect(XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR).toBe(0.45);
    });

    it('XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT remains 0.50 (back-compat)', async () => {
      const { XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT } = await import(
        '../../asset_classes/xstock_spot/pattern-pool-filters'
      );
      expect(XSTOCK_SPOT_PATTERN_MAX_POSITION_PCT).toBe(0.50);
    });

    it('XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS frozen object preserves shape', async () => {
      const { XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS } = await import(
        '../../asset_classes/xstock_spot/pattern-pool-filters'
      );
      expect(XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS).toEqual({
        finalScoreFloor: 0.45,
        maxPositionPct: 0.50,
      });
      expect(Object.isFrozen(XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS)).toBe(true);
    });
  });
});
