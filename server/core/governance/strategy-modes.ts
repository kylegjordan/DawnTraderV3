/**
 * ★ obj-10 (B-SIZING-DEC-RESTORE, Kyle-directed 2026-08-07): THE CLASS-LESS 11.7S
 * POSTURE MECHANISM WAS DELETED FROM THIS FILE — resolveStrategyMode,
 * REGIME_TO_MODE_MAP, STRATEGY_MODE_OVERLAYS, getModeOverlay, getOverlayForStability,
 * applyModeOverlay, the class-less meetsConfidenceFloor, and recordModeExecution.
 *
 * It is DELETED, not deprecated: there is no shim, no flag, and nothing here multiplies
 * by a neutral 1.0 "for now". A reappearance fence
 * (server/tests/integration/b-sizing-legacy-deletion-fence.test.ts) fails CI if any of
 * it returns. Archive: 1-system-manual/_archive/deleted-code/. Record:
 * 1-system-manual/DELETED_COMPONENTS_LOG.md.
 *
 * WHY: it was damping the VTS trades the system learns from (DEFENSIVE ×0.6 on ~900/day,
 * SURVIVAL ×0.25 on ~741/day) on a premise that had rotted — it was believed to be
 * "effectively always NORMAL" and was not.
 *
 * WHAT SURVIVES, deliberately: the AMR's PER-CLASS path (getModeOverlayForClass,
 * getSlotCapForMode, meetsConfidenceFloorForClass, resolveStrategyModeFromWeather) and
 * the per-class stat recorders. The AMR is now the ONLY posture writer — the two-writer
 * problem collapses to one. It is currently in shadow, so no posture is applied at all.
 */
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

/**
 * ★ THE NAMED INTERIM POSTURE STAMP — B-SIZING-DEC-RESTORE obj-10 (Kyle, 2026-08-07).
 *
 * The class-less 11.7S stability→posture damper is DELETED. Until the AMR flag flips
 * from "shadow" to active, there is NO posture modulation anywhere: no size multiplier,
 * no stop/TP multiplier, no posture-derived confidence floor. Nothing multiplies by 1.0
 * "for now" — the multiplications are gone.
 *
 * This constant exists ONLY so the trade STAMP has a NAMED value rather than an inferred
 * one (Langston's condition). It is a label on the row, never an input to a calculation.
 * Reading it as "the system chose NORMAL posture" would be wrong: the system currently
 * chooses NO posture. Phase-25's contamination partition uses this value to separate
 * interim rows from 11.7S-modulated history.
 */
export const INTERIM_NO_POSTURE_MODE: StrategyMode = 'NORMAL';

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
  // obj-10: the class-less aggregate went with the mechanism. Deleting the WRITER
  // while leaving its READER alive is the #568 trap this batch's own pre-audit made a
  // mandatory census for — so getModeStats() and the aggregate bucket go together, and
  // the panel reads the per-class stats, which are class-correct and actually written.
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



// Hourly rollover for the surviving PER-CLASS buckets. The class-less rollover lines
// went with the class-less aggregate (obj-10).
setInterval(() => {
  for (const b of classModeStats.values()) b.lastHour = 0;
}, 60 * 60 * 1000);

console.log('[11.7S][StrategyModes] Module loaded - NORMAL/AGGRESSIVE/DEFENSIVE/SURVIVAL modes available (AGGRESSIVE per-class only, B-5)');
