/**
 * Adjustment Registry — Directive 11.8B-E (Batch 58b)
 *
 * Parameter definitions, bounds, and validation for all Tier 1 and Tier 2
 * adjustable parameters. This is the code-level enforcement of the
 * Adjustment Framework (ADJUSTMENT_FRAMEWORK.md).
 *
 * Design principles:
 * - Structural validation + bounds sanity only (not behavior reinterpretation)
 * - Log-only mode first (warn but don't block)
 * - Does not migrate strategy constants from code to DB
 * - Evidence-source agnostic — framework validates bounds, not evidence
 */

// --- Governance Tiers ---

export type GovernanceTier = 'tier1' | 'tier2' | 'tier3';

export interface ParameterSpec {
  name: string;
  tier: GovernanceTier;
  currentValue: number | string | boolean;
  bounds?: { min: number; max: number };
  stepSize?: number;        // Maximum single-change magnitude
  cadenceDays?: number;     // Minimum days between adjustments
  source: string;           // File or DB table where the value lives
  category: string;         // Grouping (filter, strategy, scoring, etc.)
  description: string;
}

// --- Validation Mode ---

let validationMode: 'log-only' | 'enforce' = 'log-only';

export function setValidationMode(mode: 'log-only' | 'enforce'): void {
  console.log(`[AdjustmentRegistry] Validation mode set to: ${mode}`);
  validationMode = mode;
}

export function getValidationMode(): 'log-only' | 'enforce' {
  return validationMode;
}

// --- Filter Threshold Bounds ---

export const FILTER_BOUNDS: Record<string, { min: number; max: number; stepSize: number; cadenceDays: number }> = {
  // Differentiating columns — per-path bounds
  vn_max: { min: 0.70, max: 0.99, stepSize: 0.02, cadenceDays: 7 },
  di_min: { min: 0, max: 40, stepSize: 3, cadenceDays: 7 },
  di_max: { min: 20, max: 100, stepSize: 5, cadenceDays: 7 },
  min_volume: { min: 50000, max: 1000000, stepSize: 50000, cadenceDays: 7 },
  volume_24h_min: { min: 0, max: 200000, stepSize: 10000, cadenceDays: 7 },

  // Uniform columns — wider bounds since they apply globally
  lq_min: { min: 30, max: 55, stepSize: 3, cadenceDays: 14 },
  corr_max: { min: 0.70, max: 0.98, stepSize: 0.02, cadenceDays: 14 },
  min_price: { min: 0.001, max: 1.0, stepSize: 0.01, cadenceDays: 30 },
  final_score_min: { min: 0.25, max: 0.60, stepSize: 0.03, cadenceDays: 14 },
  regime_weight_min: { min: 0.15, max: 0.50, stepSize: 0.05, cadenceDays: 30 },

  // RSI — locked (Tier 3) but still validated for sanity
  rsi_min: { min: 15, max: 40, stepSize: 5, cadenceDays: 90 },
  rsi_max: { min: 60, max: 85, stepSize: 5, cadenceDays: 90 },

  // Volatility — adjustable but rarely
  volatility_min: { min: 0.10, max: 1.00, stepSize: 0.10, cadenceDays: 30 },
  volatility_max: { min: 3.00, max: 10.00, stepSize: 0.50, cadenceDays: 30 },

  // Spread
  max_bid_ask_spread: { min: 0.25, max: 3.00, stepSize: 0.25, cadenceDays: 14 },
};

// --- Validation Results ---

export interface ValidationResult {
  valid: boolean;
  parameter: string;
  currentValue: number;
  proposedValue: number;
  bounds: { min: number; max: number };
  violation?: string;
}

/**
 * Validate a proposed filter threshold change against registry bounds.
 * In log-only mode, logs warnings but returns valid=true.
 * In enforce mode, returns valid=false for out-of-bounds changes.
 */
export function validateFilterChange(
  paramName: string,
  currentValue: number,
  proposedValue: number,
  filterPath?: string
): ValidationResult {
  const bounds = FILTER_BOUNDS[paramName];

  if (!bounds) {
    // Unknown parameter — log but don't block
    console.warn(`[AdjustmentRegistry] Unknown filter parameter: ${paramName}. No bounds defined.`);
    return { valid: true, parameter: paramName, currentValue, proposedValue, bounds: { min: -Infinity, max: Infinity } };
  }

  const result: ValidationResult = {
    valid: true,
    parameter: paramName,
    currentValue,
    proposedValue,
    bounds: { min: bounds.min, max: bounds.max },
  };

  // Check bounds
  if (proposedValue < bounds.min || proposedValue > bounds.max) {
    result.violation = `Out of bounds: ${proposedValue} not in [${bounds.min}, ${bounds.max}]`;
    if (validationMode === 'enforce') {
      result.valid = false;
    } else {
      console.warn(`[AdjustmentRegistry] WARN (log-only): ${paramName} = ${proposedValue} out of bounds [${bounds.min}, ${bounds.max}] for path ${filterPath || 'unknown'}`);
    }
  }

  // Check step size
  const stepMagnitude = Math.abs(proposedValue - currentValue);
  if (stepMagnitude > bounds.stepSize * 1.01) { // 1% tolerance for float precision
    const stepViolation = `Step size exceeded: change of ${stepMagnitude.toFixed(4)} exceeds max step ${bounds.stepSize}`;
    if (result.violation) {
      result.violation += '; ' + stepViolation;
    } else {
      result.violation = stepViolation;
    }
    if (validationMode === 'enforce') {
      result.valid = false;
    } else {
      console.warn(`[AdjustmentRegistry] WARN (log-only): ${paramName} step ${stepMagnitude.toFixed(4)} > max ${bounds.stepSize} for path ${filterPath || 'unknown'}`);
    }
  }

  return result;
}

/**
 * Validate a batch of filter changes (e.g., from PUT /api/filters-v2).
 * Returns all validation results and an overall pass/fail.
 */
export function validateFilterBatch(
  changes: Array<{ paramName: string; currentValue: number; proposedValue: number }>,
  filterPath?: string
): { allValid: boolean; results: ValidationResult[] } {
  const results = changes.map(c =>
    validateFilterChange(c.paramName, c.currentValue, c.proposedValue, filterPath)
  );
  return {
    allValid: results.every(r => r.valid),
    results,
  };
}

/**
 * Log an adjustment event for audit trail.
 * Called after a validated change is applied.
 */
export function logAdjustmentEvent(event: {
  parameter: string;
  filterPath?: string;
  oldValue: number | string;
  newValue: number | string;
  mode: 'vts' | 'paper' | 'live';
  approver: 'autonomous' | 'langston' | 'kyle' | 'system';
  evidenceRef?: string;
  baselineVersion?: string;
}): void {
  const timestamp = new Date().toISOString();
  console.log(
    `[AdjustmentAudit] ${timestamp} | ${event.parameter} | ` +
    `${event.filterPath || 'global'} | ${event.oldValue} → ${event.newValue} | ` +
    `mode=${event.mode} | approver=${event.approver} | ` +
    `evidence=${event.evidenceRef || 'none'} | baseline=${event.baselineVersion || 'v1.0'}`
  );
}

// --- Startup Validation ---

/**
 * Validate all critical config on startup.
 * Checks that loaded values are within expected bounds.
 * Log-only — never blocks startup.
 */
export function validateStartupConfig(config: {
  scoreWeights?: { HYBRID: number; CONFIDENCE: number; REGIME: number; DECAY: number };
  executionConfig?: Record<string, number | string | boolean>;
}): { warnings: string[] } {
  const warnings: string[] = [];

  // Validate score weights sum to ~1.0
  if (config.scoreWeights) {
    const sum = config.scoreWeights.HYBRID + config.scoreWeights.CONFIDENCE +
                config.scoreWeights.REGIME + config.scoreWeights.DECAY;
    if (Math.abs(sum - 1.0) > 0.01) {
      warnings.push(`Score weights sum to ${sum.toFixed(3)}, expected ~1.0`);
    }
  }

  // Validate execution config frozen values haven't been tampered with
  if (config.executionConfig) {
    const expectedVersion = 'v1.0.0';
    if (config.executionConfig.VERSION !== expectedVersion) {
      warnings.push(`ExecutionConfig version mismatch: ${config.executionConfig.VERSION} vs expected ${expectedVersion}`);
    }
    if (typeof config.executionConfig.MAX_POSITION_RISK === 'number' &&
        (config.executionConfig.MAX_POSITION_RISK < 0.005 || config.executionConfig.MAX_POSITION_RISK > 0.05)) {
      warnings.push(`ExecutionConfig MAX_POSITION_RISK ${config.executionConfig.MAX_POSITION_RISK} outside sanity bounds [0.005, 0.05]`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`[AdjustmentRegistry] Startup validation warnings (${warnings.length}):`);
    warnings.forEach(w => console.warn(`  - ${w}`));
  } else {
    console.log('[AdjustmentRegistry] Startup validation: all checks passed');
  }

  return { warnings };
}
