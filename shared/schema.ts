import { sql } from "drizzle-orm";
import { 
  pgTable, 
  text, 
  varchar, 
  timestamp, 
  decimal, 
  integer, 
  boolean, 
  jsonb,
  pgEnum
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const tradingModeEnum = pgEnum("trading_mode", ["live", "paper"]);
export const tradingStatusEnum = pgEnum("trading_status", ["active", "stopped"]);
export const strategyTypeEnum = pgEnum("strategy_type", ["vwap_pullback", "abcd_long", "sma_trend_ride"]);
export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled"]);
export const tradeTypeEnum = pgEnum("trade_type", ["buy", "sell"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  tradingMode: tradingModeEnum("trading_mode").default("paper"),
  tradingStatus: tradingStatusEnum("trading_status").default("stopped"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Trading settings
export const tradingSettings = pgTable("trading_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  riskPerTrade: decimal("risk_per_trade", { precision: 10, scale: 2 }).default("100.00"),
  maxExposurePercent: decimal("max_exposure_percent", { precision: 5, scale: 2 }).default("20.00"),
  maxOpenTrades: integer("max_open_trades").default(3),
  slippageToleranceMajors: decimal("slippage_tolerance_majors", { precision: 5, scale: 2 }).default("0.50"),
  slippageToleranceMidcaps: decimal("slippage_tolerance_midcaps", { precision: 5, scale: 2 }).default("2.00"),
  slippageToleranceSmall: decimal("slippage_tolerance_small", { precision: 5, scale: 2 }).default("5.00"),
  stopBufferPercent: decimal("stop_buffer_percent", { precision: 5, scale: 2 }).default("0.30"),
  smaLength: integer("sma_length").default(20),
  minVolume: decimal("min_volume", { precision: 15, scale: 2 }).default("20000000.00"),
  minDailyRange: decimal("min_daily_range", { precision: 5, scale: 2 }).default("5.00"),
  aiCapitalAllocation: boolean("ai_capital_allocation").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Watchlist pairs
export const watchlistPairs = pgTable("watchlist_pairs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  quoteCurrency: varchar("quote_currency", { length: 10 }).notNull(),
  marketCap: decimal("market_cap", { precision: 20, scale: 2 }),
  volume24h: decimal("volume_24h", { precision: 20, scale: 2 }),
  currentPrice: decimal("current_price", { precision: 20, scale: 8 }),
  vwap: decimal("vwap", { precision: 20, scale: 8 }),
  sma: decimal("sma", { precision: 20, scale: 8 }),
  dailyRange: decimal("daily_range", { precision: 5, scale: 2 }),
  lastScanned: timestamp("last_scanned"),
  isActive: boolean("is_active").default(true),
  addedAt: timestamp("added_at").defaultNow(),
});

// Trades
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  status: tradeStatusEnum("status").default("open"),
  entryPrice: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  exitPrice: decimal("exit_price", { precision: 20, scale: 8 }),
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  stopPrice: decimal("stop_price", { precision: 20, scale: 8 }).notNull(),
  targetPrice: decimal("target_price", { precision: 20, scale: 8 }).notNull(),
  entryOrderId: varchar("entry_order_id"),
  stopOrderId: varchar("stop_order_id"),
  targetOrderId: varchar("target_order_id"),
  entryFee: decimal("entry_fee", { precision: 10, scale: 4 }).default("0"),
  exitFee: decimal("exit_fee", { precision: 10, scale: 4 }).default("0"),
  entrySlippage: decimal("entry_slippage", { precision: 5, scale: 2 }).default("0"),
  exitSlippage: decimal("exit_slippage", { precision: 5, scale: 2 }).default("0"),
  riskAmount: decimal("risk_amount", { precision: 10, scale: 2 }).notNull(),
  realizedPL: decimal("realized_pl", { precision: 10, scale: 2 }),
  realizedPLPercent: decimal("realized_pl_percent", { precision: 8, scale: 4 }),
  realizedPLR: decimal("realized_pl_r", { precision: 8, scale: 4 }),
  entryTime: timestamp("entry_time").defaultNow(),
  exitTime: timestamp("exit_time"),
  metadata: jsonb("metadata"), // Additional strategy-specific data
});

// AI reports
export const aiReports = pgTable("ai_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  reportType: varchar("report_type", { length: 50 }).notNull(), // daily, weekly, monthly
  period: varchar("period", { length: 50 }).notNull(), // e.g., "2025-01-15" or "2025-W03"
  content: text("content").notNull(),
  insights: jsonb("insights"), // Structured insights data
  recommendations: jsonb("recommendations"), // Structured recommendations
  metrics: jsonb("metrics"), // Performance metrics
  generatedAt: timestamp("generated_at").defaultNow(),
});

// AI conversations
export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  messages: jsonb("messages").notNull(), // Array of {role, content, timestamp}
  context: jsonb("context"), // Current trading context
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Price data cache
export const priceData = pgTable("price_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  timestamp: timestamp("timestamp").notNull(),
  open: decimal("open", { precision: 20, scale: 8 }).notNull(),
  high: decimal("high", { precision: 20, scale: 8 }).notNull(),
  low: decimal("low", { precision: 20, scale: 8 }).notNull(),
  close: decimal("close", { precision: 20, scale: 8 }).notNull(),
  volume: decimal("volume", { precision: 20, scale: 8 }).notNull(),
  vwap: decimal("vwap", { precision: 20, scale: 8 }),
  sma: decimal("sma", { precision: 20, scale: 8 }),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  settings: many(tradingSettings),
  watchlist: many(watchlistPairs),
  trades: many(trades),
  reports: many(aiReports),
  conversations: many(aiConversations),
}));

export const tradingSettingsRelations = relations(tradingSettings, ({ one }) => ({
  user: one(users, {
    fields: [tradingSettings.userId],
    references: [users.id],
  }),
}));

export const watchlistPairsRelations = relations(watchlistPairs, ({ one }) => ({
  user: one(users, {
    fields: [watchlistPairs.userId],
    references: [users.id],
  }),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  user: one(users, {
    fields: [trades.userId],
    references: [users.id],
  }),
}));

export const aiReportsRelations = relations(aiReports, ({ one }) => ({
  user: one(users, {
    fields: [aiReports.userId],
    references: [users.id],
  }),
}));

export const aiConversationsRelations = relations(aiConversations, ({ one }) => ({
  user: one(users, {
    fields: [aiConversations.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertTradingSettingsSchema = createInsertSchema(tradingSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertWatchlistPairSchema = createInsertSchema(watchlistPairs).omit({
  id: true,
  addedAt: true,
});

export const insertTradeSchema = createInsertSchema(trades).omit({
  id: true,
  entryTime: true,
});

export const insertAIReportSchema = createInsertSchema(aiReports).omit({
  id: true,
  generatedAt: true,
});

export const insertAIConversationSchema = createInsertSchema(aiConversations).omit({
  id: true,
  lastUpdated: true,
});

export const insertPriceDataSchema = createInsertSchema(priceData).omit({
  id: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTradingSettings = z.infer<typeof insertTradingSettingsSchema>;
export type TradingSettings = typeof tradingSettings.$inferSelect;

export type InsertWatchlistPair = z.infer<typeof insertWatchlistPairSchema>;
export type WatchlistPair = typeof watchlistPairs.$inferSelect;

export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export type InsertAIReport = z.infer<typeof insertAIReportSchema>;
export type AIReport = typeof aiReports.$inferSelect;

export type InsertAIConversation = z.infer<typeof insertAIConversationSchema>;
export type AIConversation = typeof aiConversations.$inferSelect;

export type InsertPriceData = z.infer<typeof insertPriceDataSchema>;
export type PriceData = typeof priceData.$inferSelect;
