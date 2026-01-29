/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7Q — Adjustment Stability & Frequency Visibility Service
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides read-only instrumentation showing adjustment frequency and stability.
 * 
 * OBSERVABILITY ONLY — No learning logic modifications permitted.
 * 
 * Schema Version: learning-stability/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { getAdjustments, PredictiveAdjustmentEntry } from '../logging/predictive-adjustments';

export const STABILITY_SCHEMA = 'learning-stability/v1.0';

/**
 * Parameter touch history
 */
export interface ParameterTouchHistory {
  parameter: string;
  lastAdjusted: string;
  adjustmentCount24h: number;
  adjustmentCount7d: number;
  consecutiveAdjustments: number;
  totalDelta24h: number;
  direction: 'increasing' | 'decreasing' | 'oscillating' | 'stable';
  withinCooldown: boolean;
  cooldownRemainingMs?: number;
}

/**
 * Adjustment frequency metrics
 */
export interface AdjustmentFrequencyMetrics {
  adjustmentsPerHour: number;
  adjustmentsPerDay: number;
  burstyPeriods: BurstyPeriod[];
  parameterTouchHistory: ParameterTouchHistory[];
  stabilityScore: number;
}

/**
 * Bursty adjustment period
 */
export interface BurstyPeriod {
  startTime: string;
  endTime: string;
  adjustmentCount: number;
  parameters: string[];
}

/**
 * Post-adjustment outcome context (lagged)
 */
export interface LaggedOutcomeContext {
  parameter: string;
  adjustmentTime: string;
  adjustmentDelta: number;
  outcomeWindow: string;
  tradesAfter: number;
  avgPnL: number;
  winRate: number;
  expectancy: number;
  disclaimer: string;
}

/**
 * Safety signal flags
 */
export interface SafetySignal {
  type: 'rapid_adjustment' | 'regime_instability' | 'poor_performance' | 'oscillation';
  severity: 'info' | 'warning' | 'alert';
  parameter: string;
  description: string;
  timestamp: string;
  isAdvisoryOnly: true;
}

const COOLDOWN_PERIOD_MS = 60 * 60 * 1000;
const BURST_THRESHOLD = 3;
const BURST_WINDOW_MS = 60 * 60 * 1000;

/**
 * Calculates the direction of adjustments for a parameter
 */
function calculateDirection(adjustments: PredictiveAdjustmentEntry[]): 'increasing' | 'decreasing' | 'oscillating' | 'stable' {
  if (adjustments.length < 2) return 'stable';
  
  const deltas = adjustments.map(a => a.delta);
  const positiveCount = deltas.filter(d => d > 0).length;
  const negativeCount = deltas.filter(d => d < 0).length;
  
  if (positiveCount === deltas.length) return 'increasing';
  if (negativeCount === deltas.length) return 'decreasing';
  if (positiveCount > 0 && negativeCount > 0) return 'oscillating';
  return 'stable';
}

/**
 * Detects bursty adjustment periods
 */
function detectBurstyPeriods(adjustments: PredictiveAdjustmentEntry[]): BurstyPeriod[] {
  const periods: BurstyPeriod[] = [];
  const sorted = [...adjustments].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  let currentBurst: PredictiveAdjustmentEntry[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    
    if (currentBurst.length === 0) {
      currentBurst.push(current);
      continue;
    }
    
    const lastInBurst = currentBurst[currentBurst.length - 1];
    const timeDiff = new Date(current.timestamp).getTime() - new Date(lastInBurst.timestamp).getTime();
    
    if (timeDiff <= BURST_WINDOW_MS) {
      currentBurst.push(current);
    } else {
      if (currentBurst.length >= BURST_THRESHOLD) {
        periods.push({
          startTime: currentBurst[0].timestamp,
          endTime: currentBurst[currentBurst.length - 1].timestamp,
          adjustmentCount: currentBurst.length,
          parameters: [...new Set(currentBurst.map(a => a.parameter))]
        });
      }
      currentBurst = [current];
    }
  }
  
  if (currentBurst.length >= BURST_THRESHOLD) {
    periods.push({
      startTime: currentBurst[0].timestamp,
      endTime: currentBurst[currentBurst.length - 1].timestamp,
      adjustmentCount: currentBurst.length,
      parameters: [...new Set(currentBurst.map(a => a.parameter))]
    });
  }
  
  return periods;
}

/**
 * Gets adjustment frequency and stability metrics
 */
export function getAdjustmentFrequencyMetrics(): AdjustmentFrequencyMetrics {
  const now = Date.now();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  const adjustments24h = getAdjustments({ from: oneDayAgo, limit: 10000 });
  const adjustments7d = getAdjustments({ from: sevenDaysAgo, limit: 10000 });
  
  const nonLifecycle24h = adjustments24h.filter(a => a.adjustmentType !== 'lifecycle');
  const nonLifecycle7d = adjustments7d.filter(a => a.adjustmentType !== 'lifecycle');
  
  const parameterGroups: Map<string, PredictiveAdjustmentEntry[]> = new Map();
  for (const adj of nonLifecycle7d) {
    const existing = parameterGroups.get(adj.parameter) || [];
    existing.push(adj);
    parameterGroups.set(adj.parameter, existing);
  }
  
  const parameterTouchHistory: ParameterTouchHistory[] = [];
  
  for (const [param, adjs] of parameterGroups) {
    const sorted = adjs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    const lastAdjusted = sorted[0]?.timestamp || '';
    const lastAdjustedTime = new Date(lastAdjusted).getTime();
    
    const count24h = sorted.filter(a => 
      new Date(a.timestamp).getTime() > now - 24 * 60 * 60 * 1000
    ).length;
    
    let consecutiveCount = 1;
    for (let i = 1; i < sorted.length; i++) {
      const timeDiff = new Date(sorted[i-1].timestamp).getTime() - new Date(sorted[i].timestamp).getTime();
      if (timeDiff <= COOLDOWN_PERIOD_MS) {
        consecutiveCount++;
      } else {
        break;
      }
    }
    
    const delta24h = sorted
      .filter(a => new Date(a.timestamp).getTime() > now - 24 * 60 * 60 * 1000)
      .reduce((sum, a) => sum + a.delta, 0);
    
    const withinCooldown = (now - lastAdjustedTime) < COOLDOWN_PERIOD_MS;
    const cooldownRemainingMs = withinCooldown ? COOLDOWN_PERIOD_MS - (now - lastAdjustedTime) : undefined;
    
    parameterTouchHistory.push({
      parameter: param,
      lastAdjusted,
      adjustmentCount24h: count24h,
      adjustmentCount7d: sorted.length,
      consecutiveAdjustments: consecutiveCount,
      totalDelta24h: parseFloat(delta24h.toFixed(6)),
      direction: calculateDirection(sorted.slice(0, 10)),
      withinCooldown,
      cooldownRemainingMs
    });
  }
  
  const hoursInPeriod = 24;
  const daysInPeriod = 7;
  
  const adjustmentsPerHour = nonLifecycle24h.length / hoursInPeriod;
  const adjustmentsPerDay = nonLifecycle7d.length / daysInPeriod;
  
  const burstyPeriods = detectBurstyPeriods(nonLifecycle7d);
  
  const oscillatingParams = parameterTouchHistory.filter(p => p.direction === 'oscillating').length;
  const totalParams = parameterTouchHistory.length || 1;
  const stabilityScore = Math.max(0, 100 - (oscillatingParams / totalParams) * 50 - (burstyPeriods.length * 10));
  
  return {
    adjustmentsPerHour: parseFloat(adjustmentsPerHour.toFixed(2)),
    adjustmentsPerDay: parseFloat(adjustmentsPerDay.toFixed(2)),
    burstyPeriods,
    parameterTouchHistory: parameterTouchHistory.sort((a, b) => 
      new Date(b.lastAdjusted).getTime() - new Date(a.lastAdjusted).getTime()
    ),
    stabilityScore: parseFloat(stabilityScore.toFixed(1))
  };
}

/**
 * Generates safety signals (advisory only)
 */
export function generateSafetySignals(): SafetySignal[] {
  const signals: SafetySignal[] = [];
  const metrics = getAdjustmentFrequencyMetrics();
  
  for (const param of metrics.parameterTouchHistory) {
    if (param.consecutiveAdjustments >= 3) {
      signals.push({
        type: 'rapid_adjustment',
        severity: param.consecutiveAdjustments >= 5 ? 'alert' : 'warning',
        parameter: param.parameter,
        description: `${param.consecutiveAdjustments} consecutive adjustments within cooldown window`,
        timestamp: param.lastAdjusted,
        isAdvisoryOnly: true
      });
    }
    
    if (param.direction === 'oscillating' && param.adjustmentCount24h >= 2) {
      signals.push({
        type: 'oscillation',
        severity: 'warning',
        parameter: param.parameter,
        description: `Parameter showing oscillating behavior (${param.adjustmentCount24h} changes in 24h)`,
        timestamp: param.lastAdjusted,
        isAdvisoryOnly: true
      });
    }
  }
  
  for (const burst of metrics.burstyPeriods) {
    if (burst.adjustmentCount >= 5) {
      signals.push({
        type: 'rapid_adjustment',
        severity: 'info',
        parameter: burst.parameters.join(', '),
        description: `Burst of ${burst.adjustmentCount} adjustments detected`,
        timestamp: burst.endTime,
        isAdvisoryOnly: true
      });
    }
  }
  
  return signals.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

console.log('[11.7Q] Adjustment Stability Service loaded (schema: learning-stability/v1.0)');
