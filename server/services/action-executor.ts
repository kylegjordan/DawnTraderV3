/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L14
 * ══════════════════════════════════════════════════════════════════════════════
 * Action Executor (AE) Service
 * 
 * Purpose: Fetches updated allocations from the Policy Learner and smoothly
 * adjusts exposure & weights using exponential smoothing:
 * 
 * W'_s = (1 - λ) * W_s + λ * A_s  where λ = 0.2
 * 
 * Broadcasts via WebSocket: policyUpdated
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { contextBridge } from './context-bridge';
import { getExperienceBuffer, ExperienceState, ExperienceAction } from './experience-buffer';
import { getRewardEvaluator } from './reward-evaluator';
import { getMarketProfiler, RegimeId } from './market-profiler';
import * as fs from 'fs';
import * as path from 'path';

export interface StrategyAllocation {
  [strategy: string]: number;
}

export interface PolicyState {
  allocations: StrategyAllocation;
  confidence: number;
  dominantStrategy: string;
  lastUpdate: string;
  source: 'ml' | 'fallback';
}

const LOGS_DIR = path.join(process.cwd(), 'logs', 'policy');
const LAMBDA = 0.2;  // Smoothing factor

const DEFAULT_STRATEGIES = [
  'breakout', 'momentum', 'mean_reversion', 'sma_trend_ride',
  'dhma', 'reversal', 'range_trading', 'vwap_pullback'
];

class ActionExecutorService extends EventEmitter {
  private currentAllocations: StrategyAllocation = {};
  private policyConfidence: number = 0.5;
  private dominantStrategy: string = 'breakout';
  private isRunning = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
  private lastUpdateTime: string = '';
  private source: 'ml' | 'fallback' = 'fallback';

  constructor() {
    super();
    this.ensureLogsDir();
    this.initializeDefaultAllocations();
    this.loadState();
  }

  private ensureLogsDir(): void {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  private initializeDefaultAllocations(): void {
    const equalWeight = 1 / DEFAULT_STRATEGIES.length;
    for (const strategy of DEFAULT_STRATEGIES) {
      this.currentAllocations[strategy] = equalWeight;
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[L14][AE] Starting Action Executor');

    this.updateInterval = setInterval(() => {
      this.fetchAndApplyPolicy();
    }, this.UPDATE_INTERVAL_MS);

    console.log('[L14][AE] INIT_OK - Action Executor started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.persistState();
    console.log('[L14][AE] Action Executor stopped');
  }

  async fetchAndApplyPolicy(): Promise<PolicyState> {
    console.log('[L14][AE] Fetching policy from ML service');

    try {
      const mlHost = process.env.ML_SERVICE_HOST || 'http://localhost:5001';
      const mcp = getMarketProfiler();
      const currentRegime = mcp.getCurrentRegime();

      const response = await fetch(`${mlHost}/rl/policy?regime=${currentRegime}`);

      if (response.ok) {
        const data = await response.json();
        const newAllocations = data.allocations || {};
        this.policyConfidence = data.confidence || 0.5;
        this.source = 'ml';

        this.applySmoothing(newAllocations);
        this.updateDominantStrategy();
        this.lastUpdateTime = new Date().toISOString();

        console.log(`[L14][AE] Policy applied (confidence: ${(this.policyConfidence * 100).toFixed(1)}%, dominant: ${this.dominantStrategy})`);
      } else {
        this.applyFallbackPolicy();
      }
    } catch (error) {
      console.log('[L14][AE] ML service unavailable, using fallback policy');
      this.applyFallbackPolicy();
    }

    const state = this.getPolicyState();
    this.broadcastPolicyUpdate(state);
    this.persistState();
    this.recordExperience();

    return state;
  }

  private applySmoothing(newAllocations: StrategyAllocation): void {
    for (const strategy of DEFAULT_STRATEGIES) {
      const current = this.currentAllocations[strategy] || 0;
      const target = newAllocations[strategy] || 0;
      this.currentAllocations[strategy] = (1 - LAMBDA) * current + LAMBDA * target;
    }

    this.normalizeAllocations();
  }

  private normalizeAllocations(): void {
    const total = Object.values(this.currentAllocations).reduce((sum, v) => sum + v, 0);
    if (total > 0) {
      for (const strategy of Object.keys(this.currentAllocations)) {
        this.currentAllocations[strategy] /= total;
      }
    }
  }

  private applyFallbackPolicy(): void {
    const rewardEvaluator = getRewardEvaluator();
    const rewards = rewardEvaluator.getAllRewards();

    if (rewards.length === 0) {
      this.initializeDefaultAllocations();
    } else {
      const strategyRewards: { [s: string]: number } = {};
      for (const r of rewards) {
        if (!strategyRewards[r.strategy]) {
          strategyRewards[r.strategy] = 0;
        }
        strategyRewards[r.strategy] += r.reward;
      }

      const minReward = Math.min(...Object.values(strategyRewards), 0);
      const shifted: { [s: string]: number } = {};
      for (const [s, r] of Object.entries(strategyRewards)) {
        shifted[s] = r - minReward + 0.01;
      }

      const total = Object.values(shifted).reduce((sum, v) => sum + v, 0);
      for (const [s, v] of Object.entries(shifted)) {
        this.currentAllocations[s] = v / total;
      }
    }

    this.source = 'fallback';
    this.policyConfidence = 0.5;
    this.lastUpdateTime = new Date().toISOString();
    this.updateDominantStrategy();
  }

  private updateDominantStrategy(): void {
    let maxWeight = 0;
    let dominant = 'breakout';

    for (const [strategy, weight] of Object.entries(this.currentAllocations)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        dominant = strategy;
      }
    }

    this.dominantStrategy = dominant;
  }

  private recordExperience(): void {
    try {
      const mcp = getMarketProfiler();
      const profile = mcp.getCurrentProfile();
      const currentRegime = mcp.getCurrentRegime();
      const rewardEvaluator = getRewardEvaluator();

      const state: ExperienceState = {
        regime: currentRegime,
        strategy_weights: { ...this.currentAllocations },
        volatility: profile?.metrics.volatility || 0,
        trend: profile?.metrics.trend || 0,
        volume_z: profile?.metrics.volume_z || 0
      };

      const action: ExperienceAction = {
        allocations: { ...this.currentAllocations }
      };

      const reward = rewardEvaluator.getAverageReward();

      const nextState: ExperienceState = {
        regime: currentRegime,
        strategy_weights: { ...this.currentAllocations }
      };

      const buffer = getExperienceBuffer();
      buffer.addExperience(state, action, reward, nextState);
    } catch (error) {
      console.error('[L14][AE] Failed to record experience:', error);
    }
  }

  private broadcastPolicyUpdate(state: PolicyState): void {
    contextBridge.broadcast({
      type: 'policyUpdated',
      payload: {
        allocations: state.allocations,
        confidence: state.confidence,
        dominantStrategy: state.dominantStrategy,
        timestamp: state.lastUpdate,
        source: state.source
      }
    });

    this.emit('policyUpdated', state);
  }

  getAllocations(): StrategyAllocation {
    return { ...this.currentAllocations };
  }

  getStrategyWeight(strategy: string): number {
    return this.currentAllocations[strategy] || 0;
  }

  getPolicyState(): PolicyState {
    return {
      allocations: { ...this.currentAllocations },
      confidence: this.policyConfidence,
      dominantStrategy: this.dominantStrategy,
      lastUpdate: this.lastUpdateTime,
      source: this.source
    };
  }

  async manualApply(): Promise<PolicyState> {
    return this.fetchAndApplyPolicy();
  }

  private loadState(): void {
    const stateFile = path.join(LOGS_DIR, 'policy_state.json');
    if (fs.existsSync(stateFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        this.currentAllocations = data.allocations || {};
        this.policyConfidence = data.confidence || 0.5;
        this.dominantStrategy = data.dominantStrategy || 'breakout';
        this.lastUpdateTime = data.lastUpdate || '';
        this.source = data.source || 'fallback';
        console.log('[L14][AE] Loaded policy state');
      } catch (error) {
        console.error('[L14][AE] Failed to load state:', error);
      }
    }
  }

  private persistState(): void {
    const stateFile = path.join(LOGS_DIR, 'policy_state.json');
    try {
      const data = {
        allocations: this.currentAllocations,
        confidence: this.policyConfidence,
        dominantStrategy: this.dominantStrategy,
        lastUpdate: this.lastUpdateTime,
        source: this.source
      };
      fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[L14][AE] Failed to persist state:', error);
    }
  }

  getStatus(): object {
    return {
      isRunning: this.isRunning,
      confidence: this.policyConfidence,
      dominantStrategy: this.dominantStrategy,
      source: this.source,
      lastUpdate: this.lastUpdateTime,
      strategyCount: Object.keys(this.currentAllocations).length
    };
  }
}

let actionExecutorInstance: ActionExecutorService | null = null;

export function getActionExecutor(): ActionExecutorService {
  if (!actionExecutorInstance) {
    actionExecutorInstance = new ActionExecutorService();
  }
  return actionExecutorInstance;
}

export { ActionExecutorService };
