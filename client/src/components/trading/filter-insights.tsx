import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Filter, RefreshCw, TrendingUp, XCircle, CheckCircle2 } from "lucide-react";
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
}

export function FilterInsights() {
  const [lastManualRefresh, setLastManualRefresh] = useState<number>(Date.now());
  const [nextAutoRefresh, setNextAutoRefresh] = useState<number>(Date.now() + 30 * 60 * 1000);

  // Query with 30-minute stale time
  const { data, isLoading, refetch, isFetching } = useQuery<FilterInsightsData>({
    queryKey: ['/api/paper-sim/diagnostics/scan', { mode: 'paper', limit: 500, trace: false, strategies: true }],
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchInterval: 30 * 60 * 1000, // Auto-refresh every 30 minutes
  });

  // Handle manual refresh
  const handleManualRefresh = () => {
    setLastManualRefresh(Date.now());
    setNextAutoRefresh(Date.now() + 30 * 60 * 1000);
    queryClient.invalidateQueries({ queryKey: ['/api/paper-sim/diagnostics/scan'] });
    refetch();
  };

  // Update next auto-refresh time
  useEffect(() => {
    const interval = setInterval(() => {
      setNextAutoRefresh(lastManualRefresh + 30 * 60 * 1000);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastManualRefresh]);

  // Calculate time until next refresh
  const timeUntilRefresh = Math.max(0, nextAutoRefresh - Date.now());
  const minutesUntilRefresh = Math.floor(timeUntilRefresh / 60000);
  const secondsUntilRefresh = Math.floor((timeUntilRefresh % 60000) / 1000);

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

  // Get top 3 failure reasons
  const breakdownEntries = Object.entries(data.breakdown)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const formatFailureReason = (key: string): string => {
    return key
      .replace('failed_', '')
      .replace('_', ' ')
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
              Next refresh in {minutesUntilRefresh}m {secondsUntilRefresh}s
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

      {/* Filter Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {breakdownEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">All pairs passed filters</p>
          ) : (
            <div className="space-y-3">
              {breakdownEntries.map(([key, count]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-medium">{formatFailureReason(key)}</span>
                  </div>
                  <Badge variant="destructive" data-testid={`badge-filter-${key}`}>
                    {count.toLocaleString()}
                  </Badge>
                </div>
              ))}
              
              {/* Show all other filters with counts */}
              {Object.entries(data.breakdown)
                .filter(([key, _]) => !breakdownEntries.find(([k]) => k === key))
                .filter(([_, count]) => count > 0)
                .map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{formatFailureReason(key)}</span>
                    </div>
                    <Badge variant="secondary" data-testid={`badge-filter-${key}`}>
                      {count.toLocaleString()}
                    </Badge>
                  </div>
                ))}
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
