# P19-B8.7 Step-9 FINAL PIECE — Step-4 diff review: shared-component adoption (paper open/closed tabs mount the VTS-mirror tables)

**From:** NEW Claude (CC-B) · 2026-07-17
**Batch:** P19-B8.7 Step-9 (trade-table layout identity), final piece — implements YOUR shared-component ruling (B) with both conditions.
**Review basis:** the FULL `git diff` of every modified file is embedded below (§D), followed by the FULL content of the two NEW files (§E, §F — untracked, so not in the diff). Working tree = GDrive repo, uncommitted, awaiting this review before push (Step-4-before-push). If anything here contradicts what you'd compute from the repo, REFUSE and say so — do not reconcile silently.

---

## A. What this piece does (one paragraph)

The paper Open Trades and Closed Trades tabs now mount the SAME table components the VTS tabs use (`vts-open-trades-table.tsx` / `vts-closed-trades-table.tsx`), fed through a NEW pure adapter (`client/src/lib/paper-trade-adapter.ts`, 13 unit tests) that maps the paper API rows to the VTS wire shapes byte-for-byte (signed `+X.XX%` strings, `N/A` sentinels, 2/4/6-dp precisions — pinned in tests against the vts-runner serializer formulas). Paper-only affordances (Slot, Source, Actions=manual-close) ride two new OPTIONAL append props that DEFAULT OFF — the VTS mounts pass nothing and render unchanged (your condition 1). Kyle's cost-transparency 5-col split (Entry Fee / Entry Slip / Exit Fee / Exit Slip / Total) is added ONCE in the shared components; paper rows populate it from their real fee/slippage fields, VTS rows populate it from NEWLY-CAPTURED friction components (see §B3), and rows without components render em-dashes — never a fabricated 0.

## B. Rulings I need from you (3)

**B1 — Spread allocation convention (VTS 5-col split).** VTS `frictionCost = fee×2 + slippage×2 + spread` (one blended scalar). I now capture the COMPONENTS (`costFeeFraction/costSlippageFraction/costSpreadFraction`, from `getCachedCostMetrics`) on the trade record at open (both crypto inline build sites + optional passthrough on `buildVirtualTradeFromSignal`). The UI split derives: entryFee = exitFee = dollarValue×fee; entrySlip = exitSlip = dollarValue×(slippage + spread/2) — i.e. the spread cost is allocated HALF to each slip leg, so the four columns sum EXACTLY to the `costs` total. Alternative would be a 6th "Spread" column (breaks paper/VTS column parity) or leaving spread out of the 4 (columns wouldn't sum to total). Rule on the half-each convention.

**B2 — §9.2 correction on the "small VTS API task".** PREVIOUSLY STATED: VTS-side cost-split serialization = "a small API task in the same piece". NOW: it required a CAPTURE change, not just serialization — only the blended `frictionCost` scalar was persisted; the components were computed at signal-build and discarded. The fix persists them via the trade record (flows into `vts_open_trades.context` jsonb automatically per `splitTradeForPersist`; no migration). REASON: the pre-piece estimate assumed the components were already on the record. Residuals, both honest em-dash today: (a) the xStock eval-cycle caller does not yet pass components into `buildVirtualTradeFromSignal` (optional inputs added; wiring = a one-call-site follow-up); (b) all VTS rows opened BEFORE this deploy lack components (no backfill — the blend can't be honestly decomposed retroactively). Confirm these residuals are acceptable with the xStock call-site wiring as a named rider (I propose: same batch, follow-up commit, before batch close).

**B3 — FIX-ON-FIND (rule 23), shipped inside this diff: the old paper tab recomputed P/L client-side on every WS price tick using HARDCODED `FEE_PERCENT = 0.0010` / `SLIPPAGE_PERCENT = 0.0015` constants commented "same as backend" — which they are NOT (fees are DB-governed per-mode/per-class; Kraken Tier-1 taker is far above 0.10%). Every displayed net P/L between two 10s server refreshes was computed on fantasy fees.** The rewire DELETES the whole client recompute: prices/P&L are server-authoritative; WS `price_updated` now triggers a throttled (3s) query invalidation (the same pattern the portfolio metrics strip uses), trade events invalidate immediately. Confirm the fix-on-find disposition (delete-at-the-find, no deferral).

## C. Your two conditions + the carry obligation — how each is satisfied

**Condition 1 (paper affordances optional, default OFF):** `OpenTradesTable`/`ClosedTradesTable` gain `extraHeaders?` + `renderExtraCells?` + `emptyLabel?` (defaulted to the current VTS wording). The VTS mount sites (`vts-tabs.tsx`) are UNTOUCHED in this diff — they pass nothing and render exactly as before (the only VTS-visible changes are the 5-col cost split + Exit Fee Mode column + em-dash guards, which are the Kyle-ruled column set, not affordance leakage).

**Condition 2 (Step-4 shows BOTH mount sites):** §D contains the diffs of BOTH page manifests — `paper-trading.tsx` and `live-trading.tsx` — swapping `ActiveTradesV2` → `PaperOpenTradesTab`, plus the closed-tab swap inside `trade-history-tab.tsx` (mounted by both pages AND `reports.tsx`, which needed no edit). The VTS mounts are listed above as deliberately unchanged.

**B8.9 carry obligation (on record with OLD Claude, Discord 2026-07-17):** the venue-quiet Current-price treatment is carried into the shared open table via OLD Claude's portable `venue-quiet-price-cell.tsx` (import + conditional render keyed on `isVenueQuietSource(priceSource)`; the adapter passes `priceSource`/`priceAgeMs` through; VTS rows lack them → normal render). PUSH-ORDER DEPENDENCY: that file is his (untracked, B8.9); my push must follow his push or carry that one file with his blessing — coordination message sent, awaiting his pick.

## D. Rule-18 deletions in/around this piece

1. `trade-history-tab.tsx`: the ~430-line bespoke closed-trades table + its helpers (formatNumber, DualScrollTable, strategyColors/strategyNames, formatDuration, SortableHeader, getSymbolColor, the API column-sort handler) — DELETED in this diff; the shared components own the rendering. The paginated query keeps a fixed closedAt-desc API ordering; the shared table sorts the current page client-side.
2. `active-trades-v2.tsx` (1,376 lines): ORPHANED by this diff (both mounts swapped; zero remaining importers verified by grep). The file DELETE is sequenced AFTER OLD Claude's B8.9 push lands (he has uncommitted venue-quiet edits inside it — deleting a file mid-his-edit is the collision the wrench protocol exists to prevent). The delete rides THIS batch before close, with DELETED_COMPONENTS_LOG entry + `.removed` archive. Nothing in it survives unaccounted: shell → `paper-open-trades-tab.tsx` (IntegrityBanner moved verbatim, mutations preserved); table markup → superseded by the shared components; the hardcoded-fee client recompute → deleted deliberately (B3); his venue-quiet cell edits → superseded by the shared-table carry.
3. `finalScore` sort machinery: the dead `case 'finalScore'` sort branches (both VTS tables) + the `'finalScore'` member of both SortField types — deleted (the columns died in piece 2.7; deep calc/storage purge remains #525).

## E. Evidence

- Bench: `node scripts/check-tsc-baseline.mjs` → **OK, no regressions above baseline** (after the full file set).
- `paper-trade-adapter.test.ts`: **13/13 green** — pins wire-format parity (distance/percent strings, precisions), no-fabrication (absent metadata → em-dash/undefined/null, never 0), the #525 retired-metric fence (finalScore/hybridScore never emitted), decimal-string parsing, closeReason→result mapping, never_filled countsInAggregates=false, cost-breakdown + B8.6 exit-stamp passthrough.
- Full `npx vitest run`: **no NEW failures.** 10 file-level failures are pre-existing DB-gated suites — verified IDENTICAL on clean HEAD via stash/run/pop (all 165 tests in them skip locally; CI runs them with its env). The only failing assertions on the shared bench are in OLD Claude's in-flight `p19-b8-9-venue-only-source.test.ts` (his lane, his mid-flight bench copies).
- UI verification (§9.3): AFTER your GO + push + deploy — all four surfaces (VTS open/closed unchanged-check, paper open/closed new-mount check), Claude-in-Chrome, before completion is claimed.

## F. File inventory (this piece)

| File | Kind | Substance |
|---|---|---|
| client/src/lib/paper-trade-adapter.ts | NEW | pure row adapter, both directions of honesty |
| server/tests/unit/paper-trade-adapter.test.ts | NEW | 13 tests |
| client/src/components/trading/paper-open-trades-tab.tsx | NEW | paper shell + shared open table + Slot/Source/Actions appends |
| client/src/components/vts/vts-shared.tsx | MOD | optional fields, type additions, finalScore sort-type removal |
| client/src/components/vts/vts-open-trades-table.tsx | MOD | props, 5-col costs, venue-quiet cell, em-dash guards |
| client/src/components/vts/vts-closed-trades-table.tsx | MOD | props, 5-col costs, Exit Fee Mode col, em-dash guards |
| client/src/components/trading/trade-history-tab.tsx | MOD | bespoke table deleted → shared mount |
| client/src/pages/paper-trading.tsx · live-trading.tsx | MOD | mount swaps (condition 2) |
| server/services/vts-runner.ts | MOD | friction-component capture + open-serializer split |
| server/utils/export-csv.ts | MOD | closed-serializer split |
| client/src/components/trading/active-trades-v2.tsx | PENDING DELETE | sequenced after OLD Claude's B8.9 push |

---

# §D FULL DIFF (modified files)

```diff
diff --git a/client/src/components/trading/trade-history-tab.tsx b/client/src/components/trading/trade-history-tab.tsx
index 83823f4b1..116401d63 100644
--- a/client/src/components/trading/trade-history-tab.tsx
+++ b/client/src/components/trading/trade-history-tab.tsx
@@ -1,169 +1,37 @@
-import { useState, useRef, useEffect, useCallback } from "react";
+import { useState } from "react";
 import { useQuery } from "@tanstack/react-query";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
-import { Badge } from "@/components/ui/badge";
 import { Input } from "@/components/ui/input";
 import { Button } from "@/components/ui/button";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
-import { Skeleton } from "@/components/ui/skeleton";
-import { cn, formatEntryFeeMode } from "@/lib/utils";
 import { useTradingMode } from "@/contexts/trading-mode-context";
 import { apiFetch } from "@/lib/api";
-import { getFrictionColorClasses, getRegimeBadgeClassName, getFrictionLabel, formatRegimeTitle } from "@/utils/frictionColor";
-import { AssetClassBadge } from "@/components/ui/asset-class-badge";
-import { 
-  TrendingUp, 
-  TrendingDown, 
-  Target, 
-  Shield, 
-  Clock,
-  BarChart3,
-  Award,
-  AlertTriangle,
+// P19-B8.7 Step-9: the table is the shared VTS-mirror component + pure adapter;
+// the bespoke markup and its helpers (DualScrollTable, SortableHeader, strategy
+// color/name maps, formatters) are deleted with it (rule 18).
+import { ClosedTradesTable } from "@/components/vts/vts-closed-trades-table";
+import { adaptPaperClosedTrade } from "@/lib/paper-trade-adapter";
+import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";
+import {
   RefreshCw,
   ChevronLeft,
   ChevronRight,
   ChevronsLeft,
   ChevronsRight,
-  ArrowUpDown,
-  ArrowUp,
-  ArrowDown
 } from "lucide-react";
 
-function formatNumber(value: number | string, decimals: number = 2): string {
-  const num = typeof value === 'string' ? parseFloat(value) : value;
-  if (isNaN(num)) return '-';
-  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
-}
+// P19-B8.7 Step-9 (rule 18): the bespoke table helpers that lived here —
+// formatNumber, DualScrollTable, the strategyColors/strategyNames maps,
+// formatDuration, SortableHeader — are DELETED with the bespoke markup; the
+// shared vts-closed-trades-table.tsx + vts-shared.tsx now own the rendering.
 
-// Phase 8.8.3-C2: Dual scroll bar component - provides scroll at top and bottom
-function DualScrollTable({ children }: { children: React.ReactNode }) {
-  const topScrollRef = useRef<HTMLDivElement>(null);
-  const bottomScrollRef = useRef<HTMLDivElement>(null);
-  const contentRef = useRef<HTMLDivElement>(null);
-  const [scrollWidth, setScrollWidth] = useState(0);
-  
-  useEffect(() => {
-    if (contentRef.current) {
-      setScrollWidth(contentRef.current.scrollWidth);
-    }
-  }, [children]);
-  
-  const syncScroll = useCallback((source: 'top' | 'bottom') => {
-    if (!topScrollRef.current || !bottomScrollRef.current) return;
-    const scrollLeft = source === 'top' 
-      ? topScrollRef.current.scrollLeft 
-      : bottomScrollRef.current.scrollLeft;
-    topScrollRef.current.scrollLeft = scrollLeft;
-    bottomScrollRef.current.scrollLeft = scrollLeft;
-  }, []);
-  
-  return (
-    <div>
-      {/* Top scroll bar */}
-      <div 
-        ref={topScrollRef}
-        className="overflow-x-auto overflow-y-hidden h-3 border-b border-border/50"
-        onScroll={() => syncScroll('top')}
-      >
-        <div style={{ width: scrollWidth, height: 1 }} />
-      </div>
-      {/* Table container */}
-      <div 
-        ref={(el) => { 
-          (bottomScrollRef as any).current = el; 
-          (contentRef as any).current = el;
-        }}
-        className="overflow-x-auto"
-        onScroll={() => syncScroll('bottom')}
-      >
-        {children}
-      </div>
-    </div>
-  );
-}
-
-// P19-B8.7 (OBJ-2): colors are COSMETIC ONLY — cell visibility never depends on this
-// map (the render fallback carries its own text color). Keys fixed to the canonical
-// strategy ids (range_trading was a dead key — canonical is range_trade); unlisted
-// canonical strategies simply render on the neutral fallback.
-const strategyColors: Record<string, string> = {
-  vwap_pullback: "bg-primary/10 text-primary",
-  abcd_long: "bg-chart-2/10 text-chart-2",
-  sma_trend_ride: "bg-chart-3/10 text-chart-3",
-  vwap_bounce: "bg-blue-500/10 text-blue-600",
-  dhma: "bg-purple-500/10 text-purple-600",
-  breakout: "bg-orange-500/10 text-orange-600",
-  mean_reversion: "bg-green-500/10 text-green-600",
-  range_trade: "bg-cyan-500/10 text-cyan-600",
-  liquidity_trap: "bg-rose-500/10 text-rose-600"
-};
-
-const strategyNames: Record<string, string> = {
-  vwap_pullback: "VWAP Pullback",
-  abcd_long: "ABCD Long",
-  sma_trend_ride: "SMA Trend Ride",
-  vwap_bounce: "VWAP Bounce",
-  dhma: "DHMA",
-  breakout: "Breakout",
-  mean_reversion: "Mean Reversion",
-  range_trade: "Range Trade",
-  liquidity_trap: "Liquidity Trap"
-};
-
-function formatDuration(ms: number): string {
-  if (ms <= 0) return '-';
-  const seconds = Math.floor(ms / 1000);
-  const minutes = Math.floor(seconds / 60);
-  const hours = Math.floor(minutes / 60);
-  const days = Math.floor(hours / 24);
-
-  if (days > 0) return `${days}d ${hours % 24}h`;
-  if (hours > 0) return `${hours}h ${minutes % 60}m`;
-  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
-  return `${seconds}s`;
-}
-
-// P19-B8.7 (OBJ-6): AnalyticsPanel DELETED — see the removal note at the render site.
-function SortableHeader({ 
-  column, 
-  label, 
-  currentSort, 
-  currentOrder, 
-  onSort,
-  align = 'left'
-}: { 
-  column: string; 
-  label: string; 
-  currentSort: string; 
-  currentOrder: 'asc' | 'desc'; 
-  onSort: (col: string) => void;
-  align?: 'left' | 'right';
-}) {
-  const isActive = currentSort === column;
-  return (
-    <th 
-      className={cn(
-        "p-3 text-sm font-semibold text-muted-foreground cursor-pointer hover:bg-muted/50 select-none",
-        align === 'right' ? 'text-right' : 'text-left'
-      )}
-      onClick={() => onSort(column)}
-    >
-      <div className={cn("flex items-center gap-1", align === 'right' && "justify-end")}>
-        {label}
-        {isActive ? (
-          currentOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
-        ) : (
-          <ArrowUpDown className="w-3 h-3 opacity-40" />
-        )}
-      </div>
-    </th>
-  );
-}
 
 export function TradeHistoryTab() {
   const { isPaper } = useTradingMode();
-  
+
+  // Company/coin name overlays for the shared table's stacked symbol cell.
+  useAssetNameOverlays();
+
   // Phase 8.8.3-C-FINAL PART 6: Pending filters (user edits these)
   const [pendingFilters, setPendingFilters] = useState({
     symbol: '',
@@ -182,11 +50,13 @@ export function TradeHistoryTab() {
     dateTo: ''
   });
   
-  // Phase 8.8.3-C5: Pagination and sorting state
+  // Phase 8.8.3-C5: Pagination state. P19-B8.7 Step-9: the API sort became a
+  // fixed closedAt-desc default when the bespoke sortable headers died — the
+  // shared table sorts the current page client-side.
   const [page, setPage] = useState(0);
   const [pageSize, setPageSize] = useState(25);
-  const [sortBy, setSortBy] = useState<string>('closedAt');
-  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
+  const sortBy = 'closedAt';
+  const order: 'asc' | 'desc' = 'desc';
   
   // Phase 8.8.3-C-FINAL PART 6: Apply filters handler
   const handleApplyFilters = () => {
@@ -266,22 +136,9 @@ export function TradeHistoryTab() {
   const totalCount = paginatedData?.totalCount || 0;
   const totalPages = Math.ceil(totalCount / pageSize);
   
-  // Phase 8.8.3-C5: Handle column sorting
-  const handleSort = (column: string) => {
-    if (sortBy === column) {
-      setOrder(order === 'asc' ? 'desc' : 'asc');
-    } else {
-      setSortBy(column);
-      setOrder('desc');
-    }
-    setPage(0); // Reset to first page on sort change
-  };
-
-  const getSymbolColor = (symbol: string) => {
-    if (symbol.includes('BTC')) return 'text-orange-500';
-    if (symbol.includes('ETH')) return 'text-blue-500';
-    return 'text-primary';
-  };
+  // P19-B8.7 Step-9: the API-level column-sort handler + getSymbolColor died with
+  // the bespoke headers (rule 18) — the shared table sorts the current page
+  // client-side; the query keeps its closedAt-desc default ordering.
 
   return (
     <div className="space-y-6">
@@ -414,308 +271,18 @@ export function TradeHistoryTab() {
             </div>
           ) : (
             <>
-              <DualScrollTable>
-                <table className="w-full text-sm">
-                  <thead>
-                    <tr className="border-b border-border">
-                      {/* Phase 8.8.3-C2A: Final column order per directive */}
-                      <SortableHeader column="symbol" label="Symbol" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Class</th>
-                      <SortableHeader column="strategyName" label="Strategy" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pool</th>
-                      {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entry Fee Mode</th>
-                      {/* P19-B8.7 (OBJ-4): VTS-mirror columns */}
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">B/S</th>
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" title="Trailing-exit engine state at close.">TEC State</th>
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Signal/Pattern</th>
-                      <SortableHeader column="quantity" label="Qty" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="entryPrice" label="Entry" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="exitPrice" label="Exit" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" title="The target and stop this trade was closed against (target = target_exit_price; stop = original_stop_price).">Target/Stop</th>
-                      <SortableHeader column="closeReason" label="Reason" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="grossPnl" label="Gross P/L" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="entryFee" label="Entry Fee" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="entrySlippage" label="Entry Slip" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="exitFee" label="Exit Fee" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="exitSlippage" label="Exit Slip" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="totalCost" label="Total Cost" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="netPnl" label="Net P/L" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="confidence" label="Conf" currentSort={sortBy} currentOrder={order} onSort={handleSort} align="right" />
-                      <SortableHeader column="marketRegime" label="Regime" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="marketFrictionScore" label="Friction" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="openedAt" label="Opened" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <SortableHeader column="closedAt" label="Closed" currentSort={sortBy} currentOrder={order} onSort={handleSort} />
-                      <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duration</th>
-                    </tr>
-                  </thead>
-                  <tbody className="divide-y divide-border">
-                    {filteredTrades.map((trade: any) => {
-                      // Phase 8.8.3-C2: Parse P/L and cost fields
-                      const grossPnl = parseFloat(trade.grossPnl || trade.pnl || '0');
-                      const netPnl = parseFloat(trade.netPnl || trade.pnl || '0');
-                      const entryFee = parseFloat(trade.entryFee || '0');
-                      const exitFee = parseFloat(trade.exitFee || '0');
-                      const entrySlippage = parseFloat(trade.entrySlippage || '0');
-                      const exitSlippage = parseFloat(trade.exitSlippage || '0');
-                      const totalCost = parseFloat(trade.totalCost || '0');
-                      const isNetProfit = netPnl >= 0;
-                      const isGrossProfit = grossPnl >= 0;
-                      
-                      const formatTimestamp = (dateStr: string | null) => {
-                        if (!dateStr) return '-';
-                        const d = new Date(dateStr);
-                        return d.toLocaleString('en-US', { 
-                          month: 'short', 
-                          day: 'numeric', 
-                          hour: '2-digit', 
-                          minute: '2-digit'
-                        });
-                      };
-                      
-                      return (
-                        <tr key={trade.id} className="hover:bg-muted/50" data-testid={`trade-history-${trade.id}`}>
-                          {/* 1. Symbol - C2A */}
-                          <td className="p-2">
-                            <span className={cn("text-sm font-semibold", getSymbolColor(trade.symbol))}>
-                              {trade.symbol}
-                            </span>
-                          </td>
-                          
-                          {/* B69: Asset Class */}
-                          <td className="p-2">
-                            <AssetClassBadge assetClass={(trade as any).assetClass} />
-                          </td>
-
-                          {/* 2. Strategy - C2A.
-                              P19-B8.7 (OBJ-2, Kyle 2026-07-16): the column read as BLANK —
-                              the text was rendering WHITE-on-white. Any strategy missing from
-                              the (stale, 9-key) strategyColors map fell to a "bg-muted/10"
-                              override that killed the Badge's default background but kept its
-                              default text-primary-foreground (white). Visibility must NEVER
-                              depend on a hand-maintained color map: the fallback now carries
-                              its own text color, and an unmapped strategy renders its raw
-                              canonical name (the same rule the VTS tables use). */}
-                          <td className="p-2">
-                            <Badge className={cn("text-xs", strategyColors[trade.strategyName as keyof typeof strategyColors] || "bg-muted/20 text-foreground")}>
-                              {strategyNames[trade.strategyName as keyof typeof strategyNames] || trade.strategyName || '—'}
-                            </Badge>
-                          </td>
-
-                          {/* Batch 19E: Source Pool */}
-                          <td className="p-2">
-                            {(trade as any).sourcePool ? (
-                              <Badge className={cn("text-xs",
-                                (trade as any).sourcePool?.startsWith('quant') ? "bg-blue-500/10 text-blue-600" :
-                                (trade as any).sourcePool === 'pattern' ? "bg-purple-500/10 text-purple-600" :
-                                "bg-gray-500/10 text-gray-600"
-                              )}>
-                                {((trade as any).sourcePool as string).toUpperCase()}
-                              </Badge>
-                            ) : <span className="text-muted-foreground text-xs">—</span>}
-                          </td>
-
-                          {/* P19-B7.2b (OBJ-C): Entry Fee Mode (maker/taker) — NULL renders em-dash */}
-                          <td className="p-2 text-xs" data-testid={`text-entry-fee-mode-${trade.id}`}>
-                            {formatEntryFeeMode((trade as any).chosenEntryMode, (trade as any).entryFeeRate)}
-                          </td>
-
-                          {/* P19-B8.7 (OBJ-4): B/S · TEC State · Signal/Pattern (VTS-mirror; em-dash when absent) */}
-                          <td className="p-2">
-                            <span className={cn("text-xs font-semibold uppercase", trade.side === 'sell' ? "text-red-600" : "text-green-600")}>
-                              {trade.side === 'sell' ? 'S' : 'B'}
-                            </span>
-                          </td>
-                          <td className="p-2">
-                            {(trade as any).tradeMode
-                              ? <Badge variant="outline" className="text-xs">{(trade as any).tradeMode}</Badge>
-                              : <span className="text-muted-foreground text-xs">—</span>}
-                          </td>
-                          <td className="p-2 text-xs">
-                            {(trade as any).patternType
-                              ? <span className="font-medium">{String((trade as any).patternType)}</span>
-                              : <span className="text-muted-foreground">—</span>}
-                          </td>
-
-                          {/* 3. Quantity - C2A */}
-                          <td className="p-2 text-right font-mono text-xs">
-                            {trade.quantity ? formatNumber(trade.quantity, 4) : '-'}
-                          </td>
-                          
-                          {/* 4. Entry - C2A */}
-                          <td className="p-2 font-mono text-xs">
-                            {trade.entryPrice ? `$${formatNumber(trade.entryPrice, 4)}` : '-'}
-                          </td>
-                          
-                          {/* 5. Exit - C2A */}
-                          <td className="p-2 font-mono text-xs">
-                            {trade.exitPrice ? `$${formatNumber(trade.exitPrice, 4)}` : '-'}
-                          </td>
-
-                          {/* P19-B8.7 (OBJ-4): Target/Stop pair (target_exit_price / original_stop_price) */}
-                          <td className="p-2 font-mono text-xs whitespace-nowrap">
-                            <span className="text-green-600">{(trade as any).targetExitPrice ? `$${formatNumber((trade as any).targetExitPrice, 4)}` : '—'}</span>
-                            {' / '}
-                            <span className="text-red-600">{(trade as any).originalStopPrice ? `$${formatNumber((trade as any).originalStopPrice, 4)}` : '—'}</span>
-                          </td>
-                          
-                          {/* 6. Reason - C2A; B65.2 + HF3: trailing_stop_hit, moonbag_timeout, break_even_stop */}
-                          <td className="p-2">
-                            <div className="flex items-center gap-1">
-                              <Badge
-                                variant="outline"
-                                className={cn(
-                                  "text-xs",
-                                  trade.closeReason === 'target_hit' && "bg-green-500/20 text-green-600 border-green-500/50",
-                                  trade.closeReason === 'trailing_stop_hit' && "bg-emerald-500/20 text-emerald-600 border-emerald-500/50",
-                                  trade.closeReason === 'moonbag_timeout' && "bg-amber-500/20 text-amber-600 border-amber-500/50",
-                                  trade.closeReason === 'break_even_stop' && "bg-slate-500/20 text-slate-600 border-slate-400/50",
-                                  trade.closeReason === 'stop_hit' && "bg-red-500/20 text-red-600 border-red-500/50",
-                                  // P19-B7.2c: a dropped pending maker (visible, excluded from stats)
-                                  trade.closeReason === 'never_filled' && "bg-slate-500/20 text-slate-400 border-slate-500/40"
-                                )}
-                              >
-                                {!trade.closedAt ? 'Open' :
-                                 trade.closeReason === 'never_filled' ? 'Never filled — dropped' :
-                                 trade.closeReason === 'target_hit' ? 'Target' :
-                                 trade.closeReason === 'trailing_stop_hit' ? 'Trail' :
-                                 trade.closeReason === 'moonbag_timeout' ? 'M.Cap' :
-                                 trade.closeReason === 'break_even_stop' ? 'BE Protect' :
-                                 trade.closeReason === 'stop_hit' ? 'Stop' :
-                                 trade.closeReason === 'manual_close' ? 'Manual' :
-                                 trade.closeReason === 'manual_stop' ? 'M.Stop' :
-                                 trade.closeReason === 'engine_stop_cleanup' ? 'Engine' :
-                                 trade.closeReason === 'hard_reset' ? 'Reset' :
-                                 trade.closeReason === 'hard_stop' ? 'H.Stop' :
-                                 trade.closeReason === 'force_close' ? 'Force' :
-                                 trade.closeReason || '?'}
-                              </Badge>
-                              {/* B65.2: Moonbag badge for trades that entered TRAILING_TAKE mode */}
-                              {/* B65.4: rung count appended (MB×N) when ladder data is present */}
-                              {(trade as any).tradeMode === 'TRAILING_TAKE' && (
-                                <Badge
-                                  variant="outline"
-                                  className="text-[10px] bg-yellow-500/20 text-yellow-700 border-yellow-500/50"
-                                  title={`Trade entered moonbag (trailing) mode after hitting target. Ratcheted through ${(trade as any).ladderRungsHit ?? 1} ladder rung${((trade as any).ladderRungsHit ?? 1) === 1 ? '' : 's'} before exit.`}
-                                >
-                                  🌙 MB×{(trade as any).ladderRungsHit ?? 1}
-                                </Badge>
-                              )}
-                            </div>
-                          </td>
-                          
-                          {/* 7. Gross P/L ($ + %) stacked - C2A */}
-                          <td className="p-2 text-right">
-                            <div className="space-y-0.5">
-                              <div className={cn("font-mono text-xs font-semibold", isGrossProfit ? "text-green-600" : "text-red-600")}>
-                                {isGrossProfit ? '+' : '-'}${formatNumber(Math.abs(grossPnl))}
-                              </div>
-                              <div className={cn("font-mono text-xs", isGrossProfit ? "text-green-600" : "text-red-600")}>
-                                {isGrossProfit ? '+' : ''}{formatNumber((grossPnl / (parseFloat(trade.quantity || '1') * parseFloat(trade.entryPrice || '1'))) * 100)}%
-                              </div>
-                            </div>
-                          </td>
-                          
-                          {/* 8. Entry Fee - C2A */}
-                          <td className="p-2 text-right font-mono text-xs text-muted-foreground">
-                            {entryFee > 0 ? `$${formatNumber(entryFee, 2)}` : '-'}
-                          </td>
-                          
-                          {/* 9. Entry Slippage - C2A */}
-                          <td className="p-2 text-right font-mono text-xs text-orange-600">
-                            {entrySlippage !== 0 ? `$${formatNumber(Math.abs(entrySlippage), 2)}` : '-'}
-                          </td>
-                          
-                          {/* 10. Exit Fee - C2A: Show positive value */}
-                          <td className="p-2 text-right font-mono text-xs text-muted-foreground">
-                            {exitFee !== 0 ? `$${formatNumber(Math.abs(exitFee), 2)}` : '-'}
-                          </td>
-                          
-                          {/* 11. Exit Slippage - C2A: Show positive value */}
-                          <td className="p-2 text-right font-mono text-xs text-orange-600">
-                            {exitSlippage !== 0 ? `$${formatNumber(Math.abs(exitSlippage), 2)}` : '-'}
-                          </td>
-                          
-                          {/* 12. Total Cost - C2A */}
-                          <td className="p-2 text-right font-mono text-xs font-medium text-red-600">
-                            {totalCost > 0 ? `$${formatNumber(totalCost, 2)}` : '-'}
-                          </td>
-                          
-                          {/* 13. Net P/L ($ + %) stacked - C2A */}
-                          <td className="p-2 text-right">
-                            <div className="space-y-0.5">
-                              <div className={cn("font-mono text-xs font-semibold", isNetProfit ? "text-green-600" : "text-red-600")}>
-                                {isNetProfit ? '+' : '-'}${formatNumber(Math.abs(netPnl))}
-                              </div>
-                              <div className={cn("font-mono text-xs", isNetProfit ? "text-green-600" : "text-red-600")}>
-                                {isNetProfit ? '+' : ''}{formatNumber(parseFloat(trade.netPnlPercent || trade.pnlPercent || '0'))}%
-                              </div>
-                            </div>
-                          </td>
-                          
-                          {/* 14. Confidence - C2A */}
-                          <td className="p-2 text-right">
-                            {(() => {
-                              const rawConf = parseFloat(trade.confidence || '0');
-                              const confidence = rawConf > 1 ? rawConf : rawConf * 100;
-                              const confColor = confidence >= 80 ? 'text-green-600' : 
-                                               confidence >= 60 ? 'text-blue-600' : 
-                                               confidence >= 40 ? 'text-orange-500' : 'text-red-600';
-                              return (
-                                <span className={cn("font-mono text-xs font-medium", confColor)}>
-                                  {trade.confidence ? `${formatNumber(confidence, 0)}%` : '-'}
-                                </span>
-                              );
-                            })()}
-                          </td>
-                          
-                          {/* 15. Market Regime - 11.4B */}
-                          <td className="p-2">
-                            {trade.marketRegime ? (
-                              <Badge variant="outline" className={cn("text-xs", getRegimeBadgeClassName(trade.marketRegime))}>
-                                {formatRegimeTitle(trade.marketRegime)}
-                              </Badge>
-                            ) : (
-                              <span className="text-muted-foreground text-xs">—</span>
-                            )}
-                          </td>
-                          
-                          {/* 16. Market Friction - 11.4B */}
-                          <td className="p-2">
-                            {trade.marketFrictionScore !== undefined && trade.marketFrictionScore !== null ? (
-                              <span className={cn(
-                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
-                                getFrictionColorClasses(trade.marketFrictionScore).badge
-                              )}>
-                                {getFrictionLabel(trade.marketFrictionScore)}
-                              </span>
-                            ) : (
-                              <span className="text-muted-foreground text-xs">—</span>
-                            )}
-                          </td>
-                          
-                          {/* 17. Opened - C2A */}
-                          <td className="p-2 text-xs font-mono whitespace-nowrap">
-                            {formatTimestamp(trade.openedAt)}
-                          </td>
-                          
-                          {/* 16. Closed - C2A */}
-                          <td className="p-2 text-xs font-mono whitespace-nowrap">
-                            {formatTimestamp(trade.closedAt)}
-                          </td>
-
-                          {/* P19-B8.7 (OBJ-4): Duration (VTS-mirror) */}
-                          <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
-                            {trade.openedAt && trade.closedAt
-                              ? formatDuration(new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime())
-                              : '—'}
-                          </td>
-                        </tr>
-                      );
-                    })}
-                  </tbody>
-                </table>
-              </DualScrollTable>
+              {/* P19-B8.7 Step-9: the paper history table is now the SHARED
+                  VTS-mirror ClosedTradesTable (vts-closed-trades-table.tsx), fed
+                  through the pure adapter (paper-trade-adapter.ts) — one layout for
+                  VTS and paper (Kyle's layout-identity directive; Langston
+                  shared-component ruling B). Server-side filter/pagination stay on
+                  this shell; the shared table's column sort orders the CURRENT PAGE
+                  client-side. The old ~300-line bespoke table markup is deleted
+                  (rule 18). */}
+              <ClosedTradesTable
+                trades={filteredTrades.map(adaptPaperClosedTrade)}
+                emptyLabel="No trades match your filters"
+              />
               
               {/* Phase 8.8.3-C5: Pagination controls */}
               {totalPages > 1 && (
diff --git a/client/src/components/vts/vts-closed-trades-table.tsx b/client/src/components/vts/vts-closed-trades-table.tsx
index d318d4432..a42020023 100644
--- a/client/src/components/vts/vts-closed-trades-table.tsx
+++ b/client/src/components/vts/vts-closed-trades-table.tsx
@@ -24,9 +24,30 @@ import {
   isBenchmarkSymbol,
 } from "./vts-shared";
 
-type ClosedSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'resultType' | 'grossProfitValue' | 'netProfitValue' | 'finalScore' | 'expectedEdge' | 'regimeWeight' | 'exitTime' | 'durationMinutes';
+// P19-B8.7 Step-9: 'finalScore' removed with its column (retired metric, piece 2.7).
+type ClosedSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'resultType' | 'grossProfitValue' | 'netProfitValue' | 'expectedEdge' | 'regimeWeight' | 'exitTime' | 'durationMinutes';
 
-export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
+/**
+ * P19-B8.7 Step-9: this table is now the SHARED closed-trades component — the
+ * VTS tab AND the paper mode page both mount it (paper rows arrive via
+ * client/src/lib/paper-trade-adapter.ts). Paper-only affordances ride the two
+ * OPTIONAL append props, which DEFAULT OFF — the VTS mount passes nothing and
+ * renders exactly as before (Langston shared-component ruling B, condition 1).
+ */
+export function ClosedTradesTable({
+  trades,
+  extraHeaders,
+  renderExtraCells,
+  emptyLabel = "No closed trades in the last 7 days",
+}: {
+  trades: ClosedTrade[];
+  /** Appended <th> nodes rendered AFTER the standard columns. Default OFF. */
+  extraHeaders?: React.ReactNode;
+  /** Appended <td> nodes per row, matching extraHeaders. Default OFF. */
+  renderExtraCells?: (trade: ClosedTrade, index: number) => React.ReactNode;
+  /** Empty-state text; default keeps the VTS wording. */
+  emptyLabel?: string;
+}) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const topScrollRef = useRef<HTMLDivElement>(null);
   const [sortField, setSortField] = useState<ClosedSortField | null>(null);
@@ -56,9 +77,10 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         case 'resultType': aVal = a.resultType; bVal = b.resultType; break;
         case 'grossProfitValue': aVal = a.grossProfitValue ?? 0; bVal = b.grossProfitValue ?? 0; break;
         case 'netProfitValue': aVal = a.netProfitValue ?? 0; bVal = b.netProfitValue ?? 0; break;
-        case 'finalScore': aVal = a.finalScore; bVal = b.finalScore; break;
-        case 'expectedEdge': aVal = a.expectedEdge; bVal = b.expectedEdge; break;
-        case 'regimeWeight': aVal = a.regimeWeight; bVal = b.regimeWeight; break;
+        // P19-B8.7 Step-9: finalScore sort case deleted with its column (retired
+        // metric, piece 2.7); edge/weight coalesce for adapter rows without them.
+        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
+        case 'regimeWeight': aVal = a.regimeWeight ?? 0; bVal = b.regimeWeight ?? 0; break;
         case 'exitTime': aVal = new Date(a.exitTime).getTime(); bVal = new Date(b.exitTime).getTime(); break;
         case 'durationMinutes': aVal = a.durationMinutes; bVal = b.durationMinutes; break;
       }
@@ -97,7 +119,8 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         onScroll={handleTopScroll}
         style={{ scrollbarWidth: 'thin' }}
       >
-        <div style={{ width: '2300px', height: '1px' }} />
+        {/* initial spacer width only; the HF7 effect re-syncs it to the real scrollWidth */}
+        <div style={{ width: '2800px', height: '1px' }} />
       </div>
       <div
         ref={scrollRef}
@@ -108,7 +131,7 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         {/* B-NEW-31 (2026-05-14): outer container scrolls both axes with bounded
             max-height so the sticky thead + sticky first-column work correctly.
             Mirrors the OpenTradesTable freeze logic. */}
-        <table className="w-full min-w-[2400px] text-sm">
+        <table className="w-full min-w-[2800px] text-sm">
           <thead className="sticky top-0 bg-card z-20">
             <tr className="border-b border-border">
               {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
@@ -122,6 +145,10 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
               <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source Pool</th>
               {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column */}
               <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="The maker/taker entry fee-mode this trade opened on (entry-side fee only). '—' for trades opened before this column existed.">Entry Fee Mode</th>
+              {/* P19-B8.7 Step-9: the B8.6 maker target-exit cohort stamps — which fee
+                  the EXIT actually paid, and whether a resting maker exit filled or
+                  converted to taker. '—' on rows without the stamps (VTS, pre-B8.6). */}
+              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Which fee mode the EXIT actually paid: maker = resting target-exit filled; taker = market exit (stops, converts, timeouts). 'fill'/'convert' shows the resting-exit outcome. '—' for rows without the stamps.">Exit Fee Mode</th>
               {/* B65.2-HF2c: TEC State column on Closed Simulated Trades for parity with Open table */}
               <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Trailing-exit mode the trade ended in. TARGET = closed at static target/stop/timeout; MOONBAG = flipped into trailing mode at target and closed via trailing stop or moonbag-duration cap.">TEC State</th>
               {/* B.2.UI (2026-06-02): entry-liquidity captured at trade-open.
@@ -133,7 +160,14 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
               <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
               <SortableHeader label="Result" field="resultType" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="center" />
               <SortableHeader label="Gross P/L" field="grossProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
-              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Costs</th>
+              {/* P19-B8.7 Step-9 (Kyle cost-transparency ruling): Costs is now a
+                  5-col REALIZED split. Rows without a breakdown (VTS today) show
+                  the total + em-dashes. */}
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side fee actually charged at open.">Entry Fee</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side slippage vs the intended price.">Entry Slip</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Exit-side fee actually charged at close.">Exit Fee</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Exit-side slippage vs the target exit price.">Exit Slip</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Total realized round-trip cost: entry fee + entry slip + exit fee + exit slip.">Total Costs</th>
               <SortableHeader label="Net P/L" field="netProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
 
               {/* P19-B8.7 Step-9 (Kyle 2026-07-17 ruling): FinalScore RETIRED — column removed. */}
@@ -146,13 +180,17 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
               <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl DBS</th>
               <SortableHeader label="Entry/Exit Time" field="exitTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
               <SortableHeader label="Duration" field="durationMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
+              {/* P19-B8.7 Step-9: paper-only appended columns (default OFF) */}
+              {extraHeaders}
             </tr>
           </thead>
           <tbody>
             {sortedTrades.length === 0 ? (
               <tr>
-                <td colSpan={27} className="px-3 py-8 text-center text-muted-foreground">
-                  No closed trades in the last 7 days
+                {/* colSpan 33 = 32 standard columns post cost-split/exit-mode + headroom
+                    for appended paper columns (browsers clamp overshoot). */}
+                <td colSpan={33} className="px-3 py-8 text-center text-muted-foreground">
+                  {emptyLabel}
                 </td>
               </tr>
             ) : (
@@ -243,6 +281,24 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                       ) : null}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: Exit Fee Mode — the B8.6 exit_fee_mode stamp plus
+                      the resting-exit outcome (fill/convert). '—' when unstamped. */}
+                  <td className="px-3 py-2 text-xs whitespace-nowrap">
+                    {trade.exitFeeMode ? (
+                      <div className="flex flex-col gap-0.5">
+                        <span className={trade.exitFeeMode === 'maker' ? 'text-emerald-400' : 'text-muted-foreground'}>
+                          {trade.exitFeeMode.toUpperCase()}
+                        </span>
+                        {trade.exitRestOutcome && (
+                          <span className="text-[10px] text-muted-foreground">
+                            {trade.exitRestOutcome === 'fill' ? 'rested — filled' : trade.exitRestOutcome === 'convert' ? 'rested — converted' : trade.exitRestOutcome}
+                          </span>
+                        )}
+                      </div>
+                    ) : (
+                      <span className="text-muted-foreground">—</span>
+                    )}
+                  </td>
                   {/* B65.2-HF2c: TEC State column on Closed — TARGET vs MOONBAG end-state */}
                   {/* B65.4 (2026-04-25): MOONBAG badge shows ladder rung count (MB×N) when present */}
                   <td className="px-3 py-2">
@@ -318,6 +374,20 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                       </span>
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: realized cost 5-col split. Breakdown absent →
+                      em-dash (never a fabricated 0); the total renders either way. */}
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costEntryFee != null ? `$${trade.costEntryFee.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costEntrySlippage != null ? `$${trade.costEntrySlippage.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costExitFee != null ? `$${trade.costExitFee.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costExitSlippage != null ? `$${trade.costExitSlippage.toFixed(4)}` : '—'}
+                  </td>
                   <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                     ${trade.costs.toFixed(4)}
                   </td>
@@ -331,8 +401,10 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                       </span>
                     </div>
                   </td>
-                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge.toFixed(2)}</td>
-                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight.toFixed(2)}</td>
+                  {/* P19-B8.7 Step-9: absent values render an em-dash, never a
+                      fabricated 0.00 (adapter rows may lack metadata-sourced numbers). */}
+                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge != null ? trade.expectedEdge.toFixed(2) : '—'}</td>
+                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight != null ? trade.regimeWeight.toFixed(2) : '—'}</td>
                   <td className="px-3 py-2 text-xs">{trade.globalRegime || '\u2014'}</td>
                   <td className="px-3 py-2 text-right font-mono text-xs">{trade.pairFriction != null ? getFrictionLabel(Math.round(trade.pairFriction)) : '\u2014'}</td>
                   <td className="px-3 py-2 text-right font-mono text-xs">{trade.globalFriction != null ? getFrictionLabel(Math.round(trade.globalFriction)) : '\u2014'}</td>
@@ -368,6 +440,8 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                       {formatDuration(trade.durationMinutes)}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: paper-only appended cells (default OFF) */}
+                  {renderExtraCells?.(trade, idx)}
                 </tr>
               ))
             )}
diff --git a/client/src/components/vts/vts-open-trades-table.tsx b/client/src/components/vts/vts-open-trades-table.tsx
index ab63f4e24..0eb4a00f6 100644
--- a/client/src/components/vts/vts-open-trades-table.tsx
+++ b/client/src/components/vts/vts-open-trades-table.tsx
@@ -8,6 +8,10 @@ import { Clock } from "lucide-react";
 import { format } from "date-fns";
 import { getFrictionLabel } from "@/utils/frictionColor";
 import { formatEntryFeeMode } from "@/lib/utils";
+// P19-B8.7 Step-9 (B8.9 carry): the venue-quiet Current-price treatment lives in
+// ONE portable place; paper adapter rows carry priceSource/priceAgeMs, VTS rows
+// don't (normal render).
+import { VenueQuietPrice, isVenueQuietSource } from "@/components/trading/venue-quiet-price-cell";
 import {
   type OpenTrade,
   type OpenSortField,
@@ -23,7 +27,28 @@ import {
   isBenchmarkSymbol,
 } from "./vts-shared";
 
-export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
+/**
+ * P19-B8.7 Step-9: this table is now the SHARED open-trades component — the VTS
+ * tab AND the paper mode page both mount it (paper rows arrive via
+ * client/src/lib/paper-trade-adapter.ts). Paper-only affordances (Slot, Actions,
+ * …) ride the two OPTIONAL append props, which DEFAULT OFF — the VTS mount
+ * passes nothing and renders exactly as before (Langston shared-component
+ * ruling B, condition 1).
+ */
+export function OpenTradesTable({
+  trades,
+  extraHeaders,
+  renderExtraCells,
+  emptyLabel = "No open simulated trades",
+}: {
+  trades: OpenTrade[];
+  /** Appended <th> nodes rendered AFTER the standard columns. Default OFF. */
+  extraHeaders?: React.ReactNode;
+  /** Appended <td> nodes per row, matching extraHeaders. Default OFF. */
+  renderExtraCells?: (trade: OpenTrade, index: number) => React.ReactNode;
+  /** Empty-state text; default keeps the VTS wording. */
+  emptyLabel?: string;
+}) {
   const scrollRef = useRef<HTMLDivElement>(null);
   const topScrollRef = useRef<HTMLDivElement>(null);
   const [sortField, setSortField] = useState<OpenSortField | null>(null);
@@ -52,9 +77,10 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
         case 'entryPrice': aVal = a.entryPrice; bVal = b.entryPrice; break;
         case 'grossProfitValue': aVal = a.grossProfitValue ?? 0; bVal = b.grossProfitValue ?? 0; break;
         case 'netProfitValue': aVal = a.netProfitValue ?? 0; bVal = b.netProfitValue ?? 0; break;
-        case 'finalScore': aVal = a.finalScore; bVal = b.finalScore; break;
-        case 'expectedEdge': aVal = a.expectedEdge; bVal = b.expectedEdge; break;
-        case 'regimeWeight': aVal = a.regimeWeight; bVal = b.regimeWeight; break;
+        // P19-B8.7 Step-9: finalScore sort case deleted with its column (retired
+        // metric, piece 2.7); edge/weight coalesce for adapter rows without them.
+        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
+        case 'regimeWeight': aVal = a.regimeWeight ?? 0; bVal = b.regimeWeight ?? 0; break;
         case 'entryTime': aVal = new Date(a.entryTime).getTime(); bVal = new Date(b.entryTime).getTime(); break;
         case 'durationOpenMinutes': aVal = a.durationOpenMinutes; bVal = b.durationOpenMinutes; break;
       }
@@ -93,7 +119,8 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
         onScroll={handleTopScroll}
         style={{ scrollbarWidth: 'thin' }}
       >
-        <div style={{ width: '2300px', height: '1px' }} />
+        {/* initial spacer width only; the HF7 effect re-syncs it to the real scrollWidth */}
+        <div style={{ width: '2700px', height: '1px' }} />
       </div>
       <div
         ref={scrollRef}
@@ -105,7 +132,7 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
             max-height so the sticky thead + sticky first-column work correctly. Header
             stays pinned on vertical scroll; Symbol column stays pinned on horizontal
             scroll. Top-left corner uses z-30 so it sits above both axes. */}
-        <table className="w-full min-w-[2400px] text-sm">
+        <table className="w-full min-w-[2700px] text-sm">
           <thead className="sticky top-0 bg-card z-20">
             <tr className="border-b border-border">
               {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
@@ -130,7 +157,14 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
               <th className="px-3 py-2 text-right font-medium text-muted-foreground">Target/Stop</th>
               <th className="px-3 py-2 text-right font-medium text-muted-foreground">Dist. T/S</th>
               <SortableHeader label="Gross P/L" field="grossProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
-              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Costs</th>
+              {/* P19-B8.7 Step-9 (Kyle cost-transparency ruling): Costs is now a
+                  5-col split — entry fee/slip + estimated exit fee/slip + total.
+                  Rows without a breakdown (VTS today) show the total + em-dashes. */}
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side fee actually charged at open.">Entry Fee</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Entry-side slippage vs the intended price.">Entry Slip</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="ESTIMATED exit-side fee (realized at close).">Est Exit Fee</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="ESTIMATED exit-side slippage (realized at close).">Est Exit Slip</th>
+              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Total round-trip cost estimate: entry fee + entry slip + est exit fee + est exit slip.">Total Costs</th>
               <SortableHeader label="Net P/L" field="netProfitValue" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
 
               <th className="px-3 py-2 text-right font-medium text-muted-foreground">Rank</th>
@@ -146,13 +180,17 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
               <th className="px-3 py-2 text-left font-medium text-muted-foreground">Glbl DBS</th>
               <SortableHeader label="Entry Time" field="entryTime" currentSort={sortField} direction={sortDirection} onSort={handleSort} />
               <SortableHeader label="Duration" field="durationOpenMinutes" currentSort={sortField} direction={sortDirection} onSort={handleSort} align="right" />
+              {/* P19-B8.7 Step-9: paper-only appended columns (default OFF) */}
+              {extraHeaders}
             </tr>
           </thead>
           <tbody>
             {sortedTrades.length === 0 ? (
               <tr>
-                <td colSpan={28} className="px-3 py-8 text-center text-muted-foreground">
-                  No open simulated trades
+                {/* colSpan 32 = 31 standard columns post cost-split + headroom for
+                    appended paper columns (browsers clamp overshoot to the row width). */}
+                <td colSpan={32} className="px-3 py-8 text-center text-muted-foreground">
+                  {emptyLabel}
                 </td>
               </tr>
             ) : (
@@ -286,9 +324,17 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                   <td className="px-3 py-2 text-right">
                     <div className="flex flex-col gap-0.5">
                       <span className="font-mono text-xs">${trade.entryPrice.toFixed(4)}</span>
-                      <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
-                        {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
-                      </span>
+                      {/* P19-B8.7 Step-9 (B8.9 carry): a Current value whose source is a
+                          memory (LKG/seed/fallback), not a venue read, renders the
+                          venue-quiet treatment. Rows without priceSource (VTS) render
+                          exactly as before. */}
+                      {isVenueQuietSource(trade.priceSource) ? (
+                        <VenueQuietPrice price={trade.currentPrice} ageMs={trade.priceAgeMs} decimals={4} className="text-xs" />
+                      ) : (
+                        <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
+                          {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
+                        </span>
+                      )}
                     </div>
                   </td>
                   <td className="px-3 py-2 text-right">
@@ -317,6 +363,20 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                       <span className="text-xs text-muted-foreground">-</span>
                     )}
                   </td>
+                  {/* P19-B8.7 Step-9: cost 5-col split. Breakdown absent → em-dash
+                      (never a fabricated 0); the total renders either way. */}
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costEntryFee != null ? `$${trade.costEntryFee.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costEntrySlippage != null ? `$${trade.costEntrySlippage.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costExitFee != null ? `$${trade.costExitFee.toFixed(4)}` : '—'}
+                  </td>
+                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
+                    {trade.costExitSlippage != null ? `$${trade.costExitSlippage.toFixed(4)}` : '—'}
+                  </td>
                   <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                     ${trade.costs.toFixed(4)}
                   </td>
@@ -334,9 +394,11 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                       <span className="text-xs text-muted-foreground">-</span>
                     )}
                   </td>
-                  <td className="px-3 py-2 text-right font-mono text-xs text-purple-400">{(trade.rankingScore ?? 0).toFixed(2)}</td>
-                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge.toFixed(2)}</td>
-                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight.toFixed(2)}</td>
+                  {/* P19-B8.7 Step-9: absent values render an em-dash, never a
+                      fabricated 0.00 (adapter rows may lack metadata-sourced numbers). */}
+                  <td className="px-3 py-2 text-right font-mono text-xs text-purple-400">{trade.rankingScore != null ? trade.rankingScore.toFixed(2) : '—'}</td>
+                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge != null ? trade.expectedEdge.toFixed(2) : '—'}</td>
+                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight != null ? trade.regimeWeight.toFixed(2) : '—'}</td>
                   <td className="px-3 py-2 text-xs">{trade.globalRegime || '\u2014'}</td>
                   <td className="px-3 py-2 text-right font-mono text-xs">{trade.pairFriction != null ? getFrictionLabel(Math.round(trade.pairFriction)) : '\u2014'}</td>
                   <td className="px-3 py-2 text-right font-mono text-xs">{trade.globalFriction != null ? getFrictionLabel(Math.round(trade.globalFriction)) : '\u2014'}</td>
@@ -369,6 +431,8 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                       {formatDuration(trade.durationOpenMinutes)}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: paper-only appended cells (default OFF) */}
+                  {renderExtraCells?.(trade, idx)}
                 </tr>
               ))
             )}
diff --git a/client/src/components/vts/vts-shared.tsx b/client/src/components/vts/vts-shared.tsx
index 775d0ce7a..11df77957 100644
--- a/client/src/components/vts/vts-shared.tsx
+++ b/client/src/components/vts/vts-shared.tsx
@@ -29,10 +29,16 @@ export interface OpenTrade {
   netProfitValue: number;
   netProfitPercent: string;
   rankingScore?: number; // Batch 47f15: Cross-family desirability score
-  finalScore: number;
-  hybridScore: number;
-  expectedEdge: number;
-  regimeWeight: number;
+  // P19-B8.7 Step-9: OPTIONAL since the Final/Hybrid cells were deleted (Kyle's
+  // FinalScore retirement, piece 2.7); the paper adapter omits them entirely.
+  // Full field death rides #525 (B-FINALSCORE-PURGE).
+  finalScore?: number;
+  hybridScore?: number;
+  // P19-B8.7 Step-9: OPTIONAL — the paper adapter sources these from signal
+  // metadata, which is absent on some rows (em-dash render, never a fabricated
+  // number). The VTS serializer always provides them, so VTS is unaffected.
+  expectedEdge?: number;
+  regimeWeight?: number;
   entryTime: string;
   durationOpenMinutes: number;
   globalRegime: string | null;
@@ -67,6 +73,17 @@ export interface OpenTrade {
   state?: string;
   mtTwin?: boolean;
   mtPairId?: string | null;
+  // P19-B8.7 Step-9: cost 5-col breakdown (entry fee/slip + ESTIMATED exit
+  // fee/slip). Present on paper adapter rows; absent (em-dash) until the VTS
+  // serializer carries a split. `costs` stays the single total either way.
+  costEntryFee?: number | null;
+  costEntrySlippage?: number | null;
+  costExitFee?: number | null;
+  costExitSlippage?: number | null;
+  // P19-B8.7 Step-9 (B8.9 carry): price provenance for the venue-quiet Current
+  // cell. Paper rows carry these; VTS rows don't (normal render).
+  priceSource?: string | null;
+  priceAgeMs?: number | null;
 }
 
 export interface ClosedTrade {
@@ -92,10 +109,16 @@ export interface ClosedTrade {
   netProfitValue: number;
   netProfitPercent: string;
   rankingScore?: number; // Batch 47f15: Cross-family desirability score
-  finalScore: number;
-  hybridScore: number;
-  expectedEdge: number;
-  regimeWeight: number;
+  // P19-B8.7 Step-9: OPTIONAL since the Final/Hybrid cells were deleted (Kyle's
+  // FinalScore retirement, piece 2.7); the paper adapter omits them entirely.
+  // Full field death rides #525 (B-FINALSCORE-PURGE).
+  finalScore?: number;
+  hybridScore?: number;
+  // P19-B8.7 Step-9: OPTIONAL — the paper adapter sources these from signal
+  // metadata, which is absent on some rows (em-dash render, never a fabricated
+  // number). The VTS serializer always provides them, so VTS is unaffected.
+  expectedEdge?: number;
+  regimeWeight?: number;
   entryTime: string;
   exitTime: string;
   durationMinutes: number;
@@ -132,6 +155,15 @@ export interface ClosedTrade {
   mtTwin?: boolean;
   mtPairId?: string | null;
   countsInAggregates?: boolean;
+  // P19-B8.7 Step-9: realized cost 5-col breakdown + the B8.6 maker target-exit
+  // cohort stamps (exit_fee_mode / exit_rest_outcome). Present on paper adapter
+  // rows; em-dash on VTS rows until their serializers carry them.
+  costEntryFee?: number | null;
+  costEntrySlippage?: number | null;
+  costExitFee?: number | null;
+  costExitSlippage?: number | null;
+  exitFeeMode?: string | null;
+  exitRestOutcome?: string | null;
 }
 
 // Batch 19H: Filter Pipeline Diagnostics types
@@ -345,7 +377,8 @@ export function isBenchmarkSymbol(symbol: string): boolean {
   return BENCHMARK_BASE_COINS.includes(base);
 }
 
-export type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'finalScore' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
+// P19-B8.7 Step-9: 'finalScore' removed with its column (retired metric, piece 2.7).
+export type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
 export type SortDirection = 'asc' | 'desc';
 
 export function SortableHeader({
diff --git a/client/src/pages/live-trading.tsx b/client/src/pages/live-trading.tsx
index e7ac93475..6fcdfd68c 100644
--- a/client/src/pages/live-trading.tsx
+++ b/client/src/pages/live-trading.tsx
@@ -9,7 +9,9 @@
 import ModeTradingPage, { type ModeTradingPageConfig } from "@/pages/mode-trading";
 import { Badge } from "@/components/ui/badge";
 import { Lightbulb, LineChart, TrendingUp, BarChart3, History, Ghost, LayoutDashboard } from "lucide-react";
-import ActiveTradesV2 from "@/components/trading/active-trades-v2";
+// P19-B8.7 Step-9: the Open Trades tab is the shared VTS-mirror table behind the
+// paper shell (replaces active-trades-v2, deleted — rule 18). Dormant on live.
+import PaperOpenTradesTab from "@/components/trading/paper-open-trades-tab";
 import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
 import { ExecutionMetricsPanel } from "@/components/trading/execution-metrics";
 import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
@@ -48,7 +50,7 @@ const config: ModeTradingPageConfig = {
         </>
       ),
     },
-    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <ActiveTradesV2 mode="live" /> },
+    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <PaperOpenTradesTab mode="live" /> },
     { key: "closed", label: "Closed Trades", shortLabel: "Closed", icon: History, render: () => <TradeHistoryTab /> },
     { key: "shadows", label: "Shadows", shortLabel: "Shadow", icon: Ghost, render: () => <ShadowTradesTab /> },
   ],
diff --git a/client/src/pages/paper-trading.tsx b/client/src/pages/paper-trading.tsx
index e357d32aa..d524bd191 100644
--- a/client/src/pages/paper-trading.tsx
+++ b/client/src/pages/paper-trading.tsx
@@ -8,7 +8,9 @@
  */
 import ModeTradingPage, { type ModeTradingPageConfig } from "@/pages/mode-trading";
 import { Lightbulb, LineChart, TrendingUp, BarChart3, History, Ghost, LayoutDashboard } from "lucide-react";
-import ActiveTradesV2 from "@/components/trading/active-trades-v2";
+// P19-B8.7 Step-9: the Open Trades tab is the shared VTS-mirror table behind the
+// paper shell (replaces active-trades-v2, deleted — rule 18).
+import PaperOpenTradesTab from "@/components/trading/paper-open-trades-tab";
 import ReadyToBuyTable from "@/components/trading/ready-to-buy-table";
 import { ExecutionMetricsPanel } from "@/components/trading/execution-metrics";
 import { TradeHistoryTab } from "@/components/trading/trade-history-tab";
@@ -45,7 +47,7 @@ const config: ModeTradingPageConfig = {
         </>
       ),
     },
-    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <ActiveTradesV2 mode="paper" /> },
+    { key: "open", label: "Open Trades", shortLabel: "Open", icon: BarChart3, render: () => <PaperOpenTradesTab mode="paper" /> },
     { key: "closed", label: "Closed Trades", shortLabel: "Closed", icon: History, render: () => <TradeHistoryTab /> },
     { key: "shadows", label: "Shadows", shortLabel: "Shadow", icon: Ghost, render: () => <ShadowTradesTab /> },
   ],
diff --git a/server/services/vts-runner.ts b/server/services/vts-runner.ts
index 2a90c1f7e..69c02c6cd 100644
--- a/server/services/vts-runner.ts
+++ b/server/services/vts-runner.ts
@@ -553,6 +553,14 @@ interface Phase10TradeRecord {
   // Optional — pre-B7.2b records lack it (UI renders NULL as an em-dash).
   chosenEntryMode?: 'taker' | 'maker';
   entryFeeRate?: number;
+  // P19-B8.7 Step-9: the friction COMPONENTS behind frictionCost (per-leg
+  // fractions from getCachedCostMetrics), captured at open so the UI cost 5-col
+  // split renders honestly. frictionCost stays the blended round-trip scalar
+  // (fee×2 + slippage×2 + spread). Absent on pre-B8.7 records → em-dash, never
+  // a back-derived fabrication.
+  costFeeFraction?: number;
+  costSlippageFraction?: number;
+  costSpreadFraction?: number;
 }
 
 /**
@@ -1995,6 +2003,11 @@ async function generatePhase10Signal(
     dollarValue,      // Directive 11.6H: Fixed USD exposure
     quantity,         // Directive 11.6H: Variable coin units
     frictionCost,
+    // P19-B8.7 Step-9: the components behind frictionCost, persisted (context
+    // jsonb) so the UI cost 5-col split renders honestly. Fractions, per leg.
+    costFeeFraction: costMetrics.fee,
+    costSlippageFraction: costMetrics.slippage,
+    costSpreadFraction: costMetrics.spread,
     regime,
     regimeScore: regimeScoreRaw,
     signalType,
@@ -2195,6 +2208,11 @@ async function generatePhase10Signal(
     regimeWeight,
     decayPenalty,
     frictionCost,
+    // P19-B8.7 Step-9: friction components onto the closed-archive record too,
+    // so the closed-trades cost 5-col split renders honestly.
+    costFeeFraction: costMetrics.fee,
+    costSlippageFraction: costMetrics.slippage,
+    costSpreadFraction: costMetrics.spread,
     entry: entryPrice,
     exit: undefined, // Directive 11.6: Exit determined by real price resolution
     profit: undefined, // Directive 11.6: P&L calculated at exit
@@ -3859,6 +3877,12 @@ export interface RegisterOpenVtsTradeInput {
   dollarValue: number;
   quantity: number;
   frictionCost: number;
+  // P19-B8.7 Step-9: optional friction components behind frictionCost (per-leg
+  // fractions). Callers with cost metrics in hand pass them so the UI cost 5-col
+  // split renders; absent → em-dash (never back-derived from the blend).
+  costFeeFraction?: number;
+  costSlippageFraction?: number;
+  costSpreadFraction?: number;
   regime: MarketRegimeType;
   regimeScore: number;
   signalType: CanonicalSignalType;
@@ -3991,6 +4015,11 @@ export async function registerOpenVtsTrade(input: RegisterOpenVtsTradeInput): Pr
     dollarValue: input.dollarValue,
     quantity: input.quantity,
     frictionCost: input.frictionCost,
+    // P19-B8.7 Step-9: friction-component passthrough (cost 5-col split).
+    // Absent (caller without cost metrics) → undefined → em-dash.
+    costFeeFraction: input.costFeeFraction,
+    costSlippageFraction: input.costSlippageFraction,
+    costSpreadFraction: input.costSpreadFraction,
     regime: input.regime,
     regimeScore: input.regimeScore,
     signalType: input.signalType,
@@ -5555,6 +5584,24 @@ export async function getOpenVirtualTradesForML(): Promise<Array<{
       grossProfitValue: parseFloat(grossProfitValue.toFixed(2)),
       grossProfitPercent: (parseFloat(grossProfitPercent) >= 0 ? '+' : '') + grossProfitPercent + '%',
       costs: parseFloat(costsDollar.toFixed(4)),
+      // P19-B8.7 Step-9: cost 5-col split, derived from the captured friction
+      // COMPONENTS (never back-derived from the blend). Convention: the spread
+      // cost is allocated HALF to each slip leg, so the four columns sum exactly
+      // to `costs` (frictionCost = fee×2 + slippage×2 + spread). Rows opened
+      // before the components were captured render em-dashes.
+      ...(() => {
+        const _f = trade.costFeeFraction, _s = trade.costSlippageFraction, _sp = trade.costSpreadFraction;
+        if (typeof _f !== 'number' || typeof _s !== 'number' || typeof _sp !== 'number'
+            || !isFinite(_f) || !isFinite(_s) || !isFinite(_sp)) {
+          return { costEntryFee: null, costEntrySlippage: null, costExitFee: null, costExitSlippage: null };
+        }
+        return {
+          costEntryFee: parseFloat((tradeDollarValue * _f).toFixed(4)),
+          costEntrySlippage: parseFloat((tradeDollarValue * (_s + _sp / 2)).toFixed(4)),
+          costExitFee: parseFloat((tradeDollarValue * _f).toFixed(4)),
+          costExitSlippage: parseFloat((tradeDollarValue * (_s + _sp / 2)).toFixed(4)),
+        };
+      })(),
       netProfitValue: parseFloat(netProfitValue.toFixed(2)),
       netProfitPercent: (parseFloat(netProfitPercent) >= 0 ? '+' : '') + netProfitPercent + '%',
       // Batch 47f15: Compute ranking score for display (same formula as RTB queue)
diff --git a/server/utils/export-csv.ts b/server/utils/export-csv.ts
index ab6160196..e37ee0b6b 100644
--- a/server/utils/export-csv.ts
+++ b/server/utils/export-csv.ts
@@ -86,6 +86,14 @@ export async function getClosedVTSTradesFromLogs(days: number = 7): Promise<Arra
   grossProfitValue: number;
   grossProfitPercent: string;
   costs: number;
+  // P19-B8.7 Step-9: cost 5-col split, derived from the friction COMPONENTS
+  // captured at open (costFee/Slippage/SpreadFraction on the record). Spread is
+  // allocated half to each slip leg so the four columns sum exactly to `costs`.
+  // null on records opened before the components were captured (em-dash).
+  costEntryFee: number | null;
+  costEntrySlippage: number | null;
+  costExitFee: number | null;
+  costExitSlippage: number | null;
   netProfitValue: number;
   netProfitPercent: string;
   finalScore: number;
@@ -208,6 +216,7 @@ export async function getClosedVTSTradesFromLogs(days: number = 7): Promise<Arra
               resultType: 'never_filled',
               countsInAggregates: false,
               grossProfitValue: 0, grossProfitPercent: '0.00%', costs: 0,
+              costEntryFee: null, costEntrySlippage: null, costExitFee: null, costExitSlippage: null,
               netProfitValue: 0, netProfitPercent: '0.00%',
               finalScore: 0, hybridScore: 0, expectedEdge: 0, regimeWeight: 0,
               entryTime: new Date(trade.entryTime).toISOString(),
@@ -312,6 +321,21 @@ export async function getClosedVTSTradesFromLogs(days: number = 7): Promise<Arra
             grossProfitValue: parseFloat(grossProfitValue.toFixed(2)),
             grossProfitPercent: (parseFloat(grossProfitPercent) >= 0 ? '+' : '') + grossProfitPercent + '%',
             costs: parseFloat(costsDollar.toFixed(4)),
+            // P19-B8.7 Step-9: cost 5-col split from the captured components
+            // (spread halved into each slip leg — sums exactly to `costs`).
+            ...(() => {
+              const _f = trade.costFeeFraction, _s = trade.costSlippageFraction, _sp = trade.costSpreadFraction;
+              if (typeof _f !== 'number' || typeof _s !== 'number' || typeof _sp !== 'number'
+                  || !isFinite(_f) || !isFinite(_s) || !isFinite(_sp)) {
+                return { costEntryFee: null, costEntrySlippage: null, costExitFee: null, costExitSlippage: null };
+              }
+              return {
+                costEntryFee: parseFloat((tradeDollarValue * _f).toFixed(4)),
+                costEntrySlippage: parseFloat((tradeDollarValue * (_s + _sp / 2)).toFixed(4)),
+                costExitFee: parseFloat((tradeDollarValue * _f).toFixed(4)),
+                costExitSlippage: parseFloat((tradeDollarValue * (_s + _sp / 2)).toFixed(4)),
+              };
+            })(),
             netProfitValue: parseFloat(netProfitValue.toFixed(2)),
             netProfitPercent: (parseFloat(netProfitPercent) >= 0 ? '+' : '') + netProfitPercent + '%',
             finalScore: trade.finalScore || trade.signal?.finalScore || 0,
```

---

# §E NEW FILE — client/src/lib/paper-trade-adapter.ts (full)

```typescript
/**
 * P19-B8.7 Step-9 — the paper→VTS-shape trade adapter (PURE, no React, no I/O).
 *
 * The paper open/closed tabs mount the SAME shared table components the VTS
 * tabs use (Langston shared-component ruling B, 2026-07-17). Those components
 * consume the VTS OpenTrade/ClosedTrade shapes; the paper API rows carry the
 * same facts under different names/encodings. This module is the single seam:
 * one function per table, mapping a paper row to the VTS shape — matching the
 * VTS serializer's EXACT wire formats (vts-runner.ts buildOpenTradeRow):
 *   distanceToTarget  '+X.XX%' (signed) | 'N/A' when no target
 *   distanceToStop    'X.XX%' (unsigned) | 'N/A' when no stop
 *   gross/net %       '+X.XX%' (signed)
 *   dollarValue 2dp · quantity 6dp · costs 4dp · entryTime/exitTime ISO
 *
 * Honesty rules (B8.7 no-fabrication):
 *  - metadata-sourced fields absent → undefined/'—' (cells render em-dash),
 *    NEVER a fabricated number (the deleted mlConfidence ?? ngc×0.9 lesson).
 *  - #515-family global/pair context (globalRegime, frictions, DBS) is NOT
 *    captured on paper rows today → explicit null, rendered '—'.
 *
 * Relative type-only imports on purpose: vitest has no '@' alias, and a
 * type-only import of the .tsx is erased at runtime, keeping this module
 * loadable in the node test environment.
 */
import type { OpenTrade, ClosedTrade } from "../components/vts/vts-shared";

// ---------------------------------------------------------------------------
// Input row shapes (what the paper routes actually serialize)
// ---------------------------------------------------------------------------

/** One enriched position row from GET /api/active-engine/active-trades. */
export interface PaperActiveTradeRow {
  id: string;
  symbol: string;
  strategy: string;
  assetClass?: string | null;
  patternType?: string | null;
  side?: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  grossPnl: number;
  grossPnlPercent: number;
  netPnl: number;
  netPnlPercent: number;
  entryFee?: number;
  entrySlippage?: number;
  estExitFee?: number;
  estExitSlippage?: number;
  estTotalCost: number;
  takeProfit: number;
  stopLoss: number;
  holdingDurationMs: number;
  openedAt: string;
  metadata?: Record<string, unknown> | null;
  volume24h?: number;
  positionValue: number;
  tradeMode?: string;
  chosenEntryMode?: string | null;
  entryFeeRate?: number | null;
  state?: string;
  // paper-only affordances the shared components take as OPTIONAL props
  slotNumber?: number;
  maxSlots?: number;
  health?: unknown;
  confidence?: number;
  frequency?: string;
  sourceLabel?: string;
  // price provenance (venue-quiet Current cell, B8.9 carry)
  priceSource?: string;
  priceAgeMs?: number;
}

/** One raw closed_trades row from GET /api/active-engine/trades?paginated=true.
 *  Drizzle serializes decimal columns as STRINGS — every numeric passes
 *  through num()/pct() below. */
export interface PaperClosedTradeRow {
  id: string;
  symbol: string;
  assetClass?: string | null;
  strategyName: string;
  side?: string;
  quantity: string | number;
  entryPrice: string | number;
  exitPrice?: string | number | null;
  stopLoss?: string | number | null;
  takeProfit?: string | number | null;
  grossPnl?: string | number | null;
  netPnl?: string | number | null;
  netPnlPercent?: string | number | null;
  totalCost?: string | number | null;
  entryFee?: string | number | null;
  exitFee?: string | number | null;
  entrySlippage?: string | number | null;
  exitSlippage?: string | number | null;
  exitFeeMode?: string | null;
  exitRestOutcome?: string | null;
  openedAt: string | Date;
  closedAt?: string | Date | null;
  closeReason?: string | null;
  signalType?: string | null;
  patternType?: string | null;
  sourcePool?: string | null;
  tradeMode?: string | null;
  chosenEntryMode?: string | null;
  entryFeeRate?: string | number | null;
  pairIdHash?: number | null;
  regimeConfidenceRaw?: number | null;
  macroModifierValue?: number | null;
  phase?: string | null;
  phaseAgeSeconds?: number | null;
  strategyPhaseWeight?: number | null;
  regimeConfidenceModulated?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** OpenTrade plus the loose TEC fields the shared open table reads off the
 *  row (the VTS serializer emits them outside the declared interface), plus
 *  the cost 5-col breakdown (present on paper rows; the shared Costs cell
 *  renders the split when these exist, the single total + em-dashes when not). */
export type AdaptedOpenTrade = OpenTrade & {
  tradeMode?: string;
  breakEvenLatched?: boolean;
  targetLatched?: boolean;
  engineStopPrice?: number | null;
  costEntryFee?: number | null;
  costEntrySlippage?: number | null;
  costExitFee?: number | null;
  costExitSlippage?: number | null;
  // Paper-only affordances carried through for the appended columns (the shared
  // table sorts internally, so extras must ride the row — index math would lie).
  id?: string;
  slotNumber?: number;
  maxSlots?: number;
  sourceLabel?: string;
};

/** ClosedTrade plus the realized cost 5-col breakdown (closed_trades columns
 *  entry_fee / entry_slippage / exit_fee / exit_slippage). */
export type AdaptedClosedTrade = ClosedTrade & {
  costEntryFee?: number | null;
  costEntrySlippage?: number | null;
  costExitFee?: number | null;
  costExitSlippage?: number | null;
  // P19-B8.6 maker target-exit cohort stamps for the maker-exit columns.
  exitFeeMode?: string | null;
  exitRestOutcome?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decimal-string/number → finite number, else null. Never coerces to 0. */
function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Signed percent string matching the VTS wire format: '+2.35%' / '-0.80%'. */
function signedPct(v: number | null): string {
  if (v === null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

/** metadata scalar → number when it genuinely is one, else undefined. */
function metaNum(meta: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function metaStr(meta: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ---------------------------------------------------------------------------
// Open trades
// ---------------------------------------------------------------------------

export function adaptPaperOpenTrade(row: PaperActiveTradeRow): AdaptedOpenTrade {
  const meta = row.metadata ?? null;
  const priceForCalc = Number.isFinite(row.currentPrice) && row.currentPrice > 0 ? row.currentPrice : row.entryPrice;

  // Same formulas + formats as the VTS serializer (vts-runner buildOpenTradeRow).
  const distanceToTarget =
    row.takeProfit > 0 && priceForCalc > 0
      ? signedPct(((row.takeProfit - priceForCalc) / priceForCalc) * 100)
      : "N/A";
  const distanceToStop =
    row.stopLoss > 0 && priceForCalc > 0
      ? (((row.stopLoss - priceForCalc) / priceForCalc) * 100).toFixed(2) + "%"
      : "N/A";

  return {
    symbol: row.symbol,
    assetClass: row.assetClass ?? undefined,
    // Metadata-sourced context; absent → '—' (string fields) / undefined (numbers).
    regime: metaStr(meta, "regime") ?? "—",
    strategy: row.strategy,
    signalType: metaStr(meta, "signalType") ?? "—",
    patternType: row.patternType ?? metaStr(meta, "patternType") ?? null,
    pool: (metaStr(meta, "pool") ?? "—").toUpperCase(),
    sourcePool: metaStr(meta, "sourcePool"),
    dollarValue: parseFloat(row.positionValue.toFixed(2)),
    quantity: parseFloat(row.quantity.toFixed(6)),
    entryPrice: row.entryPrice,
    exitPrice: null,
    target: row.takeProfit,
    stopLoss: row.stopLoss,
    currentPrice: Number.isFinite(row.currentPrice) ? row.currentPrice : null,
    distanceToTarget,
    distanceToStop,
    grossProfitValue: parseFloat((num(row.grossPnl) ?? 0).toFixed(2)),
    grossProfitPercent: signedPct(num(row.grossPnlPercent)),
    costs: parseFloat((num(row.estTotalCost) ?? 0).toFixed(4)),
    netProfitValue: parseFloat((num(row.netPnl) ?? 0).toFixed(2)),
    netProfitPercent: signedPct(num(row.netPnlPercent)),
    rankingScore: metaNum(meta, "rankingScore"), // inert shadow value — display only
    // finalScore/hybridScore OMITTED on purpose (retired metric, piece 2.7 / #525).
    expectedEdge: metaNum(meta, "expectedEdge"),
    regimeWeight: metaNum(meta, "regimeWeight"),
    entryTime: row.openedAt,
    durationOpenMinutes: Math.floor((num(row.holdingDurationMs) ?? 0) / 60000),
    // #515 family: global/pair context is not captured on paper rows today.
    globalRegime: null,
    pairFriction: null,
    globalFriction: null,
    pairDirectionalBias: null,
    globalDirectionalBias: null,
    pairDirectionalBiasScore: null,
    globalDirectionalBiasScore: null,
    // Entry-liquidity: paper rows carry 24h volume only (crypto convention);
    // 0/absent → null → '—'.
    entryLiquidityValue: (num(row.volume24h) ?? 0) > 0 ? (num(row.volume24h) as number) : null,
    entryLiquidityKind: (num(row.volume24h) ?? 0) > 0 ? "volume_qty" : null,
    chosenEntryMode: row.chosenEntryMode ?? null,
    entryFeeRate: num(row.entryFeeRate),
    state: row.state ?? "open",
    // TEC state: paper serializes tradeMode only; latch flags aren't on the row —
    // left undefined (cell renders the mode without latch badges), never guessed.
    tradeMode: row.tradeMode ?? "TARGET",
    // Cost 5-col breakdown (entry fee/slip + ESTIMATED exit fee/slip on open rows).
    costEntryFee: num(row.entryFee),
    costEntrySlippage: num(row.entrySlippage),
    costExitFee: num(row.estExitFee),
    costExitSlippage: num(row.estExitSlippage),
    // Price provenance → the shared Current cell renders the venue-quiet
    // treatment when the source is a memory, not a venue read (B8.9 carry).
    priceSource: row.priceSource ?? null,
    priceAgeMs: num(row.priceAgeMs),
    // Paper-only affordances for the appended Slot/Source/Actions columns.
    id: row.id,
    slotNumber: row.slotNumber,
    maxSlots: row.maxSlots,
    sourceLabel: row.sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// Closed trades
// ---------------------------------------------------------------------------

export function adaptPaperClosedTrade(row: PaperClosedTradeRow): AdaptedClosedTrade {
  const meta = row.metadata ?? null;
  const quantity = num(row.quantity) ?? 0;
  const entryPrice = num(row.entryPrice) ?? 0;
  const notional = quantity * entryPrice;
  const grossPnl = num(row.grossPnl);
  const openedAt = new Date(row.openedAt);
  const closedAt = row.closedAt ? new Date(row.closedAt) : null;

  return {
    symbol: row.symbol,
    assetClass: row.assetClass ?? undefined,
    regime: metaStr(meta, "regime") ?? "—",
    strategy: row.strategyName,
    signalType: row.signalType ?? "—",
    patternType: row.patternType ?? null,
    pool: (metaStr(meta, "pool") ?? "—").toUpperCase(),
    sourcePool: row.sourcePool ?? undefined,
    dollarValue: parseFloat(notional.toFixed(2)),
    quantity: parseFloat(quantity.toFixed(6)),
    entryPrice,
    exitPrice: num(row.exitPrice) ?? 0,
    target: num(row.takeProfit) ?? 0,
    stopLoss: num(row.stopLoss) ?? 0,
    // closeReason uppercased lands on the shared badge/label maps directly
    // ('target_hit' → TAKE PROFIT, 'trailing_stop_hit' → TRAIL STOP, …).
    resultType: (row.closeReason ?? "UNKNOWN").toUpperCase(),
    grossProfitValue: parseFloat((grossPnl ?? 0).toFixed(2)),
    grossProfitPercent:
      grossPnl !== null && notional > 0 ? signedPct((grossPnl / notional) * 100) : "—",
    costs: parseFloat((num(row.totalCost) ?? 0).toFixed(4)),
    netProfitValue: parseFloat((num(row.netPnl) ?? 0).toFixed(2)),
    netProfitPercent: signedPct(num(row.netPnlPercent)),
    rankingScore: metaNum(meta, "rankingScore"),
    // finalScore/hybridScore OMITTED (retired metric).
    expectedEdge: metaNum(meta, "expectedEdge"),
    regimeWeight: metaNum(meta, "regimeWeight"),
    entryTime: openedAt.toISOString(),
    exitTime: closedAt ? closedAt.toISOString() : "",
    durationMinutes: closedAt ? Math.max(0, Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000)) : 0,
    globalRegime: null,
    pairFriction: null,
    globalFriction: null,
    pairDirectionalBias: null,
    globalDirectionalBias: null,
    pairDirectionalBiasScore: null,
    globalDirectionalBiasScore: null,
    pairIdHash: row.pairIdHash ?? null,
    regimeConfidenceRaw: row.regimeConfidenceRaw ?? null,
    macroModifierValue: row.macroModifierValue ?? null,
    phase: (row.phase as ClosedTrade["phase"]) ?? null,
    phaseAgeSeconds: row.phaseAgeSeconds ?? null,
    strategyPhaseWeight: row.strategyPhaseWeight ?? null,
    regimeConfidenceModulated: row.regimeConfidenceModulated ?? null,
    entryLiquidityValue: metaNum(meta, "entryLiquidityValue") ?? null,
    entryLiquidityKind:
      (metaStr(meta, "entryLiquidityKind") as ClosedTrade["entryLiquidityKind"]) ?? null,
    chosenEntryMode: row.chosenEntryMode ?? null,
    entryFeeRate: num(row.entryFeeRate),
    // never_filled dropped-pending rows are visible but excluded from stats,
    // same convention as VTS (B7.2c).
    countsInAggregates: (row.closeReason ?? "") !== "never_filled",
    // Realized cost 5-col breakdown + B8.6 maker target-exit cohort stamps.
    costEntryFee: num(row.entryFee),
    costEntrySlippage: num(row.entrySlippage),
    costExitFee: num(row.exitFee),
    costExitSlippage: num(row.exitSlippage),
    exitFeeMode: row.exitFeeMode ?? null,
    exitRestOutcome: row.exitRestOutcome ?? null,
  };
}
```

# §F NEW FILE — client/src/components/trading/paper-open-trades-tab.tsx (full)

```tsx
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
        <OpenTradesTable
          trades={trades}
          emptyLabel="No open trades"
          extraHeaders={
            <>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground" title="Engine slot this position occupies, out of the guardrail cap.">Slot</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground" title="Price feed this row's Current value came from (WS = live Kraken WebSocket; REST = polling fallback).">Source</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actions</th>
            </>
          }
          renderExtraCells={(trade) => {
            const t = trade as AdaptedOpenTrade;
            return (
              <>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {t.slotNumber != null ? `${t.slotNumber}${Number.isFinite(Number(t.maxSlots)) ? ` / ${t.maxSlots}` : ''}` : '—'}
                </td>
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
```

# §G NEW FILE — server/tests/unit/paper-trade-adapter.test.ts (full)

```typescript
/**
 * P19-B8.7 Step-9 — paper→VTS-shape adapter tests.
 *
 * Pins the three contracts the shared-table mount depends on:
 *  1. Wire-format parity with the VTS serializer (signed '+X.XX%' strings,
 *     'N/A' sentinels, decimal precisions) — the shared cells must not be able
 *     to tell a paper row from a VTS row.
 *  2. No-fabrication honesty: absent metadata → '—'/undefined/null, NEVER an
 *     invented number (the deleted mlConfidence ?? ngc×0.9 lesson).
 *  3. Retired-metric fence: finalScore/hybridScore are NEVER emitted (#525).
 *
 * The adapter lives in client/src (imported relatively — vitest has no '@'
 * alias) but is pure TS with type-only React-side imports, so it runs clean
 * in the node environment.
 */
import { describe, it, expect } from 'vitest';
import {
  adaptPaperOpenTrade,
  adaptPaperClosedTrade,
  type PaperActiveTradeRow,
  type PaperClosedTradeRow,
} from '../../../client/src/lib/paper-trade-adapter';

const baseOpenRow: PaperActiveTradeRow = {
  id: 't-1',
  symbol: 'LTC/USD',
  strategy: 'vwap_pullback',
  assetClass: 'crypto_spot',
  patternType: null,
  quantity: 12.3456789,
  entryPrice: 100,
  currentPrice: 102,
  grossPnl: 24.691,
  grossPnlPercent: 2.0,
  netPnl: 20.5,
  netPnlPercent: 1.66,
  entryFee: 1.0,
  entrySlippage: 0.5,
  estExitFee: 2.0,
  estExitSlippage: 0.69105,
  estTotalCost: 4.19105,
  takeProfit: 105,
  stopLoss: 98,
  holdingDurationMs: 185_000, // 3m05s
  openedAt: '2026-07-17T04:00:00.000Z',
  metadata: {
    regime: 'TREND_FRIENDLY_STABLE',
    signalType: 'QUANT',
    pool: 'ideal',
    sourcePool: 'quant',
    rankingScore: 0.42,
    expectedEdge: 0.031,
  },
  volume24h: 54321,
  positionValue: 1259.259,
  tradeMode: 'TARGET',
  chosenEntryMode: 'maker',
  entryFeeRate: 0.004,
  state: 'open',
};

const baseClosedRow: PaperClosedTradeRow = {
  id: 'c-1',
  symbol: 'US/USD',
  assetClass: 'xstock_spot',
  strategyName: 'orb_breakout',
  quantity: '3.5',
  entryPrice: '200',
  exitPrice: '206',
  stopLoss: '196',
  takeProfit: '206',
  grossPnl: '21',
  netPnl: '15.4',
  netPnlPercent: '2.2',
  totalCost: '5.6',
  entryFee: '2.8',
  exitFee: '2.8',
  entrySlippage: '0',
  exitSlippage: '0',
  exitFeeMode: 'maker',
  exitRestOutcome: 'fill',
  openedAt: '2026-07-16T14:00:00.000Z',
  closedAt: '2026-07-16T15:30:00.000Z',
  closeReason: 'target_hit',
  signalType: 'QUANT',
  patternType: null,
  sourcePool: 'quant',
  chosenEntryMode: 'taker',
  entryFeeRate: '0.008',
  metadata: { regime: 'IMPULSE_EXPANSION', pool: 'rotational' },
};

describe('adaptPaperOpenTrade — VTS wire-format parity', () => {
  it('formats distances exactly like the VTS serializer (signed target, unsigned stop)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    // (105-102)/102*100 = 2.9412 → '+2.94%'; (98-102)/102*100 = -3.9216 → '-3.92%'
    expect(t.distanceToTarget).toBe('+2.94%');
    expect(t.distanceToStop).toBe('-3.92%');
  });

  it('emits N/A when target/stop are zero, like VTS', () => {
    const t = adaptPaperOpenTrade({ ...baseOpenRow, takeProfit: 0, stopLoss: 0 });
    expect(t.distanceToTarget).toBe('N/A');
    expect(t.distanceToStop).toBe('N/A');
  });

  it('signs the percent strings and applies VTS decimal precisions', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.grossProfitPercent).toBe('+2.00%');
    expect(t.netProfitPercent).toBe('+1.66%');
    expect(t.dollarValue).toBe(1259.26);   // 2dp
    expect(t.quantity).toBe(12.345679);    // 6dp
    // 4dp — (4.19105).toFixed(4) = '4.1910' (the double sits just under the
    // midpoint), same parseFloat(toFixed(4)) path the VTS serializer runs.
    expect(t.costs).toBe(4.191);
  });

  it('maps DIRECT + metadata-sourced fields', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.symbol).toBe('LTC/USD');
    expect(t.assetClass).toBe('crypto_spot');
    expect(t.regime).toBe('TREND_FRIENDLY_STABLE');
    expect(t.pool).toBe('IDEAL'); // uppercased like VTS
    expect(t.sourcePool).toBe('quant');
    expect(t.target).toBe(105);
    expect(t.exitPrice).toBeNull();
    expect(t.durationOpenMinutes).toBe(3);
    expect(t.chosenEntryMode).toBe('maker');
    expect(t.entryFeeRate).toBe(0.004);
    expect(t.state).toBe('open');
    expect(t.tradeMode).toBe('TARGET');
    expect(t.entryLiquidityValue).toBe(54321);
    expect(t.entryLiquidityKind).toBe('volume_qty');
  });

  it('passes the cost 5-col breakdown through (split renders only when present)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow);
    expect(t.costEntryFee).toBe(1.0);
    expect(t.costEntrySlippage).toBe(0.5);
    expect(t.costExitFee).toBe(2.0);
    expect(t.costExitSlippage).toBe(0.69105);
    const bare = adaptPaperOpenTrade({ ...baseOpenRow, entryFee: undefined, entrySlippage: undefined, estExitFee: undefined, estExitSlippage: undefined });
    expect(bare.costEntryFee).toBeNull();
    expect(bare.costExitSlippage).toBeNull();
  });
});

describe('adaptPaperOpenTrade — no-fabrication honesty', () => {
  it('renders em-dash strings / undefined numbers when metadata is absent — never invents', () => {
    const t = adaptPaperOpenTrade({ ...baseOpenRow, metadata: null });
    expect(t.regime).toBe('—');
    expect(t.signalType).toBe('—');
    expect(t.pool).toBe('—');
    expect(t.sourcePool).toBeUndefined();
    expect(t.rankingScore).toBeUndefined();
    expect(t.expectedEdge).toBeUndefined();
    expect(t.regimeWeight).toBeUndefined();
  });

  it('emits null (not 0) for absent entry-liquidity and #515 global/pair context', () => {
    const t = adaptPaperOpenTrade({ ...baseOpenRow, volume24h: 0 });
    expect(t.entryLiquidityValue).toBeNull();
    expect(t.entryLiquidityKind).toBeNull();
    expect(t.globalRegime).toBeNull();
    expect(t.pairFriction).toBeNull();
    expect(t.globalFriction).toBeNull();
    expect(t.pairDirectionalBiasScore).toBeNull();
  });

  it('NEVER emits the retired finalScore/hybridScore (#525 fence)', () => {
    const t = adaptPaperOpenTrade(baseOpenRow) as Record<string, unknown>;
    expect('finalScore' in t).toBe(false);
    expect('hybridScore' in t).toBe(false);
  });
});

describe('adaptPaperClosedTrade — decimal-string rows', () => {
  it('parses drizzle decimal strings and computes derived fields', () => {
    const t = adaptPaperClosedTrade(baseClosedRow);
    expect(t.strategy).toBe('orb_breakout');
    expect(t.quantity).toBe(3.5);
    expect(t.entryPrice).toBe(200);
    expect(t.exitPrice).toBe(206);
    expect(t.dollarValue).toBe(700); // 3.5 × 200
    // gross% = 21/700*100 = 3.00
    expect(t.grossProfitPercent).toBe('+3.00%');
    expect(t.netProfitPercent).toBe('+2.20%');
    expect(t.costs).toBe(5.6);
    expect(t.durationMinutes).toBe(90);
    expect(t.entryTime).toBe('2026-07-16T14:00:00.000Z');
    expect(t.exitTime).toBe('2026-07-16T15:30:00.000Z');
    expect(t.entryFeeRate).toBe(0.008);
  });

  it('uppercases closeReason so the shared result badge/label maps hit directly', () => {
    expect(adaptPaperClosedTrade(baseClosedRow).resultType).toBe('TARGET_HIT');
    expect(
      adaptPaperClosedTrade({ ...baseClosedRow, closeReason: 'trailing_stop_hit' }).resultType,
    ).toBe('TRAILING_STOP_HIT');
    expect(adaptPaperClosedTrade({ ...baseClosedRow, closeReason: null }).resultType).toBe('UNKNOWN');
  });

  it('carries the realized cost breakdown + B8.6 maker-exit cohort stamps', () => {
    const t = adaptPaperClosedTrade(baseClosedRow);
    expect(t.costEntryFee).toBe(2.8);
    expect(t.costExitFee).toBe(2.8);
    expect(t.costEntrySlippage).toBe(0);
    expect(t.costExitSlippage).toBe(0);
    expect(t.exitFeeMode).toBe('maker');
    expect(t.exitRestOutcome).toBe('fill');
  });

  it('marks never_filled rows visible-but-excluded, like VTS (B7.2c)', () => {
    expect(adaptPaperClosedTrade(baseClosedRow).countsInAggregates).toBe(true);
    expect(
      adaptPaperClosedTrade({ ...baseClosedRow, closeReason: 'never_filled' }).countsInAggregates,
    ).toBe(false);
  });

  it('never coerces missing numerics to fabricated values or emits retired metrics', () => {
    const t = adaptPaperClosedTrade({
      ...baseClosedRow,
      grossPnl: null,
      metadata: null,
    }) as Record<string, unknown>;
    expect(t.grossProfitPercent).toBe('—');
    expect(t.regime).toBe('—');
    expect('finalScore' in t).toBe(false);
    expect('hybridScore' in t).toBe(false);
    expect(t.rankingScore).toBeUndefined();
  });
});
```
