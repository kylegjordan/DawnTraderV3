import { normalizeToInternalSymbol } from './markets/kraken-symbol-resolver';
// B79.0n.STORAGE (2026-05-21): AssetClass type for REQUIRED-assetClass storage API.
import type { AssetClass } from '../shared/asset-classes';
// B-NEW-43 (2026-05-22): TradingMode ('paper' | 'live') — was used 40× in this file
// with no import (40 of storage.ts's 59 TS2304 errors). Imported from the lib-level
// event-bus module. NOTE: TradingMode is duplicate-defined in 6+ files — type-dedup
// debt tracked separately; B-NEW-43 fixes the missing import, not the duplication.
import type { TradingMode } from './lib/event-bus';
import {
  users, 
  tradingSettings,
  guardrails,
  guardrailsV2,
  goalsPresets,
  goalsLearningMetrics,
  screenerFilters,
  screenerResults,
  filterCalibrationLog,
  filterDiagnostics,
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
  aiTransparencyLog,
  killSwitchEvents,
  tradingAuditLog,
  aiOpportunityRuns,
  aiOpportunities,
  dailyBriefs,
  paperTrades,
  signalWeights,
  predictionOutcomes,
  intradayAdjustments,
  aiLessons,
  portfolioAdjustments,
  goalsLive,
  goalsPaper,
  goalAnalysisHistoryLive,
  goalAnalysisHistoryPaper,
  goalAuditLog,
  userGoalsAudit,
  dailyPerformanceSummary,
  contextChats,
  aiOrchestratorLogs,
  systemSettings,
  type User, 
  type InsertUser,
  type TradingSettings,
  type InsertTradingSettings,
  type Guardrails,
  type InsertGuardrails,
  type GuardrailsV2,
  type InsertGuardrailsV2,
  type GoalsPresets,
  type InsertGoalsPresets,
  type GoalsLearningMetrics,
  type InsertGoalsLearningMetrics,
  type ScreenerFilters,
  type InsertScreenerFilters,
  type ScreenerResult,
  type InsertScreenerResult,
  type FilterCalibrationLog,
  type InsertFilterCalibrationLog,
  type StrategySettings,
  type InsertStrategySettings,
  type StrategySettingsAudit,
  type InsertStrategySettingsAudit,
  type WatchlistPair,
  type InsertWatchlistPair,
  tradingSignals,
  type TradingSignal,
  type InsertTradingSignal,
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
  type SystemSettings,
  type InsertSystemSettings,
  type DatabaseSizeLog,
  type InsertDatabaseSizeLog,
  type AIAuditLog,
  type InsertAIAuditLog,
  type ErrorLog,
  type InsertErrorLog,
  type AITransparencyLog,
  type InsertContextChat,
  type ContextChat,
  type AIOrchestratorLog,
  type InsertAIOrchestratorLog,
  type InsertAITransparencyLog,
  type KillSwitchEvent,
  type InsertKillSwitchEvent,
  safetyTelemetry,
  type SafetyTelemetry,
  type InsertSafetyTelemetry,
  telemetryLineage,
  type AIOpportunityRun,
  type InsertAIOpportunityRun,
  type AIOpportunity,
  type InsertAIOpportunity,
  type DailyBrief,
  type InsertDailyBrief,
  type PaperTrade,
  type InsertPaperTrade,
  type SignalWeight,
  type InsertSignalWeight,
  type PredictionOutcome,
  type InsertPredictionOutcome,
  type IntradayAdjustment,
  type InsertIntradayAdjustment,
  type AILesson,
  type InsertAILesson,
  type PortfolioAdjustment,
  type InsertPortfolioAdjustment,
  type GoalLive,
  type InsertGoalLive,
  type GoalPaper,
  type InsertGoalPaper,
  type GoalAnalysisHistoryLive,
  type InsertGoalAnalysisHistoryLive,
  type GoalAnalysisHistoryPaper,
  type InsertGoalAnalysisHistoryPaper,
  type GoalAuditLog,
  type InsertGoalAuditLog,
  type UserGoalsAudit,
  type InsertUserGoalsAudit,
  type DailyPerformanceSummary,
  type InsertDailyPerformanceSummary,
  type LearningSource,
  type InsertLearningSource,
  learningSources,
  type ActuationPolicy,
  type InsertActuationPolicy,
  actuationPolicies,
  type ProposedAdjustment,
  type InsertProposedAdjustment,
  proposedAdjustments,
  type AssetCapability,
  type InsertAssetCapability,
  assetCapabilities,
  type HistoricSignal,
  type InsertHistoricSignal,
  historicSignals,
  type ClosedTrade,
  type InsertClosedTrade,
  closedTradesTable,
  type ActiveOpenPosition,
  type InsertActiveOpenPosition,
  activeOpenPositions,
  type ActiveTradeLog,
  type InsertActiveTradeLog,
  activeTradeLogs,
  type ActiveEngineSession,
  type InsertActiveEngineSession,
  activeEngineSessions,
  type ExecutionAttemptAudit,
  type InsertExecutionAttemptAudit,
  executionAttemptAudit,
  type PortfolioState,
  type InsertPortfolioState,
  portfolioState,
  type SystemContext,
  type InsertSystemContext,
  systemContext,
  type SystemAlert,
  type InsertSystemAlert,
  systemAlerts,
  type AuditLog,
  type InsertAuditLog,
  auditLog,
  rtbSignals,
  type RtbSignal,
  type InsertRtbSignal
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte, gt, lte, inArray, sql, isNotNull, isNull } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Phase 41F-L.E2E-PURGE: Trading settings methods REMOVED - Use mode-level guardrails_v2 + portfolio_state
  // getTradingSettings(userId: string): Promise<TradingSettings | undefined>;
  // createTradingSettings(settings: InsertTradingSettings): Promise<TradingSettings>;
  // updateTradingSettings(userId: string, updates: Partial<TradingSettings>): Promise<TradingSettings>;

  // [9.7] Guardrails methods - DEPRECATED
  // Legacy guardrails table is obsolete. Use getGuardrailsV2() instead.
  // P19-B8.2: the zero-caller getGuardrails + getGuardrailsLegacy accessors were
  // DELETED (rule 18; DELETED_COMPONENTS_LOG 2026-07-05). upsertGuardrails is
  // INTENTIONALLY RETAINED — it still has two live callers (routes.ts legacy
  // guardrails route + intent-executor executeGuardrailsUpdate) that throw at
  // runtime today; that trio is B6.10's guardrails-v1 retirement work (RUNNING_ISSUES).
  /** @deprecated [9.7] Use upsertGuardrailsV2() instead. This method throws an error. */
  upsertGuardrails(data: Omit<InsertGuardrails, 'userId'> & { lastUpdatedBy?: string }): Promise<Guardrails>;
  
  // Phase 2: Guardrails V2 methods (Core Four - Single Source of Truth)
  getGuardrailsV2(params: { mode: 'live' | 'paper' }): Promise<GuardrailsV2 | null>;
  upsertGuardrailsV2(data: InsertGuardrailsV2): Promise<GuardrailsV2>;

  // Phase 4: Goals Presets methods
  getGoalsPresets(params: { mode: 'live' | 'paper' }): Promise<GoalsPresets[]>;
  getActiveGoalsPreset(params: { mode: 'live' | 'paper' }): Promise<GoalsPresets | null>;
  selectGoalsPreset(params: { mode: 'live' | 'paper'; presetName: string }): Promise<{ preset: GoalsPresets; guardrails: GuardrailsV2 }>;
  getGuardrailsCompliance(params: { mode: 'live' | 'paper' }): Promise<any>;

  // Phase 6: Goals Learning Metrics methods
  getLearningSummary(params: { mode: 'live' | 'paper' }): Promise<any>;
  upsertLearningMetric(data: InsertGoalsLearningMetrics): Promise<GoalsLearningMetrics>;
  updatePresetLearningStatus(params: { mode: 'live' | 'paper'; presetName: string; lastAdjustedAt: Date; learningActive: boolean }): Promise<GoalsPresets>;

  // Screener filters methods (global settings per mode)
  // Batch 19G: filterPath support for 4-path filter architecture
  // B79.0n.STORAGE (2026-05-21): assetClass is REQUIRED — no silent crypto_spot default.
  // Per Langston rev2 §11.4 + Step 2 ACK: every caller passes explicit assetClass.
  // For UI/diagnostic baselines that intentionally want canonical crypto values, use
  // getCanonicalScreenerConfig() helper (never mis-route as asset-class-aware).
  getScreenerFilters(params: { mode: 'live' | 'paper'; assetClass: AssetClass; filterPath?: string }): Promise<ScreenerFilters | null>;
  getCanonicalScreenerConfig(params: { mode: 'live' | 'paper'; filterPath?: string }): Promise<ScreenerFilters | null>;
  // B79.0n.STORAGE (2026-05-21): assetClass REQUIRED on upsert data shape per Langston
  // Step 4 BLOCKER. UPDATE WHERE clause now scopes by (mode, asset_class, filter_path)
  // matching the unique index — prevents cross-class corruption when 2 rows share
  // (mode, filter_path) post-seed-migration.
  upsertScreenerFilters(data: Omit<InsertScreenerFilters, 'userId'> & { assetClass: AssetClass; lastUpdatedBy?: string; filterPath?: string }): Promise<ScreenerFilters>;

  // Filter diagnostics methods
  getFilterDiagnostics(params: { mode: 'live' | 'paper'; hours?: number }): Promise<any[]>;
  logFilterDiagnostic(data: { mode: 'live' | 'paper'; pairsScanned: number; eligiblePairs: number; topFailureReason: string; failurePercent: string }): Promise<void>;

  // Phase 41F-L.E2E: Lineage tracking methods
  createLineageEvent(event: { traceId: string; stage: string; symbol: string | null; mode: 'live' | 'paper'; timestamp: Date; metadata: Record<string, any> }): Promise<void>;
  getLineageByTraceId(traceId: string): Promise<Array<{ traceId: string; stage: string; symbol: string | null; mode: string; timestamp: Date; metadata: any }>>;
  getIncompleteLineageTraces(since: Date): Promise<string[]>;

  // Filter calibration methods
  getLatestCalibration(params: { mode: 'live' | 'paper'; maxAgeHours?: number }): Promise<FilterCalibrationLog | null>;
  getLatestPaperCalibration(): Promise<FilterCalibrationLog | null>;
  getCalibrationWithFallback(mode: 'live' | 'paper', maxAgeHours?: number): Promise<FilterCalibrationLog | null>;
  getRecentCalibrations(params: { mode: 'live' | 'paper'; limit?: number; maxAgeHours?: number }): Promise<FilterCalibrationLog[]>;
  createCalibration(data: InsertFilterCalibrationLog): Promise<FilterCalibrationLog>;

  // Screener results methods
  getScreenerResults(params: { mode: 'live' | 'paper'; limit?: number }): Promise<ScreenerResult[]>;
  createScreenerResults(data: InsertScreenerResult[]): Promise<void>;
  deleteOldScreenerResults(params: { mode: 'live' | 'paper'; beforeDate: Date }): Promise<void>;

  // Strategy settings methods
  // B79.0n.STRATEGY (2026-05-24): assetClass added — REQUIRED on getStrategySettings (single-row
  // lookup needs full key); OPTIONAL on listStrategySettings (cross-class iteration is a valid
  // admin/UI use case; default behavior returns all classes for that context+mode).
  getStrategySettings(params: { globalContextId?: string; userId?: string; mode: 'live' | 'paper'; strategy: string; assetClass: string }): Promise<StrategySettings | null>;
  listStrategySettings(params: { globalContextId?: string; userId?: string; mode: 'live' | 'paper'; assetClass?: string }): Promise<StrategySettings[]>;
  upsertStrategySettings(row: InsertStrategySettings): Promise<StrategySettings>;
  insertStrategySettingsAudit(row: InsertStrategySettingsAudit): Promise<void>;
  listStrategySettingsAudit(params: { limit?: number }): Promise<StrategySettingsAudit[]>;

  // Watchlist methods
  getWatchlist(params: { mode: 'live' | 'paper' }): Promise<WatchlistPair[]>;
  addWatchlistPair(pair: InsertWatchlistPair): Promise<WatchlistPair>;
  updateWatchlistPair(id: string, updates: Partial<WatchlistPair>): Promise<WatchlistPair>;
  removeWatchlistPair(id: string): Promise<void>;
  cleanStaleWatchlistPairs(minutesOld: number): Promise<number>;

  // Trading signals methods
  saveTradingSignal(signal: InsertTradingSignal): Promise<TradingSignal | null>;
  getTradingSignals(params: { mode: 'live' | 'paper'; status?: string }): Promise<TradingSignal[]>;
  updateSignalStatus(id: string, status: string, executedAt?: Date): Promise<TradingSignal>;
  expireOldSignals(params: { mode: 'live' | 'paper'; beforeDate: Date }): Promise<void>;
  expireAllExpiredSignals(): Promise<number>;
  deleteAllTradingSignals(mode: 'live' | 'paper'): Promise<number>; // REB 8.8.3-I: Clear RTB on reset
  consumeSignalBySymbol(mode: 'live' | 'paper', symbol: string): Promise<TradingSignal | null>; // REB 8.8.3-I: Consume signal when trade opens

  // Trade methods
  getTrades(mode: 'live' | 'paper', filters?: { status?: string; symbol?: string; strategy?: string; limit?: number }): Promise<Trade[]>;
  getActiveTrades(mode: 'live' | 'paper'): Promise<Trade[]>;
  hasActivePair(symbol: string, mode: 'live' | 'paper'): Promise<boolean>;
  createTrade(trade: InsertTrade): Promise<Trade>;
  updateTrade(id: string, updates: Partial<Trade>): Promise<Trade>;
  closeTrade(id: string, exitPrice: number, exitFee: number, exitSlippage: number): Promise<Trade>;
  cleanOldLiveTrades(daysOld: number): Promise<number>;

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
  
  // Context-specific chats (Goals, Guardrails, Screener, Strategies)
  getContextChats(userId: string, context: string): Promise<ContextChat[]>;
  saveContextChat(chat: InsertContextChat): Promise<ContextChat>;
  deleteContextChats(userId: string, context: string): Promise<void>;
  
  // AI Orchestrator Logs
  createOrchestratorLog(log: InsertAIOrchestratorLog): Promise<AIOrchestratorLog>;
  getOrchestratorLogs(userId: string | null, limit?: number): Promise<AIOrchestratorLog[]>;
  getOrchestratorLogsByCategory(userId: string | null, category: string, limit?: number): Promise<AIOrchestratorLog[]>;
  getOrchestratorLogsByStatus(userId: string | null, status: string, limit?: number): Promise<AIOrchestratorLog[]>;
  updateOrchestratorLog(id: number, updates: Partial<AIOrchestratorLog>): Promise<AIOrchestratorLog>;
  
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

  // AI Transparency log methods
  createTransparencyLog(log: InsertAITransparencyLog): Promise<AITransparencyLog>;
  getTransparencyLogs(filters?: { userId?: string; taskName?: string; mode?: 'live' | 'paper'; limit?: number }): Promise<AITransparencyLog[]>;
  getRecentTransparencyLogs(limit?: number): Promise<AITransparencyLog[]>;
  getSystemSchedulerLogs(limit?: number): Promise<AITransparencyLog[]>;

  // Kill switch methods
  createKillSwitchEvent(event: InsertKillSwitchEvent): Promise<KillSwitchEvent>;
  getKillSwitchEvents(userId: string, filters?: { resolved?: boolean; limit?: number }): Promise<KillSwitchEvent[]>;
  getKillSwitchEventById(id: string): Promise<KillSwitchEvent | undefined>;
  getLatestKillSwitchEvent(userId: string): Promise<KillSwitchEvent | undefined>;
  resolveKillSwitchEvent(id: string, method: string, notes?: string): Promise<KillSwitchEvent>;

  // Trading audit log methods (Phase 27.F.6)
  createTradingAuditLog(data: { userId: string; action: string; mode: string; triggeredBy?: string; metadata?: any }): Promise<void>;
  getTradingAuditLogs(userId: string, limit?: number): Promise<any[]>;

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
  getDailyBriefs(userId: string, filters?: { status?: string; limit?: number; startDate?: string; endDate?: string }): Promise<DailyBrief[]>;
  finalizeDailyBrief(id: string): Promise<DailyBrief>;

  // Paper trading methods (simulated trades - isolated from live)
  createPaperTrade(trade: InsertPaperTrade): Promise<PaperTrade>;
  updatePaperTrade(id: string, updates: Partial<PaperTrade>): Promise<PaperTrade>;
  getPaperTradeById(id: string): Promise<PaperTrade | undefined>;
  getAllPaperTrades(): Promise<PaperTrade[]>;
  getOpenPaperTrades(): Promise<PaperTrade[]>;
  deleteAllPaperTrades(): Promise<void>;

  // P19-B-RENAME Wave-1 (Kyle ruling, rule 18): the Walter-era paper daily-brief +
  // paper AI-report methods were DELETED with their tables (both live-verified empty;
  // the create/update methods had zero callers — nothing ever wrote them).

  // Signal weight methods
  getSignalWeights(userId: string, strategy?: string, mode?: string): Promise<SignalWeight[]>;
  getSignalWeight(userId: string, strategy: string, mode: string, signalName: string): Promise<SignalWeight | undefined>;
  createSignalWeight(weight: InsertSignalWeight): Promise<SignalWeight>;
  updateSignalWeight(id: string, updates: Partial<SignalWeight>): Promise<SignalWeight>;
  upsertSignalWeight(weight: InsertSignalWeight): Promise<SignalWeight>;

  // Learning source methods
  getLearningSources(userId: string): Promise<LearningSource[]>;
  getLearningSource(userId: string, sourceName: string): Promise<LearningSource | undefined>;
  createLearningSource(source: InsertLearningSource): Promise<LearningSource>;
  updateLearningSource(id: string, updates: Partial<LearningSource>): Promise<LearningSource>;

  // Prediction outcome methods
  createPredictionOutcome(outcome: InsertPredictionOutcome): Promise<PredictionOutcome>;
  updatePredictionOutcome(id: string, updates: Partial<PredictionOutcome>): Promise<PredictionOutcome>;
  getPredictionOutcomes(userId: string, filters?: { mode?: string; strategy?: string; fromDate?: Date; toDate?: Date; limit?: number }): Promise<PredictionOutcome[]>;
  getPredictionAccuracy(userId: string, mode: string, strategy?: string, days?: number): Promise<{ accuracy: number; totalPredictions: number; correctPredictions: number }>;

  // Intraday adjustment methods
  createIntradayAdjustment(adjustment: InsertIntradayAdjustment): Promise<IntradayAdjustment>;
  getIntradayAdjustments(userId: string, filters?: { mode?: string; hours?: number; limit?: number }): Promise<IntradayAdjustment[]>;

  // AI lesson methods
  createAILesson(lesson: InsertAILesson): Promise<AILesson>;
  getAILessons(userId: string, filters?: { mode?: string; strategy?: string; hours?: number; limit?: number }): Promise<AILesson[]>;

  // Portfolio adjustment methods
  createPortfolioAdjustment(adjustment: InsertPortfolioAdjustment): Promise<PortfolioAdjustment>;
  getPortfolioAdjustments(filters?: { mode?: string; hours?: number; limit?: number }): Promise<PortfolioAdjustment[]>;

  // Feature snapshot methods

  // Goals Engine methods - Live mode
  getGoalsLive(): Promise<GoalLive[]>;
  getGoalLive(metricName: string): Promise<GoalLive | undefined>;
  createGoalLive(goal: InsertGoalLive): Promise<GoalLive>;
  updateGoalLive(id: string, updates: Partial<GoalLive>): Promise<GoalLive>;
  upsertGoalLive(goal: InsertGoalLive): Promise<GoalLive>;
  deleteGoalLive(id: string): Promise<void>;

  // Goals Engine methods - Paper mode
  getGoalsPaper(): Promise<GoalPaper[]>;
  getGoalPaper(metricName: string): Promise<GoalPaper | undefined>;
  createGoalPaper(goal: InsertGoalPaper): Promise<GoalPaper>;
  updateGoalPaper(id: string, updates: Partial<GoalPaper>): Promise<GoalPaper>;
  upsertGoalPaper(goal: InsertGoalPaper): Promise<GoalPaper>;
  deleteGoalPaper(id: string): Promise<void>;

  // Goal Analysis History - Live mode
  createGoalAnalysisLive(analysis: InsertGoalAnalysisHistoryLive): Promise<GoalAnalysisHistoryLive>;
  getGoalAnalysisHistoryLive(userId: string, limit?: number): Promise<GoalAnalysisHistoryLive[]>;

  // Goal Analysis History - Paper mode
  createGoalAnalysisPaper(analysis: InsertGoalAnalysisHistoryPaper): Promise<GoalAnalysisHistoryPaper>;
  getGoalAnalysisHistoryPaper(userId: string, limit?: number): Promise<GoalAnalysisHistoryPaper[]>;

  // Phase 27.5: Goal Audit Log
  createGoalAuditLog(entry: InsertGoalAuditLog): Promise<GoalAuditLog>;
  getGoalAuditLogs(userId: string, mode?: 'live' | 'paper', limit?: number): Promise<GoalAuditLog[]>;

  // Phase 27.F.14.UI-SYNC.7: User Goals Audit
  createUserGoalsAudit(entry: InsertUserGoalsAudit): Promise<UserGoalsAudit>;
  getUserGoalsAudit(userId: string, mode?: 'live' | 'paper', limit?: number): Promise<UserGoalsAudit[]>;

  // Phase 27.F.15.UI-EARNINGS.3: Daily Performance Summary
  createDailyPerformanceSummary(entry: InsertDailyPerformanceSummary): Promise<DailyPerformanceSummary>;
  getDailyPerformanceSummaries(mode: 'live' | 'paper', limit?: number): Promise<DailyPerformanceSummary[]>;

  // User utility methods
  getAllUsers(): Promise<User[]>;

  // Actuation policy methods (Milestone 17A)
  getActuationPolicy(userId: string, variableName: string): Promise<ActuationPolicy | undefined>;
  getActuationPolicies(userId: string): Promise<ActuationPolicy[]>;
  createActuationPolicy(policy: InsertActuationPolicy): Promise<ActuationPolicy>;
  updateActuationPolicy(id: string, updates: Partial<ActuationPolicy>): Promise<ActuationPolicy>;

  // Proposed adjustments methods (Milestone 17A)
  createProposedAdjustment(adjustment: InsertProposedAdjustment): Promise<ProposedAdjustment>;
  updateProposedAdjustment(id: string, updates: Partial<ProposedAdjustment>): Promise<ProposedAdjustment>;
  getProposedAdjustment(id: string): Promise<ProposedAdjustment | undefined>;
  getRecentProposedAdjustments(userId: string, variableName: string, hours: number): Promise<ProposedAdjustment[]>;
  getAllProposedAdjustments(userId: string, hours?: number): Promise<ProposedAdjustment[]>;
  getPendingAdjustments(userId: string, mode: 'live' | 'paper'): Promise<ProposedAdjustment[]>;

  // Asset capabilities methods (Milestone 17B)
  getAssetCapability(symbol: string): Promise<AssetCapability | undefined>;
  getAssetCapabilities(): Promise<AssetCapability[]>;
  createAssetCapability(capability: InsertAssetCapability): Promise<AssetCapability>;
  updateAssetCapability(id: string, updates: Partial<AssetCapability>): Promise<AssetCapability>;
  upsertAssetCapability(capability: Omit<InsertAssetCapability, 'id'>): Promise<AssetCapability>;

  // Historic signals methods (Milestone 17C)
  createHistoricSignal(signal: InsertHistoricSignal): Promise<HistoricSignal>;
  getHistoricSignals(userId: string, limit?: number): Promise<HistoricSignal[]>;
  getHistoricSignalsBySymbol(userId: string, symbol: string): Promise<HistoricSignal[]>;
  getHistoricSignalsByStrategy(userId: string, strategyId: string): Promise<HistoricSignal[]>;
  getHistoricSignalStats(userId: string): Promise<{
    totalSignals: number;
    winRate: number;
    avgReturn: number;
    byStrategy: Array<{
      strategy: string;
      count: number;
      winRate: number;
      avgReturn: number;
    }>;
  }>;

  // Paper simulation methods (Milestone 18) - Phase 27.F.15.B.2: Global per mode with explicit mode parameter
  // Paper trades
  // Step F (#618): the payload OMITS `mode` -- it comes from the explicit first argument,
  // so the mode is stated exactly once and no caller can pass one that contradicts it.
  createClosedTrade(mode: TradingMode, trade: Omit<InsertClosedTrade, 'mode'>): Promise<ClosedTrade>;
  updateClosedTrade(mode: TradingMode, id: string, updates: Partial<ClosedTrade>): Promise<ClosedTrade>;
  getClosedTrade(mode: TradingMode, id: string): Promise<ClosedTrade | undefined>;
  getClosedTrades(mode: TradingMode, filters: { limit: number | 'all'; closedOnly?: boolean; includeNeverFilled?: boolean }): Promise<ClosedTrade[]>;
  // B-BALANCE-TRUTH Step C (#618): whole-history / whole-window aggregates. Use THESE for any
  // total, count, chart or rolling-N question -- `getClosedTrades` is a LIST reader and its bound
  // is a page size, not an answer.
  getRealizedPnlTotal(mode: TradingMode): Promise<{ realizedPnl: number; tradeCount: number }>;
  getClosedTradesCount(mode: TradingMode, opts?: { closedOnly?: boolean }): Promise<number>;
  getLifetimeScoreboard(mode: TradingMode): Promise<{
    epochStartedAt: string | null; epochIsExplicit: boolean;
    netPnl: number; timeWeightedReturnPct: number | null; tradeCount: number;
  }>;
  getPortfolioMetricComponents(mode: TradingMode): Promise<{
    rowCount: number; maxDrawdownAbs: number; grossProfit: number; grossLoss: number;
    avgReturn: number; stdDevPop: number; returnsCount: number; capitalDeployed: number;
  }>;
  getDailyRealizedPnlSince(mode: TradingMode, since: Date): Promise<Array<{ date: string; pl: number }>>;
  getRecentClosedPnls(mode: TradingMode, n: number): Promise<number[]>;
  getRealizedPnlSince(mode: TradingMode, since: Date): Promise<{ realizedPnl: number; tradeCount: number }>;
  // Phase 8.8.3-C5: Paginated trades with sorting support
  getClosedTradesPaginated(mode: TradingMode, filters: {
    limit?: number;
    offset?: number;
    sortBy?: 'openedAt' | 'closedAt' | 'symbol' | 'pnl' | 'pnlPercent' | 'strategyName';
    order?: 'asc' | 'desc';
    closedOnly?: boolean;
    symbol?: string;
    strategy?: string;
    closeReason?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<{ trades: ClosedTrade[]; totalCount: number }>;
  getClosedTradesBySymbol(mode: TradingMode, symbol: string): Promise<ClosedTrade[]>;
  getClosedTradesGlobal(mode: TradingMode, filters?: { limit?: number; closedOnly?: boolean; includeNeverFilled?: boolean }): Promise<ClosedTrade[]>; // Phase 27.F.14.B: Global-per-mode query for LATTI
  deleteClosedTrade(mode: TradingMode, id: string): Promise<void>; // B-PROMOTION-RACE-FIX (#508): single-row delete for the dup-race orphan compensation

  // Open positions
  createActiveOpenPosition(mode: TradingMode, position: InsertActiveOpenPosition): Promise<{ position: ActiveOpenPosition; created: boolean }>; // B-PROMOTION-RACE-FIX (#508): created=false = I8E dedup-return; caller must compensate its orphaned record
  updateActiveOpenPosition(mode: TradingMode, id: string, updates: Partial<ActiveOpenPosition>): Promise<ActiveOpenPosition>;
  getActiveOpenPosition(mode: TradingMode, id: string): Promise<ActiveOpenPosition | undefined>;
  getActiveOpenPositionBySymbol(mode: TradingMode, symbol: string): Promise<ActiveOpenPosition | undefined>;
  getActiveOpenPositions(mode: TradingMode): Promise<ActiveOpenPosition[]>;
  deleteActiveOpenPosition(mode: TradingMode, id: string): Promise<void>;
  deleteAllActiveOpenPositions(mode: TradingMode): Promise<void>; // Phase 27.F.13.C: Reset simulation
  
  // Trade logs
  createActiveTradeLog(mode: TradingMode, log: InsertActiveTradeLog): Promise<ActiveTradeLog>;
  getActiveTradeLogs(mode: TradingMode, filters?: { limit?: number; tradeId?: string }): Promise<ActiveTradeLog[]>;
  deleteAllActiveTradeLogs(mode: TradingMode): Promise<void>; // Phase 27.F.13.C: Reset simulation
  deleteAllClosedTrades(mode: TradingMode): Promise<void>; // Phase 27.F.13.C: Reset simulation
  
  // Stats
  getActiveEngineStats(mode: TradingMode): Promise<{
    totalTrades: number;
    openPositions: number;
    closedTrades: number;
    totalPnl: number;
    winRate: number;
    avgReturn: number;
    avgHoldingTime: number; // in hours
    byStrategy: Array<{
      strategy: string;
      count: number;
      winRate: number;
      avgReturn: number;
      totalPnl: number;
    }>;
  }>;
  
  // Paper simulation session methods
  createActiveEngineSession(session: InsertActiveEngineSession): Promise<ActiveEngineSession>;
  updateActiveEngineSession(id: string, updates: Partial<ActiveEngineSession>): Promise<ActiveEngineSession>;
  getActiveEngineSession(id: string): Promise<ActiveEngineSession | undefined>;
  getActiveEngineSessionBySessionId(sessionId: string): Promise<ActiveEngineSession | undefined>;
  getRunningEngineSession(mode: 'live' | 'paper'): Promise<ActiveEngineSession | undefined>;
  getRunningEngineSessions(): Promise<ActiveEngineSession[]>; // Get all active sessions (for heartbeat)
  getActiveEngineSessions(userId: string, filters?: { limit?: number; status?: string }): Promise<ActiveEngineSession[]>;
  
  // Phase 8.8.3-J: Execution Attempt Audit methods (read-only diagnostics)
  createExecutionAttemptAudit(audit: InsertExecutionAttemptAudit): Promise<ExecutionAttemptAudit>;
  getExecutionAttemptAudits(mode: 'live' | 'paper', filters?: { 
    limit?: number; 
    decision?: 'OPENED' | 'BLOCKED';
    symbol?: string;
    strategy?: string;
  }): Promise<ExecutionAttemptAudit[]>;
  getExecutionAttemptMetrics(mode: 'live' | 'paper'): Promise<{
    totalAttempts: number;
    opened: number;
    blocked: number;
    blockedByReason: Record<string, number>;
    last24hAttempts: number;
    last24hOpened: number;
    last24hBlocked: number;
  }>;
  

  // Portfolio State methods (Phase 8.5 Addendum F)
  getPortfolioState(params: { globalContextId?: string; userId?: string; mode: 'live' | 'paper' }): Promise<PortfolioState | undefined>;
  // P19-B8.5 (single-writer balance): upsertPortfolioState + updatePortfolioBalance removed — executeReanchor is the sole portfolio_state.balance writer.

  // Tuning methods (Phase 26.1)
  getTuningPolicy(params: { userId: string; mode: 'live' | 'paper' }): Promise<any | null>;
  upsertTuningPolicy(data: any): Promise<any>;
  getTuningEvents(params: { userId: string; mode?: string; limit?: number }): Promise<any[]>;
  createTuningEvent(data: any): Promise<any>;
  updateTuningEvent(id: string, updates: any): Promise<any>;

  // System Context methods (Phase 27.4, Phase 27.F.13.O: Global per-mode)
  getSystemContext(mode: 'live' | 'paper'): Promise<SystemContext | undefined>;
  upsertSystemContext(data: Partial<InsertSystemContext> & { tradingMode: 'live' | 'paper' }): Promise<SystemContext>;
  updateSystemContext(mode: 'live' | 'paper', updates: Partial<SystemContext>): Promise<SystemContext>;
  
  // System Alert methods (OpenAI Rate Limiter)
  createSystemAlert(alert: InsertSystemAlert): Promise<SystemAlert>;

  // Phase 28.C: Override Audit History methods
  addAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getRecentAuditLogs(params: { mode?: 'live' | 'paper'; entityType?: string; limit?: number; since?: Date }): Promise<AuditLog[]>;
  
  // Phase 8.8.4-B: RTB Signals Queue methods
  // P19-B6.5b: insertRtbSignal removed (zero callers — see DELETED_COMPONENTS_LOG). upsert is the live writer.
  upsertRtbSignal(data: InsertRtbSignal): Promise<RtbSignal>;
  getRtbSignals(filters: {
    mode: 'live' | 'paper';
    status?: string;
    symbol?: string;
    strategy?: string;
    /** B79.0n.RTB (2026-05-27): per-class queue filter. Optional. */
    assetClass?: string;
    orderBy?: string;
    orderDir?: string;
    limit?: number
  }): Promise<RtbSignal[]>;
  getRtbSignalById(id: string): Promise<RtbSignal | undefined>;
  updateRtbSignal(id: string, updates: Partial<RtbSignal>): Promise<RtbSignal>;
  deleteRtbSignals(filters: { mode: 'live' | 'paper'; id?: string; symbol?: string; strategy?: string; status?: string }): Promise<number>;
  
  // Directive 8.8.4-A4.R10R-3.T3: Batch RTB operations for concurrent refresh
  updateRtbSignalsBatch(updates: Array<{ id: string; updates: Partial<RtbSignal> }>): Promise<number>;
  deleteRtbSignalsByIds(ids: string[]): Promise<number>;
}

// Phase 27.F: Canonical metric key generator for goals engine
// Ensures consistent lookups regardless of metric name variations (case, spaces, special chars)
export function canonicalizeMetricName(metricName: string): string {
  return metricName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove spaces, special chars
    .trim();
}

// #618: one place that reports the size of every unbounded closed-trade read (Langston rider).
// The row count past which an unbounded read stops being obviously cheap. Stated ONCE, here.
// Not a cap and must never become one -- it changes nothing about what is returned; it only
// decides whether the line is a log or a warning.
const UNBOUNDED_READ_REVIEW_ROWS = 5000;
function logUnboundedRead(rowCount: number): void {
  if (rowCount >= UNBOUNDED_READ_REVIEW_ROWS) {
    console.warn(
      `[#618][UNBOUNDED_READ] getClosedTrades returned ${rowCount} rows on an unbounded read -- ` +
      `past the ${UNBOUNDED_READ_REVIEW_ROWS}-row review point. The fix is a per-key "since" ` +
      `bound on the READER, with open-time and close-time bounded separately -- NOT a cap. ` +
      `A cap is the #618 defect this batch exists to delete.`,
    );
  } else {
    console.log(`[#618][UNBOUNDED_READ] getClosedTrades returned ${rowCount} rows (unbounded).`);
  }
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
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

  /**
   * Phase 41F-L.E2E-PURGE: REMOVED - User-level settings eliminated
   * Use buildSettingsFromModeLevel() adapter or mode-level guardrails_v2 + portfolio_state
   * 
   * COMPILE-TIME GUARD: These methods are commented out to prevent new code from using them
   * RUNTIME GUARD: If uncommented and called in STRICT_MODE=1, throws [FORBIDDEN] error
   */
  // async getTradingSettings(userId: string): Promise<TradingSettings | undefined> {
  //   if (process.env.STRICT_MODE === '1') {
  //     throw new Error('[FORBIDDEN] getTradingSettings called - user-level settings removed. Use guardrails_v2 + portfolio_state');
  //   }
  //   console.error('[FORBIDDEN] getTradingSettings() called - migration incomplete');
  //   return undefined;
  // }

  // async createTradingSettings(settings: InsertTradingSettings): Promise<TradingSettings> {
  //   if (process.env.STRICT_MODE === '1') {
  //     throw new Error('[FORBIDDEN] createTradingSettings - user-level settings removed');
  //   }
  //   console.error('[FORBIDDEN] createTradingSettings() called');
  //   throw new Error('Method removed');
  // }

  // async updateTradingSettings(userId: string, updates: Partial<TradingSettings>): Promise<TradingSettings> {
  //   if (process.env.STRICT_MODE === '1') {
  //     throw new Error('[FORBIDDEN] updateTradingSettings - user-level settings removed');
  //   }
  //   console.error('[FORBIDDEN] updateTradingSettings() called');
  //   throw new Error('Method removed');
  // }

  // [9.7] Guardrails methods - DEPRECATED
  // Legacy guardrails table is obsolete. Use getGuardrailsV2() instead.
  
  // P19-B8.2 (rule 18): getGuardrails (unconditional-throw stub) and
  // getGuardrailsLegacy (debug read) DELETED — both grep-proven zero-caller
  // 2026-07-05. NOTE for future sweeps: config-update-service.ts:176 and
  // state-awareness.ts:253 declare their OWN symbols named getGuardrails —
  // both already read guardrails_v2 ([9.7] comments) and are NOT this accessor.

  /**
   * @deprecated [9.7] Use upsertGuardrailsV2() instead. Legacy guardrails table is obsolete.
   * This method now throws an error to prevent accidental writes.
   * P19-B8.2: RETAINED (two live callers — routes.ts legacy guardrails route +
   * intent-executor executeGuardrailsUpdate — both throw at runtime today);
   * the trio retires together in B6.10 (RUNNING_ISSUES).
   */
  async upsertGuardrails(data: Omit<InsertGuardrails, 'userId'> & { lastUpdatedBy?: string }): Promise<Guardrails> {
    throw new Error('[9.7] Deprecated: Legacy guardrails update blocked – use guardrails_v2 instead.');
  }

  // Phase 2: Guardrails V2 methods (Core Four - Single Source of Truth)
  async getGuardrailsV2(params: { mode: 'live' | 'paper' }): Promise<GuardrailsV2 | null> {
    const [result] = await db
      .select()
      .from(guardrailsV2)
      .where(eq(guardrailsV2.mode, params.mode));
    return result || null;
  }

  async upsertGuardrailsV2(data: InsertGuardrailsV2): Promise<GuardrailsV2> {
    const existing = await this.getGuardrailsV2({ mode: data.mode });
    
    if (existing) {
      // For updates, merge with existing values to preserve unmodified fields
      const updateData = {
        portfolioRiskPerTradePct: data.portfolioRiskPerTradePct ?? existing.portfolioRiskPerTradePct,
        symbolCooldownMinutes: data.symbolCooldownMinutes ?? existing.symbolCooldownMinutes,
        maxOpenPositions: data.maxOpenPositions ?? existing.maxOpenPositions,
        dailyLossKillSwitchPct: data.dailyLossKillSwitchPct ?? existing.dailyLossKillSwitchPct,
        // P19-B6.8: the daily-loss warning tiers were in the table (B6) + validated (RULE_011) + read by the
        // failsafe, but the UPDATE merge-map dropped them — so a user save never persisted. Now merged like
        // every sibling field (?? existing) so the user-set per-mode warning levels actually save.
        dailyLossWarning1Pct: data.dailyLossWarning1Pct ?? existing.dailyLossWarning1Pct,
        dailyLossWarning2Pct: data.dailyLossWarning2Pct ?? existing.dailyLossWarning2Pct,
        // Phase 8.8.3-J7.1: Add missing guardrail fields
        maxPositionPercentPct: data.maxPositionPercentPct ?? existing.maxPositionPercentPct,
        // Phase 8.8.3-B3: Max Total Portfolio Exposure
        maxTotalExposurePct: data.maxTotalExposurePct ?? existing.maxTotalExposurePct,
        lowPriceThreshold: data.lowPriceThreshold ?? existing.lowPriceThreshold,
        lowPriceMinStopAtrMult: data.lowPriceMinStopAtrMult ?? existing.lowPriceMinStopAtrMult,
        lowPriceMinPositionNotional: data.lowPriceMinPositionNotional ?? existing.lowPriceMinPositionNotional,
        // Override controls
        isManualOverride: data.isManualOverride ?? existing.isManualOverride,
        tunedByLatti: data.tunedByLatti ?? existing.tunedByLatti,
        lockedByUser: data.lockedByUser ?? existing.lockedByUser,
        managedByLottie: data.managedByLottie ?? existing.managedByLottie,
        manualOverrideEnabled: data.manualOverrideEnabled ?? existing.manualOverrideEnabled,
        lastUpdatedBy: data.lastUpdatedBy ?? existing.lastUpdatedBy,
        lastUpdated: new Date()
      };
      
      const [result] = await db
        .update(guardrailsV2)
        .set(updateData)
        .where(eq(guardrailsV2.mode, data.mode))
        .returning();
      return result;
    } else {
      const insertData = {
        ...data,
        lastUpdated: new Date()
      };
      const [result] = await db.insert(guardrailsV2).values(insertData).returning();
      return result;
    }
  }

  // Phase 4: Goals Presets methods
  async getGoalsPresets(params: { mode: 'live' | 'paper' }): Promise<GoalsPresets[]> {
    const results = await db
      .select()
      .from(goalsPresets)
      .where(eq(goalsPresets.mode, params.mode))
      .orderBy(
        sql`CASE name 
          WHEN 'conservative' THEN 1 
          WHEN 'baseline' THEN 2 
          WHEN 'optimistic' THEN 3 
          WHEN 'maximum' THEN 4 
          WHEN 'custom' THEN 5 
          END`
      );
    return results;
  }

  async getActiveGoalsPreset(params: { mode: 'live' | 'paper' }): Promise<GoalsPresets | null> {
    const [result] = await db
      .select()
      .from(goalsPresets)
      .where(and(
        eq(goalsPresets.mode, params.mode),
        eq(goalsPresets.isActive, true)
      ));
    return result || null;
  }

  async selectGoalsPreset(params: { mode: 'live' | 'paper'; presetName: string }): Promise<{ preset: GoalsPresets; guardrails: GuardrailsV2 }> {
    // Step 1: Deactivate all presets for this mode
    await db
      .update(goalsPresets)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(goalsPresets.mode, params.mode));

    // Step 2: Activate the selected preset
    const [preset] = await db
      .update(goalsPresets)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(
        eq(goalsPresets.mode, params.mode),
        eq(goalsPresets.name, params.presetName as any)
      ))
      .returning();

    if (!preset) {
      throw new Error(`Preset ${params.presetName} not found for mode ${params.mode}`);
    }

    // Step 3: Apply preset values to guardrails_v2
    const guardrailsUpdate: InsertGuardrailsV2 = {
      mode: params.mode,
      portfolioRiskPerTradePct: preset.portfolioRiskPerTradePct,
      dailyLossKillSwitchPct: preset.dailyLossKillSwitchPct,
      symbolCooldownMinutes: preset.symbolCooldownMinutes,
      maxOpenPositions: preset.maxOpenPositions,
      tunedByLatti: params.presetName !== 'custom',
      isManualOverride: params.presetName === 'custom'
    };

    const guardrails = await this.upsertGuardrailsV2(guardrailsUpdate);

    return { preset, guardrails };
  }

  async getGuardrailsCompliance(params: { mode: 'live' | 'paper' }): Promise<any> {
    // Get active preset
    const activePreset = await this.getActiveGoalsPreset(params);
    
    // Get current guardrails
    const guardrails = await this.getGuardrailsV2(params);
    
    if (!guardrails) {
      return null;
    }

    // Validate coherency using guardrail policy
    const { guardrailPolicy } = await import('./services/guardrail-policy');
    const effectiveValues = guardrailPolicy.getEffective(guardrails);
    const coherencyResult = guardrailPolicy.validate(effectiveValues);
    const isKillSwitchTripped = await guardrailPolicy.isKillSwitchTripped(params.mode);

    return {
      mode: params.mode,
      activePreset: activePreset?.name || 'custom',
      coherency: coherencyResult,
      killSwitchTripped: isKillSwitchTripped
    };
  }

  // Phase 6: Goals Learning Metrics methods
  async getLearningSummary(params: { mode: 'live' | 'paper' }): Promise<any> {
    const queryResult = await db.execute(
      sql`SELECT * FROM v_goals_learning_summary WHERE mode = ${params.mode}`
    );
    const result = queryResult.rows?.[0];
    return result || null;
  }

  async upsertLearningMetric(data: InsertGoalsLearningMetrics): Promise<GoalsLearningMetrics> {
    // Check if metric exists for this mode and date
    const [existing] = await db
      .select()
      .from(goalsLearningMetrics)
      .where(and(
        eq(goalsLearningMetrics.mode, data.mode),
        eq(goalsLearningMetrics.date, data.date || sql`CURRENT_DATE`)
      ));

    const updateData = {
      ...data,
      updatedAt: new Date()
    };

    if (existing) {
      const [result] = await db
        .update(goalsLearningMetrics)
        .set(updateData)
        .where(eq(goalsLearningMetrics.id, existing.id))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(goalsLearningMetrics).values(updateData).returning();
      return result;
    }
  }

  async updatePresetLearningStatus(params: { mode: 'live' | 'paper'; presetName: string; lastAdjustedAt: Date; learningActive: boolean }): Promise<GoalsPresets> {
    const [result] = await db
      .update(goalsPresets)
      .set({
        lastAdjustedAt: params.lastAdjustedAt,
        learningActive: params.learningActive,
        updatedAt: new Date()
      })
      .where(and(
        eq(goalsPresets.mode, params.mode),
        eq(goalsPresets.name, params.presetName as any)
      ))
      .returning();

    if (!result) {
      throw new Error(`Preset ${params.presetName} not found for mode ${params.mode}`);
    }

    return result;
  }

  // Screener filters methods (global settings per mode - Phase 27.F.15.A)
  // Batch 19G: filterPath support — defaults to 'active_quant' for backward compatibility
  // B79.0n.STORAGE (2026-05-21): assetClass is REQUIRED. The B79.0m.a backward-compat
  // default to 'crypto_spot' was the silent-fallback footgun that routed all xStock
  // SQE cycles to crypto thresholds. Removed. Callers must pass explicit assetClass.
  async getScreenerFilters(params: { mode: 'live' | 'paper'; assetClass: AssetClass; filterPath?: string }): Promise<ScreenerFilters | null> {
    const filterPath = params.filterPath || 'active_quant';
    const [result] = await db
      .select()
      .from(screenerFilters)
      .where(and(
        eq(screenerFilters.mode, params.mode),
        eq(screenerFilters.filterPath, filterPath),
        eq(screenerFilters.assetClass, params.assetClass)
      ));
    return result || null;
  }

  // B79.0n.STORAGE (2026-05-21): canonical crypto_spot baseline accessor for UI display
  // and diagnostic reference panels. NEVER use this for runtime signal/screener/SQE
  // routing — use getScreenerFilters({mode, assetClass, ...}) with the explicit asset
  // class derived from the signal/cycle context. The whole point of B79.0n.STORAGE is
  // preventing the silent-fallback footgun this helper could become if misused.
  async getCanonicalScreenerConfig(params: { mode: 'live' | 'paper'; filterPath?: string }): Promise<ScreenerFilters | null> {
    return this.getScreenerFilters({ ...params, assetClass: 'crypto_spot' });
  }

  // Batch 19G: Upsert by (mode, filterPath) composite key.
  // B79.0n.STORAGE (2026-05-21 + Langston Step 4 BLOCKER fix): assetClass is REQUIRED
  // on the data shape AND added to the UPDATE WHERE clause. Without this, the seed
  // migration creates 2 rows per (mode, filterPath) (crypto_spot + xstock_spot) and
  // a `(mode, filterPath)`-only WHERE matches BOTH rows — either violates the
  // (mode, asset_class, filter_path) unique index OR silently cross-corrupts data
  // between the two classes. This was exactly the silent-default footgun this batch
  // exists to eliminate.
  async upsertScreenerFilters(
    data: Omit<InsertScreenerFilters, 'userId'> & { assetClass: AssetClass; lastUpdatedBy?: string; filterPath?: string }
  ): Promise<ScreenerFilters> {
    const filterPath = data.filterPath || 'active_quant';
    const existing = await this.getScreenerFilters({
      mode: data.mode,
      assetClass: data.assetClass,
      filterPath
    });

    const updateData = {
      ...data,
      filterPath,
      updatedAt: new Date()
    };

    if (existing) {
      const [result] = await db
        .update(screenerFilters)
        .set(updateData)
        .where(and(
          eq(screenerFilters.mode, data.mode),
          eq(screenerFilters.assetClass, data.assetClass),
          eq(screenerFilters.filterPath, filterPath)
        ))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(screenerFilters).values(updateData).returning();
      return result;
    }
  }

  // Phase 27.F.13.L.1: System Settings methods
  async getSystemSetting(key: string): Promise<string | null> {
    const [result] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return result?.value || null;
  }

  async setSystemSetting(key: string, value: string, updatedBy?: string): Promise<void> {
    await db
      .insert(systemSettings)
      .values({ key, value, updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date(), updatedBy }
      });
  }

  async getPrimaryOperatorUserId(): Promise<string | null> {
    return this.getSystemSetting('PRIMARY_OPERATOR_USER_ID');
  }

  // Filter diagnostics methods (Phase 27.F.15.A - GLOBAL)
  async getFilterDiagnostics(params: { mode: 'live' | 'paper'; hours?: number }): Promise<any[]> {
    const hours = params.hours || 24;
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const results = await db
      .select()
      .from(filterDiagnostics)
      .where(
        and(
          eq(filterDiagnostics.mode, params.mode),
          gte(filterDiagnostics.timestamp, cutoffTime)
        )
      )
      .orderBy(desc(filterDiagnostics.timestamp));
      
    return results;
  }

  async logFilterDiagnostic(data: { 
    mode: 'live' | 'paper'; 
    pairsScanned: number; 
    eligiblePairs: number; 
    topFailureReason: string; 
    failurePercent: string 
  }): Promise<void> {
    await db.insert(filterDiagnostics).values({
      mode: data.mode,
      pairsScanned: data.pairsScanned,
      eligiblePairs: data.eligiblePairs,
      topFailureReason: data.topFailureReason,
      failurePercent: data.failurePercent
    });
  }

  // Phase 41F-L.E2E: Lineage tracking methods
  async createLineageEvent(event: {
    traceId: string;
    stage: string;
    symbol: string | null;
    mode: 'live' | 'paper';
    timestamp: Date;
    metadata: Record<string, any>;
  }): Promise<void> {
    await db.insert(telemetryLineage).values({
      traceId: event.traceId,
      stage: event.stage,
      symbol: event.symbol,
      mode: event.mode,
      timestamp: event.timestamp,
      metadata: event.metadata as any
    });
  }

  async getLineageByTraceId(traceId: string): Promise<Array<{
    traceId: string;
    stage: string;
    symbol: string | null;
    mode: string;
    timestamp: Date;
    metadata: any;
  }>> {
    const results = await db
      .select()
      .from(telemetryLineage)
      .where(eq(telemetryLineage.traceId, traceId))
      .orderBy(asc(telemetryLineage.timestamp));

    return results.map(r => ({
      traceId: r.traceId,
      stage: r.stage,
      symbol: r.symbol,
      mode: r.mode as 'live' | 'paper',
      timestamp: r.timestamp,
      metadata: r.metadata
    }));
  }

  async getIncompleteLineageTraces(since: Date): Promise<string[]> {
    // Find traces that don't have a portfolio_update event
    const allTraces = await db
      .selectDistinct({ traceId: telemetryLineage.traceId })
      .from(telemetryLineage)
      .where(gte(telemetryLineage.timestamp, since));

    const completedTraces = await db
      .selectDistinct({ traceId: telemetryLineage.traceId })
      .from(telemetryLineage)
      .where(
        and(
          gte(telemetryLineage.timestamp, since),
          eq(telemetryLineage.stage, 'portfolio_update')
        )
      );

    const completedSet = new Set(completedTraces.map(t => t.traceId));
    return allTraces
      .map(t => t.traceId)
      .filter(id => !completedSet.has(id));
  }

  // Filter calibration methods (Phase 27.F.15.A - GLOBAL)
  async getLatestCalibration(params: { mode: 'live' | 'paper'; maxAgeHours?: number }): Promise<FilterCalibrationLog | null> {
    const maxAgeHours = params.maxAgeHours || 24;
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    const [result] = await db
      .select()
      .from(filterCalibrationLog)
      .where(
        and(
          eq(filterCalibrationLog.mode, params.mode),
          gte(filterCalibrationLog.timestamp, cutoffTime)
        )
      )
      .orderBy(desc(filterCalibrationLog.timestamp))
      .limit(1);
    
    return result || null;
  }

  async getLatestPaperCalibration(): Promise<FilterCalibrationLog | null> {
    const [result] = await db
      .select()
      .from(filterCalibrationLog)
      .where(eq(filterCalibrationLog.mode, 'paper'))
      .orderBy(desc(filterCalibrationLog.timestamp))
      .limit(1);
    
    return result || null;
  }

  async getCalibrationWithFallback(mode: 'live' | 'paper', maxAgeHours = 24): Promise<FilterCalibrationLog | null> {
    let calibration = await this.getLatestCalibration({ mode, maxAgeHours });
    
    if (!calibration && mode === 'live') {
      console.log(`[Storage] No recent Live calibration, falling back to Paper mode`);
      calibration = await this.getLatestPaperCalibration();
      if (calibration) {
        calibration = { ...calibration, source: 'paper-fallback' };
      }
    }
    
    return calibration;
  }

  async createCalibration(data: InsertFilterCalibrationLog): Promise<FilterCalibrationLog> {
    const [result] = await db.insert(filterCalibrationLog).values(data).returning();
    return result;
  }

  async getRecentCalibrations(params: { mode: 'live' | 'paper'; limit?: number; maxAgeHours?: number }): Promise<FilterCalibrationLog[]> {
    const limit = params.limit || 10;
    const conditions = [eq(filterCalibrationLog.mode, params.mode)];
    
    if (params.maxAgeHours) {
      const cutoffTime = new Date(Date.now() - params.maxAgeHours * 60 * 60 * 1000);
      conditions.push(gte(filterCalibrationLog.timestamp, cutoffTime));
    }
    
    const results = await db
      .select()
      .from(filterCalibrationLog)
      .where(and(...conditions))
      .orderBy(desc(filterCalibrationLog.timestamp))
      .limit(limit);
    
    return results;
  }

  // Screener results methods (Phase 27.F.15.A - GLOBAL)
  async getScreenerResults(params: { mode: 'live' | 'paper'; limit?: number }): Promise<ScreenerResult[]> {
    const results = await db
      .select()
      .from(screenerResults)
      .where(eq(screenerResults.mode, params.mode))
      .orderBy(desc(screenerResults.scannedAt))
      .limit(params.limit || 50);
    
    return results;
  }

  async createScreenerResults(data: InsertScreenerResult[]): Promise<void> {
    if (data.length > 0) {
      await db.insert(screenerResults).values(data);
    }
  }

  async deleteOldScreenerResults(params: { mode: 'live' | 'paper'; beforeDate: Date }): Promise<void> {
    await db
      .delete(screenerResults)
      .where(
        and(
          eq(screenerResults.mode, params.mode),
          lte(screenerResults.scannedAt, params.beforeDate)
        )
      );
  }

  // Strategy settings methods (Phase 8.5 Addendum K.3 - Global Context)
  // B79.0n.STRATEGY (2026-05-24): assetClass parameter added to all method signatures.
  // Existing callers MUST pass assetClass (REQUIRED at TS-compile per Langston Q-F gate).
  // List signature defaults assetClass to undefined → returns all classes for back-compat
  // with callers that legitimately want cross-class iteration (e.g., admin UI).
  async getStrategySettings(params: { globalContextId?: string; userId?: string; mode: 'live' | 'paper'; strategy: string; assetClass: string }): Promise<StrategySettings | null> {
    const contextId = params.globalContextId || 'default';
    const [result] = await db
      .select()
      .from(strategySettings)
      .where(
        and(
          eq(strategySettings.globalContextId, contextId),
          eq(strategySettings.mode, params.mode),
          eq(strategySettings.strategy, params.strategy as any),
          eq(strategySettings.assetClass, params.assetClass),
        )
      );
    return result || null;
  }

  async listStrategySettings(params: { globalContextId?: string; userId?: string; mode: 'live' | 'paper'; assetClass?: string }): Promise<StrategySettings[]> {
    const contextId = params.globalContextId || 'default';
    const whereClauses = [
      eq(strategySettings.globalContextId, contextId),
      eq(strategySettings.mode, params.mode),
    ];
    if (params.assetClass !== undefined) {
      whereClauses.push(eq(strategySettings.assetClass, params.assetClass));
    }
    return await db
      .select()
      .from(strategySettings)
      .where(and(...whereClauses))
      .orderBy(strategySettings.strategy);
  }

  async upsertStrategySettings(row: InsertStrategySettings): Promise<StrategySettings> {
    const [result] = await db
      .insert(strategySettings)
      .values(row)
      .onConflictDoUpdate({
        target: [strategySettings.globalContextId, strategySettings.mode, strategySettings.strategy, strategySettings.assetClass],
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

  async listStrategySettingsAudit(params: { limit?: number }): Promise<StrategySettingsAudit[]> {
    const limit = params.limit || 50;
    return await db
      .select()
      .from(strategySettingsAudit)
      .orderBy(desc(strategySettingsAudit.createdAt))
      .limit(limit);
  }

  // Watchlist methods (Phase 27.F.15.A - GLOBAL)
  async getWatchlist(params: { mode: 'live' | 'paper' }): Promise<WatchlistPair[]> {
    return await db
      .select()
      .from(watchlistPairs)
      .where(and(
        eq(watchlistPairs.mode, params.mode),
        eq(watchlistPairs.isActive, true)
      ))
      .orderBy(desc(watchlistPairs.addedAt));
  }

  async addWatchlistPair(pair: InsertWatchlistPair): Promise<WatchlistPair> {
    const [result] = await db.insert(watchlistPairs)
      .values(pair)
      .onConflictDoUpdate({
        target: [watchlistPairs.mode, watchlistPairs.symbol],
        set: {
          volume24h: pair.volume24h,
          currentPrice: pair.currentPrice,
          vwap: pair.vwap,
          dailyRange: pair.dailyRange,
          lastScanned: pair.lastScanned || new Date()
        }
      })
      .returning();
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

  // Trading signals methods
  async saveTradingSignal(signal: InsertTradingSignal): Promise<TradingSignal | null> {
    // Phase 27.F.14.D: TRUE no-op if already expired - skip database write entirely
    if (signal.expiresAt && signal.expiresAt <= new Date()) {
      console.log(`[SignalManager] Skipped insert — expired (${signal.symbol}, ${signal.strategy})`);
      return null; // True skip - no database write
    }
    
    // Delete any existing active signals for same symbol+strategy+mode to prevent duplicates (GLOBAL)
    const deletedRows = await db
      .delete(tradingSignals)
      .where(and(
        eq(tradingSignals.mode, signal.mode),
        eq(tradingSignals.symbol, signal.symbol),
        eq(tradingSignals.strategy, signal.strategy as any),
        eq(tradingSignals.status, 'active')
      ))
      .returning();
    
    if (deletedRows.length > 0) {
      console.log(`[SignalManager] Replaced ${deletedRows.length} duplicate(s) for ${signal.symbol}/${signal.strategy} in mode=${signal.mode}`);
    }
    
    const [result] = await db.insert(tradingSignals).values(signal).returning();
    return result;
  }

  async getTradingSignals(params: { mode: 'live' | 'paper'; status?: string }): Promise<TradingSignal[]> {
    // REB 8.8.3-I: Side-effect purge of expired signals SCOPED to mode only (GLOBAL)
    try {
      const purgedRows = await db
        .delete(tradingSignals)
        .where(and(
          eq(tradingSignals.mode, params.mode),
          lte(tradingSignals.expiresAt, new Date())
        ))
        .returning();
      
      if (purgedRows.length > 0) {
        console.log(`[8.8.3-I][RTB_TTL_EXPIRE] Purged ${purgedRows.length} expired signals on fetch (mode=${params.mode})`);
      }
    } catch (error) {
      // Non-critical, continue with query
    }
    
    const conditions = [
      eq(tradingSignals.mode, params.mode),
      gt(tradingSignals.expiresAt, new Date()) // Phase 27.F.14.D: Filter expired
    ];
    
    if (params.status) {
      conditions.push(eq(tradingSignals.status, params.status));
    }
    
    return await db
      .select()
      .from(tradingSignals)
      .where(and(...conditions))
      .orderBy(desc(tradingSignals.detectedAt));
  }

  async updateSignalStatus(id: string, status: string, executedAt?: Date): Promise<TradingSignal> {
    const updates: Partial<TradingSignal> = { status };
    if (executedAt) {
      updates.executedAt = executedAt;
    }
    
    const [result] = await db
      .update(tradingSignals)
      .set(updates)
      .where(eq(tradingSignals.id, id))
      .returning();
    return result;
  }

  async expireOldSignals(params: { mode: 'live' | 'paper'; beforeDate: Date }): Promise<void> {
    await db
      .update(tradingSignals)
      .set({ status: 'expired' })
      .where(and(
        eq(tradingSignals.mode, params.mode),
        eq(tradingSignals.status, 'active'),
        lte(tradingSignals.expiresAt, params.beforeDate)
      ));
  }
  
  // NEW: Expire ALL signals past their expiration time (across all users/modes)
  async expireAllExpiredSignals(): Promise<number> {
    const result = await db
      .update(tradingSignals)
      .set({ status: 'expired' })
      .where(and(
        eq(tradingSignals.status, 'active'),
        lte(tradingSignals.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }
  
  // REB 8.8.3-I: Clear all RTB signals for a mode (used during simulation reset)
  async deleteAllTradingSignals(mode: 'live' | 'paper'): Promise<number> {
    const result = await db
      .delete(tradingSignals)
      .where(eq(tradingSignals.mode, mode))
      .returning();
    console.log(`[8.8.3-I][RTB_RESET] Cleared ${result.length} signals for mode=${mode}`);
    return result.length;
  }
  
  // REB 8.8.3-I: Consume RTB signal when trade opens (mark as executed)
  async consumeSignalBySymbol(mode: 'live' | 'paper', symbol: string): Promise<TradingSignal | null> {
    const [result] = await db
      .update(tradingSignals)
      .set({ 
        status: 'executed',
        executedAt: new Date()
      })
      .where(and(
        eq(tradingSignals.mode, mode),
        eq(tradingSignals.symbol, symbol),
        eq(tradingSignals.status, 'active')
      ))
      .returning();
    
    if (result) {
      console.log(`[8.8.3-I][RTB_CONSUMED] Signal consumed for ${symbol} in mode=${mode}`);
    }
    return result || null;
  }

  // Phase 27.F.15.B.3: Mode-based trade methods (GLOBAL per mode)
  async getTrades(
    mode: 'live' | 'paper',
    filters?: { status?: string; symbol?: string; strategy?: string; limit?: number }
  ): Promise<Trade[]> {
    const conditions: any[] = [eq(trades.mode, mode)];
    
    if (filters?.status) {
      conditions.push(eq(trades.status, filters.status as any));
    }
    if (filters?.symbol) {
      conditions.push(eq(trades.symbol, filters.symbol));
    }
    if (filters?.strategy) {
      conditions.push(eq(trades.strategy, filters.strategy as any));
    }
    
    let query = db.select().from(trades).where(and(...conditions));
    query = query.orderBy(desc(trades.entryTime));
    
    if (filters?.limit) {
      return await query.limit(filters.limit);
    }
    
    return await query;
  }

  async getActiveTrades(mode: 'live' | 'paper'): Promise<Trade[]> {
    return await db
      .select()
      .from(trades)
      .where(and(
        eq(trades.status, "open"),
        eq(trades.mode, mode)
      ))
      .orderBy(desc(trades.entryTime));
  }

  /**
   * Directive 8.8.4-A3: Check if an active trade exists for a given pair (symbol)
   * Directive 8.8.8: Extended to check paper_sim_positions for paper mode
   * Used for pair-level duplicate validation across active trades
   * 
   * @param symbol - The trading pair in BASE/QUOTE format (e.g., 'BTC/USD')
   * @param mode - Trading mode ('paper' or 'live')
   * @returns true if an open trade exists for this pair
   */
  async hasActivePair(symbol: string, mode: 'live' | 'paper'): Promise<boolean> {
    // Directive 8.8.4-A3.R1: Normalize pair key for consistent comparison
    const normalizedSymbol = symbol.includes('/') 
      ? symbol.split('/').map(s => s.trim().toUpperCase()).join('/')
      : symbol.trim().toUpperCase();
    
    // Directive 8.8.8: For paper mode, check paper_sim_positions table first
    // Paper simulation positions are stored separately from the trades table
    if (mode === 'paper') {
      const paperResult = await db
        .select({ id: activeOpenPositions.id })
        .from(activeOpenPositions)
        .where(eq(activeOpenPositions.symbol, normalizedSymbol))
        .limit(1);
      
      if (paperResult.length > 0) {
        console.log(`[8.8.8][hasActivePair] FOUND open paper position for ${normalizedSymbol}`);
        return true;
      }
    }
    
    // Check trades table (used by live mode, and as fallback for paper mode)
    const result = await db
      .select({ id: trades.id })
      .from(trades)
      .where(and(
        eq(trades.symbol, normalizedSymbol),
        eq(trades.status, "open"),
        eq(trades.mode, mode)
      ))
      .limit(1);
    
    return result.length > 0;
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

  // Phase 27.F.13.F: Cleanup method for old closed live trades
  async cleanOldLiveTrades(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await db
      .delete(trades)
      .where(and(
        eq(trades.status, 'closed'),
        lte(trades.exitTime, cutoffDate)
      ))
      .returning();
    
    return result.length;
  }

  // Phase 27.F.13.F: Cleanup method for stale watchlist pairs
  async cleanStaleWatchlistPairs(minutesOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setMinutes(cutoffDate.getMinutes() - minutesOld);
    
    const result = await db
      .delete(watchlistPairs)
      .where(and(
        lte(watchlistPairs.lastScanned, cutoffDate),
        eq(watchlistPairs.isActive, true)
      ))
      .returning();
    
    return result.length;
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

  // Context-specific chats (Goals, Guardrails, Screener, Strategies)
  async getContextChats(userId: string, context: string): Promise<ContextChat[]> {
    return await db
      .select()
      .from(contextChats)
      .where(and(eq(contextChats.userId, userId), eq(contextChats.context, context)))
      .orderBy(asc(contextChats.timestamp));
  }

  async saveContextChat(chat: InsertContextChat): Promise<ContextChat> {
    const [result] = await db.insert(contextChats).values(chat).returning();
    return result;
  }

  // Phase 7.1c Deliverable 5: Delete context-specific chat history
  async deleteContextChats(userId: string, context: string): Promise<void> {
    await db.delete(contextChats)
      .where(and(eq(contextChats.userId, userId), eq(contextChats.context, context)));
  }

  // AI Orchestrator Logs
  async createOrchestratorLog(log: InsertAIOrchestratorLog): Promise<AIOrchestratorLog> {
    const [result] = await db.insert(aiOrchestratorLogs).values(log).returning();
    return result;
  }

  async getOrchestratorLogs(userId: string | null, limit: number = 50): Promise<AIOrchestratorLog[]> {
    const baseQuery = db.select().from(aiOrchestratorLogs);
    
    const finalQuery = userId 
      ? baseQuery.where(eq(aiOrchestratorLogs.userId, userId))
      : baseQuery;
    
    return await finalQuery
      .orderBy(desc(aiOrchestratorLogs.timestamp))
      .limit(limit);
  }

  async getOrchestratorLogsByCategory(userId: string | null, category: string, limit: number = 50): Promise<AIOrchestratorLog[]> {
    const conditions = [eq(aiOrchestratorLogs.category, category)];
    
    if (userId) {
      conditions.push(eq(aiOrchestratorLogs.userId, userId));
    }
    
    return await db
      .select()
      .from(aiOrchestratorLogs)
      .where(and(...conditions))
      .orderBy(desc(aiOrchestratorLogs.timestamp))
      .limit(limit);
  }

  async getOrchestratorLogsByStatus(userId: string | null, status: string, limit: number = 50): Promise<AIOrchestratorLog[]> {
    const conditions = [eq(aiOrchestratorLogs.status, status)];
    
    if (userId) {
      conditions.push(eq(aiOrchestratorLogs.userId, userId));
    }
    
    return await db
      .select()
      .from(aiOrchestratorLogs)
      .where(and(...conditions))
      .orderBy(desc(aiOrchestratorLogs.timestamp))
      .limit(limit);
  }

  async updateOrchestratorLog(id: number, updates: Partial<AIOrchestratorLog>): Promise<AIOrchestratorLog> {
    // Remove timestamp from updates to preserve original creation time
    const { timestamp, ...safeUpdates } = updates;
    
    const [result] = await db
      .update(aiOrchestratorLogs)
      .set(safeUpdates)
      .where(eq(aiOrchestratorLogs.id, id))
      .returning();
    return result;
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
  // CONTRACT: rows are returned in timestamp ASC order (oldest→newest) — consumers
  // must take recent windows from the TAIL (slice(-n)), never the head (#690).
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

  // AI Transparency log methods
  async createTransparencyLog(log: InsertAITransparencyLog): Promise<AITransparencyLog> {
    const [result] = await db.insert(aiTransparencyLog).values(log).returning();
    return result;
  }

  async getTransparencyLogs(
    filters?: { userId?: string; taskName?: string; mode?: 'live' | 'paper'; limit?: number }
  ): Promise<AITransparencyLog[]> {
    const conditions = [];
    
    if (filters?.userId) {
      conditions.push(eq(aiTransparencyLog.userId, filters.userId));
    }
    if (filters?.taskName) {
      conditions.push(eq(aiTransparencyLog.taskName, filters.taskName));
    }
    if (filters?.mode) {
      conditions.push(eq(aiTransparencyLog.mode, filters.mode));
    }
    
    const query = db.select().from(aiTransparencyLog)
      .orderBy(desc(aiTransparencyLog.executedAt));
    
    if (conditions.length > 0) {
      const limitedQuery = query.where(and(...conditions));
      return await (filters?.limit ? limitedQuery.limit(filters.limit) : limitedQuery);
    }
    
    return await (filters?.limit ? query.limit(filters.limit) : query);
  }

  async getRecentTransparencyLogs(limit = 50): Promise<AITransparencyLog[]> {
    return await db
      .select()
      .from(aiTransparencyLog)
      .orderBy(desc(aiTransparencyLog.executedAt))
      .limit(limit);
  }

  async getSystemSchedulerLogs(limit = 50): Promise<AITransparencyLog[]> {
    // Fetch only system-wide scheduler logs from the scheduler registry
    // Known scheduler tasks: AI Summary, Market Scan, Screener Recalibration, System Health Check
    const schedulerTaskNames = ['AI Summary', 'Market Scan', 'Screener Recalibration', 'System Health Check'];
    
    return await db
      .select()
      .from(aiTransparencyLog)
      .where(sql`${aiTransparencyLog.userId} IS NULL AND ${aiTransparencyLog.taskName} IN (${sql.join(schedulerTaskNames.map(name => sql`${name}`), sql`, `)})`)
      .orderBy(desc(aiTransparencyLog.executedAt))
      .limit(limit);
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

  // Trading audit log methods (Phase 27.F.6)
  async createTradingAuditLog(data: { userId: string; action: string; mode: string; triggeredBy?: string; metadata?: any }): Promise<void> {
    await db.insert(tradingAuditLog).values({
      userId: data.userId,
      action: data.action,
      mode: data.mode,
      triggeredBy: data.triggeredBy || 'manual',
      metadata: data.metadata
    });
  }

  async getTradingAuditLogs(userId: string, limit: number = 50): Promise<any[]> {
    return await db
      .select()
      .from(tradingAuditLog)
      .where(eq(tradingAuditLog.userId, userId))
      .orderBy(desc(tradingAuditLog.createdAt))
      .limit(limit);
  }

  // Task 8: Safety Telemetry methods
  async createSafetyTelemetry(telemetry: InsertSafetyTelemetry): Promise<SafetyTelemetry> {
    const [result] = await db.insert(safetyTelemetry).values(telemetry).returning();
    return result;
  }

  async getSafetyTelemetry(
    userId: string,
    filters?: { 
      mode?: 'live' | 'paper';
      checkType?: string;
      checkPassed?: boolean;
      limit?: number;
    }
  ): Promise<SafetyTelemetry[]> {
    const conditions = [eq(safetyTelemetry.userId, userId)];
    
    if (filters?.mode) {
      conditions.push(eq(safetyTelemetry.mode, filters.mode));
    }
    if (filters?.checkType) {
      conditions.push(eq(safetyTelemetry.checkType, filters.checkType));
    }
    if (filters?.checkPassed !== undefined) {
      conditions.push(eq(safetyTelemetry.checkPassed, filters.checkPassed));
    }
    
    const query = db
      .select()
      .from(safetyTelemetry)
      .where(and(...conditions))
      .orderBy(desc(safetyTelemetry.timestamp));
    
    return await (filters?.limit ? query.limit(filters.limit) : query);
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

  async getDailyBriefs(userId: string, filters?: { status?: string; limit?: number; startDate?: string; endDate?: string }): Promise<DailyBrief[]> {
    const conditions = [eq(dailyBriefs.userId, userId)];
    
    if (filters?.status) {
      conditions.push(eq(dailyBriefs.status, filters.status as any));
    }
    
    if (filters?.startDate) {
      conditions.push(gte(dailyBriefs.date, filters.startDate));
    }
    
    if (filters?.endDate) {
      conditions.push(lte(dailyBriefs.date, filters.endDate));
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

  // Paper trading methods (Phase 27.F.15.A - GLOBAL, isolated from live)
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

  async getAllPaperTrades(): Promise<PaperTrade[]> {
    return await db
      .select()
      .from(paperTrades)
      .orderBy(desc(paperTrades.entryTime));
  }

  async getOpenPaperTrades(): Promise<PaperTrade[]> {
    return await db
      .select()
      .from(paperTrades)
      .where(eq(paperTrades.status, 'open'))
      .orderBy(desc(paperTrades.entryTime));
  }

  async deleteAllPaperTrades(): Promise<void> {
    await db.delete(paperTrades);
  }

  // P19-B-RENAME Wave-1 (Kyle ruling, rule 18): Walter-era paper daily-brief +
  // paper AI-report method implementations deleted with their tables.

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

  // Learning source methods
  async getLearningSources(userId: string): Promise<LearningSource[]> {
    return await db
      .select()
      .from(learningSources)
      .where(eq(learningSources.userId, userId))
      .orderBy(desc(learningSources.weight));
  }

  async getLearningSource(userId: string, sourceName: string): Promise<LearningSource | undefined> {
    const [result] = await db
      .select()
      .from(learningSources)
      .where(and(
        eq(learningSources.userId, userId),
        eq(learningSources.sourceName, sourceName)
      ));
    return result || undefined;
  }

  async createLearningSource(source: InsertLearningSource): Promise<LearningSource> {
    const [result] = await db.insert(learningSources).values(source).returning();
    return result;
  }

  async updateLearningSource(id: string, updates: Partial<LearningSource>): Promise<LearningSource> {
    const [result] = await db
      .update(learningSources)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(learningSources.id, id))
      .returning();
    return result;
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

  // Intraday adjustment methods
  async createIntradayAdjustment(adjustment: InsertIntradayAdjustment): Promise<IntradayAdjustment> {
    const [result] = await db.insert(intradayAdjustments).values(adjustment).returning();
    return result;
  }

  async getIntradayAdjustments(userId: string, filters?: { mode?: string; hours?: number; limit?: number }): Promise<IntradayAdjustment[]> {
    const conditions = [eq(intradayAdjustments.userId, userId)];
    
    if (filters?.mode) {
      conditions.push(eq(intradayAdjustments.mode, filters.mode as any));
    }
    if (filters?.hours) {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - filters.hours);
      conditions.push(gte(intradayAdjustments.timestamp, cutoffTime));
    }
    
    const query = db
      .select()
      .from(intradayAdjustments)
      .where(and(...conditions))
      .orderBy(desc(intradayAdjustments.timestamp));
    
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    
    return await query;
  }

  // AI lesson methods
  async createAILesson(lesson: InsertAILesson): Promise<AILesson> {
    const [result] = await db.insert(aiLessons).values(lesson).returning();
    return result;
  }

  async getAILessons(userId: string, filters?: { mode?: string; strategy?: string; hours?: number; limit?: number }): Promise<AILesson[]> {
    const conditions = [eq(aiLessons.userId, userId)];
    
    if (filters?.mode) {
      conditions.push(eq(aiLessons.mode, filters.mode as any));
    }
    if (filters?.strategy) {
      conditions.push(eq(aiLessons.strategy, filters.strategy as any));
    }
    if (filters?.hours) {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - filters.hours);
      conditions.push(gte(aiLessons.timestamp, cutoffTime));
    }
    
    const query = db
      .select()
      .from(aiLessons)
      .where(and(...conditions))
      .orderBy(desc(aiLessons.timestamp));
    
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    
    return await query;
  }

  // Portfolio adjustment methods
  async createPortfolioAdjustment(adjustment: InsertPortfolioAdjustment): Promise<PortfolioAdjustment> {
    const [result] = await db.insert(portfolioAdjustments).values(adjustment).returning();
    return result;
  }

  async getPortfolioAdjustments(filters?: { mode?: string; hours?: number; limit?: number }): Promise<PortfolioAdjustment[]> {
    const conditions: any[] = [];
    
    if (filters?.mode) {
      conditions.push(eq(portfolioAdjustments.mode, filters.mode as any));
    }
    if (filters?.hours) {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - filters.hours);
      conditions.push(gte(portfolioAdjustments.timestamp, cutoffTime));
    }
    
    const query = db
      .select()
      .from(portfolioAdjustments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(portfolioAdjustments.timestamp));
    
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    
    return await query;
  }

  // Goals Engine methods - Live mode (Phase 27.F.15.A - GLOBAL)
  async getGoalsLive(): Promise<GoalLive[]> {
    return await db
      .select()
      .from(goalsLive)
      .orderBy(goalsLive.metricName);
  }

  async getGoalLive(metricName: string): Promise<GoalLive | undefined> {
    const [result] = await db
      .select()
      .from(goalsLive)
      .where(eq(goalsLive.metricName, metricName))
      .limit(1);
    return result || undefined;
  }

  async createGoalLive(goal: InsertGoalLive): Promise<GoalLive> {
    const metricKey = goal.metricKey || canonicalizeMetricName(goal.metricName);
    const [result] = await db.insert(goalsLive).values({ ...goal, metricKey }).returning();
    return result;
  }

  async updateGoalLive(id: string, updates: Partial<GoalLive>): Promise<GoalLive> {
    const [result] = await db
      .update(goalsLive)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(goalsLive.id, id))
      .returning();
    return result;
  }

  async upsertGoalLive(goal: InsertGoalLive): Promise<GoalLive> {
    // Phase 27.F: Use metric_key for lookups to prevent duplicates
    const metricKey = goal.metricKey || canonicalizeMetricName(goal.metricName);
    const [existing] = await db
      .select()
      .from(goalsLive)
      .where(eq(goalsLive.metricKey, metricKey))
      .limit(1);
    
    if (existing) {
      return this.updateGoalLive(existing.id, { ...goal, metricKey });
    } else {
      return this.createGoalLive({ ...goal, metricKey });
    }
  }

  async deleteGoalLive(id: string): Promise<void> {
    await db.delete(goalsLive).where(eq(goalsLive.id, id));
  }

  // Goals Engine methods - Paper mode (Phase 27.F.15.A - GLOBAL)
  async getGoalsPaper(): Promise<GoalPaper[]> {
    return await db
      .select()
      .from(goalsPaper)
      .orderBy(goalsPaper.metricName);
  }

  async getGoalPaper(metricName: string): Promise<GoalPaper | undefined> {
    const [result] = await db
      .select()
      .from(goalsPaper)
      .where(eq(goalsPaper.metricName, metricName))
      .limit(1);
    return result || undefined;
  }

  async createGoalPaper(goal: InsertGoalPaper): Promise<GoalPaper> {
    const metricKey = goal.metricKey || canonicalizeMetricName(goal.metricName);
    const [result] = await db.insert(goalsPaper).values({ ...goal, metricKey }).returning();
    return result;
  }

  async updateGoalPaper(id: string, updates: Partial<GoalPaper>): Promise<GoalPaper> {
    const [result] = await db
      .update(goalsPaper)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(goalsPaper.id, id))
      .returning();
    return result;
  }

  async upsertGoalPaper(goal: InsertGoalPaper): Promise<GoalPaper> {
    // Phase 27.F: Use metric_key for lookups to prevent duplicates
    const metricKey = goal.metricKey || canonicalizeMetricName(goal.metricName);
    const [existing] = await db
      .select()
      .from(goalsPaper)
      .where(eq(goalsPaper.metricKey, metricKey))
      .limit(1);
    
    if (existing) {
      return this.updateGoalPaper(existing.id, { ...goal, metricKey });
    } else {
      return this.createGoalPaper({ ...goal, metricKey });
    }
  }

  async deleteGoalPaper(id: string): Promise<void> {
    await db.delete(goalsPaper).where(eq(goalsPaper.id, id));
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

  // Phase 27.5: Goal Audit Log
  async createGoalAuditLog(entry: InsertGoalAuditLog): Promise<GoalAuditLog> {
    const [result] = await db.insert(goalAuditLog).values(entry).returning();
    return result;
  }

  async getGoalAuditLogs(userId: string, mode?: 'live' | 'paper', limit: number = 100): Promise<GoalAuditLog[]> {
    const query = db
      .select()
      .from(goalAuditLog)
      .where(mode ? and(eq(goalAuditLog.userId, userId), eq(goalAuditLog.mode, mode)) : eq(goalAuditLog.userId, userId))
      .orderBy(desc(goalAuditLog.timestamp))
      .limit(limit);
    
    return await query;
  }

  // Phase 27.F.14.UI-SYNC.7: User Goals Audit
  async createUserGoalsAudit(entry: InsertUserGoalsAudit): Promise<UserGoalsAudit> {
    const [result] = await db.insert(userGoalsAudit).values(entry).returning();
    return result;
  }

  async getUserGoalsAudit(userId: string, mode?: 'live' | 'paper', limit: number = 100): Promise<UserGoalsAudit[]> {
    const query = db
      .select()
      .from(userGoalsAudit)
      .where(mode ? and(eq(userGoalsAudit.userId, userId), eq(userGoalsAudit.mode, mode)) : eq(userGoalsAudit.userId, userId))
      .orderBy(desc(userGoalsAudit.timestamp))
      .limit(limit);
    
    return await query;
  }

  // Phase 27.F.15.UI-EARNINGS.3: Daily Performance Summary
  async createDailyPerformanceSummary(entry: InsertDailyPerformanceSummary): Promise<DailyPerformanceSummary> {
    const [result] = await db.insert(dailyPerformanceSummary).values(entry).returning();
    return result;
  }

  async getDailyPerformanceSummaries(mode: 'live' | 'paper', limit: number = 90): Promise<DailyPerformanceSummary[]> {
    return await db
      .select()
      .from(dailyPerformanceSummary)
      .where(eq(dailyPerformanceSummary.mode, mode))
      .orderBy(desc(dailyPerformanceSummary.date))
      .limit(limit);
  }

  // User utility methods
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  // Actuation policy methods (Milestone 17A)
  async getActuationPolicy(userId: string, variableName: string): Promise<ActuationPolicy | undefined> {
    const [policy] = await db
      .select()
      .from(actuationPolicies)
      .where(and(
        eq(actuationPolicies.userId, userId),
        eq(actuationPolicies.variableName, variableName)
      ));
    return policy || undefined;
  }

  async getActuationPolicies(userId: string): Promise<ActuationPolicy[]> {
    return await db
      .select()
      .from(actuationPolicies)
      .where(eq(actuationPolicies.userId, userId));
  }

  async createActuationPolicy(policy: InsertActuationPolicy): Promise<ActuationPolicy> {
    const [result] = await db.insert(actuationPolicies).values(policy).returning();
    return result;
  }

  async updateActuationPolicy(id: string, updates: Partial<ActuationPolicy>): Promise<ActuationPolicy> {
    const [result] = await db
      .update(actuationPolicies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(actuationPolicies.id, id))
      .returning();
    return result;
  }

  // Proposed adjustments methods (Milestone 17A)
  async createProposedAdjustment(adjustment: InsertProposedAdjustment): Promise<ProposedAdjustment> {
    const [result] = await db.insert(proposedAdjustments).values(adjustment).returning();
    return result;
  }

  async updateProposedAdjustment(id: string, updates: Partial<ProposedAdjustment>): Promise<ProposedAdjustment> {
    const [result] = await db
      .update(proposedAdjustments)
      .set(updates)
      .where(eq(proposedAdjustments.id, id))
      .returning();
    return result;
  }

  async getProposedAdjustment(id: string): Promise<ProposedAdjustment | undefined> {
    const [result] = await db
      .select()
      .from(proposedAdjustments)
      .where(eq(proposedAdjustments.id, id));
    return result || undefined;
  }

  async getRecentProposedAdjustments(userId: string, variableName: string, hours: number): Promise<ProposedAdjustment[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);
    
    return await db
      .select()
      .from(proposedAdjustments)
      .where(and(
        eq(proposedAdjustments.userId, userId),
        eq(proposedAdjustments.variableName, variableName),
        gte(proposedAdjustments.proposedAt, cutoffDate)
      ))
      .orderBy(desc(proposedAdjustments.proposedAt));
  }

  async getAllProposedAdjustments(userId: string, hours?: number): Promise<ProposedAdjustment[]> {
    const conditions = [eq(proposedAdjustments.userId, userId)];
    
    if (hours) {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - hours);
      conditions.push(gte(proposedAdjustments.proposedAt, cutoffDate));
    }
    
    return await db
      .select()
      .from(proposedAdjustments)
      .where(and(...conditions))
      .orderBy(desc(proposedAdjustments.proposedAt));
  }

  async getPendingAdjustments(userId: string, mode: 'live' | 'paper'): Promise<ProposedAdjustment[]> {
    return await db
      .select()
      .from(proposedAdjustments)
      .where(and(
        eq(proposedAdjustments.userId, userId),
        eq(proposedAdjustments.mode, mode),
        eq(proposedAdjustments.status, 'pending')
      ))
      .orderBy(desc(proposedAdjustments.proposedAt));
  }

  // Asset capabilities methods (Milestone 17B)
  async getAssetCapability(symbol: string): Promise<AssetCapability | undefined> {
    const [capability] = await db
      .select()
      .from(assetCapabilities)
      .where(eq(assetCapabilities.symbol, symbol));
    return capability || undefined;
  }

  async getAssetCapabilities(): Promise<AssetCapability[]> {
    return await db.select().from(assetCapabilities);
  }

  async createAssetCapability(capability: InsertAssetCapability): Promise<AssetCapability> {
    const [result] = await db.insert(assetCapabilities).values(capability).returning();
    return result;
  }

  async updateAssetCapability(id: string, updates: Partial<AssetCapability>): Promise<AssetCapability> {
    const [result] = await db
      .update(assetCapabilities)
      .set({ ...updates, lastSynced: new Date() })
      .where(eq(assetCapabilities.id, id))
      .returning();
    return result;
  }

  async upsertAssetCapability(capability: Omit<InsertAssetCapability, 'id'>): Promise<AssetCapability> {
    const existing = await this.getAssetCapability(capability.symbol);
    if (existing) {
      return this.updateAssetCapability(existing.id, capability);
    } else {
      return this.createAssetCapability(capability as InsertAssetCapability);
    }
  }

  // Historic signals methods (Milestone 17C)
  async createHistoricSignal(signal: InsertHistoricSignal): Promise<HistoricSignal> {
    const [result] = await db.insert(historicSignals).values(signal).returning();
    return result;
  }

  async getHistoricSignals(userId: string, limit: number = 100): Promise<HistoricSignal[]> {
    return await db
      .select()
      .from(historicSignals)
      .where(eq(historicSignals.userId, userId))
      .orderBy(desc(historicSignals.triggerTime))
      .limit(limit);
  }

  async getHistoricSignalsBySymbol(userId: string, symbol: string): Promise<HistoricSignal[]> {
    return await db
      .select()
      .from(historicSignals)
      .where(and(
        eq(historicSignals.userId, userId),
        eq(historicSignals.symbol, symbol)
      ))
      .orderBy(desc(historicSignals.triggerTime));
  }

  async getHistoricSignalsByStrategy(userId: string, strategyId: string): Promise<HistoricSignal[]> {
    return await db
      .select()
      .from(historicSignals)
      .where(and(
        eq(historicSignals.userId, userId),
        eq(historicSignals.strategyId, strategyId as any)
      ))
      .orderBy(desc(historicSignals.triggerTime));
  }

  async getHistoricSignalStats(userId: string): Promise<{
    totalSignals: number;
    winRate: number;
    avgReturn: number;
    byStrategy: Array<{
      strategy: string;
      count: number;
      winRate: number;
      avgReturn: number;
    }>;
  }> {
    const signals = await db
      .select()
      .from(historicSignals)
      .where(eq(historicSignals.userId, userId));

    const totalSignals = signals.length;
    const winning = signals.filter(s => s.pnlPercent && parseFloat(s.pnlPercent) > 0).length;
    const winRate = totalSignals > 0 ? (winning / totalSignals) * 100 : 0;
    
    const totalReturn = signals.reduce((acc, s) => 
      acc + (s.pnlPercent ? parseFloat(s.pnlPercent) : 0), 0
    );
    const avgReturn = totalSignals > 0 ? totalReturn / totalSignals : 0;

    // Group by strategy
    const byStrategy = Array.from(
      signals.reduce((map, signal) => {
        const strategy = signal.strategyId;
        if (!map.has(strategy)) {
          map.set(strategy, []);
        }
        map.get(strategy)!.push(signal);
        return map;
      }, new Map<string, typeof signals>())
    ).map(([strategy, strategySignals]) => {
      const count = strategySignals.length;
      const wins = strategySignals.filter(s => s.pnlPercent && parseFloat(s.pnlPercent) > 0).length;
      const winRate = count > 0 ? (wins / count) * 100 : 0;
      const totalReturn = strategySignals.reduce((acc, s) => 
        acc + (s.pnlPercent ? parseFloat(s.pnlPercent) : 0), 0
      );
      const avgReturn = count > 0 ? totalReturn / count : 0;
      
      return { strategy, count, winRate, avgReturn };
    });

    return {
      totalSignals,
      winRate,
      avgReturn,
      byStrategy
    };
  }

  // Paper simulation methods (Milestone 18)
  async createClosedTrade(mode: TradingMode, trade: Omit<InsertClosedTrade, 'mode'>): Promise<ClosedTrade> {
    // [I8C-SYMBOL-NORM] Normalize symbol to canonical BASE/QUOTE format
    const canonicalSymbol = normalizeToInternalSymbol(trade.symbol);
    if (trade.symbol !== canonicalSymbol) {
      console.log(`[I8C-SYMBOL-NORM] raw=${trade.symbol} canonical=${canonicalSymbol}`);
    }
    // B-BALANCE-TRUTH Step F (#618): STAMP THE MODE. This function has always RECEIVED
    // `mode` and thrown it away -- threaded correctly all the way here, then dropped on the
    // floor, which is why seven readers could accept a mode and none could filter on one.
    // This is the SINGLE physical INSERT into closed_trades (census 2026-08-21: one site,
    // three callers, all already passing a correct mode).
    const normalizedTrade = { ...trade, symbol: canonicalSymbol, mode };
    const [result] = await db.insert(closedTradesTable).values(normalizedTrade).returning();
    return result;
  }

  async updateClosedTrade(mode: TradingMode, id: string, updates: Partial<ClosedTrade>): Promise<ClosedTrade> {
    const [result] = await db.update(closedTradesTable)
      .set(updates)
      .where(eq(closedTradesTable.id, id))
      .returning();
    return result;
  }

  async getClosedTrade(mode: TradingMode, id: string): Promise<ClosedTrade | undefined> {
    const [trade] = await db.select()
      .from(closedTradesTable)
      .where(eq(closedTradesTable.id, id));
    return trade || undefined;
  }

  /**
   * B-BALANCE-TRUTH Step C (#618), Langston rider 2026-08-21: report what an unbounded read
   * ACTUALLY returned.
   *
   * His point, and it is the right one: the cost of `'all'` is unbounded in the FUTURE, and
   * nothing would tell us the day it stops being cheap -- we would notice it as a slow page,
   * which is a feeling rather than a measurement. This makes the trigger for the per-key
   * `since` bound observable before it hurts.
   *
   * It lives in the READER, not at the two call sites, on purpose: a future third `'all'`
   * caller inherits the instrument instead of having to remember it. Same reasoning as the
   * derived-not-listed fence subject in #704 -- an instrument that must be re-added by hand is
   * one that eventually is not.
   */
  async getClosedTrades(mode: TradingMode, filters: { limit: number | 'all'; closedOnly?: boolean; includeNeverFilled?: boolean }): Promise<ClosedTrade[]> {
    // Phase 27.F.15.B.2: Global query, mode-based only
    // B-BALANCE-TRUTH Step A (#618): `limit` is REQUIRED -- the `|| 100` default is GONE.
    // It was a 2025-10 LISTING default (a UI page size for the paper-sim engine) that
    // AGGREGATE consumers later inherited silently, bounding whole-history questions at
    // 100 rows ordered by opened_at DESC. Requiring the bound makes tsc enumerate every
    // caller, so no future consumer can inherit a page size by accident: it must type a
    // number, and typing a number is the moment someone thinks.
    // ⚠️ HONEST LIMIT ON THAT CLAIM (Langston, 2026-08-20): the compiler enumerates callers whose
    // options object is TYPED. A caller passing an `any`-typed options bag satisfies the required
    // property and is flagged by NOTHING — `routes.ts` has exactly such a site (`const options: any`),
    // which the 24-site census found and tsc did not. So this contract is strong against accident,
    // not airtight: `any` is a hole in it.
    // B-BALANCE-TRUTH Step C (#618): `'all'` is an EXPLICIT, TYPED unbounded read.
    //
    // The two remaining call sites genuinely need the whole closed set and CANNOT be bounded by
    // time instead. The balance curve accumulates a running total and carries the last point from
    // BEFORE the requested window, so a time bound breaks the level it renders. The analytics
    // route windows one figure by OPEN time and another by CLOSE time, so no single time bound
    // is correct for both. For those two, "everything" is the honest answer.
    //
    // *** WHY A SENTINEL AND NOT A BIG NUMBER: passing 100000 would be the SAME defect with a
    // larger constant -- an arbitrary bound nobody chose, failing silently once the table
    // outgrows it, in the direction that looks healthy. `'all'` cannot go stale. And it does not
    // weaken Step A's contract: `limit` stays REQUIRED, so tsc still enumerates every caller and
    // each must still type something deliberate. What changed is that "all of it" became
    // something a caller can SAY, rather than something it had to approximate.
    // COST, STATED: an unbounded read grows with the table. (An earlier draft of this comment
    // carried a live row count; it was stale within hours -- 569 became 581 the same day. A
    // rules-and-reasoning comment must not carry a drifting fact: the INSTRUMENT below reports
    // the real number every time it runs.) Both sites
    // are authenticated dashboard reads, not hot-path loops. If either becomes heavy the fix is
    // a per-key `since` bound on the READER -- separate bounds for open-time and close-time
    // questions -- not a cap.
    const limit = filters.limit;
    const unbounded = limit === 'all';
    const closedOnly = filters.closedOnly ?? false;

    // Step F (#618): the mode predicate is REAL now, and it SEEDS the list rather than being
    // appended conditionally -- so no future flag can skip it. Verifiable as a NO-OP today
    // (every row is paper, every caller asks for paper), which is exactly why it lands now
    // rather than at Phase 21, when it would start moving numbers and nobody could tell a
    // correct change from a regression.
    const conditions: any[] = [eq(closedTradesTable.mode, mode)];
    if (closedOnly) {
      conditions.push(sql`${closedTradesTable.closedAt} IS NOT NULL` as any);
    }
    // P19-B7.2c TYPED GUARD (Langston Step-4 condition 4): never_filled rows (a dropped
    // pending maker — an order that never traded) are EXCLUDED at the SQL level BY DEFAULT
    // so no aggregate/ML/session-metrics reader can accidentally count a phantom flat.
    // Visibility is opt-in: the paginated UI list passes them explicitly; a fill-rate
    // reader sets includeNeverFilled: true.
    if (!filters.includeNeverFilled) {
      conditions.push(sql`${closedTradesTable.closeReason} IS DISTINCT FROM 'never_filled'` as any);
    }

    if (conditions.length > 0) {
      const q = db.select()
        .from(closedTradesTable)
        .where(and(...conditions))
        .orderBy(desc(closedTradesTable.openedAt));
      const rows = unbounded ? await q : await q.limit(limit as number);
      if (unbounded) logUnboundedRead(rows.length);
      return rows;
    }

    const q2 = db.select()
      .from(closedTradesTable)
      // Carries the predicate too: `conditions` always holds the mode now, so this branch is
      // unreachable -- but an UNFILTERED fallback is exactly how a mode-blind read creeps back.
      .where(eq(closedTradesTable.mode, mode))
      .orderBy(desc(closedTradesTable.openedAt));
    const rows2 = unbounded ? await q2 : await q2.limit(limit as number);
    if (unbounded) logUnboundedRead(rows2.length);
    return rows2;
  }

  /**
   * ★ #618 (2026-07-31): the realized-P&L sum for a TIME window, computed IN SQL so it is
   * UNBOUNDED BY CONSTRUCTION. The daily-loss kill switch previously reached its 24h total
   * through getClosedTrades(), whose `limit || 100` (:3148) is a 2025-10 LISTING default
   * ordered by `openedAt` — so a position held across more than 100 subsequent opens was
   * ABSENT from the kill switch's 24h loss total at the moment it closed, silently and with
   * no error. MEASURED over all 346 qualifying rows: worst-case rank-at-close 215; 3 rows
   * invisible at their close, all three losses. Bounding by OPEN time a question asked in
   * CLOSE time is the defect; this expresses the window the caller actually wants.
   *
   * The two predicates below are COPIED FROM getClosedTrades ON PURPOSE (closedAt NOT NULL +
   * never_filled excluded, the P19-B7.2c typed guard) so the POPULATION is identical and only
   * the row bound is removed — a reader comparing the two should see one difference, not two.
   * Both properties are fenced in `server/tests/integration/b-killswitch-window.test.ts`.
   *
   * ⚠️⚠️ `mode` IS DELIBERATELY INERT — AND IT IS STRUCTURALLY UNUSABLE, NOT MERELY UNUSED
   * (Langston Step-4, 2026-07-31; registered as a new #618 leg-3 site so the live-switch-on
   * sweep finds it). `closed_trades` HAS NO paper/live discriminator column at all — the
   * only mode-ish columns on it are `chosen_entry_mode`, `trade_mode` and `exit_fee_mode`,
   * none of which partition paper from live. So this function CANNOT filter by mode even if
   * it wanted to, and the parameter exists ONLY for signature parity with its siblings
   * (`getClosedTrades`, `getClosedTradesGlobal`), which accept and ignore it identically.
   * ⇒ SAFE TODAY only because the sole caller gates on `mode === 'paper'`
   * (`daily-loss-budget.ts`). **A future `getRealizedPnlSince('live', …)` would sum PAPER
   * rows into a LIVE kill switch.** Do not add a live caller until the table has a real
   * discriminator; the fix belongs with #618 leg 3, not here.
   */
  /**
   * B-PHANTOM-FILL-RECONSTRUCT: THE honest realized-P&L expression. Defined ONCE and used by
   * every aggregate below, because the failure this whole arc documents is the same number being
   * computed two ways in two places.
   *
   * Prefers the RECONSTRUCTED figure where one exists -- a measurement from retained market data,
   * not a formula -- and falls back to what was recorded. The originals are never mutated, so
   * `pnl` still answers "what did we record" while this answers "what actually happened".
   * # ERROR CORRECTED 2026-08-26 (Langston, refusing the batch's N/A). This line read:
   *   "MEASURED at backfill: 21 of 521 lifetime trades affected; lifetime -74.11 -> -132.74."
   * THAT BACKFILL WAS CUT AND NEVER RAN. Its detector's founding premise was falsified by #741
   * (a maker exit does not read the book for its PRICE, but the system reads the book to decide
   * WHETHER IT FILLED), so the UPDATE was removed and the migration ships ALTER-only.
   * LIVE TRUTH, re-derived at this ref: reconstructedNetPnl is NULL on ALL closed rows, zero
   * trades corrected, and lifetime is UNCHANGED. The -132.74 figure never existed.
   * A money figure stated as measured fact, for a pass that never executed, is the worst
   * shape a stale comment can take -- the next reader believes a number nothing produced.
   */
  private static readonly HONEST_PNL = sql`COALESCE(${closedTradesTable.reconstructedNetPnl}, ${closedTradesTable.pnl})`;

  async getRealizedPnlSince(mode: TradingMode, since: Date): Promise<{ realizedPnl: number; tradeCount: number }> {
    const [row] = await db.select({
      realizedPnl: sql<string>`COALESCE(SUM(${DatabaseStorage.HONEST_PNL}), 0)`,
      tradeCount: sql<string>`COUNT(*)`,
    })
      .from(closedTradesTable)
      .where(and(
        sql`${closedTradesTable.closedAt} IS NOT NULL` as any,
        sql`${closedTradesTable.closedAt} >= ${since}` as any,
        sql`${closedTradesTable.closeReason} IS DISTINCT FROM 'never_filled'` as any,
        eq(closedTradesTable.mode, mode), // Step F (#618): the mode argument is real now
      ));
    return {
      realizedPnl: parseFloat(String(row?.realizedPnl ?? '0')) || 0,
      tradeCount: parseInt(String(row?.tradeCount ?? '0'), 10) || 0,
    };
  }

  /**
   * B-BALANCE-TRUTH Step C (#618): the DISPLAY-side aggregates.
   *
   * Every one of these answers a WHOLE-HISTORY or WHOLE-WINDOW question that was previously asked
   * through `getClosedTrades` — a LIST reader capped at 100 rows ordered by `opened_at DESC`. The
   * measured consequence on the live API — ⚠️ ALL FIGURES BELOW ARE POINT-IN-TIME OBSERVATIONS
   * TAKEN 2026-08-20T14:2xZ AT REF `3c3bda57c`, NOT invariants (Langston's Step-C condition 1:
   * a durable comment stating a number the running code does not produce is the exact defect this
   * batch exists to remove — the windows slide and the row count grows, so these WILL diverge;
   * dated rather than struck so the evidence survives): `/portfolio/earnings` reported −$71.74 over a
   * `tradeCount` of exactly 100 while the truth was −$197.29 over 475 trades, and
   * `earnings-chart?days=30` returned a 17-day span because the truncated window could not reach
   * further back. `?days=7` was correct only by luck — 23 rows fit under the cap.
   *
   * PREDICATE PARITY IS DELIBERATE AND LOAD-BEARING: every method below uses the SAME three
   * predicates as `getRealizedPnlSince` (`closed_at IS NOT NULL` + the window + `close_reason IS
   * DISTINCT FROM 'never_filled'`), so a reader comparing any two of them sees ONE difference —
   * the question asked — and never a population difference. Basis stays `pnl` throughout: the
   * kill-switch numerator and denominator both sum `pnl`, and B-COST-MATH-CONSOLIDATION's `netPnl`
   * migration must move EVERY site in ONE batch or the ratio becomes incoherent (Langston's
   * standing condition 2). `netPnl` is NOT introduced here.
   */

  /** Whole-history realized total + the REAL trade count (not a page size). */
  /**
   * B-BALANCE-TRUTH Step E (#618): a COUNT, computed in SQL.
   *
   * The caller this replaces did `(await getClosedTrades(mode, { limit: 1000 })).length` — it
   * fetched up to a thousand full rows across the wire and then discarded every column to read
   * one integer off the array. Two things were wrong with that and only one of them is speed.
   *
   * The bound made the count SILENTLY WRONG ABOVE 1,000. It is not wrong today — 483 qualifying
   * rows as of 2026-08-21 — so this is a LATENT defect, not a live one, and the honest framing is
   * preventive. But the crossing is months rather than years: growth is 3.6-6.7 rows/day recently
   * against a 15.8/day historical mean, and the paper-slot increase to 15 is DESIGNED to raise it.
   * A count that silently stops counting when the table outgrows a number nobody remembers
   * choosing is exactly the #618 failure, and it fails in the direction that looks healthy.
   *
   * Predicate parity with the reader it replaces: never_filled excluded always; `closedOnly`
   * optional and matching the reader's own default of false.
   */
  async getClosedTradesCount(mode: TradingMode, opts?: { closedOnly?: boolean }): Promise<number> {
    const conditions = [
      eq(closedTradesTable.mode, mode), // Step F (#618): the mode argument is real now
      sql`${closedTradesTable.closeReason} IS DISTINCT FROM 'never_filled'` as any,
    ];
    if (opts?.closedOnly) {
      conditions.push(sql`${closedTradesTable.closedAt} IS NOT NULL` as any);
    }
    const [row] = await db.select({ n: sql<string>`COUNT(*)` })
      .from(closedTradesTable)
      .where(and(...conditions));
    return parseInt(String(row?.n ?? '0'), 10) || 0;
  }

  /**
   * B-BALANCE-TRUTH Step E (#618), Langston-ruled CONVERT-NOW for `getPortfolioMetrics`:
   * the raw COMPONENTS of the portfolio metrics, computed in SQL over the whole closed set.
   *
   * ★ IT RETURNS COMPONENTS, NOT FINISHED METRICS, AND THAT IS DELIBERATE. The caller already
   * owns three helpers whose edge cases are load-bearing and non-obvious — profit factor returns
   * `Infinity` when there are gains and no losses, `0` when there are neither; Sharpe returns 0
   * on a zero standard deviation rather than dividing. Re-expressing those branches in SQL would
   * mean two statements of one rule, which is the divergence this batch exists to delete. So SQL
   * does the summing it is good at and the branch logic stays exactly where it already is.
   *
   * PREDICATE PARITY with the capped read it replaces: `closed_at IS NOT NULL` + never_filled
   * excluded. VERIFIED, not assumed — all four derived metrics reproduce the deployed endpoint
   * to floating-point precision over these 478 rows (drawdown 47.15076954411425 vs .1143,
   * profit factor 0.88097850108280044 vs ...7998, Sharpe -0.09478015083688222 vs ...217,
   * total P&L percent -0.23030459069599086 vs ...908).
   *
   * ⚠️ ONE KNOWN, DELIBERATE BOUNDARY. The JS it replaces filtered returns with `t.pnlPercent`,
   * a TRUTHINESS test; this uses `IS NOT NULL`. They select the same 478 rows today because the
   * column has ZERO nulls (measured), and because drizzle hands numerics back as strings, so even
   * "0.00" is truthy. They would diverge only if a genuine numeric 0 ever reached that filter —
   * and there the SQL is RIGHT: a 0% return is a real observation, and silently dropping it is
   * the defect, not the feature. Recorded rather than left for someone to rediscover.
   */
  /**
   * B-BALANCE-TRUTH OBJ-4 (Kyle-directed 2026-08-21): THE LIFETIME SCOREBOARD.
   *
   * Kyle's ask: the Earnings card's bottom line should stop following the window selector and
   * become "a running scoreboard for since we started trading."
   *
   * ★ THE PERCENTAGE IS A TIME-WEIGHTED RETURN, AND THAT IS AN INSTRUMENT CHOICE, NOT A TASTE.
   * Kyle asked whether to measure against the original $2,250 or the current $824.11 and could
   * not decide. NEITHER IS RIGHT, and the data made that answerable: every qualifying trade
   * carries `anchor_balance_at_open` (measured 2026-08-21: 492 rows, ZERO nulls), so the capital
   * actually behind each trade is known per-trade and no arbitrary denominator is needed.
   *   ÷ current 824.11 -> -19.49%   WRONG BY ~3x: most trades were taken with 2250/2400 behind them
   *   ÷ original 2250  ->  -7.14%   close TODAY only because most history sits in that era
   *   TIME-WEIGHTED    ->  -7.08%   <- this
   * TWR is the standard measure for a capital base that changed for NON-TRADING reasons, which is
   * exactly what a re-anchor is (a deposit/withdrawal, in performance terms). It answers "how did
   * the TRADING perform" independent of money moving in or out. Three distinct bases exist in the
   * history -- 2250.00, 2400.00, 824.11 -- so a single-denominator answer is wrong for two of the
   * three eras. Not academic.
   *
   * ★ THE EPOCH IS DELIBERATE AND IS **NOT** TIED TO THE ANCHOR EVENTS. Kyle ruled the two acts
   * decoupled: changing the balance and resetting the score are each intentional, and either can
   * happen without the other. Binding the scoreboard to anchor changes would have silently erased
   * the July record he is asking to see -- the 08-12 re-anchor was him mirroring his real Kraken
   * balance, not starting a fresh experiment. So the epoch is an explicit `module_constants` row
   * (`scoreboard` / `epoch_started_at`), whose `updated_by` column is the audit trail for the
   * deliberate act.
   * ⚠️ With no explicit row the epoch is the FIRST TRADE. That is NOT a hard-coded fallback of the
   * kind rule 15 forbids -- it is the correct semantic (score-keeping began when trading began),
   * `epochIsExplicit` reports which of the two is in force, and the card states the date either way.
   */
  async getLifetimeScoreboard(mode: TradingMode): Promise<{
    epochStartedAt: string | null; epochIsExplicit: boolean;
    netPnl: number; timeWeightedReturnPct: number | null; tradeCount: number;
  }> {
    const res: any = await db.execute(sql`
      WITH epoch AS (
        SELECT (value #>> '{}')::timestamptz AS ts
          FROM module_constants
         WHERE module_name = 'scoreboard' AND constant_name = 'epoch_started_at'
         LIMIT 1
      ),
      q AS (
        SELECT closed_at,
               COALESCE(net_pnl, pnl)::numeric        AS p,
               anchor_balance_at_open::numeric        AS base
          FROM closed_trades
         WHERE closed_at IS NOT NULL
           AND close_reason IS DISTINCT FROM 'never_filled'
           AND mode = ${mode}
           AND closed_at >= COALESCE((SELECT ts FROM epoch), '-infinity'::timestamptz)
           -- * BOTH-LEG KEYING (added 2026-08-24). This clause was MISSING, so the lifetime
           -- figure counted every trade that CLOSED after the epoch including those OPENED
           -- before it -- whose entry price came through the contaminated mini-book (#741).
           -- MEASURED on staging the moment it was found: this card showed +$5.76 over 13
           -- trades directly beside a rolling -$4.91 over 6, because computeRollingEarnings
           -- had the both-leg rule and this query did not. B-OBSERVATION-EPOCH DECIDED
           -- both-leg and pinned it with four tests; it reached one reader out of four.
           -- GUARDED so OBJ-5 holds EXACTLY: with no explicit epoch row this adds nothing.
           -- A bare opened_at >= -infinity would NOT be equivalent -- it would drop rows
           -- with a NULL opened_at, silently changing the no-epoch behaviour that batch
           -- promised to leave alone.
           AND ((SELECT ts FROM epoch) IS NULL OR opened_at >= (SELECT ts FROM epoch))
      )
      SELECT
        (SELECT ts FROM epoch)                                        AS explicit_epoch,
        (SELECT min(closed_at) FROM q)                                AS first_trade,
        (SELECT count(*) FROM q)::int                                 AS trade_count,
        (SELECT COALESCE(sum(p), 0) FROM q)                           AS net_pnl,
        -- Compounded: PROD(1 + p/base) - 1, via exp(sum(ln(...))). The GREATEST guard keeps a
        -- pathological row (a single trade losing more than the entire capital base) from making
        -- ln() undefined and blanking the whole card -- it cannot occur with real fills, but a
        -- metric that dies on one bad row is a metric that eventually dies.
        (SELECT exp(sum(ln(GREATEST(1 + p / base, 0.000001)))) - 1
           FROM q WHERE base IS NOT NULL AND base > 0)                AS twr
    `);
    const row = (res.rows ?? res)[0] ?? {};
    const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };
    const explicit = row.explicit_epoch ?? null;
    const twrRaw = row.twr === null || row.twr === undefined ? null : parseFloat(String(row.twr));
    return {
      epochStartedAt: explicit ? new Date(explicit).toISOString()
                     : (row.first_trade ? new Date(row.first_trade).toISOString() : null),
      epochIsExplicit: !!explicit,
      netPnl: num(row.net_pnl),
      timeWeightedReturnPct: twrRaw === null || !Number.isFinite(twrRaw) ? null : twrRaw * 100,
      tradeCount: Math.trunc(num(row.trade_count)),
    };
  }

  async getPortfolioMetricComponents(mode: TradingMode): Promise<{
    rowCount: number; maxDrawdownAbs: number; grossProfit: number; grossLoss: number;
    avgReturn: number; stdDevPop: number; returnsCount: number; capitalDeployed: number;
  }> {
    const res: any = await db.execute(sql`
      WITH q AS (
        SELECT * FROM closed_trades
         WHERE closed_at IS NOT NULL AND close_reason IS DISTINCT FROM 'never_filled'
           AND mode = ${mode}
      ),
      r AS (SELECT closed_at, SUM(pnl::numeric) OVER (ORDER BY closed_at) AS run FROM q),
      p AS (SELECT run, GREATEST(MAX(run) OVER (ORDER BY closed_at), 0) AS peak FROM r)
      SELECT
        (SELECT count(*) FROM q)                                              AS row_count,
        (SELECT COALESCE(MAX(peak - run), 0) FROM p)                          AS max_drawdown_abs,
        (SELECT COALESCE(SUM(pnl::numeric) FILTER (WHERE pnl::numeric > 0), 0) FROM q)  AS gross_profit,
        (SELECT COALESCE(ABS(SUM(pnl::numeric) FILTER (WHERE pnl::numeric <= 0)), 0) FROM q) AS gross_loss,
        (SELECT COALESCE(AVG(pnl_percent::numeric), 0) FROM q WHERE pnl_percent IS NOT NULL) AS avg_return,
        (SELECT COALESCE(STDDEV_POP(pnl_percent::numeric), 0) FROM q WHERE pnl_percent IS NOT NULL) AS std_dev_pop,
        (SELECT count(*) FROM q WHERE pnl_percent IS NOT NULL)                AS returns_count,
        (SELECT COALESCE(SUM(entry_price::numeric * quantity::numeric), 0) FROM q) AS capital_deployed
    `);
    const row = (res.rows ?? res)[0] ?? {};
    const n = (v: unknown) => { const x = parseFloat(String(v ?? '0')); return Number.isFinite(x) ? x : 0; };
    return {
      rowCount: Math.trunc(n(row.row_count)),
      maxDrawdownAbs: n(row.max_drawdown_abs),
      grossProfit: n(row.gross_profit),
      grossLoss: n(row.gross_loss),
      avgReturn: n(row.avg_return),
      stdDevPop: n(row.std_dev_pop),
      returnsCount: Math.trunc(n(row.returns_count)),
      capitalDeployed: n(row.capital_deployed),
    };
  }

  async getRealizedPnlTotal(mode: TradingMode): Promise<{ realizedPnl: number; tradeCount: number }> {
    const [row] = await db.select({
      realizedPnl: sql<string>`COALESCE(SUM(${DatabaseStorage.HONEST_PNL}), 0)`,
      tradeCount: sql<string>`COUNT(*)`,
    })
      .from(closedTradesTable)
      .where(and(
        sql`${closedTradesTable.closedAt} IS NOT NULL` as any,
        sql`${closedTradesTable.closeReason} IS DISTINCT FROM 'never_filled'` as any,
        eq(closedTradesTable.mode, mode), // Step F (#618): the mode argument is real now
      ));
    return {
      realizedPnl: parseFloat(String(row?.realizedPnl ?? '0')) || 0,
      tradeCount: parseInt(String(row?.tradeCount ?? '0'), 10) || 0,
    };
  }

  /**
   * Daily realized P&L grouped BY CLOSE DATE, in SQL.
   * ★ EXPLICIT UTC, not the session default (Langston's Step-C condition 3). `closed_at` is
   * `timestamptz`, so a bare `to_char` renders in the PG SESSION TimeZone while the JS this
   * replaced used `toISOString()` — i.e. UTC. Measured on the app's own connection 2026-08-20:
   * `show timezone` = UTC, so the buckets agree TODAY. But that is a config default which can
   * move under us, and an endpoint-vs-SQL check written over the SAME `to_char` expression is a
   * same-expression control that structurally cannot return the failing answer. Pinned to UTC so
   * the boundary is a property of the CODE rather than of the connection.
   * ★ The grouping key is `closed_at`, NOT `opened_at` (Langston's Step-1 rider). The old chart
   * bounded its set by OPEN time and then filtered by CLOSE time in JS — the identical
   * open-time/close-time error `getRealizedPnlSince` was created to fix. A re-plumbed JS filter
   * would have carried that error forward with better plumbing.
   */
  async getDailyRealizedPnlSince(mode: TradingMode, since: Date): Promise<Array<{ date: string; pl: number }>> {
    const rows = await db.select({
      date: sql<string>`to_char(${closedTradesTable.closedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      pl: sql<string>`COALESCE(SUM(${DatabaseStorage.HONEST_PNL}), 0)`,
    })
      .from(closedTradesTable)
      .where(and(
        sql`${closedTradesTable.closedAt} IS NOT NULL` as any,
        sql`${closedTradesTable.closedAt} >= ${since}` as any,
        sql`${closedTradesTable.closeReason} IS DISTINCT FROM 'never_filled'` as any,
        eq(closedTradesTable.mode, mode), // Step F (#618): the mode argument is real now
      ))
      .groupBy(sql`to_char(${closedTradesTable.closedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${closedTradesTable.closedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);
    return rows.map(r => ({ date: String(r.date), pl: parseFloat(String(r.pl ?? '0')) || 0 }));
  }

  /**
   * The N most recently CLOSED trades' P&L, for win-rate style windows.
   * ★ Ordered by `closed_at DESC` — the old site took `slice(-30)` off an array ordered
   * `opened_at DESC`, which returns the 30 OLDEST rows of the truncated window, not the most
   * recent 30. Measured: 43.33% displayed against a true 50.00%.
   */
  async getRecentClosedPnls(mode: TradingMode, n: number): Promise<number[]> {
    const rows = await db.select({ pnl: DatabaseStorage.HONEST_PNL })
      .from(closedTradesTable)
      .where(and(
        sql`${closedTradesTable.closedAt} IS NOT NULL` as any,
        sql`${closedTradesTable.closeReason} IS DISTINCT FROM 'never_filled'` as any,
        eq(closedTradesTable.mode, mode), // Step F (#618): the mode argument is real now
      ))
      .orderBy(desc(closedTradesTable.closedAt))
      .limit(n);
    return rows.map(r => parseFloat(String(r.pnl ?? '0')) || 0);
  }

  async getClosedTradesBySymbol(mode: TradingMode, symbol: string): Promise<ClosedTrade[]> {
    // Phase 27.F.15.B.2: Global query, mode-based only
    // P19-B7.2c: never_filled rows excluded by default (typed guard — see getClosedTrades).
    return await db.select()
      .from(closedTradesTable)
      .where(and(
        eq(closedTradesTable.symbol, symbol),
        sql`${closedTradesTable.closeReason} IS DISTINCT FROM 'never_filled'`
      ))
      .orderBy(desc(closedTradesTable.openedAt));
  }

  // Phase 8.8.3-C5: Paginated trades with sorting and filtering support
  // Phase 8.8.3-C-FINAL: Ghost filter moved to SQL, dateTo end-of-day fix, closeReason filter
  async getClosedTradesPaginated(mode: TradingMode, filters: {
    limit?: number;
    offset?: number;
    sortBy?: 'openedAt' | 'closedAt' | 'symbol' | 'pnl' | 'pnlPercent' | 'strategyName';
    order?: 'asc' | 'desc';
    closedOnly?: boolean;
    symbol?: string;
    strategy?: string;
    closeReason?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<{ trades: ClosedTrade[]; totalCount: number }> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const sortBy = filters.sortBy || 'closedAt';
    const order = filters.order || 'desc';
    
    const conditions: any[] = [eq(closedTradesTable.mode, mode)]; // Step F (#618)
    
    // Phase 8.8.3-C-FINAL PART 1: Ghost filter in SQL - only return valid trades
    // Valid trade = closed_at IS NOT NULL AND exit_price > 0 AND close_reason IS NOT NULL AND close_reason != ''
    // P19-B7.2c: never_filled rows (a dropped pending maker — closed, NO exit price by
    // construction) pass the ghost filter EXPLICITLY so they are VISIBLE in the closed
    // list (Kyle); they are excluded from analytics separately (typed closeReason check
    // at the analytics endpoint), i.e. visible ≠ counted.
    if (filters.closedOnly) {
      conditions.push(sql`${closedTradesTable.closedAt} IS NOT NULL`);
      conditions.push(sql`(
        ${closedTradesTable.closeReason} = 'never_filled'
        OR (
          ${closedTradesTable.exitPrice} IS NOT NULL
          AND ${closedTradesTable.exitPrice} > 0
          AND ${closedTradesTable.closeReason} IS NOT NULL
          AND ${closedTradesTable.closeReason} != ''
        )
      )`);
    }
    if (filters.symbol) {
      conditions.push(sql`LOWER(${closedTradesTable.symbol}) LIKE LOWER(${'%' + filters.symbol + '%'})`);
    }
    if (filters.strategy && filters.strategy !== 'all') {
      conditions.push(eq(closedTradesTable.strategyName, filters.strategy as any));
    }
    // Phase 8.8.3-C-FINAL PART 4: Add closeReason filter
    if (filters.closeReason && filters.closeReason !== 'all') {
      conditions.push(sql`${closedTradesTable.closeReason} = ${filters.closeReason}`);
    }
    // Phase 8.8.3-C-FINAL-2: Date filters now receive UTC ISO timestamps from frontend
    // Frontend converts user's local date selection to UTC boundaries before sending
    // We use the timestamps directly - no re-adjustment needed
    if (filters.dateFrom) {
      console.log(`[C-FINAL-2][DATE_FILTER] dateFrom=${filters.dateFrom.toISOString()} (using directly)`);
      conditions.push(sql`${closedTradesTable.closedAt} >= ${filters.dateFrom}`);
    }
    if (filters.dateTo) {
      console.log(`[C-FINAL-2][DATE_FILTER] dateTo=${filters.dateTo.toISOString()} (using directly)`);
      conditions.push(sql`${closedTradesTable.closedAt} <= ${filters.dateTo}`);
    }
    
    // Phase 8.8.3-C-FINAL: Expanded sort columns for all Trade History columns
    const sortColumn = {
      openedAt: closedTradesTable.openedAt,
      closedAt: closedTradesTable.closedAt,
      symbol: closedTradesTable.symbol,
      pnl: closedTradesTable.pnl,
      pnlPercent: closedTradesTable.pnlPercent,
      strategyName: closedTradesTable.strategyName,
      entryPrice: closedTradesTable.entryPrice,
      exitPrice: closedTradesTable.exitPrice,
      quantity: closedTradesTable.quantity,
      closeReason: closedTradesTable.closeReason,
      confidence: closedTradesTable.confidence,
      totalFee: closedTradesTable.totalFee,
      entrySlippage: closedTradesTable.entrySlippage,
      exitSlippage: closedTradesTable.exitSlippage,
    }[sortBy];
    
    const orderFn = order === 'asc' ? asc : desc;
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(closedTradesTable)
      .where(whereClause);
    
    const trades = await db.select()
      .from(closedTradesTable)
      .where(whereClause)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset);
    
    return {
      trades,
      totalCount: countResult?.count || 0
    };
  }

  // Phase 27.F.14.B: Global-per-mode query for LATTI baseline calculations
  async getClosedTradesGlobal(mode: TradingMode, filters?: { limit?: number; closedOnly?: boolean; includeNeverFilled?: boolean }): Promise<ClosedTrade[]> {
    const limit = filters?.limit || 1000; // Higher default for global aggregation
    const closedOnly = filters?.closedOnly ?? false;

    const conditions: any[] = [eq(closedTradesTable.mode, mode)]; // Step F (#618)
    if (closedOnly) {
      conditions.push(sql`${closedTradesTable.closedAt} IS NOT NULL` as any);
    }
    // P19-B7.2c: never_filled rows excluded by default (typed guard — see getClosedTrades).
    if (!filters?.includeNeverFilled) {
      conditions.push(sql`${closedTradesTable.closeReason} IS DISTINCT FROM 'never_filled'` as any);
    }

    const query = db.select()
      .from(closedTradesTable)
      .orderBy(desc(closedTradesTable.closedAt))
      .limit(limit);
    
    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    
    return await query;
  }

  // B-PROMOTION-RACE-FIX (#508): returns { position, created }. `created=false` is the I8E
  // dedup-return — a concurrent open won this symbol's single position slot, so the caller must
  // compensate (delete its own orphaned trade record). Previously this swallowed the 23505 and
  // returned the winner's row as if it were the caller's own, stranding the loser's closed_trades
  // record with no signal — the second, independent orphan defect.
  async createActiveOpenPosition(mode: TradingMode, position: InsertActiveOpenPosition): Promise<{ position: ActiveOpenPosition; created: boolean }> {
    // [I8C-SYMBOL-NORM] Normalize symbol to canonical BASE/QUOTE format
    const canonicalSymbol = normalizeToInternalSymbol(position.symbol);
    if (position.symbol !== canonicalSymbol) {
      console.log(`[I8C-SYMBOL-NORM] raw=${position.symbol} canonical=${canonicalSymbol}`);
    }
    const normalizedPosition = { ...position, symbol: canonicalSymbol };

    // Phase 8.8.3-I8E: Handle unique constraint violations gracefully
    try {
      const [result] = await db.insert(activeOpenPositions).values(normalizedPosition).returning();
      return { position: result, created: true };
    } catch (error: any) {
      // The active table's unique index is `active_open_positions_symbol_idx` (symbol ALONE);
      // 23505 is the reliable signal. (Was 'unique_symbol_side' — the PAPER table's constraint
      // name; dead/misleading on this path since code===23505 already covers it. Corrected per
      // B-PROMOTION-RACE-FIX / §15 no-legacy-lingering.)
      if (error?.code === '23505' || error?.message?.includes('active_open_positions_symbol_idx') || error?.message?.includes('duplicate key')) {
        console.log(`[I8E-DB-DEDUP] Duplicate position blocked: ${canonicalSymbol}/${position.side} - constraint prevented insert`);
        // A concurrent open won this symbol's single position slot. Return it with created=false
        // so the caller compensates its own orphaned record (B-PROMOTION-RACE-FIX #508).
        const existing = await db.select()
          .from(activeOpenPositions)
          .where(eq(activeOpenPositions.symbol, canonicalSymbol));
        if (existing.length > 0) {
          console.log(`[I8E-DB-DEDUP] Returning winner position ${existing[0].id} with created=false — caller compensates its orphaned trade record`);
          return { position: existing[0], created: false };
        }
        // Edge: 23505 fired but no existing row found — do NOT swallow; re-throw (do not fabricate
        // a created=false with no position). Langston Step-4 refinement 2.
      }
      // Re-throw other errors
      throw error;
    }
  }

  async updateActiveOpenPosition(mode: TradingMode, id: string, updates: Partial<ActiveOpenPosition>): Promise<ActiveOpenPosition> {
    const [result] = await db.update(activeOpenPositions)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(activeOpenPositions.id, id))
      .returning();
    return result;
  }

  async getActiveOpenPosition(mode: TradingMode, id: string): Promise<ActiveOpenPosition | undefined> {
    const [position] = await db.select()
      .from(activeOpenPositions)
      .where(eq(activeOpenPositions.id, id));
    return position || undefined;
  }

  async getActiveOpenPositionBySymbol(mode: TradingMode, symbol: string): Promise<ActiveOpenPosition | undefined> {
    // Phase 27.F.15.B.2: Global query, mode-based only
    const [position] = await db.select()
      .from(activeOpenPositions)
      .where(eq(activeOpenPositions.symbol, symbol));
    return position || undefined;
  }

  async getActiveOpenPositions(mode: TradingMode): Promise<ActiveOpenPosition[]> {
    // Phase 27.F.15.B.2: Global query, mode-based only
    return await db.select()
      .from(activeOpenPositions)
      .orderBy(desc(activeOpenPositions.openedAt));
  }

  async deleteActiveOpenPosition(mode: TradingMode, id: string): Promise<void> {
    await db.delete(activeOpenPositions).where(eq(activeOpenPositions.id, id));
  }

  // Phase 27.F.13.C: Reset simulation methods - Phase 27.F.15.B.2: Mode-based only
  async deleteAllActiveOpenPositions(mode: TradingMode): Promise<void> {
    await db.delete(activeOpenPositions);
  }

  async deleteAllActiveTradeLogs(mode: TradingMode): Promise<void> {
    await db.delete(activeTradeLogs);
  }

  async deleteAllClosedTrades(mode: TradingMode): Promise<void> {
    await db.delete(closedTradesTable);
  }

  // B-PROMOTION-RACE-FIX (#508): delete a single UNCLOSED closed_trades row by id. Used by the
  // open-path dup-race compensation to remove the loser's orphaned record when
  // createActiveOpenPosition returns created=false.
  // ★ The `closedAt IS NULL` predicate is part of the CONTRACT, not an optimisation (Langston
  // Step-4 should-fix 1): it makes the balance-neutrality guarantee STRUCTURAL rather than
  // conventional — the computed paper balance sums only closed_at-populated rows + live positions
  // (routes.ts:12306-12323), so a row this method can delete is provably in neither sum. It is
  // behaviour-identical for the intended caller (the orphan is closed_at-NULL by construction) and
  // makes misuse as a general-purpose trade delete IMPOSSIBLE rather than merely discouraged (§11).
  async deleteClosedTrade(mode: TradingMode, id: string): Promise<void> {
    await db.delete(closedTradesTable)
      .where(and(eq(closedTradesTable.id, id), isNull(closedTradesTable.closedAt)));
  }



  async createActiveTradeLog(mode: TradingMode, log: InsertActiveTradeLog): Promise<ActiveTradeLog> {
    const [result] = await db.insert(activeTradeLogs).values(log).returning();
    return result;
  }

  async getActiveTradeLogs(mode: TradingMode, filters?: { limit?: number; tradeId?: string }): Promise<ActiveTradeLog[]> {
    // Phase 27.F.15.B.2: Global query, mode-based only
    const limit = filters?.limit || 100;
    
    const conditions = [];
    if (filters?.tradeId) {
      conditions.push(eq(activeTradeLogs.tradeId, filters.tradeId));
    }
    
    if (conditions.length > 0) {
      return await db.select()
        .from(activeTradeLogs)
        .where(and(...conditions))
        .orderBy(desc(activeTradeLogs.timestamp))
        .limit(limit);
    }
    
    return await db.select()
      .from(activeTradeLogs)
      .orderBy(desc(activeTradeLogs.timestamp))
      .limit(limit);
  }

  async getActiveEngineStats(mode: TradingMode): Promise<{
    totalTrades: number;
    openPositions: number;
    closedTrades: number;
    totalPnl: number;
    winRate: number;
    avgReturn: number;
    avgHoldingTime: number;
    byStrategy: Array<{
      strategy: string;
      count: number;
      winRate: number;
      avgReturn: number;
      totalPnl: number;
    }>;
  }> {
    // Step F (#618): the 27.F.15.B.2 comment above USED to say "mode-based only" over a query
    // with no mode filter at all -- it recorded the removal of userId scoping and described the
    // mode half as though it had been built. It had not, because only paper existed to scope.
    // ★ THIS READER WAS FOUND BY THE PARTITION FENCE, NOT BY MY CENSUS -- the tenth of ten, and
    // the third the fence caught after I had reported the census complete at seven.
    const trades = await db.select()
      .from(closedTradesTable)
      .where(eq(closedTradesTable.mode, mode));

    // ⚠️ THE OPEN-POSITIONS HALF CANNOT BE SCOPED YET: active_open_positions has no mode column.
    // That is Step G, and it is the dependency that forced G to follow F rather than merge with
    // it -- a delete or a filter cannot reference a column that does not exist.

    const openPositions = await db.select()
      .from(activeOpenPositions);

    const totalTrades = trades.length;
    const closedTrades = trades.filter(t => t.closedAt).length;
    const openCount = openPositions.length;

    const totalPnl = trades.reduce((acc, t) => 
      acc + (t.pnl ? parseFloat(t.pnl) : 0), 0
    );

    const winning = trades.filter(t => t.pnl && parseFloat(t.pnl) > 0).length;
    const winRate = closedTrades > 0 ? (winning / closedTrades) * 100 : 0;

    const avgReturn = trades.reduce((acc, t) => 
      acc + (t.pnlPercent ? parseFloat(t.pnlPercent) : 0), 0
    ) / (closedTrades || 1);

    // Calculate average holding time in hours
    const holdingTimes = trades
      .filter(t => t.openedAt && t.closedAt)
      .map(t => {
        const opened = new Date(t.openedAt).getTime();
        const closed = new Date(t.closedAt!).getTime();
        return (closed - opened) / (1000 * 60 * 60); // Convert to hours
      });
    const avgHoldingTime = holdingTimes.length > 0 
      ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length 
      : 0;

    // Group by strategy
    const byStrategy = Array.from(
      trades.reduce((map, trade) => {
        const strategy = trade.strategyName;
        if (!map.has(strategy)) {
          map.set(strategy, []);
        }
        map.get(strategy)!.push(trade);
        return map;
      }, new Map<string, typeof trades>())
    ).map(([strategy, strategyTrades]) => {
      const count = strategyTrades.length;
      const wins = strategyTrades.filter(t => t.pnl && parseFloat(t.pnl) > 0).length;
      const winRate = count > 0 ? (wins / count) * 100 : 0;
      const totalPnl = strategyTrades.reduce((acc, t) => 
        acc + (t.pnl ? parseFloat(t.pnl) : 0), 0
      );
      const avgReturn = strategyTrades.reduce((acc, t) => 
        acc + (t.pnlPercent ? parseFloat(t.pnlPercent) : 0), 0
      ) / (count || 1);
      
      return { strategy, count, winRate, avgReturn, totalPnl };
    });

    return {
      totalTrades,
      openPositions: openCount,
      closedTrades,
      totalPnl,
      winRate,
      avgReturn,
      avgHoldingTime,
      byStrategy
    };
  }
  
  // Paper simulation session methods
  async createActiveEngineSession(session: InsertActiveEngineSession): Promise<ActiveEngineSession> {
    const [result] = await db.insert(activeEngineSessions).values(session).returning();
    return result;
  }

  async updateActiveEngineSession(id: string, updates: Partial<ActiveEngineSession>): Promise<ActiveEngineSession> {
    const [result] = await db.update(activeEngineSessions)
      .set(updates)
      .where(eq(activeEngineSessions.id, id))
      .returning();
    return result;
  }

  async getActiveEngineSession(id: string): Promise<ActiveEngineSession | undefined> {
    const [session] = await db.select()
      .from(activeEngineSessions)
      .where(eq(activeEngineSessions.id, id));
    return session || undefined;
  }

  async getActiveEngineSessionBySessionId(sessionId: string): Promise<ActiveEngineSession | undefined> {
    const [session] = await db.select()
      .from(activeEngineSessions)
      .where(eq(activeEngineSessions.sessionId, sessionId));
    return session || undefined;
  }

  async getRunningEngineSession(mode: 'live' | 'paper'): Promise<ActiveEngineSession | undefined> {
    console.log('[3D] ActiveEngine query fixed: mode-based session lookup');
    const [session] = await db.select()
      .from(activeEngineSessions)
      .where(and(
        eq(activeEngineSessions.mode, mode),
        eq(activeEngineSessions.status, 'running')
      ))
      .orderBy(desc(activeEngineSessions.startedAt))
      .limit(1);
    return session || undefined;
  }

  async getRunningEngineSessions(): Promise<ActiveEngineSession[]> {
    // Get all running sessions across all users (for heartbeat monitoring)
    return await db.select()
      .from(activeEngineSessions)
      .where(eq(activeEngineSessions.status, 'running'))
      .orderBy(desc(activeEngineSessions.startedAt));
  }

  async getActiveEngineSessions(userId: string, filters?: { limit?: number; status?: string }): Promise<ActiveEngineSession[]> {
    const limit = filters?.limit || 50;

    // P19-B3b: active_engine_sessions is single-tenant (Phase 2C — userId column
    // removed). The legacy userId-equality filter referenced a dropped column;
    // remove it. The userId param is retained for interface compatibility but no
    // longer filters (mode-based, single-tenant). Optional status filter stays.
    const query = db.select().from(activeEngineSessions)
      .orderBy(desc(activeEngineSessions.startedAt));

    if (filters?.status) {
      return await query.where(eq(activeEngineSessions.status, filters.status as any)).limit(limit);
    }

    return await query.limit(limit);
  }
  
  // Phase 8.8.3-J: Execution Attempt Audit methods (read-only diagnostics)
  async createExecutionAttemptAudit(audit: InsertExecutionAttemptAudit): Promise<ExecutionAttemptAudit> {
    const [result] = await db.insert(executionAttemptAudit).values(audit).returning();
    return result;
  }
  
  async getExecutionAttemptAudits(mode: 'live' | 'paper', filters?: { 
    limit?: number; 
    decision?: 'OPENED' | 'BLOCKED';
    symbol?: string;
    strategy?: string;
  }): Promise<ExecutionAttemptAudit[]> {
    const limit = filters?.limit || 100;
    const conditions: any[] = [eq(executionAttemptAudit.mode, mode)];
    
    if (filters?.decision) {
      conditions.push(eq(executionAttemptAudit.decision, filters.decision));
    }
    if (filters?.symbol) {
      conditions.push(eq(executionAttemptAudit.symbol, filters.symbol));
    }
    if (filters?.strategy) {
      conditions.push(eq(executionAttemptAudit.strategy, filters.strategy as any));
    }
    
    return await db.select()
      .from(executionAttemptAudit)
      .where(and(...conditions))
      .orderBy(desc(executionAttemptAudit.createdAt))
      .limit(limit);
  }
  
  async getExecutionAttemptMetrics(mode: 'live' | 'paper', sessionStart?: Date | null): Promise<{
    totalAttempts: number;
    opened: number;
    blocked: number;
    blockedByReason: Record<string, number>;
    last24hAttempts: number;
    last24hOpened: number;
    last24hBlocked: number;
    isSessionActive: boolean;
  }> {
    // Phase 8.8.3-AJ8: Session-based metrics - reset when engine stops
    // If no sessionStart provided or null, return zeros (engine not running)
    if (!sessionStart) {
      console.log(`[AJ8][METRICS] No active session - returning zero metrics (mode=${mode})`);
      return {
        totalAttempts: 0,
        opened: 0,
        blocked: 0,
        blockedByReason: {},
        last24hAttempts: 0,
        last24hOpened: 0,
        last24hBlocked: 0,
        isSessionActive: false
      };
    }
    
    // Only count audits from current session (after sessionStart)
    const allAudits = await db.select()
      .from(executionAttemptAudit)
      .where(and(
        eq(executionAttemptAudit.mode, mode),
        gte(executionAttemptAudit.createdAt, sessionStart)
      ));
    
    const totalAttempts = allAudits.length;
    const opened = allAudits.filter(a => a.decision === 'OPENED').length;
    const blocked = allAudits.filter(a => a.decision === 'BLOCKED').length;
    
    // Group blocked by reason
    const blockedByReason: Record<string, number> = {};
    allAudits
      .filter(a => a.decision === 'BLOCKED' && a.blockReason)
      .forEach(a => {
        const reason = a.blockReason as string;
        blockedByReason[reason] = (blockedByReason[reason] || 0) + 1;
      });
    
    // Last 24 hours (capped at session start)
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const effectiveLast24h = last24h > sessionStart ? last24h : sessionStart;
    const last24hAudits = allAudits.filter(a => new Date(a.createdAt) >= effectiveLast24h);
    const last24hAttempts = last24hAudits.length;
    const last24hOpened = last24hAudits.filter(a => a.decision === 'OPENED').length;
    const last24hBlocked = last24hAudits.filter(a => a.decision === 'BLOCKED').length;
    
    console.log(`[AJ8][METRICS] Session active since ${sessionStart.toISOString()}, metrics: attempts=${totalAttempts}, opened=${opened}, blocked=${blocked}`);
    
    return {
      totalAttempts,
      opened,
      blocked,
      blockedByReason,
      last24hAttempts,
      last24hOpened,
      last24hBlocked,
      isSessionActive: true
    };
  }
  
  // Portfolio State methods (Phase 8.5 Addendum K.3 - Global Context)
  async getPortfolioState(params: { globalContextId?: string; userId?: string; mode: 'live' | 'paper' }): Promise<PortfolioState | undefined> {
    const contextId = params.globalContextId || 'default';
    const [state] = await db.select().from(portfolioState)
      .where(and(
        eq(portfolioState.globalContextId, contextId),
        eq(portfolioState.mode, params.mode)
      ));
    return state || undefined;
  }
  
  // P19-B8.5 (single-writer balance, rule 18): upsertPortfolioState + updatePortfolioBalance
  // DELETED — portfolio_state.balance is writable by executeReanchor (portfolio-anchor-service)
  // ONLY. Every former caller was dispositioned in the $800-clobber writer audit: the engine
  // start-sync became read-and-verify, the reset-route write was removed (reset = cleanup, not
  // a balance authority), the config-PATCH route was deleted, confirmPortfolioBalance was
  // deleted (zero callers), and the bootstrap initializer now mints genesis balances through
  // executeReanchor('launch_snap'). See DELETED_COMPONENTS_LOG.md.

  // Expert Updates methods (Phase 5.8 - Task 5)
  async getExpertUpdatesByWeek(weekOf: string): Promise<any[]> {
    const { expertUpdates } = await import('@shared/schema');
    return await db.select()
      .from(expertUpdates)
      .where(eq(expertUpdates.weekOf, weekOf));
  }

  async createExpertUpdate(update: {
    sourceId: string;
    sourceName: string;
    author: string;
    insight: string;
    url?: string;
    credibilityScore: number;
    date: string;
    weekOf: string;
  }): Promise<any> {
    const { expertUpdates } = await import('@shared/schema');
    const [created] = await db.insert(expertUpdates).values(update).returning();
    return created;
  }

  async checkExpertUpdateDuplicate(insightText: string): Promise<boolean> {
    const { expertUpdates } = await import('@shared/schema');
    const [existing] = await db.select()
      .from(expertUpdates)
      .where(eq(expertUpdates.insight, insightText))
      .limit(1);
    return !!existing;
  }

  async getExpertSources(filters?: { isActive?: boolean }): Promise<any[]> {
    const { expertSources } = await import('@shared/schema');
    let query = db.select().from(expertSources);
    
    if (filters?.isActive !== undefined) {
      query = query.where(eq(expertSources.isActive, filters.isActive)) as any;
    }
    
    return await query;
  }

  // Tuning methods (Phase 26.1)
  async getTuningPolicy(params: { userId: string; mode: 'live' | 'paper' }): Promise<any | null> {
    const { tuningPolicy } = await import('@shared/schema');
    const [policy] = await db
      .select()
      .from(tuningPolicy)
      .where(and(
        eq(tuningPolicy.userId, params.userId),
        eq(tuningPolicy.mode, params.mode)
      ))
      .limit(1);
    return policy || null;
  }

  async upsertTuningPolicy(data: any): Promise<any> {
    const { tuningPolicy } = await import('@shared/schema');
    const existing = await this.getTuningPolicy({ userId: data.userId, mode: data.mode });
    
    if (existing) {
      const [updated] = await db
        .update(tuningPolicy)
        .set({ ...data, lastUpdated: new Date() })
        .where(eq(tuningPolicy.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(tuningPolicy).values(data).returning();
    return created;
  }

  async getTuningEvents(params: { userId: string; mode?: string; limit?: number }): Promise<any[]> {
    const { tuningEvent } = await import('@shared/schema');
    const conditions: any[] = [eq(tuningEvent.userId, params.userId)];
    
    if (params.mode) {
      conditions.push(eq(tuningEvent.mode, params.mode));
    }
    
    return await db
      .select()
      .from(tuningEvent)
      .where(and(...conditions))
      .orderBy(desc(tuningEvent.createdAt))
      .limit(params.limit || 50);
  }

  async createTuningEvent(data: any): Promise<any> {
    const { tuningEvent } = await import('@shared/schema');
    const [created] = await db.insert(tuningEvent).values(data).returning();
    return created;
  }

  async updateTuningEvent(id: string, updates: any): Promise<any> {
    const { tuningEvent } = await import('@shared/schema');
    const [updated] = await db
      .update(tuningEvent)
      .set(updates)
      .where(eq(tuningEvent.id, id))
      .returning();
    return updated;
  }

  // System Context methods (Phase 27.4: Trading State Synchronization)
  // Phase 27.F.13.O: Refactored for global-per-mode architecture (mode-only, no userId)
  async getSystemContext(mode: 'live' | 'paper'): Promise<SystemContext | undefined> {
    const [context] = await db
      .select()
      .from(systemContext)
      .where(eq(systemContext.tradingMode, mode));
    return context || undefined;
  }

  async upsertSystemContext(data: Partial<InsertSystemContext> & { tradingMode: 'live' | 'paper' }): Promise<SystemContext> {
    const existing = await this.getSystemContext(data.tradingMode);
    
    if (existing) {
      const [updated] = await db
        .update(systemContext)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(systemContext.tradingMode, data.tradingMode))
        .returning();
      return updated;
    }
    
    const [created] = await db
      .insert(systemContext)
      .values(data as InsertSystemContext)
      .returning();
    return created;
  }

  async updateSystemContext(mode: 'live' | 'paper', updates: Partial<SystemContext>): Promise<SystemContext> {
    const [updated] = await db
      .update(systemContext)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(systemContext.tradingMode, mode))
      .returning();
    return updated;
  }
  
  // System Alert methods (OpenAI Rate Limiter)
  async createSystemAlert(alert: InsertSystemAlert): Promise<SystemAlert> {
    const [created] = await db
      .insert(systemAlerts)
      .values(alert)
      .returning();
    
    console.log(`[SystemAlert] Created ${alert.severity} alert for user ${alert.userId}: ${alert.alertType}`);
    return created;
  }
  
  // Phase 28.C: Override Audit History methods
  async addAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db
      .insert(auditLog)
      .values(log)
      .returning();
    
    return created;
  }
  
  async getRecentAuditLogs(params: { mode?: 'live' | 'paper'; entityType?: string; limit?: number; since?: Date }): Promise<AuditLog[]> {
    const { mode, entityType, limit = 50, since } = params;
    
    let query = db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.timestamp))
      .limit(limit);
    
    const conditions = [];
    if (mode) {
      conditions.push(eq(auditLog.tradingMode, mode));
    }
    if (entityType) {
      conditions.push(eq(auditLog.entityType, entityType as any));
    }
    if (since) {
      conditions.push(gte(auditLog.timestamp, since));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query;
  }

  // Phase 8.8.4-B: RTB Signals Queue methods
  // P19-B6.5b: insertRtbSignal impl removed (zero callers — DELETED_COMPONENTS_LOG). upsertRtbSignal is live.

  /**
   * Phase 8.8.4-C.13.B: Upsert RTB signal with ON CONFLICT UPDATE
   * R9.3.HF-1: Updated to match new unique index on (mode, symbol, strategy) only
   * R9.3.HF-2: Added trace logging for audit and confirmation
   * Prevents duplicate key errors by updating existing signals instead of failing
   */
  async upsertRtbSignal(data: InsertRtbSignal): Promise<RtbSignal> {
    console.log(`[A3.R9.3.HF-2] Upserting RTB signal: ${data.symbol}/${data.strategy} (mode=${data.mode}, status=${data.status})`);
    
    const [result] = await db
      .insert(rtbSignals)
      .values(data)
      .onConflictDoUpdate({
        target: [rtbSignals.mode, rtbSignals.symbol, rtbSignals.strategy],
        set: {
          entryPrice: data.entryPrice,
          stopPrice: data.stopPrice,
          targetPrice: data.targetPrice,
          quantity: data.quantity,
          notional: data.notional,
          confidence: data.confidence,
          riskScore: data.riskScore,
          expectedReturn: data.expectedReturn,
          finalScore: data.finalScore,
          // ★ B-RANKING-COMPONENT-CAPTURE (#555, 2026-07-22): `regimeWeight`/`hybridScore`/
          // `decayPenalty` mappings REMOVED with their columns. They were writer-shaped code
          // pointing at nothing — the queue-insert builder never supplied them, so this
          // mapping was fed `undefined` on every upsert and the columns were NULL from birth
          // on all rows. Their only reader (the shadow-pairing capture) now reads metadata,
          // which is the SSOT for these derived components. Columns dropped in the same batch
          // per §15 (no lingering legacy); see DELETED_COMPONENTS_LOG.
          status: data.status,
          queuedAt: new Date(),
          expiresAt: data.expiresAt,
          metadata: data.metadata,
          // B79.0n.RTB (2026-05-27, Phase 1): dual-write asset_class column
          // alongside metadata so per-class queue reads can filter by the
          // indexed column. assetClass passed through from upstream callers
          // (signal-orchestrator queueSQESignal threading).
          assetClass: data.assetClass,
        },
      })
      .returning();
    
    console.log(`[A3.R9.3.HF-2] RTB signal upserted successfully: ${data.symbol}/${data.strategy}`);
    return result;
  }

  async getRtbSignals(filters: {
    mode: 'live' | 'paper';
    status?: string;
    symbol?: string;
    strategy?: string;
    /** B79.0n.RTB (2026-05-27): per-class queue filter. Optional; undefined preserves backwards-compat global-read behavior. */
    assetClass?: string;
    orderBy?: string;
    orderDir?: string;
    limit?: number
  }): Promise<RtbSignal[]> {
    const { mode, status, symbol, strategy, assetClass, orderBy = 'queuedAt', orderDir = 'desc', limit } = filters;

    const conditions = [eq(rtbSignals.mode, mode)];

    if (status) {
      conditions.push(eq(rtbSignals.status, status as any));
    }
    if (symbol) {
      conditions.push(eq(rtbSignals.symbol, symbol));
    }
    if (strategy) {
      conditions.push(eq(rtbSignals.strategy, strategy as any));
    }
    if (assetClass) {
      // B79.0n.RTB: per-class queue filter — uses the
      // rtb_signals_mode_asset_class_status_idx index for hot reads.
      conditions.push(eq(rtbSignals.assetClass, assetClass));
    }
    
    let query = db
      .select()
      .from(rtbSignals)
      .where(and(...conditions));
    
    // Directive 11.0F: finalScore is the ONLY ranking metric
    if (orderBy === 'finalScore') {
      query = query.orderBy(orderDir === 'asc' ? asc(rtbSignals.finalScore) : desc(rtbSignals.finalScore)) as any;
    } else {
      query = query.orderBy(orderDir === 'asc' ? asc(rtbSignals.queuedAt) : desc(rtbSignals.queuedAt)) as any;
    }
    
    if (limit) {
      query = query.limit(limit) as any;
    }
    
    return await query;
  }

  async getRtbSignalById(id: string): Promise<RtbSignal | undefined> {
    const [result] = await db
      .select()
      .from(rtbSignals)
      .where(eq(rtbSignals.id, id));
    return result;
  }

  async updateRtbSignal(id: string, updates: Partial<RtbSignal>): Promise<RtbSignal> {
    const [updated] = await db
      .update(rtbSignals)
      .set(updates)
      .where(eq(rtbSignals.id, id))
      .returning();
    return updated;
  }

  async deleteRtbSignals(filters: { mode: 'live' | 'paper'; id?: string; symbol?: string; strategy?: string; status?: string }): Promise<number> {
    const conditions = [eq(rtbSignals.mode, filters.mode)];
    
    // A3.R8.4.A: Support deletion by ID for immediate cleanup
    if (filters.id) {
      conditions.push(eq(rtbSignals.id, filters.id));
    }
    if (filters.symbol) {
      conditions.push(eq(rtbSignals.symbol, filters.symbol));
    }
    if (filters.strategy) {
      conditions.push(eq(rtbSignals.strategy, filters.strategy));
    }
    if (filters.status) {
      conditions.push(eq(rtbSignals.status, filters.status));
    }
    
    const result = await db
      .delete(rtbSignals)
      .where(and(...conditions))
      .returning();
    return result.length;
  }

  /**
   * Directive 8.8.4-A4.R10R-3.T3: Batch update RTB signals
   * Performs all updates in a single transaction for efficiency
   */
  async updateRtbSignalsBatch(updates: Array<{ id: string; updates: Partial<RtbSignal> }>): Promise<number> {
    if (updates.length === 0) return 0;
    
    let updatedCount = 0;
    for (const { id, updates: signalUpdates } of updates) {
      try {
        await db
          .update(rtbSignals)
          .set(signalUpdates)
          .where(eq(rtbSignals.id, id));
        updatedCount++;
      } catch (error) {
        console.error(`[T3][BATCH_UPDATE] Failed to update signal ${id}:`, error);
      }
    }
    return updatedCount;
  }

  /**
   * Directive 8.8.4-A4.R10R-3.T3: Batch delete RTB signals by IDs
   * Deletes all specified signals in a single query
   */
  async deleteRtbSignalsByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    const result = await db
      .delete(rtbSignals)
      .where(inArray(rtbSignals.id, ids))
      .returning();
    return result.length;
  }

  /**
   * Phase 8.8.3-B7.A: Hard reset paper simulation
   * Closes all open trades and clears all open positions for a clean session start.
   * Note: closedTradesTable and activeOpenPositions are single-tenant (no mode column).
   * activeEngineSessions has a mode column for session tracking.
   */
  async hardResetActiveEngineTables(mode: 'paper' | 'live' = 'paper'): Promise<{ closedTrades: number; clearedPositions: number }> {
    console.log(`[B7.A][DB] Starting hard reset for mode=${mode}`);
    
    const { closedTradesTable, activeOpenPositions, activeEngineSessions } = await import('@shared/schema');
    
    let closedTrades = 0;
    let clearedPositions = 0;
    
    try {
      // 1. Close any open paper trades with hard_reset reason
      // Note: closedTradesTable is single-tenant, no mode column
      const closeTradesResult = await db
        .update(closedTradesTable)
        .set({ 
          closedAt: new Date(), 
          closeReason: 'hard_reset' 
        })
        .where(isNull(closedTradesTable.closedAt))
        .returning();
      
      closedTrades = closeTradesResult.length;
      console.log(`[B7.A][DB] Closed ${closedTrades} open trades`);
      
      // 2. Delete all open positions snapshot
      // Note: activeOpenPositions is single-tenant, no mode column
      const deletePositionsResult = await db
        .delete(activeOpenPositions)
        .returning();
      
      clearedPositions = deletePositionsResult.length;
      console.log(`[B7.A][DB] Cleared ${clearedPositions} open positions`);
      
      // 3. End any running paper sim sessions (this table HAS a mode column)
      await db
        .update(activeEngineSessions)
        .set({
          status: 'stopped',
          stoppedAt: new Date(),
          // P19-B3b: active_engine_sessions has no stoppedBy column (only startedAt/
          // stoppedAt/startedBy). The stop is recorded by status='stopped' +
          // stoppedAt; the 'hard_reset' provenance is in the [B7.A][DB] log line
          // above. Removed the nonexistent-column reference.
        })
        .where(and(
          eq(activeEngineSessions.mode, mode),
          eq(activeEngineSessions.status, 'running')
        ));
      
      console.log(`[B7.A][DB] Hard reset complete: ${closedTrades} trades closed, ${clearedPositions} positions cleared`);
      
      return { closedTrades, clearedPositions };
    } catch (error) {
      console.error(`[B7.A][DB] Hard reset error:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();
