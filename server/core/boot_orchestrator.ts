/**
 * Directive 8.8.4-L3: Boot Orchestrator
 * 
 * Manages automatic startup, health checks, and synchronization between
 * Node.js core services and the Python ML microservice.
 * 
 * Startup Sequence:
 * 1. Boot Orchestrator starts
 * 2. Python ML Service spawned and health-checked
 * 3. Price Cache initialized
 * 4. Central Clock started
 * 5. RTB Refresh Service activated
 * 6. FX5 Scanner initialized
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { initVTSRunner, stopVTSRunner, startAutonomousSimulation } from '../services/vts-runner';
import { preloadPatternHistory } from './pattern-recognition';
import { systemConfigService } from '../services/system-config';

const ML_SERVICE_HOST = process.env.ML_SERVICE_HOST || 'http://localhost:5001';
const ML_SERVICE_AUTO_START = process.env.ML_SERVICE_AUTO_START !== 'false';
const HEALTH_CHECK_TIMEOUT = 15000;
const HEALTH_CHECK_INTERVAL = 1000;
const MAX_STARTUP_ATTEMPTS = 15;

export interface MLServiceStatus {
  status: 'STARTING' | 'READY' | 'DEGRADED' | 'FAILED' | 'STOPPED';
  lastHealthCheck?: Date;
  error?: string;
  memoryMB?: number;
  cpuPercent?: number;
  modelVersions?: {
    promotion: string;
    profit: string;
  };
}

class BootOrchestrator extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  private mlServiceStatus: MLServiceStatus = { status: 'STOPPED' };
  private isShuttingDown = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.setupShutdownHandlers();
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      
      console.log(`[L3][BOOT_ORCHESTRATOR] Received ${signal}, initiating graceful shutdown...`);
      
      stopVTSRunner();
      console.log('[L6][BOOT_ORCHESTRATOR] VTS Runner stopped');
      
      await this.stopMLService();
      
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }
      
      console.log('[L3][BOOT_ORCHESTRATOR] Shutdown complete');
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  async initialize(): Promise<boolean> {
    console.log('[L3][BOOT_ORCHESTRATOR] Initializing boot sequence...');
    
    if (!ML_SERVICE_AUTO_START) {
      console.log('[L3][BOOT_ORCHESTRATOR] ML Service auto-start disabled, running in degraded mode');
      this.mlServiceStatus = { status: 'DEGRADED', error: 'Auto-start disabled' };
      return true;
    }

    try {
      const mlReady = await this.startMLService();
      
      if (mlReady) {
        console.log('[L3][BOOT_ORCHESTRATOR][INIT_OK] ML Service ready, proceeding with full initialization');
        this.startHealthMonitoring();
        this.emit('ml_ready');
        
        await this.initializeVTSWithAutoStart();
        
        return true;
      } else {
        console.warn('[L3][BOOT_ORCHESTRATOR] ML Service failed to start, running in degraded mode');
        this.mlServiceStatus = { status: 'DEGRADED', error: 'Failed to start' };
        this.emit('ml_degraded');
        
        await this.initializeVTSWithAutoStart();
        
        return true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[L3][BOOT_ORCHESTRATOR][INIT_FAIL] ${errorMessage}`);
      this.mlServiceStatus = { status: 'FAILED', error: errorMessage };
      this.emit('ml_failed', error);
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
      console.warn('[BOOT][VTS] Could not determine passive learning state:', error);
      // Batch 52: Fallback — start autonomous simulation anyway since trading is STOPPED
      console.log('[BOOT][VTS] Falling back to passive learning mode (config check failed, assuming passive)');
      try {
        const result = await startAutonomousSimulation();
        if (result.success) {
          console.log('[BOOT][VTS] Auto-start enabled (fallback passive mode)');
        } else {
          console.warn('[BOOT][VTS] Auto-start fallback failed:', result.message);
        }
      } catch (fallbackError) {
        console.error('[BOOT][VTS] Auto-start fallback error:', fallbackError);
      }
    }
  }

  private async startMLService(): Promise<boolean> {
    console.log('[L3][ML_SERVICE] Starting Python ML microservice...');
    this.mlServiceStatus = { status: 'STARTING' };

    const existingCheck = await this.checkMLHealth();
    if (existingCheck) {
      console.log('[L3][ML_SERVICE] ML Service already running');
      this.mlServiceStatus = { status: 'READY', lastHealthCheck: new Date() };
      return true;
    }

    return new Promise((resolve) => {
      try {
        this.pythonProcess = spawn('python', ['services/ml_service.py'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            ML_SERVICE_PORT: '5001',
            ML_SERVICE_TRAINING_ENABLED: process.env.ML_SERVICE_TRAINING_ENABLED || 'false'
          }
        });

        this.pythonProcess.stdout?.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            console.log(`[ML_SERVICE] ${output}`);
          }
        });

        this.pythonProcess.stderr?.on('data', (data) => {
          const output = data.toString().trim();
          if (output && !output.includes('WARNING')) {
            console.error(`[ML_SERVICE][ERROR] ${output}`);
          }
        });

        this.pythonProcess.on('error', (error) => {
          console.error(`[L3][ML_SERVICE][SPAWN_ERROR] ${error.message}`);
          this.mlServiceStatus = { status: 'FAILED', error: error.message };
          resolve(false);
        });

        this.pythonProcess.on('exit', (code, signal) => {
          if (!this.isShuttingDown) {
            console.log(`[L3][ML_SERVICE] Process exited with code ${code}, signal ${signal}`);
            this.mlServiceStatus = { status: 'STOPPED' };
          }
        });

        this.waitForMLReady().then(resolve);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[L3][ML_SERVICE][START_ERROR] ${errorMessage}`);
        this.mlServiceStatus = { status: 'FAILED', error: errorMessage };
        resolve(false);
      }
    });
  }

  private async waitForMLReady(): Promise<boolean> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < MAX_STARTUP_ATTEMPTS) {
      await this.sleep(HEALTH_CHECK_INTERVAL);
      attempts++;

      const isHealthy = await this.checkMLHealth();
      if (isHealthy) {
        console.log(`[L3][ML_SERVICE][INIT_OK] Ready after ${Date.now() - startTime}ms`);
        this.mlServiceStatus = { status: 'READY', lastHealthCheck: new Date() };
        return true;
      }

      console.log(`[L3][ML_SERVICE] Health check attempt ${attempts}/${MAX_STARTUP_ATTEMPTS}...`);
    }

    console.error(`[L3][ML_SERVICE][TIMEOUT] Failed to become ready after ${HEALTH_CHECK_TIMEOUT}ms`);
    return false;
  }

  private async checkMLHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${ML_SERVICE_HOST}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as { status: string };
        return data.status === 'READY';
      }
      return false;
    } catch {
      return false;
    }
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        const isHealthy = await this.checkMLHealth();
        
        if (isHealthy) {
          if (this.mlServiceStatus.status !== 'READY') {
            console.log('[L3][ML_SERVICE] Service recovered');
            this.mlServiceStatus = { status: 'READY', lastHealthCheck: new Date() };
            this.emit('ml_ready');
          } else {
            this.mlServiceStatus.lastHealthCheck = new Date();
          }

          await this.updateMLMetrics();
        } else {
          if (this.mlServiceStatus.status === 'READY') {
            console.warn('[L3][ML_SERVICE] Service became unavailable');
            this.mlServiceStatus = { status: 'DEGRADED', error: 'Health check failed' };
            this.emit('ml_degraded');
          }
        }
      } catch (error) {
        console.error('[L3][ML_SERVICE] Health check error:', error);
      }
    }, 30000);
  }

  private async updateMLMetrics(): Promise<void> {
    try {
      const response = await fetch(`${ML_SERVICE_HOST}/metrics`, {
        method: 'GET'
      });

      if (response.ok) {
        const metrics = await response.json() as {
          memory_mb: number;
          cpu_percent: number;
          model_versions: { promotion: string; profit: string };
        };
        
        this.mlServiceStatus.memoryMB = metrics.memory_mb;
        this.mlServiceStatus.cpuPercent = metrics.cpu_percent;
        this.mlServiceStatus.modelVersions = metrics.model_versions;

        if (metrics.memory_mb > 500) {
          console.warn(`[L3][ML_SERVICE][MEMORY_WARNING] ${metrics.memory_mb.toFixed(0)}MB (>500MB)`);
        }
      }
    } catch {
    }
  }

  async stopMLService(): Promise<void> {
    if (this.pythonProcess) {
      console.log('[L3][ML_SERVICE] Sending termination signal...');
      this.pythonProcess.kill('SIGTERM');
      
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.pythonProcess) {
            console.log('[L3][ML_SERVICE] Force killing process...');
            this.pythonProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.pythonProcess!.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.pythonProcess = null;
      this.mlServiceStatus = { status: 'STOPPED' };
      console.log('[L3][ML_SERVICE] Stopped');
    }
  }

  getStatus(): MLServiceStatus {
    return { ...this.mlServiceStatus };
  }

  isMLReady(): boolean {
    return this.mlServiceStatus.status === 'READY';
  }

  isDegraded(): boolean {
    return this.mlServiceStatus.status === 'DEGRADED' || this.mlServiceStatus.status === 'FAILED';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const bootOrchestrator = new BootOrchestrator();
