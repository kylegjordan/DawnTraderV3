/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L13
 * ══════════════════════════════════════════════════════════════════════════════
 * Regime Performance Tracker (RPT) Service
 * 
 * Purpose: Continuously aggregates performance stats by current regime to measure
 * each regime's historical and real-time impact on trading performance.
 * 
 * Metrics per Regime:
 * - Avg PnL per trade
 * - Win Rate (wins / total)
 * - Volatility of returns (σ)
 * - Stability Index = (WinRate × avgPnL) / σ
 * - Weighted Confidence = normalized(Stability)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { RegimeId } from './market-profiler';
import * as fs from 'fs';
import * as path from 'path';

export interface RegimePerformanceStats {
  pnl: number;           // Average PnL per trade
  winRate: number;       // Win rate (0-1)
  volatility: number;    // σ - Volatility of returns
  stability: number;     // Stability Index
  confidence: number;    // Normalized confidence
  tradeCount: number;    // Number of trades in this regime
  lastUpdated: string;
}

export interface RegimePerformanceSummary {
  [key: string]: RegimePerformanceStats;
}

export interface TradeOutcome {
  regime: RegimeId;
  pnl: number;
  strategy: string;
  duration: number;
  isWin: boolean;
  timestamp: string;
}

interface RegimeTradeHistory {
  outcomes: TradeOutcome[];
  maxHistory: number;
}

const LOGS_DIR = path.join(process.cwd(), 'logs', 'regime_performance_history');

class RegimePerformanceTracker extends EventEmitter {
  private regimeHistory: Map<RegimeId, RegimeTradeHistory> = new Map();
  private performanceStats: RegimePerformanceSummary = {};
  private isRunning = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private readonly MAX_HISTORY_PER_REGIME = 1000;

  constructor() {
    super();
    this.initializeRegimes();
    this.ensureLogsDir();
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  private initializeRegimes(): void {
    const regimes: RegimeId[] = ['T1', 'T2', 'R1', 'V1', 'C1'];
    for (const regime of regimes) {
      this.regimeHistory.set(regime, {
        outcomes: [],
        maxHistory: this.MAX_HISTORY_PER_REGIME
      });
      this.performanceStats[regime] = {
        pnl: 0,
        winRate: 0,
        volatility: 0,
        stability: 0,
        confidence: 0,
        tradeCount: 0,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('[L13][RPT] Starting Regime Performance Tracker');
    
    await this.loadHistoricalData();
    this.computeAllStats();
    
    this.updateInterval = setInterval(
      () => this.runPeriodicUpdate(),
      this.UPDATE_INTERVAL_MS
    );
    
    console.log('[L13][RPT] INIT_OK - Regime Performance Tracker started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    console.log('[L13][RPT] Regime Performance Tracker stopped');
  }

  recordTradeOutcome(outcome: TradeOutcome): void {
    const history = this.regimeHistory.get(outcome.regime);
    if (!history) return;
    
    history.outcomes.push(outcome);
    
    if (history.outcomes.length > history.maxHistory) {
      history.outcomes.shift();
    }
    
    this.updateRegimeStats(outcome.regime);
    this.emit('outcomeRecorded', { regime: outcome.regime, outcome });
  }

  private updateRegimeStats(regime: RegimeId): void {
    const history = this.regimeHistory.get(regime);
    if (!history || history.outcomes.length === 0) return;
    
    const outcomes = history.outcomes;
    const pnls = outcomes.map(o => o.pnl);
    const wins = outcomes.filter(o => o.isWin).length;
    
    const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const winRate = wins / outcomes.length;
    
    const mean = avgPnl;
    const squaredDiffs = pnls.map(p => Math.pow(p - mean, 2));
    const volatility = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / pnls.length) || 0.001;
    
    const stability = volatility > 0 ? (winRate * avgPnl) / volatility : 0;
    
    this.performanceStats[regime] = {
      pnl: avgPnl,
      winRate,
      volatility,
      stability,
      confidence: 0,
      tradeCount: outcomes.length,
      lastUpdated: new Date().toISOString()
    };
  }

  private computeAllStats(): void {
    const regimes: RegimeId[] = ['T1', 'T2', 'R1', 'V1', 'C1'];
    
    for (const regime of regimes) {
      this.updateRegimeStats(regime);
    }
    
    const stabilities = regimes.map(r => this.performanceStats[r]?.stability || 0);
    const totalStability = stabilities.reduce((a, b) => a + b, 0) || 1;
    
    for (const regime of regimes) {
      if (this.performanceStats[regime]) {
        this.performanceStats[regime].confidence = 
          totalStability > 0 
            ? this.performanceStats[regime].stability / totalStability 
            : 0.2;
      }
    }
    
    this.emit('statsUpdated', this.performanceStats);
  }

  private async runPeriodicUpdate(): Promise<void> {
    console.log('[L13][RPT] Running hourly performance update');
    this.computeAllStats();
    await this.persistData();
    this.emit('periodicUpdate', this.performanceStats);
  }

  private async persistData(): Promise<void> {
    try {
      const filename = `rpt_${new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join(LOGS_DIR, filename);
      
      const data = {
        timestamp: new Date().toISOString(),
        stats: this.performanceStats,
        historySize: {} as Record<string, number>
      };
      
      const regimes: RegimeId[] = ['T1', 'T2', 'R1', 'V1', 'C1'];
      for (const regime of regimes) {
        data.historySize[regime] = this.regimeHistory.get(regime)?.outcomes.length || 0;
      }
      
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`[L13][RPT] Persisted data to ${filename}`);
    } catch (error) {
      console.error('[L13][RPT] Failed to persist data:', error);
    }
  }

  private async loadHistoricalData(): Promise<void> {
    try {
      const files = fs.readdirSync(LOGS_DIR)
        .filter(f => f.startsWith('rpt_') && f.endsWith('.json'))
        .sort()
        .slice(-7);
      
      console.log(`[L13][RPT] Loading ${files.length} historical files`);
    } catch (error) {
      console.log('[L13][RPT] No historical data to load');
    }
  }

  getPerformanceSummary(): RegimePerformanceSummary {
    return { ...this.performanceStats };
  }

  getTopPerformer(): { regime: RegimeId; stats: RegimePerformanceStats } | null {
    const regimes: RegimeId[] = ['T1', 'T2', 'R1', 'V1', 'C1'];
    let best: { regime: RegimeId; stats: RegimePerformanceStats } | null = null;
    
    for (const regime of regimes) {
      const stats = this.performanceStats[regime];
      if (stats && stats.tradeCount >= 5) {
        if (!best || stats.stability > best.stats.stability) {
          best = { regime, stats };
        }
      }
    }
    
    return best;
  }

  getRollingStats(regime: RegimeId, windowSize: number = 50): RegimePerformanceStats | null {
    const history = this.regimeHistory.get(regime);
    if (!history || history.outcomes.length === 0) return null;
    
    const recent = history.outcomes.slice(-windowSize);
    if (recent.length === 0) return null;
    
    const pnls = recent.map(o => o.pnl);
    const wins = recent.filter(o => o.isWin).length;
    
    const avgPnl = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const winRate = wins / recent.length;
    
    const mean = avgPnl;
    const squaredDiffs = pnls.map(p => Math.pow(p - mean, 2));
    const volatility = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / pnls.length) || 0.001;
    const stability = volatility > 0 ? (winRate * avgPnl) / volatility : 0;
    
    return {
      pnl: avgPnl,
      winRate,
      volatility,
      stability,
      confidence: this.performanceStats[regime]?.confidence || 0,
      tradeCount: recent.length,
      lastUpdated: new Date().toISOString()
    };
  }

  isRunningStatus(): boolean {
    return this.isRunning;
  }
}

let rptInstance: RegimePerformanceTracker | null = null;

export function getRegimePerformanceTracker(): RegimePerformanceTracker {
  if (!rptInstance) {
    rptInstance = new RegimePerformanceTracker();
  }
  return rptInstance;
}

export { RegimePerformanceTracker };
