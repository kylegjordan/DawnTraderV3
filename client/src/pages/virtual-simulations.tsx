/**
 * P19-B8.1 — Virtual Simulations (the VTS page).
 *
 * The VTS's own home: per-class Filter Diagnostics + its Open/Closed simulated
 * trades (moved here from the Machine Learning page — one home per view, rule
 * 18). No start/stop control: the VTS is always-on passive learning.
 */
import ModeTradingPage, { type ModeTradingPageConfig } from "@/pages/mode-trading";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, LineChart, BarChart3, History, LayoutDashboard } from "lucide-react";
import { XstocksTab } from "@/components/machine-learning/xstocks-tab";
import { ModeDashboardTab } from "@/components/dashboard/mode-dashboard-tab";
import {
  VtsOpenTradesTab,
  VtsClosedTradesTab,
  CryptoFilterDiagnosticsTab,
} from "@/components/vts/vts-tabs";

const config: ModeTradingPageConfig = {
  mode: 'vts',
  title: "Virtual Simulations",
  subtitle: "The VTS — always-on passive learning: broad simulated trading for calibration data",
  // P19-B8.3: the Dashboard is the landing view (Kyle proceeded on the flag).
  defaultTab: "dashboard",
  controls: (
    <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5 text-xs border-blue-400 text-blue-600" data-testid="vts-always-on-badge">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
      PASSIVE LEARNING — ALWAYS ON
    </Badge>
  ),
  tabs: [
    { key: "dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: LayoutDashboard, render: () => <ModeDashboardTab mode="vts" /> },
    { key: "fd-crypto", label: "Crypto Filter Diagnostics", shortLabel: "Crypto FD", icon: Lightbulb, render: () => <CryptoFilterDiagnosticsTab /> },
    { key: "fd-xstock", label: "xStock Filter Diagnostics", shortLabel: "xStock FD", icon: LineChart, render: () => <XstocksTab /> },
    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <VtsOpenTradesTab /> },
    { key: "closed", label: "Closed Trades", shortLabel: "Closed", icon: History, render: () => <VtsClosedTradesTab /> },
  ],
};

export default function VirtualSimulationsPage() {
  return <ModeTradingPage config={config} />;
}
