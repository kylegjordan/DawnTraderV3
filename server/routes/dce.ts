/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-L16: Decision Confidence Engine API Routes
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { getDecisionConfidenceEngine, SignalMetrics } from '../services/decision-confidence-engine';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  try {
    const dce = getDecisionConfidenceEngine();
    const status = dce.getStatus();
    
    res.json({
      ok: true,
      ...status,
      weightProfile: [
        status.weights.cwqi,
        status.weights.ngc,
        status.weights.mlConfidence,
        status.weights.regimeConfidence,
        status.weights.macoConsensus
      ]
    });
  } catch (error) {
    console.error('[L16][DCE][API] Status error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get DCE status' });
  }
});

router.post('/compute', async (req: Request, res: Response) => {
  try {
    const dce = getDecisionConfidenceEngine();
    const { symbol, strategy, cwqi, ngc, mlConfidence, regimeConfidence, macoConsensus } = req.body;
    
    const parseMetric = (val: any, defaultVal: number = 0.5): number => {
      if (val === null || val === undefined || val === '') return defaultVal;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? defaultVal : parsed;
    };
    
    const metrics: SignalMetrics = {
      symbol: symbol || 'UNKNOWN',
      strategy: strategy || 'unknown',
      cwqi: parseMetric(cwqi),
      ngc: parseMetric(ngc),
      mlConfidence: parseMetric(mlConfidence),
      regimeConfidence: parseMetric(regimeConfidence),
      macoConsensus: parseMetric(macoConsensus)
    };
    
    const result = dce.computeDecisionIndex(metrics);
    
    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('[L16][DCE][API] Compute error:', error);
    res.status(500).json({ ok: false, error: 'Failed to compute Decision Index' });
  }
});

router.post('/recalibrate', async (req: Request, res: Response) => {
  try {
    const dce = getDecisionConfidenceEngine();
    const { performance } = req.body;
    
    const result = await dce.recalibrate(performance);
    
    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('[L16][DCE][API] Recalibrate error:', error);
    res.status(500).json({ ok: false, error: 'Failed to recalibrate weights' });
  }
});

router.get('/weights', async (req: Request, res: Response) => {
  try {
    const dce = getDecisionConfidenceEngine();
    const weights = dce.getWeights();
    
    res.json({
      ok: true,
      weights,
      labels: ['CWQI', 'NGC', 'ML Confidence', 'Regime Confidence', 'MACO Consensus'],
      values: [
        weights.cwqi,
        weights.ngc,
        weights.mlConfidence,
        weights.regimeConfidence,
        weights.macoConsensus
      ]
    });
  } catch (error) {
    console.error('[L16][DCE][API] Weights error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get weights' });
  }
});

router.get('/top-signal', async (req: Request, res: Response) => {
  try {
    const dce = getDecisionConfidenceEngine();
    const topSignal = dce.getTopSignal();
    
    res.json({
      ok: true,
      topSignal
    });
  } catch (error) {
    console.error('[L16][DCE][API] Top signal error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get top signal' });
  }
});

export default router;
