/**
 * 🔒 LOCKED MODULE — DO NOT MODIFY
 * Directive: 8.8.4-A4.R10R-4 (Core System Hardening)
 * Owner: Dawn Trader Core
 * Summary: System health monitor for real-time metrics.
 * 
 * Provides:
 * - CPU load monitoring
 * - Memory usage tracking
 * - Event loop lag detection
 * - Process uptime
 */

import os from 'os';
import { EventEmitter } from 'events';

declare global {
  var __eventLoopLag: number | undefined;
}

export interface HealthMetrics {
  cpu: number;
  memory: number;
  lag: number;
  uptime: number;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  timestamp: number;
}

class SystemHealth extends EventEmitter {
  private metrics: HealthMetrics = {
    cpu: 0,
    memory: 0,
    lag: 0,
    uptime: 0,
    heapUsed: 0,
    heapTotal: 0,
    rss: 0,
    timestamp: Date.now()
  };
  
  private sampleInterval: NodeJS.Timeout | null = null;
  private lagCheckInterval: NodeJS.Timeout | null = null;
  private lastLagCheck: number = Date.now();
  private isRunning: boolean = false;

  constructor() {
    super();
    this.setMaxListeners(20);
  }

  start(): void {
    if (this.isRunning) {
      console.log('[A4.R10R-4][SystemHealth] Already running');
      return;
    }

    this.isRunning = true;
    
    this.sampleInterval = setInterval(() => {
      this.sample();
    }, 10000);

    this.lagCheckInterval = setInterval(() => {
      const now = Date.now();
      const expectedInterval = 100;
      const actualInterval = now - this.lastLagCheck;
      const lag = Math.max(0, actualInterval - expectedInterval);
      global.__eventLoopLag = lag;
      this.lastLagCheck = now;
    }, 100);

    console.log('[A4.R10R-4][SystemHealth][INIT_OK] Health monitor started (interval=10s)');
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.sampleInterval) {
      clearInterval(this.sampleInterval);
      this.sampleInterval = null;
    }

    if (this.lagCheckInterval) {
      clearInterval(this.lagCheckInterval);
      this.lagCheckInterval = null;
    }

    this.isRunning = false;
    console.log('[A4.R10R-4][SystemHealth] Health monitor stopped');
  }

  private sample(): void {
    const load = os.loadavg()[0];
    const memInfo = process.memoryUsage();
    const mem = memInfo.rss / 1024 / 1024;
    const uptime = process.uptime();
    
    this.metrics = {
      cpu: Math.round(load * 100) / 100,
      memory: Math.round(mem * 100) / 100,
      lag: global.__eventLoopLag || 0,
      uptime: Math.round(uptime),
      heapUsed: Math.round(memInfo.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(memInfo.heapTotal / 1024 / 1024 * 100) / 100,
      rss: Math.round(mem * 100) / 100,
      timestamp: Date.now()
    };
    
    this.emit('update', this.metrics);
  }

  getMetrics(): HealthMetrics {
    return { ...this.metrics };
  }

  isHealthy(): boolean {
    return this.metrics.memory < 350 && 
           this.metrics.lag < 10 && 
           this.isRunning;
  }

  getStatus(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (this.metrics.memory > 350) {
      issues.push(`High memory usage: ${this.metrics.memory}MB (threshold: 350MB)`);
    }
    
    if (this.metrics.lag > 10) {
      issues.push(`High event loop lag: ${this.metrics.lag}ms (threshold: 10ms)`);
    }
    
    if (this.metrics.cpu > 2) {
      issues.push(`High CPU load: ${this.metrics.cpu} (threshold: 2.0)`);
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }
}

export const systemHealth = new SystemHealth();
