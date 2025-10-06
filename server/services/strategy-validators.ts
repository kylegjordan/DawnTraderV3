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

// Type definitions for each strategy
export type VwapPullbackParams = z.infer<typeof VWAP_PULLBACK_Schema>;
export type AbcdLongParams = z.infer<typeof ABCD_LONG_Schema>;
export type SmaTrendParams = z.infer<typeof SMA_TREND_Schema>;
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
    default:
      return strategy;
  }
}

// Get default params for a strategy
export function getDefaultParams(strategy: string): Record<string, any> {
  const validator = getValidator(strategy);
  return validator.parse({});
}
