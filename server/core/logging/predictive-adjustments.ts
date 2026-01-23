/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7D.1 — Predictive Adjustment Logger
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides structured event logging for all adaptive parameter changes:
 * - ROI thresholds
 * - Expectancy calculations
 * - Confidence scores
 * - Weight vectors
 * - Scoring coefficients
 * 
 * All entries are schema-versioned and impact-scored for ML ingestion.
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { safeAppendJSON, safeReadJSONArray } from '../../utils/logging';

export const PREDICTIVE_ADJUSTMENTS_SCHEMA = "predictive-adjustments/v1.0";

export type AdjustmentCategory =
  | "ROI"
  | "Expectancy"
  | "Confidence"
  | "Weight"
  | "Scoring"
  | "Other";

export interface PredictiveAdjustmentEntry {
  _schema: string;
  timestamp: string;
  category: AdjustmentCategory;
  parameter: string;
  oldValue: number;
  newValue: number;
  delta: number;
  impact: number;
  regime?: string;
  strategy?: string;
  reason: string;
}

export interface AdjustmentInput {
  category: AdjustmentCategory;
  parameter: string;
  oldValue: number;
  newValue: number;
  regime?: string;
  strategy?: string;
  reason: string;
}

const ADJUSTMENTS_DIR = path.join(process.cwd(), 'logs', 'predictive_adjustments');
const SYSTEM_EVENTS_LOG = path.join(process.cwd(), 'logs', 'system_events.log');

function ensureDirectories(): void {
  if (!fs.existsSync(ADJUSTMENTS_DIR)) {
    fs.mkdirSync(ADJUSTMENTS_DIR, { recursive: true });
  }
  const logsDir = path.dirname(SYSTEM_EVENTS_LOG);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

/**
 * Logs a predictive adjustment with impact scoring and schema versioning.
 * 
 * @param entry - The adjustment details to log
 * @returns The complete record that was logged
 */
export function logPredictiveAdjustment(entry: AdjustmentInput): PredictiveAdjustmentEntry {
  ensureDirectories();
  
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(ADJUSTMENTS_DIR, `${date}.json`);

  const impact = Math.abs(entry.newValue - entry.oldValue) / 
    Math.max(Math.abs(entry.oldValue), 0.001);

  const record: PredictiveAdjustmentEntry = {
    _schema: PREDICTIVE_ADJUSTMENTS_SCHEMA,
    timestamp: new Date().toISOString(),
    category: entry.category,
    parameter: entry.parameter,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    delta: +(entry.newValue - entry.oldValue).toFixed(4),
    impact: +impact.toFixed(3),
    regime: entry.regime,
    strategy: entry.strategy,
    reason: entry.reason
  };

  safeAppendJSON(file, record as unknown as Record<string, unknown>);

  const systemLogEntry = `[11.7D.1][Adjustment] ${entry.category}:${entry.parameter} ${entry.oldValue}→${entry.newValue} (${entry.reason})\n`;
  try {
    fs.appendFileSync(SYSTEM_EVENTS_LOG, `${new Date().toISOString()} ${systemLogEntry}`);
  } catch (err) {
    console.warn(`[11.7D.1] Failed to append to system events log: ${err}`);
  }

  console.log(`[11.7D.1][Adjustment] ${entry.category}:${entry.parameter} ${entry.oldValue.toFixed(4)}→${entry.newValue.toFixed(4)} impact=${impact.toFixed(3)} (${entry.reason})`);

  return record;
}

/**
 * Retrieves adjustment records with optional date filtering and pagination.
 * 
 * @param options - Query options
 * @returns Array of adjustment records
 */
export function getAdjustments(options?: {
  from?: string;
  to?: string;
  limit?: number;
  category?: AdjustmentCategory;
  regime?: string;
}): PredictiveAdjustmentEntry[] {
  ensureDirectories();
  
  const { from, to, limit = 100, category, regime } = options || {};
  
  let files: string[] = [];
  try {
    files = fs.readdirSync(ADJUSTMENTS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    return [];
  }

  if (from) {
    files = files.filter(f => f.replace('.json', '') >= from);
  }
  if (to) {
    files = files.filter(f => f.replace('.json', '') <= to);
  }

  let results: PredictiveAdjustmentEntry[] = [];
  
  for (const file of files) {
    if (results.length >= limit) break;
    
    const filePath = path.join(ADJUSTMENTS_DIR, file);
    const records = safeReadJSONArray<PredictiveAdjustmentEntry>(filePath);
    
    let filtered = records.filter(r => r._schema === PREDICTIVE_ADJUSTMENTS_SCHEMA);
    
    if (category) {
      filtered = filtered.filter(r => r.category === category);
    }
    if (regime) {
      filtered = filtered.filter(r => r.regime === regime);
    }
    
    results = results.concat(filtered);
  }

  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return results.slice(0, limit);
}

/**
 * Gets a summary of recent adjustments by category.
 * 
 * @param days - Number of days to look back (default: 7)
 * @returns Summary statistics
 */
export function getAdjustmentsSummary(days: number = 7): {
  totalAdjustments: number;
  byCategory: Record<AdjustmentCategory, number>;
  byRegime: Record<string, number>;
  avgImpact: number;
  highImpactCount: number;
  lastAdjustment: string | null;
} {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  const from = fromDate.toISOString().slice(0, 10);
  
  const adjustments = getAdjustments({ from, limit: 10000 });
  
  const byCategory: Record<AdjustmentCategory, number> = {
    ROI: 0,
    Expectancy: 0,
    Confidence: 0,
    Weight: 0,
    Scoring: 0,
    Other: 0
  };
  
  const byRegime: Record<string, number> = {};
  let totalImpact = 0;
  let highImpactCount = 0;
  
  for (const adj of adjustments) {
    byCategory[adj.category] = (byCategory[adj.category] || 0) + 1;
    
    if (adj.regime) {
      byRegime[adj.regime] = (byRegime[adj.regime] || 0) + 1;
    }
    
    totalImpact += adj.impact;
    
    if (adj.impact > 0.1) {
      highImpactCount++;
    }
  }
  
  return {
    totalAdjustments: adjustments.length,
    byCategory,
    byRegime,
    avgImpact: adjustments.length > 0 ? totalImpact / adjustments.length : 0,
    highImpactCount,
    lastAdjustment: adjustments.length > 0 ? adjustments[0].timestamp : null
  };
}

/**
 * Gets the current adaptive parameter values from the most recent adjustments.
 * 
 * @returns Current values for key parameters
 */
export function getCurrentAdaptiveValues(): {
  dynamicROI: number | null;
  confidence: number | null;
  weights: Record<string, number>;
  lastUpdated: string | null;
} {
  const recentAdjustments = getAdjustments({ limit: 50 });
  
  const latestByParam: Record<string, PredictiveAdjustmentEntry> = {};
  
  for (const adj of recentAdjustments) {
    const key = `${adj.category}:${adj.parameter}`;
    if (!latestByParam[key]) {
      latestByParam[key] = adj;
    }
  }
  
  let dynamicROI: number | null = null;
  let confidence: number | null = null;
  const weights: Record<string, number> = {};
  let lastUpdated: string | null = null;
  
  for (const adj of Object.values(latestByParam)) {
    if (!lastUpdated || adj.timestamp > lastUpdated) {
      lastUpdated = adj.timestamp;
    }
    
    if (adj.category === 'ROI') {
      dynamicROI = adj.newValue;
    } else if (adj.category === 'Confidence') {
      confidence = adj.newValue;
    } else if (adj.category === 'Weight') {
      weights[adj.parameter] = adj.newValue;
    }
  }
  
  return { dynamicROI, confidence, weights, lastUpdated };
}
