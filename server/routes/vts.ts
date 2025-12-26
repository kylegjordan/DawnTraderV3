/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L6
 * ══════════════════════════════════════════════════════════════════════════════
 * VTS API Routes - Virtual Trade Simulator Endpoints
 * 
 * Endpoints:
 * - GET /api/vts/status: Current VTS status and stats
 * - GET /api/vts/export: Export all virtual trades and calibration data
 * - POST /api/vts/retrain: Trigger calibration coefficient retraining
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { vtsService } from '../services/vts-service';
import { loadCalibration, applyCalibration } from '../utils/calibration';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';

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
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const stats = vtsService.getStats();
    const calibration = vtsService.getCalibration();
    
    console.log(`[L6][VTS][STATUS] open=${stats.openTrades} closed=${stats.closedTrades} winRate=${(stats.winRate * 100).toFixed(1)}%`);
    
    res.json({
      isRunning: true,
      stats,
      calibration,
      cpuImpact: '< 5%'
    });
  } catch (error) {
    console.error('[L6][VTS][ERROR] Status failed:', error);
    res.status(500).json({ error: 'Failed to get VTS status' });
  }
});

router.get('/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const exportData = await vtsService.exportTrades();
    
    console.log(`[L6][VTS][EXPORT] Exporting ${exportData.trades.length} trades`);
    
    res.json(exportData);
  } catch (error) {
    console.error('[L6][VTS][ERROR] Export failed:', error);
    res.status(500).json({ error: 'Failed to export VTS data' });
  }
});

router.post('/retrain', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[L6][VTS][RETRAIN_START] Initiating calibration retraining');
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ phase: 'Loading historical trades', percent: 10 })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 300));

    const historicalTrades = await vtsService.loadHistoricalTrades();
    res.write(`data: ${JSON.stringify({ phase: `Loaded ${historicalTrades.length} trades`, percent: 30 })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 300));

    res.write(`data: ${JSON.stringify({ phase: 'Computing linear regression', percent: 50 })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 300));

    const calibration = await vtsService.runCalibration();
    res.write(`data: ${JSON.stringify({ phase: 'Calibration complete', percent: 80 })}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 300));

    res.write(`data: ${JSON.stringify({ 
      phase: 'complete', 
      percent: 100, 
      message: `Calibration updated: α=${calibration.alpha.toFixed(4)} β=${calibration.beta.toFixed(2)} r²=${calibration.rSquared.toFixed(2)}`,
      calibration
    })}\n\n`);

    console.log(`[L6][VTS][RETRAIN_COMPLETE] α=${calibration.alpha.toFixed(4)} β=${calibration.beta.toFixed(2)}`);
    
    res.end();
  } catch (error) {
    console.error('[L6][VTS][ERROR] Retrain failed:', error);
    res.status(500).json({ error: 'Failed to retrain calibration' });
  }
});

router.get('/calibration', requireAuth, async (req: Request, res: Response) => {
  try {
    const calibration = await loadCalibration();
    
    const predictedProfit = parseFloat(req.query.predicted as string) || 0.05;
    const calibratedProfit = applyCalibration(predictedProfit, calibration);
    
    res.json({
      calibration,
      example: {
        predicted: predictedProfit,
        calibrated: calibratedProfit,
        formula: `${calibration.alpha.toFixed(4)} + ${calibration.beta.toFixed(2)} × ${predictedProfit.toFixed(4)} = ${calibratedProfit.toFixed(4)}`
      }
    });
  } catch (error) {
    console.error('[L6][VTS][ERROR] Calibration lookup failed:', error);
    res.status(500).json({ error: 'Failed to get calibration' });
  }
});

export default router;
