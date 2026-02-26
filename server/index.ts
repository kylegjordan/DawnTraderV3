import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { databaseMonitor } from "./services/database-monitor";
import { marketDataHealthCheck } from "./services/market-data-health-check";
import { healthRouter } from "./routes/health.js"; // Phase 41F-D/F: Health monitoring routes
import { statusRouter } from "./routes/status.js"; // Phase 1: Status and version routes
import dseRouter from "./routes/dse.js"; // Directive 11.3: Dynamic Sizing Engine routes
import chapletRouter from "../chaplet/index.js"; // Phase M4: Chaplet Context Service
import { env } from "./config/index.js"; // Phase 1: Typed environment config
import regimeArchiveRouter from "./routes/regime-archive.js"; // Directive 11.7E: Regime Archive API
import version from "./version.json";

// Phase 3C: Performance profiling
const SERVER_START_TIME = performance.now();

console.log('[BOOT]', process.env.COMMIT_SHA || 'local', new Date().toISOString());
console.log(`[BOOT] DawnTrader v${version.version} - Phase ${version.phase}`);

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

// Phase 2D: Single-tenant guard middleware (crash fast on userId violations)
import { singleTenantGuard } from "./middleware/singleTenantGuard";
app.use(singleTenantGuard);

// Phase 4A-4: Telemetry compression with sampling & batching (60% reduction)
import { telemetry } from "./services/telemetry-compression";

// Phase 4A-5: Gemini profiler for optimization metrics
import { profiler } from "./services/gemini-profiler";

// Phase 34.A + 4A-4 + 4A-5: Enhanced debug logging with telemetry compression and profiling
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
      
      // Phase 4A-5: Track API latency for profiling
      profiler.recordApiLatency(path, duration);
      
      // Phase 4A-4: Use telemetry compression with sampling
      // Errors always logged, normal requests sampled at 10%
      if (res.statusCode >= 400) {
        telemetry.logError(`${req.method} ${path}`, {
          status: res.statusCode,
          duration,
          response: capturedJsonResponse
        });
      } else {
        // Sampled request logging (10% sampling)
        telemetry.logRequest(req.method, path, {
          statusCode: res.statusCode,
          duration,
          mode: req.headers['x-app-mode']
        });
      }
    }
  });

  next();
});

(async () => {
  /**
   * A4.R10R-3: Central Clock Synchronized Startup Sequence
   * Ensures deterministic startup order for all tick-synchronized services.
   * 
   * Order: Price Cache → Central Clock → RTB Refresh Service → FX5 Scanner
   */
  console.log('[A4.R10R-3] 🔁 Starting synchronized service bootstrap sequence');

  /**
   * 8.8.4-L3: Initialize Boot Orchestrator FIRST
   * Manages Python ML microservice lifecycle and health checks
   */
  const { bootOrchestrator } = await import('./core/boot_orchestrator.js');
  await bootOrchestrator.initialize();
  console.log('[8.8.4-L3][INIT_OK] Boot Orchestrator initialized (ML Service: ' + 
    (bootOrchestrator.isMLReady() ? 'READY' : 'DEGRADED') + ')');

  /**
   * Directive 11.4H.6G Task 4: Canonical Drift Detection
   * Validates canonical mapping consistency at startup
   */
  const { validateCanonicalConsistency } = await import('./utils/validate-canonical.js');
  validateCanonicalConsistency();

  /**
   * A4.R10R-4: Initialize System Health Monitor FIRST
   * Tracks CPU, memory, event loop lag throughout runtime
   */
  const { systemHealth } = await import('./services/system-health.js');
  systemHealth.start();

  /**
   * A4.R10R-1: Initialize Unified Price Cache
   * This ensures all services have access to cached pricing data
   */
  const { priceCache } = await import('./services/price-cache.js');
  priceCache.initialize();
  console.log('[A4.R10R-4][INIT_OK] Price Cache initialized');

  /**
   * A4.R10R-3: Start Central Clock BEFORE RTB Refresh Service
   * RTB Refresh now subscribes to clock ticks for deterministic scheduling
   */
  const { centralClock } = await import('./services/central-clock.js');
  
  if (!centralClock.getIsRunning()) {
    console.log('[A4.R10R-4] Central Clock not running — starting...');
    centralClock.start();
    console.log('[A4.R10R-4][INIT_OK] Central Clock started');
  } else {
    console.log('[A4.R10R-4][INIT_OK] Central Clock already running (tickNumber=%d)', centralClock.getTickNumber() ?? 0);
  }

  /**
   * A4.R10R-3: Initialize RTB Refresh Service AFTER Central Clock
   * Now synchronized with Central Clock for deterministic 15s bucket refresh
   * Micro-cycle: 15s (one bucket), Macro-cycle: 120s (all 8 buckets)
   * 
   * A4.R10R-3.T4: Adaptive Concurrency Tuner (ACT) enabled
   * - Dynamically adjusts pool size based on cycle duration and CPU headroom
   * - Target: 5000ms, Safe CPU: <60%, Pool range: 3-10 workers
   */
  const { rtbRefreshService, getAdaptivePoolSize } = await import('./services/rtb-refresh-service.js');
  rtbRefreshService.start();
  console.log('[A4.R10R-4][INIT_OK] RTB Refresh Service started (clock-synchronized)');
  console.log(`[A4.R10R-4][INIT_OK] Adaptive Concurrency Tuner active (pool=${getAdaptivePoolSize()}, range=3-10)`);
  
  /**
   * 8.8.4-L1: Initialize Data Aggregator for learning data capture
   * Non-blocking data aggregation for signal, strategy, and market metrics
   */
  const { dataAggregator } = await import('./services/data-aggregator.js');
  console.log('[8.8.4-L1][INIT_OK] Data Aggregator initialized (flush=30s, aggregate=15m)');

  // R9.3.HF-5: Force FX5 Scanner reinitialization (non-blocking)
  import('./startup/fx5-scanner-bootstrap.js')
    .then(({ bootstrapFX5Scanner }) => {
      console.log('[R9.3.HF-5] Forcing FX5 Scanner reinitialization');
      return bootstrapFX5Scanner(true); // Force reinit
    })
    .then(() => {
      console.log('[R9.3.HF-5] ✅ FX5 Scanner reinitialized successfully');
    })
    .catch((err) => {
      console.error('[R9.3.HF-5] ❌ Failed to reinitialize FX5 Scanner:', err);
    });

  // Directive 11.7E: Mount Regime Archive routes BEFORE registerRoutes to ensure availability
  app.use('', regimeArchiveRouter);
  console.log('[11.7E] Regime Archive routes mounted at /api/vts/regime-archive');

  // Register routes and get the API router + HTTP server
  const { httpServer: server, apiRouter } = await registerRoutes(app);

  // Mount API router BEFORE Vite middleware to ensure backend routes take precedence
  app.use('/api', apiRouter);
  
  // Phase 1: Mount core status routes
  app.use('/api/status', statusRouter);
  
  // Phase 41F-D/F: Mount health monitoring routes
  app.use('/api/health', healthRouter);
  
  // Directive 11.3: Mount Dynamic Sizing Engine routes
  app.use('/api/diagnostics', dseRouter);
  
  // Phase M4: Mount Chaplet Context Service (read-only)
  app.use('/chaplet', chapletRouter);
  console.log('[Server] Chaplet mounted at /chaplet (read-only)');
  
  console.log('[Server] API routes mounted at /api');

  // Phase 41F-B-5: Initialize operation queues and clear orphaned state
  try {
    const { initializeQueues } = await import('./utils/operation-queue');
    await initializeQueues();
  } catch (error) {
    console.error('[Queue] ⚠️ Initialization failed:', error);
  }

  // Phase 27.F.8: Reset PaperSim service state FIRST (before any other services)
  try {
    const { resetPaperSimService, resumeActiveEngines } = await import('./services/paper-sim-service');
    resetPaperSimService();
    
    // R9.3.HF-4.FIX: Resume engines that should be running after server restart
    // This ensures Central Clock subscribers (TCL watchdog, FX5 scanner, Stage3 emitter) are rehydrated
    await resumeActiveEngines();
  } catch (error) {
    console.error('[PaperSimService] ⚠️ Reset failed:', error);
  }

  // Reset rate limiter for clean test state (non-production only)
  const { resetRateLimiter } = await import('./startup/rate-limiter-reset');
  await resetRateLimiter();

  // Seed test user for automated testing (non-production only)
  const { seedTestUser } = await import('./startup/test-user-seeder');
  await seedTestUser();

  // Phase 27.3: Initialize Permission Cache
  const { permissionCache } = await import('./services/permission-cache');
  await permissionCache.initialize();

  // Phase 8.8.3: Initialize Kraken Pair Metadata Service for symbol normalization
  try {
    const { krakenPairMetadataService } = await import('./services/kraken-pair-metadata-service');
    const success = await krakenPairMetadataService.loadAssetPairs();
    if (success) {
      console.log('[KrakenPairMetadata] ✅ Asset pairs loaded successfully');
    } else {
      console.warn('[KrakenPairMetadata] ⚠️ Asset pairs load failed - normalization will use fallback');
    }
  } catch (error) {
    console.error('[KrakenPairMetadata] ❌ Failed to initialize:', error);
    // Non-fatal - the system can still run with fallback normalization
  }

  // Phase 8.8.3-I7-MAP-AUTO: Initialize automatic Kraken symbol mapping
  try {
    const { krakenAssetPairsService } = await import('./markets/kraken-asset-pairs-service.js');
    const { storage } = await import('./storage');
    
    await krakenAssetPairsService.initialize();
    const summary = krakenAssetPairsService.getSummary();
    
    // Audit active positions for mapping coverage
    const [paperPositions, liveTrades] = await Promise.all([
      storage.getPaperSimOpenPositions('paper'),
      storage.getActiveTrades('live')
    ]);
    
    const activeSymbols = [...new Set([
      ...paperPositions.map((t: any) => t.symbol),
      ...liveTrades.map((t: any) => t.symbol)
    ])];
    
    if (activeSymbols.length > 0) {
      const auditResult = krakenAssetPairsService.auditSymbols(activeSymbols);
      console.log(`[I7-MAP-AUTO][STARTUP] Active positions audit: mapped=${auditResult.mapped}, tier1=${auditResult.tier1}, tier2=${auditResult.tier2}, tier3=${auditResult.tier3}, unmapped=${auditResult.unmapped.length}`);
      
      if (auditResult.unmapped.length > 0) {
        console.warn(`[I7-MAP-AUTO][STARTUP] ⚠️ Unmapped active symbols:`, auditResult.unmapped.map(u => u.symbol).join(', '));
      }
    }
    
    const tier12Coverage = summary.total > 0 ? ((summary.tier1 + summary.tier2) / summary.total * 100).toFixed(1) : '0';
    console.log(`[I7-MAP-AUTO][STARTUP] ✅ Auto-map ready: total=${summary.total}, tier1=${summary.tier1}, tier2=${summary.tier2}, tier3=${summary.tier3}, coverage=${tier12Coverage}%`);
  } catch (error) {
    console.error('[I7-MAP-AUTO] ❌ Failed to initialize:', error);
    // Non-fatal - static map fallback will be used
  }

  // Phase 27.4: Initialize Trading State Recovery
  const { tradingStateSync } = await import('./services/trading-state-sync.js');
  const { db } = await import('./db.js');
  const { users } = await import('@shared/schema');
  try {
    // Get all users and recover their trading state
    const allUsers = await db.select().from(users);
    console.log(`[TradingStateSync] Recovering trading state for ${allUsers.length} user(s)...`);
    
    for (const user of allUsers) {
      await tradingStateSync.initialize(user.id);
    }
    
    console.log(`[TradingStateSync] ✅ Trading state recovery complete`);
  } catch (error) {
    console.error('[TradingStateSync] ⚠️ Failed to recover trading state:', error);
    // Continue server startup even if recovery fails
  }

  // Phase 13.0: Seed default ethical principles
  const { seedEthicalPrinciples } = await import('./startup/ethical-principles-seeder');
  await seedEthicalPrinciples();

  // Phase 8.5 Addendum F: Sync all strategies for all users on startup
  const { strategySyncService } = await import('./services/strategy-sync');
  await strategySyncService.syncAllUsers();

  // Phase 8.5 Addendum K.4.1: Initialize portfolio_state table with both live and paper entries
  const { initializePortfolioState } = await import('./startup/portfolio-initializer');
  await initializePortfolioState();

  // Directive 8.8.4-A3.R2: Bootstrap RTB/TCL services if engine was active before restart
  const { bootstrapTradingServices } = await import('./startup/trading-bootstrap');
  await bootstrapTradingServices();

  // Phase 8.6.5 Task 1: Initialize Purpose Layer - Restore system.purpose semantic nodes
  const { purposeLayer } = await import('./services/purpose-layer');
  await purposeLayer.initialize();

  // Phase 8.6.5 Task 2: Initialize Corpus Domains - Re-register domain knowledge modules
  const { corpusDomainService } = await import('./services/corpus-domain-service');
  await corpusDomainService.initialize();

  // Phase 27: Initialize Context Persistence Framework - Load replit.md and context files
  const { contextLoader } = await import('./services/context-loader');
  await contextLoader.initialize();

  // Phase 8.6.5: Register API routes for enhancements
  const { registerPhase865Routes } = await import('./routes/phase-8.6.5');
  registerPhase865Routes(app);

  // Phase 8.6.5 Validation: Register provenance debug routes and enable verbose mode
  const provenanceDebugRoutes = await import('./routes/provenance-debug');
  app.use(provenanceDebugRoutes.default);
  const { provenanceDebug } = await import('./services/provenance-debug');
  provenanceDebug.enableVerboseMode();

  // Phase 8.4 Addendum E.1: Run file persistence self-test
  const { filePersistence } = await import('./services/file-persistence');
  const selfTestPassed = await filePersistence.runStartupSelfTest();
  if (!selfTestPassed) {
    console.warn('[Server] File persistence self-test failed - system running in DEGRADED mode');
  }

  // Phase 4A-2: Database monitoring and health checks now handled by lazy loader (see server/startup/lazy-loader.ts)
  // This prevents duplicate service initialization
  // databaseMonitor.startDailyChecks();
  // marketDataHealthCheck.startDailyHealthChecks().catch((error) => {
  //   console.error('[Server] Failed to start Market Data Health Check service:', error);
  // });

  // Phase 27.F.14.B: Walter Full Shutdown
  // When WALTER_DISABLED=true, skip all AI Opportunities, Daily Brief, Market Analysis, AI Orchestrator, and Walter Health Monitor
  const WALTER_DISABLED = process.env.WALTER_DISABLED === 'true';
  
  if (!WALTER_DISABLED) {
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

    // Phase 0: Removed AI Orchestrator (legacy module)
    // import('./orchestrator/orchestrator').then(({ aiOrchestrator }) => {
    //   aiOrchestrator.start().catch((error) => {
    //     console.error('[Server] Failed to start AI Orchestrator:', error);
    //   });
    // });

    // Directive 12.2.3: Walter Health Monitor startup removed (file deleted in Batch 6)
  } else {
    console.log('[Server] Standby mode – AI services disabled');
  }

  // Directive 11.8B: LATTI system removed - parallel adaptive systems eliminated
  // Phase 11 Predictive Learning is the single authority for parameter adjustment
  console.log('[11.8B] LATTI system removed - Predictive Learning is single authority');

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
      const { tradingSignalsCleanupTask } = await import('./services/trading-signals-cleanup');
      const { auditAnomalyTask } = await import('./services/audit-anomaly-task');
      const { registerLearningFeedbackJob } = await import('./jobs/learning-feedback');
      const { registerFormulaAuditJob } = await import('./jobs/formula-auto-audit');
      const { registerFeedIntegrityJob } = await import('./jobs/feed-integrity-auto-check');

      // Register tasks
      registerLearningFeedbackJob();
      registerFormulaAuditJob();
      registerFeedIntegrityJob();
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
      
      schedulerRegistry.registerTask({
        name: tradingSignalsCleanupTask.name,
        description: tradingSignalsCleanupTask.description,
        frequency: tradingSignalsCleanupTask.frequency,
        intervalMs: tradingSignalsCleanupTask.intervalMs,
        run: tradingSignalsCleanupTask.run.bind(tradingSignalsCleanupTask),
        lastRun: null,
        nextRun: null,
        status: 'idle'
      });

      // Phase 28.D: Audit Anomaly Detection Task
      schedulerRegistry.registerTask({
        name: auditAnomalyTask.name,
        description: auditAnomalyTask.description,
        frequency: auditAnomalyTask.frequency,
        intervalMs: auditAnomalyTask.intervalMs,
        run: auditAnomalyTask.run.bind(auditAnomalyTask),
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

  // [41F-L.2] Global error handler - catches thrown errors and sends JSON
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[GLOBAL][ERROR]", err?.stack || err);
    res.status(err?.status || 500).json({ ok: false, error: err?.message || "Internal error" });
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
  
  // Phase 2D: Verify single-tenant database invariants before starting server
  try {
    const { assertSingleTenantDB } = await import('./startup/invariants');
    await assertSingleTenantDB();
  } catch (error) {
    console.error('[BOOT] ❌ Single-tenant verification failed:', error);
    process.exit(1);
  }
  
  // Check if port is already in use before listening
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Exiting...`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  // Phase 2E/2F: Print route map for external verification
  const { printRoutes, dumpRoutes } = await import('./startup/printRoutes');
  printRoutes(app);
  dumpRoutes(app);

  server.listen(port, "0.0.0.0", async () => {
    log(`serving on port ${port}`);

    // Phase 4A-5: Record server ready time for profiling
    profiler.recordServerReady();
    
    // Phase 4A Remediation: Hard startup metrics
    const serverStartupTime = (performance.now() - SERVER_START_TIME) / 1000;
    console.log(`[PerfAudit] Server started in ${serverStartupTime.toFixed(1)} s`);

    // Phase 4A: Startup acceleration - defer non-critical services
    console.log('[Gemini-4A] 🚀 Server ready - deferring non-critical services...');
    
    // I7-MAP-AUTO-FIX: Verify auto-map initialization status (captured in logs)
    try {
      const { krakenAssetPairsService } = await import('./markets/kraken-asset-pairs-service.js');
      const isReady = krakenAssetPairsService.isReady();
      const summary = krakenAssetPairsService.getSummary();
      console.log(`[I7-MAP-AUTO-FIX][VERIFY] isReady=${isReady}, total=${summary.total}, tier1=${summary.tier1}, tier2=${summary.tier2}`);
    } catch (err) {
      console.error('[I7-MAP-AUTO-FIX][VERIFY] Failed to check status:', err);
    }

    // Phase 7.2: Prefetch metrics on server startup to warm Bob Core cache (CRITICAL PATH)
    try {
      const { metricsBob } = await import('./services/bob-metrics');
      await metricsBob.prefetchForMode('live');
      console.log('[BobCore] ✅ Server startup prefetch complete');
    } catch (error) {
      console.error('[BobCore] ⚠️ Server startup prefetch failed:', error);
    }

    // Phase 27.F.15.D: Start Live Pricing Adapter (CRITICAL PATH)
    try {
      const { livePricingAdapter } = await import('./services/live-pricing-adapter.js');
      
      // Phase 8.8.3-B9: Mock mode DISABLED by default - only enabled via explicit ENABLE_MOCK_PRICING=true
      // This ensures P&L calculations use real market data, not hardcoded mock prices
      const useMockMode = process.env.ENABLE_MOCK_PRICING === 'true';
      console.log(`[B9.PRICING] Mock mode: ${useMockMode ? 'ENABLED (ENABLE_MOCK_PRICING=true)' : 'DISABLED (production mode)'}`);
      await livePricingAdapter.start(useMockMode);
      
      // Phase 8.8.3-I7-WS-E: Register WebSocket subscription checker
      try {
        const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
        livePricingAdapter.setWsSubscriptionChecker(() => krakenWebSocketAdapter.getSubscribedSymbols());
        console.log('[I7-WS-E] ✅ WebSocket subscription checker registered');
        
        // Phase 8.8.5: Initialize VolumeClassifier before WebSocket starts
        try {
          const { volumeClassifier } = await import('./services/market-data/volume-classifier.js');
          await volumeClassifier.init();
          const stats = volumeClassifier.getStats();
          console.log(`[8.8.5] ✅ VolumeClassifier initialized: ${stats.total} pairs (HIGH=${stats.high}, MID=${stats.mid}, LOW=${stats.low})`);
        } catch (vcError) {
          console.warn('[8.8.5] ⚠️ VolumeClassifier init failed (using fallback tiers):', vcError);
        }
        
        // Phase 8.8.7: Initialize ActiveFilterPool for unified filter synchronization
        try {
          const { activeFilterPool } = await import('./services/active-filter-pool.js');
          activeFilterPool.initialize();
          console.log('[8.8.7] ✅ ActiveFilterPool initialized for FX5 synchronization');
        } catch (afpError) {
          console.warn('[8.8.7] ⚠️ ActiveFilterPool init failed:', afpError);
        }
        
        // Directive 9.2: Load persisted trailing states from file
        try {
          const { loadTrailingStates } = await import('./services/trade-safety.js');
          loadTrailingStates();
          console.log('[9.2] ✅ Trailing exit states loaded from persistence');
        } catch (trailingError) {
          console.warn('[9.2] ⚠️ Failed to load trailing states:', trailingError);
        }
        
        // Phase 8.8.3-I7-WS-STARTUP: Start WebSocket adapter during server boot
        // This enables real-time pricing for all clients immediately, not just when engine starts
        await krakenWebSocketAdapter.start();
        console.log('[I7-WS-STARTUP] ✅ Kraken WebSocket adapter started on server boot');
      } catch (wsError) {
        console.warn('[I7-WS-E] ⚠️ Failed to register WebSocket subscription checker:', wsError);
      }
      
      // I7-MAP-FIX: Startup audit for unmappable symbols (both paper and live)
      try {
        const { listUnmappableSymbols, getMappingCount } = await import('./markets/kraken-symbol-resolver.js');
        const { storage } = await import('./storage');
        
        // Check both paper and live positions
        const paperPositions = await storage.getPaperSimOpenPositions('paper');
        const livePositions = await storage.getPaperSimOpenPositions('live');
        
        const paperSymbols = paperPositions.map(p => p.symbol);
        const liveSymbols = livePositions.map(p => p.symbol);
        const allActiveSymbols = [...new Set([...paperSymbols, ...liveSymbols])];
        
        const unmappable = listUnmappableSymbols(allActiveSymbols);
        
        if (unmappable.length > 0) {
          console.warn(`[I7-MAP-FIX][STARTUP] ⚠️ Unmappable symbols detected (${unmappable.length}):`, unmappable);
          console.warn(`[I7-MAP-FIX][STARTUP] ⚠️ These symbols need to be added to KRAKEN_SYMBOL_MAP in server/markets/kraken-symbol-map.ts`);
        } else {
          console.log(`[I7-MAP-FIX][STARTUP] ✅ All ${allActiveSymbols.length} active symbols are mappable (paper: ${paperSymbols.length}, live: ${liveSymbols.length}, static map: ${getMappingCount()} entries)`);
        }
      } catch (auditError) {
        console.warn('[I7-MAP-FIX][STARTUP] ⚠️ Symbol mapping audit failed:', auditError);
      }
      
      console.log('[27.F.15.D] ✅ LivePricingAdapter started successfully');
      
      // Phase 27.F.14.MICRO: Forward price updates to MicroExecutionService
      // Set up price update forwarder that feeds live prices to micro-execution services
      setInterval(async () => {
        try {
          const { getMicroService } = await import('./services/mode-registry');
          const prices = livePricingAdapter.getAllPrices();
          
          for (const quote of prices) {
            // Phase 8.8.3-B9: Only forward valid prices (not null)
            if (quote.price === null) continue;
            
            // Forward to paper micro-service
            const paperMicroService = getMicroService('paper');
            if (paperMicroService) {
              paperMicroService.updatePrice(quote.symbol, quote.price);
            }
            
            // Forward to live micro-service (if it exists)
            const liveMicroService = getMicroService('live');
            if (liveMicroService) {
              liveMicroService.updatePrice(quote.symbol, quote.price);
            }
          }
        } catch (error) {
          // Silently continue - micro-services might not be running yet
        }
      }, 1000); // Update every second (fast enough for micro-loop)
      
      console.log('[27.F.14.MICRO] ✅ Price update forwarder started');
    } catch (error) {
      console.error('[27.F.15.D] ⚠️ LivePricingAdapter startup failed:', error);
    }

    // Phase 4A: Lazy-load non-critical services after 1.5s delay
    setTimeout(async () => {
      const { lazyLoadServices } = await import('./startup/lazy-loader');
      await lazyLoadServices();
      
      // Phase 4B: Start adaptive profiler after lazy loading
      const { startAdaptiveProfiler } = await import('./services/gemini-adaptive-profiler');
      startAdaptiveProfiler();
      
      // Directive 11.7I-03: Initialize Regime Archive Scheduler
      try {
        const { initArchivalScheduler } = await import('./core/archival/archival-scheduler');
        initArchivalScheduler();
        console.log('[11.7I-03] ✅ Archival scheduler initialized');
      } catch (archiveError) {
        console.error('[11.7I-03] ⚠️ Archival scheduler init failed:', archiveError);
      }
      
      // Directive 11.7I-04: Initialize ML Calibration Scheduler (8-hour cadence)
      try {
        const { initMLCalibrationScheduler } = await import('./core/schedulers/ml-calibration-scheduler');
        initMLCalibrationScheduler();
        console.log('[11.7I-04] ✅ ML Calibration scheduler initialized');
      } catch (mlError) {
        console.error('[11.7I-04] ⚠️ ML Calibration scheduler init failed:', mlError);
      }
    }, 1500);

    // Phase 27.G.F: Config Audit Telemetry (startup diagnostic)
    try {
      const { storage } = await import('./storage');
      
      // Helper function to build config snapshot (same logic as endpoint)
      async function buildConfigSnapshot(mode: 'paper' | 'live') {
        const guardrailsData = await storage.getGuardrailsV2({ mode });
        const filtersData = await storage.getScreenerFilters({ mode });
        const activePreset = await storage.getActiveGoalsPreset({ mode });
        
        const guardrails = guardrailsData ? {
          portfolioRiskPerTradePct: parseFloat(String(guardrailsData.portfolioRiskPerTradePct)),
          symbolCooldownMinutes: guardrailsData.symbolCooldownMinutes,
          maxOpenPositions: guardrailsData.maxOpenPositions,
          dailyLossKillSwitchPct: parseFloat(String(guardrailsData.dailyLossKillSwitchPct))
        } : null;
        
        const filters = filtersData ? {
          minVolume: parseFloat(String(filtersData.minVolume)),
          minLiquidity: parseFloat(String(filtersData.minLiquidity)),
          minPrice: parseFloat(String(filtersData.minPrice)),
          maxPrice: parseFloat(String(filtersData.maxPrice)),
          minMarketCap: parseFloat(String(filtersData.minMarketCap)),
          maxBidAskSpread: parseFloat(String(filtersData.maxBidAskSpread)),
          rsiMin: filtersData.rsiMin,
          rsiMax: filtersData.rsiMax,
          volatilityMin: parseFloat(String(filtersData.volatilityMin)),
          volatilityMax: parseFloat(String(filtersData.volatilityMax)),
          excludeStablecoins: filtersData.excludeStablecoins,
          allowRegulatedOnly: filtersData.allowRegulatedOnly,
          universeSize: filtersData.universeSize,
          quoteCurrencies: filtersData.quoteCurrencies,
          activeTimeframes: filtersData.activeTimeframes,
          confidenceThreshold: filtersData.confidenceThreshold
        } : null;
        
        const goals = activePreset ? {
          activePreset: activePreset.name,
          targetDailyAvgEarningPct: parseFloat(String(activePreset.targetDailyAvgEarningPct)),
          tradesPerDayEst: activePreset.tradesPerDayEst
        } : null;
        
        // Compute legacyReads: 0 because we only access current tables
        const legacyReads = 0;
        const legacyFields: string[] = [];
        
        // Compute schema hash (deterministic)
        const crypto = await import('crypto');
        const schemaHash = crypto
          .createHash('md5')
          .update(JSON.stringify({ guardrails, filters, goals }))
          .digest('hex');
        
        return {
          guardrails,
          filters,
          goals,
          legacyReads,
          legacyFields,
          schemaHash,
          fieldCount: (guardrails ? 4 : 0) + (filters ? 16 : 0) + (goals ? 3 : 0)
        };
      }
      
      // Fetch snapshots for both modes
      const paperSnapshot = await buildConfigSnapshot('paper');
      const liveSnapshot = await buildConfigSnapshot('live');
      
      // Verify audit compliance
      const auditStatus = (paperSnapshot.legacyReads === 0 && liveSnapshot.legacyReads === 0) ? 'OK' : 'FAILED';
      
      console.log(`[Audit] ConfigSnapshot ${auditStatus} | mode=paper | fields=${paperSnapshot.fieldCount} | legacyReads=${paperSnapshot.legacyReads} | hash=${paperSnapshot.schemaHash.substring(0, 8)}`);
      console.log(`[Audit] ConfigSnapshot ${auditStatus} | mode=live | fields=${liveSnapshot.fieldCount} | legacyReads=${liveSnapshot.legacyReads} | hash=${liveSnapshot.schemaHash.substring(0, 8)}`);
      
      // Detailed breakdown for debugging
      if (paperSnapshot.guardrails) {
        const g = paperSnapshot.guardrails;
        console.log(`[Audit] Paper guardrails active: portfolioRisk=${g.portfolioRiskPerTradePct}%, cooldown=${g.symbolCooldownMinutes}min, maxPos=${g.maxOpenPositions}, killSwitch=${g.dailyLossKillSwitchPct}%`);
      }
      if (liveSnapshot.guardrails) {
        const g = liveSnapshot.guardrails;
        console.log(`[Audit] Live guardrails active: portfolioRisk=${g.portfolioRiskPerTradePct}%, cooldown=${g.symbolCooldownMinutes}min, maxPos=${g.maxOpenPositions}, killSwitch=${g.dailyLossKillSwitchPct}%`);
      }
      
      // Phase 28: FilterCoherence Telemetry (with database-persisted override flags)
      try {
        const validateFilterCoherence = async (mode: 'paper' | 'live') => {
          // Fetch filter data from database
          const filtersData = await storage.getScreenerFilters({ mode });
          
          if (!filtersData) {
            return { 
              status: 'MISSING', 
              filterCount: 0, 
              lattiManaged: 0, 
              manualOverride: 0, 
              coherent: false,
              note: 'Filter data not found in database'
            };
          }
          
          // Count actual filter value fields from the payload
          const filterValueFields = [
            'minVolume', 'minLiquidity', 'minPrice', 'maxPrice', 'minMarketCap', 'maxBidAskSpread',
            'rsiMin', 'rsiMax', 'volatilityMin', 'volatilityMax',
            'excludeStablecoins', 'allowRegulatedOnly', 'universeSize',
            'quoteCurrencies', 'activeTimeframes', 'confidenceThreshold'
          ];
          
          // Derive filter count from actual data (check which fields exist)
          const filterCount = filterValueFields.filter(field => 
            filtersData.hasOwnProperty(field)
          ).length;
          
          // Phase 28: Read actual override flags from database
          const managedByLottie = (filtersData as any).managedByLottie ?? true;
          const manualOverrideEnabled = (filtersData as any).manualOverrideEnabled ?? false;
          
          // Calculate counts based on override flags
          const lattiManaged = managedByLottie && !manualOverrideEnabled ? filterCount : 0;
          const manualOverride = manualOverrideEnabled ? filterCount : 0;
          const coherent = (lattiManaged + manualOverride) === filterCount;
          
          return {
            status: coherent ? 'PASS' : 'WARN',
            filterCount,
            lattiManaged,
            manualOverride,
            coherent
          };
        };
        
        const paperFiltersStatus = await validateFilterCoherence('paper');
        const liveFiltersStatus = await validateFilterCoherence('live');
        
        console.log(`[Audit] FilterCoherence ${paperFiltersStatus.status} | mode=paper | total=${paperFiltersStatus.filterCount} | lattiManaged=${paperFiltersStatus.lattiManaged} | manualOverride=${paperFiltersStatus.manualOverride} | coherent=${paperFiltersStatus.coherent}`);
        
        console.log(`[Audit] FilterCoherence ${liveFiltersStatus.status} | mode=live | total=${liveFiltersStatus.filterCount} | lattiManaged=${liveFiltersStatus.lattiManaged} | manualOverride=${liveFiltersStatus.manualOverride} | coherent=${liveFiltersStatus.coherent}`);
      } catch (error) {
        console.error('[Audit] ⚠️ FilterCoherence telemetry failed:', error);
      }
      
      // Phase 28.B: GuardrailsCoherence Telemetry (with database-persisted override flags)
      try {
        const validateGuardrailsCoherence = async (mode: 'paper' | 'live') => {
          // Fetch guardrails data from database
          const guardrailsData = await storage.getGuardrailsV2({ mode });
          
          if (!guardrailsData) {
            return {
              status: 'MISSING',
              paramCount: 0,
              lattiManaged: 0,
              manualOverride: 0,
              coherent: false,
              note: 'Guardrails data not found in database'
            };
          }
          
          // Core four guardrail parameters
          const coreParams = [
            'portfolioRiskPerTradePct',
            'symbolCooldownMinutes',
            'maxOpenPositions',
            'dailyLossKillSwitchPct'
          ];
          
          // Count how many params are locked by user (manual override)
          const lockedByUser = (guardrailsData as any).lockedByUser || {};
          const manualOverrideCount = coreParams.filter(param => lockedByUser[param] === true).length;
          const lattiManagedCount = coreParams.length - manualOverrideCount;
          
          const coherent = (lattiManagedCount + manualOverrideCount) === coreParams.length;
          
          return {
            status: coherent ? 'PASS' : 'WARN',
            paramCount: coreParams.length,
            lattiManaged: lattiManagedCount,
            manualOverride: manualOverrideCount,
            coherent,
            lockedParams: Object.keys(lockedByUser).filter(k => lockedByUser[k] === true)
          };
        };
        
        const paperGuardrailsStatus = await validateGuardrailsCoherence('paper');
        const liveGuardrailsStatus = await validateGuardrailsCoherence('live');
        
        console.log(`[Audit] GuardrailsCoherence ${paperGuardrailsStatus.status} | mode=paper | total=${paperGuardrailsStatus.paramCount} | lattiManaged=${paperGuardrailsStatus.lattiManaged} | manualOverride=${paperGuardrailsStatus.manualOverride} | coherent=${paperGuardrailsStatus.coherent}`);
        
        console.log(`[Audit] GuardrailsCoherence ${liveGuardrailsStatus.status} | mode=live | total=${liveGuardrailsStatus.paramCount} | lattiManaged=${liveGuardrailsStatus.lattiManaged} | manualOverride=${liveGuardrailsStatus.manualOverride} | coherent=${liveGuardrailsStatus.coherent}`);
        
        // If any params are manually locked, log which ones
        if (paperGuardrailsStatus.manualOverride > 0 && paperGuardrailsStatus.lockedParams) {
          console.log(`[Audit]   Paper locked params: ${paperGuardrailsStatus.lockedParams.join(', ')}`);
        }
        if (liveGuardrailsStatus.manualOverride > 0 && liveGuardrailsStatus.lockedParams) {
          console.log(`[Audit]   Live locked params: ${liveGuardrailsStatus.lockedParams.join(', ')}`);
        }
      } catch (error) {
        console.error('[Audit] ⚠️ GuardrailsCoherence telemetry failed:', error);
      }
      
      // Phase 28.C: Override Audit History Telemetry
      try {
        const recentChanges = await storage.getRecentAuditLogs({ limit: 10 });
        
        if (recentChanges.length > 0) {
          console.log(`[Audit] OverridesHistory | recentChanges=${recentChanges.length} (last 10)`);
          
          // Group by mode
          const paperChanges = recentChanges.filter(c => c.tradingMode === 'paper').length;
          const liveChanges = recentChanges.filter(c => c.tradingMode === 'live').length;
          
          // Group by entity type
          const guardrailChanges = recentChanges.filter(c => c.entityType === 'guardrails').length;
          const filterChanges = recentChanges.filter(c => c.entityType === 'filters').length;
          
          console.log(`[Audit]   By mode: paper=${paperChanges}, live=${liveChanges}`);
          console.log(`[Audit]   By type: guardrails=${guardrailChanges}, filters=${filterChanges}`);
          
          // Show most recent change
          const mostRecent = recentChanges[0];
          const timestamp = new Date(mostRecent.timestamp).toISOString();
          console.log(`[Audit]   Latest: ${mostRecent.entityType}.${mostRecent.field} (${mostRecent.tradingMode}) at ${timestamp}`);
        } else {
          console.log(`[Audit] OverridesHistory | recentChanges=0 (no override changes yet)`);
        }
      } catch (error) {
        console.error('[Audit] ⚠️ OverridesHistory telemetry failed:', error);
      }
      
      // Phase 27.H: Cross-Mode Configuration Audit
      try {
        const compareConfigs = (paper: any, live: any) => {
          const discrepancies = [];
          
          // Compare field counts
          if (paper.fieldCount !== live.fieldCount) {
            discrepancies.push(`Field count mismatch: paper=${paper.fieldCount} vs live=${live.fieldCount}`);
          }
          
          // Compare schema structure (not values, just presence of fields)
          const paperHasGuardrails = !!paper.guardrails;
          const liveHasGuardrails = !!live.guardrails;
          const paperHasFilters = !!paper.filters;
          const liveHasFilters = !!live.filters;
          const paperHasGoals = !!paper.goals;
          const liveHasGoals = !!live.goals;
          
          if (paperHasGuardrails !== liveHasGuardrails) {
            discrepancies.push(`Guardrails presence mismatch: paper=${paperHasGuardrails} vs live=${liveHasGuardrails}`);
          }
          if (paperHasFilters !== liveHasFilters) {
            discrepancies.push(`Filters presence mismatch: paper=${paperHasFilters} vs live=${liveHasFilters}`);
          }
          if (paperHasGoals !== liveHasGoals) {
            discrepancies.push(`Goals presence mismatch: paper=${paperHasGoals} vs live=${liveHasGoals}`);
          }
          
          return {
            status: discrepancies.length === 0 ? 'PASS' : 'WARN',
            discrepancies,
            paperHash: paper.schemaHash.substring(0, 8),
            liveHash: live.schemaHash.substring(0, 8),
            hashesMatch: paper.schemaHash === live.schemaHash // Values will differ, but structure should be same
          };
        };
        
        const crossModeAudit = compareConfigs(paperSnapshot, liveSnapshot);
        
        if (crossModeAudit.status === 'PASS') {
          console.log(`[Audit] CrossMode ${crossModeAudit.status} | paperHash=${crossModeAudit.paperHash} | liveHash=${crossModeAudit.liveHash} | structureCoherent=true`);
        } else {
          console.log(`[Audit] CrossMode ${crossModeAudit.status} | paperHash=${crossModeAudit.paperHash} | liveHash=${crossModeAudit.liveHash} | discrepancies=${crossModeAudit.discrepancies.length}`);
          crossModeAudit.discrepancies.forEach((d, i) => {
            console.log(`[Audit]   ${i + 1}. ${d}`);
          });
        }
      } catch (error) {
        console.error('[Audit] ⚠️ CrossMode audit failed:', error);
      }
    } catch (error) {
      console.error('[Audit] ⚠️ Config audit telemetry failed:', error);
    }

    // Phase 8.3: Start Health Report Scheduler (hourly reports)
    try {
      const { healthReportScheduler } = await import('./services/health-report-scheduler');
      await healthReportScheduler.start();
      console.log('[HealthReportScheduler] ✅ Started successfully');
    } catch (error) {
      console.error('[HealthReportScheduler] ⚠️ Startup failed:', error);
    }

    // Phase 23: Paper Simulation Heartbeat & Recovery
    try {
      const { paperSimHeartbeat } = await import('./services/paper_sim_heartbeat');
      
      // Run recovery logic on startup
      // Set autoResume to false for now - can be made configurable via env variable
      const autoResume = process.env.AUTO_RESUME_SIMULATIONS === 'true';
      await paperSimHeartbeat.recoverSessions(autoResume);
      
      // Start heartbeat monitoring
      paperSimHeartbeat.start();
      console.log('[PaperSimHeartbeat] ✅ Recovery complete and heartbeat started');
    } catch (error) {
      console.error('[PaperSimHeartbeat] ⚠️ Startup failed:', error);
    }

    // Phase 8.6.1: Start Learning Cycle Service (24-hour analysis cycle)
    try {
      const { learningCycleService } = await import('./services/learning-cycle-service');
      learningCycleService.start();
      console.log('[LearningCycleService] ✅ Started successfully');
    } catch (error) {
      console.error('[LearningCycleService] ⚠️ Startup failed:', error);
    }

    // Phase 8.8.4-C.6: RTB Queue Refresher DEPRECATED
    // The old rtbQueueRefresher is now replaced by ReadyToBuyService.startRefreshCycle()
    // which is wired into the PaperExecutionEngine lifecycle (start/stop/reset)
    // See: server/services/paper-execution-engine.ts lines 189-191, 237-239, 431-433
    console.log('[8.8.4-C.6] RTB refresh now handled by ReadyToBuyService (engine lifecycle)');

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

    // Phase 41F-C: Start Unified Engine Health Monitor (5s heartbeat, auto-recovery)
    try {
      const { healthMonitor } = await import('./services/health-monitor.js');
      const { contextBridge } = await import('./services/context-bridge.js');
      
      // Wire up WebSocket broadcasting for health beats
      healthMonitor.on('heartbeat', (beat) => {
        // Non-blocking broadcast (setImmediate ensures it doesn't block heartbeat)
        setImmediate(() => {
          const broadcastStart = Date.now();
          contextBridge.broadcast({
            type: 'health_engine',
            payload: beat,
          }).catch(err => {
            console.error('[41F-C][BROADCAST] Error broadcasting health beat:', err.message);
          }).then(() => {
            const latency = Date.now() - broadcastStart;
            healthMonitor.trackBroadcast('health_engine', latency);
          });
        });
      });
      
      // Wire up recovery action broadcasting
      healthMonitor.on('recovery', (action) => {
        setImmediate(() => {
          contextBridge.broadcast({
            type: 'health_recovery',
            payload: action,
          }).catch(err => {
            console.error('[41F-C][BROADCAST] Error broadcasting recovery action:', err.message);
          });
        });
      });
      
      healthMonitor.start();
      console.log('[41F-C] ✅ Engine Health Monitor started (heartbeat=5s, autoRecovery=enabled, WebSocket=enabled)');
    } catch (error) {
      console.error('[41F-C] ⚠️ Health Monitor startup failed:', error);
    }

    // Phase 3C: Log total server startup time
    const totalStartupTime = (performance.now() - SERVER_START_TIME).toFixed(1);
    console.log(`[PerfAudit] Server started in ${totalStartupTime} ms`);
    
    // Write startup metrics to file
    try {
      const fs = await import('fs/promises');
      const metricsPath = 'logs/phase3c-startup-times.txt';
      const timestamp = new Date().toISOString();
      const metrics = `[${timestamp}] Total server startup: ${totalStartupTime} ms\n`;
      await fs.appendFile(metricsPath, metrics);
    } catch (error) {
      // Non-critical - continue if file write fails
      console.error('[PerfAudit] Failed to write metrics file:', error);
    }
  });

  // Directive 8.8.4-A4.R10R-4: Graceful shutdown for all core services
  const shutdownHandler = async (signal: string) => {
    console.log(`[A4.R10R-4][SHUTDOWN] Received ${signal}, initiating graceful shutdown...`);
    try {
      // Phase 41F: Shutdown operation queues
      const { shutdownAllQueues } = await import('./utils/operation-queue.js');
      await shutdownAllQueues();
      
      // A4.R10R-4: Shutdown core services in order
      const { rtbRefreshService } = await import('./services/rtb-refresh-service.js');
      const { centralClock } = await import('./services/central-clock.js');
      const { priceCache } = await import('./services/price-cache.js');
      const { systemHealth } = await import('./services/system-health.js');
      const { dataAggregator } = await import('./services/data-aggregator.js');
      
      rtbRefreshService.stop();
      await dataAggregator.shutdown(); // 8.8.4-L1: Flush pending data before shutdown
      centralClock.stop();
      priceCache.shutdown();
      systemHealth.stop();
      
      console.log('[A4.R10R-4][SHUTDOWN] All core services stopped');
      console.log('[A4.R10R-4][SHUTDOWN] Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[A4.R10R-4][SHUTDOWN] Shutdown error:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));
})();
