import { Router, Request, Response } from 'express';
import { getGASPCoordinator } from '../services/gasp-coordinator';
import { getEquilibriumRestorer } from '../services/equilibrium-restorer';
import { applyStabilizationScaling, rollbackToBaseline, getCurrentDamping } from '../utils/stabilization-controller';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  try {
    const gasp = getGASPCoordinator();
    const restorer = getEquilibriumRestorer();
    
    const gaspStatus = gasp.getStatus();
    const restorerStatus = restorer.getStatus();
    const damping = getCurrentDamping();
    
    res.json({
      ...gaspStatus,
      equilibrium: restorerStatus,
      currentDamping: damping,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[L20][API] Error getting GASP status:', error);
    res.status(500).json({ ok: false, error: 'Failed to get GASP status' });
  }
});

router.post('/scan', async (req: Request, res: Response) => {
  try {
    const gasp = getGASPCoordinator();
    const status = await gasp.scan();
    
    res.json({
      ok: true,
      status,
      message: 'Global stability scan completed',
    });
  } catch (error) {
    console.error('[L20][API] Error running scan:', error);
    res.status(500).json({ ok: false, error: 'Failed to run stability scan' });
  }
});

router.post('/adjust', async (req: Request, res: Response) => {
  try {
    const result = await applyStabilizationScaling();
    
    res.json({
      ok: true,
      ...result,
      message: 'Stabilization scaling applied',
    });
  } catch (error) {
    console.error('[L20][API] Error applying adjustment:', error);
    res.status(500).json({ ok: false, error: 'Failed to apply stabilization' });
  }
});

router.post('/recover', async (req: Request, res: Response) => {
  try {
    const restorer = getEquilibriumRestorer();
    const result = await restorer.startRecovery();
    
    res.json({
      ok: result.success,
      ...result,
    });
  } catch (error) {
    console.error('[L20][API] Error initiating recovery:', error);
    res.status(500).json({ ok: false, error: 'Failed to initiate recovery' });
  }
});

router.post('/recover/complete', async (req: Request, res: Response) => {
  try {
    const restorer = getEquilibriumRestorer();
    const result = await restorer.forceComplete();
    
    res.json({
      ok: result.success,
      ...result,
    });
  } catch (error) {
    console.error('[L20][API] Error completing recovery:', error);
    res.status(500).json({ ok: false, error: 'Failed to complete recovery' });
  }
});

router.post('/recover/cancel', async (req: Request, res: Response) => {
  try {
    const restorer = getEquilibriumRestorer();
    const result = await restorer.cancelRecovery();
    
    res.json({
      ok: result.success,
      ...result,
    });
  } catch (error) {
    console.error('[L20][API] Error cancelling recovery:', error);
    res.status(500).json({ ok: false, error: 'Failed to cancel recovery' });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const gasp = getGASPCoordinator();
    const restorer = getEquilibriumRestorer();
    
    const limit = parseInt(req.query.limit as string) || 100;
    
    const stabilityHistory = gasp.getHistory().slice(-limit);
    const recoveryEvents = restorer.getEvents().slice(-limit);
    
    res.json({
      ok: true,
      stabilityHistory,
      recoveryEvents,
      count: {
        stability: stabilityHistory.length,
        recovery: recoveryEvents.length,
      },
    });
  } catch (error) {
    console.error('[L20][API] Error getting history:', error);
    res.status(500).json({ ok: false, error: 'Failed to get history' });
  }
});

router.post('/recalibrate', async (req: Request, res: Response) => {
  try {
    const { w1, w2, w3, w4 } = req.body;
    
    const gasp = getGASPCoordinator();
    gasp.recalibrateWeights({ w1, w2, w3, w4 });
    
    res.json({
      ok: true,
      config: gasp.getConfig(),
      message: 'GSI weights recalibrated',
    });
  } catch (error) {
    console.error('[L20][API] Error recalibrating:', error);
    res.status(500).json({ ok: false, error: 'Failed to recalibrate' });
  }
});

router.post('/rollback', async (req: Request, res: Response) => {
  try {
    const result = await rollbackToBaseline();
    
    res.json({
      ok: true,
      ...result,
      message: 'Rolled back to baseline coefficients',
    });
  } catch (error) {
    console.error('[L20][API] Error rolling back:', error);
    res.status(500).json({ ok: false, error: 'Failed to rollback' });
  }
});

router.post('/reset', async (req: Request, res: Response) => {
  try {
    const gasp = getGASPCoordinator();
    const restorer = getEquilibriumRestorer();
    
    gasp.reset();
    restorer.reset();
    await rollbackToBaseline();
    
    res.json({
      ok: true,
      message: 'GASP system reset to defaults',
    });
  } catch (error) {
    console.error('[L20][API] Error resetting:', error);
    res.status(500).json({ ok: false, error: 'Failed to reset' });
  }
});

export default router;
