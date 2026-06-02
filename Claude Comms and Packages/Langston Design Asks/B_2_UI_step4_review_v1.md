# B.2.UI — Step 4 code review (embedded diffs)

**Batch:** B.2.UI (Phase 24, B.2 support). **Mode:** active trading OFF / VTS passive — additive only, no calibration/threshold change. **Reviewer:** Langston (Step 4, pre-push). **From:** CC. **Date:** 2026-06-02.

**What it does (recap):** adds a NEW **"Volume / Order Book"** column immediately AFTER the **TEC State** column on BOTH the Open + Closed **Simulated Trades** tables (ML page), and surfaces the **`failed_min_depth`** order-book-depth gate in the **xStocks Filter Diagnostics** tab (last-scan + 24h). Cell is asset-aware: xStock → `$<depth> · OB` (ask-side order-book depth USD); crypto → `<vol> QTY` (native 24h coin-unit volume, no $ conversion — per Kyle's design refinement, removes the units risk you flagged in scope Q3). Capture is at trade-OPEN; existing 287 open + ~1,696 closed trades carry no value → render "—" (no backfill).

**Field contract:** `entryLiquidityValue?: number` + `entryLiquidityKind?: 'depth_usd' | 'volume_qty'`, captured at open, propagated open→close→JSONL, read back on both ML feeds.

## INFRASTRUCTURE NOTE (please read first)
- **DO NOT `cd /mnt/gdrive` and DO NOT run `git status`/`git log` on the gdrive-mounted repo** — it hangs on the FUSE mount. All load-bearing diffs are embedded below.
- For any repo-side inspection beyond these snippets, use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.
- Local-FS files you can Read directly (fast): this file at `/home/langston/inbox/b2ui/B_2_UI_step4_review_v1.md`.

## Local verification already done (C:\dev bench)
- **tsc:** whole-project error count **493 before == 493 after** my 6 files → **zero net new type errors**. (Scoped before/after diff isolated exactly one transient new error — the close-copy object literal — which is the `vts-service.ts` param-type + record edits below; now clean.)
- **vitest:** failing-test set **identical before vs after** (same 11 DB-backed integration files that fail in the bench for lack of a database; CI runs them green). **Zero new test failures.**
- No new unit test added: the vitest harness is **server-only** (`server/**/*.test.ts`); the one piece of real logic is a pure client-side display formatter, and the rest are additive object passthroughs fully covered by tsc + the §9.3 UI check. Flag if you want a server-side shape test anyway.

## NEW/MODIFIED files (6)

### 1. server/asset_classes/xstock_spot/eval-cycle.ts — capture xStock entry depth at open
```diff
@@ registerOpenVtsTrade(...) call, after phaseAgeSeconds @@
+          entryLiquidityValue: askDepthUsd >= 0 ? askDepthUsd : undefined,
+          entryLiquidityKind: 'depth_usd',
```
`askDepthUsd` is the same ask-side depth the LQ gate consumes (function param, computed in scanner.ts). Ask-only by design (mirrors what the liquidity screen actually saw — scope Q2, CC leaned ask-only).

### 2. server/services/vts-runner.ts — interfaces + crypto capture + open-feed + close-copy
```diff
@@ OpenVirtualTrade interface @@
+  entryLiquidityValue?: number;
+  entryLiquidityKind?: 'depth_usd' | 'volume_qty';

@@ RegisterOpenVtsTradeInput interface @@
+  entryLiquidityValue?: number;
+  entryLiquidityKind?: 'depth_usd' | 'volume_qty';

@@ registerOpenVtsTrade openTrade mapping, after executionContext:'VTS' @@
+    entryLiquidityValue: input.entryLiquidityValue,
+    entryLiquidityKind: input.entryLiquidityKind,

@@ inline crypto trade-open builder @@
+    entryLiquidityValue: (tradeAssetClass === 'crypto_spot' && typeof priceData?.volume24h === 'number' && priceData.volume24h > 0)
+      ? priceData.volume24h : undefined,
+    entryLiquidityKind: tradeAssetClass === 'crypto_spot' ? 'volume_qty' : undefined,

@@ getOpenVirtualTradesForML return TYPE @@
+  entryLiquidityValue?: number;
+  entryLiquidityKind?: 'depth_usd' | 'volume_qty';

@@ getOpenVirtualTradesForML push object, after assetClass @@
+    entryLiquidityValue: trade.entryLiquidityValue,
+    entryLiquidityKind: trade.entryLiquidityKind,

@@ persistRealPriceTrade close-copy object, after assetClass @@
+    entryLiquidityValue: trade.entryLiquidityValue,
+    entryLiquidityKind: trade.entryLiquidityKind,
```
Crypto value is `priceData.volume24h` in **coin units** (NOT USD) — class-guarded so xStock never picks up a crypto-volume kind here, and crypto never gets a depth kind.

### 3. server/services/vts-service.ts — persist into the JSONL (the load-bearing link for Closed)
```diff
@@ persistRealPriceTrade parameter type, after assetClass?: string @@
+    entryLiquidityValue?: number;
+    entryLiquidityKind?: 'depth_usd' | 'volume_qty';

@@ trade: VirtualTrade record (the object logTrade() writes), after regimeConfidenceModulated @@
+    entryLiquidityValue: tradeData.entryLiquidityValue ?? null,
+    entryLiquidityKind: tradeData.entryLiquidityKind ?? null,
```
**This is the critical wiring I almost missed:** the closed-trade record is built by EXPLICIT field-mapping (not a spread), and `logTrade(trade)` is what writes the JSONL the Closed feed reads. Without the second hunk the closed-feed whitelist (file #4) would read nothing. Record is cast `as any` so no interface edit needed.

### 4. server/utils/export-csv.ts — Closed feed return type + whitelist
```diff
@@ getClosedVTSTradesFromLogs return-type declaration, after regimeConfidenceModulated @@
+  entryLiquidityValue: number | null;
+  entryLiquidityKind: string | null;

@@ per-trade mapped object, after regimeConfidenceModulated @@
+            entryLiquidityValue: typeof trade.entryLiquidityValue === 'number' ? trade.entryLiquidityValue : null,
+            entryLiquidityKind: typeof trade.entryLiquidityKind === 'string' ? trade.entryLiquidityKind : null,
```

### 5. server/routes.ts — surface failed_min_depth in xStocks Filter Diagnostics (4 builders)
Source counter is `failed_min_depth` in BOTH global-filter.ts (L139) and pattern-filter.ts (L228) — exact key match, no rename mapping (unlike spread's `failed_max_bid_ask_spread → failed_spread`).
```diff
@@ emptyGlobal defaults @@
+        failed_min_depth: 0,
@@ emptyPatternGlobal defaults @@
+        failed_min_depth: 0,
@@ buildGlobalFromCounters @@
+          failed_min_depth: gc.failed_min_depth ?? 0,
@@ buildPatternGlobalFromCounters @@
+          failed_min_depth: pfc.failed_min_depth ?? 0,
```
`failed_min_depth` is applicable for xStock (it's the real liquidity screen) → NOT added to any `applicable:false` map. The diagnostics tables iterate counter keys dynamically → both last-scan + 24h auto-populate.

### 6. client/src/pages/machine-learning.tsx — the column + formatter + diagnostics label
```diff
@@ OpenTrade interface + ClosedTrade interface @@
+  entryLiquidityValue?: number | null;
+  entryLiquidityKind?: 'depth_usd' | 'volume_qty' | null;

@@ module scope, after formatDuration @@
+function formatEntryLiquidity(value?: number | null, kind?: string | null): string {
+  if (value == null || !Number.isFinite(value)) return '—';
+  if (kind === 'depth_usd') return `$${Math.round(value).toLocaleString()} · OB`;
+  if (kind === 'volume_qty') return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} QTY`;
+  return '—';
+}

@@ Open table: NEW <th> "Volume / Order Book" after TEC State <th> @@
@@ Open table: NEW <td> after TEC State <td> (whitespace-normal break-words so it can wrap) @@
+  <td className="px-3 py-2"><span className="font-mono text-xs text-muted-foreground whitespace-normal break-words">
+    {formatEntryLiquidity(trade.entryLiquidityValue, trade.entryLiquidityKind)}</span></td>
@@ Open empty-state colSpan 26 → 27 @@

@@ Closed table: same NEW <th> + NEW <td> after its TEC State cell @@
@@ Closed empty-state colSpan 25 → 26 @@

@@ formatFilterName names map @@
+      failed_min_depth: 'Min Depth',
```

## Questions for you
1. Sign off on **ask-only** depth for the xStock cell (matches the LQ gate input, scope Q2)?
2. Any objection to **no new unit test** given the server-only harness + pure-formatter rationale above?
3. Anything in the open→close→JSONL→readback chain you want me to re-verify before push?

If no revisions, I'll push from the Google Drive folder, confirm CI all-4-green, deploy, and do the §9.3 on-screen check on both tables + the diagnostics tab.
