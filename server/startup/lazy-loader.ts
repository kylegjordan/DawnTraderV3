/**
 * Phase 5A: Parallel Lazy Loading + Deferral
 * 
 * Refactored from Phase 4A to achieve ≤10s startup time through:
 * - Parallel loading (Promise.all) instead of sequential
 * - Defer non-critical services (DatabaseMonitor, StrategicDrive) by 4-6s
 * - Immediate critical services (AuditReport, MarketDataHealthCheck)
 */

import { profiler } from '../services/gemini-profiler';

export async function lazyLoadServices() {
  console.log('[Gemini-5A] 🚀 Starting parallel lazy service initialization...');
  const start = Date.now();
  
  const services: string[] = [];
  
  try {
    // Phase 5A: Load critical services in PARALLEL
    const criticalServices = await Promise.all([
      // Directive 12.2.3: Cortex Core + insightBob initialization removed (files deleted in Batch 7A)
      // Directive 12.2.3: Analytics Scheduler removed (file deleted in Batch 7A)
      // Directive 12.2.3: System Health Monitor / BobCore integration removed (bob-core deleted in Batch 7A)

      // System Health Monitor (standalone — no longer integrated with BobCore)
      (async () => {
        try {
          const { systemHealthMonitor } = await import('../services/system-health-monitor');
          systemHealthMonitor.startPeriodicChecks();
          return 'SystemHealthMonitor';
        } catch (error) {
          console.error('[Lazy] SystemHealthMonitor failed:', error);
          return null;
        }
      })(),

      // Directive 11.8B-B: LATTIManager and LottieOversight removed - parallel adaptive systems eliminated
      (async () => {
        console.log('[Lazy] [11.8B-B] LATTi system fully removed - Predictive Learning is single authority');
        return null;
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

    // Phase 8.8.4-C.11: SQE Distribution Logging - defer by 8s (10-min reports for 30min)
    setTimeout(async () => {
      try {
        const { validationSessionService } = await import('../services/validation-session-service');
        await validationSessionService.startSQEDistributionLogging('paper', 10, 30);
        console.log('[Gemini-5A] ✅ Deferred service loaded: SQEDistributionLogging (+8s)');
      } catch (error) {
        console.error('[Lazy] SQEDistributionLogging (deferred) failed:', error);
      }
    }, 8000);

    // Directive 11.4H.5-Fix: Market Event Scheduler - defer by 10s
    // Subscribes to CentralClock for 30s regime/friction checks
    setTimeout(async () => {
      try {
        const { startMarketEventScheduler } = await import('../utils/market-events.js');
        await startMarketEventScheduler();
        console.log('[Gemini-5A] ✅ Deferred service loaded: MarketEventScheduler (+10s)');
      } catch (error) {
        console.error('[Lazy] MarketEventScheduler (deferred) failed:', error);
      }
    }, 10000);
    
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
