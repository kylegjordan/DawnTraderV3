/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 8.8.4-L18: PDC-ECS API Routes
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import { getPDCEngine } from '../services/pdc-engine';
import { getECSController } from '../services/ecs-controller';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  try {
    const pdc = getPDCEngine();
    const ecs = getECSController();
    
    const pdcStatus = pdc.getStatus();
    const ecsStatus = ecs.getStatus();
    
    res.json({
      ok: true,
      drawdownRiskScore: pdcStatus.metrics.drawdownRiskScore,
      equitySlope: pdcStatus.metrics.equitySlope,
      volRatio: pdcStatus.metrics.volRatio,
      DI_drift: pdcStatus.metrics.diDrift,
      containmentActive: pdcStatus.metrics.containmentActive,
      warningActive: pdcStatus.metrics.warningActive,
      exposureMultiplier: ecsStatus.currentOutput.exposureMultiplier,
      riskMultiplier: ecsStatus.currentOutput.riskPerTradeMultiplier,
      frequencyMultiplier: ecsStatus.currentOutput.tradeFrequencyMultiplier,
      dampingActive: ecsStatus.currentOutput.dampingActive,
      recoveryProgress: ecsStatus.currentOutput.recoveryProgress,
      drsHistory: pdc.getDRSHistory(),
      pdcConfig: pdcStatus.config,
      ecsConfig: ecsStatus.config,
      lastRecalibration: pdcStatus.lastRecalibration,
      recalibrationCount: pdcStatus.recalibrationCount,
      equitySamples: pdcStatus.equitySamples,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[L18][PDC-ECS][API] Status error:', error);
    res.status(500).json({ ok: false, error: 'Failed to get PDC-ECS status' });
  }
});

router.post('/recalibrate', async (req: Request, res: Response) => {
  try {
    const pdc = getPDCEngine();
    const { tradeResults } = req.body;
    
    const result = await pdc.recalibrate(tradeResults);
    
    res.json({
      ok: true,
      ...result,
      message: `Recalibrated with ${result.samplesUsed} samples`,
    });
  } catch (error) {
    console.error('[L18][PDC-ECS][API] Recalibrate error:', error);
    res.status(500).json({ ok: false, error: 'Failed to recalibrate PDC' });
  }
});

router.post('/reset', async (req: Request, res: Response) => {
  try {
    const pdc = getPDCEngine();
    const ecs = getECSController();
    
    pdc.reset();
    ecs.reset();
    
    res.json({
      ok: true,
      message: 'PDC-ECS reset to baseline defaults',
      pdcConfig: pdc.getStatus().config,
      ecsConfig: ecs.getStatus().config,
    });
  } catch (error) {
    console.error('[L18][PDC-ECS][API] Reset error:', error);
    res.status(500).json({ ok: false, error: 'Failed to reset PDC-ECS' });
  }
});

router.post('/preview', async (req: Request, res: Response) => {
  try {
    const pdc = getPDCEngine();
    const ecs = getECSController();
    
    const { drs } = req.body;
    const useDRS = typeof drs === 'number' ? drs : pdc.getDrawdownRiskScore();
    
    const ecsPreview = ecs.preview(useDRS);
    
    res.json({
      ok: true,
      inputDRS: useDRS,
      preview: {
        exposureMultiplier: ecsPreview.exposureMultiplier,
        riskMultiplier: ecsPreview.riskPerTradeMultiplier,
        frequencyMultiplier: ecsPreview.tradeFrequencyMultiplier,
        dampingActive: ecsPreview.dampingActive,
        recoveryProgress: ecsPreview.recoveryProgress,
      },
      interpretation: {
        exposureChange: `${((ecsPreview.exposureMultiplier - 1) * 100).toFixed(1)}%`,
        riskChange: `${((ecsPreview.riskPerTradeMultiplier - 1) * 100).toFixed(1)}%`,
        frequencyChange: `${((ecsPreview.tradeFrequencyMultiplier - 1) * 100).toFixed(1)}%`,
        status: useDRS > 0.8 ? 'CONTAINMENT' : useDRS > 0.6 ? 'WARNING' : 'NORMAL',
      },
    });
  } catch (error) {
    console.error('[L18][PDC-ECS][API] Preview error:', error);
    res.status(500).json({ ok: false, error: 'Failed to preview PDC-ECS adjustment' });
  }
});

router.post('/scan', async (req: Request, res: Response) => {
  try {
    const pdc = getPDCEngine();
    const ecs = getECSController();
    
    const pdcMetrics = await pdc.runPredictiveScan();
    const ecsOutput = ecs.computeAdjustment(pdcMetrics.drawdownRiskScore);
    
    res.json({
      ok: true,
      pdc: pdcMetrics,
      ecs: ecsOutput,
      message: `Scan complete - DRS: ${pdcMetrics.drawdownRiskScore.toFixed(3)}`,
    });
  } catch (error) {
    console.error('[L18][PDC-ECS][API] Scan error:', error);
    res.status(500).json({ ok: false, error: 'Failed to run PDC-ECS scan' });
  }
});

router.post('/record-equity', async (req: Request, res: Response) => {
  try {
    const pdc = getPDCEngine();
    const { equity } = req.body;
    
    if (typeof equity !== 'number') {
      return res.status(400).json({ ok: false, error: 'equity must be a number' });
    }
    
    pdc.recordEquitySample(equity);
    
    res.json({
      ok: true,
      message: 'Equity sample recorded',
      sampleCount: pdc.getStatus().equitySamples,
    });
  } catch (error) {
    console.error('[L18][PDC-ECS][API] Record equity error:', error);
    res.status(500).json({ ok: false, error: 'Failed to record equity sample' });
  }
});

export default router;
