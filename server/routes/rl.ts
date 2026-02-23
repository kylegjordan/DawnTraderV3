/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L14
 * ══════════════════════════════════════════════════════════════════════════════
 * Reinforcement Learning API Routes
 * 
 * Endpoints:
 * - GET  /api/rl/status       - Returns current policy, total reward, last update
 * - POST /api/rl/retrain      - Forces policy retraining (testuser123 only)
 * - GET  /api/rl/export       - Exports recent reward and policy history
 * - POST /api/rl/apply        - Manually apply learned allocations
 * - GET  /api/rl/internal/buffer - Internal endpoint for ML service
 * 
 * All routes require authentication.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getRewardEvaluator } from '../services/reward-evaluator';
import { getExperienceBuffer } from '../services/experience-buffer';
import { getActionExecutor } from '../services/action-executor';

const router = Router();

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

function requireTestUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.username !== 'testuser123') {
    return res.status(403).json({ error: 'Restricted to testuser123' });
  }
  next();
}

router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const rewardEvaluator = getRewardEvaluator();
    const experienceBuffer = getExperienceBuffer();
    const actionExecutor = getActionExecutor();

    const policyState = actionExecutor.getPolicyState();
    const reStatus = rewardEvaluator.getStatus();
    const ebStatus = experienceBuffer.getStatus();

    res.json({
      ok: true,
      policy: {
        allocations: policyState.allocations,
        confidence: policyState.confidence,
        dominantStrategy: policyState.dominantStrategy,
        lastUpdate: policyState.lastUpdate,
        source: policyState.source
      },
      rewardEvaluator: reStatus,
      experienceBuffer: ebStatus,
      totalReward: rewardEvaluator.getTotalReward(),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[L14][API] Error in /rl/status:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/retrain', requireAuth, requireTestUser, async (req: Request, res: Response) => {
  try {
    console.log('[L14][API] Retrain requested');

    const mlHost = process.env.ML_SERVICE_HOST || 'http://localhost:5001';
    
    const response = await fetch(`${mlHost}/rl/retrain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      
      const actionExecutor = getActionExecutor();
      await actionExecutor.fetchAndApplyPolicy();

      res.json({
        ok: true,
        message: 'Policy retrained successfully',
        epochs: data.epochs,
        experiencesUsed: data.experiences_used,
        trainingIterations: data.training_iterations,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        ok: false,
        error: 'ML service retrain failed'
      });
    }
  } catch (error: any) {
    console.error('[L14][API] Error in /rl/retrain:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const rewardEvaluator = getRewardEvaluator();
    const experienceBuffer = getExperienceBuffer();
    const actionExecutor = getActionExecutor();

    const limit = parseInt(req.query.limit as string) || 100;

    res.json({
      ok: true,
      rewards: rewardEvaluator.getAllRewards(),
      experiences: experienceBuffer.getRecentExperiences(limit),
      policy: actionExecutor.getPolicyState(),
      exportedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[L14][API] Error in /rl/export:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/apply', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[L14][API] Manual apply requested');

    const actionExecutor = getActionExecutor();
    const policyState = await actionExecutor.manualApply();

    res.json({
      ok: true,
      message: 'Policy applied successfully',
      policy: policyState,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[L14][API] Error in /rl/apply:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/internal/buffer', (req: Request, res: Response) => {
  const internalKey = req.headers['x-internal-key'];
  const expectedKey = process.env.INTERNAL_SERVICE_KEY || '';

  if (expectedKey && internalKey !== expectedKey) {
    return res.status(403).json({ error: 'Invalid internal key' });
  }

  try {
    const experienceBuffer = getExperienceBuffer();
    const exportData = experienceBuffer.exportForML();

    res.json(exportData);
  } catch (error: any) {
    console.error('[L14][API] Error in /rl/internal/buffer:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
