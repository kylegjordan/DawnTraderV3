/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0m.b — xstock_spot Global Filter (Layer-1 starter)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pair-level gates applied BEFORE the family-IMF evaluator. Resolves config
 * from `screener_filters` with `(mode, asset_class='xstock_spot',
 * filter_path='active_quant')` — Layer-1 starter values cloned from crypto
 * baseline by B79.0m.a hotfix migration.
 *
 * Gates with N/A semantics for xstock_spot (skipped, not failed):
 *   - exclude_stablecoins (no stablecoin equity tickers; recorded as N/A)
 *   - quote_currencies (always USD for xstock; recorded as N/A)
 *   - min_market_cap (Layer-1 deferred; per-symbol mcap feed in B79.0n+)
 *
 * Gates applied:
 *   - min_price             (latest tick price)
 *   - max_price             (sanity ceiling)
 *   - min_volume / volume_24h_min  (24h dollar-volume proxy)
 *   - min_history_days      (OHLC history depth)
 *   - max_bid_ask_spread    (B-NEW-14, 2026-05-14): bid/ask spread % from
 *                            the latest ticker snap. Caller measures
 *                            `((ask - bid) / mid) * 100` from the snap row
 *                            and passes it as `bidAskSpreadPct`. Sentinel
 *                            `-1` = "data unavailable, skip check" (back-compat
 *                            with tests + cold-start). Mirrors crypto's
 *                            fx5-scanner.ts:1037-1053 + market-scanner.ts:775
 *                            pattern — same architecture, different feed
 *                            source (crypto = live Kraken ticker payload;
 *                            xstock = archived snap row from the same
 *                            payload).
 *
 * Counters returned per cycle; merged into XstockEvalCycleCounters for the
 * Filter Diagnostics panel.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { storage } from '../../storage.js';
import type { OHLCData } from '../../types/market-regime.types';
import { getConstant } from '../../services/module-constants-service.js';

export interface GlobalFilterResult {
  passed: boolean;
  failureReason?: string;
  counters: Record<string, number>;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function evaluateXstockGlobalFilter(
  symbol: string,
  ohlc: OHLCData[],
  lastPrice: number,
  volume24hUSD: number,
  mode: 'paper' | 'live',
  preloadedConfig?: any,
  // B-NEW-14 (2026-05-14): bid/ask spread % measured at scan time from the
  // latest ticker snap row. Sentinel -1 = "data unavailable; skip check"
  // (back-compat with tests + cold-start when snap has not yet captured
  // bid/ask for a brand-new symbol).
  bidAskSpreadPct: number = -1,
): Promise<GlobalFilterResult> {
  const counters: Record<string, number> = {
    evaluated: 1,
    passed_all_filters: 0,
    failed_min_price: 0,
    failed_max_price: 0,
    failed_min_volume: 0,
    failed_history: 0,
    failed_max_bid_ask_spread: 0,
    failed_config_missing: 0,
    na_stablecoin: 0,
    na_quote_currency: 0,
    na_market_cap: 0,
  };
  // Always N/A for xstock_spot — record once per evaluation for telemetry visibility.
  counters.na_stablecoin = 1;
  counters.na_quote_currency = 1;
  counters.na_market_cap = 1;

  // Pre-loaded config preferred (loaded once per cycle by scanner.runCycle).
  // Falls back to per-pair DB lookup for back-compat (e.g. unit tests).
  let config: any = preloadedConfig;
  if (!config) {
    try {
      config = await storage.getScreenerFilters({
        mode,
        assetClass: 'xstock_spot',
        filterPath: 'active_quant',
      });
    } catch (err) {
      counters.failed_config_missing = 1;
      return { passed: false, failureReason: 'config_lookup_failed', counters };
    }
  }
  if (!config) {
    counters.failed_config_missing = 1;
    return { passed: false, failureReason: 'config_row_missing', counters };
  }

  // min_price
  const minPrice = parseFloat(config.minPrice ?? '0');
  if (minPrice > 0 && lastPrice < minPrice) {
    counters.failed_min_price = 1;
    return { passed: false, failureReason: 'min_price', counters };
  }

  // max_price (sanity)
  const maxPrice = parseFloat(config.maxPrice ?? '0');
  if (maxPrice > 0 && lastPrice > maxPrice) {
    counters.failed_max_price = 1;
    return { passed: false, failureReason: 'max_price', counters };
  }

  // min_volume — use 24h dollar-volume if provided. Caller passes 0 when
  // volume isn't available yet; we Layer-1-pass that case rather than fail.
  const minVolume = parseFloat(config.minVolume ?? '0');
  if (minVolume > 0 && volume24hUSD > 0 && volume24hUSD < minVolume) {
    counters.failed_min_volume = 1;
    return { passed: false, failureReason: 'min_volume', counters };
  }

  // min_history — proxy via OHLC bar count.
  //
  // B-NEW-34 (2026-05-15): floor now reads from module_constants
  // `xstock_spot.min_ohlc_history_bars` (default 24 = ~1 trading day of
  // 60-min bars). Prior to B-NEW-34 the scanner fetched 1-min bars and used
  // a hardcoded 60-bar floor (= ~1 hour of 1-min); the comment block describing
  // 1m bars was thus correct for that era. With B-NEW-34 the scanner pulls
  // 60-min rolled-up bars via xstockOhlcCache, so the floor's "bar count"
  // unit shifted from minutes to hours. 24 chosen to: (a) leave 4 bars of
  // headroom over BB/SMA(20)-period indicators, (b) survive Monday morning
  // when the prior Friday's bars plus Monday pre-market should give ~18-20
  // hours of context, (c) keep first-signal-fire window to ~1 day post-deploy.
  // module_constants migration: see SQL in same batch.
  // Fallback to 24 if the row is missing keeps the system functional during
  // the migration race window between code-deploy and SQL-apply.
  // B-NEW-34 R4 cleanup: static top-of-file import (Node module cache makes
  // dynamic import effectively a no-op after first call, but static keeps the
  // hot path free of microtasks and removes one indirection for readers).
  const minBarsRaw = await getConstant<number>('xstock_spot', 'min_ohlc_history_bars', {
    exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*',
  });
  const minBars = typeof minBarsRaw === 'number' && minBarsRaw > 0 ? minBarsRaw : 24;
  if (ohlc.length < minBars) {
    counters.failed_history = 1;
    return { passed: false, failureReason: `history_${ohlc.length}_lt_${minBars}`, counters };
  }

  // max_bid_ask_spread (B-NEW-14, 2026-05-14): peer global filter — mirrors
  // crypto's fx5-scanner.ts:1037-1053 + market-scanner.ts:775 pattern.
  // Caller measures spread% from the snap row; sentinel -1 = "data unavailable
  // for this pair this cycle, skip check" (cold-start or null bid/ask).
  // Threshold = 0 disables the gate entirely (DB convention).
  const maxBidAskSpread = parseFloat(config.maxBidAskSpread ?? '0');
  if (maxBidAskSpread > 0 && bidAskSpreadPct >= 0 && bidAskSpreadPct > maxBidAskSpread) {
    counters.failed_max_bid_ask_spread = 1;
    return {
      passed: false,
      failureReason: `max_bid_ask_spread_${bidAskSpreadPct.toFixed(3)}_gt_${maxBidAskSpread.toFixed(3)}`,
      counters,
    };
  }

  counters.passed_all_filters = 1;
  return { passed: true, counters };
}
