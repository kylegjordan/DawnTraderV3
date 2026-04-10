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
  failed_correlation?: number; // 10.9C: Correlation Guard (ρ ≤ 0.75)
  already_active: number;
  passed_all_filters: number;
  failed_lq?: number;
  failed_noise?: number;
}

interface ActiveFilteredPair {
  symbol: string;
  price: number;
  volume24h: number;
  dailyRange: number;
  firstSeen: string;
  lastUpdated: string;
}


interface ScannerBreakdownPayload {
  mode: 'paper' | 'live';
  cycleId: number;
  evaluatedCount: number;
  eligibleCount: number;
  breakdown: FilterBreakdown;
  truthConstraintOk: boolean;
}

interface Breakdown24h {
  survived: number;
  ineligible: number;
  byFilter: Record<string, {
    name: string;
    failedCount: number;
    survivedCount: number;
  }>;
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
  breakdown24h: Breakdown24h; // REB 2.8.8: Filter-level breakdown over 24h
}

interface Scan24hResponse {
  ok: boolean;
  data: Scan24hMetrics;
}

// REB 2.8.3: Latest scan data from REST endpoint (replaces WebSocket for Cycle Info + Last Scan Result)
interface ScanLatestData {
  cycleId: number;
  scanCycleId: string; // REB 2.8.4: Unique string ID for each scan cycle
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
    minHistoryDays: number; // REB 2.12A: Added for History threshold display
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
  // Directive 10.9C: Institutional Math Guards (LQ, VolNoise, Correlation active; FinalScore deprecated)
  failed_lq: "Log-Liquidity Index below threshold (LQ < 40) - insufficient market depth",
  // Batch 19G VN: Removed hardcoded threshold value from description — threshold is now DB-driven
  failed_noise: "Volatility Noise exceeds threshold - too choppy for reliable trading",
  failed_correlation: "Portfolio correlation exceeds threshold (\u03C1 > 0.75) - too correlated with existing positions",
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
  failed_history: "History",
  // Directive 10.9C: Institutional Math Guards (LQ, VolNoise, Correlation active; FinalScore deprecated)
  failed_lq: "Liquidity Guard (LQ \u2265 40)",
  // Batch 19G VN: Removed hardcoded threshold from display name — threshold is now DB-driven
  failed_noise: "Noise Guard (VolNoise)",
  failed_correlation: "Correlation Guard (\u03C1 \u2264 0.75)",
};

// Threshold conceptual text for non-numeric filters
const THRESHOLD_CONCEPTUAL: Record<string, string> = {
  already_active: "Any pair already in an open trade will be excluded",
  passed_all_filters: "No extra rules \u2014 count of pairs that passed every filter this scan",
};

// Directive 10.9C: Active filter categories (11 filters)
// Deprecated: RSI, Risk/Volatility, FinalScore Gate (replaced by FinalScore at SQE level)
// Active Institutional Math Guards: LQ, VolNoise, Correlation (ρ)
const ALLOWED_FILTER_CATEGORIES: (keyof FilterBreakdown)[] = [
  'passed_all_filters',
  'failed_min_price',
  'failed_min_volume',
  'failed_spread',
  'failed_daily_range',
  'failed_stablecoin',
  'already_active',
  'failed_history',
  // Directive 10.9C: Institutional Math Guards (3 active)
  'failed_lq',
  'failed_noise',
  'failed_correlation', // 10.9C: Correlation Guard (ρ ≤ 0.75)
];

// REB 2.8.1: UTC timestamp formatter with fallback guards (no Stage-3 dependencies)
function formatScanTimestamp(value: string | null | undefined): { display: string; relative: string } {
  // Guard against falsy, empty strings, or string literal 'undefined'
  if (!value || value === '' || value === 'undefined' || value === 'null') {
    return { display: '\u2014', relative: '' };
  }

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { display: '\u2014', relative: '' };
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
    return { display: '\u2014', relative: '' };
  }
}

export function FilterInsights() {
  const { messages: wsMessages } = useWebSocket();
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // REB 2.8.8: breakdown state REMOVED - now using REST-only (scan24hData.breakdown24h)

  // REB 2.8.5A: Track when REST data was fetched for countdown calculation
  const [restFetchTime, setRestFetchTime] = useState<number>(Date.now());

  // REB 2.8.5A: Query latest scan data from REST (replaces WebSocket for Cycle Info + Last Scan Result)
  // REB 2.8.9: Fixed React Query polling - added refetchIntervalInBackground and staleTime:0
  // This ensures polling NEVER pauses when tab loses focus or modal opens
  const { data: scanLatestData, isLoading: isLoadingScan } = useQuery<ScanLatestResponse>({
    queryKey: ['/api/paper-sim/diagnostics/scan-latest?mode=paper'],
    refetchInterval: 5000, // Refresh every 5 seconds for near-real-time updates
    refetchIntervalInBackground: true, // REB 2.8.9: CRITICAL - Keep polling when tab loses focus
    refetchOnWindowFocus: true,
    staleTime: 0, // REB 2.8.9: Always fetch fresh data, never use stale cache
  });

  // REB 2.8.5A: Query for 24h scan activity metrics (now using FX5-native window)
  // REB 2.8.9: Fixed React Query polling - added refetchIntervalInBackground and staleTime:0
  // REB 2.8.10: Changed from 30s to 5s to sync with scan-latest updates
  const { data: scan24hData, isLoading: isLoading24h } = useQuery<Scan24hResponse>({
    queryKey: ['/api/paper-sim/diagnostics/scan-24h?mode=paper'],
    refetchInterval: 5000, // REB 2.8.10: Match scan-latest interval for synchronized updates
    refetchIntervalInBackground: true, // REB 2.8.9: CRITICAL - Keep polling when tab loses focus
    refetchOnWindowFocus: true,
    staleTime: 0, // REB 2.8.9: Always fetch fresh data, never use stale cache
  });

  // Query for filter settings (thresholds)
  const { data: filtersSettings } = useQuery<FiltersSettings>({
    queryKey: ['/api/settings/filters?mode=paper'],
    staleTime: 10 * 60 * 1000,
  });

  // REB 2.8.3: REMOVED scan_tick WebSocket listener - now using REST only

  // REB 2.8.5D: Update restFetchTime whenever scanLatestData changes (replaces deprecated onSuccess)
  useEffect(() => {
    if (scanLatestData) {
      setRestFetchTime(Date.now());
    }
  }, [scanLatestData]);

  // REB 2.8.8: WebSocket breakdown listener REMOVED - now using REST-only for Filter Breakdown

  // Tick currentTime every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // REB 2.8.5A: Calculate live countdown by decrementing server value based on elapsed time
  // Server calculates nextScanInMs at response time, we subtract elapsed time for live countdown
  const serverNextScanMs = scanLatestData?.data?.nextScanInMs ?? 0;
  const elapsedSinceFetch = currentTime - restFetchTime;
  const remainingMs = Math.max(0, serverNextScanMs - elapsedSinceFetch);

  const nextScanSeconds = Math.floor(remainingMs / 1000);
  const countdownDisplay = nextScanSeconds > 0 ? `${nextScanSeconds}s` : '0s';

  // Helper to get threshold text for a filter
  const getThreshold = (filterKey: string): string | null => {
    if (THRESHOLD_CONCEPTUAL[filterKey]) {
      return THRESHOLD_CONCEPTUAL[filterKey];
    }

    if (!filtersSettings?.filters) return null;

    const filters = filtersSettings.filters;

    // REB 2.12A: Threshold display fixes
    // - maxBidAskSpread is stored as percentage (e.g., 2.00 = 2%) - no multiplication needed
    // - minDailyRange (from volatilityMin) is stored as percentage (e.g., 0.50 = 0.5%) - no multiplication needed
    // - minHistoryDays displayed as "X days" format
    const map: Record<string, string> = {
      'failed_min_volume': filters.minVolume ? `\u2265 $${filters.minVolume.toLocaleString()}` : '',
      'failed_min_price': filters.minPrice ? `\u2265 $${filters.minPrice.toFixed(2)}` : '',
      'failed_spread': filters.maxBidAskSpread ? `\u2264 ${filters.maxBidAskSpread.toFixed(1)}%` : '',
      'failed_daily_range': filters.minDailyRange ? `\u2265 ${filters.minDailyRange.toFixed(1)}%` : '',
      'failed_stablecoin': filters.excludeStablecoins ? 'Excluded' : 'Allowed',
      'failed_quote_currency': filters.allowedQuoteCurrencies ? filters.allowedQuoteCurrencies.join(', ') : '',
      'failed_history': filters.minHistoryDays ? `${filters.minHistoryDays} days` : '',
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
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs text-muted-foreground">Total Kraken Trading Pairs:</span>
              <span className="text-sm font-semibold" data-testid="text-universe-count">
                {scanData.krakenUniverseSize.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="border-t mb-6"></div>

          {/* Section 2: Cycle Info - REB 2.8.3: All fields from REST data */}
          <div className="mb-6">
            <h3 className="text-base font-semibold mb-3">Cycle Info</h3>
            <div className="space-y-2">
              {/* Row 1: Cycle ID (left) + Last Scan Time (right) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Last Scan Cycle ID:</span>
                  <span className="text-sm font-semibold font-mono" data-testid="text-cycle-id">
                    {scanData.scanCycleId || 'N/A'}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Last Scan Time:</span>
                  <span className="text-sm font-semibold" data-testid="text-last-scan">
                    {new Date(scanData.cycleEndTimestamp).toLocaleString()}
                  </span>
                </div>
              </div>
              {/* Row 2: Next Scan In (left) + Scan Frequency (right) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Next Scan In:</span>
                  <span className="text-sm font-semibold" data-testid="text-next-scan-countdown">
                    {countdownDisplay}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Scan Frequency:</span>
                  <span className="text-sm font-semibold">
                    {scanFrequency}
                  </span>
                </div>
              </div>
              {/* Row 3: Cycles per Hour (alone) */}
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs text-muted-foreground">Cycles per Hour:</span>
                <span className="text-sm font-semibold text-blue-700" data-testid="text-cycles-per-hour">
                  {scanData.cyclesPerHour !== undefined ? scanData.cyclesPerHour.toFixed(1) : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t mb-6"></div>

          {/* Section 3: Last Scan Result - REB 2.8.3: All fields from REST data */}
          <div className="mb-6">
            <h3 className="text-base font-semibold mb-3">Last Scan Result</h3>
            {/* Single row with evenly justified fields */}
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">Evaluated This Scan:</span>
                <span className="text-sm font-semibold" data-testid="text-evaluated-count">
                  {scanData.evaluatedCount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">Eligible This Scan:</span>
                <span className="text-sm font-semibold text-success" data-testid="text-eligible-count">
                  {scanData.eligibleCount}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-muted-foreground">Ineligible This Scan:</span>
                <span className="text-sm font-semibold text-muted-foreground" data-testid="text-ineligible-count">
                  {scanData.ineligibleCount}
                </span>
                <span className="text-xs text-muted-foreground font-medium" data-testid="text-eligible-percent">
                  ({eligiblePercent}%)
                </span>
              </div>
            </div>
          </div>

          <div className="border-t mb-6"></div>

          {/* Section 4: 24h Filter Activity - REB 2.8.2: Restructured into 3-row layout */}
          <div>
            <h3 className="text-base font-semibold mb-1">
              24h Filter Activity
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
              <div className="space-y-2">
                {/* Row 1: Total Evaluated (left) + Unique Evaluated (right) */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">Total Evaluated (24h):</span>
                    <span className="text-sm font-semibold" data-testid="text-24h-evaluated">
                      {scan24hData.data.totalEvaluated.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">Unique Evaluated (24h):</span>
                    <span className="text-sm font-semibold" data-testid="text-24h-unique-evaluated">
                      {scan24hData.data.uniqueEvaluated.toLocaleString()}
                    </span>
                  </div>
                </div>
                {/* Row 2: Total Survived (left) + Unique Survived (right) */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">Total Survived Filters (24h):</span>
                    <span className="text-sm font-semibold text-success" data-testid="text-24h-survived">
                      {scan24hData.data.totalSurvived.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">Unique Survived Filters (24h):</span>
                    <span className="text-sm font-semibold text-success" data-testid="text-24h-unique-survived">
                      {scan24hData.data.uniqueSurvived.toLocaleString()}
                    </span>
                  </div>
                </div>
                {/* Row 3: Cycles (alone) */}
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Cycles (24h):</span>
                  <span className="text-sm font-semibold text-blue-700" data-testid="text-24h-cycles">
                    {scan24hData.data.totalCycles.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* REB 2.8.2: Active Filtered Pool - Updated header per truth */}
      {/* Phase 8.8.3-B3: Use actual array length to ensure consistency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            Active Filtered Pool (Deduped, Non-Expired)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Total Active Filtered Pairs: <span className="font-semibold">{scanData.activeFilteredPool?.length || 0}</span>
          </p>
        </CardHeader>
        <CardContent>
          {!scanData.activeFilteredPool || scanData.activeFilteredPool.length === 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-active-pool">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-xs font-medium">Symbol</th>
                    <th className="text-left py-2 px-3 text-xs font-medium">Status</th>
                    <th className="text-left py-2 px-3 text-xs font-medium">First Seen (this window)</th>
                    <th className="text-left py-2 px-3 text-xs font-medium">Last Updated (this cycle)</th>
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
                    <th className="text-left py-2 px-3 text-xs font-medium">Symbol</th>
                    <th className="text-left py-2 px-3 text-xs font-medium">Status</th>
                    <th className="text-left py-2 px-3 text-xs font-medium">First Seen (this window)</th>
                    <th className="text-left py-2 px-3 text-xs font-medium">Last Updated (this cycle)</th>
                  </tr>
                </thead>
                <tbody>
                  {scanData.activeFilteredPool.map((pair, index) => {
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
                        </td>
                        <td className="py-2 px-3">
                          <div className="text-sm">{lastUpdatedFormatted.display}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* REB 2.8.8: Filter Breakdown (Last 24h) - REST-based aggregation with passive-mode guard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filter Breakdown (Last 24h)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Why pairs were filtered out over the last 24 hours
          </p>
        </CardHeader>
        <CardContent>
          {scan24hData?.data ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Total Evaluated (24h):</span>
                  <span className="text-sm font-semibold">{scan24hData.data.totalEvaluated.toLocaleString()}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Survived Filters (24h):</span>
                  <span className="text-sm font-semibold text-success">{scan24hData.data.breakdown24h.survived.toLocaleString()}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground">Ineligible (24h):</span>
                  <span className="text-sm font-semibold text-destructive">{scan24hData.data.breakdown24h.ineligible.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                {ALLOWED_FILTER_CATEGORIES.map((key) => {
                  const filterData = scan24hData.data.breakdown24h.byFilter[key];
                  const count = filterData?.failedCount ?? 0;
                  const threshold = getThreshold(key);
                  const displayName = FILTER_DISPLAY_NAMES[key] || key;
                  const description = FILTER_DESCRIPTIONS[key];
                  const isPassedAllFilters = key === 'passed_all_filters';

                  return (
                    <div
                      key={key}
                      className={`flex items-start justify-between p-3 rounded border ${
                        isPassedAllFilters
                          ? 'border-success bg-success/10'
                          : 'border-border hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm font-medium ${isPassedAllFilters ? 'text-success' : ''}`}>
                            {displayName}
                          </span>
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
                          className={`text-lg font-bold ${isPassedAllFilters ? 'text-success' : ''}`}
                          data-testid={`count-filter-${key}`}
                          data-count={count}
                        >
                          {isPassedAllFilters
                            ? (filterData?.survivedCount?.toLocaleString() ?? '0')
                            : count.toLocaleString()
                          }
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
              <p className="text-xs text-muted-foreground">Loading 24h breakdown data...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
