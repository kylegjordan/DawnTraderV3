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
import AlertBanner from "@/components/alerts/alert-banner";
import { useSystemHealth } from "@/hooks/use-system-health";
import { PortfolioProvider, type PortfolioOverview } from "@/contexts/portfolio-context";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect, useMemo, lazy, Suspense } from "react";
import { unstable_batchedUpdates } from "react-dom";
import { Skeleton } from "@/components/ui/skeleton";

// Phase 4C: Lazy load LATTI widget for code splitting and bundle optimization
const DashboardLATTiWidget = lazy(() => 
  import("@/components/dashboard/dashboard-latti-widget").then(module => ({
    default: module.DashboardLATTiWidget
  }))
);

export default function Dashboard() {
  // Enable auto-resync polling every 12s (detects backend changes and auto-refreshes widgets)
  useSystemHealth();
  
  const queryClient = useQueryClient();
  const { mode, isPaper } = useTradingMode();
  const { messages: wsMessages } = useWebSocket();
  
  // Phase 35.2A: Fetch portfolio data at Dashboard level for context isolation
  // REB 2.8.9: Updated to 5s refresh for near-real-time balance updates
  const { data: livePortfolioData } = useQuery<PortfolioOverview>({
    queryKey: [`/api/portfolio/overview?mode=live`],
    enabled: !isPaper,
    refetchInterval: 5000,        // Faster refresh for immediate updates
    staleTime: 0,                 // Always consider stale to force refetch
    refetchOnWindowFocus: true,   // Refetch when user returns to tab
    refetchOnReconnect: true,     // Refetch after connection issues
    refetchOnMount: true          // Refetch on component mount
  });
  
  const { data: paperPortfolioData } = useQuery<PortfolioOverview>({
    queryKey: ['/api/paper/portfolio/state'],
    enabled: isPaper,
    refetchInterval: 5000,        // Faster refresh for immediate updates
    staleTime: 0,                 // Always consider stale to force refetch
    refetchOnWindowFocus: true,   // Refetch when user returns to tab
    refetchOnReconnect: true,     // Refetch after connection issues
    refetchOnMount: true          // Refetch on component mount
  });
  
  // Phase 35.2A: Memoize portfolio data to prevent unnecessary context updates
  const portfolioData = useMemo(() => 
    isPaper ? paperPortfolioData : livePortfolioData,
    [isPaper, paperPortfolioData, livePortfolioData]
  );
  
  // Phase 35.2A + REB 2.8.10B: Batch WebSocket updates to prevent render cascades
  useEffect(() => {
    const balanceUpdates = wsMessages.filter((msg: any) => msg.type === 'portfolio_balance_updated');
    if (balanceUpdates.length > 0) {
      const latestUpdate = balanceUpdates[balanceUpdates.length - 1];
      console.log('[REB 2.8.10B][WS] portfolio_balance_updated → refreshing portfolio-related queries', latestUpdate.payload);
      
      // REB 2.8.10B: Invalidate ALL portfolio-related queries for global refresh
      unstable_batchedUpdates(() => {
        // Portfolio queries (mode-specific and mode-agnostic)
        queryClient.invalidateQueries({ queryKey: ['/api/paper/portfolio/state'] });
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview?mode=live'] });
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio/overview'] });
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio/metrics'] });
        
        // Portfolio metrics queries
        queryClient.invalidateQueries({ queryKey: ['/api/paper/metrics/portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['/api/paper/metrics/earnings'] });
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio/earnings'] });
        
        // Goals Engine queries
        queryClient.invalidateQueries({ queryKey: ['/api/goals/summary'] });
        
        // LATTI queries
        queryClient.invalidateQueries({ queryKey: ['/api/latti/targets'] });
        queryClient.invalidateQueries({ queryKey: ['/api/system/trading-pace'] });
      });
    }
  }, [wsMessages, queryClient, mode]);
  
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

      {/* Phase 27.F.31: LATTI Baseline Status Widget (moved from position 2) */}
      <BaselineStatusWidget />
      </div>
    </PortfolioProvider>
  );
}
