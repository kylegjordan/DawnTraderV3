import { useState, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import ActiveTradesV2 from "@/components/trading/active-trades-v2";
import Watchlist from "@/components/trading/watchlist";
import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
import { ExecutionMetricsPanel } from "@/components/trading/execution-metrics";
import MaintenanceBanner from "@/components/maintenance/maintenance-banner";
import ModeBanner from "@/components/mode-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Lightbulb, AlertTriangle, History, Layers, Ghost } from "lucide-react";
import { FilterInsights } from "@/components/trading/filter-insights";
import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
import { ShadowTradesTab } from "@/components/trading/shadow-trades-tab";
import { PatternScanning } from "@/components/trading/pattern-scanning";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Trading page error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 space-y-4">
          <Card className="border-destructive">
            <CardHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle>Error Loading Trading Page</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <Button onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// FilteredPairsTab component removed - Phase 8.8.2-UI-ROLLBACK
// Functionality consolidated into Filter Insights tab as per Phase 8.7 final design

function TradingPageContent() {
  const [activeTab, setActiveTab] = useState("insights"); // B2: Default to Filter Insights (first in funnel)

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="trading-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Trading Mode Banner */}
      <ModeBanner />

      <div>
        <h1 className="text-3xl font-bold mb-2">Trading</h1>
        <p className="text-muted-foreground">
          Manage open positions, view ready-to-buy signals, and explore filter insights
        </p>
      </div>

      {/* B2: Tab order changed to reflect natural trading funnel: Filter → Ready → Open → History */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6" data-testid="trading-tabs">
          <TabsTrigger value="insights" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-filter-insights">
            <Lightbulb className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Filter Insights</span>
            <span className="xs:hidden">Insights</span>
          </TabsTrigger>
          <TabsTrigger value="ready" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-ready-to-buy">
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Ready to Buy</span>
            <span className="xs:hidden">Ready</span>
          </TabsTrigger>
          <TabsTrigger value="open" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-open-trades">
            <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Open Trades</span>
            <span className="xs:hidden">Open</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-trade-history">
            <History className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Trade History</span>
            <span className="xs:hidden">History</span>
          </TabsTrigger>
          <TabsTrigger value="shadows" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-shadow-trades">
            <Ghost className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Shadows</span>
            <span className="xs:hidden">Shadow</span>
          </TabsTrigger>
          <TabsTrigger value="patterns" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-pattern-scanning">
            <Layers className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Pattern Scanning</span>
            <span className="xs:hidden">Patterns</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-6">
          <FilterInsights />
        </TabsContent>

        <TabsContent value="ready" className="mt-6">
          <ReadyToBuyTable />
          <ExecutionMetricsPanel />
        </TabsContent>

        <TabsContent value="open" className="mt-6">
          <ActiveTradesV2 />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <TradeHistoryTab />
        </TabsContent>

        <TabsContent value="shadows" className="mt-6">
          <ShadowTradesTab />
        </TabsContent>

        <TabsContent value="patterns" className="mt-6">
          <PatternScanning />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function TradingPage() {
  return (
    <ErrorBoundary>
      <TradingPageContent />
    </ErrorBoundary>
  );
}
