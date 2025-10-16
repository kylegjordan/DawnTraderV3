/**
 * Phase 8.6.5 Validation: Provenance Debug Service
 * 
 * Enables full data lineage debugging across all layers:
 * - Database → BoB
 * - BoB → Cortex
 * - Cortex → Walter
 * - Walter → UI
 * 
 * Provides detailed tracing with color-coded console output
 */

import { provenanceLogger } from './provenance-logger';
import { db } from '../db';
import { dataLineage, bobTraceLog, walterMemory } from '@shared/schema';
import { eq, gte, desc, and, or, like } from 'drizzle-orm';

interface DebugTraceEntry {
  timestamp: Date;
  layer: string;
  operation: string;
  source: string;
  traceId: string;
  metadata: any;
  flag?: 'STALE' | 'LEGACY' | 'CACHE_HIT' | 'FRESH';
}

class ProvenanceDebugService {
  private verboseMode: boolean = false;
  private activeTraces: Map<string, DebugTraceEntry[]> = new Map();

  /**
   * Enable verbose provenance logging
   */
  enableVerboseMode(): void {
    this.verboseMode = true;
    console.log('\n🔍 ═══════════════════════════════════════════════════════════');
    console.log('🔍 PROVENANCE DEBUG MODE ENABLED');
    console.log('🔍 Tracking: Database → BoB → Cortex → Walter → UI');
    console.log('🔍 ═══════════════════════════════════════════════════════════\n');
  }

  /**
   * Disable verbose provenance logging
   */
  disableVerboseMode(): void {
    this.verboseMode = false;
    console.log('\n🔍 PROVENANCE DEBUG MODE DISABLED\n');
  }

  /**
   * Check if verbose mode is enabled
   */
  isVerboseEnabled(): boolean {
    return this.verboseMode;
  }

  /**
   * Log database fetch with verbose details
   */
  logDatabaseFetch(params: {
    traceId: string;
    table: string;
    mode?: 'live' | 'paper';
    globalContextId?: string;
    rowCount: number;
    executionTimeMs: number;
  }): void {
    if (!this.verboseMode) return;

    const { traceId, table, mode, globalContextId, rowCount, executionTimeMs } = params;
    
    console.log(`\n[Provenance] 📊 DATABASE FETCH`);
    console.log(`  traceId: ${traceId}`);
    console.log(`  source: ${table}`);
    console.log(`  mode: ${mode || 'N/A'}`);
    console.log(`  globalContextId: ${globalContextId || 'N/A'}`);
    console.log(`  rows: ${rowCount}`);
    console.log(`  time: ${executionTimeMs}ms`);

    this.recordTrace(traceId, {
      timestamp: new Date(),
      layer: 'database',
      operation: 'fetch',
      source: table,
      traceId,
      metadata: { mode, globalContextId, rowCount, executionTimeMs },
      flag: 'FRESH',
    });
  }

  /**
   * Log BoB module operation with verbose details
   */
  logBobOperation(params: {
    traceId: string;
    bobModule: string;
    operation: string;
    sourceTable?: string;
    mode?: 'live' | 'paper';
    cacheHit: boolean;
    executionTimeMs: number;
    rowCount?: number;
  }): void {
    if (!this.verboseMode) return;

    const { traceId, bobModule, operation, sourceTable, mode, cacheHit, executionTimeMs, rowCount } = params;
    
    const flag = cacheHit ? '✅ CACHE_HIT' : '🔄 CACHE_MISS';
    
    console.log(`\n[Provenance] 🎯 BOB MODULE: ${bobModule}`);
    console.log(`  traceId: ${traceId}`);
    console.log(`  operation: ${operation}`);
    console.log(`  sourceTable: ${sourceTable || 'N/A'}`);
    console.log(`  mode: ${mode || 'N/A'}`);
    console.log(`  ${flag}`);
    console.log(`  time: ${executionTimeMs}ms`);
    if (rowCount !== undefined) console.log(`  rows: ${rowCount}`);

    this.recordTrace(traceId, {
      timestamp: new Date(),
      layer: 'bob',
      operation: `${bobModule}.${operation}`,
      source: sourceTable || 'cache',
      traceId,
      metadata: { bobModule, cacheHit, executionTimeMs, rowCount },
      flag: cacheHit ? 'CACHE_HIT' : 'FRESH',
    });
  }

  /**
   * Log Cortex cache operation with verbose details
   */
  logCortexOperation(params: {
    traceId: string;
    operation: 'read' | 'write' | 'update';
    key: string;
    sourceTable?: string;
    mode?: 'live' | 'paper';
    cacheAge?: number;
    ttl?: number;
  }): void {
    if (!this.verboseMode) return;

    const { traceId, operation, key, sourceTable, mode, cacheAge, ttl } = params;
    
    let flag: DebugTraceEntry['flag'] = 'FRESH';
    if (cacheAge && cacheAge > 3600000) flag = 'STALE'; // > 1 hour
    
    console.log(`\n[Provenance] 🧠 CORTEX ${operation.toUpperCase()}`);
    console.log(`  traceId: ${traceId}`);
    console.log(`  key: ${key}`);
    console.log(`  sourceTable: ${sourceTable || 'N/A'}`);
    console.log(`  mode: ${mode || 'N/A'}`);
    if (cacheAge !== undefined) console.log(`  age: ${Math.round(cacheAge / 1000)}s`);
    if (ttl !== undefined) console.log(`  ttl: ${ttl}s`);
    if (flag === 'STALE') console.log(`  ⚠️ WARNING: Cache entry is STALE`);

    this.recordTrace(traceId, {
      timestamp: new Date(),
      layer: 'cortex',
      operation,
      source: key,
      traceId,
      metadata: { sourceTable, mode, cacheAge, ttl },
      flag,
    });
  }

  /**
   * Log Walter memory operation with verbose details
   */
  logWalterMemory(params: {
    traceId: string;
    operation: 'read' | 'write';
    content: string;
    memoryType?: string;
    memorySource?: string;
    timestamp?: Date;
    mode?: 'live' | 'paper';
  }): void {
    if (!this.verboseMode) return;

    const { traceId, operation, content, memoryType, memorySource, timestamp: memTimestamp, mode } = params;
    
    let flag: DebugTraceEntry['flag'] = 'FRESH';
    if (memorySource === 'legacy_context') flag = 'LEGACY';
    if (memTimestamp) {
      const ageMs = Date.now() - memTimestamp.getTime();
      if (ageMs > 86400000) flag = 'STALE'; // > 24 hours
    }
    
    console.log(`\n[Provenance] 🤖 WALTER MEMORY ${operation.toUpperCase()}`);
    console.log(`  traceId: ${traceId}`);
    console.log(`  content: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
    console.log(`  type: ${memoryType || 'N/A'}`);
    console.log(`  source: ${memorySource || 'N/A'}`);
    console.log(`  mode: ${mode || 'N/A'}`);
    if (memTimestamp) console.log(`  timestamp: ${memTimestamp.toISOString()}`);
    if (flag === 'LEGACY') console.log(`  ❌ WARNING: Using LEGACY memory source!`);
    if (flag === 'STALE') console.log(`  ⚠️ WARNING: Memory is STALE`);

    this.recordTrace(traceId, {
      timestamp: new Date(),
      layer: 'walter',
      operation,
      source: content.substring(0, 50),
      traceId,
      metadata: { memoryType, memorySource, timestamp: memTimestamp, mode },
      flag,
    });
  }

  /**
   * Record trace entry for correlation
   */
  private recordTrace(traceId: string, entry: DebugTraceEntry): void {
    if (!this.activeTraces.has(traceId)) {
      this.activeTraces.set(traceId, []);
    }
    this.activeTraces.get(traceId)!.push(entry);
  }

  /**
   * Get full trace chain for a traceId
   */
  getTraceChain(traceId: string): DebugTraceEntry[] {
    return this.activeTraces.get(traceId) || [];
  }

  /**
   * Print trace chain summary
   */
  printTraceChain(traceId: string): void {
    const chain = this.getTraceChain(traceId);
    
    if (chain.length === 0) {
      console.log(`\n[Provenance] No trace found for ${traceId}\n`);
      return;
    }

    console.log(`\n[Provenance] ═══════════════════════════════════════════════════════════`);
    console.log(`[Provenance] TRACE CHAIN: ${traceId}`);
    console.log(`[Provenance] ═══════════════════════════════════════════════════════════\n`);

    chain.forEach((entry, index) => {
      const arrow = index < chain.length - 1 ? '  ↓' : '';
      console.log(`${index + 1}. ${entry.layer.toUpperCase()}: ${entry.operation}`);
      console.log(`   Source: ${entry.source}`);
      if (entry.flag) console.log(`   Flag: ${entry.flag}`);
      console.log(`   Time: ${entry.timestamp.toISOString()}`);
      console.log(arrow);
    });

    console.log(`\n[Provenance] ═══════════════════════════════════════════════════════════\n`);
  }

  /**
   * Query recent provenance records from database
   */
  async queryRecentLineage(limit: number = 10): Promise<any[]> {
    try {
      const records = await db
        .select()
        .from(dataLineage)
        .orderBy(desc(dataLineage.timestamp))
        .limit(limit);

      return records;
    } catch (error) {
      console.error('[ProvenanceDebug] Failed to query lineage:', error);
      return [];
    }
  }

  /**
   * Query recent BoB trace logs from database
   */
  async queryRecentBobTraces(limit: number = 10): Promise<any[]> {
    try {
      const records = await db
        .select()
        .from(bobTraceLog)
        .orderBy(desc(bobTraceLog.timestamp))
        .limit(limit);

      return records;
    } catch (error) {
      console.error('[ProvenanceDebug] Failed to query BoB traces:', error);
      return [];
    }
  }

  /**
   * Query lineage by traceId
   */
  async queryLineageByTrace(traceId: string): Promise<any[]> {
    try {
      const records = await db
        .select()
        .from(dataLineage)
        .where(eq(dataLineage.traceId, traceId))
        .orderBy(dataLineage.timestamp);

      return records;
    } catch (error) {
      console.error('[ProvenanceDebug] Failed to query lineage by trace:', error);
      return [];
    }
  }

  /**
   * Query BoB traces by traceId
   */
  async queryBobTracesByTrace(traceId: string): Promise<any[]> {
    try {
      const records = await db
        .select()
        .from(bobTraceLog)
        .where(eq(bobTraceLog.traceId, traceId))
        .orderBy(bobTraceLog.timestamp);

      return records;
    } catch (error) {
      console.error('[ProvenanceDebug] Failed to query BoB traces by trace:', error);
      return [];
    }
  }

  /**
   * Search Walter memory for specific patterns
   */
  async searchWalterMemory(pattern: string): Promise<any[]> {
    try {
      const records = await db
        .select()
        .from(walterMemory)
        .where(
          like(walterMemory.content, `%${pattern}%`)
        )
        .orderBy(desc(walterMemory.timestamp))
        .limit(20);

      return records;
    } catch (error) {
      console.error('[ProvenanceDebug] Failed to search Walter memory:', error);
      return [];
    }
  }

  /**
   * Correlate trace across all tables
   */
  async correlateTrace(traceId: string): Promise<{
    lineage: any[];
    bobTraces: any[];
    memoryEntries: any[];
    summary: {
      totalHops: number;
      freshnessMs: number;
      flags: string[];
    };
  }> {
    const lineage = await this.queryLineageByTrace(traceId);
    const bobTraces = await this.queryBobTracesByTrace(traceId);
    const memoryEntries = await this.searchWalterMemory(traceId);

    const flags: string[] = [];
    let freshnessMs = 0;

    if (lineage.length > 0) {
      const oldest = lineage[0].timestamp;
      const newest = lineage[lineage.length - 1].timestamp;
      freshnessMs = new Date(newest).getTime() - new Date(oldest).getTime();
    }

    // Check for stale data
    if (freshnessMs > 3600000) flags.push('STALE_CHAIN');
    
    // Check for cache hits
    const cacheHits = bobTraces.filter(t => t.cacheHit);
    if (cacheHits.length > 0) flags.push('CACHE_HITS');

    return {
      lineage,
      bobTraces,
      memoryEntries,
      summary: {
        totalHops: lineage.length + bobTraces.length,
        freshnessMs,
        flags,
      },
    };
  }

  /**
   * Generate provenance report
   */
  async generateReport(): Promise<{
    goals: { paper: any; live: any };
    strategies: { paper: any; live: any };
    portfolio: { paper: any; live: any };
    recentTraces: number;
    staleCaches: number;
  }> {
    const oneHourAgo = new Date(Date.now() - 3600000);

    const recentLineage = await db
      .select()
      .from(dataLineage)
      .where(gte(dataLineage.timestamp, oneHourAgo));

    const recentBobTraces = await db
      .select()
      .from(bobTraceLog)
      .where(gte(bobTraceLog.timestamp, oneHourAgo));

    // Count by source table and mode
    const goalsPaper = recentLineage.filter(r => r.sourceTable === 'user_goals_paper').length;
    const goalsLive = recentLineage.filter(r => r.sourceTable === 'user_goals_live').length;
    const strategiesPaper = recentLineage.filter(r => r.sourceTable === 'strategy_settings' && r.mode === 'paper').length;
    const strategiesLive = recentLineage.filter(r => r.sourceTable === 'strategy_settings' && r.mode === 'live').length;
    const portfolioPaper = recentLineage.filter(r => r.sourceTable === 'portfolio_state' && r.mode === 'paper').length;
    const portfolioLive = recentLineage.filter(r => r.sourceTable === 'portfolio_state' && r.mode === 'live').length;

    const staleCaches = recentBobTraces.filter(t => {
      const ageMs = Date.now() - new Date(t.timestamp!).getTime();
      return t.cacheHit && ageMs > 3600000;
    }).length;

    return {
      goals: { paper: goalsPaper, live: goalsLive },
      strategies: { paper: strategiesPaper, live: strategiesLive },
      portfolio: { paper: portfolioPaper, live: portfolioLive },
      recentTraces: recentLineage.length,
      staleCaches,
    };
  }

  /**
   * Clear active traces (call periodically to prevent memory leak)
   */
  clearActiveTraces(): void {
    this.activeTraces.clear();
  }
}

// Export singleton instance
export const provenanceDebug = new ProvenanceDebugService();
export default provenanceDebug;
