import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/use-websocket";
import { Filter, RefreshCw, TrendingUp, XCircle, CheckCircle2, Clock, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

// Phase 8.8.2-UI-ROLLBACK: Restored Phase 8.7 Filter Insights structure
// - Single consolidated tab
// - 4 sections: Overview, Last Scan Activity, Active Pool, Breakdown
// - Only 8 allowed breakdown categories
// - Per-filter descriptions

interface FilterBreakdown {
  failed_min_volume: number;
  failed_spread: number;
  failed_daily_range: number;
  failed_min_price: number;
  failed_stablecoin: number;
  failed_quote_currency: number;
  failed_blacklist?: number;
  failed_whitelist?: number;
  failed_history?: number;
  failed_guardrail_risk?: number;
  failed_market_cap?: number;
  strategy_none_triggered?: number;
  already_active?: number;
  passed_all_filters?: number;
}

interface TopCandidate {
  symbol: string;
  strategy?: string;
  confidence?: number;
}

interface FilterInsightsData {
  mode: string;
  universe_count: number;
  evaluated: number;
  eligible_count: number;
  ineligible_count: number;
  breakdown: FilterBreakdown;
  top_candidates: TopCandidate[];
  ts: string;
  nextScanAt?: string;
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

interface FilterThresholds {
  minVolume?: string;
  minPrice?: string;
  maxPrice?: string;
  maxBidAskSpread?: string;
  minDailyRange?: string;
  excludeStablecoins?: boolean;
  allowedTradingPairs?: string[];
}

interface FilterDiagnosticsResponse {
  pairsScanned: number;
  eligiblePairs: number;
  topFailureReason: string;
  failurePercent: number;
  timestamp?: string;
  thresholds?: FilterThresholds | null;
}

interface Scan24hMetrics {
  mode: 'paper' | 'live';
  totalCycles: number;
  totalEvaluated: number;
  totalSurvived: number;
  uniqueEvaluated: number;
  uniqueSurvived: number;
  windowStart: string;
  windowEnd: string;
}

interface Scan24hResponse {
  ok: boolean;
  data: Scan24hMetrics;
}

// Phase 8.8.2-UI-ROLLBACK: Only these 8 categories should be visible in the UI
const ALLOWED_FILTER_CATEGORIES = [
  'failed_min_volume',
  'failed_spread',
  'failed_daily_range',
  'failed_min_price',
  'failed_stablecoin',
  'failed_quote_currency',
  'already_active',
  'passed_all_filters',
];

// Phase 8.8.2-UI-ROLLBACK: Per-filter descriptions (Phase 8.7 final design)
const FILTER_DESCRIPTIONS: Record<string, string> = {
  failed_min_volume: "Excludes pairs with very low daily volume that may have liquidity issues or high slippage risk",
  failed_spread: "Filters out pairs with wide bid-ask spreads that increase trading costs",
  failed_daily_range: "Removes pairs with insufficient daily price movement for day trading strategies",
  failed_min_price: "Excludes very low-priced pairs that may have penny-stock characteristics",
  failed_stablecoin: "Filters out stablecoins which have minimal price volatility",
  failed_quote_currency: "Ensures only pairs with allowed quote currencies (USD, EUR, etc.) are considered",
  already_active: "Pairs currently in active trades are excluded from new trade consideration",
  passed_all_filters: "Pairs that successfully passed all filtering criteria and are eligible for trading",
};

const FILTER_DISPLAY_NAMES: Record<string, string> = {
  failed_min_volume: "Min Volume",
  failed_spread: "Max Spread",
  failed_daily_range: "Min Daily Range",
  failed_min_price: "Min Price",
  failed_stablecoin: "Exclude Stablecoins",
  failed_quote_currency: "Valid Quote Currency",
  already_active: "Already Active",
  passed_all_filters: "Passed All Filters",
};

export function FilterInsights() {
  const { messages: wsMessages } = useWebSocket();
  const [nextAutoRefresh, setNextAutoRefresh] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [engineActive, setEngineActive] = useState<boolean>(false);

  // Query filter insights
  const { data, isLoading, refetch, isFetching } = useQuery<FilterInsightsData>({
    queryKey: ['/api/paper-sim/diagnostics/scan?mode=paper&limit=9999&trace=false&strategies=all'],
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  // Query filtered pairs for Active Pool section
  const { data: filteredPairsData, isLoading: isLoadingPairs } = useQuery<FilteredPairsResponse>({
    queryKey: ['/api/paper-sim/filtered-pairs'],
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Query for threshold values
  const { data: diagnosticsData } = useQuery<FilterDiagnosticsResponse>({
    queryKey: ['/api/filters/diagnostics'],
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  // Query for 24h scan activity metrics
  const { data: scan24hData, isLoading: isLoading24h } = useQuery<Scan24hResponse>({
    queryKey: ['/api/paper-sim/diagnostics/scan-24h?mode=paper'],
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    refetchOnWindowFocus: false,
  });

  // Listen for scan_complete WebSocket events
  useEffect(() => {
    const scanCompleteEvents = wsMessages.filter((msg: any) => msg.type === 'scan_complete');
    if (scanCompleteEvents.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/diagnostics/scan?mode=paper&limit=9999&trace=false&strategies=all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/filters/diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/filtered-pairs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/diagnostics/scan-24h?mode=paper'] });
    }
  }, [wsMessages]);

  // Phase 8.8.2-UI-FINAL-RESTORE: Listen for trading_state_changed to track engine state
  useEffect(() => {
    const stateChangeEvents = wsMessages.filter((msg: any) => msg.type === 'trading_state_changed');
    if (stateChangeEvents.length > 0) {
      const latestEvent = stateChangeEvents[stateChangeEvents.length - 1];
      const payload = latestEvent.payload;
      
      // Track if paper engine is active
      if (payload?.mode === 'paper') {
        setEngineActive(payload.isEngineActive === true || payload.active === true);
      }
    }
  }, [wsMessages]);

  // Update nextAutoRefresh from API response
  useEffect(() => {
    if (data?.nextScanAt) {
      const nextScanTime = new Date(data.nextScanAt).getTime();
      setNextAutoRefresh(nextScanTime);
    }
  }, [data?.nextScanAt]);

  // Tick currentTime every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Handle manual refresh
  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/diagnostics/scan?mode=paper&limit=9999&trace=false&strategies=all'] });
    queryClient.invalidateQueries({ queryKey: ['/api/filters/diagnostics'] });
    queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/filtered-pairs'] });
    queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/diagnostics/scan-24h?mode=paper'] });
    refetch();
  };

  // Helper to get threshold value for a filter
  const getThreshold = (filterKey: string): string | null => {
    if (!diagnosticsData?.thresholds) return null;
    
    const thresholds = diagnosticsData.thresholds;
    
    const map: Record<string, string> = {
      'failed_min_volume': thresholds.minVolume ? `≥ $${parseFloat(thresholds.minVolume).toLocaleString()}` : '',
      'failed_min_price': thresholds.minPrice ? `≥ $${parseFloat(thresholds.minPrice)}` : '',
      'failed_spread': thresholds.maxBidAskSpread ? `≤ ${parseFloat(thresholds.maxBidAskSpread)}%` : '',
      'failed_daily_range': thresholds.minDailyRange ? `≥ ${parseFloat(thresholds.minDailyRange)}%` : '',
      'failed_stablecoin': thresholds.excludeStablecoins ? 'Excluded' : 'Allowed',
      'failed_quote_currency': thresholds.allowedTradingPairs ? thresholds.allowedTradingPairs.join(', ') : '',
    };
    
    return map[filterKey] || null;
  };

  // Calculate time until next refresh
  const timeUntilRefresh = nextAutoRefresh ? Math.max(0, nextAutoRefresh - currentTime) : 0;
  const minutesUntilRefresh = Math.floor(timeUntilRefresh / (60 * 1000));
  const secondsRemainder = Math.floor((timeUntilRefresh % (60 * 1000)) / 1000);
  const countdownDisplay = minutesUntilRefresh > 0 
    ? `${minutesUntilRefresh}m ${secondsRemainder}s` 
    : `${secondsRemainder}s`;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card data-testid="filter-insights-loading">
          <CardHeader>
            <Skeleton className="h-8 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Card data-testid="filter-insights-empty">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filter Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No filter insights available</p>
            <Button
              onClick={handleManualRefresh}
              variant="outline"
              size="sm"
              className="mt-4"
              data-testid="button-refresh-filter-insights"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Now
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const eligiblePercent = data.evaluated > 0 
    ? ((data.eligible_count / data.evaluated) * 100).toFixed(1)
    : '0.0';

  // Phase 8.8.2-UI-ROLLBACK: Filter breakdown to show only allowed categories
  const visibleBreakdownEntries = Object.entries(data.breakdown)
    .filter(([key]) => ALLOWED_FILTER_CATEGORIES.includes(key))
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4" data-testid="filter-insights">
      {/* Header Card with Refresh */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            <CardTitle>Filter Insights</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Next scan in {countdownDisplay}
            </span>
            <Button
              onClick={handleManualRefresh}
              variant="outline"
              size="sm"
              disabled={isFetching}
              data-testid="button-refresh-filter-insights"
            >
              <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Section 1: Scan & Filter Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Scan & Filter Overview
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Current scan cycle statistics from Kraken universe
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Kraken Universe</p>
              <p className="text-2xl font-bold" data-testid="text-universe-count">
                {data.universe_count.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Evaluated</p>
              <p className="text-2xl font-bold" data-testid="text-evaluated-count">
                {data.evaluated.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Eligible</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-success" data-testid="text-eligible-count">
                  {data.eligible_count}
                </p>
                <Badge variant="default" className="bg-success/10 text-success">
                  {eligiblePercent}%
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Ineligible</p>
              <p className="text-2xl font-bold text-muted-foreground" data-testid="text-ineligible-count">
                {data.ineligible_count}
              </p>
            </div>
          </div>

          {/* Phase 8.8.2-UI-FINAL-RESTORE: Cycle Info subsection */}
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-3">Cycle Info</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Next Scan In</p>
                <p className="text-xl font-bold" data-testid="text-next-scan-countdown">
                  {countdownDisplay}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cycles per Hour</p>
                <p className="text-xl font-bold" data-testid="text-cycles-per-hour">
                  120
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Scan Frequency</p>
                <p className="text-xl font-bold" data-testid="text-scan-frequency">
                  Every 30s
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="w-3 h-3" />
            Last scan: {new Date(data.ts).toLocaleString()}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: 24h Filter Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            24h Filter Activity
            {!engineActive && (
              <Badge variant="outline" className="text-xs border-warning text-warning">
                STOPPED
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Aggregated filter performance over the last 24 hours (only counts ACTIVE trading cycles)
          </p>
        </CardHeader>
        <CardContent>
          {!engineActive && (
            <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm text-warning font-medium flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Trading Engine STOPPED
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                24h metrics only accumulate when trading engine is ACTIVE. Start the engine to begin tracking.
              </p>
            </div>
          )}
          {isLoading24h ? (
            <div className="text-center py-4">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading 24h metrics...</p>
            </div>
          ) : !scan24hData?.ok || !scan24hData?.data ? (
            <div className="text-center py-4">
              <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No 24h data available yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Data will appear after engine starts and first scan cycle completes
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Cycles (24h)</p>
                  <p className="text-2xl font-bold" data-testid="text-24h-cycles">
                    {scan24hData.data.totalCycles}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Evaluated (24h)</p>
                  <p className="text-2xl font-bold" data-testid="text-24h-evaluated">
                    {scan24hData.data.totalEvaluated.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Survived (24h)</p>
                  <p className="text-2xl font-bold text-success" data-testid="text-24h-survived">
                    {scan24hData.data.totalSurvived.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Phase 8.8.2-UI-FINAL-RESTORE: Unique symbol counts */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Unique Evaluated (24h)</p>
                  <p className="text-2xl font-bold" data-testid="text-24h-unique-evaluated">
                    {scan24hData.data.uniqueEvaluated}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Distinct symbols evaluated across all cycles
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Unique Survived (24h)</p>
                  <p className="text-2xl font-bold text-success" data-testid="text-24h-unique-survived">
                    {scan24hData.data.uniqueSurvived}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Distinct symbols that passed filters
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <span>Window: {new Date(scan24hData.data.windowStart).toLocaleString()} - {new Date(scan24hData.data.windowEnd).toLocaleString()}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Active Filtered Pool (Deduped, Non-Expired) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Active Filtered Pool
            {!engineActive && (
              <Badge variant="outline" className="text-xs border-warning text-warning">
                STOPPED
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pairs that passed all filters in the current scan cycle and are available for trading
          </p>
        </CardHeader>
        <CardContent>
          {!engineActive ? (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 mx-auto mb-3 text-warning opacity-50" />
              <h3 className="text-lg font-semibold mb-2 text-warning">Trading Engine STOPPED</h3>
              <p className="text-muted-foreground">
                Active pool only populates when trading engine is ACTIVE
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Start the engine to see eligible pairs for trading
              </p>
            </div>
          ) : isLoadingPairs ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading filtered pairs...</p>
            </div>
          ) : !filteredPairsData || filteredPairsData.pairs.length === 0 ? (
            <div className="text-center py-8">
              <Filter className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Eligible Pairs</h3>
              <p className="text-muted-foreground">
                No symbols currently pass all screening filters
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-active-pool">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Symbol</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-right py-2 px-3 font-medium">Price</th>
                    <th className="text-right py-2 px-3 font-medium">24h Volume</th>
                    <th className="text-right py-2 px-3 font-medium">Daily Range</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPairsData.pairs.slice(0, 20).map((pair, index) => (
                    <tr key={`${pair.symbol}-${index}`} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 font-medium">{pair.symbol}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs text-success border-success/20">
                          Passed all filters
                        </Badge>
                      </td>
                      <td className="text-right py-2 px-3">
                        ${pair.price.toFixed(pair.price < 1 ? 4 : 2)}
                      </td>
                      <td className="text-right py-2 px-3">
                        ${(pair.volume24h / 1000000).toFixed(2)}M
                      </td>
                      <td className="text-right py-2 px-3">
                        {pair.dailyRange.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPairsData.pairs.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Showing 20 of {filteredPairsData.pairs.length} eligible pairs
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Filter Breakdown (Last 24 Hours) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter Breakdown</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Why pairs were filtered out in the last scan cycle
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Total Evaluated</p>
              <p className="text-xl font-bold">{data.evaluated.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-success/10">
              <p className="text-xs text-muted-foreground mb-1">Survived Filters</p>
              <p className="text-xl font-bold text-success">{data.eligible_count}</p>
            </div>
          </div>
          
          {visibleBreakdownEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No filter data available</p>
          ) : (
            <div className="space-y-3">
              {visibleBreakdownEntries.map(([key, count]) => {
                const isTopFailure = count > 0 && count > 100;
                const threshold = getThreshold(key);
                const displayName = FILTER_DISPLAY_NAMES[key] || key;
                const description = FILTER_DESCRIPTIONS[key];
                
                return (
                  <div 
                    key={key} 
                    className={cn(
                      "flex flex-col p-3 rounded border",
                      isTopFailure ? "border-destructive/20 bg-destructive/5" : "border-border",
                      count === 0 && "opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {count > 0 ? (
                          <XCircle className={cn(
                            "w-4 h-4 shrink-0",
                            isTopFailure ? "text-destructive" : "text-warning"
                          )} />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
                        )}
                        <span className={cn(
                          "text-sm font-medium",
                          count === 0 && "text-muted-foreground"
                        )}>
                          {displayName}
                        </span>
                      </div>
                      <Badge 
                        variant={count > 0 ? (isTopFailure ? "destructive" : "secondary") : "outline"}
                        data-testid={`badge-filter-${key}`}
                        className={cn(
                          "shrink-0",
                          count === 0 && "text-success border-success/20"
                        )}
                      >
                        {count > 0 ? count.toLocaleString() : "✓ Pass"}
                      </Badge>
                    </div>
                    
                    {/* Phase 8.8.2-UI-ROLLBACK: Per-filter description */}
                    {description && (
                      <p className="text-xs text-muted-foreground mb-1 ml-6">
                        {description}
                      </p>
                    )}
                    
                    {threshold && (
                      <p className="text-xs text-muted-foreground ml-6">
                        Threshold: {threshold}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
