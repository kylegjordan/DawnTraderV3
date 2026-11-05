import { getCachedNumberRequired } from './module-constants-service.js';
import type { AssetClass } from '../../shared/asset-classes.js';

/**
 * B-XSTOCK-DBS-TO-STRATEGIES (#1235, OBJ-1c) — the strong-trend lane's geometry override for
 * vwap_pullback (B63 Item 12, Variant E: a 4×ATR stop and a 3R target), read from
 * `module_constants` `strategy.vwap_pullback` instead of literals in vts-runner.ts.
 *
 * Seeded for crypto_spot only (migration 2026-11-05-b-xstock-dbs-to-strategies.sql). xStock has no
 * row because whether xStock gets an override at all is an open decision (#1235 F2). The module is
 * warmed at startup (b72-warmup PREFETCH_MODULES). No fallback: a missing or cold row throws, so the
 * caller reads it ONLY inside the strong-trend arm (Langston r4-1), and the seed ships in the same
 * migration as this read.
 */
export function readStrongTrendGeometryOverride(
  assetClass: AssetClass,
): { stopAtrMultiplier: number; targetAsRMultiple: number } {
  const key = { exchange: '*', assetClass, strategy: 'vwap_pullback', regime: '*' };
  return {
    stopAtrMultiplier: getCachedNumberRequired('strategy.vwap_pullback', 'strong_trend_override_stop_atr_mult', key),
    targetAsRMultiple: getCachedNumberRequired('strategy.vwap_pullback', 'strong_trend_override_target_r_multiple', key),
  };
}
