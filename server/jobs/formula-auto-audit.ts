import cron from 'node-cron';
import { FormulaAuditService } from '../services/formula-audit';
import { AlertsService } from '../services/alerts-service';
import { storage } from '../storage';
import * as fs from 'fs';
import * as path from 'path';

const SCHEDULE = process.env.FORMULA_AUDIT_SCHEDULE || '0 3 * * *'; // Default: UTC 03:00
const ENABLED = process.env.FORMULA_AUDIT_ENABLED !== 'false'; // Enabled by default

const formulaAuditService = new FormulaAuditService();

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
async function createAlertNotification(formulaName: string, deviation: number) {
  try {
    // Get all admin users
    const users = await storage.getAllUsers();
    const adminUsers = users.filter(u => u.isAdmin);
    
    for (const admin of adminUsers) {
      // Create alert for both paper and live modes
      await AlertsService.createAlert({
        userId: admin.id,
        mode: 'paper',
        alertType: 'formula_audit',
        severity: 'warning',
        category: 'informational',
        message: `Formula Audit Warning — ${formulaName} deviated ${deviation.toFixed(2)}%`,
        metadata: { formulaName, deviation }
      });
      
      await AlertsService.createAlert({
        userId: admin.id,
        mode: 'live',
        alertType: 'formula_audit',
        severity: 'warning',
        category: 'informational',
        message: `Formula Audit Warning — ${formulaName} deviated ${deviation.toFixed(2)}%`,
        metadata: { formulaName, deviation }
      });
    }
    
    console.log(`[ALERT] Formula deviation detected in ${formulaName} (${deviation.toFixed(2)}%)`);
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
    const reportPath = `/tmp/audit_report_${dateStr}.txt`;
    
    // Also create/update a "latest" symlink-style file
    const latestPath = '/tmp/audit_report_latest.txt';
    
    // Generate text report from summary
    const textReport = report.summary.join('\n');
    
    // Save reports
    fs.writeFileSync(reportPath, textReport);
    fs.writeFileSync(latestPath, textReport);
    
    // Validate report integrity
    validateReportFile(reportPath);
    
    // Log completion
    const duration = Date.now() - startTime;
    console.log(`[FORMULA-AUDIT] completed in ${duration}ms PASS=${report.passed} WARNING=${report.warnings} FAIL=${report.failed}`);
    
    // Check for failures or significant warnings
    for (const test of report.tests) {
      if (test.status === 'FAIL' || test.deviationPercent >= 1) {
        await createAlertNotification(test.name, test.deviationPercent);
      } else if (test.status === 'WARNING') {
        console.log(`[AUDIT] Warning in ${test.name}: ${test.deviationPercent.toFixed(4)}% deviation`);
      }
    }
    
    // Cleanup old reports
    cleanupOldReports();
    
    return {
      ...report,
      runType,
      timestamp,
      reportPath,
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
export function registerFormulaAuditJob() {
  if (!ENABLED) {
    console.log('[FormulaAuditJob] ❌ Disabled via FORMULA_AUDIT_ENABLED env');
    return;
  }

  console.log(`[FormulaAuditJob] ⏰ Scheduling daily audit: ${SCHEDULE}`);

  cron.schedule(SCHEDULE, async () => {
    await runFormulaAudit('scheduled');
  });

  console.log('[FormulaAuditJob] ✅ Job registered successfully');
}
