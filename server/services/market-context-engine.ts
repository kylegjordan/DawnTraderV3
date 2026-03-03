/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 13 — Market Context Engine (MCE)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized market context computation service. Receives OHLC data from callers
 * (signal-orchestrator, vts-runner) and computes all indicators + regime in a
 * single pass per symbol, eliminating duplicate VWAP/SMA computation.
 *
 * MCE does NOT:
 *   - Fetch OHLC data (callers provide it)
 *   - Generate signals (that's strategy-engine's job)
 *   - Add new math (uses existing calculatePairRegime, same VWAP/SMA formulas)
 *   - Compute strategy weights or exposure/risk multipliers
 *
 * MCE DOES:
 *   - Compute VWAP, SMA, ATR from provided OHLC
 *   - Call calculatePairRegime() for regime + volatility/momentum/ADX
 *   - Look up regimeWeight and allowedStrategies from canonical maps
 *   - Cache results per symbol for the current cycle
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

  constructor(config: Partial<MCEConfig> = {}) {
    this.config = { ...DEFAULT_MCE_CONFIG, ...config };
    console.log('[Phase13][MCE] Market Context Engine created');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.running = true;
    console.log('[Phase13][MCE] Started');
  }

  stop(): void {
    this.running = false;
    this.cache.clear();
    console.log('[Phase13][MCE] Stopped, cache cleared');
  }

  isRunning(): boolean {
    return this.running;
  }

  // ─── Core: Compute Context ─────────────────────────────────────────────────

  /**
   * Compute full market context for a symbol from OHLC data.
   *
   * Callers provide OHLC + current price + volume. MCE computes all indicators
   * and regime in one pass. Results are cached per symbol for cacheTTLMs.
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

    // ── Regime calculation (single call to calculatePairRegime) ──
    const regimeResult = calculatePairRegime(ohlcData);

    // ── Indicators (VWAP, SMA, ATR, high24h, low24h) ──
    const vwap = this.computeVWAP(ohlcData);
    const sma = this.computeSMA(ohlcData, smaPeriod ?? this.config.smaPeriod);
    const atr = this.computeATR(ohlcData, this.config.atrPeriod);
    const high24h = this.computeHigh24h(ohlcData);
    const low24h = this.computeLow24h(ohlcData);

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
    };

    // Cache
    this.cache.set(symbol, {
      context,
      expiresAt: now + this.config.cacheTTLMs,
    });

    console.log(
      `[Phase13][MCE] ${symbol}: regime=${regimeResult.regime} conf=${regimeResult.confidence.toFixed(3)} ` +
      `vwap=${vwap.toFixed(2)} sma=${sma.toFixed(2)} atr=${atr.toFixed(4)} ` +
      `vol=${regimeResult.volatility.toFixed(4)} mom=${regimeResult.momentum.toFixed(4)} adx=${regimeResult.adx.toFixed(1)}`
    );

    return context;
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
   * Same formula as signal-orchestrator.ts calculateVWAP (lines 1343-1361)
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
   * Same formula as signal-orchestrator.ts calculateSMA (lines 1363-1368)
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
   * Same logic as signal-orchestrator.ts (line 844)
   */
  private computeHigh24h(ohlcData: OHLCData[]): number {
    if (ohlcData.length === 0) return 0;
    const slice = ohlcData.slice(-24);
    return Math.max(...slice.map(c => c.high));
  }

  /**
   * Lowest low in last 24 candles.
   * Same logic as signal-orchestrator.ts (line 845)
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
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let mceInstance: MarketContextEngine | null = null;

export function initMarketContextEngine(config?: Partial<MCEConfig>): MarketContextEngine {
  if (mceInstance) {
    console.log('[Phase13][MCE] Already initialized, returning existing instance');
    return mceInstance;
  }
  mceInstance = new MarketContextEngine(config);
  mceInstance.start();
  return mceInstance;
}

export function getMarketContextEngine(): MarketContextEngine {
  if (!mceInstance) {
    // Auto-init with defaults if not explicitly initialized
    console.log('[Phase13][MCE] Auto-initializing with default config');
    mceInstance = new MarketContextEngine();
    mceInstance.start();
  }
  return mceInstance;
}
