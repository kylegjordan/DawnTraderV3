/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b2 — xstock_spot Parallel Pattern Path Filter
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pattern-path companion to `global-filter.ts` + `imf-evaluator.ts`. Runs in
 * parallel with the quant family chain inside `eval-cycle.ts` (mirrors
 * crypto's `fx5-scanner.ts` dual-path shape at lines 743-770 + 1242-1272).
 *
 * Resolves config from `screener_filters` with:
 *   (mode='paper', asset_class='xstock_spot', filter_path='vts_pattern')
 *   (mode='live',  asset_class='xstock_spot', filter_path='active_pattern')
 *
 * Rows seeded by `2026-05-11-b79-0m-b2-xstock-pattern-rows.sql` (Layer-1
 * baseline cloned from crypto_spot).
 *
 * Two-stage gate per pair (same shape as global-filter + family-IMF):
 *
 *   Stage 1 — Pattern global filter:
 *     - min_price            (latest tick price)
 *     - max_price            (sanity ceiling)
 *     - min_volume           (24h dollar-volume proxy; caller=0 → skip)
 *     - history (60-bar floor; hardcoded per pre-audit §-1.1 — matches
 *       global-filter.ts:109 convention; min_history_days remains
 *       corpus-level metadata only)
 *     - max_bid_ask_spread   (deferred — bid/ask not in OHLC; Layer-1 skip)
 *     - exclude_stablecoins  (N/A for xstock; recorded for telemetry)
 *
 *   Stage 2 — Pattern IMF gate:
 *     - LQ >= lq_min
 *     - VN <= vn_max
 *     - DI >= di_min AND DI <= di_max
 *
 * Returns a result object the caller merges into XstockEvalCycleCounters.
 * If passed, the pair is tagged `sourcePool='pattern'` in the caller's
 * fan-out loop and only pattern strategies (STRATEGY_FAMILY_MAP[s] ===
 * 'pattern') iterate against it.
 *
 * Pattern-pool guardrails (final_score_floor=0.45, max_position_pct=0.50)
 * are NOT enforced here — they consume into per-strategy SQE-equivalent
 * gating downstream. Sourced from `module_constants.pattern_pool_gates.
 * xstock_spot.*` rows (seeded `2026-05-07-b79-xstock-module-constants.sql`
 * with `updated_by='B79_inherit_crypto'`).
 * ════════════════════════════════════════════════════════════════════════════
 */

import { calculateLogLiquidity, calculateVolNoise } from '../../core/metrics/imf-metrics.js';
import { storage } from '../../storage.js';
import type { OHLCData } from '../../types/market-regime.types';
import { getConstant } from '../../services/module-constants-service.js';

export interface PatternFilterResult {
  passed: boolean;
  failureReason?: string;
  counters: Record<string, number>;
  // Pattern-IMF per-metric attribution (failedLQ / failedVN / failedDI count
  // up to 1 each on rejection). Used by Filter Diagnostics breakout when the
  // xStocks tab pattern section becomes consumable in a later batch.
  perMetric: {
    failedLQ: number;
    failedVN: number;
    failedDI: number;
    passed: number;
    total: number;
  };
  // Live metric values for telemetry / debug.
  metrics: { LQ: number; VolNoise: number; DI: number | null };
}

// B-NEW-14 (2026-05-14): expose the pattern-side counter set so eval-cycle's
// merge has the same shape as the quant-side counters. Pattern path adds
// `failed_max_bid_ask_spread` here for the panel's Pattern column.

/**
 * Compute Directional Integrity score from OHLC bars. Same proxy as
 * imf-evaluator.ts (lifted to keep this module self-contained — could be
 * promoted to a shared util in a later batch, but the duplication is
 * intentional Layer-1 simplicity).
 *
 * Returns null when bars < 20 (caller treats as "DI not computable" =
 * rejection at the DI gate).
 */
function computeDirectionalIntegrity(ohlc: OHLCData[]): number | null {
  if (ohlc.length < 20) return null;
  let netDelta = 0;
  let absDelta = 0;
  for (let i = 1; i < ohlc.length; i++) {
    const delta = ohlc[i].close - ohlc[i - 1].close;
    netDelta += delta;
    absDelta += Math.abs(delta);
  }
  if (absDelta === 0) return 50;
  return Math.min(100, Math.max(0, ((netDelta / absDelta) * 50) + 50));
}

/**
 * Evaluate a pair against the xstock_spot pattern global + pattern IMF gates.
 * Returns `{passed: true}` only when ALL gates pass.
 *
 * Per-cycle bar-count floor (60 bars ≈ 1h of 1m candles) is hardcoded
 * intentionally — matches `global-filter.ts:109` and represents the same
 * "indicator math needs at least N bars" floor. The row's `min_history_days`
 * field is corpus-level metadata (interpreted same as global-filter.ts). See
 * `BATCH_79_0m_b2_PRE_AUDIT.md` §-1.1 for the rationale + §-1.10 for the
 * Layer-3 migration target to `module_constants.pattern_pool_gates.
 * min_bars_for_eval`.
 */
export async function evaluateXstockPatternFilter(
  symbol: string,
  ohlc: OHLCData[],
  lastPrice: number,
  volume24hUSD: number,
  mode: 'paper' | 'live',
  preloadedConfig?: any,
  // B-NEW-14 (2026-05-14): bid/ask spread % from latest snap row.
  // Sentinel -1 = "skip check" (back-compat with tests + cold-start).
  bidAskSpreadPct: number = -1,
): Promise<PatternFilterResult> {
  const counters: Record<string, number> = {
    evaluated: 1,
    passed_global: 0,
    passed_imf: 0,
    passed_all: 0,
    failed_config_missing: 0,
    failed_min_price: 0,
    failed_max_price: 0,
    failed_min_volume: 0,
    failed_min_history: 0,
    failed_max_bid_ask_spread: 0,
    failed_lq: 0,
    failed_vn: 0,
    failed_di: 0,
  };
  const perMetric = { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 0, total: 0 };

  // Pre-loaded config preferred (loaded once per cycle by scanner.runCycle).
  // Falls back to per-pair DB lookup for back-compat (e.g. unit tests).
  const filterPath = mode === 'paper' ? 'vts_pattern' : 'active_pattern';
  let config: any = preloadedConfig;
  if (!config) {
    try {
      config = await storage.getScreenerFilters({
        mode,
        assetClass: 'xstock_spot',
        filterPath,
      });
    } catch (err) {
      counters.failed_config_missing = 1;
      return {
        passed: false,
        failureReason: `pattern_config_lookup_failed_${err instanceof Error ? err.message : 'unknown'}`,
        counters,
        perMetric,
        metrics: { LQ: 0, VolNoise: 0, DI: null },
      };
    }
  }
  if (!config) {
    counters.failed_config_missing = 1;
    return {
      passed: false,
      failureReason: 'pattern_config_row_missing',
      counters,
      perMetric,
      metrics: { LQ: 0, VolNoise: 0, DI: null },
    };
  }

  // ── Stage 1 — Pattern global filter ──

  // min_price
  const minPrice = parseFloat(config.minPrice ?? '0');
  if (minPrice > 0 && lastPrice < minPrice) {
    counters.failed_min_price = 1;
    return {
      passed: false,
      failureReason: 'pattern_min_price',
      counters,
      perMetric,
      metrics: { LQ: 0, VolNoise: 0, DI: null },
    };
  }

  // max_price
  const maxPrice = parseFloat(config.maxPrice ?? '0');
  if (maxPrice > 0 && lastPrice > maxPrice) {
    counters.failed_max_price = 1;
    return {
      passed: false,
      failureReason: 'pattern_max_price',
      counters,
      perMetric,
      metrics: { LQ: 0, VolNoise: 0, DI: null },
    };
  }

  // min_volume — caller passes 0 when volume isn't available; Layer-1 pass-through.
  const minVolume = parseFloat(config.minVolume ?? '0');
  if (minVolume > 0 && volume24hUSD > 0 && volume24hUSD < minVolume) {
    counters.failed_min_volume = 1;
    return {
      passed: false,
      failureReason: 'pattern_min_volume',
      counters,
      perMetric,
      metrics: { LQ: 0, VolNoise: 0, DI: null },
    };
  }

  // B-NEW-34 (2026-05-15): floor now reads from module_constants
  // `xstock_spot.min_ohlc_history_bars` (same key as global-filter.ts —
  // single source of truth for both lanes). Migrated from hardcoded 60.
  // Layer-3 target documented in pre-B-NEW-34 PRE_AUDIT §-1.10 was
  // `pattern_pool_gates.min_bars_for_eval`; B-NEW-34 unifies on the
  // xstock_spot.min_ohlc_history_bars key so both filters drive off one row.
  // Fallback to 24 keeps the system functional during the migration race.
  // B-NEW-34 R4 cleanup: static top-of-file import (same key as global-filter,
  // single source of truth for the floor across both lanes).
  const minBarsRaw = await getConstant<number>('xstock_spot', 'min_ohlc_history_bars', {
    exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*',
  });
  const minBars = typeof minBarsRaw === 'number' && minBarsRaw > 0 ? minBarsRaw : 24;
  if (ohlc.length < minBars) {
    counters.failed_min_history = 1;
    return {
      passed: false,
      failureReason: `pattern_history_${ohlc.length}_lt_${minBars}`,
      counters,
      perMetric,
      metrics: { LQ: 0, VolNoise: 0, DI: null },
    };
  }

  // max_bid_ask_spread (B-NEW-14, 2026-05-14): peer global filter on the
  // pattern side. Pattern threshold reads from the pattern config row
  // (vts_pattern / active_pattern) — DB convention is identical to the
  // quant-side `active_quant` row. Sentinel -1 = "skip check".
  const patternMaxBidAskSpread = parseFloat(config.maxBidAskSpread ?? '0');
  if (patternMaxBidAskSpread > 0 && bidAskSpreadPct >= 0 && bidAskSpreadPct > patternMaxBidAskSpread) {
    counters.failed_max_bid_ask_spread = 1;
    return {
      passed: false,
      failureReason: `pattern_max_bid_ask_spread_${bidAskSpreadPct.toFixed(3)}_gt_${patternMaxBidAskSpread.toFixed(3)}`,
      counters,
      perMetric,
      metrics: { LQ: 0, VolNoise: 0, DI: null },
    };
  }

  counters.passed_global = 1;

  // ── Stage 2 — Pattern IMF gate ──
  const lqMin = parseFloat(config.lqMin ?? '0');
  const vnMax = parseFloat(config.vnMax ?? '999');
  const diMin = parseFloat(config.diMin ?? '0');
  const diMax = parseFloat(config.diMax ?? '100');

  const LQ = ohlc.length >= 10 ? calculateLogLiquidity(ohlc) : 0;
  const VolNoise = ohlc.length >= 10 ? calculateVolNoise(ohlc) : 0.5;
  const DI = computeDirectionalIntegrity(ohlc);

  counters.lq_value_x100 = Math.round(LQ * 100);
  counters.vn_value_x10000 = Math.round(VolNoise * 10000);
  counters.di_value_x100 = DI === null ? -1 : Math.round(DI * 100);

  perMetric.total = 1;
  const metrics = { LQ, VolNoise, DI };

  if (LQ < lqMin) {
    counters.failed_lq = 1;
    perMetric.failedLQ = 1;
    return {
      passed: false,
      failureReason: `pattern_lq_${LQ.toFixed(2)}_lt_${lqMin.toFixed(2)}`,
      counters,
      perMetric,
      metrics,
    };
  }
  if (VolNoise > vnMax) {
    counters.failed_vn = 1;
    perMetric.failedVN = 1;
    return {
      passed: false,
      failureReason: `pattern_vn_${VolNoise.toFixed(4)}_gt_${vnMax.toFixed(4)}`,
      counters,
      perMetric,
      metrics,
    };
  }
  if (DI === null || DI < diMin || DI > diMax) {
    counters.failed_di = 1;
    perMetric.failedDI = 1;
    return {
      passed: false,
      failureReason: `pattern_di_${DI === null ? 'null' : DI.toFixed(2)}_outside_${diMin}_${diMax}`,
      counters,
      perMetric,
      metrics,
    };
  }

  counters.passed_imf = 1;
  counters.passed_all = 1;
  perMetric.passed = 1;

  return { passed: true, counters, perMetric, metrics };
}
