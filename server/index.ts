import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { databaseMonitor } from "./services/database-monitor";
import { marketDataHealthCheck } from "./services/market-data-health-check";

const app = express();

// CORS Configuration - restrict access to allowed origins only
// For Replit: automatically allow the current Replit dev/app domain + any custom ALLOWED_ORIGINS
const replitDevDomain = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null;
const customOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
const allowedOrigins = [
  "http://localhost:3000", 
  "http://localhost:5000",
  ...(replitDevDomain ? [replitDevDomain] : []),
  ...customOrigins
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Reset rate limiter for clean test state (non-production only)
  const { resetRateLimiter } = await import('./startup/rate-limiter-reset');
  await resetRateLimiter();

  // Seed test user for automated testing (non-production only)
  const { seedTestUser } = await import('./startup/test-user-seeder');
  await seedTestUser();

  // Phase 13.0: Seed default ethical principles
  const { seedEthicalPrinciples } = await import('./startup/ethical-principles-seeder');
  await seedEthicalPrinciples();

  // Phase 8.5 Addendum F: Sync all strategies for all users on startup
  const { strategySyncService } = await import('./services/strategy-sync');
  await strategySyncService.syncAllUsers();

  // Phase 8.5 Addendum K.4.1: Initialize portfolio_state table with both live and paper entries
  const { initializePortfolioState } = await import('./startup/portfolio-initializer');
  await initializePortfolioState();

  // Phase 8.6.5 Task 1: Initialize Purpose Layer - Restore system.purpose semantic nodes
  const { purposeLayer } = await import('./services/purpose-layer');
  await purposeLayer.initialize();

  // Phase 8.6.5 Task 2: Initialize Corpus Domains - Re-register domain knowledge modules
  const { corpusDomainService } = await import('./services/corpus-domain-service');
  await corpusDomainService.initialize();

  // Phase 8.6.5: Register API routes for enhancements
  const { registerPhase865Routes } = await import('./routes-phase-8.6.5');
  registerPhase865Routes(app);

  // Phase 8.6.5 Validation: Register provenance debug routes and enable verbose mode
  const provenanceDebugRoutes = await import('./routes-provenance-debug');
  app.use(provenanceDebugRoutes.default);
  const { provenanceDebug } = await import('./services/provenance-debug');
  provenanceDebug.enableVerboseMode();

  // Phase 8.4 Addendum E.1: Run file persistence self-test
  const { filePersistence } = await import('./services/file-persistence');
  const selfTestPassed = await filePersistence.runStartupSelfTest();
  if (!selfTestPassed) {
    console.warn('[Server] File persistence self-test failed - system running in DEGRADED mode');
  }

  // Start database monitoring
  databaseMonitor.startDailyChecks();

  // Start market data health checks (async, non-blocking)
  marketDataHealthCheck.startDailyHealthChecks().catch((error) => {
    console.error('[Server] Failed to start Market Data Health Check service:', error);
  });

  // Start AI Opportunities service (async, non-blocking)
  import('./services/ai-opportunities').then(({ aiOpportunitiesService }) => {
    aiOpportunitiesService.startHourlyOpportunityGeneration().catch((error) => {
      console.error('[Server] Failed to start AI Opportunities service:', error);
    });
  });

  // Start Daily Brief service (async, non-blocking)
  import('./services/daily-brief').then(({ dailyBriefService }) => {
    dailyBriefService.startDailyBriefScheduler().catch((error) => {
      console.error('[Server] Failed to start Daily Brief service:', error);
    });
  });

  // Start Market Analysis scheduler (async, non-blocking)
  import('./services/market-analysis-scheduler').then(({ marketAnalysisScheduler }) => {
    marketAnalysisScheduler.startDailyAnalysisScheduler().catch((error) => {
      console.error('[Server] Failed to start Market Analysis Scheduler:', error);
    });
  });

  // Start AI Orchestrator (async, non-blocking)
  import('./orchestrator/orchestrator').then(({ aiOrchestrator }) => {
    aiOrchestrator.start().catch((error) => {
      console.error('[Server] Failed to start AI Orchestrator:', error);
    });
  });

  // Start Walter Health Monitor (async, non-blocking) - Phase 7.4: Re-enabled
  import('./services/walter-health-monitor').then(({ walterHealthMonitor }) => {
    walterHealthMonitor.start().catch((error) => {
      console.error('[Server] Failed to start Walter Health Monitor:', error);
    });
  });

  // Phase 8.8.2: Initialize Memory Lifecycle Manager (async, non-blocking)
  import('./services/memory-lifecycle').then(({ memoryLifecycle }) => {
    memoryLifecycle.initialize().catch((error) => {
      console.error('[Server] Failed to initialize Memory Lifecycle:', error);
    });
  });

  // Start Scheduler Registry with autonomous tasks (async, non-blocking)
  import('./services/scheduler-registry').then(async ({ schedulerRegistry }) => {
    try {
      // Import and register all scheduler tasks
      const { screenerRecalibrationTask } = await import('./services/screener-recalibration-task');
      const { marketScanTask } = await import('./services/market-scan-task');
      const { aiSummaryTask } = await import('./services/ai-summary-task');
      const { systemHealthCheckTask } = await import('./services/system-health-check-task');
      const { cleTask } = await import('./services/cle-task');
      const { cwaTask } = await import('./services/cwa-task');
      const { cachePurgeTask } = await import('./services/cache-purge-task');
      const { semanticIngestionTask } = await import('./services/semantic-ingestion-task');
      const { diagnosticAnalysisTask } = await import('./services/diagnostic-analysis-task');
      const { optimizationAnalysisTask } = await import('./services/optimization-analysis-task');
      const { weeklyExpertInsightsTask } = await import('./services/weekly-expert-insights-task');
      const { registerLearningFeedbackJob } = await import('./jobs/learning-feedback');
      const { registerCognitiveTuningJob } = await import('./jobs/cognitive-tuning-job');

      // Register tasks
      registerLearningFeedbackJob();
      registerCognitiveTuningJob();
      schedulerRegistry.registerTask({
        name: screenerRecalibrationTask.name,
        description: screenerRecalibrationTask.description,
        frequency: screenerRecalibrationTask.frequency,
        intervalMs: screenerRecalibrationTask.intervalMs,
        run: screenerRecalibrationTask.run.bind(screenerRecalibrationTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });
      
      schedulerRegistry.registerTask({
        name: marketScanTask.name,
        description: marketScanTask.description,
        frequency: marketScanTask.frequency,
        intervalMs: marketScanTask.intervalMs,
        run: marketScanTask.run.bind(marketScanTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });
      
      schedulerRegistry.registerTask({
        name: aiSummaryTask.name,
        description: aiSummaryTask.description,
        frequency: aiSummaryTask.frequency,
        intervalMs: aiSummaryTask.intervalMs,
        run: aiSummaryTask.run.bind(aiSummaryTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });
      
      schedulerRegistry.registerTask({
        name: systemHealthCheckTask.name,
        description: systemHealthCheckTask.description,
        frequency: systemHealthCheckTask.frequency,
        intervalMs: systemHealthCheckTask.intervalMs,
        run: systemHealthCheckTask.run.bind(systemHealthCheckTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });
      
      schedulerRegistry.registerTask({
        name: cleTask.name,
        description: cleTask.description,
        frequency: cleTask.frequency,
        intervalMs: cleTask.intervalMs,
        run: cleTask.run.bind(cleTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });
      
      schedulerRegistry.registerTask({
        name: cwaTask.name,
        description: cwaTask.description,
        frequency: cwaTask.frequency,
        intervalMs: cwaTask.intervalMs,
        run: cwaTask.run.bind(cwaTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });
      
      schedulerRegistry.registerTask({
        name: cachePurgeTask.name,
        description: cachePurgeTask.description,
        frequency: cachePurgeTask.frequency,
        intervalMs: cachePurgeTask.intervalMs,
        run: cachePurgeTask.run.bind(cachePurgeTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });

      schedulerRegistry.registerTask({
        name: semanticIngestionTask.name,
        description: semanticIngestionTask.description,
        frequency: semanticIngestionTask.frequency,
        intervalMs: semanticIngestionTask.intervalMs,
        run: semanticIngestionTask.run.bind(semanticIngestionTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });

      schedulerRegistry.registerTask({
        name: diagnosticAnalysisTask.name,
        description: diagnosticAnalysisTask.description,
        frequency: diagnosticAnalysisTask.frequency,
        intervalMs: diagnosticAnalysisTask.intervalMs,
        run: diagnosticAnalysisTask.run.bind(diagnosticAnalysisTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });

      schedulerRegistry.registerTask({
        name: optimizationAnalysisTask.name,
        description: optimizationAnalysisTask.description,
        frequency: optimizationAnalysisTask.frequency,
        intervalMs: optimizationAnalysisTask.intervalMs,
        run: optimizationAnalysisTask.run.bind(optimizationAnalysisTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });

      schedulerRegistry.registerTask({
        name: weeklyExpertInsightsTask.name,
        description: weeklyExpertInsightsTask.description,
        frequency: weeklyExpertInsightsTask.frequency,
        intervalMs: weeklyExpertInsightsTask.intervalMs,
        run: weeklyExpertInsightsTask.run.bind(weeklyExpertInsightsTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });

      // Start all registered tasks
      await schedulerRegistry.startAllTasks();
      console.log('[SchedulerRegistry] All autonomous tasks started successfully');
    } catch (error) {
      console.error('[Server] Failed to start Scheduler Registry:', error);
    }
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Check if port is already in use before listening
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Exiting...`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  server.listen(port, "0.0.0.0", async () => {
    log(`serving on port ${port}`);

    // Phase 7.2: Prefetch metrics on server startup to warm Bob Core cache
    try {
      const { metricsBob } = await import('./services/bob-metrics');
      await metricsBob.prefetchForMode('live');
      console.log('[BobCore] ✅ Server startup prefetch complete');
    } catch (error) {
      console.error('[BobCore] ⚠️ Server startup prefetch failed:', error);
    }

    // Phase 8.0: Initialize Cortex and start sync scheduler
    try {
      const { cortexCore } = await import('./services/cortex/cortex-core');
      const { insightBob } = await import('./services/bob-insight');
      const { uiBob } = await import('./services/bob-ui');
      
      await cortexCore.initialize();
      
      // Define snapshot fetch functions
      const fetchBobSnapshot = async () => {
        return await insightBob.getInsightSummary();
      };
      
      const fetchUISnapshot = async () => {
        // Get a default UI state (live mode, no specific user)
        return { 
          current: { 
            view: 'Dashboard', 
            mode: 'live' as const, 
            timestamp: new Date().toISOString() 
          } 
        };
      };
      
      // Start sync scheduler
      await cortexCore.startSync(fetchBobSnapshot, fetchUISnapshot);
      console.log('[Cortex] ✅ Initialized and sync scheduler started');
    } catch (error) {
      console.error('[Cortex] ⚠️ Initialization failed:', error);
    }

    // Phase 8.2: Start Analytics Scheduler (15-min cycle)
    try {
      const { analyticsScheduler } = await import('./services/cortex/analytics-scheduler');
      await analyticsScheduler.start();
      console.log('[AnalyticsScheduler] ✅ Started successfully');
    } catch (error) {
      console.error('[AnalyticsScheduler] ⚠️ Startup failed:', error);
    }

    // Phase 8.3: Integrate SystemHealthMonitor with BobCore
    try {
      const { systemHealthMonitor } = await import('./services/system-health-monitor');
      const { bobCore } = await import('./services/bob-core');
      bobCore.setHealthMonitor(systemHealthMonitor);
      console.log('[SystemHealthMonitor] ✅ Integrated with BobCore');
    } catch (error) {
      console.error('[SystemHealthMonitor] ⚠️ Integration failed:', error);
    }

    // Phase 8.3: Start Health Report Scheduler (hourly reports)
    try {
      const { healthReportScheduler } = await import('./services/health-report-scheduler');
      await healthReportScheduler.start();
      console.log('[HealthReportScheduler] ✅ Started successfully');
    } catch (error) {
      console.error('[HealthReportScheduler] ⚠️ Startup failed:', error);
    }

    // Phase 8.6.1: Start Learning Cycle Service (24-hour analysis cycle)
    try {
      const { learningCycleService } = await import('./services/learning-cycle-service');
      learningCycleService.start();
      console.log('[LearningCycleService] ✅ Started successfully');
    } catch (error) {
      console.error('[LearningCycleService] ⚠️ Startup failed:', error);
    }

    // Phase 8.9: Start Autonomy Layer (hourly self-checks, daily optimization)
    try {
      const { initAutonomyScheduler } = await import('./services/autonomy-scheduler');
      await initAutonomyScheduler();
      console.log('[AutonomyScheduler] ✅ Started successfully');
    } catch (error) {
      console.error('[AutonomyScheduler] ⚠️ Startup failed:', error);
    }

    // Phase 8.94: Start Awareness Layer (hourly state updates, 6-hour reflections)
    try {
      const { initializeAwarenessScheduler } = await import('./services/awareness-scheduler');
      initializeAwarenessScheduler();
      console.log('[AwarenessScheduler] ✅ Started successfully');
    } catch (error) {
      console.error('[AwarenessScheduler] ⚠️ Startup failed:', error);
    }
  });
})();
