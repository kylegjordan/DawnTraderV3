/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3C — Cost Drift Monitor
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Detects anomalies in cost metrics to alert the architect and protect trading logic.
 * - Compares current snapshot to 1-hour moving average
 * - Triggers drift alerts when metrics change by > 50%
 * - Exposes alerts via /api/diagnostics/alerts
 * 
 * Governance Invariants:
 * - M7: Drift Awareness — Detect and flag large cost changes
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { getCostHistory, type CostSnapshot } from '../../core/telemetry/cost-telemetry.js';
// P19-B7.2a (#330): stats via the fee-bearing wrapper — avgFee now composes
// from the B-4.5 merge site, so this monitor's fee-delta fires ONLY on a real
// fee_model change (never a cache clamp/TTL artifact). Strictly more truthful.
import { computeTotalRoundTripCost, getCostCacheStatsWithFee } from '../../core/math/cost-model.js';

const DRIFT_THRESHOLD = 0.50;
const MAX_ALERTS = 100;
const BASELINE_WINDOW_HOURS = 1;

export interface DriftAlert {
  type: 'COST_DRIFT_ALERT';
  severity: 'yellow' | 'red';
  metric: 'fee' | 'slippage' | 'spread' | 'totalCost';
  baseline: number;
  current: number;
  delta: number;
  timestamp: Date;
}

const recentAlerts: DriftAlert[] = [];
let lastDriftCheckTime = 0;
let driftMonitorInterval: NodeJS.Timeout | null = null;

function computeDelta(current: number, baseline: number): number {
  if (baseline === 0) return current > 0 ? 1 : 0;
  return Math.abs(current - baseline) / baseline;
}

function getSeverity(delta: number): 'yellow' | 'red' {
  return delta > 1.0 ? 'red' : 'yellow';
}

export async function computeBaselineFromHistory(): Promise<CostSnapshot | null> {
  try {
    const history = await getCostHistory(BASELINE_WINDOW_HOURS);
    
    if (history.length === 0) return null;
    
    const avgFee = history.reduce((sum, s) => sum + s.avgFee, 0) / history.length;
    const avgSlippage = history.reduce((sum, s) => sum + s.avgSlippage, 0) / history.length;
    const avgSpread = history.reduce((sum, s) => sum + s.avgSpread, 0) / history.length;
    const totalCost = computeTotalRoundTripCost(avgFee, avgSlippage, avgSpread);
    
    return {
      avgFee,
      avgSlippage,
      avgSpread,
      totalCost,
      symbolCount: Math.round(history.reduce((sum, s) => sum + s.symbolCount, 0) / history.length),
      timestamp: new Date(),
    };
  } catch (error: any) {
    console.error('[11.3C][CostDrift] Baseline computation failed:', error.message);
    return null;
  }
}

function emitAlert(alert: DriftAlert): void {
  recentAlerts.unshift(alert);
  
  if (recentAlerts.length > MAX_ALERTS) {
    recentAlerts.length = MAX_ALERTS;
  }
  
  console.warn(
    `[CostDrift] ${alert.severity.toUpperCase()}: ${alert.metric} drifted >${(alert.delta * 100).toFixed(0)}% ` +
    `(${(alert.baseline * 100).toFixed(3)}% → ${(alert.current * 100).toFixed(3)}%)`
  );
}

export async function checkForDrift(): Promise<DriftAlert[]> {
  const now = Date.now();
  lastDriftCheckTime = now;
  
  const baseline = await computeBaselineFromHistory();
  if (!baseline) {
    return [];
  }
  
  const current = getCostCacheStatsWithFee();
  if (current.symbolCount === 0) {
    return [];
  }
  
  const currentTotalCost = computeTotalRoundTripCost(current.avgFee, current.avgSlippage, current.avgSpread);
  
  const alerts: DriftAlert[] = [];
  
  const feeD = computeDelta(current.avgFee, baseline.avgFee);
  if (feeD > DRIFT_THRESHOLD) {
    const alert: DriftAlert = {
      type: 'COST_DRIFT_ALERT',
      severity: getSeverity(feeD),
      metric: 'fee',
      baseline: baseline.avgFee,
      current: current.avgFee,
      delta: feeD,
      timestamp: new Date(),
    };
    alerts.push(alert);
    emitAlert(alert);
  }
  
  const slippageD = computeDelta(current.avgSlippage, baseline.avgSlippage);
  if (slippageD > DRIFT_THRESHOLD) {
    const alert: DriftAlert = {
      type: 'COST_DRIFT_ALERT',
      severity: getSeverity(slippageD),
      metric: 'slippage',
      baseline: baseline.avgSlippage,
      current: current.avgSlippage,
      delta: slippageD,
      timestamp: new Date(),
    };
    alerts.push(alert);
    emitAlert(alert);
  }
  
  const spreadD = computeDelta(current.avgSpread, baseline.avgSpread);
  if (spreadD > DRIFT_THRESHOLD) {
    const alert: DriftAlert = {
      type: 'COST_DRIFT_ALERT',
      severity: getSeverity(spreadD),
      metric: 'spread',
      baseline: baseline.avgSpread,
      current: current.avgSpread,
      delta: spreadD,
      timestamp: new Date(),
    };
    alerts.push(alert);
    emitAlert(alert);
  }
  
  const totalD = computeDelta(currentTotalCost, baseline.totalCost);
  if (totalD > DRIFT_THRESHOLD) {
    const alert: DriftAlert = {
      type: 'COST_DRIFT_ALERT',
      severity: getSeverity(totalD),
      metric: 'totalCost',
      baseline: baseline.totalCost,
      current: currentTotalCost,
      delta: totalD,
      timestamp: new Date(),
    };
    alerts.push(alert);
    emitAlert(alert);
  }
  
  return alerts;
}

export function getRecentAlerts(limit: number = 20): DriftAlert[] {
  return recentAlerts.slice(0, limit);
}

export function getRecentCostDrift(): number {
  if (recentAlerts.length === 0) return 0;
  
  const now = Date.now();
  const recentWindow = 15 * 60 * 1000;
  
  const recent = recentAlerts.filter(
    a => now - a.timestamp.getTime() < recentWindow
  );
  
  if (recent.length === 0) return 0;
  
  const maxDelta = Math.max(...recent.map(a => a.delta));
  return Math.min(1.0, maxDelta);
}

export function clearAlerts(): void {
  recentAlerts.length = 0;
  console.log('[11.3C][CostDrift] Alerts cleared');
}

export function startDriftMonitor(): void {
  if (driftMonitorInterval) {
    console.log('[11.3C][CostDrift] Monitor already running');
    return;
  }
  
  driftMonitorInterval = setInterval(async () => {
    await checkForDrift();
  }, 60_000);
  
  console.log('[11.3C][CostDrift] Started drift monitor (60s interval)');
}

export function stopDriftMonitor(): void {
  if (driftMonitorInterval) {
    clearInterval(driftMonitorInterval);
    driftMonitorInterval = null;
    console.log('[11.3C][CostDrift] Stopped drift monitor');
  }
}

export { DRIFT_THRESHOLD, BASELINE_WINDOW_HOURS };
