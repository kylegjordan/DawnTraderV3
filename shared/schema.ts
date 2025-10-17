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
  pgEnum,
  date,
  uniqueIndex,
  index,
  vector,
  serial
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const tradingModeEnum = pgEnum("trading_mode", ["live", "paper"]);
export const tradingStatusEnum = pgEnum("trading_status", ["active", "stopped"]);
export const strategyTypeEnum = pgEnum("strategy_type", [
  "vwap_pullback", 
  "abcd_long", 
  "sma_trend_ride",
  "breakout",
  "mean_reversion",
  "range_trading",
  "vwap_bounce",
  "liquidity_trap"
]);
export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled"]);
export const tradeTypeEnum = pgEnum("trade_type", ["buy", "sell"]);
export const opportunityTypeEnum = pgEnum("opportunity_type", ["long_term_hold", "moonshot", "momentum", "breakout", "mean_reversion"]);
export const opportunityStatusEnum = pgEnum("opportunity_status", ["new", "watchlist", "executed", "dismissed", "expired"]);
export const dailyBriefStatusEnum = pgEnum("daily_brief_status", ["in_progress", "final"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "cancelled"]);
export const walterChatStatusEnum = pgEnum("walter_chat_status", ["active", "archived"]);
export const walterMemoryTypeEnum = pgEnum("walter_memory_type", ["observation", "decision", "result", "goal", "lesson"]);
export const patchSeverityEnum = pgEnum("patch_severity", ["critical", "high", "medium", "low", "info"]);
export const patchStatusEnum = pgEnum("patch_status", ["pending", "approved", "rejected", "applied"]);
export const walterThemeEnum = pgEnum("walter_theme", ["light", "dark", "system"]);
export const walterToneEnum = pgEnum("walter_tone", ["professional", "analytical", "warm", "concise"]);
export const walterViewModeEnum = pgEnum("walter_view_mode", ["compact", "expanded"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "editor", "viewer"]);
export const eventSignificanceEnum = pgEnum("event_significance", ["minor", "significant", "critical"]);
export const executionEventTypeEnum = pgEnum("execution_event_type", ["trade", "balance_update", "risk_report", "engine_event", "anomaly", "strategy_signal"]);
export const reasoningQueueStatusEnum = pgEnum("reasoning_queue_status", ["pending", "in_progress", "completed", "failed"]);
export const memoryAuditStatusEnum = pgEnum("memory_audit_status", ["VERIFIED", "UNVERIFIED", "REPAIRED"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password"),
  displayName: text("display_name"),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  role: userRoleEnum("role").default("viewer").notNull(),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  tradingMode: tradingModeEnum("trading_mode").default("paper"),
  tradingStatus: tradingStatusEnum("trading_status").default("stopped"),
  approvalMatrix: jsonb("approval_matrix").default(sql`'{
    "autoExecute": {
      "startLiveTrading": true,
      "adjustGoals": true,
      "modifyGuardrails": true,
      "updateFilters": true,
      "changeStrategyVariables": true,
      "riskThresholdAdjustments": true,
      "paperTradingActivation": true
    },
    "policyConstraints": {
      "maxRiskPerTradePercent": 5.0,
      "maxDailyLossPercent": 10.0,
      "maxExposurePercent": 50.0,
      "maxPositionSizeUSD": 10000,
      "minKillSwitchThresholdPercent": 5.0,
      "maxKillSwitchThresholdPercent": 15.0,
      "maxPortfolioRiskPercent": 5.0
    },
    "killSwitchOverride": true
  }'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Trading settings
export const tradingSettings = pgTable("trading_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  userId: varchar("user_id").references(() => users.id),
  riskPerTrade: decimal("risk_per_trade", { precision: 10, scale: 2 }).default("150.00"),
  maxExposurePercent: decimal("max_exposure_percent", { precision: 5, scale: 2 }).default("25.00"),
  maxOpenTrades: integer("max_open_trades").default(3),
  slippageToleranceMajors: decimal("slippage_tolerance_majors", { precision: 5, scale: 2 }).default("0.50"),
  slippageToleranceMidcaps: decimal("slippage_tolerance_midcaps", { precision: 5, scale: 2 }).default("2.00"),
  slippageToleranceSmall: decimal("slippage_tolerance_small", { precision: 5, scale: 2 }).default("5.00"),
  stopBufferPercent: decimal("stop_buffer_percent", { precision: 5, scale: 2 }).default("0.30"),
  smaLength: integer("sma_length").default(20),
  minVolume: decimal("min_volume", { precision: 15, scale: 2 }).default("30000000.00"),
  minDailyRange: decimal("min_daily_range", { precision: 5, scale: 2 }).default("6.50"),
  aiCapitalAllocation: boolean("ai_capital_allocation").default(false),
  timezone: varchar("timezone", { length: 50 }).default("Asia/Dubai"),
  timeFormat: varchar("time_format", { length: 10 }).default("12hr"),
  
  // Global Screener Filters
  minPrice: decimal("min_price", { precision: 10, scale: 8 }).default("0.01"),
  maxBidAskSpread: decimal("max_bid_ask_spread", { precision: 5, scale: 2 }).default("1.00"),
  excludeStablecoins: boolean("exclude_stablecoins").default(true),
  minDataHistoryDays: integer("min_data_history_days").default(90),
  allowedTradingPairs: text("allowed_trading_pairs").array().default(sql`ARRAY['USD', 'USDT']::text[]`),
  blacklistedSymbols: text("blacklisted_symbols").array().default(sql`ARRAY[]::text[]`),
  whitelistedSymbols: text("whitelisted_symbols").array().default(sql`ARRAY[]::text[]`),
  
  // VWAP Pullback Strategy Parameters
  vwapTimeframe: integer("vwap_timeframe").default(60), // minutes
  vwapPullbackThreshold: decimal("vwap_pullback_threshold", { precision: 5, scale: 2 }).default("2.00"),
  vwapVolumeMultiplier: decimal("vwap_volume_multiplier", { precision: 5, scale: 2 }).default("1.50"),
  vwapMaxHoldingPeriod: integer("vwap_max_holding_period").default(24), // bars/candles
  
  // ABCD Long Strategy Parameters
  abcdMinConsolidation: integer("abcd_min_consolidation").default(10), // bars
  abcdBreakoutThreshold: decimal("abcd_breakout_threshold", { precision: 5, scale: 2 }).default("1.50"),
  abcdVolumeMultiplier: decimal("abcd_volume_multiplier", { precision: 5, scale: 2 }).default("1.50"),
  abcdExitType: varchar("abcd_exit_type", { length: 20 }).default("target"), // 'target' or 'trailing'
  abcdTargetPercent: decimal("abcd_target_percent", { precision: 5, scale: 2 }).default("3.00"),
  abcdTrailingStopPercent: decimal("abcd_trailing_stop_percent", { precision: 5, scale: 2 }).default("2.00"),
  
  // SMA Trend Ride Strategy Parameters
  smaEntryCondition: varchar("sma_entry_condition", { length: 20 }).default("crossover"), // 'above' or 'crossover'
  smaExitCondition: varchar("sma_exit_condition", { length: 20 }).default("break"), // 'break' or 'trailing'
  smaTrailingStopPercent: decimal("sma_trailing_stop_percent", { precision: 5, scale: 2 }).default("2.00"),
  
  // Daily Loss Kill Switch
  dailyLossKillSwitch: decimal("daily_loss_kill_switch", { precision: 5, scale: 2 }).default("7.00"), // % of portfolio
  dailyLossWarningTrigger: decimal("daily_loss_warning_trigger", { precision: 5, scale: 2 }).default("75.00"), // % of kill switch threshold
  maxPositionPercent: decimal("max_position_percent", { precision: 5, scale: 2 }).default("10.00"), // % of portfolio per position
  portfolioValue: decimal("portfolio_value", { precision: 15, scale: 2 }).default("50000.00"), // Base portfolio value for calculations
  tradingSuspended: boolean("trading_suspended").default(false), // System-controlled flag
  
  // Phase 2: Partial Fill Recovery
  partialFillThreshold: decimal("partial_fill_threshold", { precision: 5, scale: 2 }).default("90.00"), // % threshold
  partialFillAction: varchar("partial_fill_action", { length: 20 }).default("scale"), // 'scale' or 'catchup'
  
  // Walter AI Assistant Settings
  walterMemoryDepth: integer("walter_memory_depth").default(20), // Number of messages to keep in context window
  walterMemoryLimit: integer("walter_memory_limit").default(500), // Max persistent memories (-1 for unlimited)
  walterAutoSummarize: boolean("walter_auto_summarize").default(true), // Auto-summarize chats every 50 messages
  
  // AI Opportunities Settings
  aiOpportunitiesEnabled: boolean("ai_opportunities_enabled").default(true),
  aiOpportunitiesFrequency: integer("ai_opportunities_frequency").default(60), // minutes
  aiOpportunitiesMaxPairs: integer("ai_opportunities_max_pairs").default(150), // max pairs to send to AI
  aiOpportunitiesMaxSaved: integer("ai_opportunities_max_saved").default(40), // max opportunities to save per run
  
  // Notification Preferences
  showSystemAlerts: boolean("show_system_alerts").default(true), // Toggle non-critical notifications
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Guardrails (mode-isolated risk parameters)
export const guardrails = pgTable("guardrails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  maxDailyLoss: decimal("max_daily_loss", { precision: 10, scale: 2 }).default("1000.00"),
  maxDrawdown: decimal("max_drawdown", { precision: 5, scale: 2 }).default("10.00"),
  maxPositionSize: decimal("max_position_size", { precision: 10, scale: 2 }).default("5000.00"),
  maxOpenPositions: integer("max_open_positions").default(5),
  riskPerTrade: decimal("risk_per_trade", { precision: 5, scale: 2 }).default("1.5"),
  aiCanAdjust: boolean("ai_can_adjust").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserMode: uniqueIndex("guardrails_user_mode_idx").on(table.userId, table.mode),
}));

// Screener Filters (mode-isolated screening criteria)
export const screenerFilters = pgTable("screener_filters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  minVolume: decimal("min_volume", { precision: 15, scale: 2 }).default("1000000.00"),
  minPrice: decimal("min_price", { precision: 10, scale: 8 }).default("0.01"),
  maxPrice: decimal("max_price", { precision: 10, scale: 2 }).default("10000.00"),
  minMarketCap: decimal("min_market_cap", { precision: 15, scale: 2 }).default("100000000.00"),
  maxBidAskSpread: decimal("max_bid_ask_spread", { precision: 5, scale: 2 }).default("1.00"),
  rsiMin: integer("rsi_min").default(30),
  rsiMax: integer("rsi_max").default(70),
  volatilityMin: decimal("volatility_min", { precision: 5, scale: 2 }).default("0.50"),
  volatilityMax: decimal("volatility_max", { precision: 5, scale: 2 }).default("5.00"),
  excludeStablecoins: boolean("exclude_stablecoins").default(true),
  minLiquidity: decimal("min_liquidity", { precision: 15, scale: 2 }).default("500000.00"),
  allowRegulatedOnly: boolean("allow_regulated_only").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserMode: uniqueIndex("screener_filters_user_mode_idx").on(table.userId, table.mode),
}));

// Strategy Settings (per mode, per user, per strategy)
export const strategySettings = pgTable("strategy_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  userId: varchar("user_id").references(() => users.id),
  mode: tradingModeEnum("mode").notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  params: jsonb("params").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueGlobalContextModeStrategy: uniqueIndex("strategy_settings_global_context_mode_strategy_idx").on(table.globalContextId, table.mode, table.strategy),
}));

// Strategy Settings Audit Log
export const strategySettingsAudit = pgTable("strategy_settings_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  prevParams: jsonb("prev_params"),
  nextParams: jsonb("next_params").notNull(),
  actorType: text("actor_type").notNull(), // 'user' | 'ai'
  actorId: text("actor_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Watchlist pairs
export const watchlistPairs = pgTable("watchlist_pairs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull().default("paper"),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  quoteCurrency: varchar("quote_currency", { length: 10 }).notNull(),
  marketCap: decimal("market_cap", { precision: 20, scale: 2 }),
  volume24h: decimal("volume_24h", { precision: 20, scale: 2 }),
  currentPrice: decimal("current_price", { precision: 20, scale: 8 }),
  vwap: decimal("vwap", { precision: 20, scale: 8 }),
  sma: decimal("sma", { precision: 20, scale: 8 }),
  dailyRange: decimal("daily_range", { precision: 5, scale: 2 }),
  lastScanned: timestamp("last_scanned", { withTimezone: true }),
  isActive: boolean("is_active").default(true),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserModeSymbol: uniqueIndex("watchlist_pairs_user_mode_symbol_idx").on(table.userId, table.mode, table.symbol),
}));

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
  mfe: decimal("mfe", { precision: 10, scale: 2 }), // Maximum Favorable Excursion (max profit while open)
  mae: decimal("mae", { precision: 10, scale: 2 }), // Maximum Adverse Excursion (max loss while open)
  entryTime: timestamp("entry_time", { withTimezone: true }).defaultNow(),
  exitTime: timestamp("exit_time", { withTimezone: true }),
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
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
});

// AI conversations
export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").default("New Chat"), // Conversation title
  messages: jsonb("messages").notNull(), // Array of {role, content, timestamp}
  context: jsonb("context"), // Current trading context
  maxContextMessages: integer("max_context_messages").default(20), // Max messages to send to GPT
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
});

// AI chat logs (tracks API usage and costs)
export const aiChatLogs = pgTable("ai_chat_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  conversationId: varchar("conversation_id").references(() => aiConversations.id, { onDelete: 'cascade' }),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 6 }).notNull(), // in USD
  model: varchar("model", { length: 50 }).default("gpt-4o"), // Model used
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
});

// Conversation summaries (compressed conversation history for context retention)
export const conversationSummaries = pgTable("conversation_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => aiConversations.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  startMessageId: varchar("start_message_id"), // First message ID in this summary window
  endMessageId: varchar("end_message_id"), // Last message ID in this summary window
  startTimestamp: timestamp("start_timestamp", { withTimezone: true }).notNull(),
  endTimestamp: timestamp("end_timestamp", { withTimezone: true }).notNull(),
  messageCount: integer("message_count").notNull(), // Number of messages summarized
  summaryText: text("summary_text").notNull(), // Compressed summary (≤200 tokens)
  participantRoles: text("participant_roles").array().default(sql`ARRAY['user', 'assistant', 'system']::text[]`), // Roles in conversation
  keyDecisions: jsonb("key_decisions"), // Important decisions made
  actionItems: jsonb("action_items"), // Actions or tasks identified
  userPreferences: jsonb("user_preferences"), // Extracted user preferences
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  conversationIdIdx: uniqueIndex("conversation_summaries_conversation_id_idx").on(table.conversationId, table.createdAt),
}));

// Response cache (stores API responses to reduce duplicate calls)
export const responseCache = pgTable("response_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  cacheKey: varchar("cache_key", { length: 256 }).notNull(), // hash(user_id + endpoint + payload)
  endpoint: varchar("endpoint", { length: 200 }).notNull(), // API endpoint or function name
  requestPayload: jsonb("request_payload"), // Request parameters for transparency
  responseData: jsonb("response_data").notNull(), // Cached response
  hitCount: integer("hit_count").default(1), // Number of times this cache entry was used
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // TTL expiry time
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userCacheKeyIdx: uniqueIndex("response_cache_user_cache_key_idx").on(table.userId, table.cacheKey),
  expiresAtIdx: index("response_cache_expires_at_idx").on(table.expiresAt),
}));

// Semantic Memory (Milestone 15: vector-based learning recall)
export const semanticMemory = pgTable("semantic_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(), // OpenAI text-embedding-3-small
  content: text("content").notNull(), // Human-readable summary or lesson
  sourceTable: varchar("source_table", { length: 100 }).notNull(), // e.g. "ai_lessons", "portfolio_adjustments"
  sourceId: varchar("source_id").notNull(), // Reference ID from source table
  tags: text("tags").array().default(sql`ARRAY[]::text[]`), // e.g. ["BTC", "volatility", "paper-mode"]
  relevance: decimal("relevance", { precision: 3, scale: 2 }).default("0.50"), // 0-1 score for ranking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  embeddingIdx: index("semantic_memory_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
  tagsIdx: index("semantic_memory_tags_idx").on(table.tags),
  sourceIdx: uniqueIndex("semantic_memory_source_idx").on(table.sourceTable, table.sourceId),
}));

// AI Market Analyses (market regime classification)
export const aiMarketAnalyses = pgTable("ai_market_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date", { mode: "string" }).notNull(), // UTC date of analysis (YYYY-MM-DD)
  mode: tradingModeEnum("mode").notNull(), // 'live' | 'paper'
  regime: text("regime").notNull(), // 'bullish' | 'bearish' | 'neutral' | 'accumulation' | 'distribution' | 'high_volatility' | 'low_volatility'
  confidence: integer("confidence"), // 0–100
  summary: text("summary"),
  recommendations: jsonb("recommendations"), // string[]
  snapshot: jsonb("snapshot"), // raw market metrics used
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniquePerDayMode: uniqueIndex("ai_market_analyses_date_mode_idx").on(table.date, table.mode),
}));

// Price data cache
export const priceData = pgTable("price_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  open: decimal("open", { precision: 20, scale: 8 }).notNull(),
  high: decimal("high", { precision: 20, scale: 8 }).notNull(),
  low: decimal("low", { precision: 20, scale: 8 }).notNull(),
  close: decimal("close", { precision: 20, scale: 8 }).notNull(),
  volume: decimal("volume", { precision: 20, scale: 8 }).notNull(),
  vwap: decimal("vwap", { precision: 20, scale: 8 }),
  sma: decimal("sma", { precision: 20, scale: 8 }),
});

// Database size logs (for monitoring storage usage)
export const databaseSizeLogs = pgTable("database_size_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sizeMb: decimal("size_mb", { precision: 10, scale: 2 }).notNull(),
  sizeGb: decimal("size_gb", { precision: 10, scale: 4 }).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow(),
});

// AI audit log (tracks all GPT-driven changes)
export const aiAuditLog = pgTable("ai_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  actionType: varchar("action_type", { length: 100 }).notNull(), // e.g., "update_setting", "analysis_request"
  settingName: varchar("setting_name", { length: 100 }), // nullable
  oldValue: jsonb("old_value"), // Previous value
  newValue: jsonb("new_value"), // New value
  confirmationMethod: varchar("confirmation_method", { length: 50 }), // e.g., "user_confirmed_chat"
  gptResponse: text("gpt_response"), // Full text of GPT explanation
  status: varchar("status", { length: 20 }).default("completed"), // completed, pending, cancelled
});

// Error logs (for error diagnosis)
export const errorLogs = pgTable("error_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  errorType: varchar("error_type", { length: 100 }).notNull(), // e.g., "trade_execution", "scanner_error", "api_error"
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"), // Stack trace if available
  context: jsonb("context"), // Additional context (symbol, trade ID, etc.)
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  notes: text("notes"), // User or system notes about resolution
});

// Kill switch events (for logging kill switch triggers)
export const killSwitchEvents = pgTable("kill_switch_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow(),
  eventType: varchar("event_type", { length: 20 }).notNull(), // 'warning' or 'kill_switch'
  portfolioValueBefore: decimal("portfolio_value_before", { precision: 15, scale: 2 }).notNull(),
  portfolioValueAfter: decimal("portfolio_value_after", { precision: 15, scale: 2 }).notNull(),
  lossAmount: decimal("loss_amount", { precision: 15, scale: 2 }).notNull(),
  lossPercent: decimal("loss_percent", { precision: 8, scale: 4 }).notNull(),
  killSwitchThreshold: decimal("kill_switch_threshold", { precision: 5, scale: 2 }).notNull(), // What it was set to
  tradesClosed: jsonb("trades_closed"), // Array of closed trades with details
  resolved: boolean("resolved").default(false), // Whether user has reset
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedMethod: varchar("resolved_method", { length: 50 }), // 'manual_ui' or 'chatgpt'
  notes: text("notes"),
});

// Task 8: Safety Telemetry (tracks all safety guardrail checks and violations)
export const safetyTelemetry = pgTable("safety_telemetry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  
  // Portfolio metrics at time of check
  dailyDrawdown: decimal("daily_drawdown", { precision: 8, scale: 4 }), // % loss in last 24h
  exposurePercent: decimal("exposure_percent", { precision: 8, scale: 4 }), // % of portfolio in open positions
  openPositionCount: integer("open_position_count").default(0),
  portfolioValue: decimal("portfolio_value", { precision: 15, scale: 2 }),
  
  // Risk check results
  checkType: varchar("check_type", { length: 50 }).notNull(), // 'pre_trade', 'kill_switch', 'position_monitor'
  checkPassed: boolean("check_passed").notNull(),
  failureReason: text("failure_reason"), // If check failed
  
  // Guardrail triggers (Task 8 specific)
  spotOnlyViolation: boolean("spot_only_violation").default(false),
  positionLimitViolation: boolean("position_limit_violation").default(false), // Max 1 per asset
  positionSizeViolation: boolean("position_size_violation").default(false), // 2x cap exceeded
  stopLossViolation: boolean("stop_loss_violation").default(false), // Missing or invalid SL
  
  // Trade context (if applicable)
  symbol: varchar("symbol", { length: 20 }),
  strategy: strategyTypeEnum("strategy"),
  signalId: varchar("signal_id"),
  
  // Additional metadata
  metadata: jsonb("metadata"),
}, (table) => ({
  userModeTimestampIdx: uniqueIndex("safety_telemetry_user_mode_timestamp_idx").on(table.userId, table.mode, table.timestamp),
}));

// AI opportunity runs (hourly batch runs)
export const aiOpportunityRuns = pgTable("ai_opportunity_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  pairsConsidered: integer("pairs_considered").default(0),
  pairsSentToAi: integer("pairs_sent_to_ai").default(0),
  opportunitiesCreated: integer("opportunities_created").default(0),
  modelUsed: varchar("model_used", { length: 50 }).default("gpt-4o-mini"),
  inputTokensEst: integer("input_tokens_est").default(0),
  outputTokensEst: integer("output_tokens_est").default(0),
  costEstimate: decimal("cost_estimate", { precision: 10, scale: 6 }).default("0"),
  errors: jsonb("errors"), // Array of error objects
  samplePayload: jsonb("sample_payload"), // Redacted sample of data sent to AI
});

// AI opportunities (generated by AI)
export const aiOpportunities = pgTable("ai_opportunities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  runId: varchar("run_id").references(() => aiOpportunityRuns.id),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  type: opportunityTypeEnum("type").notNull(),
  entryZone: jsonb("entry_zone").notNull(), // {min, max} or single value
  stopFloor: decimal("stop_floor", { precision: 20, scale: 8 }).notNull(),
  targetCeiling: jsonb("target_ceiling").notNull(), // Single or array of targets
  timeHorizon: varchar("time_horizon", { length: 50 }), // 'hours', 'days', 'weeks'
  riskAmountRule: jsonb("risk_amount_rule"), // {type: 'dollar'|'percent', value: number}
  notes: text("notes"),
  probabilityScore: integer("probability_score"), // 0-100
  riskRewardRating: decimal("risk_reward_rating", { precision: 5, scale: 2 }), // R multiple
  eligibilityFlags: jsonb("eligibility_flags"), // Array of risk flags
  status: opportunityStatusEnum("status").default("new"),
  executedTradeId: varchar("executed_trade_id").references(() => trades.id),
  conversationId: varchar("conversation_id").references(() => aiConversations.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Daily briefs (trading day narratives and summaries)
export const dailyBriefs = pgTable("daily_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  status: dailyBriefStatusEnum("status").default("in_progress"),
  headline: varchar("headline", { length: 200 }),
  summary: text("summary"), // One-sentence summary for dashboard
  narrative: text("narrative"), // Full storytelling description
  metrics: jsonb("metrics"), // {pnl_pct, win_rate, drawdown, exposure, num_trades, realized_pl, unrealized_pl}
  trades: jsonb("trades"), // {top_winners: [], top_losers: [], closed: [], open: []}
  learnings: jsonb("learnings"), // Array of lessons/recommendations
  systemHealth: jsonb("system_health"), // {status, issues: []}
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
});

// ===== WALTER AI ASSISTANT TABLES =====

// Walter chats (multi-chat session management)
export const walterChats = pgTable("walter_chats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").default("New Chat"), // Chat session title
  status: walterChatStatusEnum("status").default("active"),
  isApprovalThread: boolean("is_approval_thread").default(false), // True if auto-created for approval
  approvalId: varchar("approval_id"), // Added without reference to avoid circular inference
  messageCount: integer("message_count").default(0), // Total messages in session
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  pinned: boolean("pinned").default(false).notNull(), // Phase 8.4 Addendum B: Pin chat to top
  pinnedAt: timestamp("pinned_at", { withTimezone: true }), // Phase 8.4 Addendum B: When pinned
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

// Walter pending approvals (tracks parameter changes requiring approval)
export const walterPendingApprovals = pgTable("walter_pending_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(), // Trading mode (live/paper)
  strategyName: varchar("strategy_name", { length: 100 }), // Strategy being modified (if applicable)
  parameterName: varchar("parameter_name", { length: 100 }).notNull(), // Parameter being changed
  currentValue: jsonb("current_value").notNull(), // Current value
  proposedValue: jsonb("proposed_value").notNull(), // Proposed new value
  projectedRisk: decimal("projected_risk", { precision: 5, scale: 2 }).notNull(), // Risk percentage
  riskDetails: jsonb("risk_details"), // Additional risk breakdown
  status: approvalStatusEnum("status").default("pending"),
  chatSessionId: varchar("chat_session_id").references(() => walterChats.id, { onDelete: 'set null' }), // Links to walter chat session if auto-created
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  approvedBy: varchar("approved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Walter chat logs (all messages and interactions)
export const walterChatLogs = pgTable("walter_chat_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatSessionId: varchar("chat_session_id").references(() => walterChats.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: varchar("role", { length: 20 }).notNull(), // 'user', 'assistant', 'system'
  content: text("content").notNull(), // Message content
  metadata: jsonb("metadata"), // Additional data (buttons, actions, etc.)
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  chatSessionIdx: index("walter_chat_logs_session_idx").on(table.chatSessionId),
  timestampIdx: index("walter_chat_logs_timestamp_idx").on(table.timestamp),
}));

// Walter approvals audit (tracks all approval decisions)
export const walterApprovalsAudit = pgTable("walter_approvals_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  approvalId: varchar("approval_id").references(() => walterPendingApprovals.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  decision: varchar("decision", { length: 20 }).notNull(), // 'approved', 'rejected'
  decisionMethod: varchar("decision_method", { length: 50 }), // 'ui_button', 'voice_command', 'chat_command'
  notes: text("notes"), // Optional user notes
  executionResult: jsonb("execution_result"), // Results of the approved action (if executed)
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  approvalIdx: index("walter_approvals_audit_approval_idx").on(table.approvalId),
  userIdx: index("walter_approvals_audit_user_idx").on(table.userId),
  timestampIdx: index("walter_approvals_audit_timestamp_idx").on(table.timestamp),
}));

// Walter purpose (Phase 5.5 - stores Walter's guiding purpose statement, mode-aware as of Phase 6.13)
export const walterPurpose = pgTable("walter_purpose", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(), // 'live' or 'paper' - separate purpose per mode
  content: text("content").notNull(), // The purpose statement
  updatedBy: varchar("updated_by").references(() => users.id), // Who last updated it
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserMode: uniqueIndex("walter_purpose_user_mode_idx").on(table.userId, table.mode),
}));

// Walter memory (Phase 5.5 - persistent memory for continuity across sessions)
export const walterMemory = pgTable("walter_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: walterMemoryTypeEnum("type").notNull(), // observation, decision, result, goal, lesson
  content: text("content").notNull(), // Memory content
  importance: integer("importance").default(3).notNull(), // 1-5 scale for recall weighting
  chatId: varchar("chat_id").references(() => walterChats.id, { onDelete: 'set null' }), // Optional link to source chat
  metadata: jsonb("metadata"), // Additional context (strategy name, symbols, etc.)
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userTypeIdx: index("walter_memory_user_type_idx").on(table.userId, table.type),
  importanceIdx: index("walter_memory_importance_idx").on(table.importance),
  timestampIdx: index("walter_memory_timestamp_idx").on(table.timestamp),
  // Check constraint for importance range 1-5
  importanceCheck: sql`CHECK (importance >= 1 AND importance <= 5)`,
}));

// Walter user preferences (Phase 8.4 Addendum B - UI and behavior settings)
export const walterUserPreferences = pgTable("walter_user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  viewMode: walterViewModeEnum("view_mode").default("compact").notNull(), // Compact or Expanded layout
  theme: walterThemeEnum("theme").default("system").notNull(), // Light, Dark, or System
  tone: walterToneEnum("tone").default("professional").notNull(), // Assistant tone: Professional, Analytical, Warm, Concise
  sendKeyPreference: varchar("send_key_preference", { length: 20 }).default("enter").notNull(), // 'enter' or 'shift_enter'
  sidebarCollapsed: boolean("sidebar_collapsed").default(false).notNull(), // Sidebar collapse state
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Learning Fragments (Phase 8.6.1 - cognitive layer learning and improvement)
export const learningFragments = pgTable("learning_fragments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  eventType: executionEventTypeEnum("event_type").notNull(),
  significance: eventSignificanceEnum("significance").notNull(),
  
  // Event data and interpretation
  narrative: text("narrative").notNull(),
  reasoning: text("reasoning"),
  implications: text("implications").array(),
  actionableSuggestion: text("actionable_suggestion"),
  followUpQuestion: text("follow_up_question"),
  
  // Learning metadata
  eventCategory: varchar("event_category", { length: 100 }), // Categorized pattern (e.g., "large_profitable_trade", "risk_spike")
  userContext: jsonb("user_context"), // Active strategies, portfolio state at time of event
  responseEffectiveness: integer("response_effectiveness"), // 1-10 rating (if available from user feedback)
  traceId: varchar("trace_id", { length: 32 }), // Phase 8.6.4: Provenance tracking
  improvementSuggestion: text("improvement_suggestion"), // AI-identified areas for narrative improvement
  
  // Provenance and linking
  originalEventData: jsonb("original_event_data").notNull(), // Complete original execution event
  source: varchar("source", { length: 50 }).default("ExecutionCore").notNull(),
  interpretedBy: varchar("interpreted_by", { length: 50 }).default("CognitiveLayer").notNull(),
  
  // Timestamps
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }), // When this fragment was analyzed for learning
}, (table) => ({
  globalContextModeIdx: index("learning_fragments_context_mode_idx").on(table.globalContextId, table.mode),
  eventTypeIdx: index("learning_fragments_event_type_idx").on(table.eventType),
  significanceIdx: index("learning_fragments_significance_idx").on(table.significance),
  timestampIdx: index("learning_fragments_timestamp_idx").on(table.timestamp),
  categoryIdx: index("learning_fragments_category_idx").on(table.eventCategory),
}));

// Filter diagnostics (screening health metrics)
export const filterDiagnostics = pgTable("filter_diagnostics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  pairsScanned: integer("pairs_scanned").notNull().default(0),
  eligiblePairs: integer("eligible_pairs").notNull().default(0),
  topFailureReason: varchar("top_failure_reason", { length: 100 }),
  failurePercent: decimal("failure_percent", { precision: 5, scale: 2 }),
  filterBreakdown: jsonb("filter_breakdown"), // {filter_name: count} for each filter failure
  metadata: jsonb("metadata"), // Additional diagnostic data
});

// Portfolio state (Phase 8.5 Addendum F - unified portfolio tracking)
export const portfolioState = pgTable("portfolio_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  userId: varchar("user_id").references(() => users.id),
  mode: tradingModeEnum("mode").notNull(),
  balance: decimal("balance", { precision: 20, scale: 2 }).notNull().default("1000.00"),
  lastUpdate: timestamp("last_update", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueGlobalContextMode: uniqueIndex("portfolio_state_global_context_mode_idx").on(table.globalContextId, table.mode),
}));

// ===== PAPER TRADING TABLES (Isolated from Live) =====

// Paper trades (simulated trades - completely isolated from live)
export const paperTrades = pgTable("paper_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  status: tradeStatusEnum("status").default("open"),
  entryPrice: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  exitPrice: decimal("exit_price", { precision: 20, scale: 8 }),
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  stopPrice: decimal("stop_price", { precision: 20, scale: 8 }).notNull(),
  targetPrice: decimal("target_price", { precision: 20, scale: 8 }).notNull(),
  simulatedOrderId: varchar("simulated_order_id"), // Internal simulation ID
  entryFee: decimal("entry_fee", { precision: 10, scale: 4 }).default("0"),
  exitFee: decimal("exit_fee", { precision: 10, scale: 4 }).default("0"),
  entrySlippage: decimal("entry_slippage", { precision: 5, scale: 2 }).default("0"),
  exitSlippage: decimal("exit_slippage", { precision: 5, scale: 2 }).default("0"),
  simulatedLatencyMs: integer("simulated_latency_ms").default(250), // Simulated execution delay
  riskAmount: decimal("risk_amount", { precision: 10, scale: 2 }).notNull(),
  realizedPL: decimal("realized_pl", { precision: 10, scale: 2 }),
  realizedPLPercent: decimal("realized_pl_percent", { precision: 8, scale: 4 }),
  realizedPLR: decimal("realized_pl_r", { precision: 8, scale: 4 }),
  mfe: decimal("mfe", { precision: 10, scale: 2 }), // Maximum Favorable Excursion (max profit while open)
  mae: decimal("mae", { precision: 10, scale: 2 }), // Maximum Adverse Excursion (max loss while open)
  entryTime: timestamp("entry_time", { withTimezone: true }).defaultNow(),
  exitTime: timestamp("exit_time", { withTimezone: true }),
  metadata: jsonb("metadata"), // Additional strategy-specific data
});

// Paper daily briefs (simulated trading day summaries)
export const paperDailyBriefs = pgTable("paper_daily_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  status: dailyBriefStatusEnum("status").default("in_progress"),
  headline: varchar("headline", { length: 200 }),
  summary: text("summary"),
  narrative: text("narrative"),
  metrics: jsonb("metrics"), // Same structure as live briefs
  trades: jsonb("trades"), // {top_winners: [], top_losers: [], closed: [], open: []}
  learnings: jsonb("learnings"),
  systemHealth: jsonb("system_health"), // {status, issues: []}
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
});

// Paper AI reports (simulated trading analysis)
export const paperAIReports = pgTable("paper_ai_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  reportType: varchar("report_type", { length: 50 }).notNull(),
  period: varchar("period", { length: 50 }).notNull(),
  content: text("content").notNull(),
  insights: jsonb("insights"),
  recommendations: jsonb("recommendations"),
  metrics: jsonb("metrics"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
});

// ===== LEARNING FEEDBACK ENGINE TABLES =====

// Learning sources (tracks knowledge source weights and performance)
export const learningSources = pgTable("learning_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  sourceName: varchar("source_name", { length: 100 }).notNull(),
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  weight: decimal("weight", { precision: 8, scale: 4 }).default("1.0000"),
  relevanceScore: decimal("relevance_score", { precision: 5, scale: 4 }).default("0.5000"),
  accuracyScore: decimal("accuracy_score", { precision: 5, scale: 4 }).default("0.5000"),
  totalPredictions: integer("total_predictions").default(0),
  correctPredictions: integer("correct_predictions").default(0),
  lastAccuracyUpdate: timestamp("last_accuracy_update", { withTimezone: true }),
  lastRelevanceUpdate: timestamp("last_relevance_update", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  metadata: jsonb("metadata"),
}, (table) => ({
  uniqueUserSource: uniqueIndex("learning_sources_user_source_idx").on(table.userId, table.sourceName),
}));

// Signal weights (adaptive weighting per user/strategy/mode)
export const signalWeights = pgTable("signal_weights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  signalName: varchar("signal_name", { length: 100 }).notNull(),
  weight: decimal("weight", { precision: 8, scale: 4 }).default("1.0000"),
  correlationScore: decimal("correlation_score", { precision: 8, scale: 4 }),
  sampleSize: integer("sample_size").default(0),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
  metadata: jsonb("metadata"),
});

// Prediction outcomes (tracks AI predictions vs actual results)
export const predictionOutcomes = pgTable("prediction_outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  tradeId: varchar("trade_id"),
  mode: tradingModeEnum("mode").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  predictionTimestamp: timestamp("prediction_timestamp", { withTimezone: true }).defaultNow(),
  predictedDirection: varchar("predicted_direction", { length: 10 }).notNull(),
  predictionConfidence: decimal("prediction_confidence", { precision: 5, scale: 4 }).notNull(),
  signalType: varchar("signal_type", { length: 100 }),
  rationale: text("rationale"),
  riskScore: decimal("risk_score", { precision: 5, scale: 4 }),
  actualDirection: varchar("actual_direction", { length: 10 }),
  actualOutcome: decimal("actual_outcome", { precision: 10, scale: 2 }),
  deltaPercent: decimal("delta_percent", { precision: 8, scale: 4 }),
  correct: boolean("correct"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
});

// Feature snapshots (normalized and enriched market features)
export const featureSnapshots = pgTable("feature_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  priceNormalized: decimal("price_normalized", { precision: 10, scale: 4 }),
  volumeNormalized: decimal("volume_normalized", { precision: 10, scale: 4 }),
  momentumIndex: decimal("momentum_index", { precision: 10, scale: 4 }),
  rsi: decimal("rsi", { precision: 5, scale: 2 }),
  smaSlope: decimal("sma_slope", { precision: 10, scale: 6 }),
  volumeDelta: decimal("volume_delta", { precision: 10, scale: 4 }),
  volatilityScore: decimal("volatility_score", { precision: 10, scale: 4 }),
  liquidityScore: decimal("liquidity_score", { precision: 10, scale: 4 }),
  sentimentScore: decimal("sentiment_score", { precision: 5, scale: 4 }),
  sectorCorrelation: decimal("sector_correlation", { precision: 5, scale: 4 }),
  rawFeatures: jsonb("raw_features"),
  normalizationWindow: integer("normalization_window").default(30),
});

// Goals Engine - Live Mode
export const userGoalsLive = pgTable("user_goals_live", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  goalValue: decimal("goal_value", { precision: 15, scale: 2 }),
  actualValue: decimal("actual_value", { precision: 15, scale: 2 }),
  percentAchieved: decimal("percent_achieved", { precision: 5, scale: 2 }),
  aiValidationNotes: text("ai_validation_notes"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
});

// Goals Engine - Paper Mode
export const userGoalsPaper = pgTable("user_goals_paper", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  goalValue: decimal("goal_value", { precision: 15, scale: 2 }),
  actualValue: decimal("actual_value", { precision: 15, scale: 2 }),
  percentAchieved: decimal("percent_achieved", { precision: 5, scale: 2 }),
  aiValidationNotes: text("ai_validation_notes"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
});

// Goal Analysis History - Live Mode
export const goalAnalysisHistoryLive = pgTable("goal_analysis_history_live", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  conversationId: varchar("conversation_id"),
  userMessage: text("user_message"),
  aiResponse: text("ai_response"),
  goalsProposed: jsonb("goals_proposed"),
  goalsAccepted: jsonb("goals_accepted"),
  configChangesProposed: jsonb("config_changes_proposed"),
  configChangesApplied: jsonb("config_changes_applied"),
  feasibilityScore: decimal("feasibility_score", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Goal Analysis History - Paper Mode
export const goalAnalysisHistoryPaper = pgTable("goal_analysis_history_paper", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  conversationId: varchar("conversation_id"),
  userMessage: text("user_message"),
  aiResponse: text("ai_response"),
  goalsProposed: jsonb("goals_proposed"),
  goalsAccepted: jsonb("goals_accepted"),
  configChangesProposed: jsonb("config_changes_proposed"),
  configChangesApplied: jsonb("config_changes_applied"),
  feasibilityScore: decimal("feasibility_score", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Screener Results (operational data - mode isolated)
export const screenerResults = pgTable("screener_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  exchange: varchar("exchange", { length: 20 }).default("kraken"),
  score: decimal("score", { precision: 5, scale: 2 }),
  passedFilters: text("passed_filters").array().default(sql`ARRAY[]::text[]`),
  failedFilters: text("failed_filters").array().default(sql`ARRAY[]::text[]`),
  marketCap: decimal("market_cap", { precision: 20, scale: 2 }),
  volume24h: decimal("volume_24h", { precision: 20, scale: 2 }),
  price: decimal("price", { precision: 20, scale: 8 }),
  volatility: decimal("volatility", { precision: 5, scale: 2 }),
  rsi: decimal("rsi", { precision: 5, scale: 2 }),
  bidAskSpread: decimal("bid_ask_spread", { precision: 5, scale: 2 }),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userModeTimestampIdx: uniqueIndex("screener_results_user_mode_timestamp_idx").on(table.userId, table.mode, table.scannedAt),
}));

// Filter Calibration Log (learning data - mode-aware but shared via fallback)
export const filterCalibrationLog = pgTable("filter_calibration_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  minVolume: decimal("min_volume", { precision: 15, scale: 2 }),
  minPrice: decimal("min_price", { precision: 10, scale: 8 }),
  maxPrice: decimal("max_price", { precision: 10, scale: 2 }),
  minMarketCap: decimal("min_market_cap", { precision: 15, scale: 2 }),
  maxBidAskSpread: decimal("max_bid_ask_spread", { precision: 5, scale: 2 }),
  minDailyRange: decimal("min_daily_range", { precision: 5, scale: 2 }),
  reason: text("reason"),
  source: varchar("source", { length: 20 }).default("system"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userModeTimestampIdx: uniqueIndex("filter_calibration_log_user_mode_timestamp_idx").on(table.userId, table.mode, table.timestamp),
}));

// Intraday Adjustments (learning data - mode-aware but shared via fallback)
export const intradayAdjustments = pgTable("intraday_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  adjustmentType: varchar("adjustment_type", { length: 50 }).notNull(),
  previousValue: decimal("previous_value", { precision: 20, scale: 8 }),
  newValue: decimal("new_value", { precision: 20, scale: 8 }),
  reason: text("reason"),
  marketCondition: varchar("market_condition", { length: 50 }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userModeTimestampIdx: uniqueIndex("intraday_adjustments_user_mode_timestamp_idx").on(table.userId, table.mode, table.timestamp),
}));

// AI Lessons (learning data - mode-aware but shared via fallback)
export const aiLessons = pgTable("ai_lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  lessonType: varchar("lesson_type", { length: 50 }).notNull(),
  symbol: varchar("symbol", { length: 20 }),
  strategy: strategyTypeEnum("strategy"),
  lesson: text("lesson").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  tradeId: varchar("trade_id"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userModeTimestampIdx: uniqueIndex("ai_lessons_user_mode_timestamp_idx").on(table.userId, table.mode, table.timestamp),
}));

// Portfolio Adjustments (learning data - mode-aware but shared via fallback)
export const portfolioAdjustments = pgTable("portfolio_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  adjustmentType: varchar("adjustment_type", { length: 50 }).notNull(),
  parameter: varchar("parameter", { length: 100 }),
  previousValue: decimal("previous_value", { precision: 20, scale: 8 }),
  newValue: decimal("new_value", { precision: 20, scale: 8 }),
  reason: text("reason"),
  performanceImpact: decimal("performance_impact", { precision: 10, scale: 4 }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userModeTimestampIdx: uniqueIndex("portfolio_adjustments_user_mode_timestamp_idx").on(table.userId, table.mode, table.timestamp),
}));

// System Alerts (operational data - mode isolated)
export const systemAlerts = pgTable("system_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  alertType: varchar("alert_type", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 20 }).default("info"),
  category: varchar("category", { length: 20 }).default("informational"), // 'informational', 'actionable', 'critical'
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  actionButtons: jsonb("action_buttons"), // Array of action buttons: [{ label, action, variant }]
  acknowledged: boolean("acknowledged").default(false),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userModeTimestampIdx: uniqueIndex("system_alerts_user_mode_timestamp_idx").on(table.userId, table.mode, table.timestamp),
}));

// Strategy Parameters (shared global parameters - NO mode column)
export const strategyParameters = pgTable("strategy_parameters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  parameterName: varchar("parameter_name", { length: 100 }).notNull(),
  parameterValue: decimal("parameter_value", { precision: 20, scale: 8 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  updatedBy: varchar("updated_by", { length: 20 }).default("user"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserParam: uniqueIndex("strategy_parameters_user_param_idx").on(table.userId, table.parameterName),
}));

// AI Transparency Log (scheduler and automation activity logs)
export const aiTransparencyLog = pgTable("ai_transparency_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  taskName: varchar("task_name", { length: 100 }).notNull(),
  mode: tradingModeEnum("mode"),
  executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow(),
  duration: decimal("duration", { precision: 10, scale: 3 }),
  resultSummary: text("result_summary"),
  success: boolean("success").notNull(),
  notes: text("notes"),
}, (table) => ({
  taskExecutedIdx: uniqueIndex("ai_transparency_log_task_executed_idx").on(table.taskName, table.executedAt),
}));

// Phase 5.9: Diagnostic Patch Proposals (Bob/Walter fix proposals requiring approval)
export const patchProposals = pgTable("patch_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id", { length: 100 }).notNull().unique(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  sourceReport: varchar("source_report", { length: 100 }).notNull(),
  file: text("file").notNull(),
  issue: text("issue").notNull(),
  proposedFix: text("proposed_fix").notNull(),
  reason: text("reason").notNull(),
  severity: patchSeverityEnum("severity").notNull(),
  estimatedImpact: varchar("estimated_impact", { length: 50 }).notNull(),
  testingRequired: boolean("testing_required").default(true),
  status: patchStatusEnum("status").default("pending").notNull(),
  kyleApproved: boolean("kyle_approved").default(false).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  approvalNotes: text("approval_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  proposalIdIdx: uniqueIndex("patch_proposals_proposal_id_idx").on(table.proposalId),
  userStatusIdx: index("patch_proposals_user_status_idx").on(table.userId, table.status),
}));

// Milestone 17A: Actuation Policy Registry (defines safe bounds for AI adjustments)
export const actuationPolicies = pgTable("actuation_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  variableName: varchar("variable_name", { length: 100 }).notNull(),
  variableCategory: varchar("variable_category", { length: 50 }).notNull(), // 'filter', 'strategy', 'guardrail'
  minValue: decimal("min_value", { precision: 20, scale: 8 }).notNull(),
  maxValue: decimal("max_value", { precision: 20, scale: 8 }).notNull(),
  stepSize: decimal("step_size", { precision: 20, scale: 8 }).notNull(),
  cooldownHours: integer("cooldown_hours").default(24),
  maxDailyChanges: integer("max_daily_changes").default(3),
  confidenceThreshold: integer("confidence_threshold").default(70), // 0-100
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserVariable: uniqueIndex("actuation_policies_user_variable_idx").on(table.userId, table.variableName),
}));

// Milestone 17A: Proposed Adjustments (AI-proposed parameter changes awaiting approval)
export const proposedAdjustments = pgTable("proposed_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  variableName: varchar("variable_name", { length: 100 }).notNull(),
  variableCategory: varchar("variable_category", { length: 50 }).notNull(),
  oldValue: decimal("old_value", { precision: 20, scale: 8 }).notNull(),
  proposedValue: decimal("proposed_value", { precision: 20, scale: 8 }).notNull(),
  confidenceScore: integer("confidence_score").notNull(), // 0-100
  reason: text("reason"),
  status: varchar("status", { length: 20 }).default("pending"), // 'pending', 'approved', 'rejected', 'applied'
  proposedAt: timestamp("proposed_at", { withTimezone: true }).defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  reviewedBy: varchar("reviewed_by", { length: 50 }), // 'system', 'user', 'auto'
}, (table) => ({
  userModeProposedIdx: index("proposed_adjustments_user_mode_proposed_idx").on(table.userId, table.mode, table.proposedAt),
}));

// Milestone 17B: Asset Capabilities (crypto vs stock characteristics for sizing)
export const assetCapabilities = pgTable("asset_capabilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol", { length: 20 }).notNull().unique(),
  assetType: varchar("asset_type", { length: 20 }).notNull(), // 'crypto', 'equity', 'forex', 'commodity'
  allowsFractional: boolean("allows_fractional").notNull().default(true),
  lotSize: decimal("lot_size", { precision: 20, scale: 8 }).notNull(), // Minimum tradable unit
  tickSize: decimal("tick_size", { precision: 20, scale: 8 }).notNull(), // Smallest price increment
  minNotional: decimal("min_notional", { precision: 10, scale: 2 }).notNull(), // Minimum order value
  feesModel: varchar("fees_model", { length: 50 }).default("maker_taker"), // 'maker_taker', 'fixed'
  venue: varchar("venue", { length: 50 }).notNull(), // 'Kraken', 'Alpaca', etc.
  lastSynced: timestamp("last_synced", { withTimezone: true }).defaultNow(),
  metadata: jsonb("metadata"), // Additional exchange-specific data
}, (table) => ({
  symbolIdx: uniqueIndex("asset_capabilities_symbol_idx").on(table.symbol),
}));

// Milestone 17C: Historic Signals (backfilled market signals for AI learning)
export const historicSignals = pgTable("historic_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  exchange: varchar("exchange", { length: 50 }).default("Kraken").notNull(),
  strategyId: strategyTypeEnum("strategy_id").notNull(),
  triggerTime: timestamp("trigger_time", { withTimezone: true }).notNull(),
  exitTime: timestamp("exit_time", { withTimezone: true }),
  entryPrice: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  exitPrice: decimal("exit_price", { precision: 20, scale: 8 }),
  pnlPercent: decimal("pnl_percent", { precision: 10, scale: 4 }),
  filtersUsed: text("filters_used").array(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  marketContext: jsonb("market_context"), // VWAP, SMA, volume, range at trigger time
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).defaultNow(),
  source: varchar("source", { length: 20 }).default("historic"), // 'historic', 'live'
}, (table) => ({
  symbolIdx: index("historic_signals_symbol_idx").on(table.symbol),
  strategyIdx: index("historic_signals_strategy_idx").on(table.strategyId),
  triggerTimeIdx: index("historic_signals_trigger_time_idx").on(table.triggerTime),
  userStrategyTimeIdx: index("historic_signals_user_strategy_time_idx").on(table.userId, table.strategyId, table.triggerTime),
}));

// Milestone 18: Paper Trading Simulation Engine Tables

// Paper Trades - Historical record of closed simulated trades
export const paperSimTrades = pgTable("paper_sim_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategyName: strategyTypeEnum("strategy_name").notNull(),
  side: varchar("side", { length: 10 }).notNull(), // 'buy' or 'sell'
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  entryPrice: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  exitPrice: decimal("exit_price", { precision: 20, scale: 8 }),
  stopLoss: decimal("stop_loss", { precision: 20, scale: 8 }),
  takeProfit: decimal("take_profit", { precision: 20, scale: 8 }),
  pnl: decimal("pnl", { precision: 20, scale: 8 }),
  pnlPercent: decimal("pnl_percent", { precision: 10, scale: 4 }),
  fees: decimal("fees", { precision: 20, scale: 8 }).default("0"),
  slippage: decimal("slippage", { precision: 20, scale: 8 }).default("0"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closeReason: varchar("close_reason", { length: 50 }), // 'target_hit', 'stop_hit', 'strategy_exit', 'manual', 'guardrail'
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  metadata: jsonb("metadata"), // Signal details, market context, etc.
}, (table) => ({
  userSymbolIdx: index("paper_sim_trades_user_symbol_idx").on(table.userId, table.symbol),
  strategyIdx: index("paper_sim_trades_strategy_idx").on(table.strategyName),
  openedAtIdx: index("paper_sim_trades_opened_at_idx").on(table.openedAt),
  closedAtIdx: index("paper_sim_trades_closed_at_idx").on(table.closedAt),
}));

// Open Positions - Currently active simulated positions
export const paperSimOpenPositions = pgTable("paper_sim_open_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategyName: strategyTypeEnum("strategy_name").notNull(),
  side: varchar("side", { length: 10 }).notNull(), // 'buy' or 'sell'
  quantity: decimal("quantity", { precision: 20, scale: 8 }).notNull(),
  avgPrice: decimal("avg_price", { precision: 20, scale: 8 }).notNull(),
  currentPrice: decimal("current_price", { precision: 20, scale: 8 }),
  stopLoss: decimal("stop_loss", { precision: 20, scale: 8 }),
  takeProfit: decimal("take_profit", { precision: 20, scale: 8 }),
  unrealizedPnl: decimal("unrealized_pnl", { precision: 20, scale: 8 }),
  unrealizedPnlPercent: decimal("unrealized_pnl_percent", { precision: 10, scale: 4 }),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  metadata: jsonb("metadata"), // Signal details, entry reasons, etc.
}, (table) => ({
  userSymbolIdx: uniqueIndex("paper_sim_open_positions_user_symbol_idx").on(table.userId, table.symbol),
  userIdx: index("paper_sim_open_positions_user_idx").on(table.userId),
  strategyIdx: index("paper_sim_open_positions_strategy_idx").on(table.strategyName),
}));

// Trade Logs - Chronological event log for paper trading transparency
export const paperSimTradeLogs = pgTable("paper_sim_trade_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  tradeId: varchar("trade_id"), // References paper_sim_trades.id (nullable for system events)
  positionId: varchar("position_id"), // References paper_sim_open_positions.id (nullable)
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'position_opened', 'position_closed', 'stop_triggered', 'target_hit', 'guardrail_triggered', 'error'
  message: text("message").notNull(),
  metadata: jsonb("metadata"), // Additional context (prices, quantities, reasons)
}, (table) => ({
  userTimestampIdx: index("paper_sim_trade_logs_user_timestamp_idx").on(table.userId, table.timestamp),
  tradeIdIdx: index("paper_sim_trade_logs_trade_id_idx").on(table.tradeId),
  eventTypeIdx: index("paper_sim_trade_logs_event_type_idx").on(table.eventType),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  settings: many(tradingSettings),
  watchlist: many(watchlistPairs),
  trades: many(trades),
  reports: many(aiReports),
  conversations: many(aiConversations),
  killSwitchEvents: many(killSwitchEvents),
  opportunityRuns: many(aiOpportunityRuns),
  opportunities: many(aiOpportunities),
  dailyBriefs: many(dailyBriefs),
  paperTrades: many(paperTrades),
  paperDailyBriefs: many(paperDailyBriefs),
  paperAIReports: many(paperAIReports),
  learningSources: many(learningSources),
  signalWeights: many(signalWeights),
  predictionOutcomes: many(predictionOutcomes),
  goalsLive: many(userGoalsLive),
  goalsPaper: many(userGoalsPaper),
  goalAnalysisHistoryLive: many(goalAnalysisHistoryLive),
  goalAnalysisHistoryPaper: many(goalAnalysisHistoryPaper),
  walterPendingApprovals: many(walterPendingApprovals),
  walterChats: many(walterChats),
  walterChatLogs: many(walterChatLogs),
  walterApprovalsAudit: many(walterApprovalsAudit),
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

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, {
    fields: [aiConversations.userId],
    references: [users.id],
  }),
  chatLogs: many(aiChatLogs),
}));

export const aiChatLogsRelations = relations(aiChatLogs, ({ one }) => ({
  user: one(users, {
    fields: [aiChatLogs.userId],
    references: [users.id],
  }),
  conversation: one(aiConversations, {
    fields: [aiChatLogs.conversationId],
    references: [aiConversations.id],
  }),
}));

export const aiOpportunityRunsRelations = relations(aiOpportunityRuns, ({ one, many }) => ({
  user: one(users, {
    fields: [aiOpportunityRuns.userId],
    references: [users.id],
  }),
  opportunities: many(aiOpportunities),
}));

export const aiOpportunitiesRelations = relations(aiOpportunities, ({ one }) => ({
  user: one(users, {
    fields: [aiOpportunities.userId],
    references: [users.id],
  }),
  run: one(aiOpportunityRuns, {
    fields: [aiOpportunities.runId],
    references: [aiOpportunityRuns.id],
  }),
  executedTrade: one(trades, {
    fields: [aiOpportunities.executedTradeId],
    references: [trades.id],
  }),
  conversation: one(aiConversations, {
    fields: [aiOpportunities.conversationId],
    references: [aiConversations.id],
  }),
}));

export const dailyBriefsRelations = relations(dailyBriefs, ({ one }) => ({
  user: one(users, {
    fields: [dailyBriefs.userId],
    references: [users.id],
  }),
}));

export const paperTradesRelations = relations(paperTrades, ({ one }) => ({
  user: one(users, {
    fields: [paperTrades.userId],
    references: [users.id],
  }),
}));

export const paperDailyBriefsRelations = relations(paperDailyBriefs, ({ one }) => ({
  user: one(users, {
    fields: [paperDailyBriefs.userId],
    references: [users.id],
  }),
}));

export const paperAIReportsRelations = relations(paperAIReports, ({ one }) => ({
  user: one(users, {
    fields: [paperAIReports.userId],
    references: [users.id],
  }),
}));

export const walterPendingApprovalsRelations = relations(walterPendingApprovals, ({ one, many }) => ({
  user: one(users, {
    fields: [walterPendingApprovals.userId],
    references: [users.id],
  }),
  chatSession: one(walterChats, {
    fields: [walterPendingApprovals.chatSessionId],
    references: [walterChats.id],
  }),
  auditEntries: many(walterApprovalsAudit),
}));

export const walterChatsRelations = relations(walterChats, ({ one, many }) => ({
  user: one(users, {
    fields: [walterChats.userId],
    references: [users.id],
  }),
  approval: one(walterPendingApprovals, {
    fields: [walterChats.approvalId],
    references: [walterPendingApprovals.id],
  }),
  chatLogs: many(walterChatLogs),
}));

export const walterChatLogsRelations = relations(walterChatLogs, ({ one }) => ({
  user: one(users, {
    fields: [walterChatLogs.userId],
    references: [users.id],
  }),
  chatSession: one(walterChats, {
    fields: [walterChatLogs.chatSessionId],
    references: [walterChats.id],
  }),
}));

export const walterApprovalsAuditRelations = relations(walterApprovalsAudit, ({ one }) => ({
  user: one(users, {
    fields: [walterApprovalsAudit.userId],
    references: [users.id],
  }),
  approval: one(walterPendingApprovals, {
    fields: [walterApprovalsAudit.approvalId],
    references: [walterPendingApprovals.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTradingSettingsSchema = createInsertSchema(tradingSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertGuardrailsSchema = createInsertSchema(guardrails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScreenerFiltersSchema = createInsertSchema(screenerFilters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStrategySettingsSchema = createInsertSchema(strategySettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStrategySettingsAuditSchema = createInsertSchema(strategySettingsAudit).omit({
  id: true,
  createdAt: true,
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
  createdAt: true,
  lastUpdated: true,
});

export const insertAIChatLogSchema = createInsertSchema(aiChatLogs).omit({
  id: true,
  timestamp: true,
});

export const insertConversationSummarySchema = createInsertSchema(conversationSummaries).omit({
  id: true,
  createdAt: true,
});

export const insertResponseCacheSchema = createInsertSchema(responseCache).omit({
  id: true,
  createdAt: true,
  lastAccessedAt: true,
});

export const insertSemanticMemorySchema = createInsertSchema(semanticMemory).omit({
  id: true,
  createdAt: true,
});

export const insertAiMarketAnalysisSchema = createInsertSchema(aiMarketAnalyses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPriceDataSchema = createInsertSchema(priceData).omit({
  id: true,
});

export const insertDatabaseSizeLogSchema = createInsertSchema(databaseSizeLogs).omit({
  id: true,
  checkedAt: true,
});

export const insertAIAuditLogSchema = createInsertSchema(aiAuditLog).omit({
  id: true,
  timestamp: true,
});

export const insertErrorLogSchema = createInsertSchema(errorLogs).omit({
  id: true,
  timestamp: true,
});

export const insertKillSwitchEventSchema = createInsertSchema(killSwitchEvents).omit({
  id: true,
  triggeredAt: true,
});

export const insertSafetyTelemetrySchema = createInsertSchema(safetyTelemetry).omit({
  id: true,
  timestamp: true,
});

export const insertAIOpportunityRunSchema = createInsertSchema(aiOpportunityRuns).omit({
  id: true,
  startedAt: true,
});

export const insertAIOpportunitySchema = createInsertSchema(aiOpportunities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDailyBriefSchema = createInsertSchema(dailyBriefs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Paper trading insert schemas
export const insertPaperTradeSchema = createInsertSchema(paperTrades).omit({
  id: true,
  entryTime: true,
});

export const insertPaperDailyBriefSchema = createInsertSchema(paperDailyBriefs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaperAIReportSchema = createInsertSchema(paperAIReports).omit({
  id: true,
  generatedAt: true,
});

// Learning Feedback Engine insert schemas
export const insertLearningSourceSchema = createInsertSchema(learningSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSignalWeightSchema = createInsertSchema(signalWeights).omit({
  id: true,
  lastUpdated: true,
});

export const insertPredictionOutcomeSchema = createInsertSchema(predictionOutcomes).omit({
  id: true,
  predictionTimestamp: true,
});

export const insertFeatureSnapshotSchema = createInsertSchema(featureSnapshots).omit({
  id: true,
  timestamp: true,
});

// Goals Engine insert schemas
export const insertUserGoalLiveSchema = createInsertSchema(userGoalsLive).omit({
  id: true,
  lastUpdated: true,
});

export const insertUserGoalPaperSchema = createInsertSchema(userGoalsPaper).omit({
  id: true,
  lastUpdated: true,
});

export const insertGoalAnalysisHistoryLiveSchema = createInsertSchema(goalAnalysisHistoryLive).omit({
  id: true,
  createdAt: true,
});

export const insertGoalAnalysisHistoryPaperSchema = createInsertSchema(goalAnalysisHistoryPaper).omit({
  id: true,
  createdAt: true,
});

// Screener and Learning insert schemas
export const insertScreenerResultSchema = createInsertSchema(screenerResults).omit({
  id: true,
  scannedAt: true,
});

export const insertFilterCalibrationLogSchema = createInsertSchema(filterCalibrationLog).omit({
  id: true,
  timestamp: true,
});

export const insertIntradayAdjustmentSchema = createInsertSchema(intradayAdjustments).omit({
  id: true,
  timestamp: true,
});

export const insertAILessonSchema = createInsertSchema(aiLessons).omit({
  id: true,
  timestamp: true,
});

export const insertPortfolioAdjustmentSchema = createInsertSchema(portfolioAdjustments).omit({
  id: true,
  timestamp: true,
});

export const insertSystemAlertSchema = createInsertSchema(systemAlerts).omit({
  id: true,
  timestamp: true,
});

export const insertStrategyParameterSchema = createInsertSchema(strategyParameters).omit({
  id: true,
  updatedAt: true,
});

export const insertAITransparencyLogSchema = createInsertSchema(aiTransparencyLog).omit({
  id: true,
  executedAt: true,
});

export const insertFilterDiagnosticSchema = createInsertSchema(filterDiagnostics).omit({
  id: true,
  timestamp: true,
});

// Milestone 17 insert schemas
export const insertActuationPolicySchema = createInsertSchema(actuationPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProposedAdjustmentSchema = createInsertSchema(proposedAdjustments).omit({
  id: true,
  proposedAt: true,
});

export const insertAssetCapabilitySchema = createInsertSchema(assetCapabilities).omit({
  id: true,
  lastSynced: true,
});

export const insertHistoricSignalSchema = createInsertSchema(historicSignals).omit({
  id: true,
  evaluatedAt: true,
});

export const insertPaperSimTradeSchema = createInsertSchema(paperSimTrades).omit({
  id: true,
});

export const insertPaperSimOpenPositionSchema = createInsertSchema(paperSimOpenPositions).omit({
  id: true,
  lastUpdated: true,
});

export const insertPaperSimTradeLogSchema = createInsertSchema(paperSimTradeLogs).omit({
  id: true,
  timestamp: true,
});

// Walter insert schemas
export const insertWalterPendingApprovalSchema = createInsertSchema(walterPendingApprovals).omit({
  id: true,
  createdAt: true,
});

export const insertWalterChatSchema = createInsertSchema(walterChats).omit({
  id: true,
  createdAt: true,
});

export const insertWalterChatLogSchema = createInsertSchema(walterChatLogs).omit({
  id: true,
  timestamp: true,
});

export const insertWalterApprovalsAuditSchema = createInsertSchema(walterApprovalsAudit).omit({
  id: true,
  timestamp: true,
});

export const insertWalterPurposeSchema = createInsertSchema(walterPurpose).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWalterMemorySchema = createInsertSchema(walterMemory).omit({
  id: true,
  timestamp: true,
});

export const insertWalterUserPreferencesSchema = createInsertSchema(walterUserPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLearningFragmentSchema = createInsertSchema(learningFragments).omit({
  id: true,
  timestamp: true,
});

export const insertPortfolioStateSchema = createInsertSchema(portfolioState).omit({
  id: true,
  lastUpdate: true,
  createdAt: true,
});

export const insertPatchProposalSchema = createInsertSchema(patchProposals).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
  appliedAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTradingSettings = z.infer<typeof insertTradingSettingsSchema>;
export type TradingSettings = typeof tradingSettings.$inferSelect;

export type InsertGuardrails = z.infer<typeof insertGuardrailsSchema>;
export type Guardrails = typeof guardrails.$inferSelect;

export type InsertScreenerFilters = z.infer<typeof insertScreenerFiltersSchema>;
export type ScreenerFilters = typeof screenerFilters.$inferSelect;

export type InsertStrategySettings = z.infer<typeof insertStrategySettingsSchema>;
export type StrategySettings = typeof strategySettings.$inferSelect;

export type InsertStrategySettingsAudit = z.infer<typeof insertStrategySettingsAuditSchema>;
export type StrategySettingsAudit = typeof strategySettingsAudit.$inferSelect;

export type InsertWatchlistPair = z.infer<typeof insertWatchlistPairSchema>;
export type WatchlistPair = typeof watchlistPairs.$inferSelect;

export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof trades.$inferSelect;

export type InsertAIReport = z.infer<typeof insertAIReportSchema>;
export type AIReport = typeof aiReports.$inferSelect;

export type InsertAIConversation = z.infer<typeof insertAIConversationSchema>;
export type AIConversation = typeof aiConversations.$inferSelect;

export type InsertAIChatLog = z.infer<typeof insertAIChatLogSchema>;
export type AIChatLog = typeof aiChatLogs.$inferSelect;

export type InsertConversationSummary = z.infer<typeof insertConversationSummarySchema>;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;

export type InsertResponseCache = z.infer<typeof insertResponseCacheSchema>;
export type ResponseCache = typeof responseCache.$inferSelect;

export type InsertSemanticMemory = z.infer<typeof insertSemanticMemorySchema>;
export type SemanticMemory = typeof semanticMemory.$inferSelect;

export type InsertAiMarketAnalysis = z.infer<typeof insertAiMarketAnalysisSchema>;
export type AiMarketAnalysis = typeof aiMarketAnalyses.$inferSelect;

export type InsertPriceData = z.infer<typeof insertPriceDataSchema>;
export type PriceData = typeof priceData.$inferSelect;

export type InsertDatabaseSizeLog = z.infer<typeof insertDatabaseSizeLogSchema>;
export type DatabaseSizeLog = typeof databaseSizeLogs.$inferSelect;

export type InsertAIAuditLog = z.infer<typeof insertAIAuditLogSchema>;
export type AIAuditLog = typeof aiAuditLog.$inferSelect;

export type InsertErrorLog = z.infer<typeof insertErrorLogSchema>;
export type ErrorLog = typeof errorLogs.$inferSelect;

export type InsertKillSwitchEvent = z.infer<typeof insertKillSwitchEventSchema>;
export type KillSwitchEvent = typeof killSwitchEvents.$inferSelect;

export type InsertSafetyTelemetry = z.infer<typeof insertSafetyTelemetrySchema>;
export type SafetyTelemetry = typeof safetyTelemetry.$inferSelect;

export type InsertAIOpportunityRun = z.infer<typeof insertAIOpportunityRunSchema>;
export type AIOpportunityRun = typeof aiOpportunityRuns.$inferSelect;

export type InsertAIOpportunity = z.infer<typeof insertAIOpportunitySchema>;
export type AIOpportunity = typeof aiOpportunities.$inferSelect;

export type InsertDailyBrief = z.infer<typeof insertDailyBriefSchema>;
export type DailyBrief = typeof dailyBriefs.$inferSelect;

export type InsertPaperTrade = z.infer<typeof insertPaperTradeSchema>;
export type PaperTrade = typeof paperTrades.$inferSelect;

export type InsertPaperDailyBrief = z.infer<typeof insertPaperDailyBriefSchema>;
export type PaperDailyBrief = typeof paperDailyBriefs.$inferSelect;

export type InsertPaperAIReport = z.infer<typeof insertPaperAIReportSchema>;
export type PaperAIReport = typeof paperAIReports.$inferSelect;

export type InsertLearningSource = z.infer<typeof insertLearningSourceSchema>;
export type LearningSource = typeof learningSources.$inferSelect;

export type InsertSignalWeight = z.infer<typeof insertSignalWeightSchema>;
export type SignalWeight = typeof signalWeights.$inferSelect;

export type InsertPredictionOutcome = z.infer<typeof insertPredictionOutcomeSchema>;
export type PredictionOutcome = typeof predictionOutcomes.$inferSelect;

export type InsertFeatureSnapshot = z.infer<typeof insertFeatureSnapshotSchema>;
export type FeatureSnapshot = typeof featureSnapshots.$inferSelect;

export type InsertUserGoalLive = z.infer<typeof insertUserGoalLiveSchema>;
export type UserGoalLive = typeof userGoalsLive.$inferSelect;

export type InsertUserGoalPaper = z.infer<typeof insertUserGoalPaperSchema>;
export type UserGoalPaper = typeof userGoalsPaper.$inferSelect;

export type InsertGoalAnalysisHistoryLive = z.infer<typeof insertGoalAnalysisHistoryLiveSchema>;
export type GoalAnalysisHistoryLive = typeof goalAnalysisHistoryLive.$inferSelect;

export type InsertGoalAnalysisHistoryPaper = z.infer<typeof insertGoalAnalysisHistoryPaperSchema>;
export type GoalAnalysisHistoryPaper = typeof goalAnalysisHistoryPaper.$inferSelect;

export type InsertScreenerResult = z.infer<typeof insertScreenerResultSchema>;
export type ScreenerResult = typeof screenerResults.$inferSelect;

export type InsertFilterCalibrationLog = z.infer<typeof insertFilterCalibrationLogSchema>;
export type FilterCalibrationLog = typeof filterCalibrationLog.$inferSelect;

export type InsertIntradayAdjustment = z.infer<typeof insertIntradayAdjustmentSchema>;
export type IntradayAdjustment = typeof intradayAdjustments.$inferSelect;

export type InsertAILesson = z.infer<typeof insertAILessonSchema>;
export type AILesson = typeof aiLessons.$inferSelect;

export type InsertPortfolioAdjustment = z.infer<typeof insertPortfolioAdjustmentSchema>;
export type PortfolioAdjustment = typeof portfolioAdjustments.$inferSelect;

export type InsertSystemAlert = z.infer<typeof insertSystemAlertSchema>;
export type SystemAlert = typeof systemAlerts.$inferSelect;

export type InsertStrategyParameter = z.infer<typeof insertStrategyParameterSchema>;
export type StrategyParameter = typeof strategyParameters.$inferSelect;

export type InsertAITransparencyLog = z.infer<typeof insertAITransparencyLogSchema>;
export type AITransparencyLog = typeof aiTransparencyLog.$inferSelect;

export type InsertFilterDiagnostic = z.infer<typeof insertFilterDiagnosticSchema>;
export type FilterDiagnostic = typeof filterDiagnostics.$inferSelect;

export type InsertActuationPolicy = z.infer<typeof insertActuationPolicySchema>;
export type ActuationPolicy = typeof actuationPolicies.$inferSelect;

export type InsertProposedAdjustment = z.infer<typeof insertProposedAdjustmentSchema>;
export type ProposedAdjustment = typeof proposedAdjustments.$inferSelect;

export type InsertAssetCapability = z.infer<typeof insertAssetCapabilitySchema>;
export type AssetCapability = typeof assetCapabilities.$inferSelect;

export type InsertHistoricSignal = z.infer<typeof insertHistoricSignalSchema>;
export type HistoricSignal = typeof historicSignals.$inferSelect;

export type InsertPaperSimTrade = z.infer<typeof insertPaperSimTradeSchema>;
export type PaperSimTrade = typeof paperSimTrades.$inferSelect;

export type InsertPaperSimOpenPosition = z.infer<typeof insertPaperSimOpenPositionSchema>;
export type PaperSimOpenPosition = typeof paperSimOpenPositions.$inferSelect;

export type InsertPaperSimTradeLog = z.infer<typeof insertPaperSimTradeLogSchema>;
export type PaperSimTradeLog = typeof paperSimTradeLogs.$inferSelect;

// AI Orchestrator logs table
export const aiOrchestratorLogs = pgTable("ai_orchestrator_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  category: varchar("category", { length: 50 }).notNull(), // e.g., 'system', 'trading', 'optimization'
  recommendation: text("recommendation").notNull(),
  actionTaken: text("action_taken"),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, approved, rejected, executed
  urgencyLevel: varchar("urgency_level", { length: 20 }).default("low"), // low, medium, high
  metadata: jsonb("metadata"), // Additional context data
});

export const insertAIOrchestratorLogSchema = createInsertSchema(aiOrchestratorLogs).omit({ id: true, timestamp: true });
export const updateAIOrchestratorLogSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'executed']),
  actionTaken: z.string().nullable().optional(),
});
export type InsertAIOrchestratorLog = z.infer<typeof insertAIOrchestratorLogSchema>;
export type UpdateAIOrchestratorLog = z.infer<typeof updateAIOrchestratorLogSchema>;
export type AIOrchestratorLog = typeof aiOrchestratorLogs.$inferSelect;

// Context-specific chat history (for Goals, Guardrails, Screener, Strategies tabs)
export const contextChats = pgTable("context_chats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  context: varchar("context", { length: 50 }).notNull(), // e.g., 'goals', 'guardrails', 'screener', 'strategies'
  role: varchar("role", { length: 20 }).notNull(), // 'user' or 'assistant'
  message: text("message").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
});

export const insertContextChatSchema = createInsertSchema(contextChats).omit({ id: true, timestamp: true });
export type InsertContextChat = z.infer<typeof insertContextChatSchema>;
export type ContextChat = typeof contextChats.$inferSelect;

// Phase 5.8: Expert Context System

// Expert sources - Reference library (must be defined before expertPrinciples for foreign key reference)
export const expertSources = pgTable("expert_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  author: text("author").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'book', 'blog', 'research', 'news_analysis', 'platform_education'
  category: varchar("category", { length: 50 }).notNull(),
  credibilityScore: integer("credibility_score").notNull(),
  url: text("url"),
  publicationYear: integer("publication_year"),
  rationale: text("rationale"),
  keyTopics: text("key_topics").array(),
  dateAdded: timestamp("date_added", { withTimezone: true }).defaultNow(),
  isActive: boolean("is_active").default(true),
});

// Expert principles - Core trading knowledge base
export const expertPrinciples = pgTable("expert_principles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  principle: text("principle").notNull(),
  category: varchar("category", { length: 50 }).notNull(), // 'psychology', 'risk_management', 'market_structure', 'trade_execution'
  sourceId: varchar("source_id").references(() => expertSources.id).notNull(),
  sourceName: text("source_name").notNull(),
  sourceAuthor: text("source_author").notNull(),
  credibilityScore: integer("credibility_score").notNull(), // 1-5 scale
  dateAdded: timestamp("date_added", { withTimezone: true }).defaultNow(),
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),
  metadata: jsonb("metadata"), // Additional context, tags, etc.
});

// Expert updates - Weekly insights from credible sources
export const expertUpdates = pgTable("expert_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").references(() => expertSources.id).notNull(),
  sourceName: text("source_name").notNull(),
  author: text("author").notNull(),
  insight: text("insight").notNull(), // Max 200 characters
  url: text("url"),
  credibilityScore: integer("credibility_score").notNull(),
  date: date("date").notNull(),
  weekOf: date("week_of").notNull(), // Week identifier
  isActive: boolean("is_active").default(true),
  appliedToCorpus: boolean("applied_to_corpus").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Expert compliance reports - Walter's self-evaluation
export const expertComplianceReports = pgTable("expert_compliance_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  reportDate: date("report_date").notNull(),
  weekOf: date("week_of").notNull(),
  tradesReviewed: integer("trades_reviewed").notNull(),
  
  // Adherence metrics by category
  psychologyAdherence: decimal("psychology_adherence", { precision: 5, scale: 2 }), // percentage
  riskManagementAdherence: decimal("risk_management_adherence", { precision: 5, scale: 2 }),
  marketStructureAdherence: decimal("market_structure_adherence", { precision: 5, scale: 2 }),
  tradeExecutionAdherence: decimal("trade_execution_adherence", { precision: 5, scale: 2 }),
  overallAdherence: decimal("overall_adherence", { precision: 5, scale: 2 }),
  
  // Violations
  topViolatedPrinciples: jsonb("top_violated_principles"), // Array of {principleId, principle, category, violationCount}
  violationsCount: integer("violations_count").default(0),
  
  // Recommendations
  recommendations: jsonb("recommendations"), // Array of improvement recommendations
  
  // Status and alerts
  status: varchar("status", { length: 20 }).default("completed"), // 'completed', 'in_progress', 'failed'
  alertLevel: varchar("alert_level", { length: 20 }), // 'green', 'yellow', 'red'
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  metadata: jsonb("metadata"),
});

// Expert response logs - Track principle usage in Walter responses
export const expertResponseLogs = pgTable("expert_response_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  chatId: varchar("chat_id").references(() => walterChats.id), // Reference to chat session
  chatLogId: varchar("chat_log_id"), // Optional message ID (no FK to avoid constraint issues)
  principlesInjected: jsonb("principles_injected").notNull(), // Array of {principleId, principle, category}
  responseType: varchar("response_type", { length: 50 }), // 'trade_analysis', 'risk_assessment', 'strategy_explanation', etc.
  expertContextUsed: boolean("expert_context_used").default(false),
  explainabilityScore: integer("explainability_score"), // 1-10 rating of clarity
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
});

// Phase 8.6.3: Data Lineage & Provenance Tracking
export const dataLineage = pgTable("data_lineage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id", { length: 50 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  originatingService: varchar("originating_service", { length: 50 }).notNull(), // 'bob', 'cortex', 'walter', 'ui'
  targetService: varchar("target_service", { length: 50 }), // Destination service (if applicable)
  sourceTable: varchar("source_table", { length: 100 }), // Database table or API endpoint
  mode: tradingModeEnum("mode"),
  globalContextId: varchar("global_context_id", { length: 50 }),
  dataHash: varchar("data_hash", { length: 64 }), // SHA-256 hash of data
  rowCount: integer("row_count"),
  operation: varchar("operation", { length: 20 }), // 'read', 'write', 'aggregate'
  metadata: jsonb("metadata"), // Additional context
}, (table) => ({
  traceIdIdx: index("data_lineage_trace_id_idx").on(table.traceId),
  timestampIdx: index("data_lineage_timestamp_idx").on(table.timestamp),
}));

export const bobTraceLog = pgTable("bob_trace_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id", { length: 50 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  bobModule: varchar("bob_module", { length: 50 }).notNull(), // 'MetricsBob', 'DataBob', etc.
  operation: varchar("operation", { length: 50 }).notNull(), // 'fetch', 'cache', 'invalidate'
  sourceTable: varchar("source_table", { length: 100 }),
  mode: tradingModeEnum("mode"),
  globalContextId: varchar("global_context_id", { length: 50 }),
  cacheHit: boolean("cache_hit"),
  executionTimeMs: integer("execution_time_ms"),
  rowCount: integer("row_count"),
  metadata: jsonb("metadata"),
}, (table) => ({
  traceIdIdx: index("bob_trace_log_trace_id_idx").on(table.traceId),
  bobModuleIdx: index("bob_trace_log_bob_module_idx").on(table.bobModule),
  timestampIdx: index("bob_trace_log_timestamp_idx").on(table.timestamp),
}));

// Phase 8.7.2: Intent Execution Framework - Audit Log
export const intentAuditLog = pgTable("intent_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id", { length: 50 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  userRole: userRoleEnum("user_role").notNull(),
  intentAction: varchar("intent_action", { length: 100 }).notNull(),
  intentPayload: jsonb("intent_payload").notNull(),
  preStateHash: varchar("pre_state_hash", { length: 64 }),
  postStateHash: varchar("post_state_hash", { length: 64 }),
  success: boolean("success").notNull(),
  result: jsonb("result"),
  executionTimeMs: integer("execution_time_ms"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
}, (table) => ({
  traceIdIdx: index("intent_audit_log_trace_id_idx").on(table.traceId),
  userIdIdx: index("intent_audit_log_user_id_idx").on(table.userId),
  timestampIdx: index("intent_audit_log_timestamp_idx").on(table.timestamp),
  intentActionIdx: index("intent_audit_log_intent_action_idx").on(table.intentAction),
}));

// Phase 8.7.4: Context Bridge - WebSocket Broadcast Log
export const contextBridgeLog = pgTable("context_bridge_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id", { length: 50 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'state_update', 'chat_update', etc.
  payload: jsonb("payload").notNull(),
  userId: varchar("user_id").references(() => users.id),
  mode: tradingModeEnum("mode"),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
}, (table) => ({
  traceIdIdx: index("context_bridge_log_trace_id_idx").on(table.traceId),
  timestampIdx: index("context_bridge_log_timestamp_idx").on(table.timestamp),
  eventTypeIdx: index("context_bridge_log_event_type_idx").on(table.eventType),
}));

// Phase 8.8.1: Reasoning Orchestrator - Trace Log
export const reasoningTrace = pgTable("reasoning_trace", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id", { length: 50 }).notNull().unique(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  intentAction: varchar("intent_action", { length: 100 }),
  steps: jsonb("steps").notNull(), // Ordered list of reasoning actions
  domainContext: text("domain_context").array().default(sql`ARRAY[]::text[]`), // Domains used in reasoning
  decisionSummary: text("decision_summary"),
  status: varchar("status", { length: 20 }).default("in_progress").notNull(), // 'in_progress', 'completed', 'failed', 'interrupted'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  traceIdIdx: index("reasoning_trace_trace_id_idx").on(table.traceId),
  userIdIdx: index("reasoning_trace_user_id_idx").on(table.userId),
  timestampIdx: index("reasoning_trace_created_at_idx").on(table.createdAt),
  statusIdx: index("reasoning_trace_status_idx").on(table.status),
}));

// Phase 8.8.1: Reasoning Orchestrator - Async Task Queue
export const reasoningQueue = pgTable("reasoning_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id", { length: 50 }).notNull(),
  taskType: varchar("task_type", { length: 100 }).notNull(), // e.g., 'query_bob', 'validate_guardrails', 'fetch_goals'
  payload: jsonb("payload").notNull(),
  status: reasoningQueueStatusEnum("status").default("pending").notNull(),
  result: jsonb("result"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(), // Phase 8.8.3: Track retry attempts
  retryAt: timestamp("retry_at", { withTimezone: true }), // Phase 8.8.3: Enforce exponential backoff delay
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: varchar("locked_by", { length: 100 }), // Worker ID
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  traceIdIdx: index("reasoning_queue_trace_id_idx").on(table.traceId),
  statusIdx: index("reasoning_queue_status_idx").on(table.status),
  taskTypeIdx: index("reasoning_queue_task_type_idx").on(table.taskType),
  createdAtIdx: index("reasoning_queue_created_at_idx").on(table.createdAt),
}));

// Phase 8.8.2: Memory Lifecycle Manager - Audit Log
export const memoryAuditLog = pgTable("memory_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  checksum: varchar("checksum", { length: 64 }).notNull(), // SHA-256 hash
  status: memoryAuditStatusEnum("status").default("VERIFIED").notNull(),
  traceId: varchar("trace_id", { length: 50 }).references(() => reasoningTrace.traceId),
  userId: varchar("user_id").references(() => users.id),
  memorySnapshot: jsonb("memory_snapshot"), // Core memory state at time of checksum
  repairDetails: jsonb("repair_details"), // Details if status=REPAIRED
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  checksumIdx: index("memory_audit_log_checksum_idx").on(table.checksum),
  statusIdx: index("memory_audit_log_status_idx").on(table.status),
  traceIdIdx: index("memory_audit_log_trace_id_idx").on(table.traceId),
  userIdIdx: index("memory_audit_log_user_id_idx").on(table.userId),
  createdAtIdx: index("memory_audit_log_created_at_idx").on(table.createdAt),
}));

// Insert schemas
export const insertExpertPrincipleSchema = createInsertSchema(expertPrinciples);
export const insertExpertSourceSchema = createInsertSchema(expertSources);
export const insertExpertUpdateSchema = createInsertSchema(expertUpdates);
export const insertExpertComplianceReportSchema = createInsertSchema(expertComplianceReports);
export const insertExpertResponseLogSchema = createInsertSchema(expertResponseLogs);
export const insertDataLineageSchema = createInsertSchema(dataLineage);
export const insertBobTraceLogSchema = createInsertSchema(bobTraceLog);
export const insertIntentAuditLogSchema = createInsertSchema(intentAuditLog);
export const insertContextBridgeLogSchema = createInsertSchema(contextBridgeLog);
export const insertReasoningTraceSchema = createInsertSchema(reasoningTrace);
export const insertReasoningQueueSchema = createInsertSchema(reasoningQueue);
export const insertMemoryAuditLogSchema = createInsertSchema(memoryAuditLog).omit({ id: true, createdAt: true });

// Type exports
export type InsertExpertPrinciple = z.infer<typeof insertExpertPrincipleSchema>;
export type ExpertPrinciple = typeof expertPrinciples.$inferSelect;

export type InsertExpertSource = z.infer<typeof insertExpertSourceSchema>;
export type ExpertSource = typeof expertSources.$inferSelect;

export type InsertExpertUpdate = z.infer<typeof insertExpertUpdateSchema>;
export type ExpertUpdate = typeof expertUpdates.$inferSelect;

export type InsertExpertComplianceReport = z.infer<typeof insertExpertComplianceReportSchema>;
export type ExpertComplianceReport = typeof expertComplianceReports.$inferSelect;

export type InsertExpertResponseLog = z.infer<typeof insertExpertResponseLogSchema>;
export type ExpertResponseLog = typeof expertResponseLogs.$inferSelect;

export type InsertDataLineage = z.infer<typeof insertDataLineageSchema>;
export type DataLineage = typeof dataLineage.$inferSelect;

export type InsertBobTraceLog = z.infer<typeof insertBobTraceLogSchema>;
export type BobTraceLog = typeof bobTraceLog.$inferSelect;

export type InsertIntentAuditLog = z.infer<typeof insertIntentAuditLogSchema>;
export type IntentAuditLog = typeof intentAuditLog.$inferSelect;

export type InsertContextBridgeLog = z.infer<typeof insertContextBridgeLogSchema>;
export type ContextBridgeLog = typeof contextBridgeLog.$inferSelect;

export type InsertReasoningTrace = z.infer<typeof insertReasoningTraceSchema>;
export type ReasoningTrace = typeof reasoningTrace.$inferSelect;

export type InsertReasoningQueue = z.infer<typeof insertReasoningQueueSchema>;
export type ReasoningQueue = typeof reasoningQueue.$inferSelect;

export type InsertMemoryAuditLog = z.infer<typeof insertMemoryAuditLogSchema>;
export type MemoryAuditLog = typeof memoryAuditLog.$inferSelect;

// Orchestrator configuration update schemas
export const orchestratorUpdateGoalSchema = z.object({
  mode: z.enum(['live', 'paper']),
  goalId: z.string().optional(),
  metricName: z.string(),
  goalValue: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
});

export const orchestratorUpdateGuardrailSchema = z.object({
  mode: z.enum(['live', 'paper']),
  field: z.enum(['maxDailyLoss', 'maxDrawdown', 'maxPositionSize', 'maxOpenPositions', 'riskPerTrade', 'aiCanAdjust']),
  value: z.union([z.string(), z.number(), z.boolean()]),
  approved: z.boolean(),
  reason: z.string().optional(),
});

export const orchestratorUpdateStrategySchema = z.object({
  mode: z.enum(['live', 'paper']),
  strategy: z.enum(['vwap_pullback', 'abcd_long', 'sma_trend_ride', 'breakout', 'mean_reversion', 'range_trading', 'vwap_bounce', 'liquidity_trap']),
  field: z.enum(['enabled', 'params']),
  value: z.union([z.boolean(), z.record(z.any())]),
  approved: z.boolean(),
  reason: z.string().optional(),
});

export type OrchestratorUpdateGoal = z.infer<typeof orchestratorUpdateGoalSchema>;
export type OrchestratorUpdateGuardrail = z.infer<typeof orchestratorUpdateGuardrailSchema>;
export type OrchestratorUpdateStrategy = z.infer<typeof orchestratorUpdateStrategySchema>;

// Walter types
export type InsertWalterPendingApproval = z.infer<typeof insertWalterPendingApprovalSchema>;
export type WalterPendingApproval = typeof walterPendingApprovals.$inferSelect;

export type InsertWalterChat = z.infer<typeof insertWalterChatSchema>;
export type WalterChat = typeof walterChats.$inferSelect;

export type InsertWalterChatLog = z.infer<typeof insertWalterChatLogSchema>;
export type WalterChatLog = typeof walterChatLogs.$inferSelect;

export type InsertWalterApprovalsAudit = z.infer<typeof insertWalterApprovalsAuditSchema>;
export type WalterApprovalsAudit = typeof walterApprovalsAudit.$inferSelect;

export type InsertWalterPurpose = z.infer<typeof insertWalterPurposeSchema>;
export type WalterPurpose = typeof walterPurpose.$inferSelect;

export type InsertWalterMemory = z.infer<typeof insertWalterMemorySchema>;
export type WalterMemory = typeof walterMemory.$inferSelect;

export type InsertWalterUserPreferences = z.infer<typeof insertWalterUserPreferencesSchema>;
export type WalterUserPreferences = typeof walterUserPreferences.$inferSelect;

export type InsertLearningFragment = z.infer<typeof insertLearningFragmentSchema>;
export type LearningFragment = typeof learningFragments.$inferSelect;

export type InsertPortfolioState = z.infer<typeof insertPortfolioStateSchema>;
export type PortfolioState = typeof portfolioState.$inferSelect;

export type InsertPatchProposal = z.infer<typeof insertPatchProposalSchema>;
export type PatchProposal = typeof patchProposals.$inferSelect;
