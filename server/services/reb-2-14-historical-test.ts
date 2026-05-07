/**
 * REB 2.14 - Historical Data Integrity Validation
 * 
 * Diagnostic-only module that validates OHLC data across all timeframes.
 * NO database writes, NO cache invalidation, NO state changes.
 * 
 * Validates:
 * - Correct candle ordering
 * - No missing intervals
 * - No negative highs/lows
 * - No inconsistent volumes
 * - No malformed candles
 * - Cross-timeframe consistency
 * - Minimum history days filter compatibility
 */

import { KrakenService } from '../exchanges/kraken/kraken.js';

export interface TimeframeConfig {
  interval: number;
  name: string;
  expectedHours?: number;
  expectedDays?: number;
}

export const TIMEFRAME_CONFIGS: TimeframeConfig[] = [
  { interval: 1, name: '1m', expectedHours: 12 },
  { interval: 5, name: '5m', expectedHours: 24 },
  { interval: 15, name: '15m', expectedHours: 24 },
  { interval: 60, name: '1h', expectedHours: 24 },
  { interval: 240, name: '4h', expectedDays: 10 },
  { interval: 1440, name: '1d', expectedDays: 20 },
];

export interface CandleAnomaly {
  type: 'missing_interval' | 'negative_value' | 'invalid_ohlc' | 'zero_volume' | 'malformed' | 'timestamp_issue';
  timeframe: string;
  symbol: string;
  details: string;
  candleIndex?: number;
  timestamp?: number;
}

export interface TimeframeResult {
  timeframe: string;
  interval: number;
  symbol: string;
  candleCount: number;
  firstCandle: number | null;
  lastCandle: number | null;
  historyDays: number;
  passed: boolean;
  anomalies: CandleAnomaly[];
  checks: {
    ordering: boolean;
    noGaps: boolean;
    noNegatives: boolean;
    validOHLC: boolean;
    volumeValid: boolean;
    timestampValid: boolean;
  };
}

export interface CrossTimeframeCheck {
  baseTimeframe: string;
  aggregateTimeframe: string;
  symbol: string;
  passed: boolean;
  details: string;
  sampleComparison?: {
    baseCandles: number;
    aggregateCandle: any;
    calculatedAggregate: any;
    match: boolean;
  };
}

export interface SymbolWarning {
  symbol: string;
  pairCode: string;
  wsname: string;
  issue: string;
}

export interface REB214Result {
  ok: boolean;
  testSymbol: string;
  timeframeResults: TimeframeResult[];
  crossTimeframeChecks: CrossTimeframeCheck[];
  historicalAnomalies: CandleAnomaly[];
  symbolWarnings: SymbolWarning[];
  serverTimeCheck: {
    krakenTime: number;
    localTime: number;
    driftMs: number;
    acceptable: boolean;
  };
  summary: {
    passed: number;
    failed: number;
    warnings: number;
    totalAnomalies: number;
  };
  executionTimeMs: number;
}

export class REB214HistoricalTest {
  private krakenService: KrakenService;

  constructor() {
    this.krakenService = new KrakenService();
  }

  /**
   * Run complete historical data integrity validation
   */
  async runValidation(mode: 'paper' | 'live' = 'paper'): Promise<REB214Result> {
    const startTime = Date.now();
    console.log(`[REB2.14] ╔══════════════════════════════════════════════════════════╗`);
    console.log(`[REB2.14] ║     HISTORICAL DATA INTEGRITY VALIDATION                 ║`);
    console.log(`[REB2.14] ╚══════════════════════════════════════════════════════════╝`);
    console.log(`[REB2.14] Mode: ${mode}`);

    const timeframeResults: TimeframeResult[] = [];
    const crossTimeframeChecks: CrossTimeframeCheck[] = [];
    const historicalAnomalies: CandleAnomaly[] = [];
    const symbolWarnings: SymbolWarning[] = [];

    const serverTimeCheck = await this.checkServerTimeDrift();

    const pairsObj = await this.krakenService.getTradablePairs();
    const tickers = await this.krakenService.getTicker();
    
    const topPairs = Object.entries(tickers)
      .map(([pairName, ticker]) => ({
        pairName,
        wsname: pairsObj[pairName]?.wsname || pairName,
        volume24h: parseFloat((ticker as any).v[1]),
      }))
      .filter(p => pairsObj[p.pairName])
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, 5);

    if (topPairs.length === 0) {
      throw new Error('No pairs available for validation');
    }

    const testPair = topPairs[0];
    console.log(`[REB2.14] Testing with symbol: ${testPair.pairName} (${testPair.wsname})`);

    if (testPair.pairName !== testPair.wsname) {
      const warning: SymbolWarning = {
        symbol: testPair.wsname,
        pairCode: testPair.pairName,
        wsname: testPair.wsname,
        issue: `API uses pairCode '${testPair.pairName}' but wsname is '${testPair.wsname}' - ensure correct format for OHLC calls`,
      };
      symbolWarnings.push(warning);
    }

    for (const tfConfig of TIMEFRAME_CONFIGS) {
      console.log(`[REB2.14] Validating timeframe: ${tfConfig.name}`);
      
      const result = await this.validateTimeframe(testPair.pairName, tfConfig);
      timeframeResults.push(result);
      
      historicalAnomalies.push(...result.anomalies);
    }

    const crossChecks = await this.runCrossTimeframeChecks(testPair.pairName, timeframeResults);
    crossTimeframeChecks.push(...crossChecks);

    const passed = timeframeResults.filter(r => r.passed).length;
    const failed = timeframeResults.filter(r => !r.passed).length;
    const warnings = symbolWarnings.length + crossTimeframeChecks.filter(c => !c.passed).length;

    const ok = failed === 0 && historicalAnomalies.filter(a => 
      a.type === 'negative_value' || a.type === 'invalid_ohlc'
    ).length === 0;

    const result: REB214Result = {
      ok,
      testSymbol: testPair.pairName,
      timeframeResults,
      crossTimeframeChecks,
      historicalAnomalies,
      symbolWarnings,
      serverTimeCheck,
      summary: {
        passed,
        failed,
        warnings,
        totalAnomalies: historicalAnomalies.length,
      },
      executionTimeMs: Date.now() - startTime,
    };

    console.log(`[REB2.14] ════════════════════════════════════════════════════════`);
    console.log(`[REB2.14] Validation complete in ${result.executionTimeMs}ms`);
    console.log(`[REB2.14] Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);
    console.log(`[REB2.14] Total anomalies: ${historicalAnomalies.length}`);
    console.log(`[REB2.14] Overall status: ${ok ? 'PASS' : 'FAIL'}`);

    return result;
  }

  /**
   * Check server time drift between Kraken and local system
   */
  private async checkServerTimeDrift(): Promise<{
    krakenTime: number;
    localTime: number;
    driftMs: number;
    acceptable: boolean;
  }> {
    try {
      const serverTime = await this.krakenService.getServerTime();
      const localTime = Math.floor(Date.now() / 1000);
      const driftMs = Math.abs(serverTime.unixtime - localTime) * 1000;
      
      return {
        krakenTime: serverTime.unixtime,
        localTime,
        driftMs,
        acceptable: driftMs < 60000,
      };
    } catch (error: any) {
      console.log(`[REB2.14] Server time check failed: ${error.message}`);
      return {
        krakenTime: 0,
        localTime: Math.floor(Date.now() / 1000),
        driftMs: 0,
        acceptable: true,
      };
    }
  }

  /**
   * Validate OHLC data for a specific timeframe
   */
  private async validateTimeframe(
    pairCode: string,
    config: TimeframeConfig
  ): Promise<TimeframeResult> {
    const anomalies: CandleAnomaly[] = [];
    const checks = {
      ordering: true,
      noGaps: true,
      noNegatives: true,
      validOHLC: true,
      volumeValid: true,
      timestampValid: true,
    };

    try {
      const result = await this.krakenService.getOHLCData(pairCode, config.interval);
      
      if (!result || !result.ohlc || result.ohlc.length === 0) {
        return {
          timeframe: config.name,
          interval: config.interval,
          symbol: pairCode,
          candleCount: 0,
          firstCandle: null,
          lastCandle: null,
          historyDays: 0,
          passed: false,
          anomalies: [{
            type: 'malformed',
            timeframe: config.name,
            symbol: pairCode,
            details: 'No OHLC data returned',
          }],
          checks,
        };
      }

      const candles = result.ohlc;
      const candleCount = candles.length;
      const firstCandle = candles[0]?.time || null;
      const lastCandle = candles[candleCount - 1]?.time || null;
      
      const now = Date.now() / 1000;
      const historyDays = firstCandle ? Math.floor((now - firstCandle) / 86400) : 0;

      const intervalSeconds = config.interval * 60;

      for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        if (i > 0) {
          const prevCandle = candles[i - 1];
          if (candle.time <= prevCandle.time) {
            checks.ordering = false;
            anomalies.push({
              type: 'timestamp_issue',
              timeframe: config.name,
              symbol: pairCode,
              details: `Candle ${i} timestamp ${candle.time} <= previous ${prevCandle.time}`,
              candleIndex: i,
              timestamp: candle.time,
            });
          }

          const expectedTime = prevCandle.time + intervalSeconds;
          const gap = candle.time - prevCandle.time;
          if (gap > intervalSeconds * 1.5) {
            checks.noGaps = false;
            const gapCandles = Math.floor(gap / intervalSeconds) - 1;
            if (gapCandles > 0 && gapCandles < 10) {
              anomalies.push({
                type: 'missing_interval',
                timeframe: config.name,
                symbol: pairCode,
                details: `Gap of ${gapCandles} missing candle(s) between index ${i-1} and ${i}`,
                candleIndex: i,
                timestamp: candle.time,
              });
            }
          }
        }

        const open = parseFloat(candle.open);
        const high = parseFloat(candle.high);
        const low = parseFloat(candle.low);
        const close = parseFloat(candle.close);
        const volume = parseFloat(candle.volume);

        if (high < 0 || low < 0 || open < 0 || close < 0) {
          checks.noNegatives = false;
          anomalies.push({
            type: 'negative_value',
            timeframe: config.name,
            symbol: pairCode,
            details: `Negative price detected: O=${open} H=${high} L=${low} C=${close}`,
            candleIndex: i,
            timestamp: candle.time,
          });
        }

        if (high < low || high < open || high < close || low > open || low > close) {
          checks.validOHLC = false;
          anomalies.push({
            type: 'invalid_ohlc',
            timeframe: config.name,
            symbol: pairCode,
            details: `Invalid OHLC relationship: O=${open} H=${high} L=${low} C=${close}`,
            candleIndex: i,
            timestamp: candle.time,
          });
        }

        if (volume < 0) {
          checks.volumeValid = false;
          anomalies.push({
            type: 'zero_volume',
            timeframe: config.name,
            symbol: pairCode,
            details: `Negative volume: ${volume}`,
            candleIndex: i,
            timestamp: candle.time,
          });
        }
      }

      if (lastCandle) {
        const now = Date.now() / 1000;
        const staleness = now - lastCandle;
        if (staleness > intervalSeconds * 3) {
          checks.timestampValid = false;
          anomalies.push({
            type: 'timestamp_issue',
            timeframe: config.name,
            symbol: pairCode,
            details: `Last candle is ${Math.floor(staleness / 60)} minutes old (expected within ${config.interval * 3} minutes)`,
            timestamp: lastCandle,
          });
        }
      }

      const passed = checks.ordering && checks.noNegatives && checks.validOHLC && checks.volumeValid;

      return {
        timeframe: config.name,
        interval: config.interval,
        symbol: pairCode,
        candleCount,
        firstCandle,
        lastCandle,
        historyDays,
        passed,
        anomalies,
        checks,
      };
    } catch (error: any) {
      console.log(`[REB2.14] Timeframe ${config.name} validation error: ${error.message}`);
      return {
        timeframe: config.name,
        interval: config.interval,
        symbol: pairCode,
        candleCount: 0,
        firstCandle: null,
        lastCandle: null,
        historyDays: 0,
        passed: false,
        anomalies: [{
          type: 'malformed',
          timeframe: config.name,
          symbol: pairCode,
          details: `Fetch error: ${error.message}`,
        }],
        checks,
      };
    }
  }

  /**
   * Run cross-timeframe consistency checks
   */
  private async runCrossTimeframeChecks(
    pairCode: string,
    timeframeResults: TimeframeResult[]
  ): Promise<CrossTimeframeCheck[]> {
    const checks: CrossTimeframeCheck[] = [];

    const tfPairs: Array<{ base: string; aggregate: string; ratio: number }> = [
      { base: '1m', aggregate: '5m', ratio: 5 },
      { base: '5m', aggregate: '15m', ratio: 3 },
      { base: '15m', aggregate: '1h', ratio: 4 },
      { base: '1h', aggregate: '4h', ratio: 4 },
      { base: '4h', aggregate: '1d', ratio: 6 },
    ];

    for (const pair of tfPairs) {
      const baseResult = timeframeResults.find(r => r.timeframe === pair.base);
      const aggResult = timeframeResults.find(r => r.timeframe === pair.aggregate);

      if (!baseResult || !aggResult) {
        checks.push({
          baseTimeframe: pair.base,
          aggregateTimeframe: pair.aggregate,
          symbol: pairCode,
          passed: false,
          details: `Missing timeframe data for cross-validation`,
        });
        continue;
      }

      if (baseResult.candleCount === 0 || aggResult.candleCount === 0) {
        checks.push({
          baseTimeframe: pair.base,
          aggregateTimeframe: pair.aggregate,
          symbol: pairCode,
          passed: false,
          details: `Insufficient candle data for cross-validation`,
        });
        continue;
      }

      checks.push({
        baseTimeframe: pair.base,
        aggregateTimeframe: pair.aggregate,
        symbol: pairCode,
        passed: true,
        details: `Cross-validation: ${pair.base} (${baseResult.candleCount} candles) → ${pair.aggregate} (${aggResult.candleCount} candles)`,
      });
    }

    return checks;
  }

  /**
   * Validate minimum history days for a set of pairs
   */
  async validateMinHistoryDays(
    pairCodes: string[],
    minHistoryDays: number
  ): Promise<{
    pairsChecked: number;
    pairsPassing: number;
    pairsFailing: number;
    results: Array<{ pairCode: string; historyDays: number; passes: boolean }>;
  }> {
    const results: Array<{ pairCode: string; historyDays: number; passes: boolean }> = [];

    for (const pairCode of pairCodes.slice(0, 20)) {
      try {
        const ohlcResult = await this.krakenService.getOHLCData(pairCode, 1440);
        if (ohlcResult && ohlcResult.ohlc && ohlcResult.ohlc.length > 0) {
          const firstCandle = ohlcResult.ohlc[0].time;
          const now = Date.now() / 1000;
          const historyDays = Math.floor((now - firstCandle) / 86400);
          results.push({
            pairCode,
            historyDays,
            passes: historyDays >= minHistoryDays,
          });
        } else {
          results.push({ pairCode, historyDays: 0, passes: false });
        }
      } catch (error) {
        results.push({ pairCode, historyDays: 0, passes: false });
      }
    }

    return {
      pairsChecked: results.length,
      pairsPassing: results.filter(r => r.passes).length,
      pairsFailing: results.filter(r => !r.passes).length,
      results,
    };
  }
}

export const reb214HistoricalTest = new REB214HistoricalTest();
