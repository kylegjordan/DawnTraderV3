/**
 * P19-B8.1 — Paper Trading (active trading in paper mode).
 *
 * The active-path monitoring home for paper mode: per-class Filter Diagnostics
 * first (the funnel), then Ready to Buy → Open Trades → Closed Trades →
 * Shadows (last tab per Kyle's locked design). Data sources are the pinned
 * /api/active-engine/* family via the shared active-path tab components.
 */
import ModeTradingPage, { type ModeTradingPageConfig } from "@/pages/mode-trading";
import { Lightbulb, LineChart, TrendingUp, BarChart3, History, Ghost } from "lucide-react";
import ActiveTradesV2 from "@/components/trading/active-trades-v2";
import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
import { ExecutionMetricsPanel } from "@/components/trading/execution-metrics";
import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
import { ShadowTradesTab } from "@/components/trading/shadow-trades-tab";
import { XstocksTab } from "@/components/machine-learning/xstocks-tab";
import { CryptoFilterDiagnosticsTab } from "@/components/vts/vts-tabs";
import { PaperTradingControls } from "@/components/trading/paper-trading-controls";

const config: ModeTradingPageConfig = {
  mode: 'paper',
  title: "Paper Trading",
  subtitle: "Active trading in paper mode — full pipeline, Kraken-vetted internal fills, no real money",
  defaultTab: "fd-crypto",
  controls: <PaperTradingControls />,
  tabs: [
    { key: "fd-crypto", label: "Crypto Filter Diagnostics", shortLabel: "Crypto FD", icon: Lightbulb, render: () => <CryptoFilterDiagnosticsTab /> },
    { key: "fd-xstock", label: "xStock Filter Diagnostics", shortLabel: "xStock FD", icon: LineChart, render: () => <XstocksTab /> },
    {
      key: "ready", label: "Ready to Buy", shortLabel: "Ready", icon: TrendingUp,
      render: () => (
        <>
          <ReadyToBuyTable />
          <ExecutionMetricsPanel />
        </>
      ),
    },
    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <ActiveTradesV2 /> },
    { key: "closed", label: "Closed Trades", shortLabel: "Closed", icon: History, render: () => <TradeHistoryTab /> },
    { key: "shadows", label: "Shadows", shortLabel: "Shadow", icon: Ghost, render: () => <ShadowTradesTab /> },
  ],
};

export default function PaperTradingPage() {
  return <ModeTradingPage config={config} />;
}
