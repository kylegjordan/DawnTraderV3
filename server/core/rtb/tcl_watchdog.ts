/**
 * Phase 8.8.4-C.12: TCL Watchdog Service
 * Directive 8.8.4-A3.R9.0: System Harmonization & Performance Alignment
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
 * 6. A3.R9.0: TCL synchronization barrier - only query RTB after refresh complete
 * 
 * Event Model (Directive A3.R9.0 Section 4):
 * - SlotOpened: Emitted by Trade Manager when a trade closes
 * - RTBThresholdMet: Emitted when 15 unexpired signals exist in RTB queue
 * - FailsafeTrigger: Internal timer after 120s of inactivity
 * - TCL only activates after RTB.isRefreshComplete = true
 */

import { eventBus, type TradingMode } from '../../lib/event-bus';
import { centralClock, ClockTick } from '../../services/central-clock';
import { storage } from '../../storage';
import { performanceMonitor } from '../diagnostics/performance_monitor';
import { poolBus } from '../../services/pool-broadcast';
import { dataAggregator } from '../../services/data-aggregator.js';

// T5: Track pool size for load-aware TCL decisions
let currentPoolSize = 5;
poolBus.on('POOL_UPDATE', (size: number) => {
  currentPoolSize = size;
  console.log(`[8.8.4-A4.R10R-3.T5][ACT][SYNC] TCLWatchdog updated pool=${size}`);
});

const TCL_FAILSAFE_SECONDS = Number(process.env.TCL_FAILSAFE_SECONDS ?? 120);
const TCL_SIGNAL_THRESHOLD = Number(process.env.TCL_SIGNAL_THRESHOLD ?? 15);
console.log(`[A3.R9.3.HF-1.P1] TCL threshold loaded: ${TCL_SIGNAL_THRESHOLD}`);
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

    console.log(`[A3.R9.3.HF-1.P1] TCL Watchdog starting for mode=${mode}, threshold=${TCL_SIGNAL_THRESHOLD}`);
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
    console.log(`[R9.3.HF-5] TCL Watchdog subscribed to Central Clock for mode=${mode}`);
    console.log(`[A3.R7][TCL_WATCHDOG] ✅ Subscribed to Central Clock for ${mode} mode`);
    
    if (!centralClock.getIsRunning()) {
      console.warn('[R9.3.HF-5] ⚠️ Central Clock not running at TCL startup, forcing start()');
      centralClock.start();
    }
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
   * Directive 8.8.4-A3.R8.5: Query live pool count from database
   * Replaces cached snapshot approach with real-time query
   * FIX: Includes only active pool statuses (queued, active, reconfirmed)
   * Explicitly excludes promoted (already executed) and expired (pending cleanup)
   */
  private async getLivePoolCount(mode: TradingMode): Promise<number> {
    // A3.R8.5: Active pool statuses that count toward TCL threshold
    // Excluded: 'promoted' (already executed), 'expired' (pending cleanup)
    const active = await storage.getRtbSignals({ mode, status: 'active' });
    const reconfirmed = await storage.getRtbSignals({ mode, status: 'reconfirmed' });
    const queued = await storage.getRtbSignals({ mode, status: 'queued' });
    
    const total = active.length + reconfirmed.length + queued.length;
    console.log(`[A3.R8.5][TCL_LIVE_COUNT] mode=${mode} active=${active.length} reconfirmed=${reconfirmed.length} queued=${queued.length} total=${total}`);
    
    return total;
  }

  /**
   * Check if signal threshold is reached and activate TCL if needed
   * Directive A3.R9.3-D: Simplified TCL - only checks capacity and threshold
   * Barrier removed per R9.3-A (per-signal refresh model)
   *
   * B79.0n.RTB (2026-05-27, Langston NEW-Q1 + NEW-Q2 documentation):
   *   - TCL stays GLOBAL: the threshold counts signals across all asset
   *     classes (sum over per-class queues = same number as today's global
   *     queue depth). NEW-Q1 preserves current global-count semantics.
   *   - Per-class promotion ordering inside the TCL barrier is by LOCK
   *     ACQUISITION ORDER (first-call-wins, deterministic per JavaScript
   *     event-loop ordering). No explicit class priority. If priority is
   *     needed later, introduce `module_constants.rtb_priority.<asset_class>`
   *     in a follow-up batch with workload justification.
   */
  async checkSignalThresholdLive(mode: TradingMode, _rtbRefreshComplete?: boolean): Promise<void> {
    const state = this.getState(mode);
    const now = Date.now();
    const DEBOUNCE_MS = 5000; // 5 seconds debounce

    // Already active - skip
    if (state.isActive) {
      return;
    }
    
    // R9.3-D: Barrier removed - TCL can check anytime
    // Per-signal isRefreshing flag prevents promoting signals mid-refresh
    
    // A3.R8.4: Debounce threshold checks to prevent redundant activations
    if (now - state.lastThresholdCheckMs < DEBOUNCE_MS) {
      return; // Skip - too soon since last check
    }
    
    state.lastThresholdCheckMs = now;

    // R9.3-D: Query live pool count - no barrier wait
    const currentPoolSize = await this.getLivePoolCount(mode);
    console.log(`[A3.R9.3][TCL] Pool count=${currentPoolSize} threshold=${TCL_SIGNAL_THRESHOLD}`);

    if (currentPoolSize >= TCL_SIGNAL_THRESHOLD) {
      console.log(`[A3.R9.3][TCL][Event] RTBThresholdMet – ${currentPoolSize} signals`);
      this.activateTCL(mode, '100signals', currentPoolSize);
      
      state.failsafeDisabled = true;
      console.log(`[A3.R9.3][TCL_WATCHDOG] Failsafe permanently disabled for ${mode} (RTBThresholdMet)`);
    }
  }

  /**
   * Check if signal threshold is reached and activate TCL if needed
   * Directive A3.R7: Permanently disables failsafe after RTBThresholdMet
   * Directive A3.R8.4: Added 5-second debounce to prevent redundant activation attempts
   * 
   * @deprecated Use checkSignalThresholdLive for A3.R8.5 compliance
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

    // A3.R9.0: Record TCL activation delay for performance monitoring
    performanceMonitor.recordTCLActivation(elapsedMs);

    console.log(`[A3.R9.0][TCL_WATCHDOG] TCL ACTIVATED for ${mode} | reason=${reason} | elapsed=${elapsedSec}s | poolSize=${poolSize}`);

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
