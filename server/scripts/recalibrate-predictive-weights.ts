/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7D — Canonical Predictive-Weight Recalibration Script
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Phase: 11.7 | Series: Predictive Learning Feedback Loop
 * Dependencies: 11.7B (Telemetry Aggregation), 11.7C (Dynamic ROI Thresholding)
 * Implements: Empirical recalibration of canonical predictive-learning weights
 * Source Isolation: "VTS" only
 * Schema Version: predictive-weights/v1.1
 * 
 * Purpose:
 * Automatically recalibrate DawnTrader's canonical predictive-learning weight
 * vectors using rolling 7-day empirical performance from VTS telemetry.
 * Applies exponential smoothing (α = 0.6) with full audit controls.
 * 
 * Governance: Directive 11.7D
 * ══════════════════════════════════════════════════════════════════════════════
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const CANONICAL_PATH = "bridge/canonical/phase9_predictive-learning.json";
const BACKUP_DIR = "bridge/canonical/backups";
const MANIFEST_PATH = "logs/telemetry/regime_performance_manifest.json";
const HISTORY_PATH = "logs/telemetry/recalibration_history.json";
const SYSTEM_EVENTS_LOG = "logs/system_events.log";
const ALPHA = 0.6;

interface RegimeMetrics {
  winRate?: number;
  avgPnL?: number;
  skipRatio?: number;
  count?: number;
}

interface TelemetrySnapshot {
  [regime: string]: {
    [strategy: string]: RegimeMetrics;
  };
}

interface ManifestEntry {
  filename: string;
  totalProcessed: number;
  regimes: number;
  version: number;
  timestamp: string;
  frictionAware?: boolean;
}

interface WeightVector {
  momentum: number;
  volatility: number;
  trend: number;
}

interface CanonicalMetadata {
  version: number;
  source: string;
  updatedAt: string;
  method: string;
  windowDays: number;
  smoothingAlpha: number;
  metricMapping: {
    momentum: string;
    volatility: string;
    trend: string;
  };
}

interface CanonicalWeights {
  [regime: string]: WeightVector | string | CanonicalMetadata | undefined;
  _schema?: string;
  _metadata?: CanonicalMetadata;
}

interface RecalibrationHistoryEntry {
  timestamp: string;
  version: number;
  regimes: number;
  checksum: string;
  lastSuccessfulRun: string;
}

function ensureDirectories(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  const telemetryDir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(telemetryDir)) {
    fs.mkdirSync(telemetryDir, { recursive: true });
  }
  const eventsDir = path.dirname(SYSTEM_EVENTS_LOG);
  if (!fs.existsSync(eventsDir)) {
    fs.mkdirSync(eventsDir, { recursive: true });
  }
}

function loadLatestSnapshot(): TelemetrySnapshot {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error("[11.7D] Telemetry manifest not found.");
  }

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (!manifest?.length) {
    throw new Error("[11.7D] Telemetry manifest empty.");
  }

  const latest = manifest[manifest.length - 1];
  const snapshotPath = path.join("logs/telemetry", latest.filename);
  
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`[11.7D] Telemetry snapshot not found: ${snapshotPath}`);
  }
  
  const snapshot: TelemetrySnapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  if (!snapshot || Object.keys(snapshot).length < 3) {
    throw new Error("[11.7D] Invalid or empty telemetry snapshot.");
  }
  
  console.log(`[11.7D] Loaded telemetry snapshot: ${latest.filename} (${Object.keys(snapshot).length} regimes)`);
  return snapshot;
}

function computeNormalizedWeights(
  metrics: TelemetrySnapshot, 
  prev?: CanonicalWeights
): Record<string, WeightVector> {
  const weightMap: Record<string, WeightVector> = {};
  
  for (const regime of Object.keys(metrics)) {
    if (regime.startsWith("_")) continue;
    
    const strategies = metrics[regime];
    const acc = { momentum: 0, volatility: 0, trend: 0 };
    let count = 0;

    for (const strategy of Object.keys(strategies)) {
      const perf = strategies[strategy];
      
      if (perf.avgPnL == null || perf.skipRatio == null) {
        console.warn(`[11.7D] Missing metrics in regime ${regime}/${strategy}`);
      }
      
      acc.momentum += perf.winRate ?? 0;
      acc.volatility += Math.abs(perf.avgPnL ?? 0);
      acc.trend += 1 - (perf.skipRatio ?? 0);
      count++;
    }

    for (const k of Object.keys(acc) as Array<keyof typeof acc>) {
      acc[k] = Math.max(acc[k] / Math.max(count, 1), 0);
    }

    let total = Object.values(acc).reduce((a, b) => a + b, 0);
    if (!Number.isFinite(total) || total <= 0) {
      acc.momentum = acc.volatility = acc.trend = 0.33;
      total = 1;
    }

    for (const k of Object.keys(acc) as Array<keyof typeof acc>) {
      acc[k] = +(acc[k] / total).toFixed(3);
    }

    if (prev?.[regime] && !regime.startsWith("_")) {
      const prevWeights = prev[regime] as WeightVector;
      for (const k of Object.keys(acc) as Array<keyof typeof acc>) {
        const p = prevWeights?.[k] ?? 0.33;
        acc[k] = +(ALPHA * acc[k] + (1 - ALPHA) * p).toFixed(3);
      }
    }
    
    weightMap[regime] = acc;
  }
  
  return weightMap;
}

function backupExistingCanonical(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  if (fs.existsSync(CANONICAL_PATH)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `phase9_predictive-learning_${stamp}.json`;
    fs.copyFileSync(CANONICAL_PATH, path.join(BACKUP_DIR, name));
    console.log(`[11.7D] Backup created: ${name}`);

    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("phase9_predictive-learning_"))
      .sort()
      .reverse();
    
    for (const old of backups.slice(3)) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
      console.log(`[11.7D] Removed old backup: ${old}`);
    }
  }
}

function computeChecksum(data: unknown): string {
  const rounded = JSON.stringify(data, (k, v) =>
    typeof v === 'number' ? +v.toFixed(3) : v
  );
  return crypto.createHash("sha1").update(rounded).digest("hex").slice(0, 8);
}

export function recalibratePredictiveWeights(): boolean {
  try {
    console.log("[11.7D][Recalibration] Starting canonical weight recalibration...");
    ensureDirectories();
    
    const snapshot = loadLatestSnapshot();
    
    let prev: CanonicalWeights | undefined;
    if (fs.existsSync(CANONICAL_PATH)) {
      prev = JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8"));
      
      if (prev?._metadata?.source && prev._metadata.source !== "VTS") {
        throw new Error("[11.7D] Manual/ML canonical detected — skipping recalibration.");
      }
    }

    const newWeights = computeNormalizedWeights(snapshot, prev);
    const checksum = computeChecksum(newWeights);

    const metadata = {
      _schema: "predictive-weights/v1.1",
      _metadata: {
        version: (prev?._metadata?.version ?? 0) + 1,
        source: "VTS",
        updatedAt: new Date().toISOString(),
        method: "empirical-recalibration",
        windowDays: 7,
        smoothingAlpha: ALPHA,
        metricMapping: {
          momentum: "winRate",
          volatility: "abs(avgPnL)",
          trend: "1 - skipRatio"
        }
      }
    };

    const previousChecksum = prev
      ? computeChecksum(
          Object.fromEntries(
            Object.entries(prev).filter(([k]) => !k.startsWith("_"))
          )
        )
      : null;

    if (checksum === previousChecksum) {
      console.log("[11.7D] No significant change — skip overwrite.");
      return true;
    }

    backupExistingCanonical();
    
    const canonicalDir = path.dirname(CANONICAL_PATH);
    if (!fs.existsSync(canonicalDir)) {
      fs.mkdirSync(canonicalDir, { recursive: true });
    }
    
    const finalOutput = { ...newWeights, ...metadata };
    fs.writeFileSync(CANONICAL_PATH, JSON.stringify(finalOutput, null, 2));

    const verify = computeChecksum(
      Object.fromEntries(
        Object.entries(JSON.parse(fs.readFileSync(CANONICAL_PATH, "utf8")))
          .filter(([k]) => !k.startsWith("_"))
      )
    );
    
    if (verify !== checksum) {
      throw new Error("[11.7D] Checksum mismatch after write — partial write suspected.");
    }

    let history: RecalibrationHistoryEntry[] = [];
    if (fs.existsSync(HISTORY_PATH)) {
      try {
        history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
      } catch {
        history = [];
      }
    }
    
    history.push({
      timestamp: new Date().toISOString(),
      version: metadata._metadata.version,
      regimes: Object.keys(newWeights).length,
      checksum,
      lastSuccessfulRun: new Date().toISOString()
    });
    
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

    const eventLog = `[${new Date().toISOString()}][11.7D] Canonical weights updated v${metadata._metadata.version} checksum:${checksum}\n`;
    fs.appendFileSync(SYSTEM_EVENTS_LOG, eventLog);

    console.log(`[11.7D][Recalibration] Updated predictive weights for ${Object.keys(newWeights).length} regimes.`);
    console.log(`[11.7D][Recalibration] Version: ${metadata._metadata.version}, Checksum: ${checksum}`);
    
    return true;
  } catch (err) {
    console.error("[11.7D][Error]", err);
    return false;
  }
}

export function getRecalibrationStatus(): {
  lastRun: string | null;
  version: number;
  regimes: number;
  checksum: string | null;
} {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { lastRun: null, version: 0, regimes: 0, checksum: null };
  }
  
  try {
    const history: RecalibrationHistoryEntry[] = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
    if (!history.length) {
      return { lastRun: null, version: 0, regimes: 0, checksum: null };
    }
    
    const latest = history[history.length - 1];
    return {
      lastRun: latest.timestamp,
      version: latest.version,
      regimes: latest.regimes,
      checksum: latest.checksum
    };
  } catch {
    return { lastRun: null, version: 0, regimes: 0, checksum: null };
  }
}
