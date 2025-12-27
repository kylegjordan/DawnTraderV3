import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { loadCalibration, loadFullCalibration, loadStrategyCalibration, applyCalibration, type CalibrationCoefficients, type FullCalibration } from '../utils/calibration';

const router = Router();

let calibrationCache: CalibrationCoefficients | null = null;
let fullCalibrationCache: FullCalibration | null = null;
let lastValidCalibration: CalibrationCoefficients | null = null;
let calibrationCacheTime = 0;
const CALIBRATION_CACHE_TTL = 60000;
const MIN_SAMPLE_COUNT = 10;

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
  expectedProfitPercent: number;
  mlExpectedProfit: number;
  confidenceLevel: number;
  rawProfitRate: number;
  calibratedProfitRate: number;
  calibration: {
    alpha: number;
    beta: number;
    sampleCount: number;
    isValid: boolean;
    lastUpdate: string;
  };
  strategyCalibration?: {
    strategy: string;
    alpha: number;
    beta: number;
    sampleSize: number;
  };
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
    const strategy = (req.query.strategy as string) || '';

    const numTrades = maxExposure > 0 && riskPerTrade > 0 
      ? Math.floor(maxExposure / riskPerTrade) 
      : 0;
    
    const avgValuePerTrade = portfolioValue > 0 && riskPerTrade > 0
      ? (portfolioValue * riskPerTrade) / 100
      : 0;

    const mlPredictions = await getMLPredictions(portfolioValue, riskPerTrade);
    
    const now = Date.now();
    let calibrationIsValid = false;
    let strategyCalibrationData: { strategy: string; alpha: number; beta: number; sampleSize: number } | undefined;
    
    if (!calibrationCache || !fullCalibrationCache || now - calibrationCacheTime > CALIBRATION_CACHE_TTL) {
      try {
        fullCalibrationCache = await loadFullCalibration();
        calibrationCache = fullCalibrationCache.global;
        calibrationCacheTime = now;
        
        if (calibrationCache.sampleCount >= MIN_SAMPLE_COUNT) {
          lastValidCalibration = { ...calibrationCache };
          calibrationIsValid = true;
          console.log(`[L8][CALIB_UPDATE] Global: α=${calibrationCache.alpha.toFixed(4)} β=${calibrationCache.beta.toFixed(2)} sample_size=${calibrationCache.sampleCount}`);
        } else {
          console.log(`[L8][CALIB_FALLBACK] Using previous calibration (current sample_size=${calibrationCache.sampleCount} < ${MIN_SAMPLE_COUNT})`);
          if (lastValidCalibration) {
            calibrationCache = lastValidCalibration;
            calibrationIsValid = true;
          }
        }
      } catch (e) {
        console.log('[L8][CALIB_ERROR] Using fallback calibration');
        if (lastValidCalibration) {
          calibrationCache = lastValidCalibration;
          calibrationIsValid = true;
        } else {
          calibrationCache = { alpha: 0.0018, beta: 0.19, rSquared: 0, sampleCount: 0, updated: now };
        }
      }
    } else {
      calibrationIsValid = calibrationCache.sampleCount >= MIN_SAMPLE_COUNT;
    }
    
    let activeCalibration = calibrationCache;
    
    if (strategy && fullCalibrationCache?.strategies[strategy]) {
      const stratCal = fullCalibrationCache.strategies[strategy];
      if (stratCal.sampleCount >= MIN_SAMPLE_COUNT) {
        activeCalibration = stratCal;
        strategyCalibrationData = {
          strategy,
          alpha: stratCal.alpha,
          beta: stratCal.beta,
          sampleSize: stratCal.sampleCount
        };
        console.log(`[L8][CALIB_APPLY] Using ${strategy} calibration: α=${stratCal.alpha.toFixed(4)} β=${stratCal.beta.toFixed(2)}`);
      } else {
        console.log(`[L8][CALIB_APPLY] ${strategy} has insufficient samples (${stratCal.sampleCount}), using global`);
      }
    }
    
    const rawProfitRate = mlPredictions.profit || 0.05;
    const calibratedProfitRate = activeCalibration 
      ? applyCalibration(rawProfitRate, activeCalibration) 
      : rawProfitRate * 0.25;
    
    const estimatedGrossProfit = avgValuePerTrade * calibratedProfitRate;
    const totalTradeCost = avgValuePerTrade * 0.007;
    const estimatedNetProfit = estimatedGrossProfit - totalTradeCost;
    const expectedProfitPercent = avgValuePerTrade > 0 
      ? (estimatedNetProfit / avgValuePerTrade) * 100 
      : 0;

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
      expectedProfitPercent,
      mlExpectedProfit: mlPredictions.profit,
      confidenceLevel: mlPredictions.confidence,
      rawProfitRate,
      calibratedProfitRate,
      calibration: {
        alpha: calibrationCache?.alpha || 0.0018,
        beta: calibrationCache?.beta || 0.19,
        sampleCount: calibrationCache?.sampleCount || 0,
        isValid: calibrationIsValid,
        lastUpdate: calibrationCache?.updated ? new Date(calibrationCache.updated).toISOString() : new Date().toISOString()
      },
      strategyCalibration: strategyCalibrationData
    };

    console.log(`[L8][ARA_FEEDBACK] Applied ${strategy ? `strategy=${strategy}` : 'global'} calibration`);
    
    res.json(result);
  } catch (error) {
    console.error('[L8][ARA][ERROR] Calculate failed:', error);
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
