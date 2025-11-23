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

// REB 2.8.3: Latest scan data from REST endpoint (replaces WebSocket for Cycle Info + Last Scan Result)
interface ScanLatestData {
  cycleId: number;
  cycleStartTimestamp: string;
  cycleEndTimestamp: string;
  krakenUniverseSize: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  cyclesPerHour: number;
  cycleFrequencyMs: number;
  nextScanInMs: number;
  activePoolCount: number;
  activeFilteredPool: ActiveFilteredPair[];
  isEngineActive: boolean;
}

interface ScanLatestResponse {
  ok: boolean;
  data: ScanLatestData | null;
  error?: string;
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

// REB 2.8.1: UTC timestamp formatter with fallback guards (no Stage-3 dependencies)
function formatScanTimestamp(value: string | null | undefined): { display: string; relative: string } {
  // Guard against falsy, empty strings, or string literal 'undefined'
  if (!value || value === '' || value === 'undefined' || value === 'null') {
    return { display: '—', relative: '' };
  }
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { display: '—', relative: '' };
    }
    
    // Format in UTC with explicit zone label
    const utcString = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }).format(date);
    
    // Calculate relative time
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    let relative = '';
    if (diffMinutes < 1) {
      relative = 'just now';
    } else if (diffMinutes < 60) {
      relative = `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      relative = `${diffHours}h ago`;
    } else {
      relative = `${diffDays}d ago`;
    }
    
    return { display: utcString, relative };
  } catch (error) {
    return { display: '—', relative: '' };
  }
}

export function FilterInsights() {
  const { messages: wsMessages } = useWebSocket();
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  
  // REB 2.8.3: WebSocket state - ONLY for Filter Breakdown (scanner:breakdown:paper)
  const [breakdown, setBreakdown] = useState<ScannerBreakdownPayload | null>(null);
  
  // REB 2.8.3: Track when REST data was fetched to calculate elapsed time
  const [restFetchTime, setRestFetchTime] = useState<number>(Date.now());

  // REB 2.8.3: Query latest scan data from REST (replaces WebSocket for Cycle Info + Last Scan Result)
  const { data: scanLatestData, isLoading: isLoadingScan } = useQuery<ScanLatestResponse>({
    queryKey: ['/api/paper-sim/diagnostics/scan-latest?mode=paper'],
    refetchInterval: 5000, // Refresh every 5 seconds for near-real-time updates
    refetchOnWindowFocus: true,
  });

  // REB 2.8.3: Update fetch timestamp whenever REST data changes
  useEffect(() => {
    if (scanLatestData?.data) {
      setRestFetchTime(Date.now());
    }
  }, [scanLatestData]);

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

  // REB 2.8.3: REMOVED scan_tick WebSocket listener - now using REST only

  // Listen for scanner:breakdown WebSocket events (still needed for Filter Breakdown)
  useEffect(() => {
    const breakdownEvents = wsMessages.filter((msg: any) => 
      (msg.type === 'scanner:breakdown:paper' || msg.type === 'scanner:breakdown') && msg.payload?.mode === 'paper'
    );
    if (breakdownEvents.length > 0) {
      const latestBreakdown = breakdownEvents[breakdownEvents.length - 1].payload as ScannerBreakdownPayload;
      setBreakdown(latestBreakdown);
    }
  }, [wsMessages]);

  // Tick currentTime every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // REB 2.8.3: Calculate live countdown by decrementing server value based on elapsed time
  // Server provides nextScanInMs at time of fetch, we subtract elapsed time for live countdown
  const serverNextScanMs = scanLatestData?.data?.nextScanInMs ?? 0;
  const elapsedSinceFetch = currentTime - restFetchTime;
  const timeUntilRefresh = Math.max(0, serverNextScanMs - elapsedSinceFetch);
  
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

  // REB 2.8.3: Calculate eligible percentage from REST data
  const scanData = scanLatestData?.data;
  const eligiblePercent = scanData && scanData.evaluatedCount > 0
    ? ((scanData.eligibleCount / scanData.evaluatedCount) * 100).toFixed(1)
    : '0.0';

  // REB 2.8.3: Format scan frequency from REST data (or static fallback)
  const scanFrequency = scanData 
    ? `Every ${(scanData.cycleFrequencyMs / 1000).toFixed(0)}s`
    : 'Every 30s';

  // REB 2.8.3: Engine active status from REST data
  const engineActive = scanData?.isEngineActive ?? false;

  // REB 2.8.3: Loading state - check REST data instead of WebSocket
  if (isLoadingScan || !scanData) {
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
      {/* REB 2.8.2: Single unified card with 4 sections separated by dividers */}
      <Card>
        <CardContent className="p-6">
          {/* Section 1: Kraken Universe */}
          <div className="mb-6">
            <h3 className="text-base font-semibold mb-3">Kraken Universe</h3>
            <div className="flex items-baseline gap-2">
              <p className="text-xs text-muted-foreground">Total tradable pairs in Kraken universe</p>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-lg font-bold" data-testid="text-universe-count">
                {scanData.krakenUniverseSize.toLocaleString()}
              </p>
              <span className="text-sm text-muted-foreground">pairs</span>
            </div>
          </div>

          <div className="border-t mb-6"></div>

          {/* Section 2: Cycle Info - REB 2.8.3: All fields from REST data */}
          <div className="mb-6">
            <h3 className="text-base font-semibold mb-3">Cycle Info</h3>
            {/* Row 1: Cycle ID + Last Scan Time */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Cycle ID</p>
                <p className="text-sm font-medium font-mono" data-testid="text-cycle-id">
                  {scanData.cycleId || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Last Scan Time</p>
                <p className="text-sm font-medium" data-testid="text-last-scan">
                  {new Date(scanData.cycleEndTimestamp).toLocaleString()}
                </p>
              </div>
            </div>
            {/* Row 2: Next Scan In + Scan Frequency */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Next Scan In</p>
                <p className="text-sm font-bold" data-testid="text-next-scan-countdown">
                  {countdownDisplay}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Scan Frequency</p>
                <p className="text-sm font-medium">
                  {scanFrequency}
                </p>
              </div>
            </div>
            {/* Row 3: Cycles per Hour (centered) */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Cycles per Hour</p>
              <p className="text-sm font-medium" data-testid="text-cycles-per-hour">
                {scanData.cyclesPerHour !== undefined ? scanData.cyclesPerHour.toFixed(1) : 'N/A'}
              </p>
            </div>
          </div>

          <div className="border-t mb-6"></div>

          {/* Section 3: Last Scan Result - REB 2.8.3: All fields from REST data */}
          <div className="mb-6">
            <h3 className="text-base font-semibold mb-3">Last Scan Result</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Evaluated (This Scan)</p>
                <p className="text-lg font-bold" data-testid="text-evaluated-count">
                  {scanData.evaluatedCount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Eligible (This Scan)</p>
                <p className="text-lg font-bold text-success" data-testid="text-eligible-count">
                  {scanData.eligibleCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Ineligible (This Scan)</p>
                <p className="text-lg font-bold text-muted-foreground" data-testid="text-ineligible-count">
                  {scanData.ineligibleCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Eligible %</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-success" data-testid="text-eligible-percent">
                    {eligiblePercent}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t mb-6"></div>

          {/* Section 4: 24h Filter Activity - REB 2.8.2: Restructured into 3-row layout */}
          <div>
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
              24h Filter Activity
              {!engineActive && (
                <Badge variant="outline" className="text-xs border-warning text-warning">
                  STOPPED
                </Badge>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Aggregated filter performance over the last 24 hours
            </p>
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
              <div className="space-y-3">
                {/* Row 1: Total Evaluated + Unique Evaluated */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Evaluated (24h)</p>
                    <p className="text-lg font-bold" data-testid="text-24h-evaluated">
                      {scan24hData.data.totalEvaluated.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Unique Evaluated (24h)</p>
                    <p className="text-lg font-bold" data-testid="text-24h-unique-evaluated">
                      {scan24hData.data.uniqueEvaluated.toLocaleString()}
                    </p>
                  </div>
                </div>
                {/* Row 2: Total Survived + Unique Survived */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Survived Filters (24h)</p>
                    <p className="text-lg font-bold text-success" data-testid="text-24h-survived">
                      {scan24hData.data.totalSurvived.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Unique Survived Filters (24h)</p>
                    <p className="text-lg font-bold text-success" data-testid="text-24h-unique-survived">
                      {scan24hData.data.uniqueSurvived.toLocaleString()}
                    </p>
                  </div>
                </div>
                {/* Row 3: Total FX5 Cycles (always last) */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total FX5 Cycles (Last 24h)</p>
                    <p className="text-lg font-bold" data-testid="text-24h-cycles">
                      {scan24hData.data.totalCycles.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* REB 2.8.2: Active Filtered Pool - Updated header per truth */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Active Filtered Pool (Deduped, Non-Expired)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Total Active Filtered Pairs: <span className="font-semibold">{scanData.activePoolCount || 0}</span>
          </p>
        </CardHeader>
        <CardContent>
          {!scanData.activeFilteredPool || scanData.activeFilteredPool.length === 0 ? (
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
                  {scanData.activeFilteredPool.slice(0, 20).map((pair, index) => {
                    const firstSeenFormatted = formatScanTimestamp(pair.firstSeen);
                    const lastUpdatedFormatted = formatScanTimestamp(pair.lastUpdated);
                    
                    return (
                      <tr key={`${pair.symbol}-${index}`} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 font-medium">{pair.symbol}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-xs text-success border-success/20 bg-success/10">
                            All Filters Passed
                          </Badge>
                        </td>
                        <td className="py-2 px-3">
                          <div className="text-sm">{firstSeenFormatted.display}</div>
                          {firstSeenFormatted.relative && (
                            <div className="text-xs text-muted-foreground">{firstSeenFormatted.relative}</div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <div className="text-sm">{lastUpdatedFormatted.display}</div>
                          {lastUpdatedFormatted.relative && (
                            <div className="text-xs text-muted-foreground">{lastUpdatedFormatted.relative}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {scanData.activeFilteredPool.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Showing 20 of {scanData.activePoolCount} eligible pairs
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* REB 2.8.2: Filter Breakdown (Last 24h) - Counts only, no Pass/Fail pills */}
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
                  <p className="text-lg font-bold">{breakdown.evaluatedCount.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-success/10">
                  <p className="text-xs text-muted-foreground mb-1">Survived Filters</p>
                  <p className="text-lg font-bold text-success">{breakdown.eligibleCount.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                {ALLOWED_FILTER_CATEGORIES.map((key) => {
                  const count = breakdown.breakdown[key];
                  const threshold = getThreshold(key);
                  const displayName = FILTER_DISPLAY_NAMES[key] || key;
                  const description = FILTER_DESCRIPTIONS[key];
                  
                  return (
                    <div 
                      key={key} 
                      className="flex items-start justify-between p-3 rounded border border-border hover:bg-muted/30"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{displayName}</span>
                        </div>
                        {description && (
                          <p className="text-xs text-muted-foreground mb-1">
                            {description}
                          </p>
                        )}
                        {threshold && key !== 'passed_all_filters' && (
                          <p className="text-xs font-medium text-muted-foreground">
                            Threshold: {threshold}
                          </p>
                        )}
                      </div>
                      <div className="ml-4 shrink-0">
                        <p 
                          className="text-lg font-bold"
                          data-testid={`count-filter-${key}`}
                          data-count={count}
                        >
                          {count !== undefined ? count.toLocaleString() : '—'}
                        </p>
                      </div>
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
