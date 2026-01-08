/**
 * Directive 11.3 — Dynamic Sizing Engine Diagnostics Routes
 * 
 * Provides API endpoints for monitoring and debugging the DSE.
 */

import { Router } from 'express';
import { getDSEDiagnostics, getLastSizeDecision, getSizeHistory, resetDSEHistory } from '../core/risk/dynamic-sizing-engine.js';
import { getVolatilityCache, clearVolatilityCache } from '../core/metrics/market-metrics.js';
import { getCostCache, clearCostCache } from '../core/metrics/cost-metrics.js';

const router = Router();

router.get('/dse/status', (req, res) => {
  try {
    const diagnostics = getDSEDiagnostics();
    res.json({
      ok: true,
      schemaVersion: 'v1.5.6',
      directive: '11.3',
      ...diagnostics,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/dse/history', (req, res) => {
  try {
    const history = getSizeHistory();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    res.json({
      ok: true,
      count: history.length,
      history: history.slice(-limit),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/dse/last-decision', (req, res) => {
  try {
    const lastDecision = getLastSizeDecision();
    res.json({
      ok: true,
      lastDecision,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/dse/metrics-cache', (req, res) => {
  try {
    const volatilityCache = Object.fromEntries(getVolatilityCache());
    const costCache = Object.fromEntries(getCostCache());
    
    res.json({
      ok: true,
      volatility: {
        count: Object.keys(volatilityCache).length,
        symbols: volatilityCache,
      },
      cost: {
        count: Object.keys(costCache).length,
        symbols: costCache,
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/dse/reset', (req, res) => {
  try {
    resetDSEHistory();
    clearVolatilityCache();
    clearCostCache();
    res.json({ ok: true, message: 'DSE history and metrics caches cleared' });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
