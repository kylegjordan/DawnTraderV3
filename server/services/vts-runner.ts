/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-M5C
 * ══════════════════════════════════════════════════════════════════════════════
 * VTS Runner - Autonomous Virtual Trading Simulator
 * 
 * Purpose: Runs autonomous virtual trade simulation independent of live trading.
 * Sources data exclusively from the pricing service cache, not signal orchestrator.
 * 
 * M5B Features:
 * - Autonomous signal generation when tradingActive=false
 * - 60-second simulation loop with configurable pairs
 * - Internal CWQI/NGC computation
 * - Automatic stop when tradingActive=true
 * - Session metrics tracking
 * 
 * M5C Features:
 * - Uses actual CWQI/NGC calculation modules (same as live engine)
 * - Actual position sizing formulas from Adaptive Risk Advisor
 * - Trade recording to /data/vts_trades_<timestamp>.json
 * - Strategy weights from live calibration
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { vtsService, type VirtualSignal } from './vts-service.js';
import { loadCalibration, applyCalibration, type CalibrationCoefficients } from '../utils/calibration.js';
import { priceCache, type CachedPrice } from './price-cache.js';
import { systemConfigService } from './system-config.js';
// Phase 8.8.7: FilteredPairsService DEPRECATED - use activeFilterPool instead
import { activeFilterPool } from './active-filter-pool.js';
import { calculateCWQI, calculateNGC, estimateVolatility, calculateRiskScore, calculateExpectedReturn, getAdaptiveRelevance } from '../core/metrics/quality_index.js';
import { computeStrategyWeights, getWeightSync } from '../utils/strategyWeights.js';
import { computeExposureBias, getExposureMultiplierSync } from '../utils/strategyBias.js';
import { compareLatestSessions, savePaperSessionTrades, getPaperSessionTrades } from './vts-live-comparison-audit.js';
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
  pairsPerCycle: 20,
  strategies: [
    'EMA_RSI', 'MACD_Crossover', 'Bollinger_Breakout', 'Momentum_Surge',
    'Mean_Reversion', 'Volume_Spike', 'Trend_Follow', 'Range_Bound', 'Breakout_Confirm'
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
    console.log('[M5B][VTS_CONFIG] Loaded config:', JSON.stringify(vtsConfig, null, 2));
    return vtsConfig;
  } catch (error) {
    console.warn('[M5B][VTS_CONFIG] Using default config (file not found or invalid)');
    return DEFAULT_CONFIG;
  }
}

function selectRandomStrategy(): string {
  const strategies = vtsConfig.strategies;
  return strategies[Math.floor(Math.random() * strategies.length)];
}

interface M5CTradeRecord {
  symbol: string;
  strategy: string;
  entry: number;
  exit: number;
  cwqi: number;
  ngc: number;
  di: number;
  gsi: number;
  profit: number;
  loss: number;
  positionSize: number;
  strategyWeight: number;
  timestamp: string;
}

let m5cSessionTrades: M5CTradeRecord[] = [];
let m5cSessionStartTime: number | null = null;

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

function computeActualCWQI(priceData: CachedPrice, entryPrice: number, targetPrice: number, stopPrice: number): { cwqi: number; ngc: number; riskScore: number; volatility: number; expectedReturn: number } {
  const volatility = estimateVolatility(priceData.high24h, priceData.low24h, priceData.price);
  const riskScore = calculateRiskScore(entryPrice, stopPrice);
  const expectedReturn = calculateExpectedReturn(entryPrice, targetPrice, stopPrice, false);
  
  const confidence = 0.6 + Math.random() * 0.2;
  
  const cwqiResult = calculateCWQI({
    confidence,
    riskScore,
    expectedReturn,
    volatility
  });
  
  return {
    cwqi: cwqiResult.cwqi,
    ngc: cwqiResult.ngc,
    riskScore,
    volatility,
    expectedReturn
  };
}

function computePositionSize(portfolioValue: number, riskPerTrade: number, entryPrice: number, stopPrice: number, exposureMultiplier: number): number {
  const stopDistance = Math.abs(entryPrice - stopPrice) / entryPrice;
  if (stopDistance <= 0) return 0;
  
  const riskAmount = portfolioValue * riskPerTrade * exposureMultiplier;
  const positionSize = riskAmount / stopDistance;
  
  const maxPositionSize = portfolioValue * 0.25;
  return Math.min(positionSize, maxPositionSize);
}

async function generateVirtualSignalM5C(symbol: string, priceData: CachedPrice): Promise<{ signal: VirtualSignal; tradeRecord: M5CTradeRecord }> {
  const strategyId = selectRandomStrategy();
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
  
  const metrics = computeActualCWQI(priceData, entryPrice, takeProfit, stopLoss);
  
  const portfolioValue = await getPortfolioValue();
  const riskPerTrade = await getRiskPerTrade();
  const exposureMultiplier = getExposureMultiplierSync(strategyId);
  const strategyWeight = getWeightSync(strategyId);
  
  const positionSize = computePositionSize(portfolioValue, riskPerTrade, entryPrice, stopLoss, exposureMultiplier);
  
  const adaptiveRelevance = getAdaptiveRelevance();
  const di = (metrics.cwqi * 0.4 + metrics.ngc * 0.4 + (1 - metrics.riskScore) * 0.2);
  const gsi = adaptiveRelevance.gsi;
  
  const priceChange = (Math.random() - 0.4) * volatility;
  const exitPrice = entryPrice * (1 + priceChange);
  const profit = priceChange > 0 ? (exitPrice - entryPrice) * (positionSize / entryPrice) : 0;
  const loss = priceChange < 0 ? Math.abs((exitPrice - entryPrice) * (positionSize / entryPrice)) : 0;
  
  const predictedProfit = (metrics.cwqi * 0.4 + metrics.ngc * 0.6) * dynamicTarget;
  
  const signal: VirtualSignal = {
    id: `vsig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    symbol,
    entryPrice,
    takeProfit,
    stopLoss,
    spread,
    predictedProfit,
    strategy: strategyId,
    createdAt: Date.now()
  };
  
  const tradeRecord: M5CTradeRecord = {
    symbol,
    strategy: strategyId,
    entry: entryPrice,
    exit: exitPrice,
    cwqi: metrics.cwqi,
    ngc: metrics.ngc,
    di,
    gsi,
    profit,
    loss,
    positionSize,
    strategyWeight,
    timestamp: new Date().toISOString()
  };
  
  console.log(`[M5C][VTS] Trade: ${symbol} strategy=${strategyId} cwqi=${metrics.cwqi.toFixed(3)} ngc=${metrics.ngc.toFixed(3)} di=${di.toFixed(3)} size=$${positionSize.toFixed(2)}`);
  
  return { signal, tradeRecord };
}

function generateVirtualSignal(symbol: string, priceData: CachedPrice): VirtualSignal {
  const strategyId = selectRandomStrategy();
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
  
  const metrics = computeActualCWQI(priceData, entryPrice, takeProfit, stopLoss);
  const predictedProfit = (metrics.cwqi * 0.4 + metrics.ngc * 0.6) * dynamicTarget;
  
  const signal: VirtualSignal = {
    id: `vsig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    symbol,
    entryPrice,
    takeProfit,
    stopLoss,
    spread,
    predictedProfit,
    strategy: strategyId,
    createdAt: Date.now()
  };
  
  console.log(`[M5C][VTS] Simulated trade: ${symbol} strategy=${strategyId} cwqi=${metrics.cwqi.toFixed(3)} ngc=${metrics.ngc.toFixed(3)}`);
  
  return signal;
}

async function getTopLiquidityPairs(count: number): Promise<CachedPrice[]> {
  // Phase 8.8.7: Use FX5 Active Filter Pool instead of deprecated FilteredPairsService
  // VTS now uses the same filtering as production signal orchestrator
  const fx5Survivors = activeFilterPool.getActivePool('paper');
  
  if (!fx5Survivors || fx5Survivors.length === 0) {
    console.log('[8.8.7][VTS] No FX5 survivors in Active Filter Pool');
    return [];
  }
  
  console.info(`[8.8.7][VTS] Running on FX5 Active Filter Pool (${fx5Survivors.length} pairs).`);
  
  // Filter and sort by volume from FX5 pool data
  const symbols = fx5Survivors
    .filter(p => 
      (p.price ?? 0) >= vtsConfig.minPrice &&
      (p.volume24h ?? 0) >= vtsConfig.minVolume24h
    )
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, count)
    .map(p => p.symbol);
  
  if (symbols.length === 0) {
    console.log('[8.8.7][VTS] No FX5 pairs meet VTS criteria');
    return [];
  }
  
  for (const symbol of symbols) {
    priceCache.subscribe('fx5Snapshot' as any, symbol);
  }
  
  const priceData = await priceCache.getBatch('fx5Snapshot' as any, symbols);
  
  const result: CachedPrice[] = [];
  for (const symbol of symbols) {
    const price = priceData.get(symbol);
    if (price && price.price > 0) {
      result.push(price);
    }
  }
  
  console.log(`[8.8.7][VTS] Got ${result.length}/${symbols.length} prices from cache`);
  return result;
}

async function runSimulationCycle(): Promise<number> {
  const config = await getSystemConfig();
  const tradingActive = config.tradingActive ?? false;
  
  if (tradingActive) {
    console.log('[M5C][VTS] Skipping cycle - tradingActive=true');
    return 0;
  }
  
  const topPairs = await getTopLiquidityPairs(vtsConfig.pairsPerCycle);
  
  if (topPairs.length === 0) {
    console.log('[M5C][VTS] No eligible pairs found in price cache');
    return 0;
  }
  
  let simulatedCount = 0;
  
  for (const priceData of topPairs) {
    try {
      const { signal, tradeRecord } = await generateVirtualSignalM5C(priceData.symbol, priceData);
      await vtsService.createVirtualTrade(signal);
      vtsService.updateMarketPrice(priceData.symbol, priceData.price);
      
      addM5CTradeRecord(tradeRecord);
      simulatedCount++;
    } catch (error) {
      console.warn(`[M5C][VTS] Failed to create trade for ${priceData.symbol}:`, error);
    }
  }
  
  console.log(`[M5C][VTS] Cycle complete: ${simulatedCount}/${topPairs.length} trades simulated, ${m5cSessionTrades.length} total recorded`);
  
  return simulatedCount;
}

export async function startAutonomousSimulation(): Promise<{ success: boolean; message: string }> {
  if (isAutonomousRunning) {
    return { success: true, message: 'Autonomous simulation already running' };
  }
  
  const config = await getSystemConfig();
  const tradingActive = config.tradingActive ?? false;
  
  if (tradingActive) {
    return { success: false, message: 'Cannot start autonomous simulation while trading is active' };
  }
  
  await loadVTSConfig();
  
  if (!isInitialized) {
    await initVTSRunner();
  }
  
  isAutonomousRunning = true;
  sessionStartTime = Date.now();
  vtsService.resetSessionMetrics();
  
  console.log(`[M5B][VTS] Starting autonomous simulation loop (interval: ${vtsConfig.simulationIntervalSec}s, pairs: ${vtsConfig.pairsPerCycle})`);
  
  await runSimulationCycle();
  
  autonomousLoopInterval = setInterval(async () => {
    const sysConfig = await getSystemConfig();
    if (sysConfig.tradingActive) {
      console.log('[M5B][VTS] Trading activated - stopping autonomous simulation');
      stopAutonomousSimulation();
      return;
    }
    
    await runSimulationCycle();
  }, vtsConfig.simulationIntervalSec * 1000);
  
  return { success: true, message: `Autonomous simulation started (${vtsConfig.pairsPerCycle} pairs every ${vtsConfig.simulationIntervalSec}s)` };
}

export function stopAutonomousSimulation(): void {
  if (autonomousLoopInterval) {
    clearInterval(autonomousLoopInterval);
    autonomousLoopInterval = null;
  }
  isAutonomousRunning = false;
  console.log('[M5B][VTS] Autonomous simulation stopped');
}

export function isAutonomousSimulationRunning(): boolean {
  return isAutonomousRunning;
}

export function getAutonomousSessionInfo(): {
  isRunning: boolean;
  sessionStartTime: number | null;
  sessionDurationMs: number;
  config: VTSConfig;
} {
  return {
    isRunning: isAutonomousRunning,
    sessionStartTime,
    sessionDurationMs: sessionStartTime ? Date.now() - sessionStartTime : 0,
    config: vtsConfig
  };
}

export async function initVTSRunner(): Promise<void> {
  if (isInitialized) return;
  
  try {
    calibration = await loadCalibration();
    await loadVTSConfig();
    vtsService.start();
    isInitialized = true;
    console.log('[M5B][VTS_RUNNER] INIT_OK - autonomous mode ready');
  } catch (error) {
    console.error('[M5B][VTS_RUNNER] Init failed:', error);
  }
}

/**
 * @deprecated M5B: Use startAutonomousSimulation() instead.
 * This function is kept for backward compatibility but should not be called
 * from signal orchestrator or other live trading components.
 */
export async function captureSignalForVTS(
  symbol: string,
  entryPrice: number,
  takeProfit: number,
  stopLoss: number,
  predictedProfit: number,
  strategy: string,
  spread: number = 0.001
): Promise<void> {
  console.warn('[M5B][VTS] DEPRECATED: captureSignalForVTS called - use autonomous simulation instead');
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
  console.log('[M5B][VTS_RUNNER] Stopped');
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
    mode: 'simulator',
    tradingActive: config.tradingActive ?? false,
    simulatedTradesThisSession: sessionMetrics.simulatedTradesThisSession,
    calibrationFileExists: calibrationExists,
    sessionDurationMs: sessionStartTime ? Date.now() - sessionStartTime : 0,
    config: vtsConfig,
    stats,
    strategyStats
  };
  
  const reportsDir = path.join(process.cwd(), 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  
  const reportPath = path.join(reportsDir, `VTS_Autonomous_Validation_${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`[M5B][VTS] Validation report saved: ${reportPath}`);
  
  return report;
}

export async function startM5CValidationSession(durationMinutes: number = 60): Promise<{ success: boolean; message: string; sessionId: string }> {
  const sessionId = `vts_${Date.now()}`;
  
  resetM5CSession();
  m5cSessionStartTime = Date.now();
  
  try {
    await computeStrategyWeights();
    await computeExposureBias();
  } catch (err) {
    console.warn('[M5C][VTS] Failed to compute weights/bias, using defaults:', err);
  }
  
  console.log(`[M5C][VTS] Starting validation session ${sessionId} for ${durationMinutes} minutes`);
  
  const result = await startAutonomousSimulation();
  if (!result.success) {
    return { success: false, message: result.message, sessionId };
  }
  
  setTimeout(async () => {
    console.log(`[M5C][VTS] Session ${sessionId} duration reached - saving ${m5cSessionTrades.length} trades`);
    await saveM5CSessionTrades(sessionId);
    stopAutonomousSimulation();
    
    // Directive 8.8.4-M5C.1: Also save paper trades and auto-run comparison
    const paperTrades = getPaperSessionTrades();
    if (paperTrades.length > 0) {
      console.log(`[M5C.1][AUTO] Saving ${paperTrades.length} paper trades`);
      await savePaperSessionTrades(sessionId);
    }
    
    // Auto-run comparison if both VTS and paper trades exist
    console.log(`[M5C.1][AUTO] Running comparison audit`);
    try {
      const comparisonReport = await compareLatestSessions();
      if (comparisonReport) {
        // Save combined report to /reports/
        const reportsDir = path.join(process.cwd(), 'reports');
        await fs.mkdir(reportsDir, { recursive: true });
        const combinedReportPath = path.join(reportsDir, `VTS_Paper_Comparison_${Date.now()}.json`);
        await fs.writeFile(combinedReportPath, JSON.stringify(comparisonReport, null, 2));
        console.log(`[M5C.1][AUTO] Combined audit report saved: ${combinedReportPath}`);
        console.log(`[M5C.1][AUTO] Validation result: matchRate=${comparisonReport.matchRate}, calibrationError=${comparisonReport.calibrationError}, validationPassed=${comparisonReport.validationPassed}`);
      } else {
        console.log(`[M5C.1][AUTO] Comparison skipped - missing VTS or paper trades files`);
      }
    } catch (compErr) {
      console.error(`[M5C.1][AUTO] Comparison audit failed:`, compErr);
    }
  }, durationMinutes * 60 * 1000);
  
  return { success: true, message: `M5C validation session started for ${durationMinutes} minutes`, sessionId };
}

export async function saveM5CSessionTrades(sessionId?: string): Promise<string> {
  const dataDir = path.join(process.cwd(), 'data');
  await fs.mkdir(dataDir, { recursive: true });
  
  const timestamp = sessionId || Date.now().toString();
  const filePath = path.join(dataDir, `vts_trades_${timestamp}.json`);
  
  const sessionData = {
    sessionId: timestamp,
    startTime: m5cSessionStartTime ? new Date(m5cSessionStartTime).toISOString() : null,
    endTime: new Date().toISOString(),
    durationMinutes: m5cSessionStartTime ? Math.round((Date.now() - m5cSessionStartTime) / 60000) : 0,
    tradeCount: m5cSessionTrades.length,
    trades: m5cSessionTrades
  };
  
  await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
  console.log(`[M5C][VTS] Saved ${m5cSessionTrades.length} trades to ${filePath}`);
  
  return filePath;
}

export function getM5CSessionTrades(): M5CTradeRecord[] {
  return [...m5cSessionTrades];
}

export function addM5CTradeRecord(trade: M5CTradeRecord): void {
  m5cSessionTrades.push(trade);
}

export function resetM5CSession(): void {
  m5cSessionTrades = [];
  m5cSessionStartTime = null;
}

export async function getLatestVTSTradesFile(): Promise<string | null> {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    const files = await fs.readdir(dataDir);
    const vtsFiles = files.filter(f => f.startsWith('vts_trades_') && f.endsWith('.json'));
    if (vtsFiles.length === 0) return null;
    
    vtsFiles.sort().reverse();
    return path.join(dataDir, vtsFiles[0]);
  } catch {
    return null;
  }
}
