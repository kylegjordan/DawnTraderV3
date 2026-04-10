/**
 * System Health Service
 * Provides system health information for diagnostics and monitoring.
 * Allows checking system status without HTTP/auth overhead.
 */

import { storage } from '../storage';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

export interface SystemHealthStatus {
  backend: string;
  paperTrading: {
    isRunning: boolean;
    sessionId: string | null;
    startedBy: string | null;
    startTime: Date | null;
    type: '48hr' | 'manual' | null;
  };
  database: string;
  goals: {
    live: { count: number; hasGoals: boolean };
    paper: { count: number; hasGoals: boolean };
  };
  frontendConnected: boolean;
  lastSync: string;
  isHealthy: boolean;
}

export class SystemHealthService {
  /**
   * Get comprehensive system health status for AI analysis
   * Used for diagnostics and alerts
   * 
   * Phase 3: Removed userId parameter (single-tenant architecture)
   */
  async getHealthStatus(): Promise<SystemHealthStatus> {
    const healthData: SystemHealthStatus = {
      backend: 'OK',
      paperTrading: {
        isRunning: false,
        sessionId: null,
        startedBy: null,
        startTime: null,
        type: null,
      },
      database: 'OK',
      goals: {
        live: { count: 0, hasGoals: false },
        paper: { count: 0, hasGoals: false },
      },
      frontendConnected: true,
      lastSync: new Date().toISOString(),
      isHealthy: true,
    };

    // Check paper trading status
    try {
      const globalSession = (global as any).getGlobalSession?.() as any;
      if (globalSession) {
        healthData.paperTrading = {
          isRunning: globalSession.isRunning || false,
          sessionId: globalSession.sessionId || null,
          startedBy: globalSession.startedBy || null,
          startTime: globalSession.startTime || null,
          type: globalSession.type || null,
        };
      }
    } catch (error) {
      console.error('[SystemHealth] Error getting paper trading status:', error);
      healthData.isHealthy = false;
    }

    // Check database connectivity
    // Phase 3: Use simple ping query instead of user lookup
    try {
      await db.execute(sql`SELECT 1 AS health_check`);
      healthData.database = 'OK';
    } catch (error) {
      console.error('[SystemHealth] Database check failed:', error);
      healthData.database = 'ERROR';
      healthData.isHealthy = false;
    }

    // Check goals for both modes
    try {
      const liveGoals = await storage.getGoalsLive();
      const paperGoals = await storage.getGoalsPaper();
      healthData.goals = {
        live: { count: liveGoals.length, hasGoals: liveGoals.length > 0 },
        paper: { count: paperGoals.length, hasGoals: paperGoals.length > 0 },
      };
    } catch (error) {
      console.error('[SystemHealth] Error getting goals:', error);
      healthData.isHealthy = false;
    }

    return healthData;
  }

  /**
   * Generate natural language alert message based on health status
   * Used to communicate health issues to users
   */
  generateHealthAlert(health: SystemHealthStatus): string | null {
    const issues: string[] = [];

    if (health.database === 'ERROR') {
      issues.push('The database connection is not working properly.');
    }

    if (!health.paperTrading.isRunning && health.backend === 'OK') {
      // This is normal, not an issue
    }

    if (health.paperTrading.isRunning && !health.paperTrading.sessionId) {
      issues.push('Paper trading is running but the session information is incomplete.');
    }

    if (!health.frontendConnected) {
      issues.push('The frontend appears to be disconnected from the backend.');
    }

    if (health.goals.live.count === 0 && health.goals.paper.count === 0) {
      issues.push('You haven\'t set any trading goals yet. Consider setting some goals to track your progress.');
    }

    if (issues.length === 0) {
      return null; // No issues, system is healthy
    }

    return `I've detected some system issues: ${issues.join(' ')}`;
  }
}

export const systemHealthService = new SystemHealthService();

// ==========================================
// Directive 9.0.C: Pipeline Processing Time Guard
// ==========================================

interface PipelineMetric {
  symbol: string;
  procTimeMs: number;
  timestamp: string;
}

class PipelineTimeGuard {
  private metrics: Map<string, number[]> = new Map();
  private readonly MAX_METRICS_PER_SYMBOL = 100;
  private readonly WARNING_THRESHOLD_MS = 100;
  private logPath = '/tmp/logs/pipeline_metrics_9.0.log';

  constructor() {
    try {
      fs.mkdirSync('/tmp/logs', { recursive: true });
    } catch (e) {
      // Ignore if directory exists
    }
  }

  /**
   * Directive 9.0.C: Track pipeline processing time
   * Logs warning if processing exceeds 100ms
   */
  trackPipelineTime(symbol: string, startTime: number): void {
    const procTime = Date.now() - startTime;
    
    // Store for rolling average
    if (!this.metrics.has(symbol)) {
      this.metrics.set(symbol, []);
    }
    const symbolMetrics = this.metrics.get(symbol)!;
    symbolMetrics.push(procTime);
    
    // Keep only last 100 entries
    if (symbolMetrics.length > this.MAX_METRICS_PER_SYMBOL) {
      symbolMetrics.shift();
    }
    
    // Log warning if exceeds threshold
    if (procTime > this.WARNING_THRESHOLD_MS) {
      console.warn(`[9.0][PROC_TIME] ${symbol} pipeline delay = ${procTime}ms`);
      this.writeLog({ symbol, procTimeMs: procTime, timestamp: new Date().toISOString() });
    }
  }

  /**
   * Get rolling average processing time for a symbol
   */
  getAverageTime(symbol: string): number {
    const metrics = this.metrics.get(symbol);
    if (!metrics || metrics.length === 0) return 0;
    return metrics.reduce((a, b) => a + b, 0) / metrics.length;
  }

  /**
   * Get all pipeline metrics summary
   */
  getSummary(): Record<string, { avg: number; max: number; count: number }> {
    const summary: Record<string, { avg: number; max: number; count: number }> = {};
    
    this.metrics.forEach((times, symbol) => {
      if (times.length > 0) {
        summary[symbol] = {
          avg: times.reduce((a, b) => a + b, 0) / times.length,
          max: Math.max(...times),
          count: times.length
        };
      }
    });
    
    return summary;
  }

  private writeLog(metric: PipelineMetric): void {
    try {
      const line = JSON.stringify(metric) + '\n';
      fs.appendFileSync(this.logPath, line);
    } catch (e) {
      // Ignore file write errors
    }
  }
}

export const pipelineTimeGuard = new PipelineTimeGuard();

/**
 * Directive 9.0.C: Convenience function for tracking pipeline time
 */
export function trackPipelineTime(symbol: string, startTime: number): void {
  pipelineTimeGuard.trackPipelineTime(symbol, startTime);
}
