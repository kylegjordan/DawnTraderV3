/**
 * Phase 8.6.3: Schema Audit Service
 * 
 * Cross-references database tables against schema.ts
 * Classifies tables as Active, Legacy, or Orphaned
 * Generates comprehensive audit reports
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as schema from '@shared/schema';

export type TableClassification = 'active' | 'legacy' | 'orphaned';

export interface TableAuditEntry {
  tableName: string;
  classification: TableClassification;
  inSchema: boolean;
  rowCount: number;
  sizeBytes?: number;
  lastModified?: Date;
  hasGlobalContextId: boolean;
  hasMode: boolean;
  metadata?: Record<string, any>;
}

export interface SchemaAuditReport {
  timestamp: Date;
  totalTables: number;
  active: number;
  legacy: number;
  orphaned: number;
  tables: TableAuditEntry[];
  ssotCompliance: {
    tablesWithGlobalContext: number;
    tablesWithMode: number;
    compliancePercentage: number;
  };
}

class SchemaAuditService {
  /**
   * Get all tables from the database
   */
  private async getAllDatabaseTables(): Promise<string[]> {
    const result = await db.execute<{ table_name: string }>(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    return result.rows.map(row => row.table_name);
  }

  /**
   * Get all tables defined in schema.ts
   */
  private getAllSchemaTables(): string[] {
    const schemaTables: string[] = [];
    
    for (const [key, value] of Object.entries(schema)) {
      // Check if this is a Drizzle table object
      if (value && typeof value === 'object' && 'getSQL' in value) {
        // Extract table name from the table definition
        const tableName = (value as any)[Symbol.for('drizzle:Name')] || key;
        schemaTables.push(tableName);
      }
    }
    
    return schemaTables;
  }

  /**
   * Get row count for a table
   */
  private async getTableRowCount(tableName: string): Promise<number> {
    try {
      const result = await db.execute<{ count: string }>(sql`
        SELECT COUNT(*) as count FROM ${sql.identifier(tableName)}
      `);
      return parseInt(result.rows[0]?.count || '0');
    } catch (error) {
      console.error(`[SchemaAudit] Error getting row count for ${tableName}:`, error);
      return 0;
    }
  }

  /**
   * Check if table has globalContextId column
   */
  private async hasGlobalContextIdColumn(tableName: string): Promise<boolean> {
    try {
      const result = await db.execute<{ column_name: string }>(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = ${tableName}
          AND column_name = 'global_context_id'
      `);
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if table has mode column
   */
  private async hasModeColumn(tableName: string): Promise<boolean> {
    try {
      const result = await db.execute<{ column_name: string }>(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = ${tableName}
          AND column_name = 'mode'
      `);
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get table metadata
   */
  private async getTableMetadata(tableName: string): Promise<{ size?: number; lastModified?: Date }> {
    try {
      const result = await db.execute<{ pg_total_relation_size: string }>(sql`
        SELECT pg_total_relation_size(${tableName}) as pg_total_relation_size
      `);
      
      const size = parseInt(result.rows[0]?.pg_total_relation_size || '0');
      
      return { size };
    } catch (error) {
      return {};
    }
  }

  /**
   * Classify a table
   */
  private classifyTable(tableName: string, inSchema: boolean, isOrphaned: boolean): TableClassification {
    // All tables currently in schema.ts are considered active
    if (inSchema) {
      return 'active';
    }
    
    // Tables not in schema are orphaned
    if (isOrphaned) {
      return 'orphaned';
    }
    
    // This shouldn't happen with current logic, but keeping for future use
    return 'legacy';
  }

  /**
   * Generate comprehensive schema audit report
   */
  async generateAuditReport(): Promise<SchemaAuditReport> {
    console.log('[SchemaAudit] Generating comprehensive schema audit report...');
    
    const dbTables = await this.getAllDatabaseTables();
    const schemaTables = this.getAllSchemaTables();
    
    const schemaTableSet = new Set(schemaTables);
    const tableAudits: TableAuditEntry[] = [];
    
    let tablesWithGlobalContext = 0;
    let tablesWithMode = 0;
    
    for (const tableName of dbTables) {
      const inSchema = schemaTableSet.has(tableName);
      const isOrphaned = !inSchema;
      
      const rowCount = await this.getTableRowCount(tableName);
      const hasGlobalContextId = await this.hasGlobalContextIdColumn(tableName);
      const hasMode = await this.hasModeColumn(tableName);
      const metadata = await this.getTableMetadata(tableName);
      
      if (hasGlobalContextId) tablesWithGlobalContext++;
      if (hasMode) tablesWithMode++;
      
      tableAudits.push({
        tableName,
        classification: this.classifyTable(tableName, inSchema, isOrphaned),
        inSchema,
        rowCount,
        sizeBytes: metadata.size,
        lastModified: metadata.lastModified,
        hasGlobalContextId,
        hasMode,
        metadata,
      });
    }
    
    const report: SchemaAuditReport = {
      timestamp: new Date(),
      totalTables: dbTables.length,
      active: tableAudits.filter(t => t.classification === 'active').length,
      legacy: tableAudits.filter(t => t.classification === 'legacy').length,
      orphaned: tableAudits.filter(t => t.classification === 'orphaned').length,
      tables: tableAudits,
      ssotCompliance: {
        tablesWithGlobalContext,
        tablesWithMode,
        compliancePercentage: (tablesWithGlobalContext / dbTables.length) * 100,
      },
    };
    
    console.log('[SchemaAudit] ✅ Audit report generated:');
    console.log(`  Total tables: ${report.totalTables}`);
    console.log(`  🟢 Active: ${report.active}`);
    console.log(`  🟡 Legacy: ${report.legacy}`);
    console.log(`  🔴 Orphaned: ${report.orphaned}`);
    console.log(`  SSOT Compliance: ${report.ssotCompliance.compliancePercentage.toFixed(1)}%`);
    
    return report;
  }

  /**
   * Save audit report to file
   */
  async saveAuditReport(report: SchemaAuditReport, filePath: string = '/home/runner/workspace/reports/schema-audit.json'): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Ensure reports directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Save report
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
    console.log(`[SchemaAudit] Report saved to ${filePath}`);
  }

  /**
   * Get tables that need legacy quarantine
   */
  async getTablesForQuarantine(): Promise<string[]> {
    const report = await this.generateAuditReport();
    return report.tables
      .filter(t => t.classification === 'orphaned' || t.classification === 'legacy')
      .map(t => t.tableName);
  }
}

// Export singleton instance
export const schemaAuditService = new SchemaAuditService();
export default schemaAuditService;
