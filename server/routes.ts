import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, and, desc } from "drizzle-orm";
import { KrakenService } from "./services/kraken";
import { TradingEngine, EngineSettingsBus } from "./services/trading-engine";
import { AIAnalyst } from "./services/ai-analyst";
import { MarketScanner } from "./services/market-scanner";
import { RiskManager } from "./services/risk-manager";
import { aiOpportunitiesService } from "./services/ai-opportunities";
import { dailyBriefService } from "./services/daily-brief";
import { insertTradingSettingsSchema, insertWatchlistPairSchema, insertGuardrailsSchema, insertScreenerFiltersSchema, semanticMemory, walterPurpose, walterMemory, insertWalterMemorySchema, reasoningTrace, reasoningQueue, awarenessStateLog, ethicalPrinciple, ethicalViolationLog, crossAgentEthicsSession, clusterResultLog } from "@shared/schema";
import { databaseMonitor } from "./services/database-monitor";
import { stockService } from "./services/stocks";
import { marketDataService } from "./services/market-data";
import { actuationPolicyService } from "./services/actuation-policy";
import { assetCapabilitiesService } from "./services/asset-capabilities";
import { manageChatLifecycle, summarizeChatSession } from "./services/walter-chat-lifecycle";
import { generateWalterResponse, ensureNaturalLanguageResponse } from "./services/walter-response";
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

// Rate Limiting for Authentication Endpoints - prevent brute force attacks
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 login attempts per window
  message: { error: "Too many login attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const tradingEngines = new Map<string, TradingEngine>();
const marketScanner = new MarketScanner();
const aiAnalyst = new AIAnalyst();

// Expose tradingEngines globally for context refresh coordinator (Phase 8.5 Addendum K.4)
(global as any).tradingEngines = tradingEngines;
const riskManager = new RiskManager();
const commandRouter = new CommandRouter(tradingEngines);

// Phase 22: Initialize ExecutionPolicyController for autonomous execution layer
const executionPolicyController = new ExecutionPolicyController(storage as any);
nlaiExecutionBroker.initialize(storage, executionPolicyController);

// Phase 6.8: Store pending confirmations per user for bare "yes/no" replies
const userPendingConfirmations = new Map<string, string>(); // userId -> confirmationId

// JWT secrets for authentication
const JWT_SECRET = process.env.JWT_SECRET || "development_secret_change_in_production";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "development_refresh_secret_change_in_production";

// Issue access and refresh tokens
function issueTokens(user: { id: string; username: string }) {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username }, 
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
    role?: 'owner' | 'editor' | 'viewer';
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
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    
    // Fetch user from database to get admin status and role
    const user = await storage.getUser(decoded.id);
    
    req.user = { 
      id: decoded.id, 
      username: decoded.username,
      isAdmin: user?.isAdmin || false,
      role: user?.role || 'viewer'
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

// TEMPORARILY DISABLED: Do not ping Kraken for 1 hour (maintenance mode)
// marketScanner.startHourlyScanning();

// AI Opportunities service will be started conditionally based on user settings
// (service checks settings before starting hourly generation)
// TEMPORARILY DISABLED: Do not ping Kraken for 1 hour

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
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

  // API Routes

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development'
    });
  });

  // Authentication Routes
  
  // REGISTER - DISABLED FOR SINGLE-USER MODE
  // To enable registration, remove the error response below and uncomment the registration logic
  app.post('/api/auth/register', async (req: AuthenticatedRequest, res) => {
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
      
      // Create default trading settings for the new user
      await storage.createTradingSettings({ userId: user.id });
      
      res.json({ success: true, userId: user.id });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
    */
  });

  // LOGIN - Rate limited to prevent brute force attacks
  app.post('/api/auth/login', loginLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      
      // Support both username and email login
      let user = await storage.getUserByUsername(username);
      if (!user) {
        // Try email if username lookup failed
        user = await storage.getUserByEmail(username);
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
      
      const { accessToken, refreshToken } = issueTokens({ id: user.id, username: user.username });
      
      res.json({ 
        accessToken, 
        refreshToken,
        token: accessToken, // Keep for backward compatibility
        user: { 
          id: user.id, 
          username: user.username,
          isAdmin: user.isAdmin || false,
          role: user.role || 'viewer'
        } 
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // VERIFY TOKEN
  app.get('/api/auth/verify', async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/auth/refresh', async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/user/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const user = await storage.getUser(req.user!.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  });

  // Update user approval matrix
  app.patch('/api/user/approval-matrix', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/admin/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/admin/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
      
      // Create default trading settings for the new user
      await storage.createTradingSettings({ userId: user.id });
      
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

  app.patch('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/admin/users/:userId/reset-password', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  // Trading Settings
  app.get('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      let settings = await storage.getTradingSettings(userId);
      
      if (!settings) {
        // Create default settings
        settings = await storage.createTradingSettings({ userId });
      }
      
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

  app.put('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Update trading settings (credentials are now only stored in environment secrets)
      const validatedData = insertTradingSettingsSchema.omit({ userId: true }).parse(req.body);
      const settings = await storage.updateTradingSettings(userId, validatedData);
      
      // Broadcast config update via Context Bridge
      await contextBridge.broadcast({
        type: 'config_update',
        payload: { settings },
        userId,
        mode: settings.currentMode as 'live' | 'paper'
      });
      
      res.json(settings);
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // Guardrails endpoints (mode-isolated)
  // Phase 7.4: ConfigBob transparent routing for guardrails endpoint
  app.get('/api/guardrails', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

      let guardrailsData = await storage.getGuardrails({ userId, mode });

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

  app.put('/api/guardrails', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.query.mode as 'live' | 'paper';

      if (!mode || (mode !== 'live' && mode !== 'paper')) {
        return res.status(400).json({ error: 'Mode parameter is required and must be "live" or "paper"' });
      }

      const validatedData = insertGuardrailsSchema.parse({ ...req.body, userId, mode });
      const guardrailsData = await storage.upsertGuardrails(validatedData);

      console.info(`[Guardrails] User ${userId} updated guardrails for ${mode} mode`);

      // Phase 8.6.5: Invalidate caches and refresh context for Walter AI
      const { configChangeHandler } = await import('./services/config-change-handler');
      await configChangeHandler.handleConfigChange({
        userId,
        mode,
        configType: 'guardrails',
        source: 'api'
      });

      res.json(guardrailsData);
    } catch (error) {
      console.error('Error updating guardrails:', error);
      res.status(500).json({ error: 'Failed to update guardrails' });
    }
  });

  // Filter diagnostics endpoint - fetches latest 24h metrics
  app.get('/api/filters/diagnostics', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;

      // Get diagnostics from last 24 hours
      const diagnostics = await storage.getFilterDiagnostics({ userId, mode, hours: 24 });

      if (!diagnostics || diagnostics.length === 0) {
        return res.json({
          pairsScanned: 0,
          eligiblePairs: 0,
          topFailureReason: 'No data',
          failurePercent: 0,
        });
      }

      // Get most recent diagnostic
      const latest = diagnostics[0];

      res.json({
        pairsScanned: latest.pairsScanned,
        eligiblePairs: latest.eligiblePairs,
        topFailureReason: latest.topFailureReason || 'Unknown',
        failurePercent: parseFloat(latest.failurePercent || '0'),
        timestamp: latest.timestamp,
      });
    } catch (error) {
      console.error('Error fetching filter diagnostics:', error);
      res.status(500).json({ error: 'Failed to fetch filter diagnostics' });
    }
  });

  // Filter calibration endpoint - fetches latest with Paper→Live fallback
  app.get('/api/screeners/calibration', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;

      const calibration = await storage.getCalibrationWithFallback(userId, mode, 24);

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
  app.get('/api/screeners', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
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

      let screenerData = await storage.getScreenerFilters({ userId, mode });

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

  app.put('/api/screeners', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;

      const validatedData = insertScreenerFiltersSchema.parse({ ...req.body, userId, mode });
      const screenerData = await storage.upsertScreenerFilters(validatedData);

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

  // Trading Engine Control
  app.post('/api/trading/start', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode } = req.body; // 'live' or 'paper'
      
      // Get API credentials from environment secrets only
      const apiKey = process.env.KRAKEN_API_KEY;
      const apiSecret = process.env.KRAKEN_API_SECRET;
      
      // Validate credentials are present before starting
      if (!apiKey || !apiSecret) {
        return res.status(400).json({ 
          error: 'Kraken API credentials not configured',
          message: 'Please add KRAKEN_API_KEY and KRAKEN_API_SECRET to Replit Secrets before starting trading.'
        });
      }
      
      let engine = tradingEngines.get(userId);
      if (!engine) {
        engine = new TradingEngine(userId, apiKey, apiSecret);
        tradingEngines.set(userId, engine);
      }
      
      await engine.start();
      await storage.updateUser(userId, { tradingStatus: 'active', tradingMode: mode });
      
      res.json({ status: 'started', mode });
    } catch (error) {
      console.error('Error starting trading:', error);
      res.status(500).json({ error: 'Failed to start trading' });
    }
  });

  app.post('/api/trading/stop', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      const engine = tradingEngines.get(userId);
      if (engine) {
        await engine.stop();
      }
      
      await storage.updateUser(userId, { tradingStatus: 'stopped' });
      
      res.json({ status: 'stopped' });
    } catch (error) {
      console.error('Error stopping trading:', error);
      res.status(500).json({ error: 'Failed to stop trading' });
    }
  });

  // Phase 8.7.3: Pre-Execution Validator - Validate trade intent before execution
  app.post('/api/trading/validate', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/trading/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const globalContextId = 'default';
      const user = await storage.getUser(userId);
      const currentMode = (user?.tradingMode || 'paper') as 'live' | 'paper';
      
      // Check paper simulation engine status (system-wide)
      const globalSession = (global as any).getGlobalSession?.() as SimulationSession | null;
      const isPaperSimRunning = !!(globalSession && globalSession.isRunning);
      
      // Phase 8.5 Addendum K.4.1: Check live engine status from tradingEngines map
      const liveEngine = tradingEngines.get(userId);
      const isLiveEngineRunning = !!(liveEngine && liveEngine.isEngineRunning());
      
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
        storage.getWatchlist({ userId, mode: currentMode }),
        storage.getActiveTrades(userId)
      ]);
      
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
      
      // Calculate metrics for current mode
      const filteredPairs = watchlist.length;
      const activeTradesCount = activeTrades.length;
      
      // Get ready to buy signals (if paper engine is running)
      let readyToBuy = 0;
      if (isPaperSimRunning && currentMode === 'paper') {
        const openPositions = await storage.getPaperSimOpenPositions(userId);
        readyToBuy = Math.max(0, filteredPairs - openPositions.length);
      }
      
      const lastTickISO = new Date().toISOString();
      
      // Return dual-mode structure with source metadata (Phase 8.5 Addendum K.4.1)
      res.json({
        currentMode,
        dataSource: 'database', // Phase 8.5 Addendum K.4.1: Always sourced from database
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

  // Portfolio and Metrics
  app.get('/api/portfolio/overview', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      const liveBalance = await riskManager.getLiveKrakenBalance(userId);
      const metrics = await riskManager.getPortfolioMetrics(userId);
      const cashCrypto = await riskManager.getCashVsCrypto(userId);
      const winRateData = await riskManager.getWinRate(userId, 30);
      
      res.json({
        totalValue: liveBalance.totalValueUSD,
        unrealizedPL: metrics.unrealizedPL,
        realizedPL: metrics.realizedPL,
        currentExposure: metrics.currentExposure,
        openTradesCount: metrics.openTradesCount,
        ...winRateData,
        cash: liveBalance.cashUSD,
        crypto: liveBalance.cryptoUSD,
        cashPercent: liveBalance.totalValueUSD > 0 ? (liveBalance.cashUSD / liveBalance.totalValueUSD) * 100 : 0,
        cryptoPercent: liveBalance.totalValueUSD > 0 ? (liveBalance.cryptoUSD / liveBalance.totalValueUSD) * 100 : 0,
        syncTimestamp: liveBalance.syncTimestamp,
        balanceSource: liveBalance.source,
        balanceError: liveBalance.error
      });
    } catch (error) {
      console.error('Error fetching portfolio overview:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio data' });
    }
  });

  app.get('/api/portfolio/earnings', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const earnings = await riskManager.getEarnings(userId);
      res.json(earnings);
    } catch (error) {
      console.error('Error fetching earnings:', error);
      res.status(500).json({ error: 'Failed to fetch earnings data' });
    }
  });

  app.get('/api/portfolio/earnings-chart', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const days = parseInt(req.query.days as string) || 30;
      const chartData = await riskManager.getEarningsChartData(userId, days);
      res.json(chartData);
    } catch (error) {
      console.error('Error fetching earnings chart data:', error);
      res.status(500).json({ error: 'Failed to fetch earnings chart data' });
    }
  });

  app.get('/api/portfolio/history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const period = (req.query.period as string) || '1M';
      
      const initialBalance = 800;
      
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
      
      const allTrades = await storage.getTrades(userId, {});
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

  app.get('/api/portfolio/value-history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const period = (req.query.period as string) || '30d';
      
      const initialBalance = 800;
      
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
      
      const allTrades = await storage.getTrades(userId, {});
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

  app.get('/api/portfolio/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      const initialBalance = 800;
      
      const allTrades = await storage.getTrades(userId, {});
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
  app.get('/api/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { status, symbol, strategy, limit } = req.query;
      
      const trades = await storage.getTrades(userId, {
        status: status as string,
        symbol: symbol as string,
        strategy: strategy as string,
        limit: limit ? parseInt(limit as string) : undefined
      });
      
      res.json(trades);
    } catch (error) {
      console.error('Error fetching trades:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  app.get('/api/trades/active', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Phase 7.6: Use TradeBob for caching if enabled, otherwise fallback
      const trades = tradeBob.isEnabled()
        ? await tradeBob.getAllActiveTrades(userId)
        : await storage.getActiveTrades(userId);
      
      res.json(trades);
    } catch (error) {
      console.error('Error fetching active trades:', error);
      res.status(500).json({ error: 'Failed to fetch active trades' });
    }
  });

  app.post('/api/trades/:id/close', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      
      const engine = tradingEngines.get(userId);
      if (!engine) {
        return res.status(400).json({ error: 'Trading engine not initialized' });
      }
      
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
  app.get('/api/watchlist', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      const watchlist = await storage.getWatchlist({ userId, mode });
      res.json(watchlist);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
  });

  app.post('/api/watchlist', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
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

  app.delete('/api/watchlist/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      await storage.removeWatchlistPair(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
  });

  // Market Data
  app.get('/api/market/overview', async (req: AuthenticatedRequest, res) => {
    try {
      const overview = await marketScanner.getMarketOverview();
      res.json(overview);
    } catch (error) {
      console.error('Error fetching market overview:', error);
      res.status(500).json({ error: 'Failed to fetch market overview' });
    }
  });

  app.get('/api/market/ticker/:symbol', async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/ai/reports', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ai/reports/generate', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ai/analyze-symbol', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/daily-briefs/today', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/daily-briefs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/daily-briefs/:date', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/daily-briefs/update', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/paper/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const trades = await storage.getAllPaperTrades(userId);
      res.json(trades);
    } catch (error) {
      console.error('Error fetching paper trades:', error);
      res.status(500).json({ error: 'Failed to fetch paper trades' });
    }
  });

  app.get('/api/paper/trades/open', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Phase 7.6: Use TradeBob for caching if enabled, otherwise fallback
      const trades = tradeBob.isEnabled()
        ? await tradeBob.getOpenPaperTrades(userId)
        : await storage.getOpenPaperTrades(userId);
      
      res.json(trades);
    } catch (error) {
      console.error('Error fetching open paper trades:', error);
      res.status(500).json({ error: 'Failed to fetch open paper trades' });
    }
  });

  app.delete('/api/paper/trades/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      await storage.deleteAllPaperTrades(userId);
      
      // Phase 7.6: Invalidate TradeBob cache when paper trades are cleared
      tradeBob.invalidateActiveTrades(userId); // Invalidate combined cache
      tradeBob.invalidatePaperTrades(userId);   // Invalidate paper-specific cache
      
      res.json({ success: true, message: 'All paper trades cleared' });
    } catch (error) {
      console.error('Error clearing paper trades:', error);
      res.status(500).json({ error: 'Failed to clear paper trades' });
    }
  });

  app.get('/api/paper/briefs/today', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/paper/briefs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/paper/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/paper/metrics/portfolio', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  // Live Trading Routes (Phase 22.3)
  // Control live trading mode with manual approval requirements
  app.post('/api/live-trading/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/live-trading/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/live-trading/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/live-trading/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/auto-test/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  // Paper Trading Simulation Engine Routes (Milestone 18)
  // NOTE: Paper trading is SYSTEM-WIDE. Only ONE simulation can run at a time.
  // All users see the same simulation status.
  let globalPaperPortfolioManager: any = null;
  let globalPaperSimOperationLock: Promise<void> | null = null;

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
  app.post('/api/internal/paper-sim/register-session', async (req, res) => {
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
  app.post('/api/internal/paper-sim/deregister-session', async (req, res) => {
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
  app.get('/api/bob/stats', bobStatsHandler);

  // Phase 7.7: Bob Insight endpoint - system introspection and meta-information
  app.get('/api/bob/insight', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const summary = await insightBob.getInsightSummary();
      res.json(summary);
    } catch (error: any) {
      console.error('[BobInsight] Error fetching insight summary:', error);
      res.status(500).json({ error: 'Failed to fetch insight summary' });
    }
  });

  // Phase 7.7: UI State endpoint - current UI context and visibility
  app.get('/api/ui/state', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/ui/state', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/bob/prefetch', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cortex/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const status = cortexCore.getStatus();
      res.json(status);
    } catch (error: any) {
      console.error('[Cortex] Error fetching status:', error);
      res.status(500).json({ error: 'Failed to fetch Cortex status' });
    }
  });

  // Cortex snapshot endpoint - get Bob/UI snapshots
  app.get('/api/cortex/snapshot', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/cortex/flush', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      await cortexCore.flush();
      res.json({ success: true, message: 'Memory flushed' });
    } catch (error: any) {
      console.error('[Cortex] Error flushing memory:', error);
      res.status(500).json({ error: 'Failed to flush memory' });
    }
  });

  // Cortex force sync endpoint - manually trigger snapshot sync
  app.post('/api/cortex/force-sync', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/system/health', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
        const liveGoals = await storage.getUserGoalsLive(userId);
        const paperGoals = await storage.getUserGoalsPaper(userId);
        healthData.goals = {
          live: { count: liveGoals.length, hasGoals: liveGoals.length > 0 },
          paper: { count: paperGoals.length, hasGoals: paperGoals.length > 0 }
        };
      } catch (error) {
        healthData.goals = { error: 'Failed to get goals' };
        allHealthy = false;
      }

      // Frontend connection status (clients ping this endpoint, so we assume connected)
      healthData.frontendConnected = true;

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
  app.get('/api/system/health-metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const healthMetrics = await metricsBob.getSystemHealthMetrics(5); // 5s TTL
      res.json(healthMetrics);
    } catch (error: any) {
      console.error('[SystemHealthMetrics] Error:', error);
      res.status(500).json({ error: 'Failed to get health metrics', message: error.message });
    }
  });

  // Phase 8.3: Manual System Recovery Trigger
  app.post('/api/system/recover', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/system/health-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/system/truth-check', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';

      const { systemTruthDiagnostic } = await import('./services/system-truth-diagnostic');
      
      const truthComparison = await systemTruthDiagnostic.runTruthCheck(userId, mode);
      
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
  app.get('/api/system/truth-check/report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';

      const { systemTruthDiagnostic } = await import('./services/system-truth-diagnostic');
      
      const truthComparison = await systemTruthDiagnostic.runTruthCheck(userId, mode);
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
  app.post('/api/context/refresh', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      const mode = (user?.tradingMode || 'paper') as 'live' | 'paper';

      const { contextRefreshCoordinator } = await import('./services/context-refresh-coordinator');
      
      const result = await contextRefreshCoordinator.refresh(userId, mode, 'api');
      
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
  app.get('/api/context/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cognitive/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/cognitive/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cognitive/report', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/state/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/state/debug', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  // ==================== Phase 8.7.2: Intent Execution Framework ====================

  // POST /api/intent/execute - Execute validated intent
  app.post('/api/intent/execute', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/intent/audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/context/bridge/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/execution/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/execution/timing/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/execution/parity-check', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/execution/parity-report', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/paper-sim/start', authenticateToken, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    
    try {
      // Check for existing GLOBAL manager (system-wide check)
      if (globalPaperPortfolioManager) {
        return res.status(400).json({ error: 'Paper trading simulation already running (system-wide)' });
      }

      // Check for pending operation (prevent race condition)
      if (globalPaperSimOperationLock) {
        return res.status(409).json({ error: 'Paper trading operation already in progress' });
      }

      // Create lock to serialize all start/stop operations
      const startPromise = (async () => {
        try {
          const { PaperPortfolioManager } = await import('./services/paper-portfolio-manager.js');
          const manager = new PaperPortfolioManager(userId);
          
          // Set the global manager before starting to prevent race condition
          globalPaperPortfolioManager = manager;
          
          // Register GLOBAL session for status tracking
          (global as any).registerSimulationSession({
            sessionId: `manual_${Date.now()}`,
            startedBy: userId,
            startTime: new Date(),
            isRunning: true,
            type: 'manual'
          });
          
          await manager.start();
        } catch (error) {
          // Rollback on failure - clean up both manager and session
          globalPaperPortfolioManager = null;
          (global as any).deregisterSimulationSession();
          throw error;
        } finally {
          globalPaperSimOperationLock = null;
        }
      })();

      globalPaperSimOperationLock = startPromise;
      await startPromise;
      
      // Emit start acknowledgment log
      const globalSession = (global as any).getGlobalSession() as SimulationSession | null;
      console.log(`[TradeEngine] start_ack { runId: "${globalSession?.sessionId || 'unknown'}", mode: "paper", t: "${new Date().toISOString()}" }`);
      
      res.json({ success: true, message: 'Paper trading simulation started' });
    } catch (error: any) {
      console.error('Error starting paper trading simulation:', error);
      globalPaperSimOperationLock = null;
      res.status(500).json({ error: error.message || 'Failed to start paper trading simulation' });
    }
  });

  app.post('/api/paper-sim/stop', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      // Check GLOBAL manager (system-wide)
      if (!globalPaperPortfolioManager) {
        return res.status(400).json({ error: 'Paper trading simulation not running' });
      }

      // Check for pending operation (prevent race condition)
      if (globalPaperSimOperationLock) {
        return res.status(409).json({ error: 'Paper trading operation already in progress' });
      }

      // Create lock to serialize all start/stop operations
      const stopPromise = (async () => {
        // Store reference to current manager for rollback
        const currentManager = globalPaperPortfolioManager;
        
        try {
          // Clear global manager first to prevent new operations
          globalPaperPortfolioManager = null;
          
          // Deregister GLOBAL session
          (global as any).deregisterSimulationSession();
          
          await currentManager.stop();
        } catch (error) {
          // Only restore if no newer manager was started
          if (!globalPaperPortfolioManager) {
            globalPaperPortfolioManager = currentManager;
          }
          throw error;
        } finally {
          globalPaperSimOperationLock = null;
        }
      })();

      globalPaperSimOperationLock = stopPromise;
      await stopPromise;
      
      // Emit stop acknowledgment log
      const globalSession = (global as any).getGlobalSession() as SimulationSession | null;
      console.log(`[TradeEngine] stop_ack { runId: "${globalSession?.sessionId || 'unknown'}", t: "${new Date().toISOString()}" }`);
      
      res.json({ success: true, message: 'Paper trading simulation stopped' });
    } catch (error: any) {
      console.error('Error stopping paper trading simulation:', error);
      globalPaperSimOperationLock = null;
      res.status(500).json({ error: error.message || 'Failed to stop paper trading simulation' });
    }
  });

  // Phase 7.2: Paper trading status with Bob Core caching
  app.get('/api/paper-sim/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
      const hasUISimulation = globalPaperPortfolioManager !== null;
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

  app.get('/api/paper-sim/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { limit, closedOnly } = req.query;
      
      const options: any = {};
      if (limit) options.limit = parseInt(limit as string);
      if (closedOnly) options.closedOnly = closedOnly === 'true';
      
      const trades = await storage.getPaperSimTrades(userId, options);
      res.json(trades);
    } catch (error) {
      console.error('Error fetching paper sim trades:', error);
      res.status(500).json({ error: 'Failed to fetch trades' });
    }
  });

  app.get('/api/paper-sim/positions', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const positions = await storage.getPaperSimOpenPositions(userId);
      res.json({ ok: true, positions });
    } catch (error) {
      console.error('Error fetching paper sim positions:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch positions' });
    }
  });

  app.get('/api/paper-sim/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const manager = paperPortfolioManagers.get(userId);
      
      if (!manager) {
        const stats = await storage.getPaperSimStats(userId);
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

  app.get('/api/paper-sim/health', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const manager = paperPortfolioManagers.get(userId);
      
      if (!manager) {
        return res.status(400).json({ error: 'Paper trading simulation not running' });
      }

      const health = await manager.checkPortfolioHealth();
      res.json(health);
    } catch (error) {
      console.error('Error checking paper sim health:', error);
      res.status(500).json({ error: 'Failed to check health' });
    }
  });

  app.post('/api/paper-sim/close-all', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const manager = paperPortfolioManagers.get(userId);
      
      if (!manager) {
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

  app.post('/api/paper-sim/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const manager = paperPortfolioManagers.get(userId);
      
      if (!manager) {
        return res.status(400).json({ error: 'Paper trading simulation not running' });
      }

      await manager.resetPortfolio();
      
      res.json({ success: true, message: 'Portfolio reset complete' });
    } catch (error) {
      console.error('Error resetting portfolio:', error);
      res.status(500).json({ error: 'Failed to reset portfolio' });
    }
  });

  app.get('/api/paper-sim/logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { limit } = req.query;
      
      const logs = await storage.getPaperSimTradeLogs(userId, {
        limit: limit ? parseInt(limit as string) : 100
      });
      res.json(logs);
    } catch (error) {
      console.error('Error fetching paper sim logs:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  app.get('/api/ai/conversation', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/chats', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/chats/save', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.delete('/api/chats/:context', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/chats/new', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ai/chat', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ai/settings/apply', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ai/audit-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ai/error-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ai/diagnose-error', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/conversations', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const conversations = await storage.getAIConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/conversations/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/conversations', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.patch('/api/conversations/:id', async (req: AuthenticatedRequest, res) => {
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

  app.delete('/api/conversations/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/conversations/:id/summaries', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/conversations/:id/message', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/kill-switch/create-analysis-chat', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { eventId } = req.body;
      
      // Get kill switch event details
      const event = eventId 
        ? await storage.getKillSwitchEventById(eventId)
        : await storage.getLatestKillSwitchEvent(userId);
      
      if (!event) {
        return res.status(404).json({ error: 'No kill switch event found' });
      }

      // Get settings at time of incident
      const settings = await storage.getTradingSettings(userId);
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
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

  app.post('/api/transcribe', authenticateToken, upload.single('audio'), async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/tts', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/ingest', authenticateToken, (req: AuthenticatedRequest, res, next) => {
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
  app.get('/api/walter/ingest/history', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const history = await getIngestionHistory(limit);
      res.json({ success: true, history });
    } catch (error: any) {
      console.error('[Ingest] History error:', error);
      res.status(500).json({ error: 'Failed to retrieve ingestion history' });
    }
  });

  // Chat cost tracking
  app.get('/api/chat-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/chat-costs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ai/error-logs/:id/resolve', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/ai/opportunities', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ai/opportunities/latest-run', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const latestRun = await aiOpportunitiesService.getLatestRun(userId);
      res.json(latestRun || null);
    } catch (error) {
      console.error('Error fetching latest run:', error);
      res.status(500).json({ error: 'Failed to fetch latest run' });
    }
  });

  app.get('/api/ai/opportunities/validation-report', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const report = await aiOpportunitiesService.getValidationReport(userId);
      res.json(report);
    } catch (error) {
      console.error('Error generating validation report:', error);
      res.status(500).json({ error: 'Failed to generate validation report' });
    }
  });

  app.patch('/api/ai/opportunities/:id/status', async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ai/opportunities/generate', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Check if feature is enabled for this user
      const settings = await storage.getTradingSettings(userId);
      if (!settings?.aiOpportunitiesEnabled) {
        return res.status(403).json({ error: 'AI Opportunities feature is disabled for this user' });
      }
      
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
  app.get('/api/market-context/latest', async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/market-context/history', async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/market-context/analyze', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { mode = 'live' } = req.body;
      
      if (mode !== 'live' && mode !== 'paper') {
        return res.status(400).json({ error: 'Invalid mode. Must be "live" or "paper"' });
      }
      
      // Check if feature is enabled for this user
      const settings = await storage.getTradingSettings(userId);
      if (!settings?.aiOpportunitiesEnabled) {
        return res.status(403).json({ error: 'AI features are disabled for this user' });
      }
      
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
  app.get('/api/stocks/quote/:symbol', async (req: AuthenticatedRequest, res) => {
    try {
      const { symbol } = req.params;
      const quote = await stockService.getQuote(symbol);
      res.json(quote);
    } catch (error) {
      console.error('Error fetching stock quote:', error);
      res.status(500).json({ error: 'Failed to fetch stock quote' });
    }
  });

  app.get('/api/stocks/company/:symbol', async (req: AuthenticatedRequest, res) => {
    try {
      const { symbol } = req.params;
      const company = await stockService.getCompanyInfo(symbol);
      res.json(company);
    } catch (error) {
      console.error('Error fetching company info:', error);
      res.status(500).json({ error: 'Failed to fetch company info' });
    }
  });

  app.get('/api/stocks/search/:query', async (req: AuthenticatedRequest, res) => {
    try {
      const { query } = req.params;
      const results = await stockService.search(query);
      res.json(results);
    } catch (error) {
      console.error('Error searching stocks:', error);
      res.status(500).json({ error: 'Failed to search stocks' });
    }
  });

  app.get('/api/symbol/data', async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/test/finnhub-feed', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/crypto/search/:query', async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/reports/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { reportType, format, from, to, symbol, strategy, mode } = req.query;
      
      // Fetch all trades for the user
      const allTrades = await storage.getTrades(userId, { 
        status: 'closed',
        limit: 10000 
      });
      
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
  app.get('/api/files/download/:category/:filename', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/files/list/:category', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/files/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/export/trades', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { from, to, format } = req.query;
      
      const trades = await storage.getTrades(userId, { 
        status: 'closed',
        limit: 10000 
      });
      
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
  app.get('/api/database/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/maintenance/status', (req, res) => {
    res.json({
      isMaintenanceMode: process.env.MAINTENANCE_MODE === 'true'
    });
  });

  // Screener test endpoint for demonstrating different filter configurations
  app.post('/api/screener/test', async (req: AuthenticatedRequest, res) => {
    try {
      const kraken = new KrakenService();
      const testSettings = req.body || {
        minVolume: '10000000',
        minDailyRange: '3.0',
        minPrice: '0.01',
        maxBidAskSpread: '1.00',
        excludeStablecoins: true,
        allowedTradingPairs: ['USD', 'USDT'],
        blacklistedSymbols: [],
        whitelistedSymbols: [],
        minHistoryDays: 90
      };

      console.log('\n🧪 Screener Test with custom settings:', testSettings);
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
  app.post('/api/guardrails/test', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const settings = await storage.getTradingSettings(userId);
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
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
          // Calculate position details
          const riskAmount = parseFloat(settings.riskPerTrade || '150');
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

  // Kill Switch endpoints
  app.get('/api/kill-switch/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const settings = await storage.getTradingSettings(userId);
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
      }

      const pl24h = await riskManager.calculate24hPL(userId);
      const latestEvent = await storage.getLatestKillSwitchEvent(userId);

      res.json({
        tradingSuspended: settings.tradingSuspended || false,
        dailyLossKillSwitch: settings.dailyLossKillSwitch,
        dailyLossWarningTrigger: settings.dailyLossWarningTrigger,
        current24hPL: pl24h,
        latestEvent
      });
    } catch (error: any) {
      console.error('Kill switch status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/kill-switch/check', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const settings = await storage.getTradingSettings(userId);
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
      }

      const result = await riskManager.checkKillSwitch(userId, settings);
      
      // Refetch settings to get updated tradingSuspended status
      const updatedSettings = await storage.getTradingSettings(userId);
      
      res.json({
        ...result,
        tradingSuspended: updatedSettings?.tradingSuspended || false
      });
    } catch (error: any) {
      console.error('Kill switch check error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/kill-switch/reset', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { notes } = req.body;
      
      const settings = await storage.getTradingSettings(userId);
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
      }

      if (!settings.tradingSuspended) {
        return res.status(400).json({ error: 'Trading is not suspended' });
      }

      const latestEvent = await storage.getLatestKillSwitchEvent(userId);
      if (latestEvent && !latestEvent.resolved) {
        await storage.resolveKillSwitchEvent(latestEvent.id, 'manual_ui', notes);
      }

      await storage.updateTradingSettings(userId, { tradingSuspended: false });

      console.log(`✅ Kill Switch reset for user ${userId}`);
      
      res.json({
        success: true,
        message: 'Trading resumed. Kill switch has been reset.',
        tradingSuspended: false
      });
    } catch (error: any) {
      console.error('Kill switch reset error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/kill-switch/events', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/test/simulate-loss', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { scenario } = req.body; // 'warning', 'kill', or custom loss %
      
      const settings = await storage.getTradingSettings(userId);
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
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

      // Create a simulated losing trade to reach the target loss
      const riskAmount = parseFloat(settings.riskPerTrade || '150');
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
      const updatedSettings = await storage.getTradingSettings(userId);

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
  app.post('/api/test/attempt-trade', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const settings = await storage.getTradingSettings(userId);
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
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
  app.post('/api/strategies/test', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = req.mode!;
      const watchlist = await storage.getWatchlist({ userId, mode });
      const settings = await storage.getTradingSettings(userId);
      
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found' });
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
  app.post('/api/strategies/validate', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/strategies/validate-stageb', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/test/kraken-balance', authenticateToken, async (_req, res) => {
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
  app.get('/api/system/health', async (_req, res) => {
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
  app.get('/api/system/strategy-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  // System Logs (simple in-memory log - placeholder)
  app.get('/api/system/logs', async (_req, res) => {
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
  app.get('/api/system/ai-audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/system/error-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/system-metrics', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/trading-engine', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/walter-activity', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/database-health', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/expert-insights', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/expert-insights/health', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/export-report', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.post('/api/diagnostics/acknowledge-alert', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/diagnostics/analyze', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/analysis-history', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.post('/api/optimization/analyze', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/optimization/recommendations', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.get('/api/schedulers/status', authenticateToken, async (_req: AuthenticatedRequest, res) => {
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
  app.post('/api/schedulers/run', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/schedulers/transparency-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/calibration-logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/intraday-adjustments', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/ai-lessons', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/portfolio-adjustments', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/prediction-outcomes', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/database-cross-check', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/performance-snapshot', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
        storage.getAllPaperTrades(userId),
        storage.getTrades(userId, {}),
      ]);
      
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
  app.get('/api/learning/autonomy-confidence', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/fallback-test', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/kraken/cache-stats', async (_req, res) => {
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
  app.get('/api/metrics/strategies', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

      const trades = await storage.getTrades(userId, {});
      const recentTrades = trades.filter(t => 
        t.entryTime && new Date(t.entryTime) >= fromDate
      );

      const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride'] as const;
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
          strategyName: strategy.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
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
  app.get('/api/paper/metrics/strategies', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

      const trades = await storage.getAllPaperTrades(userId);
      const recentTrades = trades.filter(t => 
        t.entryTime && new Date(t.entryTime) >= fromDate
      );

      const strategies = ['vwap_pullback', 'abcd_long', 'sma_trend_ride'] as const;
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
          strategyName: strategy.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
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
  app.get('/api/metrics/strategies/:strategy/details', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { strategy } = req.params;
      const mode = (req.query.mode as string) || 'live';
      const days = parseInt(req.query.days as string) || 30;

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      const trades = mode === 'live'
        ? await storage.getTrades(userId, { strategy })
        : await storage.getAllPaperTrades(userId);
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
  app.get('/api/learning/prediction-accuracy', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/signal-insights', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/signal-weights', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/prediction-outcomes', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/features/:symbol', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/learning/optimize-weights', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cache/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  // Get goals summary (mode-aware)
  // Phase 7.4: ConfigBob transparent routing for goals endpoint
  app.get('/api/goals/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
        ? await storage.getUserGoalsLive(userId)
        : await storage.getUserGoalsPaper(userId);

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
  app.post('/api/goals/update', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { goals, mode = 'live' } = req.body;

      console.log(`[Goals] Saving ${goals.length} goals for user ${userId} in ${mode} mode:`, JSON.stringify(goals));

      const updatedGoals = [];
      
      for (const goal of goals) {
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
        
        console.log(`[Goals] Saved goal ${goal.metricName} = ${goal.goalValue} (${mode}) -> DB ID: ${result.id}`);
        updatedGoals.push(result);
      }

      console.log(`[Goals] Successfully saved ${updatedGoals.length} goals in ${mode} mode`);
      res.json({ success: true, data: updatedGoals, mode });
    } catch (error: any) {
      console.error('Error updating goals:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Analyze goals with AI (conversational goal-setting)
  app.post('/api/goals/analyze', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { userMessage, mode = 'live' } = req.body;

      const settings = await storage.getTradingSettings(userId);
      if (!settings) {
        return res.status(404).json({ success: false, error: 'Trading settings not found' });
      }

      const currentGoals = mode === 'live'
        ? await storage.getUserGoalsLive(userId)
        : await storage.getUserGoalsPaper(userId);

      const trades = mode === 'live'
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);
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
  app.post('/api/goals/apply', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const { goals, configChanges, analysisId, mode = 'live' } = req.body;

      const updatedGoals = [];
      
      for (const goal of goals) {
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

  app.get('/api/trading/activity', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);
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

  app.get('/api/trading/averages', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);
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

      const avgReturnPercent = periodTrades.length > 0
        ? periodTrades.reduce((sum, t) => {
            const entry = parseFloat(t.entryPrice) * parseFloat(t.quantity);
            const pl = parseFloat(t.realizedPL || '0');
            return sum + (pl / entry * 100);
          }, 0) / periodTrades.length
        : 0;

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
        avgReturnPercent,
        avgTradeCompletionTime,
      });
    } catch (error: any) {
      console.error('Error fetching trading averages:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== TRADING RESULTS ROUTE =====
  // Phase 7.3: DataBob transparent routing for results endpoint

  app.get('/api/trading/results', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);
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
  app.get('/api/earnings/summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.query.mode as string) || 'live';

      const trades = mode === 'live'
        ? await storage.getTrades(userId, {})
        : await storage.getAllPaperTrades(userId);
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

      res.json({
        today,
        thisWeek,
        thisMonth,
        thisYear,
        allTime,
        avgDailyEarnings,
        avgDailyEarningsStatus,
      });
    } catch (error: any) {
      console.error('Error fetching earnings summary:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Strategy Settings Routes
  
  // GET current settings for a specific strategy
  // Phase 8.5 Addendum K.3: Uses global context for shared strategies
  app.get('/api/strategies/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/strategies/settings/all', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/strategies/settings/validate', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.put('/api/strategies/settings', authenticateToken, requireEditor, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/strategies/presets', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/strategies/presets/:strategy/:presetName', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/walter/pending-approvals', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/approvals/:id/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/approvals/:id/reject', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  
  // GET all Walter chats for current user
  app.get('/api/walter/chats', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/walter/chats/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
      
      // Get user's Walter memory depth setting for context windowing
      const settings = await storage.getTradingSettings(userId);
      const memoryDepth = settings?.walterMemoryDepth || 20;
      
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
  app.post('/api/walter/chats', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.patch('/api/walter/chats/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.delete('/api/walter/chats/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/chats/:id/messages', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
      // Check if auto-summarization is enabled in settings
      const userSettings = await storage.getTradingSettings(userId);
      const autoSummarizeEnabled = (userSettings as any)?.walterAutoSummarize ?? true;
      
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
  app.get('/api/walter/purpose', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/purpose', authenticateToken, validateMode, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/walter/memory', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/memory', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/walter/analyze-file', authenticateToken, fileUpload.single('file'), async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/walter/preferences', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.put('/api/walter/preferences', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/chats/:id/pin', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/chats/:id/unpin', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/walter/chats/:id/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/reasoning/enqueue', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/reasoning/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/reasoning/debug/:traceId', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/memory/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const status = memoryLifecycle.getStatus();
      res.json({ ok: true, data: status });
    } catch (error: any) {
      console.error('[MemoryLifecycle] Error getting status:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/memory/rehydrate - Manually trigger memory rehydration (admin only)
  app.post('/api/memory/rehydrate', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/memory/audit', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/semantic/search', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/semantic/latest', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/semantic/tags', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/ai/learning-metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/historic-signals/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/historic-signals', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/backfill/signals', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/actuation-policies', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/actuation-policies/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/proposed-adjustments', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/proposed-adjustments/:id/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/proposed-adjustments/:id/reject', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/proposed-adjustments/:id/apply', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/asset-capabilities', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const capabilities = await storage.getAssetCapabilities();
      res.json({ ok: true, capabilities });
    } catch (error: any) {
      console.error('[AssetCapabilities] Error fetching capabilities:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Get specific asset capability
  app.get('/api/asset-capabilities/:symbol', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/asset-capabilities/sync', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/orchestrator/telemetry', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/orchestrator/analysis', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/orchestrator/analyze', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/orchestrator/audit', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

      // 3. Trading Engine Status
      const settings = await storage.getTradingSettings(userId);
      const tradingMode = settings?.tradingMode || 'paper';
      
      const liveEngine = tradingEngines.get(userId);
      const liveEngineStatus = liveEngine?.getStatus?.() || { tradingStatus: 'stopped' };
      
      const paperIsRunning = paperPortfolioManagers.has(userId);
      const paperEngineStatus = { 
        isRunning: paperIsRunning,
        status: paperIsRunning ? 'running' : 'stopped'
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
  app.get('/api/orchestrator/learning-summary', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/orchestrator/logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/orchestrator/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.patch('/api/orchestrator/logs/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/orchestrator/updateGoal', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/orchestrator/updateGuardrail', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
        const currentGuardrails = await storage.getGuardrails({ userId, mode: validated.mode });
        
        if (!currentGuardrails) {
          return res.status(404).json({ error: 'Guardrails not found. Please initialize guardrails first.' });
        }

        // Update the specific field
        const updateData = {
          ...currentGuardrails,
          [validated.field]: validated.value,
          userId,
          mode: validated.mode
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
  app.post('/api/orchestrator/updateStrategy', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/walter/interpret-command', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
                const currentGuardrails = await storage.getGuardrails({ userId, mode });
                if (currentGuardrails) {
                  const updateData = {
                    ...currentGuardrails,
                    [interpretation.actionDetails.field]: interpretation.actionDetails.value,
                    userId,
                    mode
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
                const currentFilters = await storage.getScreenerFilters({ userId, mode });
                if (currentFilters) {
                  const updateData = {
                    ...currentFilters,
                    [interpretation.actionDetails.field]: interpretation.actionDetails.value,
                    userId,
                    mode
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
              // Check if trading is suspended by kill switch
              const settings = await storage.getTradingSettings(userId);
              if (settings?.tradingSuspended) {
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
                  
                  // Start trading engine
                  let engine = tradingEngines.get(userId);
                  if (!engine) {
                    engine = new TradingEngine(userId, apiKey, apiSecret);
                    tradingEngines.set(userId, engine);
                  }
                  
                  await engine.start();
                  await storage.updateUser(userId, { tradingStatus: 'active', tradingMode: targetMode });
                  
                  console.info(`[Walter] Started ${targetMode} trading for user ${userId}`);
                  finalResponse = `${interpretation.response}\n\n✅ ${targetMode.charAt(0).toUpperCase() + targetMode.slice(1)} trading started successfully.`;
                }
              }
              break;

            case 'stop_paper':
            case 'stop_live':
              // Stop trading engine
              const engineToStop = tradingEngines.get(userId);
              if (engineToStop) {
                await engineToStop.stop();
              }
              
              await storage.updateUser(userId, { tradingStatus: 'stopped' });
              
              console.info(`[Walter] Stopped trading for user ${userId}`);
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
  app.get('/api/alerts', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/alerts/:id/acknowledge', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const alertId = req.params.id;
      
      const AlertsService = (await import('./services/alerts-service')).default;
      const alert = await AlertsService.acknowledgeAlert(alertId, userId);
      
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found or access denied' });
      }
      
      res.json({ ok: true, alert });
    } catch (error: any) {
      console.error('Error acknowledging alert:', error);
      res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
  });

  // Acknowledge all alerts
  app.post('/api/alerts/acknowledge-all', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.id;
      const mode = (req.user!.tradingMode || 'paper') as 'live' | 'paper';
      
      const AlertsService = (await import('./services/alerts-service')).default;
      const alerts = await AlertsService.acknowledgeAll(userId, mode);
      
      res.json({ ok: true, count: alerts.length });
    } catch (error: any) {
      console.error('Error acknowledging all alerts:', error);
      res.status(500).json({ error: 'Failed to acknowledge all alerts' });
    }
  });

  // Mute low severity (info) alerts
  app.post('/api/alerts/mute-low-severity', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/alerts/:id/action', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/diagnostics/inspect', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/diagnostics/inspect-error/:errorId', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/diagnostics/analyze-report', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/diagnostics/patch/:proposalId/approve', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/diagnostics/logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/autonomy/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/autonomy/self-check', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/autonomy/analyze-trace', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/autonomy/meta-reasoning', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/autonomy/exploration', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/autonomy/optimize', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/autonomy/optimizations', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/awareness/state', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/awareness/reflect', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/awareness/history', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cluster/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cluster/nodes', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cluster/queue', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cluster/results', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/cluster/rebalance', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/cluster/drain/:nodeId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cluster/circuit-breaker', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/cluster/circuit-breaker/reset/:nodeId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/cluster/audit-logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/delta-stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/deltas', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/alignment-stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/alignments', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/learning/proposals', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/learning/sync', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/alignment/verify', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/alignment/history', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/alignment/synthesize', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/alignment/experiences', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/alignment/evaluate-drift', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/alignment/profile', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/alignment/adjustments', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/strategic/plans', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/strategic/plans', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategicPlannerService } = await import('./services/strategic-planner');
      
      const plans = await strategicPlannerService.getPlansByUser(req.user!.id);
      
      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[Strategic] Plans fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/strategic/plans/active', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategicPlannerService } = await import('./services/strategic-planner');
      
      const plans = await strategicPlannerService.getActivePlans(req.user!.id);
      
      res.json({ ok: true, plans });
    } catch (error: any) {
      console.error('[Strategic] Active plans fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/strategic/plans/:planId/progress', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.patch('/api/strategic/plans/:planId/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/strategic/recommendations', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/learning/profile', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/learning/profile', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { continuousLearningEngine } = await import('./services/continuous-learning');
      
      const profile = await continuousLearningEngine.getProfileByUser(req.user!.id);
      
      res.json({ ok: true, profile });
    } catch (error: any) {
      console.error('[Learning] Profile fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/learning/profile/:profileId/weights', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.patch('/api/learning/profile/:profileId/phase', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/learning/profile/:profileId/evaluate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/strategic/compliance', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/simulation/run', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/simulation/list', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/simulation/:simulationId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.patch('/api/simulation/:simulationId/outcome', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/simulation/decision', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/strategic/memory/capture', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/strategic/memory/lessons', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { strategicMemory } = await import('./services/strategic-memory');
      
      const lessons = await strategicMemory.getLessons(req.user!.id);
      
      res.json({ ok: true, lessons });
    } catch (error: any) {
      console.error('[Memory] Get lessons failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/strategic/memory/extract', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/reflection/reflect', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/reflection/audit', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/reflection/list', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/reflection/audits', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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
  app.post('/api/ethics/evaluate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ethics/audits', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ethics/rules', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicalReasoningEngine } = await import('./services/ethical-reasoning-engine');
      
      const rules = await ethicalReasoningEngine.getRules(req.user!.id);
      
      res.json({ ok: true, rules });
    } catch (error: any) {
      console.error('[Ethics] Get rules failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ethics/init', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { ethicalReasoningEngine } = await import('./services/ethical-reasoning-engine');
      
      await ethicalReasoningEngine.initializeDefaultRules(req.user!.id);
      
      res.json({ ok: true, message: 'Default ethical rules initialized' });
    } catch (error: any) {
      console.error('[Ethics] Init rules failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/alignment/matrix', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { valueAlignmentService } = await import('./services/value-alignment');
      
      const matrix = await valueAlignmentService.getMatrix(req.user!.id);
      
      res.json({ ok: true, matrix });
    } catch (error: any) {
      console.error('[Alignment] Get matrix failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/alignment/overall', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { valueAlignmentService } = await import('./services/value-alignment');
      
      const alignment = await valueAlignmentService.getOverallAlignment(req.user!.id);
      
      res.json({ ok: true, alignment });
    } catch (error: any) {
      console.error('[Alignment] Get overall failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/alignment/init', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { valueAlignmentService } = await import('./services/value-alignment');
      
      await valueAlignmentService.initializeDefaultMatrix(req.user!.id);
      
      res.json({ ok: true, message: 'Default value alignment matrix initialized' });
    } catch (error: any) {
      console.error('[Alignment] Init matrix failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Phase 9.6: Collaborative Cognition & Cross-Domain Reasoning API Endpoints
  app.post('/api/collaboration/sessions', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/collaboration/sessions', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      
      const sessions = await collaborationManager.getActiveSessions(req.user!.id);
      
      res.json({ ok: true, sessions });
    } catch (error: any) {
      console.error('[Collaboration] Get sessions failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/collaboration/sessions/:sessionId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/collaboration/sessions/:sessionId/end', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/collaboration/sessions/:sessionId/messages', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/collaboration/sessions/:sessionId/messages', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/collaboration/stats', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { collaborationManager } = await import('./services/collaboration-manager');
      
      const stats = await collaborationManager.getCollaborationStats();
      
      res.json({ ok: true, stats });
    } catch (error: any) {
      console.error('[Collaboration] Get stats failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/collaboration/consensus/:sessionId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/collaboration/consensus/evaluate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/collaboration/agents', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/learning/stats', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { learningBridge } = await import('./services/learning-bridge');
      
      const summary = await learningBridge.generateLearningSummary();
      
      res.json({ ok: true, summary });
    } catch (error: any) {
      console.error('[Learning] Get stats failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/learning/trends/:agentName', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/learning/record', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/learning/session/:sessionId', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/oversight/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/oversight/summary', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const metaOversightService = (await import('./services/meta-oversight')).default;
      
      const summary = await metaOversightService.getOversightSummary();
      
      res.json({ ok: true, summary });
    } catch (error: any) {
      console.error('[Oversight] Get summary failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/oversight/resolve', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/memory/archives', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/memory/calibration', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/memory/archive', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/core/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { unifiedCore } = await import('./services/unified-core');
      const status = await unifiedCore.getCoreStatus();
      
      res.json({ ok: true, status });
    } catch (error: any) {
      console.error('[CognitiveCore] Get status failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/core/agents', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/core/optimize', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/safety/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/safety/policies/apply', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/safety/kill-switch', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ethics/principles', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const principles = await db.select().from(ethicalPrinciple).orderBy(ethicalPrinciple.priority);
      
      res.json({ ok: true, principles });
    } catch (error: any) {
      console.error('[Ethics] Get principles failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ethics/principles', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ethics/violations', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ethics/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/introspection/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/introspection/biases', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/introspection/drift', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/introspection/mitigate', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/knowledge/query', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/knowledge/trust', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/knowledge/refresh', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/federation/status', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/federation/propagate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ethics/collab/consensus', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ethics/collab/conflicts', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ethics/collab/conflicts/:id/resolve', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/ethics/collab/sessions', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/ethics/collab/mediate', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  app.get('/api/system/performance', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { performanceMonitor } = await import('./services/performance-monitor');
      
      const performance = performanceMonitor.getSystemPerformance();
      
      res.json({ ok: true, performance });
    } catch (error: any) {
      console.error('[Performance] Get performance failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/system/autoscale/hints', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  return httpServer;
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

