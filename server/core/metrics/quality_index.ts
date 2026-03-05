/**
 * Phase 8.8.4-B.1/B.2/C: Confidence-Weighted Quality Index (CWQI) with NGC Integration
 * 
 * This module implements the complete signal quality metrics pipeline:
 * 1. NGC (Normalized Global Confidence) - Combines base confidence with volatility and risk
 * 2. ExpectedDuration - Estimates hold time based on signal characteristics
 * 3. ProfitRate - Expected return per unit time
 * 4. CWQI - Comprehensive quality index for signal ranking
 * 
 * CWQI Formula:
 *   CWQI = (NGC * 0.40) + ((1 - Risk) * 0.25) + (ExpectedReturn * 0.20) + (ProfitRate * 0.15)
 * 
 * NGC Formula:
 *   NGC = normalize(base_confidence * (1 - volatility) * (1 - risk))
 * 
 * B.2: Normalization parameters are loaded from config/metrics.json
 * C: Adaptive Rolling Normalization replaces fixed constants
 */

import * as fs from 'fs';
import * as path from 'path';
import { calculateFinalScore, calculateRegimeWeight } from '../utils/score-calculator.js';

interface MetricsConfig {
  NGC_MIN: number;
  NGC_MAX: number;
  PROFITRATE_MIN: number;
  PROFITRATE_MAX: number;
  ER_MIN: number;
  ER_MAX: number;
}

const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  NGC_MIN: 0.15,
  NGC_MAX: 0.70,
  PROFITRATE_MIN: 0.002,
  PROFITRATE_MAX: 0.80,
  ER_MIN: 0.1,
  ER_MAX: 0.8,
};

interface RollingDataPoint {
  value: number;
  timestamp: number;
}

const ROLLING_WINDOW_SIZE = 500;
const ROLLING_WINDOW_MINUTES = 60;

/**
 * M3B: Adaptive relevance interface - replaces static SMOOTHING_ALPHA
 * Values are sourced from VTS learning parameters in real-time
 */
interface AdaptiveRelevanceParams {
  relevance: number;       // Replaces SMOOTHING_ALPHA
  learningRate: number;    // From VTS
  gsi: number;             // Global Stability Index
  lastUpdate: string;
}

// M3B: Default fallback when VTS is not available
let adaptiveRelevance: AdaptiveRelevanceParams = {
  relevance: 0.15,         // Legacy SMOOTHING_ALPHA value as fallback
  learningRate: 0.15,
  gsi: 0.5,
  lastUpdate: new Date().toISOString()
};

/**
 * M3B: Update adaptive relevance from VTS learning parameters
 * Called by VTS service when learning parameters change
 * 
 * Formula (per directive 8.8.4-M3B):
 *   relevance = learningRate * (gsi + 0.15)
 */
export function updateAdaptiveRelevance(params: {
  learningRate: number;
  gsi: number;
}): void {
  const oldRelevance = adaptiveRelevance.relevance;
  
  // M3B: Compute relevance using the mandated formula
  const computedRelevance = params.learningRate * (params.gsi + 0.15);
  
  // Clamp relevance to reasonable bounds [0.05, 0.50]
  const clampedRelevance = Math.max(0.05, Math.min(0.50, computedRelevance));
  
  adaptiveRelevance = {
    relevance: clampedRelevance,
    learningRate: params.learningRate,
    gsi: params.gsi,
    lastUpdate: new Date().toISOString()
  };
  
  // Log significant changes
  const delta = Math.abs(clampedRelevance - oldRelevance);
  if (delta > 0.02) {
    console.log(`[M3B][ADAPTIVE_RELEVANCE] Computed: relevance=${clampedRelevance.toFixed(4)} = ${params.learningRate.toFixed(4)} * (${params.gsi.toFixed(4)} + 0.15) (Δ${(delta * 100).toFixed(1)}%)`);
  }
}

/**
 * M3B: Get current adaptive relevance parameters
 */
export function getAdaptiveRelevance(): AdaptiveRelevanceParams {
  return { ...adaptiveRelevance };
}

class RollingNormalizer {
  private name: string;
  private dataPoints: RollingDataPoint[] = [];
  private smoothedMin: number;
  private smoothedMax: number;
  private defaultMin: number;
  private defaultMax: number;
  private initialized = false;
  
  constructor(name: string, defaultMin: number, defaultMax: number) {
    this.name = name;
    this.defaultMin = defaultMin;
    this.defaultMax = defaultMax;
    this.smoothedMin = defaultMin;
    this.smoothedMax = defaultMax;
    console.log(`[C][ROLLING_NORMALIZATION] Initialized ${name} normalizer with defaults [${defaultMin}, ${defaultMax}]`);
  }
  
  addSample(value: number): void {
    const now = Date.now();
    this.dataPoints.push({ value, timestamp: now });
    
    this.pruneOldData(now);
    
    if (this.dataPoints.length >= 10) {
      const rawMin = Math.min(...this.dataPoints.map(d => d.value));
      const rawMax = Math.max(...this.dataPoints.map(d => d.value));
      
      if (!this.initialized) {
        this.smoothedMin = rawMin;
        this.smoothedMax = rawMax;
        this.initialized = true;
      } else {
        // M3B: Use adaptive relevance from VTS instead of static SMOOTHING_ALPHA
        const alpha = adaptiveRelevance.relevance;
        this.smoothedMin = alpha * rawMin + (1 - alpha) * this.smoothedMin;
        this.smoothedMax = alpha * rawMax + (1 - alpha) * this.smoothedMax;
      }
    }
  }
  
  private pruneOldData(now: number): void {
    const cutoffTime = now - ROLLING_WINDOW_MINUTES * 60 * 1000;
    
    this.dataPoints = this.dataPoints.filter(d => d.timestamp >= cutoffTime);
    
    if (this.dataPoints.length > ROLLING_WINDOW_SIZE) {
      this.dataPoints = this.dataPoints.slice(-ROLLING_WINDOW_SIZE);
    }
  }
  
  /**
   * Directive A3.R8.3: Conditional normalization
   * Only normalize if value is outside [0,1] range
   * This prevents double-normalization of already-bounded metrics
   */
  normalize(value: number): number {
    // A3.R8.3: If already in [0,1] range, return as-is to prevent compression
    if (value >= 0 && value <= 1) {
      return value;
    }
    
    const min = this.getMin();
    const max = this.getMax();
    const range = max - min;
    
    if (range <= 0.001) {
      return 0.5;
    }
    
    return Math.max(0, Math.min(1, (value - min) / range));
  }
  
  getMin(): number {
    return this.initialized ? this.smoothedMin : this.defaultMin;
  }
  
  getMax(): number {
    return this.initialized ? this.smoothedMax : this.defaultMax;
  }
  
  getStats(): { min: number; max: number; sampleCount: number; initialized: boolean } {
    return {
      min: this.getMin(),
      max: this.getMax(),
      sampleCount: this.dataPoints.length,
      initialized: this.initialized,
    };
  }
  
  reset(): void {
    this.dataPoints = [];
    this.smoothedMin = this.defaultMin;
    this.smoothedMax = this.defaultMax;
    this.initialized = false;
    console.log(`[C][ROLLING_NORMALIZATION] Reset ${this.name} normalizer`);
  }
}

const ngcNormalizer = new RollingNormalizer('NGC', DEFAULT_METRICS_CONFIG.NGC_MIN, DEFAULT_METRICS_CONFIG.NGC_MAX);
const profitRateNormalizer = new RollingNormalizer('ProfitRate', DEFAULT_METRICS_CONFIG.PROFITRATE_MIN, DEFAULT_METRICS_CONFIG.PROFITRATE_MAX);
const expectedReturnNormalizer = new RollingNormalizer('ExpectedReturn', DEFAULT_METRICS_CONFIG.ER_MIN, DEFAULT_METRICS_CONFIG.ER_MAX);

export function getRollingNormalizerStats(): {
  ngc: { min: number; max: number; sampleCount: number; initialized: boolean };
  profitRate: { min: number; max: number; sampleCount: number; initialized: boolean };
  expectedReturn: { min: number; max: number; sampleCount: number; initialized: boolean };
} {
  return {
    ngc: ngcNormalizer.getStats(),
    profitRate: profitRateNormalizer.getStats(),
    expectedReturn: expectedReturnNormalizer.getStats(),
  };
}

export function resetRollingNormalizers(): void {
  ngcNormalizer.reset();
  profitRateNormalizer.reset();
  expectedReturnNormalizer.reset();
  console.log('[C][ROLLING_NORMALIZATION] All normalizers reset');
}

let metricsConfig: MetricsConfig = { ...DEFAULT_METRICS_CONFIG };
let configLoaded = false;

function loadMetricsConfig(): MetricsConfig {
  if (configLoaded) {
    return metricsConfig;
  }
  
  try {
    const configPath = path.resolve(process.cwd(), 'config/metrics.json');
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(configData);
      metricsConfig = {
        NGC_MIN: parsed.NGC_MIN ?? DEFAULT_METRICS_CONFIG.NGC_MIN,
        NGC_MAX: parsed.NGC_MAX ?? DEFAULT_METRICS_CONFIG.NGC_MAX,
        PROFITRATE_MIN: parsed.PROFITRATE_MIN ?? DEFAULT_METRICS_CONFIG.PROFITRATE_MIN,
        PROFITRATE_MAX: parsed.PROFITRATE_MAX ?? DEFAULT_METRICS_CONFIG.PROFITRATE_MAX,
        ER_MIN: parsed.ER_MIN ?? DEFAULT_METRICS_CONFIG.ER_MIN,
        ER_MAX: parsed.ER_MAX ?? DEFAULT_METRICS_CONFIG.ER_MAX,
      };
      configLoaded = true;
      console.log(`[B.2][CONFIG] Loaded normalization parameters: NGC=[${metricsConfig.NGC_MIN},${metricsConfig.NGC_MAX}], ProfitRate=[${metricsConfig.PROFITRATE_MIN},${metricsConfig.PROFITRATE_MAX}], ER=[${metricsConfig.ER_MIN},${metricsConfig.ER_MAX}]`);
    } else {
      console.log('[B.2][CONFIG] config/metrics.json not found, using defaults');
    }
  } catch (err) {
    console.log('[B.2][CONFIG] Error loading config, using defaults:', err);
  }
  
  configLoaded = true;
  return metricsConfig;
}

export function getMetricsConfig(): MetricsConfig {
  return loadMetricsConfig();
}

export interface CWQIComponents {
  confidence: number;      // Base confidence 0.0 to 1.0
  riskScore: number;       // 0.0 to 1.0 (lower is better)
  expectedReturn: number;  // 0.0 to 1.0
  volatility?: number;     // 0.0 to 1.0 (optional, defaults to 0.3)
}

export interface ExtendedCWQIComponents extends CWQIComponents {
  ngc: number;             // Normalized Global Confidence 0.0 to 1.0
  expectedDuration: number; // Expected hold time in minutes
  profitRate: number;      // Normalized profit per time unit 0.0 to 1.0
}

export interface CWQIResult {
  cwqi: number;
  ngc: number;
  components: ExtendedCWQIComponents;
  breakdown: {
    ngcContribution: number;
    riskContribution: number;
    returnContribution: number;
    profitRateContribution: number;
  };
}

const NGC_WEIGHT = 0.40;
const RISK_WEIGHT = 0.25;
const RETURN_WEIGHT = 0.20;
const PROFIT_RATE_WEIGHT = 0.15;

const DEFAULT_VOLATILITY = 0.3;
const DEFAULT_HOLD_TIME_MINUTES = 60;

/**
 * Clamp a value between 0 and 1
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Directive 12.3.3: Deterministic Confidence (replaces NGC)
 *
 * NGC (Normalized Global Confidence) has been replaced with a deterministic
 * confidence formula that is transparent, reproducible, and free of rolling
 * normalization artifacts.
 *
 * Formula:
 *   confidence = (strategyConfidence * 0.60) + ((1 - volatility) * 0.20) + ((1 - riskScore) * 0.20)
 *
 * This produces values in [0.0, 1.0] directly without normalization.
 * The function name and signature are preserved for backward compatibility.
 *
 * @param baseConfidence - Raw signal confidence from strategy (0-1)
 * @param volatility - Market volatility factor (0-1, default 0.3)
 * @param riskScore - Risk assessment score (0-1)
 * @param trackSample - DEPRECATED: no-op, kept for backward compatibility
 * @returns Deterministic confidence (0-1)
 */
export function calculateNGC(
  baseConfidence: number,
  volatility: number = DEFAULT_VOLATILITY,
  riskScore: number,
  trackSample: boolean = true
): number {
  const conf = clamp01(baseConfidence);
  const vol = clamp01(volatility);
  const risk = clamp01(riskScore);

  // Directive 12.3.3: Deterministic confidence — no rolling normalization
  const deterministicConfidence = (conf * 0.60) + ((1 - vol) * 0.20) + ((1 - risk) * 0.20);

  console.log(`[12.3.3][CONFIDENCE] conf=${conf.toFixed(3)} vol=${vol.toFixed(3)} risk=${risk.toFixed(3)} → confidence=${deterministicConfidence.toFixed(4)}`);

  return Math.round(clamp01(deterministicConfidence) * 10000) / 10000;
}

/**
 * Estimate expected hold duration for a trade
 * 
 * Duration is influenced by:
 * - Strategy type (some strategies have shorter hold times)
 * - Volatility (higher volatility = shorter expected duration)
 * - ATR-based momentum (larger ATR = faster price movement)
 * - Historical average hold time
 * 
 * @param volatility - Market volatility (0-1)
 * @param atr - Average True Range (optional)
 * @param entryPrice - Entry price for ATR normalization
 * @param historicalHoldTime - Historical average hold time in minutes
 * @returns Expected duration in minutes
 */
export function estimateExpectedDuration(
  volatility: number = DEFAULT_VOLATILITY,
  atr?: number,
  entryPrice?: number,
  historicalHoldTime: number = DEFAULT_HOLD_TIME_MINUTES
): number {
  const vol = clamp01(volatility);
  
  let baseDuration = historicalHoldTime;
  
  const volatilityFactor = 1 - (vol * 0.5);
  baseDuration *= volatilityFactor;
  
  if (atr && entryPrice && entryPrice > 0) {
    const atrPercent = (atr / entryPrice) * 100;
    const atrFactor = Math.max(0.5, 1 - (atrPercent / 10));
    baseDuration *= atrFactor;
  }
  
  const minDuration = 5;
  const maxDuration = 240;
  
  return Math.round(Math.max(minDuration, Math.min(maxDuration, baseDuration)));
}

/**
 * Calculate Profit Rate (expected return per unit time)
 * 
 * ProfitRate = normalize(ExpectedReturn / ExpectedDuration)
 * 
 * Higher profit rate means better risk-adjusted returns over time.
 * 
 * Phase C: Uses adaptive rolling normalization with exponential smoothing
 * 
 * Directive A3.R8.3: Added minimum floor of 0.15 to prevent zero profit rate
 * when target ≈ entry price, which was causing VWAP signals to be rejected.
 * 
 * @param expectedReturn - Expected return (0-1)
 * @param expectedDuration - Expected duration in minutes
 * @param trackSample - Whether to track this sample for rolling normalization (default true)
 * @returns Normalized profit rate (0-1)
 */
export function calculateProfitRate(
  expectedReturn: number,
  expectedDuration: number,
  trackSample: boolean = true
): number {
  if (expectedDuration <= 0) {
    return 0.15; // A3.R8.3: Return floor instead of 0
  }
  
  const returnVal = clamp01(expectedReturn);
  
  const rawRate = (returnVal * 60) / expectedDuration;
  
  if (trackSample) {
    profitRateNormalizer.addSample(rawRate);
  }
  
  const normalizedRate = profitRateNormalizer.normalize(rawRate);
  
  // Directive A3.R8.3: Apply minimum floor to prevent zero profit rate
  const flooredRate = Math.max(normalizedRate, 0.15);
  
  return Math.round(flooredRate * 10000) / 10000;
}

/**
 * Calculate the Confidence-Weighted Quality Index (CWQI)
 * 
 * New B.1 Formula:
 *   CWQI = (NGC * 0.40) + ((1 - Risk) * 0.25) + (ExpectedReturn * 0.20) + (ProfitRate * 0.15)
 * 
 * @param components - The quality components to evaluate
 * @returns CWQIResult with the calculated index and breakdown
 */
export function calculateCWQI(components: CWQIComponents): CWQIResult {
  const confidence = clamp01(components.confidence);
  const riskScore = clamp01(components.riskScore);
  const expectedReturn = clamp01(components.expectedReturn);
  const volatility = clamp01(components.volatility ?? DEFAULT_VOLATILITY);
  
  const ngc = calculateNGC(confidence, volatility, riskScore);
  
  const expectedDuration = estimateExpectedDuration(volatility);
  
  const profitRate = calculateProfitRate(expectedReturn, expectedDuration);
  
  const ngcContribution = ngc * NGC_WEIGHT;
  const riskContribution = (1 - riskScore) * RISK_WEIGHT;
  const returnContribution = expectedReturn * RETURN_WEIGHT;
  const profitRateContribution = profitRate * PROFIT_RATE_WEIGHT;
  
  const cwqi = ngcContribution + riskContribution + returnContribution + profitRateContribution;
  
  return {
    cwqi: Math.round(cwqi * 10000) / 10000,
    ngc: ngc,
    components: {
      confidence,
      riskScore,
      expectedReturn,
      volatility,
      ngc,
      expectedDuration,
      profitRate,
    },
    breakdown: {
      ngcContribution: Math.round(ngcContribution * 10000) / 10000,
      riskContribution: Math.round(riskContribution * 10000) / 10000,
      returnContribution: Math.round(returnContribution * 10000) / 10000,
      profitRateContribution: Math.round(profitRateContribution * 10000) / 10000,
    },
  };
}

/**
 * Directive A3.R8.3: Calculate CWQI with a pre-computed NGC and profitRate
 * 
 * This version allows passing in externally-computed metrics, ensuring that
 * the profitability-informed NGC is used in the CWQI calculation.
 * 
 * @param precomputed - Pre-computed metrics including NGC and profitRate
 * @returns CWQIResult with the calculated index and breakdown
 */
export function calculateCWQIWithPrecomputedMetrics(precomputed: {
  confidence: number;
  riskScore: number;
  expectedReturn: number;
  volatility: number;
  ngc: number;
  expectedDuration: number;
  profitRate: number;
}): CWQIResult {
  const confidence = clamp01(precomputed.confidence);
  const riskScore = clamp01(precomputed.riskScore);
  const expectedReturn = clamp01(precomputed.expectedReturn);
  const volatility = clamp01(precomputed.volatility ?? DEFAULT_VOLATILITY);
  const ngc = clamp01(precomputed.ngc);
  const profitRate = clamp01(precomputed.profitRate);
  const expectedDuration = precomputed.expectedDuration;
  
  const ngcContribution = ngc * NGC_WEIGHT;
  const riskContribution = (1 - riskScore) * RISK_WEIGHT;
  const returnContribution = expectedReturn * RETURN_WEIGHT;
  const profitRateContribution = profitRate * PROFIT_RATE_WEIGHT;
  
  const cwqi = ngcContribution + riskContribution + returnContribution + profitRateContribution;
  
  return {
    cwqi: Math.round(cwqi * 10000) / 10000,
    ngc: Math.round(ngc * 10000) / 10000,
    components: {
      confidence,
      riskScore,
      expectedReturn,
      volatility,
      ngc,
      expectedDuration,
      profitRate,
    },
    breakdown: {
      ngcContribution: Math.round(ngcContribution * 10000) / 10000,
      riskContribution: Math.round(riskContribution * 10000) / 10000,
      returnContribution: Math.round(returnContribution * 10000) / 10000,
      profitRateContribution: Math.round(profitRateContribution * 10000) / 10000,
    },
  };
}

/**
 * Calculate expected return from entry/target/stop prices
 * 
 * Phase C: Uses adaptive rolling normalization with exponential smoothing
 * 
 * Directive A3.R8.3: Added minimum floor to prevent zero rounding when
 * target ≈ entry, which was causing VWAP signals to be rejected.
 * 
 * @param entryPrice - Entry price
 * @param targetPrice - Target/take-profit price
 * @param stopPrice - Stop-loss price
 * @param trackSample - Whether to track this sample for rolling normalization (default true)
 * @returns Normalized expected return (0-1)
 */
export function calculateExpectedReturn(
  entryPrice: number,
  targetPrice: number | undefined,
  stopPrice: number,
  trackSample: boolean = true
): number {
  if (!targetPrice || targetPrice <= entryPrice || stopPrice >= entryPrice) {
    return 0.3;
  }
  
  const potentialGain = targetPrice - entryPrice;
  const potentialLoss = entryPrice - stopPrice;
  
  if (potentialLoss <= 0) {
    return 0.3;
  }
  
  const rrRatio = potentialGain / potentialLoss;
  
  const rawReturn = rrRatio / (rrRatio + 2);
  
  if (trackSample) {
    expectedReturnNormalizer.addSample(rawReturn);
  }
  
  const normalizedReturn = expectedReturnNormalizer.normalize(rawReturn);
  
  return Math.round(normalizedReturn * 10000) / 10000;
}

/**
 * Calculate risk score from stop distance and ATR
 * Higher stop distance relative to ATR = higher risk
 * 
 * @param entryPrice - Entry price
 * @param stopPrice - Stop-loss price
 * @param atr - Average True Range (optional)
 * @returns Normalized risk score (0-1, lower is better)
 */
export function calculateRiskScore(
  entryPrice: number,
  stopPrice: number,
  atr?: number
): number {
  const stopDistance = Math.abs(entryPrice - stopPrice);
  const stopPercent = (stopDistance / entryPrice) * 100;
  
  let baseRisk = Math.min(1, stopPercent / 5);
  
  if (atr && atr > 0) {
    const atrMultiple = stopDistance / atr;
    const atrRisk = Math.min(1, atrMultiple / 3);
    baseRisk = (baseRisk * 0.4) + (atrRisk * 0.6);
  }
  
  return Math.round(baseRisk * 10000) / 10000;
}

/**
 * Estimate volatility from price data
 * 
 * @param high24h - 24-hour high price
 * @param low24h - 24-hour low price
 * @param currentPrice - Current price
 * @returns Volatility score (0-1)
 */
export function estimateVolatility(
  high24h?: number,
  low24h?: number,
  currentPrice?: number
): number {
  if (!high24h || !low24h || !currentPrice || currentPrice <= 0) {
    return DEFAULT_VOLATILITY;
  }
  
  const range = high24h - low24h;
  const rangePercent = (range / currentPrice) * 100;
  
  const volatility = Math.min(1, rangePercent / 15);
  
  return Math.round(volatility * 10000) / 10000;
}

/**
 * Calculate all CWQI components from signal data with full B.1 metrics
 */
export function calculateCWQIFromSignal(signal: {
  confidence: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  atr?: number;
  volatility?: number;
  high24h?: number;
  low24h?: number;
}): CWQIResult {
  const expectedReturn = calculateExpectedReturn(
    signal.entryPrice,
    signal.targetPrice,
    signal.stopPrice
  );
  
  const riskScore = calculateRiskScore(
    signal.entryPrice,
    signal.stopPrice,
    signal.atr
  );
  
  const volatility = signal.volatility ?? estimateVolatility(
    signal.high24h,
    signal.low24h,
    signal.entryPrice
  );
  
  return calculateCWQI({
    confidence: signal.confidence,
    riskScore,
    expectedReturn,
    volatility,
  });
}

/**
 * Calculate extended metrics for a signal (used by Signal Orchestrator)
 * Returns all derived metrics: confidence, FinalScore, RegimeWeight, ExpectedDuration, ProfitRate, CWQI
 * 
 * Phase 14: Deterministic confidence + FinalScore pipeline
 * 1. First compute base metrics (expectedReturn, riskScore, volatility, expectedDuration, profitRate)
 * 2. Compute confidence as deterministic blend:
 *    confidence = (baseConfidence * 0.50) + (profitRate * 0.30) + ((1-risk) * 0.20)
 * 3. Compute RegimeWeight and FinalScore using centralized score-calculator
 * 4. Finally compute CWQI using this profitability-informed confidence
 */
export function calculateExtendedSignalMetrics(signal: {
  confidence: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  atr?: number;
  volatility?: number;
  high24h?: number;
  low24h?: number;
  historicalHoldTime?: number;
  // Phase 14: Additional inputs for FinalScore/RegimeWeight computation
  hybridScore?: number;
  trendStrength?: number;
}): {
  confidence: number;
  finalScore: number;
  regimeWeight: number;
  expectedReturn: number;
  riskScore: number;
  volatility: number;
  expectedDuration: number;
  profitRate: number;
  cwqi: number;
  cwqiResult: CWQIResult;
} {
  // Step 1: Compute base metrics FIRST (without NGC dependency)
  const expectedReturn = calculateExpectedReturn(
    signal.entryPrice,
    signal.targetPrice,
    signal.stopPrice
  );
  
  const riskScore = calculateRiskScore(
    signal.entryPrice,
    signal.stopPrice,
    signal.atr
  );
  
  const volatility = signal.volatility ?? estimateVolatility(
    signal.high24h,
    signal.low24h,
    signal.entryPrice
  );
  
  const expectedDuration = estimateExpectedDuration(
    volatility,
    signal.atr,
    signal.entryPrice,
    signal.historicalHoldTime
  );
  
  const profitRate = calculateProfitRate(expectedReturn, expectedDuration);
  
  // Directive 12.3.3: Deterministic confidence (replaces NGC blending)
  // Formula: confidence = (strategyConf * 0.60) + ((1-vol) * 0.20) + ((1-risk) * 0.20)
  // Then blend with profitRate for final quality metric:
  // finalConfidence = (baseConfidence * 0.50) + (profitRate * 0.30) + ((1-risk) * 0.20)
  const baseConfidence = calculateNGC(signal.confidence, volatility, riskScore, false);
  const nProfit = clamp01(profitRate);
  const nRisk = clamp01(1 - riskScore);

  // Directive 12.3.3: Deterministic blending — transparent, no rolling normalization
  const confidence = clamp01((baseConfidence * 0.50) + (nProfit * 0.30) + (nRisk * 0.20));

  console.log(`[12.3.3][CONFIDENCE] base=${baseConfidence.toFixed(3)} profit=${nProfit.toFixed(3)} risk=${nRisk.toFixed(3)} → confidence=${confidence.toFixed(3)}`);

  // Step 3: Compute RegimeWeight and FinalScore
  const regimeWeight = calculateRegimeWeight({
    trendStrength: signal.trendStrength ?? 0.5,
    volatility,
  });
  const finalScore = calculateFinalScore({
    confidence,
    hybridScore: signal.hybridScore ?? confidence,
    regimeWeight,
  });
  console.log(`[Phase14][EXTENDED_METRICS] regimeWeight=${regimeWeight.toFixed(4)} finalScore=${finalScore.toFixed(4)}`);

  // Step 4: Compute CWQI using the profitability-informed confidence
  const cwqiResult = calculateCWQIWithPrecomputedMetrics({
    confidence: signal.confidence,
    riskScore,
    expectedReturn,
    volatility,
    ngc: confidence,
    expectedDuration,
    profitRate,
  });

  return {
    confidence: Math.round(confidence * 10000) / 10000,
    finalScore,
    regimeWeight,
    expectedReturn,
    riskScore,
    volatility,
    expectedDuration,
    profitRate,
    cwqi: cwqiResult.cwqi,
    cwqiResult,
  };
}

/**
 * Compare two CWQI values for sorting (descending - higher first)
 */
export function compareCWQI(a: number, b: number): number {
  return b - a;
}

/**
 * Get CWQI ranking tier
 */
export function getCWQITier(cwqi: number): 'excellent' | 'good' | 'moderate' | 'poor' {
  if (cwqi >= 0.7) return 'excellent';
  if (cwqi >= 0.5) return 'good';
  if (cwqi >= 0.3) return 'moderate';
  return 'poor';
}

/**
 * Phase 8.8.4-C.11 SQE Thresholds
 * These are the filtering thresholds for Signal Quality Evaluator
 * Parameterized via environment variables for runtime configuration
 * 
 * Directive A3.R9.0: System Harmonization & Performance Alignment
 * - MIN_NGC: 0.55 (restored for meaningful filtering)
 * - MIN_CWQI: 0.45 (restored for meaningful filtering)
 * - Target SQE pass rate: 35-50%
 * 
 * Directive 10.9A: FinalScore-based filtering
 * - MIN_FINAL_SCORE: 0.35 (minimum unified score threshold)
 * - MIN_REGIME_WEIGHT: 0.30 (minimum regime alignment)
 */
export const SQE_THRESHOLDS = {
  MIN_NGC: parseFloat(process.env.SQE_NGC_MIN || '0.55'),
  MAX_RISK: parseFloat(process.env.SQE_MAX_RISK || '0.85'),
  MIN_PROFIT_RATE: parseFloat(process.env.SQE_PROFIT_MIN || '0.10'),
  MIN_CWQI: parseFloat(process.env.SQE_CWQI_MIN || '0.45'),
  // Directive 10.9A: FinalScore-based thresholds
  MIN_FINAL_SCORE: parseFloat(process.env.SQE_FINAL_SCORE_MIN || '0.35'),
  MIN_REGIME_WEIGHT: parseFloat(process.env.SQE_REGIME_MIN || '0.30'),
};

console.log(`[A3.R9.0][SQE_CONFIG] NGC=${SQE_THRESHOLDS.MIN_NGC} CWQI=${SQE_THRESHOLDS.MIN_CWQI} PROFIT=${SQE_THRESHOLDS.MIN_PROFIT_RATE} RISK=${SQE_THRESHOLDS.MAX_RISK} FinalScore=${SQE_THRESHOLDS.MIN_FINAL_SCORE} Regime=${SQE_THRESHOLDS.MIN_REGIME_WEIGHT}`);
console.log('[A3.R9.0] System Harmonization & Performance Alignment active');

/**
 * Minimum CWQI threshold for queue eligibility (updated for C.11)
 */
export const MIN_QUEUE_CWQI = SQE_THRESHOLDS.MIN_CWQI;

/**
 * Minimum confidence threshold for queue eligibility
 * Note: This now refers to NGC, not raw confidence
 */
export const MIN_QUEUE_CONFIDENCE = SQE_THRESHOLDS.MIN_NGC;
