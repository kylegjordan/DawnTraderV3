/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L12
 * ══════════════════════════════════════════════════════════════════════════════
 * Adaptive Regime Engine (ARE) Service
 * 
 * Purpose: Maps detected market regimes to optimal strategy mixes and dynamically
 * adjusts strategy weights and exposure biases used by the signal orchestrator.
 * 
 * Regime-Strategy Matrix:
 * - T1 (Trending Bull): Breakout 45%, Momentum 30%, DHMA 15%, Others 10%
 * - T2 (Trending Bear): Reversal 50%, Mean Reversion 30%, DHMA 20%
 * - R1 (Range-Bound): Mean Reversion 50%, Momentum 25%, Reversal 15%, Others 10%
 * - V1 (High Volatility): DHMA 60%, Reversal 25%, Others 15%
 * - C1 (Calm Consolidation): All strategies ≤ 10% (low exposure)
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';
import { getMarketProfiler, RegimeId, RegimeProfile } from './market-profiler';
import { contextBridge } from './context-bridge';

export interface StrategyMix {
  breakout: number;
  momentum: number;
  mean_reversion: number;
  reversal: number;
  dhma: number;
  vwap_pullback: number;
  sma_trend_ride: number;
  liquidity_trap: number;
}

export interface RegimeAdjustments {
  regime: RegimeId;
  strategyMix: StrategyMix;
  exposureMultiplier: number;
  riskMultiplier: number;
  dominantStrategies: string[];
  timestamp: string;
}

const REGIME_STRATEGY_MATRIX: Record<RegimeId, StrategyMix> = {
  T1: {
    breakout: 0.45,
    momentum: 0.30,
    mean_reversion: 0.05,
    reversal: 0.05,
    dhma: 0.10,
    vwap_pullback: 0.02,
    sma_trend_ride: 0.02,
    liquidity_trap: 0.01
  },
  T2: {
    breakout: 0.05,
    momentum: 0.10,
    mean_reversion: 0.30,
    reversal: 0.50,
    dhma: 0.02,
    vwap_pullback: 0.01,
    sma_trend_ride: 0.01,
    liquidity_trap: 0.01
  },
  R1: {
    breakout: 0.05,
    momentum: 0.25,
    mean_reversion: 0.50,
    reversal: 0.15,
    dhma: 0.02,
    vwap_pullback: 0.01,
    sma_trend_ride: 0.01,
    liquidity_trap: 0.01
  },
  V1: {
    breakout: 0.05,
    momentum: 0.05,
    mean_reversion: 0.05,
    reversal: 0.25,
    dhma: 0.60,
    vwap_pullback: 0.00,
    sma_trend_ride: 0.00,
    liquidity_trap: 0.00
  },
  C1: {
    breakout: 0.10,
    momentum: 0.10,
    mean_reversion: 0.10,
    reversal: 0.10,
    dhma: 0.10,
    vwap_pullback: 0.10,
    sma_trend_ride: 0.10,
    liquidity_trap: 0.10
  }
};

const REGIME_EXPOSURE_MULTIPLIERS: Record<RegimeId, number> = {
  T1: 1.2,   // Increase exposure in bull trends
  T2: 0.7,   // Reduce exposure in bear trends
  R1: 1.0,   // Normal exposure in range-bound
  V1: 0.5,   // Reduce exposure in high volatility
  C1: 0.3    // Minimal exposure in calm consolidation
};

const REGIME_RISK_MULTIPLIERS: Record<RegimeId, number> = {
  T1: 1.1,   // Slightly higher risk in bull trends
  T2: 0.8,   // Lower risk in bear trends
  R1: 1.0,   // Normal risk in range-bound
  V1: 0.6,   // Lower risk in high volatility
  C1: 0.5    // Minimal risk in calm consolidation
};

export class AdaptiveRegimeEngine extends EventEmitter {
  private currentAdjustments: RegimeAdjustments | null = null;
  private isRunning = false;
  private lastRegime: RegimeId | null = null;

  constructor() {
    super();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const profiler = getMarketProfiler();
    
    profiler.on('profile_update', (profile: RegimeProfile) => {
      this.handleProfileUpdate(profile);
    });
    
    profiler.on('regime_switch', (event: { from: RegimeId; to: RegimeId; confidence: number }) => {
      this.handleRegimeSwitch(event);
    });
    
    const currentProfile = profiler.getCurrentProfile();
    if (currentProfile) {
      this.handleProfileUpdate(currentProfile);
    }
    
    console.log('[L12][ARE] INIT_OK - Adaptive Regime Engine started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    
    const profiler = getMarketProfiler();
    profiler.removeAllListeners('profile_update');
    profiler.removeAllListeners('regime_switch');
    
    console.log('[L12][ARE] Adaptive Regime Engine stopped');
  }

  private handleProfileUpdate(profile: RegimeProfile): void {
    const adjustments = this.computeAdjustments(profile.regime, profile.confidence);
    this.currentAdjustments = adjustments;
    
    this.emit('adjustments_update', adjustments);
    
    contextBridge.broadcast({
      type: 'regime_adjustments' as any,
      payload: {
        regime: adjustments.regime,
        exposureMultiplier: adjustments.exposureMultiplier,
        riskMultiplier: adjustments.riskMultiplier,
        dominantStrategies: adjustments.dominantStrategies,
        timestamp: adjustments.timestamp
      }
    });
  }

  private handleRegimeSwitch(event: { from: RegimeId; to: RegimeId; confidence: number }): void {
    console.log(`[L12][ARE][REGIME_SWITCH] ${event.from}→${event.to} (confidence ${(event.confidence * 100).toFixed(1)}%)`);
    
    const adjustments = this.computeAdjustments(event.to, event.confidence);
    this.currentAdjustments = adjustments;
    this.lastRegime = event.from;
    
    this.emit('regime_switch', {
      from: event.from,
      to: event.to,
      adjustments
    });
    
    console.log(`[L12][ARE] Strategy mix updated: dominant strategies = ${adjustments.dominantStrategies.join(', ')}`);
    console.log(`[L12][ARE] Exposure multiplier: ${adjustments.exposureMultiplier.toFixed(2)}, Risk multiplier: ${adjustments.riskMultiplier.toFixed(2)}`);
  }

  private computeAdjustments(regime: RegimeId, confidence: number): RegimeAdjustments {
    const strategyMix = { ...REGIME_STRATEGY_MATRIX[regime] };
    const baseExposure = REGIME_EXPOSURE_MULTIPLIERS[regime];
    const baseRisk = REGIME_RISK_MULTIPLIERS[regime];
    
    const confidenceFactor = 0.5 + (confidence * 0.5);
    const exposureMultiplier = baseExposure * confidenceFactor;
    const riskMultiplier = baseRisk * confidenceFactor;
    
    const sortedStrategies = Object.entries(strategyMix)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
    
    return {
      regime,
      strategyMix,
      exposureMultiplier: Math.max(0.2, Math.min(1.5, exposureMultiplier)),
      riskMultiplier: Math.max(0.3, Math.min(1.3, riskMultiplier)),
      dominantStrategies: sortedStrategies,
      timestamp: new Date().toISOString()
    };
  }

  getCurrentAdjustments(): RegimeAdjustments | null {
    return this.currentAdjustments;
  }

  getStrategyWeight(strategy: string): number {
    if (!this.currentAdjustments) return 0.125; // Equal weight fallback
    
    const key = strategy.toLowerCase().replace(/[^a-z_]/g, '_') as keyof StrategyMix;
    return this.currentAdjustments.strategyMix[key] || 0.125;
  }

  getExposureMultiplier(): number {
    return this.currentAdjustments?.exposureMultiplier || 1.0;
  }

  getRiskMultiplier(): number {
    return this.currentAdjustments?.riskMultiplier || 1.0;
  }

  getDominantStrategies(): string[] {
    return this.currentAdjustments?.dominantStrategies || [];
  }

  getRegimeStrategyMatrix(): Record<RegimeId, StrategyMix> {
    return { ...REGIME_STRATEGY_MATRIX };
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

let adaptiveRegimeInstance: AdaptiveRegimeEngine | null = null;

export function getAdaptiveRegime(): AdaptiveRegimeEngine {
  if (!adaptiveRegimeInstance) {
    adaptiveRegimeInstance = new AdaptiveRegimeEngine();
  }
  return adaptiveRegimeInstance;
}

export function initAdaptiveRegime(): AdaptiveRegimeEngine {
  if (adaptiveRegimeInstance) {
    adaptiveRegimeInstance.stop();
  }
  adaptiveRegimeInstance = new AdaptiveRegimeEngine();
  return adaptiveRegimeInstance;
}
