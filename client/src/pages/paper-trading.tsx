/**
 * P19-B8.1 — Paper Trading (active trading in paper mode).
 *
 * The active-path monitoring home for paper mode: per-class Filter Diagnostics
 * first (the funnel), then Ready to Buy → Open Trades → Closed Trades →
 * Shadows (last tab per Kyle's locked design). Data sources are the pinned
 * /api/active-engine/* family via the shared active-path tab components.
 */
import ModeTradingPage, { type ModeTradingPageConfig } from "@/pages/mode-trading";
import { Lightbulb, LineChart, TrendingUp, BarChart3, History, Ghost, LayoutDashboard } from "lucide-react";
// P19-B8.7 Step-9: the Open Trades tab is the shared VTS-mirror table behind the
// paper shell (replaces active-trades-v2, deleted — rule 18).
import PaperOpenTradesTab from "@/components/trading/paper-open-trades-tab";
import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
import { ShadowTradesTab } from "@/components/trading/shadow-trades-tab";
import { XstocksTab } from "@/components/machine-learning/xstocks-tab";
import { CryptoFilterDiagnosticsTab } from "@/components/vts/vts-tabs";
import { PaperTradingControls } from "@/components/trading/paper-trading-controls";
import { ModeDashboardTab } from "@/components/dashboard/mode-dashboard-tab";
import { PortfolioMetricsStrip } from "@/components/trading/portfolio-metrics-strip";

const config: ModeTradingPageConfig = {
  mode: 'paper',
  title: "Paper Trading",
  subtitle: "Active trading in paper mode — full pipeline, Kraken-vetted internal fills, no real money",
  // P19-B8.3: the Dashboard is the landing view (Kyle proceeded on the flag).
  defaultTab: "dashboard",
  controls: (
    <div className="flex flex-col items-end gap-2">
      <PaperTradingControls />
      {/* P19-B8.3 (OBJ-4): the metrics strip moved here from the top bar. */}
      <PortfolioMetricsStrip mode="paper" />
    </div>
  ),
  tabs: [
    { key: "dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: LayoutDashboard, render: () => <ModeDashboardTab mode="paper" /> },
    { key: "fd-crypto", label: "Crypto Filter Diagnostics", shortLabel: "Crypto FD", icon: Lightbulb, render: () => <CryptoFilterDiagnosticsTab gateDisposition="enforce" modeTail="paper" /> },
    { key: "fd-xstock", label: "xStock Filter Diagnostics", shortLabel: "xStock FD", icon: LineChart, render: () => <XstocksTab gateDisposition="enforce" modeTail="paper" /> },
    // P19-B8.10 (OBJ-2): ExecutionMetricsPanel (Phase 8.8.3/8.8.4 metrics + SLAL
    // tables) removed from below the RTB table — Kyle 2026-07-18, rule-18 purge.
    { key: "ready", label: "Ready to Buy", shortLabel: "Ready", icon: TrendingUp, render: () => <ReadyToBuyTable /> },
    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <PaperOpenTradesTab mode="paper" /> },
    { key: "closed", label: "Closed Trades", shortLabel: "Closed", icon: History, render: () => <TradeHistoryTab /> },
    { key: "shadows", label: "Shadows", shortLabel: "Shadow", icon: Ghost, render: () => <ShadowTradesTab /> },
  ],
};

export default function PaperTradingPage() {
  return <ModeTradingPage config={config} />;
}
