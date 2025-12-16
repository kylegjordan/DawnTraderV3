/**
 * FX5 Health Monitor Service
 * Directive 8.8.4-C.15.A: Monitor FX5 scanner health and auto-recover if timers stop
 * 
 * Features:
 * - Tracks last successful scan time per mode
 * - Detects if scanner stops producing scans
 * - Auto-restarts scanner if stalled beyond threshold
 * - Provides health status for diagnostics
 */

import { fx5Scanner } from './fx5-scanner.js';

const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const MAX_SCAN_AGE_MS = 90 * 1000; // Scanner should produce scan within 90s (3x the 30s interval)

interface HealthState {
  lastPaperScanTime: number | null;
  lastLiveScanTime: number | null;
  recoveryCount: number;
  lastHealthCheck: number | null;
  isHealthy: boolean;
}

class Fx5HealthMonitorService {
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private state: HealthState = {
    lastPaperScanTime: null,
    lastLiveScanTime: null,
    recoveryCount: 0,
    lastHealthCheck: null,
    isHealthy: true,
  };

  /**
   * Record a successful scan completion
   */
  recordScan(mode: 'paper' | 'live'): void {
    const now = Date.now();
    if (mode === 'paper') {
      this.state.lastPaperScanTime = now;
    } else {
      this.state.lastLiveScanTime = now;
    }
    console.log(`[FX5Health] Recorded scan for ${mode} at ${new Date(now).toISOString()}`);
  }

  /**
   * Start the health monitoring loop
   * Note: Does NOT pre-initialize timestamps - they remain null until recordScan() is called
   * This ensures accurate stall detection from the first health check
   */
  start(): void {
    if (this.isMonitoring) {
      console.log('[FX5Health] Already monitoring');
      return;
    }

    this.isMonitoring = true;
    // Don't pre-initialize timestamps - let recordScan() set them after actual scans
    // This prevents false-positive "healthy" reports if initial scan fails
    console.log('[FX5Health] Starting health monitor (interval=60s, threshold=90s)');
    console.log('[FX5Health] Waiting for first scan before reporting healthy...');

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the health monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.isMonitoring = false;
    console.log('[FX5Health] Stopped health monitor');
  }

  /**
   * Perform a health check and auto-recover if needed
   */
  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    this.state.lastHealthCheck = now;

    const paperAge = this.state.lastPaperScanTime ? now - this.state.lastPaperScanTime : Infinity;
    const liveAge = this.state.lastLiveScanTime ? now - this.state.lastLiveScanTime : Infinity;

    const paperStale = paperAge > MAX_SCAN_AGE_MS;
    const liveStale = liveAge > MAX_SCAN_AGE_MS;

    if (paperStale || liveStale) {
      this.state.isHealthy = false;
      console.warn(`[FX5Health] ⚠️ Scanner stale detected:`);
      console.warn(`  Paper: ${paperStale ? 'STALE' : 'OK'} (age=${Math.round(paperAge / 1000)}s)`);
      console.warn(`  Live: ${liveStale ? 'STALE' : 'OK'} (age=${Math.round(liveAge / 1000)}s)`);

      // Attempt recovery
      await this.attemptRecovery();
    } else {
      this.state.isHealthy = true;
      console.log(`[FX5Health] ✅ Scanner healthy (paper=${Math.round(paperAge / 1000)}s, live=${Math.round(liveAge / 1000)}s)`);
    }
  }

  /**
   * Attempt to recover the FX5 scanner
   * Note: Does NOT pre-initialize timestamps after restart - lets recordScan() confirm success
   */
  private async attemptRecovery(): Promise<void> {
    this.state.recoveryCount++;
    console.log(`[FX5Health] 🔄 Attempting recovery #${this.state.recoveryCount}...`);

    try {
      // Stop the scanner first
      fx5Scanner.stop();
      
      // Wait a brief moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Restart it
      await fx5Scanner.start();
      
      // Don't pre-initialize timestamps - let recordScan() confirm actual scan success
      // This ensures recovery is only marked successful when scans actually resume
      console.log(`[FX5Health] ✅ Recovery #${this.state.recoveryCount} initiated - waiting for scan confirmation`);
    } catch (error) {
      console.error(`[FX5Health] ❌ Recovery #${this.state.recoveryCount} failed:`, error);
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): {
    isHealthy: boolean;
    isMonitoring: boolean;
    lastPaperScanAge: number | null;
    lastLiveScanAge: number | null;
    recoveryCount: number;
    lastHealthCheck: string | null;
  } {
    const now = Date.now();
    return {
      isHealthy: this.state.isHealthy,
      isMonitoring: this.isMonitoring,
      lastPaperScanAge: this.state.lastPaperScanTime ? now - this.state.lastPaperScanTime : null,
      lastLiveScanAge: this.state.lastLiveScanTime ? now - this.state.lastLiveScanTime : null,
      recoveryCount: this.state.recoveryCount,
      lastHealthCheck: this.state.lastHealthCheck ? new Date(this.state.lastHealthCheck).toISOString() : null,
    };
  }

  /**
   * Force an immediate health check (for diagnostics)
   */
  async forceHealthCheck(): Promise<ReturnType<typeof this.getHealthStatus>> {
    await this.performHealthCheck();
    return this.getHealthStatus();
  }
}

export const fx5HealthMonitor = new Fx5HealthMonitorService();
