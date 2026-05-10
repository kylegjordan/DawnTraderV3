/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0i.a (REVISED 2026-05-10 per Kyle pushback)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mirrors the Filter Diagnostics tab in full for xstock_spot, plus adds B73
 * Exit Strategy Ablation + B67.0 Factor Calibration Ablation panels. Single
 * tab inside Machine Learning page. Reuses crypto's `FilterDiagnosticsPanel`
 * by importing it (data shape preserved); xstock-scoped data flows through
 * `/api/xstocks/filter-diagnostics`.
 *
 * Panels (all on this one tab):
 *   1. Scanner Cycle Header Strip — xstock-specific (running, ARCA, cycles, etc.)
 *   2. Per-Pair Fresh-Tick Latency — xstock-specific (RUNNING_ISSUES #89 visibility)
 *   3. FilterDiagnosticsPanel (FULL) — Pipeline Summary + Last Scan + 24h Rolling
 *      + VTS Evaluation Detail by-strategy + Setup Nulls + Pre-Eval Skips
 *      + Post-Signal Rejections + Filter Metric Ranges. Mirrors crypto exactly,
 *      scoped to xstock_spot via /api/xstocks/filter-diagnostics endpoint.
 *   4. B73 Exit Strategy Ablation Panel
 *   5. B67.0 Factor Calibration Ablation Panel (with mandatory caveat banner)
 *
 * Crypto regression posture: all xstock data flows through NEW /api/xstocks/*
 * sibling endpoints. No modifications to /api/vts/* or /api/analytics/*.
 * No-touch fence on crypto_spot through 2026-05-15 preserved by-construction.
 * ════════════════════════════════════════════════════════════════════════════
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, Wifi, WifiOff, AlertCircle, BarChart3, LineChart as LineChartIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
import { FilterDiagnosticsPanel, type FilterDiagnosticsData } from "@/pages/machine-learning";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface XstocksFilterDiagnostics extends FilterDiagnosticsData {
  xstockScanner: {
    isRunning: boolean;
    isScanning: boolean;
    lastTickAt: number | null;
    lastCycleDurationMs: number | null;
    cyclesCompleted: number;
    cyclesSkippedMarketClosed: number;
    lastUniverseSize: number;
    lastArcaOpen: boolean;
    pairsScannedLastCycle: number;
    pairsFreshLastCycle: number;
    pairsStaleLastCycle: number;
    lastError: string | null;
    hostileSimActive: boolean;
    rolling24hApproxCycles: number;
    rolling24hApproxPairsScanned: number;
  };
}

interface XstockFreshnessRow {
  symbol: string;
  lastTickAt: string | null;
  staleSeconds: number | null;
  state: 'fresh' | 'stale' | 'dead';
  is24_7: boolean;
}

interface XstocksFreshnessResponse {
  ok: boolean;
  thresholds: { freshUpToSeconds: number; staleUpToSeconds: number };
  symbols: XstockFreshnessRow[];
}

interface ExitAblationVariant {
  variantId: string;
  variantName: string;
  n: number;
  avgPnL: number;
  avgBaseline: number;
  wins: number;
  losses: number;
  winRate: number;
}
interface ExitAblationResponse {
  ok: boolean;
  window: string;
  variants: ExitAblationVariant[];
}

interface CalibrationFactor {
  factor: string;
  n: number;
  avgConfidenceShift: number;
}
interface CalibrationResponse {
  ok: boolean;
  window: string;
  decisionGradeThreshold: number;
  totalN: number;
  factors: CalibrationFactor[];
}

// ---------------------------------------------------------------------------
// Reusable atoms
// ---------------------------------------------------------------------------

function EmptyPanelState({ message, secondary }: { message: string; secondary?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground" data-testid="xstocks-empty-state">
      <AlertCircle className="w-8 h-8 mb-3 opacity-50" />
      <p className="text-sm font-medium">{message}</p>
      {secondary && <p className="text-xs mt-1 opacity-75">{secondary}</p>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function CalibrationCaveatBanner({ n }: { n: number }) {
  return (
    <Alert className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950 dark:border-amber-700" data-testid="xstocks-calibration-caveat-banner">
      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-900 dark:text-amber-200">
        Current n={n}. Decision-grade requires n≥150 per regime × factor-tertile bucket.
      </AlertTitle>
      <AlertDescription className="text-amber-800 dark:text-amber-300">
        Given xstock_spot's ~50% lower signal volume vs crypto_spot and TFS-regime concentration,
        expected timeline 3–6 months. Treat as system-health telemetry, not signal.
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Panel: Scanner Cycle Header (xstock-specific)
// ---------------------------------------------------------------------------

function ScannerCycleHeader({ data, isLoading }: { data: XstocksFilterDiagnostics | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card data-testid="xstocks-scanner-panel"><CardHeader><CardTitle className="text-lg">Scanner Cycle Metrics</CardTitle></CardHeader>
        <CardContent><div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div></CardContent>
      </Card>
    );
  }
  if (!data?.ok || !data.xstockScanner) {
    return (
      <Card data-testid="xstocks-scanner-panel"><CardHeader><CardTitle className="text-lg">Scanner Cycle Metrics</CardTitle></CardHeader>
        <CardContent><EmptyPanelState message="Failed to load scanner diagnostics." secondary="Check server logs." /></CardContent>
      </Card>
    );
  }
  const s = data.xstockScanner;
  if (s.cyclesCompleted === 0) {
    return (
      <Card data-testid="xstocks-scanner-panel"><CardHeader><CardTitle className="text-lg">Scanner Cycle Metrics</CardTitle></CardHeader>
        <CardContent><EmptyPanelState message="Scanner has not completed first cycle yet — refresh in ~30s" secondary={`Running=${s.isRunning ? 'yes' : 'no'} · Universe=${s.lastUniverseSize}`} /></CardContent>
      </Card>
    );
  }
  const lastCycleAt = s.lastTickAt ? new Date(s.lastTickAt) : null;
  return (
    <Card data-testid="xstocks-scanner-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2"><Activity className="w-5 h-5" />Scanner Cycle Metrics</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={s.isRunning ? "default" : "destructive"}>{s.isRunning ? "Running" : "Stopped"}</Badge>
            <Badge variant={s.lastArcaOpen ? "default" : "secondary"}>{s.lastArcaOpen ? "ARCA Open" : "ARCA Closed"}</Badge>
            {s.hostileSimActive && <Badge variant="destructive">Hostile Sim Active</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-muted/30 rounded-md">
          <Stat label="Cycles Completed" value={s.cyclesCompleted.toLocaleString()} />
          <Stat label="Last Cycle At" value={lastCycleAt ? format(lastCycleAt, "HH:mm:ss") : "—"} />
          <Stat label="Last Universe" value={s.lastUniverseSize.toString()} sub={s.lastArcaOpen ? "ARCA open" : "24/7 only"} />
          <Stat label="Last Cycle Duration" value={s.lastCycleDurationMs !== null ? `${s.lastCycleDurationMs} ms` : "—"} />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Stat label="Pairs Scanned (last cycle)" value={s.pairsScannedLastCycle.toString()} />
          <Stat label="Fresh (last cycle)" value={s.pairsFreshLastCycle.toString()} />
          <Stat label="Stale (last cycle)" value={s.pairsStaleLastCycle.toString()} />
        </div>
        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-2">Rolling 24h (approximate, derived from xstock_spot_ticker_snap)</div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Cycles (~)" value={s.rolling24hApproxCycles.toLocaleString()} />
            <Stat label="Pairs Scanned (~)" value={s.rolling24hApproxPairsScanned.toLocaleString()} />
          </div>
        </div>
        {s.lastError && (
          <div className="mt-4 p-3 border border-destructive/50 bg-destructive/5 rounded text-sm">
            <span className="font-semibold text-destructive">Last Error:</span> {s.lastError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panel: Per-Pair Fresh-Tick Latency (xstock-specific)
// ---------------------------------------------------------------------------

function FreshnessPanel({ data, isLoading }: { data: XstocksFreshnessResponse | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (<Card data-testid="xstocks-freshness-panel"><CardHeader><CardTitle className="text-lg">Per-Pair Fresh-Tick Latency</CardTitle></CardHeader><CardContent><div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div></CardContent></Card>);
  }
  if (!data?.ok) {
    return (<Card data-testid="xstocks-freshness-panel"><CardHeader><CardTitle className="text-lg">Per-Pair Fresh-Tick Latency</CardTitle></CardHeader><CardContent><EmptyPanelState message="Failed to load freshness data." /></CardContent></Card>);
  }
  if (!data.symbols?.length) {
    return (<Card data-testid="xstocks-freshness-panel"><CardHeader><CardTitle className="text-lg">Per-Pair Fresh-Tick Latency</CardTitle></CardHeader><CardContent><EmptyPanelState message="No xstock_spot symbols configured." /></CardContent></Card>);
  }
  const dead = data.symbols.filter((s) => s.state === 'dead').length;
  const stale = data.symbols.filter((s) => s.state === 'stale').length;
  const fresh = data.symbols.filter((s) => s.state === 'fresh').length;
  return (
    <Card data-testid="xstocks-freshness-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2"><Wifi className="w-5 h-5" />Per-Pair Fresh-Tick Latency</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge className="bg-green-600 hover:bg-green-600">Fresh: {fresh}</Badge>
            <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Stale: {stale}</Badge>
            <Badge variant="destructive">Dead: {dead}</Badge>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Fresh ≤ {data.thresholds.freshUpToSeconds}s · Stale ≤ {data.thresholds.staleUpToSeconds}s · Dead beyond.
          Sorted stalest-first. <span className="font-semibold">24/7</span> = Kraken Phase-1 names trade through weekend.
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm" data-testid="xstocks-freshness-table">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left p-3">Symbol</th>
                <th className="text-left p-3">Class</th>
                <th className="text-right p-3">Last Tick</th>
                <th className="text-right p-3">Stale (s)</th>
                <th className="text-center p-3">State</th>
              </tr>
            </thead>
            <tbody>
              {data.symbols.map((row) => (
                <tr key={row.symbol} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-mono">{row.symbol}</td>
                  <td className="p-3">{row.is24_7 ? <Badge variant="outline" className="text-xs">24/7</Badge> : <span className="text-xs text-muted-foreground">ARCA</span>}</td>
                  <td className="p-3 text-right font-mono text-xs">{row.lastTickAt ? format(new Date(row.lastTickAt), "MM-dd HH:mm:ss") : "—"}</td>
                  <td className="p-3 text-right font-mono">{row.staleSeconds !== null ? row.staleSeconds.toLocaleString() : "—"}</td>
                  <td className="p-3 text-center">
                    {row.state === 'fresh' && <Badge className="bg-green-600 hover:bg-green-600">Fresh</Badge>}
                    {row.state === 'stale' && <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Stale</Badge>}
                    {row.state === 'dead' && <Badge variant="destructive" className="gap-1"><WifiOff className="w-3 h-3" />Dead</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panel: B73 Exit Strategy Ablation
// ---------------------------------------------------------------------------

function ExitAblationPanel({ data, isLoading }: { data: ExitAblationResponse | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (<Card data-testid="xstocks-exit-ablation-panel"><CardHeader><CardTitle className="text-lg">B73 Exit Strategy Ablation</CardTitle></CardHeader><CardContent><div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div></CardContent></Card>);
  }
  if (!data?.ok) {
    return (<Card data-testid="xstocks-exit-ablation-panel"><CardHeader><CardTitle className="text-lg">B73 Exit Strategy Ablation</CardTitle></CardHeader><CardContent><EmptyPanelState message="Failed to load exit ablation data." /></CardContent></Card>);
  }
  const totalN = data.variants.reduce((a, b) => a + b.n, 0);
  if (totalN === 0) {
    return (
      <Card data-testid="xstocks-exit-ablation-panel">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5" />B73 Exit Strategy Ablation</CardTitle></CardHeader>
        <CardContent>
          <EmptyPanelState message="No closed xstock_spot trades yet — populates after first ORB fire closes." secondary="Waiting on Monday 2026-05-11 14:30 UTC ARCA open + first breakout." />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card data-testid="xstocks-exit-ablation-panel">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5" />B73 Exit Strategy Ablation</CardTitle>
        <div className="text-xs text-muted-foreground mt-1">
          12 exit variants per closed xstock_spot trade. Window: {data.window}. Total samples: {totalN}.
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="xstocks-exit-ablation-table">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left p-3">Variant</th>
                <th className="text-right p-3">n</th>
                <th className="text-right p-3">Avg P/L %</th>
                <th className="text-right p-3">Avg Baseline %</th>
                <th className="text-right p-3">Diff vs Baseline</th>
                <th className="text-right p-3">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.variants.map((v) => {
                const diff = v.avgPnL - v.avgBaseline;
                return (
                  <tr key={v.variantId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">{v.variantName}</td>
                    <td className="p-3 text-right font-mono">{v.n}</td>
                    <td className={`p-3 text-right font-mono ${v.avgPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>{v.avgPnL.toFixed(2)}%</td>
                    <td className={`p-3 text-right font-mono ${v.avgBaseline >= 0 ? 'text-green-600' : 'text-red-600'}`}>{v.avgBaseline.toFixed(2)}%</td>
                    <td className={`p-3 text-right font-mono ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)}%</td>
                    <td className="p-3 text-right font-mono">{(v.winRate * 100).toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Panel: B67.0 Factor Calibration Ablation
// ---------------------------------------------------------------------------

function CalibrationAblationPanel({ data, isLoading }: { data: CalibrationResponse | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (<Card data-testid="xstocks-calibration-panel"><CardHeader><CardTitle className="text-lg">B67.0 Factor Calibration Ablation</CardTitle></CardHeader><CardContent><div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div></CardContent></Card>);
  }
  const totalN = data?.totalN ?? 0;
  return (
    <Card data-testid="xstocks-calibration-panel">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><LineChartIcon className="w-5 h-5" />B67.0 Factor Calibration Ablation</CardTitle>
      </CardHeader>
      <CardContent>
        <CalibrationCaveatBanner n={totalN} />
        {!data?.ok ? <EmptyPanelState message="Failed to load calibration data." /> :
         data.factors.length === 0 ? <EmptyPanelState message="No factor alternates captured for xstock_spot yet." secondary={`Window: ${data.window}. Populates as ORB + future strategy fires accumulate.`} /> :
         (<div className="overflow-x-auto">
           <table className="w-full text-sm" data-testid="xstocks-calibration-table">
             <thead>
               <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                 <th className="text-left p-3">Factor</th>
                 <th className="text-right p-3">n</th>
                 <th className="text-right p-3">Avg Confidence Shift</th>
                 <th className="text-right p-3">Decision-Grade Progress</th>
               </tr>
             </thead>
             <tbody>
               {data.factors.map((f) => (
                 <tr key={f.factor} className="border-b last:border-0 hover:bg-muted/30">
                   <td className="p-3 font-medium">{f.factor}</td>
                   <td className="p-3 text-right font-mono">{f.n}</td>
                   <td className="p-3 text-right font-mono">{f.avgConfidenceShift >= 0 ? '+' : ''}{f.avgConfidenceShift.toFixed(4)}</td>
                   <td className="p-3 text-right font-mono">{Math.min(100, (f.n / data.decisionGradeThreshold) * 100).toFixed(0)}%</td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>)}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Top-level XstocksTab
// ---------------------------------------------------------------------------

export function XstocksTab() {
  const { data: filterData, isLoading: filterLoading } = useQuery<XstocksFilterDiagnostics>({
    queryKey: ['/api/xstocks/filter-diagnostics', { asset_class: 'xstock_spot' }],
    queryFn: () => apiFetch('/api/xstocks/filter-diagnostics'),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: freshnessData, isLoading: freshnessLoading } = useQuery<XstocksFreshnessResponse>({
    queryKey: ['/api/xstocks/freshness', { asset_class: 'xstock_spot' }],
    queryFn: () => apiFetch('/api/xstocks/freshness'),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: exitData, isLoading: exitLoading } = useQuery<ExitAblationResponse>({
    queryKey: ['/api/xstocks/exit-strategy-ablation', { asset_class: 'xstock_spot', window: 'rolling_7d' }],
    queryFn: () => apiFetch('/api/xstocks/exit-strategy-ablation?window=rolling_7d'),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: calibData, isLoading: calibLoading } = useQuery<CalibrationResponse>({
    queryKey: ['/api/xstocks/factor-calibration', { asset_class: 'xstock_spot', window: 'rolling_7d' }],
    queryFn: () => apiFetch('/api/xstocks/factor-calibration?window=rolling_7d'),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  return (
    <div className="space-y-4" data-testid="xstocks-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">xStocks (xstock_spot) — Shadow-mode Observability</h2>
          <p className="text-sm text-muted-foreground">
            Phase 24 closed 2026-05-10 · Live-trading enablement is Phase 19 territory · Monday 2026-05-11 14:30 UTC = ORB strategy goes hot
          </p>
        </div>
      </div>

      {/* 1. Scanner Cycle Header (xstock-specific) */}
      <ScannerCycleHeader data={filterData} isLoading={filterLoading} />

      {/* 2. Per-Pair Freshness (xstock-specific) */}
      <FreshnessPanel data={freshnessData} isLoading={freshnessLoading} />

      {/* 3. Filter Diagnostics — REUSED from crypto, scoped to xstock_spot */}
      <Card data-testid="xstocks-filter-diagnostics-section">
        <CardHeader>
          <CardTitle className="text-lg">Filter Pipeline Diagnostics (xstock_spot)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Mirrors the crypto Filter Diagnostics tab, scoped to xstock_spot. Pipeline Summary, Last Scan Filter Breakdown,
            24h Rolling Aggregates, VTS Evaluation Detail (by-strategy), Setup Nulls, Pre-Eval Skips, Post-Signal Rejections,
            and Filter Metric Ranges. Funnel-stage rejection counters are zero until xstockSpotScanner is wired through
            signal-orchestration in a future B79.x batch — strategy-level + null-reason aggregates are real (from
            <code className="px-1">signal_eval_archive</code>).
          </p>
        </CardHeader>
        <CardContent>
          <FilterDiagnosticsPanel data={filterData} isLoading={filterLoading} />
        </CardContent>
      </Card>

      {/* 4. B73 Exit Strategy Ablation */}
      <ExitAblationPanel data={exitData} isLoading={exitLoading} />

      {/* 5. B67.0 Factor Calibration Ablation */}
      <CalibrationAblationPanel data={calibData} isLoading={calibLoading} />
    </div>
  );
}

export default XstocksTab;
