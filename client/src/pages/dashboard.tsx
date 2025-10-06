import PortfolioOverview from "@/components/trading/portfolio-overview";
import PortfolioChart from "@/components/trading/portfolio-chart";
import EarningsChart from "@/components/trading/earnings-chart";
import ActiveTrades from "@/components/trading/active-trades";
import RecentTrades from "@/components/trading/recent-trades";
import Watchlist from "@/components/trading/watchlist";
import AIInsights from "@/components/ai/ai-insights";
import DatabaseAlert from "@/components/database/database-alert";
import MaintenanceBanner from "@/components/maintenance/maintenance-banner";
import DailyBriefCard from "@/components/DailyBriefCard";
import ModeBanner from "@/components/mode-banner";
import StrategyPerformanceWidget from "@/components/strategy/strategy-performance-widget";

export default function Dashboard() {
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="dashboard-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Database Size Alert */}
      <DatabaseAlert />

      {/* Trading Mode Banner */}
      <ModeBanner />

      {/* Portfolio Overview Section */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3 sm:mb-4">Portfolio Overview</h2>
        <PortfolioOverview />
      </section>

      {/* Strategy Performance Section */}
      <StrategyPerformanceWidget />

      {/* Daily Trading Brief */}
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

      {/* AI Analyst Preview Section */}
      <AIInsights />

      {/* Watchlist Preview */}
      <Watchlist />
    </div>
  );
}
