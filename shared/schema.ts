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
  unique,
  index,
  vector,
  serial,
  bigserial,
  doublePrecision,
  real,
  numeric
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
  "range_trade",
  "vwap_bounce",
  "liquidity_trap",
  "dhma",
  "morning_star",
  "inside_bar_reversal",
  "support_bounce",
  "pivot_shift",
  "reverse_impulse",
  "defensive_hedge",
  "adaptive_flow",
  "volatility_edge",
  // B63: Strong Bull Trend (Path D) — QUANT, LONG-only, exclusive quant-strong_trend routing
  "strong_bull_trend",
  // B79.0d: Opening Range Breakout — xstock_spot QUANT, 14:30–17:00 UTC active window
  // (added to enum in B79.0n.STRATEGY 2026-05-24 — B79.0d shipped detect + module_constants
  // rows; CORE_STRATEGIES updated to 19; this enum addition closes the strategy_settings
  // schema-vs-code mismatch surfaced by `npx tsc --noEmit` post-CORE_STRATEGIES update).
  "orb"
]);
export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled"]);
export const tradeTypeEnum = pgEnum("trade_type", ["buy", "sell"]);
export const opportunityTypeEnum = pgEnum("opportunity_type", ["long_term_hold", "moonshot", "momentum", "breakout", "mean_reversion"]);
export const opportunityStatusEnum = pgEnum("opportunity_status", ["new", "watchlist", "executed", "dismissed", "expired"]);
export const dailyBriefStatusEnum = pgEnum("daily_brief_status", ["in_progress", "final"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "cancelled", "dismissed"]);
export const approvalDisplayModeEnum = pgEnum("approval_display_mode", ["inline", "notification"]);
export const patchSeverityEnum = pgEnum("patch_severity", ["critical", "high", "medium", "low", "info"]);
export const patchStatusEnum = pgEnum("patch_status", ["pending", "approved", "rejected", "applied"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "editor", "viewer"]);
export const eventSignificanceEnum = pgEnum("event_significance", ["minor", "significant", "critical"]);
export const executionEventTypeEnum = pgEnum("execution_event_type", ["trade", "balance_update", "risk_report", "engine_event", "anomaly", "strategy_signal"]);
export const reasoningQueueStatusEnum = pgEnum("reasoning_queue_status", ["pending", "in_progress", "completed", "failed"]);
export const memoryAuditStatusEnum = pgEnum("memory_audit_status", ["VERIFIED", "UNVERIFIED", "REPAIRED"]);
export const cognitiveTestResultEnum = pgEnum("cognitive_test_result", ["PASS", "WARN", "FAIL"]);
export const autonomyActionTypeEnum = pgEnum("autonomy_action_type", ["self_check", "self_reasoning", "exploration", "optimization"]);
export const metaAnalysisResultEnum = pgEnum("meta_analysis_result", ["coherent", "inconsistent", "requires_correction"]);
export const awarenessEmotionalStateEnum = pgEnum("awareness_emotional_state", ["stable", "focused", "alert", "fatigued", "overloaded", "recovering"]);
export const alignmentStatusEnum = pgEnum("alignment_status", ["compliant", "at_risk", "violated"]);
export const policyTypeEnum = pgEnum("policy_type", ["ethical", "functional", "operational", "risk"]);
export const alignmentVerificationResultEnum = pgEnum("alignment_verification_result", ["approved", "flagged", "rejected"]);
export const valueCategoryEnum = pgEnum("value_category", ["safety", "fairness", "transparency", "accountability", "user_welfare"]);
export const planStatusEnum = pgEnum("plan_status", ["draft", "active", "paused", "completed"]);
export const learningPhaseEnum = pgEnum("learning_phase", ["observation", "adjustment", "evaluation"]);

// Phase 9.3 enums
export const scenarioTypeEnum = pgEnum("scenario_type", ["risk_assessment", "strategy_optimization", "market_condition", "decision_replay", "what_if_analysis"]);
export const evaluationStatusEnum = pgEnum("evaluation_status", ["pending", "simulating", "completed", "failed"]);
export const outcomeConfidenceEnum = pgEnum("outcome_confidence", ["very_low", "low", "medium", "high", "very_high"]);

// Phase 9.6 enums
export const collaborationRoleEnum = pgEnum("collaboration_role", ["coordinator", "analyst", "executor", "reviewer", "observer"]);
export const consensusStateEnum = pgEnum("consensus_state", ["forming", "discussing", "evaluating", "agreed", "disagreed", "overridden"]);

// Phase 9.4 enums (Reflective Intelligence)
export const reflectionDepthEnum = pgEnum("reflection_depth", ["surface", "analytical", "deep", "meta"]);
export const qualityRatingEnum = pgEnum("quality_rating", ["poor", "fair", "good", "excellent"]);

// Phase 9.7 enums
export const feedbackSourceEnum = pgEnum("feedback_source", ["self", "peer", "system"]);

// Phase 9.8 enums
export const oversightFlagTypeEnum = pgEnum("oversight_flag_type", ["instability", "bias", "low_confidence", "conflict", "performance_drop"]);

// Phase 9.9 enums
export const memoryScopeEnum = pgEnum("memory_scope", ["short_term", "medium_term", "long_term"]);

// Phase 10.0 enums
export const optimizationTypeEnum = pgEnum("optimization_type", ["parameter_tuning", "architecture_adjustment", "policy_refinement"]);
export const agentStateEnum = pgEnum("agent_state", ["active", "idle", "suspended", "terminated"]);

// Phase 10.2 enums - Pattern Recognition
export const signalTypeEnum = pgEnum("signal_type", ["QUANT", "PATTERN", "HYBRID"]);
export const patternTypeEnum = pgEnum("pattern_type", ["PINBAR", "ENGULFING", "INSIDE_BAR", "MORNING_STAR", "THREE_SOLDIERS", "ABCD"]);

// Phase 11.0 enums
export const safetySeverityEnum = pgEnum("safety_severity", ["low", "medium", "high", "critical"]);
export const safetyScopeEnum = pgEnum("safety_scope", ["global", "trading", "autonomy", "analysis"]);

// Phase 13.0 enums
export const principleTypeEnum = pgEnum("principle_type", ["foundational", "operational", "contextual"]);
export const violationSeverityEnum = pgEnum("violation_severity", ["low", "medium", "high", "critical"]);
export const ethicalVerdictEnum = pgEnum("ethical_verdict", ["approved", "rejected", "requires_review"]);

// Phase 14.0 enums
export const federatedScopeEnum = pgEnum("federated_scope", ["global", "trading", "devops", "ux", "fullstack"]);
export const propagationStatusEnum = pgEnum("propagation_status", ["pending", "success", "failed", "retrying"]);
export const conflictResolutionEnum = pgEnum("conflict_resolution", ["open", "resolved", "escalated"]);

// Phase 15.0 enums
export const biasTypeEnum = pgEnum("bias_type", ["confirmation", "recency", "anchoring", "overconfidence", "availability", "optimism"]);

// Phase 16.0 enums
export const knowledgeSourceEnum = pgEnum("knowledge_source", ["web", "api", "research", "market", "internal"]);
export const retrievalTrustLevelEnum = pgEnum("retrieval_trust_level", ["low", "medium", "high", "verified"]);

// Phase 26.1 enums
export const tuningApprovalTypeEnum = pgEnum("tuning_approval_type", ["auto", "manual"]);
export const tuningStatusEnum = pgEnum("tuning_status", ["success", "failed", "reverted"]);
export const tuningAggressivenessEnum = pgEnum("tuning_aggressiveness", ["conservative", "balanced", "aggressive"]);

// Phase 4: Goals Presets enums
export const goalsPresetNameEnum = pgEnum("goals_preset_name", ["conservative", "baseline", "optimistic", "maximum", "custom"]);

// Phase 28.C: Override Audit History
export const auditEntityTypeEnum = pgEnum("audit_entity_type", ["guardrails", "filters"]);

// Phase 29: Behavioral Feedback & Adaptive Guardrails
export const behavioralTriggerTypeEnum = pgEnum("behavioral_trigger_type", ["adaptive_change", "user_override", "risk_trigger", "performance_feedback", "coherency_violation"]);
export const learningModeEnum = pgEnum("learning_mode", ["slow", "normal", "aggressive", "disabled"]);

// Phase 8.8.3-J: Execution Attempt Audit Enums
export const executionDecisionEnum = pgEnum("execution_decision", ["OPENED", "BLOCKED"]);
export const executionBlockReasonEnum = pgEnum("execution_block_reason", [
  "KILL_SWITCH",
  "NO_STOP_LOSS",
  "INVALID_STOP_LOSS",
  "POSITION_LIMIT",
  "COOLDOWN",
  "MAX_POSITION",
  "LPCP_LOW_PRICE",
  "LPCP_MIN_NOTIONAL",
  "FX_CONVERSION_FAILED",
  "PORTFOLIO_RISK",
  "INSUFFICIENT_BALANCE",
  "MAX_EXPOSURE",
  "MAX_TRADES"
]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password"),
  displayName: text("display_name"),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  isAdmin: boolean("is_admin").default(false).notNull(),
  role: userRoleEnum("role").default("owner").notNull(),
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
  riskPerTrade: decimal("risk_per_trade", { precision: 10, scale: 2 }).default("150.00"), // DEPRECATED: Use riskPerTradePct instead
  riskPerTradePct: decimal("risk_per_trade_pct", { precision: 5, scale: 2 }).default("4.00"), // Risk per trade as % of portfolio
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
  
  // Auto-Start Paper Trading
  autoStartPaperTrading: boolean("auto_start_paper_trading").default(false), // Auto-start paper trading when eligible pairs found
  
  // Phase 2: Partial Fill Recovery
  partialFillThreshold: decimal("partial_fill_threshold", { precision: 5, scale: 2 }).default("90.00"), // % threshold
  partialFillAction: varchar("partial_fill_action", { length: 20 }).default("scale"), // 'scale' or 'catchup'
  
  // AI Opportunities Settings
  aiOpportunitiesEnabled: boolean("ai_opportunities_enabled").default(true),
  aiOpportunitiesFrequency: integer("ai_opportunities_frequency").default(60), // minutes
  aiOpportunitiesMaxPairs: integer("ai_opportunities_max_pairs").default(150), // max pairs to send to AI
  aiOpportunitiesMaxSaved: integer("ai_opportunities_max_saved").default(40), // max opportunities to save per run
  
  // Notification Preferences
  showSystemAlerts: boolean("show_system_alerts").default(true), // Toggle non-critical notifications
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueUserId: uniqueIndex("trading_settings_user_id_idx").on(table.userId),
}));

// Guardrails (mode-isolated risk parameters) - GLOBAL per mode
export const guardrails = pgTable("guardrails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  maxDailyLoss: decimal("max_daily_loss", { precision: 10, scale: 2 }).default("1000.00"),
  maxDrawdown: decimal("max_drawdown", { precision: 5, scale: 2 }).default("10.00"),
  maxPositionSize: decimal("max_position_size", { precision: 10, scale: 2 }).default("5000.00"),
  maxOpenPositions: integer("max_open_positions").default(5),
  riskPerTrade: decimal("risk_per_trade", { precision: 5, scale: 2 }).default("1.5"),
  maxRequiredCapital: decimal("max_required_capital", { precision: 12, scale: 2 }).default("100000.00"),
  maxRiskPerTradeLimit: decimal("max_risk_per_trade_limit", { precision: 10, scale: 2 }).default("1000.00"),
  aiCanAdjust: boolean("ai_can_adjust").default(false),
  
  // Phase 27.F.14: Execution Rhythm Controls
  cooldownMinutes: integer("cooldown_minutes").default(15), // Symbol cooldown period in minutes (0-90)
  
  // Phase 27.F.14.MICRO: Micro-Execution Loop Controls
  microLoopInterval: integer("micro_loop_interval").default(8), // Micro-loop interval in seconds (5-15)
  priceDeltaTrigger: decimal("price_delta_trigger", { precision: 5, scale: 2 }).default("0.30"), // Minimum % price change to trigger micro-check (0.20-0.60)
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMode: uniqueIndex("guardrails_mode_idx").on(table.mode),
}));

// Phase 2: Guardrails V2 (Core Four - Single Source of Truth)
// Consolidates guardrails + trading_settings risk params into percent-based, mode-global schema
export const guardrailsV2 = pgTable("guardrails_v2", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  
  // CORE FOUR GUARDRAILS (percent-based, portfolio-relative)
  
  // 1. Portfolio Risk per Trade (%) - Range: 0.10% - 5.00%
  portfolioRiskPerTradePct: decimal("portfolio_risk_per_trade_pct", { precision: 5, scale: 2 }).notNull().default("1.50"),
  
  // 2. Symbol Cooldown (minutes) - Range: 1 - 90
  symbolCooldownMinutes: integer("symbol_cooldown_minutes").notNull().default(15),
  
  // 3. Max Open Positions (count) - Range: 1 - 20
  maxOpenPositions: integer("max_open_positions").notNull().default(5),
  
  // 4. Daily Loss Kill Switch (%) - Range: 1.00% - 20.00%
  dailyLossKillSwitchPct: decimal("daily_loss_kill_switch_pct", { precision: 5, scale: 2 }).notNull().default("7.00"),
  
  // 5. Max Position Percent (%) - Range: 1.00% - 100.00%
  // REB 8.8.3-G: Maximum size of any single position as % of portfolio value
  maxPositionPercentPct: decimal("max_position_percent_pct", { precision: 5, scale: 2 }).notNull().default("30.00"),
  
  // 6. Max Total Portfolio Exposure (%) - Range: 10.00% - 100.00%
  // REB 8.8.3-B3: Maximum % of portfolio balance that may be invested across all open positions
  // Formula for single trade: max_single_trade_usd = (portfolio_balance * maxTotalExposurePct) * maxPositionPercentPct
  maxTotalExposurePct: decimal("max_total_exposure_pct", { precision: 5, scale: 2 }).notNull().default("25.00"),
  
  // REB 8.8.3-H: LOW-PRICED COIN PROTECTION (LPCP) MODULE
  // Protects against erratic position sizing for coins with very low prices
  
  // LPCP.1: Minimum Stop Distance (ATR-multiple)
  // For low-priced coins, stop distance will never be smaller than ATR × this multiple
  lowPriceMinStopAtrMult: decimal("low_price_min_stop_atr_mult", { precision: 6, scale: 3 }).notNull().default("3.000"),
  
  // LPCP.2: Minimum Trade Notional ($ floor)
  // The minimum USD value allowed for a low-priced coin trade
  lowPriceMinPositionNotional: decimal("low_price_min_position_notional", { precision: 12, scale: 2 }).notNull().default("25.00"),
  
  // LPCP.3: Low-Price Threshold
  // Coins at or below this price activate low-priced protection rules
  lowPriceThreshold: decimal("low_price_threshold", { precision: 10, scale: 4 }).notNull().default("0.5000"),
  
  // Phase 3: Manual Override Controls (Lottie vs User)
  isManualOverride: boolean("is_manual_override").notNull().default(false), // true = user controls, false = LATTI controls
  tunedByLatti: boolean("tuned_by_latti").notNull().default(true), // true = LATTI manages, false = manual
  lockedByUser: jsonb("locked_by_user").default(sql`'{}'::jsonb`), // Per-parameter lock status: {portfolioRisk: true, cooldown: false, ...}
  
  // Phase 28: Enhanced Override Persistence — Directive 11.8B-D: defaults locked (managedByLottie=false, manualOverrideEnabled=true)
  managedByLottie: boolean("managed_by_lottie").notNull().default(false),
  manualOverrideEnabled: boolean("manual_override_enabled").notNull().default(true),
  lastUpdatedBy: varchar("last_updated_by", { length: 255 }), // User ID or 'latti' or 'system'
  
  // Phase 5: Kill Switch Persistence (Circuit Breaker State)
  killSwitchTripped: boolean("kill_switch_tripped").notNull().default(false), // true = circuit breaker is tripped
  killSwitchReason: text("kill_switch_reason"), // Reason for kill switch activation
  killSwitchTrippedAt: timestamp("kill_switch_tripped_at", { withTimezone: true }), // When it was tripped
  
  // Metadata
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMode: uniqueIndex("guardrails_v2_mode_idx").on(table.mode),
}));

// Phase 4: Goals Presets (Predefined risk profiles for quick configuration)
export const goalsPresets = pgTable("goals_presets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  name: goalsPresetNameEnum("name").notNull(),
  
  // Guardrail values for this preset
  portfolioRiskPerTradePct: decimal("portfolio_risk_per_trade_pct", { precision: 5, scale: 2 }).notNull(),
  dailyLossKillSwitchPct: decimal("daily_loss_kill_switch_pct", { precision: 5, scale: 2 }).notNull(),
  symbolCooldownMinutes: integer("symbol_cooldown_minutes").notNull(),
  maxOpenPositions: integer("max_open_positions").notNull(),
  
  // Analytics (estimated performance)
  tradesPerDayEst: decimal("trades_per_day_est", { precision: 5, scale: 2 }).notNull(),
  targetDailyAvgEarningPct: decimal("target_daily_avg_earning_pct", { precision: 5, scale: 2 }).notNull(),
  
  // Phase 6: Adaptive Learning Fields
  lastAdjustedAt: timestamp("last_adjusted_at", { withTimezone: true }), // When learning engine last adjusted this preset
  learningActive: boolean("learning_active").notNull().default(false), // Whether learning engine is actively managing this preset
  
  // Metadata
  isActive: boolean("is_active").notNull().default(false), // Only one preset active per mode
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueModeAndName: uniqueIndex("goals_presets_mode_name_idx").on(table.mode, table.name),
}));

// Phase 6: Goals Learning Metrics (Performance tracking for adaptive learning)
export const goalsLearningMetrics = pgTable("goals_learning_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  date: date("date").notNull().default(sql`CURRENT_DATE`),
  avgDailyReturn: decimal("avg_daily_return", { precision: 6, scale: 3 }),
  avgRiskPerTrade: decimal("avg_risk_per_trade", { precision: 5, scale: 3 }),
  avgDrawdown: decimal("avg_drawdown", { precision: 5, scale: 3 }),
  tradesCount: integer("trades_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  modeDateIdx: index("goals_learning_mode_date_idx").on(table.mode, table.date),
}));

// Phase 28.E: Coherency Rule Status (Admin control for coherency validation rules)
export const coherencyRuleStatus = pgTable("coherency_rule_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id", { length: 50 }).notNull(), // e.g., "RULE_001"
  enabled: boolean("enabled").notNull().default(true), // Admin can disable individual rules
  lastResult: varchar("last_result", { length: 20 }), // "PASS", "WARN", "FAIL", null
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  failureCount: integer("failure_count").notNull().default(0), // Number of times this rule has failed
  description: text("description"), // Human-readable description from coherency_rules.yaml
  threshold: text("threshold"), // Threshold description (e.g., "≤ 50% × KillSwitch")
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueRuleId: uniqueIndex("coherency_rule_status_rule_id_idx").on(table.ruleId),
}));

// Screener Filters (mode-isolated screening criteria) - GLOBAL per mode
export const screenerFilters = pgTable("screener_filters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  
  // REB 2.9B: Data Quality – Minimum History (Days)
  minHistoryDays: integer("min_history_days").default(30),
  
  // Phase 27.F.14: Advanced Universe & Signal Controls
  universeSize: integer("universe_size").default(100), // Market universe size (25-150)
  quoteCurrencies: jsonb("quote_currencies").default(sql`'["USD"]'::jsonb`), // Array of quote currencies (e.g., ["USD", "EUR", "USDT"])
  activeTimeframes: jsonb("active_timeframes").default(sql`'["5m", "15m", "1h"]'::jsonb`), // Active timeframes (5m, 15m, 1h, 4h)
  confidenceThreshold: integer("confidence_threshold").default(60), // Minimum confidence % (40-90)
  
  // Phase 28: Override Persistence — Directive 11.8B-D: defaults locked (managedByLottie=false, manualOverrideEnabled=true)
  managedByLottie: boolean("managed_by_lottie").notNull().default(false),
  manualOverrideEnabled: boolean("manual_override_enabled").notNull().default(true),
  lockedByUser: jsonb("locked_by_user").default(sql`'{}'::jsonb`), // Per-filter lock status
  // REB 2.12C: Per-filter override modes - stores { filterName: { manualOverrideEnabled: boolean } }
  filterOverrides: jsonb("filter_overrides").default(sql`'{}'::jsonb`),
  lastUpdatedBy: varchar("last_updated_by", { length: 255 }), // User ID or 'latti' or 'system'
  
  // Directive 11.0B: SQE Thresholds (configurable via screeners tab)
  finalScoreMin: decimal("final_score_min", { precision: 5, scale: 4 }).default("0.35"), // Minimum FinalScore for SQE (0.35 default)
  regimeWeightMin: decimal("regime_weight_min", { precision: 5, scale: 4 }).default("0.30"), // Minimum RegimeWeight for SQE (0.30 default)

  // Batch 19G: Filter path discriminator — 4 filter profiles per mode
  filterPath: varchar("filter_path", { length: 20 }).notNull().default('active_quant'),

  // B79.0m.a: per-asset-class scoping — unique index is (mode, asset_class, filter_path).
  // B79.0m.b: surfacing the column in the Drizzle schema so `screenerFilters.assetClass`
  // resolves at the storage layer (was missing — getScreenerFilters with
  // assetClass filter silently matched zero rows on every call).
  assetClass: text("asset_class").notNull().default("crypto_spot"),

  // Batch 19G: IMF (Institutional Math Filters) columns — previously hardcoded in system-guards.ts
  lqMin: decimal("lq_min", { precision: 5, scale: 2 }).default("35.00"),
  vnMax: decimal("vn_max", { precision: 5, scale: 4 }).default("0.9300"),
  corrMax: decimal("corr_max", { precision: 5, scale: 4 }).default("0.9200"),
  diMin: decimal("di_min", { precision: 5, scale: 2 }).default("55.00"),
  diMax: decimal("di_max", { precision: 5, scale: 2 }).default("100.00"),  // Batch 22: DI ceiling for reversal/oscillator families

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  // B79.0m.b2 (2026-05-11): Drizzle source-of-truth aligned with production.
  // Production unique index is `(mode, asset_class, filter_path)` — added by
  // B79.0m.a hotfix when xstock rows were seeded. The Drizzle declaration
  // here was previously `(mode, filterPath)` only, creating schema-file
  // drift; this update closes the drift. No DB migration runs because
  // production already matches the declared final state.
  uniqueModeClassPath: uniqueIndex("screener_filters_mode_class_path_idx").on(
    table.mode, table.assetClass, table.filterPath,
  ),
}));

// B65 (2026-04-23): Module Constants — central 5-dimensional tunable parameter
// table. Replaces hardcoded-in-source constants throughout the signal pipeline
// with a DB-driven configuration surface. Keys are
// (module_name, exchange, asset_class, strategy, regime, constant_name);
// wildcards ('*') indicate "applies to all values of this dimension."
// Resolution is most-specific-wins via moduleConstantsService.ts (60s cache).
// See MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md §3.3.
// Seeded at B65 migration time with current TEC defaults. B66 will add entries
// for the 6 P1 SQE formula constants (SCORE_WEIGHTS + RW coefficients).
export const moduleConstants = pgTable("module_constants", {
  moduleName: text("module_name").notNull(),
  exchange: text("exchange").notNull().default("*"),
  assetClass: text("asset_class").notNull().default("*"),
  strategy: text("strategy").notNull().default("*"),
  regime: text("regime").notNull().default("*"),
  constantName: text("constant_name").notNull(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
}, (table) => ({
  pk: uniqueIndex("module_constants_pk_idx").on(
    table.moduleName,
    table.exchange,
    table.assetClass,
    table.strategy,
    table.regime,
    table.constantName,
  ),
  exchangeAssetIdx: index("module_constants_exchange_asset_idx").on(
    table.exchange,
    table.assetClass,
  ),
}));

export type ModuleConstant = typeof moduleConstants.$inferSelect;
export type InsertModuleConstant = typeof moduleConstants.$inferInsert;

// B67.0 — Regime Factor Alternates table for replay-ablation framework.
// On every signal evaluation, the classifier emits its real decision plus N
// alternate decisions (one per confidence-modifying factor). Each alternate is
// computed as "what would I have decided if this factor were absent?" Nightly
// replay-ablation.ts job replays each alternate against the trade's actual
// price path → counterfactual outcome.
//
// Confidence-modifying factors covered: B67.1 macro, B67.2 phase, B67.4
// outcome feedback, B68.1 multi-TF, B68.2 volume regime, B68.3 pair
// correlation, B68.4 regime age, B68.5 Path B sustainability. Admission-
// gating factors (B67.3 per-underlying limits) use a separate universe-split
// A/B mechanism, NOT this table.
//
// See BATCH_67_SCOPE.md §4 + BATCH_67_PRE_AUDIT.md §6.4.
export const regimeFactorAlternates = pgTable("regime_factor_alternates", {
  id: serial("id").primaryKey(),
  // Source discriminator. 'active_signal' → signalId populated, vtsTradeId null.
  // 'vts_trade' → signalId null, vtsTradeId populated. CHECK constraint at the
  // DB level enforces XOR; both columns nullable here so the discriminator
  // works.
  sourceType: text("source_type").notNull(),
  signalId: integer("signal_id"),
  vtsTradeId: text("vts_trade_id"),
  pairSymbol: text("pair_symbol").notNull(),
  // B67.0.1 (2026-04-30): added for (pair_symbol, evaluated_at, strategy)
  // natural-key join in replay-ablation. Nullable for backfill compat with
  // pre-fix rows; new emits always populate.
  strategy: text("strategy"),
  // B69 (2026-05-03): asset class + exchange dimensions for cross-cutting analysis.
  // Default 'kraken' / 'crypto_spot' matches pre-B69 reality (everything was crypto).
  // New emits set these from `safeResolveAssetClass(symbol, exchange)` at the
  // emit hook in factor-ablation-emitter.ts.
  exchange: text("exchange").notNull().default("kraken"),
  assetClass: text("asset_class").notNull().default("crypto_spot"),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  factorName: text("factor_name").notNull(),
  factorState: text("factor_state").notNull(), // 'alternate_disabled' | 'alternate_enabled'
  realDecision: jsonb("real_decision").notNull(),
  alternateDecision: jsonb("alternate_decision").notNull(),
  replayOutcome: jsonb("replay_outcome"),
  replayCompletedAt: timestamp("replay_completed_at", { withTimezone: true }),
}, (table) => ({
  factorTimeIdx: index("regime_factor_alternates_factor_time_idx").on(
    table.factorName,
    table.evaluatedAt,
  ),
  signalIdx: index("regime_factor_alternates_signal_idx").on(table.signalId),
  vtsTradeIdx: index("regime_factor_alternates_vts_trade_idx").on(table.vtsTradeId),
  pairTimeIdx: index("regime_factor_alternates_pair_time_idx").on(
    table.pairSymbol,
    table.evaluatedAt,
  ),
  // B67.0.1 (2026-04-30): composite for natural-key join.
  naturalKeyIdx: index("regime_factor_alternates_natural_key_idx").on(
    table.pairSymbol,
    table.evaluatedAt,
    table.strategy,
  ),
}));

export type RegimeFactorAlternate = typeof regimeFactorAlternates.$inferSelect;
export type InsertRegimeFactorAlternate = typeof regimeFactorAlternates.$inferInsert;

// Strategy Settings (per mode, per asset class, per strategy)
// Phase 2C: Single-tenant — userId removed.
// B79.0n.STRATEGY (2026-05-24): asset_class column added (NOT NULL after backfill);
// UNIQUE constraint swapped to (globalContextId, mode, strategy, asset_class). Migration
// at 2026-05-24-b79-0n-strategy-per-class.sql.
export const strategySettings = pgTable("strategy_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  assetClass: varchar("asset_class", { length: 20 }).notNull(),  // B79.0n.STRATEGY
  enabled: boolean("enabled").notNull().default(true),
  params: jsonb("params").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueGlobalContextModeStrategyAssetClass: uniqueIndex("strategy_settings_global_context_mode_strategy_asset_class_idx").on(table.globalContextId, table.mode, table.strategy, table.assetClass),
}));

// Strategy Settings Audit Log - GLOBAL per mode
// B79.0n.STRATEGY: same asset_class addition for audit-table parity (per Langston gov flag).
export const strategySettingsAudit = pgTable("strategy_settings_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  assetClass: varchar("asset_class", { length: 20 }).notNull(),  // B79.0n.STRATEGY
  prevParams: jsonb("prev_params"),
  nextParams: jsonb("next_params").notNull(),
  actorType: text("actor_type").notNull(), // 'user' | 'ai'
  actorId: text("actor_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Watchlist pairs - GLOBAL per mode
export const watchlistPairs = pgTable("watchlist_pairs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull().default("paper"),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  quoteCurrency: varchar("quote_currency", { length: 10 }).notNull(),
  // B65 (2026-04-23): asset class + exchange dimensions for modularization.
  // Default 'crypto_spot' / 'kraken' matches current-state behavior. New asset
  // classes (crypto_perp, xstock, equity, fx) and exchanges set at row insert time.
  exchange: text("exchange").notNull().default("kraken"),
  assetClass: text("asset_class").notNull().default("crypto_spot"),
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
  uniqueModeSymbol: unique("watchlist_pairs_mode_symbol_unique").on(table.mode, table.symbol),
}));

// Trading Signals - Active trading opportunities waiting to be executed - GLOBAL per mode
export const tradingSignals = pgTable("trading_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull().default("paper"),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  quoteCurrency: varchar("quote_currency", { length: 10 }).notNull(),
  // B65 (2026-04-23): asset class + exchange dimensions for modularization.
  exchange: text("exchange").notNull().default("kraken"),
  assetClass: text("asset_class").notNull().default("crypto_spot"),
  strategy: strategyTypeEnum("strategy").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(), // 0.0000-1.0000
  entryPrice: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  stopPrice: decimal("stop_price", { precision: 20, scale: 8 }).notNull(),
  targetPrice: decimal("target_price", { precision: 20, scale: 8 }).notNull(),
  currentPrice: decimal("current_price", { precision: 20, scale: 8 }).notNull(),
  vwap: decimal("vwap", { precision: 20, scale: 8 }),
  volume24h: decimal("volume_24h", { precision: 20, scale: 2 }),
  dailyRange: decimal("daily_range", { precision: 5, scale: 2 }), // Percentage
  status: varchar("status", { length: 20 }).notNull().default("active"), // 'active', 'executed', 'expired', 'dismissed'
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // Signals expire after certain time
  executedAt: timestamp("executed_at", { withTimezone: true }),
  metadata: jsonb("metadata"), // Additional signal context (technical indicators, etc.)
  quantity: decimal("quantity", { precision: 20, scale: 8 }), // Phase 8.8.3-J7: Pre-computed position size
  estimatedValue: decimal("estimated_value", { precision: 20, scale: 2 }), // Phase 8.8.3-J7: Pre-computed notional value
}, (table) => ({
  modeStatusIdx: index("trading_signals_mode_status_idx").on(table.mode, table.status),
  symbolStrategyIdx: index("trading_signals_symbol_strategy_idx").on(table.symbol, table.strategy),
  detectedAtIdx: index("trading_signals_detected_at_idx").on(table.detectedAt),
}));

// Trades - GLOBAL per mode
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  // B65 (2026-04-23): baseCurrency added for per-underlying tracking (supports B66
  // per-underlying position limits). Migration-time derivation from symbol using
  // COALESCE(SPLIT_PART(symbol, '/', 1), symbol). NOT NULL post-backfill.
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  // B65: asset class + exchange dimensions for modularization.
  exchange: text("exchange").notNull().default("kraken"),
  assetClass: text("asset_class").notNull().default("crypto_spot"),
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
  tradeMode: varchar("trade_mode", { length: 20 }).default("TARGET"), // Directive 9.2: TARGET or TRAILING_TAKE
  signalType: signalTypeEnum("signal_type").default("QUANT").notNull(), // Directive 10.3: QUANT | PATTERN | HYBRID
  patternType: patternTypeEnum("pattern_type"), // Directive 10.3: Candlestick pattern (if PATTERN/HYBRID)
  patternStrength: decimal("pattern_strength", { precision: 4, scale: 3 }), // Directive 10.3: 0.000-1.000 clarity score
  metadata: jsonb("metadata"), // Additional strategy-specific data
}, (table) => ({
  modeIdx: index("trades_mode_idx").on(table.mode),
  symbolIdx: index("trades_symbol_idx").on(table.symbol),
}));

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

// Phase 41F-L.E2E: Lineage tracking for complete data flow audit trail
export const telemetryLineage = pgTable("telemetry_lineage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id", { length: 100 }).notNull(),
  stage: varchar("stage", { length: 50 }).notNull(), // filter_snapshot, signal_snapshot, order_submitted, order_filled, portfolio_update
  symbol: varchar("symbol", { length: 20 }),
  mode: tradingModeEnum("mode").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata"), // Stage-specific data
}, (table) => ({
  traceIdIdx: index("telemetry_lineage_trace_id_idx").on(table.traceId),
  timestampIdx: index("telemetry_lineage_timestamp_idx").on(table.timestamp),
}));

// Directive 11.1A: Persistent Intelligence - SQL-based Telemetry History
export const marketRegimeEnum = pgEnum("market_regime", [
  "EXTREME_NOISE",
  "BULL_STABLE",
  "BULL_VOLATILE",
  "BEAR_STABLE",
  "BEAR_VOLATILE",
  "LOW_VOL_CHOP",
  "TREND_FRIENDLY_STABLE",
  "HIGH_VOLATILITY_UNSTABLE",
  "RANGE_BOUND_STABLE",
  "IMPULSE_EXPANSION",
  "STRUCTURAL_TRANSITION",
  "HIGH_VOL_IMPULSE"
]);

export const telemetryHistory = pgTable("telemetry_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  regime: marketRegimeEnum("regime").notNull(),
  pool: varchar("pool", { length: 20 }).default("ideal"), // Directive 11.2 R1: ideal or rotational
  finalScore: decimal("final_score", { precision: 5, scale: 4 }).notNull(),
  hybridScore: decimal("hybrid_score", { precision: 5, scale: 4 }),
  regimeWeight: decimal("regime_weight", { precision: 5, scale: 4 }),
  predictiveConfidence: decimal("predictive_confidence", { precision: 5, scale: 4 }),
  successRate: decimal("success_rate", { precision: 5, scale: 4 }),
  sampleCount: integer("sample_count").default(1),
  positionSize: doublePrecision("position_size"), // Directive 11.3: DSE computed trade size
  sizeMultiplier: doublePrecision("size_multiplier"), // Directive 11.3: DSE scaling multiplier (0.3-1.2)
  timeframe: varchar("timeframe", { length: 10 }),
  checksum: varchar("checksum", { length: 64 }),
  metadata: jsonb("metadata"),
  // Phase 14: 6 context dimensions + source tag
  source: varchar("source", { length: 20 }).default("unknown"),
  globalRegime: varchar("global_regime", { length: 40 }),
  pairFriction: decimal("pair_friction", { precision: 5, scale: 2 }),
  globalFriction: decimal("global_friction", { precision: 5, scale: 2 }),
  pairDirectionalBias: varchar("pair_directional_bias", { length: 20 }),
  globalDirectionalBias: varchar("global_directional_bias", { length: 20 }),
  decayPenalty: decimal("decay_penalty", { precision: 5, scale: 4 }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  persistedAt: timestamp("persisted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  regimeIdx: index("telemetry_history_regime_idx").on(table.regime),
  symbolIdx: index("telemetry_history_symbol_idx").on(table.symbol),
  modeTimestampIdx: index("telemetry_history_mode_timestamp_idx").on(table.mode, table.timestamp),
  regimePoolIdx: index("telemetry_history_regime_pool_idx").on(table.regime, table.pool), // Directive 11.2 R1
}));

export const insertTelemetryHistorySchema = createInsertSchema(telemetryHistory).omit({
  id: true,
  persistedAt: true,
});

export type InsertTelemetryHistory = z.infer<typeof insertTelemetryHistorySchema>;
export type TelemetryHistory = typeof telemetryHistory.$inferSelect;

// Directive 11.1B: Adaptive Learning Weight Persistence
export const adaptiveLearning = pgTable("adaptive_learning", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyId: varchar("strategy_id", { length: 50 }).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  regime: marketRegimeEnum("regime").notNull(),
  weights: jsonb("weights").notNull(), // AdaptiveWeights object
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  strategyModeIdx: index("adaptive_learning_strategy_mode_idx").on(table.strategyId, table.mode),
  regimeIdx: index("adaptive_learning_regime_idx").on(table.regime),
  updatedAtIdx: index("adaptive_learning_updated_at_idx").on(table.updatedAt),
}));

export const insertAdaptiveLearningSchema = createInsertSchema(adaptiveLearning).omit({
  id: true,
  createdAt: true,
});

export type InsertAdaptiveLearning = z.infer<typeof insertAdaptiveLearningSchema>;
export type AdaptiveLearning = typeof adaptiveLearning.$inferSelect;

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

// Filter diagnostics (screening health metrics) - GLOBAL per mode
export const filterDiagnostics = pgTable("filter_diagnostics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
// Phase 2C: Single-tenant - userId removed
export const portfolioState = pgTable("portfolio_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  balance: decimal("balance", { precision: 20, scale: 2 }).notNull().default("1000.00"),
  lastUpdate: timestamp("last_update", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueGlobalContextMode: uniqueIndex("portfolio_state_global_context_mode_idx").on(table.globalContextId, table.mode),
}));

// ===== PAPER TRADING TABLES (Isolated from Live) =====

// Paper trades (simulated trades - completely isolated from live) - GLOBAL (legacy table)
export const paperTrades = pgTable("paper_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  ngc: decimal("ngc", { precision: 6, scale: 4 }), // Phase 8.8.4-C: Normalized Global Confidence
  confidence: decimal("confidence", { precision: 6, scale: 4 }), // Phase 8.8.4-C: Raw signal confidence
  profitRate: decimal("profit_rate", { precision: 6, scale: 4 }), // Phase 8.8.4-C: Expected profit per time unit
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

// Goals Engine - Live Mode - GLOBAL
export const goalsLive = pgTable("goals_live", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricName: varchar("metric_name", { length: 100 }).notNull(), // Display name
  metricKey: varchar("metric_key", { length: 100 }).notNull(), // Canonical normalized key
  goalValue: decimal("goal_value", { precision: 15, scale: 2 }),
  actualValue: decimal("actual_value", { precision: 15, scale: 2 }),
  percentAchieved: decimal("percent_achieved", { precision: 5, scale: 2 }),
  aiValidationNotes: text("ai_validation_notes"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMetric: unique().on(table.metricKey),
}));

// Goals Engine - Paper Mode - GLOBAL
export const goalsPaper = pgTable("goals_paper", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricName: varchar("metric_name", { length: 100 }).notNull(), // Display name
  metricKey: varchar("metric_key", { length: 100 }).notNull(), // Canonical normalized key
  goalValue: decimal("goal_value", { precision: 15, scale: 2 }),
  actualValue: decimal("actual_value", { precision: 15, scale: 2 }),
  percentAchieved: decimal("percent_achieved", { precision: 5, scale: 2 }),
  aiValidationNotes: text("ai_validation_notes"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueMetric: unique().on(table.metricKey),
}));

// Goal Analysis History - Live Mode - GLOBAL
export const goalAnalysisHistoryLive = pgTable("goal_analysis_history_live", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

// Goal Analysis History - Paper Mode - GLOBAL
export const goalAnalysisHistoryPaper = pgTable("goal_analysis_history_paper", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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

// Phase 27.5: Goal Audit Log (tracks all goal changes across modes) - GLOBAL
export const goalAuditLog = pgTable("goal_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  action: varchar("action", { length: 50 }).notNull(), // 'created', 'updated', 'deleted', 'analyzed', 'applied'
  metricName: varchar("metric_name", { length: 100 }),
  previousValue: jsonb("previous_value"), // Stores previous state for updates
  newValue: jsonb("new_value"), // Stores new state
  analysisId: varchar("analysis_id"), // Links to goal analysis history
  source: varchar("source", { length: 50 }).default('user'), // 'user', 'ai', 'system'
  metadata: jsonb("metadata"), // Additional context
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  modeIdx: index("goal_audit_log_mode_idx").on(table.mode),
  actionIdx: index("goal_audit_log_action_idx").on(table.action),
  timestampIdx: index("goal_audit_log_timestamp_idx").on(table.timestamp),
}));

// Phase 27.F.14.UI-SYNC.7: User Goals Audit (tracks feasibility checks and blocked attempts) - GLOBAL
export const userGoalsAudit = pgTable("user_goals_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  mode: tradingModeEnum("mode").notNull(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  attemptedValue: decimal("attempted_value", { precision: 20, scale: 8 }).notNull(),
  feasibilityStatus: varchar("feasibility_status", { length: 20 }).notNull(), // 'OK', 'WARN', 'BLOCK'
  feasibilityReason: text("feasibility_reason"), // Detailed explanation
  riskLimit: decimal("risk_limit", { precision: 20, scale: 8 }), // The limit that was checked against
  exceedsBy: decimal("exceeds_by", { precision: 20, scale: 8 }), // How much over the limit (if applicable)
  exploratoryMode: boolean("exploratory_mode").default(false),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdIdx: index("user_goals_audit_user_id_idx").on(table.userId),
  statusIdx: index("user_goals_audit_status_idx").on(table.feasibilityStatus),
  timestampIdx: index("user_goals_audit_timestamp_idx").on(table.timestamp),
}));

// Phase 27.F.15.UI-EARNINGS.3: Daily Performance Summary (tracks daily ADE% per mode) - GLOBAL per mode
export const dailyPerformanceSummary = pgTable("daily_performance_summary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  date: date("date").notNull(), // Trading day date (YYYY-MM-DD)
  portfolioStart: decimal("portfolio_start", { precision: 20, scale: 2 }).notNull(), // Start-of-day portfolio value
  dailyProfit: decimal("daily_profit", { precision: 20, scale: 2 }).notNull(), // Net profit/loss for the day
  adePercent: decimal("ade_percent", { precision: 10, scale: 4 }).notNull(), // (dailyProfit / portfolioStart) * 100
  tradesCount: integer("trades_count").default(0), // Number of trades closed this day
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  modeDateIdx: uniqueIndex("daily_performance_summary_mode_date_idx").on(table.mode, table.date),
  modeIdx: index("daily_performance_summary_mode_idx").on(table.mode),
  dateIdx: index("daily_performance_summary_date_idx").on(table.date),
}));

// Screener Results (operational data - mode isolated) - GLOBAL per mode
export const screenerResults = pgTable("screener_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  modeTimestampIdx: uniqueIndex("screener_results_mode_timestamp_idx").on(table.mode, table.scannedAt),
}));

// Filter Calibration Log (learning data - mode-aware but shared via fallback) - GLOBAL per mode
export const filterCalibrationLog = pgTable("filter_calibration_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  modeTimestampIdx: uniqueIndex("filter_calibration_log_mode_timestamp_idx").on(table.mode, table.timestamp),
}));

// Intraday Adjustments (learning data - mode-aware but shared via fallback) - GLOBAL per mode
export const intradayAdjustments = pgTable("intraday_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  adjustmentType: varchar("adjustment_type", { length: 50 }).notNull(),
  previousValue: decimal("previous_value", { precision: 20, scale: 8 }),
  newValue: decimal("new_value", { precision: 20, scale: 8 }),
  reason: text("reason"),
  marketCondition: varchar("market_condition", { length: 50 }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  modeTimestampIdx: uniqueIndex("intraday_adjustments_mode_timestamp_idx").on(table.mode, table.timestamp),
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

// Portfolio Adjustments (learning data - mode-aware but shared via fallback) - GLOBAL per mode
export const portfolioAdjustments = pgTable("portfolio_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  adjustmentType: varchar("adjustment_type", { length: 50 }).notNull(),
  parameter: varchar("parameter", { length: 100 }),
  previousValue: decimal("previous_value", { precision: 20, scale: 8 }),
  newValue: decimal("new_value", { precision: 20, scale: 8 }),
  reason: text("reason"),
  performanceImpact: decimal("performance_impact", { precision: 10, scale: 4 }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
}, (table) => ({
  modeTimestampIdx: uniqueIndex("portfolio_adjustments_mode_timestamp_idx").on(table.mode, table.timestamp),
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

// Strategy Parameters (shared global parameters - NO mode column) - GLOBAL
export const strategyParameters = pgTable("strategy_parameters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  globalContextId: varchar("global_context_id", { length: 50 }).default("default").notNull(),
  parameterName: varchar("parameter_name", { length: 100 }).notNull(),
  parameterValue: decimal("parameter_value", { precision: 20, scale: 8 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }),
  updatedBy: varchar("updated_by", { length: 20 }).default("user"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueParam: uniqueIndex("strategy_parameters_param_idx").on(table.parameterName),
}));

// Strategy Parameter Schema (metadata for per-strategy configurable parameters) - Phase 30.FX.1
export const strategyParamSchema = pgTable("strategy_param_schema", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  strategyType: strategyTypeEnum("strategy_type").notNull(),
  tradingMode: tradingModeEnum("trading_mode").notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  value: decimal("value", { precision: 20, scale: 8 }).notNull(),
  min: decimal("min", { precision: 20, scale: 8 }).notNull(),
  max: decimal("max", { precision: 20, scale: 8 }).notNull(),
  step: decimal("step", { precision: 20, scale: 8 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueStrategyParam: uniqueIndex("strategy_param_schema_strategy_mode_key_idx").on(table.strategyType, table.tradingMode, table.key),
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

// Phase 5.9: Diagnostic Patch Proposals (Bob fix proposals requiring approval)
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

// Milestone 17C: Historic Signals (backfilled market signals for AI learning) - GLOBAL
export const historicSignals = pgTable("historic_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
}));

// Milestone 18: Paper Trading Simulation Engine Tables

// Paper Trades - Historical record of closed simulated trades - GLOBAL
export const paperSimTrades = pgTable("paper_sim_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  // B65 (2026-04-23): baseCurrency + exchange + assetClass for per-underlying
  // tracking and modularization. baseCurrency derived at migration time from symbol.
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  exchange: text("exchange").notNull().default("kraken"),
  assetClass: text("asset_class").notNull().default("crypto_spot"),
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
  // Phase 8.8.3-C1: Granular fee tracking
  entryFee: decimal("entry_fee", { precision: 20, scale: 8 }).default("0"),
  exitFee: decimal("exit_fee", { precision: 20, scale: 8 }).default("0"),
  totalFee: decimal("total_fee", { precision: 20, scale: 8 }).default("0"),
  // Phase 8.8.3-C4: Slippage tracking
  intendedEntryPrice: decimal("intended_entry_price", { precision: 20, scale: 8 }),
  actualEntryPrice: decimal("actual_entry_price", { precision: 20, scale: 8 }),
  entrySlippage: decimal("entry_slippage", { precision: 20, scale: 8 }).default("0"),
  targetExitPrice: decimal("target_exit_price", { precision: 20, scale: 8 }),
  actualExitPrice: decimal("actual_exit_price", { precision: 20, scale: 8 }),
  exitSlippage: decimal("exit_slippage", { precision: 20, scale: 8 }).default("0"),
  // Phase 8.8.3-C2: Cost transparency and P/L breakdown
  totalCost: decimal("total_cost", { precision: 20, scale: 8 }).default("0"), // entry_fee + exit_fee + entry_slippage + exit_slippage
  grossPnl: decimal("gross_pnl", { precision: 20, scale: 8 }).default("0"), // Market P/L without costs
  netPnl: decimal("net_pnl", { precision: 20, scale: 8 }).default("0"), // gross_pnl - total_cost
  netPnlPercent: decimal("net_pnl_percent", { precision: 10, scale: 4 }).default("0"), // Net return percentage
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closeReason: varchar("close_reason", { length: 50 }), // 'target_hit', 'stop_hit', 'trailing_stop_hit', 'moonbag_timeout', 'strategy_exit', 'manual', 'guardrail'
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  // Directive 10.3: Signal Type Expansion
  signalType: signalTypeEnum("signal_type").default("QUANT").notNull(), // QUANT | PATTERN | HYBRID
  patternType: patternTypeEnum("pattern_type"), // Candlestick pattern (if PATTERN/HYBRID)
  patternStrength: decimal("pattern_strength", { precision: 4, scale: 3 }), // 0.000-1.000 clarity score
  // Batch 19E: Source pool tracking for pattern scanning analysis
  sourcePool: varchar("source_pool", { length: 20 }), // 'quant' | 'pattern' | 'hybrid' | 'xstock' (nullable for existing records)
  // B65.2 (2026-04-23): preserves the trailing-exit mode the trade ended in.
  // TARGET = closed at static target/stop/timeout; TRAILING_TAKE = entered
  // moonbag (trailing) mode and closed via trailing_stop_hit or moonbag_timeout.
  tradeMode: varchar("trade_mode", { length: 20 }).notNull().default("TARGET"),
  // B65.4 (2026-04-25): number of ladder-rung target ratchets before close.
  // 0 = no moonbag entry (closed at target/stop/timeout/qualifier-rejected).
  // 1+ = trade ratcheted through N rungs in moonbag mode before reversing.
  ladderRungsHit: integer("ladder_rungs_hit").notNull().default(0),
  // B65.4.2 (2026-04-28): observability fields for ladder mechanics. Captured
  // from TrailingState at trade close (or at engine-state read time for open
  // positions). All nullable for backward-compat with rows written before
  // these columns existed AND for trades that never latched (originalStopPrice
  // is set at trade open; latchTriggerPrice and rungTargetHistory remain null
  // for trades that never reached target).
  originalStopPrice: decimal("original_stop_price", { precision: 20, scale: 8 }),
  latchTriggerPrice: decimal("latch_trigger_price", { precision: 20, scale: 8 }),
  rungTargetHistory: jsonb("rung_target_history"), // number[] — array of rung target prices crossed in order
  // B67.3 — A/B universe-split cohort marker. CRC32(symbol) % 2 at trade open.
  // Cohort 0: per-underlying cap ENABLED. Cohort 1: cap DISABLED (control).
  // NULL on trades opened before B67.3 deploy.
  pairIdHash: integer("pair_id_hash"),
  // B67.2.1 — Regime classifier confidence + macro modifier + phase persisted
  // at trade-open. NULL on trades opened pre-B67.2.1. Per Kyle directive
  // 2026-04-29 (master plan §0.11.D): observability during the calibration
  // window requires these on every trade record, not just in ablation rows.
  regimeConfidenceRaw: real("regime_confidence_raw"),
  macroModifierValue: real("macro_modifier_value"),
  phase: text("phase"),  // CHECK constraint enforces 'EARLY' | 'PRIME' | 'LATE' | NULL
  phaseAgeSeconds: integer("phase_age_seconds"),
  strategyPhaseWeight: real("strategy_phase_weight"),
  regimeConfidenceModulated: real("regime_confidence_modulated"),
  metadata: jsonb("metadata"), // Signal details, market context, etc.
}, (table) => ({
  symbolIdx: index("paper_sim_trades_symbol_idx").on(table.symbol),
  strategyIdx: index("paper_sim_trades_strategy_idx").on(table.strategyName),
  openedAtIdx: index("paper_sim_trades_opened_at_idx").on(table.openedAt),
  closedAtIdx: index("paper_sim_trades_closed_at_idx").on(table.closedAt),
}));

// Open Positions - Currently active simulated positions - GLOBAL
export const paperSimOpenPositions = pgTable("paper_sim_open_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  // B69 (2026-05-03): asset class + exchange for cross-cutting analysis.
  // New rows are populated via `safeResolveAssetClass(symbol, exchange)` at
  // paper-execution-engine open. Defaults match pre-B69 reality.
  exchange: text("exchange").notNull().default("kraken"),
  assetClass: text("asset_class").notNull().default("crypto_spot"),
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
  // Phase 8.8.3-I10: Volume enrichment - FX5 first, Kraken fallback
  volume24h: decimal("volume_24h", { precision: 20, scale: 2 }),
  volumeBucket: varchar("volume_bucket", { length: 20 }), // 'High' | 'Medium' | 'Low' | 'Very Low'
  // Phase 8.8.3-C1: Entry fee for projected total fees display
  entryFee: decimal("entry_fee", { precision: 20, scale: 8 }).default("0"),
  // Phase 8.8.3-C4: Intended entry price for slippage tracking
  intendedEntryPrice: decimal("intended_entry_price", { precision: 20, scale: 8 }),
  entrySlippage: decimal("entry_slippage", { precision: 20, scale: 8 }).default("0"),
  // Directive 9.2: Trade mode for trailing exit system
  tradeMode: varchar("trade_mode", { length: 20 }).default("TARGET"), // TARGET or TRAILING_TAKE
  // Directive 10.3: Signal Type Expansion
  signalType: signalTypeEnum("signal_type").default("QUANT").notNull(), // QUANT | PATTERN | HYBRID
  patternType: patternTypeEnum("pattern_type"), // Candlestick pattern (if PATTERN/HYBRID)
  patternStrength: decimal("pattern_strength", { precision: 4, scale: 3 }), // 0.000-1.000 clarity score
  // Batch 19E: Source pool tracking for pattern scanning analysis
  sourcePool: varchar("source_pool", { length: 20 }), // 'quant' | 'pattern' | 'hybrid' | 'xstock' (nullable for existing records)
  metadata: jsonb("metadata"), // Signal details, entry reasons, etc.
  // B-NEW-43 chunk 7 (2026-05-23): the B69 `exchange` + `assetClass` columns
  // are already declared earlier in this table at lines ~1744-1745 — the
  // duplicate declarations here were a copy-paste from another paper-sim
  // table and never caught because tsc was running with continue-on-error.
}, (table) => ({
  symbolIdx: uniqueIndex("paper_sim_open_positions_symbol_idx").on(table.symbol),
  strategyIdx: index("paper_sim_open_positions_strategy_idx").on(table.strategyName),
}));

// Trade Logs - Chronological event log for paper trading transparency - GLOBAL
export const paperSimTradeLogs = pgTable("paper_sim_trade_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeId: varchar("trade_id"), // References paper_sim_trades.id (nullable for system events)
  positionId: varchar("position_id"), // References paper_sim_open_positions.id (nullable)
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'position_opened', 'position_closed', 'stop_triggered', 'target_hit', 'guardrail_triggered', 'error'
  message: text("message").notNull(),
  metadata: jsonb("metadata"), // Additional context (prices, quantities, reasons)
}, (table) => ({
  timestampIdx: index("paper_sim_trade_logs_timestamp_idx").on(table.timestamp),
  tradeIdIdx: index("paper_sim_trade_logs_trade_id_idx").on(table.tradeId),
  eventTypeIdx: index("paper_sim_trade_logs_event_type_idx").on(table.eventType),
}));

// Paper Sim Sessions - Persistent tracking of simulation start/stop sessions
// Phase 2C: Single-tenant - userId removed
export const paperSimSessions = pgTable("paper_sim_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id", { length: 100 }).notNull().unique(),
  mode: varchar("mode", { length: 10 }).notNull().default("paper"), // Always 'paper' but included for consistency
  status: varchar("status", { length: 20 }).notNull(), // 'running', 'stopped', 'crashed'
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  startingBalance: decimal("starting_balance", { precision: 20, scale: 2 }).default("10000"),
  endingBalance: decimal("ending_balance", { precision: 20, scale: 2 }),
  runForMs: integer("run_for_ms"), // If time-limited simulation
  endsAt: timestamp("ends_at", { withTimezone: true }), // Calculated from runForMs
  startedBy: varchar("started_by", { length: 50 }).default("manual"), // 'manual', 'api', 'scheduled'
  metadata: jsonb("metadata"), // Additional session context
}, (table) => ({
  statusIdx: index("paper_sim_sessions_status_idx").on(table.status),
  sessionIdIdx: uniqueIndex("paper_sim_sessions_session_id_idx").on(table.sessionId),
  startedAtIdx: index("paper_sim_sessions_started_at_idx").on(table.startedAt),
}));

// Phase 8.8.4-B: RTB Signal Status Enum
// Directive 8.8.4-A3.R7: Added "reconfirmed" status for signals successfully refreshed before expiry
// Directive 8.8.4-A3.R8: Added "active" status for newly validated signals pending first refresh
export const rtbSignalStatusEnum = pgEnum("rtb_signal_status", ["queued", "promoted", "expired", "rejected", "reconfirmed", "active"]);

// Phase 8.8.4-B: Ready-to-Buy (RTB) Signals Queue
// Stores high-quality signals that pass quality guardrails but are blocked by capacity constraints
// Directive 11.0F: Signals ranked exclusively by FinalScore
export const rtbSignals = pgTable("rtb_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: tradingModeEnum("mode").notNull(),
  signalId: varchar("signal_id", { length: 100 }).notNull(), // SLAL signal ID
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  entryPrice: decimal("entry_price", { precision: 20, scale: 8 }).notNull(),
  stopPrice: decimal("stop_price", { precision: 20, scale: 8 }).notNull(),
  targetPrice: decimal("target_price", { precision: 20, scale: 8 }),
  quantity: decimal("quantity", { precision: 20, scale: 8 }),
  notional: decimal("notional", { precision: 20, scale: 2 }),
  // Directive 11.0F: Quality metrics (FinalScore-native)
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(), // 0.0000 to 1.0000
  riskScore: decimal("risk_score", { precision: 5, scale: 4 }).notNull(), // 0.0000 to 1.0000 (lower is better)
  expectedReturn: decimal("expected_return", { precision: 5, scale: 4 }).notNull(), // 0.0000 to 1.0000
  // Directive 11.0F: Primary ranking metrics (ONLY source of truth for signal ranking)
  finalScore: decimal("final_score", { precision: 5, scale: 4 }).notNull(), // Unified ranking score (FinalScore)
  regimeWeight: decimal("regime_weight", { precision: 5, scale: 4 }), // Market regime alignment weight
  hybridScore: decimal("hybrid_score", { precision: 5, scale: 4 }), // Hybrid strategy score component
  decayPenalty: decimal("decay_penalty", { precision: 5, scale: 4 }), // Signal age decay factor
  // Market data for display (Directive 8.8.4-C.14.A)
  currentPrice: decimal("current_price", { precision: 20, scale: 8 }), // Current market price at queue time
  volume24h: decimal("volume_24h", { precision: 20, scale: 2 }), // 24h USD volume
  // Queue management
  status: rtbSignalStatusEnum("status").notNull().default("queued"),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  promotedAt: timestamp("promoted_at", { withTimezone: true }),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // R9.3-C: Made optional - lifecycle governed by SQE, not TTL
  // Directive 8.8.4-A3.R7: Refresh tracking for Central Clock integration
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }), // Last successful refresh timestamp
  missedRefreshes: integer("missed_refreshes").default(0), // Count of failed refresh attempts
  blockReason: varchar("block_reason", { length: 50 }), // Original capacity block: MAX_TRADES, MAX_TOTAL_EXPOSURE, etc.
  promotedTradeId: varchar("promoted_trade_id"), // Trade ID if promoted to execution
  metadata: jsonb("metadata"), // Original signal data for re-evaluation
  // B79.0n.RTB (2026-05-27, Phase 1): per-class queue partitioning key.
  // NULL allowed only during Phase 1+2 backfill window. Post-Phase-3 CHECK
  // constraint enforces NOT NULL; Phase 4 column-level SET NOT NULL is
  // contingent on §6.4 zero-null verify-gate per Langston C-4.
  assetClass: varchar("asset_class", { length: 32 }),
}, (table) => ({
  modeStatusIdx: index("rtb_signals_mode_status_idx").on(table.mode, table.status),
  symbolStrategyIdx: uniqueIndex("rtb_signals_symbol_strategy_idx").on(table.mode, table.symbol, table.strategy, table.status),
  finalScoreIdx: index("rtb_signals_final_score_idx").on(table.finalScore), // Directive 11.0F: FinalScore is ONLY ranking metric
  queuedAtIdx: index("rtb_signals_queued_at_idx").on(table.queuedAt),
  expiresAtIdx: index("rtb_signals_expires_at_idx").on(table.expiresAt),
  // B79.0n.RTB Phase 3: per-class queue hot-read index
  modeAssetClassStatusIdx: index("rtb_signals_mode_asset_class_status_idx").on(table.mode, table.assetClass, table.status),
}));

export type RtbSignal = typeof rtbSignals.$inferSelect;
export type InsertRtbSignal = typeof rtbSignals.$inferInsert;

// Trading Audit Log - Track all trading engine start/stop actions (Phase 27.F.6)
export const tradingAuditLog = pgTable("trading_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: varchar("action", { length: 50 }).notNull(), // 'start', 'stop'
  mode: varchar("mode", { length: 10 }).notNull(), // 'live', 'paper'
  triggeredBy: varchar("triggered_by", { length: 50 }).default("manual"), // 'manual', 'api', 'scheduled'
  metadata: jsonb("metadata"), // Additional context (e.g., confirmation details, reason)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("trading_audit_log_user_idx").on(table.userId),
  actionIdx: index("trading_audit_log_action_idx").on(table.action),
  modeIdx: index("trading_audit_log_mode_idx").on(table.mode),
  createdAtIdx: index("trading_audit_log_created_at_idx").on(table.createdAt),
}));

// Phase 8.8.3-J: Execution Attempt Audit - Append-only diagnostic table for execution attempts
// Tracks every P3 decision (execution_attempt → OPENED or BLOCKED)
// Read-only metrics - NO behavioral changes to trading
export const executionAttemptAudit = pgTable("execution_attempt_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  mode: tradingModeEnum("mode").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: strategyTypeEnum("strategy").notNull(),
  signalId: varchar("signal_id"), // Optional reference to trading_signals.id for RTB linkage
  decision: executionDecisionEnum("decision").notNull(),
  blockReason: executionBlockReasonEnum("block_reason"), // Only set when decision = BLOCKED
  blockDetail: text("block_detail"), // Human-readable description of why blocked
  entryPrice: decimal("entry_price", { precision: 20, scale: 8 }),
  stopPrice: decimal("stop_price", { precision: 20, scale: 8 }),
  targetPrice: decimal("target_price", { precision: 20, scale: 8 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  portfolioValue: decimal("portfolio_value", { precision: 20, scale: 2 }),
  riskAmount: decimal("risk_amount", { precision: 20, scale: 2 }),
  positionSize: decimal("position_size", { precision: 20, scale: 8 }),
  tradeId: varchar("trade_id"), // Set only when decision = OPENED, references paper_sim_trades.id
}, (table) => ({
  createdAtIdx: index("execution_attempt_audit_created_at_idx").on(table.createdAt),
  modeIdx: index("execution_attempt_audit_mode_idx").on(table.mode),
  symbolIdx: index("execution_attempt_audit_symbol_idx").on(table.symbol),
  strategyIdx: index("execution_attempt_audit_strategy_idx").on(table.strategy),
  decisionIdx: index("execution_attempt_audit_decision_idx").on(table.decision),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  settings: many(tradingSettings),
  // NOTE: Removed global trading tables - they no longer have userId after Phase 27.F.15.A
  // watchlist: many(watchlistPairs),
  // trades: many(trades),
  // paperTrades: many(paperTrades),
  // goalsLive: many(goalsLive),
  // goalsPaper: many(goalsPaper),
  // goalAnalysisHistoryLive: many(goalAnalysisHistoryLive),
  // goalAnalysisHistoryPaper: many(goalAnalysisHistoryPaper),
  reports: many(aiReports),
  conversations: many(aiConversations),
  killSwitchEvents: many(killSwitchEvents),
  opportunityRuns: many(aiOpportunityRuns),
  opportunities: many(aiOpportunities),
  dailyBriefs: many(dailyBriefs),
  paperDailyBriefs: many(paperDailyBriefs),
  paperAIReports: many(paperAIReports),
  learningSources: many(learningSources),
  signalWeights: many(signalWeights),
  predictionOutcomes: many(predictionOutcomes),
}));

export const tradingSettingsRelations = relations(tradingSettings, ({ one }) => ({
  user: one(users, {
    fields: [tradingSettings.userId],
    references: [users.id],
  }),
}));

// Phase 27.F.15.A: Removed user relations for global trading tables
// watchlistPairsRelations, tradingSignalsRelations, tradesRelations
// These tables are now global per mode and don't have userId

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

// Phase 27.F.15.A: Removed paperTradesRelations - table is now global

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
  updatedAt: true,
});

export const insertTradingSettingsSchema = createInsertSchema(tradingSettings).omit({
  id: true,
  updatedAt: true,
}).extend({
  riskPerTrade: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxExposurePercent: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  slippageToleranceMajors: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  slippageToleranceMidcaps: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  slippageToleranceSmall: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  stopBufferPercent: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  minVolume: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  minDailyRange: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  minPrice: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxBidAskSpread: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  dailyLossKillSwitch: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  dailyLossWarningTrigger: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxPositionPercent: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  portfolioValue: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
});

export const insertGuardrailsSchema = createInsertSchema(guardrails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  maxDailyLoss: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxDrawdown: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxPositionSize: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  riskPerTrade: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxRequiredCapital: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxRiskPerTradeLimit: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
});

// Phase 2: Guardrails V2 Insert Schema
export const insertGuardrailsV2Schema = createInsertSchema(guardrailsV2).omit({
  id: true,
  lastUpdated: true,
}).extend({
  portfolioRiskPerTradePct: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  dailyLossKillSwitchPct: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxPositionPercentPct: z.union([z.string(), z.number()]).transform(val => String(val)).optional(), // REB 8.8.3-G
});

// Phase 4: Goals Presets Insert Schema
export const insertGoalsPresetsSchema = createInsertSchema(goalsPresets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAdjustedAt: true,
}).extend({
  portfolioRiskPerTradePct: z.union([z.string(), z.number()]).transform(val => String(val)),
  dailyLossKillSwitchPct: z.union([z.string(), z.number()]).transform(val => String(val)),
  tradesPerDayEst: z.union([z.string(), z.number()]).transform(val => String(val)),
  targetDailyAvgEarningPct: z.union([z.string(), z.number()]).transform(val => String(val)),
});

// Phase 6: Goals Learning Metrics Insert Schema
export const insertGoalsLearningMetricsSchema = createInsertSchema(goalsLearningMetrics).omit({
  id: true,
  updatedAt: true,
}).extend({
  avgDailyReturn: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : String(val)).optional(),
  avgRiskPerTrade: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : String(val)).optional(),
  avgDrawdown: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : String(val)).optional(),
});

// Phase 28.E: Coherency Rule Status Insert Schema
export const insertCoherencyRuleStatusSchema = createInsertSchema(coherencyRuleStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastCheckedAt: true,
});

export const insertScreenerFiltersSchema = createInsertSchema(screenerFilters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  minVolume: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  minPrice: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxPrice: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  minMarketCap: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  maxBidAskSpread: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  volatilityMin: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  volatilityMax: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  minLiquidity: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  // Directive 11.0B: SQE Thresholds
  finalScoreMin: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  regimeWeightMin: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  // Batch 19G: Filter path and IMF columns
  filterPath: z.string().optional(),
  lqMin: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  vnMax: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  corrMax: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  diMin: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
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

export const insertTradingSignalSchema = createInsertSchema(tradingSignals).omit({
  id: true,
  detectedAt: true,
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
// Phase 27.F: Make metric_key optional since it's auto-generated from metric_name
// Phase 27.F.15.A: Renamed tables userGoalsLive→goalsLive, userGoalsPaper→goalsPaper
export const insertGoalLiveSchema = createInsertSchema(goalsLive).omit({
  id: true,
  lastUpdated: true,
}).extend({
  metricKey: z.string().optional(),
});

export const insertGoalPaperSchema = createInsertSchema(goalsPaper).omit({
  id: true,
  lastUpdated: true,
}).extend({
  metricKey: z.string().optional(),
});

export const insertGoalAnalysisHistoryLiveSchema = createInsertSchema(goalAnalysisHistoryLive).omit({
  id: true,
  createdAt: true,
});

export const insertGoalAnalysisHistoryPaperSchema = createInsertSchema(goalAnalysisHistoryPaper).omit({
  id: true,
  createdAt: true,
});

export const insertGoalAuditLogSchema = createInsertSchema(goalAuditLog).omit({
  id: true,
  timestamp: true,
});

export const insertUserGoalsAuditSchema = createInsertSchema(userGoalsAudit).omit({
  id: true,
  timestamp: true,
});

export const insertDailyPerformanceSummarySchema = createInsertSchema(dailyPerformanceSummary).omit({
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

export const insertStrategyParamSchemaSchema = createInsertSchema(strategyParamSchema).omit({
  id: true,
  createdAt: true,
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

export const insertPaperSimSessionSchema = createInsertSchema(paperSimSessions).omit({
  id: true,
  startedAt: true,
});

// Phase 8.8.3-J: Execution Attempt Audit insert schema
export const insertExecutionAttemptAuditSchema = createInsertSchema(executionAttemptAudit).omit({
  id: true,
  createdAt: true,
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

// Phase 2: Guardrails V2 Types
export type InsertGuardrailsV2 = z.infer<typeof insertGuardrailsV2Schema>;
export type GuardrailsV2 = typeof guardrailsV2.$inferSelect;

// Phase 4: Goals Presets Types
export type InsertGoalsPresets = z.infer<typeof insertGoalsPresetsSchema>;
export type GoalsPresets = typeof goalsPresets.$inferSelect;

// Phase 6: Goals Learning Metrics Types
export type InsertGoalsLearningMetrics = z.infer<typeof insertGoalsLearningMetricsSchema>;
export type GoalsLearningMetrics = typeof goalsLearningMetrics.$inferSelect;

// Phase 28.E: Coherency Rule Status Types
export type InsertCoherencyRuleStatus = z.infer<typeof insertCoherencyRuleStatusSchema>;
export type CoherencyRuleStatus = typeof coherencyRuleStatus.$inferSelect;

export type InsertScreenerFilters = z.infer<typeof insertScreenerFiltersSchema>;
export type ScreenerFilters = typeof screenerFilters.$inferSelect;

export type InsertStrategySettings = z.infer<typeof insertStrategySettingsSchema>;
export type StrategySettings = typeof strategySettings.$inferSelect;

export type InsertStrategySettingsAudit = z.infer<typeof insertStrategySettingsAuditSchema>;
export type StrategySettingsAudit = typeof strategySettingsAudit.$inferSelect;

export type InsertWatchlistPair = z.infer<typeof insertWatchlistPairSchema>;
export type WatchlistPair = typeof watchlistPairs.$inferSelect;

export type InsertTradingSignal = z.infer<typeof insertTradingSignalSchema>;
export type TradingSignal = typeof tradingSignals.$inferSelect;

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

export type InsertGoalLive = z.infer<typeof insertGoalLiveSchema>;
export type GoalLive = typeof goalsLive.$inferSelect;

export type InsertGoalPaper = z.infer<typeof insertGoalPaperSchema>;
export type GoalPaper = typeof goalsPaper.$inferSelect;

export type InsertGoalAnalysisHistoryLive = z.infer<typeof insertGoalAnalysisHistoryLiveSchema>;
export type GoalAnalysisHistoryLive = typeof goalAnalysisHistoryLive.$inferSelect;

export type InsertGoalAnalysisHistoryPaper = z.infer<typeof insertGoalAnalysisHistoryPaperSchema>;
export type GoalAnalysisHistoryPaper = typeof goalAnalysisHistoryPaper.$inferSelect;

export type InsertGoalAuditLog = z.infer<typeof insertGoalAuditLogSchema>;
export type GoalAuditLog = typeof goalAuditLog.$inferSelect;

export type InsertUserGoalsAudit = z.infer<typeof insertUserGoalsAuditSchema>;
export type UserGoalsAudit = typeof userGoalsAudit.$inferSelect;

export type InsertDailyPerformanceSummary = z.infer<typeof insertDailyPerformanceSummarySchema>;
export type DailyPerformanceSummary = typeof dailyPerformanceSummary.$inferSelect;

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

export type InsertStrategyParamSchema = z.infer<typeof insertStrategyParamSchemaSchema>;
export type StrategyParamSchema = typeof strategyParamSchema.$inferSelect;

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

export type InsertPaperSimSession = z.infer<typeof insertPaperSimSessionSchema>;
export type PaperSimSession = typeof paperSimSessions.$inferSelect;

// Phase 8.8.3-J: Execution Attempt Audit types
export type InsertExecutionAttemptAudit = z.infer<typeof insertExecutionAttemptAuditSchema>;
export type ExecutionAttemptAudit = typeof executionAttemptAudit.$inferSelect;

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

// Expert compliance reports - system self-evaluation
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

// Expert response logs - Track principle usage in AI responses
export const expertResponseLogs = pgTable("expert_response_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  chatId: varchar("chat_id"),
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
  originatingService: varchar("originating_service", { length: 50 }).notNull(), // 'bob', 'cortex', 'ui'
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

// Phase 8.8.4: Cognitive Tuning & Testing - Performance Benchmark Log
export const cognitiveTuningLog = pgTable("cognitive_tuning_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id", { length: 50 }).notNull(), // Test session ID
  scenario: text("scenario").notNull(), // Test description
  avgLatencyMs: doublePrecision("avg_latency_ms"), // Mean reasoning latency
  domainAccuracy: jsonb("domain_accuracy"), // Per-domain pass/fail stats
  memoryChecksumStatus: varchar("memory_checksum_status", { length: 20 }), // VERIFIED/UNVERIFIED/REPAIRED
  queueThroughput: doublePrecision("queue_throughput"), // Tasks per second
  result: cognitiveTestResultEnum("result").notNull(), // PASS/WARN/FAIL
  metrics: jsonb("metrics"), // Additional performance data
  errors: jsonb("errors"), // Error details if any
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  runIdIdx: index("cognitive_tuning_log_run_id_idx").on(table.runId),
  scenarioIdx: index("cognitive_tuning_log_scenario_idx").on(table.scenario),
  resultIdx: index("cognitive_tuning_log_result_idx").on(table.result),
  createdAtIdx: index("cognitive_tuning_log_created_at_idx").on(table.createdAt),
}));

// Phase 8.9.1: Autonomy Controller - Audit Log
export const autonomyAuditLog = pgTable("autonomy_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id", { length: 50 }).notNull(), // Self-check session ID
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  actionType: autonomyActionTypeEnum("action_type").notNull(), // self_check, self_reasoning, exploration, optimization
  triggerSource: varchar("trigger_source", { length: 50 }).notNull(), // 'scheduled', 'manual', 'threshold_breach'
  traceId: varchar("trace_id", { length: 50 }).references(() => reasoningTrace.traceId),
  assessmentResult: jsonb("assessment_result").notNull(), // Health scores, cognitive metrics, etc.
  actionsTriggered: text("actions_triggered").array().default(sql`ARRAY[]::text[]`), // Follow-up actions initiated
  success: boolean("success").notNull(),
  executionTimeMs: integer("execution_time_ms"),
  metadata: jsonb("metadata"),
}, (table) => ({
  runIdIdx: index("autonomy_audit_log_run_id_idx").on(table.runId),
  actionTypeIdx: index("autonomy_audit_log_action_type_idx").on(table.actionType),
  timestampIdx: index("autonomy_audit_log_timestamp_idx").on(table.timestamp),
  traceIdIdx: index("autonomy_audit_log_trace_id_idx").on(table.traceId),
}));

// Phase 8.9.2: Meta-Reasoning Engine - Analysis Log
export const metaReasoningLog = pgTable("meta_reasoning_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  analysisId: varchar("analysis_id", { length: 50 }).notNull().unique(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  targetTraceId: varchar("target_trace_id", { length: 50 }).references(() => reasoningTrace.traceId).notNull(),
  analysisResult: metaAnalysisResultEnum("analysis_result").notNull(), // coherent, inconsistent, requires_correction
  integrityScore: doublePrecision("integrity_score"), // 0-1 coherence score
  detectedIssues: jsonb("detected_issues"), // Array of identified problems
  correctionPlan: jsonb("correction_plan"), // Structured plan for fixes
  correctionApplied: boolean("correction_applied").default(false),
  correctionResult: jsonb("correction_result"), // Outcome of correction if applied
  executionTimeMs: integer("execution_time_ms"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  analysisIdIdx: index("meta_reasoning_log_analysis_id_idx").on(table.analysisId),
  targetTraceIdIdx: index("meta_reasoning_log_target_trace_id_idx").on(table.targetTraceId),
  analysisResultIdx: index("meta_reasoning_log_analysis_result_idx").on(table.analysisResult),
  timestampIdx: index("meta_reasoning_log_created_at_idx").on(table.createdAt),
}));

// Phase 8.94: Awareness Core - State Log
export const awarenessStateLog = pgTable("awareness_state_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stateId: varchar("state_id", { length: 50 }).notNull().unique(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  userId: varchar("user_id", { length: 50 }),
  healthScore: doublePrecision("health_score").notNull(),
  cognitiveScore: doublePrecision("cognitive_score").notNull(),
  emotionalState: awarenessEmotionalStateEnum("emotional_state").notNull(),
  dominantDomain: varchar("dominant_domain", { length: 50 }),
  activeDomains: text("active_domains").array().default(sql`ARRAY[]::text[]`),
  missionFocus: text("mission_focus"),
  recentActions: jsonb("recent_actions"), // Summary of recent autonomy actions
  reflectionSummary: text("reflection_summary"), // Self-reflection narrative
  confidenceScore: doublePrecision("confidence_score"), // Overall confidence in current state
  anomalyDetected: boolean("anomaly_detected").default(false),
  metadata: jsonb("metadata"),
}, (table) => ({
  stateIdIdx: index("awareness_state_log_state_id_idx").on(table.stateId),
  timestampIdx: index("awareness_state_log_timestamp_idx").on(table.timestamp),
  emotionalStateIdx: index("awareness_state_log_emotional_state_idx").on(table.emotionalState),
  userIdIdx: index("awareness_state_log_user_id_idx").on(table.userId),
}));

// Phase 9.0: Experience Memory - Learned Lessons and Insights
export const experienceMemoryLog = pgTable("experience_memory_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memoryId: varchar("memory_id", { length: 50 }).notNull().unique(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  contextDomain: varchar("context_domain", { length: 50 }).notNull(), // e.g., "trading", "system", "cognitive"
  insight: text("insight").notNull(), // The learned lesson or pattern
  confidence: doublePrecision("confidence").notNull(), // 0-1 confidence score
  impact: varchar("impact", { length: 20 }).notNull(), // "high", "medium", "low"
  recommendation: text("recommendation"), // Actionable recommendation
  sourceEvents: jsonb("source_events"), // References to autonomy/awareness events
  metadata: jsonb("metadata"),
}, (table) => ({
  memoryIdIdx: index("experience_memory_log_memory_id_idx").on(table.memoryId),
  timestampIdx: index("experience_memory_log_timestamp_idx").on(table.timestamp),
  contextDomainIdx: index("experience_memory_log_context_domain_idx").on(table.contextDomain),
  impactIdx: index("experience_memory_log_impact_idx").on(table.impact),
}));

// Phase 9.0: Alignment Policies - Ethical and Functional Boundaries
export const alignmentPolicies = pgTable("alignment_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id", { length: 50 }).notNull().unique(),
  policyType: policyTypeEnum("policy_type").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  constraints: jsonb("constraints").notNull(), // Policy rules and thresholds
  isActive: boolean("is_active").default(true).notNull(),
  priority: integer("priority").default(0).notNull(), // Higher = more important
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  policyIdIdx: index("alignment_policies_policy_id_idx").on(table.policyId),
  policyTypeIdx: index("alignment_policies_policy_type_idx").on(table.policyType),
  isActiveIdx: index("alignment_policies_is_active_idx").on(table.isActive),
}));


// Phase 9.0: Goal Alignment Profile - Current Objectives and Weights
export const goalAlignmentProfile = pgTable("goal_alignment_profile", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id", { length: 50 }).notNull().unique(),
  userId: varchar("user_id", { length: 50 }),
  objectives: jsonb("objectives").notNull(), // e.g., {"performance": 0.7, "exploration": 0.3}
  targetMetrics: jsonb("target_metrics").notNull(), // Target values for key metrics
  currentStatus: alignmentStatusEnum("current_status").default("compliant").notNull(),
  lastAdjustment: timestamp("last_adjustment", { withTimezone: true }),
  adjustmentHistory: jsonb("adjustment_history"), // Record of weight changes
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  profileIdIdx: index("goal_alignment_profile_profile_id_idx").on(table.profileId),
  userIdIdx: index("goal_alignment_profile_user_id_idx").on(table.userId),
  currentStatusIdx: index("goal_alignment_profile_current_status_idx").on(table.currentStatus),
}));

// Phase 9.2: Strategic Plan Log - Long-range Goals and Strategies
export const strategicPlanLog = pgTable("strategic_plan_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: varchar("plan_id", { length: 50 }).notNull().unique(),
  userId: varchar("user_id", { length: 50 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: planStatusEnum("status").default("draft").notNull(),
  phases: jsonb("phases").notNull(), // Array of phases with milestones
  successCriteria: jsonb("success_criteria").notNull(), // Measurable goals
  currentProgress: jsonb("current_progress").default(sql`'{}'::jsonb`).notNull(), // Progress tracking
  linkedExperiences: text("linked_experiences").array().default(sql`ARRAY[]::text[]`), // Reference to experience_memory_log
  alignmentScore: doublePrecision("alignment_score").default(0), // Alignment with current policies
  metadata: jsonb("metadata"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  planIdIdx: index("strategic_plan_log_plan_id_idx").on(table.planId),
  userIdIdx: index("strategic_plan_log_user_id_idx").on(table.userId),
  statusIdx: index("strategic_plan_log_status_idx").on(table.status),
}));

// Phase 9.2: Learning Weight Profile - Adaptive Model Parameters
export const learningWeightProfile = pgTable("learning_weight_profile", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id", { length: 50 }).notNull().unique(),
  userId: varchar("user_id", { length: 50 }),
  currentPhase: learningPhaseEnum("current_phase").default("observation").notNull(),
  cognitiveWeights: jsonb("cognitive_weights").notNull(), // e.g., {"reasoning": 0.8, "exploration": 0.2}
  behavioralTendencies: jsonb("behavioral_tendencies").default(sql`'{}'::jsonb`).notNull(), // Learned patterns
  performanceMetrics: jsonb("performance_metrics").default(sql`'{}'::jsonb`).notNull(), // Outcome tracking
  feedbackHistory: jsonb("feedback_history").array().default(sql`ARRAY[]::jsonb[]`), // Learning iterations
  confidenceScore: doublePrecision("confidence_score").default(0.5), // Model confidence 0-1
  lastRetraining: timestamp("last_retraining", { withTimezone: true }),
  revisionHistory: jsonb("revision_history"), // Record of weight changes over time
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  profileIdIdx: index("learning_weight_profile_profile_id_idx").on(table.profileId),
  userIdIdx: index("learning_weight_profile_user_id_idx").on(table.userId),
  currentPhaseIdx: index("learning_weight_profile_current_phase_idx").on(table.currentPhase),
}));

// Phase 9.3: Strategic Simulation Log - Decision Scenario Simulations
export const strategicSimulationLog = pgTable("strategic_simulation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  simulationId: varchar("simulation_id", { length: 50 }).notNull().unique(),
  userId: varchar("user_id", { length: 50 }),
  scenarioType: scenarioTypeEnum("scenario_type").notNull(),
  scenarioDescription: text("scenario_description").notNull(),
  inputState: jsonb("input_state").notNull(), // Initial conditions
  simulatedActions: jsonb("simulated_actions").notNull(), // Actions taken in simulation
  predictedOutcome: jsonb("predicted_outcome").notNull(), // Expected results
  actualOutcome: jsonb("actual_outcome"), // Real results if scenario occurred
  evaluationStatus: evaluationStatusEnum("evaluation_status").default("pending").notNull(),
  outcomeConfidence: outcomeConfidenceEnum("outcome_confidence").default("medium").notNull(),
  successScore: doublePrecision("success_score"), // 0-1 score of simulation success
  lessonsLearned: text("lessons_learned").array().default(sql`ARRAY[]::text[]`),
  linkedDecisions: text("linked_decisions").array().default(sql`ARRAY[]::text[]`), // References to decision_trace_log
  metadata: jsonb("metadata"),
  simulatedAt: timestamp("simulated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  simulationIdIdx: index("strategic_simulation_log_simulation_id_idx").on(table.simulationId),
  userIdIdx: index("strategic_simulation_log_user_id_idx").on(table.userId),
  scenarioTypeIdx: index("strategic_simulation_log_scenario_type_idx").on(table.scenarioType),
  evaluationStatusIdx: index("strategic_simulation_log_evaluation_status_idx").on(table.evaluationStatus),
}));

// Phase 9.3: Decision Trace Log - Historical Decision Tracking
export const decisionTraceLog = pgTable("decision_trace_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionId: varchar("decision_id", { length: 50 }).notNull().unique(),
  userId: varchar("user_id", { length: 50 }),
  decisionType: text("decision_type").notNull(), // e.g., "trade_entry", "risk_adjustment", "strategy_enable"
  contextSnapshot: jsonb("context_snapshot").notNull(), // Full context at decision time
  reasoning: text("reasoning").notNull(), // Why this decision was made
  alternatives: jsonb("alternatives").default(sql`'[]'::jsonb`).notNull(), // Other options considered
  chosenAction: jsonb("chosen_action").notNull(), // What was actually done
  outcome: jsonb("outcome"), // Result of the decision
  outcomeQuality: doublePrecision("outcome_quality"), // 0-1 rating of decision quality
  simulationRef: varchar("simulation_ref", { length: 50 }), // Reference to strategic_simulation_log if simulated first
  linkedExperiences: text("linked_experiences").array().default(sql`ARRAY[]::text[]`), // Related experience_memory_log entries
  metadata: jsonb("metadata"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  decisionIdIdx: index("decision_trace_log_decision_id_idx").on(table.decisionId),
  userIdIdx: index("decision_trace_log_user_id_idx").on(table.userId),
  decisionTypeIdx: index("decision_trace_log_decision_type_idx").on(table.decisionType),
  simulationRefIdx: index("decision_trace_log_simulation_ref_idx").on(table.simulationRef),
}));

// Phase 9.3: Strategic Memory Snapshot - Lessons Learned Repository
export const strategicMemorySnapshot = pgTable("strategic_memory_snapshot", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotId: varchar("snapshot_id", { length: 50 }).notNull().unique(),
  userId: varchar("user_id", { length: 50 }),
  lessonTitle: varchar("lesson_title", { length: 255 }).notNull(),
  lessonContent: text("lesson_content").notNull(),
  sourceSimulations: text("source_simulations").array().default(sql`ARRAY[]::text[]`), // References to strategic_simulation_log
  sourceDecisions: text("source_decisions").array().default(sql`ARRAY[]::text[]`), // References to decision_trace_log
  applicableContexts: jsonb("applicable_contexts").notNull(), // When this lesson applies
  confidenceLevel: outcomeConfidenceEnum("confidence_level").default("medium").notNull(),
  timesApplied: integer("times_applied").default(0), // How often this lesson has been used
  successRate: doublePrecision("success_rate"), // Success rate when applied
  lastApplied: timestamp("last_applied", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotIdIdx: index("strategic_memory_snapshot_snapshot_id_idx").on(table.snapshotId),
  userIdIdx: index("strategic_memory_snapshot_user_id_idx").on(table.userId),
  confidenceLevelIdx: index("strategic_memory_snapshot_confidence_level_idx").on(table.confidenceLevel),
}));

// Phase 9.6: Collaboration Sessions - Cross-Domain Coordination
export const collaborationSessions = pgTable("collaboration_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id", { length: 50 }).notNull().unique(),
  userId: varchar("user_id", { length: 50 }),
  topic: varchar("topic", { length: 255 }).notNull(),
  participants: text("participants").array().notNull(), // Agent IDs: ["TradingBob", "UXBob", etc.]
  consensusState: consensusStateEnum("consensus_state").default("forming").notNull(),
  consensusScore: doublePrecision("consensus_score"), // 0-1 agreement level
  resolutionOutcome: text("resolution_outcome"), // Final decision or action
  contextSnapshot: jsonb("context_snapshot"), // Full state at session start
  metadata: jsonb("metadata"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("collaboration_sessions_session_id_idx").on(table.sessionId),
  userIdIdx: index("collaboration_sessions_user_id_idx").on(table.userId),
  consensusStateIdx: index("collaboration_sessions_consensus_state_idx").on(table.consensusState),
  startedAtIdx: index("collaboration_sessions_started_at_idx").on(table.startedAt),
}));

// Phase 9.6: Collaboration Messages - Inter-Agent Communication
export const collaborationMessages = pgTable("collaboration_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id", { length: 50 }).notNull().unique(),
  sessionId: varchar("session_id", { length: 50 }).notNull(), // References collaboration_sessions
  agentId: varchar("agent_id", { length: 100 }).notNull(), // e.g., "TradingBob", "DevOpsBob"
  role: collaborationRoleEnum("role").notNull(),
  content: text("content").notNull(),
  contributionType: varchar("contribution_type", { length: 50 }), // e.g., "analysis", "recommendation", "objection"
  confidenceLevel: doublePrecision("confidence_level"), // 0-1 agent's confidence
  supportingData: jsonb("supporting_data"), // Evidence or context
  replyTo: varchar("reply_to", { length: 50 }), // messageId if replying to another message
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  messageIdIdx: index("collaboration_messages_message_id_idx").on(table.messageId),
  sessionIdIdx: index("collaboration_messages_session_id_idx").on(table.sessionId),
  agentIdIdx: index("collaboration_messages_agent_id_idx").on(table.agentId),
  timestampIdx: index("collaboration_messages_timestamp_idx").on(table.timestamp),
}));

// Phase 9.6: Consensus Snapshots - Agreement Tracking
export const consensusSnapshots = pgTable("consensus_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  snapshotId: varchar("snapshot_id", { length: 50 }).notNull().unique(),
  sessionId: varchar("session_id", { length: 50 }).notNull(), // References collaboration_sessions
  evaluationPoint: timestamp("evaluation_point", { withTimezone: true }).notNull(),
  participantInputs: jsonb("participant_inputs").notNull(), // Each agent's position
  agreementScores: jsonb("agreement_scores").notNull(), // Per-agent agreement levels
  overallConsensus: doublePrecision("overall_consensus").notNull(), // 0-1 total agreement
  dissenterAgents: text("dissenter_agents").array().default(sql`ARRAY[]::text[]`), // Agents who disagreed
  consensusRationale: text("consensus_rationale"), // Why consensus was/wasn't reached
  decidingFactors: jsonb("deciding_factors"), // Key data points that influenced consensus
  resolutionPath: text("resolution_path"), // How disagreements were resolved
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotIdIdx: index("consensus_snapshots_snapshot_id_idx").on(table.snapshotId),
  sessionIdIdx: index("consensus_snapshots_session_id_idx").on(table.sessionId),
  evaluationPointIdx: index("consensus_snapshots_evaluation_point_idx").on(table.evaluationPoint),
}));

// Phase 9.7: Agent Learning Feedback - Inter-Agent Learning Loops
export const agentLearningFeedback = pgTable("agent_learning_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: varchar("agent_name", { length: 100 }).notNull(), // e.g., "TradingBob", "DevOpsBob"
  domain: varchar("domain", { length: 100 }).notNull(), // e.g., "trading", "devops", "ux"
  sessionId: varchar("session_id", { length: 50 }), // Optional link to collaboration_sessions
  feedbackSource: feedbackSourceEnum("feedback_source").notNull(), // self, peer, system
  accuracyScore: doublePrecision("accuracy_score"), // 0-1 how accurate was the agent
  consensusAlignment: doublePrecision("consensus_alignment"), // 0-1 how aligned with final consensus
  improvementNotes: text("improvement_notes"), // Specific areas for improvement
  metadata: jsonb("metadata"), // Additional context
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  agentNameIdx: index("agent_learning_feedback_agent_name_idx").on(table.agentName),
  domainIdx: index("agent_learning_feedback_domain_idx").on(table.domain),
  sessionIdIdx: index("agent_learning_feedback_session_id_idx").on(table.sessionId),
  createdAtIdx: index("agent_learning_feedback_created_at_idx").on(table.createdAt),
}));

// Phase 9.8: Meta-Cognitive Oversight - Supervises Learning Activity & Bias Detection
export const metaCognitionLog = pgTable("meta_cognition_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceAgent: varchar("source_agent", { length: 100 }), // Agent that triggered the flag
  flagType: oversightFlagTypeEnum("flag_type").notNull(),
  severity: doublePrecision("severity").notNull(), // 0-1 scale
  message: text("message").notNull(),
  context: jsonb("context"), // Additional diagnostic data
  recommendations: text("recommendations").array().default(sql`ARRAY[]::text[]`),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceAgentIdx: index("meta_cognition_log_source_agent_idx").on(table.sourceAgent),
  flagTypeIdx: index("meta_cognition_log_flag_type_idx").on(table.flagType),
  severityIdx: index("meta_cognition_log_severity_idx").on(table.severity),
  resolvedIdx: index("meta_cognition_log_resolved_idx").on(table.resolved),
  createdAtIdx: index("meta_cognition_log_created_at_idx").on(table.createdAt),
}));

// Phase 9.4: Reflection Log - Self-Reflective Analysis Records
export const reflectionLog = pgTable("reflection_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 50 }),
  triggerSource: varchar("trigger_source", { length: 100 }).notNull(),
  reflectionDepth: reflectionDepthEnum("reflection_depth").default("analytical").notNull(),
  subjectArea: varchar("subject_area", { length: 200 }).notNull(),
  analysisText: text("analysis_text").notNull(),
  insights: jsonb("insights"),
  questionsRaised: text("questions_raised").array().default(sql`ARRAY[]::text[]`),
  improvementSuggestions: text("improvement_suggestions").array().default(sql`ARRAY[]::text[]`),
  confidenceScore: doublePrecision("confidence_score"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("reflection_log_user_id_idx").on(table.userId),
  triggerSourceIdx: index("reflection_log_trigger_source_idx").on(table.triggerSource),
  depthIdx: index("reflection_log_reflection_depth_idx").on(table.reflectionDepth),
  createdAtIdx: index("reflection_log_created_at_idx").on(table.createdAt),
}));

// Phase 9.4: Decision Quality Audit - Post-Execution Decision Analysis
export const decisionQualityAudit = pgTable("decision_quality_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionId: varchar("decision_id", { length: 100 }).notNull(),
  userId: varchar("user_id", { length: 50 }),
  decisionType: varchar("decision_type", { length: 100 }).notNull(),
  initialReasoning: text("initial_reasoning"),
  outcomeObserved: text("outcome_observed"),
  qualityRating: qualityRatingEnum("quality_rating").notNull(),
  accuracyScore: doublePrecision("accuracy_score"),
  biasDetected: text("bias_detected").array().default(sql`ARRAY[]::text[]`),
  lessonsLearned: text("lessons_learned"),
  alternativeApproaches: text("alternative_approaches").array().default(sql`ARRAY[]::text[]`),
  wouldRepeat: boolean("would_repeat"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
}, (table) => ({
  decisionIdIdx: index("decision_quality_audit_decision_id_idx").on(table.decisionId),
  userIdIdx: index("decision_quality_audit_user_id_idx").on(table.userId),
  decisionTypeIdx: index("decision_quality_audit_decision_type_idx").on(table.decisionType),
  qualityRatingIdx: index("decision_quality_audit_quality_rating_idx").on(table.qualityRating),
  createdAtIdx: index("decision_quality_audit_created_at_idx").on(table.createdAt),
}));

// Phase 9.9: Strategic Memory Archive - Long-Term Knowledge Persistence
export const strategicMemoryArchive = pgTable("strategic_memory_archive", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  memoryScope: memoryScopeEnum("memory_scope").notNull(),
  summary: text("summary").notNull(), // High-level insight summary
  insights: jsonb("insights").notNull(), // Detailed lessons learned
  performanceDelta: doublePrecision("performance_delta"), // Change in performance metric
  adjustments: jsonb("adjustments"), // What was tuned/learned
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  agentNameIdx: index("strategic_memory_archive_agent_name_idx").on(table.agentName),
  memoryScopeIdx: index("strategic_memory_archive_memory_scope_idx").on(table.memoryScope),
  createdAtIdx: index("strategic_memory_archive_created_at_idx").on(table.createdAt),
}));

// Phase 9.9: Model Calibration Log - Parameter Tuning History
export const modelCalibrationLog = pgTable("model_calibration_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  parameter: varchar("parameter", { length: 200 }).notNull(), // e.g., "confidence_threshold", "bias_weight"
  oldValue: doublePrecision("old_value").notNull(),
  newValue: doublePrecision("new_value").notNull(),
  reason: text("reason").notNull(), // Why the calibration was made
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  agentNameIdx: index("model_calibration_log_agent_name_idx").on(table.agentName),
  parameterIdx: index("model_calibration_log_parameter_idx").on(table.parameter),
  createdAtIdx: index("model_calibration_log_created_at_idx").on(table.createdAt),
}));

// Phase 10.0: Cognitive Core State - Unified Core Optimization Cycles
export const cognitiveCoreState = pgTable("cognitive_core_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cycleId: varchar("cycle_id", { length: 100 }).notNull(),
  activeAgents: integer("active_agents").notNull().default(0),
  optimizationType: optimizationTypeEnum("optimization_type").notNull(),
  score: doublePrecision("score").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  cycleIdIdx: index("cognitive_core_state_cycle_id_idx").on(table.cycleId),
  createdAtIdx: index("cognitive_core_state_created_at_idx").on(table.createdAt),
}));

// Phase 10.0: Agent Registry - Multi-Domain Agent Lifecycle Management
export const agentRegistry = pgTable("agent_registry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  domain: varchar("domain", { length: 100 }).notNull(),
  state: agentStateEnum("state").notNull().default("active"),
  performance: doublePrecision("performance").notNull().default(0.5),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  agentNameIdx: index("agent_registry_agent_name_idx").on(table.agentName),
  domainIdx: index("agent_registry_domain_idx").on(table.domain),
  stateIdx: index("agent_registry_state_idx").on(table.state),
  createdAtIdx: index("agent_registry_created_at_idx").on(table.createdAt),
}));

// Phase 11.0: Safety Policy - Guardrails Configuration
export const safetyPolicy = pgTable("safety_policy", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyName: varchar("policy_name", { length: 100 }).notNull().unique(),
  scope: safetyScopeEnum("scope").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  constraints: jsonb("constraints").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  policyNameIdx: index("safety_policy_policy_name_idx").on(table.policyName),
  scopeIdx: index("safety_policy_scope_idx").on(table.scope),
  enabledIdx: index("safety_policy_enabled_idx").on(table.enabled),
}));

// Phase 11.0: Safety Event Log - Safety Violations and Actions
export const safetyEventLog = pgTable("safety_event_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actor: varchar("actor", { length: 100 }).notNull(),
  action: varchar("action", { length: 200 }).notNull(),
  policyHits: text("policy_hits").array().notNull().default(sql`ARRAY[]::text[]`),
  severity: safetySeverityEnum("severity").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  actorIdx: index("safety_event_log_actor_idx").on(table.actor),
  severityIdx: index("safety_event_log_severity_idx").on(table.severity),
  createdAtIdx: index("safety_event_log_created_at_idx").on(table.createdAt),
}));

// Phase 11.0: Kill Switch - Emergency System Shutdown Control
export const killSwitch = pgTable("kill_switch", {
  id: varchar("id").primaryKey().default("global_kill_switch"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  reason: text("reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Phase 13.0: Ethical Principle - System-wide Values and Moral Heuristics
export const ethicalPrinciple = pgTable("ethical_principle", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  type: principleTypeEnum("type").notNull(),
  description: text("description").notNull(),
  priority: integer("priority").notNull().default(1), // 1=highest priority
  enabled: boolean("enabled").notNull().default(true),
  constraints: jsonb("constraints"), // JSON object with specific constraints for this principle
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nameIdx: index("ethical_principle_name_idx").on(table.name),
  typeIdx: index("ethical_principle_type_idx").on(table.type),
  enabledIdx: index("ethical_principle_enabled_idx").on(table.enabled),
}));

// Phase 13.0: Ethical Violation Log - Detected Ethical Conflicts
export const ethicalViolationLog = pgTable("ethical_violation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actor: varchar("actor", { length: 100 }).notNull(),
  action: varchar("action", { length: 200 }).notNull(),
  principleViolated: varchar("principle_violated", { length: 100 }).notNull(),
  verdict: ethicalVerdictEnum("verdict").notNull(),
  severity: violationSeverityEnum("severity").notNull(),
  reason: text("reason"), // Explanation of why this violated the principle
  metadata: jsonb("metadata"), // Context about the action (e.g., trade params, risk level)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  actorIdx: index("ethical_violation_log_actor_idx").on(table.actor),
  verdictIdx: index("ethical_violation_log_verdict_idx").on(table.verdict),
  severityIdx: index("ethical_violation_log_severity_idx").on(table.severity),
  createdAtIdx: index("ethical_violation_log_created_at_idx").on(table.createdAt),
}));

// Phase 14.0: Federated Ethics State - Shared Snapshots by Domain
export const federatedEthicsState = pgTable("federated_ethics_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: federatedScopeEnum("domain").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(), // SHA-256 of principles + policies state
  principlesActive: jsonb("principles_active").notNull(), // Array of active principle names
  policiesActive: jsonb("policies_active").notNull(), // Array of active policy names
  metadata: jsonb("metadata"), // Additional context (agent versions, etc.)
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  domainModeIdx: index("federated_ethics_state_domain_mode_idx").on(table.domain, table.mode),
  updatedAtIdx: index("federated_ethics_state_updated_at_idx").on(table.updatedAt),
}));

// Phase 14.0: Cross-Agent Ethics Session - Multi-Agent Consensus Logs
export const crossAgentEthicsSession = pgTable("cross_agent_ethics_session", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id", { length: 100 }).notNull(), // Unique session identifier
  actor: varchar("actor", { length: 100 }).notNull(),
  action: varchar("action", { length: 200 }).notNull(),
  domains: text("domains").array().notNull(), // Participating domains (trading, devops, etc.)
  mode: tradingModeEnum("mode").notNull(),
  agentInputs: jsonb("agent_inputs").notNull(), // Each agent's recommendation
  verdict: ethicalVerdictEnum("verdict").notNull(),
  confidence: doublePrecision("confidence").notNull(), // 0.0 to 1.0
  rationale: text("rationale").notNull(),
  hasConflict: boolean("has_conflict").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("cross_agent_ethics_session_session_id_idx").on(table.sessionId),
  verdictIdx: index("cross_agent_ethics_session_verdict_idx").on(table.verdict),
  createdAtIdx: index("cross_agent_ethics_session_created_at_idx").on(table.createdAt),
}));

// Phase 14.0: Ethics Conflict Register - Agent Disagreement Records
export const ethicsConflictRegister = pgTable("ethics_conflict_register", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  conflictingSources: text("conflicting_sources").array().notNull(), // Agent names in disagreement
  conflictingVerdicts: jsonb("conflicting_verdicts").notNull(), // Map of agent → verdict
  resolutionStatus: conflictResolutionEnum("resolution_status").notNull().default("open"),
  resolutionMethod: varchar("resolution_method", { length: 100 }), // e.g., "majority_vote", "priority_principle"
  resolutionRationale: text("resolution_rationale"),
  finalVerdict: ethicalVerdictEnum("final_verdict"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => ({
  sessionIdIdx: index("ethics_conflict_register_session_id_idx").on(table.sessionId),
  statusIdx: index("ethics_conflict_register_status_idx").on(table.resolutionStatus),
  createdAtIdx: index("ethics_conflict_register_created_at_idx").on(table.createdAt),
}));

// Phase 14.0: Ethics Propagation Journal - Agent Cache Sync Tracking
export const ethicsPropagationJournal = pgTable("ethics_propagation_journal", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propagationId: varchar("propagation_id", { length: 100 }).notNull(),
  targetDomain: federatedScopeEnum("target_domain").notNull(),
  mode: tradingModeEnum("mode").notNull(),
  deltaType: varchar("delta_type", { length: 50 }).notNull(), // "principle_update", "policy_update", "violation_sync"
  deltaPayload: jsonb("delta_payload").notNull(),
  status: propagationStatusEnum("status").notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  propagationIdIdx: index("ethics_propagation_journal_propagation_id_idx").on(table.propagationId),
  statusIdx: index("ethics_propagation_journal_status_idx").on(table.status),
  targetDomainIdx: index("ethics_propagation_journal_target_domain_idx").on(table.targetDomain),
  createdAtIdx: index("ethics_propagation_journal_created_at_idx").on(table.createdAt),
}));

// Phase 15.0: Cognitive Introspection & Bias Mitigation
export const biasObservationLog = pgTable("bias_observation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  biasType: biasTypeEnum("bias_type").notNull(),
  detectedContext: text("detected_context").notNull(), // Description of when/where bias was detected
  confidenceScore: doublePrecision("confidence_score").notNull(), // 0.0 to 1.0
  decisionId: varchar("decision_id", { length: 100 }), // Link to autonomy or reasoning decision
  impactAssessment: text("impact_assessment"), // How the bias may have affected the decision
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  biasTypeIdx: index("bias_observation_log_bias_type_idx").on(table.biasType),
  createdAtIdx: index("bias_observation_log_created_at_idx").on(table.createdAt),
  userIdIdx: index("bias_observation_log_user_id_idx").on(table.userId),
}));

export const confidenceDriftLog = pgTable("confidence_drift_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  sessionWindow: varchar("session_window", { length: 100 }).notNull(), // e.g., "last_4h", "last_24h"
  averageConfidence: doublePrecision("average_confidence").notNull(),
  varianceScore: doublePrecision("variance_score").notNull(), // Measure of confidence stability
  driftDirection: varchar("drift_direction", { length: 50 }), // "increasing", "decreasing", "stable"
  decisionsAnalyzed: integer("decisions_analyzed").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("confidence_drift_log_created_at_idx").on(table.createdAt),
  userIdIdx: index("confidence_drift_log_user_id_idx").on(table.userId),
}));

export const introspectionReport = pgTable("introspection_report", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  reportDate: date("report_date").notNull(), // Daily aggregation
  biasIndex: integer("bias_index").notNull(), // 0-100 composite score
  confidenceStability: doublePrecision("confidence_stability").notNull(), // 0.0-1.0
  totalBiasEvents: integer("total_bias_events").notNull(),
  topBiasTypes: jsonb("top_bias_types").notNull(), // Array of {type, count}
  mitigationsApplied: integer("mitigations_applied").notNull(),
  summary: text("summary"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  reportDateIdx: index("introspection_report_report_date_idx").on(table.reportDate),
  userIdIdx: index("introspection_report_user_id_idx").on(table.userId),
  createdAtIdx: index("introspection_report_created_at_idx").on(table.createdAt),
}));

export const biasCorrectionLog = pgTable("bias_correction_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  biasType: biasTypeEnum("bias_type").notNull(),
  correctionStrategy: varchar("correction_strategy", { length: 100 }).notNull(),
  parameterAdjustments: jsonb("parameter_adjustments").notNull(), // What weights/params were changed
  effectivenessScore: doublePrecision("effectiveness_score"), // Post-correction assessment
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  biasTypeIdx: index("bias_correction_log_bias_type_idx").on(table.biasType),
  createdAtIdx: index("bias_correction_log_created_at_idx").on(table.createdAt),
  userIdIdx: index("bias_correction_log_user_id_idx").on(table.userId),
}));

// Phase 16.0: Controlled Web Intelligence & Knowledge Retrieval
export const knowledgeRetrievalLog = pgTable("knowledge_retrieval_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  query: text("query").notNull(),
  source: knowledgeSourceEnum("source").notNull(),
  url: text("url"),
  trustLevel: retrievalTrustLevelEnum("trust_level").notNull(),
  relevanceScore: doublePrecision("relevance_score"), // 0.0 to 1.0
  retrievedData: text("retrieved_data"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("knowledge_retrieval_log_user_id_idx").on(table.userId),
  sourceIdx: index("knowledge_retrieval_log_source_idx").on(table.source),
  trustLevelIdx: index("knowledge_retrieval_log_trust_level_idx").on(table.trustLevel),
  createdAtIdx: index("knowledge_retrieval_log_created_at_idx").on(table.createdAt),
}));

export const knowledgeCache = pgTable("knowledge_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  queryHash: varchar("query_hash", { length: 64 }).notNull().unique(),
  query: text("query").notNull(),
  source: knowledgeSourceEnum("source").notNull(),
  cachedData: text("cached_data").notNull(),
  trustLevel: retrievalTrustLevelEnum("trust_level").notNull(),
  relevanceScore: doublePrecision("relevance_score"),
  hitCount: integer("hit_count").default(0).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  queryHashIdx: index("knowledge_cache_query_hash_idx").on(table.queryHash),
  sourceIdx: index("knowledge_cache_source_idx").on(table.source),
  expiresAtIdx: index("knowledge_cache_expires_at_idx").on(table.expiresAt),
}));

export const knowledgeTrustRecord = pgTable("knowledge_trust_record", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  trustLevel: retrievalTrustLevelEnum("trust_level").notNull(),
  verificationMethod: varchar("verification_method", { length: 100 }),
  successfulRetrievals: integer("successful_retrievals").default(0).notNull(),
  failedRetrievals: integer("failed_retrievals").default(0).notNull(),
  averageRelevance: doublePrecision("average_relevance"),
  lastAuditDate: timestamp("last_audit_date", { withTimezone: true }),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  domainIdx: index("knowledge_trust_record_domain_idx").on(table.domain),
  trustLevelIdx: index("knowledge_trust_record_trust_level_idx").on(table.trustLevel),
  lastAuditDateIdx: index("knowledge_trust_record_last_audit_date_idx").on(table.lastAuditDate),
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
export const insertCognitiveTuningLogSchema = createInsertSchema(cognitiveTuningLog).omit({ id: true, createdAt: true });
export const insertAutonomyAuditLogSchema = createInsertSchema(autonomyAuditLog).omit({ id: true, timestamp: true });
export const insertMetaReasoningLogSchema = createInsertSchema(metaReasoningLog).omit({ id: true, timestamp: true, createdAt: true });
export const insertAwarenessStateLogSchema = createInsertSchema(awarenessStateLog).omit({ id: true, timestamp: true });
export const insertExperienceMemoryLogSchema = createInsertSchema(experienceMemoryLog).omit({ id: true, timestamp: true });
export const insertAlignmentPolicySchema = createInsertSchema(alignmentPolicies).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGoalAlignmentProfileSchema = createInsertSchema(goalAlignmentProfile).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStrategicPlanLogSchema = createInsertSchema(strategicPlanLog).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLearningWeightProfileSchema = createInsertSchema(learningWeightProfile).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStrategicSimulationLogSchema = createInsertSchema(strategicSimulationLog).omit({ id: true, createdAt: true });
export const insertDecisionTraceLogSchema = createInsertSchema(decisionTraceLog).omit({ id: true, createdAt: true });
export const insertStrategicMemorySnapshotSchema = createInsertSchema(strategicMemorySnapshot).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCollaborationSessionSchema = createInsertSchema(collaborationSessions).omit({ id: true, createdAt: true });
export const insertCollaborationMessageSchema = createInsertSchema(collaborationMessages).omit({ id: true, createdAt: true });
export const insertConsensusSnapshotSchema = createInsertSchema(consensusSnapshots).omit({ id: true, createdAt: true });
export const insertAgentLearningFeedbackSchema = createInsertSchema(agentLearningFeedback).omit({ id: true, createdAt: true });
export const insertMetaCognitionLogSchema = createInsertSchema(metaCognitionLog).omit({ id: true, createdAt: true });
export const insertStrategicMemoryArchiveSchema = createInsertSchema(strategicMemoryArchive).omit({ id: true, createdAt: true });
export const insertModelCalibrationLogSchema = createInsertSchema(modelCalibrationLog).omit({ id: true, createdAt: true });
export const insertCognitiveCoreStateSchema = createInsertSchema(cognitiveCoreState).omit({ id: true, createdAt: true });
export const insertAgentRegistrySchema = createInsertSchema(agentRegistry).omit({ id: true, createdAt: true });
export const insertSafetyPolicySchema = createInsertSchema(safetyPolicy).omit({ id: true, createdAt: true });
export const insertSafetyEventLogSchema = createInsertSchema(safetyEventLog).omit({ id: true, createdAt: true });
export const insertKillSwitchSchema = createInsertSchema(killSwitch).omit({ updatedAt: true });
export const insertEthicalPrincipleSchema = createInsertSchema(ethicalPrinciple).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEthicalViolationLogSchema = createInsertSchema(ethicalViolationLog).omit({ id: true, createdAt: true });
export const insertFederatedEthicsStateSchema = createInsertSchema(federatedEthicsState).omit({ id: true, updatedAt: true });
export const insertCrossAgentEthicsSessionSchema = createInsertSchema(crossAgentEthicsSession).omit({ id: true, createdAt: true });
export const insertEthicsConflictRegisterSchema = createInsertSchema(ethicsConflictRegister).omit({ id: true, createdAt: true });
export const insertEthicsPropagationJournalSchema = createInsertSchema(ethicsPropagationJournal).omit({ id: true, createdAt: true });
export const insertBiasObservationLogSchema = createInsertSchema(biasObservationLog).omit({ id: true, createdAt: true });
export const insertConfidenceDriftLogSchema = createInsertSchema(confidenceDriftLog).omit({ id: true, createdAt: true });
export const insertIntrospectionReportSchema = createInsertSchema(introspectionReport).omit({ id: true, createdAt: true });
export const insertBiasCorrectionLogSchema = createInsertSchema(biasCorrectionLog).omit({ id: true, createdAt: true });
export const insertKnowledgeRetrievalLogSchema = createInsertSchema(knowledgeRetrievalLog).omit({ id: true, createdAt: true });
export const insertKnowledgeCacheSchema = createInsertSchema(knowledgeCache).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKnowledgeTrustRecordSchema = createInsertSchema(knowledgeTrustRecord).omit({ id: true, createdAt: true, updatedAt: true });

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

export type InsertCognitiveTuningLog = z.infer<typeof insertCognitiveTuningLogSchema>;
export type CognitiveTuningLog = typeof cognitiveTuningLog.$inferSelect;

export type InsertAutonomyAuditLog = z.infer<typeof insertAutonomyAuditLogSchema>;
export type AutonomyAuditLog = typeof autonomyAuditLog.$inferSelect;

export type InsertMetaReasoningLog = z.infer<typeof insertMetaReasoningLogSchema>;
export type MetaReasoningLog = typeof metaReasoningLog.$inferSelect;

export type InsertAwarenessStateLog = z.infer<typeof insertAwarenessStateLogSchema>;
export type AwarenessStateLog = typeof awarenessStateLog.$inferSelect;

export type InsertExperienceMemoryLog = z.infer<typeof insertExperienceMemoryLogSchema>;
export type ExperienceMemoryLog = typeof experienceMemoryLog.$inferSelect;

export type InsertAlignmentPolicy = z.infer<typeof insertAlignmentPolicySchema>;
export type AlignmentPolicy = typeof alignmentPolicies.$inferSelect;


export type InsertGoalAlignmentProfile = z.infer<typeof insertGoalAlignmentProfileSchema>;
export type GoalAlignmentProfile = typeof goalAlignmentProfile.$inferSelect;

export type InsertStrategicPlanLog = z.infer<typeof insertStrategicPlanLogSchema>;
export type StrategicPlanLog = typeof strategicPlanLog.$inferSelect;

export type InsertLearningWeightProfile = z.infer<typeof insertLearningWeightProfileSchema>;
export type LearningWeightProfile = typeof learningWeightProfile.$inferSelect;

export type InsertStrategicSimulationLog = z.infer<typeof insertStrategicSimulationLogSchema>;
export type StrategicSimulationLog = typeof strategicSimulationLog.$inferSelect;

export type InsertDecisionTraceLog = z.infer<typeof insertDecisionTraceLogSchema>;
export type DecisionTraceLog = typeof decisionTraceLog.$inferSelect;

export type InsertStrategicMemorySnapshot = z.infer<typeof insertStrategicMemorySnapshotSchema>;
export type StrategicMemorySnapshot = typeof strategicMemorySnapshot.$inferSelect;

export type InsertCollaborationSession = z.infer<typeof insertCollaborationSessionSchema>;
export type CollaborationSession = typeof collaborationSessions.$inferSelect;

export type InsertCollaborationMessage = z.infer<typeof insertCollaborationMessageSchema>;
export type CollaborationMessage = typeof collaborationMessages.$inferSelect;

export type InsertConsensusSnapshot = z.infer<typeof insertConsensusSnapshotSchema>;
export type ConsensusSnapshot = typeof consensusSnapshots.$inferSelect;

export type InsertAgentLearningFeedback = z.infer<typeof insertAgentLearningFeedbackSchema>;
export type AgentLearningFeedback = typeof agentLearningFeedback.$inferSelect;
export type FeedbackSource = typeof feedbackSourceEnum.enumValues[number];

export type InsertMetaCognitionLog = z.infer<typeof insertMetaCognitionLogSchema>;
export type MetaCognitionLog = typeof metaCognitionLog.$inferSelect;
export type OversightFlagType = typeof oversightFlagTypeEnum.enumValues[number];

export type InsertStrategicMemoryArchive = z.infer<typeof insertStrategicMemoryArchiveSchema>;
export type StrategicMemoryArchive = typeof strategicMemoryArchive.$inferSelect;
export type MemoryScope = typeof memoryScopeEnum.enumValues[number];

export type InsertModelCalibrationLog = z.infer<typeof insertModelCalibrationLogSchema>;
export type ModelCalibrationLog = typeof modelCalibrationLog.$inferSelect;

export type InsertCognitiveCoreState = z.infer<typeof insertCognitiveCoreStateSchema>;
export type CognitiveCoreState = typeof cognitiveCoreState.$inferSelect;
export type OptimizationType = typeof optimizationTypeEnum.enumValues[number];

export type InsertAgentRegistry = z.infer<typeof insertAgentRegistrySchema>;
export type AgentRegistry = typeof agentRegistry.$inferSelect;
export type AgentState = typeof agentStateEnum.enumValues[number];

export type InsertSafetyPolicy = z.infer<typeof insertSafetyPolicySchema>;
export type SafetyPolicy = typeof safetyPolicy.$inferSelect;
export type SafetySeverity = typeof safetySeverityEnum.enumValues[number];
export type SafetyScope = typeof safetyScopeEnum.enumValues[number];

export type InsertSafetyEventLog = z.infer<typeof insertSafetyEventLogSchema>;
export type SafetyEventLog = typeof safetyEventLog.$inferSelect;

export type InsertKillSwitch = z.infer<typeof insertKillSwitchSchema>;
export type KillSwitch = typeof killSwitch.$inferSelect;

export type InsertEthicalPrinciple = z.infer<typeof insertEthicalPrincipleSchema>;
export type EthicalPrinciple = typeof ethicalPrinciple.$inferSelect;
export type PrincipleType = typeof principleTypeEnum.enumValues[number];
export type ViolationSeverity = typeof violationSeverityEnum.enumValues[number];
export type EthicalVerdict = typeof ethicalVerdictEnum.enumValues[number];

export type InsertEthicalViolationLog = z.infer<typeof insertEthicalViolationLogSchema>;
export type EthicalViolationLog = typeof ethicalViolationLog.$inferSelect;

export type InsertFederatedEthicsState = z.infer<typeof insertFederatedEthicsStateSchema>;
export type FederatedEthicsState = typeof federatedEthicsState.$inferSelect;
export type FederatedScope = typeof federatedScopeEnum.enumValues[number];

export type InsertCrossAgentEthicsSession = z.infer<typeof insertCrossAgentEthicsSessionSchema>;
export type CrossAgentEthicsSession = typeof crossAgentEthicsSession.$inferSelect;

export type InsertEthicsConflictRegister = z.infer<typeof insertEthicsConflictRegisterSchema>;
export type EthicsConflictRegister = typeof ethicsConflictRegister.$inferSelect;
export type ConflictResolution = typeof conflictResolutionEnum.enumValues[number];

export type InsertEthicsPropagationJournal = z.infer<typeof insertEthicsPropagationJournalSchema>;
export type EthicsPropagationJournal = typeof ethicsPropagationJournal.$inferSelect;
export type PropagationStatus = typeof propagationStatusEnum.enumValues[number];

export type InsertKnowledgeRetrievalLog = z.infer<typeof insertKnowledgeRetrievalLogSchema>;
export type KnowledgeRetrievalLog = typeof knowledgeRetrievalLog.$inferSelect;
export type KnowledgeSource = typeof knowledgeSourceEnum.enumValues[number];
export type RetrievalTrustLevel = typeof retrievalTrustLevelEnum.enumValues[number];

export type InsertKnowledgeCache = z.infer<typeof insertKnowledgeCacheSchema>;
export type KnowledgeCache = typeof knowledgeCache.$inferSelect;

export type InsertKnowledgeTrustRecord = z.infer<typeof insertKnowledgeTrustRecordSchema>;
export type KnowledgeTrustRecord = typeof knowledgeTrustRecord.$inferSelect;

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

export type InsertLearningFragment = z.infer<typeof insertLearningFragmentSchema>;
export type LearningFragment = typeof learningFragments.$inferSelect;

export type InsertPortfolioState = z.infer<typeof insertPortfolioStateSchema>;
export type PortfolioState = typeof portfolioState.$inferSelect;

export type InsertPatchProposal = z.infer<typeof insertPatchProposalSchema>;
export type PatchProposal = typeof patchProposals.$inferSelect;

export type InsertBiasObservationLog = z.infer<typeof insertBiasObservationLogSchema>;
export type BiasObservationLog = typeof biasObservationLog.$inferSelect;
export type BiasType = typeof biasTypeEnum.enumValues[number];

export type InsertConfidenceDriftLog = z.infer<typeof insertConfidenceDriftLogSchema>;
export type ConfidenceDriftLog = typeof confidenceDriftLog.$inferSelect;

export type InsertIntrospectionReport = z.infer<typeof insertIntrospectionReportSchema>;
export type IntrospectionReport = typeof introspectionReport.$inferSelect;

export type InsertBiasCorrectionLog = z.infer<typeof insertBiasCorrectionLogSchema>;
export type BiasCorrectionLog = typeof biasCorrectionLog.$inferSelect;

// Phase 17.0 enums - Distributed Autonomy & Scaling
export const nodeRoleEnum = pgEnum("node_role", ["coordinator", "trading", "research", "analysis", "compliance", "general"]);
export const nodeStatusEnum = pgEnum("node_status", ["healthy", "degraded", "draining", "offline"]);
export const clusterTaskStatusEnum = pgEnum("cluster_task_status", ["queued", "assigned", "running", "completed", "failed", "cancelled"]);
export const clusterTaskTypeEnum = pgEnum("cluster_task_type", ["trading_signal", "market_analysis", "risk_assessment", "compliance_check", "research", "optimization", "general"]);
export const outcomeStatusEnum = pgEnum("outcome_status", ["success", "partial", "failed", "timeout"]);
export const busEventTopicEnum = pgEnum("bus_event_topic", ["task_assigned", "task_completed", "node_status_change", "rebalance_triggered", "circuit_breaker", "health_alert", "learning_delta", "model_sync"]);

// Phase 17.5 & 17.6 enums - Reliability & Security
export const circuitBreakerStateEnum = pgEnum("circuit_breaker_state", ["closed", "open", "half_open"]);
export const gateTypeEnum = pgEnum("gate_type", ["safety", "federated_ethics", "ethical_reasoning", "knowledge_acquisition"]);

// Phase 18 enums - Multi-Domain Learning
export const learningDeltaTypeEnum = pgEnum("learning_delta_type", ["model_update", "discovery", "insight", "strategy_adjustment", "risk_parameter"]);
export const alignmentStrategyEnum = pgEnum("alignment_strategy", ["accept", "reject", "blend"]);
export const domainChannelEnum = pgEnum("domain_channel", ["research_to_trading", "compliance_to_trading", "analytics_to_research", "trading_to_analytics"]);

// Phase 17.0: Distributed Autonomy & Scaling

export const clusterNode = pgTable("cluster_node", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  role: nodeRoleEnum("role").notNull(),
  status: nodeStatusEnum("status").default("healthy").notNull(),
  version: varchar("version", { length: 50 }),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }).defaultNow().notNull(),
  capacity: integer("capacity").default(100).notNull(), // Max concurrent tasks
  currentLoad: integer("current_load").default(0).notNull(), // Current active tasks
  cpuUsage: doublePrecision("cpu_usage"),
  memoryUsage: doublePrecision("memory_usage"),
  queueDepth: integer("queue_depth").default(0).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  roleIdx: index("cluster_node_role_idx").on(table.role),
  statusIdx: index("cluster_node_status_idx").on(table.status),
  lastHeartbeatIdx: index("cluster_node_last_heartbeat_idx").on(table.lastHeartbeat),
}));

export const clusterTaskQueue = pgTable("cluster_task_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskType: clusterTaskTypeEnum("task_type").notNull(),
  payload: jsonb("payload").notNull(),
  priority: integer("priority").default(5).notNull(), // 1-10, lower = higher priority
  status: clusterTaskStatusEnum("status").default("queued").notNull(),
  assignedNodeId: varchar("assigned_node_id").references(() => clusterNode.id),
  userId: varchar("user_id").references(() => users.id), // For user-scoped tasks
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => ({
  statusIdx: index("cluster_task_queue_status_idx").on(table.status),
  taskTypeIdx: index("cluster_task_queue_task_type_idx").on(table.taskType),
  createdAtIdx: index("cluster_task_queue_created_at_idx").on(table.createdAt),
  assignedNodeIdIdx: index("cluster_task_queue_assigned_node_id_idx").on(table.assignedNodeId),
  priorityIdx: index("cluster_task_queue_priority_idx").on(table.priority),
  userIdIdx: index("cluster_task_queue_user_id_idx").on(table.userId),
}));

export const clusterResultLog = pgTable("cluster_result_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => clusterTaskQueue.id).notNull(),
  nodeId: varchar("node_id").references(() => clusterNode.id).notNull(),
  userId: varchar("user_id").references(() => users.id), // For user-scoped results
  outcomeStatus: outcomeStatusEnum("outcome_status").notNull(),
  resultSummary: text("result_summary"),
  metrics: jsonb("metrics"), // Execution time, resource usage, etc.
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  taskIdIdx: index("cluster_result_log_task_id_idx").on(table.taskId),
  nodeIdIdx: index("cluster_result_log_node_id_idx").on(table.nodeId),
  outcomeStatusIdx: index("cluster_result_log_outcome_status_idx").on(table.outcomeStatus),
  createdAtIdx: index("cluster_result_log_created_at_idx").on(table.createdAt),
  userIdIdx: index("cluster_result_log_user_id_idx").on(table.userId),
}));

export const clusterBusEvent = pgTable("cluster_bus_event", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topic: busEventTopicEnum("topic").notNull(),
  sourceNode: varchar("source_node", { length: 100 }),
  payload: jsonb("payload").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  topicIdx: index("cluster_bus_event_topic_idx").on(table.topic),
  createdAtIdx: index("cluster_bus_event_created_at_idx").on(table.createdAt),
  sourceNodeIdx: index("cluster_bus_event_source_node_idx").on(table.sourceNode),
}));

// Phase 17.5: Circuit Breaker for fault tolerance
export const clusterCircuitBreaker = pgTable("cluster_circuit_breaker", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId: varchar("node_id").references(() => clusterNode.id).notNull(),
  state: circuitBreakerStateEnum("state").default("closed").notNull(),
  failureCount: integer("failure_count").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  stateChangedAt: timestamp("state_changed_at", { withTimezone: true }).defaultNow().notNull(),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }), // For exponential backoff
  metadata: jsonb("metadata"), // Failure details, error messages
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nodeIdIdx: index("cluster_circuit_breaker_node_id_idx").on(table.nodeId),
  stateIdx: index("cluster_circuit_breaker_state_idx").on(table.state),
}));

// Phase 17.6: Audit log for ethical gate execution tracking
export const clusterAuditLog = pgTable("cluster_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => clusterTaskQueue.id).notNull(),
  nodeId: varchar("node_id").references(() => clusterNode.id).notNull(),
  userId: varchar("user_id").references(() => users.id), // For user-scoped audits
  gateType: gateTypeEnum("gate_type").notNull(),
  gatePassed: boolean("gate_passed").notNull(),
  gateResult: text("gate_result"), // Details about what happened
  executionTimeMs: integer("execution_time_ms"), // How long the gate took
  metadata: jsonb("metadata"), // Additional context (risk scores, ethical verdicts, etc.)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  taskIdIdx: index("cluster_audit_log_task_id_idx").on(table.taskId),
  nodeIdIdx: index("cluster_audit_log_node_id_idx").on(table.nodeId),
  gateTypeIdx: index("cluster_audit_log_gate_type_idx").on(table.gateType),
  userIdIdx: index("cluster_audit_log_user_id_idx").on(table.userId),
  createdAtIdx: index("cluster_audit_log_created_at_idx").on(table.createdAt),
}));

// Phase 18: Multi-Domain Orchestration & Cross-Node Learning

export const agentLearningDelta = pgTable("agent_learning_delta", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originNodeId: varchar("origin_node_id").notNull(),
  deltaType: learningDeltaTypeEnum("delta_type").notNull(),
  payload: jsonb("payload").notNull(),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  traceId: varchar("trace_id").notNull(),
  trustScore: doublePrecision("trust_score").notNull().default(0.5),
  recencyScore: doublePrecision("recency_score").notNull().default(1.0),
  successRate: doublePrecision("success_rate").notNull().default(0.0),
  overallScore: doublePrecision("overall_score").notNull().default(0.0),
  isAccepted: boolean("is_accepted").default(false).notNull(),
  acceptedBy: varchar("accepted_by"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  originNodeIdIdx: index("agent_learning_delta_origin_node_id_idx").on(table.originNodeId),
  deltaTypeIdx: index("agent_learning_delta_delta_type_idx").on(table.deltaType),
  traceIdIdx: index("agent_learning_delta_trace_id_idx").on(table.traceId),
  isAcceptedIdx: index("agent_learning_delta_is_accepted_idx").on(table.isAccepted),
  createdAtIdx: index("agent_learning_delta_created_at_idx").on(table.createdAt),
}));

export const modelConsistencySnapshot = pgTable("model_consistency_snapshot", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId: varchar("node_id").references(() => clusterNode.id).notNull(),
  modelHash: varchar("model_hash", { length: 64 }).notNull(),
  domainChannel: domainChannelEnum("domain_channel").notNull(),
  version: varchar("version").notNull(),
  parameterCount: integer("parameter_count").notNull().default(0),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  nodeIdIdx: index("model_consistency_snapshot_node_id_idx").on(table.nodeId),
  domainChannelIdx: index("model_consistency_snapshot_domain_channel_idx").on(table.domainChannel),
  modelHashIdx: index("model_consistency_snapshot_model_hash_idx").on(table.modelHash),
  createdAtIdx: index("model_consistency_snapshot_created_at_idx").on(table.createdAt),
}));

export const crossNodeAlignmentLog = pgTable("cross_node_alignment_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceNodeId: varchar("source_node_id").references(() => clusterNode.id).notNull(),
  targetNodeId: varchar("target_node_id").references(() => clusterNode.id).notNull(),
  preAlignmentHash: varchar("pre_alignment_hash", { length: 64 }).notNull(),
  postAlignmentHash: varchar("post_alignment_hash", { length: 64 }),
  alignmentStrategy: alignmentStrategyEnum("alignment_strategy").notNull(),
  alignmentScore: doublePrecision("alignment_score").notNull().default(0.0),
  driftDetected: boolean("drift_detected").notNull().default(false),
  reconciliationSuccess: boolean("reconciliation_success").default(false).notNull(),
  traceId: varchar("trace_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sourceNodeIdIdx: index("cross_node_alignment_log_source_node_id_idx").on(table.sourceNodeId),
  targetNodeIdIdx: index("cross_node_alignment_log_target_node_id_idx").on(table.targetNodeId),
  traceIdIdx: index("cross_node_alignment_log_trace_id_idx").on(table.traceId),
  driftDetectedIdx: index("cross_node_alignment_log_drift_detected_idx").on(table.driftDetected),
  createdAtIdx: index("cross_node_alignment_log_created_at_idx").on(table.createdAt),
}));

// Phase 26.1: Auto-Tuning Engine Tables
export const tuningPolicy = pgTable("tuning_policy", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  aggressiveness: tuningAggressivenessEnum("aggressiveness").default("balanced").notNull(),
  policyVersion: integer("policy_version").default(1).notNull(),
  maxStepPercent: decimal("max_step_percent", { precision: 5, scale: 2 }).default("10.00").notNull(),
  cooldownMinutes: integer("cooldown_minutes").default(60).notNull(),
  maxDailyAdjustments: integer("max_daily_adjustments").default(10).notNull(),
  fieldBounds: jsonb("field_bounds").notNull(), // { riskPerTrade: { min: 0.5, max: 3 }, etc }
  currentCounters: jsonb("current_counters").default(sql`'{"adjustmentsToday":0,"reverts":0}'`).notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdModeIdx: index("tuning_policy_user_id_mode_idx").on(table.userId, table.mode),
  enabledIdx: index("tuning_policy_enabled_idx").on(table.enabled),
}));

export const tuningEvent = pgTable("tuning_event", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  field: varchar("field", { length: 100 }).notNull(),
  oldValue: decimal("old_value", { precision: 12, scale: 4 }).notNull(),
  newValue: decimal("new_value", { precision: 12, scale: 4 }).notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  approvalType: tuningApprovalTypeEnum("approval_type").notNull(),
  status: tuningStatusEnum("status").notNull(),
  reverted: boolean("reverted").default(false).notNull(),
  executionLogId: varchar("execution_log_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdModeIdx: index("tuning_event_user_id_mode_idx").on(table.userId, table.mode),
  fieldIdx: index("tuning_event_field_idx").on(table.field),
  statusIdx: index("tuning_event_status_idx").on(table.status),
  createdAtIdx: index("tuning_event_created_at_idx").on(table.createdAt),
  revertedIdx: index("tuning_event_reverted_idx").on(table.reverted),
}));

export const parameterBaseline = pgTable("parameter_baseline", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  mode: tradingModeEnum("mode").notNull(),
  snapshotData: jsonb("snapshot_data").notNull(), // { riskPerTrade: 1.5, maxDrawdown: 10, ... }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdModeIdx: index("parameter_baseline_user_id_mode_idx").on(table.userId, table.mode),
  createdAtIdx: index("parameter_baseline_created_at_idx").on(table.createdAt),
}));

// Phase 27.4: Trading State Synchronization & Fail-Safe Recovery
// Phase 27.F.13.O: Global Engine Unification - system_context is now global-per-mode
// IMPORTANT: userId preserved for audit trail only, NOT used for business logic
// Primary isolation: tradingMode ('live' | 'paper')
// Exactly 2 rows total: 1 for paper mode, 1 for live mode
// Phase 2C: Single-tenant - userId removed
export const systemContext = pgTable("system_context", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradingMode: tradingModeEnum("trading_mode").notNull().default("paper"),
  lastSafeState: jsonb("last_safe_state").notNull().default(sql`'{}'`),
  isEngineActive: boolean("is_engine_active").notNull().default(false),
  lastModeChange: timestamp("last_mode_change", { withTimezone: true }),
  changedBy: varchar("changed_by", { length: 50 }), // 'user', 'recovery', 'admin'
  changeReason: text("change_reason"),
  // Phase 27.F.13.O: New audit columns for global engine
  lastStartedBy: varchar("last_started_by"), // UUID of user who started engine
  lastStoppedBy: varchar("last_stopped_by"), // UUID of user who stopped engine
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }), // Engine health monitoring
  // Phase 27.F.14: Local Heuristic Trader Service (LHTS) state
  lhtsEnabled: boolean("lhts_enabled").default(false), // Whether LHTS is running
  lhtsLastRun: timestamp("lhts_last_run", { withTimezone: true }), // Last evaluation cycle
  lhtsAdjustmentsCount: integer("lhts_adjustments_count").default(0), // Total adjustments made
  tradingPace: varchar("trading_pace", { length: 20 }).default("baseline"), // 'conservative' | 'baseline' | 'optimistic' | 'aggressive'
  // Phase 27.F.14.D-POST: Portfolio balance confirmation
  balanceLastConfirmed: timestamp("balance_last_confirmed", { withTimezone: true }), // Last time user confirmed starting balance
  // Phase 27.F.14.I: Baseline transition logic for simulation phases
  baselineMode: varchar("baseline_mode", { length: 20 }).default("per_simulation"), // 'per_simulation' | 'cumulative' | 'persistent'
  // Fee configuration for profitability calculations
  makerFeePct: decimal("maker_fee_pct", { precision: 5, scale: 4 }).default("0.0016"), // Kraken maker fee (0.16%)
  takerFeePct: decimal("taker_fee_pct", { precision: 5, scale: 4 }).default("0.0026"), // Kraken taker fee (0.26%)
  defaultFeeMode: varchar("default_fee_mode", { length: 10 }).default("taker"), // 'maker' | 'taker'
  minNetProfitThreshold: decimal("min_net_profit_threshold", { precision: 5, scale: 4 }).default("0.0030"), // Min 0.30% after fees
  metadata: jsonb("metadata").default(sql`'{}'`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tradingModeIdx: index("system_context_trading_mode_idx").on(table.tradingMode),
  lastModeChangeIdx: index("system_context_last_mode_change_idx").on(table.lastModeChange),
  isEngineActiveIdx: index("system_context_is_engine_active_idx").on(table.isEngineActive),
}));


// Insert schemas for Phase 17
export const insertClusterNodeSchema = createInsertSchema(clusterNode).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertClusterTaskQueueSchema = createInsertSchema(clusterTaskQueue).omit({ 
  id: true, 
  createdAt: true 
});

export const insertClusterResultLogSchema = createInsertSchema(clusterResultLog).omit({ 
  id: true, 
  createdAt: true 
});

export const insertClusterBusEventSchema = createInsertSchema(clusterBusEvent).omit({ 
  id: true, 
  createdAt: true 
});

export const insertClusterCircuitBreakerSchema = createInsertSchema(clusterCircuitBreaker).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertClusterAuditLogSchema = createInsertSchema(clusterAuditLog).omit({ 
  id: true, 
  createdAt: true 
});

// Types for Phase 17
export type InsertClusterNode = z.infer<typeof insertClusterNodeSchema>;
export type ClusterNode = typeof clusterNode.$inferSelect;
export type NodeRole = typeof nodeRoleEnum.enumValues[number];
export type NodeStatus = typeof nodeStatusEnum.enumValues[number];

export type InsertClusterTaskQueue = z.infer<typeof insertClusterTaskQueueSchema>;
export type ClusterTaskQueue = typeof clusterTaskQueue.$inferSelect;
export type ClusterTaskStatus = typeof clusterTaskStatusEnum.enumValues[number];
export type ClusterTaskType = typeof clusterTaskTypeEnum.enumValues[number];

export type InsertClusterResultLog = z.infer<typeof insertClusterResultLogSchema>;
export type ClusterResultLog = typeof clusterResultLog.$inferSelect;
export type OutcomeStatus = typeof outcomeStatusEnum.enumValues[number];

export type InsertClusterCircuitBreaker = z.infer<typeof insertClusterCircuitBreakerSchema>;
export type ClusterCircuitBreaker = typeof clusterCircuitBreaker.$inferSelect;
export type CircuitBreakerState = typeof circuitBreakerStateEnum.enumValues[number];

export type InsertClusterAuditLog = z.infer<typeof insertClusterAuditLogSchema>;
export type ClusterAuditLog = typeof clusterAuditLog.$inferSelect;
export type GateType = typeof gateTypeEnum.enumValues[number];

export type InsertClusterBusEvent = z.infer<typeof insertClusterBusEventSchema>;
export type ClusterBusEvent = typeof clusterBusEvent.$inferSelect;
export type BusEventTopic = typeof busEventTopicEnum.enumValues[number];

// Insert schemas for Phase 18
export const insertAgentLearningDeltaSchema = createInsertSchema(agentLearningDelta).omit({ 
  id: true, 
  createdAt: true 
});

export const insertModelConsistencySnapshotSchema = createInsertSchema(modelConsistencySnapshot).omit({ 
  id: true, 
  createdAt: true 
});

export const insertCrossNodeAlignmentLogSchema = createInsertSchema(crossNodeAlignmentLog).omit({ 
  id: true, 
  createdAt: true 
});

// Types for Phase 18
export type InsertAgentLearningDelta = z.infer<typeof insertAgentLearningDeltaSchema>;
export type AgentLearningDelta = typeof agentLearningDelta.$inferSelect;
export type LearningDeltaType = typeof learningDeltaTypeEnum.enumValues[number];

export type InsertModelConsistencySnapshot = z.infer<typeof insertModelConsistencySnapshotSchema>;
export type ModelConsistencySnapshot = typeof modelConsistencySnapshot.$inferSelect;
export type DomainChannel = typeof domainChannelEnum.enumValues[number];

export type InsertCrossNodeAlignmentLog = z.infer<typeof insertCrossNodeAlignmentLogSchema>;
export type CrossNodeAlignmentLog = typeof crossNodeAlignmentLog.$inferSelect;
export type AlignmentStrategy = typeof alignmentStrategyEnum.enumValues[number];

// Insert schemas for Phase 26.1
export const insertTuningPolicySchema = createInsertSchema(tuningPolicy).omit({ 
  id: true, 
  createdAt: true,
  lastUpdated: true
});

export const insertTuningEventSchema = createInsertSchema(tuningEvent).omit({ 
  id: true, 
  createdAt: true 
});

export const insertParameterBaselineSchema = createInsertSchema(parameterBaseline).omit({ 
  id: true, 
  createdAt: true 
});

// Types for Phase 26.1
export type InsertTuningPolicy = z.infer<typeof insertTuningPolicySchema>;
export type TuningPolicy = typeof tuningPolicy.$inferSelect;
export type TuningApprovalType = typeof tuningApprovalTypeEnum.enumValues[number];
export type TuningStatus = typeof tuningStatusEnum.enumValues[number];
export type TuningAggressiveness = typeof tuningAggressivenessEnum.enumValues[number];

export type InsertTuningEvent = z.infer<typeof insertTuningEventSchema>;
export type TuningEvent = typeof tuningEvent.$inferSelect;

export type InsertParameterBaseline = z.infer<typeof insertParameterBaselineSchema>;
export type ParameterBaseline = typeof parameterBaseline.$inferSelect;

// Insert schemas for Phase 27.4
export const insertSystemContextSchema = createInsertSchema(systemContext).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});

// Types for Phase 27.4
export type InsertSystemContext = z.infer<typeof insertSystemContextSchema>;
export type SystemContext = typeof systemContext.$inferSelect;

// Phase 27.F.13.L.1: System Settings for Canonical Engine Operator
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({ 
  updatedAt: true 
});

export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSettings = typeof systemSettings.$inferSelect;

// Phase 28.C: Override Audit History Table
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  entityType: auditEntityTypeEnum("entity_type").notNull(),
  field: varchar("field", { length: 100 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: varchar("changed_by").references(() => users.id).notNull(),
  tradingMode: tradingModeEnum("trading_mode").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  entityTypeIdx: index("audit_log_entity_type_idx").on(table.entityType),
  tradingModeIdx: index("audit_log_trading_mode_idx").on(table.tradingMode),
  timestampIdx: index("audit_log_timestamp_idx").on(table.timestamp),
  changedByIdx: index("audit_log_changed_by_idx").on(table.changedBy),
}));

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  timestamp: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;
export type AuditEntityType = typeof auditEntityTypeEnum.enumValues[number];

// Phase 29: Behavioral Feedback Log
export const behavioralLog = pgTable("behavioral_log", {
  id: serial("id").primaryKey(),
  tradingMode: tradingModeEnum("trading_mode").notNull(),
  parameter: varchar("parameter", { length: 100 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  triggerType: behavioralTriggerTypeEnum("trigger_type").notNull(),
  confidence: doublePrecision("confidence").notNull().default(0.5), // 0.0-1.0 scale
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  modeIdx: index("behavioral_log_mode_idx").on(table.tradingMode),
  parameterIdx: index("behavioral_log_parameter_idx").on(table.parameter),
  triggerIdx: index("behavioral_log_trigger_idx").on(table.triggerType),
  timestampIdx: index("behavioral_log_timestamp_idx").on(table.timestamp),
}));

export const insertBehavioralLogSchema = createInsertSchema(behavioralLog).omit({
  id: true,
  timestamp: true,
});

export type InsertBehavioralLog = z.infer<typeof insertBehavioralLogSchema>;
export type BehavioralLog = typeof behavioralLog.$inferSelect;
export type BehavioralTriggerType = typeof behavioralTriggerTypeEnum.enumValues[number];

// Phase 29: Learning History (Versioned Snapshots)
export const learningHistory = pgTable("learning_history", {
  id: serial("id").primaryKey(),
  tradingMode: tradingModeEnum("trading_mode").notNull(),
  snapshotVersion: integer("snapshot_version").notNull(),
  guardrailsSnapshot: jsonb("guardrails_snapshot").notNull(), // Full guardrails_v2 state
  filtersSnapshot: jsonb("filters_snapshot").notNull(), // Full filters_v2 state
  learningMode: learningModeEnum("learning_mode").notNull(),
  changeCount: integer("change_count").notNull().default(0), // # of changes in this snapshot
  isStable: boolean("is_stable").notNull().default(true), // Marked stable after validation
  metadata: jsonb("metadata"), // Additional context (e.g., performance metrics at snapshot time)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  modeIdx: index("learning_history_mode_idx").on(table.tradingMode),
  versionIdx: index("learning_history_version_idx").on(table.snapshotVersion),
  stableIdx: index("learning_history_stable_idx").on(table.isStable),
  createdAtIdx: index("learning_history_created_at_idx").on(table.createdAt),
}));

export const insertLearningHistorySchema = createInsertSchema(learningHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertLearningHistory = z.infer<typeof insertLearningHistorySchema>;
export type LearningHistory = typeof learningHistory.$inferSelect;
export type LearningMode = typeof learningModeEnum.enumValues[number];

// Phase 30.FX.4: Lottie Oversight Log (Strategy Health Monitoring)
export const lottieOversightLog = pgTable("lottie_oversight_log", {
  id: serial("id").primaryKey(),
  event: varchar("event", { length: 100 }).notNull(),
  strategy: varchar("strategy", { length: 50 }),
  status: varchar("status", { length: 50 }).notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  eventIdx: index("lottie_oversight_log_event_idx").on(table.event),
  strategyIdx: index("lottie_oversight_log_strategy_idx").on(table.strategy),
  createdAtIdx: index("lottie_oversight_log_created_at_idx").on(table.createdAt),
}));

export const insertLottieOversightLogSchema = createInsertSchema(lottieOversightLog).omit({
  id: true,
  createdAt: true,
});

export type InsertLottieOversightLog = z.infer<typeof insertLottieOversightLogSchema>;
export type LottieOversightLog = typeof lottieOversightLog.$inferSelect;

// Phase 30.FX.6: Strategy Mix Log (Cross-Strategy Optimization)
export const strategyMixLog = pgTable("strategy_mix_log", {
  id: serial("id").primaryKey(),
  strategy: varchar("strategy", { length: 50 }).notNull(),
  oldWeight: doublePrecision("old_weight"),
  newWeight: doublePrecision("new_weight").notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  strategyIdx: index("strategy_mix_log_strategy_idx").on(table.strategy),
  createdAtIdx: index("strategy_mix_log_created_at_idx").on(table.createdAt),
}));

export const insertStrategyMixLogSchema = createInsertSchema(strategyMixLog).omit({
  id: true,
  createdAt: true,
});

export type InsertStrategyMixLog = z.infer<typeof insertStrategyMixLogSchema>;
export type StrategyMixLog = typeof strategyMixLog.$inferSelect;

// Phase 31.0: Strategic Drive & Profit Optimization Engine
export const strategyDriveMetrics = pgTable("strategy_drive_metrics", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  strategy: varchar("strategy", { length: 50 }).notNull(),
  mode: varchar("mode", { length: 10 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
  totalProfitUSD: doublePrecision("total_profit_usd").notNull().default(0),
  totalTrades: integer("total_trades").notNull().default(0),
  winRate: doublePrecision("win_rate").notNull().default(0),
  avgRMultiple: doublePrecision("avg_r_multiple").notNull().default(0),
  alphaStrength: doublePrecision("alpha_strength").notNull().default(0),
  riskExposure: doublePrecision("risk_exposure").notNull().default(0),
  driveScore: doublePrecision("drive_score").notNull().default(0),
}, (table) => ({
  strategyIdx: index("strategy_drive_metrics_strategy_idx").on(table.strategy),
  modeIdx: index("strategy_drive_metrics_mode_idx").on(table.mode),
  timestampIdx: index("strategy_drive_metrics_timestamp_idx").on(table.timestamp),
}));

export const insertStrategyDriveMetricsSchema = createInsertSchema(strategyDriveMetrics).omit({
  id: true,
  timestamp: true,
});

export type InsertStrategyDriveMetrics = z.infer<typeof insertStrategyDriveMetricsSchema>;
export type StrategyDriveMetrics = typeof strategyDriveMetrics.$inferSelect;

export const strategyDriveSummary = pgTable("strategy_drive_summary", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  globalSDI: doublePrecision("global_sdi").notNull(),
  bestStrategy: varchar("best_strategy", { length: 50 }).notNull(),
  weakestStrategy: varchar("weakest_strategy", { length: 50 }).notNull(),
  dhmaWeight: doublePrecision("dhma_weight").notNull().default(1),
  quantflowWeight: doublePrecision("quantflow_weight").notNull().default(1),
  trendpulseWeight: doublePrecision("trendpulse_weight").notNull().default(1),
  volsurfWeight: doublePrecision("volsurf_weight").notNull().default(1),
  momentumxWeight: doublePrecision("momentumx_weight").notNull().default(1),
  sdiSmoothed: doublePrecision("sdi_smoothed").notNull().default(0),
  forecastBest: varchar("forecast_best", { length: 100 }),
  forecastWeakest: varchar("forecast_weakest", { length: 100 }),
  forecastConfidence: doublePrecision("forecast_confidence").notNull().default(0),
  driveIndex: doublePrecision("drive_index").notNull().default(0.5),
  personalBest: doublePrecision("personal_best").notNull().default(0),
}, (table) => ({
  createdAtIdx: index("strategy_drive_summary_created_at_idx").on(table.createdAt),
}));

export const insertStrategyDriveSummarySchema = createInsertSchema(strategyDriveSummary).omit({
  id: true,
  createdAt: true,
});

export type InsertStrategyDriveSummary = z.infer<typeof insertStrategyDriveSummarySchema>;
export type StrategyDriveSummary = typeof strategyDriveSummary.$inferSelect;

// Phase 31.D: Strategic Drive Guardrail Policy (Soft Guardrails, Hard Coherency)
export const strategyDriveGuardrailPolicy = pgTable("strategy_drive_guardrail_policy", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  maxDeltaPerCycle: doublePrecision("max_delta_per_cycle").notNull().default(0.15),
  maxTotalShiftPerHour: doublePrecision("max_total_shift_per_hour").notNull().default(0.40),
  minConfidence: doublePrecision("min_confidence").notNull().default(0.50),
  minSmoothedSDI: doublePrecision("min_smoothed_sdi").notNull().default(0.45),
  maxExposurePerStrategy: doublePrecision("max_exposure_per_strategy").notNull().default(0.50),
  coolingMinutes: integer("cooling_minutes").notNull().default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 100 }),
});

export const insertStrategyDriveGuardrailPolicySchema = createInsertSchema(strategyDriveGuardrailPolicy).omit({
  id: true,
  updatedAt: true,
});

export type InsertStrategyDriveGuardrailPolicy = z.infer<typeof insertStrategyDriveGuardrailPolicySchema>;
export type StrategyDriveGuardrailPolicy = typeof strategyDriveGuardrailPolicy.$inferSelect;

// Phase 31.H: System Configuration (Passive Learning & System Flags)
export const systemConfig = pgTable("system_config", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  systemFlags: jsonb("system_flags").$type<{
    passiveLearning?: boolean;
    [key: string]: any;
  }>().notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 100 }),
});

export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({
  id: true,
  updatedAt: true,
});

export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
export type SystemConfig = typeof systemConfig.$inferSelect;

// Phase 6: Config Registry (Runtime Configuration Management)
export const configRegistry = pgTable("config_registry", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).unique().notNull(),
  value: jsonb("value").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 100 }),
});

export const insertConfigRegistrySchema = createInsertSchema(configRegistry).omit({
  id: true,
  updatedAt: true,
});

export type InsertConfigRegistry = z.infer<typeof insertConfigRegistrySchema>;
export type ConfigRegistry = typeof configRegistry.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// B74 — Passive OHLC Archive Pipeline (Equity + Crypto)
// ═══════════════════════════════════════════════════════════════════════════
//
// Six new tables for continuous 1-min OHLC + ticker-snapshot capture across
// three asset universes. All MONTH-RANGE PARTITIONED on the time column so
// B70 archival can DROP entire monthly partitions cheaply once cold-storage
// export lands. NO foreign keys to live tables — rows are cold-archivable
// standalone per the Langston-approved B70 archival contract.
//
// See drizzle/migrations/2026-05-01-b74-passive-archive-tables.sql for the
// authoritative DDL including partition pre-creation. These Drizzle defs
// give the application code typed access; the partitioning is
// schema-level and not represented in the Drizzle table objects.
//
// Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
// ═══════════════════════════════════════════════════════════════════════════

// ── OHLC: 1-min bars ───────────────────────────────────────────────────────
// Three near-identical tables (one per asset class). Same columns, different
// partition trees. B69 (2026-05-03): renamed `universe` → `asset_class` for
// consistency with the live tables + retagged equity_*-defaulted rows to
// xstock_*. Per-row `exchange` added for symmetry with live trade tables.
// Self-describing rows preserved (cold-storage extraction unchanged).

const ohlcColumns = {
  id: bigserial("id", { mode: "number" }).notNull(),
  symbol: text("symbol").notNull(),
  // B69: column renamed from `universe`. Same data, single source of truth.
  // Values: 'crypto_spot' | 'xstock_spot' (was 'equity_spot') | 'xstock_perp'
  // (was 'equity_perp'). Per-archiver default set in migration.
  assetClass: text("asset_class").notNull(),
  // B69: exchange added for schema symmetry with live tables.
  // crypto_spot_ohlc_1m + xstock_spot_ohlc_1m default 'kraken' (and
  // 'kraken-equities' specifically for the equity-spot via ws-equities feed
  // — per archiver insert). xstock_perp_ohlc_1m defaults 'kraken-futures'.
  exchange: text("exchange").notNull(),
  intervalBegin: timestamp("interval_begin", { withTimezone: true }).notNull(),
  open: numeric("open", { precision: 20, scale: 8 }).notNull(),
  high: numeric("high", { precision: 20, scale: 8 }).notNull(),
  low: numeric("low", { precision: 20, scale: 8 }).notNull(),
  close: numeric("close", { precision: 20, scale: 8 }).notNull(),
  volume: numeric("volume", { precision: 28, scale: 8 }).notNull(),
  vwap: numeric("vwap", { precision: 20, scale: 8 }),
  tradeCount: integer("trade_count"),
  metadata: jsonb("metadata").notNull().default(sql`'{"schema_version": 1}'::jsonb`),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
} as const;

// B79.0e (2026-05-10): renamed from equity_*→xstock_* per B69 namespace
// convention preserving equity_* for FUTURE real (non-tokenized) US equities.
// Const exports kept identical names for transitional grep-hygiene; underlying
// pgTable name + index name renamed to xstock_*.
export const xstockSpotOhlc1m = pgTable("xstock_spot_ohlc_1m", ohlcColumns, (table) => ({
  symTimeIdx: index("xstock_spot_ohlc_1m_sym_time").on(table.symbol, table.intervalBegin),
}));

export const xstockPerpOhlc1m = pgTable("xstock_perp_ohlc_1m", ohlcColumns, (table) => ({
  symTimeIdx: index("xstock_perp_ohlc_1m_sym_time").on(table.symbol, table.intervalBegin),
}));

export const cryptoSpotOhlc1m = pgTable("crypto_spot_ohlc_1m", ohlcColumns, (table) => ({
  symTimeIdx: index("crypto_spot_ohlc_1m_sym_time").on(table.symbol, table.intervalBegin),
}));

// ── Ticker snapshots ───────────────────────────────────────────────────────
// Up to 1 snapshot/symbol/second per Langston cc-inbox #867 Q2. Equity-
// specific fields (prev_day_*, is_extended_hours) populated for equity
// universes; perp-specific fields (open_interest, funding_rate) populated
// for perp universe. Crypto leaves both groups null. All universes share
// the same column set for query uniformity.

const tickerSnapColumns = {
  id: bigserial("id", { mode: "number" }).notNull(),
  symbol: text("symbol").notNull(),
  // B69 (2026-05-03): renamed from `universe` for single-source-of-truth
  // alignment with live tables. Same data, same partition routing semantics.
  assetClass: text("asset_class").notNull(),
  // B69: exchange added for schema symmetry. xstock_spot_ticker_snap
  // defaults 'kraken-equities' (separate WS endpoint), others 'kraken' or
  // 'kraken-futures' per archiver source.
  exchange: text("exchange").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  bid: numeric("bid", { precision: 20, scale: 8 }),
  bidQty: numeric("bid_qty", { precision: 28, scale: 8 }),
  ask: numeric("ask", { precision: 20, scale: 8 }),
  askQty: numeric("ask_qty", { precision: 28, scale: 8 }),
  last: numeric("last", { precision: 20, scale: 8 }),
  volume24h: numeric("volume_24h", { precision: 28, scale: 8 }),
  vwap24h: numeric("vwap_24h", { precision: 20, scale: 8 }),
  high24h: numeric("high_24h", { precision: 20, scale: 8 }),
  low24h: numeric("low_24h", { precision: 20, scale: 8 }),
  open24h: numeric("open_24h", { precision: 20, scale: 8 }),
  prevDayClose: numeric("prev_day_close", { precision: 20, scale: 8 }),
  prevDayVolume: numeric("prev_day_volume", { precision: 28, scale: 8 }),
  isExtendedHours: boolean("is_extended_hours"),
  openInterest: numeric("open_interest", { precision: 28, scale: 8 }),
  fundingRate: numeric("funding_rate", { precision: 12, scale: 8 }),
  metadata: jsonb("metadata").notNull().default(sql`'{"schema_version": 1}'::jsonb`),
} as const;

export const xstockSpotTickerSnap = pgTable("xstock_spot_ticker_snap", tickerSnapColumns, (table) => ({
  symTimeIdx: index("xstock_spot_ticker_snap_sym_time").on(table.symbol, table.capturedAt),
}));

export const xstockPerpTickerSnap = pgTable("xstock_perp_ticker_snap", tickerSnapColumns, (table) => ({
  symTimeIdx: index("xstock_perp_ticker_snap_sym_time").on(table.symbol, table.capturedAt),
}));

export const cryptoSpotTickerSnap = pgTable("crypto_spot_ticker_snap", tickerSnapColumns, (table) => ({
  symTimeIdx: index("crypto_spot_ticker_snap_sym_time").on(table.symbol, table.capturedAt),
}));

// Type exports — B79.0e renamed const refs from equity*→xstock*. Type names
// kept (Equity*) to avoid touching every importer; the underlying inferred
// shape is unchanged (table rename is metadata-only). Type-name modernization
// queued as cosmetic follow-up.
export type EquitySpotOhlc1m = typeof xstockSpotOhlc1m.$inferSelect;
export type InsertEquitySpotOhlc1m = typeof xstockSpotOhlc1m.$inferInsert;
export type EquityPerpOhlc1m = typeof xstockPerpOhlc1m.$inferSelect;
export type InsertEquityPerpOhlc1m = typeof xstockPerpOhlc1m.$inferInsert;
export type CryptoSpotOhlc1m = typeof cryptoSpotOhlc1m.$inferSelect;
export type InsertCryptoSpotOhlc1m = typeof cryptoSpotOhlc1m.$inferInsert;
export type EquitySpotTickerSnap = typeof xstockSpotTickerSnap.$inferSelect;
export type InsertEquitySpotTickerSnap = typeof xstockSpotTickerSnap.$inferInsert;
export type EquityPerpTickerSnap = typeof xstockPerpTickerSnap.$inferSelect;
export type InsertEquityPerpTickerSnap = typeof xstockPerpTickerSnap.$inferInsert;
export type CryptoSpotTickerSnap = typeof cryptoSpotTickerSnap.$inferSelect;
export type InsertCryptoSpotTickerSnap = typeof cryptoSpotTickerSnap.$inferInsert;
