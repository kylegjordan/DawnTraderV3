/**
 * Phase 41F-C: Health Monitoring API Routes
 * Directive 8.8.4-A4.R10R-4: System Health Endpoint
 * 
 * Provides HTTP and WebSocket access to engine health metrics
 */

import { Router } from 'express';
import { healthMonitor } from '../services/health-monitor.js';
import { systemHealth } from '../services/system-health.js';
import { loadFullCalibration } from '../utils/calibration.js';
import { computeStrategyWeights, type StrategyWeightsBundle } from '../utils/strategyWeights.js';
import { computeExposureBias, getOverbiasedStrategies, type ExposureBiasBundle } from '../utils/strategyBias.js';
import { getDriftDetector, type StrategyDriftStatus } from '../services/drift-detector.js';
// Phase 13: Removed 15 L-series service imports (L12-L19 all deleted)

export const healthRouter = Router();

/**
 * GET /api/health/liveness
 * B-STAGING-LIVENESS-WATCH (#512/#520): the out-of-process watchdog's engine leg.
 * Unauthenticated by design — two low-sensitivity booleans, no positions/balances:
 *   engineExpected = system_context.isEngineActive (the resume path's own
 *                    expected-state flag; DB truth)
 *   engineRunning  = the in-process paper manager exists and reports running
 * expected=true + running=false sustained across watchdog ticks = the silent-halt
 * signature this batch exists to catch.
 */
healthRouter.get('/liveness', async (_req, res) => {
  try {
    const { storage } = await import('../storage.js');
    const { getGlobalActiveEngineManager } = await import('../services/active-engine-service.js');
    const paperContext = await storage.getSystemContext('paper');
    const manager = getGlobalActiveEngineManager('paper');
    res.json({
      engineExpected: paperContext?.isEngineActive === true,
      engineRunning: !!(manager as any)?.isRunning,
      // #649 (B-DEPLOY-LOCK): the RUNNING build's identity, so a deploy's
      // post-condition can assert "the process serving this response is the
      // code I just deployed" — a stale process serves a bare 200 perfectly
      // well, which is exactly the false-green the assertion exists to kill.
      // dt-deploy writes dist/BUILD_SHA at build; absent file → null, honest.
      // Path is CWD-relative, NOT import.meta.url-relative: esbuild flattens
      // this file into dist/index.js, which would silently repoint a
      // URL-relative read one directory too high. pm2 pins cwd to the app root.
      buildSha: await import('node:fs/promises')
        .then((fs) => fs.readFile('dist/BUILD_SHA', 'utf8'))
        .then((s) => s.trim())
        .catch(() => null),
      ts: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[LIVENESS] Error building liveness snapshot:', error.message);
    res.status(500).json({ error: 'liveness snapshot failed' });
  }
});

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

/**
 * Phase 41F-G: POST /api/health/recovery/test
 * Execute or plan recovery action (supports dry-run mode)
 */
healthRouter.post('/recovery/test', async (req, res) => {
  try {
    const { component, metric, level, dryRun } = req.body;

    console.log(`[41F-G][API] Recovery test requested: ${component}.${metric} (${level}) dryRun=${dryRun}`);

    // Execute recovery (or dry-run)
    const result = await healthMonitor.executeRecovery(component, metric, level || 'critical', dryRun);

    res.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[41F-G][API] Error executing recovery test:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Phase 41F-G: GET /api/health/circuit-breaker
 * Returns circuit breaker status
 */
healthRouter.get('/circuit-breaker', async (req, res) => {
  try {
    const status = healthMonitor.getCircuitBreakerStatus();
    
    res.json({
      ok: true,
      ...status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[41F-G][API] Error fetching circuit breaker status:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Directive 8.8.4-A4.R10R-4: GET /api/health
 * Directive 8.8.4-L8: Extended with per-strategy VTS calibration health
 * Returns system health metrics (CPU, memory, lag, uptime) + ML service status + VTS per-strategy
 */
healthRouter.get('/', async (req, res) => {
  try {
    const metrics = systemHealth.getMetrics();
    const status = systemHealth.getStatus();

    interface StrategyHealth {
      name: string;
      alpha: number;
      beta: number;
      sampleSize: number;
      warning?: string;
    }
    
    let vtsHealth: {
      status: string;
      lastCalibration: string | null;
      alpha: number;
      beta: number;
      sampleSize: number;
      stdError: number;
      warning: string | null;
      strategies: StrategyHealth[];
    } = {
      status: 'unknown',
      lastCalibration: null,
      alpha: 0.0018,
      beta: 0.19,
      sampleSize: 0,
      stdError: 0,
      warning: null,
      strategies: []
    };
    
    try {
      const fullCalibration = await loadFullCalibration();
      const global = fullCalibration.global;
      const betaDeviation = Math.abs(global.beta - 1.0);
      const stdError = global.stdError || 0;
      
      let warning: string | null = null;
      if (betaDeviation > 0.3) {
        warning = `β deviation high: |β-1|=${betaDeviation.toFixed(2)}`;
      } else if (stdError > 0.05) {
        warning = `Standard error high: ${stdError.toFixed(4)}`;
      }
      
      const strategies: StrategyHealth[] = [];
      for (const [name, cal] of Object.entries(fullCalibration.strategies)) {
        const stratBetaDev = Math.abs(cal.beta - 1.0);
        const stratStdError = cal.stdError || 0;
        let stratWarning: string | undefined;
        
        if (cal.sampleCount < 10) {
          stratWarning = `Insufficient samples: ${cal.sampleCount}`;
        } else if (stratBetaDev > 0.3) {
          stratWarning = `β deviation high: |β-1|=${stratBetaDev.toFixed(2)}`;
        } else if (stratStdError > 0.05) {
          stratWarning = `Standard error high: ${stratStdError.toFixed(4)}`;
        }
        
        strategies.push({
          name,
          alpha: cal.alpha,
          beta: cal.beta,
          sampleSize: cal.sampleCount,
          warning: stratWarning
        });
      }
      
      vtsHealth = {
        status: global.sampleCount >= 10 ? 'ok' : 'insufficient_data',
        lastCalibration: global.timestamp || new Date(global.updated).toISOString(),
        alpha: global.alpha,
        beta: global.beta,
        sampleSize: global.sampleCount,
        stdError,
        warning,
        strategies
      };
    } catch (e) {
      vtsHealth.status = 'error';
    }
    
    // L9: Compute strategy weights for health display
    let strategyWeightsData: Record<string, number> = {};
    try {
      const weightsBundle = await computeStrategyWeights();
      strategyWeightsData = weightsBundle.weights;
    } catch (e) {
      console.log('[L9][HEALTH] Failed to compute strategy weights');
    }
    
    // L10: Compute exposure bias for health display
    let exposureBiasData: Record<string, { weight: number; multiplier: number; allocPercent: number }> = {};
    let exposureBiasWarnings: string[] = [];
    try {
      const biasBundle = await computeExposureBias();
      for (const [strategy, bias] of Object.entries(biasBundle.strategies)) {
        exposureBiasData[strategy] = {
          weight: bias.weight,
          multiplier: bias.multiplier,
          allocPercent: bias.allocPercent
        };
      }
      exposureBiasWarnings = getOverbiasedStrategies();
    } catch (e) {
      console.log('[L10][HEALTH] Failed to compute exposure bias');
    }
    
    // L11: Get strategy drift status
    let strategyDriftData: Record<string, { score: number; status: string }> = {};
    let driftingStrategies: string[] = [];
    try {
      const driftDetector = getDriftDetector();
      const driftStatus = driftDetector.getStatus();
      for (const [strategy, status] of Object.entries(driftStatus)) {
        strategyDriftData[strategy] = {
          score: status.score,
          status: status.status
        };
        if (status.status === 'drifting' || status.status === 'recalibrating') {
          driftingStrategies.push(strategy);
        }
      }
    } catch (e) {
      console.log('[L11][HEALTH] Failed to get drift status');
    }
    
    // Phase 13: L12-L19 market regime, forecast, RL, MACO, DCE, APR-SLE, equity protection
    // data blocks removed (legacy supervisory loop — no frontend consumers)

    res.json({
      ok: true,
      healthy: status.healthy,
      metrics: {
        cpu: metrics.cpu,
        memory: metrics.memory,
        lag: metrics.lag,
        uptime: metrics.uptime,
        heapUsed: metrics.heapUsed,
        heapTotal: metrics.heapTotal,
        rss: metrics.rss,
      },
      vts: vtsHealth,
      strategyWeights: strategyWeightsData,
      exposureBias: {
        strategies: exposureBiasData,
        warnings: exposureBiasWarnings,
        total: Object.values(exposureBiasData).reduce((sum, b) => sum + b.allocPercent, 0).toFixed(1)
      },
      strategyDrift: {
        strategies: strategyDriftData,
        driftingStrategies,
        driftingCount: driftingStrategies.length
      },
      issues: status.issues,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[L9][API] Error fetching system health:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Phase 13: All L-series health helper functions removed
// (getMarketForecastHealth, getReinforcementEngineHealth, getMACOHealth,
//  getDCEHealth, getAPRSLEHealth, getEquityProtectionHealth, getMetaOptimizationHealth)
