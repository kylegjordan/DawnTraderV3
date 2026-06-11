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

const FLOOR_CONST_BY_MODE: Record<StrategyMode, string> = {
  NORMAL: 'normal_mode_confidence_floor',
  AGGRESSIVE: 'aggressive_mode_confidence_floor',
  DEFENSIVE: 'defensive_mode_confidence_floor',
  SURVIVAL: 'survival_mode_confidence_floor',
};

function getConfidenceFloorForMode(mode: StrategyMode): number {
  return getCachedNumberRequired('governance_modes', FLOOR_CONST_BY_MODE[mode], _GOV_MODES_KEY);
}

// B-5 AMR (Obj-1): AGGRESSIVE joins the taxonomy. It is producible ONLY by
// the AMR weather resolver (FAVORABLE classification, per-class) — the legacy
// stability mapping below never emits it, so pre-B-5 callers are unaffected.
export type StrategyMode = 'NORMAL' | 'AGGRESSIVE' | 'DEFENSIVE' | 'SURVIVAL';

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

  // B-5 AMR: AGGRESSIVE has NO class-less overlay — its dials are per-class
  // by design (amr_response_dials) and it can only be produced by the
  // per-class weather resolver. Reaching it through the legacy class-less
  // path is a wiring bug; fail loud rather than serve crypto dials to xstock.
  get AGGRESSIVE(): StrategyModeOverlay {
    throw new Error(
      '[B-5][strategy-modes] AGGRESSIVE has no class-less overlay — ' +
      'use getModeOverlayForClass(\'AGGRESSIVE\', assetClass).',
    );
  },
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

// ════════════════════════════════════════════════════════════════════════════
// B-5 AMR — per-class mode resolution (Obj-1/2/4)
// ════════════════════════════════════════════════════════════════════════════

import type { AssetClass } from '../../../shared/asset-classes.js';

/** Weather classifications the AMR aggregator emits (Obj-3). */
export type AmrWeatherClassification = 'CALM' | 'CHOPPY' | 'STORMY' | 'FAVORABLE' | 'IDLE';

/**
 * THE brain seam (Obj-4, Langston M2): one function maps the per-class
 * weather classification to a strategy mode. IDLE returns null — no posture
 * decision while a class is idle/warming (Obj-3a); callers hold the prior
 * mode. The M2 continuous-score contract lets a future learned brain replace
 * these internals without consumers changing: classification IS the bucketed
 * continuousScore, so swapping the bucketing for a learned mapping is a
 * one-site change.
 */
export function resolveStrategyModeFromWeather(
  classification: AmrWeatherClassification,
): StrategyMode | null {
  switch (classification) {
    case 'FAVORABLE': return 'AGGRESSIVE';
    case 'CALM': return 'NORMAL';
    case 'CHOPPY': return 'DEFENSIVE';
    case 'STORMY': return 'SURVIVAL';
    case 'IDLE': return null;
  }
}

const MODE_PREFIX: Record<StrategyMode, string> = {
  NORMAL: 'normal_',
  AGGRESSIVE: 'aggressive_',
  DEFENSIVE: 'defensive_',
  SURVIVAL: 'survival_',
};

function dialKey(assetClass: AssetClass) {
  return { exchange: '*', assetClass, strategy: '*', regime: '*' };
}

/**
 * Per-(mode, class) overlay from amr_response_dials + governance_modes
 * (Obj-1/2). Fail-hard on missing rows — the B-5 migration seeds every
 * (mode, class) pair and the boot assertion verifies them, so a throw here
 * means an unseeded class reached the active path.
 */
export function getModeOverlayForClass(mode: StrategyMode, assetClass: AssetClass): StrategyModeOverlay {
  const p = MODE_PREFIX[mode];
  const k = dialKey(assetClass);
  return {
    positionSizeMultiplier: getCachedNumberRequired('amr_response_dials', p + 'position_size_multiplier', k),
    stopLossDistanceMultiplier: getCachedNumberRequired('amr_response_dials', p + 'stop_loss_distance_multiplier', k),
    takeProfitDistanceMultiplier: getCachedNumberRequired('amr_response_dials', p + 'take_profit_distance_multiplier', k),
    confidenceFloor: getCachedNumberRequired('governance_modes', FLOOR_CONST_BY_MODE[mode], k),
    entryCooldownMultiplier: getCachedNumberRequired('amr_response_dials', p + 'entry_cooldown_multiplier', k),
  };
}

/** Per-(mode, class) open-position slot cap (gate input, Obj-6). */
export function getSlotCapForMode(mode: StrategyMode, assetClass: AssetClass): number {
  return getCachedNumberRequired('amr_response_dials', MODE_PREFIX[mode] + 'slot_cap', dialKey(assetClass));
}

/** Per-(mode, class) confidence floor check (active-path SQE swap, Obj-5). */
export function meetsConfidenceFloorForClass(
  confidence: number,
  mode: StrategyMode,
  assetClass: AssetClass,
): boolean {
  return confidence >= getCachedNumberRequired('governance_modes', FLOOR_CONST_BY_MODE[mode], dialKey(assetClass));
}

// ── Per-class mode stats (Langston F2: per-class counters; the legacy
// class-blind aggregate below is retained for the diagnostic endpoint's
// back-compat fields) ─────────────────────────────────────────────────────────
interface ModeStatBucket { trades: number; lastHour: number; pnl: number; stopOuts: number }
const classModeStats = new Map<string, ModeStatBucket>();

function classStatBucket(mode: StrategyMode, assetClass: AssetClass): ModeStatBucket {
  const key = assetClass + ':' + mode;
  let b = classModeStats.get(key);
  if (!b) {
    b = { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 };
    classModeStats.set(key, b);
  }
  return b;
}

export function recordModeExecutionForClass(mode: StrategyMode, assetClass: AssetClass): void {
  const b = classStatBucket(mode, assetClass);
  b.trades++;
  b.lastHour++;
  recordModeExecution(mode); // legacy aggregate stays consistent
}

export function recordModeOutcomeForClass(
  mode: StrategyMode,
  assetClass: AssetClass,
  pnl: number,
  stoppedOut: boolean,
): void {
  const b = classStatBucket(mode, assetClass);
  b.pnl += pnl;
  if (stoppedOut) b.stopOuts++;
  recordModeOutcome(mode, pnl, stoppedOut);
}

export function getModeStatsForClass(assetClass: AssetClass): Record<string, ModeStatBucket> {
  const out: Record<string, ModeStatBucket> = {};
  for (const [key, b] of classModeStats) {
    if (key.startsWith(assetClass + ':')) out[key.slice(assetClass.length + 1)] = { ...b };
  }
  return out;
}

export function _resetClassModeStatsForTests(): void {
  if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
    throw new Error('[B-5] _resetClassModeStatsForTests is test-only');
  }
  classModeStats.clear();
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
  AGGRESSIVE: { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 },
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
    AGGRESSIVE: { trades: 0, lastHour: 0, pnl: 0, stopOuts: 0 },
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
  modeStats.AGGRESSIVE.lastHour = 0;
  modeStats.DEFENSIVE.lastHour = 0;
  modeStats.SURVIVAL.lastHour = 0;
  for (const b of classModeStats.values()) b.lastHour = 0;
}, 60 * 60 * 1000);

console.log('[11.7S][StrategyModes] Module loaded - NORMAL/AGGRESSIVE/DEFENSIVE/SURVIVAL modes available (AGGRESSIVE per-class only, B-5)');
