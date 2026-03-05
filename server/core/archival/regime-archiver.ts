/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7E — Persistent Regime-Metric Archival for Phase 12 Seeding
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Phase: 11.7 | Series: Predictive Learning Feedback Loop
 * Dependencies: 11.7B (Telemetry), 11.7C (Dynamic ROI), 11.7D (Recalibration), 11.7D.1 (Adjustments)
 * Implements: Long-term archival of regime-level predictive metrics for ML retraining
 * Source Isolation: "VTS" only
 * Schema Version: regime-archive/v1.1
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { safeAppendJSON, safeReadJSONArray } from '../../utils/logging';

export const REGIME_ARCHIVE_SCHEMA = 'regime-archive/v1.1';
export const ARCHIVE_DIR = path.join(process.cwd(), 'logs', 'regime_archive');
export const MANIFEST_PATH = path.join(ARCHIVE_DIR, 'regime_archive_manifest.json');
export const TELEMETRY_DIR = path.join(process.cwd(), 'logs', 'telemetry');
export const CANONICAL_PATH = path.join(process.cwd(), 'bridge', 'canonical', 'phase9_predictive-learning.json');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface RegimeArchiveMetrics {
  winRate: number;
  avgPnL: number;
  skipRatio: number;
  confidence: number;
  dynamicROI: number;
  momentumWeight: number;
  volatilityWeight: number;
  trendWeight: number;
}

export interface RegimeArchiveMetadata {
  telemetryVersion: number;
  canonicalVersion: number;
  predictiveAdjustments: number;
  recordCount: number;
  avgConfidence: number;
}

export interface RegimeArchiveRecord {
  _schema: string;
  timestamp: string;
  source: 'VTS';
  windowDays: number;
  regime: string;
  strategy: string;
  metrics: RegimeArchiveMetrics;
  checksum: string;
  _metadata: RegimeArchiveMetadata;
}

export interface ArchiveManifestEntry {
  filename: string;
  entries: number;
  checksum: string;
  createdAt: string;
  version: number;
  compressed: boolean;
  compressedAt?: string;
}

function ensureDirectories(): void {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sortedObj[key] = sortObjectKeys(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sortedObj[key] = value.map(item => 
        item && typeof item === 'object' && !Array.isArray(item)
          ? sortObjectKeys(item as Record<string, unknown>)
          : item
      );
    } else {
      sortedObj[key] = value;
    }
  }
  return sortedObj;
}

export function canonicalStringify(obj: Record<string, unknown>): string {
  const sortedObj = sortObjectKeys(obj);
  return JSON.stringify(sortedObj, null, 3);
}

export function computeChecksum(record: Omit<RegimeArchiveRecord, 'checksum'>): string {
  const stringified = canonicalStringify(record as unknown as Record<string, unknown>);
  return crypto
    .createHash('sha1')
    .update(stringified)
    .digest('hex')
    .slice(0, 8);
}

export function verifyChecksum(record: RegimeArchiveRecord): boolean {
  const { checksum, ...rest } = record;
  const computed = computeChecksum(rest);
  return computed === checksum;
}

export function getManifest(): ArchiveManifestEntry[] {
  ensureDirectories();
  if (!fs.existsSync(MANIFEST_PATH)) {
    return [];
  }
  try {
    const content = fs.readFileSync(MANIFEST_PATH, 'utf8');
    return JSON.parse(content);
  } catch {
    console.warn('[11.7E][Manifest] Error reading manifest, returning empty array');
    return [];
  }
}

export function saveManifest(manifest: ArchiveManifestEntry[]): boolean {
  ensureDirectories();
  const tempPath = `${MANIFEST_PATH}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2));
    fs.renameSync(tempPath, MANIFEST_PATH);
    return true;
  } catch (err) {
    console.error('[11.7E][Manifest] Error saving manifest:', err);
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
    return false;
  }
}

export function addManifestEntry(entry: ArchiveManifestEntry): boolean {
  const manifest = getManifest();
  manifest.push(entry);
  return saveManifest(manifest);
}

export function updateManifestEntry(filename: string, updates: Partial<ArchiveManifestEntry>): boolean {
  const manifest = getManifest();
  const index = manifest.findIndex(e => e.filename === filename);
  if (index === -1) {
    console.warn(`[11.7E][Manifest] Entry not found: ${filename}`);
    return false;
  }
  manifest[index] = { ...manifest[index], ...updates };
  return saveManifest(manifest);
}

export function getArchiveRecords(options: {
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): RegimeArchiveRecord[] {
  ensureDirectories();
  const { from, to, limit = 100, offset = 0 } = options;
  
  const manifest = getManifest();
  const records: RegimeArchiveRecord[] = [];
  
  const sortedManifest = [...manifest].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  for (const entry of sortedManifest) {
    if (from && new Date(entry.createdAt) < new Date(from)) continue;
    if (to && new Date(entry.createdAt) > new Date(to)) continue;
    
    const filePath = path.join(ARCHIVE_DIR, entry.filename);
    
    try {
      let content: string;
      
      if (entry.compressed) {
        const gzPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
        if (fs.existsSync(gzPath)) {
          const compressed = fs.readFileSync(gzPath);
          content = zlib.gunzipSync(compressed).toString('utf8');
        } else {
          continue;
        }
      } else {
        if (!fs.existsSync(filePath)) continue;
        content = fs.readFileSync(filePath, 'utf8');
      }
      
      const fileRecords = JSON.parse(content) as RegimeArchiveRecord[];
      records.push(...fileRecords);
    } catch (err) {
      console.warn(`[11.7E][Archive] Error reading ${entry.filename}:`, err);
    }
  }
  
  records.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  return records.slice(offset, offset + limit);
}

export function getLatestArchive(): RegimeArchiveRecord[] | null {
  const manifest = getManifest();
  if (manifest.length === 0) return null;
  
  const sortedManifest = [...manifest].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  const latest = sortedManifest[0];
  const filePath = path.join(ARCHIVE_DIR, latest.filename);
  
  try {
    let content: string;
    
    if (latest.compressed) {
      const gzPath = filePath.endsWith('.gz') ? filePath : `${filePath}.gz`;
      const compressed = fs.readFileSync(gzPath);
      content = zlib.gunzipSync(compressed).toString('utf8');
    } else {
      content = fs.readFileSync(filePath, 'utf8');
    }
    
    return JSON.parse(content) as RegimeArchiveRecord[];
  } catch (err) {
    console.error('[11.7E][Archive] Error reading latest archive:', err);
    return null;
  }
}

export function getArchiveSummary(): {
  totalEntries: number;
  avgConfidence: number;
  avgPnL: number;
  regimeCount: number;
  strategyCount: number;
  oldestArchive: string | null;
  newestArchive: string | null;
} {
  const manifest = getManifest();
  
  if (manifest.length === 0) {
    return {
      totalEntries: 0,
      avgConfidence: 0,
      avgPnL: 0,
      regimeCount: 0,
      strategyCount: 0,
      oldestArchive: null,
      newestArchive: null,
    };
  }
  
  const sortedManifest = [...manifest].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  const totalEntries = manifest.reduce((sum, e) => sum + e.entries, 0);
  
  const records = getArchiveRecords({ limit: 1000 });
  const regimes = new Set(records.map(r => r.regime));
  const strategies = new Set(records.map(r => r.strategy));
  
  const avgConfidence = records.length > 0
    ? records.reduce((sum, r) => sum + r.metrics.confidence, 0) / records.length
    : 0;
  
  const avgPnL = records.length > 0
    ? records.reduce((sum, r) => sum + r.metrics.avgPnL, 0) / records.length
    : 0;
  
  return {
    totalEntries,
    avgConfidence,
    avgPnL,
    regimeCount: regimes.size,
    strategyCount: strategies.size,
    oldestArchive: sortedManifest[0]?.createdAt || null,
    newestArchive: sortedManifest[sortedManifest.length - 1]?.createdAt || null,
  };
}

export function exportArchiveToCSV(records: RegimeArchiveRecord[]): string {
  const headers = [
    'timestamp',
    'source',
    'windowDays',
    'regime',
    'strategy',
    'winRate',
    'avgPnL',
    'skipRatio',
    'confidence',
    'dynamicROI',
    'momentumWeight',
    'volatilityWeight',
    'trendWeight',
    'checksum',
    'telemetryVersion',
    'canonicalVersion',
    'recordCount',
    'avgConfidence',
  ];
  
  const rows = records.map(r => [
    r.timestamp,
    r.source,
    r.windowDays,
    r.regime,
    r.strategy,
    r.metrics.winRate,
    r.metrics.avgPnL,
    r.metrics.skipRatio,
    r.metrics.confidence,
    r.metrics.dynamicROI,
    r.metrics.momentumWeight,
    r.metrics.volatilityWeight,
    r.metrics.trendWeight,
    r.checksum,
    r._metadata.telemetryVersion,
    r._metadata.canonicalVersion,
    r._metadata.recordCount,
    r._metadata.avgConfidence,
  ].join(','));
  
  return [headers.join(','), ...rows].join('\n');
}

export function clearArchiveForFreshStart(): void {
  ensureDirectories();
  try {
    const files = fs.readdirSync(ARCHIVE_DIR);
    let deletedCount = 0;
    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.json.gz')) {
        fs.unlinkSync(path.join(ARCHIVE_DIR, file));
        deletedCount++;
      }
    }
    saveManifest([]);
    console.log(`[Phase14][RegimeArchive] Fresh start: cleared ${deletedCount} archive files and reset manifest`);
  } catch (err) {
    console.warn('[Phase14][RegimeArchive] Error clearing archive:', err);
  }
}

console.log('[11.7E][RegimeArchiver] Module initialized');
