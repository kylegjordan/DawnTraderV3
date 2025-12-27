/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L8
 * ══════════════════════════════════════════════════════════════════════════════
 * Calibration Utility - Learns α and β coefficients from virtual trade outcomes
 * 
 * Purpose: Linear regression calibration that maps predicted profits to actual
 * realized profits based on virtual trade simulation data.
 * 
 * L8 Enhancement: Per-strategy calibration coefficients (αₛ, βₛ)
 * 
 * Formula: calibrated_profit = αₛ + βₛ × predicted_profit
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from 'fs/promises';
import path from 'path';

export interface CalibrationCoefficients {
  alpha: number;
  beta: number;
  rSquared: number;
  sampleCount: number;
  updated: number;
  stdError?: number;
  timestamp?: string;
}

export interface StrategyCalibration extends CalibrationCoefficients {
  strategy: string;
}

export interface FullCalibration {
  global: CalibrationCoefficients;
  strategies: Record<string, CalibrationCoefficients>;
  lastUpdate: string;
}

const CALIBRATION_FILE = path.join(process.cwd(), 'logs', 'vts_calibration.json');
const CALIBRATION_HISTORY_DIR = path.join(process.cwd(), 'logs', 'vts_calibration_history');

const DEFAULT_COEFFICIENTS: CalibrationCoefficients = {
  alpha: 0.0018,
  beta: 0.19,
  rSquared: 0,
  sampleCount: 0,
  updated: Date.now()
};

export function linearFit(
  predictedProfits: number[],
  actualProfits: number[]
): { alpha: number; beta: number; rSquared: number; stdError: number } {
  const n = predictedProfits.length;
  
  if (n < 10) {
    return { alpha: DEFAULT_COEFFICIENTS.alpha, beta: DEFAULT_COEFFICIENTS.beta, rSquared: 0, stdError: 0 };
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const x = predictedProfits[i];
    const y = actualProfits[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  
  const denominator = sumX2 - n * meanX * meanX;
  if (Math.abs(denominator) < 1e-10) {
    return { alpha: DEFAULT_COEFFICIENTS.alpha, beta: DEFAULT_COEFFICIENTS.beta, rSquared: 0, stdError: 0 };
  }

  const beta = (sumXY - n * meanX * meanY) / denominator;
  const alpha = meanY - beta * meanX;

  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = alpha + beta * predictedProfits[i];
    ssRes += Math.pow(actualProfits[i] - predicted, 2);
    ssTot += Math.pow(actualProfits[i] - meanY, 2);
  }

  const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
  
  const mse = ssRes / Math.max(1, n - 2);
  const stdError = Math.sqrt(mse / Math.max(1, denominator));

  return { 
    alpha: Math.max(-0.01, Math.min(0.01, alpha)),
    beta: Math.max(0.05, Math.min(0.5, beta)),
    rSquared: Math.max(0, Math.min(1, rSquared)),
    stdError: Math.max(0, stdError)
  };
}

export async function saveCalibration(coefficients: CalibrationCoefficients): Promise<void> {
  try {
    const dir = path.dirname(CALIBRATION_FILE);
    await fs.mkdir(dir, { recursive: true });
    
    const fullCalibration = await loadFullCalibration();
    fullCalibration.global = coefficients;
    fullCalibration.lastUpdate = new Date().toISOString();
    
    await fs.writeFile(CALIBRATION_FILE, JSON.stringify(fullCalibration, null, 2));
    console.log(`[L8][CALIBRATION] Saved global: α=${coefficients.alpha.toFixed(4)} β=${coefficients.beta.toFixed(2)} r²=${coefficients.rSquared.toFixed(2)}`);
  } catch (error) {
    console.error('[L8][CALIBRATION] Save failed:', error);
  }
}

export async function saveFullCalibration(fullCalibration: FullCalibration): Promise<void> {
  try {
    const dir = path.dirname(CALIBRATION_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(CALIBRATION_FILE, JSON.stringify(fullCalibration, null, 2));
    
    await saveCalibrationHistory(fullCalibration);
    
    const strategyCount = Object.keys(fullCalibration.strategies).length;
    console.log(`[L8][CALIBRATION] Saved full calibration: global + ${strategyCount} strategies`);
  } catch (error) {
    console.error('[L8][CALIBRATION] Save full calibration failed:', error);
  }
}

async function saveCalibrationHistory(calibration: FullCalibration): Promise<void> {
  try {
    await fs.mkdir(CALIBRATION_HISTORY_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const historyFile = path.join(CALIBRATION_HISTORY_DIR, `${date}.json`);
    
    let history: FullCalibration[] = [];
    try {
      const existing = await fs.readFile(historyFile, 'utf-8');
      history = JSON.parse(existing);
    } catch {}
    
    history.push(calibration);
    await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
  } catch (error) {
    console.error('[L8][CALIBRATION] History save failed:', error);
  }
}

export async function loadCalibration(): Promise<CalibrationCoefficients> {
  try {
    const data = await fs.readFile(CALIBRATION_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    
    if (parsed.global) {
      return parsed.global as CalibrationCoefficients;
    }
    return parsed as CalibrationCoefficients;
  } catch (error) {
    return { ...DEFAULT_COEFFICIENTS };
  }
}

export async function loadFullCalibration(): Promise<FullCalibration> {
  try {
    const data = await fs.readFile(CALIBRATION_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    
    if (parsed.global && parsed.strategies) {
      return parsed as FullCalibration;
    }
    
    return {
      global: parsed as CalibrationCoefficients,
      strategies: {},
      lastUpdate: new Date().toISOString()
    };
  } catch (error) {
    return {
      global: { ...DEFAULT_COEFFICIENTS },
      strategies: {},
      lastUpdate: new Date().toISOString()
    };
  }
}

export async function loadStrategyCalibration(strategy: string): Promise<CalibrationCoefficients> {
  try {
    const fullCalibration = await loadFullCalibration();
    
    if (fullCalibration.strategies[strategy] && 
        fullCalibration.strategies[strategy].sampleCount >= 10) {
      return fullCalibration.strategies[strategy];
    }
    
    return fullCalibration.global;
  } catch (error) {
    return { ...DEFAULT_COEFFICIENTS };
  }
}

export function applyCalibration(predictedProfit: number, coefficients: CalibrationCoefficients): number {
  return coefficients.alpha + coefficients.beta * predictedProfit;
}

export async function calibrateFromTrades(
  trades: Array<{ predictedProfit: number; actualProfit: number }>
): Promise<CalibrationCoefficients> {
  const predictedProfits = trades.map(t => t.predictedProfit);
  const actualProfits = trades.map(t => t.actualProfit);
  
  const { alpha, beta, rSquared, stdError } = linearFit(predictedProfits, actualProfits);
  
  const now = Date.now();
  const coefficients: CalibrationCoefficients = {
    alpha,
    beta,
    rSquared,
    sampleCount: trades.length,
    updated: now,
    stdError,
    timestamp: new Date(now).toISOString()
  };
  
  await saveCalibration(coefficients);
  console.log(`[L8][CALIB_UPDATE] Global: α=${alpha.toFixed(4)} β=${beta.toFixed(2)} sample_size=${trades.length} std_error=${stdError.toFixed(4)}`);
  
  if (Math.abs(beta - 1.0) > 0.3 || stdError > 0.05) {
    console.warn(`[L8][CALIB_WARNING] Calibration anomaly detected: |β-1|=${Math.abs(beta - 1.0).toFixed(2)}, stdError=${stdError.toFixed(4)}`);
  }
  
  return coefficients;
}

export async function calibrateFromTradesPerStrategy(
  trades: Array<{ predictedProfit: number; actualProfit: number; strategy: string }>
): Promise<FullCalibration> {
  const allPredicted = trades.map(t => t.predictedProfit);
  const allActual = trades.map(t => t.actualProfit);
  const globalFit = linearFit(allPredicted, allActual);
  
  const now = Date.now();
  const globalCoefficients: CalibrationCoefficients = {
    alpha: globalFit.alpha,
    beta: globalFit.beta,
    rSquared: globalFit.rSquared,
    sampleCount: trades.length,
    updated: now,
    stdError: globalFit.stdError,
    timestamp: new Date(now).toISOString()
  };
  
  const strategyGroups = new Map<string, Array<{ predictedProfit: number; actualProfit: number }>>();
  for (const trade of trades) {
    const key = trade.strategy || 'unknown';
    if (!strategyGroups.has(key)) {
      strategyGroups.set(key, []);
    }
    strategyGroups.get(key)!.push({ predictedProfit: trade.predictedProfit, actualProfit: trade.actualProfit });
  }
  
  const strategies: Record<string, CalibrationCoefficients> = {};
  
  for (const [strategy, strategyTrades] of strategyGroups) {
    const predicted = strategyTrades.map(t => t.predictedProfit);
    const actual = strategyTrades.map(t => t.actualProfit);
    const fit = linearFit(predicted, actual);
    
    strategies[strategy] = {
      alpha: fit.alpha,
      beta: fit.beta,
      rSquared: fit.rSquared,
      sampleCount: strategyTrades.length,
      updated: now,
      stdError: fit.stdError,
      timestamp: new Date(now).toISOString()
    };
    
    console.log(`[L8][CALIB_APPLY] ${strategy} α=${fit.alpha.toFixed(4)} β=${fit.beta.toFixed(2)} samples=${strategyTrades.length}`);
  }
  
  const fullCalibration: FullCalibration = {
    global: globalCoefficients,
    strategies,
    lastUpdate: new Date(now).toISOString()
  };
  
  await saveFullCalibration(fullCalibration);
  
  console.log(`[L8][CALIB_UPDATE] Completed: global + ${Object.keys(strategies).length} strategies, total=${trades.length} trades`);
  
  return fullCalibration;
}

export function getStrategyAnomalies(fullCalibration: FullCalibration): Array<{ strategy: string; warning: string }> {
  const anomalies: Array<{ strategy: string; warning: string }> = [];
  
  const checkAnomaly = (strategy: string, coef: CalibrationCoefficients) => {
    const betaDeviation = Math.abs(coef.beta - 1.0);
    const stdError = coef.stdError || 0;
    
    if (coef.sampleCount < 10) {
      anomalies.push({ strategy, warning: `Insufficient samples: ${coef.sampleCount}` });
    } else if (betaDeviation > 0.3) {
      anomalies.push({ strategy, warning: `β deviation high: |β-1|=${betaDeviation.toFixed(2)}` });
    } else if (stdError > 0.05) {
      anomalies.push({ strategy, warning: `Standard error high: ${stdError.toFixed(4)}` });
    }
  };
  
  checkAnomaly('global', fullCalibration.global);
  
  for (const [strategy, coef] of Object.entries(fullCalibration.strategies)) {
    checkAnomaly(strategy, coef);
  }
  
  return anomalies;
}
