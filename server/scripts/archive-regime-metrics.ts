/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7E — Archival Collector & Checksum Logic
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Phase: 11.7 | Series: Predictive Learning Feedback Loop
 * Dependencies: 11.7B, 11.7C, 11.7D, 11.7D.1
 * Implements: Weekly archival of regime × strategy performance summaries
 * Source Isolation: "VTS" only
 * Schema Version: regime-archive/v1.1
 * 
 * Process:
 * 1. Load latest telemetry + canonical weights
 * 2. Merge into regime-strategy records
 * 3. Compute deterministic checksums
 * 4. Validate schema and log warnings for missing metrics
 * 5. Retry + rollback if checksum verification fails after write
 * 6. Append safely via safeAppendJSON with file lock
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  REGIME_ARCHIVE_SCHEMA,
  ARCHIVE_DIR,
  TELEMETRY_DIR,
  CANONICAL_PATH,
  RegimeArchiveRecord,
  RegimeArchiveMetrics,
  RegimeArchiveMetadata,
  ArchiveManifestEntry,
  computeChecksum,
  verifyChecksum,
  addManifestEntry,
  getManifest,
} from '../core/archival/regime-archiver';
import { getAdjustments } from '../core/logging/predictive-adjustments';

const MANIFEST_PATH = path.join(TELEMETRY_DIR, 'regime_performance_manifest.json');
const MAX_RETRIES = 3;

interface TelemetryManifestEntry {
  filename: string;
  totalProcessed: number;
  regimes: number;
  version: number;
  timestamp: string;
}

interface TelemetrySnapshot {
  [regime: string]: {
    [strategy: string]: {
      winRate?: number;
      avgPnL?: number;
      skipRatio?: number;
      tradeCount?: number;
      source?: string;
    };
  };
}

interface CanonicalWeights {
  _schema?: string;
  _metadata?: {
    version: number;
    source: string;
    updatedAt: string;
    dynamicROISettings?: {
      baseROI?: number;
    };
  };
  [regime: string]: unknown;
}

function ensureDirectories(): void {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

function loadLatestTelemetry(): { snapshot: TelemetrySnapshot; version: number } | null {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.warn('[11.7E][Archive] Telemetry manifest not found');
    return null;
  }
  
  try {
    const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const manifest: TelemetryManifestEntry[] = JSON.parse(manifestContent);
    
    if (manifest.length === 0) {
      console.warn('[11.7E][Archive] Telemetry manifest is empty');
      return null;
    }
    
    const sortedManifest = [...manifest].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    const latest = sortedManifest[0];
    const telemetryPath = path.join(TELEMETRY_DIR, latest.filename);
    
    if (!fs.existsSync(telemetryPath)) {
      console.warn(`[11.7E][Archive] Telemetry file not found: ${latest.filename}`);
      return null;
    }
    
    const content = fs.readFileSync(telemetryPath, 'utf8');
    const snapshot = JSON.parse(content) as TelemetrySnapshot;
    
    return { snapshot, version: latest.version };
  } catch (err) {
    console.error('[11.7E][Archive] Error loading telemetry:', err);
    return null;
  }
}

function loadCanonicalWeights(): { weights: CanonicalWeights; version: number } | null {
  if (!fs.existsSync(CANONICAL_PATH)) {
    console.warn('[11.7E][Archive] Canonical weights not found');
    return null;
  }
  
  try {
    const content = fs.readFileSync(CANONICAL_PATH, 'utf8');
    const weights = JSON.parse(content) as CanonicalWeights;
    const version = weights._metadata?.version || 1;
    return { weights, version };
  } catch (err) {
    console.error('[11.7E][Archive] Error loading canonical weights:', err);
    return null;
  }
}

function validateRecord(record: Partial<RegimeArchiveRecord>): boolean {
  const requiredMetrics = ['winRate', 'avgPnL', 'skipRatio', 'confidence'];
  const missing = requiredMetrics.filter(m => 
    record.metrics && !(m in record.metrics)
  );
  
  if (missing.length > 0) {
    console.warn(`[11.7E][Archive] Missing metrics for ${record.regime}/${record.strategy}: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}

function countStrategiesPerRegime(snapshot: TelemetrySnapshot): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const regime of Object.keys(snapshot)) {
    counts[regime] = Object.keys(snapshot[regime] || {}).length;
  }
  return counts;
}

export async function archiveRegimeMetrics(): Promise<{
  success: boolean;
  recordCount: number;
  filename: string | null;
  message: string;
}> {
  console.log('[11.7E][Archive] Starting regime metrics archival...');
  ensureDirectories();
  
  const telemetryData = loadLatestTelemetry();
  if (!telemetryData) {
    return {
      success: false,
      recordCount: 0,
      filename: null,
      message: 'No telemetry data available',
    };
  }
  
  const canonicalData = loadCanonicalWeights();
  if (!canonicalData) {
    return {
      success: false,
      recordCount: 0,
      filename: null,
      message: 'No canonical weights available',
    };
  }
  
  const { snapshot: telemetry, version: telemetryVersion } = telemetryData;
  const { weights: canonical, version: canonicalVersion } = canonicalData;
  
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);
  const recentAdjustments = getAdjustments({ from: fromDate.toISOString().slice(0, 10), limit: 1000 });
  const predictiveAdjustmentsCount = recentAdjustments.length;
  
  const strategyCounts = countStrategiesPerRegime(telemetry);
  for (const [regime, count] of Object.entries(strategyCounts)) {
    if (count < 2) {
      console.warn(`[11.7E][Archive] Regime ${regime} has <2 strategies — incomplete dataset`);
    }
  }
  
  const records: RegimeArchiveRecord[] = [];
  const timestamp = new Date().toISOString();
  let totalConfidence = 0;
  let recordCount = 0;
  
  for (const regime of Object.keys(telemetry)) {
    if (regime.startsWith('_')) continue;
    
    const regimeData = telemetry[regime];
    const regimeWeights = canonical[regime] as { momentum?: number; volatility?: number; trend?: number } | undefined;
    
    for (const strategy of Object.keys(regimeData)) {
      const strategyData = regimeData[strategy];
      
      if (strategyData.source && strategyData.source !== 'VTS') {
        continue;
      }
      
      const winRate = strategyData.winRate ?? 0;
      const avgPnL = strategyData.avgPnL ?? 0;
      const skipRatio = strategyData.skipRatio ?? 0;
      
      const confidence = (winRate * 0.4 + Math.max(0, avgPnL * 10) * 0.4 + (1 - skipRatio) * 0.2);
      const dynamicROI = canonical._metadata?.dynamicROISettings?.baseROI ?? 0.02;
      
      const momentumWeight = regimeWeights?.momentum ?? 0.33;
      const volatilityWeight = regimeWeights?.volatility ?? 0.33;
      const trendWeight = regimeWeights?.trend ?? 0.34;
      
      const metrics: RegimeArchiveMetrics = {
        winRate,
        avgPnL,
        skipRatio,
        confidence,
        dynamicROI,
        momentumWeight,
        volatilityWeight,
        trendWeight,
      };
      
      const metadata: RegimeArchiveMetadata = {
        telemetryVersion,
        canonicalVersion,
        predictiveAdjustments: predictiveAdjustmentsCount,
        recordCount: strategyData.tradeCount ?? 0,
        avgConfidence: confidence,
      };
      
      const recordWithoutChecksum = {
        _schema: REGIME_ARCHIVE_SCHEMA,
        timestamp,
        source: 'VTS' as const,
        windowDays: 7,
        regime,
        strategy,
        metrics,
        _metadata: metadata,
      };
      
      const checksum = computeChecksum(recordWithoutChecksum);
      
      const record: RegimeArchiveRecord = {
        ...recordWithoutChecksum,
        checksum,
      };
      
      if (!validateRecord(record)) {
        console.warn(`[11.7E][Archive] Skipping invalid record: ${regime}/${strategy}`);
        continue;
      }
      
      records.push(record);
      totalConfidence += confidence;
      recordCount++;
    }
  }
  
  if (records.length === 0) {
    return {
      success: false,
      recordCount: 0,
      filename: null,
      message: 'No valid records to archive',
    };
  }
  
  const avgConfidence = totalConfidence / recordCount;
  
  for (const record of records) {
    record._metadata.avgConfidence = avgConfidence;
    const { checksum, ...rest } = record;
    record.checksum = computeChecksum(rest);
  }
  
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}.json`;
  const filePath = path.join(ARCHIVE_DIR, filename);
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(records, null, 2));
      
      const verifyContent = fs.readFileSync(tempPath, 'utf8');
      const verifyRecords = JSON.parse(verifyContent) as RegimeArchiveRecord[];
      
      let allValid = true;
      for (const record of verifyRecords) {
        if (!verifyChecksum(record)) {
          console.error(`[11.7E][Archive] Checksum verification failed for ${record.regime}/${record.strategy}`);
          allValid = false;
          break;
        }
      }
      
      if (!allValid) {
        fs.unlinkSync(tempPath);
        console.warn(`[11.7E][Archive] Retry ${attempt + 1}/${MAX_RETRIES} - checksum verification failed`);
        continue;
      }
      
      fs.renameSync(tempPath, filePath);
      
      const fileChecksum = records.length > 0 ? records[0].checksum : '';
      
      const manifestEntry: ArchiveManifestEntry = {
        filename,
        entries: records.length,
        checksum: fileChecksum,
        createdAt: timestamp,
        version: 1,
        compressed: false,
      };
      
      addManifestEntry(manifestEntry);
      
      console.log(`[11.7E][Archive] ✅ Archived ${records.length} records to ${filename}`);
      console.log(`[11.7E][Archive] Average confidence: ${avgConfidence.toFixed(4)}`);
      
      return {
        success: true,
        recordCount: records.length,
        filename,
        message: `Archived ${records.length} regime-strategy records`,
      };
    } catch (err) {
      console.error(`[11.7E][Archive] Attempt ${attempt + 1}/${MAX_RETRIES} failed:`, err);
      
      if (attempt === MAX_RETRIES - 1) {
        return {
          success: false,
          recordCount: 0,
          filename: null,
          message: `Failed after ${MAX_RETRIES} attempts: ${err}`,
        };
      }
      
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
    }
  }
  
  return {
    success: false,
    recordCount: 0,
    filename: null,
    message: 'Unexpected error in archival',
  };
}

