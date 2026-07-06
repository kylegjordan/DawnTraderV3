/**
 * P19-B8.3 (OBJ-4) — the portfolio metrics strip, MOVED here from the top bar
 * (the B8.1-pinned item: mode state lives on the mode pages, not floating over
 * every page). Verbatim port of the top-bar strip's fields + its two
 * portfolio-refresh WS listeners (trade_closed; price_updated throttled 3s) —
 * the top bar keeps ZERO strip listeners post-move (Langston hard check).
 *
 * OBJ-5 labels: every balance names its basis — no bare "$X" (Kyle).
 * OBJ-8: a failed load shows a visible error, never a silent blank.
 * Live mode renders dormancy-aware (the endpoint 409s honestly when no
 * portfolio row exists — shown as "no session", not zeros).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface PortfolioSummary {
  ok: boolean;
  startingBalance: number;
  currentBalance: number;
  netPnl: number;
  netPnlPercent: number;
  totalPositionValue: number;
  openTradesCount: number;
  slotsAvailable: number;
}

const money = (v: number | undefined) =>
  v === undefined || !Number.isFinite(v) ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PortfolioMetricsStrip({ mode }: { mode: "paper" | "live" }) {
  const queryClient = useQueryClient();
  const { messages: wsMessages } = useWebSocket();

  const summary = useQuery<PortfolioSummary>({
    queryKey: ["/api/active-engine/portfolio-summary", mode],
    queryFn: () => apiFetch(`/api/active-engine/portfolio-summary?mode=${mode}`),
    refetchInterval: 10000,
    staleTime: 5000,
    retry: 1,
  });

  // Phase 8.8.3-I10-FIX (moved with the strip): trade_closed → immediate refresh.
  useEffect(() => {
    const tradeClosed = wsMessages.filter((msg: any) => msg.type === "trade_closed");
    if (tradeClosed.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/active-engine/portfolio-summary", mode] });
    }
  }, [wsMessages, queryClient, mode]);

  // Phase 8.8.3-I10-FIX (moved with the strip): price updates, throttled to 3s.
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  useEffect(() => {
    const priceUpdates = wsMessages.filter((msg: any) => msg.type === "price_updated");
    if (priceUpdates.length > 0) {
      const now = Date.now();
      if (now - lastRefresh > 3000) {
        queryClient.invalidateQueries({ queryKey: ["/api/active-engine/portfolio-summary", mode] });
        setLastRefresh(now);
      }
    }
  }, [wsMessages, queryClient, mode, lastRefresh]);

  if (summary.isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs" data-testid="metrics-strip-error">
        <AlertTriangle className="w-3 h-3 text-destructive" />
        <span>
          {mode === "live"
            ? "No live session exists yet — live mode arrives in Phase 21."
            : "Couldn't load the balance strip — a data-feed failure, not zero balances."}
        </span>
        {mode === "paper" && (
          <button className="underline" onClick={() => summary.refetch()} data-testid="metrics-strip-retry">Retry</button>
        )}
      </div>
    );
  }
  const p = summary.data;
  if (!p) return <div className="text-xs text-muted-foreground px-3 py-1.5">Loading balances…</div>;

  const modeLabel = mode === "paper" ? "Paper (simulated)" : "Live (record)";
  return (
    <div className="flex flex-wrap items-center gap-3 md:gap-6 px-3 py-1.5 bg-primary/5 border border-primary/10 rounded-md" data-testid={`metrics-strip-${mode}`}>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Starting — {modeLabel}:</span>
        <span className="font-mono font-semibold" data-testid="strip-starting">{money(p.startingBalance)}</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Realized Balance:</span>
        <span className="font-mono font-semibold" data-testid="strip-current">{money(p.currentBalance)}</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Net P/L:</span>
        <span className={cn("font-mono font-bold", (p.netPnl ?? 0) >= 0 ? "text-green-600" : "text-red-600")} data-testid="strip-pnl">
          {(p.netPnl ?? 0) >= 0 ? "+" : ""}{money(p.netPnl)}
        </span>
      </div>
      <div className="hidden sm:flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">P/L %:</span>
        <span className={cn("font-mono font-bold", (p.netPnlPercent ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
          {(p.netPnlPercent ?? 0) >= 0 ? "+" : ""}{(p.netPnlPercent ?? 0).toFixed(2)}%
        </span>
      </div>
      <div className="hidden md:flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Open Positions (marked live):</span>
        <span className="font-mono font-semibold">{money(p.totalPositionValue)}</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">Open Trades / Slots:</span>
        <span className="font-mono font-semibold">{p.openTradesCount ?? 0} / {p.slotsAvailable ?? 0}</span>
      </div>
    </div>
  );
}
