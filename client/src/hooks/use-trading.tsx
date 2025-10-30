import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useWebSocket } from '@/hooks/use-websocket';
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

export function useTrading() {
  const queryClient = useQueryClient();
  const { messages: wsMessages } = useWebSocket();

  // Phase 27.F.3: Trading status and control (Poll every 5s + WebSocket sync for unified state authority)
  const { data: tradingStatus, isLoading: statusLoading } = useQuery<TradingStatus>({
    queryKey: ['/api/trading/status'],
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true
  });

  // Phase 27.F.3 + 27.F.10 + 32.D-Fix.Final: Subscribe to WebSocket trading_state_changed events for immediate sync
  // Phase 32.D-Fix.Final: Hydrate cache with setQueryData for instant UI updates
  useEffect(() => {
    const updates = wsMessages.filter((msg: any) => msg.type === 'trading_state_changed');
    if (!updates.length) return;

    const payload = updates[updates.length - 1]?.payload;
    console.log('[SYNC][32.D-Fix.Final] trading_state_changed:', payload);

    if (payload) {
      // Phase 32.D-Fix.Final: HYDRATE the authoritative query immediately so UI flips without waiting
      queryClient.setQueryData(['/api/trading/status'], payload);
    }

    // Invalidate dependent queries after hydrating the truth
    Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/system/config'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/goals/summary'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/overview'] }),
    ]);
    
    // Phase 27.F.10: Mode-specific invalidations
    if (payload?.mode === 'paper') {
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/metrics'] });
    }
  }, [wsMessages, queryClient]);

  // Phase 32.D-Fix.6 Fix #1: Listen for portfolio_balance_updated events
  useEffect(() => {
    const balanceUpdates = wsMessages.filter((msg: any) => msg.type === 'portfolio_balance_updated');
    if (balanceUpdates.length > 0) {
      const latestUpdate = balanceUpdates[balanceUpdates.length - 1];
      console.log('[32.D-Fix.6] Portfolio balance updated → invalidating queries', latestUpdate.payload);
      
      // Invalidate all portfolio-dependent queries for instant UI sync
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/overview'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/goals/summary'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview'] }),
      ]);
      
      // Force immediate refetch for critical portfolio data
      queryClient.refetchQueries({ queryKey: ['/api/dashboard/overview'] });
      queryClient.refetchQueries({ queryKey: ['/api/goals/summary'] });
    }
  }, [wsMessages, queryClient]);

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
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
    }
  });

  // Portfolio data
  const { data: portfolioMetrics, isLoading: portfolioLoading } = useQuery<PortfolioMetrics>({
    queryKey: ['/api/portfolio/overview'],
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
      queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview'] });
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
  const isTradingActive = deriveIsActive(tradingStatus, paperSimStatus);
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
