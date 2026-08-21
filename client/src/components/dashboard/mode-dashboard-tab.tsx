/**
 * P19-B8.3 (OBJ-3) — the per-mode Dashboard tab. ONE component, three modes.
 *
 * Layout = Kyle's screenshot-locked legacy-/dashboard widget template, fed with
 * REAL mode-scoped data: Portfolio Value · Earnings (ROLLING 24h/7d/30d — P19-B8.11)
 * · Trading Activity & Results (window selector) · Averages + Edge strip ·
 * Realized-Balance-Over-Time chart · asset-class + strategy breakdown tables.
 *
 * HONESTY RULES baked in:
 * - ONE window vocabulary (Langston Step-2): display labels Day/Week/Month/
 *   Lifetime are pure aliases of the endpoint ranges 24h/7d/30d/all.
 * - The chart is the REALIZED curve (closed-trade basis) and says so; the
 *   Portfolio Value card shows the live figure (incl. open positions) AND the
 *   realized figure, labeled — the card-vs-curve-tip difference is explained
 *   on-screen, never a mystery.
 * - Every null metric renders "—" (never NaN/Infinity); every % carries raw
 *   counts beside it (Kyle standing rule).
 * - A failed fetch renders an ERROR banner + Retry (OBJ-8) — "couldn't load"
 *   must never look like "no trades".
 * - VTS variant: every dollar figure is labeled VIRTUAL (no balance semantics);
 *   the headline is learning breadth (closed volume per day), not profit.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, RefreshCw, TrendingUp, DollarSign, Activity, BarChart3, Info } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot,
} from "recharts";

// ── window vocabulary (ONE set; display aliases of the endpoint ranges)
const WINDOWS = [
  { key: "24h", label: "Day", days: 1 },
  { key: "7d", label: "Week", days: 7 },
  { key: "30d", label: "Month", days: 30 },
  { key: "all", label: "Lifetime", days: 3650 },
] as const;
type WindowKey = (typeof WINDOWS)[number]["key"];

const CHART_RANGES = [
  { label: "7D", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "YTD", days: -1 }, // resolved to days-since-Jan-1 at click time
  { label: "ALL", days: 3650 },
] as const;

// ── formatting (null-honest)
const usd = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(digits)}`;
const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}%`;
const signCls = (v: number | null | undefined) =>
  v === null || v === undefined ? "text-muted-foreground" : v > 0 ? "text-green-600" : v < 0 ? "text-red-500" : "";
const fmtMs = (ms: number | null | undefined) => {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return "—";
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

function ErrorBanner({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid={`dashboard-error-${label}`}>
      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
      <span>Couldn't load {label} — this is a data-feed failure, not "no trades".</span>
      <Button variant="outline" size="sm" onClick={onRetry} className="ml-auto">
        <RefreshCw className="w-3 h-3 mr-1" /> Retry
      </Button>
    </div>
  );
}

function StatRow({ label, value, valueCls, hint }: { label: string; value: string; valueCls?: string; hint?: string }) {
  // P19-B8.12 (Kyle 2026-07-19): hints existed but were invisible (bare title
  // attribute, no cue) — a small visible info icon now signals hoverability.
  return (
    <div className="flex items-baseline justify-between py-0.5 text-sm" title={hint}>
      <span className="text-muted-foreground inline-flex items-center gap-1">
        {label}
        {hint && <Info className="w-3 h-3 opacity-50 shrink-0" aria-label={hint} />}
      </span>
      <span className={`font-mono font-medium ${valueCls ?? ""}`}>{value}</span>
    </div>
  );
}

function WindowSelector({ value, onChange }: { value: WindowKey; onChange: (k: WindowKey) => void }) {
  return (
    <div className="flex gap-1">
      {WINDOWS.map((w) => (
        <Button key={w.key} size="sm" variant={value === w.key ? "default" : "outline"}
          className="h-6 px-2 text-xs" onClick={() => onChange(w.key)} data-testid={`window-${w.key}`}>
          {w.label}
        </Button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAPER / LIVE dashboard
// ─────────────────────────────────────────────────────────────────────────────
function ActiveModeDashboard({ mode }: { mode: "paper" | "live" }) {
  const [windowKey, setWindowKey] = useState<WindowKey>("24h");
  const [chartDays, setChartDays] = useState<number>(30);

  const analytics = useQuery<any>({
    queryKey: [`/api/active-engine/trades/analytics`, mode, windowKey],
    queryFn: () => apiFetch(`/api/active-engine/trades/analytics?mode=${mode}&range=${windowKey}`),
    refetchInterval: 30000,
  });
  const summary = useQuery<any>({
    queryKey: [`/api/active-engine/portfolio-summary`, mode],
    queryFn: () => apiFetch(`/api/active-engine/portfolio-summary?mode=${mode}`),
    refetchInterval: 15000,
  });
  const curve = useQuery<any>({
    queryKey: [`/api/active-engine/balance-curve`, mode, chartDays],
    queryFn: () => apiFetch(`/api/active-engine/balance-curve?mode=${mode}&days=${chartDays}`),
    refetchInterval: 60000,
  });
  const mirror = useQuery<any>({
    queryKey: [`/api/active-engine/mirror-balance`],
    queryFn: () => apiFetch(`/api/active-engine/mirror-balance`),
    refetchInterval: 120000,
    enabled: mode === "paper",
    retry: false, // fail-hard endpoint; the banner explains, no retry storm
  });

  const a = analytics.data?.analytics;
  const s = summary.data;

  return (
    <div className="space-y-4" data-testid={`dashboard-${mode}`}>
      {/* row 1: the four cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Portfolio Value — BOTH figures labeled (live vs realized basis) */}
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><DollarSign className="w-4 h-4" />Portfolio Value</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {summary.isError ? <ErrorBanner label="portfolio value" onRetry={() => summary.refetch()} /> :
              summary.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
              <>
                <StatRow label="Portfolio Value (live — incl. open positions)" value={usd(s?.portfolioValue)} hint="Realized balance + open positions marked to current prices" />
                <StatRow label="Realized Balance (closed trades)" value={usd(s?.cashBalance)} hint="Starting balance + realized P/L only — the same basis as the chart below" />
                <StatRow label={`Starting Balance (${mode === "paper" ? "Kraken-mirror at session start" : "live record"})`} value={usd(s?.startingBalance)} />
                {mode === "paper" && (
                  mirror.isError
                    ? <StatRow label="Kraken Balance (real, read-only)" value="unavailable" valueCls="text-muted-foreground" hint="Kraken could not be reached — no fallback figure is ever shown" />
                    : <StatRow label="Kraken Balance (real, read-only)" value={usd(mirror.data?.mirrorBalanceUsd)} hint="Your real account's deployable balance — the drift between this and the paper balance is what the auto re-anchor watches" />
                )}
                <StatRow label="Open Trades / Slots" value={`${s?.openTradesCount ?? "—"} / ${s?.maxOpenTrades ?? "—"}`} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Earnings — ROLLING windows (range-independent; P19-B8.11, Kyle 2026-07-19) */}
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" />Earnings <span className="text-[10px] font-normal text-muted-foreground">(rolling, net)</span></CardTitle></CardHeader>
          <CardContent className="pt-0">
            {analytics.isError ? <ErrorBanner label="earnings" onRetry={() => analytics.refetch()} /> :
              analytics.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
              <>
                <StatRow label="Today (24h)" value={usd(a?.earnings?.last24h)} valueCls={signCls(a?.earnings?.last24h)} />
                <StatRow label="Past 7 Days" value={usd(a?.earnings?.last7d)} valueCls={signCls(a?.earnings?.last7d)} />
                <StatRow label="Past 30 Days" value={usd(a?.earnings?.last30d)} valueCls={signCls(a?.earnings?.last30d)} />
                {/* ★ OBJ-4 (Kyle 2026-08-21): the bottom line is the LIFETIME SCOREBOARD, not the
                    selected window. Kyle: "a running scoreboard for since we started trading --
                    here's what you've done." The date is shown because a scoreboard without its
                    start date is not a scoreboard. The percentage is a TIME-WEIGHTED return: three
                    different capital bases exist in the history, so dividing by any single balance
                    is wrong for two of the three eras (measured: -19.49% vs today's balance,
                    -7.14% vs the original, -7.08% time-weighted). Neither figure moves when the
                    balance is re-anchored -- only when trades close. */}
                <StatRow
                  label={`Lifetime Net P/L${a?.lifetime?.epochStartedAt ? ` (since ${new Date(a.lifetime.epochStartedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}`}
                  value={usd(a?.lifetime?.netPnl)}
                  valueCls={signCls(a?.lifetime?.netPnl)}
                />
                <StatRow
                  label="Lifetime return (time-weighted)"
                  value={pct(a?.lifetime?.timeWeightedReturnPct)}
                  valueCls={signCls(a?.lifetime?.timeWeightedReturnPct)}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Trading Activity & Results — window-selected */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Activity className="w-4 h-4" />Activity & Results</span>
              <WindowSelector value={windowKey} onChange={setWindowKey} />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {analytics.isError ? <ErrorBanner label="activity" onRetry={() => analytics.refetch()} /> :
              analytics.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
              <>
                <StatRow label="Trades Closed" value={String(a?.totalOpened ?? "—")} />
                <StatRow label="Win Rate" value={a ? `${pct(a.winRate)} (${a.winCount ?? 0} of ${(a.winCount ?? 0) + (a.lossCount ?? 0)})` : "—"} />
                <StatRow label="Target Hits" value={a ? `${a.closedAtTP?.count ?? 0} (${pct(a.closedAtTP?.percent)})` : "—"} />
                <StatRow label="Stop Hits" value={a ? `${a.closedAtSL?.count ?? 0} (${pct(a.closedAtSL?.percent)})` : "—"} />
                <StatRow label="Maker / Taker entries" value={a?.makerTakerMix ? `${a.makerTakerMix.makerCount} / ${a.makerTakerMix.takerCount} (${pct(a.makerTakerMix.makerShare)} maker)` : "—"} hint="Which entries got the cheaper maker fill; unknowns excluded" />
              </>
            )}
          </CardContent>
        </Card>

        {/* Averages + the Edge strip */}
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" />Averages & Edge
            {/* P19-B8.12: the window these averages span, synced to the Activity selector. */}
            <span className="ml-auto text-[10px] font-normal text-muted-foreground border rounded px-1.5 py-0.5">{WINDOWS.find(w => w.key === windowKey)?.label ?? windowKey}</span>
          </CardTitle></CardHeader>
          <CardContent className="pt-0">
            {analytics.isError ? <ErrorBanner label="averages" onRetry={() => analytics.refetch()} /> :
              analytics.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
              <>
                <StatRow label="Avg Earnings / Trade" value={usd(a && a.totalOpened > 0 ? a.netPnl / a.totalOpened : null)} />
                <StatRow label="Avg Amount Invested" value={usd(a?.avgAmountInvested)} />
                <StatRow label="Avg Hold Time" value={fmtMs(a?.avgHoldingTime)} />
                {/* P19-B8.3 (Langston finding A): null PF with trades = NO losses →
                    "∞ (no losses)" (mirrors the VTS card); null without trades = "—".
                    A numeric 0 is genuine (zero profit against real losses). */}
                <StatRow label="Profit Factor" value={typeof a?.profitFactor === "number" ? a.profitFactor.toFixed(2) : (a?.totalOpened ?? 0) > 0 ? "∞ (no losses)" : "—"} hint="Gross wins ÷ gross losses — above 1.0 means wins outweigh losses; ∞ = no losing trades in the window" />
                <StatRow label="Avg Net R" value={a?.avgNetR?.value === null || a?.avgNetR?.value === undefined ? "—" : `${a.avgNetR.value.toFixed(2)}R (${a.avgNetR.sampleCount} trades${a.avgNetR.excludedCount ? `, ${a.avgNetR.excludedCount} excluded` : ""})`} hint="Net P/L relative to risked amount, after fees" />
                <StatRow label="Fee Drag" value={a?.feeDrag ? `${usd(a.feeDrag.totalFees)}${a.feeDrag.pctOfGross !== null ? ` (${pct(a.feeDrag.pctOfGross)} of gross)` : ""}` : "—"} hint="Total fees paid; share of gross profit consumed (— when gross ≤ 0)" />
                <StatRow label="Max Drawdown (window)" value={a?.maxDrawdownInWindow ? `${usd(a.maxDrawdownInWindow.usd)}${a.maxDrawdownInWindow.pct !== null ? ` (${pct(a.maxDrawdownInWindow.pct)})` : ""}` : "—"} hint="Realized basis (closed trades) against the real starting balance" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* row 2: the realized balance curve */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Realized Balance Over Time <span className="text-[10px] font-normal text-muted-foreground">(closed-trade basis — excludes open-position value)</span></span>
            <div className="flex gap-1">
              {CHART_RANGES.map((r) => {
                const resolved = r.days === -1 ? Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000)) : r.days;
                return (
                  <Button key={r.label} size="sm" variant={chartDays === resolved ? "default" : "outline"} className="h-6 px-2 text-xs"
                    onClick={() => setChartDays(resolved)} data-testid={`chart-range-${r.label}`}>{r.label}</Button>
                );
              })}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {curve.isError ? <ErrorBanner label="balance history" onRetry={() => curve.refetch()} /> :
            curve.isLoading ? <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Loading…</div> :
            (() => {
              // P19-B8.3b (OBJ-4, #416): consume the `startLevel` carrier the
              // endpoint already computes. If the balance existed before the
              // window but nothing closed inside it, seed the carrier as a
              // synthetic left-edge point (at the window start) so the chart
              // draws the flat level line — instead of the old "no history"
              // empty-state that mis-read a quiet window as no data (the
              // hasData:true / points:[] mismatch). Empty-state now shows ONLY
              // when there is genuinely neither a carrier NOR any in-window point.
              const rawPoints = (curve.data?.points ?? []) as any[];
              const startLevel = curve.data?.startLevel ?? null;
              const windowStartMs = Date.now() - (chartDays * 24 * 60 * 60 * 1000);
              const seeded = startLevel
                ? [{ t: new Date(windowStartMs).toISOString(), balance: startLevel.balance, cumPnl: startLevel.cumPnl, kind: "carry" }, ...rawPoints]
                : rawPoints;
              if (!curve.data?.hasData || seeded.length === 0) {
                return (
                  <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                    No realized-balance history in this window yet — the curve begins with the first anchor event or closed trade.
                  </div>
                );
              }
              return (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={seeded.map(p => ({ ...p, ts: new Date(p.t).getTime() }))}>
                      <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => new Date(v).toLocaleDateString()} fontSize={11} />
                      <YAxis dataKey="balance" domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} fontSize={11} width={70} />
                      <Tooltip formatter={(v: any) => usd(Number(v))} labelFormatter={(v: any) => new Date(v).toLocaleString()} />
                      <Line type="stepAfter" dataKey="balance" dot={false} strokeWidth={2} stroke="currentColor" isAnimationActive={false} />
                      {seeded.filter(p => p.kind === "anchor").map(p => (
                        <ReferenceDot key={p.t} x={new Date(p.t).getTime()} y={p.balance} r={4} label={{ value: `anchor v${p.anchorVersion}`, fontSize: 10, position: "top" }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
        </CardContent>
      </Card>

      {/* row 3: breakdowns */}
      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownTable title="By Asset Class" rows={a?.byAssetClass} loading={analytics.isLoading} error={analytics.isError} onRetry={() => analytics.refetch()} />
        <BreakdownTable title="By Strategy" rows={a?.byStrategy && Object.fromEntries(Object.entries(a.byStrategy).map(([k, v]: any) => [k, { count: v.count, wins: Math.round((v.winRate / 100) * v.count), netPnl: v.pnl, winRate: v.winRate }]))} loading={analytics.isLoading} error={analytics.isError} onRetry={() => analytics.refetch()} />
      </div>
    </div>
  );
}

function BreakdownTable({ title, rows, loading, error, onRetry }: {
  title: string;
  rows?: Record<string, { count: number; wins: number; netPnl: number; winRate: number; fees?: number }>;
  loading: boolean; error: boolean; onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {error ? <div className="p-3"><ErrorBanner label={title.toLowerCase()} onRetry={onRetry} /></div> :
          loading ? <div className="p-4 text-sm text-muted-foreground">Loading…</div> :
          !rows || Object.keys(rows).length === 0 ? <div className="p-4 text-sm text-muted-foreground text-center">No closed trades in this window</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-2">Group</th><th className="text-right p-2">Trades</th>
                <th className="text-right p-2">Win Rate</th><th className="text-right p-2">Net P/L</th>
                {Object.values(rows)[0]?.fees !== undefined && <th className="text-right p-2">Fees</th>}
              </tr></thead>
              <tbody>
                {Object.entries(rows).sort((x, y) => y[1].netPnl - x[1].netPnl).map(([k, r]) => (
                  <tr key={k} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">{k}</td>
                    <td className="p-2 text-right">{r.count}</td>
                    <td className="p-2 text-right">{pct(r.winRate)} ({r.wins} of {r.count})</td>
                    <td className={`p-2 text-right font-mono ${signCls(r.netPnl)}`}>{usd(r.netPnl)}</td>
                    {r.fees !== undefined && <td className="p-2 text-right font-mono">{usd(r.fees)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VTS dashboard variant — learning-framed, VIRTUAL-labeled
// ─────────────────────────────────────────────────────────────────────────────
function VtsDashboard() {
  const [days, setDays] = useState<number>(7);
  const q = useQuery<any>({
    queryKey: [`/api/vts/analytics`, days],
    queryFn: () => apiFetch(`/api/vts/analytics?days=${days}`),
    refetchInterval: 60000,
  });
  const d = q.data;
  const perDay: Array<{ day: string; count: number }> = d?.closedPerDay
    ? Object.entries(d.closedPerDay).map(([day, count]) => ({ day, count: count as number })).sort((a, b) => a.day.localeCompare(b.day))
    : [];

  return (
    <div className="space-y-4" data-testid="dashboard-vts">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          All dollar figures are VIRTUAL simulation figures — the VTS trades no capital; its mission is learning breadth.
          Twins, never-filled records, and shadow entries are excluded from every number here{d?.excludedCount ? ` (${d.excludedCount} excluded in this window)` : ""}.
        </span>
        <div className="flex gap-1">
          {[{ l: "Week", v: 7 }, { l: "Month", v: 30 }, { l: "Quarter", v: 90 }].map(w => (
            <Button key={w.v} size="sm" variant={days === w.v ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => setDays(w.v)}>{w.l}</Button>
          ))}
        </div>
      </div>

      {q.isError ? <ErrorBanner label="VTS analytics" onRetry={() => q.refetch()} /> :
        q.isLoading ? <div className="text-sm text-muted-foreground p-4">Loading…</div> : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-base">Learning Throughput</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <StatRow label="Closed Simulations (window)" value={String(d?.sampleCount ?? "—")} />
                <StatRow label="Avg / Day" value={perDay.length > 0 ? (perDay.reduce((s, x) => s + x.count, 0) / perDay.length).toFixed(1) : "—"} />
                <StatRow label="Avg Hold" value={d?.avgHoldMinutes ? fmtMs(d.avgHoldMinutes * 60000) : "—"} />
                <StatRow label="Maker / Taker" value={d?.makerTakerMix ? `${d.makerTakerMix.makerCount} / ${d.makerTakerMix.takerCount} (${pct(d.makerTakerMix.makerShare)} maker)` : "—"} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-base">Outcomes <span className="text-[10px] font-normal text-muted-foreground">(virtual)</span></CardTitle></CardHeader>
              <CardContent className="pt-0">
                <StatRow label="Win Rate" value={d ? `${pct(d.winRate)} (${d.winCount} of ${d.winCount + d.lossCount})` : "—"} />
                <StatRow label="Net P/L (virtual)" value={usd(d?.netPnl)} valueCls={signCls(d?.netPnl)} />
                <StatRow label="Profit Factor" value={d?.profitFactor === null ? "∞ (no losses)" : d?.profitFactor !== undefined ? d.profitFactor.toFixed(2) : "—"} />
                <StatRow label="Fee Drag" value={d?.feeDrag ? `${usd(d.feeDrag.totalFees)}${d.feeDrag.pctOfGross !== null ? ` (${pct(d.feeDrag.pctOfGross)} of gross)` : ""}` : "—"} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-base">Closes Per Day</CardTitle></CardHeader>
              <CardContent>
                {perDay.length === 0 ? <div className="text-sm text-muted-foreground text-center">No closed simulations in window</div> : (
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={perDay}>
                        <XAxis dataKey="day" fontSize={10} /><YAxis fontSize={10} width={30} />
                        <Tooltip /><Line type="monotone" dataKey="count" dot={false} strokeWidth={2} stroke="currentColor" isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownTable title="By Asset Class (virtual)" rows={d?.byAssetClass} loading={false} error={false} onRetry={() => q.refetch()} />
            <BreakdownTable title="By Strategy (virtual)" rows={d?.byStrategy} loading={false} error={false} onRetry={() => q.refetch()} />
          </div>
        </>
      )}
    </div>
  );
}

export function ModeDashboardTab({ mode }: { mode: "paper" | "live" | "vts" }) {
  if (mode === "vts") return <VtsDashboard />;
  return <ActiveModeDashboard mode={mode} />;
}
