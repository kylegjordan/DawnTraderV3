/**
 * Directive 8.8.4-A3.R2: Trading Bootstrap - Auto-reinitialize RTB/TCL on Startup
 * 
 * On process boot, checks if trading engine was active (isEngineActive === true)
 * and auto-restarts the refresh cycle and TCL watchdog.
 * 
 * This fixes "engine active but inert" state after server restarts where the
 * database shows isEngineActive=true but the setInterval timers were lost.
 */

import { storage } from '../storage';
import { readyToBuyService } from '../core/rtb/ready_to_buy_service';
import { tclWatchdog } from '../core/rtb/tcl_watchdog';
import type { TradingMode } from '../services/guardrail-policy';

let bootstrapped = false;

/**
 * Bootstrap RTB/TCL services if engine was active before restart
 * Called from server/index.ts after database is ready
 */
export async function bootstrapTradingServices(): Promise<void> {
  if (bootstrapped) {
    console.log('[A3.R2][Startup] Trading services already bootstrapped, skipping');
    return;
  }

  try {
    console.log('[A3.R2][Startup] Checking for active trading sessions...');

    // Check both paper and live modes
    const modes: TradingMode[] = ['paper', 'live'];
    
    for (const mode of modes) {
      try {
        const systemContext = await storage.getSystemContext(mode);
        
        if (systemContext?.isEngineActive) {
          console.log(`[A3.R2][Startup] Found active ${mode} engine, reinitializing services...`);
          
          // Directive 8.8.4-A3.R2 #6: Clean up expired signals on startup
          const expiredCount = await readyToBuyService.cleanupExpiredSignals(mode);
          console.log(`[A3.R2][Startup] Cleaned ${expiredCount} expired signals for ${mode} mode`);
          
          // Start refresh cycle
          readyToBuyService.startRefreshCycle(mode);
          console.log(`[A3.R2][Startup] Refresh cycle started for ${mode} mode`);
          
          // Set engine start time for TCL failsafe
          readyToBuyService.setEngineStartTime(mode);
          console.log(`[A3.R2][Startup] TCL failsafe timer started for ${mode} mode`);
          
          // Start TCL watchdog
          tclWatchdog.start(mode);
          console.log(`[A3.R2][Startup] TCL watchdog started for ${mode} mode`);
          
          console.log(`[A3.R2][Startup] ✅ Refresh/TCL timers initialized for ${mode} (engine active=true)`);
          console.log(`[A3.R2][RTB] TTL logic → conditional expiry mode (≥4 missed refreshes)`);
        } else {
          console.log(`[A3.R2][Startup] ${mode} engine is inactive, skipping timer initialization`);
        }
      } catch (err) {
        console.error(`[A3.R2][Startup] Error checking ${mode} mode:`, err);
      }
    }

    bootstrapped = true;
    console.log('[A3.R2][Startup] Trading services bootstrap complete');
    
  } catch (error) {
    console.error('[A3.R2][Startup] Failed to bootstrap trading services:', error);
    // Don't throw - allow server startup to continue
  }
}

/**
 * Check if trading services have been bootstrapped
 */
export function isTradingBootstrapped(): boolean {
  return bootstrapped;
}
