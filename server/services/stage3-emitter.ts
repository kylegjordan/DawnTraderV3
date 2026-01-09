import { contextBridge } from './context-bridge.js';
import { stage3Cache, Stage3State, ActiveFilteredPair } from './stage3-state-cache.js';

// Phase 8.8.2B: Corrected FilterBreakdown schema (per future-state blueprint)
// Removed: failed_blacklist, failed_whitelist, strategy_none_triggered
// Added: failed_market_cap, already_active, passed_all_filters
// 10.9C: Added failed_correlation for Correlation Guard (ρ ≤ 0.75)
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
  failed_correlation: number; // 10.9C: Correlation Guard (ρ ≤ 0.75)
  already_active: number;
  passed_all_filters: number;
};

// Directive 11.4C.1: ScanTickPayload with Ideal/Rotational pool terminology
export type ScanTickPayload = {
  mode: 'paper' | 'live';
  cycleId: number;
  stateVersion: number;
  krakenUniverseSize: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  cyclesPerHour: number;
  cycleFrequencyMs: number;
  nextScanInMs: number;
  cycleStartTimestamp: string;
  cycleEndTimestamp: string;
  idealCount: number; // Directive 11.4C.1: Ideal pool survivors
  rotationalCount: number; // Directive 11.4C.1: Rotational pool survivors
  activePoolCount: number;
  activeFilteredPool: ActiveFilteredPair[];
  // @deprecated Legacy fields - for backward compatibility
  topNCount?: number;
  tierBCount?: number;
  rotation?: {
    topEndUniverseSize: number;
    tierBUniverseSize: number;
  };
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

    // Directive 11.4C.1: Use Ideal/Rotational as primary metrics
    const payload: ScanTickPayload = {
      mode,
      cycleId: state.cycleId,
      stateVersion,
      krakenUniverseSize: state.krakenUniverseSize,
      evaluatedCount: state.evaluatedCount,
      eligibleCount: state.eligibleCount,
      ineligibleCount: state.ineligibleCount,
      cyclesPerHour: state.cyclesPerHour,
      cycleFrequencyMs: state.cycleFrequencyMs,
      nextScanInMs: state.nextScanInMs,
      cycleStartTimestamp: state.cycleStartTimestamp,
      cycleEndTimestamp: state.cycleEndTimestamp,
      idealCount: state.idealCount, // Directive 11.4C.1: Primary
      rotationalCount: state.rotationalCount, // Directive 11.4C.1: Primary
      activePoolCount: state.activePoolCount,
      activeFilteredPool: state.activeFilteredPool,
      // Legacy fields for backward compatibility
      topNCount: state.topNCount ?? state.idealCount,
      tierBCount: state.tierBCount ?? state.rotationalCount,
      rotation: state.rotation,
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
   * REB 2.8.4: Zero out breakdown when engine STOPPED (passive learning mode)
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

    // REB 2.8.4 DISABLED: Aggregator removal - no longer zero out based on stale aggregator state
    // TODO: Engine state checking will be handled by frontend based on REST endpoint data
    // const aggregatorStatus = scan24hAggregator.getStatus();
    // const isEngineActive = mode === 'paper' ? aggregatorStatus.paperActive : aggregatorStatus.liveActive;
    
    // REB 2.8.4 DISABLED: Always use actual breakdown (no zeroing)
    const actualBreakdown = breakdown;

    // Validate truth constraint (use actual evaluatedCount)
    const actualEvaluatedCount = state.evaluatedCount;
    const failureSum = 
      actualBreakdown.failed_min_volume +
      actualBreakdown.failed_spread +
      actualBreakdown.failed_daily_range +
      actualBreakdown.failed_min_price +
      actualBreakdown.failed_stablecoin +
      actualBreakdown.failed_quote_currency +
      actualBreakdown.failed_history +
      actualBreakdown.failed_market_cap +
      actualBreakdown.failed_guardrail_risk +
      actualBreakdown.already_active;

    const expectedTotal = failureSum + actualBreakdown.passed_all_filters;
    const truthConstraintOk = expectedTotal === actualEvaluatedCount;

    if (!truthConstraintOk) {
      console.error(`[Stage3Emitter] Truth constraint VIOLATED for ${mode}:`, {
        evaluatedCount: actualEvaluatedCount,
        breakdownSum: expectedTotal,
        gap: actualEvaluatedCount - expectedTotal,
        breakdown: actualBreakdown,
      });
    }

    const payload: ScannerBreakdownPayload = {
      mode,
      cycleId: state.cycleId,
      stateVersion, // REB 2.4 Stage-1f: Match scan_tick version for atomic consistency
      window,
      evaluatedCount: actualEvaluatedCount, // Always use actual count (no zeroing)
      eligibleCount: state.eligibleCount, // Always use actual count (no zeroing)
      ineligibleCount: state.ineligibleCount, // Always use actual count (no zeroing)
      breakdown: actualBreakdown, // Always use actual breakdown (no zeroing)
      truthConstraintOk,
    };

    // REB 2.4 Stage-1g: ACK broadcast with version tracking
    contextBridge.broadcast({
      type: `scanner:breakdown:${mode}`,
      payload,
      mode,
    });

    console.log(`[STAGE1G][ACK] scanner:breakdown:${mode} broadcasted v=${stateVersion}`);

    // REB 2.8.5A: Legacy aggregator removed - 24h tracking now handled by fx5-24h-window.ts
    // Recording happens in fx5-scanner.ts via recordScanFor24h() after scan completes

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
