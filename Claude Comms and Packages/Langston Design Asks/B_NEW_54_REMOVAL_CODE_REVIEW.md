# B-NEW-54 — Step 4 CODE REVIEW: retire the legacy ML predictive microservice

**For Langston. Code-level review of the local commit `72bf79ff2` (NOT pushed — your review gates the push, per workflow Step 4).** You asked at Step-1 to see the boot_orchestrator diff and the drift-detector state-cleanup specifically; both are below.

**INFRASTRUCTURE NOTE:** do NOT cd to /mnt/gdrive or run git on the gdrive mount. Read this file directly (local FS). For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'` (staging is one commit behind — at 37cca85c1 — until this pushes).

## Change summary (stat)
```
 .env.example                            |    4 +-
 ecosystem.config.cjs                    |   24 +-
 server/core/boot_orchestrator.ts        |  304 +---   (ML lifecycle stripped, VTS kept)
 server/index.ts                         |    8 +-
 server/routes/health.ts                 |   11 +-
 server/services/drift-detector.ts       |   68 +-    (triggerRecalibration -> no-op)
 server/services/signal-orchestrator.ts  |   27 +-    (fire-and-forget block removed)
 server/services/ml-service-client.ts    |  242 ---   (DELETED)
 services/ml_service.py                  | 1874 ---    (DELETED)
 services/requirements.txt               |    4 ---    (DELETED)
 110 insertions(+), 2519 deletions(-)
```
(The 3 DELETED files are not embedded below — they are full removals; the diff below covers the 7 edited files.)

## Your 5 Step-2 musts — how each landed
1. **Env readers:** `ML_SERVICE_*` read only in boot_orchestrator + the deleted client. None orphaned. Removed from `.env.example` too.
2. **Freeze controller:** `getRetrainingFreezeController` import removed from drift-detector; `retraining-freeze-controller.ts` LEFT IN PLACE (now orphaned) → Phase-16 register.
3. **Recalibration latch:** `triggerRecalibration` short-circuits at the very top (logs + emits `recalibration_skipped` + returns) BEFORE touching `recalibrationInProgress` → no `recalibrationPending`/`isRecalibrating` latch. No external subscriber to the old events (only `vts.ts:499 forceRecalibration`, which now returns true after the skip-log).
4. **MLServiceStatus / isMLReady / isDegraded:** all internal — removed cleanly; not imported anywhere else.
5. **vts_calibration.json:** PRESERVED. Its writer is `server/utils/calibration.ts` (TS), read live by health + drift — NOT an ML-helper artifact. Staging cleanup removes only `models/*.pkl` + `model_versions.json` + the venvs.

## Verification (C:\dev bench)
- **tsc baseline gate: PASS** — current 475 errors vs baseline 494, NO regressions above baseline; one signal-orchestrator TS2353 error fixed by the removal.
- **vitest: identical to clean baseline** — 12 failed / 1626 passed / 140 skipped WITH my changes == same tally on the reverted clean tree. Zero failures added. (The 12 are pre-existing fragile integration/regime tests, unrelated.)
- boot_orchestrator keeps the degraded-mode-first try/catch (VTS init errors logged, never hard-stop boot).

## Cutover plan (Step 6, after your approval + CI green)
1. Deploy de-ML build (git pull -> build -> pm2 restart dawntrader); boot log shows VTS init, no `[ML_SERVICE]`.
2. `pm2 delete ml-service` (the LIVE name) -> `pm2 save`. Verify `grep -c ml-service ~/.pm2/dump.pm2`=0 AND `grep -c dawntrader-ml`=0.
3. Remove `ML_SERVICE_*` from staging `.env`. Cleanup `/opt/ml-venv` + in-repo `ml_venv` + `models/*.pkl` + `model_versions.json` (KEEP `logs/vts_calibration.json`). `pgrep -f ml_service.py`=0.

## ASK
Code-level review of the diff below. Approve to push, or flag anything (esp. boot_orchestrator VTS-preservation + the drift-detector no-op). Active trading is OFF.

---
## Full diff — 7 edited files
```diff
diff --git a/.env.example b/.env.example
index dc01e8b57..2a208ec5a 100644
--- a/.env.example
+++ b/.env.example
@@ -48,9 +48,7 @@ COMMIT_SHA=
 # ML SERVICE
 # ===========================================
 
-ML_SERVICE_HOST=http://localhost:5001
-ML_SERVICE_AUTO_START=true
-ML_SERVICE_TRAINING_ENABLED=false
+# (B-NEW-54 2026-06-08: ML_SERVICE_* removed — Python ML microservice retired)
 INTERNAL_SERVICE_KEY=dawntrader-internal-ml-service-key-2025
 
 # ===========================================
diff --git a/ecosystem.config.cjs b/ecosystem.config.cjs
index 5f4c09967..1fe96f2ca 100644
--- a/ecosystem.config.cjs
+++ b/ecosystem.config.cjs
@@ -40,26 +40,8 @@ module.exports = {
       max_restarts: 10,
       min_uptime: '30s',
     },
-    {
-      name: 'dawntrader-ml',
-      script: '/opt/ml-venv/bin/python3',
-      args: 'services/ml_service.py',
-      instances: 1,
-      exec_mode: 'fork',
-      autorestart: true,
-      watch: false,
-      max_memory_restart: '512M',
-      env: {
-        ML_SERVICE_PORT: 5001,
-      },
-      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
-      error_file: '/var/log/dawntrader/ml-error.log',
-      out_file: '/var/log/dawntrader/ml-out.log',
-      merge_logs: true,
-      kill_timeout: 5000,
-      restart_delay: 3000,
-      max_restarts: 5,
-      min_uptime: '10s',
-    },
+    // B-NEW-54 (2026-06-08): the `dawntrader-ml` Python ML microservice app was
+    // REMOVED — the predictive helper was retired (decorative; predictions were
+    // logged-and-discarded). See the B-NEW-54 removal completion report.
   ],
 };
diff --git a/server/core/boot_orchestrator.ts b/server/core/boot_orchestrator.ts
index 48a551704..60b1224dc 100644
--- a/server/core/boot_orchestrator.ts
+++ b/server/core/boot_orchestrator.ts
@@ -1,20 +1,22 @@
 /**
- * Directive 8.8.4-L3: Boot Orchestrator
- * 
- * Manages automatic startup, health checks, and synchronization between
- * Node.js core services and the Python ML microservice.
- * 
+ * Boot Orchestrator (VTS runner bootstrap)
+ *
+ * Initializes the VTS Runner during server startup and manages graceful shutdown.
+ *
+ * B-NEW-54 (2026-06-08): the Python ML predictive microservice was RETIRED. This
+ * orchestrator previously also spawned + health-monitored that helper; all of that
+ * lifecycle code was removed. The helper's promotion/profit predictions were
+ * decorative (fetched fire-and-forget in the signal orchestrator, logged, and
+ * discarded). The planned ML system is a fresh Phase 17/18 design, not a revival.
+ * See governance (SIM §9.1, B-NEW-54 removal completion report).
+ *
  * Startup Sequence:
  * 1. Boot Orchestrator starts
- * 2. Python ML Service spawned and health-checked
- * 3. Price Cache initialized
- * 4. Central Clock started
- * 5. RTB Refresh Service activated
- * 6. FX5 Scanner initialized
+ * 2. Authority Baseline loaded + startup config validated
+ * 3. Pattern recognition warmed + VTS Runner initialized
+ * 4. Autonomous simulation auto-started in passive-learning mode
  */
 
-import { spawn, ChildProcess } from 'child_process';
-import { EventEmitter } from 'events';
 import { initVTSRunner, stopVTSRunner, startAutonomousSimulation } from '../services/vts-runner';
 import { preloadPatternHistory } from './pattern-recognition';
 import { systemConfigService } from '../services/system-config';
@@ -26,32 +28,10 @@ import { SCORE_WEIGHTS } from '../config/score-weights.config';
 // Authoritative per-trade config lives in `module_constants` and is read at
 // use-time by the trailing engine, DSE, etc.
 
-const ML_SERVICE_HOST = process.env.ML_SERVICE_HOST || 'http://localhost:5001';
-const ML_SERVICE_AUTO_START = process.env.ML_SERVICE_AUTO_START !== 'false';
-const HEALTH_CHECK_TIMEOUT = 15000;
-const HEALTH_CHECK_INTERVAL = 1000;
-const MAX_STARTUP_ATTEMPTS = 15;
-
-export interface MLServiceStatus {
-  status: 'STARTING' | 'READY' | 'DEGRADED' | 'FAILED' | 'STOPPED';
-  lastHealthCheck?: Date;
-  error?: string;
-  memoryMB?: number;
-  cpuPercent?: number;
-  modelVersions?: {
-    promotion: string;
-    profit: string;
-  };
-}
-
-class BootOrchestrator extends EventEmitter {
-  private pythonProcess: ChildProcess | null = null;
-  private mlServiceStatus: MLServiceStatus = { status: 'STOPPED' };
+class BootOrchestrator {
   private isShuttingDown = false;
-  private healthCheckInterval: NodeJS.Timeout | null = null;
 
   constructor() {
-    super();
     this.setupShutdownHandlers();
   }
 
@@ -59,19 +39,12 @@ class BootOrchestrator extends EventEmitter {
     const shutdown = async (signal: string) => {
       if (this.isShuttingDown) return;
       this.isShuttingDown = true;
-      
+
       console.log(`[L3][BOOT_ORCHESTRATOR] Received ${signal}, initiating graceful shutdown...`);
-      
+
       stopVTSRunner();
       console.log('[L6][BOOT_ORCHESTRATOR] VTS Runner stopped');
-      
-      await this.stopMLService();
-      
-      if (this.healthCheckInterval) {
-        clearInterval(this.healthCheckInterval);
-        this.healthCheckInterval = null;
-      }
-      
+
       console.log('[L3][BOOT_ORCHESTRATOR] Shutdown complete');
     };
 
@@ -102,37 +75,14 @@ class BootOrchestrator extends EventEmitter {
       console.warn(`[L3][BOOT_ORCHESTRATOR] Startup validation: ${startupValidation.warnings.length} warning(s)`);
     }
 
-    if (!ML_SERVICE_AUTO_START) {
-      console.log('[L3][BOOT_ORCHESTRATOR] ML Service auto-start disabled, running in degraded mode');
-      this.mlServiceStatus = { status: 'DEGRADED', error: 'Auto-start disabled' };
-      return true;
-    }
-
+    // B-NEW-54: ML microservice retired — boot proceeds directly to VTS init.
+    // Degraded-mode-first: VTS init errors are logged, never hard-stop the boot.
     try {
-      const mlReady = await this.startMLService();
-      
-      if (mlReady) {
-        console.log('[L3][BOOT_ORCHESTRATOR][INIT_OK] ML Service ready, proceeding with full initialization');
-        this.startHealthMonitoring();
-        this.emit('ml_ready');
-        
-        await this.initializeVTSWithAutoStart();
-        
-        return true;
-      } else {
-        console.warn('[L3][BOOT_ORCHESTRATOR] ML Service failed to start, running in degraded mode');
-        this.mlServiceStatus = { status: 'DEGRADED', error: 'Failed to start' };
-        this.emit('ml_degraded');
-        
-        await this.initializeVTSWithAutoStart();
-        
-        return true;
-      }
+      await this.initializeVTSWithAutoStart();
+      return true;
     } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       console.error(`[L3][BOOT_ORCHESTRATOR][INIT_FAIL] ${errorMessage}`);
-      this.mlServiceStatus = { status: 'FAILED', error: errorMessage };
-      this.emit('ml_failed', error);
       return true;
     }
   }
@@ -140,21 +90,21 @@ class BootOrchestrator extends EventEmitter {
   private async initializeVTSWithAutoStart(): Promise<void> {
     await preloadPatternHistory(2000);
     console.log('[BOOT][VTS] Pattern recognition engine warmed up');
-    
+
     await initVTSRunner();
     console.log('[L6][BOOT_ORCHESTRATOR] VTS Runner initialized');
-    
+
     try {
       const config = await systemConfigService.getConfig() as Record<string, unknown>;
-      
+
       // Derive passiveLearning: true when neither paper nor live trading is active
       // This matches the runtime derivation logic in REB 2.8.6B
       const paperActive = config?.tradingActive === true || config?.paperTradingActive === true;
       const liveActive = config?.liveTradingActive === true;
       const isPassiveLearning = !paperActive && !liveActive;
-      
+
       console.log(`[BOOT][VTS] State check: paperActive=${paperActive}, liveActive=${liveActive}, passiveLearning=${isPassiveLearning}`);
-      
+
       if (isPassiveLearning) {
         console.log('[BOOT][VTS] Passive learning mode detected, starting autonomous simulation...');
         const result = await startAutonomousSimulation();
@@ -184,206 +134,6 @@ class BootOrchestrator extends EventEmitter {
       }
     }
   }
-
-  private async startMLService(): Promise<boolean> {
-    console.log('[L3][ML_SERVICE] Starting Python ML microservice...');
-    this.mlServiceStatus = { status: 'STARTING' };
-
-    const existingCheck = await this.checkMLHealth();
-    if (existingCheck) {
-      console.log('[L3][ML_SERVICE] ML Service already running');
-      this.mlServiceStatus = { status: 'READY', lastHealthCheck: new Date() };
-      return true;
-    }
-
-    return new Promise((resolve) => {
-      try {
-        this.pythonProcess = spawn('python', ['services/ml_service.py'], {
-          stdio: ['ignore', 'pipe', 'pipe'],
-          env: {
-            ...process.env,
-            ML_SERVICE_PORT: '5001',
-            ML_SERVICE_TRAINING_ENABLED: process.env.ML_SERVICE_TRAINING_ENABLED || 'false'
-          }
-        });
-
-        this.pythonProcess.stdout?.on('data', (data) => {
-          const output = data.toString().trim();
-          if (output) {
-            console.log(`[ML_SERVICE] ${output}`);
-          }
-        });
-
-        this.pythonProcess.stderr?.on('data', (data) => {
-          const output = data.toString().trim();
-          if (output && !output.includes('WARNING')) {
-            console.error(`[ML_SERVICE][ERROR] ${output}`);
-          }
-        });
-
-        this.pythonProcess.on('error', (error) => {
-          console.error(`[L3][ML_SERVICE][SPAWN_ERROR] ${error.message}`);
-          this.mlServiceStatus = { status: 'FAILED', error: error.message };
-          resolve(false);
-        });
-
-        this.pythonProcess.on('exit', (code, signal) => {
-          if (!this.isShuttingDown) {
-            console.log(`[L3][ML_SERVICE] Process exited with code ${code}, signal ${signal}`);
-            this.mlServiceStatus = { status: 'STOPPED' };
-          }
-        });
-
-        this.waitForMLReady().then(resolve);
-      } catch (error) {
-        const errorMessage = error instanceof Error ? error.message : String(error);
-        console.error(`[L3][ML_SERVICE][START_ERROR] ${errorMessage}`);
-        this.mlServiceStatus = { status: 'FAILED', error: errorMessage };
-        resolve(false);
-      }
-    });
-  }
-
-  private async waitForMLReady(): Promise<boolean> {
-    const startTime = Date.now();
-    let attempts = 0;
-
-    while (attempts < MAX_STARTUP_ATTEMPTS) {
-      await this.sleep(HEALTH_CHECK_INTERVAL);
-      attempts++;
-
-      const isHealthy = await this.checkMLHealth();
-      if (isHealthy) {
-        console.log(`[L3][ML_SERVICE][INIT_OK] Ready after ${Date.now() - startTime}ms`);
-        this.mlServiceStatus = { status: 'READY', lastHealthCheck: new Date() };
-        return true;
-      }
-
-      console.log(`[L3][ML_SERVICE] Health check attempt ${attempts}/${MAX_STARTUP_ATTEMPTS}...`);
-    }
-
-    console.error(`[L3][ML_SERVICE][TIMEOUT] Failed to become ready after ${HEALTH_CHECK_TIMEOUT}ms`);
-    return false;
-  }
-
-  private async checkMLHealth(): Promise<boolean> {
-    try {
-      const controller = new AbortController();
-      const timeoutId = setTimeout(() => controller.abort(), 2000);
-
-      const response = await fetch(`${ML_SERVICE_HOST}/health`, {
-        method: 'GET',
-        signal: controller.signal
-      });
-
-      clearTimeout(timeoutId);
-
-      if (response.ok) {
-        const data = await response.json() as { status: string };
-        return data.status === 'READY';
-      }
-      return false;
-    } catch {
-      return false;
-    }
-  }
-
-  private startHealthMonitoring(): void {
-    this.healthCheckInterval = setInterval(async () => {
-      if (this.isShuttingDown) return;
-
-      try {
-        const isHealthy = await this.checkMLHealth();
-        
-        if (isHealthy) {
-          if (this.mlServiceStatus.status !== 'READY') {
-            console.log('[L3][ML_SERVICE] Service recovered');
-            this.mlServiceStatus = { status: 'READY', lastHealthCheck: new Date() };
-            this.emit('ml_ready');
-          } else {
-            this.mlServiceStatus.lastHealthCheck = new Date();
-          }
-
-          await this.updateMLMetrics();
-        } else {
-          if (this.mlServiceStatus.status === 'READY') {
-            console.warn('[L3][ML_SERVICE] Service became unavailable');
-            this.mlServiceStatus = { status: 'DEGRADED', error: 'Health check failed' };
-            this.emit('ml_degraded');
-          }
-        }
-      } catch (error) {
-        console.error('[L3][ML_SERVICE] Health check error:', error);
-      }
-    }, 30000);
-  }
-
-  private async updateMLMetrics(): Promise<void> {
-    try {
-      const response = await fetch(`${ML_SERVICE_HOST}/metrics`, {
-        method: 'GET'
-      });
-
-      if (response.ok) {
-        const metrics = await response.json() as {
-          memory_mb: number;
-          cpu_percent: number;
-          model_versions: { promotion: string; profit: string };
-        };
-        
-        this.mlServiceStatus.memoryMB = metrics.memory_mb;
-        this.mlServiceStatus.cpuPercent = metrics.cpu_percent;
-        this.mlServiceStatus.modelVersions = metrics.model_versions;
-
-        if (metrics.memory_mb > 500) {
-          console.warn(`[L3][ML_SERVICE][MEMORY_WARNING] ${metrics.memory_mb.toFixed(0)}MB (>500MB)`);
-        }
-      }
-    } catch {
-    }
-  }
-
-  async stopMLService(): Promise<void> {
-    if (this.pythonProcess) {
-      console.log('[L3][ML_SERVICE] Sending termination signal...');
-      this.pythonProcess.kill('SIGTERM');
-      
-      await new Promise<void>((resolve) => {
-        const timeout = setTimeout(() => {
-          if (this.pythonProcess) {
-            console.log('[L3][ML_SERVICE] Force killing process...');
-            this.pythonProcess.kill('SIGKILL');
-          }
-          resolve();
-        }, 5000);
-
-        this.pythonProcess!.once('exit', () => {
-          clearTimeout(timeout);
-          resolve();
-        });
-      });
-
-      this.pythonProcess = null;
-      this.mlServiceStatus = { status: 'STOPPED' };
-      console.log('[L3][ML_SERVICE] Stopped');
-    }
-  }
-
-  getStatus(): MLServiceStatus {
-    return { ...this.mlServiceStatus };
-  }
-
-  isMLReady(): boolean {
-    return this.mlServiceStatus.status === 'READY';
-  }
-
-  isDegraded(): boolean {
-    return this.mlServiceStatus.status === 'DEGRADED' || this.mlServiceStatus.status === 'FAILED';
-  }
-
-  private sleep(ms: number): Promise<void> {
-    return new Promise(resolve => setTimeout(resolve, ms));
-  }
 }
 
 export const bootOrchestrator = new BootOrchestrator();
diff --git a/server/index.ts b/server/index.ts
index 19ef7c633..ad9e21cc3 100644
--- a/server/index.ts
+++ b/server/index.ts
@@ -211,13 +211,13 @@ app.use((req, res, next) => {
   }
 
   /**
-   * 8.8.4-L3: Initialize Boot Orchestrator FIRST
-   * Manages Python ML microservice lifecycle and health checks
+   * Initialize Boot Orchestrator (VTS runner bootstrap).
+   * B-NEW-54 (2026-06-08): the Python ML microservice was retired; the
+   * orchestrator now boots the VTS runner only.
    */
   const { bootOrchestrator } = await import('./core/boot_orchestrator.js');
   await bootOrchestrator.initialize();
-  console.log('[8.8.4-L3][INIT_OK] Boot Orchestrator initialized (ML Service: ' + 
-    (bootOrchestrator.isMLReady() ? 'READY' : 'DEGRADED') + ')');
+  console.log('[BOOT_ORCHESTRATOR][INIT_OK] Boot Orchestrator initialized (VTS runner)');
 
   /**
    * Directive 11.4H.6G Task 4: Canonical Drift Detection
diff --git a/server/routes/health.ts b/server/routes/health.ts
index ba2d36b90..a227f3d03 100644
--- a/server/routes/health.ts
+++ b/server/routes/health.ts
@@ -8,7 +8,6 @@
 import { Router } from 'express';
 import { healthMonitor } from '../services/health-monitor.js';
 import { systemHealth } from '../services/system-health.js';
-import { getMLServiceStatus } from '../services/ml-service-client.js';
 import { loadFullCalibration } from '../utils/calibration.js';
 import { computeStrategyWeights, type StrategyWeightsBundle } from '../utils/strategyWeights.js';
 import { computeExposureBias, getOverbiasedStrategies, type ExposureBiasBundle } from '../utils/strategyBias.js';
@@ -210,9 +209,7 @@ healthRouter.get('/', async (req, res) => {
   try {
     const metrics = systemHealth.getMetrics();
     const status = systemHealth.getStatus();
-    
-    const mlStatus = await getMLServiceStatus();
-    
+
     interface StrategyHealth {
       name: string;
       alpha: number;
@@ -351,12 +348,6 @@ healthRouter.get('/', async (req, res) => {
         heapTotal: metrics.heapTotal,
         rss: metrics.rss,
       },
-      mlService: {
-        status: mlStatus.status,
-        cpu: mlStatus.cpuPercent,
-        memoryMB: mlStatus.memoryMB,
-        modelVersions: mlStatus.modelVersions,
-      },
       vts: vtsHealth,
       strategyWeights: strategyWeightsData,
       exposureBias: {
diff --git a/server/services/drift-detector.ts b/server/services/drift-detector.ts
index 1c56084c4..c0bd930de 100644
--- a/server/services/drift-detector.ts
+++ b/server/services/drift-detector.ts
@@ -22,7 +22,6 @@ import fs from 'fs/promises';
 import path from 'path';
 import { loadFullCalibration, type FullCalibration, type CalibrationCoefficients } from '../utils/calibration';
 import { contextBridge } from './context-bridge';
-import { getRetrainingFreezeController } from './retraining-freeze-controller.js';
 
 export interface DriftSnapshot {
   timestamp: string;
@@ -279,65 +278,14 @@ export class DriftDetectorService extends EventEmitter {
   }
 
   private async triggerRecalibration(strategy: string) {
-    if (this.recalibrationInProgress.has(strategy)) {
-      console.log(`[L11][DRIFT] Recalibration already in progress for ${strategy}`);
-      return;
-    }
-
-    const freezeController = getRetrainingFreezeController();
-    if (!freezeController.isRetrainingAllowed()) {
-      console.log(`[L11][DRIFT] Recalibration blocked by freeze controller for ${strategy}`);
-      this.emit('recalibration_frozen', { strategy, reason: 'Retraining freeze active' });
-      return;
-    }
-    
-    this.recalibrationInProgress.add(strategy);
-    
-    const status = this.strategyStatus.get(strategy);
-    if (status) {
-      status.status = 'recalibrating';
-      status.recalibrationPending = true;
-      this.strategyStatus.set(strategy, status);
-    }
-    
-    try {
-      const response = await fetch(`http://localhost:5001/drift/retrain/${strategy}`, {
-        method: 'POST',
-        headers: { 'Content-Type': 'application/json' }
-      });
-      
-      if (response.ok) {
-        const result = await response.json();
-        console.log(`[L11][RECAL_DONE] ${strategy} recalibration complete:`, result);
-        this.emit('recalibration_complete', { strategy, result });
-        
-        const completeStatus = { 
-          ...status!, 
-          status: 'stable' as const,
-          recalibrationPending: false,
-          score: 0
-        };
-        await this.logDriftEvent(strategy, completeStatus, 'recalibration_complete');
-        this.broadcastDriftEvent('complete', strategy, completeStatus);
-      } else {
-        console.error(`[L11][RECAL_FAIL] ${strategy} recalibration failed: ${response.status}`);
-        this.emit('recalibration_failed', { strategy, error: response.statusText });
-      }
-    } catch (error) {
-      console.error(`[L11][RECAL_FAIL] ${strategy} recalibration error:`, error);
-      this.emit('recalibration_failed', { strategy, error });
-    } finally {
-      this.recalibrationInProgress.delete(strategy);
-      
-      const updatedStatus = this.strategyStatus.get(strategy);
-      if (updatedStatus) {
-        updatedStatus.recalibrationPending = false;
-        if (updatedStatus.status === 'recalibrating') {
-          updatedStatus.status = 'stable';
-        }
-        this.strategyStatus.set(strategy, updatedStatus);
-      }
-    }
+    // B-NEW-54 (2026-06-08): the Python ML predictive microservice was RETIRED.
+    // This used to POST to localhost:5001/drift/retrain to retrain the (discarded)
+    // promotion/profit models; that target no longer exists. Short-circuit to a
+    // logged no-op BEFORE touching recalibrationInProgress so the drift status can
+    // never latch on "recalibrating"/recalibrationPending. Drift is still detected,
+    // logged and broadcast; only the retrain ACTION is now a no-op.
+    console.log(`[L11][DRIFT] Recalibration skipped — ML predictive helper retired (B-NEW-54): ${strategy}`);
+    this.emit('recalibration_skipped', { strategy, reason: 'ML predictive helper retired (B-NEW-54)' });
   }
 
   private async logDriftEvent(
diff --git a/server/services/signal-orchestrator.ts b/server/services/signal-orchestrator.ts
index 04c9e7a0d..e9ade2b4f 100644
--- a/server/services/signal-orchestrator.ts
+++ b/server/services/signal-orchestrator.ts
@@ -52,7 +52,6 @@ import { readyToBuyService, type SQESignalInput } from '../core/rtb/ready_to_buy
 import { activeFilterPool } from './active-filter-pool.js';
 import { diagnosticTrace } from '../core/diagnostics/trace_service.js';
 import { dataAggregator } from './data-aggregator.js';
-import { predictPromotion, predictProfit, blendConfidence, type PredictionInput } from './ml-service-client.js';
 import { getWeightSync as getStrategyWeight, computeStrategyWeights } from '../utils/strategyWeights.js';
 import { getExposureMultiplierSync, computeExposureBias, getBiasSummaryForLog } from '../utils/strategyBias.js';
 import { computeNetExpectancyKernel } from '../core/calculations/net-expectancy-kernel.js';
@@ -545,29 +544,9 @@ export class SignalOrchestrator {
       dbsApplied: false,
     });
 
-    // Directive 11.0E: ML-enhanced predictions (non-blocking fire-and-forget)
-    const mlInput: PredictionInput = {
-      symbol: rawSignal.symbol,
-      strategy: strategyId,
-      confidence: extendedMetrics.confidence,
-      riskRatio: extendedMetrics.riskScore,
-      profitTarget: extendedMetrics.profitRate,
-      signalAge: 0,
-      entry: rawSignal.entryPrice,
-      exit: rawSignal.targetPrice,
-      stop: rawSignal.stopPrice,
-    };
-    
-    // Fire-and-forget ML predictions - results logged for learning, don't block pipeline
-    Promise.all([
-      predictPromotion(mlInput),
-      predictProfit(mlInput)
-    ]).then(([promotionResult, profitResult]) => {
-      if (promotionResult.success && profitResult.success) {
-        const blendedConfidence = blendConfidence(extendedMetrics.confidence, promotionResult.probability, 0.6);
-        console.log(`[L3][MODEL_INFER] ${rawSignal.symbol}/${strategyId}: promotion=${promotionResult.probability.toFixed(4)}, profit=${profitResult.predicted_profit.toFixed(4)}, blendedConfidence=${blendedConfidence.toFixed(4)}`);
-      }
-    }).catch(() => {});
+    // B-NEW-54 (2026-06-08): the fire-and-forget ML promotion/profit prediction
+    // block was removed here. The Python ML microservice was retired; its blended
+    // confidence was computed and logged but never consumed by the pipeline.
 
     // Directive 11.0E: Trace raw metrics before SQE evaluation (FinalScore-native)
     diagnosticTrace.traceOrchestrator(

```
