/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.1A + 11.1A1 — Telemetry Repository (SQL-based Persistence)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Provides SQL-backed telemetry persistence using the telemetry_history table.
 * Replaces all file-based persistence to ensure ACID consistency and prevent
 * split-brain storage scenarios.
 *
 * Features:
 * - Market regime-tagged telemetry records
 * - SHA-256 checksum validation for integrity
 * - Live mode-only persistence with FORCE_PERSIST override for testing
 * - Contextual rehydration by regime (live-mode only per 11.1A1)
 *
 * DIRECTIVE 11.1A1 PROVENANCE FIX:
 * - getTrueMode() always returns actual environment mode (never misrepresents)
 * - FORCE_PERSIST enables writing, but never relabels data as 'live'
 * - Rehydration loads only true live-mode records
 *
 * Phase 14 (Batch 15): Updated regime types for direction-neutral canonical names.
 *   MarketRegimeDB expanded to include TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE,
 *   RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION.
 *   toDBRegime() updated for direct pass-through (all names now in DB enum).
 *
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../db.js';
import { telemetryHistory, type InsertTelemetryHistory, type TelemetryHistory } from '../../shared/schema.js';
import { eq, desc, and, gte } from 'drizzle-orm';
import crypto from 'crypto';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE, METRIC_ENGINE_VERSION } from '../config/schema-version.js';

// Database-compatible regime types (stored in PostgreSQL enum)
// Phase 14: Expanded to include both old and new canonical names
export type MarketRegimeDB =
  | 'EXTREME_NOISE'
  | 'BULL_STABLE'
  | 'BULL_VOLATILE'
  | 'BEAR_STABLE'
  | 'BEAR_VOLATILE'
  | 'LOW_VOL_CHOP'
  | 'TREND_FRIENDLY_STABLE'
  | 'HIGH_VOLATILITY_UNSTABLE'
  | 'RANGE_BOUND_STABLE'
  | 'IMPULSE_EXPANSION'
  | 'STRUCTURAL_TRANSITION'
  | 'HIGH_VOL_IMPULSE';

// Extended regime types for in-memory use
// Phase 14: TRANSITION mapped to STRUCTURAL_TRANSITION in DB
export type MarketRegime = MarketRegimeDB
  | 'TRANSITION';

/**
 * Map extended regime types to database-compatible types.
 * Phase 14: New canonical names pass through directly.
 * Old canonical names also pass through (still in DB enum for backward compat).
 * Only 'TRANSITION' (never in DB enum) needs mapping.
 */
export function toDBRegime(regime: MarketRegime): MarketRegimeDB {
  if (regime === 'TRANSITION') return 'STRUCTURAL_TRANSITION';
  return regime as MarketRegimeDB;
}

export type PoolType = 'ideal' | 'rotational';

export interface TelemetryEntry {
  symbol: string;
  mode: 'live' | 'paper';
  regime: MarketRegime;
  pool?: PoolType; // Directive 11.2 R1: Source pool for segmented performance tracking
  finalScore: number;
  hybridScore?: number;
  regimeWeight?: number;
  predictiveConfidence?: number;
  successRate?: number;
  sampleCount?: number;
  timeframe?: '1h' | '15m' | '5m';
  metadata?: Record<string, any>;
  // Phase 14: 6 context dimensions captured at trade OPEN
  source?: string;
  globalRegime?: string;
  pairFriction?: number;
  globalFriction?: number;
  pairDirectionalBias?: string;
  globalDirectionalBias?: string;
  decayPenalty?: number;
}

/**
 * Compute SHA-256 checksum for telemetry entry integrity
 */
export function computeTelemetryChecksum(entry: TelemetryEntry): string {
  const input = JSON.stringify({
    symbol: entry.symbol,
    mode: entry.mode,
    regime: entry.regime,
    finalScore: entry.finalScore,
    schemaVersion: SCHEMA_VERSION,
    metricEngineVersion: METRIC_ENGINE_VERSION,
  });
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Verify telemetry record checksum
 */
export function verifyTelemetryChecksum(record: TelemetryHistory): boolean {
  if (!record.checksum) return false;

  const expectedChecksum = computeTelemetryChecksum({
    symbol: record.symbol,
    mode: record.mode as 'live' | 'paper',
    regime: record.regime as MarketRegime,
    finalScore: parseFloat(record.finalScore),
  });

  return record.checksum === expectedChecksum;
}

/**
 * Check if persistence should be enabled based on environment
 * - Only enabled in live mode by default
 * - Can be overridden with FORCE_PERSIST=true for testing
 */
export function shouldPersist(): boolean {
  const mode = process.env.MODE || 'paper';
  const force = process.env.FORCE_PERSIST === 'true';
  const disabled = process.env.PERSIST_TELEMETRY === 'false';

  if (disabled) return false;
  return (mode === 'live') || force;
}

/**
 * Directive 11.1A1: Get the TRUE execution mode
 * NEVER misrepresent mode - FORCE_PERSIST enables writing, not relabeling
 * This ensures data provenance integrity for adaptive learning
 */
export function getTrueMode(): 'live' | 'paper' {
  return (process.env.MODE as 'live' | 'paper') || 'paper';
}

/**
 * Load recent telemetry records by regime
 * Used for contextual rehydration after restart
 */
export async function loadRecentTelemetry(
  regime: MarketRegime,
  mode: 'live' | 'paper' = 'live',
  limit: number = 100
): Promise<TelemetryHistory[]> {
  try {
    const dbRegime = toDBRegime(regime); // Map extended regime to DB-compatible
    const records = await db
      .select()
      .from(telemetryHistory)
      .where(
        and(
          eq(telemetryHistory.regime, dbRegime),
          eq(telemetryHistory.mode, mode)
        )
      )
      .orderBy(desc(telemetryHistory.timestamp))
      .limit(limit);

    console.log(`[11.1A][TelemetryRepo] Loaded ${records.length} records for regime=${regime}, mode=${mode}`);
    return records;
  } catch (error) {
    console.error('[11.1A][TelemetryRepo] Failed to load telemetry:', error);
    return [];
  }
}

/**
 * Load telemetry by symbol within time window
 */
export async function loadTelemetryBySymbol(
  symbol: string,
  mode: 'live' | 'paper' = 'live',
  hoursBack: number = 24
): Promise<TelemetryHistory[]> {
  try {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const records = await db
      .select()
      .from(telemetryHistory)
      .where(
        and(
          eq(telemetryHistory.symbol, symbol),
          eq(telemetryHistory.mode, mode),
          gte(telemetryHistory.timestamp, cutoff)
        )
      )
      .orderBy(desc(telemetryHistory.timestamp));

    return records;
  } catch (error) {
    console.error(`[11.1A][TelemetryRepo] Failed to load telemetry for ${symbol}:`, error);
    return [];
  }
}

/**
 * Save a telemetry record with checksum
 * Directive 11.1A1: Uses getTrueMode() to preserve actual execution mode
 * Directive 11.2 R1: Includes pool tracking for segmented performance
 * Phase 14: Includes 6 context dimensions and source tag
 * Note: DECIMAL columns in PostgreSQL accept string representation
 */
export async function saveTelemetryRecord(entry: TelemetryEntry): Promise<boolean> {
  if (!shouldPersist()) {
    console.log(`[11.1A][TelemetryRepo] Persistence disabled (mode=${getTrueMode()})`);
    return false;
  }

  try {
    const trueMode = getTrueMode();
    const entryWithTrueMode = { ...entry, mode: trueMode };
    const checksum = computeTelemetryChecksum(entryWithTrueMode);
    const pool = entry.pool ?? 'ideal';

    const record: InsertTelemetryHistory = {
      mode: trueMode,
      symbol: entry.symbol,
      regime: toDBRegime(entry.regime), // Map extended regime types to DB-compatible
      pool,
      finalScore: entry.finalScore.toFixed(4),
      hybridScore: entry.hybridScore?.toFixed(4),
      regimeWeight: entry.regimeWeight?.toFixed(4),
      predictiveConfidence: entry.predictiveConfidence?.toFixed(4),
      successRate: entry.successRate?.toFixed(4),
      sampleCount: entry.sampleCount ?? 1,
      timeframe: entry.timeframe,
      checksum,
      metadata: entry.metadata,
      // Phase 14: 6 context dimensions + source tag
      source: entry.source ?? 'vts',
      globalRegime: entry.globalRegime,
      pairFriction: entry.pairFriction?.toFixed(2),
      globalFriction: entry.globalFriction?.toFixed(2),
      pairDirectionalBias: entry.pairDirectionalBias,
      globalDirectionalBias: entry.globalDirectionalBias,
      decayPenalty: entry.decayPenalty?.toFixed(4),
      timestamp: new Date(),
    };

    await db.insert(telemetryHistory).values(record);

    // Directive 11.2 R1: Enhanced provenance audit log with pool
    console.log(`[Telemetry] Saved ${entry.symbol} (${pool}) | mode=${trueMode} | regime=${entry.regime} | score=${entry.finalScore.toFixed(2)}`);
    return true;
  } catch (error) {
    console.error('[11.1A][TelemetryRepo] Failed to save telemetry:', error);
    return false;
  }
}

/**
 * Batch save telemetry records
 * Directive 11.1A1: Uses getTrueMode() to preserve actual execution mode
 * Directive 11.2 R1: Includes pool tracking for segmented performance
 * Note: DECIMAL columns in PostgreSQL accept string representation
 */
export async function saveTelemetryBatch(entries: TelemetryEntry[]): Promise<number> {
  if (!shouldPersist() || entries.length === 0) {
    return 0;
  }

  try {
    const trueMode = getTrueMode();

    const records: InsertTelemetryHistory[] = entries.map(entry => {
      const entryWithTrueMode = { ...entry, mode: trueMode };
      return {
        mode: trueMode,
        symbol: entry.symbol,
        regime: toDBRegime(entry.regime), // Map extended regime types to DB-compatible
        pool: entry.pool ?? 'ideal',
        finalScore: entry.finalScore.toFixed(4),
        hybridScore: entry.hybridScore?.toFixed(4),
        regimeWeight: entry.regimeWeight?.toFixed(4),
        predictiveConfidence: entry.predictiveConfidence?.toFixed(4),
        successRate: entry.successRate?.toFixed(4),
        sampleCount: entry.sampleCount ?? 1,
        timeframe: entry.timeframe,
        checksum: computeTelemetryChecksum(entryWithTrueMode),
        metadata: entry.metadata,
        // Phase 14: 6 context dimensions + source tag
        source: entry.source ?? 'vts',
        globalRegime: entry.globalRegime,
        pairFriction: entry.pairFriction?.toFixed(2),
        globalFriction: entry.globalFriction?.toFixed(2),
        pairDirectionalBias: entry.pairDirectionalBias,
        globalDirectionalBias: entry.globalDirectionalBias,
        decayPenalty: entry.decayPenalty?.toFixed(4),
        timestamp: new Date(),
      };
    });

    await db.insert(telemetryHistory).values(records);

    // Directive 11.2 R1: Enhanced provenance audit log
    console.log(`[Telemetry] Batch saved ${records.length} records | mode=${trueMode}`);
    return records.length;
  } catch (error) {
    console.error('[11.1A][TelemetryRepo] Failed to batch save telemetry:', error);
    return 0;
  }
}

/**
 * Get telemetry statistics by regime
 */
export async function getTelemetryStatsByRegime(
  mode: 'live' | 'paper' = 'live',
  hoursBack: number = 24
): Promise<Map<MarketRegime, { count: number; avgScore: number }>> {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
  const stats = new Map<MarketRegime, { count: number; avgScore: number }>();

  try {
    const records = await db
      .select()
      .from(telemetryHistory)
      .where(
        and(
          eq(telemetryHistory.mode, mode),
          gte(telemetryHistory.timestamp, cutoff)
        )
      );

    const grouped = new Map<string, { sum: number; count: number }>();

    for (const record of records) {
      const regime = record.regime as MarketRegime;
      const current = grouped.get(regime) || { sum: 0, count: 0 };
      current.sum += parseFloat(record.finalScore);
      current.count++;
      grouped.set(regime, current);
    }

    for (const [regime, data] of grouped.entries()) {
      stats.set(regime as MarketRegime, {
        count: data.count,
        avgScore: data.sum / data.count,
      });
    }

    return stats;
  } catch (error) {
    console.error('[11.1A][TelemetryRepo] Failed to get telemetry stats:', error);
    return stats;
  }
}

// ★ B-ARM-REMOVAL (Langston C1): `PoolPerformance` DELETED. Both consumers died in this batch
// and the census finds no other reference. Same disposition as its aggregator twin
// `PoolPerformanceAggregate`, for the reason recorded there: it is WIN-RATE-shaped, the statistic
// §0 rejects and the reason the ARM died — leaving it exported and greppable would hand the wrong
// metric to whoever builds pool quality next. §15.

// ★ B-ARM-REMOVAL: `getPerformanceByPool` + `getPoolComparison` DELETED.
// They were the ARM's SQL evidence path, reading `telemetry_history` per pool/regime over a
// 24h window. That table holds ZERO rows and always has (verified on the app's own connection,
// with sibling tables reading 39,258 / 112,582 on the same connection). Their sole production
// caller was `adaptive-ratio-manager.ts`, deleted in the same batch — see DELETED_COMPONENTS_LOG.md.
