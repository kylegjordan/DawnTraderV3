/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-M5B
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
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { vtsService, type VirtualSignal } from './vts-service.js';
import { loadCalibration, applyCalibration, type CalibrationCoefficients } from '../utils/calibration.js';
import { priceCache, type CachedPrice } from './price-cache.js';
import { systemConfigService } from './system-config.js';
import { filteredPairsService } from './filtered-pairs-service.js';
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

function computeSimulatedCWQI(priceData: CachedPrice): number {
  const volatility = priceData.high24h > 0 && priceData.low24h > 0
    ? (priceData.high24h - priceData.low24h) / priceData.price
    : 0.02;
  
  const volumeScore = Math.min(1, priceData.volume24h / 1000000);
  const volatilityScore = Math.min(1, Math.max(0.3, 1 - volatility * 10));
  const spreadScore = priceData.ask > 0 && priceData.bid > 0
    ? Math.min(1, Math.max(0.5, 1 - ((priceData.ask - priceData.bid) / priceData.price) * 100))
    : 0.6;
  
  const cwqi = (volumeScore * 0.3 + volatilityScore * 0.4 + spreadScore * 0.3);
  return Math.max(0.3, Math.min(0.95, cwqi + (Math.random() - 0.5) * 0.1));
}

function computeSimulatedNGC(priceData: CachedPrice, cwqi: number): number {
  const priceStrength = priceData.price > 10 ? 0.7 : priceData.price > 1 ? 0.6 : 0.5;
  const momentumFactor = Math.random() * 0.3 + 0.5;
  
  const ngc = (cwqi * 0.4 + priceStrength * 0.3 + momentumFactor * 0.3);
  return Math.max(0.3, Math.min(0.95, ngc));
}

function generateVirtualSignal(symbol: string, priceData: CachedPrice): VirtualSignal {
  const strategyId = selectRandomStrategy();
  const entryPrice = priceData.price;
  const cwqi = computeSimulatedCWQI(priceData);
  const ngc = computeSimulatedNGC(priceData, cwqi);
  
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
  
  const predictedProfit = (cwqi * 0.4 + ngc * 0.6) * dynamicTarget;
  
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
  
  console.log(`[M5B][VTS] Simulated trade: ${symbol} strategy=${strategyId} cwqi=${cwqi.toFixed(2)} ngc=${ngc.toFixed(2)}`);
  
  return signal;
}

async function getTopLiquidityPairs(count: number): Promise<CachedPrice[]> {
  const defaultFilters = {
    minVolume: String(vtsConfig.minVolume24h),
    minPrice: String(vtsConfig.minPrice),
    maxPrice: "100000.00",
    maxBidAskSpread: "2.00",
    excludeStablecoins: true,
    volatilityMin: "0.50",
    volatilityMax: "5.00",
    rsiMin: 30,
    rsiMax: 70,
    minLiquidity: "0",
    universeSize: 100,
    activeTimeframes: ["5m", "15m", "1h"]
  };
  
  const filteredResult = await filteredPairsService.getValidPairs('paper', defaultFilters);
  
  if (!filteredResult || !filteredResult.filteredPairs || filteredResult.filteredPairs.length === 0) {
    console.log('[M5B][VTS] No filtered pairs from screener');
    return [];
  }
  
  const symbols = filteredResult.filteredPairs
    .filter(p => 
      p.currentPrice >= vtsConfig.minPrice &&
      p.volume24h >= vtsConfig.minVolume24h
    )
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, count)
    .map(p => p.symbol);
  
  if (symbols.length === 0) {
    console.log('[M5B][VTS] No pairs meet VTS criteria');
    return [];
  }
  
  for (const symbol of symbols) {
    priceCache.subscribe('fx5Snapshot', symbol);
  }
  
  const priceData = await priceCache.getBatch('fx5Snapshot', symbols);
  
  const result: CachedPrice[] = [];
  for (const symbol of symbols) {
    const price = priceData.get(symbol);
    if (price && price.price > 0) {
      result.push(price);
    }
  }
  
  console.log(`[M5B][VTS] Got ${result.length}/${symbols.length} prices from cache`);
  return result;
}

async function runSimulationCycle(): Promise<number> {
  const config = await getSystemConfig();
  const tradingActive = config.tradingActive ?? false;
  
  if (tradingActive) {
    console.log('[M5B][VTS] Skipping cycle - tradingActive=true');
    return 0;
  }
  
  const topPairs = await getTopLiquidityPairs(vtsConfig.pairsPerCycle);
  
  if (topPairs.length === 0) {
    console.log('[M5B][VTS] No eligible pairs found in price cache');
    return 0;
  }
  
  let simulatedCount = 0;
  
  for (const priceData of topPairs) {
    try {
      const signal = generateVirtualSignal(priceData.symbol, priceData);
      await vtsService.createVirtualTrade(signal);
      vtsService.updateMarketPrice(priceData.symbol, priceData.price);
      simulatedCount++;
    } catch (error) {
      console.warn(`[M5B][VTS] Failed to create trade for ${priceData.symbol}:`, error);
    }
  }
  
  console.log(`[M5B][VTS] Cycle complete: ${simulatedCount}/${topPairs.length} trades simulated`);
  
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
