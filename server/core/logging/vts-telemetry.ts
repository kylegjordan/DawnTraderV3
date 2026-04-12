/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7B — VTS Telemetry Aggregator
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Bridges the Predictive Learning System (Phases 9–10) with real VTS outcome
 * and skip data, enabling Adaptive Expectancy and Predictive Confidence to
 * self-evolve continuously during passive simulation mode.
 * 
 * Features:
 * - Reads from /logs/virtual_trades/ (executed trades) and /logs/vts_skipped_signals/ (filtered)
 * - Computes per-regime × strategy metrics: winRate, avgPnL, skipRatio, illiquidRatio
 * - Persists hourly snapshots with manifest entries for traceability
 * - Tags all telemetry with source: "VTS" to prevent cross-contamination
 * - Enforces strict read/write isolation from live/paper telemetry
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { Mutex } from 'async-mutex';

const EXECUTED_DIR = path.join(process.cwd(), 'logs', 'virtual_trades');
const SKIPPED_DIR = path.join(process.cwd(), 'logs', 'vts_skipped_signals');
const TELEMETRY_DIR = path.join(process.cwd(), 'logs', 'telemetry');
const MANIFEST_PATH = path.join(TELEMETRY_DIR, 'regime_performance_manifest.json');
const DRIFT_LOG_PATH = path.join(TELEMETRY_DIR, 'confidence_drift.log');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface RegimeStrategyMetrics {
  source: 'VTS';
  winRate: number;
  avgPnL: number;
  skipRatio: number;
  illiquidRatio: number;
  tradeCount: number;
  updatedAt: string;
}

export interface VTSTelemetry {
  version: number;
  source: 'VTS';
  regimePerformance: Record<string, Record<string, RegimeStrategyMetrics>>;
  lastAggregation: string;
}

export interface ManifestEntry {
  filename: string;
  totalProcessed: number;
  regimes: number;
  version: number;
  timestamp: string;
  frictionAware?: boolean; // Directive 11.7C Task 6: Flag for friction-aware thresholds
}

const telemetryLock = new Mutex();

let vtsTelemetry: VTSTelemetry = {
  version: 0,
  source: 'VTS',
  regimePerformance: {},
  lastAggregation: new Date().toISOString()
};

function ensureDirectories(): void {
  if (!fs.existsSync(TELEMETRY_DIR)) {
    fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
  }
}

interface ExecutedTrade {
  regime?: string;
  strategy?: string;
  netProfitPercent?: number;
  pnlPercent?: number;
  profitPct?: number;
}

interface SkippedSignal {
  regime?: string;
  reason?: string;
}

interface ExecutedMetrics {
  wins: number;
  total: number;
  pnl: number;
}

interface SkippedMetrics {
  lowROI: number;
  illiquid: number;
  total: number;
}

/**
 * Directive 11.7D.1 Task 4: Validates telemetry integrity for a regime/strategy pair.
 * Logs warnings for missing metrics or incomplete datasets.
 */
function validateTelemetryIntegrity(
  regime: string, 
  perf: Record<string, unknown>, 
  strategyCount: number
): void {
  if (!('winRate' in perf) || !('avgPnL' in perf) || !('skipRatio' in perf)) {
    console.warn(`[11.7D.1][Telemetry] Missing key metrics for ${regime}`);
  }
  
  if (strategyCount < 2) {
    console.warn(`[11.7D.1][Telemetry] Regime ${regime} has <2 strategies — incomplete dataset.`);
  }
}

export async function updateRegimePerformanceFromVTS(): Promise<{
  success: boolean;
  totalProcessed: number;
  regimesUpdated: number;
  message: string;
}> {
  ensureDirectories();
  
  if (!fs.existsSync(EXECUTED_DIR) || !fs.existsSync(SKIPPED_DIR)) {
    console.log('[11.7B][Telemetry] VTS directories not found, skipping aggregation');
    return { success: false, totalProcessed: 0, regimesUpdated: 0, message: 'VTS directories not found' };
  }

  const metrics: Record<string, Record<string, ExecutedMetrics>> = {};
  const metricsSkipped: Record<string, SkippedMetrics> = {};
  let totalProcessed = 0;

  try {
    const executedFiles = fs.readdirSync(EXECUTED_DIR);
    for (const file of executedFiles) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(EXECUTED_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (Date.now() - stat.mtimeMs > SEVEN_DAYS_MS) continue;
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ExecutedTrade[];
        if (!Array.isArray(data)) continue;
        
        for (const t of data) {
          const { regime, strategy } = t;
          const netProfitPercent = Number(
            t.netProfitPercent ?? t.pnlPercent ?? t.profitPct ??
            (t.netProfit !== undefined ? t.netProfit * 100 : 0)  // B59: netProfit is decimal (0.02 = 2%), convert to percent
          );
          if (!regime || !strategy) continue;
          
          metrics[regime] = metrics[regime] ?? {};
          metrics[regime][strategy] = metrics[regime][strategy] ?? { wins: 0, total: 0, pnl: 0 };
          metrics[regime][strategy].total++;
          if (netProfitPercent > 0) metrics[regime][strategy].wins++;
          metrics[regime][strategy].pnl += netProfitPercent;  // B59: Removed * 100 — netProfitPercent is already in percent units (Langston review catch)
          totalProcessed++;
        }
      } catch (err) {
        console.warn(`[11.7B][Telemetry] Skipping invalid JSON: ${file}`);
        continue;
      }
    }

    const skippedFiles = fs.readdirSync(SKIPPED_DIR);
    for (const file of skippedFiles) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(SKIPPED_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SkippedSignal[];
        if (!Array.isArray(data)) continue;
        
        for (const s of data) {
          const { regime, reason } = s;
          if (!regime) continue;
          
          metricsSkipped[regime] = metricsSkipped[regime] ?? { lowROI: 0, illiquid: 0, total: 0 };
          metricsSkipped[regime].total++;
          if (reason === 'Low_ROI') metricsSkipped[regime].lowROI++;
          if (reason === 'Illiquid_USD') metricsSkipped[regime].illiquid++;
        }
      } catch (err) {
        console.warn(`[11.7B][Telemetry] Skipping invalid JSON: ${file}`);
        continue;
      }
    }

    if (totalProcessed === 0) {
      console.log('[11.7B][Telemetry] No new entries found, skipping snapshot');
      return { success: true, totalProcessed: 0, regimesUpdated: 0, message: 'No new entries' };
    }

    if (vtsTelemetry.source && vtsTelemetry.source !== 'VTS') {
      console.warn('[11.7B][Telemetry] Cross-source write attempt blocked');
      return { success: false, totalProcessed: 0, regimesUpdated: 0, message: 'Cross-source write blocked' };
    }

    await telemetryLock.runExclusive(() => {
      for (const regime in metrics) {
        vtsTelemetry.regimePerformance[regime] = vtsTelemetry.regimePerformance[regime] ?? {};
        const strategyCount = Object.keys(metrics[regime]).length;
        
        for (const strategy in metrics[regime]) {
          const m = metrics[regime][strategy];
          const s = metricsSkipped[regime] || { lowROI: 0, illiquid: 0, total: 0 };
          const perfEntry: RegimeStrategyMetrics = {
            source: 'VTS',
            winRate: m.wins / (m.total || 1),
            avgPnL: m.pnl / (m.total || 1),
            skipRatio: (s.lowROI || 0) / (s.total || 1),
            illiquidRatio: (s.illiquid || 0) / (s.total || 1),
            tradeCount: m.total,
            updatedAt: new Date().toISOString()
          };
          
          validateTelemetryIntegrity(regime, perfEntry as unknown as Record<string, unknown>, strategyCount);
          vtsTelemetry.regimePerformance[regime][strategy] = perfEntry;
        }
      }
      vtsTelemetry.version = (vtsTelemetry.version ?? 0) + 1;
      vtsTelemetry.lastAggregation = new Date().toISOString();
    });

    saveTelemetrySnapshot(totalProcessed, metrics);

    const regimesUpdated = Object.keys(metrics).length;
    console.log(`[11.7B][Telemetry] Aggregation complete: ${totalProcessed} entries, ${regimesUpdated} regimes`);
    return { 
      success: true, 
      totalProcessed, 
      regimesUpdated, 
      message: `Processed ${totalProcessed} trades across ${regimesUpdated} regimes` 
    };

  } catch (error) {
    console.error('[11.7B][Telemetry] Aggregation failed:', error);
    return { success: false, totalProcessed: 0, regimesUpdated: 0, message: `Error: ${error}` };
  }
}

export function saveTelemetrySnapshot(totalProcessed: number, metrics: Record<string, Record<string, ExecutedMetrics>>): void {
  ensureDirectories();
  
  const date = new Date().toISOString().slice(0, 10);
  const regimeCount = Object.keys(metrics).length;
  const filename = `regime_performance_${date}_VTS_${totalProcessed}.json`;
  const filePath = path.join(TELEMETRY_DIR, filename);
  
  fs.writeFileSync(filePath, JSON.stringify(vtsTelemetry.regimePerformance, null, 2));
  
  let manifest: ManifestEntry[] = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch {
      manifest = [];
    }
  }
  
  manifest.push({
    filename,
    totalProcessed,
    regimes: regimeCount,
    version: vtsTelemetry.version ?? 1,
    timestamp: new Date().toISOString(),
    frictionAware: true // Directive 11.7C Task 6: Enable friction-aware thresholds
  });
  
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  
  console.log(`[11.7B][Telemetry] Snapshot saved (${totalProcessed} entries, ${regimeCount} regimes) → ${filename}`);
}

export function getVTSTelemetry(): VTSTelemetry {
  return vtsTelemetry;
}

export function getRegimePerformance(regime: string, strategy: string): RegimeStrategyMetrics | null {
  const regimeData = vtsTelemetry.regimePerformance[regime];
  if (!regimeData) return null;
  return regimeData[strategy] || regimeData['SKIPPED'] || null;
}

export function checkConfidenceDrift(currentConfidence: number, baselineConfidence: number): boolean {
  ensureDirectories();
  
  const avgDiff = currentConfidence - baselineConfidence;
  console.log(`[11.7B][Guard] Confidence Δ=${avgDiff.toFixed(3)}, baseline=${baselineConfidence.toFixed(3)}`);
  
  if (Math.abs(avgDiff) > 0.05) {
    console.warn(`[11.7B][Guard] PredictiveConfidence drift detected: ${avgDiff.toFixed(3)}`);
    fs.appendFileSync(DRIFT_LOG_PATH,
      `${new Date().toISOString()} Δ=${avgDiff.toFixed(3)} baseline=${baselineConfidence.toFixed(3)}\n`
    );
    return true;
  }
  return false;
}

export function getVTSTelemetryStatus(): {
  version: number;
  lastAggregation: string;
  regimeCount: number;
  totalStrategies: number;
} {
  let totalStrategies = 0;
  for (const regime in vtsTelemetry.regimePerformance) {
    totalStrategies += Object.keys(vtsTelemetry.regimePerformance[regime]).length;
  }
  
  return {
    version: vtsTelemetry.version,
    lastAggregation: vtsTelemetry.lastAggregation,
    regimeCount: Object.keys(vtsTelemetry.regimePerformance).length,
    totalStrategies
  };
}

/**
 * Directive 11.7C Task 7: Reset telemetry cache for DSS/RTB refresh
 * Clears the in-memory telemetry data to force reload from disk
 */
export function resetTelemetryCache(): void {
  vtsTelemetry = {
    version: 0,
    source: 'VTS',
    regimePerformance: {},
    lastAggregation: new Date().toISOString()
  };
  console.log('[11.7C][Telemetry] Cache reset - will reload from disk on next aggregation');
}
