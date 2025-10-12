import { z } from "zod";

// Base common parameters for all strategies
export const BaseCommon = z.object({
  maxConcurrentPositions: z.number().int().min(0).max(20).default(5),
  riskPerTrade: z.number().min(0.0005).max(0.05).default(0.01), // 0.05 = 5%
  takeProfitR: z.number().min(0.2).max(10).default(2),
  stopLossR: z.number().min(0.1).max(10).default(1),
  cooldownMinutes: z.number().int().min(0).max(240).default(5),
});

// VWAP Pullback Strategy Schema
export const VWAP_PULLBACK_Schema = BaseCommon.extend({
  vwapLookbackMin: z.number().int().min(1).max(120).default(20),
  pullbackPct: z.number().min(0.001).max(0.05).default(0.01),
  minVolumeUsd: z.number().min(0).default(10000),
});

// ABCD Long Strategy Schema
export const ABCD_LONG_Schema = BaseCommon.extend({
  minAtoBStrength: z.number().min(0.1).max(5).default(1.2),
  cPullbackPctMax: z.number().min(0.01).max(0.3).default(0.15),
  dBreakoutBufferPct: z.number().min(0).max(0.05).default(0.005),
});

// SMA Trend Ride Strategy Schema
export const SMA_TREND_Schema = BaseCommon.extend({
  fastSma: z.number().int().min(3).max(50).default(10),
  slowSma: z.number().int().min(10).max(200).default(50),
  trendStrengthMin: z.number().min(0).max(1).default(0.4),
});

// Breakout Strategy Schema
export const BREAKOUT_Schema = BaseCommon.extend({
  minConsolidationBars: z.number().int().min(5).max(30).default(10),
  maxRangeWidth: z.number().min(0.01).max(0.05).default(0.03), // 1-5%
  breakoutBuffer: z.number().min(0.005).max(0.02).default(0.01), // 0.5-2%
  volumeMultiplier: z.number().min(1.5).max(3.0).default(2.0),
  trailingStopEnabled: z.boolean().default(true),
  maxHoldingHours: z.number().int().min(2).max(24).default(12),
});

// Mean Reversion Strategy Schema
export const MEAN_REVERSION_Schema = BaseCommon.extend({
  meanType: z.enum(['vwap', 'sma', 'midpoint']).default('vwap'),
  smaLength: z.number().int().min(10).max(50).default(20),
  deviationThreshold: z.number().min(0.015).max(0.04).default(0.025), // 1.5-4%
  minRangeTouches: z.number().int().min(2).max(4).default(2),
  partialExitPercent: z.number().int().min(25).max(75).default(50), // 25-75%
  stopLossBuffer: z.number().min(0.005).max(0.02).default(0.01), // 0.5-2%
  maxHoldingHours: z.number().int().min(1).max(12).default(6),
});

// Range Trading Strategy Schema
export const RANGE_TRADING_Schema = BaseCommon.extend({
  minRangeDurationHours: z.number().int().min(4).max(48).default(8),
  minRangeWidth: z.number().min(0.02).max(0.08).default(0.03), // 2-8%
  minBoundaryTouches: z.number().int().min(2).max(5).default(3),
  entryZoneWidth: z.number().min(0.002).max(0.008).default(0.004), // 0.2-0.8%
  partialExitPercent: z.number().int().min(25).max(75).default(50), // 25-75%
  stopLossBeyond: z.number().min(0.005).max(0.02).default(0.01), // 0.5-2%
  maxHoldingHours: z.number().int().min(4).max(24).default(12),
});

// VWAP Bounce Strategy Schema
export const VWAP_BOUNCE_Schema = BaseCommon.extend({
  vwapProximity: z.number().min(0.002).max(0.01).default(0.005), // 0.2-1%
  minVWAPSlope: z.number().min(0.001).max(0.01).default(0.003), // 0.1-1%
  volumeMultiplier: z.number().min(1.2).max(2.0).default(1.5),
  trailingToVWAP: z.boolean().default(true),
  maxPullbackBars: z.number().int().min(2).max(10).default(6),
  partialExitR: z.number().min(1.0).max(2.0).default(1.5),
});

// Liquidity Trap Strategy Schema
export const LIQUIDITY_TRAP_Schema = BaseCommon.extend({
  maxTrapExtension: z.number().min(0.005).max(0.02).default(0.012), // 0.5-2%
  trapReturnBars: z.number().int().min(1).max(3).default(2),
  minStopZoneSize: z.enum(['small', 'medium', 'large']).default('medium'),
  minLevelTouches: z.number().int().min(2).max(5).default(3),
  volumeRatio: z.number().min(1.2).max(2.0).default(1.3),
  maxHoldingHours: z.number().int().min(1).max(6).default(4),
});

// Type definitions for each strategy
export type VwapPullbackParams = z.infer<typeof VWAP_PULLBACK_Schema>;
export type AbcdLongParams = z.infer<typeof ABCD_LONG_Schema>;
export type SmaTrendParams = z.infer<typeof SMA_TREND_Schema>;
export type BreakoutParams = z.infer<typeof BREAKOUT_Schema>;
export type MeanReversionParams = z.infer<typeof MEAN_REVERSION_Schema>;
export type RangeTradingParams = z.infer<typeof RANGE_TRADING_Schema>;
export type VwapBounceParams = z.infer<typeof VWAP_BOUNCE_Schema>;
export type LiquidityTrapParams = z.infer<typeof LIQUIDITY_TRAP_Schema>;
export type BaseParams = z.infer<typeof BaseCommon>;

// Get validator for a specific strategy
export function getValidator(strategy: string) {
  switch (strategy) {
    case "vwap_pullback":
      return VWAP_PULLBACK_Schema;
    case "abcd_long":
      return ABCD_LONG_Schema;
    case "sma_trend_ride":
      return SMA_TREND_Schema;
    case "breakout":
      return BREAKOUT_Schema;
    case "mean_reversion":
      return MEAN_REVERSION_Schema;
    case "range_trading":
      return RANGE_TRADING_Schema;
    case "vwap_bounce":
      return VWAP_BOUNCE_Schema;
    case "liquidity_trap":
      return LIQUIDITY_TRAP_Schema;
    default:
      return BaseCommon;
  }
}

// Get strategy display name
export function getStrategyDisplayName(strategy: string): string {
  switch (strategy) {
    case "vwap_pullback":
      return "VWAP Pullback";
    case "abcd_long":
      return "ABCD Long";
    case "sma_trend_ride":
      return "SMA Trend Ride";
    case "breakout":
      return "Breakout";
    case "mean_reversion":
      return "Mean Reversion";
    case "range_trading":
      return "Range Trading";
    case "vwap_bounce":
      return "VWAP Bounce";
    case "liquidity_trap":
      return "Liquidity Trap";
    default:
      return strategy;
  }
}

// Get default params for a strategy
export function getDefaultParams(strategy: string): Record<string, any> {
  const validator = getValidator(strategy);
  return validator.parse({});
}
