/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L6
 * ══════════════════════════════════════════════════════════════════════════════
 * Calibration Utility - Learns α and β coefficients from virtual trade outcomes
 * 
 * Purpose: Linear regression calibration that maps predicted profits to actual
 * realized profits based on virtual trade simulation data.
 * 
 * Formula: calibrated_profit = α + β × predicted_profit
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
}

const CALIBRATION_FILE = path.join(process.cwd(), 'logs', 'vts_calibration.json');

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
): { alpha: number; beta: number; rSquared: number } {
  const n = predictedProfits.length;
  
  if (n < 10) {
    return { alpha: DEFAULT_COEFFICIENTS.alpha, beta: DEFAULT_COEFFICIENTS.beta, rSquared: 0 };
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
    return { alpha: DEFAULT_COEFFICIENTS.alpha, beta: DEFAULT_COEFFICIENTS.beta, rSquared: 0 };
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

  return { 
    alpha: Math.max(-0.01, Math.min(0.01, alpha)),
    beta: Math.max(0.05, Math.min(0.5, beta)),
    rSquared: Math.max(0, Math.min(1, rSquared))
  };
}

export async function saveCalibration(coefficients: CalibrationCoefficients): Promise<void> {
  try {
    const dir = path.dirname(CALIBRATION_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(CALIBRATION_FILE, JSON.stringify(coefficients, null, 2));
    console.log(`[L6][CALIBRATION] Saved: α=${coefficients.alpha.toFixed(4)} β=${coefficients.beta.toFixed(2)} r²=${coefficients.rSquared.toFixed(2)}`);
  } catch (error) {
    console.error('[L6][CALIBRATION] Save failed:', error);
  }
}

export async function loadCalibration(): Promise<CalibrationCoefficients> {
  try {
    const data = await fs.readFile(CALIBRATION_FILE, 'utf-8');
    const coefficients = JSON.parse(data) as CalibrationCoefficients;
    return coefficients;
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
  
  const { alpha, beta, rSquared } = linearFit(predictedProfits, actualProfits);
  
  const coefficients: CalibrationCoefficients = {
    alpha,
    beta,
    rSquared,
    sampleCount: trades.length,
    updated: Date.now()
  };
  
  await saveCalibration(coefficients);
  console.log(`[L6][VTS] virtual=${trades.length} trades, α=${alpha.toFixed(4)} β=${beta.toFixed(2)} r²=${rSquared.toFixed(2)}`);
  
  return coefficients;
}
