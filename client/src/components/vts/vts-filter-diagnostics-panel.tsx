// P19-B8.1 (C1): FilterDiagnosticsPanel extracted verbatim from client/src/pages/machine-learning.tsx
// (pure extraction, zero behavior change).
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { FilterDiagnosticsData } from "./vts-shared";
import { gateAggregateColumns, type GateDisposition } from "./gate-columns";
import { ActiveSqeAndRtbSections } from './fd-sqe-rtb-sections';

/**
 * P19-B8.4 (OBJ-1/2) — the mode's OWN scanner stage, fed by the mode-keyed
 * active-engine diagnostics (`/api/active-engine/diagnostics/scan?mode=` +
 * `/scan-24h?mode=`), NOT the VTS feed. The on-demand scan runs a fresh scan with
 * THIS mode's paper/live thresholds and has no `isEngineActive` guard (verified
 * B8.4 MUST-1 — live numbers with active trading OFF), so universe / global-filter /
 * eligible are this mode's REAL current scan. The 24h rolling reads DORMANT until
 * paper-active runs its own scan cycles (dormant != zero — MUST-2). A failed load
 * renders an ERROR, never a silent blank (OBJ-8).
 */
const SCAN_FILTER_LABELS: Record<string, string> = {
  failed_min_volume: 'Min volume',
  failed_spread: 'Max spread',
  failed_daily_range: 'Daily range',
  failed_min_price: 'Min price',
  failed_stablecoin: 'Stablecoin',
  failed_quote_currency: 'Quote currency',
  failed_history: 'Min history',
  failed_market_cap: 'Market cap',
  failed_guardrail_risk: 'Guardrail risk',
  failed_correlation: 'Correlation guard',
  already_active: 'Already active',
};

// ── P19-B8.4c — the SHARED lean scanner card (scan-activity only) ────────────────────────────────────
// Kyle 2026-07-08: every one of the six Filter-Diagnostics tabs shows the SAME lean scanner card at top —
// pairs scanned (last scan + 24h), scanner capacity (the universe max, so a short scan is obvious), a live
// next-scan countdown, and the cadence. Everything about eligible / survived / filtered leaves the scanner
// and lives in the (dormant on Paper/Live, live on VTS) pipeline sections. Both scanners always run in every
// mode, so this card is LIVE on all six tabs.

const _fmtNum = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : n.toLocaleString());

/** Ticks `Date.now()` once a second while `active`, so a countdown re-renders live. */
function useSecondTick(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Next-scan countdown display, CLAMPED (Langston Step-4 cond-2): a late/skipped tick makes
 *  (target − now) go negative — show "scanning…" at/below 0, never a negative or wild timer.
 *  Matches the server `nextScanInMs` floor. */
export function ScannerCard({
  title, subtitle, statusBadges, pairsLastScan, perCycleTarget, totalUniverse, totalUniverseNote,
  pairsScanned24h, pairsScanned24hNote, cyclesLabel, cadenceLabel, nextScanAtMs, isError, isLoading, onRetry, testId,
}: {
  title: string;
  subtitle?: string;
  statusBadges?: React.ReactNode;
  pairsLastScan: number | null | undefined;
  // P19-B8.4c REV-3 (Kyle 2026-07-08): the old single "Scanner Capacity" was mislabeled (it showed the
  // universe). Split into two honest fields: the per-cycle scan TARGET (crypto 300 / xStock 75 — a config
  // constant surfaced read-only) and the live TOTAL UNIVERSE (crypto Kraken ~1,500 / xStock ~481).
  perCycleTarget: number | null | undefined; // per-cycle scan target (300 / 75)
  totalUniverse: number | null | undefined;  // live total universe; null → render `totalUniverseNote`
  totalUniverseNote?: string;
  pairsScanned24h: number | null | undefined;
  pairsScanned24hNote?: string;            // when the 24h count is null, render this dormant note (never a bare 0)
  cyclesLabel?: string;                    // e.g. "1,266 cycles (24h)"
  cadenceLabel?: string;                   // e.g. "every 30s"
  nextScanAtMs: number | null | undefined; // absolute target timestamp; null → hide the countdown
  isError?: boolean;
  isLoading?: boolean;
  onRetry?: () => void;
  testId?: string;
}) {
  const now = useSecondTick(nextScanAtMs !== null && nextScanAtMs !== undefined);
  const remainingMs = nextScanAtMs === null || nextScanAtMs === undefined ? null : nextScanAtMs - now;
  const countdown = remainingMs === null ? null : (remainingMs > 0 ? `${Math.ceil(remainingMs / 1000)}s` : 'scanning…');
  return (
    <Card data-testid={testId ?? 'scanner-card'}>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between gap-2">
          <span>{title}</span>
          <span className="flex items-center gap-2">
            {statusBadges}
            {subtitle && <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span>Couldn't load the scanner — a data-feed failure, not zeros.</span>
            {onRetry && (
              <Button variant="outline" size="sm" className="ml-auto" onClick={onRetry}>
                <RefreshCw className="w-3 h-3 mr-1" /> Retry
              </Button>
            )}
          </div>
        ) : isLoading ? (
          <div className="text-sm text-muted-foreground">Loading the scanner…</div>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
            <div><span className="text-muted-foreground block text-xs">Pairs Scanned (last scan)</span><span className="font-mono font-semibold" data-testid="scanner-pairs-last">{_fmtNum(pairsLastScan)}</span></div>
            <div>
              <span className="text-muted-foreground block text-xs" title="the number of pairs the scanner targets each scan cycle">Per-Cycle Target</span>
              {perCycleTarget === null || perCycleTarget === undefined || perCycleTarget <= 0
                ? <span className="font-mono text-muted-foreground">—</span>
                : <span className="font-mono font-semibold" data-testid="scanner-per-cycle-target">{_fmtNum(perCycleTarget)}</span>}
            </div>
            <div>
              <span className="text-muted-foreground block text-xs" title="the full tradable universe the scanner rotates through (live)">Total Universe</span>
              {totalUniverse === null || totalUniverse === undefined || totalUniverse <= 0
                ? <span className="font-mono text-muted-foreground" title={totalUniverseNote}>{totalUniverseNote ?? '—'}</span>
                : <span className="font-mono font-semibold" data-testid="scanner-total-universe">{_fmtNum(totalUniverse)}</span>}
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">Pairs Scanned (24h)</span>
              {(pairsScanned24h === null || pairsScanned24h === undefined) && pairsScanned24hNote
                ? <span className="font-mono text-amber-600 dark:text-amber-500" data-testid="scanner-pairs-24h" title="awaiting activation">{pairsScanned24hNote}</span>
                : <span className="font-mono font-semibold" data-testid="scanner-pairs-24h">{_fmtNum(pairsScanned24h)}</span>}
            </div>
            <div><span className="text-muted-foreground block text-xs">Next Scan In</span><span className="font-mono font-semibold" data-testid="scanner-next-scan">{countdown ?? '—'}</span></div>
            <div><span className="text-muted-foreground block text-xs">Cadence</span><span className="font-mono font-semibold">{cadenceLabel ?? '—'}</span>{cyclesLabel && <span className="text-muted-foreground block text-xs">{cyclesLabel}</span>}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── P19-B8.4c REV-3 — shared width + themed table wrapper (OBJ-7 / OBJ-9 / OBJ-10) ───────────────────────
// OBJ-7: every Filter-Diagnostics tab (all six) mounts inside this ONE max-width so the scanner card and the
// three pipeline tables share a single consistent width, bounded by the scanner card's rightmost column
// ("Next Scan In"). Crypto used max-w-4xl; xStock ran full-bleed — now both use SHARED_DIAG_WIDTH.
export const SHARED_DIAG_WIDTH = 'max-w-5xl';

// OBJ-9: each of the three pipeline tables gets a DISTINCT border color, with the header bar filled that same
// color and a bigger/bolder title. OBJ-10: the table body scrolls horizontally inside its OWN bounded
// container (the page never scrolls sideways) and the first column is frozen (sticky) on the pipeline tables.
export const DIAG_TABLE_THEMES = {
  summary:  { border: 'border-blue-500/70',   head: 'bg-blue-500/15' },
  lastScan: { border: 'border-purple-500/70', head: 'bg-purple-500/15' },
  rolling:  { border: 'border-teal-500/70',   head: 'bg-teal-500/15' },
} as const;
type DiagTableTheme = keyof typeof DIAG_TABLE_THEMES;

/** OBJ-10 frozen-first-column class: sticky the stage/filter label so it stays visible while the numbers
 *  scroll on a narrow (mobile) viewport. A solid bg occludes the cells scrolling underneath it. */
export const STICKY_FIRST_COL = 'sticky left-0 z-10 bg-background';

/** OBJ-10 — table-level frozen first column via Tailwind arbitrary variants: freezes every first cell (header
 *  + body) in ONE class, so a wide live table's stage/filter label stays put while the numbers scroll. Applied
 *  to the `<table>` element; a solid bg occludes scrolled content underneath the frozen column. */
export const FROZEN_FIRST_COL_TABLE =
  '[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-muted ' +
  '[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-background';

/** P19-B8.4c REV-3 — the shared themed table shell: colored border + filled/bolded header bar (OBJ-9) and an
 *  own horizontal-scroll container (OBJ-10). `children` is the raw <table>. */
export function DiagTableCard({ theme, title, subtitle, children, testId }: {
  theme: DiagTableTheme;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  const t = DIAG_TABLE_THEMES[theme];
  return (
    <Card className={`border-2 ${t.border} overflow-hidden`} data-testid={testId}>
      <CardHeader className={`py-3 ${t.head} border-b-2 ${t.border}`}>
        <CardTitle className="text-xl font-bold flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span>{title}</span>
          {subtitle && <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">{children}</div>
      </CardContent>
    </Card>
  );
}

type FunnelClassCounts = {
  status: 'active' | 'dormant';
  signalsGenerated: number;
  sqeEvaluated: number;
  sqePassed: number;
  preSqeRejects: Record<string, number>;
  postSqeRejects: Record<string, number>;
  sqeGateRejects: Record<string, number>;
  /** OBJ-3 refresh-phase slice — OPTIONAL: a pre-OBJ-3 server omits it and the section
   *  simply does not render (never an empty table implying "nothing fell out"). */
  sqeGateRejectsAtRefresh?: Record<string, number>;
  sqeAttempts?: { atGeneration: number; atRefresh: number };
  rtbRefresh?: { cyclesRun: number; refreshedAttempted: number; reconfirmed: number; rejectedInRefresh: number; promoted: number; droppedError?: number };
};

// P19-B8.4c: the crypto Paper/Live LEAN scanner card. ★ B8.4c Step-4 fix (Langston MUST-2): the crypto FX5
// scanner is ONE shared scanner (mode-multiplexed) that always runs, so its live scan THROUGHPUT (last-scan +
// 24h pairs) is the shared scanner's — identical on all crypto tabs — read from the vts-diagnostics `data` prop
// (`lastScan.totalPairsScanned` / `rolling24h.totalPairsScanned`, un-gated + live). The mode-keyed `/scan-latest`
// is used ONLY for capacity (`krakenUniverseSize`) + the live countdown (`nextScanInMs`) + cadence — NOT for the
// count, because its `evaluatedCount` is TRADING-gated to 0 (off until B8.5), which was the Step-4 bare-0 bug.
// Eligible/filtered are dormant on Paper/Live (`DormantFilterBreakdown` below) — filters aren't applied here.
function ActiveScannerStage({ mode, data, isLoading }: { mode: 'paper' | 'live'; data?: FilterDiagnosticsData; isLoading?: boolean }) {
  const latest = useQuery<any>({
    queryKey: ['/api/active-engine/diagnostics/scan-latest', mode],
    queryFn: () => apiFetch(`/api/active-engine/diagnostics/scan-latest?mode=${mode}`),
    refetchInterval: 15000,
    refetchIntervalInBackground: true, // keep the live next-scan countdown re-syncing even off-focus (the old
                                       // Filter-Insights pattern — else the countdown target drifts to "scanning…")
  });
  const l = latest.data?.data ?? null;         // /scan-latest is wrapped { ok, data }
  const ls = (data as any)?.lastScan ?? null;
  const r24 = (data as any)?.rolling24h ?? null;
  const modeLabel = mode === 'paper' ? 'Paper' : 'Live';
  // Absolute next-scan target = the scan-latest fetch time + the server-computed remaining; the card ticks it
  // down and clamps at 0 → "scanning…" (Langston cond-2). Re-syncs each 15s refetch.
  const nextScanAtMs = l && typeof l.nextScanInMs === 'number'
    ? (latest.dataUpdatedAt || Date.now()) + l.nextScanInMs : null;
  const cadenceLabel = l?.cycleFrequencyMs ? `every ${Math.round(l.cycleFrequencyMs / 1000)}s` : undefined;
  // P19-B8.4c REV-3: Per-Cycle Target (300) + live Total Universe both now ride the shared vts `data.lastScan`
  // feed (scanTargetPerCycle + krakenUniverseSize surfaced read-only, same source as the count) — consistent
  // with the VTS tab, so all three crypto tabs read one place. scan-latest is now ONLY countdown + cadence.
  const perCycleTarget = typeof ls?.scanTargetPerCycle === 'number' ? ls.scanTargetPerCycle
    : (typeof l?.scanTargetPerCycle === 'number' ? l.scanTargetPerCycle : null);
  const totalUniverse = typeof ls?.krakenUniverseSize === 'number' ? ls.krakenUniverseSize
    : (typeof l?.krakenUniverseSize === 'number' ? l.krakenUniverseSize : null);
  return (
    <ScannerCard
      testId="active-scanner-stage"
      title={`${modeLabel} Scanner`}
      subtitle="the shared FX5 scan — always running"
      pairsLastScan={ls?.totalPairsScanned}
      perCycleTarget={perCycleTarget}
      totalUniverse={totalUniverse}
      pairsScanned24h={r24?.totalPairsScanned}
      cyclesLabel={r24 && typeof r24.totalScans === 'number' ? `${r24.totalScans.toLocaleString()} cycles (24h)` : undefined}
      cadenceLabel={cadenceLabel}
      nextScanAtMs={nextScanAtMs}
      isError={false}
      isLoading={isLoading ?? false}
    />
  );
}

// Batch 19H: Filter Pipeline Diagnostics Panel
// B79.0i.a: exported so xstocks-tab can re-render same panel with xstock-scoped data
// P19-B8.3 (OBJ-3c/OBJ-7): the panel is now MODE-AWARE via gateDisposition —
//   'tag' (default = the VTS page, zero change for un-threaded callers): the
//     funnel is the VTS funnel; the gate's quality reasons are TAGGED (they
//     still simulate — the un-strangle), so the gate shows Dropped vs Tagged.
//   'enforce' (Paper/Live, w/ modeTail set): a shared-scanner banner renders,
//     the VTS-flavored tail sections are REPLACED by the mode's REAL tail
//     (pool population, RTB queue, gate tallies, real opens — /pipeline-tail),
//     and the gate shows a true Rejected total (= Evals − Passed; exhaustive +
//     mutually exclusive per applyGlobalGuards — Langston-verified).
export type { FilterDiagnosticsData };
// P19-B8.3: the disposition type + aggregate-column contract live in the pure,
// unit-tested gate-columns module (re-exported here for existing importers).
export type { GateDisposition };
export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag', modeTail = null, assetClass = 'crypto_spot' }: {
  data: FilterDiagnosticsData | undefined;
  isLoading: boolean;
  gateDisposition?: GateDisposition;
  modeTail?: 'paper' | 'live' | null;
  // P19-B8.4: which asset class this panel scopes. The active-engine on-demand scan
  // (ActiveScannerStage) is CRYPTO-ONLY (`performUniverseScan` = Kraken crypto universe,
  // no xStock equivalent). On the xStock tab the scanner stage is xstocks-tab's OWN
  // ScannerCycleHeader (rendered above this panel), so we do NOT render the crypto
  // ActiveScannerStage there — it would show crypto's universe on the xStock tab.
  assetClass?: 'crypto_spot' | 'xstock_spot';
}) {
  // P19-B8.4 (OBJ-1/2/3): on Paper/Live ('enforce') the tab shows the mode's OWN
  // active-path funnel, NOT the VTS feed. The scanner stage renders the mode-keyed
  // active-engine scan (its own paper/live thresholds — live even with active trading
  // OFF); everything downstream of the scanner (family IMF, signal generation, the SQE
  // gates, RTB refresh) is WIRED but DORMANT until paper-active turns on (B8.5),
  // rendered as an explicit "awaiting activation" state — NEVER 0 (dormant != zero,
  // MUST-2). This EARLY-RETURN is fully independent of the VTS `data`/`isLoading` props
  // (ActiveScannerStage self-fetches the active-engine scan-latest endpoint), and
  // it SUPERSEDES the interim inline `gateDisposition === 'enforce'` conditionals in the
  // VTS ('tag') render path below (B8.3b) — those are now unreachable on Paper/Live and
  // get swept when Part 2 wires the funnel counters into the dormant block here.
  // ⛔ THE EARLY RETURN IS GONE (B-FILTER-DIAG-STANDARDIZE, Kyle 2026-08-07).
  //
  // WHAT WAS HERE: an `enforce && modeTail` early-return that rendered a SEPARATE, much smaller
  // Paper/Live view and never reached the shared tables below. B8.4c introduced it deliberately and
  // correctly — the active path was DORMANT then, so falling through would have shown VTS-runner
  // numbers under a Paper heading. Its own comment said the conditionals below "get swept when Part 2
  // wires the funnel counters." Part 2 (the B8.5 switch-on) happened 2026-07-14. The sweep did not.
  //
  // WHY IT HAD TO GO: Kyle's requirement is that all six tabs show THE SAME tracked metrics, organised
  // the same way — "the data may be feeding in from different tables and different scanners, and that's
  // okay… I still wanna see the same tracked metrics." An early return that skips the shared structure
  // cannot satisfy that, so keeping it was not an option (rule 24 outcome 3: legacy that no longer fits).
  //
  // WHAT REPLACES IT: both dispositions now fall through to ONE render path. Per-lane differences are
  // expressed as DATA (the `FilterDiagnosticsLane` contract) and as the two genuinely-different
  // sections, NOT as a different page:
  //   • Scan-stage tables are IDENTICAL on all six tabs — the crypto scanner and the xStock scanner are
  //     each ONE scanner shared across VTS/paper/live (Kyle), so these need no per-mode sourcing.
  //   • ⚠️ NET-EV IS DELIBERATELY IN A DIFFERENT SECTION PER PATH, and that is not a standardisation
  //     violation: the VTS has NO SQE and rejects on net-EV inside its own evaluation loop
  //     (`vts-runner.ts:4917`), so VTS keeps it under Post-Signal Rejections; the active path rejects
  //     INSIDE the SQE, so Paper/Live show it in the SQE section. Same metric, same label, real
  //     difference in where the pipeline actually applies it.
  //   • SQE + RTB sections exist ONLY on Paper/Live — the one structural difference Kyle specified.
  const isEnforce = gateDisposition === 'enforce' && !!modeTail;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No diagnostics data available. Waiting for first FX5 scan cycle...
      </div>
    );
  }

  const { lastScan, rolling24h } = data;

  const formatFilterName = (key: string): string => {
    const names: Record<string, string> = {
      failed_min_volume: 'Min Volume',
      // B.2.UI (2026-06-02): order-book depth gate (xStock min_depth_usd two-way)
      failed_min_depth: 'Min Depth',
      failed_spread: 'Max Spread',
      failed_daily_range: 'Daily Range',
      failed_min_price: 'Min Price',
      failed_max_price: 'Max Price',
      failed_stablecoin: 'Stablecoin',
      failed_quote_currency: 'Quote Currency',
      failed_history: 'Min History',
      failed_market_cap: 'Market Cap',
      failed_guardrail_risk: 'Guardrail Risk',
      failed_correlation: 'Correlation',
      already_active: 'Already Active',
      passed_all_filters: 'Passed All',
      // reorg-B2.2 OBJ-B: the GuardDropReason enum values (no raw enum key leaks to the UI).
      // P19-B8.3 (OBJ-7, Kyle 2026-07-06): plain-language names — the old
      // "Reward-vs-Risk" header read as a TOTAL when it was one reason.
      rr_below_min: 'RR Too Low',
      unreachable: 'Target Unreachable',
      stop_distance: 'Bad Stop',
      invalid_atr: 'No ATR Data',
    };
    return names[key] || key;
  };

  const getRejectionColor = (count: number, total: number): string => {
    if (total === 0) return '';
    const pct = count / total;
    if (pct > 0.5) return 'text-red-500 font-semibold';
    if (pct > 0.2) return 'text-orange-500';
    if (pct > 0) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Batch 19I: Format numbers with comma separators
  const fmt = (n: number | undefined | null): string => {
    if (n === undefined || n === null) return '—';
    return n.toLocaleString();
  };

  return (
    <div className={`space-y-4 ${SHARED_DIAG_WIDTH}`} data-testid={isEnforce ? 'fd-enforce-panel' : 'fd-tag-panel'}>
      {/* B-FILTER-DIAG-STANDARDIZE: the population header (Langston R2 — LOAD-BEARING, not cosmetic).
          `getLastScanDiagnostics()` takes NO mode argument: it holds the last scan of WHATEVER MODE RAN.
          With paper active, the LIVE tab's scan-stage tables therefore show PAPER's scan. Saying so is what
          keeps six identical-looking tabs from being a lookalike — the same labels will sit over populations
          orders of magnitude apart. The SCANNER ITSELF is shared across VTS/paper/live (Kyle), so identical
          scan numbers across tabs are CORRECT, not a bug. */}
      {isEnforce && (
        <div className="rounded-md border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-xs text-muted-foreground" data-testid="fd-population-header">
          <strong>{modeTail === 'paper' ? 'Paper' : 'Live'} mode.</strong> The scan-stage tables below come from the
          {assetClass === 'xstock_spot' ? ' xStock' : ' crypto'} scanner, which is <strong>one shared scanner across VTS, paper and live</strong> —
          so those figures are identical on every tab by design.{' '}
          {lastScan?.mode ? <>Last scan was run by <strong>{String(lastScan.mode)}</strong> mode.</> : null}{' '}
          Downstream sections below are this mode's own active pipeline.
        </div>
      )}
      {/* P19-B8.4c REV-3: the crypto VTS lean scanner card at the top (crypto's scanner card lives in this
          panel; xStock's is xstocks-tab's ScannerCycleHeader above the panel — so this is crypto-only here).
          Scan counts + the Per-Cycle Target (300) + live Total Universe (krakenUniverseSize ~1,500) all come
          from the vts-diagnostics `lastScan` feed — the universe is now surfaced there (RUNNING_ISSUES #421
          RESOLVED, homed in B8.4c), replacing the old "not in VTS feed yet" note. Next-scan from the fixed 30s
          FX5 cadence + last-scan time, clamped in the card. */}
      {assetClass === 'crypto_spot' && (
        <ScannerCard
          testId="vts-crypto-scanner"
          title="Crypto Scanner (VTS)"
          subtitle="the shared FX5 scan — always running"
          pairsLastScan={lastScan?.totalPairsScanned}
          perCycleTarget={typeof lastScan?.scanTargetPerCycle === 'number' ? lastScan.scanTargetPerCycle : null}
          totalUniverse={typeof lastScan?.krakenUniverseSize === 'number' ? lastScan.krakenUniverseSize : null}
          totalUniverseNote="awaiting first scan"
          pairsScanned24h={rolling24h?.totalPairsScanned}
          cyclesLabel={rolling24h ? `${rolling24h.totalScans.toLocaleString()} cycles (24h)` : undefined}
          cadenceLabel="every 30s"
          nextScanAtMs={lastScan?.timestamp ? new Date(lastScan.timestamp).getTime() + 30_000 : null}
        />
      )}
      {/* P19-B8.3 (OBJ-3c): the shared-scanner banner on Paper/Live — the scan-feed
          numbers below are the ONE scanner's diagnostics; per-mode thresholds and
          funnels differ (Kyle's authoritative model). The mode's OWN pipeline tail
          renders at the bottom; per-stage active-path funnel counters = B8.3b. */}
      {gateDisposition === 'enforce' && (
        <div className="rounded-md border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-xs text-muted-foreground" data-testid="shared-scanner-banner">
          One scanner feeds all modes — the scan-stage numbers below are the shared feed's diagnostics.
          {modeTail ? ` ${modeTail === 'paper' ? 'Paper' : 'Live'} mode filters with its OWN thresholds; its real pipeline tail (pool, queue, gate, opens) is at the bottom of this tab.` : ''}
          {' '}Per-stage active-path funnel counters arrive in B8.3b.
        </div>
      )}
      {/* Batch 42: Pipeline Summary Table — 24h aggregated. P19-B8.4c REV-3: summary theme (blue border +
          filled header, OBJ-9) + own horizontal-scroll container with frozen first column (OBJ-10). */}
      <Card className="border-2 border-blue-500/70 overflow-hidden">
        <CardHeader className="py-3 bg-blue-500/15 border-b-2 border-blue-500/70">
          <CardTitle className="text-xl font-bold">Pipeline Summary (24h)
            {rolling24h && <span className="text-xs font-normal text-muted-foreground ml-2">{fmt(rolling24h.totalScans)} scans · {fmt(rolling24h.totalPairsScanned)} pair evaluations · {fmt(rolling24h.uniquePairsScanned)} unique</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {rolling24h && rolling24h.totalScans > 0 ? (() => {
            const r24 = rolling24h.aggregated;
            const quantGlobalPassed = (r24.quant.global as Record<string, number>)['passed_all_filters'] ?? 0;
            const patternGlobalPassed = r24.pattern.global
              ? ((r24.pattern.global as Record<string, number>)['passed_all_filters'] ?? 0)
              : null;
            const pct = (n: number, d: number) => d > 0 ? ` (${Math.round(n / d * 100)}%)` : '';
            const universe = rolling24h.totalPairsScanned;
            const familySurvivorsTotal = r24.familyPaths
              ? ['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].reduce((sum, f) => sum + (r24.familyPaths?.[f]?.survivors ?? 0), 0)
              : 0;
            const ve = data?.vtsEvaluation;
            return (
              <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Stage</th>
                    <th className="text-right p-2 font-medium">Quant</th>
                    <th className="text-right p-2 font-medium">Pattern</th>
                    <th className="text-right p-2 font-medium">Total</th>
                    <th className="text-left p-2 font-medium text-muted-foreground text-xs">Counting Basis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Universe Scanned</td>
                    <td className="p-2 text-right">{fmt(universe)}</td>
                    <td className="p-2 text-right">{fmt(universe)}</td>
                    <td className="p-2 text-right text-muted-foreground">—</td>
                    <td className="p-2 text-xs text-muted-foreground">Same universe enters both paths</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Global Filters Passed</td>
                    <td className="p-2 text-right text-blue-500">
                      {fmt(quantGlobalPassed)}<span className="text-xs text-muted-foreground">{pct(quantGlobalPassed, universe)}</span>
                    </td>
                    <td className="p-2 text-right text-blue-500">
                      {patternGlobalPassed !== null
                        ? <>{fmt(patternGlobalPassed)}<span className="text-xs text-muted-foreground">{pct(patternGlobalPassed, universe)}</span></>
                        : '—'}
                    </td>
                    <td className="p-2 text-right text-blue-500">
                      {fmt(quantGlobalPassed + (patternGlobalPassed ?? 0))}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">vs. Universe (not deduped — pair can be in both)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Family IMF Passed <span className="text-[10px] text-muted-foreground">(family-qualified entries)</span></td>
                    <td className="p-2 text-right text-orange-500">
                      {fmt(r24.quant.imf.passed)}<span className="text-xs text-muted-foreground">{pct(r24.quant.imf.passed, quantGlobalPassed * 4)}</span>
                    </td>
                    <td className="p-2 text-right text-orange-500">
                      {r24.pattern.imf
                        ? <>{fmt(r24.pattern.imf.passed)}<span className="text-xs text-muted-foreground">{pct(r24.pattern.imf.passed, patternGlobalPassed ?? 0)}</span></>
                        : '—'}
                    </td>
                    <td className="p-2 text-right text-orange-500">
                      {fmt(r24.quant.imf.passed + (r24.pattern.imf?.passed ?? 0))}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">Quant: sum across 4 families (fan-out). Pattern: passed pattern IMF.</td>
                  </tr>
                  {r24.familyPaths && (
                    <tr className="border-b hover:bg-muted/30">
                      <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Per-Family Breakdown</td>
                      <td className="p-2 text-right text-xs text-orange-400">
                        {['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].map(f =>
                          `${f[0].toUpperCase()}:${fmt(r24.familyPaths?.[f]?.survivors ?? 0)}`
                        ).join(' ')}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">—</td>
                      <td className="p-2 text-right text-muted-foreground">—</td>
                      <td className="p-2 text-xs text-muted-foreground">Each pair counted once per family it passes</td>
                    </tr>
                  )}
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 pl-6 text-xs text-muted-foreground">↳ LQ / VN / DI rejections <span className="text-[10px] italic">(aggregate across families)</span></td>
                    <td className="p-2 text-right text-xs text-muted-foreground">
                      {fmt(r24.quant.imf.failedLQ)} / {fmt(r24.quant.imf.failedVN)} / {fmt(r24.quant.imf.failedDI ?? 0)}
                    </td>
                    <td className="p-2 text-right text-xs text-muted-foreground">
                      {r24.pattern.imf
                        ? `${fmt(r24.pattern.imf.failedLQ)} / ${fmt(r24.pattern.imf.failedVN)} / ${fmt(r24.pattern.imf.failedDI)}`
                        : '—'}
                    </td>
                    <td className="p-2 text-right text-xs text-muted-foreground">—</td>
                    <td className="p-2 text-xs text-muted-foreground">Sum of 4 family rejection counts</td>
                  </tr>
                  {/* Batch 48: Family-Qualified Unique — the true unique pair count after family IMF.
                      P19-B8.2 (#410): SINGLE-path read — both endpoints now emit
                      rolling24h.totalFamilyQualifiedUnique at the top level (crypto v1.7 /
                      xstock v2.2); the B8.1 dual-shape shim is retired. */}
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Family-Qualified (Unique Pairs)</td>
                    <td className="p-2 text-right text-teal-600">
                      {fmt((rolling24h as any).totalFamilyQualifiedUnique ?? 0)}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">—</td>
                    <td className="p-2 text-right text-teal-600">
                      {fmt((rolling24h as any).totalFamilyQualifiedUnique ?? 0)}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">Unique pairs passing ≥1 family IMF (before fan-out expansion)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">Family Fan-Out (IMF Survivors)</td>
                    <td className="p-2 text-right text-orange-500">{fmt(r24.quant.survivors)}</td>
                    <td className="p-2 text-right text-orange-500">{fmt(r24.pattern.survivors)}</td>
                    <td className="p-2 text-right text-orange-500">{fmt(r24.quant.survivors + r24.pattern.survivors)}</td>
                    <td className="p-2 text-xs text-muted-foreground">1 pair × N families = N entries (expansion for per-family evaluation)</td>
                  </tr>
                  {/* Batch 52: Pipeline flow — survivors → benchmarks removed → VTS destination */}
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Benchmarks Removed</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(r24.quant.imf.benchmarkBypassed ?? 0)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(r24.pattern.imf?.benchmarkBypassed ?? 0)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt((r24.quant.imf.benchmarkBypassed ?? 0) + (r24.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-xs text-muted-foreground">Benchmark pairs excluded before VTS (cumulative 24h)</td>
                  </tr>
                  <tr className="bg-green-500/10 font-semibold border-t-2 border-green-500/30">
                    <td className="p-2">{gateDisposition === 'enforce' ? '→ Survivors' : '→ VTS Destination'} <span className="text-[10px] text-muted-foreground">(post-benchmark{gateDisposition === 'enforce' ? '; shared scan feed' : ''})</span></td>
                    <td className="p-2 text-right text-green-700">{fmt(r24.quant.survivors - (r24.quant.imf.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-right text-green-700">{fmt(r24.pattern.survivors - (r24.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-right text-green-700 font-bold">{fmt((r24.quant.survivors - (r24.quant.imf.benchmarkBypassed ?? 0)) + (r24.pattern.survivors - (r24.pattern.imf?.benchmarkBypassed ?? 0)))}</td>
                    <td className="p-2 text-xs text-muted-foreground">Survivors minus benchmarks (cumulative 24h)</td>
                  </tr>
                  {/* P19-B8.3 (OBJ-3c): the VTS-side evaluation metrics render ONLY on
                      the VTS page ('tag') — on Paper/Live they implied mode activity
                      that is actually the VTS's (Kyle's 2026-07-06 catch). */}
                  {/* B-FILTER-DIAG-STANDARDIZE: on the active path these come from the funnel tracker,
                      not the VTS runner — the section says which rows this path records rather than vanishing. */}
                  {isEnforce && (
                    <tr className="bg-muted/50 border-y">
                      <td colSpan={5} className="p-1 text-[10px] text-muted-foreground">
                        <strong>Evaluation metrics</strong> — this path records pipeline stage counts (see the SQE
                        and RTB sections below); the per-strategy null/skip breakdown is not emitted here yet (#662).
                      </td>
                    </tr>
                  )}
                  {gateDisposition === 'tag' && ve && (
                    <>
                      <tr className="bg-muted/50 border-y">
                        <td colSpan={5} className="p-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">VTS Evaluation Metrics <span className="font-normal">(VTS-side counters — pairs processed after cooldown/skip filters)</span></td>
                      </tr>
                      {/* B-NEW-19 (Kyle directive 2026-05-13): re-ordered pipeline math so it
                          flows subtractively. Order is now:
                            Pair-Pool Evaluations (= VTS Destination = IMF Survivors, lane fan-out)
                              ↓ × strategies-in-regime-pool (asset-class-enabled)
                            Possible Strategy Iterations  (= Pre-Eval Skips + Strategy Evaluations)
                              − Pre-Eval Skips            (family-mismatch / duplicate / max-open /
                                                          regime-no-strats — strategy iterations
                                                          that didn't run detect())
                              = Strategy Evaluations
                                  − Strategy Nulls
                                  = Signals Generated
                          Pre-Eval Skips render WITHOUT leading minus signs per Kyle 2026-05-13. */}
                      <tr className="border-b hover:bg-muted/30 bg-blue-500/5">
                        <td className="p-2 font-medium">Pair-Pool Evaluations</td>
                        <td className="p-2 text-right">{fmt((ve as any).quantPairPoolEvaluations ?? 0)}</td>
                        <td className="p-2 text-right">{fmt((ve as any).patternPairPoolEvaluations ?? 0)}</td>
                        <td className="p-2 text-right font-semibold">{fmt(((ve as any).quantPairPoolEvaluations ?? 0) + ((ve as any).patternPairPoolEvaluations ?? 0))}</td>
                        <td className="p-2 text-xs text-muted-foreground">Same as VTS Destination — lane fan-out count (a pair passing N families produces N entries here). 24h cumulative.</td>
                      </tr>
                      {(() => {
                        const nr2 = (ve.nullReasons ?? {}) as any;
                        const qDetail = ((ve as any).quantNullReasonDetail ?? {}) as Record<string, number>;
                        const pDetail = ((ve as any).patternNullReasonDetail ?? {}) as Record<string, number>;
                        const noPriceSkip = (ve as any).pairsSkippedNoPrice ?? 0;
                        const ohlcSkip = (ve as any).pairsSkippedInsufficientOHLC ?? 0;
                        const familyMismatch = nr2.familyFilterMismatch ?? 0;
                        const dupPos = nr2.duplicatePosition ?? 0;
                        const maxOpen = nr2.maxOpenTrades ?? 0;
                        const regimeNoStrat = nr2.regimeNoStrategies ?? 0;
                        const qFamily = qDetail['family_filter_mismatch'] ?? 0;
                        const pFamily = pDetail['family_filter_mismatch'] ?? 0;
                        const qDup = qDetail['duplicate_position'] ?? 0;
                        const pDup = pDetail['duplicate_position'] ?? 0;
                        const qMaxOpen = qDetail['max_open_trades'] ?? 0;
                        const pMaxOpen = pDetail['max_open_trades'] ?? 0;
                        const qNoRegime = qDetail['regime_no_strategies'] ?? 0;
                        const pNoRegime = pDetail['regime_no_strategies'] ?? 0;
                        const quantSkips = qFamily + qDup + qMaxOpen + qNoRegime;
                        const patternSkips = pFamily + pDup + pMaxOpen + pNoRegime;
                        const totalSkips24h = noPriceSkip + ohlcSkip + familyMismatch + dupPos + maxOpen + regimeNoStrat;
                        // B-NEW-19: Possible Strategy Iterations = Pre-Eval Skips + Strategy Evaluations
                        const qEvals = (ve as any).quantStrategyEvaluations ?? 0;
                        const pEvals = (ve as any).patternStrategyEvaluations ?? 0;
                        const qPossible = quantSkips + qEvals;
                        const pPossible = patternSkips + pEvals;
                        const totalPossible = totalSkips24h + qEvals + pEvals;
                        return (
                          <>
                            <tr className="border-b hover:bg-muted/30 bg-indigo-500/5">
                              <td className="p-2 font-medium">Possible Strategy Iterations</td>
                              <td className="p-2 text-right text-indigo-600">{fmt(qPossible)}</td>
                              <td className="p-2 text-right text-indigo-600">{fmt(pPossible)}</td>
                              <td className="p-2 text-right text-indigo-600 font-semibold">{fmt(totalPossible)}</td>
                              <td className="p-2 text-xs text-muted-foreground">Each pair-lane entry iterates through every asset-class-enabled strategy in its regime's pool. = Pre-Eval Skips + Strategy Evaluations.</td>
                            </tr>
                            <tr className="border-b hover:bg-muted/30">
                              <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Pre-Evaluation Skips</td>
                              <td className="p-2 text-right text-xs text-orange-500">{fmt(quantSkips)}</td>
                              <td className="p-2 text-right text-xs text-orange-500">{fmt(patternSkips)}</td>
                              <td className="p-2 text-right text-xs text-orange-500">{fmt(totalSkips24h)}</td>
                              <td className="p-2 text-xs text-muted-foreground">Strategy iterations that didn't run detect(). noPrice={fmt(noPriceSkip)}, OHLC={fmt(ohlcSkip)}, familyMismatch={fmt(familyMismatch)}, duplicate={fmt(dupPos)}, maxOpen={fmt(maxOpen)}, regimeNoStrats={fmt(regimeNoStrat)}. Lane cols = per-lane split of family_mismatch+duplicate+maxOpen+regimeNoStrats; pair-level (noPrice/OHLC) fire pre-lane and are in Total only.</td>
                            </tr>
                          </>
                        );
                      })()}
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2 font-medium">= Strategy Evaluations <span className="text-[10px] text-muted-foreground">(since process start)</span></td>
                        <td className="p-2 text-right">{fmt((ve as any).quantStrategyEvaluations ?? 0)}</td>
                        <td className="p-2 text-right">{fmt((ve as any).patternStrategyEvaluations ?? 0)}</td>
                        <td className="p-2 text-right">{fmt(((ve as any).quantStrategyEvaluations ?? 0) + ((ve as any).patternStrategyEvaluations ?? 0))}</td>
                        <td className="p-2 text-xs text-muted-foreground">Per-strategy per-pair detect() calls. Possible Strategy Iterations minus Pre-Eval Skips. In-memory counter, resets on PM2 restart.</td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Strategy Nulls <span className="text-[10px]">(since process start)</span></td>
                        <td className="p-2 text-right text-xs text-red-400">{fmt((ve as any).quantStrategyNulls ?? 0)}</td>
                        <td className="p-2 text-right text-xs text-red-400">{fmt((ve as any).patternStrategyNulls ?? 0)}</td>
                        <td className="p-2 text-right text-xs text-red-400">{fmt(((ve as any).quantStrategyNulls ?? 0) + ((ve as any).patternStrategyNulls ?? 0))}</td>
                        <td className="p-2 text-xs text-muted-foreground">In-memory counter, resets on PM2 restart.</td>
                      </tr>
                      {/* P19-B8.1 (defect a): reads the typed tradesOpened24h field (endpoint
                          v1.6) — the old quantTradesOpened/patternTradesOpened keys never
                          existed on vtsEvaluation, so this row rendered 0 forever. */}
                      <tr className="bg-muted/30 font-semibold border-t-2 border-primary/20">
                        <td className="p-2">Trades Opened <span className="text-[10px] text-muted-foreground">(DB-backed, 24h rolling)</span></td>
                        <td className="p-2 text-right text-green-600">{fmt(data?.tradesOpened24h?.quant ?? 0)}</td>
                        <td className="p-2 text-right text-green-600">{fmt(data?.tradesOpened24h?.pattern ?? 0)}</td>
                        <td className="p-2 text-right text-green-600">{fmt(data?.tradesOpened24h?.total ?? 0)}</td>
                        <td className="p-2 text-xs text-muted-foreground">After all gates passed (Net EV + pre-open + dedupe). Sourced from vts_open_trades DB row count — scope differs from in-memory Strategy counters above.</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            );
          })() : (
            <div className="p-4 text-muted-foreground text-center">No 24h scan data accumulated yet</div>
          )}
        </CardContent>
      </Card>

      {/* TABLE 1: Last Scan Stats. P19-B8.4c REV-3: lastScan theme (purple, OBJ-9) + frozen first column (OBJ-10). */}
      <Card className="border-2 border-purple-500/70 overflow-hidden">
        <CardHeader className="py-3 bg-purple-500/15 border-b-2 border-purple-500/70">
          <CardTitle className="text-xl font-bold flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span>Last Scan — Filter Breakdown</span>
            <span className="text-sm font-normal text-muted-foreground">
              {lastScan ? `${new Date(lastScan.timestamp).toLocaleTimeString()} · ${lastScan.mode} · ${lastScan.totalPairsScanned} pairs scanned` : 'No scan data'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lastScan ? (
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Filter</th>
                    <th className="text-right p-2 font-medium">Quant Global</th>
                    <th className="text-right p-2 font-medium">Pattern Global</th>
                    <th className="text-right p-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(lastScan.quant.global)
                    // B-NEW-7 (2026-05-12): `applicable` is an object holding
                    // N/A flags for the panel — not a numeric counter. Skip
                    // here so it doesn't render as "[object Object]".
                    .filter(([key, value]) => typeof value === 'number')
                    .map(([key, value]) => (
                    <tr key={key} className="border-b hover:bg-muted/30">
                      <td className="p-2">{formatFilterName(key)}</td>
                      <td className={`p-2 text-right ${key === 'passed_all_filters' ? 'text-green-600 font-semibold' : getRejectionColor(value as number, lastScan.totalPairsScanned)}`}>
                        {fmt(value as number)}
                      </td>
                      <td className={`p-2 text-right ${lastScan.pattern.global && key in lastScan.pattern.global ? (key === 'passed_all_filters' ? 'text-green-600 font-semibold' : getRejectionColor((lastScan.pattern.global as Record<string, number>)[key] || 0, lastScan.totalPairsScanned)) : 'text-muted-foreground'}`}>
                        {lastScan.pattern.global && key in (lastScan.pattern.global as Record<string, number>)
                          ? fmt((lastScan.pattern.global as Record<string, number>)[key])
                          : '—'}
                      </td>
                      <td className={`p-2 text-right ${key === 'passed_all_filters' ? 'text-green-600 font-semibold' : ''}`}>
                        {lastScan.pattern.global && key in (lastScan.pattern.global as Record<string, number>)
                          ? fmt((value as number) + ((lastScan.pattern.global as Record<string, number>)[key] || 0))
                          : fmt(value as number)}
                      </td>
                    </tr>
                  ))}
                  {/* IMF Section Header */}
                  <tr className="border-b bg-muted/50">
                    <td colSpan={4} className="p-2 font-medium text-xs uppercase tracking-wider">Family IMF Metrics (aggregate across 4 families)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed LQ</td>
                    <td className={`p-2 text-right ${getRejectionColor(lastScan.quant.imf.failedLQ, lastScan.quant.imf.total)}`}>{fmt(lastScan.quant.imf.failedLQ)}</td>
                    <td className={`p-2 text-right ${lastScan.pattern.imf ? getRejectionColor(lastScan.pattern.imf.failedLQ, lastScan.pattern.imf.total) : 'text-muted-foreground'}`}>
                      {lastScan.pattern.imf ? fmt(lastScan.pattern.imf.failedLQ) : '—'}
                    </td>
                    <td className="p-2 text-right">{fmt(lastScan.quant.imf.failedLQ + (lastScan.pattern.imf?.failedLQ ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed VN</td>
                    <td className={`p-2 text-right ${getRejectionColor(lastScan.quant.imf.failedVN, lastScan.quant.imf.total)}`}>{fmt(lastScan.quant.imf.failedVN)}</td>
                    <td className={`p-2 text-right ${lastScan.pattern.imf ? getRejectionColor(lastScan.pattern.imf.failedVN, lastScan.pattern.imf.total) : 'text-muted-foreground'}`}>
                      {lastScan.pattern.imf ? fmt(lastScan.pattern.imf.failedVN) : '—'}
                    </td>
                    <td className="p-2 text-right">{fmt(lastScan.quant.imf.failedVN + (lastScan.pattern.imf?.failedVN ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed DI</td>
                    <td className={`p-2 text-right ${getRejectionColor(lastScan.quant.imf.failedDI ?? 0, lastScan.quant.imf.total)}`}>
                      {fmt(lastScan.quant.imf.failedDI ?? 0)}
                    </td>
                    <td className={`p-2 text-right ${lastScan.pattern.imf ? getRejectionColor(lastScan.pattern.imf.failedDI, lastScan.pattern.imf.total) : 'text-muted-foreground'}`}>
                      {lastScan.pattern.imf ? fmt(lastScan.pattern.imf.failedDI) : '—'}
                    </td>
                    <td className="p-2 text-right">{fmt((lastScan.quant.imf.failedDI ?? 0) + (lastScan.pattern.imf?.failedDI ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30 font-semibold">
                    <td className="p-2">Family IMF Passed (fan-out total)</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.imf.passed)}</td>
                    <td className="p-2 text-right text-green-600">{lastScan.pattern.imf ? fmt(lastScan.pattern.imf.passed) : '—'}</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.imf.passed + (lastScan.pattern.imf?.passed ?? 0))}</td>
                  </tr>
                  {/* Batch 22: Family Path IMF Results */}
                  {data?.lastScan?.familyPaths && (
                    <>
                      <tr className="bg-muted/30">
                        <td colSpan={4} className="p-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Family Path IMF Breakdown (per-family detail)
                        </td>
                      </tr>
                      {['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].map(family => {
                        const fp = (data.lastScan as any)?.familyPaths?.[family];
                        if (!fp) return null;
                        const familyLabel: Record<string, string> = { trend: 'Trend Family', reversal: 'Reversal Family', breakout: 'Breakout Family', oscillator: 'Oscillator Family' };
                        return (
                          <tr key={family} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{familyLabel[family] ?? family}</td>
                            <td className="p-2 text-right">
                              <span className="text-green-600">{fp.survivors}</span>
                              <span className="text-muted-foreground text-xs ml-1">
                                / {fp.imf?.total ?? 0}
                              </span>
                            </td>
                            <td className="p-2 text-right text-xs text-muted-foreground">
                              LQ:{fp.imf?.failedLQ ?? 0} VN:{fp.imf?.failedVN ?? 0} DI:{fp.imf?.failedDI ?? 0}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                  {/* Batch 52: Pipeline flow — survivors → benchmarks removed → VTS destination (moved below family breakdown per Kyle/Langston) */}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="p-2">IMF Survivors (incl. benchmarks)</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.survivors)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.pattern.survivors)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(lastScan.quant.survivors + lastScan.pattern.survivors)}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Benchmarks Removed</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(lastScan.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{lastScan.pattern.imf ? fmt(lastScan.pattern.imf.benchmarkBypassed) : '—'}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(lastScan.quant.imf.benchmarkBypassed + (lastScan.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                  </tr>
                  <tr className="bg-green-500/10 font-semibold border-t-2 border-green-500/30">
                    <td className="p-2">{gateDisposition === 'enforce' ? '→ Survivors' : '→ VTS Destination'} <span className="text-[10px] text-muted-foreground">(post-benchmark{gateDisposition === 'enforce' ? '; shared scan feed' : ''})</span></td>
                    <td className="p-2 text-right text-green-700">{fmt(lastScan.quant.survivors - lastScan.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-green-700">{fmt(lastScan.pattern.survivors - (lastScan.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-right text-green-700 font-bold text-base">{fmt((lastScan.quant.survivors - lastScan.quant.imf.benchmarkBypassed) + (lastScan.pattern.survivors - (lastScan.pattern.imf?.benchmarkBypassed ?? 0)))}</td>
                  </tr>
                  {/* Batch 51 HF2: Restored VTS Signal Funnel in Last Scan with last-cycle data (Kyle directive)
                      B-NEW-19 (Kyle 2026-05-13): Restructured to match Pipeline Summary 24h order —
                      Pair-Pool Evals first, then Possible Strategy Iterations, then per-lane Pre-Eval
                      Skip breakdown, then Strategy Evaluations. Per-lane Quant/Pattern split wired
                      using lc.quantNullReasonDetail / patternNullReasonDetail emitted by routes.ts
                      (xstock) and vts-runner snapshot (crypto). No leading minus signs. */}
                  {/* P19-B8.3b (OBJ-1, #417): the VTS Signal Funnel is the VTS
                      RUNNER's downstream processing (pair-pool → strategy evals →
                      nulls → signals → trades) — VTS-engine activity, not the
                      shared scan feed. It renders ONLY on the VTS page ('tag').
                      On Paper/Live ('enforce') the active pipeline is dormant
                      until the B8.4 switch-on, so an honest placeholder shows in
                      its place (the scan-stage rows above ARE the shared feed). */}
                  {/* B-FILTER-DIAG-STANDARDIZE: the ACTIVE path has no per-cycle snapshot (SIM S22:
                      cumulative-since-start by design). A poll-window delta is NOT a scan cycle unless poll
                      and scan are phase-locked, and nothing guarantees that — so it is NOT synthesised. */}
                  {isEnforce && (
                    <tr className="border-b">
                      <td colSpan={5} className="p-2 text-xs text-muted-foreground">
                        <strong>Last-cycle funnel:</strong> not instrumented on this path — the active counters are
                        cumulative since engine start, with no per-cycle snapshot, and are deliberately not derived
                        from polling deltas (a poll window is not a scan cycle). Tracked as #662.
                      </td>
                    </tr>
                  )}
                  {gateDisposition === 'tag' && data?.lastCycleVtsEval && (() => {
                    const lc = data.lastCycleVtsEval;
                    const totalEvals = lc.totalStrategyEvaluations || 0;
                    const totalNulls = (lc.quantStrategyNulls || 0) + (lc.patternStrategyNulls || 0);
                    const signals = lc.signalsGenerated || 0;
                    const rejected = lc.signalsRejected || 0;
                    const trades = signals - rejected;
                    const qDetail = ((lc as any).quantNullReasonDetail ?? {}) as Record<string, number>;
                    const pDetail = ((lc as any).patternNullReasonDetail ?? {}) as Record<string, number>;
                    const skippedNoPrice = lc.pairsSkippedNoPrice || 0;
                    const skippedOHLC = lc.pairsSkippedInsufficientOHLC || 0;
                    const skippedMaxTrades = (lc.nullReasons as any)?.maxOpenTrades || (lc.nullReasonDetail as any)?.['max_open_trades'] || 0;
                    const skippedNoRegime = (lc.nullReasons as any)?.regimeNoStrategies || (lc.nullReasonDetail as any)?.['regime_no_strategies'] || 0;
                    const skippedDuplicate = (lc.nullReasons as any)?.duplicatePosition || (lc.nullReasonDetail as any)?.['duplicate_position'] || 0;
                    const skippedFamilyMismatch = (lc.nullReasons as any)?.familyFilterMismatch || (lc.nullReasonDetail as any)?.['family_filter_mismatch'] || 0;
                    const totalPreEvalSkips = skippedNoPrice + skippedOHLC + skippedMaxTrades + skippedNoRegime + skippedDuplicate + skippedFamilyMismatch;
                    // Per-lane split (lane-level reasons only; pair-level noPrice/OHLC go to Total).
                    const qFamily = qDetail['family_filter_mismatch'] ?? 0;
                    const pFamily = pDetail['family_filter_mismatch'] ?? 0;
                    const qDup = qDetail['duplicate_position'] ?? 0;
                    const pDup = pDetail['duplicate_position'] ?? 0;
                    const qMaxOpen = qDetail['max_open_trades'] ?? 0;
                    const pMaxOpen = pDetail['max_open_trades'] ?? 0;
                    const qNoRegime = qDetail['regime_no_strategies'] ?? 0;
                    const pNoRegime = pDetail['regime_no_strategies'] ?? 0;
                    const quantSkips = qFamily + qDup + qMaxOpen + qNoRegime;
                    const patternSkips = pFamily + pDup + pMaxOpen + pNoRegime;
                    // Possible Strategy Iterations = Pre-Eval Skips + Strategy Evaluations
                    const qPairPool = (lc.quantPairPoolEvaluations ?? lc.quantPairsEvaluated) || 0;
                    const pPairPool = (lc.patternPairPoolEvaluations ?? lc.patternPairsEvaluated) || 0;
                    const qEvals = lc.quantStrategyEvaluations || 0;
                    const pEvals = lc.patternStrategyEvaluations || 0;
                    const qPossible = quantSkips + qEvals;
                    const pPossible = patternSkips + pEvals;
                    const totalPossible = totalPreEvalSkips + totalEvals;
                    return (
                      <>
                        <tr className="border-b bg-blue-500/5"><td colSpan={4} className="p-2 font-medium text-xs text-blue-600">VTS Signal Funnel (Last Cycle)</td></tr>
                        <tr className="border-b hover:bg-muted/30 bg-blue-500/5">
                          <td className="p-2 pl-4 font-medium">Pair-Pool Evaluations</td>
                          <td className="p-2 text-right">{fmt(qPairPool)}</td>
                          <td className="p-2 text-right">{fmt(pPairPool)}</td>
                          <td className="p-2 text-right font-semibold">{fmt(qPairPool + pPairPool)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30 bg-indigo-500/5">
                          <td className="p-2 pl-4 font-medium">Possible Strategy Iterations</td>
                          <td className="p-2 text-right text-indigo-600">{fmt(qPossible)}</td>
                          <td className="p-2 text-right text-indigo-600">{fmt(pPossible)}</td>
                          <td className="p-2 text-right text-indigo-600 font-semibold">{fmt(totalPossible)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Pre-Evaluation Skips</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(quantSkips)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(patternSkips)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(totalPreEvalSkips)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ No Price Data</td>
                          <td colSpan={2}></td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedNoPrice)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Insufficient OHLC</td>
                          <td colSpan={2}></td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedOHLC)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Family Filter Mismatch</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(qFamily)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(pFamily)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedFamilyMismatch)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Duplicate Position</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(qDup)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(pDup)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedDuplicate)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Max Open Trades</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(qMaxOpen)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(pMaxOpen)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedMaxTrades)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-8 text-xs text-muted-foreground">↳ Regime Has No Strategies</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(qNoRegime)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(pNoRegime)}</td>
                          <td className="p-2 text-right text-xs text-orange-400">{fmt(skippedNoRegime)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-4">= Strategy Evaluations</td>
                          <td className="p-2 text-right">{fmt(qEvals)}</td>
                          <td className="p-2 text-right">{fmt(pEvals)}</td>
                          <td className="p-2 text-right">{fmt(totalEvals)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-4">Strategy Nulls (no setup)</td>
                          <td className="p-2 text-right text-amber-500">{fmt(lc.quantStrategyNulls || 0)}</td>
                          <td className="p-2 text-right text-amber-500">{fmt(lc.patternStrategyNulls || 0)}</td>
                          <td className="p-2 text-right text-amber-500">{fmt(totalNulls)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-4">Signals Produced</td>
                          <td className="p-2 text-right text-green-600">{fmt(lc.quantSignalsGenerated || 0)}</td>
                          <td className="p-2 text-right text-green-600">{fmt(lc.patternSignalsGenerated || 0)}</td>
                          <td className="p-2 text-right text-green-600">{fmt(signals)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-4">Post-Signal Rejections</td>
                          <td className="p-2 text-right text-red-500">{fmt(lc.quantSignalsRejected || 0)}</td>
                          <td className="p-2 text-right text-red-500">{fmt(lc.patternSignalsRejected || 0)}</td>
                          <td className="p-2 text-right text-red-500">{fmt(rejected)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30 font-semibold">
                          <td className="p-2 pl-4">Trades Opened</td>
                          <td colSpan={3} className="p-2 text-right text-green-700">{fmt(trades >= 0 ? trades : 0)}</td>
                        </tr>
                      </>
                    );
                  })()}
                  {/* P19-B8.3b (OBJ-1, #417): honest active-path placeholder on Paper/Live. */}
                  {gateDisposition === 'enforce' && (
                    <tr className="border-b bg-amber-500/5" data-testid="fd-active-funnel-dormant">
                      <td colSpan={4} className="p-3 text-xs text-muted-foreground italic text-center">
                        Active-path signal funnel — populates when active trading is switched on (Phase 19 B8.4). The scan-stage totals above are the shared scanner feed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-muted-foreground text-center">No scan data yet</div>
          )}
        </CardContent>
      </Card>

      {/* TABLE 2: 24-Hour Rolling Aggregates. P19-B8.4c REV-3: rolling theme (teal, OBJ-9) + frozen first column (OBJ-10). */}
      <Card className="border-2 border-teal-500/70 overflow-hidden">
        <CardHeader className="py-3 bg-teal-500/15 border-b-2 border-teal-500/70">
          <CardTitle className="text-xl font-bold flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span>24-Hour Rolling Aggregates</span>
            <span className="text-xs font-normal text-orange-400">(in-memory — resets on restart)</span>
            <span className="text-sm font-normal text-muted-foreground">
              {rolling24h.totalScans} scans · {fmt(rolling24h.totalPairsScanned)} total pairs · {fmt(rolling24h.uniquePairsScanned)} unique
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rolling24h.totalScans > 0 ? (
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Filter</th>
                    <th className="text-right p-2 font-medium">Quant Global (24h)</th>
                    <th className="text-right p-2 font-medium">Pattern Global (24h)</th>
                    <th className="text-right p-2 font-medium">Total (24h)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(rolling24h.aggregated.quant.global)
                    // B-NEW-7 (2026-05-12): same `applicable`-object-as-string
                    // fix as the Last Scan table above. Skip non-numeric keys.
                    .filter(([key, value]) => typeof value === 'number')
                    .map(([key, value]) => {
                    const patternVal = rolling24h.aggregated.pattern.global && key in (rolling24h.aggregated.pattern.global as Record<string, number>)
                      ? (rolling24h.aggregated.pattern.global as Record<string, number>)[key]
                      : null;
                    const total = (value as number) + (patternVal ?? 0);
                    return (
                      <tr key={key} className="border-b hover:bg-muted/30">
                        <td className="p-2">{formatFilterName(key)}</td>
                        <td className={`p-2 text-right ${key === 'passed_all_filters' ? 'text-green-600 font-semibold' : getRejectionColor(value as number, rolling24h.totalPairsScanned)}`}>
                          {fmt(value as number)}
                        </td>
                        <td className={`p-2 text-right ${patternVal !== null ? (key === 'passed_all_filters' ? 'text-green-600 font-semibold' : '') : 'text-muted-foreground'}`}>
                          {patternVal !== null ? fmt(patternVal) : '—'}
                        </td>
                        <td className={`p-2 text-right font-medium ${key === 'passed_all_filters' ? 'text-green-600' : ''}`}>
                          {fmt(total)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-b bg-muted/50">
                    <td colSpan={4} className="p-2 font-medium text-xs uppercase tracking-wider">Family IMF Metrics (24h aggregate across families)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed LQ</td>
                    <td className="p-2 text-right">{fmt(rolling24h.aggregated.quant.imf.failedLQ)}</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedLQ) : '—'}</td>
                    <td className="p-2 text-right font-medium">{fmt(rolling24h.aggregated.quant.imf.failedLQ + (rolling24h.aggregated.pattern.imf?.failedLQ ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed VN</td>
                    <td className="p-2 text-right">{fmt(rolling24h.aggregated.quant.imf.failedVN)}</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedVN) : '—'}</td>
                    <td className="p-2 text-right font-medium">{fmt(rolling24h.aggregated.quant.imf.failedVN + (rolling24h.aggregated.pattern.imf?.failedVN ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2">Failed DI</td>
                    <td className="p-2 text-right">{fmt(rolling24h.aggregated.quant.imf.failedDI ?? 0)}</td>
                    <td className="p-2 text-right">{rolling24h.aggregated.pattern.imf ? fmt(rolling24h.aggregated.pattern.imf.failedDI) : '—'}</td>
                    <td className="p-2 text-right font-medium">{fmt((rolling24h.aggregated.quant.imf.failedDI ?? 0) + (rolling24h.aggregated.pattern.imf?.failedDI ?? 0))}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30 font-semibold">
                    <td className="p-2">IMF Passed (fan-out total)</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.quant.imf.passed)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.pattern.imf?.passed ?? 0)}</td>
                    <td className="p-2 text-right text-green-600 font-medium">{fmt(rolling24h.aggregated.quant.imf.passed + (rolling24h.aggregated.pattern.imf?.passed ?? 0))}</td>
                  </tr>
                  {/* Family Path IMF Results — quant only, should reconcile with quant IMF Passed above */}
                  {rolling24h.aggregated.familyPaths && (() => {
                    const familyTotal = ['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].reduce((sum, f) =>
                      sum + (rolling24h.aggregated.familyPaths?.[f]?.survivors ?? 0), 0);
                    return (
                    <>
                      <tr className="bg-muted/30">
                        <td colSpan={4} className="p-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Family Path IMF Results (24h — quant families)
                        </td>
                      </tr>
                      {['trend', 'reversal', 'breakout', 'oscillator', 'strong_trend'].map(family => {
                        const fp = rolling24h.aggregated.familyPaths?.[family];
                        if (!fp) return null;
                        const familyLabel: Record<string, string> = { trend: 'Trend Family', reversal: 'Reversal Family', breakout: 'Breakout Family', oscillator: 'Oscillator Family' };
                        return (
                          <tr key={`24h-${family}`} className="border-b hover:bg-muted/30">
                            <td className="p-2 font-medium">{familyLabel[family] ?? family}</td>
                            <td className="p-2 text-right">
                              <span className="text-green-600">{fmt(fp.survivors)}</span>
                              <span className="text-muted-foreground text-xs ml-1">
                                / {fmt(fp.imf?.total ?? 0)}
                              </span>
                            </td>
                            <td className="p-2 text-right text-xs text-muted-foreground">
                              LQ:{fmt(fp.imf?.failedLQ ?? 0)} VN:{fmt(fp.imf?.failedVN ?? 0)} DI:{fmt(fp.imf?.failedDI ?? 0)}
                            </td>
                            <td className="p-2 text-right text-xs text-muted-foreground">—</td>
                          </tr>
                        );
                      })}
                      <tr className="border-b hover:bg-muted/30 font-semibold">
                        <td className="p-2 pl-6 text-xs">↳ Family Total (quant fan-out)</td>
                        <td className="p-2 text-right text-green-600">{fmt(familyTotal)}</td>
                        <td className="p-2 text-right text-muted-foreground">—</td>
                        <td className="p-2 text-right text-green-600">{fmt(familyTotal)}</td>
                      </tr>
                    </>
                    );
                  })()}
                  {/* Pipeline flow: IMF Survivors → Benchmarks Removed → VTS Destination */}
                  <tr className="bg-muted/50 border-y">
                    <td colSpan={4} className="p-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Pipeline Flow (24h cumulative)</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30 font-semibold">
                    <td className="p-2">IMF Survivors (incl. benchmarks)</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.quant.survivors)}</td>
                    <td className="p-2 text-right text-green-600">{fmt(rolling24h.aggregated.pattern.survivors)}</td>
                    <td className="p-2 text-right text-green-600 font-medium">{fmt(rolling24h.aggregated.quant.survivors + rolling24h.aggregated.pattern.survivors)}</td>
                  </tr>
                  <tr className="border-b hover:bg-muted/30">
                    <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Benchmarks Removed</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(rolling24h.aggregated.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(rolling24h.aggregated.pattern.imf?.benchmarkBypassed ?? 0)}</td>
                    <td className="p-2 text-right text-xs text-red-400">{fmt(rolling24h.aggregated.quant.imf.benchmarkBypassed + (rolling24h.aggregated.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                  </tr>
                  <tr className="bg-green-500/10 font-semibold border-t-2 border-green-500/30">
                    <td className="p-2">{gateDisposition === 'enforce' ? '→ Survivors' : '→ VTS Destination'} <span className="text-[10px] text-muted-foreground">(post-benchmark{gateDisposition === 'enforce' ? '; shared scan feed' : ''})</span></td>
                    <td className="p-2 text-right text-green-700">{fmt(rolling24h.aggregated.quant.survivors - rolling24h.aggregated.quant.imf.benchmarkBypassed)}</td>
                    <td className="p-2 text-right text-green-700">{fmt(rolling24h.aggregated.pattern.survivors - (rolling24h.aggregated.pattern.imf?.benchmarkBypassed ?? 0))}</td>
                    <td className="p-2 text-right text-green-700 font-bold">{fmt((rolling24h.aggregated.quant.survivors - rolling24h.aggregated.quant.imf.benchmarkBypassed) + (rolling24h.aggregated.pattern.survivors - (rolling24h.aggregated.pattern.imf?.benchmarkBypassed ?? 0)))}</td>
                  </tr>
                  {/* Batch 52 Fix 18: Merged VTS Evaluation Breakdown into this table (was separate card)
                      B-NEW-19 (Kyle 2026-05-13): Restructured to subtractive flow.
                        Pair-Pool Evaluations → Possible Strategy Iterations → Pre-Eval Skips →
                        Strategy Evaluations → Strategy Nulls → Trades Opened.
                      Per-lane split for Pre-Eval Skips now reads ve.quantNullReasonDetail /
                      ve.patternNullReasonDetail (previously rendered noPrice in quant col and
                      OHLC in pattern col — semantically wrong). No leading minus signs. */}
                  {/* P19-B8.3b (OBJ-1, #417): the 24h Evaluation block is the VTS RUNNER's downstream
                      counters (pair-pool → strategy evals → nulls → trades opened).
                      ⚠️ B-FILTER-DIAG-STANDARDIZE 2026-08-07: the trailing "dormant until B8.4" clause of this
                      comment EXPIRED at the B8.5 switch-on (active-paper live since 2026-07-14) — the same
                      stale-premise shape that left the early return standing for eleven weeks. The active path
                      is NOT dormant; it simply does not emit THIS taxonomy (#662). On Paper/Live the block
                      states that rather than rendering nothing. */}
                  {isEnforce && (
                    <tr className="border-b">
                      <td colSpan={5} className="p-2 text-xs text-muted-foreground">
                        <strong>24-hour evaluation detail:</strong> the per-strategy evaluation/null breakdown is
                        emitted by the VTS runner only. This path's stage counts are in the SQE and RTB sections
                        below; the per-strategy version is tracked as #662. Not shown as zeros — it is not measured
                        here, which is a different statement from measured-and-zero.
                      </td>
                    </tr>
                  )}
                  {gateDisposition === 'tag' && data?.vtsEvaluation && (() => {
                    const ve = data.vtsEvaluation!;
                    const nr3 = (ve.nullReasons ?? {}) as any;
                    const qDetail = ((ve as any).quantNullReasonDetail ?? {}) as Record<string, number>;
                    const pDetail = ((ve as any).patternNullReasonDetail ?? {}) as Record<string, number>;
                    const noPrice = (ve as any).pairsSkippedNoPrice ?? 0;
                    const ohlc = (ve as any).pairsSkippedInsufficientOHLC ?? 0;
                    const qFamily = qDetail['family_filter_mismatch'] ?? 0;
                    const pFamily = pDetail['family_filter_mismatch'] ?? 0;
                    const qDup = qDetail['duplicate_position'] ?? 0;
                    const pDup = pDetail['duplicate_position'] ?? 0;
                    const qMaxOpen = qDetail['max_open_trades'] ?? 0;
                    const pMaxOpen = pDetail['max_open_trades'] ?? 0;
                    const qNoRegime = qDetail['regime_no_strategies'] ?? 0;
                    const pNoRegime = pDetail['regime_no_strategies'] ?? 0;
                    const quantSkips = qFamily + qDup + qMaxOpen + qNoRegime;
                    const patternSkips = pFamily + pDup + pMaxOpen + pNoRegime;
                    const preEvalTotal =
                      noPrice + ohlc +
                      (nr3.familyFilterMismatch ?? 0) +
                      (nr3.duplicatePosition ?? 0) +
                      (nr3.maxOpenTrades ?? 0) +
                      (nr3.regimeNoStrategies ?? 0);
                    const qPairPool = ve.quantPairPoolEvaluations ?? ve.quantPairsEvaluated;
                    const pPairPool = ve.patternPairPoolEvaluations ?? ve.patternPairsEvaluated;
                    const qEvals = (ve as any).quantStrategyEvaluations ?? 0;
                    const pEvals = (ve as any).patternStrategyEvaluations ?? 0;
                    const qPossible = quantSkips + qEvals;
                    const pPossible = patternSkips + pEvals;
                    const totalPossible = preEvalTotal + ve.totalStrategyEvaluations;
                    return (
                      <>
                        <tr className="bg-muted/50 border-y">
                          <td colSpan={4} className="p-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">VTS Evaluation (24h rolling — VTS-side counters)</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30 bg-blue-500/5">
                          <td className="p-2 font-medium">Pair-Pool Evaluations</td>
                          <td className="p-2 text-right text-blue-600">{fmt(qPairPool)}</td>
                          <td className="p-2 text-right text-blue-600">{fmt(pPairPool)}</td>
                          <td className="p-2 text-right font-semibold text-blue-600">{fmt(qPairPool + pPairPool)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30 bg-indigo-500/5">
                          <td className="p-2 font-medium">Possible Strategy Iterations</td>
                          <td className="p-2 text-right text-indigo-600">{fmt(qPossible)}</td>
                          <td className="p-2 text-right text-indigo-600">{fmt(pPossible)}</td>
                          <td className="p-2 text-right font-semibold text-indigo-600">{fmt(totalPossible)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Pre-Evaluation Skips <span className="text-[10px]">(sum of all pre-detect rejections)</span></td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(quantSkips)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(patternSkips)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(preEvalTotal)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2">= Strategy Evaluations</td>
                          <td className="p-2 text-right">{fmt(qEvals)}</td>
                          <td className="p-2 text-right">{fmt(pEvals)}</td>
                          <td className="p-2 text-right font-semibold">{fmt(ve.totalStrategyEvaluations)}</td>
                        </tr>
                        <tr className="border-b hover:bg-muted/30">
                          <td className="p-2 pl-6 text-xs text-muted-foreground">↳ Strategy Nulls</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(ve.quantStrategyNulls)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt((ve as any).patternStrategyNulls ?? 0)}</td>
                          <td className="p-2 text-right text-xs text-orange-500">{fmt(ve.quantStrategyNulls + ((ve as any).patternStrategyNulls ?? 0))}</td>
                        </tr>
                        <tr className="bg-muted/30 font-semibold border-t-2 border-primary/20">
                          <td className="p-2">Trades Opened <span className="text-[10px] text-muted-foreground">(post-gate; DB-backed 24h)</span></td>
                          <td className="p-2 text-right text-green-600">{fmt(data?.tradesOpened24h?.quant ?? 0)}</td>
                          <td className="p-2 text-right text-green-600">{fmt(data?.tradesOpened24h?.pattern ?? 0)}</td>
                          <td className="p-2 text-right font-semibold text-green-600">{fmt(data?.tradesOpened24h?.total ?? 0)}</td>
                        </tr>
                      </>
                    );
                  })()}
                  {/* P19-B8.3b (OBJ-1, #417): honest active-path placeholder on Paper/Live (24h table). */}
                  {gateDisposition === 'enforce' && (
                    <tr className="border-b bg-amber-500/5" data-testid="fd-active-eval-dormant-24h">
                      <td colSpan={4} className="p-3 text-xs text-muted-foreground italic text-center">
                        Active-path evaluation counters — populate when active trading is switched on (Phase 19 B8.4). The scan-stage totals above are the shared scanner feed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-muted-foreground text-center">No 24h data accumulated yet</div>
          )}
        </CardContent>
      </Card>

      {/* reorg-B2.2 OBJ-B: Reward-vs-Risk / Reachability Gate (per strategy, this asset class).
          P19-B8.2b (Kyle 2026-07-06): MOVED below the 24-Hour Rolling Aggregates (was 2nd from top).
          The shared post-signal-build guard (RR + reachability + stop-distance + invalid-ATR) lives at
          signal generation — its drops aren't part of the IMF/scan-phase filter breakdown above. Surfaced
          here per class (Kyle's no-hidden-gates). Distinct "no evaluations" state ≠ a misleading 0%. */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Reward-vs-Risk / Reachability Gate</span>
            <span className="text-sm font-normal text-muted-foreground">
              per strategy{data.trackerStartedAt ? ` · since ${new Date(data.trackerStartedAt).toLocaleString()}` : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(() => {
            const gd = data.guardDrops;
            const rows = gd ? Object.entries(gd) : [];
            if (rows.length === 0) {
              return (
                <div className="p-4 text-muted-foreground text-center">
                  No guard evaluations recorded for this asset class yet — the reward-vs-risk / reachability gate hasn't evaluated a signal here.
                </div>
              );
            }
            // Most-suppressed first (the #372 calibration read: which strategies the per-class minRR cuts).
            rows.sort((a, b) => b[1].rrSuppressionRate - a[1].rrSuppressionRate);
            // P19-B8.3 (OBJ-7): per-disposition totals (Langston Step-2 hook —
            // "Rejected" is only TRUE on the enforce path; on the VTS 'tag' path
            // the two quality reasons do NOT reject: they are TAGGED and still
            // simulated (the un-strangle), so the VTS table splits Dropped
            // (data-validity: Bad Stop + No ATR) from Tagged (RR Too Low +
            // Target Unreachable). Evals = Passed + the four reasons, always
            // (exhaustive + mutually exclusive — applyGlobalGuards).
            // The aggregate columns come from the pure, unit-tested helper —
            // 'tag' structurally cannot yield a "Rejected" column (Langston
            // Step-4 HARD check 1).
            const aggCols = gateAggregateColumns(gateDisposition);
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">Strategy</th>
                      <th className="text-right p-2 font-medium" title="Signals this gate evaluated (= Passed + the four reason columns)">Evals</th>
                      <th className="text-right p-2 font-medium">Passed</th>
                      {aggCols.map(c => (
                        <th key={c.key} className="text-right p-2 font-medium" title={c.title}>{c.label}</th>
                      ))}
                      <th className="text-right p-2 font-medium" title="Reward-to-risk ratio below this strategy's minimum">{formatFilterName('rr_below_min')}</th>
                      <th className="text-right p-2 font-medium" title="Target too far for current volatility to plausibly reach">{formatFilterName('unreachable')}</th>
                      <th className="text-right p-2 font-medium" title="Stop too close to entry — broken trade geometry">{formatFilterName('stop_distance')}</th>
                      <th className="text-right p-2 font-medium" title="Volatility reading missing/invalid — the check could not run">{formatFilterName('invalid_atr')}</th>
                      <th className="text-right p-2 font-medium">Mean RR</th>
                      <th className="text-right p-2 font-medium">RR Suppression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([strategy, s]) => (
                      <tr key={strategy} className="border-b hover:bg-muted/30">
                        <td className="p-2 font-medium">{strategy}</td>
                        <td className="p-2 text-right">{fmt(s.evals)}</td>
                        <td className="p-2 text-right text-green-600">{fmt(s.passes)}</td>
                        {aggCols.map(c => (
                          <td key={c.key} className={`p-2 text-right ${c.key === 'rejected' ? 'font-semibold ' : ''}${c.tone === 'reject' ? getRejectionColor(c.value(s), s.evals) : 'text-blue-600'}`}>{fmt(c.value(s))}</td>
                        ))}
                        <td className={`p-2 text-right ${getRejectionColor(s.rrDrops, s.evals)}`}>{fmt(s.rrDrops)}</td>
                        <td className={`p-2 text-right ${getRejectionColor(s.reachDrops, s.evals)}`}>{fmt(s.reachDrops)}</td>
                        <td className="p-2 text-right text-muted-foreground">{fmt(s.stopDrops)}</td>
                        <td className="p-2 text-right text-muted-foreground">{fmt(s.atrDrops)}</td>
                        <td className="p-2 text-right">{s.rrEvals > 0 ? s.meanRR.toFixed(2) : '—'}</td>
                        <td className={`p-2 text-right ${getRejectionColor(s.rrDrops, s.evals)}`}>
                          {s.evals > 0 ? `${(s.rrSuppressionRate * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* (Historical note, corrected B-FILTER-DIAG-STANDARDIZE 2026-08-07: this used to describe the
          enforce path early-returning to a separate DormantPipelineTables view. That early return and all
          three of its components are GONE — Paper/Live now render THIS shared structure, which is the
          point of the batch. Kept as a pointer so a reader who greps the old names finds the reason.) */}
      {/* TABLE 4: Evaluation Detail. B-FILTER-DIAG-STANDARDIZE: on Paper/Live this must NOT silently
          vanish — a tab missing a section the others have fails Kyle's "same tracked metrics" test, and a
          reader cannot tell absent from zero from broken. Explicit not-instrumented state naming the batch
          that fills it (#662: the per-strategy null taxonomy has NO active-path writer, verified both classes). */}
      {isEnforce && (
        <DiagTableCard theme="rolling" title="Evaluation Detail" subtitle={`${modeTail === 'paper' ? 'Paper' : 'Live'} — not instrumented on this path yet`} testId="fd-eval-detail-not-instrumented">
          <div className="p-3 text-sm text-muted-foreground">
            The per-strategy null/skip taxonomy (Setup Nulls A–F, Pre-Evaluation Skips, the by-strategy null
            breakdown) is <strong>not emitted by the active trading path</strong> — only the VTS runner produces
            it today. Deliberately blank rather than zeros: a statement about the <em>instrument</em>, not the
            world. Tracked as <strong>#662 B-ACTIVE-NULL-TAXONOMY</strong>.
          </div>
        </DiagTableCard>
      )}
      {gateDisposition === 'tag' && (
      <Card className="max-w-4xl">
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>VTS Evaluation Detail</span>
            <span className="text-sm font-normal text-muted-foreground">
              {data?.vtsEvaluation ? '24-Hour Rolling — Strategy & Null Reason Breakdown' : 'No VTS data yet'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data?.vtsEvaluation ? (() => {
            const ve = data.vtsEvaluation!;
            return (
              <div className="space-y-4">
                {/* Source Pool Summary */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Metric</th>
                        <th className="text-right p-2 font-medium">Quant Pool</th>
                        <th className="text-right p-2 font-medium">Pattern Pool</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Pattern detection, strategy evals, nulls, signals — detail view */}
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Pattern Detection <span className="text-xs text-muted-foreground">(BUY pattern scan results)</span></td>
                        <td className="p-2 text-right">
                          {((ve as any).quantPatternDetected > 0 || (ve as any).quantPatternNoDetection > 0) ? (
                            <>
                              <span className="text-green-600">{fmt((ve as any).quantPatternDetected ?? 0)}</span>
                              {' / '}
                              <span className="text-red-500">{fmt((ve as any).quantPatternNoDetection ?? 0)}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {ve.patternPairsEvaluated > 0 ? (
                            <>
                              <span className="text-green-600">{fmt(ve.patternDetected)}</span>
                              {' / '}
                              <span className="text-red-500">{fmt(ve.patternNoDetection)}</span>
                              <span className="text-xs text-muted-foreground ml-1">
                                ({Math.round(ve.patternDetected / ve.patternPairsEvaluated * 100)}% hit)
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {(() => {
                            const qd = (ve as any).quantPatternDetected ?? 0;
                            const qnd = (ve as any).quantPatternNoDetection ?? 0;
                            const totalDetected = qd + ve.patternDetected;
                            const totalNoDetection = qnd + ve.patternNoDetection;
                            if (totalDetected + totalNoDetection > 0) {
                              return (
                                <>
                                  <span className="text-green-600">{fmt(totalDetected)}</span>
                                  {' / '}
                                  <span className="text-red-500">{fmt(totalNoDetection)}</span>
                                </>
                              );
                            }
                            return <span className="text-muted-foreground">—</span>;
                          })()}
                        </td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Total Strategy Evaluations <span className="text-xs text-muted-foreground">(since process start — in-memory, resets on PM2 restart)</span></td>
                        <td className="p-2 text-right">{fmt((ve as any).quantStrategyEvaluations ?? 0)}</td>
                        <td className="p-2 text-right">{fmt((ve as any).patternStrategyEvaluations ?? 0)}</td>
                        <td className="p-2 text-right font-semibold">{fmt(ve.totalStrategyEvaluations)}</td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">True Strategy Nulls <span className="text-xs text-muted-foreground">(since process start — no setup found, excludes post-signal rejections)</span></td>
                        <td className="p-2 text-right text-orange-500">{fmt(ve.quantStrategyNulls)}</td>
                        <td className="p-2 text-right text-orange-500">{fmt((ve as any).patternStrategyNulls ?? 0)}</td>
                        <td className="p-2 text-right font-semibold text-orange-500">{fmt(ve.quantStrategyNulls + ((ve as any).patternStrategyNulls ?? 0))}</td>
                      </tr>
                      <tr className="border-b hover:bg-muted/30">
                        <td className="p-2">Signals Rejected (Net EV Below Floor) <span className="text-xs text-muted-foreground">(since process start — strategy fired but signal failed EV check)</span></td>
                        <td className="p-2 text-right text-red-500">{fmt((ve as any).quantSignalsRejected ?? 0)}</td>
                        <td className="p-2 text-right text-red-500">{fmt((ve as any).patternSignalsRejected ?? 0)}</td>
                        <td className="p-2 text-right font-semibold text-red-500">{fmt((ve as any).signalsRejected ?? 0)}</td>
                      </tr>
                      <tr className="bg-muted/30 font-semibold">
                        <td className="p-2">Trades Opened <span className="text-xs text-muted-foreground">(DB-backed, 24h rolling — scope differs from in-memory rows above)</span></td>
                        <td className="p-2 text-right text-green-600">{fmt(data?.tradesOpened24h?.quant ?? 0)}</td>
                        <td className="p-2 text-right text-green-600">{fmt(data?.tradesOpened24h?.pattern ?? 0)}</td>
                        <td className="p-2 text-right font-semibold text-green-600">{fmt(data?.tradesOpened24h?.total ?? 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* By Strategy Breakdown */}
                {Object.keys(ve.byStrategy).length > 0 && (
                  <div className="overflow-x-auto">
                    <div className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted/50">
                      By Strategy
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium">Strategy</th>
                          <th className="text-right p-2 font-medium">Evaluated</th>
                          <th className="text-right p-2 font-medium">True Nulls</th>
                          <th className="text-right p-2 font-medium">Null %</th>
                          <th className="text-right p-2 font-medium">Signals</th>
                          <th className="text-right p-2 font-medium">Rejected</th>
                          <th className="text-right p-2 font-medium">Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(ve.byStrategy)
                          .sort(([,a], [,b]) => b.evaluated - a.evaluated)
                          .map(([strategy, counts]) => (
                            <tr key={strategy} className="border-b hover:bg-muted/30">
                              <td className="p-2 font-mono text-xs">{strategy}</td>
                              <td className="p-2 text-right">{fmt(counts.evaluated)}</td>
                              <td className="p-2 text-right text-orange-500">{fmt(counts.nulls)}</td>
                              <td className="p-2 text-right text-muted-foreground">{counts.evaluated > 0 ? `${(counts.nulls / counts.evaluated * 100).toFixed(1)}%` : '—'}</td>
                              <td className="p-2 text-right text-blue-600">{fmt(counts.preRejectionSignals || 0)}</td>
                              <td className="p-2 text-right text-amber-600">{fmt(counts.rejected || 0)}</td>
                              <td className="p-2 text-right text-green-600">{fmt(counts.signals)}</td>
                            </tr>
                          ))
                        }
                        {/* Batch 22 HF4: Total row for by-strategy breakdown */}
                        {(() => {
                          const totals = Object.values(ve.byStrategy).reduce(
                            (acc, c: any) => ({
                              evaluated: acc.evaluated + c.evaluated,
                              nulls: acc.nulls + c.nulls,
                              preRejectionSignals: acc.preRejectionSignals + (c.preRejectionSignals || 0),
                              rejected: acc.rejected + (c.rejected || 0),
                              signals: acc.signals + c.signals
                            }),
                            { evaluated: 0, nulls: 0, preRejectionSignals: 0, rejected: 0, signals: 0 }
                          );
                          return (
                            <tr className="border-t-2 bg-muted/30 font-semibold">
                              <td className="p-2">TOTAL</td>
                              <td className="p-2 text-right">{fmt(totals.evaluated)}</td>
                              <td className="p-2 text-right text-orange-500">{fmt(totals.nulls)}</td>
                              <td className="p-2 text-right text-muted-foreground">{totals.evaluated > 0 ? `${(totals.nulls / totals.evaluated * 100).toFixed(1)}%` : '—'}</td>
                              <td className="p-2 text-right text-blue-600">{fmt(totals.preRejectionSignals)}</td>
                              <td className="p-2 text-right text-amber-600">{fmt(totals.rejected)}</td>
                              <td className="p-2 text-right text-green-600">{fmt(totals.signals)}</td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Batch 38: 3-Layer Null Reason Display */}
                {ve.nullReasons && (
                  <div className="overflow-x-auto">
                    {(() => {
                      const nr = ve.nullReasons as any;
                      const detail = (ve as any).nullReasonDetail as Record<string, number> | undefined;
                      const quantDetail = (ve as any).quantNullReasonDetail as Record<string, number> | undefined;
                      const patternDetail = (ve as any).patternNullReasonDetail as Record<string, number> | undefined;
                      const hasPoolDetail = !!(quantDetail && Object.keys(quantDetail).length > 0) || !!(patternDetail && Object.keys(patternDetail).length > 0);
                      const rejectedReasons = (ve as any).rejectedReasons as Record<string, number> | undefined;
                      const totalStratNulls = ve.quantStrategyNulls + ((ve as any).patternStrategyNulls ?? 0);
                      const totalEvals = ve.totalStrategyEvaluations || 1;
                      const quantEvals = (ve as any).quantStrategyEvaluations ?? 0;
                      const patternEvals = (ve as any).patternStrategyEvaluations ?? 0;
                      const pct = (n: number) => totalStratNulls > 0 ? Math.round(n / totalStratNulls * 100) : 0;
                      const poolFmt = (count: number, evals: number) => evals > 0 ? `${fmt(count)} / ${fmt(evals)}` : fmt(count);
                      const poolCell = (count: number, evals: number) => {
                        if (evals <= 0) return fmt(count);
                        const p = evals > 0 ? (count / evals * 100).toFixed(1) : '0.0';
                        return `${fmt(count)} / ${fmt(evals)} (${p}%)`;
                      };
                      const pctOfEvals = (n: number) => totalEvals > 0 ? Math.round(n / totalEvals * 100) : 0;
                      const reasonLabels: Record<string, string> = {
                        'unknown': 'Not Yet Instrumented',
                        'insufficient_data': 'Insufficient Price Data / Candles',
                        'no_pattern': 'No Pattern Detected',
                        'abcd_structure_not_found': 'ABCD Structure Not Found',
                        'weak_pattern': 'Pattern Too Weak (below strength threshold)',
                        'indicator_filter': 'Indicator Out of Range (RSI/ADX/momentum)',
                        'volume_insufficient': 'Volume Confirmation Failed',
                        'price_position': 'Price Not in Required Zone',
                        'guard_fail': 'ATR / Stop / R:R Guard Failed',
                        'range_not_found': 'No Valid Range / Support Level Found',
                        'correlation_fail': 'Correlation Check Failed',
                        'volatility_filter': 'Volatility Percentile Too Low',
                        'breakout_fail': 'No Breakout Detected',
                        'toxicity_high': 'High Toxicity (DHMA)',
                        'spread_wide': 'Spread Too Wide (DHMA)',
                        'regime_alignment': 'Regime Alignment Failed',
                      };
                      const groupDefs: { label: string; keys: string[] }[] = [
                        { label: 'A — Data & Setup', keys: ['insufficient_data', 'unknown'] },
                        { label: 'B — Pattern Detection', keys: ['no_pattern', 'abcd_structure_not_found', 'weak_pattern', 'breakout_fail'] },
                        { label: 'C — Indicator & Volatility', keys: ['indicator_filter', 'volatility_filter'] },
                        { label: 'D — Volume & Price', keys: ['volume_insufficient', 'price_position', 'range_not_found'] },
                        { label: 'E — Risk Guards', keys: ['guard_fail', 'correlation_fail'] },
                        { label: 'F — Regime & Spread', keys: ['regime_alignment', 'toxicity_high', 'spread_wide'] },
                      ];
                      const SectionHeader = ({ title, colorClass }: { title: string; colorClass: string }) => (
                        <div className={`border-l-4 pl-3 py-1.5 mx-2 my-1 ${colorClass}`}>
                          <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
                        </div>
                      );
                      return (
                        <>
                          {/* SECTION 1: Setup Nulls */}
                          <SectionHeader title="Setup Nulls (Strategy Evaluation)" colorClass="border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400" />
                          <table className="w-full text-sm mb-2">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left p-2 font-medium">Category</th>
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Quant (nulls / evals)</th>}
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Pattern (nulls / evals)</th>}
                                <th className="text-right p-2 font-medium">{hasPoolDetail ? 'Total' : 'Count'}</th>
                                <th className="text-right p-2 font-medium">% of Strategy Nulls</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b hover:bg-muted/30 font-medium">
                                <td className="p-2">Strategy Conditions Not Met</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolFmt(ve.quantStrategyNulls ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolFmt((ve as any).patternStrategyNulls ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.conditionsNotMet ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.conditionsNotMet ?? 0)}%</td>
                              </tr>
                              {detail && Object.keys(detail).length > 0 && groupDefs.map(group => {
                                const groupEntries = group.keys
                                  .map(k => ({ key: k, count: detail[k] ?? 0 }))
                                  .filter(e => e.count > 0);
                                if (groupEntries.length === 0) return null;
                                return (
                                  <React.Fragment key={group.label}>
                                    <tr className="bg-muted/10">
                                      <td colSpan={hasPoolDetail ? 5 : 3} className="p-1.5 pl-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</td>
                                    </tr>
                                    {groupEntries.map(({ key, count }) => (
                                      <tr key={key} className="border-b hover:bg-muted/20">
                                        <td className="p-2 pl-10 text-xs text-muted-foreground">↳ {reasonLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                                        {hasPoolDetail && <td className="p-2 text-right text-xs text-orange-400">{poolCell(quantDetail?.[key] ?? 0, quantEvals)}</td>}
                                        {hasPoolDetail && <td className="p-2 text-right text-xs text-orange-400">{poolCell(patternDetail?.[key] ?? 0, patternEvals)}</td>}
                                        <td className="p-2 text-right text-xs text-orange-400">{fmt(count)}</td>
                                        <td className="p-2 text-right text-xs text-muted-foreground">{pct(count)}%</td>
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
                              <tr className="border-b hover:bg-muted/30 font-medium">
                                <td className="p-2">ADX Guard</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{fmt(nr.adxGuard ?? 0)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">—</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.adxGuard ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.adxGuard ?? 0)}%</td>
                              </tr>
                              {/* B-NEW-11 (2026-05-13): Section Total row — makes drift visible.
                                  Sums all displayed counts in this section + compares against
                                  totalStratNulls. >100% indicates a reason is being double-counted
                                  or a pre-eval skip leaked into the section; <100% indicates
                                  uncategorized nulls. */}
                              {(() => {
                                const sectionTotal =
                                  (nr.conditionsNotMet ?? 0) +
                                  (nr.adxGuard ?? 0) +
                                  groupDefs.flatMap(g => g.keys).reduce((s, k) => s + (detail?.[k] ?? 0), 0);
                                const sectionPct = totalStratNulls > 0 ? Math.round(sectionTotal / totalStratNulls * 100) : 0;
                                const driftWarn = sectionPct > 100 || (totalStratNulls > 0 && sectionPct < 95);
                                return (
                                  <tr className={`border-t-2 ${driftWarn ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20' : 'border-blue-500/30 bg-blue-50/20 dark:bg-blue-950/10'} font-semibold`}>
                                    <td className="p-2">Section Total <span className="text-[10px] text-muted-foreground">(sum of all rows above)</span></td>
                                    {hasPoolDetail && <td className="p-2 text-right">—</td>}
                                    {hasPoolDetail && <td className="p-2 text-right">—</td>}
                                    <td className="p-2 text-right">{fmt(sectionTotal)}</td>
                                    <td className={`p-2 text-right ${driftWarn ? 'text-amber-600 dark:text-amber-400' : ''}`}>{sectionPct}%{driftWarn && <span className="ml-1 text-[10px]">⚠</span>}</td>
                                  </tr>
                                );
                              })()}
                            </tbody>
                          </table>

                          {/* SECTION 2: Pre-Evaluation Skips (pair skipped before strategy.detect() called) */}
                          <SectionHeader title="Pre-Evaluation Skips" colorClass="border-yellow-500 bg-yellow-50/40 dark:bg-yellow-950/20 text-yellow-700 dark:text-yellow-400" />
                          <table className="w-full text-sm mb-2">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left p-2 font-medium">Category</th>
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Quant (nulls / evals)</th>}
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Pattern (nulls / evals)</th>}
                                <th className="text-right p-2 font-medium">{hasPoolDetail ? 'Total' : 'Count'}</th>
                                <th className="text-right p-2 font-medium">% of Strategy Nulls</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Duplicate Position</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['duplicate_position'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['duplicate_position'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.duplicatePosition ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.duplicatePosition ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Max Open Trades</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['max_open_trades'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['max_open_trades'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.maxOpenTrades ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.maxOpenTrades ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Regime Has No Strategies</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['regime_no_strategies'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['regime_no_strategies'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.regimeNoStrategies ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.regimeNoStrategies ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Family Filter Mismatch</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['family_filter_mismatch'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['family_filter_mismatch'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.familyFilterMismatch ?? 0)}</td>
                                {/* B-NEW-12 (RUNNING_ISSUES #101): family_filter_mismatch is a
                                    pre-eval skip — fires BEFORE strategy.detect(), so it's not
                                    counted in totalStratNulls. Use the correct denominator
                                    emitted by the endpoint: familyMismatchDenominatorTotal =
                                    strategiesEvaluated (eligibility-pass) + family_filter_mismatch
                                    (eligibility-fail). Was showing 158%/177% before this fix. */}
                                {/* W-8c: an ABSENT denominator used to render '0%' — a confident
                                    figure from a missing input (measured live: 24,227 → "0%").
                                    Absent now renders an honest em-dash. */}
                                <td className="p-2 text-right">{(() => {
                                  const denom = (ve as any).familyMismatchDenominatorTotal ?? 0;
                                  const num = nr.familyFilterMismatch ?? 0;
                                  return denom > 0 ? `${Math.round(num / denom * 100)}%` : <span title="denominator not surfaced by this endpoint">—</span>;
                                })()}</td>
                              </tr>
                              {/* B-DIAG-387 (#387) OBJ-2 (no-hidden-gates): the three pre-open
                                  gate reasons checkPreOpenGates can emit that previously rendered
                                  nowhere. Guarded `?? 0` so the shared panel renders 0 harmlessly
                                  for any class whose endpoint doesn't (yet) surface them. */}
                              {/* B-FILTER-DIAG-PAPER W-8b: the Total cell used to read `nr.<camel>`
                                  — a DIFFERENT object than the lane cells' detail maps — and those
                                  three nr fields never populate, so Total rendered 0 beside nonzero
                                  lanes (measured live: Price Past Target 438/68/0). Total now falls
                                  back to the lane sum FROM THE SAME PAYLOAD when nr is absent/zero.
                                  (The Section-Total 106% ⚠ above is NOT part of this fix — that row
                                  is the B-NEW-11 drift DETECTOR working as designed; the double-count
                                  it is flagging is a separate server-side taxonomy finding.) */}
                              {([
                                ['Re-entry Cooldown', 'reentry_cooldown', nr.reentryCooldown],
                                ['Price Past Stop (entry no longer viable)', 'price_past_stop', nr.pricePastStop],
                                ['Price Past Target (entry no longer viable)', 'price_past_target', nr.pricePastTarget],
                              ] as const).map(([label, key, nrVal]) => {
                                const laneSum = (quantDetail?.[key] ?? 0) + (patternDetail?.[key] ?? 0);
                                const total = (nrVal ?? 0) > 0 ? (nrVal as number) : laneSum;
                                return (
                                  <tr key={key} className="border-b hover:bg-muted/30">
                                    <td className="p-2">{label}</td>
                                    {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.[key] ?? 0, quantEvals)}</td>}
                                    {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.[key] ?? 0, patternEvals)}</td>}
                                    <td className="p-2 text-right text-orange-500">{fmt(total)}</td>
                                    <td className="p-2 text-right">{pct(total)}%</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* SECTION 3: Post-Signal Rejections (signal WAS produced, then rejected) */}
                          <SectionHeader title="Post-Signal Rejections (strategy fired, trade blocked)" colorClass="border-red-500 bg-red-50/40 dark:bg-red-950/20 text-red-700 dark:text-red-400" />
                          <table className="w-full text-sm mb-2">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-left p-2 font-medium">Category</th>
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Quant (nulls / evals)</th>}
                                {hasPoolDetail && <th className="text-right p-2 font-medium">Pattern (nulls / evals)</th>}
                                <th className="text-right p-2 font-medium">{hasPoolDetail ? 'Total' : 'Count'}</th>
                                <th className="text-right p-2 font-medium">% of Evaluations</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Net EV Below Floor</td>
                                {hasPoolDetail && <td className="p-2 text-right text-red-500">{poolCell(quantDetail?.['net_ev_rejected'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-red-500">{poolCell(patternDetail?.['net_ev_rejected'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-red-500">{fmt(rejectedReasons?.netEvBelowFloor ?? 0)}</td>
                                <td className="p-2 text-right">{pctOfEvals(rejectedReasons?.netEvBelowFloor ?? 0)}%</td>
                              </tr>
                            </tbody>
                          </table>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="p-4 text-muted-foreground text-center">No VTS evaluation data yet — waiting for next VTS cycle</div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Batch 50: Removed redundant "Signal Rejection Breakdown (24h)" section.
         Post-signal rejections are now shown in the VTS Evaluation Breakdown above
         with accurate counts from VTS counters. The old section used a separate
         logSkippedSignal tracker with conflicting numbers. */}
      {/* Batch 52: Cooldown Exclusions card REMOVED (Kyle directive 2026-04-06)
         PairFailureTracker cooldown was redundant — batch size fixed at ~300/cycle
         regardless. Adaptive ratio manager handles pair selection. */}

      {/* Batch 34: Metric Distribution — moved to bottom, redesigned with plain language */}
      {(data?.lastScan as any)?.metricDistribution && (
        <Card className="max-w-4xl">
          <CardHeader className="py-3">
            <CardTitle className="text-lg">Filter Metric Ranges (Last Scan — updates each 30s cycle)</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Shows the spread of metric values across pairs that survived global filters. Helps assess whether thresholds are calibrated correctly — if the threshold sits in the middle of the range, it is actively filtering; if all values are well above/below the threshold, the filter is not doing meaningful work.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              {(() => {
                const dist = (data?.lastScan as any).metricDistribution;
                const hasPools = dist?.quant && dist?.pattern;
                const sections = hasPools
                  ? [
                      { label: 'Quant Pool', data: dist.quant, pools: ['lq', 'di'] },
                      { label: 'Pattern Pool', data: dist.pattern, pools: ['lq', 'di'] },
                    ]
                  : [{ label: 'All Survivors', data: dist?.combined || dist, pools: ['lq', 'di', 'vn'] }];

                return sections.map((section) => (
                  <div key={section.label} className="mb-4">
                    <div className="px-2 py-1 bg-muted/30 font-medium text-sm">{section.label}</div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Metric</th>
                          <th className="text-right p-2 font-medium">Lowest</th>
                          <th className="text-right p-2 font-medium">25th %ile</th>
                          <th className="text-right p-2 font-medium">Middle Value</th>
                          <th className="text-right p-2 font-medium">75th %ile</th>
                          <th className="text-right p-2 font-medium">Highest</th>
                          <th className="text-right p-2 font-medium">Pairs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.pools.map((key) => {
                          const d = section.data?.[key];
                          if (!d || d.count === 0) return null;
                          const labels: Record<string, string> = {
                            lq: 'Liquidity Quality (higher = more liquid)',
                            di: 'Directional Integrity (higher = stronger trend)',
                            vn: 'Volume Noise (lower = cleaner volume)',
                          };
                          return (
                            <tr key={key} className="border-b hover:bg-muted/30">
                              <td className="p-2 font-medium">{labels[key] || key}</td>
                              <td className="p-2 text-right">{d.min}</td>
                              <td className="p-2 text-right">{d.p25}</td>
                              <td className="p-2 text-right font-semibold">{d.median}</td>
                              <td className="p-2 text-right">{d.p75}</td>
                              <td className="p-2 text-right">{d.max}</td>
                              <td className="p-2 text-right text-muted-foreground">{d.count}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══ THE ONE STRUCTURAL DIFFERENCE (Kyle 2026-08-07) ══
          "The only difference is that paper and live mode will have added sections for the SQE and the
          RTB." The VTS has NO SQE, so these render on Paper/Live ONLY — not gated by a flag on a shared
          section, but genuinely absent from the VTS lane because the VTS pipeline has no such stage.
          ★ AND THIS IS WHERE NET-EV LIVES ON THIS PATH: the active path rejects on net expectancy INSIDE
          the SQE, so its Net-EV row belongs here — while the VTS tab keeps its Net-EV under Post-Signal
          Rejections above, because that is where the VTS actually applies it (`vts-runner.ts:4917`).
          Same metric, same label, different section — the pipeline's real shape, not a display choice. */}
      {isEnforce && modeTail && <ActiveSqeAndRtbSections modeTail={modeTail} assetClass={assetClass} />}

    </div>
  );
}
