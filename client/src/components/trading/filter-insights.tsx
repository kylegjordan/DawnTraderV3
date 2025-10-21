import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Filter, RefreshCw, TrendingUp, XCircle, CheckCircle2, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FilterBreakdown {
  failed_min_volume: number;
  failed_spread: number;
  failed_daily_range: number;
  failed_min_price: number;
  failed_stablecoin: number;
  failed_quote_currency: number;
  failed_blacklist: number;
  failed_whitelist: number;
  failed_history: number;
  failed_guardrail_risk: number;
  strategy_none_triggered: number;
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
  nextScanAt?: string; // Phase 27.F.19b: Next scheduled scan time
}

interface FilterThresholds {
  minVolume?: string;
  minPrice?: string;
  maxPrice?: string;
  minMarketCap?: string;
  maxBidAskSpread?: string;
  rsiMin?: number;
  rsiMax?: number;
  volatilityMin?: string;
  volatilityMax?: string;
  minLiquidity?: string;
  excludeStablecoins?: boolean;
  allowRegulatedOnly?: boolean;
  minDailyRange?: string;
  allowedTradingPairs?: string[];
  minDataHistoryDays?: number;
}

interface FilterDiagnosticsResponse {
  pairsScanned: number;
  eligiblePairs: number;
  topFailureReason: string;
  failurePercent: number;
  timestamp?: string;
  thresholds?: FilterThresholds | null;
}

export function FilterInsights() {
  const [lastManualRefresh, setLastManualRefresh] = useState<number>(Date.now());
  const [nextAutoRefresh, setNextAutoRefresh] = useState<number>(Date.now() + 10 * 1000); // Phase 27.F.19: 10-second refresh

  // Phase 27.F.19: Query with 10-second stale time for real-time insights
  const { data, isLoading, refetch, isFetching } = useQuery<FilterInsightsData>({
    queryKey: ['/api/paper-sim/diagnostics/scan?mode=paper&limit=300&trace=false&strategies=all'],
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 10 * 1000, // Phase 27.F.19: Auto-refresh every 10 seconds
  });

  // Phase 27.F.15.B + 27.F.19: Query for threshold values with 10-second refresh
  const { data: diagnosticsData } = useQuery<FilterDiagnosticsResponse>({
    queryKey: ['/api/filters/diagnostics'],
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 10 * 1000, // Phase 27.F.19: Auto-refresh every 10 seconds
  });

  // Handle manual refresh - Phase 27.F.19: 10-second interval
  const handleManualRefresh = () => {
    setLastManualRefresh(Date.now());
    setNextAutoRefresh(Date.now() + 10 * 1000);
    queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/diagnostics/scan?mode=paper&limit=300&trace=false&strategies=all'] });
    queryClient.invalidateQueries({ queryKey: ['/api/filters/diagnostics'] });
    refetch();
  };

  // Phase 27.F.15.B: Helper to get threshold value for a filter
  const getThreshold = (filterKey: string): string | null => {
    if (!diagnosticsData?.thresholds) return null;
    
    const thresholds = diagnosticsData.thresholds;
    
    // Filters not currently implemented (require expensive operations or unavailable data)
    const notImplemented = ['failed_rsi', 'failed_liquidity', 'failed_market_cap', 'failed_regulated'];
    if (notImplemented.includes(filterKey)) {
      return 'Not Available';
    }
    
    const map: Record<string, string> = {
      'failed_min_volume': thresholds.minVolume ? `≥ $${parseFloat(thresholds.minVolume).toLocaleString()}` : '',
      'failed_min_price': thresholds.minPrice ? `≥ $${parseFloat(thresholds.minPrice)}` : '',
      'failed_max_price': thresholds.maxPrice ? `≤ $${parseFloat(thresholds.maxPrice).toLocaleString()}` : '',
      'failed_spread': thresholds.maxBidAskSpread ? `≤ ${parseFloat(thresholds.maxBidAskSpread)}%` : '',
      'failed_daily_range': thresholds.minDailyRange ? `≥ ${parseFloat(thresholds.minDailyRange)}%` : '',
      'failed_volatility': thresholds.volatilityMin && thresholds.volatilityMax ? `${parseFloat(thresholds.volatilityMin)}-${parseFloat(thresholds.volatilityMax)}%` : '',
      'failed_stablecoin': thresholds.excludeStablecoins ? 'Excluded' : 'Allowed',
      'failed_quote_currency': thresholds.allowedTradingPairs ? thresholds.allowedTradingPairs.join(', ') : '',
      'failed_history': thresholds.minDataHistoryDays ? `≥ ${thresholds.minDataHistoryDays} days` : '',
    };
    
    return map[filterKey] || null;
  };

  // Update next auto-refresh time - Phase 27.F.19: 10-second interval
  useEffect(() => {
    const interval = setInterval(() => {
      setNextAutoRefresh(lastManualRefresh + 10 * 1000);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastManualRefresh]);

  // Calculate time until next refresh - Phase 27.F.19: Show seconds for 10-second refresh
  const timeUntilRefresh = Math.max(0, nextAutoRefresh - Date.now());
  const secondsUntilRefresh = Math.floor(timeUntilRefresh / 1000);

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

  // Get ALL breakdown entries sorted by count (Phase 27.F.15.A: Show all 11 categories)
  const allBreakdownEntries = Object.entries(data.breakdown)
    .sort((a, b) => b[1] - a[1]);

  const formatFailureReason = (key: string): string => {
    return key
      .replace('failed_', '')
      .replace('strategy_none_triggered', 'No Strategy Triggered')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

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
            <span className="text-xs text-muted-foreground">
              Next refresh in {secondsUntilRefresh}s
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

      {/* Overview Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Universe Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Universe</p>
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
        </CardContent>
      </Card>

      {/* Filter Breakdown - Phase 27.F.15.A: Show all 11 categories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter Breakdown</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            All {allBreakdownEntries.length} filter categories (sorted by rejection count)
          </p>
        </CardHeader>
        <CardContent>
          {allBreakdownEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No filter data available</p>
          ) : (
            <div className="space-y-2">
              {allBreakdownEntries.map(([key, count], index) => {
                const isTopFailure = index < 3 && count > 0;
                const threshold = getThreshold(key);
                const isUserAdjustable = !['failed_blacklist', 'failed_whitelist', 'failed_quote_currency', 'failed_guardrail_risk', 'strategy_none_triggered'].includes(key);
                
                return (
                  <div 
                    key={key} 
                    className={cn(
                      "flex items-center justify-between p-2 rounded border",
                      isTopFailure ? "border-destructive/20 bg-destructive/5" : "border-border",
                      count === 0 && "opacity-40"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {count > 0 ? (
                        <XCircle className={cn(
                          "w-4 h-4 shrink-0",
                          isTopFailure ? "text-destructive" : "text-warning"
                        )} />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
                      )}
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm",
                            isTopFailure && count > 0 ? "font-medium" : "font-normal"
                          )}>
                            {formatFailureReason(key)}
                          </span>
                          {isUserAdjustable && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Info className="w-3 h-3 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">User-adjustable in Filters tab</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        {threshold && (
                          <span className="text-xs text-muted-foreground">
                            Threshold: {threshold}
                          </span>
                        )}
                      </div>
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Candidates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Top 10 Candidates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.top_candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No eligible pairs found</p>
          ) : (
            <div className="space-y-2">
              {data.top_candidates.slice(0, 10).map((candidate, idx) => (
                <div
                  key={candidate.symbol}
                  className="flex items-center justify-between p-2 rounded border border-border hover:bg-accent/50 transition-colors"
                  data-testid={`candidate-${candidate.symbol}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-mono w-6">
                      #{idx + 1}
                    </span>
                    <span className="font-medium">{candidate.symbol}</span>
                    {candidate.strategy && (
                      <Badge variant="outline" className="text-xs">
                        {candidate.strategy}
                      </Badge>
                    )}
                  </div>
                  {candidate.confidence !== undefined && (
                    <Badge variant="default" className="bg-success/10 text-success">
                      {(candidate.confidence * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last Updated */}
      <div className="text-center text-xs text-muted-foreground">
        Last updated: {new Date(data.ts).toLocaleString()}
      </div>
    </div>
  );
}
