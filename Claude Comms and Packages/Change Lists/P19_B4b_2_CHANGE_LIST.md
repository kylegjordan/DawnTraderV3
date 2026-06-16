# P19-B4b.2 — Change List (Step-4 code review) — dead paper-fill machinery sweep (#300)

**Author:** Claude New (CC-B) · **Date:** 2026-06-16 · **For:** Langston Step-4 review BEFORE push.
**Diffstat:** `5 files changed, 20 insertions(+), 319 deletions(-)` — `realtime-paper-executor.ts` deleted (−255), 4 surgical edits.
**Bench (C:\dev @ GitHub head bf1cc04 + these edits):** tsc baseline gate **OK — no regressions above baseline**; vitest **1979/1979 passed (173 files), 0 failures**. No test imported the deleted file/endpoint/accessor (asserted: `grep` of `server/tests` + `**/*.test.ts` → 0 hits — your diff-guard #3).
**INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git on the gdrive mount. Hunks are embedded below; use `ssh staging` for any repo-side inspection.**

All three of your Step-4 diff-guards are confirmed in the hunks below: (#1) `market-data-ws.ts:204 this.lastTickTimestamp = Date.now()` SURVIVES — only the snapshot+emit around it are cut. (#2) the `system-health-monitor` reroute keeps it a LIVE coordinator consumer (`getMarketDataCoordinator` import added) — I will carry `getExecutionMetrics()` into #301's caller trace when I open it. (#3) asserted above.

---

## A1 — DELETE `server/services/realtime-paper-executor.ts` (whole file, −255)
`executeTrade()` had 0 callers (the two `.executeTrade(` hits in the tree are `trading-engine`'s own method + a different `engine` object); `recordPaperTrade()` was never finished (`"just log - will integrate with storage in next step"`). Only live surface was `getStatus()` (a pass-through wrapper) consumed by A2 + A3, now both detached. Archived to `1-system-manual/_archive/deleted-code/realtime-paper-executor.ts.removed` per rule-18. Logged in `DELETED_COMPONENTS_LOG.md`.

## A2 — `server/routes.ts` — remove dead `GET /api/execution/metrics`
```diff
@@ export async function registerRoutes(app: Express)
   // ==================== Phase 8.5: Real-Time Execution Layer ====================
 
-  // Get execution metrics
-  apiRouter.get('/execution/metrics', authenticateToken, async (req: AuthenticatedRequest, res) => {
-    try {
-      const { realtimePaperExecutor } = await import('./services/realtime-paper-executor');
-      const { executionTiming } = await import('./services/execution-timing');
-      const { rateControl } = await import('./services/rate-control');
-      const execStatus = realtimePaperExecutor.getStatus();
-      ... (res.json with marketData / execution / rateControl / killSwitch[undefined] / concurrency) ...
-    } catch (error: any) { ... }
-  });
+  // (P19-B4b.2 / #300) GET /api/execution/metrics removed — backed by the now-deleted
+  // realtime-paper-executor, 0 client consumers (UI ExecutionMetricsPanel reads a
+  // different surface). /execution/timing/export below stays (reads executionTiming directly).
 
   // Export execution timing data to CSV
   apiRouter.get('/execution/timing/export', ...   // UNTOUCHED — does not import the executor
```

## A3 — `server/services/system-health-monitor.ts` — reroute `getExecutionMetrics()` (value-identical)
```diff
-import { realtimePaperExecutor } from './realtime-paper-executor';
+import { getMarketDataCoordinator } from './market-data-coordinator';
+import { rateControl } from './rate-control';
 import { executionTiming } from './execution-timing';
@@ private getExecutionMetrics() {
     try {
-      const executorStatus = realtimePaperExecutor.getStatus();
+      // realtime-paper-executor was a dead pass-through over exactly these three sources.
+      const mdStatus = getMarketDataCoordinator().getStatus();
+      const rateStatus = rateControl.getStatus('private');
       const execTimingMetrics = executionTiming.getMetrics(10);
       return {
-        marketDataSource: executorStatus.marketData.source as 'ws' | 'rest_fallback' | 'N/A',
-        lastTickAgeMs: executorStatus.marketData.lastTickAgeMs,
+        marketDataSource: mdStatus.dataSource as 'ws' | 'rest_fallback' | 'N/A',
+        lastTickAgeMs: mdStatus.lastTickAgeMs,
         avgSubmitAckMs: ..., avgSlippageBps: ..., avgFeesPerTrade: ...,   // unchanged (executionTiming)
-        ratePressure: executorStatus.rateControl.backpressure,
+        ratePressure: rateStatus.backpressure,
       };
     } catch (error) { ... }   // try/catch + 'N/A' defaults UNTOUCHED
```
The executor's `getStatus()` already built `marketData.source` from `mdCoordinator.getStatus().dataSource`, `marketData.lastTickAgeMs` from the same, and `rateControl.backpressure` from `rateControl.getStatus('private')` — so these reads are byte-identical, just without the dead indirection.

## B1 — `server/services/market-data-coordinator.ts` — remove dead order-book read path
```diff
-import { getMarketDataWS, TickData, OrderBookSnapshot } from './market-data-ws';
+import { getMarketDataWS, TickData } from './market-data-ws';
@@ class MarketDataCoordinator
   private latestTicks: Map<string, TickData> = new Map();
-  private latestOrderBooks: Map<string, OrderBookSnapshot> = new Map();
@@ setupWebSocketHandlers()
-    // Forward order book data
-    this.wsClient.on('orderbook', (book: OrderBookSnapshot) => {
-      this.latestOrderBooks.set(book.symbol, book);
-      this.emit('orderbook', book);      // <- 0 listeners (verified)
-    });
     // Handle connection events     // (tick handler, fallback, getStatus all UNTOUCHED)
@@
-  public getLatestOrderBook(symbol: string): OrderBookSnapshot | undefined {   // <- only caller was the deleted executor
-    return this.latestOrderBooks.get(symbol);
-  }
```

## B2 — `server/services/market-data-ws.ts` — remove dead `'orderbook'` emission only
```diff
           const sortedBids = Array.from(book.bids.entries()).sort((a, b) => b[0] - a[0]);
           const sortedAsks = Array.from(book.asks.entries()).sort((a, b) => a[0] - b[0]);
-          const snapshot: OrderBookSnapshot = {
-            symbol, bids: sortedBids.slice(0,10), asks: sortedAsks.slice(0,10), timestamp: ...,
-          };
+          // (P19-B4b.2 / #300) dead snapshot + 'orderbook' emit removed; mini-book + midpoint LIVE.
           this.lastTickTimestamp = Date.now();        // <- GUARD #1: SURVIVES
-          this.emit('orderbook', snapshot);
           // Emit tick with midpoint for stable pricing
           if (sortedBids.length > 0 && sortedAsks.length > 0) { ... this.emit('tick', tickData); }   // LIVE — UNTOUCHED
```
The `book` subscription, the stateful mini-book, and the midpoint-`'tick'` emission stay (load-bearing for the live tick stream). The `OrderBookSnapshot` interface export stays (`slippage-fee-model` type-imports it).

---
**STAYS (per your Q rulings):** `slippage-fee-model.calculatePriceImpact` (golden-test ref; parent module still imported by `pre-execution-validator` #297 + `routes.ts`); `pre-execution-validator.ts` (#297). **Out of scope → #301:** the vestigial `MarketDataCoordinator`/`MarketDataWebSocket` subsystem (zero `subscribeToPair` callers) + the "is the health `execution` block itself dead?" follow-up (your Q2 home).

**Ask:** approve for push. On your APPROVE I push → CI → deploy → Step-7 verify (incl. `/api/execution/metrics` now 404) → governance close.
