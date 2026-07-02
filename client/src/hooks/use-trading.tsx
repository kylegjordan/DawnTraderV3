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
        ['/api/active-engine/status'],
        ['/api/system/config']
      ]);
    }
  }, [wsMessages, queryClient, debouncedInvalidate]);

  // REB 2.8.12: portfolio_balance_updated listener removed (Nov 6-15 truth restored)
  // Dashboard local WS listener calls setQueryData(['portfolio-overview', mode], data)
  // React Query cache is GLOBAL - all components with same key automatically see updates
  // No invalidations needed - setQueryData directly updates the shared cache

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
    queryKey: ['/api/active-engine/status'],
    refetchInterval: 5000, // More frequent updates for responsive UI
    staleTime: 0, // Always consider data stale for immediate updates
    refetchOnWindowFocus: true
  });

  // Phase 8.8.3-B7.1: Structured payload for paper simulation start
  // Prevents accidental calls without explicit mode
  type StartTradingOptions =
    | { type: 'paper-new'; initialBalance: number }
    | { type: 'paper-continue' }
    | { type: 'live' };

  const startTradingMutation = useMutation({
    mutationFn: async (options: StartTradingOptions) => {
      // Phase 8.8.3-B7.1: Paper simulation requires explicit mode ('new' or 'continue')
      if (options.type === 'paper-new') {
        return await apiRequest('POST', '/api/active-engine/start', {
          mode: 'new',
          initialBalance: options.initialBalance,
        });
      }

      if (options.type === 'paper-continue') {
        return await apiRequest('POST', '/api/active-engine/start', {
          mode: 'continue',
        });
      }

      if (options.type === 'live') {
        return await apiRequest('POST', '/api/trading/start', { mode: 'live' });
      }

      throw new Error('Unsupported start options');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trading/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/metrics'] });
    },
    onError: (error: unknown) => {
      // ITEM-4 step 3 (2026-06-10): the live-engine Phase-21 gate returns a
      // machine-readable 409 (LIVE_ENGINE_PHASE21_GATED). Surface it as a
      // clear, honest message — live mode ALWAYS places real orders; its
      // engine build is Phase 21 — instead of a generic failure toast.
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('LIVE_ENGINE_PHASE21_GATED') || msg.includes('Phase-21-gated')) {
        toast({
          title: 'Live trading is not available yet',
          description: 'Live mode always places real orders. The live engine is gated until Phase 21 — use paper mode to run the full pipeline without real trades.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Failed to start trading',
        description: msg,
        variant: 'destructive',
      });
    }
  });

  const stopTradingMutation = useMutation({
    mutationFn: async (mode: 'live' | 'paper') => {
      if (mode === 'paper') {
        // Stop Paper Trading Simulation Engine
        return await apiRequest('POST', '/api/active-engine/stop');
      } else {
        // Stop Live Trading Engine
        return await apiRequest('POST', '/api/trading/stop');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trading/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/metrics'] });
    }
  });

  // Phase 27.F.13.C: Reset paper simulation
  const resetPaperSimMutation = useMutation({
    mutationFn: async (newBalance: number) => {
      return await apiRequest('POST', '/api/active-engine/reset', { newBalance });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/metrics'] });
      // Invalidate portfolio overview for both modes
      queryClient.invalidateQueries({ queryKey: ['portfolio-overview', 'paper'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-overview', 'live'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trades'] });
    }
  });

  // Portfolio data - use canonical tuple key format
  const { data: portfolioMetrics, isLoading: portfolioLoading } = useQuery<PortfolioMetrics>({
    queryKey: ['portfolio-overview', mode],
    queryFn: async () => {
      const res = await fetch(`/api/portfolio/overview?mode=${mode}`);
      if (!res.ok) throw new Error('Failed to fetch portfolio overview');
      return res.json();
    },
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
      queryClient.invalidateQueries({ queryKey: ['portfolio-overview', 'paper'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-overview', 'live'] });
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
