/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0i.b (REVISED 2026-05-10 evening per Kyle pushback round 2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mirrors the Filter Diagnostics tab in full for xstock_spot, plus reuses
 * the EXISTING ExitStrategyAblationSection + FactorCalibrationSection from
 * analytics.tsx (the same components shown in the crypto Drift Dashboard) —
 * so xstock_spot gets the SAME rich tables (per-variant exit-reason
 * breakdowns, per-factor tertile buckets, predictive lift, decision-grade
 * status) the crypto dashboard has.
 *
 * Sections on this tab:
 *   1. Scanner Cycle Header — xstock-specific (running, ARCA, cycles, etc.)
 *   2. Per-Pair Fresh-Tick Latency — xstock-specific (RUNNING_ISSUES #89 visibility)
 *   3. FilterDiagnosticsPanel (FULL crypto component reused) — Pipeline
 *      Summary + Last Scan + 24h Rolling + VTS Evaluation Detail by-strategy
 *      + Setup Nulls + Pre-Eval Skips + Post-Signal Rejections + Filter
 *      Metric Ranges, scoped to xstock_spot via /api/xstocks/filter-diagnostics.
 *   4. ExitStrategyAblationSection (FULL crypto component reused) — B73 exit
 *      ablation with per-variant table + exit-reason breakdown + diff vs
 *      baseline + Sharpe-like score, scoped via /api/xstocks/exit-strategy-ablation.
 *   5. FactorCalibrationSection (FULL crypto component reused) — B67 factor
 *      calibration with confidence-shift distribution + tertile WR analysis +
 *      predictive lift, scoped via /api/xstocks/factor-calibration.
 *
 * Crypto regression posture: all xstock data flows through NEW /api/xstocks/*
 * sibling endpoints calling the SHARED aggregator functions with assetClass
 * parameter (default = 'crypto_spot' / null preserves byte-identical
 * pre-B79.0i.b behavior for crypto consumers). No-touch fence on crypto_spot
 * through 2026-05-15 preserved.
 * ════════════════════════════════════════════════════════════════════════════
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// Alert kept for empty-state design; AlertCircle imported above

import { Activity, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { format } from "date-fns";
// P19-B8.1 (C1): panel + type now live in the extracted VTS component (was @/pages/machine-learning).
import { FilterDiagnosticsPanel, ScannerCard, SHARED_DIAG_WIDTH, type FilterDiagnosticsData } from "@/components/vts/vts-filter-diagnostics-panel";
import { FactorCalibrationSection, ExitStrategyAblationSection } from "@/pages/analytics";

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
    cycleBatchSize?: number; // P19-B8.4c: per-cycle scan target (75)
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
}

interface XstocksFreshnessResponse {
  ok: boolean;
  thresholds: { freshUpToSeconds: number; staleUpToSeconds: number };
  symbols: XstockFreshnessRow[];
}

// (B73 + B67.0 ablation panels are imported from analytics.tsx — see XstocksTab below)

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

// ---------------------------------------------------------------------------
// Panel: Scanner Cycle Header (xstock-specific)
// ---------------------------------------------------------------------------

// P19-B8.4c: the xStock LEAN scanner card — the shared ScannerCard, same shape as crypto. The xStock scanner
// always runs when ARCA is open (fixed 30s cadence); when closed it skips cycles, so the next-scan countdown
// is shown only while running + ARCA-open (a stale last-tick+30s would read wrong; the ARCA badge conveys
// "closed"). Fresh/stale tick-quality lives in the FreshnessPanel below, not the lean scanner card (Kyle).
function ScannerCycleHeader({ data, isLoading }: { data: XstocksFilterDiagnostics | undefined; isLoading: boolean }) {
  const s = data?.xstockScanner;
  const isErr = !isLoading && (!data?.ok || !s);
  const running = s?.isRunning ?? false;
  const arcaOpen = s?.lastArcaOpen ?? false;
  const nextScanAtMs = running && arcaOpen && s?.lastTickAt ? s.lastTickAt + 30_000 : null;
  const badges = s ? (
    <>
      <Badge variant={running ? "default" : "destructive"}>{running ? "Running" : "Stopped"}</Badge>
      {/* B-FILTER-DIAG-PAPER W-5 (rule 17): the gate IS the 24/5 window
          (scanner.ts isXstockMarketOpenUTC — "weekend close"); only the LABEL said
          ARCA (legacy name; the wire field lastArcaOpen is a deliberate KEEP —
          renaming a serialized field is a response-shape change, not copy). */}
      <Badge variant={arcaOpen ? "default" : "secondary"}>{arcaOpen ? "Trading Window Open (24/5)" : "Weekend Closure"}</Badge>
      {s.hostileSimActive && <Badge variant="destructive">Hostile Sim</Badge>}
    </>
  ) : undefined;
  return (
    <div className="space-y-2">
      <ScannerCard
        testId="xstocks-scanner-panel"
        title="xStock Scanner"
        subtitle={arcaOpen ? "always running (24/5 window open)" : "paused (weekend closure — Fri close → Sun open)"}
        statusBadges={badges}
        pairsLastScan={s?.pairsScannedLastCycle}
        perCycleTarget={s?.cycleBatchSize ?? null}
        totalUniverse={s?.lastUniverseSize}
        pairsScanned24h={s?.rolling24hApproxPairsScanned}
        cyclesLabel={s ? `${s.rolling24hApproxCycles.toLocaleString()} cycles (24h)` : undefined}
        cadenceLabel="every 30s"
        nextScanAtMs={nextScanAtMs}
        isError={isErr}
        isLoading={isLoading}
      />
      {/* P19-B8.1 (defect d2): lastError is an ACTIVE alarm (cleared server-side on the next healthy cycle);
          the subdued history line keeps flapping errors visible after they clear. Kept below the lean card. */}
      {s?.lastError && (
        <div className="p-3 border border-destructive/50 bg-destructive/5 rounded text-sm">
          <span className="font-semibold text-destructive">Last Error:</span> {s.lastError}
          {(s as any).lastErrorAt && (
            <span className="text-xs text-muted-foreground ml-2">at {new Date((s as any).lastErrorAt).toLocaleString()}</span>
          )}
        </div>
      )}
      {s && !s.lastError && ((s as any).errorCount ?? 0) > 0 && (
        <div className="text-xs text-muted-foreground">
          No active errors. Last error {(s as any).lastErrorAt ? `at ${new Date((s as any).lastErrorAt).toLocaleString()}` : 'time unknown'} · {(s as any).errorCount} total this process.
        </div>
      )}
    </div>
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
          Sorted stalest-first. All xStocks share identical hours: open Sun 8PM ET → Fri 8PM ET, closed Fri 8PM ET → Sun 8PM ET.
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm" data-testid="xstocks-freshness-table">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left p-3">Symbol</th>
                <th className="text-right p-3">Last Tick</th>
                <th className="text-right p-3">Stale (s)</th>
                <th className="text-center p-3">State</th>
              </tr>
            </thead>
            <tbody>
              {data.symbols.map((row) => (
                <tr key={row.symbol} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-mono">{row.symbol}</td>
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
// Top-level XstocksTab — uses imported FactorCalibrationSection +
// ExitStrategyAblationSection from analytics.tsx (B79.0i.b — Kyle directive
// "exit and factor ablation tables" → reuse the rich existing components,
// not the lighter custom ones)
// ---------------------------------------------------------------------------

// P19-B8.3 (OBJ-3c): mode-aware disposition threading — the embedded shared
// panel renders the VTS tail on the VTS page ('tag', default) and the mode's
// REAL tail on Paper/Live ('enforce' + modeTail).
export function XstocksTab({ gateDisposition = 'tag', modeTail = null }: {
  gateDisposition?: 'enforce' | 'tag';
  modeTail?: 'paper' | 'live' | null;
} = {}) {
  const { data: filterData, isLoading: filterLoading } = useQuery<XstocksFilterDiagnostics>({
    queryKey: ['/api/xstocks/filter-diagnostics', { asset_class: 'xstock_spot' }],
    queryFn: () => apiFetch('/api/xstocks/filter-diagnostics'),
    refetchInterval: 15000,
    refetchIntervalInBackground: true, // B8.4c: keep the scanner card's next-scan countdown live off-focus
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
          {/* B-FILTER-DIAG-PAPER W-4: disposition-aware header — the VTS-era framing
              ("VTS Observation · passive learning telemetry") was rendering on the
              ACTIVE Paper/Live tabs. Enforce = active-trading diagnostics; tag keeps
              the VTS framing (its provenance line stays, it is that lane's truth). */}
          <h2 className="text-xl font-semibold">
            {gateDisposition === 'enforce'
              ? `xStocks (xstock_spot) — ${modeTail === 'live' ? 'Live' : 'Paper'} Active-Trading Diagnostics`
              : 'xStocks (xstock_spot) — VTS Observation'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {gateDisposition === 'enforce'
              ? '15-minute bars · 24/5 trading window (weekend closure Fri close → Sun open) · ORB disabled (intraday-bar strategy)'
              : 'Phase 24 closed 2026-05-10 · VTS + passive learning telemetry · 60-minute bar parity with crypto (B-NEW-34, 2026-05-15) · 4-hour pre-warm staged pending B-NEW-35 source dedup · ORB disabled (intraday-bar strategy)'}
          </p>
        </div>
      </div>

      {/* B79.0m.b — banner removed per Kyle directive 2026-05-11.
          xstock VTS pipeline IS now wired through eval-cycle.ts. Diagnostic
          panels below show real per-cycle + 24h-rolling numbers from the
          xstock filter + IMF + strategy-eval flow. Note: parallel pattern
          path + per-family fan-out routing are PENDING in the follow-up
          batch — without them, pattern strategies receive null patternInput
          and quant strategies are not family-routed. The diagnostic panels
          will show this honestly until those land. */}

      {/* 1. Scanner Cycle Header (xstock-specific). P19-B8.4c REV-3 (OBJ-7): bound to the SAME shared width as
          the pipeline tables inside the panel, so the xStock scanner card no longer spans full-bleed — it
          lines up with the tables, consistent with the crypto tabs. */}
      <div className={SHARED_DIAG_WIDTH}>
        <ScannerCycleHeader data={filterData} isLoading={filterLoading} />
      </div>

      {/* Per-Pair Fresh-Tick Latency panel REMOVED per Kyle directive 2026-05-12.
          The freshnessData query is still issued for the scanner-cycle header
          tooltip; if removing the query is desired in a future cleanup, drop
          the useQuery call + freshnessData/freshnessLoading variables too. */}

      {/* 2. Filter Diagnostics — REUSED from crypto, scoped to xstock_spot. P19-B8.4c REV-3 (OBJ-7): bound the
          section to the shared width so the xStock pipeline tables match the crypto tabs' width. */}
      <Card data-testid="xstocks-filter-diagnostics-section" className={SHARED_DIAG_WIDTH}>
        <CardHeader>
          <CardTitle className="text-lg">Filter Pipeline Diagnostics (xstock_spot)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Mirrors the crypto Filter Diagnostics tab, scoped to xstock_spot. Pipeline Summary, Last Scan Filter Breakdown
            (with per-family Trend / Reversal / Breakout / Oscillator / Strong-Trend rows + the parallel Pattern Path), 24h
            Rolling Aggregates, VTS Evaluation Detail (by-strategy), Setup Nulls, Pre-Eval Skips, Post-Signal Rejections,
            and Filter Metric Ranges. <strong>xstock pipeline is at functional crypto parity as of B79.0m.b2 (2026-05-11)</strong>
            — parallel pattern-global + pattern-IMF gate runs alongside the 5 family lanes; a pair passing N families plus
            pattern produces N+1 evaluation entries (lane fan-out). xStocks trade a continuous 24/5 window (Sunday open → Friday
            close); during the weekend closure and US market holidays the scanner short-circuits at the market-hours gate
            and all counters read 0 — that is expected behavior. Off-peak hours trade thinner (sparser marks), but they
            are open trading hours, not downtime.
          </p>
        </CardHeader>
        <CardContent>
          <FilterDiagnosticsPanel data={filterData} isLoading={filterLoading} gateDisposition={gateDisposition} modeTail={modeTail} assetClass="xstock_spot" />
        </CardContent>
      </Card>

      {/* 4+5. Exit Strategy Ablation (B73) + Factor Calibration (B67) — VTS-ONLY.
          P19-B8.4 OBJ-4: these are VTS Phase-25 CALIBRATION studies (exit-variant ablation +
          factor predictive-lift over the VTS learning corpus), NOT active-path scanner/pipeline
          diagnostics. They render ONLY on the VTS page ('tag'); on Paper/Live ('enforce') the tab
          shows the active path, not VTS's learning. HIDDEN, not deleted — the components + their
          /api/xstocks/exit-strategy-ablation + /api/xstocks/factor-calibration endpoints are
          PRESERVED intact for Phase-25 (rule-18 "left intentionally / VTS-scoped"; delete only if
          Phase-25 proves them unneeded). Kyle directive 2026-07-07. */}
      {gateDisposition === 'tag' && (
        <>
          <div data-testid="xstocks-exit-ablation-section">
            <ExitStrategyAblationSection endpointBase="/api/xstocks/exit-strategy-ablation" assetClass="xstock_spot" />
          </div>
          <div data-testid="xstocks-factor-calibration-section">
            <FactorCalibrationSection endpointBase="/api/xstocks/factor-calibration" assetClass="xstock_spot" />
          </div>
        </>
      )}
    </div>
  );
}

export default XstocksTab;
