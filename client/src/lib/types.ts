export interface User {
  id: string;
  username: string;
  tradingMode: 'live' | 'paper';
  tradingStatus: 'active' | 'stopped';
}

export interface TradingSettings {
  id: string;
  userId: string;
  
  // Portfolio Guardrails
  riskPerTrade: string;
  maxExposurePercent: string;
  maxOpenTrades: number;
  slippageToleranceMajors: string;
  slippageToleranceMidcaps: string;
  slippageToleranceSmall: string;
  stopBufferPercent: string;
  
  // Legacy Strategy Parameters
  smaLength: number;
  minVolume: string;
  minDailyRange: string;
  
  // Global Screener Filters
  minPrice?: string;
  maxBidAskSpread?: string;
  excludeStablecoins?: boolean;
  minDataHistoryDays?: number;
  allowedTradingPairs?: string[];
  blacklistedSymbols?: string[];
  whitelistedSymbols?: string[];
  
  // VWAP Pullback Strategy Parameters
  vwapTimeframe?: number;
  vwapPullbackThreshold?: string;
  vwapVolumeMultiplier?: string;
  vwapMaxHoldingPeriod?: number;
  
  // ABCD Long Strategy Parameters
  abcdMinConsolidation?: number;
  abcdBreakoutThreshold?: string;
  abcdVolumeMultiplier?: string;
  abcdExitType?: 'target' | 'trailing';
  abcdTargetPercent?: string;
  abcdTrailingStopPercent?: string;
  
  // SMA Trend Ride Strategy Parameters
  smaEntryCondition?: 'above' | 'crossover';
  smaExitCondition?: 'break' | 'trailing';
  smaTrailingStopPercent?: string;
  
  // AI Settings
  aiCapitalAllocation: boolean;
  
  // Display Settings
  timezone?: string;
  timeFormat?: '12hr' | '24hr';
}

export interface Trade {
  id: string;
  userId: string;
  symbol: string;
  strategy: 'vwap_pullback' | 'abcd_long' | 'sma_trend_ride';
  mode: 'live' | 'paper';
  status: 'open' | 'closed' | 'cancelled';
  entryPrice: string;
  exitPrice?: string;
  quantity: string;
  stopPrice: string;
  targetPrice: string;
  entryFee: string;
  exitFee?: string;
  entrySlippage: string;
  exitSlippage?: string;
  riskAmount: string;
  realizedPL?: string;
  realizedPLPercent?: string;
  realizedPLR?: string;
  entryTime: Date;
  exitTime?: Date;
  metadata?: any;
}

export interface WatchlistPair {
  id: string;
  userId: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  marketCap?: string;
  volume24h: string;
  currentPrice: string;
  vwap?: string;
  sma?: string;
  dailyRange: string;
  lastScanned?: Date;
  isActive: boolean;
}

export interface AIReport {
  id: string;
  userId: string;
  reportType: string;
  period: string;
  content: string;
  insights?: any;
  recommendations?: any;
  metrics?: any;
  generatedAt: Date;
}

export interface PortfolioMetrics {
  totalValue: number;
  unrealizedPL: number;
  realizedPL: number;
  currentExposure: number;
  openTradesCount: number;
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  profitFactor: number;
  balanceError?: string;
  balanceSource?: 'kraken' | 'internal';
  syncTimestamp?: number;
  cash?: number;
  crypto?: number;
  cashPercent?: number;
  cryptoPercent?: number;
}

export interface TradingStatus {
  mode: 'live' | 'paper';
  active: boolean;  // Phase 32.D-Fix.Final: Authoritative active state
  engineActive: boolean;
  // Phase 27.F.12: Mode-specific engine status
  isEngineActivePaper?: boolean;
  isEngineActiveLive?: boolean;
  passiveLearning?: boolean;  // Phase 32.D-Fix.Final: FYI field for passive badge
  ts?: string;  // Phase 32.D-Fix.Final: timestamp
  activeStrategies: string[];
  activeStrategiesCount: number;
  filteredPairs: number;
  readyToBuy: number;
  activeTrades: number;
  lastTickISO: string;
  // Phase 27.F.13.O: Audit fields for global engine control
  lastStartedBy?: string | null;
  lastStoppedBy?: string | null;
  lastHeartbeat?: string | null;
  lastModeChange?: string | null;
  changedBy?: string | null;
}

export interface MarketOverview {
  totalPairs: number;
  activePairs: number;
  topVolume: Array<{
    symbol: string;
    volume24h: number;
    price: number;
    change: number;
  }>;
  topPerformers: Array<{
    symbol: string;
    change: number;
    price: number;
    volume: number;
  }>;
}

export interface SymbolAnalysis {
  technicalAnalysis: string;
  strategyRecommendations: string;
  riskAssessment: string;
  historicalPerformance: string;
  symbolName?: string;
  livePrice?: number;
  change24h?: number;
  volume24h?: number;
  dataSource?: string;
  timestamp?: number;
  assetType?: 'stock' | 'crypto';
}

export interface SearchResult {
  symbol: string;
  description: string;
  type: string;
}

export interface AssetContext {
  symbol: string;
  name: string;
  type: 'stock' | 'crypto';
}

export interface EarningsData {
  today: number;
  yesterday: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  lifetime: number;
}
