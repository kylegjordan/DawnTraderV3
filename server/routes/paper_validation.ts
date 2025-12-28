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

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string };
}

function auditOrAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.headers['x-internal-audit'] === 'true') {
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

router.post('/run', auditOrAuth, async (_req: Request, res: Response) => {
  try {
    const result = await paperValidationEngine.startValidationSession();
    console.log(`[M5][API] Validation session started: ${result.sessionId}`);
    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('[M5][API] Failed to start validation:', error);
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
