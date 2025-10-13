/**
 * Walter Knowledge Refresh Service - Phase 6.0
 * 
 * Weekly automated routine that:
 * 1. Scans Bob's logs for new files, schema updates, structural changes
 * 2. Updates Walter's corpus with newly detected elements
 * 3. Bob summarizes changes every 7 days for Walter
 */

import { storage } from '../storage';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WALTER_EXPERT_CORPUS, getAllArtifacts } from './walter-expert-corpus';

export interface KnowledgeRefreshReport {
  timestamp: string;
  weekNumber: number;
  newFiles: string[];
  modifiedFiles: string[];
  newTables: string[];
  schemaChanges: string[];
  newServices: string[];
  summary: string;
  updatesCount: number;
}

export class WalterKnowledgeRefresh {
  private lastScanTimestamp: Date | null = null;
  private knownArtifacts: Set<string> = new Set();

  constructor() {
    // Initialize with current corpus artifacts
    this.knownArtifacts = new Set(getAllArtifacts());
  }

  /**
   * Run weekly knowledge refresh scan
   */
  async runWeeklyScan(userId: string): Promise<KnowledgeRefreshReport> {
    console.log('[WalterKnowledge] 📚 Starting weekly knowledge refresh scan...');

    const timestamp = new Date();
    const weekNumber = this.getWeekNumber(timestamp);

    const report: KnowledgeRefreshReport = {
      timestamp: timestamp.toISOString(),
      weekNumber,
      newFiles: [],
      modifiedFiles: [],
      newTables: [],
      schemaChanges: [],
      newServices: [],
      summary: '',
      updatesCount: 0
    };

    try {
      // Scan for new services
      const newServices = await this.scanForNewServices();
      report.newServices = newServices;

      // Scan for schema changes
      const schemaChanges = await this.scanForSchemaChanges();
      report.schemaChanges = schemaChanges;

      // Scan for new files in key directories
      const newFiles = await this.scanForNewFiles();
      report.newFiles = newFiles;

      // Generate summary
      report.updatesCount = report.newFiles.length + report.newServices.length + report.schemaChanges.length;
      report.summary = this.generateSummary(report);

      // Log to transparency
      await this.logRefreshToTransparency(userId, report);

      // Update last scan timestamp
      this.lastScanTimestamp = timestamp;

      console.log(`[WalterKnowledge] ✅ Scan complete: ${report.updatesCount} updates found`);
      
      return report;
    } catch (error) {
      console.error('[WalterKnowledge] ❌ Scan failed:', error);
      
      report.summary = `Knowledge refresh scan failed: ${error instanceof Error ? error.message : String(error)}`;
      return report;
    }
  }

  /**
   * Scan for new service files
   */
  private async scanForNewServices(): Promise<string[]> {
    const newServices: string[] = [];
    
    try {
      const servicesPath = path.join(process.cwd(), 'server/services');
      const files = await fs.readdir(servicesPath);
      
      for (const file of files) {
        if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
          const servicePath = `server/services/${file}`;
          if (!this.knownArtifacts.has(servicePath)) {
            newServices.push(servicePath);
            this.knownArtifacts.add(servicePath);
          }
        }
      }
    } catch (error) {
      console.error('[WalterKnowledge] Error scanning services:', error);
    }

    return newServices;
  }

  /**
   * Scan for schema changes
   */
  private async scanForSchemaChanges(): Promise<string[]> {
    const changes: string[] = [];
    
    try {
      const schemaPath = path.join(process.cwd(), 'shared/schema.ts');
      const schemaContent = await fs.readFile(schemaPath, 'utf-8');
      
      // Extract table definitions
      const tableRegex = /export const (\w+) = pgTable\("(\w+)"/g;
      let match;
      
      while ((match = tableRegex.exec(schemaContent)) !== null) {
        const tableName = match[2];
        const artifactName = `shared/schema.ts (${tableName} table)`;
        
        if (!this.knownArtifacts.has(artifactName)) {
          changes.push(`New table: ${tableName}`);
          this.knownArtifacts.add(artifactName);
        }
      }
    } catch (error) {
      console.error('[WalterKnowledge] Error scanning schema:', error);
    }

    return changes;
  }

  /**
   * Scan for new files in critical directories
   */
  private async scanForNewFiles(): Promise<string[]> {
    const newFiles: string[] = [];
    const criticalDirs = [
      'server/services',
      'client/src/pages',
      'client/src/components',
      'shared'
    ];

    for (const dir of criticalDirs) {
      try {
        const dirPath = path.join(process.cwd(), dir);
        const files = await fs.readdir(dirPath, { recursive: false });
        
        for (const file of files) {
          if (typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
            const filePath = `${dir}/${file}`;
            if (!this.knownArtifacts.has(filePath)) {
              newFiles.push(filePath);
              this.knownArtifacts.add(filePath);
            }
          }
        }
      } catch (error) {
        // Directory might not exist, skip
      }
    }

    return newFiles;
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(report: KnowledgeRefreshReport): string {
    if (report.updatesCount === 0) {
      return `Week ${report.weekNumber}: No structural changes detected. System architecture remains stable.`;
    }

    const parts: string[] = [`Week ${report.weekNumber} knowledge refresh:`];

    if (report.newServices.length > 0) {
      parts.push(`${report.newServices.length} new service(s): ${report.newServices.map(s => path.basename(s, '.ts')).join(', ')}`);
    }

    if (report.schemaChanges.length > 0) {
      parts.push(`${report.schemaChanges.length} schema change(s): ${report.schemaChanges.join(', ')}`);
    }

    if (report.newFiles.length > 0) {
      parts.push(`${report.newFiles.length} new file(s) detected in critical directories`);
    }

    parts.push(`Walter's knowledge base has been updated with ${report.updatesCount} new element(s).`);

    return parts.join(' • ');
  }

  /**
   * Log refresh to transparency table
   */
  private async logRefreshToTransparency(userId: string, report: KnowledgeRefreshReport): Promise<void> {
    try {
      await storage.createTransparencyLog({
        userId,
        taskName: 'Knowledge Refresh',
        resultSummary: report.summary,
        success: true,
        notes: JSON.stringify({
          weekNumber: report.weekNumber,
          updatesCount: report.updatesCount,
          newServices: report.newServices,
          schemaChanges: report.schemaChanges,
          newFiles: report.newFiles.slice(0, 10) // Limit to first 10 for brevity
        })
      });
    } catch (error) {
      console.error('[WalterKnowledge] Failed to log to transparency:', error);
    }
  }

  /**
   * Get week number of year
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Check if weekly scan is due
   */
  isDueScan(): boolean {
    if (!this.lastScanTimestamp) return true;

    const now = new Date();
    const daysSinceLastScan = (now.getTime() - this.lastScanTimestamp.getTime()) / (1000 * 60 * 60 * 24);
    
    return daysSinceLastScan >= 7;
  }

  /**
   * Get last scan info
   */
  getLastScanInfo(): { timestamp: string | null; weekNumber: number | null } {
    return {
      timestamp: this.lastScanTimestamp?.toISOString() || null,
      weekNumber: this.lastScanTimestamp ? this.getWeekNumber(this.lastScanTimestamp) : null
    };
  }
}

// Export singleton instance
export const walterKnowledgeRefresh = new WalterKnowledgeRefresh();

/**
 * Schedule weekly knowledge refresh
 * This can be called from a cron job or scheduled task
 */
export async function scheduleKnowledgeRefresh(userId: string): Promise<void> {
  if (walterKnowledgeRefresh.isDueScan()) {
    console.log('[WalterKnowledge] 📅 Weekly scan is due, running now...');
    const report = await walterKnowledgeRefresh.runWeeklyScan(userId);
    console.log(`[WalterKnowledge] 📊 ${report.summary}`);
  } else {
    const lastScan = walterKnowledgeRefresh.getLastScanInfo();
    console.log(`[WalterKnowledge] ⏭️ Last scan: ${lastScan.timestamp}, next scan due in ${7 - Math.floor((Date.now() - new Date(lastScan.timestamp!).getTime()) / (1000 * 60 * 60 * 24))} days`);
  }
}
