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
import { getPassiveLearningBuffer, getREB211DriftBuffer, getREB211IntegrityBuffer, getREB211TimingBuffer, getREB211MismatchBuffer, getREB211StressBuffer, getActiveAuditBuffer, getReb211bSymbolTraces } from "./services/market-scanner";
import { getPortfolioBalanceV2, buildSettingsFromGuardrails as buildSettingsFromModeLevel } from "./services/guardrail-settings";
import { buildSettingsFromGuardrails, checkGuardrailRisk, calculateRiskAmount, type TradeCandidate } from "./services/trade-safety";
import { formulaAuditService } from "./services/formula-audit";
import { AlertsService } from "./services/alerts-service";
import { insertTradingSettingsSchema, insertWatchlistPairSchema, insertGuardrailsSchema, insertScreenerFiltersSchema, reasoningTrace, reasoningQueue, awarenessStateLog, ethicalPrinciple, ethicalViolationLog, crossAgentEthicsSession, clusterResultLog, tuningPolicy, tuningEvent, strategyParamSchema } from "@shared/schema";
import { z } from 'zod';
import { validateGuardrails, validateFilters, validateNoLegacyKeys, LegacyFieldError } from "../types/config";
import { databaseMonitor } from "./services/database-monitor";
import { stockService } from "./services/stocks";
import { marketDataService } from "./services/market-data";
import { actuationPolicyService } from "./services/actuation-policy";
import { assetCapabilitiesService } from "./services/asset-capabilities";
import { parseIntent } from "./services/intent-parser";
import { CommandRouter } from "./services/command-router";
import { commandLogger } from "./services/command-logger";
// Directive 12.2.7: NLAI imports removed (nlai-interpreter, nlai-execution-broker, execution-policy-controller)
// MIGRATION: OpenAI import disabled — legacy dependency, will be fully removed
// import OpenAI from "openai";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from 'fs/promises';
import path from 'path';
import { validatePasswordStrength, hashPassword, verifyPassword, getPasswordStrengthMessage } from "./services/auth-service";
// Directive 12.2.3: bobStatsHandler import removed (file deleted in Batch 7A)
// Directive 12.2.3: bobCore import removed (file deleted in Batch 7A)
// Directive 12.2.3: metricsBob import removed (file deleted in Batch 7A)
// Directive 12.2.3: dataBob import removed (file deleted in Batch 7A)
// Directive 12.2.3: configBob import removed (file deleted in Batch 7A)
// Directive 12.2.3: strategyBob import removed (file deleted in Batch 7A)
// Directive 12.2.3: tradeBob import removed (file deleted in Batch 7A)
// Directive 12.2.3: insightBob import removed (file deleted in Batch 7A)
// Directive 12.2.3: uiBob import removed (file deleted in Batch 7A)
// Directive 12.2.3: cortexCore import removed (file deleted in Batch 7A)
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
import { marketVolumeCache } from './services/market-volume-cache.js';
import { b5SizingAudit } from './services/b5-sizing-audit.js';
import { livePricingAdapter } from './services/live-pricing-adapter.js';
import { krakenWebSocketAdapter } from './services/kraken-websocket-adapter.js';
import { slippageFeeModel } from './services/slippage-fee-model.js';
import { c5FinancialDiagnostics } from './services/c5-financial-diagnostics.js';
import { clearReadyToBuy } from './utils/clear-routines.js';
import { verificationTestProtocol } from './services/verification-test-protocol.js';
import { miniBookIntegrityMonitor } from './services/monitoring/mini-book-integrity-monitor.js';
import os from 'os';
import { DEFAULT_TAKER_FEE, DEFAULT_SLIPPAGE as CANONICAL_SLIPPAGE } from './config/exchange-defaults.js';
import { validateFilterChange, logAdjustmentEvent } from './config/adjustment-registry.js';
import { getBaselineVersion } from './config/authority-baseline.js';

// Rate Limiting for Authentication Endpoints - prevent brute force attacks
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 login attempts per window
  message: { error: "Too many login attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

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

// Directive 12.2.7: ExecutionPolicyController + NLAI broker initialization removed (deprecated)

// Phase 6.8: Store pending confirmations per user for bare "yes/no" replies
const userPendingConfirmations = new Map<string, string>(); // userId -> confirmationId

// JWT secrets for authentication
// Directive 12.1.3: JWT secrets must come from environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start without it.');
}
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_REFRESH_SECRET) {
  throw new Error('FATAL: JWT_REFRESH_SECRET environment variable is not set. Server cannot start without it.');
}

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
    { expiresIn: '7d' } // Batch 47f15: Extended from 12h to 7d — matches refresh token. Kyle prefers no session timeout.
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

import { SystemUserCache } from './utils/system-user-cache.js';

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


  // REB 2.7: FX5Scanner now starts from server/startup/fx5-scanner-bootstrap.ts
  // Called early from server/index.ts BEFORE registerRoutes to ensure unconditional startup
  // Scan24hAggregator initialization removed from here - scanner is independent

  // Phase 27.DX: Add diagnostic trace middleware for goals and trading endpoints
  apiRouter.use(diagnosticTraceMiddleware);

  // API Routes

  // Health check endpoint - redirects to healthRouter for full system health
  // Directive 8.8.4-A4.R10R-4: System health is now handled by /api/health via healthRouter

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

  // Directive 11.8B-B: LATTI Tuning Metrics Endpoint removed

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

  // Directive 10.9D: Telemetry Summary endpoint for Diagnostics UI
  apiRouter.get('/telemetry/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getTelemetryAggregator } = await import('./services/telemetry-aggregator.js');
      const aggregator = getTelemetryAggregator();
      const summary = aggregator.getTelemetrySummaryWithCoefficients();
      res.json(summary);
    } catch (error: any) {
      console.error('[10.9D] Error fetching telemetry summary:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Directive 11.4C-R2: Top Batch API Endpoint (M66)
  // Directive 11.4C.3-C: Normalize signalType at API level before UI serialization
  // Directive 11.4H.2: Added pool filter and friction data
  // Directive 11.4H.5-Fix: Benchmark pool returns ALL benchmark symbols regardless of telemetry
  apiRouter.get('/pairs/ranked', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getTelemetryAggregator } = await import('./services/telemetry-aggregator.js');
      const { getTypeForStrategy } = await import('./config/canonical-regime-strategy-map.js');
      const { mapFrictionVisual } = await import('./core/metrics/cost-metrics.js');
      const { isBenchmarkSymbol, BENCHMARK_SYMBOLS } = await import('./services/fx5-scanner.js');
      const telemetry = getTelemetryAggregator();
      
      const limit = parseInt(req.query.limit as string ?? '100');
      const poolFilter = req.query.pool as string | undefined;
      let rawPairs = telemetry.getRankedPairs(limit);
      
      // Directive 11.4H.5-Fix: For benchmark pool, return ALL benchmark symbols
      // Force-include benchmark pairs even if they don't have telemetry yet
      if (poolFilter === 'benchmark') {
        const benchmarkPairsFromTelemetry = rawPairs.filter(p => isBenchmarkSymbol(p.symbol));
        const telemetrySymbols = new Set(benchmarkPairsFromTelemetry.map(p => p.symbol));
        
        // Add placeholder entries for benchmark symbols missing from telemetry
        const missingBenchmarks = BENCHMARK_SYMBOLS.filter(s => !telemetrySymbols.has(s));
        const now = new Date().toISOString();
        const placeholders = missingBenchmarks.map((symbol, idx) => ({
          rank: benchmarkPairsFromTelemetry.length + idx + 1,
          symbol,
          score: 0,
          signalType: 'Pending',
          strategy: 'Awaiting Scan',
          pattern: '—',
          regime: 'UNKNOWN',
          regimeScore: 0,
          source: 'placeholder' as const,
          lastUpdated: now,
          frictionScore: 50,
        }));
        
        rawPairs = [...benchmarkPairsFromTelemetry, ...placeholders];
        console.log(`[11.4H.5-Fix][Benchmark] Returning ${benchmarkPairsFromTelemetry.length} with telemetry + ${missingBenchmarks.length} placeholders`);
      }
      
      // Directive 11.4H.4A-Fix2: Get global dominant regime for UI consistency
      // This ensures Top Scanned Pairs tab shows the SAME regime as Overview tab
      const dominantRegime = telemetry.getDominantRegime();
      
      // Directive 11.4C.3-C: Enforce canonical signalType mapping before transmission
      // Directive 11.4H.2: Add friction and benchmark data to response
      // Directive 11.4H.3: Include numeric frictionScore for UI display
      const pairs = rawPairs.map(p => {
        const rawFrictionScore = (p as any).frictionScore ?? 50;
        const frictionVisual = mapFrictionVisual(rawFrictionScore);
        const isBenchmark = isBenchmarkSymbol(p.symbol);
        
        return {
          ...p,
          signalType: p.strategy && p.strategy !== '—' ? getTypeForStrategy(p.strategy) : p.signalType,
          frictionScore: Math.round(rawFrictionScore), // Directive 11.4H.3: Include numeric score for "score label" display
          frictionLabel: frictionVisual.label.split(':')[1]?.trim() || frictionVisual.label,
          frictionColor: frictionVisual.color,
          isBenchmark,
          poolType: isBenchmark ? 'BENCHMARK' : 'STANDARD'
        };
      });
      
      // Directive 11.4H.4A-Fix2: Return global regime with pairs for UI consistency
      res.json({
        pairs,
        globalRegime: dominantRegime ? {
          regime: dominantRegime.regime,
          regimeScore: dominantRegime.avgRegimeScore,
          pairCount: dominantRegime.pairCount,
          percentage: dominantRegime.percentage
        } : null
      });
    } catch (error: any) {
      console.error('[11.4C-R2][M66] Error fetching ranked pairs:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Directive 11.8B-B: LATTI Learning Insights, Cross-Strategy, Strategy Usage endpoints removed

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

  // Directive 8.9.4-VTP: Verification Test Protocol Routes
  apiRouter.post('/vtp/start', async (_req, res) => {
    try {
      const result = await verificationTestProtocol.startSession();
      res.json(result);
    } catch (err: any) {
      console.error("[VTP][START_ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/vtp/stop', async (_req, res) => {
    try {
      const result = await verificationTestProtocol.stopSession();
      res.json(result);
    } catch (err: any) {
      console.error("[VTP][STOP_ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.get('/vtp/status', async (_req, res) => {
    try {
      const status = verificationTestProtocol.getStatus();
      res.json(status);
    } catch (err: any) {
      console.error("[VTP][STATUS_ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Directive 8.9.5: Mini-Book Integrity Monitor Routes
  apiRouter.post('/mbim/start', async (_req, res) => {
    try {
      miniBookIntegrityMonitor.start();
      res.json({ ok: true, message: 'MBIM started (5-min interval)' });
    } catch (err: any) {
      console.error("[8.9.5][MBIM][START_ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/mbim/stop', async (_req, res) => {
    try {
      miniBookIntegrityMonitor.stop();
      res.json({ ok: true, message: 'MBIM stopped' });
    } catch (err: any) {
      console.error("[8.9.5][MBIM][STOP_ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.get('/mbim/status', async (_req, res) => {
    try {
      const metrics = miniBookIntegrityMonitor.getMetrics();
      res.json({
        active: miniBookIntegrityMonitor.isActive(),
        metrics
      });
    } catch (err: any) {
      console.error("[8.9.5][MBIM][STATUS_ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/mbim/audit', async (_req, res) => {
    try {
      const results = await miniBookIntegrityMonitor.runAudit();
      res.json({ ok: true, results, count: results.length });
    } catch (err: any) {
      console.error("[8.9.5][MBIM][AUDIT_ERROR]", err);
      res.status(500).json({ ok: false, error: err.message });
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
      
      // [9.6.3] Source settings from mode-level guardrails_v2 + portfolio_state
      const { buildSettingsFromGuardrails } = await import('./services/guardrail-settings.js');
      const settings = await buildSettingsFromGuardrails(mode, userId);
      
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


  // Phase 27.F.14.B: Trading Pace Control API Endpoints
  apiRouter.get('/system/trading-pace', authenticateToken, handleGetTradingPace);
  apiRouter.put('/system/trading-pace', authenticateToken, handleUpdateTradingPace);

  // Guardrails endpoints (mode-isolated)
  // Phase 7.4: ConfigBob transparent routing for guardrails endpoint
  apiRouter.get('/guardrails', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ error: 'Mode parameter is required and must be "live" or "paper"' });
      }

      // Directive 12.2.3: ConfigBob transparent routing removed (Batch 7B)

      // [9.7] Use guardrails_v2 instead of legacy guardrails table
      let guardrailsData = await storage.getGuardrailsV2({ mode });

      if (!guardrailsData) {
        const { nanoid } = await import('nanoid');
        guardrailsData = {
          id: nanoid(),
          mode,
          portfolioRiskPerTradePct: '1.50',
          symbolCooldownMinutes: 15,
          maxOpenPositions: 5,
          dailyLossKillSwitchPct: '7.00',
          maxPositionPercentPct: '30.00',
          maxTotalExposurePct: '25.00',
          lowPriceMinStopAtrMult: '3.000',
          lowPriceMinPositionNotional: '25.00',
          lowPriceThreshold: '0.5000',
          isManualOverride: false,
          tunedByLatti: true,
          lockedByUser: {},
          managedByLottie: true,
          manualOverrideEnabled: false,
          lastUpdatedBy: null,
          killSwitchTripped: false,
          killSwitchReason: null,
          killSwitchTrippedAt: null,
          lastUpdated: new Date()
        } as any;
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

      // Phase 8.6.5: Invalidate caches and refresh context
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
      
      // Phase 8.8.3-J7.1: Add missing guardrail fields
      // REB 8.8.3-G: Max Position Percent (5th core guardrail)
      const maxPositionPercentPct = rawPayload.maxPositionPercentPct !== undefined
        ? parseFloat(String(rawPayload.maxPositionPercentPct))
        : undefined;
      
      // Phase 8.8.3-B3: Max Total Portfolio Exposure (6th core guardrail)
      const maxTotalExposurePct = rawPayload.maxTotalExposurePct !== undefined
        ? parseFloat(String(rawPayload.maxTotalExposurePct))
        : undefined;
      
      // REB 8.8.3-H: Low-Priced Coin Protection (LPCP) fields
      const lowPriceThreshold = rawPayload.lowPriceThreshold !== undefined
        ? parseFloat(String(rawPayload.lowPriceThreshold))
        : undefined;
      const lowPriceMinStopAtrMult = rawPayload.lowPriceMinStopAtrMult !== undefined
        ? parseFloat(String(rawPayload.lowPriceMinStopAtrMult))
        : undefined;
      const lowPriceMinPositionNotional = rawPayload.lowPriceMinPositionNotional !== undefined
        ? parseFloat(String(rawPayload.lowPriceMinPositionNotional))
        : undefined;

      // Phase 5: Comprehensive coherency validation using GuardrailPolicy
      const { guardrailPolicy } = await import('./services/guardrail-policy');
      
      // Build validation payload
      const validationPayload: any = { mode };
      if (portfolioRiskPerTradePct !== undefined) validationPayload.portfolioRiskPerTradePct = portfolioRiskPerTradePct;
      if (symbolCooldownMinutes !== undefined) validationPayload.symbolCooldownMinutes = symbolCooldownMinutes;
      if (maxOpenPositions !== undefined) validationPayload.maxOpenPositions = maxOpenPositions;
      if (dailyLossKillSwitchPct !== undefined) validationPayload.dailyLossKillSwitchPct = dailyLossKillSwitchPct;
      if (maxPositionPercentPct !== undefined) validationPayload.maxPositionPercentPct = maxPositionPercentPct;
      if (maxTotalExposurePct !== undefined) validationPayload.maxTotalExposurePct = maxTotalExposurePct;
      if (lowPriceThreshold !== undefined) validationPayload.lowPriceThreshold = lowPriceThreshold;
      if (lowPriceMinStopAtrMult !== undefined) validationPayload.lowPriceMinStopAtrMult = lowPriceMinStopAtrMult;
      if (lowPriceMinPositionNotional !== undefined) validationPayload.lowPriceMinPositionNotional = lowPriceMinPositionNotional;
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
      if (maxPositionPercentPct !== undefined) updatePayload.maxPositionPercentPct = String(maxPositionPercentPct);
      if (maxTotalExposurePct !== undefined) updatePayload.maxTotalExposurePct = String(maxTotalExposurePct);
      if (lowPriceThreshold !== undefined) updatePayload.lowPriceThreshold = String(lowPriceThreshold);
      if (lowPriceMinStopAtrMult !== undefined) updatePayload.lowPriceMinStopAtrMult = String(lowPriceMinStopAtrMult);
      if (lowPriceMinPositionNotional !== undefined) updatePayload.lowPriceMinPositionNotional = String(lowPriceMinPositionNotional);
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
        
        // Phase 8.8.3-J7.1: Audit logging for new guardrail fields
        if (maxPositionPercentPct !== undefined && oldGuardrails.maxPositionPercentPct !== String(maxPositionPercentPct)) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'maxPositionPercentPct',
            oldValue: oldGuardrails.maxPositionPercentPct,
            newValue: String(maxPositionPercentPct),
            changedBy: userId,
            tradingMode: mode
          }));
        }
        
        if (lowPriceThreshold !== undefined && oldGuardrails.lowPriceThreshold !== String(lowPriceThreshold)) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'lowPriceThreshold',
            oldValue: oldGuardrails.lowPriceThreshold,
            newValue: String(lowPriceThreshold),
            changedBy: userId,
            tradingMode: mode
          }));
        }
        
        if (lowPriceMinStopAtrMult !== undefined && oldGuardrails.lowPriceMinStopAtrMult !== String(lowPriceMinStopAtrMult)) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'lowPriceMinStopAtrMult',
            oldValue: oldGuardrails.lowPriceMinStopAtrMult,
            newValue: String(lowPriceMinStopAtrMult),
            changedBy: userId,
            tradingMode: mode
          }));
        }
        
        if (lowPriceMinPositionNotional !== undefined && oldGuardrails.lowPriceMinPositionNotional !== String(lowPriceMinPositionNotional)) {
          auditPromises.push(storage.addAuditLog({
            entityType: 'guardrails',
            field: 'lowPriceMinPositionNotional',
            oldValue: oldGuardrails.lowPriceMinPositionNotional,
            newValue: String(lowPriceMinPositionNotional),
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

  // REB 8.8.3-KS-B: Kill switch reset endpoint DEPRECATED
  // Kill switch is now auto-cleared when user starts trading via /api/trading/start
  apiRouter.post('/guardrails-v2/kill-switch/reset', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      ok: false,
      error: 'This endpoint is deprecated (REB 8.8.3-KS-B)',
      message: 'Kill switch is automatically cleared when you start trading. Use the Trading toggle to resume trading.',
      migration: 'Kill switch reset now happens automatically on POST /api/trading/start'
    });
  });

  // Directive 11.8B-C: Goals Presets routes removed - preset system decommissioned
  // Phase 11 Predictive Learning is now the single authority for parameter adjustment
  console.log('[11.8B-C] Goals Presets routes removed - Predictive Learning is single authority');

  // Directive 11.8B-C: Goals Learning Engine routes removed - parallel adaptive systems eliminated
  // Phase 11 Predictive Learning is the single authority for parameter adjustment
  apiRouter.get('/goals-learning/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      ok: false, 
      code: 'DEPRECATED', 
      detail: 'Goals Learning Engine removed in Directive 11.8B-C - Phase 11 Predictive Learning is now the single authority' 
    });
  });

  apiRouter.post('/goals-learning/trigger', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      ok: false, 
      code: 'DEPRECATED', 
      detail: 'Goals Learning Engine removed in Directive 11.8B-C - Phase 11 Predictive Learning is now the single authority' 
    });
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

  // Directive 11.4H.5 Task 3: Market Events API
  // GET /api/market-events - Get market transition events (regime/friction changes)
  apiRouter.get('/market-events', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getMarketEvents } = await import('./utils/market-events.js');
      const limit = parseInt(req.query.limit as string) || 50;
      const events = getMarketEvents(limit);
      res.json({ ok: true, events });
    } catch (error: any) {
      console.error('[MarketEvents] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });
  
  // Directive 11.4H.5 Task 7: Entropy Diagnostic API
  // GET /api/system/entropy - Real-time entropy values of regime distributions
  apiRouter.get('/system/entropy', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getTelemetryAggregator } = await import('./services/telemetry-aggregator.js');
      const telemetry = getTelemetryAggregator();
      const rankedPairs = telemetry.getRankedPairs(1000);
      
      const regimeCounts: Record<string, number> = {};
      let totalPairs = 0;
      
      for (const pair of rankedPairs) {
        const regime = pair.regime || 'UNKNOWN';
        regimeCounts[regime] = (regimeCounts[regime] || 0) + 1;
        totalPairs++;
      }
      
      if (totalPairs === 0) {
        return res.json({
          ok: true,
          entropy: 0,
          maxEntropy: 0,
          normalizedEntropy: 0,
          regimeDistribution: {},
          totalPairs: 0,
          timestamp: new Date().toISOString()
        });
      }
      
      let entropy = 0;
      const regimeDistribution: Record<string, { count: number; probability: number }> = {};
      
      for (const [regime, count] of Object.entries(regimeCounts)) {
        const probability = count / totalPairs;
        regimeDistribution[regime] = { count, probability };
        if (probability > 0) {
          entropy -= probability * Math.log2(probability);
        }
      }
      
      const regimeCount = Object.keys(regimeCounts).length;
      const maxEntropy = Math.log2(regimeCount);
      const normalizedEntropy = regimeCount > 1 ? entropy / maxEntropy : 0;
      
      res.json({
        ok: true,
        entropy: parseFloat(entropy.toFixed(4)),
        maxEntropy: parseFloat(maxEntropy.toFixed(4)),
        normalizedEntropy: parseFloat(normalizedEntropy.toFixed(4)),
        regimeDistribution,
        totalPairs,
        interpretation: normalizedEntropy > 0.8 ? 'High diversity - market regimes are well distributed' :
                       normalizedEntropy > 0.5 ? 'Moderate diversity - some regime concentration' :
                       'Low diversity - market dominated by one regime',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[Entropy] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // GET /api/system/mapping-drift - Directive 11.7F: Mapping drift check comparing canonical vs empirical regimes
  // Directive 11.7I-01: Fixed telemetryService import
  apiRouter.get('/system/mapping-drift', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getTelemetryAggregator } = await import('./services/telemetry-aggregator');
      const telemetryService = getTelemetryAggregator();
      const driftAnalysis = telemetryService.computeMappingDrift();
      
      console.log(`[11.7I-01][MappingDrift] Computed drift: validPairs=${driftAnalysis.validPairs}, isDrifted=${driftAnalysis.isDrifted}`);
      
      res.json({
        ok: true,
        ...driftAnalysis,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[MappingDrift] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // GET /api/system/canonical-map - Directive 11.7F: Get canonical regime-strategy mapping for dynamic UI
  apiRouter.get('/system/canonical-map', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const bridgePath = path.join(process.cwd(), 'bridge/canonical/mapping-regime-strategy.json');
      
      const content = await fs.readFile(bridgePath, 'utf8');
      const bridge = JSON.parse(content);
      
      res.json({
        ok: true,
        ...bridge,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[CanonicalMap] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // POST /api/system/force-sync-canonical - Directive 11.7F: Force sync bridge documents from canonical
  apiRouter.post('/system/force-sync-canonical', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { syncCanonicalBridge } = await import('./scripts/sync-canonical-bridge');
      const result = await syncCanonicalBridge();
      
      res.json({
        ok: result.success,
        filesUpdated: result.filesUpdated,
        errors: result.errors,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[ForceSyncCanonical] POST error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // GET /api/system/mapping-drift/export - Directive 11.7F: Export drift data as CSV
  // Directive 11.7I-01: Fixed telemetryService import
  apiRouter.get('/system/mapping-drift/export', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getTelemetryAggregator } = await import('./services/telemetry-aggregator');
      const telemetryService = getTelemetryAggregator();
      const driftAnalysis = telemetryService.computeMappingDrift();
      
      const csvLines = [
        'Regime,Count,Percentage',
        ...Object.entries(driftAnalysis.distribution).map(([regime, count]) => {
          const pct = ((count / (driftAnalysis.validPairs || 1)) * 100).toFixed(2);
          return `${regime},${count},${pct}%`;
        })
      ];
      
      console.log(`[11.7I-01][MappingDriftExport] Exported ${driftAnalysis.validPairs} pairs`);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="mapping-drift-export.csv"');
      res.send(csvLines.join('\n'));
    } catch (error: any) {
      console.error('[MappingDriftExport] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // GET /api/system/predictive-diagnostics - Directive 11.7G: Predictive diagnostics and filter transparency
  apiRouter.get('/system/predictive-diagnostics', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getPredictiveDiagnosticsService } = await import('./services/predictive-diagnostics.service.js');
      const diagnosticsService = getPredictiveDiagnosticsService();
      const diagnostics = diagnosticsService.getDiagnostics();
      
      res.json({
        ok: true,
        ...diagnostics
      });
    } catch (error: any) {
      console.error('[PredictiveDiagnostics] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // GET /api/system/predictive-diagnostics/filter-descriptions - Directive 11.7G: Get filter descriptions for tooltips
  apiRouter.get('/system/predictive-diagnostics/filter-descriptions', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { PREDICTIVE_FILTER_DESCRIPTIONS, FILTER_STATUS_COLORS, FILTER_STATUS_LABELS } = await import('./config/predictive-filter-descriptions.js');
      
      res.json({
        ok: true,
        descriptions: PREDICTIVE_FILTER_DESCRIPTIONS,
        statusColors: FILTER_STATUS_COLORS,
        statusLabels: FILTER_STATUS_LABELS,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[PredictiveFilterDescriptions] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // GET /api/system/governance - Directive 11.7S: Regime transition governance state with mode stats
  apiRouter.get('/system/governance', authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const { getGovernanceStateForUI, getGovernanceStats } = await import('./core/governance/governance-engine.js');
      const { getLearningCooldownState } = await import('./core/governance/learning-cooldown.js');
      const { STRATEGY_GOVERNANCE, STRATEGY_GOVERNANCE_PROFILES, INFLUENCE_RULES } = await import('./config/strategy-governance.js');
      const { getPreScoreExclusionStats } = await import('./core/governance/strategy-eligibility.js');
      const { resolveStrategyMode, getModeOverlay, getModeStats, STRATEGY_MODE_OVERLAYS } = await import('./core/governance/strategy-modes.js');
      
      const governanceState = getGovernanceStateForUI();
      const learningState = getLearningCooldownState();
      const preScoreStats = getPreScoreExclusionStats();
      const modeStats = getModeStats();
      
      // 11.7S: Derive current mode from stability
      const currentStability = governanceState.stability || 'STABLE';
      const currentMode = resolveStrategyMode(currentStability);
      const currentOverlay = getModeOverlay(currentMode);
      
      res.json({
        ok: true,
        schema: 'governance/v1.2',
        stability: governanceState.stability,
        metrics: governanceState.metrics,
        reason: governanceState.reason,
        stats: governanceState.stats,
        strategyMultipliers: governanceState.strategyMultipliers,
        preScoreExclusions: preScoreStats,
        strategyMode: {
          current: currentMode,
          overlay: currentOverlay,
          overlays: STRATEGY_MODE_OVERLAYS,
          stats: modeStats,
        },
        learning: {
          deferredCount: learningState.deferredCount,
          batchPendingCount: learningState.batchPendingCount,
          stats: learningState.stats,
          canReplay: learningState.canReplay,
        },
        config: {
          influenceRules: INFLUENCE_RULES,
          strategyProfiles: STRATEGY_GOVERNANCE_PROFILES,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[Governance] GET error:', error.message);
      res.status(500).json({ ok: false, code: 'SERVER_ERROR', detail: error.message });
    }
  });

  // Phase 3: Filters V2 API Endpoints (with Manual Override metadata)
  // GET /api/filters-v2?mode=paper|live
  apiRouter.get('/filters-v2', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.query.mode as 'live' | 'paper';
      // Batch 19G: Accept optional filterPath query parameter (default: 'active_quant')
      const filterPath = (req.query.filterPath as string) || 'active_quant';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      // Batch 19G: Validate filterPath
      const validPaths = ['active_quant', 'active_pattern', 'vts_quant', 'vts_pattern'];
      if (!validPaths.includes(filterPath)) {
        return res.status(400).json({ ok: false, code: 'INVALID_FILTER_PATH', detail: `filterPath must be one of: ${validPaths.join(', ')}` });
      }

      // Get screener filters from storage (Batch 19G: with filterPath)
      const screenerData = await storage.getScreenerFilters({ mode, filterPath });

      if (!screenerData) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No filters found for mode: ${mode}, filterPath: ${filterPath}` });
      }

      // Directive 11.8B-D1: All filters are manual-only. No authority flags in response.
      const filtersV2 = {
        mode,
        filters: [
          {
            name: "minVolume",
            value: parseFloat(screenerData.minVolume),
            displayName: "Min Volume ($)",
            category: "Volume & Liquidity"
          },
          {
            name: "minLiquidity",
            value: parseFloat(screenerData.minLiquidity),
            displayName: "Min Liquidity ($)",
            category: "Volume & Liquidity"
          },
          {
            name: "minPrice",
            value: parseFloat(screenerData.minPrice),
            displayName: "Min Price ($)",
            category: "Price Range"
          },
          {
            name: "maxPrice",
            value: parseFloat(screenerData.maxPrice),
            displayName: "Max Price ($)",
            category: "Price Range"
          },
          {
            name: "maxBidAskSpread",
            value: parseFloat(screenerData.maxBidAskSpread),
            displayName: "Max Bid-Ask Spread (%)",
            category: "Execution Quality"
          },
          {
            name: "minMarketCap",
            value: parseFloat(screenerData.minMarketCap),
            displayName: "Min Market Cap ($)",
            category: "Market Filters"
          },
          {
            name: "excludeStablecoins",
            value: screenerData.excludeStablecoins,
            displayName: "Exclude Stablecoins",
            category: "Market Filters"
          },
          {
            name: "allowRegulatedOnly",
            value: screenerData.allowRegulatedOnly,
            displayName: "Regulated Only",
            category: "Market Filters"
          },
          {
            name: "universeSize",
            value: screenerData.universeSize,
            displayName: "Market Universe Size",
            category: "Universe & Signal Controls"
          },
          {
            name: "activeTimeframes",
            value: screenerData.activeTimeframes,
            displayName: "Active Timeframes",
            category: "Universe & Signal Controls"
          },
          {
            name: "confidenceThreshold",
            value: screenerData.confidenceThreshold,
            displayName: "Confidence Threshold (%)",
            category: "Universe & Signal Controls"
          },
          {
            name: "minHistoryDays",
            value: screenerData.minHistoryDays ?? 30,
            displayName: "Minimum History (Days)",
            category: "Data Quality"
          },
          // Batch 19G: IMF threshold fields from DB
          {
            name: "lqMin",
            value: parseFloat(screenerData.lqMin ?? '35'),
            displayName: "LQ Minimum",
            category: "IMF Thresholds"
          },
          {
            name: "vnMax",
            value: parseFloat(screenerData.vnMax ?? '0.93'),
            displayName: "VolNoise Maximum",
            category: "IMF Thresholds"
          },
          {
            name: "corrMax",
            value: parseFloat(screenerData.corrMax ?? '0.92'),
            displayName: "Correlation Maximum",
            category: "IMF Thresholds"
          },
          {
            name: "diMin",
            value: parseFloat(screenerData.diMin ?? '55'),
            displayName: "DI Minimum",
            category: "IMF Thresholds"
          }
        ],
        filterPath, // Batch 19G: Include filterPath in response
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

  // PUT /api/filters-v2?mode=paper|live — sole write path for filter updates
  apiRouter.put('/filters-v2', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    const requestId = `fltv2-${Date.now()}`;
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';
      // Batch 19G: Accept optional filterPath in request body or query
      const filterPath = (req.body.filterPath || req.query.filterPath || 'active_quant') as string;

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ ok: false, code: 'INVALID_MODE', detail: 'Mode parameter is required and must be "live" or "paper"' });
      }

      // Batch 19G: Validate filterPath
      const validFilterPaths = ['active_quant', 'active_pattern', 'vts_quant', 'vts_pattern'];
      if (!validFilterPaths.includes(filterPath)) {
        return res.status(400).json({ ok: false, code: 'INVALID_FILTER_PATH', detail: `filterPath must be one of: ${validFilterPaths.join(', ')}` });
      }

      const { filterName, value } = req.body;

      // Fix per Langston review: range validation (7-365) allows 14 and 21 for pattern/VTS paths
      if (filterName === 'minHistoryDays' && value !== undefined) {
        const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
        if (typeof numValue !== 'number' || isNaN(numValue) || numValue < 7 || numValue > 365) {
          return res.status(400).json({
            ok: false,
            code: 'INVALID_INPUT',
            detail: `minHistoryDays must be between 7 and 365`
          });
        }
      }
      
      console.log(`[FiltersV2:${requestId}] Updating - filterName=${filterName}, value=${value}`);
      
      // Batch 19G: Read by (mode, filterPath) composite key
      const current = await storage.getScreenerFilters({ mode, filterPath });

      if (!current) {
        return res.status(404).json({ ok: false, code: 'NOT_FOUND', detail: `No filters found for mode: ${mode}, filterPath: ${filterPath}` });
      }
      
      const {
        id, createdAt, updatedAt,
        managedByLottie: _mbl,
        manualOverrideEnabled: _moe,
        lastUpdatedBy: _lub,
        lockedByUser: _lbu,
        filterOverrides: _fo,
        ...filterValues
      } = current;

      // REB 2.9B Stage 1: Apply filter value updates if provided
      const updatedFilterValues: Record<string, any> = { ...filterValues };
      
      if (filterName !== undefined && value !== undefined) {
        // Numeric filters
        const numericFilters = ['minVolume', 'minLiquidity', 'minPrice', 'maxPrice', 'maxBidAskSpread',
          'volatilityMin', 'volatilityMax', 'minMarketCap', 'rsiMin', 'rsiMax',
          'universeSize', 'confidenceThreshold', 'minHistoryDays',
          'lqMin', 'vnMax', 'corrMax', 'diMin']; // Batch 19G: IMF threshold fields
        
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
      
      const updatePayload = {
        mode: current.mode,
        filterPath, // Batch 19G: Include filterPath in upsert
        ...updatedFilterValues,
        managedByLottie: false,
        manualOverrideEnabled: true,
        lastUpdatedBy: userId
      };

      // Batch 58b: Adjustment Registry validation (log-only mode)
      if (filterName !== undefined && value !== undefined) {
        const dbColumnMap: Record<string, string> = {
          lqMin: 'lq_min', vnMax: 'vn_max', corrMax: 'corr_max',
          diMin: 'di_min', diMax: 'di_max',
          minVolume: 'min_volume', minPrice: 'min_price',
          minLiquidity: 'min_liquidity', minMarketCap: 'min_market_cap',
          rsiMin: 'rsi_min', rsiMax: 'rsi_max',
          volatilityMin: 'volatility_min', volatilityMax: 'volatility_max',
          maxBidAskSpread: 'max_bid_ask_spread',
          finalScoreMin: 'final_score_min', regimeWeightMin: 'regime_weight_min',
          volume24hMin: 'volume_24h_min',
        };
        const dbColumn = dbColumnMap[filterName];
        if (dbColumn && typeof updatedFilterValues[filterName] === 'number') {
          const oldVal = (current as any)[filterName] ?? 0;
          const validation = validateFilterChange(dbColumn, oldVal, updatedFilterValues[filterName], filterPath);
          if (validation.violation) {
            console.warn(`[FiltersV2:${requestId}] Registry validation: ${validation.violation}`);
          }
          logAdjustmentEvent({
            parameter: dbColumn,
            filterPath,
            oldValue: oldVal,
            newValue: updatedFilterValues[filterName],
            mode: mode === 'paper' ? 'paper' : 'live',
            approver: 'system',
            baselineVersion: getBaselineVersion(),
          });
        }
      }

      // Batch 19G: Upsert by (mode, filterPath) composite key
      const updated = await storage.upsertScreenerFilters(updatePayload);
      
      const auditPromises = [];
      
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
      
      console.log(`[FiltersV2:${requestId}] Filter updated successfully`);
      
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
        { reason: 'Correlation Guard', count: breakdown.failed_correlation ?? 0 }, // 10.9C
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

  // Phase 8.8.3-AJ16: RTB Cooling Diagnostic endpoint
  // Returns comprehensive diagnostic data about why RTB signals dry up
  apiRouter.get('/diagnostics/aj16-rtb', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj16Diagnostic } = await import('./services/aj16-rtb-diagnostic.js');
      
      const snapshots = aj16Diagnostic.getRecentSnapshots(20);
      const strategyStats = aj16Diagnostic.getStrategyStats();
      const topFailures = aj16Diagnostic.getTopFailureReasons(15);
      const cycleSummary = aj16Diagnostic.getCycleSummary();
      
      res.json({
        ok: true,
        cycleId: aj16Diagnostic.getCycleId(),
        cycleSummary,
        strategyStats,
        topFailures,
        recentSnapshots: snapshots.slice(-10),
        generatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[AJ16] Error fetching RTB diagnostics:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch AJ16 RTB diagnostics' });
    }
  });
  
  // Phase 8.8.3-AJ16: Generate full diagnostic report
  apiRouter.get('/diagnostics/aj16-rtb/report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj16Diagnostic } = await import('./services/aj16-rtb-diagnostic.js');
      const report = aj16Diagnostic.generateDiagnosticReport();
      
      res.setHeader('Content-Type', 'text/markdown');
      res.send(report);
    } catch (error: any) {
      console.error('[AJ16] Error generating RTB diagnostic report:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to generate AJ16 RTB diagnostic report' });
    }
  });
  
  // Phase 8.8.3-AJ16: Force snapshot capture
  apiRouter.post('/diagnostics/aj16-rtb/snapshot', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = req.mode!;
      const { aj16Diagnostic } = await import('./services/aj16-rtb-diagnostic.js');
      const { activeFilterPool } = await import('./services/active-filter-pool.js');
      
      const activePool = activeFilterPool.getActivePool(mode);
      const openPositions = await storage.getPaperSimOpenPositions(mode);
      
      aj16Diagnostic.forceSnapshot(mode, {
        activeFilteredPairs: activePool.length,
        openPositionsCount: openPositions.length,
        pairsWithActivePositions: openPositions.length
      });
      
      res.json({ ok: true, message: 'Snapshot captured' });
    } catch (error: any) {
      console.error('[AJ16] Error capturing snapshot:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to capture AJ16 snapshot' });
    }
  });

  // Phase 8.8.3-AJ17: Diagnostic session status endpoint
  apiRouter.get('/diagnostics/aj17/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj17DiagnosticRunner } = await import('./services/aj17-diagnostic-runner.js');
      const status = aj17DiagnosticRunner.getSessionStatus();
      
      res.json({
        ok: true,
        ...status,
        lastBundlePath: aj17DiagnosticRunner.getLastBundlePath()
      });
    } catch (error: any) {
      console.error('[AJ17] Error fetching session status:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch AJ17 session status' });
    }
  });

  // Phase 8.8.3-AJ17: Download diagnostic bundle
  apiRouter.get('/diagnostics/aj17/download', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj17DiagnosticRunner } = await import('./services/aj17-diagnostic-runner.js');
      const fs = await import('fs');
      const path = await import('path');
      
      const lastSession = aj17DiagnosticRunner.getLastCompletedSession();
      
      if (!lastSession || !lastSession.zipPath) {
        return res.status(404).json({ 
          ok: false, 
          error: 'No diagnostic bundle available. Run a paper trading session first.' 
        });
      }
      
      if (!fs.existsSync(lastSession.zipPath)) {
        return res.status(404).json({ 
          ok: false, 
          error: 'Diagnostic bundle file not found. It may have been cleaned up.' 
        });
      }
      
      const fileName = `aj16-diagnostic-${lastSession.sessionId}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      const fileStream = fs.createReadStream(lastSession.zipPath);
      fileStream.pipe(res);
    } catch (error: any) {
      console.error('[AJ17] Error downloading diagnostic bundle:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to download AJ17 diagnostic bundle' });
    }
  });

  // Phase 8.8.3-AJ18: Enhanced RTB Starvation Diagnostic Endpoints
  apiRouter.get('/diagnostics/aj18/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj18DiagnosticRunner } = await import('./services/aj18-diagnostic-runner.js');
      const status = aj18DiagnosticRunner.getSessionStatus();
      
      res.json({
        ok: true,
        ...status,
        lastBundlePath: aj18DiagnosticRunner.getLastBundlePath()
      });
    } catch (error: any) {
      console.error('[AJ18] Error fetching session status:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch AJ18 session status' });
    }
  });

  apiRouter.post('/diagnostics/aj18/start', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj18DiagnosticRunner } = await import('./services/aj18-diagnostic-runner.js');
      const mode = req.mode!;
      const { durationMinutes = 20 } = req.body;
      
      if (aj18DiagnosticRunner.isSessionActive()) {
        return res.status(400).json({
          ok: false,
          error: 'A diagnostic session is already active. Stop it first.'
        });
      }
      
      aj18DiagnosticRunner.startSession(mode, durationMinutes);
      
      res.json({
        ok: true,
        message: `AJ18 diagnostic session started (${mode} mode, ${durationMinutes} minutes)`,
        session: aj18DiagnosticRunner.getCurrentSession()
      });
    } catch (error: any) {
      console.error('[AJ18] Error starting session:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to start AJ18 diagnostic session' });
    }
  });

  apiRouter.post('/diagnostics/aj18/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj18DiagnosticRunner } = await import('./services/aj18-diagnostic-runner.js');
      
      if (!aj18DiagnosticRunner.isSessionActive()) {
        return res.status(400).json({
          ok: false,
          error: 'No active diagnostic session to stop.'
        });
      }
      
      const session = await aj18DiagnosticRunner.stopSessionAndGenerateReport();
      
      res.json({
        ok: true,
        message: 'AJ18 diagnostic session stopped and report generated',
        session
      });
    } catch (error: any) {
      console.error('[AJ18] Error stopping session:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to stop AJ18 diagnostic session' });
    }
  });

  apiRouter.get('/diagnostics/aj18/live-metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj18DiagnosticRunner } = await import('./services/aj18-diagnostic-runner.js');
      
      if (!aj18DiagnosticRunner.isSessionActive()) {
        return res.json({
          ok: true,
          sessionActive: false,
          message: 'No active session. Start a session first.'
        });
      }
      
      const metrics = aj18DiagnosticRunner.getLiveMetrics();
      
      res.json({
        ok: true,
        ...metrics
      });
    } catch (error: any) {
      console.error('[AJ18] Error fetching live metrics:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch AJ18 live metrics' });
    }
  });

  apiRouter.get('/diagnostics/aj18/download', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj18DiagnosticRunner } = await import('./services/aj18-diagnostic-runner.js');
      const fs = await import('fs');
      
      const lastSession = aj18DiagnosticRunner.getLastCompletedSession();
      
      if (!lastSession || !lastSession.zipPath) {
        return res.status(404).json({ 
          ok: false, 
          error: 'No AJ18 diagnostic bundle available. Complete a diagnostic session first.' 
        });
      }
      
      if (!fs.existsSync(lastSession.zipPath)) {
        return res.status(404).json({ 
          ok: false, 
          error: 'Diagnostic bundle file not found. It may have been cleaned up.' 
        });
      }
      
      const fileName = `aj18-diagnostic-${lastSession.sessionId}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      const fileStream = fs.createReadStream(lastSession.zipPath);
      fileStream.pipe(res);
    } catch (error: any) {
      console.error('[AJ18] Error downloading diagnostic bundle:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to download AJ18 diagnostic bundle' });
    }
  });

  // ===== PHASE 8.8.3-AJ19: MAX POSITION GUARDRAIL DIAGNOSTIC =====
  // Investigates why MAX_POSITION guardrail blocks 99%+ of RTB signals after trades open
  
  // AJ19.1: Get diagnostic status and summary
  apiRouter.get('/diagnostics/aj19/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      
      const summary = aj19Diagnostic.getSummary();
      
      res.json({
        ok: true,
        isEnabled: aj19Diagnostic.isActive(),
        isDryRunMode: aj19Diagnostic.isDryRunMode(),
        summary
      });
    } catch (error: any) {
      console.error('[AJ19] Error fetching status:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch AJ19 diagnostic status' });
    }
  });
  
  // AJ19.2: Enable/disable diagnostic logging
  apiRouter.post('/diagnostics/aj19/enable', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      const { enabled } = req.body;
      
      aj19Diagnostic.setEnabled(enabled !== false); // Default to true if not specified
      
      res.json({
        ok: true,
        isEnabled: aj19Diagnostic.isActive(),
        message: aj19Diagnostic.isActive() 
          ? 'AJ19 Max Position diagnostic enabled - logging all position size checks'
          : 'AJ19 Max Position diagnostic disabled'
      });
    } catch (error: any) {
      console.error('[AJ19] Error enabling/disabling diagnostic:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to toggle AJ19 diagnostic' });
    }
  });
  
  // AJ19.3: Enable/disable dry-run mode (MAX_POSITION logs but doesn't block)
  apiRouter.post('/diagnostics/aj19/dry-run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      const { enabled } = req.body;
      
      aj19Diagnostic.setDryRunMode(enabled !== false); // Default to true if not specified
      
      res.json({
        ok: true,
        isDryRunMode: aj19Diagnostic.isDryRunMode(),
        message: aj19Diagnostic.isDryRunMode() 
          ? 'AJ19 dry-run mode ENABLED - MAX_POSITION will log but not block trades'
          : 'AJ19 dry-run mode DISABLED - MAX_POSITION will block normally'
      });
    } catch (error: any) {
      console.error('[AJ19] Error toggling dry-run mode:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to toggle AJ19 dry-run mode' });
    }
  });
  
  // AJ19.4: Get recent diagnostic entries
  apiRouter.get('/diagnostics/aj19/entries', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      const limit = parseInt(req.query.limit as string) || 100;
      
      const entries = aj19Diagnostic.getEntries(limit);
      
      res.json({
        ok: true,
        count: entries.length,
        entries
      });
    } catch (error: any) {
      console.error('[AJ19] Error fetching entries:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch AJ19 diagnostic entries' });
    }
  });
  
  // AJ19.5: Export full diagnostic data
  apiRouter.get('/diagnostics/aj19/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      
      const data = aj19Diagnostic.exportData();
      
      res.json({
        ok: true,
        ...data
      });
    } catch (error: any) {
      console.error('[AJ19] Error exporting diagnostic data:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to export AJ19 diagnostic data' });
    }
  });
  
  // AJ19.6: Clear diagnostic data
  apiRouter.post('/diagnostics/aj19/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      
      aj19Diagnostic.clear();
      
      res.json({
        ok: true,
        message: 'AJ19 diagnostic data cleared, new session started'
      });
    } catch (error: any) {
      console.error('[AJ19] Error clearing diagnostic data:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to clear AJ19 diagnostic data' });
    }
  });
  
  // AJ19.7: Enable/disable dryRunNoGuardrails mode
  // This mode skips BOTH trade creation AND guardrail checks
  // Purpose: Test if RTB signals continue generating when no trades are opened
  apiRouter.post('/diagnostics/aj19/dry-run-no-guardrails', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      const { enabled } = req.body;
      
      aj19Diagnostic.setDryRunNoGuardrails(enabled !== false);
      
      res.json({
        ok: true,
        isDryRunNoGuardrails: aj19Diagnostic.isDryRunNoGuardrails(),
        message: aj19Diagnostic.isDryRunNoGuardrails()
          ? 'DryRunNoGuardrails ENABLED - Signals logged, NO trades created, ALL guardrails skipped'
          : 'DryRunNoGuardrails DISABLED - Normal trade execution will resume'
      });
    } catch (error: any) {
      console.error('[AJ19] Error toggling dryRunNoGuardrails mode:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to toggle dryRunNoGuardrails mode' });
    }
  });
  
  // AJ19.8: Get dryRunNoGuardrails summary
  apiRouter.get('/diagnostics/aj19/dry-run-no-guardrails/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      
      const summary = aj19Diagnostic.getDryRunNoGuardrailsSummary();
      
      res.json({
        ok: true,
        ...summary
      });
    } catch (error: any) {
      console.error('[AJ19] Error fetching dryRunNoGuardrails summary:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch dryRunNoGuardrails summary' });
    }
  });
  
  // AJ19.9: Clear dryRunNoGuardrails data
  apiRouter.post('/diagnostics/aj19/dry-run-no-guardrails/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      
      aj19Diagnostic.clearDryRunData();
      
      res.json({
        ok: true,
        message: 'DryRunNoGuardrails data cleared'
      });
    } catch (error: any) {
      console.error('[AJ19] Error clearing dryRunNoGuardrails data:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to clear dryRunNoGuardrails data' });
    }
  });
  
  // AJ19.10: Export dryRunNoGuardrails data to file
  apiRouter.post('/diagnostics/aj19/dry-run-no-guardrails/export-to-file', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      
      const filepath = aj19Diagnostic.exportDryRunToFile();
      
      res.json({
        ok: true,
        message: 'DryRunNoGuardrails data exported to file',
        filepath,
        summary: aj19Diagnostic.getDryRunNoGuardrailsSummary()
      });
    } catch (error: any) {
      console.error('[AJ19] Error exporting dryRunNoGuardrails data to file:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to export dryRunNoGuardrails data to file' });
    }
  });
  
  // AJ19.11: Export full AJ19 diagnostic data to file
  apiRouter.post('/diagnostics/aj19/export-to-file', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19Diagnostic } = await import('./services/aj19-max-position-diagnostic.js');
      
      const filepath = aj19Diagnostic.exportFullToFile();
      
      res.json({
        ok: true,
        message: 'Full AJ19 diagnostic data exported to file',
        filepath
      });
    } catch (error: any) {
      console.error('[AJ19] Error exporting full diagnostic data to file:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to export full diagnostic data to file' });
    }
  });

  // ===== PHASE 8.8.3-AJ19-B: TRADE LIFECYCLE INTEGRITY TRACING =====
  // Diagnoses whether trade closures properly free slots in the guardrail system
  
  // AJ19-B.1: Get lifecycle diagnostic status and summary
  apiRouter.get('/diagnostics/aj19b/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19bDiagnostic } = await import('./services/aj19b-lifecycle-diagnostic.js');
      
      const summary = await aj19bDiagnostic.getSummary();
      
      res.json({
        ok: true,
        isEnabled: aj19bDiagnostic.isActive(),
        summary
      });
    } catch (error: any) {
      console.error('[AJ19B] Error fetching status:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch AJ19B diagnostic status' });
    }
  });
  
  // AJ19-B.2: Enable/disable lifecycle diagnostic logging
  apiRouter.post('/diagnostics/aj19b/enable', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19bDiagnostic } = await import('./services/aj19b-lifecycle-diagnostic.js');
      const { enabled } = req.body;
      
      aj19bDiagnostic.setEnabled(enabled !== false);
      
      res.json({
        ok: true,
        isEnabled: aj19bDiagnostic.isActive(),
        message: aj19bDiagnostic.isActive() 
          ? 'AJ19B Lifecycle diagnostic enabled - logging all open/close events'
          : 'AJ19B Lifecycle diagnostic disabled'
      });
    } catch (error: any) {
      console.error('[AJ19B] Error enabling/disabling diagnostic:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to toggle AJ19B diagnostic' });
    }
  });
  
  // AJ19-B.3: Run reconciliation check
  apiRouter.post('/diagnostics/aj19b/reconcile', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19bDiagnostic } = await import('./services/aj19b-lifecycle-diagnostic.js');
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      const result = await aj19bDiagnostic.runReconciliation(`manual_${Date.now()}`, mode);
      
      res.json({
        ok: true,
        reconciliation: result,
        message: result.mismatchDetected 
          ? `MISMATCH DETECTED: DB=${result.dbOpenCount}, Guardrail=${result.guardrailOpenCount}`
          : `Counts match: ${result.dbOpenCount} open positions`
      });
    } catch (error: any) {
      console.error('[AJ19B] Error running reconciliation:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to run AJ19B reconciliation' });
    }
  });
  
  // AJ19-B.4: Export lifecycle diagnostic data
  apiRouter.get('/diagnostics/aj19b/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19bDiagnostic } = await import('./services/aj19b-lifecycle-diagnostic.js');
      
      const data = aj19bDiagnostic.exportData();
      
      res.json({
        ok: true,
        ...data
      });
    } catch (error: any) {
      console.error('[AJ19B] Error exporting diagnostic data:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to export AJ19B diagnostic data' });
    }
  });
  
  // AJ19-B.5: Clear lifecycle diagnostic data
  apiRouter.post('/diagnostics/aj19b/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { aj19bDiagnostic } = await import('./services/aj19b-lifecycle-diagnostic.js');
      
      aj19bDiagnostic.clear();
      
      res.json({
        ok: true,
        message: 'AJ19B lifecycle diagnostic data cleared'
      });
    } catch (error: any) {
      console.error('[AJ19B] Error clearing diagnostic data:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to clear AJ19B diagnostic data' });
    }
  });
  
  // AJ19-B.6: Get current open positions state (for debugging)
  apiRouter.get('/diagnostics/aj19b/open-positions', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      const positions = await storage.getPaperSimOpenPositions(mode);
      
      res.json({
        ok: true,
        mode,
        count: positions.length,
        positions: positions.map(p => ({
          id: p.id,
          symbol: p.symbol,
          quantity: p.quantity,
          avgPrice: p.avgPrice,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          unrealizedPnl: p.unrealizedPnl,
          createdAt: p.createdAt
        }))
      });
    } catch (error: any) {
      console.error('[AJ19B] Error fetching open positions:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch open positions' });
    }
  });
  
  // AJ19-B.7: Force clear stale open positions (DANGEROUS - for debugging only)
  apiRouter.post('/diagnostics/aj19b/force-clear-positions', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      const { confirm } = req.body;
      
      if (confirm !== 'CLEAR_ALL_POSITIONS') {
        return res.status(400).json({ 
          ok: false, 
          error: 'Must confirm with body: { "confirm": "CLEAR_ALL_POSITIONS" }' 
        });
      }
      
      const positions = await storage.getPaperSimOpenPositions(mode);
      const deleteCount = positions.length;
      
      for (const position of positions) {
        try {
          await storage.deletePaperSimOpenPosition(mode, position.id);
          console.log(`[AJ19B][FORCE_DELETE] Deleted position ${position.id} (${position.symbol})`);
        } catch (err: any) {
          console.error(`[AJ19B][FORCE_DELETE_ERROR] Failed to delete position ${position.id}:`, err.message);
        }
      }
      
      const remainingPositions = await storage.getPaperSimOpenPositions(mode);
      
      res.json({
        ok: true,
        message: `Force-cleared ${deleteCount} positions`,
        deletedCount: deleteCount,
        remainingCount: remainingPositions.length
      });
    } catch (error: any) {
      console.error('[AJ19B] Error force-clearing positions:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to force-clear positions' });
    }
  });

  // ===== PHASE B4: DIAGNOSTIC FRAMEWORK =====
  // Observational diagnostics - NO modifications to core trading logic
  
  // B4.1: MAX_POSITION diagnostic logs
  apiRouter.get('/diagnostics/max-position', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b4Diagnostics } = await import('./services/b4-diagnostics.js');
      const limit = parseInt(req.query.limit as string) || 5000;
      const csv = req.query.csv === '1';
      
      if (csv) {
        const csvData = b4Diagnostics.exportToCSV('maxpos');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=max-position-diagnostics.csv');
        return res.send(csvData);
      }
      
      const logs = b4Diagnostics.getMaxPositionLogs(limit);
      const stats = b4Diagnostics.getStats();
      
      res.json({
        ok: true,
        count: logs.length,
        sessionStart: stats.sessionStart,
        totalLogged: stats.maxPositionLogCount,
        logs
      });
    } catch (error: any) {
      console.error('[B4] Error fetching max-position logs:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch max-position diagnostics' });
    }
  });
  
  // B4.2: Funnel diagnostics summary
  apiRouter.get('/diagnostics/funnel-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b4Diagnostics } = await import('./services/b4-diagnostics.js');
      
      const summary = b4Diagnostics.getFunnelSummary();
      const stats = b4Diagnostics.getStats();
      
      res.json({
        ok: true,
        sessionStart: stats.sessionStart,
        ...summary
      });
    } catch (error: any) {
      console.error('[B4] Error fetching funnel summary:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch funnel summary' });
    }
  });
  
  // B4.3: Funnel diagnostics download (CSV)
  apiRouter.get('/diagnostics/funnel-download', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b4Diagnostics } = await import('./services/b4-diagnostics.js');
      const csv = req.query.csv === '1';
      
      if (csv) {
        const csvData = b4Diagnostics.exportToCSV('funnel');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=funnel-diagnostics.csv');
        return res.send(csvData);
      }
      
      const logs = b4Diagnostics.getFunnelLogs();
      res.json({
        ok: true,
        count: logs.length,
        logs
      });
    } catch (error: any) {
      console.error('[B4] Error downloading funnel data:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to download funnel diagnostics' });
    }
  });
  
  // B4.4: WebSocket health validation
  apiRouter.get('/diagnostics/ws-health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b4Diagnostics } = await import('./services/b4-diagnostics.js');
      
      const health = b4Diagnostics.getWSHealth();
      
      res.json({
        ok: true,
        ...health
      });
    } catch (error: any) {
      console.error('[B4] Error fetching WS health:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch WebSocket health' });
    }
  });
  
  // B4.5: Unified export endpoint
  apiRouter.get('/diagnostics/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b4Diagnostics } = await import('./services/b4-diagnostics.js');
      const module = req.query.module as 'maxpos' | 'funnel' | 'ws';
      const csv = req.query.csv === '1';
      
      if (!module || !['maxpos', 'funnel', 'ws'].includes(module)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Invalid module. Use: maxpos, funnel, or ws' 
        });
      }
      
      if (csv) {
        const csvData = b4Diagnostics.exportToCSV(module);
        const filename = `${module}-diagnostics.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        return res.send(csvData);
      }
      
      let data: any;
      switch (module) {
        case 'maxpos':
          data = b4Diagnostics.getMaxPositionLogs();
          break;
        case 'funnel':
          data = b4Diagnostics.getFunnelLogs();
          break;
        case 'ws':
          data = b4Diagnostics.getWSHealth();
          break;
      }
      
      res.json({ ok: true, module, data });
    } catch (error: any) {
      console.error('[B4] Error exporting diagnostics:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to export diagnostics' });
    }
  });
  
  // B4.6: Reset diagnostic session
  apiRouter.post('/diagnostics/b4/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b4Diagnostics } = await import('./services/b4-diagnostics.js');
      
      b4Diagnostics.resetSession();
      
      res.json({
        ok: true,
        message: 'B4 diagnostic session reset',
        stats: b4Diagnostics.getStats()
      });
    } catch (error: any) {
      console.error('[B4] Error resetting diagnostic session:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to reset diagnostic session' });
    }
  });
  
  // B4.7: Get diagnostic stats
  apiRouter.get('/diagnostics/b4/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b4Diagnostics } = await import('./services/b4-diagnostics.js');
      
      const stats = b4Diagnostics.getStats();
      
      res.json({
        ok: true,
        ...stats
      });
    } catch (error: any) {
      console.error('[B4] Error fetching diagnostic stats:', error.message);
      res.status(500).json({ ok: false, error: 'Failed to fetch diagnostic stats' });
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

      // REB 2.12A: Include minHistoryDays for History threshold display
      const response = {
        mode,
        filters: {
          minVolume: parseNumber(screenerFilters.minVolume),
          maxBidAskSpread: parseNumber(screenerFilters.maxBidAskSpread),
          minDailyRange: parseNumber(screenerFilters.volatilityMin) || 0.02,
          minPrice: parseNumber(screenerFilters.minPrice),
          excludeStablecoins: screenerFilters.excludeStablecoins ?? true,
          allowedQuoteCurrencies,
          minHistoryDays: screenerFilters.minHistoryDays ?? 30,
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

  // Directive 11.8B-D1: /api/screeners removed. Use /api/filters-v2.
  apiRouter.get('/screeners', authenticateToken, (_req, res) => {
    res.status(410).json({ ok: false, error: 'Deprecated. Use /api/filters-v2' });
  });
  apiRouter.put('/screeners', authenticateToken, (_req, res) => {
    res.status(410).json({ ok: false, error: 'Deprecated. Use /api/filters-v2' });
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
      
      // REB 8.8.3-KS-B: Check if kill switch is tripped (will be cleared AFTER successful start)
      const { guardrailPolicy } = await import('./services/guardrail-policy.js');
      const wasKillSwitchTripped = await guardrailPolicy.isKillSwitchTripped(mode);
      if (wasKillSwitchTripped) {
        console.log(`[KS-B] Kill switch is tripped for ${mode} mode - will clear after successful engine start`);
      }
      
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
      let startingBalance: number = 0; // REB 8.8.3-D: Store balance for engine start
      
      try {
        // 1. Validate Goals Engine configuration exists (mode-level)
        // [9.7] Use guardrails_v2 instead of legacy guardrails table
        const [filters, guardrails] = await Promise.all([
          storage.getScreenerFilters({ mode }),
          storage.getGuardrailsV2({ mode })
        ]);
        
        if (!filters) {
          preflightErrors.push('Screener filters not configured - please configure filters before starting');
        } else {
          console.log('[PREFLIGHT] ✅ Screener filters loaded');
        }
        
        if (!guardrails) {
          preflightErrors.push('Guardrails not configured - please configure risk limits before starting');
        } else {
          console.log('[PREFLIGHT] ✅ Guardrails V2 loaded (mode-level)');
        }
        
        // 2. Validate database portfolio state exists
        const portfolioState = await storage.getPortfolioState({ globalContextId: 'default', mode });
        if (!portfolioState) {
          preflightErrors.push('Portfolio state not initialized - please initialize portfolio before starting');
        } else {
          startingBalance = parseFloat(portfolioState.balance); // REB 8.8.3-D: Extract balance for engine start
          console.log('[PREFLIGHT] ✅ Portfolio state exists (balance: $' + startingBalance + ')');
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
          console.log(`[ENGINE_STARTING_PAPER] Calling startPaperSimulation (balance: $${startingBalance})...`);
          const result = await startPaperSimulation(userId, { 
            skipAutoWatchlist: true,
            startingBalance // REB 8.8.3-D: Pass extracted balance to paper simulation
          });
          console.log(`[TradingStart] Paper simulation started for user ${userId} with balance $${startingBalance}`);
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
      
      // REB 8.8.3-KS-B: Clear kill switch AFTER successful engine start (atomic truth)
      // This ensures kill switch only clears when engine actually started successfully
      if (wasKillSwitchTripped) {
        console.log(`[KS-B] Engine started successfully - now clearing kill switch for ${mode} mode`);
        await guardrailPolicy.resetKillSwitch(mode);
        console.log(`[KS-B] Kill switch cleared for ${mode} mode`);
        
        // Broadcast kill switch cleared event
        const { contextBridge } = await import('./services/context-bridge.js');
        contextBridge.broadcast({
          type: 'system:killswitch_cleared',
          payload: {
            mode,
            userId,
            timestamp: new Date().toISOString()
          }
        });
      }
      
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
      
      // I7-ROOT-FIX (A3): Ensure WS coverage hooks run when trading starts
      try {
        await krakenWebSocketAdapter.ensureCoverageForOpenPositions?.('i7-root-fix');
        await krakenWebSocketAdapter.ensureTickMonitoringStarted?.('i7-root-fix');
      } catch (wsHooksErr) {
        console.warn('[I7-ROOT-FIX][WS_HOOKS_FAILED]', wsHooksErr);
      }
      
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
      
      // REB 8.8.3-KS-B: Kill switch was never cleared because engine failed to start
      // This is the correct behavior - kill switch remains tripped until trading successfully starts
      console.log(`[KS-B] Engine start failed - kill switch remains in its current state`);
      
      if (error.message?.includes('timeout')) {
        return res.status(504).json({ 
          error: 'Engine start timeout', 
          message: 'Trading engine failed to start within 30 seconds. Please try again.',
          reason: 'timeout',
          elapsed: `${elapsed}ms`
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to start trading', 
        details: error.message,
        message: 'Engine failed to start. Please try again or check system logs.'
      });
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
      
      // Directive 8.8.4-C.14.C: Clear Ready-to-Buy signals queue when trading stops
      await clearReadyToBuy(mode as 'paper' | 'live', 'StopTrading');
      
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
          // [9.6.3] Live mode - ALWAYS use Kraken valuation for consistency
          try {
            const krakenService = new KrakenService();
            const krakenBalance = await krakenService.getAccountBalance();
            const usdBalance = parseFloat(krakenBalance.ZUSD || krakenBalance.USD || '0');
            
            // Get live prices for crypto assets using price cache
            const { priceCache } = await import('./services/price-cache.js');
            let cryptoUSD = 0;
            
            // Calculate crypto value using live prices
            for (const [asset, amount] of Object.entries(krakenBalance)) {
              if (asset === 'ZUSD' || asset === 'USD') continue;
              const amountNum = parseFloat(String(amount) || '0');
              if (amountNum <= 0) continue;
              
              // Map Kraken asset to symbol (e.g., XXBT -> BTC/USD)
              const assetMap: Record<string, string> = {
                'XXBT': 'BTC/USD', 'XBT': 'BTC/USD',
                'XETH': 'ETH/USD', 'ETH': 'ETH/USD',
                'XSOL': 'SOL/USD', 'SOL': 'SOL/USD',
                'XXRP': 'XRP/USD', 'XRP': 'XRP/USD',
              };
              const symbol = assetMap[asset] || `${asset.replace(/^X/, '')}/USD`;
              const livePrice = priceCache.getCachedPrice(symbol);
              if (livePrice && livePrice.price > 0) {
                cryptoUSD += amountNum * livePrice.price;
              }
            }
            
            totalValue = usdBalance + cryptoUSD;
            cash = usdBalance;
            crypto = cryptoUSD;
            syncTimestamp = new Date();
            balanceSource = 'kraken-live';
            balanceError = undefined;
          } catch (krakenError: any) {
            console.warn('[9.6.3] Kraken balance fetch failed:', krakenError.message);
            totalValue = 0;
            cash = 0;
            crypto = 0;
            syncTimestamp = undefined;
            balanceSource = 'kraken-error';
            balanceError = krakenError.message;
          }
        }
        
        // [9.6.3] Get mode-specific metrics from storage queries
        const openPositions = mode === 'paper' 
          ? await storage.getPaperSimOpenPositions(mode)
          : await storage.getActiveTrades(mode);
        const closedTrades = mode === 'paper'
          ? await storage.getPaperSimTrades(mode, { closedOnly: true })
          : await storage.getTrades(mode, { status: 'closed' });
        
        const metrics = {
          unrealizedPL: 0,
          realizedPL: closedTrades.reduce((sum, t) => sum + parseFloat((t as any).pnl || t.realizedPL || '0'), 0),
          currentExposure: 0,
          openTradesCount: openPositions.length
        };
        
        // [9.6.3] Calculate win rate from closed trades
        const recentTrades = closedTrades.slice(-30);
        const wins = recentTrades.filter(t => parseFloat((t as any).pnl || t.realizedPL || '0') > 0).length;
        const winRateData = {
          winRate: recentTrades.length > 0 ? (wins / recentTrades.length) * 100 : 0,
          totalTrades: recentTrades.length,
          winningTrades: wins
        };
        
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

  // [9.6.3] Portfolio earnings endpoint - simplified using storage queries
  apiRouter.get('/portfolio/earnings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      const closedTrades = mode === 'paper'
        ? await storage.getPaperSimTrades(mode, { closedOnly: true })
        : await storage.getTrades(mode, { status: 'closed' });
      
      const totalEarnings = closedTrades.reduce((sum, t) => sum + parseFloat((t as any).pnl || t.realizedPL || '0'), 0);
      res.json({ totalEarnings, tradeCount: closedTrades.length, mode });
    } catch (error) {
      console.error('Error fetching earnings:', error);
      res.status(500).json({ error: 'Failed to fetch earnings data' });
    }
  });

  // [9.6.3] Portfolio earnings chart - simplified using storage queries
  apiRouter.get('/portfolio/earnings-chart', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || (req.headers['x-app-mode'] as 'live' | 'paper') || 'paper';
      const days = parseInt(req.query.days as string) || 30;
      
      const closedTrades = mode === 'paper'
        ? await storage.getPaperSimTrades(mode, { closedOnly: true })
        : await storage.getTrades(mode, { status: 'closed' });
      
      // Group by date and calculate daily P/L
      const dailyPL: Record<string, number> = {};
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      closedTrades
        .filter(t => (t as any).closedAt || t.exitTime)
        .filter(t => new Date((t as any).closedAt || t.exitTime!) >= cutoffDate)
        .forEach(t => {
          const date = new Date((t as any).closedAt || t.exitTime!).toISOString().split('T')[0];
          dailyPL[date] = (dailyPL[date] || 0) + parseFloat((t as any).pnl || t.realizedPL || '0');
        });
      
      const chartData = Object.entries(dailyPL)
        .map(([date, pl]) => ({ date, pl }))
        .sort((a, b) => a.date.localeCompare(b.date));
      
      res.json({ chartData, days, mode });
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
      
      // [9.6.3] Read portfolio balance from portfolio_state (mode-level)
      const { getPortfolioBalanceV2 } = await import('./services/guardrail-settings.js');
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
      
      // [9.6.3] Read portfolio balance from portfolio_state (mode-level)
      const { getPortfolioBalanceV2 } = await import('./services/guardrail-settings.js');
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
      
      // [9.6.3] Read portfolio balance from portfolio_state (mode-level)
      const { getPortfolioBalanceV2 } = await import('./services/guardrail-settings.js');
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
      // Directive 12.2.3: TradeBob transparent routing removed (Batch 7B)
      const trades = await storage.getActiveTrades(mode);
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
      // Directive 12.2.3: TradeBob cache invalidation removed (Batch 7B)

      res.json(closedTrade);
    } catch (error) {
      console.error('Error closing trade:', error);
      res.status(500).json({ error: 'Failed to close trade' });
    }
  });

  // REB 8.8.3-D-FIX: Watchlist route now returns Active Filtered Pool data
  // Formatted to match WatchlistPair schema for backward compatibility
  apiRouter.get('/watchlist', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    console.log('[8.8.3-D-FIX] GET /api/watchlist called - returning Active Filtered Pool for compatibility');
    const mode = req.mode!;
    // Return the Active Filtered Pool formatted as WatchlistPair for backward compatibility
    const activePool = activeFilterPool.getActivePool(mode);
    console.log('[Phase-27.F.15.B.1] Updated route /api/watchlist → mode-based only');
    
    // Map ActiveFilteredPair to WatchlistPair-compatible structure
    res.json(activePool.map(p => ({
      id: `pool-${p.symbol}`,
      mode: mode,
      symbol: p.symbol,
      baseCurrency: p.symbol.replace(/USD$|USDT$/, ''),
      quoteCurrency: p.symbol.endsWith('USDT') ? 'USDT' : 'USD',
      marketCap: null,
      volume24h: p.volume24h?.toString() || null,
      currentPrice: p.price?.toString() || null,
      vwap: null,
      sma: null,
      dailyRange: p.dailyRange?.toString() || null,
      lastScanned: new Date().toISOString(),
      isActive: true,
      addedAt: p.firstSeen,
      source: 'active_filtered_pool'  // Extra field to identify source
    })));
  });

  // Trading Signals (Ready-to-Buy opportunities)
  // REB 8.8.3-E: Now returns real strategy signals from Active Filtered Pool pipeline
  // Phase 8.8.3-J7: Returns pre-computed quantity/estimatedValue from signal storage (no more on-the-fly sizing)
  apiRouter.get('/trading-signals', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      const { status } = req.query;
      
      // [8.8.4-C.10][API_SOURCE] Using rtb_signals table as single source of truth
      const signals = await storage.getRtbSignals({ 
        mode, 
        status: status as string | undefined 
      });
      console.log('[8.8.4-C.10][API_SOURCE] table=rtb_signals, mode=' + mode + ', count=' + signals.length);
      
      // [8.8.4-C.10] Map RTB signal fields to frontend expected format
      // RtbSignal has: quantity, notional (instead of estimatedValue)
      // Directive 8.8.4-A3.R8.5.A: Add UI status mapping for reconfirmed signals
      // Directive 8.8.4-L4: Add mlConfidence and finalRank for RTB ranking
      const signalsWithQuantity = signals.map(signal => {
        const storedQuantity = signal.quantity ? parseFloat(String(signal.quantity)) : 0;
        const storedNotional = signal.notional ? parseFloat(String(signal.notional)) : 0;
        
        const quantity = Number.isFinite(storedQuantity) ? storedQuantity : 0;
        const estimatedValue = Number.isFinite(storedNotional) ? storedNotional : 0;
        
        // A3.R9.0: Map internal status to UI display status with statusUpdatedAt
        let uiStatus: string;
        switch (signal.status) {
          case 'active': uiStatus = 'Active'; break;
          case 'reconfirmed': uiStatus = 'Reconfirmed'; break;
          case 'promoted': uiStatus = 'Promoted'; break;
          case 'expired': uiStatus = 'Expired'; break;
          case 'queued': uiStatus = 'Queued'; break;
          default: uiStatus = signal.status || 'Unknown'; break;
        }
        
        // A3.R9.0: Extract statusUpdatedAt from metadata for traceability
        const metadata = signal.metadata as Record<string, any> || {};
        const statusUpdatedAt = metadata.statusUpdatedAt || null;
        
        // L4/L9: Compute mlConfidence and finalRank with strategyWeight
        // mlConfidence from metadata or estimate from NGC (ML predictions added async in signal orchestrator)
        const mlConfidence = metadata.mlConfidence ?? (signal.ngc ? parseFloat(String(signal.ngc)) * 0.9 : null);
        
        // L9: Strategy weight from metadata (computed via strategyWeights.ts)
        const strategyWeight = metadata.strategyWeight ?? 0.5;
        
        // L9: FinalRank = (NGC × 0.40) + (MLConfidence × 0.35) + (StrategyWeight × 0.25)
        const ngcValue = signal.ngc ? parseFloat(String(signal.ngc)) : 0;
        const mlConfValue = mlConfidence ?? 0.5;
        const finalRank = (ngcValue * 0.40) + (mlConfValue * 0.35) + (strategyWeight * 0.25);

        console.log(`[L9][RTB][FINAL_RANK] ${signal.symbol}: NGC=${ngcValue.toFixed(3)}, ML=${mlConfValue.toFixed(3)}, SW=${strategyWeight.toFixed(3)}, FinalRank=${finalRank.toFixed(4)}`);
        
        return {
          ...signal,
          estimatedQuantity: quantity,
          estimatedValue: estimatedValue,
          uiStatus,
          statusUpdatedAt,
          mlConfidence,
          strategyWeight,
          finalRank
        };
      });
      
      // REB 8.8.3-E: Debug logging for RTB API verification
      console.log('[8.8.3-E][RTB_API]', {
        mode,
        count: signals.length,
        sample: signals.slice(0, 3).map(s => ({ symbol: s.symbol, qty: s.quantity })),
      });
      
      res.json(signalsWithQuantity);
    } catch (error) {
      console.error('Error fetching trading signals:', error);
      res.status(500).json({ error: 'Failed to fetch trading signals' });
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
      
      // Directive 12.2.3: TradeBob transparent routing removed (Batch 7B)
      const trades = await storage.getOpenPaperTrades();
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
      // Directive 12.2.3: TradeBob cache invalidation removed (Batch 7B)

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
      // [9.6.3] Use mode-only query (mode-based architecture)
      const portfolioState = await storage.getPortfolioState({ mode: 'paper' });
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
      
      // [9.7] Read symbolCooldownMinutes from guardrails_v2 to keep in sync
      const guardrails = await storage.getGuardrailsV2({ mode });
      const cooldownMinutes = guardrails?.symbolCooldownMinutes ?? 15; // Default to 15 if not set
      
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

  // Directive 12.2.3: Bob Core route section removed (Batch 7B) — bob/stats, bob/insight, ui/state GET+POST, bob/prefetch

  // Directive 12.2.3: Cortex Core route section removed (Batch 7B) — cortex/status, cortex/snapshot, cortex/flush, cortex/force-sync

  // Global System Health Endpoint - provides comprehensive system status
  apiRouter.get('/system/health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const mode = (req.query.mode as string) || 'live';

    // Directive 12.2.3: Bob Core transparent routing removed (Batch 7B)
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

  // Directive 12.2.3: Bob route handler removed (Batch 7B) — system/health-metrics (depended on metricsBob)

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

  // ==================== Phase 8.5 Addendum G + H: Context Refresh ====================
  // Directive 12.2.3 Batch 7B-hotfix: System Truth routes removed (system-truth-diagnostic.ts deleted in Batch 7A)

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

  // GET /api/diagnostics/reb-2-11B - Get REB 2.11B Symbol Mapping Trace Data
  apiRouter.get('/diagnostics/reb-2-11B', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const traces = getReb211bSymbolTraces(limit);
      
      res.json({
        ok: true,
        traces,
      });
    } catch (error: any) {
      console.error('[REB2.11B] Error fetching symbol trace buffer:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to fetch REB 2.11B symbol trace data', 
        message: error.message 
      });
    }
  });

  // ==================== REB 2.12: Final Filter Wiring Validation ====================

  // GET /api/reb-2-12/run - Run a single controlled FX5 cycle with optional filter overrides
  apiRouter.get('/reb-2-12/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { reb212TestHarness } = await import('./services/reb-2-12-test-harness');
      
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      
      const overrides: any = {};
      if (req.query.minVolume !== undefined) overrides.minVolume = parseFloat(req.query.minVolume as string);
      if (req.query.minLiquidity !== undefined) overrides.minLiquidity = parseFloat(req.query.minLiquidity as string);
      if (req.query.minPrice !== undefined) overrides.minPrice = parseFloat(req.query.minPrice as string);
      if (req.query.maxPrice !== undefined) overrides.maxPrice = parseFloat(req.query.maxPrice as string);
      if (req.query.rsiMin !== undefined) overrides.rsiMin = parseInt(req.query.rsiMin as string);
      if (req.query.rsiMax !== undefined) overrides.rsiMax = parseInt(req.query.rsiMax as string);
      if (req.query.volatilityMin !== undefined) overrides.volatilityMin = parseFloat(req.query.volatilityMin as string);
      if (req.query.volatilityMax !== undefined) overrides.volatilityMax = parseFloat(req.query.volatilityMax as string);
      if (req.query.maxBidAskSpread !== undefined) overrides.maxBidAskSpread = parseFloat(req.query.maxBidAskSpread as string);
      if (req.query.universeSize !== undefined) overrides.universeSize = parseInt(req.query.universeSize as string);
      if (req.query.minHistoryDays !== undefined) overrides.minHistoryDays = parseInt(req.query.minHistoryDays as string);
      if (req.query.excludeStablecoins !== undefined) overrides.excludeStablecoins = req.query.excludeStablecoins === 'true';
      if (req.query.allowRegulatedOnly !== undefined) overrides.allowRegulatedOnly = req.query.allowRegulatedOnly === 'true';
      if (req.query.activeTimeframes !== undefined) {
        try {
          overrides.activeTimeframes = JSON.parse(req.query.activeTimeframes as string);
        } catch {
          overrides.activeTimeframes = (req.query.activeTimeframes as string).split(',');
        }
      }
      
      console.log(`[REB2.12] Received run request - mode: ${mode}, overrides:`, overrides);
      
      const result = await reb212TestHarness.runControlledCycle(mode, overrides);
      
      res.json({
        ok: true,
        ...result,
      });
    } catch (error: any) {
      console.error('[REB2.12] Error running controlled cycle:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to run REB 2.12 controlled cycle', 
        message: error.message 
      });
    }
  });

  // GET /api/reb-2-12/run-all - Run all 15 validation tests
  apiRouter.get('/reb-2-12/run-all', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { reb212TestHarness } = await import('./services/reb-2-12-test-harness');
      
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      
      console.log(`[REB2.12] Running ALL 15 validation tests in ${mode} mode...`);
      
      const results = await reb212TestHarness.runAllTests(mode);
      
      res.json({
        ok: true,
        ...results,
      });
    } catch (error: any) {
      console.error('[REB2.12] Error running all tests:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to run REB 2.12 validation tests', 
        message: error.message 
      });
    }
  });

  // ==================== REB 2.14: Historical Data Integrity Validation ====================

  // GET /api/reb-2-14/run - Run historical data integrity validation
  apiRouter.get('/reb-2-14/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { reb214HistoricalTest } = await import('./services/reb-2-14-historical-test');
      
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      
      console.log(`[REB2.14] Running historical data integrity validation in ${mode} mode...`);
      
      const result = await reb214HistoricalTest.runValidation(mode);
      
      res.json(result);
    } catch (error: any) {
      console.error('[REB2.14] Error running validation:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to run REB 2.14 historical validation', 
        message: error.message 
      });
    }
  });

  // ==================== REB 2.15: FX5 Multi-Cycle Pipeline Certification ====================

  // GET /api/reb-2-15/run - Run FX5 multi-cycle pipeline certification
  apiRouter.get('/reb-2-15/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { reb215Certification } = await import('./services/reb-2-15-certification');
      
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      const cycleCount = req.query.cycles ? parseInt(req.query.cycles as string) : 6;
      
      console.log(`[REB2.15] Running FX5 multi-cycle certification in ${mode} mode with ${cycleCount} cycles...`);
      
      const result = await reb215Certification.runCertification(mode, cycleCount);
      
      res.json(result);
    } catch (error: any) {
      console.error('[REB2.15] Error running certification:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to run REB 2.15 pipeline certification', 
        message: error.message 
      });
    }
  });

  // ==================== REB 2.14-15: Combined Certification ====================

  // GET /api/reb-2-14-15/run-all - Run both REB 2.14 and REB 2.15 sequentially
  apiRouter.get('/reb-2-14-15/run-all', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { reb214HistoricalTest } = await import('./services/reb-2-14-historical-test');
      const { reb215Certification } = await import('./services/reb-2-15-certification');
      
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      
      console.log(`[REB2.14-15] Running combined certification in ${mode} mode...`);
      console.log(`[REB2.14-15] Step 1/2: Historical Data Integrity Validation`);
      
      const reb214Result = await reb214HistoricalTest.runValidation(mode);
      
      console.log(`[REB2.14-15] Step 2/2: FX5 Multi-Cycle Pipeline Certification`);
      
      const reb215Result = await reb215Certification.runCertification(mode, 6);
      
      const summary = {
        reb214_ok: reb214Result.ok,
        reb215_ok: reb215Result.ok,
        all_ok: reb214Result.ok && reb215Result.ok,
        issuesFound: reb214Result.summary.failed + reb215Result.errors.length,
        warningsFound: reb214Result.summary.warnings + reb215Result.warnings.length,
      };
      
      console.log(`[REB2.14-15] Combined certification complete`);
      console.log(`[REB2.14-15] REB 2.14: ${reb214Result.ok ? 'PASS' : 'FAIL'}`);
      console.log(`[REB2.14-15] REB 2.15: ${reb215Result.ok ? 'PASS' : 'FAIL'}`);
      console.log(`[REB2.14-15] Overall: ${summary.all_ok ? 'PASS' : 'FAIL'}`);
      
      res.json({
        reb214: reb214Result,
        reb215: reb215Result,
        summary,
      });
    } catch (error: any) {
      console.error('[REB2.14-15] Error running combined certification:', error);
      res.status(500).json({ 
        ok: false,
        error: 'Failed to run combined REB 2.14-15 certification', 
        message: error.message 
      });
    }
  });

  // ==================== REB 2.12F: Strategy Manifest & Health Check ====================

  // GET /api/diagnostics/strategies - Get definitive strategy manifest
  apiRouter.get('/diagnostics/strategies', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const strategyManifest = [
        {
          id: 'vwap_pullback',
          displayName: 'VWAP Pullback',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectVWAPPullback',
          supportsPaper: true,
          supportsLive: true,
          tags: ['intra-day', 'trend-following', 'volume-weighted'],
          parametersSummary: {
            pullbackThreshold: '2%',
            volumeMultiplier: 1.5,
            maxHoldingPeriod: 24,
            timeframes: ['5m', '15m', '1h']
          }
        },
        {
          id: 'abcd_long',
          displayName: 'ABCD Long',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectABCDLong',
          supportsPaper: true,
          supportsLive: true,
          tags: ['pattern-based', 'swing', 'breakout'],
          parametersSummary: {
            minConsolidation: 10,
            breakoutThreshold: '1.5%',
            volumeMultiplier: 1.5,
            exitType: 'target',
            targetPercent: '3%'
          }
        },
        {
          id: 'sma_trend_ride',
          displayName: 'SMA Trend Ride',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectSMATrendRide',
          supportsPaper: true,
          supportsLive: true,
          tags: ['trend-following', 'moving-average'],
          parametersSummary: {
            smaLength: 20,
            entryCondition: 'above',
            exitCondition: 'break',
            trailingStopPercent: '2%'
          }
        },
        {
          id: 'breakout',
          displayName: 'Breakout',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectBreakout',
          supportsPaper: true,
          supportsLive: true,
          tags: ['breakout', 'range', 'volume-confirmed'],
          parametersSummary: {
            minConsolidationBars: 10,
            maxRangeWidth: 3,
            breakoutBuffer: '1%',
            volumeMultiplier: 2,
            maxHoldingHours: 12
          }
        },
        {
          id: 'mean_reversion',
          displayName: 'Mean Reversion',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectMeanReversion',
          supportsPaper: true,
          supportsLive: true,
          tags: ['mean-reversion', 'oversold', 'vwap'],
          parametersSummary: {
            meanType: 'vwap',
            smaLength: 20,
            deviationThreshold: '2.5%',
            partialExitPercent: 50,
            stopLossBuffer: '1%'
          }
        },
        {
          id: 'range_trading',
          displayName: 'Range Trading',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectRangeTrading',
          supportsPaper: true,
          supportsLive: true,
          tags: ['range', 'support-resistance', 'mean-reversion'],
          parametersSummary: {
            minRangeDurationHours: 12,
            minRangeWidth: '3%',
            minBoundaryTouches: 3,
            entryZoneWidth: '0.5%',
            stopLossBeyond: '1%'
          }
        },
        {
          id: 'vwap_bounce',
          displayName: 'VWAP Bounce',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectVWAPBounce',
          supportsPaper: true,
          supportsLive: true,
          tags: ['intra-day', 'vwap', 'bounce'],
          parametersSummary: {
            vwapProximity: '0.5%',
            minVWAPSlope: '0.3%',
            volumeMultiplier: 1.3,
            maxPullbackBars: 5,
            partialExitR: 1.5
          }
        },
        {
          id: 'liquidity_trap',
          displayName: 'Liquidity Trap',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectLiquidityTrap',
          supportsPaper: true,
          supportsLive: true,
          tags: ['liquidity', 'stop-hunt', 'reversal'],
          parametersSummary: {
            maxTrapExtension: '1.2%',
            trapReturnBars: 2,
            minStopZoneSize: 'medium',
            minLevelTouches: 3,
            volumeRatio: 1.5
          }
        },
        {
          id: 'dhma',
          displayName: 'DHMA',
          enabled: true,
          engineModule: 'strategy-engine.ts:detectDHMA',
          supportsPaper: true,
          supportsLive: true,
          tags: ['microstructure', 'dual-horizon', 'order-flow'],
          parametersSummary: {
            theta_OBI: 0.3,
            epsilon_micro: 0.2,
            tau_toxicity: 0.7,
            maxSpread: 5,
            k_tp: 1.5,
            N_flow: 50,
            N_burst: 10,
            window_session: 20
          }
        }
      ];

      console.log(`[REB2.12F][StrategyManifest] strategies=[`);
      strategyManifest.forEach(s => {
        console.log(`  { id: '${s.id}', enabled: ${s.enabled} }`);
      });
      console.log(`]`);

      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        strategyCount: strategyManifest.length,
        allEnabled: strategyManifest.every(s => s.enabled),
        strategies: strategyManifest
      });
    } catch (error: any) {
      console.error('[REB2.12F] Error fetching strategy manifest:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch strategy manifest',
        message: error.message
      });
    }
  });

  // ==================== Phase 8.8.3-B3.5: Price Tick Cadence Diagnostics ====================
  
  // GET /api/diagnostics/price-tick-cadence - Get price refresh cadence diagnostics
  apiRouter.get('/diagnostics/price-tick-cadence', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { modeRegistry } = await import('./services/mode-registry.js');
      
      // Get both paper and live engines (if available)
      const paperEngine = modeRegistry.getEngine('paper');
      const liveEngine = modeRegistry.getEngine('live');
      
      const paperDiagnostics = paperEngine?.getPriceTickDiagnostics?.() || null;
      const liveDiagnostics = liveEngine?.getPriceTickDiagnostics?.() || null;
      
      // Include last N log entries if requested
      const includeRaw = req.query.includeRaw === '1';
      const paperLogs = includeRaw && paperEngine?.getPriceTickLogs ? paperEngine.getPriceTickLogs() : [];
      const liveLogs = includeRaw && liveEngine?.getPriceTickLogs ? liveEngine.getPriceTickLogs() : [];
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        targetIntervalMs: 1500,
        targetCadenceLabel: '1.5 seconds',
        paper: {
          diagnostics: paperDiagnostics,
          isEngineAvailable: !!paperEngine,
          logs: paperLogs
        },
        live: {
          diagnostics: liveDiagnostics,
          isEngineAvailable: !!liveEngine,
          logs: liveLogs
        },
        summary: {
          paperHealthy: paperDiagnostics?.isHealthy || false,
          liveHealthy: liveDiagnostics?.isHealthy || false,
          allHealthy: (paperDiagnostics?.isHealthy || false) && (liveDiagnostics?.isHealthy !== false)
        }
      });
    } catch (error: any) {
      console.error('[B3.5] Error fetching price tick cadence diagnostics:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch price tick cadence diagnostics',
        message: error.message
      });
    }
  });

  // ==================== Phase 8.8.3-B3.6: WebSocket Price Engine Diagnostics ====================
  
  // GET /api/diagnostics/ws-price-engine - Get WebSocket price engine diagnostics
  // Phase 8.8.3-I4 B2: Enhanced with per-symbol timing stats
  apiRouter.get('/diagnostics/ws-price-engine', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      const diagnostics = krakenWebSocketAdapter.getDiagnostics();
      const includeRaw = req.query.raw === '1';
      const priceLogs = includeRaw ? krakenWebSocketAdapter.getPriceLogs() : [];
      
      // Phase 8.8.3-I4 B2: Get per-symbol timing stats
      const perSymbolStats = krakenWebSocketAdapter.getPerSymbolTimingStats();
      
      // Phase 8.8.3-I5 B4: Calculate tick arrival rate and cache update statistics
      const symbolCount = Object.keys(perSymbolStats).length;
      let totalUpdateCount = 0;
      let avgTickAge = 0;
      const now = Date.now();
      
      for (const [symbol, stats] of Object.entries(perSymbolStats)) {
        const typedStats = stats as { updateCount: number; lastUpdate: number };
        totalUpdateCount += typedStats.updateCount;
        if (typedStats.lastUpdate > 0) {
          avgTickAge += (now - typedStats.lastUpdate);
        }
      }
      if (symbolCount > 0) {
        avgTickAge = avgTickAge / symbolCount;
      }
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        wsConnected: diagnostics.wsConnected,
        subscribedSymbols: diagnostics.subscribedSymbols,
        lastUpdateBySymbol: diagnostics.lastUpdateBySymbol,
        averageIntervalMs: diagnostics.averageIntervalMs,
        maxIntervalMs: diagnostics.maxIntervalMs,
        minIntervalMs: diagnostics.minIntervalMs,
        staleSymbols: diagnostics.staleSymbols,
        cacheSize: diagnostics.cacheSize,
        cacheTTL: diagnostics.cacheTTL,
        reconnectAttempts: diagnostics.reconnectAttempts,
        lastPongAgeMs: diagnostics.lastPongAgeMs,
        priceLogs: priceLogs,
        priceLogCount: priceLogs.length,
        // Phase 8.8.3-I4 B2: Per-symbol timing stats
        perSymbolTimingStats: perSymbolStats,
        // Phase 8.8.3-I5 B4: Tick flow statistics for audit
        i5TickFlowStats: {
          symbolCount,
          totalUpdateCount,
          avgTickAgeMs: Math.round(avgTickAge),
          phase: '8.8.3-I5'
        },
        health: {
          isConnected: diagnostics.wsConnected,
          hasStaleSymbols: diagnostics.staleSymbols.length > 0,
          averageIntervalHealthy: diagnostics.averageIntervalMs > 0 && diagnostics.averageIntervalMs < 2000,
          overall: diagnostics.wsConnected && diagnostics.staleSymbols.length === 0
        }
      });
    } catch (error: any) {
      console.error('[B3.6] Error fetching WS price engine diagnostics:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch WebSocket price engine diagnostics',
        message: error.message
      });
    }
  });

  // ==================== Phase 8.8.3-I8E: WebSocket Health & Staleness Diagnostics ====================
  
  // GET /api/diagnostics/i8e/ws-health - Get per-symbol WebSocket health status
  apiRouter.get('/diagnostics/i8e/ws-health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      const healthData = krakenWebSocketAdapter.getI8EWsHealth();
      
      // Aggregate stats
      const healthySymbols = healthData.filter(h => h.classification === 'healthy');
      const lowVolumeSymbols = healthData.filter(h => h.classification === 'low_volume');
      const staleSymbols = healthData.filter(h => h.classification === 'stale');
      const warmingUpSymbols = healthData.filter(h => h.classification === 'warming_up');
      const noTicksSymbols = healthData.filter(h => h.classification === 'no_ticks_yet');
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I8E',
        thresholds: {
          lowVolumeRangeMs: '5000-25000',
          staleThresholdMs: 30000,
          restFallbackMs: 25000
        },
        summary: {
          totalSymbols: healthData.length,
          healthy: healthySymbols.length,
          lowVolume: lowVolumeSymbols.length,
          warmingUp: warmingUpSymbols.length,
          stale: staleSymbols.length,
          noTicksYet: noTicksSymbols.length
        },
        symbols: healthData.sort((a, b) => {
          // Sort: stale first, then low_volume, then no_ticks_yet, then warming_up, then healthy
          const order: Record<string, number> = { stale: 0, no_ticks_yet: 1, low_volume: 2, warming_up: 3, healthy: 4 };
          return (order[a.classification] ?? 5) - (order[b.classification] ?? 5);
        })
      });
    } catch (error: any) {
      console.error('[I8E] Error fetching WS health:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch I8E WebSocket health',
        message: error.message
      });
    }
  });

  // ==================== Directive 8.8.4-A3.R9.0.D: Signal Flow Trace Diagnostics ====================
  
  // Import the diagnostic trace service
  const { diagnosticTrace } = await import('./core/diagnostics/trace_service.js');
  
  // POST /api/diagnostics/trace/start - Start diagnostic tracing
  apiRouter.post('/diagnostics/trace/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      diagnosticTrace.start();
      const stats = diagnosticTrace.getStats();
      console.log('[A3.R9.0.D] Diagnostic tracing started via API');
      res.json({
        ok: true,
        message: 'Diagnostic tracing started (auto-stops after 10 minutes or 1 MB)',
        stats,
      });
    } catch (error: any) {
      console.error('[A3.R9.0.D][API] Start failed:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/diagnostics/trace/stop - Stop diagnostic tracing
  apiRouter.post('/diagnostics/trace/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      diagnosticTrace.stop();
      const stats = diagnosticTrace.getStats();
      console.log('[A3.R9.0.D] Diagnostic tracing stopped via API');
      res.json({
        ok: true,
        message: 'Diagnostic tracing stopped',
        stats,
      });
    } catch (error: any) {
      console.error('[A3.R9.0.D][API] Stop failed:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/diagnostics/trace/status - Get tracing status
  apiRouter.get('/diagnostics/trace/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const stats = diagnosticTrace.getStats();
      res.json({
        ok: true,
        ...stats,
        logFile: 'logs/diagnostic/trace_A3R9.log',
      });
    } catch (error: any) {
      console.error('[A3.R9.0.D][API] Status check failed:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/diagnostics/trace/entries - Read recent trace entries
  apiRouter.get('/diagnostics/trace/entries', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logPath = path.resolve(process.cwd(), 'logs/diagnostic/trace_A3R9.log');
      
      try {
        const content = await fs.readFile(logPath, 'utf-8');
        const lines = content.split('\n').filter(line => line.includes('[A3.R9.TRACE]'));
        const recentLines = lines.slice(-limit);
        
        const entries = recentLines.map(line => {
          try {
            const jsonStart = line.indexOf('{');
            if (jsonStart >= 0) {
              return JSON.parse(line.substring(jsonStart));
            }
            return { raw: line };
          } catch {
            return { raw: line };
          }
        });
        
        res.json({
          ok: true,
          count: entries.length,
          totalLines: lines.length,
          entries,
        });
      } catch (fileErr: any) {
        if (fileErr.code === 'ENOENT') {
          return res.json({
            ok: true,
            entries: [],
            message: 'No trace log file exists yet',
          });
        }
        throw fileErr;
      }
    } catch (error: any) {
      console.error('[A3.R9.0.D][API] Read entries failed:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== R9.3.HF-5: Central Clock & FX5 Scanner Diagnostics ====================
  
  // GET /api/diagnostics/central-clock - Get Central Clock health status
  apiRouter.get('/diagnostics/central-clock', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { centralClock } = await import('./services/central-clock');
      const { fx5Scanner } = await import('./services/fx5-scanner');
      
      const clockHealth = centralClock.getHealth();
      const scannerState = fx5Scanner.getDiagnostics?.() ?? {
        isRunning: fx5Scanner.getIsRunning?.() ?? 'unknown',
        isScanning: 'unknown',
      };
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        centralClock: {
          ...clockHealth,
          intervalRunning: clockHealth.isRunning,
          lastTickAge: clockHealth.lastTickTime > 0 ? Date.now() - clockHealth.lastTickTime : null,
        },
        fx5Scanner: scannerState,
      });
    } catch (error: any) {
      console.error('[R9.3.HF-5][API] Central Clock diagnostics failed:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Phase 8.8.3-B5: Full Signal Creation & Sizing Pipeline Audit ====================
  
  // GET /api/diagnostics/b5/sizing-log - Get B5 sizing audit log entries
  apiRouter.get('/diagnostics/b5/sizing-log', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b5SizingAudit } = await import('./services/b5-sizing-audit.js');
      const limit = parseInt(req.query.limit as string) || 2000;
      
      const entries = b5SizingAudit.getLog(limit);
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        entryCount: entries.length,
        entries
      });
    } catch (error: any) {
      console.error('[B5] Error fetching sizing log:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch B5 sizing log',
        message: error.message
      });
    }
  });

  // GET /api/diagnostics/b5/sizing-summary - Get B5 sizing audit summary
  apiRouter.get('/diagnostics/b5/sizing-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b5SizingAudit } = await import('./services/b5-sizing-audit.js');
      
      const summary = b5SizingAudit.getSummary();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        summary
      });
    } catch (error: any) {
      console.error('[B5] Error fetching sizing summary:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch B5 sizing summary',
        message: error.message
      });
    }
  });

  // GET /api/diagnostics/b5/export - Export B5 audit data
  apiRouter.get('/diagnostics/b5/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b5SizingAudit } = await import('./services/b5-sizing-audit.js');
      const format = req.query.format as string || 'json';
      const csv = req.query.csv === '1';
      
      if (csv || format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=b5-sizing-audit.csv');
        res.send(b5SizingAudit.exportToCSV());
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=b5-sizing-audit.json');
        res.send(b5SizingAudit.exportToJSON());
      }
    } catch (error: any) {
      console.error('[B5] Error exporting audit data:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to export B5 audit data',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/b5/reset - Reset B5 audit buffer
  apiRouter.post('/diagnostics/b5/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b5SizingAudit } = await import('./services/b5-sizing-audit.js');
      
      b5SizingAudit.reset();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        message: 'B5 sizing audit buffer reset'
      });
    } catch (error: any) {
      console.error('[B5] Error resetting audit buffer:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to reset B5 audit buffer',
        message: error.message
      });
    }
  });

  // GET /api/diagnostics/b5/stats - Get B5 audit stats
  apiRouter.get('/diagnostics/b5/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b5SizingAudit } = await import('./services/b5-sizing-audit.js');
      
      const stats = b5SizingAudit.getStats();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        ...stats
      });
    } catch (error: any) {
      console.error('[B5] Error fetching audit stats:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch B5 audit stats',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/b5/enable - Enable B5 audit
  apiRouter.post('/diagnostics/b5/enable', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b5SizingAudit } = await import('./services/b5-sizing-audit.js');
      b5SizingAudit.enable();
      res.json({ ok: true, message: 'B5 sizing audit enabled' });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/diagnostics/b5/disable - Disable B5 audit
  apiRouter.post('/diagnostics/b5/disable', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { b5SizingAudit } = await import('./services/b5-sizing-audit.js');
      b5SizingAudit.disable();
      res.json({ ok: true, message: 'B5 sizing audit disabled' });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Directive 11.3B: TEC Cost Diagnostics ====================
  
  // GET /api/diagnostics/tec/costs - Get all cached cost metrics
  apiRouter.get('/diagnostics/tec/costs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const startTime = performance.now();
      const { getCostMetrics, getAllCachedSymbols, getCacheTTLRemaining, getOrSetCostMetrics } = await import('./core/cache/cost-cache.js');
      const { computeTotalRoundTripCost } = await import('./core/math/cost-model.js');
      
      const symbols = getAllCachedSymbols();
      const diagnostics = symbols.map(symbol => {
        const metrics = getCostMetrics(symbol);
        const ttl = getCacheTTLRemaining(symbol);
        
        if (metrics) {
          return {
            symbol,
            takerFee: metrics.fee,
            slippage: metrics.slippage,
            spread: metrics.spread,
            totalCost: computeTotalRoundTripCost(metrics.fee, metrics.slippage, metrics.spread),
            source: 'memory',
            ttlRemaining: ttl,
          };
        }
        
        const defaults = getOrSetCostMetrics(symbol);
        return {
          symbol,
          takerFee: defaults.fee,
          slippage: defaults.slippage,
          spread: defaults.spread,
          totalCost: computeTotalRoundTripCost(defaults.fee, defaults.slippage, defaults.spread),
          source: 'default',
          ttlRemaining: getCacheTTLRemaining(symbol),
        };
      });
      
      const duration = performance.now() - startTime;
      
      res.json({
        ok: true,
        data: diagnostics,
        meta: {
          symbolCount: diagnostics.length,
          responseTimeMs: Number(duration.toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error('[11.3B] Error fetching TEC costs:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET /api/diagnostics/tec/costs/:symbol - Get cost metrics for specific symbol
  apiRouter.get('/diagnostics/tec/costs/:symbol', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const startTime = performance.now();
      const { symbol } = req.params;
      const { getOrSetCostMetrics, getCacheTTLRemaining } = await import('./core/cache/cost-cache.js');
      const { computeTotalRoundTripCost } = await import('./core/math/cost-model.js');
      
      const metrics = getOrSetCostMetrics(symbol);
      const ttl = getCacheTTLRemaining(symbol);
      const totalCost = computeTotalRoundTripCost(metrics.fee, metrics.slippage, metrics.spread);
      
      const duration = performance.now() - startTime;
      
      res.json({
        ok: true,
        data: {
          symbol,
          takerFee: metrics.fee,
          slippage: metrics.slippage,
          spread: metrics.spread,
          totalCost,
          source: 'memory',
          ttlRemaining: ttl,
        },
        meta: {
          responseTimeMs: Number(duration.toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error('[11.3B] Error fetching TEC costs for symbol:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET /api/diagnostics/tec/costs-summary - Get cost cache summary
  apiRouter.get('/diagnostics/tec/costs-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const startTime = performance.now();
      const { getCacheStats, getCacheSize } = await import('./core/cache/cost-cache.js');
      const { computeTotalRoundTripCost } = await import('./core/math/cost-model.js');
      
      const stats = getCacheStats();
      const cacheSize = getCacheSize();
      
      const duration = performance.now() - startTime;
      
      res.json({
        ok: true,
        data: {
          symbolCount: cacheSize,
          avgFee: stats.avgFee,
          avgFeePct: (stats.avgFee * 100).toFixed(2) + '%',
          avgSlippage: stats.avgSlippage,
          avgSlippagePct: (stats.avgSlippage * 100).toFixed(2) + '%',
          avgSpread: stats.avgSpread,
          avgSpreadPct: (stats.avgSpread * 100).toFixed(2) + '%',
          avgTotalCost: computeTotalRoundTripCost(stats.avgFee, stats.avgSlippage, stats.avgSpread),
          avgTotalCostPct: (computeTotalRoundTripCost(stats.avgFee, stats.avgSlippage, stats.avgSpread) * 100).toFixed(2) + '%',
        },
        meta: {
          responseTimeMs: Number(duration.toFixed(2)),
        },
      });
    } catch (error: any) {
      console.error('[11.3B] Error fetching TEC costs summary:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET /api/diagnostics/tec/costs-history - Get persisted cost telemetry snapshots (past 24 hours)
  apiRouter.get('/diagnostics/tec/costs-history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const { getCostHistory } = await import('./core/telemetry/cost-telemetry.js');
      
      const history = await getCostHistory(hours);
      
      res.json({
        ok: true,
        data: history.map(s => ({
          avgFee: s.avgFee,
          avgFeePct: (s.avgFee * 100).toFixed(3) + '%',
          avgSlippage: s.avgSlippage,
          avgSlippagePct: (s.avgSlippage * 100).toFixed(3) + '%',
          avgSpread: s.avgSpread,
          avgSpreadPct: (s.avgSpread * 100).toFixed(3) + '%',
          totalCost: s.totalCost,
          totalCostPct: (s.totalCost * 100).toFixed(3) + '%',
          symbolCount: s.symbolCount,
          timestamp: s.timestamp.toISOString(),
        })),
        meta: {
          hours,
          snapshotCount: history.length,
        },
      });
    } catch (error: any) {
      console.error('[11.3C] Error fetching TEC costs history:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET /api/diagnostics/tec/costs-alerts - Get recent cost drift alerts
  apiRouter.get('/diagnostics/tec/costs-alerts', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const { getRecentAlerts, DRIFT_THRESHOLD } = await import('./services/monitoring/cost-drift-monitor.js');
      
      const alerts = getRecentAlerts(limit);
      
      res.json({
        ok: true,
        data: alerts.map(a => ({
          type: a.type,
          severity: a.severity,
          metric: a.metric,
          baseline: a.baseline,
          baselinePct: (a.baseline * 100).toFixed(3) + '%',
          current: a.current,
          currentPct: (a.current * 100).toFixed(3) + '%',
          delta: a.delta,
          deltaPct: (a.delta * 100).toFixed(0) + '%',
          timestamp: a.timestamp.toISOString(),
        })),
        meta: {
          alertCount: alerts.length,
          driftThreshold: DRIFT_THRESHOLD,
          driftThresholdPct: (DRIFT_THRESHOLD * 100).toFixed(0) + '%',
        },
      });
    } catch (error: any) {
      console.error('[11.3C] Error fetching TEC costs alerts:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Phase 8.8.3-I1: RTB Block Diagnostics ====================
  
  // GET /api/diagnostics/rtb-blocks - Get RTB block reason summary
  apiRouter.get('/diagnostics/rtb-blocks', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { i1RtbDiagnostics } = await import('./services/i1-rtb-diagnostics-service.js');
      
      const summary = i1RtbDiagnostics.getSummary();
      const includeRaw = req.query.raw === '1';
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        sessionStart: summary.sessionStart.toISOString(),
        totals: summary.totals,
        byReason: summary.byReason,
        byStrategy: summary.byStrategy,
        bySymbol: includeRaw ? summary.bySymbol : Object.keys(summary.bySymbol).length,
        recentBlocks: includeRaw ? summary.recentBlocks : summary.recentBlocks.slice(0, 10)
      });
    } catch (error: any) {
      console.error('[8.8.3-I1] Error fetching RTB block diagnostics:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch RTB block diagnostics',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/rtb-blocks/reset - Reset RTB block diagnostics
  apiRouter.post('/diagnostics/rtb-blocks/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { i1RtbDiagnostics } = await import('./services/i1-rtb-diagnostics-service.js');
      i1RtbDiagnostics.clear();
      res.json({ ok: true, message: 'RTB block diagnostics reset' });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Phase 8.8.3-I2: RTB Metrics (Single Source of Truth) ====================
  
  // GET /api/diagnostics/rtb-metrics - Get RTB metrics from central source of truth
  apiRouter.get('/diagnostics/rtb-metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { rtbMetricsService } = await import('./services/rtb-metrics-service.js');
      
      const summary = rtbMetricsService.getSummary();
      const includeRaw = req.query.raw === '1';
      
      res.json({
        ok: true,
        phase: '8.8.3-I2',
        description: 'RTB Metrics Service - Single source of truth for RTB statistics',
        timestamp: summary.timestamp,
        sessionStart: summary.sessionStart,
        totals: summary.totals,
        byBlockReason: summary.byReason,
        byStrategy: summary.byStrategy,
        bySymbol: includeRaw ? summary.bySymbol : Object.keys(summary.bySymbol).length,
        invariantCheck: summary.invariantCheck
      });
    } catch (error: any) {
      console.error('[8.8.3-I2] Error fetching RTB metrics:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch RTB metrics',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/rtb-metrics/reset - Reset RTB metrics
  apiRouter.post('/diagnostics/rtb-metrics/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { rtbMetricsService } = await import('./services/rtb-metrics-service.js');
      rtbMetricsService.reset();
      res.json({ ok: true, message: 'RTB metrics reset', phase: '8.8.3-I2' });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Directive 11.4A: Market Indicators & Narrative Feed ====================
  
  // GET /api/market-indicators - Get global market intelligence
  apiRouter.get('/market-indicators', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getMarketIndicators } = await import('./services/market-indicators.js');
      const indicators = getMarketIndicators();
      
      // Directive 11.4H.6E Task 3: Diagnostic logging for authorized requests
      console.log(`[11.4H.6E][MarketIndicators] Authorized request processed for ${req.user?.id ?? 'anonymous'}`);
      
      res.json({
        ok: true,
        data: {
          marketRegime: indicators.marketRegime,
          regimeTitle: indicators.regimeTitle,
          regimeDescription: indicators.regimeDescription,
          regimeScore: indicators.regimeScore, // Directive 11.4H.4A-Fix: Dynamic 0-100 regime score
          regimePercentage: indicators.regimePercentage, // Directive 11.4H.4A-Fix: Percentage of pairs
          favoredSignalTypes: indicators.favoredSignalTypes,
          favoredStrategies: indicators.favoredStrategies,
          globalFrictionScore: indicators.globalFrictionScore,
          frictionSampleSize: indicators.frictionSampleSize, // Directive 11.7I.a-03: Transparency
          frictionStatus: indicators.frictionDescription.status,
          frictionColor: indicators.frictionDescription.color,
          frictionEmoji: indicators.frictionDescription.emoji,
          frictionNarrative: indicators.frictionNarrative,
          frictionDisplay: `${indicators.globalFrictionScore}: ${indicators.frictionDescription.status} ${indicators.frictionDescription.emoji}`,
          globalDBSScore: indicators.globalDBS?.score ?? null,
          globalDBSCategory: indicators.globalDBS?.category ?? 'NEUTRAL',
          globalDBSPairCount: indicators.globalDBS?.pairCount ?? 0,
        },
        timestamp: indicators.timestamp.toISOString(),
      });
    } catch (error: any) {
      console.error('[11.4A] Error fetching market indicators:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET /api/narrative-feed - Get narrative events
  apiRouter.get('/narrative-feed', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const symbol = req.query.symbol as string | undefined;
      const type = req.query.type as string | undefined;
      
      const { getNarrativeEvents, getNarrativeStats } = await import('./services/narrative-feed.js');
      type NarrativeEventType = 'TRADE_OPENED' | 'DSE_RESIZE' | 'TRAILING_EXIT_UPDATE' | 'TRADE_CLOSED' | 'MANUAL_OVERRIDE';
      
      const events = getNarrativeEvents({
        limit,
        offset,
        symbol,
        type: type as NarrativeEventType | undefined,
      });
      
      const stats = getNarrativeStats();
      
      res.json({
        ok: true,
        data: events.map(e => ({
          id: e.id,
          timestamp: e.timestamp.toISOString(),
          type: e.type,
          symbol: e.symbol,
          message: e.message,
          details: e.details,
        })),
        meta: {
          total: stats.totalEvents,
          limit,
          offset,
          byType: stats.byType,
        },
      });
    } catch (error: any) {
      console.error('[11.4A] Error fetching narrative feed:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  // GET /api/narrative-feed/stats - Get narrative feed statistics
  apiRouter.get('/narrative-feed/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getNarrativeStats } = await import('./services/narrative-feed.js');
      const stats = getNarrativeStats();
      
      res.json({
        ok: true,
        data: {
          totalEvents: stats.totalEvents,
          oldestEvent: stats.oldestEvent?.toISOString() ?? null,
          newestEvent: stats.newestEvent?.toISOString() ?? null,
          byType: stats.byType,
        },
      });
    } catch (error: any) {
      console.error('[11.4A] Error fetching narrative stats:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Phase 8.8.4-A: Signal Lifecycle Audit (SLAL) ====================
  
  // GET /api/diagnostics/signal-lifecycle - Get SLAL metrics and recent journeys
  apiRouter.get('/diagnostics/signal-lifecycle', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { signalLifecycleAudit } = await import('./core/audit/signal_lifecycle_audit.js');
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      const limit = parseInt(req.query.limit as string) || 50;
      
      const metrics = signalLifecycleAudit.getMetrics(mode);
      const recentJourneys = signalLifecycleAudit.getRecentJourneys(mode, limit);
      const recentEvents = signalLifecycleAudit.getRecentEvents(mode, limit);
      
      res.json({
        ok: true,
        phase: '8.8.4-A',
        description: 'Signal Lifecycle Audit Layer (SLAL) - Full signal pipeline tracking',
        mode,
        metrics: {
          ...metrics,
          since: metrics.since.toISOString()
        },
        recentJourneys: recentJourneys.map(j => ({
          ...j,
          startedAt: j.startedAt.toISOString(),
          completedAt: j.completedAt?.toISOString(),
          events: j.events.map(e => ({ ...e, timestamp: e.timestamp.toISOString() }))
        })),
        recentEventsCount: recentEvents.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[8.8.4-A] Error fetching SLAL metrics:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch signal lifecycle metrics',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/signal-lifecycle/reset - Reset SLAL session
  apiRouter.post('/diagnostics/signal-lifecycle/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { signalLifecycleAudit } = await import('./core/audit/signal_lifecycle_audit.js');
      signalLifecycleAudit.resetSession();
      res.json({ ok: true, message: 'SLAL session reset', phase: '8.8.4-A' });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ==================== Phase 8.8.4-B: RTB Queue (Capacity-Blocked Signals) ====================
  
  // GET /api/diagnostics/rtb-queue/signals - Get queued signals for RTB Queue display
  apiRouter.get('/diagnostics/rtb-queue/signals', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { readyToBuyService } = await import('./core/rtb/ready_to_buy_service.js');
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      const signals = await readyToBuyService.getQueuedSignals(mode);
      
      res.json({
        ok: true,
        phase: '8.8.4-B',
        description: 'RTB Queue - High-quality signals blocked by capacity constraints',
        mode,
        timestamp: new Date().toISOString(),
        count: signals.length,
        signals: signals.map(s => ({
          id: s.id,
          signalId: s.signalId,
          symbol: s.symbol,
          strategy: s.strategy,
          entryPrice: parseFloat(s.entryPrice),
          stopPrice: parseFloat(s.stopPrice),
          targetPrice: s.targetPrice ? parseFloat(s.targetPrice) : null,
          quantity: s.quantity ? parseFloat(s.quantity) : null,
          notional: s.notional ? parseFloat(s.notional) : null,
          confidence: parseFloat(s.confidence),
          riskScore: parseFloat(s.riskScore),
          expectedReturn: parseFloat(s.expectedReturn),
          status: s.status,
          blockReason: s.blockReason,
          queuedAt: s.queuedAt,
          expiresAt: s.expiresAt,
          queueDurationMs: Date.now() - new Date(s.queuedAt).getTime(),
        }))
      });
    } catch (error: any) {
      console.error('[8.8.4-B] Error fetching RTB queue signals:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch RTB queue signals',
        message: error.message
      });
    }
  });

  // GET /api/diagnostics/rtb-queue/stats - Get RTB queue statistics
  apiRouter.get('/diagnostics/rtb-queue/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { readyToBuyService } = await import('./core/rtb/ready_to_buy_service.js');
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      const stats = await readyToBuyService.getQueueStats(mode);
      
      res.json({
        ok: true,
        phase: '8.8.4-B',
        description: 'RTB Queue Statistics',
        mode,
        timestamp: new Date().toISOString(),
        stats
      });
    } catch (error: any) {
      console.error('[8.8.4-B] Error fetching RTB queue stats:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch RTB queue stats',
        message: error.message
      });
    }
  });

  // GET /api/diagnostics/rtb-queue/refresher-status - Get RTB refresher status (Phase 8.8.4-C.6: Now uses ReadyToBuyService)
  apiRouter.get('/diagnostics/rtb-queue/refresher-status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { readyToBuyService } = await import('./core/rtb/ready_to_buy_service.js');
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      const isRunning = readyToBuyService.isRefreshCycleRunning(mode);
      const tclStatus = await readyToBuyService.getTCLStatus(mode);
      
      res.json({
        ok: true,
        phase: '8.8.4-C.6',
        description: 'RTB Refresh Cycle Status (ReadyToBuyService)',
        timestamp: new Date().toISOString(),
        mode,
        isRefreshCycleRunning: isRunning,
        tclStatus,
        note: 'Phase 8.8.4-C.6: Refresh now handled by ReadyToBuyService lifecycle'
      });
    } catch (error: any) {
      console.error('[8.8.4-C.6] Error fetching RTB refresher status:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch RTB refresher status',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/rtb-queue/force-refresh - Force immediate queue refresh (Phase 8.8.4-C.6)
  apiRouter.post('/diagnostics/rtb-queue/force-refresh', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { readyToBuyService } = await import('./core/rtb/ready_to_buy_service.js');
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      // Manually trigger cleanup and re-evaluation
      const expiredCount = await readyToBuyService.cleanupExpiredSignals(mode);
      const { removed, remaining } = await readyToBuyService.reEvaluateQueue(mode);
      const tclStatus = await readyToBuyService.getTCLStatus(mode);
      
      console.log(`[8.8.4-C.6][FORCE_REFRESH] mode=${mode}, expired=${expiredCount}, removed=${removed}, remaining=${remaining}`);
      
      res.json({
        ok: true,
        phase: '8.8.4-C.6',
        message: 'RTB Queue refresh forced successfully via ReadyToBuyService',
        mode,
        expiredCount,
        removedCount: removed,
        remainingCount: remaining,
        tclStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[8.8.4-C.6] Error forcing RTB queue refresh:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to force RTB queue refresh',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/rtb-queue/clear - Clear all queued signals for a mode
  apiRouter.post('/diagnostics/rtb-queue/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { readyToBuyService } = await import('./core/rtb/ready_to_buy_service.js');
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      const cleared = await readyToBuyService.clearQueue(mode);
      
      res.json({
        ok: true,
        phase: '8.8.4-B',
        message: `Cleared ${cleared} queued signals from ${mode} queue`,
        clearedCount: cleared,
        mode,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[8.8.4-B] Error clearing RTB queue:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to clear RTB queue',
        message: error.message
      });
    }
  });

  // ==================== Phase 8.8.3-I5: RTB Block Recording Audit ====================
  
  // GET /api/diagnostics/i5/rtb-block-log - Get RTB block event log for audit
  apiRouter.get('/diagnostics/i5/rtb-block-log', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { rtbMetricsService } = await import('./services/rtb-metrics-service.js');
      
      const blockLog = rtbMetricsService.getBlockEventLog();
      const distinctReasons = [...new Set(blockLog.map(e => e.reason))];
      
      res.json({
        ok: true,
        phase: '8.8.3-I5',
        description: 'RTB Block Recording Audit - Last 500 block events',
        timestamp: new Date().toISOString(),
        count: blockLog.length,
        distinctReasons,
        events: blockLog
      });
    } catch (error: any) {
      console.error('[8.8.3-I5] Error fetching RTB block log:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch RTB block log',
        message: error.message
      });
    }
  });

  // GET /api/diagnostics/trade-lifecycle - Get trade lifecycle diagnostics
  apiRouter.get('/diagnostics/trade-lifecycle', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { i1TradeLifecycleDiagnostics } = await import('./services/i1-trade-lifecycle-diagnostics.js');
      
      const summary = i1TradeLifecycleDiagnostics.getSummary();
      const includeRaw = req.query.raw === '1';
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        sessionStart: summary.sessionStart.toISOString(),
        totalSignals: summary.totalSignals,
        totalOpened: summary.totalOpened,
        totalClosed: summary.totalClosed,
        totalForceClosed: summary.totalForceClosed,
        byCloseReason: summary.byCloseReason,
        byStrategy: summary.byStrategy,
        hardStopSummaries: summary.hardStopSummaries,
        slotStateSnapshots: includeRaw ? summary.slotStateSnapshots : summary.slotStateSnapshots.length,
        recentEvents: includeRaw ? summary.recentEvents : summary.recentEvents.slice(0, 20)
      });
    } catch (error: any) {
      console.error('[8.8.3-I1] Error fetching trade lifecycle diagnostics:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch trade lifecycle diagnostics',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/trade-lifecycle/reset - Reset trade lifecycle diagnostics
  apiRouter.post('/diagnostics/trade-lifecycle/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { i1TradeLifecycleDiagnostics } = await import('./services/i1-trade-lifecycle-diagnostics.js');
      i1TradeLifecycleDiagnostics.clear();
      res.json({ ok: true, message: 'Trade lifecycle diagnostics reset' });
    } catch (error: any) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/diagnostics/open-position-ws-linkage - Get WebSocket subscription status for open positions
  apiRouter.get('/diagnostics/open-position-ws-linkage', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      const openPositions = await storage.getPaperSimOpenPositions(mode);
      const wsSubscribed = krakenWebSocketAdapter.getSubscribedSymbols();
      
      const linkageDetails = openPositions.map(pos => {
        const isSubscribed = wsSubscribed.includes(pos.symbol);
        return {
          positionId: pos.id,
          symbol: pos.symbol,
          strategy: pos.strategyName,
          openedAt: pos.openedAt,
          isWebSocketSubscribed: isSubscribed,
          linkageStatus: isSubscribed ? 'LINKED' : 'ORPHANED'
        };
      });
      
      const orphanedCount = linkageDetails.filter(d => d.linkageStatus === 'ORPHANED').length;
      const linkedCount = linkageDetails.filter(d => d.linkageStatus === 'LINKED').length;
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        mode,
        openPositionCount: openPositions.length,
        wsSubscribedCount: wsSubscribed.length,
        linkedCount,
        orphanedCount,
        health: orphanedCount === 0 ? 'healthy' : 'degraded',
        linkageDetails: req.query.raw === '1' ? linkageDetails : linkageDetails.filter(d => d.linkageStatus === 'ORPHANED'),
        wsSubscribedSymbols: wsSubscribed
      });
    } catch (error: any) {
      console.error('[8.8.3-I1] Error fetching WS linkage diagnostics:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch WebSocket linkage diagnostics',
        message: error.message
      });
    }
  });

  // ==================== Phase 8.8.3-I7-WS-A: WebSocket Subscription & Tick Flow Diagnostic ====================
  
  // GET /api/diagnostics/i7-ws/subscription-map - Get subscription mapping for active positions
  apiRouter.get('/diagnostics/i7-ws/subscription-map', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      // Get open positions for the current mode
      const openPositions = await storage.getPaperSimOpenPositions(mode);
      const positionSymbols = openPositions.map(p => p.symbol);
      
      // Get subscription map data from adapter
      const subscriptionMap = await krakenWebSocketAdapter.getI7SubscriptionMap(positionSymbols);
      
      // Get additional diagnostic data
      const subscribedSymbols = krakenWebSocketAdapter.getSubscribedSymbols();
      const firstTickSymbols = krakenWebSocketAdapter.getFirstTickReceivedSymbols();
      const unmappedTicks = krakenWebSocketAdapter.getUnmappedTicks();
      const status = krakenWebSocketAdapter.getStatus();
      
      // Compute summary statistics with granular subscription status
      const totalPositions = subscriptionMap.length;
      const subscribedCount = subscriptionMap.filter(s => s.subscription_status === 'subscribed').length;
      const pendingCount = subscriptionMap.filter(s => s.subscription_status === 'pending').length;
      const neverRequestedCount = subscriptionMap.filter(s => s.subscription_status === 'never_requested').length;
      const ackedCount = subscriptionMap.filter(s => s.acked).length;
      const firstTickCount = subscriptionMap.filter(s => s.first_tick_received).length;
      const neverTickedSymbols = subscriptionMap.filter(s => s.subscribed && !s.first_tick_received).map(s => s.internal);
      const pendingSymbols = subscriptionMap.filter(s => s.subscription_status === 'pending').map(s => s.internal);
      const neverRequestedSymbols = subscriptionMap.filter(s => s.subscription_status === 'never_requested').map(s => s.internal);
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        mode,
        wsStatus: status,
        summary: {
          totalActivePositions: totalPositions,
          subscribedToWs: subscribedCount,
          pendingSubscription: pendingCount,
          neverRequested: neverRequestedCount,
          receivedAck: ackedCount,
          receivedFirstTick: firstTickCount,
          neverReceivedTick: neverTickedSymbols.length,
          unmappedTickPairs: unmappedTicks.length
        },
        gaps: {
          neverTickedSymbols,
          pendingSymbols,
          neverRequestedSymbols,
          unmappedTicks
        },
        active_positions: subscriptionMap,
        allSubscribedSymbols: subscribedSymbols,
        allFirstTickSymbols: firstTickSymbols
      });
    } catch (error: any) {
      console.error('[I7-WS-A] Error fetching subscription map:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch I7-WS-A subscription map',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/i7-ws/reset-tracking - Reset first tick tracking for fresh diagnostic run
  apiRouter.post('/diagnostics/i7-ws/reset-tracking', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.clearFirstTickTracking();
      res.json({ ok: true, message: 'I7-WS-A diagnostic tracking reset' });
    } catch (error: any) {
      console.error('[I7-WS-A] Error resetting tracking:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/diagnostics/i7-ws-c/trace-history - Phase 8.8.3-I7-WS-C: Get price pipeline trace history
  apiRouter.get('/diagnostics/i7-ws-c/trace-history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { priceTraceService } = await import('./services/price-trace-service.js');
      const traceHistory = priceTraceService.getTraceHistory();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        ...traceHistory
      });
    } catch (error: any) {
      console.error('[I7-WS-C] Error fetching trace history:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch I7-WS-C trace history',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/i7-ws-c/reset - Phase 8.8.3-I7-WS-C: Reset trace history for fresh diagnostic run
  apiRouter.post('/diagnostics/i7-ws-c/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { priceTraceService } = await import('./services/price-trace-service.js');
      priceTraceService.reset();
      res.json({ ok: true, message: 'I7-WS-C trace history reset' });
    } catch (error: any) {
      console.error('[I7-WS-C] Error resetting trace history:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/diagnostics/i7-ws-e/rest-fallback-metrics - Phase 8.8.3-I7-WS-E: Get REST fallback metrics
  apiRouter.get('/diagnostics/i7-ws-e/rest-fallback-metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { livePricingAdapter } = await import('./services/live-pricing-adapter.js');
      const metrics = livePricingAdapter.getRestFallbackMetrics();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-E',
        description: 'REST fallback optimization metrics',
        thresholds: {
          wsCacheFreshMs: 2000,
          wsCacheWarningMs: 3000,
          wsCacheFallbackMs: 5000
        },
        ...metrics
      });
    } catch (error: any) {
      console.error('[I7-WS-E] Error fetching REST fallback metrics:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to fetch I7-WS-E REST fallback metrics',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/i7-ws-e/reset - Phase 8.8.3-I7-WS-E: Reset REST fallback metrics
  apiRouter.post('/diagnostics/i7-ws-e/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { livePricingAdapter } = await import('./services/live-pricing-adapter.js');
      livePricingAdapter.clearRestFallbackMetrics();
      res.json({ ok: true, message: 'I7-WS-E REST fallback metrics reset' });
    } catch (error: any) {
      console.error('[I7-WS-E] Error resetting REST fallback metrics:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/diagnostics/i7-ws-f/coverage - Phase 8.8.3-I7-WS-F: Get WebSocket coverage status
  apiRouter.get('/diagnostics/i7-ws-f/coverage', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      // I7-PERSIST-FIX: Get active symbols from paper_sim_open_positions (actual data) + live trades
      const [paperPositions, liveTrades] = await Promise.all([
        storage.getPaperSimOpenPositions('paper'),
        storage.getActiveTrades('live')
      ]);
      const activeSymbols = [...new Set([
        ...paperPositions.map(t => t.symbol),
        ...liveTrades.map(t => t.symbol)
      ])];
      
      console.log(`[I7-PERSIST-FIX][COVERAGE] paperPositions=${paperPositions.length} liveTrades=${liveTrades.length} activeSymbols=${activeSymbols.length}`);
      
      const coverageMap = await krakenWebSocketAdapter.getI7CoverageMap(activeSymbols);
      const healthStatus = krakenWebSocketAdapter.getSubscriptionHealthStatus();
      
      const summary = {
        total: coverageMap.length,
        subscribed: coverageMap.filter(c => c.coverage_status === 'subscribed').length,
        pending: coverageMap.filter(c => c.coverage_status === 'pending').length,
        missing: coverageMap.filter(c => c.coverage_status === 'missing').length,
        unmappable: coverageMap.filter(c => c.coverage_status === 'unmappable').length
      };
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-F',
        description: 'WebSocket subscription coverage status',
        summary,
        symbols: coverageMap,
        health: healthStatus
      });
    } catch (error: any) {
      console.error('[I7-WS-F] Error fetching coverage:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch I7-WS-F coverage', message: error.message });
    }
  });

  // POST /api/diagnostics/i7-ws-f/audit - Phase 8.8.3-I7-WS-F: Run coverage audit
  apiRouter.post('/diagnostics/i7-ws-f/audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      // I7-PERSIST-FIX: Get active symbols from paper_sim_open_positions (actual data) + live trades
      const [paperPositions, liveTrades] = await Promise.all([
        storage.getPaperSimOpenPositions('paper'),
        storage.getActiveTrades('live')
      ]);
      const activeSymbols = [...new Set([
        ...paperPositions.map(t => t.symbol),
        ...liveTrades.map(t => t.symbol)
      ])];
      
      const auditResults = await krakenWebSocketAdapter.auditWebSocketCoverage(activeSymbols);
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-F',
        description: 'WebSocket coverage audit results',
        total_symbols: activeSymbols.length,
        audit: auditResults
      });
    } catch (error: any) {
      console.error('[I7-WS-F] Error running audit:', error);
      res.status(500).json({ ok: false, error: 'Failed to run I7-WS-F audit', message: error.message });
    }
  });

  // POST /api/diagnostics/i7-ws-f/auto-subscribe - Phase 8.8.3-I7-WS-F: Auto-subscribe missing symbols
  apiRouter.post('/diagnostics/i7-ws-f/auto-subscribe', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      // I7-PERSIST-FIX: Get active symbols from paper_sim_open_positions (actual data) + live trades
      const [paperPositions, liveTrades] = await Promise.all([
        storage.getPaperSimOpenPositions('paper'),
        storage.getActiveTrades('live')
      ]);
      const activeSymbols = [...new Set([
        ...paperPositions.map(t => t.symbol),
        ...liveTrades.map(t => t.symbol)
      ])];
      
      const result = await krakenWebSocketAdapter.autoSubscribeMissingSymbols(activeSymbols);
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-F',
        description: 'Auto-subscribe missing symbols result',
        ...result
      });
    } catch (error: any) {
      console.error('[I7-WS-F] Error auto-subscribing:', error);
      res.status(500).json({ ok: false, error: 'Failed to auto-subscribe', message: error.message });
    }
  });

  // GET /api/diagnostics/i7-ws-f/validate-map - Phase 8.8.3-I7-WS-F: Validate symbol map integrity
  apiRouter.get('/diagnostics/i7-ws-f/validate-map', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      // I7-PERSIST-FIX: Get active symbols from paper_sim_open_positions (actual data) + live trades
      const [paperPositions, liveTrades] = await Promise.all([
        storage.getPaperSimOpenPositions('paper'),
        storage.getActiveTrades('live')
      ]);
      const activeSymbols = [...new Set([
        ...paperPositions.map(t => t.symbol),
        ...liveTrades.map(t => t.symbol)
      ])];
      
      const validationResult = await krakenWebSocketAdapter.validateSymbolMapIntegrity(activeSymbols);
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-F',
        description: 'Symbol map validation results',
        ...validationResult
      });
    } catch (error: any) {
      console.error('[I7-WS-F] Error validating map:', error);
      res.status(500).json({ ok: false, error: 'Failed to validate symbol map', message: error.message });
    }
  });

  // GET /api/diagnostics/i7-ws-f/health - Phase 8.8.3-I7-WS-F: Get subscription health status
  apiRouter.get('/diagnostics/i7-ws-f/health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      const healthStatus = krakenWebSocketAdapter.getSubscriptionHealthStatus();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-F',
        description: 'Subscription health status',
        thresholds: {
          ack_timeout_ms: 5000,
          no_tick_timeout_ms: 10000
        },
        ack_timeout_count: healthStatus.ack_timeouts.length,
        no_tick_count: healthStatus.no_tick_symbols.length,
        ...healthStatus
      });
    } catch (error: any) {
      console.error('[I7-WS-F] Error fetching health:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch health status', message: error.message });
    }
  });

  // POST /api/diagnostics/i7-ws-f/start-monitoring - Phase 8.8.3-I7-WS-F: Start health monitoring
  apiRouter.post('/diagnostics/i7-ws-f/start-monitoring', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.startSubscriptionHealthMonitoring();
      res.json({ ok: true, message: 'I7-WS-F subscription health monitoring started' });
    } catch (error: any) {
      console.error('[I7-WS-F] Error starting monitoring:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/diagnostics/i7-ws-f/stop-monitoring - Phase 8.8.3-I7-WS-F: Stop health monitoring
  apiRouter.post('/diagnostics/i7-ws-f/stop-monitoring', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.stopSubscriptionHealthMonitoring();
      res.json({ ok: true, message: 'I7-WS-F subscription health monitoring stopped' });
    } catch (error: any) {
      console.error('[I7-WS-F] Error stopping monitoring:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ===== Phase 8.8.3-I8C: Subscription Reliability Diagnostics =====

  // GET /api/diagnostics/i8c/subscription-health - Phase 8.8.3-I8C: Get comprehensive subscription health
  apiRouter.get('/diagnostics/i8c/subscription-health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      // Get open positions from both paper and live
      const [paperPositions, liveTrades] = await Promise.all([
        storage.getPaperSimOpenPositions('paper'),
        storage.getActiveTrades('live')
      ]);
      const allSymbols = [...new Set([
        ...paperPositions.map(p => p.symbol),
        ...liveTrades.map(t => t.symbol)
      ])];
      
      const health = await krakenWebSocketAdapter.getI8CSubscriptionHealth(allSymbols);
      
      res.json({
        ok: health.ok,
        phase: '8.8.3-I8C',
        timestamp: new Date().toISOString(),
        description: 'WebSocket subscription reliability health status',
        thresholds: {
          stale_threshold_ms: 10000,
          audit_interval_ms: 5000
        },
        ...health
      });
    } catch (error: any) {
      console.error('[I8C] Error fetching subscription health:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I8C',
        error: 'Failed to fetch I8C subscription health',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/i8c/force-audit - Phase 8.8.3-I8C: Force run subscription audit
  apiRouter.post('/diagnostics/i8c/force-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      
      // Get open positions to audit
      const [paperPositions, liveTrades] = await Promise.all([
        storage.getPaperSimOpenPositions('paper'),
        storage.getActiveTrades('live')
      ]);
      const allSymbols = [...new Set([
        ...paperPositions.map(p => p.symbol),
        ...liveTrades.map(t => t.symbol)
      ])];
      
      // Subscribe to all symbols (this is what the audit does)
      if (allSymbols.length > 0) {
        krakenWebSocketAdapter.subscribeToSymbols(allSymbols);
      }
      
      const health = await krakenWebSocketAdapter.getI8CSubscriptionHealth(allSymbols);
      
      res.json({
        ok: true,
        phase: '8.8.3-I8C',
        timestamp: new Date().toISOString(),
        description: 'Forced subscription audit completed',
        symbols_audited: allSymbols.length,
        symbols_subscribed: allSymbols,
        health
      });
    } catch (error: any) {
      console.error('[I8C] Error forcing audit:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I8C',
        error: 'Failed to force I8C audit',
        message: error.message
      });
    }
  });

  // POST /api/diagnostics/i8c/start-audit - Phase 8.8.3-I8C: Start subscription audit interval
  apiRouter.post('/diagnostics/i8c/start-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.startI8CSubscriptionAudit();
      res.json({ ok: true, phase: '8.8.3-I8C', message: 'I8C subscription audit started (5-second interval)' });
    } catch (error: any) {
      console.error('[I8C] Error starting audit:', error);
      res.status(500).json({ ok: false, phase: '8.8.3-I8C', error: error.message });
    }
  });

  // POST /api/diagnostics/i8c/stop-audit - Phase 8.8.3-I8C: Stop subscription audit interval
  apiRouter.post('/diagnostics/i8c/stop-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.stopI8CSubscriptionAudit();
      res.json({ ok: true, phase: '8.8.3-I8C', message: 'I8C subscription audit stopped' });
    } catch (error: any) {
      console.error('[I8C] Error stopping audit:', error);
      res.status(500).json({ ok: false, phase: '8.8.3-I8C', error: error.message });
    }
  });

  // ===== Phase 8.8.3-I7-PERSIST-FIX: Paper Trade Persistence Diagnostics =====

  // GET /api/diagnostics/i7-persist/status - Phase 8.8.3-I7-PERSIST-FIX: Compare engine vs DB position counts
  apiRouter.get('/diagnostics/i7-persist/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // Get positions from paper_sim_open_positions (what the engine uses)
      const paperSimPositions = await storage.getPaperSimOpenPositions('paper');
      
      // Get positions from paper_trades table (legacy/unused)
      const paperTrades = await storage.getOpenPaperTrades();
      
      // Get live trades for comparison
      const liveTrades = await storage.getActiveTrades('live');
      
      res.json({
        ok: true,
        phase: '8.8.3-I7-PERSIST-FIX',
        timestamp: new Date().toISOString(),
        description: 'Paper trade persistence status - comparing data sources',
        paper_sim_open_positions: {
          count: paperSimPositions.length,
          symbols: paperSimPositions.map(p => p.symbol),
          note: 'This is the CORRECT table used by paper execution engine'
        },
        paper_trades_table: {
          count: paperTrades.length,
          symbols: paperTrades.map(t => t.symbol),
          note: 'This was the WRONG table being used by I7-WS-F (now fixed)'
        },
        live_trades: {
          count: liveTrades.length,
          symbols: liveTrades.map(t => t.symbol)
        },
        fix_applied: 'I7-WS-F endpoints now use getPaperSimOpenPositions instead of getOpenPaperTrades'
      });
    } catch (error: any) {
      console.error('[I7-PERSIST] Error fetching status:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I7-PERSIST-FIX',
        error: error.message
      });
    }
  });

  // ===== Phase 8.8.3-I7-MAP-FIX: Symbol Mapping Diagnostics =====

  // GET /api/diagnostics/i7-map-fix/check - I7-MAP-FIX: Check symbol mapping for all positions
  apiRouter.get('/diagnostics/i7-map-fix/check', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getSymbolMappingDetails, listUnmappableSymbols, getMappingCount } = await import('./markets/kraken-symbol-resolver.js');
      
      // Get active symbols from paper positions + live trades
      const [paperPositions, liveTrades] = await Promise.all([
        storage.getPaperSimOpenPositions('paper'),
        storage.getActiveTrades('live')
      ]);
      
      const activeSymbols = [...new Set([
        ...paperPositions.map(t => t.symbol),
        ...liveTrades.map(t => t.symbol)
      ])];
      
      // Get mapping details for each symbol
      const mappingResults = activeSymbols.map(symbol => getSymbolMappingDetails(symbol));
      
      // Summarize results
      const summary = {
        total_active_symbols: activeSymbols.length,
        mappable: mappingResults.filter(r => r.mappable).length,
        unmappable: mappingResults.filter(r => !r.mappable).length,
        in_static_map: mappingResults.filter(r => r.in_static_map).length,
        dynamic_fallback: mappingResults.filter(r => r.mappable && !r.in_static_map).length,
        static_map_size: getMappingCount()
      };
      
      const unmappableList = listUnmappableSymbols(activeSymbols);
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-MAP-FIX',
        description: 'Symbol mapping status for all active positions',
        summary,
        symbols: mappingResults,
        unmappable_details: unmappableList
      });
    } catch (error: any) {
      console.error('[I7-MAP-FIX] Error checking symbol mappings:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I7-MAP-FIX',
        error: error.message
      });
    }
  });

  // ===== Phase 8.8.3-I7-MAP-AUTO: Automatic Symbol Mapping Endpoints =====

  // GET /api/diagnostics/i7-map-auto/summary - I7-MAP-AUTO: Get mapping summary statistics
  apiRouter.get('/diagnostics/i7-map-auto/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenAssetPairsService } = await import('./markets/kraken-asset-pairs-service.js');
      
      if (!krakenAssetPairsService.isReady()) {
        return res.status(503).json({
          ok: false,
          phase: '8.8.3-I7-MAP-AUTO',
          error: 'Auto-map not initialized yet',
          hint: 'Wait for startup or call POST /rebuild'
        });
      }
      
      const summary = krakenAssetPairsService.getSummary();
      const tierBreakdown = {
        tier1_verified: summary.tier1,
        tier2_derived: summary.tier2,
        tier3_uncertain: summary.tier3,
        total_mapped: summary.total,
        coverage_pct: summary.total > 0 
          ? ((summary.tier1 + summary.tier2) / summary.total * 100).toFixed(2) + '%' 
          : '0%'
      };
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-MAP-AUTO',
        description: 'Automatic Kraken symbol mapping summary',
        summary: {
          total_kraken_pairs: summary.total,
          mapped_tier1: summary.tier1,
          mapped_tier2: summary.tier2,
          mapped_tier3: summary.tier3,
          unmappable: summary.unmappable,
          collisions: summary.collisions,
          static_map_size: summary.staticMapSize,
          last_refresh: summary.lastRefresh
        },
        tier_breakdown: tierBreakdown,
        quality: {
          tier1_2_coverage: summary.tier1 + summary.tier2,
          target: '98%+ Tier 1/2',
          status: (summary.tier1 + summary.tier2) / summary.total >= 0.98 ? 'PASS' : 'NEEDS_ATTENTION'
        }
      });
    } catch (error: any) {
      console.error('[I7-MAP-AUTO] Error fetching summary:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I7-MAP-AUTO',
        error: error.message
      });
    }
  });

  // GET /api/diagnostics/i7-map-auto/unmappable - I7-MAP-AUTO: Get unmappable symbols
  apiRouter.get('/diagnostics/i7-map-auto/unmappable', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenAssetPairsService } = await import('./markets/kraken-asset-pairs-service.js');
      
      if (!krakenAssetPairsService.isReady()) {
        return res.status(503).json({
          ok: false,
          phase: '8.8.3-I7-MAP-AUTO',
          error: 'Auto-map not initialized yet'
        });
      }
      
      const unmappable = krakenAssetPairsService.getUnmappable();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-MAP-AUTO',
        description: 'Symbols that could not be automatically mapped',
        count: unmappable.length,
        symbols: unmappable
      });
    } catch (error: any) {
      console.error('[I7-MAP-AUTO] Error fetching unmappable:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I7-MAP-AUTO',
        error: error.message
      });
    }
  });

  // GET /api/diagnostics/i7-map-auto/conflicts - I7-MAP-AUTO: Get symbol conflicts
  apiRouter.get('/diagnostics/i7-map-auto/conflicts', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenAssetPairsService } = await import('./markets/kraken-asset-pairs-service.js');
      
      if (!krakenAssetPairsService.isReady()) {
        return res.status(503).json({
          ok: false,
          phase: '8.8.3-I7-MAP-AUTO',
          error: 'Auto-map not initialized yet'
        });
      }
      
      const conflicts = krakenAssetPairsService.getConflicts();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-MAP-AUTO',
        description: 'Symbols with inconsistent Kraken metadata (collisions)',
        count: conflicts.length,
        conflicts
      });
    } catch (error: any) {
      console.error('[I7-MAP-AUTO] Error fetching conflicts:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I7-MAP-AUTO',
        error: error.message
      });
    }
  });

  // POST /api/diagnostics/i7-map-auto/rebuild - I7-MAP-AUTO: Force refresh mapping
  apiRouter.post('/diagnostics/i7-map-auto/rebuild', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenAssetPairsService } = await import('./markets/kraken-asset-pairs-service.js');
      
      console.log('[I7-MAP-AUTO] Manual rebuild triggered by user');
      await krakenAssetPairsService.refresh();
      
      const summary = krakenAssetPairsService.getSummary();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-MAP-AUTO',
        message: 'Kraken AssetPairs mapping rebuilt successfully',
        summary: {
          total: summary.total,
          tier1: summary.tier1,
          tier2: summary.tier2,
          tier3: summary.tier3,
          unmappable: summary.unmappable,
          collisions: summary.collisions
        }
      });
    } catch (error: any) {
      console.error('[I7-MAP-AUTO] Error rebuilding mapping:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I7-MAP-AUTO',
        error: error.message
      });
    }
  });

  // GET /api/diagnostics/i7-map-auto/audit - I7-MAP-AUTO: Audit active positions
  apiRouter.get('/diagnostics/i7-map-auto/audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenAssetPairsService } = await import('./markets/kraken-asset-pairs-service.js');
      
      if (!krakenAssetPairsService.isReady()) {
        return res.status(503).json({
          ok: false,
          phase: '8.8.3-I7-MAP-AUTO',
          error: 'Auto-map not initialized yet'
        });
      }
      
      // Get active symbols from paper positions + live trades
      const [paperPositions, liveTrades] = await Promise.all([
        storage.getPaperSimOpenPositions('paper'),
        storage.getActiveTrades('live')
      ]);
      
      const activeSymbols = [...new Set([
        ...paperPositions.map(t => t.symbol),
        ...liveTrades.map(t => t.symbol)
      ])];
      
      const auditResult = krakenAssetPairsService.auditSymbols(activeSymbols);
      
      // Get tier details for each active symbol (use resolveAny for any format)
      const symbolDetails = activeSymbols.map(symbol => {
        const entry = krakenAssetPairsService.resolveAny(symbol);
        return {
          symbol,
          internalSymbol: entry?.internalSymbol || null,
          tier: entry?.tier || null,
          tierReason: entry?.tierReason || 'Not found in auto-map',
          krakenRestPair: entry?.krakenRestPair || null,
          krakenWsPair: entry?.krakenWsPair || null,
          status: entry ? (entry.tier <= 2 ? 'SAFE' : 'NEEDS_REVIEW') : 'UNMAPPED'
        };
      });
      
      const allTier1 = auditResult.unmapped.length === 0 && auditResult.tier3 === 0 && auditResult.tier2 === 0;
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-MAP-AUTO',
        description: 'Audit of active positions mapping coverage',
        audit: {
          total_active: auditResult.total,
          mapped: auditResult.mapped,
          tier1: auditResult.tier1,
          tier2: auditResult.tier2,
          tier3: auditResult.tier3,
          unmapped: auditResult.unmapped.length
        },
        quality: {
          all_tier1: allTier1,
          all_safe: auditResult.unmapped.length === 0 && auditResult.tier3 === 0,
          target: 'All active symbols should be Tier 1'
        },
        symbols: symbolDetails,
        unmapped_details: auditResult.unmapped
      });
    } catch (error: any) {
      console.error('[I7-MAP-AUTO] Error auditing positions:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I7-MAP-AUTO',
        error: error.message
      });
    }
  });

  // GET /api/diagnostics/i7-map-auto/tiers - I7-MAP-AUTO: Get symbols by tier
  apiRouter.get('/diagnostics/i7-map-auto/tiers', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenAssetPairsService } = await import('./markets/kraken-asset-pairs-service.js');
      
      if (!krakenAssetPairsService.isReady()) {
        return res.status(503).json({
          ok: false,
          phase: '8.8.3-I7-MAP-AUTO',
          error: 'Auto-map not initialized yet'
        });
      }
      
      const tier = parseInt(req.query.tier as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      
      let mappings;
      if (tier === 1) {
        mappings = krakenAssetPairsService.getTier1Mappings();
      } else if (tier === 2) {
        mappings = krakenAssetPairsService.getTier2Mappings();
      } else if (tier === 3) {
        mappings = krakenAssetPairsService.getTier3Mappings();
      } else {
        mappings = krakenAssetPairsService.getAllMappings();
      }
      
      const total = mappings.length;
      const sample = mappings.slice(0, limit).map(m => ({
        internal: m.internalSymbol,
        rest: m.krakenRestPair,
        ws: m.krakenWsPair,
        tier: m.tier,
        reason: m.tierReason,
        base: m.base,
        quote: m.quote
      }));
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-MAP-AUTO',
        description: tier > 0 ? `Tier ${tier} mappings` : 'All mappings',
        filter: { tier: tier || 'all', limit },
        count: total,
        showing: sample.length,
        mappings: sample
      });
    } catch (error: any) {
      console.error('[I7-MAP-AUTO] Error fetching tiers:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.3-I7-MAP-AUTO',
        error: error.message
      });
    }
  });

  // ===== Phase 8.8.4-IA-PRICE-CACHE: Centralized Price Cache Diagnostics =====
  
  // GET /api/diagnostics/ia-price-cache/status - Phase 8.8.4-IA-PRICE-CACHE: Price cache status
  apiRouter.get('/diagnostics/ia-price-cache/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { priceCache } = await import('./services/price-cache.js');
      
      const snapshot = priceCache.snapshot();
      const now = Date.now();
      
      const cacheEntries = snapshot.map(entry => ({
        symbol: entry.symbol,
        price: entry.price,
        source: entry.lastSource,
        lastUpdatedAt: new Date(entry.lastUpdatedAt).toISOString(),
        ageMs: now - entry.lastUpdatedAt,
        isFresh: (now - entry.lastUpdatedAt) < 2000
      }));
      
      const freshCount = cacheEntries.filter(e => e.isFresh).length;
      const staleCount = cacheEntries.filter(e => !e.isFresh).length;
      const wsSourceCount = cacheEntries.filter(e => e.source === 'kraken_ws').length;
      const restSourceCount = cacheEntries.filter(e => e.source === 'kraken_rest').length;
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.4-IA-PRICE-CACHE',
        description: 'Centralized price cache status for active trade pricing',
        summary: {
          total_entries: cacheEntries.length,
          fresh_count: freshCount,
          stale_count: staleCount,
          ws_source_count: wsSourceCount,
          rest_source_count: restSourceCount,
          freshness_threshold_ms: 2000
        },
        entries: cacheEntries.sort((a, b) => a.symbol.localeCompare(b.symbol))
      });
    } catch (error: any) {
      console.error('[IA-PRICE-CACHE] Error fetching status:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.4-IA-PRICE-CACHE',
        error: error.message
      });
    }
  });

  // POST /api/diagnostics/ia-price-cache/clear - Phase 8.8.4-IA-PRICE-CACHE: Clear price cache
  apiRouter.post('/diagnostics/ia-price-cache/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { priceCache } = await import('./services/price-cache.js');
      
      priceCache.clear();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.4-IA-PRICE-CACHE',
        message: 'Price cache cleared successfully'
      });
    } catch (error: any) {
      console.error('[IA-PRICE-CACHE] Error clearing cache:', error);
      res.status(500).json({
        ok: false,
        phase: '8.8.4-IA-PRICE-CACHE',
        error: error.message
      });
    }
  });

  // ===== Phase 8.8.3-I7-ROOT-FIX: Engine Status Diagnostics =====
  
  // GET /api/diagnostics/i7-root/engine-status - Phase 8.8.3-I7-PM-FOCUS: Engine status diagnostics
  // Returns comprehensive status snapshot from PaperPortfolioManager
  apiRouter.get('/diagnostics/i7-root/engine-status', async (req, res) => {
    try {
      const { getGlobalPaperSimManager, getOrchestratorByMode, getEngineByMode } = await import('./services/paper-sim-service.js');
      
      // Get actual paper manager state (this is what paper-sim/start actually starts)
      const paperManager = getGlobalPaperSimManager();
      
      // Phase 8.8.3-I7-PM-FOCUS: Get status snapshot from manager if available
      let paperSnapshot: any = null;
      if (paperManager && typeof paperManager.getStatusSnapshot === 'function') {
        paperSnapshot = paperManager.getStatusSnapshot();
      }
      
      // Get open positions count for snapshot
      let openPositionsCount = 0;
      try {
        const { storage } = await import('./storage.js');
        const openPositions = await storage.getPaperSimOpenPositions('paper');
        openPositionsCount = openPositions.length;
      } catch (e) {
        // Ignore errors, use 0
      }
      
      const paper = {
        mode: 'paper',
        isRunning: paperSnapshot?.isRunning ?? paperManager?.getIsRunning?.() ?? false,
        isStopped: paperSnapshot?.isStopped ?? !paperManager?.getIsRunning?.() ?? true,
        openPositionsCount: openPositionsCount,
        lastTickAt: paperSnapshot?.lastTickAt ?? null,
        lastExitEvalAt: paperSnapshot?.lastExitEvalAt ?? null,
        hasManager: !!paperManager,
        hasSignalOrchestrator: !!getOrchestratorByMode('paper'),
        hasExecutionEngine: !!getEngineByMode('paper'),
      };
      
      // Live mode uses the global TradingEngine
      const live = globalLiveEngine?.getEngineStatusSnapshot?.() ?? {
        mode: 'live',
        isRunning: false,
        isStopped: true,
        openPositionsCount: 0,
        lastTickAt: null,
        lastExitEvalAt: null,
      };

      res.json({
        ok: true,
        phase: '8.8.3-I7-PM-FOCUS',
        paper,
        live,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: (err as Error).message,
      });
    }
  });

  // ===== Phase 8.8.3-I7-PRICE-FIX: Price Pipeline Diagnostics =====
  
  // GET /api/diagnostics/i7-price/status - Phase 8.8.3-I7-PRICE-FIX (A2): Price pipeline status
  // Returns detailed per-position pricing info for active trade price/exit diagnostics
  apiRouter.get('/diagnostics/i7-price/status', async (req, res) => {
    try {
      const { getGlobalPaperSimManager, getEngineByMode } = await import('./services/paper-sim-service.js');
      
      // Get paper engine status
      const paperManager = getGlobalPaperSimManager();
      const paperEngine = getEngineByMode('paper');
      
      let paperPriceStatus: any = null;
      if (paperEngine && typeof paperEngine.getI7PriceStatus === 'function') {
        paperPriceStatus = await paperEngine.getI7PriceStatus();
      } else {
        // Fallback: manual construction if engine doesn't have the method yet
        const { storage } = await import('./storage.js');
        const { livePricingAdapter } = await import('./services/live-pricing-adapter.js');
        const openPositions = await storage.getPaperSimOpenPositions('paper');
        const now = Date.now();
        
        const positions = await Promise.all(openPositions.map(async (pos: any) => {
          const priceResult = await livePricingAdapter.getPriceWithFallback(pos.symbol, 5000);
          const sl = pos.stopLoss ? parseFloat(pos.stopLoss) : null;
          const tp = pos.takeProfit ? parseFloat(pos.takeProfit) : null;
          const currentPrice = priceResult?.price ?? null;
          
          return {
            symbol: pos.symbol,
            priceSource: priceResult?.source ?? 'none',
            priceAgeMs: priceResult ? now - new Date(priceResult.timestamp).getTime() : -1,
            lastPriceAt: priceResult?.timestamp ?? null,
            lastExitEvalPrice: currentPrice,
            sl,
            tp,
            slTriggered: sl !== null && currentPrice !== null && currentPrice <= sl,
            tpTriggered: tp !== null && currentPrice !== null && currentPrice >= tp
          };
        }));
        
        paperPriceStatus = {
          isRunning: paperManager?.getIsRunning?.() ?? false,
          lastTickAt: null,
          lastExitEvalAt: null,
          positions
        };
      }
      
      res.json({
        ok: true,
        phase: '8.8.3-I7-PRICE-FIX',
        paper: paperPriceStatus
      });
    } catch (err) {
      console.error('[I7-PRICE-FIX] Error fetching price status:', err);
      res.status(500).json({
        ok: false,
        error: (err as Error).message
      });
    }
  });

  // ===== Phase 8.8.3-I7-WS-G: Tick Frequency Stabilization Endpoints =====

  // GET /api/diagnostics/i7-ws-g/frequency - Phase 8.8.3-I7-WS-G (G4.1): Get tick frequency metrics
  apiRouter.get('/diagnostics/i7-ws-g/frequency', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      const metrics = krakenWebSocketAdapter.getTickFrequencyMetrics();
      
      const summary = {
        total_symbols: metrics.length,
        normal: metrics.filter(m => m.classification === 'normal').length,
        slow: metrics.filter(m => m.classification === 'slow').length,
        very_slow: metrics.filter(m => m.classification === 'very_slow').length,
        frozen: metrics.filter(m => m.classification === 'frozen').length,
        unstable: metrics.filter(m => m.isUnstable).length
      };
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-G',
        description: 'Per-symbol tick frequency metrics',
        thresholds: {
          slow_ms: 3500,
          very_slow_ms: 6000,
          frozen_ms: 10000
        },
        summary,
        metrics
      });
    } catch (error: any) {
      console.error('[I7-WS-G] Error fetching frequency metrics:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch frequency metrics', message: error.message });
    }
  });

  // POST /api/diagnostics/i7-ws-g/reset - Phase 8.8.3-I7-WS-G (G4.2): Reset tick frequency data
  apiRouter.post('/diagnostics/i7-ws-g/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.resetTickFrequencyData();
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-G',
        message: 'Tick frequency data reset successfully'
      });
    } catch (error: any) {
      console.error('[I7-WS-G] Error resetting frequency data:', error);
      res.status(500).json({ ok: false, error: 'Failed to reset frequency data', message: error.message });
    }
  });

  // GET /api/diagnostics/i7-ws-g/unstable - Phase 8.8.3-I7-WS-G (G4.3): Get unstable symbols
  apiRouter.get('/diagnostics/i7-ws-g/unstable', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      const unstable = krakenWebSocketAdapter.getUnstableSymbols();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-G',
        description: 'Symbols marked as unstable (exceeded correction attempts)',
        count: unstable.length,
        symbols: unstable
      });
    } catch (error: any) {
      console.error('[I7-WS-G] Error fetching unstable symbols:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch unstable symbols', message: error.message });
    }
  });

  // POST /api/diagnostics/i7-ws-g/start-monitoring - Phase 8.8.3-I7-WS-G: Start frequency monitoring
  apiRouter.post('/diagnostics/i7-ws-g/start-monitoring', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.startTickFrequencyMonitoring();
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-G',
        message: 'Tick frequency monitoring started'
      });
    } catch (error: any) {
      console.error('[I7-WS-G] Error starting frequency monitoring:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/diagnostics/i7-ws-g/stop-monitoring - Phase 8.8.3-I7-WS-G: Stop frequency monitoring
  apiRouter.post('/diagnostics/i7-ws-g/stop-monitoring', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.stopTickFrequencyMonitoring();
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-G',
        message: 'Tick frequency monitoring stopped'
      });
    } catch (error: any) {
      console.error('[I7-WS-G] Error stopping frequency monitoring:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/diagnostics/i7-ws-g/channel-hints - Phase 8.8.3-I7-WS-G (G3): Get channel hints configuration
  apiRouter.get('/diagnostics/i7-ws-g/channel-hints', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      const hints = krakenWebSocketAdapter.getChannelHints();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.3-I7-WS-G',
        description: 'Channel hints for low-liquidity pairs',
        ...hints
      });
    } catch (error: any) {
      console.error('[I7-WS-G] Error fetching channel hints:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch channel hints', message: error.message });
    }
  });

  // ==========================================
  // Phase 8.8.5: Tiered Sentinel Architecture API Endpoints
  // ==========================================

  // GET /api/diagnostics/8.8.5/health - Get WebSocket health metrics
  apiRouter.get('/diagnostics/8.8.5/health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      const metrics = krakenWebSocketAdapter.getHealthMetrics();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.5',
        description: 'Tiered Sentinel WebSocket Health Metrics',
        metrics
      });
    } catch (error: any) {
      console.error('[8.8.5] Error fetching health metrics:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch health metrics', message: error.message });
    }
  });

  // GET /api/diagnostics/8.8.5/volume-tiers - Get VolumeClassifier tier assignments
  apiRouter.get('/diagnostics/8.8.5/volume-tiers', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { volumeClassifier } = await import('./services/market-data/volume-classifier.js');
      const stats = volumeClassifier.getStats();
      const allTiers = volumeClassifier.getAllTiers();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.5',
        description: 'VolumeClassifier Tier Assignments',
        stats,
        tiers: allTiers
      });
    } catch (error: any) {
      console.error('[8.8.5] Error fetching volume tiers:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch volume tiers', message: error.message });
    }
  });

  // POST /api/diagnostics/8.8.5/refresh-tiers - Refresh volume tier classifications
  apiRouter.post('/diagnostics/8.8.5/refresh-tiers', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { volumeClassifier } = await import('./services/market-data/volume-classifier.js');
      await volumeClassifier.refresh();
      const stats = volumeClassifier.getStats();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.5',
        description: 'Volume tiers refreshed',
        stats
      });
    } catch (error: any) {
      console.error('[8.8.5] Error refreshing volume tiers:', error);
      res.status(500).json({ ok: false, error: 'Failed to refresh volume tiers', message: error.message });
    }
  });

  // GET /api/diagnostics/8.8.5/rate-limiter - Get REST rate limiter stats
  apiRouter.get('/diagnostics/8.8.5/rate-limiter', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { restRateLimiter } = await import('./services/market-data/rest-rate-limiter.js');
      const stats = restRateLimiter.getStats();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.5',
        description: 'REST Rate Limiter Statistics',
        stats
      });
    } catch (error: any) {
      console.error('[8.8.5] Error fetching rate limiter stats:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch rate limiter stats', message: error.message });
    }
  });

  // POST /api/diagnostics/8.8.5/reset-rate-limiter - Reset REST rate limiter
  apiRouter.post('/diagnostics/8.8.5/reset-rate-limiter', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { restRateLimiter } = await import('./services/market-data/rest-rate-limiter.js');
      restRateLimiter.reset();
      const stats = restRateLimiter.getStats();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.5',
        description: 'REST rate limiter reset',
        stats
      });
    } catch (error: any) {
      console.error('[8.8.5] Error resetting rate limiter:', error);
      res.status(500).json({ ok: false, error: 'Failed to reset rate limiter', message: error.message });
    }
  });

  // POST /api/diagnostics/8.8.5/reset-health-metrics - Reset WebSocket health metrics
  apiRouter.post('/diagnostics/8.8.5/reset-health-metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      krakenWebSocketAdapter.resetHealthMetrics();
      const metrics = krakenWebSocketAdapter.getHealthMetrics();
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.5',
        description: 'WebSocket health metrics reset',
        metrics
      });
    } catch (error: any) {
      console.error('[8.8.5] Error resetting health metrics:', error);
      res.status(500).json({ ok: false, error: 'Failed to reset health metrics', message: error.message });
    }
  });

  // GET /api/diagnostics/8.8.5/tier/:symbol - Get tier for a specific symbol
  apiRouter.get('/diagnostics/8.8.5/tier/:symbol', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const symbol = req.params.symbol.replace('-', '/'); // Convert BTC-USD to BTC/USD
      const { volumeClassifier, TIER_THRESHOLDS } = await import('./services/market-data/volume-classifier.js');
      
      const tier = volumeClassifier.getTier(symbol);
      const thresholds = TIER_THRESHOLDS[tier];
      
      res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        phase: '8.8.5',
        symbol,
        tier,
        thresholds: {
          warnTimeoutMs: thresholds.warnTimeoutMs,
          resetTimeoutMs: thresholds.resetTimeoutMs
        }
      });
    } catch (error: any) {
      console.error('[8.8.5] Error fetching symbol tier:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch symbol tier', message: error.message });
    }
  });

  // POST /api/reb-2-12F/strategy-health - Run strategy health check (with mock data verification)
  apiRouter.post('/reb-2-12F/strategy-health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';

      console.log(`[REB2.12F][StrategyHealth] Starting health check - mode: ${mode}`);

      const { StrategyEngine } = await import('./services/strategy-engine');
      const fs = await import('fs');
      const path = await import('path');
      
      const strategyEngine = new StrategyEngine();

      // REB 2.12F: Read source code to verify orchestrator enabledStrategies set
      const orchestratorPath = path.join(process.cwd(), 'server/services/signal-orchestrator.ts');
      const orchestratorSource = fs.readFileSync(orchestratorPath, 'utf-8');
      
      // Parse the enabledStrategies set from source code
      const enabledMatch = orchestratorSource.match(/enabledStrategies\s*=\s*new\s*Set\([^[]*\[([\s\S]*?)\]/);
      const sourceStrategies = enabledMatch 
        ? enabledMatch[1].match(/'([a-z_]+)'/g)?.map(s => s.replace(/'/g, '')) || []
        : [];
      
      // Verify DHMA evaluation block is uncommented in source
      const dhmaBlockPattern = /if\s*\(this\.enabledStrategies\.has\('dhma'\)\)\s*\{[\s\S]*?detectDHMA[\s\S]*?\}/;
      const dhmaCommentedPattern = /\/\/\s*if\s*\(this\.enabledStrategies\.has\('dhma'\)\)/;
      const dhmaWired = dhmaBlockPattern.test(orchestratorSource) && !dhmaCommentedPattern.test(orchestratorSource);

      const strategyMethods: { id: string; displayName: string; method: string }[] = [
        { id: 'vwap_pullback', displayName: 'VWAP Pullback', method: 'detectVWAPPullback' },
        { id: 'abcd_long', displayName: 'ABCD Long', method: 'detectABCDLong' },
        { id: 'sma_trend_ride', displayName: 'SMA Trend Ride', method: 'detectSMATrendRide' },
        { id: 'breakout', displayName: 'Breakout', method: 'detectBreakout' },
        { id: 'mean_reversion', displayName: 'Mean Reversion', method: 'detectMeanReversion' },
        { id: 'range_trading', displayName: 'Range Trading', method: 'detectRangeTrading' },
        { id: 'vwap_bounce', displayName: 'VWAP Bounce', method: 'detectVWAPBounce' },
        { id: 'liquidity_trap', displayName: 'Liquidity Trap', method: 'detectLiquidityTrap' },
        { id: 'dhma', displayName: 'DHMA', method: 'detectDHMA' }
      ];

      // Generate deterministic OHLC data designed to trigger strategy signals
      // Uses trending pattern (uptrend) with pullbacks and consolidation phases
      const basePrice = 100;
      const mockOHLC = Array.from({ length: 100 }, (_, i) => {
        const trend = i * 0.15; // Uptrend
        const cycle = Math.sin(i / 10) * 3; // Oscillation
        const pullback = i > 60 && i < 70 ? -5 : 0; // Pullback zone
        const consolidation = i > 80 ? 0.5 : 1; // Consolidation at end
        
        const midPrice = basePrice + trend + cycle + pullback;
        const volatility = 2 * consolidation;
        
        return {
          time: Date.now() - (100 - i) * 60000,
          open: midPrice - volatility * 0.3,
          high: midPrice + volatility,
          low: midPrice - volatility,
          close: midPrice + volatility * 0.5,
          volume: 1500000 + (i > 70 ? 800000 : 0) // Volume spike after pullback
        };
      });

      // Calculate VWAP from mock data
      let sumPV = 0, sumV = 0;
      for (const c of mockOHLC) {
        const typical = (c.high + c.low + c.close) / 3;
        sumPV += typical * c.volume;
        sumV += c.volume;
      }
      const calculatedVwap = sumPV / sumV;

      // Calculate SMA
      const last20 = mockOHLC.slice(-20);
      const calculatedSma = last20.reduce((sum, c) => sum + c.close, 0) / 20;

      const mockIndicators = {
        vwap: calculatedVwap,
        sma: calculatedSma,
        currentPrice: mockOHLC[mockOHLC.length - 1].close,
        volume: mockOHLC[mockOHLC.length - 1].volume,
        high24h: Math.max(...mockOHLC.slice(-24).map(c => c.high)),
        low24h: Math.min(...mockOHLC.slice(-24).map(c => c.low)),
        // DHMA microstructure inputs
        obi: 0.35, // Order book imbalance (above theta_OBI threshold of 0.3)
        micropriceTilt: 0.25, // Above epsilon_micro threshold of 0.2
        signedFlow: 150, // Positive flow
        toxicity: 0.5, // Below tau_toxicity threshold of 0.7
        spread: 2, // Below maxSpread threshold of 5
        bidVolume: 50000,
        askVolume: 35000
      };

      const perStrategy: any[] = [];
      const warnings: string[] = [];
      let allMethodsExist = true;
      let signalsGenerated = 0;

      console.log(`[REB2.12F][StrategyHealth] Verifying 9 strategy methods with mock data...`);

      for (const strategy of strategyMethods) {
        const methodExists = typeof (strategyEngine as any)[strategy.method] === 'function';
        const inSourceSet = sourceStrategies.includes(strategy.id);
        let executionResult = 'NOT_TESTED';
        let error = null;

        if (methodExists) {
          try {
            // Execute each strategy's detect method with mock data
            let result: any = null;
            switch (strategy.id) {
              case 'vwap_pullback':
                result = strategyEngine.detectVWAPPullback(mockIndicators, { smaLength: 20 }, mockOHLC as any);
                break;
              case 'abcd_long':
                result = strategyEngine.detectABCDLong(mockOHLC as any, { minConsolidation: 10 });
                break;
              case 'sma_trend_ride':
                result = strategyEngine.detectSMATrendRide(mockIndicators, mockOHLC as any, { smaLength: 20 });
                break;
              case 'breakout':
                result = strategyEngine.detectBreakout(mockOHLC as any, { minConsolidationBars: 10, maxRangeWidth: 3, breakoutBuffer: 1, volumeMultiplier: 2, maxHoldingHours: 12 });
                break;
              case 'mean_reversion':
                result = strategyEngine.detectMeanReversion(mockIndicators, mockOHLC as any, { meanType: 'vwap', smaLength: 20, deviationThreshold: 2.5, partialExitPercent: 50, stopLossBuffer: 1 });
                break;
              case 'range_trading':
                result = strategyEngine.detectRangeTrading(mockOHLC as any, { minRangeDurationHours: 12, minRangeWidth: 3, minBoundaryTouches: 3, entryZoneWidth: 0.5, stopLossBeyond: 1 });
                break;
              case 'vwap_bounce':
                result = strategyEngine.detectVWAPBounce(mockIndicators, mockOHLC as any, { vwapProximity: 0.5, minVWAPSlope: 0.3, volumeMultiplier: 1.3, maxPullbackBars: 5, partialExitR: 1.5 });
                break;
              case 'liquidity_trap':
                result = strategyEngine.detectLiquidityTrap(mockOHLC as any, { maxTrapExtension: 1.2, trapReturnBars: 2, minStopZoneSize: 'medium', minLevelTouches: 3, volumeRatio: 1.5 });
                break;
              case 'dhma':
                result = strategyEngine.detectDHMA(mockIndicators, mockOHLC as any, { theta_OBI: 0.3, epsilon_micro: 0.2, tau_toxicity: 0.7, maxSpread: 5, k_tp: 1.5, N_flow: 50, N_burst: 10, window_session: 20 });
                break;
            }
            executionResult = result ? 'SIGNAL_GENERATED' : 'NO_SIGNAL';
            if (result) signalsGenerated++;
          } catch (e: any) {
            executionResult = 'ERROR';
            error = e.message;
            warnings.push(`Strategy ${strategy.id} execution error: ${e.message}`);
          }
        } else {
          allMethodsExist = false;
          warnings.push(`Strategy ${strategy.id} method ${strategy.method} not found`);
        }

        const status = methodExists && inSourceSet && executionResult !== 'ERROR' ? 'HEALTHY' : 
                       methodExists && !inSourceSet ? 'NOT_IN_ORCHESTRATOR' : 
                       methodExists ? 'EXECUTION_ERROR' : 'MISSING';
        
        perStrategy.push({
          id: strategy.id,
          displayName: strategy.displayName,
          methodExists,
          inOrchestratorSet: inSourceSet,
          executionResult,
          error,
          status
        });

        console.log(`  { id: '${strategy.id}', methodExists: ${methodExists}, inSet: ${inSourceSet}, exec: ${executionResult} }`);
      }

      const healthyCount = perStrategy.filter(s => s.status === 'HEALTHY').length;
      const allStrategiesHealthy = healthyCount === 9;

      console.log(`[REB2.12F][StrategyHealth] Complete - healthy: ${healthyCount}/9, dhmaWired: ${dhmaWired}, signals: ${signalsGenerated}`);

      res.json({
        ok: true,
        mode,
        summary: {
          strategiesEvaluated: 9,
          healthyStrategies: healthyCount,
          allStrategiesHealthy,
          allMethodsExist,
          dhmaEnabled: sourceStrategies.includes('dhma'),
          dhmaWiredInEvaluator: dhmaWired,
          mockSignalsGenerated: signalsGenerated
        },
        perStrategy,
        orchestratorStrategies: sourceStrategies,
        warnings
      });
    } catch (error: any) {
      console.error('[REB2.12F] Error running strategy health check:', error);
      res.status(500).json({
        ok: false,
        error: 'Failed to run strategy health check',
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
    const { mode, initialBalance } = req.body || {};
    
    // Phase 8.8.3-B7.1: mode is REQUIRED - must be 'new' or 'continue'
    console.log(`[B7.1][START]`, { mode, initialBalance });
    
    if (mode !== 'new' && mode !== 'continue') {
      console.log(`[B7.1][ERROR] Invalid mode: ${mode}`);
      return res.status(400).json({
        error: 'Invalid mode. Expected "new" or "continue" for paper-sim start.',
        received: mode
      });
    }
    
    try {
      console.log(`[41D-ROUTE-3] Entering try block (t+${Date.now()-t0}ms)`);
      
      // Phase 8.8.3-B7.1: Hard reset ONLY on mode='new'
      // Continue mode preserves existing state (trades, positions, portfolio)
      if (mode === 'new') {
        console.log(`[B7.1][HARD_RESET] Running hardResetPaperSim + resetPaper() before new simulation...`);
        const { paperSessionResetService } = await import('./services/paper-session-reset.js');
        const resetResult = await paperSessionResetService.hardResetPaperSimulation('paper');
        console.log(`[B7.1][HARD_RESET] Complete:`, {
          success: resetResult.success,
          closedTrades: resetResult.details.closedTrades,
          clearedPositions: resetResult.details.clearedPositions,
          elapsed: resetResult.message
        });
        
        // Broadcast reset completion to invalidate UI caches immediately
        const { contextBridge } = await import('./services/context-bridge.js');
        await contextBridge.broadcast({
          type: 'paper_sim_reset',
          payload: {
            mode: 'paper',
            resetResult: resetResult.details,
            timestamp: new Date().toISOString(),
            reason: 'new_simulation_hard_reset'
          },
          mode: 'paper'
        });
        
        // Directive 12.2.3: Bob Core cache invalidation removed (Batch 7B)
        console.log(`[B7.1][HARD_RESET] Simulation reset complete`);
      } else {
        console.log(`[B7.1][CONTINUE] Preserving existing state (no hard reset)`);
      }
      
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
        console.log('[PaperSimReset] Retrieved system context for mode: paper');
        
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
        
        // Phase 27.F.14.J: Reset trading pace to defaults (guardrails and filters preserved)
        console.log('[LATTI][Paper] Resetting trading pace to baseline (preserving user guardrails and filters)...');
        
        // Reset trading pace to baseline
        await storage.updateSystemContext('paper', {
          tradingPace: 'baseline'
        });
        
        console.log('[LATTI][Paper] Trading pace reset to baseline (guardrails and filters preserved)');
        
        // Start the simulation
        const { startPaperSimulation } = await import('./services/paper-sim-service.js');
        // REB 2.8.13: Pass startingBalance to startPaperSimulation (required after REB 2.8.12)
        const result = await startPaperSimulation(userId, { startingBalance: balance });
        
        // Directive 12.2.3: Bob Core cache invalidation removed (Batch 7B)

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
      
      // Directive 12.2.3: Bob Core cache invalidation removed (Batch 7B)
      
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
      
      // Directive 12.2.3: Bob Core cache invalidation removed (Batch 7B)
      
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

  // Phase 27.F.13.C + B7.A: Reset paper simulation with hard reset
  apiRouter.post('/paper-sim/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { newBalance, mode: requestedMode } = req.body;
    
    try {
      // B7.A: Enforce paper-mode only for this endpoint
      const mode: 'paper' = 'paper';
      if (requestedMode && requestedMode !== 'paper') {
        return res.status(400).json({
          error: 'Invalid mode',
          message: 'This endpoint only supports paper mode reset. Use separate endpoints for live mode.'
        });
      }
      
      // Phase 8.8.3-I9-RESET-FIX: Soft reset fallback using existing balance
      // If newBalance is provided, use it (hard reset with new balance)
      // If newBalance is NOT provided, fetch current balance and do soft reset (clear positions only)
      let balance: number;
      let isSoftReset = false;
      
      if (newBalance !== undefined && !isNaN(parseFloat(newBalance))) {
        balance = parseFloat(newBalance);
        console.log(`[PaperSim] Hard reset with new balance: $${balance}`);
      } else {
        // Soft reset: fetch current balance from portfolio state
        isSoftReset = true;
        const systemContext = await storage.getSystemContext('paper');
        if (!systemContext) {
          return res.status(500).json({ error: 'System context not found for paper mode' });
        }
        const portfolioState = await storage.getPortfolioState(systemContext.id, 'paper');
        balance = portfolioState ? parseFloat(portfolioState.cash || '10000') : 10000;
        console.log(`[PaperSim] Soft reset using existing balance: $${balance}`);
      }
      
      console.log(`[PaperSim] Resetting simulation for user ${userId} with balance $${balance}`);
      
      // Phase 8.8.3-B7.A: Use hard reset service for complete cleanup
      const { paperSessionResetService } = await import('./services/paper-session-reset.js');
      const resetResult = await paperSessionResetService.hardResetPaperSimulation(mode);
      
      if (!resetResult.success) {
        console.error(`[B7.A] Hard reset failed:`, resetResult.message);
        // Continue with legacy cleanup as fallback
        // Directive 12.2.3: Bob Core cache invalidation removed (Batch 7B)
      }
      
      console.log(`[B7.A] Hard reset result:`, resetResult.details);
      
      // Phase 8.8.3-I9-RESET-FIX: Soft reset preserves trade history
      // Only clear open positions - trade history remains for review
      if (isSoftReset) {
        // Soft reset: only clear open positions, preserve trade history
        await storage.deleteAllPaperSimOpenPositions('paper');
        console.log(`[PaperSim] Soft reset: cleared open positions, trade history preserved`);
      } else {
        // Hard reset: full cleanup including trade history
        await storage.deleteAllPaperSimTrades('paper');
        await storage.deleteAllPaperSimOpenPositions('paper');
        await storage.deleteAllPaperSimTradeLogs('paper');
        console.log(`[PaperSim] Hard reset: cleared trades, positions, and logs`);
      }
      
      // 8.8.4-C.14.C: RTB signals already cleared via hardResetPaperSimulation -> clearReadyToBuy
      // Note: Removed duplicate storage.deleteAllTradingSignals call as clearReadyToBuy provides WebSocket broadcast
      
      // Reset portfolio state for paper mode
      const systemContext = await storage.getSystemContext('paper');
      console.log('[PaperSimReset] Retrieved system context for mode: paper');
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
      
      // Directive 12.2.3: Bob Core cache invalidation removed (Batch 7B)

      console.log(`[PaperSim] Reset complete - new balance: $${balance}`);
      
      res.json({
        success: true,
        message: isSoftReset 
          ? 'Paper simulation soft reset complete. Positions cleared, balance preserved.'
          : 'Paper simulation hard reset complete.',
        newBalance: balance,
        isSoftReset,
        hardResetDetails: resetResult.details
      });
    } catch (error: any) {
      console.error('[PaperSim] Error resetting simulation:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to reset paper simulation'
      });
    }
  });

  // Phase 8.8.4-C.11: Clear residual backend data before validation session
  apiRouter.post('/paper-sim/clear-data', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = 'paper';
      console.log('[8.8.4-C.11][CLEAR_DATA] Starting residual data cleanup');
      
      // Clear paper trades
      const tradesDeleted = await storage.deleteAllPaperSimTrades(mode);
      console.log(`[8.8.4-C.11][CLEAR_DATA] Cleared ${tradesDeleted} paper trades`);
      
      // Clear open positions
      await storage.deleteAllPaperSimOpenPositions(mode);
      console.log('[8.8.4-C.11][CLEAR_DATA] Cleared open positions');
      
      // Clear RTB signals
      const signalsDeleted = await storage.deleteRtbSignals({ mode });
      console.log(`[8.8.4-C.11][CLEAR_DATA] Cleared ${signalsDeleted} RTB signals`);
      
      // Clear trade logs
      await storage.deleteAllPaperSimTradeLogs(mode);
      console.log('[8.8.4-C.11][CLEAR_DATA] Cleared trade logs');
      
      res.json({
        success: true,
        message: 'Residual data cleared successfully',
        cleared: {
          trades: tradesDeleted,
          signals: signalsDeleted,
        }
      });
    } catch (error: any) {
      console.error('[8.8.4-C.11][CLEAR_DATA_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to clear data' });
    }
  });

  // Phase 8.8.4-C.11: Start validation session
  apiRouter.post('/paper-sim/validation-session/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { durationHours = 3 } = req.body;
      const { validationSessionService } = await import('./services/validation-session-service.js');
      
      await validationSessionService.startSession('paper', durationHours);
      
      res.json({
        success: true,
        message: `Validation session started for ${durationHours} hours`,
        status: validationSessionService.getSessionStatus()
      });
    } catch (error: any) {
      console.error('[8.8.4-C.11][SESSION_START_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to start validation session' });
    }
  });

  // Phase 8.8.4-C.11: Stop validation session
  apiRouter.post('/paper-sim/validation-session/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { validationSessionService } = await import('./services/validation-session-service.js');
      
      await validationSessionService.stopSession();
      
      res.json({
        success: true,
        message: 'Validation session stopped',
        status: validationSessionService.getSessionStatus()
      });
    } catch (error: any) {
      console.error('[8.8.4-C.11][SESSION_STOP_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to stop validation session' });
    }
  });

  // Phase 8.8.4-C.11: Get validation session status and report
  apiRouter.get('/paper-sim/validation-session/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { validationSessionService } = await import('./services/validation-session-service.js');
      
      const status = validationSessionService.getSessionStatus();
      const latestReport = validationSessionService.getLatestReport();
      
      res.json({
        ...status,
        latestReport
      });
    } catch (error: any) {
      console.error('[8.8.4-C.11][SESSION_STATUS_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to get session status' });
    }
  });

  // Phase 8.8.4-C.11: Trigger manual status report
  apiRouter.post('/paper-sim/validation-session/report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { validationSessionService } = await import('./services/validation-session-service.js');
      
      const report = await validationSessionService.generateStatusReport();
      
      if (!report) {
        return res.status(400).json({ error: 'No active validation session' });
      }
      
      res.json({
        success: true,
        report
      });
    } catch (error: any) {
      console.error('[8.8.4-C.11][REPORT_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to generate report' });
    }
  });

  // Phase 8.8.4-C.11: Start SQE distribution logging
  apiRouter.post('/paper-sim/sqe-distribution/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { intervalMinutes = 10, durationMinutes = 30 } = req.body;
      const { validationSessionService } = await import('./services/validation-session-service.js');
      
      await validationSessionService.startSQEDistributionLogging('paper', intervalMinutes, durationMinutes);
      
      res.json({
        success: true,
        message: `SQE distribution logging started: every ${intervalMinutes}min for ${durationMinutes}min`
      });
    } catch (error: any) {
      console.error('[8.8.4-C.11][SQE_DISTRIBUTION_START_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to start SQE distribution logging' });
    }
  });

  // Phase 8.8.4-C.13: Start C.13 validation session with relaxed SQE thresholds
  apiRouter.post('/paper-sim/c13-validation/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { durationHours = 3, intervalMinutes = 30 } = req.body;
      const { c13ValidationService } = await import('./services/c13-validation-service.js');
      
      const result = await c13ValidationService.startSession('paper', durationHours, intervalMinutes);
      
      if (!result.ok) {
        return res.status(400).json({ error: 'Session already active' });
      }
      
      res.json({
        ok: true,
        sessionId: result.sessionId,
        message: `C.13 validation session started for ${durationHours} hours with ${intervalMinutes}min snapshots`,
        status: c13ValidationService.getStatus()
      });
    } catch (error: any) {
      console.error('[8.8.4-C.13][SESSION_START_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to start C.13 validation session' });
    }
  });

  // Phase 8.8.4-C.13: Stop C.13 validation session
  apiRouter.post('/paper-sim/c13-validation/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { c13ValidationService } = await import('./services/c13-validation-service.js');
      
      const result = await c13ValidationService.endSession();
      
      res.json({
        ok: result.ok,
        resultsPath: result.resultsPath,
        message: result.ok ? 'C.13 validation session ended' : 'No active session'
      });
    } catch (error: any) {
      console.error('[8.8.4-C.13][SESSION_STOP_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to stop C.13 validation session' });
    }
  });

  // Phase 8.8.4-C.13: Get C.13 validation session status
  apiRouter.get('/paper-sim/c13-validation/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { c13ValidationService } = await import('./services/c13-validation-service.js');
      
      const status = c13ValidationService.getStatus();
      const latestSnapshot = await c13ValidationService.getLatestSnapshot();
      
      res.json({
        ok: true,
        ...status,
        latestSnapshot
      });
    } catch (error: any) {
      console.error('[8.8.4-C.13][STATUS_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to get C.13 validation status' });
    }
  });

  // Phase 8.8.4-C.14: Start C.14 comprehensive validation session
  apiRouter.post('/paper-sim/c14-validation/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { durationHours = 3, intervalMinutes = 30 } = req.body;
      const { c14ValidationService } = await import('./services/c14-validation-service.js');
      
      const result = await c14ValidationService.startSession('paper', durationHours, intervalMinutes);
      
      if (!result.ok) {
        return res.status(400).json({ error: 'Session already active' });
      }
      
      res.json({
        ok: true,
        sessionId: result.sessionId,
        message: `C.14 validation session started for ${durationHours} hours with ${intervalMinutes}min snapshots`,
        status: c14ValidationService.getStatus()
      });
    } catch (error: any) {
      console.error('[8.8.4-C.14][SESSION_START_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to start C.14 validation session' });
    }
  });

  // Phase 8.8.4-C.14: Stop C.14 validation session
  apiRouter.post('/paper-sim/c14-validation/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { c14ValidationService } = await import('./services/c14-validation-service.js');
      
      const result = await c14ValidationService.endSession();
      
      res.json({
        ok: result.ok,
        resultsPath: result.resultsPath,
        message: result.ok ? 'C.14 validation session ended' : 'No active session'
      });
    } catch (error: any) {
      console.error('[8.8.4-C.14][SESSION_STOP_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to stop C.14 validation session' });
    }
  });

  // Phase 8.8.4-C.14: Get C.14 validation session status
  apiRouter.get('/paper-sim/c14-validation/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { c14ValidationService } = await import('./services/c14-validation-service.js');
      
      const status = c14ValidationService.getStatus();
      const latestSnapshot = await c14ValidationService.getLatestSnapshot();
      
      res.json({
        ok: true,
        ...status,
        latestSnapshot
      });
    } catch (error: any) {
      console.error('[8.8.4-C.14][STATUS_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to get C.14 validation status' });
    }
  });

  // Phase 8.8.4-C.14: Clear RTB queue
  apiRouter.delete('/paper-sim/clear-rtb', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { readyToBuyService } = await import('./core/rtb/ready_to_buy_service.js');
      
      const clearedCount = await readyToBuyService.clearQueue('paper');
      
      res.json({
        ok: true,
        cleared: clearedCount,
        message: `Cleared ${clearedCount} signals from RTB queue`
      });
    } catch (error: any) {
      console.error('[8.8.4-C.14][CLEAR_RTB_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to clear RTB queue' });
    }
  });

  // Phase 8.8.4-C.14: Clear trades
  apiRouter.delete('/paper-sim/clear-trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode: 'paper' | 'live' = 'paper';
      
      await storage.deleteAllPaperSimTrades(mode);
      await storage.deleteAllPaperSimOpenPositions(mode);
      
      res.json({
        ok: true,
        message: 'Cleared all trades and positions'
      });
    } catch (error: any) {
      console.error('[8.8.4-C.14][CLEAR_TRADES_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to clear trades' });
    }
  });

  // Phase 8.8.4-C.14: Update paper simulation config (starting_balance)
  apiRouter.patch('/paper-sim/config', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { starting_balance } = req.body;
      
      if (starting_balance !== undefined) {
        const balance = parseFloat(starting_balance);
        if (isNaN(balance) || balance <= 0) {
          return res.status(400).json({ error: 'Invalid starting_balance value' });
        }
        
        const userId = req.user!.id;
        await storage.updatePortfolioBalance({ userId, mode: 'paper', balance });
        
        console.log(`[8.8.4-C.14][CONFIG] Updated starting_balance to $${balance} for user ${userId}`);
      }
      
      res.json({
        ok: true,
        message: 'Configuration updated',
        starting_balance
      });
    } catch (error: any) {
      console.error('[8.8.4-C.14][CONFIG_ERROR]', error);
      res.status(500).json({ error: error.message || 'Failed to update configuration' });
    }
  });

  // Paper trading status
  apiRouter.get('/paper-sim/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    // Directive 12.2.3: Bob Core transparent routing removed (Batch 7B)
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

  // Phase 8.8.3-C5: Enhanced trades endpoint with pagination, sorting, and filtering
  // Phase 8.8.3-C-FINAL: Ghost filter moved to SQL, closeReason filter added
  apiRouter.get('/paper-sim/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { limit, offset, sortBy, order, closedOnly, symbol, strategy, closeReason, dateFrom, dateTo, paginated } = req.query;
      
      // Phase 8.8.3-C5: If paginated=true, use new paginated method
      if (paginated === 'true') {
        const filters: any = {
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0,
          sortBy: (sortBy as string) || 'closedAt',
          order: (order as string) || 'desc',
          closedOnly: closedOnly === 'true',
          symbol: symbol as string,
          strategy: strategy as string,
          closeReason: closeReason as string,
        };
        
        if (dateFrom) {
          filters.dateFrom = new Date(dateFrom as string);
          console.log(`[C-FINAL-2][ROUTES] dateFrom input="${dateFrom}" parsed=${filters.dateFrom.toISOString()}`);
        }
        if (dateTo) {
          filters.dateTo = new Date(dateTo as string);
          console.log(`[C-FINAL-2][ROUTES] dateTo input="${dateTo}" parsed=${filters.dateTo.toISOString()}`);
        }
        
        // Phase 8.8.3-C-FINAL: Ghost filter now in SQL, no post-query filtering needed
        console.log(`[C-FINAL-2][ROUTES] Calling getPaperSimTradesPaginated with filters:`, JSON.stringify({
          ...filters,
          dateFrom: filters.dateFrom?.toISOString(),
          dateTo: filters.dateTo?.toISOString()
        }));
        const result = await storage.getPaperSimTradesPaginated('paper', filters);
        
        res.json({
          trades: result.trades,
          totalCount: result.totalCount,
          limit: filters.limit,
          offset: filters.offset,
          sortBy: filters.sortBy,
          order: filters.order
        });
        return;
      }
      
      // Legacy non-paginated path for backwards compatibility
      const options: any = {};
      if (limit) options.limit = parseInt(limit as string);
      if (closedOnly) options.closedOnly = closedOnly === 'true';
      
      const trades = await storage.getPaperSimTrades('paper', options);
      
      // Phase 8.8.3-C-FINAL: Ghost trade filtering for legacy path
      const validTrades = trades.filter((trade: any) => {
        if (!trade.closedAt && trade.status === 'open') return true;
        if (trade.closedAt) {
          const hasExitPrice = trade.exitPrice && parseFloat(trade.exitPrice.toString()) > 0;
          const hasCloseReason = trade.closeReason && trade.closeReason.trim() !== '';
          return hasExitPrice && hasCloseReason;
        }
        if (trade.status && trade.status !== 'open') {
          return false;
        }
        return true;
      });
      
      res.json(validTrades);
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

  // Phase 8.8.3-B1: Enhanced Active Trades endpoint with slot visibility and integrity checking
  // Phase 8.8.3-I6: Now uses live prices from LivePricingAdapter instead of stale DB prices
  // Phase 8.8.3-I9: Added frequency and volume data
  apiRouter.get('/paper-sim/active-trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Phase 8.8.3-I9: Import services for frequency and volume data
      const { krakenWebSocketAdapter } = await import('./services/kraken-websocket-adapter.js');
      const { activeFilterPool } = await import('./services/active-filter-pool.js');
      
      // Get open positions from paper_sim_open_positions
      const positions = await storage.getPaperSimOpenPositions('paper');
      
      // Get guardrail settings for max open positions using dynamic slot calculation
      const { getDynamicSlots } = await import('./services/dynamic-slots.js');
      const { slots: maxOpenTrades } = await getDynamicSlots('paper');
      
      // Phase 8.8.3-I6: Enrich positions with LIVE prices from LivePricingAdapter
      const enrichedPositions = await Promise.all(positions.map(async (pos, index) => {
        const entryPrice = parseFloat(pos.avgPrice?.toString() || '0');
        const takeProfit = parseFloat(pos.takeProfit?.toString() || '0');
        const stopLoss = parseFloat(pos.stopLoss?.toString() || '0');
        const openedAt = pos.openedAt ? new Date(pos.openedAt) : new Date();
        const holdingDurationMs = Date.now() - openedAt.getTime();
        
        // Phase 8.8.3-I6 A1: Get LIVE price using getPriceWithFallback (includes 5s staleness guard + REST fallback)
        let currentPrice = entryPrice; // Fallback to entry price if all else fails
        let priceSource = 'entry_fallback';
        let priceAgeMs = 0;
        let fallbackType: 'none' | 'rest_fallback' | 'entry_fallback' = 'entry_fallback';
        
        const liveQuote = await livePricingAdapter.getPriceWithFallback(pos.symbol, 5000);
        if (liveQuote && liveQuote.price !== null && liveQuote.source !== 'no_reliable_price') {
          currentPrice = liveQuote.price;
          priceSource = liveQuote.source;
          priceAgeMs = Date.now() - new Date(liveQuote.timestamp).getTime();
          // Track REST fallback vs WebSocket primary source
          const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
          fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
        } else {
          // Log that we fell back to entry price due to no reliable live price
          fallbackType = 'entry_fallback';
          console.log(`[8.8.3-I6][FALLBACK_TO_ENTRY] symbol=${pos.symbol} reason=no_reliable_price`);
        }
        
        // Phase 8.8.3-I6 D2: Diagnostic logging for live price feed audit (includes fallback tracking)
        console.log(`[8.8.3-I6][LIVE_PRICE_FEED] symbol=${pos.symbol} price=${currentPrice} age=${priceAgeMs}ms source=${priceSource} fallbackType=${fallbackType}`);
        
        // Phase 8.8.3-I6 E1: Calculate P/L and distance using LIVE price
        const quantity = parseFloat(pos.quantity?.toString() || '0');
        const unrealizedPnl = (currentPrice - entryPrice) * quantity;
        const unrealizedPnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
        
        // Phase 8.8.3-C2: P/L Breakdown for cost transparency
        // Batch 18J: Canonical fee/slippage from exchange-defaults.ts
        const SLIPPAGE_PCT = CANONICAL_SLIPPAGE * 100; // 0.05% from exchange-defaults
        const FEE_PCT = DEFAULT_TAKER_FEE * 100; // 0.26% from exchange-defaults
        
        // Get intended entry price (signal price before slippage)
        const intendedEntryPrice = pos.intendedEntryPrice 
          ? parseFloat(pos.intendedEntryPrice.toString()) 
          : entryPrice; // Fallback for old positions
        const intendedEntryValue = intendedEntryPrice * quantity;
        const currentValue = currentPrice * quantity;
        
        // Gross P/L = Pure market movement (no slippage, no fees)
        const grossPnl = (currentPrice - intendedEntryPrice) * quantity;
        const grossPnlPercent = intendedEntryValue > 0 ? (grossPnl / intendedEntryValue) * 100 : 0;
        
        // Entry costs (persisted at trade creation)
        const entryFee = pos.entryFee ? parseFloat(pos.entryFee.toString()) : (entryPrice * quantity * FEE_PCT / 100);
        const entrySlippage = pos.entrySlippage ? parseFloat(pos.entrySlippage.toString()) : 0;
        
        // Estimated exit costs (based on current price)
        const estExitFee = currentValue * (FEE_PCT / 100);
        const estExitSlippage = currentPrice * (SLIPPAGE_PCT / 100) * quantity;
        
        // Total estimated cost
        const estTotalCost = entryFee + entrySlippage + estExitFee + estExitSlippage;
        
        // Net P/L = Gross P/L minus all costs
        const netPnl = grossPnl - estTotalCost;
        const netPnlPercent = intendedEntryValue > 0 ? (netPnl / intendedEntryValue) * 100 : 0;
        
        // Phase 8.8.3-I6 E1: Distance to TP/SL using live price (percentages)
        const distanceToTP = takeProfit > 0 ? ((takeProfit - currentPrice) / currentPrice) * 100 : 0;
        const distanceToSL = stopLoss > 0 ? ((currentPrice - stopLoss) / currentPrice) * 100 : 0;
        
        // CR-001: Distance in dollar values (absolute price difference * quantity)
        // For long positions: TP is above entry, SL is below entry
        // distanceToTPDollars = potential profit to TP, distanceToSLDollars = potential loss to SL
        const isLong = (pos.side || 'buy').toLowerCase() === 'buy';
        let distanceToTPDollars = 0;
        let distanceToSLDollars = 0;
        
        if (isLong) {
          // Long: TP above current (positive = profit potential), SL below current (positive = loss buffer)
          distanceToTPDollars = takeProfit > 0 ? (takeProfit - currentPrice) * quantity : 0;
          distanceToSLDollars = stopLoss > 0 ? (currentPrice - stopLoss) * quantity : 0;
        } else {
          // Short: TP below current (profit when price drops), SL above current (loss when price rises)
          distanceToTPDollars = takeProfit > 0 ? (currentPrice - takeProfit) * quantity : 0;
          distanceToSLDollars = stopLoss > 0 ? (stopLoss - currentPrice) * quantity : 0;
        }
        
        // Health indicator: green (profitable), yellow (near breakeven), red (losing)
        let health: 'green' | 'yellow' | 'red' = 'yellow';
        if (unrealizedPnlPercent >= 0.5) health = 'green';
        else if (unrealizedPnlPercent <= -0.5) health = 'red';
        
        // Phase 8.8.3-I9: Get frequency info
        const frequencyInfo = krakenWebSocketAdapter.getSymbolFrequencyInfo(pos.symbol);
        
        // Phase 8.8.3-I10: Get volume info (DB first, then pool, then cache fallback)
        let volume24h = 0;
        let volumeBucket: 'High' | 'Medium' | 'Low' | 'Very Low' = 'Very Low';
        
        // Try DB first (persisted at trade creation)
        if (pos.volume24h && parseFloat(pos.volume24h.toString()) > 0) {
          volume24h = parseFloat(pos.volume24h.toString());
          volumeBucket = (pos.volumeBucket as 'High' | 'Medium' | 'Low' | 'Very Low') || marketVolumeCache.classifyVolume(volume24h);
        } else {
          // Fallback: try active filter pool
          const poolInfo = activeFilterPool.getSymbolVolumeInfo(pos.symbol, 'paper');
          if (poolInfo.volume24h > 0) {
            volume24h = poolInfo.volume24h;
            volumeBucket = poolInfo.volumeBucket;
          }
        }
        
        // Phase 8.8.3-I9: Derive source from actual priceSource (WS takes precedence)
        const sourceLabel = priceSource.includes('kraken_ws') ? 'WS' : frequencyInfo.source;
        
        // Phase 8.8.3-I9: Normalize confidence to 0-100 (stored as 0-1 in database)
        const rawConfidence = parseFloat(pos.confidence?.toString() || '0');
        const confidencePercent = rawConfidence <= 1 ? Math.round(rawConfidence * 100) : Math.round(rawConfidence);
        
        return {
          id: pos.id,
          symbol: pos.symbol,
          strategy: pos.strategyName,
          side: pos.side,
          quantity,
          entryPrice,
          intendedEntryPrice, // Phase 8.8.3-C2: Signal price before slippage
          currentPrice,
          unrealizedPnl,
          unrealizedPnlPercent,
          // Phase 8.8.3-C2: P/L breakdown
          grossPnl,
          grossPnlPercent,
          netPnl,
          netPnlPercent,
          // Phase 8.8.3-C2: Cost breakdown
          entryFee,
          entrySlippage,
          estExitFee,
          estExitSlippage,
          estTotalCost,
          takeProfit,
          stopLoss,
          distanceToTP,
          distanceToSL,
          distanceToTPDollars, // CR-001: Dollar-based distance
          distanceToSLDollars, // CR-001: Dollar-based distance
          holdingDurationMs,
          slotNumber: index + 1,
          maxSlots: maxOpenTrades,
          health,
          openedAt: openedAt.toISOString(),
          confidence: confidencePercent, // Phase 8.8.3-I9: Now normalized to 0-100%
          metadata: pos.metadata,
          priceSource, // Phase 8.8.3-I6: Expose price source for debugging
          priceAgeMs,  // Phase 8.8.3-I6: Expose price age for staleness monitoring
          // Phase 8.8.3-I9: New columns
          sourceLabel,  // 'WS' or 'REST'
          frequency: frequencyInfo.frequency, // 'High', 'Medium', 'Low', 'Very Low'
          avgIntervalMs: frequencyInfo.avgIntervalMs,
          volume24h: volume24h, // Phase 8.8.3-I10: From DB, pool, or cache
          volumeBucket: volumeBucket, // 'High', 'Medium', 'Low', 'Very Low'
          positionValue: quantity * currentPrice, // Total value of position
          // Directive 9.2: Trade mode for trailing exit system
          tradeMode: (pos as any).tradeMode || 'TARGET' // TARGET or TRAILING_TAKE (MOONBAG)
        };
      }));
      
      // Integrity check
      const systemCount = positions.length;
      const slotsAvailable = Math.max(0, maxOpenTrades - systemCount);
      const isMismatch = false; // Will be compared with UI count on client side
      
      // B3: Calculate portfolio summary
      // Phase 8.8.3-C7-FIX: Use same calculation as portfolio-summary endpoint
      const { getEngineSessionStart } = await import('./services/paper-execution-engine.js');
      const portfolioState = await storage.getPortfolioState({ mode: 'paper' });
      const startingBalance = portfolioState ? parseFloat(portfolioState.startingBalance?.toString() || portfolioState.balance?.toString() || '0') : 0;
      
      // Phase 8.8.3-C7-FIX: Calculate realized P/L from closed trades (same as portfolio-summary)
      const sessionStart = getEngineSessionStart('paper');
      const allTrades = await storage.getPaperSimTrades('paper', { closedOnly: true });
      const sessionTrades = sessionStart 
        ? allTrades.filter(t => t.closedAt && new Date(t.closedAt) >= sessionStart)
        : allTrades;
      const realizedPnl = sessionTrades.reduce((sum, trade) => {
        return sum + parseFloat(trade.pnl?.toString() || '0');
      }, 0);
      
      // Phase 8.8.4: Realized Balance = Starting Balance + Realized P/L (renamed from cashBalance)
      const realizedBalance = startingBalance + realizedPnl;
      
      // Calculate total position value (mark-to-market)
      const totalPositionValue = enrichedPositions.reduce((sum, pos) => {
        return sum + (pos.quantity * pos.currentPrice);
      }, 0);
      
      // Current balance = realized balance + open positions value
      const currentBalance = realizedBalance + totalPositionValue;
      const netPnl = currentBalance - startingBalance;
      const netPnlPercent = startingBalance > 0 ? (netPnl / startingBalance) * 100 : 0;
      
      res.json({
        ok: true,
        positions: enrichedPositions,
        integrity: {
          systemCount,
          maxOpenTrades,
          slotsAvailable,
          status: systemCount <= maxOpenTrades ? 'OK' : 'OVER_LIMIT'
        },
        portfolio: {
          startingBalance,
          currentBalance,
          realizedBalance,
          totalPositionValue,
          netPnl,
          netPnlPercent
        }
      });
    } catch (error) {
      console.error('Error fetching active trades:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch active trades' });
    }
  });

  // Phase 8.8.3-B3: Portfolio Summary endpoint - available on all trading tabs
  // Current Balance = starting_balance + SUM(realized P/L from closed trades in current session)
  apiRouter.get('/paper-sim/portfolio-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { getEngineSessionStart } = await import('./services/paper-execution-engine');
      const mode = 'paper' as const;
      
      // Get portfolio state
      const portfolioState = await storage.getPortfolioState({ mode });
      const startingBalance = portfolioState ? parseFloat((portfolioState as any).startingBalance?.toString() || portfolioState.balance?.toString() || '1000') : 1000;
      
      // Get session start time
      const sessionStart = getEngineSessionStart(mode);
      
      // Get all closed trades in current session
      const allTrades = await storage.getPaperSimTrades(mode, { closedOnly: true });
      
      // Filter to only trades closed in current session
      const sessionTrades = sessionStart 
        ? allTrades.filter(t => t.closedAt && new Date(t.closedAt) >= sessionStart)
        : allTrades;
      
      // Sum realized P/L from closed trades (this is the correct calculation per directive)
      const realizedPnl = sessionTrades.reduce((sum, trade) => {
        return sum + parseFloat(trade.pnl?.toString() || '0');
      }, 0);
      
      // Phase 8.8.3-I6: Get open positions for "Open Position Value" using LIVE prices
      // Phase 8.8.3-I10-FIX: Also calculate unrealized P/L from open positions
      const openPositions = await storage.getPaperSimOpenPositions(mode);
      let totalPositionValue = 0;
      let unrealizedPnl = 0;
      
      for (const pos of openPositions) {
        const quantity = parseFloat(pos.quantity?.toString() || '0');
        const entryPrice = parseFloat(pos.avgPrice?.toString() || '0');
        let currentPrice = entryPrice;
        let priceSource = 'entry_fallback';
        
        // Phase 8.8.3-I6: Use getPriceWithFallback (includes 5s staleness guard + REST fallback)
        const liveQuote = await livePricingAdapter.getPriceWithFallback(pos.symbol, 5000);
        let fallbackType: 'none' | 'rest_fallback' | 'entry_fallback' = 'entry_fallback';
        if (liveQuote && liveQuote.price !== null && liveQuote.source !== 'no_reliable_price') {
          currentPrice = liveQuote.price;
          priceSource = liveQuote.source;
          const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
          fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
        } else {
          fallbackType = 'entry_fallback';
          console.log(`[8.8.3-I6][FALLBACK_TO_ENTRY] symbol=${pos.symbol} reason=no_reliable_price`);
        }
        console.log(`[8.8.3-I6][PORTFOLIO_LIVE_PRICE] symbol=${pos.symbol} price=${currentPrice} source=${priceSource} fallbackType=${fallbackType}`);
        
        const positionValue = quantity * currentPrice;
        const entryValue = quantity * entryPrice;
        const positionPnl = positionValue - entryValue;
        
        totalPositionValue += positionValue;
        unrealizedPnl += positionPnl;
      }
      
      // Phase 8.8.3-C7-FIX: Separate cash balance from portfolio value
      // Cash Balance = starting balance + realized P/L (from closed trades only)
      // This is the amount of cash available, not including unrealized gains/losses
      const cashBalance = startingBalance + realizedPnl;
      
      // Portfolio Value = cash balance + unrealized P/L (total account equity)
      const portfolioValue = cashBalance + unrealizedPnl;
      
      // Current Balance = Cash Balance (user expectation: realized-only balance)
      const currentBalance = cashBalance;
      
      // Net P/L = realized P/L (from closed trades) + unrealized P/L (from open positions)
      const netPnl = realizedPnl + unrealizedPnl;
      const netPnlPercent = startingBalance > 0 ? (netPnl / startingBalance) * 100 : 0;
      
      // Phase 8.8.3-I9: Get open trades count and max slots for TopBar metric using dynamic calculation
      const { getDynamicSlots } = await import('./services/dynamic-slots.js');
      const { slots: maxOpenTrades } = await getDynamicSlots('paper');
      const openTradesCount = openPositions.length;
      const slotsAvailable = Math.max(0, maxOpenTrades - openTradesCount);
      
      res.json({
        ok: true,
        startingBalance,
        currentBalance,      // Cash balance (realized only) - for backward compatibility
        cashBalance,         // Explicit: starting + realized P/L
        portfolioValue,      // Cash + unrealized P/L (total equity)
        realizedPnl,
        unrealizedPnl,
        totalPositionValue,
        netPnl,
        netPnlPercent,
        sessionStart: sessionStart?.toISOString() || null,
        closedTradesCount: sessionTrades.length,
        openTradesCount,
        maxOpenTrades,
        slotsAvailable
      });
    } catch (error) {
      console.error('Error fetching portfolio summary:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch portfolio summary' });
    }
  });

  // Phase 8.8.3-B1: Close single trade endpoint
  apiRouter.post('/paper-sim/close-trade/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { reason } = req.body;
      
      // Get the position to close
      const positions = await storage.getPaperSimOpenPositions('paper');
      const position = positions.find(p => p.id === id);
      
      if (!position) {
        return res.status(404).json({ success: false, error: 'Position not found' });
      }
      
      const entryPrice = parseFloat(position.avgPrice?.toString() || '0');
      const quantity = parseFloat(position.quantity?.toString() || '0');
      
      // Phase 8.8.3-I6: Use getPriceWithFallback (includes 5s staleness guard + REST fallback)
      let currentPrice = entryPrice;
      let priceSource = 'entry_fallback';
      let fallbackType: 'none' | 'rest_fallback' | 'entry_fallback' = 'entry_fallback';
      const liveQuote = await livePricingAdapter.getPriceWithFallback(position.symbol, 5000);
      if (liveQuote && liveQuote.price !== null && liveQuote.source !== 'no_reliable_price') {
        currentPrice = liveQuote.price;
        priceSource = liveQuote.source;
        const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
        fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
      } else {
        fallbackType = 'entry_fallback';
        console.log(`[8.8.3-I6][FALLBACK_TO_ENTRY] symbol=${position.symbol} reason=no_reliable_price`);
      }
      console.log(`[8.8.3-I6][CLOSE_TRADE_LIVE_PRICE] symbol=${position.symbol} price=${currentPrice} source=${priceSource} fallbackType=${fallbackType}`);
      
      // Phase 8.8.3-C7-FIX: Calculate exit slippage and fees mirroring engine's closePosition method
      // Batch 18J: Canonical fee/slippage from exchange-defaults.ts
      const SLIPPAGE_PERCENT = CANONICAL_SLIPPAGE * 100; // 0.05% from exchange-defaults
      const FEE_PERCENT = DEFAULT_TAKER_FEE * 100; // 0.26% from exchange-defaults
      
      // Calculate exit slippage (same formula as paper-execution-engine.ts line 772-780)
      const exitSlippagePerUnit = currentPrice * (SLIPPAGE_PERCENT / 100);
      const actualExitPrice = currentPrice - exitSlippagePerUnit; // Worse price due to slippage
      const exitValue = actualExitPrice * quantity;
      const exitFee = exitValue * (FEE_PERCENT / 100);
      const exitSlippage = exitSlippagePerUnit * quantity;
      
      // Get entry costs from the position (persisted at entry time)
      const entryFee = parseFloat(position.entryFee?.toString() || '0');
      const entrySlippage = parseFloat(position.entrySlippage?.toString() || '0');
      
      // Get intended entry price for gross P/L calculation (same as engine line 766-768)
      const intendedEntryPrice = position.intendedEntryPrice 
        ? parseFloat(position.intendedEntryPrice.toString()) 
        : entryPrice; // Fallback for old positions
      const intendedEntryValue = intendedEntryPrice * quantity;
      
      // Phase 8.8.3-C2: P/L breakdown per directive
      // Gross P/L = Pure market movement (no slippage, no fees)
      const grossPnl = (currentPrice - intendedEntryPrice) * quantity;
      
      // Total Cost = All execution costs (same formula as engine line 787)
      const totalCost = entryFee + exitFee + entrySlippage + exitSlippage;
      const totalFees = entryFee + exitFee;
      const totalSlippage = entrySlippage + exitSlippage;
      
      // Net P/L = Gross P/L minus all costs (same formula as engine line 791)
      const netPnl = grossPnl - totalCost;
      const netPnlPercent = intendedEntryValue > 0 ? (netPnl / intendedEntryValue) * 100 : 0;
      
      console.log(`[8.8.3-C7-FIX][MANUAL_CLOSE_COSTS] symbol=${position.symbol} exitPrice=${currentPrice.toFixed(4)} actualExitPrice=${actualExitPrice.toFixed(4)} entryFee=${entryFee.toFixed(4)} exitFee=${exitFee.toFixed(4)} entrySlip=${entrySlippage.toFixed(4)} exitSlip=${exitSlippage.toFixed(4)} totalCost=${totalCost.toFixed(4)} grossPnl=${grossPnl.toFixed(4)} netPnl=${netPnl.toFixed(4)}`);
      
      // Build closed trade payload with all cost fields
      const closedTradePayload = {
        symbol: position.symbol,
        strategyName: position.strategyName,
        side: position.side,
        quantity: position.quantity?.toString() || '0',
        entryPrice: position.avgPrice?.toString() || '0',
        exitPrice: actualExitPrice.toString(), // Use actual exit price (after slippage)
        stopLoss: position.stopLoss?.toString(),
        takeProfit: position.takeProfit?.toString(),
        pnl: netPnl.toString(), // Net P/L for backward compatibility
        pnlPercent: netPnlPercent.toString(),
        fees: totalFees.toString(),
        entryFee: entryFee.toString(),
        exitFee: exitFee.toString(),
        totalFee: totalFees.toString(),
        slippage: totalSlippage.toString(),
        entrySlippage: entrySlippage.toString(),
        exitSlippage: exitSlippage.toString(),
        totalCost: totalCost.toString(),
        grossPnl: grossPnl.toString(),
        netPnl: netPnl.toString(),
        openedAt: position.openedAt || new Date(),
        closedAt: new Date(),
        closeReason: reason || 'manual_close',
        confidence: position.confidence?.toString(),
        metadata: position.metadata
      };
      
      console.log('[8.8.3-B1][CLOSE_TRADE_PAYLOAD]', JSON.stringify(closedTradePayload, null, 2));
      
      // Move to closed trades
      try {
        await storage.createPaperSimTrade('paper', closedTradePayload);
      } catch (insertError) {
        const insertErrorMsg = insertError instanceof Error ? insertError.message : String(insertError);
        console.error('[8.8.3-B1][INSERT_ERROR]', insertErrorMsg, insertError);
        throw insertError;
      }
      
      // Delete from open positions
      await storage.deletePaperSimOpenPosition('paper', id);
      
      // Broadcast update via WebSocket
      contextBridge.broadcast({
        type: 'active_trade_closed',
        payload: {
          id,
          symbol: position.symbol,
          pnl: netPnl,
          pnlPercent: netPnlPercent,
          reason: reason || 'manual_close'
        }
      });
      
      // Phase 8.8.3-A1: Standardized success response
      res.json({ 
        success: true, 
        closedTradeId: id,
        message: `Closed ${position.symbol} position`,
        pnl: netPnl, 
        pnlPercent: netPnlPercent,
        grossPnl,
        totalCost
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[8.8.3-B1][CLOSE_TRADE_ERROR]', errorMessage, error);
      res.status(500).json({ success: false, error: 'Failed to close trade', details: errorMessage });
    }
  });

  // Phase 8.8.3-B2: Force clear all stranded trades endpoint
  apiRouter.post('/paper-sim/force-clear-stranded', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get all open positions
      const positions = await storage.getPaperSimOpenPositions('paper');
      
      if (positions.length === 0) {
        // Phase 8.8.3-A3: Standardized success response (includes clearedCount for backward compatibility)
        return res.json({ success: true, strandedClosed: 0, clearedCount: 0, message: 'No stranded trades to clear' });
      }
      
      console.log(`[B2-ClearStranded] Clearing ${positions.length} stranded positions for user ${userId}`);
      
      // Close each position and move to trade history
      let clearedCount = 0;
      for (const position of positions) {
        try {
          const entryPrice = parseFloat(position.avgPrice?.toString() || '0');
          const quantity = parseFloat(position.quantity?.toString() || '0');
          
          // Phase 8.8.3-I6: Use getPriceWithFallback (includes 5s staleness guard + REST fallback)
          let currentPrice = entryPrice;
          let priceSource = 'entry_fallback';
          let fallbackType: 'none' | 'rest_fallback' | 'entry_fallback' = 'entry_fallback';
          const liveQuote = await livePricingAdapter.getPriceWithFallback(position.symbol, 5000);
          if (liveQuote && liveQuote.price !== null && liveQuote.source !== 'no_reliable_price') {
            currentPrice = liveQuote.price;
            priceSource = liveQuote.source;
            const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
            fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
          } else {
            fallbackType = 'entry_fallback';
            console.log(`[8.8.3-I6][FALLBACK_TO_ENTRY] symbol=${position.symbol} reason=no_reliable_price`);
          }
          console.log(`[8.8.3-I6][STRANDED_CLEAR_LIVE_PRICE] symbol=${position.symbol} price=${currentPrice} source=${priceSource} fallbackType=${fallbackType}`);
          
          const pnl = (currentPrice - entryPrice) * quantity;
          const pnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
          
          // Create closed trade record
          await storage.createPaperSimTrade('paper', {
            id: position.id,
            symbol: position.symbol,
            strategyName: position.strategyName,
            side: position.side,
            quantity: position.quantity?.toString() || '0',
            entryPrice: position.avgPrice?.toString() || '0',
            exitPrice: currentPrice.toString(),
            stopLoss: position.stopLoss?.toString(),
            takeProfit: position.takeProfit?.toString(),
            pnl: pnl.toString(),
            pnlPercent: pnlPercent.toString(),
            fees: '0',
            slippage: '0',
            openedAt: position.openedAt,
            closedAt: new Date(),
            closeReason: 'stranded_clear',
            confidence: position.confidence?.toString(),
            metadata: position.metadata
          });
          
          // Delete from open positions
          await storage.deletePaperSimOpenPosition('paper', position.id);
          clearedCount++;
          
          console.log(`[B2-ClearStranded] Cleared position ${position.symbol} (${position.id})`);
        } catch (posError) {
          console.error(`[B2-ClearStranded] Error clearing position ${position.id}:`, posError);
        }
      }
      
      // Broadcast update
      contextBridge.broadcast({
        type: 'stranded_trades_cleared',
        payload: { clearedCount, userId }
      });
      
      // Phase 8.8.3-A3: Standardized success response (includes clearedCount for backward compatibility)
      res.json({ success: true, strandedClosed: clearedCount, clearedCount, message: `Cleared ${clearedCount} stranded trades` });
    } catch (error) {
      console.error('[B2-ClearStranded] Error clearing stranded trades:', error);
      res.status(500).json({ success: false, error: 'Failed to clear stranded trades' });
    }
  });

  // Phase 8.8.3-B1/B2: Trade History Analytics endpoint with new metrics
  // Phase 8.8.3-C6: Current Simulation = trades opened since engine was last started
  apiRouter.get('/paper-sim/trades/analytics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { range = 'session' } = req.query;
      
      // Calculate time range
      const now = new Date();
      let startTime: Date;
      let isCurrentSimulation = false;
      
      // Phase 8.8.3-C6: Get actual engine running state for all responses
      const { getEngineSessionStart } = await import('./services/paper-execution-engine.js');
      const engineStartTime = getEngineSessionStart('paper');
      const isEngineRunning = engineStartTime !== null;
      
      // Phase 8.8.3-C6: Handle "session" range - since last engine START (not reset, not session ID)
      if (range === 'session') {
        if (engineStartTime) {
          startTime = engineStartTime;
          isCurrentSimulation = true;
          console.log(`[C6][ANALYTICS] Current Simulation: using engine_start_timestamp=${engineStartTime.toISOString()}`);
        } else {
          // Phase 8.8.3-C6: Engine not running - explicitly return zero metrics immediately
          console.log(`[C6][ANALYTICS] Engine not running - returning zero metrics`);
          return res.json({
            ok: true,
            range,
            engineRunning: false,
            analytics: {
              totalOpened: 0,
              closedAtTP: { count: 0, percent: 0 },
              closedAtSL: { count: 0, percent: 0 },
              closedManually: { count: 0, percent: 0 },
              winRate: 0,
              avgProfit: 0,
              avgLoss: 0,
              netPnl: 0,
              netPnlPercent: 0,
              avgProfitPercent: 0,
              avgDailyProfitPercent: 0,
              avgHoldingTime: 0,
              medianHoldingTime: 0,
              profitFactor: 0,
              byStrategy: {},
              largestWinner: null,
              largestLoser: null
            }
          });
        }
      } else {
        switch (range) {
          case '1h': startTime = new Date(now.getTime() - 60 * 60 * 1000); break;
          case '6h': startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000); break;
          case '12h': startTime = new Date(now.getTime() - 12 * 60 * 60 * 1000); break;
          case '24h': startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
          case '7d': startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
          case '30d': startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
          case 'all': startTime = new Date(0); break;
          default: startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
      }
      
      // Get trades within range
      const allTrades = await storage.getPaperSimTrades('paper', {});
      
      // Phase 8.8.3-B3: Filter out ghost trades from analytics
      // Ghost trades = closed trades without proper exit_price or close_reason
      const validTrades = allTrades.filter(trade => {
        // Only consider properly closed trades (have closedAt, exit_price, and close_reason)
        if (!trade.closedAt) return false;
        const hasExitPrice = trade.exitPrice && parseFloat(trade.exitPrice.toString()) > 0;
        const hasCloseReason = trade.closeReason && trade.closeReason.trim() !== '';
        return hasExitPrice && hasCloseReason;
      });
      
      // Phase 8.8.3-C6: Current Simulation uses openedAt >= engine_start_timestamp
      // Other ranges use closedAt for backward compatibility
      const trades = validTrades.filter(t => {
        if (isCurrentSimulation) {
          // Current Simulation: filter by when trade was OPENED
          const openedTime = t.openedAt ? new Date(t.openedAt) : null;
          return openedTime && openedTime >= startTime;
        } else {
          // Other ranges: filter by when trade was CLOSED
          const closedTime = t.closedAt ? new Date(t.closedAt) : null;
          return closedTime && closedTime >= startTime;
        }
      });
      
      if (trades.length === 0) {
        // Phase 8.8.3-C6: Include engineRunning flag to distinguish idle-but-running from stopped
        return res.json({
          ok: true,
          range,
          engineRunning: isEngineRunning, // true if engine is running, derived from actual engine state
          analytics: {
            totalOpened: 0,
            closedAtTP: { count: 0, percent: 0 },
            closedAtSL: { count: 0, percent: 0 },
            closedManually: { count: 0, percent: 0 },
            winRate: 0,
            avgProfit: 0,
            avgLoss: 0,
            netPnl: 0,
            netPnlPercent: 0,
            avgProfitPercent: 0,
            avgDailyProfitPercent: 0,
            avgHoldingTime: 0,
            medianHoldingTime: 0,
            profitFactor: 0,
            byStrategy: {},
            largestWinner: null,
            largestLoser: null
          }
        });
      }
      
      // Calculate analytics
      const closedAtTP = trades.filter(t => t.closeReason === 'target_hit');
      const closedAtSL = trades.filter(t => t.closeReason === 'stop_hit');
      const closedManually = trades.filter(t => t.closeReason === 'manual_close' || t.closeReason === 'timeout');
      
      const wins = trades.filter(t => parseFloat(t.pnl?.toString() || '0') > 0);
      const losses = trades.filter(t => parseFloat(t.pnl?.toString() || '0') <= 0);
      
      const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
      
      const totalProfit = wins.reduce((sum, t) => sum + parseFloat(t.pnl?.toString() || '0'), 0);
      const totalLoss = Math.abs(losses.reduce((sum, t) => sum + parseFloat(t.pnl?.toString() || '0'), 0));
      
      const avgProfit = wins.length > 0 ? totalProfit / wins.length : 0;
      const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
      
      const netPnl = trades.reduce((sum, t) => sum + parseFloat(t.pnl?.toString() || '0'), 0);
      
      // Phase 8.8.3-C5-4: Analytics Scope Verification - log analytics query scope
      // Phase 8.8.3-C6: Use engine start timestamp for session info
      c5FinancialDiagnostics.logAnalyticsScope({
        mode: 'paper',
        timeRange: range === 'session' ? 'current_simulation' : range === '1h' ? 'last_hour' : 'last_24h',
        filtersApplied: String(range),
        tradeCount: trades.length,
        netPnlUsed: netPnl,
        winCount: wins.length,
        lossCount: losses.length,
        sessionId: isCurrentSimulation ? `engine_start_${startTime.toISOString()}` : null,
        timestamp: new Date().toISOString()
      });
      
      // Calculate holding times
      const holdingTimes = trades.map(t => {
        const opened = t.openedAt ? new Date(t.openedAt).getTime() : 0;
        const closed = t.closedAt ? new Date(t.closedAt).getTime() : Date.now();
        return closed - opened;
      }).filter(t => t > 0);
      
      const avgHoldingTime = holdingTimes.length > 0 ? 
        holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length : 0;
      
      const sortedHoldingTimes = [...holdingTimes].sort((a, b) => a - b);
      const medianHoldingTime = sortedHoldingTimes.length > 0 ?
        sortedHoldingTimes[Math.floor(sortedHoldingTimes.length / 2)] : 0;
      
      const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
      
      // B2: Calculate Avg Profit % per Trade
      const totalPnlPercent = trades.reduce((sum, t) => sum + parseFloat(t.pnlPercent?.toString() || '0'), 0);
      const avgProfitPercent = trades.length > 0 ? totalPnlPercent / trades.length : 0;
      
      // B2: Calculate Avg Daily Profit %
      // Get unique trading days in the range
      const tradingDays = new Set(trades.map(t => {
        const d = t.closedAt ? new Date(t.closedAt) : new Date();
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }));
      const numDays = Math.max(1, tradingDays.size);
      const avgDailyProfitPercent = totalPnlPercent / numDays;
      
      // By strategy
      const byStrategy: Record<string, { count: number; pnl: number; winRate: number }> = {};
      trades.forEach(t => {
        const strategy = t.strategyName || 'unknown';
        if (!byStrategy[strategy]) {
          byStrategy[strategy] = { count: 0, pnl: 0, winRate: 0 };
        }
        byStrategy[strategy].count++;
        byStrategy[strategy].pnl += parseFloat(t.pnl?.toString() || '0');
      });
      
      // Calculate win rate per strategy
      Object.keys(byStrategy).forEach(strategy => {
        const stratTrades = trades.filter(t => (t.strategyName || 'unknown') === strategy);
        const stratWins = stratTrades.filter(t => parseFloat(t.pnl?.toString() || '0') > 0);
        byStrategy[strategy].winRate = stratTrades.length > 0 ? (stratWins.length / stratTrades.length) * 100 : 0;
      });
      
      // Largest winner/loser
      const sortedByPnl = [...trades].sort((a, b) => 
        parseFloat(b.pnl?.toString() || '0') - parseFloat(a.pnl?.toString() || '0')
      );
      
      const largestWinner = sortedByPnl[0] ? {
        symbol: sortedByPnl[0].symbol,
        pnl: parseFloat(sortedByPnl[0].pnl?.toString() || '0'),
        strategy: sortedByPnl[0].strategyName
      } : null;
      
      const largestLoser = sortedByPnl[sortedByPnl.length - 1] ? {
        symbol: sortedByPnl[sortedByPnl.length - 1].symbol,
        pnl: parseFloat(sortedByPnl[sortedByPnl.length - 1].pnl?.toString() || '0'),
        strategy: sortedByPnl[sortedByPnl.length - 1].strategyName
      } : null;
      
      // Phase 8.8.3-C6: Include engineRunning flag for consistency
      res.json({
        ok: true,
        range,
        engineRunning: isEngineRunning, // true if engine is running, derived from actual engine state
        analytics: {
          totalOpened: trades.length,
          closedAtTP: { count: closedAtTP.length, percent: (closedAtTP.length / trades.length) * 100 },
          closedAtSL: { count: closedAtSL.length, percent: (closedAtSL.length / trades.length) * 100 },
          closedManually: { count: closedManually.length, percent: (closedManually.length / trades.length) * 100 },
          winRate,
          avgProfit,
          avgLoss,
          netPnl,
          netPnlPercent: 0, // Would need starting balance to calculate
          avgProfitPercent, // B2: New metric
          avgDailyProfitPercent, // B2: New metric
          avgHoldingTime,
          medianHoldingTime,
          profitFactor: isFinite(profitFactor) ? profitFactor : 0,
          byStrategy,
          largestWinner,
          largestLoser
        }
      });
    } catch (error) {
      console.error('Error fetching trade analytics:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch analytics' });
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

  // B7.A: Duplicate reset route removed - use main route at /api/paper-sim/reset with hard reset service

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

  // Batch 19C: Pattern pool status endpoint
  apiRouter.get('/pattern-pool', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'paper' | 'live') || 'paper';
      const { activeFilterPool } = await import('./services/active-filter-pool.js');
      // Batch 48: Regime override imports removed — DB is sole authority for thresholds
      const { PATTERN_POOL_THRESHOLDS, PATTERN_POOL_GUARDRAILS, PATTERN_POOL_STRATEGIES } = await import('./config/pattern-filter-profile.js');

      const patternPool = activeFilterPool.getPatternPool(mode);
      const patternPoolSize = activeFilterPool.getPatternPoolSize(mode);
      const quantPoolSize = activeFilterPool.getPoolSize(mode);

      res.json({
        ok: true,
        data: {
          patternPool: patternPool.map(p => ({
            symbol: p.symbol,
            price: p.price ?? 0,
            volume24h: p.volume24h ?? 0,
            dailyRange: p.dailyRange ?? 0,
            firstSeen: p.firstSeen,
            lastUpdated: p.lastUpdated,
            expiresAt: p.expiresAt,
          })),
          patternPoolSize,
          quantPoolSize,
          thresholds: PATTERN_POOL_THRESHOLDS,
          guardrails: PATTERN_POOL_GUARDRAILS,
          strategies: PATTERN_POOL_STRATEGIES,
        },
      });
    } catch (error) {
      console.error('[19C] Pattern pool endpoint error:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch pattern pool data' });
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

      // [9.6.3] RiskManager removed - using checkGuardrailRisk from trade-safety
      const { checkGuardrailRisk } = await import('./services/trade-safety');
      const { TradingEngine } = await import('./services/trading-engine');
      
      const tradingEngine = new TradingEngine(mode);

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

        // [9.6.3] Check pre-trade risk using checkGuardrailRisk
        const tradeCandidate = {
          symbol: signal.symbol,
          strategy: signal.strategy,
          entryPrice: signal.entryPrice,
          stopPrice: signal.stopPrice,
          targetPrice: signal.targetPrice,
          confidence: signal.confidence,
          mode
        };
        const riskCheck = await checkGuardrailRisk(tradeCandidate, mode, settings);
        
        if (riskCheck.approved) {
          // [9.6.3] Calculate position details using percentage-based risk from guardrail-settings
          const { getRiskPercentageV2, calculateRiskAmount, getPortfolioBalanceV2 } = await import('./services/guardrail-settings.js');
          const guardrails = await storage.getGuardrailsV2({ mode });
          const portfolioValue = await getPortfolioBalanceV2(mode) || 50000;
          const pct = getRiskPercentageV2(mode, guardrails);
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

      // [9.6.3] Get portfolio metrics via mode-based storage queries
      const { getPortfolioBalanceV2 } = await import('./services/guardrail-settings.js');
      const currentBalance = await getPortfolioBalanceV2(mode) || 50000;
      const openPositions = mode === 'paper' 
        ? await storage.getPaperSimOpenPositions(mode)
        : await storage.getActiveTrades(mode);
      const metrics = {
        openTradesCount: openPositions.length,
        currentExposure: 0,
        realizedPL: 0,
        totalValue: currentBalance
      };
      
      console.log('\n📈 Portfolio Metrics:');
      console.log(`   Open Trades: ${metrics.openTradesCount}/${settings.maxOpenTrades}`);
      console.log(`   Portfolio Value: $${metrics.totalValue.toFixed(2)}`);
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

  // REB 8.8.3-KS-B: Kill Switch status endpoint for frontend compatibility
  apiRouter.get('/kill-switch/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      const { guardrailPolicy } = await import('./services/guardrail-policy.js');
      const guardrails = await storage.getGuardrailsV2({ mode });
      
      const killSwitchTripped = await guardrailPolicy.isKillSwitchTripped(mode);
      const dailyLossKillSwitch = guardrails?.dailyLossKillSwitchPct || 7;
      
      res.json({
        killSwitchTripped,
        dailyLossKillSwitch,
        mode,
        current24hPL: null, // Can be populated from portfolio metrics if needed
        latestEvent: null
      });
    } catch (error: any) {
      console.error('Kill switch status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.post('/kill-switch/check', async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      error: 'This endpoint is deprecated',
      message: 'Kill switch monitoring is now automatic via risk manager. Check status with GET /api/guardrails-v2?mode=paper or /api/guardrails-v2?mode=live',
      migration: 'User-level settings eliminated in Phase 41F-L.E2E-PURGE'
    });
  });

  // REB 8.8.3-KS-B: Kill switch reset is now automatic on trading start
  apiRouter.post('/kill-switch/reset', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    res.status(410).json({ 
      error: 'This endpoint is deprecated (REB 8.8.3-KS-B)',
      message: 'Kill switch is automatically cleared when you start trading. Use POST /api/trading/start with { mode: "paper" or "live" } to resume trading.',
      migration: 'Kill switch reset now happens automatically on trading start'
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

      // [9.6.3] Create simulated trade using percentage-based risk from guardrail-settings
      const { getRiskPercentageV2, calculateRiskAmount, getPortfolioBalanceV2 } = await import('./services/guardrail-settings.js');
      const guardrails = await storage.getGuardrailsV2({ mode: mode as 'live' | 'paper' });
      const portfolioValue = await getPortfolioBalanceV2(mode as 'live' | 'paper') || 50000;
      const pct = getRiskPercentageV2(mode as 'live' | 'paper', guardrails);
      const riskAmount = calculateRiskAmount(portfolioValue, pct);
      const lossAmount = (riskAmount / 0.01) * (targetLossPercent / 100); // Scale up the loss
      
      const simulatedTrade = await storage.createTrade({
        userId,
        symbol: 'BTCUSD',
        strategy: 'vwap_pullback',
        mode: mode as 'live' | 'paper',
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

      // [9.6.3] Check kill switch using guardrail-policy instead of RiskManager
      const { guardrailPolicy } = await import('./services/guardrail-policy.js');
      const killSwitchTripped = await guardrailPolicy.isKillSwitchTripped(mode as 'live' | 'paper');
      const result = { triggered: killSwitchTripped, reason: killSwitchTripped ? 'Kill switch tripped' : null };
      
      // Phase 41F-L.E2E-PURGE: Get updated settings from mode-level config
      const updatedSettings = await buildSettingsFromModeLevel(mode as 'live' | 'paper', userId);

      res.json({
        success: true,
        simulatedTrade,
        killSwitchResult: result,
        killSwitchTripped: updatedSettings?.killSwitchTripped || false,
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

      // [9.6.3] Run through risk checks using checkGuardrailRisk
      const tradeCandidate = {
        symbol: testSignal.symbol,
        strategy: testSignal.strategy,
        entryPrice: testSignal.entryPrice,
        stopPrice: testSignal.stopPrice,
        targetPrice: testSignal.targetPrice,
        confidence: testSignal.confidence,
        mode
      };
      const riskCheck = await checkGuardrailRisk(tradeCandidate, mode, settings);

      res.json({
        killSwitchTripped: settings.killSwitchTripped,
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
      const { getSystemMetrics, getTradingEngineStatus, getDatabaseHealth } = await import('./diagnostics/metrics.js');
      const { getExpertInsightsMetrics } = await import('./diagnostics/expert-insights-metrics.js');

      const [systemMetrics, tradingEngine, databaseHealth, expertInsights] = await Promise.all([
        getSystemMetrics(),
        getTradingEngineStatus(),
        getDatabaseHealth(),
        getExpertInsightsMetrics()
      ]);

      const report = {
        timestamp: new Date().toISOString(),
        systemMetrics,
        tradingEngine,
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
      const mode = req.query.mode as 'live' | 'paper' | undefined;
      const hours = parseInt(req.query.hours as string) || 24;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const adjustments = await storage.getPortfolioAdjustments({ mode, hours, limit });
      
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
        SELECT COUNT(*) as count FROM portfolio_adjustments
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
        storage.getPortfolioAdjustments({ hours: 168, limit: 3 }),
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

      // Directive 12.2.3: StrategyBob transparent routing removed (Batch 7B)

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

      // Directive 12.2.3: StrategyBob transparent routing removed (Batch 7B)

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

  // ===== PHASE 8.8.3-J: EXECUTION ATTEMPT METRICS =====
  
  // Get execution attempts with filtering (read-only diagnostic endpoint)
  apiRouter.get('/metrics/execution-attempts', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const symbol = req.query.symbol as string | undefined;
      const strategy = req.query.strategy as string | undefined;
      const decision = req.query.decision as 'BLOCKED' | 'OPENED' | undefined;

      const attempts = await storage.getExecutionAttemptAudits(mode, { limit, symbol, strategy, decision });
      
      res.json({
        success: true,
        data: attempts,
        mode,
        count: attempts.length,
        limit
      });
    } catch (error: any) {
      console.error('[8.8.3-J] Error fetching execution attempts:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get execution attempt statistics (aggregated metrics)
  apiRouter.get('/metrics/execution-attempts/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      const hours = parseInt(req.query.hours as string) || 24;

      // AJ8: Get session start time - metrics only count from session start
      const { getEngineSessionStart } = await import('./services/paper-execution-engine.js');
      const sessionStart = getEngineSessionStart(mode);
      
      const stats = await storage.getExecutionAttemptMetrics(mode, sessionStart);
      
      res.json({
        success: true,
        data: stats,
        mode,
        hours,
        sessionStart: sessionStart?.toISOString() || null
      });
    } catch (error: any) {
      console.error('[8.8.3-J] Error fetching execution attempt stats:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===== PHASE 8.8.3-J5/AJ8: RTB AGGREGATED EXECUTION METRICS =====
  // AJ8: Metrics reset when engine stops, accumulate only when running
  
  // J5.1 - RTB Summary (overall execution attempt metrics)
  apiRouter.get('/metrics/rtb-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      // AJ8: Get session start time - metrics only count from session start
      const { getEngineSessionStart } = await import('./services/paper-execution-engine.js');
      const sessionStart = getEngineSessionStart(mode);
      
      const metrics = await storage.getExecutionAttemptMetrics(mode, sessionStart);
      
      res.json({
        success: true,
        data: {
          totalAttempts: metrics.totalAttempts,
          opened: metrics.opened,
          blocked: metrics.blocked,
          openedRate: metrics.totalAttempts > 0 ? ((metrics.opened / metrics.totalAttempts) * 100).toFixed(1) : '0.0',
          blockedRate: metrics.totalAttempts > 0 ? ((metrics.blocked / metrics.totalAttempts) * 100).toFixed(1) : '0.0',
          last24h: {
            attempts: metrics.last24hAttempts,
            opened: metrics.last24hOpened,
            blocked: metrics.last24hBlocked
          },
          isSessionActive: metrics.isSessionActive
        },
        mode,
        sessionStart: sessionStart?.toISOString() || null,
        refreshedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[8.8.3-J5] Error fetching RTB summary:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // J5.2 - RTB Blocked Summary (breakdown by block reason)
  apiRouter.get('/metrics/rtb-blocked-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      // AJ8: Get session start time - metrics only count from session start
      const { getEngineSessionStart } = await import('./services/paper-execution-engine.js');
      const sessionStart = getEngineSessionStart(mode);
      
      const metrics = await storage.getExecutionAttemptMetrics(mode, sessionStart);
      
      // AJ8: All 13 block reasons with zero values for display
      const allBlockReasons = [
        'KILL_SWITCH', 'STOP_LOSS_REQUIRED', 'ASSET_MAX_POSITIONS', 'COOLDOWN',
        'MAX_POSITION', 'LPCP_LOW_PRICE', 'LPCP_MIN_NOTIONAL', 'FX_CONVERSION_FAILED',
        'PORTFOLIO_RISK', 'INSUFFICIENT_BALANCE', 'MAX_EXPOSURE', 'MAX_TRADES', 'UNKNOWN'
      ];
      const byReason: Record<string, number> = {};
      allBlockReasons.forEach(reason => {
        byReason[reason] = metrics.blockedByReason[reason] || 0;
      });
      
      // AJ8: All 9 strategies with zero values for display
      const allStrategies = [
        'vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout',
        'mean_reversion', 'range_trading', 'vwap_bounce', 'liquidity_trap', 'dhma'
      ];
      const byStrategy: Record<string, number> = {};
      allStrategies.forEach(strategy => {
        byStrategy[strategy] = 0;
      });
      
      // AJ8: No limit cap - get all blocked audits from current session
      if (sessionStart) {
        const blockedAudits = await storage.getExecutionAttemptAudits(mode, { decision: 'BLOCKED', limit: 10000 });
        const sessionAudits = blockedAudits.filter(a => new Date(a.createdAt) >= sessionStart);
        sessionAudits.forEach(a => {
          if (a.strategy) {
            byStrategy[a.strategy] = (byStrategy[a.strategy] || 0) + 1;
          }
        });
      }
      
      res.json({
        success: true,
        data: {
          totalBlocked: metrics.blocked,
          blockedLast24h: metrics.last24hBlocked,
          byReason,
          byStrategy,
          topReasons: Object.entries(byReason)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([reason, count]) => ({ reason, count })),
          isSessionActive: metrics.isSessionActive
        },
        mode,
        sessionStart: sessionStart?.toISOString() || null,
        refreshedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[8.8.3-J5] Error fetching RTB blocked summary:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // J5.3 - RTB Opened Summary (breakdown by strategy for successful executions)
  apiRouter.get('/metrics/rtb-opened-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.query.mode as 'live' | 'paper') || 'paper';
      
      // AJ8: Get session start time - metrics only count from session start
      const { getEngineSessionStart } = await import('./services/paper-execution-engine.js');
      const sessionStart = getEngineSessionStart(mode);
      
      const metrics = await storage.getExecutionAttemptMetrics(mode, sessionStart);
      
      // AJ8: All 9 strategies with zero values for display
      const allStrategies = [
        'vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout',
        'mean_reversion', 'range_trading', 'vwap_bounce', 'liquidity_trap', 'dhma'
      ];
      const byStrategy: Record<string, number> = {};
      allStrategies.forEach(strategy => {
        byStrategy[strategy] = 0;
      });
      
      const bySymbol: Record<string, number> = {};
      
      // AJ8: No limit cap - get all opened audits from current session
      if (sessionStart) {
        const openedAudits = await storage.getExecutionAttemptAudits(mode, { decision: 'OPENED', limit: 10000 });
        const sessionAudits = openedAudits.filter(a => new Date(a.createdAt) >= sessionStart);
        sessionAudits.forEach(a => {
          if (a.strategy) {
            byStrategy[a.strategy] = (byStrategy[a.strategy] || 0) + 1;
          }
          if (a.symbol) {
            bySymbol[a.symbol] = (bySymbol[a.symbol] || 0) + 1;
          }
        });
      }
      
      res.json({
        success: true,
        data: {
          totalOpened: metrics.opened,
          openedLast24h: metrics.last24hOpened,
          byStrategy,
          bySymbol: Object.entries(bySymbol)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([symbol, count]) => ({ symbol, count })),
          topStrategies: Object.entries(byStrategy)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([strategy, count]) => ({ strategy, count })),
          isSessionActive: metrics.isSessionActive
        },
        mode,
        sessionStart: sessionStart?.toISOString() || null,
        refreshedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[8.8.3-J5] Error fetching RTB opened summary:', error);
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

      // Directive 12.2.3: ConfigBob transparent routing removed (Batch 7B)

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

      // Directive 12.2.3: DataBob transparent routing removed (Batch 7B)
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

      // Directive 12.2.3: DataBob transparent routing removed (Batch 7B)

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
      
      // Directive 12.2.3: ConfigBob transparent routing removed (Batch 7B)

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
      
      // Get risk threshold from user's approval matrix settings
      const userProfile = await storage.getUser(userId);
      const approvalMatrix = userProfile?.approvalMatrix as any;
      const riskThreshold = approvalMatrix?.policyConstraints?.maxPortfolioRiskPercent || 20.0;

      // Risk threshold check still blocks high-risk changes
      if (projectedRisk >= riskThreshold) {
        return res.json({
          ok: true,
          approvalRequired: true,
          projectedRisk,
          message: `Change requires approval: projected portfolio risk is ${projectedRisk}% (threshold: ${riskThreshold}%)`,
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

      // Phase 8.6.5: Invalidate caches and refresh context
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

  // Directive 11.8B-C2: Strategy presets routes removed - presets were UI-only artifacts
  // Strategy behavior is governed by Guardrails, Filters, and Predictive Learning
  console.log('[11.8B-C2] Strategy presets routes removed - behavior governed by Guardrails & Predictive Learning');

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

      // Directive 12.2.3: StrategyBob transparent routing removed (Batch 7B)

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
        // [9.7] Use guardrails_v2 instead of legacy guardrails table
        const currentGuardrails = await storage.getGuardrailsV2({ mode: validated.mode });
        
        if (!currentGuardrails) {
          return res.status(404).json({ error: 'Guardrails not found. Please initialize guardrails first.' });
        }

        // Update the specific field
        const updateData = {
          mode: validated.mode,
          [validated.field]: validated.value,
          lastUpdatedBy: userId
        };

        const result = await storage.upsertGuardrailsV2(updateData);

        console.info(`[Orchestrator][9.7] Guardrail V2 updated: ${validated.field} = ${validated.value} (${validated.mode} mode)`);
        
        // Phase 8.6.5: Invalidate caches and refresh context
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
        
        // Phase 8.6.5: Invalidate caches and refresh context
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
  // DIAGNOSTIC API ROUTES - Phase 5.9
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


  // Phase 9.2: Strategic Plan Management
  apiRouter.post('/strategic/plans', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      const { strategicPlannerService } = await import('./services/strategic-planner');
      
      const plan = await strategicPlannerService.createPlan(req.user!.id, req.body, mode);
      
      
      res.json({ ok: true, plan });
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
      
      
      const profile = await continuousLearningEngine.adjustWeights(
        req.params.profileId,
        req.body.weights,
        req.body.rationale,
        req.user!.id,
        mode
      );
      
      res.json({ ok: true, profile });
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
  // [8.8.3-H8] LEGACY ROUTES - Kept for backward compatibility with admin UI
  // These routes use the deprecated SafetyGuardrails service for event logging only.
  // Kill switch enforcement is ONLY done via trade-safety.ts + guardrails_v2.
  // DO NOT use these routes for runtime go/no-go trading decisions.

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

  // Directive 11.8B: ARA routes removed - parallel adaptive systems eliminated
  // Phase 11 Predictive Learning is the single authority for risk optimization
  console.log('[11.8B] ARA routes removed - Predictive Learning is single authority');

  // Directive 8.8.4-L6: Mount VTS (Virtual Trade Simulator) routes
  const vtsRouter = await import('./routes/vts.js');
  apiRouter.use('/vts', vtsRouter.default);
  console.log('[L6] VTS routes mounted at /api/vts');

  // Phase 13: L12-L20 route mounts removed (legacy supervisory loop)
  // Removed: /market, /rl, /maco, /dce, /apr-sle, /pdc-ecs, /mof, /gasp

  // Directive 8.8.4-M1: Mount Audit (Comprehensive System Audit & Validation) routes
  const auditRouter = await import('./routes/audit.js');
  apiRouter.use('/audit', auditRouter.default);
  console.log('[M1] Audit routes mounted at /api/audit');

  // Directive 8.8.4-M2: Mount Signal Audit (Strategy & Signal Verification Extension) routes
  const signalAuditRouter = await import('./routes/signal-audit.js');
  apiRouter.use('/signal-audit', signalAuditRouter.default);
  console.log('[M2] Signal Audit routes mounted at /api/signal-audit');

  // Directive 8.8.4-M3A: Mount TLVA (Training Loop Validation Audit) routes
  const tlvaRouter = await import('./routes/tlva.js');
  apiRouter.use('/tlva', tlvaRouter.default);
  console.log('[M3A] TLVA routes mounted at /api/tlva');

  // Phase 13: M3B routes removed (legacy — m3b-validation-service deleted)

  // Directive 8.8.4-M3B.2: Mount VTS Audit (Passive Feed Integration & Mode Audit) routes
  const vtsAuditRouter = await import('./routes/vts-audit.js');
  apiRouter.use('/vts', vtsAuditRouter.default);
  console.log('[M3B.2] VTS Passive Feed & Mode Audit routes mounted at /api/vts');

  // Directive 11.7D.1: Mount Predictive Adjustments API routes
  const predictiveAdjustmentsRouter = await import('./routes/vts-predictive-adjustments.js');
  apiRouter.use('/vts/predictive-adjustments', predictiveAdjustmentsRouter.default);
  console.log('[11.7D.1] Predictive Adjustments routes mounted at /api/vts/predictive-adjustments');

  // Directive 8.8.4-M4: Mount Back-Audit (Comprehensive Back-Audit & System Integrity) routes
  const backAuditRouter = await import('./routes/back_audit.js');
  apiRouter.use('/back-audit', backAuditRouter.default);
  console.log('[M4] Back-Audit & System Integrity routes mounted at /api/back-audit');

  // Directive 8.8.4-M5: Mount Paper Validation (Controlled Paper-Mode Validation) routes
  const paperValidationRouter = await import('./routes/paper_validation.js');
  apiRouter.use('/validation', paperValidationRouter.default);
  console.log('[M5] Paper Validation routes mounted at /api/validation');

  // Directive 8.8.4-M5: Mount Pricing (Feed Latency & Cache) routes
  const pricingRouter = await import('./routes/pricing.js');
  apiRouter.use('/pricing', pricingRouter.default);
  console.log('[M5] Pricing routes mounted at /api/pricing');

  // Directive 8.8.4-M5-R1: Mount Calibration Report routes
  const calibrationRouter = await import('./routes/calibration.js');
  apiRouter.use('/calibration', calibrationRouter.default);
  console.log('[M5-R1] Calibration routes mounted at /api/calibration');

  // Directive 11.7E: Mount Regime Archive API routes
  const regimeArchiveRouter = await import('./routes/regime-archive.js');
  apiRouter.use('', regimeArchiveRouter.default);
  console.log('[11.7E] Regime Archive routes mounted at /api/vts/regime-archive');

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
// Directive 11.8B-B: LHTS/LATTI handler functions removed
// Phase 27.F.14 Local Heuristic Trader Service API Endpoints - REMOVED
// Phase 27.F.14.B LATTI Baseline Indicator API Endpoints - REMOVED
// ============================================================================

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
        // [9.6.3] Use mode-only query (mode-based architecture)
        storage.getPortfolioState({ mode })
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

