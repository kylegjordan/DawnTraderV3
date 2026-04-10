/**
 * Phase 8.6.3: Provenance Logger Service
 * 
 * Tracks every data transaction between:
 * - BoB → Cortex
 * - Cortex → UI
 * 
 * Provides complete data lineage with trace ID correlation
 */

import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { db } from '../db';
import { dataLineage, bobTraceLog } from '@shared/schema';
import type { InsertDataLineage, InsertBobTraceLog } from '@shared/schema';
import { eq, gte } from 'drizzle-orm';

export type ServiceLayer = 'bob' | 'cortex' | 'ui';
export type OperationType = 'read' | 'write' | 'aggregate';
export type TradingMode = 'live' | 'paper';

interface ProvenanceContext {
  traceId: string;
  originatingService: ServiceLayer;
  targetService?: ServiceLayer;
  sourceTable?: string;
  mode?: TradingMode;
  globalContextId?: string;
  operation: OperationType;
  data?: any;
  metadata?: Record<string, any>;
}

interface BobTraceContext {
  traceId: string;
  bobModule: string;
  operation: string;
  sourceTable?: string;
  mode?: TradingMode;
  globalContextId?: string;
  cacheHit?: boolean;
  executionTimeMs?: number;
  rowCount?: number;
  metadata?: Record<string, any>;
}

class ProvenanceLogger {
  /**
   * Generate a unique trace ID for correlation across layers
   */
  generateTraceId(): string {
    return `trace_${nanoid(16)}`;
  }

  /**
   * Calculate SHA-256 hash of data for integrity verification
   */
  private hashData(data: any): string {
    if (!data) return '';
    const stringified = JSON.stringify(data);
    return crypto.createHash('sha256').update(stringified).digest('hex');
  }

  /**
   * Calculate row count from data
   */
  private getRowCount(data: any): number {
    if (!data) return 0;
    if (Array.isArray(data)) return data.length;
    if (typeof data === 'object') return 1;
    return 0;
  }

  /**
   * Log a data lineage record
   */
  async logLineage(context: ProvenanceContext): Promise<void> {
    try {
      const lineageEntry: InsertDataLineage = {
        traceId: context.traceId,
        originatingService: context.originatingService,
        targetService: context.targetService,
        sourceTable: context.sourceTable,
        mode: context.mode,
        globalContextId: context.globalContextId,
        dataHash: this.hashData(context.data),
        rowCount: this.getRowCount(context.data),
        operation: context.operation,
        metadata: context.metadata || {},
      };

      await db.insert(dataLineage).values(lineageEntry);
      
      console.log(`[ProvenanceLogger] Lineage logged: ${context.originatingService} → ${context.targetService || 'N/A'} (trace: ${context.traceId.substring(0, 12)}...)`);
    } catch (error) {
      console.error('[ProvenanceLogger] Failed to log lineage:', error);
    }
  }

  /**
   * Log a BoB trace record
   */
  async logBobTrace(context: BobTraceContext): Promise<void> {
    try {
      const traceEntry: InsertBobTraceLog = {
        traceId: context.traceId,
        bobModule: context.bobModule,
        operation: context.operation,
        sourceTable: context.sourceTable,
        mode: context.mode,
        globalContextId: context.globalContextId,
        cacheHit: context.cacheHit,
        executionTimeMs: context.executionTimeMs,
        rowCount: context.rowCount,
        metadata: context.metadata || {},
      };

      await db.insert(bobTraceLog).values(traceEntry);
      
      console.log(`[BobTrace] ${context.bobModule}.${context.operation} (${context.cacheHit ? 'HIT' : 'MISS'}, ${context.executionTimeMs}ms, trace: ${context.traceId.substring(0, 12)}...)`);
    } catch (error) {
      console.error('[ProvenanceLogger] Failed to log BoB trace:', error);
    }
  }

  /**
   * Log a BoB → Cortex data flow
   */
  async logBobToCortex(params: {
    traceId: string;
    bobModule: string;
    sourceTable?: string;
    mode?: TradingMode;
    globalContextId?: string;
    data?: any;
    cacheHit?: boolean;
    executionTimeMs?: number;
  }): Promise<void> {
    const { traceId, bobModule, sourceTable, mode, globalContextId, data, cacheHit, executionTimeMs } = params;
    
    // Log BoB trace
    await this.logBobTrace({
      traceId,
      bobModule,
      operation: 'fetch',
      sourceTable,
      mode,
      globalContextId,
      cacheHit,
      executionTimeMs,
      rowCount: this.getRowCount(data),
    });

    // Log data lineage
    await this.logLineage({
      traceId,
      originatingService: 'bob',
      targetService: 'cortex',
      sourceTable,
      mode,
      globalContextId,
      operation: 'read',
      data,
      metadata: { bobModule, cacheHit },
    });
  }



  /**
   * Get recent lineage for a trace ID
   */
  async getLineageByTraceId(traceId: string): Promise<any[]> {
    try {
      const lineage = await db
        .select()
        .from(dataLineage)
        .where(eq(dataLineage.traceId, traceId))
        .orderBy(dataLineage.timestamp);
      
      return lineage;
    } catch (error) {
      console.error('[ProvenanceLogger] Failed to get lineage:', error);
      return [];
    }
  }

  /**
   * Get freshness statistics by service layer
   */
  async getFreshnessStats(): Promise<{
    bob: { avgAgeMs: number; count: number };
    cortex: { avgAgeMs: number; count: number };
  }> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    try {
      // Get recent lineage records
      const recentLineage = await db
        .select()
        .from(dataLineage)
        .where(gte(dataLineage.timestamp, fiveMinutesAgo))
        .orderBy(dataLineage.timestamp);

      const stats = {
        bob: { avgAgeMs: 0, count: 0 },
        cortex: { avgAgeMs: 0, count: 0 },
      };

      for (const record of recentLineage) {
        const ageMs = now.getTime() - new Date(record.timestamp!).getTime();
        const service = record.originatingService as keyof typeof stats;
        
        if (stats[service]) {
          stats[service].avgAgeMs = (stats[service].avgAgeMs * stats[service].count + ageMs) / (stats[service].count + 1);
          stats[service].count++;
        }
      }

      return stats;
    } catch (error) {
      console.error('[ProvenanceLogger] Failed to get freshness stats:', error);
      return {
        bob: { avgAgeMs: 0, count: 0 },
        cortex: { avgAgeMs: 0, count: 0 },
      };
    }
  }

  /**
   * Get provenance coverage percentage
   */
  async getProvenanceCoverage(): Promise<number> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      // Count total API requests (from some tracking mechanism)
      // For now, estimate from lineage records
      const totalLineage = await db
        .select()
        .from(dataLineage)
        .where(gte(dataLineage.timestamp, oneHourAgo));
      
      // Coverage is 100% if we have lineage records with source metadata
      const withSourceMetadata = totalLineage.filter(record => 
        record.sourceTable && record.globalContextId
      );
      
      if (totalLineage.length === 0) return 100;
      return (withSourceMetadata.length / totalLineage.length) * 100;
    } catch (error) {
      console.error('[ProvenanceLogger] Failed to get coverage:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const provenanceLogger = new ProvenanceLogger();
export default provenanceLogger;
