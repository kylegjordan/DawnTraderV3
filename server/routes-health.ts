/**
 * Phase 41F-C: Health Monitoring API Routes
 * 
 * Provides HTTP and WebSocket access to engine health metrics
 */

import { Router } from 'express';
import { healthMonitor } from './services/health-monitor.js';

export const healthRouter = Router();

/**
 * GET /api/health/engine
 * Returns latest heartbeat + ring buffer
 */
healthRouter.get('/engine', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    
    const response = {
      latest: healthMonitor.getLatest(),
      ringBuffer: healthMonitor.getRingBuffer(limit),
      recoveryActions: healthMonitor.getRecoveryActions(10),
    };

    res.json(response);
  } catch (error: any) {
    console.error('[41F-C][API] Error fetching engine health:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health/summary
 * Returns reduced payload for widgets
 */
healthRouter.get('/summary', async (req, res) => {
  try {
    const summary = healthMonitor.getSummary();
    const latest = healthMonitor.getLatest();
    const recoveryActions = healthMonitor.getRecoveryActions(5);

    res.json({
      ...summary,
      timestamp: latest?.ts || new Date().toISOString(),
      recentRecoveries: recoveryActions.length,
    });
  } catch (error: any) {
    console.error('[41F-C][API] Error fetching health summary:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health/recovery
 * Returns recent recovery actions
 */
healthRouter.get('/recovery', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    
    res.json({
      actions: healthMonitor.getRecoveryActions(limit),
    });
  } catch (error: any) {
    console.error('[41F-C][API] Error fetching recovery actions:', error.message);
    res.status(500).json({ error: error.message });
  }
});
