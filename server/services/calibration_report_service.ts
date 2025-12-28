/**
 * Directive 8.8.4-M5-R1 — Calibration Report Generator Service
 * 
 * Generates per-strategy calibration statistics including:
 * - αₛ (Mean return coefficient)
 * - βₛ (Risk sensitivity)
 * - σₛ (Standard deviation/error)
 * - Rₛ (Reliability score)
 * - Wₛ (Normalized weight)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { loadFullCalibration, type FullCalibration, type CalibrationCoefficients } from '../utils/calibration';
import { computeStrategyWeights, type StrategyWeightsBundle } from '../utils/strategyWeights';
import { vtsService } from './vts-service';

const REPORTS_DIR = path.join(process.cwd(), 'reports');
const DATA_DIR = path.join(process.cwd(), 'data');

export interface StrategyCalibrationStats {
  strategy: string;
  alpha: number;        // αₛ: Mean return coefficient
  beta: number;         // βₛ: Risk sensitivity
  stdError: number;     // σₛ: Standard deviation
  reliability: number;  // Rₛ: Reliability score (1 - |βₛ - 1| - σₛ/σₘₐₓ)
  weight: number;       // Wₛ: Normalized weight
  sampleCount: number;
  rSquared: number;
  lastUpdate: string;
}

export interface CalibrationReport {
  timestamp: string;
  globalCalibration: {
    alpha: number;
    beta: number;
    sampleCount: number;
    isValid: boolean;
  };
  strategies: StrategyCalibrationStats[];
  summary: {
    totalStrategies: number;
    calibratedStrategies: number;
    averageReliability: number;
    weightDistribution: Record<string, number>;
    minSamplesRequired: number;
    vtsTradeCount: number;
  };
}

class CalibrationReportService {
  private readonly MIN_SAMPLES = 10;

  async generateReport(): Promise<CalibrationReport> {
    const fullCalibration = await loadFullCalibration();
    const weightsBundle = await computeStrategyWeights();
    const vtsStats = vtsService.getStats();
    const strategyStats = vtsService.getStrategyStats();

    const strategies: StrategyCalibrationStats[] = [];
    const allStdErrors: number[] = [];

    // Collect all std errors to compute max
    for (const [strategy, cal] of Object.entries(fullCalibration.strategies)) {
      if (cal.stdError) {
        allStdErrors.push(cal.stdError);
      }
    }
    const maxStdError = Math.max(...allStdErrors, 0.001);

    // Process each strategy
    for (const [strategy, cal] of Object.entries(fullCalibration.strategies)) {
      const reliability = this.computeReliability(cal.beta, cal.stdError || 0, maxStdError);
      const weight = weightsBundle.weights[strategy] || 0.2;
      
      strategies.push({
        strategy,
        alpha: cal.alpha,
        beta: cal.beta,
        stdError: cal.stdError || 0,
        reliability,
        weight,
        sampleCount: cal.sampleCount,
        rSquared: cal.rSquared,
        lastUpdate: cal.timestamp || new Date(cal.updated).toISOString()
      });
    }

    // Add strategies from VTS that aren't in calibration yet
    for (const [strategy, stats] of Object.entries(strategyStats)) {
      if (!fullCalibration.strategies[strategy]) {
        strategies.push({
          strategy,
          alpha: 0,
          beta: 1,
          stdError: 0,
          reliability: 0.5,
          weight: 0.2,
          sampleCount: stats.trades,
          rSquared: 0,
          lastUpdate: new Date().toISOString()
        });
      }
    }

    // Sort by weight descending
    strategies.sort((a, b) => b.weight - a.weight);

    const calibratedStrategies = strategies.filter(s => s.sampleCount >= this.MIN_SAMPLES);
    const avgReliability = strategies.length > 0
      ? strategies.reduce((sum, s) => sum + s.reliability, 0) / strategies.length
      : 0;

    const weightDistribution: Record<string, number> = {};
    for (const s of strategies) {
      weightDistribution[s.strategy] = Math.round(s.weight * 10000) / 100; // As percentage
    }

    const report: CalibrationReport = {
      timestamp: new Date().toISOString(),
      globalCalibration: {
        alpha: fullCalibration.global.alpha,
        beta: fullCalibration.global.beta,
        sampleCount: fullCalibration.global.sampleCount,
        isValid: fullCalibration.global.sampleCount >= this.MIN_SAMPLES
      },
      strategies,
      summary: {
        totalStrategies: strategies.length,
        calibratedStrategies: calibratedStrategies.length,
        averageReliability: Math.round(avgReliability * 1000) / 1000,
        weightDistribution,
        minSamplesRequired: this.MIN_SAMPLES,
        vtsTradeCount: vtsStats.closedTrades
      }
    };

    return report;
  }

  private computeReliability(beta: number, stdError: number, maxStdError: number): number {
    const betaDeviation = Math.abs(beta - 1.0);
    const normalizedError = maxStdError > 0 ? stdError / maxStdError : 0;
    const reliability = 1 - betaDeviation - normalizedError;
    return Math.max(0, Math.min(1, reliability));
  }

  async saveReport(report: CalibrationReport): Promise<string> {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const filename = `CalibrationReport_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(REPORTS_DIR, filename);
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    console.log(`[M5-R1][CALIBRATION] Report saved: ${filepath}`);
    return filename;
  }

  async getLatestReport(): Promise<CalibrationReport | null> {
    try {
      const files = await fs.readdir(REPORTS_DIR);
      const calibrationFiles = files
        .filter(f => f.startsWith('CalibrationReport_') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (calibrationFiles.length === 0) return null;

      const content = await fs.readFile(path.join(REPORTS_DIR, calibrationFiles[0]), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

export const calibrationReportService = new CalibrationReportService();
