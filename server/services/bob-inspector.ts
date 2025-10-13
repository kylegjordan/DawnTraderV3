/**
 * Bob Inspector Service - Phase 5.9
 * 
 * Performs targeted inspections of code, logs, data, and system state
 * Capabilities: Code reading, log search, data consistency checks, schema verification
 */

import { storage } from '../storage';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  BobInspectionCommand,
  BobInspectionReport,
  Finding,
  InspectionType
} from '@shared/diagnostic-schema';

export class BobInspector {
  /**
   * Execute an inspection command and return a detailed report
   */
  async executeInspection(command: BobInspectionCommand): Promise<BobInspectionReport> {
    console.log(`[Bob] 🔍 Starting inspection: ${command.inspectionType}`);
    console.log(`[Bob] Trigger: ${command.triggerType}, Priority: ${command.priority}`);

    try {
      let findings: Finding[] = [];

      switch (command.inspectionType) {
        case 'error_trace':
          findings = await this.inspectErrorTrace(command);
          break;
        case 'log_search':
          findings = await this.inspectLogs(command);
          break;
        case 'data_consistency':
          findings = await this.inspectDataConsistency(command);
          break;
        case 'schema_verification':
          findings = await this.inspectSchemaIntegrity(command);
          break;
        case 'code_analysis':
          findings = await this.inspectCode(command);
          break;
        case 'system_state':
          findings = await this.inspectSystemState(command);
          break;
        case 'frontend_health':
          findings = await this.inspectFrontendHealth(command);
          break;
        case 'ui_performance':
          findings = await this.inspectUIPerformance(command);
          break;
        case 'render_metrics':
          findings = await this.inspectRenderMetrics(command);
          break;
        default:
          findings = [{
            severity: 'medium',
            category: 'unsupported',
            description: `Inspection type '${command.inspectionType}' not yet implemented`
          }];
      }

      console.log(`[Bob] ✅ Inspection complete: ${findings.length} findings`);

      return {
        timestamp: new Date().toISOString(),
        triggerType: command.triggerType,
        triggerSource: command.triggerSource,
        inspectionType: command.inspectionType,
        findings,
        status: 'completed'
      };
    } catch (error) {
      console.error('[Bob] ❌ Inspection failed:', error);

      return {
        timestamp: new Date().toISOString(),
        triggerType: command.triggerType,
        triggerSource: command.triggerSource,
        inspectionType: command.inspectionType,
        findings: [],
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Inspect error logs and trace error patterns
   */
  private async inspectErrorTrace(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      // Get recent error logs
      const errorLogs = await storage.getErrorLogs(undefined, { limit: 50 });
      const unresolved = errorLogs.filter(log => !log.resolved);

      if (unresolved.length > 0) {
        findings.push({
          severity: 'high',
          category: 'unresolved_errors',
          description: `Found ${unresolved.length} unresolved errors in system`,
          evidence: {
            count: unresolved.length,
            types: [...new Set(unresolved.map(e => e.errorType))],
            recent: unresolved.slice(0, 3).map(e => ({
              type: e.errorType,
              message: e.errorMessage?.substring(0, 100),
              timestamp: e.timestamp
            }))
          },
          suggestedAction: 'Review and resolve error logs via /api/ai/error-logs'
        });
      }

      // Check for recurring error patterns
      const errorPatterns = new Map<string, number>();
      errorLogs.forEach(log => {
        const pattern = log.errorType || 'unknown';
        errorPatterns.set(pattern, (errorPatterns.get(pattern) || 0) + 1);
      });

      errorPatterns.forEach((count, pattern) => {
        if (count >= 3) {
          findings.push({
            severity: count >= 10 ? 'critical' : count >= 5 ? 'high' : 'medium',
            category: 'recurring_error',
            description: `Recurring error pattern detected: ${pattern} (${count} occurrences)`,
            evidence: { pattern, count },
            suggestedAction: 'Investigate root cause and implement fix'
          });
        }
      });

    } catch (error) {
      findings.push({
        severity: 'medium',
        category: 'inspection_error',
        description: 'Failed to inspect error logs',
        evidence: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return findings;
  }

  /**
   * Search and analyze transparency and system logs
   */
  private async inspectLogs(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const { keywords, logLevel, userId } = command.searchCriteria || {};

      // Check transparency logs for task failures
      const transparencyLogs = await storage.getTransparencyLogs({ limit: 100 });
      const failedTasks = transparencyLogs.filter(log => !log.success);

      if (failedTasks.length > 0) {
        const taskFailures = new Map<string, number>();
        failedTasks.forEach(task => {
          taskFailures.set(task.taskName, (taskFailures.get(task.taskName) || 0) + 1);
        });

        taskFailures.forEach((count, taskName) => {
          findings.push({
            severity: count >= 3 ? 'high' : 'medium',
            category: 'task_failure',
            description: `Task '${taskName}' failed ${count} time(s)`,
            evidence: {
              taskName,
              failureCount: count,
              recentFailures: failedTasks
                .filter(t => t.taskName === taskName)
                .slice(0, 2)
                .map(t => ({ timestamp: t.executedAt, notes: t.notes }))
            },
            suggestedAction: 'Review task implementation and error handling'
          });
        });
      }

    } catch (error) {
      findings.push({
        severity: 'low',
        category: 'inspection_error',
        description: 'Log inspection encountered errors',
        evidence: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return findings;
  }

  /**
   * Check data consistency across related tables
   */
  private async inspectDataConsistency(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      // Check for orphaned trades (trades without valid user references)
      const orphanedTrades = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM trades t 
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id)
      `);
      
      const orphanCount = parseInt((orphanedTrades.rows[0] as any)?.count || '0');
      if (orphanCount > 0) {
        findings.push({
          severity: 'high',
          category: 'data_integrity',
          description: `Found ${orphanCount} orphaned trade records`,
          location: { table: 'trades' },
          evidence: { orphanedCount: orphanCount },
          suggestedAction: 'Clean up orphaned records or restore missing user references'
        });
      }

      // Check for trades with invalid status transitions
      const invalidStatusTrades = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM trades 
        WHERE trade_status NOT IN ('open', 'closed', 'cancelled', 'pending')
      `);
      
      const invalidCount = parseInt((invalidStatusTrades.rows[0] as any)?.count || '0');
      if (invalidCount > 0) {
        findings.push({
          severity: 'medium',
          category: 'data_validation',
          description: `Found ${invalidCount} trades with invalid status values`,
          location: { table: 'trades', column: 'trade_status' },
          suggestedAction: 'Update invalid statuses to valid enum values'
        });
      }

    } catch (error) {
      findings.push({
        severity: 'low',
        category: 'inspection_error',
        description: 'Data consistency check failed',
        evidence: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return findings;
  }

  /**
   * Verify database schema integrity
   */
  private async inspectSchemaIntegrity(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      // Check for missing critical tables
      const requiredTables = [
        'users', 'trades', 'trading_settings', 'watchlist_pairs',
        'ai_transparency_log', 'error_logs', 'walter_memory'
      ];

      for (const tableName of requiredTables) {
        const tableExists = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = ${tableName}
          ) as exists
        `);

        const exists = (tableExists.rows[0] as any)?.exists;
        if (!exists) {
          findings.push({
            severity: 'critical',
            category: 'schema_missing',
            description: `Critical table '${tableName}' not found in database`,
            location: { table: tableName },
            suggestedAction: 'Run database migrations to create missing table'
          });
        }
      }

    } catch (error) {
      findings.push({
        severity: 'medium',
        category: 'inspection_error',
        description: 'Schema verification failed',
        evidence: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return findings;
  }

  /**
   * Analyze code files for potential issues
   */
  private async inspectCode(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      const { files = [] } = command.searchScope || {};
      
      if (files.length === 0) {
        findings.push({
          severity: 'info',
          category: 'code_analysis',
          description: 'No specific files provided for code analysis',
          suggestedAction: 'Specify files in searchScope.files array'
        });
        return findings;
      }

      for (const filePath of files) {
        try {
          const fullPath = path.join(process.cwd(), filePath);
          const content = await fs.readFile(fullPath, 'utf-8');

          // Check for common issues
          if (content.includes('console.log') && filePath.includes('client/')) {
            findings.push({
              severity: 'low',
              category: 'code_quality',
              description: 'Console.log statements found in client code',
              location: { file: filePath },
              suggestedAction: 'Remove debug console.log statements before production'
            });
          }

          if (content.includes('TODO') || content.includes('FIXME')) {
            const todoCount = (content.match(/TODO|FIXME/g) || []).length;
            findings.push({
              severity: 'info',
              category: 'code_maintenance',
              description: `Found ${todoCount} TODO/FIXME comment(s) in ${filePath}`,
              location: { file: filePath },
              suggestedAction: 'Address pending TODO items'
            });
          }

        } catch (fileError) {
          findings.push({
            severity: 'low',
            category: 'file_access',
            description: `Could not read file: ${filePath}`,
            evidence: { error: fileError instanceof Error ? fileError.message : String(fileError) }
          });
        }
      }

    } catch (error) {
      findings.push({
        severity: 'low',
        category: 'inspection_error',
        description: 'Code analysis failed',
        evidence: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return findings;
  }

  /**
   * Inspect current system state and health
   */
  private async inspectSystemState(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      // Check database connectivity
      try {
        await db.execute(sql`SELECT 1`);
        findings.push({
          severity: 'info',
          category: 'system_health',
          description: 'Database connection is healthy'
        });
      } catch (dbError) {
        findings.push({
          severity: 'critical',
          category: 'system_health',
          description: 'Database connection failed',
          evidence: { error: dbError instanceof Error ? dbError.message : String(dbError) },
          suggestedAction: 'Check database configuration and connectivity'
        });
      }

      // Check for recent user activity
      const users = await storage.getAllUsers();
      const activeUsers = users.filter(u => u.tradingStatus === 'active');

      if (activeUsers.length > 0) {
        findings.push({
          severity: 'info',
          category: 'system_state',
          description: `${activeUsers.length} user(s) with active trading`,
          evidence: { 
            activeCount: activeUsers.length,
            modes: activeUsers.map(u => ({ id: u.id, mode: u.tradingMode }))
          }
        });
      }

    } catch (error) {
      findings.push({
        severity: 'medium',
        category: 'inspection_error',
        description: 'System state inspection failed',
        evidence: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return findings;
  }

  /**
   * Inspect frontend health (Phase 6.0 Addendum A)
   * Checks build status, bundle size, component health, theme integrity
   */
  private async inspectFrontendHealth(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    try {
      // Check frontend build artifacts
      try {
        const distPath = path.join(process.cwd(), 'dist');
        const distExists = await fs.access(distPath).then(() => true).catch(() => false);
        
        if (distExists) {
          findings.push({
            severity: 'info',
            category: 'frontend_health',
            description: 'Frontend build artifacts present',
            location: { file: 'dist/' }
          });
        } else {
          findings.push({
            severity: 'low',
            category: 'frontend_health',
            description: 'Frontend build artifacts not found (may not be built yet)',
            location: { file: 'dist/' },
            suggestedAction: 'Run npm run build to generate production artifacts'
          });
        }
      } catch (error) {
        findings.push({
          severity: 'low',
          category: 'frontend_health',
          description: 'Unable to check frontend build status',
          evidence: { error: error instanceof Error ? error.message : String(error) }
        });
      }

      // Check theme configuration
      try {
        const cssPath = path.join(process.cwd(), 'client/src/index.css');
        const cssContent = await fs.readFile(cssPath, 'utf-8');
        
        const hslColorPattern = /hsl\(\d+,\s*[\d.]+%,\s*[\d.]+%\)/g;
        const hslMatches = cssContent.match(hslColorPattern);
        
        if (hslMatches && hslMatches.length > 0) {
          findings.push({
            severity: 'info',
            category: 'theme_integrity',
            description: `Theme uses HSL color format correctly (${hslMatches.length} color variables found)`,
            location: { file: 'client/src/index.css' }
          });
        }

        const darkModePattern = /\.dark\s*{/g;
        const hasDarkMode = darkModePattern.test(cssContent);
        
        if (hasDarkMode) {
          findings.push({
            severity: 'info',
            category: 'theme_integrity',
            description: 'Dark mode theme configuration detected',
            location: { file: 'client/src/index.css' }
          });
        } else {
          findings.push({
            severity: 'medium',
            category: 'theme_integrity',
            description: 'Dark mode configuration may be incomplete',
            location: { file: 'client/src/index.css' },
            suggestedAction: 'Ensure .dark class styles are defined for dark mode support'
          });
        }
      } catch (error) {
        findings.push({
          severity: 'low',
          category: 'theme_integrity',
          description: 'Unable to verify theme configuration',
          evidence: { error: error instanceof Error ? error.message : String(error) }
        });
      }

      // Check component structure
      try {
        const componentsPath = path.join(process.cwd(), 'client/src/components');
        const componentFiles = await fs.readdir(componentsPath, { recursive: true });
        const tsxFiles = componentFiles.filter(f => typeof f === 'string' && f.endsWith('.tsx'));
        
        findings.push({
          severity: 'info',
          category: 'component_health',
          description: `${tsxFiles.length} component files registered`,
          location: { file: 'client/src/components/' },
          evidence: { componentCount: tsxFiles.length }
        });
      } catch (error) {
        findings.push({
          severity: 'low',
          category: 'component_health',
          description: 'Unable to scan component directory',
          evidence: { error: error instanceof Error ? error.message : String(error) }
        });
      }

    } catch (error) {
      findings.push({
        severity: 'medium',
        category: 'inspection_error',
        description: 'Frontend health inspection failed',
        evidence: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return findings;
  }

  /**
   * Inspect UI performance metrics (Phase 6.0 Addendum A)
   * Currently placeholder for future browser metric integration
   */
  private async inspectUIPerformance(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    findings.push({
      severity: 'info',
      category: 'ui_performance',
      description: 'UI performance monitoring is prepared for future browser metrics integration',
      suggestedAction: 'Metrics like LCP, FCP, CLS will be collected when browser reporting is enabled'
    });

    // Future: Will integrate with browser performance APIs
    // - Largest Contentful Paint (LCP)
    // - First Contentful Paint (FCP)
    // - Cumulative Layout Shift (CLS)
    // - First Input Delay (FID)
    // - Time to First Byte (TTFB)

    return findings;
  }

  /**
   * Inspect render metrics (Phase 6.0 Addendum A)
   * Currently placeholder for future render performance analysis
   */
  private async inspectRenderMetrics(command: BobInspectionCommand): Promise<Finding[]> {
    const findings: Finding[] = [];

    findings.push({
      severity: 'info',
      category: 'render_metrics',
      description: 'Render metrics inspection is prepared for future integration',
      suggestedAction: 'Will track component render times, re-render counts, and bundle size when metrics are available'
    });

    // Future: Will analyze:
    // - Component render performance
    // - Bundle size and code splitting effectiveness
    // - React error boundaries and component failures
    // - Console errors and warnings

    return findings;
  }
}

// Export singleton instance
export const bobInspector = new BobInspector();
