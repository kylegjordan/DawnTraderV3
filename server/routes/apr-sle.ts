/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-L17: APR-SLE API Routes
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { getAPRSLEEngine } from '../services/apr-sle-engine';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  try {
    const engine = getAPRSLEEngine();
    const status = engine.getStatus();
    
    res.json({
      ok: true,
      status: status.isRunning ? 'active' : 'inactive',
      mean_DI: status.meanDI,
      avg_tp_adj: `${status.avgTPAdjPct >= 0 ? '+' : ''}${status.avgTPAdjPct.toFixed(1)}%`,
      avg_sl_adj: `${status.avgSLAdjPct >= 0 ? '+' : ''}${status.avgSLAdjPct.toFixed(1)}%`,
      vol_comp: status.volCompensation,
      current_regime: status.currentRegime,
      di_slope: status.avgDISlope,
      config: status.config,
      last_recalibration: status.lastRecalibration,
      recalibration_count: status.recalibrationCount,
      sample_count: status.sampleCount,
    });
  } catch (error) {
    console.error('[L17][APR-SLE][API] Status error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get APR-SLE status' });
  }
});

router.post('/recalibrate', async (req: Request, res: Response) => {
  try {
    const engine = getAPRSLEEngine();
    const { tradeResults } = req.body;
    
    const result = await engine.recalibrate(tradeResults);
    
    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[L17][APR-SLE][API] Recalibrate error:', error);
    res.status(500).json({ ok: false, error: 'Failed to recalibrate APR-SLE' });
  }
});

router.post('/preview', async (req: Request, res: Response) => {
  try {
    const engine = getAPRSLEEngine();
    const { riskAmount = 100 } = req.body;
    
    const preview = engine.preview(riskAmount);
    
    res.json({
      ok: true,
      ...preview,
      description: {
        tp_adjustment: `${preview.tpAdjustmentPct >= 0 ? '+' : ''}${preview.tpAdjustmentPct.toFixed(1)}%`,
        sl_adjustment: `${preview.slAdjustmentPct >= 0 ? '+' : ''}${preview.slAdjustmentPct.toFixed(1)}%`,
        regime_context: `Current regime: ${preview.regime}`,
        volatility_context: `Volatility compensation: ${(preview.volCompensation * 100).toFixed(0)}%`,
      },
    });
  } catch (error) {
    console.error('[L17][APR-SLE][API] Preview error:', error);
    res.status(500).json({ ok: false, error: 'Failed to preview APR-SLE' });
  }
});

router.post('/reset', async (req: Request, res: Response) => {
  try {
    const engine = getAPRSLEEngine();
    engine.reset();
    
    const status = engine.getStatus();
    
    res.json({
      ok: true,
      message: 'APR-SLE reset to baseline defaults',
      config: status.config,
    });
  } catch (error) {
    console.error('[L17][APR-SLE][API] Reset error:', error);
    res.status(500).json({ ok: false, error: 'Failed to reset APR-SLE' });
  }
});

router.post('/compute', async (req: Request, res: Response) => {
  try {
    const engine = getAPRSLEEngine();
    const { riskAmount, di, volatility, regime } = req.body;
    
    if (typeof riskAmount !== 'number' || typeof di !== 'number') {
      return res.status(400).json({ ok: false, error: 'riskAmount and di are required numbers' });
    }
    
    const result = engine.computeAdaptiveExits(
      riskAmount,
      di,
      volatility || 0.02,
      regime || 'R1'
    );
    
    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[L17][APR-SLE][API] Compute error:', error);
    res.status(500).json({ ok: false, error: 'Failed to compute adaptive exits' });
  }
});

export default router;
