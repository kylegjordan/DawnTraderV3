/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔒 LOCKED MODULE — Directive 8.8.4-L6
 * ══════════════════════════════════════════════════════════════════════════════
 * VTS Runner - 5-minute loop for virtual trade updates
 * 
 * Purpose: Background task that checks open virtual trades and updates their P/L
 * based on current market prices. Integrates with signal orchestrator to capture
 * new signals for virtual trading.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { vtsService, type VirtualSignal } from './vts-service';
import { loadCalibration, applyCalibration, type CalibrationCoefficients } from '../utils/calibration';

let isInitialized = false;
let calibration: CalibrationCoefficients | null = null;

export async function initVTSRunner(): Promise<void> {
  if (isInitialized) return;
  
  try {
    calibration = await loadCalibration();
    vtsService.start();
    isInitialized = true;
    console.log('[L6][VTS_RUNNER] INIT_OK - passive mode active');
  } catch (error) {
    console.error('[L6][VTS_RUNNER] Init failed:', error);
  }
}

export async function captureSignalForVTS(
  symbol: string,
  entryPrice: number,
  takeProfit: number,
  stopLoss: number,
  predictedProfit: number,
  strategy: string,
  spread: number = 0.001
): Promise<void> {
  if (!isInitialized) {
    await initVTSRunner();
  }

  const signal: VirtualSignal = {
    id: `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    symbol,
    entryPrice,
    takeProfit,
    stopLoss,
    spread,
    predictedProfit,
    strategy,
    createdAt: Date.now()
  };

  await vtsService.createVirtualTrade(signal);
}

export function updateVTSPrice(symbol: string, price: number): void {
  if (isInitialized) {
    vtsService.updateMarketPrice(symbol, price);
  }
}

export async function getCalibratedProfit(predictedProfit: number): Promise<number> {
  if (!calibration) {
    calibration = await loadCalibration();
  }
  return applyCalibration(predictedProfit, calibration);
}

export async function refreshCalibration(): Promise<CalibrationCoefficients> {
  calibration = await loadCalibration();
  return calibration;
}

export function getVTSStats() {
  return vtsService.getStats();
}

export function stopVTSRunner(): void {
  vtsService.stop();
  isInitialized = false;
  console.log('[L6][VTS_RUNNER] Stopped');
}
