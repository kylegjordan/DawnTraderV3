/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.1B — Adaptive Manager
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Manages adaptive learning weights for strategies with time-based decay.
 * Weights are decayed on rehydration based on their age to prevent stale
 * learning from exerting undue influence on current trading behavior.
 * 
 * Decay Formula: decayFactor = exp(-0.05 * ageDays)
 * - 1 day old: ~95% strength
 * - 7 days old: ~70% strength
 * - 14 days old: ~50% strength
 * - 30 days old: ~22% strength
 * 
 * Features:
 * - Time-weighted initialization from persisted weights
 * - Configurable decay factor (default 5% per day)
 * - Strategy-specific weight management
 * - Integration with TelemetryAggregatorService
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

// B65.2 (2026-04-23): EXECUTION_CONFIG deleted. Prior import was dead (no
// references in this file) and has been removed along with the config file.
// B72 (2026-05-05): DEFAULT_DECAY_RATE row seeded in module='adaptive_weights'
// but source-side wiring deferred — this file instantiates AdaptiveManagerService
// at MODULE LOAD time (line ~200, `export const adaptiveManager = new ...`),
// which runs before module_constants warmup. Migrating safely needs an init
// hook that re-applies the resolved decay rate after warmup. Tracked for
// follow-up batch. Current literal matches the seeded row exactly (0.05).

export interface AdaptiveWeights {
  [key: string]: number;
}

export interface TimestampedWeightEntry {
  weights: AdaptiveWeights;
  updatedAt: Date;
}

const DEFAULT_DECAY_RATE = 0.05;

class AdaptiveManagerService {
  private internalWeights: Map<string, AdaptiveWeights> = new Map();
  private weightTimestamps: Map<string, Date> = new Map();
  private decayRate: number;
  private initialized: boolean = false;

  constructor(decayRate: number = DEFAULT_DECAY_RATE) {
    this.decayRate = decayRate;
  }

  /**
   * Initialize with simple weights (no timestamp, no decay)
   */
  initialize(weights: Map<string, AdaptiveWeights>): void {
    this.internalWeights = new Map(weights);
    this.initialized = true;
    console.log(`[Learning] Initialized ${weights.size} adaptive profiles`);
  }

  /**
   * Initialize with timestamped weights and apply time-based decay
   * This is the primary initialization method for rehydration
   */
  initializeWithTimestamps(data: Map<string, TimestampedWeightEntry>): void {
    const now = Date.now();
    
    data.forEach((entry, strategyId) => {
      const ageDays = (now - entry.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.exp(-this.decayRate * ageDays);
      
      const decayedWeights: AdaptiveWeights = Object.fromEntries(
        Object.entries(entry.weights).map(([key, value]) => [key, value * decayFactor])
      );
      
      this.internalWeights.set(strategyId, decayedWeights);
      this.weightTimestamps.set(strategyId, entry.updatedAt);
    });
    
    this.initialized = true;
    console.log(`[Learning] Initialized ${data.size} adaptive profiles with time decay applied (rate=${this.decayRate})`);
  }

  /**
   * Get weights for a specific strategy
   */
  getWeights(strategyId: string): AdaptiveWeights | undefined {
    return this.internalWeights.get(strategyId);
  }

  /**
   * Get a specific weight value for a strategy
   */
  getWeight(strategyId: string, key: string): number {
    const weights = this.internalWeights.get(strategyId);
    return weights?.[key] ?? 0;
  }

  /**
   * Update weights for a strategy
   */
  updateWeights(strategyId: string, weights: AdaptiveWeights): void {
    this.internalWeights.set(strategyId, weights);
    this.weightTimestamps.set(strategyId, new Date());
    console.log(`[Learning] Updated weights for ${strategyId}`);
  }

  /**
   * Adjust a specific weight by a delta
   */
  adjustWeight(strategyId: string, key: string, delta: number): void {
    const weights = this.internalWeights.get(strategyId) || {};
    const currentValue = weights[key] ?? 0;
    weights[key] = Math.max(0, Math.min(1, currentValue + delta));
    this.internalWeights.set(strategyId, weights);
    this.weightTimestamps.set(strategyId, new Date());
  }

  /**
   * Get all strategy IDs with weights
   */
  getStrategyIds(): string[] {
    return Array.from(this.internalWeights.keys());
  }

  /**
   * Get all weights for persistence
   */
  getAllWeights(): Map<string, AdaptiveWeights> {
    return new Map(this.internalWeights);
  }

  /**
   * Get weight timestamp for a strategy
   */
  getWeightTimestamp(strategyId: string): Date | undefined {
    return this.weightTimestamps.get(strategyId);
  }

  /**
   * Calculate decay factor for a given age in days
   */
  calculateDecayFactor(ageDays: number): number {
    return Math.exp(-this.decayRate * ageDays);
  }

  /**
   * Get decay statistics for all weights
   */
  getDecayStats(): Array<{
    strategyId: string;
    ageDays: number;
    decayFactor: number;
  }> {
    const now = Date.now();
    const stats: Array<{ strategyId: string; ageDays: number; decayFactor: number }> = [];
    
    for (const [strategyId, timestamp] of this.weightTimestamps.entries()) {
      const ageDays = (now - timestamp.getTime()) / (1000 * 60 * 60 * 24);
      const decayFactor = this.calculateDecayFactor(ageDays);
      stats.push({ strategyId, ageDays, decayFactor });
    }
    
    return stats;
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset all weights (for testing)
   */
  reset(): void {
    this.internalWeights.clear();
    this.weightTimestamps.clear();
    this.initialized = false;
  }

  /**
   * Get current decay rate
   */
  getDecayRate(): number {
    return this.decayRate;
  }

  /**
   * Set decay rate (for configuration)
   */
  setDecayRate(rate: number): void {
    this.decayRate = rate;
    console.log(`[Learning] Decay rate updated to ${rate}`);
  }
}

export const adaptiveManager = new AdaptiveManagerService();
export { AdaptiveManagerService };
