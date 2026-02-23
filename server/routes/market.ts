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
import { getRegimePerformanceTracker } from '../services/regime-performance';
import { getProactiveAllocator } from '../services/proactive-allocator';

export const marketRouter = Router();

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

// ══════════════════════════════════════════════════════════════════════════════
// L13: Regime Performance Attribution & Predictive Switch Forecasting
// ══════════════════════════════════════════════════════════════════════════════

marketRouter.get('/performance', requireAuth, async (req: Request, res: Response) => {
  try {
    const rpt = getRegimePerformanceTracker();
    const stats = rpt.getPerformanceSummary();
    const topPerformer = rpt.getTopPerformer();
    
    res.json({
      stats,
      topPerformer: topPerformer ? {
        regime: topPerformer.regime,
        description: REGIME_DESCRIPTIONS[topPerformer.regime],
        avgPnL: topPerformer.stats.pnl,
        stability: topPerformer.stats.stability
      } : null,
      rptActive: rpt.isRunningStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L13][API][ERROR] Failed to get regime performance:', error);
    res.status(500).json({ error: 'Failed to get regime performance' });
  }
});

marketRouter.get('/transitions', requireAuth, async (req: Request, res: Response) => {
  try {
    const pa = getProactiveAllocator();
    const prediction = pa.getPrediction();
    const adjustments = pa.getAdjustments();
    
    if (!prediction) {
      return res.json({
        current: 'R1',
        predicted_next: 'R1',
        confidence: 0.5,
        probabilities: { T1: 0.2, T2: 0.2, R1: 0.2, V1: 0.2, C1: 0.2 },
        forecastHorizon: '15m',
        biases: [],
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      current: prediction.current,
      currentDescription: REGIME_DESCRIPTIONS[prediction.current],
      predicted_next: prediction.predicted_next,
      predictedDescription: REGIME_DESCRIPTIONS[prediction.predicted_next],
      confidence: prediction.confidence,
      probabilities: prediction.probabilities,
      forecastHorizon: adjustments?.forecastHorizon || '15m',
      biases: adjustments?.biases.filter(b => Math.abs(b.blendedBias - 1) > 0.05) || [],
      exposureMultiplier: adjustments?.exposureMultiplier || 1.0,
      riskMultiplier: adjustments?.riskMultiplier || 1.0,
      paActive: pa.isRunningStatus(),
      timestamp: prediction.timestamp
    });
  } catch (error) {
    console.error('[L13][API][ERROR] Failed to get transitions:', error);
    res.status(500).json({ error: 'Failed to get transitions' });
  }
});

marketRouter.post('/retrain_transitions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.username !== 'testuser123') {
      return res.status(403).json({ error: 'Only testuser123 can retrain the transition model' });
    }
    
    const pa = getProactiveAllocator();
    const result = await pa.triggerRetrain();
    
    res.json({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L13][API][ERROR] Failed to retrain transitions:', error);
    res.status(500).json({ error: 'Failed to retrain transitions' });
  }
});
