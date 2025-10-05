import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { KrakenService } from "./services/kraken";
import { TradingEngine } from "./services/trading-engine";
import { AIAnalyst } from "./services/ai-analyst";
import { MarketScanner } from "./services/market-scanner";
import { RiskManager } from "./services/risk-manager";
import { aiOpportunitiesService } from "./services/ai-opportunities";
import { insertTradingSettingsSchema, insertWatchlistPairSchema } from "@shared/schema";
import { databaseMonitor } from "./services/database-monitor";

const tradingEngines = new Map<string, TradingEngine>();
const marketScanner = new MarketScanner();
const aiAnalyst = new AIAnalyst();
const riskManager = new RiskManager();

// TEMPORARILY DISABLED: Do not ping Kraken for 1 hour (maintenance mode)
// marketScanner.startHourlyScanning();

// AI Opportunities service will be started conditionally based on user settings
// (service checks settings before starting hourly generation)
// TEMPORARILY DISABLED: Do not ping Kraken for 1 hour

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

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development'
    });
  });

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
      
      // TEMPORARILY DISABLED: Skip Kraken API calls (maintenance mode)
      // const liveBalance = await riskManager.getLiveKrakenBalance(userId);
      const metrics = await riskManager.getPortfolioMetrics(userId);
      const cashCrypto = await riskManager.getCashVsCrypto(userId);
      const winRateData = await riskManager.getWinRate(userId, 30);
      
      // Use internal calculation only (no Kraken API)
      const liveBalance = {
        totalValueUSD: metrics.totalValue,
        cashUSD: cashCrypto.cash,
        cryptoUSD: cashCrypto.crypto,
        syncTimestamp: Date.now(),
        source: 'internal' as const,
        error: 'Kraken API temporarily disabled (maintenance mode)'
      };
      
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

  app.get('/api/portfolio/earnings', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const earnings = await riskManager.getEarnings(userId);
      res.json(earnings);
    } catch (error) {
      console.error('Error fetching earnings:', error);
      res.status(500).json({ error: 'Failed to fetch earnings data' });
    }
  });

  app.get('/api/portfolio/earnings-chart', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const days = parseInt(req.query.days as string) || 30;
      const chartData = await riskManager.getEarningsChartData(userId, days);
      res.json(chartData);
    } catch (error) {
      console.error('Error fetching earnings chart data:', error);
      res.status(500).json({ error: 'Failed to fetch earnings chart data' });
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

  app.get('/api/portfolio/value-history', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const period = (req.query.period as string) || '30d';
      
      const user = await storage.getUser(userId);
      const initialBalance = user?.initialBalance || 50000;
      
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
          portfolioValueAtStart += trade.profitLoss || 0;
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
        if (trade.profitLoss) {
          currentValue += trade.profitLoss;
          dataPoints.push({
            date: trade.exitTime!,
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

  app.get('/api/portfolio/stats', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      
      const user = await storage.getUser(userId);
      const initialBalance = user?.initialBalance || 50000;
      
      const allTrades = await storage.getTrades(userId, {});
      const closedTrades = allTrades.filter(t => t.status === 'closed' && t.exitTime);
      
      const totalProfitLoss = closedTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
      const currentValue = initialBalance + totalProfitLoss;
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const tradesLast24h = closedTrades.filter(t => 
        t.exitTime && new Date(t.exitTime) >= yesterday
      );
      
      const change24h = tradesLast24h.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
      const valueYesterday = currentValue - change24h;
      const changePercent24h = valueYesterday !== 0 ? (change24h / valueYesterday) * 100 : 0;
      
      const winningTrades = closedTrades.filter(t => (t.profitLoss || 0) > 0).length;
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

  // Kill Switch Incident Analysis Conversation
  app.post('/api/kill-switch/create-analysis-chat', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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
          const parsed = JSON.parse(event.tradesClosed);
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
        accountEquity: event.accountEquity,
        portfolioValue: event.portfolioValue,
        killSwitchLimit: event.killSwitchLimit,
        warningTrigger: event.warningTrigger,
        tradesCount: closedTrades.length,
        closedTrades: closedTrades.map((t: any) => ({
          symbol: t.symbol,
          strategy: t.strategy,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          profitLoss: t.profitLoss,
          rMultiple: t.rMultiple
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
- Triggered: ${new Date(event.triggeredAt).toISOString()}
- Loss: ${event.lossPercent}% ($${event.lossAmount})
- Account Equity (before): $${event.accountEquity}
- Portfolio Value (after): $${event.portfolioValue}
- Kill Switch Limit: ${event.killSwitchLimit}%
- Warning Trigger: ${event.warningTrigger}%

TRADES CLOSED: ${closedTrades.length} positions
${closedTrades.map((t: any, i: number) => `
${i + 1}. ${t.symbol} (${t.strategy})
   Entry: $${t.entryPrice} → Exit: $${t.exitPrice}
   P/L: $${t.profitLoss} (${t.rMultiple}R)`).join('')}

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
        title: `Kill Switch Analysis - ${new Date(event.triggeredAt).toLocaleDateString()}`,
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

  // AI Opportunities routes
  app.get('/api/ai/opportunities', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.get('/api/ai/opportunities/latest-run', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const latestRun = await aiOpportunitiesService.getLatestRun(userId);
      res.json(latestRun || null);
    } catch (error) {
      console.error('Error fetching latest run:', error);
      res.status(500).json({ error: 'Failed to fetch latest run' });
    }
  });

  app.get('/api/ai/opportunities/validation-report', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const report = await aiOpportunitiesService.getValidationReport(userId);
      res.json(report);
    } catch (error) {
      console.error('Error generating validation report:', error);
      res.status(500).json({ error: 'Failed to generate validation report' });
    }
  });

  app.patch('/api/ai/opportunities/:id/status', async (req, res) => {
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

  app.post('/api/ai/opportunities/generate', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      
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

  // Reports Export API
  app.get('/api/reports/export', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  // Kill Switch endpoints
  app.get('/api/kill-switch/status', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.post('/api/kill-switch/check', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.post('/api/kill-switch/reset', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  app.get('/api/kill-switch/events', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const events = await storage.getKillSwitchEvents(userId, { limit });
      
      res.json(events);
    } catch (error: any) {
      console.error('Kill switch events error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test endpoint for simulating kill switch scenarios
  app.post('/api/test/simulate-loss', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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
        profitLoss: lossAmount.toString(),
        rMultiple: '-1.0',
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
        targetLossPercent,
        actualLossPercent: result.current24hPL
      });
    } catch (error: any) {
      console.error('Test simulate-loss error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test endpoint to check if trade execution is blocked during suspension
  app.post('/api/test/attempt-trade', async (req, res) => {
    try {
      const userId = req.headers['user-id'] as string || 'default-user';
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

  // TEST ENDPOINT: Test Kraken credentials
  app.get('/api/test/kraken-balance', async (_req, res) => {
    try {
      console.log('\n=== TESTING KRAKEN API CREDENTIALS ===');
      const krakenService = new KrakenService();
      console.log('Calling KrakenService.getAccountBalance()...');
      
      const balances = await krakenService.getAccountBalance();
      
      console.log('\n✅ SUCCESS! Kraken API returned balances:');
      console.log(JSON.stringify(balances, null, 2));
      console.log('=== END TEST ===\n');
      
      res.json({ 
        success: true, 
        message: 'Kraken API credentials are valid!',
        balances 
      });
    } catch (error: any) {
      console.error('\n❌ ERROR! Kraken API call failed:');
      console.error(error.message);
      console.error('=== END TEST ===\n');
      
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
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
      trade.stopLoss || '-',
      trade.target || '-',
      trade.exitPrice || '-',
      trade.quantity,
      trade.riskAmount || '-',
      trade.realizedPLR || '-',
      pl.toFixed(2),
      plPercent,
      holdTime,
      trade.notes || '-'
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
