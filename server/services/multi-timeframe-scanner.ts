/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 10.7
 * ══════════════════════════════════════════════════════════════════════════════
 * Multi-Timeframe Scanner Service - Cascading Fractal Vision
 * 
 * Purpose: Enables multi-timeframe scanning (1H → 15m → 5m) using a cascading
 * fetch model with token-bucket rate limiting for Kraken API safety.
 * 
 * Architecture:
 * - Token-bucket rate limiter wraps existing getOHLCData() calls
 * - Cascading logic filters pairs at each layer based on regime/strength criteria
 * - Timeframe-tagged candles for pattern decay scaling
 * 
 * Cascade Flow:
 * 1. GLOBAL (1H) → All eligible pairs
 * 2. TACTICAL (15m) → Pairs where 1H regimeWeight > 0.5
 * 3. PRECISION (5m) → Pairs where 15m patternStrength > 0.6
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { KrakenService } from '../exchanges/kraken/kraken.js';
import type { Timeframe, Candle } from '../types.js';
import { 
  TIMEFRAME_CONFIG, 
  CANDLE_INTERVALS_MS, 
  TIMEFRAME_WEIGHTS 
} from '../config/system-guards.js';

const KRAKEN_INTERVAL_MAP: Record<Timeframe, number> = {
  '1h': 60,    // Kraken uses minutes (60 = 1 hour)
  '15m': 15,
  '5m': 5,
};

interface TokenBucket {
  tokens: number;
  refillInterval: number;
  lastRefill: number;
}

export interface TimeframeScanResult {
  symbol: string;
  candles: Candle[];
  timeframe: Timeframe;
  regimeWeight?: number;
  patternStrength?: number;
}

export interface CascadingScanResult {
  globalPairs: TimeframeScanResult[];
  tacticalPairs: TimeframeScanResult[];
  precisionPairs: TimeframeScanResult[];
}

const tokenBucket: TokenBucket = {
  tokens: TIMEFRAME_CONFIG.RATE_LIMITS.MAX_REQ_PER_SEC * TIMEFRAME_CONFIG.RATE_LIMITS.SAFETY_MARGIN,
  refillInterval: 1000,
  lastRefill: Date.now(),
};

function refillTokens(): void {
  const now = Date.now();
  const elapsed = now - tokenBucket.lastRefill;
  const maxTokens = TIMEFRAME_CONFIG.RATE_LIMITS.MAX_REQ_PER_SEC * TIMEFRAME_CONFIG.RATE_LIMITS.SAFETY_MARGIN;
  
  if (elapsed > tokenBucket.refillInterval) {
    tokenBucket.tokens = maxTokens;
    tokenBucket.lastRefill = now;
  }
}

function consumeToken(): boolean {
  refillTokens();
  if (tokenBucket.tokens <= 0) return false;
  tokenBucket.tokens--;
  return true;
}

/**
 * Directive 10.7a: Exponential backoff with jitter for rate limiting
 * Smooths scan bursts and provides graceful recovery during network stalls
 */
async function waitForToken(maxRetries: number = 20): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (consumeToken()) {
      return true;
    }
    // Exponential backoff: delay = min(100 * 2^attempt, 1000ms) + random jitter
    const delay = Math.min(100 * Math.pow(2, attempt), 1000);
    const jitter = Math.random() * 50;
    await new Promise(res => setTimeout(res, delay + jitter));
  }
  console.warn(`[10.7a][MTF] Token bucket exhausted after ${maxRetries} retries (exponential backoff)`);
  return false;
}

/**
 * Directive 10.7a: Calculate expected backoff delay for testing
 */
export function calculateBackoffDelay(attempt: number): { baseDelay: number; maxDelay: number } {
  const baseDelay = Math.min(100 * Math.pow(2, attempt), 1000);
  return { baseDelay, maxDelay: baseDelay + 50 };
}

export function getTokenBucketStatus(): { tokens: number; lastRefill: number } {
  refillTokens();
  return {
    tokens: tokenBucket.tokens,
    lastRefill: tokenBucket.lastRefill,
  };
}

export function resetTokenBucket(): void {
  tokenBucket.tokens = TIMEFRAME_CONFIG.RATE_LIMITS.MAX_REQ_PER_SEC * TIMEFRAME_CONFIG.RATE_LIMITS.SAFETY_MARGIN;
  tokenBucket.lastRefill = Date.now();
}

export async function scanTimeframe(
  krakenService: KrakenService,
  interval: Timeframe,
  pairs: string[]
): Promise<TimeframeScanResult[]> {
  if (!TIMEFRAME_CONFIG.ENABLED[interval === '1h' ? 'GLOBAL' : interval === '15m' ? 'TACTICAL' : 'PRECISION']) {
    console.log(`[10.7][MTF] Timeframe ${interval} is disabled, skipping`);
    return [];
  }

  const results: TimeframeScanResult[] = [];
  const krakenInterval = KRAKEN_INTERVAL_MAP[interval];

  for (const symbol of pairs) {
    const hasToken = await waitForToken();
    if (!hasToken) {
      console.warn(`[10.7][MTF] Skipping ${symbol} @ ${interval} - rate limit protection`);
      continue;
    }

    try {
      const { ohlc } = await krakenService.getOHLCData(symbol, krakenInterval);
      
      if (!ohlc || ohlc.length === 0) {
        continue;
      }

      const candles: Candle[] = ohlc.map((c: any) => ({
        timestamp: parseInt(c.time || c[0]) * 1000,
        open: parseFloat(c.open || c[1]),
        high: parseFloat(c.high || c[2]),
        low: parseFloat(c.low || c[3]),
        close: parseFloat(c.close || c[4]),
        volume: parseFloat(c.volume || c[6]),
        timeframe: interval,
      }));

      results.push({
        symbol,
        candles,
        timeframe: interval,
      });
    } catch (error: any) {
      console.log(`[10.7][MTF] Failed to fetch ${symbol} @ ${interval}: ${error.message}`);
    }
  }

  console.log(`[10.7][MTF] Scanned ${results.length}/${pairs.length} pairs @ ${interval}`);
  return results;
}

export function calculateRegimeWeight(candles: Candle[]): number {
  if (candles.length < 5) return 0;
  
  const recent = candles.slice(-5);
  const closes = recent.map(c => c.close);
  
  const trend = (closes[closes.length - 1] - closes[0]) / closes[0];
  const avgVolume = recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
  const lastVolume = recent[recent.length - 1].volume;
  const volumeRatio = lastVolume / (avgVolume || 1);
  
  const trendScore = Math.min(1, Math.abs(trend) * 10);
  const volumeScore = Math.min(1, volumeRatio / 2);
  
  return Math.min(1, (trendScore * 0.7 + volumeScore * 0.3));
}

export function calculatePatternStrength(candles: Candle[]): number {
  if (candles.length < 3) return 0;
  
  const recent = candles.slice(-3);
  const ranges = recent.map(c => c.high - c.low);
  const bodies = recent.map(c => Math.abs(c.close - c.open));
  
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const avgBody = bodies.reduce((a, b) => a + b, 0) / bodies.length;
  
  const clarity = avgBody / (avgRange || 1);
  
  return Math.min(1, clarity);
}

export interface CascadingScanOptions {
  preloadedGlobalData?: TimeframeScanResult[];
}

export async function cascadingScan(
  krakenService: KrakenService,
  eligiblePairs: string[],
  options: CascadingScanOptions = {}
): Promise<CascadingScanResult> {
  if (!TIMEFRAME_CONFIG.CASCADE.ENABLED) {
    console.log('[10.7][MTF] Cascade disabled, running single-timeframe scan');
    const globalPairs = options.preloadedGlobalData || await scanTimeframe(krakenService, '1h', eligiblePairs);
    return { globalPairs, tacticalPairs: [], precisionPairs: [] };
  }

  console.log(`[10.7][MTF] Starting cascading scan for ${eligiblePairs.length} pairs`);

  const globalPairs = options.preloadedGlobalData || await scanTimeframe(krakenService, '1h', eligiblePairs);
  
  for (const result of globalPairs) {
    result.regimeWeight = calculateRegimeWeight(result.candles);
  }

  const tacticalCandidates = globalPairs
    .filter(p => (p.regimeWeight || 0) > TIMEFRAME_CONFIG.CASCADE_CRITERIA.REGIME_WEIGHT_MIN)
    .map(p => p.symbol);

  console.log(`[10.7][MTF] 1H→15m cascade: ${tacticalCandidates.length}/${globalPairs.length} pairs qualify (regimeWeight > ${TIMEFRAME_CONFIG.CASCADE_CRITERIA.REGIME_WEIGHT_MIN})`);

  const tacticalPairs = await scanTimeframe(krakenService, '15m', tacticalCandidates);
  
  for (const result of tacticalPairs) {
    result.patternStrength = calculatePatternStrength(result.candles);
  }

  const precisionCandidates = tacticalPairs
    .filter(p => (p.patternStrength || 0) > TIMEFRAME_CONFIG.CASCADE_CRITERIA.PATTERN_STRENGTH_MIN)
    .map(p => p.symbol);

  console.log(`[10.7][MTF] 15m→5m cascade: ${precisionCandidates.length}/${tacticalPairs.length} pairs qualify (patternStrength > ${TIMEFRAME_CONFIG.CASCADE_CRITERIA.PATTERN_STRENGTH_MIN})`);

  const precisionPairs = await scanTimeframe(krakenService, '5m', precisionCandidates);

  // Directive 10.7a: Cascade Efficiency Telemetry
  const cascadeSummary = {
    global: globalPairs.length,
    tactical: tacticalPairs.length,
    precision: precisionPairs.length,
    tacticalRatio: globalPairs.length > 0 ? (tacticalPairs.length / globalPairs.length).toFixed(2) : '0.00',
    precisionRatio: tacticalPairs.length > 0 ? (precisionPairs.length / tacticalPairs.length).toFixed(2) : '0.00',
  };
  
  console.log(
    `[Cascade Summary] Global=${cascadeSummary.global} → Tactical=${cascadeSummary.tactical} (${cascadeSummary.tacticalRatio}) → Precision=${cascadeSummary.precision} (${cascadeSummary.precisionRatio})`
  );

  return {
    globalPairs,
    tacticalPairs,
    precisionPairs,
  };
}

/**
 * Directive 10.7a: Get cascade telemetry for monitoring
 */
export interface CascadeTelemetry {
  global: number;
  tactical: number;
  precision: number;
  tacticalRatio: string;
  precisionRatio: string;
}

export function computeCascadeTelemetry(result: CascadingScanResult): CascadeTelemetry {
  return {
    global: result.globalPairs.length,
    tactical: result.tacticalPairs.length,
    precision: result.precisionPairs.length,
    tacticalRatio: result.globalPairs.length > 0 
      ? (result.tacticalPairs.length / result.globalPairs.length).toFixed(2) 
      : '0.00',
    precisionRatio: result.tacticalPairs.length > 0 
      ? (result.precisionPairs.length / result.tacticalPairs.length).toFixed(2) 
      : '0.00',
  };
}

export function getTimeframeWeight(timeframe: Timeframe): number {
  return TIMEFRAME_WEIGHTS[timeframe] || 1.0;
}

export function getTimeframeIntervalMs(timeframe: Timeframe): number {
  return CANDLE_INTERVALS_MS[timeframe] || CANDLE_INTERVALS_MS['1h'];
}

export function calculateTimeframeAdjustedDecayLambda(baseLambda: number, timeframe: Timeframe): number {
  const baseInterval = CANDLE_INTERVALS_MS['1h'];
  const targetInterval = CANDLE_INTERVALS_MS[timeframe];
  return baseLambda * (baseInterval / targetInterval);
}

class MultiTimeframeScannerService {
  private krakenService: KrakenService | null = null;

  setKrakenService(service: KrakenService): void {
    this.krakenService = service;
  }

  async scanTimeframe(interval: Timeframe, pairs: string[]): Promise<TimeframeScanResult[]> {
    if (!this.krakenService) {
      console.warn('[10.7][MTF] KrakenService not set, returning empty results');
      return [];
    }
    return scanTimeframe(this.krakenService, interval, pairs);
  }

  async cascadingScan(eligiblePairs: string[]): Promise<CascadingScanResult> {
    if (!this.krakenService) {
      console.warn('[10.7][MTF] KrakenService not set, returning empty results');
      return { globalPairs: [], tacticalPairs: [], precisionPairs: [] };
    }
    return cascadingScan(this.krakenService, eligiblePairs);
  }

  getTokenBucketStatus(): { tokens: number; lastRefill: number } {
    return getTokenBucketStatus();
  }

  resetTokenBucket(): void {
    resetTokenBucket();
  }
}

let instance: MultiTimeframeScannerService | null = null;

export function getMultiTimeframeScanner(): MultiTimeframeScannerService {
  if (!instance) {
    instance = new MultiTimeframeScannerService();
  }
  return instance;
}

export { MultiTimeframeScannerService };
