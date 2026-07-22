/**
 * Directive 8.8.4-A3.R2: Trading Bootstrap - Auto-reinitialize RTB/TCL on Startup
 * Directive 8.8.4-A3.R7: Central Clock Integration for synchronized timing
 * 
 * On process boot, checks if trading engine was active (isEngineActive === true)
 * and auto-restarts the refresh cycle and TCL watchdog.
 * 
 * STARTUP ORDER (A3.R7):
 * 1. Start Central Clock first
 * 2. Register event listeners
 * 3. Initialize RTB/TCL with clock subscriptions
 * 4. Start FX5 scanner if engine active
 */

import { storage } from '../storage';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service';
import { tclWatchdog } from '../core/rtb/tcl_watchdog';
import { centralClock } from '../services/central-clock';
import { eventBus } from '../lib/event-bus';
import type { TradingMode } from '../services/guardrail-policy';

let bootstrapped = false;

/**
 * Bootstrap RTB/TCL services if engine was active before restart
 * Called from server/index.ts after database is ready
 */
export async function bootstrapTradingServices(): Promise<void> {
  if (bootstrapped) {
    console.log('[A3.R7][Startup] Trading services already bootstrapped, skipping');
    return;
  }

  try {
    console.log('[A3.R7][Startup] Checking for active trading sessions...');

    console.log('[A3.R8.2] SQE Decay & Lifecycle Alignment activated');
    console.log('[A3.R7][Startup] Step 1: Starting Central Clock...');
    centralClock.start();
    console.log('[A3.R7][Startup] ✅ Central Clock started');

    console.log('[A3.R7][Startup] Step 2: Registering event listeners...');
    eventBus.onTCLActivated((event) => {
      console.log(`[A3.R7][EventListener] TCL_ACTIVATED: mode=${event.mode} reason=${event.reason}`);
    });
    eventBus.onSlotOpened((event) => {
      console.log(`[A3.R7][EventListener] SlotOpened: symbol=${event.symbol} slots=${event.slotsAvailable}`);
    });
    console.log('[A3.R7][Startup] ✅ Event listeners registered');

    const modes: TradingMode[] = ['paper', 'live'];
    
    for (const mode of modes) {
      try {
        const systemContext = await storage.getSystemContext(mode);
        
        if (systemContext?.isEngineActive) {
          console.log(`[A3.R7][Startup] Found active ${mode} engine, reinitializing services...`);
          
          console.log(`[A3.R7][Startup] Step 3: Cleanup expired signals for ${mode}...`);
          const expiredCount = await readyToBuyService.cleanupExpiredSignals(mode);
          console.log(`[A3.R7][Startup] Cleaned ${expiredCount} expired signals for ${mode} mode`);
          
          // ★ B-RTB-REFRESH-CONSOLIDATE OBJ-1 (#532, 2026-07-22): Mechanism A's starter removed.
          // The bucketed RTBRefreshService is the single refresh mechanism and starts on its own
          // lifecycle; starting a second scheduler here is what produced the duplicate processing.
          
          readyToBuyService.setEngineStartTime(mode);
          console.log(`[A3.R7][Startup] Engine start time set for ${mode} mode`);
          
          console.log(`[A3.R7][Startup] Step 5: Starting TCL watchdog for ${mode}...`);
          tclWatchdog.start(mode);
          console.log(`[A3.R7][Startup] TCL watchdog started for ${mode} mode`);
          
          console.log(`[A3.R7][Startup] ✅ All services initialized for ${mode} (engine active=true)`);
          console.log(`[A3.R7][RTB] TTL logic → conditional expiry mode (≥4 missed refreshes)`);
        } else {
          console.log(`[A3.R7][Startup] ${mode} engine is inactive, skipping timer initialization`);
        }
      } catch (err) {
        console.error(`[A3.R7][Startup] Error checking ${mode} mode:`, err);
      }
    }

    bootstrapped = true;
    console.log('[A3.R7][Startup] Trading services bootstrap complete');
    console.log(`[A3.R7][Startup] Central Clock tick: ${centralClock.getTickNumber()}`);
    
  } catch (error) {
    console.error('[A3.R7][Startup] Failed to bootstrap trading services:', error);
  }
}

/**
 * Check if trading services have been bootstrapped
 */
export function isTradingBootstrapped(): boolean {
  return bootstrapped;
}
