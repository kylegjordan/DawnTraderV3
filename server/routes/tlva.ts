/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-M3A — Training Loop Validation Audit (TLVA) API Routes
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import { trainingAuditService } from '../services/training-audit-service';

const router = Router();
const REPORTS_DIR = path.join(process.cwd(), 'reports');

// Directive 12.1.3: JWT_SECRET must come from environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
}

interface AuthenticatedRequest extends Request {
  user?: { id: string; username: string };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const vtsStatus = trainingAuditService.getStatus('VTS');
    const dceStatus = trainingAuditService.getStatus('DCE');
    const araStatus = trainingAuditService.getStatus('ARA');
    
    res.json({
      ok: true,
      vts: vtsStatus,
      dce: dceStatus,
      ara: araStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[M3A][TLVA][API] Status error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get TLVA status' });
  }
});

router.post('/generate-report', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[M3A][TLVA][API] Generating TLVA report...');
    const report = await trainingAuditService.generateReport();
    
    res.json({
      ok: true,
      report,
      message: `Report ${report.reportId} generated successfully`
    });
  } catch (error) {
    console.error('[M3A][TLVA][API] Report generation error:', error);
    res.status(500).json({ ok: false, error: 'Failed to generate TLVA report' });
  }
});

router.get('/reports', requireAuth, async (req: Request, res: Response) => {
  try {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const files = await fs.readdir(REPORTS_DIR);
    const tlvaReports = files
      .filter(f => f.startsWith('TLVA_Report_') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 20);
    
    res.json({
      ok: true,
      reports: tlvaReports,
      count: tlvaReports.length
    });
  } catch (error) {
    console.error('[M3A][TLVA][API] List reports error:', error);
    res.status(500).json({ ok: false, error: 'Failed to list TLVA reports' });
  }
});

router.get('/reports/:filename', requireAuth, async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    if (!filename.startsWith('TLVA_Report_') || !filename.endsWith('.json')) {
      return res.status(400).json({ ok: false, error: 'Invalid report filename' });
    }
    
    const reportPath = path.join(REPORTS_DIR, filename);
    const content = await fs.readFile(reportPath, 'utf-8');
    const report = JSON.parse(content);
    
    res.json({
      ok: true,
      report
    });
  } catch (error) {
    console.error('[M3A][TLVA][API] Get report error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get TLVA report' });
  }
});

router.get('/latest', requireAuth, async (req: Request, res: Response) => {
  try {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const files = await fs.readdir(REPORTS_DIR);
    const tlvaReports = files
      .filter(f => f.startsWith('TLVA_Report_') && f.endsWith('.json'))
      .sort()
      .reverse();
    
    if (tlvaReports.length === 0) {
      return res.json({
        ok: true,
        report: null,
        message: 'No TLVA reports found. Run a retrain operation to generate one.'
      });
    }
    
    const latestPath = path.join(REPORTS_DIR, tlvaReports[0]);
    const content = await fs.readFile(latestPath, 'utf-8');
    const report = JSON.parse(content);
    
    res.json({
      ok: true,
      report
    });
  } catch (error) {
    console.error('[M3A][TLVA][API] Latest report error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get latest TLVA report' });
  }
});

router.post('/set-verbose', requireAuth, async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    trainingAuditService.setVerbose(enabled === true);
    
    res.json({
      ok: true,
      verbose: enabled === true,
      message: `Verbose logging ${enabled === true ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    console.error('[M3A][TLVA][API] Set verbose error:', error);
    res.status(500).json({ ok: false, error: 'Failed to set verbose mode' });
  }
});

export default router;
