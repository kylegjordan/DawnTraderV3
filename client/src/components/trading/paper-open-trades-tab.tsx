/**
 * P19-B8.7 Step-9 — the paper Open Trades tab, rebuilt on the SHARED VTS-mirror
 * table (Langston shared-component ruling B). Replaces active-trades-v2.tsx.
 *
 * What this keeps from the old tab (the SHELL): the count header, WS-connection
 * + mode badges, the IntegrityBanner (system-vs-UI count, guardrail cap, slots,
 * Clear Stranded / Clear & Reset All actions), the 10s active-trades query, and
 * WS-driven refresh.
 *
 * What changed (and why):
 *  - The table itself is the shared OpenTradesTable (vts-open-trades-table.tsx),
 *    fed through the pure adapter (paper-trade-adapter.ts) — one layout for VTS
 *    and paper, per Kyle's layout-identity directive. Paper-only columns (Slot,
 *    Source, Actions) ride the append props, default OFF for the VTS mount.
 *  - FIX-ON-FIND (CLAUDE.md rule 23): the old tab recomputed P/L client-side on
 *    every WS price tick using HARDCODED fee/slippage constants (0.10%/0.15%,
 *    commented "same as backend") that do NOT match the DB-governed fee model.
 *    That recompute is DELETED — prices/P&L are server-authoritative; WS price
 *    ticks now trigger a throttled (3s) query invalidation instead, the same
 *    pattern the portfolio metrics strip uses.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiFetch } from "@/lib/api";
import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";
import { OpenTradesTable } from "@/components/vts/vts-open-trades-table";
import { adaptPaperOpenTrade, type PaperActiveTradeRow, type AdaptedOpenTrade } from "@/lib/paper-trade-adapter";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Beaker,
  Wifi,
  WifiOff,
  RotateCcw,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface IntegrityStatus {
  systemCount: number;
  maxOpenTrades: number;
  slotsAvailable: number;
  status: 'OK' | 'OVER_LIMIT';
}

interface PortfolioSummaryLite {
  startingBalance: number;
  currentBalance: number;
  realizedBalance?: number;
  totalPositionValue: number;
  netPnl: number;
  netPnlPercent: number;
}

interface ActiveTradesResponse {
  ok: boolean;
  positions: PaperActiveTradeRow[];
  integrity: IntegrityStatus;
  portfolio: PortfolioSummaryLite;
}

// The integrity/actions banner, moved verbatim from active-trades-v2.tsx
// (that file is deleted with this rewire — rule 18).
function IntegrityBanner({
  integrity,
  uiCount,
  portfolio,
  openTradesNetPnlSum,
  onClearStranded,
  isClearing,
  onResetAll,
  isResetting,
}: {
  integrity: IntegrityStatus;
  uiCount: number;
  portfolio: PortfolioSummaryLite;
  openTradesNetPnlSum: number;
  onClearStranded: () => void;
  isClearing: boolean;
  onResetAll: () => void;
  isResetting: boolean;
}) {
  const isMismatch = integrity.systemCount !== uiCount;
  const status = isMismatch ? 'MISMATCH' : integrity.status;

  return (
    <div className={cn(
      "p-4 rounded-lg border mb-4",
      status === 'OK' ? "bg-green-500/5 border-green-500/20" :
      status === 'MISMATCH' ? "bg-yellow-500/10 border-yellow-500/30" :
      "bg-red-500/10 border-red-500/30"
    )}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">System Active Trades:</span>
            <span className="font-bold">{integrity.systemCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">UI Active Trades:</span>
            <span className="font-bold">{uiCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Guardrail Max:</span>
            <span className="font-bold">{integrity.maxOpenTrades}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Slots Available:</span>
            <span className={cn("font-bold", integrity.slotsAvailable > 0 ? "text-green-600" : "text-red-600")}>
              {integrity.slotsAvailable}
            </span>
          </div>
          {/* Phase 8.8.4-A.2: Portfolio Value (unrealized) = Current Balance + Unrealized Net P/L */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Portfolio Value (unrealized):</span>
            <span className={cn("font-bold", ((portfolio.realizedBalance ?? 0) + openTradesNetPnlSum) >= (portfolio.startingBalance ?? 0) ? "text-green-600" : "text-red-600")}>
              ${((portfolio.realizedBalance ?? 0) + openTradesNetPnlSum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {status === 'OK' ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Status: OK</span>
            </div>
          ) : status === 'MISMATCH' ? (
            <div className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">MISMATCH - Possible Stranded Trade</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">OVER LIMIT</span>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={onClearStranded}
            disabled={isClearing}
            className="text-xs border-red-200 text-red-600 hover:bg-red-50"
          >
            {isClearing ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
            Clear Stranded
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-orange-200 text-orange-600 hover:bg-orange-50"
                data-testid="button-clear-reset-all"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Clear & Reset All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Paper Trading Session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will close all open positions and refresh session state.
                  Your trade history will remain intact for review.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>No</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onResetAll}
                  disabled={isResetting}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {isResetting ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                  Yes, Reset All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

export default function PaperOpenTradesTab({ mode }: { mode?: 'paper' | 'live' } = {}) {
  const { isPaper: globalIsPaper } = useTradingMode();
  const isPaper = mode ? mode === 'paper' : globalIsPaper;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { messages, isConnected } = useWebSocket();

  // Company/coin name overlays for the stacked symbol cell (B-NAMES home).
  useAssetNameOverlays();

  const { data, isLoading } = useQuery<ActiveTradesResponse>({
    queryKey: ['/api/active-engine/active-trades'],
    enabled: isPaper,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    staleTime: 5000,
    refetchOnWindowFocus: true,
  });

  // WS-driven refresh: trade events invalidate immediately; price ticks are
  // throttled to 3s (server-authoritative numbers — no client P/L recompute).
  const [lastPriceRefresh, setLastPriceRefresh] = useState(0);
  useEffect(() => {
    if (!isPaper || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.type === 'price_updated') {
      const now = Date.now();
      if (now - lastPriceRefresh > 3000) {
        queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
        setLastPriceRefresh(now);
      }
      return;
    }
    const tradeEventTypes = [
      'active_trade_closed', 'trade_opened', 'trade_closed',
      'position_update', 'active_trade_executed', 'trading_state_changed', 'scan_tick',
    ];
    if (tradeEventTypes.includes(last.type)) {
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    }
  }, [messages, isPaper, queryClient, lastPriceRefresh]);

  const closeTradeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiFetch(`/api/active-engine/close-trade/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_close' }),
      });
    },
    onSuccess: (result: any) => {
      const isSuccess = result?.success === true || result?.ok === true || result?.closedTradeId;
      if (isSuccess) {
        const pnl = result?.pnl ?? 0;
        toast({ title: "Trade Closed", description: result?.message || `P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` });
      } else {
        toast({ title: "Error", description: result?.error || "Failed to close trade", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to close trade", variant: "destructive" });
    },
  });

  const clearStrandedMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/active-engine/force-clear-stranded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (result: any) => {
      const isSuccess = result?.success === true || result?.ok === true;
      if (isSuccess) {
        toast({ title: "Stranded Trades Cleared", description: result.message || `Cleared ${result.strandedClosed || result.clearedCount || 0} stranded trades` });
      } else {
        toast({ title: "Error", description: result?.error || "Failed to clear stranded trades", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear stranded trades", variant: "destructive" });
    },
  });

  const resetSessionMutation = useMutation({
    mutationFn: async () => {
      return await apiFetch('/api/active-engine/reset', { method: 'POST', body: JSON.stringify({ mode: 'paper' }) });
    },
    onSuccess: (result: any) => {
      toast({ title: "Session Reset", description: result?.message || "Paper trading session has been cleared. Set new balance when you restart trading." });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/active-trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/active-engine/portfolio-summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trading-signals'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset session", variant: "destructive" });
    },
  });

  // Symbol+side dedup safeguard (kept from the old tab — I7-PM-FOCUS).
  const rows = useMemo(() => {
    const byKey = new Map<string, PaperActiveTradeRow>();
    (data?.positions ?? []).forEach((pos) => {
      const key = `${pos.symbol}:${pos.side ?? 'buy'}`;
      const existing = byKey.get(key);
      if (!existing || new Date(pos.openedAt) < new Date(existing.openedAt)) {
        byKey.set(key, pos);
      }
    });
    return Array.from(byKey.values());
  }, [data?.positions]);

  const trades = useMemo(() => rows.map(adaptPaperOpenTrade), [rows]);

  if (!isPaper) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Active Trades panel is only available in Paper Trading mode</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const integrity = data?.integrity || { systemCount: 0, maxOpenTrades: 0, slotsAvailable: 0, status: 'OK' as const };
  const portfolio = data?.portfolio || { startingBalance: 0, currentBalance: 0, realizedBalance: 0, totalPositionValue: 0, netPnl: 0, netPnlPercent: 0 };
  const openTradesNetPnlSum = rows.reduce((sum, pos) => sum + (Number(pos.netPnl) || 0), 0);

  return (
    <section data-testid="paper-open-trades-tab">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
          Active Trades <span className="text-base font-normal text-muted-foreground" data-testid="active-trades-count">({rows.length})</span>
        </h2>
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
            isConnected ? "text-green-600 bg-green-500/10" : "text-red-600 bg-red-500/10"
          )}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isConnected ? "Connected" : "Offline"}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10">
            <Beaker className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400" data-testid="open-trades-mode-badge">
              {isPaper ? "Paper Trading" : "Live Trading"}
            </span>
          </div>
        </div>
      </div>

      <IntegrityBanner
        integrity={integrity}
        uiCount={rows.length}
        portfolio={portfolio}
        openTradesNetPnlSum={openTradesNetPnlSum}
        onClearStranded={() => clearStrandedMutation.mutate()}
        isClearing={clearStrandedMutation.isPending}
        onResetAll={() => resetSessionMutation.mutate()}
        isResetting={resetSessionMutation.isPending}
      />

      <Card className="rounded-xl border shadow-sm overflow-hidden p-2">
        {/* P19-B8.10 (OBJ-3): Slot sits directly after Symbol (Kyle 2026-07-18). */}
        <OpenTradesTable
          trades={trades}
          emptyLabel="No open trades"
          hidePoolColumn
          rankHeaderLabel="Promote R"
          rankHeaderTitle="R-multiple at promotion — the ranking score this trade won its slot with (frozen at promote; the RTB tab shows the live value). '—' for trades opened before this stamp existed."
          afterSymbolHeaders={
            <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Engine slot this position occupies, out of the guardrail cap.">Slot</th>
          }
          renderAfterSymbolCells={(trade) => {
            const t = trade as AdaptedOpenTrade;
            return (
              <td className="px-3 py-2 text-right font-mono text-xs">
                {t.slotNumber != null ? `${t.slotNumber}${Number.isFinite(Number(t.maxSlots)) ? ` / ${t.maxSlots}` : ''}` : '—'}
              </td>
            );
          }}
          extraHeaders={
            <>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Price feed this row's Current value came from (WS = live Kraken WebSocket; REST = polling fallback).">Source</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actions</th>
            </>
          }
          renderExtraCells={(trade) => {
            const t = trade as AdaptedOpenTrade;
            return (
              <>
                <td className="px-3 py-2 text-xs font-mono">{t.sourceLabel ?? '—'}</td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-red-600 hover:bg-red-50"
                    disabled={closeTradeMutation.isPending || !t.id}
                    onClick={() => t.id && closeTradeMutation.mutate(t.id)}
                    data-testid={`close-trade-${t.symbol}`}
                  >
                    <X className="w-3 h-3 mr-1" />
                    Close
                  </Button>
                </td>
              </>
            );
          }}
        />
      </Card>
    </section>
  );
}
