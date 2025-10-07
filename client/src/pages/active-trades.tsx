import ActiveTrades from "@/components/trading/active-trades";
import MaintenanceBanner from "@/components/maintenance/maintenance-banner";
import ModeBanner from "@/components/mode-banner";

export default function ActiveTradesPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="active-trades-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Trading Mode Banner */}
      <ModeBanner />

      {/* Active Trades Component */}
      <ActiveTrades />
    </div>
  );
}
