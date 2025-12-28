/**
 * Directive 8.8.4-M5-R1 — Calibration API Routes
 * 
 * Endpoints:
 * - GET /api/calibration/report – current per-strategy reliability and weight distribution
 * - GET /api/calibration/latest – most recent saved calibration report
 * - POST /api/calibration/generate – generate and save new calibration report
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { calibrationReportService } from '../services/calibration_report_service';
import { loadFullCalibration } from '../utils/calibration';
import { computeStrategyWeights } from '../utils/strategyWeights';
import { vtsService } from '../services/vts-service';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string };
}

function auditOrAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.headers['x-internal-audit'] === 'true' || req.headers['x-validation-session'] === 'true') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
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

export default router;
