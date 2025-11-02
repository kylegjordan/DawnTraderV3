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

/**
 * Phase 41F-F: GET /api/health/recovery/log
 * Returns recent recovery events (recovery actions + anomalies)
 */
healthRouter.get('/recovery/log', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    
    const recoveries = healthMonitor.getRecoveryActions(limit);
    const anomalies = healthMonitor.getAnomalies(limit);

    res.json({
      ok: true,
      recoveries,
      anomalies,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[41F-F][API] Error fetching recovery log:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Phase 41F-F: POST /api/health/recovery/trigger
 * Manual recovery test (for fault injection)
 */
healthRouter.post('/recovery/trigger', async (req, res) => {
  try {
    const { component, reason } = req.body;

    console.log(`[41F-F][API] Manual recovery trigger requested: ${component} - ${reason}`);

    // Log a test recovery action
    const testRecovery = {
      timestamp: new Date().toISOString(),
      component: component || 'manual_test',
      issue: reason || 'Manual recovery test triggered',
      action: 'manual_trigger',
      success: true,
      details: { triggeredBy: 'api', endpoint: '/api/health/recovery/trigger' },
    };

    res.json({
      ok: true,
      message: 'Manual recovery trigger logged',
      recovery: testRecovery,
    });
  } catch (error: any) {
    console.error('[41F-F][API] Error triggering manual recovery:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Phase 41F-F: GET /api/health/anomalies
 * Returns detected anomalies
 */
healthRouter.get('/anomalies', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const level = req.query.level as 'warning' | 'critical' | undefined;
    
    let anomalies = healthMonitor.getAnomalies(limit);
    
    // Filter by level if specified
    if (level) {
      anomalies = anomalies.filter(a => a.level === level);
    }

    res.json({
      ok: true,
      anomalies,
      count: anomalies.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[41F-F][API] Error fetching anomalies:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});
