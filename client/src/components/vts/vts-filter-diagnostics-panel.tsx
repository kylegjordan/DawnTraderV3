// P19-B8.1 (C1): FilterDiagnosticsPanel extracted verbatim from client/src/pages/machine-learning.tsx
// (pure extraction, zero behavior change).
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { FilterDiagnosticsData } from "./vts-shared";
import type { ActiveFunnelEnvelope } from "@shared/active-funnel-envelope";
import { gateAggregateColumns, type GateDisposition } from "./gate-columns";

/**
 * P19-B8.3 (OBJ-3c v1) — the mode's REAL active-path tail, from existing
 * sources only (/api/active-engine/pipeline-tail): pool population, RTB queue
 * depth, the rtb-metrics gate tallies, real opens. Honest zeros until B8.4;
 * a failed load renders an ERROR, never a silent blank (OBJ-8).
 */
function ActivePipelineTail({ mode }: { mode: 'paper' | 'live' }) {
  const q = useQuery<any>({
    queryKey: ['/api/active-engine/pipeline-tail', mode],
    queryFn: () => apiFetch(`/api/active-engine/pipeline-tail?mode=${mode}`),
    refetchInterval: 30000,
  });
  const d = q.data;
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>{mode === 'paper' ? 'Paper' : 'Live'}-Mode Pipeline Tail</span>
          <span className="text-xs font-normal text-muted-foreground">this mode's OWN thresholds & pipeline — zeros are honest until the switch-on (B8.4)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span>Couldn't load the pipeline tail — a data-feed failure, not zeros.</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => q.refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        ) : q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><span className="text-muted-foreground block text-xs">Active Pool ({mode})</span><span className="font-mono font-semibold">{d?.poolSize ?? '—'} pairs</span></div>
            <div><span className="text-muted-foreground block text-xs">Ready-to-Buy Queue</span><span className="font-mono font-semibold">{d?.rtbQueueDepth ?? '—'} signals</span></div>
            <div><span className="text-muted-foreground block text-xs">Gate: opened / blocked</span><span className="font-mono font-semibold">{d?.gate ? `${d.gate.openedTotal} / ${d.gate.blockedTotal}` : 'not available'}</span></div>
            <div><span className="text-muted-foreground block text-xs">Open Positions</span><span className="font-mono font-semibold">{d?.openPositionsCount ?? '—'}</span></div>
            {d?.gate && Object.keys(d.gate.blockedByReason ?? {}).length > 0 && (
              <div className="sm:col-span-2 lg:col-span-4 text-xs text-muted-foreground">
                Blocks by reason: {Object.entries(d.gate.blockedByReason).map(([r, c]) => `${r}: ${c}`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  title, subtitle, statusBadges, pairsLastScan, capacity, capacityNote,
  pairsScanned24h, pairsScanned24hNote, cyclesLabel, cadenceLabel, nextScanAtMs, isError, isLoading, onRetry, testId,
}: {
  title: string;
  subtitle?: string;
  statusBadges?: React.ReactNode;
  pairsLastScan: number | null | undefined;
  capacity: number | null | undefined;   // null → render `capacityNote` instead (never a drift-prone constant)
  capacityNote?: string;
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
            <div><span className="text-muted-foreground block text-xs">Pairs Scanned (last scan)</span><span className="font-mono font-semibold" data-testid="scanner-pairs-last">{_fmtNum(pairsLastScan)}</span></div>
            <div>
              <span className="text-muted-foreground block text-xs">Scanner Capacity</span>
              {capacity === null || capacity === undefined || capacity <= 0
                ? <span className="font-mono text-muted-foreground" title={capacityNote}>{capacityNote ?? '—'}</span>
                : <span className="font-mono font-semibold" data-testid="scanner-capacity">{_fmtNum(capacity)} max</span>}
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

/** P19-B8.4c — the dormant "awaiting activation" filter-breakdown section for the Paper/Live tabs.
 *  Both scanners run in every mode, but NO filters (global or IMF) are applied in Paper/Live (active trading
 *  is off) — so the filter breakdown is genuinely dormant here (Kyle 2026-07-08). Live filter data shows only
 *  on the two VTS tabs. Never a bare 0 (MUST-2). */
function DormantFilterBreakdown({ modeTail }: { modeTail: 'paper' | 'live' }) {
  return (
    <Card data-testid="fd-filter-breakdown-dormant">
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between gap-2">
          <span>Global &amp; family filter breakdown</span>
          <span className="text-xs font-normal text-muted-foreground">why pairs were filtered out</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
          Awaiting activation — the {modeTail} pipeline scans continuously, but no filters (global or family/IMF)
          are applied in {modeTail} mode until active trading turns on (B8.5). Live filter data is on the Virtual
          Simulations tabs, where the full pipeline runs. This fills with real {modeTail} numbers at switch-on.
        </div>
      </CardContent>
    </Card>
  );
}

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
  const capacity = typeof l?.krakenUniverseSize === 'number' ? l.krakenUniverseSize : null;
  return (
    <ScannerCard
      testId="active-scanner-stage"
      title={`${modeLabel} Scanner`}
      subtitle="the shared FX5 scan — always running"
      pairsLastScan={ls?.totalPairsScanned}
      capacity={capacity}
      pairsScanned24h={r24?.totalPairsScanned}
      cyclesLabel={r24 && typeof r24.totalScans === 'number' ? `${r24.totalScans.toLocaleString()} cycles (24h)` : undefined}
      cadenceLabel={cadenceLabel}
      nextScanAtMs={nextScanAtMs}
      isError={false}
      isLoading={isLoading ?? false}
    />
  );
}

/**
 * P19-B8.4 Part-2 — the mode's active-path DOWNSTREAM funnel (Signal generation + pre-SQE / SQE per-gate /
 * RTB refresh), from the (mode, assetClass)-keyed `/api/active-engine/diagnostics/funnel`. WIRED but the
 * counters are DORMANT until active trading turns on (B8.5): while `status === 'dormant'` each stage renders
 * an explicit "awaiting activation" row — NEVER a bare 0 (MUST-2 dormant≠zero); once `'active'`, the real
 * per-stage breakdown renders. A failed load shows an ERROR, never a silent blank (OBJ-8).
 */
function ActiveDownstreamFunnel({ mode, assetClass }: { mode: 'paper' | 'live'; assetClass: 'crypto_spot' | 'xstock_spot' }) {
  const q = useQuery<ActiveFunnelEnvelope>({
    queryKey: ['/api/active-engine/diagnostics/funnel', mode],
    queryFn: () => apiFetch(`/api/active-engine/diagnostics/funnel?mode=${mode}`),
    refetchInterval: 30000,
  });
  const cls = q.data?.byAssetClass?.[assetClass];
  const isActive = cls?.status === 'active';
  const fmt = (n: number | undefined | null): string => (n === undefined || n === null ? '—' : n.toLocaleString());
  const rows = (o: Record<string, number> | undefined): [string, number][] =>
    Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]);
  const DORMANT_STAGES = [
    'Family strength filters (LQ / VN / DI)',
    'Signal generation + pre-SQE rejections',
    'SQE quality gates (per-gate screening)',
    'Ready-to-Buy refresh (refreshed / promoted / rejected)',
  ];
  const StageBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      {children}
    </div>
  );
  const KvRows = ({ data, empty }: { data: Record<string, number> | undefined; empty: string }) => {
    const r = rows(data);
    if (!r.length) return <div className="text-xs text-muted-foreground">{empty}</div>;
    return (
      <table className="w-full text-sm"><tbody>
        {r.map(([k, v]) => (
          <tr key={k} className="border-b hover:bg-muted/30"><td className="p-1.5">{k}</td><td className="p-1.5 text-right font-mono">{fmt(v)}</td></tr>
        ))}
      </tbody></table>
    );
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Downstream Pipeline{isActive ? '' : ' — awaiting activation'}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {isActive ? `live ${mode} active-path counts${q.data?.startedAt ? ` · since ${new Date(q.data.startedAt).toLocaleString()}` : ''}` : 'wired — fills when active trading turns on (B8.5)'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span>Couldn't load the active-path funnel — a data-feed failure, not zeros.</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => q.refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        ) : !isActive ? (
          <div className="space-y-2 text-sm">
            {DORMANT_STAGES.map((label) => (
              <div key={label} className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2" data-testid="fd-downstream-dormant">
                <span>{label}</span>
                <span className="text-xs text-muted-foreground">awaiting activation — populates at switch-on (B8.5)</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4" data-testid="fd-downstream-active">
            {/* Upstream, pre-generation: strategies the family filter excluded BEFORE any signal was built —
                NOT a subset of "signals generated", so it renders as its own stage above the funnel. */}
            <StageBlock title="Strategy attrition (family filter — before signal generation, upstream of the funnel)">
              <KvRows data={cls?.strategyAttrition} empty="No strategies filtered out in this window." />
            </StageBlock>
            <StageBlock title={`Signal generation + pre-SQE rejections — ${fmt(cls?.signalsGenerated)} signals generated`}>
              <KvRows data={cls?.preSqeRejects} empty="No pre-SQE rejections in this window." />
            </StageBlock>
            <StageBlock title={`SQE quality gates — ${fmt(cls?.sqePassed)} passed / ${fmt(cls?.sqeEvaluated)} evaluated`}>
              <KvRows data={cls?.sqeGateRejects} empty="No SQE gate rejections in this window." />
            </StageBlock>
            <StageBlock title="Post-SQE rejections (passed SQE, dropped before Ready-to-Buy)">
              <KvRows data={cls?.postSqeRejects} empty="No post-SQE rejections in this window." />
            </StageBlock>
            <StageBlock title="Ready-to-Buy refresh">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-sm">
                <div><span className="text-muted-foreground block text-xs">Cycles</span><span className="font-mono font-semibold">{fmt(cls?.rtbRefresh.cyclesRun)}</span></div>
                <div><span className="text-muted-foreground block text-xs">Refreshed</span><span className="font-mono font-semibold">{fmt(cls?.rtbRefresh.refreshedAttempted)}</span></div>
                <div><span className="text-muted-foreground block text-xs">Reconfirmed</span><span className="font-mono font-semibold text-green-600">{fmt(cls?.rtbRefresh.reconfirmed)}</span></div>
                <div><span className="text-muted-foreground block text-xs">Rejected (re-SQE)</span><span className="font-mono font-semibold text-red-500">{fmt(cls?.rtbRefresh.rejectedInRefresh)}</span></div>
                <div><span className="text-muted-foreground block text-xs">Promoted</span><span className="font-mono font-semibold">{fmt(cls?.rtbRefresh.promoted)}</span></div>
              </div>
              {/* MUST-4: the two SQE-attempt phases are TWO labelled numbers, never a silent sum. */}
              <div className="mt-2 text-xs text-muted-foreground">
                SQE evaluations (honest double-count): <span className="font-mono">{fmt(cls?.sqeAttempts.atGeneration)}</span> at generation ·
                {' '}<span className="font-mono">{fmt(cls?.sqeAttempts.atRefresh)}</span> during RTB refresh — counted separately, not summed.
              </div>
            </StageBlock>
          </div>
        )}
      </CardContent>
    </Card>
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
  // (ActiveScannerStage + ActivePipelineTail self-fetch the active-engine endpoints), and
  // it SUPERSEDES the interim inline `gateDisposition === 'enforce'` conditionals in the
  // VTS ('tag') render path below (B8.3b) — those are now unreachable on Paper/Live and
  // get swept when Part 2 wires the funnel counters into the dormant block here.
  if (gateDisposition === 'enforce' && modeTail) {
    const modeLabel = modeTail === 'paper' ? 'Paper' : 'Live';
    const isXstock = assetClass === 'xstock_spot';
    // Crypto's scanner stage is ActiveScannerStage (below). xStock's is the ScannerCycleHeader
    // rendered by xstocks-tab ABOVE this panel — so the banner points "above" for xStock.
    const scannerRef = isXstock ? 'the scanner metrics above are' : 'the scanner stage below is';
    return (
      <div className="space-y-4 max-w-4xl" data-testid="fd-enforce-panel">
        <div className="rounded-md border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-xs text-muted-foreground" data-testid="shared-scanner-banner">
          {modeLabel} mode: {scannerRef} this mode's OWN scan (its {modeTail} thresholds), live now even though active trading is off. Everything downstream — family strength filters, signal generation, the SQE quality gates, and Ready-to-Buy refresh — is wired but DORMANT; it fills with real data when {modeTail} trading turns on (B8.5).
        </div>
        {/* Crypto scanner card only — xStock's scanner card is its own ScannerCycleHeader
            above this panel. Live throughput from the shared-scanner `data` feed; capacity + countdown from
            the mode-keyed scan-latest (self-fetched inside the component). */}
        {!isXstock && <ActiveScannerStage mode={modeTail} data={data} isLoading={isLoading} />}
        {/* P19-B8.4c: the filter breakdown is DORMANT on Paper/Live (both classes) — the scan runs but no
            filters (global or family/IMF) are applied until switch-on; live filter data is on the VTS tabs. */}
        <DormantFilterBreakdown modeTail={modeTail} />
        {/* Downstream funnel — WIRED to the active-funnel endpoint; DORMANT ("awaiting activation",
            never 0 — MUST-2) until the writers land (B8.4b) + active trading turns on (B8.5). */}
        <ActiveDownstreamFunnel mode={modeTail} assetClass={assetClass} />
        <ActivePipelineTail mode={modeTail} />
      </div>
    );
  }

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
    <div className="space-y-4 max-w-4xl">
      {/* P19-B8.4c: the crypto VTS lean scanner card at the top (crypto's scanner card lives in this panel;
          xStock's is xstocks-tab's ScannerCycleHeader above the panel — so this is crypto-only here). Scan
          counts come from the vts-diagnostics feed; the universe CAPACITY is not carried by that feed yet, so
          it renders "not in VTS feed yet" rather than a drift-prone client constant (Langston Step-4 cond-1;
          RUNNING_ISSUES #421 → home a real universe field in the VTS feed). Next-scan from the fixed 30s FX5
          cadence + last-scan time, clamped in the card. */}
      {assetClass === 'crypto_spot' && (
        <ScannerCard
          testId="vts-crypto-scanner"
          title="Crypto Scanner (VTS)"
          subtitle="the shared FX5 scan — always running"
          pairsLastScan={lastScan?.totalPairsScanned}
          capacity={null}
          capacityNote="not in VTS feed yet"
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
      {/* Batch 42: Pipeline Summary Table — 24h aggregated */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg">Pipeline Summary (24h)
            {rolling24h && <span className="text-xs font-normal text-muted-foreground ml-2">{fmt(rolling24h.totalScans)} scans · {fmt(rolling24h.totalPairsScanned)} pair evaluations · {fmt(rolling24h.uniquePairsScanned)} unique</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
              <table className="w-full text-sm">
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

      {/* TABLE 1: Last Scan Stats */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Last Scan — Filter Breakdown</span>
            <span className="text-sm font-normal text-muted-foreground">
              {lastScan ? `${new Date(lastScan.timestamp).toLocaleTimeString()} · ${lastScan.mode} · ${lastScan.totalPairsScanned} pairs scanned` : 'No scan data'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lastScan ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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

      {/* TABLE 2: 24-Hour Rolling Aggregates */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-lg flex items-center justify-between">
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
              <table className="w-full text-sm">
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
                  {/* P19-B8.3b (OBJ-1, #417): the 24h VTS Evaluation block is the
                      VTS RUNNER's downstream counters (pair-pool → strategy evals →
                      nulls → trades opened) — VTS-engine activity, not the shared
                      scan feed. Gated to the VTS page ('tag'); on Paper/Live the
                      active pipeline is dormant until B8.4 (placeholder below). */}
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

      {/* P19-B8.3 (OBJ-3c): the mode's REAL pipeline tail on Paper/Live — from
          existing sources only (pool population, RTB queue depth, gate tallies,
          real opens); honest zeros until the B8.4 switch-on. */}
      {gateDisposition === 'enforce' && modeTail && <ActivePipelineTail mode={modeTail} />}

      {/* TABLE 4: VTS Evaluation Detail (Batch 19I) — expanded breakdown.
          P19-B8.3 (OBJ-3c): renders ONLY on the VTS page ('tag'). */}
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
                                <td className="p-2 text-right">{(() => {
                                  const denom = (ve as any).familyMismatchDenominatorTotal ?? 0;
                                  const num = nr.familyFilterMismatch ?? 0;
                                  return denom > 0 ? `${Math.round(num / denom * 100)}%` : '0%';
                                })()}</td>
                              </tr>
                              {/* B-DIAG-387 (#387) OBJ-2 (no-hidden-gates): the three pre-open
                                  gate reasons checkPreOpenGates can emit that previously rendered
                                  nowhere. Guarded `?? 0` so the shared panel renders 0 harmlessly
                                  for any class whose endpoint doesn't (yet) surface them. */}
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Re-entry Cooldown</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['reentry_cooldown'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['reentry_cooldown'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.reentryCooldown ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.reentryCooldown ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Price Past Stop (entry no longer viable)</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['price_past_stop'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['price_past_stop'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.pricePastStop ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.pricePastStop ?? 0)}%</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/30">
                                <td className="p-2">Price Past Target (entry no longer viable)</td>
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(quantDetail?.['price_past_target'] ?? 0, quantEvals)}</td>}
                                {hasPoolDetail && <td className="p-2 text-right text-orange-500">{poolCell(patternDetail?.['price_past_target'] ?? 0, patternEvals)}</td>}
                                <td className="p-2 text-right text-orange-500">{fmt(nr.pricePastTarget ?? 0)}</td>
                                <td className="p-2 text-right">{pct(nr.pricePastTarget ?? 0)}%</td>
                              </tr>
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

    </div>
  );
}
