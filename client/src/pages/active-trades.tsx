import { useState, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import ActiveTrades from "@/components/trading/active-trades";
import Watchlist from "@/components/trading/watchlist";
import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
import MaintenanceBanner from "@/components/maintenance/maintenance-banner";
import ModeBanner from "@/components/mode-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Filter, Lightbulb, RefreshCw, AlertTriangle } from "lucide-react";
import { FilterHealthWidget } from "@/components/dashboard/filter-health-widget";
import { FilterInsights } from "@/components/trading/filter-insights";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

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

interface FilteredPair {
  symbol: string;
  price: number;
  vwap: number | null;
  spreadBps: number;
  volume24h: number;
  dailyRange: number;
  filterReasons: string[];
  timestamp: string;
}

interface FilteredPairsResponse {
  pairs: FilteredPair[];
  totalEligible: number;
  totalEvaluated: number;
  timestamp: string;
  nextScanAt?: string;
}

function FilteredPairsTab() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data, isLoading, error, refetch } = useQuery<FilteredPairsResponse>({
    queryKey: ['/api/paper-sim/filtered-pairs'],
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) {
      setLastUpdated(new Date());
    }
  }, [data]);

  const handleRefresh = async () => {
    await refetch();
  };

  if (error) {
    return (
      <div className="space-y-4">
        <FilterHealthWidget />
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-destructive">Failed to load filtered pairs: {(error as Error).message}</p>
            <Button onClick={handleRefresh} variant="outline" className="mt-4" data-testid="button-refresh-filtered-pairs">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterHealthWidget />
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Filtered Pairs ({data?.totalEligible || 0} eligible)</CardTitle>
            {lastUpdated && (
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-last-updated">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            disabled={isLoading}
            data-testid="button-refresh-filtered-pairs"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && !data ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading filtered pairs...</p>
            </div>
          ) : data && data.pairs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-filtered-pairs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Symbol</th>
                    <th className="text-right py-2 px-3 font-medium">Price</th>
                    <th className="text-right py-2 px-3 font-medium">Spread (bps)</th>
                    <th className="text-right py-2 px-3 font-medium">24h Volume</th>
                    <th className="text-right py-2 px-3 font-medium">Daily Range</th>
                    <th className="text-left py-2 px-3 font-medium">Filter Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pairs.map((pair, index) => (
                    <tr key={`${pair.symbol}-${index}`} className="border-b hover:bg-muted/50" data-testid={`row-pair-${index}`}>
                      <td className="py-2 px-3 font-medium" data-testid={`text-symbol-${index}`}>{pair.symbol}</td>
                      <td className="text-right py-2 px-3" data-testid={`text-price-${index}`}>
                        ${pair.price.toFixed(pair.price < 1 ? 4 : 2)}
                      </td>
                      <td className="text-right py-2 px-3" data-testid={`text-spread-${index}`}>
                        {pair.spreadBps.toFixed(2)}
                      </td>
                      <td className="text-right py-2 px-3" data-testid={`text-volume-${index}`}>
                        ${(pair.volume24h / 1000000).toFixed(2)}M
                      </td>
                      <td className="text-right py-2 px-3" data-testid={`text-range-${index}`}>
                        {pair.dailyRange.toFixed(2)}%
                      </td>
                      <td className="py-2 px-3 text-sm text-muted-foreground" data-testid={`text-status-${index}`}>
                        {pair.filterReasons.length > 0 ? pair.filterReasons.join(', ') : 'All filters passed'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Filter className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Filtered Pairs</h3>
              <p className="text-muted-foreground">
                No symbols currently pass the screening filters
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TradingPageContent() {
  const [activeTab, setActiveTab] = useState("open");
  const { isAdmin, isOwner } = useUserRole();
  
  // Filter Insights tab is only available for admin/owner users
  const showFilterInsights = isAdmin || isOwner;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6" data-testid="trading-page">
      {/* Maintenance Mode Banner */}
      <MaintenanceBanner />
      
      {/* Trading Mode Banner */}
      <ModeBanner />

      <div>
        <h1 className="text-3xl font-bold mb-2">Trading</h1>
        <p className="text-muted-foreground">
          Manage open positions, view ready-to-buy signals, and monitor filtered pairs
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full ${showFilterInsights ? 'grid-cols-4' : 'grid-cols-3'}`} data-testid="trading-tabs">
          <TabsTrigger value="open" className="flex items-center gap-2" data-testid="tab-open-trades">
            <BarChart3 className="w-4 h-4" />
            Open Trades
          </TabsTrigger>
          <TabsTrigger value="ready" className="flex items-center gap-2" data-testid="tab-ready-to-buy">
            <TrendingUp className="w-4 h-4" />
            Ready to Buy
          </TabsTrigger>
          <TabsTrigger value="filtered" className="flex items-center gap-2" data-testid="tab-filtered-pairs">
            <Filter className="w-4 h-4" />
            Filtered Pairs
          </TabsTrigger>
          {showFilterInsights && (
            <TabsTrigger value="insights" className="flex items-center gap-2" data-testid="tab-filter-insights">
              <Lightbulb className="w-4 h-4" />
              Filter Insights
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="open" className="mt-6">
          <ActiveTrades />
        </TabsContent>

        <TabsContent value="ready" className="mt-6">
          <ReadyToBuyTable />
        </TabsContent>

        <TabsContent value="filtered" className="mt-6">
          <FilteredPairsTab />
        </TabsContent>

        {showFilterInsights && (
          <TabsContent value="insights" className="mt-6">
            <FilterInsights />
          </TabsContent>
        )}
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
