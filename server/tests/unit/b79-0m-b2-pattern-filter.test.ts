/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b2 — Pattern Filter unit tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Coverage:
 *   (a) Missing config row → fail with `pattern_config_row_missing`
 *   (b) Min-price violation → fail with `pattern_min_price`
 *   (c) Min-history violation (< 60 bars) → fail with `pattern_history_*_lt_60`
 *       + caller can detect by `failureReason.startsWith('pattern_history_')`
 *       so XstockEvalCycleCounters.patternRejectByMinHistory tripwire fires
 *   (d) LQ below threshold → fail with `pattern_lq_*_lt_*`
 *   (e) VN above threshold → fail with `pattern_vn_*_gt_*`
 *   (f) DI above di_max → fail with `pattern_di_*_outside_*` (upper boundary, Langston nit #3)
 *   (f2) DI flat-tape neutral (50) but di_min>50 → fail (lower boundary)
 *   (g) All gates pass → passed=true
 *   (h) Mode → filter_path resolution: paper→vts_pattern, live→active_pattern
 *       (Langston nit #4 — vi.fn assertion on storage call args)
 *
 * The pattern-filter consumes the row at `(mode, asset_class='xstock_spot',
 * filter_path=vts_pattern|active_pattern)` — seeded by migration
 * 2026-05-11-b79-0m-b2-xstock-pattern-rows.sql.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OHLCData } from '../../types/market-regime.types';

// Mock storage.getScreenerFilters — we control the resolved row per test.
// Langston Step 4 nit #4: use vi.fn so call args are observable.
const mockRow: { current: any | null } = { current: null };
const mockGetScreenerFilters = vi.fn(async (_args: any) => mockRow.current);
vi.mock('../../storage.js', () => ({
  storage: {
    getScreenerFilters: (args: any) => mockGetScreenerFilters(args),
  },
}));

// Mock the imf-metrics util so we can drive LQ/VN values deterministically.
const metrics = { LQ: 50, VN: 0.5, Corr: 0.5 };
vi.mock('../../core/metrics/imf-metrics.js', () => ({
  calculateLogLiquidity: () => metrics.LQ,
  calculateVolNoise: () => metrics.VN,
  calculateCorrelation: () => metrics.Corr,
  calculateIMFMetrics: () => ({ LQ: metrics.LQ, VolNoise: metrics.VN, Correlation: metrics.Corr }),
}));

import { evaluateXstockPatternFilter } from '../../asset_classes/xstock_spot/pattern-filter.js';

// Helper: synthesize directional OHLC with N bars and net-positive close-to-close
// movement (DI ≈ 100 — strong upward direction).
function makeOhlc(count: number, slope = 0.05, startPrice = 100): OHLCData[] {
  const bars: OHLCData[] = [];
  for (let i = 0; i < count; i++) {
    const price = startPrice + i * slope;
    bars.push({
      timestamp: Date.now() - (count - i) * 60_000,
      open: price - 0.01,
      high: price + 0.02,
      low: price - 0.02,
      close: price,
      volume: 1000,
    } as OHLCData);
  }
  return bars;
}

const PATTERN_ROW = {
  minPrice: '0.05',
  maxPrice: '99999999.99',
  minVolume: '150000.00',
  maxBidAskSpread: '1.50',
  minHistoryDays: 14,
  excludeStablecoins: false,
  lqMin: '43.0000',
  vnMax: '0.9800',
  diMin: '3.0000',
  diMax: '100.0000',
};

describe('B79.0m.b2 — Pattern Filter', () => {
  beforeEach(() => {
    mockRow.current = { ...PATTERN_ROW };
    metrics.LQ = 50; metrics.VN = 0.5; metrics.Corr = 0.5;
    mockGetScreenerFilters.mockClear();
  });

  it('(a) missing config row → pattern_config_row_missing', async () => {
    mockRow.current = null;
    const result = await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100), 200, 0, 'paper');
    expect(result.passed).toBe(false);
    expect(result.failureReason).toBe('pattern_config_row_missing');
    expect(result.counters.failed_config_missing).toBe(1);
  });

  it('(b) lastPrice below min_price → pattern_min_price', async () => {
    const result = await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100), 0.01, 0, 'paper');
    expect(result.passed).toBe(false);
    expect(result.failureReason).toBe('pattern_min_price');
    expect(result.counters.failed_min_price).toBe(1);
  });

  it('(c) ohlc.length below min_ohlc_history_bars → pattern_history_N_lt_M + tripwire prefix', async () => {
    // B-NEW-43 Phase 2 chunk 9 (2026-05-23): test was written assuming a
    // 60-bar floor (the 1-min-era default). B-NEW-34 (2026-05-15) replaced
    // that with a 24-bar floor (60-min-era) per module_constants seed
    // 'xstock_spot.min_ohlc_history_bars' = 24. With makeOhlc(50), 50 > 24
    // so the filter passes the history check. Use 20 bars (below 24) +
    // threshold-agnostic regex so the test stays correct regardless of
    // future floor changes.
    const result = await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(20), 200, 0, 'paper');
    expect(result.passed).toBe(false);
    expect(result.failureReason).toMatch(/^pattern_history_\d+_lt_\d+$/);
    // The eval-cycle increments patternRejectByMinHistory when failureReason starts with 'pattern_history_'.
    expect(result.failureReason?.startsWith('pattern_history_')).toBe(true);
  });

  it('(d) LQ below lq_min → pattern_lq_*_lt_*', async () => {
    metrics.LQ = 30; // < 43
    const result = await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100), 200, 0, 'paper');
    expect(result.passed).toBe(false);
    expect(result.failureReason).toMatch(/^pattern_lq_30\.00_lt_43\.00$/);
    expect(result.perMetric.failedLQ).toBe(1);
  });

  it('(e) VN above vn_max → pattern_vn_*_gt_*', async () => {
    metrics.VN = 0.99; // > 0.98
    const result = await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100), 200, 0, 'paper');
    expect(result.passed).toBe(false);
    expect(result.failureReason).toMatch(/^pattern_vn_0\.9900_gt_0\.9800$/);
    expect(result.perMetric.failedVN).toBe(1);
  });

  it('(f) DI above di_max → pattern_di_*_outside_*  (Langston nit #3)', async () => {
    // Perfectly directional bars (slope=0.001 every step) produce DI=100
    // (max). Tighten di_max to 30 so the upper-band gate trips. Covers the
    // DI band's upper boundary; (f2) covers the lower boundary via flat tape.
    mockRow.current = { ...PATTERN_ROW, diMax: '30.0000' };
    const result = await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100, 0.001), 200, 0, 'paper');
    expect(result.passed).toBe(false);
    expect(result.failureReason).toMatch(/^pattern_di_/);
    expect(result.failureReason).toContain('_outside_');
    expect(result.perMetric.failedDI).toBe(1);
  });

  it('(f2) DI null (ohlc.length<20) → pattern_di_null_outside_* — verified via 60-bar fixture + diMin>0', async () => {
    // ohlc.length=60 (>=20) gives a numeric DI, so test this branch via flat
    // tape (slope=0) which puts DI exactly at 50; tighten di_min above 50.
    mockRow.current = { ...PATTERN_ROW, diMin: '60.0000' };
    const result = await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100, 0, 100), 200, 0, 'paper');
    expect(result.passed).toBe(false);
    expect(result.failureReason).toMatch(/^pattern_di_/);
  });

  it('(g) all gates pass → passed=true', async () => {
    // metrics defaults LQ=50, VN=0.5; OHLC has 100 directional bars → DI≈100 → in [3,100].
    const result = await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100), 200, 0, 'paper');
    expect(result.passed).toBe(true);
    expect(result.failureReason).toBeUndefined();
    expect(result.counters.passed_all).toBe(1);
    expect(result.perMetric.passed).toBe(1);
  });

  it('(h) mode=paper resolves vts_pattern; mode=live resolves active_pattern (Langston nit #4 — assert mock call args)', async () => {
    await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100), 200, 0, 'paper');
    expect(mockGetScreenerFilters).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'paper', assetClass: 'xstock_spot', filterPath: 'vts_pattern',
    }));
    mockGetScreenerFilters.mockClear();
    await evaluateXstockPatternFilter('AAPL/USD', makeOhlc(100), 200, 0, 'live');
    expect(mockGetScreenerFilters).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'live', assetClass: 'xstock_spot', filterPath: 'active_pattern',
    }));
  });
});
