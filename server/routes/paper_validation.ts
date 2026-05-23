/**
 * Directive 8.8.4-M5 — Paper Validation API Routes
 *
 * Endpoints:
 * - POST /api/validation/run – start supervised paper test
 * - GET /api/validation/status – session metrics
 * - GET /api/validation/latest – last run summary
 * - GET /api/validation/history – previous run records
 * - POST /api/validation/reset – clear validation buffer
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { paperValidationEngine } from '../services/paper_validation_engine';

const router = Router();

// Directive 12.1.3: JWT_SECRET must come from environment — no fallback
const JWT_SECRET: string = (() => {
  // B-NEW-43 chunk 10: IIFE preserves narrowing across function boundaries.
  // The prior top-level if-throw narrowed the const for the module scope only;
  // inner functions that referenced JWT_SECRET saw it widened back to string|undefined,
  // producing TS2769 on jwt.verify/jwt.sign calls. IIFE returns string directly.
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
  return s;
})();

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string };
}

// Directive 12.1.3: Removed x-internal-audit bypass header
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

/**
 * M5-R1: Extended validation with configurable duration
 * Query params:
 *   - duration: duration in minutes (default: 60, format: "60m" or "60")
 *   - interval: capture interval in seconds (default: 10)
 */
router.post('/run', auditOrAuth, async (req: Request, res: Response) => {
  try {
    // Parse duration (supports "60m" or "60" format)
    let durationMinutes = 60;
    const durationParam = req.query.duration as string;
    if (durationParam) {
      const match = durationParam.match(/^(\d+)m?$/);
      if (match) {
        durationMinutes = parseInt(match[1], 10);
      }
    }

    // Parse capture interval
    let captureIntervalSeconds = 10;
    const intervalParam = req.query.interval as string;
    if (intervalParam) {
      captureIntervalSeconds = parseInt(intervalParam, 10) || 10;
    }

    console.log(`[M5-R1][API] Starting validation: duration=${durationMinutes}m, interval=${captureIntervalSeconds}s`);
    const result = await paperValidationEngine.startValidationSession(durationMinutes, captureIntervalSeconds);

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('[M5-R1][API] Failed to start validation:', error);
    res.status(500).json({ ok: false, error: 'Failed to start validation session' });
  }
});

router.get('/status', auditOrAuth, (_req: Request, res: Response) => {
  try {
    const status = paperValidationEngine.getStatus();
    res.json({
      ok: true,
      ...status
    });
  } catch (error) {
    console.error('[M5][API] Failed to get status:', error);
    res.status(500).json({ ok: false, error: 'Failed to get validation status' });
  }
});

router.get('/latest', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const report = await paperValidationEngine.getLatestReport();
    if (!report) {
      return res.json({ ok: true, report: null, message: 'No validation reports found' });
    }
    res.json({
      ok: true,
      report
    });
  } catch (error) {
    console.error('[M5][API] Failed to get latest report:', error);
    res.status(500).json({ ok: false, error: 'Failed to get latest report' });
  }
});

router.get('/history', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const reports = await paperValidationEngine.listReports();
    res.json({
      ok: true,
      reports,
      count: reports.length
    });
  } catch (error) {
    console.error('[M5][API] Failed to get history:', error);
    res.status(500).json({ ok: false, error: 'Failed to get validation history' });
  }
});

router.post('/reset', auditOrAuth, (_req: Request, res: Response) => {
  try {
    paperValidationEngine.resetBuffer();
    res.json({
      ok: true,
      message: 'Validation buffer reset'
    });
  } catch (error) {
    console.error('[M5][API] Failed to reset buffer:', error);
    res.status(500).json({ ok: false, error: 'Failed to reset validation buffer' });
  }
});

router.post('/stop', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const report = await paperValidationEngine.stopValidationSession();
    if (!report) {
      return res.json({ ok: false, message: 'No active validation session' });
    }
    res.json({
      ok: true,
      report
    });
  } catch (error) {
    console.error('[M5][API] Failed to stop validation:', error);
    res.status(500).json({ ok: false, error: 'Failed to stop validation session' });
  }
});

export default router;
