import { contextBridge } from './context-bridge';
import { normalizeToInternalSymbol } from '../markets/kraken-symbol-resolver.js';
import { priceTraceService } from './price-trace-service';
import { priceCache } from './price-cache.js';
import { restRateLimiter } from './market-data/rest-rate-limiter.js';
import { markKindOf } from './market-data/mark-kind.js';
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import { trackPipelineTime } from './system-health-service.js';
// P19-B8.9 (OBJ-2): class resolution for the xstock REST class-gate (shared module, no cycle).
import { safeResolveAssetClass } from '../../shared/asset-classes.js';

/**
 * Phase 27.F.15.D: Live Pricing Adapter
 * 
 * Fetches live market prices from public APIs with caching and mock fallback.
 * Broadcasts price updates via WebSocket to all connected clients.
 * 
 * Features:
 * - API Integration: Kraken REST only (P19-B8.9 — venue-only at-source)
 * - Auto-refresh: Every 15 seconds
 * - In-memory caching: live_prices:<symbol>
 * - WebSocket broadcasts: price_updated events
 * - Mock fallback: Synthetic ±0.2% price movements when offline
 * 
 * Phase 8.8.3-I7-WS-E: REST Fallback Optimization
 * - REST fallback only when: WS cache stale >2s OR no WS subscription
 * - Thresholds: fresh ≤2s, warning ≥3s, immediate fallback ≥5s
 * - Diagnostic tracking for REST fallback reasons
 */

/**
 * Phase 8.8.3-I7-WS-E: REST fallback reason types
 */
type RestFallbackReason = 'cache_stale' | 'no_ws_subscription' | 'cache_miss';

/**
 * Phase 8.8.3-I7-WS-E: REST fallback metric entry
 */
interface RestFallbackMetric {
  symbol: string;
  count: number;
  lastReason: RestFallbackReason;
  lastTimestamp: number;
}

/**
 * B-EXIT-PROVENANCE (#741/#743) — WHICH HANDLER PRODUCED A PRICE, as distinct from which FEED it
 * came from. `source` answers a POLICY question (may the engine act on this?); `producer` answers a
 * PROVENANCE question (where did this number actually come from?). Conflating those two is what let
 * a ghost-contaminated book MIDPOINT and a clean ticker PRINT both arrive stamped `kraken_ws` — the
 * `#741` defect. Named for the producing HANDLER, never the feed.
 *
 * ⛔ CLOSED UNION, and `producer` is REQUIRED wherever it appears: an optional field would let a
 * future producer omit it, and that absence is indistinguishable from a missed stamp (#546).
 */
export type PriceProducer =
  // ── B-EXIT-BOOK-AGE-STAMP: the `_mid` / `_last` SPLIT. Langston-ruled 2026-08-30.
  // WHY: `producer` answered WHICH HANDLER and never WHICH KIND OF NUMBER, so `kraken_ws_ticker`
  // — which emits a BBO MIDPOINT on essentially every tick and a last trade only on a one-sided
  // or empty book — read as a trade print to everyone downstream (#952/#941). Splitting is PURE
  // RE-DESCRIPTION: no member merged, none deleted, and not one number changed.
  // ⛔ A `_mid` SUFFIX RECORDS THE KIND AND SAYS NOTHING ABOUT *WHICH* BBO PRODUCED IT. #952 asks
  //    which book a midpoint came from, and BOTH crypto legs come out `_mid` here — this split does
  //    not touch that question and must not be read as having settled it.
  // ⛔ `kraken_ws_ticker` IS A STRICT PREFIX OF `kraken_ws_ticker_v1`, so after the split three
  //    members share it. ANY cohort query over `exit_price_producer` MUST ENUMERATE the members it
  //    wants — never `LIKE 'kraken_ws_ticker%'`, where `_` is itself a LIKE wildcard.
  | 'kraken_ws_ticker_mid'             // kraken-websocket-adapter.ts:700 handleV2TickerUpdate — the common arm
  | 'kraken_ws_ticker_last'            // :700 — the one-sided/empty-book arm. RARE on xStock (0 in 373,450
                                       //        ticker snaps); the CRYPTO rate is UNMEASURED (#962).
  | 'kraken_ws_book_mid'               // :945 handleV2BookUpdate — THE #741 PATH. NOT SPLIT: it has no
                                       //        last-trade arm at all (`:911-913` skips a one-sided book),
                                       //        so its kind was already fully determined.
  | 'kraken_ws_ticker_v1'              // :1081 handleTickerUpdate — UNREACHABLE, see #742. NOT SPLIT:
                                       //        splitting an unreachable member invents two dead names.
  | 'kraken_equities_ws_mid'           // active-execution-engine.ts:1236 (+ the updateCache arg at :1244)
  | 'kraken_equities_ws_last'          // same site; the archiver's `latestEquityTick.kind` decides which
  | 'kraken_rest_engine_fallback_mid'  // active-execution-engine.ts:1309 (+ the updateCache arg at :1332)
  | 'kraken_rest_engine_fallback_last' // same site — `ask`/`bid` are in scope at :1301-1303
  | 'kraken_rest_poller'               // fetchLivePrice's REST leg — a GENUINE venue read.
                                       // ⛔ STILL NOT SPLIT BY KIND (mid vs last), and that is Langston
                                       //    condition 2 from B-EXIT-BOOK-AGE-STAMP, unchanged.
                                       // ✅ B-PRICE-AGE-TRUTH (#951) HAS NOW SPLIT OFF ITS THIRD ARM —
                                       //    the rate-limited re-serve below. The union comment used to say
                                       //    "#951 splits it when it fixes that branch"; this is that split.
  | 'kraken_rest_rate_limited_reserve' // fetchFromKrakenRest's rate-limiter branch: the venue was NOT
                                       //    asked, and a previously-cached price is re-served. It carries
                                       //    that row's ORIGINAL observedAt, never a fresh stamp.
                                       // ⛔ IT IS A DISTINCT TOKEN, NOT A REUSE OF `last_known_good_*`,
                                       //    for the reason those four were split from each other: one
                                       //    token cannot answer "outage, or gate?" from a row. An outage
                                       //    means the venue failed us; this means WE CHOSE NOT TO ASK.
                                       //    Different cause, different remediation, different duration.
                                       // ⚠️ WHAT THIS TOKEN DOES AND DOES NOT DO — stated precisely,
                                       //    because the flat form ("changes no trading decision") is
                                       //    FALSE and a reader produced the counterexample.
                                       //    `toCachedProducer` IS a producer-dependent branch: its
                                       //    `null` arm gates the cache write. The correct claim is
                                       //    that THE ONE EXISTING PRODUCER BRANCH ROUTES THIS TOKEN
                                       //    IDENTICALLY TO THE ONE IT REPLACES — a fact about its
                                       //    PLACEMENT, fence-tested and mutation-proved, not an
                                       //    absolute about producers.
                                       //    The engine's actionable gate does read `source` and never
                                       //    `producer`, and `source` is deliberately UNCHANGED here —
                                       //    making the re-serve non-actionable is B-PRICE-AGE-REFUSAL,
                                       //    carved out and gated, NOT this batch.
                                       // ★ SECOND-ORDER EFFECT, OUTSIDE THE BRANCH THIS BATCH EDITS,
                                       //    and it is the most valuable thing the change does:
                                       //    the re-serve is SELF-FEEDING — fetchFromKrakenRest reads
                                       //    the cache and fetchPrice writes back into it. Under the
                                       //    old code a rate-limited re-serve wrote `Date.now()` into
                                       //    the row on EVERY poll, so the row's `observedAt` was
                                       //    refreshed indefinitely. ⇒ the four legs that already
                                       //    carried `cached.observedAt` HONESTLY were carrying a
                                       //    LAUNDERED value whenever a rate-limited re-serve had
                                       //    recently touched that symbol. Pinning it here makes all
                                       //    four emit the true origin time.
  | 'xstock_rest_gate_reserve'         // :522 — BY DESIGN, not a failure: the B8.9 xStock REST
                                       //        class-gate makes no venue ask, so nothing failed.
                                       //        Splitting it from the outage legs is what lets a row
                                       //        answer "outage, or gate?" (#743).
  | 'last_known_good_all_apis_failed'  // :569 — genuine outage leg
  | 'last_known_good_fetch_exception'  // :602 — genuine outage leg
  | 'last_known_good_reserve'          // :1143 — the last-resort re-serve INSIDE getPriceWithFallback,
                                       //        i.e. the leg the CLOSE PATH hits. Writes nothing to
                                       //        the cache and passes `timestamp` through unrefreshed:
                                       //        on that axis it is the honest leg.
  | 'entry_seed'                       // :994 seedLastKnownGoodPrice
  | 'mock'                             // :747 (fetchMockPrice defined :713)
  | 'crypto_ws_book_walk'              // active-execution-engine.ts open seam — the taker ENTRY
                                       //        fill is a DEPTH WALK of the crypto WS book's ask
                                       //        levels. ⛔ DISTINCT FROM `kraken_ws_book_mid`, and
                                       //        the distinction is the point: a walk consumes
                                       //        LEVELS and a mid is (bestBid+bestAsk)/2. Stamping a
                                       //        walk as a mid would be a wrong-object label of
                                       //        exactly the kind this union exists to prevent.
  | 'xstock_ticker_snap_walk'          // the same walk over the xStock ticker snapshot — a
                                       //        different FEED, so a different producer. xStock has
                                       //        no order book; the depth comes from a stored snap.
  | 'position_entry_price_reused'      // active-portfolio-manager.ts:323 — the force-close
                                       //        no-price fallback REUSES `position.avgPrice`.
                                       //        ⛔ NO HANDLER PRODUCED THIS NUMBER: it came off the
                                       //        stored position row, not off any feed. Stamping it
                                       //        `entry_seed` would name a real handler that never
                                       //        ran — the wrong-object substitution this vocabulary
                                       //        exists to prevent. It is never cached, so it is
                                       //        excluded from `CachedProducer` alongside the
                                       //        null-price arm.
                                       //        ★ SAFE THROUGH THE VENUE GATE — AND THAT IS THE WHOLE
                                       //        CLAIM (narrowed 2026-08-30, B-EXIT-BOOK-AGE-STAMP).
                                       //        `isKrakenVenueSource(source)` (:224) reads `source` and
                                       //        NEVER `producer`, so widening cannot reject a price or
                                       //        skip a position THROUGH THAT GATE.
                                       //        ⛔ THIS LINE USED TO SAY THE RISK WAS "STRUCTURALLY
                                       //        ABSENT" FULL STOP. IT IS NOT. `toCachedProducer`'s
                                       //        `null` arm IS a producer-dependent branch: it gates the
                                       //        cache write at the fetchPrice writer and the priceTick
                                       //        subscriber below. ⛔ CORRECTED (#951): the old text here
                                       //        said a miss "reaches last_known_good, fails the venue gate
                                       //        and falls to direct REST — a skipped position". THAT IS
                                       //        FALSE. A suppressed write leaves the PREVIOUS row in the
                                       //        map, so getPriceWithFallback finds it and returns it under
                                       //        its ORIGINAL tag, WITH NO AGE RE-CHECK — bypassing the
                                       //        freshness window as well as the predicate. A stale price
                                       //        served as venue-fresh, which is worse than a skip.
                                       //        It is unreachable TODAY only because of today's call
                                       //        sites, which is #546's entire lesson. A new member goes
                                       //        in the PASSTHROUGH arm, and the fence asserts it.
  | 'no_price_produced';               // the null-price arm (:531 / :581 / :613) — no number was
                                       //        produced, so no handler produced it.

/**
 * ★ THE TYPE-LEVEL HALF OF THE BICONDITIONAL. `CachedPrice.price` is NON-nullable, so
 * `no_price_produced` can never legitimately occur there. Sharing one union across both types would
 * plant an UNPRODUCIBLE member in `CachedPrice` — the same shape as the `no_book_for_class` token
 * deleted from this batch's own vocabulary, one type over. `Exclude` is free and compile-time.
 */
export type CachedProducer = Exclude<PriceProducer, 'no_price_produced' | 'position_entry_price_reused'>;

/**
 * ⛔ NARROWING, NEVER A CAST. `:311` already carries `quote.source as CachedPrice['source']`, and that
 * cast is exactly why the runtime guard at `:306` is the only thing holding. Propagating `producer`
 * the same way would make "required + closed ⇒ a new producer is a compile error" FALSE at the one
 * writer this batch calls the launderer. The `never` arm below is what turns a future member into a
 * build failure instead of a silent runtime value (#448's literal-assertion shape).
 */
export function toCachedProducer(p: PriceProducer): CachedProducer | null {
  switch (p) {
    case 'no_price_produced':
    // Never cached: no handler produced it, so there is nothing to attribute a cached price to.
    case 'position_entry_price_reused':
      return null;
    case 'crypto_ws_book_walk':
    case 'xstock_ticker_snap_walk':
      return p;
    // ⛔ B-EXIT-BOOK-AGE-STAMP P11 — THE SIX SPLIT MEMBERS BELONG IN *THIS* ARM, NOT THE `null` ONE
    //    ABOVE. The `never` default forces a DECISION for every new member; it cannot force the
    //    CORRECT one. A member placed in the null arm suppresses the cache write at the fetchPrice
    //    writer and the priceTick subscriber.
    //    ⛔ CORRECTED (#951): the old text said that suppression "reaches last_known_good, fails the
    //    venue gate, and falls to direct REST — a skip". THAT IS FALSE, and it is what a prior audit
    //    propagated. A suppressed write leaves the PREVIOUS row in the map; getPriceWithFallback
    //    finds it, returns it under its ORIGINAL tag, and RE-CHECKS NO AGE — so it passes the gate
    //    as venue-fresh. Worse than a skip, not safer. Unreachable today only because of today's
    //    call sites (#546's whole lesson).
    //    `b-exit-provenance-fence.test.ts` asserts each of these returns NON-NULL.
    case 'kraken_ws_ticker_mid':
    case 'kraken_ws_ticker_last':
    case 'kraken_ws_book_mid':
    case 'kraken_ws_ticker_v1':
    case 'kraken_equities_ws_mid':
    case 'kraken_equities_ws_last':
    case 'kraken_rest_engine_fallback_mid':
    case 'kraken_rest_engine_fallback_last':
    case 'kraken_rest_poller':
    case 'kraken_rest_rate_limited_reserve':
    case 'xstock_rest_gate_reserve':
    case 'last_known_good_all_apis_failed':
    case 'last_known_good_fetch_exception':
    case 'last_known_good_reserve':
    case 'entry_seed':
    case 'mock':
      return p;
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

interface PriceQuote {
  symbol: string;
  price: number | null;
  timestamp: string;
  // P19-B8.9 (OBJ-1): 'binance' | 'coingecko' removed — a source that can no longer
  // occur must not remain representable (typed honesty).
  source: 'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good' | 'no_reliable_price';
  /** B-EXIT-PROVENANCE: which HANDLER produced this number. See PriceProducer. */
  producer: PriceProducer;
  /**
   * ★ #743: the ORIGINAL venue observation time — NOT the time this object was built.
   * A last-known-good leg CARRIES THIS THROUGH unrefreshed; only a genuine venue read sets it anew.
   * Without it the re-serve loop refreshes `timestamp` AND `cachedAt` every poll and a two-hour-old
   * price reads as seconds old for ever. `null` only on the no-price arm.
   */
  observedAt: number | null;
}

/**
 * B-PRICE-AGE-TRUTH (#951): what the Kraken REST leg returns.
 * It replaces a bare `number`, whose whole problem was that the caller could not tell a genuine
 * venue read from a re-served cached price and stamped both as observed-now.
 */
interface RestFetchResult {
  price: number;
  /** The ORIGINAL observation time. Fresh only when the venue was actually asked. */
  observedAt: number;
  /** Which of the two arms produced it — the caller must not infer this. */
  producer: 'kraken_rest_poller' | 'kraken_rest_rate_limited_reserve';
}

interface CachedPrice {
  symbol: string;
  price: number;
  timestamp: string;
  source: 'mock' | 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' | 'entry_seed' | 'last_known_good';
  /** B-EXIT-PROVENANCE: `no_price_produced` excluded at the TYPE level — `price` here is non-null. */
  producer: CachedProducer;
  /** ★ #743: original venue observation time. `cachedAt` may advance; THIS MUST NOT. */
  observedAt: number;
  cachedAt: number;
}

// P19-B8.9a (Langston amendment 1 — encode the concept once, never a per-site whitelist):
// Kraken is the venue we fill against, so a FRESH value from ANY of its feeds — crypto WS,
// equities WS, or REST — is venue data. The engine's actionable gate AND its non-venue warn
// both reference THIS predicate so they cannot drift apart. Freshness is the CALLER's
// dimension (getPriceWithFallback's window); this predicate rules only on provenance.
export function isKrakenVenueSource(source: string): boolean {
  return source === 'kraken_ws' || source === 'kraken_equities_ws' || source === 'kraken_rest';
}

/**
 * P19-B8.9 (OBJ-5) — the SINGLE definition of "venue quiet", so the Open Trades and
 * Ready-to-Buy display surfaces cannot drift (Langston Step-4 item 2). Quiet = the price
 * in hand is NOT a fresh venue read: either its source is not a Kraken venue feed, or it
 * is older than the quiet threshold. Each surface feeds its best-available data (Open
 * Trades: the served getPriceWithFallback source+age; RTB: a cache peek — no cache entry
 * at all is quiet by construction, handled by the caller). One predicate, two call sites.
 */
export const VENUE_QUIET_MS = 60_000;
export function isPriceVenueQuiet(source: string, ageMs: number | null | undefined): boolean {
  return !isKrakenVenueSource(source) || (ageMs != null && ageMs > VENUE_QUIET_MS);
}

// P19-B8.9 (OBJ-1): binanceSymbolFor + fetchFromBinance + fetchFromCoinGecko are RETIRED
// (rule 18 — see DELETED_COMPONENTS_LOG.md). The display fallback venue is now Kraken REST
// only, matching the venue the engine prices and exits against. The B8.5 ghost-market
// routing guard died with the fetcher it guarded.

/**
 * P19-B8.9 — the shared REST-fallback display membership, extracted from five duplicated
 * inline lists (4× routes.ts + active-portfolio-manager.ts) that had already drifted
 * relative to what the adapter can produce. One list, one predicate; the unrepresentable
 * members (binance_rest, coingecko) are gone with the fetchers.
 */
export const REST_FALLBACK_SOURCES = ['rest_fallback', 'kraken_rest', 'last_known_good'] as const;
export function isRestFallbackSource(source: string): boolean {
  return REST_FALLBACK_SOURCES.some(s => source.includes(s));
}

export class LivePricingAdapter {
  private priceCache: Map<string, CachedPrice> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private useMockMode: boolean = false;
  
  // Phase 8.8.3-I6-FIX: Track current trading mode for WebSocket broadcasts
  private currentTradingMode: 'paper' | 'live' = 'paper';
  
  // Phase 8.8.3-I7-WS-D: Reduced throttling for price broadcasts
  // D1: Changed from 1000ms to 150ms to ensure WebSocket ticks reach frontend
  private lastBroadcastTime: Map<string, number> = new Map();
  private readonly BROADCAST_THROTTLE_MS = 150; // 150ms minimum between broadcasts per symbol
  
  // Phase 8.8.3-I7-WS-E: REST Fallback Optimization
  // Phase 8.8.3-I8E: Increased staleness thresholds for low-volume pairs
  // Kraken low-volume pairs tick every 10-40 seconds, so 5s was too strict
  // Thresholds for WebSocket cache freshness
  private readonly WS_CACHE_FRESH_MS = 2000;       // ≤2s = fresh, use WS cache
  private readonly WS_CACHE_WARNING_MS = 10000;    // ≥10s = mild warning (was 3s)
  private readonly WS_CACHE_FALLBACK_MS = 25000;   // ≥25s = REST fallback (was 5s)
  
  // I7-WS-E: REST fallback metrics tracking
  private restFallbackMetrics: Map<string, RestFallbackMetric> = new Map();
  private wsSubscriptionChecker: (() => string[]) | null = null;
  
  // Configuration
  private readonly REFRESH_INTERVAL_MS = 15000; // 15 seconds for general price tracking
  private readonly CACHE_TTL_MS = 1000; // Phase 8.8.3-B3.5: 1 second cache TTL for open-trade symbols
  private readonly MOCK_VOLATILITY = 0.002; // ±0.2% for mock prices
  private readonly MODULE_NAME = 'LivePricingAdapter';
  
  // Tracked symbols (can be updated dynamically)
  private trackedSymbols: Set<string> = new Set([
    'BTC/USD',
    'ETH/USD',
    'SOL/USD',
    'XRP/USD',
    'ADA/USD'
  ]);

  /**
   * Start the live pricing adapter
   */
  async start(mockMode: boolean = false): Promise<void> {
    if (this.isRunning) {
      console.log(`[27.F.15.D][Pricing] Already running`);
      return;
    }

    this.useMockMode = mockMode;
    this.isRunning = true;

    console.log(`[27.F.15.D][Pricing] Starting LivePricingAdapter (mode: ${mockMode ? 'MOCK' : 'LIVE'})`);

    // Initial fetch
    await this.fetchAllPrices();

    // Start refresh interval
    this.refreshInterval = setInterval(async () => {
      await this.fetchAllPrices();
    }, this.REFRESH_INTERVAL_MS);

    console.log(`[27.F.15.D][Pricing] Started with ${this.trackedSymbols.size} tracked symbols`);
  }

  /**
   * Stop the live pricing adapter
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    this.isRunning = false;
    console.log(`[27.F.15.D][Pricing] Stopped`);
  }

  /**
   * Add symbols to track
   */
  addSymbols(symbols: string[]): void {
    const added: string[] = [];
    symbols.forEach(symbol => {
      const normalized = this.normalizeSymbol(symbol);
      if (!this.trackedSymbols.has(normalized)) {
        this.trackedSymbols.add(normalized);
        added.push(normalized);
      }
    });

    if (added.length > 0) {
      console.log(`[27.F.15.D][Pricing] Added ${added.length} new symbols: ${added.join(', ')}`);
    }
  }

  /**
   * Remove symbols from tracking
   */
  removeSymbols(symbols: string[]): void {
    symbols.forEach(symbol => {
      const normalized = this.normalizeSymbol(symbol);
      this.trackedSymbols.delete(normalized);
      this.priceCache.delete(normalized);
    });
  }

  /**
   * Get cached price for a symbol
   */
  getPrice(symbol: string): PriceQuote | null {
    const normalized = this.normalizeSymbol(symbol);
    const cached = this.priceCache.get(normalized);

    if (!cached) {
      return null;
    }

    // Check if cache is stale
    const age = Date.now() - cached.cachedAt;
    if (age > this.CACHE_TTL_MS) {
      console.log(`[27.F.15.D][Pricing] Cache stale for ${normalized} (age: ${age}ms)`);
      return null;
    }

    return {
      symbol: cached.symbol,
      price: cached.price,
      timestamp: cached.timestamp,
      source: cached.source,
      producer: cached.producer,
      observedAt: cached.observedAt,
    };
  }

  /**
   * P19-B8.9 (OBJ-5): TTL-free cache peek — read-only, NEVER fetches. Serves the
   * venue-quiet display state (RTB current column): the caller sees what we hold,
   * how old it is, and from which source, and renders honesty instead of a bare
   * number. Distinct from getPrice (1s TTL gate) and getPriceWithFallback (fetches).
   */
  peekCachedPrice(symbol: string): { price: number; source: CachedPrice['source']; ageMs: number } | null {
    const cached = this.priceCache.get(this.normalizeSymbol(symbol));
    if (!cached || !(cached.price > 0)) {
      return null;
    }
    return { price: cached.price, source: cached.source, ageMs: Date.now() - cached.cachedAt };
  }

  /**
   * Get all cached prices
   */
  getAllPrices(): PriceQuote[] {
    const prices: PriceQuote[] = [];
    const now = Date.now();

    this.priceCache.forEach((cached, symbol) => {
      const age = now - cached.cachedAt;
      if (age <= this.CACHE_TTL_MS) {
        prices.push({
          symbol: cached.symbol,
          price: cached.price,
          timestamp: cached.timestamp,
          source: cached.source,
          producer: cached.producer,
          observedAt: cached.observedAt,
        });
      }
    });

    return prices;
  }

  /**
   * Fetch all tracked prices
   */
  private async fetchAllPrices(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const promises: Promise<void>[] = [];

    this.trackedSymbols.forEach(symbol => {
      promises.push(this.fetchPrice(symbol));
    });

    await Promise.allSettled(promises);
  }

  /**
   * Fetch price for a single symbol
   * Phase 8.8.3-B9: Only cache valid prices (not null/no_reliable_price)
   */
  private async fetchPrice(symbol: string): Promise<void> {
    try {
      let quote: PriceQuote | null;

      if (this.useMockMode) {
        quote = await this.fetchMockPrice(symbol);
      } else {
        quote = await this.fetchLivePrice(symbol);
      }

      // Phase 8.8.3-B9: Only cache if we got a valid price
      if (quote && quote.price !== null && quote.source !== 'no_reliable_price') {
        // B-EXIT-PROVENANCE: NARROW, never `as`. The pre-existing `source` cast below is exactly
        // why the runtime guard above is the only thing holding; propagating `producer` the same way
        // would make "required + closed ⇒ a new producer is a compile error" FALSE at this writer —
        // the one #743 calls the launderer.
        const _cachedProducer = toCachedProducer(quote.producer);
        if (_cachedProducer !== null) {
          this.priceCache.set(symbol, {
            symbol: quote.symbol,
            price: quote.price,
            timestamp: quote.timestamp,
            source: quote.source as CachedPrice['source'],
            producer: _cachedProducer,
            // ★ #743: PROPAGATED, never stamped. A last-known-good leg carries the ORIGINAL
            // observation time through, so `cachedAt` advancing on a re-serve no longer erases how
            // old the price really is.
            observedAt: quote.observedAt ?? Date.now(),
            cachedAt: Date.now()
          });
        }

        // Broadcast update
        await this.broadcastPriceUpdate(quote);
      } else {
        console.log(`[B9.PRICING][SKIP_CACHE] ${symbol}: No valid price to cache`);
      }

    } catch (error) {
      console.error(`[27.F.15.D][Pricing] Error fetching ${symbol}:`, error);
    }
  }

  /**
   * Fetch live price from the venue (Kraken REST — P19-B8.9: the only external fetch)
   * Phase 8.8.3-I6: Added Kraken REST API as PRIMARY fallback for Kraken pairs
   * Phase 8.8.3-B9: Mock pricing disabled in production - returns null if no reliable price
   */
  private async fetchLivePrice(symbol: string): Promise<PriceQuote | null> {
    try {
      // P19-B8.9 (OBJ-2): class-gate — Kraken spot REST carries NO tokenized equities
      // (KNOWN_NONEXISTENT_NAMES, dual-spelling tested), so a REST ask for an
      // xstock-class symbol is STRUCTURALLY WASTED: guaranteed-failed fetch, then LKG
      // anyway. Skip the venue ask entirely and go straight to the honest venue-quiet
      // answer (last_known_good if we hold one, no_reliable_price if not). The xstock
      // DECISION venue is the equities feed (engine invariant at the :933 region);
      // this leg only ever served display.
      if (safeResolveAssetClass(symbol, 'kraken') === 'xstock_spot') {
        const cachedEq = this.priceCache.get(this.normalizeSymbol(symbol));
        console.log(`[P19-B8.9][XSTOCK_REST_GATE] symbol=${symbol} rest_ask=skipped serving=${cachedEq && cachedEq.price > 0 ? 'last_known_good' : 'no_reliable_price'}`);
        if (cachedEq && cachedEq.price > 0) {
          return {
            symbol,
            price: cachedEq.price,
            timestamp: new Date().toISOString(),
            source: 'last_known_good',
            producer: 'xstock_rest_gate_reserve',
            observedAt: cachedEq.observedAt,   // #743: carried through, NOT refreshed
          };
        }
        return {
          symbol,
          price: null,
          timestamp: new Date().toISOString(),
          source: 'no_reliable_price',
          producer: 'no_price_produced',
          observedAt: null,
        };
      }

      // P19-B8.9 (OBJ-1): the display fallback chain is Kraken-REST-or-nothing. The old
      // Binance-first + CoinGecko legs are DELETED — the display venue now matches the
      // venue the engine prices and exits against (no UI showing a Binance number for a
      // position Kraken will fill).
      const krakenResult = await this.fetchFromKrakenRest(symbol);
      if (krakenResult !== null) {
        return {
          symbol,
          price: krakenResult.price,
          timestamp: new Date().toISOString(),
          // ⛔ `source` UNCHANGED, deliberately. Relabelling it is what makes the re-serve
          //    non-actionable, and that is carved out to B-PRICE-AGE-REFUSAL because it would
          //    route the blocked population onto the engine's un-rate-limited direct REST leg.
          source: 'kraken_rest',
          // ✅ B-PRICE-AGE-TRUTH (#951): both of these now come FROM the fetch, which knows
          //    whether the venue was actually asked. The old code hard-coded a poller producer
          //    and `Date.now()` here, which is what laundered the rate-limited re-serve.
          producer: krakenResult.producer,
          observedAt: krakenResult.observedAt,
        };
      }

      // Phase 8.8.3-B9: Check if mock mode is EXPLICITLY enabled (dev/testing only)
      if (this.useMockMode) {
        console.log(`[27.F.15.D][Pricing] API unavailable for ${symbol}, falling back to mock (MOCK_MODE=true)`);
        return await this.fetchMockPrice(symbol);
      }
      
      // Phase 8.8.3-I6: Only use last_known_good if ALL external APIs fail
      // This should now be rare since Kraken REST is the authoritative source
      const cached = this.priceCache.get(this.normalizeSymbol(symbol));
      if (cached && cached.price > 0) {
        const cacheAge = Date.now() - cached.cachedAt;
        console.log(`[8.8.3-I6][LAST_KNOWN_GOOD_FALLBACK] symbol=${symbol} price=${cached.price.toFixed(4)} age=${cacheAge}ms reason=all_apis_failed`);
        return {
          symbol,
          price: cached.price,
          timestamp: new Date().toISOString(),
          source: 'last_known_good',
          producer: 'last_known_good_all_apis_failed',
          observedAt: cached.observedAt,      // #743: carried through, NOT refreshed
        };
      }
      
      // Phase 8.8.3-B9: NO mock fallback in production - return null
      console.warn(`[8.8.3-I6][NO_RELIABLE_PRICE] ${symbol}: Kraken REST failed, no cached data`);
      return {
        symbol,
        price: null,
        timestamp: new Date().toISOString(),
        source: 'no_reliable_price',
        producer: 'no_price_produced',
        observedAt: null,
      };

    } catch (error) {
      // Phase 8.8.3-B9: Only use mock in explicit mock mode
      if (this.useMockMode) {
        console.error(`[27.F.15.D][Pricing] Live fetch failed for ${symbol}, using mock (MOCK_MODE=true)`, error);
        return await this.fetchMockPrice(symbol);
      }
      
      // Try cached price as last resort
      const cached = this.priceCache.get(this.normalizeSymbol(symbol));
      if (cached && cached.price > 0) {
        const cacheAge = Date.now() - cached.cachedAt;
        console.log(`[8.8.3-I6][LAST_KNOWN_GOOD_FALLBACK] symbol=${symbol} price=${cached.price.toFixed(4)} age=${cacheAge}ms reason=fetch_exception`);
        return {
          symbol,
          price: cached.price,
          timestamp: new Date().toISOString(),
          source: 'last_known_good',
          producer: 'last_known_good_fetch_exception',
          observedAt: cached.observedAt,      // #743: carried through, NOT refreshed
        };
      }
      
      console.error(`[8.8.3-I6][NO_RELIABLE_PRICE] ${symbol}: Live fetch exception, no cached data`, error);
      return {
        symbol,
        price: null,
        timestamp: new Date().toISOString(),
        source: 'no_reliable_price',
        producer: 'no_price_produced',
        observedAt: null,
      };
    }
  }

  /**
   * Phase 8.8.3-I6: Fetch from Kraken public REST API
   * This is the PRIMARY fallback for Kraken-specific pairs when WebSocket is stale
   * Phase 8.8.5: Integrated RestRateLimiter to prevent Kraken bans
   */
  private async fetchFromKrakenRest(symbol: string): Promise<RestFetchResult | null> {
    try {
      // Phase 8.8.5: Check rate limiter before making REST call
      if (!restRateLimiter.check(symbol)) {
        const cached = this.priceCache.get(this.normalizeSymbol(symbol));
        console.log(`[8.8.5][REST_BLOCKED] ${symbol}: Rate limited, using cached price=${cached?.price ?? 'none'} observedAt=${cached?.observedAt ?? 'none'}`);
        krakenWebSocketAdapter.incrementRestFallbackBlocked();
        // ⛔ B-PRICE-AGE-TRUTH (#951): this branch used to `return cached?.price ?? null` — a BARE
        //    NUMBER. The caller could not tell it from a genuine venue read and stamped it
        //    `observedAt: Date.now()`, so a price of arbitrary age was recorded as observed-now.
        //    The row already HELD its true age: the honest last-known-good leg further down reads
        //    the SAME cache object and carries `cached.observedAt` through. This branch simply
        //    discarded it. It no longer does.
        // ⚠️ `source` is intentionally unchanged by this batch, so the engine's actionable gate
        //    still admits this price exactly as before — the age becomes RECOVERABLE, it does not
        //    become REFUSED. Refusal is B-PRICE-AGE-REFUSAL, carved out and gated.
        // ⛔ THE NULL TEST IS ON THE PRICE, NOT ON THE ROW — and that is not a style choice.
        //    The old code was `return cached?.price ?? null`, so a row present with an absent
        //    price returned null. Testing the ROW instead would return an object carrying
        //    `price: undefined`, and the cache-write guard above is `quote.price !== null`,
        //    which is TRUE for undefined — so an undefined price would be written into the cache
        //    and handed to the exit evaluation. `!= null` reproduces the old `??` exactly.
        //    Caught by a second reader on the implementation; the types forbid it today, which is
        //    precisely why nothing would have failed until something else changed.
        return cached && cached.price != null
          ? { price: cached.price, observedAt: cached.observedAt, producer: 'kraken_rest_rate_limited_reserve' }
          : null;
      }
      
      // Phase 8.8.5: REST call allowed
      krakenWebSocketAdapter.incrementRestFallbackAllowed();
      
      // Convert internal symbol to Kraken REST API format
      // Examples: XTZ/USD -> XTZUSD, XXRPZUSD -> XXRPZUSD, SUI/USD -> SUIUSD
      let krakenPair = symbol.replace('/', '');
      
      // Handle slash-format symbols (e.g., XTZ/USD -> XTZUSD)
      if (symbol.includes('/')) {
        const [base, quote] = symbol.split('/');
        // Special case for BTC -> XBT
        const krakenBase = base === 'BTC' ? 'XBT' : base;
        krakenPair = `${krakenBase}${quote}`;
      }
      
      const response = await fetch(
        `https://api.kraken.com/0/public/Ticker?pair=${krakenPair}`,
        {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'DawnTrader/1.0' }
        }
      );

      if (!response.ok) {
        console.log(`[8.8.3-I6][KRAKEN_REST_FAIL] ${symbol}: HTTP ${response.status}`);
        return null;
      }

      const data = await response.json() as { 
        error: string[];
        result: Record<string, { 
          a: [string, string, string]; // ask [price, whole lot volume, lot volume]
          b: [string, string, string]; // bid [price, whole lot volume, lot volume]
          c: [string, string];         // last trade [price, lot volume]
        }>
      };
      
      if (data.error && data.error.length > 0) {
        console.log(`[8.8.3-I6][KRAKEN_REST_ERROR] ${symbol}: ${data.error.join(', ')}`);
        return null;
      }
      
      // Get the first result key (Kraken returns dynamic key names)
      const resultKey = Object.keys(data.result || {})[0];
      if (!resultKey) {
        console.log(`[8.8.3-I6][KRAKEN_REST_NO_DATA] ${symbol}: No result in response`);
        return null;
      }
      
      const tickerData = data.result[resultKey];
      
      // 8.9.2: Calculate midpoint from bid/ask, fallback to last trade.
      // B-EXIT-BOOK-AGE-STAMP P1: the mid-or-last PREDICATE now has one home (`markKindOf`); the
      // arithmetic and this function's own guards are unchanged. `kraken_rest_poller` is NOT split
      // by kind — see the union comment: its rate-limited branch above returns a bare cached price.
      const ask = parseFloat(tickerData?.a?.[0] || '0');
      const bid = parseFloat(tickerData?.b?.[0] || '0');
      const lastTrade = parseFloat(tickerData?.c?.[0] || '0');
      const midpoint = markKindOf(bid, ask) === 'mid' ? (ask + bid) / 2 : lastTrade;
      
      if (midpoint <= 0 || isNaN(midpoint)) {
        console.log(`[8.9.2][KRAKEN_REST_INVALID_PRICE] ${symbol}: bid=${bid} ask=${ask} last=${lastTrade}`);
        return null;
      }
      
      console.log(`[8.9.2][REST_TICK] ${symbol} bid=${bid} ask=${ask} mid=${midpoint.toFixed(8)}`);
      console.log(`[8.8.3-I6][REST_FALLBACK] symbol=${symbol} price=${midpoint} source=kraken_rest priceAgeMs=0`);
      
      // Phase 8.8.4-IA-PRICE-CACHE: Update centralized price cache from REST
      const normalized = this.normalizeSymbol(symbol);
      priceCache.updateFromRest(normalized, midpoint);
      
      // A real venue read: `observedAt` is genuinely now, and it is the ONLY return here that
      // may say so.
      return { price: midpoint, observedAt: Date.now(), producer: 'kraken_rest_poller' };

    } catch (error) {
      console.error(`[8.8.3-I6][KRAKEN_REST_EXCEPTION] ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Generate mock price with synthetic volatility
   */
  private async fetchMockPrice(symbol: string): Promise<PriceQuote> {
    // Get previous price if available
    const cached = this.priceCache.get(symbol);
    
    let basePrice: number;
    
    if (cached) {
      // Apply random ±0.2% movement
      const change = (Math.random() - 0.5) * 2 * this.MOCK_VOLATILITY;
      basePrice = cached.price * (1 + change);
    } else {
      // Initialize with realistic base prices
      const basePrices: Record<string, number> = {
        'BTC/USD': 68000,
        'ETH/USD': 3500,
        'SOL/USD': 170,
        'XRP/USD': 0.62,
        'ADA/USD': 0.45
      };
      basePrice = basePrices[symbol] || 100;
    }

    const delta = cached ? ((basePrice - cached.price) / cached.price * 100).toFixed(3) : '0';
    console.log(`[27.F.15.D][Pricing-MOCK] ${symbol}: $${basePrice.toFixed(2)} (Δ${delta}%)`);

    return {
      symbol,
      price: basePrice,
      timestamp: new Date().toISOString(),
      source: 'mock',
      producer: 'mock',
      observedAt: Date.now(),
    };
  }

  /**
   * Phase 8.8.3-I6-FIX: Set the current trading mode for WebSocket broadcasts
   * Called when simulation starts/stops or trading mode changes
   */
  setTradingMode(mode: 'paper' | 'live'): void {
    const previousMode = this.currentTradingMode;
    this.currentTradingMode = mode;
    console.log(`[8.8.3-I6-FIX][PRICING] Trading mode changed: ${previousMode} -> ${mode}`);
  }

  /**
   * Phase 8.8.3-I6-FIX: Get the current trading mode
   */
  getTradingMode(): 'paper' | 'live' {
    return this.currentTradingMode;
  }

  /**
   * Broadcast price update via WebSocket
   * Phase 34: Throttled to max 1 broadcast per second per symbol
   * Phase 8.8.3-B9: Skip broadcast for null prices (no_reliable_price)
   * Phase 8.8.3-I6-FIX: Use currentTradingMode instead of hardcoded 'live'
   */
  private async broadcastPriceUpdate(quote: PriceQuote): Promise<void> {
    try {
      // Phase 8.8.3-B9: Don't broadcast null prices
      if (quote.price === null) {
        console.log(`[B9.PRICING][SKIP_BROADCAST] ${quote.symbol}: Price is null, skipping broadcast`);
        return;
      }
      
      // Phase 34: Throttle broadcasts to ≤1/second per symbol
      const now = Date.now();
      const lastBroadcast = this.lastBroadcastTime.get(quote.symbol) || 0;
      
      if (now - lastBroadcast < this.BROADCAST_THROTTLE_MS) {
        // Skip this broadcast - too soon since last one
        return;
      }
      
      // Update last broadcast time
      this.lastBroadcastTime.set(quote.symbol, now);
      
      // Phase 8.8.3-I6-FIX: Use currentTradingMode instead of hardcoded 'live'
      await contextBridge.broadcast({
        type: 'price_updated',
        payload: {
          mode: this.currentTradingMode,
          symbol: quote.symbol,
          price: quote.price,
          timestamp: quote.timestamp,
          source: quote.source
        }
      });

      console.log(`[8.8.3-I6-FIX][Pricing-WS] Broadcast: ${quote.symbol} = $${quote.price.toFixed(2)} (${quote.source}) [mode=${this.currentTradingMode}]`);
      
      // Phase 8.8.3-I7-WS-A (A5): Log price broadcast for diagnostic audit
      console.log(`[I7-WS-A][BROADCAST] internal_symbol=${quote.symbol} price=${quote.price} mode=${this.currentTradingMode}`);

    } catch (error) {
      console.error(`[27.F.15.D][Pricing-WS] Broadcast failed:`, error);
    }
  }

  /**
   * Phase 8.8.3-I7-WS-D: Broadcast price from WebSocket with reduced throttling
   * D3: Every cache update from WebSocket triggers a broadcast (1:1 Stage-3→Stage-4)
   * D4: Removed suppression due to price age, delta, timestamp, etc.
   * Only applies minimal throttling (150ms) to prevent flooding
   */
  private broadcastFromWebSocket(quote: { symbol: string; price: number; timestamp: string; source: string }, traceId?: string): void {
    try {
      // D4: No suppression for null prices on WS path (WS always provides valid prices)
      const now = Date.now();
      const lastBroadcast = this.lastBroadcastTime.get(quote.symbol) || 0;
      
      // D1: Minimal throttling at 150ms (not 1000ms) to prevent flooding while ensuring updates
      if (now - lastBroadcast < this.BROADCAST_THROTTLE_MS) {
        // Log throttled broadcasts for diagnostic visibility
        console.log(`[I7-WS-D][BROADCAST_THROTTLED] symbol=${quote.symbol} timeSinceLast=${now - lastBroadcast}ms`);
        return;
      }
      
      // Update last broadcast time
      this.lastBroadcastTime.set(quote.symbol, now);
      
      // Phase 8.8.3-I7-WS-C (C2 Stage 4): Log broadcast with trace ID
      if (traceId) {
        priceTraceService.recordStage(traceId, 4, 'BROADCAST', {
          internal_symbol: quote.symbol,
          price: quote.price
        });
      }
      
      // Phase 8.8.3-I7-WS-D (D6): Diagnostic log for broadcast
      console.log(`[I7-WS-D][BROADCAST_SEND] symbol=${quote.symbol} price=${quote.price}`);
      
      // Broadcast to clients
      contextBridge.broadcast({
        type: 'price_updated',
        payload: {
          mode: this.currentTradingMode,
          symbol: quote.symbol,
          price: quote.price,
          timestamp: quote.timestamp,
          source: quote.source
        }
      });
      
      console.log(`[8.8.3-I6-FIX][Pricing-WS] Broadcast: ${quote.symbol} = $${quote.price.toFixed(2)} (${quote.source}) [mode=${this.currentTradingMode}]`);
      
      // Phase 8.8.3-I7-WS-A (A5): Log price broadcast for diagnostic audit
      console.log(`[I7-WS-A][BROADCAST] internal_symbol=${quote.symbol} price=${quote.price} mode=${this.currentTradingMode}`);

    } catch (error) {
      console.error(`[I7-WS-D][BROADCAST_ERROR] ${quote.symbol}:`, error);
    }
  }

  /**
   * Phase 8.8.3-I7: Normalize symbol using canonical resolver
   * No more USDT→USD collapsing - each quote currency is distinct
   */
  private normalizeSymbol(symbol: string): string {
    return normalizeToInternalSymbol(symbol);
  }

  /**
   * Phase 8.8.3-B3.6: Update price from WebSocket
   * Called by KrakenWebSocketAdapter when real-time prices arrive
   * Phase 8.8.3-I7-WS-C: Added traceId parameter for pipeline tracing
   * Phase 8.8.3-I7-WS-D: Now broadcasts EVERY WebSocket tick (D2/D3)
   */
  // P19-B8.9a (Langston amendment 2): the honest generic cache-write. The old name
  // `updateFromWebSocket` had three callers, two of them stamping non-WS data 'kraken_ws'
  // (the engine's REST broadcast + the equities-mark feed) — the method name was the third
  // mislabel. Callers now declare their true source. P19-B8.9 (OBJ-1): 'binance_ws' is
  // gone with the third-party machinery — only venue feeds write this cache.
  updateCache(
    symbol: string,
    price: number,
    source: 'kraken_ws' | 'kraken_equities_ws' | 'kraken_rest' = 'kraken_ws',
    // B-EXIT-PROVENANCE: REQUIRED, no default. A default here would silently mislabel a future
    // caller as whichever producer happened to be most common — the conflation this batch exists
    // to end. Every call site states its own.
    producer: CachedProducer,
    traceId?: string,
  ): void {
    const pipelineStart = Date.now(); // Directive 9.0.C: Track pipeline time
    const normalized = this.normalizeSymbol(symbol);
    const timestamp = new Date().toISOString();
    const now = Date.now();
    
    // D2: Always update cache on EVERY WebSocket tick
    this.priceCache.set(normalized, {
      symbol: normalized,
      price,
      timestamp,
      // P19-B8.9a: the FOURTH mislabel, hiding inside the method — this ternary
      // discarded the caller's source for everything non-kraken_ws. Store the true
      // source (P19-B8.9: the binance_ws mapping died with the third-party machinery).
      source,
      producer,
      // A genuine tick from a live feed: observed now. This is the one writer where
      // "observed" and "cached" legitimately coincide.
      observedAt: now,
      cachedAt: now
    });
    
    // Phase 8.8.4-IA-PRICE-CACHE: Update centralized price cache for active trades
    priceCache.updateFromWebSocket(normalized, price);
    
    // Phase 8.8.3-I7-WS-D (D6): Diagnostic log for cache write
    console.log(`[I7-WS-D][CACHE_WRITE] symbol=${normalized} price=${price} source=${source}`);
    
    // Phase 8.8.3-I7-WS-C (C2 Stage 3): Log cache update with trace ID
    if (traceId) {
      priceTraceService.recordStage(traceId, 3, 'CACHE_UPDATE', {
        internal_symbol: normalized,
        price
      });
    }
    
    // Phase 8.8.3-I5: Diagnostic logging for cache update audit
    console.log(`[8.8.3-I5][CACHE_UPDATE] symbol=${normalized} newPrice=${price} lastTickMsAgo=0 timestamp=${now}`);
    
    // Phase 8.8.3-I7-WS-A (A4): Log cache update for diagnostic audit
    console.log(`[I7-WS-A][CACHE_UPDATE] internal_symbol=${normalized} price=${price}`);
    
    if (!this.trackedSymbols.has(normalized)) {
      this.trackedSymbols.add(normalized);
    }
    
    // Phase 8.8.3-I7-WS-D (D3): Broadcast EVERY cache update to frontend
    // This ensures Stage-3 → Stage-4 is 1:1
    this.broadcastFromWebSocket({
      symbol: normalized,
      price,
      timestamp,
      // P19-B8.9: broadcast the caller's TRUE source (the old ternary collapsed every
      // non-kraken_ws feed to a 'binance' badge on the frontend stream — a fifth mislabel,
      // same family as the four found at B8.9a).
      source
    }, traceId);
    
    // Directive 9.0.C: Track pipeline processing time (WS receive → cache → broadcast complete)
    // Note: broadcastFromWebSocket is fire-and-forget, so we track synchronous portion
    const pipelineEnd = Date.now();
    const pipelineDuration = pipelineEnd - pipelineStart;
    trackPipelineTime(normalized, pipelineStart);
    
    // Additional logging for pipeline visibility
    if (pipelineDuration > 50) {
      console.log(`[9.0][PIPELINE] ${normalized} sync processing = ${pipelineDuration}ms`);
    }
  }

  /**
   * Phase 8.8.3-B9: Seed price cache with entry price
   * Called when a trade opens to establish a lastKnownGoodPrice anchor
   * This prevents mock fallback from using fabricated prices on exit
   */
  seedLastKnownGoodPrice(symbol: string, price: number): void {
    const normalized = this.normalizeSymbol(symbol);
    const timestamp = new Date().toISOString();
    
    // Only seed if we don't have a more recent real price
    const existing = this.priceCache.get(normalized);
    if (existing && existing.source !== 'mock' && existing.source !== 'entry_seed') {
      const age = Date.now() - existing.cachedAt;
      if (age < 60000) { // Keep existing real price if less than 60s old
        console.log(`[B9.PRICING][SEED_SKIP] ${normalized}: Keeping existing real price $${existing.price.toFixed(2)} (${existing.source}, age: ${age}ms)`);
        return;
      }
    }
    
    this.priceCache.set(normalized, {
      symbol: normalized,
      price,
      timestamp,
      source: 'entry_seed',
      producer: 'entry_seed',
      observedAt: Date.now(),
      cachedAt: Date.now()
    });
    
    // Ensure symbol is tracked
    if (!this.trackedSymbols.has(normalized)) {
      this.trackedSymbols.add(normalized);
    }
    
    console.log(`[B9.PRICING][ENTRY_SEED] ${normalized}: Seeded price cache with entry price $${price.toFixed(2)}`);
  }

  /**
   * Phase 8.8.3-I7-WS-E: Set WebSocket subscription checker
   * Allows the adapter to check if a symbol has an active WS subscription
   */
  setWsSubscriptionChecker(checker: () => string[]): void {
    this.wsSubscriptionChecker = checker;
    console.log(`[I7-WS-E] WebSocket subscription checker registered`);
  }

  /**
   * Phase 8.8.3-I7-WS-E: Check if symbol has active WebSocket subscription
   */
  private hasWsSubscription(symbol: string): boolean {
    if (!this.wsSubscriptionChecker) {
      return false;
    }
    const subscribedSymbols = this.wsSubscriptionChecker();
    const normalized = this.normalizeSymbol(symbol);
    return subscribedSymbols.includes(normalized) || subscribedSymbols.some(s => 
      this.normalizeSymbol(s) === normalized
    );
  }

  /**
   * Phase 8.8.3-I7-WS-E: Record REST fallback metric
   */
  private recordRestFallback(symbol: string, reason: RestFallbackReason): void {
    const existing = this.restFallbackMetrics.get(symbol);
    if (existing) {
      existing.count++;
      existing.lastReason = reason;
      existing.lastTimestamp = Date.now();
    } else {
      this.restFallbackMetrics.set(symbol, {
        symbol,
        count: 1,
        lastReason: reason,
        lastTimestamp: Date.now()
      });
    }
    console.log(`[I7-WS-E][REST_FALLBACK] symbol=${symbol} reason=${reason}`);
  }

  /**
   * Phase 8.8.3-B3.6 + I7-WS-E: Get price with optimized REST fallback
   * 
   * I7-WS-E Logic:
   * - Use WebSocket cache if fresh (≤2s)
   * - Log warning if cache age ≥3s
   * - REST fallback if: cache stale >2s OR no WS subscription
   */
  async getPriceWithFallback(symbol: string, staleThresholdMs: number = 5000): Promise<PriceQuote | null> {
    const normalized = this.normalizeSymbol(symbol);
    const cached = this.priceCache.get(normalized);
    const now = Date.now();
    
    // Phase 8.8.3-I7-WS-E: Check WebSocket subscription status
    const hasWsSub = this.hasWsSubscription(normalized);
    
    if (cached) {
      const age = now - cached.cachedAt;
      
      // I7-WS-E: Fresh WebSocket cache (≤2s) - use directly
      // P19-B8.9a: venue predicate, not the WS tag — a fresh same-venue REST/equities entry
      // is servable without wearing a false WS badge (the honest form of the old behavior).
      if (age <= this.WS_CACHE_FRESH_MS && isKrakenVenueSource(cached.source)) {
        return {
          symbol: cached.symbol,
          price: cached.price,
          timestamp: cached.timestamp,
          source: cached.source,
          producer: cached.producer,
          observedAt: cached.observedAt,
        };
      }
      
      // I7-WS-E: Any source within stale threshold - use cache
      if (age <= staleThresholdMs) {
        // Mild warning at ≥3s
        if (age >= this.WS_CACHE_WARNING_MS) {
          console.log(`[I7-WS-E][CACHE_WARNING] symbol=${normalized} age=${age}ms source=${cached.source} (approaching stale)`);
        }
        return {
          symbol: cached.symbol,
          price: cached.price,
          timestamp: cached.timestamp,
          source: cached.source,
          producer: cached.producer,
          observedAt: cached.observedAt,
        };
      }
      
      // I7-WS-E: Cache is stale, determine reason and fallback
      if (!hasWsSub) {
        this.recordRestFallback(normalized, 'no_ws_subscription');
      } else {
        this.recordRestFallback(normalized, 'cache_stale');
      }
    } else {
      // No cache at all
      this.recordRestFallback(normalized, hasWsSub ? 'cache_miss' : 'no_ws_subscription');
    }
    
    // Perform REST fallback
    try {
      await this.fetchPrice(normalized);
      const updated = this.priceCache.get(normalized);
      if (updated) {
        return {
          symbol: updated.symbol,
          price: updated.price,
          timestamp: updated.timestamp,
          source: updated.source,
          producer: updated.producer,
          observedAt: updated.observedAt,
        };
      }
    } catch (error) {
      console.error(`[I7-WS-E][REST_FALLBACK_ERROR] symbol=${normalized}:`, error);
    }
    
    // Return stale cache as last resort — P19-B8.9a: tagged HONESTLY as last_known_good.
    // Pre-existing hole (found via Langston's Step-4 checklist item): re-serving a STALE
    // entry with its original venue tag let it satisfy the engine's actionable gate in the
    // exact dark-venue scenario the skip-rail was built for (WS stale AND REST failed).
    // A stale re-serve is a MEMORY of a venue read, not a venue read — last_known_good is
    // its true name; the engine's skip-tick + escalation rail now engage as designed.
    return cached ? {
      symbol: cached.symbol,
      price: cached.price,
      timestamp: cached.timestamp,
      source: 'last_known_good',
      // ★ #743: THE LEG THE CLOSE PATH HITS, and the one that had no log line at all — so its
      // firing rate was unmeasured, not zero. It writes NOTHING to the cache and passes
      // `timestamp` through unrefreshed, which is why it gets its own token rather than a
      // laundering one.
      producer: 'last_known_good_reserve',
      observedAt: cached.observedAt,
    } : null;
  }

  /**
   * Phase 8.8.3-I7-WS-E: Get REST fallback metrics for diagnostics
   */
  getRestFallbackMetrics(): {
    totalFallbacks: number;
    bySymbol: Array<{
      symbol: string;
      count: number;
      lastReason: string;
      lastTimestamp: string;
      wsTimestamp: string | null;
      hasWsSubscription: boolean;
    }>;
    summary: {
      cache_stale: number;
      no_ws_subscription: number;
      cache_miss: number;
    };
  } {
    const now = Date.now();
    const summary = { cache_stale: 0, no_ws_subscription: 0, cache_miss: 0 };
    let totalFallbacks = 0;
    
    const bySymbol = Array.from(this.restFallbackMetrics.entries()).map(([symbol, metric]) => {
      totalFallbacks += metric.count;
      summary[metric.lastReason] = (summary[metric.lastReason] || 0) + metric.count;
      
      const cached = this.priceCache.get(symbol);
      const wsTimestamp = (cached?.source === 'kraken_ws' || cached?.source === 'kraken_equities_ws') ? cached.timestamp : null;
      
      return {
        symbol,
        count: metric.count,
        lastReason: metric.lastReason,
        lastTimestamp: new Date(metric.lastTimestamp).toISOString(),
        wsTimestamp,
        hasWsSubscription: this.hasWsSubscription(symbol)
      };
    });
    
    return { totalFallbacks, bySymbol, summary };
  }

  /**
   * Phase 8.8.3-I7-WS-E: Clear REST fallback metrics (for testing/reset)
   */
  clearRestFallbackMetrics(): void {
    this.restFallbackMetrics.clear();
    console.log(`[I7-WS-E] REST fallback metrics cleared`);
  }

  /**
   * Phase B7.MDR: Clear all price caches for hard reset
   * Called during paper simulation reset to ensure fresh market data
   */
  clearCache(): void {
    const previousSize = this.priceCache.size;
    this.priceCache.clear();
    this.lastBroadcastTime.clear();
    console.log(`[PRICE_ENGINE][RESET] Cleared price cache (${previousSize} entries)`);
  }

  /**
   * Get cache size for verification
   */
  getCacheSize(): number {
    return this.priceCache.size;
  }

  /**
   * Get adapter status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      mode: this.useMockMode ? 'mock' : 'live',
      trackedSymbols: Array.from(this.trackedSymbols),
      cachedPrices: this.priceCache.size,
      refreshIntervalMs: this.REFRESH_INTERVAL_MS
    };
  }
}

// Singleton instance
export const livePricingAdapter = new LivePricingAdapter();

// B78.1: Cycle-break wiring. ws-adapter no longer imports live-pricing-adapter;
// instead it emits 'priceTick' events. live-pricing subscribes here at module-load
// and binds its tradingMode getter back so ws-adapter can label broadcast payloads
// without a reverse import. Subscription is registered ONCE (singleton import side
// effect); removeAllListeners defensive in case of HMR/test re-import.
import type { PriceTickEvent } from '../exchanges/kraken/kraken-websocket-adapter.js';
krakenWebSocketAdapter.removeAllListeners('priceTick');
krakenWebSocketAdapter.on('priceTick', (evt: PriceTickEvent) => {
  try {
    // NARROW, never cast — the same rule as the writer at :307. A priceTick always carries a
    // price, so `no_price_produced` cannot occur here; but the type permits it, and asserting that
    // away is how the #448 literal-assertion drift starts. If it is ever null, there is nothing to
    // cache and we skip rather than invent a producer.
    const _p = toCachedProducer(evt.producer);
    if (_p !== null) livePricingAdapter.updateCache(evt.symbol, evt.price, evt.source, _p, evt.traceId);
  } catch (err) {
    // Subscriber error must not propagate back to ws-adapter (fire-and-forget invariant)
    console.error('[B78.1][PRICING_TICK_HANDLER] error processing priceTick event:', err);
  }
});
krakenWebSocketAdapter.bindTradingModeGetter(() => livePricingAdapter.getTradingMode());
console.log('[B78.1][PRICING] subscribed to ws-adapter priceTick events + bound tradingMode getter');
