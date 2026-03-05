/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 10.0.A (Upgraded from 8.8.4-L8)
 * ══════════════════════════════════════════════════════════════════════════════
 * Virtual Trade Simulator Service - Passive Mode Trade Simulation
 * 
 * Purpose: Mirrors real trade outcomes to provide ground-truth data for ML
 * calibration and expected-profit correction without placing real orders.
 * 
 * Features:
 * - Uses canonical SYSTEM_GUARDS.BASE_FEE_SLIPPAGE (0.5%) for friction
 * - 3-hour trade window with take-profit, stop-loss, and timeout outcomes
 * - Populates virtual trade logs for continuous learning
 * - Per-strategy calibration coefficients (L8)
 * - Zero real order execution
 * - Phase 10.0: Eliminated Ghost Math, aligned with Phase 9 Math Core
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import { loadCalibration, loadFullCalibration, calibrateFromTradesPerStrategy, type CalibrationCoefficients, type FullCalibration } from '../utils/calibration';
// Phase 13: Removed L-series imports (market-profiler, regime-performance, reward-evaluator)
import { SYSTEM_GUARDS } from '../config/system-guards.js';
import { computeTotalRoundTripCost, getCachedCostMetrics } from '../core/math/cost-model.js';
import { MLCalibrationService, setGetRecentTradesFn } from './ml-calibration';
import { REGIMES } from '../config/canonical-regime-strategy-map.js';

/**
 * Phase-10 VirtualSignal - Directive 11.4C.3
 * All legacy CWQI/NGC/DI/GSI fields removed
 * M50: Full Phase-10 field parity with VirtualTrade
 * Signal types use uppercase canonical format: 'QUANT' | 'PATTERN' | 'HYBRID'
 */
export interface VirtualSignal {
  id: string;
  symbol: string;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  spread: number;
  predictedProfit: number;
  strategy: string;
  createdAt: number;
  signalType: 'QUANT' | 'PATTERN' | 'HYBRID';
  patternType?: string | null;
  patternStrength?: number;
  
  // Phase-10 Canonical Metrics (M50 compliant)
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
  expectedEdge: number;
  frictionCost: number; // M50: Added for schema parity
  regime: string;
  regimeScore?: number; // Directive 11.4H.4A: Dynamic 0-100 score for UI display
  pool: 'ideal' | 'rotational';
  source: 'simulation' | 'live'; // M50: Added for source tracking
  
  // Legacy fields preserved for backward compatibility during transition
  hybridStrategy?: string;
  effectivePatternStrength?: number;
  decayAge?: number;
}

/**
 * Phase-10 VirtualTrade - Directive 11.0E.2
 * Complete Phase-10 metrics persisted for ML calibration
 * Schema Version: 1.6.7
 */
export interface VirtualTrade {
  id: string;
  signal: VirtualSignal;
  status: 'open' | 'closed';
  resultType?: 'take_profit' | 'stop_loss' | 'timeout';
  entryTime: number;
  exitTime?: number;
  exitPrice?: number;
  grossProfit?: number;
  netProfit?: number;
  fees?: number;
  positionSize?: number; // Added for proper P&L calculation and export
  calibrated: boolean;
  
  // Phase-10 Denormalized Fields (for efficient querying)
  finalScore: number;
  hybridScore: number;
  predictiveConfidence: number;
  regimeWeight: number;
  decayPenalty: number;
  expectedEdge: number;
  frictionCost: number;
  signalType: string;
  strategy: string;
  regime: string;
  pool: 'ideal' | 'rotational';
  
  // Metadata
  source: 'simulation' | 'live';
  schemaVersion: '1.6.7';
}

export interface MarketOutcome {
  high: number;
  low: number;
  close: number;
}

interface VTSStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  takeProfitCount: number;
  stopLossCount: number;
  timeoutCount: number;
  avgGrossProfit: number;
  avgNetProfit: number;
  winRate: number;
  lastUpdate: number;
}

/**
 * M3B: Adaptive learning parameters exposed for real-time coupling
 * Directive 11.0E.2: Updated with Phase-10 metrics
 */
export interface VTSLearningParams {
  learningRate: number;
  relevance: number;
  volatilityIndex: number;
  lastAdaptiveUpdate: string;
  // Phase-10 rolling averages
  avgFinalScore: number;
  avgExpectedEdge: number;
  avgRealizedPnL: number;
}

const TRADE_DURATION = 3 * 60 * 60 * 1000;
const VTS_LOGS_DIR = path.join(process.cwd(), 'logs', 'virtual_trades');
const CALIBRATION_TRIGGER_INTERVAL = 10; // Directive 10.6: Trigger calibration every N Hybrid trades

/**
 * M5B: Session metrics for autonomous simulation tracking
 * Directive 11.0E.2: Phase-10 metrics replace legacy CWQI/NGC
 */
interface SessionMetrics {
  simulatedTradesThisSession: number;
  sessionStartTime: number | null;
  // Phase-10 rolling averages (M51: Legacy CWQI/NGC removed)
  avgFinalScore: number;
  avgExpectedEdge: number;
  avgRealizedPnL: number;
  totalExpectedEdge: number;
  totalRealizedPnL: number;
}

export class VTSService extends EventEmitter {
  private virtualTrades: Map<string, VirtualTrade> = new Map();
  private closedTrades: VirtualTrade[] = [];
  private calibration: CalibrationCoefficients | null = null;
  private fullCalibration: FullCalibration | null = null;
  private isRunning = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private lastPrices: Map<string, { high: number; low: number; close: number }> = new Map();
  
  // M5B: Session tracking for autonomous simulation (Phase-10)
  private sessionMetrics: SessionMetrics = {
    simulatedTradesThisSession: 0,
    sessionStartTime: null,
    avgFinalScore: 0,
    avgExpectedEdge: 0,
    avgRealizedPnL: 0,
    totalExpectedEdge: 0,
    totalRealizedPnL: 0
  };

  // Directive 10.6: Calibration trigger counter
  private calibrationCounter = 0;

  constructor() {
    super();
    this.init();
  }

  private async init() {
    try {
      await fs.mkdir(VTS_LOGS_DIR, { recursive: true });
      this.fullCalibration = await loadFullCalibration();
      this.calibration = this.fullCalibration.global;
      this.phase14FreshStart();
      const strategyCount = Object.keys(this.fullCalibration.strategies).length;
      console.log(`[L8][VTS] INIT_OK - calibration loaded (global + ${strategyCount} strategies)`);
      
      // Directive 10.6: Register trade retrieval function for ML calibration
      setGetRecentTradesFn(this.getRecentTrades.bind(this));
      console.log('[10.6][VTS] ML Calibration integration initialized');
    } catch (error) {
      console.error('[L8][VTS] Init failed:', error);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    // Directive 11.6D: Legacy updateOpenTrades interval disabled
    // All trade resolution now handled by real-price resolution in vts-runner.ts
    console.log('[11.6D][VTS] Started - legacy updateOpenTrades disabled (real-price resolution active)');
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    console.log('[L6][VTS] Stopped');
  }

  /**
   * DEPRECATED by Directive 11.6D - Legacy random simulation pathway
   * All trades now created via openVirtualTrades in vts-runner.ts and resolved via real prices
   * This method is kept for backward compatibility but logs a warning and no-ops
   */
  async createVirtualTrade(signal: VirtualSignal): Promise<VirtualTrade> {
    console.error(`[11.6D][DEPRECATED] createVirtualTrade called - legacy random simulation is disabled`);
    console.error(`[11.6D][DEPRECATED] Trades should flow through openVirtualTrades → persistRealPriceTrade`);
    
    // Return a minimal trade object for interface compatibility, but don't add to virtualTrades map
    const trade: VirtualTrade = {
      id: `deprecated_${Date.now()}`,
      signal,
      status: 'closed', // Mark as closed so it's never processed
      entryTime: Date.now(),
      calibrated: false,
      finalScore: signal.finalScore ?? 0,
      hybridScore: signal.hybridScore ?? 0,
      predictiveConfidence: signal.predictiveConfidence ?? 0,
      regimeWeight: signal.regimeWeight ?? 0,
      decayPenalty: signal.decayPenalty ?? 0,
      expectedEdge: signal.expectedEdge ?? 0,
      frictionCost: 0,
      signalType: signal.signalType ?? 'HYBRID',
      strategy: signal.strategy ?? 'unknown',
      regime: signal.regime ?? REGIMES.STRUCTURAL_TRANSITION,
      pool: signal.pool ?? 'rotational',
      source: 'simulation',
      schemaVersion: '1.6.7'
    };
    
    // Do NOT add to virtualTrades map - this trade will not be processed
    return trade;
  }
  
  /**
   * Directive 11.0E.2: Update rolling averages for Phase-10 metrics
   */
  private updateRollingAverages(): void {
    const count = this.sessionMetrics.simulatedTradesThisSession;
    if (count === 0) return;
    
    this.sessionMetrics.avgExpectedEdge = this.sessionMetrics.totalExpectedEdge / count;
    this.sessionMetrics.avgRealizedPnL = this.sessionMetrics.totalRealizedPnL / count;
    
    // Calculate avgFinalScore from closed trades
    if (this.closedTrades.length > 0) {
      const totalFinalScore = this.closedTrades.reduce((sum, t) => sum + t.finalScore, 0);
      this.sessionMetrics.avgFinalScore = totalFinalScore / this.closedTrades.length;
    }
  }

  updateMarketPrice(symbol: string, price: number) {
    const existing = this.lastPrices.get(symbol) || { high: price, low: price, close: price };
    this.lastPrices.set(symbol, {
      high: Math.max(existing.high, price),
      low: Math.min(existing.low, price),
      close: price
    });
  }

  private getMarketOutcome(symbol: string): MarketOutcome {
    const priceData = this.lastPrices.get(symbol);
    if (priceData) {
      return priceData;
    }
    return { high: 0, low: 0, close: 0 };
  }

  /**
   * Directive 10.0.A: Simulate trade using canonical friction from SYSTEM_GUARDS
   * Ghost Math eliminated - no hardcoded fees
   */
  simulateTrade(signal: VirtualSignal, outcome: MarketOutcome): Partial<VirtualTrade> {
    const entry = signal.entryPrice;
    const tp = signal.takeProfit;
    const sl = signal.stopLoss;

    let exitPrice: number;
    let resultType: 'take_profit' | 'stop_loss' | 'timeout';

    if (outcome.high >= tp) {
      exitPrice = tp;
      resultType = 'take_profit';
    } else if (outcome.low <= sl) {
      exitPrice = sl;
      resultType = 'stop_loss';
    } else {
      exitPrice = outcome.close;
      resultType = 'timeout';
    }

    const grossProfit = (exitPrice - entry) / entry;
    const costMetrics = getCachedCostMetrics(signal.symbol);
    const frictionRate = computeTotalRoundTripCost(costMetrics.fee, costMetrics.slippage, costMetrics.spread);
    const netProfit = grossProfit - frictionRate;

    const isLoss = netProfit <= 0;
    
    if (isLoss && grossProfit > 0) {
      console.log(`[10.0.A][VTS] Friction-adjusted LOSS: ${signal.symbol} gross=${(grossProfit * 100).toFixed(3)}% net=${(netProfit * 100).toFixed(3)}% friction=${(frictionRate * 100).toFixed(3)}%`);
    }

    return {
      resultType,
      exitPrice,
      exitTime: Date.now(),
      grossProfit,
      netProfit,
      fees: friction,
      status: 'closed',
      calibrated: true
    };
  }

  async updateOpenTrades(): Promise<void> {
    const now = Date.now();
    const tradesToClose: VirtualTrade[] = [];

    for (const [id, trade] of this.virtualTrades) {
      if (trade.status !== 'open') continue;

      const elapsed = now - trade.entryTime;
      if (elapsed < TRADE_DURATION) {
        const outcome = this.getMarketOutcome(trade.signal.symbol);
        if (outcome.high >= trade.signal.takeProfit || outcome.low <= trade.signal.stopLoss) {
          tradesToClose.push(trade);
        }
        continue;
      }

      tradesToClose.push(trade);
    }

    for (const trade of tradesToClose) {
      await this.closeTrade(trade);
    }

    if (tradesToClose.length > 0) {
      console.log(`[L6][VTS] Closed ${tradesToClose.length} virtual trades`);
    }
  }

  /**
   * DEPRECATED by Directive 11.6D - Legacy random simulation pathway
   * This method used random fallback for price exits - no longer supported
   * All trade closures now handled by resolveOpenVirtualTrades() in vts-runner.ts
   */
  private async closeTrade(trade: VirtualTrade): Promise<void> {
    console.error(`[11.6D][DEPRECATED] closeTrade called for ${trade.signal?.symbol} - legacy random simulation is disabled`);
    console.error(`[11.6D][DEPRECATED] Trade closures should use persistRealPriceTrade() with real Kraken prices`);
    
    // Skip processing - legacy trades in virtualTrades map should not exist under 11.6D
    // If this is called, it indicates a code path violation
    if (trade.id.startsWith('vt_') && !trade.id.startsWith('vts_')) {
      console.error(`[11.6D][Error] Legacy random simulation trade detected! ID: ${trade.id}`);
    }
    
    // Do not process - just remove from map to prevent infinite loops
    this.virtualTrades.delete(trade.id);
  }

  /**
   * Directive 10.6: Trigger ML calibration analysis
   * Fire-and-forget to avoid blocking trade completion
   */
  private triggerMLCalibration(): void {
    MLCalibrationService.analyzePerformance()
      .then(report => {
        if (report.success) {
          MLCalibrationService.logRecommendations(report);
        }
      })
      .catch(err => console.error('[10.6] ML Calibration error:', err));
  }

  /**
   * Directive 10.6: Retrieve recent trades for ML calibration
   * @param windowSize Number of trades to retrieve
   * @param signalType Filter by signal type ('QUANT' | 'PATTERN' | 'HYBRID')
   */
  async getRecentTrades(windowSize: number, signalType: string): Promise<Array<{
    signalType?: string;
    patternType?: string;
    pnl: number;
  }>> {
    const historical = await this.loadHistoricalTrades();
    const allTrades = [...historical, ...this.closedTrades];
    
    // Filter by signal type if specified
    const filtered = signalType 
      ? allTrades.filter(t => t.signal.signalType === signalType)
      : allTrades;
    
    // Get most recent trades up to windowSize
    const recent = filtered.slice(-windowSize);
    
    return recent.map(t => ({
      signalType: t.signal.signalType,
      patternType: t.signal.patternType ?? undefined,
      pnl: t.netProfit || 0,
    }));
  }

  private async logTrade(trade: VirtualTrade): Promise<void> {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const logFile = path.join(VTS_LOGS_DIR, `${date}.json`);
      
      let trades: VirtualTrade[] = [];
      try {
        const existing = await fs.readFile(logFile, 'utf-8');
        trades = JSON.parse(existing);
      } catch {}

      trades.push(trade);
      await fs.writeFile(logFile, JSON.stringify(trades, null, 2));
    } catch (error) {
      console.error('[L6][VTS] Log failed:', error);
    }
  }

  async runCalibration(): Promise<FullCalibration> {
    const calibrationData = this.closedTrades
      .filter(t => t.status === 'closed' && t.netProfit !== undefined)
      .map(t => ({
        predictedProfit: t.signal.predictedProfit,
        actualProfit: t.netProfit!,
        strategy: t.signal.strategy || 'unknown'
      }));

    if (calibrationData.length < 10) {
      console.log(`[L8][VTS] Insufficient data for calibration: ${calibrationData.length} trades`);
      const fullCalibration = await loadFullCalibration();
      this.calibration = fullCalibration.global;
      this.fullCalibration = fullCalibration;
      return fullCalibration;
    }

    const fullCalibration = await calibrateFromTradesPerStrategy(calibrationData);
    this.calibration = fullCalibration.global;
    this.fullCalibration = fullCalibration;
    return fullCalibration;
  }

  async getFullCalibration(): Promise<FullCalibration> {
    if (this.fullCalibration) {
      return this.fullCalibration;
    }
    return await loadFullCalibration();
  }

  getStrategyStats(): Record<string, { trades: number; winRate: number; avgGross: number; avgNet: number }> {
    const strategyStats: Record<string, { trades: number; wins: number; totalGross: number; totalNet: number }> = {};
    
    for (const trade of this.closedTrades) {
      const strategy = trade.signal.strategy || 'unknown';
      if (!strategyStats[strategy]) {
        strategyStats[strategy] = { trades: 0, wins: 0, totalGross: 0, totalNet: 0 };
      }
      strategyStats[strategy].trades++;
      if ((trade.netProfit || 0) > 0) strategyStats[strategy].wins++;
      strategyStats[strategy].totalGross += trade.grossProfit || 0;
      strategyStats[strategy].totalNet += trade.netProfit || 0;
    }
    
    const result: Record<string, { trades: number; winRate: number; avgGross: number; avgNet: number }> = {};
    for (const [strategy, stats] of Object.entries(strategyStats)) {
      result[strategy] = {
        trades: stats.trades,
        winRate: stats.trades > 0 ? stats.wins / stats.trades : 0,
        avgGross: stats.trades > 0 ? stats.totalGross / stats.trades : 0,
        avgNet: stats.trades > 0 ? stats.totalNet / stats.trades : 0
      };
    }
    return result;
  }

  async loadHistoricalTrades(): Promise<VirtualTrade[]> {
    try {
      const files = await fs.readdir(VTS_LOGS_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      const allTrades: VirtualTrade[] = [];
      for (const file of jsonFiles.slice(-30)) {
        try {
          const content = await fs.readFile(path.join(VTS_LOGS_DIR, file), 'utf-8');
          const trades = JSON.parse(content) as VirtualTrade[];
          allTrades.push(...trades);
        } catch {}
      }
      
      // Phase 14: Exclude legacy simulation trades — only include Phase 14+ trades
      const phase14Trades = allTrades.filter(t => t.signal?.source === 'vts');
      if (phase14Trades.length < allTrades.length) {
        console.log(`[Phase14][VTS] Filtered ${allTrades.length - phase14Trades.length} legacy simulation trades from history (keeping ${phase14Trades.length} Phase 14 trades)`);
      }
      return phase14Trades;
    } catch {
      return [];
    }
  }

  getCalibration(): CalibrationCoefficients | null {
    return this.calibration;
  }

  getStats(): VTSStats {
    const closed = this.closedTrades;
    const wins = closed.filter(t => (t.netProfit || 0) > 0);
    
    return {
      totalTrades: this.virtualTrades.size + closed.length,
      openTrades: this.virtualTrades.size,
      closedTrades: closed.length,
      takeProfitCount: closed.filter(t => t.resultType === 'take_profit').length,
      stopLossCount: closed.filter(t => t.resultType === 'stop_loss').length,
      timeoutCount: closed.filter(t => t.resultType === 'timeout').length,
      avgGrossProfit: closed.length > 0 
        ? closed.reduce((sum, t) => sum + (t.grossProfit || 0), 0) / closed.length 
        : 0,
      avgNetProfit: closed.length > 0 
        ? closed.reduce((sum, t) => sum + (t.netProfit || 0), 0) / closed.length 
        : 0,
      winRate: closed.length > 0 ? wins.length / closed.length : 0,
      lastUpdate: Date.now()
    };
  }

  /**
   * M5B: Reset session metrics for new autonomous simulation session
   * Directive 11.0E.2: Phase-10 metrics
   */
  resetSessionMetrics(): void {
    this.sessionMetrics = {
      simulatedTradesThisSession: 0,
      sessionStartTime: Date.now(),
      avgFinalScore: 0,
      avgExpectedEdge: 0,
      avgRealizedPnL: 0,
      totalExpectedEdge: 0,
      totalRealizedPnL: 0
    };
    console.log('[11.0E.2][VTS] Session metrics reset (Phase-10)');
  }

  phase14FreshStart(): void {
    const oldClosedCount = this.closedTrades.length;
    const oldOpenCount = this.virtualTrades.size;
    this.closedTrades = [];
    this.virtualTrades.clear();
    this.resetSessionMetrics();
    console.log(`[Phase14][VTS] Fresh start: cleared ${oldClosedCount} closed + ${oldOpenCount} open in-memory trades`);
  }

  /**
   * M5B: Get current session metrics
   * Directive 11.0E.2: Returns Phase-10 aggregates
   */
  getSessionMetrics(): SessionMetrics {
    this.updateRollingAverages();
    return { ...this.sessionMetrics };
  }

  async exportTrades(): Promise<{ trades: VirtualTrade[]; stats: VTSStats; calibration: CalibrationCoefficients | null }> {
    const historical = await this.loadHistoricalTrades();
    return {
      trades: [...historical, ...this.closedTrades],
      stats: this.getStats(),
      calibration: this.calibration
    };
  }

  /**
   * M3B: Get adaptive learning parameters for live coupling
   * Directive 11.0E.2: Phase-10 metrics replace legacy GSI
   */
  getLearningParams(): VTSLearningParams {
    const stats = this.getStats();
    const sessionMetrics = this.getSessionMetrics();
    
    // Learning rate based on win rate and trade volume
    const baseLearningRate = 0.15;
    const performanceAdjustment = stats.winRate > 0.5 
      ? 1 - ((stats.winRate - 0.5) * 0.4)
      : 1 + ((0.5 - stats.winRate) * 0.4);
    const learningRate = Math.max(0.05, Math.min(0.30, baseLearningRate * performanceAdjustment));
    
    // Relevance coefficient based on performance
    const avgNetProfit = stats.avgNetProfit || 0;
    const profitStability = Math.abs(avgNetProfit) < 0.001 ? 0.5 : 
      avgNetProfit > 0 ? Math.min(0.95, 0.6 + avgNetProfit * 2) : 
      Math.max(0.3, 0.5 + avgNetProfit * 2);
    const relevance = Math.max(0.10, Math.min(0.40, learningRate * (profitStability + 0.15)));
    
    // Volatility index from recent trade outcomes
    const recentTrades = this.closedTrades.slice(-20);
    const volatilityIndex = recentTrades.length > 5 
      ? this.computeVolatilityIndex(recentTrades) 
      : 0.3;
    
    return {
      learningRate: Math.round(learningRate * 10000) / 10000,
      relevance: Math.round(relevance * 10000) / 10000,
      volatilityIndex: Math.round(volatilityIndex * 10000) / 10000,
      lastAdaptiveUpdate: new Date().toISOString(),
      // Phase-10 rolling averages
      avgFinalScore: Math.round(sessionMetrics.avgFinalScore * 10000) / 10000,
      avgExpectedEdge: Math.round(sessionMetrics.avgExpectedEdge * 10000) / 10000,
      avgRealizedPnL: Math.round(sessionMetrics.avgRealizedPnL * 10000) / 10000
    };
  }

  private computeVolatilityIndex(trades: VirtualTrade[]): number {
    if (trades.length < 2) return 0.3;
    
    const profits = trades.map(t => t.netProfit || 0);
    const mean = profits.reduce((a, b) => a + b, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / profits.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalize to 0-1 range (assuming typical std dev < 0.05)
    return Math.min(1, stdDev / 0.05);
  }

  /**
   * Directive 11.6C: Persist trades from real-price resolution system
   * Reuses existing logTrade() persistence without creating new tables
   * Ensures ML pipeline receives VTS_REAL_PRICE trades
   * @returns Object with persisted=true and mlTriggered=true if ML calibration was triggered
   */
  async persistRealPriceTrade(tradeData: {
    symbol: string;
    entryTime: number;
    exitTime: number;
    entryPrice: number;
    exitPrice: number;
    stopLoss: number;
    takeProfit: number;
    positionSize: number;
    regime: string;
    strategy: string;
    signalType: string;
    patternType?: string | null;
    pnl: number;
    grossPnl: number;
    exitReason: 'stop_hit' | 'target_hit' | 'timeout';
    finalScore: number;
    hybridScore: number;
    predictiveConfidence: number;
    regimeWeight: number;
    decayPenalty: number;
    frictionCost: number;
    pool: 'ideal' | 'rotational';
  }): Promise<{ persisted: boolean; mlTriggered: boolean }> {
    // Compute expected edge at entry time (predicted profit based on take profit distance)
    const tpDistance = (tradeData.takeProfit - tradeData.entryPrice) / tradeData.entryPrice;
    const expectedEdge = tpDistance - tradeData.frictionCost;
    
    // Normalize signalType to uppercase canonical format
    const normalizedSignalType = (tradeData.signalType?.toUpperCase() as 'QUANT' | 'PATTERN' | 'HYBRID') || 'HYBRID';
    
    // Calculate fees using the same formula as VTSService.simulateTrade
    const fees = tradeData.frictionCost * tradeData.positionSize;
    
    // Convert to VirtualTrade format for legacy persistence compatibility
    const signal: VirtualSignal = {
      id: `vs_${tradeData.entryTime}_${Math.random().toString(36).substr(2, 9)}`,
      symbol: tradeData.symbol,
      entryPrice: tradeData.entryPrice,
      takeProfit: tradeData.takeProfit,
      stopLoss: tradeData.stopLoss,
      spread: 0,
      predictedProfit: expectedEdge, // Use expected edge at entry, not realized PnL
      strategy: tradeData.strategy,
      createdAt: tradeData.entryTime,
      signalType: normalizedSignalType,
      patternType: tradeData.patternType,
      patternStrength: 0,
      finalScore: tradeData.finalScore,
      hybridScore: tradeData.hybridScore,
      predictiveConfidence: tradeData.predictiveConfidence,
      regimeWeight: tradeData.regimeWeight,
      decayPenalty: tradeData.decayPenalty,
      expectedEdge: expectedEdge,
      frictionCost: tradeData.frictionCost,
      regime: tradeData.regime,
      pool: tradeData.pool,
      source: 'simulation'
    };

    // Directive 11.6D: Unified trade ID format - vts_{symbol}_{timestamp}
    const trade: VirtualTrade = {
      id: `vts_${tradeData.symbol.replace('/', '_')}_${tradeData.exitTime}`,
      signal,
      status: 'closed',
      resultType: tradeData.exitReason === 'stop_hit' ? 'stop_loss' 
        : tradeData.exitReason === 'target_hit' ? 'take_profit' 
        : 'timeout',
      entryTime: tradeData.entryTime,
      exitTime: tradeData.exitTime,
      exitPrice: tradeData.exitPrice,
      grossProfit: tradeData.grossPnl,
      netProfit: tradeData.pnl,
      fees: fees,
      positionSize: tradeData.positionSize, // Bug fix: Now persisting positionSize
      calibrated: true,
      finalScore: tradeData.finalScore,
      hybridScore: tradeData.hybridScore,
      predictiveConfidence: tradeData.predictiveConfidence,
      regimeWeight: tradeData.regimeWeight,
      decayPenalty: tradeData.decayPenalty,
      expectedEdge: expectedEdge,
      frictionCost: tradeData.frictionCost,
      signalType: normalizedSignalType,
      strategy: tradeData.strategy,
      regime: tradeData.regime,
      pool: tradeData.pool,
      source: 'simulation', // Directive 11.6D: VTS_REAL_PRICE trades marked via ID prefix
      schemaVersion: '1.6.7'
    };

    // Add to closedTrades for ML calibration access
    this.closedTrades.push(trade);
    
    // Update session metrics
    this.sessionMetrics.simulatedTradesThisSession++;
    this.sessionMetrics.totalRealizedPnL += tradeData.pnl;
    this.updateRollingAverages();

    // Persist to JSON file via logTrade
    await this.logTrade(trade);
    
    // Directive 11.6D: Sanity check - validate unified ID format
    if (trade.id.startsWith('vt_') && !trade.id.startsWith('vts_')) {
      console.error(`[11.6D][Error] Legacy random simulation trade detected! ID: ${trade.id}`);
    }
    
    console.log(`[11.6D][Persist] ${tradeData.symbol} VTS_REAL_PRICE trade persisted (id=${trade.id})`);

    // Trigger ML calibration for HYBRID trades (return whether triggered)
    let mlTriggered = false;
    if (normalizedSignalType === 'HYBRID') {
      this.calibrationCounter++;
      if (this.calibrationCounter >= CALIBRATION_TRIGGER_INTERVAL) {
        this.calibrationCounter = 0;
        this.triggerMLCalibration();
        mlTriggered = true;
        console.log(`[11.6C][ML] ${tradeData.symbol} queued for ML feature aggregation`);
      }
    }
    
    return { persisted: true, mlTriggered };
  }
}

export const vtsService = new VTSService();
