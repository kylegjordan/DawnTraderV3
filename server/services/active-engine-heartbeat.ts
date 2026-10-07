/**
 * Active-engine heartbeat — the 30-second orphan-manager backstop.
 *
 * ★ NOT THE CENTRAL CLOCK. The Central Clock (`central-clock.ts`, the locked 1-second tick that the
 *   FX5 scanner, the xStock scanner, RTB refresh, the TCL watchdog and the market-event scheduler
 *   subscribe to) never references this module and this module never references it. This is its own
 *   `setInterval` (B-ENGINE-HEARTBEAT-DEAD-PATHS pre-audit §1b).
 *
 * WHAT IT DOES, all of it: every 30 s, if a paper engine manager is mapped in memory but no `running`
 * session row exists, it STOPS that manager and clears it — through `healOrphanManagerQueued`, so it is
 * serialized with every start and stop on the paper operation queue and re-reads the row inside the job.
 *
 * WHAT WAS REMOVED (B-ENGINE-HEARTBEAT-DEAD-PATHS, `#1158` merged into `#521`, 2026-10-06 — archived at
 * `1-system-manual/_archive/deleted-code/active-engine-heartbeat.pre-B-ENGINE-HEARTBEAT-DEAD-PATHS.ts.removed`):
 *   - `checkSession` and `recoverSessions` (+ the boot `recoverSessions(AUTO_RESUME_SIMULATIONS)` call):
 *     dead three ways — they gated on `session.userId` (column dropped in Phase 2C), wrote with the
 *     `paper_x` id where storage keys by row UUID, and started the engine with no starting balance. The
 *     boot call was also a SECOND boot-time path beside `resumeActiveEngines` (the one boot owner since
 *     `#520`); deleting it removes that concurrency hazard by construction — do not re-add it.
 *   - the per-cycle `clusterBus.publish('task_completed', { taskType: 'simulation_heartbeat' })`: 2,880
 *     `cluster_bus_event` rows a day, ~99.99 % of the ACCUMULATED table (269,733 of 269,744 rows on staging, 2026-10-07 — a share of rows, not a rate; the heartbeat wrote ~2,880 a day until B-ENGINE-HEARTBEAT-DEAD-PATHS deployed), read only by the deleted
 *     auto-test harness.
 *   - `getStatus()`: read only by the harness.
 *
 * LIVENESS BOUND (stated, not instrumented — Langston Step 2): a stalled heartbeat costs only a delayed
 * orphan clean-up. The paths that matter clear orphans themselves: the stop path (awaits stop, then clears),
 * the boot reset (`resetActiveEngineService`: stops, then clears) and the start path (`stopAndClearOrphanManager`).
 * Engine-stopped detection lives out of process (B-STAGING-LIVENESS-WATCH).
 */

import { healOrphanManagerQueued } from './active-engine-service';

class ActiveEngineHeartbeatService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
  private isRunning = false;

  /** Start the 30-second backstop. */
  start(): void {
    if (this.isRunning) {
      console.log('[ActiveEngineHeartbeat] Already running');
      return;
    }
    console.log('[ActiveEngineHeartbeat] Starting orphan-manager backstop (interval: 30s)');
    this.isRunning = true;
    void this.runHeartbeatCheck();
    this.heartbeatInterval = setInterval(() => {
      void this.runHeartbeatCheck();
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /** Stop the backstop. */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.isRunning = false;
    console.log('[ActiveEngineHeartbeat] Stopped orphan-manager backstop');
  }

  /** One cycle: the queued orphan heal. Silent unless it acts (the helper logs when it does). */
  async runHeartbeatCheck(): Promise<void> {
    try {
      await healOrphanManagerQueued();
    } catch (error: any) {
      console.error('[ActiveEngineHeartbeat] orphan heal failed:', error?.message ?? error);
    }
  }
}

// Export singleton instance
export const activeEngineHeartbeat = new ActiveEngineHeartbeatService();
