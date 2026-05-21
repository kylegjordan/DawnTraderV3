/**
 * B79.0n.STORAGE — SQE per-asset-class routing + cache-isolation regression lock
 * (2026-05-21)
 *
 * Locks the SQE production bug fix: the `signalQualityEvaluator.getThresholds`
 * cache key was previously `${mode}` only, so a crypto cycle warming the cache
 * could leak crypto thresholds to a later xStock cycle (and vice versa). The
 * fix extends the cache key to `${mode}:${assetClass}` so the two classes are
 * fully isolated.
 *
 * Per Langston Step 2 RE-ACK item 4 ("Cache-isolation test — baked in"):
 * "warm cachedThresholds with paper:crypto_spot, then read paper:xstock_spot,
 *  assert the second read does NOT return the crypto entry."
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage module BEFORE importing signal_quality_evaluator so the
// SQE module's `import { storage }` picks up the mock.
const mockGetScreenerFilters = vi.fn();
vi.mock('../../storage.js', () => ({
  storage: {
    getScreenerFilters: mockGetScreenerFilters,
  },
}));

// Also mock module-constants-service so the Layer 2 fallback path doesn't
// throw on cold cache during the test.
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (module: string, name: string) => {
    if (name === 'min_final_score') return 0.35;
    if (name === 'min_regime_weight') return 0.30;
    throw new Error(`unexpected: ${module}.${name}`);
  },
}));

describe('[B79.0n.STORAGE] SQE per-asset-class routing + cache isolation', () => {
  beforeEach(() => {
    mockGetScreenerFilters.mockReset();
  });

  it('routes crypto_spot SQE call to crypto_spot screener_filters row', async () => {
    mockGetScreenerFilters.mockResolvedValueOnce({
      finalScoreMin: '0.40', regimeWeightMin: '0.30',
    });
    const { getSQEThresholdsFromConfig } = await import('../../core/filters/signal_quality_evaluator');

    const result = await getSQEThresholdsFromConfig('paper', 'crypto_spot');

    expect(mockGetScreenerFilters).toHaveBeenCalledWith({ mode: 'paper', assetClass: 'crypto_spot' });
    expect(result.finalScoreMin).toBeCloseTo(0.40, 2);
  });

  it('routes xstock_spot SQE call to xstock_spot screener_filters row', async () => {
    mockGetScreenerFilters.mockResolvedValueOnce({
      finalScoreMin: '0.55', regimeWeightMin: '0.40',
    });
    const { getSQEThresholdsFromConfig } = await import('../../core/filters/signal_quality_evaluator');

    const result = await getSQEThresholdsFromConfig('paper', 'xstock_spot');

    expect(mockGetScreenerFilters).toHaveBeenCalledWith({ mode: 'paper', assetClass: 'xstock_spot' });
    expect(result.finalScoreMin).toBeCloseTo(0.55, 2);
  });

  it('CACHE ISOLATION — paper:crypto_spot cached value MUST NOT leak to paper:xstock_spot read', async () => {
    // Sequence: warm cache with crypto, then read xStock. The mock returns
    // distinct values per call so any leakage shows up as the xStock read
    // returning crypto's 0.40 instead of xStock's 0.55.
    mockGetScreenerFilters
      .mockResolvedValueOnce({ finalScoreMin: '0.40', regimeWeightMin: '0.30' })  // crypto
      .mockResolvedValueOnce({ finalScoreMin: '0.55', regimeWeightMin: '0.40' }); // xstock

    const { signalQualityEvaluator } = await import('../../core/filters/signal_quality_evaluator');

    // Warm cache with crypto_spot.
    const cryptoThresholds = await signalQualityEvaluator.getThresholds('paper', 'crypto_spot');
    expect(cryptoThresholds.finalScoreMin).toBeCloseTo(0.40, 2);

    // Now read xstock_spot — distinct cache key MUST trigger a fresh fetch.
    const xstockThresholds = await signalQualityEvaluator.getThresholds('paper', 'xstock_spot');
    expect(xstockThresholds.finalScoreMin).toBeCloseTo(0.55, 2);

    // Both calls hit the underlying storage (no cache hit on xstock from crypto's entry).
    expect(mockGetScreenerFilters).toHaveBeenCalledTimes(2);
    expect(mockGetScreenerFilters).toHaveBeenNthCalledWith(1, { mode: 'paper', assetClass: 'crypto_spot' });
    expect(mockGetScreenerFilters).toHaveBeenNthCalledWith(2, { mode: 'paper', assetClass: 'xstock_spot' });
  });

  it('CACHE HIT — same (mode, assetClass) returns cached value (no second storage call within TTL)', async () => {
    mockGetScreenerFilters.mockResolvedValueOnce({
      finalScoreMin: '0.42', regimeWeightMin: '0.32',
    });

    const { signalQualityEvaluator } = await import('../../core/filters/signal_quality_evaluator');

    // First call hits storage.
    const first = await signalQualityEvaluator.getThresholds('live', 'crypto_spot');
    // Second call within 60s TTL must use cache — no second storage call.
    const second = await signalQualityEvaluator.getThresholds('live', 'crypto_spot');

    expect(first.finalScoreMin).toBeCloseTo(0.42, 2);
    expect(second.finalScoreMin).toBeCloseTo(0.42, 2);
    expect(mockGetScreenerFilters).toHaveBeenCalledTimes(1);
  });
});
