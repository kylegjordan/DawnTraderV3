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
import GoalsSummaryWidget from "@/components/goals/goals-summary-widget";
import { FilterHealthWidget } from "@/components/dashboard/filter-health-widget";
import { DataFlowTracePanel } from "@/components/dashboard/data-flow-trace-panel";
import { SystemTruthPanel } from "@/components/dashboard/system-truth-panel";
import { AutoResolvedWidget } from "@/components/dashboard/auto-resolved-widget";
import AlertBanner from "@/components/alerts/alert-banner";
import SystemHealthSummary from "@/components/system-health-summary";
import { useSystemHealth } from "@/hooks/use-system-health";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

export default function Dashboard() {
  // Enable auto-resync polling every 12s (detects backend changes and auto-refreshes widgets)
  useSystemHealth();

  // Phase 8.5 Addendum K: System Truth telemetry polling
  const [truthData, setTruthData] = useState<any>(null);

  useEffect(() => {
    const fetchTruthData = async () => {
      try {
        const response = await apiRequest('GET', '/api/system/truth-check');
        setTruthData(response);
      } catch (error) {
        console.error('[Dashboard] Error fetching truth data:', error);
      }
    };

    // Initial fetch
    fetchTruthData();

    // Poll every 30 seconds
    const timer = setInterval(fetchTruthData, 30000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="dashboard-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Database Size Alert */}
      <DatabaseAlert />

      {/* Trading Mode Banner */}
      <ModeBanner />

      {/* System Alerts Banner */}
      <AlertBanner />

      {/* Dashboard Widgets - 5-Widget Layout */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 sm:mb-4">Dashboard Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <PortfolioValueWidget />
          <EarningsWidget />
          <TradingActivityWidget />
          <AveragesWidget />
          <AutoResolvedWidget />
        </div>
      </section>

      {/* Daily Trading Brief (includes Market Insights) */}
      <DailyBriefCard />

      {/* Goals Summary Widget */}
      <GoalsSummaryWidget />

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

      {/* System Truth Synchronization Panel */}
      <SystemTruthPanel truthData={truthData} />

      {/* Developer-Only Data Flow Trace */}
      <DataFlowTracePanel />

      {/* System Health Summary - Walter Activity (Feed/Formula Monitoring) */}
      <SystemHealthSummary />
    </div>
  );
}
