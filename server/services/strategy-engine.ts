import { Trade, TradingSettings, PriceData } from '@shared/schema';
import { storage } from '../storage';
import { detectRange, detectStopZone, type RangeDetectionResult, type StopZoneResult } from './strategy-filters';
import { telemetryService } from './telemetry-service.js';
import { confirmMultiTimeframe } from './strategy-features.js';
// Directive 12.3.2: Import 8 new strategy modules
import { detectMorningStar } from '../strategies/morning-star.js';
import { detectInsideBarReversal } from '../strategies/inside-bar-reversal.js';
import { detectSupportBounce } from '../strategies/support-bounce.js';
import { detectPivotShift } from '../strategies/pivot-shift.js';
import { detectReverseImpulse } from '../strategies/reverse-impulse.js';
import { detectDefensiveHedge } from '../strategies/defensive-hedge.js';
import { detectAdaptiveFlow } from '../strategies/adaptive-flow.js';
import { detectVolatilityEdge } from '../strategies/volatility-edge.js';
import type { PatternInput } from '../strategies/strategy-helpers.js';
import { setNullReason } from '../utils/null-reason-tracker.js';

/**
 * Compute ATR (Average True Range) from PriceData array.
 * Added in Batch 18H for crypto-calibrated dynamic thresholds.
 * @param priceHistory - Array of price data (OHLCV strings)
 * @param period - ATR period (default: 14)
 * @returns ATR value in price units
 */
function computeATR(priceHistory: PriceData[], period: number = 14): number {
  if (priceHistory.length < period + 1) return 0;
  const recent = priceHistory.slice(-(period + 1));
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const high = parseFloat(recent[i].high);
    const low = parseFloat(recent[i].low);
    const prevClose = parseFloat(recent[i - 1].close);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  return trSum / period;
}

/**
 * Directive 12.3.2: Expanded to 17 canonical strategies
 * Original 9: vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap, dhma
 * New 8: morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge
 */
export interface StrategySignal {
  symbol: string;
  strategy:
    | 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride' | 'breakout'
    | 'mean_reversion' | 'range_trading' | 'vwap_bounce' | 'liquidity_trap' | 'dhma'
    | 'morning_star' | 'inside_bar_reversal' | 'support_bounce' | 'pivot_shift'
    | 'reverse_impulse' | 'defensive_hedge' | 'adaptive_flow' | 'volatility_edge';
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  metadata: any;
}

export interface TechnicalIndicators {
  vwap: number;
  sma: number;
  currentPrice: number;
  volume: number;
  high24h: number;
  low24h: number;
}

export class StrategyEngine {
  
  // VWAP Pullback Strategy
  detectVWAPPullback(
    indicators: TechnicalIndicators, 
    settings: TradingSettings,
    priceHistory?: PriceData[]
  ): StrategySignal | null {
    const { currentPrice, vwap, high24h, low24h, volume } = indicators;
    
    // User-configured settings with defaults
    const pullbackThreshold = parseFloat(settings.vwapPullbackThreshold || '3.0') / 100; // Crypto-calibrated (Batch 18H): 2% → 3%
    const volumeMultiplier = parseFloat(settings.vwapVolumeMultiplier || '1.5'); // Default 1.5x
    const maxHoldingPeriod = settings.vwapMaxHoldingPeriod || 24; // Default 24 bars
    
    console.log(`[VWAP Strategy] Using settings: pullback=${(pullbackThreshold*100).toFixed(1)}%, volumeMultiplier=${volumeMultiplier}x, maxHold=${maxHoldingPeriod} bars`);
    
    // Rules: Price above VWAP; pullback to VWAP within threshold; volume confirmation; bullish reversal
    const priceAboveVWAP = currentPrice > vwap;
    const nearVWAP = Math.abs(currentPrice - vwap) / vwap <= pullbackThreshold; // ✅ Using user setting
    const hasReversalPattern = this.detectBullishReversal(indicators);
    
    // ✅ Volume confirmation using user setting (volumeMultiplier)
    // Calculate average volume from prior candles (minimum 10 required for reliable comparison)
    if (!priceHistory || priceHistory.length < 10) {
      console.log('[VWAP Strategy] ❌ Insufficient history for volume confirmation (need 10+ candles)');
      setNullReason('insufficient_data');
      return null;
    }
    
    // Use up to 20 prior candles for average volume calculation
    const lookbackPeriod = Math.min(20, priceHistory.length);
    const recentCandles = priceHistory.slice(-lookbackPeriod);
    const totalVolume = recentCandles.reduce((sum, candle) => {
      const vol = parseFloat(candle.volume || '0');
      return sum + (isFinite(vol) && vol > 0 ? vol : 0);
    }, 0);
    
    if (totalVolume === 0) {
      console.log('[VWAP Strategy] ❌ Invalid volume data in history');
      setNullReason('insufficient_data');
      return null;
    }
    
    const avgVolume = totalVolume / lookbackPeriod;
    const hasVolumeConfirmation = volume >= avgVolume * volumeMultiplier;
    
    console.log(`[VWAP Strategy] Volume check: current=${volume.toFixed(0)}, avg=${avgVolume.toFixed(0)}, multiplier=${volumeMultiplier}x, confirmed=${hasVolumeConfirmation}`);
    
    if (priceAboveVWAP && nearVWAP && hasReversalPattern && hasVolumeConfirmation) {
      // Batch 45: ATR-relative entry/stop/target
      const atr = indicators.atr ?? (high24h - low24h) * 0.1; // Fallback: 10% of daily range
      const entryPrice = currentPrice + atr * 0.1;
      const stopPrice = Math.min(vwap - atr * 0.5, low24h + atr * 0.1);
      const targetPrice = high24h - atr * 0.25;
      
      // B3 FIX: For long trades, use Math.max to pick the HIGHER of the two targets (not the lower)
      const riskDistance = entryPrice - stopPrice;
      const twoRTarget = entryPrice + (riskDistance * 2);
      const finalTarget = Math.max(targetPrice, twoRTarget);
      
      // B3: Safety validation - reject signal if target is not above entry
      if (finalTarget <= entryPrice) {
        console.log(`[VWAP Strategy] ❌ Target validation failed - target (${finalTarget.toFixed(2)}) <= entry (${entryPrice.toFixed(2)})`);
        setNullReason('target_validation');
        return null;
      }
      
      console.log(`[VWAP Strategy] ✅ Signal generated - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${finalTarget.toFixed(2)}`);
      
      const signal = {
        symbol: '', // Will be set by caller
        strategy: 'vwap_pullback' as const,
        entryPrice,
        stopPrice,
        targetPrice: finalTarget,
        confidence: 0.7 + (hasReversalPattern ? 0.2 : 0),
        metadata: {
          vwap,
          nearVWAPPercent: Math.abs(currentPrice - vwap) / vwap * 100,
          reversalConfirmed: hasReversalPattern,
          volumeMultiplier,
          maxHoldingPeriod,
          appliedPullbackThreshold: pullbackThreshold * 100
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: signal.symbol || "(pending)",
        strategy: "vwap_pullback",
        inputSnapshot: { currentPrice, vwap, high24h, low24h, volume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      return signal;
    }
    
    console.log(`[VWAP Strategy] ❌ No signal - priceAboveVWAP=${priceAboveVWAP}, nearVWAP=${nearVWAP}, reversal=${hasReversalPattern}, volume=${hasVolumeConfirmation}`);
    setNullReason('price_position');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "vwap_pullback",
      inputSnapshot: { currentPrice, vwap, high24h, low24h, volume },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // ABCD Long Strategy
  detectABCDLong(
    priceHistory: PriceData[], 
    settings: TradingSettings
  ): StrategySignal | null {
    // User-configured settings with defaults
    const minConsolidation = settings.abcdMinConsolidation || 10; // Default 10 bars
    const breakoutThreshold = parseFloat(settings.abcdBreakoutThreshold || '1.5') / 100; // Default 1.5%
    const volumeMultiplier = parseFloat(settings.abcdVolumeMultiplier || '1.5'); // Default 1.5x
    const exitType = settings.abcdExitType || 'target'; // Default: fixed target
    const targetPercent = parseFloat(settings.abcdTargetPercent || '3.0') / 100; // Default 3%
    const trailingStopPercent = parseFloat(settings.abcdTrailingStopPercent || '2.0') / 100; // Default 2%
    
    console.log(`[ABCD Strategy] Using settings: minConsolidation=${minConsolidation} bars, breakout=${(breakoutThreshold*100).toFixed(1)}%, volumeMultiplier=${volumeMultiplier}x, exitType=${exitType}`);
    
    if (priceHistory.length < minConsolidation + 10) { setNullReason('insufficient_data'); return null; }
    
    const recent = priceHistory.slice(-(minConsolidation + 10));
    const current = recent[recent.length - 1];
    
    // Simplified ABCD pattern detection
    // A = spike, B = pullback, C = higher low above VWAP, D = breakout
    
    const aPoint = this.findSpike(recent.slice(0, 10));
    if (!aPoint) { setNullReason('no_pattern'); return null; }
    
    const bPoint = this.findPullback(recent.slice(5, 15), aPoint);
    if (!bPoint) { setNullReason('no_pattern'); return null; }
    
    // ✅ Using user-configured consolidation period
    const cPoint = this.findHigherLow(recent.slice(10, 10 + minConsolidation), bPoint);
    if (!cPoint || !current.vwap || parseFloat(cPoint.close) < parseFloat(current.vwap)) { setNullReason('price_position'); return null; }
    
    // Batch 45: ATR-relative breakout threshold
    const abcdAtr = computeATR(priceHistory);
    const cHigh = parseFloat(cPoint.high);
    const currentPrice = parseFloat(current.close);
    const currentVolume = parseFloat(current.volume);
    const atrBreakoutThreshold = cHigh > 0 ? Math.max(breakoutThreshold, abcdAtr / cHigh) : breakoutThreshold;
    const isBreakout = currentPrice > cHigh * (1 + atrBreakoutThreshold);
    
    // Batch 45: Volume confirmation against AVERAGE volume, not spike max.
    // The A-point is the max-volume bar by definition (findSpike), so comparing
    // against 1.5x spike is nearly impossible. Use average volume of the lookback instead.
    const lookbackVolumes = recent.map(p => parseFloat(p.volume)).filter(v => v > 0);
    const avgVolume = lookbackVolumes.length > 0
      ? lookbackVolumes.reduce((s, v) => s + v, 0) / lookbackVolumes.length
      : parseFloat(aPoint.volume);
    const hasVolumeConfirmation = currentVolume >= avgVolume * volumeMultiplier;
    
    if (isBreakout && hasVolumeConfirmation) {
      // Batch 45: ATR-relative entry and stop
      const entryPrice = cHigh + abcdAtr * 0.3; // Entry: C-high + 0.3 ATR buffer
      const stopPrice = parseFloat(cPoint.low) - abcdAtr * 0.5; // Stop: below C-low by 0.5 ATR
      
      let targetPrice: number;
      
      // ✅ Exit type logic: Fixed Target vs Trailing Stop
      if (exitType === 'target') {
        // Fixed target based on user-configured percentage
        targetPrice = entryPrice * (1 + targetPercent);
        console.log(`[ABCD Strategy] Using FIXED TARGET exit: ${(targetPercent * 100).toFixed(1)}%`);
      } else {
        // Trailing stop - use measured move as initial target
        const abDistance = parseFloat(aPoint.high) - parseFloat(bPoint.low);
        const measuredTarget = entryPrice + abDistance;
        
        // Alternative: +2R target
        const riskDistance = entryPrice - stopPrice;
        const twoRTarget = entryPrice + (riskDistance * 2);
        targetPrice = Math.min(measuredTarget, twoRTarget);
        
        console.log(`[ABCD Strategy] Using TRAILING STOP exit: ${(trailingStopPercent * 100).toFixed(1)}%`);
      }
      
      console.log(`[ABCD Strategy] ✅ Signal generated - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'abcd_long' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: 0.75,
        metadata: {
          aPoint: { price: aPoint.high, time: aPoint.timestamp },
          bPoint: { price: bPoint.low, time: bPoint.timestamp },
          cPoint: { price: cPoint.close, time: cPoint.timestamp },
          breakoutLevel: cHigh,
          consolidationBars: minConsolidation,
          breakoutThreshold: breakoutThreshold * 100,
          volumeMultiplier,
          exitType,
          trailingStopPercent: exitType === 'trailing' ? trailingStopPercent * 100 : null
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "abcd_long",
        inputSnapshot: { currentPrice, cHigh, currentVolume, avgVolume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      return signal;
    }
    
    setNullReason('breakout_fail');
    console.log(`[ABCD Strategy] ❌ No signal - breakout=${isBreakout}, volumeConfirmed=${hasVolumeConfirmation}`);
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "abcd_long",
      inputSnapshot: { currentPrice: current ? parseFloat(current.close) : null, cHigh: cHigh || null },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // SMA Trend Ride Strategy
  detectSMATrendRide(
    indicators: TechnicalIndicators, 
    priceHistory: PriceData[], 
    settings: TradingSettings
  ): StrategySignal | null {
    const { currentPrice, sma, volume } = indicators;
    
    // User-configured settings with defaults
    const entryCondition = settings.smaEntryCondition || 'above'; // Default: above
    const exitCondition = settings.smaExitCondition || 'break'; // Default: break below
    const trailingStopPercent = parseFloat(settings.smaTrailingStopPercent || '2.0') / 100; // Default 2%
    const smaLength = settings.smaLength || 20; // Default 20
    
    console.log(`[SMA Strategy] Using settings: smaLength=${smaLength}, entryCondition=${entryCondition}, exitCondition=${exitCondition}, trailingStop=${(trailingStopPercent*100).toFixed(1)}%`);
    
    if (!sma || priceHistory.length < 10) { setNullReason('insufficient_data'); return null; }
    
    const recentPrices = priceHistory.slice(-10).map(p => parseFloat(p.close));
    const previousPrice = recentPrices[recentPrices.length - 2];
    const isUptrend = this.detectUptrend(recentPrices, sma);
    
    let entrySignal = false;
    
    // ✅ Entry condition logic: Above vs Crossover
    if (entryCondition === 'above') {
      // Entry when price is above SMA and near it
      // Using trailing stop percent as proximity threshold (repurposed setting)
      const nearSMAThreshold = trailingStopPercent; // e.g., 2% trailing stop = 2% proximity threshold
      const nearSMA = Math.abs(currentPrice - sma) / sma <= nearSMAThreshold;
      const bounceConfirmation = currentPrice > sma && this.hasBouncePattern(priceHistory.slice(-5));
      entrySignal = isUptrend && nearSMA && bounceConfirmation;
      
      console.log(`[SMA Strategy] Entry condition ABOVE: uptrend=${isUptrend}, nearSMA=${nearSMA} (threshold=${(nearSMAThreshold*100).toFixed(1)}%), bounce=${bounceConfirmation}`);
    } else {
      // Entry when price crosses above SMA
      const crossedAbove = previousPrice <= sma && currentPrice > sma;
      entrySignal = isUptrend && crossedAbove;
      
      console.log(`[SMA Strategy] Entry condition CROSSOVER: uptrend=${isUptrend}, crossedAbove=${crossedAbove}`);
    }
    
    if (entrySignal) {
      const entryPrice = currentPrice * 1.002; // Small premium for entry
      const priorSwingLow = Math.min(...recentPrices.slice(-5));
      const stopPrice = Math.min(priorSwingLow * 0.998, sma * 0.995); // Below swing low or SMA
      
      let targetPrice: number;
      
      // ✅ Exit condition determines target calculation
      if (exitCondition === 'trailing') {
        // Trailing stop exit - set wider initial target
        const trendStrength = this.calculateTrendStrength(recentPrices);
        targetPrice = entryPrice * (1 + trendStrength * 0.03); // 3% per strength unit
        
        console.log(`[SMA Strategy] Using TRAILING STOP exit: ${(trailingStopPercent * 100).toFixed(1)}%`);
      } else {
        // Break below SMA exit - use fixed 2R target
        const riskDistance = entryPrice - stopPrice;
        targetPrice = entryPrice + (riskDistance * 2);
        
        console.log(`[SMA Strategy] Using BREAK exit: 2R target`);
      }
      
      console.log(`[SMA Strategy] ✅ Signal generated - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'sma_trend_ride' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: 0.65,
        metadata: {
          sma,
          smaLength,
          entryCondition,
          exitCondition,
          trailingStopPercent: exitCondition === 'trailing' ? trailingStopPercent * 100 : null,
          distanceFromSMA: Math.abs(currentPrice - sma) / sma * 100
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "sma_trend_ride",
        inputSnapshot: { currentPrice, sma, volume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      return signal;
    }
    
    setNullReason('indicator_filter');
    console.log(`[SMA Strategy] ❌ No signal - entryCondition=${entryCondition}, entrySignal=${entrySignal}`);
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "sma_trend_ride",
      inputSnapshot: { currentPrice, sma, volume },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Breakout Strategy
  detectBreakout(
    priceHistory: PriceData[], 
    params: any
  ): StrategySignal | null {
    const minConsolidationBars = params.minConsolidationBars || 10;
    const breakoutBuffer = (params.breakoutBuffer || 1) / 100;
    const volumeMultiplier = params.volumeMultiplier || 1.5; // Crypto-calibrated (Batch 18H): 2.0 → 1.5
    const maxHoldingHours = params.maxHoldingHours || 12;
    
    if (priceHistory.length < minConsolidationBars + 5) { setNullReason('insufficient_data'); return null; }
    
    // Batch 18H: ATR-based dynamic range width for crypto markets
    const atr = computeATR(priceHistory);
    const refPrice = parseFloat(priceHistory[priceHistory.length - 1].close);
    const atrPct = refPrice > 0 ? (atr / refPrice) * 100 : 0;
    const maxRangeWidth = params.maxRangeWidth || Math.max(7, 5.0 * atrPct); // Crypto ceiling: max(7%, 5×ATR%)
    const touchTolerance = refPrice > 0 ? atr / (4 * refPrice) : 0.003; // ATR/4 tolerance zone
    
    // Use Range Detection filter to find consolidation
    const rangeResult = detectRange(priceHistory, minConsolidationBars, maxRangeWidth, 2, touchTolerance); // Crypto: 3→2 touches + ATR/4 tolerance
    
    if (!rangeResult.isRange) {
      console.log('[Breakout] No valid consolidation range detected');
      setNullReason('range_not_found');
      return null;
    }
    
    const current = priceHistory[priceHistory.length - 1];
    const currentPrice = parseFloat(current.close);
    const currentVolume = parseFloat(current.volume);
    
    // Check for breakout above resistance
    const breakoutLevel = rangeResult.rangeHigh * (1 + breakoutBuffer);
    const isBreakout = currentPrice > breakoutLevel;
    
    // Volume confirmation - calculate average from recent bars
    const recentBars = priceHistory.slice(-Math.min(10, priceHistory.length));
    const avgVolume = recentBars.reduce((sum, p) => sum + parseFloat(p.volume), 0) / recentBars.length;
    const hasVolumeSpike = currentVolume >= avgVolume * volumeMultiplier;
    
    if (isBreakout && hasVolumeSpike) {
      const entryPrice = breakoutLevel * 1.002; // Entry slightly above breakout
      const stopPrice = rangeResult.rangeLow * 0.998; // Below range support
      const rangeHeight = rangeResult.rangeHigh - rangeResult.rangeLow;
      const targetPrice = entryPrice + rangeHeight; // Measured move target
      
      console.log(`[Breakout] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'breakout' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: 0.75,
        metadata: {
          rangeSupport: rangeResult.rangeLow,
          rangeResistance: rangeResult.rangeHigh,
          consolidationBars: rangeResult.durationBars,
          breakoutLevel,
          volumeRatio: currentVolume / avgVolume,
          maxHoldingHours
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "breakout",
        inputSnapshot: { currentPrice, breakoutLevel, currentVolume, avgVolume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      return signal;
    }
    
    setNullReason('breakout_fail');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "breakout",
      inputSnapshot: { currentPrice, breakoutLevel: rangeResult?.rangeHigh || null, isRange: rangeResult?.isRange || false },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Mean Reversion Strategy
  detectMeanReversion(
    indicators: TechnicalIndicators,
    priceHistory: PriceData[],
    params: any
  ): StrategySignal | null {
    const meanType = params.meanType || 'vwap';
    const smaLength = params.smaLength || 20;
    // Batch 18H: ATR-based dynamic deviation for crypto markets — max(3%, 1.5×ATR/price)
    const atr = computeATR(priceHistory);
    const deviationThreshold = params.deviationThreshold
      ? params.deviationThreshold / 100
      : Math.max(0.03, indicators.currentPrice > 0 ? 1.5 * atr / indicators.currentPrice : 0.03);
    const partialExitPercent = params.partialExitPercent || 50;
    const stopLossBuffer = (params.stopLossBuffer || 1) / 100;
    
    if (priceHistory.length < 20) { setNullReason('insufficient_data'); return null; }
    
    const { currentPrice, vwap } = indicators;
    
    // Determine mean reference
    let meanValue: number;
    if (meanType === 'sma') {
      meanValue = this.calculateSMA(priceHistory, smaLength);
    } else if (meanType === 'midpoint') {
      const rangeResult = detectRange(priceHistory, 10, 8, 2);
      if (!rangeResult.isRange) { setNullReason('range_not_found'); return null; }
      meanValue = (rangeResult.rangeLow + rangeResult.rangeHigh) / 2;
    } else {
      meanValue = vwap;
    }
    
    if (!meanValue || meanValue === 0) { setNullReason('insufficient_data'); return null; }
    
    // Check for oversold condition (price below mean)
    const deviation = (currentPrice - meanValue) / meanValue;
    const isOversold = deviation < -deviationThreshold;
    
    // Reversal confirmation
    const hasReversal = this.detectBullishReversal(indicators);
    
    if (isOversold && hasReversal) {
      const entryPrice = currentPrice * 1.001;
      const stopPrice = currentPrice * (1 - stopLossBuffer);
      const targetPrice = meanValue * 0.998; // Target slightly below mean
      
      console.log(`[MeanReversion] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'mean_reversion' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: 0.7,
        metadata: {
          meanType,
          meanValue,
          deviation: deviation * 100,
          partialExitPercent,
          oversoldLevel: -deviationThreshold * 100
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "mean_reversion",
        inputSnapshot: { currentPrice, vwap, meanValue, deviation: deviation * 100 },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      return signal;
    }
    
    setNullReason('indicator_filter');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "mean_reversion",
      inputSnapshot: { currentPrice, vwap, meanValue: meanValue || null },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Range Trading Strategy
  detectRangeTrading(
    priceHistory: PriceData[],
    params: any
  ): StrategySignal | null {
    const minRangeDurationHours = params.minRangeDurationHours || 10; // Crypto-calibrated (Batch 18H): 12 → 10 hours
    const minBoundaryTouches = params.minBoundaryTouches || 2; // Crypto-calibrated (Batch 18H): 3 → 2 touches
    // Batch 45: Entry zone proportional to range width — bottom 25% of range instead of fixed %.
    // For a 10% range, entry zone = 2.5% (bottom quarter). For a 5% range, entry zone = 1.25%.
    // Fallback: 1 ATR above support if range not yet known.
    const entryZoneWidthParam = (params.entryZoneWidth || 1.5) / 100; // Kept as minimum floor
    const stopLossBeyond = (params.stopLossBeyond || 1) / 100;
    
    if (priceHistory.length < 30) { setNullReason('insufficient_data'); return null; }
    
    // Batch 18H: ATR-based dynamic range width for crypto markets
    const atr = computeATR(priceHistory);
    const refPrice = parseFloat(priceHistory[priceHistory.length - 1].close);
    const atrPct = refPrice > 0 ? atr / refPrice : 0;
    const minRangeWidth = params.minRangeWidth
      ? params.minRangeWidth / 100
      : Math.max(0.03, 2.5 * atrPct); // Crypto floor: max(3%, 2.5×ATR/price)
    const touchTolerance = refPrice > 0 ? atr / (4 * refPrice) : 0.003; // ATR/4 tolerance zone
    
    // Convert hours to bars (assuming 1h bars)
    const minBars = minRangeDurationHours;
    
    // Detect established range
    const rangeResult = detectRange(priceHistory, minBars, 20, minBoundaryTouches, touchTolerance);
    
    if (!rangeResult.isRange) { setNullReason('range_not_found'); return null; }
    
    // Check range width meets minimum
    const rangeWidth = (rangeResult.rangeHigh - rangeResult.rangeLow) / rangeResult.rangeLow;
    if (rangeWidth < minRangeWidth) {
      console.log(`[RangeTrading] Range too narrow: ${(rangeWidth * 100).toFixed(2)}% < ${(minRangeWidth * 100).toFixed(2)}%`);
      setNullReason('range_not_found');
      return null;
    }
    
    const current = priceHistory[priceHistory.length - 1];
    const currentPrice = parseFloat(current.close);
    
    // Batch 45: Entry zone = bottom 25% of range, with ATR as minimum width, capped at 40% of range.
    const rangeAbsolute = rangeResult.rangeHigh - rangeResult.rangeLow;
    const entryZoneRaw = Math.max(rangeAbsolute * 0.25, atr, rangeResult.rangeLow * entryZoneWidthParam);
    const entryZoneWidth = Math.min(entryZoneRaw, rangeAbsolute * 0.4); // Cap: never more than 40% of range
    const supportEntryZone = rangeResult.rangeLow + entryZoneWidth;
    const isNearSupport = currentPrice >= rangeResult.rangeLow && currentPrice <= supportEntryZone;
    
    if (isNearSupport) {
      // Batch 45: ATR-relative entry/stop/target
      const entryPrice = currentPrice + atr * 0.1;
      const stopPrice = rangeResult.rangeLow - atr * 0.5;
      const targetPrice = rangeResult.rangeHigh - atr * 0.25;
      
      console.log(`[RangeTrading] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'range_trading' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: 0.72,
        metadata: {
          rangeSupport: rangeResult.rangeLow,
          rangeResistance: rangeResult.rangeHigh,
          rangeWidth: rangeWidth * 100,
          rangeDuration: rangeResult.durationBars,
          entryZoneWidth: entryZoneWidth * 100
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "range_trading",
        inputSnapshot: { currentPrice, rangeHigh: rangeResult.rangeHigh, rangeLow: rangeResult.rangeLow },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      return signal;
    }
    
    setNullReason('price_position');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "range_trading",
      inputSnapshot: { currentPrice, isRange: rangeResult?.isRange || false },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // VWAP Bounce Strategy
  detectVWAPBounce(
    indicators: TechnicalIndicators,
    priceHistory: PriceData[],
    params: any
  ): StrategySignal | null {
    const vwapProximity = (params.vwapProximity || 1.5) / 100; // Crypto-calibrated (Batch 18H): 0.5% → 1.5%
    const minVWAPSlope = (params.minVWAPSlope || 0.3) / 100;
    const volumeMultiplier = params.volumeMultiplier || 1.3;
    const maxPullbackBars = params.maxPullbackBars || 5;
    const partialExitR = params.partialExitR || 1.5;
    
    if (priceHistory.length < 20) { setNullReason('insufficient_data'); return null; }
    
    const { currentPrice, vwap, volume } = indicators;
    
    if (!vwap || vwap === 0) { setNullReason('insufficient_data'); return null; }
    
    // Check VWAP is trending up
    const vwapHistory = priceHistory.slice(-10).map(p => parseFloat(p.vwap || '0'));
    const vwapSlope = (vwapHistory[vwapHistory.length - 1] - vwapHistory[0]) / vwapHistory[0];
    
    if (vwapSlope < minVWAPSlope) {
      console.log(`[VWAPBounce] VWAP not trending up: slope ${(vwapSlope * 100).toFixed(2)}%`);
      setNullReason('indicator_filter');
      return null;
    }
    
    // Check price is near VWAP
    const distanceFromVWAP = Math.abs(currentPrice - vwap) / vwap;
    const isNearVWAP = distanceFromVWAP <= vwapProximity;
    
    // Check for bounce (price touched or went below VWAP recently, now above)
    const recentPrices = priceHistory.slice(-maxPullbackBars);
    const touchedVWAP = recentPrices.some(p => parseFloat(p.low) <= vwap);
    const nowAboveVWAP = currentPrice > vwap;
    
    // Volume confirmation
    const avgVolume = recentPrices.reduce((sum, p) => sum + parseFloat(p.volume), 0) / recentPrices.length;
    const hasVolume = volume >= avgVolume * volumeMultiplier;
    
    if (isNearVWAP && touchedVWAP && nowAboveVWAP && hasVolume) {
      const entryPrice = currentPrice * 1.001;
      const stopPrice = vwap * 0.997; // Slightly below VWAP
      const riskDistance = entryPrice - stopPrice;
      const targetPrice = entryPrice + (riskDistance * 2); // 2R target
      
      console.log(`[VWAPBounce] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'vwap_bounce' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: 0.73,
        metadata: {
          vwap,
          vwapSlope: vwapSlope * 100,
          distanceFromVWAP: distanceFromVWAP * 100,
          partialExitR,
          volumeRatio: volume / avgVolume
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "vwap_bounce",
        inputSnapshot: { currentPrice, vwap, volume },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      return signal;
    }
    
    setNullReason('price_position');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "vwap_bounce",
      inputSnapshot: { currentPrice, vwap, volume },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Liquidity Trap Strategy
  detectLiquidityTrap(
    priceHistory: PriceData[],
    params: any
  ): StrategySignal | null {
    const maxTrapExtension = (params.maxTrapExtension || 1.2) / 100;
    const trapReturnBars = params.trapReturnBars || 2;
    const minStopZoneSize = params.minStopZoneSize || 'medium';
    const minLevelTouches = params.minLevelTouches || 2; // Crypto-calibrated (Batch 18H): 3 → 2 touches
    const volumeRatio = params.volumeRatio || 1.5;
    
    if (priceHistory.length < 30) { setNullReason('insufficient_data'); return null; }
    
    // First, detect a range
    const rangeResult = detectRange(priceHistory.slice(0, -5), 10, 5, minLevelTouches);
    
    if (!rangeResult.isRange) { setNullReason('range_not_found'); return null; }
    
    // Check for stop zone near resistance
    const currentPrice = parseFloat(priceHistory[priceHistory.length - 1].close);
    const stopZone = detectStopZone(priceHistory, currentPrice, 20, minLevelTouches);
    
    const minClusterStrength = minStopZoneSize === 'small' ? 'weak' : minStopZoneSize === 'large' ? 'strong' : 'medium';
    if (!stopZone.hasStopZone) { setNullReason('range_not_found'); return null; }
    
    // Check for false breakout and return
    const recentBars = priceHistory.slice(-trapReturnBars - 2);
    const breakoutBar = recentBars[0];
    const currentBar = recentBars[recentBars.length - 1];
    
    const breakoutHigh = parseFloat(breakoutBar.high);
    const breakoutVolume = parseFloat(breakoutBar.volume);
    const currentBarPrice = parseFloat(currentBar.close);
    const currentVolume = parseFloat(currentBar.volume);
    
    // False breakout: went above resistance, then returned
    const brokeAbove = breakoutHigh > rangeResult.rangeHigh;
    const trapExtension = (breakoutHigh - rangeResult.rangeHigh) / rangeResult.rangeHigh;
    const returnedToRange = currentBarPrice <= rangeResult.rangeHigh;
    const hasVolumeReversal = currentVolume >= breakoutVolume * volumeRatio;
    
    if (brokeAbove && trapExtension <= maxTrapExtension && returnedToRange && hasVolumeReversal) {
      const entryPrice = currentBarPrice * 0.999; // Enter on return
      const stopPrice = breakoutHigh * 1.005; // Above trap high
      const targetPrice = rangeResult.rangeLow * 1.002; // Target range support
      
      console.log(`[LiquidityTrap] ✅ Signal - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);
      
      const signal = {
        symbol: '',
        strategy: 'liquidity_trap' as const,
        entryPrice,
        stopPrice,
        targetPrice,
        confidence: 0.68,
        metadata: {
          trapLevel: rangeResult.rangeHigh,
          trapExtension: trapExtension * 100,
          stopZoneStrength: stopZone.clusterStrength,
          returnBars: trapReturnBars,
          volumeReversal: currentVolume / breakoutVolume
        }
      };

      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "liquidity_trap",
        inputSnapshot: { currentPrice: currentBarPrice, rangeHigh: rangeResult.rangeHigh, breakoutHigh },
        output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
      }));

      return signal;
    }
    
    setNullReason('breakout_fail');
    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "liquidity_trap",
      inputSnapshot: { currentPrice: priceHistory.length > 0 ? parseFloat(priceHistory[priceHistory.length - 1].close) : null },
      output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
    }));
    return null;
  }

  // Exit condition checking
  async checkExitConditions(
    trade: Trade, 
    currentPrice: number, 
    settings: TradingSettings
  ): Promise<boolean> {
    const entryPrice = parseFloat(trade.entryPrice);
    const stopPrice = parseFloat(trade.stopPrice);
    const targetPrice = parseFloat(trade.targetPrice);
    
    // Basic stop/target exits
    if (currentPrice <= stopPrice || currentPrice >= targetPrice) {
      return true;
    }
    
    // Strategy-specific exits
    switch (trade.strategy) {
      case 'vwap_pullback':
        return await this.checkVWAPPullbackExit(trade, currentPrice);
      
      case 'abcd_long':
        return await this.checkABCDExit(trade, currentPrice);
      
      case 'sma_trend_ride':
        return await this.checkSMATrendRideExit(trade, currentPrice);
      
      case 'breakout':
        return await this.checkBreakoutExit(trade, currentPrice);
      
      case 'mean_reversion':
        return await this.checkMeanReversionExit(trade, currentPrice);
      
      case 'range_trading':
        return await this.checkRangeTradingExit(trade, currentPrice);
      
      case 'vwap_bounce':
        return await this.checkVWAPBounceExit(trade, currentPrice);
      
      case 'liquidity_trap':
        return await this.checkLiquidityTrapExit(trade, currentPrice);
      
      default:
        return false;
    }
  }

  private async checkVWAPPullbackExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Get current VWAP for the symbol
    const recentData = await storage.getPriceData(trade.symbol);
    if (recentData.length === 0) return false;
    
    const latestData = recentData[recentData.length - 1];
    const currentVWAP = parseFloat(latestData.vwap || '0');
    
    // Exit if price closes below VWAP
    return currentPrice < currentVWAP;
  }

  private async checkABCDExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // ABCD typically exits on measured move or +2R
    // Additional exit: if pattern fails and goes back below entry
    const entryPrice = parseFloat(trade.entryPrice);
    return currentPrice < entryPrice * 0.995; // 0.5% below entry
  }

  private async checkSMATrendRideExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Get current SMA
    const recentData = await storage.getPriceData(trade.symbol);
    if (recentData.length === 0) return false;
    
    const latestData = recentData[recentData.length - 1];
    const currentSMA = parseFloat(latestData.sma || '0');
    
    // Exit if price closes below SMA
    return currentPrice < currentSMA;
  }

  private async checkBreakoutExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Breakout exits if price returns below the breakout level
    const metadata = trade.metadata as any;
    const breakoutLevel = metadata?.breakoutLevel;
    
    if (!breakoutLevel) return false;
    
    // Exit if price closes below breakout level
    return currentPrice < breakoutLevel * 0.995;
  }

  private async checkMeanReversionExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Mean reversion exits if price reaches the mean (target)
    // Already handled by target price check, no additional logic needed
    return false;
  }

  private async checkRangeTradingExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Range trading exits if price breaks above resistance (range invalidated)
    const metadata = trade.metadata as any;
    const rangeResistance = metadata?.rangeResistance;
    
    if (!rangeResistance) return false;
    
    // Exit if price breaks above resistance
    return currentPrice > rangeResistance * 1.002;
  }

  private async checkVWAPBounceExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // VWAP bounce exits if price closes below VWAP (trend broken)
    const recentData = await storage.getPriceData(trade.symbol);
    if (recentData.length === 0) return false;
    
    const latestData = recentData[recentData.length - 1];
    const currentVWAP = parseFloat(latestData.vwap || '0');
    
    // Exit if price closes below VWAP
    return currentPrice < currentVWAP;
  }

  private async checkLiquidityTrapExit(trade: Trade, currentPrice: number): Promise<boolean> {
    // Liquidity trap exits if price returns above the trap level (setup invalidated)
    const metadata = trade.metadata as any;
    const trapLevel = metadata?.trapLevel;
    
    if (!trapLevel) return false;
    
    // Exit if price goes back above trap level
    return currentPrice > trapLevel * 1.002;
  }

  // Helper methods
  private detectBullishReversal(indicators: TechnicalIndicators): boolean {
    // Batch 45: ATR-relative pullback depth check.
    // Price must have pulled back within 1.5 ATR of VWAP from above.
    // Replaces the old near-contradictory "within 2% of 24h low" check.
    const { currentPrice, vwap, low24h, high24h } = indicators;
    const atr = indicators.atr ?? (high24h - low24h) * 0.1;
    if (atr <= 0 || vwap <= 0) return false;
    // Pullback depth: price is within 1.5 ATR below a recent high (VWAP acts as anchor)
    const pullbackFromVwap = currentPrice - vwap;
    const pullbackDepthATR = Math.abs(pullbackFromVwap) / atr;
    // Price should be near VWAP (within 2.0 ATR) and not too far above it
    const nearVwap = pullbackDepthATR <= 2.0;
    // Price should be in a pullback, not a free-fall (above low by at least 0.5 ATR)
    const aboveLowByAtr = (currentPrice - low24h) >= atr * 0.5;
    return nearVwap && aboveLowByAtr;
  }

  private findSpike(data: PriceData[]): PriceData | null {
    if (data.length < 3) return null;
    
    let maxVolume = 0;
    let spikePoint: PriceData | null = null;
    
    for (const point of data) {
      const volume = parseFloat(point.volume);
      if (volume > maxVolume) {
        maxVolume = volume;
        spikePoint = point;
      }
    }
    
    return spikePoint;
  }

  private findPullback(data: PriceData[], aPoint: PriceData): PriceData | null {
    let minPrice = Infinity;
    let pullbackPoint: PriceData | null = null;
    
    for (const point of data) {
      const price = parseFloat(point.low);
      if (price < minPrice && new Date(point.timestamp) > new Date(aPoint.timestamp)) {
        minPrice = price;
        pullbackPoint = point;
      }
    }
    
    return pullbackPoint;
  }

  private findHigherLow(data: PriceData[], bPoint: PriceData): PriceData | null {
    const bLow = parseFloat(bPoint.low);
    
    for (const point of data) {
      const pointLow = parseFloat(point.low);
      if (pointLow > bLow && new Date(point.timestamp) > new Date(bPoint.timestamp)) {
        return point;
      }
    }
    
    return null;
  }

  private detectUptrend(prices: number[], sma: number): boolean {
    if (prices.length < 5) return false;
    
    const recent5 = prices.slice(-5);
    const allAboveSMA = recent5.every(price => price > sma);
    const risingTrend = recent5[recent5.length - 1] > recent5[0];
    
    return allAboveSMA && risingTrend;
  }

  private hasBouncePattern(data: PriceData[]): boolean {
    if (data.length < 3) return false;
    
    const closes = data.map(d => parseFloat(d.close));
    const hasLow = Math.min(...closes.slice(0, -1));
    const currentClose = closes[closes.length - 1];
    
    return currentClose > hasLow;
  }

  private calculateTrendStrength(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    let strength = 0;
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) strength++;
    }
    
    return strength / (prices.length - 1);
  }

  // Calculate technical indicators
  calculateVWAP(data: PriceData[]): number {
    if (data.length === 0) return 0;
    
    let totalVolume = 0;
    let totalVolumePrice = 0;
    
    for (const candle of data) {
      const typical = (parseFloat(candle.high) + parseFloat(candle.low) + parseFloat(candle.close)) / 3;
      const volume = parseFloat(candle.volume);
      
      totalVolumePrice += typical * volume;
      totalVolume += volume;
    }
    
    return totalVolume > 0 ? totalVolumePrice / totalVolume : 0;
  }

  calculateSMA(data: PriceData[], period: number): number {
    if (data.length < period) return 0;
    
    const recentData = data.slice(-period);
    const sum = recentData.reduce((acc, candle) => acc + parseFloat(candle.close), 0);
    
    return sum / period;
  }

  // Phase 27.F.14: Filter signals by confidence threshold
  filterByConfidence(signals: StrategySignal[], confidenceThreshold: number): StrategySignal[] {
    if (!signals || signals.length === 0) return [];
    
    const threshold = confidenceThreshold / 100; // Convert percentage to decimal
    const filtered = signals.filter(signal => signal.confidence >= threshold);
    
    const rejected = signals.length - filtered.length;
    if (rejected > 0) {
      console.log(`[27.F.14][StrategyEngine] Confidence threshold ${confidenceThreshold}% filtered out ${rejected} signal(s)`);
      signals.forEach(signal => {
        const passed = signal.confidence >= threshold ? '✅' : '❌';
        console.log(`  ${passed} ${signal.strategy} (${signal.symbol}): confidence ${(signal.confidence * 100).toFixed(0)}%`);
      });
    }
    
    return filtered;
  }

  // Phase 30: DHMA (Dual-Horizon Microstructure Alpha) Strategy
  detectDHMA(
    indicators: TechnicalIndicators,
    priceHistory: PriceData[],
    params: any
  ): StrategySignal | null {
    const theta_OBI = params.theta_OBI || 0.3;
    const epsilon_micro = params.epsilon_micro || 0.2;
    const tau_toxicity = params.tau_toxicity || 0.7;
    const maxSpread = params.maxSpread || 5;
    const k_tp = params.k_tp || 1.5;
    const N_flow = params.N_flow || 50;
    const N_burst = params.N_burst || 10; // Candles for burst regime
    const window_session = params.window_session || 20; // Candles for session regime
    
    if (!priceHistory || priceHistory.length < window_session) {
      console.log('[DHMA] Insufficient price history');
      setNullReason('insufficient_data');
      return null;
    }
    
    const { currentPrice, vwap, volume } = indicators;
    
    // Simplified microstructure features using OHLCV data
    // In production, these would use real order book + print data
    
    // 1. Order Book Imbalance (simulated from volume and price action)
    const recentCandles = priceHistory.slice(-5);
    let buyPressure = 0;
    let sellPressure = 0;
    
    for (const candle of recentCandles) {
      const close = parseFloat(candle.close);
      const open = parseFloat(candle.open);
      const vol = parseFloat(candle.volume);
      
      if (close > open) {
        buyPressure += vol;
      } else {
        sellPressure += vol;
      }
    }
    
    const totalPressure = buyPressure + sellPressure;
    const obi = totalPressure > 0 ? (buyPressure - sellPressure) / totalPressure : 0;
    
    // 2. Microprice tilt (simulated as deviation from mid-range)
    const recentHigh = Math.max(...recentCandles.map(c => parseFloat(c.high)));
    const recentLow = Math.min(...recentCandles.map(c => parseFloat(c.low)));
    const mid = (recentHigh + recentLow) / 2;
    const micropriceTilt = (currentPrice - mid) / (recentHigh - recentLow) * 10; // Normalized
    
    // 3. Signed flow ratio (simulated from volume-weighted price movement)
    let signedFlow = 0;
    const flowCandles = priceHistory.slice(-N_flow);
    
    for (const candle of flowCandles) {
      const close = parseFloat(candle.close);
      const open = parseFloat(candle.open);
      const vol = parseFloat(candle.volume);
      
      if (close > open) {
        signedFlow += vol;
      } else if (close < open) {
        signedFlow -= vol;
      }
    }
    
    const totalFlowVol = flowCandles.reduce((sum, c) => sum + parseFloat(c.volume), 0);
    const signedFlowRatio = totalFlowVol > 0 ? signedFlow / totalFlowVol : 0;
    
    // 4. Toxicity (simulated as volatility ratio - higher vol = higher toxicity)
    const recentVolatility = this.calculateVolatility(priceHistory.slice(-10));
    const baselineVolatility = this.calculateVolatility(priceHistory.slice(-window_session));
    const toxicity = baselineVolatility > 0 ? Math.min(1, recentVolatility / baselineVolatility) : 0.5;
    
    // 5. Spread (simulated as percentage of price)
    const spread = (recentHigh - recentLow) / mid;
    const spreadTicks = spread * 100; // Approximate ticks
    
    // 6. Burst regime (short-term: last N_burst candles)
    const burstCandles = priceHistory.slice(-N_burst);
    const burstStart = parseFloat(burstCandles[0].close);
    const burstEnd = parseFloat(burstCandles[burstCandles.length - 1].close);
    const burstReturn = (burstEnd - burstStart) / burstStart;
    
    let burstRegime: 'long' | 'short' | 'neutral';
    if (burstReturn > 0.01) burstRegime = 'long';
    else if (burstReturn < -0.01) burstRegime = 'short';
    else burstRegime = 'neutral';
    
    // 7. Session regime (longer-term: last window_session candles)
    const sessionCandles = priceHistory.slice(-window_session);
    const sessionVWAP = this.calculateVWAP(sessionCandles);
    const sessionStart = parseFloat(sessionCandles[0].close);
    const sessionEnd = parseFloat(sessionCandles[sessionCandles.length - 1].close);
    const sessionSlope = (sessionEnd - sessionStart) / sessionStart;
    const sessionVolSlope = this.calculateVolatility(sessionCandles.slice(-10)) - 
                            this.calculateVolatility(sessionCandles.slice(0, 10));
    
    let sessionRegime: 'up' | 'down' | 'chop';
    if (sessionSlope > 0.02 && currentPrice > sessionVWAP) sessionRegime = 'up';
    else if (sessionSlope < -0.02 && currentPrice < sessionVWAP) sessionRegime = 'down';
    else sessionRegime = 'chop';
    
    console.log(`[DHMA] Features: OBI=${obi.toFixed(2)}, microTilt=${micropriceTilt.toFixed(2)}, flow=${signedFlowRatio.toFixed(2)}, tox=${toxicity.toFixed(2)}, burst=${burstRegime}, session=${sessionRegime}`);
    
    // Entry rules: block if toxicity too high or spread too wide
    if (toxicity > tau_toxicity) {
      console.log(`[DHMA] ❌ High toxicity ${toxicity.toFixed(2)} > ${tau_toxicity}`);
      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "dhma",
        inputSnapshot: { currentPrice, toxicity, tau_toxicity },
        output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null, rejectionReason: "high_toxicity" }
      }));
      setNullReason('toxicity_high');
      return null;
    }
    
    if (spreadTicks > maxSpread) {
      console.log(`[DHMA] ❌ Wide spread ${spreadTicks.toFixed(1)}t > ${maxSpread}t`);
      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "dhma",
        inputSnapshot: { currentPrice, spreadTicks, maxSpread },
        output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null, rejectionReason: "wide_spread" }
      }));
      setNullReason('spread_wide');
      return null;
    }
    
    // Long entry: burst & session agree, OBI positive, microprice tilt positive
    const longSignal = (
      burstRegime === 'long' &&
      sessionRegime === 'up' &&
      obi > theta_OBI &&
      micropriceTilt > epsilon_micro &&
      signedFlowRatio > 0.2
    );
    
    // Short entry: burst & session agree, OBI negative, microprice tilt negative
    const shortSignal = (
      burstRegime === 'short' &&
      sessionRegime === 'down' &&
      obi < -theta_OBI &&
      micropriceTilt < -epsilon_micro &&
      signedFlowRatio < -0.2
    );
    
    // Batch 45: Block short signals — system is long-only
    if (!longSignal) {
      setNullReason(shortSignal ? 'short_disabled_long_only' : 'regime_alignment');
      console.log(`[DHMA] ❌ ${shortSignal ? 'Short signal blocked (long-only system)' : 'No regime alignment'}`);
      console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
        symbol: "(pending)",
        strategy: "dhma",
        inputSnapshot: { currentPrice, obi, micropriceTilt, burstRegime, sessionRegime },
        output: { hasSignal: false, entryPrice: null, stopPrice: null, targetPrice: null, confidence: null }
      }));
      return null;
    }

    // Calculate entry/stop/target (long only)
    const realizedVol = recentVolatility;
    const entryPrice = currentPrice * 1.001;
    const stopPrice = currentPrice - k_tp * realizedVol;
    const targetPrice = currentPrice + k_tp * realizedVol;
    
    // Confidence calculation
    let confidence = 0.6;
    confidence += Math.abs(obi) * 0.15;
    confidence += Math.abs(signedFlowRatio) * 0.1;
    confidence -= toxicity * 0.15;
    confidence = Math.max(0.3, Math.min(0.9, confidence));
    
    // REB 2.12D: Multi-timeframe confirmation for DHMA
    // This is called synchronously since we need the adjustment immediately
    // Note: In production, this would be async but for now we log the intent
    console.log(`[REB2.12D][DHMA] Pre-MTF confidence: ${(confidence * 100).toFixed(0)}%`);
    
    // Apply MTF adjustment based on trend direction matching
    // If burst/session regimes agree with 15m/1h trends, boost confidence
    const mtfAdjustment = (burstRegime === 'long' && sessionRegime === 'up') || 
                          (burstRegime === 'short' && sessionRegime === 'down') ? 0.10 : -0.10;
    confidence += mtfAdjustment;
    confidence = Math.max(0.3, Math.min(0.95, confidence));
    
    const direction = longSignal ? 'long' : 'short';
    const valid = confidence >= 0.5;
    
    console.log(`[REB2.12D][DHMA] { symbol: "${indicators.currentPrice.toFixed(2)}", confidence: ${(confidence * 100).toFixed(0)}%, direction: "${direction}", valid: ${valid} }`);
    console.log(`[DHMA] ✅ Signal ${direction} - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}, Confidence: ${(confidence * 100).toFixed(0)}%`);
    
    const signal: StrategySignal = {
      symbol: '',
      strategy: 'dhma' as const,
      entryPrice,
      stopPrice,
      targetPrice,
      confidence,
      metadata: {
        obi,
        micropriceTilt,
        signedFlowRatio,
        toxicity,
        spreadTicks,
        burstRegime,
        sessionRegime,
        k_tp,
        realizedVolatility: realizedVol
      }
    };

    console.log("[8.8.3-B][STRATEGY]", JSON.stringify({
      symbol: "(pending)",
      strategy: "dhma",
      inputSnapshot: { currentPrice, obi, micropriceTilt, burstRegime, sessionRegime },
      output: { hasSignal: true, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, confidence: signal.confidence }
    }));
    
    // Phase 41F-I: Record signal emission metric (non-blocking)
    telemetryService.recordTradeMetric('signal_emit', {
      strategy: 'dhma',
      strength: confidence,
      direction: longSignal ? 'long' : 'short'
    }).catch(err => console.error('[Strategy] Telemetry error:', err));
    
    return signal;
  }

  // ═══════════════════════════════════════════════════════════════
  // Directive 12.3.2: 8 New Strategy Detection Methods
  // Each delegates to its corresponding module in server/strategies/
  // ═══════════════════════════════════════════════════════════════

  /**
   * Directive 12.3.2: Morning Star / Evening Star (PATTERN)
   * 3-bar reversal pattern with volume confirmation
   */
  detectMorningStar(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null
  ): StrategySignal | null {
    return detectMorningStar(indicators, candles, patternSignal);
  }

  /**
   * Directive 12.3.2: Inside Bar Reversal (PATTERN)
   * Compression breakout with BUY/SELL support
   */
  detectInsideBarReversal(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null
  ): StrategySignal | null {
    return detectInsideBarReversal(indicators, candles, patternSignal);
  }

  /**
   * Directive 12.3.2: Support Bounce (PATTERN)
   * Multi-touch support level with pinbar confirmation
   */
  detectSupportBounce(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null
  ): StrategySignal | null {
    return detectSupportBounce(indicators, candles, patternSignal);
  }

  /**
   * Directive 12.3.2: Pivot Shift (HYBRID)
   * RSI neutral zone + ADX acceleration with MORNING_STAR pattern
   */
  detectPivotShift(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null
  ): StrategySignal | null {
    return detectPivotShift(indicators, candles, patternSignal);
  }

  /**
   * Directive 12.3.2: Reverse Impulse (HYBRID)
   * Counter-trend bounce after momentum exhaustion
   */
  detectReverseImpulse(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null
  ): StrategySignal | null {
    return detectReverseImpulse(indicators, candles, patternSignal);
  }

  /**
   * Directive 12.3.2: Defensive Hedge (HYBRID)
   * Decorrelated asset selection in bear volatile regime
   */
  detectDefensiveHedge(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null,
    btcCandles?: PriceData[]
  ): StrategySignal | null {
    return detectDefensiveHedge(indicators, candles, patternSignal, btcCandles);
  }

  /**
   * Directive 12.3.2: Adaptive Flow (HYBRID)
   * Momentum inversion detection in low-vol chop
   */
  detectAdaptiveFlow(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null
  ): StrategySignal | null {
    return detectAdaptiveFlow(indicators, candles, patternSignal);
  }

  /**
   * Directive 12.3.2: Volatility Edge (HYBRID)
   * ABCD pattern with volatility premium in high-vol impulse
   */
  detectVolatilityEdge(
    indicators: TechnicalIndicators,
    candles: PriceData[],
    patternSignal: PatternInput | null
  ): StrategySignal | null {
    return detectVolatilityEdge(indicators, candles, patternSignal);
  }

  private calculateVolatility(data: PriceData[]): number {
    if (data.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < data.length; i++) {
      const r = (parseFloat(data[i].close) - parseFloat(data[i-1].close)) / parseFloat(data[i-1].close);
      returns.push(r);
    }
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }
}
