/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.5 — Macro-State Condition Module
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Determines global macro market conditions based on aggregate metrics.
 * Used to dynamically adjust secondary metric thresholds.
 * 
 * Conditions:
 * - VOLATILITY_EXPANSION: High volatility across market (avgVolatilityZ > 2)
 * - LIQUIDITY_CRUNCH: Low liquidity conditions (liquidityZ < -1)
 * - SPECULATIVE_SURGE: High correlation/speculation (correlationZ > 1.5)
 * - NORMAL: Standard market conditions
 * 
 * Schema: v1.7.0
 * Governance: Directive 11.5 Task 3
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { RollingStats } from '../../utils/rolling-stats.js';

export type MacroCondition = 
  | 'VOLATILITY_EXPANSION'
  | 'LIQUIDITY_CRUNCH'
  | 'SPECULATIVE_SURGE'
  | 'NORMAL';

export interface GlobalStats {
  avgVolatilityZ: number;
  liquidityZ: number;
  correlationZ: number;
}

/**
 * Directive 11.6B Task 3: Default Macro Thresholds
 * Baseline thresholds for macro-state conditioning.
 * These are reset after data purge to ensure clean state.
 */
export const DEFAULT_MACRO_THRESHOLDS = {
  VOLATILITY_EXPANSION: 1.0,
  LIQUIDITY_CRUNCH: -0.8,
  SPECULATIVE_SURGE: 1.2
};

const rollingVolatility = new RollingStats(300);
const rollingLiquidity = new RollingStats(300);
const rollingCorrelation = new RollingStats(300);

let lastMacroCondition: MacroCondition = 'NORMAL';
let lastMacroUpdateTime = 0;

/**
 * Directive 11.5 Task 3: Get Global Macro Condition
 * 
 * Determines the current global market state based on Z-scores of:
 * - Volatility: Market-wide volatility levels
 * - Liquidity: Market-wide liquidity levels
 * - Correlation: Cross-asset correlation levels
 * 
 * @param globalStats - Z-score normalized global statistics
 * @returns MacroCondition type
 */
export function getGlobalMacroCondition(globalStats: GlobalStats): MacroCondition {
  const { avgVolatilityZ, liquidityZ, correlationZ } = globalStats;

  if (avgVolatilityZ > 2) {
    return 'VOLATILITY_EXPANSION';
  }
  
  if (liquidityZ < -1) {
    return 'LIQUIDITY_CRUNCH';
  }
  
  if (correlationZ > 1.5) {
    return 'SPECULATIVE_SURGE';
  }
  
  return 'NORMAL';
}

/**
 * Directive 11.5: Update rolling macro statistics
 * Call this periodically with aggregate market metrics
 */
export function updateMacroStats(metrics: {
  avgVolatility: number;
  avgLiquidity: number;
  avgCorrelation: number;
}): void {
  rollingVolatility.push(metrics.avgVolatility);
  rollingLiquidity.push(metrics.avgLiquidity);
  rollingCorrelation.push(metrics.avgCorrelation);
}

/**
 * Directive 11.5: Get current macro condition using internal rolling stats
 */
export function getCurrentMacroCondition(): MacroCondition {
  const now = Date.now();
  
  if (now - lastMacroUpdateTime < 60000 && lastMacroCondition !== 'NORMAL') {
    return lastMacroCondition;
  }
  
  if (!rollingVolatility.isWarmedUp(30)) {
    return 'NORMAL';
  }
  
  const avgVolatilityZ = rollingVolatility.zScore(rollingVolatility.mean());
  const liquidityZ = rollingLiquidity.zScore(rollingLiquidity.mean());
  const correlationZ = rollingCorrelation.zScore(rollingCorrelation.mean());
  
  lastMacroCondition = getGlobalMacroCondition({
    avgVolatilityZ,
    liquidityZ,
    correlationZ
  });
  
  lastMacroUpdateTime = now;
  
  if (lastMacroCondition !== 'NORMAL') {
    console.log(`[11.5][MacroState] Condition=${lastMacroCondition} volZ=${avgVolatilityZ.toFixed(2)} liqZ=${liquidityZ.toFixed(2)} corrZ=${correlationZ.toFixed(2)}`);
  }
  
  return lastMacroCondition;
}

/**
 * Directive 11.5: Check if macro stats are warmed up
 */
export function isMacroWarmedUp(): boolean {
  return rollingVolatility.isWarmedUp(30) && 
         rollingLiquidity.isWarmedUp(30);
}

/**
 * Directive 11.6B Task 3: Reset Macro State
 * Clears rolling buffers and reinitializes baseline thresholds.
 */
export function resetMacroState(): void {
  rollingVolatility.clear();
  rollingLiquidity.clear();
  rollingCorrelation.clear();
  lastMacroCondition = 'NORMAL';
  lastMacroUpdateTime = 0;
  
  console.log('[11.6B][MacroState] Reset complete - thresholds reinitialized');
  console.log(`[11.6B][MacroState] Thresholds: VOLATILITY_EXPANSION=${DEFAULT_MACRO_THRESHOLDS.VOLATILITY_EXPANSION}, LIQUIDITY_CRUNCH=${DEFAULT_MACRO_THRESHOLDS.LIQUIDITY_CRUNCH}, SPECULATIVE_SURGE=${DEFAULT_MACRO_THRESHOLDS.SPECULATIVE_SURGE}`);
}

/**
 * Directive 11.6B Task 4: Log Macro State Verification
 * Confirms macro-state uses only price-derived metrics, not trade outcomes.
 */
export function logMacroStateVerification(): void {
  const volMean = rollingVolatility.mean();
  const volStd = rollingVolatility.std();
  const liqMean = rollingLiquidity.mean();
  const liqStd = rollingLiquidity.std();
  
  console.log(`[11.6B][MacroState] Volatility: mean=${volMean.toFixed(4)} σ=${volStd.toFixed(4)} samples=${rollingVolatility.getSize()}`);
  console.log(`[11.6B][MacroState] Liquidity: mean=${liqMean.toFixed(4)} σ=${liqStd.toFixed(4)} samples=${rollingLiquidity.getSize()}`);
  console.log(`[11.6B][MacroState] Condition: ${lastMacroCondition}`);
  console.log('[11.6B][MacroState] Input sources: priceCache, FX5 scanner (no trade outcome dependency)');
}

/**
 * Directive 11.5: Get macro state summary for diagnostics
 */
export function getMacroStateSummary(): {
  condition: MacroCondition;
  isWarmedUp: boolean;
  sampleCount: number;
} {
  return {
    condition: lastMacroCondition,
    isWarmedUp: isMacroWarmedUp(),
    sampleCount: rollingVolatility.getSize()
  };
}
