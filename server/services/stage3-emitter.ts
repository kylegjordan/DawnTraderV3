import { contextBridge } from './context-bridge.js';
import { stage3Cache, Stage3State } from './stage3-state-cache.js';

// Phase 8.8.2B: Corrected FilterBreakdown schema (per future-state blueprint)
// Removed: failed_blacklist, failed_whitelist, strategy_none_triggered
// Added: failed_market_cap, already_active, passed_all_filters
export type FilterBreakdown = {
  failed_min_volume: number;
  failed_spread: number;
  failed_daily_range: number;
  failed_min_price: number;
  failed_stablecoin: number;
  failed_quote_currency: number;
  failed_history: number;
  failed_market_cap: number;
  failed_guardrail_risk: number;
  already_active: number;
  passed_all_filters: number;
};

export type ScanTickPayload = {
  mode: 'paper' | 'live';
  cycleId: number;
  cycleStartTimestamp: string;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  activePoolCount: number;
  topNCount: number;
  tierBCount: number;
  rotation: {
    topEndUniverseSize: number;
    tierBUniverseSize: number;
  };
};

export type ScannerBreakdownPayload = {
  mode: 'paper' | 'live';
  cycleId: number;
  window: 'last_cycle' | '24h';
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  breakdown: FilterBreakdown;
  truthConstraintOk: boolean;
};

class Stage3Emitter {
  /**
   * Emit lightweight scan_tick event for real-time UI updates
   */
  emitScanTick(mode: 'paper' | 'live'): void {
    const state = stage3Cache.getState(mode);
    
    if (!state) {
      console.warn(`[Stage3Emitter] Cannot emit scan_tick: no state for ${mode}`);
      return;
    }

    const payload: ScanTickPayload = {
      mode,
      cycleId: state.cycleId,
      cycleStartTimestamp: state.cycleStartTimestamp,
      evaluatedCount: state.evaluatedCount,
      eligibleCount: state.eligibleCount,
      ineligibleCount: state.ineligibleCount,
      activePoolCount: state.activePoolCount,
      topNCount: state.topNCount,
      tierBCount: state.tierBCount,
      rotation: {
        topEndUniverseSize: state.rotation.topEndUniverseSize,
        tierBUniverseSize: state.rotation.tierBUniverseSize,
      },
    };

    contextBridge.broadcast({
      type: 'scan_tick',
      payload,
      mode,
    });

    console.log(`[Stage3Emitter] Emitted scan_tick for ${mode}:`, {
      cycleId: payload.cycleId,
      evaluated: payload.evaluatedCount,
      eligible: payload.eligibleCount,
    });
  }

  /**
   * Emit heavy scanner:breakdown:<mode> event for diagnostics and Filter Insights UI
   */
  emitScannerBreakdown(
    mode: 'paper' | 'live',
    breakdown: FilterBreakdown,
    window: 'last_cycle' | '24h' = 'last_cycle'
  ): void {
    const state = stage3Cache.getState(mode);
    
    if (!state) {
      console.warn(`[Stage3Emitter] Cannot emit scanner:breakdown: no state for ${mode}`);
      return;
    }

    // Validate truth constraint
    const failureSum = 
      breakdown.failed_min_volume +
      breakdown.failed_spread +
      breakdown.failed_daily_range +
      breakdown.failed_min_price +
      breakdown.failed_stablecoin +
      breakdown.failed_quote_currency +
      breakdown.failed_history +
      breakdown.failed_market_cap +
      breakdown.failed_guardrail_risk +
      breakdown.already_active;

    const expectedTotal = failureSum + breakdown.passed_all_filters;
    const truthConstraintOk = expectedTotal === state.evaluatedCount;

    if (!truthConstraintOk) {
      console.error(`[Stage3Emitter] Truth constraint VIOLATED for ${mode}:`, {
        evaluatedCount: state.evaluatedCount,
        breakdownSum: expectedTotal,
        gap: state.evaluatedCount - expectedTotal,
        breakdown,
      });
    }

    const payload: ScannerBreakdownPayload = {
      mode,
      cycleId: state.cycleId,
      window,
      evaluatedCount: state.evaluatedCount,
      eligibleCount: state.eligibleCount,
      ineligibleCount: state.ineligibleCount,
      breakdown,
      truthConstraintOk,
    };

    contextBridge.broadcast({
      type: `scanner:breakdown:${mode}`,
      payload,
      mode,
    });

    console.log(`[Stage3Emitter] Emitted scanner:breakdown:${mode}:`, {
      cycleId: payload.cycleId,
      truthConstraintOk,
      evaluated: payload.evaluatedCount,
      breakdownSum: expectedTotal,
    });
  }

  /**
   * Emit both scan_tick and scanner:breakdown in one call
   */
  emitScanComplete(mode: 'paper' | 'live', breakdown: FilterBreakdown): void {
    this.emitScanTick(mode);
    this.emitScannerBreakdown(mode, breakdown);
  }
}

export const stage3Emitter = new Stage3Emitter();

/**
 * Helper function to emit Stage-3 events after FX5 scanner cycle completes
 * Call this from signal-orchestrator after updating the cache
 */
export async function emitStage3Events(
  mode: 'paper' | 'live',
  breakdown: FilterBreakdown
): Promise<void> {
  stage3Emitter.emitScanComplete(mode, breakdown);
}
