import { nanoid } from 'nanoid';

export type Stage3State = {
  cycleId: string;
  completedAt: string;
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

  getState(mode: 'paper' | 'live'): Stage3State | null {
    return mode === 'paper' ? this.paperState : this.liveState;
  }

  updateState(mode: 'paper' | 'live', state: Partial<Stage3State>): Stage3State {
    const currentState = this.getState(mode);
    
    const newState: Stage3State = {
      cycleId: state.cycleId || nanoid(),
      completedAt: state.completedAt || new Date().toISOString(),
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
      completedAt: newState.completedAt,
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
