import { 
  users, 
  tradingSettings,
  watchlistPairs,
  trades,
  aiReports,
  aiConversations,
  aiChatLogs,
  priceData,
  databaseSizeLogs,
  aiAuditLog,
  errorLogs,
  killSwitchEvents,
  aiOpportunityRuns,
  aiOpportunities,
  type User, 
  type InsertUser,
  type TradingSettings,
  type InsertTradingSettings,
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
  type InsertAIOpportunity
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, inArray } from "drizzle-orm";

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

  // User utility methods
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
}

export const storage = new DatabaseStorage();
