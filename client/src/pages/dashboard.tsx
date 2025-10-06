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
import ResultsWidget from "@/components/goals/results-widget";
import GoalsSummaryWidget from "@/components/goals/goals-summary-widget";
import SystemMonitoringPanel from "@/components/system/system-monitoring-panel";

export default function Dashboard() {
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="dashboard-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Database Size Alert */}
      <DatabaseAlert />

      {/* Trading Mode Banner */}
      <ModeBanner />

      {/* Dashboard Widgets - 4-Widget Layout */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 sm:mb-4">Dashboard Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <PortfolioValueWidget />
          <EarningsWidget />
          <TradingActivityWidget />
          <ResultsWidget />
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

      {/* Symbols That Have Cleared the Screening Process */}
      <Watchlist />

      {/* System Monitoring & Checks Panel */}
      <SystemMonitoringPanel />
    </div>
  );
}
