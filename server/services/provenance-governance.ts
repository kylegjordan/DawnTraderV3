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
import { learningFragments } from '@shared/schema';
import { gte } from 'drizzle-orm';

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
    
    console.log('[ProvenanceGovernance] ✅ Report generated:');
    console.log(`  Freshness: BoB=${report.freshness.bob.status}, Cortex=${report.freshness.cortex.status}, Walter=${report.freshness.walter.status}`);
    console.log(`  Provenance Coverage: ${report.provenanceCoverage.toFixed(1)}%`);
    console.log(`  Learning Fragments (24h): ${report.learningFragments.total24h} (${report.learningFragments.byMode.live} live, ${report.learningFragments.byMode.paper} paper)`);
    console.log(`  SSOT Compliance: ${report.ssotCompliance.compliancePercentage.toFixed(1)}%`);
    
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
