/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 13/14 — Market Context Engine (MCE)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized market context computation service. Receives OHLC data from callers
 * (signal-orchestrator, vts-runner) and computes all indicators + regime + directional
 * bias in a single pass per symbol, eliminating duplicate VWAP/SMA computation.
 *
 * MCE does NOT:
 *   - Fetch OHLC data (callers provide it)
 *   - Generate signals (that's strategy-engine's job)
 *   - Add new math beyond regime + indicators + directional bias
 *   - Compute strategy weights or exposure/risk multipliers
 *
 * MCE DOES:
 *   - Compute VWAP, SMA, ATR from provided OHLC
 *   - Call calculatePairRegime() for regime + volatility/momentum/ADX
 *   - Compute Directional Bias Score (Phase 14)
 *   - Look up regimeWeight and allowedStrategies from canonical maps
 *   - Cache results per symbol for the current cycle
 *
 * Phase 14 additions:
 *   - Directional Bias Score (DBS) computed per symbol
 *   - computeGlobalBias() for global directional bias
 *   - Regime names updated to Phase 14 canonical names
 *
 * Addresses: RISK-002 (OHLC Indicator Computation Duplication)
 * Singleton: getMarketContextEngine() / initMarketContextEngine()
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type {
  MarketContext,
  MarketIndicators,
  RegimeContext,
  MCEConfig,
} from '../types/market-context.js';
import { DEFAULT_MCE_CONFIG } from '../types/market-context.js';
import type { OHLCData, RegimeCalculationResult } from '../types/market-regime.types';
import {
  calculatePairRegime,
  getRegimeWeight,
} from '../core/metrics/market-regime.js';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
  type CanonicalRegimeType,
} from '../config/canonical-regime-strategy-map.js';
import { computeDirectionalBias, computeGlobalDirectionalBias } from '../core/metrics/directional-bias.js';
import type { GlobalDirectionalBias } from '../types/directional-bias.types.js';
// Phase 15b B61: DBS telemetry emitter (observational, feature-flagged)
import { emitMceTelemetry } from './phase15b-dbs-telemetry.js';

// ─── Cache Entry ─────────────────────────────────────────────────────────────

interface CacheEntry {
  context: MarketContext;
  expiresAt: number;
}

// ─── MCE Class ───────────────────────────────────────────────────────────────

export class MarketContextEngine {
  private cache: Map<string, CacheEntry> = new Map();
  private config: MCEConfig;
  private running: boolean = false;
  // Phase 15b B61: monotonic cycle counter for DBS telemetry correlation
  private cycleCounter: number = 0;

  constructor(config: Partial<MCEConfig> = {}) {
    this.config = { ...DEFAULT_MCE_CONFIG, ...config };
    console.log('[Phase14][MCE] Market Context Engine created');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.running = true;
    console.log('[Phase14][MCE] Started');
  }

  stop(): void {
    this.running = false;
    this.cache.clear();
    console.log('[Phase14][MCE] Stopped, cache cleared');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ─── Core: Compute Context ─────────────────────────────────────────────────

  /**
   * Compute full market context for a symbol from OHLC data.
   *
   * Phase 14: Now also computes Directional Bias Score (DBS).
   *
   * @param symbol - Trading pair symbol (e.g., 'XXBTZUSD')
   * @param ohlcData - OHLC candles in OHLCData format
   * @param currentPrice - Smoothed current price (from Kalman filter or raw)
   * @param volume24h - 24h volume from ticker
   * @param smaPeriod - Optional SMA period override (default from config)
   */
  computeContext(
    symbol: string,
    ohlcData: OHLCData[],
    currentPrice: number,
    volume24h: number,
    smaPeriod?: number
  ): MarketContext {
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(symbol);
    if (cached && cached.expiresAt > now) {
      return cached.context;
    }

    // ── Indicators (VWAP, SMA, ATR, high24h, low24h) ──
    const vwap = this.computeVWAP(ohlcData);
    const sma = this.computeSMA(ohlcData, smaPeriod ?? this.config.smaPeriod);
    const atr = this.computeATR(ohlcData, this.config.atrPeriod);
    const high24h = this.computeHigh24h(ohlcData);
    const low24h = this.computeLow24h(ohlcData);

    // ── B62: DBS computed BEFORE regime (DBS feeds the classifier) ──
    const directionalBias = computeDirectionalBias(ohlcData, atr);

    // ── B62: Regime calculation now receives DBS score as 4th input ──
    const regimeResult = calculatePairRegime(ohlcData, directionalBias.score);

    const indicators: MarketIndicators = {
      vwap,
      sma,
      currentPrice,
      volume: volume24h,
      high24h,
      low24h,
      atr,
      volatility: regimeResult.volatility,
      momentum: regimeResult.momentum,
      adx: regimeResult.adx,
    };

    // ── Regime context ──
    const weight = getRegimeWeight(regimeResult.regime);
    const allowedStrategies = this.getAllowedStrategies(regimeResult.regime);

    const regime: RegimeContext = {
      regime: regimeResult.regime,
      confidence: regimeResult.confidence,
      regimeWeight: weight,
      allowedStrategies,
    };

    const context: MarketContext = {
      symbol,
      timestamp: now,
      indicators,
      regime,
      raw: regimeResult,
      directionalBias,
    };

    // Cache
    this.cache.set(symbol, {
      context,
      expiresAt: now + this.config.cacheTTLMs,
    });

    console.log(
      `[Phase14][MCE] ${symbol}: regime=${regimeResult.regime} conf=${regimeResult.confidence.toFixed(3)} ` +
      `vwap=${vwap.toFixed(2)} sma=${sma.toFixed(2)} atr=${atr.toFixed(4)} ` +
      `vol=${regimeResult.volatility.toFixed(4)} mom=${regimeResult.momentum.toFixed(4)} adx=${regimeResult.adx.toFixed(1)} ` +
      `dbs=${directionalBias.score.toFixed(3)} bias=${directionalBias.category}`
    );

    // Phase 15b B61: observational telemetry (no-op unless DT_PHASE15B_DBS_TELEMETRY=1)
    this.cycleCounter += 1;
    emitMceTelemetry({
      cycleId: this.cycleCounter,
      symbol,
      dbsScore: directionalBias.score,
      dbsCategory: directionalBias.category,
      slopeComponent: directionalBias.components.slopeComponent,
      returnComponent: directionalBias.components.returnComponent,
      emaComponent: directionalBias.components.emaComponent,
      ohlcLen: ohlcData.length,
      atr,
      vol: regimeResult.volatility,
      adx: regimeResult.adx,
      mom: regimeResult.momentum,
      regime: regimeResult.regime,
    });

    return context;
  }

  // ─── Phase 14: Global Directional Bias ──────────────────────────────────────

  /**
   * Compute global directional bias from cached pair contexts.
   * Should be called after all pair contexts are computed for the cycle.
   *
   * @param volumes - Map of symbol -> 24h volume (for weighting)
   * @returns GlobalDirectionalBias
   */
  /**
   * B62: Compute global directional bias from cached pair contexts.
   * Uses atomic snapshot of all non-expired cache entries.
   * Filters sentinel-zero entries. Applies per-pair volume weight cap.
   *
   * @param volumes - Map of symbol -> 24h volume (for weighting). Must be populated.
   * @returns GlobalDirectionalBias
   */
  computeGlobalBias(volumes: Map<string, number>): GlobalDirectionalBias {
    const now = Date.now();
    const pairScores = new Map<string, number>();
    const sentinelFlags = new Map<string, boolean>();

    // B62 A.3 fix #2: atomic snapshot of all non-expired cache entries
    for (const [symbol, entry] of this.cache.entries()) {
      if (entry.expiresAt > now) {
        pairScores.set(symbol, entry.context.directionalBias.score);
        sentinelFlags.set(symbol, entry.context.directionalBias.sentinelZero);
      }
    }

    return computeGlobalDirectionalBias(pairScores, volumes, undefined, sentinelFlags);
  }

  /**
   * B62 A.3 fix #1: Extract 24h volumes from all non-expired cached contexts.
   * Used by market-indicators.ts to supply real volume weights to computeGlobalBias().
   */
  getCachedVolumes(): Map<string, number> {
    const now = Date.now();
    const volumes = new Map<string, number>();
    for (const [symbol, entry] of this.cache.entries()) {
      if (entry.expiresAt > now) {
        volumes.set(symbol, entry.context.indicators.volume || 1);
      }
    }
    return volumes;
  }

  // ─── Lookups ───────────────────────────────────────────────────────────────

  /**
   * Get cached context for a symbol. Returns undefined if no cached context or expired.
   */
  getCurrentContext(symbol?: string): MarketContext | undefined {
    if (!symbol) {
      // Return most recent context across all symbols
      let latest: MarketContext | undefined;
      const now = Date.now();
      for (const entry of this.cache.values()) {
        if (entry.expiresAt > now) {
          if (!latest || entry.context.timestamp > latest.timestamp) {
            latest = entry.context;
          }
        }
      }
      return latest;
    }

    const cached = this.cache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context;
    }
    return undefined;
  }

  /**
   * Get cached regime for a symbol.
   */
  getRegime(symbol?: string): RegimeContext | undefined {
    return this.getCurrentContext(symbol)?.regime;
  }

  /**
   * Get allowed strategy keys for a canonical regime.
   * Delegates to CANONICAL_REGIME_STRATEGY_MAP.
   */
  getAllowedStrategies(regime: CanonicalRegimeType | string): string[] {
    const mapping = CANONICAL_REGIME_STRATEGY_MAP[regime as CanonicalRegimeType];
    if (!mapping) return [];
    return mapping.strategies.map(s => s.strategyKey);
  }

  /**
   * Get all cached contexts (for health/diagnostics).
   */
  getAllContexts(): MarketContext[] {
    const now = Date.now();
    const results: MarketContext[] = [];
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) {
        results.push(entry.context);
      }
    }
    return results;
  }

  /**
   * Clear cache for a specific symbol or all symbols.
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.cache.delete(symbol);
    } else {
      this.cache.clear();
    }
  }

  // ─── Indicator Computation (same formulas as signal-orchestrator) ──────────

  /**
   * VWAP = sum(typical_price * volume) / sum(volume)
   */
  private computeVWAP(ohlcData: OHLCData[]): number {
    if (ohlcData.length === 0) return 0;

    let sumPriceVolume = 0;
    let sumVolume = 0;

    for (const candle of ohlcData) {
      const typical = (candle.high + candle.low + candle.close) / 3;
      sumPriceVolume += typical * candle.volume;
      sumVolume += candle.volume;
    }

    return sumVolume > 0 ? sumPriceVolume / sumVolume : 0;
  }

  /**
   * SMA = average of last N close prices.
   */
  private computeSMA(ohlcData: OHLCData[], period: number): number {
    if (ohlcData.length < period) return 0;

    const recentPrices = ohlcData.slice(-period).map(c => c.close);
    const sum = recentPrices.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  /**
   * ATR = average of True Range over N periods.
   * TR = max(high-low, |high-prevClose|, |low-prevClose|)
   */
  private computeATR(ohlcData: OHLCData[], period: number): number {
    if (ohlcData.length < 2) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i < ohlcData.length; i++) {
      const curr = ohlcData[i];
      const prevClose = ohlcData[i - 1].close;

      const highLow = curr.high - curr.low;
      const highClose = Math.abs(curr.high - prevClose);
      const lowClose = Math.abs(curr.low - prevClose);

      trueRanges.push(Math.max(highLow, highClose, lowClose));
    }

    if (trueRanges.length < period) {
      // Not enough data for full period — average what we have
      const sum = trueRanges.reduce((a, b) => a + b, 0);
      return trueRanges.length > 0 ? sum / trueRanges.length : 0;
    }

    const recentTR = trueRanges.slice(-period);
    const sum = recentTR.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  /**
   * Highest high in last 24 candles.
   */
  private computeHigh24h(ohlcData: OHLCData[]): number {
    if (ohlcData.length === 0) return 0;
    const slice = ohlcData.slice(-24);
    return Math.max(...slice.map(c => c.high));
  }

  /**
   * Lowest low in last 24 candles.
   */
  private computeLow24h(ohlcData: OHLCData[]): number {
    if (ohlcData.length === 0) return 0;
    const slice = ohlcData.slice(-24);
    return Math.min(...slice.map(c => c.low));
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────────

  getStatus(): {
    running: boolean;
    cachedSymbols: number;
    config: MCEConfig;
  } {
    const now = Date.now();
    let activeCached = 0;
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) activeCached++;
    }
    return {
      running: this.running,
      cachedSymbols: activeCached,
      config: { ...this.config },
    };
  }
  /**
   * Phase 14.5: Compute global dominant regime from MCE cache
   * Aggregates per-pair regimes across all cached symbols using majority vote.
   * Returns null if cache is empty or all entries expired.
   */
  getDominantRegime(): { regime: string; avgScore: number; pairCount: number; percentage: number } | null {
    const now = Date.now();
    const regimeCounts: Record<string, { count: number; totalScore: number }> = {};
    let totalPairs = 0;

    for (const [, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) continue; // Skip expired

      const regime = entry.context.regime?.regime;
      if (!regime) continue;

      if (!regimeCounts[regime]) {
        regimeCounts[regime] = { count: 0, totalScore: 0 };
      }
      regimeCounts[regime].count += 1;
      regimeCounts[regime].totalScore += entry.context.raw?.regimeScore ?? 50;
      totalPairs++;
    }

    if (totalPairs === 0) return null;

    const sorted = Object.entries(regimeCounts).sort((a, b) => b[1].count - a[1].count);
    if (sorted.length === 0) return null;

    const [regime, stats] = sorted[0];
    return {
      regime,
      avgScore: Math.round(stats.totalScore / stats.count),
      pairCount: totalPairs,
      percentage: Math.round((stats.count / totalPairs) * 100),
    };
  }

}

// ─── Singleton ──────────────────────────────────────────────────────────────

let mceInstance: MarketContextEngine | null = null;

export function initMarketContextEngine(config?: Partial<MCEConfig>): MarketContextEngine {
  if (mceInstance) {
    console.log('[Phase14][MCE] Already initialized, returning existing instance');
    return mceInstance;
  }
  mceInstance = new MarketContextEngine(config);
  mceInstance.start();
  return mceInstance;
}

export function getMarketContextEngine(): MarketContextEngine {
  if (!mceInstance) {
    // Auto-init with defaults if not explicitly initialized
    console.log('[Phase14][MCE] Auto-initializing with default config');
    mceInstance = new MarketContextEngine();
    mceInstance.start();
  }
  return mceInstance;
}
