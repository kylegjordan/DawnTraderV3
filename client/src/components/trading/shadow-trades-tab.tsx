import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTradingMode } from "@/contexts/trading-mode-context";
import { apiFetch } from "@/lib/api";
import { AssetClassBadge } from "@/components/ui/asset-class-badge";
import { Ghost, RefreshCw, Trophy, Crown, Target, Clock } from "lucide-react";

/**
 * reorg-B4.1 — Shadow Trades tab. Visualizes the selection-quality telemetry: per
 * promotion cycle, the full ready-to-buy pool ranked by FinalScore, the candidate
 * the ranker actually promoted, and how every candidate's shadow trade turned out —
 * so you can see "did we pick the best of the field?". DORMANT until paper-mode
 * active trading is on (no shadow rows exist while nothing is being promoted).
 */

interface ShadowMember {
  rank: number;
  promoted: boolean;
  symbol: string;
  strategy: string;
  assetClass: string;
  finalScore: number | null;
  confidence: number | null;
  regime: string | null;
  closed: boolean;
  netPnl: number | null;
  grossPnl: number | null;
  rMultiple: number | null;
  closeReason: string | null;
  exitPrice: number | null;
  entryPrice: number | null;
  holdingMs: number | null;
}
interface ShadowCycle {
  cycleKey: string;
  openedAt: string;
  poolSize: number;
  members: ShadowMember[];
}
interface OpenShadow {
  id: string; symbol: string; strategy: string; assetClass: string;
  entryPrice: number | null; stopPrice: number | null; targetPrice: number | null; openedAt: string;
}
interface ShadowResponse {
  ok: boolean;
  mode: string;
  totalCycles: number;
  cycles: ShadowCycle[];
  openShadows: OpenShadow[];
  summary: { cyclesEvaluated: number; promotedWasBest: number; promotedAboveMedian: number };
  dormant: boolean;
  generatedAt: string;
}

function fmt(v: number | null, d = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
function fmtTime(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SummaryCard({ title, value, sub, icon: Icon }: { title: string; value: string; sub?: string; icon?: any }) {
  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{title}</span>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function ShadowTradesTab() {
  const { isPaper } = useTradingMode();
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const dataRef = useRef<ShadowResponse | null>(null);
  const { data, isFetching, refetch } = useQuery<ShadowResponse>({
    queryKey: ['/api/shadow-trades/by-cycle', { mode: isPaper ? 'paper' : 'live', limit: pageSize, offset: page * pageSize }],
    queryFn: async () => apiFetch(`/api/shadow-trades/by-cycle?mode=${isPaper ? 'paper' : 'live'}&limit=${pageSize}&offset=${page * pageSize}`),
    staleTime: 30000,
    refetchInterval: 60000,
  });
  useEffect(() => { if (data) dataRef.current = data; }, [data]);
  const resp = data ?? dataRef.current;

  const totalCycles = resp?.totalCycles ?? 0;
  const totalPages = Math.ceil(totalCycles / pageSize);
  const cycles = resp?.cycles ?? [];
  const openShadows = resp?.openShadows ?? [];
  const summary = resp?.summary ?? { cyclesEvaluated: 0, promotedWasBest: 0, promotedAboveMedian: 0 };
  const bestPct = summary.cyclesEvaluated > 0 ? (summary.promotedWasBest / summary.cyclesEvaluated) * 100 : 0;
  const medPct = summary.cyclesEvaluated > 0 ? (summary.promotedAboveMedian / summary.cyclesEvaluated) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Explainer + summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ghost className="w-5 h-5" />
              <span>Shadow Trades — Selection Quality</span>
              {isFetching && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            </Button>
          </CardTitle>
          <div className="text-sm text-muted-foreground font-normal pt-1">
            Each promotion cycle, a telemetry-only "shadow" trade is opened for <em>every</em> ready-to-buy candidate — the one
            promoted to a real trade <em>and</em> the ones passed over — then resolved through the same exit logic as real trades.
            This answers: of the field available, did the ranker promote the best?
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard title="Cycles Captured" value={String(totalCycles)} icon={Ghost} />
            <SummaryCard title="Promoted = Best" value={summary.cyclesEvaluated > 0 ? `${bestPct.toFixed(0)}%` : '—'} sub={`${summary.promotedWasBest}/${summary.cyclesEvaluated} cycles`} icon={Crown} />
            <SummaryCard title="Promoted ≥ Median" value={summary.cyclesEvaluated > 0 ? `${medPct.toFixed(0)}%` : '—'} sub={`${summary.promotedAboveMedian}/${summary.cyclesEvaluated} cycles`} icon={Trophy} />
            <SummaryCard title="Open Shadows" value={String(openShadows.length)} sub="in flight" icon={Target} />
          </div>
          {totalCycles === 0 && (
            <div className="mt-4 p-4 rounded-lg border border-dashed bg-muted/30 text-center text-sm text-muted-foreground" data-testid="shadow-empty-state">
              No shadow trades yet. This view populates once paper-mode active trading is turned on — while trading is off, nothing
              is being promoted, so there are no candidates to shadow. The layer is wired and dormant by design.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open shadows in flight */}
      {openShadows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Clock className="w-4 h-4" /> Open Shadows ({openShadows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {openShadows.slice(0, 60).map((o) => (
                <div key={o.id} className="flex items-center justify-between p-2 rounded border bg-muted/20 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{o.symbol}</span>
                    <AssetClassBadge assetClass={o.assetClass as any} />
                    <Badge variant="outline" className="text-[10px]">{o.strategy}</Badge>
                  </div>
                  <span className="font-mono text-muted-foreground">{fmtTime(o.openedAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* By-cycle pool comparison */}
      {cycles.map((c) => {
        const allClosed = c.members.length > 0 && c.members.every((m) => m.closed);
        const closedPnls = c.members.filter((m) => m.closed && m.netPnl !== null).map((m) => m.netPnl as number);
        const bestPnl = closedPnls.length > 0 ? Math.max(...closedPnls) : null;
        return (
          <Card key={c.cycleKey} data-testid={`shadow-cycle-${c.cycleKey}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground font-normal text-sm">Promotion cycle</span>
                  {fmtTime(c.openedAt)}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {c.poolSize} candidate{c.poolSize !== 1 ? 's' : ''} ranked{!allClosed && ' · resolving…'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="p-2 text-left">Rank</th>
                      <th className="p-2 text-left">Symbol</th>
                      <th className="p-2 text-left">Strategy</th>
                      <th className="p-2 text-right">FinalScore</th>
                      <th className="p-2 text-left">Outcome</th>
                      <th className="p-2 text-right">Net P/L %</th>
                      <th className="p-2 text-right">R</th>
                      <th className="p-2 text-right">Hold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {c.members.map((m) => {
                      const isBest = m.closed && m.netPnl !== null && bestPnl !== null && m.netPnl >= bestPnl;
                      return (
                        <tr key={`${c.cycleKey}-${m.rank}-${m.symbol}`} className={cn("hover:bg-muted/40", m.promoted && "bg-primary/5")}>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <span className="font-mono">{m.rank + 1}</span>
                              {m.promoted && (
                                <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30" title="The ranker promoted this candidate this cycle (NOT execution-confirmed)">
                                  <Crown className="w-3 h-3 mr-0.5" />Promoted
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">{m.symbol}</span>
                              <AssetClassBadge assetClass={m.assetClass as any} />
                            </div>
                          </td>
                          <td className="p-2"><Badge variant="outline" className="text-xs">{m.strategy}</Badge></td>
                          <td className="p-2 text-right font-mono text-xs">{fmt(m.finalScore, 4)}</td>
                          <td className="p-2">
                            {!m.closed ? (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Open</Badge>
                            ) : (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className={cn("text-xs",
                                  m.closeReason === 'target_hit' && "bg-green-500/15 text-green-600 border-green-500/40",
                                  m.closeReason === 'stop_hit' && "bg-red-500/15 text-red-600 border-red-500/40",
                                )}>
                                  {m.closeReason ?? 'closed'}
                                </Badge>
                                {isBest && <Trophy className="w-3.5 h-3.5 text-amber-500" aria-label="best outcome this cycle" />}
                              </div>
                            )}
                          </td>
                          <td className={cn("p-2 text-right font-mono text-xs", m.netPnl !== null && (m.netPnl >= 0 ? "text-green-600" : "text-red-600"))}>
                            {m.netPnl === null ? '—' : `${m.netPnl >= 0 ? '+' : ''}${fmt(m.netPnl * 100, 2)}%`}
                          </td>
                          <td className={cn("p-2 text-right font-mono text-xs", m.rMultiple !== null && (m.rMultiple >= 0 ? "text-green-600" : "text-red-600"))}>
                            {m.rMultiple === null ? '—' : `${m.rMultiple >= 0 ? '+' : ''}${fmt(m.rMultiple, 2)}R`}
                          </td>
                          <td className="p-2 text-right font-mono text-xs text-muted-foreground">{fmtDuration(m.holdingMs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-sm text-muted-foreground">Page {page + 1} of {totalPages} · {totalCycles} cycles</div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Prev</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
