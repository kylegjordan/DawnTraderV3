import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useWebSocket } from '@/hooks/use-websocket';
import { useTradingMode } from '@/contexts/trading-mode-context';
import { toast } from '@/hooks/use-toast';
import { 
  TradingStatus, 
  PortfolioMetrics, 
  Trade, 
  TradingSettings, 
  WatchlistPair,
  AIReport,
  MarketOverview,
  SymbolAnalysis
} from '@/lib/types';

// Phase 40.3: WebSocket-only trading status - no polling
// Status updates delivered via 'trading_state_changed' WebSocket events
// REB 2.8.10: Updated to use 5s polling + WebSocket for instant status updates
export function useTradingStatus() {
  return useQuery<TradingStatus>({
    queryKey: ['/api/trading/status'],
    refetchInterval: 5000,         // REB 2.8.10: 5-second polling
    staleTime: 0,                  // REB 2.8.10: Always consider stale
    refetchOnWindowFocus: true,    // Refetch on tab focus as fallback
    refetchOnReconnect: true       // Refetch on network reconnect as fallback
  });
}

export function useTrading() {
  const queryClient = useQueryClient();
  const { messages: wsMessages } = useWebSocket();
  const { mode } = useTradingMode();
  
  // Phase 33.B: Track previous active state to prevent duplicate toasts
  const previousActiveState = useRef<boolean | null>(null);

  // Phase 34: Use shared trading status hook to deduplicate polling
  const { data: tradingStatus, isLoading: statusLoading } = useTradingStatus();

  // Phase 34: Hydrate-first trading state - simplified WebSocket listener
  // Phase 34.B: Invalidation guard to prevent loops
  const invalidationInProgressRef = useRef(false);
  
  // Phase 35.3.A: Debounced invalidation (500ms) to reduce render bursts
  // Accumulates query keys during the debounce window to prevent dropped invalidations
  const pendingQueryKeys = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  
  const debouncedInvalidate = useCallback((queryKeys: string[][]) => {
    // Add all query keys to the pending set (using JSON.stringify for comparison)
    queryKeys.forEach(key => {
      pendingQueryKeys.current.add(JSON.stringify(key));
    });
    
    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    // Set new timer to flush all accumulated keys
    debounceTimer.current = setTimeout(() => {
      const keysToInvalidate = Array.from(pendingQueryKeys.current).map(k => JSON.parse(k));
      console.log('[35.3][DEBOUNCE] Flushing accumulated queries:', keysToInvalidate);
      
      Promise.allSettled(
        keysToInvalidate.map(key => 
          queryClient.invalidateQueries({ queryKey: key, exact: true })
        )
      );
      
      // Clear the pending set
      pendingQueryKeys.current.clear();
    }, 500);
  }, [queryClient]);
  
  useEffect(() => {
    const updates = wsMessages.filter((m: any) => m.type === 'trading_state_changed');
    if (!updates.length) return;
    
    const payload = updates.at(-1)?.payload;
    console.log('[SYNC] trading_state_changed:', payload);
    
    if (payload) {
      // Hydrate truth - setQueryData first for instant UI updates
      queryClient.setQueryData(['/api/trading/status'], payload);
      
      // Phase 35.3.A: Use debounced invalidation to reduce render bursts
      debouncedInvalidate([
        ['/api/paper-sim/status'],
        ['/api/system/config']
      ]);
    }
  }, [wsMessages, queryClient, debouncedInvalidate]);

  // Phase 32.D-Fix.6 Fix #1: Listen for portfolio_balance_updated events
  useEffect(() => {
    const balanceUpdates = wsMessages.filter((msg: any) => msg.type === 'portfolio_balance_updated');
    if (balanceUpdates.length > 0) {
      const latestUpdate = balanceUpdates[balanceUpdates.length - 1];
      console.log('[32.D-Fix.6] Portfolio balance updated → debounced invalidation', latestUpdate.payload);
      
      // Phase 35.3.A: Use debounced invalidation for portfolio updates
      debouncedInvalidate([
        ['/api/dashboard/overview'],
        ['/api/goals/summary'],
        ['/api/paper-sim/status'],
        ['/api/portfolio/overview']
      ]);
    }
  }, [wsMessages, queryClient, debouncedInvalidate]);

  // Phase 33.B: Listen for background_jobs_complete events
  useEffect(() => {
    const jobUpdates = wsMessages.filter((msg: any) => msg.type === 'background_jobs_complete');
    if (jobUpdates.length > 0) {
      const latestUpdate = jobUpdates[jobUpdates.length - 1];
      console.log('[Phase-33.B] Background job complete → debounced invalidation:', latestUpdate.payload);
      
      // Phase 35.3.A: Use debounced invalidation for background jobs
      debouncedInvalidate([
        ['/api/trading/filtered-pairs'],
        ['/api/watchlist']
      ]);
    }
  }, [wsMessages, queryClient, debouncedInvalidate]);

  // Paper trading simulation status (SYSTEM-WIDE - all users see the same status)
  const { data: paperSimStatus, isLoading: paperSimStatusLoading } = useQuery<{ 
    isRunning: boolean;
    sessionInfo?: {
      sessionId: string;
      startTime: Date;
      type: '48hr' | 'manual';
      startedBy: string; // User ID who started the simulation
    } | null;
  }>({
    queryKey: ['/api/paper-sim/status'],
    refetchInterval: 5000, // More frequent updates for responsive UI
    staleTime: 0, // Always consider data stale for immediate updates
    refetchOnWindowFocus: true
  });

  const startTradingMutation = useMutation({
    mutationFn: async (mode: 'live' | 'paper') => {
      if (mode === 'paper') {
        // Start Paper Trading Simulation Engine
        return await apiRequest('POST', '/api/paper-sim/start');
      } else {
        // Start Live Trading Engine
        return await apiRequest('POST', '/api/trading/start', { mode });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trading/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/metrics'] });
    }
  });

  const stopTradingMutation = useMutation({
    mutationFn: async (mode: 'live' | 'paper') => {
      if (mode === 'paper') {
        // Stop Paper Trading Simulation Engine
        return await apiRequest('POST', '/api/paper-sim/stop');
      } else {
        // Stop Live Trading Engine
        return await apiRequest('POST', '/api/trading/stop');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trading/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/metrics'] });
    }
  });

  // Phase 27.F.13.C: Reset paper simulation
  const resetPaperSimMutation = useMutation({
    mutationFn: async (newBalance: number) => {
      return await apiRequest('POST', '/api/paper-sim/reset', { newBalance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/metrics'] });
      // Invalidate portfolio overview for both modes
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview?mode=paper'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview?mode=live'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
    }
  });

  // Portfolio data - use mode-aware query key
  const { data: portfolioMetrics, isLoading: portfolioLoading } = useQuery<PortfolioMetrics>({
    queryKey: [`/api/portfolio/overview?mode=${mode}`],
    enabled: !!mode,
    refetchInterval: 60000,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });

  // Trades
  const { data: activeTrades = [], isLoading: activeTradesLoading } = useQuery<Trade[]>({
    queryKey: ['/api/trades/active'],
    refetchInterval: 30000,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  const { data: recentTrades = [], isLoading: recentTradesLoading } = useQuery<Trade[]>({
    queryKey: ['/api/trades?status=closed&limit=10'],
    refetchInterval: 60000,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    retry: false
  });

  const closeTradeM = useMutation({
    mutationFn: async (tradeId: string) => {
      return await apiRequest('POST', `/api/trades/${tradeId}/close`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trades/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
      // Invalidate portfolio overview for both modes
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview?mode=paper'] });
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview?mode=live'] });
    }
  });

  // Settings
  const { data: settings, isLoading: settingsLoading } = useQuery<TradingSettings>({
    queryKey: ['/api/settings'],
    refetchInterval: 300000,
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: Partial<TradingSettings>) => {
      return await apiRequest('PUT', '/api/settings', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    }
  });

  // Watchlist
  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<WatchlistPair[]>({
    queryKey: ['/api/watchlist'],
    refetchInterval: 60000,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async (pair: Partial<WatchlistPair>) => {
      return await apiRequest('POST', '/api/watchlist', pair);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    }
  });

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (pairId: string) => {
      return await apiRequest('DELETE', `/api/watchlist/${pairId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    }
  });

  // Phase 32.D-Fix.Final: Helper to derive active state from authoritative source
  function deriveIsActive(state?: TradingStatus, paperSimStatus?: { isRunning?: boolean }) {
    // Authoritative boolean first (from server's active field)
    if (state && typeof state.active === 'boolean') return state.active;
    
    // Best-effort on first paint before server data arrives
    if (!state) return !!paperSimStatus?.isRunning;
    
    // Fallback to mode-specific flags if active field not present
    if (state.mode === 'paper') return !!(state.isEngineActivePaper || paperSimStatus?.isRunning);
    return !!state.isEngineActiveLive;
  }

  // Phase 32.D-Fix.Final: Single source of truth for trading active state
  // Prefer authoritative 'active' boolean if present
  const isTradingActive =
    typeof tradingStatus?.active === 'boolean'
      ? tradingStatus.active
      : deriveIsActive(tradingStatus, paperSimStatus);
  const isTradingActivePaper = deriveIsActive(tradingStatus, paperSimStatus);
  const isTradingActiveLive = deriveIsActive(tradingStatus, undefined);

  return {
    // Status and control
    tradingStatus,
    statusLoading,
    paperSimStatus,
    paperSimStatusLoading,
    isTradingActive,  // Phase 32.D-Fix.Final: Single authoritative active state
    isTradingActivePaper,
    isTradingActiveLive,
    startTrading: startTradingMutation.mutateAsync,
    stopTrading: stopTradingMutation.mutateAsync,
    isStarting: startTradingMutation.isPending,
    isStopping: stopTradingMutation.isPending,
    resetPaperSim: resetPaperSimMutation.mutateAsync,
    isResettingPaperSim: resetPaperSimMutation.isPending,

    // Portfolio
    portfolioMetrics,
    portfolioLoading,

    // Trades
    activeTrades,
    activeTradesLoading,
    recentTrades,
    recentTradesLoading,
    closeTrade: closeTradeM.mutate,
    isClosingTrade: closeTradeM.isPending,

    // Settings
    settings,
    settingsLoading,
    updateSettings: updateSettingsMutation.mutate,
    isUpdatingSettings: updateSettingsMutation.isPending,

    // Watchlist
    watchlist,
    watchlistLoading,
    addToWatchlist: addToWatchlistMutation.mutate,
    removeFromWatchlist: removeFromWatchlistMutation.mutate,
    isUpdatingWatchlist: addToWatchlistMutation.isPending || removeFromWatchlistMutation.isPending
  };
}

export function useAI() {
  const queryClient = useQueryClient();

  const { data: aiReports = [], isLoading: reportsLoading } = useQuery<AIReport[]>({
    queryKey: ['/api/ai/reports', { limit: 5 }],
    refetchInterval: 300000,
    staleTime: 300000,
    refetchOnWindowFocus: false
  });

  const generateReportMutation = useMutation({
    mutationFn: async (type: 'daily' | 'weekly' | 'monthly') => {
      return await apiRequest('POST', '/api/ai/reports/generate', { type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai/reports'] });
    }
  });

  const analyzeSymbolMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await apiRequest('POST', '/api/ai/analyze-symbol', { symbol });
      
      // Check if response has any valid data
      const hasValidData = response && (
        response.symbolName || 
        response.livePrice !== undefined ||
        response.technicalAnalysis ||
        response.strategyRecommendations
      );
      
      if (!hasValidData) {
        throw new Error('No data available for this symbol');
      }
      
      return response;
    }
  });

  const chatMutation = useMutation({
    mutationFn: async ({ message, context }: { message: string; context?: any }) => {
      return await apiRequest('POST', '/api/ai/chat', { message, context });
    }
  });

  return {
    aiReports,
    reportsLoading,
    generateReport: generateReportMutation.mutate,
    isGeneratingReport: generateReportMutation.isPending,
    analyzeSymbol: analyzeSymbolMutation.mutate,
    isAnalyzingSymbol: analyzeSymbolMutation.isPending,
    symbolAnalysis: analyzeSymbolMutation.data as SymbolAnalysis | undefined,
    chat: chatMutation.mutate,
    isChatting: chatMutation.isPending,
    chatResponse: chatMutation.data
  };
}

export function useMarket() {
  const { data: marketOverview, isLoading: marketLoading } = useQuery<MarketOverview>({
    queryKey: ['/api/market/overview'],
    refetchInterval: 60000,
    staleTime: 60000,
    refetchOnWindowFocus: false
  });

  const exportTradesMutation = useMutation({
    mutationFn: async ({ from, to, format = 'csv' }: { 
      from?: string; 
      to?: string; 
      format?: 'csv' | 'json' 
    }) => {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      if (format) params.append('format', format);
      
      const url = `/api/export/trades?${params.toString()}`;
      const response = await fetch(url, { 
        credentials: 'include',
        headers: {
          'user-id': 'default-user'
        }
      });
      
      if (format === 'csv') {
        const blob = await response.blob();
        const url2 = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url2;
        const timestamp = new Date().toISOString().split('T')[0];
        a.download = `trades_export_${timestamp}.csv`;
        a.click();
        window.URL.revokeObjectURL(url2);
        return { success: true };
      } else {
        return response.json();
      }
    }
  });

  return {
    marketOverview,
    marketLoading,
    exportTrades: exportTradesMutation.mutate,
    isExporting: exportTradesMutation.isPending
  };
}
