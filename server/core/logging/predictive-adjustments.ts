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

export const PREDICTIVE_ADJUSTMENTS_SCHEMA = "predictive-adjustments/v1.1";

export type AdjustmentCategory =
  | "ROI"
  | "Expectancy"
  | "Confidence"
  | "Weight"
  | "Scoring"
  | "Other";

/**
 * Directive 11.7I.a Task I.a-01: Adjustment Type Classification
 * Distinguishes lifecycle events from actual tuning actions
 */
export type AdjustmentType =
  | "lifecycle"          // Init/run markers, scheduler events
  | "model_calibration"  // ML model recalibration
  | "weight_adjustment"  // Signal weight updates
  | "risk_adjustment"    // Risk parameter changes
  | "filter_adjustment"; // Filter threshold changes

/**
 * Directive 11.7I.a Task I.a-01: Reversibility indicator
 */
export type Reversibility = "automatic" | "manual" | "irreversible";

export interface PredictiveAdjustmentEntry {
  _schema: string;
  timestamp: string;
  category: AdjustmentCategory;
  adjustmentType: AdjustmentType;  // Directive 11.7I.a: Type classification
  parameter: string;
  oldValue: number;
  newValue: number;
  delta: number;
  impact: number | null;           // Directive 11.7I.a: Null for lifecycle events
  regime?: string;
  strategy?: string;
  reason: string;
  affectedSubsystem?: string;      // Directive 11.7I.a: Which subsystem is affected
  expectedEffect?: string;          // Directive 11.7I.a: Expected behavior change
  reversibility?: Reversibility;    // Directive 11.7I.a: How to reverse if needed
}

export interface AdjustmentInput {
  category: AdjustmentCategory;
  adjustmentType?: AdjustmentType;  // Directive 11.7I.a: Optional, defaults to inferred type
  parameter: string;
  oldValue: number;
  newValue: number;
  regime?: string;
  strategy?: string;
  reason: string;
  affectedSubsystem?: string;       // Directive 11.7I.a: Optional subsystem context
  expectedEffect?: string;           // Directive 11.7I.a: Optional effect description
  reversibility?: Reversibility;     // Directive 11.7I.a: Optional reversibility info
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
 * Directive 11.7I.a: Infers adjustment type from category, parameter, and reason
 */
function inferAdjustmentType(entry: AdjustmentInput): AdjustmentType {
  const paramLower = entry.parameter.toLowerCase();
  const reasonLower = entry.reason.toLowerCase();
  
  if (reasonLower.includes('init') || 
      reasonLower.includes('startup') || 
      reasonLower.includes('scheduler') ||
      reasonLower.includes('activated') ||
      paramLower.includes('scheduler') ||
      paramLower.includes('init')) {
    return 'lifecycle';
  }
  
  if (entry.category === 'Weight' || paramLower.includes('weight')) {
    return 'weight_adjustment';
  }
  
  if (entry.category === 'Confidence' || 
      entry.category === 'ROI' ||
      paramLower.includes('threshold') ||
      paramLower.includes('risk')) {
    return 'risk_adjustment';
  }
  
  if (paramLower.includes('filter') || paramLower.includes('gate')) {
    return 'filter_adjustment';
  }
  
  if (paramLower.includes('calibrat') || reasonLower.includes('calibrat')) {
    return 'model_calibration';
  }
  
  return 'weight_adjustment';
}

/**
 * Directive 11.7I.a: Determines if the adjustment has numeric impact
 */
function isLifecycleEvent(entry: AdjustmentInput): boolean {
  const reasonLower = entry.reason.toLowerCase();
  const paramLower = entry.parameter.toLowerCase();
  
  return (
    reasonLower.includes('init') ||
    reasonLower.includes('startup') ||
    reasonLower.includes('scheduler') ||
    reasonLower.includes('activated') ||
    reasonLower.includes('enabled') ||
    reasonLower.includes('disabled') ||
    paramLower.includes('scheduler') ||
    (entry.oldValue === 0 && entry.newValue === 1) ||
    (entry.oldValue === 1 && entry.newValue === 0)
  );
}

/**
 * Directive 11.7I.a: Infers reversibility based on adjustment type
 */
function inferReversibility(adjustmentType: AdjustmentType): Reversibility {
  switch (adjustmentType) {
    case 'lifecycle':
      return 'automatic';
    case 'model_calibration':
      return 'automatic';
    case 'weight_adjustment':
      return 'automatic';
    case 'risk_adjustment':
      return 'manual';
    case 'filter_adjustment':
      return 'manual';
    default:
      return 'automatic';
  }
}

/**
 * Logs a predictive adjustment with impact scoring and schema versioning.
 * 
 * Directive 11.7I.a: Enhanced with adjustmentType, suppressed impact for lifecycle,
 * and enriched explanation fields.
 * 
 * @param entry - The adjustment details to log
 * @returns The complete record that was logged
 */
export function logPredictiveAdjustment(entry: AdjustmentInput): PredictiveAdjustmentEntry {
  ensureDirectories();
  
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(ADJUSTMENTS_DIR, `${date}.json`);

  const adjustmentType = entry.adjustmentType || inferAdjustmentType(entry);
  const isLifecycle = isLifecycleEvent(entry);
  
  const impact = isLifecycle 
    ? null 
    : +(Math.abs(entry.newValue - entry.oldValue) / Math.max(Math.abs(entry.oldValue), 0.001)).toFixed(3);

  const record: PredictiveAdjustmentEntry = {
    _schema: PREDICTIVE_ADJUSTMENTS_SCHEMA,
    timestamp: new Date().toISOString(),
    category: entry.category,
    adjustmentType,
    parameter: entry.parameter,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    delta: +(entry.newValue - entry.oldValue).toFixed(4),
    impact,
    regime: entry.regime,
    strategy: entry.strategy,
    reason: entry.reason,
    affectedSubsystem: entry.affectedSubsystem,
    expectedEffect: entry.expectedEffect,
    reversibility: entry.reversibility || inferReversibility(adjustmentType)
  };

  safeAppendJSON(file, record as unknown as Record<string, unknown>);

  const impactStr = impact !== null ? ` impact=${impact.toFixed(3)}` : ' [lifecycle]';
  const systemLogEntry = `[11.7D.1][Adjustment] ${entry.category}:${entry.parameter} ${entry.oldValue}→${entry.newValue}${impactStr} (${entry.reason})\n`;
  try {
    fs.appendFileSync(SYSTEM_EVENTS_LOG, `${new Date().toISOString()} ${systemLogEntry}`);
  } catch (err) {
    console.warn(`[11.7D.1] Failed to append to system events log: ${err}`);
  }

  const impactLog = impact !== null ? `impact=${impact.toFixed(3)}` : '[lifecycle event]';
  console.log(`[11.7D.1][Adjustment] ${entry.category}:${entry.parameter} ${entry.oldValue.toFixed(4)}→${entry.newValue.toFixed(4)} ${impactLog} (${entry.reason})`);

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
    
    const impactValue = adj.impact ?? 0;
    totalImpact += impactValue;
    
    if (impactValue > 0.1) {
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
