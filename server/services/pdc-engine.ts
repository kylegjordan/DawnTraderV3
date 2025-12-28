/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-L18: Predictive Drawdown Containment (PDC) Engine
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Detects early-stage drawdown precursors using:
 * - Equity slope (ΔE/Δt)
 * - Volatility spikes (σ_recent / σ_baseline)
 * - DI decay (DI_{t-5} - DI_t)
 * 
 * Computes Drawdown Risk Score (DRS):
 * DRS = w₁|equity_slope| + w₂(vol_ratio) + w₃|DI_drift|
 * 
 * DRS > 0.6 → warning
 * DRS > 0.8 → containment triggered
 */

import { EventEmitter } from 'events';
import { getDecisionConfidenceEngine } from './decision-confidence-engine';

export interface PDCConfig {
  w1: number;           // Equity slope weight (default: 0.5)
  w2: number;           // Volatility ratio weight (default: 0.3)
  w3: number;           // DI drift weight (default: 0.2)
  windowSize: number;   // Rolling window size (default: 250)
  warningThreshold: number;      // DRS warning level (default: 0.6)
  containmentThreshold: number;  // DRS containment level (default: 0.8)
  recoveryThreshold: number;     // DRS recovery level (default: 0.4)
  recoveryWindows: number;       // Consecutive windows for recovery (default: 3)
}

export interface PDCMetrics {
  equitySlope: number;
  volRatio: number;
  diDrift: number;
  drawdownRiskScore: number;
  containmentActive: boolean;
  warningActive: boolean;
  consecutiveRecoveryWindows: number;
}

export interface PDCStatus {
  isRunning: boolean;
  config: PDCConfig;
  metrics: PDCMetrics;
  equitySamples: number;
  lastRecalibration: string | null;
  recalibrationCount: number;
  timestamp: string;
}

const DEFAULT_CONFIG: PDCConfig = {
  w1: 0.5,
  w2: 0.3,
  w3: 0.2,
  windowSize: 250,
  warningThreshold: 0.6,
  containmentThreshold: 0.8,
  recoveryThreshold: 0.4,
  recoveryWindows: 3,
};

class PDCEngine extends EventEmitter {
  private isRunning: boolean = false;
  private config: PDCConfig;
  private equityHistory: number[] = [];
  private diHistory: number[] = [];
  private drsHistory: number[] = [];
  private baselineVolatility: number = 0.02;
  private containmentActive: boolean = false;
  private warningActive: boolean = false;
  private consecutiveRecoveryWindows: number = 0;
  private lastRecalibration: Date | null = null;
  private recalibrationCount: number = 0;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    console.log('[L18][PDC] Engine initialized with default config');
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[L18][PDC] Engine started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('[L18][PDC] Engine stopped');
    this.emit('stopped');
  }

  recordEquitySample(equity: number): void {
    this.equityHistory.push(equity);
    if (this.equityHistory.length > this.config.windowSize) {
      this.equityHistory.shift();
    }
  }

  recordDISample(di: number): void {
    this.diHistory.push(di);
    if (this.diHistory.length > 20) {
      this.diHistory.shift();
    }
  }

  private computeEquitySlope(): number {
    if (this.equityHistory.length < 10) return 0;
    
    const recentWindow = this.equityHistory.slice(-20);
    const n = recentWindow.length;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recentWindow[i];
      sumXY += i * recentWindow[i];
      sumX2 += i * i;
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    const avgEquity = sumY / n;
    return avgEquity > 0 ? slope / avgEquity : 0;
  }

  private computeVolRatio(): number {
    if (this.equityHistory.length < 20) return 1.0;
    
    const recentWindow = this.equityHistory.slice(-20);
    const returns: number[] = [];
    for (let i = 1; i < recentWindow.length; i++) {
      if (recentWindow[i - 1] > 0) {
        returns.push((recentWindow[i] - recentWindow[i - 1]) / recentWindow[i - 1]);
      }
    }
    
    if (returns.length < 2) return 1.0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    const recentVol = Math.sqrt(variance);
    
    return this.baselineVolatility > 0 ? recentVol / this.baselineVolatility : 1.0;
  }

  private computeDIDrift(): number {
    if (this.diHistory.length < 6) return 0;
    
    const currentDI = this.diHistory[this.diHistory.length - 1];
    const pastDI = this.diHistory[this.diHistory.length - 6];
    
    return pastDI - currentDI;
  }

  computeDrawdownRiskScore(): PDCMetrics {
    const equitySlope = this.computeEquitySlope();
    const volRatio = this.computeVolRatio();
    const diDrift = this.computeDIDrift();
    
    const slopeContribution = Math.min(Math.abs(equitySlope) * 50, 1.0);
    const volContribution = Math.min(Math.max(volRatio - 1.0, 0) * 2, 1.0);
    const driftContribution = Math.min(Math.abs(diDrift) * 5, 1.0);
    
    const drs = 
      this.config.w1 * slopeContribution +
      this.config.w2 * volContribution +
      this.config.w3 * driftContribution;
    
    const clampedDRS = Math.min(Math.max(drs, 0), 1);
    
    this.drsHistory.push(clampedDRS);
    if (this.drsHistory.length > 50) {
      this.drsHistory.shift();
    }
    
    const prevContainment = this.containmentActive;
    const prevWarning = this.warningActive;
    
    if (clampedDRS >= this.config.containmentThreshold) {
      this.containmentActive = true;
      this.warningActive = true;
      this.consecutiveRecoveryWindows = 0;
    } else if (clampedDRS >= this.config.warningThreshold) {
      this.warningActive = true;
      this.consecutiveRecoveryWindows = 0;
    } else if (clampedDRS < this.config.recoveryThreshold) {
      this.consecutiveRecoveryWindows++;
      if (this.consecutiveRecoveryWindows >= this.config.recoveryWindows) {
        this.containmentActive = false;
        this.warningActive = false;
      }
    } else {
      this.consecutiveRecoveryWindows = 0;
    }
    
    if (this.containmentActive !== prevContainment) {
      console.log(`[L18][PDC] Containment ${this.containmentActive ? 'ACTIVATED' : 'DEACTIVATED'} (DRS: ${clampedDRS.toFixed(3)})`);
      this.emit('containment_changed', { active: this.containmentActive, drs: clampedDRS });
    }
    
    if (this.warningActive !== prevWarning && !this.containmentActive) {
      console.log(`[L18][PDC] Warning ${this.warningActive ? 'ACTIVATED' : 'CLEARED'} (DRS: ${clampedDRS.toFixed(3)})`);
    }
    
    return {
      equitySlope,
      volRatio,
      diDrift,
      drawdownRiskScore: clampedDRS,
      containmentActive: this.containmentActive,
      warningActive: this.warningActive,
      consecutiveRecoveryWindows: this.consecutiveRecoveryWindows,
    };
  }

  async runPredictiveScan(): Promise<PDCMetrics> {
    try {
      const dce = getDecisionConfidenceEngine();
      const status = dce.getStatus();
      this.recordDISample(status.meanDI);
    } catch (e) {
      console.log('[L18][PDC] Could not fetch DI from DCE');
    }
    
    const metrics = this.computeDrawdownRiskScore();
    console.log(`[L18][PDC] Scan complete - DRS: ${metrics.drawdownRiskScore.toFixed(3)}, Containment: ${metrics.containmentActive}`);
    
    return metrics;
  }

  async recalibrate(tradeResults?: Array<{ profit: number; wasContained: boolean }>): Promise<{
    newW1: number;
    newW2: number;
    newW3: number;
    samplesUsed: number;
  }> {
    console.log('[L18][PDC] Starting recalibration...');
    
    if (!tradeResults || tradeResults.length < 10) {
      console.log('[L18][PDC] Insufficient trade data, maintaining current weights');
      this.lastRecalibration = new Date();
      this.recalibrationCount++;
      return {
        newW1: this.config.w1,
        newW2: this.config.w2,
        newW3: this.config.w3,
        samplesUsed: 0,
      };
    }
    
    const containedTrades = tradeResults.filter(t => t.wasContained);
    const normalTrades = tradeResults.filter(t => !t.wasContained);
    
    const containedAvgProfit = containedTrades.length > 0
      ? containedTrades.reduce((s, t) => s + t.profit, 0) / containedTrades.length
      : 0;
    const normalAvgProfit = normalTrades.length > 0
      ? normalTrades.reduce((s, t) => s + t.profit, 0) / normalTrades.length
      : 0;
    
    if (containedAvgProfit > normalAvgProfit * 0.8) {
      this.config.w1 = Math.min(this.config.w1 * 1.05, 0.7);
      this.config.w2 = Math.max(this.config.w2 * 0.98, 0.15);
    } else {
      this.config.w1 = Math.max(this.config.w1 * 0.98, 0.3);
      this.config.w2 = Math.min(this.config.w2 * 1.02, 0.4);
    }
    
    const total = this.config.w1 + this.config.w2 + this.config.w3;
    this.config.w1 /= total;
    this.config.w2 /= total;
    this.config.w3 /= total;
    
    this.lastRecalibration = new Date();
    this.recalibrationCount++;
    
    console.log(`[L18][PDC] Recalibrated: w1=${this.config.w1.toFixed(3)}, w2=${this.config.w2.toFixed(3)}, w3=${this.config.w3.toFixed(3)}`);
    
    return {
      newW1: this.config.w1,
      newW2: this.config.w2,
      newW3: this.config.w3,
      samplesUsed: tradeResults.length,
    };
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.equityHistory = [];
    this.diHistory = [];
    this.drsHistory = [];
    this.containmentActive = false;
    this.warningActive = false;
    this.consecutiveRecoveryWindows = 0;
    this.lastRecalibration = null;
    this.recalibrationCount = 0;
    console.log('[L18][PDC] Engine reset to defaults');
  }

  isContainmentActive(): boolean {
    return this.containmentActive;
  }

  getDrawdownRiskScore(): number {
    return this.drsHistory.length > 0 ? this.drsHistory[this.drsHistory.length - 1] : 0;
  }

  getDRSHistory(): number[] {
    return [...this.drsHistory];
  }

  getStatus(): PDCStatus {
    const metrics = this.computeDrawdownRiskScore();
    
    return {
      isRunning: this.isRunning,
      config: { ...this.config },
      metrics,
      equitySamples: this.equityHistory.length,
      lastRecalibration: this.lastRecalibration?.toISOString() || null,
      recalibrationCount: this.recalibrationCount,
      timestamp: new Date().toISOString(),
    };
  }
}

let pdcEngineInstance: PDCEngine | null = null;

export function initPDCEngine(): PDCEngine {
  if (!pdcEngineInstance) {
    pdcEngineInstance = new PDCEngine();
    pdcEngineInstance.start();
  }
  return pdcEngineInstance;
}

export function getPDCEngine(): PDCEngine {
  if (!pdcEngineInstance) {
    return initPDCEngine();
  }
  return pdcEngineInstance;
}
