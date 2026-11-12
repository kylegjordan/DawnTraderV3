import cron from 'node-cron';
import { FormulaAuditService } from '../services/formula-audit';
import { AlertsService } from '../services/alerts-service';
import { storage } from '../storage';
import * as fs from 'fs';
import * as path from 'path';
import { countedMetaFromReport, type AuditResultView } from '../services/formula-audit-view';
import { cronRegistry } from '../services/cron-registry.js';
import { logCronArm } from '../services/cron-arm-logger.js';
import { cronOccurrenceRunner } from '../services/cron-occurrence-runner.js';

const SCHEDULE = process.env.FORMULA_AUDIT_SCHEDULE || '0 3 * * *'; // Default: UTC 03:00
const ENABLED = process.env.FORMULA_AUDIT_ENABLED !== 'false'; // Enabled by default
const JOB_NAME = 'formula_audit_cron';

const formulaAuditService = new FormulaAuditService();

/**
 * B-FORMULA-HEALTH-AUDIT-FRESHNESS (row 59g1a): the last admin manual run, held since this process started.
 * Losing it on a restart is correct — it is not the scheduled record (that lives in the fire row's `meta`).
 * Read by GET /api/system/formula-audit through `resolveFormulaAuditView`.
 */
let lastManualAudit: AuditResultView | null = null;
export function getLastManualFormulaAudit(): AuditResultView | null {
  return lastManualAudit;
}

/**
 * Clean up old audit reports (older than 7 days)
 */
function cleanupOldReports() {
  try {
    const tmpDir = '/tmp';
    const files = fs.readdirSync(tmpDir);
    const auditFiles = files.filter(f => f.startsWith('audit_report_') && f.endsWith('.txt'));
    
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let deletedCount = 0;
    
    for (const file of auditFiles) {
      const filePath = path.join(tmpDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < sevenDaysAgo) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`[FORMULA-AUDIT] 🧹 Cleaned up ${deletedCount} old report(s)`);
    }
  } catch (error: any) {
    console.error('[FORMULA-AUDIT] ⚠️ Cleanup error:', error.message);
  }
}

/**
 * Validate report file integrity
 */
function validateReportFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      console.error('[FORMULA-AUDIT] ❌ Report file does not exist:', filePath);
      return false;
    }
    
    const stats = fs.statSync(filePath);
    
    // Check if file is non-empty
    if (stats.size === 0) {
      console.error('[FORMULA-AUDIT] ❌ Report file is empty:', filePath);
      return false;
    }
    
    // Check if timestamp is within 24 hours
    const hoursSinceCreation = (Date.now() - stats.mtimeMs) / (60 * 60 * 1000);
    if (hoursSinceCreation > 24) {
      console.warn('[FORMULA-AUDIT] ⚠️ Report file is older than 24 hours:', filePath);
      return false;
    }
    
    console.log(`[FORMULA-AUDIT] ✅ Report file validated: ${filePath} (${(stats.size / 1024).toFixed(2)} KB)`);
    return true;
  } catch (error: any) {
    console.error('[FORMULA-AUDIT] ❌ Report validation error:', error.message);
    return false;
  }
}

/**
 * Create system notification for formula deviations
 */
async function createAlertNotification(formulaName: string, deviation: number, status: 'WARNING' | 'FAIL') {
  try {
    // Get all admin users
    const users = await storage.getAllUsers();
    const adminUsers = users.filter(u => u.isAdmin);
    
    // Set severity based on status: FAIL = critical, WARNING = warning
    const severity = status === 'FAIL' ? 'critical' : 'warning';
    const category = status === 'FAIL' ? 'critical' : 'actionable';
    const message = status === 'FAIL' 
      ? `Formula Audit FAILURE — ${formulaName} deviated ${deviation.toFixed(2)}% (≥1%)`
      : `Formula Audit Warning — ${formulaName} deviated ${deviation.toFixed(2)}% (0.1-1%)`;
    
    // Create alerts for each admin user (existing AlertsService flow)
    for (const admin of adminUsers) {
      await AlertsService.createAlert({
        userId: admin.id,
        mode: 'paper',
        alertType: 'formula_audit',
        severity,
        category,
        message,
        metadata: { formulaName, deviation, status }
      });
      
      await AlertsService.createAlert({
        userId: admin.id,
        mode: 'live',
        alertType: 'formula_audit',
        severity,
        category,
        message,
        metadata: { formulaName, deviation, status }
      });
    }
    
    console.log(`[ALERT] Formula ${status.toLowerCase()} detected in ${formulaName} (${deviation.toFixed(2)}%)`);
    
  } catch (error: any) {
    console.error('[FORMULA-AUDIT] ❌ Alert creation error:', error.message);
  }
}

/**
 * Run formula audit and handle results
 */
export async function runFormulaAudit(runType: 'scheduled' | 'manual' = 'scheduled'): Promise<any> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  console.log(`[FORMULA-AUDIT] ${runType === 'scheduled' ? '⏰' : '🔍'} Starting ${runType} audit at ${timestamp}...`);
  
  try {
    // Run the audit
    const report = await formulaAuditService.runAudit();
    
    // Generate dated filename
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    let reportPath: string | null = `/tmp/audit_report_${dateStr}.txt`;
    let reportWriteError: string | undefined;

    // Also create/update a "latest" symlink-style file
    const latestPath = '/tmp/audit_report_latest.txt';

    // B-FORMULA-HEALTH-AUDIT-FRESHNESS (row 59g1a): the text-file writes are an operator convenience. A failure here
    // is logged and the audit's result is still returned — before this, a write failure booked a completed audit as
    // an error and discarded it. The span covers the summary join, both writes and the validation, so nothing between
    // the audit and the return can throw.
    try {
      const textReport = report.summary.join('\n');
      fs.writeFileSync(reportPath, textReport);
      fs.writeFileSync(latestPath, textReport);
      validateReportFile(reportPath);
    } catch (writeErr: any) {
      reportWriteError = writeErr?.message ?? String(writeErr);
      console.error('[FORMULA-AUDIT] ⚠️ Report file write failed (the audit result is kept):', reportWriteError);
      reportPath = null;
    }

    // Log completion
    const duration = Date.now() - startTime;
    console.log(`[FORMULA-AUDIT] completed in ${duration}ms PASS=${report.passed} WARNING=${report.warnings} FAIL=${report.failed}`);
    
    // Check for failures and warnings (≥0.1% deviation per spec)
    for (const test of report.tests) {
      if (test.status === 'WARNING' || test.status === 'FAIL') {
        await createAlertNotification(test.name, test.deviationPercent, test.status);
      }
    }
    
    // TODO: Add auto-resolve for formulas that recovered from WARNING/FAIL to PASS
    // Requires tracking previous audit state to avoid spurious resolutions
    // This will be implemented in a future phase with proper state management
    
    // Cleanup old reports
    cleanupOldReports();
    
    if (runType === 'manual') {
      lastManualAudit = {
        timestamp: report.timestamp,
        totalFormulas: report.totalFormulas,
        passed: report.passed,
        warnings: report.warnings,
        failed: report.failed,
        tests: report.tests.map((t) => ({ name: t.name, status: t.status, deviationPercent: t.deviationPercent })),
      };
    }

    return {
      ...report,
      runType,
      timestamp,
      reportPath,
      ...(reportWriteError ? { reportWriteError } : {}),
      duration
    };
  } catch (error: any) {
    console.error('[FORMULA-AUDIT] ❌ Audit failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Register the formula audit cron job
 */
export async function registerFormulaAuditJob(): Promise<void> {
  if (!ENABLED) {
    console.log('[FormulaAuditJob] ❌ Disabled via FORMULA_AUDIT_ENABLED env');
    return;
  }

  console.log(`[FormulaAuditJob] ⏰ Scheduling daily audit: ${SCHEDULE} (UTC)`);

  const _task = cron.createTask(SCHEDULE, async (context) => {
    await cronOccurrenceRunner.runNatural(JOB_NAME, context.date);
  }, {
    timezone: 'Etc/UTC'
  });

  cronRegistry.register({
    name: JOB_NAME,
    task: _task,
    expression: SCHEDULE,
    timezone: 'Etc/UTC',
    intervalSeconds: 86400,
    enabled: true,
    recovery: {
      policyKey: JOB_NAME,
      run: async () => {
        const result = await runFormulaAudit('scheduled');
        return { meta: { ...countedMetaFromReport(result) } };
      },
    },
  });
  _task.on('execution:missed', (context) => {
    cronOccurrenceRunner.dispatchMissed(JOB_NAME, context.date);
  });
  await cronOccurrenceRunner.prepareJob(JOB_NAME);
  _task.start();
  console.log('[FormulaAuditJob] ✅ Job registered after startup reconciliation (timezone: UTC)');
  logCronArm(cronRegistry.get(JOB_NAME)!);
}
