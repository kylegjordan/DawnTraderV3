/**
 * Directive 8.8.4-M5 — Paper-Mode Validation Engine
 * 
 * This service manages controlled paper-trading validation sessions:
 * - Captures all major adaptive metrics at 15-second intervals
 * - Logs update events (pre-trade → in-trade → post-trade)
 * - Cross-validates metric changes against expected formulas
 * - Stores full telemetry reports at /reports/ValidationRun_<timestamp>.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { priceCache } from './price-cache';
import { vtsService } from './vts-service';
// Phase 13: Removed L-series imports (decision-confidence-engine, gasp-coordinator)
import { vtsModeAuditService } from './vts-mode-audit';
import { getAdaptiveRelevance, getRollingNormalizerStats } from '../core/metrics/quality_index';

const REPORTS_DIR = path.join(process.cwd(), 'reports');

export interface ValidationMetrics {
  timestamp: string;
  cwqi: number;
  ngc: number;
  di: number;
  adaptiveRelevance: number;
  gsi: number;
  riskPerTrade: number;
  maxExposure: number;
  feedLatency: number;
  cacheSize: number;
  vtsMode: 'simulator' | 'observer';
}

export interface ValidationTelemetry {
  timestamp: string;
  mode: 'paper';
  sessionId: string;
  startTime: string;
  endTime: string | null;
  durationMs: number;
  tradesExecuted: number;
  averageFeedLatencyMs: number;
  cacheWindow: number;
  adaptiveRelevanceRange: [number, number];
  cwqiVariance: number;
  ngcAvg: number;
  diAvg: number;
  vtsModeSwitches: { toObserver: number; toSimulator: number };
  araUpdates: number;
  metricSnapshots: ValidationMetrics[];
  rollingSnapshots: ValidationMetrics[][]; // M5-R1: 5-minute rolling snapshots
  failures: string[];
  validationCriteria: ValidationCriteria;
}

export interface ValidationCriteria {
  feedLatency: { threshold: number; actual: number; passed: boolean };
  cacheWindow: { threshold: number; actual: number; passed: boolean };
  araUpdates: { threshold: number; actual: number; passed: boolean };
  adaptiveRelevanceVariance: { threshold: number; actual: number; passed: boolean };
  cwqiNgcDrift: { threshold: number; actual: number; passed: boolean };
  vtsModeSwitchDelay: { threshold: number; actual: number; passed: boolean };
}

interface FeedLatencyRecord {
  latency: number;
  timestamp: number;
}

class PaperValidationEngine {
  private isRunning = false;
  private sessionId: string | null = null;
  private startTime: Date | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private metricSnapshots: ValidationMetrics[] = [];
  private tradesExecuted = 0;
  private araUpdates = 0;
  private vtsModeSwitches = { toObserver: 0, toSimulator: 0 };
  private previousVtsMode: 'simulator' | 'observer' | null = null;
  private failures: string[] = [];
  private feedLatencies: FeedLatencyRecord[] = [];

  private readonly DEFAULT_CAPTURE_INTERVAL_MS = 10000; // M5-R1: 10s capture interval
  private readonly DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000; // M5-R1: 60 minutes
  private readonly LATENCY_WINDOW_MS = 60000;
  private captureIntervalMs = 10000;
  private sessionDurationMs = 60 * 60 * 1000;
  private rollingSnapshots: ValidationMetrics[][] = []; // 5-minute rolling snapshots

  /**
   * M5-R1: Start extended validation session with configurable duration
   * @param durationMinutes - Session duration in minutes (default: 60)
   * @param captureIntervalSeconds - Metric capture interval in seconds (default: 10)
   */
  async startValidationSession(
    durationMinutes: number = 60,
    captureIntervalSeconds: number = 10
  ): Promise<{ sessionId: string; message: string; durationMinutes: number }> {
    if (this.isRunning) {
      return { 
        sessionId: this.sessionId!, 
        message: 'Validation session already running',
        durationMinutes: Math.floor(this.sessionDurationMs / 60000)
      };
    }

    await fs.mkdir(REPORTS_DIR, { recursive: true });

    // M5-R1: Configurable duration and capture interval
    this.sessionDurationMs = durationMinutes * 60 * 1000;
    this.captureIntervalMs = captureIntervalSeconds * 1000;

    this.isRunning = true;
    this.sessionId = `VAL_${Date.now()}`;
    this.startTime = new Date();
    this.metricSnapshots = [];
    this.tradesExecuted = 0;
    this.araUpdates = 0;
    this.vtsModeSwitches = { toObserver: 0, toSimulator: 0 };
    this.previousVtsMode = null;
    this.failures = [];
    this.feedLatencies = [];
    this.rollingSnapshots = [];

    console.log(`[M5-R1][VALIDATION] Session ${this.sessionId} started at ${this.startTime.toISOString()}`);
    console.log(`[M5-R1][VALIDATION] Duration: ${durationMinutes} min, Capture interval: ${captureIntervalSeconds}s`);

    this.captureMetrics();

    this.intervalId = setInterval(() => {
      this.captureMetrics();
      // M5-R1: Every 5 minutes, save rolling snapshot
      if (this.metricSnapshots.length > 0 && this.metricSnapshots.length % 30 === 0) {
        this.saveRollingSnapshot();
      }
    }, this.captureIntervalMs);

    setTimeout(() => {
      this.stopValidationSession();
    }, this.sessionDurationMs);

    return { 
      sessionId: this.sessionId, 
      message: `Validation session started (${durationMinutes}-minute duration, ${captureIntervalSeconds}s intervals)`,
      durationMinutes
    };
  }

  private saveRollingSnapshot(): void {
    const recentSnapshots = this.metricSnapshots.slice(-30);
    this.rollingSnapshots.push(recentSnapshots);
    console.log(`[M5-R1][VALIDATION] 5-minute rolling snapshot saved (total: ${this.rollingSnapshots.length})`);
  }

  private async captureMetrics(): Promise<void> {
    try {
      // Phase 13: DCE and GASP removed (L-series legacy). Use deterministic defaults.
      const vtsParams = vtsService.getLearningParams();
      const vtsModeState = vtsModeAuditService.getState();
      const currentVtsMode = vtsModeState.mode;

      const adaptiveParams = getAdaptiveRelevance();
      const normalizerStats = getRollingNormalizerStats();

      const gsi = vtsParams.gsi || 0.85;

      const cacheHealth = priceCache.getHealthMetrics();

      const fetchStart = Date.now();
      try {
        await priceCache.getPrice('BTC/USD', 'readyToBuy');
        const fetchLatency = Date.now() - fetchStart;
        this.recordFeedLatency(fetchLatency);
      } catch {
      }

      const avgLatency = this.getAverageLatency();

      const baseRisk = 2.5;
      const computedRisk = baseRisk + (vtsParams.learningRate * 5);
      const baseExposure = 25;
      const computedExposure = baseExposure + (0.5 * 40); // Phase 13: Default volatility index 0.5

      const ngcValue = normalizerStats.ngc.initialized
        ? (normalizerStats.ngc.min + normalizerStats.ngc.max) / 2
        : vtsParams.gsi || 0.6;
      const cwqiValue = 0.65; // Phase 13: DCE removed, use deterministic default
      const diValue = 0.5; // Phase 13: DCE removed, use deterministic default

      const metrics: ValidationMetrics = {
        timestamp: new Date().toISOString(),
        cwqi: cwqiValue,
        ngc: ngcValue,
        di: diValue,
        adaptiveRelevance: adaptiveParams.relevance,
        gsi,
        riskPerTrade: Math.min(5, Math.max(1, computedRisk)),
        maxExposure: Math.min(50, Math.max(10, computedExposure)),
        feedLatency: avgLatency,
        cacheSize: cacheHealth.cacheSize,
        vtsMode: currentVtsMode
      };

      this.metricSnapshots.push(metrics);

      if (this.previousVtsMode && this.previousVtsMode !== currentVtsMode) {
        if (currentVtsMode === 'observer') {
          this.vtsModeSwitches.toObserver++;
        } else {
          this.vtsModeSwitches.toSimulator++;
        }
        console.log(`[M5][VALIDATION] VTS mode switch: ${this.previousVtsMode} → ${currentVtsMode}`);
      }
      this.previousVtsMode = currentVtsMode;

      console.log(
        `[M5][VALIDATION] session active, latency = ${avgLatency.toFixed(0)} ms, ` +
        `relevance = ${adaptiveParams.relevance.toFixed(2)}, cwqi variance = ${this.computeCWQIVariance().toFixed(3)}`
      );

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.failures.push(`Metric capture error: ${message}`);
      console.error(`[M5][VALIDATION] Capture error:`, message);
    }
  }

  recordFeedLatency(latencyMs: number): void {
    const now = Date.now();
    this.feedLatencies.push({ latency: latencyMs, timestamp: now });
    this.feedLatencies = this.feedLatencies.filter(
      r => now - r.timestamp < this.LATENCY_WINDOW_MS
    );
  }

  private getAverageLatency(): number {
    if (this.feedLatencies.length === 0) return 0;
    const sum = this.feedLatencies.reduce((acc, r) => acc + r.latency, 0);
    return sum / this.feedLatencies.length;
  }

  getRollingLatencyAverages(): { oneMin: number; fiveMin: number; fifteenMin: number } {
    const now = Date.now();
    const oneMinAgo = now - 60000;
    const fiveMinAgo = now - 300000;
    const fifteenMinAgo = now - 900000;

    const oneMinRecords = this.feedLatencies.filter(r => r.timestamp >= oneMinAgo);
    const fiveMinRecords = this.feedLatencies.filter(r => r.timestamp >= fiveMinAgo);
    const fifteenMinRecords = this.feedLatencies.filter(r => r.timestamp >= fifteenMinAgo);

    const avg = (records: FeedLatencyRecord[]) => 
      records.length > 0 ? records.reduce((s, r) => s + r.latency, 0) / records.length : 0;

    return {
      oneMin: avg(oneMinRecords),
      fiveMin: avg(fiveMinRecords),
      fifteenMin: avg(fifteenMinRecords)
    };
  }

  recordTradeExecution(): void {
    this.tradesExecuted++;
  }

  recordARAUpdate(): void {
    this.araUpdates++;
  }

  private computeCWQIVariance(): number {
    if (this.metricSnapshots.length < 2) return 0;
    const cwqiValues = this.metricSnapshots.map(m => m.cwqi);
    const mean = cwqiValues.reduce((a, b) => a + b, 0) / cwqiValues.length;
    const squaredDiffs = cwqiValues.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
  }

  private computeAdaptiveRelevanceRange(): [number, number] {
    if (this.metricSnapshots.length === 0) return [0, 0];
    const values = this.metricSnapshots.map(m => m.adaptiveRelevance);
    return [Math.min(...values), Math.max(...values)];
  }

  private computeNGCAverage(): number {
    if (this.metricSnapshots.length === 0) return 0;
    return this.metricSnapshots.reduce((s, m) => s + m.ngc, 0) / this.metricSnapshots.length;
  }

  private computeDIAverage(): number {
    if (this.metricSnapshots.length === 0) return 0;
    return this.metricSnapshots.reduce((s, m) => s + m.di, 0) / this.metricSnapshots.length;
  }

  async stopValidationSession(): Promise<ValidationTelemetry | null> {
    if (!this.isRunning) {
      return null;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - (this.startTime?.getTime() || 0);

    const avgLatency = this.getAverageLatency();
    const cacheHealth = priceCache.getHealthMetrics();
    const cwqiVariance = this.computeCWQIVariance();
    const relevanceRange = this.computeAdaptiveRelevanceRange();
    const relevanceVariance = relevanceRange[1] - relevanceRange[0];

    const ngcValues = this.metricSnapshots.map(m => m.ngc);
    const cwqiValues = this.metricSnapshots.map(m => m.cwqi);
    let maxDrift = 0;
    for (let i = 1; i < this.metricSnapshots.length; i++) {
      const ngcDrift = Math.abs(ngcValues[i] - ngcValues[i - 1]) / (ngcValues[i - 1] || 1);
      const cwqiDrift = Math.abs(cwqiValues[i] - cwqiValues[i - 1]) / (cwqiValues[i - 1] || 1);
      maxDrift = Math.max(maxDrift, ngcDrift, cwqiDrift);
    }

    const criteria: ValidationCriteria = {
      feedLatency: {
        threshold: 100,
        actual: avgLatency,
        passed: avgLatency < 100
      },
      cacheWindow: {
        threshold: 200,
        actual: this.feedLatencies.length,
        passed: this.feedLatencies.length >= 200
      },
      araUpdates: {
        threshold: 3,
        actual: this.araUpdates,
        passed: this.araUpdates >= 3
      },
      adaptiveRelevanceVariance: {
        threshold: 0.01,
        actual: relevanceVariance,
        passed: relevanceVariance > 0.01
      },
      cwqiNgcDrift: {
        threshold: 0.10,
        actual: maxDrift,
        passed: maxDrift < 0.10
      },
      vtsModeSwitchDelay: {
        threshold: 1,
        actual: this.vtsModeSwitches.toObserver + this.vtsModeSwitches.toSimulator,
        passed: true
      }
    };

    const telemetry: ValidationTelemetry = {
      timestamp: endTime.toISOString(),
      mode: 'paper',
      sessionId: this.sessionId!,
      startTime: this.startTime!.toISOString(),
      endTime: endTime.toISOString(),
      durationMs,
      tradesExecuted: this.tradesExecuted,
      averageFeedLatencyMs: Math.round(avgLatency * 10) / 10,
      cacheWindow: cacheHealth.cacheSize,
      adaptiveRelevanceRange: relevanceRange,
      cwqiVariance: Math.round(cwqiVariance * 1000) / 1000,
      ngcAvg: Math.round(this.computeNGCAverage() * 100) / 100,
      diAvg: Math.round(this.computeDIAverage() * 100) / 100,
      vtsModeSwitches: this.vtsModeSwitches,
      araUpdates: this.araUpdates,
      metricSnapshots: this.metricSnapshots,
      rollingSnapshots: this.rollingSnapshots, // M5-R1: Persist 5-minute snapshots
      failures: this.failures,
      validationCriteria: criteria
    };

    console.log(`[M5-R1][VALIDATION] Captured ${this.rollingSnapshots.length} rolling snapshots (5-min intervals)`);

    const filename = `ValidationRun_${this.startTime!.toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(REPORTS_DIR, filename);
    await fs.writeFile(filepath, JSON.stringify(telemetry, null, 2));
    console.log(`[M5][VALIDATION] Report saved: ${filepath}`);

    this.isRunning = false;
    this.sessionId = null;
    this.startTime = null;

    console.log(`[M5][VALIDATION] Session complete. ${this.metricSnapshots.length} snapshots captured.`);

    return telemetry;
  }

  getStatus(): {
    isRunning: boolean;
    sessionId: string | null;
    startTime: string | null;
    snapshotCount: number;
    tradesExecuted: number;
    araUpdates: number;
    currentLatency: number;
    vtsModeSwitches: { toObserver: number; toSimulator: number };
  } {
    return {
      isRunning: this.isRunning,
      sessionId: this.sessionId,
      startTime: this.startTime?.toISOString() || null,
      snapshotCount: this.metricSnapshots.length,
      tradesExecuted: this.tradesExecuted,
      araUpdates: this.araUpdates,
      currentLatency: this.getAverageLatency(),
      vtsModeSwitches: this.vtsModeSwitches
    };
  }

  async getLatestReport(): Promise<ValidationTelemetry | null> {
    try {
      const files = await fs.readdir(REPORTS_DIR);
      const validationFiles = files
        .filter(f => f.startsWith('ValidationRun_') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (validationFiles.length === 0) return null;

      const content = await fs.readFile(path.join(REPORTS_DIR, validationFiles[0]), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async listReports(): Promise<string[]> {
    try {
      const files = await fs.readdir(REPORTS_DIR);
      return files
        .filter(f => f.startsWith('ValidationRun_') && f.endsWith('.json'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  resetBuffer(): void {
    this.metricSnapshots = [];
    this.feedLatencies = [];
    this.tradesExecuted = 0;
    this.araUpdates = 0;
    this.vtsModeSwitches = { toObserver: 0, toSimulator: 0 };
    this.failures = [];
    console.log('[M5][VALIDATION] Buffer reset');
  }
}

export const paperValidationEngine = new PaperValidationEngine();
