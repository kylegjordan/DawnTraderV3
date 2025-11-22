import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useScanTick } from "@/hooks/use-scan-tick";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ScanSummaryData {
  scanCycleId: string;
  lastScanCompletedAt: string;
  nextScanEtaMs: number;
  evaluatedCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  cadenceMs: number;
  breakdown: Record<string, number>;
  krakenUniverseSize: number | null;
  cyclesPerHour: number;  // FX5: Cycles per hour metric
}

interface Activity24hData {
  totalEvaluated: number;
  uniqueEvaluated: number;
  totalSurvived: number;
  uniqueSurvived: number;
  breakdown: Record<string, number>;  // FX5: Per-cycle batch-level breakdown (NOT universe-level)
  cyclesLast24h: number;  // FX5: Number of scan cycles in 24h window
}

interface ActivePoolEntry {
  symbol: string;
  status: 'passed';
  firstSeen: string;
  lastUpdated: string;
  expiresAt: number;
}

interface ActivePoolResponse {
  mode: string;
  count: number;
  entries: ActivePoolEntry[];
}

export function FilterInsights() {
  const { mode } = useTradingMode();
  const scanTick = useScanTick();
  
  // Query scan summary
  const { data: scanData, isLoading: loadingScan } = useQuery<ScanSummaryData>({
    queryKey: [`/api/market-scanner/scan-summary?mode=${mode}`],
    staleTime: Infinity,
  });

  // Query 24h activity
  const { data: activity24h, isLoading: loading24h } = useQuery<Activity24hData>({
    queryKey: [`/api/market-scanner/24h-activity?mode=${mode}`],
    staleTime: Infinity,
  });

  // Query active pool
  const { data: activePoolResponse, isLoading: loadingPool } = useQuery<ActivePoolResponse>({
    queryKey: [`/api/market-scanner/active-pool?mode=${mode}`],
    staleTime: Infinity,
  });
  
  // Extract entries from response
  const activePool = activePoolResponse?.entries || [];

  // Invalidate queries on scan_tick events
  useEffect(() => {
    if (!scanTick.isLoading && scanTick.scanCycleId) {
      queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/scan-summary?mode=${mode}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/24h-activity?mode=${mode}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/market-scanner/active-pool?mode=${mode}`] });
    }
  }, [scanTick.scanCycleId, mode]);

  // Countdown display
  const countdownDisplay = scanTick.countdownSeconds > 0 ? `${scanTick.countdownSeconds}s` : '0s';
  const scanFrequency = scanData?.cadenceMs ? `every ${scanData.cadenceMs / 1000} seconds` : 'every 30 seconds';

  if (loadingScan || loading24h || loadingPool || scanTick.isLoading) {
    return (
      <div className="space-y-4">
        <Card>
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
    <div className="space-y-6" data-testid="filter-insights">
      {/* FX5.3: Passive Learning Banner */}
      {scanTick.passiveLearningOnly && (
        <div className="bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 p-4 rounded">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                Passive Learning Active — Trading Metrics Paused
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                The scanner is observing the market without executing trades. Trading metrics, active filter pool, and breakdown data are not being updated.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scan & Filter Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Scan & Filter Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Row 1: Kraken Universe */}
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold mb-2">Kraken Universe</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Total Kraken Trading Pairs:</span>
                <span className="text-lg font-bold">{scanData?.krakenUniverseSize?.toLocaleString() || '—'}</span>
              </div>
            </div>

            {/* Row 2: Cycle Info */}
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold mb-2">Cycle Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Last Scan Cycle ID:</span>
                  <span className="text-sm font-mono">{scanData?.scanCycleId || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Last Scan Time:</span>
                  <span className="text-sm">{scanData?.lastScanCompletedAt ? new Date(scanData.lastScanCompletedAt).toLocaleString() : '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Next Scan In:</span>
                  <span className="text-sm font-bold">{countdownDisplay}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Scan Frequency:</span>
                  <span className="text-sm">{scanFrequency}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Cycles per Hour:</span>
                  <span className="text-sm font-bold">{scanData?.cyclesPerHour?.toFixed(1) || '0.0'}</span>
                </div>
              </div>
            </div>

            {/* Row 3: Last Scan Result */}
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold mb-2">Last Scan Result</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Evaluated This Scan:</span>
                  <span className="text-lg font-bold">{scanData?.evaluatedCount || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Eligible This Scan:</span>
                  <span className="text-lg font-bold text-green-600">{scanData?.eligibleCount || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Ineligible This Scan:</span>
                  <span className="text-lg font-bold text-muted-foreground">{scanData?.ineligibleCount || 0}</span>
                </div>
              </div>
            </div>

            {/* Row 4: 24h Filter Activity */}
            <div>
              <h3 className="text-sm font-semibold mb-2">24h Filter Activity</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Total Evaluated (24h):</span>
                  <span className="text-lg font-bold">{activity24h?.totalEvaluated.toLocaleString() || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Unique Evaluated (24h):</span>
                  <span className="text-lg font-bold">{activity24h?.uniqueEvaluated.toLocaleString() || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Total Survived Filters (24h):</span>
                  <span className="text-lg font-bold text-green-600">{activity24h?.totalSurvived.toLocaleString() || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Unique Survived Filters (24h):</span>
                  <span className="text-lg font-bold text-green-600">{activity24h?.uniqueSurvived.toLocaleString() || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Cycles (24h):</span>
                  <span className="text-lg font-bold text-blue-600">{activity24h?.cyclesLast24h || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Filtered Pool */}
      <Card>
        <CardHeader>
          <CardTitle>Active Filtered Pool (Deduped, Non-Expired)</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Total Active Filtered Pairs: <span className="font-bold">{activePoolResponse?.count || activePool.length || 0}</span>
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>First Seen (this window)</TableHead>
                <TableHead>Last Updated (this cycle)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activePool && activePool.length > 0 ? (
                activePool.map((entry) => (
                  <TableRow key={entry.symbol}>
                    <TableCell className="font-mono">{entry.symbol}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Passed all filters
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(entry.firstSeen).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(entry.lastUpdated).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No active filtered pairs at this time
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-4">
            This table shows all pairs that have passed filters recently, are still
            within the active time window, and have been deduplicated. Strategies
            are evaluated against this active pool using fresh market data.
          </p>
        </CardContent>
      </Card>

      {/* Filter Breakdown (Last 24 Hours) */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Breakdown (Last 24 Hours)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-b pb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Total Evaluated (24h):</span>
                <span className="text-lg font-bold">{activity24h?.totalEvaluated.toLocaleString() || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Total Survived Filters (24h):</span>
                <span className="text-lg font-bold text-green-600">{activity24h?.totalSurvived.toLocaleString() || 0}</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3">Breakdown by Filter (24h)</h3>
              <div className="space-y-2">
                {activity24h?.breakdown && Object.entries(activity24h.breakdown).map(([key, count]) => {
                  const displayName = key
                    .replace('failed_', '')
                    .replace('strategy_none_triggered', 'No Strategy Triggered')
                    .replace(/_/g, ' ')
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                  
                  return (
                    <div key={key} className="flex items-center justify-between py-2 px-3 rounded border">
                      <span className="text-sm">{displayName}</span>
                      <span className="text-sm font-mono font-bold">{count.toLocaleString()}</span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between py-2 px-3 rounded border bg-green-50 border-green-200">
                  <span className="text-sm font-semibold text-green-700">Passed All Filters</span>
                  <span className="text-sm font-mono font-bold text-green-700">{activity24h?.totalSurvived.toLocaleString() || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
