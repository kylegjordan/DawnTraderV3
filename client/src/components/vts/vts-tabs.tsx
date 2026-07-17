/**
 * P19-B8.1 (C2) — self-fetching VTS tab wrappers.
 *
 * The extracted presentational components (OpenTradesTable / ClosedTradesTable /
 * FilterDiagnosticsPanel) take data as props; these wrappers own the queries,
 * refresh, and CSV export so any mode page can mount them straight from a tab
 * manifest — full-fidelity moves of the Machine Learning page's former tabs
 * (nothing lost in the move: same endpoints, same refresh cadence, same export).
 * Endpoints are the pre-audit §2 pinned contract — VTS family reads /api/vts/*.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ensureValidToken } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";
import { OpenTradesTable } from "@/components/vts/vts-open-trades-table";
import { ClosedTradesTable } from "@/components/vts/vts-closed-trades-table";
import { FilterDiagnosticsPanel } from "@/components/vts/vts-filter-diagnostics-panel";
import {
  type OpenTrade,
  type ClosedTrade,
  type FilterDiagnosticsData,
} from "@/components/vts/vts-shared";
// P19-B8.7 Step-9 (Kyle name-regression fix): the tables render getAssetName, so
// the wrappers own the overlay loading — B8.1 moved these tabs off the Machine
// Learning page, which was the ONLY overlay loader; names silently went blank.
import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";

async function downloadCsv(path: string, filename: string): Promise<void> {
  try {
    const token = await ensureValidToken();
    const response = await fetch(path, {
      credentials: 'include',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
  }
}

export function VtsOpenTradesTab() {
  useAssetNameOverlays();
  const { data, isLoading, isError, refetch } = useQuery<{ success: boolean; count: number; trades: OpenTrade[] }>({
    queryKey: ['/api/vts/ml/open'],
    queryFn: () => apiFetch('/api/vts/ml/open'),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between">
          {/* P19-B8.3c: the open-trade COUNT restored atop the tab (dropped in
              the B8.1 machine-learning extraction). Reflects the rendered rows. */}
          <span>Open Simulated Trades{!isError && data?.trades ? <span className="ml-2 text-sm font-normal text-muted-foreground" data-testid="vts-open-count">({data.trades.length})</span> : null}</span>
          <span className="flex items-center gap-2">
            <span className="text-sm font-normal text-muted-foreground">
              Auto-refresh: 60s | Max: 300 trades
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv('/api/vts/ml/open/export', `vts_open_trades_${new Date().toISOString().slice(0, 10)}.csv`)}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          /* P19-B8.3 (OBJ-8, the 2026-07-06 zero-trades scare): a failed fetch
             must never render as an empty table. */
          <div className="flex items-center gap-2 p-4 text-sm border border-destructive/40 bg-destructive/10 m-3 rounded-md" data-testid="vts-open-error">
            <span>Couldn't load open trades — a data-feed failure (often an expired session), NOT zero trades.</span>
            <button className="underline ml-auto" onClick={() => refetch()}>Retry</button>
          </div>
        ) : (
          <OpenTradesTable trades={data?.trades ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

export function VtsClosedTradesTab() {
  useAssetNameOverlays();
  const { data, isLoading, isError, refetch } = useQuery<{ success: boolean; days: number; trades: ClosedTrade[] }>({
    queryKey: ['/api/vts/ml/closed'],
    queryFn: () => apiFetch('/api/vts/ml/closed?days=7'),
    refetchInterval: 300000,
    staleTime: 60000,
  });
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between">
          {/* P19-B8.3c: the closed-trade COUNT restored atop the tab. */}
          <span>Closed Simulated Trades (Last 7 Days){!isError && data?.trades ? <span className="ml-2 text-sm font-normal text-muted-foreground" data-testid="vts-closed-count">({data.trades.length})</span> : null}</span>
          <span className="flex items-center gap-2">
            <span className="text-sm font-normal text-muted-foreground">Auto-refresh: 5 min</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCsv('/api/vts/ml/closed/export?days=7', `vts_closed_trades_7d_${new Date().toISOString().slice(0, 10)}.csv`)}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          /* P19-B8.3 (OBJ-8): same visible-failure rule as the open-trades tab. */
          <div className="flex items-center gap-2 p-4 text-sm border border-destructive/40 bg-destructive/10 m-3 rounded-md" data-testid="vts-closed-error">
            <span>Couldn't load closed trades — a data-feed failure (often an expired session), NOT zero trades.</span>
            <button className="underline ml-auto" onClick={() => refetch()}>Retry</button>
          </div>
        ) : (
          <ClosedTradesTable trades={data?.trades ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

// P19-B8.3 (OBJ-3c/OBJ-8): mode-aware disposition threading + a visible error
// state — a failed fetch must never render as an empty panel.
export function CryptoFilterDiagnosticsTab({ gateDisposition = 'tag', modeTail = null }: {
  gateDisposition?: 'enforce' | 'tag';
  modeTail?: 'paper' | 'live' | null;
}) {
  const { data, isLoading, isError, refetch } = useQuery<FilterDiagnosticsData>({
    queryKey: ['/api/vts/filter-diagnostics'],
    queryFn: () => apiFetch('/api/vts/filter-diagnostics'),
    refetchInterval: 15000,
    refetchIntervalInBackground: true, // B8.4c: keep the crypto scanner card's next-scan countdown live off-focus
    staleTime: 10000,
  });
  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm" data-testid="fd-crypto-error">
        <span>Couldn't load the crypto filter diagnostics — a data-feed failure, not an empty pipeline.</span>
        <button className="underline ml-auto" onClick={() => refetch()}>Retry</button>
      </div>
    );
  }
  return <FilterDiagnosticsPanel data={data} isLoading={isLoading} gateDisposition={gateDisposition} modeTail={modeTail} />;
}
