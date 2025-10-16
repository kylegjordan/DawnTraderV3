/**
 * Phase 8.6.3: Provenance Governance & Reporting
 * 
 * Daily reports on:
 * - Freshness by layer (BoB/Cortex/Walter)
 * - Provenance coverage percentage
 * - Learning fragment capture stats
 * - SSOT compliance metrics
 */

import { provenanceLogger } from './provenance-logger';
import { schemaAuditService } from './schema-audit';
import { db } from '../db';
import { learningFragments, bobTraceLog, dataLineage } from '@shared/schema';
import { gte, count, sql } from 'drizzle-orm';

export interface GovernanceReport {
  timestamp: Date;
  freshness: {
    bob: { avgAgeMs: number; count: number; status: 'healthy' | 'stale' };
    cortex: { avgAgeMs: number; count: number; status: 'healthy' | 'stale' };
    walter: { avgAgeMs: number; count: number; status: 'healthy' | 'stale' };
  };
  provenanceCoverage: number; // percentage
  learningFragments: {
    total24h: number;
    byMode: { live: number; paper: number };
    discrepancies: number;
  };
  ssotCompliance: {
    tablesWithGlobalContext: number;
    tablesWithMode: number;
    compliancePercentage: number;
  };
  // Phase 8.6.4: BoB & Cortex Lineage Integration
  bobExecutionMetrics: {
    total24h: number;
    byModule: Record<string, number>;
    avgExecutionTimeMs: number;
  };
  cortexWriteCount24h: number;
  lineageContinuity: {
    totalTraces: number;
    completeChains: number;
    continuityPercentage: number;
    staleEventsPercentage: number;
  };
  summary: string;
  recommendations: string[];
}

class ProvenanceGovernanceService {
  /**
   * Get learning fragment stats for the last 24 hours
   */
  private async getLearningFragmentStats(): Promise<{
    total24h: number;
    byMode: { live: number; paper: number };
    discrepancies: number;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    try {
      const fragments = await db
        .select()
        .from(learningFragments)
        .where(gte(learningFragments.timestamp, oneDayAgo));
      
      const byMode = {
        live: fragments.filter(f => f.mode === 'live').length,
        paper: fragments.filter(f => f.mode === 'paper').length,
      };
      
      // Discrepancies would be events without fragments (requires Event Broker integration)
      // For now, return 0 as placeholder
      
      return {
        total24h: fragments.length,
        byMode,
        discrepancies: 0,
      };
    } catch (error) {
      console.error('[ProvenanceGovernance] Error getting learning fragment stats:', error);
      return {
        total24h: 0,
        byMode: { live: 0, paper: 0 },
        discrepancies: 0,
      };
    }
  }

  /**
   * Determine freshness status
   */
  private getFreshnessStatus(avgAgeMs: number): 'healthy' | 'stale' {
    // < 1 minute = healthy
    // 1-5 minutes = degraded (but still acceptable)
    // > 5 minutes = stale
    if (avgAgeMs < 60 * 1000) return 'healthy';
    if (avgAgeMs < 5 * 60 * 1000) return 'healthy'; // Still acceptable
    return 'stale';
  }

  /**
   * Phase 8.6.4: Get BoB execution metrics for last 24 hours
   */
  private async getBobExecutionMetrics(): Promise<{
    total24h: number;
    byModule: Record<string, number>;
    avgExecutionTimeMs: number;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    try {
      const traces = await db
        .select()
        .from(bobTraceLog)
        .where(gte(bobTraceLog.timestamp, oneDayAgo));
      
      const byModule: Record<string, number> = {};
      let totalExecutionTime = 0;
      
      traces.forEach(trace => {
        byModule[trace.bobModule] = (byModule[trace.bobModule] || 0) + 1;
        totalExecutionTime += trace.executionTimeMs || 0;
      });
      
      return {
        total24h: traces.length,
        byModule,
        avgExecutionTimeMs: traces.length > 0 ? totalExecutionTime / traces.length : 0,
      };
    } catch (error) {
      console.error('[ProvenanceGovernance] Error getting BoB execution metrics:', error);
      return { total24h: 0, byModule: {}, avgExecutionTimeMs: 0 };
    }
  }

  /**
   * Phase 8.6.4: Get Cortex write count for last 24 hours
   */
  private async getCortexWriteCount(): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    try {
      const result = await db
        .select({ count: count() })
        .from(dataLineage)
        .where(sql`${dataLineage.timestamp} >= ${oneDayAgo} AND ${dataLineage.originatingService} = 'cortex'`);
      
      return result[0]?.count || 0;
    } catch (error) {
      console.error('[ProvenanceGovernance] Error getting Cortex write count:', error);
      return 0;
    }
  }

  /**
   * Phase 8.6.4: Calculate lineage continuity percentage
   */
  private async getLineageContinuity(): Promise<{
    totalTraces: number;
    completeChains: number;
    continuityPercentage: number;
    staleEventsPercentage: number;
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    try {
      // Get all unique trace IDs in last 24h
      const traces = await db
        .select()
        .from(dataLineage)
        .where(gte(dataLineage.timestamp, oneDayAgo));
      
      const traceIds = [...new Set(traces.map(t => t.traceId))];
      const totalTraces = traceIds.length;
      
      // Count complete chains (traces with all 3 layers: Database -> BoB -> Cortex)
      let completeChains = 0;
      let staleEvents = 0;
      
      for (const traceId of traceIds) {
        const chain = traces.filter(t => t.traceId === traceId);
        const services = new Set(chain.map(t => t.originatingService));
        
        // Complete chain has database read, bob processing, and cortex cache
        // Using bob as indicator of BoB layer activity
        if (chain.some(t => t.sourceTable) && services.has('bob') && services.has('cortex')) {
          completeChains++;
        }
        
        // Check for stale events (>5 min old)
        const oldestEvent = Math.min(...chain.map(t => new Date(t.timestamp).getTime()));
        if (Date.now() - oldestEvent > 5 * 60 * 1000) {
          staleEvents++;
        }
      }
      
      return {
        totalTraces,
        completeChains,
        continuityPercentage: totalTraces > 0 ? (completeChains / totalTraces) * 100 : 100,
        staleEventsPercentage: totalTraces > 0 ? (staleEvents / totalTraces) * 100 : 0,
      };
    } catch (error) {
      console.error('[ProvenanceGovernance] Error calculating lineage continuity:', error);
      return {
        totalTraces: 0,
        completeChains: 0,
        continuityPercentage: 0,
        staleEventsPercentage: 0,
      };
    }
  }

  /**
   * Generate daily governance report
   */
  async generateDailyReport(): Promise<GovernanceReport> {
    console.log('[ProvenanceGovernance] Generating daily governance report...');
    
    // Get freshness stats from provenance logger
    const freshnessStats = await provenanceLogger.getFreshnessStats();
    
    // Get provenance coverage
    const provenanceCoverage = await provenanceLogger.getProvenanceCoverage();
    
    // Get learning fragment stats
    const learningStats = await this.getLearningFragmentStats();
    
    // Get SSOT compliance from schema audit
    const schemaAudit = await schemaAuditService.generateAuditReport();
    
    // Phase 8.6.4: Get new BoB, Cortex, and lineage metrics
    const bobMetrics = await this.getBobExecutionMetrics();
    const cortexWriteCount = await this.getCortexWriteCount();
    const lineageContinuity = await this.getLineageContinuity();
    
    const report: GovernanceReport = {
      timestamp: new Date(),
      freshness: {
        bob: {
          ...freshnessStats.bob,
          status: this.getFreshnessStatus(freshnessStats.bob.avgAgeMs),
        },
        cortex: {
          ...freshnessStats.cortex,
          status: this.getFreshnessStatus(freshnessStats.cortex.avgAgeMs),
        },
        walter: {
          ...freshnessStats.walter,
          status: this.getFreshnessStatus(freshnessStats.walter.avgAgeMs),
        },
      },
      provenanceCoverage,
      learningFragments: learningStats,
      ssotCompliance: schemaAudit.ssotCompliance,
      bobExecutionMetrics: bobMetrics,
      cortexWriteCount24h: cortexWriteCount,
      lineageContinuity,
      summary: '',
      recommendations: [],
    };
    
    // Generate summary
    const staleComponents = [
      report.freshness.bob.status === 'stale' ? 'BoB' : null,
      report.freshness.cortex.status === 'stale' ? 'Cortex' : null,
      report.freshness.walter.status === 'stale' ? 'Walter' : null,
    ].filter(Boolean);
    
    report.summary = staleComponents.length > 0
      ? `⚠️ ${staleComponents.join(', ')} showing stale data (>5min)`
      : '✅ All systems showing fresh data (<5min)';
    
    // Generate recommendations
    if (report.provenanceCoverage < 95) {
      report.recommendations.push(`Provenance coverage at ${report.provenanceCoverage.toFixed(1)}% - target is 95%+`);
    }
    
    if (report.ssotCompliance.compliancePercentage < 90) {
      report.recommendations.push(`SSOT compliance at ${report.ssotCompliance.compliancePercentage.toFixed(1)}% - add globalContextId to remaining tables`);
    }
    
    if (staleComponents.length > 0) {
      report.recommendations.push(`Investigate ${staleComponents.join(', ')} for data freshness issues`);
    }
    
    // Phase 8.6.4: Check lineage continuity targets
    if (report.lineageContinuity.continuityPercentage < 99) {
      report.recommendations.push(`Lineage continuity at ${report.lineageContinuity.continuityPercentage.toFixed(1)}% - target is ≥99%`);
    }
    
    if (report.lineageContinuity.staleEventsPercentage > 1) {
      report.recommendations.push(`Stale events at ${report.lineageContinuity.staleEventsPercentage.toFixed(1)}% - target is ≤1%`);
    }
    
    console.log('[ProvenanceGovernance] ✅ Report generated:');
    console.log(`  Freshness: BoB=${report.freshness.bob.status}, Cortex=${report.freshness.cortex.status}, Walter=${report.freshness.walter.status}`);
    console.log(`  Provenance Coverage: ${report.provenanceCoverage.toFixed(1)}%`);
    console.log(`  Learning Fragments (24h): ${report.learningFragments.total24h} (${report.learningFragments.byMode.live} live, ${report.learningFragments.byMode.paper} paper)`);
    console.log(`  SSOT Compliance: ${report.ssotCompliance.compliancePercentage.toFixed(1)}%`);
    console.log(`  BoB Executions (24h): ${report.bobExecutionMetrics.total24h} (avg ${report.bobExecutionMetrics.avgExecutionTimeMs.toFixed(1)}ms)`);
    console.log(`  Cortex Writes (24h): ${report.cortexWriteCount24h}`);
    console.log(`  Lineage Continuity: ${report.lineageContinuity.continuityPercentage.toFixed(1)}% (${report.lineageContinuity.staleEventsPercentage.toFixed(1)}% stale)`);
    
    return report;
  }

  /**
   * Save governance report to file
   */
  async saveReport(report: GovernanceReport, filePath: string = '/home/runner/workspace/reports/provenance-governance.json'): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Ensure reports directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Save report
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
    console.log(`[ProvenanceGovernance] Report saved to ${filePath}`);
  }

  /**
   * Check if any component is out of sync (> 5 min stale)
   */
  async getOutOfSyncComponents(): Promise<string[]> {
    const report = await this.generateDailyReport();
    const outOfSync: string[] = [];
    
    if (report.freshness.bob.status === 'stale') outOfSync.push('BoB');
    if (report.freshness.cortex.status === 'stale') outOfSync.push('Cortex');
    if (report.freshness.walter.status === 'stale') outOfSync.push('Walter');
    
    return outOfSync;
  }
}

// Export singleton instance
export const provenanceGovernance = new ProvenanceGovernanceService();
export default provenanceGovernance;
