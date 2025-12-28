/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-L18: Equity Curve Smoothing (ECS) Controller
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Modulates exposure multiplier, trade frequency, and risk allocation
 * to smooth equity curve and prevent volatile swings.
 * 
 * Formula: E_new = E_base × (1 - γ × (DRS - 0.5))
 * 
 * γ = 0.7 (exposure damping factor)
 * Risk per Trade floor = 0.3 × baseline (never full shutdown)
 */

import { EventEmitter } from 'events';
import { getPDCEngine } from './pdc-engine';

export interface ECSConfig {
  gamma: number;              // Exposure damping factor (default: 0.7)
  riskFloorMultiplier: number; // Minimum risk as fraction of baseline (default: 0.3)
  baseExposure: number;        // Baseline exposure multiplier (default: 1.0)
  baseRiskPerTrade: number;    // Baseline risk per trade % (default: 1.0)
  recoverySpeed: number;       // How fast to recover exposure (default: 0.1)
}

export interface ECSOutput {
  exposureMultiplier: number;
  riskPerTradeMultiplier: number;
  tradeFrequencyMultiplier: number;
  dampingActive: boolean;
  recoveryProgress: number;
  appliedAt: string;
}

export interface ECSStatus {
  isRunning: boolean;
  config: ECSConfig;
  currentOutput: ECSOutput;
  adjustmentHistory: number;
  lastAdjustment: string | null;
  timestamp: string;
}

const DEFAULT_CONFIG: ECSConfig = {
  gamma: 0.7,
  riskFloorMultiplier: 0.3,
  baseExposure: 1.0,
  baseRiskPerTrade: 1.0,
  recoverySpeed: 0.1,
};

class ECSController extends EventEmitter {
  private isRunning: boolean = false;
  private config: ECSConfig;
  private currentExposureMultiplier: number = 1.0;
  private currentRiskMultiplier: number = 1.0;
  private currentFrequencyMultiplier: number = 1.0;
  private adjustmentCount: number = 0;
  private lastAdjustment: Date | null = null;
  private targetExposure: number = 1.0;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    console.log('[L18][ECS] Controller initialized with default config');
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[L18][ECS] Controller started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('[L18][ECS] Controller stopped');
    this.emit('stopped');
  }

  computeAdjustment(drs: number): ECSOutput {
    const drsCentered = drs - 0.5;
    
    this.targetExposure = this.config.baseExposure * (1 - this.config.gamma * drsCentered);
    this.targetExposure = Math.max(this.config.riskFloorMultiplier, Math.min(1.2, this.targetExposure));
    
    if (this.targetExposure < this.currentExposureMultiplier) {
      this.currentExposureMultiplier = this.targetExposure;
    } else {
      const diff = this.targetExposure - this.currentExposureMultiplier;
      this.currentExposureMultiplier += diff * this.config.recoverySpeed;
    }
    
    this.currentRiskMultiplier = Math.max(
      this.config.riskFloorMultiplier,
      this.currentExposureMultiplier
    );
    
    if (drs > 0.8) {
      this.currentFrequencyMultiplier = 0.5;
    } else if (drs > 0.6) {
      this.currentFrequencyMultiplier = 0.75;
    } else {
      this.currentFrequencyMultiplier = Math.min(
        1.0,
        this.currentFrequencyMultiplier + 0.05
      );
    }
    
    const dampingActive = this.currentExposureMultiplier < 0.95;
    
    if (dampingActive) {
      this.adjustmentCount++;
      this.lastAdjustment = new Date();
    }
    
    const output: ECSOutput = {
      exposureMultiplier: this.currentExposureMultiplier,
      riskPerTradeMultiplier: this.currentRiskMultiplier,
      tradeFrequencyMultiplier: this.currentFrequencyMultiplier,
      dampingActive,
      recoveryProgress: this.currentExposureMultiplier / this.config.baseExposure,
      appliedAt: new Date().toISOString(),
    };
    
    console.log(`[L18][ECS] Adjustment: exposure=${output.exposureMultiplier.toFixed(3)}, risk=${output.riskPerTradeMultiplier.toFixed(3)}, freq=${output.tradeFrequencyMultiplier.toFixed(2)}`);
    
    this.emit('adjustment', output);
    return output;
  }

  async updateFromPDC(): Promise<ECSOutput> {
    try {
      const pdc = getPDCEngine();
      const drs = pdc.getDrawdownRiskScore();
      return this.computeAdjustment(drs);
    } catch (e) {
      console.error('[L18][ECS] Error updating from PDC:', e);
      return this.computeAdjustment(0.5);
    }
  }

  preview(drs: number): ECSOutput {
    const drsCentered = drs - 0.5;
    
    let previewExposure = this.config.baseExposure * (1 - this.config.gamma * drsCentered);
    previewExposure = Math.max(this.config.riskFloorMultiplier, Math.min(1.2, previewExposure));
    
    const previewRisk = Math.max(this.config.riskFloorMultiplier, previewExposure);
    
    let previewFrequency = 1.0;
    if (drs > 0.8) {
      previewFrequency = 0.5;
    } else if (drs > 0.6) {
      previewFrequency = 0.75;
    }
    
    return {
      exposureMultiplier: previewExposure,
      riskPerTradeMultiplier: previewRisk,
      tradeFrequencyMultiplier: previewFrequency,
      dampingActive: previewExposure < 0.95,
      recoveryProgress: previewExposure / this.config.baseExposure,
      appliedAt: new Date().toISOString(),
    };
  }

  getExposureMultiplier(): number {
    return this.currentExposureMultiplier;
  }

  getRiskMultiplier(): number {
    return this.currentRiskMultiplier;
  }

  getFrequencyMultiplier(): number {
    return this.currentFrequencyMultiplier;
  }

  isDampingActive(): boolean {
    return this.currentExposureMultiplier < 0.95;
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.currentExposureMultiplier = 1.0;
    this.currentRiskMultiplier = 1.0;
    this.currentFrequencyMultiplier = 1.0;
    this.targetExposure = 1.0;
    this.adjustmentCount = 0;
    this.lastAdjustment = null;
    console.log('[L18][ECS] Controller reset to defaults');
  }

  updateConfig(updates: Partial<ECSConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[L18][ECS] Config updated:', this.config);
  }

  getStatus(): ECSStatus {
    return {
      isRunning: this.isRunning,
      config: { ...this.config },
      currentOutput: {
        exposureMultiplier: this.currentExposureMultiplier,
        riskPerTradeMultiplier: this.currentRiskMultiplier,
        tradeFrequencyMultiplier: this.currentFrequencyMultiplier,
        dampingActive: this.isDampingActive(),
        recoveryProgress: this.currentExposureMultiplier / this.config.baseExposure,
        appliedAt: this.lastAdjustment?.toISOString() || new Date().toISOString(),
      },
      adjustmentHistory: this.adjustmentCount,
      lastAdjustment: this.lastAdjustment?.toISOString() || null,
      timestamp: new Date().toISOString(),
    };
  }
}

let ecsControllerInstance: ECSController | null = null;

export function initECSController(): ECSController {
  if (!ecsControllerInstance) {
    ecsControllerInstance = new ECSController();
    ecsControllerInstance.start();
  }
  return ecsControllerInstance;
}

export function getECSController(): ECSController {
  if (!ecsControllerInstance) {
    return initECSController();
  }
  return ecsControllerInstance;
}
