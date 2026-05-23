/**
 * Directive 8.8.4-M5 — Pricing Feed API Routes
 *
 * Endpoints for feed latency and cache information:
 * - GET /api/pricing/latency – rolling latency averages (1m/5m/15m)
 * - GET /api/pricing/cache-info – cache length and average latency
 * - GET /api/pricing/status – full cache health metrics
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { priceCache } from '../services/price-cache';
import { paperValidationEngine } from '../services/paper_validation_engine';

const router = Router();

// Directive 12.1.3: JWT_SECRET must come from environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
}

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

router.get('/latency', auditOrAuth, (_req: Request, res: Response) => {
  try {
    const latencyAverages = paperValidationEngine.getRollingLatencyAverages();
    res.json({
      ok: true,
      latency: {
        oneMinuteAvgMs: Math.round(latencyAverages.oneMin * 10) / 10,
        fiveMinuteAvgMs: Math.round(latencyAverages.fiveMin * 10) / 10,
        fifteenMinuteAvgMs: Math.round(latencyAverages.fifteenMin * 10) / 10
      }
    });
  } catch (error) {
    console.error('[M5][PRICING] Failed to get latency:', error);
    res.status(500).json({ ok: false, error: 'Failed to get latency metrics' });
  }
});

router.get('/cache-info', auditOrAuth, (_req: Request, res: Response) => {
  try {
    const health = priceCache.getHealthMetrics();
    const latencyAverages = paperValidationEngine.getRollingLatencyAverages();

    res.json({
      cache_length: health.cacheSize,
      avg_latency_ms: Math.round(latencyAverages.oneMin * 10) / 10,
      buckets: {
        openTrade: health.openTrade,
        readyToBuy: health.readyToBuy,
        fx5Snapshot: health.fx5Snapshot
      }
    });
  } catch (error) {
    console.error('[M5][PRICING] Failed to get cache info:', error);
    res.status(500).json({ ok: false, error: 'Failed to get cache info' });
  }
});

router.get('/status', auditOrAuth, (_req: Request, res: Response) => {
  try {
    const health = priceCache.getHealthMetrics();
    const latencyAverages = paperValidationEngine.getRollingLatencyAverages();

    res.json({
      ok: true,
      cacheSize: health.cacheSize,
      currentWeight: health.currentWeight,
      maxWeight: health.maxWeight,
      buckets: {
        openTrade: health.openTrade,
        readyToBuy: health.readyToBuy,
        fx5Snapshot: health.fx5Snapshot
      },
      latency: {
        oneMinuteAvgMs: Math.round(latencyAverages.oneMin * 10) / 10,
        fiveMinuteAvgMs: Math.round(latencyAverages.fiveMin * 10) / 10,
        fifteenMinuteAvgMs: Math.round(latencyAverages.fifteenMin * 10) / 10
      }
    });
  } catch (error) {
    console.error('[M5][PRICING] Failed to get status:', error);
    res.status(500).json({ ok: false, error: 'Failed to get pricing status' });
  }
});

export default router;
