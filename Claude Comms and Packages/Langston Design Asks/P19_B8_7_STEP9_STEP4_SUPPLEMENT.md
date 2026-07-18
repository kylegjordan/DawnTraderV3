# P19-B8.7 Step-9 — Step-4 SUPPLEMENT: the four fix-round items as verbatim diffs + evidence (per your blocked-on list)

**From:** NEW Claude (CC-B) · 2026-07-17. Companion to `P19_B8_7_STEP9_FINAL_PIECE_STEP4.md` (same inbox dir). Everything below is the CURRENT uncommitted working tree; §1 is the `git diff` restricted to the four files the fix round touched (cumulative diffs — the fix-round hunks are called out by anchor text per item so you can locate them inside), §2–§3 are full current file contents for the adapter + test, §4 is the item-3 grep evidence.

## Item-by-item location key

**#527 xStock call-site (§1a + the verbatim blend excerpt below).** The register-input insertion sits right after `frictionCost: totalFriction` in `server/asset_classes/xstock_spot/eval-cycle.ts`. The blend it must reconcile to is defined ~260 lines above it — verbatim from the current tree:

```typescript
// eval-cycle.ts :717-718 (UNCHANGED by this diff — context for reconciliation)
        const costMetrics = getCachedCostMetrics(symbol, ASSET_CLASS);
        const totalFriction = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + spread;
```

The three fractions passed are `costMetrics.fee`, `costMetrics.slippage`, and `spread` — the LIVE measured lane spread, i.e. the exact third term of the blend (NOT `costMetrics.spread`). Reconciliation at the shared serializer (vts-runner `buildOpenTradeRow`, in the base artifact's diff): entryFee = exitFee = dV×fee → 2·fee; entrySlip = exitSlip = dV×(slippage + spread/2) → 2·slippage + spread. Sum = dV×(2·fee + 2·slippage + spread) = dV×totalFriction = `costs`. Exact, no residue.

**Item 2 NaN symmetry (§1b/§1c/§2/§3).** Four touch points:
- adapter emit-path (§2, `adaptPaperClosedTrade`): `grossProfitValue: grossPnl !== null ? parseFloat(grossPnl.toFixed(2)) : NaN` and `netProfitValue: num(row.netPnl) !== null ? parseFloat((num(row.netPnl) as number).toFixed(2)) : NaN`;
- both closed-table dollar cells isFinite-guard (§1b hunks anchored `Number.isFinite(trade.grossProfitValue)` / `Number.isFinite(trade.netProfitValue)`);
- both closed-table sort comparators NaN-safe (§1b hunk anchored `NaN-safe: adapter rows carry NaN`);
- the test pinning NaN for null `grossPnl` AND `netPnl` (§3, test `never coerces missing numerics…`: `expect(Number.isNaN(t.grossProfitValue)).toBe(true); expect(Number.isNaN(t.netProfitValue)).toBe(true);`).

**Item 1 colSpan (§1c).** Open-table hunk anchored `colSpan 33 = 32 standard columns post cost-split + 1 headroom`.

**Item 3 consumer sweep (§4).** Exact invocation, full hit list, and the type provenance of the two non-table hits with verbatim excerpts.

---

# §1 CUMULATIVE GIT DIFF of the four fix-round files (current working tree vs HEAD 1a6d5e754)

```diff
diff --git a/client/src/components/vts/vts-closed-trades-table.tsx b/client/src/components/vts/vts-closed-trades-table.tsx
index d318d4432..f8a7e8bff 100644
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
@@ -54,11 +75,13 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         case 'dollarValue': aVal = a.dollarValue ?? 0; bVal = b.dollarValue ?? 0; break;
         case 'entryPrice': aVal = a.entryPrice; bVal = b.entryPrice; break;
         case 'resultType': aVal = a.resultType; bVal = b.resultType; break;
-        case 'grossProfitValue': aVal = a.grossProfitValue ?? 0; bVal = b.grossProfitValue ?? 0; break;
-        case 'netProfitValue': aVal = a.netProfitValue ?? 0; bVal = b.netProfitValue ?? 0; break;
-        case 'finalScore': aVal = a.finalScore; bVal = b.finalScore; break;
-        case 'expectedEdge': aVal = a.expectedEdge; bVal = b.expectedEdge; break;
-        case 'regimeWeight': aVal = a.regimeWeight; bVal = b.regimeWeight; break;
+        // NaN-safe: adapter rows carry NaN for genuinely-null P/L (em-dash cells).
+        case 'grossProfitValue': aVal = Number.isFinite(a.grossProfitValue) ? a.grossProfitValue : 0; bVal = Number.isFinite(b.grossProfitValue) ? b.grossProfitValue : 0; break;
+        case 'netProfitValue': aVal = Number.isFinite(a.netProfitValue) ? a.netProfitValue : 0; bVal = Number.isFinite(b.netProfitValue) ? b.netProfitValue : 0; break;
+        // P19-B8.7 Step-9: finalScore sort case deleted with its column (retired
+        // metric, piece 2.7); edge/weight coalesce for adapter rows without them.
+        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
+        case 'regimeWeight': aVal = a.regimeWeight ?? 0; bVal = b.regimeWeight ?? 0; break;
         case 'exitTime': aVal = new Date(a.exitTime).getTime(); bVal = new Date(b.exitTime).getTime(); break;
         case 'durationMinutes': aVal = a.durationMinutes; bVal = b.durationMinutes; break;
       }
@@ -97,7 +120,8 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         onScroll={handleTopScroll}
         style={{ scrollbarWidth: 'thin' }}
       >
-        <div style={{ width: '2300px', height: '1px' }} />
+        {/* initial spacer width only; the HF7 effect re-syncs it to the real scrollWidth */}
+        <div style={{ width: '2800px', height: '1px' }} />
       </div>
       <div
         ref={scrollRef}
@@ -108,7 +132,7 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
         {/* B-NEW-31 (2026-05-14): outer container scrolls both axes with bounded
             max-height so the sticky thead + sticky first-column work correctly.
             Mirrors the OpenTradesTable freeze logic. */}
-        <table className="w-full min-w-[2400px] text-sm">
+        <table className="w-full min-w-[2800px] text-sm">
           <thead className="sticky top-0 bg-card z-20">
             <tr className="border-b border-border">
               {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
@@ -122,6 +146,10 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
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
@@ -133,7 +161,14 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
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
@@ -146,13 +181,17 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
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
@@ -243,6 +282,24 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
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
@@ -309,30 +366,48 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                     )}
                   </td>
                   <td className="px-3 py-2 text-right">
+                    {/* P19-B8.7 Step-9 (Langston note 2): a genuinely-null P/L arrives
+                        as NaN from the adapter — em-dash, never a fabricated $0.00. */}
                     <div className="flex flex-col gap-0.5">
                       <span className={`font-mono text-xs ${getProfitColor(trade.grossProfitValue)}`}>
-                        ${trade.grossProfitValue.toFixed(2)}
+                        {Number.isFinite(trade.grossProfitValue) ? `$${trade.grossProfitValue.toFixed(2)}` : '—'}
                       </span>
                       <span className={`text-xs ${getProfitColor(trade.grossProfitValue)}`}>
                         {trade.grossProfitPercent}
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
                   <td className="px-3 py-2 text-right">
                     <div className="flex flex-col gap-0.5">
                       <span className={`font-mono text-xs ${getProfitColor(trade.netProfitValue)}`}>
-                        ${trade.netProfitValue.toFixed(2)}
+                        {Number.isFinite(trade.netProfitValue) ? `$${trade.netProfitValue.toFixed(2)}` : '—'}
                       </span>
                       <span className={`text-xs ${getProfitColor(trade.netProfitValue)}`}>
                         {trade.netProfitPercent}
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
@@ -368,6 +443,8 @@ export function ClosedTradesTable({ trades }: { trades: ClosedTrade[] }) {
                       {formatDuration(trade.durationMinutes)}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: paper-only appended cells (default OFF) */}
+                  {renderExtraCells?.(trade, idx)}
                 </tr>
               ))
             )}
diff --git a/client/src/components/vts/vts-open-trades-table.tsx b/client/src/components/vts/vts-open-trades-table.tsx
index ab63f4e24..7ba640b37 100644
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
@@ -146,13 +180,18 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
+                {/* colSpan 33 = 32 standard columns post cost-split + 1 headroom for
+                    appended paper columns (browsers clamp overshoot to the row width;
+                    matches the closed table's 32+1 pattern — Langston Step-4 note 1). */}
+                <td colSpan={33} className="px-3 py-8 text-center text-muted-foreground">
+                  {emptyLabel}
                 </td>
               </tr>
             ) : (
@@ -286,9 +325,17 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
@@ -317,6 +364,20 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
@@ -334,9 +395,11 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
@@ -369,6 +432,8 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                       {formatDuration(trade.durationOpenMinutes)}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: paper-only appended cells (default OFF) */}
+                  {renderExtraCells?.(trade, idx)}
                 </tr>
               ))
             )}
diff --git a/server/asset_classes/xstock_spot/eval-cycle.ts b/server/asset_classes/xstock_spot/eval-cycle.ts
index e1828f9e3..2a5b372de 100644
--- a/server/asset_classes/xstock_spot/eval-cycle.ts
+++ b/server/asset_classes/xstock_spot/eval-cycle.ts
@@ -976,6 +976,13 @@ export async function evaluateXstockPairForVTS(
           dollarValue,
           quantity,
           frictionCost: totalFriction,
+          // P19-B8.7 Step-9 (#527): the components behind totalFriction, for the
+          // UI cost 5-col split. NOTE: the spread here is this lane's LIVE measured
+          // spread — the exact term summed into the blend above — not
+          // costMetrics.spread, so the split reconciles to frictionCost exactly.
+          costFeeFraction: costMetrics.fee,
+          costSlippageFraction: costMetrics.slippage,
+          costSpreadFraction: spread,
           regime,
           regimeScore: regimeScoreRaw,
           signalType: stratDef.signalType,
```

# §2 FULL CURRENT FILE — client/src/lib/paper-trade-adapter.ts

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
    // Genuinely-null P/L → NaN (the cells isFinite-guard to an em-dash), never a
    // fabricated $0.00 next to a '—%' (Langston Step-4 note 2 — symmetry).
    grossProfitValue: grossPnl !== null ? parseFloat(grossPnl.toFixed(2)) : NaN,
    grossProfitPercent:
      grossPnl !== null && notional > 0 ? signedPct((grossPnl / notional) * 100) : "—",
    costs: parseFloat((num(row.totalCost) ?? 0).toFixed(4)),
    netProfitValue: num(row.netPnl) !== null ? parseFloat((num(row.netPnl) as number).toFixed(2)) : NaN,
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

# §3 FULL CURRENT FILE — server/tests/unit/paper-trade-adapter.test.ts

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
      netPnl: null,
      metadata: null,
    }) as Record<string, unknown>;
    expect(t.grossProfitPercent).toBe('—');
    // Null P/L → NaN, which the cells isFinite-guard to an em-dash — never $0.00
    // beside a '—%' (Langston Step-4 note 2).
    expect(Number.isNaN(t.grossProfitValue)).toBe(true);
    expect(Number.isNaN(t.netProfitValue)).toBe(true);
    expect(t.regime).toBe('—');
    expect('finalScore' in t).toBe(false);
    expect('hybridScore' in t).toBe(false);
    expect(t.rankingScore).toBeUndefined();
  });
});
```

# §4 ITEM-3 GREP EVIDENCE

Invocation (ripgrep over client/src, content mode):

```
rg -n "\.expectedEdge|\.regimeWeight|\.finalScore|\.hybridScore" client/src
```

Full hit list (verbatim):

```
client/src/components/trading/active-trades-v2.tsx:677:        {Number.isFinite(Number(trade.metadata?.regimeWeight)) ? Number(trade.metadata.regimeWeight).toFixed(2) : <span className="text-muted-foreground">—</span>}
client/src/components/trading/shadow-trades-tab.tsx:226:                          <td className="p-2 text-right font-mono text-xs">{fmt(m.finalScore, 4)}</td>
client/src/components/vts/vts-open-trades-table.tsx:82:        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
client/src/components/vts/vts-open-trades-table.tsx:83:        case 'regimeWeight': aVal = a.regimeWeight ?? 0; bVal = b.regimeWeight ?? 0; break;
client/src/components/vts/vts-open-trades-table.tsx:401:                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge != null ? trade.expectedEdge.toFixed(2) : '—'}</td>
client/src/components/vts/vts-open-trades-table.tsx:402:                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight != null ? trade.regimeWeight.toFixed(2) : '—'}</td>
client/src/components/vts/vts-closed-trades-table.tsx:83:        case 'expectedEdge': aVal = a.expectedEdge ?? 0; bVal = b.expectedEdge ?? 0; break;
client/src/components/vts/vts-closed-trades-table.tsx:84:        case 'regimeWeight': aVal = a.regimeWeight ?? 0; bVal = b.regimeWeight ?? 0; break;
client/src/components/vts/vts-closed-trades-table.tsx:409:                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.expectedEdge != null ? trade.expectedEdge.toFixed(2) : '—'}</td>
client/src/components/vts/vts-closed-trades-table.tsx:410:                  <td className="px-3 py-2 text-right font-mono text-xs">{trade.regimeWeight != null ? trade.regimeWeight.toFixed(2) : '—'}</td>
client/src/pages/analytics.tsx:3453:                              {decision.finalScore !== null && (
client/src/pages/analytics.tsx:3456:                                  <span className="ml-2">{decision.finalScore.toFixed(3)}</span>
```

Provenance of the two NON-table hits (verbatim excerpts):

**client/src/pages/analytics.tsx :3453-3456** — `decision` iterates `passiveDecisions?.decisions` (:3419, a passive-decision record, NOT OpenTrade/ClosedTrade) and is null-guarded before the deref:

```tsx
                              {decision.finalScore !== null && (
                                <div>
                                  <span className="text-muted-foreground">Final Score:</span>
                                  <span className="ml-2">{decision.finalScore.toFixed(3)}</span>
                                </div>
```

**client/src/components/trading/shadow-trades-tab.tsx :226** — `m` is a `ShadowMember` (own interface, :20 of that file, NOT OpenTrade/ClosedTrade), rendered through the null-safe `fmt()` helper:

```tsx
                          <td className="p-2 text-right font-mono text-xs">{fmt(m.finalScore, 4)}</td>
```

**client/src/components/trading/active-trades-v2.tsx :677** reads `trade.metadata?.regimeWeight` (a metadata lookup, isFinite-guarded) — and the whole file is the #528 pending delete.

Every remaining hit is inside the two shared tables themselves, all guarded (visible in §1). Corroboration: the bench tsc baseline (strict) reports no TS18048/TS2532 on these fields anywhere.

---

# §5 ADDENDUM (2026-07-17 ~09:30Z) — your #527 verify-condition answer + a §9.2-grade CORRECTION of my own claim + a rule-23 fix it surfaced

**Your condition (spread shadowing):** PASSES mechanically — `grep -n "spread" eval-cycle.ts` shows exactly ONE declaration in the function (was :639), no intervening redeclaration before the blend or the insertion.

**BUT my claim to you was FALSE, and I own it:** I described the blend's spread as "the LIVE measured lane spread." Reading the declaration to answer your condition showed `const spread = 0.001;` — a HARDCODED constant, and specifically CRYPTO's spread number (crypto spreadRateDefault = 0.0010, friction.ts:28), sitting in the xStock lane whose own static default is 0.0012 (12bps observed mid-range, xstock_spot/friction.ts:37) and whose `getCachedCostMetrics` ALREADY serves a per-symbol MEASURED spread with provenance (B-5 AMR Obj-12, cost-model.ts:60-61/:202). I inferred "live measured" without reading the declaration — the exact ruled-on-reported-fact trap.

**The rule-23 fix, implemented (diff below):** the const is DELETED; the blend at the Net-EV gate AND the #527 passthrough both consume `costMetrics.spread` (measured-with-fallback). Reconciliation still exact — the passthrough passes the same three terms the blend sums.

**Behavioral impact (honest statement):** this changes xStock VTS lane friction → expectedEdge → Net-EV admission. Telemetry-only lane (VTS, not active trading; no money moves). Direction: friction RISES by ≥2bps on static-fallback symbols (0.0010→0.0012) and by the measured delta where fresh samples exist — i.e. the lane was UNDER-frictioning, admitting marginally-too-optimistic xStock virtual trades. Bench: tsc baseline OK; reorg-b3.3x + b45-fee-model suites green.

```diff
diff --git a/server/asset_classes/xstock_spot/eval-cycle.ts b/server/asset_classes/xstock_spot/eval-cycle.ts
index e1828f9e3..35b1eaf4c 100644
--- a/server/asset_classes/xstock_spot/eval-cycle.ts
+++ b/server/asset_classes/xstock_spot/eval-cycle.ts
@@ -636,7 +636,13 @@ export async function evaluateXstockPairForVTS(
         const entryPrice = strategySignal.entryPrice;
         const takeProfit = strategySignal.targetPrice;
         const stopLoss = strategySignal.stopPrice;
-        const spread = 0.001;
+        // P19-B8.7 Step-9 FIX-ON-FIND (rule 23): `const spread = 0.001` DELETED.
+        // It was CRYPTO's spread constant hardcoded into the xStock lane — below
+        // even this class's own static default (0.0012, friction.ts:37, the
+        // observed 12bps mid-range) — and it silently overrode the per-symbol
+        // MEASURED spread that getCachedCostMetrics already serves for xstock
+        // (B-5 AMR Obj-12: measured-with-fallback + spreadSource provenance).
+        // The friction blend below now consumes costMetrics.spread.
         const hybridScore = computeRealHybridScore(strategyKey, mceContext.indicators, ohlc as any, regime);
         // B79.0n.SCORING (2026-05-26): assetClass threaded for per-class cache-key isolation.
         // xstock_spot file — hardcoded class literal matches file scope.
@@ -715,7 +721,10 @@ export async function evaluateXstockPairForVTS(
         // B79.0n.MCE: assetClass REQUIRED — this is the xStock eval cycle, so
         // the file-level ASSET_CLASS constant ('xstock_spot') is passed directly.
         const costMetrics = getCachedCostMetrics(symbol, ASSET_CLASS);
-        const totalFriction = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + spread;
+        // P19-B8.7 Step-9 (rule 23): costMetrics.spread — per-symbol MEASURED
+        // when the friction-sample store has a fresh sample, the class static
+        // default (0.0012) otherwise. Was a hardcoded 0.001 (crypto's constant).
+        const totalFriction = (costMetrics.fee * 2) + (costMetrics.slippage * 2) + costMetrics.spread;
         // P19-B8.5b (OBJ-3, #500): the predictiveConfidence×100 DI proxy is DELETED (rule 18 —
         // FINDING B's second site; the crypto twin died at vts-runner in the same diff). The
         // kernel now consumes the LANE-NATIVE real DI: the imf-evaluator's own computed value
@@ -976,6 +985,13 @@ export async function evaluateXstockPairForVTS(
           dollarValue,
           quantity,
           frictionCost: totalFriction,
+          // P19-B8.7 Step-9 (#527): the components behind totalFriction, for the
+          // UI cost 5-col split — the SAME three terms summed into the blend
+          // above (post rule-23 fix: costMetrics.spread, measured-with-fallback),
+          // so the split reconciles to frictionCost exactly.
+          costFeeFraction: costMetrics.fee,
+          costSlippageFraction: costMetrics.slippage,
+          costSpreadFraction: costMetrics.spread,
           regime,
           regimeScore: regimeScoreRaw,
           signalType: stratDef.signalType,
```

---

# §6 ADDENDUM 2 (2026-07-17 ~14:1xZ) — the Kyle-morning round + b28cf7074 reconciliation + the #528 delete, for Step-4 sign-off

Your item-2 answer (mixed-ordering render safety), verifiable in the §6 diff: the shared open-table cell branches on `trade.priceVenueQuiet ? <VenueQuietPrice/> : <normal/>` — `undefined` is falsy → normal render; the adapter additionally coerces `row.priceVenueQuiet === true` → literal false when the field is absent; the RTB cell branches identically on `signal.priceVenueQuiet ?`. Both orderings degrade to NOT-quiet (a quiet state renders as a plain number until the next refresh) — never a wrong badge, defined for `undefined` everywhere.

NEW SINCE §5, all Kyle-directed this morning (screenshot round) or sequencing fallout:
1. RTB header/data MISALIGNMENT fix — my rebuild had reordered the HEADERS (RankingScore next to Rank) but not the CELLS, so scores rendered under "Symbol" and symbols under "RankingScore" on staging. Cells reordered to match.
2. S.Wgt column REMOVED (display degenerate — every row at the 0.2 fallback/equal-weight). The L9→L10 machinery is NOT touched; kill-or-keep = #529 (B-STRATEGY-WEIGHT-INVESTIGATION), Kyle-sequenced as its OWN batch immediately BEFORE the #522 audit.
3. Duration column added (queue age from queued_at, rides the existing row spread — no server change; VTS formatDuration reused).
4. DBS pattern-pool carry (rule-23 find, Kyle-pushed, code-confirmed): addPatternPoolSurvivors had NO fields for the B63 DBS/DI the scanner had already computed — pattern-lane signals queued NULL unless the symbol coincidentally sat in the quant pool (lookup-order luck; live evidence: ONDO/USD + USDT/GBP NULL rows vs pattern siblings with values). Intake widened to the addSurvivors shape + the fx5-scanner caller passes the merged classified fields. Forward-only; no backfill.
5. b28cf7074 reconciliation per OLD Claude: shared open table + adapter now consume the SERVER priceVenueQuiet boolean; isVenueQuietSource import dropped; RTB carries his venue-quiet hunk under MY commit (option B, his explicit blessing on record).
6. #528 EXECUTED: active-trades-v2.tsx (1,362 lines) git-rm-ed — trigger fired (his push, which also reverted his in-file edits). DELETED_COMPONENTS_LOG entry carries the verbatim `const FEE_PERCENT = 0.0010;` / `const SLIPPAGE_PERCENT = 0.0015;` quote you required + blast-radius (zero importers post-swap).

Bench at ORIGIN HEAD b28cf7074 (bench pulled first — the earlier same-day bench predated his push): tsc baseline OK; adapter 13/13 + his venue suite 6/6 = 19/19.

```diff
diff --git a/client/src/components/trading/ready-to-buy-table.tsx b/client/src/components/trading/ready-to-buy-table.tsx
index 7297fdd3e..66e3cfe1c 100644
--- a/client/src/components/trading/ready-to-buy-table.tsx
+++ b/client/src/components/trading/ready-to-buy-table.tsx
@@ -5,11 +5,14 @@ import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { RefreshCw, TrendingUp, ArrowUpDown, Clock } from "lucide-react";
 import { cn, formatEntryFeeMode } from "@/lib/utils";
+import { VenueQuietPrice } from "./venue-quiet-price-cell";
 import { useWebSocket } from "@/hooks/use-websocket";
 import { getFrictionColorClasses, getRegimeBadgeClassName, getFrictionLabel, formatRegimeTitle } from "@/utils/frictionColor";
 // P19-B8.7 Step-9: the same stacked symbol-cell name source the VTS tables use.
 import { getAssetName } from "@shared/asset-names";
 import { useAssetNameOverlays } from "@/hooks/use-asset-name-overlays";
+// Kyle 2026-07-17: Duration column reuses the VTS minutes formatter (1h 5m / 2d 3h).
+import { formatDuration } from "@/components/vts/vts-shared";
 
 interface TradingSignal {
   id: string;
@@ -34,6 +37,9 @@ interface TradingSignal {
   volume24h: number | null;
   status: 'active' | 'reconfirmed' | 'promoted' | 'expired' | 'executed';
   detectedAt: string;
+  // Kyle 2026-07-17: queue-entry timestamp (rtb_signals.queued_at, rides the
+  // route's row spread) — the Duration column's anchor.
+  queuedAt?: string | null;
   estimatedQuantity?: number;
   estimatedValue?: number;
   marketRegime?: string;
@@ -42,6 +48,11 @@ interface TradingSignal {
   // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode snapshot carried on rtb_signals.
   chosenEntryMode?: string | null;
   entryFeeRate?: number | string | null;
+  // P19-B8.9 (OBJ-5): venue-quiet state for the Current column — server-side cache
+  // peek (never a fetch): true when no venue-tagged price fresher than the quiet
+  // threshold is held for this symbol.
+  priceVenueQuiet?: boolean;
+  priceAgeMs?: number | null;
 }
 
 interface TradingSignalsResponse {
@@ -49,7 +60,9 @@ interface TradingSignalsResponse {
   timestamp: string;
 }
 
-type SortField = 'rank' | 'symbol' | 'rankScore' | 'strategyWeight' | 'volume' | 'price' | 'strategy' | 'entry' | 'target' | 'stop' | 'quantity' | 'status' | 'marketRegime' | 'marketFriction' | 'dbs' | 'netEv';
+// Kyle 2026-07-17: 'strategyWeight' REMOVED with its column (S.Wgt — degenerate
+// display, see the header comment at the removal site); 'queueAge' added (Duration).
+type SortField = 'rank' | 'symbol' | 'rankScore' | 'volume' | 'price' | 'strategy' | 'entry' | 'target' | 'stop' | 'quantity' | 'status' | 'marketRegime' | 'marketFriction' | 'dbs' | 'netEv' | 'queueAge';
 type SortDirection = 'asc' | 'desc';
 
 export default function ReadyToBuyTable() {
@@ -150,9 +163,10 @@ export default function ReadyToBuyTable() {
         aValue = a.chosenNetEv != null ? Number(a.chosenNetEv) : -Infinity;
         bValue = b.chosenNetEv != null ? Number(b.chosenNetEv) : -Infinity;
         break;
-      case 'strategyWeight':
-        aValue = a.strategyWeight ?? 0;
-        bValue = b.strategyWeight ?? 0;
+      case 'queueAge':
+        // Older queue entry = larger age; missing timestamp sorts newest.
+        aValue = a.queuedAt ? Date.now() - new Date(a.queuedAt).getTime() : 0;
+        bValue = b.queuedAt ? Date.now() - new Date(b.queuedAt).getTime() : 0;
         break;
       case 'symbol':
         aValue = a.symbol;
@@ -317,7 +331,13 @@ export default function ReadyToBuyTable() {
                   {/* Kyle 2026-07-17: RankingScore sits NEXT TO Rank. */}
                   <SortHeader field="rankScore" label="RankingScore" />
                   <SortHeader field="symbol" label="Symbol" />
-                  <SortHeader field="strategyWeight" label="S.Wgt" />
+                  {/* Kyle 2026-07-17: S.Wgt column REMOVED — the displayed value was
+                      degenerate (every row at the 0.2 equal-weight/fallback), so it
+                      conveyed nothing. The L9 weight MACHINERY is NOT dead (it feeds
+                      the L10 exposure-bias multipliers) — its functioning-vs-degenerate
+                      investigation is #529 (B-STRATEGY-WEIGHT-INVESTIGATION), its own
+                      batch sequenced immediately BEFORE the #522 runtime audit (Kyle);
+                      full metric retirement only after that trace. */}
                   <SortHeader field="price" label="Price" />
                   <SortHeader field="entry" label="Entry" />
                   <SortHeader field="target" label="Target" />
@@ -333,6 +353,8 @@ export default function ReadyToBuyTable() {
                   <SortHeader field="netEv" label="Net EV" />
                   {/* P19-B7.2b (OBJ-C): entry fee-mode (maker/taker) column — non-sortable */}
                   <th className="text-left py-2 px-3 font-medium" data-testid="header-entry-fee-mode">Entry Fee Mode</th>
+                  {/* Kyle 2026-07-17: time in the ready-to-buy queue (queued_at → now). */}
+                  <SortHeader field="queueAge" label="Duration" />
                   <SortHeader field="status" label="Status" />
                 </tr>
               </thead>
@@ -370,6 +392,19 @@ export default function ReadyToBuyTable() {
                           {rank}
                         </span>
                       </td>
+                      {/* Kyle 2026-07-17 (screenshot): the CELL order now matches the
+                          header order — RankingScore BEFORE Symbol. The rebuild had
+                          reordered only the headers, so scores rendered under "Symbol"
+                          and symbols under "RankingScore". S.Wgt cell REMOVED with its
+                          column (degenerate display; see the header-side comment). */}
+                      <td className="text-right py-3 px-3" data-testid={`text-ranking-score-${index}`}>
+                        <span className={cn(
+                          "font-semibold font-mono",
+                          rankScore !== null && rankScore > 0 ? "text-success" : "text-muted-foreground"
+                        )}>
+                          {rankScore !== null && !isNaN(rankScore) ? rankScore.toFixed(4) : '—'}
+                        </span>
+                      </td>
                       {/* P19-B8.7 Step-9: stacked symbol cell — symbol + display name +
                           class badge, the same getAssetName composition the VTS
                           tables use (Kyle's stacked-name directive). */}
@@ -386,30 +421,23 @@ export default function ReadyToBuyTable() {
                           )}
                         </div>
                       </td>
-                      {/* P19-B8.7 Step-9: the ATTACHED rank key (RankingScore) — the
-                          number that actually orders promotion, any config arm.
-                          FinalScore + ML Conf cells REMOVED (inert / fabricated). */}
-                      <td className="text-right py-3 px-3" data-testid={`text-ranking-score-${index}`}>
-                        <span className={cn(
-                          "font-semibold font-mono",
-                          rankScore !== null && rankScore > 0 ? "text-success" : rankScore !== null ? "text-muted-foreground" : "text-muted-foreground"
-                        )}>
-                          {rankScore !== null && !isNaN(rankScore) ? rankScore.toFixed(4) : '—'}
-                        </span>
-                      </td>
-                      <td className="text-right py-3 px-3" data-testid={`text-strategy-weight-${index}`}>
-                        <span className={cn(
-                          "font-semibold",
-                          (signal.strategyWeight ?? 0) >= 0.5 ? "text-amber-600" : (signal.strategyWeight ?? 0) >= 0.3 ? "text-amber-400" : "text-muted-foreground"
-                        )}>
-                          {signal.strategyWeight !== null && !isNaN(signal.strategyWeight) ? `${(signal.strategyWeight * 100).toFixed(1)}%` : '—'}
-                        </span>
-                      </td>
+                      {/* P19-B8.9 (OBJ-5): the stored row price wears the venue-quiet badge
+                          when we hold no fresh venue-tagged value for the symbol (server-side
+                          cache peek — never a fetch). */}
                       <td className="text-right py-3 px-3 font-mono" data-testid={`text-price-${index}`}>
-                        {!isNaN(currentPrice) 
-                          ? `$${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}`
-                          : '—'
-                        }
+                        {signal.priceVenueQuiet ? (
+                          <VenueQuietPrice
+                            price={!isNaN(currentPrice) ? currentPrice : null}
+                            ageMs={signal.priceAgeMs}
+                            decimals={currentPrice < 1 ? 4 : 2}
+                            className="text-right"
+                            testId={`cell-current-venue-quiet-${index}`}
+                          />
+                        ) : (
+                          !isNaN(currentPrice)
+                            ? `$${currentPrice.toFixed(currentPrice < 1 ? 4 : 2)}`
+                            : '—'
+                        )}
                       </td>
                       <td className="text-right py-3 px-3 font-mono font-semibold text-success" data-testid={`text-entry-${index}`}>
                         {!isNaN(entryPrice) 
@@ -513,6 +541,16 @@ export default function ReadyToBuyTable() {
                       <td className="py-3 px-3 text-xs" data-testid={`text-entry-fee-mode-${index}`}>
                         {formatEntryFeeMode(signal.chosenEntryMode, signal.entryFeeRate)}
                       </td>
+                      {/* Kyle 2026-07-17: time in the queue since queued_at; the 30s
+                          auto-refresh keeps it current. Missing timestamp → em-dash. */}
+                      <td className="py-3 px-3 text-xs whitespace-nowrap" data-testid={`text-queue-age-${index}`}>
+                        {signal.queuedAt ? (
+                          <span className="inline-flex items-center gap-1">
+                            <Clock className="w-3 h-3 text-muted-foreground" />
+                            {formatDuration(Math.max(0, Math.floor((Date.now() - new Date(signal.queuedAt).getTime()) / 60000)))}
+                          </span>
+                        ) : '—'}
+                      </td>
                       <td className="py-3 px-3" data-testid={`text-status-${index}`}>
                         <span className={cn(
                           "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
diff --git a/client/src/components/vts/vts-open-trades-table.tsx b/client/src/components/vts/vts-open-trades-table.tsx
index ab63f4e24..551fc7bdd 100644
--- a/client/src/components/vts/vts-open-trades-table.tsx
+++ b/client/src/components/vts/vts-open-trades-table.tsx
@@ -8,6 +8,12 @@ import { Clock } from "lucide-react";
 import { format } from "date-fns";
 import { getFrictionLabel } from "@/utils/frictionColor";
 import { formatEntryFeeMode } from "@/lib/utils";
+// P19-B8.7 Step-9 (B8.9 carry, reconciled to OLD Claude's pushed b28cf7074): the
+// venue-quiet Current-price treatment is ONE portable renderer driven by the
+// SERVER's single age-aware priceVenueQuiet boolean (no client-side source
+// classification — the age-blind helper was removed with his push). Paper
+// adapter rows carry priceVenueQuiet/priceAgeMs; VTS rows don't (normal render).
+import { VenueQuietPrice } from "@/components/trading/venue-quiet-price-cell";
 import {
   type OpenTrade,
   type OpenSortField,
@@ -23,7 +29,28 @@ import {
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
@@ -52,9 +79,10 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
@@ -93,7 +121,8 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
         onScroll={handleTopScroll}
         style={{ scrollbarWidth: 'thin' }}
       >
-        <div style={{ width: '2300px', height: '1px' }} />
+        {/* initial spacer width only; the HF7 effect re-syncs it to the real scrollWidth */}
+        <div style={{ width: '2700px', height: '1px' }} />
       </div>
       <div
         ref={scrollRef}
@@ -105,7 +134,7 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
             max-height so the sticky thead + sticky first-column work correctly. Header
             stays pinned on vertical scroll; Symbol column stays pinned on horizontal
             scroll. Top-left corner uses z-30 so it sits above both axes. */}
-        <table className="w-full min-w-[2400px] text-sm">
+        <table className="w-full min-w-[2700px] text-sm">
           <thead className="sticky top-0 bg-card z-20">
             <tr className="border-b border-border">
               {/* B69.1 (2026-05-04): asset class badge stacked below symbol in same cell.
@@ -130,7 +159,14 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
@@ -146,13 +182,18 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
+                {/* colSpan 33 = 32 standard columns post cost-split + 1 headroom for
+                    appended paper columns (browsers clamp overshoot to the row width;
+                    matches the closed table's 32+1 pattern — Langston Step-4 note 1). */}
+                <td colSpan={33} className="px-3 py-8 text-center text-muted-foreground">
+                  {emptyLabel}
                 </td>
               </tr>
             ) : (
@@ -286,9 +327,16 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                   <td className="px-3 py-2 text-right">
                     <div className="flex flex-col gap-0.5">
                       <span className="font-mono text-xs">${trade.entryPrice.toFixed(4)}</span>
-                      <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
-                        {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
-                      </span>
+                      {/* P19-B8.7 Step-9 (B8.9 carry): the server's age-aware quiet
+                          verdict drives the treatment — one notion, no per-surface
+                          drift. Rows without the flag (VTS) render exactly as before. */}
+                      {trade.priceVenueQuiet ? (
+                        <VenueQuietPrice price={trade.currentPrice} ageMs={trade.priceAgeMs} decimals={4} className="text-xs" />
+                      ) : (
+                        <span className={`font-mono text-xs ${trade.currentPrice === null ? 'text-yellow-500' : 'text-muted-foreground'}`}>
+                          {trade.currentPrice !== null ? `$${trade.currentPrice.toFixed(4)}` : 'Stale'}
+                        </span>
+                      )}
                     </div>
                   </td>
                   <td className="px-3 py-2 text-right">
@@ -317,6 +365,20 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
@@ -334,9 +396,11 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
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
@@ -369,6 +433,8 @@ export function OpenTradesTable({ trades }: { trades: OpenTrade[] }) {
                       {formatDuration(trade.durationOpenMinutes)}
                     </div>
                   </td>
+                  {/* P19-B8.7 Step-9: paper-only appended cells (default OFF) */}
+                  {renderExtraCells?.(trade, idx)}
                 </tr>
               ))
             )}
diff --git a/client/src/components/vts/vts-shared.tsx b/client/src/components/vts/vts-shared.tsx
index 775d0ce7a..23b6ccba3 100644
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
@@ -67,6 +73,18 @@ export interface OpenTrade {
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
+  // P19-B8.7 Step-9 (B8.9 carry, b28cf7074 reconciled): the SERVER's single
+  // age-aware venue-quiet verdict + price age for the Current cell. Paper rows
+  // carry these; VTS rows don't (normal render).
+  priceVenueQuiet?: boolean;
+  priceAgeMs?: number | null;
 }
 
 export interface ClosedTrade {
@@ -92,10 +110,16 @@ export interface ClosedTrade {
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
@@ -132,6 +156,15 @@ export interface ClosedTrade {
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
@@ -345,7 +378,8 @@ export function isBenchmarkSymbol(symbol: string): boolean {
   return BENCHMARK_BASE_COINS.includes(base);
 }
 
-export type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'finalScore' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
+// P19-B8.7 Step-9: 'finalScore' removed with its column (retired metric, piece 2.7).
+export type OpenSortField = 'symbol' | 'regime' | 'strategy' | 'pool' | 'dollarValue' | 'entryPrice' | 'grossProfitValue' | 'netProfitValue' | 'expectedEdge' | 'regimeWeight' | 'entryTime' | 'durationOpenMinutes';
 export type SortDirection = 'asc' | 'desc';
 
 export function SortableHeader({
diff --git a/server/services/active-filter-pool.ts b/server/services/active-filter-pool.ts
index 15d47aaa8..b1eded12a 100644
--- a/server/services/active-filter-pool.ts
+++ b/server/services/active-filter-pool.ts
@@ -340,6 +340,15 @@ class ActiveFilterPoolService {
       currentPrice: number;
       volume24h: number;
       dailyRange: number;
+      // P19-B8.7 rider (Kyle 2026-07-17, code-confirmed): the pattern intake DROPPED
+      // the B63 DBS/DI the scanner had already computed — this writer had no fields
+      // for them, so pattern-lane signals queued with NULL dbs/di UNLESS the same
+      // symbol happened to sit in the quant pool (lookup order luck). Same optional
+      // shape as addSurvivors; absent stays honest-undefined, never fabricated.
+      dbsScore?: number;
+      dbsCategory?: string;
+      dbsSlope?: number;
+      DI?: number;
     }>
   ): {
     added: number;
@@ -379,6 +388,13 @@ class ActiveFilterPoolService {
         source: mode,
         sourcePool: 'pattern',       // Phase 14.5: pattern pool origin
         assetClass: 'crypto_spot',   // Phase 14.5: default asset class
+        // P19-B8.7 rider: carry the scanner's B63 DBS + DI onto pattern entries
+        // (parity with addSurvivors) so pattern-lane signals queue with a real
+        // dbs_score_at_queue / di_at_queue instead of a coverage-luck NULL.
+        dbsScore: survivor.dbsScore,
+        dbsCategory: survivor.dbsCategory,
+        dbsSlope: survivor.dbsSlope,
+        di: survivor.DI,
         fx5Snapshot: {
           volume24h: survivor.volume24h,
           dailyRange: survivor.dailyRange,
diff --git a/server/services/fx5-scanner.ts b/server/services/fx5-scanner.ts
index f61cd2ffa..d5942b34f 100644
--- a/server/services/fx5-scanner.ts
+++ b/server/services/fx5-scanner.ts
@@ -1423,6 +1423,14 @@ export class Fx5ScannerService {
             currentPrice: s.currentPrice ?? 0,
             volume24h: s.volume24h ?? 0,
             dailyRange: s.dailyRange ?? 0,
+            // P19-B8.7 rider (Kyle 2026-07-17): patternPoolSurvivors are built by
+            // merging the B63-CLASSIFIED pair (spread at :1267), so the scanner's
+            // DBS + DI are in hand RIGHT HERE — the old map dropped them at the
+            // pool door, which is why pattern signals queued with NULL dbs/di.
+            dbsScore: (s as any).dbsScore,
+            dbsCategory: (s as any).dbsCategory,
+            dbsSlope: (s as any).dbsSlope,
+            DI: (s as any).DI,
           })));
           console.log(`[14.5][PATTERN_POOL] Pattern pool populated: added=${patternStats.added}, skipped=${patternStats.skipped}`);
         }
```

---

# §7 — BLOCKER RESPONSE (2026-07-17 ~14:2xZ): the CURRENT post-b28cf7074 paper-trade-adapter.ts, full file

Your read was exactly right: §2 was a stale paste assembled BEFORE the b28cf7074 pull + reconciliation (the assembly command cat-ed the file at that moment; the reconciliation edits landed ~40 min later and §6 showed only the DIFFS, so the artifact self-contradicted at the seam). The WORKING TREE was already reconciled — grep receipt: line 71 `priceVenueQuiet?: boolean;` (input type), line 252 `priceVenueQuiet: row.priceVenueQuiet === true,` (emit, absent→literal false); zero `priceSource` hits anywhere in the file. Full current file below — §2 is SUPERSEDED by this section.

Your §5 governance flag (SIM note + completion-report line for the xStock friction behavioral change) and the fx5 `as any` survivor-typing follow-up are both accepted and recorded for the governance step.

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
  // The server's age-aware venue-quiet verdict + price age (B8.9 carry,
  // b28cf7074: /active-engine/active-trades now serializes the boolean).
  priceVenueQuiet?: boolean;
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
    // The server's venue-quiet verdict → the shared Current cell renders the
    // quiet treatment (B8.9 carry; server-decided, age-aware, one notion).
    priceVenueQuiet: row.priceVenueQuiet === true,
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
    // Genuinely-null P/L → NaN (the cells isFinite-guard to an em-dash), never a
    // fabricated $0.00 next to a '—%' (Langston Step-4 note 2 — symmetry).
    grossProfitValue: grossPnl !== null ? parseFloat(grossPnl.toFixed(2)) : NaN,
    grossProfitPercent:
      grossPnl !== null && notional > 0 ? signedPct((grossPnl / notional) * 100) : "—",
    costs: parseFloat((num(row.totalCost) ?? 0).toFixed(4)),
    netProfitValue: num(row.netPnl) !== null ? parseFloat((num(row.netPnl) as number).toFixed(2)) : NaN,
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
