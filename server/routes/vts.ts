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
    const format = (req.query.format as string) || 'json';
    const period = (req.query.period as string) || 'all';
    
    const exportData = await vtsService.exportTrades();
    let trades = exportData.trades;
    
    const now = Date.now();
    if (period === '24h') {
      trades = trades.filter(t => t.entryTime > now - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      trades = trades.filter(t => t.entryTime > now - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      trades = trades.filter(t => t.entryTime > now - 30 * 24 * 60 * 60 * 1000);
    }
    
    console.log(`[L7][VTS][EXPORT] Exporting ${trades.length} trades (format=${format}, period=${period})`);
    
    if (format === 'csv') {
      const wins = trades.filter(t => (t.netProfit || 0) > 0);
      const winRate = trades.length > 0 ? (wins.length / trades.length * 100) : 0;
      const avgGross = trades.length > 0 ? trades.reduce((s, t) => s + (t.grossProfit || 0), 0) / trades.length : 0;
      const avgNet = trades.length > 0 ? trades.reduce((s, t) => s + (t.netProfit || 0), 0) / trades.length : 0;
      
      const csvHeader = 'Symbol,Strategy,Entry,Exit,Stop,Result,Duration,GrossProfit,NetProfit,Fees,Slippage,Outcome\n';
      const csvRows = trades.map(t => {
        const durationMs = (t.exitTime || t.entryTime) - t.entryTime;
        const durationMin = Math.round(durationMs / 60000);
        return [
          t.signal.symbol,
          t.signal.strategy,
          t.signal.entryPrice.toFixed(6),
          (t.exitPrice || 0).toFixed(6),
          t.signal.stopLoss.toFixed(6),
          t.resultType || 'open',
          `${durationMin}m`,
          ((t.grossProfit || 0) * 100).toFixed(4) + '%',
          ((t.netProfit || 0) * 100).toFixed(4) + '%',
          (t.fees || 0).toFixed(6),
          t.signal.spread?.toFixed(6) || '0.001500',
          t.status
        ].join(',');
      }).join('\n');
      
      const calibration = exportData.calibration;
      const footer = `\n# Summary\n# Total Trades: ${trades.length}\n# Win Rate: ${winRate.toFixed(1)}%\n# Avg Gross Profit: ${(avgGross * 100).toFixed(4)}%\n# Avg Net Profit: ${(avgNet * 100).toFixed(4)}%\n# α: ${calibration?.alpha?.toFixed(4) || '0.0018'}, β: ${calibration?.beta?.toFixed(2) || '0.19'}\n`;
      
      const csvContent = csvHeader + csvRows + footer;
      
      const fs = await import('fs/promises');
      const path = await import('path');
      const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const exportDir = path.join(process.cwd(), 'logs', 'vts_exports');
      await fs.mkdir(exportDir, { recursive: true });
      const exportPath = path.join(exportDir, `${date}.csv`);
      await fs.writeFile(exportPath, csvContent);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=vts_export_${date}.csv`);
      res.send(csvContent);
    } else {
      const summary = {
        totalTrades: trades.length,
        winRate: trades.length > 0 ? trades.filter(t => (t.netProfit || 0) > 0).length / trades.length : 0,
        avgGrossProfit: trades.length > 0 ? trades.reduce((s, t) => s + (t.grossProfit || 0), 0) / trades.length : 0,
        avgNetProfit: trades.length > 0 ? trades.reduce((s, t) => s + (t.netProfit || 0), 0) / trades.length : 0
      };
      
      res.json({
        trades,
        stats: exportData.stats,
        calibration: exportData.calibration,
        summary,
        period,
        exportedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[L7][VTS][ERROR] Export failed:', error);
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

router.get('/internal/calibration', async (req: Request, res: Response) => {
  const internalKey = req.headers['x-internal-key'];
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;
  
  if (!expectedKey || internalKey !== expectedKey) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    const calibration = vtsService.getCalibration();
    console.log('[L7][VTS][INTERNAL] ML service fetched calibration');
    
    res.json({
      calibration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L7][VTS][ERROR] Internal calibration fetch failed:', error);
    res.status(500).json({ error: 'Failed to get calibration' });
  }
});

export default router;
