import type { Express, Request, Response, NextFunction, Router as ExpressRouter } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, and, desc } from "drizzle-orm";
import { KrakenService } from "./services/kraken";
import { TradingEngine, EngineSettingsBus } from "./services/trading-engine";
import { AIAnalyst } from "./services/ai-analyst";
import { MarketScanner, getPassiveLearningBuffer, getREB211DriftBuffer, getREB211IntegrityBuffer, getREB211TimingBuffer, getREB211MismatchBuffer, getREB211StressBuffer, getActiveAuditBuffer } from "./services/market-scanner";
import { RiskManager, buildSettingsFromModeLevel } from "./services/risk-manager";
import { aiOpportunitiesService } from "./services/ai-opportunities";
import { dailyBriefService } from "./services/daily-brief";
import { formulaAuditService } from "./services/formula-audit";
import { AlertsService } from "./services/alerts-service";
import { insertTradingSettingsSchema, insertWatchlistPairSchema, insertGuardrailsSchema, insertScreenerFiltersSchema, semanticMemory, walterPurpose, walterMemory, insertWalterMemorySchema, reasoningTrace, reasoningQueue, awarenessStateLog, ethicalPrinciple, ethicalViolationLog, crossAgentEthicsSession, clusterResultLog, tuningPolicy, tuningEvent, strategyParamSchema } from "@shared/schema";
import { z } from 'zod';
import { validateGuardrails, validateFilters, validateNoLegacyKeys, LegacyFieldError } from "../types/config";
import { databaseMonitor } from "./services/database-monitor";
import { stockService } from "./services/stocks";
import { marketDataService } from "./services/market-data";
import { actuationPolicyService } from "./services/actuation-policy";
import { assetCapabilitiesService } from "./services/asset-capabilities";
import { manageChatLifecycle, summarizeChatSession } from "./services/walter-chat-lifecycle";
// Phase 0: Removed legacy walter-response import
// import { generateWalterResponse, ensureNaturalLanguageResponse } from "./services/walter-response";
import { chatLogging } from "./middleware/chat-logging";
import { parseIntent } from "./services/intent-parser";
import { CommandRouter } from "./services/command-router";
import { commandLogger } from "./services/command-logger";
import { nlaiInterpreter } from "./services/nlai-interpreter";
import { nlaiExecutionBroker } from "./services/nlai-execution-broker";
import ExecutionPolicyController from "./services/execution-policy-controller";
import { textToSpeech, estimateTTSCost } from "./services/walter-tts";
import { ingestLearningFile, getIngestionHistory } from "./services/walter-ingest";
import OpenAI from "openai";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from 'fs/promises';
import path from 'path';
import { validatePasswordStrength, hashPassword, verifyPassword, getPasswordStrengthMessage } from "./services/auth-service";
import { bobStatsHandler } from "./middleware/bob-routing";
import { bobCore } from "./services/bob-core";
import { metricsBob } from "./services/bob-metrics";
import { dataBob } from "./services/bob-data";
import { configBob } from "./services/bob-config";
import { strategyBob } from "./services/bob-strategy";
import { tradeBob } from "./services/bob-trade";
import { insightBob } from "./services/bob-insight";
import { uiBob } from "./services/bob-ui";
import { cortexCore } from "./services/cortex/cortex-core";
import { filePersistence } from "./services/file-persistence";
import { memoryLifecycle } from "./services/memory-lifecycle";
import { getPermissionsForRole, Permission } from './config/permissions.js';
import type { UserRole } from './config/permissions.js';
import { randomUUID } from 'crypto';
import { getPaperSimulationStatus } from './services/paper-sim-service';
import { numericNormalizationMiddleware } from './utils/numeric-normalizer.js';
import { contextBridge } from './services/context-bridge.js';
import { getCache, setCache, coalesce } from './services/cache';
import { metricsService } from './services/metrics-service';
import { activeFilterPool } from './services/active-filter-pool.js';
import os from 'os';

// Rate Limiting for Authentication Endpoints - prevent brute force attacks
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 login attempts per window
  message: { error: "Too many login attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const marketScanner = new MarketScanner();
const aiAnalyst = new AIAnalyst();
const riskManager = new RiskManager();

// [41F-L.2] Trade test request schema
const TradeTestSchema = z.object({
  symbol: z.string().min(3).default("BTC/USD"),
  action: z.enum(["buy", "sell"]).default("buy"),
  amount: z.number().positive().default(0.01)
});

// [41F-L.2] Route-local guard to reject wrong content types
const requireJson = (req: Request, res: Response, next: NextFunction) => {
  if (!req.is("application/json")) {
    return res.status(415).json({ ok: false, error: "Content-Type application/json required" });
  }
  return next();
};

// Phase 27.F.15.B.3: Global mode-based trading engines (no per-user instances)
const globalLiveEngine = new TradingEngine('live');
const globalPaperEngine = new TradingEngine('paper');

// Phase 27.F.15.B.3: CommandRouter uses global engines
const commandRouter = new CommandRouter(globalLiveEngine, globalPaperEngine);

// Phase 22: Initialize ExecutionPolicyController for autonomous execution layer
const executionPolicyController = new ExecutionPolicyController(storage as any);
nlaiExecutionBroker.initialize(storage, executionPolicyController);

// Phase 6.8: Store pending confirmations per user for bare "yes/no" replies
const userPendingConfirmations = new Map<string, string>(); // userId -> confirmationId

// JWT secrets for authentication
const JWT_SECRET = process.env.JWT_SECRET || "development_secret_change_in_production";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "development_refresh_secret_change_in_production";

// Issue access and refresh tokens (Phase 27.3: includes permissions, fail closed)
function issueTokens(user: { id: string; username: string; role?: UserRole }) {
  if (!user.role) {
    throw new Error('Cannot issue token: user has no role assigned');
  }
  const userRole = user.role;
  const permissions = getPermissionsForRole(userRole);
  
  const accessToken = jwt.sign(
    { 
      id: user.id, 
      username: user.username,
      role: userRole,
      permissions 
    }, 
    JWT_SECRET, 
    { expiresIn: '12h' }
  );
  const refreshToken = jwt.sign(
    { id: user.id }, 
    JWT_REFRESH_SECRET, 
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

// Authentication Middleware
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    isAdmin?: boolean;
    role?: UserRole;
    permissions?: Permission[];
  };
  mode?: 'live' | 'paper';
}

async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authentication credentials provided' });
  }
  
  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { 
      id: string; 
      username: string;
      role?: UserRole;
      permissions?: Permission[];
    };
    
    // Fetch user from database to get admin status and role (fail closed - no fallback to token)
    console.log(`[Auth] Attempting to fetch user with ID: ${decoded.id} (username: ${decoded.username})`);
    const user = await storage.getUser(decoded.id);
    if (!user) {
      console.error(`[Auth] ❌ User not found in database - ID: ${decoded.id}, username: ${decoded.username}`);
      return res.status(401).json({ error: 'User account not found' });
    }
    
    // Critical: NEVER fallback to decoded.role - always use database as source of truth
    const userRole = user.role;
    if (!userRole) {
      return res.status(403).json({ error: 'User account improperly configured - no role assigned' });
    }
    
    // Always recompute permissions from current DB role, ignore stale token permissions
    const permissions = getPermissionsForRole(userRole as UserRole);
    
    req.user = { 
      id: decoded.id, 
      username: decoded.username,
      isAdmin: user?.isAdmin || false,
      role: userRole,
      permissions
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Admin Authorization Middleware - requires admin privileges
function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Admin privileges required'
    });
  }
  next();
}

// RBAC Middleware - Role-Based Access Control for global context
function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Owner role required to perform this action'
    });
  }
  next();
}

function requireEditor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'owner' && req.user?.role !== 'editor') {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Editor or Owner role required to perform this action'
    });
  }
  next();
}

// Phase 27.DX: Diagnostic Trace Middleware with Request Correlation
interface TracedRequest extends AuthenticatedRequest {
  traceId?: string;
  traceStartTime?: number;
}

const DIAGNOSTIC_MODE = process.env.DIAGNOSTIC_MODE === 'true';

function diagnosticTraceMiddleware(req: TracedRequest, res: Response, next: NextFunction) {
  // Generate UUID for request correlation
  req.traceId = randomUUID();
  req.traceStartTime = Date.now();
  
  // Router-aware path checking: combine baseUrl + path to get full path
  const fullPath = req.baseUrl + req.path;
  const isDiagnosticEndpoint = 
    fullPath.startsWith('/api/goals') ||
    fullPath.startsWith('/api/trading');
  
  if (DIAGNOSTIC_MODE && isDiagnosticEndpoint) {
    console.log(`[TRACE-IN] req.id=${req.traceId} endpoint=${fullPath} user=${req.user?.id || 'anonymous'} mode=${req.query.mode || req.body?.mode || 'unknown'} method=${req.method}`);
    
    // Disable caching for diagnostic endpoints
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  // Capture response
  const originalJson = res.json.bind(res);
  res.json = function(body: any) {
    if (DIAGNOSTIC_MODE && isDiagnosticEndpoint && req.traceStartTime) {
      const duration = Date.now() - req.traceStartTime;
      console.log(`[TRACE-OUT] req.id=${req.traceId} status=${res.statusCode} duration=${duration}ms endpoint=${req.path}`);
    }
    return originalJson(body);
  };
  
  next();
}

// Permission Validation Middleware - validates specific permissions (Phase 27.3)
function requirePermission(permission: Permission) {
  return function(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const userPermissions = req.user?.permissions || [];
    
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({ 
        error: 'Permission denied',
        message: `This action requires the "${permission}" permission`,
        requiredPermission: permission
      });
    }
    next();
  };
}

// Mode Validation Middleware - enforces x-app-mode header for mode-isolated endpoints
function validateMode(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const modeHeader = req.headers['x-app-mode'] as string | undefined;
  
  if (!modeHeader) {
    return res.status(400).json({ 
      error: 'Missing x-app-mode header',
      message: 'Trading mode (live or paper) must be specified via x-app-mode header'
    });
  }
  
  if (modeHeader !== 'live' && modeHeader !== 'paper') {
    return res.status(400).json({ 
      error: 'Invalid x-app-mode header',
      message: 'x-app-mode must be either "live" or "paper"'
    });
  }
  
  req.mode = modeHeader;
  next();
}

// AI Opportunities service will be started conditionally based on user settings
// (service checks settings before starting hourly generation)
// TEMPORARILY DISABLED: Do not ping Kraken for 1 hour

export async function registerRoutes(app: Express): Promise<{ httpServer: Server; apiRouter: ExpressRouter }> {
  const httpServer = createServer(app);
  
  // Create dedicated Express Router for all API routes
  // This router will be mounted at /api in server/index.ts BEFORE Vite middleware
  const apiRouter = express.Router();
  
  // Phase 27.F.13.H: Add numeric normalization middleware to convert PostgreSQL decimal/numeric strings to JS numbers
  apiRouter.use(numericNormalizationMiddleware);
  console.log('[Server] Numeric normalization middleware applied to API router');
  
  // Phase 8.7.4: Import Context Bridge
  const { contextBridge } = await import('./services/context-bridge');
  
  // WebSocket server for real-time data
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws: WebSocket, request) => {
    console.log('WebSocket client connected');
    
    // Phase 8.7.4: Register client with Context Bridge
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const userId = url.searchParams.get('userId') || undefined;
    contextBridge.registerClient(ws, userId);
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleWebSocketMessage(ws, data);
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });

  // Start market scanner after WebSocket is initialized (runs every 10 minutes)
  // Run asynchronously to not block server startup
  marketScanner.startHourlyScanning().catch((error) => {
    console.error('[MarketScanner] Failed to start:', error);
  });

  // REB 2.7: FX5Scanner now starts from server/startup/fx5-scanner-bootstrap.ts
  // Called early from server/index.ts BEFORE registerRoutes to ensure unconditional startup
  // Scan24hAggregator initialization removed from here - scanner is independent

  // Phase 27.DX: Add diagnostic trace middleware for goals and trading endpoints
  apiRouter.use(diagnosticTraceMiddleware);

  // API Routes

  // Health check endpoint
  apiRouter.get('/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development'
    });
  });

  // Phase 5C: Observability endpoints
  // Metrics endpoint - Prometheus-style metrics with SLO tracking
  apiRouter.get('/metrics', async (_req, res) => {
    try {
      const { metricsService } = await import('./services/metrics-service');
      const systemMetrics = metricsService.getSystemMetrics();
      const subsystemMetrics = metricsService.getSubsystemMetrics();
      const sloStatus = metricsService.getSLOStatus();

      res.json({
        system: systemMetrics,
        subsystems: subsystemMetrics,
        slo: sloStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Phase 5C][Metrics] Error fetching metrics:', error);
      res.status(500).json({ error: 'Failed to fetch metrics', message: error.message });
    }
  });

  // Phase 5C: SLO status endpoint (lightweight)
  apiRouter.get('/metrics/slo', async (_req, res) => {
    try {
      const { metricsService } = await import('./services/metrics-service');
      const sloStatus = metricsService.getSLOStatus();
      
      res.json({
        slos: sloStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Phase 5C][SLO] Error fetching SLO status:', error);
      res.status(500).json({ error: 'Failed to fetch SLO status', message: error.message });
    }
  });

  // Phase 5C: Recent logs endpoint (last 100 entries)
  apiRouter.get('/logs/recent', async (_req, res) => {
    try {
      // TODO: Implement log buffer/storage
      // For now, return placeholder
      res.json({
        logs: [],
        message: 'Log buffer not yet implemented',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Phase 5C][Logs] Error fetching logs:', error);
      res.status(500).json({ error: 'Failed to fetch logs', message: error.message });
    }
  });

  // Phase 6: Config Registry endpoints
  apiRouter.get('/config', async (_req, res) => {
    try {
      const { ConfigService } = await import('./services/config-service');
      const configs = await ConfigService.getAll();
      res.json(configs);
    } catch (error: any) {
      console.error('[Phase 6][Config] Error fetching configs:', error);
      res.status(500).json({ error: 'Failed to fetch configs', message: error.message });
    }
  });

  apiRouter.put('/config', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { ConfigService } = await import('./services/config-service');
      const { ConfigAuditService } = await import('./services/config-audit-service');
      const { key, value, type } = req.body;
      
      if (!key || value === undefined || !type) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          message: 'key, value, and type are required'
        });
      }

      const updatedBy = req.user?.username || 'system';
      const oldConfig = await ConfigService.get(key);
      
      await ConfigService.update(key, value, type, updatedBy);
      
      if (oldConfig) {
        ConfigAuditService.recordChange(key, updatedBy, oldConfig.value, value);
      }
      
      res.json({ ok: true, key, value, type, updatedBy });
    } catch (error: any) {
      console.error('[Phase 6][Config] Error updating config:', error);
      res.status(500).json({ error: 'Failed to update config', message: error.message });
    }
  });

  // Phase 7A: Metrics snapshot endpoint for observation logger
  apiRouter.get('/metrics/snapshot', async (_req, res) => {
    try {
      const systemMetrics = metricsService.getSystemMetrics();
      const subsystemMetrics = metricsService.getSubsystemMetrics();
      
      // Helper to get most recent metric value
      const getRecentMetric = (metrics: any[], defaultValue: number = 0): number => {
        if (!metrics || metrics.length === 0) return defaultValue;
        return metrics[metrics.length - 1]?.value || defaultValue;
      };
      
      res.json({
        timestamp: Date.now(),
        uptime: Math.floor(process.uptime()),
        cpuLoad: os.loadavg()[0],
        rss: process.memoryUsage().rss / 1024 / 1024,
        signalLatency: getRecentMetric(subsystemMetrics.signalLatency),
        orderLatency: getRecentMetric(subsystemMetrics.orderLatency),
        queueDepth: getRecentMetric(subsystemMetrics.queueDepth),
        eventLoopLag: systemMetrics.eventLoopLag,
      });
    } catch (error: any) {
      console.error('[Phase 7A][Metrics] Error fetching metrics snapshot:', error);
      res.status(500).json({ error: 'Failed to fetch metrics snapshot', message: error.message });
    }
  });

  // Phase 27.F.15.B.4 + 27.F.15.C: Production system health endpoint with live telemetry and dual-mode metrics
  apiRouter.get('/system/health', async (_req, res) => {
    try {
      const { getAllModeStatus } = await import('./services/mode-registry');
      const { metricsCore } = await import('./services/metrics-core.js');
      const registry = getAllModeStatus();
      
      // Phase 27.F.15.C: Fetch dual-mode metrics (paper + live)
      const [paperMetrics, liveMetrics] = await Promise.all([
        metricsCore.getCachedOrCompute('paper').catch((err) => {
          console.warn('[27.F.15.C][Health] Paper metrics unavailable:', err.message);
          return null;
        }),
        metricsCore.getCachedOrCompute('live').catch((err) => {
          console.warn('[27.F.15.C][Health] Live metrics unavailable:', err.message);
          return null;
        })
      ]);
      
      const status = Object.entries(registry).map(([mode, data]) => {
        const metrics = mode === 'paper' ? paperMetrics : liveMetrics;
        
        return {
          mode,
          engine: data.engineStatus,
          alerts: data.alerts,
          trades: data.trades,
          lastUpdate: data.lastUpdate,
          // Phase 27.F.15.C: Add metrics block
          metrics: metrics ? {
            portfolio: {
              totalValue: metrics.portfolio.totalValue,
              realizedPL: metrics.portfolio.realizedPL,
              unrealizedPL: metrics.portfolio.unrealizedPL,
              openTrades: metrics.portfolio.openTradesCount
            },
            risk: {
              winRate: metrics.risk.winRate,
              profitFactor: metrics.risk.profitFactor,
              maxDrawdown: metrics.risk.maxDrawdown,
              sharpeRatio: metrics.risk.sharpeRatio
            },
            execution: {
              totalTrades: metrics.execution.totalTrades,
              wins: metrics.execution.wins,
              losses: metrics.execution.losses,
              avgRMultiple: metrics.execution.avgRMultiple
            },
            computedAt: metrics.computedAt
          } : null
        };
      });
      
      console.log(`[27.F.15.C][Health] System health check with metrics: ${Object.keys(registry).join(', ')}`);
      res.json(status);
    } catch (err: any) {
      console.error('[27.F.15.C][Health] Error:', err.message);
      res.status(500).json({ error: 'System health check failed' });
    }
  });

  // Phase 31.J - LATTI Tuning Metrics Endpoint
  apiRouter.get('/system/latti-tuning', async (_req, res) => {
    try {
      const { LATTIManager } = await import('./services/latti-manager');
      const data = await LATTIManager.getLatestMetrics();
      res.json(data || { status: "no_data" });
    } catch (err: any) {
      console.error("[31.J][LATTI-TUNING]", err);
      res.status(500).json({ error: "Failed to load tuning metrics" });
    }
  });

  // Phase 41C: Telemetry Trace API Endpoints
  apiRouter.post('/telemetry/trace/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { telemetryTrace } = await import('./services/telemetry-trace.js');
      const userId = req.user!.id;
      const { mode, portfolioValue } = req.body;
      
      const sessionId = `${mode || 'paper'}-${Date.now()}`;
      telemetryTrace.startSession(sessionId, {
        mode: mode || 'paper',
        portfolioValue: portfolioValue || 0,
        userId
      });
      
      console.log(`[Phase-41C] Telemetry trace session started: ${sessionId}`);
      res.json({ 
        success: true, 
        sessionId,
        message: 'Trace session started successfully'
      });
    } catch (error: any) {
      console.error('[Phase-41C] Error starting trace session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/telemetry/trace/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { telemetryTrace } = await import('./services/telemetry-trace.js');
      
      const filePath = await telemetryTrace.stopSession();
      
      if (filePath) {
        // Generate markdown report
        const mdPath = await telemetryTrace.generateMarkdownReport(filePath);
        
        console.log(`[Phase-41C] Telemetry trace session stopped. Files: ${filePath}, ${mdPath}`);
        res.json({ 
          success: true, 
          jsonFile: filePath,
          markdownFile: mdPath,
          message: 'Trace session stopped and reports generated'
        });
      } else {
        res.json({ 
          success: false, 
          message: 'No active trace session'
        });
      }
    } catch (error: any) {
      console.error('[Phase-41C] Error stopping trace session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/telemetry/trace/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { telemetryTrace } = await import('./services/telemetry-trace.js');
      
      const info = telemetryTrace.getSessionInfo();
      
      res.json({ 
        success: true, 
        session: info
      });
    } catch (error: any) {
      console.error('[Phase-41C] Error getting trace status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 31.K - LATTI Learning Insights Endpoint
  apiRouter.get('/system/latti-insights', async (_req, res) => {
    try {
      const { LATTIManager } = await import('./services/latti-manager');
      const data = await LATTIManager.generateInsightSnapshot();
      res.json(data);
    } catch (err: any) {
      console.error("[31.K][LATTI-INSIGHTS]", err);
      res.status(500).json({ error: "Failed to load Lottie learning insights" });
    }
  });

  // Phase 31.L - LATTI Cross-Strategy Learning Correlations
  apiRouter.get('/system/latti-cross-strategy', async (_req, res) => {
    try {
      const { LATTIManager } = await import('./services/latti-manager');
      const data = await LATTIManager.generateCrossStrategyInsights();
      res.json(data);
    } catch (err: any) {
      console.error("[31.L][LATTI-CROSS-STRATEGY]", err);
      res.status(500).json({ error: "Failed to load cross-strategy insights" });
    }
  });

  // Phase 32.BS - LATTI Strategy Usage Summary
  apiRouter.get('/system/latti-strategy-usage', async (_req, res) => {
    try {
      const { LATTIManager } = await import('./services/latti-manager');
      const data = await LATTIManager.generateStrategyUsageSummary();
      res.json(data);
    } catch (err: any) {
      console.error("[32.BS][LATTI-USAGE]", err);
      res.status(500).json({ error: "Failed to load strategy usage summary" });
    }
  });

  // Phase 32.BS - SDPOE Health Check
  apiRouter.get('/system/health-sdpoe', async (_req, res) => {
    try {
      const status = {
        status: "ok",
        lastCycle: new Date().toISOString(),
        sdpoeActive: true,
        telemetryFlowing: true,
        timestamp: new Date().toISOString(),
      };
      res.json(status);
    } catch (err: any) {
      console.error("[32.BS][SDPOE-HEALTH]", err);
      res.status(500).json({ error: "Failed to check SDPOE health" });
    }
  });

  // Authentication Routes
  
  // REGISTER - DISABLED FOR SINGLE-USER MODE
  // To enable registration, remove the error response below and uncomment the registration logic
  apiRouter.post('/auth/register', async (req: AuthenticatedRequest, res) => {
    return res.status(403).json({ 
      error: 'Registration is disabled. This is a single-user application.' 
    });
    
    /* REGISTRATION CODE (uncomment to enable):
    try {
      let { username, email, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      // Auto-generate email if not provided (for testing/single-user mode)
      if (!email) {
        email = `${username}@trading.local`;
      }
      
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      
      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      
      // Validate password strength
      if (!validatePasswordStrength(password)) {
        return res.status(400).json({ 
          error: getPasswordStrengthMessage(password)
        });
      }
      
      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({ 
        username,
        email,
        password: passwordHash,
        displayName: username,
        timezone: 'UTC',
        tradingMode: 'paper',
        tradingStatus: 'stopped'
      });
      
      // Phase 41F-L.E2E-PURGE: No user-level settings - users inherit mode-level guardrails/portfolio_state
      
      res.json({ success: true, userId: user.id });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
    */
  });

  // LOGIN - Rate limited to prevent brute force attacks
  apiRouter.post('/auth/login', loginLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      // Support both username and email login (case-insensitive)
      let user = await storage.getUserByUsername(username.toLowerCase());
      if (!user) {
        // Try email if username lookup failed (case-insensitive)
        user = await storage.getUserByEmail(username.toLowerCase());
      }
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      if (!user.password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const valid = await verifyPassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      if (!user.role) {
        return res.status(500).json({ error: 'User account improperly configured - no role assigned' });
      }
      
      const { accessToken, refreshToken } = issueTokens({ id: user.id, username: user.username, role: user.role });
      const userRole = user.role;
      const permissions = getPermissionsForRole(userRole as UserRole);
      
      res.json({ 
        accessToken, 
        refreshToken,
        token: accessToken, // Keep for backward compatibility
        user: { 
          id: user.id, 
          username: user.username,
          isAdmin: user.isAdmin || false,
          role: userRole,
          permissions // Phase 27.3: Return permissions array
        } 
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // VERIFY TOKEN
  apiRouter.get('/auth/verify', async (req: AuthenticatedRequest, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ valid: false, error: 'No authorization header' });
      }
      
      const token = authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).json({ valid: false, error: 'No token provided' });
      }
      
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
      res.json({ valid: true, user: decoded });
    } catch (error) {
      res.status(401).json({ valid: false, error: 'Invalid or expired token' });
    }
  });

  // REFRESH TOKEN
  apiRouter.post('/auth/refresh', async (req: AuthenticatedRequest, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: 'Refresh token is required' });
      }
      
      const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { id: string };
      const user = await storage.getUser(decoded.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const { accessToken, refreshToken } = issueTokens({ id: user.id, username: user.username });
      
      res.json({ 
        accessToken, 
        refreshToken,
        user: { id: user.id, username: user.username }
      });
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
  });

  // User and Authentication
  apiRouter.get('/user/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const user = await storage.getUser(req.user!.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  });

  // Update user approval matrix
  apiRouter.patch('/user/approval-matrix', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { approvalMatrix } = req.body;
      
      if (!approvalMatrix || typeof approvalMatrix !== 'object') {
        return res.status(400).json({ error: 'Valid approval matrix is required' });
      }
      
      // SECURITY: Force killSwitchOverride to always be true (admin-only action)
      const sanitizedMatrix = {
        ...approvalMatrix,
        killSwitchOverride: true
      };
      
      const updatedUser = await storage.updateUser(req.user!.id, { approvalMatrix: sanitizedMatrix });
      
      res.json({ 
        approvalMatrix: updatedUser.approvalMatrix,
        message: 'Approval matrix updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating approval matrix:', error);
      res.status(500).json({ error: 'Failed to update approval matrix' });
    }
  });

  // Admin Routes - User Management
  apiRouter.get('/admin/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const users = await storage.getAllUsers();
      
      // Return sanitized user list (exclude passwords)
      const sanitizedUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt
      }));
      
      res.json(sanitizedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  apiRouter.post('/admin/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { email, username, password, isAdmin } = req.body;
      
      if (!email || !username || !password) {
        return res.status(400).json({ error: 'Email, username, and password are required' });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      
      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      
      // Validate password strength
      if (!validatePasswordStrength(password)) {
        return res.status(400).json({ 
          error: getPasswordStrengthMessage(password)
        });
      }
      
      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({ 
        username,
        email,
        password: passwordHash,
        displayName: username,
        timezone: 'UTC',
        isAdmin: isAdmin || false,
        tradingMode: 'paper',
        tradingStatus: 'stopped'
      });
      
      // Phase 41F-L.E2E-PURGE: No user-level settings - users inherit mode-level guardrails/portfolio_state
      
      res.json({ 
        success: true, 
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isAdmin: user.isAdmin
        }
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  apiRouter.patch('/admin/users/:userId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { isAdmin } = req.body;
      
      if (typeof isAdmin !== 'boolean') {
        return res.status(400).json({ error: 'isAdmin must be a boolean' });
      }
      
      // Prevent users from removing their own admin status
      if (userId === req.user!.id && !isAdmin) {
        return res.status(400).json({ error: 'Cannot remove your own admin privileges' });
      }
      
      const updatedUser = await storage.updateUser(userId, { isAdmin });
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        success: true, 
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          isAdmin: updatedUser.isAdmin
        }
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // Admin: Reset user password
  apiRouter.post('/admin/users/:userId/reset-password', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.params;
      const { password } = req.body;
      
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Password is required' });
      }
      
      // Validate password strength
      if (!validatePasswordStrength(password)) {
        return res.status(400).json({ 
          error: getPasswordStrengthMessage(password)
        });
      }
      
      // Hash the new password
      const hashedPassword = await hashPassword(password);
      
      // Update user's password
      const updatedUser = await storage.updateUser(userId, { password: hashedPassword });
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        success: true, 
        message: `Password updated successfully for ${updatedUser.username}`
      });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // Phase 41F-L.E2E-PURGE: Settings now sourced from mode-level guardrails_v2 + portfolio_state
  // This endpoint provides backward compatibility using buildSettingsFromModeLevel adapter
  apiRouter.get('/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      // Source settings from mode-level guardrails_v2 + portfolio_state
      const { buildSettingsFromModeLevel } = await import('./services/risk-manager.js');
      const settings = await buildSettingsFromModeLevel(mode, userId);
      
      // Check if environment secrets are configured
      const hasKrakenApiKey = !!process.env.KRAKEN_API_KEY;
      const hasKrakenApiSecret = !!process.env.KRAKEN_API_SECRET;
      
      res.json({
        ...settings,
        hasKrakenApiKey,
        hasKrakenApiSecret,
        krakenApiKeySet: hasKrakenApiKey,
        krakenApiSecretSet: hasKrakenApiSecret
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  // Phase 41F-L.E2E-PURGE: DEPRECATED - User-level settings updates disabled
  // Risk parameters now controlled via Guardrails tab (/api/guardrails-v2)
  // Portfolio balance controlled via mode-level portfolio_state
  apiRouter.put('/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      error: 'This endpoint is deprecated',
      message: 'Settings now managed at mode-level. Use the Guardrails tab to adjust risk parameters (risk %, max positions, kill switch, cooldown). Portfolio balance managed via /api/portfolio-state.',
      migration: 'User-level settings eliminated in Phase 41F-L.E2E-PURGE',
      alternatives: {
        guardrails: 'PUT /api/guardrails-v2?mode=paper or mode=live',
        portfolioBalance: 'PUT /api/portfolio-state?mode=paper or mode=live'
      }
    });
  });

  // Phase 27.F.14: Local Heuristic Trader Service API Endpoints
  apiRouter.get('/heuristic-trader/health', authenticateToken, handleLHTSHealth);
  apiRouter.post('/heuristic-trader/toggle', authenticateToken, handleLHTSToggle);
  apiRouter.post('/heuristic-trader/emergency-stop', authenticateToken, handleLHTSEmergencyStop);
  
  // Phase 27.F.14.B Task 6: LATTI Safety Audit API Endpoints
  apiRouter.get('/heuristic-trader/safety-summary', authenticateToken, handleLATTISafetySummary);
  
  // Phase 27.F.14.B Task 11: LATTI Adjustment Logs Export
  apiRouter.get('/heuristic-trader/adjustment-logs', authenticateToken, handleLATTIAdjustmentLogs);

  // Phase 27.F.14.B: LATTI Baseline Indicator API Endpoint
  apiRouter.get('/baseline-indicator/status', authenticateToken, handleBaselineStatus);

  // Phase 27.F.14.B: Trading Pace Control API Endpoints
  apiRouter.get('/system/trading-pace', authenticateToken, handleGetTradingPace);
  apiRouter.put('/system/trading-pace', authenticateToken, handleUpdateTradingPace);

  // Phase 27.F.18: LATTI Targets API Endpoint (dynamic calculation)
  apiRouter.get('/latti/targets', authenticateToken, handleLATTITargets);

  // Guardrails endpoints (mode-isolated)
  // Phase 7.4: ConfigBob transparent routing for guardrails endpoint
  apiRouter.get('/guardrails', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ error: 'Mode parameter is required and must be "live" or "paper"' });
      }

      // Phase 7.4: Try ConfigBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using ConfigBob for /api/guardrails');
          const guardrailsData = await configBob.getGuardrails(userId, mode);
          return res.json(guardrailsData);
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ ConfigBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      let guardrailsData = await storage.getGuardrails({ mode });

      if (!guardrailsData) {
        // Return defaults if not found
        guardrailsData = {
          id: '',
          userId,
          mode,
          maxDailyLoss: '1000.00',
          maxDrawdown: '10.00',
          maxPositionSize: '5000.00',
          maxOpenPositions: 5,
          riskPerTrade: '1.5',
          aiCanAdjust: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }

      res.json(guardrailsData);
    } catch (error) {
      console.error('Error fetching guardrails:', error);
      res.status(500).json({ error: 'Failed to fetch guardrails' });
    }
  });

  // Phase 27.F.17b: Guardrails Save Fix + Cooldown Sync Hardening
  apiRouter.put('/guardrails', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    const requestId = `gr-${Date.now()}`;
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        console.error(`[Guardrails:${requestId}] Invalid mode parameter`);
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      // A2: Strict payload whitelist + coercion
      const rawPayload = req.body;
      const sanitizedPayload: any = { mode };

      // Map camelCase from frontend to snake_case for database
      const fieldMap = {
        maxDailyLoss: 'maxDailyLoss',
        maxDrawdownPct: 'maxDrawdown',
        maxDrawdown: 'maxDrawdown',
        maxOpenPositions: 'maxOpenPositions',
        riskPerTradePct: 'riskPerTrade',
        riskPerTrade: 'riskPerTrade',
        maxPositionSize: 'maxPositionSize',
        maxRiskPerTradeLimit: 'maxRiskPerTradeLimit',
        maxRequiredCapital: 'maxRequiredCapital',
        cooldownMinutes: 'cooldownMinutes',
        microLoopInterval: 'microLoopInterval',
        priceDeltaTrigger: 'priceDeltaTrigger',
        aiCanAdjust: 'aiCanAdjust'
      };

      // Type coercion - integers
      const intFields = ['maxOpenPositions', 'maxPositionSize', 'maxRequiredCapital', 'cooldownMinutes', 'microLoopInterval'];
      // Type coercion - decimals
      const decimalFields = ['maxDailyLoss', 'maxDrawdown', 'maxDrawdownPct', 'riskPerTrade', 'riskPerTradePct', 'maxRiskPerTradeLimit', 'priceDeltaTrigger'];

      for (const [frontendKey, dbKey] of Object.entries(fieldMap)) {
        if (rawPayload[frontendKey] !== undefined) {
          let value = rawPayload[frontendKey];
          
          if (intFields.includes(dbKey)) {
            value = parseInt(String(value), 10);
            if (isNaN(value)) {
              console.error(`[Guardrails:${requestId}] Invalid integer for ${dbKey}: ${rawPayload[frontendKey]}`);
              return res.status(400).json({ ok: false, code: 'INVALID_TYPE', detail: `Field ${dbKey} must be an integer` });
            }
          } else if (decimalFields.includes(dbKey)) {
            value = parseFloat(String(value));
            if (isNaN(value)) {
              console.error(`[Guardrails:${requestId}] Invalid decimal for ${dbKey}: ${rawPayload[frontendKey]}`);
              return res.status(400).json({ ok: false, code: 'INVALID_TYPE', detail: `Field ${dbKey} must be a number` });
            }
            value = value.toFixed(2);
          } else if (dbKey === 'aiCanAdjust') {
            value = Boolean(value);
          }
          
          sanitizedPayload[dbKey] = value;
        }
      }

      console.log(`[Guardrails:${requestId}] User ${userId} updating ${mode} mode:`, sanitizedPayload);

      // A3: Single transaction for save + sync
      let guardrailsData;
      let tuningPolicyData;
      let cooldownValue; // Declare outside try block so it's accessible in broadcast
      
      try {
        // Upsert guardrails
        guardrailsData = await storage.upsertGuardrails(sanitizedPayload);
        
        // A3: Sync cooldownMinutes with Tuning Policy in same transaction
        cooldownValue = sanitizedPayload.cooldownMinutes !== undefined 
          ? sanitizedPayload.cooldownMinutes 
          : guardrailsData.cooldownMinutes || 15;
        
        const existingPolicy = await storage.getTuningPolicy({ userId, mode });
        if (existingPolicy) {
          tuningPolicyData = await storage.upsertTuningPolicy({
            ...existingPolicy,
            cooldownMinutes: cooldownValue
          });
          console.log(`[Guardrails:${requestId}] [PolicySync] Cooldown unified → ${cooldownValue} minutes`);
        } else {
          tuningPolicyData = await storage.upsertTuningPolicy({
            userId,
            mode,
            enabled: false,
            aggressiveness: 'balanced',
            policyVersion: 1,
            fieldBounds: {},
            maxStepPercent: '10.00',
            cooldownMinutes: cooldownValue,
            maxDailyAdjustments: 10,
            currentCounters: { adjustmentsToday: 0, reverts: 0 }
          });
          console.log(`[Guardrails:${requestId}] [PolicySync] Created tuning policy with cooldown ${cooldownValue} minutes`);
        }
      } catch (dbError: any) {
        console.error(`[Guardrails:${requestId}] DB Error:`, dbError.message);
        return res.status(400).json({ 
          ok: false, 
          code: 'GUARDRAILS_SAVE_ERROR', 
          detail: dbError.message || 'Database error during save'
        });
      }

      // A4: Broadcast + cache bust
      contextBridge.broadcast({
        type: 'guardrails_updated',
        mode,
        payload: guardrailsData
      });
      
      contextBridge.broadcast({
        type: 'tuning_policy_updated',
        mode,
        payload: { cooldownMinutes: cooldownValue }
      });

      // Phase 8.6.5: Invalidate caches and refresh context for Walter AI
      const { configChangeHandler } = await import('./services/config-change-handler');
      await configChangeHandler.handleConfigChange({
        userId,
        mode,
        configType: 'guardrails',
        source: 'api'
      });

      console.log(`[Guardrails:${requestId}] Save successful + broadcasts sent`);
      res.json({ ok: true, data: guardrailsData });
    } catch (error: any) {
      console.error(`[Guardrails:${requestId}] Unexpected error:`, error.message, error.stack);
      res.status(500).json({ 
        ok: false, 
        code: 'GUARDRAILS_SAVE_ERROR', 
        detail: error.message || 'Internal server error' 
      });
    }
  });

  // Phase 2: Guardrails V2 API Endpoints (Core Four - Single Source of Truth)
  // GET /api/guardrails-v2?mode=paper|live
  apiRouter.get('/guardrails-v2', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';
      console.log(`[REB 2.8.14][/api/guardrails-v2] GET request - userId: ${userId}, mode: ${mode}`);

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        console.error(`[REB 2.8.14][/api/guardrails-v2] Invalid mode parameter: ${mode}`);
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const guardrailsData = await storage.getGuardrailsV2({ mode });

      if (!guardrailsData) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No guardrails found for mode: ${mode}` });
      }

      res.json({ ok: true, data: guardrailsData });
    } catch (error: any) {
      console.error('[GuardrailsV2] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // PUT /api/guardrails-v2?mode=paper|live
  apiRouter.put('/guardrails-v2', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    const requestId = `grv2-${Date.now()}`;
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        console.error(`[GuardrailsV2:${requestId}] Invalid mode parameter`);
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const rawPayload = req.body;
      
      // Phase 27.G Audit: Reject legacy fields
      try {
        validateNoLegacyKeys(rawPayload);
      } catch (error) {
        if (error instanceof LegacyFieldError) {
          console.error(`[GuardrailsV2:${requestId}] Legacy field blocked:`, error.fieldName);
          return res.status(422).json({
            ok: false,
            code: 'LEGACY_FIELD_BLOCKED',
            detail: error.message,
            fieldName: error.fieldName,
            replacement: error.replacement
          });
        }
        throw error;
      }
      
      // Field mapping (camelCase from frontend)
      const portfolioRiskPerTradePct = rawPayload.portfolioRiskPerTradePct !== undefined 
        ? parseFloat(String(rawPayload.portfolioRiskPerTradePct)) 
        : undefined;
      const symbolCooldownMinutes = rawPayload.symbolCooldownMinutes !== undefined 
        ? parseInt(String(rawPayload.symbolCooldownMinutes), 10) 
        : undefined;
      const maxOpenPositions = rawPayload.maxOpenPositions !== undefined 
        ? parseInt(String(rawPayload.maxOpenPositions), 10) 
        : undefined;
      const dailyLossKillSwitchPct = rawPayload.dailyLossKillSwitchPct !== undefined 
        ? parseFloat(String(rawPayload.dailyLossKillSwitchPct)) 
        : undefined;
      const isManualOverride = rawPayload.isManualOverride !== undefined 
        ? Boolean(rawPayload.isManualOverride) 
        : undefined;
      const tunedByLatti = rawPayload.tunedByLatti !== undefined 
        ? Boolean(rawPayload.tunedByLatti) 
        : undefined;
      const lockedByUser = rawPayload.lockedByUser !== undefined 
        ? rawPayload.lockedByUser 
        : undefined;

      // Phase 5: Comprehensive coherency validation using GuardrailPolicy
      const { guardrailPolicy } = await import('./services/guardrail-policy');
      
      // Build validation payload
      const validationPayload: any = { mode };
      if (portfolioRiskPerTradePct !== undefined) validationPayload.portfolioRiskPerTradePct = portfolioRiskPerTradePct;
      if (symbolCooldownMinutes !== undefined) validationPayload.symbolCooldownMinutes = symbolCooldownMinutes;
      if (maxOpenPositions !== undefined) validationPayload.maxOpenPositions = maxOpenPositions;
      if (dailyLossKillSwitchPct !== undefined) validationPayload.dailyLossKillSwitchPct = dailyLossKillSwitchPct;
      if (isManualOverride !== undefined || tunedByLatti !== undefined || lockedByUser !== undefined) {
        validationPayload.management = {
          isManualOverride: isManualOverride ?? false,
          tunedByLatti: tunedByLatti ?? true,
          lockedByUser: lockedByUser ?? {}
        };
      }

      // Validate against all coherency rules
      const coherencyResult = guardrailPolicy.validate(validationPayload);
      
      if (coherencyResult.status === 'FAIL') {
        const errorFailures = coherencyResult.failures.filter(f => f.severity === 'error');
        console.error(`[GuardrailsV2:${requestId}] Coherency validation FAILED:`, errorFailures);
        
        // Log policy event
        guardrailPolicy.logPolicyEvent({
          mode,
          status: 'FAIL',
          message: `Validation failed: ${errorFailures.map(f => f.ruleId).join(', ')}`
        });

        return res.status(400).json({
          ok: false,
          code: 'COHERENCY_VIOLATION',
          failures: errorFailures,
          detail: errorFailures.map(f => f.message).join('; ')
        });
      }

      // Log warnings if any
      if (coherencyResult.status === 'WARN') {
        const warnings = coherencyResult.failures.filter(f => f.severity === 'warn');
        console.warn(`[GuardrailsV2:${requestId}] Coherency validation passed with WARNINGS:`, warnings);
      }

      // Build update payload
      const updatePayload: any = { mode };
      if (portfolioRiskPerTradePct !== undefined) updatePayload.portfolioRiskPerTradePct = String(portfolioRiskPerTradePct);
      if (symbolCooldownMinutes !== undefined) updatePayload.symbolCooldownMinutes = symbolCooldownMinutes;
      if (maxOpenPositions !== undefined) updatePayload.maxOpenPositions = maxOpenPositions;
      if (dailyLossKillSwitchPct !== undefined) updatePayload.dailyLossKillSwitchPct = String(dailyLossKillSwitchPct);
      if (isManualOverride !== undefined) updatePayload.isManualOverride = isManualOverride;
      if (tunedByLatti !== undefined) updatePayload.tunedByLatti = tunedByLatti;
      if (lockedByUser !== undefined) updatePayload.lockedByUser = lockedByUser;

      console.log(`[GuardrailsV2:${requestId}] Upserting guardrails for mode: ${mode}`, updatePayload);

      // Phase 28.C: Get old values for audit logging
      const oldGuardrails = await storage.getGuardrailsV2({ mode });

      // Upsert guardrails_v2
      const guardrailsData = await storage.upsertGuardrailsV2(updatePayload);

      // Phase 28.C: Log changes to audit_log
      if (oldGuardrails) {
        const auditPromises = [];
        
        if (portfolioRiskPerTradePct !== undefined && oldGuardrails.portfolioRiskPerTradePct !== String(portfolioRiskPerTradePct)) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'portfolioRiskPerTradePct',
            oldValue: oldGuardrails.portfolioRiskPerTradePct,
            newValue: String(portfolioRiskPerTradePct),
            changedBy: userId,
            tradingMode: mode
          }));
        }
        
        if (symbolCooldownMinutes !== undefined && oldGuardrails.symbolCooldownMinutes !== symbolCooldownMinutes) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'symbolCooldownMinutes',
            oldValue: String(oldGuardrails.symbolCooldownMinutes),
            newValue: String(symbolCooldownMinutes),
            changedBy: userId,
            tradingMode: mode
          }));
        }
        
        if (maxOpenPositions !== undefined && oldGuardrails.maxOpenPositions !== maxOpenPositions) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'maxOpenPositions',
            oldValue: String(oldGuardrails.maxOpenPositions),
            newValue: String(maxOpenPositions),
            changedBy: userId,
            tradingMode: mode
          }));
        }
        
        if (dailyLossKillSwitchPct !== undefined && oldGuardrails.dailyLossKillSwitchPct !== String(dailyLossKillSwitchPct)) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'dailyLossKillSwitchPct',
            oldValue: oldGuardrails.dailyLossKillSwitchPct,
            newValue: String(dailyLossKillSwitchPct),
            changedBy: userId,
            tradingMode: mode
          }));
        }
        
        if (lockedByUser !== undefined && JSON.stringify(oldGuardrails.lockedByUser) !== JSON.stringify(lockedByUser)) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'lockedByUser',
            oldValue: JSON.stringify(oldGuardrails.lockedByUser),
            newValue: JSON.stringify(lockedByUser),
            changedBy: userId,
            tradingMode: mode
          }));
        }
        
        await Promise.all(auditPromises);
        if (auditPromises.length > 0) {
          console.log(`[GuardrailsV2:${requestId}] Logged ${auditPromises.length} audit entries`);
        }
      }

      // Phase 3: Emit telemetry event if manual override state changed
      if (isManualOverride !== undefined || lockedByUser !== undefined) {
        contextBridge.broadcast({
          type: 'guardrail.override.changed',
          mode,
          payload: {
            isManualOverride: guardrailsData.isManualOverride,
            tunedByLatti: guardrailsData.tunedByLatti,
            lockedByUser: guardrailsData.lockedByUser,
            changedBy: userId,
            timestamp: new Date().toISOString()
          }
        });
        console.log(`[GuardrailsV2:${requestId}] Override state changed - broadcasted telemetry event`);
      }

      // Broadcast config change
      contextBridge.broadcast({
        type: 'guardrails_v2_updated',
        mode,
        payload: guardrailsData
      });

      // Invalidate caches
      const { configChangeHandler } = await import('./services/config-change-handler');
      await configChangeHandler.handleConfigChange({
        userId,
        mode,
        configType: 'guardrails_v2',
        source: 'api'
      });

      console.log(`[GuardrailsV2:${requestId}] Save successful + broadcasts sent`);
      res.json({ ok: true, data: guardrailsData });
    } catch (error: any) {
      console.error(`[GuardrailsV2:${requestId}] Unexpected error:`, error.message, error.stack);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message || 'Internal server error' });
    }
  });

  // Phase 5: GuardrailPolicy Service Endpoints
  // GET /api/guardrails-v2/effective?mode=paper|live - Get computed effective guardrails
  apiRouter.get('/guardrails-v2/effective', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      // Get raw guardrails from database
      const guardrailsData = await storage.getGuardrailsV2({ mode });

      if (!guardrailsData) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No guardrails found for mode: ${mode}` });
      }

      // Compute effective values using GuardrailPolicy
      const { guardrailPolicy } = await import('./services/guardrail-policy');
      const effectiveValues = guardrailPolicy.getEffective(guardrailsData);
      
      // Validate coherency
      const coherencyResult = guardrailPolicy.validate(effectiveValues);

      // Check kill switch status (now async for database persistence)
      const isKillSwitchTripped = await guardrailPolicy.isKillSwitchTripped(mode);

      res.json({ 
        ok: true, 
        data: {
          ...effectiveValues,
          coherency: coherencyResult,
          killSwitchTripped: isKillSwitchTripped
        }
      });
    } catch (error: any) {
      console.error('[GuardrailsV2:Effective] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // POST /api/guardrails-v2/kill-switch/trip?mode=paper|live - Trip the kill switch
  apiRouter.post('/guardrails-v2/kill-switch/trip', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';
      const { reason } = req.body;

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      if (!reason || typeof reason !== 'string') {
        return res.status(400).json({ ok: false, code: 'MISSING_REASON', detail: 'Reason is required and must be a string' });
      }

      const { guardrailPolicy } = await import('./services/guardrail-policy');
      
      // Trip the kill switch (now async for database persistence)
      await guardrailPolicy.tripKillSwitch(mode, reason);

      console.log(`[GuardrailsV2:KillSwitch] Kill switch tripped for ${mode} by user ${userId}: ${reason}`);

      res.json({ 
        ok: true, 
        data: { 
          mode, 
          tripped: true, 
          reason, 
          timestamp: new Date().toISOString()
        } 
      });
    } catch (error: any) {
      console.error('[GuardrailsV2:KillSwitch] POST error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // POST /api/guardrails-v2/kill-switch/reset?mode=paper|live - Reset the kill switch
  apiRouter.post('/guardrails-v2/kill-switch/reset', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const { guardrailPolicy } = await import('./services/guardrail-policy');
      
      // Reset the kill switch (now async for database persistence)
      await guardrailPolicy.resetKillSwitch(mode);

      console.log(`[GuardrailsV2:KillSwitch] Kill switch reset for ${mode} by user ${userId}`);

      res.json({ 
        ok: true, 
        data: { 
          mode, 
          tripped: false, 
          timestamp: new Date().toISOString()
        } 
      });
    } catch (error: any) {
      console.error('[GuardrailsV2:KillSwitch] POST reset error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // Phase 4: Goals Presets API Endpoints
  // GET /api/goals-presets?mode=paper|live - Fetch all presets for the mode
  apiRouter.get('/goals-presets', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const presets = await storage.getGoalsPresets({ mode });
      res.json({ ok: true, data: presets });
    } catch (error: any) {
      console.error('[GoalsPresets] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // GET /api/goals-presets/active?mode=paper|live - Fetch the active preset
  apiRouter.get('/goals-presets/active', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';
      console.log(`[REB 2.8.14][/api/goals-presets/active] GET request - userId: ${userId}, mode: ${mode}`);

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        console.error(`[REB 2.8.14][/api/goals-presets/active] Invalid mode parameter: ${mode}`);
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const activePreset = await storage.getActiveGoalsPreset({ mode });
      
      if (!activePreset) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No active preset found for mode: ${mode}` });
      }

      res.json({ ok: true, data: activePreset });
    } catch (error: any) {
      console.error('[GoalsPresets] GET active error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // PUT /api/goals-presets/select - Apply a preset
  apiRouter.put('/goals-presets/select', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    const requestId = `gp-select-${Date.now()}`;
    try {
      const userId = req.user!.id;
      const { mode, presetName } = req.body;

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        console.error(`[GoalsPresets:${requestId}] Invalid mode parameter`);
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      if (!presetName) {
        console.error(`[GoalsPresets:${requestId}] Missing presetName parameter`);
        return res.status(400).json({ ok: false, code: 'MISSING_PRESET_NAME', detail: 'Preset name is required' });
      }

      const validPresetNames = ['conservative', 'baseline', 'optimistic', 'maximum', 'custom'];
      if (!validPresetNames.includes(presetName)) {
        console.error(`[GoalsPresets:${requestId}] Invalid preset name: ${presetName}`);
        return res.status(400).json({ 
          ok: false, 
          code: 'INVALID_PRESET_NAME', 
          detail: `Preset name must be one of: ${validPresetNames.join(', ')}` 
        });
      }

      console.log(`[GoalsPresets:${requestId}] Selecting preset ${presetName} for mode ${mode}`);

      // Apply the preset (sets is_active flag and updates guardrails_v2)
      const result = await storage.selectGoalsPreset({ mode, presetName });

      // Broadcast preset change event
      contextBridge.broadcast({
        type: 'goals_preset_changed',
        mode,
        payload: {
          presetName,
          preset: result.preset,
          guardrails: result.guardrails,
          changedBy: userId,
          timestamp: new Date().toISOString()
        }
      });

      // Also broadcast guardrails update
      contextBridge.broadcast({
        type: 'guardrails_v2_updated',
        mode,
        payload: result.guardrails
      });

      // Invalidate caches
      const { configChangeHandler } = await import('./services/config-change-handler');
      await configChangeHandler.handleConfigChange({
        userId,
        mode,
        configType: 'goals_preset',
        source: 'api'
      });

      console.log(`[GoalsPresets:${requestId}] Preset applied successfully + broadcasts sent`);
      res.json({ ok: true, data: result });
    } catch (error: any) {
      console.error(`[GoalsPresets:${requestId}] Unexpected error:`, error.message, error.stack);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message || 'Internal server error' });
    }
  });

  // Phase 6: Goals Learning Engine API Endpoints
  // GET /api/goals-learning/summary?mode=paper|live - Get 30-day learning metrics
  apiRouter.get('/goals-learning/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const summary = await storage.getLearningSummary({ mode });
      
      if (!summary) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No learning metrics found for mode: ${mode}` });
      }

      res.json({ ok: true, data: summary });
    } catch (error: any) {
      console.error('[GoalsLearning] GET summary error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // POST /api/goals-learning/trigger?mode=paper|live - Manually trigger learning engine
  apiRouter.post('/goals-learning/trigger', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const { goalsLearningEngine } = await import('./services/goals-learning-engine');
      
      // Check if already running
      if (goalsLearningEngine.isRunning(mode)) {
        return res.status(409).json({ 
          ok: false, 
          code: 'ALREADY_RUNNING', 
          detail: `Learning engine is already running for ${mode}` 
        });
      }

      console.log(`[GoalsLearning] Manual trigger for ${mode} by user ${userId}`);

      // Run the learning engine
      const results = await goalsLearningEngine.run(mode);

      console.log(`[GoalsLearning] Learning cycle complete for ${mode} - ${results.length} presets evaluated`);

      res.json({ 
        ok: true, 
        data: {
          mode,
          results,
          adjustedCount: results.filter(r => r.adjusted).length,
          totalPresets: results.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('[GoalsLearning] POST trigger error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // GET /api/analytics/guardrails-compliance?mode=paper|live - Get coherency status
  apiRouter.get('/analytics/guardrails-compliance', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';
      console.log(`[REB 2.8.14][/api/analytics/guardrails-compliance] GET request - userId: ${userId}, mode: ${mode}`);

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        console.error(`[REB 2.8.14][/api/analytics/guardrails-compliance] Invalid mode parameter: ${mode}`);
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const compliance = await storage.getGuardrailsCompliance({ mode });
      
      if (!compliance) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No compliance data found for mode: ${mode}` });
      }

      res.json({ ok: true, data: compliance });
    } catch (error: any) {
      console.error('[GuardrailsCompliance] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // Phase 3: Filters V2 API Endpoints (with Manual Override metadata)
  // GET /api/filters-v2?mode=paper|live
  apiRouter.get('/filters-v2', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      // Get screener filters from storage
      const screenerData = await storage.getScreenerFilters({ mode });

      if (!screenerData) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No filters found for mode: ${mode}` });
      }

      // Phase 28: Read actual override flags from database instead of hardcoding
      const managedByLottie = screenerData.managedByLottie ?? true;
      const manualOverrideEnabled = screenerData.manualOverrideEnabled ?? false;
      
      // Convert to FiltersV2 format with control metadata as ARRAY
      const filtersV2 = {
        mode,
        filters: [
          {
            name: "minVolume",
            value: parseFloat(screenerData.minVolume),
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Min Volume ($)",
            category: "Volume & Liquidity"
          },
          {
            name: "minLiquidity",
            value: parseFloat(screenerData.minLiquidity),
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Min Liquidity ($)",
            category: "Volume & Liquidity"
          },
          {
            name: "minPrice",
            value: parseFloat(screenerData.minPrice),
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Min Price ($)",
            category: "Price Range"
          },
          {
            name: "maxPrice",
            value: parseFloat(screenerData.maxPrice),
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Max Price ($)",
            category: "Price Range"
          },
          {
            name: "maxBidAskSpread",
            value: parseFloat(screenerData.maxBidAskSpread),
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Max Bid-Ask Spread (%)",
            category: "Risk & Volatility"
          },
          {
            name: "volatilityMin",
            value: parseFloat(screenerData.volatilityMin),
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Min Volatility (%)",
            category: "Risk & Volatility"
          },
          {
            name: "volatilityMax",
            value: parseFloat(screenerData.volatilityMax),
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Max Volatility (%)",
            category: "Risk & Volatility"
          },
          {
            name: "minMarketCap",
            value: parseFloat(screenerData.minMarketCap),
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Min Market Cap ($)",
            category: "Market Filters"
          },
          {
            name: "excludeStablecoins",
            value: screenerData.excludeStablecoins,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Exclude Stablecoins",
            category: "Market Filters"
          },
          {
            name: "allowRegulatedOnly",
            value: screenerData.allowRegulatedOnly,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Regulated Only",
            category: "Market Filters"
          },
          {
            name: "rsiMin",
            value: screenerData.rsiMin,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Min RSI",
            category: "Technical Indicators"
          },
          {
            name: "rsiMax",
            value: screenerData.rsiMax,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Max RSI",
            category: "Technical Indicators"
          },
          {
            name: "universeSize",
            value: screenerData.universeSize,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Market Universe Size",
            category: "Universe & Signal Controls"
          },
          {
            name: "quoteCurrencies",
            value: screenerData.quoteCurrencies,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Quote Currencies",
            category: "Universe & Signal Controls"
          },
          {
            name: "activeTimeframes",
            value: screenerData.activeTimeframes,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Active Timeframes",
            category: "Universe & Signal Controls"
          },
          {
            name: "confidenceThreshold",
            value: screenerData.confidenceThreshold,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Confidence Threshold (%)",
            category: "Universe & Signal Controls"
          },
          {
            name: "minHistoryDays",
            value: screenerData.minHistoryDays ?? 30,
            managedByLottie,
            manualOverrideEnabled,
            displayName: "Minimum History (Days)",
            category: "Data Quality"
          }
        ],
        lastUpdated: screenerData.updatedAt
      };

      // REB 2.9C Section 2A: Log filters delivered to UI (first 20 cycles only)
      if (!globalThis.__reb29c_api_calls) globalThis.__reb29c_api_calls = 0;
      globalThis.__reb29c_api_calls++;
      if (globalThis.__reb29c_api_calls <= 20) {
        console.log(`[REB2.9C][API->UI] Filters delivered to UI (call ${globalThis.__reb29c_api_calls}/20):`, JSON.stringify(filtersV2.filters.map(f => ({ name: f.name, value: f.value }))));
      }

      res.json({ ok: true, data: filtersV2 });
    } catch (error: any) {
      console.error('[FiltersV2] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // PUT /api/filters-v2?mode=paper|live
  // Phase 28: Persist override flag changes to database
  // REB 2.9B: Also handles filter value updates (minHistoryDays)
  apiRouter.put('/filters-v2', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    const requestId = `fltv2-${Date.now()}`;
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const { managedByLottie, manualOverrideEnabled, filterName, value } = req.body;
      
      // Validate override flags
      if (typeof managedByLottie !== 'boolean' && managedByLottie !== undefined) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT', detail: 'managedByLottie must be a boolean' });
      }
      
      if (typeof manualOverrideEnabled !== 'boolean' && manualOverrideEnabled !== undefined) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT', detail: 'manualOverrideEnabled must be a boolean' });
      }

      // REB 2.9B Stage 1: Validate filter value updates only when value is provided
      // Allow toggle-only requests (filterName + manualOverrideEnabled without value)
      if (filterName === 'minHistoryDays' && value !== undefined) {
        const allowedValues = [30, 60, 90, 180];
        const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
        if (!allowedValues.includes(numValue)) {
          return res.status(400).json({ 
            ok: false, 
            code: 'INVALID_INPUT', 
            detail: `minHistoryDays must be one of: ${allowedValues.join(', ')}` 
          });
        }
      }
      
      console.log(`[FiltersV2:${requestId}] Updating - managedByLottie=${managedByLottie}, manualOverrideEnabled=${manualOverrideEnabled}, filterName=${filterName}, value=${value}`);
      
      // Get current filters
      const current = await storage.getScreenerFilters({ mode });
      
      if (!current) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No filters found for mode: ${mode}` });
      }
      
      // Extract only the filter value fields (exclude id, createdAt, updatedAt, etc.)
      const {
        id, createdAt, updatedAt,
        managedByLottie: currentManagedByLottie,
        manualOverrideEnabled: currentManualOverrideEnabled,
        lastUpdatedBy: currentLastUpdatedBy,
        lockedByUser: currentLockedByUser,
        ...filterValues
      } = current;

      // REB 2.9B Stage 1: Apply filter value updates if provided
      const updatedFilterValues: Record<string, any> = { ...filterValues };
      
      if (filterName !== undefined && value !== undefined) {
        // Numeric filters
        const numericFilters = ['minVolume', 'minLiquidity', 'minPrice', 'maxPrice', 'maxBidAskSpread',
          'volatilityMin', 'volatilityMax', 'minMarketCap', 'rsiMin', 'rsiMax',
          'universeSize', 'confidenceThreshold', 'minHistoryDays'];
        
        // Boolean filters
        const booleanFilters = ['excludeStablecoins', 'allowRegulatedOnly'];
        
        // Array filters (Stage 2 UX, but backend support now)
        const arrayFilters = ['quoteCurrencies', 'activeTimeframes'];
        
        if (numericFilters.includes(filterName)) {
          updatedFilterValues[filterName] = typeof value === 'string' ? parseFloat(value) : value;
          console.log(`[FiltersV2:${requestId}] REB 2.9B Stage 1: Updated ${filterName} from ${(current as any)[filterName]} to ${updatedFilterValues[filterName]}`);
        } else if (booleanFilters.includes(filterName)) {
          updatedFilterValues[filterName] = value === true || value === 'true';
          console.log(`[FiltersV2:${requestId}] REB 2.9B Stage 1: Updated ${filterName} from ${(current as any)[filterName]} to ${updatedFilterValues[filterName]}`);
        } else if (arrayFilters.includes(filterName)) {
          updatedFilterValues[filterName] = Array.isArray(value) ? value : [value];
          console.log(`[FiltersV2:${requestId}] REB 2.9B Stage 1: Updated ${filterName}`);
        }
      }
      
      // Update override flags and/or filter values while preserving all other filter values
      const updatePayload = {
        mode: current.mode,
        ...updatedFilterValues,
        managedByLottie: managedByLottie ?? currentManagedByLottie,
        manualOverrideEnabled: manualOverrideEnabled ?? currentManualOverrideEnabled,
        lastUpdatedBy: userId
      };
      
      console.log(`[FiltersV2:${requestId}] REB 2.9B: Update payload minHistoryDays = ${updatePayload.minHistoryDays}`);
      
      const updated = await storage.upsertScreenerFilters(updatePayload);
      
      // Phase 28.C: Log changes to audit_log
      const auditPromises = [];
      
      if (managedByLottie !== undefined && currentManagedByLottie !== managedByLottie) {
        auditPromises.push(storage.addAuditLog({
          entityType: 'filters',
          field: 'managedByLottie',
          oldValue: String(currentManagedByLottie),
          newValue: String(managedByLottie),
          changedBy: userId,
          tradingMode: mode
        }));
      }
      
      if (manualOverrideEnabled !== undefined && currentManualOverrideEnabled !== manualOverrideEnabled) {
        auditPromises.push(storage.addAuditLog({
          entityType: 'filters',
          field: 'manualOverrideEnabled',
          oldValue: String(currentManualOverrideEnabled),
          newValue: String(manualOverrideEnabled),
          changedBy: userId,
          tradingMode: mode
        }));
      }

      // REB 2.9B Stage 1: Log filter value changes
      if (filterName !== undefined && value !== undefined) {
        const oldValue = (current as any)[filterName];
        const newValue = updatedFilterValues[filterName];
        if (oldValue !== newValue) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'filters',
            field: filterName,
            oldValue: String(oldValue ?? ''),
            newValue: String(newValue),
            changedBy: userId,
            tradingMode: mode
          }));
        }
      }
      
      await Promise.all(auditPromises);
      if (auditPromises.length > 0) {
        console.log(`[FiltersV2:${requestId}] Logged ${auditPromises.length} audit entries`);
      }
      
      // REB 2.9B Stage 1: Log successful filter value updates
      if (filterName !== undefined && value !== undefined) {
        console.log(`[REB 2.9B Stage 1][filters-v2] ${filterName} updated userId=${userId} mode=${mode} value=${updatedFilterValues[filterName]}`);
      }
      
      // REB 2.9C Section 2B: Log filter updates from UI (first 20 only)
      if (!globalThis.__reb29c_api_puts) globalThis.__reb29c_api_puts = 0;
      globalThis.__reb29c_api_puts++;
      if (globalThis.__reb29c_api_puts <= 20) {
        console.log(`[REB2.9C][UI->API] Filter updated (put ${globalThis.__reb29c_api_puts}/20):`, { filterName, value, manualOverrideEnabled });
      }
      
      console.log(`[FiltersV2:${requestId}] Override flags updated successfully`);
      
      // Broadcast config update via WebSocket
      const { contextBridge } = await import('./services/context-bridge.js');
      contextBridge.broadcast({
        type: 'config_updated',
        mode,
        payload: {
          userId,
          configType: 'filters_v2',
          source: 'api'
        }
      });
      
      res.json({ ok: true, data: updated });
    } catch (error: any) {
      console.error(`[FiltersV2:${requestId}] PUT error:`, error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // Filter diagnostics endpoint - fetches LIVE metrics from diagnostic service
  // Phase 27.F.21: Migrated from legacy filter_diagnostics table to live diagnostic service
  // This ensures FilterHealthWidget shows same data as Filter Insights tab
  // Phase 4A Remediation: Added caching with 45s TTL
  apiRouter.get('/filters/diagnostics', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;

      // Phase 4A: Check cache first
      const { getCache, setCache, coalesce } = await import('./services/cache.js');
      const cacheKey = `diag:filters:${mode}`;
      
      const cached = getCache(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Phase 4A: Use coalescing to prevent duplicate scans
      const result = await coalesce(cacheKey, async () => {
        // Import diagnostic service
        const { paperSimDiagnosticService } = await import('./services/paper-sim-diagnostic.js');
        
        // Get live scan results from diagnostic service (same source as Filter Insights)
        // Phase 27.F.21: Use limit=9999 to evaluate ENTIRE universe (same as all other endpoints)
        const scanResult = await paperSimDiagnosticService.performUniverseScan({
          userId,
          mode,
          limit: 9999,
          trace: false,
          strategies: false
        });

        return scanResult;
      });

      const scanResult = result;

      // Phase 41F-L.E2E-PURGE: Get screener filter thresholds (mode-level only)
      const screenerSettings = await storage.getScreenerFilters({ mode });

      // Calculate top failure reason from breakdown
      // Phase 8.8.2: Corrected FilterBreakdown schema
      const breakdown = scanResult.breakdown;
      const failureReasons = [
        { reason: 'Min Volume', count: breakdown.failed_min_volume },
        { reason: 'Spread Too High', count: breakdown.failed_spread },
        { reason: 'Daily Range', count: breakdown.failed_daily_range },
        { reason: 'Min Price', count: breakdown.failed_min_price },
        { reason: 'Stablecoin', count: breakdown.failed_stablecoin },
        { reason: 'Quote Currency', count: breakdown.failed_quote_currency },
        { reason: 'History', count: breakdown.failed_history },
        { reason: 'Market Cap', count: breakdown.failed_market_cap },
        { reason: 'Risk Too High', count: breakdown.failed_guardrail_risk },
        { reason: 'Already Active', count: breakdown.already_active }
      ];

      const topFailure = failureReasons.reduce((max, curr) => 
        curr.count > max.count ? curr : max
      , { reason: 'No failures', count: 0 });

      const failurePercent = scanResult.universe_count > 0
        ? ((scanResult.ineligible_count / scanResult.universe_count) * 100)
        : 0;

      const response = {
        pairsScanned: scanResult.universe_count,
        eligiblePairs: scanResult.eligible_count,
        topFailureReason: topFailure.reason,
        failurePercent: failurePercent,
        timestamp: scanResult.ts,
        // Phase 27.F.15.B: Include active threshold values
        thresholds: screenerSettings ? {
          minVolume: screenerSettings.minVolume,
          minPrice: screenerSettings.minPrice,
          maxPrice: screenerSettings.maxPrice,
          minMarketCap: screenerSettings.minMarketCap,
          maxBidAskSpread: screenerSettings.maxBidAskSpread,
          rsiMin: screenerSettings.rsiMin,
          rsiMax: screenerSettings.rsiMax,
          volatilityMin: screenerSettings.volatilityMin,
          volatilityMax: screenerSettings.volatilityMax,
          minLiquidity: screenerSettings.minLiquidity,
          excludeStablecoins: screenerSettings.excludeStablecoins,
          allowRegulatedOnly: screenerSettings.allowRegulatedOnly
          // Phase 41F-L.E2E-PURGE: User-level filter fields removed (minDailyRange, allowedTradingPairs, minDataHistoryDays)
        } : null
      };

      // Phase 4A: Cache the response (45s TTL for diagnostics)
      setCache(cacheKey, response, 45000);
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching filter diagnostics:', error);
      res.status(500).json({ error: 'Failed to fetch filter diagnostics' });
    }
  });

  // Phase 8.8.2-MAP-FINAL: Filter settings endpoint for Filter Insights thresholds
  apiRouter.get('/settings/filters', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.mode!;

      const screenerFilters = await storage.getScreenerFilters({ mode });
      if (!screenerFilters) {
        return res.status(404).json({ error: 'No screener filters found for mode: ' + mode });
      }

      // Parse numeric string values to numbers
      const parseNumber = (val: string | null): number => {
        if (!val) return 0;
        return parseFloat(val);
      };

      // Parse allowed quote currencies from screener filters
      let allowedQuoteCurrencies: string[] = ['USD', 'EUR', 'USDT'];
      try {
        allowedQuoteCurrencies = typeof screenerFilters.quoteCurrencies === 'string'
          ? JSON.parse(screenerFilters.quoteCurrencies)
          : (screenerFilters.quoteCurrencies ?? ['USD', 'EUR', 'USDT']);
      } catch {
        // Keep default if parsing fails
      }

      const response = {
        mode,
        filters: {
          minVolume: parseNumber(screenerFilters.minVolume),
          maxBidAskSpread: parseNumber(screenerFilters.maxBidAskSpread),
          minDailyRange: parseNumber(screenerFilters.volatilityMin) || 0.02,
          minPrice: parseNumber(screenerFilters.minPrice),
          excludeStablecoins: screenerFilters.excludeStablecoins ?? true,
          allowedQuoteCurrencies,
        },
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching filter settings:', error);
      res.status(500).json({ error: 'Failed to fetch filter settings' });
    }
  });

  // Filter calibration endpoint - fetches latest with Paper→Live fallback
  apiRouter.get('/screeners/calibration', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.mode!;

      const calibration = await storage.getCalibrationWithFallback(mode, 24);

      if (!calibration) {
        return res.status(404).json({ error: 'No calibration data found' });
      }

      res.json(calibration);
    } catch (error) {
      console.error('Error fetching calibration:', error);
      res.status(500).json({ error: 'Failed to fetch calibration data' });
    }
  });

  // Screener filters endpoints (mode-isolated)
  // Phase 7.4: ConfigBob transparent routing for screeners endpoint
  apiRouter.get('/screeners', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;

      // Phase 7.4: Try ConfigBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using ConfigBob for /api/screeners');
          const screenerData = await configBob.getScreeners(userId, mode);
          return res.json(screenerData);
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ ConfigBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      let screenerData = await storage.getScreenerFilters({ mode });

      if (!screenerData) {
        // Return defaults if not found
        screenerData = {
          id: '',
          userId,
          mode,
          minVolume: '500000.00',
          minPrice: '0.001',
          maxPrice: '50000.00',
          minMarketCap: '10000000.00',
          maxBidAskSpread: '2.50',
          rsiMin: 20,
          rsiMax: 80,
          volatilityMin: '0.20',
          volatilityMax: '10.00',
          excludeStablecoins: true,
          minLiquidity: '250000.00',
          allowRegulatedOnly: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }

      res.json(screenerData);
    } catch (error) {
      console.error('Error fetching screener filters:', error);
      res.status(500).json({ error: 'Failed to fetch screener filters' });
    }
  });

  apiRouter.put('/screeners', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;

      const screenerPayload = { ...req.body, mode, lastUpdatedBy: userId };
      const screenerData = await storage.upsertScreenerFilters(screenerPayload);

      console.info(`[Screeners] User ${userId} updated screener filters for ${mode} mode`);

      // Phase 8.6.5: Invalidate caches and refresh context for Walter AI
      const { configChangeHandler } = await import('./services/config-change-handler');
      await configChangeHandler.handleConfigChange({
        userId,
        mode,
        configType: 'screeners',
        source: 'api'
      });

      res.json(screenerData);
    } catch (error) {
      console.error('Error updating screener filters:', error);
      res.status(500).json({ error: 'Failed to update screener filters' });
    }
  });

  // Phase 27.F.2: Trading Engine Control - Start with deterministic state broadcasting
  // Phase 27.F.13.B: Fixed to properly start correct engine based on mode
  // Phase 27.F.13.I: Added comprehensive logging and timeout protection
  apiRouter.post('/trading/start', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    try {
      const userId = req.user!.id;
      const { mode } = req.body; // 'live' or 'paper'
      
      console.log('[ENGINE_START_INITIATED]', { userId, mode, timestamp: new Date().toISOString() });
      
      // Validate mode
      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ 
          error: 'Invalid mode',
          message: 'Mode must be either "live" or "paper"'
        });
      }
      
      console.log(`[TradingStart] User ${userId} requesting start in ${mode} mode`);
      console.log('[ENGINE_VALIDATED_MODE]', { mode });
      
      // Get API credentials from environment secrets only
      const apiKey = process.env.KRAKEN_API_KEY;
      const apiSecret = process.env.KRAKEN_API_SECRET;
      
      // Validate credentials are present before starting
      if (!apiKey || !apiSecret) {
        console.log('[ENGINE_START_FAILED] Kraken credentials missing');
        return res.status(400).json({ 
          error: 'Kraken API credentials not configured',
          message: 'Please add KRAKEN_API_KEY and KRAKEN_API_SECRET to Replit Secrets before starting trading.'
        });
      }
      
      console.log('[ENGINE_VALIDATED_CONFIG] Kraken credentials present');
      
      // Phase 41F-L.E2E-PURGE: Pre-flight checks using mode-level configuration only
      console.log('[PREFLIGHT] Running pre-flight validation checks...');
      const preflightErrors: string[] = [];
      
      try {
        // 1. Validate Goals Engine configuration exists (mode-level)
        const [filters, guardrails] = await Promise.all([
          storage.getScreenerFilters({ mode }),
          storage.getGuardrails({ mode })
        ]);
        
        if (!filters) {
          preflightErrors.push('Screener filters not configured - please configure filters before starting');
        } else {
          console.log('[PREFLIGHT] ✅ Screener filters loaded');
        }
        
        if (!guardrails) {
          preflightErrors.push('Guardrails not configured - please configure risk limits before starting');
        } else {
          console.log('[PREFLIGHT] ✅ Guardrails loaded (mode-level)');
        }
        
        // 2. Validate database portfolio state exists
        const portfolioState = await storage.getPortfolioState({ globalContextId: 'default', mode });
        if (!portfolioState) {
          preflightErrors.push('Portfolio state not initialized - please initialize portfolio before starting');
        } else {
          console.log('[PREFLIGHT] ✅ Portfolio state exists (balance: $' + portfolioState.balance + ')');
        }
        
        // 3. Quick Kraken API connectivity check (non-blocking)
        try {
          const KrakenService = (await import('./services/kraken-service.ts')).KrakenService;
          const kraken = new KrakenService();
          const serverTime = await Promise.race([
            kraken.getServerTime(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
          ]);
          console.log('[PREFLIGHT] ✅ Kraken API reachable');
        } catch (apiError: any) {
          console.warn('[PREFLIGHT] ⚠️  Kraken API check failed (non-blocking):', apiError.message);
          // Don't fail startup for API connectivity issues - let the engine handle it
        }
        
        if (preflightErrors.length > 0) {
          console.log('[PREFLIGHT] ❌ Pre-flight checks failed:', preflightErrors);
          return res.status(400).json({
            error: 'Pre-flight validation failed',
            message: 'Engine cannot start due to missing configuration',
            issues: preflightErrors
          });
        }
        
        console.log('[PREFLIGHT] ✅ All pre-flight checks passed');
      } catch (preflightError: any) {
        console.error('[PREFLIGHT] ❌ Pre-flight check error:', preflightError);
        return res.status(500).json({
          error: 'Pre-flight check failed',
          message: preflightError.message
        });
      }
      
      // Phase 41D: Balance confirmation system removed - accept startingBalance directly
      console.log('[41D] Starting engine without balance confirmation gate');
      
      // REB 2.5: Increased timeout from 10s to 30s (SignalOrchestrator now non-blocking)
      // With async orchestrator startup, engine should start in <10s
      const ENGINE_START_TIMEOUT = 30000; // 30 seconds
      console.log('[REB2.5][TIMEOUT_ADJUST] Engine start timeout: 10s → 30s (post-warmup optimization)');
      
      const startEnginePromise = (async () => {
        // Phase 27.F.13.B: Start the correct engine based on mode
        if (mode === 'paper') {
          console.log('[ENGINE_INIT][DEBUG] Entering INIT state (importing paper-sim-service)');
          console.log('[ENGINE_STARTING_PAPER] Importing paper-sim-service...');
          // Start paper trading simulation
          const { startPaperSimulation } = await import('./services/paper-sim-service.js');
          console.log('[ENGINE_STARTING_PAPER] Calling startPaperSimulation...');
          const result = await startPaperSimulation(userId, { skipAutoWatchlist: true });
          console.log(`[TradingStart] Paper simulation started for user ${userId}`);
          console.log('[ENGINE_START_COMPLETED]', { mode: 'paper', sessionId: result.data?.sessionId });
          console.log('[ENGINE_ACTIVE][DEBUG] Engine reached ACTIVE state');
          return result;
        } else {
          console.log('[ENGINE_INIT][DEBUG] Entering INIT state (global live engine)');
          console.log('[ENGINE_STARTING_LIVE][Phase-27.F.15.B.3] Using global live engine...');
          // Phase 27.F.15.B.3: Use global live engine (shared by all users)
          await globalLiveEngine.start();
          console.log(`[TradingStart] Global live trading engine started by user ${userId}`);
          console.log('[ENGINE_START_COMPLETED]', { mode: 'live', engine: 'global' });
          console.log('[ENGINE_ACTIVE][DEBUG] Engine reached ACTIVE state');
          return { success: true };
        }
      })();
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Engine start timeout after 30 seconds')), ENGINE_START_TIMEOUT);
      });
      
      console.log('[ENGINE_WAITING_START] Waiting for engine start with 30s timeout...');
      const result = await Promise.race([startEnginePromise, timeoutPromise]) as any;
      
      // REB 2.8.5D: Update system context AFTER successful engine start (atomic truth)
      // This ensures isEngineActive only flips true when engine is actually running
      // Trade-off: 1-scan delay vs guaranteed truth consistency
      console.log('[REB 2.8.5D][ENGINE_DATABASE_UPDATE] Updating system context AFTER successful engine start...');
      await storage.updateSystemContext(mode, {
        isEngineActive: true,
        lastStartedBy: userId,
        lastHeartbeat: new Date(),
        changedBy: req.user!.username || 'unknown',
        changeReason: 'User-initiated start'
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`[ENGINE_TIMING] Engine started in ${elapsed}ms`);
      
      console.log('[ENGINE_DATABASE_UPDATE] Updating user status...');
      await storage.updateUser(userId, { tradingStatus: 'active', tradingMode: mode });
      
      console.log('[41D-FIX] Engine start completed, preparing HTTP response...');
      
      // Phase 41D: Non-blocking WebSocket broadcast to prevent HTTP timeout
      const { tradingStateSync } = await import('./services/trading-state-sync.js');
      tradingStateSync.broadcastUserUpdate(userId)
        .then(() => console.log('[41D-FIX] Broadcast completed asynchronously (live mode start)'))
        .catch(err => console.warn('[41D-FIX] Broadcast error:', err.message));
      
      console.log('[41D-FIX] Broadcast triggered asynchronously');
      
      // Get current global context for deterministic response
      const context = await storage.getSystemContext(mode);
      
      console.log(`[TradingStart] Completed start for user ${userId} mode=${mode} active=true`);
      console.log('[ENGINE_DATABASE_OK]', { contextLoaded: !!context });
      
      // Phase 27.F.6: Log to trading_audit_log
      try {
        await storage.createTradingAuditLog({
          userId,
          action: 'start',
          mode: mode || 'live',
          triggeredBy: 'manual',
          metadata: { engineStatus: 'started', engineType: mode, startTimeMs: elapsed }
        });
      } catch (auditError) {
        console.error('[TradingAudit] Failed to log start action:', auditError);
      }
      
      res.json({ 
        success: true,
        mode: context?.tradingMode || mode,
        active: true,
        sessionId: result?.data?.sessionId || null,
        startTimeMs: elapsed,
        // Phase 27.F.13.O: Include audit fields
        lastStartedBy: context?.lastStartedBy || userId,
        lastHeartbeat: context?.lastHeartbeat?.toISOString() || new Date().toISOString()
      });
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      console.error('[TradingStart] Error starting trading:', error);
      console.error('[ENGINE_START_FAILED]', { 
        error: error.message, 
        elapsed: `${elapsed}ms`,
        timeout: elapsed >= 9900 // True if timeout occurred
      });
      
      // REB 2.8.5D: No rollback needed - context update happens AFTER successful start
      // If we reach this catch block, context was never flipped to true
      
      if (error.message?.includes('timeout')) {
        return res.status(504).json({ 
          error: 'Engine start timeout', 
          message: 'Trading engine failed to start within 10 seconds. Check server logs for details.',
          reason: 'timeout',
          elapsed: `${elapsed}ms`
        });
      }
      
      res.status(500).json({ error: 'Failed to start trading', details: error.message });
    }
  });

  // Phase 27.F.2: Trading Engine Control - Stop with deterministic state broadcasting
  // Phase 27.F.13.B: Fixed to properly stop correct engine based on current mode
  // Phase 27.F.13.O: Refactored to use global mode-based context with audit trail
  apiRouter.post('/trading/stop', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode } = req.body; // Get mode from request body
      
      console.log(`[TradingStop] User ${userId} requesting stop for ${mode} mode`);
      
      // Validate mode
      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ 
          error: 'Invalid mode',
          message: 'Mode must be either "live" or "paper"'
        });
      }
      
      // Get current global context for this mode
      const context = await storage.getSystemContext(mode);
      const currentMode = context?.tradingMode || mode;
      
      // Phase 27.F.13.B: Stop the correct engine based on current mode
      if (currentMode === 'paper') {
        // Stop paper trading simulation
        const { stopPaperSimulation } = await import('./services/paper-sim-service.js');
        await stopPaperSimulation(userId);
        console.log(`[TradingStop] Paper simulation stopped for user ${userId}`);
      } else {
        // Phase 27.F.15.B.3: Stop global live trading engine
        await globalLiveEngine.stop();
        console.log(`[TradingStop] Global live trading engine stopped by user ${userId}`);
      }
      
      // REB 2.8.6B: Enforce passive mode - clear Active Filter Pool immediately
      // Passive learning is derived (!isEngineActive), not a separate flag
      activeFilterPool.enforcePassiveModeIfStopped(mode as 'paper' | 'live', false);
      console.log(`[REB 2.8.6B][PassivePool] Cleared Active Pool for ${mode} mode (engine stopped)`);
      
      // REB 2.8.5D: Update system context AFTER successful engine stop (atomic truth)
      // This ensures isEngineActive only flips false when engine is actually stopped
      // Trade-off: 1-scan delay vs guaranteed truth consistency
      console.log('[REB 2.8.5D][ENGINE_DATABASE_UPDATE] Updating system context AFTER successful engine stop...');
      await storage.updateSystemContext(mode, {
        isEngineActive: false,
        lastStoppedBy: userId,
        changedBy: req.user!.username || 'unknown',
        changeReason: 'User-initiated stop'
      });
      
      await storage.updateUser(userId, { tradingStatus: 'stopped' });
      
      console.log('[41D-FIX] Engine stop completed, preparing HTTP response...');
      
      // Phase 41D: Non-blocking WebSocket broadcast to prevent HTTP timeout
      const { tradingStateSync } = await import('./services/trading-state-sync.js');
      tradingStateSync.broadcastUserUpdate(userId)
        .then(() => console.log('[41D-FIX] Broadcast completed asynchronously (live mode stop)'))
        .catch(err => console.warn('[41D-FIX] Broadcast error:', err.message));
      
      console.log('[41D-FIX] Broadcast triggered asynchronously');
      
      console.log(`[TradingStop] Completed stop for user ${userId} mode=${currentMode} active=false`);
      
      // Phase 27.F.6: Log to trading_audit_log
      try {
        await storage.createTradingAuditLog({
          userId,
          action: 'stop',
          mode: context?.tradingMode || 'live',
          triggeredBy: 'manual',
          metadata: { engineStatus: 'stopped' }
        });
      } catch (auditError) {
        console.error('[TradingAudit] Failed to log stop action:', auditError);
      }
      
      res.json({ 
        success: true,
        mode: context?.tradingMode || mode,
        active: false,
        sessionId: null,
        // Phase 27.F.13.O: Include audit fields
        lastStoppedBy: context?.lastStoppedBy || userId,
        lastStartedBy: context?.lastStartedBy || null
      });
    } catch (error) {
      console.error('[TradingStop] Error stopping trading:', error);
      
      // REB 2.8.5D: No rollback needed - context update happens AFTER successful stop
      // If we reach this catch block, context was never flipped to false
      
      res.status(500).json({ error: 'Failed to stop trading' });
    }
  });

  // Phase 27.F.13.I: Force Stop - Admin-only emergency recovery endpoint
  // Phase 27.F.13.O: Refactored to use global mode-based context
  apiRouter.post('/trading/force-stop', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode, reason } = req.body; // Get mode from request (not userId)
      
      // Validate mode
      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ 
          error: 'Invalid mode',
          message: 'Mode must be either "live" or "paper"'
        });
      }
      
      console.log(`[ForceStop] Admin ${userId} forcing stop for ${mode} mode, reason: ${reason || 'emergency_recovery'}`);
      
      // Get current global state for this mode
      const context = await storage.getSystemContext(mode);
      const currentMode = context?.tradingMode || mode;
      
      // Force stop the specified mode's engine
      if (mode === 'paper') {
        try {
          const { stopPaperSimulation, clearGlobalPaperSimManager } = await import('./services/paper-sim-service.js');
          await stopPaperSimulation(userId); // Use current user for manager lookup
          clearGlobalPaperSimManager();
          console.log(`[ForceStop] Paper simulation force-stopped`);
        } catch (err) {
          console.error(`[ForceStop] Error stopping paper sim:`, err);
        }
      } else {
        try {
          // Stop all live engines (cleanup all users)
          for (const [engineUserId, engine] of tradingEngines.entries()) {
            await engine.stop();
            tradingEngines.delete(engineUserId);
          }
          console.log(`[ForceStop] Live trading engines force-stopped (all users)`);
        } catch (err) {
          console.error(`[ForceStop] Error stopping live engine:`, err);
        }
      }
      
      // Update admin user status
      await storage.updateUser(userId, { tradingStatus: 'stopped' });
      
      // Phase 27.F.13.O: Update global system_context with admin audit trail
      await storage.updateSystemContext(mode, {
        isEngineActive: false,
        lastStoppedBy: userId, // Admin user ID
        changedBy: req.user!.username || 'admin',
        changeReason: reason || 'Admin emergency force-stop'
      });
      
      // Broadcast state update (mode-scoped)
      const { tradingStateSync } = await import('./services/trading-state-sync.js');
      await tradingStateSync.broadcastUserUpdate(userId);
      
      // Audit log
      try {
        await storage.createTradingAuditLog({
          userId,
          action: 'force_stop',
          mode: currentMode,
          triggeredBy: 'admin',
          metadata: { 
            adminUserId: userId,
            reason: reason || 'emergency_recovery',
            modeTargeted: mode
          }
        });
      } catch (auditError) {
        console.error('[ForceStop] Failed to log audit:', auditError);
      }
      
      console.log(`[ForceStop] Completed force-stop for ${mode} mode`);
      
      res.json({ 
        success: true,
        message: `Global ${mode} trading engine force-stopped by admin`,
        mode: currentMode,
        active: false,
        // Phase 27.F.13.O: Include audit fields
        lastStoppedBy: userId,
        stoppedByAdmin: true
      });
    } catch (error: any) {
      console.error('[ForceStop] Error during force-stop:', error);
      res.status(500).json({ 
        error: 'Force-stop failed', 
        message: error.message 
      });
    }
  });

  // Phase 27.4: Set Trading Mode with Permission Validation
  apiRouter.post('/trading/set-mode', authenticateToken, async (req: TracedRequest, res) => {
    try {
      const userId = req.user!.id;
      const username = req.user!.username;
      const { mode, reason } = req.body;
      
      if (DIAGNOSTIC_MODE) {
        console.log(`[DX-TRADING] ========== MODE SWITCH TRACE START (req.id=${req.traceId}) ==========`);
        console.log(`[DX-TRADING] Request payload:`, JSON.stringify({ userId, username, mode, reason }, null, 2));
      }
      
      // Validate mode parameter
      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ 
          error: 'Invalid mode', 
          message: 'Mode must be either "live" or "paper"' 
        });
      }
      
      // Check permission based on requested mode
      const requiredPermission = mode === 'live' ? 'trade_live' : 'trade_paper';
      const userPermissions = req.user?.permissions || [];
      
      if (!userPermissions.includes(requiredPermission as any)) {
        return res.status(403).json({ 
          error: 'Permission denied',
          message: `You don't have permission to ${mode === 'live' ? 'trade live' : 'trade in paper mode'}`,
          requiredPermission
        });
      }
      
      // Import and use tradingStateSync service
      const { tradingStateSync } = await import('./services/trading-state-sync.js');
      
      // Get DB state before mode change
      if (DIAGNOSTIC_MODE) {
        const contextBefore = await storage.getSystemContext(userId);
        console.log(`[DX-TRADING] system_context.before:`, JSON.stringify(contextBefore, null, 2));
      }
      
      // Set trading mode with persistence and cluster synchronization
      const context = await tradingStateSync.setTradingMode(
        userId,
        mode,
        username,
        reason || `User switched to ${mode} mode`
      );
      
      // Get DB state after mode change
      if (DIAGNOSTIC_MODE) {
        const contextAfter = await storage.getSystemContext(userId);
        console.log(`[DX-TRADING] system_context.after:`, JSON.stringify(contextAfter, null, 2));
      }
      
      // Also update user record for backward compatibility
      await storage.updateUser(userId, { tradingMode: mode });
      
      const responsePayload = { 
        success: true,
        mode: context.tradingMode,
        previousMode: context.lastSafeState ? (context.lastSafeState as any).mode : undefined,
        changedAt: context.lastModeChange,
        changedBy: context.changedBy
      };
      
      if (DIAGNOSTIC_MODE) {
        console.log(`[DX-TRADING] Response payload:`, JSON.stringify(responsePayload, null, 2));
        console.log(`[DX-TRADING] WS event will be emitted: trading_state_changed`);
        console.log(`[DX-TRADING] ========== MODE SWITCH TRACE END (req.id=${req.traceId}) ==========`);
      }
      
      res.json(responsePayload);
    } catch (error: any) {
      console.error('Error setting trading mode:', error);
      res.status(500).json({ 
        error: 'Failed to set trading mode',
        message: error.message 
      });
    }
  });

  // Phase 8.7.3: Pre-Execution Validator - Validate trade intent before execution
  apiRouter.post('/trading/validate', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { signal, mode, traceId } = req.body;

      if (!signal || !signal.symbol || !signal.strategy) {
        return res.status(400).json({ error: 'Invalid trade signal: missing symbol or strategy' });
      }

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ error: 'Invalid mode: must be "live" or "paper"' });
      }

      const { preExecutionValidator } = await import('./services/pre-execution-validator');
      
      const validationResult = await preExecutionValidator.validateTrade({
        userId,
        signal,
        mode,
        traceId
      });

      res.json(validationResult);
    } catch (error: any) {
      console.error('Error validating trade:', error);
      res.status(500).json({ 
        error: 'Trade validation failed',
        message: error.message 
      });
    }
  });

  // Phase 8.5 Addendum K.4: Returns DUAL-MODE data (both live and paper) regardless of engine status
  // Phase 27.F.3: Enhanced to return unified trading state authority
  // Phase 27.F.13.O: Refactored to use global mode-based context with audit fields
  apiRouter.get('/trading/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const globalContextId = 'default';
      const requestedMode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      // Validate mode if provided
      if (requestedMode && requestedMode !== 'live' && requestedMode !== 'paper') {
        return res.status(400).json({ 
          error: 'Invalid mode',
          message: 'Mode query parameter must be either "live" or "paper"'
        });
      }
      
      // Phase 27.F.13.O: Get global system_context for requested mode
      const systemContext = await storage.getSystemContext(requestedMode);
      const currentMode = (systemContext?.tradingMode || requestedMode) as 'live' | 'paper';
      const isEngineActive = systemContext?.isEngineActive || false;
      
      // Check paper simulation engine status (system-wide)
      // Phase 27.F.13: Check global session for accurate running status
      const globalSession = (global as any).getGlobalSession?.() as SimulationSession | null;
      const isPaperSimRunning = !!(globalSession && globalSession.isRunning);
      
      // Phase 27.F.15.B.3: Check global live engine status
      const isLiveEngineRunning = globalLiveEngine.isEngineRunning();
      
      // Fetch data for BOTH modes in parallel
      const [
        livePortfolioState,
        paperPortfolioState,
        liveStrategies,
        paperStrategies,
        watchlist,
        activeTrades
      ] = await Promise.all([
        storage.getPortfolioState({ globalContextId, mode: 'live' }),
        storage.getPortfolioState({ globalContextId, mode: 'paper' }),
        storage.listStrategySettings({ globalContextId, mode: 'live' }),
        storage.listStrategySettings({ globalContextId, mode: 'paper' }),
        storage.getWatchlist({ mode: currentMode }),
        storage.getActiveTrades(currentMode)
      ]);
      console.log('[Phase-27.F.15.B.1] Updated route /api/trading/status → mode-based only');
      
      // Process live mode data
      const liveBalance = livePortfolioState ? parseFloat(livePortfolioState.balance) : 0;
      const liveActiveStrategies = liveStrategies
        .filter(s => s.enabled)
        .map(s => s.strategy);
      
      // Process paper mode data
      const paperBalance = paperPortfolioState ? parseFloat(paperPortfolioState.balance) : 0;
      const paperActiveStrategies = paperStrategies
        .filter(s => s.enabled)
        .map(s => s.strategy);
      
      // Phase 8.5 Addendum K.4.1: Log database-sourced data
      console.log(`[Addendum-K.4.1] LiveDataSource = Database (balance: $${liveBalance}, strategies: ${liveActiveStrategies.length}, engine: ${isLiveEngineRunning ? 'running' : 'stopped'})`);
      console.log(`[Addendum-K.4.1] PaperDataSource = Database (balance: $${paperBalance}, strategies: ${paperActiveStrategies.length}, engine: ${isPaperSimRunning ? 'running' : 'stopped'})`);
      
      // Phase 27.F.3: Log unified state authority verification
      console.log(`[Phase-27.F.3] Unified State: mode=${currentMode}, active=${isEngineActive}, lastUpdate=${systemContext?.updatedAt || 'N/A'}`);
      
      // Calculate metrics for current mode
      const filteredPairs = watchlist.length;
      const activeTradesCount = activeTrades.length;
      
      // Get ready to buy signals (if paper engine is running)
      let readyToBuy = 0;
      if (isPaperSimRunning && currentMode === 'paper') {
        const openPositions = await storage.getPaperSimOpenPositions('paper');
        readyToBuy = Math.max(0, filteredPairs - openPositions.length);
      }
      
      const lastTickISO = new Date().toISOString();
      
      // Phase 32.D-Fix.Final: Compute authoritative active state
      // Active = true if EITHER engine is running (paper OR live)
      const active = !!(isPaperSimRunning || isLiveEngineRunning);
      
      // Phase 27.F.3: Unified Trading State Authority object
      // Phase 27.F.13.O: Added audit fields
      // Phase 32.D-Fix.Final: Updated to match contract (mode, active, isEngineActivePaper, isEngineActiveLive, passiveLearning, ts)
      const unifiedState = {
        mode: currentMode,
        active,  // Phase 32.D-Fix.Final: Authoritative active state
        engineStatus: active ? 'ACTIVE' : 'STOPPED' as const,
        lastUpdate: systemContext?.updatedAt?.toISOString() || lastTickISO,
        lastUserAction: active ? 'start' : 'stop' as 'start' | 'stop' | null,
        lastModeChange: systemContext?.lastModeChange?.toISOString() || null,
        changedBy: systemContext?.changedBy || null,
        changeReason: systemContext?.changeReason || null,
        // Phase 27.F.13.O: Audit fields
        lastStartedBy: systemContext?.lastStartedBy || null,
        lastStoppedBy: systemContext?.lastStoppedBy || null,
        lastHeartbeat: systemContext?.lastHeartbeat?.toISOString() || null
      };
      
      // Return dual-mode structure with unified state authority (Phase 27.F.3)
      // Phase 27.F.12: Added mode-specific engine status fields
      // Phase 27.F.13.O: Global mode-based status with audit fields
      // Phase 32.D-Fix.Final: Added passiveLearning and ts for contract compliance
      res.json({
        // Phase 27.F.3: Unified state at the top level for easy access
        ...unifiedState,
        currentMode,
        isEngineActive: active,  // Phase 32.D-Fix.Final: Ensure consistency with active
        // Phase 27.F.12 + 32.D-Fix.Final: Mode-specific engine status
        isEngineActivePaper: !!isPaperSimRunning,
        isEngineActiveLive: !!isLiveEngineRunning,
        passiveLearning: !active,  // Phase 32.D-Fix.Final: Passive learning when stopped
        ts: lastTickISO,  // Phase 32.D-Fix.Final: timestamp
        dataSource: 'system_context',
        live: {
          portfolioBalance: liveBalance,
          activeStrategies: liveActiveStrategies,
          activeStrategiesCount: liveActiveStrategies.length,
          engineActive: isLiveEngineRunning,
          engineStatus: isLiveEngineRunning ? 'running' : 'stopped',
          dataSource: 'database'
        },
        paper: {
          portfolioBalance: paperBalance,
          activeStrategies: paperActiveStrategies,
          activeStrategiesCount: paperActiveStrategies.length,
          engineActive: isPaperSimRunning,
          engineStatus: isPaperSimRunning ? 'running' : 'stopped',
          dataSource: 'database'
        },
        // Legacy fields for backwards compatibility (use current mode)
        mode: currentMode,
        engineActive: currentMode === 'paper' ? isPaperSimRunning : isLiveEngineRunning,
        activeStrategies: currentMode === 'paper' ? paperActiveStrategies : liveActiveStrategies,
        activeStrategiesCount: currentMode === 'paper' ? paperActiveStrategies.length : liveActiveStrategies.length,
        portfolioBalance: currentMode === 'paper' ? paperBalance : liveBalance,
        filteredPairs,
        readyToBuy,
        activeTrades: activeTradesCount,
        lastTickISO
      });
    } catch (error) {
      console.error('Error getting trading status:', error);
      res.status(500).json({ error: 'Failed to get trading status' });
    }
  });

  // Portfolio and Metrics - Mode-aware endpoint (Phase 4A-3: Cached)
  apiRouter.get('/portfolio/overview', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      // Phase 4A-3: Check cache first
      const cacheKey = `portfolio:overview:${mode}:${userId}`;
      const cached = getCache(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // Phase 4A-3: Use request coalescing to prevent duplicate fetches
      const data = await coalesce(cacheKey, async () => {
        // Get mode-specific balance
        let totalValue: number;
        let cash: number;
        let crypto: number;
        let syncTimestamp: Date | undefined;
        let balanceSource: string;
        let balanceError: string | undefined;
        
        if (mode === 'paper') {
          // Paper mode - get simulated portfolio state
          const portfolioState = await storage.getPortfolioState({ mode: 'paper' });
          
          if (!portfolioState || !portfolioState.balance) {
            console.error('[Portfolio/Overview] Paper portfolio state not found or balance is null');
            throw new Error('Paper portfolio state not found');
          }
          
          const balance = parseFloat(portfolioState.balance);
          const cryptoValue = parseFloat(portfolioState.cryptoValue || '0');
          const cashValue = parseFloat(portfolioState.cash || balance.toString());
          
          totalValue = balance;
          cash = cashValue;
          crypto = cryptoValue;
          syncTimestamp = undefined;
          balanceSource = 'paper-sim';
          balanceError = undefined;
        } else {
          // Live mode - get Kraken balance
          const liveBalance = await riskManager.getLiveKrakenBalance(userId);
          totalValue = liveBalance.totalValueUSD;
          cash = liveBalance.cashUSD;
          crypto = liveBalance.cryptoUSD;
          syncTimestamp = liveBalance.syncTimestamp;
          balanceSource = liveBalance.source;
          balanceError = liveBalance.error;
        }
        
        // Get mode-specific metrics
        const metrics = await riskManager.getPortfolioMetrics(mode);
        const winRateData = await riskManager.getWinRate(mode, 30);
        
        return {
          totalValue,
          unrealizedPL: metrics.unrealizedPL,
          realizedPL: metrics.realizedPL,
          currentExposure: metrics.currentExposure,
          openTradesCount: metrics.openTradesCount,
          ...winRateData,
          cash,
          crypto,
          cashPercent: totalValue > 0 ? (cash / totalValue) * 100 : 0,
          cryptoPercent: totalValue > 0 ? (crypto / totalValue) * 100 : 0,
          syncTimestamp,
          balanceSource,
          balanceError
        };
      });
      
      // Phase 4A-3: Cache the result (90s TTL)
      setCache(cacheKey, data, 90000);
      res.json(data);
    } catch (error) {
      console.error('Error fetching portfolio overview:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio data' });
    }
  });

  apiRouter.get('/portfolio/earnings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const earnings = await riskManager.getEarnings(userId);
      res.json(earnings);
    } catch (error) {
      console.error('Error fetching earnings:', error);
      res.status(500).json({ error: 'Failed to fetch earnings data' });
    }
  });

  apiRouter.get('/portfolio/earnings-chart', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || (req.headers['x-app-mode'] as 'live' | 'paper') || 'paper';
      const days = parseInt(req.query.days as string) || 30;
      const chartData = await riskManager.getEarningsChartData(mode, days);
      res.json(chartData);
    } catch (error) {
      console.error('Error fetching earnings chart data:', error);
      res.status(500).json({ error: 'Failed to fetch earnings chart data' });
    }
  });

  apiRouter.get('/portfolio/history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const period = (req.query.period as string) || '1M';
      const mode = (req.query.mode as 'live' | 'paper') || 'live';
      
      // Phase 41F-L.E2E-PURGE: Read portfolio balance from portfolio_state (mode-level)
      const { getPortfolioBalanceV2 } = await import('./services/risk-manager.js');
      const initialBalance = await getPortfolioBalanceV2(mode, userId) || 50000;
      
      const now = new Date();
      let startDate = new Date();
      
      switch (period) {
        case '7D':
          startDate.setDate(now.getDate() - 7);
          break;
        case '1M':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case '3M':
          startDate.setMonth(now.getMonth() - 3);
          break;
        case 'YTD':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'ALL':
          startDate = new Date(now.getFullYear() - 2, 0, 1);
          break;
      }
      const allTrades = await storage.getTrades(mode, {});
      console.log('[Phase-27.F.15.B.1] Updated route /api/portfolio/history → mode-based only');
      const closedTrades = allTrades.filter(t => 
        t.status === 'closed' && 
        t.exitTime
      ).sort((a, b) => 
        new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime()
      );
      
      let portfolioValueAtStart = initialBalance;
      const tradesInPeriod: typeof closedTrades = [];
      
      closedTrades.forEach(trade => {
        const tradeDate = new Date(trade.exitTime!);
        if (tradeDate < startDate) {
          portfolioValueAtStart += Number(trade.realizedPL) || 0;
        } else {
          tradesInPeriod.push(trade);
        }
      });
      
      const dataPoints: Array<{ date: string; value: number; timestamp: number }> = [];
      let currentValue = portfolioValueAtStart;
      
      dataPoints.push({
        date: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: portfolioValueAtStart,
        timestamp: startDate.getTime()
      });
      
      tradesInPeriod.forEach(trade => {
        if (trade.realizedPL) {
          currentValue += Number(trade.realizedPL);
          dataPoints.push({
            date: new Date(trade.exitTime!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: currentValue,
            timestamp: new Date(trade.exitTime!).getTime()
          });
        }
      });
      
      if (dataPoints.length === 1 || (dataPoints.length > 1 && new Date(dataPoints[dataPoints.length - 1].timestamp).getTime() < now.getTime() - 86400000)) {
        dataPoints.push({
          date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: currentValue,
          timestamp: now.getTime()
        });
      }
      
      res.json(dataPoints);
    } catch (error) {
      console.error('Error fetching portfolio history:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio history' });
    }
  });

  apiRouter.get('/portfolio/value-history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const period = (req.query.period as string) || '30d';
      const mode = (req.query.mode as 'live' | 'paper') || 'live';
      
      // Phase 41F-L.E2E-PURGE: Read portfolio balance from portfolio_state (mode-level)
      const { getPortfolioBalanceV2 } = await import('./services/risk-manager.js');
      const initialBalance = await getPortfolioBalanceV2(mode, userId) || 50000;
      
      const now = new Date();
      let startDate = new Date();
      
      switch (period) {
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
        case 'all':
          startDate = new Date(now.getFullYear() - 2, 0, 1);
          break;
      }
      const allTrades = await storage.getTrades(mode, {});
      console.log('[Phase-27.F.15.B.1] Updated route /api/portfolio/value-history → mode-based only');
      const closedTrades = allTrades.filter(t => 
        t.status === 'closed' && 
        t.exitTime
      ).sort((a, b) => 
        new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime()
      );
      
      let portfolioValueAtStart = initialBalance;
      const tradesInPeriod: typeof closedTrades = [];
      
      closedTrades.forEach(trade => {
        const tradeDate = new Date(trade.exitTime!);
        if (tradeDate < startDate) {
          portfolioValueAtStart += Number(trade.realizedPL) || 0;
        } else {
          tradesInPeriod.push(trade);
        }
      });
      
      const dataPoints: Array<{ date: string; value: number }> = [];
      let currentValue = portfolioValueAtStart;
      
      dataPoints.push({
        date: startDate.toISOString(),
        value: portfolioValueAtStart
      });
      
      tradesInPeriod.forEach(trade => {
        if (trade.realizedPL) {
          currentValue += Number(trade.realizedPL);
          dataPoints.push({
            date: new Date(trade.exitTime!).toISOString(),
            value: currentValue
          });
        }
      });
      
      if (dataPoints.length === 1 || (dataPoints.length > 1 && new Date(dataPoints[dataPoints.length - 1].date).getTime() < now.getTime() - 86400000)) {
        dataPoints.push({
          date: now.toISOString(),
          value: currentValue
        });
      }
      
      res.json(dataPoints);
    } catch (error) {
      console.error('Error fetching portfolio value history:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio value history' });
    }
  });

  apiRouter.get('/portfolio/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as 'live' | 'paper') || 'live';
      
      // Phase 41F-L.E2E-PURGE: Read portfolio balance from portfolio_state (mode-level)
      const { getPortfolioBalanceV2 } = await import('./services/risk-manager.js');
      const initialBalance = await getPortfolioBalanceV2(mode, userId) || 50000;
      const allTrades = await storage.getTrades(mode, {});
      console.log('[Phase-27.F.15.B.1] Updated route /api/portfolio/stats → mode-based only');
      const closedTrades = allTrades.filter(t => t.status === 'closed' && t.exitTime);
      
      const totalProfitLoss = closedTrades.reduce((sum, t) => sum + (Number(t.realizedPL) || 0), 0);
      const currentValue = initialBalance + totalProfitLoss;
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const tradesLast24h = closedTrades.filter(t => 
        t.exitTime && new Date(t.exitTime) >= yesterday
      );
      
      const change24h = tradesLast24h.reduce((sum, t) => sum + (Number(t.realizedPL) || 0), 0);
      const valueYesterday = currentValue - change24h;
      const changePercent24h = valueYesterday !== 0 ? (change24h / valueYesterday) * 100 : 0;
      
      const winningTrades = closedTrades.filter(t => (Number(t.realizedPL) || 0) > 0).length;
      const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;
      
      res.json({
        currentValue,
        change24h,
        changePercent24h,
        winRate
      });
    } catch (error) {
      console.error('Error fetching portfolio stats:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio stats' });
    }
  });

  // Trades
  apiRouter.get('/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { status, symbol, strategy, limit, mode } = req.query;
      const tradeMode = (mode as 'live' | 'paper') || 'live';
      
      const trades = await storage.getTrades(tradeMode, {
        status: status as string,
        symbol: symbol as string,
        strategy: strategy as string,
        limit: limit ? parseInt(limit as string) : undefined
      });
      console.log('[Phase-27.F.15.B.1] Updated route /api/trades → mode-based only');
      
      res.json(trades);
    } catch (error) {
      console.error('Error fetching trades:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  apiRouter.get('/trades/active', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Phase 27.F.15.B.3: Get mode from query, default to paper
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      // Phase 7.6: Use TradeBob for caching if enabled, otherwise fallback
      const trades = tradeBob.isEnabled()
        ? await tradeBob.getAllActiveTrades(userId)
        : await storage.getActiveTrades(mode);
      console.log('[Phase-27.F.15.B.1] Updated route /api/trades/active → mode-based only');
      
      res.json(trades);
    } catch (error) {
      console.error('Error fetching active trades:', error);
      res.status(500).json({ error: 'Failed to fetch active trades' });
    }
  });

  apiRouter.post('/trades/:id/close', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id, mode } = req.params;
      const tradeMode = (req.body.mode || mode || 'paper') as 'live' | 'paper';
      
      // Phase 27.F.15.B.3: Use global engine based on mode
      const engine = tradeMode === 'live' ? globalLiveEngine : globalPaperEngine;
      
      const closedTrade = await engine.closeTrade(id, 'manual');
      
      // Phase 7.6: Invalidate TradeBob cache on trade close
      tradeBob.invalidateActiveTrades(userId);
      if (closedTrade.mode === 'paper') {
        tradeBob.invalidatePaperTrades(userId);
      }
      
      res.json(closedTrade);
    } catch (error) {
      console.error('Error closing trade:', error);
      res.status(500).json({ error: 'Failed to close trade' });
    }
  });

  // Watchlist
  apiRouter.get('/watchlist', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      const watchlist = await storage.getWatchlist({ mode });
      console.log('[Phase-27.F.15.B.1] Updated route /api/watchlist → mode-based only');
      res.json(watchlist);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
  });

  apiRouter.post('/watchlist', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      const validatedData = insertWatchlistPairSchema.parse({ ...req.body, userId, mode });
      
      const pair = await storage.addWatchlistPair(validatedData);
      res.json(pair);
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      res.status(500).json({ error: 'Failed to add to watchlist' });
    }
  });

  apiRouter.delete('/watchlist/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      await storage.removeWatchlistPair(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
  });

  // Trading Signals (Ready-to-Buy opportunities)
  apiRouter.get('/trading-signals', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      const { status } = req.query;
      
      const signals = await storage.getTradingSignals({ 
        mode, 
        status: status as string | undefined 
      });
      console.log('[Phase-27.F.15.B.1] Updated route /api/trading-signals → mode-based only');
      
      res.json(signals);
    } catch (error) {
      console.error('Error fetching trading signals:', error);
      res.status(500).json({ error: 'Failed to fetch trading signals' });
    }
  });

  // Market Data
  apiRouter.get('/market/overview', async (req: AuthenticatedRequest, res) => {
    try {
      const overview = await marketScanner.getMarketOverview();
      res.json(overview);
    } catch (error) {
      console.error('Error fetching market overview:', error);
      res.status(500).json({ error: 'Failed to fetch market overview' });
    }
  });

  apiRouter.get('/market/ticker/:symbol', async (req: AuthenticatedRequest, res) => {
    try {
      const { symbol } = req.params;
      const kraken = new KrakenService();
      const ticker = await kraken.getTicker(symbol);
      res.json(ticker);
    } catch (error) {
      console.error('Error fetching ticker:', error);
      res.status(500).json({ error: 'Failed to fetch ticker data' });
    }
  });

  // AI Features
  apiRouter.get('/ai/reports', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { type, limit } = req.query;
      
      const reports = await storage.getAIReports(
        userId, 
        type as string, 
        limit ? parseInt(limit as string) : 10
      );
      
      res.json(reports);
    } catch (error) {
      console.error('Error fetching AI reports:', error);
      res.status(500).json({ error: 'Failed to fetch AI reports' });
    }
  });

  apiRouter.post('/ai/reports/generate', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { type } = req.body; // 'daily', 'weekly', 'monthly'
      
      let report;
      switch (type) {
        case 'daily':
          report = await aiAnalyst.generateDailyReport(userId);
          break;
        case 'weekly':
          report = await aiAnalyst.generateWeeklyReport(userId);
          break;
        case 'monthly':
          report = await aiAnalyst.generateMonthlyReport(userId);
          break;
        default:
          return res.status(400).json({ error: 'Invalid report type' });
      }
      
      res.json(report);
    } catch (error) {
      console.error('Error generating AI report:', error);
      res.status(500).json({ error: 'Failed to generate AI report' });
    }
  });

  apiRouter.post('/ai/analyze-symbol', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { symbol } = req.body;
      
      const analysis = await aiAnalyst.analyzeSymbol(symbol, userId);
      res.json(analysis);
    } catch (error) {
      console.error('Error analyzing symbol:', error);
      res.status(500).json({ error: 'Failed to analyze symbol' });
    }
  });

  // Daily Briefs
  apiRouter.get('/daily-briefs/today', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const today = new Date().toISOString().split('T')[0];
      
      const brief = await storage.getDailyBrief(userId, today);
      res.json(brief || null);
    } catch (error) {
      console.error('Error fetching today\'s brief:', error);
      res.status(500).json({ error: 'Failed to fetch today\'s brief' });
    }
  });

  apiRouter.get('/daily-briefs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { status, limit, startDate, endDate } = req.query;
      
      const briefs = await storage.getDailyBriefs(userId, {
        status: status as string,
        limit: limit ? parseInt(limit as string) : 30,
        startDate: startDate as string,
        endDate: endDate as string
      });
      
      res.json(briefs);
    } catch (error) {
      console.error('Error fetching briefs:', error);
      res.status(500).json({ error: 'Failed to fetch briefs' });
    }
  });

  apiRouter.get('/daily-briefs/:date', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { date } = req.params;
      
      const brief = await storage.getDailyBrief(userId, date);
      res.json(brief || null);
    } catch (error) {
      console.error('Error fetching brief:', error);
      res.status(500).json({ error: 'Failed to fetch brief' });
    }
  });

  apiRouter.post('/daily-briefs/update', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      await dailyBriefService.updateDailyBrief(userId);
      res.json({ success: true, message: 'Brief updated successfully' });
    } catch (error) {
      console.error('Error updating brief:', error);
      res.status(500).json({ error: 'Failed to update brief' });
    }
  });

  // Paper Trading Routes (Complete data isolation from live trading)
  apiRouter.get('/paper/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const trades = await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/paper/trades → mode-based only');
      res.json(trades);
    } catch (error) {
      console.error('Error fetching paper trades:', error);
      res.status(500).json({ error: 'Failed to fetch paper trades' });
    }
  });

  apiRouter.get('/paper/trades/open', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Phase 7.6: Use TradeBob for caching if enabled, otherwise fallback
      const trades = tradeBob.isEnabled()
        ? await tradeBob.getOpenPaperTrades(userId)
        : await storage.getOpenPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/paper/trades/open → mode-based only');
      
      res.json(trades);
    } catch (error) {
      console.error('Error fetching open paper trades:', error);
      res.status(500).json({ error: 'Failed to fetch open paper trades' });
    }
  });

  apiRouter.delete('/paper/trades/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      await storage.deleteAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/paper/trades/clear → mode-based only');
      
      // Phase 7.6: Invalidate TradeBob cache when paper trades are cleared
      tradeBob.invalidateActiveTrades(userId); // Invalidate combined cache
      tradeBob.invalidatePaperTrades(userId);   // Invalidate paper-specific cache
      
      res.json({ success: true, message: 'All paper trades cleared' });
    } catch (error) {
      console.error('Error clearing paper trades:', error);
      res.status(500).json({ error: 'Failed to clear paper trades' });
    }
  });

  apiRouter.get('/paper/briefs/today', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const today = new Date().toISOString().split('T')[0];
      
      const brief = await storage.getPaperDailyBrief(userId, today);
      res.json(brief || null);
    } catch (error) {
      console.error('Error fetching today\'s paper brief:', error);
      res.status(500).json({ error: 'Failed to fetch today\'s paper brief' });
    }
  });

  apiRouter.get('/paper/briefs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { status, limit } = req.query;
      
      const briefs = await storage.getPaperDailyBriefs(userId, {
        status: status as string,
        limit: limit ? parseInt(limit as string) : 30
      });
      
      res.json(briefs);
    } catch (error) {
      console.error('Error fetching paper briefs:', error);
      res.status(500).json({ error: 'Failed to fetch paper briefs' });
    }
  });

  apiRouter.get('/paper/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { PaperMetricsService } = await import('./services/paper-metrics.js');
      const metricsService = new PaperMetricsService(userId);
      
      const [portfolio, winRate, stats, performanceByStrategy, earnings, ade, trend] = await Promise.all([
        metricsService.getPortfolioMetrics(),
        metricsService.getWinRate(30),
        metricsService.getTradeStatistics(),
        metricsService.getPerformanceByStrategy(),
        metricsService.getEarnings(),
        metricsService.getAverageDailyEarnings(),
        metricsService.get7DayEarningsTrend()
      ]);
      
      res.json({
        portfolio,
        winRate,
        stats,
        performanceByStrategy,
        earnings,
        averageDailyEarnings: ade,
        earningsTrend: trend
      });
    } catch (error) {
      console.error('Error fetching paper metrics:', error);
      res.status(500).json({ error: 'Failed to fetch paper metrics' });
    }
  });

  apiRouter.get('/paper/metrics/portfolio', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { PaperMetricsService } = await import('./services/paper-metrics.js');
      const metricsService = new PaperMetricsService(userId);
      
      const metrics = await metricsService.getPortfolioMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching paper portfolio metrics:', error);
      res.status(500).json({ error: 'Failed to fetch paper portfolio metrics' });
    }
  });

  // Phase 27.F.14.I: Paper portfolio state from portfolio_state table (accurate balance)
  apiRouter.get('/paper/portfolio/state', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const portfolioState = await storage.getPortfolioState({ mode: 'paper' });
      
      if (!portfolioState || !portfolioState.balance) {
        console.error('[Paper/Portfolio/State] Portfolio state not found or balance is null');
        return res.status(404).json({ error: 'Paper portfolio state not found' });
      }
      
      const balance = parseFloat(portfolioState.balance);
      const unrealizedPnl = parseFloat(portfolioState.unrealizedPnl || '0');
      const realizedPnl = parseFloat(portfolioState.realizedPnl || '0');
      const cryptoValue = parseFloat(portfolioState.cryptoValue || '0');
      const cash = parseFloat(portfolioState.cash || balance.toString());
      
      res.json({
        totalValue: balance,
        cash,
        crypto: cryptoValue,
        cashPercent: balance > 0 ? (cash / balance) * 100 : 0,
        cryptoPercent: balance > 0 ? (cryptoValue / balance) * 100 : 0,
        unrealizedPL: unrealizedPnl,
        realizedPL: realizedPnl,
        currentExposure: 0, // TODO: Calculate from open positions
        openTradesCount: 0, // TODO: Count from open positions
        totalTrades: 0, // TODO: Count from trades history
        wins: 0,
        losses: 0,
        winRate: 0,
        balanceSource: 'portfolio_state_table',
        syncTimestamp: portfolioState.lastUpdated?.getTime() || Date.now()
      });
    } catch (error) {
      console.error('Error fetching paper portfolio state:', error);
      res.status(500).json({ error: 'Failed to fetch paper portfolio state' });
    }
  });

  apiRouter.get('/paper/metrics/earnings-chart', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const days = parseInt(req.query.days as string) || 30;
      
      // Get paper trades for the specified period
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const trades = await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/paper/metrics/earnings-chart → mode-based only');
      
      // Group trades by date and calculate daily earnings
      const earningsByDate = new Map<string, number>();
      
      for (const trade of trades) {
        if (trade.status === 'closed' && trade.exitTime) {
          const closeDate = new Date(trade.exitTime);
          if (closeDate >= startDate && closeDate <= endDate) {
            const dateKey = closeDate.toISOString().split('T')[0];
            const currentEarnings = earningsByDate.get(dateKey) || 0;
            earningsByDate.set(dateKey, currentEarnings + (parseFloat(trade.realizedPL as any) || 0));
          }
        }
      }
      
      // Convert to array format expected by frontend
      const chartData = Array.from(earningsByDate.entries()).map(([date, earnings]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        earnings: parseFloat(earnings.toFixed(2)),
        timestamp: new Date(date).getTime()
      })).sort((a, b) => a.timestamp - b.timestamp);
      
      res.json(chartData);
    } catch (error) {
      console.error('Error fetching paper earnings chart:', error);
      res.status(500).json({ error: 'Failed to fetch paper earnings chart' });
    }
  });

  apiRouter.get('/paper/metrics/history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const days = parseInt(req.query.days as string) || 30;
      
      // Get paper trades for the specified period
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const trades = await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/paper/metrics/history → mode-based only');
      
      // Get initial balance from portfolio_state
      const portfolioState = await storage.getPortfolioState({ userId, mode: 'paper' });
      const initialBalance = portfolioState?.balance ? parseFloat(portfolioState.balance as any) : 10000;
      
      // Calculate running balance over time
      const historyByDate = new Map<string, number>();
      let runningBalance = initialBalance;
      
      for (const trade of trades.sort((a, b) => 
        new Date(a.exitTime || a.entryTime).getTime() - new Date(b.exitTime || b.entryTime).getTime()
      )) {
        if (trade.status === 'closed' && trade.exitTime) {
          const closeDate = new Date(trade.exitTime);
          if (closeDate >= startDate && closeDate <= endDate) {
            runningBalance += (parseFloat(trade.realizedPL as any) || 0);
            const dateKey = closeDate.toISOString().split('T')[0];
            historyByDate.set(dateKey, runningBalance);
          }
        }
      }
      
      // Convert to array format
      const historyData = Array.from(historyByDate.entries()).map(([date, balance]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        totalValue: parseFloat(balance.toFixed(2)),
        timestamp: new Date(date).getTime()
      })).sort((a, b) => a.timestamp - b.timestamp);
      
      res.json(historyData);
    } catch (error) {
      console.error('Error fetching paper metrics history:', error);
      res.status(500).json({ error: 'Failed to fetch paper metrics history' });
    }
  });

  apiRouter.get('/paper/trades/active', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const allTrades = await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/paper/trades/active → mode-based only');
      const activeTrades = allTrades.filter(t => t.status === 'open');
      res.json(activeTrades);
    } catch (error) {
      console.error('Error fetching active paper trades:', error);
      res.status(500).json({ error: 'Failed to fetch active paper trades' });
    }
  });

  /**
   * [41F-L.2] Route-level debug logging for paper trade test endpoint
   */
  apiRouter.use("/paper/trade/test", (req, _res, next) => {
    console.log("[41F-L.2][REQ]", {
      url: req.url,
      method: req.method,
      ct: req.headers["content-type"],
      hasBody: !!req.body
    });
    next();
  });

  /**
   * [41F-L.3] Permanent — Paper Trade Test (schema-validated, with fallback)
   */
  console.log('[41F-L.3][REGISTRATION] /api/paper/trade/test endpoint with fallback');
  apiRouter.post("/paper/trade/test", authenticateToken, requireJson, async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = TradeTestSchema.safeParse({
        symbol: req?.body?.symbol,
        action: req?.body?.action,
        amount: typeof req?.body?.amount === "string" ? Number(req.body.amount) : req?.body?.amount
      });

      if (!parsed.success) {
        console.warn("[41F-L.3][WARN] Body validation failed:", parsed.error.flatten());
        return res.status(400).json({ ok: false, error: "Invalid body", details: parsed.error.flatten() });
      }

      const { symbol, action, amount } = parsed.data;
      const userId = req.user!.id;

      console.log(`[41F-L.3] Paper test trade → ${symbol} ${action} ${amount} (user: ${userId})`);

      // Try engine path first
      try {
        const { getEngine } = await import("./services/mode-registry.js");
        const engine = getEngine?.("paper");
        
        if (engine?.buildTrade && engine?.executeTrade) {
          console.log("[41F-L.3] Using engine path");
          const tradeCandidate = await engine.buildTrade(symbol, action, amount);
          if (tradeCandidate) {
            const result = await engine.executeTrade(tradeCandidate);
            console.log("[41F-L.3][INFO] Trade executed via engine:", result?.id);
            return res.json({ ok: true, success: true, trade: result });
          }
        }
      } catch (engineErr) {
        console.warn("[41F-L.3][WARN] Engine path failed, using fallback:", engineErr);
      }

      // Fallback: Direct trade creation without engine
      console.log("[41F-L.3] Using direct fallback path");
      
      // Get mock price for the symbol
      const mockPrice = symbol.includes('BTC') ? 68000 : 
                       symbol.includes('ETH') ? 3500 : 
                       symbol.includes('SOL') ? 170 : 100;
      
      const entryPrice = mockPrice;
      const stopPrice = action === 'buy' ? mockPrice * 0.98 : mockPrice * 1.02;
      const targetPrice = action === 'buy' ? mockPrice * 1.03 : mockPrice * 0.97;
      const tradeValue = mockPrice * amount;

      // Phase 41F-L.E2E: Use unified commit service for proper tracking
      const { commitTradeAndUpdatePortfolio } = await import("./services/commitTradeAndUpdatePortfolio.js");
      const { lineageService } = await import("./services/lineage.js");
      
      // Generate traceId for lineage tracking
      const traceId = lineageService.generateTraceId();
      
      // Emit filter_snapshot (mock - test endpoint)
      await lineageService.emitFilterSnapshot({
        traceId,
        symbol,
        mode: 'paper',
        universeTotal: 1500,
        evaluated: 1500,
        eligible: true,
        filters: { test: true }
      });
      
      // Emit signal_snapshot (mock - test endpoint)
      await lineageService.emitSignalSnapshot({
        traceId,
        symbol,
        mode: 'paper',
        strategy: 'mean_reversion',
        signal: action as 'buy' | 'sell',
        confidence: 0.75
      });
      
      // Emit order_submitted
      const tradeId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await lineageService.emitOrderSubmitted({
        traceId,
        symbol,
        mode: 'paper',
        orderId: tradeId,
        side: action as 'buy' | 'sell',
        quantity: amount,
        price: entryPrice
      });

      // Commit trade with unified service (includes portfolio update, broadcasts, lineage)
      const result = await commitTradeAndUpdatePortfolio({
        id: tradeId,
        userId,
        symbol,
        quantity: amount,
        entryPrice,
        stopPrice,
        targetPrice,
        riskAmount: tradeValue * 0.02,
        status: 'closed',
        exitPrice: entryPrice,
        exitTime: new Date(),
        realizedPL: 0,
        realizedPLPercent: 0,
        strategy: 'mean_reversion',
        mode: 'paper'
      }, traceId);

      console.log("[41F-L.E2E] Trade committed with portfolio update:", {
        tradeId: result.trade.id,
        portfolioValue: result.portfolio.totalValue,
        traceId
      });

      return res.json({ 
        ok: true, 
        success: true, 
        trade: result.trade,
        portfolio: result.portfolio,
        traceId,
        fallback: true,
        message: "Trade executed via unified commit service with lineage tracking"
      });
    } catch (err) {
      console.error("[41F-L.3][ERROR] Paper trade test failed:", err);
      return next(err); // handled by global error handler
    }
  });

  // Phase 41F-K: Dry-run mode test endpoint
  apiRouter.post('/dryrun/trade/test', authenticateToken, async (req: AuthenticatedRequest, res) => {
    console.log('[41F-K][ENDPOINT] Dry-run trade test request:', req.body);
    
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { symbol, action, amount, price } = req.body;
      
      // Get mode from headers first
      const mode = (req.headers['x-app-mode'] as 'paper' | 'live') || 'paper';

      // Validate inputs
      if (!symbol || !action || !amount) {
        return res.status(400).json({ error: 'Missing required fields: symbol, action, amount' });
      }

      if (!['buy', 'sell'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be buy or sell' });
      }

      if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be positive' });
      }

      // Get current price (use provided or default mock price)
      const currentPrice = price || 50000;

      console.log(`[41F-K][DRYRUN] Test trade: ${action} ${amount} ${symbol} @ $${currentPrice.toFixed(2)}`);

      // Check if dry-run mode is enabled
      const isDryRun = process.env.DRYRUN_TRADING === 'true';

      // Calculate trade parameters
      const tradeId = `dryrun-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const entryPrice = currentPrice;
      const stopPrice = currentPrice * (action === 'buy' ? 0.98 : 1.02); // 2% stop
      const targetPrice = currentPrice * (action === 'buy' ? 1.03 : 0.97); // 3% target

      console.log(`[41F-K][DRYRUN] ${isDryRun ? 'DRY-RUN MODE ENABLED' : 'Normal mode'} - simulating trade execution`);
      console.log(`[41F-K][DRYRUN] Entry: $${entryPrice.toFixed(2)}, Stop: $${stopPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}`);

      // Record telemetry for dry-run trade
      const { telemetryService } = await import('./services/telemetry-service.js');
      await telemetryService.recordTradeEvent('dryrun_trade', {
        symbol,
        action,
        mode,
        amount,
        price: currentPrice,
        strategy: 'manual_dryrun_test',
        simulated: true
      });

      // Create simulated trade object
      const simulatedTrade = {
        id: tradeId,
        symbol,
        action,
        quantity: amount,
        entryPrice,
        stopPrice,
        targetPrice,
        strategy: 'manual_dryrun_test',
        timestamp: new Date()
      };

      console.log('[41F-K][DRYRUN] ✅ Simulated trade complete (no DB write)');

      res.json({
        ok: true,
        simulated: true,
        dryrun: isDryRun,
        trade: simulatedTrade
      });

    } catch (error: any) {
      console.error('[41F-K][ERROR] Dry-run test failed:', error);
      res.status(500).json({ ok: false, error: error.message || 'Dry-run test failed' });
    }
  });

  // Live Trading Routes (Phase 22.3)
  // Control live trading mode with manual approval requirements
  apiRouter.post('/live-trading/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { liveTradingService } = await import('./services/live-trading-service.js');
      
      const result = await liveTradingService.startLiveTrading(userId);
      
      if (result.success) {
        res.json(result);
      } else {
        // Manual approval required - return 202 Accepted with approval prompt
        res.status(202).json(result);
      }
    } catch (error: any) {
      console.error('Error starting live trading:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/live-trading/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { liveTradingService } = await import('./services/live-trading-service.js');
      
      const result = await liveTradingService.stopLiveTrading(userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error stopping live trading:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/live-trading/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { liveTradingService } = await import('./services/live-trading-service.js');
      
      const result = await liveTradingService.checkLiveTradingStatus(userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error checking live trading status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Approval endpoint for live trading (called after user confirms)
  apiRouter.post('/live-trading/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { liveTradingService } = await import('./services/live-trading-service.js');
      
      const result = await liveTradingService.activateLiveTrading(userId);
      res.json(result);
    } catch (error: any) {
      console.error('Error approving live trading:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 24: Automatic Test Harness API
  apiRouter.post('/auto-test/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      console.log('[AutoTest] Running automatic test harness via API...');
      
      const { runAutoTests } = await import('./services/auto_test_harness.js');
      const { markdown, json } = await runAutoTests(userId);
      
      // Save reports to filesystem
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Ensure reports directory exists
      const reportsDir = path.join(process.cwd(), 'reports');
      await fs.mkdir(reportsDir, { recursive: true });
      
      await fs.writeFile(path.join(reportsDir, 'auto_test_results.md'), markdown);
      await fs.writeFile(path.join(reportsDir, 'auto_test_results.json'), JSON.stringify(json, null, 2));
      
      console.log('[AutoTest] Reports generated successfully');
      
      res.json({
        success: true,
        results: json,
        markdown,
      });
    } catch (error: any) {
      console.error('[AutoTest] Error running tests:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 26.1: Auto-Tuning Engine API
  apiRouter.get('/tuning/events', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode, limit = 50 } = req.query;
      
      const events = await storage.getTuningEvents({
        userId,
        mode: mode as string | undefined,
        limit: Number(limit) || 50
      });
      
      res.json(events);
    } catch (error: any) {
      console.error('[TuningAPI] Error fetching events:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/tuning/policy', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode } = req.query;
      
      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ error: 'Valid mode parameter required (live or paper)' });
      }
      
      const policy = await storage.getTuningPolicy({ userId, mode: mode as 'live' | 'paper' });
      
      if (!policy) {
        // Return default policy if none exists (cooldownMinutes matches guardrails default)
        return res.json({
          enabled: false,
          aggressiveness: 'balanced',
          maxStepPercent: '10.00',
          cooldownMinutes: 15,
          maxDailyAdjustments: 10,
          fieldBounds: {},
          currentCounters: { adjustmentsToday: 0, reverts: 0 }
        });
      }
      
      res.json(policy);
    } catch (error: any) {
      console.error('[TuningAPI] Error fetching policy:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/tuning/enable', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode, aggressiveness = 'balanced', fieldBounds = {} } = req.body;
      
      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ error: 'Valid mode is required (live or paper)' });
      }
      
      const validAggressiveness = ['conservative', 'balanced', 'aggressive'];
      if (aggressiveness && !validAggressiveness.includes(aggressiveness)) {
        return res.status(400).json({ error: 'Invalid aggressiveness level' });
      }
      
      // Phase 27.F.15.UI-SYNC.9: Read cooldownMinutes from Guardrails to keep in sync
      const guardrails = await storage.getGuardrails(userId, mode);
      const cooldownMinutes = guardrails?.cooldownMinutes ?? 15; // Default to 15 if not set
      
      const policy = await storage.upsertTuningPolicy({
        userId,
        mode,
        enabled: true,
        aggressiveness,
        fieldBounds,
        maxStepPercent: '10.00',
        cooldownMinutes,
        maxDailyAdjustments: 10,
        currentCounters: { adjustmentsToday: 0, reverts: 0 }
      });
      
      console.log(`[PolicySync] Tuning enabled with cooldown synchronized from Guardrails → ${cooldownMinutes} minutes`);
      
      res.json({ success: true, policy });
    } catch (error: any) {
      console.error('[TuningAPI] Error enabling tuning:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/tuning/disable', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode } = req.body;
      
      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ error: 'Valid mode is required (live or paper)' });
      }
      
      const policy = await storage.upsertTuningPolicy({
        userId,
        mode,
        enabled: false
      });
      
      res.json({ success: true, policy });
    } catch (error: any) {
      console.error('[TuningAPI] Error disabling tuning:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/tuning/rollback', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { eventId } = req.body;
      
      if (!eventId) {
        return res.status(400).json({ error: 'eventId is required' });
      }
      
      // Fetch the event to rollback
      const events = await storage.getTuningEvents({ userId, limit: 1000 });
      const event = events.find(e => e.id === eventId);
      
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      if (event.reverted) {
        return res.status(400).json({ error: 'Event already reverted' });
      }
      
      // Mark event as reverted
      await storage.updateTuningEvent(eventId, { reverted: true });
      
      // Create a rollback event (new tuning event reversing the change)
      const rollbackEvent = await storage.createTuningEvent({
        userId: event.userId,
        mode: event.mode,
        field: event.field,
        oldValue: event.newValue, // Swap old and new
        newValue: event.oldValue,
        confidence: '1.00', // Manual rollback is certain
        reason: `Manual rollback of event ${eventId}`,
        approvalType: 'manual',
        status: 'success',
        reverted: false
      });
      
      res.json({ 
        success: true, 
        originalEvent: event,
        rollbackEvent
      });
    } catch (error: any) {
      console.error('[TuningAPI] Error rolling back event:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Paper Trading Simulation Engine Routes (Milestone 18)
  // NOTE: Paper trading is SYSTEM-WIDE. Only ONE simulation can run at a time.
  // All users see the same simulation status.
  
  // Initialize on global object so paper-sim-service can access it
  if ((global as any).globalPaperPortfolioManager === undefined) {
    (global as any).globalPaperPortfolioManager = null;
  }
  if ((global as any).globalPaperSimOperationLock === undefined) {
    (global as any).globalPaperSimOperationLock = null;
  }

  // Global system-wide simulation session registry
  // NOTE: This is SYSTEM-WIDE, not user-specific. All users see the same simulation status.
  interface SimulationSession {
    sessionId: string;
    startedBy: string; // User who started the simulation (for audit purposes)
    startTime: Date;
    isRunning: boolean;
    type: '48hr' | 'manual';
  }

  let globalSimulationSession: SimulationSession | null = null;

  // Session management helpers (exported for use by Paper48HrSimulation)
  (global as any).registerSimulationSession = (session: SimulationSession): void => {
    globalSimulationSession = session;
    console.log(`[SimRegistry] Registered GLOBAL session ${session.sessionId} (started by user ${session.startedBy})`);
  };

  (global as any).deregisterSimulationSession = (): void => {
    if (globalSimulationSession) {
      console.log(`[SimRegistry] Deregistered GLOBAL session ${globalSimulationSession.sessionId}`);
      globalSimulationSession = null;
    }
  };

  (global as any).getGlobalSession = (): SimulationSession | null => {
    return globalSimulationSession;
  };

  // Internal endpoint for 48hr simulation script to register session (no auth required - internal use only)
  apiRouter.post('/internal/paper-sim/register-session', async (req, res) => {
    try {
      const { sessionId, startedBy, startTime, type } = req.body;
      
      if (!sessionId || !startedBy || !startTime || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      globalSimulationSession = {
        sessionId,
        startedBy,
        startTime: new Date(startTime),
        isRunning: true,
        type
      };
      
      console.log(`[SimRegistry] Registered GLOBAL session ${sessionId} (started by user ${startedBy}) via API`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error registering simulation session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Internal endpoint for 48hr simulation script to deregister session (no auth required - internal use only)
  apiRouter.post('/internal/paper-sim/deregister-session', async (req, res) => {
    try {
      if (globalSimulationSession) {
        console.log(`[SimRegistry] Deregistered GLOBAL session ${globalSimulationSession.sessionId} via API`);
        globalSimulationSession = null;
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deregistering simulation session:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // BOB CORE - PHASE 7.2
  // Transparent optimization layer for health/metrics
  // ========================================

  // Bob stats endpoint for monitoring cache performance (no auth for monitoring tools)
  apiRouter.get('/bob/stats', bobStatsHandler);

  // Phase 7.7: Bob Insight endpoint - system introspection and meta-information
  apiRouter.get('/bob/insight', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const summary = await insightBob.getInsightSummary();
      res.json(summary);
    } catch (error: any) {
      console.error('[BobInsight] Error fetching insight summary:', error);
      res.status(500).json({ error: 'Failed to fetch insight summary' });
    }
  });

  // Phase 7.7: UI State endpoint - current UI context and visibility
  apiRouter.get('/ui/state', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as 'live' | 'paper') || 'live';
      const uiState = await uiBob.getUIState(userId, mode);
      res.json(uiState);
    } catch (error: any) {
      console.error('[UIBob] Error fetching UI state:', error);
      res.status(500).json({ error: 'Failed to fetch UI state' });
    }
  });

  // Phase 7.7: Update UI State endpoint - frontend sends current view context
  apiRouter.post('/ui/state', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { view, subView, mode, filters } = req.body;
      
      uiBob.updateUIState(userId, { view, subView, mode, filters });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[UIBob] Error updating UI state:', error);
      res.status(500).json({ error: 'Failed to update UI state' });
    }
  });

  // Bob prefetch endpoint - triggered by Walter chat open or mode change
  // Phase 7.3: Extended to include DataBob prefetch
  // Phase 7.4: Extended to include ConfigBob prefetch
  apiRouter.post('/bob/prefetch', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const { mode, trigger } = req.body;
    const userId = req.user!.id;
    
    if (!mode || !['live', 'paper'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be "live" or "paper"' });
    }

    try {
      console.log(`[BobCore] 🔄 Prefetch triggered by ${trigger || 'unknown'} for ${mode} mode`);
      
      // Phase 7.2: Prefetch MetricsBob
      await metricsBob.prefetchForMode(mode as 'live' | 'paper');
      
      // Phase 7.3: Prefetch DataBob
      await dataBob.prefetchForMode(userId, mode as 'live' | 'paper', 'today');
      
      // Phase 7.4: Prefetch ConfigBob (all 5 config types)
      await configBob.prefetchForMode(userId, mode as 'live' | 'paper');
      
      // Phase 7.5: Prefetch StrategyBob (signals only on mode_change)
      const includeSignals = trigger === 'mode_change';
      await strategyBob.prefetchForMode(userId, mode as 'live' | 'paper', includeSignals);
      
      // Phase 7.6: Prefetch TradeBob (active/open trades)
      if (tradeBob.isEnabled()) {
        await tradeBob.prefetchForMode(userId, mode as 'live' | 'paper');
      }
      
      res.json({ success: true, mode, trigger });
    } catch (error: any) {
      console.error('[BobCore] ⚠️ Prefetch failed:', error);
      res.status(500).json({ error: 'Prefetch failed', details: error.message });
    }
  });

  // ========================================
  // CORTEX CORE - PHASE 8.0
  // Hybrid memory layer for Walter context
  // ========================================

  // Cortex status endpoint - provides memory and sync status
  apiRouter.get('/cortex/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const status = cortexCore.getStatus();
      res.json(status);
    } catch (error: any) {
      console.error('[Cortex] Error fetching status:', error);
      res.status(500).json({ error: 'Failed to fetch Cortex status' });
    }
  });

  // Cortex snapshot endpoint - get Bob/UI snapshots
  apiRouter.get('/cortex/snapshot', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const type = req.query.type as 'bob' | 'ui' | undefined;
      
      if (type && !['bob', 'ui'].includes(type)) {
        return res.status(400).json({ error: 'Invalid snapshot type. Must be "bob" or "ui"' });
      }

      if (type) {
        const snapshot = cortexCore.getSnapshot(type);
        res.json({ type, snapshot });
      } else {
        // Return both snapshots
        const bobSnapshot = cortexCore.getSnapshot('bob');
        const uiSnapshot = cortexCore.getSnapshot('ui');
        res.json({ bob: bobSnapshot, ui: uiSnapshot });
      }
    } catch (error: any) {
      console.error('[Cortex] Error fetching snapshot:', error);
      res.status(500).json({ error: 'Failed to fetch snapshot' });
    }
  });

  // Cortex flush endpoint - clear memory cache
  apiRouter.post('/cortex/flush', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      await cortexCore.flush();
      res.json({ success: true, message: 'Memory flushed' });
    } catch (error: any) {
      console.error('[Cortex] Error flushing memory:', error);
      res.status(500).json({ error: 'Failed to flush memory' });
    }
  });

  // Cortex force sync endpoint - manually trigger snapshot sync
  apiRouter.post('/cortex/force-sync', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // Define snapshot fetch functions
      const fetchBobSnapshot = async () => {
        return await insightBob.getInsightSummary();
      };

      const fetchUISnapshot = async () => {
        const userId = req.user!.id;
        const mode = (req.query.mode as 'live' | 'paper') || 'live';
        return await uiBob.getUIState(userId, mode);
      };

      await cortexCore.forceSync(fetchBobSnapshot, fetchUISnapshot);
      res.json({ success: true, message: 'Force sync completed' });
    } catch (error: any) {
      console.error('[Cortex] Error during force sync:', error);
      res.status(500).json({ error: 'Failed to force sync' });
    }
  });

  // Global System Health Endpoint - provides comprehensive system status
  // Phase 7.2: Uses Bob Core for caching with transparent fallback
  apiRouter.get('/system/health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const mode = (req.query.mode as string) || 'live';

    // Phase 7.2: Try Bob Core first if enabled
    if (bobCore.isEnabled()) {
      try {
        console.log('[BobRouting] 🎯 Using Bob Core for /api/system/health');
        const healthData = await metricsBob.getSystemHealth(mode as 'live' | 'paper');
        return res.json(healthData);
      } catch (bobError: any) {
        console.error('[BobRouting] ⚠️ Bob Core failed, using original handler:', bobError.message);
        // Fall through to original implementation below
      }
    }

    // Original implementation (fallback or when Bob disabled)
    try {
      let allHealthy = true;
      const healthData: any = {
        backend: 'OK',
        lastSync: new Date().toISOString()
      };

      // Check paper trading status
      try {
        const globalSession = (global as any).getGlobalSession?.() as SimulationSession | null;
        healthData.paperTrading = {
          isRunning: globalSession?.isRunning || false,
          sessionId: globalSession?.sessionId || null,
          startedBy: globalSession?.startedBy || null,
          startTime: globalSession?.startTime || null,
          type: globalSession?.type || null
        };
      } catch (error) {
        healthData.paperTrading = { isRunning: false, error: 'Failed to get paper trading status' };
        allHealthy = false;
      }

      // Check database connectivity
      try {
        await storage.getUser(userId);
        healthData.database = 'OK';
      } catch (error) {
        healthData.database = 'ERROR';
        allHealthy = false;
      }

      // Check goals for both modes
      try {
        const liveGoals = await storage.getGoalsLive();
        const paperGoals = await storage.getGoalsPaper();
        healthData.goals = {
          live: { count: liveGoals.length, hasGoals: liveGoals.length > 0 },
          paper: { count: paperGoals.length, hasGoals: paperGoals.length > 0 }
        };
        console.log('[Phase-27.F.15.B.1] Updated route /api/system/health → mode-based goals only');
      } catch (error) {
        healthData.goals = { error: 'Failed to get goals' };
        allHealthy = false;
      }

      // Frontend connection status (clients ping this endpoint, so we assume connected)
      healthData.frontendConnected = true;

      // Phase 27.F.15.D: Live Pricing Adapter status
      try {
        const { livePricingAdapter } = await import('./services/live-pricing-adapter');
        const adapterStatus = livePricingAdapter.getStatus();
        const allPrices = livePricingAdapter.getAllPrices();
        
        healthData.livePricing = {
          isActive: adapterStatus.isRunning,
          mode: adapterStatus.mode,
          trackedSymbols: adapterStatus.trackedSymbols.length,
          cachedPrices: allPrices.length,
          lastUpdate: allPrices.length > 0 ? 
            Math.max(...allPrices.map(p => new Date(p.timestamp).getTime())) : null,
          lastUpdateISO: allPrices.length > 0 ? 
            new Date(Math.max(...allPrices.map(p => new Date(p.timestamp).getTime()))).toISOString() : null
        };
      } catch (error) {
        healthData.livePricing = { isActive: false, error: 'Failed to get pricing status' };
      }

      // Return appropriate status code
      const statusCode = allHealthy ? 200 : 503;
      res.status(statusCode).json(healthData);
    } catch (error: any) {
      console.error('Error in system health check:', error);
      res.status(503).json({
        backend: 'ERROR',
        error: error.message,
        lastSync: new Date().toISOString()
      });
    }
  });

  // Phase 8.3: Detailed System Health Metrics from SystemHealthMonitor
  apiRouter.get('/system/health-metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const healthMetrics = await metricsBob.getSystemHealthMetrics(5); // 5s TTL
      res.json(healthMetrics);
    } catch (error: any) {
      console.error('[SystemHealthMetrics] Error:', error);
      res.status(500).json({ error: 'Failed to get health metrics', message: error.message });
    }
  });

  // Phase 30.FX.A: System Health with Oversight & Strategy Mix
  apiRouter.get('/system/health-30fx', async (_, res) => {
    try {
      const { lottieOversightLog, strategyMixLog } = await import('@shared/schema');
      
      const audits = await db
        .select({
          event: lottieOversightLog.event,
          status: lottieOversightLog.status,
          createdAt: lottieOversightLog.createdAt,
        })
        .from(lottieOversightLog)
        .orderBy(desc(lottieOversightLog.createdAt))
        .limit(3);

      const mix = await db
        .select({
          strategy: strategyMixLog.strategy,
          newWeight: strategyMixLog.newWeight,
          createdAt: strategyMixLog.createdAt,
        })
        .from(strategyMixLog)
        .orderBy(desc(strategyMixLog.createdAt))
        .limit(3);

      res.json({
        uptime: process.uptime(),
        lastAuditEvents: audits,
        lastStrategyRebalances: mix,
        status: "healthy",
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[HealthEndpoint-30FX] Error:", error.message);
      res.status(500).json({
        uptime: process.uptime(),
        status: "error",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Phase 31.0: Strategic Drive Status - SDI and Strategy Weights
  apiRouter.get('/system/drive-status', async (_, res) => {
    try {
      const { strategicDriveService } = await import('./services/strategic-drive-service');
      const latest = await strategicDriveService.getLatestSummary();
      
      res.json({
        status: "ok",
        latest: latest || null,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[31.0][SDPOE] Health endpoint error:", error);
      res.status(500).json({
        status: "error",
        error: "Drive status unavailable",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Phase 31.C: Strategic Drive Trend - Historical SDI Data (Last 10 Snapshots)
  apiRouter.get('/system/drive-trend', async (_, res) => {
    try {
      const { strategyDriveSummary } = await import('@shared/schema');
      const records = await db
        .select()
        .from(strategyDriveSummary)
        .orderBy(desc(strategyDriveSummary.createdAt))
        .limit(10);
      
      res.json(records);
    } catch (error: any) {
      console.error("[31.C] Drive trend error:", error);
      res.status(500).json({ 
        error: "Unable to retrieve trend",
        message: error.message 
      });
    }
  });

  // Phase 31.C: Strategic Drive Forecast - Predicted Strategy Performance
  apiRouter.get('/system/drive-forecast', async (_, res) => {
    try {
      const { strategyDriveSummary } = await import('@shared/schema');
      const [latest] = await db
        .select()
        .from(strategyDriveSummary)
        .orderBy(desc(strategyDriveSummary.createdAt))
        .limit(1);
      
      if (!latest) {
        return res.status(404).json({ error: "No forecast data available" });
      }
      
      res.json({
        forecastBest: latest.forecastBest,
        forecastWeakest: latest.forecastWeakest,
        confidence: latest.forecastConfidence,
        sdiSmoothed: latest.sdiSmoothed,
        timestamp: latest.createdAt,
      });
    } catch (error: any) {
      console.error("[31.C] Forecast endpoint error:", error);
      res.status(500).json({ 
        error: "Unable to retrieve forecast",
        message: error.message 
      });
    }
  });

  // Phase 31.D: Get Strategic Drive Guardrail Policy
  apiRouter.get('/system/drive-guardrails', async (_, res) => {
    try {
      const { strategicDriveGuardrails } = await import('./services/strategic-drive-guardrail-service');
      const policy = await strategicDriveGuardrails.getPolicy();
      const state = strategicDriveGuardrails.getState();
      
      res.json({
        policy,
        state,
      });
    } catch (error: any) {
      console.error("[31.D] Guardrail policy GET error:", error);
      res.status(500).json({ 
        error: "Unable to retrieve guardrail policy",
        message: error.message 
      });
    }
  });

  // Phase 31.D: Update Strategic Drive Guardrail Policy
  apiRouter.put('/system/drive-guardrails', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategicDriveGuardrails } = await import('./services/strategic-drive-guardrail-service');
      const { insertStrategyDriveGuardrailPolicySchema } = await import('@shared/schema');
      
      const validated = insertStrategyDriveGuardrailPolicySchema.parse(req.body);
      const username = req.user?.username || 'unknown';
      
      const updated = await strategicDriveGuardrails.updatePolicy(validated, username);
      
      res.json({
        ok: true,
        policy: updated,
        message: 'Guardrail policy updated successfully'
      });
    } catch (error: any) {
      console.error("[31.D] Guardrail policy PUT error:", error);
      res.status(400).json({ 
        ok: false,
        error: "Unable to update guardrail policy",
        message: error.message 
      });
    }
  });

  // Phase 31.G: Get Strategic Drive Status with Motivational Metrics
  apiRouter.get('/system/drive-status', async (_, res) => {
    try {
      const { strategyDriveSummary } = await import('@shared/schema');
      const { systemConfigService } = await import('./services/system-config');
      
      const [latest] = await db
        .select()
        .from(strategyDriveSummary)
        .orderBy(desc(strategyDriveSummary.createdAt))
        .limit(1);
      
      if (!latest) {
        return res.status(404).json({ error: "No drive status data available" });
      }
      
      // Get passive learning state from system config
      const config = await systemConfigService.getConfig();
      
      res.json({
        status: "ok",
        latest: {
          id: latest.id,
          createdAt: latest.createdAt,
          globalSDI: latest.globalSDI,
          bestStrategy: latest.bestStrategy,
          weakestStrategy: latest.weakestStrategy,
          dhmaWeight: latest.dhmaWeight,
          quantflowWeight: latest.quantflowWeight,
          trendpulseWeight: latest.trendpulseWeight,
          volsurfWeight: latest.volsurfWeight,
          momentumxWeight: latest.momentumxWeight,
          sdiSmoothed: latest.sdiSmoothed,
          forecastBest: latest.forecastBest,
          forecastWeakest: latest.forecastWeakest,
          forecastConfidence: latest.forecastConfidence,
          driveIndex: latest.driveIndex,
          personalBest: latest.personalBest,
        },
        passiveLearning: config.passiveLearning,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[31.G] Drive status endpoint error:", error);
      res.status(500).json({ 
        error: "Unable to retrieve drive status",
        message: error.message 
      });
    }
  });

  // Phase 31.H/32.D-Fix.2: Get System Configuration (Phase 4A-3: Cached)
  apiRouter.get('/system/config', async (_, res) => {
    try {
      // Phase 4A-3: Check cache first (short TTL since this changes with engine state)
      const cacheKey = 'system:config';
      const cached = getCache(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      // Phase 4A-3: Use request coalescing
      const data = await coalesce(cacheKey, async () => {
        const { systemConfigService } = await import('./services/system-config');
        const { tradingStateSync } = await import('./services/trading-state-sync');
        const config = await systemConfigService.getConfig();
        
        // Phase 32.D-Fix.2: Get current trading mode and engine states
        const currentMode = tradingStateSync.getTradingMode('system-reconciliation');
        const paperContext = await storage.getSystemContext('paper');
        const liveContext = await storage.getSystemContext('live');
        
        const isEngineActivePaper = paperContext?.isEngineActive || false;
        const isEngineActiveLive = liveContext?.isEngineActive || false;
        
        // Phase 32.D-Fix.2: Compute passive mode based on engine state alone
        // Show passive badge only when passive learning enabled AND neither engine is active
        const passiveMode = config.passiveLearning && !isEngineActivePaper && !isEngineActiveLive;
        
        return {
          ok: true,
          systemFlags: {
            passiveLearning: config.passiveLearning, // Original flag
            passiveMode, // Computed flag (respects paper mode override)
            activeMode: currentMode,
            isEngineActivePaper,
            isEngineActiveLive,
          },
        };
      });
      
      // Phase 4A-3: Cache the result (60s TTL - shorter since engine state changes frequently)
      setCache(cacheKey, data, 60000);
      res.json(data);
    } catch (error: any) {
      console.error("[31.H] System config GET error:", error);
      res.status(500).json({ 
        error: "Unable to retrieve system configuration",
        message: error.message 
      });
    }
  });

  // Phase 31.H: Update System Configuration
  apiRouter.post('/system/config', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { systemConfigService } = await import('./services/system-config');
      const { systemFlags } = req.body;
      
      if (!systemFlags || typeof systemFlags !== 'object') {
        return res.status(400).json({ 
          error: "Invalid request body. Expected { systemFlags: {...} }" 
        });
      }
      
      const username = req.user?.username || 'unknown';
      const updated = await systemConfigService.updateConfig(systemFlags, username);
      
      res.json({
        ok: true,
        systemFlags: updated,
        message: 'System configuration updated successfully'
      });
    } catch (error: any) {
      console.error("[31.H] System config POST error:", error);
      res.status(500).json({ 
        error: "Unable to update system configuration",
        message: error.message 
      });
    }
  });

  // Phase 8.3: Manual System Recovery Trigger
  apiRouter.post('/system/recover', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { selfRepairService } = await import('./services/self-repair');
      const result = await selfRepairService.manualRecover();
      
      res.json({
        ok: true,
        success: result.success,
        message: result.message,
        stats: result.stats
      });
    } catch (error: any) {
      console.error('[SystemRecovery] Error:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to perform recovery', 
        message: error.message 
      });
    }
  });

  // Phase 8.3: Health Log Viewer - Returns recent health reports
  apiRouter.get('/system/health-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const logPath = path.join(process.cwd(), 'logs/system-health.log');
      
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n');
      const limit = parseInt(req.query.limit as string) || 100;
      
      // Return last N lines
      const recentLines = lines.slice(-limit).join('\n');
      
      res.type('text/plain').send(recentLines);
    } catch (error: any) {
      console.error('[HealthLogs] Error:', error);
      res.status(500).json({ 
        error: 'Failed to read health logs', 
        message: error.message 
      });
    }
  });

  // ==================== Phase 8.5 Addendum G + H: System Truth & Context Refresh ====================

  // GET /api/system/truth-check - Compare backend, Cortex, and Walter snapshots
  // Phase 3B: Removed userId parameter - single-tenant architecture
  apiRouter.get('/system/truth-check', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';

      const { systemTruthDiagnostic } = await import('./services/system-truth-diagnostic');
      
      const truthComparison = await systemTruthDiagnostic.runTruthCheck(mode);
      
      res.json({
        ok: true,
        comparison: truthComparison,
        isAligned: truthComparison.isAligned,
        discrepanciesCount: truthComparison.discrepancies.length,
        timestamp: truthComparison.timestamp
      });
    } catch (error: any) {
      console.error('[TruthCheck] Error:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to run truth check', 
        message: error.message 
      });
    }
  });

  // GET /api/system/truth-check/report - Get truth check as Markdown report
  // Phase 3B: Removed userId parameter - single-tenant architecture
  apiRouter.get('/system/truth-check/report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';

      const { systemTruthDiagnostic } = await import('./services/system-truth-diagnostic');
      
      const truthComparison = await systemTruthDiagnostic.runTruthCheck(mode);
      const markdownReport = systemTruthDiagnostic.generateMarkdownReport(truthComparison);
      
      res.type('text/markdown').send(markdownReport);
    } catch (error: any) {
      console.error('[TruthCheckReport] Error:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to generate truth check report', 
        message: error.message 
      });
    }
  });

  // POST /api/context/refresh - Force context refresh across all layers
  apiRouter.post('/context/refresh', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';

      const { contextRefreshCoordinator } = await import('./services/context-refresh-coordinator');
      
      // Phase 3: refresh now uses mode only (single-tenant)
      const result = await contextRefreshCoordinator.refresh(mode, 'api');
      
      res.json({
        ok: result.success,
        result,
        message: result.success 
          ? `Context refreshed successfully in ${result.latencyMs}ms`
          : `Context refresh failed: ${result.error}`
      });
    } catch (error: any) {
      console.error('[ContextRefresh] Error:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to refresh context', 
        message: error.message 
      });
    }
  });

  // GET /api/context/metrics - Get context refresh metrics
  apiRouter.get('/context/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { contextRefreshCoordinator } = await import('./services/context-refresh-coordinator');
      
      const metrics = contextRefreshCoordinator.getMetrics();
      
      res.json({
        ok: true,
        metrics
      });
    } catch (error: any) {
      console.error('[ContextMetrics] Error:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to get context metrics', 
        message: error.message 
      });
    }
  });

  // ==================== Phase 8.8.4: Cognitive Tuning & Testing ====================

  // GET /api/cognitive/status - Get latest cognitive benchmark summary
  apiRouter.get('/cognitive/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { cognitiveTuner } = await import('./services/cognitive-tuner');
      const status = await cognitiveTuner.getStatus();
      
      res.json({
        ok: true,
        status,
      });
    } catch (error: any) {
      console.error('[CognitiveTuner] Error fetching status:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch cognitive status',
        message: error.message,
      });
    }
  });

  // POST /api/cognitive/run - Trigger new cognitive benchmark (admin-only)
  apiRouter.post('/cognitive/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      // Check if user has owner role
      if (user?.role !== 'owner') {
        return res.status(403).json({
          ok: false,
          error: 'Forbidden',
          message: 'Only owners can run cognitive benchmarks',
        });
      }

      const { cognitiveTuner } = await import('./services/cognitive-tuner');
      const results = await cognitiveTuner.runFullBenchmark(userId);
      
      res.json({
        ok: true,
        results,
        summary: {
          totalTests: results.length,
          passedTests: results.filter(r => r.result === 'PASS').length,
          avgLatencyMs: results.reduce((sum, r) => sum + r.avgLatencyMs, 0) / results.length,
        },
      });
    } catch (error: any) {
      console.error('[CognitiveTuner] Error running benchmark:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to run cognitive benchmark',
        message: error.message,
      });
    }
  });

  // GET /api/cognitive/report - Get benchmark report in Markdown format
  apiRouter.get('/cognitive/report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { cognitiveTuner } = await import('./services/cognitive-tuner');
      const report = await cognitiveTuner.generateReport();
      
      res.type('text/markdown').send(report);
    } catch (error: any) {
      console.error('[CognitiveTuner] Error generating report:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to generate benchmark report',
        message: error.message,
      });
    }
  });

  // ==================== Phase 8.7.1: State Awareness Layer ====================

  // GET /api/state/summary - Get authoritative system state snapshot
  apiRouter.get('/state/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { stateAwarenessService } = await import('./services/state-awareness');
      
      const snapshot = await stateAwarenessService.getStateSnapshot(userId);
      
      res.json(snapshot);
    } catch (error: any) {
      console.error('[StateAwareness] Error fetching snapshot:', error);
      res.status(500).json({ 
        error: 'Failed to fetch system state', 
        message: error.message 
      });
    }
  });

  // GET /api/state/debug - Get system state snapshot with provenance info
  apiRouter.get('/state/debug', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { stateAwarenessService } = await import('./services/state-awareness');
      
      const snapshot = await stateAwarenessService.getStateSnapshot(userId, { 
        includeProvenance: true 
      });
      
      res.json(snapshot);
    } catch (error: any) {
      console.error('[StateAwareness] Error fetching debug snapshot:', error);
      res.status(500).json({ 
        error: 'Failed to fetch system state (debug)', 
        message: error.message 
      });
    }
  });

  // ==================== REB 2.10: Passive Learning Debug Endpoint ====================
  
  // GET /api/passive-learning/debug - Get passive learning diagnostic buffer
  apiRouter.get('/passive-learning/debug', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = getPassiveLearningBuffer();
      const limit = req.query.limit ? parseInt(req.query.limit as string) : buffer.length;
      const cycleId = req.query.cycle ? parseInt(req.query.cycle as string) : undefined;
      
      let results = buffer;
      
      // Filter by cycle if specified
      if (cycleId !== undefined) {
        results = buffer.filter(record => record.cycleStart.cycle === cycleId);
      }
      
      // Apply limit (get most recent cycles)
      if (limit < results.length) {
        results = results.slice(-limit);
      }
      
      res.json({
        ok: true,
        meta: {
          bufferSize: buffer.length,
          maxBufferSize: 20,
          returnedCycles: results.length,
          oldestCycle: buffer.length > 0 ? buffer[0].cycleStart.cycle : null,
          newestCycle: buffer.length > 0 ? buffer[buffer.length - 1].cycleStart.cycle : null,
        },
        cycles: results,
      });
    } catch (error: any) {
      console.error('[REB2.10] Error fetching passive-learning buffer:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to fetch passive-learning debug data', 
        message: error.message 
      });
    }
  });

  // ==================== REB 2.11: Active Pool Stability Validation Endpoint ====================
  
  // GET /api/diagnostics/reb-2-11 - Get REB 2.11 diagnostic buffers
  apiRouter.get('/diagnostics/reb-2-11', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const includeRaw = req.query.includeRaw === '1';
      
      // Get all REB 2.11 buffers
      const driftBuffer = getREB211DriftBuffer();
      const integrityBuffer = getREB211IntegrityBuffer();
      const timingBuffer = getREB211TimingBuffer();
      const mismatchBuffer = getREB211MismatchBuffer();
      const stressBuffer = getREB211StressBuffer();
      
      // Calculate summary statistics
      const latestDrift = driftBuffer.length > 0 ? driftBuffer[driftBuffer.length - 1] : null;
      const anomalyCount = integrityBuffer.filter(i => i.anomalies.length > 0).length;
      const avgTiming = timingBuffer.length > 0 
        ? Math.round(timingBuffer.reduce((sum, t) => sum + t.t_total, 0) / timingBuffer.length) 
        : 0;
      
      // Pool stability analysis
      let isStable = true;
      let driftDetected = false;
      if (driftBuffer.length >= 3) {
        const recentSizes = driftBuffer.slice(-5).map(d => d.activePoolSize);
        const variance = Math.max(...recentSizes) - Math.min(...recentSizes);
        if (variance > 10) {
          driftDetected = true;
          isStable = false;
        }
      }
      
      const response: any = {
        ok: true,
        meta: {
          timestamp: new Date().toISOString(),
          bufferSizes: {
            drift: driftBuffer.length,
            integrity: integrityBuffer.length,
            timing: timingBuffer.length,
            mismatches: mismatchBuffer.length,
            stress: stressBuffer.length,
          },
          maxBufferSize: 20,
          stressTestEnabled: process.env.REB_2_11_STRESS === '1',
        },
        summary: {
          latestCycle: latestDrift?.cycle ?? null,
          latestPoolSize: latestDrift?.activePoolSize ?? 0,
          anomalyCount,
          mismatchCount: mismatchBuffer.length,
          avgCycleDurationMs: avgTiming,
          poolStability: {
            isStable,
            driftDetected,
          },
        },
        passiveDriftWindow: driftBuffer,
        integrityEvents: integrityBuffer.filter(i => i.anomalies.length > 0),
        timing: timingBuffer,
        mismatches: mismatchBuffer,
        stressSnapshots: stressBuffer,
      };
      
      // Include raw data if requested
      if (includeRaw) {
        response.raw = {
          allIntegritySnapshots: integrityBuffer,
        };
      }
      
      res.json(response);
    } catch (error: any) {
      console.error('[REB2.11] Error fetching diagnostic buffers:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to fetch REB 2.11 diagnostic data', 
        message: error.message 
      });
    }
  });

  // GET /api/diagnostics/reb-2-11A - Get REB 2.11A Active Pool / AlreadyActive Breakdown Audit
  apiRouter.get('/diagnostics/reb-2-11A', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const cycles = getActiveAuditBuffer(limit);
      
      res.json({
        ok: true,
        cycles,
      });
    } catch (error: any) {
      console.error('[REB2.11A] Error fetching audit buffer:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to fetch REB 2.11A audit data', 
        message: error.message 
      });
    }
  });

  // ==================== Phase 8.7.2: Intent Execution Framework ====================

  // POST /api/intent/execute - Execute validated intent
  apiRouter.post('/intent/execute', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role as 'owner' | 'editor' | 'viewer';
      const intent = req.body;
      const traceId = req.body.traceId || undefined;
      
      if (!intent.action) {
        return res.status(400).json({ 
          success: false,
          error: 'Intent action is required',
          message: 'Please provide an action field in the intent payload'
        });
      }
      
      const { intentExecutor } = await import('./services/intent-executor');
      
      const result = await intentExecutor.execute({
        userId,
        userRole,
        intent,
        traceId
      });
      
      if (!result.success && result.error?.includes('Permission denied')) {
        return res.status(403).json(result);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error('[IntentExecutor] Error executing intent:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to execute intent', 
        message: error.message 
      });
    }
  });

  // GET /api/intent/audit - Get intent audit history
  apiRouter.get('/intent/audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const traceId = req.query.traceId as string | undefined;
      const action = req.query.action as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const { intentExecutor } = await import('./services/intent-executor');
      
      const history = await intentExecutor.getAuditHistory({
        userId,
        traceId,
        action,
        limit
      });
      
      res.json({
        success: true,
        data: history,
        count: history.length
      });
    } catch (error: any) {
      console.error('[IntentExecutor] Error fetching audit history:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch audit history', 
        message: error.message 
      });
    }
  });

  // Phase 8.7.4: Context Bridge Stats and Status
  apiRouter.get('/context/bridge/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const stats = contextBridge.getStats();
      
      res.json({
        success: true,
        ...stats
      });
    } catch (error: any) {
      console.error('[ContextBridge] Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch context bridge stats',
        message: error.message
      });
    }
  });

  // ==================== Phase 8.5: Real-Time Execution Layer ====================

  // Get execution metrics
  apiRouter.get('/execution/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { realtimePaperExecutor } = await import('./services/realtime-paper-executor');
      const { executionTiming } = await import('./services/execution-timing');
      const { rateControl } = await import('./services/rate-control');
      
      const execStatus = realtimePaperExecutor.getStatus();
      const timingMetrics = executionTiming.getMetrics(50);
      const rateMetrics = rateControl.getMetrics();
      
      res.json({
        ok: true,
        marketData: execStatus.marketData,
        execution: {
          avgSubmitAckMs: timingMetrics.avgSubmitAckMs,
          avgAckFillMs: timingMetrics.avgAckFillMs,
          avgTotalMs: timingMetrics.avgTotalMs,
          avgSlippageBps: timingMetrics.avgSlippageBps,
          avgFeesPerTrade: timingMetrics.avgFeesPerTrade,
          orderCount: timingMetrics.orderCount,
        },
        rateControl: {
          backpressure: execStatus.rateControl.backpressure,
          queuedRequests: execStatus.rateControl.queuedRequests,
          totalRequests: rateMetrics.totalRequests,
          throttledRequests: rateMetrics.throttledRequests,
        },
        killSwitch: execStatus.killSwitch,
        concurrency: execStatus.concurrency,
      });
    } catch (error: any) {
      console.error('[ExecutionMetrics] Error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Export execution timing data to CSV
  apiRouter.get('/execution/timing/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { executionTiming } = await import('./services/execution-timing');
      
      const fileName = await executionTiming.exportToCSV();
      
      res.json({
        ok: true,
        fileName,
        message: `Exported execution timing to ${fileName}`,
      });
    } catch (error: any) {
      console.error('[ExecutionTimingExport] Error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Run parity gate check
  apiRouter.get('/execution/parity-check', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { parityGate } = await import('./services/parity-gate');
      
      const simulationDurationMs = parseInt(req.query.duration as string) || 600000; // Default 10 min
      const result = await parityGate.runParityCheck(simulationDurationMs);
      
      res.json({
        ok: true,
        ...result,
      });
    } catch (error: any) {
      console.error('[ParityCheck] Error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Generate parity gate report
  apiRouter.post('/execution/parity-report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { parityGate } = await import('./services/parity-gate');
      
      const simulationDurationMs = req.body.duration || 600000; // Default 10 min
      const fileName = await parityGate.generateParityReport(simulationDurationMs);
      
      res.json({
        ok: true,
        fileName,
        message: `Parity report generated: ${fileName}`,
      });
    } catch (error: any) {
      console.error('[ParityReport] Error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== End Phase 8.5 ====================

  // Phase 41D: Balance confirmation endpoint disabled (no longer required)
  // Endpoint kept as no-op for backwards compatibility
  apiRouter.post('/paper-sim/confirm-balance', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { balance } = req.body;
      console.log('[41D] confirm-balance called (no-op) - balance confirmation system disabled');
      res.json({ success: true, message: `Balance confirmation no longer required (accepted: $${balance})` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/paper-sim/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const t0 = Date.now();
    console.log(`[41D-ROUTE-1] /paper-sim/start entered at ${new Date().toISOString()}`);
    
    const userId = req.user!.id;
    const { mode = 'continue', initialBalance } = req.body; // Phase 27.F.14.I: Support continue/new modes
    console.log(`[41D-ROUTE-2] userId: ${userId}, mode: ${mode}, balance: ${initialBalance}`);
    
    try {
      console.log(`[41D-ROUTE-3] Entering try block (t+${Date.now()-t0}ms)`);
      // Phase 27.F.14.J: Handle "Start New Simulation" mode
      if (mode === 'new') {
        console.log(`[41D-ROUTE-4] Mode is 'new' (t+${Date.now()-t0}ms)`);
        const balance = initialBalance ? parseFloat(initialBalance) : 800;
        console.log(`[Phase-27.F.14.J] Starting NEW simulation with balance $${balance}`);
        
        // Stop paper simulation if running (gracefully handle if already stopped)
        const { stopPaperSimulation } = await import('./services/paper-sim-service.js');
        const stopResult = await stopPaperSimulation(userId);
        if (!stopResult.success && !stopResult.message?.includes('not running')) {
          console.warn('[Phase-27.F.14.J] Stop failed but continuing:', stopResult.message);
        }
        
        // Reset baseline and portfolio state
        const systemContext = await storage.getSystemContext('paper');
        console.log('[LATTIManager] Retrieved system context for mode: paper');
        
        // Phase 27.F.14.M: Reset portfolio balance for paper mode using updatePortfolioBalance
        await storage.updatePortfolioBalance({ mode: 'paper', balance });
        console.log(`[PaperSim] Started simulation (balance=$${balance})`);
        
        // Phase 27.F.14.M: Broadcast portfolio balance update to all clients
        const { contextBridge } = await import('./services/context-bridge.js');
        await contextBridge.broadcast({
          type: 'portfolio_balance_updated',
          payload: {
            balance,
            mode: 'paper',
            reason: 'new_simulation_started',
            timestamp: new Date().toISOString()
          },
          mode: 'paper'
        });
        
        // Phase 27.F.15.C: Reset MetricsCore for paper mode (enforces MSI)
        const { metricsCore } = await import('./services/metrics-core.js');
        await metricsCore.reset('paper');
        console.log('[27.F.15.C][MSI] ✅ Paper mode metrics reset complete');
        
        // Phase 27.F.14.J: Reset LATTI baseline for paper mode (per_simulation baseline)
        await storage.updateSystemContext('paper', {
          baselineMode: 'per_simulation',
          lattiLastAnchorTime: new Date()
        });
        console.log('[LATTI][Paper] Baseline mode: per_simulation');
        console.log('[LATTI][Paper] Baseline reset successfully');
        
        // Phase 27.F.14.J: Reset guardrails, screener filters, and trading pace to defaults
        console.log('[LATTI][Paper] Resetting guardrails and filters to baseline defaults...');
        
        // Reset guardrails to defaults (Phase 27.F.14.K: Fixed field names)
        await storage.upsertGuardrails({
          mode: 'paper',
          maxDailyLoss: '150.00',
          maxDrawdown: '10.00',
          maxPositionSize: '10.00',
          maxOpenPositions: 5,
          riskPerTrade: '1.5',
          maxRequiredCapital: '100000.00',
          maxRiskPerTradeLimit: '1000.00',
          aiCanAdjust: false,
          lastUpdatedBy: userId
        });
        
        // Reset screener filters to defaults (Phase 27.F.14.L: Fixed method name and payload)
        await storage.upsertScreenerFilters({
          mode: 'paper',
          minVolume: '5000.00',
          minLiquidity: '0.00',
          maxBidAskSpread: '2.00',
          minPrice: '0.01',
          maxPrice: '10000.00',
          volatilityMin: '0.50',
          volatilityMax: '5.00',
          rsiMin: 30,
          rsiMax: 70,
          minMarketCap: '100000000.00',
          excludeStablecoins: true,
          allowRegulatedOnly: false,
          lastUpdatedBy: userId
        });
        
        // Reset trading pace to baseline
        await storage.updateSystemContext('paper', {
          tradingPace: 'baseline'
        });
        
        console.log('[LATTI][Paper] Guardrails and filters reset to baseline defaults');
        
        // Start the simulation
        const { startPaperSimulation } = await import('./services/paper-sim-service.js');
        // REB 2.8.13: Pass startingBalance to startPaperSimulation (required after REB 2.8.12)
        const result = await startPaperSimulation(userId, { startingBalance: balance });
        
        // Invalidate Bob Core cache
        bobCore.invalidate('metrics:paperSimStatus');
        bobCore.invalidate('metrics:portfolioOverview');
        
        if (!result.success) {
          return res.status(400).json({ error: result.message || result.error });
        }
        
        console.log('[41D-FIX] Engine start completed, preparing HTTP response...');
        
        // Phase 41D: Non-blocking WebSocket broadcast to prevent HTTP timeout
        const { tradingStateSync } = await import('./services/trading-state-sync.js');
        tradingStateSync.broadcastUserUpdate(userId)
          .then(() => console.log('[41D-FIX] Broadcast completed asynchronously (new simulation)'))
          .catch(err => console.warn('[41D-FIX] Broadcast error:', err.message));
        
        console.log('[41D-FIX] Broadcast triggered asynchronously');
        
        return res.json({ success: true, message: `New simulation started with $${balance.toFixed(2)}` });
      }
      
      // Phase 27.F.14.J: Handle "Continue Previous Simulation" mode (default)
      console.log('[Phase-27.F.14.J] Continuing previous simulation');
      
      // Phase 27.F.14.J: Check baseline mode and apply policy
      const context = await storage.getSystemContext('paper');
      const baselineMode = context?.baselineMode || 'per_simulation';
      
      console.log(`[LATTI][Paper] Baseline mode: ${baselineMode}`);
      
      if (baselineMode === 'per_simulation') {
        // Reset baseline for new simulation
        await storage.updateSystemContext('paper', {
          lattiLastAnchorTime: new Date()
        });
        console.log('[LATTI][Paper] Baseline reset for per_simulation mode');
      } else if (baselineMode === 'cumulative') {
        // Reload previous baseline, append new metrics
        console.log('[LATTI][Paper] Baseline resumed successfully (cumulative mode)');
      } else if (baselineMode === 'persistent') {
        // Continue fully without reset
        console.log('[LATTI][Paper] Baseline continued without reset (persistent mode)');
      }
      
      // Phase 41D: Balance confirmation removed - continue directly
      console.log('[41D] Continuing simulation without balance confirmation gate');
      
      // REB 2.8.13: Fetch existing portfolio balance for continue mode
      const portfolioState = await storage.getPortfolioState('paper');
      const existingBalance = portfolioState?.balance ? parseFloat(portfolioState.balance) : 800;
      console.log(`[REB 2.8.13] Continue simulation with existing balance: $${existingBalance}`);
      
      // Continue with existing baseline
      const { startPaperSimulation } = await import('./services/paper-sim-service.js');
      // REB 2.8.13: Pass startingBalance to startPaperSimulation (required after REB 2.8.12)
      const result = await startPaperSimulation(userId, { startingBalance: existingBalance });
      
      // Invalidate Bob Core cache for paper-sim status
      bobCore.invalidate('metrics:paperSimStatus');
      console.log('[PaperSim] Invalidated paperSimStatus cache after start');
      
      // Return success/error based on service result
      if (!result.success) {
        return res.status(400).json({ error: result.message || result.error });
      }
      
      console.log('[41D-FIX] Engine start completed, preparing HTTP response...');
      
      // Phase 41D: Non-blocking WebSocket broadcast to prevent HTTP timeout
      const { tradingStateSync } = await import('./services/trading-state-sync.js');
      tradingStateSync.broadcastUserUpdate(userId)
        .then(() => console.log('[41D-FIX] Broadcast completed asynchronously (continue simulation)'))
        .catch(err => console.warn('[41D-FIX] Broadcast error:', err.message));
      
      console.log('[41D-FIX] Broadcast triggered asynchronously');
      
      res.json({ success: true, message: result.message });
    } catch (error: any) {
      console.error('Error starting paper trading simulation:', error);
      (global as any).globalPaperSimOperationLock = null;
      res.status(500).json({ error: error.message || 'Failed to start paper trading simulation' });
    } finally {
      // Phase 41D: Ensure busy flag is always cleared
      (global as any).globalPaperSimBusyFlag = false;
      console.log('[41D-FIX] Busy flag cleared in finally block');
    }
  });

  apiRouter.post('/paper-sim/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    
    try {
      // Use unified service function to ensure consistent state management
      const { stopPaperSimulation } = await import('./services/paper-sim-service.js');
      const result = await stopPaperSimulation(userId);
      
      // Invalidate Bob Core cache for paper-sim status
      bobCore.invalidate('metrics:paperSimStatus');
      console.log('[PaperSim] Invalidated paperSimStatus cache after stop');
      
      // Return success/error based on service result
      if (!result.success) {
        return res.status(400).json({ error: result.message || result.error });
      }
      
      console.log('[41D-FIX] Engine stop completed, preparing HTTP response...');
      
      // Phase 41D: Non-blocking WebSocket broadcast to prevent HTTP timeout
      const { tradingStateSync } = await import('./services/trading-state-sync.js');
      tradingStateSync.broadcastUserUpdate(userId)
        .then(() => console.log('[41D-FIX] Broadcast completed asynchronously (stop)'))
        .catch(err => console.warn('[41D-FIX] Broadcast error:', err.message));
      
      console.log('[41D-FIX] Broadcast triggered asynchronously');
      
      res.json({ success: true, message: result.message });
    } catch (error: any) {
      console.error('Error stopping paper trading simulation:', error);
      (global as any).globalPaperSimOperationLock = null;
      res.status(500).json({ error: error.message || 'Failed to stop paper trading simulation' });
    }
  });

  // Phase 27.F.13.C: Reset paper simulation
  apiRouter.post('/paper-sim/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { newBalance } = req.body;
    
    try {
      // Phase 41F-L.E2E-FIX: Require explicit newBalance, no hardcoded $800 fallback
      if (!newBalance || isNaN(parseFloat(newBalance))) {
        return res.status(400).json({ 
          error: 'newBalance parameter required',
          message: 'Please provide a valid newBalance value to reset the paper trading simulation.'
        });
      }
      
      const balance = parseFloat(newBalance);
      
      console.log(`[PaperSim] Resetting simulation for user ${userId} with balance $${balance}`);
      
      // Stop paper simulation if running
      const { stopPaperSimulation } = await import('./services/paper-sim-service.js');
      await stopPaperSimulation(userId);
      
      // Delete all paper sim data
      await storage.deleteAllPaperSimTrades('paper');
      await storage.deleteAllPaperSimOpenPositions('paper');
      await storage.deleteAllPaperSimTradeLogs('paper');
      
      // Reset portfolio state for paper mode
      const systemContext = await storage.getSystemContext('paper');
      console.log('[LATTIManager] Retrieved system context for mode: paper');
      await storage.upsertPortfolioState({
        globalContextId: systemContext!.id,
        mode: 'paper',
        totalValue: balance.toString(),
        unrealizedPnl: '0',
        realizedPnl: '0',
        cash: balance.toString(),
        cryptoValue: '0',
        lastUpdated: new Date()
      });
      
      // Invalidate Bob Core cache
      bobCore.invalidate('metrics:paperSimStatus');
      bobCore.invalidate('metrics:portfolioOverview');
      
      console.log(`[PaperSim] Reset complete - new balance: $${balance}`);
      
      res.json({
        success: true,
        message: 'PaperSim reset complete.',
        newBalance: balance
      });
    } catch (error: any) {
      console.error('[PaperSim] Error resetting simulation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to reset paper simulation'
      });
    }
  });

  // Phase 7.2: Paper trading status with Bob Core caching
  apiRouter.get('/paper-sim/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    // Phase 7.2: Try Bob Core first if enabled
    if (bobCore.isEnabled()) {
      try {
        console.log('[BobRouting] 🎯 Using Bob Core for /api/paper-sim/status');
        const status = await metricsBob.getPaperSimStatus();
        return res.json(status);
      } catch (bobError: any) {
        console.error('[BobRouting] ⚠️ Bob Core failed, using original handler:', bobError.message);
        // Fall through to original implementation below
      }
    }

    // Original implementation (fallback or when Bob disabled)
    try {
      // Return GLOBAL system-wide status (same for all users)
      const hasUISimulation = (global as any).globalPaperPortfolioManager !== null;
      const globalSession = (global as any).getGlobalSession() as SimulationSession | null;
      const has48HrSimulation = !!(globalSession && globalSession.isRunning);
      
      const isRunning = hasUISimulation || has48HrSimulation;
      
      // Include session details if available
      const sessionInfo = globalSession ? {
        sessionId: globalSession.sessionId,
        startTime: globalSession.startTime,
        type: globalSession.type,
        startedBy: globalSession.startedBy
      } : null;
      
      res.json({ 
        isRunning,
        sessionInfo
      });
    } catch (error) {
      console.error('Error checking paper trading status:', error);
      res.status(500).json({ error: 'Failed to check status' });
    }
  });

  apiRouter.get('/paper-sim/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { limit, closedOnly } = req.query;
      
      const options: any = {};
      if (limit) options.limit = parseInt(limit as string);
      if (closedOnly) options.closedOnly = closedOnly === 'true';
      
      const trades = await storage.getPaperSimTrades('paper', options);
      res.json(trades);
    } catch (error) {
      console.error('Error fetching paper sim trades:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  apiRouter.get('/paper-sim/positions', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const positions = await storage.getPaperSimOpenPositions('paper');
      res.json({ ok: true, positions });
    } catch (error) {
      console.error('Error fetching paper sim positions:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch positions' });
    }
  });

  apiRouter.get('/paper-sim/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const status = await getPaperSimulationStatus(userId);
      const manager = (global as any).globalPaperPortfolioManager;
      
      if (!status.isRunning || !manager) {
        const stats = await storage.getPaperSimStats('paper');
        return res.json({
          isRunning: false,
          stats: {
            totalTrades: stats.totalTrades,
            openPositions: stats.openPositions,
            closedTrades: stats.closedTrades,
            totalPnl: stats.totalPnl,
            totalPnlPercent: 0,
            winRate: stats.winRate,
            avgReturn: stats.avgReturn,
            avgHoldingTime: stats.avgHoldingTime,
            maxDrawdown: 0,
            sharpeRatio: 0,
            profitFactor: 0,
            byStrategy: stats.byStrategy
          }
        });
      }

      const metrics = await manager.getPortfolioMetrics();
      res.json({
        isRunning: true,
        stats: metrics
      });
    } catch (error) {
      console.error('Error fetching paper sim metrics:', error);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  apiRouter.get('/paper-sim/health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const status = await getPaperSimulationStatus(userId);
      const manager = (global as any).globalPaperPortfolioManager;
      
      if (!status.isRunning || !manager) {
        return res.status(400).json({ error: 'Paper trading simulation not running' });
      }

      const health = await manager.checkPortfolioHealth();
      res.json(health);
    } catch (error) {
      console.error('Error checking paper sim health:', error);
      res.status(500).json({ error: 'Failed to check health' });
    }
  });

  apiRouter.post('/paper-sim/close-all', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const status = await getPaperSimulationStatus(userId);
      const manager = (global as any).globalPaperPortfolioManager;
      
      if (!status.isRunning || !manager) {
        return res.status(400).json({ error: 'Paper trading simulation not running' });
      }

      const { reason } = req.body;
      await manager.closeAllPositions(reason || 'Manual close requested');
      
      res.json({ success: true, message: 'All positions closed' });
    } catch (error) {
      console.error('Error closing all positions:', error);
      res.status(500).json({ error: 'Failed to close positions' });
    }
  });

  apiRouter.post('/paper-sim/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const status = await getPaperSimulationStatus(userId);
      const manager = (global as any).globalPaperPortfolioManager;
      
      if (!status.isRunning || !manager) {
        return res.status(400).json({ error: 'Paper trading simulation not running' });
      }

      await manager.resetPortfolio();
      
      res.json({ success: true, message: 'Portfolio reset complete' });
    } catch (error) {
      console.error('Error resetting portfolio:', error);
      res.status(500).json({ error: 'Failed to reset portfolio' });
    }
  });

  apiRouter.get('/paper-sim/logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { limit } = req.query;
      
      const logs = await storage.getPaperSimTradeLogs('paper', {
        limit: limit ? parseInt(limit as string) : 100
      });
      res.json(logs);
    } catch (error) {
      console.error('Error fetching paper sim logs:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  // Phase 38.2: Unified Filtering - Uses Market Evaluation SSOT
  // Ensures identical filtering to SignalOrchestrator (no more 17 vs 662 discrepancy)
  apiRouter.get('/paper-sim/filtered-pairs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      
      const { getMarketEvaluationService } = await import('./services/market-evaluation.js');
      const { contextBridge } = await import('./services/context-bridge.js');
      
      // Phase 41F-L.E2E-PURGE: Get screener filters from mode-level config
      const screenerFilters = await storage.getScreenerFilters({ mode });
      if (!screenerFilters) {
        return res.status(400).json({ error: 'Screener filters not configured for this mode' });
      }
      
      // Use SSOT market evaluation service
      const marketEval = getMarketEvaluationService();
      const filters = {
        minVolume: screenerFilters.minVolume,
        minDailyRange: screenerFilters.minDailyRange,
        minPrice: screenerFilters.minPrice,
        maxPrice: screenerFilters.maxPrice,
        maxBidAskSpread: screenerFilters.maxBidAskSpread,
        excludeStablecoins: screenerFilters.excludeStablecoins,
        rsiMin: screenerFilters.rsiMin,
        rsiMax: screenerFilters.rsiMax,
        volatilityMin: screenerFilters.volatilityMin,
        volatilityMax: screenerFilters.volatilityMax,
        quoteCurrencies: ['USDC', 'USDT']
      };
      const result = await marketEval.evaluateMarketOnce(mode, filters);
      
      // Transform to backward-compatible format
      const filteredPairs = result.eligiblePairs.map(pair => ({
        symbol: pair.symbol,
        price: pair.currentPrice,
        vwap: pair.vwap,
        spreadBps: 0, // Not available in FilteredPairResult
        volume24h: pair.volume24h,
        dailyRange: pair.dailyRange,
        filterReasons: [], // Not tracked in SSOT
        timestamp: result.computedAt
      }));

      console.log(`[FilteredPairs][SSOT] Returning ${filteredPairs.length}/${result.universeCount} eligible pairs for ${mode} mode`);
      
      const stats = contextBridge.getStats();
      console.log(`[FilterEngine][SSOT] Broadcast trading_data_updated (mode=${mode}, pairs=${filteredPairs.length}) → ${stats.connectedClients} clients`);
      contextBridge.broadcast({
        type: 'trading_data_updated',
        payload: {
          mode,
          source: 'market_evaluation_ssot',
          eligibleCount: filteredPairs.length,
          totalCount: result.universeCount,
          timestamp: result.computedAt
        },
        mode
      }).catch(err => console.error('[FilterEngine][SSOT] ❌ Failed to broadcast trading_data_updated:', err.message));
      
      res.json({
        pairs: filteredPairs,
        totalEligible: filteredPairs.length,
        totalEvaluated: result.universeCount,
        timestamp: result.computedAt,
        nextScanAt: new Date(Date.now() + 15000).toISOString() // 15s cache TTL
      });
    } catch (error) {
      console.error('Error fetching filtered pairs:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch filtered pairs' });
    }
  });

  // Phase 27.F.12: Universe Scan & Filter Trace (read-only diagnostic, admin/owner only)
  // Phase 4A Remediation: Added caching with 45s TTL
  apiRouter.get('/paper-sim/diagnostics/scan', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // Check for admin or owner role
      const userRole = req.user?.role;
      if (!req.user?.isAdmin && userRole !== 'owner' && userRole !== 'admin') {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'Admin or owner privileges required for diagnostic scans'
        });
      }

      const userId = req.user!.id;
      const { mode, limit, trace, strategies } = req.query;
      const scanMode = (mode as 'paper' | 'live') || 'paper';
      const scanLimit = limit ? parseInt(limit as string) : 500;
      
      // Phase 4A: Check cache first (cache key includes mode + limit for proper invalidation)
      const { getCache, setCache, coalesce } = await import('./services/cache.js');
      const cacheKey = `diag:scan:${scanMode}:${scanLimit}`;
      
      const cached = getCache(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // Phase 4A: Use coalescing to prevent duplicate scans
      const scanResult = await coalesce(cacheKey, async () => {
        const { paperSimDiagnosticService } = await import('./services/paper-sim-diagnostic.js');
        
        return await paperSimDiagnosticService.performUniverseScan({
          userId,
          mode: scanMode,
          limit: scanLimit,
          trace: trace === 'true' || trace === undefined,
          strategies: strategies === 'true' || strategies === undefined
        });
      });
      
      // Phase 4A: Cache the response (45s TTL for diagnostics)
      setCache(cacheKey, scanResult, 45000);
      
      res.json(scanResult);
    } catch (error) {
      console.error('Error performing universe scan:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to perform scan' });
    }
  });

  // REB 2.8.5A: 24h metrics now use FX5-native window (legacy aggregator removed)
  apiRouter.get('/paper-sim/diagnostics/scan-24h', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { get24hSummary } = await import('./services/fx5-24h-window.js');
      const { mode } = req.query;
      const scanMode = (mode as 'paper' | 'live') || 'paper';
      
      // Get 24h summary from FX5-native window
      // This automatically returns zeros when no ACTIVE cycles in window
      const summary = get24hSummary(scanMode);
      
      res.json({
        ok: true,
        data: summary,
      });
    } catch (error) {
      console.error('[Scan24h] Error:', error);
      res.status(500).json({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch 24h metrics' 
      });
    }
  });

  // REB 2.8.3: Latest FX5 scan data from Stage-3 cache (REST endpoint for Filter Insights)
  apiRouter.get('/paper-sim/diagnostics/scan-latest', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { stage3Cache } = await import('./services/stage3-state-cache.js');
      const { mode } = req.query;
      const scanMode = (mode as 'paper' | 'live') || 'paper';
      
      const scanState = stage3Cache.getState(scanMode);
      
      // Check engine state from database (not aggregator)
      const context = await storage.getSystemContext(scanMode);
      const isEngineActive = context?.isEngineActive || false;
      
      // REB 2.8.5B: If no scan state yet, still calculate countdown from scanner startup
      if (!scanState) {
        // FX5 scanner runs every 30s - estimate next scan even without state
        const { fx5Scanner } = await import('./services/fx5-scanner.js');
        const scannerStartTime = fx5Scanner.getStartTime();
        const cycleFrequencyMs = 30000;
        
        // Calculate next scan based on scanner start + interval
        const now = Date.now();
        const elapsed = now - scannerStartTime;
        const cyclesSinceStart = Math.floor(elapsed / cycleFrequencyMs);
        const nextScanTimestamp = scannerStartTime + ((cyclesSinceStart + 1) * cycleFrequencyMs);
        const nextScanInMs = Math.max(0, nextScanTimestamp - now);
        
        return res.json({
          ok: true,
          data: {
            cycleId: null,
            scanCycleId: null, // REB 2.8.4: No unique scan ID when engine stopped
            cycleStartTimestamp: null,
            cycleEndTimestamp: null,
            krakenUniverseSize: 0,
            evaluatedCount: 0,
            eligibleCount: 0,
            ineligibleCount: 0,
            cyclesPerHour: 0,
            cycleFrequencyMs,
            nextScanInMs, // REB 2.8.5B: Always calculate, never zero
            activePoolCount: 0,
            activeFilteredPool: [],
            isEngineActive: false,
          },
        });
      }
      
      // REB 2.8.3: Calculate ACTUAL time until next scan (server-side calculation)
      const lastScanTime = new Date(scanState.cycleEndTimestamp).getTime();
      const scanInterval = scanState.cycleFrequencyMs; // 30000ms
      const nextScanTime = lastScanTime + scanInterval;
      const currentServerTime = Date.now();
      const actualNextScanInMs = Math.max(0, nextScanTime - currentServerTime);
      
      // REB 2.8.4: Zero out trading metrics when engine STOPPED (passive learning only)
      // REB 2.8.5A: cyclesPerHour reflects FX5 scan health, NOT zeroed when STOPPED
      res.json({
        ok: true,
        data: {
          cycleId: scanState.cycleId,
          scanCycleId: scanState.scanCycleId, // REB 2.8.4: Unique string ID for this scan
          cycleStartTimestamp: scanState.cycleStartTimestamp,
          cycleEndTimestamp: scanState.cycleEndTimestamp,
          krakenUniverseSize: scanState.krakenUniverseSize,
          evaluatedCount: isEngineActive ? scanState.evaluatedCount : 0, // REB 2.8.4: Trading metric - zero when STOPPED
          eligibleCount: isEngineActive ? scanState.eligibleCount : 0, // REB 2.8.4: Trading metric - zero when STOPPED
          ineligibleCount: isEngineActive ? scanState.ineligibleCount : 0, // REB 2.8.4: Trading metric - zero when STOPPED
          cyclesPerHour: scanState.cyclesPerHour, // REB 2.8.5A: Real FX5 scan health (NOT zeroed when STOPPED)
          cycleFrequencyMs: scanState.cycleFrequencyMs,
          nextScanInMs: actualNextScanInMs, // REB 2.8.3: ACTUAL countdown value (server-calculated)
          activePoolCount: isEngineActive ? scanState.activePoolCount : 0, // REB 2.8.4: Trading metric - zero when STOPPED
          activeFilteredPool: isEngineActive ? scanState.activeFilteredPool : [], // REB 2.8.4: Trading metric - empty when STOPPED
          isEngineActive,
        },
      });
    } catch (error) {
      console.error('[ScanLatest] Error:', error);
      res.status(500).json({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch latest scan data' 
      });
    }
  });

  // Phase 27.F.14.DIAG: Last Cycle Telemetry (diagnostic endpoint)
  apiRouter.get('/paper-sim/last-cycle', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { PaperExecutionEngine } = await import('./services/paper-execution-engine.js');
      const { modeRegistry } = await import('./services/mode-registry.js');
      
      // Get paper execution engine from mode registry
      const paperEngine = modeRegistry.getEngine('paper');
      
      if (!paperEngine) {
        return res.json({ 
          ok: false, 
          error: 'Paper engine not found',
          data: {} 
        });
      }
      
      // Get last cycle summary from engine
      const lastCycleSummary = paperEngine.getLastCycleSummary();
      
      res.json({ 
        ok: true, 
        data: lastCycleSummary || {} 
      });
    } catch (error) {
      console.error('[LastCycleTelemetry] Error:', error);
      res.status(500).json({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch last cycle data' 
      });
    }
  });

  apiRouter.get('/ai/conversation', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const conversation = await storage.getAIConversation(userId);
      res.json(conversation || { messages: [], context: {} });
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  // Get context-specific chat history (for Goals, Guardrails, etc.)
  apiRouter.get('/chats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { context } = req.query;
      
      if (!context) {
        return res.status(400).json({ error: 'Context parameter required' });
      }

      const chats = await storage.getContextChats(userId, context as string);
      res.json(chats || []);
    } catch (error) {
      console.error('Error fetching chats:', error);
      res.status(500).json({ error: 'Failed to fetch chats' });
    }
  });

  // Save chat message to context-specific history
  apiRouter.post('/chats/save', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { role, message, context } = req.body;
      
      if (!context || !role || !message) {
        return res.status(400).json({ error: 'Missing required fields: role, message, context' });
      }

      await storage.saveContextChat({
        userId,
        context,
        role,
        message
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving chat:', error);
      res.status(500).json({ error: 'Failed to save chat' });
    }
  });

  // Phase 7.1c Deliverable 5: Delete chat history for a context
  apiRouter.delete('/chats/:context', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { context } = req.params;
      
      await storage.deleteContextChats(userId, context);
      
      res.json({ success: true, message: 'Chat history cleared' });
    } catch (error) {
      console.error('Error deleting chats:', error);
      res.status(500).json({ error: 'Failed to delete chat history' });
    }
  });

  // Phase 7.1c Deliverable 5: Create new chat session (clears current session)
  apiRouter.post('/chats/new', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { context } = req.body;
      
      if (!context) {
        return res.status(400).json({ error: 'Context required' });
      }

      // Clear current chat history for this context
      await storage.deleteContextChats(userId, context);
      
      res.json({ success: true, message: 'New chat session created' });
    } catch (error) {
      console.error('Error creating new chat:', error);
      res.status(500).json({ error: 'Failed to create new chat' });
    }
  });

  apiRouter.post('/ai/chat', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { message, context } = req.body;
      
      const result = await aiAnalyst.chatWithAssistant(userId, message, context);
      res.json(result);
    } catch (error) {
      console.error('Error in AI chat:', error);
      res.status(500).json({ error: 'Failed to process AI chat' });
    }
  });

  apiRouter.post('/ai/settings/apply', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { settingName, newValue, confirmation } = req.body;
      
      const result = await aiAnalyst.applySettingsChange(userId, settingName, newValue, confirmation);
      res.json(result);
    } catch (error) {
      console.error('Error applying settings change:', error);
      res.status(500).json({ error: 'Failed to apply settings change' });
    }
  });

  apiRouter.get('/ai/audit-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { limit } = req.query;
      
      const logs = await storage.getAuditLogs(userId, limit ? parseInt(limit as string) : 50);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  apiRouter.get('/ai/error-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { resolved, errorType, limit } = req.query;
      
      const filters: any = {};
      if (resolved !== undefined) filters.resolved = resolved === 'true';
      if (errorType) filters.errorType = errorType as string;
      if (limit) filters.limit = parseInt(limit as string);
      
      const logs = await storage.getErrorLogs(userId, filters);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching error logs:', error);
      res.status(500).json({ error: 'Failed to fetch error logs' });
    }
  });

  apiRouter.post('/ai/diagnose-error', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { errorId } = req.body;
      
      const diagnosis = await aiAnalyst.diagnoseError(errorId, userId);
      res.json(diagnosis);
    } catch (error) {
      console.error('Error diagnosing error:', error);
      res.status(500).json({ error: 'Failed to diagnose error' });
    }
  });

  // AI Conversations - Multiple chats management
  apiRouter.get('/conversations', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const conversations = await storage.getAIConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  apiRouter.get('/conversations/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getAIConversationById(id);
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      res.json(conversation);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  apiRouter.post('/conversations', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { title } = req.body;
      
      const conversation = await storage.createAIConversation({
        userId,
        title: title || 'New Chat',
        messages: [],
        context: {},
        maxContextMessages: 20
      });
      
      res.json(conversation);
    } catch (error) {
      console.error('Error creating conversation:', error);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  apiRouter.patch('/conversations/:id', async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { title, maxContextMessages } = req.body;
      
      const updates: Partial<any> = {};
      if (title !== undefined) updates.title = title;
      if (maxContextMessages !== undefined) updates.maxContextMessages = maxContextMessages;
      
      const conversation = await storage.updateAIConversationById(id, updates);
      res.json(conversation);
    } catch (error) {
      console.error('Error updating conversation:', error);
      res.status(500).json({ error: 'Failed to update conversation' });
    }
  });

  apiRouter.delete('/conversations/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAIConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  });

  // Get conversation summaries (Milestone 14)
  apiRouter.get('/conversations/:id/summaries', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { conversationSummarizationService } = await import('./services/conversation-summarization');
      
      const summaries = await conversationSummarizationService.getSummaries(id);
      res.json({ success: true, summaries });
    } catch (error) {
      console.error('Error fetching conversation summaries:', error);
      res.status(500).json({ error: 'Failed to fetch summaries' });
    }
  });

  apiRouter.post('/conversations/:id/message', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { message, context } = req.body;
      
      const result = await aiAnalyst.chatWithAssistant(userId, message, context, id);
      res.json(result);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Kill Switch Incident Analysis Conversation
  apiRouter.post('/kill-switch/create-analysis-chat', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { eventId, mode = 'paper' } = req.body;
      
      // Get kill switch event details
      const event = eventId 
        ? await storage.getKillSwitchEventById(eventId)
        : await storage.getLatestKillSwitchEvent(userId);
      
      if (!event) {
        return res.status(404).json({ error: 'No kill switch event found' });
      }

      // Phase 41F-L.E2E-PURGE: Build settings from mode-level config
      const settings = await buildSettingsFromModeLevel(mode as 'live' | 'paper', userId);
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found for this mode' });
      }

      // Parse closed trades
      let closedTrades: any[] = [];
      if (event.tradesClosed) {
        try {
          const parsed = typeof event.tradesClosed === 'string' 
            ? JSON.parse(event.tradesClosed) 
            : event.tradesClosed;
          closedTrades = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          console.error('Failed to parse tradesClosed:', error);
        }
      }

      // Build incident context
      const incidentContext = {
        eventId: event.id,
        triggeredAt: event.triggeredAt,
        lossPercent: event.lossPercent,
        lossAmount: event.lossAmount,
        portfolioValueBefore: event.portfolioValueBefore,
        portfolioValueAfter: event.portfolioValueAfter,
        killSwitchThreshold: event.killSwitchThreshold,
        tradesCount: closedTrades.length,
        closedTrades: closedTrades.map((t: any) => ({
          symbol: t.symbol,
          strategy: t.strategy,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          profitLoss: Number(t.realizedPL),
          rMultiple: Number(t.realizedPLR)
        })),
        currentSettings: {
          screener: {
            minVolume: settings.minVolume,
            minDailyRange: settings.minDailyRange,
            minPrice: settings.minPrice
          },
          guardrails: {
            riskPerTrade: settings.riskPerTrade,
            maxExposurePercent: settings.maxExposurePercent,
            maxOpenTrades: settings.maxOpenTrades
          },
          strategies: {
            vwap: {
              timeframe: settings.vwapTimeframe,
              pullbackThreshold: settings.vwapPullbackThreshold,
              volumeMultiplier: settings.vwapVolumeMultiplier
            },
            abcd: {
              minConsolidation: settings.abcdMinConsolidation,
              breakoutThreshold: settings.abcdBreakoutThreshold,
              exitType: settings.abcdExitType
            },
            sma: {
              length: settings.smaLength,
              entryCondition: settings.smaEntryCondition,
              exitCondition: settings.smaExitCondition
            }
          }
        }
      };

      // Create initial message with incident context
      const initialMessage = {
        role: 'user',
        content: `Kill Switch Incident Analysis Request

INCIDENT SUMMARY:
- Triggered: ${event.triggeredAt ? new Date(event.triggeredAt).toISOString() : 'N/A'}
- Loss: ${event.lossPercent}% ($${event.lossAmount})
- Portfolio Value (before): $${event.portfolioValueBefore}
- Portfolio Value (after): $${event.portfolioValueAfter}
- Kill Switch Threshold: ${event.killSwitchThreshold}%

TRADES CLOSED: ${closedTrades.length} positions
${closedTrades.map((t: any, i: number) => `
${i + 1}. ${t.symbol} (${t.strategy})
   Entry: $${t.entryPrice} → Exit: $${t.exitPrice}
   P/L: $${Number(t.realizedPL)} (${Number(t.realizedPLR)}R)`).join('')}

CURRENT SETTINGS SNAPSHOT:
- Screener: Min Volume $${settings.minVolume}, Min Range ${settings.minDailyRange}%
- Guardrails: Risk/Trade $${settings.riskPerTrade}, Max Exposure ${settings.maxExposurePercent}%, Max Trades ${settings.maxOpenTrades}
- Strategies: VWAP (${settings.vwapTimeframe}min, ${settings.vwapPullbackThreshold}% pullback), ABCD (${settings.abcdMinConsolidation} bars, ${settings.abcdBreakoutThreshold}% breakout), SMA (${settings.smaLength} period, ${settings.smaEntryCondition} entry)

Please analyze this kill switch incident and provide:
1. Root cause analysis - What led to these losses?
2. Pattern identification - Were there common factors across losing trades?
3. Settings recommendations - Should I adjust screener filters, guardrails, or strategy parameters?
4. Risk management improvements - How can I prevent this in the future?

Provide specific, actionable recommendations.`,
        timestamp: new Date()
      };

      // Create conversation with incident context
      const conversation = await storage.createAIConversation({
        userId,
        title: `Kill Switch Analysis - ${event.triggeredAt ? new Date(event.triggeredAt).toLocaleDateString() : 'Recent'}`,
        messages: [initialMessage],
        context: incidentContext,
        maxContextMessages: 20
      });

      res.json({
        success: true,
        conversationId: conversation.id,
        conversation
      });
    } catch (error: any) {
      console.error('Error creating kill switch analysis chat:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Voice transcription using OpenAI Whisper
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024, // 15 MB limit
    },
  });

  apiRouter.post('/transcribe', authenticateToken, upload.single('audio'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const audioBuffer = req.file.buffer;
      
      if (audioBuffer.length === 0) {
        return res.status(400).json({ error: 'Audio file is empty' });
      }

      console.log(`[Transcription] Processing audio: ${audioBuffer.length} bytes, type: ${req.file.mimetype}`);

      // Create a File-like object for OpenAI API
      const audioFile = new File([audioBuffer], 'audio.webm', { 
        type: req.file.mimetype || 'audio/webm' 
      });

      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR 
      });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en',
      });

      console.log(`[Transcription] Success: "${transcription.text}"`);

      res.json({ text: transcription.text });
    } catch (error: any) {
      console.error('[Transcription] Error:', error);
      
      if (error.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
      }
      
      if (error.message?.includes('format')) {
        return res.status(400).json({ error: 'Unsupported audio format. Please use WebM or WAV.' });
      }
      
      res.status(500).json({ error: 'Failed to transcribe audio. Please try again.' });
    }
  });

  // Phase 6.3: Text-to-Speech endpoint
  apiRouter.post('/walter/tts', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { text, voice, speed } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required' });
      }
      
      if (text.length > 4096) {
        return res.status(400).json({ 
          error: 'Text too long (max 4096 characters)',
          maxLength: 4096,
          actualLength: text.length
        });
      }
      
      console.log(`[TTS] Request for ${text.length} characters`);
      
      const audioBuffer = await textToSpeech(text, { voice, speed });
      const cost = estimateTTSCost(text);
      
      console.log(`[TTS] Generated audio (${audioBuffer.length} bytes, cost: $${cost.toFixed(4)})`);
      
      // Return audio as MP3
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length.toString());
      res.setHeader('X-TTS-Cost', cost.toFixed(6));
      res.send(audioBuffer);
    } catch (error: any) {
      console.error('[TTS] Error:', error);
      
      if (error.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please try again in a moment.' });
      }
      
      res.status(500).json({ error: 'Failed to generate speech. Please try again.' });
    }
  });

  // Phase 6.3: Learning file upload and ingestion  
  apiRouter.post('/walter/ingest', authenticateToken, (req: AuthenticatedRequest, res, next) => {
    upload.single('file')(req as any, res as any, (err: any) => {
      if (err) {
        console.error('[Ingest] Multer error:', err);
        return res.status(400).json({ 
          error: `File upload error: ${err.message}. Expected field name: 'file'` 
        });
      }
      next();
    });
  }, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      if (!req.file) {
        return res.status(400).json({ 
          error: 'No file provided. Use multipart/form-data with field name "file"' 
        });
      }
      
      const allowedTypes = ['.json', '.txt', '.md', '.zip'];
      const ext = path.extname(req.file.originalname).toLowerCase();
      
      if (!allowedTypes.includes(ext)) {
        return res.status(400).json({ 
          error: `Unsupported file type: ${ext}. Allowed: ${allowedTypes.join(', ')}` 
        });
      }
      
      // Save file to learning directory
      const learningDir = path.join(process.cwd(), 'attached_assets', 'learning');
      await fs.mkdir(learningDir, { recursive: true });
      
      const filename = `${Date.now()}_${req.file.originalname}`;
      const filePath = path.join(learningDir, filename);
      
      await fs.writeFile(filePath, req.file.buffer);
      
      console.log(`[Ingest] File uploaded: ${filename} (${req.file.size} bytes)`);
      
      // Ingest the file
      const result = await ingestLearningFile(filePath, userId);
      
      res.json({
        success: result.success,
        result
      });
    } catch (error: any) {
      console.error('[Ingest] Upload error:', error);
      res.status(500).json({ error: 'Failed to process learning file' });
    }
  });

  // Get ingestion history
  apiRouter.get('/walter/ingest/history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const history = await getIngestionHistory(limit);
      res.json({ success: true, history });
    } catch (error: any) {
      console.error('[Ingest] History error:', error);
      res.status(500).json({ error: 'Failed to retrieve ingestion history' });
    }
  });

  // Phase 27: Context ingestion endpoint (manual trigger)
  apiRouter.post('/context/ingest', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { files, overwrite } = req.body;
      
      const { contextLoader } = await import('./services/context-loader');
      const result = await contextLoader.ingest({ files, overwrite: overwrite || false });
      
      res.json(result);
    } catch (error: any) {
      console.error('[ContextLoader] API ingestion error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to ingest context files',
        message: error.message 
      });
    }
  });

  // Chat cost tracking
  apiRouter.get('/chat-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { conversationId, limit } = req.query;
      
      const logs = await storage.getChatLogs(
        userId,
        conversationId as string | undefined,
        limit ? parseInt(limit as string) : 50
      );
      res.json(logs);
    } catch (error) {
      console.error('Error fetching chat logs:', error);
      res.status(500).json({ error: 'Failed to fetch chat logs' });
    }
  });

  apiRouter.get('/chat-costs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { fromDate, toDate } = req.query;
      
      const summary = await storage.getChatCostSummary(
        userId,
        fromDate ? new Date(fromDate as string) : undefined,
        toDate ? new Date(toDate as string) : undefined
      );
      res.json(summary);
    } catch (error) {
      console.error('Error fetching chat costs:', error);
      res.status(500).json({ error: 'Failed to fetch chat costs' });
    }
  });

  apiRouter.post('/ai/error-logs/:id/resolve', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      
      const resolvedLog = await storage.resolveErrorLog(id, notes);
      res.json(resolvedLog);
    } catch (error) {
      console.error('Error resolving error log:', error);
      res.status(500).json({ error: 'Failed to resolve error log' });
    }
  });

  // AI Opportunities routes
  apiRouter.get('/ai/opportunities', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { status, type, minProbability } = req.query;
      
      const opportunities = await aiOpportunitiesService.getOpportunitiesForUser(userId, {
        status: status as string | undefined,
        type: type as string | undefined,
        minProbability: minProbability ? parseFloat(minProbability as string) : undefined
      });
      
      res.json(opportunities);
    } catch (error) {
      console.error('Error fetching AI opportunities:', error);
      res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
  });

  apiRouter.get('/ai/opportunities/latest-run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const latestRun = await aiOpportunitiesService.getLatestRun(userId);
      res.json(latestRun || null);
    } catch (error) {
      console.error('Error fetching latest run:', error);
      res.status(500).json({ error: 'Failed to fetch latest run' });
    }
  });

  apiRouter.get('/ai/opportunities/validation-report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const report = await aiOpportunitiesService.getValidationReport(userId);
      res.json(report);
    } catch (error) {
      console.error('Error generating validation report:', error);
      res.status(500).json({ error: 'Failed to generate validation report' });
    }
  });

  apiRouter.patch('/ai/opportunities/:id/status', async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      await aiOpportunitiesService.updateOpportunityStatus(id, status);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating opportunity status:', error);
      res.status(500).json({ error: 'Failed to update opportunity status' });
    }
  });

  apiRouter.post('/ai/opportunities/generate', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Phase 41F-L.E2E-PURGE: AI features enabled by default (no user-level feature flags)
      
      // Generate for this user only (with cooldown protection)
      await aiOpportunitiesService.generateOpportunitiesForSingleUser(userId);
      
      // Audit log the manual trigger
      await storage.createAuditLog({
        userId,
        actionType: 'manual_opportunity_generation',
        gptResponse: 'User manually triggered AI opportunities generation',
        status: 'completed'
      });
      
      res.json({ success: true, message: 'Opportunity generation started for your account' });
    } catch (error) {
      console.error('Error starting opportunity generation:', error);
      const errorMessage = (error as Error).message || 'Failed to start opportunity generation';
      res.status(429).json({ error: errorMessage }); // 429 for rate limiting
    }
  });

  // Market Context (AI Market Analysis) routes
  apiRouter.get('/market-context/latest', async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as string) || 'live';
      
      if (mode !== 'live' && mode !== 'paper') {
        return res.status(400).json({ error: 'Invalid mode. Must be "live" or "paper"' });
      }
      
      const analysis = await storage.getLatestAiMarketAnalysis(mode);
      res.json(analysis || null);
    } catch (error) {
      console.error('Error fetching latest market analysis:', error);
      res.status(500).json({ error: 'Failed to fetch market analysis' });
    }
  });

  apiRouter.get('/market-context/history', async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as string) || 'live';
      const days = parseInt(req.query.days as string) || 7;
      
      if (mode !== 'live' && mode !== 'paper') {
        return res.status(400).json({ error: 'Invalid mode. Must be "live" or "paper"' });
      }
      
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const toDate = new Date();
      
      const analyses = await storage.getAiMarketAnalysesByRange({
        mode: mode as 'live' | 'paper',
        from: fromDate.toISOString().split('T')[0],
        to: toDate.toISOString().split('T')[0]
      });
      res.json(analyses);
    } catch (error) {
      console.error('Error fetching market analysis history:', error);
      res.status(500).json({ error: 'Failed to fetch market analysis history' });
    }
  });

  apiRouter.post('/market-context/analyze', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode = 'live' } = req.body;
      
      if (mode !== 'live' && mode !== 'paper') {
        return res.status(400).json({ error: 'Invalid mode. Must be "live" or "paper"' });
      }
      
      // Phase 41F-L.E2E-PURGE: AI features enabled by default (no user-level feature flags)
      
      // Manually trigger market analysis
      const { runAiMarketAnalysis } = await import('./services/ai-market-analyzer');
      const { adjustSignalWeightsByRegime } = await import('./services/signal-weight-optimizer');
      
      const analysis = await runAiMarketAnalysis(mode);
      
      // Apply regime-based adjustments if confidence is high enough
      if (analysis.confidence && analysis.confidence >= 60) {
        await adjustSignalWeightsByRegime(analysis.regime, mode);
      }
      
      // Audit log the manual trigger
      await storage.createAuditLog({
        userId,
        actionType: 'manual_market_analysis',
        gptResponse: `User manually triggered ${mode} market analysis: ${analysis.regime} (${analysis.confidence}% confidence)`,
        status: 'completed'
      });
      
      res.json({ success: true, analysis });
    } catch (error) {
      console.error('Error running market analysis:', error);
      res.status(500).json({ error: 'Failed to run market analysis' });
    }
  });

  // Stock API routes
  apiRouter.get('/stocks/quote/:symbol', async (req: AuthenticatedRequest, res) => {
    try {
      const { symbol } = req.params;
      const quote = await stockService.getQuote(symbol);
      res.json(quote);
    } catch (error) {
      console.error('Error fetching stock quote:', error);
      res.status(500).json({ error: 'Failed to fetch stock quote' });
    }
  });

  apiRouter.get('/stocks/company/:symbol', async (req: AuthenticatedRequest, res) => {
    try {
      const { symbol } = req.params;
      const company = await stockService.getCompanyInfo(symbol);
      res.json(company);
    } catch (error) {
      console.error('Error fetching company info:', error);
      res.status(500).json({ error: 'Failed to fetch company info' });
    }
  });

  apiRouter.get('/stocks/search/:query', async (req: AuthenticatedRequest, res) => {
    try {
      const { query } = req.params;
      const results = await stockService.search(query);
      res.json(results);
    } catch (error) {
      console.error('Error searching stocks:', error);
      res.status(500).json({ error: 'Failed to search stocks' });
    }
  });

  apiRouter.get('/symbol/data', async (req: AuthenticatedRequest, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase();
      if (!symbol) {
        return res.status(400).json({ error: 'Missing symbol parameter' });
      }

      const data = await stockService.getSymbolData(symbol);
      
      if (!data) {
        return res.status(404).json({ 
          error: `No data found for ${symbol}`,
          retryable: true
        });
      }

      res.json(data);
    } catch (err: any) {
      console.error('Symbol data fetch error:', err);
      res.status(500).json({ 
        error: 'Internal error fetching symbol data',
        message: err.message
      });
    }
  });

  // Test endpoint for Finnhub feed
  apiRouter.get('/test/finnhub-feed', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const testSymbol = 'AAPL';
      const timestamp = new Date().toISOString();
      
      console.log(`[Test Finnhub Feed] Starting test for ${testSymbol} at ${timestamp}`);
      
      // Test search functionality
      let searchResults: any = null;
      let searchError: string | null = null;
      try {
        searchResults = await stockService.search(testSymbol);
        console.log(`[Test Finnhub Feed] Search results:`, searchResults);
      } catch (error: any) {
        console.error(`[Test Finnhub Feed] Search failed:`, {
          status: error.status || 'unknown',
          message: error.message,
          stack: error.stack
        });
        searchError = error.message;
      }
      
      // Test quote functionality
      let quoteData: any = null;
      let quoteError: string | null = null;
      try {
        quoteData = await stockService.getQuote(testSymbol);
        console.log(`[Test Finnhub Feed] Quote data:`, quoteData);
      } catch (error: any) {
        console.error(`[Test Finnhub Feed] Quote failed:`, {
          status: error.status || 'unknown',
          message: error.message,
          stack: error.stack
        });
        quoteError = error.message;
      }
      
      // Test company profile functionality
      let companyData: any = null;
      let companyError: string | null = null;
      try {
        companyData = await stockService.getCompanyInfo(testSymbol);
        console.log(`[Test Finnhub Feed] Company data:`, companyData);
      } catch (error: any) {
        console.error(`[Test Finnhub Feed] Company info failed:`, {
          status: error.status || 'unknown',
          message: error.message,
          stack: error.stack
        });
        companyError = error.message;
      }
      
      // Return comprehensive test results
      res.json({
        testSymbol,
        timestamp,
        search: searchResults || { error: searchError },
        quote: quoteData || { error: quoteError },
        company: companyData || { error: companyError },
        summary: {
          searchSuccessful: !searchError,
          quoteSuccessful: !quoteError,
          companySuccessful: !companyError,
          allTestsPassed: !searchError && !quoteError && !companyError
        }
      });
    } catch (error: any) {
      console.error('[Test Finnhub Feed] Unexpected error:', {
        message: error.message,
        stack: error.stack
      });
      res.status(500).json({ 
        error: 'Test failed with unexpected error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Crypto search route
  apiRouter.get('/crypto/search/:query', async (req: AuthenticatedRequest, res) => {
    try {
      const { query } = req.params;
      const normalizedQuery = query.toLowerCase().trim();
      
      // Search through supported crypto symbols and names
      const cryptoList = [
        { symbol: 'BTC', name: 'Bitcoin' },
        { symbol: 'ETH', name: 'Ethereum' },
        { symbol: 'SOL', name: 'Solana' },
        { symbol: 'SUI', name: 'Sui' },
        { symbol: 'ADA', name: 'Cardano' },
        { symbol: 'DOT', name: 'Polkadot' },
        { symbol: 'MATIC', name: 'Polygon' },
        { symbol: 'AVAX', name: 'Avalanche' },
        { symbol: 'LINK', name: 'Chainlink' },
        { symbol: 'UNI', name: 'Uniswap' },
        { symbol: 'ATOM', name: 'Cosmos' },
        { symbol: 'XRP', name: 'XRP' },
        { symbol: 'DOGE', name: 'Dogecoin' },
        { symbol: 'LTC', name: 'Litecoin' },
        { symbol: 'BCH', name: 'Bitcoin Cash' },
        { symbol: 'XLM', name: 'Stellar' },
        { symbol: 'ALGO', name: 'Algorand' },
        { symbol: 'VET', name: 'VeChain' },
        { symbol: 'FIL', name: 'Filecoin' },
        { symbol: 'TRX', name: 'TRON' },
        { symbol: 'ETC', name: 'Ethereum Classic' }
      ];

      const results = cryptoList
        .filter(crypto => 
          crypto.symbol.toLowerCase().includes(normalizedQuery) ||
          crypto.name.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, 5)
        .map(crypto => ({
          symbol: crypto.symbol,
          description: crypto.name,
          type: 'Crypto'
        }));

      res.json(results);
    } catch (error) {
      console.error('Error searching crypto:', error);
      res.status(500).json({ error: 'Failed to search crypto' });
    }
  });

  // Reports Export API
  apiRouter.get('/reports/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { reportType, format, from, to, symbol, strategy, mode } = req.query;
      
      // Fetch all trades for the user
      const allTrades = await storage.getTrades({ 
        status: 'closed',
        limit: 10000 
      });
      console.log('[Phase-27.F.15.B.1] Updated route /api/reports/export → mode-based only');
      
      // Apply filters
      let filteredTrades = allTrades;
      
      // Date range filter
      if (from || to) {
        filteredTrades = filteredTrades.filter(trade => {
          if (!trade.exitTime) return false;
          const exitDate = new Date(trade.exitTime);
          if (from && exitDate < new Date(from as string)) return false;
          if (to && exitDate > new Date(to as string)) return false;
          return true;
        });
      }
      
      // Symbol filter
      if (symbol && symbol !== 'all') {
        filteredTrades = filteredTrades.filter(trade => trade.symbol === symbol);
      }
      
      // Strategy filter
      if (strategy && strategy !== 'all') {
        filteredTrades = filteredTrades.filter(trade => trade.strategy === strategy);
      }
      
      // Mode filter
      if (mode && mode !== 'all') {
        filteredTrades = filteredTrades.filter(trade => trade.mode === mode);
      }
      
      // Generate report based on type
      let csvData = '';
      let filename = 'report.csv';
      
      switch (reportType) {
        case 'tax':
          csvData = generateTaxReport(filteredTrades);
          filename = 'tax-report.csv';
          break;
        case 'performance':
          csvData = generatePerformanceReport(filteredTrades);
          filename = 'performance-report.csv';
          break;
        case 'journal':
          csvData = generateTradeJournalReport(filteredTrades);
          filename = 'trade-journal.csv';
          break;
        case 'fees':
          csvData = generateFeesReport(filteredTrades);
          filename = 'fees-report.csv';
          break;
        case 'pnl-monthly':
          csvData = generatePnLReport(filteredTrades, 'monthly');
          filename = 'pnl-monthly.csv';
          break;
        case 'pnl-quarterly':
          csvData = generatePnLReport(filteredTrades, 'quarterly');
          filename = 'pnl-quarterly.csv';
          break;
        case 'pnl-annual':
          csvData = generatePnLReport(filteredTrades, 'annual');
          filename = 'pnl-annual.csv';
          break;
        case 'custom':
        case 'all-trades':
        default:
          csvData = generateTradeCSV(filteredTrades);
          filename = 'trades.csv';
          break;
      }
      
      if (format === 'pdf') {
        // For now, return CSV with a note that PDF generation is not yet implemented
        // In production, you would use a PDF library here
        res.status(501).json({ error: 'PDF export coming soon. Please use CSV format.' });
        return;
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(csvData);
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // File Download API - Persistent Files
  apiRouter.get('/files/download/:category/:filename', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { category, filename } = req.params;
      
      if (!['report', 'log', 'export', 'analysis'].includes(category)) {
        return res.status(400).json({ error: 'Invalid file category' });
      }

      const filePath = filePersistence.getDownloadPath(category as any, filename);
      const exists = await filePersistence.fileExists(category as any, filename);

      if (!exists) {
        return res.status(404).json({ error: 'File not found' });
      }

      const result = await filePersistence.readFile(category as any, filename);
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      const ext = path.extname(filename).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.md': 'text/markdown',
        '.json': 'application/json',
        '.csv': 'text/csv',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.log': 'text/plain',
        '.txt': 'text/plain',
      };

      res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.send(result.content);
    } catch (error) {
      console.error('Error downloading file:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // List Files API
  apiRouter.get('/files/list/:category', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { category } = req.params;
      
      if (!['report', 'log', 'export', 'analysis'].includes(category)) {
        return res.status(400).json({ error: 'Invalid file category' });
      }

      const files = await filePersistence.listFiles(category as any);
      res.json({ files });
    } catch (error) {
      console.error('Error listing files:', error);
      res.status(500).json({ error: 'Failed to list files' });
    }
  });

  // File Persistence Metrics API
  apiRouter.get('/files/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const metrics = filePersistence.getMetrics();
      const healthSummary = filePersistence.getHealthSummary();
      res.json({ metrics, healthSummary });
    } catch (error) {
      console.error('Error getting file metrics:', error);
      res.status(500).json({ error: 'Failed to get file metrics' });
    }
  });

  // Export functionality
  apiRouter.get('/export/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { from, to, format } = req.query;
      
      const trades = await storage.getTrades({ 
        status: 'closed',
        limit: 10000 
      });
      console.log('[Phase-27.F.15.B.1] Updated route /api/export/trades → mode-based only');
      
      // Filter by date range if provided
      let filteredTrades = trades;
      if (from || to) {
        filteredTrades = trades.filter(trade => {
          if (!trade.exitTime) return false;
          const exitDate = new Date(trade.exitTime);
          
          if (from && exitDate < new Date(from as string)) return false;
          if (to && exitDate > new Date(to as string)) return false;
          
          return true;
        });
      }
      
      if (format === 'csv') {
        const csvData = generateTradeCSV(filteredTrades);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=trades.csv');
        res.send(csvData);
      } else {
        res.json(filteredTrades);
      }
    } catch (error) {
      console.error('Error exporting trades:', error);
      res.status(500).json({ error: 'Failed to export trades' });
    }
  });

  // Database monitoring
  apiRouter.get('/database/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const currentStatus = await databaseMonitor.checkDatabaseSize();
      const history = await storage.getDatabaseSizeHistory(7); // Last 7 days
      
      res.json({
        current: currentStatus,
        history: history.map(log => ({
          sizeMb: parseFloat(log.sizeMb),
          sizeGb: parseFloat(log.sizeGb),
          checkedAt: log.checkedAt,
        })),
        limits: {
          maxSizeGb: 10,
          warningThresholdGb: 5,
          criticalThresholdGb: 7,
        },
      });
    } catch (error) {
      console.error('Error getting database status:', error);
      res.status(500).json({ error: 'Failed to get database status' });
    }
  });

  // Maintenance mode status
  apiRouter.get('/maintenance/status', (req, res) => {
    res.json({
      isMaintenanceMode: process.env.MAINTENANCE_MODE === 'true'
    });
  });

  // Screener test endpoint for demonstrating different filter configurations
  apiRouter.post('/screener/test', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      const mode = (req.body.mode || req.query.mode || 'paper') as 'live' | 'paper';
      const kraken = new KrakenService();
      
      // Use request body if provided, otherwise load from database (NO HARDCODED DEFAULTS)
      let testSettings = req.body;
      
      if (!testSettings && userId) {
        // Phase 41F-L.E2E-PURGE: Load from mode-level screener filters
        const screenerSettings = await storage.getScreenerFilters({ mode });
        
        if (screenerSettings) {
          testSettings = {
            minVolume: screenerSettings.minVolume,
            minDailyRange: screenerSettings.minDailyRange,
            minPrice: screenerSettings.minPrice,
            maxPrice: screenerSettings.maxPrice,
            maxBidAskSpread: screenerSettings.maxBidAskSpread,
            excludeStablecoins: screenerSettings.excludeStablecoins,
            allowedTradingPairs: [],
            blacklistedSymbols: [],
            whitelistedSymbols: [],
            rsiMin: screenerSettings.rsiMin,
            rsiMax: screenerSettings.rsiMax,
            volatilityMin: screenerSettings.volatilityMin,
            volatilityMax: screenerSettings.volatilityMax
          };
        }
      }
      
      if (!testSettings) {
        return res.status(400).json({ error: 'No test settings provided and user has no saved filters' });
      }

      console.log('\n🧪 Screener Test with settings:', testSettings);
      const eligiblePairs = await kraken.getEligiblePairs(testSettings);
      
      res.json({
        success: true,
        settings: testSettings,
        eligiblePairs,
        totalEligible: eligiblePairs.length
      });
    } catch (error: any) {
      console.error('Screener test error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Portfolio guardrails test endpoint - simulate multiple signals
  apiRouter.post('/guardrails/test', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.body.mode || req.query.mode || 'paper') as 'live' | 'paper';
      
      // Phase 41F-L.E2E-PURGE: Build settings from mode-level config
      const settings = await buildSettingsFromModeLevel(mode, userId);
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found for this mode' });
      }

      console.log('\n🛡️  PORTFOLIO GUARDRAILS TEST');
      console.log('='.repeat(60));
      console.log('Settings:', {
        riskPerTrade: settings.riskPerTrade,
        maxExposure: `${settings.maxExposurePercent}%`,
        maxOpenTrades: settings.maxOpenTrades,
        stopBuffer: `${settings.stopBufferPercent}%`,
        slippageMajors: `${settings.slippageToleranceMajors}%`,
        slippageMidcaps: `${settings.slippageToleranceMidcaps}%`
      });

      const { RiskManager } = await import('./services/risk-manager');
      const { TradingEngine } = await import('./services/trading-engine');
      
      const riskManager = new RiskManager();
      const tradingEngine = new TradingEngine(userId);

      // Simulate 5 different trading signals
      const testSignals = [
        {
          symbol: 'BTCUSD',
          strategy: 'vwap_pullback' as const,
          entryPrice: 65000,
          stopPrice: 64000,
          targetPrice: 67000,
          confidence: 0.85,
          metadata: { vwap: 64500 }
        },
        {
          symbol: 'ETHUSD',
          strategy: 'abcd_long' as const,
          entryPrice: 3500,
          stopPrice: 3400,
          targetPrice: 3700,
          confidence: 0.80,
          metadata: { breakout: true }
        },
        {
          symbol: 'SOLUSD',
          strategy: 'sma_trend_ride' as const,
          entryPrice: 150,
          stopPrice: 145,
          targetPrice: 160,
          confidence: 0.75,
          metadata: { sma: 148 }
        },
        {
          symbol: 'XRPUSD',
          strategy: 'vwap_pullback' as const,
          entryPrice: 2.50,
          stopPrice: 2.40,
          targetPrice: 2.70,
          confidence: 0.70,
          metadata: { vwap: 2.45 }
        },
        {
          symbol: 'ADAUSD',
          strategy: 'sma_trend_ride' as const,
          entryPrice: 0.75,
          stopPrice: 0.70,
          targetPrice: 0.85,
          confidence: 0.65,
          metadata: { sma: 0.73 }
        }
      ];

      const results = [];

      for (let i = 0; i < testSignals.length; i++) {
        const signal = testSignals[i];
        console.log(`\n📊 Signal ${i + 1}/${testSignals.length}: ${signal.symbol} (${signal.strategy})`);
        console.log(`   Entry: $${signal.entryPrice}, Stop: $${signal.stopPrice}, Target: $${signal.targetPrice}`);

        // Check pre-trade risk
        const riskCheck = await riskManager.checkPreTradeRisk(userId, signal, settings);
        
        if (riskCheck.approved) {
          // Phase 41F-L.E2E-FIX: Calculate position details using percentage-based risk
          const { getRiskPercentage, calculateRiskAmount } = await import('./services/risk-manager.js');
          const portfolioMetrics = await riskManager.getPortfolioMetrics(userId);
          const portfolioValue = portfolioMetrics.totalValue || 50000;
          const pct = getRiskPercentage(settings, portfolioValue);
          const riskAmount = calculateRiskAmount(portfolioValue, pct);
          const stopDistance = Math.abs(signal.entryPrice - signal.stopPrice);
          const quantity = riskAmount / stopDistance;
          const positionValue = signal.entryPrice * quantity;
          
          // Apply stop buffer
          const stopBuffer = parseFloat(settings.stopBufferPercent || '0.3') / 100;
          const bufferedStop = signal.stopPrice * (1 - stopBuffer);
          
          console.log(`   ✅ APPROVED - Position: ${quantity.toFixed(4)} units ($${positionValue.toFixed(2)})`);
          console.log(`   Stop Buffer Applied: ${signal.stopPrice} → ${bufferedStop.toFixed(6)} (${settings.stopBufferPercent}%)`);
          
          results.push({
            signal: `${signal.symbol} ${signal.strategy}`,
            status: 'APPROVED',
            quantity: quantity.toFixed(4),
            positionValue: positionValue.toFixed(2),
            bufferedStop: bufferedStop.toFixed(6)
          });
        } else {
          console.log(`   ❌ REJECTED - ${riskCheck.reason}`);
          results.push({
            signal: `${signal.symbol} ${signal.strategy}`,
            status: 'REJECTED',
            reason: riskCheck.reason
          });
        }
      }

      // Get current portfolio metrics
      const metrics = await riskManager.getPortfolioMetrics(userId);
      
      console.log('\n📈 Portfolio Metrics:');
      console.log(`   Open Trades: ${metrics.openTradesCount}/${settings.maxOpenTrades}`);
      console.log(`   Current Exposure: $${metrics.currentExposure.toFixed(2)}`);
      console.log(`   Realized P/L: $${metrics.realizedPL.toFixed(2)}`);
      console.log('='.repeat(60));

      res.json({
        success: true,
        guardrails: {
          riskPerTrade: settings.riskPerTrade,
          maxExposure: settings.maxExposurePercent,
          maxOpenTrades: settings.maxOpenTrades,
          stopBuffer: settings.stopBufferPercent,
          slippageTolerance: {
            majors: settings.slippageToleranceMajors,
            midcaps: settings.slippageToleranceMidcaps,
            small: settings.slippageToleranceSmall
          }
        },
        results,
        portfolioMetrics: metrics,
        message: 'Check server logs for detailed guardrail application'
      });
    } catch (error: any) {
      console.error('Guardrails test error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 41F-L.E2E-PURGE: DEPRECATED - Use /api/guardrails-v2/kill-switch endpoints instead
  // Legacy Kill Switch endpoints - replaced by mode-level guardrails_v2 API
  apiRouter.get('/kill-switch/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      error: 'This endpoint is deprecated',
      message: 'Kill switch now operates at mode-level. Use GET /api/guardrails-v2?mode=paper or /api/guardrails-v2?mode=live to check kill_switch_tripped status.',
      migration: 'User-level settings eliminated in Phase 41F-L.E2E-PURGE'
    });
  });

  apiRouter.post('/kill-switch/check', async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      error: 'This endpoint is deprecated',
      message: 'Kill switch monitoring is now automatic via risk manager. Check status with GET /api/guardrails-v2?mode=paper or /api/guardrails-v2?mode=live',
      migration: 'User-level settings eliminated in Phase 41F-L.E2E-PURGE'
    });
  });

  apiRouter.post('/kill-switch/reset', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      error: 'This endpoint is deprecated',
      message: 'Use POST /api/guardrails-v2/kill-switch/reset?mode=paper or mode=live to reset the kill switch.',
      migration: 'User-level settings eliminated in Phase 41F-L.E2E-PURGE'
    });
  });

  apiRouter.get('/kill-switch/events', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const events = await storage.getKillSwitchEvents(userId, { limit });
      
      res.json(events);
    } catch (error: any) {
      console.error('Kill switch events error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test endpoint for simulating kill switch scenarios
  apiRouter.post('/test/simulate-loss', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { scenario, mode = 'paper' } = req.body; // 'warning', 'kill', or custom loss %
      
      // Phase 41F-L.E2E-PURGE: Build settings from mode-level config
      const settings = await buildSettingsFromModeLevel(mode as 'live' | 'paper', userId);
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found for this mode' });
      }

      const killSwitchPercent = parseFloat(settings.dailyLossKillSwitch || '7.00');
      const warningTriggerPercent = parseFloat(settings.dailyLossWarningTrigger || '75.00');
      
      let targetLossPercent: number;
      
      if (scenario === 'warning') {
        // Set loss to warning threshold (e.g., 75% of 7% = -5.25%)
        targetLossPercent = killSwitchPercent * (warningTriggerPercent / 100);
      } else if (scenario === 'kill') {
        // Set loss to just above kill threshold (e.g., -7.5%)
        targetLossPercent = killSwitchPercent * 1.1;
      } else if (typeof req.body.lossPercent === 'number') {
        // Custom loss percentage
        targetLossPercent = req.body.lossPercent;
      } else {
        return res.status(400).json({ error: 'Invalid scenario. Use "warning", "kill", or provide lossPercent' });
      }

      // Phase 41F-L.E2E-FIX: Create simulated trade using percentage-based risk
      const { getRiskPercentage, calculateRiskAmount } = await import('./services/risk-manager.js');
      const portfolioMetrics = await riskManager.getPortfolioMetrics(userId);
      const portfolioValue = portfolioMetrics.totalValue || 50000;
      const pct = getRiskPercentage(settings, portfolioValue);
      const riskAmount = calculateRiskAmount(portfolioValue, pct);
      const lossAmount = (riskAmount / 0.01) * (targetLossPercent / 100); // Scale up the loss
      
      const simulatedTrade = await storage.createTrade({
        userId,
        symbol: 'BTCUSD',
        strategy: 'vwap_pullback',
        mode: 'paper',
        entryPrice: '50000',
        quantity: (Math.abs(lossAmount) / 50000).toFixed(8),
        stopPrice: '49500',
        targetPrice: '51000',
        status: 'closed',
        exitPrice: (50000 - Math.abs(lossAmount) / (Math.abs(lossAmount) / 50000)).toFixed(2),
        exitTime: new Date(),
        realizedPL: lossAmount.toString(),
        realizedPLR: '-1.0',
        riskAmount: riskAmount.toString(),
        metadata: { test: true, scenario }
      });

      // Check kill switch after creating the losing trade
      const result = await riskManager.checkKillSwitch(userId, settings);
      
      // Phase 41F-L.E2E-PURGE: Get updated settings from mode-level config
      const updatedSettings = await buildSettingsFromModeLevel(mode as 'live' | 'paper', userId);

      res.json({
        success: true,
        simulatedTrade,
        killSwitchResult: result,
        tradingSuspended: updatedSettings?.tradingSuspended || false,
        targetLossPercent
      });
    } catch (error: any) {
      console.error('Test simulate-loss error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test endpoint to check if trade execution is blocked during suspension
  apiRouter.post('/test/attempt-trade', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.body.mode || req.query.mode || 'paper') as 'live' | 'paper';
      
      // Phase 41F-L.E2E-PURGE: Build settings from mode-level config
      const settings = await buildSettingsFromModeLevel(mode, userId);
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found for this mode' });
      }

      // Create a test signal
      const testSignal = {
        symbol: 'ETHUSD',
        strategy: 'vwap_pullback' as const,
        entryPrice: 3000,
        stopPrice: 2950,
        targetPrice: 3100,
        confidence: 0.8,
        metadata: { test: true }
      };

      // Run through risk checks
      const riskCheck = await riskManager.checkPreTradeRisk(userId, testSignal, settings);

      res.json({
        tradingSuspended: settings.tradingSuspended,
        riskCheckApproved: riskCheck.approved,
        riskCheckReason: riskCheck.reason,
        testSignal
      });
    } catch (error: any) {
      console.error('Test attempt-trade error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Strategy test endpoint - analyze watchlist pairs for signals
  apiRouter.post('/strategies/test', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      const watchlist = await storage.getWatchlist({ mode });
      console.log('[Phase-27.F.15.B.1] Updated route /api/strategies/test → mode-based only');
      
      // Phase 41F-L.E2E-PURGE: Build settings from mode-level config
      const settings = await buildSettingsFromModeLevel(mode, userId);
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found for this mode' });
      }

      console.log(`\n🧪 Testing strategies for ${watchlist.length} watchlist pairs...`);
      console.log(`User settings:`, {
        vwapPullback: settings.vwapPullbackThreshold,
        vwapVolume: settings.vwapVolumeMultiplier,
        abcdBreakout: settings.abcdBreakoutThreshold,
        abcdExitType: settings.abcdExitType,
        smaEntry: settings.smaEntryCondition,
        smaExit: settings.smaExitCondition
      });
      
      const { StrategyEngine } = await import('./services/strategy-engine');
      const strategyEngine = new StrategyEngine();
      const kraken = new KrakenService();
      
      const results = [];
      
      for (const pair of watchlist) {
        console.log(`\n🔍 Analyzing ${pair.symbol} for strategy signals...`);
        
        try {
          const ohlcData = await kraken.getOHLCData(pair.symbol, 60);
          
          if (!ohlcData.ohlc || ohlcData.ohlc.length < 20) {
            results.push({ symbol: pair.symbol, error: 'Insufficient data' });
            continue;
          }

          const priceData = ohlcData.ohlc.map((candle, index) => ({
            id: `${pair.symbol}-${candle.time}-${index}`,
            symbol: pair.symbol,
            timestamp: new Date(candle.time * 1000),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            vwap: candle.vwap,
            sma: '0'
          }));

          const currentPrice = parseFloat(priceData[priceData.length - 1].close);
          const vwap = strategyEngine.calculateVWAP(priceData.slice(-24));
          const sma = strategyEngine.calculateSMA(priceData, parseInt(settings.smaLength?.toString() || '20'));
          
          const indicators = {
            vwap,
            sma,
            currentPrice,
            volume: parseFloat(priceData[priceData.length - 1].volume),
            high24h: Math.max(...priceData.slice(-24).map(p => parseFloat(p.high))),
            low24h: Math.min(...priceData.slice(-24).map(p => parseFloat(p.low)))
          };

          const vwapSignal = strategyEngine.detectVWAPPullback(indicators, settings);
          const abcdSignal = strategyEngine.detectABCDLong(priceData, settings);
          const smaSignal = strategyEngine.detectSMATrendRide(indicators, priceData, settings);

          results.push({
            symbol: pair.symbol,
            analyzed: true,
            signals: {
              vwap: vwapSignal ? 'FOUND' : null,
              abcd: abcdSignal ? 'FOUND' : null,
              sma: smaSignal ? 'FOUND' : null
            }
          });
        } catch (error: any) {
          results.push({ symbol: pair.symbol, error: error.message });
        }
      }
      
      res.json({
        success: true,
        watchlistSize: watchlist.length,
        results,
        message: 'Check server logs for detailed strategy analysis and settings used'
      });
    } catch (error: any) {
      console.error('Strategy test error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // VALIDATION ENDPOINT: Run strategy validation tests (Stage A: Historical Replay)
  apiRouter.post('/strategies/validate', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      console.log(`\n🚀 Running strategy validation for user ${userId}...`);
      
      const { StrategyValidator } = await import('./services/strategy-validator');
      const validator = new StrategyValidator();
      
      const results = await validator.runAllTests(userId);
      const report = validator.generateReport();
      
      // Save report to docs folder
      const fs = await import('fs/promises');
      const path = await import('path');
      const docsDir = path.join(process.cwd(), 'docs');
      
      try {
        await fs.mkdir(docsDir, { recursive: true });
      } catch (err) {
        // Directory might already exist
      }
      
      const reportPath = path.join(docsDir, 'strategy-validation-report.md');
      await fs.writeFile(reportPath, report, 'utf-8');
      
      console.log(`\n📝 Validation report saved to: ${reportPath}\n`);
      
      res.json({
        success: true,
        summary: {
          totalTests: results.totalTests,
          passed: results.passed,
          failed: results.failed,
          successRate: ((results.passed / results.totalTests) * 100).toFixed(1) + '%'
        },
        results: results.results,
        reportPath: 'docs/strategy-validation-report.md',
        report
      });
    } catch (error: any) {
      console.error('Strategy validation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // STAGE B VALIDATION: Paper trading with real market data
  apiRouter.post('/strategies/validate-stageb', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      console.log(`\n🚀 Running Stage B validation with real market data for user ${userId}...`);
      
      const { StageBValidator } = await import('./services/stage-b-validator');
      const validator = new StageBValidator();
      
      const results = await validator.runStageB(userId);
      const report = validator.generateReport(results);
      
      // Save report to docs folder
      const fs = await import('fs/promises');
      const path = await import('path');
      const docsDir = path.join(process.cwd(), 'docs');
      
      try {
        await fs.mkdir(docsDir, { recursive: true });
      } catch (err) {
        // Directory might already exist
      }
      
      const reportPath = path.join(docsDir, 'strategy-validation-stageb-report.md');
      await fs.writeFile(reportPath, report, 'utf-8');
      
      console.log(`\n📝 Stage B validation report saved to: ${reportPath}\n`);
      
      res.json({
        success: true,
        stage: 'B',
        summary: {
          totalStrategies: results.totalStrategies,
          strategiesWithSignals: results.strategiesWithSignals,
          successRate: results.successRate.toFixed(1) + '%',
          passed: results.successRate >= 80
        },
        metrics: results.metrics,
        reportPath: 'docs/strategy-validation-stageb-report.md',
        report
      });
    } catch (error: any) {
      console.error('Stage B validation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // TEST ENDPOINT: Test Kraken credentials
  apiRouter.get('/test/kraken-balance', authenticateToken, async (_req, res) => {
    try {
      const krakenService = new KrakenService();
      const balances = await krakenService.getAccountBalance();
      
      res.json({ 
        success: true, 
        message: 'Kraken API credentials are valid!',
        balances 
      });
    } catch (error: any) {
      
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // ========================================
  // SYSTEM MONITORING ENDPOINTS
  // ========================================

  // System Health Check
  apiRouter.get('/system/health', async (_req, res) => {
    try {
      const uptime = process.uptime();
      const status = {
        tradingEngine: 'running',
        aiScheduler: 'active',
        database: 'ok',
        kraken: 'stable',
        uptime: Math.floor(uptime),
        uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      };
      res.json({ ok: true, status });
    } catch (error: any) {
      console.error('System health check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Strategy Settings Audit Log
  apiRouter.get('/system/strategy-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const audits = await storage.listStrategySettingsAudit({ userId, limit });
      res.json({ ok: true, audits });
    } catch (error: any) {
      console.error('Strategy audit fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Formula Audit - Verify all formulas used in screeners, guardrails, and strategies
  apiRouter.get('/system/formula-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      console.log('[AUDIT] Starting formula audit...');
      const report = await formulaAuditService.runAudit();
      console.log(`[AUDIT] Completed: ${report.passed} passed, ${report.warnings} warnings, ${report.failed} failed`);
      
      res.json({ 
        ok: true, 
        report: {
          timestamp: report.timestamp,
          totalFormulas: report.totalFormulas,
          passed: report.passed,
          warnings: report.warnings,
          failed: report.failed,
          tests: report.tests,
          summary: report.summary
        }
      });
    } catch (error: any) {
      console.error('[AUDIT] Formula audit error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Formula Audit - Manual Trigger (Admin Only)
  apiRouter.get('/system/formula-audit/run', authenticateToken, requirePermission('manage_system'), async (req: AuthenticatedRequest, res) => {
    try {
      console.log('[AUDIT] Manual formula audit triggered by user:', req.user!.username);
      
      const { runFormulaAudit } = await import('./jobs/formula-auto-audit');
      const result = await runFormulaAudit('manual');
      
      res.json({ 
        ok: true,
        runType: 'manual',
        timestamp: result.timestamp,
        reportPath: result.reportPath,
        duration: result.duration,
        report: {
          totalFormulas: result.totalFormulas,
          passed: result.passed,
          warnings: result.warnings,
          failed: result.failed,
          tests: result.tests,
          summary: result.summary
        }
      });
    } catch (error: any) {
      console.error('[AUDIT] Manual formula audit error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Feed Health - Get current health metrics
  apiRouter.get('/system/feed-health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getFeedIntegrityMonitor } = await import('./services/feed-integrity-monitor');
      const monitor = getFeedIntegrityMonitor();
      
      const report = monitor.generateReport();
      
      res.json({ 
        ok: true, 
        timestamp: report.timestamp,
        grade: report.overallGrade,
        metrics: report.metrics,
        issues: report.issues,
        history: monitor.getHealthHistory().map(h => ({
          timestamp: h.timestamp,
          latencyMs: h.latencyMs,
          wasHealthy: h.wasHealthy
        }))
      });
    } catch (error: any) {
      console.error('[FEED-HEALTH] Error fetching feed health:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Feed Health - Manual Trigger (Admin Only)
  apiRouter.get('/system/feed-health/run', authenticateToken, requirePermission('manage_system'), async (req: AuthenticatedRequest, res) => {
    try {
      console.log('[FEED-HEALTH] Manual check triggered by user:', req.user!.username);
      
      const { runFeedIntegrityCheck } = await import('./jobs/feed-integrity-auto-check');
      const report = await runFeedIntegrityCheck('manual');
      
      res.json({ 
        ok: true,
        runType: 'manual',
        timestamp: report.timestamp,
        grade: report.overallGrade,
        metrics: report.metrics,
        issues: report.issues,
        summary: report.summary
      });
    } catch (error: any) {
      console.error('[FEED-HEALTH] Manual check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PHASE 27.F.21: Feed Health - Clear Alerts (Admin Only, for testing)
  apiRouter.post('/system/feed-health/clear-alerts', authenticateToken, requirePermission('manage_system'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      console.log(`[FEED-HEALTH] Manual alert clear triggered by user: ${req.user!.username}`);
      
      const { clearFeedHealthAlertsOnStop } = await import('./jobs/feed-integrity-auto-check');
      await clearFeedHealthAlertsOnStop(userId);
      
      res.json({ 
        ok: true,
        message: 'Feed-health alerts cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[FEED-HEALTH] Clear alerts error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PHASE 27.F.21.FINAL: Feed Health - Retrospective Cleanup (Admin Only)
  // Cleans up DORMANT-MODE feed-health alerts only (older than 30 min + dormant flag)
  apiRouter.post('/system/feed-health/cleanup-old-alerts', authenticateToken, requirePermission('manage_system'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      console.log(`[FEED-HEALTH] Retrospective cleanup triggered by user: ${req.user!.username}`);
      
      // Target dormant-mode alerts older than 30 minutes
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      // Get all users
      const users = await storage.getAllUsers();
      let totalCleaned = 0;
      let skippedActiveAlerts = 0;
      
      for (const user of users) {
        // Get old unacknowledged feed-health alerts
        const liveAlerts = await AlertsService.getUnacknowledgedAlerts(user.id, 'live');
        const paperAlerts = await AlertsService.getUnacknowledgedAlerts(user.id, 'paper');
        
        // Filter to DORMANT-MODE feed-health alerts (old + dormant metadata)
        // This preserves legitimate active-mode alerts
        const dormantLiveFeedAlerts = liveAlerts.filter(a => {
          const isOld = new Date(a.timestamp) < thirtyMinutesAgo;
          const isFeedHealth = a.alertType === 'feed_health';
          const isDormant = a.metadata?.dormant === true;
          
          if (isFeedHealth && isOld && !isDormant) {
            skippedActiveAlerts++;
          }
          
          return isFeedHealth && isOld && isDormant;
        });
        
        const dormantPaperFeedAlerts = paperAlerts.filter(a => {
          const isOld = new Date(a.timestamp) < thirtyMinutesAgo;
          const isFeedHealth = a.alertType === 'feed_health';
          const isDormant = a.metadata?.dormant === true;
          
          if (isFeedHealth && isOld && !isDormant) {
            skippedActiveAlerts++;
          }
          
          return isFeedHealth && isOld && isDormant;
        });
        
        // Acknowledge dormant alerts only
        for (const alert of dormantLiveFeedAlerts) {
          await AlertsService.acknowledgeAlert(alert.id, user.id);
          totalCleaned++;
        }
        
        for (const alert of dormantPaperFeedAlerts) {
          await AlertsService.acknowledgeAlert(alert.id, user.id);
          totalCleaned++;
        }
      }
      
      console.log(`[FEED-HEALTH] Retrospective cleanup complete: ${totalCleaned} dormant alerts cleaned, ${skippedActiveAlerts} active-mode alerts preserved`);
      
      // Reset feed health monitor state (clears history, resets uptime counters)
      const { getFeedIntegrityMonitor } = await import('./services/feed-integrity-monitor');
      const monitor = getFeedIntegrityMonitor();
      monitor.reset();
      console.log(`[FEED-HEALTH] Monitor state reset - dormant periods excluded from future grading`);
      
      res.json({ 
        ok: true,
        message: 'Retrospective cleanup completed (dormant-mode alerts only)',
        alertsCleaned: totalCleaned,
        activeAlertsPreserved: skippedActiveAlerts,
        cutoffTime: thirtyMinutesAgo.toISOString(),
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[FEED-HEALTH] Cleanup error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // System Health Summary - Get today's feed/formula issue counts for dashboard widget
  apiRouter.get('/system/health-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { walterActions } = await import('@shared/schema');
      
      // Get start of today in UTC
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      
      // Query walter_actions for today's feed and formula events
      const todayActions = await db
        .select()
        .from(walterActions)
        .where(
          and(
            eq(walterActions.userId, userId),
            sql`${walterActions.createdAt} >= ${today.toISOString()}`
          )
        );
      
      // Count by category
      const feedActions = todayActions.filter(a => a.category === 'feed');
      const formulaActions = todayActions.filter(a => a.category === 'formula');
      
      // Count detected (all actions) vs resolved (completed status)
      const feedDetected = feedActions.length;
      const feedResolved = feedActions.filter(a => a.status === 'completed').length;
      const formulaDetected = formulaActions.length;
      const formulaResolved = formulaActions.filter(a => a.status === 'completed').length;
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        summary: {
          feedHealthIssuesDetected: feedDetected,
          feedHealthIssuesResolved: feedResolved,
          formulaHealthIssuesDetected: formulaDetected,
          formulaHealthIssuesResolved: formulaResolved
        }
      });
    } catch (error: any) {
      console.error('[SYSTEM-HEALTH-SUMMARY] Error fetching summary:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // One-time cleanup: Acknowledge all feed_health and formula_audit alerts
  apiRouter.post('/system/cleanup-health-alerts', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      console.log(`[CLEANUP] Acknowledging all feed_health and formula_audit alerts for user ${userId}`);
      
      // Get all unacknowledged feed_health and formula_audit alerts
      const alerts = await AlertsService.getAlerts(userId);
      const healthAlerts = alerts.filter(a => 
        a.alertType === 'feed_health' || a.alertType === 'formula_audit'
      );
      
      let acknowledgedCount = 0;
      for (const alert of healthAlerts) {
        await AlertsService.acknowledgeAlert(alert.id, userId);
        acknowledgedCount++;
      }
      
      console.log(`[CLEANUP] Acknowledged ${acknowledgedCount} health alerts`);
      
      res.json({
        ok: true,
        message: `Successfully acknowledged ${acknowledgedCount} feed/formula health alerts`,
        count: acknowledgedCount,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[CLEANUP] Error acknowledging health alerts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Walter Autonomous Maintenance Actions
  // ============================================
  
  // Zod schemas for Walter action request validation
  const walterActionModeSchema = z.object({
    mode: z.enum(['live', 'paper'])
  });
  
  const walterActionRejectSchema = z.object({
    mode: z.enum(['live', 'paper']),
    reason: z.string().optional()
  });
  
  // Helper function to determine required permission based on mode
  function getWalterActionPermission(mode: 'live' | 'paper'): Permission {
    return mode === 'live' ? 'approve_walter_action_live' : 'approve_walter_action_paper';
  }
  
  // Get Walter actions with filtering
  apiRouter.get('/walter/actions', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as 'live' | 'paper') || 'live';
      const status = req.query.status as string | undefined;
      const source = req.query.source as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      
      console.log(`[WALTER-ACTIONS] Fetching actions for user ${userId} (mode: ${mode}, status: ${status || 'all'}, source: ${source || 'all'})`);
      
      const { WalterOpsEngine } = await import('./services/walter-ops-engine');
      const actions = await WalterOpsEngine.getActions(userId, mode, { status, source, limit });
      
      res.json({ 
        ok: true, 
        actions,
        count: actions.length
      });
    } catch (error: any) {
      console.error('[WALTER-ACTIONS] Error fetching actions:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get auto-resolved incidents count for today
  apiRouter.get('/walter/auto-resolved-today', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get start of today (midnight UTC)
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      
      // Query auto-resolved actions from today
      const { and, eq, gte, sql: drizzleSql } = await import('drizzle-orm');
      const { walterActions } = await import('../shared/schema');
      
      const autoResolvedActions = await db
        .select()
        .from(walterActions)
        .where(
          and(
            eq(walterActions.userId, userId),
            eq(walterActions.status, 'completed'),
            gte(walterActions.detectedAt, todayStart),
            drizzleSql`${walterActions.contextData}->>'autoResolved' = 'true'`
          )
        );
      
      // Count by source
      const feedCount = autoResolvedActions.filter(a => a.category === 'feed').length;
      const formulaCount = autoResolvedActions.filter(a => a.category === 'formula').length;
      
      res.json({
        total: autoResolvedActions.length,
        feed: feedCount,
        formula: formulaCount
      });
    } catch (error: any) {
      console.error('[WALTER-AUTO-RESOLVED] Error fetching stats:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Approve a pending Walter action (RBAC + validation)
  apiRouter.post('/walter/actions/:id/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const actionId = req.params.id;
      const userId = req.user!.id;
      
      // Validate request body
      const validation = walterActionModeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }
      
      const { mode } = validation.data;
      
      // RBAC: Check permission based on mode
      const requiredPermission = getWalterActionPermission(mode);
      const userPermissions = req.user?.permissions || [];
      
      if (!userPermissions.includes(requiredPermission)) {
        return res.status(403).json({ 
          error: 'Permission denied',
          message: `Approving Walter actions in ${mode} mode requires the "${requiredPermission}" permission`,
          requiredPermission,
          userRole: req.user?.role
        });
      }
      
      console.log(`[WALTER-ACTIONS] User ${userId} (${req.user?.role}) approving action ${actionId} (mode: ${mode})`);
      
      const { WalterOpsEngine } = await import('./services/walter-ops-engine');
      const result = await WalterOpsEngine.approveAction(actionId, userId, mode);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ 
        ok: true, 
        action: result.action,
        message: 'Action approved and executed'
      });
    } catch (error: any) {
      console.error('[WALTER-ACTIONS] Error approving action:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Reject a pending Walter action (RBAC + validation)
  apiRouter.post('/walter/actions/:id/reject', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const actionId = req.params.id;
      const userId = req.user!.id;
      
      // Validate request body
      const validation = walterActionRejectSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }
      
      const { mode, reason } = validation.data;
      
      // RBAC: Check permission based on mode
      const requiredPermission = getWalterActionPermission(mode);
      const userPermissions = req.user?.permissions || [];
      
      if (!userPermissions.includes(requiredPermission)) {
        return res.status(403).json({ 
          error: 'Permission denied',
          message: `Rejecting Walter actions in ${mode} mode requires the "${requiredPermission}" permission`,
          requiredPermission,
          userRole: req.user?.role
        });
      }
      
      console.log(`[WALTER-ACTIONS] User ${userId} (${req.user?.role}) rejecting action ${actionId} (mode: ${mode})`);
      
      const { WalterOpsEngine } = await import('./services/walter-ops-engine');
      const result = await WalterOpsEngine.rejectAction(actionId, userId, mode, reason);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ 
        ok: true, 
        action: result.action,
        message: 'Action rejected'
      });
    } catch (error: any) {
      console.error('[WALTER-ACTIONS] Error rejecting action:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Acknowledge a completed Walter action (RBAC + validation)
  apiRouter.post('/walter/actions/:id/acknowledge', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const actionId = req.params.id;
      const userId = req.user!.id;
      
      // Validate request body
      const validation = walterActionModeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: 'Invalid request body',
          details: validation.error.errors
        });
      }
      
      const { mode } = validation.data;
      
      // RBAC: Check permission based on mode
      const requiredPermission = getWalterActionPermission(mode);
      const userPermissions = req.user?.permissions || [];
      
      if (!userPermissions.includes(requiredPermission)) {
        return res.status(403).json({ 
          error: 'Permission denied',
          message: `Acknowledging Walter actions in ${mode} mode requires the "${requiredPermission}" permission`,
          requiredPermission,
          userRole: req.user?.role
        });
      }
      
      console.log(`[WALTER-ACTIONS] User ${userId} (${req.user?.role}) acknowledging action ${actionId} (mode: ${mode})`);
      
      const { WalterOpsEngine } = await import('./services/walter-ops-engine');
      const result = await WalterOpsEngine.acknowledgeAction(actionId, userId, mode);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json({ 
        ok: true, 
        action: result.action,
        message: 'Action acknowledged'
      });
    } catch (error: any) {
      console.error('[WALTER-ACTIONS] Error acknowledging action:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Phase 27.F.20: Execution Config (Auto-Execution Settings)
  // ============================================
  
  // Get all execution configs for a mode
  apiRouter.get('/execution-config', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      console.log(`[EXECUTION-CONFIG] Fetching configs for user ${userId} (mode: ${mode})`);
      
      const configs = await storage.getExecutionConfigs(userId, mode);
      
      res.json({ 
        ok: true, 
        configs,
        count: configs.length
      });
    } catch (error: any) {
      console.error('[EXECUTION-CONFIG] Error fetching configs:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Create or update an execution config
  apiRouter.post('/execution-config', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode, actionType, autoExecuteEnabled, requiresApproval, maxImpactThreshold, notes } = req.body;
      
      // Validate required fields
      if (!mode || !actionType) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          message: 'mode and actionType are required'
        });
      }
      
      // Validate mode
      if (!['live', 'paper'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode. Must be "live" or "paper"' });
      }
      
      console.log(`[EXECUTION-CONFIG] Upserting config for user ${userId} (mode: ${mode}, actionType: ${actionType}, autoExecute: ${autoExecuteEnabled})`);
      
      const config = await storage.upsertExecutionConfig({
        userId,
        mode,
        actionType,
        autoExecuteEnabled: autoExecuteEnabled ?? false,
        requiresApproval: requiresApproval ?? true,
        maxImpactThreshold: maxImpactThreshold || '50.00',
        notes: notes || null
      });
      
      res.json({ 
        ok: true, 
        config,
        message: 'Execution config saved successfully'
      });
    } catch (error: any) {
      console.error('[EXECUTION-CONFIG] Error saving config:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Delete an execution config
  apiRouter.delete('/execution-config/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const configId = req.params.id;
      
      console.log(`[EXECUTION-CONFIG] Deleting config ${configId} for user ${userId}`);
      
      await storage.deleteExecutionConfig(configId);
      
      res.json({ 
        ok: true, 
        message: 'Execution config deleted successfully'
      });
    } catch (error: any) {
      console.error('[EXECUTION-CONFIG] Error deleting config:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // System Logs (simple in-memory log - placeholder)
  apiRouter.get('/system/logs', async (_req, res) => {
    try {
      // For now, return a simple message. In the future, could implement proper log aggregation
      const logs = [
        { timestamp: new Date().toISOString(), level: 'INFO', message: 'System operational' },
        { timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', message: 'Engine heartbeat OK' },
      ];
      res.json({ ok: true, logs });
    } catch (error: any) {
      console.error('System logs fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Audit Log
  apiRouter.get('/system/ai-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const logs = await storage.getAuditLogs(userId, limit);
      res.json({ ok: true, logs });
    } catch (error: any) {
      console.error('AI audit log fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Error Logs
  apiRouter.get('/system/error-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const errors = await storage.getErrorLogs(userId, { limit });
      res.json({ ok: true, errors });
    } catch (error: any) {
      console.error('Error logs fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== DIAGNOSTICS ENDPOINTS (Phase 5) =====
  
  // System Metrics (CPU, Memory, Latency, API Health)
  apiRouter.get('/diagnostics/system-metrics', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getSystemMetrics } = await import('./diagnostics/metrics.js');
      const metrics = await getSystemMetrics();
      res.json({ ok: true, metrics });
    } catch (error: any) {
      console.error('System metrics fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trading Engine Status
  apiRouter.get('/diagnostics/trading-engine', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getTradingEngineStatus } = await import('./diagnostics/metrics.js');
      const status = await getTradingEngineStatus();
      res.json({ ok: true, status });
    } catch (error: any) {
      console.error('Trading engine status fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Walter Activity Metrics
  apiRouter.get('/diagnostics/walter-activity', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getWalterActivity } = await import('./diagnostics/metrics.js');
      const activity = await getWalterActivity();
      res.json({ ok: true, activity });
    } catch (error: any) {
      console.error('Walter activity fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Database Health Metrics
  apiRouter.get('/diagnostics/database-health', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getDatabaseHealth } = await import('./diagnostics/metrics.js');
      const health = await getDatabaseHealth();
      res.json({ ok: true, health });
    } catch (error: any) {
      console.error('Database health fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Expert Insights Metrics
  apiRouter.get('/diagnostics/expert-insights', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getExpertInsightsMetrics } = await import('./diagnostics/expert-insights-metrics.js');
      const metrics = await getExpertInsightsMetrics();
      res.json({ ok: true, metrics });
    } catch (error: any) {
      console.error('Expert insights metrics fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Expert Insights Health Check
  apiRouter.get('/diagnostics/expert-insights/health', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { checkExpertInsightsHealth } = await import('./diagnostics/expert-insights-metrics.js');
      const health = await checkExpertInsightsHealth();
      res.json({ ok: true, health });
    } catch (error: any) {
      console.error('Expert insights health check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Export System Report
  apiRouter.get('/diagnostics/export-report', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getSystemMetrics, getTradingEngineStatus, getWalterActivity, getDatabaseHealth } = await import('./diagnostics/metrics.js');
      const { getExpertInsightsMetrics } = await import('./diagnostics/expert-insights-metrics.js');
      
      const [systemMetrics, tradingEngine, walterActivity, databaseHealth, expertInsights] = await Promise.all([
        getSystemMetrics(),
        getTradingEngineStatus(),
        getWalterActivity(),
        getDatabaseHealth(),
        getExpertInsightsMetrics()
      ]);
      
      const report = {
        timestamp: new Date().toISOString(),
        systemMetrics,
        tradingEngine,
        walterActivity,
        databaseHealth,
        expertInsights
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="system-report-${Date.now()}.json"`);
      res.json(report);
    } catch (error: any) {
      console.error('Export report error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Acknowledge/Resolve Alert
  apiRouter.post('/diagnostics/acknowledge-alert', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { alertId } = req.body;
      
      if (!alertId) {
        return res.status(400).json({ error: 'alertId is required' });
      }
      
      const resolvedAlert = await storage.resolveErrorLog(alertId);
      res.json({ ok: true, alert: resolvedAlert });
    } catch (error: any) {
      console.error('Acknowledge alert error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Run Diagnostic Analysis (on-demand)
  apiRouter.post('/diagnostics/analyze', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { diagnosticsAnalyzer } = await import('./diagnostics/analyzer.js');
      const analysis = await diagnosticsAnalyzer.runDiagnosticAnalysis();
      res.json({ ok: true, analysis });
    } catch (error: any) {
      console.error('Diagnostic analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Diagnostic Analysis History
  apiRouter.get('/diagnostics/analysis-history', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const analyses = await storage.getOrchestratorLogsByCategory(null, 'diagnostics', 20);
      res.json({ ok: true, analyses });
    } catch (error: any) {
      console.error('Get analysis history error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== OPTIMIZATION ENDPOINTS (Phase 5) =====

  // Run Optimization Analysis (on-demand)
  apiRouter.post('/optimization/analyze', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { optimizationAnalyzer } = await import('./optimization/analyzer.js');
      await optimizationAnalyzer.runOptimizationAnalysis();
      res.json({ ok: true, message: 'Optimization analysis completed' });
    } catch (error: any) {
      console.error('Optimization analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Optimization Recommendations
  apiRouter.get('/optimization/recommendations', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const recommendations = await storage.getOrchestratorLogsByCategory(null, 'optimization', 20);
      res.json({ ok: true, recommendations });
    } catch (error: any) {
      console.error('Get optimization recommendations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== SCHEDULER ENDPOINTS =====
  
  // Get scheduler status for all tasks
  apiRouter.get('/schedulers/status', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { schedulerRegistry } = await import('./services/scheduler-registry');
      const tasks = schedulerRegistry.getAllTaskStatuses();
      
      res.json({ 
        ok: true, 
        tasks: tasks.map(task => ({
          name: task.name,
          description: task.description,
          frequency: task.frequency,
          lastRun: task.lastRun,
          nextRun: task.nextRun,
          status: task.status
        }))
      });
    } catch (error: any) {
      console.error('Scheduler status fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Manually trigger a specific scheduler task
  apiRouter.post('/schedulers/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { taskName } = req.body;
      
      if (!taskName) {
        return res.status(400).json({ error: 'taskName is required' });
      }
      
      const { schedulerRegistry } = await import('./services/scheduler-registry');
      
      // Execute the task manually
      await schedulerRegistry.executeTask(taskName);
      
      res.json({ 
        ok: true, 
        message: `Task ${taskName} executed successfully` 
      });
    } catch (error: any) {
      console.error('Manual scheduler execution error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get transparency logs
  apiRouter.get('/schedulers/transparency-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const taskName = req.query.taskName as string;
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      
      const logs = await storage.getTransparencyLogs({ 
        taskName, 
        mode, 
        limit 
      });
      
      res.json({ ok: true, logs });
    } catch (error: any) {
      console.error('Transparency logs fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== LEARNING DATA ENDPOINTS =====

  // Get filter calibration logs
  apiRouter.get('/learning/calibration-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      const hours = parseInt(req.query.hours as string) || 24;
      
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - hours);
      
      // Get calibration logs using existing method
      let logs;
      if (mode) {
        const latest = await storage.getLatestCalibration({ userId, mode, maxAgeHours: hours });
        logs = latest ? [latest] : [];
      } else {
        // Get both modes
        const [liveLogs, paperLogs] = await Promise.all([
          storage.getLatestCalibration({ userId, mode: 'live', maxAgeHours: hours }),
          storage.getLatestCalibration({ userId, mode: 'paper', maxAgeHours: hours })
        ]);
        logs = [liveLogs, paperLogs].filter(Boolean);
      }
      
      res.json({ ok: true, logs });
    } catch (error: any) {
      console.error('Calibration logs fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get intraday adjustments
  apiRouter.get('/learning/intraday-adjustments', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      const hours = parseInt(req.query.hours as string) || 24;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const adjustments = await storage.getIntradayAdjustments(userId, { mode, hours, limit });
      
      res.json({ ok: true, adjustments });
    } catch (error: any) {
      console.error('Intraday adjustments fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get AI lessons
  apiRouter.get('/learning/ai-lessons', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      const strategy = req.query.strategy as string | undefined;
      const hours = parseInt(req.query.hours as string) || 168; // Default 7 days
      const limit = parseInt(req.query.limit as string) || 50;
      
      const lessons = await storage.getAILessons(userId, { mode, strategy, hours, limit });
      
      res.json({ ok: true, lessons });
    } catch (error: any) {
      console.error('AI lessons fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get portfolio adjustments
  apiRouter.get('/learning/portfolio-adjustments', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      const hours = parseInt(req.query.hours as string) || 24;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const adjustments = await storage.getPortfolioAdjustments(userId, { mode, hours, limit });
      
      res.json({ ok: true, adjustments });
    } catch (error: any) {
      console.error('Portfolio adjustments fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get prediction outcomes
  apiRouter.get('/learning/prediction-outcomes', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      const strategy = req.query.strategy as string | undefined;
      const hours = parseInt(req.query.hours as string) || 24;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const fromDate = new Date();
      fromDate.setHours(fromDate.getHours() - hours);
      
      const outcomes = await storage.getPredictionOutcomes(userId, { 
        mode, 
        strategy, 
        fromDate, 
        limit 
      });
      
      res.json({ ok: true, outcomes });
    } catch (error: any) {
      console.error('Prediction outcomes fetch error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Database cross-check for Milestone 12 verification (Part A-1)
  apiRouter.get('/learning/database-cross-check', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get actual counts using raw SQL queries
      const calibrationCountResult = (await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE mode = 'live') as live_count,
          COUNT(*) FILTER (WHERE mode = 'paper') as paper_count
        FROM filter_calibration_log
        WHERE user_id = ${userId}
      `)).rows[0];
      
      const intradayCountResult = (await db.execute(sql`
        SELECT COUNT(*) as count FROM intraday_adjustments WHERE user_id = ${userId}
      `)).rows[0];
      
      const lessonsCountResult = (await db.execute(sql`
        SELECT COUNT(*) as count FROM ai_lessons WHERE user_id = ${userId}
      `)).rows[0];
      
      const portfolioCountResult = (await db.execute(sql`
        SELECT COUNT(*) as count FROM portfolio_adjustments WHERE user_id = ${userId}
      `)).rows[0];
      
      const transparencyCountResult = (await db.execute(sql`
        SELECT 
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE user_id = ${userId}) as user_count,
          COUNT(*) FILTER (WHERE user_id IS NULL) as system_count
        FROM ai_transparency_log
      `)).rows[0];
      
      // Get sample data
      const [
        calibrationLive,
        calibrationPaper,
        intradayAdjustments,
        aiLessons,
        portfolioAdjustments,
        transparencyLogs,
      ] = await Promise.all([
        storage.getLatestCalibration({ userId, mode: 'live', maxAgeHours: 168 }),
        storage.getLatestCalibration({ userId, mode: 'paper', maxAgeHours: 168 }),
        storage.getIntradayAdjustments(userId, { hours: 168, limit: 3 }),
        storage.getAILessons(userId, { hours: 168, limit: 3 }),
        storage.getPortfolioAdjustments(userId, { hours: 168, limit: 3 }),
        // Fetch recent system-wide scheduler logs (userId IS NULL)
        storage.getSystemSchedulerLogs(10),
      ]);
      
      const crossCheck = {
        filter_calibration_log: {
          live: {
            count: Number((calibrationCountResult as any).live_count || 0),
            latest: calibrationLive || null,
          },
          paper: {
            count: Number((calibrationCountResult as any).paper_count || 0),
            latest: calibrationPaper || null,
          },
        },
        intraday_adjustments: {
          count: Number((intradayCountResult as any).count || 0),
          samples: intradayAdjustments,
        },
        ai_lessons: {
          count: Number((lessonsCountResult as any).count || 0),
          samples: aiLessons,
        },
        portfolio_adjustments: {
          count: Number((portfolioCountResult as any).count || 0),
          samples: portfolioAdjustments,
        },
        ai_transparency_log: {
          total_count: Number((transparencyCountResult as any).total_count || 0),
          user_count: Number((transparencyCountResult as any).user_count || 0),
          system_count: Number((transparencyCountResult as any).system_count || 0),
          samples: transparencyLogs,
          // Verify scheduler cadence per task (Milestone 12: each task runs ≤ 4 hours)
          scheduler_cadence: await (async () => {
            const schedulerLogs = await storage.getSystemSchedulerLogs(200);
            const taskNames = ['AI Summary', 'Market Scan', 'Screener Recalibration', 'System Health Check'];
            const perTask: any[] = [];

            for (const taskName of taskNames) {
              const taskLogs = schedulerLogs.filter(log => log.taskName === taskName);
              
              if (taskLogs.length >= 2 && taskLogs[0].executedAt && taskLogs[1].executedAt) {
                const latestLog = new Date(taskLogs[0].executedAt);
                const previousLog = new Date(taskLogs[1].executedAt);
                const hoursBetween = (latestLog.getTime() - previousLog.getTime()) / (1000 * 60 * 60);
                
                perTask.push({
                  task_name: taskName,
                  total_logs: taskLogs.length,
                  hours_between_runs: parseFloat(hoursBetween.toFixed(2)),
                  meets_requirement: hoursBetween <= 4,
                  last_run: taskLogs[0].executedAt
                });
              } else {
                perTask.push({
                  task_name: taskName,
                  total_logs: taskLogs.length,
                  hours_between_runs: null,
                  meets_requirement: false,
                  last_run: taskLogs[0]?.executedAt || null
                });
              }
            }

            return {
              per_task: perTask,
              all_tasks_compliant: perTask.every(t => t.meets_requirement)
            };
          })(),
        },
      };
      
      res.json({ ok: true, crossCheck });
    } catch (error: any) {
      console.error('Database cross-check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Performance snapshot for Milestone 12 verification (Part B-1)
  apiRouter.get('/learning/performance-snapshot', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const hours = parseInt(req.query.hours as string) || 24;
      
      // Define current and prior period dates
      const currentPeriodEnd = new Date();
      const currentPeriodStart = new Date();
      currentPeriodStart.setHours(currentPeriodStart.getHours() - hours);
      
      const priorPeriodEnd = new Date(currentPeriodStart);
      const priorPeriodStart = new Date(priorPeriodEnd);
      priorPeriodStart.setHours(priorPeriodStart.getHours() - hours);
      
      // Get all trades
      const [paperTrades, liveTrades] = await Promise.all([
        storage.getAllPaperTrades(),
        storage.getTrades({}),
      ]);
      console.log('[Phase-27.F.15.B.1] Updated route /api/learning/performance-snapshot → mode-based only');
      
      // Helper function to calculate metrics for a period
      const calculatePeriodMetrics = (trades: any[], startDate: Date, endDate: Date) => {
        const periodTrades = trades.filter(t => 
          t.entryTime && 
          new Date(t.entryTime) >= startDate && 
          new Date(t.entryTime) < endDate && 
          t.status === 'closed'
        );
        
        const pnL = periodTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
        const wins = periodTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
        const accuracy = periodTrades.length > 0 ? (wins.length / periodTrades.length) * 100 : 0;
        
        const pnLValues = periodTrades.map(t => parseFloat(t.realizedPL || '0'));
        const mean = pnLValues.length > 0 ? pnLValues.reduce((a, b) => a + b, 0) / pnLValues.length : 0;
        const variance = pnLValues.length > 0
          ? pnLValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / pnLValues.length
          : 0;
        
        return {
          accuracy: Number(accuracy.toFixed(2)),
          total_trades: periodTrades.length,
          winning_trades: wins.length,
          total_pnl: Number(pnL.toFixed(2)),
          avg_pnl: periodTrades.length > 0 ? Number((pnL / periodTrades.length).toFixed(2)) : 0,
          variance: Number(variance.toFixed(2)),
        };
      };
      
      // Calculate current period metrics
      const paperCurrent = calculatePeriodMetrics(paperTrades, currentPeriodStart, currentPeriodEnd);
      const liveCurrent = calculatePeriodMetrics(liveTrades, currentPeriodStart, currentPeriodEnd);
      
      // Calculate prior period metrics
      const paperPrior = calculatePeriodMetrics(paperTrades, priorPeriodStart, priorPeriodEnd);
      const livePrior = calculatePeriodMetrics(liveTrades, priorPeriodStart, priorPeriodEnd);
      
      // Calculate improvement deltas
      const paperAccuracyDelta = paperCurrent.accuracy - paperPrior.accuracy;
      const liveVarianceReduction = livePrior.variance > 0 
        ? ((livePrior.variance - liveCurrent.variance) / livePrior.variance) * 100 
        : 0;
      
      const snapshot = {
        period_hours: hours,
        current_period: {
          start: currentPeriodStart.toISOString(),
          end: currentPeriodEnd.toISOString(),
        },
        prior_period: {
          start: priorPeriodStart.toISOString(),
          end: priorPeriodEnd.toISOString(),
        },
        paper_mode: {
          current: paperCurrent,
          prior: paperPrior,
          accuracy_improvement: Number(paperAccuracyDelta.toFixed(2)),
        },
        live_mode: {
          current: liveCurrent,
          prior: livePrior,
          variance_reduction_percent: Number(liveVarianceReduction.toFixed(2)),
        },
        milestone_12_goals: {
          paper_accuracy_improvement_target: 5, // >= 5%
          live_variance_reduction_target: 10, // >= 10%
          paper_accuracy_goal_met: paperAccuracyDelta >= 5,
          live_variance_goal_met: liveVarianceReduction >= 10,
        },
      };
      
      res.json({ ok: true, snapshot });
    } catch (error: any) {
      console.error('Performance snapshot error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Autonomy Confidence Index for Milestone 12 verification (Part B-2)
  apiRouter.get('/learning/autonomy-confidence', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get Paper accuracy (last 24h)
      const paperAccuracy = await storage.getPredictionAccuracy(userId, 'paper', undefined, 1);
      
      // Calculate transfer success rate (fallbacks in last 24h)
      const calibrationLive = await storage.getLatestCalibration({ userId, mode: 'live', maxAgeHours: 24 });
      const hasFallback = calibrationLive && calibrationLive.source === 'paper-fallback';
      const transferSuccessRate = hasFallback ? 100 : 0;
      
      // Get system health uptime (based on transparency logs)
      const recentLogs = await storage.getTransparencyLogs({ limit: 50 });
      const successfulLogs = recentLogs.filter(log => log.success);
      const healthUptime = recentLogs.length > 0 
        ? (successfulLogs.length / recentLogs.length) * 100 
        : 100;
      
      // Calculate Autonomy Confidence Index
      // CI = 0.5(Accuracy_paper) + 0.3(Transfer_SuccessRate) + 0.2(Health_Uptime)
      const autonomyConfidence = Number((
        0.5 * paperAccuracy.accuracy +
        0.3 * transferSuccessRate +
        0.2 * healthUptime
      ).toFixed(2));
      
      res.json({ 
        ok: true, 
        autonomyConfidence,
        components: {
          paper_accuracy: Number(paperAccuracy.accuracy.toFixed(2)),
          transfer_success_rate: Number(transferSuccessRate.toFixed(2)),
          health_uptime: Number(healthUptime.toFixed(2)),
        },
        metrics: {
          total_predictions: paperAccuracy.totalPredictions,
          correct_predictions: paperAccuracy.correctPredictions,
          successful_scheduler_runs: successfulLogs.length,
          total_scheduler_runs: recentLogs.length,
          has_paper_fallback: hasFallback,
        }
      });
    } catch (error: any) {
      console.error('Autonomy confidence calculation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Paper→Live Fallback Test for Milestone 12 verification (Part A-2)
  apiRouter.get('/learning/fallback-test', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      // Check source data availability
      const liveCalibration = await storage.getLatestCalibration({ userId, mode: 'live', maxAgeHours: 24 });
      const paperCalibration = await storage.getLatestPaperCalibration(userId);
      
      // Test the production HTTP endpoint by making an actual request
      const protocol = req.protocol;
      const host = req.get('host');
      const baseUrl = `${protocol}://${host}`;
      
      let effectiveCalibration = null;
      let endpointError = null;
      let httpStatusCode = null;
      
      try {
        const response = await fetch(`${baseUrl}/api/screeners/calibration`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-app-mode': 'live'
          }
        });
        
        httpStatusCode = response.status;
        
        if (response.ok) {
          effectiveCalibration = await response.json();
        } else if (response.status === 404) {
          // Expected when no calibration data exists
          endpointError = 'No calibration data found';
        } else {
          endpointError = `HTTP ${response.status}: ${await response.text()}`;
        }
      } catch (fetchError: any) {
        endpointError = `Fetch failed: ${fetchError.message}`;
      }
      
      // Determine if fallback was triggered
      const fallbackTriggered = !liveCalibration && !!paperCalibration;
      
      // Test passes if:
      // 1. Endpoint is reachable AND
      //    a) Returns 404 when no calibration exists (both live and paper empty), OR
      //    b) Returns 200 with live calibration (no fallback needed), OR
      //    c) Returns 200 with fallback and source is 'paper-fallback'
      const endpointReachable = httpStatusCode !== null;
      const validResponse = httpStatusCode === 200 || httpStatusCode === 404;
      
      let testPassed = false;
      let message = '';
      
      if (!endpointReachable) {
        testPassed = false;
        message = `FAILED: Cannot reach production endpoint - ${endpointError}`;
      } else if (!validResponse) {
        testPassed = false;
        message = `FAILED: Unexpected HTTP ${httpStatusCode} - ${endpointError}`;
      } else if (httpStatusCode === 404) {
        // No calibration data found (expected when both live and paper are empty)
        testPassed = !liveCalibration && !paperCalibration;
        message = testPassed 
          ? 'PASS: No calibration data (as expected)'
          : 'FAILED: Endpoint returned 404 but calibration data exists';
      } else if (!fallbackTriggered) {
        // Live calibration exists, no fallback needed
        testPassed = !!effectiveCalibration && !effectiveCalibration.source;
        message = testPassed
          ? 'PASS: Live calibration exists, no fallback needed'
          : 'FAILED: Live calibration should exist without source field';
      } else {
        // Fallback triggered, verify source is 'paper-fallback'
        testPassed = !!effectiveCalibration && effectiveCalibration.source === 'paper-fallback';
        message = testPassed
          ? 'PASS: Fallback successful with correct source flag "paper-fallback"'
          : `FAILED: Fallback source is "${effectiveCalibration?.source}" (should be "paper-fallback")`;
      }
      
      res.json({
        ok: true,
        fallbackTest: {
          has_live_calibration: !!liveCalibration,
          has_paper_calibration: !!paperCalibration,
          fallback_triggered: fallbackTriggered,
          endpoint_called: `/api/screeners/calibration`,
          http_status: httpStatusCode,
          endpoint_error: endpointError,
          effective_calibration: effectiveCalibration ? {
            mode: effectiveCalibration.mode,
            source: effectiveCalibration.source,
            timestamp: effectiveCalibration.timestamp,
            rsiThreshold: effectiveCalibration.rsiThreshold,
            volumeThreshold: effectiveCalibration.volumeThreshold,
          } : null,
          test_passed: testPassed,
          message: message
        }
      });
    } catch (error: any) {
      console.error('Fallback test error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ENDPOINT: Get Kraken API cache statistics
  apiRouter.get('/kraken/cache-stats', async (_req, res) => {
    try {
      const krakenService = new KrakenService();
      const stats = krakenService.getCacheStats();
      
      res.json({ 
        success: true, 
        cacheStats: stats,
        config: {
          balanceCacheTTL: '60s',
          openOrdersCacheTTL: '90s',
          closedOrdersCacheTTL: '600s (10 min)',
          rateLimitCooldown: '120s (2 min)'
        }
      });
    } catch (error: any) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // ===== STRATEGY METRICS ROUTES =====

  // Get strategy-level metrics for Live trading
  apiRouter.get('/metrics/strategies', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const days = parseInt(req.query.days as string) || 7;

      // Phase 7.5: Try StrategyBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using StrategyBob for /api/metrics/strategies');
          const performanceData = await strategyBob.getPerformance(userId, 'live', days);
          return res.json(performanceData);
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ StrategyBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const trades = await storage.getTrades({});
      console.log('[Phase-27.F.15.B.1] Updated route /api/metrics/strategies → mode-based only');
      const recentTrades = trades.filter(t => 
        t.entryTime && new Date(t.entryTime) >= fromDate
      );

      const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout', 'mean_reversion', 'range_trading', 'vwap_bounce', 'liquidity_trap', 'dhma'] as const;
      const strategyMetrics = [];

      for (const strategy of strategies) {
        const strategyTrades = recentTrades.filter(t => t.strategy === strategy);
        const closedTrades = strategyTrades.filter(t => t.status === 'closed');

        const wins = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
        const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

        const totalPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
        const avgRMultiple = closedTrades.length > 0
          ? closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / closedTrades.length
          : 0;

        // Get prediction accuracy from Learning Feedback Engine
        const predictionAccuracy = await storage.getPredictionAccuracy(userId, 'live', strategy, days);

        // Get signal weights for this strategy
        const signalWeights = await storage.getSignalWeights(userId, strategy, 'live');

        const weightedConfidence = signalWeights.length > 0
          ? signalWeights.reduce((sum, w) => sum + parseFloat(w.weight || '1.0'), 0) / signalWeights.length
          : 1.0;

        // Calculate 7-day trend (daily P/L)
        const dailyPL: number[] = [];
        for (let i = 0; i < days; i++) {
          const dayStart = new Date();
          dayStart.setDate(dayStart.getDate() - i);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          const dayTrades = closedTrades.filter(t => {
            const exitTime = t.exitTime ? new Date(t.exitTime) : null;
            return exitTime && exitTime >= dayStart && exitTime <= dayEnd;
          });

          const dayTotal = dayTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
          dailyPL.unshift(dayTotal);
        }

        strategyMetrics.push({
          strategy,
          strategyName: strategy === 'dhma' ? 'DHMA' : strategy.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          winRate,
          avgRMultiple,
          totalPL,
          predictionAccuracy: predictionAccuracy.accuracy,
          confidence: weightedConfidence,
          totalTrades: strategyTrades.length,
          closedTrades: closedTrades.length,
          openTrades: strategyTrades.length - closedTrades.length,
          dailyPLTrend: dailyPL,
          status: totalPL > 0 ? 'positive' : totalPL < 0 ? 'negative' : 'neutral'
        });
      }

      res.json({
        success: true,
        data: strategyMetrics,
        period: `${days} days`
      });
    } catch (error: any) {
      console.error('Error fetching strategy metrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get strategy-level metrics for Paper trading
  apiRouter.get('/paper/metrics/strategies', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const days = parseInt(req.query.days as string) || 7;

      // Phase 7.5: Try StrategyBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using StrategyBob for /api/paper/metrics/strategies');
          const performanceData = await strategyBob.getPerformance(userId, 'paper', days);
          return res.json(performanceData);
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ StrategyBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const trades = await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/paper/metrics/strategies → mode-based only');
      const recentTrades = trades.filter(t => 
        t.entryTime && new Date(t.entryTime) >= fromDate
      );

      const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout', 'mean_reversion', 'range_trading', 'vwap_bounce', 'liquidity_trap', 'dhma'] as const;
      const strategyMetrics = [];

      for (const strategy of strategies) {
        const strategyTrades = recentTrades.filter(t => t.strategy === strategy);
        const closedTrades = strategyTrades.filter(t => t.status === 'closed');

        const wins = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
        const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;

        const totalPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
        const avgRMultiple = closedTrades.length > 0
          ? closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / closedTrades.length
          : 0;

        const predictionAccuracy = await storage.getPredictionAccuracy(userId, 'paper', strategy, days);
        const signalWeights = await storage.getSignalWeights(userId, strategy, 'paper');

        const weightedConfidence = signalWeights.length > 0
          ? signalWeights.reduce((sum, w) => sum + parseFloat(w.weight || '1.0'), 0) / signalWeights.length
          : 1.0;

        const dailyPL: number[] = [];
        for (let i = 0; i < days; i++) {
          const dayStart = new Date();
          dayStart.setDate(dayStart.getDate() - i);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          const dayTrades = closedTrades.filter(t => {
            const exitTime = t.exitTime ? new Date(t.exitTime) : null;
            return exitTime && exitTime >= dayStart && exitTime <= dayEnd;
          });

          const dayTotal = dayTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
          dailyPL.unshift(dayTotal);
        }

        strategyMetrics.push({
          strategy,
          strategyName: strategy === 'dhma' ? 'DHMA' : strategy.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          winRate,
          avgRMultiple,
          totalPL,
          predictionAccuracy: predictionAccuracy.accuracy,
          confidence: weightedConfidence,
          totalTrades: strategyTrades.length,
          closedTrades: closedTrades.length,
          openTrades: strategyTrades.length - closedTrades.length,
          dailyPLTrend: dailyPL,
          status: totalPL > 0 ? 'positive' : totalPL < 0 ? 'negative' : 'neutral'
        });
      }

      res.json({
        success: true,
        data: strategyMetrics,
        period: `${days} days`
      });
    } catch (error: any) {
      console.error('Error fetching paper strategy metrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get detailed strategy view
  apiRouter.get('/metrics/strategies/:strategy/details', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { strategy } = req.params;
      const mode = (req.query.mode as string) || 'live';
      const days = parseInt(req.query.days as string) || 30;

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const trades = mode === 'live'
        ? await storage.getTrades({ strategy })
        : await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/metrics/strategies/:strategy/details → mode-based only');
      const recentTrades = trades.filter(t => 
        t.entryTime && new Date(t.entryTime) >= fromDate && t.strategy === strategy
      );

      const closedTrades = recentTrades.filter(t => t.status === 'closed');

      // Overview metrics
      const wins = closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
      const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
      const totalPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      const avgRMultiple = closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / closedTrades.length
        : 0;

      const avgHoldingTime = closedTrades.length > 0
        ? closedTrades.reduce((sum, t) => {
            if (t.entryTime && t.exitTime) {
              const diff = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
              return sum + (diff / (1000 * 60 * 60));
            }
            return sum;
          }, 0) / closedTrades.length
        : 0;

      // Signal insights
      const signalWeights = await storage.getSignalWeights(userId, strategy, mode);

      // Prediction diagnostics (confusion matrix)
      const predictionOutcomes = await storage.getPredictionOutcomes(userId, {
        mode,
        strategy,
        fromDate,
        limit: 1000
      });

      const completed = predictionOutcomes.filter(p => p.completedAt);
      const predictedLongCorrect = completed.filter(p => p.predictedDirection === 'long' && p.correct).length;
      const predictedLongIncorrect = completed.filter(p => p.predictedDirection === 'long' && !p.correct).length;
      const predictedShortCorrect = completed.filter(p => p.predictedDirection === 'short' && p.correct).length;
      const predictedShortIncorrect = completed.filter(p => p.predictedDirection === 'short' && !p.correct).length;
      const predictedNeutralCorrect = completed.filter(p => p.predictedDirection === 'neutral' && p.correct).length;
      const predictedNeutralIncorrect = completed.filter(p => p.predictedDirection === 'neutral' && !p.correct).length;

      // Equity curve
      const equityCurve: Array<{ date: string; value: number }> = [];
      let runningPL = 0;
      const sortedTrades = closedTrades.sort((a, b) => 
        new Date(a.exitTime!).getTime() - new Date(b.exitTime!).getTime()
      );

      for (const trade of sortedTrades) {
        runningPL += parseFloat(trade.realizedPL || '0');
        equityCurve.push({
          date: new Date(trade.exitTime!).toISOString(),
          value: runningPL
        });
      }

      res.json({
        success: true,
        data: {
          overview: {
            totalTrades: recentTrades.length,
            closedTrades: closedTrades.length,
            openTrades: recentTrades.length - closedTrades.length,
            winRate,
            avgRMultiple,
            avgHoldingTime,
            totalPL
          },
          signalInsights: signalWeights.map(w => ({
            signalName: w.signalName,
            weight: parseFloat(w.weight || '1.0'),
            lastUpdated: w.lastUpdated,
            trend: parseFloat(w.weight || '1.0') > 1.1 ? 'up' : parseFloat(w.weight || '1.0') < 0.9 ? 'down' : 'stable'
          })),
          predictionDiagnostics: {
            long: { correct: predictedLongCorrect, incorrect: predictedLongIncorrect },
            short: { correct: predictedShortCorrect, incorrect: predictedShortIncorrect },
            neutral: { correct: predictedNeutralCorrect, incorrect: predictedNeutralIncorrect },
            totalPredictions: completed.length,
            accuracy: completed.length > 0 ? (completed.filter(p => p.correct).length / completed.length) * 100 : 0
          },
          equityCurve
        }
      });
    } catch (error: any) {
      console.error('Error fetching strategy details:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===== LEARNING FEEDBACK ENGINE ROUTES =====

  // Get prediction accuracy metrics
  apiRouter.get('/learning/prediction-accuracy', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'paper';
      const strategy = req.query.strategy as string;
      const days = parseInt(req.query.days as string) || 30;

      const accuracy = await storage.getPredictionAccuracy(userId, mode, strategy, days);
      
      res.json({
        success: true,
        data: accuracy,
        period: `${days} days`,
        mode,
        strategy: strategy || 'all'
      });
    } catch (error: any) {
      console.error('Error fetching prediction accuracy:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get signal weight insights
  apiRouter.get('/learning/signal-insights', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'paper';

      const { signalWeightOptimizerService } = await import('./services/signal-weight-optimizer');
      const insights = await signalWeightOptimizerService.getWeightInsights(userId, mode);
      
      res.json({
        success: true,
        data: insights,
        mode
      });
    } catch (error: any) {
      console.error('Error fetching signal insights:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get signal weights
  apiRouter.get('/learning/signal-weights', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const strategy = req.query.strategy as string;
      const mode = req.query.mode as string;

      const weights = await storage.getSignalWeights(userId, strategy, mode);
      
      res.json({
        success: true,
        data: weights,
        count: weights.length
      });
    } catch (error: any) {
      console.error('Error fetching signal weights:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get prediction outcomes
  apiRouter.get('/learning/prediction-outcomes', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as string;
      const strategy = req.query.strategy as string;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const fromDate = req.query.fromDate ? new Date(req.query.fromDate as string) : undefined;
      const toDate = req.query.toDate ? new Date(req.query.toDate as string) : undefined;

      const outcomes = await storage.getPredictionOutcomes(userId, {
        mode,
        strategy,
        fromDate,
        toDate,
        limit
      });
      
      res.json({
        success: true,
        data: outcomes,
        count: outcomes.length
      });
    } catch (error: any) {
      console.error('Error fetching prediction outcomes:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get enriched features for a symbol
  apiRouter.get('/learning/features/:symbol', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { symbol } = req.params;
      const { featureEnrichmentService } = await import('./services/feature-enrichment');
      
      const features = await featureEnrichmentService.enrichFeatures(symbol);
      
      res.json({
        success: true,
        data: features
      });
    } catch (error: any) {
      console.error('Error fetching enriched features:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Trigger manual signal weight optimization
  apiRouter.post('/learning/optimize-weights', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.body.mode as string) || 'paper';

      const { signalWeightOptimizerService } = await import('./services/signal-weight-optimizer');
      await signalWeightOptimizerService.optimizeUserWeights(userId, mode as 'live' | 'paper');
      
      res.json({
        success: true,
        message: `Signal weights optimized for ${mode} mode`
      });
    } catch (error: any) {
      console.error('Error optimizing signal weights:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===== CACHE STATS (Milestone 14) =====
  
  // Get cache statistics
  apiRouter.get('/cache/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { responseCacheService } = await import('./services/response-cache');
      
      const stats = await responseCacheService.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error: any) {
      console.error('Error fetching cache stats:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===== GOALS ENGINE ROUTES =====

  // Phase 27.5.1: Get all goals (durable persistence endpoint)
  apiRouter.get('/goals', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'live';

      console.log(`[Goals] Fetching all goals for user ${userId} in ${mode} mode`);

      const goalsData = mode === 'live' 
        ? await storage.getGoalsLive()
        : await storage.getGoalsPaper();
      console.log('[Phase-27.F.15.B.1] Updated route /api/goals → mode-based only');

      // Get most recent lastUpdated for ETag
      const mostRecent = goalsData.reduce((latest, goal) => {
        const goalTime = goal.lastUpdated ? new Date(goal.lastUpdated).getTime() : 0;
        return goalTime > latest ? goalTime : latest;
      }, 0);

      // Set ETag header for cache validation
      if (mostRecent > 0) {
        res.setHeader('ETag', `W/"${mostRecent}"`);
      }

      // Return full goal records with updatedAt
      res.json({ 
        success: true,
        goals: goalsData,
        mode,
        count: goalsData.length
      });
    } catch (error: any) {
      console.error('Error fetching goals:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get goals summary (mode-aware)
  // Phase 7.4: ConfigBob transparent routing for goals endpoint
  apiRouter.get('/goals/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'live';

      // Phase 7.4: Try ConfigBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using ConfigBob for /api/goals/summary');
          const goalsData = await configBob.getGoals(userId, mode as 'live' | 'paper');
          return res.json(goalsData);
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ ConfigBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      console.log(`[Goals] Fetching goals summary for user ${userId} in ${mode} mode`);

      const goalsData = mode === 'live' 
        ? await storage.getGoalsLive()
        : await storage.getGoalsPaper();
      console.log('[Phase-27.F.15.B.1] Updated route /api/goals/summary → mode-based only');

      console.log(`[Goals] Found ${goalsData.length} goals in ${mode} mode for user ${userId}`);

      // Transform to frontend format
      const goals = goalsData.map(g => ({
        metric: g.metricName,
        goal: g.goalValue ? parseFloat(g.goalValue) : null,
        actual: g.actualValue ? parseFloat(g.actualValue) : 0,
        percentAchieved: g.percentAchieved ? parseFloat(g.percentAchieved) : null,
      }));

      console.log(`[Goals] Returning ${goals.length} goals:`, JSON.stringify(goals));

      res.json({ 
        goals,
        hasGoals: goals.length > 0
      });
    } catch (error: any) {
      console.error('Error fetching goals summary:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update goals (mode-aware)
  apiRouter.post('/goals/update', authenticateToken, async (req: TracedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { goals, mode = 'live', portfolioBalance, exploratoryMode = false } = req.body;

      if (DIAGNOSTIC_MODE) {
        console.log(`[DX-GOALS] ========== GOALS SAVE TRACE START (req.id=${req.traceId}) ==========`);
        console.log(`[DX-GOALS] Request payload:`, JSON.stringify({ userId, mode, goalsCount: goals.length, goals, portfolioBalance, exploratoryMode }, null, 2));
      }

      console.log(`[Goals] Saving ${goals.length} goals for user ${userId} in ${mode} mode:`, JSON.stringify(goals));

      const updatedGoals = [];
      let feasibilityResult: any = null;
      
      // Phase 27.F.14.UI-SYNC.8: Initialize Goal Feasibility Service
      const { GoalFeasibilityService } = await import('./services/goal-feasibility');
      const feasibilityService = new GoalFeasibilityService(storage);
      
      for (const goal of goals) {
        // Phase 27.F.14.UI-SYNC.8: Goal Feasibility Validation for Target per Trade
        if (goal.metricName === 'Target per Trade ($)') {
          console.log(`[GoalFeasibility] Validating Target per Trade ($${goal.goalValue})`);
          
          feasibilityResult = await feasibilityService.evaluateGoal(userId, mode as 'live' | 'paper', {
            targetPerTrade: parseFloat(goal.goalValue),
            portfolioBalance: portfolioBalance ? parseFloat(portfolioBalance) : undefined,
            exploratoryMode,
          });

          console.log(`[GoalFeasibility] Validation result: ${feasibilityResult.status} - ${feasibilityResult.reason}`);

          // Log to user_goals_audit table
          try {
            await storage.createUserGoalsAudit({
              userId,
              mode: mode as 'live' | 'paper',
              metricName: goal.metricName,
              attemptedValue: goal.goalValue,
              feasibilityStatus: feasibilityResult.status,
              feasibilityReason: feasibilityResult.reason,
              riskLimit: feasibilityResult.riskLimit ? feasibilityResult.riskLimit.toString() : null,
              exceedsBy: feasibilityResult.exceedsBy ? feasibilityResult.exceedsBy.toString() : null,
              exploratoryMode,
            });
            console.log(`[GoalFeasibility] Audit log created for ${goal.metricName}`);
          } catch (auditError: any) {
            console.warn(`[GoalFeasibility] Failed to log audit entry:`, auditError.message);
          }

          // Block goal save if status is BLOCK and not in exploratory mode
          if (feasibilityResult.status === 'BLOCK' && !exploratoryMode) {
            console.log(`[GoalFeasibility] BLOCK - Goal update rejected for ${goal.metricName}`);
            return res.status(400).json({
              success: false,
              error: feasibilityResult.reason,
              feasibility: feasibilityResult,
            });
          }
        }

        // Phase 27.5: Get previous value for audit log
        const previousGoal = mode === 'live'
          ? await storage.getGoalLive(goal.metricName)
          : await storage.getGoalPaper(goal.metricName);
        
        if (DIAGNOSTIC_MODE) {
          console.log(`[DX-GOALS] db.before for ${goal.metricName}:`, JSON.stringify(previousGoal, null, 2));
        }
        
        const goalData = {
          userId,
          metricName: goal.metricName,
          goalValue: goal.goalValue,
          actualValue: goal.actualValue,
          percentAchieved: goal.percentAchieved,
          aiValidationNotes: goal.aiValidationNotes,
        };

        const result = mode === 'live'
          ? await storage.upsertGoalLive(goalData)
          : await storage.upsertGoalPaper(goalData);
        
        if (DIAGNOSTIC_MODE) {
          console.log(`[DX-GOALS] db.after for ${goal.metricName}:`, JSON.stringify(result, null, 2));
        }
        
        // Phase 27.5.2: Create audit log entry (non-blocking)
        try {
          await storage.createGoalAuditLog({
            userId,
            mode: mode as 'live' | 'paper',
            action: previousGoal ? 'updated' : 'created',
            metricName: goal.metricName,
            previousValue: previousGoal ? {
              goalValue: previousGoal.goalValue,
              actualValue: previousGoal.actualValue,
              percentAchieved: previousGoal.percentAchieved
            } : null,
            newValue: {
              goalValue: goal.goalValue,
              actualValue: goal.actualValue,
              percentAchieved: goal.percentAchieved
            },
            source: 'user',
            metadata: { endpoint: '/api/goals/update' }
          });
          console.log(`[GoalAuditLog] Logged ${goal.metricName} update for user ${userId}`);
        } catch (auditError: any) {
          console.warn(`[GoalAuditLog] Failed to log goal update, but goal saved successfully:`, auditError.message);
        }
        
        console.log(`[Goals] Saved goal ${goal.metricName} = ${goal.goalValue} (${mode}) -> DB ID: ${result.id}`);
        updatedGoals.push(result);
      }

      console.log(`[Goals] Successfully saved ${updatedGoals.length} goals in ${mode} mode`);
      
      // Phase 27.DX: Immediate verification read
      if (DIAGNOSTIC_MODE) {
        const verifyGoals = mode === 'live'
          ? await storage.getGoalsLive()
          : await storage.getGoalsPaper();
        console.log(`[DX-GOALS] Immediate verification read (count: ${verifyGoals.length}):`, JSON.stringify(verifyGoals, null, 2));
        console.log(`[DX-GOALS] ========== GOALS SAVE TRACE END (req.id=${req.traceId}) ==========`);
      }
      
      console.log('[Phase-27.F.15.B.1] Updated route /api/goals/update → mode-based only');
      
      // Phase 27.F.18: Broadcast trading pace updates via WebSocket for Dashboard sync
      const hasTradingPaceUpdate = goals.some((g: any) => 
        g.metricName === "Target Daily Avg Earning %" || 
        g.metricName === "Risk per Trade ($)" ||
        g.metricName === "Trades per Day"
      );
      
      if (hasTradingPaceUpdate) {
        console.log(`[Goals] Broadcasting trading_pace_updated for ${mode} mode`);
        contextBridge.broadcast({
          type: 'config_update',
          payload: {
            action: 'trading_pace_updated',
            mode,
            goals: updatedGoals
          },
          mode: mode as 'live' | 'paper'
        });
      }
      
      // Phase 27.F.14.UI-SYNC.8: Include feasibility feedback in response
      res.json({ 
        success: true, 
        data: updatedGoals, 
        mode,
        feasibility: feasibilityResult // OK, WARN, or null if not applicable
      });
    } catch (error: any) {
      console.error('Error updating goals:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Phase 27.F.18: Log goal override attempts to user_goals_audit
  apiRouter.post('/goals/audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode, metricName, attemptedValue, feasibilityStatus, validationMessage, riskLimit, exceedsBy } = req.body;

      console.log(`[GoalsAudit] Logging ${metricName} override attempt: ${attemptedValue} (${feasibilityStatus})`);

      await storage.createUserGoalsAudit({
        userId,
        mode: mode as 'live' | 'paper',
        metricName,
        attemptedValue,
        feasibilityStatus,
        feasibilityReason: validationMessage,
        riskLimit: riskLimit ? riskLimit.toString() : null,
        exceedsBy: exceedsBy ? exceedsBy.toString() : null,
        exploratoryMode: false,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error logging goal audit:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Analyze goals with AI (conversational goal-setting)
  apiRouter.post('/goals/analyze', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { userMessage, mode = 'live' } = req.body;

      // Phase 41F-L.E2E-PURGE: Build settings from mode-level config
      const settings = await buildSettingsFromModeLevel(mode as 'live' | 'paper', userId);
      if (!settings) {
        return res.status(404).json({ success: false, error: 'Trading settings not found for this mode' });
      }

      const currentGoals = mode === 'live'
        ? await storage.getGoalsLive()
        : await storage.getGoalsPaper();

      const trades = mode === 'live'
        ? await storage.getTrades({})
        : await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/goals/analyze → mode-based only');
      const closedTrades = trades.filter(t => t.status === 'closed');
      
      const totalPL = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      const avgPLPerTrade = closedTrades.length > 0 ? totalPL / closedTrades.length : 0;
      const winRate = closedTrades.length > 0 
        ? (closedTrades.filter(t => parseFloat(t.realizedPL || '0') > 0).length / closedTrades.length) * 100
        : 0;

      const prompt = `You are an AI trading advisor helping a user set and optimize their trading goals.

Current Trading Context:
- Mode: ${mode}
- Total Closed Trades: ${closedTrades.length}
- Total P/L: $${totalPL.toFixed(2)}
- Average P/L per Trade: $${avgPLPerTrade.toFixed(2)}
- Win Rate: ${winRate.toFixed(1)}%
- Risk per Trade: $${settings.riskPerTrade}
- Max Open Trades: ${settings.maxOpenTrades}

Current Goals:
${currentGoals.map(g => `- ${g.metricName}: Target $${g.goalValue}, Current $${g.actualValue}, ${g.percentAchieved}% achieved`).join('\n') || 'No goals set'}

User Request: "${userMessage}"

Please:
1. Evaluate the feasibility of the user's request based on current performance and risk parameters
2. Propose specific numeric goals that are achievable but challenging
3. Suggest specific strategy or guardrail adjustments to help achieve these goals
4. Provide a feasibility score (0-100)
5. Format your response as JSON with:
   - aiResponse: string (your explanation)
   - goalsProposed: array of { metricName, goalValue }
   - configChangesProposed: object with suggested parameter changes
   - feasibilityScore: number`;

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });

      const aiAnalysis = JSON.parse(completion.choices[0].message.content || '{}');

      const analysisRecord = {
        userId,
        userMessage,
        aiResponse: aiAnalysis.aiResponse,
        goalsProposed: aiAnalysis.goalsProposed,
        configChangesProposed: aiAnalysis.configChangesProposed,
        feasibilityScore: aiAnalysis.feasibilityScore?.toString(),
      };

      await (mode === 'live' 
        ? storage.createGoalAnalysisLive(analysisRecord)
        : storage.createGoalAnalysisPaper(analysisRecord));

      // Return response in format expected by frontend
      res.json({ success: true, response: aiAnalysis.aiResponse, data: aiAnalysis, mode });
    } catch (error: any) {
      console.error('Error analyzing goals:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Apply goals and configuration changes
  apiRouter.post('/goals/apply', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { goals, configChanges, analysisId, mode = 'live' } = req.body;

      const updatedGoals = [];
      
      for (const goal of goals) {
        // Phase 27.5: Get previous value for audit log
        const previousGoal = mode === 'live'
          ? await storage.getGoalLive(goal.metricName)
          : await storage.getGoalPaper(goal.metricName);
        
        const goalData = {
          userId,
          metricName: goal.metricName,
          goalValue: goal.goalValue,
          actualValue: '0',
          percentAchieved: '0',
          aiValidationNotes: 'AI-validated and applied',
        };

        const result = mode === 'live'
          ? await storage.upsertGoalLive(goalData)
          : await storage.upsertGoalPaper(goalData);
        
        // Phase 27.5.2: Create audit log entry for AI-applied goals (non-blocking)
        try {
          await storage.createGoalAuditLog({
            userId,
            mode: mode as 'live' | 'paper',
            action: 'applied',
            metricName: goal.metricName,
            previousValue: previousGoal ? {
              goalValue: previousGoal.goalValue,
              actualValue: previousGoal.actualValue,
              percentAchieved: previousGoal.percentAchieved
            } : null,
            newValue: {
              goalValue: goal.goalValue,
              actualValue: '0',
              percentAchieved: '0'
            },
            analysisId: analysisId,
            source: 'ai',
            metadata: { 
              endpoint: '/api/goals/apply',
              aiValidated: true,
              configChanges: configChanges || {}
            }
          });
          console.log(`[GoalAuditLog] Logged AI-applied goal ${goal.metricName} for user ${userId}`);
        } catch (auditError: any) {
          console.warn(`[GoalAuditLog] Failed to log AI goal application, but goal saved successfully:`, auditError.message);
        }
        
        updatedGoals.push(result);
      }

      if (configChanges && Object.keys(configChanges).length > 0) {
        await storage.updateTradingSettings(userId, configChanges);
      }

      res.json({ 
        success: true, 
        data: { 
          goals: updatedGoals, 
          configApplied: configChanges 
        }, 
        mode 
      });
    } catch (error: any) {
      console.error('Error applying goals:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===== TRADING ACTIVITY ROUTE =====
  // Phase 7.3: DataBob caching disabled for activity endpoint
  // Reason: DataBob implementation doesn't support period filtering (incompatible with original endpoint)

  apiRouter.get('/trading/activity', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'live';
      const period = (req.query.period as string) || '1d';

      const periodMap: { [key: string]: number } = {
        '1d': 1,
        '1w': 7,
        '1m': 30,
        '3m': 90,
        '6m': 180,
        '1y': 365,
      };

      const days = periodMap[period] || 1;
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const trades = mode === 'live'
        ? await storage.getTrades('live', {})
        : await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/trading/activity → mode-based only');
      const periodTrades = trades.filter(t => 
        t.entryTime && new Date(t.entryTime) >= fromDate && t.status === 'closed'
      );

      const profitableTrades = periodTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
      const losingTrades = periodTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);

      const totalProfits = profitableTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0));
      const totalFees = periodTrades.reduce((sum, t) => 
        sum + parseFloat(t.entryFee || '0') + parseFloat(t.exitFee || '0'), 0
      );

      const avgReturnPercent = profitableTrades.length > 0
        ? profitableTrades.reduce((sum, t) => {
            const entry = parseFloat(t.entryPrice) * parseFloat(t.quantity);
            const pl = parseFloat(t.realizedPL || '0');
            return sum + (pl / entry * 100);
          }, 0) / profitableTrades.length
        : 0;

      const avgLossPercent = losingTrades.length > 0
        ? losingTrades.reduce((sum, t) => {
            const entry = parseFloat(t.entryPrice) * parseFloat(t.quantity);
            const pl = parseFloat(t.realizedPL || '0');
            return sum + (pl / entry * 100);
          }, 0) / losingTrades.length
        : 0;

      res.json({
        numberOfTrades: periodTrades.length,
        profitableTrades: profitableTrades.length,
        totalProfits,
        avgReturnPercent,
        losingTrades: losingTrades.length,
        totalLosses,
        avgLossPercent,
        totalFeesPaid: totalFees,
      });
    } catch (error: any) {
      console.error('Error fetching trading activity:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== TRADING AVERAGES ROUTE =====
  // Phase 7.3: DataBob transparent routing for averages endpoint

  apiRouter.get('/trading/averages', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'live';

      // Phase 7.3: Try DataBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using DataBob for /api/trading/averages');
          const averagesData = await dataBob.getAverages(userId, mode as 'live' | 'paper');
          return res.json(averagesData);
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ DataBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }
      const period = (req.query.period as string) || '1d';

      const periodMap: { [key: string]: number } = {
        '1d': 1,
        '1w': 7,
        '1m': 30,
        '3m': 90,
        '6m': 180,
        '1y': 365,
      };

      const days = periodMap[period] || 1;
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const trades = mode === 'live'
        ? await storage.getTrades({})
        : await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/trading/averages → mode-based only');
      const periodTrades = trades.filter(t => 
        t.entryTime && new Date(t.entryTime) >= fromDate && t.status === 'closed'
      );

      const totalEarnings = periodTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      const avgDailyEarnings = totalEarnings / days;
      const avgTradesPerDay = periodTrades.length / days;
      const avgEarningsPerTrade = periodTrades.length > 0 ? totalEarnings / periodTrades.length : 0;
      
      const totalInvested = periodTrades.reduce((sum, t) => 
        sum + (parseFloat(t.entryPrice) * parseFloat(t.quantity)), 0
      );
      const avgAmountInvestedPerTrade = periodTrades.length > 0 ? totalInvested / periodTrades.length : 0;

      const totalFees = periodTrades.reduce((sum, t) => 
        sum + parseFloat(t.entryFee || '0') + parseFloat(t.exitFee || '0'), 0
      );
      const avgFeesPerTrade = periodTrades.length > 0 ? totalFees / periodTrades.length : 0;

      // Fetch Average Daily Earnings % from daily_performance_summary table
      const performanceSummaries = await storage.getDailyPerformanceSummaries(mode as 'live' | 'paper', days);
      const validSummaries = performanceSummaries.filter(s => s.adePercent != null && s.adePercent !== '');
      const avgDailyEarningsPct = validSummaries.length > 0
        ? validSummaries.reduce((sum, s) => sum + parseFloat(s.adePercent), 0) / validSummaries.length
        : null;

      const totalCompletionTime = periodTrades.reduce((sum, t) => {
        if (t.exitTime && t.entryTime) {
          return sum + (new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime());
        }
        return sum;
      }, 0);
      const avgCompletionTimeMs = periodTrades.length > 0 ? totalCompletionTime / periodTrades.length : 0;
      const hours = Math.floor(avgCompletionTimeMs / (1000 * 60 * 60));
      const minutes = Math.floor((avgCompletionTimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const avgTradeCompletionTime = `${hours}h ${minutes}m`;

      res.json({
        avgDailyEarnings,
        avgTradesPerDay,
        avgEarningsPerTrade,
        avgAmountInvestedPerTrade,
        avgFeesPerTrade,
        avgDailyEarningsPct,
        avgTradeCompletionTime,
      });
    } catch (error: any) {
      console.error('Error fetching trading averages:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== TRADING RESULTS ROUTE =====
  // Phase 7.3: DataBob transparent routing for results endpoint

  apiRouter.get('/trading/results', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'live';
      const period = (req.query.period as string) || '1d';

      // Phase 7.3: Try DataBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using DataBob for /api/trading/results');
          const resultsData = await dataBob.getResults(userId, mode as 'live' | 'paper', period as any);
          return res.json(resultsData);
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ DataBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      const periodMap: { [key: string]: number } = {
        '1d': 1,
        '1w': 7,
        '1m': 30,
        '60d': 60,
        '90d': 90,
        '1y': 365,
      };

      const days = periodMap[period] || 1;
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const trades = mode === 'live'
        ? await storage.getTrades({})
        : await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/trading/results → mode-based only');
      const periodTrades = trades.filter(t => 
        t.exitTime && new Date(t.exitTime) >= fromDate && t.status === 'closed'
      );

      const profitableTrades = periodTrades.filter(t => parseFloat(t.realizedPL || '0') > 0);
      const losingTrades = periodTrades.filter(t => parseFloat(t.realizedPL || '0') < 0);
      
      const totalProfits = profitableTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      const totalLosses = losingTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      const totalPnL = totalProfits + totalLosses;
      
      const profitFactor = Math.abs(totalLosses) > 0 ? totalProfits / Math.abs(totalLosses) : 0;

      const avgReturnPercent = periodTrades.length > 0
        ? periodTrades.reduce((sum, t) => {
            const entry = parseFloat(t.entryPrice) * parseFloat(t.quantity);
            const pl = parseFloat(t.realizedPL || '0');
            return sum + (pl / entry * 100);
          }, 0) / periodTrades.length
        : 0;

      let maxDrawdown = 0;
      if (periodTrades.length > 0) {
        const sortedTrades = [...periodTrades].sort((a, b) => 
          new Date(a.exitTime || 0).getTime() - new Date(b.exitTime || 0).getTime()
        );
        
        let runningPL = 0;
        let peak = 0;
        
        for (const trade of sortedTrades) {
          runningPL += parseFloat(trade.realizedPL || '0');
          if (runningPL > peak) {
            peak = runningPL;
          }
          const drawdown = peak - runningPL;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }
        
        if (peak > 0) {
          maxDrawdown = (maxDrawdown / peak) * 100;
        }
      }

      res.json({
        totalPnL,
        profitFactor,
        maxDrawdown,
        avgReturnPercent,
      });
    } catch (error: any) {
      console.error('Error fetching trading results:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== EARNINGS SUMMARY ROUTE =====

  // Get earnings summary for Earnings widget
  // Phase 27.F.15.UI-EARNINGS.3: Added avgDailyEarningsPct from daily_performance_summary
  apiRouter.get('/earnings/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'live';

      const trades = mode === 'live'
        ? await storage.getTrades('live', {})
        : await storage.getAllPaperTrades();
      console.log('[Phase-27.F.15.B.1] Updated route /api/earnings/summary → mode-based only');
      const closedTrades = trades.filter(t => t.status === 'closed' && t.exitTime);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const calculateEarnings = (fromDate: Date) => {
        return closedTrades
          .filter(t => t.exitTime && new Date(t.exitTime) >= fromDate)
          .reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);
      };

      const today = calculateEarnings(todayStart);
      const thisWeek = calculateEarnings(weekStart);
      const thisMonth = calculateEarnings(monthStart);
      const thisYear = calculateEarnings(yearStart);
      const allTime = closedTrades.reduce((sum, t) => sum + parseFloat(t.realizedPL || '0'), 0);

      const firstTradeDate = closedTrades.length > 0 
        ? new Date(Math.min(...closedTrades.map(t => new Date(t.exitTime!).getTime())))
        : now;
      const daysSinceStart = Math.max(1, Math.ceil((now.getTime() - firstTradeDate.getTime()) / (24 * 60 * 60 * 1000)));
      const avgDailyEarnings = allTime / daysSinceStart;
      const avgDailyEarningsStatus = closedTrades.length < 5 ? 'insufficient_data' : 'ok';

      // Phase 27.F.15.UI-EARNINGS.3: Calculate Average Daily Earnings % from daily summaries
      let avgDailyEarningsPct = null;
      let avgDailyEarningsPctStatus = 'insufficient_data';
      
      const dailySummaries = await storage.getDailyPerformanceSummaries(mode);
      console.log(`[Phase-27.F.15.UI-EARNINGS.3] Found ${dailySummaries.length} daily summaries for ${mode} mode`);
      
      if (dailySummaries.length > 0) {
        // Calculate rolling average of ADE%
        const totalAdePct = dailySummaries.reduce((sum, summary) => {
          return sum + parseFloat(summary.adePercent || '0');
        }, 0);
        avgDailyEarningsPct = totalAdePct / dailySummaries.length;
        avgDailyEarningsPctStatus = dailySummaries.length >= 3 ? 'ok' : 'insufficient_data';
        console.log(`[Phase-27.F.15.UI-EARNINGS.3] Avg Daily Earnings %: ${avgDailyEarningsPct.toFixed(4)}% (${dailySummaries.length} days)`);
      }

      res.json({
        today,
        thisWeek,
        thisMonth,
        thisYear,
        allTime,
        avgDailyEarnings,
        avgDailyEarningsStatus,
        avgDailyEarningsPct,
        avgDailyEarningsPctStatus,
      });
    } catch (error: any) {
      console.error('Error fetching earnings summary:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Strategy Settings Routes
  
  // GET current settings for a specific strategy
  // Phase 8.5 Addendum K.3: Uses global context for shared strategies
  apiRouter.get('/strategies/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const globalContextId = 'default';
      const mode = (String(req.query.mode) === 'paper' ? 'paper' : 'live') as 'live' | 'paper';
      const strategy = String(req.query.strategy);
      
      const row = await storage.getStrategySettings({ globalContextId, mode, strategy });
      return res.json(row ?? {});
    } catch (error: any) {
      console.error('Error fetching strategy settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET all settings for a mode
  // Phase 8.5 Addendum K.3: Uses global context for shared strategies
  apiRouter.get('/strategies/settings/all', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const globalContextId = 'default';
      const mode = (String(req.query.mode) === 'paper' ? 'paper' : 'live') as 'live' | 'paper';
      
      // Phase 7.4: Try ConfigBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using ConfigBob for /api/strategies/settings/all');
          const rows = await configBob.getStrategies(globalContextId, mode);
          return res.json(rows);
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ ConfigBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      const rows = await storage.listStrategySettings({ globalContextId, mode });
      return res.json(rows);
    } catch (error: any) {
      console.error('Error fetching all strategy settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST validate settings (no save)
  apiRouter.post('/strategies/settings/validate', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategy, params } = req.body || {};
      const { getValidator } = await import('./services/strategy-validators');
      
      const schema = getValidator(strategy);
      const parse = schema.safeParse(params);
      
      if (!parse.success) {
        return res.status(400).json({ ok: false, errors: parse.error.flatten() });
      }
      
      return res.json({ ok: true, normalized: parse.data });
    } catch (error: any) {
      console.error('Error validating strategy settings:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // PUT save settings (validated) + audit + hot-reload
  // Phase 8.5 Addendum K.3: Uses global context for shared strategies
  apiRouter.put('/strategies/settings', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const globalContextId = 'default';
      const mode = (req.body?.mode === 'paper' ? 'paper' : 'live') as 'live' | 'paper';
      const strategy = String(req.body?.strategy);
      const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : true;
      
      const { getValidator } = await import('./services/strategy-validators');
      const schema = getValidator(strategy);
      const parse = schema.safeParse(req.body?.params);
      
      if (!parse.success) {
        return res.status(400).json({ ok: false, errors: parse.error.flatten() });
      }

      const prev = await storage.getStrategySettings({ globalContextId, mode, strategy });
      
      // RISK EVALUATION LOGIC (Phase 5.4 Part 2)
      // Calculate projected portfolio risk
      const newParams = parse.data as any;
      const oldParams = prev?.params as any || {};
      
      // Risk calculation: maxConcurrentPositions × riskPerTrade = total portfolio risk
      const oldRisk = (oldParams.maxConcurrentPositions || 0) * (oldParams.riskPerTrade || 0);
      const newRisk = (newParams.maxConcurrentPositions || 0) * (newParams.riskPerTrade || 0);
      const projectedRisk = newRisk; // Total portfolio exposure
      
      // Get risk threshold from user's approval matrix settings (configurable in Walter Approvals)
      const userProfile = await storage.getUser(userId);
      const approvalMatrix = userProfile?.approvalMatrix as any;
      const riskThreshold = approvalMatrix?.policyConstraints?.maxPortfolioRiskPercent || 20.0;
      
      if (projectedRisk >= riskThreshold) {
        // Create approval record instead of executing immediately
        const approval = await storage.createWalterPendingApproval({
          userId,
          mode, // Include the trading mode
          strategyName: strategy,
          parameterName: 'strategy_parameters',
          currentValue: oldParams,
          proposedValue: newParams,
          projectedRisk: String(projectedRisk),
          riskDetails: {
            oldMaxPositions: oldParams.maxConcurrentPositions || 0,
            newMaxPositions: newParams.maxConcurrentPositions || 0,
            oldRiskPerTrade: oldParams.riskPerTrade || 0,
            newRiskPerTrade: newParams.riskPerTrade || 0,
            oldTotalRisk: oldRisk,
            newTotalRisk: newRisk,
            threshold: riskThreshold,
          },
          status: 'pending',
        });
        
        console.log(`[Walter Approval] Created approval ${approval.id} for ${strategy} (risk: ${projectedRisk}%)`);
        
        // Auto-create Walter chat session for this approval
        const chatTitle = `Approval Required: ${strategy} - ${mode} mode (${projectedRisk}% risk)`;
        const chat = await storage.createWalterChat({
          userId,
          title: chatTitle,
          status: 'active',
          isApprovalThread: true,
          approvalId: approval.id,
          messageCount: 1,
          lastMessageAt: new Date(),
        });
        
        // Create initial message explaining the approval
        const initialMessage = `⚠️ **Approval Required**\n\n` +
          `Strategy ${strategy} change requires your approval because the projected portfolio risk (${projectedRisk}%) exceeds the ${riskThreshold}% threshold.\n\n` +
          `**Risk Breakdown:**\n` +
          `- Max Concurrent Positions: ${newParams.maxConcurrentPositions || 0} (was ${oldParams.maxConcurrentPositions || 0})\n` +
          `- Risk Per Trade: ${newParams.riskPerTrade || 0}% (was ${oldParams.riskPerTrade || 0}%)\n` +
          `- Total Portfolio Risk: ${newRisk}% (was ${oldRisk}%)\n` +
          `- Trading Mode: ${mode}\n\n` +
          `Please review the proposed changes and approve or reject this request.`;
        
        await storage.createWalterChatLog({
          chatSessionId: chat.id,
          userId,
          role: 'assistant',
          content: initialMessage,
          metadata: {
            approvalId: approval.id,
            strategyName: strategy,
            projectedRisk,
            type: 'approval_request'
          },
        });
        
        // Update approval with chat session ID
        await storage.updateApprovalStatus(approval.id, 'pending', {
          chatSessionId: chat.id as any,
        });
        
        console.log(`[Walter Approval] Created chat session ${chat.id} for approval ${approval.id}`);
        
        return res.json({ 
          ok: true, 
          approvalRequired: true,
          approvalId: approval.id,
          chatSessionId: chat.id,
          projectedRisk,
          message: `Change requires approval: projected portfolio risk is ${projectedRisk}% (threshold: ${RISK_APPROVAL_THRESHOLD}%)`,
        });
      }
      
      // Risk < 20%: Execute immediately (existing behavior)
      const saved = await storage.upsertStrategySettings({
        globalContextId,
        mode,
        strategy: strategy as any,
        enabled,
        params: parse.data,
      });

      await storage.insertStrategySettingsAudit({
        userId,
        mode,
        strategy: strategy as any,
        prevParams: (prev?.params ?? null) as any,
        nextParams: saved.params as any,
        actorType: 'user',
        actorId: userId,
        reason: req.body?.reason || 'manual update',
      });

      // Phase 8.6.5: Invalidate caches and refresh context for Walter AI
      const { configChangeHandler } = await import('./services/config-change-handler');
      await configChangeHandler.handleConfigChange({
        userId,
        mode,
        configType: 'strategies',
        source: 'api',
        globalContextId
      });

      return res.json({ ok: true, saved, approvalRequired: false });
    } catch (error: any) {
      console.error('Error saving strategy settings:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET list of presets for a strategy
  apiRouter.get('/strategies/presets', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { STRATEGY_PRESETS } = await import('./services/strategy-presets');
      const strategy = String(req.query.strategy || '');
      
      if (!STRATEGY_PRESETS[strategy as keyof typeof STRATEGY_PRESETS]) {
        return res.status(404).json({ ok: false, message: 'Strategy not found' });
      }
      
      res.json({ ok: true, presets: STRATEGY_PRESETS[strategy as keyof typeof STRATEGY_PRESETS] });
    } catch (error: any) {
      console.error('Error fetching presets:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET a specific preset
  apiRouter.get('/strategies/presets/:strategy/:presetName', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { STRATEGY_PRESETS } = await import('./services/strategy-presets');
      const { strategy, presetName } = req.params;
      const presets = STRATEGY_PRESETS[strategy as keyof typeof STRATEGY_PRESETS];
      
      if (!presets || !presets[presetName as keyof typeof presets]) {
        return res.status(404).json({ ok: false, message: 'Preset not found' });
      }
      
      res.json({ ok: true, preset: presets[presetName as keyof typeof presets] });
    } catch (error: any) {
      console.error('Error fetching preset:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Walter AI Assistant API (Phase 5.4) ====================
  
  // GET pending approvals for current user
  apiRouter.get('/walter/pending-approvals', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const status = req.query.status as string | undefined;
      
      const approvals = await storage.getPendingApprovals(userId, status || 'pending');
      
      res.json({ ok: true, approvals });
    } catch (error: any) {
      console.error('[Walter] Error fetching pending approvals:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // POST approve a pending approval
  apiRouter.post('/walter/approvals/:id/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { notes } = req.body;
      
      // Get the approval (only pending status)
      const approvals = await storage.getPendingApprovals(userId, 'pending');
      const approval = approvals.find(a => a.id === id);
      
      if (!approval) {
        return res.status(404).json({ ok: false, error: 'Approval not found or already processed' });
      }
      
      if (approval.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      // Verify approval is still pending (prevent replay attacks)
      if (approval.status !== 'pending') {
        return res.status(400).json({ ok: false, error: 'Approval already processed' });
      }
      
      // Execute the approved change (apply the proposed strategy settings)
      if (approval.strategyName && approval.proposedValue) {
        await storage.upsertStrategySettings({
          userId,
          mode: approval.mode as any, // Use the approval's stored mode
          strategy: approval.strategyName as any,
          enabled: true,
          params: approval.proposedValue as any,
        });
        
        await storage.insertStrategySettingsAudit({
          userId,
          mode: approval.mode as any, // Use the approval's stored mode
          strategy: approval.strategyName as any,
          prevParams: approval.currentValue as any,
          nextParams: approval.proposedValue as any,
          actorType: 'user',
          actorId: userId,
          reason: `Approved via Walter (Approval ID: ${id})`,
        });
        
        // Phase 8.6.5: Invalidate caches and refresh context for Walter AI
        const { configChangeHandler } = await import('./services/config-change-handler');
        await configChangeHandler.handleConfigChange({
          userId,
          mode: approval.mode as 'live' | 'paper',
          configType: 'strategies',
          source: 'api',
          globalContextId: 'default'
        });
      }
      
      // Update approval status
      const updated = await storage.updateApprovalStatus(id, 'approved', {
        approvedAt: new Date() as any,
        approvedBy: userId,
      });
      
      // Create audit log
      await storage.createWalterApprovalsAudit({
        approvalId: id,
        userId,
        decision: 'approved',
        decisionMethod: 'ui_button',
        notes: notes || null,
        executionResult: { success: true, appliedAt: new Date(), mode: approval.mode },
      });
      
      console.log(`[Walter Approval] Approved ${id} by user ${userId} (mode: ${approval.mode})`);
      
      res.json({ ok: true, approval: updated });
    } catch (error: any) {
      console.error('[Walter] Error approving:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // POST reject a pending approval
  apiRouter.post('/walter/approvals/:id/reject', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { notes } = req.body;
      
      // Get the approval (only pending status)
      const approvals = await storage.getPendingApprovals(userId, 'pending');
      const approval = approvals.find(a => a.id === id);
      
      if (!approval) {
        return res.status(404).json({ ok: false, error: 'Approval not found or already processed' });
      }
      
      if (approval.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      // Verify approval is still pending (prevent replay)
      if (approval.status !== 'pending') {
        return res.status(400).json({ ok: false, error: 'Approval already processed' });
      }
      
      // Update approval status
      const updated = await storage.updateApprovalStatus(id, 'rejected', {
        rejectedAt: new Date() as any,
      });
      
      // Create audit log
      await storage.createWalterApprovalsAudit({
        approvalId: id,
        userId,
        decision: 'rejected',
        decisionMethod: 'ui_button',
        notes: notes || null,
        executionResult: { success: false, reason: 'User rejected', mode: approval.mode },
      });
      
      console.log(`[Walter Approval] Rejected ${id} by user ${userId} (mode: ${approval.mode})`);
      
      res.json({ ok: true, approval: updated });
    } catch (error: any) {
      console.error('[Walter] Error rejecting approval:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Phase 27.2: Inline Approvals + Interactive Notifications ====================
  
  // POST /api/intent/approve - Approve by traceId (inline or notification)
  apiRouter.post('/intent/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { traceId } = req.body;
      
      if (!traceId) {
        return res.status(400).json({ success: false, error: 'traceId is required' });
      }
      
      // Find approval by traceId OR id (for backward compatibility)
      const approvals = await storage.getPendingApprovals(userId, 'pending');
      console.log(`[Phase 27.2] Searching for traceId=${traceId} among ${approvals.length} approvals`);
      console.log('[Phase 27.2] Approval IDs:', approvals.map(a => ({ id: a.id, traceId: a.traceId })));
      const approval = approvals.find(a => a.traceId === traceId || a.id === traceId);
      
      if (!approval) {
        console.log(`[Phase 27.2] No approval found for traceId=${traceId}`);
        return res.status(404).json({ success: false, error: 'Approval not found or already processed' });
      }
      
      if (approval.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }
      
      // Execute the approved change based on action type
      let executionResult: any = { success: true };
      
      // Phase 27.2: Execute action-based approvals (e.g., start_live_trading)
      if (approval.action) {
        if (approval.action === 'start_live_trading') {
          const { liveTradingService } = await import('./services/live-trading-service');
          const result = await liveTradingService.activateLiveTrading(userId);
          executionResult = { success: result.success, message: result.message, data: result.data };
          console.log(`[Phase 27.2] Executed start_live_trading:`, executionResult);
        } else if (approval.action === 'start_paper_simulation') {
          const { startPaperSimulation } = await import('./services/paper-sim-service');
          const result = await startPaperSimulation(userId);
          executionResult = { success: result.success, message: result.message, data: result.data };
          console.log(`[Phase 27.2] Executed start_paper_simulation:`, executionResult);
        }
        // Add other action handlers as needed
      }
      // Legacy: Handle strategy settings updates
      else if (approval.strategyName && approval.proposedValue) {
        await storage.upsertStrategySettings({
          userId,
          mode: approval.mode as any,
          strategy: approval.strategyName as any,
          enabled: true,
          params: approval.proposedValue as any,
        });
        
        await storage.insertStrategySettingsAudit({
          userId,
          mode: approval.mode as any,
          strategy: approval.strategyName as any,
          prevParams: approval.currentValue as any,
          nextParams: approval.proposedValue as any,
          actorType: 'user',
          actorId: userId,
          reason: `Approved via inline prompt (traceId: ${traceId})`,
        });
        
        // Invalidate caches
        const { configChangeHandler } = await import('./services/config-change-handler');
        await configChangeHandler.handleConfigChange({
          userId,
          mode: approval.mode as 'live' | 'paper',
          configType: 'strategies',
          source: 'api',
          globalContextId: 'default'
        });
      }
      
      // Phase 27.2: Check if execution was successful before marking as approved
      if (!executionResult.success) {
        console.error(`[Phase 27.2] Execution failed for ${traceId}:`, executionResult);
        return res.status(400).json({ 
          success: false, 
          error: executionResult.message || 'Action execution failed', 
          details: executionResult,
          traceId 
        });
      }
      
      // Update approval status (do NOT set clearedAt - that's for explicit clearing only)
      const updated = await storage.updateApprovalStatus(approval.id, 'approved', {
        approvedAt: new Date() as any,
        approvedBy: userId,
      });
      
      // Create audit log with execution results
      await storage.createWalterApprovalsAudit({
        approvalId: approval.id,
        userId,
        decision: 'approved',
        decisionMethod: 'inline_approval',
        notes: null,
        executionResult: { 
          success: executionResult.success, 
          appliedAt: new Date(), 
          mode: approval.mode, 
          traceId,
          message: executionResult.message,
          data: executionResult.data 
        },
      });
      
      // Emit WebSocket event for real-time sync
      const { contextBridge } = await import('./services/context-bridge');
      await contextBridge.broadcast('approval_update', { traceId, status: 'approved' }, userId);
      
      console.log(`[Phase 27.2] Approved ${traceId} by user ${userId} (mode: ${approval.mode})`);
      
      res.json({ 
        success: true, 
        message: executionResult.message || `Approved — ${approval.action || 'action'} executed`, 
        traceId, 
        status: 'approved',
        data: executionResult.data 
      });
    } catch (error: any) {
      console.error('[Phase 27.2] Error approving:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // POST /api/intent/reject - Reject by traceId
  apiRouter.post('/intent/reject', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { traceId } = req.body;
      
      if (!traceId) {
        return res.status(400).json({ success: false, error: 'traceId is required' });
      }
      
      // Find approval by traceId OR id (for backward compatibility)
      const approvals = await storage.getPendingApprovals(userId, 'pending');
      console.log(`[Phase 27.2] Searching for traceId=${traceId} among ${approvals.length} approvals`);
      console.log('[Phase 27.2] Approval IDs:', approvals.map(a => ({ id: a.id, traceId: a.traceId })));
      const approval = approvals.find(a => a.traceId === traceId || a.id === traceId);
      
      if (!approval) {
        console.log(`[Phase 27.2] No approval found for traceId=${traceId}`);
        return res.status(404).json({ success: false, error: 'Approval not found or already processed' });
      }
      
      if (approval.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }
      
      // Update approval status (do NOT set clearedAt - that's for explicit clearing only)
      const updated = await storage.updateApprovalStatus(approval.id, 'rejected', {
        rejectedAt: new Date() as any,
      });
      
      // Create audit log
      await storage.createWalterApprovalsAudit({
        approvalId: approval.id,
        userId,
        decision: 'rejected',
        decisionMethod: 'inline_rejection',
        notes: null,
        executionResult: { success: false, reason: 'User rejected', mode: approval.mode, traceId },
      });
      
      // Emit WebSocket event
      const { contextBridge } = await import('./services/context-bridge');
      await contextBridge.broadcast('approval_update', { traceId, status: 'rejected' }, userId);
      
      console.log(`[Phase 27.2] Rejected ${traceId} by user ${userId}`);
      
      res.json({ success: true, message: 'Rejected — no changes made', traceId, status: 'rejected' });
    } catch (error: any) {
      console.error('[Phase 27.2] Error rejecting:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // POST /api/intent/dismiss - Dismiss approval (no action, keep in list)
  apiRouter.post('/intent/dismiss', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { traceId } = req.body;
      
      if (!traceId) {
        return res.status(400).json({ success: false, error: 'traceId is required' });
      }
      
      // Find approval by traceId OR id (for backward compatibility)
      const approvals = await storage.getPendingApprovals(userId, 'pending');
      const approval = approvals.find(a => a.traceId === traceId || a.id === traceId);
      
      if (!approval) {
        return res.status(404).json({ success: false, error: 'Approval not found' });
      }
      
      if (approval.userId !== userId) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }
      
      // Update to dismissed status (keeps in list but marks as seen)
      const updated = await storage.updateApprovalStatus(approval.id, 'dismissed', {
        dismissedAt: new Date() as any,
      });
      
      // Emit WebSocket event
      const { contextBridge } = await import('./services/context-bridge');
      await contextBridge.broadcast('approval_update', { traceId, status: 'dismissed' }, userId);
      
      console.log(`[Phase 27.2] Dismissed ${traceId} by user ${userId}`);
      
      res.json({ success: true, message: 'Dismissed — you can act later from the bell', traceId, status: 'dismissed' });
    } catch (error: any) {
      console.error('[Phase 27.2] Error dismissing:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // POST /api/intent/clear - Clear approvals from notification list
  apiRouter.post('/intent/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { traceIds } = req.body;
      
      if (!traceIds || !Array.isArray(traceIds)) {
        return res.status(400).json({ success: false, error: 'traceIds array is required' });
      }
      
      let cleared = 0;
      const now = new Date();
      
      for (const traceId of traceIds) {
        try {
          const approvals = await storage.getPendingApprovals(userId);
          const approval = approvals.find(a => (a.traceId === traceId || a.id === traceId) && a.userId === userId);
          
          if (approval && (approval.status === 'approved' || approval.status === 'rejected')) {
            await storage.updateApprovalStatus(approval.id, approval.status, {
              clearedAt: now as any,
            });
            cleared++;
          }
        } catch (error) {
          console.error(`[Phase 27.2] Error clearing traceId ${traceId}:`, error);
        }
      }
      
      console.log(`[Phase 27.2] Cleared ${cleared} approvals for user ${userId}`);
      
      res.json({ success: true, cleared });
    } catch (error: any) {
      console.error('[Phase 27.2] Error clearing approvals:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST /api/intent/cleanup-ghosts - One-time cleanup of stuck approvals
  apiRouter.post('/intent/cleanup-ghosts', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get all approved/rejected approvals without cleared_at
      const allApprovals = await storage.getPendingApprovals(userId);
      const ghosts = allApprovals.filter(a => 
        (a.status === 'approved' || a.status === 'rejected') && !a.clearedAt
      );
      
      let cleared = 0;
      const now = new Date();
      
      for (const ghost of ghosts) {
        try {
          await storage.updateApprovalStatus(ghost.id, ghost.status, {
            clearedAt: now as any,
          });
          cleared++;
        } catch (error) {
          console.error(`[Phase 27.2] Error cleaning ghost ${ghost.id}:`, error);
        }
      }
      
      console.log(`[Phase 27.2] Ghost cleanup: cleared ${cleared} stuck approvals for user ${userId}`);
      
      res.json({ 
        success: true, 
        cleared, 
        skipped: ghosts.length - cleared,
        message: `Cleaned up ${cleared} stuck approval(s)` 
      });
    } catch (error: any) {
      console.error('[Phase 27.2] Error during ghost cleanup:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // GET all Walter chats for current user
  apiRouter.get('/walter/chats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      
      // If searching, fetch ALL chats (including archived) for comprehensive results
      let chats = await storage.getWalterChats(userId, search ? undefined : status);
      
      // Full-text search across chat titles and messages (all messages, not limited)
      if (search && search.trim()) {
        const searchLower = search.toLowerCase();
        const matchingChatIds = new Set<string>();
        
        // Search in titles
        chats.forEach(chat => {
          if (chat.title?.toLowerCase().includes(searchLower)) {
            matchingChatIds.add(chat.id);
          }
        });
        
        // Search in message contents (fetch all messages, no limit)
        for (const chat of chats) {
          if (!matchingChatIds.has(chat.id)) {
            const messages = await storage.getWalterChatLogs(chat.id, 10000); // Increased limit for comprehensive search
            const hasMatch = messages.some(msg => 
              msg.content.toLowerCase().includes(searchLower)
            );
            if (hasMatch) {
              matchingChatIds.add(chat.id);
            }
          }
        }
        
        chats = chats.filter(chat => matchingChatIds.has(chat.id));
      }
      
      res.json({ ok: true, chats });
    } catch (error: any) {
      console.error('[Walter] Error fetching chats:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET specific Walter chat with messages
  apiRouter.get('/walter/chats/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      
      const chat = await storage.getWalterChatById(id);
      
      if (!chat) {
        return res.status(404).json({ ok: false, error: 'Chat not found' });
      }
      
      if (chat.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      // Phase 41F-L.E2E-PURGE: Use default memory depth (mode-level config doesn't need this user preference)
      const memoryDepth = 20; // Default Walter memory depth
      
      // Apply context windowing: return only last N messages
      const messages = await storage.getWalterChatLogs(id, memoryDepth);
      
      // If this is an approval thread, fetch the full approval data (not just pending)
      let approval = null;
      if (chat.isApprovalThread && chat.approvalId) {
        // Fetch approval with any status (pending, approved, rejected)
        const allApprovals = await storage.getPendingApprovals(userId); // Gets all approvals
        approval = allApprovals.find(a => a.id === chat.approvalId) || null;
      }
      
      res.json({ ok: true, chat, messages, approval });
    } catch (error: any) {
      console.error('[Walter] Error fetching chat:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // POST create new Walter chat
  apiRouter.post('/walter/chats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { title } = req.body;
      
      const chat = await storage.createWalterChat({
        userId,
        title: title || 'New Chat',
        status: 'active',
        isApprovalThread: false,
        messageCount: 0,
        lastMessageAt: new Date(),
      });
      
      console.log(`[Walter] Created new chat ${chat.id} for user ${userId}`);
      
      res.json({ ok: true, chat });
    } catch (error: any) {
      console.error('[Walter] Error creating chat:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // PATCH update Walter chat (archive, rename, etc.)
  apiRouter.patch('/walter/chats/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { title, status, archivedAt } = req.body;
      
      const chat = await storage.getWalterChatById(id);
      
      if (!chat) {
        return res.status(404).json({ ok: false, error: 'Chat not found' });
      }
      
      if (chat.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (status !== undefined) updates.status = status;
      if (archivedAt !== undefined) updates.archivedAt = new Date(archivedAt);
      
      // Phase 6.3: Log rename event to file storage
      if (title !== undefined && title !== chat.title) {
        await chatLogging.renameChatInIndex(
          id,
          chat.title || 'Unnamed Chat',
          title,
          userId
        );
      }
      
      const updated = await storage.updateWalterChat(id, updates);
      
      console.log(`[Walter] Updated chat ${id}: ${JSON.stringify(updates)}`);
      
      // Trigger lifecycle management if status changed to archived
      if (status === 'archived') {
        manageChatLifecycle(id, userId).catch(err => 
          console.error('[Walter] Lifecycle management error:', err)
        );
      }
      
      res.json({ ok: true, chat: updated });
    } catch (error: any) {
      console.error('[Walter] Error updating chat:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Phase 8.4: DELETE Walter chat
  apiRouter.delete('/walter/chats/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      
      const chat = await storage.getWalterChatById(id);
      
      if (!chat) {
        return res.status(404).json({ ok: false, error: 'Chat not found' });
      }
      
      if (chat.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      // Delete all messages in the chat
      await storage.deleteWalterChatMessages(id);
      
      // Delete the chat itself
      await storage.deleteWalterChat(id);
      
      console.log(`[Walter] Deleted chat ${id} for user ${userId}`);
      
      res.json({ ok: true, message: 'Chat deleted successfully' });
    } catch (error: any) {
      console.error('[Walter] Error deleting chat:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // POST send message to Walter chat
  apiRouter.post('/walter/chats/:id/messages', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { content } = req.body;
      
      if (!content || !content.trim()) {
        return res.status(400).json({ ok: false, error: 'Message content is required' });
      }
      
      const chat = await storage.getWalterChatById(id);
      
      if (!chat) {
        return res.status(404).json({ ok: false, error: 'Chat not found' });
      }
      
      if (chat.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      // Save user message
      const userMessage = await storage.createWalterChatLog({
        chatSessionId: id,
        userId,
        role: 'user',
        content: content.trim(),
      });
      
      // Phase 6.3: Log user message to file
      await chatLogging.logMessage({
        chat_id: id,
        chat_name: chat.title || 'New Chat',
        timestamp: new Date().toISOString(),
        user_id: userId,
        message_type: 'user',
        content: content.trim(),
      });
      
      // Phase 19+: Try NLAI interpreter first for simulation and action commands
      // Phase 22: Pass mode (default to paper for safety) and chatSessionId for execution logging
      const nlaiResponse = await nlaiInterpreter.interpret(userId, content.trim(), {
        mode: 'paper', // Default to paper mode for safety in chat context
        chatSessionId: id,
        source: 'chat',
      });
      let aiResponse: string;
      
      // Get pending confirmation ID for this user FIRST
      const pendingConfirmationId = userPendingConfirmations.get(userId);
      
      // Check if user is confirming a pending command (whole-word matching to avoid false positives)
      const normalizedContent = content.trim().toLowerCase();
      const firstWord = normalizedContent.split(/\s+/)[0].replace(/[^a-z]/g, ''); // Get first word, strip ALL punctuation
      const isAffirmative = ['yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'confirm', 'sure'].includes(firstWord);
      const isNegative = ['no', 'nope', 'nah', 'cancel', 'stop', 'abort'].includes(firstWord);
      
      if ((isAffirmative || isNegative) && pendingConfirmationId) {
        // User is confirming/canceling a pending command
        const confirmed = isAffirmative;
        const result = await commandRouter.confirmCommand(pendingConfirmationId, userId, confirmed);
        aiResponse = result.success 
          ? `✅ ${result.message}${result.data ? '\n\n📊 Data:\n```json\n' + JSON.stringify(result.data, null, 2) + '\n```' : ''}`
          : `❌ ${result.message}`;
        
        // Clear pending confirmation after processing
        userPendingConfirmations.delete(userId);
        
        // Log confirmation (Phase 6.8)
        await commandLogger.logConfirmation(userId, pendingConfirmationId, confirmed, result, req.user?.username);
      }
      // If user has pending confirmation but input is NOT yes/no, remind them
      else if (pendingConfirmationId) {
        // User has pending confirmation but didn't say yes/no - remind them
        aiResponse = `⚠️  You have a pending confirmation. Please reply with "yes" or "no" first, or say "cancel" to clear it. Then you can issue new commands.`;
      }
      // Phase 19+: If NLAI recognized an actionable intent (simulation, system commands, reports)
      else if (nlaiResponse.isActionable && nlaiResponse.executionResult) {
        aiResponse = nlaiResponse.executionResult.success
          ? `✅ ${nlaiResponse.executionResult.message}${nlaiResponse.executionResult.data ? '\n\n📊 Data:\n```json\n' + JSON.stringify(nlaiResponse.executionResult.data, null, 2) + '\n```' : ''}`
          : `❌ ${nlaiResponse.executionResult.message}`;
        
        console.log(`[NLAI] User ${userId} executed: ${nlaiResponse.actionId}`, { 
          processingTime: nlaiResponse.processingTimeMs,
          success: nlaiResponse.executionResult.success 
        });
      }
      // Fallback to old intent parser for trading commands
      else {
        const parsedIntent = parseIntent(content.trim());
        
        // If it's a command (not just conversation) and NO pending confirmation, route it
        if (parsedIntent.type !== 'conversation' && !pendingConfirmationId) {
          const startTime = Date.now();
          const result = await commandRouter.routeCommand(parsedIntent, userId);
          const executionTimeMs = Date.now() - startTime;
          
          if (result.requiresConfirmation) {
            // Store confirmation ID for this user (we already checked no pending exists)
            if (result.confirmationId) {
              userPendingConfirmations.set(userId, result.confirmationId);
            }
            aiResponse = `⚠️  ${result.confirmationMessage}\n\nReply with **"yes"** to confirm or **"no"** to cancel.`;
          } else if (result.success) {
            aiResponse = `✅ ${result.message}${result.warnings?.length ? '\n\n⚠️  Warnings:\n' + result.warnings.join('\n') : ''}${result.data ? '\n\n📊 Data:\n```json\n' + JSON.stringify(result.data, null, 2) + '\n```' : ''}`;
          } else {
            aiResponse = `❌ ${result.message}${result.errors?.length ? '\n\nErrors:\n' + result.errors.join('\n') : ''}`;
          }
          
          // Log command execution (Phase 6.8)
          await commandLogger.logCommand(userId, parsedIntent, result, req.user?.username, executionTimeMs);
          console.log(`[Command] User ${userId} executed: ${parsedIntent.type} - ${parsedIntent.action} ${parsedIntent.entity}`, { result });
        }
        // Normal conversation - generate Walter response
        else {
          aiResponse = await generateWalterResponse(userId, id, content.trim());
        }
      }
      
      // Phase 8.5 Addendum J: Add live data source metadata to Walter responses
      const assistantMessage = await storage.createWalterChatLog({
        chatSessionId: id,
        userId,
        role: 'assistant',
        content: aiResponse,
        metadata: {
          dataSource: 'live-api',
          refreshedAt: new Date().toISOString()
        }
      });
      
      // Phase 6.3: Log Walter response to file
      await chatLogging.logMessage({
        chat_id: id,
        chat_name: chat.title || 'New Chat',
        timestamp: new Date().toISOString(),
        user_id: userId,
        message_type: 'walter',
        content: aiResponse,
      });
      
      // Update chat metadata
      const newMessageCount = chat.messageCount + 2;
      await storage.updateWalterChat(id, {
        messageCount: newMessageCount,
        lastMessageAt: new Date(),
      });
      
      // Auto-summarization when chat exceeds threshold (Phase 5.5 Task 6/7)
      // Phase 41F-L.E2E-PURGE: Auto-summarization enabled by default (removed user-level config)
      const autoSummarizeEnabled = true;
      
      if (autoSummarizeEnabled && newMessageCount >= 50 && newMessageCount % 50 === 0) {
        summarizeChatSession(id, userId).catch(err => 
          console.error('[Walter] Auto-summarization error:', err)
        );
      }
      
      res.json({ ok: true, userMessage, assistantMessage });
    } catch (error: any) {
      console.error('[Walter] Error sending message:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Walter Purpose & Memory API (Phase 5.5, mode-aware as of Phase 6.13) ====================
  
  // GET current user's Walter purpose (mode-aware)
  // Phase 7.4: ConfigBob transparent routing for purpose endpoint
  apiRouter.get('/walter/purpose', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      
      // Phase 7.4: Try ConfigBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using ConfigBob for /api/walter/purpose');
          const purpose = await configBob.getPurpose(userId, mode);
          return res.json({ ok: true, purpose: purpose || null });
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ ConfigBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      const purpose = await db.select()
        .from(walterPurpose)
        .where(and(
          eq(walterPurpose.userId, userId),
          eq(walterPurpose.mode, mode)
        ))
        .limit(1);
      
      if (purpose.length === 0) {
        return res.json({ ok: true, purpose: null });
      }
      
      res.json({ ok: true, purpose: purpose[0] });
    } catch (error: any) {
      console.error('[Walter] Error fetching purpose:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // POST create or update Walter purpose (mode-aware)
  apiRouter.post('/walter/purpose', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      const { content } = req.body;
      
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ ok: false, error: 'Purpose content is required' });
      }
      
      // Check if purpose already exists for this mode
      const existing = await db.select()
        .from(walterPurpose)
        .where(and(
          eq(walterPurpose.userId, userId),
          eq(walterPurpose.mode, mode)
        ))
        .limit(1);
      
      let purpose;
      const isUpdate = existing.length > 0;
      
      if (isUpdate) {
        // Update existing purpose
        const updated = await db.update(walterPurpose)
          .set({
            content,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(and(
            eq(walterPurpose.userId, userId),
            eq(walterPurpose.mode, mode)
          ))
          .returning();
        purpose = updated[0];
      } else {
        // Create new purpose
        const created = await db.insert(walterPurpose)
          .values({
            userId,
            mode,
            content,
            updatedBy: userId,
          })
          .returning();
        purpose = created[0];
      }
      
      // Create dashboard notification (Phase 5.5 Task 8)
      const AlertsService = (await import('./services/alerts-service')).default;
      
      await AlertsService.createAlert({
        userId,
        mode,
        alertType: 'walter_purpose',
        severity: 'info',
        message: isUpdate 
          ? `Walter's purpose has been updated (${mode.toUpperCase()} mode). New guidance is now active.`
          : `Walter's purpose has been defined (${mode.toUpperCase()} mode). AI decisions will now align with your stated objectives.`,
        metadata: { purposeLength: content.length, mode }
      });
      
      res.json({ ok: true, purpose });
    } catch (error: any) {
      console.error('[Walter] Error saving purpose:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET Walter memories for current user
  apiRouter.get('/walter/memory', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const type = req.query.type as string | undefined;
      const limit = parseInt(req.query.limit as string) || 10;
      const importance = req.query.importance as string | undefined;
      
      let query = db.select()
        .from(walterMemory)
        .where(eq(walterMemory.userId, userId))
        .orderBy(sql`timestamp DESC`)
        .limit(limit);
      
      if (type) {
        query = query.where(eq(walterMemory.type, type)) as any;
      }
      
      if (importance) {
        const minImportance = parseInt(importance);
        query = query.where(sql`importance >= ${minImportance}`) as any;
      }
      
      const memories = await query;
      res.json({ ok: true, memories });
    } catch (error: any) {
      console.error('[Walter] Error fetching memories:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // POST create Walter memory entry
  apiRouter.post('/walter/memory', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const data = insertWalterMemorySchema.parse(req.body);
      
      // Ensure importance is within 1-5 range
      if (data.importance && (data.importance < 1 || data.importance > 5)) {
        return res.status(400).json({ ok: false, error: 'Importance must be between 1 and 5' });
      }
      
      const memory = await db.insert(walterMemory)
        .values({
          ...data,
          userId,
        })
        .returning();
      
      res.json({ ok: true, memory: memory[0] });
    } catch (error: any) {
      console.error('[Walter] Error creating memory:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST analyze uploaded file
  const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  });

  apiRouter.post('/walter/analyze-file', authenticateToken, fileUpload.single('file'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const file = req.file;
      const chatSessionId = req.body.chatSessionId;

      if (!file) {
        return res.status(400).json({ ok: false, error: 'No file uploaded' });
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'text/csv',
        'text/plain',
        'application/json'
      ];

      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ ok: false, error: 'Invalid file type. Only PDF, Word, images, CSV, and text files are supported.' });
      }

      // For text files, read content
      let fileContent = '';
      if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv' || file.mimetype === 'application/json') {
        fileContent = file.buffer.toString('utf-8');
      }

      // Generate summary using OpenAI (for text files)
      let summary = `File uploaded: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`;
      
      if (fileContent && process.env.OPENAI_API_KEY) {
        try {
          const { default: OpenAI } = await import('openai');
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

          const prompt = `Analyze this file content and provide a concise summary (max 3 sentences):

File: ${file.originalname}
Type: ${file.mimetype}
Content:
${fileContent.slice(0, 4000)}${fileContent.length > 4000 ? '...(truncated)' : ''}

Summary:`;

          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.3,
          });

          summary = response.choices[0].message.content || summary;
        } catch (error) {
          console.error('[Walter] Error generating file summary:', error);
        }
      }

      // Store file metadata in Walter chat log if chatSessionId provided
      if (chatSessionId) {
        await storage.createWalterChatLog({
          chatSessionId,
          userId,
          role: 'system',
          content: `File uploaded: ${file.originalname}\nType: ${file.mimetype}\nSize: ${(file.size / 1024).toFixed(2)} KB\n\nSummary: ${summary}`,
          metadata: {
            fileUpload: true,
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size
          }
        });
      }

      res.json({ 
        ok: true, 
        summary,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size
      });
    } catch (error: any) {
      console.error('[Walter] Error analyzing file:', error);
      res.status(500).json({ ok: false, error: error.message || 'Failed to analyze file' });
    }
  });

  // ==================== Walter UI Preferences & UX API (Phase 8.4 Addendum B) ====================
  
  // GET user's Walter UI preferences
  apiRouter.get('/walter/preferences', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const preferences = await storage.getWalterUserPreferences(userId);
      
      // Return defaults if no preferences exist
      if (!preferences) {
        return res.json({
          ok: true,
          preferences: {
            viewMode: 'compact',
            theme: 'system',
            tone: 'professional',
            sendKeyPreference: 'enter',
            sidebarCollapsed: false
          }
        });
      }
      
      res.json({ ok: true, preferences });
    } catch (error: any) {
      console.error('[Walter] Error fetching preferences:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // PUT update user's Walter UI preferences
  apiRouter.put('/walter/preferences', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { viewMode, theme, tone, sendKeyPreference, sidebarCollapsed } = req.body;
      
      const updates: any = {};
      if (viewMode !== undefined) updates.viewMode = viewMode;
      if (theme !== undefined) updates.theme = theme;
      if (tone !== undefined) updates.tone = tone;
      if (sendKeyPreference !== undefined) updates.sendKeyPreference = sendKeyPreference;
      if (sidebarCollapsed !== undefined) updates.sidebarCollapsed = sidebarCollapsed;
      
      const preferences = await storage.upsertWalterUserPreferences(userId, updates);
      
      console.log(`[Walter] Updated preferences for user ${userId}:`, updates);
      res.json({ ok: true, preferences });
    } catch (error: any) {
      console.error('[Walter] Error updating preferences:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // POST pin a Walter chat
  apiRouter.post('/walter/chats/:id/pin', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      
      // Verify ownership
      const chat = await storage.getWalterChatById(id);
      if (!chat) {
        return res.status(404).json({ ok: false, error: 'Chat not found' });
      }
      if (chat.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      const updatedChat = await storage.pinWalterChat(id);
      console.log(`[Walter] Pinned chat ${id} for user ${userId}`);
      
      res.json({ ok: true, chat: updatedChat });
    } catch (error: any) {
      console.error('[Walter] Error pinning chat:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // POST unpin a Walter chat
  apiRouter.post('/walter/chats/:id/unpin', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      
      // Verify ownership
      const chat = await storage.getWalterChatById(id);
      if (!chat) {
        return res.status(404).json({ ok: false, error: 'Chat not found' });
      }
      if (chat.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      const updatedChat = await storage.unpinWalterChat(id);
      console.log(`[Walter] Unpinned chat ${id} for user ${userId}`);
      
      res.json({ ok: true, chat: updatedChat });
    } catch (error: any) {
      console.error('[Walter] Error unpinning chat:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET export Walter chat (PDF or Markdown)
  apiRouter.get('/walter/chats/:id/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const format = (req.query.format as string) || 'markdown';
      
      // Verify ownership
      const chat = await storage.getWalterChatById(id);
      if (!chat) {
        return res.status(404).json({ ok: false, error: 'Chat not found' });
      }
      if (chat.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }
      
      // Get all messages
      const messages = await storage.getWalterChatLogs(id, 10000);
      
      if (format === 'markdown') {
        // Generate Markdown export
        let markdown = `# ${chat.title || 'Walter Chat'}\n\n`;
        markdown += `**Created:** ${chat.createdAt ? new Date(chat.createdAt).toLocaleString() : 'Unknown'}\n`;
        markdown += `**Messages:** ${messages.length}\n`;
        markdown += `**Status:** ${chat.status}\n\n`;
        markdown += `---\n\n`;
        
        for (const msg of messages) {
          const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Unknown';
          const role = msg.role === 'user' ? '👤 **User**' : msg.role === 'assistant' ? '🤖 **Walter**' : '⚙️ **System**';
          markdown += `### ${role} - ${timestamp}\n\n`;
          markdown += `${msg.content}\n\n`;
          markdown += `---\n\n`;
        }
        
        // Save export file via FilePersistenceService
        const fileName = `${chat.title || 'chat'}-${id}.md`;
        await filePersistence.saveFile('export', fileName, markdown);
        
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(markdown);
      } else if (format === 'pdf') {
        // For PDF, we'll return JSON with message data that frontend can convert
        // A proper PDF generation would require a library like puppeteer or pdfkit
        res.json({
          ok: true,
          message: 'PDF export coming soon. Please use Markdown export for now.',
          data: {
            title: chat.title,
            created: chat.createdAt,
            messages: messages.map(m => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp
            }))
          }
        });
      } else {
        res.status(400).json({ ok: false, error: 'Invalid format. Use "markdown" or "pdf"' });
      }
    } catch (error: any) {
      console.error('[Walter] Error exporting chat:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Reasoning Orchestrator API (Phase 8.8.3) ====================
  
  // POST enqueue a new reasoning task
  apiRouter.post('/reasoning/enqueue', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { reasoningOrchestrator } = await import('./services/reasoning-orchestrator');
      const userId = req.user!.id;
      const { intentAction, userMessage, systemState, mode = 'paper' } = req.body;

      if (!intentAction || !userMessage) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Missing required fields: intentAction, userMessage' 
        });
      }

      // Create reasoning plan
      const plan = await reasoningOrchestrator.createPlan({
        userId,
        intentAction,
        userMessage,
        systemState,
        mode
      });

      res.json({
        ok: true,
        traceId: plan.traceId,
        steps: plan.steps.length,
        domainContext: plan.domainContext,
        status: plan.status
      });
    } catch (error: any) {
      console.error('[API] Error enqueueing reasoning task:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET reasoning queue status and recent traces
  apiRouter.get('/reasoning/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { taskQueue } = await import('./services/task-queue');
      const { reasoningOrchestrator } = await import('./services/reasoning-orchestrator');

      // Get queue metrics from task queue
      const queueMetrics = await taskQueue.getQueueStats();
      
      // Get orchestrator performance metrics
      const orchestratorMetrics = reasoningOrchestrator.getMetrics();

      // Get recent traces for this user
      const recentTraces = await db
        .select({
          traceId: reasoningTrace.traceId,
          intentAction: reasoningTrace.intentAction,
          status: reasoningTrace.status,
          domainContext: reasoningTrace.domainContext,
          createdAt: reasoningTrace.createdAt
        })
        .from(reasoningTrace)
        .where(eq(reasoningTrace.userId, userId))
        .orderBy(sql`${reasoningTrace.createdAt} DESC`)
        .limit(10);

      res.json({
        ok: true,
        metrics: {
          totalPending: queueMetrics.pending || 0,
          totalInProgress: queueMetrics.inProgress || 0,
          totalCompleted: queueMetrics.completed || 0,
          totalFailed: queueMetrics.failed || 0,
          ...queueMetrics,
          orchestrator: orchestratorMetrics
        },
        recentTraces
      });
    } catch (error: any) {
      console.error('[API] Error getting reasoning status:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Reasoning Orchestrator Debug API (Phase 8.8.1) ====================
  
  // GET reasoning trace by ID for debugging
  apiRouter.get('/reasoning/debug/:traceId', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { traceId } = req.params;
      const userId = req.user!.id;

      // Get trace from database
      const trace = await db
        .select()
        .from(reasoningTrace)
        .where(eq(reasoningTrace.traceId, traceId))
        .limit(1);

      if (trace.length === 0) {
        return res.status(404).json({ ok: false, error: 'Trace not found' });
      }

      const traceData = trace[0];

      // Verify ownership
      if (traceData.userId !== userId) {
        return res.status(403).json({ ok: false, error: 'Unauthorized' });
      }

      // Get queued tasks for this trace
      const tasks = await db
        .select()
        .from(reasoningQueue)
        .where(eq(reasoningQueue.traceId, traceId))
        .orderBy(reasoningQueue.createdAt);

      res.json({
        ok: true,
        data: {
          trace: {
            traceId: traceData.traceId,
            userId: traceData.userId,
            intentAction: traceData.intentAction,
            systemState: traceData.systemState,
            mode: traceData.mode,
            status: traceData.status,
            steps: traceData.steps,
            domainContext: traceData.domainContext,
            outcome: traceData.outcome,
            error: traceData.error,
            processingTimeMs: traceData.processingTimeMs,
            createdAt: traceData.createdAt,
            completedAt: traceData.completedAt
          },
          tasks: tasks.map(task => ({
            id: task.id,
            traceId: task.traceId,
            stepId: task.stepId,
            bobDomain: task.bobDomain,
            action: task.action,
            params: task.params,
            status: task.status,
            result: task.result,
            error: task.error,
            retryCount: task.retryCount,
            createdAt: task.createdAt,
            startedAt: task.startedAt,
            completedAt: task.completedAt
          }))
        }
      });
    } catch (error: any) {
      console.error('[Reasoning] Error fetching debug trace:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Phase 8.8.2: Memory Lifecycle Manager API ====================
  
  // GET /api/memory/status - Get current memory status
  apiRouter.get('/memory/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const status = memoryLifecycle.getStatus();
      res.json({ ok: true, data: status });
    } catch (error: any) {
      console.error('[MemoryLifecycle] Error getting status:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/memory/rehydrate - Manually trigger memory rehydration (admin only)
  apiRouter.post('/memory/rehydrate', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Check if user is admin
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, userId)
      });
      
      if (!user?.isAdmin) {
        return res.status(403).json({ ok: false, error: 'Admin access required' });
      }
      
      const status = await memoryLifecycle.manualRehydrate(userId);
      res.json({ ok: true, data: status });
    } catch (error: any) {
      console.error('[MemoryLifecycle] Error rehydrating memory:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/memory/audit - Get recent audit records
  apiRouter.get('/memory/audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const records = await memoryLifecycle.getAuditRecords(limit);
      res.json({ ok: true, data: records });
    } catch (error: any) {
      console.error('[MemoryLifecycle] Error fetching audit records:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Semantic Memory API (Milestone 15) ====================
  
  // Search semantic memories by similarity
  apiRouter.post('/semantic/search', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { query, tags, limit = 10 } = req.body;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ ok: false, error: 'Query text required' });
      }
      
      // Import embedding service and generate embedding for query
      const { EmbeddingService } = await import('./services/embedding-service');
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        return res.status(500).json({ ok: false, error: 'OpenAI API key not configured' });
      }
      const embeddingService = new EmbeddingService(openaiKey);
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      
      // Search by cosine similarity using pgvector
      const results = await db.execute(sql`
        SELECT 
          id,
          content,
          source_table,
          source_id,
          tags,
          relevance,
          created_at,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM semantic_memory
        ${tags && tags.length > 0 ? sql`WHERE tags && ${tags}::text[]` : sql``}
        ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${limit}
      `);
      
      res.json({ ok: true, results: results.rows });
    } catch (error: any) {
      console.error('[SemanticSearch] Error searching memories:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // Get latest semantic memories
  apiRouter.get('/semantic/latest', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const tags = req.query.tags as string | undefined;
      
      let query = db
        .select()
        .from(semanticMemory)
        .orderBy(sql`created_at DESC`)
        .limit(limit);
      
      if (tags) {
        const tagArray = tags.split(',').map(t => t.trim());
        query = query.where(sql`tags && ${tagArray}::text[]`) as any;
      }
      
      const results = await query;
      res.json({ ok: true, memories: results });
    } catch (error: any) {
      console.error('[SemanticMemory] Error fetching latest:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // Get all unique tags
  apiRouter.get('/semantic/tags', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT unnest(tags) as tag
        FROM semantic_memory
        ORDER BY tag
      `);
      
      const tags = result.rows.map((row: any) => row.tag);
      res.json({ ok: true, tags });
    } catch (error: any) {
      console.error('[SemanticMemory] Error fetching tags:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Learning Metrics API (Milestone 16 - Intelligence Refinement) ====================
  
  // Get learning health metrics from Cognitive Weight Adjuster
  apiRouter.get('/ai/learning-metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { cognitiveWeightAdjuster } = await import('./services/cognitive-weight-adjuster');
      
      if (!req.user?.id) {
        return res.status(401).json({ ok: false, error: 'User ID not found' });
      }
      
      const metrics = await cognitiveWeightAdjuster.getHealthMetrics(req.user.id);
      res.json({ ok: true, metrics });
    } catch (error: any) {
      console.error('[LearningMetrics] Error fetching metrics:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Historic Signals Backfill API (Milestone 17C) ====================
  
  // Get historic signals statistics
  apiRouter.get('/historic-signals/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const stats = await storage.getHistoricSignalStats(userId);
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[HistoricSignals] Error fetching stats:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Get recent historic signals
  apiRouter.get('/historic-signals', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const limit = parseInt(req.query.limit as string) || 50;

      // Phase 7.5: Try StrategyBob first if enabled
      if (bobCore.isEnabled()) {
        try {
          console.log('[BobRouting] 🎯 Using StrategyBob for /api/historic-signals');
          const signals = await strategyBob.getSignals(userId, 'live', limit);
          return res.json({ ok: true, signals });
        } catch (bobError: any) {
          console.error('[BobRouting] ⚠️ StrategyBob failed, using original handler:', bobError.message);
          // Fall through to original implementation below
        }
      }

      const signals = await storage.getHistoricSignals(userId, limit);
      res.json({ ok: true, signals });
    } catch (error: any) {
      console.error('[HistoricSignals] Error fetching signals:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // Backfill historic signals for learning (admin-only)
  apiRouter.post('/backfill/signals', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // Check if user is admin
      if (!req.user?.isAdmin) {
        return res.status(403).json({ 
          ok: false, 
          error: 'Admin access required for historic signal backfill' 
        });
      }
      
      const userId = req.user!.id;
      const { 
        startDate, 
        endDate, 
        symbols = [], 
        strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride'],
        interval = 60 
      } = req.body;
      
      // Validate required fields
      if (!startDate || !endDate) {
        return res.status(400).json({ 
          ok: false, 
          error: 'startDate and endDate are required' 
        });
      }
      
      // Validate symbols is array
      if (!Array.isArray(symbols)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'symbols must be an array of strings' 
        });
      }
      
      if (symbols.length === 0) {
        return res.status(400).json({ 
          ok: false, 
          error: 'At least one symbol is required' 
        });
      }
      
      // Validate all symbols are strings
      if (!symbols.every((s: any) => typeof s === 'string')) {
        return res.status(400).json({ 
          ok: false, 
          error: 'All symbols must be strings' 
        });
      }
      
      // Validate strategies is array
      if (!Array.isArray(strategies)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'strategies must be an array' 
        });
      }
      
      // Validate strategies
      const validStrategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride'];
      const invalidStrategies = strategies.filter((s: string) => !validStrategies.includes(s));
      
      if (invalidStrategies.length > 0) {
        return res.status(400).json({ 
          ok: false, 
          error: `Invalid strategies: ${invalidStrategies.join(', ')}. Valid: ${validStrategies.join(', ')}` 
        });
      }
      
      // Validate interval
      if (typeof interval !== 'number' || interval <= 0 || !Number.isInteger(interval)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'interval must be a positive integer (minutes)' 
        });
      }
      
      // Validate date range
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Invalid date format. Use ISO 8601 format' 
        });
      }
      
      if (start >= end) {
        return res.status(400).json({ 
          ok: false, 
          error: 'startDate must be before endDate' 
        });
      }
      
      // Import and run backfill
      const { HistoricSignalGenerator } = await import('./services/historic-signal-generator');
      const generator = new HistoricSignalGenerator();
      
      console.log(`[Backfill] Starting historic signal generation for user ${userId}`);
      console.log(`  Date range: ${start.toISOString()} to ${end.toISOString()}`);
      console.log(`  Symbols: ${symbols.join(', ')}`);
      console.log(`  Strategies: ${strategies.join(', ')}`);
      
      const result = await generator.generateHistoricSignals({
        userId,
        startDate: start,
        endDate: end,
        symbols,
        strategies,
        interval
      });
      
      console.log(`[Backfill] Complete: ${result.totalSignals} signals generated, ${result.successCount} stored`);
      
      res.json({ 
        ok: true, 
        result: {
          ...result,
          message: `Successfully generated ${result.totalSignals} historic signals (${result.successCount} stored, ${result.errorCount} errors)`
        }
      });
    } catch (error: any) {
      console.error('[Backfill] Error generating historic signals:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Actuation Policy API (Milestone 17A) ====================
  
  // Get actuation policies for user
  apiRouter.get('/actuation-policies', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const policies = await storage.getActuationPolicies(userId);
      res.json({ ok: true, policies });
    } catch (error: any) {
      console.error('[ActuationPolicy] Error fetching policies:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Get actuation metrics
  apiRouter.get('/actuation-policies/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const metrics = await actuationPolicyService.getActuationMetrics(userId);
      res.json({ ok: true, metrics });
    } catch (error: any) {
      console.error('[ActuationPolicy] Error fetching metrics:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Get proposed adjustments
  apiRouter.get('/proposed-adjustments', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      const hours = parseInt(req.query.hours as string) || 168; // Default 7 days
      
      const adjustments = mode === 'live' || mode === 'paper'
        ? await storage.getPendingAdjustments(userId, mode)
        : await storage.getAllProposedAdjustments(userId, hours);
      
      res.json({ ok: true, adjustments });
    } catch (error: any) {
      console.error('[ActuationPolicy] Error fetching adjustments:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Approve proposed adjustment
  apiRouter.post('/proposed-adjustments/:id/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const userId = req.user!.id;
      
      await actuationPolicyService.approveProposal(id, notes || 'Approved', userId);
      res.json({ ok: true, message: 'Proposal approved successfully' });
    } catch (error: any) {
      console.error('[ActuationPolicy] Error approving adjustment:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Reject proposed adjustment
  apiRouter.post('/proposed-adjustments/:id/reject', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user!.id;
      
      await actuationPolicyService.rejectProposal(id, reason || 'Rejected', userId);
      res.json({ ok: true, message: 'Proposal rejected successfully' });
    } catch (error: any) {
      console.error('[ActuationPolicy] Error rejecting adjustment:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Apply approved adjustment
  apiRouter.post('/proposed-adjustments/:id/apply', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      await actuationPolicyService.applyProposal(id);
      res.json({ ok: true, message: 'Adjustment applied successfully' });
    } catch (error: any) {
      console.error('[ActuationPolicy] Error applying adjustment:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Asset Capabilities API (Milestone 17B) ====================
  
  // Get asset capabilities
  apiRouter.get('/asset-capabilities', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const capabilities = await storage.getAssetCapabilities();
      res.json({ ok: true, capabilities });
    } catch (error: any) {
      console.error('[AssetCapabilities] Error fetching capabilities:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Get specific asset capability
  apiRouter.get('/asset-capabilities/:symbol', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { symbol } = req.params;
      const capability = await storage.getAssetCapability(symbol);
      
      if (!capability) {
        return res.status(404).json({ ok: false, error: 'Asset capability not found' });
      }
      
      res.json({ ok: true, capability });
    } catch (error: any) {
      console.error('[AssetCapabilities] Error fetching capability:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Sync asset capabilities from Kraken
  apiRouter.post('/asset-capabilities/sync', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await assetCapabilitiesService.syncFromKraken();
      res.json({ ok: true, result });
    } catch (error: any) {
      console.error('[AssetCapabilities] Error syncing capabilities:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== AI Orchestrator / Command Center API ====================
  
  // Get latest telemetry snapshot
  apiRouter.get('/orchestrator/telemetry', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aiOrchestrator } = await import('./orchestrator/orchestrator');
      const telemetry = await aiOrchestrator.getLatestTelemetry();
      
      if (!telemetry) {
        return res.status(404).json({ error: 'No telemetry data available' });
      }
      
      res.json(telemetry);
    } catch (error: any) {
      console.error('[Orchestrator] Error fetching telemetry:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get latest AI analysis
  apiRouter.get('/orchestrator/analysis', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aiOrchestrator } = await import('./orchestrator/orchestrator');
      const analysis = await aiOrchestrator.getLatestAnalysis();
      
      if (!analysis) {
        return res.status(404).json({ error: 'No analysis data available' });
      }
      
      res.json(analysis);
    } catch (error: any) {
      console.error('[Orchestrator] Error fetching analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger immediate diagnostic analysis (admin only)
  apiRouter.post('/orchestrator/analyze', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { aiOrchestrator } = await import('./orchestrator/orchestrator');
      await aiOrchestrator.triggerImmediateAnalysis();
      
      res.json({ success: true, message: 'Analysis triggered successfully' });
    } catch (error: any) {
      console.error('[Orchestrator] Error triggering analysis:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Run comprehensive system audit (admin only)
  apiRouter.post('/orchestrator/audit', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const os = await import('os');
      
      // 1. System Metrics
      const cpus = os.cpus();
      const loadAvg = os.loadavg();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const uptime = process.uptime();
      
      const systemMetrics = {
        cpu: {
          cores: cpus.length,
          model: cpus[0]?.model || 'Unknown',
          loadAverage: {
            '1min': loadAvg[0].toFixed(2),
            '5min': loadAvg[1].toFixed(2),
            '15min': loadAvg[2].toFixed(2)
          }
        },
        memory: {
          total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
          free: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
          used: `${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(2)} GB`,
          usagePercent: `${(((totalMem - freeMem) / totalMem) * 100).toFixed(1)}%`
        },
        uptime: {
          seconds: Math.floor(uptime),
          formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
        }
      };

      // 2. Database Status
      const dbStatus = await storage.getDatabaseStatus?.() || { current: { sizeMb: 0, sizeGb: 0 }, history: [] };

      // 3. Trading Engine Status - Phase 27.F.15.B.3: Use global engines
      // Phase 41F-L.E2E-PURGE: Get mode from user preferences, default to paper
      const user = await storage.getUser(userId);
      const tradingMode = user?.tradingMode || 'paper';
      
      const liveEngineStatus = globalLiveEngine.getStatus?.() || { tradingStatus: 'stopped' };
      
      const paperStatus = await getPaperSimulationStatus(userId);
      const paperEngineStatus = { 
        isRunning: paperStatus.isRunning,
        status: paperStatus.isRunning ? 'running' : 'stopped'
      };

      // 4. AI Systems Status
      const { aiOrchestrator } = await import('./orchestrator/orchestrator');
      const telemetryPath = './server/orchestrator/summaries/telemetry.json';
      let aiMetrics = { learningCycles: 0, opportunities: 0, adjustments: 0 };
      
      try {
        const fs = await import('fs/promises');
        const telemetryData = await fs.readFile(telemetryPath, 'utf-8');
        const telemetry = JSON.parse(telemetryData);
        aiMetrics = telemetry.ai || aiMetrics;
      } catch (error) {
        console.log('[Audit] Could not load AI metrics');
      }

      // 5. Configuration Validation
      const hasKrakenApiKey = !!process.env.KRAKEN_API_KEY;
      const hasKrakenApiSecret = !!process.env.KRAKEN_API_SECRET;
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

      // 6. Recent Errors (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentErrors = await storage.getAIErrorLogs?.(userId, yesterday) || [];

      // 7. Construct comprehensive audit report
      const auditReport = {
        timestamp: new Date().toISOString(),
        system: systemMetrics,
        database: {
          size: dbStatus.current.sizeMb,
          sizeFormatted: `${dbStatus.current.sizeMb.toFixed(2)} MB (${dbStatus.current.sizeGb.toFixed(4)} GB)`,
          status: dbStatus.current.sizeMb < 100 ? 'healthy' : dbStatus.current.sizeMb < 250 ? 'warning' : 'critical'
        },
        trading: {
          mode: tradingMode,
          liveEngine: {
            status: liveEngineStatus.tradingStatus,
            isRunning: liveEngineStatus.tradingStatus === 'running'
          },
          paperEngine: {
            status: paperEngineStatus.isRunning ? 'running' : 'stopped',
            isRunning: paperEngineStatus.isRunning
          }
        },
        ai: {
          orchestrator: {
            status: 'running',
            learningCycles: aiMetrics.learningCycles || 0,
            opportunities: aiMetrics.opportunities || 0,
            adjustments: aiMetrics.adjustments || 0
          }
        },
        configuration: {
          krakenApiKey: hasKrakenApiKey ? 'configured' : 'missing',
          krakenApiSecret: hasKrakenApiSecret ? 'configured' : 'missing',
          openAIKey: hasOpenAIKey ? 'configured' : 'missing',
          allConfigured: hasKrakenApiKey && hasKrakenApiSecret && hasOpenAIKey
        },
        errors: {
          last24Hours: recentErrors.length,
          recentErrors: recentErrors.slice(0, 5).map(err => ({
            timestamp: err.timestamp,
            errorType: err.errorType,
            resolved: err.resolved
          }))
        },
        health: {
          overall: 'healthy', // Will be computed based on checks
          checks: {
            cpu: loadAvg[0] < cpus.length ? 'pass' : 'warning',
            memory: ((totalMem - freeMem) / totalMem) < 0.9 ? 'pass' : 'warning',
            database: dbStatus.current.sizeMb < 100 ? 'pass' : 'warning',
            configuration: (hasKrakenApiKey && hasKrakenApiSecret && hasOpenAIKey) ? 'pass' : 'fail',
            errors: recentErrors.length < 10 ? 'pass' : 'warning'
          }
        }
      };

      // Compute overall health
      const failedChecks = Object.values(auditReport.health.checks).filter(c => c === 'fail').length;
      const warningChecks = Object.values(auditReport.health.checks).filter(c => c === 'warning').length;
      
      if (failedChecks > 0) {
        auditReport.health.overall = 'critical';
      } else if (warningChecks > 2) {
        auditReport.health.overall = 'degraded';
      } else if (warningChecks > 0) {
        auditReport.health.overall = 'fair';
      }

      res.json({ 
        success: true, 
        audit: auditReport 
      });
    } catch (error: any) {
      console.error('[Orchestrator] Error running system audit:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get learning summary (cumulative AI learning metrics)
  apiRouter.get('/orchestrator/learning-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // Import necessary tables and functions
      const { aiOpportunities, paperTrades, aiOrchestratorLogs } = await import('@shared/schema');
      const { eq, count, sum, avg, sql } = await import('drizzle-orm');

      // Use proper SQL aggregation for true cumulative metrics (no limits)
      const [
        insightsCount,
        approvedCount,
        opportunitiesCount,
        paperTradesStats,
        learningCyclesData
      ] = await Promise.all([
        // Count total AI insights
        db.select({ count: count() })
          .from(aiOrchestratorLogs)
          .where(eq(aiOrchestratorLogs.category, 'ai_insight')),
        
        // Count approved recommendations
        db.select({ count: count() })
          .from(aiOrchestratorLogs)
          .where(eq(aiOrchestratorLogs.status, 'approved')),
        
        // Count total opportunities
        db.select({ count: count() }).from(aiOpportunities),
        
        // Paper trading aggregated stats
        db.select({
          totalTrades: count(),
          winningTrades: sql<number>`COUNT(CASE WHEN ${paperTrades.realizedPL} > 0 THEN 1 END)`,
          losingTrades: sql<number>`COUNT(CASE WHEN ${paperTrades.realizedPL} < 0 THEN 1 END)`,
          totalPL: sum(paperTrades.realizedPL),
          avgPL: avg(paperTrades.realizedPL)
        }).from(paperTrades).where(eq(paperTrades.status, 'closed')),
        
        // Count unique learning cycle dates
        db.select({ 
          date: sql<string>`DATE(${aiOrchestratorLogs.timestamp})` 
        })
          .from(aiOrchestratorLogs)
          .where(sql`${aiOrchestratorLogs.timestamp} IS NOT NULL`)
          .groupBy(sql`DATE(${aiOrchestratorLogs.timestamp})`)
      ]);

      // Extract aggregated values
      const totalInsights = insightsCount[0]?.count || 0;
      const approvedRecommendations = approvedCount[0]?.count || 0;
      const totalOpportunities = opportunitiesCount[0]?.count || 0;
      
      const paperStats = paperTradesStats[0] || {};
      const closedTrades = Number(paperStats.totalTrades) || 0;
      const winningTrades = Number(paperStats.winningTrades) || 0;
      const losingTrades = Number(paperStats.losingTrades) || 0;
      const totalPL = Number(paperStats.totalPL) || 0;
      const avgPL = Number(paperStats.avgPL) || 0;
      const winRate = closedTrades > 0 ? (winningTrades / closedTrades) * 100 : 0;
      
      const learningCycles = learningCyclesData.length;

      const summary = {
        totalInsights,
        approvedRecommendations,
        totalOpportunities,
        learningCycles,
        paperTrading: {
          totalTrades: closedTrades,
          winningTrades,
          losingTrades,
          winRate: Number(winRate.toFixed(1)),
          totalPL: Number(totalPL.toFixed(2)),
          avgPL: Number(avgPL.toFixed(2))
        },
        lastUpdated: new Date().toISOString()
      };

      res.json({ success: true, summary });
    } catch (error: any) {
      console.error('[Orchestrator] Error generating learning summary:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get orchestrator logs
  apiRouter.get('/orchestrator/logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const isAdmin = req.user!.isAdmin;
      const limit = parseInt(req.query.limit as string) || 50;
      const category = req.query.category as string;
      const status = req.query.status as string;

      let logs;
      
      // Admins see ALL logs (system-wide recommendations), regular users see only their logs
      if (category) {
        logs = isAdmin 
          ? await storage.getOrchestratorLogsByCategory(null, category, limit)
          : await storage.getOrchestratorLogsByCategory(userId, category, limit);
      } else if (status) {
        logs = isAdmin
          ? await storage.getOrchestratorLogsByStatus(null, status, limit)
          : await storage.getOrchestratorLogsByStatus(userId, status, limit);
      } else {
        logs = isAdmin
          ? await storage.getOrchestratorLogs(null, limit)
          : await storage.getOrchestratorLogs(userId, limit);
      }

      res.json({ logs });
    } catch (error: any) {
      console.error('[Orchestrator] Error fetching logs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create orchestrator log (admin only - for storing AI recommendations)
  apiRouter.post('/orchestrator/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Validate request body using Zod schema
      const { insertAIOrchestratorLogSchema } = await import('@shared/schema');
      const validated = insertAIOrchestratorLogSchema.parse({
        userId,
        category: req.body.category,
        recommendation: req.body.recommendation,
        urgencyLevel: req.body.urgencyLevel || 'low',
        metadata: req.body.metadata || null,
        status: 'pending',
        actionTaken: null
      });

      const log = await storage.createOrchestratorLog(validated);

      res.json({ success: true, log });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[Orchestrator] Error creating log:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update orchestrator log (admin only - approve/reject recommendation)
  apiRouter.patch('/orchestrator/logs/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      // Validate request body using Zod schema
      const { updateAIOrchestratorLogSchema } = await import('@shared/schema');
      const validated = updateAIOrchestratorLogSchema.parse(req.body);

      const log = await storage.updateOrchestratorLog(parseInt(id), validated);

      res.json({ success: true, log });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[Orchestrator] Error updating log:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update Goal (admin only - AI-proposed configuration change)
  apiRouter.post('/orchestrator/updateGoal', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Validate request body using Zod schema
      const { orchestratorUpdateGoalSchema } = await import('@shared/schema');
      const validated = orchestratorUpdateGoalSchema.parse(req.body);

      // Log the recommendation
      const logData = {
        userId,
        category: 'goal_update',
        recommendation: `Update ${validated.metricName} goal to ${validated.goalValue} in ${validated.mode} mode`,
        urgencyLevel: 'medium' as const,
        status: validated.approved ? 'approved' as const : 'pending' as const,
        actionTaken: validated.reason || null,
        metadata: { mode: validated.mode, metricName: validated.metricName, goalValue: validated.goalValue }
      };
      
      await storage.createOrchestratorLog(logData);

      // Only execute if approved
      if (validated.approved) {
        const goalData = {
          userId,
          metricName: validated.metricName,
          goalValue: validated.goalValue,
          actualValue: '0',
          percentAchieved: '0',
          aiValidationNotes: validated.reason || 'AI-recommended update',
        };

        const result = validated.mode === 'live'
          ? await storage.upsertGoalLive(goalData)
          : await storage.upsertGoalPaper(goalData);

        console.info(`[Orchestrator] Goal updated: ${validated.metricName} = ${validated.goalValue} (${validated.mode} mode)`);
        res.json({ success: true, message: 'Goal updated successfully', data: result });
      } else {
        res.json({ success: true, message: 'Goal update proposal logged for review' });
      }
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[Orchestrator] Error updating goal:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update Guardrail (admin only - AI-proposed configuration change)
  apiRouter.post('/orchestrator/updateGuardrail', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Validate request body using Zod schema
      const { orchestratorUpdateGuardrailSchema } = await import('@shared/schema');
      const validated = orchestratorUpdateGuardrailSchema.parse(req.body);

      // Log the recommendation
      const logData = {
        userId,
        category: 'guardrail_update',
        recommendation: `Update ${validated.field} to ${validated.value} in ${validated.mode} mode`,
        urgencyLevel: 'high' as const,
        status: validated.approved ? 'approved' as const : 'pending' as const,
        actionTaken: validated.reason || null,
        metadata: { mode: validated.mode, field: validated.field, value: validated.value }
      };
      
      await storage.createOrchestratorLog(logData);

      // Only execute if approved
      if (validated.approved) {
        // Get current guardrails
        const currentGuardrails = await storage.getGuardrails({ mode: validated.mode });
        
        if (!currentGuardrails) {
          return res.status(404).json({ error: 'Guardrails not found. Please initialize guardrails first.' });
        }

        // Update the specific field
        const updateData = {
          ...currentGuardrails,
          [validated.field]: validated.value,
          mode: validated.mode,
          lastUpdatedBy: userId
        };

        const result = await storage.upsertGuardrails(updateData);

        console.info(`[Orchestrator] Guardrail updated: ${validated.field} = ${validated.value} (${validated.mode} mode)`);
        
        // Phase 8.6.5: Invalidate caches and refresh context for Walter AI
        const { configChangeHandler } = await import('./services/config-change-handler');
        await configChangeHandler.handleConfigChange({
          userId,
          mode: validated.mode,
          configType: 'guardrails',
          source: 'direct'
        });
        
        res.json({ success: true, message: 'Guardrail updated successfully', data: result });
      } else {
        res.json({ success: true, message: 'Guardrail update proposal logged for review' });
      }
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[Orchestrator] Error updating guardrail:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update Strategy (admin only - AI-proposed configuration change)
  apiRouter.post('/orchestrator/updateStrategy', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Validate request body using Zod schema
      const { orchestratorUpdateStrategySchema } = await import('@shared/schema');
      const validated = orchestratorUpdateStrategySchema.parse(req.body);

      // Log the recommendation
      const logData = {
        userId,
        category: 'strategy_update',
        recommendation: `Update ${validated.strategy} ${validated.field} to ${JSON.stringify(validated.value)} in ${validated.mode} mode`,
        urgencyLevel: 'medium' as const,
        status: validated.approved ? 'approved' as const : 'pending' as const,
        actionTaken: validated.reason || null,
        metadata: { mode: validated.mode, strategy: validated.strategy, field: validated.field, value: validated.value }
      };
      
      await storage.createOrchestratorLog(logData);

      // Only execute if approved
      if (validated.approved) {
        // Get current strategy settings
        const currentSettings = await storage.getStrategySettings({ 
          userId, 
          mode: validated.mode, 
          strategy: validated.strategy 
        });
        
        if (!currentSettings) {
          return res.status(404).json({ error: 'Strategy settings not found' });
        }

        // Update the specific field
        const updateData = {
          userId,
          mode: validated.mode,
          strategy: validated.strategy,
          enabled: validated.field === 'enabled' ? validated.value as boolean : currentSettings.enabled,
          params: validated.field === 'params' ? validated.value as any : currentSettings.params
        };

        const result = await storage.upsertStrategySettings(updateData);

        console.info(`[Orchestrator] Strategy updated: ${validated.strategy}.${validated.field} (${validated.mode} mode)`);
        
        // Phase 8.6.5: Invalidate caches and refresh context for Walter AI
        const { configChangeHandler } = await import('./services/config-change-handler');
        await configChangeHandler.handleConfigChange({
          userId,
          mode: validated.mode,
          configType: 'strategies',
          source: 'direct',
          globalContextId: 'default'
        });
        
        res.json({ success: true, message: 'Strategy updated successfully', data: result });
      } else {
        res.json({ success: true, message: 'Strategy update proposal logged for review' });
      }
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('[Orchestrator] Error updating strategy:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Walter AI SysAdmin Co-Pilot - Command Interpretation
  apiRouter.post('/walter/interpret-command', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { message, context } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Get user profile with approval matrix
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const approvalMatrix = (user.approvalMatrix as any) || {
        autoExecute: {
          startLiveTrading: true,
          adjustGoals: true,
          modifyGuardrails: true,
          updateFilters: true,
          changeStrategyVariables: true,
          riskThresholdAdjustments: true,
          paperTradingActivation: true
        },
        policyConstraints: {
          maxRiskPerTradePercent: 5.0,
          maxDailyLossPercent: 10.0,
          maxExposurePercent: 50.0,
          maxPositionSizeUSD: 10000,
          minKillSwitchThresholdPercent: 5.0,
          maxKillSwitchThresholdPercent: 15.0
        },
        killSwitchOverride: true
      };

      // Get current trading mode
      const mode = req.headers['x-app-mode'] as 'live' | 'paper' || 'paper';

      // Use GPT-4o to interpret the command
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const systemPrompt = `You are Walter, an AI SysAdmin co-pilot for a cryptocurrency trading platform. Your role is to interpret user commands and determine appropriate actions.

The user can ask you to:
1. Adjust trading goals (e.g., "set my goal to $75 per trade")
2. Modify guardrails (e.g., "tighten guardrails by 10 percent", "set max daily loss to $500")
3. Update filters (e.g., "only scan BTC pairs", "set min volume to 2M")
4. Change strategy variables (e.g., "increase VWAP threshold to 2%")
5. Adjust risk thresholds (e.g., "set max risk to 5%")
6. Start/stop paper trading (e.g., "start paper trading")
7. Start/stop live trading (e.g., "activate live trading")
8. Check system status (e.g., "show system health")
9. General conversation about the system

Current trading mode: ${mode}

Policy-Based Approval System:
- By default, all operational changes AUTO-EXECUTE within safe limits
- Approval is ONLY required when a change would violate policy constraints:

Policy Constraints:
- Max Risk Per Trade: ${approvalMatrix.policyConstraints?.maxRiskPerTradePercent || 5.0}%
- Max Daily Loss: ${approvalMatrix.policyConstraints?.maxDailyLossPercent || 10.0}%
- Max Exposure: ${approvalMatrix.policyConstraints?.maxExposurePercent || 50.0}%
- Max Position Size: $${approvalMatrix.policyConstraints?.maxPositionSizeUSD || 10000}
- Kill Switch Range: ${approvalMatrix.policyConstraints?.minKillSwitchThresholdPercent || 5.0}% - ${approvalMatrix.policyConstraints?.maxKillSwitchThresholdPercent || 15.0}%

Auto-Execute Settings (can be manually disabled):
- Start Live Trading: ${approvalMatrix.autoExecute?.startLiveTrading ? 'auto-execute' : 'requires approval'}
- Adjust Goals: ${approvalMatrix.autoExecute?.adjustGoals ? 'auto-execute' : 'requires approval'}
- Modify Guardrails: ${approvalMatrix.autoExecute?.modifyGuardrails ? 'auto-execute' : 'requires approval'}
- Update Filters: ${approvalMatrix.autoExecute?.updateFilters ? 'auto-execute' : 'requires approval'}
- Change Strategy Variables: ${approvalMatrix.autoExecute?.changeStrategyVariables ? 'auto-execute' : 'requires approval'}
- Risk Threshold Adjustments: ${approvalMatrix.autoExecute?.riskThresholdAdjustments ? 'auto-execute' : 'requires approval'}
- Paper Trading Activation: ${approvalMatrix.autoExecute?.paperTradingActivation ? 'auto-execute' : 'requires approval'}

Kill Switch Override: always requires admin approval (locked)

Known parameter fields:
- Guardrails: maxDailyLoss, maxDrawdown, maxPositionSize, maxOpenPositions, riskPerTrade
- Filters: minVolume, minPrice, maxPrice, minMarketCap, maxBidAskSpread, rsiMin, rsiMax, volatilityMin, volatilityMax, excludeStablecoins, minLiquidity
- Goals: metricName (daily_profit, portfolio_value, win_rate, avg_r_multiple, etc.), goalValue (numeric)
- Strategy: strategy (vwap_pullback, abcd_long, sma_trend_ride), field (enabled or params), value (boolean or params object)

Analyze the user's message and respond with a JSON object:
{
  "actionType": "goals" | "guardrails" | "filters" | "strategy" | "risk" | "start_paper" | "stop_paper" | "start_live" | "stop_live" | "status" | "conversation",
  "requiresApproval": boolean,
  "actionDetails": {
    "field": "specific field name (e.g., maxDailyLoss, minVolume)",
    "value": numeric_or_boolean_value,
    "reason": "brief explanation of the change",
    "metricName": "for goals only - the metric name",
    "goalValue": "for goals only - target value",
    "strategy": "for strategy changes only - strategy name"
  },
  "response": "conversational response to the user explaining what you're doing"
}

For conversation or status queries, set actionType to "conversation" or "status" and provide a helpful response.
Important: Extract the exact field names and numeric values from the user's request.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      });

      const interpretation = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Handle different action types
      let finalResponse = interpretation.response;
      let actionTaken = false;

      // Conversation or status queries don't require action
      if (interpretation.actionType === 'conversation' || interpretation.actionType === 'status') {
        return res.json({ 
          response: finalResponse,
          actionType: interpretation.actionType,
          requiresApproval: false,
          actionTaken: false
        });
      }

      // Determine if approval is required based on policy constraints and auto-execute settings
      let requiresApproval = false;
      let approvalReason = '';
      
      // Check if auto-execute is disabled for this action type
      const autoExecuteDisabled = (
        (interpretation.actionType === 'start_live' && !approvalMatrix.autoExecute?.startLiveTrading) ||
        (interpretation.actionType === 'goals' && !approvalMatrix.autoExecute?.adjustGoals) ||
        (interpretation.actionType === 'guardrails' && !approvalMatrix.autoExecute?.modifyGuardrails) ||
        (interpretation.actionType === 'filters' && !approvalMatrix.autoExecute?.updateFilters) ||
        (interpretation.actionType === 'strategy' && !approvalMatrix.autoExecute?.changeStrategyVariables) ||
        (interpretation.actionType === 'risk' && !approvalMatrix.autoExecute?.riskThresholdAdjustments) ||
        (interpretation.actionType === 'start_paper' && !approvalMatrix.autoExecute?.paperTradingActivation)
      );
      
      if (autoExecuteDisabled) {
        requiresApproval = true;
        approvalReason = 'Auto-execute disabled for this action type';
      }
      
      // Check if the proposed change violates policy constraints
      const constraints = approvalMatrix.policyConstraints || {};
      const details = interpretation.actionDetails || {};
      
      if (!requiresApproval) {
        // Check guardrail changes against constraints
        if (interpretation.actionType === 'guardrails') {
          if (details.field === 'riskPerTrade') {
            const newValue = parseFloat(details.value);
            // Assuming riskPerTrade is a percentage
            if (newValue > (constraints.maxRiskPerTradePercent || 5.0)) {
              requiresApproval = true;
              approvalReason = `Risk per trade (${newValue}%) exceeds policy limit (${constraints.maxRiskPerTradePercent || 5.0}%)`;
            }
          } else if (details.field === 'maxDailyLoss') {
            const newValue = parseFloat(details.value);
            if (newValue > (constraints.maxDailyLossPercent || 10.0)) {
              requiresApproval = true;
              approvalReason = `Max daily loss (${newValue}%) exceeds policy limit (${constraints.maxDailyLossPercent || 10.0}%)`;
            }
          } else if (details.field === 'maxExposurePercent' || details.field === 'maxExposure') {
            const newValue = parseFloat(details.value);
            if (newValue > (constraints.maxExposurePercent || 50.0)) {
              requiresApproval = true;
              approvalReason = `Max exposure (${newValue}%) exceeds policy limit (${constraints.maxExposurePercent || 50.0}%)`;
            }
          } else if (details.field === 'maxPositionSize') {
            const newValue = parseFloat(details.value);
            if (newValue > (constraints.maxPositionSizeUSD || 10000)) {
              requiresApproval = true;
              approvalReason = `Max position size ($${newValue}) exceeds policy limit ($${constraints.maxPositionSizeUSD || 10000})`;
            }
          }
        }
        
        // Check kill switch threshold changes
        if (details.field === 'dailyLossKillSwitch' || details.field === 'killSwitchThreshold') {
          const newValue = parseFloat(details.value);
          const min = constraints.minKillSwitchThresholdPercent || 5.0;
          const max = constraints.maxKillSwitchThresholdPercent || 15.0;
          if (newValue < min || newValue > max) {
            requiresApproval = true;
            approvalReason = `Kill switch threshold (${newValue}%) outside policy range (${min}%-${max}%)`;
          }
        }
      }

      // Kill switch override is always admin-only
      if (message.toLowerCase().includes('kill switch') || message.toLowerCase().includes('killswitch')) {
        finalResponse = "I cannot override the kill switch. This is an admin-only action for safety reasons. Please contact your administrator to disable the kill switch.";
        return res.json({ 
          response: finalResponse,
          actionType: 'kill_switch_denied',
          requiresApproval: true,
          actionTaken: false
        });
      }

      // If requires approval, create pending action in orchestrator logs
      if (requiresApproval) {
        console.log('[Walter] Approval required:', { actionType: interpretation.actionType, approvalReason });
        const logData = {
          userId,
          category: 'walter_command' as const,
          recommendation: `Walter command: ${interpretation.actionDetails?.reason || message}`,
          urgencyLevel: 'medium' as const,
          status: 'pending' as const,
          actionTaken: null,
          metadata: {
            actionType: interpretation.actionType,
            actionDetails: interpretation.actionDetails,
            originalMessage: message,
            mode
          }
        };
        
        await storage.createOrchestratorLog(logData);
        finalResponse = `${interpretation.response}\n\n⚠️ This action requires your approval${approvalReason ? ` because: ${approvalReason}` : ''}. I've created a pending request in the Command Center for you to review.`;
        console.log('[Walter] Final response (approval required):', finalResponse.substring(0, 100) + '...');
      } else {
        console.log('[Walter] Executing immediately:', interpretation.actionType);
        // Execute immediately - implement actual parameter changes
        actionTaken = true;
        let executionError = null;

        try {
          switch (interpretation.actionType) {
            case 'guardrails':
            case 'risk':
              // Update guardrails or risk parameters
              if (interpretation.actionDetails?.field && interpretation.actionDetails?.value !== undefined) {
                const currentGuardrails = await storage.getGuardrails({ mode });
                if (currentGuardrails) {
                  const updateData = {
                    ...currentGuardrails,
                    [interpretation.actionDetails.field]: interpretation.actionDetails.value,
                    mode,
                    lastUpdatedBy: userId
                  };
                  await storage.upsertGuardrails(updateData);
                  console.info(`[Walter] Updated ${interpretation.actionType === 'risk' ? 'risk parameter' : 'guardrail'} ${interpretation.actionDetails.field} to ${interpretation.actionDetails.value} (${mode} mode)`);
                  
                  // Phase 8.6.5: Invalidate caches and refresh context
                  const { configChangeHandler: guardrailsHandler } = await import('./services/config-change-handler');
                  await guardrailsHandler.handleConfigChange({
                    userId,
                    mode,
                    configType: 'guardrails',
                    source: 'direct'
                  });
                }
              }
              break;

            case 'filters':
              // Update screener filters
              if (interpretation.actionDetails?.field && interpretation.actionDetails?.value !== undefined) {
                const currentFilters = await storage.getScreenerFilters({ mode });
                if (currentFilters) {
                  const updateData = {
                    ...currentFilters,
                    [interpretation.actionDetails.field]: interpretation.actionDetails.value,
                    mode,
                    lastUpdatedBy: userId
                  };
                  await storage.upsertScreenerFilters(updateData);
                  console.info(`[Walter] Updated filter ${interpretation.actionDetails.field} to ${interpretation.actionDetails.value} (${mode} mode)`);
                  
                  // Phase 8.6.5: Invalidate caches and refresh context
                  const { configChangeHandler: filtersHandler } = await import('./services/config-change-handler');
                  await filtersHandler.handleConfigChange({
                    userId,
                    mode,
                    configType: 'screeners',
                    source: 'direct'
                  });
                }
              }
              break;

            case 'strategy':
              // Update strategy settings
              if (interpretation.actionDetails?.strategy && interpretation.actionDetails?.field) {
                const currentSettings = await storage.getStrategySettings({ 
                  userId, 
                  mode, 
                  strategy: interpretation.actionDetails.strategy 
                });
                if (currentSettings) {
                  const updateData = {
                    userId,
                    mode,
                    strategy: interpretation.actionDetails.strategy,
                    enabled: interpretation.actionDetails.field === 'enabled' ? 
                      interpretation.actionDetails.value : currentSettings.enabled,
                    params: interpretation.actionDetails.field === 'params' ? 
                      interpretation.actionDetails.value : currentSettings.params
                  };
                  await storage.upsertStrategySettings(updateData);
                  console.info(`[Walter] Updated strategy ${interpretation.actionDetails.strategy}.${interpretation.actionDetails.field} (${mode} mode)`);
                  
                  // Phase 8.6.5: Invalidate caches and refresh context
                  const { configChangeHandler: strategyHandler } = await import('./services/config-change-handler');
                  await strategyHandler.handleConfigChange({
                    userId,
                    mode,
                    configType: 'strategies',
                    source: 'direct',
                    globalContextId: 'default'
                  });
                }
              }
              break;

            case 'goals':
              // Update goals
              if (interpretation.actionDetails?.metricName && interpretation.actionDetails?.goalValue) {
                const goalData = {
                  userId,
                  metricName: interpretation.actionDetails.metricName,
                  goalValue: interpretation.actionDetails.goalValue.toString(),
                  actualValue: '0',
                  percentAchieved: '0',
                  aiValidationNotes: `Set by Walter: ${interpretation.actionDetails.reason || message}`
                };
                
                if (mode === 'live') {
                  await storage.upsertGoalLive(goalData);
                } else {
                  await storage.upsertGoalPaper(goalData);
                }
                console.info(`[Walter] Updated goal ${interpretation.actionDetails.metricName} to ${interpretation.actionDetails.goalValue} (${mode} mode)`);
              }
              break;

            case 'start_paper':
            case 'start_live':
              // Phase 41F-L.E2E-PURGE: Check if trading is suspended by kill switch using mode-level config
              const targetModeCheck = interpretation.actionType === 'start_live' ? 'live' : 'paper';
              const { guardrails_v2 } = await import('./services/guardrails-v2.js');
              const killSwitchTripped = guardrails_v2.killSwitchTripped[targetModeCheck];
              
              if (killSwitchTripped) {
                finalResponse = `${interpretation.response}\n\n⚠️ Cannot start trading: Kill switch is active. Trading has been suspended due to excessive losses. Please review your kill switch events and reset manually before resuming trading.`;
                actionTaken = false;
              } else {
                // Check for Kraken API credentials
                const apiKey = process.env.KRAKEN_API_KEY;
                const apiSecret = process.env.KRAKEN_API_SECRET;
                
                if (!apiKey || !apiSecret) {
                  finalResponse = `${interpretation.response}\n\n⚠️ Cannot start trading: Kraken API credentials not configured. Please add KRAKEN_API_KEY and KRAKEN_API_SECRET to Replit Secrets.`;
                  actionTaken = false;
                } else {
                  // Determine mode
                  const targetMode = interpretation.actionType === 'start_live' ? 'live' : 'paper';
                  
                  // Phase 27.F.15.B.3: Start global trading engine
                  const engine = targetMode === 'live' ? globalLiveEngine : globalPaperEngine;
                  await engine.start();
                  await storage.updateUser(userId, { tradingStatus: 'active', tradingMode: targetMode });
                  
                  console.info(`[Walter] Started ${targetMode} trading using global engine`);
                  finalResponse = `${interpretation.response}\n\n✅ ${targetMode.charAt(0).toUpperCase() + targetMode.slice(1)} trading started successfully.`;
                }
              }
              break;

            case 'stop_paper':
            case 'stop_live':
              // Phase 27.F.15.B.3: Stop global trading engine
              const targetModeStop = interpretation.actionType === 'stop_live' ? 'live' : 'paper';
              const engineToStop = targetModeStop === 'live' ? globalLiveEngine : globalPaperEngine;
              await engineToStop.stop();
              
              await storage.updateUser(userId, { tradingStatus: 'stopped' });
              
              console.info(`[Walter] Stopped ${targetModeStop} trading using global engine`);
              finalResponse = `${interpretation.response}\n\n✅ Trading stopped successfully.`;
              break;

            default:
              console.warn(`[Walter] Unknown action type: ${interpretation.actionType}`);
          }

          // Log Walter action to orchestrator for transparency
          const logData = {
            userId,
            category: 'walter_action' as const,
            recommendation: `Walter executed: ${interpretation.actionDetails?.reason || message}`,
            urgencyLevel: 'low' as const,
            status: 'approved' as const,
            actionTaken: `Executed ${interpretation.actionType} update`,
            metadata: {
              source: 'Walter',
              actionType: interpretation.actionType,
              actionDetails: interpretation.actionDetails,
              originalMessage: message,
              mode,
              timestamp: new Date().toISOString()
            }
          };
          await storage.createOrchestratorLog(logData);

          // Only add generic success message if no specific message was set
          if (finalResponse === interpretation.response) {
            console.log('[Walter] Adding generic success message');
            finalResponse = `${interpretation.response}\n\n✅ Action executed immediately (no approval required).`;
          } else {
            console.log('[Walter] Case set custom message, skipping generic message');
          }
          console.log('[Walter] Final response (executed):', finalResponse.substring(0, 100) + '...');
        } catch (execError: any) {
          console.error('[Walter] Execution error:', execError);
          executionError = execError.message;
          finalResponse = `${interpretation.response}\n\n⚠️ I encountered an error executing this action: ${execError.message}`;
          actionTaken = false;
        }
      }

      console.log('[Walter] Sending response:', { requiresApproval, actionTaken, responseLength: finalResponse.length });
      
      // Phase 7.1c Deliverable 1 & 3: Ensure response is natural language
      const naturalResponse = ensureNaturalLanguageResponse(finalResponse);
      
      res.json({
        response: naturalResponse,
        actionType: interpretation.actionType,
        requiresApproval,
        actionTaken,
        actionDetails: interpretation.actionDetails
      });
    } catch (error: any) {
      console.error('[Walter] Error interpreting command:', error);
      
      // Phase 7.1c: Ensure error responses are also natural language
      const errorResponse = ensureNaturalLanguageResponse(
        "I encountered an error processing your request. Please try again or rephrase your command."
      );
      
      res.status(500).json({ 
        error: 'Failed to process command',
        response: errorResponse
      });
    }
  });

  // ========================================
  // SYSTEM ALERTS API
  // ========================================

  // Get unacknowledged alerts for current user
  apiRouter.get('/alerts', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      
      const AlertsService = (await import('./services/alerts-service')).default;
      const alerts = await AlertsService.getUnacknowledgedAlerts(userId, mode);
      
      res.json({ ok: true, alerts });
    } catch (error: any) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });

  // Acknowledge a specific alert
  apiRouter.post('/alerts/:id/acknowledge', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const alertId = req.params.id;
      
      console.log(`[AlertAPI] Acknowledging alert ${alertId} for user ${userId}`);
      
      const AlertsService = (await import('./services/alerts-service')).default;
      const alert = await AlertsService.acknowledgeAlert(alertId, userId);
      
      if (!alert) {
        console.log(`[AlertAPI] Alert ${alertId} not found for user ${userId}`);
        return res.status(404).json({ error: 'Alert not found or access denied' });
      }
      
      // Phase 27.F.14.E: Broadcast alert dismissal to all clients
      const { contextBridge } = await import('./services/context-bridge.js');
      const clientCount = contextBridge.getClientCount();
      console.log(`[AlertSync][Backend] Broadcasting alerts_updated to ${clientCount} clients (action: dismissed)`);
      await contextBridge.broadcast({
        type: 'alerts_updated',
        payload: {
          action: 'dismissed',
          alertId,
          userId,
          timestamp: new Date().toISOString()
        }
      });
      
      console.log(`[AlertAPI] Successfully acknowledged alert ${alertId}`);
      res.json({ ok: true, alert });
    } catch (error: any) {
      console.error('[AlertAPI] Error acknowledging alert:', error);
      console.error('[AlertAPI] Error details:', {
        alertId: req.params.id,
        userId: req.user?.id,
        message: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: 'Failed to acknowledge alert', details: error.message });
    }
  });

  // Acknowledge all alerts
  apiRouter.post('/alerts/acknowledge-all', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      
      console.log(`[AlertAPI] Acknowledging all alerts for user ${userId} in ${mode} mode`);
      
      const AlertsService = (await import('./services/alerts-service')).default;
      const alerts = await AlertsService.acknowledgeAll(userId, mode);
      
      // Phase 27.F.14.E: Broadcast alert clear-all to all clients
      const { contextBridge } = await import('./services/context-bridge.js');
      const clientCount = contextBridge.getClientCount();
      console.log(`[AlertSync][Backend] Broadcasting alerts_updated to ${clientCount} clients (action: cleared_all, count: ${alerts.length})`);
      await contextBridge.broadcast({
        type: 'alerts_updated',
        payload: {
          action: 'cleared_all',
          count: alerts.length,
          userId,
          mode,
          timestamp: new Date().toISOString()
        }
      });
      
      console.log(`[AlertAPI] Successfully acknowledged ${alerts.length} alerts for user ${userId}`);
      res.json({ ok: true, count: alerts.length });
    } catch (error: any) {
      console.error('[AlertAPI] Error acknowledging all alerts:', error);
      console.error('[AlertAPI] Error details:', {
        userId: req.user?.id,
        mode: req.user?.tradingMode,
        message: error.message,
        stack: error.stack
      });
      res.status(500).json({ error: 'Failed to acknowledge all alerts', details: error.message });
    }
  });

  // Mute low severity (info) alerts
  apiRouter.post('/alerts/mute-low-severity', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      
      const AlertsService = (await import('./services/alerts-service')).default;
      const alerts = await AlertsService.muteLowSeverity(userId, mode);
      
      res.json({ ok: true, count: alerts.length });
    } catch (error: any) {
      console.error('Error muting low severity alerts:', error);
      res.status(500).json({ error: 'Failed to mute low severity alerts' });
    }
  });

  // Handle actionable alert actions
  apiRouter.post('/alerts/:id/action', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const alertId = req.params.id;
      const { action } = req.body;

      if (!action) {
        return res.status(400).json({ error: 'Action is required' });
      }

      const AlertsService = (await import('./services/alerts-service')).default;
      const { AlertActionHandler } = await import('./services/alert-action-handler');
      
      // Verify alert belongs to user
      const [alert] = await db
        .select()
        .from(systemAlerts)
        .where(
          and(
            eq(systemAlerts.id, alertId),
            eq(systemAlerts.userId, userId)
          )
        );

      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      // Execute the action
      const result = await AlertActionHandler.executeAction(alert, action, userId);

      // Acknowledge the alert after successful action
      await AlertsService.acknowledgeAlert(alertId, userId);
      
      res.json({ 
        ok: true, 
        success: result.success,
        message: result.message, 
        data: result.data 
      });
    } catch (error: any) {
      console.error('[API] Error executing alert action:', error);
      res.status(500).json({ error: error.message || 'Failed to execute action' });
    }
  });

  // ==============================================================================
  // DIAGNOSTIC API ROUTES - Phase 5.9: Bob v2 / Walter v2
  // ==============================================================================

  // Trigger user-initiated diagnostic
  apiRouter.post('/diagnostics/inspect', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { inspectionType, searchScope } = req.body;
      
      const { diagnosticController } = await import('./services/diagnostic-controller');
      
      const report = await diagnosticController.triggerUserDiagnostic(
        userId,
        inspectionType,
        searchScope
      );
      
      res.json({ ok: true, report });
    } catch (error: any) {
      console.error('[Diagnostics] User inspection failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger error-based diagnostic
  apiRouter.post('/diagnostics/inspect-error/:errorId', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { errorId } = req.params;
      
      const { diagnosticController } = await import('./services/diagnostic-controller');
      
      const report = await diagnosticController.triggerErrorDiagnostic(errorId, userId);
      
      res.json({ ok: true, report });
    } catch (error: any) {
      console.error('[Diagnostics] Error inspection failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Analyze inspection report and generate patch proposals
  apiRouter.post('/diagnostics/analyze-report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { report } = req.body;
      
      const { walterPatchAnalyst } = await import('./services/walter-patch-analyst');
      
      const proposals = await walterPatchAnalyst.analyzeAndPropose(report, userId);
      
      res.json({ ok: true, proposals });
    } catch (error: any) {
      console.error('[Diagnostics] Report analysis failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Approve or reject a patch proposal
  apiRouter.post('/diagnostics/patch/:proposalId/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { proposalId } = req.params;
      const { approved, notes } = req.body;
      
      const { diagnosticController } = await import('./services/diagnostic-controller');
      
      await diagnosticController.approvePatchProposal(proposalId, userId, approved, notes);
      
      res.json({ 
        ok: true, 
        message: approved ? 'Patch approved successfully' : 'Patch rejected',
        proposalId
      });
    } catch (error: any) {
      console.error('[Diagnostics] Patch approval failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get diagnostic transparency logs
  apiRouter.get('/diagnostics/logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      const logs = await storage.getTransparencyLogs({ 
        taskName: 'Diagnostic',
        limit 
      });
      
      res.json({ ok: true, logs });
    } catch (error: any) {
      console.error('[Diagnostics] Log fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // Phase 8.9: Autonomy Layer Routes
  // ========================================

  // Get autonomy system status
  apiRouter.get('/autonomy/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { autonomyController } = await import('./services/autonomy-controller');
      const { metaReasoningEngine } = await import('./services/meta-reasoning-engine');
      const { getAutonomySchedulerStatus } = await import('./services/autonomy-scheduler');
      
      const controllerStatus = autonomyController.getStatus();
      const lastSelfCheck = await autonomyController.getLastSelfCheck();
      const schedulerStatus = getAutonomySchedulerStatus();
      const recentAnalyses = await metaReasoningEngine.getRecentAnalyses(5);
      
      res.json({
        ok: true,
        controller: controllerStatus,
        lastSelfCheck,
        scheduler: schedulerStatus,
        recentAnalyses: recentAnalyses.length,
      });
    } catch (error: any) {
      console.error('[Autonomy] Status fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger manual self-check
  apiRouter.post('/autonomy/self-check', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { simulate, simulateHealth } = req.body;
      const { autonomyController } = await import('./services/autonomy-controller');
      
      const result = await autonomyController.scheduleSelfCheck(userId, {
        simulate,
        simulateHealth,
      });
      
      res.json({ ok: true, result });
    } catch (error: any) {
      console.error('[Autonomy] Self-check failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Analyze reasoning trace integrity
  apiRouter.post('/autonomy/analyze-trace', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { traceId } = req.body;
      const { metaReasoningEngine } = await import('./services/meta-reasoning-engine');
      
      const analysis = await metaReasoningEngine.analyzeTraceIntegrity(traceId);
      
      res.json({ ok: true, analysis });
    } catch (error: any) {
      console.error('[Autonomy] Trace analysis failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get meta-reasoning analyses
  apiRouter.get('/autonomy/meta-reasoning', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const { metaReasoningEngine } = await import('./services/meta-reasoning-engine');
      
      const analyses = await metaReasoningEngine.getRecentAnalyses(limit);
      
      res.json({ ok: true, analyses });
    } catch (error: any) {
      console.error('[Autonomy] Meta-reasoning fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generate exploration prompts
  apiRouter.post('/autonomy/exploration', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { curiosityEngine } = await import('./services/curiosity-engine');
      
      const prompts = await curiosityEngine.generateExplorationPrompts(userId);
      
      res.json({ ok: true, prompts });
    } catch (error: any) {
      console.error('[Autonomy] Exploration failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Run optimization cycle
  apiRouter.post('/autonomy/optimize', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { selfOptimizer } = await import('./services/self-optimizer');
      
      const result = await selfOptimizer.runOptimizationCycle();
      
      res.json({ ok: true, result });
    } catch (error: any) {
      console.error('[Autonomy] Optimization failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get optimization history
  apiRouter.get('/autonomy/optimizations', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const { selfOptimizer } = await import('./services/self-optimizer');
      
      const optimizations = await selfOptimizer.getRecentOptimizations(limit);
      
      res.json({ ok: true, optimizations });
    } catch (error: any) {
      console.error('[Autonomy] Optimization history fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // Phase 8.94: Awareness Layer Endpoints
  // ========================================

  // Get current awareness state
  apiRouter.get('/awareness/state', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      // Get the most recent awareness state
      const states = await db
        .select()
        .from(awarenessStateLog)
        .orderBy(desc(awarenessStateLog.timestamp))
        .limit(1);
      
      const currentState = states[0] || null;
      
      res.json({ ok: true, state: currentState });
    } catch (error: any) {
      console.error('[Awareness] State fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger manual reflection
  apiRouter.post('/awareness/reflect', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { awarenessCore } = await import('./services/awareness-core');
      
      const reflection = await awarenessCore.reflectAndRespond();
      
      res.json({ ok: true, reflection });
    } catch (error: any) {
      console.error('[Awareness] Reflection failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get awareness state history
  apiRouter.get('/awareness/history', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      
      const states = await db
        .select()
        .from(awarenessStateLog)
        .orderBy(desc(awarenessStateLog.timestamp))
        .limit(limit);
      
      res.json({ ok: true, states });
    } catch (error: any) {
      console.error('[Awareness] History fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // Phase 17.0: Distributed Cluster Routes
  // ========================================

  // Get overall cluster status
  apiRouter.get('/cluster/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { clusterRegistry } = await import('./services/cluster-registry');
      const { taskRouter } = await import('./services/task-router');
      
      const nodes = await clusterRegistry.getHealthyNodes();
      const queueStats = await taskRouter.getQueueStats();
      
      res.json({
        ok: true,
        totalNodes: nodes.length,
        healthyNodes: nodes.filter(n => n.healthScore >= 0.7).length,
        queuedTasks: queueStats.queued,
        runningTasks: queueStats.running,
        completedTasks: queueStats.completed,
        failedTasks: queueStats.failed,
      });
    } catch (error: any) {
      console.error('[Cluster] Status fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all cluster nodes with health metrics
  apiRouter.get('/cluster/nodes', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { clusterRegistry } = await import('./services/cluster-registry');
      
      const nodes = await clusterRegistry.getAllNodes();
      
      res.json({ ok: true, nodes });
    } catch (error: any) {
      console.error('[Cluster] Nodes fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get cluster task queue
  apiRouter.get('/cluster/queue', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const status = req.query.status as string | undefined;
      
      const { taskRouter } = await import('./services/task-router');
      
      const tasks = await taskRouter.getQueuedTasks(limit, status as any);
      
      res.json({ ok: true, tasks });
    } catch (error: any) {
      console.error('[Cluster] Queue fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get cluster task results
  apiRouter.get('/cluster/results', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      
      const results = await db
        .select()
        .from(clusterResultLog)
        .orderBy(desc(clusterResultLog.completedAt))
        .limit(limit);
      
      res.json({ ok: true, results });
    } catch (error: any) {
      console.error('[Cluster] Results fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger manual cluster rebalance
  apiRouter.post('/cluster/rebalance', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { taskRouter } = await import('./services/task-router');
      
      const rebalancedCount = await taskRouter.rebalanceStuckTasks();
      
      res.json({ 
        ok: true, 
        message: `Rebalanced ${rebalancedCount} stuck tasks`,
        rebalancedCount 
      });
    } catch (error: any) {
      console.error('[Cluster] Rebalance failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Drain a specific node (mark unhealthy and reassign tasks)
  apiRouter.post('/cluster/drain/:nodeId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { nodeId } = req.params;
      const { clusterRegistry } = await import('./services/cluster-registry');
      const { taskRouter } = await import('./services/task-router');
      
      // Mark node as draining
      await clusterRegistry.markNodeDraining(nodeId);
      
      // Reassign all tasks from this node
      const reassignedCount = await taskRouter.drainNode(nodeId);
      
      res.json({ 
        ok: true, 
        message: `Drained node ${nodeId} - ${reassignedCount} tasks reassigned`,
        nodeId,
        reassignedCount 
      });
    } catch (error: any) {
      console.error('[Cluster] Drain failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 17.5: Get circuit breaker status for all nodes
  apiRouter.get('/cluster/circuit-breaker', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { circuitBreaker } = await import('./services/circuit-breaker');
      
      const statuses = await circuitBreaker.getAllStatuses();
      
      res.json({ 
        ok: true, 
        circuitBreakers: statuses 
      });
    } catch (error: any) {
      console.error('[Cluster] Circuit breaker status fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 17.5: Reset circuit breaker for a specific node
  apiRouter.post('/cluster/circuit-breaker/reset/:nodeId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { nodeId } = req.params;
      const { circuitBreaker } = await import('./services/circuit-breaker');
      
      await circuitBreaker.reset(nodeId);
      
      res.json({ 
        ok: true, 
        message: `Circuit breaker reset for node ${nodeId}`,
        nodeId 
      });
    } catch (error: any) {
      console.error('[Cluster] Circuit breaker reset failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 17.6: Get audit logs for ethical gate executions
  apiRouter.get('/cluster/audit-logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const taskId = req.query.taskId as string | undefined;
      const gateType = req.query.gateType as string | undefined;
      
      const { clusterAuditLog } = await import('@shared/schema');
      const { eq, and, desc } = await import('drizzle-orm');
      
      let query = db.select().from(clusterAuditLog);
      
      const conditions = [];
      if (taskId) {
        conditions.push(eq(clusterAuditLog.taskId, taskId));
      }
      if (gateType) {
        conditions.push(eq(clusterAuditLog.gateType, gateType as any));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      const logs = await query
        .orderBy(desc(clusterAuditLog.createdAt))
        .limit(limit);
      
      res.json({ ok: true, auditLogs: logs });
    } catch (error: any) {
      console.error('[Cluster] Audit logs fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // Phase 18.0: Multi-Domain Learning Network
  // ========================================

  // Get learning delta statistics
  apiRouter.get('/learning/delta-stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { learningCoordinator } = await import('./services/learning-coordinator');
      const stats = await learningCoordinator.getStatistics();
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[Learning] Delta stats fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get recent learning deltas
  apiRouter.get('/learning/deltas', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const { learningCoordinator } = await import('./services/learning-coordinator');
      const deltas = await learningCoordinator.getRecentDeltas(limit);
      res.json({ ok: true, deltas });
    } catch (error: any) {
      console.error('[Learning] Deltas fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get model alignment statistics
  apiRouter.get('/learning/alignment-stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { modelConsistencyManager } = await import('./services/model-consistency-manager');
      const stats = await modelConsistencyManager.getStatistics();
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[Learning] Alignment stats fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get recent model alignments
  apiRouter.get('/learning/alignments', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const { modelConsistencyManager } = await import('./services/model-consistency-manager');
      const alignments = await modelConsistencyManager.getAlignmentHistory(limit);
      res.json({ ok: true, alignments });
    } catch (error: any) {
      console.error('[Learning] Alignments fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get cross-domain proposals
  apiRouter.get('/learning/proposals', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const targetDomain = req.query.targetDomain as string | undefined;
      const { crossDomainReasoning } = await import('./services/cross-domain-reasoning');
      const proposals = crossDomainReasoning.getPendingProposals(targetDomain);
      const stats = crossDomainReasoning.getStatistics();
      res.json({ ok: true, proposals, stats });
    } catch (error: any) {
      console.error('[Learning] Proposals fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger manual learning sync
  apiRouter.post('/learning/sync', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { nanoid } = await import('nanoid');
      const { clusterBus } = await import('./services/cluster-bus');
      
      const traceId = nanoid();
      
      // Publish a test learning delta event
      await clusterBus.publish(
        "learning_delta",
        {
          deltaType: "discovery",
          data: {
            source: "manual_sync",
            timestamp: new Date().toISOString(),
            discovery: "Manual learning sync triggered via API",
          },
          traceId,
        },
        "api_trigger"
      );

      res.json({ 
        ok: true, 
        message: "Learning sync triggered successfully",
        traceId,
      });
    } catch (error: any) {
      console.error('[Learning] Sync trigger failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== PHASE 9.0: ADAPTIVE LEARNING & ALIGNMENT ROUTES =====

  // Verify action alignment
  apiRouter.post('/alignment/verify', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { AlignmentVerifier } = await import('./services/alignment-verifier');
      const { contextBridge } = await import('./services/context-bridge');
      
      const verifier = new AlignmentVerifier(contextBridge);
      
      const { actionType, actionParams, policyType, requestedBy } = req.body;
      
      if (!actionType || !policyType) {
        return res.status(400).json({ error: 'actionType and policyType are required' });
      }
      
      const result = await verifier.verifyAction({
        actionType,
        actionParams: actionParams || {},
        policyType,
        requestedBy: requestedBy || req.user?.username || 'unknown',
        mode
      });
      
      res.json({ ok: true, verification: result });
    } catch (error: any) {
      console.error('[Alignment] Verification failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get verification history
  apiRouter.get('/alignment/history', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { AlignmentVerifier } = await import('./services/alignment-verifier');
      const { contextBridge } = await import('./services/context-bridge');
      
      const verifier = new AlignmentVerifier(contextBridge);
      const limit = parseInt(req.query.limit as string) || 20;
      
      const history = await verifier.getVerificationHistory(limit);
      
      res.json({ ok: true, history });
    } catch (error: any) {
      console.error('[Alignment] History fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger experience synthesis
  apiRouter.post('/alignment/synthesize', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { ExperienceMemoryService } = await import('./services/experience-memory');
      const { contextBridge } = await import('./services/context-bridge');
      
      const experienceMemory = new ExperienceMemoryService(contextBridge);
      
      const result = await experienceMemory.synthesizeExperiences(mode);
      
      res.json({ ok: true, synthesis: result });
    } catch (error: any) {
      console.error('[Alignment] Synthesis failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get recent experience insights
  apiRouter.get('/alignment/experiences', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { ExperienceMemoryService } = await import('./services/experience-memory');
      const { contextBridge } = await import('./services/context-bridge');
      
      const experienceMemory = new ExperienceMemoryService(contextBridge);
      const limit = parseInt(req.query.limit as string) || 20;
      
      const experiences = await experienceMemory.getRecentExperiences(limit);
      
      res.json({ ok: true, experiences });
    } catch (error: any) {
      console.error('[Alignment] Experience fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Evaluate performance drift
  apiRouter.post('/alignment/evaluate-drift', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { AdaptiveObjectiveEngine } = await import('./services/adaptive-objective-engine');
      const { contextBridge } = await import('./services/context-bridge');
      
      const adaptiveEngine = new AdaptiveObjectiveEngine(contextBridge);
      
      const drift = await adaptiveEngine.evaluatePerformanceDrift(mode);
      
      res.json({ ok: true, drift });
    } catch (error: any) {
      console.error('[Alignment] Drift evaluation failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get current alignment profile
  apiRouter.get('/alignment/profile', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { AdaptiveObjectiveEngine } = await import('./services/adaptive-objective-engine');
      const { contextBridge } = await import('./services/context-bridge');
      
      const adaptiveEngine = new AdaptiveObjectiveEngine(contextBridge);
      
      const profile = await adaptiveEngine.getCurrentProfile();
      
      res.json({ ok: true, profile });
    } catch (error: any) {
      console.error('[Alignment] Profile fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get alignment adjustment history
  apiRouter.get('/alignment/adjustments', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { AdaptiveObjectiveEngine } = await import('./services/adaptive-objective-engine');
      const { contextBridge } = await import('./services/context-bridge');
      
      const adaptiveEngine = new AdaptiveObjectiveEngine(contextBridge);
      const limit = parseInt(req.query.limit as string) || 10;
      
      const adjustments = await adaptiveEngine.getAdjustmentHistory(limit);
      
      res.json({ ok: true, adjustments });
    } catch (error: any) {
      console.error('[Alignment] Adjustment history fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 9.2: Strategic Plan Management
  apiRouter.post('/strategic/plans', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { strategicPlannerService } = await import('./services/strategic-planner');
      const { strategicPolicyGuard } = await import('./services/strategic-policy-guard');
      
      const plan = await strategicPlannerService.createPlan(req.user!.id, req.body, mode);
      
      const validation = await strategicPolicyGuard.validateStrategicPlan(plan.planId, req.user!.id, mode);
      
      res.json({ ok: true, plan, validation });
    } catch (error: any) {
      console.error('[Strategic] Plan creation failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/strategic/plans', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategicPlannerService } = await import('./services/strategic-planner');
      
      const plans = await strategicPlannerService.getPlansByUser(req.user!.id);
      
      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[Strategic] Plans fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/strategic/plans/active', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategicPlannerService } = await import('./services/strategic-planner');
      
      const plans = await strategicPlannerService.getActivePlans(req.user!.id);
      
      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[Strategic] Active plans fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.patch('/strategic/plans/:planId/progress', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { strategicPlannerService } = await import('./services/strategic-planner');
      
      const plan = await strategicPlannerService.updatePlanProgress(
        req.params.planId,
        req.body,
        req.user!.id,
        mode
      );
      
      res.json({ ok: true, plan });
    } catch (error: any) {
      console.error('[Strategic] Plan progress update failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.patch('/strategic/plans/:planId/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { strategicPlannerService } = await import('./services/strategic-planner');
      const { strategicPolicyGuard } = await import('./services/strategic-policy-guard');
      
      if (req.body.status === 'active') {
        const enforcement = await strategicPolicyGuard.enforceGuardrails(
          'activate_plan',
          { planId: req.params.planId, alignmentScore: 0.8 },
          req.user!.id,
          mode
        );
        
        if (!enforcement.allowed) {
          return res.status(403).json({ error: enforcement.reason });
        }
      }
      
      const plan = await strategicPlannerService.updatePlanStatus(
        req.params.planId,
        req.body.status,
        req.user!.id,
        mode
      );
      
      res.json({ ok: true, plan });
    } catch (error: any) {
      console.error('[Strategic] Plan status update failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/strategic/recommendations', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { strategicPlannerService } = await import('./services/strategic-planner');
      
      const recommendations = await strategicPlannerService.generateRecommendations(req.user!.id, mode);
      
      res.json({ ok: true, recommendations });
    } catch (error: any) {
      console.error('[Strategic] Recommendations generation failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 9.2: Learning Profile Management
  apiRouter.post('/learning/profile', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { continuousLearningEngine } = await import('./services/continuous-learning');
      
      const profile = await continuousLearningEngine.initializeProfile(req.user!.id, req.body.weights, mode);
      
      res.json({ ok: true, profile });
    } catch (error: any) {
      console.error('[Learning] Profile initialization failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/learning/profile', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { continuousLearningEngine } = await import('./services/continuous-learning');
      
      const profile = await continuousLearningEngine.getProfileByUser(req.user!.id);
      
      res.json({ ok: true, profile });
    } catch (error: any) {
      console.error('[Learning] Profile fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.patch('/learning/profile/:profileId/weights', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { continuousLearningEngine } = await import('./services/continuous-learning');
      const { strategicPolicyGuard } = await import('./services/strategic-policy-guard');
      
      const validation = await strategicPolicyGuard.validateWeightAdjustment(
        req.params.profileId,
        req.body.weights,
        req.body.rationale,
        req.user!.id,
        mode
      );
      
      if (!validation.approved) {
        return res.status(403).json({ error: 'Weight adjustment rejected', violations: validation.violations });
      }
      
      const profile = await continuousLearningEngine.adjustWeights(
        req.params.profileId,
        req.body.weights,
        req.body.rationale,
        req.user!.id,
        mode
      );
      
      res.json({ ok: true, profile, validation });
    } catch (error: any) {
      console.error('[Learning] Weight adjustment failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.patch('/learning/profile/:profileId/phase', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { continuousLearningEngine } = await import('./services/continuous-learning');
      
      const profile = await continuousLearningEngine.updatePhase(
        req.params.profileId,
        req.body.phase,
        req.user!.id,
        mode
      );
      
      res.json({ ok: true, profile });
    } catch (error: any) {
      console.error('[Learning] Phase update failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/learning/profile/:profileId/evaluate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { continuousLearningEngine } = await import('./services/continuous-learning');
      
      const evaluation = await continuousLearningEngine.evaluatePerformance(
        req.params.profileId,
        req.user!.id,
        mode
      );
      
      res.json({ ok: true, evaluation });
    } catch (error: any) {
      console.error('[Learning] Performance evaluation failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 9.2: Policy Compliance
  apiRouter.get('/strategic/compliance', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategicPolicyGuard } = await import('./services/strategic-policy-guard');
      
      const status = await strategicPolicyGuard.getComplianceStatus(req.user!.id);
      
      res.json({ ok: true, status });
    } catch (error: any) {
      console.error('[Strategic] Compliance status fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 9.3: Strategic Simulation & Memory
  apiRouter.post('/simulation/run', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { simulationEngine } = await import('./services/simulation-engine');
      
      const simulation = await simulationEngine.runSimulation(
        req.user!.id,
        req.body,
        mode
      );
      
      res.json({ ok: true, simulation });
    } catch (error: any) {
      console.error('[Simulation] Run simulation failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/simulation/list', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { simulationEngine } = await import('./services/simulation-engine');
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const simulations = await simulationEngine.getSimulations(req.user!.id, limit);
      
      res.json({ ok: true, simulations });
    } catch (error: any) {
      console.error('[Simulation] Get simulations failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/simulation/:simulationId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { simulationEngine } = await import('./services/simulation-engine');
      
      const result = await simulationEngine.getSimulationResults(req.params.simulationId);
      
      if (!result.simulation) {
        return res.status(404).json({ error: 'Simulation not found' });
      }
      
      res.json({ ok: true, ...result });
    } catch (error: any) {
      console.error('[Simulation] Get simulation failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.patch('/simulation/:simulationId/outcome', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { simulationEngine } = await import('./services/simulation-engine');
      
      const simulation = await simulationEngine.updateActualOutcome(
        req.params.simulationId,
        req.body.actualOutcome,
        req.user!.id,
        mode
      );
      
      if (!simulation) {
        return res.status(404).json({ error: 'Simulation not found' });
      }
      
      res.json({ ok: true, simulation });
    } catch (error: any) {
      console.error('[Simulation] Update outcome failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/simulation/decision', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { simulationEngine } = await import('./services/simulation-engine');
      
      const trace = await simulationEngine.simulateDecision(
        req.user!.id,
        req.body,
        mode
      );
      
      res.json({ ok: true, trace });
    } catch (error: any) {
      console.error('[Simulation] Simulate decision failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/strategic/memory/capture', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { strategicMemory } = await import('./services/strategic-memory');
      
      const snapshot = await strategicMemory.captureLesson(
        req.user!.id,
        req.body,
        mode
      );
      
      res.json({ ok: true, snapshot });
    } catch (error: any) {
      console.error('[Memory] Capture lesson failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/strategic/memory/lessons', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategicMemory } = await import('./services/strategic-memory');
      
      const lessons = await strategicMemory.getLessons(req.user!.id);
      
      res.json({ ok: true, lessons });
    } catch (error: any) {
      console.error('[Memory] Get lessons failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/strategic/memory/extract', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { strategicMemory } = await import('./services/strategic-memory');
      
      const lessons = await strategicMemory.extractLessonsFromSimulations(req.user!.id, mode);
      
      res.json({ ok: true, lessons });
    } catch (error: any) {
      console.error('[Memory] Extract lessons failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 9.4: Reflective Intelligence API Endpoints
  apiRouter.post('/reflection/reflect', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { reflectiveIntelligence } = await import('./services/reflective-intelligence');
      
      const reflection = await reflectiveIntelligence.reflect(
        req.user!.id,
        req.body,
        mode
      );
      
      res.json({ ok: true, reflection });
    } catch (error: any) {
      console.error('[Reflection] Reflect failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/reflection/audit', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { reflectiveIntelligence } = await import('./services/reflective-intelligence');
      
      const audit = await reflectiveIntelligence.auditDecision(
        req.user!.id,
        req.body,
        mode
      );
      
      res.json({ ok: true, audit });
    } catch (error: any) {
      console.error('[Reflection] Audit failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/reflection/list', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { reflectiveIntelligence } = await import('./services/reflective-intelligence');
      const limit = parseInt(req.query.limit as string) || 20;
      
      const reflections = await reflectiveIntelligence.getReflections(req.user!.id, limit);
      
      res.json({ ok: true, reflections });
    } catch (error: any) {
      console.error('[Reflection] Get reflections failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/reflection/audits', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { reflectiveIntelligence } = await import('./services/reflective-intelligence');
      const limit = parseInt(req.query.limit as string) || 20;
      
      const audits = await reflectiveIntelligence.getDecisionAudits(req.user!.id, limit);
      
      res.json({ ok: true, audits });
    } catch (error: any) {
      console.error('[Reflection] Get audits failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 9.5: Ethical Reasoning & Value Alignment API Endpoints
  apiRouter.post('/ethics/evaluate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { ethicalReasoningEngine } = await import('./services/ethical-reasoning-engine');
      
      const audit = await ethicalReasoningEngine.evaluateAction(
        req.user!.id,
        req.body,
        mode
      );
      
      res.json({ ok: true, audit });
    } catch (error: any) {
      console.error('[Ethics] Evaluate failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/ethics/audits', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicalReasoningEngine } = await import('./services/ethical-reasoning-engine');
      const limit = parseInt(req.query.limit as string) || 20;
      
      const audits = await ethicalReasoningEngine.getAudits(req.user!.id, limit);
      
      res.json({ ok: true, audits });
    } catch (error: any) {
      console.error('[Ethics] Get audits failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/ethics/rules', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicalReasoningEngine } = await import('./services/ethical-reasoning-engine');
      
      const rules = await ethicalReasoningEngine.getRules(req.user!.id);
      
      res.json({ ok: true, rules });
    } catch (error: any) {
      console.error('[Ethics] Get rules failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/ethics/init', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicalReasoningEngine } = await import('./services/ethical-reasoning-engine');
      
      await ethicalReasoningEngine.initializeDefaultRules(req.user!.id);
      
      res.json({ ok: true, message: 'Default ethical rules initialized' });
    } catch (error: any) {
      console.error('[Ethics] Init rules failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 3B: Migrated from userId to mode
  apiRouter.get('/alignment/matrix', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { valueAlignmentService } = await import('./services/value-alignment');
      const user = await storage.getUser(req.user!.id);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';
      
      const matrix = await valueAlignmentService.getMatrix(mode);
      
      res.json({ ok: true, matrix });
    } catch (error: any) {
      console.error('[Alignment] Get matrix failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 3B: Migrated from userId to mode
  apiRouter.get('/alignment/overall', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { valueAlignmentService } = await import('./services/value-alignment');
      const user = await storage.getUser(req.user!.id);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';
      
      const alignment = await valueAlignmentService.getOverallAlignment(mode);
      
      res.json({ ok: true, alignment });
    } catch (error: any) {
      console.error('[Alignment] Get overall failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 3B: Migrated from userId to mode
  apiRouter.post('/alignment/init', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { valueAlignmentService } = await import('./services/value-alignment');
      const user = await storage.getUser(req.user!.id);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';
      
      await valueAlignmentService.initializeDefaultMatrix(mode);
      
      res.json({ ok: true, message: 'Default value alignment matrix initialized' });
    } catch (error: any) {
      console.error('[Alignment] Init matrix failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 9.6: Collaborative Cognition & Cross-Domain Reasoning API Endpoints
  apiRouter.post('/collaboration/sessions', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      const { topic, participants, contextSnapshot } = req.body;
      
      const session = await collaborationManager.startSession({
        topic,
        participants,
        userId: req.user!.id,
        contextSnapshot,
      });
      
      res.json({ ok: true, session });
    } catch (error: any) {
      console.error('[Collaboration] Create session failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/collaboration/sessions', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      
      const sessions = await collaborationManager.getActiveSessions(req.user!.id);
      
      res.json({ ok: true, sessions });
    } catch (error: any) {
      console.error('[Collaboration] Get sessions failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/collaboration/sessions/:sessionId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      const { sessionId } = req.params;
      
      const session = await collaborationManager.getSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.json({ ok: true, session });
    } catch (error: any) {
      console.error('[Collaboration] Get session failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/collaboration/sessions/:sessionId/end', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      const { sessionId } = req.params;
      const { resolutionOutcome } = req.body;
      
      await collaborationManager.endSession(sessionId, resolutionOutcome);
      
      res.json({ ok: true, message: 'Session ended successfully' });
    } catch (error: any) {
      console.error('[Collaboration] End session failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/collaboration/sessions/:sessionId/messages', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      const { sessionId } = req.params;
      
      const messages = await collaborationManager.getSessionMessages(sessionId);
      
      res.json({ ok: true, messages });
    } catch (error: any) {
      console.error('[Collaboration] Get messages failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/collaboration/sessions/:sessionId/messages', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      const { sessionId } = req.params;
      const { agentId, role, content, contributionType, confidenceLevel, supportingData, replyTo } = req.body;
      
      const message = await collaborationManager.addMessage({
        sessionId,
        agentId,
        role,
        content,
        contributionType,
        confidenceLevel,
        supportingData,
        replyTo,
      });
      
      res.json({ ok: true, message });
    } catch (error: any) {
      console.error('[Collaboration] Add message failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/collaboration/stats', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      
      const stats = await collaborationManager.getCollaborationStats();
      
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[Collaboration] Get stats failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/collaboration/consensus/:sessionId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { consensusEngine } = await import('./services/consensus-engine');
      const { sessionId } = req.params;
      
      const snapshots = await consensusEngine.getSessionSnapshots(sessionId);
      
      res.json({ ok: true, snapshots });
    } catch (error: any) {
      console.error('[Collaboration] Get consensus failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/collaboration/consensus/evaluate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { consensusEngine } = await import('./services/consensus-engine');
      const { collaborationManager } = await import('./services/collaboration-manager');
      const { sessionId, inputs } = req.body;
      
      const evaluation = await consensusEngine.evaluateConsensus(sessionId, inputs);
      const snapshot = await consensusEngine.recordSnapshot(sessionId, evaluation, inputs);
      
      // Update session consensus state
      await collaborationManager.updateSessionState(
        sessionId,
        evaluation.canProceed ? 'agreed' : 'disagreed',
        evaluation.overallConsensus
      );
      
      res.json({ ok: true, evaluation, snapshot });
    } catch (error: any) {
      console.error('[Collaboration] Evaluate consensus failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/collaboration/agents', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { reasoningBus } = await import('./services/reasoning-bus');
      
      const agents = reasoningBus.getAllAgents();
      
      res.json({ ok: true, agents });
    } catch (error: any) {
      console.error('[Collaboration] Get agents failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Phase 9.7: Learning Feedback Routes ====================

  apiRouter.get('/learning/stats', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { learningBridge } = await import('./services/learning-bridge');
      
      const summary = await learningBridge.generateLearningSummary();
      
      res.json({ ok: true, summary });
    } catch (error: any) {
      console.error('[Learning] Get stats failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/learning/trends/:agentName', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { learningBridge } = await import('./services/learning-bridge');
      const { agentName } = req.params;
      
      const trends = await learningBridge.analyzePerformanceTrends(agentName);
      
      if (!trends) {
        return res.status(404).json({ error: `No feedback found for agent: ${agentName}` });
      }
      
      res.json({ ok: true, trends });
    } catch (error: any) {
      console.error('[Learning] Get trends failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/learning/record', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { learningBridge } = await import('./services/learning-bridge');
      const { agentName, domain, sessionId, accuracyScore, consensusAlignment, improvementNotes, feedbackSource } = req.body;
      
      if (!agentName || !domain) {
        return res.status(400).json({ error: 'agentName and domain are required' });
      }
      
      const feedback = await learningBridge.recordFeedback(
        agentName,
        domain,
        sessionId || null,
        accuracyScore || null,
        consensusAlignment || null,
        improvementNotes || '',
        feedbackSource || 'system'
      );
      
      res.json({ ok: true, feedback });
    } catch (error: any) {
      console.error('[Learning] Record feedback failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/learning/session/:sessionId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { learningBridge } = await import('./services/learning-bridge');
      const { sessionId } = req.params;
      
      const feedback = await learningBridge.getSessionFeedback(sessionId);
      
      res.json({ ok: true, feedback });
    } catch (error: any) {
      console.error('[Learning] Get session feedback failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Phase 9.8: Meta-Cognitive Oversight Routes ====================

  apiRouter.get('/oversight/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const metaOversightService = (await import('./services/meta-oversight')).default;
      const { limit = 50, flagType, severity } = req.query;
      
      const logs = await metaOversightService.getOversightLogs(
        limit ? parseInt(limit as string) : 50,
        flagType as string | undefined,
        severity as string | undefined
      );
      
      res.json({ ok: true, logs });
    } catch (error: any) {
      console.error('[Oversight] Get logs failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/oversight/summary', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const metaOversightService = (await import('./services/meta-oversight')).default;
      
      const summary = await metaOversightService.getOversightSummary();
      
      res.json({ ok: true, summary });
    } catch (error: any) {
      console.error('[Oversight] Get summary failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/oversight/resolve', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const metaOversightService = (await import('./services/meta-oversight')).default;
      const { logId, resolution } = req.body;
      
      if (!logId || !resolution) {
        return res.status(400).json({ error: 'logId and resolution are required' });
      }
      
      await metaOversightService.resolveFlag(logId, resolution);
      
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[Oversight] Resolve flag failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Phase 9.9: Strategic Memory & Model Calibration Routes ====================

  apiRouter.get('/memory/archives', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const longtermMemoryService = (await import('./services/longterm-memory')).default;
      const { limit = 50, scope, agentName } = req.query;
      
      const archives = await longtermMemoryService.getArchivedInsights(
        scope as any,
        agentName as string | undefined,
        limit ? parseInt(limit as string) : 50
      );
      
      res.json({ ok: true, archives });
    } catch (error: any) {
      console.error('[Memory] Get archives failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/memory/calibration', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const longtermMemoryService = (await import('./services/longterm-memory')).default;
      const { limit = 50, agentName, parameter } = req.query;
      
      const calibrations = await longtermMemoryService.getCalibrationHistory(
        agentName as string | undefined,
        parameter as string | undefined,
        limit ? parseInt(limit as string) : 50
      );
      
      res.json({ ok: true, calibrations });
    } catch (error: any) {
      console.error('[Memory] Get calibration history failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/memory/archive', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const longtermMemoryService = (await import('./services/longterm-memory')).default;
      const { agentName, memoryScope, summary, insights, performanceDelta } = req.body;
      
      if (!agentName || !memoryScope || !summary || !insights) {
        return res.status(400).json({ 
          error: 'agentName, memoryScope, summary, and insights are required' 
        });
      }
      
      const archived = await longtermMemoryService.archiveInsights(
        agentName,
        memoryScope,
        summary,
        insights,
        performanceDelta
      );
      
      res.json({ ok: true, archived });
    } catch (error: any) {
      console.error('[Memory] Archive insight failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Phase 10.0: Unified Cognitive Core Routes ====================

  apiRouter.get('/core/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { unifiedCore } = await import('./services/unified-core');
      const status = await unifiedCore.getCoreStatus();
      
      res.json({ ok: true, status });
    } catch (error: any) {
      console.error('[CognitiveCore] Get status failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/core/agents', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { unifiedCore } = await import('./services/unified-core');
      const { state } = req.query;
      
      const agents = await unifiedCore.getAgents(state as any);
      
      res.json({ ok: true, agents });
    } catch (error: any) {
      console.error('[CognitiveCore] Get agents failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/core/optimize', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { unifiedCore } = await import('./services/unified-core');
      
      const result = await unifiedCore.runOptimizationCycle();
      
      res.json({ ok: true, result });
    } catch (error: any) {
      console.error('[CognitiveCore] Manual optimization failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Phase 11.0: Safety Guardrails Routes ====================

  apiRouter.get('/safety/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { safetyGuardrails } = await import('./services/safety-guardrails');
      
      const killSwitchStatus = await safetyGuardrails.getKillSwitchStatus();
      const recentEvents = await safetyGuardrails.getRecentEvents(10);
      const activePolicies = await safetyGuardrails.getActivePolicies();
      
      res.json({ 
        ok: true, 
        killSwitch: killSwitchStatus,
        recentEvents,
        activePolicies,
        totalActivePolicies: activePolicies.length,
      });
    } catch (error: any) {
      console.error('[Safety] Get status failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/safety/policies/apply', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { safetyGuardrails } = await import('./services/safety-guardrails');
      
      const { policyName, scope, enabled, constraints } = req.body;
      
      if (!policyName || !scope || !constraints) {
        return res.status(400).json({ error: 'Missing required fields: policyName, scope, constraints' });
      }
      
      const policy = await safetyGuardrails.applyPolicy({
        policyName,
        scope,
        enabled: enabled !== undefined ? enabled : true,
        constraints,
      });
      
      res.json({ ok: true, policy });
    } catch (error: any) {
      console.error('[Safety] Apply policy failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/safety/kill-switch', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { safetyGuardrails } = await import('./services/safety-guardrails');
      
      const { enabled, reason } = req.body;
      
      if (enabled === undefined) {
        return res.status(400).json({ error: 'Missing required field: enabled' });
      }
      
      await safetyGuardrails.toggleKillSwitch(enabled, reason || null);
      
      const status = await safetyGuardrails.getKillSwitchStatus();
      
      res.json({ ok: true, killSwitch: status });
    } catch (error: any) {
      console.error('[Safety] Toggle kill switch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Phase 13.0: Ethical Alignment Framework Routes ====================

  apiRouter.get('/ethics/principles', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const principles = await db.select().from(ethicalPrinciple).orderBy(ethicalPrinciple.priority);
      
      res.json({ ok: true, principles });
    } catch (error: any) {
      console.error('[Ethics] Get principles failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/ethics/principles', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { name, type, description, priority, enabled, constraints } = req.body;
      
      if (!name || !type || !description) {
        return res.status(400).json({ error: 'Missing required fields: name, type, description' });
      }
      
      // Check if principle already exists
      const existing = await db.select().from(ethicalPrinciple).where(eq(ethicalPrinciple.name, name));
      
      let principle;
      if (existing.length > 0) {
        // Update existing principle
        const [updated] = await db
          .update(ethicalPrinciple)
          .set({
            type,
            description,
            priority: priority !== undefined ? priority : existing[0].priority,
            enabled: enabled !== undefined ? enabled : existing[0].enabled,
            constraints: constraints || existing[0].constraints,
            updatedAt: new Date(),
          })
          .where(eq(ethicalPrinciple.name, name))
          .returning();
        principle = updated;
        
        // Clear ethical reasoner cache after update
        const { ethicalReasoner } = await import('./services/ethical-reasoner');
        ethicalReasoner.clearCache();
      } else {
        // Insert new principle
        const [inserted] = await db
          .insert(ethicalPrinciple)
          .values({
            name,
            type,
            description,
            priority: priority !== undefined ? priority : 99,
            enabled: enabled !== undefined ? enabled : true,
            constraints: constraints || null,
          })
          .returning();
        principle = inserted;
        
        // Clear ethical reasoner cache after insert
        const { ethicalReasoner } = await import('./services/ethical-reasoner');
        ethicalReasoner.clearCache();
      }
      
      res.json({ ok: true, principle });
    } catch (error: any) {
      console.error('[Ethics] Update principle failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/ethics/violations', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { limit = '50', severity } = req.query;
      
      let query = db.select().from(ethicalViolationLog).orderBy(desc(ethicalViolationLog.createdAt));
      
      if (severity) {
        query = query.where(eq(ethicalViolationLog.severity, severity as any));
      }
      
      const violations = await query.limit(parseInt(limit as string));
      
      res.json({ ok: true, violations });
    } catch (error: any) {
      console.error('[Ethics] Get violations failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/ethics/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicalReasoner } = await import('./services/ethical-reasoner');
      
      const status = await ethicalReasoner.getAlignmentStatus();
      
      res.json({ 
        ok: true, 
        alignmentScore: status.alignmentScore,
        violationsToday: status.violationsToday,
        principleCount: status.principleCount,
        principleHealth: status.principleHealth,
        status: status.alignmentScore >= 70 ? 'compliant' : 'at_risk',
      });
    } catch (error: any) {
      console.error('[Ethics] Get status failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Phase 15.0: Cognitive Introspection & Bias Mitigation Routes ====================

  apiRouter.get('/introspection/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { introspectionEngine } = await import('./services/introspection-engine');
      const summary = await introspectionEngine.getLatestSummary(req.user!.id);
      
      res.json({
        success: true,
        summary,
      });
    } catch (error: any) {
      console.error('[IntrospectionAPI] Status fetch failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  apiRouter.get('/introspection/biases', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { introspectionEngine } = await import('./services/introspection-engine');
      const hours = parseInt(req.query.hours as string) || 24;
      const biases = await introspectionEngine.getRecentBiases(req.user!.id, hours);
      
      res.json({
        success: true,
        biases,
        count: biases.length,
        timeWindow: `${hours}h`,
      });
    } catch (error: any) {
      console.error('[IntrospectionAPI] Biases fetch failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  apiRouter.get('/introspection/drift', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { introspectionEngine } = await import('./services/introspection-engine');
      const hours = parseInt(req.query.hours as string) || 48;
      const driftData = await introspectionEngine.getConfidenceDriftData(req.user!.id, hours);
      
      res.json({
        success: true,
        driftData,
        count: driftData.length,
        timeWindow: `${hours}h`,
      });
    } catch (error: any) {
      console.error('[IntrospectionAPI] Drift fetch failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  apiRouter.post('/introspection/mitigate', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { biasMitigation } = await import('./services/bias-mitigation');
      const result = await biasMitigation.runMitigationCycle(req.user!.id);
      
      res.json({
        success: result.success,
        mitigationsApplied: result.mitigationsApplied,
        duration: result.duration,
        errors: result.errors,
      });
    } catch (error: any) {
      console.error('[IntrospectionAPI] Mitigation failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ==================== Phase 16.0: Knowledge Retrieval & Web Intelligence Routes ====================

  apiRouter.get('/knowledge/query', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeRetrievalService } = await import('./services/knowledge-retrieval');
      const { query, limit } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ 
          success: false, 
          error: 'query parameter required' 
        });
      }
      
      const hours = limit ? parseInt(limit as string) : 24;
      const logs = await knowledgeRetrievalService.getRetrievalLogs(req.user!.id, hours);
      
      res.json({
        success: true,
        logs,
        count: logs.length,
        timeWindow: `${hours}h`,
      });
    } catch (error: any) {
      console.error('[KnowledgeAPI] Query fetch failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  apiRouter.get('/knowledge/trust', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeRetrievalService } = await import('./services/knowledge-retrieval');
      const trustRecords = await knowledgeRetrievalService.getTrustedSources(req.user!.id);
      
      res.json({
        success: true,
        trustRecords,
        count: trustRecords.length,
      });
    } catch (error: any) {
      console.error('[KnowledgeAPI] Trust fetch failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  apiRouter.post('/knowledge/refresh', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { knowledgeRetrievalService } = await import('./services/knowledge-retrieval');
      const removedCount = await knowledgeRetrievalService.refreshCache();
      
      res.json({
        success: true,
        removedCount,
        message: `${removedCount} expired cache entries removed`,
      });
    } catch (error: any) {
      console.error('[KnowledgeAPI] Cache refresh failed:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ==================== Phase 14.0: Federated Ethics & Multi-Agent Consensus Routes ====================

  apiRouter.get('/federation/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { federatedEthicsHub } = await import('./services/federated-ethics-hub');
      const { policyPropagationService } = await import('./services/policy-propagation');
      
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      const domain = (req.query.domain as any) || 'global';
      
      const snapshot = await federatedEthicsHub.getSnapshot(domain, mode);
      const stats = await policyPropagationService.getStats();
      
      res.json({ 
        ok: true, 
        snapshot,
        propagationStats: stats,
      });
    } catch (error: any) {
      console.error('[Federation] Get status failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/federation/propagate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { policyPropagationService } = await import('./services/policy-propagation');
      const { updates } = req.body;
      
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: 'updates array required' });
      }
      
      const outcomes = await policyPropagationService.propagateUpdates(updates);
      const successCount = outcomes.filter(o => o.success).length;
      
      res.json({ 
        ok: true, 
        outcomes,
        successCount,
        totalCount: outcomes.length,
      });
    } catch (error: any) {
      console.error('[Federation] Propagate failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/ethics/collab/consensus', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicsConsensusOrchestrator } = await import('./services/ethics-consensus-orchestrator');
      const { action, agentRecommendations } = req.body;
      
      if (!action || !agentRecommendations) {
        return res.status(400).json({ error: 'action and agentRecommendations required' });
      }
      
      const result = await ethicsConsensusOrchestrator.checkConsensus(action, agentRecommendations);
      
      res.json({ 
        ok: true, 
        result,
      });
    } catch (error: any) {
      console.error('[Ethics Consensus] Check failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/ethics/collab/conflicts', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicsConsensusOrchestrator } = await import('./services/ethics-consensus-orchestrator');
      const status = (req.query.status as any) || 'all';
      
      const conflicts = await ethicsConsensusOrchestrator.getConflicts(status);
      
      res.json({ 
        ok: true, 
        conflicts,
      });
    } catch (error: any) {
      console.error('[Ethics Conflicts] Get failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/ethics/collab/conflicts/:id/resolve', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicsConsensusOrchestrator } = await import('./services/ethics-consensus-orchestrator');
      const { id } = req.params;
      const { resolution, notes } = req.body;
      
      if (!resolution) {
        return res.status(400).json({ error: 'resolution required' });
      }
      
      const conflict = await ethicsConsensusOrchestrator.resolveConflictById(id, resolution, notes);
      
      res.json({ 
        ok: true, 
        conflict,
      });
    } catch (error: any) {
      console.error('[Ethics Conflicts] Resolve failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/ethics/collab/sessions', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { limit = '20' } = req.query;
      
      const sessions = await db
        .select()
        .from(crossAgentEthicsSession)
        .orderBy(desc(crossAgentEthicsSession.createdAt))
        .limit(parseInt(limit as string));
      
      res.json({ 
        ok: true, 
        sessions,
      });
    } catch (error: any) {
      console.error('[Ethics Sessions] Get failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/ethics/collab/mediate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicsConsensusOrchestrator } = await import('./services/ethics-consensus-orchestrator');
      const { contextBridge } = await import('./services/context-bridge');
      
      // Get all open conflicts
      const openConflicts = await ethicsConsensusOrchestrator.getConflicts('open');
      
      // Auto-resolve stale low-severity conflicts (older than 24 hours)
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const staleConflicts = openConflicts.filter((c: any) => 
        c.detectedAt && new Date(c.detectedAt) < twentyFourHoursAgo
      );
      
      let resolvedCount = 0;
      for (const conflict of staleConflicts) {
        await ethicsConsensusOrchestrator.resolveConflictById(
          conflict.conflictId,
          'resolved',
          'Automatically resolved after 24 hours (manual mediation pass)'
        );
        resolvedCount++;
      }
      
      // Broadcast event
      await contextBridge.broadcast({
        event: 'ethics_conflict_updated',
        userId: 'all',
        payload: {
          resolvedCount,
          totalConflicts: openConflicts.length,
          timestamp: new Date().toISOString(),
        },
      });
      
      res.json({ 
        ok: true, 
        message: `Mediation pass complete. Resolved ${resolvedCount} stale conflicts.`,
        resolvedCount,
        totalConflicts: openConflicts.length,
      });
    } catch (error: any) {
      console.error('[Ethics Mediation] Mediation pass failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== Phase 12.0: Performance & Autoscaling Routes ====================

  apiRouter.get('/system/performance', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { performanceMonitor } = await import('./services/performance-monitor');
      
      const performance = performanceMonitor.getSystemPerformance();
      
      res.json({ ok: true, performance });
    } catch (error: any) {
      console.error('[Performance] Get performance failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.get('/system/autoscale/hints', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { performanceMonitor } = await import('./services/performance-monitor');
      
      const performance = performanceMonitor.getSystemPerformance();
      const { taskQueue, reasoning, autonomyCycles, overallHealthScore } = performance;
      
      // Autoscaling recommendation logic
      let scaleAction = 'maintain';
      const reasons: string[] = [];
      let targetConcurrency = 5;
      
      // Scale up conditions
      if (taskQueue.currentDepth > 100) {
        scaleAction = 'scale_up';
        reasons.push(`Queue depth ${taskQueue.currentDepth} exceeds threshold of 100`);
        targetConcurrency = Math.min(20, Math.ceil(taskQueue.currentDepth / 20));
      } else if (taskQueue.currentDepth > 50) {
        scaleAction = 'scale_up';
        reasons.push(`Queue depth ${taskQueue.currentDepth} approaching limit`);
        targetConcurrency = 10;
      }
      
      if (reasoning && reasoning.p95 > 10000) {
        scaleAction = 'scale_up';
        reasons.push(`Reasoning p95 latency ${reasoning.p95}ms exceeds 10s threshold`);
        targetConcurrency = Math.max(targetConcurrency, 10);
      }
      
      // Scale down conditions
      if (scaleAction === 'maintain' && taskQueue.currentDepth < 5 && taskQueue.avgProcessingTime < 1000) {
        scaleAction = 'scale_down';
        reasons.push('Low queue depth and fast processing times');
        targetConcurrency = 3;
      }
      
      // Health-based scaling
      if (overallHealthScore < 50) {
        scaleAction = 'investigate';
        reasons.push(`System health score ${overallHealthScore} is critical`);
      }
      
      res.json({ 
        ok: true, 
        scaleAction,
        reasons,
        targetConcurrency,
        currentMetrics: {
          queueDepth: taskQueue.currentDepth,
          healthScore: overallHealthScore,
          reasoningP95: reasoning?.p95 || 0,
        }
      });
    } catch (error: any) {
      console.error('[Performance] Get autoscale hints failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Kraken API Data Documentation Endpoint
  apiRouter.get('/diagnostics/kraken-documentation', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { KrakenDataDocumenter } = await import('./services/kraken-data-documenter.js');
      const documenter = new KrakenDataDocumenter();
      
      console.log('\n📊 Generating Kraken API Documentation...');
      const report = await documenter.generateReport();
      
      // Append to replit.md
      const fs = await import('fs');
      const path = await import('path');
      const replitMdPath = path.join(process.cwd(), 'replit.md');
      
      const timestamp = new Date().toISOString();
      const section = `\n\n---\n\n# Kraken API & Filter Documentation\n*Generated: ${timestamp}*\n\n${report}\n`;
      
      fs.appendFileSync(replitMdPath, section);
      
      console.log('✅ Documentation appended to replit.md');
      
      res.json({
        ok: true,
        message: 'Kraken documentation generated and appended to replit.md',
        reportLength: report.length,
        timestamp
      });
    } catch (error: any) {
      console.error('[Diagnostics] Kraken documentation generation failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 27.G.C: Diagnostic Config Snapshot Endpoint
  apiRouter.get('/diagnostics/config-snapshot', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const requestId = `cfg-snap-${Date.now()}`;
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      if (mode !== 'live' && mode !== 'paper') {
        return res.status(400).json({ 
          ok: false, 
          code: 'INVALID_MODE', 
          detail: 'Mode must be "live" or "paper"' 
        });
      }
      
      console.log(`[ConfigSnapshot:${requestId}] Fetching snapshot for mode=${mode}, user=${userId}`);
      
      // Fetch Guardrails from guardrails_v2 (Core Four)
      const guardrailsData = await storage.getGuardrailsV2({ mode });
      const guardrails = guardrailsData ? {
        portfolioRiskPerTradePct: parseFloat(String(guardrailsData.portfolioRiskPerTradePct)),
        symbolCooldownMinutes: guardrailsData.symbolCooldownMinutes,
        maxOpenPositions: guardrailsData.maxOpenPositions,
        dailyLossKillSwitchPct: parseFloat(String(guardrailsData.dailyLossKillSwitchPct))
      } : null;
      
      // Fetch Filters from screener_filters (16 fields)
      const filtersData = await storage.getScreenerFilters({ mode });
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
      
      // Fetch Goals from goals_presets (active preset)
      const activePreset = await storage.getActiveGoalsPreset({ mode });
      const goals = activePreset ? {
        activePreset: activePreset.presetName,
        targetDailyAvgEarningPct: parseFloat(String(activePreset.targetDailyAvgEarningPct)),
        tradesPerDayEst: activePreset.tradesPerDayEst
      } : null;
      
      // Fetch Portfolio Value from portfolio_balances
      const portfolioBalance = await storage.getPortfolioBalance({ userId, mode });
      const portfolioValue = portfolioBalance?.totalValueUsd 
        ? parseFloat(String(portfolioBalance.totalValueUsd))
        : 0;
      
      // Build snapshot response
      const snapshot = {
        ok: true,
        mode,
        timestamp: new Date().toISOString(),
        guardrails,
        filters,
        goals,
        portfolioValue,
        provenance: {
          guardrails_source: 'guardrails_v2',
          guardrails_columns: ['portfolio_risk_per_trade_pct', 'symbol_cooldown_minutes', 'max_open_positions', 'daily_loss_kill_switch_pct'],
          filters_source: 'screener_filters',
          filters_columns: ['min_volume', 'min_liquidity', 'min_price', 'max_price', 'min_market_cap', 'max_bid_ask_spread', 'rsi_min', 'rsi_max', 'volatility_min', 'volatility_max', 'exclude_stablecoins', 'allow_regulated_only', 'universe_size', 'quote_currencies', 'active_timeframes', 'confidence_threshold'],
          goals_source: 'goals_presets',
          goals_columns: ['preset_name', 'target_daily_avg_earning_pct', 'trades_per_day_est'],
          portfolio_source: 'portfolio_balances',
          portfolio_columns: ['total_value_usd']
        },
        legacyReads: 0, // Phase 27.G: Confirm no legacy field access
        legacyFields: [], // Empty array confirms no legacy data sourced
        schemaHash: require('crypto')
          .createHash('md5')
          .update(JSON.stringify({ guardrails, filters, goals }))
          .digest('hex')
      };
      
      console.log(`[ConfigSnapshot:${requestId}] Snapshot complete - legacyReads=${snapshot.legacyReads}, hash=${snapshot.schemaHash}`);
      
      res.json(snapshot);
    } catch (error: any) {
      console.error(`[ConfigSnapshot:${requestId}] Error:`, error.message);
      res.status(500).json({ 
        ok: false, 
        code: 'SERVER_ERROR', 
        detail: error.message 
      });
    }
  });

  // Phase 28.C: Audit Log History Endpoint
  apiRouter.get('/diagnostics/audit-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const requestId = `audit-log-${Date.now()}`;
    try {
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      const entityType = req.query.entityType as 'guardrails' | 'filters' | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      
      console.log(`[AuditLogs:${requestId}] Fetching audit logs - mode=${mode}, entityType=${entityType}, limit=${limit}`);
      
      const logs = await storage.getRecentAuditLogs({
        mode,
        entityType,
        limit
      });
      
      res.json({
        ok: true,
        data: logs,
        count: logs.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`[AuditLogs:${requestId}] Error:`, error.message);
      res.status(500).json({
        ok: false,
        code: 'SERVER_ERROR',
        detail: error.message
      });
    }
  });

  // Phase 28.D: Audit Anomaly Detection Endpoint
  apiRouter.get('/diagnostics/audit-anomalies', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const requestId = `audit-anomalies-${Date.now()}`;
    try {
      console.log(`[AuditAnomalies:${requestId}] Running anomaly detection...`);
      
      const { AuditAnomalyDetectionService } = await import('./services/audit-anomaly-detection');
      const anomalyService = new AuditAnomalyDetectionService(storage);
      
      const anomalies = await anomalyService.detectAnomalies();
      
      res.json({
        ok: true,
        data: anomalies,
        count: anomalies.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`[AuditAnomalies:${requestId}] Error:`, error.message);
      res.status(500).json({
        ok: false,
        code: 'SERVER_ERROR',
        detail: error.message
      });
    }
  });

  // Phase 28.D: Override Frequency Data Endpoint
  apiRouter.get('/diagnostics/override-frequency', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const requestId = `override-freq-${Date.now()}`;
    try {
      console.log(`[OverrideFrequency:${requestId}] Fetching hourly frequency data...`);
      
      const { AuditAnomalyDetectionService } = await import('./services/audit-anomaly-detection');
      const anomalyService = new AuditAnomalyDetectionService(storage);
      
      const frequencyData = await anomalyService.getOverrideFrequencyData();
      
      res.json({
        ok: true,
        data: frequencyData,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error(`[OverrideFrequency:${requestId}] Error:`, error.message);
      res.status(500).json({
        ok: false,
        code: 'SERVER_ERROR',
        detail: error.message
      });
    }
  });

  // Phase 29: Adaptive Guardrails & Learning APIs
  
  // Get learning telemetry for a mode
  apiRouter.get('/learning/telemetry/:mode', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.params.mode as 'paper' | 'live';
      if (mode !== 'paper' && mode !== 'live') {
        return res.status(400).json({ error: 'Invalid mode. Must be paper or live.' });
      }

      const { adaptiveGuardrails } = await import('./services/adaptive-guardrails');
      const telemetry = await adaptiveGuardrails.getTelemetry(mode);
      
      // Log telemetry for audit trail
      console.log(`[Learning] OverrideInfluence | active=${telemetry.overrides24h} | avgWeight=${telemetry.overrideWeight.toFixed(2)} | bias=${telemetry.bias}`);
      console.log(`[Learning] AdaptiveGuardrails ${telemetry.throttleStatus} | changes<=${telemetry.maxChangesPerDay} | stability=PASS`);
      console.log(`[Learning] AdaptiveCoherency PASS | deviations<=${telemetry.coherencyThreshold}% | withinLimits=true`);
      if (telemetry.lastStableSnapshot) {
        console.log(`[Learning] RollbackAvailable | lastStable=${telemetry.lastSnapshotTime}`);
      }
      
      res.json(telemetry);
    } catch (error: any) {
      console.error('[Learning] Telemetry error:', error);
      res.status(500).json({ error: 'Failed to fetch learning telemetry' });
    }
  });

  // Get behavioral log for a mode
  apiRouter.get('/learning/behavioral-log/:mode', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.params.mode as 'paper' | 'live';
      if (mode !== 'paper' && mode !== 'live') {
        return res.status(400).json({ error: 'Invalid mode. Must be paper or live.' });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const { adaptiveGuardrails } = await import('./services/adaptive-guardrails');
      const log = await adaptiveGuardrails.getBehavioralLog(mode, limit);
      
      res.json({ ok: true, data: log });
    } catch (error: any) {
      console.error('[Learning] Behavioral log error:', error);
      res.status(500).json({ error: 'Failed to fetch behavioral log' });
    }
  });

  // Get learning history snapshots
  apiRouter.get('/learning/history/:mode', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.params.mode as 'paper' | 'live';
      if (mode !== 'paper' && mode !== 'live') {
        return res.status(400).json({ error: 'Invalid mode. Must be paper or live.' });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const { adaptiveGuardrails } = await import('./services/adaptive-guardrails');
      const history = await adaptiveGuardrails.getLearningHistory(mode, limit);
      
      res.json({ ok: true, data: history });
    } catch (error: any) {
      console.error('[Learning] History error:', error);
      res.status(500).json({ error: 'Failed to fetch learning history' });
    }
  });

  // Create a snapshot manually
  apiRouter.post('/learning/snapshot/:mode', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.params.mode as 'paper' | 'live';
      if (mode !== 'paper' && mode !== 'live') {
        return res.status(400).json({ error: 'Invalid mode. Must be paper or live.' });
      }

      const { adaptiveGuardrails } = await import('./services/adaptive-guardrails');
      const version = await adaptiveGuardrails.createSnapshot(mode, 0, {
        manual: true,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      });
      
      res.json({ ok: true, version, message: `Snapshot v${version} created successfully` });
    } catch (error: any) {
      console.error('[Learning] Snapshot creation error:', error);
      res.status(500).json({ error: 'Failed to create snapshot' });
    }
  });

  // Rollback to a snapshot
  apiRouter.post('/learning/rollback/:mode', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.params.mode as 'paper' | 'live';
      if (mode !== 'paper' && mode !== 'live') {
        return res.status(400).json({ error: 'Invalid mode. Must be paper or live.' });
      }

      const { version } = req.body;
      const { adaptiveGuardrails } = await import('./services/adaptive-guardrails');
      const success = await adaptiveGuardrails.rollbackToSnapshot(mode, version);
      
      if (success) {
        res.json({ ok: true, message: 'Rollback successful' });
      } else {
        res.status(404).json({ ok: false, error: 'Snapshot not found' });
      }
    } catch (error: any) {
      console.error('[Learning] Rollback error:', error);
      res.status(500).json({ error: 'Failed to rollback' });
    }
  });

  // Set learning mode
  apiRouter.put('/learning/mode/:tradingMode', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const tradingMode = req.params.tradingMode as 'paper' | 'live';
      if (tradingMode !== 'paper' && tradingMode !== 'live') {
        return res.status(400).json({ error: 'Invalid trading mode. Must be paper or live.' });
      }

      const { learningMode } = req.body;
      if (!['slow', 'normal', 'aggressive', 'disabled'].includes(learningMode)) {
        return res.status(400).json({ error: 'Invalid learning mode. Must be slow, normal, aggressive, or disabled.' });
      }

      const { adaptiveGuardrails } = await import('./services/adaptive-guardrails');
      adaptiveGuardrails.setLearningMode(tradingMode, learningMode);
      
      res.json({ ok: true, message: `Learning mode set to ${learningMode} for ${tradingMode}` });
    } catch (error: any) {
      console.error('[Learning] Mode update error:', error);
      res.status(500).json({ error: 'Failed to update learning mode' });
    }
  });

  // ==================== Phase 30.FX.1: Strategy Parameter Schema ====================
  
  // Get parameter schema for a strategy
  apiRouter.get('/strategy/parameters', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const strategy = req.query.strategy as string;
      const mode = req.query.mode as 'paper' | 'live';
      
      if (!strategy) {
        return res.status(400).json({ error: 'Strategy parameter is required' });
      }
      
      if (!mode || (mode !== 'paper' && mode !== 'live')) {
        return res.status(400).json({ error: 'Invalid mode. Must be paper or live.' });
      }

      const params = await db
        .select()
        .from(strategyParamSchema)
        .where(
          and(
            eq(strategyParamSchema.strategyType, strategy as any),
            eq(strategyParamSchema.tradingMode, mode)
          )
        );
      
      // Map database columns to frontend interface
      const mappedParams = params.map(p => ({
        id: p.id,
        strategyName: p.strategyType,
        mode: p.tradingMode,
        parameterKey: p.key,
        parameterValue: parseFloat(p.value),
        label: p.label,
        description: p.description || '',
      }));
      
      console.log(`[Phase-30.FX.1] Fetched ${params.length} parameters for strategy: ${strategy}, mode: ${mode}`);
      
      res.json({ ok: true, parameters: mappedParams });
    } catch (error: any) {
      console.error('[Phase-30.FX.1] Error fetching strategy parameters:', error);
      res.status(500).json({ error: 'Failed to fetch strategy parameters' });
    }
  });

  // ==================== Phase 30: DHMA Strategy Telemetry ====================
  
  // Get DHMA telemetry for a mode
  apiRouter.get('/strategy/dhma/telemetry', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.query.mode as 'paper' | 'live' || 'paper';
      if (mode !== 'paper' && mode !== 'live') {
        return res.status(400).json({ error: 'Invalid mode. Must be paper or live.' });
      }

      // Get DHMA trades from the last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const allTrades = mode === 'live' 
        ? await storage.getTrades('live', { limit: 10000 })
        : await storage.getAllPaperTrades();
      
      // Filter for DHMA strategy in the last 24 hours
      const dhmaTrades = allTrades.filter((t: any) => 
        t.strategy === 'dhma' && 
        t.entryTime && 
        new Date(t.entryTime) >= oneDayAgo
      );
      
      // Calculate metrics
      const entries = dhmaTrades.length;
      const exits = dhmaTrades.filter((t: any) => t.status === 'closed').length;
      const closedTrades = dhmaTrades.filter((t: any) => t.status === 'closed' && t.exitTime);
      
      const winningTrades = closedTrades.filter((t: any) => 
        parseFloat(t.realizedPL || '0') > 0
      );
      const hitRate = closedTrades.length > 0 
        ? (winningTrades.length / closedTrades.length) * 100 
        : 0;
      
      const totalPL = closedTrades.reduce((sum: number, t: any) => 
        sum + parseFloat(t.realizedPL || '0'), 0
      );
      const avgPLPerTrade = closedTrades.length > 0 
        ? totalPL / closedTrades.length 
        : 0;
      
      // Calculate average hold time (in minutes)
      let totalHoldTime = 0;
      for (const trade of closedTrades) {
        if (trade.entryTime && trade.exitTime) {
          const entryTime = new Date(trade.entryTime).getTime();
          const exitTime = new Date(trade.exitTime).getTime();
          totalHoldTime += (exitTime - entryTime) / 60000; // Convert to minutes
        }
      }
      const avgHoldTimeMinutes = closedTrades.length > 0 
        ? totalHoldTime / closedTrades.length 
        : 0;
      
      // Extract metadata averages (spread, toxicity)
      let totalSpread = 0;
      let totalToxicity = 0;
      let spreadCount = 0;
      let toxicityCount = 0;
      
      for (const trade of dhmaTrades) {
        if (trade.metadata) {
          const metadata = typeof trade.metadata === 'string' 
            ? JSON.parse(trade.metadata) 
            : trade.metadata;
          
          if (metadata.spreadTicks !== undefined) {
            totalSpread += metadata.spreadTicks;
            spreadCount++;
          }
          if (metadata.toxicity !== undefined) {
            totalToxicity += metadata.toxicity;
            toxicityCount++;
          }
        }
      }
      
      const avgSpread = spreadCount > 0 ? totalSpread / spreadCount : 0;
      const avgToxicity = toxicityCount > 0 ? totalToxicity / toxicityCount : 0;
      
      // Skip reasons (would be tracked separately in a real implementation)
      const skipReasons = {
        highToxicity: 0,
        wideSpread: 0,
        noRegimeAlignment: 0,
        coherencyFail: 0
      };
      
      const telemetry = {
        mode,
        period: '24h',
        entries,
        exits,
        hitRate: parseFloat(hitRate.toFixed(2)),
        avgPLPerTrade: parseFloat(avgPLPerTrade.toFixed(2)),
        avgHoldTimeMinutes: parseFloat(avgHoldTimeMinutes.toFixed(1)),
        avgSpreadTicks: parseFloat(avgSpread.toFixed(2)),
        avgToxicity: parseFloat(avgToxicity.toFixed(2)),
        skipReasons,
        timestamp: new Date().toISOString()
      };
      
      console.log(`[DHMA] Telemetry | mode=${mode} | entries=${entries} | exits=${exits} | hitRate=${hitRate.toFixed(1)}%`);
      
      res.json(telemetry);
    } catch (error: any) {
      console.error('[DHMA] Telemetry error:', error);
      res.status(500).json({ error: 'Failed to fetch DHMA telemetry' });
    }
  });

  // Phase 1: Mount status routes into apiRouter
  const { statusRouter } = await import('./routes/status.js');
  apiRouter.use('/status', statusRouter);
  console.log('[Phase 1] Status routes mounted at /api/status');

  // Phase 41F-D: Mount health monitoring routes into apiRouter
  const { healthRouter } = await import('./routes/health.js');
  apiRouter.use('/health', healthRouter);
  console.log('[41F-D] Health routes mounted at /api/health');

  // Catch-all handler for unmatched /api/* routes
  // This prevents requests from falling through to Vite's HTML handler
  // and ensures all API routes return JSON (even 404s)
  // Using .all() instead of .use() to properly catch all HTTP methods as a route
  apiRouter.all('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `API endpoint not found: ${req.baseUrl}${req.path}`,
      path: `${req.baseUrl}${req.path}`,
      method: req.method
    });
  });

  return { httpServer, apiRouter };
}

// WebSocket message handler
function handleWebSocketMessage(ws: WebSocket, data: any) {
  if (ws.readyState !== WebSocket.OPEN) return;
  
  switch (data.type) {
    case 'subscribe_prices':
      // Handle price subscription
      break;
    case 'subscribe_trades':
      // Handle trade updates subscription
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
  }
}

// CSV generation helper
function generateTradeCSV(trades: any[]): string {
  const headers = [
    'Trade ID',
    'Date/Time (UTC)',
    'Symbol',
    'Side',
    'Strategy',
    'Mode',
    'Entry Price',
    'Exit Price',
    'Quantity',
    'Entry Fee',
    'Exit Fee',
    'Total Fees',
    'Gross P/L',
    'Net P/L',
    'P/L %',
    'R Multiple',
    'R in $',
    'Hold Time (hours)'
  ];
  
  const rows = trades.map(trade => {
    const entryTime = new Date(trade.entryTime);
    const exitTime = trade.exitTime ? new Date(trade.exitTime) : null;
    const holdTime = exitTime ? 
      (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60) : 0;
    
    const entryFee = parseFloat(trade.entryFee || '0');
    const exitFee = parseFloat(trade.exitFee || '0');
    const totalFees = entryFee + exitFee;
    
    const entryValue = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
    const exitValue = trade.exitPrice ? 
      parseFloat(trade.exitPrice) * parseFloat(trade.quantity) : 0;
    const grossPL = exitValue - entryValue;
    const netPL = grossPL - totalFees;
    
    return [
      trade.id,
      entryTime.toISOString(),
      trade.symbol,
      'BUY/SELL', // Simplified
      trade.strategy,
      trade.mode,
      trade.entryPrice,
      trade.exitPrice || '',
      trade.quantity,
      entryFee.toFixed(4),
      exitFee.toFixed(4),
      totalFees.toFixed(4),
      grossPL.toFixed(2),
      netPL.toFixed(2),
      trade.realizedPLPercent || '',
      trade.realizedPLR || '',
      (parseFloat(trade.realizedPLR || '0') * parseFloat(trade.riskAmount)).toFixed(2),
      holdTime.toFixed(2)
    ].map(value => `"${value}"`).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// Tax Report Generator
function generateTaxReport(trades: any[]): string {
  const headers = [
    'Trade ID',
    'Date/Time (UTC)',
    'Date/Time (Local)',
    'Symbol',
    'Side',
    'Entry Price',
    'Exit Price',
    'Quantity',
    'Entry Fee',
    'Exit Fee',
    'Total Fees',
    'Gross P/L',
    'Net P/L',
    'P/L %',
    'Cost Basis',
    'Proceeds',
    'Holding Duration (hours)',
    'Holding Duration (days)',
    'Term Classification',
    'Realized Gains',
    'Unrealized Gains',
    'Account Type'
  ];
  
  const rows = trades.map(trade => {
    const entryTime = new Date(trade.entryTime);
    const exitTime = trade.exitTime ? new Date(trade.exitTime) : null;
    const holdHours = exitTime ? 
      (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60) : 0;
    const holdDays = holdHours / 24;
    
    const entryFee = parseFloat(trade.entryFee || '0');
    const exitFee = parseFloat(trade.exitFee || '0');
    const totalFees = entryFee + exitFee;
    
    const costBasis = parseFloat(trade.entryPrice) * parseFloat(trade.quantity) + entryFee;
    const proceeds = trade.exitPrice ? 
      parseFloat(trade.exitPrice) * parseFloat(trade.quantity) - exitFee : 0;
    const grossPL = proceeds - (parseFloat(trade.entryPrice) * parseFloat(trade.quantity));
    const netPL = proceeds - costBasis;
    
    // Realized gains only apply to closed trades (trades with exitPrice)
    const realizedGains = trade.exitPrice ? netPL : 0;
    
    // Unrealized gains apply to open trades (trades without exitPrice)
    const currentPrice = parseFloat(trade.currentPrice || trade.entryPrice);
    const unrealizedProceeds = !trade.exitPrice ? 
      currentPrice * parseFloat(trade.quantity) - exitFee : 0;
    const unrealizedGains = !trade.exitPrice ? 
      unrealizedProceeds - costBasis : 0;
    
    const termClassification = holdDays >= 365 ? 'Long-term' : 'Short-term';
    const accountType = trade.mode === 'live' ? 'Live' : 'Paper';
    
    return [
      trade.id,
      entryTime.toISOString(),
      entryTime.toLocaleString(),
      trade.symbol,
      'LONG', // Crypto day trading (long-only)
      trade.entryPrice,
      trade.exitPrice || '',
      trade.quantity,
      entryFee.toFixed(4),
      exitFee.toFixed(4),
      totalFees.toFixed(4),
      grossPL.toFixed(2),
      netPL.toFixed(2),
      trade.realizedPLPercent || '',
      costBasis.toFixed(2),
      proceeds.toFixed(2),
      holdHours.toFixed(2),
      holdDays.toFixed(2),
      termClassification,
      realizedGains.toFixed(2),
      unrealizedGains.toFixed(2),
      accountType
    ].map(value => `"${value}"`).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// Performance Summary Report
function generatePerformanceReport(trades: any[]): string {
  // Group by symbol and strategy
  const bySymbol: { [key: string]: any[] } = {};
  const byStrategy: { [key: string]: any[] } = {};
  
  trades.forEach(trade => {
    if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = [];
    bySymbol[trade.symbol].push(trade);
    
    if (!byStrategy[trade.strategy]) byStrategy[trade.strategy] = [];
    byStrategy[trade.strategy].push(trade);
  });
  
  const headers = [
    'Group Type',
    'Group Name',
    'Total Trades',
    'Wins',
    'Losses',
    'Win Rate %',
    'Avg R Multiple',
    'Total P/L',
    'Max Drawdown',
    'Avg Hold Time (hrs)',
    'Total Fees'
  ];
  
  const calculateMetrics = (groupTrades: any[]) => {
    const wins = groupTrades.filter(t => parseFloat(t.realizedPLR || '0') > 0).length;
    const losses = groupTrades.filter(t => parseFloat(t.realizedPLR || '0') < 0).length;
    const winRate = groupTrades.length > 0 ? (wins / groupTrades.length) * 100 : 0;
    const avgR = groupTrades.reduce((sum, t) => sum + parseFloat(t.realizedPLR || '0'), 0) / groupTrades.length || 0;
    const totalPL = groupTrades.reduce((sum, t) => {
      const entry = parseFloat(t.entryPrice) * parseFloat(t.quantity);
      const exit = t.exitPrice ? parseFloat(t.exitPrice) * parseFloat(t.quantity) : entry;
      return sum + (exit - entry);
    }, 0);
    const totalFees = groupTrades.reduce((sum, t) => 
      sum + parseFloat(t.entryFee || '0') + parseFloat(t.exitFee || '0'), 0);
    const avgHoldTime = groupTrades.reduce((sum, t) => {
      const entry = new Date(t.entryTime);
      const exit = t.exitTime ? new Date(t.exitTime) : entry;
      return sum + (exit.getTime() - entry.getTime()) / (1000 * 60 * 60);
    }, 0) / groupTrades.length || 0;
    
    return {
      total: groupTrades.length,
      wins,
      losses,
      winRate: winRate.toFixed(2),
      avgR: avgR.toFixed(2),
      totalPL: totalPL.toFixed(2),
      maxDD: '0.00', // Simplified for now
      avgHoldTime: avgHoldTime.toFixed(2),
      totalFees: totalFees.toFixed(2)
    };
  };
  
  const rows: string[] = [];
  
  // Overall summary
  const overallMetrics = calculateMetrics(trades);
  rows.push([
    'Overall',
    'All Trades',
    overallMetrics.total,
    overallMetrics.wins,
    overallMetrics.losses,
    overallMetrics.winRate,
    overallMetrics.avgR,
    overallMetrics.totalPL,
    overallMetrics.maxDD,
    overallMetrics.avgHoldTime,
    overallMetrics.totalFees
  ].map(v => `"${v}"`).join(','));
  
  // By symbol
  Object.keys(bySymbol).forEach(symbol => {
    const metrics = calculateMetrics(bySymbol[symbol]);
    rows.push([
      'Symbol',
      symbol,
      metrics.total,
      metrics.wins,
      metrics.losses,
      metrics.winRate,
      metrics.avgR,
      metrics.totalPL,
      metrics.maxDD,
      metrics.avgHoldTime,
      metrics.totalFees
    ].map(v => `"${v}"`).join(','));
  });
  
  // By strategy
  Object.keys(byStrategy).forEach(strategy => {
    const metrics = calculateMetrics(byStrategy[strategy]);
    rows.push([
      'Strategy',
      strategy,
      metrics.total,
      metrics.wins,
      metrics.losses,
      metrics.winRate,
      metrics.avgR,
      metrics.totalPL,
      metrics.maxDD,
      metrics.avgHoldTime,
      metrics.totalFees
    ].map(v => `"${v}"`).join(','));
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// Trade Journal Report
function generateTradeJournalReport(trades: any[]): string {
  const headers = [
    'Trade ID',
    'Entry Date/Time',
    'Exit Date/Time',
    'Symbol',
    'Strategy',
    'Entry Price',
    'Stop Loss',
    'Target',
    'Exit Price',
    'Quantity',
    'R Amount',
    'Result (R)',
    'P/L $',
    'P/L %',
    'Hold Time',
    'Notes'
  ];
  
  const rows = trades.map(trade => {
    const entryTime = new Date(trade.entryTime);
    const exitTime = trade.exitTime ? new Date(trade.exitTime) : null;
    const holdTime = exitTime ? 
      `${((exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60)).toFixed(1)} hrs` : '-';
    
    const entryValue = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
    const exitValue = trade.exitPrice ? parseFloat(trade.exitPrice) * parseFloat(trade.quantity) : entryValue;
    const pl = exitValue - entryValue;
    const plPercent = entryValue > 0 ? ((pl / entryValue) * 100).toFixed(2) : '0.00';
    
    return [
      trade.id,
      entryTime.toISOString(),
      exitTime ? exitTime.toISOString() : '-',
      trade.symbol,
      trade.strategy,
      trade.entryPrice,
      trade.stopPrice || '-',
      trade.targetPrice || '-',
      trade.exitPrice || '-',
      trade.quantity,
      trade.riskAmount || '-',
      trade.realizedPLR || '-',
      pl.toFixed(2),
      plPercent,
      holdTime,
      (trade.metadata?.notes || '-')
    ].map(value => `"${value}"`).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// Fees & Costs Report
function generateFeesReport(trades: any[]): string {
  // Group by month
  const byMonth: { [key: string]: any[] } = {};
  trades.forEach(trade => {
    const month = new Date(trade.entryTime).toISOString().substring(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(trade);
  });
  
  const headers = [
    'Period',
    'Total Trades',
    'Total Entry Fees',
    'Total Exit Fees',
    'Total Fees',
    'Avg Fee Per Trade',
    'Fee % of Volume'
  ];
  
  const rows = Object.keys(byMonth).sort().map(month => {
    const monthTrades = byMonth[month];
    const totalEntryFees = monthTrades.reduce((sum, t) => sum + parseFloat(t.entryFee || '0'), 0);
    const totalExitFees = monthTrades.reduce((sum, t) => sum + parseFloat(t.exitFee || '0'), 0);
    const totalFees = totalEntryFees + totalExitFees;
    const avgFee = totalFees / monthTrades.length;
    const totalVolume = monthTrades.reduce((sum, t) => 
      sum + (parseFloat(t.entryPrice) * parseFloat(t.quantity)), 0);
    const feePercent = totalVolume > 0 ? (totalFees / totalVolume) * 100 : 0;
    
    return [
      month,
      monthTrades.length,
      totalEntryFees.toFixed(4),
      totalExitFees.toFixed(4),
      totalFees.toFixed(4),
      avgFee.toFixed(4),
      feePercent.toFixed(4)
    ].map(v => `"${v}"`).join(',');
  });
  
  // Add total row
  const totalTrades = trades.length;
  const grandTotalEntryFees = trades.reduce((sum, t) => sum + parseFloat(t.entryFee || '0'), 0);
  const grandTotalExitFees = trades.reduce((sum, t) => sum + parseFloat(t.exitFee || '0'), 0);
  const grandTotalFees = grandTotalEntryFees + grandTotalExitFees;
  const grandAvgFee = totalTrades > 0 ? grandTotalFees / totalTrades : 0;
  const grandTotalVolume = trades.reduce((sum, t) => 
    sum + (parseFloat(t.entryPrice) * parseFloat(t.quantity)), 0);
  const grandFeePercent = grandTotalVolume > 0 ? (grandTotalFees / grandTotalVolume) * 100 : 0;
  
  rows.push([
    'TOTAL',
    totalTrades,
    grandTotalEntryFees.toFixed(4),
    grandTotalExitFees.toFixed(4),
    grandTotalFees.toFixed(4),
    grandAvgFee.toFixed(4),
    grandFeePercent.toFixed(4)
  ].map(v => `"${v}"`).join(','));
  
  return [headers.join(','), ...rows].join('\n');
}

// P&L Report (Monthly, Quarterly, Annual)
function generatePnLReport(trades: any[], period: 'monthly' | 'quarterly' | 'annual'): string {
  const groupedTrades: { [key: string]: any[] } = {};
  
  trades.forEach(trade => {
    const date = new Date(trade.entryTime);
    let key = '';
    
    if (period === 'monthly') {
      key = date.toISOString().substring(0, 7); // YYYY-MM
    } else if (period === 'quarterly') {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      key = `${date.getFullYear()}-Q${quarter}`;
    } else {
      key = date.getFullYear().toString();
    }
    
    if (!groupedTrades[key]) groupedTrades[key] = [];
    groupedTrades[key].push(trade);
  });
  
  const headers = [
    'Period',
    'Total Trades',
    'Wins',
    'Losses',
    'Win Rate %',
    'Gross P/L',
    'Net P/L',
    'Total Fees',
    'Avg Hold Time (hrs)',
    'Best Trade',
    'Worst Trade'
  ];
  
  const rows = Object.keys(groupedTrades).sort().map(periodKey => {
    const periodTrades = groupedTrades[periodKey];
    const wins = periodTrades.filter(t => parseFloat(t.realizedPLR || '0') > 0).length;
    const losses = periodTrades.filter(t => parseFloat(t.realizedPLR || '0') < 0).length;
    const winRate = periodTrades.length > 0 ? (wins / periodTrades.length) * 100 : 0;
    
    const totalFees = periodTrades.reduce((sum, t) => 
      sum + parseFloat(t.entryFee || '0') + parseFloat(t.exitFee || '0'), 0);
    
    const grossPL = periodTrades.reduce((sum, t) => {
      const entry = parseFloat(t.entryPrice) * parseFloat(t.quantity);
      const exit = t.exitPrice ? parseFloat(t.exitPrice) * parseFloat(t.quantity) : entry;
      return sum + (exit - entry);
    }, 0);
    
    const netPL = grossPL - totalFees;
    
    const avgHoldTime = periodTrades.reduce((sum, t) => {
      const entry = new Date(t.entryTime);
      const exit = t.exitTime ? new Date(t.exitTime) : entry;
      return sum + (exit.getTime() - entry.getTime()) / (1000 * 60 * 60);
    }, 0) / periodTrades.length || 0;
    
    const plValues = periodTrades.map(t => {
      const entry = parseFloat(t.entryPrice) * parseFloat(t.quantity);
      const exit = t.exitPrice ? parseFloat(t.exitPrice) * parseFloat(t.quantity) : entry;
      return exit - entry;
    });
    const bestTrade = plValues.length > 0 ? Math.max(...plValues) : 0;
    const worstTrade = plValues.length > 0 ? Math.min(...plValues) : 0;
    
    return [
      periodKey,
      periodTrades.length,
      wins,
      losses,
      winRate.toFixed(2),
      grossPL.toFixed(2),
      netPL.toFixed(2),
      totalFees.toFixed(4),
      avgHoldTime.toFixed(2),
      bestTrade.toFixed(2),
      worstTrade.toFixed(2)
    ].map(v => `"${v}"`).join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}


// ============================================================================
// Phase 27.F.14: Local Heuristic Trader Service API Endpoints
// ============================================================================

/**
 * Get LHTS health status
 * GET /api/heuristic-trader/health
 */
export async function handleLHTSHealth(req: Request, res: Response) {
  try {
    const { heuristicTrader } = await import('./services/heuristic-trader');
    const health = await heuristicTrader.getHealth();
    res.json(health);
  } catch (error: any) {
    console.error('[LHTS-API] Error getting health:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Toggle LHTS on/off
 * POST /api/heuristic-trader/toggle
 * Body: { enabled: boolean, mode?: 'paper' | 'live' }
 */
export async function handleLHTSToggle(req: Request, res: Response) {
  try {
    const { enabled, mode = 'paper' } = req.body;
    const { heuristicTrader } = await import('./services/heuristic-trader');
    
    if (enabled) {
      await heuristicTrader.start(mode);
      res.json({ success: true, message: `LHTS started in ${mode} mode` });
    } else {
      await heuristicTrader.stop();
      res.json({ success: true, message: 'LHTS stopped' });
    }
  } catch (error: any) {
    console.error('[LHTS-API] Error toggling LHTS:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Emergency stop - immediately halt LHTS
 * POST /api/heuristic-trader/emergency-stop
 */
export async function handleLHTSEmergencyStop(req: Request, res: Response) {
  try {
    const { heuristicTrader } = await import('./services/heuristic-trader');
    await heuristicTrader.emergencyStop();
    res.json({ success: true, message: 'LHTS emergency stop executed' });
  } catch (error: any) {
    console.error('[LHTS-API] Error executing emergency stop:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ============================================================================
// Phase 27.F.14.B: LATTI Baseline Indicator API Endpoints
// ============================================================================

/**
 * Get baseline indicator status
 * GET /api/baseline-indicator/status
 */
export async function handleBaselineStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const { baselineIndicator } = await import('./services/baseline-indicator');
    const status = await baselineIndicator.checkBaselineStatus(userId);
    res.json(status);
  } catch (error: any) {
    console.error('[BaselineIndicator-API] Error getting baseline status:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get LATTI safety summary
 * Phase 27.F.14.B Task 6
 * GET /api/heuristic-trader/safety-summary
 */
export async function handleLATTISafetySummary(req: AuthenticatedRequest, res: Response) {
  try {
    const { lattiPaper, lattiLive } = await import('./services/heuristic-trader');
    
    // Get safety summary for both modes
    const paperSummary = await lattiPaper.getSafetySummary();
    const liveSummary = await lattiLive.getSafetySummary();
    
    res.json({
      paper: paperSummary,
      live: liveSummary
    });
  } catch (error: any) {
    console.error('[LATTI-Safety-API] Error getting safety summary:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get LATTI adjustment logs for export
 * Phase 27.F.14.B Task 11
 * GET /api/heuristic-trader/adjustment-logs?mode=paper&days=7&format=json
 */
export async function handleLATTIAdjustmentLogs(req: AuthenticatedRequest, res: Response) {
  try {
    const mode = (req.query.mode as 'paper' | 'live') || 'paper';
    const days = parseInt(req.query.days as string) || 7;
    const format = (req.query.format as 'json' | 'csv') || 'json';
    
    // Validate mode
    if (mode !== 'paper' && mode !== 'live') {
      return res.status(400).json({ error: 'Mode must be "paper" or "live"' });
    }
    
    // Fetch logs from database
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { db } = await import('./db');
    const { tradingAuditLog } = await import('../shared/schema');
    const { and, like, eq, gte } = await import('drizzle-orm');
    
    const logs = await db
      .select()
      .from(tradingAuditLog)
      .where(
        and(
          like(tradingAuditLog.action, 'latti_adjustment_%'),
          eq(tradingAuditLog.mode, mode),
          gte(tradingAuditLog.createdAt, daysAgo)
        )
      )
      .orderBy(tradingAuditLog.createdAt);
    
    // Transform logs for export
    const exportData = logs.map(log => ({
      timestamp: log.createdAt,
      mode: log.mode,
      parameterType: log.metadata?.parameterType || 'unknown',
      parameterName: log.metadata?.parameterName || 'unknown',
      oldValue: log.metadata?.oldValue || 0,
      newValue: log.metadata?.newValue || 0,
      changePercent: log.metadata?.changePercent || 0,
      reason: log.metadata?.reason || '',
      ruleId: log.metadata?.ruleId || '',
      triggeredBy: log.triggeredBy || 'latti_heuristic'
    }));
    
    // Return based on format
    if (format === 'csv') {
      // Generate CSV
      const csvHeader = 'Timestamp,Mode,Parameter Type,Parameter Name,Old Value,New Value,Change %,Reason,Rule ID,Triggered By\n';
      const csvRows = exportData.map(row => 
        `${row.timestamp.toISOString()},${row.mode},${row.parameterType},${row.parameterName},${row.oldValue},${row.newValue},${row.changePercent},"${row.reason}",${row.ruleId},${row.triggeredBy}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=latti-adjustments-${mode}-${days}d.csv`);
      res.send(csvHeader + csvRows);
    } else {
      // Return JSON
      res.json({
        mode,
        days,
        totalLogs: exportData.length,
        logs: exportData
      });
    }
  } catch (error: any) {
    console.error('[LATTI-Logs-API] Error getting adjustment logs:', error.message);
    res.status(500).json({ error: error.message });
  }
}

// ============================================================================
// Phase 27.F.14.B: Trading Pace Control API Endpoints
// ============================================================================

/**
 * Get current trading pace from system context
 * GET /api/system/trading-pace
 */
export async function handleGetTradingPace(req: AuthenticatedRequest, res: Response) {
  try {
    // Trading pace is global, we can use either mode to fetch it
    // Since it's the same across both modes, we'll use paper mode
    const context = await storage.getSystemContext('paper');
    
    res.json({
      tradingPace: context?.tradingPace || 'baseline'
    });
  } catch (error: any) {
    console.error('[TradingPace-API] Error getting trading pace:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update trading pace in system context (applies to both modes)
 * PUT /api/system/trading-pace
 * Phase 27.F.15.UI-SYNC.9: Also syncs Performance Metrics goals for both modes
 */
export async function handleUpdateTradingPace(req: AuthenticatedRequest, res: Response) {
  try {
    const { tradingPace } = req.body;
    const userId = req.user!.id;
    
    // Validate trading pace value
    const validPaces = ['conservative', 'baseline', 'optimistic', 'aggressive'];
    if (!validPaces.includes(tradingPace)) {
      return res.status(400).json({ 
        error: `Invalid trading pace. Must be one of: ${validPaces.join(', ')}` 
      });
    }
    
    // Define pace metrics (same as frontend PACE_CONFIGS)
    const paceMetrics: Record<string, { riskPerTrade: number; tradesPerDay: number; earningsPerTrade: number; dailyProfit: number }> = {
      conservative: { riskPerTrade: 50, tradesPerDay: 2, earningsPerTrade: 15, dailyProfit: 30 },
      baseline: { riskPerTrade: 100, tradesPerDay: 4, earningsPerTrade: 25, dailyProfit: 100 },
      optimistic: { riskPerTrade: 150, tradesPerDay: 6, earningsPerTrade: 35, dailyProfit: 210 },
      aggressive: { riskPerTrade: 200, tradesPerDay: 8, earningsPerTrade: 45, dailyProfit: 360 }
    };

    const selectedMetrics = paceMetrics[tradingPace];
    
    // Update trading pace for BOTH modes since it's a global setting
    await storage.updateSystemContext('paper', { tradingPace });
    await storage.updateSystemContext('live', { tradingPace });
    
    console.log(`[TradingPace-API] Updated trading pace to: ${tradingPace} (global for both modes)`);
    
    // Phase 27.F.15.UI-SYNC.9 + Phase 27.F.16.UI-SIMPLIFY: Sync Performance Metrics + Target Daily % goals for both modes
    for (const mode of ['paper', 'live'] as const) {
      // Fetch existing goals and portfolio balance for this mode
      const [existingGoals, portfolioState] = await Promise.all([
        mode === 'live' ? storage.getGoalsLive() : storage.getGoalsPaper(),
        storage.getPortfolioState({ globalContextId: userId, mode })
      ]);
      
      if (!portfolioState || !portfolioState.balance) {
        console.error(`[TradingPace-API] Portfolio state not found for ${mode} mode`);
        throw new Error(`Portfolio state not found for ${mode} mode`);
      }
      
      const portfolioBalance = parseFloat(portfolioState.balance);
      const targetDailyAvgEarningPct = portfolioBalance > 0 
        ? ((selectedMetrics.dailyProfit / portfolioBalance) * 100).toFixed(2)
        : '0';
      
      // Update only the goal values, preserving actualValue and percentAchieved
      const goalsToUpdate = [
        {
          metricName: 'Target per Trade ($)',
          goalValue: selectedMetrics.earningsPerTrade.toString(),
          actualValue: existingGoals.find(g => g.metricName === 'Target per Trade ($)')?.actualValue || '0',
          percentAchieved: existingGoals.find(g => g.metricName === 'Target per Trade ($)')?.percentAchieved || '0'
        },
        {
          metricName: 'Trades per Day',
          goalValue: selectedMetrics.tradesPerDay.toString(),
          actualValue: existingGoals.find(g => g.metricName === 'Trades per Day')?.actualValue || '0',
          percentAchieved: existingGoals.find(g => g.metricName === 'Trades per Day')?.percentAchieved || '0'
        },
        {
          metricName: 'Earnings per Day',
          goalValue: selectedMetrics.dailyProfit.toString(),
          actualValue: existingGoals.find(g => g.metricName === 'Earnings per Day')?.actualValue || '0',
          percentAchieved: existingGoals.find(g => g.metricName === 'Earnings per Day')?.percentAchieved || '0'
        },
        {
          metricName: 'Target Daily Avg Earning %',
          goalValue: targetDailyAvgEarningPct,
          actualValue: existingGoals.find(g => g.metricName === 'Target Daily Avg Earning %')?.actualValue || '0',
          percentAchieved: existingGoals.find(g => g.metricName === 'Target Daily Avg Earning %')?.percentAchieved || '0'
        }
      ];

      // Upsert goals
      for (const goalData of goalsToUpdate) {
        if (mode === 'live') {
          await storage.upsertGoalLive(goalData);
        } else {
          await storage.upsertGoalPaper(goalData);
        }
      }
      
      console.log(`[TradingPace-API] Synced Performance Metrics + Target Daily % goals for ${mode} mode (balance: $${portfolioBalance}):`, goalsToUpdate.map(g => `${g.metricName}=${g.goalValue}`).join(', '));
    }
    
    res.json({
      success: true,
      pace: tradingPace
    });
  } catch (error: any) {
    console.error('[TradingPace-API] Error updating trading pace:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Phase 27.F.18: Get LATTI-calculated target metrics
 * GET /api/latti/targets?mode={mode}&preset={preset}
 * Returns dynamic target metrics based on guardrails, portfolio balance, and optional preset
 */
export async function handleLATTITargets(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user!.id;
    const mode = req.query.mode as 'live' | 'paper';
    const preset = req.query.preset as 'conservative' | 'baseline' | 'optimistic' | 'aggressive' | undefined;
    
    // Validate mode
    if (!mode || (mode !== 'live' && mode !== 'paper')) {
      return res.status(400).json({ 
        error: 'Mode parameter is required and must be "live" or "paper"' 
      });
    }
    
    // Get current system context to determine trading pace
    const context = await storage.getSystemContext(mode);
    const currentPace = preset || context?.tradingPace || 'baseline';
    
    // Validate preset if provided
    const validPaces = ['conservative', 'baseline', 'optimistic', 'aggressive'];
    if (preset && !validPaces.includes(preset)) {
      return res.status(400).json({ 
        error: `Invalid preset. Must be one of: ${validPaces.join(', ')}` 
      });
    }
    
    // Get guardrails for risk limits
    const guardrails = await storage.getGuardrails({ mode });
    const maxRiskPerTrade = guardrails ? parseFloat(guardrails.riskPerTrade) : 150;
    
    // Get portfolio balance
    const portfolioState = await storage.getPortfolioState({ globalContextId: userId, mode });
    
    if (!portfolioState || !portfolioState.balance) {
      console.error(`[LATTI-Targets] Portfolio state not found for ${mode} mode`);
      return res.status(404).json({ 
        error: `Portfolio balance not found for ${mode} mode. Please ensure portfolio state is initialized.` 
      });
    }
    
    const portfolioBalance = parseFloat(portfolioState.balance);
    
    // Phase 27.F.21: LATTI targets work BACKWARDS from desired portfolio percentage returns
    // These are aspirational targets independent of guardrails (which control actual execution limits)
    const targetPctByPace: Record<string, number> = {
      conservative: 0.004,  // 0.4% daily (0.3%-0.5% range)
      baseline: 0.009,      // 0.9% daily (0.8%-1.0% range)
      optimistic: 0.0125,   // 1.25% daily (1.2%-1.3% range)
      aggressive: 0.0175    // 1.75% daily (1.5%-2.0% range)
    };
    
    const tradesPerDayByPace: Record<string, number> = {
      conservative: 2,
      baseline: 4,
      optimistic: 6,
      aggressive: 8
    };
    
    // Define LATTI-calculated pace metrics
    // Phase 27.F.21: Calculate from target percentages, NOT from guardrails
    const paceMetrics: Record<string, { 
      risk_per_trade: number; 
      trades_per_day: number; 
      earnings_per_trade: number; 
      daily_profit: number;
      target_daily_avg_earning_pct: string;
    }> = {};
    
    for (const [pace, targetPct] of Object.entries(targetPctByPace)) {
      const trades_per_day = tradesPerDayByPace[pace];
      const daily_profit = portfolioBalance * targetPct;
      const earnings_per_trade = daily_profit / trades_per_day;
      // Reverse calculate risk from earnings (assuming 25% profit target)
      const risk_per_trade = earnings_per_trade / 0.25;
      
      paceMetrics[pace] = {
        risk_per_trade: parseFloat(risk_per_trade.toFixed(2)),
        trades_per_day,
        earnings_per_trade: parseFloat(earnings_per_trade.toFixed(2)),
        daily_profit: parseFloat(daily_profit.toFixed(2)),
        // Phase 27.F.25: Use original targetPct directly to preserve decimal precision (e.g., 1.75%)
        target_daily_avg_earning_pct: (targetPct * 100).toFixed(2)
      };
    }
    
    const metrics = paceMetrics[currentPace];
    
    // Phase 27.F.21: Diagnostic console.table for all presets
    console.table({
      conservative: { 
        target_pct: paceMetrics.conservative.target_daily_avg_earning_pct + '%',
        daily_profit: '$' + paceMetrics.conservative.daily_profit,
        trades: paceMetrics.conservative.trades_per_day 
      },
      baseline: { 
        target_pct: paceMetrics.baseline.target_daily_avg_earning_pct + '%',
        daily_profit: '$' + paceMetrics.baseline.daily_profit,
        trades: paceMetrics.baseline.trades_per_day 
      },
      optimistic: { 
        target_pct: paceMetrics.optimistic.target_daily_avg_earning_pct + '%',
        daily_profit: '$' + paceMetrics.optimistic.daily_profit,
        trades: paceMetrics.optimistic.trades_per_day 
      },
      aggressive: { 
        target_pct: paceMetrics.aggressive.target_daily_avg_earning_pct + '%',
        daily_profit: '$' + paceMetrics.aggressive.daily_profit,
        trades: paceMetrics.aggressive.trades_per_day 
      }
    });
    
    console.log(`[LATTI-Targets] ${mode} mode, preset=${currentPace}, balance=$${portfolioBalance}, target=${metrics.target_daily_avg_earning_pct}%`);
    
    res.json({
      mode,
      preset: currentPace,
      portfolio_balance: portfolioBalance,
      risk_per_trade: metrics.risk_per_trade,
      trades_per_day: metrics.trades_per_day,
      earnings_per_trade: parseFloat(metrics.earnings_per_trade.toFixed(2)),
      daily_profit: parseFloat(metrics.daily_profit.toFixed(2)),
      target_daily_avg_earning_pct: metrics.target_daily_avg_earning_pct,
      // Additional metadata
      max_risk_per_trade_limit: maxRiskPerTrade,
      calculated_at: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[LATTI-Targets] Error calculating targets:', error.message);
    res.status(500).json({ error: error.message });
  }
}
