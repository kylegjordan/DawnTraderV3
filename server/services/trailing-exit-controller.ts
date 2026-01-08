/**
 * Directive 9.2.A — TrailingExitController
 * Directive 11.3A — Enhanced with Cost-Aware Ratchet Logic
 * 
 * Core trailing-stop computation with adaptive exit logic powered by DI and VolNoise.
 * Implements:
 * - Dynamic Trailing Exit Logic
 * - Two-Stage Latching System (Break-Even + Target Lock)
 * - Mode persistence (TARGET vs TRAILING_TAKE)
 * - 11.3A: Cost-aware floors (netBreakeven, netTargetFloor)
 */

import {
  calculateDynamicStopDistance,
  calculateTrailingStopPrice,
  isBreakEvenTriggered,
  isTargetLockTriggered,
  type TradeMode
} from '../utils/analysis-utils.js';
import { getCachedCostMetrics, computeNetBreakeven, computeNetTargetFloor } from '../core/math/cost-model.js';

// Debounce persistence writes to avoid excessive I/O
let persistenceTimer: NodeJS.Timeout | null = null;
const PERSIST_DEBOUNCE_MS = 5000; // 5 second debounce

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
  
  if (!state.targetLatched) {
    if (isTargetLockTriggered(update.currentPrice, state.targetPrice)) {
      state.targetLatched = true;
      state.tradeMode = 'TRAILING_TAKE';
      modeChanged = true;
      // Directive 11.3A: Use net target floor (accounts for costs)
      newStopPrice = Math.max(newStopPrice, netTargetFloor);
      console.log(`[9.2][LOCK] ${update.symbol} TARGET latched @ ${netTargetFloor.toFixed(4)} (net)`);
      console.log(`[9.2][MODE] ${update.symbol} → TRAILING_TAKE (MOONBAG mode activated)`);
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
    highWaterMark: state.highWaterMark
  };
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
  for (const state of states) {
    trailingStates.set(state.symbol, state);
    console.log(`[9.2][EXIT] ${state.symbol} restored: mode=${state.tradeMode}, stop=${state.currentStopPrice.toFixed(4)}`);
  }
  console.log(`[9.2][EXIT] Restored ${states.length} trailing states from persistence`);
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
