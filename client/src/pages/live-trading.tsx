/**
 * P19-B8.1 — Live Trading (real-money mode; functional wiring = Phase 21).
 *
 * Same shell + tab set as Paper Trading (parity by construction — one shared
 * shell, one manifest delta). Honestly DORMANT until Phase 21: the banner says
 * so, and the shared components render their empty/paper-scoped states while
 * the system mode is paper. No live start/stop is offered here yet.
 */
import ModeTradingPage, { type ModeTradingPageConfig } from "@/pages/mode-trading";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, LineChart, TrendingUp, BarChart3, History, Ghost, LayoutDashboard } from "lucide-react";
// P19-B8.7 Step-9: the Open Trades tab is the shared VTS-mirror table behind the
// paper shell (replaces active-trades-v2, deleted — rule 18). Dormant on live.
import PaperOpenTradesTab from "@/components/trading/paper-open-trades-tab";
import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
import { ShadowTradesTab } from "@/components/trading/shadow-trades-tab";
import { XstocksTab } from "@/components/machine-learning/xstocks-tab";
import { CryptoFilterDiagnosticsTab } from "@/components/vts/vts-tabs";
import { ModeDashboardTab } from "@/components/dashboard/mode-dashboard-tab";
import { PortfolioMetricsStrip } from "@/components/trading/portfolio-metrics-strip";

const config: ModeTradingPageConfig = {
  mode: 'live',
  title: "Live Trading",
  subtitle: "Active trading in live mode — real orders on Kraken",
  // P19-B8.3: the Dashboard is the landing view (dormancy-aware honest zeros).
  defaultTab: "dashboard",
  controls: (
    <div className="flex flex-col items-end gap-2">
      <Badge variant="outline" className="px-3 py-1.5 text-xs border-amber-400 text-amber-600" data-testid="live-dormant-badge">
        DORMANT — LIVE MODE ARRIVES IN PHASE 21
      </Badge>
      {/* P19-B8.3 (OBJ-4): rendered now, dormancy-aware (the endpoint 409s
          honestly when no live session exists — shown as such, never zeros). */}
      <PortfolioMetricsStrip mode="live" />
    </div>
  ),
  tabs: [
    { key: "dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: LayoutDashboard, render: () => <ModeDashboardTab mode="live" /> },
    { key: "fd-crypto", label: "Crypto Filter Diagnostics", shortLabel: "Crypto FD", icon: Lightbulb, render: () => <CryptoFilterDiagnosticsTab gateDisposition="enforce" modeTail="live" /> },
    { key: "fd-xstock", label: "xStock Filter Diagnostics", shortLabel: "xStock FD", icon: LineChart, render: () => <XstocksTab gateDisposition="enforce" modeTail="live" /> },
    // P19-B8.10 (OBJ-2): ExecutionMetricsPanel (Phase 8.8.3/8.8.4 metrics + SLAL
    // tables) removed from below the RTB table — Kyle 2026-07-18, rule-18 purge.
    { key: "ready", label: "Ready to Buy", shortLabel: "Ready", icon: TrendingUp, render: () => <ReadyToBuyTable /> },
    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <PaperOpenTradesTab mode="live" /> },
    { key: "closed", label: "Closed Trades", shortLabel: "Closed", icon: History, render: () => <TradeHistoryTab /> },
    { key: "shadows", label: "Shadows", shortLabel: "Shadow", icon: Ghost, render: () => <ShadowTradesTab /> },
  ],
};

export default function LiveTradingPage() {
  return <ModeTradingPage config={config} />;
}
