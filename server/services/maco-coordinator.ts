/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L15
 * ══════════════════════════════════════════════════════════════════════════════
 * MACO Coordinator - Central Layer for Multi-Agent Cooperative Optimization
 * 
 * Purpose: Aggregates agent states and rewards; enforces shared learning signals.
 * Broadcasts regime and market signals to all agents, collects agent rewards,
 * computes global reward average and variance, emits cooperative signals.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { getMarketProfiler, RegimeId } from './market-profiler';
import { getRewardEvaluator } from './reward-evaluator';

interface AgentState {
  strategy: string;
  allocation: number;
  totalReward: number;
  confidence: number;
  trainingIterations: number;
  lastUpdate: string | null;
}

interface CoordinatorState {
  agents: Record<string, AgentState>;
  globalReward: number;
  meanVariance: number;
  explorationRate: number;
  lastSync: string | null;
  isRunning: boolean;
}

const STRATEGIES = ['breakout', 'momentum', 'mean_reversion', 'sma_trend_ride', 'dhma', 'reversal', 'range_trading', 'vwap_pullback', 'liquidity_trap'];

class MACOCoordinator extends EventEmitter {
  private state: CoordinatorState;
  private syncInterval: NodeJS.Timeout | null = null;
  private mlServiceUrl: string;

  constructor() {
    super();
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
    
    this.state = {
      agents: {},
      globalReward: 0,
      meanVariance: 0,
      explorationRate: 0.15,
      lastSync: null,
      isRunning: false
    };

    for (const strategy of STRATEGIES) {
      this.state.agents[strategy] = {
        strategy,
        allocation: 1.0 / STRATEGIES.length,
        totalReward: 0,
        confidence: 0.5,
        trainingIterations: 0,
        lastUpdate: null
      };
    }

    console.log(`[L15][COORD] Initialized with ${STRATEGIES.length} agents`);
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    console.log('[L15][COORD] Coordinator started');
    this.emit('started');
  }

  stop(): void {
    if (!this.state.isRunning) return;
    this.state.isRunning = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('[L15][COORD] Coordinator stopped');
    this.emit('stopped');
  }

  async sync(): Promise<{ success: boolean; globalReward: number; meanVariance: number }> {
    try {
      const macoStatus = await this.fetchMACOStatus();
      
      if (macoStatus?.agents) {
        for (const [strategy, agentData] of Object.entries(macoStatus.agents)) {
          if (this.state.agents[strategy]) {
            const data = agentData as { allocation: number; total_reward: number; confidence: number; training_iterations: number };
            this.state.agents[strategy].allocation = data.allocation || this.state.agents[strategy].allocation;
            this.state.agents[strategy].totalReward = data.total_reward || 0;
            this.state.agents[strategy].confidence = data.confidence || 0.5;
            this.state.agents[strategy].trainingIterations = data.training_iterations || 0;
            this.state.agents[strategy].lastUpdate = new Date().toISOString();
          }
        }
      }

      this.state.globalReward = macoStatus?.global_reward || this.computeGlobalReward();
      this.state.meanVariance = macoStatus?.mean_variance || this.computeVariance();
      this.state.explorationRate = macoStatus?.exploration_rate || 0.15;
      this.state.lastSync = new Date().toISOString();

      this.emit('synced', {
        globalReward: this.state.globalReward,
        meanVariance: this.state.meanVariance,
        agentCount: Object.keys(this.state.agents).length
      });

      console.log(`[L15][COORD][SYNC] globalReward=${this.state.globalReward.toFixed(4)}, variance=${this.state.meanVariance.toFixed(4)}`);

      return {
        success: true,
        globalReward: this.state.globalReward,
        meanVariance: this.state.meanVariance
      };
    } catch (error) {
      console.error('[L15][COORD][SYNC] Error:', error);
      return {
        success: false,
        globalReward: this.state.globalReward,
        meanVariance: this.state.meanVariance
      };
    }
  }

  private async fetchMACOStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.mlServiceUrl}/maco/status`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('[L15][COORD] Failed to fetch MACO status from ML service:', error);
    }
    return null;
  }

  private computeGlobalReward(): number {
    let total = 0;
    for (const agent of Object.values(this.state.agents)) {
      total += agent.totalReward;
    }
    return total;
  }

  private computeVariance(): number {
    const rewards = Object.values(this.state.agents).map(a => a.totalReward);
    if (rewards.length === 0) return 0;
    
    const mean = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const variance = rewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rewards.length;
    return variance;
  }

  async broadcastRegime(): Promise<void> {
    try {
      const mcp = getMarketProfiler();
      const currentRegime = mcp.getCurrentRegime();
      
      if (currentRegime) {
        this.emit('regimeBroadcast', { regime: currentRegime });
        console.log(`[L15][COORD] Broadcast regime: ${currentRegime}`);
      }
    } catch (error) {
      console.warn('[L15][COORD] Failed to broadcast regime:', error);
    }
  }

  async collectRewards(): Promise<Record<string, number>> {
    const rewards: Record<string, number> = {};
    
    try {
      const re = getRewardEvaluator();
      const reStatus = re.getStatus();
      
      for (const strategy of STRATEGIES) {
        const strategyRewards = reStatus.rewardsPerStrategy?.[strategy] || [];
        const avgReward = strategyRewards.length > 0
          ? strategyRewards.reduce((a: number, b: number) => a + b, 0) / strategyRewards.length
          : 0;
        rewards[strategy] = avgReward;
        
        if (this.state.agents[strategy]) {
          this.state.agents[strategy].totalReward += avgReward;
        }
      }
    } catch (error) {
      console.warn('[L15][COORD] Failed to collect rewards:', error);
    }
    
    return rewards;
  }

  getStatus(): CoordinatorState & { agentCount: number } {
    return {
      ...this.state,
      agentCount: Object.keys(this.state.agents).length
    };
  }

  getAgents(): Record<string, AgentState> {
    return { ...this.state.agents };
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }
}

let coordinatorInstance: MACOCoordinator | null = null;

export function getMACOCoordinator(): MACOCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new MACOCoordinator();
  }
  return coordinatorInstance;
}

export function initMACOCoordinator(): MACOCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new MACOCoordinator();
  }
  coordinatorInstance.start();
  return coordinatorInstance;
}

export { MACOCoordinator };
