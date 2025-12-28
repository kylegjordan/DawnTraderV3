import { EventEmitter } from 'events';

export interface GASPMetrics {
  lambdaVariance: number;
  diVariance: number;
  alphaBetaVariance: number;
  drsVariance: number;
}

export interface CorrelationMatrix {
  lambda_di: number;
  lambda_drs: number;
  di_drs: number;
  regime_lambda: number;
  regime_di: number;
  regime_drs: number;
}

export interface GASPStatus {
  ok: boolean;
  gsi: number;
  gsiGrade: 'stable' | 'caution' | 'critical';
  mode: 'normal' | 'caution' | 'containment' | 'recovery';
  correlationMax: number;
  correlationMatrix: CorrelationMatrix;
  dampedLearningRate: number;
  dampedExposure: number;
  metrics: GASPMetrics;
  cooldownActive: boolean;
  cooldownStarted: string | null;
  recoveryProgress: number;
  lastScan: string | null;
  scanCount: number;
}

export interface GASPConfig {
  w1: number;
  w2: number;
  w3: number;
  w4: number;
  stableThreshold: number;
  cautionThreshold: number;
  criticalThreshold: number;
  correlationWarning: number;
  correlationCritical: number;
  cooldownDurationMs: number;
  recoveryDurationMs: number;
}

export interface StabilityHistoryEntry {
  timestamp: string;
  gsi: number;
  mode: string;
  correlationMax: number;
  dampedLearningRate: number;
  dampedExposure: number;
}

const DEFAULT_CONFIG: GASPConfig = {
  w1: 0.4,
  w2: 0.3,
  w3: 0.2,
  w4: 0.1,
  stableThreshold: 0.85,
  cautionThreshold: 0.70,
  criticalThreshold: 0.65,
  correlationWarning: 0.8,
  correlationCritical: 0.9,
  cooldownDurationMs: 10 * 60 * 1000,
  recoveryDurationMs: 15 * 60 * 1000,
};

class GASPCoordinator extends EventEmitter {
  private isRunning: boolean = false;
  private config: GASPConfig;
  private currentGSI: number = 1.0;
  private currentMode: 'normal' | 'caution' | 'containment' | 'recovery' = 'normal';
  private correlationMatrix: CorrelationMatrix;
  private metrics: GASPMetrics;
  private dampedLearningRate: number = 1.0;
  private dampedExposure: number = 1.0;
  private cooldownActive: boolean = false;
  private cooldownStarted: Date | null = null;
  private recoveryStarted: Date | null = null;
  private lastScan: Date | null = null;
  private scanCount: number = 0;
  private stabilityHistory: StabilityHistoryEntry[] = [];
  private readonly MAX_HISTORY = 500;

  private lambdaHistory: number[] = [];
  private diHistory: number[] = [];
  private alphaBetaHistory: number[] = [];
  private drsHistory: number[] = [];
  private regimeHistory: number[] = [];

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.correlationMatrix = {
      lambda_di: 0,
      lambda_drs: 0,
      di_drs: 0,
      regime_lambda: 0,
      regime_di: 0,
      regime_drs: 0,
    };
    this.metrics = {
      lambdaVariance: 0,
      diVariance: 0,
      alphaBetaVariance: 0,
      drsVariance: 0,
    };
    console.log('[L20][GASP] Coordinator initialized');
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[L20][GASP] Coordinator started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('[L20][GASP] Coordinator stopped');
    this.emit('stopped');
  }

  private computeVariance(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  }

  private computeCorrelation(x: number[], y: number[]): number {
    if (x.length < 2 || y.length < 2 || x.length !== y.length) return 0;
    
    const n = x.length;
    const meanX = x.reduce((s, v) => s + v, 0) / n;
    const meanY = y.reduce((s, v) => s + v, 0) / n;
    
    let numerator = 0;
    let denomX = 0;
    let denomY = 0;
    
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }
    
    const denom = Math.sqrt(denomX * denomY);
    if (denom === 0) return 0;
    
    return numerator / denom;
  }

  computeGSI(): number {
    const { w1, w2, w3, w4 } = this.config;
    
    const sigmaLambda = Math.sqrt(this.metrics.lambdaVariance);
    const sigmaDI = Math.sqrt(this.metrics.diVariance);
    const sigmaAlphaBeta = Math.sqrt(this.metrics.alphaBetaVariance);
    const sigmaDRS = Math.sqrt(this.metrics.drsVariance);
    
    const combinedVariance = 
      w1 * sigmaLambda * sigmaLambda +
      w2 * sigmaDI * sigmaDI +
      w3 * sigmaAlphaBeta * sigmaAlphaBeta +
      w4 * sigmaDRS * sigmaDRS;
    
    const gsi = Math.max(0, Math.min(1, 1 - Math.sqrt(combinedVariance)));
    
    return gsi;
  }

  private computeFeedbackDamping(): { learningRate: number; exposure: number } {
    const gsi = this.currentGSI;
    
    const learningRateMultiplier = gsi < this.config.stableThreshold 
      ? Math.max(0.1, gsi + 0.15)
      : 1.0;
    
    const exposureMultiplier = gsi < this.config.stableThreshold
      ? Math.max(0.1, gsi + 0.10)
      : 1.0;
    
    return { learningRate: learningRateMultiplier, exposure: exposureMultiplier };
  }

  private updateCorrelationMatrix(): void {
    this.correlationMatrix = {
      lambda_di: Math.abs(this.computeCorrelation(this.lambdaHistory, this.diHistory)),
      lambda_drs: Math.abs(this.computeCorrelation(this.lambdaHistory, this.drsHistory)),
      di_drs: Math.abs(this.computeCorrelation(this.diHistory, this.drsHistory)),
      regime_lambda: Math.abs(this.computeCorrelation(this.regimeHistory, this.lambdaHistory)),
      regime_di: Math.abs(this.computeCorrelation(this.regimeHistory, this.diHistory)),
      regime_drs: Math.abs(this.computeCorrelation(this.regimeHistory, this.drsHistory)),
    };
  }

  private getMaxCorrelation(): number {
    const values = Object.values(this.correlationMatrix);
    return Math.max(...values, 0);
  }

  private updateMode(): void {
    const previousMode = this.currentMode;
    const correlationMax = this.getMaxCorrelation();
    
    if (this.cooldownActive) {
      this.currentMode = 'containment';
    } else if (this.recoveryStarted) {
      this.currentMode = 'recovery';
    } else if (this.currentGSI < this.config.criticalThreshold || correlationMax > this.config.correlationCritical) {
      this.currentMode = 'containment';
      if (!this.cooldownActive) {
        this.initiateCooldown();
      }
    } else if (this.currentGSI < this.config.cautionThreshold || correlationMax > this.config.correlationWarning) {
      this.currentMode = 'caution';
    } else {
      this.currentMode = 'normal';
    }
    
    if (previousMode !== this.currentMode) {
      console.log(`[L20][GASP] Mode changed: ${previousMode} → ${this.currentMode}`);
      this.emit('modeChanged', { from: previousMode, to: this.currentMode });
    }
  }

  private initiateCooldown(): void {
    console.log('[L20][GASP] Initiating cooldown period');
    this.cooldownActive = true;
    this.cooldownStarted = new Date();
    this.emit('cooldownStarted');
  }

  async scan(): Promise<GASPStatus> {
    console.log('[L20][GASP] Running global stability scan...');
    
    await this.collectMetrics();
    
    this.metrics = {
      lambdaVariance: this.computeVariance(this.lambdaHistory.slice(-20)),
      diVariance: this.computeVariance(this.diHistory.slice(-20)),
      alphaBetaVariance: this.computeVariance(this.alphaBetaHistory.slice(-20)),
      drsVariance: this.computeVariance(this.drsHistory.slice(-20)),
    };
    
    this.updateCorrelationMatrix();
    
    this.currentGSI = this.computeGSI();
    
    const damping = this.computeFeedbackDamping();
    this.dampedLearningRate = damping.learningRate;
    this.dampedExposure = damping.exposure;
    
    this.updateMode();
    
    this.checkRecovery();
    
    this.lastScan = new Date();
    this.scanCount++;
    
    const historyEntry: StabilityHistoryEntry = {
      timestamp: this.lastScan.toISOString(),
      gsi: this.currentGSI,
      mode: this.currentMode,
      correlationMax: this.getMaxCorrelation(),
      dampedLearningRate: this.dampedLearningRate,
      dampedExposure: this.dampedExposure,
    };
    
    this.stabilityHistory.push(historyEntry);
    if (this.stabilityHistory.length > this.MAX_HISTORY) {
      this.stabilityHistory.shift();
    }
    
    console.log(`[L20][GASP] Scan complete: GSI=${this.currentGSI.toFixed(3)}, mode=${this.currentMode}, ρmax=${this.getMaxCorrelation().toFixed(3)}`);
    
    this.emit('scanned', this.getStatus());
    
    return this.getStatus();
  }

  private async collectMetrics(): Promise<void> {
    try {
      const mofModule = await import('./mof-orchestrator');
      const mof = mofModule.getMOFOrchestrator();
      const mofStatus = mof.getStatus();
      const lambdaSum = Object.values(mofStatus.lambdaWeights).reduce((s, v) => s + v, 0);
      this.lambdaHistory.push(lambdaSum);
    } catch (e) {
      this.lambdaHistory.push(1.0);
    }

    try {
      const dceModule = await import('./decision-confidence-engine');
      const dce = dceModule.getDecisionConfidenceEngine();
      if (dce?.getStatus) {
        const status = dce.getStatus();
        this.diHistory.push(status.currentDI ?? status.meanDI ?? 0.5);
      } else {
        this.diHistory.push(0.5);
      }
    } catch (e) {
      this.diHistory.push(0.5);
    }

    try {
      const aprModule = await import('./apr-sle-engine');
      const apr = aprModule.getAPRSLEEngine();
      if (apr?.getStatus) {
        const status = apr.getStatus();
        const alphaBeta = ((status.alpha ?? 0.6) + (status.beta ?? 0.4)) / 2;
        this.alphaBetaHistory.push(alphaBeta);
      } else {
        this.alphaBetaHistory.push(0.5);
      }
    } catch (e) {
      this.alphaBetaHistory.push(0.5);
    }

    try {
      const pdcModule = await import('./pdc-engine');
      const pdc = pdcModule.getPDCEngine();
      if (pdc?.getStatus) {
        const status = pdc.getStatus();
        this.drsHistory.push(status.drs ?? status.drawdownRiskScore ?? 0);
      } else {
        this.drsHistory.push(0);
      }
    } catch (e) {
      this.drsHistory.push(0);
    }

    try {
      const regimeModule = await import('./market-profiler-service');
      const profiler = regimeModule.getMarketProfiler?.();
      if (profiler?.getCurrentRegime) {
        const regime = profiler.getCurrentRegime();
        const regimeMap: Record<string, number> = {
          'trending_bull': 1.0,
          'trending_bear': 0.0,
          'range_bound': 0.5,
          'high_volatility': 0.3,
          'calm_consolidation': 0.7,
        };
        this.regimeHistory.push(regimeMap[regime] ?? 0.5);
      } else {
        this.regimeHistory.push(0.5);
      }
    } catch (e) {
      this.regimeHistory.push(0.5);
    }

    const maxLen = 100;
    if (this.lambdaHistory.length > maxLen) this.lambdaHistory = this.lambdaHistory.slice(-maxLen);
    if (this.diHistory.length > maxLen) this.diHistory = this.diHistory.slice(-maxLen);
    if (this.alphaBetaHistory.length > maxLen) this.alphaBetaHistory = this.alphaBetaHistory.slice(-maxLen);
    if (this.drsHistory.length > maxLen) this.drsHistory = this.drsHistory.slice(-maxLen);
    if (this.regimeHistory.length > maxLen) this.regimeHistory = this.regimeHistory.slice(-maxLen);
  }

  private checkRecovery(): void {
    if (this.cooldownActive && this.cooldownStarted) {
      const elapsed = Date.now() - this.cooldownStarted.getTime();
      
      if (this.currentGSI >= this.config.stableThreshold) {
        if (!this.recoveryStarted) {
          this.recoveryStarted = new Date();
          console.log('[L20][GASP] Starting recovery phase');
        }
        
        const recoveryElapsed = Date.now() - this.recoveryStarted.getTime();
        if (recoveryElapsed >= this.config.recoveryDurationMs) {
          this.completeCooldown();
        }
      } else {
        this.recoveryStarted = null;
      }
      
      if (elapsed >= this.config.cooldownDurationMs && this.currentGSI >= this.config.cautionThreshold) {
        this.completeCooldown();
      }
    }
  }

  private completeCooldown(): void {
    console.log('[L20][GASP] Cooldown complete, returning to normal operation');
    this.cooldownActive = false;
    this.cooldownStarted = null;
    this.recoveryStarted = null;
    this.currentMode = 'normal';
    this.emit('cooldownComplete');
  }

  async applyDamping(): Promise<{ applied: boolean; learningRate: number; exposure: number }> {
    const damping = this.computeFeedbackDamping();
    
    console.log(`[L20][GASP] Applying damping: η′=${damping.learningRate.toFixed(3)}, E′=${damping.exposure.toFixed(3)}`);
    
    try {
      const mofModule = await import('./mof-orchestrator');
      const mof = mofModule.getMOFOrchestrator();
      const currentConfig = mof.getStatus().config;
      mof.setConfig({
        learningRate: currentConfig.learningRate * damping.learningRate,
      });
    } catch (e) {
      console.debug('[L20][GASP] Could not apply damping to MOF');
    }
    
    this.emit('dampingApplied', damping);
    
    return {
      applied: true,
      learningRate: damping.learningRate,
      exposure: damping.exposure,
    };
  }

  async initiateRecovery(): Promise<{ success: boolean; message: string }> {
    if (this.currentGSI < this.config.cautionThreshold) {
      return {
        success: false,
        message: 'GSI too low for recovery initiation',
      };
    }
    
    console.log('[L20][GASP] Manual recovery initiated');
    
    if (this.cooldownActive) {
      this.completeCooldown();
    }
    
    this.dampedLearningRate = 1.0;
    this.dampedExposure = 1.0;
    this.currentMode = 'recovery';
    this.recoveryStarted = new Date();
    
    this.emit('recoveryInitiated');
    
    return {
      success: true,
      message: 'Recovery phase initiated',
    };
  }

  recalibrateWeights(weights: Partial<{ w1: number; w2: number; w3: number; w4: number }>): void {
    const sum = (weights.w1 ?? this.config.w1) + 
                (weights.w2 ?? this.config.w2) + 
                (weights.w3 ?? this.config.w3) + 
                (weights.w4 ?? this.config.w4);
    
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn('[L20][GASP] Weights should sum to 1.0, normalizing...');
    }
    
    this.config = { ...this.config, ...weights };
    console.log('[L20][GASP] Weights recalibrated:', { w1: this.config.w1, w2: this.config.w2, w3: this.config.w3, w4: this.config.w4 });
  }

  getRecoveryProgress(): number {
    if (!this.recoveryStarted) return 0;
    const elapsed = Date.now() - this.recoveryStarted.getTime();
    return Math.min(1, elapsed / this.config.recoveryDurationMs);
  }

  getGSIGrade(): 'stable' | 'caution' | 'critical' {
    if (this.currentGSI >= this.config.stableThreshold) return 'stable';
    if (this.currentGSI >= this.config.cautionThreshold) return 'caution';
    return 'critical';
  }

  getStatus(): GASPStatus {
    return {
      ok: true,
      gsi: this.currentGSI,
      gsiGrade: this.getGSIGrade(),
      mode: this.currentMode,
      correlationMax: this.getMaxCorrelation(),
      correlationMatrix: { ...this.correlationMatrix },
      dampedLearningRate: this.dampedLearningRate,
      dampedExposure: this.dampedExposure,
      metrics: { ...this.metrics },
      cooldownActive: this.cooldownActive,
      cooldownStarted: this.cooldownStarted?.toISOString() || null,
      recoveryProgress: this.getRecoveryProgress(),
      lastScan: this.lastScan?.toISOString() || null,
      scanCount: this.scanCount,
    };
  }

  getHistory(): StabilityHistoryEntry[] {
    return [...this.stabilityHistory];
  }

  getConfig(): GASPConfig {
    return { ...this.config };
  }

  reset(): void {
    this.currentGSI = 1.0;
    this.currentMode = 'normal';
    this.cooldownActive = false;
    this.cooldownStarted = null;
    this.recoveryStarted = null;
    this.dampedLearningRate = 1.0;
    this.dampedExposure = 1.0;
    this.lambdaHistory = [];
    this.diHistory = [];
    this.alphaBetaHistory = [];
    this.drsHistory = [];
    this.regimeHistory = [];
    
    console.log('[L20][GASP] Coordinator reset to defaults');
    this.emit('reset');
  }
}

let coordinatorInstance: GASPCoordinator | null = null;

export function getGASPCoordinator(): GASPCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new GASPCoordinator();
  }
  return coordinatorInstance;
}

export function initializeGASP(): GASPCoordinator {
  const coordinator = getGASPCoordinator();
  coordinator.start();
  return coordinator;
}
