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
}

export interface TradingStatus {
  tradingStatus: 'active' | 'stopped';
  tradingMode: 'live' | 'paper';
  engineRunning: boolean;
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
  livePrice?: number;
  change24h?: number;
  volume24h?: number;
  dataSource?: string;
  timestamp?: number;
}
