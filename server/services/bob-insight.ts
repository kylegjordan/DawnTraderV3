import { bobCore, type FetchContext } from './bob-core';

/**
 * InsightBob - System Introspection & Meta-Information Module (Phase 7.7)
 * 
 * Provides Walter with awareness of:
 * - Bob module health and cache states
 * - Recent system changes and updates
 * - Module freshness and staleness
 * - Overall system performance metrics
 * 
 * Enables queries like:
 * - "What changed since my last session?"
 * - "Which modules are out of date?"
 * - "What's the current system health?"
 */

interface ModuleInsight {
  name: string;
  lastUpdate: string;
  stale: boolean;
  hitRate: string;
  cacheSize: number;
  ttl: number;
}

interface InsightSummary {
  timestamp: string;
  modules: Record<string, ModuleInsight>;
  overallStats: {
    modulesActive: number;
    totalCacheSize: number;
    overallHitRate: string;
    totalHits: number;
    totalMisses: number;
  };
  recentChanges: string[];
  systemHealth: 'healthy' | 'degraded' | 'critical';
}

class InsightBob {
  private readonly MODULE_NAME = 'InsightBob';
  private readonly ENABLED = process.env.BOB_INSIGHT_ENABLED !== 'false';
  private readonly STALE_THRESHOLD_SECONDS = 60; // Consider stale after 60s
  
  // Track recent changes/events
  private recentChanges: Array<{ timestamp: number; message: string }> = [];
  private readonly MAX_CHANGES = 20;

  constructor() {
    console.log(`[${this.MODULE_NAME}] Constructor called - ENABLED: ${this.ENABLED}`);
    if (this.ENABLED) {
      this.registerWithBobCore();
      console.log(`[${this.MODULE_NAME}] ✅ Initialized - System introspection ready`);
    } else {
      console.log(`[${this.MODULE_NAME}] ⚠️ Disabled by BOB_INSIGHT_ENABLED flag`);
    }
  }

  isEnabled(): boolean {
    return this.ENABLED;
  }

  private registerWithBobCore(): void {
    const fetchFunctions = new Map<string, (context: FetchContext) => Promise<any>>();
    
    fetchFunctions.set('insightSummary', this.fetchInsightSummary.bind(this));
    
    bobCore.registerModule(this.MODULE_NAME, fetchFunctions);
  }

  // ========================================
  // FETCH FUNCTIONS
  // ========================================

  /**
   * Fetch comprehensive system insight summary
   */
  private async fetchInsightSummary(context: FetchContext): Promise<InsightSummary> {
    console.log(`[${this.MODULE_NAME}] 🔍 Generating insight summary`);
    
    const start = Date.now();
    const bobStats = bobCore.getStats();
    const now = Date.now();
    
    // Get module-specific insights
    const modules: Record<string, ModuleInsight> = {};
    const moduleNames = ['MetricsBob', 'DataBob', 'ConfigBob', 'StrategyBob', 'TradeBob'];
    
    for (const moduleName of moduleNames) {
      const module = bobCore.getModule(moduleName);
      if (module) {
        const moduleStats = this.getModuleStats(moduleName);
        modules[moduleName] = {
          name: moduleName,
          lastUpdate: moduleStats.lastUpdate,
          stale: moduleStats.stale,
          hitRate: moduleStats.hitRate,
          cacheSize: moduleStats.cacheSize,
          ttl: moduleStats.ttl
        };
      }
    }

    // Calculate overall stats
    const overallStats = {
      modulesActive: Object.keys(modules).length,
      totalCacheSize: bobStats.cacheSize,
      overallHitRate: bobStats.stats.hitRatio,
      totalHits: bobStats.stats.hits,
      totalMisses: bobStats.stats.misses
    };

    // Determine system health
    const systemHealth = this.calculateSystemHealth(modules, overallStats);

    // Get recent changes
    const recentChanges = this.getRecentChanges();

    const summary: InsightSummary = {
      timestamp: new Date().toISOString(),
      modules,
      overallStats,
      recentChanges,
      systemHealth
    };

    const duration = Date.now() - start;
    console.log(`[${this.MODULE_NAME}] ✅ Insight summary generated in ${duration}ms`);
    
    return summary;
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Get stats for a specific module
   */
  private getModuleStats(moduleName: string): {
    lastUpdate: string;
    stale: boolean;
    hitRate: string;
    cacheSize: number;
    ttl: number;
  } {
    const bobStats = bobCore.getStats();
    const now = Date.now();
    
    // Get last update from cache entries (simplified - in production would track per module)
    const lastUpdate = new Date().toISOString(); // Placeholder
    const stale = false; // Placeholder - would check actual cache timestamps
    
    return {
      lastUpdate,
      stale,
      hitRate: bobStats.stats.hitRatio,
      cacheSize: bobStats.cacheSize,
      ttl: bobStats.config.ttl
    };
  }

  /**
   * Calculate overall system health based on module states
   */
  private calculateSystemHealth(
    modules: Record<string, ModuleInsight>,
    stats: { overallHitRate: string; modulesActive: number }
  ): 'healthy' | 'degraded' | 'critical' {
    const hitRate = parseFloat(stats.overallHitRate);
    const staleCount = Object.values(modules).filter(m => m.stale).length;
    const totalModules = Object.keys(modules).length;
    
    // Critical: More than 50% stale or hit rate below 30%
    if (staleCount > totalModules / 2 || hitRate < 30) {
      return 'critical';
    }
    
    // Degraded: Any stale modules or hit rate below 60%
    if (staleCount > 0 || hitRate < 60) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Get recent system changes
   */
  private getRecentChanges(): string[] {
    const cutoff = Date.now() - (5 * 60 * 1000); // Last 5 minutes
    return this.recentChanges
      .filter(change => change.timestamp > cutoff)
      .map(change => change.message);
  }

  // ========================================
  // PUBLIC API
  // ========================================

  /**
   * Get insight summary (used by routes)
   */
  async getInsightSummary(): Promise<InsightSummary> {
    if (!this.ENABLED) {
      return this.getEmptyInsightSummary();
    }

    return this.fetchInsightSummary({ mode: 'live' }); // Mode-agnostic for system insights
  }

  /**
   * Log a system change/event
   */
  logChange(message: string): void {
    if (!this.ENABLED) return;
    
    this.recentChanges.push({
      timestamp: Date.now(),
      message
    });
    
    // Keep only recent changes
    if (this.recentChanges.length > this.MAX_CHANGES) {
      this.recentChanges = this.recentChanges.slice(-this.MAX_CHANGES);
    }
    
    console.log(`[${this.MODULE_NAME}] 📝 Logged change: ${message}`);
  }

  /**
   * Get empty insight summary (when disabled)
   */
  private getEmptyInsightSummary(): InsightSummary {
    return {
      timestamp: new Date().toISOString(),
      modules: {},
      overallStats: {
        modulesActive: 0,
        totalCacheSize: 0,
        overallHitRate: '0%',
        totalHits: 0,
        totalMisses: 0
      },
      recentChanges: [],
      systemHealth: 'healthy'
    };
  }
}

// Export singleton instance
export const insightBob = new InsightBob();
