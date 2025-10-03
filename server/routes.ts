import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { KrakenService } from "./services/kraken";
import { TradingEngine } from "./services/trading-engine";
import { AIAnalyst } from "./services/ai-analyst";
import { MarketScanner } from "./services/market-scanner";
import { RiskManager } from "./services/risk-manager";
import { insertTradingSettingsSchema, insertWatchlistPairSchema } from "@shared/schema";
import { databaseMonitor } from "./services/database-monitor";

const tradingEngines = new Map<string, TradingEngine>();
const marketScanner = new MarketScanner();
const aiAnalyst = new AIAnalyst();
const riskManager = new RiskManager();

// Start market scanner
marketScanner.startHourlyScanning();

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // WebSocket server for real-time data
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws: WebSocket, request) => {
    console.log('WebSocket client connected');
    
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

  // User and Authentication
  app.get('/api/user/profile', async (req, res) => {
    // Simplified - in real app would have authentication
    const userId = req.headers['user-id'] as string || 'default-user';
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  });

  // Trading Settings
  app.get('/api/settings', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      
      // Ensure user exists first
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.createUser({
          id: userId,
          username: userId,
          tradingStatus: 'stopped',
          tradingMode: 'paper'
        });
      }
      
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

  app.put('/api/settings', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      
      // Update trading settings (credentials are now only stored in environment secrets)
      const validatedData = insertTradingSettingsSchema.omit({ userId: true }).parse(req.body);
      const settings = await storage.updateTradingSettings(userId, validatedData);
      
      res.json(settings);
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // Trading Engine Control
  app.post('/api/trading/start', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.post('/api/trading/stop', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      
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

  app.get('/api/trading/status', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const user = await storage.getUser(userId);
      const engine = tradingEngines.get(userId);
      
      res.json({
        tradingStatus: user?.tradingStatus || 'stopped',
        tradingMode: user?.tradingMode || 'paper',
        engineRunning: engine?.isEngineRunning() || false
      });
    } catch (error) {
      console.error('Error getting trading status:', error);
      res.status(500).json({ error: 'Failed to get trading status' });
    }
  });

  // Portfolio and Metrics
  app.get('/api/portfolio/overview', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const metrics = await riskManager.getPortfolioMetrics(userId);
      const winRateData = await riskManager.getWinRate(userId, 30);
      
      res.json({
        ...metrics,
        ...winRateData
      });
    } catch (error) {
      console.error('Error fetching portfolio overview:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio data' });
    }
  });

  app.get('/api/portfolio/history', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const period = (req.query.period as string) || '1M';
      
      const user = await storage.getUser(userId);
      const initialBalance = user?.initialBalance || 50000;
      
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
          portfolioValueAtStart += trade.profitLoss || 0;
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
        if (trade.profitLoss) {
          currentValue += trade.profitLoss;
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

  // Trades
  app.get('/api/trades', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.get('/api/trades/active', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const trades = await storage.getActiveTrades(userId);
      res.json(trades);
    } catch (error) {
      console.error('Error fetching active trades:', error);
      res.status(500).json({ error: 'Failed to fetch active trades' });
    }
  });

  app.post('/api/trades/:id/close', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const { id } = req.params;
      
      const engine = tradingEngines.get(userId);
      if (!engine) {
        return res.status(400).json({ error: 'Trading engine not initialized' });
      }
      
      const closedTrade = await engine.closeTrade(id, 'manual');
      res.json(closedTrade);
    } catch (error) {
      console.error('Error closing trade:', error);
      res.status(500).json({ error: 'Failed to close trade' });
    }
  });

  // Watchlist
  app.get('/api/watchlist', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const watchlist = await storage.getWatchlist(userId);
      res.json(watchlist);
    } catch (error) {
      console.error('Error fetching watchlist:', error);
      res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
  });

  app.post('/api/watchlist', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const validatedData = insertWatchlistPairSchema.parse({ ...req.body, userId });
      
      const pair = await storage.addWatchlistPair(validatedData);
      res.json(pair);
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      res.status(500).json({ error: 'Failed to add to watchlist' });
    }
  });

  app.delete('/api/watchlist/:id', async (req, res) => {
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
  app.get('/api/market/overview', async (req, res) => {
    try {
      const overview = await marketScanner.getMarketOverview();
      res.json(overview);
    } catch (error) {
      console.error('Error fetching market overview:', error);
      res.status(500).json({ error: 'Failed to fetch market overview' });
    }
  });

  app.get('/api/market/ticker/:symbol', async (req, res) => {
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
  app.get('/api/ai/reports', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.post('/api/ai/reports/generate', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.post('/api/ai/analyze-symbol', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const { symbol } = req.body;
      
      const analysis = await aiAnalyst.analyzeSymbol(symbol, userId);
      res.json(analysis);
    } catch (error) {
      console.error('Error analyzing symbol:', error);
      res.status(500).json({ error: 'Failed to analyze symbol' });
    }
  });

  app.get('/api/ai/conversation', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const conversation = await storage.getAIConversation(userId);
      res.json(conversation || { messages: [], context: {} });
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const { message, context } = req.body;
      
      const result = await aiAnalyst.chatWithAssistant(userId, message, context);
      res.json(result);
    } catch (error) {
      console.error('Error in AI chat:', error);
      res.status(500).json({ error: 'Failed to process AI chat' });
    }
  });

  app.post('/api/ai/settings/apply', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const { settingName, newValue, confirmation } = req.body;
      
      const result = await aiAnalyst.applySettingsChange(userId, settingName, newValue, confirmation);
      res.json(result);
    } catch (error) {
      console.error('Error applying settings change:', error);
      res.status(500).json({ error: 'Failed to apply settings change' });
    }
  });

  app.get('/api/ai/audit-logs', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const { limit } = req.query;
      
      const logs = await storage.getAuditLogs(userId, limit ? parseInt(limit as string) : 50);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  app.get('/api/ai/error-logs', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.post('/api/ai/diagnose-error', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const { errorId } = req.body;
      
      const diagnosis = await aiAnalyst.diagnoseError(errorId, userId);
      res.json(diagnosis);
    } catch (error) {
      console.error('Error diagnosing error:', error);
      res.status(500).json({ error: 'Failed to diagnose error' });
    }
  });

  // AI Conversations - Multiple chats management
  app.get('/api/conversations', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const conversations = await storage.getAIConversations(userId);
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/conversations/:id', async (req, res) => {
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

  app.post('/api/conversations', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.patch('/api/conversations/:id', async (req, res) => {
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

  app.delete('/api/conversations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAIConversation(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  });

  app.post('/api/conversations/:id/message', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const { id } = req.params;
      const { message, context } = req.body;
      
      const result = await aiAnalyst.chatWithAssistant(userId, message, context, id);
      res.json(result);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Chat cost tracking
  app.get('/api/chat-logs', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.get('/api/chat-costs', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.post('/api/ai/error-logs/:id/resolve', async (req, res) => {
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

  // Export functionality
  app.get('/api/export/trades', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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
  app.get('/api/database/status', async (req, res) => {
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

  // Screener test endpoint for demonstrating different filter configurations
  app.post('/api/screener/test', async (req, res) => {
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
  app.post('/api/guardrails/test', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  // Strategy test endpoint - analyze watchlist pairs for signals
  app.post('/api/strategies/test', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const watchlist = await storage.getWatchlist(userId);
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

          const priceData = ohlcData.ohlc.map(candle => ({
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
