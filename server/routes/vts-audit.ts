/**
 * Directive 8.8.4-M3B.2 — VTS Audit API Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { vtsModeAuditService, type VTSModeState, type SystemMode } from '../services/vts-mode-audit';
import { vtsService } from '../services/vts-service';
import { priceCache } from '../services/price-cache';

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
    const state = vtsModeAuditService.getState();
    const vtsStats = vtsService.getStats();
    const learningParams = vtsService.getLearningParams();
    
    res.json({
      ok: true,
      mode: state.mode,
      source: state.source,
      systemMode: state.systemMode,
      isActive: state.isActive,
      lastModeChange: state.lastModeChange,
      simulatedTradesThisSession: state.simulatedTradesThisSession,
      averageFeedLatency: vtsModeAuditService.getAverageFeedLatency(),
      averageConfidence: vtsModeAuditService.getAverageConfidence(),
      vtsStats,
      learningParams,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[M3B.2][VTS_AUDIT] Status error:', error);
    res.status(500).json({ error: 'Failed to get VTS status' });
  }
});

router.post('/run-passive', requireAuth, async (req: Request, res: Response) => {
  try {
    const state = vtsModeAuditService.getState();
    
    if (state.mode !== 'simulator') {
      return res.json({
        ok: false,
        message: 'Cannot run passive simulation while trading is active',
        currentMode: state.mode,
        systemMode: state.systemMode
      });
    }

    const startTime = Date.now();
    
    const symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD'];
    const snapshots: Array<{ symbol: string; price: number; timestamp: number }> = [];
    
    for (const symbol of symbols) {
      const cached = priceCache.getCachedPrice(symbol);
      if (cached && cached.price > 0) {
        snapshots.push({
          symbol,
          price: cached.price,
          timestamp: cached.lastUpdatedAt
        });
        
        vtsService.updateMarketPrice(symbol, cached.price);
      }
    }
    
    const feedLatency = Date.now() - startTime;
    vtsModeAuditService.recordFeedLatency(feedLatency);
    
    await vtsService.updateOpenTrades();
    
    console.log(`[M3B.2][VTS_AUDIT] Passive cycle complete: ${snapshots.length} symbols, latency=${feedLatency}ms`);
    
    res.json({
      ok: true,
      message: 'Passive simulation cycle completed',
      symbolsProcessed: snapshots.length,
      feedLatencyMs: feedLatency,
      snapshots,
      vtsStats: vtsService.getStats()
    });
  } catch (error) {
    console.error('[M3B.2][VTS_AUDIT] Run passive error:', error);
    res.status(500).json({ error: 'Failed to run passive simulation' });
  }
});

router.post('/audit', requireAuth, async (req: Request, res: Response) => {
  try {
    const report = await vtsModeAuditService.generateReport();
    
    console.log(`[M3B.2][VTS_AUDIT] Audit complete: ${report.summary}`);
    
    res.json({
      ok: true,
      report
    });
  } catch (error) {
    console.error('[M3B.2][VTS_AUDIT] Audit error:', error);
    res.status(500).json({ error: 'Failed to generate audit report' });
  }
});

router.get('/latest-report', requireAuth, async (req: Request, res: Response) => {
  try {
    const report = await vtsModeAuditService.getLatestReport();
    
    if (report) {
      res.json({ ok: true, report });
    } else {
      res.json({ ok: true, report: null, message: 'No audit reports found' });
    }
  } catch (error) {
    console.error('[M3B.2][VTS_AUDIT] Latest report error:', error);
    res.status(500).json({ error: 'Failed to get latest report' });
  }
});

router.post('/update-mode', requireAuth, async (req: Request, res: Response) => {
  try {
    const { systemMode } = req.body as { systemMode: SystemMode };
    
    if (!['IDLE', 'PAPER', 'LIVE'].includes(systemMode)) {
      return res.status(400).json({ error: 'Invalid system mode' });
    }
    
    vtsModeAuditService.updateMode(systemMode);
    const state = vtsModeAuditService.getState();
    
    console.log(`[M3B.2][VTS_AUDIT] Mode updated via API: ${systemMode} → VTS mode: ${state.mode}`);
    
    res.json({
      ok: true,
      message: `VTS mode updated to ${state.mode}`,
      state
    });
  } catch (error) {
    console.error('[M3B.2][VTS_AUDIT] Update mode error:', error);
    res.status(500).json({ error: 'Failed to update mode' });
  }
});

router.post('/reset-session', requireAuth, async (req: Request, res: Response) => {
  try {
    vtsModeAuditService.resetSessionStats();
    
    res.json({
      ok: true,
      message: 'Session statistics reset',
      state: vtsModeAuditService.getState()
    });
  } catch (error) {
    console.error('[M3B.2][VTS_AUDIT] Reset session error:', error);
    res.status(500).json({ error: 'Failed to reset session' });
  }
});

export default router;
