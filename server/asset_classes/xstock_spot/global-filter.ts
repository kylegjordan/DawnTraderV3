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
 *   - max_bid_ask_spread    (bid/ask proxy from snap if available; Layer-1 skip if not present)
 *
 * Counters returned per cycle; merged into XstockEvalCycleCounters for the
 * Filter Diagnostics panel.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { storage } from '../../storage.js';
import type { OHLCData } from '../../types/market-regime.types';

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
  bidAskSpreadPct: number,
  mode: 'paper' | 'live',
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

  let config: any;
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

  // min_history — proxy via OHLC bar count. The eval fetcher restricts to a
  // ~6h sliding window (~360 1m bars max). config.minHistoryDays is a
  // metadata field expressing "we've been collecting OHLC for N days" — that's
  // a corpus-level invariant, not a per-pair-cycle bar count. Layer-1:
  // require at least 60 bars (~1h of 1m candles) so indicator math is sound;
  // ignore `minHistoryDays` for the in-cycle gate (use it elsewhere for
  // corpus-age checks if needed).
  if (ohlc.length < 60) {
    counters.failed_history = 1;
    return { passed: false, failureReason: `history_${ohlc.length}_lt_60`, counters };
  }

  // max_bid_ask_spread — bid/ask sourced from xstock_spot_ticker_snap by the
  // scanner; caller passes spread % of midpoint. -1 sentinel = no measurement
  // (Layer-1 skip-check per the same contract as min_volume when caller=0).
  // Threshold per Langston B-NEW (2026-05-12 cc-inbox): 3% = ~6% round-trip
  // friction = past the EV ceiling for any strategy. "Obvious junk" criterion
  // satisfied. Stricter caps belong inside strategy logic, not here.
  const maxSpread = parseFloat(config.maxBidAskSpread ?? '0');
  if (maxSpread > 0 && bidAskSpreadPct >= 0 && bidAskSpreadPct > maxSpread) {
    counters.failed_max_bid_ask_spread = 1;
    return { passed: false, failureReason: 'max_bid_ask_spread', counters };
  }

  counters.passed_all_filters = 1;
  return { passed: true, counters };
}
