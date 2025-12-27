/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L12
 * ══════════════════════════════════════════════════════════════════════════════
 * Market Condition Profiler (MCP) Service
 * 
 * Purpose: Continuously profiles market conditions using live and historical data,
 * identifies current "regimes," and publishes updates for adaptive strategy adjustment.
 * 
 * Regime Categories:
 * - T1: Trending Bull (persistent uptrend, low volatility)
 * - T2: Trending Bear (persistent downtrend)
 * - R1: Range-Bound (mean-reverting sideways markets)
 * - V1: High Volatility Chop (whipsaw, large swings)
 * - C1: Calm Consolidation (low volatility, flat volume)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { contextBridge } from './context-bridge';

export type RegimeId = 'T1' | 'T2' | 'R1' | 'V1' | 'C1';

export interface RegimeMetrics {
  volatility: number;      // σ - Realized volatility (20-period std dev)
  trend: number;           // Trend strength (-1 to 1, negative = bearish)
  volume_z: number;        // ζ - Volume z-score
  atr: number;             // Average True Range
  correlation: number;     // Cross-asset correlation average
}

export interface RegimeProfile {
  timestamp: string;
  regime: RegimeId;
  confidence: number;
  metrics: RegimeMetrics;
  previousRegime: RegimeId | null;
  lastSwitch: string | null;
}

export interface RegimeClassifierConfig {
  checkIntervalMs: number;
  switchThreshold: number;       // Minimum confidence for regime change
  volatilityPeriod: number;      // Periods for volatility calculation
  trendPeriod: number;           // Periods for trend calculation
  volumePeriod: number;          // Periods for volume z-score
}

const DEFAULT_CONFIG: RegimeClassifierConfig = {
  checkIntervalMs: 15 * 60 * 1000, // 15 minutes
  switchThreshold: 0.65,
  volatilityPeriod: 20,
  trendPeriod: 14,
  volumePeriod: 20
};

const REGIME_DESCRIPTIONS: Record<RegimeId, string> = {
  T1: 'Trending Bull',
  T2: 'Trending Bear',
  R1: 'Range-Bound',
  V1: 'High Volatility Chop',
  C1: 'Calm Consolidation'
};

const REGIME_COLORS: Record<RegimeId, string> = {
  T1: 'green',
  T2: 'red',
  R1: 'blue',
  V1: 'orange',
  C1: 'gray'
};

export class MarketProfilerService extends EventEmitter {
  private config: RegimeClassifierConfig;
  private currentProfile: RegimeProfile | null = null;
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();

  constructor(config: Partial<RegimeClassifierConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('[L12][MCP] Starting Market Condition Profiler');
    
    await this.runProfileCheck();
    
    this.checkInterval = setInterval(
      () => this.runProfileCheck(),
      this.config.checkIntervalMs
    );
    
    console.log('[L12][MCP] INIT_OK - Market profiler started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    console.log('[L12][MCP] Market profiler stopped');
  }

  async runProfileCheck(): Promise<void> {
    try {
      const metrics = await this.computeMarketMetrics();
      const { regime, confidence } = this.classifyRegime(metrics);
      
      const previousRegime = this.currentProfile?.regime || null;
      const isSwitch = previousRegime !== null && previousRegime !== regime && confidence >= this.config.switchThreshold;
      
      const profile: RegimeProfile = {
        timestamp: new Date().toISOString(),
        regime,
        confidence,
        metrics,
        previousRegime: isSwitch ? previousRegime : (this.currentProfile?.previousRegime || null),
        lastSwitch: isSwitch ? new Date().toISOString() : (this.currentProfile?.lastSwitch || null)
      };
      
      if (isSwitch) {
        console.log(`[L12][REGIME_SWITCH] ${previousRegime}→${regime} (confidence ${(confidence * 100).toFixed(1)}%)`);
        this.emit('regime_switch', { from: previousRegime, to: regime, confidence });
        
        contextBridge.broadcast({
          type: 'regime_switch' as any,
          payload: {
            from: previousRegime,
            to: regime,
            confidence,
            regime: regime,
            description: REGIME_DESCRIPTIONS[regime],
            color: REGIME_COLORS[regime],
            timestamp: profile.timestamp
          }
        });
      }
      
      this.currentProfile = profile;
      this.emit('profile_update', profile);
      
      console.log(`[L12][MCP] Regime: ${regime} (${REGIME_DESCRIPTIONS[regime]}) confidence=${(confidence * 100).toFixed(1)}%`);
      
    } catch (error) {
      console.error('[L12][MCP][ERROR] Profile check failed:', error);
    }
  }

  private async computeMarketMetrics(): Promise<RegimeMetrics> {
    try {
      const priceCache = await this.getPriceCacheMetrics();
      
      return {
        volatility: priceCache.volatility,
        trend: priceCache.trend,
        volume_z: priceCache.volumeZ,
        atr: priceCache.atr,
        correlation: priceCache.correlation
      };
      
    } catch (error) {
      console.error('[L12][MCP] Failed to compute metrics:', error);
      return this.getDefaultMetrics();
    }
  }

  private async getPriceCacheMetrics(): Promise<{ volatility: number; trend: number; volumeZ: number; atr: number; correlation: number }> {
    let totalVolatility = 0;
    let totalTrend = 0;
    let count = 0;
    
    for (const [symbol, prices] of this.priceHistory.entries()) {
      if (prices.length >= 10) {
        const recentPrices = prices.slice(-20);
        const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
        const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / recentPrices.length;
        const volatility = Math.sqrt(variance) / mean;
        
        const firstHalf = recentPrices.slice(0, Math.floor(recentPrices.length / 2));
        const secondHalf = recentPrices.slice(Math.floor(recentPrices.length / 2));
        const firstMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const trend = (secondMean - firstMean) / firstMean;
        
        totalVolatility += volatility;
        totalTrend += trend;
        count++;
      }
    }
    
    if (count === 0) {
      return { volatility: 0.15, trend: 0.1, volumeZ: 0, atr: 0.02, correlation: 0.5 };
    }
    
    return {
      volatility: this.clamp(totalVolatility / count, 0, 1),
      trend: this.clamp(totalTrend / count * 10, -1, 1),
      volumeZ: 0,
      atr: this.clamp(totalVolatility / count / 10, 0, 0.1),
      correlation: 0.5
    };
  }

  updatePriceData(symbol: string, price: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    const prices = this.priceHistory.get(symbol)!;
    prices.push(price);
    if (prices.length > 100) {
      prices.shift();
    }
  }

  private getDefaultMetrics(): RegimeMetrics {
    return {
      volatility: 0.15,
      trend: 0.1,
      volume_z: 0,
      atr: 0.02,
      correlation: 0.5
    };
  }

  private classifyRegime(metrics: RegimeMetrics): { regime: RegimeId; confidence: number } {
    const scores: Record<RegimeId, number> = {
      T1: 0, T2: 0, R1: 0, V1: 0, C1: 0
    };
    
    if (metrics.trend > 0.3 && metrics.volatility < 0.25) {
      scores.T1 = 0.4 + (metrics.trend * 0.4) + ((1 - metrics.volatility) * 0.2);
    }
    
    if (metrics.trend < -0.3 && metrics.volatility < 0.3) {
      scores.T2 = 0.4 + (Math.abs(metrics.trend) * 0.4) + ((1 - metrics.volatility) * 0.2);
    }
    
    if (Math.abs(metrics.trend) < 0.2 && metrics.volatility < 0.2) {
      scores.R1 = 0.5 + ((1 - Math.abs(metrics.trend)) * 0.3) + ((1 - metrics.volatility) * 0.2);
    }
    
    if (metrics.volatility > 0.35 || (metrics.atr > 0.04 && Math.abs(metrics.trend) < 0.3)) {
      scores.V1 = 0.3 + (metrics.volatility * 0.5) + (metrics.atr * 5);
    }
    
    if (metrics.volatility < 0.1 && Math.abs(metrics.volume_z) < 0.5) {
      scores.C1 = 0.6 + ((1 - metrics.volatility) * 0.2) + ((1 - Math.abs(metrics.volume_z)) * 0.2);
    }
    
    const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
    const softmaxScores: Record<RegimeId, number> = {} as Record<RegimeId, number>;
    
    for (const [regime, score] of Object.entries(scores)) {
      softmaxScores[regime as RegimeId] = totalScore > 0 ? score / totalScore : 0.2;
    }
    
    let maxRegime: RegimeId = 'R1';
    let maxScore = 0;
    
    for (const [regime, score] of Object.entries(softmaxScores)) {
      if (score > maxScore) {
        maxScore = score;
        maxRegime = regime as RegimeId;
      }
    }
    
    const confidence = this.clamp(maxScore * 1.5, 0, 1);
    
    return { regime: maxRegime, confidence };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  getCurrentProfile(): RegimeProfile | null {
    return this.currentProfile;
  }

  getCurrentRegime(): RegimeId {
    return this.currentProfile?.regime || 'R1';
  }

  getRegimeDescription(regime: RegimeId): string {
    return REGIME_DESCRIPTIONS[regime];
  }

  getRegimeColor(regime: RegimeId): string {
    return REGIME_COLORS[regime];
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getConfig(): RegimeClassifierConfig {
    return { ...this.config };
  }
}

let marketProfilerInstance: MarketProfilerService | null = null;

export function getMarketProfiler(): MarketProfilerService {
  if (!marketProfilerInstance) {
    marketProfilerInstance = new MarketProfilerService();
  }
  return marketProfilerInstance;
}

export function initMarketProfiler(config?: Partial<RegimeClassifierConfig>): MarketProfilerService {
  if (marketProfilerInstance) {
    marketProfilerInstance.stop();
  }
  marketProfilerInstance = new MarketProfilerService(config);
  return marketProfilerInstance;
}
