/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 11.0E.1 (Upgraded from 8.8.4-M5C)
 * ══════════════════════════════════════════════════════════════════════════════
 * VTS Runner - Autonomous Virtual Trading Simulator (Phase 10 Modernized)
 * 
 * Purpose: Runs autonomous virtual trade simulation independent of live trading.
 * Sources data from Ideal Pool and calculates pair-level market regimes.
 * 
 * Directive 11.0E.1 Features:
 * - Phase-10 canonical math (finalScore, hybridScore, regimeWeight, decayPenalty)
 * - Per-pair regime calculation (BULL_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP, etc.)
 * - Regime → Strategy mapping with signalType selection
 * - 100-pair Ideal Pool integration
 * - Automatic stop when tradingActive=true
 * - Generates virtual trades for Telemetry + Predictive Learning
 * 
 * Legacy Features (Preserved):
 * - Autonomous signal generation when passiveLearning=true
 * - 60-second simulation loop
 * - Trade recording to /data/vts_trades_<timestamp>.json
 * 
 * Schema: v1.6.6
 * Governance: M45, M46, M47, M48, M49
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { vtsService, type VirtualSignal } from './vts-service.js';
import { loadCalibration, applyCalibration, type CalibrationCoefficients } from '../utils/calibration.js';
import { priceCache, type CachedPrice, type CacheBucketType } from './price-cache.js';
import { systemConfigService } from './system-config.js';
import { activeFilterPool } from './active-filter-pool.js';
import { getTelemetryAggregator } from './telemetry-aggregator.js';
import { fx5Scanner, type ScanBatchPair } from './fx5-scanner.js';
import { KrakenService } from './kraken.js';
import { computeStrategyWeights, getWeightSync } from '../utils/strategyWeights.js';
import { computeExposureBias, getExposureMultiplierSync } from '../utils/strategyBias.js';
import { getCachedCostMetrics, computeNetGeometry } from '../core/math/cost-model.js';
import { compareLatestSessions, savePaperSessionTrades, getPaperSessionTrades } from './vts-live-comparison-audit.js';
import { SCORE_WEIGHTS } from '../config/score-weights.config.js';
import { calculatePairRegime, getRegimeWeight, calculateRegimeScore } from '../core/metrics/market-regime.js';
import { 
  CANONICAL_REGIME_STRATEGY_MAP as REGIME_STRATEGY_MAP, 
  selectContextAwareStrategy,
  symbolToHash,
  getRegimeRiskMultiplier,
  normalizeStrategy,
  type CanonicalRegimeType as MarketRegimeType,
  type CanonicalSignalType
} from '../config/canonical-regime-strategy-map.js';
import type { OHLCData } from '../types/market-regime.types';
import type { VTSCycleMetrics } from '../types/virtual-trade.interface';
import { scanPatterns } from './pattern-recognizer.js';
import type { PatternType } from '../types';
import { normalizeToInternalSymbol, getSymbolMappingDetails } from '../markets/kraken-symbol-resolver.js';
import fs from 'fs/promises';
import path from 'path';

async function getSystemConfig() {
  const config = await systemConfigService.getConfig();
  return {
    tradingActive: !(config?.passiveLearning ?? true),
    passiveLearning: config?.passiveLearning ?? true
  };
}

let isInitialized = false;
let calibration: CalibrationCoefficients | null = null;
let autonomousLoopInterval: NodeJS.Timeout | null = null;
let isAutonomousRunning = false;
let sessionStartTime: number | null = null;
let cycleCount = 0;
let patternRecognitionWarmedUp = false;

interface VTSConfig {
  autonomousMode: boolean;
  simulationIntervalSec: number;
  pairsPerCycle: number;
  strategies: string[];
  targetProfit: number;
  stopLoss: number;
  minVolume24h: number;
  minPrice: number;
}

const DEFAULT_CONFIG: VTSConfig = {
  autonomousMode: true,
  simulationIntervalSec: 60,
  pairsPerCycle: 100,
  strategies: [
    'vwap_pullback', 'sma_trend_ride', 'breakout', 'range_trade', 
    'support_bounce', 'vwap_bounce', 'mean_reversion', 'liquidity_trap'
  ],
  targetProfit: 0.015,
  stopLoss: 0.008,
  minVolume24h: 50000,
  minPrice: 0.5
};

let vtsConfig: VTSConfig = { ...DEFAULT_CONFIG };

async function loadVTSConfig(): Promise<VTSConfig> {
  try {
    const configPath = path.join(process.cwd(), 'config', 'vts.json');
    const content = await fs.readFile(configPath, 'utf-8');
    const loaded = JSON.parse(content);
    vtsConfig = { ...DEFAULT_CONFIG, ...loaded };
    console.log('[11.0E.1][VTS_CONFIG] Loaded config:', JSON.stringify(vtsConfig, null, 2));
    return vtsConfig;
  } catch (error) {
    console.warn('[11.0E.1][VTS_CONFIG] Using default config (file not found or invalid)');
    return DEFAULT_CONFIG;
  }
}

interface Phase10TradeRecord {
  symbol: string;
  regime: MarketRegimeType;
  regimeScore?: number; // Directive 11.4H.4A: Dynamic 0-100 score for telemetry
  signalType: CanonicalSignalType;
  strategy: string;
  patternType?: PatternType | null;
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
  frictionCost: number;
  entry: number;
  exit?: number;
  profit?: number;
  positionSize: number;
  pool?: 'ideal' | 'rotational';
  timestamp: string;
}

let phase10SessionTrades: Phase10TradeRecord[] = [];
let phase10SessionStartTime: number | null = null;

async function getPortfolioValue(): Promise<number> {
  try {
    const config = await systemConfigService.getConfig() as any;
    return config?.paperBalance ?? 1000;
  } catch {
    return 1000;
  }
}

async function getRiskPerTrade(): Promise<number> {
  try {
    const config = await systemConfigService.getConfig() as any;
    return config?.riskPerTrade ?? 0.02;
  } catch {
    return 0.02;
  }
}

function computePositionSize(
  portfolioValue: number, 
  riskPerTrade: number, 
  entryPrice: number, 
  stopPrice: number, 
  riskMultiplier: number
): number {
  const stopDistance = Math.abs(entryPrice - stopPrice) / entryPrice;
  if (stopDistance <= 0) return 0;
  
  const riskAmount = portfolioValue * riskPerTrade * riskMultiplier;
  const positionSize = riskAmount / stopDistance;
  
  const maxPositionSize = portfolioValue * 0.25;
  return Math.min(positionSize, maxPositionSize);
}

function computeFinalScore(
  hybridScore: number,
  predictiveConfidence: number,
  regimeWeight: number,
  decayPenalty: number
): number {
  const { FINAL_SCORE } = SCORE_WEIGHTS;
  return (
    hybridScore * FINAL_SCORE.HYBRID +
    predictiveConfidence * FINAL_SCORE.CONFIDENCE +
    regimeWeight * FINAL_SCORE.REGIME -
    decayPenalty * FINAL_SCORE.DECAY
  );
}

const vtsKrakenService = new KrakenService();

async function fetchOHLCForPair(symbol: string): Promise<OHLCData[]> {
  try {
    const { ohlc } = await vtsKrakenService.getOHLCData(symbol, 15, undefined, { maxCandlesTotal: 50 });
    
    if (!ohlc || ohlc.length === 0) {
      return [];
    }
    
    return ohlc.map((candle: any) => ({
      open: parseFloat(candle.open || candle[1]),
      high: parseFloat(candle.high || candle[2]),
      low: parseFloat(candle.low || candle[3]),
      close: parseFloat(candle.close || candle[4]),
      volume: parseFloat(candle.volume || candle[6] || 0),
      timestamp: candle.timestamp || candle[0] * 1000
    }));
  } catch (error) {
    console.warn(`[11.0E.1][VTS] OHLC fetch failed for ${symbol}:`, error);
    return [];
  }
}

function simulateHybridScore(regime: MarketRegimeType): number {
  const baseScores: Record<MarketRegimeType, number> = {
    BULL_STABLE: 0.75,
    BEAR_VOLATILE: 0.45,
    LOW_VOL_CHOP: 0.55,
    HIGH_VOL_IMPULSE: 0.65,
    TRANSITION: 0.50
  };
  const base = baseScores[regime] ?? 0.5;
  return Math.min(0.95, Math.max(0.1, base + (Math.random() - 0.5) * 0.2));
}

function simulatePredictiveConfidence(regime: MarketRegimeType, hybridScore: number): number {
  const base = hybridScore * 0.8 + 0.1;
  return Math.min(0.95, Math.max(0.1, base + (Math.random() - 0.5) * 0.15));
}

function simulateDecayPenalty(): number {
  return Math.random() * 0.15;
}

async function generatePhase10Signal(
  symbol: string, 
  priceData: CachedPrice, 
  ohlcData: OHLCData[],
  pool: 'ideal' | 'rotational'
): Promise<{ signal: VirtualSignal; tradeRecord: Phase10TradeRecord } | null> {
  const regimeResult = calculatePairRegime(ohlcData);
  const regime = regimeResult.regime;
  
  const riskMultiplier = getRegimeRiskMultiplier(regime);
  
  // Directive 11.4C.3 Task 2: Pattern injection - detect patterns from OHLC data
  const candles = ohlcData.map(o => ({
    timestamp: o.timestamp,
    open: o.open,
    high: o.high,
    low: o.low,
    close: o.close,
    volume: o.volume
  }));
  
  const detectedPatterns = scanPatterns(candles, symbol);
  const detectedPattern = detectedPatterns.length > 0 ? detectedPatterns[0] : null;
  
  // Directive 11.4G: Use context-aware strategy selection
  // If pattern detected, this will select HYBRID/PATTERN strategies when available
  const sHash = symbolToHash(symbol);
  const strategySelection = selectContextAwareStrategy(
    regime, 
    detectedPattern?.pattern ?? null,
    sHash
  );
  
  let { signalType, strategy, patternType: canonicalPatternType } = strategySelection;
  const selectionReason = strategySelection.selectionReason;
  
  // Directive 11.4C.3-C: Log guard for unmapped strategies
  if (!signalType) {
    console.warn(`[11.4C.3-C][VTS] Unmapped strategy: ${strategy} for regime ${regime}`);
    signalType = 'HYBRID'; // Default fallback
  }
  
  // Log when non-primary strategy is selected (for diagnostic tracing)
  if (selectionReason !== 'primary') {
    console.log(`[11.4G][VTS] ${symbol}: ${signalType}/${strategy} selected via ${selectionReason}`);
  }
  
  // Directive 11.4C.3 (Modified): Pattern validation for HYBRID/PATTERN signals
  // HYBRID signals without pattern use strategy's canonical patternType
  // PATTERN signals without detected pattern: still discard (maintains quality)
  if (signalType === 'PATTERN' && !detectedPattern && selectionReason === 'diversity') {
    console.log(`[11.4C.3][VTS] ${symbol}: PATTERN signal from diversity without pattern - reverting to QUANT`);
    signalType = 'QUANT';
  }
  
  // Directive 11.4G: ALWAYS use canonical patternType from strategy selection
  // The canonicalPatternType is already normalized; detected pattern is only for logging
  // This ensures downstream canonical validation never receives non-canonical pattern names
  const patternType: PatternType | null = canonicalPatternType as PatternType | null;
  
  // Log detected pattern for diagnostics but don't use it in trade record
  if (detectedPattern && detectedPattern.pattern !== canonicalPatternType) {
    console.debug(`[11.4G][VTS] ${symbol}: Detected ${detectedPattern.pattern} → canonical ${canonicalPatternType}`);
  }
  
  const entryPrice = priceData.price;
  const volatility = priceData.high24h > 0 && priceData.low24h > 0
    ? (priceData.high24h - priceData.low24h) / priceData.price
    : 0.02;
  
  const dynamicTarget = Math.max(vtsConfig.targetProfit, volatility * 0.5);
  const dynamicStop = Math.max(vtsConfig.stopLoss, volatility * 0.3);
  
  const takeProfit = entryPrice * (1 + dynamicTarget);
  const stopLoss = entryPrice * (1 - dynamicStop);
  const spread = priceData.ask > 0 && priceData.bid > 0
    ? (priceData.ask - priceData.bid) / priceData.price
    : 0.001;
  
  const hybridScore = simulateHybridScore(regime);
  const predictiveConfidence = simulatePredictiveConfidence(regime, hybridScore);
  // Directive 11.4H.4A Task 1: Use dynamic regime scoring based on ADX + volatility
  const regimeScoreRaw = calculateRegimeScore(regime, {
    adx: regimeResult.adx,
    volatility: regimeResult.volatility
  });
  const regimeWeight = regimeScoreRaw / 100; // Normalize to 0-1 range for finalScore calculation
  const decayPenalty = simulateDecayPenalty();
  
  const finalScore = computeFinalScore(hybridScore, predictiveConfidence, regimeWeight, decayPenalty);
  
  const costMetrics = getCachedCostMetrics(symbol);
  const frictionCost = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + costMetrics.spread;
  
  const portfolioValue = await getPortfolioValue();
  const riskPerTrade = await getRiskPerTrade();
  const positionSize = computePositionSize(portfolioValue, riskPerTrade, entryPrice, stopLoss, riskMultiplier);
  
  const priceChange = (Math.random() - 0.4) * volatility;
  const exitPrice = entryPrice * (1 + priceChange);
  const profit = (exitPrice - entryPrice) * (positionSize / entryPrice) - (positionSize * frictionCost);
  
  // Directive 11.4C.3: VirtualSignal with full Phase-10 metrics and pattern (M50 compliant)
  const signal: VirtualSignal = {
    id: `vsig_p10_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    symbol,
    entryPrice,
    takeProfit,
    stopLoss,
    spread,
    predictedProfit: finalScore * dynamicTarget,
    strategy,
    createdAt: Date.now(),
    signalType, // Directive 11.4C.3: Canonical format 'QUANT' | 'PATTERN' | 'HYBRID'
    patternType, // Directive 11.4C.3: Attached pattern from detection (null if none)
    patternStrength: detectedPattern?.strength ?? undefined, // Directive 11.4C.3: Explicit undefined for type safety
    hybridScore,
    predictiveConfidence,
    // Phase-10 canonical fields (M50)
    finalScore,
    regimeWeight,
    decayPenalty,
    expectedEdge: finalScore * dynamicTarget - frictionCost,
    frictionCost, // M50: Schema parity with VirtualTrade
    regime,
    regimeScore: regimeScoreRaw, // Directive 11.4H.4A: Raw 0-100 score for UI display
    pool,
    source: 'simulation', // M50/M53: VTS-generated signals marked as simulation
  };
  
  const tradeRecord: Phase10TradeRecord = {
    symbol,
    regime,
    regimeScore: regimeScoreRaw, // Directive 11.4H.4A: Raw 0-100 score for telemetry
    signalType,
    strategy,
    patternType, // Directive 11.4C.3: Attached pattern for telemetry
    finalScore,
    hybridScore,
    predictiveConfidence,
    regimeWeight,
    decayPenalty,
    frictionCost,
    entry: entryPrice,
    exit: exitPrice,
    profit,
    positionSize,
    pool,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[11.0E.1][VTS] Trade: ${symbol} regime=${regime} signalType=${signalType} strategy=${strategy} finalScore=${finalScore.toFixed(3)} pool=${pool}`);
  
  return { signal, tradeRecord };
}

/**
 * Directive 11.4C.1: Get pairs directly from FX5 Scanner (not telemetry)
 * VTS is the sole source of telemetry writes - it gets raw pairs from FX5 and generates signal data
 */
async function getIdealPoolPairs(): Promise<Array<{ symbol: string; pool: 'ideal' | 'rotational' }>> {
  try {
    // Directive 11.4C.1: Get pairs directly from FX5 scanner's current batch
    const scanBatch = fx5Scanner.getCurrentScanBatch('paper');
    
    if (scanBatch.length >= 10) {
      console.log(`[11.4C.1][VTS] Using FX5 scan batch: ${scanBatch.length} pairs (raw data, no telemetry query)`);
      // Directive 11.4H.1 Task 1: Normalize symbols at ingress with fallback and tier logging
      const validPairs: Array<{ symbol: string; pool: 'ideal' | 'rotational' }> = [];
      for (const p of scanBatch) {
        const rawSymbol = p.symbol;
        const canonicalSymbol = normalizeToInternalSymbol(rawSymbol);
        
        // Directive 11.4H.1: Fallback for unmappable symbols
        if (!canonicalSymbol || canonicalSymbol === rawSymbol.toUpperCase()) {
          const mappingDetails = getSymbolMappingDetails(rawSymbol);
          if (!mappingDetails.mappable) {
            console.warn(`[11.4H.1][Symbol Warning] Unmappable symbol detected: ${rawSymbol}`);
            continue; // Skip processing this symbol
          }
        }
        
        // Directive 11.4H.1: Audit Tier-3 mappings
        const mappingDetails = getSymbolMappingDetails(rawSymbol);
        if (mappingDetails?.tier === 3) {
          console.warn(`[11.4H.1][Mapping Tier 3] ${rawSymbol} → ${canonicalSymbol}`);
        }
        
        validPairs.push({ symbol: canonicalSymbol, pool: p.pool });
      }
      return validPairs;
    }
    
    // Cold start fallback: If FX5 hasn't scanned yet, check active filter pool
    console.log('[11.4C.1][VTS] Scan batch too small, checking Active Filter Pool...');
    const fx5Survivors = activeFilterPool.getActivePool('paper');
    
    if (fx5Survivors && fx5Survivors.length >= 10) {
      console.log(`[11.4C.1][VTS] Using Active Filter Pool: ${fx5Survivors.length} pairs`);
      const validPairs: Array<{ symbol: string; pool: 'ideal' | 'rotational' }> = [];
      for (const p of fx5Survivors) {
        if ((p.price ?? 0) < vtsConfig.minPrice || (p.volume24h ?? 0) < vtsConfig.minVolume24h) {
          continue;
        }
        const canonicalSymbol = normalizeToInternalSymbol(p.symbol);
        if (!canonicalSymbol) {
          console.warn(`[11.4H.1][Symbol Warning] Unmappable symbol in fallback: ${p.symbol}`);
          continue;
        }
        validPairs.push({ symbol: canonicalSymbol, pool: 'rotational' as const });
        if (validPairs.length >= vtsConfig.pairsPerCycle) break;
      }
      return validPairs;
    }
    
    console.log('[11.4C.1][VTS] No pairs available (cold start) - waiting for FX5 scan');
    return [];
  } catch (error) {
    console.warn('[11.4C.1][VTS] Failed to get pairs:', error);
    return [];
  }
}

async function runPhase10SimulationCycle(): Promise<VTSCycleMetrics> {
  const cycleStart = Date.now();
  cycleCount++;
  
  const config = await getSystemConfig();
  if (config.tradingActive) {
    console.log('[11.0E.1][VTS] Skipping cycle - tradingActive=true');
    return {
      cycleId: cycleCount,
      pairsEvaluated: 0,
      tradesSimulated: 0,
      avgFinalScore: 0,
      regimeDistribution: {} as Record<MarketRegimeType, number>,
      signalTypeDistribution: {},
      strategiesExecuted: [],
      cycleDurationMs: Date.now() - cycleStart,
      timestamp: Date.now()
    };
  }
  
  const pairs = await getIdealPoolPairs();
  
  if (pairs.length < 10) {
    console.warn(`[11.0E.1][VTS] Ideal pool too small (${pairs.length} pairs), delaying cycle...`);
    return {
      cycleId: cycleCount,
      pairsEvaluated: pairs.length,
      tradesSimulated: 0,
      avgFinalScore: 0,
      regimeDistribution: {} as Record<MarketRegimeType, number>,
      signalTypeDistribution: {},
      strategiesExecuted: [],
      cycleDurationMs: Date.now() - cycleStart,
      timestamp: Date.now()
    };
  }
  
  const regimeDistribution: Record<MarketRegimeType, number> = {
    BULL_STABLE: 0,
    BEAR_VOLATILE: 0,
    LOW_VOL_CHOP: 0,
    HIGH_VOL_IMPULSE: 0,
    TRANSITION: 0
  };
  const signalTypeDistribution: Record<string, number> = {};
  const strategiesExecuted: Set<string> = new Set();
  let simulatedCount = 0;
  let totalFinalScore = 0;
  
  // Directive 11.0E.2: Use isolated VTS cache bucket for sandboxing
  const bucketType: CacheBucketType = 'vtsSimulation';
  for (const pair of pairs) {
    priceCache.subscribe(pair.symbol, bucketType);
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const symbols = pairs.map(p => p.symbol);
  const priceDataMap = await priceCache.getBatch(bucketType, symbols);
  
  for (const pair of pairs) {
    try {
      const priceData = priceDataMap.get(pair.symbol);
      if (!priceData || priceData.price <= 0) {
        continue;
      }
      
      const ohlcData = await fetchOHLCForPair(pair.symbol);
      if (ohlcData.length < 10) {
        continue;
      }
      
      const result = await generatePhase10Signal(pair.symbol, priceData, ohlcData, pair.pool);
      if (!result) continue;
      
      const { signal, tradeRecord } = result;
      
      await vtsService.createVirtualTrade(signal);
      vtsService.updateMarketPrice(pair.symbol, priceData.price);
      
      // Directive 11.0E.2: Record telemetry with source='simulation' for segregation
      // Directive 11.4C.3: Include pairRegime, signalType, and strategy for per-pair tracking
      // Directive 11.4C.1: VTS is sole authorized telemetry writer (M70)
      // Note: QUANT signals should NOT have a pattern (purely mathematical)
      const telemetry = getTelemetryAggregator();
      telemetry.recordPairTelemetry(pair.symbol, {
        finalScore: tradeRecord.finalScore,
        hybridScore: tradeRecord.hybridScore,
        regimeWeight: tradeRecord.regimeWeight,
        regimeScore: tradeRecord.regimeScore, // Directive 11.4H.4A: Dynamic 0-100 score
        predictiveConfidence: tradeRecord.predictiveConfidence,
        success: (tradeRecord.profit ?? 0) > 0,
        pool: pair.pool,
        source: 'simulation', // M53: VTS-generated data marked as simulation
        pairRegime: tradeRecord.regime, // Directive 11.4C-R2: Per-pair regime
        signalType: tradeRecord.signalType, // Directive 11.4C.3: HYBRID/QUANT/PATTERN
        strategy: tradeRecord.strategy, // Directive 11.4C.3: Canonical strategy name
        pattern: tradeRecord.signalType !== 'QUANT' ? (tradeRecord.patternType ?? undefined) : undefined, // Only for HYBRID/PATTERN
        caller: 'vts', // Directive 11.4C.1: VTS caller identification for telemetry guard
      });
      
      phase10SessionTrades.push(tradeRecord);
      
      regimeDistribution[tradeRecord.regime]++;
      signalTypeDistribution[tradeRecord.signalType] = (signalTypeDistribution[tradeRecord.signalType] || 0) + 1;
      strategiesExecuted.add(tradeRecord.strategy);
      totalFinalScore += tradeRecord.finalScore;
      simulatedCount++;
      
    } catch (error) {
      console.warn(`[11.0E.1][VTS] Strategy execution failed for ${pair.symbol}:`, error);
    }
  }
  
  const avgFinalScore = simulatedCount > 0 ? totalFinalScore / simulatedCount : 0;
  const cycleDurationMs = Date.now() - cycleStart;
  
  console.log(`[VTS][Cycle ${cycleCount}] Ideal Pool: ${pairs.length} | Regime Dist: BULL=${regimeDistribution.BULL_STABLE}, CHOP=${regimeDistribution.LOW_VOL_CHOP}, BEAR=${regimeDistribution.BEAR_VOLATILE}`);
  console.log(`[VTS][Cycle ${cycleCount}] Executing ${simulatedCount} signals across ${Object.keys(signalTypeDistribution).length} signal types`);
  console.log(`[VTS][Cycle ${cycleCount}] Completed: ${simulatedCount} trades simulated | Avg finalScore=${avgFinalScore.toFixed(2)}`);
  
  return {
    cycleId: cycleCount,
    pairsEvaluated: pairs.length,
    tradesSimulated: simulatedCount,
    avgFinalScore,
    regimeDistribution,
    signalTypeDistribution,
    strategiesExecuted: Array.from(strategiesExecuted),
    cycleDurationMs,
    timestamp: Date.now()
  };
}

export async function startAutonomousSimulation(): Promise<{ success: boolean; message: string }> {
  if (isAutonomousRunning) {
    return { success: true, message: 'Autonomous simulation already running' };
  }
  
  const config = await getSystemConfig();
  if (config.tradingActive) {
    return { success: false, message: 'Cannot start autonomous simulation while trading is active' };
  }
  
  await loadVTSConfig();
  
  if (!isInitialized) {
    await initVTSRunner();
  }
  
  isAutonomousRunning = true;
  sessionStartTime = Date.now();
  phase10SessionStartTime = Date.now();
  vtsService.resetSessionMetrics();
  
  console.log(`[11.0E.1][VTS] Starting Phase-10 autonomous simulation (interval: ${vtsConfig.simulationIntervalSec}s, pairs: ${vtsConfig.pairsPerCycle})`);
  
  await runPhase10SimulationCycle();
  
  autonomousLoopInterval = setInterval(async () => {
    const sysConfig = await getSystemConfig();
    if (sysConfig.tradingActive) {
      console.log('[11.0E.1][VTS] Trading activated - stopping autonomous simulation');
      stopAutonomousSimulation();
      return;
    }
    
    await runPhase10SimulationCycle();
  }, vtsConfig.simulationIntervalSec * 1000);
  
  return { success: true, message: `Phase-10 autonomous simulation started (${vtsConfig.pairsPerCycle} pairs every ${vtsConfig.simulationIntervalSec}s)` };
}

export function stopAutonomousSimulation(): void {
  if (autonomousLoopInterval) {
    clearInterval(autonomousLoopInterval);
    autonomousLoopInterval = null;
  }
  isAutonomousRunning = false;
  console.log('[11.0E.1][VTS] Autonomous simulation stopped');
}

export function isAutonomousSimulationRunning(): boolean {
  return isAutonomousRunning;
}

export function getAutonomousSessionInfo(): {
  isRunning: boolean;
  sessionStartTime: number | null;
  sessionDurationMs: number;
  config: VTSConfig;
  cycleCount: number;
  tradesThisSession: number;
} {
  return {
    isRunning: isAutonomousRunning,
    sessionStartTime,
    sessionDurationMs: sessionStartTime ? Date.now() - sessionStartTime : 0,
    config: vtsConfig,
    cycleCount,
    tradesThisSession: phase10SessionTrades.length
  };
}

export async function initVTSRunner(): Promise<void> {
  if (isInitialized) return;
  
  try {
    calibration = await loadCalibration();
    await loadVTSConfig();
    vtsService.start();
    isInitialized = true;
    patternRecognitionWarmedUp = true;
    console.log('[11.0E.1][VTS_RUNNER] INIT_OK - Phase-10 autonomous mode ready');
  } catch (error) {
    console.error('[11.0E.1][VTS_RUNNER] Init failed:', error);
  }
}

export async function captureSignalForVTS(
  symbol: string,
  entryPrice: number,
  takeProfit: number,
  stopLoss: number,
  predictedProfit: number,
  strategy: string,
  spread: number = 0.001
): Promise<void> {
  console.warn('[11.0E.1][VTS] DEPRECATED: captureSignalForVTS called - use autonomous simulation instead');
}

export function updateVTSPrice(symbol: string, price: number): void {
  if (isInitialized) {
    vtsService.updateMarketPrice(symbol, price);
  }
}

export async function getCalibratedProfit(predictedProfit: number): Promise<number> {
  if (!calibration) {
    calibration = await loadCalibration();
  }
  return applyCalibration(predictedProfit, calibration);
}

export async function refreshCalibration(): Promise<CalibrationCoefficients> {
  calibration = await loadCalibration();
  return calibration;
}

export function getVTSStats() {
  return vtsService.getStats();
}

export function stopVTSRunner(): void {
  stopAutonomousSimulation();
  vtsService.stop();
  isInitialized = false;
  console.log('[11.0E.1][VTS_RUNNER] Stopped');
}

export async function generateValidationReport(): Promise<{
  timestamp: string;
  mode: string;
  tradingActive: boolean;
  simulatedTradesThisSession: number;
  calibrationFileExists: boolean;
  sessionDurationMs: number;
  config: VTSConfig;
  stats: any;
  strategyStats: any;
  phase10Trades: number;
}> {
  const stats = vtsService.getStats();
  const strategyStats = vtsService.getStrategyStats();
  const sessionMetrics = vtsService.getSessionMetrics();
  const config = await getSystemConfig();
  
  let calibrationExists = false;
  try {
    await fs.access(path.join(process.cwd(), 'data', 'vts_calibration.json'));
    calibrationExists = true;
  } catch {}
  
  const report = {
    timestamp: new Date().toISOString(),
    mode: 'phase10_simulator',
    tradingActive: config.tradingActive ?? false,
    simulatedTradesThisSession: sessionMetrics.simulatedTradesThisSession,
    calibrationFileExists: calibrationExists,
    sessionDurationMs: sessionStartTime ? Date.now() - sessionStartTime : 0,
    config: vtsConfig,
    stats,
    strategyStats,
    phase10Trades: phase10SessionTrades.length
  };
  
  const reportsDir = path.join(process.cwd(), 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  
  const reportPath = path.join(reportsDir, `VTS_Phase10_Validation_${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`[11.0E.1][VTS] Validation report saved: ${reportPath}`);
  
  return report;
}

export async function startM5CValidationSession(durationMinutes: number = 60): Promise<{ success: boolean; message: string; sessionId: string }> {
  const sessionId = `vts_p10_${Date.now()}`;
  
  resetPhase10Session();
  phase10SessionStartTime = Date.now();
  
  try {
    await computeStrategyWeights();
    await computeExposureBias();
  } catch (err) {
    console.warn('[11.0E.1][VTS] Failed to compute weights/bias, using defaults:', err);
  }
  
  console.log(`[11.0E.1][VTS] Starting Phase-10 validation session ${sessionId} for ${durationMinutes} minutes`);
  
  const result = await startAutonomousSimulation();
  if (!result.success) {
    return { success: false, message: result.message, sessionId };
  }
  
  setTimeout(async () => {
    console.log(`[11.0E.1][VTS] Session ${sessionId} duration reached - saving ${phase10SessionTrades.length} trades`);
    await savePhase10SessionTrades(sessionId);
    stopAutonomousSimulation();
    
    const paperTrades = getPaperSessionTrades();
    if (paperTrades.length > 0) {
      console.log(`[11.0E.1][AUTO] Saving ${paperTrades.length} paper trades`);
      await savePaperSessionTrades(sessionId);
    }
    
    console.log(`[11.0E.1][AUTO] Running comparison audit`);
    try {
      const comparisonReport = await compareLatestSessions();
      if (comparisonReport) {
        const reportsDir = path.join(process.cwd(), 'reports');
        await fs.mkdir(reportsDir, { recursive: true });
        const combinedReportPath = path.join(reportsDir, `VTS_Phase10_Comparison_${Date.now()}.json`);
        await fs.writeFile(combinedReportPath, JSON.stringify(comparisonReport, null, 2));
        console.log(`[11.0E.1][AUTO] Combined audit report saved: ${combinedReportPath}`);
        console.log(`[11.0E.1][AUTO] Validation result: matchRate=${comparisonReport.matchRate}, calibrationError=${comparisonReport.calibrationError}, validationPassed=${comparisonReport.validationPassed}`);
      } else {
        console.log(`[11.0E.1][AUTO] Comparison skipped - missing VTS or paper trades files`);
      }
    } catch (compErr) {
      console.error(`[11.0E.1][AUTO] Comparison audit failed:`, compErr);
    }
  }, durationMinutes * 60 * 1000);
  
  return { success: true, message: `Phase-10 validation session started for ${durationMinutes} minutes`, sessionId };
}

export async function savePhase10SessionTrades(sessionId?: string): Promise<string> {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  
  const timestamp = sessionId || Date.now().toString();
  const filePath = path.join(dataDir, `vts_phase10_trades_${timestamp}.json`);
  
  const sessionData = {
    sessionId: timestamp,
    schemaVersion: 'v1.6.6',
    directive: '11.0E.1',
    startTime: phase10SessionStartTime ? new Date(phase10SessionStartTime).toISOString() : null,
    endTime: new Date().toISOString(),
    durationMinutes: phase10SessionStartTime ? Math.round((Date.now() - phase10SessionStartTime) / 60000) : 0,
    tradeCount: phase10SessionTrades.length,
    trades: phase10SessionTrades
  };
  
  await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
  console.log(`[11.0E.1][VTS] Saved ${phase10SessionTrades.length} Phase-10 trades to ${filePath}`);
  
  return filePath;
}

export function getPhase10SessionTrades(): Phase10TradeRecord[] {
  return [...phase10SessionTrades];
}

export function addPhase10TradeRecord(trade: Phase10TradeRecord): void {
  phase10SessionTrades.push(trade);
}

export function resetPhase10Session(): void {
  phase10SessionTrades = [];
  phase10SessionStartTime = null;
  cycleCount = 0;
}

export async function getLatestVTSTradesFile(): Promise<string | null> {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    const files = await fs.readdir(dataDir);
    const vtsFiles = files.filter(f => (f.startsWith('vts_trades_') || f.startsWith('vts_phase10_trades_')) && f.endsWith('.json'));
    if (vtsFiles.length === 0) return null;
    
    vtsFiles.sort().reverse();
    return path.join(dataDir, vtsFiles[0]);
  } catch {
    return null;
  }
}

export function getM5CSessionTrades(): Phase10TradeRecord[] {
  return getPhase10SessionTrades();
}

export function addM5CTradeRecord(trade: any): void {
  if (trade.regime && trade.signalType) {
    phase10SessionTrades.push(trade);
  }
}

export function resetM5CSession(): void {
  resetPhase10Session();
}

export async function saveM5CSessionTrades(sessionId?: string): Promise<string> {
  return savePhase10SessionTrades(sessionId);
}
