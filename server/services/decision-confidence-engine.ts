/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L16
 * ══════════════════════════════════════════════════════════════════════════════
 * Decision Confidence Engine (DCE)
 * 
 * Purpose: Unified confidence aggregation model combining CWQI, NGC, ML Confidence,
 * Regime Score, and MACO Consensus into a single Decision Index (DI).
 * 
 * Formula: DI = w₁·CWQI + w₂·NGC + w₃·MLₙ + w₄·RC + w₅·MC
 * Default weights: w₁=0.25, w₂=0.20, w₃=0.20, w₄=0.15, w₅=0.20
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from 'events';

interface DCEWeights {
  cwqi: number;
  ngc: number;
  mlConfidence: number;
  regimeConfidence: number;
  macoConsensus: number;
}

interface SignalMetrics {
  symbol: string;
  strategy: string;
  cwqi: number;
  ngc: number;
  mlConfidence: number;
  regimeConfidence: number;
  macoConsensus: number;
}

interface DIResult {
  symbol: string;
  strategy: string;
  decisionIndex: number;
  grade: 'strong' | 'caution' | 'avoid';
  components: {
    cwqi: number;
    ngc: number;
    mlConfidence: number;
    regimeConfidence: number;
    macoConsensus: number;
  };
  timestamp: string;
}

interface DCEState {
  weights: DCEWeights;
  meanDI: number;
  topSignals: DIResult[];
  lastRecalibration: string | null;
  recalibrationCount: number;
  isRunning: boolean;
}

const DEFAULT_WEIGHTS: DCEWeights = {
  cwqi: 0.25,
  ngc: 0.20,
  mlConfidence: 0.20,
  regimeConfidence: 0.15,
  macoConsensus: 0.20
};

class DecisionConfidenceEngine extends EventEmitter {
  private state: DCEState;
  private recalibrationInterval: NodeJS.Timeout | null = null;
  private mlServiceUrl: string;

  constructor() {
    super();
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
    
    this.state = {
      weights: { ...DEFAULT_WEIGHTS },
      meanDI: 0,
      topSignals: [],
      lastRecalibration: null,
      recalibrationCount: 0,
      isRunning: false
    };

    console.log('[L16][DCE] Decision Confidence Engine initialized');
  }

  start(): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;
    console.log('[L16][DCE] Engine started');
    this.emit('started');
  }

  stop(): void {
    if (!this.state.isRunning) return;
    this.state.isRunning = false;
    if (this.recalibrationInterval) {
      clearInterval(this.recalibrationInterval);
      this.recalibrationInterval = null;
    }
    console.log('[L16][DCE] Engine stopped');
    this.emit('stopped');
  }

  computeDecisionIndex(metrics: SignalMetrics): DIResult {
    const w = this.state.weights;
    
    const di = 
      w.cwqi * metrics.cwqi +
      w.ngc * metrics.ngc +
      w.mlConfidence * metrics.mlConfidence +
      w.regimeConfidence * metrics.regimeConfidence +
      w.macoConsensus * metrics.macoConsensus;
    
    const clampedDI = Math.max(0, Math.min(1, di));
    
    const grade: 'strong' | 'caution' | 'avoid' = 
      clampedDI >= 0.7 ? 'strong' : 
      clampedDI >= 0.4 ? 'caution' : 'avoid';
    
    const result: DIResult = {
      symbol: metrics.symbol,
      strategy: metrics.strategy,
      decisionIndex: Math.round(clampedDI * 10000) / 10000,
      grade,
      components: {
        cwqi: metrics.cwqi,
        ngc: metrics.ngc,
        mlConfidence: metrics.mlConfidence,
        regimeConfidence: metrics.regimeConfidence,
        macoConsensus: metrics.macoConsensus
      },
      timestamp: new Date().toISOString()
    };

    this.updateTopSignals(result);
    
    console.log(`[L16][DCE] DecisionIndex=${result.decisionIndex.toFixed(4)} (${metrics.symbol}_${metrics.strategy})`);
    
    return result;
  }

  private updateTopSignals(result: DIResult): void {
    this.state.topSignals.push(result);
    this.state.topSignals.sort((a, b) => b.decisionIndex - a.decisionIndex);
    this.state.topSignals = this.state.topSignals.slice(0, 20);
    
    if (this.state.topSignals.length > 0) {
      this.state.meanDI = this.state.topSignals.reduce((sum, s) => sum + s.decisionIndex, 0) / this.state.topSignals.length;
    }
  }

  async recalibrate(performanceData?: Array<{
    cwqi: number;
    ngc: number;
    mlConfidence: number;
    regimeConfidence: number;
    macoConsensus: number;
    profitRate: number;
  }>): Promise<{ success: boolean; weights: DCEWeights }> {
    try {
      if (!performanceData || performanceData.length < 10) {
        console.log('[L16][DCE] Insufficient data for recalibration');
        return { success: true, weights: this.state.weights };
      }

      const correlations: Record<string, number> = {};
      const keys = ['cwqi', 'ngc', 'mlConfidence', 'regimeConfidence', 'macoConsensus'] as const;
      
      for (const key of keys) {
        const values = performanceData.map(p => p[key]);
        const profits = performanceData.map(p => p.profitRate);
        const corr = this.pearsonCorrelation(values, profits);
        correlations[key] = Math.max(0.05, isNaN(corr) ? 0.2 : corr);
      }

      const total = Object.values(correlations).reduce((a, b) => a + b, 0);
      if (total > 0) {
        this.state.weights = {
          cwqi: correlations.cwqi / total,
          ngc: correlations.ngc / total,
          mlConfidence: correlations.mlConfidence / total,
          regimeConfidence: correlations.regimeConfidence / total,
          macoConsensus: correlations.macoConsensus / total
        };
      }

      this.state.lastRecalibration = new Date().toISOString();
      this.state.recalibrationCount++;

      console.log(`[L16][DCE] Weights recalibrated: CWQI=${this.state.weights.cwqi.toFixed(3)}, NGC=${this.state.weights.ngc.toFixed(3)}`);
      this.emit('recalibrated', this.state.weights);

      return { success: true, weights: this.state.weights };
    } catch (error) {
      console.error('[L16][DCE] Recalibration failed:', error);
      return { success: false, weights: this.state.weights };
    }
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;
    
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    
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
    return denom === 0 ? 0 : numerator / denom;
  }

  getStatus(): {
    weights: DCEWeights;
    meanDI: number;
    topSignals: DIResult[];
    lastRecalibration: string | null;
    recalibrationCount: number;
    isRunning: boolean;
  } {
    return {
      weights: { ...this.state.weights },
      meanDI: Math.round(this.state.meanDI * 10000) / 10000,
      topSignals: this.state.topSignals.slice(0, 5),
      lastRecalibration: this.state.lastRecalibration,
      recalibrationCount: this.state.recalibrationCount,
      isRunning: this.state.isRunning
    };
  }

  getWeights(): DCEWeights {
    return { ...this.state.weights };
  }

  getTopSignal(): DIResult | null {
    return this.state.topSignals[0] || null;
  }

  getMeanDI(): number {
    return this.state.meanDI;
  }
}

let dceInstance: DecisionConfidenceEngine | null = null;

export function getDecisionConfidenceEngine(): DecisionConfidenceEngine {
  if (!dceInstance) {
    dceInstance = new DecisionConfidenceEngine();
  }
  return dceInstance;
}

export function initDecisionConfidenceEngine(): DecisionConfidenceEngine {
  if (!dceInstance) {
    dceInstance = new DecisionConfidenceEngine();
  }
  dceInstance.start();
  return dceInstance;
}

export { DecisionConfidenceEngine, DCEWeights, SignalMetrics, DIResult };
