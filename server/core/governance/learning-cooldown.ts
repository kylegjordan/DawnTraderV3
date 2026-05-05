/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7R — Learning Cooldown Enforcement
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Enforces learning cooldown rules during regime instability:
 * 
 * | Stability   | Positive Reinforcement | Negative Learning |
 * |-------------|------------------------|-------------------|
 * | STABLE      | Immediate              | Immediate         |
 * | TRANSITION  | Batched (≥5 samples)   | Immediate         |
 * | UNSTABLE    | Deferred & tagged      | Immediate         |
 * 
 * Deferred updates are:
 * - Stored in memory
 * - Replayable  
 * - Automatically applied when stability returns to STABLE
 * 
 * Schema Version: governance/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { RegimeStability } from '../../config/strategy-governance.js';
import { getCachedStability } from './regime-stability.js';
// B72 (2026-05-05): MIN_BATCH_SIZE moved to module='learning_governance'
// (regime-scoped: TRANSITION).
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

function getMinBatchSize(): number {
  return getCachedNumberRequired('learning_governance', 'min_batch_size',
    { exchange: '*', assetClass: '*', strategy: '*', regime: 'TRANSITION' });
}

export type LearningUpdateType = 'POSITIVE' | 'NEGATIVE';

export interface LearningUpdate {
  id: string;
  type: LearningUpdateType;
  strategy: string;
  symbol: string;
  outcome: 'WIN' | 'LOSS';
  profitPercent: number;
  stability: RegimeStability;
  timestamp: number;
  data: Record<string, any>;
}

export interface DeferredUpdate extends LearningUpdate {
  deferredAt: number;
  reason: string;
}

// MIN_BATCH_SIZE: B72 → module_constants 'learning_governance.min_batch_size'.
const deferredUpdates: DeferredUpdate[] = [];
const transitionBatch: LearningUpdate[] = [];

let learningStats = {
  immediatePositive: 0,
  immediateNegative: 0,
  batchedPositive: 0,
  deferredPositive: 0,
  replayed: 0,
  lastStableAt: Date.now(),
};

export function shouldDeferLearning(
  updateType: LearningUpdateType,
  stability: RegimeStability
): { defer: boolean; batch: boolean; reason: string } {
  if (updateType === 'NEGATIVE') {
    return { defer: false, batch: false, reason: 'Negative learning always immediate' };
  }
  
  if (stability === 'STABLE') {
    return { defer: false, batch: false, reason: 'STABLE regime - immediate learning' };
  }
  
  if (stability === 'TRANSITION') {
    return { defer: false, batch: true, reason: 'TRANSITION regime - batch until 5+ samples' };
  }
  
  return { defer: true, batch: false, reason: 'UNSTABLE regime - deferred until stable' };
}

export function processLearningUpdate(update: LearningUpdate): {
  applied: boolean;
  deferred: boolean;
  batchPending: boolean;
  reason: string;
} {
  const { defer, batch, reason } = shouldDeferLearning(update.type, update.stability);
  
  if (update.type === 'NEGATIVE') {
    learningStats.immediateNegative++;
    console.log(`[11.7R][Learning] IMMEDIATE negative: ${update.symbol} ${update.strategy} (${update.profitPercent.toFixed(2)}%)`);
    return { applied: true, deferred: false, batchPending: false, reason };
  }
  
  if (defer) {
    deferredUpdates.push({
      ...update,
      deferredAt: Date.now(),
      reason: 'REGIME_INSTABILITY',
    });
    learningStats.deferredPositive++;
    console.log(`[11.7R][Learning] DEFERRED positive: ${update.symbol} ${update.strategy} (stability=${update.stability})`);
    return { applied: false, deferred: true, batchPending: false, reason };
  }
  
  if (batch) {
    transitionBatch.push(update);
    const minBatchSize = getMinBatchSize();

    if (transitionBatch.length >= minBatchSize) {
      const batchSize = transitionBatch.length;
      transitionBatch.length = 0;
      learningStats.batchedPositive += batchSize;
      console.log(`[11.7R][Learning] BATCH applied: ${batchSize} positive updates released`);
      return { applied: true, deferred: false, batchPending: false, reason: `Batch threshold met (${batchSize} samples)` };
    }

    console.log(`[11.7R][Learning] BATCHING positive: ${transitionBatch.length}/${minBatchSize} samples`);
    return { applied: false, deferred: false, batchPending: true, reason: `Waiting for batch (${transitionBatch.length}/${minBatchSize})` };
  }
  
  learningStats.immediatePositive++;
  console.log(`[11.7R][Learning] IMMEDIATE positive: ${update.symbol} ${update.strategy}`);
  return { applied: true, deferred: false, batchPending: false, reason };
}

export function replayDeferredUpdates(): number {
  const currentStability = getCachedStability();
  
  if (!currentStability || currentStability.stability !== 'STABLE') {
    console.log(`[11.7R][Learning] Cannot replay - current stability: ${currentStability?.stability || 'unknown'}`);
    return 0;
  }
  
  const count = deferredUpdates.length;
  
  if (count === 0) {
    return 0;
  }
  
  learningStats.replayed += count;
  learningStats.lastStableAt = Date.now();
  
  console.log(`[11.7R][Learning] REPLAYING ${count} deferred positive updates (stability restored)`);
  
  deferredUpdates.length = 0;
  
  return count;
}

export function getDeferredUpdateCount(): number {
  return deferredUpdates.length;
}

export function getBatchPendingCount(): number {
  return transitionBatch.length;
}

export function getLearningCooldownState(): {
  deferredCount: number;
  batchPendingCount: number;
  stats: typeof learningStats;
  canReplay: boolean;
} {
  const currentStability = getCachedStability();
  
  return {
    deferredCount: deferredUpdates.length,
    batchPendingCount: transitionBatch.length,
    stats: { ...learningStats },
    canReplay: currentStability?.stability === 'STABLE' && deferredUpdates.length > 0,
  };
}

export function resetLearningCooldownStats(): void {
  learningStats = {
    immediatePositive: 0,
    immediateNegative: 0,
    batchedPositive: 0,
    deferredPositive: 0,
    replayed: 0,
    lastStableAt: Date.now(),
  };
  deferredUpdates.length = 0;
  transitionBatch.length = 0;
}
