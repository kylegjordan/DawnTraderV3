/**
 * MetricsBob - Phase 7.2 Module #1
 * 
 * Handles system health and analytics for dashboard and Walter
 * Provides parallel fetching and caching for performance-critical metrics
 */

import { bobCore, FetchContext } from './bob-core';
import { systemHealthService } from './system-health-service';
import { systemHealthMonitor } from './system-health-monitor';
import { provenanceLogger } from './provenance-logger'; // Phase 8.6.4: BoB deep-trace

/**
 * MetricsBob Module
 * Owns: system health, paper-sim status, basic analytics
 */
class MetricsBobModule {
  private readonly MODULE_NAME = 'MetricsBob';

  constructor() {
    this.registerWithBobCore();
  }

  /**
   * Register this module's fetch functions with Bob Core
   */
  private registerWithBobCore() {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();

    fetchFunctions.set('systemHealth', this.fetchSystemHealth.bind(this));
    fetchFunctions.set('paperSimStatus', this.fetchPaperSimStatus.bind(this));
    fetchFunctions.set('systemHealthMetrics', this.fetchSystemHealthMetrics.bind(this));

    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  /**
   * Fetch system health data
   * Mirrors /api/system/health endpoint
   * Requires userId for goals/database checks
   */
  private async fetchSystemHealth(context: FetchContext & { traceId?: string }): Promise<any> {
    const startTime = Date.now();
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching system health (mode: ${context.mode})${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      // Use a default userId if not provided (for system-wide health)
      const userId = context.userId || '00000000-0000-0000-0000-000000000000';
      const health = await systemHealthService.getHealthStatus(userId);
      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchSystemHealth',
          sourceTable: 'system_health_metrics',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: 1,
          metadata: { userId, health: health }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ System health fetched in ${duration}ms`);
      return health;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ System health fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch paper simulation status
   * Mirrors /api/paper-sim/status endpoint
   */
  private async fetchPaperSimStatus(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching paper-sim status${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      // Use global session tracking (same as /api/paper-sim/status endpoint)
      const globalSession = (global as any).getGlobalSession?.() as any;
      const isRunning = !!(globalSession && globalSession.isRunning);
      
      const sessionInfo = globalSession ? {
        sessionId: globalSession.sessionId,
        startTime: globalSession.startTime,
        type: globalSession.type,
        startedBy: globalSession.startedBy
      } : null;

      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchPaperSimStatus',
          sourceTable: 'global_session',
          mode: 'paper',
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: 1,
          metadata: { isRunning, sessionInfo }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ Paper-sim status fetched in ${duration}ms`);
      
      return { isRunning, sessionInfo };
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Paper-sim status fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch detailed system health metrics from SystemHealthMonitor
   * Phase 8.3 - System Health & Diagnostic Intelligence
   */
  private async fetchSystemHealthMetrics(context: FetchContext): Promise<any> {
    const startTime = Date.now();
    console.log(`[${this.MODULE_NAME}] 🔍 Fetching system health metrics${context.traceId ? ` [trace: ${context.traceId.substring(0, 12)}...]` : ''}`);

    try {
      const healthStatus = systemHealthMonitor.analyzeHealth();
      const duration = Date.now() - startTime;
      
      // Phase 8.6.4: BoB deep-trace logging
      if (context.traceId) {
        await provenanceLogger.logBobTrace({
          traceId: context.traceId,
          bobModule: this.MODULE_NAME,
          operation: 'fetchSystemHealthMetrics',
          sourceTable: 'system_health_monitor',
          mode: context.mode,
          globalContextId: 'default',
          cacheHit: false,
          executionTimeMs: duration,
          rowCount: 1,
          metadata: { status: healthStatus.status }
        });
      }
      
      console.log(`[${this.MODULE_NAME}] ✅ System health metrics fetched in ${duration}ms (status: ${healthStatus.status})`);
      return healthStatus;
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ System health metrics fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get system health with caching
   * Public API for routes to use
   */
  async getSystemHealth(mode: 'live' | 'paper' = 'live', ttl?: number): Promise<any> {
    const key = `metrics:systemHealth:${mode}`;
    const context: FetchContext = { mode };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchSystemHealth(context),
      ttl,
      context,
      ['metrics', 'health', mode]
    );
  }

  /**
   * Get paper simulation status with caching
   * Public API for routes to use
   */
  async getPaperSimStatus(ttl?: number): Promise<any> {
    const key = `metrics:paperSimStatus`;
    const context: FetchContext = { mode: 'paper' };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchPaperSimStatus(context),
      ttl,
      context,
      ['metrics', 'paperSim', 'paper']
    );
  }

  /**
   * Get detailed system health metrics with caching
   * Public API for routes to use (Phase 8.3)
   */
  async getSystemHealthMetrics(ttl: number = 5): Promise<any> {
    const key = `metrics:systemHealthMonitor`;
    const context: FetchContext = { mode: 'live' };

    return await bobCore.fetchOrServe(
      key,
      () => this.fetchSystemHealthMetrics(context),
      ttl,
      context,
      ['metrics', 'healthMonitor']
    );
  }

  /**
   * Fetch multiple metrics in parallel
   * Used by dashboard and Walter for faster responses
   */
  async fetchParallel(
    metrics: Array<'systemHealth' | 'paperSimStatus'>,
    mode: 'live' | 'paper' = 'live',
    ttl?: number
  ): Promise<Record<string, any>> {
    console.log(`[${this.MODULE_NAME}] 🚀 Parallel fetch: ${metrics.join(', ')} (mode: ${mode})`);
    const startTime = Date.now();

    const promises: Record<string, Promise<any>> = {};

    if (metrics.includes('systemHealth')) {
      promises.systemHealth = this.getSystemHealth(mode, ttl);
    }

    if (metrics.includes('paperSimStatus')) {
      promises.paperSimStatus = this.getPaperSimStatus(ttl);
    }

    try {
      const results = await Promise.all(
        Object.entries(promises).map(async ([key, promise]) => {
          const value = await promise;
          return [key, value];
        })
      );

      const duration = Date.now() - startTime;
      console.log(`[${this.MODULE_NAME}] ✅ Parallel fetch complete in ${duration}ms`);

      return Object.fromEntries(results);
    } catch (error: any) {
      console.error(`[${this.MODULE_NAME}] ❌ Parallel fetch failed:`, error.message);
      throw error;
    }
  }

  /**
   * Prefetch metrics for a specific mode
   * Called on app start, Walter chat mount, or mode change
   */
  async prefetchForMode(mode: 'live' | 'paper', ttl?: number): Promise<void> {
    console.log(`[${this.MODULE_NAME}] 🔄 Prefetching metrics for ${mode} mode`);

    const prefetches = [
      bobCore.prefetch(
        `metrics:systemHealth:${mode}`,
        () => this.fetchSystemHealth({ mode }),
        ttl,
        { mode },
        ['metrics', 'health', mode]
      ),
      bobCore.prefetch(
        `metrics:paperSimStatus`,
        () => this.fetchPaperSimStatus({ mode: 'paper' }),
        ttl,
        { mode: 'paper' },
        ['metrics', 'paperSim', 'paper']
      )
    ];

    await Promise.allSettled(prefetches);
    console.log(`[${this.MODULE_NAME}] ✅ Prefetch complete for ${mode} mode`);
  }

  /**
   * Invalidate metrics cache for a specific mode
   */
  invalidateMode(mode: 'live' | 'paper') {
    console.log(`[${this.MODULE_NAME}] 🗑️ Invalidating cache for ${mode} mode`);
    bobCore.invalidate(`metrics:systemHealth:${mode}`);
    
    if (mode === 'paper') {
      bobCore.invalidate(`metrics:paperSimStatus`);
    }
  }
}

// Export singleton instance
export const metricsBob = new MetricsBobModule();
