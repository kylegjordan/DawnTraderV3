import { 
  users, 
  tradingSettings,
  guardrails,
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
  aiOpportunityRuns,
  aiOpportunities,
  dailyBriefs,
  paperTrades,
  paperDailyBriefs,
  paperAIReports,
  signalWeights,
  predictionOutcomes,
  featureSnapshots,
  intradayAdjustments,
  aiLessons,
  portfolioAdjustments,
  userGoalsLive,
  userGoalsPaper,
  goalAnalysisHistoryLive,
  goalAnalysisHistoryPaper,
  contextChats,
  aiOrchestratorLogs,
  type User, 
  type InsertUser,
  type TradingSettings,
  type InsertTradingSettings,
  type Guardrails,
  type InsertGuardrails,
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
  type AITransparencyLog,
  type InsertContextChat,
  type ContextChat,
  type AIOrchestratorLog,
  type InsertAIOrchestratorLog,
  type InsertAITransparencyLog,
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
  type IntradayAdjustment,
  type InsertIntradayAdjustment,
  type AILesson,
  type InsertAILesson,
  type PortfolioAdjustment,
  type InsertPortfolioAdjustment,
  type UserGoalLive,
  type InsertUserGoalLive,
  type UserGoalPaper,
  type InsertUserGoalPaper,
  type GoalAnalysisHistoryLive,
  type InsertGoalAnalysisHistoryLive,
  type GoalAnalysisHistoryPaper,
  type InsertGoalAnalysisHistoryPaper,
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
  type PaperSimTrade,
  type InsertPaperSimTrade,
  paperSimTrades,
  type PaperSimOpenPosition,
  type InsertPaperSimOpenPosition,
  paperSimOpenPositions,
  type PaperSimTradeLog,
  type InsertPaperSimTradeLog,
  paperSimTradeLogs,
  type WalterPendingApproval,
  type InsertWalterPendingApproval,
  walterPendingApprovals,
  type WalterChat,
  type InsertWalterChat,
  walterChats,
  type WalterChatLog,
  type InsertWalterChatLog,
  walterChatLogs,
  type WalterApprovalsAudit,
  type InsertWalterApprovalsAudit,
  walterApprovalsAudit,
  type WalterMemory,
  type InsertWalterMemory,
  walterMemory
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Trading settings methods
  getTradingSettings(userId: string): Promise<TradingSettings | undefined>;
  createTradingSettings(settings: InsertTradingSettings): Promise<TradingSettings>;
  updateTradingSettings(userId: string, updates: Partial<TradingSettings>): Promise<TradingSettings>;

  // Guardrails methods
  getGuardrails(params: { userId: string; mode: 'live' | 'paper' }): Promise<Guardrails | null>;
  upsertGuardrails(data: InsertGuardrails): Promise<Guardrails>;

  // Screener filters methods
  getScreenerFilters(params: { userId: string; mode: 'live' | 'paper' }): Promise<ScreenerFilters | null>;
  upsertScreenerFilters(data: InsertScreenerFilters): Promise<ScreenerFilters>;

  // Filter diagnostics methods
  getFilterDiagnostics(params: { userId: string; mode: 'live' | 'paper'; hours?: number }): Promise<any[]>;

  // Filter calibration methods
  getLatestCalibration(params: { userId: string; mode: 'live' | 'paper'; maxAgeHours?: number }): Promise<FilterCalibrationLog | null>;
  getLatestPaperCalibration(userId: string): Promise<FilterCalibrationLog | null>;
  getCalibrationWithFallback(userId: string, mode: 'live' | 'paper', maxAgeHours?: number): Promise<FilterCalibrationLog | null>;
  getRecentCalibrations(params: { userId?: string; mode: 'live' | 'paper'; limit?: number; maxAgeHours?: number }): Promise<FilterCalibrationLog[]>;
  createCalibration(data: InsertFilterCalibrationLog): Promise<FilterCalibrationLog>;

  // Screener results methods
  getScreenerResults(params: { userId: string; mode: 'live' | 'paper'; limit?: number }): Promise<ScreenerResult[]>;
  createScreenerResults(data: InsertScreenerResult[]): Promise<void>;
  deleteOldScreenerResults(params: { userId: string; mode: 'live' | 'paper'; beforeDate: Date }): Promise<void>;

  // Strategy settings methods
  getStrategySettings(params: { userId: string; mode: 'live' | 'paper'; strategy: string }): Promise<StrategySettings | null>;
  listStrategySettings(params: { userId: string; mode: 'live' | 'paper' }): Promise<StrategySettings[]>;
  upsertStrategySettings(row: InsertStrategySettings): Promise<StrategySettings>;
  insertStrategySettingsAudit(row: InsertStrategySettingsAudit): Promise<void>;
  listStrategySettingsAudit(params: { userId: string; limit?: number }): Promise<StrategySettingsAudit[]>;

  // Watchlist methods
  getWatchlist(params: { userId: string; mode: 'live' | 'paper' }): Promise<WatchlistPair[]>;
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
  
  // Context-specific chats (Goals, Guardrails, Screener, Strategies)
  getContextChats(userId: string, context: string): Promise<ContextChat[]>;
  saveContextChat(chat: InsertContextChat): Promise<ContextChat>;
  
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
  getPortfolioAdjustments(userId: string, filters?: { mode?: string; hours?: number; limit?: number }): Promise<PortfolioAdjustment[]>;

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

  // Paper simulation methods (Milestone 18)
  // Paper trades
  createPaperSimTrade(trade: InsertPaperSimTrade): Promise<PaperSimTrade>;
  updatePaperSimTrade(id: string, updates: Partial<PaperSimTrade>): Promise<PaperSimTrade>;
  getPaperSimTrade(id: string): Promise<PaperSimTrade | undefined>;
  getPaperSimTrades(userId: string, filters?: { limit?: number; closedOnly?: boolean }): Promise<PaperSimTrade[]>;
  getPaperSimTradesBySymbol(userId: string, symbol: string): Promise<PaperSimTrade[]>;
  
  // Open positions
  createPaperSimOpenPosition(position: InsertPaperSimOpenPosition): Promise<PaperSimOpenPosition>;
  updatePaperSimOpenPosition(id: string, updates: Partial<PaperSimOpenPosition>): Promise<PaperSimOpenPosition>;
  getPaperSimOpenPosition(id: string): Promise<PaperSimOpenPosition | undefined>;
  getPaperSimOpenPositionBySymbol(userId: string, symbol: string): Promise<PaperSimOpenPosition | undefined>;
  getPaperSimOpenPositions(userId: string): Promise<PaperSimOpenPosition[]>;
  deletePaperSimOpenPosition(id: string): Promise<void>;
  
  // Trade logs
  createPaperSimTradeLog(log: InsertPaperSimTradeLog): Promise<PaperSimTradeLog>;
  getPaperSimTradeLogs(userId: string, filters?: { limit?: number; tradeId?: string }): Promise<PaperSimTradeLog[]>;
  
  // Stats
  getPaperSimStats(userId: string): Promise<{
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
  
  // Walter AI Assistant methods
  createWalterPendingApproval(data: InsertWalterPendingApproval): Promise<WalterPendingApproval>;
  getPendingApprovals(userId: string, status?: string): Promise<WalterPendingApproval[]>;
  updateApprovalStatus(id: string, status: string, updates: Partial<WalterPendingApproval>): Promise<WalterPendingApproval>;
  
  createWalterChat(data: InsertWalterChat): Promise<WalterChat>;
  getWalterChats(userId: string, status?: string): Promise<WalterChat[]>;
  getWalterChatById(id: string): Promise<WalterChat | undefined>;
  updateWalterChat(id: string, updates: Partial<WalterChat>): Promise<WalterChat>;
  
  createWalterChatLog(log: InsertWalterChatLog): Promise<WalterChatLog>;
  getWalterChatLogs(chatSessionId: string, limit?: number): Promise<WalterChatLog[]>;
  
  createWalterApprovalsAudit(audit: InsertWalterApprovalsAudit): Promise<WalterApprovalsAudit>;
  getWalterApprovalsAudit(approvalId: string): Promise<WalterApprovalsAudit[]>;
  
  // Walter Memory methods
  createWalterMemory(memory: InsertWalterMemory): Promise<WalterMemory>;
  getWalterMemories(userId: string): Promise<WalterMemory[]>;
  getWalterMemory(id: string): Promise<WalterMemory | undefined>;
  updateWalterMemory(id: string, updates: Partial<WalterMemory>): Promise<WalterMemory>;
  deleteWalterMemory(id: string): Promise<void>;
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

  // Guardrails methods
  async getGuardrails(params: { userId: string; mode: 'live' | 'paper' }): Promise<Guardrails | null> {
    const [result] = await db
      .select()
      .from(guardrails)
      .where(and(eq(guardrails.userId, params.userId), eq(guardrails.mode, params.mode)));
    return result || null;
  }

  async upsertGuardrails(data: InsertGuardrails): Promise<Guardrails> {
    const existing = await this.getGuardrails({ userId: data.userId, mode: data.mode });
    
    if (existing) {
      const [result] = await db
        .update(guardrails)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(guardrails.userId, data.userId), eq(guardrails.mode, data.mode)))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(guardrails).values(data).returning();
      return result;
    }
  }

  // Screener filters methods
  async getScreenerFilters(params: { userId: string; mode: 'live' | 'paper' }): Promise<ScreenerFilters | null> {
    const [result] = await db
      .select()
      .from(screenerFilters)
      .where(and(eq(screenerFilters.userId, params.userId), eq(screenerFilters.mode, params.mode)));
    return result || null;
  }

  async upsertScreenerFilters(data: InsertScreenerFilters): Promise<ScreenerFilters> {
    const existing = await this.getScreenerFilters({ userId: data.userId, mode: data.mode });
    
    if (existing) {
      const [result] = await db
        .update(screenerFilters)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(screenerFilters.userId, data.userId), eq(screenerFilters.mode, data.mode)))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(screenerFilters).values(data).returning();
      return result;
    }
  }

  // Filter diagnostics methods
  async getFilterDiagnostics(params: { userId: string; mode: 'live' | 'paper'; hours?: number }): Promise<any[]> {
    const hours = params.hours || 24;
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const results = await db
      .select()
      .from(filterDiagnostics)
      .where(
        and(
          eq(filterDiagnostics.userId, params.userId),
          eq(filterDiagnostics.mode, params.mode),
          gte(filterDiagnostics.timestamp, cutoffTime)
        )
      )
      .orderBy(desc(filterDiagnostics.timestamp));
      
    return results;
  }

  // Filter calibration methods
  async getLatestCalibration(params: { userId: string; mode: 'live' | 'paper'; maxAgeHours?: number }): Promise<FilterCalibrationLog | null> {
    const maxAgeHours = params.maxAgeHours || 24;
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    const [result] = await db
      .select()
      .from(filterCalibrationLog)
      .where(
        and(
          eq(filterCalibrationLog.userId, params.userId),
          eq(filterCalibrationLog.mode, params.mode),
          gte(filterCalibrationLog.timestamp, cutoffTime)
        )
      )
      .orderBy(desc(filterCalibrationLog.timestamp))
      .limit(1);
    
    return result || null;
  }

  async getLatestPaperCalibration(userId: string): Promise<FilterCalibrationLog | null> {
    const [result] = await db
      .select()
      .from(filterCalibrationLog)
      .where(
        and(
          eq(filterCalibrationLog.userId, userId),
          eq(filterCalibrationLog.mode, 'paper')
        )
      )
      .orderBy(desc(filterCalibrationLog.timestamp))
      .limit(1);
    
    return result || null;
  }

  async getCalibrationWithFallback(userId: string, mode: 'live' | 'paper', maxAgeHours = 24): Promise<FilterCalibrationLog | null> {
    let calibration = await this.getLatestCalibration({ userId, mode, maxAgeHours });
    
    if (!calibration && mode === 'live') {
      console.log(`[Storage] No recent Live calibration for user ${userId}, falling back to Paper mode`);
      calibration = await this.getLatestPaperCalibration(userId);
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

  async getRecentCalibrations(params: { userId?: string; mode: 'live' | 'paper'; limit?: number; maxAgeHours?: number }): Promise<FilterCalibrationLog[]> {
    const limit = params.limit || 10;
    const conditions = [eq(filterCalibrationLog.mode, params.mode)];
    
    if (params.userId) {
      conditions.push(eq(filterCalibrationLog.userId, params.userId));
    }
    
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

  // Screener results methods
  async getScreenerResults(params: { userId: string; mode: 'live' | 'paper'; limit?: number }): Promise<ScreenerResult[]> {
    const results = await db
      .select()
      .from(screenerResults)
      .where(
        and(
          eq(screenerResults.userId, params.userId),
          eq(screenerResults.mode, params.mode)
        )
      )
      .orderBy(desc(screenerResults.scannedAt))
      .limit(params.limit || 50);
    
    return results;
  }

  async createScreenerResults(data: InsertScreenerResult[]): Promise<void> {
    if (data.length > 0) {
      await db.insert(screenerResults).values(data);
    }
  }

  async deleteOldScreenerResults(params: { userId: string; mode: 'live' | 'paper'; beforeDate: Date }): Promise<void> {
    await db
      .delete(screenerResults)
      .where(
        and(
          eq(screenerResults.userId, params.userId),
          eq(screenerResults.mode, params.mode),
          lte(screenerResults.scannedAt, params.beforeDate)
        )
      );
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
  async getWatchlist(params: { userId: string; mode: 'live' | 'paper' }): Promise<WatchlistPair[]> {
    return await db
      .select()
      .from(watchlistPairs)
      .where(and(
        eq(watchlistPairs.userId, params.userId), 
        eq(watchlistPairs.mode, params.mode),
        eq(watchlistPairs.isActive, true)
      ))
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

  async getPortfolioAdjustments(userId: string, filters?: { mode?: string; hours?: number; limit?: number }): Promise<PortfolioAdjustment[]> {
    const conditions = [eq(portfolioAdjustments.userId, userId)];
    
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
      .where(and(...conditions))
      .orderBy(desc(portfolioAdjustments.timestamp));
    
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    
    return await query;
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
  async createPaperSimTrade(trade: InsertPaperSimTrade): Promise<PaperSimTrade> {
    const [result] = await db.insert(paperSimTrades).values(trade).returning();
    return result;
  }

  async updatePaperSimTrade(id: string, updates: Partial<PaperSimTrade>): Promise<PaperSimTrade> {
    const [result] = await db.update(paperSimTrades)
      .set(updates)
      .where(eq(paperSimTrades.id, id))
      .returning();
    return result;
  }

  async getPaperSimTrade(id: string): Promise<PaperSimTrade | undefined> {
    const [trade] = await db.select()
      .from(paperSimTrades)
      .where(eq(paperSimTrades.id, id));
    return trade || undefined;
  }

  async getPaperSimTrades(userId: string, filters?: { limit?: number; closedOnly?: boolean }): Promise<PaperSimTrade[]> {
    const limit = filters?.limit || 100;
    const closedOnly = filters?.closedOnly ?? false;
    
    const conditions = [eq(paperSimTrades.userId, userId)];
    if (closedOnly) {
      conditions.push(sql`${paperSimTrades.closedAt} IS NOT NULL` as any);
    }
    
    return await db.select()
      .from(paperSimTrades)
      .where(and(...conditions))
      .orderBy(desc(paperSimTrades.openedAt))
      .limit(limit);
  }

  async getPaperSimTradesBySymbol(userId: string, symbol: string): Promise<PaperSimTrade[]> {
    return await db.select()
      .from(paperSimTrades)
      .where(and(
        eq(paperSimTrades.userId, userId),
        eq(paperSimTrades.symbol, symbol)
      ))
      .orderBy(desc(paperSimTrades.openedAt));
  }

  async createPaperSimOpenPosition(position: InsertPaperSimOpenPosition): Promise<PaperSimOpenPosition> {
    const [result] = await db.insert(paperSimOpenPositions).values(position).returning();
    return result;
  }

  async updatePaperSimOpenPosition(id: string, updates: Partial<PaperSimOpenPosition>): Promise<PaperSimOpenPosition> {
    const [result] = await db.update(paperSimOpenPositions)
      .set({ ...updates, lastUpdated: new Date() })
      .where(eq(paperSimOpenPositions.id, id))
      .returning();
    return result;
  }

  async getPaperSimOpenPosition(id: string): Promise<PaperSimOpenPosition | undefined> {
    const [position] = await db.select()
      .from(paperSimOpenPositions)
      .where(eq(paperSimOpenPositions.id, id));
    return position || undefined;
  }

  async getPaperSimOpenPositionBySymbol(userId: string, symbol: string): Promise<PaperSimOpenPosition | undefined> {
    const [position] = await db.select()
      .from(paperSimOpenPositions)
      .where(and(
        eq(paperSimOpenPositions.userId, userId),
        eq(paperSimOpenPositions.symbol, symbol)
      ));
    return position || undefined;
  }

  async getPaperSimOpenPositions(userId: string): Promise<PaperSimOpenPosition[]> {
    return await db.select()
      .from(paperSimOpenPositions)
      .where(eq(paperSimOpenPositions.userId, userId))
      .orderBy(desc(paperSimOpenPositions.openedAt));
  }

  async deletePaperSimOpenPosition(id: string): Promise<void> {
    await db.delete(paperSimOpenPositions).where(eq(paperSimOpenPositions.id, id));
  }

  async createPaperSimTradeLog(log: InsertPaperSimTradeLog): Promise<PaperSimTradeLog> {
    const [result] = await db.insert(paperSimTradeLogs).values(log).returning();
    return result;
  }

  async getPaperSimTradeLogs(userId: string, filters?: { limit?: number; tradeId?: string }): Promise<PaperSimTradeLog[]> {
    const limit = filters?.limit || 100;
    
    const conditions = [eq(paperSimTradeLogs.userId, userId)];
    if (filters?.tradeId) {
      conditions.push(eq(paperSimTradeLogs.tradeId, filters.tradeId));
    }
    
    return await db.select()
      .from(paperSimTradeLogs)
      .where(and(...conditions))
      .orderBy(desc(paperSimTradeLogs.timestamp))
      .limit(limit);
  }

  async getPaperSimStats(userId: string): Promise<{
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
    const trades = await db.select()
      .from(paperSimTrades)
      .where(eq(paperSimTrades.userId, userId));

    const openPositions = await db.select()
      .from(paperSimOpenPositions)
      .where(eq(paperSimOpenPositions.userId, userId));

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
  
  // Walter AI Assistant methods
  async createWalterPendingApproval(data: InsertWalterPendingApproval): Promise<WalterPendingApproval> {
    const [approval] = await db.insert(walterPendingApprovals).values(data).returning() as any;
    return approval;
  }
  
  async getPendingApprovals(userId: string, status?: string): Promise<WalterPendingApproval[]> {
    if (status) {
      return await db.select().from(walterPendingApprovals)
        .where(and(
          eq(walterPendingApprovals.userId, userId),
          eq(walterPendingApprovals.status, status as any)
        ))
        .orderBy(desc(walterPendingApprovals.createdAt));
    }
    return await db.select().from(walterPendingApprovals)
      .where(eq(walterPendingApprovals.userId, userId))
      .orderBy(desc(walterPendingApprovals.createdAt));
  }
  
  async updateApprovalStatus(id: string, status: string, updates: Partial<WalterPendingApproval>): Promise<WalterPendingApproval> {
    const [approval] = await db.update(walterPendingApprovals)
      .set({ ...updates, status: status as any })
      .where(eq(walterPendingApprovals.id, id))
      .returning();
    return approval;
  }
  
  async createWalterChat(data: InsertWalterChat): Promise<WalterChat> {
    const [chat] = await db.insert(walterChats).values(data).returning() as any;
    return chat;
  }
  
  async getWalterChats(userId: string, status?: string): Promise<WalterChat[]> {
    if (status) {
      return await db.select().from(walterChats)
        .where(and(
          eq(walterChats.userId, userId),
          eq(walterChats.status, status as any)
        ))
        .orderBy(desc(walterChats.lastMessageAt));
    }
    return await db.select().from(walterChats)
      .where(eq(walterChats.userId, userId))
      .orderBy(desc(walterChats.lastMessageAt));
  }
  
  async getWalterChatById(id: string): Promise<WalterChat | undefined> {
    const [chat] = await db.select().from(walterChats).where(eq(walterChats.id, id));
    return chat || undefined;
  }
  
  async updateWalterChat(id: string, updates: Partial<WalterChat>): Promise<WalterChat> {
    const [chat] = await db.update(walterChats)
      .set(updates)
      .where(eq(walterChats.id, id))
      .returning();
    return chat;
  }
  
  async createWalterChatLog(log: InsertWalterChatLog): Promise<WalterChatLog> {
    const [chatLog] = await db.insert(walterChatLogs).values(log).returning();
    return chatLog;
  }
  
  async getWalterChatLogs(chatSessionId: string, limit: number = 50): Promise<WalterChatLog[]> {
    return await db.select().from(walterChatLogs)
      .where(eq(walterChatLogs.chatSessionId, chatSessionId))
      .orderBy(asc(walterChatLogs.timestamp))
      .limit(limit);
  }
  
  async createWalterApprovalsAudit(audit: InsertWalterApprovalsAudit): Promise<WalterApprovalsAudit> {
    const [auditEntry] = await db.insert(walterApprovalsAudit).values(audit).returning();
    return auditEntry;
  }
  
  async getWalterApprovalsAudit(approvalId: string): Promise<WalterApprovalsAudit[]> {
    return await db.select().from(walterApprovalsAudit)
      .where(eq(walterApprovalsAudit.approvalId, approvalId))
      .orderBy(desc(walterApprovalsAudit.timestamp));
  }
  
  // Walter Memory methods
  async createWalterMemory(memory: InsertWalterMemory): Promise<WalterMemory> {
    const [created] = await db.insert(walterMemory).values(memory).returning();
    return created;
  }
  
  async getWalterMemories(userId: string): Promise<WalterMemory[]> {
    return await db.select().from(walterMemory)
      .where(eq(walterMemory.userId, userId))
      .orderBy(desc(walterMemory.timestamp));
  }
  
  async getWalterMemory(id: string): Promise<WalterMemory | undefined> {
    const [memory] = await db.select().from(walterMemory).where(eq(walterMemory.id, id));
    return memory || undefined;
  }
  
  async updateWalterMemory(id: string, updates: Partial<WalterMemory>): Promise<WalterMemory> {
    const [memory] = await db.update(walterMemory)
      .set(updates)
      .where(eq(walterMemory.id, id))
      .returning();
    return memory;
  }
  
  async deleteWalterMemory(id: string): Promise<void> {
    await db.delete(walterMemory).where(eq(walterMemory.id, id));
  }
}

export const storage = new DatabaseStorage();
