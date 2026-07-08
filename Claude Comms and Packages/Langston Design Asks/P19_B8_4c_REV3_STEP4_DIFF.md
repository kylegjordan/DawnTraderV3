# P19-B8.4c REV-3 — Step-4 diff (CC-B → Langston)

change-class: non_architecture (display + read-only server telemetry surfacing; no logic/threshold/regime/math change)

Bench: tsc baseline OK (no regressions); vitest 2224 passed, 9 failing files all DB-integration (need live Supabase — bench profile, none touch this diff).

## What changed (OBJ-6..10)
- OBJ-6 server foundation: surfaced read-only `scanTargetPerCycle`(300)+`krakenUniverseSize`(live) onto crypto ScanDiagnostics (flows via vts route's whole lastScan); `cycleBatchSize`(75) onto xStock ScannerDiagnostics + xStock route. Resolves #421 (crypto universe now in VTS feed).
- OBJ-6 client: ScannerCard 5→6 fields — Per-Cycle Target + Total Universe split (was mislabeled 'Scanner Capacity'). All 4 scanner instances updated.
- OBJ-7: SHARED_DIAG_WIDTH (max-w-5xl) on all six tabs incl. wrapping the xStock scanner (was full-bleed).
- OBJ-8: DormantPipelineTables — 3 dormant skeleton tables mirroring VTS (Pipeline Summary→Last Scan→24h Rolling), 'awaiting activation' never bare-0; REPLACES DormantFilterBreakdown+ActiveDownstreamFunnel+ActivePipelineTail in the enforce path.
- OBJ-9: DiagTableCard + DIAG_TABLE_THEMES — per-table distinct border color + filled bold header (blue/purple/teal), applied to the 3 live VTS tables + the 3 dormant tables.
- OBJ-10: per-table overflow-x-auto container + FROZEN_FIRST_COL_TABLE (Tailwind arbitrary-variant sticky first column) on all pipeline tables.

NOTE for your review: ActiveDownstreamFunnel + ActivePipelineTail are no longer rendered on the enforce path (superseded by DormantPipelineTables). The B8.4b active-funnel WRITERS persist server-side; re-wiring these dormant tables to the live per-mode counts is scheduled as B8.5 (the switch-on). Flag if you'd rather I delete the now-unrendered components this batch vs. carry them to B8.5.

```diff
diff --git a/client/src/components/machine-learning/xstocks-tab.tsx b/client/src/components/machine-learning/xstocks-tab.tsx
index 37ce5ca64..579732726 100644
--- a/client/src/components/machine-learning/xstocks-tab.tsx
+++ b/client/src/components/machine-learning/xstocks-tab.tsx
@@ -42,7 +42,7 @@ import { Activity, Wifi, WifiOff, AlertCircle } from "lucide-react";
 import { apiFetch } from "@/lib/api";
 import { format } from "date-fns";
 // P19-B8.1 (C1): panel + type now live in the extracted VTS component (was @/pages/machine-learning).
-import { FilterDiagnosticsPanel, ScannerCard, type FilterDiagnosticsData } from "@/components/vts/vts-filter-diagnostics-panel";
+import { FilterDiagnosticsPanel, ScannerCard, SHARED_DIAG_WIDTH, type FilterDiagnosticsData } from "@/components/vts/vts-filter-diagnostics-panel";
 import { FactorCalibrationSection, ExitStrategyAblationSection } from "@/pages/analytics";
 
 // ---------------------------------------------------------------------------
@@ -58,6 +58,7 @@ interface XstocksFilterDiagnostics extends FilterDiagnosticsData {
     cyclesCompleted: number;
     cyclesSkippedMarketClosed: number;
     lastUniverseSize: number;
+    cycleBatchSize?: number; // P19-B8.4c: per-cycle scan target (75)
     lastArcaOpen: boolean;
     pairsScannedLastCycle: number;
     pairsFreshLastCycle: number;
@@ -137,7 +138,8 @@ function ScannerCycleHeader({ data, isLoading }: { data: XstocksFilterDiagnostic
         subtitle={arcaOpen ? "always running (ARCA open)" : "extended-hours only (ARCA closed)"}
         statusBadges={badges}
         pairsLastScan={s?.pairsScannedLastCycle}
-        capacity={s?.lastUniverseSize}
+        perCycleTarget={s?.cycleBatchSize ?? null}
+        totalUniverse={s?.lastUniverseSize}
         pairsScanned24h={s?.rolling24hApproxPairsScanned}
         cyclesLabel={s ? `${s.rolling24hApproxCycles.toLocaleString()} cycles (24h)` : undefined}
         cadenceLabel="every 30s"
@@ -278,16 +280,21 @@ export function XstocksTab({ gateDisposition = 'tag', modeTail = null }: {
           and quant strategies are not family-routed. The diagnostic panels
           will show this honestly until those land. */}
 
-      {/* 1. Scanner Cycle Header (xstock-specific) */}
-      <ScannerCycleHeader data={filterData} isLoading={filterLoading} />
+      {/* 1. Scanner Cycle Header (xstock-specific). P19-B8.4c REV-3 (OBJ-7): bound to the SAME shared width as
+          the pipeline tables inside the panel, so the xStock scanner card no longer spans full-bleed — it
+          lines up with the tables, consistent with the crypto tabs. */}
+      <div className={SHARED_DIAG_WIDTH}>
+        <ScannerCycleHeader data={filterData} isLoading={filterLoading} />
+      </div>
 
       {/* Per-Pair Fresh-Tick Latency panel REMOVED per Kyle directive 2026-05-12.
           The freshnessData query is still issued for the scanner-cycle header
           tooltip; if removing the query is desired in a future cleanup, drop
           the useQuery call + freshnessData/freshnessLoading variables too. */}
 
-      {/* 2. Filter Diagnostics — REUSED from crypto, scoped to xstock_spot */}
-      <Card data-testid="xstocks-filter-diagnostics-section">
+      {/* 2. Filter Diagnostics — REUSED from crypto, scoped to xstock_spot. P19-B8.4c REV-3 (OBJ-7): bound the
+          section to the shared width so the xStock pipeline tables match the crypto tabs' width. */}
+      <Card data-testid="xstocks-filter-diagnostics-section" className={SHARED_DIAG_WIDTH}>
         <CardHeader>
           <CardTitle className="text-lg">Filter Pipeline Diagnostics (xstock_spot)</CardTitle>
           <p className="text-xs text-muted-foreground mt-1">
diff --git a/client/src/components/vts/vts-filter-diagnostics-panel.tsx b/client/src/components/vts/vts-filter-diagnostics-panel.tsx
index c91b7b176..763437bea 100644
--- a/client/src/components/vts/vts-filter-diagnostics-panel.tsx
+++ b/client/src/components/vts/vts-filter-diagnostics-panel.tsx
@@ -108,15 +108,19 @@ function useSecondTick(active: boolean): number {
  *  (target − now) go negative — show "scanning…" at/below 0, never a negative or wild timer.
  *  Matches the server `nextScanInMs` floor. */
 export function ScannerCard({
-  title, subtitle, statusBadges, pairsLastScan, capacity, capacityNote,
+  title, subtitle, statusBadges, pairsLastScan, perCycleTarget, totalUniverse, totalUniverseNote,
   pairsScanned24h, pairsScanned24hNote, cyclesLabel, cadenceLabel, nextScanAtMs, isError, isLoading, onRetry, testId,
 }: {
   title: string;
   subtitle?: string;
   statusBadges?: React.ReactNode;
   pairsLastScan: number | null | undefined;
-  capacity: number | null | undefined;   // null → render `capacityNote` instead (never a drift-prone constant)
-  capacityNote?: string;
+  // P19-B8.4c REV-3 (Kyle 2026-07-08): the old single "Scanner Capacity" was mislabeled (it showed the
+  // universe). Split into two honest fields: the per-cycle scan TARGET (crypto 300 / xStock 75 — a config
+  // constant surfaced read-only) and the live TOTAL UNIVERSE (crypto Kraken ~1,500 / xStock ~481).
+  perCycleTarget: number | null | undefined; // per-cycle scan target (300 / 75)
+  totalUniverse: number | null | undefined;  // live total universe; null → render `totalUniverseNote`
+  totalUniverseNote?: string;
   pairsScanned24h: number | null | undefined;
   pairsScanned24hNote?: string;            // when the 24h count is null, render this dormant note (never a bare 0)
   cyclesLabel?: string;                    // e.g. "1,266 cycles (24h)"
@@ -155,13 +159,19 @@ export function ScannerCard({
         ) : isLoading ? (
           <div className="text-sm text-muted-foreground">Loading the scanner…</div>
         ) : (
-          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
+          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 text-sm">
             <div><span className="text-muted-foreground block text-xs">Pairs Scanned (last scan)</span><span className="font-mono font-semibold" data-testid="scanner-pairs-last">{_fmtNum(pairsLastScan)}</span></div>
             <div>
-              <span className="text-muted-foreground block text-xs">Scanner Capacity</span>
-              {capacity === null || capacity === undefined || capacity <= 0
-                ? <span className="font-mono text-muted-foreground" title={capacityNote}>{capacityNote ?? '—'}</span>
-                : <span className="font-mono font-semibold" data-testid="scanner-capacity">{_fmtNum(capacity)} max</span>}
+              <span className="text-muted-foreground block text-xs" title="the number of pairs the scanner targets each scan cycle">Per-Cycle Target</span>
+              {perCycleTarget === null || perCycleTarget === undefined || perCycleTarget <= 0
+                ? <span className="font-mono text-muted-foreground">—</span>
+                : <span className="font-mono font-semibold" data-testid="scanner-per-cycle-target">{_fmtNum(perCycleTarget)}</span>}
+            </div>
+            <div>
+              <span className="text-muted-foreground block text-xs" title="the full tradable universe the scanner rotates through (live)">Total Universe</span>
+              {totalUniverse === null || totalUniverse === undefined || totalUniverse <= 0
+                ? <span className="font-mono text-muted-foreground" title={totalUniverseNote}>{totalUniverseNote ?? '—'}</span>
+                : <span className="font-mono font-semibold" data-testid="scanner-total-universe">{_fmtNum(totalUniverse)}</span>}
             </div>
             <div>
               <span className="text-muted-foreground block text-xs">Pairs Scanned (24h)</span>
@@ -178,30 +188,118 @@ export function ScannerCard({
   );
 }
 
-/** P19-B8.4c — the dormant "awaiting activation" filter-breakdown section for the Paper/Live tabs.
- *  Both scanners run in every mode, but NO filters (global or IMF) are applied in Paper/Live (active trading
- *  is off) — so the filter breakdown is genuinely dormant here (Kyle 2026-07-08). Live filter data shows only
- *  on the two VTS tabs. Never a bare 0 (MUST-2). */
-function DormantFilterBreakdown({ modeTail }: { modeTail: 'paper' | 'live' }) {
+// ── P19-B8.4c REV-3 — shared width + themed table wrapper (OBJ-7 / OBJ-9 / OBJ-10) ───────────────────────
+// OBJ-7: every Filter-Diagnostics tab (all six) mounts inside this ONE max-width so the scanner card and the
+// three pipeline tables share a single consistent width, bounded by the scanner card's rightmost column
+// ("Next Scan In"). Crypto used max-w-4xl; xStock ran full-bleed — now both use SHARED_DIAG_WIDTH.
+export const SHARED_DIAG_WIDTH = 'max-w-5xl';
+
+// OBJ-9: each of the three pipeline tables gets a DISTINCT border color, with the header bar filled that same
+// color and a bigger/bolder title. OBJ-10: the table body scrolls horizontally inside its OWN bounded
+// container (the page never scrolls sideways) and the first column is frozen (sticky) on the pipeline tables.
+const DIAG_TABLE_THEMES = {
+  summary:  { border: 'border-blue-500/70',   head: 'bg-blue-500/15' },
+  lastScan: { border: 'border-purple-500/70', head: 'bg-purple-500/15' },
+  rolling:  { border: 'border-teal-500/70',   head: 'bg-teal-500/15' },
+} as const;
+type DiagTableTheme = keyof typeof DIAG_TABLE_THEMES;
+
+/** OBJ-10 frozen-first-column class: sticky the stage/filter label so it stays visible while the numbers
+ *  scroll on a narrow (mobile) viewport. A solid bg occludes the cells scrolling underneath it. */
+export const STICKY_FIRST_COL = 'sticky left-0 z-10 bg-background';
+
+/** OBJ-10 — table-level frozen first column via Tailwind arbitrary variants: freezes every first cell (header
+ *  + body) in ONE class, so a wide live table's stage/filter label stays put while the numbers scroll. Applied
+ *  to the `<table>` element; a solid bg occludes scrolled content underneath the frozen column. */
+export const FROZEN_FIRST_COL_TABLE =
+  '[&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-muted ' +
+  '[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-background';
+
+/** P19-B8.4c REV-3 — the shared themed table shell: colored border + filled/bolded header bar (OBJ-9) and an
+ *  own horizontal-scroll container (OBJ-10). `children` is the raw <table>. */
+function DiagTableCard({ theme, title, subtitle, children, testId }: {
+  theme: DiagTableTheme;
+  title: React.ReactNode;
+  subtitle?: React.ReactNode;
+  children: React.ReactNode;
+  testId?: string;
+}) {
+  const t = DIAG_TABLE_THEMES[theme];
   return (
-    <Card data-testid="fd-filter-breakdown-dormant">
-      <CardHeader className="py-3">
-        <CardTitle className="text-lg flex items-center justify-between gap-2">
-          <span>Global &amp; family filter breakdown</span>
-          <span className="text-xs font-normal text-muted-foreground">why pairs were filtered out</span>
+    <Card className={`border-2 ${t.border} overflow-hidden`} data-testid={testId}>
+      <CardHeader className={`py-3 ${t.head} border-b-2 ${t.border}`}>
+        <CardTitle className="text-xl font-bold flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
+          <span>{title}</span>
+          {subtitle && <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>}
         </CardTitle>
       </CardHeader>
-      <CardContent>
-        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
-          Awaiting activation — the {modeTail} pipeline scans continuously, but no filters (global or family/IMF)
-          are applied in {modeTail} mode until active trading turns on (B8.5). Live filter data is on the Virtual
-          Simulations tabs, where the full pipeline runs. This fills with real {modeTail} numbers at switch-on.
-        </div>
+      <CardContent className="p-0">
+        <div className="overflow-x-auto">{children}</div>
       </CardContent>
     </Card>
   );
 }
 
+/** P19-B8.4c REV-3 (OBJ-8) — the Paper/Live pipeline view: the SAME three tables as the VTS tab (Pipeline
+ *  Summary → Last Scan → 24h Rolling Aggregates), in the same order + structure, but rendered DORMANT. Both
+ *  scanners run in every mode, yet NO filters (global or family/IMF) and NO signal generation happen in
+ *  Paper/Live until active trading turns on (B8.5) — so each table shows its real column skeleton with an
+ *  explicit "awaiting activation" body, NEVER a bare 0 (OBJ-5 honesty; Langston Step-1). This REPLACES the two
+ *  generic placeholders (the old DormantFilterBreakdown + the generic downstream-funnel block). The B8.4b
+ *  active-funnel WRITERS persist server-side; B8.5 wires these tables to the live per-mode counts. */
+function DormantPipelineTables({ modeTail }: { modeTail: 'paper' | 'live' }) {
+  const label = modeTail === 'paper' ? 'Paper' : 'Live';
+  const AwaitingRow = ({ span }: { span: number }) => (
+    <tr>
+      <td colSpan={span} className="p-0">
+        <div className="m-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground" data-testid="fd-dormant-awaiting">
+          Awaiting activation — the {modeTail} scanner runs continuously, but the {label.toLowerCase()} pipeline
+          applies no filters and generates no signals until active trading turns on (B8.5). Live pipeline data is
+          on the Virtual Simulations tab. This fills with real {label.toLowerCase()} numbers at switch-on.
+        </div>
+      </td>
+    </tr>
+  );
+  return (
+    <div className="space-y-4" data-testid="fd-dormant-pipeline-tables">
+      <DiagTableCard theme="summary" title="Pipeline Summary (24h)" subtitle={`${label} — awaiting activation (B8.5)`} testId="fd-dormant-summary">
+        <table className="w-full text-sm">
+          <thead><tr className={`border-b ${DIAG_TABLE_THEMES.summary.head}`}>
+            <th className={`text-left p-2 font-medium ${STICKY_FIRST_COL} ${DIAG_TABLE_THEMES.summary.head}`}>Stage</th>
+            <th className="text-right p-2 font-medium">Quant</th>
+            <th className="text-right p-2 font-medium">Pattern</th>
+            <th className="text-right p-2 font-medium">Total</th>
+            <th className="text-left p-2 font-medium text-muted-foreground text-xs">Counting Basis</th>
+          </tr></thead>
+          <tbody><AwaitingRow span={5} /></tbody>
+        </table>
+      </DiagTableCard>
+      <DiagTableCard theme="lastScan" title="Last Scan — Filter Breakdown" subtitle={`${label} — awaiting activation (B8.5)`} testId="fd-dormant-lastscan">
+        <table className="w-full text-sm">
+          <thead><tr className={`border-b ${DIAG_TABLE_THEMES.lastScan.head}`}>
+            <th className={`text-left p-2 font-medium ${STICKY_FIRST_COL} ${DIAG_TABLE_THEMES.lastScan.head}`}>Filter</th>
+            <th className="text-right p-2 font-medium">Quant Global</th>
+            <th className="text-right p-2 font-medium">Pattern Global</th>
+            <th className="text-right p-2 font-medium">Total</th>
+          </tr></thead>
+          <tbody><AwaitingRow span={4} /></tbody>
+        </table>
+      </DiagTableCard>
+      <DiagTableCard theme="rolling" title="24-Hour Rolling Aggregates" subtitle={`${label} — awaiting activation (B8.5)`} testId="fd-dormant-rolling">
+        <table className="w-full text-sm">
+          <thead><tr className={`border-b ${DIAG_TABLE_THEMES.rolling.head}`}>
+            <th className={`text-left p-2 font-medium ${STICKY_FIRST_COL} ${DIAG_TABLE_THEMES.rolling.head}`}>Filter</th>
+            <th className="text-right p-2 font-medium">Quant</th>
+            <th className="text-right p-2 font-medium">Pattern</th>
+            <th className="text-right p-2 font-medium">Total</th>
+          </tr></thead>
+          <tbody><AwaitingRow span={4} /></tbody>
+        </table>
+      </DiagTableCard>
+    </div>
+  );
+}
+
 // P19-B8.4c: the crypto Paper/Live LEAN scanner card. ★ B8.4c Step-4 fix (Langston MUST-2): the crypto FX5
 // scanner is ONE shared scanner (mode-multiplexed) that always runs, so its live scan THROUGHPUT (last-scan +
 // 24h pairs) is the shared scanner's — identical on all crypto tabs — read from the vts-diagnostics `data` prop
@@ -226,14 +324,21 @@ function ActiveScannerStage({ mode, data, isLoading }: { mode: 'paper' | 'live';
   const nextScanAtMs = l && typeof l.nextScanInMs === 'number'
     ? (latest.dataUpdatedAt || Date.now()) + l.nextScanInMs : null;
   const cadenceLabel = l?.cycleFrequencyMs ? `every ${Math.round(l.cycleFrequencyMs / 1000)}s` : undefined;
-  const capacity = typeof l?.krakenUniverseSize === 'number' ? l.krakenUniverseSize : null;
+  // P19-B8.4c REV-3: Per-Cycle Target (300) + live Total Universe both now ride the shared vts `data.lastScan`
+  // feed (scanTargetPerCycle + krakenUniverseSize surfaced read-only, same source as the count) — consistent
+  // with the VTS tab, so all three crypto tabs read one place. scan-latest is now ONLY countdown + cadence.
+  const perCycleTarget = typeof ls?.scanTargetPerCycle === 'number' ? ls.scanTargetPerCycle
+    : (typeof l?.scanTargetPerCycle === 'number' ? l.scanTargetPerCycle : null);
+  const totalUniverse = typeof ls?.krakenUniverseSize === 'number' ? ls.krakenUniverseSize
+    : (typeof l?.krakenUniverseSize === 'number' ? l.krakenUniverseSize : null);
   return (
     <ScannerCard
       testId="active-scanner-stage"
       title={`${modeLabel} Scanner`}
       subtitle="the shared FX5 scan — always running"
       pairsLastScan={ls?.totalPairsScanned}
-      capacity={capacity}
+      perCycleTarget={perCycleTarget}
+      totalUniverse={totalUniverse}
       pairsScanned24h={r24?.totalPairsScanned}
       cyclesLabel={r24 && typeof r24.totalScans === 'number' ? `${r24.totalScans.toLocaleString()} cycles (24h)` : undefined}
       cadenceLabel={cadenceLabel}
@@ -396,21 +501,20 @@ export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag
     // rendered by xstocks-tab ABOVE this panel — so the banner points "above" for xStock.
     const scannerRef = isXstock ? 'the scanner metrics above are' : 'the scanner stage below is';
     return (
-      <div className="space-y-4 max-w-4xl" data-testid="fd-enforce-panel">
+      <div className={`space-y-4 ${SHARED_DIAG_WIDTH}`} data-testid="fd-enforce-panel">
         <div className="rounded-md border border-blue-400/40 bg-blue-500/10 px-3 py-2 text-xs text-muted-foreground" data-testid="shared-scanner-banner">
           {modeLabel} mode: {scannerRef} this mode's OWN scan (its {modeTail} thresholds), live now even though active trading is off. Everything downstream — family strength filters, signal generation, the SQE quality gates, and Ready-to-Buy refresh — is wired but DORMANT; it fills with real data when {modeTail} trading turns on (B8.5).
         </div>
         {/* Crypto scanner card only — xStock's scanner card is its own ScannerCycleHeader
-            above this panel. Live throughput from the shared-scanner `data` feed; capacity + countdown from
-            the mode-keyed scan-latest (self-fetched inside the component). */}
+            above this panel. Live throughput from the shared-scanner `data` feed; Per-Cycle Target + Total
+            Universe + countdown from the shared feed (self-fetched inside the component). */}
         {!isXstock && <ActiveScannerStage mode={modeTail} data={data} isLoading={isLoading} />}
-        {/* P19-B8.4c: the filter breakdown is DORMANT on Paper/Live (both classes) — the scan runs but no
-            filters (global or family/IMF) are applied until switch-on; live filter data is on the VTS tabs. */}
-        <DormantFilterBreakdown modeTail={modeTail} />
-        {/* Downstream funnel — WIRED to the active-funnel endpoint; DORMANT ("awaiting activation",
-            never 0 — MUST-2) until the writers land (B8.4b) + active trading turns on (B8.5). */}
-        <ActiveDownstreamFunnel mode={modeTail} assetClass={assetClass} />
-        <ActivePipelineTail mode={modeTail} />
+        {/* P19-B8.4c REV-3 (OBJ-8): Paper/Live MIRROR the VTS three-table structure, rendered dormant — this
+            REPLACES the old generic DormantFilterBreakdown + ActiveDownstreamFunnel + ActivePipelineTail
+            placeholders. Both scanners run, but no filters/signals happen in Paper/Live until switch-on (B8.5),
+            so the three tables show their real column skeleton with an explicit "awaiting activation" body
+            (never a bare 0 — OBJ-5). B8.5 wires these to the mode's live per-stage counts. */}
+        <DormantPipelineTables modeTail={modeTail} />
       </div>
     );
   }
@@ -477,21 +581,22 @@ export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag
   };
 
   return (
-    <div className="space-y-4 max-w-4xl">
-      {/* P19-B8.4c: the crypto VTS lean scanner card at the top (crypto's scanner card lives in this panel;
-          xStock's is xstocks-tab's ScannerCycleHeader above the panel — so this is crypto-only here). Scan
-          counts come from the vts-diagnostics feed; the universe CAPACITY is not carried by that feed yet, so
-          it renders "not in VTS feed yet" rather than a drift-prone client constant (Langston Step-4 cond-1;
-          RUNNING_ISSUES #421 → home a real universe field in the VTS feed). Next-scan from the fixed 30s FX5
-          cadence + last-scan time, clamped in the card. */}
+    <div className={`space-y-4 ${SHARED_DIAG_WIDTH}`}>
+      {/* P19-B8.4c REV-3: the crypto VTS lean scanner card at the top (crypto's scanner card lives in this
+          panel; xStock's is xstocks-tab's ScannerCycleHeader above the panel — so this is crypto-only here).
+          Scan counts + the Per-Cycle Target (300) + live Total Universe (krakenUniverseSize ~1,500) all come
+          from the vts-diagnostics `lastScan` feed — the universe is now surfaced there (RUNNING_ISSUES #421
+          RESOLVED, homed in B8.4c), replacing the old "not in VTS feed yet" note. Next-scan from the fixed 30s
+          FX5 cadence + last-scan time, clamped in the card. */}
       {assetClass === 'crypto_spot' && (
         <ScannerCard
           testId="vts-crypto-scanner"
           title="Crypto Scanner (VTS)"
           subtitle="the shared FX5 scan — always running"
           pairsLastScan={lastScan?.totalPairsScanned}
-          capacity={null}
-          capacityNote="not in VTS feed yet"
+          perCycleTarget={typeof (lastScan as any)?.scanTargetPerCycle === 'number' ? (lastScan as any).scanTargetPerCycle : null}
+          totalUniverse={typeof (lastScan as any)?.krakenUniverseSize === 'number' ? (lastScan as any).krakenUniverseSize : null}
+          totalUniverseNote="awaiting first scan"
           pairsScanned24h={rolling24h?.totalPairsScanned}
           cyclesLabel={rolling24h ? `${rolling24h.totalScans.toLocaleString()} cycles (24h)` : undefined}
           cadenceLabel="every 30s"
@@ -509,14 +614,15 @@ export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag
           {' '}Per-stage active-path funnel counters arrive in B8.3b.
         </div>
       )}
-      {/* Batch 42: Pipeline Summary Table — 24h aggregated */}
-      <Card>
-        <CardHeader className="py-3">
-          <CardTitle className="text-lg">Pipeline Summary (24h)
+      {/* Batch 42: Pipeline Summary Table — 24h aggregated. P19-B8.4c REV-3: summary theme (blue border +
+          filled header, OBJ-9) + own horizontal-scroll container with frozen first column (OBJ-10). */}
+      <Card className="border-2 border-blue-500/70 overflow-hidden">
+        <CardHeader className="py-3 bg-blue-500/15 border-b-2 border-blue-500/70">
+          <CardTitle className="text-xl font-bold">Pipeline Summary (24h)
             {rolling24h && <span className="text-xs font-normal text-muted-foreground ml-2">{fmt(rolling24h.totalScans)} scans · {fmt(rolling24h.totalPairsScanned)} pair evaluations · {fmt(rolling24h.uniquePairsScanned)} unique</span>}
           </CardTitle>
         </CardHeader>
-        <CardContent className="p-0">
+        <CardContent className="p-0 overflow-x-auto">
           {rolling24h && rolling24h.totalScans > 0 ? (() => {
             const r24 = rolling24h.aggregated;
             const quantGlobalPassed = (r24.quant.global as Record<string, number>)['passed_all_filters'] ?? 0;
@@ -530,7 +636,7 @@ export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag
               : 0;
             const ve = data?.vtsEvaluation;
             return (
-              <table className="w-full text-sm">
+              <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
                 <thead>
                   <tr className="border-b bg-muted/50">
                     <th className="text-left p-2 font-medium">Stage</th>
@@ -749,10 +855,10 @@ export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag
         </CardContent>
       </Card>
 
-      {/* TABLE 1: Last Scan Stats */}
-      <Card>
-        <CardHeader className="py-3">
-          <CardTitle className="text-lg flex items-center justify-between">
+      {/* TABLE 1: Last Scan Stats. P19-B8.4c REV-3: lastScan theme (purple, OBJ-9) + frozen first column (OBJ-10). */}
+      <Card className="border-2 border-purple-500/70 overflow-hidden">
+        <CardHeader className="py-3 bg-purple-500/15 border-b-2 border-purple-500/70">
+          <CardTitle className="text-xl font-bold flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
             <span>Last Scan — Filter Breakdown</span>
             <span className="text-sm font-normal text-muted-foreground">
               {lastScan ? `${new Date(lastScan.timestamp).toLocaleTimeString()} · ${lastScan.mode} · ${lastScan.totalPairsScanned} pairs scanned` : 'No scan data'}
@@ -762,7 +868,7 @@ export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag
         <CardContent className="p-0">
           {lastScan ? (
             <div className="overflow-x-auto">
-              <table className="w-full text-sm">
+              <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
                 <thead>
                   <tr className="border-b bg-muted/50">
                     <th className="text-left p-2 font-medium">Filter</th>
@@ -1030,10 +1136,10 @@ export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag
         </CardContent>
       </Card>
 
-      {/* TABLE 2: 24-Hour Rolling Aggregates */}
-      <Card>
-        <CardHeader className="py-3">
-          <CardTitle className="text-lg flex items-center justify-between">
+      {/* TABLE 2: 24-Hour Rolling Aggregates. P19-B8.4c REV-3: rolling theme (teal, OBJ-9) + frozen first column (OBJ-10). */}
+      <Card className="border-2 border-teal-500/70 overflow-hidden">
+        <CardHeader className="py-3 bg-teal-500/15 border-b-2 border-teal-500/70">
+          <CardTitle className="text-xl font-bold flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
             <span>24-Hour Rolling Aggregates</span>
             <span className="text-xs font-normal text-orange-400">(in-memory — resets on restart)</span>
             <span className="text-sm font-normal text-muted-foreground">
@@ -1044,7 +1150,7 @@ export function FilterDiagnosticsPanel({ data, isLoading, gateDisposition = 'tag
         <CardContent className="p-0">
           {rolling24h.totalScans > 0 ? (
             <div className="overflow-x-auto">
-              <table className="w-full text-sm">
+              <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
                 <thead>
                   <tr className="border-b bg-muted/50">
                     <th className="text-left p-2 font-medium">Filter</th>
diff --git a/server/asset_classes/xstock_spot/scanner.ts b/server/asset_classes/xstock_spot/scanner.ts
index 8a2d0279d..662d388d1 100644
--- a/server/asset_classes/xstock_spot/scanner.ts
+++ b/server/asset_classes/xstock_spot/scanner.ts
@@ -121,6 +121,7 @@ interface ScannerDiagnostics {
   hostileSimActive: boolean;
   // B79.0c — universe-split telemetry for diagnostics endpoint.
   lastUniverseSize: number;
+  cycleBatchSize: number;   // P19-B8.4c: per-cycle scan TARGET (CYCLE_BATCH_SIZE=75 — rotates the universe). Read-only telemetry.
   lastArcaOpen: boolean;
   // B79.0m.b — per-cycle eval-pipeline counters from xstock eval-cycle.
   // Populated by runCycle after evaluateXstockPairForVTS loop completes;
@@ -202,6 +203,7 @@ class XstockSpotScannerService {
     lastErrorAt: null,
     errorCount: 0,
     lastUniverseSize: 0,
+    cycleBatchSize: XstockSpotScannerService.CYCLE_BATCH_SIZE, // P19-B8.4c: constant per-cycle target (75)
     lastArcaOpen: false,
     hostileSimActive: false,
     lastCycleEvalCounters: null,
diff --git a/server/routes.ts b/server/routes.ts
index e159cd55e..21ebeac32 100644
--- a/server/routes.ts
+++ b/server/routes.ts
@@ -8156,6 +8156,7 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
           cyclesCompleted: diag.cyclesCompleted,
           cyclesSkippedMarketClosed: diag.cyclesSkippedMarketClosed,
           lastUniverseSize: diag.lastUniverseSize,
+          cycleBatchSize: diag.cycleBatchSize, // P19-B8.4c: per-cycle scan target (75)
           lastArcaOpen: diag.lastArcaOpen,
           pairsScannedLastCycle: diag.pairsScannedLastCycle,
           pairsFreshLastCycle: diag.pairsFreshLastCycle,
diff --git a/server/services/fx5-scanner.ts b/server/services/fx5-scanner.ts
index f96bb4bbf..ef8b3e190 100644
--- a/server/services/fx5-scanner.ts
+++ b/server/services/fx5-scanner.ts
@@ -170,6 +170,8 @@ export interface ScanDiagnostics {
   timestamp: string;
   mode: 'paper' | 'live';
   totalPairsScanned: number;
+  scanTargetPerCycle?: number;   // P19-B8.4c: per-cycle scan TARGET (SCANNER_PARAMS.BATCH_SIZE=300 — a guaranteed floor; actual scanned overshoots via benchmarks). Read-only telemetry.
+  krakenUniverseSize?: number;   // P19-B8.4c: live total Kraken tradable-pair universe (~1,500), from batchResult.metrics. Read-only telemetry.
   allSymbolsScanned: string[];
   quant: {
     global: {
@@ -1439,6 +1441,8 @@ export class Fx5ScannerService {
         timestamp: new Date().toISOString(),
         mode,
         totalPairsScanned: evaluatedCount,
+        scanTargetPerCycle: SCANNER_PARAMS.BATCH_SIZE,               // P19-B8.4c: 300 per-cycle target
+        krakenUniverseSize: batchResult.metrics.krakenUniverseSize, // P19-B8.4c: live total universe
         allSymbolsScanned: evaluatedSymbols,
         quant: {
           global: { ...breakdown },
```
