import PortfolioChart from "@/components/trading/portfolio-chart";
import EarningsChart from "@/components/trading/earnings-chart";
import ActiveTrades from "@/components/trading/active-trades";
import RecentTrades from "@/components/trading/recent-trades";
import Watchlist from "@/components/trading/watchlist";
import DatabaseAlert from "@/components/database/database-alert";
import MaintenanceBanner from "@/components/maintenance/maintenance-banner";
import DailyBriefCard from "@/components/DailyBriefCard";
import ModeBanner from "@/components/mode-banner";
import StrategyPerformanceWidget from "@/components/strategy/strategy-performance-widget";
import PortfolioValueWidget from "@/components/goals/portfolio-value-widget";
import EarningsWidget from "@/components/goals/earnings-widget";
import TradingActivityWidget from "@/components/goals/trading-activity-widget";
import AveragesWidget from "@/components/goals/averages-widget";
import { FilterHealthWidget } from "@/components/dashboard/filter-health-widget";
import { BaselineStatusWidget } from "@/components/dashboard/baseline-status-widget";
import AJ17DiagnosticCard from "@/components/goals/aj17-diagnostic-card";
import AlertBanner from "@/components/alerts/alert-banner";
import { useSystemHealth } from "@/hooks/use-system-health";
import { PortfolioProvider, type PortfolioOverview } from "@/contexts/portfolio-context";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebSocket } from "@/hooks/use-websocket";

// Phase 4C: Lazy load LATTI widget for code splitting and bundle optimization
const DashboardLATTiWidget = lazy(() => 
  import("@/components/dashboard/dashboard-latti-widget").then(module => ({
    default: module.DashboardLATTiWidget
  }))
);

export default function Dashboard() {
  // Enable auto-resync polling every 12s (detects backend changes and auto-refreshes widgets)
  useSystemHealth();
  
  const { mode, isPaper } = useTradingMode();
  const queryClient = useQueryClient();
  const { messages: wsMessages } = useWebSocket();
  
  // Fetch portfolio data at Dashboard level for context isolation
  // Nov 6-15 truth: Normal polling (15s) + WebSocket for instant updates
  const { data: livePortfolioData } = useQuery<PortfolioOverview>({
    queryKey: ['portfolio-overview', 'live'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/overview?mode=live');
      if (!res.ok) throw new Error('Failed to fetch live portfolio');
      return res.json();
    },
    enabled: !isPaper,
    refetchInterval: 15000,
    staleTime: 15000
  });
  
  const { data: paperPortfolioData } = useQuery<PortfolioOverview>({
    queryKey: ['portfolio-overview', 'paper'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/overview?mode=paper');
      if (!res.ok) throw new Error('Failed to fetch paper portfolio');
      return res.json();
    },
    enabled: isPaper,
    refetchInterval: 15000,
    staleTime: 15000
  });
  
  // Nov 6-15 truth: Local WebSocket listener for instant portfolio updates
  // Listen to trading_state_changed and patch query cache with portfolioOverview
  useEffect(() => {
    const updates = wsMessages.filter((msg: any) => msg.type === 'trading_state_changed');
    if (updates.length > 0) {
      const latestUpdate = updates[updates.length - 1];
      const payload = latestUpdate.payload;
      
      if (payload?.portfolioOverview && payload?.mode) {
        console.log('[Dashboard][WS] trading_state_changed → updating portfolio cache', payload);
        
        // Directly update query cache for instant UI updates (no polling delay)
        // Use canonical tuple key format: ['portfolio-overview', mode]
        queryClient.setQueryData(
          ['portfolio-overview', payload.mode],
          payload.portfolioOverview
        );
      }
    }
  }, [wsMessages, queryClient]);
  
  // Memoize portfolio data to prevent unnecessary context updates
  const portfolioData = useMemo(() => 
    isPaper ? paperPortfolioData : livePortfolioData,
    [isPaper, paperPortfolioData, livePortfolioData]
  );
  
  return (
    <PortfolioProvider value={portfolioData ?? null}>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="dashboard-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Database Size Alert */}
      <DatabaseAlert />

      {/* Trading Mode Banner */}
      <ModeBanner />

      {/* System Alerts Banner */}
      <AlertBanner />

      {/* Dashboard Widgets - 4-Widget Layout */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 sm:mb-4">Dashboard Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <PortfolioValueWidget />
          <EarningsWidget />
          <TradingActivityWidget />
          <AveragesWidget />
        </div>
      </section>

      {/* Phase 4: Unified LATTi Goals & Guardrails Widget */}
      {/* Phase 4C: Suspense wrapper for lazy-loaded LATTI widget */}
      <Suspense fallback={
        <div className="rounded-lg border bg-card p-6 animate-pulse">
          <div className="h-6 w-48 bg-muted rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 w-full bg-muted rounded"></div>
            <div className="h-4 w-3/4 bg-muted rounded"></div>
            <div className="h-4 w-5/6 bg-muted rounded"></div>
          </div>
        </div>
      }>
        <DashboardLATTiWidget />
      </Suspense>

      {/* Daily Trading Brief (includes Market Insights) */}
      <DailyBriefCard />

      {/* Portfolio Charts */}
      <section className="space-y-4">
        <PortfolioChart />
        <EarningsChart />
      </section>

      {/* Active Trades Section */}
      <ActiveTrades />

      {/* Recent Trades Section */}
      <RecentTrades />

      {/* Strategy Performance Section */}
      <StrategyPerformanceWidget />

      {/* Ready to Buy */}
      <Watchlist />

      {/* Filter Health Diagnostics */}
      <FilterHealthWidget />

      {/* Phase 8.8.3-AJ17: Diagnostic Tools Card (paper mode only) */}
      <AJ17DiagnosticCard />

      {/* Phase 27.F.31: LATTI Baseline Status Widget (moved from position 2) */}
      <BaselineStatusWidget />
      </div>
    </PortfolioProvider>
  );
}
