/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L15
 * ══════════════════════════════════════════════════════════════════════════════
 * Exploration Manager - Adaptive ε-greedy Control
 * 
 * Purpose: Dynamically modulates exploration probability (ε) based on global
 * performance variance. Higher global variance ⇒ more exploration.
 * 
 * Formula: ε = clamp(ε_min + (σ_global / σ_baseline) × ε_scale, ε_min, ε_max)
 * Typical: εₘᵢₙ=0.05, εₘₐₓ=0.25, εₛcₐₗₑ=0.15
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { getMACOCoordinator } from './maco-coordinator';

interface ExplorationState {
  epsilon: number;
  sigmaGlobal: number;
  sigmaBaseline: number;
  lastUpdate: string | null;
  isRunning: boolean;
  updateCount: number;
}

const EPSILON_MIN = 0.05;
const EPSILON_MAX = 0.25;
const EPSILON_SCALE = 0.15;
const SIGMA_BASELINE = 0.05;

class ExplorationManager extends EventEmitter {
  private state: ExplorationState;
  private mlServiceUrl: string;

  constructor() {
    super();
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
    
    this.state = {
      epsilon: 0.15,
      sigmaGlobal: 0,
      sigmaBaseline: SIGMA_BASELINE,
      lastUpdate: null,
      isRunning: false,
      updateCount: 0
    };

    console.log('[L15][EM] Exploration Manager initialized');
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    console.log('[L15][EM] Started');
    this.emit('started');
  }

  stop(): void {
    if (!this.state.isRunning) return;
    this.state.isRunning = false;
    console.log('[L15][EM] Stopped');
    this.emit('stopped');
  }

  async update(): Promise<{ success: boolean; epsilon: number; variance: number }> {
    try {
      const coordinator = getMACOCoordinator();
      const coordStatus = coordinator.getStatus();
      
      const variance = coordStatus.meanVariance || 0;
      this.state.sigmaGlobal = variance;

      const sigmaRatio = this.state.sigmaBaseline > 0
        ? variance / this.state.sigmaBaseline
        : 1.0;

      const newEpsilon = this.clamp(
        EPSILON_MIN + sigmaRatio * EPSILON_SCALE,
        EPSILON_MIN,
        EPSILON_MAX
      );

      const oldEpsilon = this.state.epsilon;
      this.state.epsilon = newEpsilon;
      this.state.lastUpdate = new Date().toISOString();
      this.state.updateCount++;

      await this.syncToMLService(variance);

      this.emit('updated', {
        oldEpsilon,
        newEpsilon,
        variance,
        sigmaRatio
      });

      console.log(`[L15][EM][UPDATE] ε: ${oldEpsilon.toFixed(3)} → ${newEpsilon.toFixed(3)} (σ=${variance.toFixed(4)})`);

      return {
        success: true,
        epsilon: newEpsilon,
        variance
      };
    } catch (error) {
      console.error('[L15][EM] Update error:', error);
      return {
        success: false,
        epsilon: this.state.epsilon,
        variance: this.state.sigmaGlobal
      };
    }
  }

  private async syncToMLService(variance: number): Promise<void> {
    try {
      await fetch(`${this.mlServiceUrl}/maco/exploration/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variance })
      });
    } catch (error) {
      console.warn('[L15][EM] Failed to sync to ML service:', error);
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  getEpsilon(): number {
    return this.state.epsilon;
  }

  getStatus(): ExplorationState {
    return { ...this.state };
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }
}

let explorationInstance: ExplorationManager | null = null;

export function getExplorationManager(): ExplorationManager {
  if (!explorationInstance) {
    explorationInstance = new ExplorationManager();
  }
  return explorationInstance;
}

export function initExplorationManager(): ExplorationManager {
  if (!explorationInstance) {
    explorationInstance = new ExplorationManager();
  }
  explorationInstance.start();
  return explorationInstance;
}

export { ExplorationManager };
