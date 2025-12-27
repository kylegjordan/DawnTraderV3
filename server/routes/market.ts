/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L12
 * ══════════════════════════════════════════════════════════════════════════════
 * Market Condition Profiling API Routes
 * 
 * Provides REST endpoints for market regime data and adaptive strategy adjustments.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getMarketProfiler, type RegimeId } from '../services/market-profiler';
import { getAdaptiveRegime, type StrategyMix } from '../services/adaptive-regime';

export const marketRouter = Router();

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

const REGIME_DESCRIPTIONS: Record<RegimeId, string> = {
  T1: 'Trending Bull',
  T2: 'Trending Bear',
  R1: 'Range-Bound',
  V1: 'High Volatility Chop',
  C1: 'Calm Consolidation'
};

const REGIME_COLORS: Record<RegimeId, string> = {
  T1: 'green',
  T2: 'red',
  R1: 'blue',
  V1: 'orange',
  C1: 'gray'
};

marketRouter.get('/regime', requireAuth, async (req: Request, res: Response) => {
  try {
    const profiler = getMarketProfiler();
    const profile = profiler.getCurrentProfile();
    const regime = getAdaptiveRegime();
    const adjustments = regime.getCurrentAdjustments();
    
    if (!profile) {
      return res.json({
        regime: 'R1',
        description: REGIME_DESCRIPTIONS['R1'],
        color: REGIME_COLORS['R1'],
        confidence: 0,
        metrics: {
          volatility: 0.15,
          trend: 0.1,
          volume_z: 0,
          atr: 0.02,
          correlation: 0.5
        },
        previousRegime: null,
        lastSwitch: null,
        dominantStrategies: [],
        exposureMultiplier: 1.0,
        riskMultiplier: 1.0,
        profilerActive: profiler.isActive(),
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      regime: profile.regime,
      description: REGIME_DESCRIPTIONS[profile.regime],
      color: REGIME_COLORS[profile.regime],
      confidence: profile.confidence,
      metrics: profile.metrics,
      previousRegime: profile.previousRegime,
      lastSwitch: profile.lastSwitch,
      dominantStrategies: adjustments?.dominantStrategies || [],
      exposureMultiplier: adjustments?.exposureMultiplier || 1.0,
      riskMultiplier: adjustments?.riskMultiplier || 1.0,
      profilerActive: profiler.isActive(),
      timestamp: profile.timestamp
    });
  } catch (error) {
    console.error('[L12][API][ERROR] Failed to get market regime:', error);
    res.status(500).json({ error: 'Failed to get market regime' });
  }
});

marketRouter.get('/regime/adjustments', requireAuth, async (req: Request, res: Response) => {
  try {
    const regime = getAdaptiveRegime();
    const adjustments = regime.getCurrentAdjustments();
    
    if (!adjustments) {
      return res.json({
        regime: 'R1',
        strategyMix: {},
        exposureMultiplier: 1.0,
        riskMultiplier: 1.0,
        dominantStrategies: [],
        timestamp: new Date().toISOString()
      });
    }
    
    res.json(adjustments);
  } catch (error) {
    console.error('[L12][API][ERROR] Failed to get regime adjustments:', error);
    res.status(500).json({ error: 'Failed to get regime adjustments' });
  }
});

marketRouter.get('/regime/matrix', requireAuth, async (req: Request, res: Response) => {
  try {
    const regime = getAdaptiveRegime();
    const matrix = regime.getRegimeStrategyMatrix();
    
    const formattedMatrix: Record<string, { description: string; color: string; strategies: Record<string, number> }> = {};
    
    for (const [regimeId, strategies] of Object.entries(matrix)) {
      formattedMatrix[regimeId] = {
        description: REGIME_DESCRIPTIONS[regimeId as RegimeId],
        color: REGIME_COLORS[regimeId as RegimeId],
        strategies: strategies as unknown as Record<string, number>
      };
    }
    
    res.json({
      matrix: formattedMatrix,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L12][API][ERROR] Failed to get regime matrix:', error);
    res.status(500).json({ error: 'Failed to get regime matrix' });
  }
});

marketRouter.post('/regime/refresh', requireAuth, async (req: Request, res: Response) => {
  try {
    const profiler = getMarketProfiler();
    await profiler.runProfileCheck();
    
    const profile = profiler.getCurrentProfile();
    
    res.json({
      success: true,
      regime: profile?.regime || 'R1',
      confidence: profile?.confidence || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L12][API][ERROR] Failed to refresh regime:', error);
    res.status(500).json({ error: 'Failed to refresh regime' });
  }
});

marketRouter.get('/regime/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const profiler = getMarketProfiler();
    const profile = profiler.getCurrentProfile();
    
    res.json({
      current: profile?.regime || 'R1',
      previousRegime: profile?.previousRegime || null,
      lastSwitch: profile?.lastSwitch || null,
      switchCount: profile?.lastSwitch ? 1 : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L12][API][ERROR] Failed to get regime history:', error);
    res.status(500).json({ error: 'Failed to get regime history' });
  }
});
