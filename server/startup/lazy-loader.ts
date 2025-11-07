/**
 * Phase 5A: Parallel Lazy Loading + Deferral
 * 
 * Refactored from Phase 4A to achieve ≤10s startup time through:
 * - Parallel loading (Promise.all) instead of sequential
 * - Defer non-critical services (DatabaseMonitor, StrategicDrive) by 4-6s
 * - Immediate critical services (Cortex, Analytics, LATTI)
 */

import { profiler } from '../services/gemini-profiler';

export async function lazyLoadServices() {
  console.log('[Gemini-5A] 🚀 Starting parallel lazy service initialization...');
  const start = Date.now();
  
  const services: string[] = [];
  
  try {
    // Phase 5A: Load critical services in PARALLEL
    const criticalServices = await Promise.all([
      // Cortex Core (core trading intelligence)
      (async () => {
        try {
          const { cortexCore } = await import('../services/cortex/cortex-core');
          const { insightBob } = await import('../services/bob-insight');
          
          await cortexCore.initialize();
          
          const fetchBobSnapshot = async () => {
            return await insightBob.getInsightSummary();
          };
          
          const fetchUISnapshot = async () => {
            return { 
              current: { 
                view: 'Dashboard', 
                mode: 'live' as const, 
                timestamp: new Date().toISOString() 
              } 
            };
          };
          
          await cortexCore.startSync(fetchBobSnapshot, fetchUISnapshot);
          return 'Cortex';
        } catch (error) {
          console.error('[Lazy] Cortex initialization failed:', error);
          return null;
        }
      })(),
      
      // Analytics Scheduler (15-min cycle)
      (async () => {
        try {
          const { analyticsScheduler } = await import('../services/cortex/analytics-scheduler');
          await analyticsScheduler.start();
          return 'AnalyticsScheduler';
        } catch (error) {
          console.error('[Lazy] AnalyticsScheduler failed:', error);
          return null;
        }
      })(),
      
      // System Health Monitor
      (async () => {
        try {
          const { systemHealthMonitor } = await import('../services/system-health-monitor');
          const { bobCore } = await import('../services/bob-core');
          bobCore.setHealthMonitor(systemHealthMonitor);
          return 'SystemHealthMonitor';
        } catch (error) {
          console.error('[Lazy] SystemHealthMonitor failed:', error);
          return null;
        }
      })(),
      
      // LATTI Manager (30-min cycle)
      (async () => {
        try {
          const { LATTIManager } = await import('../services/latti-manager');
          LATTIManager.startPeriodicProcessing();
          return 'LATTIManager';
        } catch (error) {
          console.error('[Lazy] LATTIManager failed:', error);
          return null;
        }
      })(),
      
      // Lottie Oversight (5-min checks)
      (async () => {
        try {
          const { lottieOversightService } = await import('../services/lottie-oversight-service');
          await lottieOversightService.start();
          return 'LottieOversight';
        } catch (error) {
          console.error('[Lazy] LottieOversight failed:', error);
          return null;
        }
      })(),
      
      // Audit Report Generation (one-time task)
      (async () => {
        try {
          const { generatePhase30Report } = await import('../audit/generate-phase30-fx4-6-report');
          await generatePhase30Report();
          return 'AuditReport';
        } catch (error) {
          console.error('[Lazy] AuditReport failed:', error);
          return null;
        }
      })(),
      
      // Market Data Health Check
      (async () => {
        try {
          const { marketDataHealthCheck } = await import('../services/market-data-health-check');
          await marketDataHealthCheck.startDailyHealthChecks();
          return 'MarketDataHealthCheck';
        } catch (error) {
          console.error('[Lazy] MarketDataHealthCheck failed:', error);
          return null;
        }
      })()
    ]);
    
    // Filter out failed services and record successful ones
    services.push(...criticalServices.filter(name => name !== null) as string[]);
    
    const criticalDuration = Date.now() - start;
    const criticalDurationSeconds = (criticalDuration / 1000).toFixed(1);
    console.log(`[Gemini-5A] ✅ Loaded ${services.length} critical services in ${criticalDurationSeconds}s (parallel)`);
    
    // Phase 5A: DEFER non-critical services to reduce startup time
    // Database Monitor - defer by 4s (periodic health checks, not urgent)
    setTimeout(async () => {
      try {
        const { databaseMonitor } = await import('../services/database-monitor');
        databaseMonitor.startDailyChecks();
        console.log('[Gemini-5A] ✅ Deferred service loaded: DatabaseMonitor (+4s)');
      } catch (error) {
        console.error('[Lazy] DatabaseMonitor (deferred) failed:', error);
      }
    }, 4000);
    
    // Strategic Drive - defer by 6s (hourly cycle, low priority)
    setTimeout(async () => {
      try {
        const { strategicDriveService } = await import('../services/strategic-drive-service');
        await strategicDriveService.computeDriveMetrics('paper');
        await strategicDriveService.summarizeDriveMetrics();
        
        // Schedule hourly computation
        setInterval(async () => {
          try {
            await strategicDriveService.computeDriveMetrics('paper');
            await strategicDriveService.summarizeDriveMetrics();
          } catch (error) {
            console.error('[Lazy] SDPOE periodic update failed:', error);
          }
        }, 60 * 60 * 1000);
        
        console.log('[Gemini-5A] ✅ Deferred service loaded: StrategicDrive (+6s)');
      } catch (error) {
        console.error('[Lazy] StrategicDrive (deferred) failed:', error);
      }
    }, 6000);
    
    const duration = Date.now() - start;
    const durationSeconds = (duration / 1000).toFixed(1);
    
    // Phase 5A: Record parallel lazy load metrics
    console.log(`[Gemini-5A] ✅ Parallel lazy load complete: ${services.length} services in ${durationSeconds}s`);
    console.log(`[Gemini-5A] Services: ${services.join(', ')}`);
    console.log(`[Gemini-5A] Deferred: DatabaseMonitor (+4s), StrategicDrive (+6s)`);
    
    // Record lazy load complete for profiling
    profiler.recordLazyLoadComplete();
    
    return { success: true, services, duration };
  } catch (error: any) {
    const duration = Date.now() - start;
    console.error('[Gemini-5A] ❌ Parallel lazy loading failed:', error);
    return { success: false, error: error.message, duration };
  }
}
