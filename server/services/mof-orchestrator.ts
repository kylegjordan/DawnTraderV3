import { EventEmitter } from 'events';
import {
  aggregatePerformance,
  getKPIHistory,
  getRecentWindow,
  computeWindowStats,
  NormalizedKPIs,
  PerformanceMetrics,
} from '../utils/performance-aggregator';

export interface MetaWeights {
  ara: number;
  vts: number;
  maco: number;
  dce: number;
  pdc: number;
  ecs: number;
}

export interface LambdaWeights {
  profit: number;
  drawdown: number;
  variance: number;
  stability: number;
}

export interface MOFConfig {
  learningRate: number;
  minWeight: number;
  maxWeight: number;
  evolutionWindowHours: number;
  gradientEpsilon: number;
}

export interface MOFStatus {
  ok: boolean;
  metaWeights: MetaWeights;
  lambdaWeights: LambdaWeights;
  currentJ: number;
  stabilityIndex: number;
  weightEntropy: number;
  subsystemVariance: number;
  lastEvolution: string | null;
  evolutionCount: number;
  kpiCount: number;
  config: MOFConfig;
}

export interface WeightHistoryEntry {
  timestamp: string;
  weights: MetaWeights;
  lambdas: LambdaWeights;
  J: number;
  stabilityIndex: number;
}

const DEFAULT_META_WEIGHTS: MetaWeights = {
  ara: 1.0,
  vts: 1.0,
  maco: 1.0,
  dce: 1.0,
  pdc: 1.0,
  ecs: 1.0,
};

const DEFAULT_LAMBDA_WEIGHTS: LambdaWeights = {
  profit: 0.35,
  drawdown: 0.30,
  variance: 0.15,
  stability: 0.20,
};

const DEFAULT_CONFIG: MOFConfig = {
  learningRate: 0.03,
  minWeight: 0.1,
  maxWeight: 2.0,
  evolutionWindowHours: 24,
  gradientEpsilon: 0.01,
};

class MOFOrchestrator extends EventEmitter {
  private isRunning: boolean = false;
  private metaWeights: MetaWeights;
  private lambdaWeights: LambdaWeights;
  private config: MOFConfig;
  private currentJ: number = 0;
  private lastEvolution: Date | null = null;
  private evolutionCount: number = 0;
  private weightHistory: WeightHistoryEntry[] = [];
  private readonly MAX_HISTORY = 500;

  constructor() {
    super();
    this.metaWeights = { ...DEFAULT_META_WEIGHTS };
    this.lambdaWeights = { ...DEFAULT_LAMBDA_WEIGHTS };
    this.config = { ...DEFAULT_CONFIG };
    console.log('[L19][MOF] Orchestrator initialized');
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[L19][MOF] Orchestrator started');
    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    console.log('[L19][MOF] Orchestrator stopped');
    this.emit('stopped');
  }

  computeMetaObjective(stats: ReturnType<typeof computeWindowStats>): number {
    const { profit, drawdown, variance, stability } = this.lambdaWeights;
    
    const J = 
      profit * stats.meanEquityGrowth -
      drawdown * stats.meanDrawdown -
      variance * stats.equityVariance +
      stability * stats.meanStability;
    
    return J;
  }

  private computeGradients(baseStats: ReturnType<typeof computeWindowStats>): Record<keyof MetaWeights, number> {
    const eps = this.config.gradientEpsilon;
    const baseJ = this.computeMetaObjective(baseStats);
    
    const gradients: Record<keyof MetaWeights, number> = {
      ara: 0,
      vts: 0,
      maco: 0,
      dce: 0,
      pdc: 0,
      ecs: 0,
    };
    
    const subsystemImpact: Record<keyof MetaWeights, { profit: number; drawdown: number; variance: number; stability: number }> = {
      ara: { profit: 0.25, drawdown: -0.15, variance: 0.0, stability: 0.20 },
      vts: { profit: 0.20, drawdown: -0.10, variance: -0.25, stability: 0.15 },
      maco: { profit: 0.15, drawdown: -0.05, variance: -0.10, stability: 0.40 },
      dce: { profit: 0.20, drawdown: -0.10, variance: -0.15, stability: 0.30 },
      pdc: { profit: 0.10, drawdown: -0.40, variance: 0.0, stability: 0.20 },
      ecs: { profit: 0.10, drawdown: -0.30, variance: -0.20, stability: 0.15 },
    };
    
    for (const key of Object.keys(gradients) as (keyof MetaWeights)[]) {
      const impact = subsystemImpact[key];
      const originalWeight = this.metaWeights[key];
      
      const perturbedWeight = originalWeight + eps;
      const deltaWeight = perturbedWeight - originalWeight;
      
      const deltaProfit = impact.profit * deltaWeight * baseStats.meanEquityGrowth;
      const deltaDrawdown = impact.drawdown * deltaWeight * baseStats.meanDrawdown;
      const deltaVariance = impact.variance * deltaWeight * baseStats.equityVariance;
      const deltaStability = impact.stability * deltaWeight * baseStats.meanStability;
      
      const perturbedStats = {
        meanEquityGrowth: baseStats.meanEquityGrowth + deltaProfit,
        meanDrawdown: Math.max(0, baseStats.meanDrawdown + deltaDrawdown),
        equityVariance: Math.max(0, baseStats.equityVariance + deltaVariance),
        meanStability: Math.min(1, Math.max(0, baseStats.meanStability + deltaStability)),
        meanDI: baseStats.meanDI,
        meanDRS: baseStats.meanDRS,
        meanVolatility: baseStats.meanVolatility,
        meanWinRate: baseStats.meanWinRate,
      };
      
      const perturbedJ = this.computeMetaObjective(perturbedStats);
      gradients[key] = (perturbedJ - baseJ) / eps;
    }
    
    return gradients;
  }

  async evolve(): Promise<{
    previousWeights: MetaWeights;
    newWeights: MetaWeights;
    previousJ: number;
    newJ: number;
    gradients: Record<keyof MetaWeights, number>;
  }> {
    console.log('[L19][MOF] Starting policy evolution cycle...');
    
    const previousWeights = { ...this.metaWeights };
    const previousJ = this.currentJ;
    
    const window = getRecentWindow(this.config.evolutionWindowHours);
    const stats = computeWindowStats(window);
    
    const gradients = this.computeGradients(stats);
    
    const { learningRate, minWeight, maxWeight } = this.config;
    
    for (const key of Object.keys(this.metaWeights) as (keyof MetaWeights)[]) {
      const update = learningRate * gradients[key];
      this.metaWeights[key] = Math.max(
        minWeight,
        Math.min(maxWeight, this.metaWeights[key] + update)
      );
    }
    
    this.normalizeWeights();
    
    this.currentJ = this.computeMetaObjective(stats);
    this.lastEvolution = new Date();
    this.evolutionCount++;
    
    const historyEntry: WeightHistoryEntry = {
      timestamp: this.lastEvolution.toISOString(),
      weights: { ...this.metaWeights },
      lambdas: { ...this.lambdaWeights },
      J: this.currentJ,
      stabilityIndex: this.computeStabilityIndex(),
    };
    
    this.weightHistory.push(historyEntry);
    if (this.weightHistory.length > this.MAX_HISTORY) {
      this.weightHistory.shift();
    }
    
    console.log(`[L19][MOF] Evolution complete: J=${this.currentJ.toFixed(4)}, weights=${JSON.stringify(this.metaWeights)}`);
    
    this.emit('evolved', {
      weights: this.metaWeights,
      J: this.currentJ,
      gradients,
    });
    
    return {
      previousWeights,
      newWeights: { ...this.metaWeights },
      previousJ,
      newJ: this.currentJ,
      gradients,
    };
  }

  private normalizeWeights(): void {
    const values = Object.values(this.metaWeights);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    
    if (mean > 0) {
      for (const key of Object.keys(this.metaWeights) as (keyof MetaWeights)[]) {
        this.metaWeights[key] = this.metaWeights[key] / mean;
        this.metaWeights[key] = Math.max(
          this.config.minWeight,
          Math.min(this.config.maxWeight, this.metaWeights[key])
        );
      }
    }
  }

  private computeStabilityIndex(): number {
    const recentHistory = this.weightHistory.slice(-10);
    if (recentHistory.length < 2) return 1.0;
    
    let totalVariance = 0;
    for (const key of Object.keys(this.metaWeights) as (keyof MetaWeights)[]) {
      const values = recentHistory.map(h => h.weights[key]);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
      totalVariance += variance;
    }
    
    const avgVariance = totalVariance / 6;
    return Math.max(0, 1 - avgVariance);
  }

  private computeWeightEntropy(): number {
    const values = Object.values(this.metaWeights);
    const sum = values.reduce((s, v) => s + v, 0);
    if (sum === 0) return 0;
    
    const probs = values.map(v => v / sum);
    let entropy = 0;
    for (const p of probs) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    
    const maxEntropy = Math.log2(6);
    return entropy / maxEntropy;
  }

  private computeSubsystemVariance(): number {
    const values = Object.values(this.metaWeights);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  async aggregateKPIs(): Promise<PerformanceMetrics> {
    const metrics = await aggregatePerformance();
    
    const window = getRecentWindow(this.config.evolutionWindowHours);
    const stats = computeWindowStats(window);
    this.currentJ = this.computeMetaObjective(stats);
    
    return metrics;
  }

  async checkDrift(): Promise<{
    driftDetected: boolean;
    recommendations: string[];
  }> {
    console.log('[L19][MOF] Running drift check...');
    
    const recentHistory = this.weightHistory.slice(-24);
    if (recentHistory.length < 5) {
      return { driftDetected: false, recommendations: ['Insufficient history for drift detection'] };
    }
    
    const recommendations: string[] = [];
    let driftDetected = false;
    
    const firstHalf = recentHistory.slice(0, Math.floor(recentHistory.length / 2));
    const secondHalf = recentHistory.slice(Math.floor(recentHistory.length / 2));
    
    const firstJ = firstHalf.reduce((s, h) => s + h.J, 0) / firstHalf.length;
    const secondJ = secondHalf.reduce((s, h) => s + h.J, 0) / secondHalf.length;
    
    if (Math.abs(secondJ - firstJ) > 0.1) {
      driftDetected = true;
      if (secondJ < firstJ) {
        recommendations.push('Meta-objective degrading - consider lambda rebalancing');
      } else {
        recommendations.push('Meta-objective improving - current policy is effective');
      }
    }
    
    const currentStability = this.computeStabilityIndex();
    if (currentStability < 0.7) {
      driftDetected = true;
      recommendations.push('Weight instability detected - consider reducing learning rate');
    }
    
    console.log(`[L19][MOF] Drift check: detected=${driftDetected}, recommendations=${recommendations.length}`);
    
    return { driftDetected, recommendations };
  }

  reset(): void {
    this.metaWeights = { ...DEFAULT_META_WEIGHTS };
    this.lambdaWeights = { ...DEFAULT_LAMBDA_WEIGHTS };
    this.currentJ = 0;
    this.lastEvolution = null;
    this.evolutionCount = 0;
    
    console.log('[L19][MOF] Weights reset to defaults');
    this.emit('reset');
  }

  getStatus(): MOFStatus {
    return {
      ok: true,
      metaWeights: { ...this.metaWeights },
      lambdaWeights: { ...this.lambdaWeights },
      currentJ: this.currentJ,
      stabilityIndex: this.computeStabilityIndex(),
      weightEntropy: this.computeWeightEntropy(),
      subsystemVariance: this.computeSubsystemVariance(),
      lastEvolution: this.lastEvolution?.toISOString() || null,
      evolutionCount: this.evolutionCount,
      kpiCount: getKPIHistory().length,
      config: { ...this.config },
    };
  }

  getWeights(): MetaWeights {
    return { ...this.metaWeights };
  }

  getLambdas(): LambdaWeights {
    return { ...this.lambdaWeights };
  }

  getHistory(): WeightHistoryEntry[] {
    return [...this.weightHistory];
  }

  setLambdas(lambdas: Partial<LambdaWeights>): void {
    const sum = Object.values({ ...this.lambdaWeights, ...lambdas }).reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn('[L19][MOF] Lambda weights should sum to 1.0');
    }
    this.lambdaWeights = { ...this.lambdaWeights, ...lambdas };
    console.log('[L19][MOF] Lambda weights updated:', this.lambdaWeights);
  }

  setConfig(config: Partial<MOFConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[L19][MOF] Config updated:', this.config);
  }

  getSubsystemWeight(subsystem: keyof MetaWeights): number {
    return this.metaWeights[subsystem];
  }
}

let orchestratorInstance: MOFOrchestrator | null = null;

export function getMOFOrchestrator(): MOFOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new MOFOrchestrator();
  }
  return orchestratorInstance;
}

export function initializeMOF(): MOFOrchestrator {
  const orchestrator = getMOFOrchestrator();
  orchestrator.start();
  return orchestrator;
}
