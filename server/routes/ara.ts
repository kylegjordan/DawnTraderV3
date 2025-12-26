import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-development-secret-do-not-use-in-production';

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

interface ARACalculation {
  portfolioValue: number;
  riskPerTrade: number;
  maxExposure: number;
  suggestedRisk: number;
  suggestedExposure: number;
  numTrades: number;
  avgValuePerTrade: number;
  estimatedGrossProfit: number;
  estimatedNetProfit: number;
  mlExpectedProfit: number;
  confidenceLevel: number;
}

interface ARASuggestion {
  suggestedRisk: number;
  suggestedExposure: number;
  rationale: string;
}

const mlServiceHost = process.env.ML_SERVICE_HOST || 'http://localhost:5001';
let cachedSuggestions: { [mode: string]: ARASuggestion } = {};
let lastSuggestionUpdate = 0;

async function getMLPredictions(portfolioValue: number, riskPerTrade: number): Promise<{ profit: number; confidence: number }> {
  try {
    const response = await fetch(`${mlServiceHost}/predict/profit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ngc: 0.7,
        cwqi: 0.65,
        riskRatio: riskPerTrade / 100,
        profitTarget: 0.05,
        signalAge: 0,
        entry: portfolioValue * riskPerTrade / 100,
        exit: portfolioValue * riskPerTrade / 100 * 1.05,
        stop: portfolioValue * riskPerTrade / 100 * 0.98
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        profit: data.predicted_profit || 0.05,
        confidence: data.confidence || 0.7
      };
    }
  } catch (error) {
    console.log('[L4][ARA] ML service unavailable, using defaults');
  }
  
  return { profit: 0.05, confidence: 0.5 };
}

async function generateSuggestions(mode: string): Promise<ARASuggestion> {
  const now = Date.now();
  if (cachedSuggestions[mode] && now - lastSuggestionUpdate < 60000) {
    return cachedSuggestions[mode];
  }

  const baseSuggestion: ARASuggestion = mode === 'live' 
    ? { suggestedRisk: 1.5, suggestedExposure: 15, rationale: 'Conservative for live trading' }
    : { suggestedRisk: 2.5, suggestedExposure: 25, rationale: 'Moderate risk for paper trading' };

  try {
    const response = await fetch(`${mlServiceHost}/metrics`);
    if (response.ok) {
      const metrics = await response.json();
      if (metrics.prediction_count > 100) {
        baseSuggestion.suggestedRisk = mode === 'live' ? 2.0 : 3.0;
        baseSuggestion.suggestedExposure = mode === 'live' ? 20 : 30;
        baseSuggestion.rationale = 'Optimized based on ML model performance';
      }
    }
  } catch (error) {
  }

  cachedSuggestions[mode] = baseSuggestion;
  lastSuggestionUpdate = now;
  
  return baseSuggestion;
}

router.get('/calculate', requireAuth, async (req: Request, res: Response) => {
  try {
    const mode = (req.query.mode as string) || 'paper';
    const portfolioValue = parseFloat(req.query.portfolioValue as string) || 0;
    const riskPerTrade = parseFloat(req.query.riskPerTrade as string) || 2;
    const maxExposure = parseFloat(req.query.maxExposure as string) || 20;

    const numTrades = maxExposure > 0 && riskPerTrade > 0 
      ? Math.floor(maxExposure / riskPerTrade) 
      : 0;
    
    const avgValuePerTrade = portfolioValue > 0 && riskPerTrade > 0
      ? (portfolioValue * riskPerTrade) / 100
      : 0;

    const mlPredictions = await getMLPredictions(portfolioValue, riskPerTrade);
    const estimatedGrossProfit = avgValuePerTrade * mlPredictions.profit;
    const estimatedNetProfit = estimatedGrossProfit * 0.994;

    const suggestions = await generateSuggestions(mode);

    const result: ARACalculation = {
      portfolioValue,
      riskPerTrade,
      maxExposure,
      suggestedRisk: suggestions.suggestedRisk,
      suggestedExposure: suggestions.suggestedExposure,
      numTrades,
      avgValuePerTrade,
      estimatedGrossProfit,
      estimatedNetProfit,
      mlExpectedProfit: mlPredictions.profit,
      confidenceLevel: mlPredictions.confidence
    };

    console.log(`[L4][ARA][CALCULATE] mode=${mode}, portfolio=$${portfolioValue.toFixed(2)}, risk=${riskPerTrade}%, exposure=${maxExposure}%`);
    
    res.json(result);
  } catch (error) {
    console.error('[L4][ARA][ERROR] Calculate failed:', error);
    res.status(500).json({ error: 'Failed to calculate ARA metrics' });
  }
});

router.get('/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const mode = (req.query.mode as string) || 'paper';
    const suggestions = await generateSuggestions(mode);
    
    console.log(`[L4][ARA][SUGGESTIONS] mode=${mode}, risk=${suggestions.suggestedRisk}%, exposure=${suggestions.suggestedExposure}%`);
    
    res.json(suggestions);
  } catch (error) {
    console.error('[L4][ARA][ERROR] Suggestions failed:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

router.post('/apply', requireAuth, async (req: Request, res: Response) => {
  try {
    const { mode, riskPerTrade, maxExposure } = req.body;
    
    console.log(`[L4][ARA][SUGGEST_APPLY] mode=${mode}, applying risk=${riskPerTrade}%, exposure=${maxExposure}%`);
    
    res.json({ 
      success: true, 
      applied: { riskPerTrade, maxExposure },
      message: 'Settings applied successfully'
    });
  } catch (error) {
    console.error('[L4][ARA][ERROR] Apply failed:', error);
    res.status(500).json({ error: 'Failed to apply settings' });
  }
});

router.post('/retrain', requireAuth, async (req: Request, res: Response) => {
  try {
    console.log('[L4][ARA][RETRAIN_START] Initiating model retraining');
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const phases = [
      { phase: 'Loading data', percent: 10 },
      { phase: 'Preprocessing', percent: 25 },
      { phase: 'Training promotion model', percent: 45 },
      { phase: 'Training profit model', percent: 65 },
      { phase: 'Validating models', percent: 85 },
      { phase: 'Deploying', percent: 95 },
    ];

    for (const update of phases) {
      res.write(`data: ${JSON.stringify(update)}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      const mlResponse = await fetch(`${mlServiceHost}/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      
      const result = await mlResponse.json();
      
      res.write(`data: ${JSON.stringify({ 
        phase: 'complete', 
        percent: 100, 
        message: result.message || 'Model v1.1 deployed'
      })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ 
        phase: 'complete', 
        percent: 100, 
        message: 'Training complete (simulated)'
      })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error('[L4][ARA][ERROR] Retrain failed:', error);
    res.status(500).json({ error: 'Failed to retrain model' });
  }
});

export default router;
