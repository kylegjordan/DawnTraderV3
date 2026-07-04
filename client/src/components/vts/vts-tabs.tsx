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
  const { data, isLoading, refetch } = useQuery<{ success: boolean; count: number; trades: OpenTrade[] }>({
    queryKey: ['/api/vts/ml/open'],
    queryFn: () => apiFetch('/api/vts/ml/open'),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Open Simulated Trades</span>
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
        ) : (
          <OpenTradesTable trades={data?.trades ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

export function VtsClosedTradesTab() {
  const { data, isLoading, refetch } = useQuery<{ success: boolean; days: number; trades: ClosedTrade[] }>({
    queryKey: ['/api/vts/ml/closed'],
    queryFn: () => apiFetch('/api/vts/ml/closed?days=7'),
    refetchInterval: 300000,
    staleTime: 60000,
  });
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Closed Simulated Trades (Last 7 Days)</span>
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
        ) : (
          <ClosedTradesTable trades={data?.trades ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

export function CryptoFilterDiagnosticsTab() {
  const { data, isLoading } = useQuery<FilterDiagnosticsData>({
    queryKey: ['/api/vts/filter-diagnostics'],
    queryFn: () => apiFetch('/api/vts/filter-diagnostics'),
    refetchInterval: 15000,
    staleTime: 10000,
  });
  return <FilterDiagnosticsPanel data={data} isLoading={isLoading} />;
}
