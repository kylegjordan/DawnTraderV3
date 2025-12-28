/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L15
 * ══════════════════════════════════════════════════════════════════════════════
 * Policy Consensus Engine (PCE) - Federated Gradient Averaging
 * 
 * Purpose: Aligns per-agent policies using federated gradient averaging to move
 * them toward the global optimum.
 * 
 * Formula: θ'ᵢ = θᵢ + μ(θ̄ - θᵢ) where μ = 0.3 and θ̄ is mean policy vector
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { getMACOCoordinator } from './maco-coordinator';

interface ConsensusState {
  consensusScore: number;
  policyConsensus: Record<string, number>;
  lastSync: string | null;
  syncCount: number;
  isRunning: boolean;
}

const CONSENSUS_MU = 0.3;

class PolicyConsensusEngine extends EventEmitter {
  private state: ConsensusState;
  private mlServiceUrl: string;

  constructor() {
    super();
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
    
    this.state = {
      consensusScore: 0.5,
      policyConsensus: {},
      lastSync: null,
      syncCount: 0,
      isRunning: false
    };

    console.log('[L15][PCE] Policy Consensus Engine initialized');
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    console.log('[L15][PCE] Started');
    this.emit('started');
  }

  stop(): void {
    if (!this.state.isRunning) return;
    this.state.isRunning = false;
    console.log('[L15][PCE] Stopped');
    this.emit('stopped');
  }

  async runConsensusRound(): Promise<{ success: boolean; consensusScore: number; globalReward: number }> {
    try {
      const response = await fetch(`${this.mlServiceUrl}/maco/consensus/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`ML service returned ${response.status}`);
      }

      const result = await response.json();

      this.state.consensusScore = result.consensus_score || 0.5;
      this.state.policyConsensus = result.policy_consensus || {};
      this.state.lastSync = new Date().toISOString();
      this.state.syncCount++;

      this.emit('consensusComplete', {
        consensusScore: this.state.consensusScore,
        globalReward: result.global_reward || 0,
        policyConsensus: this.state.policyConsensus
      });

      console.log(`[L15][PCE][SYNC] Consensus round #${this.state.syncCount}: score=${this.state.consensusScore.toFixed(3)}`);

      return {
        success: true,
        consensusScore: this.state.consensusScore,
        globalReward: result.global_reward || 0
      };
    } catch (error) {
      console.error('[L15][PCE] Consensus round error:', error);
      return {
        success: false,
        consensusScore: this.state.consensusScore,
        globalReward: 0
      };
    }
  }

  getConsensusScore(): number {
    return this.state.consensusScore;
  }

  getPolicyConsensus(): Record<string, number> {
    return { ...this.state.policyConsensus };
  }

  getStatus(): ConsensusState {
    return { ...this.state };
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }
}

let consensusInstance: PolicyConsensusEngine | null = null;

export function getPolicyConsensusEngine(): PolicyConsensusEngine {
  if (!consensusInstance) {
    consensusInstance = new PolicyConsensusEngine();
  }
  return consensusInstance;
}

export function initPolicyConsensusEngine(): PolicyConsensusEngine {
  if (!consensusInstance) {
    consensusInstance = new PolicyConsensusEngine();
  }
  consensusInstance.start();
  return consensusInstance;
}

export { PolicyConsensusEngine };
