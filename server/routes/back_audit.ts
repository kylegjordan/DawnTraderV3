/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-M4 — Back-Audit API Routes
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { backAuditEngine } from '../services/back_audit_engine.js';

const router = Router();

router.post('/run', async (req: Request, res: Response) => {
  try {
    console.log('[M4][BACK_AUDIT] Starting full audit via API...');
    const report = await backAuditEngine.runFullAudit();
    
    res.json({
      ok: true,
      summary: {
        modulesChecked: report.modules_checked,
        modulesPassed: report.modules_passed,
        modulesFailed: report.modules_failed,
        formulaViolations: report.formula_violations.length,
        deprecatedConstants: report.deprecated_constants.length,
        missingEndpoints: report.missing_endpoints.length
      },
      report
    });
  } catch (error: any) {
    console.error('[M4][BACK_AUDIT] Run error:', error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Failed to run audit' 
    });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = backAuditEngine.getStatus();
    const lastReport = status.lastReport;
    
    res.json({
      ok: true,
      isRunning: status.isRunning,
      lastAuditTime: lastReport?.timestamp || null,
      lastAuditSummary: lastReport ? {
        modulesChecked: lastReport.modules_checked,
        modulesPassed: lastReport.modules_passed,
        modulesFailed: lastReport.modules_failed,
        recommendations: lastReport.recommendations.length
      } : null
    });
  } catch (error: any) {
    console.error('[M4][BACK_AUDIT] Status error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get status' });
  }
});

router.get('/reports', async (req: Request, res: Response) => {
  try {
    const reports = await backAuditEngine.listReports();
    
    res.json({
      ok: true,
      count: reports.length,
      reports
    });
  } catch (error: any) {
    console.error('[M4][BACK_AUDIT] List reports error:', error);
    res.status(500).json({ ok: false, error: 'Failed to list reports' });
  }
});

router.get('/latest', async (req: Request, res: Response) => {
  try {
    const report = await backAuditEngine.getLatestReport();
    
    if (!report) {
      res.json({
        ok: false,
        message: 'No audit reports found. Run POST /api/back-audit/run to generate one.'
      });
      return;
    }
    
    res.json({
      ok: true,
      report
    });
  } catch (error: any) {
    console.error('[M4][BACK_AUDIT] Latest report error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get latest report' });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const report = await backAuditEngine.getLatestReport();
    
    if (!report) {
      res.json({
        ok: false,
        message: 'No audit reports available'
      });
      return;
    }
    
    const passRate = report.modules_checked > 0 
      ? Math.round((report.modules_passed / report.modules_checked) * 100) 
      : 0;
    
    res.json({
      ok: true,
      timestamp: report.timestamp,
      passRate: `${passRate}%`,
      modulesChecked: report.modules_checked,
      modulesPassed: report.modules_passed,
      modulesFailed: report.modules_failed,
      criticalIssues: report.formula_violations.filter(v => v.severity === 'critical').length,
      deprecatedConstants: report.deprecated_constants,
      missingEndpoints: report.missing_endpoints,
      crosslinkHealth: report.crosslink_health,
      latencyChecks: report.latency_checks,
      recommendations: report.recommendations
    });
  } catch (error: any) {
    console.error('[M4][BACK_AUDIT] Summary error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get summary' });
  }
});

export default router;
