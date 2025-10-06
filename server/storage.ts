import { 
  users, 
  tradingSettings,
  strategySettings,
  strategySettingsAudit,
  watchlistPairs,
  trades,
  aiReports,
  aiConversations,
  aiChatLogs,
  aiMarketAnalyses,
  priceData,
  databaseSizeLogs,
  aiAuditLog,
  errorLogs,
  killSwitchEvents,
  aiOpportunityRuns,
  aiOpportunities,
  dailyBriefs,
  paperTrades,
  paperDailyBriefs,
  paperAIReports,
  signalWeights,
  predictionOutcomes,
  featureSnapshots,
  userGoalsLive,
  userGoalsPaper,
  goalAnalysisHistoryLive,
  goalAnalysisHistoryPaper,
  type User, 
  type InsertUser,
  type TradingSettings,
  type InsertTradingSettings,
  type StrategySettings,
  type InsertStrategySettings,
  type StrategySettingsAudit,
  type InsertStrategySettingsAudit,
  type WatchlistPair,
  type InsertWatchlistPair,
  type Trade,
  type InsertTrade,
  type AIReport,
  type InsertAIReport,
  type AIConversation,
  type InsertAIConversation,
  type AIChatLog,
  type InsertAIChatLog,
  type AiMarketAnalysis,
  type InsertAiMarketAnalysis,
  type PriceData,
  type InsertPriceData,
  type DatabaseSizeLog,
  type InsertDatabaseSizeLog,
  type AIAuditLog,
  type InsertAIAuditLog,
  type ErrorLog,
  type InsertErrorLog,
  type KillSwitchEvent,
  type InsertKillSwitchEvent,
  type AIOpportunityRun,
  type InsertAIOpportunityRun,
  type AIOpportunity,
  type InsertAIOpportunity,
  type DailyBrief,
  type InsertDailyBrief,
  type PaperTrade,
  type InsertPaperTrade,
  type PaperDailyBrief,
  type InsertPaperDailyBrief,
  type PaperAIReport,
  type InsertPaperAIReport,
  type SignalWeight,
  type InsertSignalWeight,
  type PredictionOutcome,
  type InsertPredictionOutcome,
  type FeatureSnapshot,
  type InsertFeatureSnapshot,
  type UserGoalLive,
  type InsertUserGoalLive,
  type UserGoalPaper,
  type InsertUserGoalPaper,
  type GoalAnalysisHistoryLive,
  type InsertGoalAnalysisHistoryLive,
  type GoalAnalysisHistoryPaper,
  type InsertGoalAnalysisHistoryPaper
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Trading settings methods
  getTradingSettings(userId: string): Promise<TradingSettings | undefined>;
  createTradingSettings(settings: InsertTradingSettings): Promise<TradingSettings>;
  updateTradingSettings(userId: string, updates: Partial<TradingSettings>): Promise<TradingSettings>;

  // Strategy settings methods
  getStrategySettings(params: { userId: string; mode: 'live' | 'paper'; strategy: string }): Promise<StrategySettings | null>;
  listStrategySettings(params: { userId: string; mode: 'live' | 'paper' }): Promise<StrategySettings[]>;
  upsertStrategySettings(row: InsertStrategySettings): Promise<StrategySettings>;
  insertStrategySettingsAudit(row: InsertStrategySettingsAudit): Promise<void>;
  listStrategySettingsAudit(params: { userId: string; limit?: number }): Promise<StrategySettingsAudit[]>;

  // Watchlist methods
  getWatchlist(userId: string): Promise<WatchlistPair[]>;
  addWatchlistPair(pair: InsertWatchlistPair): Promise<WatchlistPair>;
  updateWatchlistPair(id: string, updates: Partial<WatchlistPair>): Promise<WatchlistPair>;
  removeWatchlistPair(id: string): Promise<void>;

  // Trade methods
  getTrades(userId: string, filters?: { status?: string; symbol?: string; strategy?: string; limit?: number }): Promise<Trade[]>;
  getActiveTrades(userId: string): Promise<Trade[]>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  updateTrade(id: string, updates: Partial<Trade>): Promise<Trade>;
  closeTrade(id: string, exitPrice: number, exitFee: number, exitSlippage: number): Promise<Trade>;

  // AI methods
  getAIReports(userId: string, type?: string, limit?: number): Promise<AIReport[]>;
  createAIReport(report: InsertAIReport): Promise<AIReport>;
  
  // AI Conversations - multiple chats support
  getAIConversations(userId: string): Promise<AIConversation[]>;
  getAIConversationById(conversationId: string): Promise<AIConversation | undefined>;
  getAIConversation(userId: string): Promise<AIConversation | undefined>; // Legacy - gets most recent
  createAIConversation(conversation: InsertAIConversation): Promise<AIConversation>;
  updateAIConversation(userId: string, conversation: InsertAIConversation): Promise<AIConversation>; // Legacy
  updateAIConversationById(conversationId: string, updates: Partial<AIConversation>): Promise<AIConversation>;
  deleteAIConversation(conversationId: string): Promise<void>;
  
  // AI Chat Logs - cost tracking
  createChatLog(log: InsertAIChatLog): Promise<AIChatLog>;
  getChatLogs(userId: string, conversationId?: string, limit?: number): Promise<AIChatLog[]>;
  getChatCostSummary(userId: string, fromDate?: Date, toDate?: Date): Promise<{
    totalCost: number;
    totalTokens: number;
    requestCount: number;
  }>;

  // AI Market Analysis methods
  getLatestAiMarketAnalysis(mode: 'live' | 'paper'): Promise<AiMarketAnalysis | null>;
  getAiMarketAnalysesByRange(params: { mode: 'live' | 'paper'; from: string; to: string }): Promise<AiMarketAnalysis[]>;
  insertAiMarketAnalysis(row: InsertAiMarketAnalysis): Promise<AiMarketAnalysis>;
  upsertAiMarketAnalysisByDateMode(row: InsertAiMarketAnalysis): Promise<AiMarketAnalysis>;

  // Price data methods
  getPriceData(symbol: string, from?: Date, to?: Date): Promise<PriceData[]>;
  savePriceData(data: InsertPriceData[]): Promise<void>;

  // Database size monitoring methods
  logDatabaseSize(log: InsertDatabaseSizeLog): Promise<DatabaseSizeLog>;
  getLatestDatabaseSize(): Promise<DatabaseSizeLog | undefined>;
  getDatabaseSizeHistory(limit?: number): Promise<DatabaseSizeLog[]>;

  // AI audit log methods
  createAuditLog(log: InsertAIAuditLog): Promise<AIAuditLog>;
  getAuditLogs(userId: string, limit?: number): Promise<AIAuditLog[]>;
  getAuditLogsByAction(userId: string, actionType: string, limit?: number): Promise<AIAuditLog[]>;
  updateAuditLogStatus(id: string, status: string): Promise<AIAuditLog>;

  // Error log methods
  createErrorLog(log: InsertErrorLog): Promise<ErrorLog>;
  getErrorLogs(userId?: string, filters?: { resolved?: boolean; errorType?: string; limit?: number }): Promise<ErrorLog[]>;
  resolveErrorLog(id: string, notes?: string): Promise<ErrorLog>;

  // Kill switch methods
  createKillSwitchEvent(event: InsertKillSwitchEvent): Promise<KillSwitchEvent>;
  getKillSwitchEvents(userId: string, filters?: { resolved?: boolean; limit?: number }): Promise<KillSwitchEvent[]>;
  getKillSwitchEventById(id: string): Promise<KillSwitchEvent | undefined>;
  getLatestKillSwitchEvent(userId: string): Promise<KillSwitchEvent | undefined>;
  resolveKillSwitchEvent(id: string, method: string, notes?: string): Promise<KillSwitchEvent>;

  // AI Opportunities methods
  createAIOpportunityRun(run: InsertAIOpportunityRun): Promise<AIOpportunityRun>;
  updateAIOpportunityRun(id: string, updates: Partial<AIOpportunityRun>): Promise<AIOpportunityRun>;
  getLatestAIOpportunityRun(userId: string): Promise<AIOpportunityRun | undefined>;
  
  createAIOpportunity(opportunity: InsertAIOpportunity): Promise<AIOpportunity>;
  updateAIOpportunity(id: string, updates: Partial<AIOpportunity>): Promise<AIOpportunity>;
  getAIOpportunities(userId: string, filters?: { status?: string; type?: string; minProbability?: number }): Promise<AIOpportunity[]>;
  getAIOpportunitiesByRun(runId: string): Promise<AIOpportunity[]>;

  // Daily brief methods
  createDailyBrief(brief: InsertDailyBrief): Promise<DailyBrief>;
  updateDailyBrief(id: string, updates: Partial<DailyBrief>): Promise<DailyBrief>;
  getDailyBrief(userId: string, date: string): Promise<DailyBrief | undefined>;
  getDailyBriefs(userId: string, filters?: { status?: string; limit?: number }): Promise<DailyBrief[]>;
  finalizeDailyBrief(id: string): Promise<DailyBrief>;

  // Paper trading methods (simulated trades - isolated from live)
  createPaperTrade(trade: InsertPaperTrade): Promise<PaperTrade>;
  updatePaperTrade(id: string, updates: Partial<PaperTrade>): Promise<PaperTrade>;
  getPaperTradeById(id: string): Promise<PaperTrade | undefined>;
  getAllPaperTrades(userId: string): Promise<PaperTrade[]>;
  getOpenPaperTrades(userId: string): Promise<PaperTrade[]>;
  deleteAllPaperTrades(userId: string): Promise<void>;

  // Paper daily brief methods
  createPaperDailyBrief(brief: InsertPaperDailyBrief): Promise<PaperDailyBrief>;
  updatePaperDailyBrief(id: string, updates: Partial<PaperDailyBrief>): Promise<PaperDailyBrief>;
  getPaperDailyBrief(userId: string, date: string): Promise<PaperDailyBrief | undefined>;
  getPaperDailyBriefs(userId: string, filters?: { status?: string; limit?: number }): Promise<PaperDailyBrief[]>;
  finalizePaperDailyBrief(id: string): Promise<PaperDailyBrief>;

  // Paper AI report methods
  createPaperAIReport(report: InsertPaperAIReport): Promise<PaperAIReport>;
  getPaperAIReports(userId: string, type?: string, limit?: number): Promise<PaperAIReport[]>;

  // Signal weight methods
  getSignalWeights(userId: string, strategy?: string, mode?: string): Promise<SignalWeight[]>;
  getSignalWeight(userId: string, strategy: string, mode: string, signalName: string): Promise<SignalWeight | undefined>;
  createSignalWeight(weight: InsertSignalWeight): Promise<SignalWeight>;
  updateSignalWeight(id: string, updates: Partial<SignalWeight>): Promise<SignalWeight>;
  upsertSignalWeight(weight: InsertSignalWeight): Promise<SignalWeight>;

  // Prediction outcome methods
  createPredictionOutcome(outcome: InsertPredictionOutcome): Promise<PredictionOutcome>;
  updatePredictionOutcome(id: string, updates: Partial<PredictionOutcome>): Promise<PredictionOutcome>;
  getPredictionOutcomes(userId: string, filters?: { mode?: string; strategy?: string; fromDate?: Date; toDate?: Date; limit?: number }): Promise<PredictionOutcome[]>;
  getPredictionAccuracy(userId: string, mode: string, strategy?: string, days?: number): Promise<{ accuracy: number; totalPredictions: number; correctPredictions: number }>;

  // Feature snapshot methods
  createFeatureSnapshot(snapshot: InsertFeatureSnapshot): Promise<FeatureSnapshot>;
  getFeatureSnapshots(symbol: string, fromDate?: Date, toDate?: Date, limit?: number): Promise<FeatureSnapshot[]>;
  getLatestFeatureSnapshot(symbol: string): Promise<FeatureSnapshot | undefined>;

  // Goals Engine methods - Live mode
  getUserGoalsLive(userId: string): Promise<UserGoalLive[]>;
  getGoalLive(userId: string, metricName: string): Promise<UserGoalLive | undefined>;
  createGoalLive(goal: InsertUserGoalLive): Promise<UserGoalLive>;
  updateGoalLive(id: string, updates: Partial<UserGoalLive>): Promise<UserGoalLive>;
  upsertGoalLive(goal: InsertUserGoalLive): Promise<UserGoalLive>;
  deleteGoalLive(id: string): Promise<void>;

  // Goals Engine methods - Paper mode
  getUserGoalsPaper(userId: string): Promise<UserGoalPaper[]>;
  getGoalPaper(userId: string, metricName: string): Promise<UserGoalPaper | undefined>;
  createGoalPaper(goal: InsertUserGoalPaper): Promise<UserGoalPaper>;
  updateGoalPaper(id: string, updates: Partial<UserGoalPaper>): Promise<UserGoalPaper>;
  upsertGoalPaper(goal: InsertUserGoalPaper): Promise<UserGoalPaper>;
  deleteGoalPaper(id: string): Promise<void>;

  // Goal Analysis History - Live mode
  createGoalAnalysisLive(analysis: InsertGoalAnalysisHistoryLive): Promise<GoalAnalysisHistoryLive>;
  getGoalAnalysisHistoryLive(userId: string, limit?: number): Promise<GoalAnalysisHistoryLive[]>;

  // Goal Analysis History - Paper mode
  createGoalAnalysisPaper(analysis: InsertGoalAnalysisHistoryPaper): Promise<GoalAnalysisHistoryPaper>;
  getGoalAnalysisHistoryPaper(userId: string, limit?: number): Promise<GoalAnalysisHistoryPaper[]>;

  // User utility methods
  getAllUsers(): Promise<User[]>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  // Trading settings methods
  async getTradingSettings(userId: string): Promise<TradingSettings | undefined> {
    const [settings] = await db
      .select()
      .from(tradingSettings)
      .where(eq(tradingSettings.userId, userId));
    return settings || undefined;
  }

  async createTradingSettings(settings: InsertTradingSettings): Promise<TradingSettings> {
    const [result] = await db.insert(tradingSettings).values(settings).returning();
    return result;
  }

  async updateTradingSettings(userId: string, updates: Partial<TradingSettings>): Promise<TradingSettings> {
    const [result] = await db
      .update(tradingSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tradingSettings.userId, userId))
      .returning();
    return result;
  }

  // Strategy settings methods
  async getStrategySettings(params: { userId: string; mode: 'live' | 'paper'; strategy: string }): Promise<StrategySettings | null> {
    const [result] = await db
      .select()
      .from(strategySettings)
      .where(
        and(
          eq(strategySettings.userId, params.userId),
          eq(strategySettings.mode, params.mode),
          eq(strategySettings.strategy, params.strategy as any)
        )
      );
    return result || null;
  }

  async listStrategySettings(params: { userId: string; mode: 'live' | 'paper' }): Promise<StrategySettings[]> {
    return await db
      .select()
      .from(strategySettings)
      .where(
        and(
          eq(strategySettings.userId, params.userId),
          eq(strategySettings.mode, params.mode)
        )
      )
      .orderBy(strategySettings.strategy);
  }

  async upsertStrategySettings(row: InsertStrategySettings): Promise<StrategySettings> {
    const [result] = await db
      .insert(strategySettings)
      .values(row)
      .onConflictDoUpdate({
        target: [strategySettings.userId, strategySettings.mode, strategySettings.strategy],
        set: {
          enabled: row.enabled ?? true,
          params: row.params,
          version: sql`${strategySettings.version} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async insertStrategySettingsAudit(row: InsertStrategySettingsAudit): Promise<void> {
    await db.insert(strategySettingsAudit).values(row);
  }

  async listStrategySettingsAudit(params: { userId: string; limit?: number }): Promise<StrategySettingsAudit[]> {
    const limit = params.limit || 50;
    return await db
      .select()
      .from(strategySettingsAudit)
      .where(eq(strategySettingsAudit.userId, params.userId))
      .orderBy(desc(strategySettingsAudit.createdAt))
      .limit(limit);
  }

  // Watchlist methods
  async getWatchlist(userId: string): Promise<WatchlistPair[]> {
    return await db
      .select()
      .from(watchlistPairs)
      .where(and(eq(watchlistPairs.userId, userId), eq(watchlistPairs.isActive, true)))
      .orderBy(desc(watchlistPairs.addedAt));
  }

  async addWatchlistPair(pair: InsertWatchlistPair): Promise<WatchlistPair> {
    const [result] = await db.insert(watchlistPairs).values(pair).returning();
    return result;
  }

  async updateWatchlistPair(id: string, updates: Partial<WatchlistPair>): Promise<WatchlistPair> {
    const [result] = await db
      .update(watchlistPairs)
      .set(updates)
      .where(eq(watchlistPairs.id, id))
      .returning();
    return result;
  }

  async removeWatchlistPair(id: string): Promise<void> {
    await db.update(watchlistPairs)
      .set({ isActive: false })
      .where(eq(watchlistPairs.id, id));
  }

  // Trade methods
  async getTrades(
    userId: string, 
    filters?: { status?: string; symbol?: string; strategy?: string; limit?: number }
  ): Promise<Trade[]> {
    const conditions = [eq(trades.userId, userId)];
    
    if (filters?.status) {
      conditions.push(eq(trades.status, filters.status as any));
    }
    if (filters?.symbol) {
      conditions.push(eq(trades.symbol, filters.symbol));
    }
    if (filters?.strategy) {
      conditions.push(eq(trades.strategy, filters.strategy as any));
    }
    
    let query = db.select().from(trades).where(and(...conditions)).orderBy(desc(trades.entryTime));
    
    if (filters?.limit) {
      return await query.limit(filters.limit);
    }
    
    return await query;
  }

  async getActiveTrades(userId: string): Promise<Trade[]> {
    return await db
      .select()
      .from(trades)
      .where(and(eq(trades.userId, userId), eq(trades.status, "open")))
      .orderBy(desc(trades.entryTime));
  }

  async createTrade(trade: InsertTrade): Promise<Trade> {
    const [result] = await db.insert(trades).values(trade).returning();
    return result;
  }

  async updateTrade(id: string, updates: Partial<Trade>): Promise<Trade> {
    const [result] = await db
      .update(trades)
      .set(updates)
      .where(eq(trades.id, id))
      .returning();
    return result;
  }

  async closeTrade(id: string, exitPrice: number, exitFee: number, exitSlippage: number): Promise<Trade> {
    const [trade] = await db.select().from(trades).where(eq(trades.id, id));
    
    if (!trade) {
      throw new Error("Trade not found");
    }

    const entryValue = parseFloat(trade.entryPrice) * parseFloat(trade.quantity);
    const exitValue = exitPrice * parseFloat(trade.quantity);
    const totalFees = parseFloat(trade.entryFee || "0") + exitFee;
    const realizedPL = exitValue - entryValue - totalFees;
    const realizedPLPercent = (realizedPL / entryValue) * 100;
    const realizedPLR = realizedPL / parseFloat(trade.riskAmount);

    const [result] = await db
      .update(trades)
      .set({
        status: "closed",
        exitPrice: exitPrice.toString(),
        exitFee: exitFee.toString(),
        exitSlippage: exitSlippage.toString(),
        realizedPL: realizedPL.toString(),
        realizedPLPercent: realizedPLPercent.toString(),
        realizedPLR: realizedPLR.toString(),
        exitTime: new Date(),
      })
      .where(eq(trades.id, id))
      .returning();

    // Update prediction outcome for Learning Feedback Engine
    try {
      const [predictionOutcome] = await db
        .select()
        .from(predictionOutcomes)
        .where(eq(predictionOutcomes.tradeId, id))
        .limit(1);

      if (predictionOutcome) {
        // Define threshold for neutral predictions (2% of risk amount)
        const neutralThreshold = parseFloat(trade.riskAmount) * 0.02;
        
        const actualDirection = realizedPL > neutralThreshold ? 'long' : 
                                realizedPL < -neutralThreshold ? 'short' : 
                                'neutral';
        
        // Check prediction correctness based on direction
        let predictionCorrect = false;
        if (predictionOutcome.predictedDirection === 'long') {
          predictionCorrect = realizedPL > 0;
        } else if (predictionOutcome.predictedDirection === 'short') {
          predictionCorrect = realizedPL < 0;
        } else if (predictionOutcome.predictedDirection === 'neutral') {
          // Neutral prediction is correct if P&L is within threshold range
          predictionCorrect = Math.abs(realizedPL) <= neutralThreshold;
        }

        await db
          .update(predictionOutcomes)
          .set({
            actualDirection,
            actualOutcome: realizedPL.toString(),
            deltaPercent: realizedPLPercent.toString(),
            correct: predictionCorrect,
            completedAt: new Date()
          })
          .where(eq(predictionOutcomes.id, predictionOutcome.id));

        console.log(`📊 Prediction outcome updated for trade ${id}: ${predictionCorrect ? '✅ Correct' : '❌ Incorrect'} (predicted: ${predictionOutcome.predictedDirection}, actual: ${actualDirection}, P/L: $${realizedPL.toFixed(2)})`);
      }
    } catch (error) {
      console.error('Error updating prediction outcome:', error);
    }

    return result;
  }

  // AI methods
  async getAIReports(userId: string, type?: string, limit = 10): Promise<AIReport[]> {
    const conditions = [eq(aiReports.userId, userId)];
    
    if (type) {
      conditions.push(eq(aiReports.reportType, type));
    }
    
    return await db.select().from(aiReports)
      .where(and(...conditions))
      .orderBy(desc(aiReports.generatedAt))
      .limit(limit);
  }

  async createAIReport(report: InsertAIReport): Promise<AIReport> {
    const [result] = await db.insert(aiReports).values(report).returning();
    return result;
  }

  async getAIConversation(userId: string): Promise<AIConversation | undefined> {
    const [conversation] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.lastUpdated))
      .limit(1);
    return conversation || undefined;
  }

  async updateAIConversation(userId: string, conversation: InsertAIConversation): Promise<AIConversation> {
    const existing = await this.getAIConversation(userId);
    
    if (existing) {
      const [result] = await db
        .update(aiConversations)
        .set({ ...conversation, lastUpdated: new Date() })
        .where(eq(aiConversations.id, existing.id))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(aiConversations).values(conversation).returning();
      return result;
    }
  }

  // AI Conversations - multiple chats support
  async getAIConversations(userId: string): Promise<AIConversation[]> {
    return await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.userId, userId))
      .orderBy(desc(aiConversations.lastUpdated));
  }

  async getAIConversationById(conversationId: string): Promise<AIConversation | undefined> {
    const [conversation] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId))
      .limit(1);
    return conversation || undefined;
  }

  async createAIConversation(conversation: InsertAIConversation): Promise<AIConversation> {
    const [result] = await db.insert(aiConversations).values(conversation).returning();
    return result;
  }

  async updateAIConversationById(conversationId: string, updates: Partial<AIConversation>): Promise<AIConversation> {
    const [result] = await db
      .update(aiConversations)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(aiConversations.id, conversationId))
      .returning();
    return result;
  }

  async deleteAIConversation(conversationId: string): Promise<void> {
    await db.delete(aiConversations).where(eq(aiConversations.id, conversationId));
  }

  // AI Chat Logs - cost tracking
  async createChatLog(log: InsertAIChatLog): Promise<AIChatLog> {
    const [result] = await db.insert(aiChatLogs).values(log).returning();
    return result;
  }

  async getChatLogs(userId: string, conversationId?: string, limit = 50): Promise<AIChatLog[]> {
    const conditions = [eq(aiChatLogs.userId, userId)];
    
    if (conversationId) {
      conditions.push(eq(aiChatLogs.conversationId, conversationId));
    }
    
    return await db
      .select()
      .from(aiChatLogs)
      .where(and(...conditions))
      .orderBy(desc(aiChatLogs.timestamp))
      .limit(limit);
  }

  async getChatCostSummary(userId: string, fromDate?: Date, toDate?: Date): Promise<{
    totalCost: number;
    totalTokens: number;
    requestCount: number;
  }> {
    const conditions = [eq(aiChatLogs.userId, userId)];
    
    if (fromDate) {
      conditions.push(gte(aiChatLogs.timestamp, fromDate));
    }
    if (toDate) {
      conditions.push(lte(aiChatLogs.timestamp, toDate));
    }
    
    const logs = await db
      .select()
      .from(aiChatLogs)
      .where(and(...conditions));
    
    return {
      totalCost: logs.reduce((sum, log) => sum + parseFloat(log.estimatedCost), 0),
      totalTokens: logs.reduce((sum, log) => sum + log.totalTokens, 0),
      requestCount: logs.length
    };
  }

  // AI Market Analysis methods
  async getLatestAiMarketAnalysis(mode: 'live' | 'paper'): Promise<AiMarketAnalysis | null> {
    const [result] = await db
      .select()
      .from(aiMarketAnalyses)
      .where(eq(aiMarketAnalyses.mode, mode))
      .orderBy(desc(aiMarketAnalyses.date), desc(aiMarketAnalyses.createdAt))
      .limit(1);
    
    return result || null;
  }

  async getAiMarketAnalysesByRange(params: { mode: 'live' | 'paper'; from: string; to: string }): Promise<AiMarketAnalysis[]> {
    return await db
      .select()
      .from(aiMarketAnalyses)
      .where(
        and(
          eq(aiMarketAnalyses.mode, params.mode),
          gte(aiMarketAnalyses.date, params.from),
          lte(aiMarketAnalyses.date, params.to)
        )
      )
      .orderBy(desc(aiMarketAnalyses.date));
  }

  async insertAiMarketAnalysis(row: InsertAiMarketAnalysis): Promise<AiMarketAnalysis> {
    const [result] = await db.insert(aiMarketAnalyses).values(row).returning();
    return result;
  }

  async upsertAiMarketAnalysisByDateMode(row: InsertAiMarketAnalysis): Promise<AiMarketAnalysis> {
    const [result] = await db
      .insert(aiMarketAnalyses)
      .values(row)
      .onConflictDoUpdate({
        target: [aiMarketAnalyses.date, aiMarketAnalyses.mode],
        set: {
          regime: row.regime,
          confidence: row.confidence,
          summary: row.summary,
          recommendations: row.recommendations,
          snapshot: row.snapshot,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    
    return result;
  }

  // Price data methods
  async getPriceData(symbol: string, from?: Date, to?: Date): Promise<PriceData[]> {
    const conditions = [eq(priceData.symbol, symbol)];
    
    if (from) {
      conditions.push(gte(priceData.timestamp, from));
    }
    if (to) {
      conditions.push(lte(priceData.timestamp, to));
    }
    
    return await db.select().from(priceData)
      .where(and(...conditions))
      .orderBy(priceData.timestamp);
  }

  async savePriceData(data: InsertPriceData[]): Promise<void> {
    if (data.length > 0) {
      await db.insert(priceData).values(data);
    }
  }

  // Database size monitoring methods
  async logDatabaseSize(log: InsertDatabaseSizeLog): Promise<DatabaseSizeLog> {
    const [result] = await db.insert(databaseSizeLogs).values(log).returning();
    return result;
  }

  async getLatestDatabaseSize(): Promise<DatabaseSizeLog | undefined> {
    const [result] = await db
      .select()
      .from(databaseSizeLogs)
      .orderBy(desc(databaseSizeLogs.checkedAt))
      .limit(1);
    return result || undefined;
  }

  async getDatabaseSizeHistory(limit = 30): Promise<DatabaseSizeLog[]> {
    return await db
      .select()
      .from(databaseSizeLogs)
      .orderBy(desc(databaseSizeLogs.checkedAt))
      .limit(limit);
  }

  // AI audit log methods
  async createAuditLog(log: InsertAIAuditLog): Promise<AIAuditLog> {
    const [result] = await db.insert(aiAuditLog).values(log).returning();
    return result;
  }

  async getAuditLogs(userId: string, limit = 50): Promise<AIAuditLog[]> {
    return await db
      .select()
      .from(aiAuditLog)
      .where(eq(aiAuditLog.userId, userId))
      .orderBy(desc(aiAuditLog.timestamp))
      .limit(limit);
  }

  async getAuditLogsByAction(userId: string, actionType: string, limit = 50): Promise<AIAuditLog[]> {
    return await db
      .select()
      .from(aiAuditLog)
      .where(and(eq(aiAuditLog.userId, userId), eq(aiAuditLog.actionType, actionType)))
      .orderBy(desc(aiAuditLog.timestamp))
      .limit(limit);
  }

  async updateAuditLogStatus(id: string, status: string): Promise<AIAuditLog> {
    const [result] = await db
      .update(aiAuditLog)
      .set({ status })
      .where(eq(aiAuditLog.id, id))
      .returning();
    return result;
  }

  // Error log methods
  async createErrorLog(log: InsertErrorLog): Promise<ErrorLog> {
    const [result] = await db.insert(errorLogs).values(log).returning();
    return result;
  }

  async getErrorLogs(
    userId?: string,
    filters?: { resolved?: boolean; errorType?: string; limit?: number }
  ): Promise<ErrorLog[]> {
    const conditions = [];
    
    if (userId) {
      conditions.push(eq(errorLogs.userId, userId));
    }
    if (filters?.resolved !== undefined) {
      conditions.push(eq(errorLogs.resolved, filters.resolved));
    }
    if (filters?.errorType) {
      conditions.push(eq(errorLogs.errorType, filters.errorType));
    }
    
    const query = db.select().from(errorLogs)
      .orderBy(desc(errorLogs.timestamp));
    
    if (conditions.length > 0) {
      const limitedQuery = query.where(and(...conditions));
      return await (filters?.limit ? limitedQuery.limit(filters.limit) : limitedQuery);
    }
    
    return await (filters?.limit ? query.limit(filters.limit) : query);
  }

  async resolveErrorLog(id: string, notes?: string): Promise<ErrorLog> {
    const [result] = await db
      .update(errorLogs)
      .set({ resolved: true, resolvedAt: new Date(), notes })
      .where(eq(errorLogs.id, id))
      .returning();
    return result;
  }

  // Kill switch methods
  async createKillSwitchEvent(event: InsertKillSwitchEvent): Promise<KillSwitchEvent> {
    const [result] = await db.insert(killSwitchEvents).values(event).returning();
    return result;
  }

  async getKillSwitchEvents(
    userId: string,
    filters?: { resolved?: boolean; limit?: number }
  ): Promise<KillSwitchEvent[]> {
    const conditions = [eq(killSwitchEvents.userId, userId)];
    
    if (filters?.resolved !== undefined) {
      conditions.push(eq(killSwitchEvents.resolved, filters.resolved));
    }
    
    const query = db
      .select()
      .from(killSwitchEvents)
      .where(and(...conditions))
      .orderBy(desc(killSwitchEvents.triggeredAt));
    
    return await (filters?.limit ? query.limit(filters.limit) : query);
  }

  async getKillSwitchEventById(id: string): Promise<KillSwitchEvent | undefined> {
    const [result] = await db
      .select()
      .from(killSwitchEvents)
      .where(eq(killSwitchEvents.id, id))
      .limit(1);
    return result || undefined;
  }

  async getLatestKillSwitchEvent(userId: string): Promise<KillSwitchEvent | undefined> {
    const [result] = await db
      .select()
      .from(killSwitchEvents)
      .where(eq(killSwitchEvents.userId, userId))
      .orderBy(desc(killSwitchEvents.triggeredAt))
      .limit(1);
    return result || undefined;
  }

  async resolveKillSwitchEvent(id: string, method: string, notes?: string): Promise<KillSwitchEvent> {
    const [result] = await db
      .update(killSwitchEvents)
      .set({ 
        resolved: true, 
        resolvedAt: new Date(), 
        resolvedMethod: method,
        notes 
      })
      .where(eq(killSwitchEvents.id, id))
      .returning();
    return result;
  }

  // AI Opportunities methods
  async createAIOpportunityRun(run: InsertAIOpportunityRun): Promise<AIOpportunityRun> {
    const [result] = await db.insert(aiOpportunityRuns).values(run).returning();
    return result;
  }

  async updateAIOpportunityRun(id: string, updates: Partial<AIOpportunityRun>): Promise<AIOpportunityRun> {
    const [result] = await db
      .update(aiOpportunityRuns)
      .set(updates)
      .where(eq(aiOpportunityRuns.id, id))
      .returning();
    return result;
  }

  async getLatestAIOpportunityRun(userId: string): Promise<AIOpportunityRun | undefined> {
    const [result] = await db
      .select()
      .from(aiOpportunityRuns)
      .where(eq(aiOpportunityRuns.userId, userId))
      .orderBy(desc(aiOpportunityRuns.startedAt))
      .limit(1);
    return result || undefined;
  }

  async createAIOpportunity(opportunity: InsertAIOpportunity): Promise<AIOpportunity> {
    const [result] = await db.insert(aiOpportunities).values(opportunity).returning();
    return result;
  }

  async updateAIOpportunity(id: string, updates: Partial<AIOpportunity>): Promise<AIOpportunity> {
    const [result] = await db
      .update(aiOpportunities)
      .set(updates)
      .where(eq(aiOpportunities.id, id))
      .returning();
    return result;
  }

  async getAIOpportunities(
    userId: string, 
    filters?: { status?: string; type?: string; minProbability?: number }
  ): Promise<AIOpportunity[]> {
    const conditions = [eq(aiOpportunities.userId, userId)];
    
    if (filters?.status) {
      conditions.push(eq(aiOpportunities.status, filters.status as any));
    }
    if (filters?.type) {
      conditions.push(eq(aiOpportunities.type, filters.type as any));
    }
    if (filters?.minProbability !== undefined) {
      conditions.push(gte(aiOpportunities.probabilityScore, filters.minProbability));
    }
    
    const query = db
      .select()
      .from(aiOpportunities)
      .where(and(...conditions))
      .orderBy(desc(aiOpportunities.createdAt));
    
    return await query;
  }

  async getAIOpportunitiesByRun(runId: string): Promise<AIOpportunity[]> {
    return await db
      .select()
      .from(aiOpportunities)
      .where(eq(aiOpportunities.runId, runId))
      .orderBy(desc(aiOpportunities.probabilityScore));
  }

  // Daily brief methods
  async createDailyBrief(brief: InsertDailyBrief): Promise<DailyBrief> {
    const [result] = await db.insert(dailyBriefs).values(brief).returning();
    return result;
  }

  async updateDailyBrief(id: string, updates: Partial<DailyBrief>): Promise<DailyBrief> {
    const [result] = await db
      .update(dailyBriefs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(dailyBriefs.id, id))
      .returning();
    return result;
  }

  async getDailyBrief(userId: string, date: string): Promise<DailyBrief | undefined> {
    const [result] = await db
      .select()
      .from(dailyBriefs)
      .where(and(eq(dailyBriefs.userId, userId), eq(dailyBriefs.date, date)));
    return result || undefined;
  }

  async getDailyBriefs(userId: string, filters?: { status?: string; limit?: number }): Promise<DailyBrief[]> {
    const conditions = [eq(dailyBriefs.userId, userId)];
    
    if (filters?.status) {
      conditions.push(eq(dailyBriefs.status, filters.status as any));
    }
    
    const query = db
      .select()
      .from(dailyBriefs)
      .where(and(...conditions))
      .orderBy(desc(dailyBriefs.date));
    
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    
    return await query;
  }

  async finalizeDailyBrief(id: string): Promise<DailyBrief> {
    const [result] = await db
      .update(dailyBriefs)
      .set({ 
        status: 'final' as const,
        finalizedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(dailyBriefs.id, id))
      .returning();
    return result;
  }

  // Paper trading methods (completely isolated from live)
  async createPaperTrade(trade: InsertPaperTrade): Promise<PaperTrade> {
    const [result] = await db.insert(paperTrades).values(trade).returning();
    return result;
  }

  async updatePaperTrade(id: string, updates: Partial<PaperTrade>): Promise<PaperTrade> {
    const [result] = await db
      .update(paperTrades)
      .set(updates)
      .where(eq(paperTrades.id, id))
      .returning();
    return result;
  }

  async getPaperTradeById(id: string): Promise<PaperTrade | undefined> {
    const [result] = await db
      .select()
      .from(paperTrades)
      .where(eq(paperTrades.id, id));
    return result || undefined;
  }

  async getAllPaperTrades(userId: string): Promise<PaperTrade[]> {
    return await db
      .select()
      .from(paperTrades)
      .where(eq(paperTrades.userId, userId))
      .orderBy(desc(paperTrades.entryTime));
  }

  async getOpenPaperTrades(userId: string): Promise<PaperTrade[]> {
    return await db
      .select()
      .from(paperTrades)
      .where(and(eq(paperTrades.userId, userId), eq(paperTrades.status, 'open')))
      .orderBy(desc(paperTrades.entryTime));
  }

  async deleteAllPaperTrades(userId: string): Promise<void> {
    await db.delete(paperTrades).where(eq(paperTrades.userId, userId));
  }

  // Paper daily brief methods
  async createPaperDailyBrief(brief: InsertPaperDailyBrief): Promise<PaperDailyBrief> {
    const [result] = await db.insert(paperDailyBriefs).values(brief).returning();
    return result;
  }

  async updatePaperDailyBrief(id: string, updates: Partial<PaperDailyBrief>): Promise<PaperDailyBrief> {
    const [result] = await db
      .update(paperDailyBriefs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(paperDailyBriefs.id, id))
      .returning();
    return result;
  }

  async getPaperDailyBrief(userId: string, date: string): Promise<PaperDailyBrief | undefined> {
    const [result] = await db
      .select()
      .from(paperDailyBriefs)
      .where(and(eq(paperDailyBriefs.userId, userId), eq(paperDailyBriefs.date, date)));
    return result || undefined;
  }

  async getPaperDailyBriefs(userId: string, filters?: { status?: string; limit?: number }): Promise<PaperDailyBrief[]> {
    const conditions = [eq(paperDailyBriefs.userId, userId)];
    
    if (filters?.status) {
      conditions.push(eq(paperDailyBriefs.status, filters.status as any));
    }
    
    const query = db
      .select()
      .from(paperDailyBriefs)
      .where(and(...conditions))
      .orderBy(desc(paperDailyBriefs.date));
    
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    
    return await query;
  }

  async finalizePaperDailyBrief(id: string): Promise<PaperDailyBrief> {
    const [result] = await db
      .update(paperDailyBriefs)
      .set({ 
        status: 'final' as const,
        finalizedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(paperDailyBriefs.id, id))
      .returning();
    return result;
  }

  // Paper AI report methods
  async createPaperAIReport(report: InsertPaperAIReport): Promise<PaperAIReport> {
    const [result] = await db.insert(paperAIReports).values(report).returning();
    return result;
  }

  async getPaperAIReports(userId: string, type?: string, limit?: number): Promise<PaperAIReport[]> {
    const conditions = [eq(paperAIReports.userId, userId)];
    
    if (type) {
      conditions.push(eq(paperAIReports.reportType, type));
    }
    
    const query = db
      .select()
      .from(paperAIReports)
      .where(and(...conditions))
      .orderBy(desc(paperAIReports.generatedAt));
    
    if (limit) {
      query.limit(limit);
    }
    
    return await query;
  }

  // Signal weight methods
  async getSignalWeights(userId: string, strategy?: string, mode?: string): Promise<SignalWeight[]> {
    const conditions = [eq(signalWeights.userId, userId)];
    
    if (strategy) {
      conditions.push(eq(signalWeights.strategy, strategy as any));
    }
    if (mode) {
      conditions.push(eq(signalWeights.mode, mode as any));
    }
    
    return await db
      .select()
      .from(signalWeights)
      .where(and(...conditions))
      .orderBy(desc(signalWeights.lastUpdated));
  }

  async getSignalWeight(userId: string, strategy: string, mode: string, signalName: string): Promise<SignalWeight | undefined> {
    const [result] = await db
      .select()
      .from(signalWeights)
      .where(and(
        eq(signalWeights.userId, userId),
        eq(signalWeights.strategy, strategy as any),
        eq(signalWeights.mode, mode as any),
        eq(signalWeights.signalName, signalName)
      ));
    return result || undefined;
  }

  async createSignalWeight(weight: InsertSignalWeight): Promise<SignalWeight> {
    const [result] = await db.insert(signalWeights).values(weight).returning();
    return result;
  }

  async updateSignalWeight(id: string, updates: Partial<SignalWeight>): Promise<SignalWeight> {
    const [result] = await db
      .update(signalWeights)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(signalWeights.id, id))
      .returning();
    return result;
  }

  async upsertSignalWeight(weight: InsertSignalWeight): Promise<SignalWeight> {
    const existing = await this.getSignalWeight(
      weight.userId,
      weight.strategy as string,
      weight.mode as string,
      weight.signalName
    );

    if (existing) {
      return this.updateSignalWeight(existing.id, weight);
    } else {
      return this.createSignalWeight(weight);
    }
  }

  // Prediction outcome methods
  async createPredictionOutcome(outcome: InsertPredictionOutcome): Promise<PredictionOutcome> {
    const [result] = await db.insert(predictionOutcomes).values(outcome).returning();
    return result;
  }

  async updatePredictionOutcome(id: string, updates: Partial<PredictionOutcome>): Promise<PredictionOutcome> {
    const [result] = await db
      .update(predictionOutcomes)
      .set(updates)
      .where(eq(predictionOutcomes.id, id))
      .returning();
    return result;
  }

  async getPredictionOutcomes(userId: string, filters?: { mode?: string; strategy?: string; fromDate?: Date; toDate?: Date; limit?: number }): Promise<PredictionOutcome[]> {
    const conditions = [eq(predictionOutcomes.userId, userId)];
    
    if (filters?.mode) {
      conditions.push(eq(predictionOutcomes.mode, filters.mode as any));
    }
    if (filters?.strategy) {
      conditions.push(eq(predictionOutcomes.strategy, filters.strategy as any));
    }
    if (filters?.fromDate) {
      conditions.push(gte(predictionOutcomes.predictionTimestamp, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(predictionOutcomes.predictionTimestamp, filters.toDate));
    }
    
    const query = db
      .select()
      .from(predictionOutcomes)
      .where(and(...conditions))
      .orderBy(desc(predictionOutcomes.predictionTimestamp));
    
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    
    return await query;
  }

  async getPredictionAccuracy(userId: string, mode: string, strategy?: string, days: number = 30): Promise<{ accuracy: number; totalPredictions: number; correctPredictions: number }> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const outcomes = await this.getPredictionOutcomes(userId, {
      mode,
      strategy,
      fromDate,
    });

    const completedOutcomes = outcomes.filter(o => o.correct !== null);
    const correctOutcomes = completedOutcomes.filter(o => o.correct === true);

    return {
      accuracy: completedOutcomes.length > 0 ? (correctOutcomes.length / completedOutcomes.length) * 100 : 0,
      totalPredictions: completedOutcomes.length,
      correctPredictions: correctOutcomes.length,
    };
  }

  // Feature snapshot methods
  async createFeatureSnapshot(snapshot: InsertFeatureSnapshot): Promise<FeatureSnapshot> {
    const [result] = await db.insert(featureSnapshots).values(snapshot).returning();
    return result;
  }

  async getFeatureSnapshots(symbol: string, fromDate?: Date, toDate?: Date, limit?: number): Promise<FeatureSnapshot[]> {
    const conditions = [eq(featureSnapshots.symbol, symbol)];
    
    if (fromDate) {
      conditions.push(gte(featureSnapshots.timestamp, fromDate));
    }
    if (toDate) {
      conditions.push(lte(featureSnapshots.timestamp, toDate));
    }
    
    const query = db
      .select()
      .from(featureSnapshots)
      .where(and(...conditions))
      .orderBy(desc(featureSnapshots.timestamp));
    
    if (limit) {
      query.limit(limit);
    }
    
    return await query;
  }

  async getLatestFeatureSnapshot(symbol: string): Promise<FeatureSnapshot | undefined> {
    const [result] = await db
      .select()
      .from(featureSnapshots)
      .where(eq(featureSnapshots.symbol, symbol))
      .orderBy(desc(featureSnapshots.timestamp))
      .limit(1);
    return result || undefined;
  }

  // Goals Engine methods - Live mode
  async getUserGoalsLive(userId: string): Promise<UserGoalLive[]> {
    return await db
      .select()
      .from(userGoalsLive)
      .where(eq(userGoalsLive.userId, userId))
      .orderBy(userGoalsLive.metricName);
  }

  async getGoalLive(userId: string, metricName: string): Promise<UserGoalLive | undefined> {
    const [result] = await db
      .select()
      .from(userGoalsLive)
      .where(and(
        eq(userGoalsLive.userId, userId),
        eq(userGoalsLive.metricName, metricName)
      ))
      .limit(1);
    return result || undefined;
  }

  async createGoalLive(goal: InsertUserGoalLive): Promise<UserGoalLive> {
    const [result] = await db.insert(userGoalsLive).values(goal).returning();
    return result;
  }

  async updateGoalLive(id: string, updates: Partial<UserGoalLive>): Promise<UserGoalLive> {
    const [result] = await db
      .update(userGoalsLive)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(userGoalsLive.id, id))
      .returning();
    return result;
  }

  async upsertGoalLive(goal: InsertUserGoalLive): Promise<UserGoalLive> {
    const existing = await this.getGoalLive(goal.userId, goal.metricName);
    if (existing) {
      return this.updateGoalLive(existing.id, goal);
    } else {
      return this.createGoalLive(goal);
    }
  }

  async deleteGoalLive(id: string): Promise<void> {
    await db.delete(userGoalsLive).where(eq(userGoalsLive.id, id));
  }

  // Goals Engine methods - Paper mode
  async getUserGoalsPaper(userId: string): Promise<UserGoalPaper[]> {
    return await db
      .select()
      .from(userGoalsPaper)
      .where(eq(userGoalsPaper.userId, userId))
      .orderBy(userGoalsPaper.metricName);
  }

  async getGoalPaper(userId: string, metricName: string): Promise<UserGoalPaper | undefined> {
    const [result] = await db
      .select()
      .from(userGoalsPaper)
      .where(and(
        eq(userGoalsPaper.userId, userId),
        eq(userGoalsPaper.metricName, metricName)
      ))
      .limit(1);
    return result || undefined;
  }

  async createGoalPaper(goal: InsertUserGoalPaper): Promise<UserGoalPaper> {
    const [result] = await db.insert(userGoalsPaper).values(goal).returning();
    return result;
  }

  async updateGoalPaper(id: string, updates: Partial<UserGoalPaper>): Promise<UserGoalPaper> {
    const [result] = await db
      .update(userGoalsPaper)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(userGoalsPaper.id, id))
      .returning();
    return result;
  }

  async upsertGoalPaper(goal: InsertUserGoalPaper): Promise<UserGoalPaper> {
    const existing = await this.getGoalPaper(goal.userId, goal.metricName);
    if (existing) {
      return this.updateGoalPaper(existing.id, goal);
    } else {
      return this.createGoalPaper(goal);
    }
  }

  async deleteGoalPaper(id: string): Promise<void> {
    await db.delete(userGoalsPaper).where(eq(userGoalsPaper.id, id));
  }

  // Goal Analysis History - Live mode
  async createGoalAnalysisLive(analysis: InsertGoalAnalysisHistoryLive): Promise<GoalAnalysisHistoryLive> {
    const [result] = await db.insert(goalAnalysisHistoryLive).values(analysis).returning();
    return result;
  }

  async getGoalAnalysisHistoryLive(userId: string, limit: number = 50): Promise<GoalAnalysisHistoryLive[]> {
    return await db
      .select()
      .from(goalAnalysisHistoryLive)
      .where(eq(goalAnalysisHistoryLive.userId, userId))
      .orderBy(desc(goalAnalysisHistoryLive.createdAt))
      .limit(limit);
  }

  // Goal Analysis History - Paper mode
  async createGoalAnalysisPaper(analysis: InsertGoalAnalysisHistoryPaper): Promise<GoalAnalysisHistoryPaper> {
    const [result] = await db.insert(goalAnalysisHistoryPaper).values(analysis).returning();
    return result;
  }

  async getGoalAnalysisHistoryPaper(userId: string, limit: number = 50): Promise<GoalAnalysisHistoryPaper[]> {
    return await db
      .select()
      .from(goalAnalysisHistoryPaper)
      .where(eq(goalAnalysisHistoryPaper.userId, userId))
      .orderBy(desc(goalAnalysisHistoryPaper.createdAt))
      .limit(limit);
  }

  // User utility methods
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
}

export const storage = new DatabaseStorage();
