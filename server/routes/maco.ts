/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L15
 * ══════════════════════════════════════════════════════════════════════════════
 * MACO API Routes - Multi-Agent Cooperative Optimizer
 * 
 * Endpoints:
 * - GET  /api/maco/status    - Returns active agents, exploration rate, global reward, consensus score
 * - POST /api/maco/sync      - Forces global consensus round
 * - GET  /api/maco/export    - Exports agent policy histories
 * - POST /api/maco/retrain   - Triggers full re-initialization and cooperative retrain (testuser123 only)
 * 
 * All routes require authentication.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getMACOCoordinator } from '../services/maco-coordinator';
import { getExplorationManager } from '../services/exploration-manager';
import { getPolicyConsensusEngine } from '../services/policy-consensus';

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
    const coordinator = getMACOCoordinator();
    const exploration = getExplorationManager();
    const consensus = getPolicyConsensusEngine();

    const coordStatus = coordinator.getStatus();
    const exploreStatus = exploration.getStatus();
    const consensusStatus = consensus.getStatus();

    const agentSummaries: Record<string, any> = {};
    for (const [strategy, agent] of Object.entries(coordStatus.agents)) {
      agentSummaries[strategy] = {
        allocation: agent.allocation,
        totalReward: agent.totalReward,
        confidence: agent.confidence,
        trainingIterations: agent.trainingIterations
      };
    }

    res.json({
      ok: true,
      agentsActive: coordStatus.agentCount,
      agents: agentSummaries,
      globalReward: coordStatus.globalReward,
      meanVariance: coordStatus.meanVariance,
      explorationRate: exploreStatus.epsilon,
      consensusScore: consensusStatus.consensusScore,
      policyConsensus: consensusStatus.policyConsensus,
      lastSync: coordStatus.lastSync,
      coordinator: {
        isRunning: coordStatus.isRunning
      },
      exploration: {
        isRunning: exploreStatus.isRunning,
        updateCount: exploreStatus.updateCount,
        sigmaGlobal: exploreStatus.sigmaGlobal
      },
      consensus: {
        isRunning: consensusStatus.isRunning,
        syncCount: consensusStatus.syncCount
      }
    });
  } catch (error) {
    console.error('[L15][API] Status error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get MACO status' });
  }
});

router.post('/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const coordinator = getMACOCoordinator();
    const exploration = getExplorationManager();
    const consensus = getPolicyConsensusEngine();

    const coordResult = await coordinator.sync();
    const exploreResult = await exploration.update();
    const consensusResult = await consensus.runConsensusRound();

    res.json({
      ok: true,
      coordinator: {
        success: coordResult.success,
        globalReward: coordResult.globalReward,
        meanVariance: coordResult.meanVariance
      },
      exploration: {
        success: exploreResult.success,
        epsilon: exploreResult.epsilon,
        variance: exploreResult.variance
      },
      consensus: {
        success: consensusResult.success,
        consensusScore: consensusResult.consensusScore,
        globalReward: consensusResult.globalReward
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L15][API] Sync error:', error);
    res.status(500).json({ ok: false, error: 'Failed to sync MACO' });
  }
});

router.get('/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
    const response = await fetch(`${mlServiceUrl}/maco/export`);
    
    if (!response.ok) {
      throw new Error(`ML service returned ${response.status}`);
    }

    const exportData = await response.json();

    const coordinator = getMACOCoordinator();
    const exploration = getExplorationManager();
    const consensus = getPolicyConsensusEngine();

    exportData.nodeServices = {
      coordinator: coordinator.getStatus(),
      exploration: exploration.getStatus(),
      consensus: consensus.getStatus()
    };

    res.json(exportData);
  } catch (error) {
    console.error('[L15][API] Export error:', error);
    res.status(500).json({ ok: false, error: 'Failed to export MACO data' });
  }
});

router.post('/retrain', requireAuth, requireTestUser, async (req: Request, res: Response) => {
  try {
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
    const response = await fetch(`${mlServiceUrl}/maco/retrain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`ML service returned ${response.status}`);
    }

    const result = await response.json();

    const coordinator = getMACOCoordinator();
    await coordinator.sync();

    const consensus = getPolicyConsensusEngine();
    const consensusResult = await consensus.runConsensusRound();

    res.json({
      ok: true,
      mlRetrain: result,
      consensusSync: consensusResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[L15][API] Retrain error:', error);
    res.status(500).json({ ok: false, error: 'Failed to retrain MACO agents' });
  }
});

export default router;
