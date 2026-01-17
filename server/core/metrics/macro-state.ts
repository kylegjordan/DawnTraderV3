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
