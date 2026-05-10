/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0i.a — xStocks observation tab
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Single tab inside the Machine Learning page. Sibling to "Filter Diagnostics"
 * + "DBS Pair Tracking". Shadow-mode observability surface for xstock_spot —
 * NO live-trading visualization here (that's Phase 19+). Panels stack
 * vertically on this one tab.
 *
 * Panels in B79.0i.a:
 *  - A: Scanner Cycle Metrics (header strip + body + 24h aggregate)
 *  - E: Per-pair Fresh-Tick Latency (sorted stalest-first)
 *
 * Panels in B79.0i.b (deferred, Tue/Wed):
 *  - B: B73 Exit Strategy Ablation (asset_class-scoped via ?asset_class= param)
 *  - C: B67.0 Factor Calibration Ablation (with mandatory caveat banner)
 *  - D: Strategy Fire-Rate by Regime
 *
 * Per pre-audit Finding #1: xstockSpotScanner does NOT track IMF/family/SQE/
 * trade per-stage funnel counters (line 260 TODO confirms Day 1 = observability-
 * only). Panel A is scanner-cycle metrics ONLY. Full funnel deferred to a
 * future B79.x batch when the scanner is wired through orchestration.
 *
 * Cache key isolation (Finding #9 / Langston O1): when this tab calls a
 * shared endpoint with ?asset_class=, the param MUST be part of the
 * useQuery `queryKey` so the response doesn't collide with the existing
 * crypto Drift Dashboard caller.
 * ════════════════════════════════════════════════════════════════════════════
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Activity, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Types — match server schemas xstocks-filter-diagnostics/v1.0 + xstocks-freshness/v1.0
// ---------------------------------------------------------------------------

interface XstocksFilterDiagnostics {
  ok: boolean;
  timestamp: string;
  schema: string;
  scanner: {
    isRunning: boolean;
    isScanning: boolean;
    lastTickAt: number | null;
    lastCycleDurationMs: number | null;
    cyclesCompleted: number;
    cyclesSkippedMarketClosed: number;
    pairsScannedLastCycle: number;
    pairsFreshLastCycle: number;
    pairsStaleLastCycle: number;
    lastError: string | null;
    hostileSimActive: boolean;
    lastUniverseSize: number;
    lastArcaOpen: boolean;
  };
  rolling24h: {
    approxCycles: number;
    approxPairsScanned: number;
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
  timestamp: string;
  schema: string;
  thresholds: {
    freshUpToSeconds: number;
    staleUpToSeconds: number;
  };
  symbols: XstockFreshnessRow[];
}

// ---------------------------------------------------------------------------
// Reusable: empty-state + caveat banner (co-located per Langston Q3/Q4)
// ---------------------------------------------------------------------------

interface EmptyPanelStateProps {
  message: string;
  secondary?: string;
}
function EmptyPanelState({ message, secondary }: EmptyPanelStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
      data-testid="xstocks-empty-state"
    >
      <AlertCircle className="w-8 h-8 mb-3 opacity-50" />
      <p className="text-sm font-medium">{message}</p>
      {secondary && <p className="text-xs mt-1 opacity-75">{secondary}</p>}
    </div>
  );
}

/**
 * B79.0i.a ships this banner shell with no rendered output (n undefined),
 * since Panel C (its consumer) lands in B79.0i.b. Renders a visually
 * unmissable amber/yellow alert in .b once `n` is bound.
 *
 * Per Langston Finding #11: must render NOTHING when no data is bound.
 */
interface CalibrationCaveatBannerProps {
  n?: number;
}
export function CalibrationCaveatBanner({ n }: CalibrationCaveatBannerProps) {
  if (n === undefined) return null;
  return (
    <Alert
      className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950 dark:border-amber-700"
      data-testid="xstocks-calibration-caveat-banner"
    >
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
// Panel A — Scanner Cycle Metrics
// ---------------------------------------------------------------------------

function ScannerCyclePanel({ data, isLoading }: { data: XstocksFilterDiagnostics | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card data-testid="xstocks-scanner-panel">
        <CardHeader><CardTitle className="text-lg">Scanner Cycle Metrics</CardTitle></CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.ok || !data.scanner) {
    return (
      <Card data-testid="xstocks-scanner-panel">
        <CardHeader><CardTitle className="text-lg">Scanner Cycle Metrics</CardTitle></CardHeader>
        <CardContent>
          <EmptyPanelState message="Failed to load scanner diagnostics." secondary="Check server logs." />
        </CardContent>
      </Card>
    );
  }

  const s = data.scanner;
  const r = data.rolling24h;

  // Cold-scanner empty state per Finding #10 (Langston O4)
  if (s.cyclesCompleted === 0) {
    return (
      <Card data-testid="xstocks-scanner-panel">
        <CardHeader><CardTitle className="text-lg">Scanner Cycle Metrics</CardTitle></CardHeader>
        <CardContent>
          <EmptyPanelState
            message="Scanner has not completed first cycle yet — refresh in ~30s"
            secondary={`Running=${s.isRunning ? 'yes' : 'no'} · Universe=${s.lastUniverseSize}`}
          />
        </CardContent>
      </Card>
    );
  }

  const lastCycleAt = s.lastTickAt ? new Date(s.lastTickAt) : null;

  return (
    <Card data-testid="xstocks-scanner-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Scanner Cycle Metrics
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={s.isRunning ? "default" : "destructive"}>{s.isRunning ? "Running" : "Stopped"}</Badge>
            <Badge variant={s.lastArcaOpen ? "default" : "secondary"}>{s.lastArcaOpen ? "ARCA Open" : "ARCA Closed"}</Badge>
            {s.hostileSimActive && <Badge variant="destructive">Hostile Sim Active</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Header strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-muted/30 rounded-md">
          <Stat label="Cycles Completed" value={s.cyclesCompleted.toLocaleString()} />
          <Stat label="Last Cycle At" value={lastCycleAt ? format(lastCycleAt, "HH:mm:ss") : "—"} />
          <Stat label="Last Universe" value={s.lastUniverseSize.toString()} sub={s.lastArcaOpen ? "ARCA open" : "24/7 only"} />
          <Stat label="Last Cycle Duration" value={s.lastCycleDurationMs !== null ? `${s.lastCycleDurationMs} ms` : "—"} />
        </div>

        {/* Body — per-cycle counts */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Stat label="Pairs Scanned (last cycle)" value={s.pairsScannedLastCycle.toString()} />
          <Stat label="Fresh (last cycle)" value={s.pairsFreshLastCycle.toString()} />
          <Stat label="Stale (last cycle)" value={s.pairsStaleLastCycle.toString()} />
        </div>

        {/* 24h aggregate */}
        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-2">Rolling 24h (approximate, derived from xstock_spot_ticker_snap)</div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Cycles (~)" value={r.approxCycles.toLocaleString()} />
            <Stat label="Pairs Scanned (~)" value={r.approxPairsScanned.toLocaleString()} />
          </div>
        </div>

        {s.lastError && (
          <div className="mt-4 p-3 border border-destructive/50 bg-destructive/5 rounded text-sm">
            <span className="font-semibold text-destructive">Last Error:</span> {s.lastError}
          </div>
        )}

        {s.cyclesSkippedMarketClosed > 0 && (
          <div className="mt-3 text-xs text-muted-foreground">
            ARCA-closed full-universe skips: {s.cyclesSkippedMarketClosed.toLocaleString()} (24/7 names continue scanning)
          </div>
        )}
      </CardContent>
    </Card>
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

// ---------------------------------------------------------------------------
// Panel E — Per-pair Fresh-Tick Latency
// ---------------------------------------------------------------------------

function FreshnessPanel({ data, isLoading }: { data: XstocksFreshnessResponse | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <Card data-testid="xstocks-freshness-panel">
        <CardHeader><CardTitle className="text-lg">Per-Pair Fresh-Tick Latency</CardTitle></CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.ok) {
    return (
      <Card data-testid="xstocks-freshness-panel">
        <CardHeader><CardTitle className="text-lg">Per-Pair Fresh-Tick Latency</CardTitle></CardHeader>
        <CardContent>
          <EmptyPanelState message="Failed to load freshness data." secondary="Check server logs." />
        </CardContent>
      </Card>
    );
  }

  if (!data.symbols || data.symbols.length === 0) {
    return (
      <Card data-testid="xstocks-freshness-panel">
        <CardHeader><CardTitle className="text-lg">Per-Pair Fresh-Tick Latency</CardTitle></CardHeader>
        <CardContent>
          <EmptyPanelState message="No xstock_spot symbols configured." />
        </CardContent>
      </Card>
    );
  }

  const dead = data.symbols.filter((s) => s.state === 'dead').length;
  const stale = data.symbols.filter((s) => s.state === 'stale').length;
  const fresh = data.symbols.filter((s) => s.state === 'fresh').length;

  return (
    <Card data-testid="xstocks-freshness-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Per-Pair Fresh-Tick Latency
          </CardTitle>
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="default" className="bg-green-600 hover:bg-green-600">Fresh: {fresh}</Badge>
            <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-500 text-white">Stale: {stale}</Badge>
            <Badge variant="destructive">Dead: {dead}</Badge>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Fresh ≤ {data.thresholds.freshUpToSeconds}s · Stale ≤ {data.thresholds.staleUpToSeconds}s · Dead beyond.
          Sorted stalest-first. <span className="font-semibold">24/7</span> = Kraken Phase-1 names trade through weekend.
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="xstocks-freshness-table">
            <thead>
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
                  <td className="p-3">
                    {row.is24_7 ? (
                      <Badge variant="outline" className="text-xs">24/7</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">ARCA</span>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono text-xs">
                    {row.lastTickAt ? format(new Date(row.lastTickAt), "MM-dd HH:mm:ss") : "—"}
                  </td>
                  <td className="p-3 text-right font-mono">
                    {row.staleSeconds !== null ? row.staleSeconds.toLocaleString() : "—"}
                  </td>
                  <td className="p-3 text-center">
                    <FreshnessBadge state={row.state} />
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

function FreshnessBadge({ state }: { state: 'fresh' | 'stale' | 'dead' }) {
  if (state === 'fresh') return <Badge className="bg-green-600 hover:bg-green-600">Fresh</Badge>;
  if (state === 'stale') return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Stale</Badge>;
  return (
    <Badge variant="destructive" className="gap-1">
      <WifiOff className="w-3 h-3" />
      Dead
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Top-level XstocksTab
// ---------------------------------------------------------------------------

export function XstocksTab() {
  // Cache-key isolation: include 'xstocks' namespace + the asset_class scope
  // so future B79.0i.b queries against shared endpoints don't collide with
  // the crypto Drift Dashboard's queryKeys (Finding #9 / Langston O1).
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

  return (
    <div className="space-y-4" data-testid="xstocks-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">xStocks (xstock_spot) — Shadow-mode Observability</h2>
          <p className="text-sm text-muted-foreground">
            Phase 24 closed 2026-05-10 · Live-trading enablement is Phase 19 territory · Panels expand in B79.0i.b
          </p>
        </div>
      </div>

      <ScannerCyclePanel data={filterData} isLoading={filterLoading} />

      <FreshnessPanel data={freshnessData} isLoading={freshnessLoading} />

      {/* Banner shell ships in .a but renders nothing until n is bound in .b — Finding #11 */}
      <CalibrationCaveatBanner />
    </div>
  );
}

export default XstocksTab;
