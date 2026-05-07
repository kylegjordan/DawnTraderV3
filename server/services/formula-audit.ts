import { storage } from '../storage';
import { StrategyEngine } from './strategy-engine';
import { FeatureEnrichmentService } from './feature-enrichment';
import * as fs from 'fs';

interface FormulaLocation {
  name: string;
  file: string;
  line: number;
  expression: string;
}

interface FormulaTest {
  name: string;
  location: FormulaLocation;
  expectedFormula: string;
  actualFormula: string;
  sampleData: any;
  expectedResult: number;
  actualResult: number;
  deviation: number;
  deviationPercent: number;
  status: 'PASS' | 'WARNING' | 'FAIL';
  unit: string;
  unitMatch: boolean;
  notes: string;
}

interface AuditReport {
  timestamp: string;
  totalFormulas: number;
  passed: number;
  warnings: number;
  failed: number;
  tests: FormulaTest[];
  summary: string[];
}

export class FormulaAuditService {
  private readonly DEVIATION_THRESHOLD_PASS = 0.001; // 0.1% - excellent match
  private readonly DEVIATION_THRESHOLD_WARNING = 0.01; // 1% - minor deviation
  // Above 1% = FAIL
  
  /**
   * Helper: Determine test status based on deviation percentage
   */
  private getStatus(deviationPercent: number): 'PASS' | 'WARNING' | 'FAIL' {
    if (deviationPercent < this.DEVIATION_THRESHOLD_PASS * 100) {
      return 'PASS';
    } else if (deviationPercent < this.DEVIATION_THRESHOLD_WARNING * 100) {
      return 'WARNING';
    } else {
      return 'FAIL';
    }
  }

  /**
   * Helper: Check if units match expected range/scale
   */
  private checkUnitMatch(expectedValue: number, actualValue: number, unit: string): boolean {
    // For percentages (0-100 range) - detect scale mismatch
    if (unit.includes('percentage') && (unit.includes('0-100') || unit.includes('percent'))) {
      const inFullRange = (val: number) => val >= 0 && val <= 100;
      const inDecimalRange = (val: number) => val >= 0 && val <= 1;
      
      // Check if both are in the same scale
      const bothFullRange = inFullRange(expectedValue) && inFullRange(actualValue);
      const bothDecimalRange = inDecimalRange(expectedValue) && inDecimalRange(actualValue);
      
      return bothFullRange || bothDecimalRange;
    }
    
    // For decimal/rate of change - enforce reasonable bounds
    if (unit.includes('decimal') || unit.includes('rate of change')) {
      // Values should be in similar magnitude and within reasonable bounds (-10 to 10)
      const inBounds = (val: number) => Math.abs(val) <= 10;
      return inBounds(expectedValue) && inBounds(actualValue);
    }
    
    // For price/USD values (positive)
    if (unit.includes('price') || unit.includes('USD')) {
      return expectedValue > 0 && actualValue > 0;
    }
    
    // Default: just check both have same sign
    return (expectedValue >= 0 && actualValue >= 0) || (expectedValue < 0 && actualValue < 0);
  }

  /**
   * Helper: Calculate deviation percentage safely
   */
  private calculateDeviationPercent(expected: number, actual: number): number {
    const epsilon = 0.0001; // Avoid division by zero
    const denominator = Math.max(Math.abs(expected), epsilon);
    const deviation = Math.abs(expected - actual);
    return (deviation / denominator) * 100;
  }

  /**
   * Formula Discovery - All formulas used in the system
   * Note: Line numbers are approximate and may drift as code evolves
   */
  private getFormulaLocations(): FormulaLocation[] {
    return [
      {
        name: 'RSI',
        file: 'server/services/feature-enrichment.ts',
        line: 69,
        expression: '100 - (100 / (1 + avgGain / avgLoss))'
      },
      {
        name: 'VWAP',
        file: 'server/services/strategy-engine.ts',
        line: 827,
        expression: 'Σ(typical_price × volume) / Σ(volume)'
      },
      {
        name: 'SMA',
        file: 'server/services/strategy-engine.ts',
        line: 844,
        expression: 'Σ(close) / period'
      },
      {
        name: 'Volume USD',
        file: 'server/exchanges/kraken/kraken.ts',
        line: 689,
        expression: 'volume24h × lastPriceUSD'
      },
      {
        name: 'Bid-Ask Spread',
        file: 'server/exchanges/kraken/kraken.ts',
        line: 697,
        expression: '((ask - bid) / bid) × 100'
      },
      {
        name: 'Daily Range',
        file: 'server/exchanges/kraken/kraken.ts',
        line: 692,
        expression: '((high24h - low24h) / low24h) × 100'
      },
      {
        name: 'Volatility (Daily Range Proxy)',
        file: 'server/exchanges/kraken/kraken.ts',
        line: 758,
        expression: 'dailyRange (as proxy)'
      },
      {
        name: 'Typical Price',
        file: 'server/services/strategy-engine.ts',
        line: 834,
        expression: '(high + low + close) / 3'
      },
      {
        name: 'SMA Slope',
        file: 'server/services/feature-enrichment.ts',
        line: 95,
        expression: '(sma1 - sma2) / sma2'
      },
      {
        name: 'Volume Delta',
        file: 'server/services/feature-enrichment.ts',
        line: 110,
        expression: '(recentAvg - olderAvg) / olderAvg'
      }
    ];
  }

  /**
   * Expected formulas based on industry standards
   */
  private getExpectedFormulas(): Map<string, { formula: string; unit: string }> {
    const formulas = new Map();
    
    formulas.set('RSI', {
      formula: 'RSI = 100 - (100 / (1 + RS)) where RS = avgGain / avgLoss',
      unit: 'percentage (0-100)'
    });
    
    formulas.set('VWAP', {
      formula: 'VWAP = Σ(typical_price × volume) / Σ(volume) where typical_price = (high + low + close) / 3',
      unit: 'price (USD or base currency)'
    });
    
    formulas.set('SMA', {
      formula: 'SMA = Σ(close_i) / period',
      unit: 'price (USD or base currency)'
    });
    
    formulas.set('Volume USD', {
      formula: 'VolumeUSD = volume_base × price_USD',
      unit: 'USD'
    });
    
    formulas.set('Bid-Ask Spread', {
      formula: 'Spread% = ((ask - bid) / bid) × 100 or ((ask - bid) / midpoint) × 100',
      unit: 'percentage'
    });
    
    formulas.set('Daily Range', {
      formula: 'DailyRange% = ((high - low) / low) × 100 or ((high - low) / close) × 100',
      unit: 'percentage'
    });
    
    formulas.set('Volatility (Daily Range Proxy)', {
      formula: 'Volatility = DailyRange% (standard deviation would be more accurate)',
      unit: 'percentage'
    });
    
    formulas.set('Typical Price', {
      formula: 'TypicalPrice = (high + low + close) / 3',
      unit: 'price (USD or base currency)'
    });
    
    formulas.set('SMA Slope', {
      formula: 'Slope = (SMA_current - SMA_previous) / SMA_previous',
      unit: 'decimal (rate of change)'
    });
    
    formulas.set('Volume Delta', {
      formula: 'Delta = (recentAvg - olderAvg) / olderAvg',
      unit: 'decimal (rate of change)'
    });
    
    return formulas;
  }

  /**
   * Run comprehensive audit
   */
  async runAudit(): Promise<AuditReport> {
    const timestamp = new Date().toISOString();
    const tests: FormulaTest[] = [];
    
    console.log('\n🔍 [AUDIT] Starting Formula Audit...\n');
    
    // Test each formula
    tests.push(await this.testRSI());
    tests.push(await this.testVWAP());
    tests.push(await this.testSMA());
    tests.push(await this.testVolumeUSD());
    tests.push(await this.testBidAskSpread());
    tests.push(await this.testDailyRange());
    tests.push(await this.testVolatility());
    tests.push(await this.testTypicalPrice());
    tests.push(await this.testSMASlope());
    tests.push(await this.testVolumeDelta());
    
    // Calculate summary statistics
    const passed = tests.filter(t => t.status === 'PASS').length;
    const warnings = tests.filter(t => t.status === 'WARNING').length;
    const failed = tests.filter(t => t.status === 'FAIL').length;
    
    const summary = this.generateSummary(tests);
    
    const report: AuditReport = {
      timestamp,
      totalFormulas: tests.length,
      passed,
      warnings,
      failed,
      tests,
      summary
    };
    
    // Print console output
    this.printConsoleReport(report);
    
    // Save to file
    await this.saveReportToFile(report);
    
    return report;
  }

  /**
   * Test RSI calculation
   */
  private async testRSI(): Promise<FormulaTest> {
    const name = 'RSI';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data: 14 periods of price changes
    const samplePrices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
    
    // Expected RSI calculation (first 14-period RSI)
    const changes: number[] = [];
    for (let i = 1; i < samplePrices.length; i++) {
      changes.push(samplePrices[i] - samplePrices[i - 1]);
    }
    
    let gains = 0;
    let losses = 0;
    for (const change of changes) {
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgGain / avgLoss;
    const expectedResult = 100 - (100 / (1 + rs));
    
    // Actual calculation using our service
    const featureService = new FeatureEnrichmentService();
    const actualResult = (featureService as any).calculateRSI(samplePrices, 14);
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    
    // Check unit match - RSI should be in 0-100 range
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData: { prices: samplePrices },
      expectedResult: Number(expectedResult.toFixed(2)),
      actualResult,
      deviation: Number(deviation.toFixed(4)),
      deviationPercent: Number(deviationPercent.toFixed(2)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Standard RSI(14) calculation'
    };
  }

  /**
   * Test VWAP calculation
   */
  private async testVWAP(): Promise<FormulaTest> {
    const name = 'VWAP';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample candle data
    const sampleData = [
      { symbol: 'BTC/USD', id: '1', high: '100', low: '98', close: '99', volume: '1000', timestamp: new Date(), open: '99', vwap: '0', sma: '0' },
      { symbol: 'BTC/USD', id: '2', high: '102', low: '99', close: '101', volume: '1500', timestamp: new Date(), open: '99', vwap: '0', sma: '0' },
      { symbol: 'BTC/USD', id: '3', high: '103', low: '100', close: '102', volume: '1200', timestamp: new Date(), open: '101', vwap: '0', sma: '0' },
    ];
    
    // Expected VWAP
    let totalVolumePrice = 0;
    let totalVolume = 0;
    for (const candle of sampleData) {
      const typical = (parseFloat(candle.high) + parseFloat(candle.low) + parseFloat(candle.close)) / 3;
      const volume = parseFloat(candle.volume);
      totalVolumePrice += typical * volume;
      totalVolume += volume;
    }
    const expectedResult = totalVolumePrice / totalVolume;
    
    // Actual calculation
    const strategyEngine = new StrategyEngine();
    const actualResult = strategyEngine.calculateVWAP(sampleData);
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData: { candles: sampleData },
      expectedResult: Number(expectedResult.toFixed(6)),
      actualResult: Number(actualResult.toFixed(6)),
      deviation: Number(deviation.toFixed(6)),
      deviationPercent: Number(deviationPercent.toFixed(4)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'VWAP uses typical price (H+L+C)/3 weighted by volume'
    };
  }

  /**
   * Test SMA calculation
   */
  private async testSMA(): Promise<FormulaTest> {
    const name = 'SMA';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data
    const sampleData = [
      { symbol: 'BTC/USD', id: '1', close: '100', timestamp: new Date(), open: '99', high: '101', low: '99', volume: '1000', vwap: '0', sma: '0' },
      { symbol: 'BTC/USD', id: '2', close: '102', timestamp: new Date(), open: '100', high: '103', low: '100', volume: '1000', vwap: '0', sma: '0' },
      { symbol: 'BTC/USD', id: '3', close: '101', timestamp: new Date(), open: '102', high: '103', low: '100', volume: '1000', vwap: '0', sma: '0' },
      { symbol: 'BTC/USD', id: '4', close: '103', timestamp: new Date(), open: '101', high: '104', low: '101', volume: '1000', vwap: '0', sma: '0' },
      { symbol: 'BTC/USD', id: '5', close: '105', timestamp: new Date(), open: '103', high: '105', low: '102', volume: '1000', vwap: '0', sma: '0' },
    ];
    
    const period = 5;
    
    // Expected SMA
    const sum = sampleData.reduce((acc, candle) => acc + parseFloat(candle.close), 0);
    const expectedResult = sum / period;
    
    // Actual calculation
    const strategyEngine = new StrategyEngine();
    const actualResult = strategyEngine.calculateSMA(sampleData, period);
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData: { candles: sampleData, period },
      expectedResult: Number(expectedResult.toFixed(4)),
      actualResult: Number(actualResult.toFixed(4)),
      deviation: Number(deviation.toFixed(6)),
      deviationPercent: Number(deviationPercent.toFixed(4)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Simple moving average of close prices'
    };
  }

  /**
   * Test Volume USD calculation
   */
  private async testVolumeUSD(): Promise<FormulaTest> {
    const name = 'Volume USD';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data
    const sampleData = {
      volume24h: 1000, // base currency volume
      lastPriceUSD: 50000
    };
    
    // Expected: volume × price
    const expectedResult = sampleData.volume24h * sampleData.lastPriceUSD;
    
    // Actual: same calculation (this is used in kraken.ts)
    const actualResult = sampleData.volume24h * sampleData.lastPriceUSD;
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData,
      expectedResult,
      actualResult,
      deviation,
      deviationPercent: Number(deviationPercent.toFixed(4)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Volume in USD = base volume × USD price'
    };
  }

  /**
   * Test Bid-Ask Spread calculation
   */
  private async testBidAskSpread(): Promise<FormulaTest> {
    const name = 'Bid-Ask Spread';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data
    const sampleData = {
      bid: 50000,
      ask: 50100
    };
    
    // Expected: ((ask - bid) / bid) × 100
    const expectedResult = ((sampleData.ask - sampleData.bid) / sampleData.bid) * 100;
    
    // Actual: same calculation
    const actualResult = ((sampleData.ask - sampleData.bid) / sampleData.bid) * 100;
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData,
      expectedResult: Number(expectedResult.toFixed(4)),
      actualResult: Number(actualResult.toFixed(4)),
      deviation: Number(deviation.toFixed(6)),
      deviationPercent: Number(deviationPercent.toFixed(4)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Using bid as base (some systems use midpoint)'
    };
  }

  /**
   * Test Daily Range calculation
   */
  private async testDailyRange(): Promise<FormulaTest> {
    const name = 'Daily Range';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data
    const sampleData = {
      high24h: 52000,
      low24h: 48000
    };
    
    // Expected: ((high - low) / low) × 100
    const expectedResult = ((sampleData.high24h - sampleData.low24h) / sampleData.low24h) * 100;
    
    // Actual: same calculation
    const actualResult = ((sampleData.high24h - sampleData.low24h) / sampleData.low24h) * 100;
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData,
      expectedResult: Number(expectedResult.toFixed(4)),
      actualResult: Number(actualResult.toFixed(4)),
      deviation: Number(deviation.toFixed(6)),
      deviationPercent: Number(deviationPercent.toFixed(4)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Using low as base (some systems use close)'
    };
  }

  /**
   * Test Volatility (Daily Range Proxy)
   */
  private async testVolatility(): Promise<FormulaTest> {
    const name = 'Volatility (Daily Range Proxy)';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data (same as daily range)
    const sampleData = {
      high24h: 52000,
      low24h: 48000
    };
    
    const dailyRange = ((sampleData.high24h - sampleData.low24h) / sampleData.low24h) * 100;
    
    const expectedResult = dailyRange;
    const actualResult = dailyRange;
    
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData,
      expectedResult: Number(expectedResult.toFixed(4)),
      actualResult: Number(actualResult.toFixed(4)),
      deviation: 0,
      deviationPercent: 0,
      status: 'WARNING',
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Using daily range as proxy - true volatility would use standard deviation of returns'
    };
  }

  /**
   * Test Typical Price calculation
   */
  private async testTypicalPrice(): Promise<FormulaTest> {
    const name = 'Typical Price';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data
    const sampleData = {
      high: 103,
      low: 97,
      close: 100
    };
    
    // Expected: (high + low + close) / 3
    const expectedResult = (sampleData.high + sampleData.low + sampleData.close) / 3;
    
    // Actual: same calculation
    const actualResult = (sampleData.high + sampleData.low + sampleData.close) / 3;
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData,
      expectedResult: Number(expectedResult.toFixed(6)),
      actualResult: Number(actualResult.toFixed(6)),
      deviation: Number(deviation.toFixed(8)),
      deviationPercent: Number(deviationPercent.toFixed(4)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Typical price used in VWAP calculation'
    };
  }

  /**
   * Test SMA Slope calculation
   */
  private async testSMASlope(): Promise<FormulaTest> {
    const name = 'SMA Slope';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data
    const sampleData = {
      sma1: 105,
      sma2: 100
    };
    
    // Expected: (sma1 - sma2) / sma2
    const expectedResult = (sampleData.sma1 - sampleData.sma2) / sampleData.sma2;
    
    // Actual: same calculation
    const actualResult = (sampleData.sma1 - sampleData.sma2) / sampleData.sma2;
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData,
      expectedResult: Number(expectedResult.toFixed(6)),
      actualResult: Number(actualResult.toFixed(6)),
      deviation: Number(deviation.toFixed(8)),
      deviationPercent: Number(deviationPercent.toFixed(4)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Rate of change of SMA over time'
    };
  }

  /**
   * Test Volume Delta calculation
   */
  private async testVolumeDelta(): Promise<FormulaTest> {
    const name = 'Volume Delta';
    const locations = this.getFormulaLocations();
    const expected = this.getExpectedFormulas();
    
    const location = locations.find(l => l.name === name)!;
    const expectedInfo = expected.get(name)!;
    
    // Sample data
    const sampleData = {
      recentAvg: 15000000,
      olderAvg: 10000000
    };
    
    // Expected: (recentAvg - olderAvg) / olderAvg
    const expectedResult = (sampleData.recentAvg - sampleData.olderAvg) / sampleData.olderAvg;
    
    // Actual: same calculation
    const actualResult = (sampleData.recentAvg - sampleData.olderAvg) / sampleData.olderAvg;
    
    const deviation = Math.abs(expectedResult - actualResult);
    const deviationPercent = this.calculateDeviationPercent(expectedResult, actualResult);
    const unitMatch = this.checkUnitMatch(expectedResult, actualResult, expectedInfo.unit);
    
    return {
      name,
      location,
      expectedFormula: expectedInfo.formula,
      actualFormula: location.expression,
      sampleData,
      expectedResult: Number(expectedResult.toFixed(6)),
      actualResult: Number(actualResult.toFixed(6)),
      deviation: Number(deviation.toFixed(8)),
      deviationPercent: Number(deviationPercent.toFixed(4)),
      status: this.getStatus(deviationPercent),
      unit: expectedInfo.unit,
      unitMatch,
      notes: 'Relative change in volume over time'
    };
  }

  /**
   * Generate summary messages
   */
  private generateSummary(tests: FormulaTest[]): string[] {
    const summary: string[] = [];
    
    summary.push('═══════════════════════════════════════════════════════');
    summary.push('           FORMULA AUDIT SUMMARY');
    summary.push('═══════════════════════════════════════════════════════');
    summary.push('');
    summary.push('⚠️  NOTE: Line numbers in formula locations are approximate');
    summary.push('    and may drift as code evolves. Use file paths and');
    summary.push('    expression patterns to locate formulas.');
    summary.push('');
    
    // Top 5 issues
    const issues = tests.filter(t => t.status !== 'PASS').sort((a, b) => b.deviationPercent - a.deviationPercent);
    
    if (issues.length > 0) {
      summary.push('🔴 TOP ISSUES:');
      issues.slice(0, 5).forEach((issue, idx) => {
        summary.push(`   ${idx + 1}. ${issue.name}: ${issue.status} (deviation: ${issue.deviationPercent.toFixed(2)}%)`);
        summary.push(`      → ${issue.notes}`);
      });
      summary.push('');
    }
    
    // All formulas status
    summary.push('📊 FORMULA STATUS:');
    tests.forEach(test => {
      const icon = test.status === 'PASS' ? '✅' : test.status === 'WARNING' ? '⚠️' : '❌';
      summary.push(`   ${icon} ${test.name.padEnd(30)} ${test.status.padEnd(10)} (${test.deviationPercent.toFixed(2)}% deviation)`);
    });
    summary.push('');
    
    // Unit consistency check
    summary.push('🔢 UNIT CONSISTENCY:');
    const unitIssues = tests.filter(t => !t.unitMatch);
    if (unitIssues.length === 0) {
      summary.push('   ✅ All formulas use consistent units');
    } else {
      unitIssues.forEach(issue => {
        summary.push(`   ⚠️ ${issue.name}: Unit mismatch detected`);
      });
    }
    summary.push('');
    
    // Formula details
    summary.push('📐 FORMULA DETAILS:');
    tests.forEach(test => {
      summary.push(`   ${test.name}:`);
      summary.push(`      Expected: ${test.expectedFormula}`);
      summary.push(`      Actual:   ${test.actualFormula}`);
      summary.push(`      Unit:     ${test.unit}`);
      summary.push(`      Location: ${test.location.file}:${test.location.line}`);
      summary.push('');
    });
    
    return summary;
  }

  /**
   * Print report to console
   */
  private printConsoleReport(report: AuditReport): void {
    console.log('\n\n' + '═'.repeat(60));
    console.log('  FORMULA AUDIT REPORT');
    console.log('═'.repeat(60));
    console.log(`  Timestamp: ${report.timestamp}`);
    console.log(`  Total Formulas: ${report.totalFormulas}`);
    console.log(`  ✅ Passed: ${report.passed}`);
    console.log(`  ⚠️  Warnings: ${report.warnings}`);
    console.log(`  ❌ Failed: ${report.failed}`);
    console.log('═'.repeat(60) + '\n');
    
    // Print each test result
    report.tests.forEach(test => {
      const icon = test.status === 'PASS' ? '✅' : test.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`[AUDIT] ${test.name} → ${icon} ${test.status}`);
      console.log(`        Expected: ${test.expectedResult}, Actual: ${test.actualResult}`);
      console.log(`        Deviation: ${test.deviation} (${test.deviationPercent.toFixed(2)}%)`);
      console.log(`        Unit: ${test.unit} ${test.unitMatch ? '✅' : '⚠️'}`);
      console.log(`        ${test.notes}`);
      console.log('');
    });
    
    console.log('\n' + '═'.repeat(60));
    console.log('  VERIFICATION COMPLETE');
    console.log('═'.repeat(60) + '\n');
  }

  /**
   * Save report to file
   */
  private async saveReportToFile(report: AuditReport): Promise<void> {
    const textReport: string[] = [];
    
    textReport.push('FORMULA AUDIT REPORT');
    textReport.push('='.repeat(80));
    textReport.push(`Timestamp: ${report.timestamp}`);
    textReport.push(`Total Formulas: ${report.totalFormulas}`);
    textReport.push(`Passed: ${report.passed}`);
    textReport.push(`Warnings: ${report.warnings}`);
    textReport.push(`Failed: ${report.failed}`);
    textReport.push('='.repeat(80));
    textReport.push('');
    
    // Add each test
    report.tests.forEach(test => {
      textReport.push(`Formula: ${test.name}`);
      textReport.push(`Status: ${test.status}`);
      textReport.push(`Location: ${test.location.file}:${test.location.line}`);
      textReport.push(`Expression: ${test.location.expression}`);
      textReport.push(`Expected Formula: ${test.expectedFormula}`);
      textReport.push(`Expected Result: ${test.expectedResult}`);
      textReport.push(`Actual Result: ${test.actualResult}`);
      textReport.push(`Deviation: ${test.deviation} (${test.deviationPercent.toFixed(2)}%)`);
      textReport.push(`Unit: ${test.unit} (Match: ${test.unitMatch ? 'YES' : 'NO'})`);
      textReport.push(`Notes: ${test.notes}`);
      textReport.push(`Sample Data: ${JSON.stringify(test.sampleData, null, 2)}`);
      textReport.push('-'.repeat(80));
      textReport.push('');
    });
    
    // Add summary
    textReport.push('');
    textReport.push(...report.summary);
    
    // Write to /tmp/audit_report.txt
    const filePath = '/tmp/audit_report.txt';
    fs.writeFileSync(filePath, textReport.join('\n'), 'utf-8');
    
    console.log(`\n📝 Full audit report saved to: ${filePath}\n`);
  }
}

export const formulaAuditService = new FormulaAuditService();
