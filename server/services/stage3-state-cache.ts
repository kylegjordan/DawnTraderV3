// Phase 8.8.2-MAP-FINAL + REB 2.2: ActiveFilteredPair for detailed pool tracking
// REB 2.2: Added expiresAt, source, and fx5Snapshot for TTL and deduplication
export type ActiveFilteredPair = {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  firstSeen: string;          // ISO timestamp when first added
  lastUpdated: string;        // ISO timestamp when last seen passing filters
  expiresAt?: number;         // REB 2.2: Unix timestamp when entry expires (TTL = 5 min)
  source?: 'paper' | 'live';  // REB 2.2: Trading mode
  fx5Snapshot?: {             // REB 2.2: Optional snapshot of FX5 metrics
    volume24h: number;
    dailyRange: number;
    price: number;
  };
};

// Directive 11.4C.1: Stage3State uses Ideal/Rotational pool terminology
export type Stage3State = {
  cycleId: number;
  scanCycleId: string;
  stateVersion?: number;
  cycleStartTimestamp: string;
  cycleEndTimestamp: string;
  krakenUniverseSize: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  activePoolCount: number;
  idealCount: number; // Directive 11.4C.1: Ideal pool survivors
  rotationalCount: number; // Directive 11.4C.1: Rotational pool survivors
  cyclesPerHour: number;
  cycleFrequencyMs: number;
  nextScanInMs: number;
  activeFilteredPool: ActiveFilteredPair[];
  latestEligibleSymbols?: string[];
};

class Stage3StateCache {
  private paperState: Stage3State | null = null;
  private liveState: Stage3State | null = null;
  private paperCycleCounter: number = 0;
  private liveCycleCounter: number = 0;

  getState(mode: 'paper' | 'live'): Stage3State | null {
    return mode === 'paper' ? this.paperState : this.liveState;
  }

  updateState(mode: 'paper' | 'live', state: Partial<Stage3State>): Stage3State {
    // REB 2.4 Stage-1f: Get existing state to merge with updates (preserve stateVersion)
    const existingState = mode === 'paper' ? this.paperState : this.liveState;
    
    // REB 2.4 Stage-1f: Only increment cycle counter if this is a full scan update (not metadata-only)
    const isMetadataOnlyUpdate = state.stateVersion !== undefined && Object.keys(state).length === 1;
    
    if (!isMetadataOnlyUpdate) {
      if (mode === 'paper') {
        this.paperCycleCounter++;
      } else {
        this.liveCycleCounter++;
      }
    }
    
    const currentCycleId = mode === 'paper' ? this.paperCycleCounter : this.liveCycleCounter;
    const now = new Date().toISOString();
    
    // Phase 8.8.2-MAP-FINAL: Default cycle frequency is 30 seconds
    const cycleFrequencyMs = state.cycleFrequencyMs ?? existingState?.cycleFrequencyMs ?? 30000;
    const cyclesPerHour = state.cyclesPerHour ?? existingState?.cyclesPerHour ?? Math.round(3600000 / cycleFrequencyMs);
    
    // REB 2.4 Stage-1f: CRITICAL - Shallow merge with existing state first, then override with provided partial
    // This prevents wiping scan snapshot when persisting metadata-only updates (e.g., stateVersion)
    const newState: Stage3State = {
      // Start with existing state (preserves all fields)
      ...(existingState || {
        cycleId: currentCycleId,
        scanCycleId: '',
        cycleStartTimestamp: now,
        cycleEndTimestamp: now,
        krakenUniverseSize: 0,
        evaluatedCount: 0,
        eligibleCount: 0,
        ineligibleCount: 0,
        activePoolCount: 0,
        idealCount: 0, // Directive 11.4C.1: Ideal pool survivors
        rotationalCount: 0, // Directive 11.4C.1: Rotational pool survivors
        cyclesPerHour,
        cycleFrequencyMs,
        nextScanInMs: cycleFrequencyMs,
        activeFilteredPool: [],
      }),
      // Override with provided partial state
      ...state,
      // Special handling for auto-fields (only if not provided)
      cycleId: state.cycleId ?? existingState?.cycleId ?? currentCycleId,
      scanCycleId: state.scanCycleId ?? existingState?.scanCycleId ?? '', // REB 2.8.4: Preserve scanCycleId
      cyclesPerHour,
      cycleFrequencyMs,
      nextScanInMs: state.nextScanInMs ?? existingState?.nextScanInMs ?? cycleFrequencyMs,
    };

    if (mode === 'paper') {
      this.paperState = newState;
    } else {
      this.liveState = newState;
    }

    console.log(`[Stage3Cache] Updated ${mode} state:`, {
      cycleId: newState.cycleId,
      cycleStartTimestamp: newState.cycleStartTimestamp,
      evaluatedCount: newState.evaluatedCount,
      eligibleCount: newState.eligibleCount,
      ineligibleCount: newState.ineligibleCount,
      activePoolCount: newState.activePoolCount,
      krakenUniverseSize: newState.krakenUniverseSize,
    });

    return newState;
  }

  clearState(mode: 'paper' | 'live'): void {
    if (mode === 'paper') {
      this.paperState = null;
    } else {
      this.liveState = null;
    }
    console.log(`[Stage3Cache] Cleared ${mode} state`);
  }

  getAllStates(): { paper: Stage3State | null; live: Stage3State | null } {
    return {
      paper: this.paperState,
      live: this.liveState,
    };
  }
}

export const stage3Cache = new Stage3StateCache();

/**
 * Helper function to update Stage-3 cache with FX5 scanner data
 * Call this from signal-orchestrator after batch construction and filtering
 */
export async function updateStage3Cache(
  mode: 'paper' | 'live',
  data: Partial<Stage3State>
): Promise<Stage3State> {
  return stage3Cache.updateState(mode, data);
}
