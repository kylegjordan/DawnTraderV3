/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-L17: Adaptive Profit Realization & Stop-Loss Evolution (APR-SLE)
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Dynamically optimizes trade exit logic based on:
 * - Decision Index (DI) momentum
 * - Volatility conditions
 * - Regime-specific confidence levels
 */

import { EventEmitter } from 'events';
import { getDecisionConfidenceEngine } from './decision-confidence-engine';
import { getMarketProfiler } from './market-profiler';

export interface APRSLEConfig {
  alpha: number;      // TP widening sensitivity (default: 0.6)
  beta: number;       // SL tightening sensitivity (default: 0.4)
  tpBase: number;     // Base TP multiplier (default: 1.5)
  slBase: number;     // Base SL multiplier (default: 1.0)
  sigmaBaseline: number; // Baseline volatility for compensation
}

export interface RegimeMultipliers {
  tpMult: number;
  slMult: number;
}

export interface APRSLEOutput {
  adaptiveTP: number;
  adaptiveSL: number;
  diSlope: number;
  volCompensation: number;
  regime: string;
  tpAdjustmentPct: number;
  slAdjustmentPct: number;
  appliedAt: string;
}

export interface APRSLEStatus {
  isRunning: boolean;
  config: APRSLEConfig;
  meanDI: number;
  avgDISlope: number;
  avgTPAdjPct: number;
  avgSLAdjPct: number;
  volCompensation: number;
  currentRegime: string;
  lastRecalibration: string | null;
  recalibrationCount: number;
  sampleCount: number;
}

const REGIME_MULTIPLIERS: Record<string, RegimeMultipliers> = {
  T1: { tpMult: 1.15, slMult: 0.90 },   // Trending Bull: +15% TP, -10% SL
  T2: { tpMult: 1.10, slMult: 1.10 },   // Trending Bear: +10% TP, +10% SL (symmetric faster exits)
  R1: { tpMult: 1.00, slMult: 1.00 },   // Range-Bound: neutral
  V1: { tpMult: 0.80, slMult: 1.25 },   // High Volatility: -20% TP, +25% SL (tighten all)
  C1: { tpMult: 1.10, slMult: 0.95 },   // Calm Consolidation: +10% TP, -5% SL
};

const DEFAULT_CONFIG: APRSLEConfig = {
  alpha: 0.6,
  beta: 0.4,
  tpBase: 1.5,
  slBase: 1.0,
  sigmaBaseline: 0.02,
};

class APRSLEEngine extends EventEmitter {
  private config: APRSLEConfig;
  private isRunning: boolean = false;
  private diHistory: number[] = [];
  private tpAdjHistory: number[] = [];
  private slAdjHistory: number[] = [];
  private volHistory: number[] = [];
  private lastRecalibration: string | null = null;
  private recalibrationCount: number = 0;
  private sampleCount: number = 0;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    console.log('[L17][APR-SLE] Engine initialized with default config');
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[L17][APR-SLE] Engine started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('[L17][APR-SLE] Engine stopped');
    this.emit('stopped');
  }

  /**
   * Compute adaptive TP/SL for a given trade signal
   */
  computeAdaptiveExits(
    riskAmount: number,
    di: number,
    volatility: number,
    regime: string = 'R1'
  ): APRSLEOutput {
    const { alpha, beta, tpBase, slBase, sigmaBaseline } = this.config;

    // DI-based adjustment: TP = TPbase × [1 + α(DI - 0.5)]
    const diAdjustment = di - 0.5;
    const tpDiMult = 1 + alpha * diAdjustment;
    const slDiMult = 1 - beta * diAdjustment;

    // Volatility compensation: clamp(1 - (σ / σ_baseline) × 0.5, 0.7, 1.2)
    const volRatio = volatility / sigmaBaseline;
    const volCompensation = Math.max(0.7, Math.min(1.2, 1 - volRatio * 0.5));

    // Regime-based multipliers
    const regimeMults = REGIME_MULTIPLIERS[regime] || REGIME_MULTIPLIERS.R1;

    // Final TP/SL calculation
    const rawTP = tpBase * tpDiMult * volCompensation * regimeMults.tpMult;
    const rawSL = slBase * slDiMult * volCompensation * regimeMults.slMult;

    // Apply to risk amount
    const adaptiveTP = riskAmount * rawTP;
    const adaptiveSL = riskAmount * rawSL;

    // Calculate adjustment percentages relative to baseline
    const tpAdjustmentPct = ((rawTP / tpBase) - 1) * 100;
    const slAdjustmentPct = ((rawSL / slBase) - 1) * 100;

    // Track DI slope (change over recent history)
    this.diHistory.push(di);
    if (this.diHistory.length > 20) this.diHistory.shift();
    const diSlope = this.calculateDISlope();

    // Track adjustment history
    this.tpAdjHistory.push(tpAdjustmentPct);
    this.slAdjHistory.push(slAdjustmentPct);
    this.volHistory.push(volCompensation);
    if (this.tpAdjHistory.length > 100) {
      this.tpAdjHistory.shift();
      this.slAdjHistory.shift();
      this.volHistory.shift();
    }

    this.sampleCount++;

    const output: APRSLEOutput = {
      adaptiveTP,
      adaptiveSL,
      diSlope,
      volCompensation,
      regime,
      tpAdjustmentPct,
      slAdjustmentPct,
      appliedAt: new Date().toISOString(),
    };

    console.log(`[L17][APR] Applied TP=${adaptiveTP.toFixed(4)}, SL=${adaptiveSL.toFixed(4)}, DI=${di.toFixed(3)}, σ=${volatility.toFixed(4)}, regime=${regime}`);

    return output;
  }

  /**
   * Dynamic re-optimization based on DI momentum
   */
  shouldWidenTP(): boolean {
    const slope = this.calculateDISlope();
    const trendStable = this.isTrendStable();
    return slope > 0.1 && trendStable;
  }

  shouldTightenSL(): boolean {
    const slope = this.calculateDISlope();
    const driftDetected = this.detectDrift();
    return slope < -0.1 || driftDetected;
  }

  private calculateDISlope(): number {
    if (this.diHistory.length < 3) return 0;
    
    // Simple linear regression slope
    const n = this.diHistory.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = this.diHistory.reduce((a, b) => a + b, 0);
    const sumXY = this.diHistory.reduce((sum, y, i) => sum + i * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }

  private isTrendStable(): boolean {
    if (this.diHistory.length < 5) return true;
    const recent = this.diHistory.slice(-5);
    const variance = this.calculateVariance(recent);
    return variance < 0.02; // Low variance indicates stability
  }

  private detectDrift(): boolean {
    if (this.diHistory.length < 10) return false;
    const early = this.diHistory.slice(0, 5);
    const late = this.diHistory.slice(-5);
    const earlyMean = early.reduce((a, b) => a + b, 0) / early.length;
    const lateMean = late.reduce((a, b) => a + b, 0) / late.length;
    return Math.abs(lateMean - earlyMean) > 0.15;
  }

  private calculateVariance(arr: number[]): number {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / arr.length;
  }

  /**
   * Preview how TP/SL would adjust for a sample trade
   */
  preview(riskAmount: number = 100): APRSLEOutput {
    try {
      const dce = getDecisionConfidenceEngine();
      const profiler = getMarketProfiler();

      const status = dce.getStatus();
      const profile = profiler.getCurrentProfile();
      const currentRegime = profiler.getCurrentRegime();

      return this.computeAdaptiveExits(
        riskAmount,
        status.meanDI,
        profile?.metrics?.volatility || 0.02,
        currentRegime || 'R1'
      );
    } catch (e) {
      // Fallback with defaults
      return this.computeAdaptiveExits(riskAmount, 0.5, 0.02, 'R1');
    }
  }

  /**
   * Recalibrate α and β based on closed trade performance
   */
  async recalibrate(tradeResults?: Array<{ profit: number; di: number; tp: number; sl: number }>): Promise<{
    success: boolean;
    previousAlpha: number;
    previousBeta: number;
    newAlpha: number;
    newBeta: number;
    samplesUsed: number;
  }> {
    const previousAlpha = this.config.alpha;
    const previousBeta = this.config.beta;

    // If no trade results provided, use synthetic calibration
    if (!tradeResults || tradeResults.length < 50) {
      // Gentle adjustment based on recent DI slope trends
      const avgSlope = this.calculateDISlope();
      
      if (avgSlope > 0.05) {
        // Positive DI trend: widen TP slightly
        this.config.alpha = Math.min(0.8, this.config.alpha + 0.02);
      } else if (avgSlope < -0.05) {
        // Negative DI trend: tighten SL
        this.config.beta = Math.min(0.6, this.config.beta + 0.02);
      }
    } else {
      // Full recalibration with trade data
      const winningTrades = tradeResults.filter(t => t.profit > 0);
      const losingTrades = tradeResults.filter(t => t.profit <= 0);

      // Optimize alpha for winners (higher DI should correlate with larger TP capture)
      if (winningTrades.length > 10) {
        const avgWinnerDI = winningTrades.reduce((s, t) => s + t.di, 0) / winningTrades.length;
        const avgWinnerProfit = winningTrades.reduce((s, t) => s + t.profit, 0) / winningTrades.length;
        
        // If high DI trades are very profitable, increase alpha
        if (avgWinnerDI > 0.6 && avgWinnerProfit > 0.02) {
          this.config.alpha = Math.min(0.8, this.config.alpha + 0.05);
        }
      }

      // Optimize beta for losers (reduce loss magnitude)
      if (losingTrades.length > 10) {
        const avgLoserDI = losingTrades.reduce((s, t) => s + t.di, 0) / losingTrades.length;
        
        // If low DI trades are losing, increase beta to tighten SL faster
        if (avgLoserDI < 0.4) {
          this.config.beta = Math.min(0.6, this.config.beta + 0.03);
        }
      }
    }

    this.lastRecalibration = new Date().toISOString();
    this.recalibrationCount++;

    console.log(`[L17][APR-SLE] Recalibrated: α=${previousAlpha.toFixed(3)}→${this.config.alpha.toFixed(3)}, β=${previousBeta.toFixed(3)}→${this.config.beta.toFixed(3)}`);

    return {
      success: true,
      previousAlpha,
      previousBeta,
      newAlpha: this.config.alpha,
      newBeta: this.config.beta,
      samplesUsed: tradeResults?.length || this.diHistory.length,
    };
  }

  /**
   * Reset to baseline defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.diHistory = [];
    this.tpAdjHistory = [];
    this.slAdjHistory = [];
    this.volHistory = [];
    this.sampleCount = 0;
    console.log('[L17][APR-SLE] Reset to baseline defaults');
    this.emit('reset');
  }

  getStatus(): APRSLEStatus {
    const avgTPAdj = this.tpAdjHistory.length > 0
      ? this.tpAdjHistory.reduce((a, b) => a + b, 0) / this.tpAdjHistory.length
      : 0;
    const avgSLAdj = this.slAdjHistory.length > 0
      ? this.slAdjHistory.reduce((a, b) => a + b, 0) / this.slAdjHistory.length
      : 0;
    const avgVol = this.volHistory.length > 0
      ? this.volHistory.reduce((a, b) => a + b, 0) / this.volHistory.length
      : 1.0;
    const meanDI = this.diHistory.length > 0
      ? this.diHistory.reduce((a, b) => a + b, 0) / this.diHistory.length
      : 0.5;

    let currentRegime = 'R1';
    try {
      const profiler = getMarketProfiler();
      currentRegime = profiler.getCurrentRegime() || 'R1';
    } catch (e) {}

    return {
      isRunning: this.isRunning,
      config: { ...this.config },
      meanDI,
      avgDISlope: this.calculateDISlope(),
      avgTPAdjPct: avgTPAdj,
      avgSLAdjPct: avgSLAdj,
      volCompensation: avgVol,
      currentRegime,
      lastRecalibration: this.lastRecalibration,
      recalibrationCount: this.recalibrationCount,
      sampleCount: this.sampleCount,
    };
  }

  getConfig(): APRSLEConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<APRSLEConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[L17][APR-SLE] Config updated:', this.config);
  }
}

let aprSleInstance: APRSLEEngine | null = null;

export function initAPRSLEEngine(): APRSLEEngine {
  if (!aprSleInstance) {
    aprSleInstance = new APRSLEEngine();
    aprSleInstance.start();
  }
  return aprSleInstance;
}

export function getAPRSLEEngine(): APRSLEEngine {
  if (!aprSleInstance) {
    return initAPRSLEEngine();
  }
  return aprSleInstance;
}

export default APRSLEEngine;
