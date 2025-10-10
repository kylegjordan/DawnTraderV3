import { Trade, TradingSettings, PriceData } from '@shared/schema';
import { storage } from '../storage';

export interface StrategySignal {
  symbol: string;
  strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride';
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
    const pullbackThreshold = parseFloat(settings.vwapPullbackThreshold || '2.0') / 100; // Default 2%
    const volumeMultiplier = parseFloat(settings.vwapVolumeMultiplier || '1.5'); // Default 1.5x
    const maxHoldingPeriod = settings.vwapMaxHoldingPeriod || 24; // Default 24 bars
    
    console.log(`[VWAP Strategy] Using settings: pullback=${(pullbackThreshold*100).toFixed(1)}%, volumeMultiplier=${volumeMultiplier}x, maxHold=${maxHoldingPeriod} bars`);
    
    // Rules: Price above VWAP; pullback to VWAP within threshold; volume confirmation; bullish reversal
    const priceAboveVWAP = currentPrice > vwap;
    const nearVWAP = Math.abs(currentPrice - vwap) / vwap <= pullbackThreshold; // ✅ Using user setting
    const hasReversalPattern = this.detectBullishReversal(indicators);
    
    // ✅ Volume confirmation using user setting (volumeMultiplier)
    // Calculate average volume from prior 20 candles (or available history)
    let avgVolume = volume; // Fallback if no history available
    if (priceHistory && priceHistory.length >= 20) {
      const recentCandles = priceHistory.slice(-20);
      const totalVolume = recentCandles.reduce((sum, candle) => sum + parseFloat(candle.volume || '0'), 0);
      avgVolume = totalVolume / recentCandles.length;
    }
    const hasVolumeConfirmation = volume >= avgVolume * volumeMultiplier;
    
    if (priceAboveVWAP && nearVWAP && hasReversalPattern && hasVolumeConfirmation) {
      const entryPrice = currentPrice * 1.001; // Slight premium for entry
      const stopPrice = Math.min(vwap * 0.997, low24h * 1.001); // Below VWAP or pullback low
      const targetPrice = high24h * 0.995; // Near prior swing high
      
      // Alternative target: +2R
      const riskDistance = entryPrice - stopPrice;
      const twoRTarget = entryPrice + (riskDistance * 2);
      const finalTarget = Math.min(targetPrice, twoRTarget);
      
      console.log(`[VWAP Strategy] ✅ Signal generated - Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${finalTarget.toFixed(2)}`);
      
      return {
        symbol: '', // Will be set by caller
        strategy: 'vwap_pullback',
        entryPrice,
        stopPrice,
        targetPrice: finalTarget,
        confidence: 0.7 + (hasReversalPattern ? 0.2 : 0),
        metadata: {
          vwap,
          nearVWAPPercent: Math.abs(currentPrice - vwap) / vwap * 100,
          reversalConfirmed: hasReversalPattern,
          volumeMultiplier,
          maxHoldingPeriod, // ✅ Including for exit condition checks
          appliedPullbackThreshold: pullbackThreshold * 100
        }
      };
    }
    
    console.log(`[VWAP Strategy] ❌ No signal - priceAboveVWAP=${priceAboveVWAP}, nearVWAP=${nearVWAP}, reversal=${hasReversalPattern}, volume=${hasVolumeConfirmation}`);
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
    
    if (priceHistory.length < minConsolidation + 10) return null;
    
    const recent = priceHistory.slice(-(minConsolidation + 10));
    const current = recent[recent.length - 1];
    
    // Simplified ABCD pattern detection
    // A = spike, B = pullback, C = higher low above VWAP, D = breakout
    
    const aPoint = this.findSpike(recent.slice(0, 10));
    if (!aPoint) return null;
    
    const bPoint = this.findPullback(recent.slice(5, 15), aPoint);
    if (!bPoint) return null;
    
    // ✅ Using user-configured consolidation period
    const cPoint = this.findHigherLow(recent.slice(10, 10 + minConsolidation), bPoint);
    if (!cPoint || !current.vwap || parseFloat(cPoint.close) < parseFloat(current.vwap)) return null;
    
    // ✅ Check for breakout using user-configured threshold
    const cHigh = parseFloat(cPoint.high);
    const currentPrice = parseFloat(current.close);
    const currentVolume = parseFloat(current.volume);
    const isBreakout = currentPrice > cHigh * (1 + breakoutThreshold);
    
    // ✅ Volume confirmation using user setting
    const avgVolume = parseFloat(aPoint.volume); // Using spike volume as reference
    const hasVolumeConfirmation = currentVolume >= avgVolume * volumeMultiplier;
    
    if (isBreakout && hasVolumeConfirmation) {
      const entryPrice = cHigh * (1 + breakoutThreshold + 0.003); // Buy stop above breakout level
      const stopPrice = parseFloat(cPoint.low) * 0.998; // Below C low
      
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
      
      return {
        symbol: '',
        strategy: 'abcd_long',
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
    }
    
    console.log(`[ABCD Strategy] ❌ No signal - breakout=${isBreakout}, volumeConfirmed=${hasVolumeConfirmation}`);
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
    
    if (!sma || priceHistory.length < 10) return null;
    
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
      
      return {
        symbol: '',
        strategy: 'sma_trend_ride',
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
    }
    
    console.log(`[SMA Strategy] ❌ No signal - entryCondition=${entryCondition}, entrySignal=${entrySignal}`);
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

  // Helper methods
  private detectBullishReversal(indicators: TechnicalIndicators): boolean {
    // Simplified reversal detection - in reality this would be more sophisticated
    const { currentPrice, low24h, volume } = indicators;
    const nearLow = (currentPrice - low24h) / low24h < 0.02; // Within 2% of low
    const highVolume = volume > 0; // Placeholder - would need volume comparison
    
    return nearLow && highVolume;
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
}
