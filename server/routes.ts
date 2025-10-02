import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { KrakenService } from "./services/kraken";
import { TradingEngine } from "./services/trading-engine";
import { AIAnalyst } from "./services/ai-analyst";
import { MarketScanner } from "./services/market-scanner";
import { RiskManager } from "./services/risk-manager";
import { insertTradingSettingsSchema, insertWatchlistPairSchema } from "@shared/schema";

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
      let settings = await storage.getTradingSettings(userId);
      
      if (!settings) {
        // Create default settings
        settings = await storage.createTradingSettings({ userId });
      }
      
      // Get user to include API key status
      const user = await storage.getUser(userId);
      const hasKrakenApiKey = !!(user?.krakenApiKey);
      const hasKrakenApiSecret = !!(user?.krakenApiSecret);
      
      res.json({
        ...settings,
        hasKrakenApiKey,
        hasKrakenApiSecret,
        // Don't send actual keys for security - only indicate if they exist
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
      const { krakenApiKey, krakenApiSecret, ...settingsData } = req.body;
      
      // Update Kraken API credentials if provided
      // Empty string explicitly clears the stored credential
      if (krakenApiKey !== undefined || krakenApiSecret !== undefined) {
        const userUpdates: any = {};
        
        // Use explicit null or the value (Drizzle handles null correctly)
        if (krakenApiKey !== undefined) {
          if (krakenApiKey === '') {
            // Use raw SQL to set NULL explicitly
            await db.update(users).set({ krakenApiKey: sql`NULL` }).where(eq(users.id, userId));
          } else {
            userUpdates.krakenApiKey = krakenApiKey;
          }
        }
        
        if (krakenApiSecret !== undefined) {
          if (krakenApiSecret === '') {
            await db.update(users).set({ krakenApiSecret: sql`NULL` }).where(eq(users.id, userId));
          } else {
            userUpdates.krakenApiSecret = krakenApiSecret;
          }
        }
        
        // Update non-null values
        if (Object.keys(userUpdates).length > 0) {
          await storage.updateUser(userId, userUpdates);
        }
      }
      
      // Update trading settings
      const validatedData = insertTradingSettingsSchema.omit({ userId: true }).parse(settingsData);
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
      
      // Get user to retrieve API credentials
      // Priority: Environment secrets → Database → empty
      const user = await storage.getUser(userId);
      const apiKey = process.env.KRAKEN_API_KEY || user?.krakenApiKey;
      const apiSecret = process.env.KRAKEN_API_SECRET || user?.krakenApiSecret;
      
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
