/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.1B — Adaptive Learning Repository
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides SQL-backed persistence for adaptive learning weights per strategy.
 * Enables rehydration of learning state after restarts with timestamp awareness
 * for time-based decay of stale weights.
 * 
 * Features:
 * - Strategy-specific weight persistence by regime
 * - Timestamp propagation for time decay on rehydration
 * - Live mode-only persistence (consistent with 11.1A1 provenance rules)
 * - Upsert semantics for weight updates
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../db.js';
import { adaptiveLearning, type InsertAdaptiveLearning, type AdaptiveLearning } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE } from '../config/schema-version.js';
import { getTrueMode, shouldPersist, type MarketRegime } from './telemetry-repository.js';

export interface AdaptiveWeights {
  [key: string]: number;
}

export interface AdaptiveWeightResult {
  strategyId: string;
  weights: string;
  updatedAt: Date;
}

export interface TimestampedWeights {
  weights: AdaptiveWeights;
  updatedAt: Date;
}

/**
 * Load adaptive weights with timestamps for a specific regime
 * Required for time-based decay on rehydration
 */
export async function loadAdaptiveWeightsWithTimestamps(
  regime: MarketRegime
): Promise<AdaptiveWeightResult[]> {
  try {
    const records = await db
      .select({
        strategyId: adaptiveLearning.strategyId,
        weights: adaptiveLearning.weights,
        updatedAt: adaptiveLearning.updatedAt,
      })
      .from(adaptiveLearning)
      .where(
        and(
          eq(adaptiveLearning.mode, 'live'),
          eq(adaptiveLearning.regime, regime)
        )
      )
      .orderBy(desc(adaptiveLearning.updatedAt));
    
    console.log(`[11.1B][AdaptiveRepo] Loaded ${records.length} weight profiles for regime=${regime}`);
    
    return records.map(r => ({
      strategyId: r.strategyId,
      weights: JSON.stringify(r.weights),
      updatedAt: r.updatedAt,
    }));
  } catch (error) {
    console.error('[11.1B][AdaptiveRepo] Failed to load adaptive weights:', error);
    return [];
  }
}

/**
 * Load all adaptive weights for a regime (simple map without timestamps)
 */
export async function loadAdaptiveWeights(
  regime: MarketRegime
): Promise<Map<string, AdaptiveWeights>> {
  try {
    const records = await db
      .select()
      .from(adaptiveLearning)
      .where(
        and(
          eq(adaptiveLearning.mode, 'live'),
          eq(adaptiveLearning.regime, regime)
        )
      );
    
    const weightMap = new Map<string, AdaptiveWeights>();
    for (const record of records) {
      weightMap.set(record.strategyId, record.weights as AdaptiveWeights);
    }
    
    return weightMap;
  } catch (error) {
    console.error('[11.1B][AdaptiveRepo] Failed to load adaptive weights:', error);
    return new Map();
  }
}

/**
 * Save or update adaptive weights for a strategy
 * Uses upsert semantics - updates if exists, inserts if new
 * IMPORTANT: Preserves original updatedAt timestamp for time-based decay
 */
export async function saveAdaptiveWeights(
  strategyId: string,
  regime: MarketRegime,
  weights: AdaptiveWeights,
  metadata?: Record<string, any>,
  originalTimestamp?: Date
): Promise<boolean> {
  if (!shouldPersist()) {
    console.log(`[11.1B][AdaptiveRepo] Persistence disabled (mode=${getTrueMode()})`);
    return false;
  }
  
  try {
    const trueMode = getTrueMode();
    const timestamp = originalTimestamp || new Date();
    
    const existing = await db
      .select()
      .from(adaptiveLearning)
      .where(
        and(
          eq(adaptiveLearning.strategyId, strategyId),
          eq(adaptiveLearning.mode, trueMode),
          eq(adaptiveLearning.regime, regime)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      await db
        .update(adaptiveLearning)
        .set({
          weights,
          metadata,
          updatedAt: timestamp,
        })
        .where(eq(adaptiveLearning.id, existing[0].id));
      
      console.log(`[Learning] Updated ${strategyId} | mode=${trueMode} | regime=${regime} | ts=${timestamp.toISOString()}`);
    } else {
      const record: InsertAdaptiveLearning = {
        strategyId,
        mode: trueMode,
        regime,
        weights,
        metadata,
        updatedAt: timestamp,
      };
      
      await db.insert(adaptiveLearning).values(record);
      
      console.log(`[Learning] Saved ${strategyId} | mode=${trueMode} | regime=${regime} | ts=${timestamp.toISOString()}`);
    }
    
    return true;
  } catch (error) {
    console.error('[11.1B][AdaptiveRepo] Failed to save adaptive weights:', error);
    return false;
  }
}

/**
 * Batch save adaptive weights for multiple strategies
 */
export async function saveAdaptiveWeightsBatch(
  entries: Array<{
    strategyId: string;
    regime: MarketRegime;
    weights: AdaptiveWeights;
    metadata?: Record<string, any>;
  }>
): Promise<number> {
  if (!shouldPersist() || entries.length === 0) {
    return 0;
  }
  
  let savedCount = 0;
  for (const entry of entries) {
    const success = await saveAdaptiveWeights(
      entry.strategyId,
      entry.regime,
      entry.weights,
      entry.metadata
    );
    if (success) savedCount++;
  }
  
  console.log(`[Learning] Batch saved ${savedCount}/${entries.length} adaptive weight profiles`);
  return savedCount;
}

/**
 * Get adaptive learning statistics by regime
 */
export async function getAdaptiveLearningStats(
  regime?: MarketRegime
): Promise<{ total: number; byStrategy: Map<string, number> }> {
  try {
    const query = regime
      ? db.select().from(adaptiveLearning).where(eq(adaptiveLearning.regime, regime))
      : db.select().from(adaptiveLearning);
    
    const records = await query;
    
    const byStrategy = new Map<string, number>();
    for (const record of records) {
      const count = byStrategy.get(record.strategyId) || 0;
      byStrategy.set(record.strategyId, count + 1);
    }
    
    return {
      total: records.length,
      byStrategy,
    };
  } catch (error) {
    console.error('[11.1B][AdaptiveRepo] Failed to get stats:', error);
    return { total: 0, byStrategy: new Map() };
  }
}
