import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { apiFetch } from "@/lib/api";
// P19-B8.7 Step-9: the table is the shared VTS-mirror component + pure adapter;
// the bespoke markup and its helpers (DualScrollTable, SortableHeader, strategy
// color/name maps, formatters) are deleted with it (rule 18).
import { ClosedTradesTable } from "@/components/vts/vts-closed-trades-table";
import { adaptPaperClosedTrade, type AdaptedClosedTrade } from "@/lib/paper-trade-adapter";
import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

// P19-B8.7 Step-9 (rule 18): the bespoke table helpers that lived here —
// formatNumber, DualScrollTable, the strategyColors/strategyNames maps,
// formatDuration, SortableHeader — are DELETED with the bespoke markup; the
// shared vts-closed-trades-table.tsx + vts-shared.tsx now own the rendering.


export function TradeHistoryTab() {
  const { isPaper } = useTradingMode();

  // Company/coin name overlays for the shared table's stacked symbol cell.
  useAssetNameOverlays();

  // Phase 8.8.3-C-FINAL PART 6: Pending filters (user edits these)
  const [pendingFilters, setPendingFilters] = useState({
    symbol: '',
    strategy: 'all',
    closeReason: 'all',
    dateFrom: '',
    dateTo: ''
  });
  
  // Phase 8.8.3-C-FINAL PART 6: Applied filters (used for API calls, triggered by Apply button)
  const [appliedFilters, setAppliedFilters] = useState({
    symbol: '',
    strategy: 'all',
    closeReason: 'all',
    dateFrom: '',
    dateTo: ''
  });
  
  // Phase 8.8.3-C5: Pagination state. P19-B8.7 Step-9: the API sort became a
  // fixed closedAt-desc default when the bespoke sortable headers died — the
  // shared table sorts the current page client-side.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const sortBy = 'closedAt';
  const order: 'asc' | 'desc' = 'desc';
  
  // Phase 8.8.3-C-FINAL PART 6: Apply filters handler
  const handleApplyFilters = () => {
    setAppliedFilters({ ...pendingFilters });
    setPage(0); // Reset to first page when applying filters
  };
  
  // Phase 8.8.3-C-FINAL PART 6: Clear filters handler
  const handleClearFilters = () => {
    const cleared = {
      symbol: '',
      strategy: 'all',
      closeReason: 'all',
      dateFrom: '',
      dateTo: ''
    };
    setPendingFilters(cleared);
    setAppliedFilters(cleared);
    setPage(0);
  };
  
  // Phase 8.8.3-C5: Use paginated API endpoint
  // Phase 8.8.3-C-FINAL PART 5: Fixed queryFn with closeReason and applied filters
  const { data: paginatedData, isFetching, refetch } = useQuery<{
    trades: any[];
    totalCount: number;
    limit: number;
    offset: number;
  }>({
    queryKey: ['/api/active-engine/trades', { 
      paginated: 'true',
      limit: pageSize, 
      offset: page * pageSize,
      sortBy,
      order,
      closedOnly: 'true',
      symbol: appliedFilters.symbol || undefined,
      strategy: appliedFilters.strategy !== 'all' ? appliedFilters.strategy : undefined,
      closeReason: appliedFilters.closeReason !== 'all' ? appliedFilters.closeReason : undefined,
      dateFrom: appliedFilters.dateFrom || undefined,
      dateTo: appliedFilters.dateTo || undefined
    }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('paginated', 'true');
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));
      params.set('sortBy', sortBy);
      params.set('order', order);
      params.set('closedOnly', 'true');
      if (appliedFilters.symbol) params.set('symbol', appliedFilters.symbol);
      if (appliedFilters.strategy !== 'all') params.set('strategy', appliedFilters.strategy);
      if (appliedFilters.closeReason !== 'all') params.set('closeReason', appliedFilters.closeReason);
      // Phase 8.8.3-C-FINAL-2: Convert local date to UTC ISO timestamps
      // When user selects "2025-12-10", they mean Dec 10 in their LOCAL timezone
      // We need to send the UTC boundaries for that local date
      if (appliedFilters.dateFrom) {
        // Create date at start of day in LOCAL timezone, then convert to UTC ISO string
        const localStart = new Date(appliedFilters.dateFrom + 'T00:00:00');
        params.set('dateFrom', localStart.toISOString());
        console.log(`[C-FINAL-2][FE] dateFrom local=${appliedFilters.dateFrom} -> UTC=${localStart.toISOString()}`);
      }
      if (appliedFilters.dateTo) {
        // Create date at end of day in LOCAL timezone, then convert to UTC ISO string
        const localEnd = new Date(appliedFilters.dateTo + 'T23:59:59.999');
        params.set('dateTo', localEnd.toISOString());
        console.log(`[C-FINAL-2][FE] dateTo local=${appliedFilters.dateTo} -> UTC=${localEnd.toISOString()}`);
      }
      return apiFetch(`/api/active-engine/trades?${params.toString()}`);
    },
    enabled: isPaper,
    staleTime: 30000,
    refetchInterval: 60000,
  });
  
  const filteredTrades = paginatedData?.trades || [];
  const totalCount = paginatedData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  
  // P19-B8.7 Step-9: the API-level column-sort handler + getSymbolColor died with
  // the bespoke headers (rule 18) — the shared table sorts the current page
  // client-side; the query keeps its closedAt-desc default ordering.

  return (
    <div className="space-y-6">
      {/* P19-B8.7 (OBJ-6, Kyle-approved DELETE 2026-07-16): the "Current Simulation
          Performance Analytics" panel + its range selector are REMOVED — every metric
          it showed exists on the per-mode Dashboard tab (B8.3), which is richer (Net R,
          profit factor, fee drag, drawdown) and per-mode. The /trades/analytics
          ENDPOINT stays (the Dashboard tab consumes it — traced, rule 18). */}

      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2 text-muted-foreground text-sm font-normal mb-2">
              Historical trade data for Paper Trading mode
            </div>
            <div className="text-2xl">Trade Filters</div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <Input
              placeholder="Search symbol..."
              value={pendingFilters.symbol}
              onChange={(e) => setPendingFilters(prev => ({ ...prev, symbol: e.target.value }))}
              data-testid="input-symbol-filter"
            />
            
            <Select 
              value={pendingFilters.strategy} 
              onValueChange={(value) => setPendingFilters(prev => ({ ...prev, strategy: value }))}
            >
              <SelectTrigger data-testid="select-strategy-filter">
                <SelectValue placeholder="All strategies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All strategies</SelectItem>
                <SelectItem value="vwap_pullback">VWAP Pullback</SelectItem>
                <SelectItem value="abcd_long">ABCD Long</SelectItem>
                <SelectItem value="sma_trend_ride">SMA Trend Ride</SelectItem>
                <SelectItem value="vwap_bounce">VWAP Bounce</SelectItem>
                <SelectItem value="dhma">DHMA</SelectItem>
                <SelectItem value="breakout">Breakout</SelectItem>
                <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
                <SelectItem value="range_trading">Range Trading</SelectItem>
                <SelectItem value="liquidity_trap">Liquidity Trap</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Phase 8.8.3-C-FINAL PART 4: Close Reason filter dropdown */}
            <Select 
              value={pendingFilters.closeReason} 
              onValueChange={(value) => setPendingFilters(prev => ({ ...prev, closeReason: value }))}
            >
              <SelectTrigger data-testid="select-close-reason-filter">
                <SelectValue placeholder="All close reasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All close reasons</SelectItem>
                <SelectItem value="target_hit">Target Price Hit</SelectItem>
                <SelectItem value="stop_hit">Stop Loss</SelectItem>
                <SelectItem value="manual_stop">Manual Stop</SelectItem>
                <SelectItem value="manual_close">Manual Close</SelectItem>
                <SelectItem value="engine_stop_cleanup">Engine Stop Clean</SelectItem>
                <SelectItem value="hard_reset">Hard Reset</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              type="date"
              value={pendingFilters.dateFrom}
              onChange={(e) => setPendingFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              data-testid="input-date-from"
            />
            
            <Input
              type="date"
              value={pendingFilters.dateTo}
              onChange={(e) => setPendingFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              data-testid="input-date-to"
            />
            
            {/* Phase 8.8.3-C-FINAL PART 6: Apply and Clear buttons */}
            <Button
              onClick={handleApplyFilters}
              data-testid="button-apply-filters"
            >
              Apply
            </Button>
            
            <Button
              variant="outline"
              onClick={handleClearFilters}
              data-testid="button-clear-filters"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Trade History</span>
              {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-normal text-muted-foreground">
                {totalCount} total trade{totalCount !== 1 ? 's' : ''}
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTrades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No trades match your filters</p>
            </div>
          ) : (
            <>
              {/* P19-B8.7 Step-9: the paper history table is now the SHARED
                  VTS-mirror ClosedTradesTable (vts-closed-trades-table.tsx), fed
                  through the pure adapter (paper-trade-adapter.ts) — one layout for
                  VTS and paper (Kyle's layout-identity directive; Langston
                  shared-component ruling B). Server-side filter/pagination stay on
                  this shell; the shared table's column sort orders the CURRENT PAGE
                  client-side. The old ~300-line bespoke table markup is deleted
                  (rule 18). */}
              <ClosedTradesTable
                trades={filteredTrades.map(adaptPaperClosedTrade)}
                emptyLabel="No trades match your filters"
                /* Kyle 2026-07-29: Lane MOVED from the appended group to immediately after Symbol.
                   Appended, it landed at the far right of a 35-column / 3,452px-wide table —
                   present and correct, but ~2,500px of horizontal scroll away, i.e. invisible in
                   practice. Verifying that a column RENDERS is not the same as verifying a human
                   can SEE it (§9.3). Matches the Open tab's placement so the two agree. */
                afterSymbolHeaders={
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Admission lane: EXPL = admitted via the exploration lane (learning-data budget); blank = normal net-EV admission. Display-only while exploration mode is active.">Lane</th>
                }
                renderAfterSymbolCells={(trade) => {
                  const t = trade as AdaptedClosedTrade;
                  return (
                    <td className="px-3 py-2">
                      {t.admissionBasis === 'exploration'
                        ? <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400" title="Admitted via the exploration lane (learning-data budget)">EXPL</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  );
                }}
              />
              
              {/* Phase 8.8.3-C5: Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(0)} 
                      disabled={page === 0}
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(0, p - 1))} 
                      disabled={page === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="px-3 text-sm">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} 
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(totalPages - 1)} 
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
