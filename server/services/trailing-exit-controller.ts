/**
 * Directive 9.2.A — TrailingExitController (canonical TEC as of B65.2)
 * Directive 11.3A — Enhanced with Cost-Aware Ratchet Logic
 * B65.2 (2026-04-23) — Moonbag qualifier gate, duration cap, concurrency cap,
 *                      stop-writeback callback, module_constants integration.
 *
 * Core trailing-stop computation with adaptive exit logic powered by DI and VolNoise.
 * Implements:
 * - Dynamic Trailing Exit Logic
 * - Two-Stage Latching System (Break-Even + Target Lock)
 * - Mode persistence (TARGET vs TRAILING_TAKE)
 * - 11.3A: Cost-aware floors (netBreakeven, netTargetFloor)
 * - B65.2: Moonbag qualifier (strategy + sourcePool), duration cap,
 *          concurrency cap (mode-aware), stop-writeback callback.
 *
 * With B65.2, this module is the single canonical trailing engine — the
 * Phase-11 `execution-controller.ts` implementation has been deleted.
 */

import {
  calculateDynamicStopDistance,
  calculateTrailingStopPrice,
  isBreakEvenTriggered,
  isTargetLockTriggered,
  type TradeMode
} from '../utils/analysis-utils.js';
import { getCachedCostMetrics, computeNetBreakeven, computeNetTargetFloor } from '../core/math/cost-model.js';
import { getModuleConstants } from './module-constants-service.js';

// Debounce persistence writes to avoid excessive I/O.
// B65.2: tunable via `module_constants.trailing_exit.persistence_debounce_ms`.
let persistenceTimer: NodeJS.Timeout | null = null;
const PERSIST_DEBOUNCE_MS = 5000; // 5 second default; matches B65.1 seed.

// B65.2: caller mode for per-mode config resolution and concurrency cap.
export type CallerMode = 'vts' | 'paper' | 'live';

// B65.2: service-level counter tracking concurrent moonbag trades per mode.
// Decoupled from DB so the concurrency cap check is O(1) and free from race
// conditions on simultaneous target-hits within one cycle.
const concurrentMoonbagByMode: Record<CallerMode, number> = {
  vts: 0,
  paper: 0,
  live: 0,
};

export function getConcurrentMoonbagCount(mode: CallerMode): number {
  return concurrentMoonbagByMode[mode];
}

// B65.2: cached trailing_exit module constants with 60s TTL to avoid
// hammering the service per cycle per trade.
interface TrailingExitConfig {
  breakEvenTriggerR: number;
  targetLockR: number;
  trailDistanceAtrMultiplier: number;
  persistenceDebounceMs: number;
  moonbagQualifyingStrategies: string[];
  moonbagQualifyingSourcePools: Record<string, string[]>;
  moonbagMaxDurationMs: number;
  moonbagCapMode: 'unlimited' | 'reserved_slots';
  moonbagReservedSlots: number;
}

const TEC_DEFAULTS: TrailingExitConfig = {
  breakEvenTriggerR: 1.0,
  targetLockR: 1.5,
  trailDistanceAtrMultiplier: 1.0,
  persistenceDebounceMs: 5000,
  moonbagQualifyingStrategies: ['strong_bull_trend', 'sma_trend_ride', 'vwap_pullback', 'breakout'],
  moonbagQualifyingSourcePools: { vwap_pullback: ['quant-strong_trend'] },
  moonbagMaxDurationMs: 14400000, // 4h
  moonbagCapMode: 'reserved_slots',
  moonbagReservedSlots: 1,
};

let cachedConfig: TrailingExitConfig = { ...TEC_DEFAULTS };
let configExpiresAt = 0;
const CONFIG_TTL_MS = 60_000;

async function resolveTECConfig(strategy?: string, regime?: string): Promise<TrailingExitConfig> {
  const now = Date.now();
  if (now < configExpiresAt) return cachedConfig;

  try {
    const rows = await getModuleConstants('trailing_exit', {
      exchange: 'kraken',
      assetClass: 'crypto_spot',
      strategy: strategy ?? '*',
      regime: regime ?? '*',
    });

    const pick = <T>(key: string, fallback: T): T =>
      rows[key] !== undefined ? (rows[key] as T) : fallback;

    cachedConfig = {
      breakEvenTriggerR: pick('break_even_trigger_r', TEC_DEFAULTS.breakEvenTriggerR),
      targetLockR: pick('target_lock_r', TEC_DEFAULTS.targetLockR),
      trailDistanceAtrMultiplier: pick('trail_distance_atr_multiplier', TEC_DEFAULTS.trailDistanceAtrMultiplier),
      persistenceDebounceMs: pick('persistence_debounce_ms', TEC_DEFAULTS.persistenceDebounceMs),
      moonbagQualifyingStrategies: pick('moonbag_qualifying_strategies', TEC_DEFAULTS.moonbagQualifyingStrategies),
      moonbagQualifyingSourcePools: pick('moonbag_qualifying_source_pools', TEC_DEFAULTS.moonbagQualifyingSourcePools),
      moonbagMaxDurationMs: pick('moonbag_max_duration_ms', TEC_DEFAULTS.moonbagMaxDurationMs),
      moonbagCapMode: pick('moonbag_cap_mode', TEC_DEFAULTS.moonbagCapMode),
      moonbagReservedSlots: pick('moonbag_reserved_slots', TEC_DEFAULTS.moonbagReservedSlots),
    };
    configExpiresAt = now + CONFIG_TTL_MS;
  } catch (err) {
    console.error('[9.2][TEC] Failed to refresh config from module_constants; using cached/defaults:', err);
    configExpiresAt = now + 5_000; // retry sooner on failure
  }
  return cachedConfig;
}

/**
 * B65.2: Public check — does this trade qualify for moonbag (trailing) mode?
 * Called by the evaluator BEFORE flipping to TRAILING_TAKE. If it returns
 * false, the trade closes at target with exit reason 'target_hit' instead of
 * entering trailing. Async because it reads module_constants.
 */
export async function isMoonbagQualifier(
  strategy: string,
  sourcePool: string | null | undefined,
  regime?: string,
): Promise<boolean> {
  const cfg = await resolveTECConfig(strategy, regime);
  if (!cfg.moonbagQualifyingStrategies.includes(strategy)) return false;
  const requiredPools = cfg.moonbagQualifyingSourcePools?.[strategy];
  if (requiredPools && requiredPools.length > 0) {
    if (!sourcePool || !requiredPools.includes(sourcePool)) return false;
  }
  return true;
}

/**
 * B65.2: Concurrency cap check. Called BEFORE flipping to TRAILING_TAKE.
 * Returns true if another moonbag slot is available in the caller's mode.
 * - VTS: always true (no cap — observation goal).
 * - Paper/live: true iff current concurrent moonbags < slot_total - reserved.
 */
export async function canEnterMoonbag(
  mode: CallerMode,
  currentSlotTotal: number,
  strategy?: string,
  regime?: string,
): Promise<boolean> {
  if (mode === 'vts') return true;
  const cfg = await resolveTECConfig(strategy, regime);
  if (cfg.moonbagCapMode === 'unlimited') return true;
  const current = concurrentMoonbagByMode[mode];
  const allowed = currentSlotTotal - cfg.moonbagReservedSlots;
  return current < allowed;
}

/**
 * B65.2: Returns the resolved TEC config for the given strategy/regime
 * (diagnostics + tests). Safe to call frequently — cached 60s.
 */
export async function getResolvedTECConfig(strategy?: string, regime?: string): Promise<TrailingExitConfig> {
  return resolveTECConfig(strategy, regime);
}

/**
 * Directive 9.2.D: Schedule persistence save (debounced)
 */
function schedulePersistence(): void {
  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
  }
  persistenceTimer = setTimeout(async () => {
    try {
      const { persistTrailingStates } = await import('./trade-safety.js');
      persistTrailingStates();
    } catch (err) {
      console.error('[9.2][PERSIST] Failed to schedule persistence:', err);
    }
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Directive 9.2.D: Update trade mode in database when mode changes
 */
async function syncTradeModeToStorage(symbol: string, tradeMode: TradeMode): Promise<void> {
  try {
    const { storage } = await import('../storage.js');
    // Update paper positions
    const paperPositions = await storage.getPaperSimOpenPositions('paper');
    const paperPosition = paperPositions.find((p: any) => p.symbol === symbol);
    if (paperPosition) {
      await storage.updatePaperSimOpenPosition(paperPosition.id, { tradeMode });
      console.log(`[9.2][MODE_SYNC] ${symbol} DB updated to ${tradeMode}`);
    }
    // Also check live positions
    const livePositions = await storage.getPaperSimOpenPositions('live');
    const livePosition = livePositions.find((p: any) => p.symbol === symbol);
    if (livePosition) {
      await storage.updatePaperSimOpenPosition(livePosition.id, { tradeMode });
      console.log(`[9.2][MODE_SYNC] ${symbol} DB (live) updated to ${tradeMode}`);
    }
  } catch (err) {
    console.error(`[9.2][MODE_SYNC] Failed to sync ${symbol}:`, err);
  }
}

export interface TrailingState {
  symbol: string;
  tradeMode: TradeMode;
  entryPrice: number;
  targetPrice: number;
  currentStopPrice: number;
  highWaterMark: number;
  breakEvenLatched: boolean;
  targetLatched: boolean;
  lastUpdated: number;
  DI: number;
  VolNoise: number;
  ATR: number;
  // B65.2: set when the trade flips into TRAILING_TAKE mode; used by the
  // duration-cap check to fire `moonbag_timeout` close decisions.
  moonbagEnteredAt?: number;
  // B65.2: caller mode — tracked so concurrency counter decrements on the
  // correct mode when the trade closes.
  callerMode?: CallerMode;
}

export interface PositionUpdate {
  symbol: string;
  entryPrice: number;
  targetPrice: number;
  currentPrice: number;
  DI: number;
  VolNoise: number;
  ATR: number;
  currentStopPrice: number;
  // B65.2: extra inputs for moonbag gating + concurrency tracking.
  strategy?: string;
  sourcePool?: string | null;
  regime?: string;
  callerMode?: CallerMode; // default 'paper' for backward compat
  /**
   * B65.2: Result of the caller's upstream `canEnterMoonbag` check.
   * Passed in rather than queried inside updatePosition to avoid turning
   * the update into async. If false, target-lock will still latch but
   * mode WILL NOT flip to TRAILING_TAKE — trade closes at target instead.
   * If caller omits, defaults to true (backward-compatible for paths that
   * haven't been wired to the cap yet).
   */
  moonbagAllowed?: boolean;
  /**
   * B65.2: Result of the caller's upstream `isMoonbagQualifier` check.
   * Same rationale — injected by caller. If false, no trailing.
   * Default true for backward compatibility.
   */
  moonbagQualified?: boolean;
}

export interface TrailingUpdateResult {
  symbol: string;
  previousMode: TradeMode;
  newMode: TradeMode;
  modeChanged: boolean;
  newStopPrice: number;
  stopMoved: boolean;
  breakEvenLatched: boolean;
  targetLatched: boolean;
  highWaterMark: number;
  // B65.2: when true, the caller should close the trade at currentPrice with
  // the specified exit reason. Indicates a TEC-authored terminal decision
  // (moonbag duration cap hit; mode-flip refused for qualifier/cap reasons
  // → caller should use static target close).
  closeNow?: boolean;
  closeReason?: 'moonbag_timeout' | 'target_hit_no_trailing';
}

const trailingStates = new Map<string, TrailingState>();

/**
 * Directive 9.2.A: Initialize trailing state for a new position
 */
export function initializeTrailingState(
  symbol: string,
  entryPrice: number,
  targetPrice: number,
  initialStopPrice: number,
  DI: number = 50,
  VolNoise: number = 0.3,
  ATR: number = 0
): TrailingState {
  const state: TrailingState = {
    symbol,
    tradeMode: 'TARGET',
    entryPrice,
    targetPrice,
    currentStopPrice: initialStopPrice,
    highWaterMark: entryPrice,
    breakEvenLatched: false,
    targetLatched: false,
    lastUpdated: Date.now(),
    DI,
    VolNoise,
    ATR
  };
  
  trailingStates.set(symbol, state);
  console.log(`[9.2][EXIT] ${symbol} initialized: entry=${entryPrice.toFixed(4)}, target=${targetPrice.toFixed(4)}, stop=${initialStopPrice.toFixed(4)}, mode=TARGET`);
  
  // Directive 9.2.D: Schedule persistence save after state creation
  schedulePersistence();
  
  return state;
}

/**
 * Directive 9.2.A: Get current trailing state for a position
 */
export function getTrailingState(symbol: string): TrailingState | undefined {
  return trailingStates.get(symbol);
}

/**
 * Directive 9.2.A: Update position and compute new trailing stop
 * Implements the two-stage latch system:
 * - Stage 1 (Break-Even): When price gains 1×ATR, stop moves to entry
 * - Stage 2 (Target Lock): When price hits target, stop locks to target, mode → TRAILING_TAKE
 */
export function updatePosition(update: PositionUpdate): TrailingUpdateResult {
  let state = trailingStates.get(update.symbol);
  
  if (!state) {
    state = initializeTrailingState(
      update.symbol,
      update.entryPrice,
      update.targetPrice,
      update.currentStopPrice,
      update.DI,
      update.VolNoise,
      update.ATR
    );
  }
  
  const previousMode = state.tradeMode;
  const previousStop = state.currentStopPrice;
  let newStopPrice = state.currentStopPrice;
  let modeChanged = false;
  
  state.DI = update.DI;
  state.VolNoise = update.VolNoise;
  state.ATR = update.ATR;
  
  if (update.currentPrice > state.highWaterMark) {
    state.highWaterMark = update.currentPrice;
    console.log(`[9.2][EXIT] ${update.symbol} new HWM=${state.highWaterMark.toFixed(4)}`);
  }
  
  // Directive 11.3A: Get cost metrics for net-aware floor calculations
  const costMetrics = getCachedCostMetrics(update.symbol);
  const netBreakeven = computeNetBreakeven(state.entryPrice, costMetrics);
  const netTargetFloor = computeNetTargetFloor(state.targetPrice, costMetrics);
  
  if (!state.breakEvenLatched && state.ATR > 0) {
    if (isBreakEvenTriggered(update.currentPrice, state.entryPrice, state.ATR)) {
      state.breakEvenLatched = true;
      // Directive 11.3A: Use net breakeven (accounts for costs) instead of gross entry
      newStopPrice = Math.max(newStopPrice, netBreakeven);
      console.log(`[9.2][LOCK] ${update.symbol} BREAK-EVEN latched @ ${netBreakeven.toFixed(4)} (net, 1×ATR gain)`);
    }
  }
  
  // B65.2: moonbag qualifier + concurrency cap + caller mode tracked on state
  const moonbagQualified = update.moonbagQualified !== false; // default true
  const moonbagAllowed = update.moonbagAllowed !== false;     // default true
  state.callerMode = update.callerMode ?? state.callerMode ?? 'paper';

  // Target-lock gate. In B65.2 the latch itself ALWAYS fires once price hits
  // target (so the stop ratchets up to the net-target floor regardless, which
  // still protects the trade against a quick reversal below target). What the
  // qualifier + concurrency cap control is whether mode flips to
  // TRAILING_TAKE — i.e. whether the trade gets to keep running past target
  // in moonbag mode, or closes here at target.
  let closeNow = false;
  let closeReason: TrailingUpdateResult['closeReason'] | undefined;

  if (!state.targetLatched) {
    if (isTargetLockTriggered(update.currentPrice, state.targetPrice)) {
      state.targetLatched = true;
      // Directive 11.3A: Use net target floor (accounts for costs)
      newStopPrice = Math.max(newStopPrice, netTargetFloor);
      console.log(`[9.2][LOCK] ${update.symbol} TARGET latched @ ${netTargetFloor.toFixed(4)} (net)`);

      if (moonbagQualified && moonbagAllowed) {
        state.tradeMode = 'TRAILING_TAKE';
        state.moonbagEnteredAt = Date.now();
        modeChanged = true;
        concurrentMoonbagByMode[state.callerMode] += 1;
        console.log(`[9.2][MODE] ${update.symbol} → TRAILING_TAKE (MOONBAG activated, mode=${state.callerMode}, concurrent=${concurrentMoonbagByMode[state.callerMode]})`);
      } else {
        // Qualifier rejected or cap hit → close at target, no trailing.
        closeNow = true;
        closeReason = 'target_hit_no_trailing';
        const reason = !moonbagQualified ? 'strategy-not-qualified' : 'concurrency-cap-reached';
        console.log(`[9.2][MODE] ${update.symbol} → TARGET close (moonbag denied: ${reason})`);
      }
    }
  } else if (state.tradeMode === 'TRAILING_TAKE' && state.moonbagEnteredAt) {
    // B65.2: duration cap — already in moonbag, check if it's time to force close.
    const durationMs = Date.now() - state.moonbagEnteredAt;
    if (durationMs > cachedConfig.moonbagMaxDurationMs) {
      closeNow = true;
      closeReason = 'moonbag_timeout';
      console.log(`[9.2][TIMEOUT] ${update.symbol} moonbag duration ${Math.round(durationMs / 60000)}m exceeded cap ${Math.round(cachedConfig.moonbagMaxDurationMs / 60000)}m — forcing close`);
    }
  }
  
  if (state.targetLatched && state.ATR > 0) {
    const dynamicStop = calculateTrailingStopPrice(
      state.highWaterMark,
      state.ATR,
      state.DI,
      state.VolNoise
    );
    // Directive 11.3A: Use net target floor instead of gross target
    const floorStop = netTargetFloor;
    newStopPrice = Math.max(floorStop, dynamicStop);
    
    const Kprime = calculateDynamicStopDistance(state.DI, state.VolNoise);
    console.log(`[9.2][EXIT] ${update.symbol} trailing: K'=${Kprime.toFixed(2)}, HWM=${state.highWaterMark.toFixed(4)}, stop=${newStopPrice.toFixed(4)} (netFloor=${floorStop.toFixed(4)})`);
  } else if (state.breakEvenLatched && !state.targetLatched && state.ATR > 0) {
    const dynamicStop = calculateTrailingStopPrice(
      state.highWaterMark,
      state.ATR,
      state.DI,
      state.VolNoise
    );
    // Directive 11.3A: Use net breakeven instead of gross entry
    const floorStop = netBreakeven;
    newStopPrice = Math.max(floorStop, dynamicStop);
    
    const Kprime = calculateDynamicStopDistance(state.DI, state.VolNoise);
    console.log(`[9.2][EXIT] ${update.symbol} BE trailing: K'=${Kprime.toFixed(2)}, HWM=${state.highWaterMark.toFixed(4)}, stop=${newStopPrice.toFixed(4)} (netFloor=${floorStop.toFixed(4)})`);
  }
  
  state.currentStopPrice = newStopPrice;
  state.lastUpdated = Date.now();
  trailingStates.set(update.symbol, state);
  
  const stopMoved = Math.abs(newStopPrice - previousStop) > 0.00001;
  
  // Directive 9.2.D: Schedule persistence save after state mutation
  if (stopMoved || modeChanged) {
    schedulePersistence();
  }
  
  // Directive 9.2.D: Sync trade mode to database when mode changes
  if (modeChanged) {
    syncTradeModeToStorage(update.symbol, state.tradeMode).catch(err => {
      console.error(`[9.2][MODE_SYNC] Background sync failed:`, err);
    });
  }
  
  return {
    symbol: update.symbol,
    previousMode,
    newMode: state.tradeMode,
    modeChanged,
    newStopPrice,
    stopMoved,
    breakEvenLatched: state.breakEvenLatched,
    targetLatched: state.targetLatched,
    highWaterMark: state.highWaterMark,
    // B65.2: terminal-decision signals consumed by the caller's exit gate.
    closeNow,
    closeReason,
  };
}

/**
 * B65.2: Configure the module to run the trailing engine. Called by the
 * evaluator on first use per cold start to refresh cached config from
 * module_constants. Safe to call repeatedly.
 */
export async function primeTECConfig(): Promise<void> {
  await resolveTECConfig();
}

/**
 * Directive 9.2.A: Check if position should be closed (stop hit)
 */
export function shouldClosePosition(symbol: string, currentPrice: number): boolean {
  const state = trailingStates.get(symbol);
  if (!state) return false;
  
  return currentPrice <= state.currentStopPrice;
}

/**
 * Directive 9.2.A: Clear trailing state when position is closed
 */
export function clearTrailingState(symbol: string): void {
  if (trailingStates.has(symbol)) {
    const state = trailingStates.get(symbol);
    // B65.2: decrement the concurrent-moonbag counter if this trade was in
    // trailing mode when cleared. Keeps the cap check accurate across opens
    // and closes happening in any order within a cycle.
    if (state && state.tradeMode === 'TRAILING_TAKE' && state.callerMode) {
      concurrentMoonbagByMode[state.callerMode] = Math.max(0, concurrentMoonbagByMode[state.callerMode] - 1);
    }
    console.log(`[9.2][EXIT] ${symbol} cleared: mode=${state?.tradeMode}, finalStop=${state?.currentStopPrice.toFixed(4)}`);
    trailingStates.delete(symbol);
    // Directive 9.2.D: Schedule persistence save after state removal
    schedulePersistence();
  }
}

/**
 * Directive 9.2.D: Export all trailing states for persistence
 */
export function exportAllStates(): TrailingState[] {
  return Array.from(trailingStates.values());
}

/**
 * Directive 9.2.D: Import trailing states from persistence
 */
export function importStates(states: TrailingState[]): void {
  trailingStates.clear();
  // B65.2: rebuild the concurrency counters from the restored states so the
  // cap check remains accurate across a restart.
  concurrentMoonbagByMode.vts = 0;
  concurrentMoonbagByMode.paper = 0;
  concurrentMoonbagByMode.live = 0;
  for (const state of states) {
    trailingStates.set(state.symbol, state);
    if (state.tradeMode === 'TRAILING_TAKE' && state.callerMode) {
      concurrentMoonbagByMode[state.callerMode] += 1;
    }
    console.log(`[9.2][EXIT] ${state.symbol} restored: mode=${state.tradeMode}, stop=${state.currentStopPrice.toFixed(4)}`);
  }
  console.log(`[9.2][EXIT] Restored ${states.length} trailing states (moonbag concurrency: vts=${concurrentMoonbagByMode.vts}, paper=${concurrentMoonbagByMode.paper}, live=${concurrentMoonbagByMode.live})`);
}

/**
 * Directive 9.2.F: Get diagnostic summary
 */
export function getDiagnostics(): {
  activeCount: number;
  targetModeCount: number;
  trailingTakeModeCount: number;
  states: Array<{ symbol: string; mode: TradeMode; stop: number; latches: string }>;
} {
  const states = Array.from(trailingStates.values());
  return {
    activeCount: states.length,
    targetModeCount: states.filter(s => s.tradeMode === 'TARGET').length,
    trailingTakeModeCount: states.filter(s => s.tradeMode === 'TRAILING_TAKE').length,
    states: states.map(s => ({
      symbol: s.symbol,
      mode: s.tradeMode,
      stop: s.currentStopPrice,
      latches: `BE:${s.breakEvenLatched ? 'Y' : 'N'} TGT:${s.targetLatched ? 'Y' : 'N'}`
    }))
  };
}
