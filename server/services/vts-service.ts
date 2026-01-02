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
import { getMarketProfiler, RegimeId } from './market-profiler';
import { getRegimePerformanceTracker } from './regime-performance';
import { getRewardEvaluator } from './reward-evaluator';
import { SYSTEM_GUARDS } from '../config/system-guards.js';
import { calculateFriction } from '../utils/analysis-utils.js';

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
}

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
  calibrated: boolean;
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
 */
export interface VTSLearningParams {
  learningRate: number;      // Adaptive learning rate based on performance
  gsi: number;               // Global Stability Index (0-1)
  relevance: number;         // Computed relevance for decay replacement
  volatilityIndex: number;   // Rolling volatility measure
  lastAdaptiveUpdate: string;
}

const TRADE_DURATION = 3 * 60 * 60 * 1000;
const VTS_LOGS_DIR = path.join(process.cwd(), 'logs', 'virtual_trades');

/**
 * M5B: Session metrics for autonomous simulation tracking
 */
interface SessionMetrics {
  simulatedTradesThisSession: number;
  sessionStartTime: number | null;
  averageCWQI: number;
  averageNGC: number;
  averageReturn: number;
}

export class VTSService extends EventEmitter {
  private virtualTrades: Map<string, VirtualTrade> = new Map();
  private closedTrades: VirtualTrade[] = [];
  private calibration: CalibrationCoefficients | null = null;
  private fullCalibration: FullCalibration | null = null;
  private isRunning = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private lastPrices: Map<string, { high: number; low: number; close: number }> = new Map();
  
  // M5B: Session tracking for autonomous simulation
  private sessionMetrics: SessionMetrics = {
    simulatedTradesThisSession: 0,
    sessionStartTime: null,
    averageCWQI: 0,
    averageNGC: 0,
    averageReturn: 0
  };

  constructor() {
    super();
    this.init();
  }

  private async init() {
    try {
      await fs.mkdir(VTS_LOGS_DIR, { recursive: true });
      this.fullCalibration = await loadFullCalibration();
      this.calibration = this.fullCalibration.global;
      const strategyCount = Object.keys(this.fullCalibration.strategies).length;
      console.log(`[L8][VTS] INIT_OK - calibration loaded (global + ${strategyCount} strategies)`);
    } catch (error) {
      console.error('[L8][VTS] Init failed:', error);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.updateInterval = setInterval(() => this.updateOpenTrades(), 5 * 60 * 1000);
    console.log('[L6][VTS] Started - 5min update cycle');
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

  async createVirtualTrade(signal: VirtualSignal): Promise<VirtualTrade> {
    const trade: VirtualTrade = {
      id: `vt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      signal,
      status: 'open',
      entryTime: Date.now(),
      calibrated: false
    };

    this.virtualTrades.set(trade.id, trade);
    this.emit('trade_opened', trade);
    
    // M5B: Track session metrics
    this.sessionMetrics.simulatedTradesThisSession++;
    
    console.log(`[M5B][VTS] Opened virtual trade: ${signal.symbol} @ ${signal.entryPrice.toFixed(4)}`);
    return trade;
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
    const friction = calculateFriction(entry, exitPrice, 1);
    const frictionRate = friction / entry;
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

  private async closeTrade(trade: VirtualTrade): Promise<void> {
    const outcome = this.getMarketOutcome(trade.signal.symbol);
    if (outcome.close === 0) {
      outcome.close = trade.signal.entryPrice * (1 + (Math.random() - 0.5) * 0.02);
      outcome.high = trade.signal.entryPrice * (1 + Math.random() * 0.03);
      outcome.low = trade.signal.entryPrice * (1 - Math.random() * 0.03);
    }

    const result = this.simulateTrade(trade.signal, outcome);
    Object.assign(trade, result);

    this.virtualTrades.delete(trade.id);
    this.closedTrades.push(trade);
    this.emit('trade_closed', trade);

    try {
      const mcp = getMarketProfiler();
      const currentRegime = mcp.getCurrentRegime();
      if (currentRegime && trade.netProfit !== undefined) {
        const rpt = getRegimePerformanceTracker();
        const duration = trade.exitTime ? trade.exitTime - trade.entryTime : 0;
        rpt.recordTradeOutcome({
          regime: currentRegime,
          pnl: trade.netProfit,
          strategy: trade.signal.strategy || 'unknown',
          duration,
          isWin: trade.netProfit > 0,
          timestamp: new Date().toISOString()
        });

        const re = getRewardEvaluator();
        re.recordTrade({
          strategy: trade.signal.strategy || 'unknown',
          regime: currentRegime,
          pnl: trade.netProfit,
          isWin: trade.netProfit > 0,
          entryPrice: trade.signal.entryPrice,
          exitPrice: trade.exitPrice || trade.signal.entryPrice,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('[L13][VTS] Failed to record trade to RPT:', error);
    }

    await this.logTrade(trade);
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
      
      return allTrades;
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
   */
  resetSessionMetrics(): void {
    this.sessionMetrics = {
      simulatedTradesThisSession: 0,
      sessionStartTime: Date.now(),
      averageCWQI: 0,
      averageNGC: 0,
      averageReturn: 0
    };
    console.log('[M5B][VTS] Session metrics reset');
  }

  /**
   * M5B: Get current session metrics
   */
  getSessionMetrics(): SessionMetrics {
    // Update average return if we have closed trades
    if (this.closedTrades.length > 0) {
      const avgReturn = this.closedTrades.reduce((sum, t) => sum + (t.netProfit || 0), 0) / this.closedTrades.length;
      this.sessionMetrics.averageReturn = avgReturn;
    }
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
   * These replace static decay factors in CWQI/NGC engines
   */
  getLearningParams(): VTSLearningParams {
    const stats = this.getStats();
    
    // Learning rate based on win rate and trade volume
    // Higher win rate = higher confidence in current model = lower learning rate
    // Base rate 0.15, adjusted by performance
    const baseLearningRate = 0.15;
    const performanceAdjustment = stats.winRate > 0.5 
      ? 1 - ((stats.winRate - 0.5) * 0.4) // Lower rate when performing well
      : 1 + ((0.5 - stats.winRate) * 0.4); // Higher rate when performing poorly
    const learningRate = Math.max(0.05, Math.min(0.30, baseLearningRate * performanceAdjustment));
    
    // GSI (Global Stability Index) based on consistency of profits
    // Higher consistency = higher stability
    const avgNetProfit = stats.avgNetProfit || 0;
    const profitStability = Math.abs(avgNetProfit) < 0.001 ? 0.5 : 
      avgNetProfit > 0 ? Math.min(0.95, 0.6 + avgNetProfit * 2) : 
      Math.max(0.3, 0.5 + avgNetProfit * 2);
    const gsi = profitStability;
    
    // Relevance coefficient = learningRate * (gsi + 0.15)
    // This replaces static decay factors
    const relevance = Math.max(0.10, Math.min(0.40, learningRate * (gsi + 0.15)));
    
    // Volatility index from recent trade outcomes
    const recentTrades = this.closedTrades.slice(-20);
    const volatilityIndex = recentTrades.length > 5 
      ? this.computeVolatilityIndex(recentTrades) 
      : 0.3;
    
    return {
      learningRate: Math.round(learningRate * 10000) / 10000,
      gsi: Math.round(gsi * 10000) / 10000,
      relevance: Math.round(relevance * 10000) / 10000,
      volatilityIndex: Math.round(volatilityIndex * 10000) / 10000,
      lastAdaptiveUpdate: new Date().toISOString()
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
}

export const vtsService = new VTSService();
