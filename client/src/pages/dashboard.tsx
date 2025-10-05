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

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Database Size Alert */}
      <DatabaseAlert />

      {/* Daily Trading Brief */}
      <DailyBriefCard />

      {/* Portfolio Overview Section */}
      <section>
        <h2 className="text-2xl font-bold text-foreground mb-4">Portfolio Overview</h2>
        <PortfolioOverview />
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
