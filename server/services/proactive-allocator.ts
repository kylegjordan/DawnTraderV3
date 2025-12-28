/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L13
 * ══════════════════════════════════════════════════════════════════════════════
 * Proactive Allocator (PA) Service
 * 
 * Purpose: Adjusts regime weights and exposures based on transition predictions,
 * enabling pre-emptive strategy positioning ahead of market changes.
 * 
 * Bias Formula:
 * Bias_s = clamp(1 + k(E[R_next] - E[R_current]), 0.7, 1.3)
 * where k = 0.5 by default
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { RegimeId } from './market-profiler';
import { getRegimePerformanceTracker, RegimePerformanceSummary } from './regime-performance';
import { contextBridge } from './context-bridge';

export interface TransitionPrediction {
  current: RegimeId;
  predicted_next: RegimeId;
  probabilities: Record<RegimeId, number>;
  confidence: number;
  timestamp: string;
}

export interface ProactiveBias {
  strategy: string;
  currentBias: number;
  predictedBias: number;
  blendedBias: number;
}

export interface AllocationAdjustments {
  currentRegime: RegimeId;
  predictedRegime: RegimeId;
  transitionConfidence: number;
  biases: ProactiveBias[];
  exposureMultiplier: number;
  riskMultiplier: number;
  forecastHorizon: string;
  timestamp: string;
}

const STRATEGY_REGIME_AFFINITY: Record<string, Record<RegimeId, number>> = {
  breakout: { T1: 0.9, T2: 0.2, R1: 0.3, V1: 0.4, C1: 0.3 },
  momentum: { T1: 0.8, T2: 0.3, R1: 0.5, V1: 0.4, C1: 0.3 },
  mean_reversion: { T1: 0.3, T2: 0.6, R1: 0.9, V1: 0.4, C1: 0.5 },
  reversal: { T1: 0.2, T2: 0.9, R1: 0.5, V1: 0.6, C1: 0.4 },
  dhma: { T1: 0.4, T2: 0.4, R1: 0.3, V1: 0.9, C1: 0.3 },
  vwap_pullback: { T1: 0.5, T2: 0.4, R1: 0.6, V1: 0.3, C1: 0.4 },
  sma_trend_ride: { T1: 0.7, T2: 0.3, R1: 0.4, V1: 0.3, C1: 0.4 },
  liquidity_trap: { T1: 0.3, T2: 0.5, R1: 0.4, V1: 0.6, C1: 0.3 }
};

const REGIME_BASE_EXPOSURE: Record<RegimeId, number> = {
  T1: 1.2, T2: 0.7, R1: 1.0, V1: 0.5, C1: 0.3
};

const REGIME_BASE_RISK: Record<RegimeId, number> = {
  T1: 1.1, T2: 0.8, R1: 1.0, V1: 0.6, C1: 0.5
};

class ProactiveAllocator extends EventEmitter {
  private currentPrediction: TransitionPrediction | null = null;
  private currentAdjustments: AllocationAdjustments | null = null;
  private isRunning = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly BIAS_SENSITIVITY = 0.5;
  private readonly UPDATE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('[L13][PA] Starting Proactive Allocator');
    
    await this.fetchPrediction();
    this.computeAdjustments();
    
    this.updateInterval = setInterval(
      () => this.runUpdateCycle(),
      this.UPDATE_INTERVAL_MS
    );
    
    console.log('[L13][PA] INIT_OK - Proactive Allocator started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    console.log('[L13][PA] Proactive Allocator stopped');
  }

  async fetchPrediction(): Promise<TransitionPrediction | null> {
    try {
      const mlHost = process.env.ML_SERVICE_HOST || 'http://localhost:5001';
      const response = await fetch(`${mlHost}/regime/transitions`);
      
      if (response.ok) {
        const data = await response.json();
        this.currentPrediction = {
          current: data.current || 'R1',
          predicted_next: data.predicted_next || 'R1',
          probabilities: data.probabilities || { T1: 0.2, T2: 0.2, R1: 0.2, V1: 0.2, C1: 0.2 },
          confidence: data.confidence || 0.5,
          timestamp: new Date().toISOString()
        };
        console.log(`[L13][PA] Prediction: ${this.currentPrediction.current} → ${this.currentPrediction.predicted_next} (${(this.currentPrediction.confidence * 100).toFixed(1)}%)`);
      }
    } catch (error) {
      console.log('[L13][PA] Using fallback prediction (ML service unavailable)');
      this.currentPrediction = {
        current: 'R1',
        predicted_next: 'R1',
        probabilities: { T1: 0.2, T2: 0.2, R1: 0.2, V1: 0.2, C1: 0.2 },
        confidence: 0.5,
        timestamp: new Date().toISOString()
      };
    }
    
    return this.currentPrediction;
  }

  private computeAdjustments(): void {
    if (!this.currentPrediction) return;
    
    const { current, predicted_next, confidence, probabilities } = this.currentPrediction;
    const rpt = getRegimePerformanceTracker();
    const perfStats = rpt.getPerformanceSummary();
    
    const eCurrentPnL = perfStats[current]?.pnl || 0;
    const eNextPnL = perfStats[predicted_next]?.pnl || 0;
    
    const biases: ProactiveBias[] = [];
    
    for (const [strategy, affinities] of Object.entries(STRATEGY_REGIME_AFFINITY)) {
      const currentBias = affinities[current] || 0.5;
      const predictedBias = affinities[predicted_next] || 0.5;
      
      const biasShift = this.BIAS_SENSITIVITY * (eNextPnL - eCurrentPnL);
      const blendedBias = Math.max(0.7, Math.min(1.3, 1 + biasShift));
      
      biases.push({
        strategy,
        currentBias,
        predictedBias,
        blendedBias
      });
    }
    
    const exposureMultiplier = 
      REGIME_BASE_EXPOSURE[current] * (1 - confidence * 0.3) +
      REGIME_BASE_EXPOSURE[predicted_next] * (confidence * 0.3);
    
    const riskMultiplier = 
      REGIME_BASE_RISK[current] * (1 - confidence * 0.3) +
      REGIME_BASE_RISK[predicted_next] * (confidence * 0.3);
    
    this.currentAdjustments = {
      currentRegime: current,
      predictedRegime: predicted_next,
      transitionConfidence: confidence,
      biases,
      exposureMultiplier,
      riskMultiplier,
      forecastHorizon: '15m',
      timestamp: new Date().toISOString()
    };
    
    this.emit('adjustmentsUpdated', this.currentAdjustments);
    
    contextBridge.broadcast({
      type: 'forecastUpdated',
      payload: {
        current,
        predicted_next,
        confidence,
        biases: biases.filter(b => Math.abs(b.blendedBias - 1) > 0.05),
        timestamp: this.currentAdjustments.timestamp
      }
    });
  }

  private async runUpdateCycle(): Promise<void> {
    console.log('[L13][PA] Running prediction update cycle');
    await this.fetchPrediction();
    this.computeAdjustments();
  }

  getPrediction(): TransitionPrediction | null {
    return this.currentPrediction;
  }

  getAdjustments(): AllocationAdjustments | null {
    return this.currentAdjustments;
  }

  getStrategyBias(strategy: string): number {
    if (!this.currentAdjustments) return 1.0;
    
    const bias = this.currentAdjustments.biases.find(b => b.strategy === strategy);
    return bias?.blendedBias || 1.0;
  }

  async triggerRetrain(): Promise<{ success: boolean; message: string }> {
    try {
      const mlHost = process.env.ML_SERVICE_HOST || 'http://localhost:5001';
      const response = await fetch(`${mlHost}/regime/retrain_transitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[L13][PA] Transition model retrained successfully');
        
        await this.fetchPrediction();
        this.computeAdjustments();
        
        contextBridge.broadcast({
          type: 'forecastRetrained',
          payload: {
            success: true,
            timestamp: new Date().toISOString()
          }
        });
        
        return { success: true, message: 'Model retrained successfully' };
      } else {
        return { success: false, message: 'Retrain request failed' };
      }
    } catch (error) {
      console.error('[L13][PA] Retrain error:', error);
      return { success: false, message: 'ML service unavailable' };
    }
  }

  isRunningStatus(): boolean {
    return this.isRunning;
  }
}

let paInstance: ProactiveAllocator | null = null;

export function getProactiveAllocator(): ProactiveAllocator {
  if (!paInstance) {
    paInstance = new ProactiveAllocator();
  }
  return paInstance;
}

export { ProactiveAllocator };
