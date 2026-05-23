/**
 * Directive 8.8.4-M5-R1 — Calibration API Routes
 *
 * Endpoints:
 * - GET /api/calibration/report – current per-strategy reliability and weight distribution
 * - GET /api/calibration/latest – most recent saved calibration report
 * - POST /api/calibration/generate – generate and save new calibration report
 * - POST /api/ml/calibration/trigger – manual trigger for ML calibration (Directive 11.7I-04)
 * - POST /api/ml/recalibration/trigger – produce canonical weights (Directive 11.7D)
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as fs from 'fs';
import { calibrationReportService } from '../services/calibration_report_service';
import { loadFullCalibration } from '../utils/calibration';
import { computeStrategyWeights } from '../utils/strategyWeights';
import { vtsService } from '../services/vts-service';
import { triggerManualCalibration, getMLCalibrationSchedulerStatus } from '../core/schedulers/ml-calibration-scheduler';
import { recalibratePredictiveWeights, getRecalibrationStatus } from '../scripts/recalibrate-predictive-weights';

const router = Router();

// Directive 12.1.3: JWT_SECRET must come from environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
}

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string };
}

// Directive 12.1.3: Removed x-internal-audit and x-validation-session bypass headers
function auditOrAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as { id: string; username: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/report', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const report = await calibrationReportService.generateReport();
    res.json({
      ok: true,
      report
    });
  } catch (error) {
    console.error('[M5-R1][CALIBRATION] Failed to generate report:', error);
    res.status(500).json({ ok: false, error: 'Failed to generate calibration report' });
  }
});

router.get('/latest', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const report = await calibrationReportService.getLatestReport();
    if (!report) {
      return res.json({ ok: true, report: null, message: 'No calibration reports found' });
    }
    res.json({
      ok: true,
      report
    });
  } catch (error) {
    console.error('[M5-R1][CALIBRATION] Failed to get latest report:', error);
    res.status(500).json({ ok: false, error: 'Failed to get latest calibration report' });
  }
});

router.post('/generate', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const report = await calibrationReportService.generateReport();
    const filename = await calibrationReportService.saveReport(report);
    res.json({
      ok: true,
      report,
      savedAs: filename
    });
  } catch (error) {
    console.error('[M5-R1][CALIBRATION] Failed to generate and save report:', error);
    res.status(500).json({ ok: false, error: 'Failed to generate calibration report' });
  }
});

router.get('/weights', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const weightsBundle = await computeStrategyWeights();
    res.json({
      ok: true,
      weights: weightsBundle.weights,
      reliabilities: weightsBundle.reliabilities,
      totalStrategies: weightsBundle.totalStrategies,
      lastUpdated: weightsBundle.lastUpdated
    });
  } catch (error) {
    console.error('[M5-R1][CALIBRATION] Failed to get weights:', error);
    res.status(500).json({ ok: false, error: 'Failed to get strategy weights' });
  }
});

router.get('/raw', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const fullCalibration = await loadFullCalibration();
    const vtsStats = vtsService.getStats();
    const strategyStats = vtsService.getStrategyStats();

    res.json({
      ok: true,
      globalCalibration: fullCalibration.global,
      strategyCalibrations: fullCalibration.strategies,
      lastUpdate: fullCalibration.lastUpdate,
      vtsStats,
      strategyStats
    });
  } catch (error) {
    console.error('[M5-R1][CALIBRATION] Failed to get raw calibration:', error);
    res.status(500).json({ ok: false, error: 'Failed to get raw calibration data' });
  }
});

/**
 * Directive 11.7I-04 — Manual ML Calibration Trigger (Diagnostic)
 * POST /api/ml/calibration/trigger
 */
router.post('/ml/trigger', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    console.log('[11.7I-04][Manual] Calibration triggered via API');

    const schedulerStatus = getMLCalibrationSchedulerStatus();
    const result = await triggerManualCalibration();

    res.json({
      ok: result.success,
      result,
      schedulerStatus
    });
  } catch (error: any) {
    console.error('[11.7I-04][Manual] Calibration trigger error:', error.message);
    res.status(500).json({
      ok: false,
      error: 'Failed to trigger ML calibration',
      message: error.message
    });
  }
});

/**
 * Directive 11.7D — Manual Canonical Weight Recalibration Trigger
 * POST /api/ml/recalibration/trigger
 *
 * Produces canonical weights file: bridge/canonical/phase9_predictive-learning.json
 */
router.post('/ml/recalibration/trigger', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    console.log('[11.7D][Manual] Canonical weight recalibration triggered via API');

    const canonicalPath = 'bridge/canonical/phase9_predictive-learning.json';
    const beforeExists = fs.existsSync(canonicalPath);

    const success = recalibratePredictiveWeights();

    const afterExists = fs.existsSync(canonicalPath);
    let fileInfo = null;

    if (afterExists) {
      const stats = fs.statSync(canonicalPath);
      fileInfo = {
        path: canonicalPath,
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString()
      };
      console.log(`[11.7D][Manual] ✅ Canonical weights file created: ${canonicalPath} (${stats.size} bytes)`);
    }

    const recalibrationStatus = getRecalibrationStatus();

    res.json({
      ok: success,
      beforeExists,
      afterExists,
      fileInfo,
      recalibrationStatus
    });
  } catch (error: any) {
    console.error('[11.7D][Manual] Recalibration trigger error:', error.message);
    res.status(500).json({
      ok: false,
      error: 'Failed to trigger canonical weight recalibration',
      message: error.message
    });
  }
});

/**
 * GET /api/ml/calibration/status — Check scheduler status and canonical file state
 */
router.get('/ml/status', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const schedulerStatus = getMLCalibrationSchedulerStatus();
    const recalibrationStatus = getRecalibrationStatus();

    const canonicalPath = 'bridge/canonical/phase9_predictive-learning.json';
    const canonicalExists = fs.existsSync(canonicalPath);
    let canonicalInfo = null;

    if (canonicalExists) {
      const stats = fs.statSync(canonicalPath);
      canonicalInfo = {
        path: canonicalPath,
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    }

    res.json({
      ok: true,
      schedulerStatus,
      recalibrationStatus,
      canonicalFile: canonicalInfo
    });
  } catch (error: any) {
    console.error('[11.7I-04] Status check error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
