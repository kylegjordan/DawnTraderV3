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
import { Lightbulb, LineChart, TrendingUp, BarChart3, History, Ghost } from "lucide-react";
import ActiveTradesV2 from "@/components/trading/active-trades-v2";
import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
import { ExecutionMetricsPanel } from "@/components/trading/execution-metrics";
import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
import { ShadowTradesTab } from "@/components/trading/shadow-trades-tab";
import { XstocksTab } from "@/components/machine-learning/xstocks-tab";
import { CryptoFilterDiagnosticsTab } from "@/components/vts/vts-tabs";

const config: ModeTradingPageConfig = {
  mode: 'live',
  title: "Live Trading",
  subtitle: "Active trading in live mode — real orders on Kraken",
  defaultTab: "fd-crypto",
  controls: (
    <Badge variant="outline" className="px-3 py-1.5 text-xs border-amber-400 text-amber-600" data-testid="live-dormant-badge">
      DORMANT — LIVE MODE ARRIVES IN PHASE 21
    </Badge>
  ),
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

export default function LiveTradingPage() {
  return <ModeTradingPage config={config} />;
}
