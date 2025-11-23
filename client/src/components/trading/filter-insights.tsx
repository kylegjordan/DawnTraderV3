import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { Filter, RefreshCw, TrendingUp, XCircle, CheckCircle2, Clock, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

// Phase 8.8.2-MAP-FINAL: Filter Insights with Stage-3 as single source of truth

interface FilterBreakdown {
  failed_min_volume: number;
  failed_spread: number;
  failed_daily_range: number;
  failed_min_price: number;
  failed_stablecoin: number;
  failed_quote_currency: number;
  failed_history: number;
  failed_market_cap: number;
  failed_guardrail_risk: number;
  already_active: number;
  passed_all_filters: number;
}

interface ActiveFilteredPair {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  firstSeen: string;
  lastUpdated: string;
}

interface ScanTickPayload {
  mode: 'paper' | 'live';
  cycleId: number;
  krakenUniverseSize: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  cyclesPerHour: number;
  cycleFrequencyMs: number;
  nextScanInMs: number;
  cycleStartTimestamp: string;
  cycleEndTimestamp: string;
  topNCount: number;
  tierBCount: number;
  rotation: {
    topEndUniverseSize: number;
    tierBUniverseSize: number;
  };
  activePoolCount: number;
  activeFilteredPool: ActiveFilteredPair[];
}

interface ScannerBreakdownPayload {
  mode: 'paper' | 'live';
  cycleId: number;
  evaluatedCount: number;
  eligibleCount: number;
  breakdown: FilterBreakdown;
  truthConstraintOk: boolean;
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

interface FiltersSettings {
  mode: 'paper' | 'live';
  filters: {
    minVolume: number;
    maxBidAskSpread: number;
    minDailyRange: number;
    minPrice: number;
    excludeStablecoins: boolean;
    allowedQuoteCurrencies: string[];
  };
}

// REB 2.8.1: Filter descriptions (Phase 8.7 truth table, 9 categories)
const FILTER_DESCRIPTIONS: Record<string, string> = {
  passed_all_filters: "Pairs that successfully passed all filtering criteria and are eligible for trading",
  failed_min_price: "Excludes very low-priced pairs that may have penny-stock characteristics",
  failed_min_volume: "Excludes pairs with very low daily volume that may create liquidity issues or high slippage risk",
  failed_spread: "Filters out pairs with wide bid-ask spreads that increase trading costs",
  failed_daily_range: "Removes pairs with insufficient daily price movement for day-trading strategies",
  failed_stablecoin: "Filters out stablecoins, which have minimal price volatility",
  failed_quote_currency: "Filters out pairs that do not use an approved quote currency (e.g., USD, EUR)",
  already_active: "Filters out pairs that already have an active position to avoid duplicate exposure",
  failed_history: "Filters out pairs lacking the required minimum number of historical trading days",
  // REB 2.8.1: Intentionally hidden - backend may still compute, but not shown in UI
  failed_market_cap: "Excludes pairs with market cap outside acceptable thresholds",
  failed_guardrail_risk: "Filters out pairs that exceed risk management guardrails",
};

const FILTER_DISPLAY_NAMES: Record<string, string> = {
  passed_all_filters: "Passed All Filters",
  failed_min_price: "Min Price",
  failed_min_volume: "Min Volume",
  failed_spread: "Max Spread",
  failed_daily_range: "Min Daily Range",
  failed_stablecoin: "Exclude Stablecoins",
  failed_quote_currency: "Valid Quote Currency",
  already_active: "Already Active",
  failed_history: "History", // REB 2.8.1: Renamed from "Min Data History"
  // REB 2.8.1: Intentionally hidden - not shown in Filter Insights UI
  failed_market_cap: "Market Cap Range",
  failed_guardrail_risk: "Risk Guardrails",
};

// Threshold conceptual text for non-numeric filters
const THRESHOLD_CONCEPTUAL: Record<string, string> = {
  already_active: "Any pair already in an open trade will be excluded",
  passed_all_filters: "No extra rules — count of pairs that passed every filter this scan",
};

// REB 2.8.1: Truth filter categories (9 total, ordered per truth screenshots)
// Removed: failed_market_cap, failed_guardrail_risk (backend may still compute, intentionally hidden from UI)
const ALLOWED_FILTER_CATEGORIES: (keyof FilterBreakdown)[] = [
  'passed_all_filters',
  'failed_min_price',
  'failed_min_volume',
  'failed_spread',
  'failed_daily_range',
  'failed_stablecoin',
  'failed_quote_currency',
  'already_active',
  'failed_history',
];

export function FilterInsights() {
  const { messages: wsMessages } = useWebSocket();
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [engineActive, setEngineActive] = useState<boolean>(false);
  
  // Phase 8.8.2-MAP-FINAL: State from WebSocket events
  const [scanTick, setScanTick] = useState<ScanTickPayload | null>(null);
  const [breakdown, setBreakdown] = useState<ScannerBreakdownPayload | null>(null);
  const [nextScanBaseTime, setNextScanBaseTime] = useState<number>(Date.now());

  // Query for 24h scan activity metrics
  const { data: scan24hData, isLoading: isLoading24h } = useQuery<Scan24hResponse>({
    queryKey: ['/api/paper-sim/diagnostics/scan-24h?mode=paper'],
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Query for filter settings (thresholds)
  const { data: filtersSettings } = useQuery<FiltersSettings>({
    queryKey: ['/api/settings/filters?mode=paper'],
    staleTime: 10 * 60 * 1000,
  });

  // Listen for scan_tick WebSocket events
  useEffect(() => {
    const scanTickEvents = wsMessages.filter((msg: any) => msg.type === 'scan_tick' && msg.payload?.mode === 'paper');
    if (scanTickEvents.length > 0) {
      const latestTick = scanTickEvents[scanTickEvents.length - 1].payload as ScanTickPayload;
      setScanTick(latestTick);
      setNextScanBaseTime(Date.now());
    }
  }, [wsMessages]);

  // Listen for scanner:breakdown WebSocket events
  useEffect(() => {
    const breakdownEvents = wsMessages.filter((msg: any) => 
      (msg.type === 'scanner:breakdown:paper' || msg.type === 'scanner:breakdown') && msg.payload?.mode === 'paper'
    );
    if (breakdownEvents.length > 0) {
      const latestBreakdown = breakdownEvents[breakdownEvents.length - 1].payload as ScannerBreakdownPayload;
      setBreakdown(latestBreakdown);
    }
  }, [wsMessages]);

  // Listen for trading_state_changed to track engine state
  useEffect(() => {
    const stateChangeEvents = wsMessages.filter((msg: any) => msg.type === 'trading_state_changed');
    if (stateChangeEvents.length > 0) {
      const latestEvent = stateChangeEvents[stateChangeEvents.length - 1];
      const payload = latestEvent.payload;
      
      if (payload?.mode === 'paper') {
        setEngineActive(payload.isEngineActive === true || payload.active === true);
      }
    }
  }, [wsMessages]);

  // Tick currentTime every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate time until next refresh
  const timeUntilRefresh = scanTick ? Math.max(0, scanTick.nextScanInMs - (currentTime - nextScanBaseTime)) : 0;
  const minutesUntilRefresh = Math.floor(timeUntilRefresh / (60 * 1000));
  const secondsRemainder = Math.floor((timeUntilRefresh % (60 * 1000)) / 1000);
  const countdownDisplay = minutesUntilRefresh > 0 
    ? `${minutesUntilRefresh}m ${secondsRemainder}s` 
    : `${secondsRemainder}s`;

  // Helper to get threshold text for a filter
  const getThreshold = (filterKey: string): string | null => {
    if (THRESHOLD_CONCEPTUAL[filterKey]) {
      return THRESHOLD_CONCEPTUAL[filterKey];
    }

    if (!filtersSettings?.filters) return null;
    
    const filters = filtersSettings.filters;
    
    const map: Record<string, string> = {
      'failed_min_volume': filters.minVolume ? `≥ $${filters.minVolume.toLocaleString()}` : '',
      'failed_min_price': filters.minPrice ? `≥ $${filters.minPrice.toFixed(2)}` : '',
      'failed_spread': filters.maxBidAskSpread ? `≤ ${(filters.maxBidAskSpread * 100).toFixed(1)}%` : '',
      'failed_daily_range': filters.minDailyRange ? `≥ ${(filters.minDailyRange * 100).toFixed(1)}%` : '',
      'failed_stablecoin': filters.excludeStablecoins ? 'Excluded' : 'Allowed',
      'failed_quote_currency': filters.allowedQuoteCurrencies ? filters.allowedQuoteCurrencies.join(', ') : '',
    };
    
    return map[filterKey] || null;
  };

  // Calculate eligible percentage
  const eligiblePercent = scanTick && scanTick.evaluatedCount > 0
    ? ((scanTick.eligibleCount / scanTick.evaluatedCount) * 100).toFixed(1)
    : '0.0';

  // Format scan frequency
  const scanFrequency = scanTick 
    ? `Every ${(scanTick.cycleFrequencyMs / 1000).toFixed(0)}s`
    : 'Every 30s';

  if (!scanTick) {
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

  return (
    <div className="space-y-4" data-testid="filter-insights">
      {/* REB 2.8.1: Section 1 - Kraken Universe (single metric) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kraken Universe</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Total tradable pairs in Kraken universe
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <p className="text-4xl font-bold" data-testid="text-universe-count">
              {scanTick.krakenUniverseSize.toLocaleString()}
            </p>
            <span className="text-sm text-muted-foreground">pairs</span>
          </div>
        </CardContent>
      </Card>

      {/* REB 2.8.1: Section 2 - Cycle Info (timing) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cycle Info</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            FX5 scanner timing and schedule
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Last Scan Time</p>
              <p className="text-lg font-medium" data-testid="text-last-scan">
                {new Date(scanTick.cycleEndTimestamp).toLocaleTimeString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Next Scan In</p>
              <p className="text-lg font-bold" data-testid="text-next-scan-countdown">
                {countdownDisplay}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* REB 2.8.1: Section 3 - Last Scan Result */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Last Scan Result</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Most recent FX5 scan cycle statistics
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Evaluated</p>
              <p className="text-2xl font-bold" data-testid="text-evaluated-count">
                {scanTick.evaluatedCount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Eligible</p>
              <p className="text-2xl font-bold text-success" data-testid="text-eligible-count">
                {scanTick.eligibleCount}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Ineligible</p>
              <p className="text-2xl font-bold text-muted-foreground" data-testid="text-ineligible-count">
                {scanTick.ineligibleCount}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Eligible %</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-success" data-testid="text-eligible-percent">
                  {eligiblePercent}%
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* REB 2.8.1: Section 4 - 24h Metrics (5 metrics, Total Cycles last) */}
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
            Aggregated filter performance over the last 24 hours
          </p>
        </CardHeader>
        <CardContent>
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
              {/* REB 2.8.1: First 4 metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">24h Total Pairs Evaluated</p>
                  <p className="text-2xl font-bold" data-testid="text-24h-evaluated">
                    {scan24hData.data.totalEvaluated.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">24h Total Pairs Survived</p>
                  <p className="text-2xl font-bold text-success" data-testid="text-24h-survived">
                    {scan24hData.data.totalSurvived.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">24h Unique Pairs Evaluated</p>
                  <p className="text-2xl font-bold" data-testid="text-24h-unique-evaluated">
                    {scan24hData.data.uniqueEvaluated.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">24h Unique Pairs Survived</p>
                  <p className="text-2xl font-bold text-success" data-testid="text-24h-unique-survived">
                    {scan24hData.data.uniqueSurvived.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* REB 2.8.1: Total Cycles - visually last metric */}
              <div className="pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total FX5 Cycles (Last 24h)</p>
                  <p className="text-2xl font-bold" data-testid="text-24h-cycles">
                    {scan24hData.data.totalCycles.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* REB 2.8.1: Active Filtered Pool - truth columns: Symbol, Status, First Seen, Last Updated */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Active Filtered Pool
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pairs that passed all filters in the current scan cycle
          </p>
        </CardHeader>
        <CardContent>
          {!scanTick.activeFilteredPool || scanTick.activeFilteredPool.length === 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-active-pool">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Symbol</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">First Seen (this window)</th>
                    <th className="text-left py-2 px-3 font-medium">Last Updated (this cycle)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4} className="py-8 text-center">
                      <Filter className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                      <h3 className="text-lg font-semibold mb-2">No Eligible Pairs</h3>
                      <p className="text-muted-foreground">
                        No symbols currently pass all screening filters
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-active-pool">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium">Symbol</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">First Seen (this window)</th>
                    <th className="text-left py-2 px-3 font-medium">Last Updated (this cycle)</th>
                  </tr>
                </thead>
                <tbody>
                  {scanTick.activeFilteredPool.slice(0, 20).map((pair, index) => (
                    <tr key={`${pair.symbol}-${index}`} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 font-medium">{pair.symbol}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs text-success border-success/20 bg-success/10">
                          All Filters Passed
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-sm">
                        {pair.firstSeen ? new Date(pair.firstSeen).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 px-3 text-sm">
                        {pair.lastUpdated ? new Date(pair.lastUpdated).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scanTick.activeFilteredPool.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Showing 20 of {scanTick.activePoolCount} eligible pairs
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* REB 2.8.1: Filter Breakdown (Last 24h) - 9 truth categories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter Breakdown (Last 24h)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Why pairs were filtered out over the last 24 hours
          </p>
        </CardHeader>
        <CardContent>
          {breakdown ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Total Evaluated</p>
                  <p className="text-xl font-bold">{breakdown.evaluatedCount.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-success/10">
                  <p className="text-xs text-muted-foreground mb-1">Survived Filters</p>
                  <p className="text-xl font-bold text-success">{breakdown.eligibleCount.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {ALLOWED_FILTER_CATEGORIES.map((key) => {
                  const count = breakdown.breakdown[key];
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
                          data-count={count}
                          className={cn(
                            "shrink-0",
                            count === 0 && "text-success border-success/20"
                          )}
                        >
                          {count > 0 ? count.toLocaleString() : "✓ Pass"}
                        </Badge>
                      </div>
                      
                      {description && (
                        <p className="text-xs text-muted-foreground mb-1 ml-6">
                          {description}
                        </p>
                      )}
                      
                      {threshold && (
                        <p className="text-xs font-medium text-muted-foreground ml-6">
                          Threshold: {threshold}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Waiting for breakdown data...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
