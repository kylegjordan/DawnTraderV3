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
export const opportunityTypeEnum = pgEnum("opportunity_type", ["long_term_hold", "moonshot", "momentum", "breakout", "mean_reversion"]);
export const opportunityStatusEnum = pgEnum("opportunity_status", ["new", "watchlist", "executed", "dismissed", "expired"]);
export const dailyBriefStatusEnum = pgEnum("daily_brief_status", ["in_progress", "final"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password"),
  tradingMode: tradingModeEnum("trading_mode").default("paper"),
  tradingStatus: tradingStatusEnum("trading_status").default("stopped"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Trading settings
export const tradingSettings = pgTable("trading_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
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
  tradingSuspended: boolean("trading_suspended").default(false), // System-controlled flag
  
  // Phase 2: Partial Fill Recovery
  partialFillThreshold: decimal("partial_fill_threshold", { precision: 5, scale: 2 }).default("90.00"), // % threshold
  partialFillAction: varchar("partial_fill_action", { length: 20 }).default("scale"), // 'scale' or 'catchup'
  
  // AI Opportunities Settings
  aiOpportunitiesEnabled: boolean("ai_opportunities_enabled").default(true),
  aiOpportunitiesFrequency: integer("ai_opportunities_frequency").default(60), // minutes
  aiOpportunitiesMaxPairs: integer("ai_opportunities_max_pairs").default(150), // max pairs to send to AI
  aiOpportunitiesMaxSaved: integer("ai_opportunities_max_saved").default(40), // max opportunities to save per run
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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
  lastScanned: timestamp("last_scanned", { withTimezone: true }),
  isActive: boolean("is_active").default(true),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
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
  signalWeights: many(signalWeights),
  predictionOutcomes: many(predictionOutcomes),
  goalsLive: many(userGoalsLive),
  goalsPaper: many(userGoalsPaper),
  goalAnalysisHistoryLive: many(goalAnalysisHistoryLive),
  goalAnalysisHistoryPaper: many(goalAnalysisHistoryPaper),
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
  createdAt: true,
  lastUpdated: true,
});

export const insertAIChatLogSchema = createInsertSchema(aiChatLogs).omit({
  id: true,
  timestamp: true,
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

export type InsertAIChatLog = z.infer<typeof insertAIChatLogSchema>;
export type AIChatLog = typeof aiChatLogs.$inferSelect;

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
