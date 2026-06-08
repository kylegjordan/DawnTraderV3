/**
 * Boot Orchestrator (VTS runner bootstrap)
 *
 * Initializes the VTS Runner during server startup and manages graceful shutdown.
 *
 * B-NEW-54 (2026-06-08): the Python ML predictive microservice was RETIRED. This
 * orchestrator previously also spawned + health-monitored that helper; all of that
 * lifecycle code was removed. The helper's promotion/profit predictions were
 * decorative (fetched fire-and-forget in the signal orchestrator, logged, and
 * discarded). The planned ML system is a fresh Phase 17/18 design, not a revival.
 * See governance (SIM §9.1, B-NEW-54 removal completion report).
 *
 * Startup Sequence:
 * 1. Boot Orchestrator starts
 * 2. Authority Baseline loaded + startup config validated
 * 3. Pattern recognition warmed + VTS Runner initialized
 * 4. Autonomous simulation auto-started in passive-learning mode
 */

import { initVTSRunner, stopVTSRunner, startAutonomousSimulation } from '../services/vts-runner';
import { preloadPatternHistory } from './pattern-recognition';
import { systemConfigService } from '../services/system-config';
import { loadBaseline } from '../config/authority-baseline';
import { validateStartupConfig } from '../config/adjustment-registry';
import { SCORE_WEIGHTS } from '../config/score-weights.config';
// B65.2 (2026-04-23): EXECUTION_CONFIG deleted. Startup validation now
// receives a lightweight snapshot matching the B65.2 seed migration values.
// Authoritative per-trade config lives in `module_constants` and is read at
// use-time by the trailing engine, DSE, etc.

class BootOrchestrator {
  private isShuttingDown = false;

  constructor() {
    this.setupShutdownHandlers();
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log(`[L3][BOOT_ORCHESTRATOR] Received ${signal}, initiating graceful shutdown...`);

      stopVTSRunner();
      console.log('[L6][BOOT_ORCHESTRATOR] VTS Runner stopped');

      console.log('[L3][BOOT_ORCHESTRATOR] Shutdown complete');
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async initialize(): Promise<boolean> {
    console.log('[L3][BOOT_ORCHESTRATOR] Initializing boot sequence...');

    // Batch 58b: Load authority baseline and validate startup config (non-blocking, log-only)
    const baselineResult = loadBaseline();
    if (baselineResult.loaded) {
      console.log(`[L3][BOOT_ORCHESTRATOR] Authority Baseline v${baselineResult.version} loaded`);
    } else {
      console.warn(`[L3][BOOT_ORCHESTRATOR] Authority Baseline not loaded: ${baselineResult.error}`);
    }
    // B65.2: pass seed-matching snapshot since EXECUTION_CONFIG is deleted.
    // validateStartupConfig's MAX_POSITION_RISK sanity-bounds check still works.
    const startupValidation = validateStartupConfig({
      scoreWeights: SCORE_WEIGHTS?.FINAL_SCORE,
      executionConfig: {
        VERSION: 'B65.2',
        MAX_POSITION_RISK: 0.02,
      },
    });
    if (startupValidation.warnings.length > 0) {
      console.warn(`[L3][BOOT_ORCHESTRATOR] Startup validation: ${startupValidation.warnings.length} warning(s)`);
    }

    // B-NEW-54: ML microservice retired — boot proceeds directly to VTS init.
    // Degraded-mode-first: VTS init errors are logged, never hard-stop the boot.
    try {
      await this.initializeVTSWithAutoStart();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[L3][BOOT_ORCHESTRATOR][INIT_FAIL] ${errorMessage}`);
      return true;
    }
  }

  private async initializeVTSWithAutoStart(): Promise<void> {
    await preloadPatternHistory(2000);
    console.log('[BOOT][VTS] Pattern recognition engine warmed up');

    await initVTSRunner();
    console.log('[L6][BOOT_ORCHESTRATOR] VTS Runner initialized');

    try {
      const config = await systemConfigService.getConfig() as Record<string, unknown>;

      // Derive passiveLearning: true when neither paper nor live trading is active
      // This matches the runtime derivation logic in REB 2.8.6B
      const paperActive = config?.tradingActive === true || config?.paperTradingActive === true;
      const liveActive = config?.liveTradingActive === true;
      const isPassiveLearning = !paperActive && !liveActive;

      console.log(`[BOOT][VTS] State check: paperActive=${paperActive}, liveActive=${liveActive}, passiveLearning=${isPassiveLearning}`);

      if (isPassiveLearning) {
        console.log('[BOOT][VTS] Passive learning mode detected, starting autonomous simulation...');
        const result = await startAutonomousSimulation();
        if (result.success) {
          console.log('[BOOT][VTS] Auto-start enabled (passive mode)');
        } else {
          console.warn('[BOOT][VTS] Auto-start failed:', result.message);
        }
      } else {
        console.log('[BOOT][VTS] Trading active, VTS auto-start skipped');
      }
    } catch (error) {
      // Batch 52 Fix 16C: Improved error message — previous "Could not determine passive learning state"
      // was misleading when the actual failure was inside startAutonomousSimulation()
      console.warn('[BOOT][VTS] VTS auto-start failed during boot:', error);
      // Fallback — retry once, assuming passive learning mode (trading is STOPPED)
      console.log('[BOOT][VTS] Retrying autonomous simulation start (assuming passive mode)...');
      try {
        const result = await startAutonomousSimulation();
        if (result.success) {
          console.log('[BOOT][VTS] Auto-start enabled (retry succeeded)');
        } else {
          console.warn('[BOOT][VTS] Auto-start retry failed:', result.message);
        }
      } catch (fallbackError) {
        console.error('[BOOT][VTS] Auto-start retry error:', fallbackError);
      }
    }
  }
}

export const bootOrchestrator = new BootOrchestrator();
