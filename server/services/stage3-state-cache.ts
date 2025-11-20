export type Stage3State = {
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
    // Increment cycle counter for this mode
    if (mode === 'paper') {
      this.paperCycleCounter++;
    } else {
      this.liveCycleCounter++;
    }
    
    const currentCycleId = mode === 'paper' ? this.paperCycleCounter : this.liveCycleCounter;
    
    const newState: Stage3State = {
      cycleId: state.cycleId ?? currentCycleId,
      cycleStartTimestamp: state.cycleStartTimestamp || new Date().toISOString(),
      evaluatedCount: state.evaluatedCount ?? 0,
      eligibleCount: state.eligibleCount ?? 0,
      ineligibleCount: state.ineligibleCount ?? 0,
      activePoolCount: state.activePoolCount ?? 0,
      topNCount: state.topNCount ?? 0,
      tierBCount: state.tierBCount ?? 0,
      rotation: state.rotation || {
        topEndUniverseSize: 0,
        tierBUniverseSize: 0,
      },
      latestEligibleSymbols: state.latestEligibleSymbols,
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
