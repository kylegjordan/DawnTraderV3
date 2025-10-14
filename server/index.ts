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

  // Start Walter Health Monitor (async, non-blocking)
  // TODO: Fix JWT import issue with tsx/ES modules before enabling
  // import('./services/walter-health-monitor').then(({ walterHealthMonitor }) => {
  //   walterHealthMonitor.start().catch((error) => {
  //     console.error('[Server] Failed to start Walter Health Monitor:', error);
  //   });
  // });

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

      // Register tasks
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

  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
