/**
 * Phase 8.8.4-C.12: TCL Watchdog Service
 * 
 * Event-driven TCL (Trade Capacity Limit) activation system.
 * Replaces polling-based approach with event-driven architecture.
 * 
 * Responsibilities:
 * 1. Start 5-minute timer when engine starts
 * 2. Emit TCL_ACTIVATED exactly once after 5 minutes (failsafe)
 * 3. Emit TCL_ACTIVATED when RTB queue reaches 100 signals (threshold)
 * 4. Track activation state per mode (paper/live)
 */

import { eventBus, type TradingMode } from '../../lib/event-bus';

const TCL_FAILSAFE_MS = 5 * 60 * 1000; // 5 minutes
const TCL_SIGNAL_THRESHOLD = 100; // Minimum signals for threshold activation

interface TCLState {
  isActive: boolean;
  activatedAt: Date | null;
  activationReason: '5min' | '100signals' | null;
  timer: NodeJS.Timeout | null;
  startedAt: Date | null;
}

class TCLWatchdog {
  private states: Map<TradingMode, TCLState> = new Map();

  constructor() {
    console.log('[8.8.4-C.12][TCL_WATCHDOG] TCL Watchdog Service initialized');
  }

  /**
   * Get or create state for a trading mode
   */
  private getState(mode: TradingMode): TCLState {
    if (!this.states.has(mode)) {
      this.states.set(mode, {
        isActive: false,
        activatedAt: null,
        activationReason: null,
        timer: null,
        startedAt: null,
      });
    }
    return this.states.get(mode)!;
  }

  /**
   * Start the TCL watchdog for a trading mode
   * Called when trading engine starts
   */
  start(mode: TradingMode): void {
    const state = this.getState(mode);

    // Clear any existing timer
    if (state.timer) {
      clearTimeout(state.timer);
    }

    // Reset state
    state.isActive = false;
    state.activatedAt = null;
    state.activationReason = null;
    state.startedAt = new Date();

    console.log(`[8.8.4-C.12][TCL_WATCHDOG] Started for ${mode} mode, 5-minute failsafe timer set`);

    // Set 5-minute failsafe timer
    state.timer = setTimeout(() => {
      this.activateTCL(mode, '5min', 0);
    }, TCL_FAILSAFE_MS);
  }

  /**
   * Stop the TCL watchdog for a trading mode
   * Called when trading engine stops
   */
  stop(mode: TradingMode): void {
    const state = this.getState(mode);

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }

    state.isActive = false;
    state.activatedAt = null;
    state.activationReason = null;
    state.startedAt = null;

    console.log(`[8.8.4-C.12][TCL_WATCHDOG] Stopped for ${mode} mode`);
  }

  /**
   * Check if 100-signal threshold is reached and activate TCL if needed
   * Called when a new signal is added to RTB queue
   */
  checkSignalThreshold(mode: TradingMode, currentPoolSize: number): void {
    const state = this.getState(mode);

    // Already activated - skip
    if (state.isActive) {
      return;
    }

    // Check if threshold reached
    if (currentPoolSize >= TCL_SIGNAL_THRESHOLD) {
      this.activateTCL(mode, '100signals', currentPoolSize);
    }
  }

  /**
   * Activate TCL and emit event
   * Called exactly once per session (either by 5min timer or 100signals threshold)
   */
  private activateTCL(mode: TradingMode, reason: '5min' | '100signals', poolSize: number): void {
    const state = this.getState(mode);

    // Guard: already activated
    if (state.isActive) {
      console.log(`[8.8.4-C.12][TCL_WATCHDOG] TCL already active for ${mode}, skipping duplicate activation`);
      return;
    }

    // Clear timer if activating via threshold (before 5 min)
    if (state.timer && reason === '100signals') {
      clearTimeout(state.timer);
      state.timer = null;
    }

    // Update state
    state.isActive = true;
    state.activatedAt = new Date();
    state.activationReason = reason;

    const elapsedMs = state.startedAt ? Date.now() - state.startedAt.getTime() : 0;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);

    console.log(`[8.8.4-C.12][TCL_WATCHDOG] TCL ACTIVATED for ${mode} | reason=${reason} | elapsed=${elapsedSec}s | poolSize=${poolSize}`);

    // Emit event
    eventBus.emitTCLActivated({
      mode,
      reason,
      timestamp: state.activatedAt.toISOString(),
      poolSize,
    });
  }

  /**
   * Check if TCL is active for a trading mode
   */
  isActive(mode: TradingMode): boolean {
    return this.getState(mode).isActive;
  }

  /**
   * Get TCL status for a trading mode
   */
  getStatus(mode: TradingMode): {
    isActive: boolean;
    activatedAt: string | null;
    activationReason: '5min' | '100signals' | null;
    startedAt: string | null;
    elapsedMs: number;
    state: 'WARMING' | 'ACTIVE';
  } {
    const state = this.getState(mode);
    const elapsedMs = state.startedAt ? Date.now() - state.startedAt.getTime() : 0;

    return {
      isActive: state.isActive,
      activatedAt: state.activatedAt?.toISOString() || null,
      activationReason: state.activationReason,
      startedAt: state.startedAt?.toISOString() || null,
      elapsedMs,
      state: state.isActive ? 'ACTIVE' : 'WARMING',
    };
  }
}

// Export singleton instance
export const tclWatchdog = new TCLWatchdog();
