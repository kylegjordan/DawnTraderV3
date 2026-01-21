/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.5 — Rolling Statistics Utility
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Provides rolling window statistics for Z-Score normalization.
 * Used for dynamic regime classification based on recent market behavior.
 * 
 * Schema: v1.7.0
 * Governance: Directive 11.5 Task 2
 * ══════════════════════════════════════════════════════════════════════════════
 */

export class RollingStats {
  private values: number[] = [];
  private windowSize: number;
  private cachedMean: number | null = null;
  private cachedStd: number | null = null;

  constructor(windowSize: number = 300) {
    this.windowSize = windowSize;
  }

  push(value: number): void {
    if (!isFinite(value)) return;
    
    this.values.push(value);
    
    if (this.values.length > this.windowSize) {
      this.values.shift();
    }
    
    this.cachedMean = null;
    this.cachedStd = null;
  }

  mean(): number {
    if (this.cachedMean !== null) return this.cachedMean;
    
    if (this.values.length === 0) return 0;
    
    const sum = this.values.reduce((a, b) => a + b, 0);
    this.cachedMean = sum / this.values.length;
    return this.cachedMean;
  }

  std(): number {
    if (this.cachedStd !== null) return this.cachedStd;
    
    if (this.values.length < 2) return 1;
    
    const m = this.mean();
    const squaredDiffs = this.values.map(v => Math.pow(v - m, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / this.values.length;
    
    this.cachedStd = Math.sqrt(variance);
    return this.cachedStd || 1;
  }

  zScore(value: number): number {
    const m = this.mean();
    const s = this.std();
    
    if (s === 0) return 0;
    
    return (value - m) / s;
  }

  getSize(): number {
    return this.values.length;
  }

  isWarmedUp(minSamples: number = 30): boolean {
    return this.values.length >= minSamples;
  }

  clear(): void {
    this.values = [];
    this.cachedMean = null;
    this.cachedStd = null;
  }

  getLatest(n: number = 10): number[] {
    return this.values.slice(-n);
  }
}

const rollingStatsCache = new Map<string, RollingStats>();

export function getOrCreateRollingStats(key: string, windowSize: number = 300): RollingStats {
  if (!rollingStatsCache.has(key)) {
    rollingStatsCache.set(key, new RollingStats(windowSize));
  }
  return rollingStatsCache.get(key)!;
}

export function clearRollingStatsCache(): void {
  rollingStatsCache.clear();
}

/**
 * Directive 11.6B Task 2: Reset Rolling Statistics with Warm-up Logging
 * Clears all rolling buffers and forces warm-up with fresh samples.
 */
export function resetRollingStatsWithLogging(): void {
  const keysCleared = Array.from(rollingStatsCache.keys());
  rollingStatsCache.clear();
  
  console.log('[11.6B][Reset] Rolling stats reset after data purge');
  console.log(`[11.6B][Reset] Cleared buffers: ${keysCleared.length > 0 ? keysCleared.join(', ') : 'none active'}`);
  console.log('[11.6B][Reset] Warm-up required: 300 fresh samples');
}

/**
 * Directive 11.6B Task 4: Log Z-Score Statistics
 * Logs current rolling stats for verification
 */
export function logRollingStatsVerification(key: string): void {
  const stats = rollingStatsCache.get(key);
  if (stats) {
    const mean = stats.mean();
    const std = stats.std();
    const size = stats.getSize();
    console.log(`[11.6B][ZScore] ${key} mean=${mean.toFixed(3)} σ=${std.toFixed(3)} samples=${size}`);
  }
}

/**
 * Directive 11.6B: Get all active rolling stats summary
 */
export function getAllRollingStatsSummary(): Record<string, { mean: number; std: number; size: number; isWarmedUp: boolean }> {
  const summary: Record<string, { mean: number; std: number; size: number; isWarmedUp: boolean }> = {};
  
  for (const [key, stats] of rollingStatsCache.entries()) {
    summary[key] = {
      mean: stats.mean(),
      std: stats.std(),
      size: stats.getSize(),
      isWarmedUp: stats.isWarmedUp(30)
    };
  }
  
  return summary;
}
