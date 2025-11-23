import { contextBridge } from './context-bridge.js';
import { stage3Cache, Stage3State, ActiveFilteredPair } from './stage3-state-cache.js';
import { scan24hAggregator } from './scan-24h-aggregator.js';

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

// Phase 8.8.2-MAP-FINAL: Complete ScanTickPayload per directive
// REB 2.4 Stage-1f: Added stateVersion for atomic snapshot tracking
export type ScanTickPayload = {
  mode: 'paper' | 'live';
  cycleId: number;
  stateVersion: number; // REB 2.4 Stage-1f: Timestamp-based version for atomic snapshots
  krakenUniverseSize: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  cyclesPerHour: number;
  cycleFrequencyMs: number;
  nextScanInMs: number;
  cycleStartTimestamp: string;
  cycleEndTimestamp: string;
  topNCount: number;
  tierBCount: number;
  rotation: {
    topEndUniverseSize: number;
    tierBUniverseSize: number;
  };
  activePoolCount: number;
  activeFilteredPool: ActiveFilteredPair[];
};

export type ScannerBreakdownPayload = {
  mode: 'paper' | 'live';
  cycleId: number;
  stateVersion: number; // REB 2.4 Stage-1f: Match scan_tick version for consistency
  window: 'last_cycle' | '24h';
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  breakdown: FilterBreakdown;
  truthConstraintOk: boolean;
};

class Stage3Emitter {
  // REB 2.4 Stage-1f: Per-mode state version tracking (timestamp-based)
  private paperStateVersion: number = 0;
  private liveStateVersion: number = 0;

  /**
   * REB 2.4 Stage-1f: Generate next state version for atomic snapshot tracking
   * Uses timestamp to ensure monotonic, globally unique versions
   */
  private nextStateVersion(mode: 'paper' | 'live'): number {
    const version = Date.now();
    if (mode === 'paper') {
      this.paperStateVersion = version;
    } else {
      this.liveStateVersion = version;
    }
    console.log(`[STAGE1F][DEBUG] Next stateVersion for ${mode}: ${version}`);
    return version;
  }

  /**
   * REB 2.4 Stage-1f: Get current state version for a mode
   */
  private getStateVersion(mode: 'paper' | 'live'): number {
    return mode === 'paper' ? this.paperStateVersion : this.liveStateVersion;
  }

  /**
   * Emit lightweight scan_tick event for real-time UI updates
   */
  /**
   * Phase 8.8.2-MAP-FINAL: Emit scan_tick with all required fields for Filter Insights
   * REB 2.4 Stage-1f/1g/1h: Added atomic snapshot with stateVersion and ACK markers
   */
  emitScanTick(mode: 'paper' | 'live'): void {
    const state = stage3Cache.getState(mode);
    
    // REB 2.4 Stage-1h: Snapshot completeness check (atomic emission)
    if (!state) {
      console.log(`[STAGE1H][DEBUG] Skipping emit for ${mode} - snapshot incomplete (missing state)`);
      return;
    }

    // REB 2.4 Stage-1f: Generate new stateVersion for this snapshot AND persist to cache
    const stateVersion = this.nextStateVersion(mode);
    stage3Cache.updateState(mode, { stateVersion });

    const payload: ScanTickPayload = {
      mode,
      cycleId: state.cycleId,
      stateVersion, // REB 2.4 Stage-1f: Attach version to snapshot
      krakenUniverseSize: state.krakenUniverseSize,
      evaluatedCount: state.evaluatedCount,
      eligibleCount: state.eligibleCount,
      ineligibleCount: state.ineligibleCount,
      cyclesPerHour: state.cyclesPerHour,
      cycleFrequencyMs: state.cycleFrequencyMs,
      nextScanInMs: state.nextScanInMs,
      cycleStartTimestamp: state.cycleStartTimestamp,
      cycleEndTimestamp: state.cycleEndTimestamp,
      topNCount: state.topNCount,
      tierBCount: state.tierBCount,
      rotation: {
        topEndUniverseSize: state.rotation.topEndUniverseSize,
        tierBUniverseSize: state.rotation.tierBUniverseSize,
      },
      activePoolCount: state.activePoolCount,
      activeFilteredPool: state.activeFilteredPool,
    };

    // REB 2.4 Stage-1g: ACK broadcast with version tracking
    contextBridge.broadcast({
      type: 'scan_tick',
      payload,
      mode,
    });

    // REB 2.4 Stage-1h: Atomic snapshot emission confirmed
    console.log(`[STAGE1H][DEBUG] Emitting unified scan snapshot (mode=${mode}, stateVersion=${stateVersion})`);
    console.log(`[STAGE1G][ACK] scan_tick broadcasted v=${stateVersion} for ${mode}`);
    console.log(`[Stage3Emitter] Emitted scan_tick for ${mode}:`, {
      cycleId: payload.cycleId,
      stateVersion: payload.stateVersion,
      evaluated: payload.evaluatedCount,
      eligible: payload.eligibleCount,
      krakenUniverse: payload.krakenUniverseSize,
      activePoolSize: payload.activeFilteredPool.length,
    });
  }

  /**
   * Emit heavy scanner:breakdown:<mode> event for diagnostics and Filter Insights UI
   * 
   * Phase 8.8.2-UI-FINAL-RESTORE: Also records cycle in 24h aggregator (explicit call, no monkey-patching)
   * REB 2.4 Stage-1f/1g/1h: Added stateVersion for atomic snapshot consistency
   */
  emitScannerBreakdown(
    mode: 'paper' | 'live',
    breakdown: FilterBreakdown,
    window: 'last_cycle' | '24h' = 'last_cycle',
    scanData?: {
      evaluatedSymbols?: string[];
      survivedSymbols?: string[];
    }
  ): void {
    const state = stage3Cache.getState(mode);
    
    // REB 2.4 Stage-1h: Snapshot completeness check
    if (!state) {
      console.log(`[STAGE1H][DEBUG] Skipping emit for ${mode} - snapshot incomplete (missing state)`);
      return;
    }

    // REB 2.4 Stage-1f: Use stateVersion from cache (persisted by emitScanTick or previous call)
    // If no version in cache, generate one and persist it
    let stateVersion = state.stateVersion;
    if (!stateVersion) {
      console.warn(`[STAGE1F][WARN] No stateVersion in cache for ${mode} - generating new version (may indicate out-of-order broadcast)`);
      stateVersion = this.nextStateVersion(mode);
      stage3Cache.updateState(mode, { stateVersion });
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
      stateVersion, // REB 2.4 Stage-1f: Match scan_tick version for atomic consistency
      window,
      evaluatedCount: state.evaluatedCount,
      eligibleCount: state.eligibleCount,
      ineligibleCount: state.ineligibleCount,
      breakdown,
      truthConstraintOk,
    };

    // REB 2.4 Stage-1g: ACK broadcast with version tracking
    contextBridge.broadcast({
      type: `scanner:breakdown:${mode}`,
      payload,
      mode,
    });

    console.log(`[STAGE1G][ACK] scanner:breakdown:${mode} broadcasted v=${stateVersion}`);

    // Phase 8.8.2-UI-FINAL-RESTORE: Explicitly record cycle in 24h aggregator
    // (replaces monkey-patching approach with clean explicit call)
    scan24hAggregator.recordCycle(mode, {
      cycleId: state.cycleId,
      evaluatedCount: state.evaluatedCount,
      eligibleCount: state.eligibleCount,
      evaluatedSymbols: scanData?.evaluatedSymbols,
      survivedSymbols: scanData?.survivedSymbols,
    });

    console.log(`[Stage3Emitter] Emitted scanner:breakdown:${mode}:`, {
      cycleId: payload.cycleId,
      stateVersion: payload.stateVersion,
      truthConstraintOk,
      evaluated: payload.evaluatedCount,
      breakdownSum: expectedTotal,
    });
  }

  /**
   * Emit both scan_tick and scanner:breakdown in one call
   * 
   * Phase 8.8.2-UI-FINAL-RESTORE: Now accepts symbol arrays for 24h unique tracking
   */
  emitScanComplete(
    mode: 'paper' | 'live', 
    breakdown: FilterBreakdown,
    scanData?: {
      evaluatedSymbols?: string[];
      survivedSymbols?: string[];
    }
  ): void {
    this.emitScanTick(mode);
    this.emitScannerBreakdown(mode, breakdown, 'last_cycle', scanData);
  }
}

export const stage3Emitter = new Stage3Emitter();

/**
 * Helper function to emit Stage-3 events after FX5 scanner cycle completes
 * Call this from signal-orchestrator after updating the cache
 * 
 * Phase 8.8.2-UI-FINAL-RESTORE: Now accepts symbol arrays for 24h unique tracking
 */
export async function emitStage3Events(
  mode: 'paper' | 'live',
  breakdown: FilterBreakdown,
  scanData?: {
    evaluatedSymbols?: string[];
    survivedSymbols?: string[];
  }
): Promise<void> {
  stage3Emitter.emitScanComplete(mode, breakdown, scanData);
}
