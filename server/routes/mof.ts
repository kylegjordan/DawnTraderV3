import { Router, Request, Response } from 'express';
import { getMOFOrchestrator } from '../services/mof-orchestrator';
import { aggregatePerformance, getKPIHistory } from '../utils/performance-aggregator';

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  try {
    const orchestrator = getMOFOrchestrator();
    const status = orchestrator.getStatus();
    
    res.json({
      ok: true,
      ...status,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[L19][API] Error getting MOF status:', error);
    res.status(500).json({ ok: false, error: 'Failed to get MOF status' });
  }
});

router.post('/evolve', async (req: Request, res: Response) => {
  try {
    const orchestrator = getMOFOrchestrator();
    const result = await orchestrator.evolve();
    
    res.json({
      ok: true,
      ...result,
      message: 'Policy evolution cycle completed',
    });
  } catch (error) {
    console.error('[L19][API] Error evolving policy:', error);
    res.status(500).json({ ok: false, error: 'Failed to evolve policy' });
  }
});

router.get('/weights', async (req: Request, res: Response) => {
  try {
    const orchestrator = getMOFOrchestrator();
    const metaWeights = orchestrator.getWeights();
    const lambdaWeights = orchestrator.getLambdas();
    
    res.json({
      ok: true,
      metaWeights,
      lambdaWeights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[L19][API] Error getting weights:', error);
    res.status(500).json({ ok: false, error: 'Failed to get weights' });
  }
});

router.post('/weights', async (req: Request, res: Response) => {
  try {
    const { lambdas } = req.body;
    
    if (lambdas) {
      const orchestrator = getMOFOrchestrator();
      orchestrator.setLambdas(lambdas);
      
      res.json({
        ok: true,
        lambdaWeights: orchestrator.getLambdas(),
        message: 'Lambda weights updated',
      });
    } else {
      res.status(400).json({ ok: false, error: 'No lambda weights provided' });
    }
  } catch (error) {
    console.error('[L19][API] Error setting weights:', error);
    res.status(500).json({ ok: false, error: 'Failed to set weights' });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const orchestrator = getMOFOrchestrator();
    const limit = parseInt(req.query.limit as string) || 50;
    const history = orchestrator.getHistory().slice(-limit);
    
    res.json({
      ok: true,
      history,
      count: history.length,
      totalCount: orchestrator.getHistory().length,
    });
  } catch (error) {
    console.error('[L19][API] Error getting history:', error);
    res.status(500).json({ ok: false, error: 'Failed to get history' });
  }
});

router.post('/reset', async (req: Request, res: Response) => {
  try {
    const orchestrator = getMOFOrchestrator();
    orchestrator.reset();
    
    res.json({
      ok: true,
      metaWeights: orchestrator.getWeights(),
      message: 'Weights reset to equal distribution',
    });
  } catch (error) {
    console.error('[L19][API] Error resetting weights:', error);
    res.status(500).json({ ok: false, error: 'Failed to reset weights' });
  }
});

router.post('/aggregate', async (req: Request, res: Response) => {
  try {
    const metrics = await aggregatePerformance();
    const orchestrator = getMOFOrchestrator();
    await orchestrator.aggregateKPIs();
    
    res.json({
      ok: true,
      metrics,
      currentJ: orchestrator.getStatus().currentJ,
      message: 'KPIs aggregated successfully',
    });
  } catch (error) {
    console.error('[L19][API] Error aggregating KPIs:', error);
    res.status(500).json({ ok: false, error: 'Failed to aggregate KPIs' });
  }
});

router.get('/kpi-history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const history = getKPIHistory().slice(-limit);
    
    res.json({
      ok: true,
      history,
      count: history.length,
    });
  } catch (error) {
    console.error('[L19][API] Error getting KPI history:', error);
    res.status(500).json({ ok: false, error: 'Failed to get KPI history' });
  }
});

router.post('/drift-check', async (req: Request, res: Response) => {
  try {
    const orchestrator = getMOFOrchestrator();
    const result = await orchestrator.checkDrift();
    
    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[L19][API] Error checking drift:', error);
    res.status(500).json({ ok: false, error: 'Failed to check drift' });
  }
});

export default router;
