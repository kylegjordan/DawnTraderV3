import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
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

  // Trading status and control
  const { data: tradingStatus, isLoading: statusLoading } = useQuery<TradingStatus>({
    queryKey: ['/api/trading/status'],
    refetchInterval: 30000,
    staleTime: 30000,
    refetchOnWindowFocus: false
  });

  // Paper trading simulation status
  const { data: paperSimStatus, isLoading: paperSimStatusLoading } = useQuery<{ isRunning: boolean }>({
    queryKey: ['/api/paper-sim/status'],
    refetchInterval: 5000, // More frequent updates for responsive UI
    staleTime: 0, // Always consider data stale for immediate updates
    refetchOnWindowFocus: true
  });

  const startTradingMutation = useMutation({
    mutationFn: async (mode: 'live' | 'paper') => {
      if (mode === 'paper') {
        // Start Paper Trading Simulation Engine
        const response = await apiRequest('POST', '/api/paper-sim/start');
        return response.json();
      } else {
        // Start Live Trading Engine
        const response = await apiRequest('POST', '/api/trading/start', { mode });
        return response.json();
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
        const response = await apiRequest('POST', '/api/paper-sim/stop');
        return response.json();
      } else {
        // Stop Live Trading Engine
        const response = await apiRequest('POST', '/api/trading/stop');
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trading/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/metrics'] });
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
      const response = await apiRequest('POST', `/api/trades/${tradeId}/close`);
      return response.json();
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
      const response = await apiRequest('PUT', '/api/settings', updates);
      return response.json();
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
      const response = await apiRequest('POST', '/api/watchlist', pair);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    }
  });

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (pairId: string) => {
      const response = await apiRequest('DELETE', `/api/watchlist/${pairId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    }
  });

  return {
    // Status and control
    tradingStatus,
    statusLoading,
    paperSimStatus,
    paperSimStatusLoading,
    startTrading: startTradingMutation.mutate,
    stopTrading: stopTradingMutation.mutate,
    isStarting: startTradingMutation.isPending,
    isStopping: stopTradingMutation.isPending,

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
