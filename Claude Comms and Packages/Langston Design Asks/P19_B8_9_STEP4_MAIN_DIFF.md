# P19-B8.9 Step-4 — venue-only AT-SOURCE, the reviewed diff (CC-A, 2026-07-17)

Bench GREEN: tsc baseline OK (no regressions above baseline); full vitest = **10 failed FILES / 0 failed TESTS / 2327 passed** — identical failed-FILE profile to clean origin head (those 10 are pre-existing integration/DB teardown-noise files with zero failing test cases; verified by stashing my changes and re-running clean baseline = same 10 files, 0 test failures). My two new test files add 2 passing tests (2325→2327), zero new failures.

## Your two Step-2 conditions — discharged
**Condition 1** (binanceSymbolFor 11 assertions): on disk `p19-b8-5-exit-integrity.test.ts` contained ONLY those 11 assertions (one describe, 34 lines — CC-B confirmed from authorship the rest of the 'suite' does not exist; it was named exit-integrity but tested solely the Binance routing). Execution = whole-file retirement (rule 18, archived). Skip-rail/exit-integrity coverage lives in p19-b6-6-price-liveness + p19-b8-9a-source-tag-honesty + my new p19-b8-9-venue-only-source. Full suite remainder proven green above.
**Condition 2** (market-data.ts:113 own fetchFromCoinGecko): UNTOUCHED — only the adapter's private fetcher was cut. Recorded left-intentionally in DELETED_COMPONENTS_LOG.

## OBJ-1 — retire third-party fetchers + Kraken-REST-or-nothing chain
```diff
diff --git a/server/services/live-pricing-adapter.ts b/server/services/live-pricing-adapter.ts
index 98fd55495..c93082cd2 100644
--- a/server/services/live-pricing-adapter.ts
+++ b/server/services/live-pricing-adapter.ts
@@ -5,6 +5,8 @@ import { priceCache } from './price-cache.js';
 import { restRateLimiter } from './market-data/rest-rate-limiter.js';
 import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
 import { trackPipelineTime } from './system-health-service.js';
+// P19-B8.9 (OBJ-2): class resolution for the xstock REST class-gate (shared module, no cycle).
+import { safeResolveAssetClass } from '../../shared/asset-classes.js';
 
 /**
  * Phase 27.F.15.D: Live Pricing Adapter
@@ -13,7 +15,7 @@ import { trackPipelineTime } from './system-health-service.js';
  * Broadcasts price updates via WebSocket to all connected clients.
  * 
  * Features:
- * - API Integration: Binance, CoinGecko, or test sandbox
+ * - API Integration: Kraken REST only (P19-B8.9 — venue-only at-source)
  * - Auto-refresh: Every 15 seconds
  * - In-memory caching: live_prices:<symbol>
  * - WebSocket broadcasts: price_updated events
@@ -44,14 +46,16 @@ interface PriceQuote {
   symbol: string;
   price: number | null;
   timestamp: string;
-  source: 'binance' | 'coingecko' | 'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good' | 'no_reliable_price';
+  // P19-B8.9 (OBJ-1): 'binance' | 'coingecko' removed — a source that can no longer
+  // occur must not remain representable (typed honesty).
+  source: 'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good' | 'no_reliable_price';
 }
 
 interface CachedPrice {
   symbol: string;
   price: number;
   timestamp: string;
-  source: 'binance' | 'coingecko' | 'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good';
+  source: 'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good';
   cachedAt: number;
 }
 
@@ -64,18 +68,20 @@ export function isKrakenVenueSource(source: string): boolean {
   return source === 'kraken_ws' || source === 'kraken_equities_ws' || source === 'kraken_rest';
 }
 
+// P19-B8.9 (OBJ-1): binanceSymbolFor + fetchFromBinance + fetchFromCoinGecko are RETIRED
+// (rule 18 — see DELETED_COMPONENTS_LOG.md). The display fallback venue is now Kraken REST
+// only, matching the venue the engine prices and exits against. The B8.5 ghost-market
+// routing guard died with the fetcher it guarded.
+
 /**
- * P19-B8.5 (soak fix C, prong 1) — the PURE Binance routing decision, exported for tests.
- * Binance is consulted ONLY for USD-quoted pairs (mapped `${base}USDT`); any other quote
- * returns null — the source structurally cannot quote that market for us, and asking
- * anyway returns ghost-market or wrong-market numbers (see fetchFromBinance).
+ * P19-B8.9 — the shared REST-fallback display membership, extracted from five duplicated
+ * inline lists (4× routes.ts + active-portfolio-manager.ts) that had already drifted
+ * relative to what the adapter can produce. One list, one predicate; the unrepresentable
+ * members (binance_rest, coingecko) are gone with the fetchers.
  */
-export function binanceSymbolFor(symbol: string): string | null {
-  const parts = symbol.split('/');
-  if (parts.length !== 2) return null;
-  const [base, quote] = parts;
-  if (!base || quote !== 'USD') return null;
-  return `${base}USDT`;
+export const REST_FALLBACK_SOURCES = ['rest_fallback', 'kraken_rest', 'last_known_good'] as const;
+export function isRestFallbackSource(source: string): boolean {
+  return REST_FALLBACK_SOURCES.some(s => source.includes(s));
 }
 
 export class LivePricingAdapter {
@@ -215,7 +221,20 @@ export class LivePricingAdapter {
       source: cached.source
     };
   }
-  
+
+  /**
+   * P19-B8.9 (OBJ-5): TTL-free cache peek — read-only, NEVER fetches. Serves the
+   * venue-quiet display state (RTB current column): the caller sees what we hold,
+   * how old it is, and from which source, and renders honesty instead of a bare
+   * number. Distinct from getPrice (1s TTL gate) and getPriceWithFallback (fetches).
+   */
+  peekCachedPrice(symbol: string): { price: number; source: CachedPrice['source']; ageMs: number } | null {
+    const cached = this.priceCache.get(this.normalizeSymbol(symbol));
+    if (!cached || !(cached.price > 0)) {
+      return null;
+    }
+    return { price: cached.price, source: cached.source, ageMs: Date.now() - cached.cachedAt };
+  }
 
   /**
    * Get all cached prices
@@ -292,36 +311,42 @@ export class LivePricingAdapter {
   }
 
   /**
-   * Fetch live price from API (Binance, CoinGecko, or Kraken REST)
+   * Fetch live price from the venue (Kraken REST — P19-B8.9: the only external fetch)
    * Phase 8.8.3-I6: Added Kraken REST API as PRIMARY fallback for Kraken pairs
    * Phase 8.8.3-B9: Mock pricing disabled in production - returns null if no reliable price
    */
   private async fetchLivePrice(symbol: string): Promise<PriceQuote | null> {
     try {
-      // Try Binance first (good for common pairs)
-      const binancePrice = await this.fetchFromBinance(symbol);
-      if (binancePrice !== null) {
-        return {
-          symbol,
-          price: binancePrice,
-          timestamp: new Date().toISOString(),
-          source: 'binance'
-        };
-      }
-
-      // Fallback to CoinGecko (limited to mapped coins)
-      const coinGeckoPrice = await this.fetchFromCoinGecko(symbol);
-      if (coinGeckoPrice !== null) {
+      // P19-B8.9 (OBJ-2): class-gate — Kraken spot REST carries NO tokenized equities
+      // (KNOWN_NONEXISTENT_NAMES, dual-spelling tested), so a REST ask for an
+      // xstock-class symbol is STRUCTURALLY WASTED: guaranteed-failed fetch, then LKG
+      // anyway. Skip the venue ask entirely and go straight to the honest venue-quiet
+      // answer (last_known_good if we hold one, no_reliable_price if not). The xstock
+      // DECISION venue is the equities feed (engine invariant at the :933 region);
+      // this leg only ever served display.
+      if (safeResolveAssetClass(symbol, 'kraken') === 'xstock_spot') {
+        const cachedEq = this.priceCache.get(this.normalizeSymbol(symbol));
+        console.log(`[P19-B8.9][XSTOCK_REST_GATE] symbol=${symbol} rest_ask=skipped serving=${cachedEq && cachedEq.price > 0 ? 'last_known_good' : 'no_reliable_price'}`);
+        if (cachedEq && cachedEq.price > 0) {
+          return {
+            symbol,
+            price: cachedEq.price,
+            timestamp: new Date().toISOString(),
+            source: 'last_known_good'
+          };
+        }
         return {
           symbol,
-          price: coinGeckoPrice,
+          price: null,
           timestamp: new Date().toISOString(),
-          source: 'coingecko'
+          source: 'no_reliable_price'
         };
       }
 
-      // Phase 8.8.3-I6: CRITICAL - Kraken REST API as PRIMARY fallback for Kraken-specific pairs
-      // This ensures we always get fresh prices when WebSocket is stale
+      // P19-B8.9 (OBJ-1): the display fallback chain is Kraken-REST-or-nothing. The old
+      // Binance-first + CoinGecko legs are DELETED — the display venue now matches the
+      // venue the engine prices and exits against (no UI showing a Binance number for a
+      // position Kraken will fill).
       const krakenPrice = await this.fetchFromKrakenRest(symbol);
       if (krakenPrice !== null) {
         return {
@@ -353,7 +378,7 @@ export class LivePricingAdapter {
       }
       
       // Phase 8.8.3-B9: NO mock fallback in production - return null
-      console.warn(`[8.8.3-I6][NO_RELIABLE_PRICE] ${symbol}: All APIs failed (Binance/CoinGecko/Kraken), no cached data`);
+      console.warn(`[8.8.3-I6][NO_RELIABLE_PRICE] ${symbol}: Kraken REST failed, no cached data`);
       return {
         symbol,
         price: null,
@@ -391,85 +416,6 @@ export class LivePricingAdapter {
     }
   }
 
-  /**
-   * Fetch from Binance public API
-   */
-  private async fetchFromBinance(symbol: string): Promise<number | null> {
-    try {
-      // P19-B8.5 (soak fix C, prong 1 — ROUTING): only consult Binance for markets it can
-      // structurally quote for us: USD-quoted pairs, mapped base+'USDT'. The old blind
-      // `replace('/','').replace('USD','USDT')` passed non-USD quotes through VERBATIM
-      // (XRP/GBP -> 'XRPGBP'), and Binance's ticker answers for DELISTED ghost markets
-      // with the last price ever traded — a frozen number. Measured live 2026-07-15:
-      // XRPGBP returned a static 0.5257 (vs the real ~0.827) for 37 straight minutes and
-      // phantom-stopped five paper positions. A source that cannot quote the requested
-      // market must return NULL (the chain skips it honestly), never a different market's
-      // number. (It also mangled USD-BASED pairs: 'USDC/CHF' -> 'USDTCCHF' — garbage that
-      // only failed safe by 404.)
-      const binanceSymbol = binanceSymbolFor(symbol);
-      if (binanceSymbol === null) {
-        return null; // Binance cannot quote this market for us — refuse, don't improvise.
-      }
-
-      const response = await fetch(
-        `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`,
-        {
-          signal: AbortSignal.timeout(5000),
-          headers: { 'User-Agent': 'DawnTrader/1.0' }
-        }
-      );
-
-      if (!response.ok) {
-        return null;
-      }
-
-      const data = await response.json() as { price: string };
-      return parseFloat(data.price);
-
-    } catch (error) {
-      return null;
-    }
-  }
-
-  /**
-   * Fetch from CoinGecko public API
-   */
-  private async fetchFromCoinGecko(symbol: string): Promise<number | null> {
-    try {
-      // Map symbols to CoinGecko IDs
-      const coinGeckoMap: Record<string, string> = {
-        'BTC/USD': 'bitcoin',
-        'ETH/USD': 'ethereum',
-        'SOL/USD': 'solana',
-        'XRP/USD': 'ripple',
-        'ADA/USD': 'cardano'
-      };
-
-      const coinId = coinGeckoMap[symbol];
-      if (!coinId) {
-        return null;
-      }
-
-      const response = await fetch(
-        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
-        {
-          signal: AbortSignal.timeout(5000),
-          headers: { 'User-Agent': 'DawnTrader/1.0' }
-        }
-      );
-
-      if (!response.ok) {
-        return null;
-      }
-
```

## OBJ-2 continued + OBJ-5 substrate (rest of adapter diff)
```diff
-
-      const data = await response.json() as Record<string, { usd: number }>;
-      return data[coinId]?.usd || null;
-
-    } catch (error) {
-      return null;
-    }
-  }
-
   /**
    * Phase 8.8.3-I6: Fetch from Kraken public REST API
    * This is the PRIMARY fallback for Kraken-specific pairs when WebSocket is stale
@@ -735,9 +681,9 @@ export class LivePricingAdapter {
   // P19-B8.9a (Langston amendment 2): the honest generic cache-write. The old name
   // `updateFromWebSocket` had three callers, two of them stamping non-WS data 'kraken_ws'
   // (the engine's REST broadcast + the equities-mark feed) — the method name was the third
-  // mislabel. Callers now declare their true source; 'binance_ws' remains representable
-  // only until B8.9 OBJ-1 retires the third-party machinery.
-  updateCache(symbol: string, price: number, source: 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'binance_ws' = 'kraken_ws', traceId?: string): void {
+  // mislabel. Callers now declare their true source. P19-B8.9 (OBJ-1): 'binance_ws' is
+  // gone with the third-party machinery — only venue feeds write this cache.
+  updateCache(symbol: string, price: number, source: 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' = 'kraken_ws', traceId?: string): void {
     const pipelineStart = Date.now(); // Directive 9.0.C: Track pipeline time
     const normalized = this.normalizeSymbol(symbol);
     const timestamp = new Date().toISOString();
@@ -749,9 +695,9 @@ export class LivePricingAdapter {
       price,
       timestamp,
       // P19-B8.9a: the FOURTH mislabel, hiding inside the method — this ternary
-      // discarded the caller's source into 'binance' for everything non-kraken_ws.
-      // Store the true source; only binance_ws maps to the cache's 'binance' member.
-      source: source === 'binance_ws' ? 'binance' : source,
+      // discarded the caller's source for everything non-kraken_ws. Store the true
+      // source (P19-B8.9: the binance_ws mapping died with the third-party machinery).
+      source,
       cachedAt: now
     });
     
@@ -785,7 +731,10 @@ export class LivePricingAdapter {
       symbol: normalized,
       price,
       timestamp,
-      source: source === 'kraken_ws' ? 'kraken_ws' : 'binance'
+      // P19-B8.9: broadcast the caller's TRUE source (the old ternary collapsed every
+      // non-kraken_ws feed to a 'binance' badge on the frontend stream — a fifth mislabel,
+      // same family as the four found at B8.9a).
+      source
     }, traceId);
     
     // Directive 9.0.C: Track pipeline processing time (WS receive → cache → broadcast complete)
```

## The 5→1 restFallbackSources fold (4× routes.ts + APM) + OBJ-5 mapper wiring
```diff
diff --git a/server/routes.ts b/server/routes.ts
index 7feebf6fd..9e676636f 100644
--- a/server/routes.ts
+++ b/server/routes.ts
@@ -61,7 +61,7 @@ import { activeFilterPool } from './services/active-filter-pool.js';
 import { num, computeCalendarEarnings, computeFeeDrag, computeMakerTakerMix, computeAvgNetR, computeMaxDrawdownUsd, computeByAssetClass, profitFactorOrNull } from './services/dashboard-metrics.js';
 import { marketVolumeCache } from './services/market-volume-cache.js';
 import { b5SizingAudit } from './services/b5-sizing-audit.js';
-import { livePricingAdapter } from './services/live-pricing-adapter.js';
+import { livePricingAdapter, isRestFallbackSource, isKrakenVenueSource } from './services/live-pricing-adapter.js';
 import { krakenWebSocketAdapter } from './exchanges/kraken/kraken-websocket-adapter.js';
 import { slippageFeeModel } from './services/slippage-fee-model.js';
 import { c5FinancialDiagnostics } from './services/c5-financial-diagnostics.js';
@@ -5102,6 +5102,15 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
         const rank = readyToBuyService.getDisplayRankKey(signal as any, _cls ?? undefined);
         const _ind = (_cls && _indicatorsByClass[_cls]) || { marketRegime: null, globalFrictionScore: null };
 
+        // P19-B8.9 (OBJ-5): venue-quiet state for the Current column — a cache PEEK,
+        // never a fetch (the display chain no longer asks REST). Quiet = we hold no
+        // venue-tagged value fresher than the quiet threshold; the row's stored
+        // currentPrice keeps rendering, but wearing its honest badge.
+        const _peek = livePricingAdapter.peekCachedPrice(signal.symbol);
+        const VENUE_QUIET_MS = 60_000;
+        const priceVenueQuiet = !_peek || _peek.ageMs > VENUE_QUIET_MS || !isKrakenVenueSource(_peek.source);
+        const priceAgeMs = _peek ? _peek.ageMs : null;
+
         return {
           ...signal,
           estimatedQuantity: quantity,
@@ -5111,6 +5120,8 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
           strategyWeight,
           rankScore: rank.value,
           rankArm: rank.arm,
+          priceVenueQuiet,
+          priceAgeMs,
           marketRegime: _ind.marketRegime,
           // Named for the client's existing cell/sort plumbing; the VALUE is the
           // class-level (global) friction score — per-PAIR friction is a queue-time
@@ -12133,8 +12144,8 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
           priceSource = liveQuote.source;
           priceAgeMs = Date.now() - new Date(liveQuote.timestamp).getTime();
           // Track REST fallback vs WebSocket primary source
-          const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
-          fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
+          // P19-B8.9: one shared membership + predicate (was 5 drifted inline copies).
+          fallbackType = isRestFallbackSource(liveQuote.source) ? 'rest_fallback' : 'none';
         } else {
           // Log that we fell back to entry price due to no reliable live price
           fallbackType = 'entry_fallback';
@@ -12539,8 +12550,8 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
         if (liveQuote && liveQuote.price !== null && liveQuote.source !== 'no_reliable_price') {
           currentPrice = liveQuote.price;
           priceSource = liveQuote.source;
-          const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
-          fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
+          // P19-B8.9: one shared membership + predicate (was 5 drifted inline copies).
+          fallbackType = isRestFallbackSource(liveQuote.source) ? 'rest_fallback' : 'none';
         } else {
           fallbackType = 'entry_fallback';
           console.log(`[8.8.3-I6][FALLBACK_TO_ENTRY] symbol=${pos.symbol} reason=no_reliable_price`);
@@ -12627,8 +12638,8 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
       if (liveQuote && liveQuote.price !== null && liveQuote.source !== 'no_reliable_price') {
         currentPrice = liveQuote.price;
         priceSource = liveQuote.source;
-        const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
-        fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
+        // P19-B8.9: one shared membership + predicate (was 5 drifted inline copies).
+        fallbackType = isRestFallbackSource(liveQuote.source) ? 'rest_fallback' : 'none';
       } else {
         fallbackType = 'entry_fallback';
         console.log(`[8.8.3-I6][FALLBACK_TO_ENTRY] symbol=${position.symbol} reason=no_reliable_price`);
@@ -12788,8 +12799,8 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
           if (liveQuote && liveQuote.price !== null && liveQuote.source !== 'no_reliable_price') {
             currentPrice = liveQuote.price;
             priceSource = liveQuote.source;
-            const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
-            fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
+            // P19-B8.9: one shared membership + predicate (was 5 drifted inline copies).
+            fallbackType = isRestFallbackSource(liveQuote.source) ? 'rest_fallback' : 'none';
           } else {
             fallbackType = 'entry_fallback';
             console.log(`[8.8.3-I6][FALLBACK_TO_ENTRY] symbol=${position.symbol} reason=no_reliable_price`);
diff --git a/server/services/active-portfolio-manager.ts b/server/services/active-portfolio-manager.ts
index 2f7d1fc10..089a15542 100644
--- a/server/services/active-portfolio-manager.ts
+++ b/server/services/active-portfolio-manager.ts
@@ -6,7 +6,7 @@ import { registerEngine, registerMicroService } from './mode-registry';
 import { SignalOrchestrator } from './signal-orchestrator';
 import type { StrategySignal } from './strategy-engine';
 import { i1TradeLifecycleDiagnostics } from './i1-trade-lifecycle-diagnostics.js';
-import { livePricingAdapter } from './live-pricing-adapter.js';
+import { livePricingAdapter, isRestFallbackSource } from './live-pricing-adapter.js';
 
 interface PortfolioMetrics {
   totalTrades: number;
@@ -585,8 +585,8 @@ export class ActivePortfolioManager {
           if (liveQuote && liveQuote.price !== null && liveQuote.source !== 'no_reliable_price') {
             currentPrice = liveQuote.price;
             priceSource = liveQuote.source;
-            const restFallbackSources = ['rest_fallback', 'kraken_rest', 'binance_rest', 'coingecko', 'last_known_good'];
-            fallbackType = restFallbackSources.some(s => liveQuote.source.includes(s)) ? 'rest_fallback' : 'none';
+            // P19-B8.9: one shared membership + predicate (was 5 drifted inline copies).
+            fallbackType = isRestFallbackSource(liveQuote.source) ? 'rest_fallback' : 'none';
           } else {
             fallbackType = 'entry_fallback';
             console.log(`[8.8.3-I6][FALLBACK_TO_ENTRY] symbol=${position.symbol} reason=no_reliable_price`);
```

## OBJ-5 client — the portable venue-quiet component (new, standalone by design so CC-B's B8.7 shared-table rewire ports it via an import move; carry obligation on channel record)
```tsx
/**
 * P19-B8.9 (OBJ-5) — the venue-quiet Current-price treatment, in ONE portable place.
 *
 * When the displayed price did not come from a fresh Kraken venue read (WS, equities
 * WS, or REST), the cell shows the last known value muted with an explicit
 * "venue quiet" badge — never a bare number impersonating a live mark, never a
 * third-party number (the fetchers are retired in the same batch).
 *
 * Deliberately standalone: NEW Claude's B8.7 Step-9 rewire mounts shared VTS-mirror
 * table components and carries this behavior over (carry obligation on record,
 * Discord 2026-07-17) — keeping the treatment here makes that port an import move.
 */
import { cn } from "@/lib/utils";

/** Price-source values that are a MEMORY or a seed, not a venue read. */
export const NON_VENUE_PRICE_SOURCES = ['last_known_good', 'entry_seed', 'entry_fallback', 'no_reliable_price'] as const;

export function isVenueQuietSource(source: string | null | undefined): boolean {
  return source != null && (NON_VENUE_PRICE_SOURCES as readonly string[]).includes(source);
}

export function VenueQuietPrice({
  price,
  ageMs,
  decimals = 6,
  className,
  testId,
}: {
  price: number | null | undefined;
  ageMs?: number | null;
  decimals?: number;
  className?: string;
  testId?: string;
}) {
  const ageSec = ageMs != null ? Math.round(ageMs / 1000) : null;
  return (
    <div
      className={cn("font-mono text-sm font-medium text-amber-600 dark:text-amber-500", className)}
      title={`Venue quiet — no fresh Kraken price. Showing last known value${ageSec != null ? ` from ${ageSec}s ago` : ''}.`}
      data-testid={testId ?? "cell-current-venue-quiet"}
    >
      {price != null && !isNaN(price) ? `$${price.toFixed(decimals)}` : '—'}
      <div className="text-[10px] font-sans text-muted-foreground leading-tight">venue quiet</div>
    </div>
  );
}
```

## OBJ-5 client — Open Trades Current cell (active-trades-v2.tsx; clean-mine vs HEAD)
```diff
diff --git a/client/src/components/trading/active-trades-v2.tsx b/client/src/components/trading/active-trades-v2.tsx
index f99f1d536..ec0193ce3 100644
--- a/client/src/components/trading/active-trades-v2.tsx
+++ b/client/src/components/trading/active-trades-v2.tsx
@@ -5,6 +5,7 @@ import { Button } from "@/components/ui/button";
 import { Badge } from "@/components/ui/badge";
 import { Skeleton } from "@/components/ui/skeleton";
 import { cn, formatEntryFeeMode } from "@/lib/utils";
+import { VenueQuietPrice, isVenueQuietSource } from "./venue-quiet-price-cell";
 import { useTradingMode } from "@/contexts/trading-mode-context";
 import { useToast } from "@/hooks/use-toast";
 import { useWebSocket } from "@/hooks/use-websocket";
@@ -128,6 +129,11 @@ interface ActiveTrade {
   // P19-B7.2b (OBJ-C): the maker/taker entry fee-mode the position opened on.
   chosenEntryMode?: string | null;
   entryFeeRate?: number | string | null;
+  // P19-B8.9 (OBJ-5): venue-quiet honesty on the Current cell — the server exposes
+  // where the displayed price came from and how old it is; when the venue is quiet
+  // the cell shows the last known value wearing an explicit badge, never a bare number.
+  priceSource?: string;
+  priceAgeMs?: number;
   // P19-B7.2c: 'pending' = a resting maker order holding a slot, not yet filled.
   state?: string;
   makerLimitPrice?: string | number | null;
@@ -467,15 +473,22 @@ function TradeRow({
         </div>
       </td>
 
-      {/* 7. Current Price - C2A: Colored based on entry comparison */}
+      {/* 7. Current Price - C2A: Colored based on entry comparison.
+          P19-B8.9 (OBJ-5): non-venue sources render the portable venue-quiet
+          treatment (see venue-quiet-price-cell.tsx — carried into the B8.7
+          shared-table rewire by NEW Claude's carry obligation). */}
       <td className="px-3 py-3">
-        <div className={cn(
-          "font-mono text-sm font-medium",
-          trade.currentPrice > (trade.intendedEntryPrice ?? trade.entryPrice) ? "text-green-600" :
-          trade.currentPrice < (trade.intendedEntryPrice ?? trade.entryPrice) ? "text-red-600" : "text-foreground"
-        )}>
-          {trade.currentPrice != null ? `$${trade.currentPrice.toFixed(6)}` : <span className="text-muted-foreground">—</span>}
-        </div>
+        {isVenueQuietSource(trade.priceSource) ? (
+          <VenueQuietPrice price={trade.currentPrice} ageMs={trade.priceAgeMs} />
+        ) : (
+          <div className={cn(
+            "font-mono text-sm font-medium",
+            trade.currentPrice > (trade.intendedEntryPrice ?? trade.entryPrice) ? "text-green-600" :
+            trade.currentPrice < (trade.intendedEntryPrice ?? trade.entryPrice) ? "text-red-600" : "text-foreground"
+          )}>
+            {trade.currentPrice != null ? `$${trade.currentPrice.toFixed(6)}` : <span className="text-muted-foreground">—</span>}
+          </div>
+        )}
       </td>
 
       {/* 8. Distance (stacked: TP on top, SL on bottom) - Per-coin $ difference from Entry */}
```

## New test suite (6 tests, all green)
```ts
/**
 * P19-B8.9 — venue-only AT-SOURCE (the cuts + the class-gate + the peek).
 *
 * Pins: (1) isRestFallbackSource — the ONE shared membership that replaced five
 * drifted inline lists; the unrepresentable members (binance_rest, coingecko) are
 * gone with the fetchers. (2) The xstock REST class-gate: a stale xstock-class
 * symbol NEVER produces an outbound fetch — the adapter answers venue-quiet
 * (last_known_good from held cache, or null when empty-handed). (3) peekCachedPrice
 * is a TTL-free read-only peek (the OBJ-5 display substrate) — never a fetch.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import {
  livePricingAdapter,
  isRestFallbackSource,
  REST_FALLBACK_SOURCES,
} from '../../services/live-pricing-adapter';
import { _replaceXstockUniverse, type XstockSpotEntry } from '../../../shared/asset-classes';
import { UNIVERSE_BOOTSTRAP_SET } from '../../asset_classes/xstock_spot/universe-bootstrap';

// The xstock universe is DB-populated at boot (B79.0n) — empty in unit tests, so a
// plain-form pair like AAPL/USD would resolve crypto_spot and bypass the class-gate.
// Seed the production Layer-4 bootstrap set, the same post-boot state the gate sees
// (the b79-0f collision suite established this fixture pattern).
beforeAll(() => {
  const fixture = new Map<string, XstockSpotEntry>();
  for (const { symbol, entry } of UNIVERSE_BOOTSTRAP_SET) {
    fixture.set(symbol, entry);
  }
  _replaceXstockUniverse(fixture);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('P19-B8.9: isRestFallbackSource — one membership, five call sites', () => {
  it('admits exactly the representable REST-fallback display sources', () => {
    expect([...REST_FALLBACK_SOURCES]).toEqual(['rest_fallback', 'kraken_rest', 'last_known_good']);
    for (const s of REST_FALLBACK_SOURCES) {
      expect(isRestFallbackSource(s)).toBe(true);
    }
  });
  it('rejects live-venue and retired third-party tags', () => {
    for (const s of ['kraken_ws', 'kraken_equities_ws', 'binance_rest', 'coingecko', 'binance', 'entry_seed', 'mock', '']) {
      expect(isRestFallbackSource(s)).toBe(false);
    }
  });
});

describe('P19-B8.9 (OBJ-2): xstock class-gate — a quiet venue is answered, never re-asked', () => {
  it('a stale xstock cache entry yields last_known_good with ZERO outbound fetches', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Seed via the venue write path (plain pair-universe form — the stored-position shape).
    livePricingAdapter.updateCache('AAPL/USD', 214.25, 'kraken_equities_ws');
    vi.advanceTimersByTime(30_000); // well past the 5s display staleness threshold
    const q = await livePricingAdapter.getPriceWithFallback('AAPL/USD', 5000);
    expect(fetchSpy).not.toHaveBeenCalled(); // the structurally-wasted REST ask is GONE
    expect(q).not.toBeNull();
    expect(q!.price).toBe(214.25);
    expect(q!.source).toBe('last_known_good'); // a memory wearing its honest tag
  });

  it('an unknown xstock symbol with no cache yields null — empty-handed honesty, no fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const q = await livePricingAdapter.getPriceWithFallback('HOOD/USD', 5000);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(q).toBeNull();
  });
});

describe('P19-B8.9 (OBJ-5): peekCachedPrice — read-only display substrate', () => {
  it('returns the held entry with source + age, and never fetches', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    livePricingAdapter.updateCache('TESTPEEK/USD', 42.5, 'kraken_ws');
    const peek = livePricingAdapter.peekCachedPrice('TESTPEEK/USD');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(peek).not.toBeNull();
    expect(peek!.price).toBe(42.5);
    expect(peek!.source).toBe('kraken_ws');
    expect(peek!.ageMs).toBeGreaterThanOrEqual(0);
  });
  it('returns null for a symbol we hold nothing for', () => {
    expect(livePricingAdapter.peekCachedPrice('NOSUCHPAIR/USD')).toBeNull();
  });
});
```

## Shared-tree note (ready-to-buy-table.tsx)
That file's working tree is INTERLEAVED with CC-B's uncommitted Duration-column WIP (~51 of 65 added lines are theirs). My venue-quiet wiring there is 3 small hunks (import + 2 interface fields + one Current-cell block) fed by the server-side priceVenueQuiet/priceAgeMs fields shown above. Per who-holds-the-wrench I am NOT committing CC-B's WIP under this batch — coordinating the RTB-table commit with CC-B (they own that file this cycle + hold the carry obligation). The RTB venue-quiet wiring rides on their commit or a clean re-apply after theirs lands; the SERVER fields that feed it are in THIS diff. Flagging so the RTB-table client hunk is not read as missing.

## Rate-limit re-measure + §9.3 staging walk
Both are Step-7 (post-deploy): REST peak re-measured vs the honest 0.28/sec B8.9a baseline (xstock REST asks should now be structurally ZERO), and a Claude-in-Chrome walk of the venue-quiet cell on Open Trades + RTB. Will report both before close.
