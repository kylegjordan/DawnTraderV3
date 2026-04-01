/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7R — Regime Stability Classification Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Computes regime stability state (STABLE, TRANSITION, UNSTABLE) based on:
 * - DriftScore: Weighted Euclidean distance from ideal regime conditions
 * - VolZ: Volatility Z-score (absolute value)
 * - Regime Confidence: Classification certainty (0-1)
 * - Flip Rate: Number of regime changes in 7 days
 * 
 * Stability is computed ONCE per scan cycle and cached to prevent intra-cycle
 * thrashing. All signals in the same cycle reference the same stability state.
 * 
 * Schema Version: governance/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { RegimeStability } from '../../config/strategy-governance.js';

export interface StabilityThresholds {
  driftScore: { stable: number; transition: number };
  volZ: { stable: number; transition: number };
  regimeConfidence: { stable: number; transition: number };
  flipRate: { stable: number; transition: number };
}

export interface StabilityMetrics {
  driftScore: number;
  volZ: number;
  regimeConfidence: number;
  flipRate: number;
}

export interface StabilityClassification {
  stability: RegimeStability;
  metrics: StabilityMetrics;
  reason: string;
  computedAt: number;
  cycleId: string;
}

export const STABILITY_THRESHOLDS: StabilityThresholds = {
  driftScore: { stable: 0.8, transition: 1.5 },
  volZ: { stable: 1.2, transition: 2.0 },
  regimeConfidence: { stable: 0.65, transition: 0.45 },
  flipRate: { stable: 1, transition: 3 },
};

const regimeHistory: { regime: string; timestamp: number }[] = [];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

let cachedStability: StabilityClassification | null = null;
let currentCycleId: string | null = null;

export function recordRegimeChange(regime: string): void {
  const now = Date.now();
  
  const cutoff = now - SEVEN_DAYS_MS;
  while (regimeHistory.length > 0 && regimeHistory[0].timestamp < cutoff) {
    regimeHistory.shift();
  }
  
  if (regimeHistory.length === 0 || regimeHistory[regimeHistory.length - 1].regime !== regime) {
    regimeHistory.push({ regime, timestamp: now });
    console.log(`[11.7R][Stability] Regime change recorded: ${regime} (${regimeHistory.length} changes in 7d)`);
  }
}

export function getFlipRate(): number {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const recentChanges = regimeHistory.filter(r => r.timestamp >= cutoff);
  return Math.max(0, recentChanges.length - 1);
}

export function classifyStability(metrics: StabilityMetrics): StabilityClassification {
  const { driftScore, volZ, regimeConfidence, flipRate } = metrics;
  const absVolZ = Math.abs(volZ);
  
  let stability: RegimeStability;
  let reason: string;
  
  if (
    driftScore > STABILITY_THRESHOLDS.driftScore.transition ||
    absVolZ > STABILITY_THRESHOLDS.volZ.transition ||
    flipRate >= 4 ||
    regimeConfidence < STABILITY_THRESHOLDS.regimeConfidence.transition
  ) {
    stability = 'UNSTABLE';
    const reasons: string[] = [];
    if (driftScore > STABILITY_THRESHOLDS.driftScore.transition) reasons.push(`DriftScore=${driftScore.toFixed(2)}>1.5`);
    if (absVolZ > STABILITY_THRESHOLDS.volZ.transition) reasons.push(`|VolZ|=${absVolZ.toFixed(2)}>2.0`);
    if (flipRate >= 4) reasons.push(`FlipRate=${flipRate}>=4`);
    if (regimeConfidence < STABILITY_THRESHOLDS.regimeConfidence.transition) reasons.push(`Confidence=${regimeConfidence.toFixed(2)}<0.45`);
    reason = `UNSTABLE: ${reasons.join(', ')}`;
  } else if (
    driftScore > STABILITY_THRESHOLDS.driftScore.stable ||
    absVolZ > STABILITY_THRESHOLDS.volZ.stable ||
    flipRate >= 2 ||
    regimeConfidence < STABILITY_THRESHOLDS.regimeConfidence.stable
  ) {
    stability = 'TRANSITION';
    const reasons: string[] = [];
    if (driftScore > STABILITY_THRESHOLDS.driftScore.stable) reasons.push(`DriftScore=${driftScore.toFixed(2)}>0.8`);
    if (absVolZ > STABILITY_THRESHOLDS.volZ.stable) reasons.push(`|VolZ|=${absVolZ.toFixed(2)}>1.2`);
    if (flipRate >= 2) reasons.push(`FlipRate=${flipRate}>=2`);
    if (regimeConfidence < STABILITY_THRESHOLDS.regimeConfidence.stable) reasons.push(`Confidence=${regimeConfidence.toFixed(2)}<0.65`);
    reason = `TRANSITION: ${reasons.join(', ')}`;
  } else {
    stability = 'STABLE';
    reason = `STABLE: All metrics within thresholds`;
  }
  
  const cycleId = `cycle_${Date.now()}`;
  
  const classification: StabilityClassification = {
    stability,
    metrics,
    reason,
    computedAt: Date.now(),
    cycleId,
  };
  
  cachedStability = classification;
  currentCycleId = cycleId;
  
  console.log(`[11.7R][Stability] ${reason}`);
  
  return classification;
}

export function getCachedStability(): StabilityClassification | null {
  return cachedStability;
}

export function setCycleStability(cycleId: string, classification: StabilityClassification): void {
  if (currentCycleId !== cycleId) {
    cachedStability = classification;
    currentCycleId = cycleId;
  }
}

export function getStabilityForCycle(cycleId: string): StabilityClassification | null {
  if (currentCycleId === cycleId && cachedStability) {
    return cachedStability;
  }
  return null;
}

export function clearStabilityCache(): void {
  cachedStability = null;
  currentCycleId = null;
}

export function computeGlobalStability(
  driftScore: number,
  volZ: number,
  regimeConfidence: number
): StabilityClassification {
  const flipRate = getFlipRate();
  
  return classifyStability({
    driftScore,
    volZ,
    regimeConfidence,
    flipRate,
  });
}

export function getStabilityState(): {
  stability: RegimeStability | null;
  metrics: StabilityMetrics | null;
  reason: string;
  flipRate: number;
  lastComputed: number | null;
} {
  const flipRate = getFlipRate();
  
  if (!cachedStability) {
    return {
      stability: null,
      metrics: null,
      reason: 'No stability computed yet',
      flipRate,
      lastComputed: null,
    };
  }
  
  return {
    stability: cachedStability.stability,
    metrics: cachedStability.metrics,
    reason: cachedStability.reason,
    flipRate,
    lastComputed: cachedStability.computedAt,
  };
}

// Batch 46: Export state for persistence
export function getRegimeHistoryForPersistence(): { regime: string; timestamp: number }[] {
  return [...regimeHistory];
}

export function restoreRegimeHistory(entries: { regime: string; timestamp: number }[]): void {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const valid = entries.filter(e => e.timestamp >= cutoff);
  regimeHistory.length = 0;
  regimeHistory.push(...valid);
  cachedStability = null; // Force recomputation
  if (valid.length > 0) {
    console.log(`[46][RegimeStability] Rehydrated ${valid.length} regime changes (7-day window)`);
  }
}
