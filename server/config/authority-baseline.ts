/**
 * Authority Baseline Loader — Directive 11.8C (Batch 58b)
 *
 * Loads the V1.0 authority baseline from authority-baseline-v1.json
 * and provides comparison utilities for detecting drift from baseline.
 *
 * The baseline is the "known-good" rollback target. This module:
 * - Loads the baseline JSON at startup
 * - Provides getBaselineValue() for any parameter
 * - Provides compareToBaseline() for drift detection
 * - Does NOT modify any values — read-only
 */

import * as fs from 'fs';
import * as path from 'path';

// --- Types ---

interface BaselineFilterRow {
  vn_max: number;
  di_min: number;
  di_max: number;
  min_volume: number;
  volume_24h_min: number | null;
}

interface BaselineUniformFilters {
  lq_min: number;
  corr_max: number;
  min_price: number;
  min_liquidity: number;
  min_market_cap: number;
  rsi_min: number;
  rsi_max: number;
  volatility_min: number;
  volatility_max: number;
  max_bid_ask_spread: number;
  final_score_min: number;
  regime_weight_min: number;
  min_history_days: number;
  universe_size: number;
  confidence_threshold: number;
}

interface BaselineStrategy {
  file: string;
  family: string;
  familyNote?: string;
  volumeGate: string;
  volumeGateDetail?: string;
  regimeGated?: string;
  params: Record<string, number | string | boolean>;
}

interface AuthorityBaseline {
  version: string;
  snapshotDate: string;
  lastCommit: string;
  batch: string;
  phase: string;
  db_thresholds: {
    screener_filters: {
      uniform: BaselineUniformFilters;
      differentiating: Record<string, BaselineFilterRow>;
    };
  };
  strategy_constants: Record<string, BaselineStrategy>;
  shared_config: Record<string, any>;
}

// --- Singleton Baseline ---

let baseline: AuthorityBaseline | null = null;
let loadError: string | null = null;

/**
 * Load the authority baseline from the JSON file.
 * Called once at startup. Safe to call multiple times (idempotent).
 */
export function loadBaseline(): { loaded: boolean; version?: string; error?: string } {
  if (baseline) {
    return { loaded: true, version: baseline.version };
  }

  // Try multiple paths — repo root (dev) and dist-relative (production)
  const candidates = [
    path.resolve(__dirname, '../../1-system-manual/authority-baseline-v1.json'),
    path.resolve(__dirname, '../1-system-manual/authority-baseline-v1.json'),
    path.resolve(process.cwd(), '1-system-manual/authority-baseline-v1.json'),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        baseline = JSON.parse(raw) as AuthorityBaseline;
        console.log(`[AuthorityBaseline] Loaded v${baseline.version} from ${filePath} (snapshot: ${baseline.snapshotDate}, commit: ${baseline.lastCommit})`);
        return { loaded: true, version: baseline.version };
      }
    } catch (err) {
      loadError = `Failed to load baseline from ${filePath}: ${err}`;
    }
  }

  loadError = `Authority baseline not found in any candidate path`;
  console.warn(`[AuthorityBaseline] ${loadError}. System will operate without baseline comparison.`);
  return { loaded: false, error: loadError };
}

/**
 * Get the loaded baseline, or null if not loaded.
 */
export function getBaseline(): AuthorityBaseline | null {
  return baseline;
}

/**
 * Get a specific filter threshold from the baseline.
 */
export function getBaselineFilterValue(filterPath: string, column: string): number | null {
  if (!baseline) return null;

  // Check differentiating first
  const diffRow = baseline.db_thresholds.screener_filters.differentiating[filterPath];
  if (diffRow && column in diffRow) {
    return (diffRow as any)[column] ?? null;
  }

  // Fall back to uniform
  const uniform = baseline.db_thresholds.screener_filters.uniform;
  if (column in uniform) {
    return (uniform as any)[column];
  }

  return null;
}

/**
 * Get a strategy parameter from the baseline.
 */
export function getBaselineStrategyParam(strategyName: string, paramName: string): number | string | boolean | null {
  if (!baseline) return null;

  const strategy = baseline.strategy_constants[strategyName];
  if (!strategy) return null;

  return strategy.params[paramName] ?? null;
}

/**
 * Get a shared config value from the baseline.
 */
export function getBaselineSharedConfig(section: string, key: string): any {
  if (!baseline) return null;

  const sectionData = baseline.shared_config[section];
  if (!sectionData) return null;

  return sectionData[key] ?? null;
}

// --- Drift Detection ---

export interface DriftResult {
  parameter: string;
  scope: string;
  baselineValue: number;
  currentValue: number;
  drift: number;       // Absolute difference
  driftPct: number;    // Percentage change from baseline
}

/**
 * Compare current filter values against baseline and return any drift.
 * Useful for periodic health checks.
 */
export function compareFiltersToBaseline(
  filterPath: string,
  currentValues: Record<string, number>
): DriftResult[] {
  const drifts: DriftResult[] = [];
  if (!baseline) return drifts;

  for (const [column, currentValue] of Object.entries(currentValues)) {
    const baselineValue = getBaselineFilterValue(filterPath, column);
    if (baselineValue === null || baselineValue === undefined) continue;

    const drift = Math.abs(currentValue - baselineValue);
    if (drift > 0.0001) { // Non-zero drift (float tolerance)
      const driftPct = baselineValue !== 0 ? (drift / Math.abs(baselineValue)) * 100 : 0;
      drifts.push({
        parameter: column,
        scope: filterPath,
        baselineValue,
        currentValue,
        drift,
        driftPct,
      });
    }
  }

  return drifts;
}

/**
 * Get baseline version info for audit trail.
 */
export function getBaselineVersion(): string {
  return baseline?.version || 'unknown';
}
