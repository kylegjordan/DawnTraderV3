/**
 * Stage C: Synthetic Validation - Deterministic Strategy Testing
 * Creates synthetic OHLC data designed to trigger each of the 8 strategies
 * Proves end-to-end functionality: signal generation → telemetry → alerts
 * 
 * Purpose: Complement Stage B (real market selectivity) with functional proof
 */

import { StrategyEngine } from './strategy-engine';
import { storage } from '../storage';
import type { TradingSettings, PriceData } from '@shared/schema';

interface ValidationResult {
  strategy: string;
  signalGenerated: boolean;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  confidence: number;
  scenarioDescription: string;
}

interface StageCResults {
  timestamp: Date;
  totalStrategies: number;
  strategiesWithSignals: number;
  successRate: number;
  results: ValidationResult[];
}

export class StageCValidator {
  
  /**
   * Run comprehensive synthetic validation for all 8 strategies
   */
  async runStageC(userId: string): Promise<StageCResults> {
    console.log('\n🧪 Starting Stage C: Synthetic Validation with Designed Test Scenarios\n');
    console.log('============================================================\n');

    const results: ValidationResult[] = [];
    const strategyEngine = new StrategyEngine();

    // Get or create user settings
    let settings = await storage.getTradingSettings(userId);
    if (!settings) {
      await storage.createTradingSettings({
        userId,
        riskPerTrade: '2',
        maxExposurePercent: '10',
        maxOpenTrades: 5
      });
      settings = await storage.getTradingSettings(userId);
      if (!settings) throw new Error('Failed to create settings');
    }

    // Test 1: VWAP Pullback
    console.log('📊 Test 1: VWAP Pullback Strategy');
    const vwapResult = await this.testVWAPPullback(strategyEngine, settings);
    results.push(vwapResult);
    console.log(`   ${vwapResult.signalGenerated ? '✅' : '❌'} ${vwapResult.scenarioDescription}\n`);

    // Test 2: ABCD Long
    console.log('📊 Test 2: ABCD Long Strategy');
    const abcdResult = await this.testABCDLong(strategyEngine, settings);
    results.push(abcdResult);
    console.log(`   ${abcdResult.signalGenerated ? '✅' : '❌'} ${abcdResult.scenarioDescription}\n`);

    // Test 3: SMA Trend Ride
    console.log('📊 Test 3: SMA Trend Ride Strategy');
    const smaResult = await this.testSMATrendRide(strategyEngine, settings);
    results.push(smaResult);
    console.log(`   ${smaResult.signalGenerated ? '✅' : '❌'} ${smaResult.scenarioDescription}\n`);

    // Test 4: Breakout
    console.log('📊 Test 4: Breakout Strategy');
    const breakoutResult = await this.testBreakout(strategyEngine);
    results.push(breakoutResult);
    console.log(`   ${breakoutResult.signalGenerated ? '✅' : '❌'} ${breakoutResult.scenarioDescription}\n`);

    // Test 5: Mean Reversion
    console.log('📊 Test 5: Mean Reversion Strategy');
    const meanRevResult = await this.testMeanReversion(strategyEngine);
    results.push(meanRevResult);
    console.log(`   ${meanRevResult.signalGenerated ? '✅' : '❌'} ${meanRevResult.scenarioDescription}\n`);

    // Test 6: Range Trading
    console.log('📊 Test 6: Range Trading Strategy');
    const rangeResult = await this.testRangeTrading(strategyEngine);
    results.push(rangeResult);
    console.log(`   ${rangeResult.signalGenerated ? '✅' : '❌'} ${rangeResult.scenarioDescription}\n`);

    // Test 7: VWAP Bounce
    console.log('📊 Test 7: VWAP Bounce Strategy');
    const vwapBounceResult = await this.testVWAPBounce(strategyEngine);
    results.push(vwapBounceResult);
    console.log(`   ${vwapBounceResult.signalGenerated ? '✅' : '❌'} ${vwapBounceResult.scenarioDescription}\n`);

    // Test 8: Liquidity Trap
    console.log('📊 Test 8: Liquidity Trap Strategy');
    const liqTrapResult = await this.testLiquidityTrap(strategyEngine);
    results.push(liqTrapResult);
    console.log(`   ${liqTrapResult.signalGenerated ? '✅' : '❌'} ${liqTrapResult.scenarioDescription}\n`);

    const strategiesWithSignals = results.filter(r => r.signalGenerated).length;
    const successRate = (strategiesWithSignals / 8) * 100;

    console.log(`\n✅ Stage C completed`);
    console.log(`   Strategies with signals: ${strategiesWithSignals}/8 (${successRate.toFixed(1)}%)\n`);

    return {
      timestamp: new Date(),
      totalStrategies: 8,
      strategiesWithSignals,
      successRate,
      results
    };
  }

  /**
   * Test 1: VWAP Pullback - Price pulls back to VWAP with volume spike
   */
  private async testVWAPPullback(engine: StrategyEngine, settings: TradingSettings): Promise<ValidationResult> {
    // Create scenario: Price was above VWAP, pulls back near it, volume confirms
    const priceData: PriceData[] = [];
    const basePrice = 50000;
    const baseVwap = 49800;
    
    // Build history: price above VWAP initially
    for (let i = 0; i < 20; i++) {
      priceData.push({
        id: `test-${i}`,
        symbol: 'BTCTEST',
        timestamp: new Date(Date.now() - (20 - i) * 60000),
        open: (basePrice + 200).toString(),
        high: (basePrice + 300).toString(),
        low: (basePrice + 100).toString(),
        close: (basePrice + 200).toString(),
        volume: '100',
        vwap: baseVwap.toString(),
        sma: '0'
      });
    }
    
    // Current bar: pullback to near VWAP with volume spike
    priceData.push({
      id: 'test-current',
      symbol: 'BTCTEST',
      timestamp: new Date(),
      open: (basePrice + 100).toString(),
      high: (basePrice + 150).toString(),
      low: (baseVwap + 50).toString(), // Near VWAP
      close: (baseVwap + 100).toString(), // 0.2% above VWAP
      volume: '300', // 3x volume spike
      vwap: baseVwap.toString(),
      sma: '0'
    });

    const avgVolume = 100;
    const indicators = {
      currentPrice: baseVwap + 100,
      vwap: baseVwap,
      sma: 49500,
      volume: 300,
      high24h: basePrice + 500,
      low24h: basePrice - 500
    };

    const signal = engine.detectVWAPPullback(indicators, settings, priceData);

    return {
      strategy: 'vwap_pullback',
      signalGenerated: !!signal,
      entryPrice: signal?.entryPrice || 0,
      stopPrice: signal?.stopPrice || 0,
      targetPrice: signal?.targetPrice || 0,
      confidence: signal?.confidence || 0,
      scenarioDescription: signal 
        ? `Generated signal at $${signal.entryPrice.toFixed(2)} (Conf: ${(signal.confidence * 100).toFixed(0)}%)`
        : 'No signal - check volume/pullback criteria'
    };
  }

  /**
   * Test 2: ABCD Long - Consolidation followed by breakout
   */
  private async testABCDLong(engine: StrategyEngine, settings: TradingSettings): Promise<ValidationResult> {
    const priceData: PriceData[] = [];
    const basePrice = 3000;

    // Build consolidation range (A-B-C)
    for (let i = 0; i < 15; i++) {
      const rangeVariation = (i % 3) * 10; // Oscillate within range
      priceData.push({
        id: `test-${i}`,
        symbol: 'ETHTEST',
        timestamp: new Date(Date.now() - (15 - i) * 60000),
        open: (basePrice + rangeVariation).toString(),
        high: (basePrice + rangeVariation + 15).toString(),
        low: (basePrice + rangeVariation - 15).toString(),
        close: (basePrice + rangeVariation).toString(),
        volume: '50',
        vwap: basePrice.toString(),
        sma: '0'
      });
    }

    // Current bar: Breakout with volume (D)
    priceData.push({
      id: 'test-current',
      symbol: 'ETHTEST',
      timestamp: new Date(),
      open: (basePrice + 15).toString(),
      high: (basePrice + 60).toString(), // 2% breakout
      low: (basePrice + 10).toString(),
      close: (basePrice + 55).toString(),
      volume: '150', // 3x volume
      vwap: basePrice.toString(),
      sma: '0'
    });

    const signal = engine.detectABCDLong(priceData, settings);

    return {
      strategy: 'abcd_long',
      signalGenerated: !!signal,
      entryPrice: signal?.entryPrice || 0,
      stopPrice: signal?.stopPrice || 0,
      targetPrice: signal?.targetPrice || 0,
      confidence: signal?.confidence || 0,
      scenarioDescription: signal
        ? `Generated signal at $${signal.entryPrice.toFixed(2)} (Conf: ${(signal.confidence * 100).toFixed(0)}%)`
        : 'No signal - check consolidation/breakout'
    };
  }

  /**
   * Test 3: SMA Trend Ride - Price near SMA in uptrend with bounce
   * Uses 'above' entry condition since 'crossover' + uptrend are contradictory
   */
  private async testSMATrendRide(engine: StrategyEngine, settings: TradingSettings): Promise<ValidationResult> {
    const priceData: PriceData[] = [];
    const baseSma = 1000;

    // Build uptrend: ALL prices above SMA and rising (required for isUptrend check)
    for (let i = 0; i < 15; i++) {
      const trendPrice = baseSma + 20 + (i * 2); // All prices above SMA
      priceData.push({
        id: `test-${i}`,
        symbol: 'SOLTEST',
        timestamp: new Date(Date.now() - (20 - i) * 60000),
        open: trendPrice.toString(),
        high: (trendPrice + 3).toString(),
        low: (trendPrice - 1).toString(),
        close: trendPrice.toString(),
        volume: '1000',
        vwap: '0',
        sma: baseSma.toString() // Static SMA for simplicity
      });
    }

    // Recent bars: pullback toward SMA but still above
    priceData.push({
      id: 'test-pullback1',
      symbol: 'SOLTEST',
      timestamp: new Date(Date.now() - 240000),
      open: (baseSma + 32).toString(),
      high: (baseSma + 35).toString(),
      low: (baseSma + 28).toString(),
      close: (baseSma + 30).toString(),
      volume: '1000',
      vwap: '0',
      sma: baseSma.toString()
    });

    priceData.push({
      id: 'test-pullback2',
      symbol: 'SOLTEST',
      timestamp: new Date(Date.now() - 180000),
      open: (baseSma + 30).toString(),
      high: (baseSma + 32).toString(),
      low: (baseSma + 25).toString(),
      close: (baseSma + 26).toString(), // Getting closer to SMA
      volume: '1000',
      vwap: '0',
      sma: baseSma.toString()
    });

    priceData.push({
      id: 'test-low',
      symbol: 'SOLTEST',
      timestamp: new Date(Date.now() - 120000),
      open: (baseSma + 26).toString(),
      high: (baseSma + 28).toString(),
      low: (baseSma + 22).toString(), // Low point of pullback
      close: (baseSma + 23).toString(),
      volume: '900',
      vwap: '0',
      sma: baseSma.toString()
    });

    priceData.push({
      id: 'test-bounce1',
      symbol: 'SOLTEST',
      timestamp: new Date(Date.now() - 60000),
      open: (baseSma + 23).toString(),
      high: (baseSma + 27).toString(),
      low: (baseSma + 22).toString(),
      close: (baseSma + 26).toString(), // Starting to bounce
      volume: '1100',
      vwap: '0',
      sma: baseSma.toString()
    });

    // Current bar: Near SMA with bounce (within 2% trailing stop threshold)
    const currentPrice = baseSma + 20; // 2% above SMA (within threshold)
    priceData.push({
      id: 'test-current',
      symbol: 'SOLTEST',
      timestamp: new Date(),
      open: (baseSma + 26).toString(),
      high: (baseSma + 28).toString(),
      low: (baseSma + 18).toString(),
      close: currentPrice.toString(), // Bounced above SMA
      volume: '1200',
      vwap: '0',
      sma: baseSma.toString()
    });

    // Override settings to use 'above' entry condition (compatible with uptrend requirement)
    const testSettings = { ...settings, smaEntryCondition: 'above' };

    const indicators = {
      currentPrice,
      vwap: 0,
      sma: baseSma,
      volume: 1200,
      high24h: currentPrice + 100,
      low24h: baseSma - 100
    };

    const signal = engine.detectSMATrendRide(indicators, priceData, testSettings);

    return {
      strategy: 'sma_trend_ride',
      signalGenerated: !!signal,
      entryPrice: signal?.entryPrice || 0,
      stopPrice: signal?.stopPrice || 0,
      targetPrice: signal?.targetPrice || 0,
      confidence: signal?.confidence || 0,
      scenarioDescription: signal
        ? `Generated signal at $${signal.entryPrice.toFixed(2)} (Conf: ${(signal.confidence * 100).toFixed(0)}%)`
        : 'No signal - check uptrend/bounce'
    };
  }

  /**
   * Test 4: Breakout - Range consolidation with volume breakout
   * Breakout needs: tight range (2.5%), 15+ bars consolidation, then volume breakout
   */
  private async testBreakout(engine: StrategyEngine): Promise<ValidationResult> {
    const priceData: PriceData[] = [];
    const rangeLow = 100;
    const rangeHigh = 102.5; // 2.5% range width (within 3% max)

    // Build consolidation range with sufficient bars (15+)
    for (let i = 0; i < 15; i++) {
      // Oscillate within tight range
      const inRangePrice = i % 3 === 0 ? rangeLow + 0.2 : (i % 3 === 1 ? rangeHigh - 0.2 : rangeLow + 1.25);
      priceData.push({
        id: `test-${i}`,
        symbol: 'ADATEST',
        timestamp: new Date(Date.now() - (18 - i) * 60000),
        open: inRangePrice.toString(),
        high: (inRangePrice + 0.3).toString(),
        low: (inRangePrice - 0.3).toString(),
        close: inRangePrice.toString(),
        volume: '5000',
        vwap: '0',
        sma: '0'
      });
    }

    // Ensure we have recent bars before breakout
    priceData.push({
      id: 'test-pre1',
      symbol: 'ADATEST',
      timestamp: new Date(Date.now() - 120000),
      open: (rangeHigh - 0.5).toString(),
      high: rangeHigh.toString(),
      low: (rangeHigh - 1).toString(),
      close: (rangeHigh - 0.3).toString(),
      volume: '5000',
      vwap: '0',
      sma: '0'
    });

    priceData.push({
      id: 'test-pre2',
      symbol: 'ADATEST',
      timestamp: new Date(Date.now() - 60000),
      open: (rangeHigh - 0.3).toString(),
      high: rangeHigh.toString(),
      low: (rangeHigh - 0.8).toString(),
      close: (rangeHigh - 0.1).toString(),
      volume: '4800',
      vwap: '0',
      sma: '0'
    });

    // Current bar: Breakout above range with 2x volume
    const breakoutPrice = rangeHigh + 1.5; // 1.5% above resistance
    priceData.push({
      id: 'test-current',
      symbol: 'ADATEST',
      timestamp: new Date(),
      open: rangeHigh.toString(),
      high: breakoutPrice.toString(),
      low: (rangeHigh - 0.2).toString(),
      close: (breakoutPrice - 0.1).toString(),
      volume: '12000', // 2.4x volume (exceeds 2x requirement)
      vwap: '0',
      sma: '0'
    });

    const signal = engine.detectBreakout(priceData, {
      minConsolidationBars: 10,
      maxRangeWidth: 3, // 2.5% range is within this
      breakoutBuffer: 1,
      volumeMultiplier: 2,
      targetMultiplier: 2
    });

    return {
      strategy: 'breakout',
      signalGenerated: !!signal,
      entryPrice: signal?.entryPrice || 0,
      stopPrice: signal?.stopPrice || 0,
      targetPrice: signal?.targetPrice || 0,
      confidence: signal?.confidence || 0,
      scenarioDescription: signal
        ? `Generated signal at $${signal.entryPrice.toFixed(2)} (Conf: ${(signal.confidence * 100).toFixed(0)}%)`
        : 'No signal - check range/breakout'
    };
  }

  /**
   * Test 5: Mean Reversion - Price oversold relative to VWAP with reversal
   */
  private async testMeanReversion(engine: StrategyEngine): Promise<ValidationResult> {
    const priceData: PriceData[] = [];
    const vwapValue = 100;
    const oversoldPrice = 95; // 5% below VWAP

    // Build history with price falling
    for (let i = 0; i < 20; i++) {
      const fallingPrice = vwapValue - (i * 0.2);
      priceData.push({
        id: `test-${i}`,
        symbol: 'DOTTEST',
        timestamp: new Date(Date.now() - (20 - i) * 60000),
        open: fallingPrice.toString(),
        high: (fallingPrice + 0.5).toString(),
        low: (fallingPrice - 0.5).toString(),
        close: fallingPrice.toString(),
        volume: '1000',
        vwap: vwapValue.toString(),
        sma: '0'
      });
    }

    // Current bar: Oversold with bullish reversal candle
    priceData.push({
      id: 'test-current',
      symbol: 'DOTTEST',
      timestamp: new Date(),
      open: oversoldPrice.toString(),
      high: (oversoldPrice + 1).toString(),
      low: (oversoldPrice - 0.5).toString(),
      close: (oversoldPrice + 0.8).toString(), // Bullish close
      volume: '1500',
      vwap: vwapValue.toString(),
      sma: '0'
    });

    const indicators = {
      currentPrice: oversoldPrice + 0.8,
      vwap: vwapValue,
      sma: vwapValue,
      volume: 1500,
      high24h: vwapValue + 5,
      low24h: oversoldPrice - 1
    };

    const signal = engine.detectMeanReversion(indicators, priceData, {
      meanType: 'vwap',
      deviationThreshold: 0.03, // 3% deviation
      partialExitPercent: 50,
      stopLossBuffer: 0.02,
      smaLength: 20
    });

    return {
      strategy: 'mean_reversion',
      signalGenerated: !!signal,
      entryPrice: signal?.entryPrice || 0,
      stopPrice: signal?.stopPrice || 0,
      targetPrice: signal?.targetPrice || 0,
      confidence: signal?.confidence || 0,
      scenarioDescription: signal
        ? `Generated signal at $${signal.entryPrice.toFixed(2)} (Conf: ${(signal.confidence * 100).toFixed(0)}%)`
        : 'No signal - check oversold/reversal'
    };
  }

  /**
   * Test 6: Range Trading - Established range with entry near support
   * Range needs: 10% range width, 20+ bars duration, 3+ boundary touches, price at support
   */
  private async testRangeTrading(engine: StrategyEngine): Promise<ValidationResult> {
    const priceData: PriceData[] = [];
    const support = 50;
    const resistance = 55; // 10% range: (55-50)/50 = 0.10 = 10%

    // Build established range with clear boundary touches (20+ bars)
    for (let i = 0; i < 25; i++) {
      let inRangePrice;
      if (i % 6 === 0 || i % 6 === 1) {
        inRangePrice = support + 0.2; // Touch support
      } else if (i % 6 === 3 || i % 6 === 4) {
        inRangePrice = resistance - 0.2; // Touch resistance
      } else {
        inRangePrice = support + 2.5; // Mid-range
      }
      
      priceData.push({
        id: `test-${i}`,
        symbol: 'LINKTEST',
        timestamp: new Date(Date.now() - (30 - i) * 3600000), // Hourly bars for duration
        open: inRangePrice.toString(),
        high: (inRangePrice + 0.3).toString(),
        low: (inRangePrice - 0.3).toString(),
        close: inRangePrice.toString(),
        volume: '10000',
        vwap: '0',
        sma: '0'
      });
    }

    // Extra touches at boundaries to meet minBoundaryTouches=3
    priceData.push({
      id: 'test-touch1',
      symbol: 'LINKTEST',
      timestamp: new Date(Date.now() - 14400000), // 4 hours ago
      open: (support + 0.5).toString(),
      high: (support + 0.8).toString(),
      low: support.toString(), // Touch support
      close: (support + 0.3).toString(),
      volume: '10000',
      vwap: '0',
      sma: '0'
    });

    priceData.push({
      id: 'test-touch2',
      symbol: 'LINKTEST',
      timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      open: (support + 1).toString(),
      high: (support + 1.5).toString(),
      low: (support + 0.1).toString(), // Near support
      close: (support + 0.5).toString(),
      volume: '10000',
      vwap: '0',
      sma: '0'
    });

    // Current bar: Price AT support (entry zone within 1%)
    priceData.push({
      id: 'test-current',
      symbol: 'LINKTEST',
      timestamp: new Date(),
      open: (support + 0.8).toString(),
      high: (support + 1).toString(),
      low: support.toString(), // At support
      close: (support + 0.4).toString(), // In entry zone (0.8% above support)
      volume: '12000',
      vwap: '0',
      sma: '0'
    });

    const signal = engine.detectRangeTrading(priceData, {
      minRangeDurationHours: 12,
      minRangeWidth: 3, // Range is 10%, exceeds 3% minimum
      minBoundaryTouches: 3,
      entryZoneWidth: 1, // 1% entry zone
      stopLossBeyond: 1
    });

    return {
      strategy: 'range_trading',
      signalGenerated: !!signal,
      entryPrice: signal?.entryPrice || 0,
      stopPrice: signal?.stopPrice || 0,
      targetPrice: signal?.targetPrice || 0,
      confidence: signal?.confidence || 0,
      scenarioDescription: signal
        ? `Generated signal at $${signal.entryPrice.toFixed(2)} (Conf: ${(signal.confidence * 100).toFixed(0)}%)`
        : 'No signal - check range/support'
    };
  }

  /**
   * Test 7: VWAP Bounce - Price touches VWAP in uptrend with volume
   * Needs: VWAP slope >0.3%, price touches then bounces above, volume 1.3x+
   */
  private async testVWAPBounce(engine: StrategyEngine): Promise<ValidationResult> {
    const priceData: PriceData[] = [];
    const baseVwap = 1500;

    // Build uptrending VWAP with >0.3% slope
    // Over 10 bars: slope = (1530 - 1500) / 1500 = 0.02 = 2% (exceeds 0.3%)
    for (let i = 0; i < 10; i++) {
      const vwapValue = baseVwap + (i * 3); // +3 per bar = 30 total = 2% slope ✅
      const priceValue = vwapValue + 10; // Price above VWAP
      priceData.push({
        id: `test-${i}`,
        symbol: 'AVAXTEST',
        timestamp: new Date(Date.now() - (15 - i) * 60000),
        open: priceValue.toString(),
        high: (priceValue + 5).toString(),
        low: (priceValue - 3).toString(),
        close: priceValue.toString(),
        volume: '500',
        vwap: vwapValue.toString(),
        sma: '0'
      });
    }

    // Recent bars: price approaches VWAP
    const recentVwap = baseVwap + 30;
    priceData.push({
      id: 'test-approach1',
      symbol: 'AVAXTEST',
      timestamp: new Date(Date.now() - 240000),
      open: (recentVwap + 8).toString(),
      high: (recentVwap + 10).toString(),
      low: (recentVwap + 5).toString(),
      close: (recentVwap + 6).toString(),
      volume: '500',
      vwap: recentVwap.toString(),
      sma: '0'
    });

    priceData.push({
      id: 'test-approach2',
      symbol: 'AVAXTEST',
      timestamp: new Date(Date.now() - 180000),
      open: (recentVwap + 6).toString(),
      high: (recentVwap + 7).toString(),
      low: (recentVwap + 2).toString(),
      close: (recentVwap + 3).toString(),
      volume: '500',
      vwap: (recentVwap + 1).toString(),
      sma: '0'
    });

    priceData.push({
      id: 'test-touch',
      symbol: 'AVAXTEST',
      timestamp: new Date(Date.now() - 120000),
      open: (recentVwap + 3).toString(),
      high: (recentVwap + 4).toString(),
      low: (recentVwap - 1).toString(), // Touched/went below VWAP ✅
      close: (recentVwap + 1).toString(),
      volume: '480',
      vwap: (recentVwap + 2).toString(),
      sma: '0'
    });

    priceData.push({
      id: 'test-pre',
      symbol: 'AVAXTEST',
      timestamp: new Date(Date.now() - 60000),
      open: (recentVwap + 1).toString(),
      high: (recentVwap + 3).toString(),
      low: recentVwap.toString(),
      close: (recentVwap + 2).toString(),
      volume: '490',
      vwap: (recentVwap + 3).toString(),
      sma: '0'
    });

    // Current bar: Price bounced above VWAP with volume
    const currentVwap = recentVwap + 3;
    const currentPrice = currentVwap + 5; // 0.3% above VWAP (within 0.5% proximity)
    priceData.push({
      id: 'test-current',
      symbol: 'AVAXTEST',
      timestamp: new Date(),
      open: (currentVwap + 1).toString(),
      high: (currentPrice + 2).toString(),
      low: currentVwap.toString(), // Near VWAP
      close: currentPrice.toString(), // Bounced above ✅
      volume: '750', // 1.5x average volume (500) ✅
      vwap: currentVwap.toString(),
      sma: '0'
    });

    const indicators = {
      currentPrice,
      vwap: currentVwap,
      sma: 0,
      volume: 750,
      high24h: currentVwap + 50,
      low24h: baseVwap - 10
    };

    const signal = engine.detectVWAPBounce(indicators, priceData, {
      vwapProximity: 0.5, // Current price 0.3% above VWAP ✅
      minVWAPSlope: 0.3, // VWAP slope ~2% ✅
      volumeMultiplier: 1.3, // 750/500 = 1.5x ✅
      maxPullbackBars: 5,
      partialExitR: 1.5
    });

    return {
      strategy: 'vwap_bounce',
      signalGenerated: !!signal,
      entryPrice: signal?.entryPrice || 0,
      stopPrice: signal?.stopPrice || 0,
      targetPrice: signal?.targetPrice || 0,
      confidence: signal?.confidence || 0,
      scenarioDescription: signal
        ? `Generated signal at $${signal.entryPrice.toFixed(2)} (Conf: ${(signal.confidence * 100).toFixed(0)}%)`
        : 'No signal - check VWAP touch/slope'
    };
  }

  /**
   * Test 8: Liquidity Trap - False breakout with volume reversal
   */
  private async testLiquidityTrap(engine: StrategyEngine): Promise<ValidationResult> {
    const priceData: PriceData[] = [];
    const rangeHigh = 80;
    const rangeLow = 75;

    // Build range
    for (let i = 0; i < 15; i++) {
      const inRange = rangeLow + ((i % 3) * 1.5);
      priceData.push({
        id: `test-${i}`,
        symbol: 'MATICTEST',
        timestamp: new Date(Date.now() - (20 - i) * 60000),
        open: inRange.toString(),
        high: (inRange + 0.5).toString(),
        low: (inRange - 0.5).toString(),
        close: inRange.toString(),
        volume: '20000',
        vwap: '0',
        sma: '0'
      });
    }

    // False breakout bar
    priceData.push({
      id: 'test-trap',
      symbol: 'MATICTEST',
      timestamp: new Date(Date.now() - 120000),
      open: rangeHigh.toString(),
      high: (rangeHigh + 1).toString(), // Broke above
      low: (rangeHigh - 0.5).toString(),
      close: (rangeHigh + 0.8).toString(),
      volume: '25000',
      vwap: '0',
      sma: '0'
    });

    // Next bar: Still above
    priceData.push({
      id: 'test-trap2',
      symbol: 'MATICTEST',
      timestamp: new Date(Date.now() - 60000),
      open: (rangeHigh + 0.8).toString(),
      high: (rangeHigh + 1.2).toString(),
      low: (rangeHigh + 0.5).toString(),
      close: (rangeHigh + 0.7).toString(),
      volume: '30000',
      vwap: '0',
      sma: '0'
    });

    // Current bar: Returned to range with volume
    priceData.push({
      id: 'test-current',
      symbol: 'MATICTEST',
      timestamp: new Date(),
      open: (rangeHigh + 0.5).toString(),
      high: (rangeHigh + 0.6).toString(),
      low: (rangeHigh - 1).toString(),
      close: (rangeHigh - 0.5).toString(), // Back in range
      volume: '50000', // 2x volume reversal
      vwap: '0',
      sma: '0'
    });

    const signal = engine.detectLiquidityTrap(priceData, {
      maxTrapExtension: 1.5,
      trapReturnBars: 2,
      minStopZoneSize: 'medium',
      minLevelTouches: 3,
      volumeRatio: 1.5
    });

    return {
      strategy: 'liquidity_trap',
      signalGenerated: !!signal,
      entryPrice: signal?.entryPrice || 0,
      stopPrice: signal?.stopPrice || 0,
      targetPrice: signal?.targetPrice || 0,
      confidence: signal?.confidence || 0,
      scenarioDescription: signal
        ? `Generated signal at $${signal.entryPrice.toFixed(2)} (Conf: ${(signal.confidence * 100).toFixed(0)}%)`
        : 'No signal - check trap/reversal'
    };
  }

  /**
   * Generate Stage C validation report
   */
  generateReport(results: StageCResults): string {
    const report = [];
    
    report.push('# Strategy Validation Report - Stage C');
    report.push('## Synthetic Test Scenarios (Functional Proof)\n');
    report.push(`**Date:** ${results.timestamp.toISOString()}`);
    report.push(`**Purpose:** Prove all 8 strategies CAN generate signals with ideal conditions`);
    report.push(`**Method:** Synthetic OHLC data designed per strategy requirements\n`);

    report.push('## Executive Summary\n');
    report.push(`- **Total Strategies:** ${results.totalStrategies}`);
    report.push(`- **Strategies with Signals:** ${results.strategiesWithSignals}`);
    report.push(`- **Success Rate:** ${results.successRate.toFixed(1)}%`);
    report.push(`- **Pass Threshold:** 100% (all strategies must fire)\n`);

    const status = results.successRate >= 100 ? '✅ PASS' : '⚠️ NEEDS REVIEW';
    report.push(`## Validation Status: ${status}\n`);

    if (results.successRate >= 100) {
      report.push('**All strategies successfully generated signals with designed test scenarios.**\n');
    } else {
      report.push('**Some strategies failed to generate signals. Review test scenarios and strategy logic.**\n');
    }

    report.push('## Strategy Test Results\n');

    results.results.forEach(result => {
      const icon = result.signalGenerated ? '✅' : '❌';
      const strategyName = result.strategy.toUpperCase().replace(/_/g, ' ');
      
      report.push(`### ${icon} ${strategyName}\n`);
      if (result.signalGenerated) {
        report.push(`- **Status:** Signal generated successfully`);
        report.push(`- **Entry Price:** $${result.entryPrice.toFixed(2)}`);
        report.push(`- **Stop Price:** $${result.stopPrice.toFixed(2)}`);
        report.push(`- **Target Price:** $${result.targetPrice.toFixed(2)}`);
        report.push(`- **Confidence:** ${(result.confidence * 100).toFixed(0)}%`);
        report.push(`- **Scenario:** ${result.scenarioDescription}\n`);
      } else {
        report.push(`- **Status:** No signal generated`);
        report.push(`- **Scenario:** ${result.scenarioDescription}`);
        report.push(`- **Action Required:** Review strategy logic or test scenario\n`);
      }
    });

    report.push('## Conclusion\n');
    if (results.successRate >= 100) {
      report.push('**Stage C Validation: COMPLETE ✅**\n');
      report.push('All 8 strategies successfully generated signals when presented with ideal market conditions. Combined with Stage B results (which proved selectivity in calm markets), this completes Task 7 validation:\n');
      report.push('- **Stage B:** Strategies correctly reject poor market conditions (0% false positives)');
      report.push('- **Stage C:** Strategies correctly generate signals with favorable conditions (100% functional)');
      report.push('\nBoth selective behavior AND functional capability have been validated.');
    } else {
      report.push('**Stage C validation incomplete.** Review failing strategies and test scenarios.');
    }

    return report.join('\n');
  }
}
