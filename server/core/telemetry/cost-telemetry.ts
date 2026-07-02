/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3C — Cost Telemetry Persistence
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Persists average trading cost metrics periodically into the telemetry system.
 * - 5-minute snapshot interval (configurable)
 * - 72-hour retention with automatic cleanup
 * - Stored as mode='system', symbol='COST_METRICS' in telemetry_history
 * 
 * Governance Invariants:
 * - M6: Cost Persistence — Costs must be recorded historically
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import { telemetryHistory } from '../../../shared/schema.js';
// P19-B7.2a (#330): stats via the fee-bearing wrapper — the cache no longer
// stores fees; avgFee is composed from the B-4.5 merge site in cost-model.
import { computeTotalRoundTripCost, getCostCacheStatsWithFee } from '../math/cost-model.js';
import { lt, and, eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { SCHEMA_VERSION } from '../../config/schema-version.js';
import { REGIMES } from '../../config/canonical-regime-strategy-map.js';

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const RETENTION_HOURS = 72;
const COST_METRICS_SYMBOL = 'COST_METRICS';
const COST_METRICS_MODE = 'system';

export interface CostSnapshot {
  avgFee: number;
  avgSlippage: number;
  avgSpread: number;
  totalCost: number;
  symbolCount: number;
  timestamp: Date;
}

interface PersistedCostRecord {
  id: string;
  symbol: string;
  mode: string;
  regime: string;
  finalScore: string;
  hybridScore: string | null;
  regimeWeight: string | null;
  predictiveConfidence: string | null;
  successRate: string | null;
  sampleCount: number | null;
  timeframe: string | null;
  pool: string | null;
  positionSize: string | null;
  sizeMultiplier: string | null;
  checksum: string | null;
  persistedAt: Date | null;
  metadata: unknown;
}

let snapshotInterval: NodeJS.Timeout | null = null;

function computeChecksum(snapshot: CostSnapshot): string {
  const input = JSON.stringify({
    avgFee: snapshot.avgFee,
    avgSlippage: snapshot.avgSlippage,
    avgSpread: snapshot.avgSpread,
    totalCost: snapshot.totalCost,
    schemaVersion: SCHEMA_VERSION,
  });
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function persistCostSnapshot(): Promise<CostSnapshot | null> {
  try {
    const stats = getCostCacheStatsWithFee();

    if (stats.symbolCount === 0) {
      console.log('[11.3C][CostTelemetry] Skip snapshot: no cached symbols');
      return null;
    }
    
    const totalCost = computeTotalRoundTripCost(stats.avgFee, stats.avgSlippage, stats.avgSpread);
    
    const snapshot: CostSnapshot = {
      avgFee: stats.avgFee,
      avgSlippage: stats.avgSlippage,
      avgSpread: stats.avgSpread,
      totalCost,
      symbolCount: stats.symbolCount,
      timestamp: new Date(),
    };
    
    const checksum = computeChecksum(snapshot);
    
    await db.insert(telemetryHistory).values({
      symbol: COST_METRICS_SYMBOL,
      mode: COST_METRICS_MODE as 'paper' | 'live',
      // B-NEW-43 chunk 11 (2026-05-23): `BULL_STABLE` was the predecessor of
      // `TREND_FRIENDLY_STABLE` in the canonical regime renaming; cost telemetry
      // is not regime-conditional (it tracks costs across all regimes) but the
      // `regime` field in the telemetry row is required. Using the canonical
      // current name preserves the historical semantic (trend-up regime) while
      // matching the live REGIMES enum. Phase 19 may choose a different
      // sentinel (e.g., a dedicated "ALL" / "N_A" regime value) if cost
      // telemetry warrants its own scope.
      regime: REGIMES.TREND_FRIENDLY_STABLE,
      finalScore: totalCost.toString(),
      hybridScore: stats.avgFee.toString(),
      regimeWeight: stats.avgSlippage.toString(),
      predictiveConfidence: stats.avgSpread.toString(),
      sampleCount: stats.symbolCount,
      checksum,
      metadata: {
        type: 'cost_snapshot',
        avgFee: stats.avgFee,
        avgSlippage: stats.avgSlippage,
        avgSpread: stats.avgSpread,
        totalCost,
        symbolCount: stats.symbolCount,
      },
    });
    
    console.log(
      `[11.3C][CostTelemetry] Snapshot persisted: ` +
      `fee=${(stats.avgFee * 100).toFixed(2)}% ` +
      `slip=${(stats.avgSlippage * 100).toFixed(2)}% ` +
      `spread=${(stats.avgSpread * 100).toFixed(2)}% ` +
      `total=${(totalCost * 100).toFixed(2)}%`
    );
    
    return snapshot;
  } catch (error: any) {
    console.error('[11.3C][CostTelemetry] Snapshot persistence failed:', error.message);
    return null;
  }
}

export async function cleanupOldSnapshots(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
    
    const result = await db
      .delete(telemetryHistory)
      .where(
        and(
          eq(telemetryHistory.symbol, COST_METRICS_SYMBOL),
          lt(telemetryHistory.persistedAt, cutoff)
        )
      )
      .returning({ id: telemetryHistory.id });
    
    const deletedCount = result.length;
    
    if (deletedCount > 0) {
      console.log(`[11.3C][CostTelemetry] Cleaned ${deletedCount} old snapshots (>72h)`);
    }
    
    return deletedCount;
  } catch (error: any) {
    console.error('[11.3C][CostTelemetry] Cleanup failed:', error.message);
    return 0;
  }
}

export async function getCostHistory(hours: number = 24): Promise<CostSnapshot[]> {
  try {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const records = await db
      .select()
      .from(telemetryHistory)
      .where(
        and(
          eq(telemetryHistory.symbol, COST_METRICS_SYMBOL),
          sql`${telemetryHistory.persistedAt} >= ${cutoff}`
        )
      )
      .orderBy(sql`${telemetryHistory.persistedAt} DESC`)
      .limit(500);
    
    return records.map((r) => ({
      avgFee: parseFloat(r.hybridScore || '0'),
      avgSlippage: parseFloat(r.regimeWeight || '0'),
      avgSpread: parseFloat(r.predictiveConfidence || '0'),
      totalCost: parseFloat(r.finalScore || '0'),
      symbolCount: r.sampleCount || 0,
      timestamp: r.persistedAt || new Date(),
    }));
  } catch (error: any) {
    console.error('[11.3C][CostTelemetry] getCostHistory failed:', error.message);
    return [];
  }
}

export async function getLatestSnapshot(): Promise<CostSnapshot | null> {
  try {
    const records = await db
      .select()
      .from(telemetryHistory)
      .where(eq(telemetryHistory.symbol, COST_METRICS_SYMBOL))
      .orderBy(sql`${telemetryHistory.persistedAt} DESC`)
      .limit(1);
    
    if (records.length === 0) return null;
    
    const r = records[0];
    return {
      avgFee: parseFloat(r.hybridScore || '0'),
      avgSlippage: parseFloat(r.regimeWeight || '0'),
      avgSpread: parseFloat(r.predictiveConfidence || '0'),
      totalCost: parseFloat(r.finalScore || '0'),
      symbolCount: r.sampleCount || 0,
      timestamp: r.persistedAt || new Date(),
    };
  } catch (error: any) {
    console.error('[11.3C][CostTelemetry] getLatestSnapshot failed:', error.message);
    return null;
  }
}

export function startCostTelemetryLoop(): void {
  if (snapshotInterval) {
    console.log('[11.3C][CostTelemetry] Loop already running');
    return;
  }
  
  snapshotInterval = setInterval(async () => {
    await persistCostSnapshot();
    await cleanupOldSnapshots();
  }, SNAPSHOT_INTERVAL_MS);
  
  console.log(`[11.3C][CostTelemetry] Started snapshot loop (${SNAPSHOT_INTERVAL_MS / 1000}s interval, ${RETENTION_HOURS}h retention)`);
}

export function stopCostTelemetryLoop(): void {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
    console.log('[11.3C][CostTelemetry] Stopped snapshot loop');
  }
}

export { SNAPSHOT_INTERVAL_MS, RETENTION_HOURS, COST_METRICS_SYMBOL };
