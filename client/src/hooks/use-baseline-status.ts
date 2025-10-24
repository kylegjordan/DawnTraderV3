/**
 * Hook for fetching LATTI baseline indicator status
 * Phase 27.F.14.B - Task 3: Fee-Aware Metrics Display
 */
import { useQuery } from '@tanstack/react-query';

export interface BaselineSnapshot {
  established: boolean;
  timestamp: string;
  
  // Key parameters
  riskPerTrade: number;
  riskPerTradePercent: number;
  maxDailyLoss: number;
  maxDailyLossPercent: number;
  tradesPerDay: number;
  expectedProfitPerTrade: number;
  minNetProfitThreshold: number;
  
  // Performance metrics
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  avgNetProfitPerTrade: number;
  feesPerTrade: number;
  defaultFeeMode: 'maker' | 'taker';
  
  // Dual fee scenario calculations
  avgGrossProfit: number;
  makerFeesPerTrade: number;
  takerFeesPerTrade: number;
  avgNetProfitMaker: number;
  avgNetProfitTaker: number;
  
  // Provenance
  windowDefinition: string;
  tradingPace: string;
  closedTradesCount: number;
  runtimeHours: number;
}

export interface BaselineProgress {
  closedTrades: number;
  targetTrades: number;
  runtimeHours: number;
  targetHours: number;
  stabilityCheck: 'pending' | 'passed' | 'failed';
  safetyCheck: 'pending' | 'passed' | 'failed';
}

export interface BaselineStatus {
  snapshot: BaselineSnapshot | null;
  progress: BaselineProgress;
}

/**
 * Fetch baseline indicator status
 * Auto-refreshes every 5 minutes while paper trading
 */
export function useBaselineStatus(options?: { enabled?: boolean }) {
  return useQuery<BaselineStatus>({
    queryKey: ['/api/baseline-indicator/status'],
    // Uses default fetcher configured in queryClient
    enabled: options?.enabled !== false,
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    staleTime: 4 * 60 * 1000, // 4 minutes
  });
}
