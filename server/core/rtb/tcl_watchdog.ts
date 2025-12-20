/**
 * Phase 8.8.4-C.12: TCL Watchdog Service
 * Directive 8.8.4-A3.R7: Central Clock Integration
 * 
 * Event-driven TCL (Trade Capacity Limit) activation system.
 * Uses Central Clock for synchronized timing and deterministic failsafe.
 * 
 * Responsibilities:
 * 1. Start timer when engine starts (using Central Clock)
 * 2. Emit TCL_ACTIVATED exactly once after failsafe period (default 2 min)
 * 3. Emit TCL_ACTIVATED when RTB queue reaches threshold signals
 * 4. Track activation state per mode (paper/live)
 * 5. Emit FailsafeTrigger event for diagnostic logging
 * 
 * Event Model (Directive A3.R7 Section 3):
 * - SlotOpened: Emitted by Trade Manager when a trade closes
 * - RTBThresholdMet: Emitted when 15 unexpired signals exist in RTB queue
 * - FailsafeTrigger: Internal timer after 120s of inactivity
 */

import { eventBus, type TradingMode } from '../../lib/event-bus';
import { centralClock, ClockTick } from '../../services/central-clock';

const TCL_FAILSAFE_SECONDS = parseInt(process.env.TCL_FAILSAFE_SECONDS || '120', 10);
const TCL_SIGNAL_THRESHOLD = parseInt(process.env.TCL_SIGNAL_THRESHOLD || '15', 10);
console.log(`[A3.R7][TCL_CONFIG] FAILSAFE=${TCL_FAILSAFE_SECONDS}s THRESHOLD=${TCL_SIGNAL_THRESHOLD} signals`);

interface TCLState {
  isActive: boolean;
  activatedAt: Date | null;
  activationReason: '5min' | '100signals' | null;
  startedAt: Date | null;
  failsafeDisabled: boolean;
  startTickNumber: number;
  lastThresholdCheckMs: number; // Directive 8.8.4-A3.R8.4: Debounce for threshold checks
}

class TCLWatchdog {
  private states: Map<TradingMode, TCLState> = new Map();
  private clockTickHandlers: Map<TradingMode, (tick: ClockTick) => void> = new Map();

  constructor() {
    console.log('[A3.R7][TCL_WATCHDOG] TCL Watchdog Service initialized with Central Clock');
  }

  private getState(mode: TradingMode): TCLState {
    if (!this.states.has(mode)) {
      this.states.set(mode, {
        isActive: false,
        activatedAt: null,
        activationReason: null,
        startedAt: null,
        failsafeDisabled: false,
        startTickNumber: 0,
        lastThresholdCheckMs: 0,
      });
    }
    return this.states.get(mode)!;
  }

  /**
   * Start the TCL watchdog for a trading mode
   * Directive 8.8.4-A3.R7: Uses Central Clock for synchronized failsafe timing
   */
  start(mode: TradingMode): void {
    const state = this.getState(mode);

    if (this.clockTickHandlers.has(mode)) {
      centralClock.unsubscribe(`TCL_${mode}`);
      this.clockTickHandlers.delete(mode);
    }

    state.isActive = false;
    state.activatedAt = null;
    state.activationReason = null;
    state.startedAt = new Date();
    state.failsafeDisabled = false;
    state.startTickNumber = centralClock.getTickNumber();

    if (!centralClock.getIsRunning()) {
      centralClock.start();
      console.log(`[A3.R7][TCL_WATCHDOG] Started Central Clock`);
    }

    console.log(`[A3.R7][TCL_WATCHDOG] Started for ${mode} mode at ${state.startedAt.toISOString()}`);
    console.log(`[A3.R7][TCL_WATCHDOG] Failsafe set for ${TCL_FAILSAFE_SECONDS}s (tick-aligned)`);

    const tickHandler = (tick: ClockTick) => {
      if (state.isActive || state.failsafeDisabled) return;

      const ticksElapsed = tick.tickNumber - state.startTickNumber;
      
      if (ticksElapsed > 0 && ticksElapsed % 30 === 0) {
        console.log(`[A3.R7][TCL_WATCHDOG][${mode}] Heartbeat: elapsed=${ticksElapsed}s active=${state.isActive} failsafeDisabled=${state.failsafeDisabled}`);
      }

      if (ticksElapsed >= TCL_FAILSAFE_SECONDS) {
        console.log(`[A3.R7][TCL_WATCHDOG] FailsafeTrigger fired for ${mode} after ${ticksElapsed}s`);
        
        eventBus.emitFailsafeTrigger({
          mode,
          elapsedSeconds: ticksElapsed,
          timestamp: new Date().toISOString()
        });
        
        this.activateTCL(mode, '5min', 0);
      }
    };

    this.clockTickHandlers.set(mode, tickHandler);
    centralClock.subscribe(`TCL_${mode}`, tickHandler);
    console.log(`[A3.R7][TCL_WATCHDOG] ✅ Subscribed to Central Clock for ${mode} mode`);
  }

  /**
   * Stop the TCL watchdog for a trading mode
   */
  stop(mode: TradingMode): void {
    if (this.clockTickHandlers.has(mode)) {
      centralClock.unsubscribe(`TCL_${mode}`);
      this.clockTickHandlers.delete(mode);
    }

    const state = this.getState(mode);
    state.isActive = false;
    state.activatedAt = null;
    state.activationReason = null;
    state.startedAt = null;
    state.failsafeDisabled = false;
    state.startTickNumber = 0;

    console.log(`[A3.R7][TCL_WATCHDOG] Stopped for ${mode} mode`);
  }

  /**
   * Check if signal threshold is reached and activate TCL if needed
   * Directive A3.R7: Permanently disables failsafe after RTBThresholdMet
   * Directive A3.R8.4: Added 5-second debounce to prevent redundant activation attempts
   */
  checkSignalThreshold(mode: TradingMode, currentPoolSize: number): void {
    const state = this.getState(mode);
    const now = Date.now();
    const DEBOUNCE_MS = 5000; // 5 seconds debounce

    // Already active - skip
    if (state.isActive) {
      return;
    }
    
    // A3.R8.4: Debounce threshold checks to prevent redundant activations
    if (now - state.lastThresholdCheckMs < DEBOUNCE_MS) {
      return; // Skip - too soon since last check
    }
    
    state.lastThresholdCheckMs = now;

    if (currentPoolSize >= TCL_SIGNAL_THRESHOLD) {
      console.log(`[TCL][Event] RTBThresholdMet received – ${currentPoolSize} signals active`);
      this.activateTCL(mode, '100signals', currentPoolSize);
      
      state.failsafeDisabled = true;
      console.log(`[A3.R7][TCL_WATCHDOG] Failsafe permanently disabled for ${mode} (RTBThresholdMet)`);
    }
  }

  /**
   * Activate TCL and emit event
   */
  private activateTCL(mode: TradingMode, reason: '5min' | '100signals', poolSize: number): void {
    const state = this.getState(mode);

    if (state.isActive) {
      console.log(`[A3.R7][TCL_WATCHDOG] TCL already active for ${mode}, skipping`);
      return;
    }

    state.isActive = true;
    state.activatedAt = new Date();
    state.activationReason = reason;

    const elapsedMs = state.startedAt ? Date.now() - state.startedAt.getTime() : 0;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);

    console.log(`[A3.R7][TCL_WATCHDOG] TCL ACTIVATED for ${mode} | reason=${reason} | elapsed=${elapsedSec}s | poolSize=${poolSize}`);

    if (reason === '100signals') {
      console.log(`[TCL][Event] RTBThresholdMet triggered – promoting top signals`);
    } else {
      console.log(`[TCL][Event] FailsafeTrigger activated – promoting available signals`);
    }

    eventBus.emitTCLActivated({
      mode,
      reason,
      timestamp: state.activatedAt.toISOString(),
      poolSize,
    });
  }

  isActive(mode: TradingMode): boolean {
    return this.getState(mode).isActive;
  }

  getStatus(mode: TradingMode): {
    isActive: boolean;
    activatedAt: string | null;
    activationReason: '5min' | '100signals' | null;
    startedAt: string | null;
    elapsedMs: number;
    state: 'WARMING' | 'ACTIVE';
    failsafeDisabled: boolean;
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
      failsafeDisabled: state.failsafeDisabled,
    };
  }
}

export const tclWatchdog = new TCLWatchdog();
