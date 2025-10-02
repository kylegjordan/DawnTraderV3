import { 
  users, 
  tradingSettings,
  watchlistPairs,
  trades,
  aiReports,
  aiConversations,
  priceData,
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
  type PriceData,
  type InsertPriceData
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
  getAIConversation(userId: string): Promise<AIConversation | undefined>;
  updateAIConversation(userId: string, conversation: InsertAIConversation): Promise<AIConversation>;

  // Price data methods
  getPriceData(symbol: string, from?: Date, to?: Date): Promise<PriceData[]>;
  savePriceData(data: InsertPriceData[]): Promise<void>;
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
      query = query.limit(filters.limit);
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
    const totalFees = parseFloat(trade.entryFee) + exitFee;
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
}

export const storage = new DatabaseStorage();
