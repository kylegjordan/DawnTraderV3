/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L14
 * ══════════════════════════════════════════════════════════════════════════════
 * Reward Evaluator (RE) Service
 * 
 * Purpose: Computes per-strategy, per-regime cumulative rewards using:
 * R_{s,r} = α₁ × profit_rate + α₂ × win_rate − α₃ × drawdown
 * 
 * Coefficients: α₁=0.6, α₂=0.3, α₃=0.1
 * 
 * Stores rolling averages for last 1000 trades in /logs/rewards/
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { RegimeId } from './market-profiler';
import { getMarketProfiler } from './market-profiler';
import * as fs from 'fs';
import * as path from 'path';

export interface StrategyRegimeReward {
  strategy: string;
  regime: RegimeId;
  profitRate: number;
  winRate: number;
  drawdown: number;
  reward: number;
  tradeCount: number;
  lastUpdated: string;
}

export interface TradeResult {
  strategy: string;
  regime: RegimeId;
  pnl: number;
  isWin: boolean;
  entryPrice: number;
  exitPrice: number;
  timestamp: string;
}

interface StrategyRegimeKey {
  strategy: string;
  regime: RegimeId;
}

interface TradeHistory {
  results: TradeResult[];
  peakEquity: number;
  currentEquity: number;
}

const LOGS_DIR = path.join(process.cwd(), 'logs', 'rewards');
const ALPHA_1 = 0.6;  // Profit rate weight
const ALPHA_2 = 0.3;  // Win rate weight
const ALPHA_3 = 0.1;  // Drawdown penalty weight

class RewardEvaluatorService extends EventEmitter {
  private tradeHistory: Map<string, TradeHistory> = new Map();
  private rewardCache: Map<string, StrategyRegimeReward> = new Map();
  private isRunning = false;
  private evaluateInterval: NodeJS.Timeout | null = null;
  private readonly EVALUATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_TRADES_PER_KEY = 1000;

  constructor() {
    super();
    this.ensureLogsDir();
    this.loadHistory();
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  private getKey(strategy: string, regime: RegimeId): string {
    return `${strategy}:${regime}`;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[L14][RE] Starting Reward Evaluator');

    this.evaluateInterval = setInterval(() => {
      this.evaluateAll();
    }, this.EVALUATE_INTERVAL_MS);

    this.evaluateAll();
    console.log('[L14][RE] INIT_OK - Reward Evaluator started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.evaluateInterval) {
      clearInterval(this.evaluateInterval);
      this.evaluateInterval = null;
    }

    this.persistHistory();
    console.log('[L14][RE] Reward Evaluator stopped');
  }

  recordTrade(trade: TradeResult): void {
    const key = this.getKey(trade.strategy, trade.regime);

    if (!this.tradeHistory.has(key)) {
      this.tradeHistory.set(key, {
        results: [],
        peakEquity: 0,
        currentEquity: 0
      });
    }

    const history = this.tradeHistory.get(key)!;
    history.results.push(trade);

    history.currentEquity += trade.pnl;
    if (history.currentEquity > history.peakEquity) {
      history.peakEquity = history.currentEquity;
    }

    if (history.results.length > this.MAX_TRADES_PER_KEY) {
      history.results.shift();
    }

    this.emit('tradeRecorded', trade);
  }

  private evaluateAll(): void {
    console.log('[L14][RE] Evaluating all strategy-regime rewards');

    for (const [key, history] of this.tradeHistory.entries()) {
      const [strategy, regime] = key.split(':') as [string, RegimeId];
      const reward = this.computeReward(strategy, regime, history);
      this.rewardCache.set(key, reward);
    }

    this.persistHistory();
    this.emit('rewardsUpdated', this.getAllRewards());
  }

  private computeReward(strategy: string, regime: RegimeId, history: TradeHistory): StrategyRegimeReward {
    const trades = history.results;
    const tradeCount = trades.length;

    if (tradeCount === 0) {
      return {
        strategy,
        regime,
        profitRate: 0,
        winRate: 0,
        drawdown: 0,
        reward: 0,
        tradeCount: 0,
        lastUpdated: new Date().toISOString()
      };
    }

    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const profitRate = totalPnL / tradeCount;

    const wins = trades.filter(t => t.isWin).length;
    const winRate = wins / tradeCount;

    const drawdown = history.peakEquity > 0
      ? (history.peakEquity - history.currentEquity) / history.peakEquity
      : 0;

    const reward = ALPHA_1 * profitRate + ALPHA_2 * winRate - ALPHA_3 * drawdown;

    return {
      strategy,
      regime,
      profitRate,
      winRate,
      drawdown: Math.max(0, drawdown),
      reward,
      tradeCount,
      lastUpdated: new Date().toISOString()
    };
  }

  getReward(strategy: string, regime: RegimeId): StrategyRegimeReward | null {
    const key = this.getKey(strategy, regime);
    return this.rewardCache.get(key) || null;
  }

  getAllRewards(): StrategyRegimeReward[] {
    return Array.from(this.rewardCache.values());
  }

  getRewardsByStrategy(strategy: string): StrategyRegimeReward[] {
    return this.getAllRewards().filter(r => r.strategy === strategy);
  }

  getRewardsByRegime(regime: RegimeId): StrategyRegimeReward[] {
    return this.getAllRewards().filter(r => r.regime === regime);
  }

  getTotalReward(): number {
    return this.getAllRewards().reduce((sum, r) => sum + r.reward * r.tradeCount, 0);
  }

  getAverageReward(): number {
    const rewards = this.getAllRewards();
    const totalTrades = rewards.reduce((sum, r) => sum + r.tradeCount, 0);
    if (totalTrades === 0) return 0;
    return this.getTotalReward() / totalTrades;
  }

  private loadHistory(): void {
    const historyFile = path.join(LOGS_DIR, 'reward_history.json');
    if (fs.existsSync(historyFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
        for (const [key, value] of Object.entries(data.tradeHistory || {})) {
          this.tradeHistory.set(key, value as TradeHistory);
        }
        for (const [key, value] of Object.entries(data.rewardCache || {})) {
          this.rewardCache.set(key, value as StrategyRegimeReward);
        }
        console.log(`[L14][RE] Loaded ${this.tradeHistory.size} history entries`);
      } catch (error) {
        console.error('[L14][RE] Failed to load history:', error);
      }
    }
  }

  private persistHistory(): void {
    const historyFile = path.join(LOGS_DIR, 'reward_history.json');
    try {
      const data = {
        tradeHistory: Object.fromEntries(this.tradeHistory),
        rewardCache: Object.fromEntries(this.rewardCache),
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[L14][RE] Failed to persist history:', error);
    }
  }

  getStatus(): object {
    return {
      isRunning: this.isRunning,
      totalReward: this.getTotalReward(),
      averageReward: this.getAverageReward(),
      strategyRegimePairs: this.rewardCache.size,
      totalTrades: Array.from(this.tradeHistory.values()).reduce((sum, h) => sum + h.results.length, 0),
      lastEvaluation: new Date().toISOString()
    };
  }
}

let rewardEvaluatorInstance: RewardEvaluatorService | null = null;

export function getRewardEvaluator(): RewardEvaluatorService {
  if (!rewardEvaluatorInstance) {
    rewardEvaluatorInstance = new RewardEvaluatorService();
  }
  return rewardEvaluatorInstance;
}

export { RewardEvaluatorService };
