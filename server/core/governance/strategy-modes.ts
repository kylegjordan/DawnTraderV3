/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7S — Strategy Mode Modulation
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * This module defines deterministic, observable strategy behavior modulation
 * based on global regime stability.
 * 
 * Key Principles:
 * - This controls HOW a strategy behaves, not WHETHER it is allowed
 * - Governance (11.7R) remains the circuit breaker
 * - 11.7S is a behavioral damper
 * - No ML, no tuning, fully deterministic
 * 
 * Phase: 11
 * Schema: strategy-modes/v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { RegimeStability } from '../../config/strategy-governance.js';
// B72.1 (2026-05-05): per-mode confidence floors moved to module='governance_modes'.
// Reseed migration 2026-05-05-b72-1-strategy-modes-naming-reseed.sql adds rows
// keyed by NORMAL/DEFENSIVE/SURVIVAL names matching this file's StrategyMode keys.
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

const _GOV_MODES_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };

function getConfidenceFloorForMode(mode: StrategyMode): number {
  const constName = mode === 'NORMAL'
    ? 'normal_mode_confidence_floor'
    : mode === 'DEFENSIVE'
      ? 'defensive_mode_confidence_floor'
      : 'survival_mode_confidence_floor';
  return getCachedNumberRequired('governance_modes', constName, _GOV_MODES_KEY);
}

export type StrategyMode = 'NORMAL' | 'DEFENSIVE' | 'SURVIVAL';

export interface StrategyModeOverlay {
  positionSizeMultiplier: number;
  stopLossDistanceMultiplier: number;
  takeProfitDistanceMultiplier: number;
  confidenceFloor: number;
  entryCooldownMultiplier: number;
}

/**
 * NOTE ON STOP LOSS MULTIPLIERS:
 *
 * In DEFENSIVE and SURVIVAL modes, stopLossDistanceMultiplier > 1 intentionally
 * WIDENS the stop distance while position size is reduced.
 *
 * This reflects professional volatility handling:
 *   - Smaller size
 *   - Wider stops
 *   - Reduced whipsaw in choppy / unstable regimes
 *
 * DO NOT "tighten stops" in volatile regimes — that causes near-100% stop-out rates.
 * Risk is controlled by position size, not by shrinking stop distance.
 */
// B72.1: confidenceFloor uses getter property so it resolves from module_constants
// at read time. Other fields remain static literals (not yet promoted).
export const STRATEGY_MODE_OVERLAYS: Record<StrategyMode, StrategyModeOverlay> = {
  NORMAL: {
    positionSizeMultiplier: 1.0,
    stopLossDistanceMultiplier: 1.0,
    takeProfitDistanceMultiplier: 1.0,
    get confidenceFloor() { return getConfidenceFloorForMode('NORMAL'); },
    entryCooldownMultiplier: 1.0,
  } as StrategyModeOverlay,

  DEFENSIVE: {
    positionSizeMultiplier: 0.6,
    stopLossDistanceMultiplier: 1.2,
    takeProfitDistanceMultiplier: 0.8,
    get confidenceFloor() { return getConfidenceFloorForMode('DEFENSIVE'); },
    entryCooldownMultiplier: 1.5,
  } as StrategyModeOverlay,

  SURVIVAL: {
    positionSizeMultiplier: 0.25,
    stopLossDistanceMultiplier: 1.5,
    takeProfitDistanceMultiplier: 0.6,
    get confidenceFloor() { return getConfidenceFloorForMode('SURVIVAL'); },
    entryCooldownMultiplier: 2.0,
  } as StrategyModeOverlay,
};

export const REGIME_TO_MODE_MAP: Record<RegimeStability, StrategyMode> = {
  STABLE: 'NORMAL',
  TRANSITION: 'DEFENSIVE',
  UNSTABLE: 'SURVIVAL',
};

export function resolveStrategyMode(stability: RegimeStability): StrategyMode {
  return REGIME_TO_MODE_MAP[stability] ?? 'SURVIVAL';
}

export function getModeOverlay(mode: StrategyMode): StrategyModeOverlay {
  return STRATEGY_MODE_OVERLAYS[mode];
}

export function getOverlayForStability(stability: RegimeStability): StrategyModeOverlay {
  const mode = resolveStrategyMode(stability);
  return getModeOverlay(mode);
}

export interface ModeApplicationResult {
  originalSize: number;
  adjustedSize: number;
  originalStopDistance: number;
  adjustedStopDistance: number;
  originalTargetDistance: number;
  adjustedTargetDistance: number;
  mode: StrategyMode;
  overlay: StrategyModeOverlay;
}

export function applyModeOverlay(
  positionSize: number,
  stopDistance: number,
  targetDistance: number,
  stability: RegimeStability
): ModeApplicationResult {
  const mode = resolveStrategyMode(stability);
  const overlay = getModeOverlay(mode);

  return {
    originalSize: positionSize,
    adjustedSize: positionSize * overlay.positionSizeMultiplier,
    originalStopDistance: stopDistance,
    adjustedStopDistance: stopDistance * overlay.stopLossDistanceMultiplier,
    originalTargetDistance: targetDistance,
    adjustedTargetDistance: targetDistance * overlay.takeProfitDistanceMultiplier,
    mode,
    overlay,
  };
}

export function meetsConfidenceFloor(
  confidence: number,
  stability: RegimeStability
): boolean {
  const mode = resolveStrategyMode(stability);
  const overlay = getModeOverlay(mode);
  return confidence >= overlay.confidenceFloor;
}

let modeStats = {
  NORMAL: { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 },
  DEFENSIVE: { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 },
  SURVIVAL: { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 },
  since: Date.now(),
};

export function recordModeExecution(mode: StrategyMode): void {
  modeStats[mode].trades++;
  modeStats[mode].lastHour++;
}

export function recordModeOutcome(mode: StrategyMode, pnl: number, stoppedOut: boolean): void {
  modeStats[mode].pnl += pnl;
  if (stoppedOut) {
    modeStats[mode].stopOuts++;
  }
}

export function getModeStats() {
  return { ...modeStats };
}

export function resetModeStats(): void {
  modeStats = {
    NORMAL: { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 },
    DEFENSIVE: { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 },
    SURVIVAL: { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 },
    since: Date.now(),
  };
}

export function getModeStopOutRate(mode: StrategyMode): number {
  const stats = modeStats[mode];
  if (stats.trades === 0) return 0;
  return stats.stopOuts / stats.trades;
}

setInterval(() => {
  modeStats.NORMAL.lastHour = 0;
  modeStats.DEFENSIVE.lastHour = 0;
  modeStats.SURVIVAL.lastHour = 0;
}, 60 * 60 * 1000);

console.log('[11.7S][StrategyModes] Module loaded - NORMAL/DEFENSIVE/SURVIVAL modes available');
