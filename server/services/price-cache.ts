/**
 * 🔒 LOCKED MODULE — DO NOT MODIFY
 * Directive: 8.8.4-A4.R10R-4 (Core System Hardening)
 * Owner: Dawn Trader Core
 * Summary: This module is production-locked. Changes require a formal directive.
 * 
 * Previous: A4.R10R-1 — Unified, Rate-Governed Price Cache
 * 
 * This service consolidates all price retrieval logic for:
 * - Open trades (2s refresh)
 * - Ready-to-Buy signals (15s refresh)
 * - FX5 snapshots (30s refresh)
 * 
 * Responsibilities:
 *  - Manage three priority buckets with distinct refresh intervals.
 *  - Maintain Kraken API load below 10 weighted requests/second.
 *  - Provide universal subscription/unsubscription API.
 *  - Deliver cached prices to all consuming modules.
 * 
 * A4.R10R-1: Uses canonical normalizeToInternalSymbol from kraken-symbol-resolver.
 */

import { KrakenService } from '../exchanges/kraken/kraken.js';
import { normalizeToInternalSymbol as normalizeKrakenPair } from '../markets/kraken-symbol-resolver';

export type PriceSourceTag = 'kraken_ws' | 'kraken_rest';

/**
 * Directive 11.0E.2: Added 'vtsSimulation' bucket for cache sandboxing
 * VTS simulations use isolated cache to prevent pollution of live data
 */
export type CacheBucketType = 'openTrade' | 'readyToBuy' | 'fx5Snapshot' | 'vtsSimulation';

interface CacheBucket {
  type: CacheBucketType;
  symbols: Set<string>;
  refreshIntervalMs: number;
  lastRefresh: number;
}

export interface CachedPrice {
  symbol: string;
  price: number;
  ask: number;
  bid: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  lastSource: PriceSourceTag;
  /**
   * ⛔ WHEN THE **MARK** WAS LAST WRITTEN — NOT THE SIDES. Read `sidesCapturedAtMs` for those.
   * ⚠️ MEASURED 2026-09-05 (`B-PRICE-SIDE-BY-JOB` W-3): this stamp is refreshed on every
   * WebSocket tick by a path that does not touch `bid`/`ask`, so it dates a field we do not
   * build levels from and says nothing about the two we do. Anything anchoring on a SIDE
   * must read the side's own stamp.
   */
  lastUpdatedAt: number;
  /**
   * ⭐ WHEN `bid`/`ask` WERE OBSERVED. `null` when no writer has ever supplied them for this
   * symbol — which is honest, and is what a level constructor must refuse on rather than
   * guess. ⛔ NEVER advanced by a writer that did not actually observe a side.
   */
  sidesCapturedAtMs: number | null;
  /**
   * ⭐ THE VENUE'S OWN STAMP for the observation that produced these sides, `null` when the
   * producing path did not carry one.
   * ⛔⛔ KEPT AS A SEPARATE FIELD FROM `sidesCapturedAtMs`, NEVER AS A DIFFERENCE (Langston's
   * condition 2, 2026-09-06): *"A delta can't be re-derived when one side turns out to be the
   * wrong object."* Storing `ourClock − venueClock` would discard the only thing that lets a
   * later reader discover WHICH clock was wrong — and this batch has already had two numbers
   * turn out to be about the wrong population.
   */
  venueObservedAtMs: number | null;
  /**
   * ⭐⭐ WHEN THE VENUE LAST *PUSHED* ABOUT THIS SYMBOL — advanced ONLY by `updateFromWebSocket`.
   *
   * ⛔⛔ ADDED 2026-09-06 BECAUSE THE LIVENESS TERM I SHIPPED THIS MORNING WAS INERT AND I FOUND
   * IT BY READING THE LIVE NUMBERS, NOT THE CODE. The feed-liveness count was built on
   * `lastUpdatedAt`, which THREE REST WRITERS ALSO ADVANCE. Measured on staging minutes after
   * deploy: 161 of 170 cache entries were `kraken_rest`-sourced. ⇒ a REST poller running on its
   * own schedule would have kept the "feed is alive" count high **while the WebSocket was dead** —
   * so the term could never detect the one failure it exists to catch.
   * ★ Same shape as the defect this whole batch is about: a field that is right for one job
   * (`lastUpdatedAt` genuinely dates the last cache write) used for another it cannot serve.
   */
  lastWsMessageAtMs: number | null;
  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7k (Langston Step-4 chunk 3 (2); `PRICING_DATA_ARCHITECTURE.md` §3.2 F1): WHICH QUANTITY
   * `price` holds — `'mid'`, a midpoint of the two sides, or `'last'`, the venue's last trade. This cache has three
   * writers that do not agree (the REST poller stores `c[0]`; `updateFromRest` a REST midpoint; `updateFromWebSocket`
   * the adapter's mark), and until P-7k the row did not say which, so signal generation read a mixture in an unknown
   * ratio. Decided WHERE THE PRICE IS BUILT and passed in, never re-derived from this row (`mark-kind.ts`: a cold row's
   * `bid === ask === price` would answer `'mid'` for a last trade). `null` = the writer could not state it.
   * ⛔ RECORD-ONLY: no decision reads it. It exists so the mixture is measured while it still feeds levels (before P-8c).
   */
  markKind: CacheMarkKind | null;
  /**
   * P-7k: the venue's TRUE LAST TRADE and our receipt time for it, under P-7i's names and P-7i's carry rule. The pair
   * moves together: a write carrying no print keeps the row's pair with its original stamp. ⛔ Unbounded in age by
   * design: no writer drops a print for being old; a reader applies its own ceiling to `lastTradeReceivedAtMs` (#546).
   */
  lastTradePrice: number | null;
  lastTradeReceivedAtMs: number | null;
}

/** P-7k: which quantity a cached `price` is. */
export type CacheMarkKind = 'mid' | 'last';

/**
 * P-7k: P-7i's carry rule for this row, in ONE place, with one predicate deciding both halves (Langston chunk-3 C1).
 * A real print (finite, positive) is stored with this write's receipt time; anything else keeps the held pair.
 */
function carryLastTrade(
  existing: CachedPrice | undefined,
  print: number | null | undefined,
  now: number,
): Pick<CachedPrice, 'lastTradePrice' | 'lastTradeReceivedAtMs'> {
  if (print != null && Number.isFinite(print) && print > 0) {
    return { lastTradePrice: print, lastTradeReceivedAtMs: now };
  }
  const held = existing?.lastTradePrice ?? null;
  return { lastTradePrice: held, lastTradeReceivedAtMs: held !== null ? (existing?.lastTradeReceivedAtMs ?? null) : null };
}

class UnifiedPriceCache {
  /**
   * Directive 11.0E.2: Added vtsSimulation bucket (60s refresh) for cache sandboxing
   * VTS data isolation prevents simulation from affecting live trading cache
   */
  private buckets: CacheBucket[] = [
    { type: 'openTrade', symbols: new Set(), refreshIntervalMs: 2000, lastRefresh: 0 },
    { type: 'readyToBuy', symbols: new Set(), refreshIntervalMs: 15000, lastRefresh: 0 },
    { type: 'fx5Snapshot', symbols: new Set(), refreshIntervalMs: 30000, lastRefresh: 0 },
    { type: 'vtsSimulation', symbols: new Set(), refreshIntervalMs: 60000, lastRefresh: 0 }
  ];

  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7g (decision D7; #977): a bucket's members are the UNION of independent REASONS.
   * `legacyMembers` holds what the one-way `subscribe()` added (the RTB and VTS callers); `reasonOwners` holds
   * owner-managed sets (e.g. `engine:paper` → the symbols it holds). A symbol leaves a bucket only when NO reason
   * still holds it — so releasing one owner never drops a symbol another owner, or a legacy subscribe, still needs.
   */
  private legacyMembers = new Map<CacheBucketType, Set<string>>();
  private reasonOwners = new Map<CacheBucketType, Map<string, Set<string>>>();

  private cache: Map<string, CachedPrice> = new Map();
  private currentWeight = 0;
  private refreshing = false;
  private krakenService: KrakenService;
  private weightResetInterval: NodeJS.Timeout | null = null;
  private refreshLoopInterval: NodeJS.Timeout | null = null;
  private healthLogInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private readonly MAX_WEIGHT_PER_SECOND = 10;
  private readonly BATCH_SIZE = 100;

  constructor() {
    this.krakenService = new KrakenService();
  }

  initialize(): void {
    if (this.isInitialized) {
      console.log('[A4.R10R-1][PriceCache] Already initialized');
      return;
    }

    this.weightResetInterval = setInterval(() => {
      this.currentWeight = 0;
    }, 1000);

    this.refreshLoopInterval = setInterval(() => {
      this.refreshBuckets().catch(err => {
        console.error('[A4.R10R-1][PriceCache] Refresh error:', err.message);
      });
    }, 1000);

    this.healthLogInterval = setInterval(() => this.logHealthLine(), 60000);

    this.isInitialized = true;
    console.log('[A4.R10R-1][PriceCache] Initialized with 4 buckets (openTrade=2s, readyToBuy=15s, fx5Snapshot=30s, vtsSimulation=60s)');
  }

  shutdown(): void {
    if (this.weightResetInterval) {
      clearInterval(this.weightResetInterval);
      this.weightResetInterval = null;
    }
    if (this.refreshLoopInterval) {
      clearInterval(this.refreshLoopInterval);
      this.refreshLoopInterval = null;
    }
    if (this.healthLogInterval) {
      clearInterval(this.healthLogInterval);
      this.healthLogInterval = null;
    }
    this.isInitialized = false;
    console.log('[A4.R10R-1][PriceCache] Shutdown complete');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async safeFetch<T>(weight: number, fn: () => Promise<T>): Promise<T> {
    const maxRetries = 20;
    let retries = 0;

    while (this.currentWeight + weight > this.MAX_WEIGHT_PER_SECOND && retries < maxRetries) {
      await this.delay(250);
      retries++;
    }

    if (retries >= maxRetries) {
      throw new Error('[A4.R10R-1] Rate limit budget exhausted after max retries');
    }

    this.currentWeight += weight;
    return fn();
  }

  private async refreshBuckets(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;

    const now = Date.now();

    try {
      for (const bucket of this.buckets) {
        if (now - bucket.lastRefresh >= bucket.refreshIntervalMs && bucket.symbols.size > 0) {
          await this.refreshBucket(bucket, now);
        }
      }
    } finally {
      this.refreshing = false;
    }
  }

  private async refreshBucket(bucket: CacheBucket, now: number): Promise<void> {
    const symbols = Array.from(bucket.symbols);
    
    for (let i = 0; i < symbols.length; i += this.BATCH_SIZE) {
      const batch = symbols.slice(i, i + this.BATCH_SIZE);
      const pairString = batch.map(s => this.toKrakenSymbol(s)).join(',');
      
      try {
        await this.safeFetch(1, async () => {
          const data = await this.krakenService.getTicker(pairString);
          
          for (const [pair, ticker] of Object.entries(data)) {
            const normalizedSymbol = normalizeKrakenPair(pair);
            const cachedPrice: CachedPrice = {
              symbol: normalizedSymbol,
              price: parseFloat(ticker.c?.[0] || '0'),
              ask: parseFloat(ticker.a?.[0] || '0'),
              bid: parseFloat(ticker.b?.[0] || '0'),
              volume24h: parseFloat(ticker.v?.[1] || '0'),
              high24h: parseFloat(ticker.h?.[1] || '0'),
              low24h: parseFloat(ticker.l?.[1] || '0'),
              lastSource: 'kraken_rest',
              // ⭐ THIS PATH GENUINELY OBSERVES BOTH SIDES (`ticker.a` / `ticker.b` above), so it dates
              // them — unlike the tick paths, which refresh the mark and leave the sides alone.
              sidesCapturedAtMs: Date.now(),
              // ⛔ NULL, STATED — the REST ticker response is not the WebSocket frame and carries no
              // venue stamp we parse. Absent is refusable; invented would be indistinguishable from real.
              venueObservedAtMs: null,
              // ⛔ REST path — NOT a push. Carries forward, never advances.
              lastWsMessageAtMs: this.cache.get(normalizedSymbol)?.lastWsMessageAtMs ?? null,
              // B-PRICE-SIDE-BY-JOB r5 P-7k (F1): this poller stores the raw REST `c[0]` as `price`, which is the venue's LAST
              // TRADE, so the row states that kind, and the same number is this write's print.
              markKind: 'last',
              ...carryLastTrade(this.cache.get(normalizedSymbol), parseFloat(ticker.c?.[0] || '0'), now),
              lastUpdatedAt: now,
            };
            
            this.cache.set(normalizedSymbol, cachedPrice);
            
            const requestedSymbol = batch.find(s => this.symbolsMatch(s, normalizedSymbol));
            if (requestedSymbol && requestedSymbol !== normalizedSymbol) {
              this.cache.set(requestedSymbol, cachedPrice);
            }
          }
          
          console.log(`[A4.R10R-1][PriceCache][${bucket.type}] refreshed ${batch.length} symbols`);
        });
      } catch (err: any) {
        console.warn(`[A4.R10R-1][PriceCache][${bucket.type}] Batch fetch error:`, err.message);
      }
    }

    bucket.lastRefresh = now;
  }

  private toKrakenSymbol(symbol: string): string {
    const parts = symbol.split('/');
    if (parts.length !== 2) return symbol;
    
    let [base, quote] = parts;
    
    if (base === 'BTC') base = 'XBT';
    
    return `${base}${quote}`;
  }

  private symbolsMatch(a: string, b: string): boolean {
    const normalizeA = normalizeKrakenPair(a);
    const normalizeB = normalizeKrakenPair(b);
    return normalizeA === normalizeB;
  }

  subscribe(symbol: string, bucketType: CacheBucketType): void {
    const bucket = this.buckets.find(b => b.type === bucketType);
    if (!bucket) {
      console.warn(`[A4.R10R-1][PriceCache] Invalid bucket type: ${bucketType}`);
      return;
    }
    this.legacyOf(bucketType).add(symbol);
    bucket.symbols.add(symbol);
    console.log(`[A4.R10R-1][PriceCache] Subscribed ${symbol} to ${bucketType} (total: ${bucket.symbols.size})`);
  }

  unsubscribe(symbol: string): void {
    // P-7g: releases the LEGACY reason in every bucket. A symbol an owner still holds stays subscribed.
    for (const bucket of this.buckets) {
      this.legacyOf(bucket.type).delete(symbol);
      this.recomputeMembers(bucket.type);
    }
  }

  unsubscribeFrom(symbol: string, bucketType: CacheBucketType): void {
    this.legacyOf(bucketType).delete(symbol);
    this.recomputeMembers(bucketType);
  }

  /**
   * B-PRICE-SIDE-BY-JOB r5 P-7g: REPLACE one owner's reason for a bucket with exactly these symbols, then
   * recompute the bucket as the union of every reason. Called on every tick by the owner with its current
   * truth (e.g. the engine with the symbols it holds), so creates, closes by ANY path, and restarts are all
   * reconciled without a per-call-site subscribe/unsubscribe pair to forget.
   */
  setReasonMembers(bucketType: CacheBucketType, owner: string, symbols: Iterable<string>): void {
    if (!this.buckets.some(b => b.type === bucketType)) {
      console.warn(`[P-7g][PriceCache] Invalid bucket type: ${bucketType}`);
      return;
    }
    let owners = this.reasonOwners.get(bucketType);
    if (!owners) { owners = new Map(); this.reasonOwners.set(bucketType, owners); }
    owners.set(owner, new Set(symbols));
    this.recomputeMembers(bucketType);
  }

  /** The bucket's current members (a copy). */
  getBucketMembers(bucketType: CacheBucketType): string[] {
    const bucket = this.buckets.find(b => b.type === bucketType);
    return bucket ? Array.from(bucket.symbols) : [];
  }

  private legacyOf(bucketType: CacheBucketType): Set<string> {
    let s = this.legacyMembers.get(bucketType);
    if (!s) { s = new Set(); this.legacyMembers.set(bucketType, s); }
    return s;
  }

  /** Mutates the bucket's Set IN PLACE (a holder of the reference keeps seeing the live membership). */
  private recomputeMembers(bucketType: CacheBucketType): void {
    const bucket = this.buckets.find(b => b.type === bucketType);
    if (!bucket) return;
    const next = new Set<string>(this.legacyOf(bucketType));
    for (const set of this.reasonOwners.get(bucketType)?.values() ?? []) {
      for (const s of set) next.add(s);
    }
    bucket.symbols.clear();
    for (const s of next) bucket.symbols.add(s);
  }

  getCachedPrice(symbol: string): CachedPrice | null {
    return this.cache.get(symbol) || null;
  }

  async getPrice(symbol: string, bucketType: CacheBucketType = 'readyToBuy'): Promise<CachedPrice | null> {
    const bucket = this.buckets.find(b => b.type === bucketType);
    const refreshInterval = bucket?.refreshIntervalMs ?? 15000;
    
    const cached = this.cache.get(symbol);
    const now = Date.now();
    
    const isFresh = cached && (now - cached.lastUpdatedAt) < refreshInterval;
    
    if (isFresh) {
      return cached;
    }
    
    if (!bucket?.symbols.has(symbol)) {
      this.subscribe(symbol, bucketType);
    }
    
    try {
      let fetchedData: CachedPrice | null = null;
      
      await this.safeFetch(1, async () => {
        const krakenSymbol = this.toKrakenSymbol(symbol);
        const data = await this.krakenService.getTicker(krakenSymbol);
        
        for (const [pair, ticker] of Object.entries(data)) {
          const normalizedSymbol = normalizeKrakenPair(pair);
          const tickerData: CachedPrice = {
            symbol: normalizedSymbol,
            price: parseFloat(ticker.c?.[0] || '0'),
            ask: parseFloat(ticker.a?.[0] || '0'),
            bid: parseFloat(ticker.b?.[0] || '0'),
            volume24h: parseFloat(ticker.v?.[1] || '0'),
            high24h: parseFloat(ticker.h?.[1] || '0'),
            low24h: parseFloat(ticker.l?.[1] || '0'),
            lastSource: 'kraken_rest',
            // ⭐ THIS PATH GENUINELY OBSERVES BOTH SIDES (`ticker.a` / `ticker.b` above), so it dates
            // them — unlike the tick paths, which refresh the mark and leave the sides alone.
            sidesCapturedAtMs: Date.now(),
            // ⛔ NULL, STATED — the REST ticker response is not the WebSocket frame and carries no
            // venue stamp we parse. Absent is refusable; invented would be indistinguishable from real.
            venueObservedAtMs: null,
            // ⛔ REST path — NOT a push. Carries forward, never advances.
            lastWsMessageAtMs: this.cache.get(normalizedSymbol)?.lastWsMessageAtMs ?? null,
            // B-PRICE-SIDE-BY-JOB r5 P-7k (F1): this poller stores the raw REST `c[0]` as `price`, which is the venue's LAST
            // TRADE, so the row states that kind, and the same number is this write's print.
            markKind: 'last',
            ...carryLastTrade(this.cache.get(normalizedSymbol), parseFloat(ticker.c?.[0] || '0'), now),
            lastUpdatedAt: now,
          };
          
          this.cache.set(normalizedSymbol, tickerData);
          
          if (normalizedSymbol === symbol || this.symbolsMatch(normalizedSymbol, symbol)) {
            this.cache.set(symbol, tickerData);
            fetchedData = tickerData;
          }
        }
      });
      
      return fetchedData || this.cache.get(symbol) || null;
    } catch (err: any) {
      console.warn(`[A4.R10R-1][PriceCache] getPrice error for ${symbol}:`, err.message);
      return cached || null;
    }
  }

  /**
   * ⭐ FEED LIVENESS AS A COUNT OF DISTINCT SYMBOLS, NOT AS A RECENCY GAUGE (Langston, 2026-09-06).
   *
   * ⛔ THE FORM MATTERS AND THE OBVIOUS FORM IS WRONG. A feed-wide "last message age" stays green
   * on ONE chatty name, so it cannot see a feed that has gone silent except for a handful of
   * symbols. This batch measured exactly that failure in its own data: THREE stablecoins carried
   * the busiest decile of a 460-symbol pool. Counting DISTINCT SYMBOLS heard from is the only
   * form of the control that works.
   *
   * ⛔ Returns a RAW COUNT and never a "healthy" boolean — the caller records the number and the
   * window beside it, and the threshold is set later from the observed distribution.
   */
  countSymbolsWithMessageSince(sinceMs: number): number {
    let n = 0;
    for (const p of this.cache.values()) if (p.lastUpdatedAt >= sinceMs) n++;
    return n;
  }

  /**
   * ⭐⭐ THE ONE THAT CAN ACTUALLY SEE A DEAD SOCKET — counts symbols the venue PUSHED to us.
   * ⛔ Both counters are recorded, never just this one: the DIFFERENCE between them is the
   * measurement that says whether the REST poller is masking a WebSocket outage. A single
   * "is the feed healthy" number would have thrown that away.
   */
  countSymbolsWithWsMessageSince(sinceMs: number): number {
    let n = 0;
    for (const p of this.cache.values()) {
      if (p.lastWsMessageAtMs !== null && p.lastWsMessageAtMs >= sinceMs) n++;
    }
    return n;
  }

  getAllCachedPrices(): CachedPrice[] {
    return Array.from(this.cache.values());
  }

  /**
   * A4.R10R-1: Check if a symbol exists in the cache
   */
  has(symbol: string): boolean {
    return this.cache.has(symbol);
  }

  /**
   * A4.R10R-1: Batch retrieval for FX5 integration
   * Returns cached prices for a list of symbols, fetching missing ones if needed
   */
  async getBatch(bucketType: CacheBucketType, symbols: string[]): Promise<Map<string, CachedPrice>> {
    const result = new Map<string, CachedPrice>();
    const bucket = this.buckets.find(b => b.type === bucketType);
    const refreshInterval = bucket?.refreshIntervalMs ?? 30000;
    const now = Date.now();
    const missingSymbols: string[] = [];

    for (const symbol of symbols) {
      const cached = this.cache.get(symbol);
      const isFresh = cached && (now - cached.lastUpdatedAt) < refreshInterval;
      
      if (isFresh) {
        result.set(symbol, cached);
      } else {
        missingSymbols.push(symbol);
        if (bucket && !bucket.symbols.has(symbol)) {
          bucket.symbols.add(symbol);
        }
      }
    }

    if (missingSymbols.length > 0) {
      try {
        for (let i = 0; i < missingSymbols.length; i += this.BATCH_SIZE) {
          const batch = missingSymbols.slice(i, i + this.BATCH_SIZE);
          const pairString = batch.map(s => this.toKrakenSymbol(s)).join(',');
          
          await this.safeFetch(1, async () => {
            const data = await this.krakenService.getTicker(pairString);
            
            for (const [pair, ticker] of Object.entries(data)) {
              const normalizedSymbol = normalizeKrakenPair(pair);
              const tickerData: CachedPrice = {
                symbol: normalizedSymbol,
                price: parseFloat(ticker.c?.[0] || '0'),
                ask: parseFloat(ticker.a?.[0] || '0'),
                bid: parseFloat(ticker.b?.[0] || '0'),
                volume24h: parseFloat(ticker.v?.[1] || '0'),
                high24h: parseFloat(ticker.h?.[1] || '0'),
                low24h: parseFloat(ticker.l?.[1] || '0'),
                lastSource: 'kraken_rest',
                // ⭐ THIS PATH GENUINELY OBSERVES BOTH SIDES (`ticker.a` / `ticker.b` above), so it dates
                // them — unlike the tick paths, which refresh the mark and leave the sides alone.
                sidesCapturedAtMs: Date.now(),
                // ⛔ NULL, STATED — the REST ticker response is not the WebSocket frame and carries no
                // venue stamp we parse. Absent is refusable; invented would be indistinguishable from real.
                venueObservedAtMs: null,
              // ⛔ REST path — NOT a push. Carries forward, never advances.
              lastWsMessageAtMs: this.cache.get(normalizedSymbol)?.lastWsMessageAtMs ?? null,
              // B-PRICE-SIDE-BY-JOB r5 P-7k (F1): this poller stores the raw REST `c[0]` as `price`, which is the venue's LAST
              // TRADE, so the row states that kind, and the same number is this write's print.
              markKind: 'last',
              ...carryLastTrade(this.cache.get(normalizedSymbol), parseFloat(ticker.c?.[0] || '0'), now),
                lastUpdatedAt: now,
              };
              
              this.cache.set(normalizedSymbol, tickerData);
              result.set(normalizedSymbol, tickerData);
              
              const requestedSymbol = batch.find(s => this.symbolsMatch(s, normalizedSymbol));
              if (requestedSymbol && requestedSymbol !== normalizedSymbol) {
                this.cache.set(requestedSymbol, tickerData);
                result.set(requestedSymbol, tickerData);
              }
            }
          });
        }
        console.log(`[A4.R10R-1][PriceCache][getBatch] Fetched ${missingSymbols.length} missing symbols for ${bucketType}`);
      } catch (err: any) {
        console.warn(`[A4.R10R-1][PriceCache][getBatch] Error fetching batch:`, err.message);
      }
    }

    return result;
  }

  /**
   * The periodic HEALTH line (every 60 s). P-7k: extracted from the interval so its mixture fields are testable; the
   * text up to `cacheSize` is unchanged.
   * `rowKind` is a SNAPSHOT of the cache's keys by kind (alias keys included, as in `cacheSize`), across both asset
   * classes and every lane. `levelReadKind` counts, SINCE THE PREVIOUS LINE (reset here, so each line is one interval),
   * the kind of the cached price at entry to each crypto quant-lane symbol evaluation that had a usable price.
   * ⛔ r2 (Langston chunk-4 C2, C3): `levelReadKind` is an UPPER BOUND on level-setting reads, not the set of them: most
   * evaluations return before a level is built, and the survivors skew to hot WS-fed names, so the true level-setting
   * mixture is likely MORE midpoint-heavy than this count. The two fields cover different populations (all rows against
   * one lane's reads), so they are never read as numerator and denominator.
   */
  private logHealthLine(): void {
    const open = this.buckets[0].symbols.size;
    const rtb = this.buckets[1].symbols.size;
    const fx5 = this.buckets[2].symbols.size;
    const vts = this.buckets[3].symbols.size;
    const kinds = this.getMarkKindCensus();
    this.levelReadKinds = { mid: 0, last: 0, unknown: 0 };
    const r = kinds.rows;
    const l = kinds.levelReads;
    console.log(`[A4.R10R-1][PriceCache][HEALTH] open=${open} rtb=${rtb} fx5=${fx5} vts=${vts} weight=${this.currentWeight}/${this.MAX_WEIGHT_PER_SECOND} cacheSize=${this.cache.size} rowKind=mid:${r.mid},last:${r.last},unknown:${r.unknown} levelReadKind=mid:${l.mid},last:${l.last},unknown:${l.unknown}`);
  }

  /** P-7k: kinds of the cached prices the crypto quant lane read at evaluation entry, since the last HEALTH line (an upper bound on level-setting reads). */
  private levelReadKinds = { mid: 0, last: 0, unknown: 0 };

  /**
   * P-7k (record-only): called by the crypto quant lane with the row it read at evaluation entry, after its invalid-price
   * guard (r2, Langston chunk-4 C1). A missing row is not counted either: no price was read.
   * ⚠️ WHAT IT DOES NOT COVER (r2, C3, and the chunk-4 hold): the VTS level lane reads the same rows, so its mixture shows
   * in `rowKind` only. Two further level-setting lanes appear in NEITHER field: the crypto PATTERN lane sets entry, stop
   * and target from a BAR CLOSE (`signal-orchestrator.ts:2224` into `patternToTradeSignal` at `:2286`, levels at
   * `:2293-2295`) and reads no cache row; and the xSTOCK ACTIVE lane (`asset_classes/xstock_spot/eval-cycle.ts`, levels
   * at `:722-726`, `:814-818`, `:1193-1197`) neither reads this cache nor counts. A `mid | last | unknown` count cannot
   * express `venue_close`, which `price-basis.ts` names and OBJ-8 owns.
   */
  noteLevelRead(row: CachedPrice | null | undefined): void {
    if (!row) return;
    if (row.markKind === 'mid') this.levelReadKinds.mid++;
    else if (row.markKind === 'last') this.levelReadKinds.last++;
    else this.levelReadKinds.unknown++;
  }

  /** P-7k: the mixture, as a snapshot of rows by kind and the level reads since the last HEALTH line. */
  getMarkKindCensus(): {
    rows: { mid: number; last: number; unknown: number };
    levelReads: { mid: number; last: number; unknown: number };
  } {
    const rows = { mid: 0, last: 0, unknown: 0 };
    for (const row of this.cache.values()) {
      if (row.markKind === 'mid') rows.mid++;
      else if (row.markKind === 'last') rows.last++;
      else rows.unknown++;
    }
    return { rows, levelReads: { ...this.levelReadKinds } };
  }

  getHealthMetrics(): {
    openTrade: number;
    readyToBuy: number;
    fx5Snapshot: number;
    currentWeight: number;
    maxWeight: number;
    cacheSize: number;
  } {
    return {
      openTrade: this.buckets[0].symbols.size,
      readyToBuy: this.buckets[1].symbols.size,
      fx5Snapshot: this.buckets[2].symbols.size,
      currentWeight: this.currentWeight,
      maxWeight: this.MAX_WEIGHT_PER_SECOND,
      cacheSize: this.cache.size,
    };
  }

  /**
   * ⛔⛔ B-PRICE-SIDE-BY-JOB — `bid`, `ask` AND THEIR CAPTURE INSTANT ARE NOW PARAMETERS.
   *
   * ★ THE DEFECT THIS CLOSES: this method took `(symbol, price)` only. The venue sends all three
   * on ONE frame and the adapter parses all three — but there was NO PARAMETER to carry the
   * sides, so they were dropped at the call while `lastUpdatedAt` was refreshed on every tick.
   * ⇒ the store's timestamp was TRUE of the mark and FALSE of the sides, and every level built
   * from a side inherited that.
   *
   * ⛔ A STATED `null` MEANS "this writer did not observe a side" AND IS NOT COERCED. The legacy
   * `?? price` substitution survives ONLY for the cold case where nothing has ever been stored —
   * which is where the fabricated `bid === ask === price` book came from, now confined to it.
   */
  updateFromWebSocket(
    symbol: string,
    price: number,
    bid: number | null = null,
    ask: number | null = null,
    sidesCapturedAtMs: number | null = null,
    venueObservedAtMs: number | null = null,
    /** P-7k: which quantity `price` is, stated by the caller that built it. REQUIRED: a new caller must say. */
    markKind: CacheMarkKind | null,
    /** P-7k: this write's last trade, or `null`; a `null` keeps the row's pair (P-7i's carry rule). */
    lastTradePrice: number | null,
  ): void {
    const now = Date.now();
    const existing = this.cache.get(symbol);
    // ⭐ A STATED side wins; an unstated one keeps what was there; and ONLY when neither exists
    // does the legacy mark-substitution apply — so the fabricated two-sided book is confined to
    // the cold-start case it came from rather than re-created on every tick.
    const _bid = bid ?? existing?.bid ?? price;
    const _ask = ask ?? existing?.ask ?? price;
    this.cache.set(symbol, {
      symbol,
      price,
      ask: _ask,
      bid: _bid,
      volume24h: existing?.volume24h ?? 0,
      high24h: existing?.high24h ?? price,
      low24h: existing?.low24h ?? price,
      lastSource: 'kraken_ws',
      // ⛔ ADVANCED ONLY WHEN A SIDE WAS ACTUALLY SUPPLIED. Re-stamping on a tick that did not
      // refresh the sides is the W-3 defect itself; leaving it alone is what lets a reader ask
      // "how old is this side?" and get a true answer.
      sidesCapturedAtMs: (bid !== null || ask !== null) ? (sidesCapturedAtMs ?? Date.now()) : (existing?.sidesCapturedAtMs ?? null),
      // ⛔ MOVES ONLY WITH THE SIDES IT DATES. A venue stamp advanced on a tick that did not
      // refresh the sides would date one observation while describing another — W-3 again,
      // one field over. When no side was supplied the previous stamp is carried, untouched.
      venueObservedAtMs: (bid !== null || ask !== null) ? venueObservedAtMs : (existing?.venueObservedAtMs ?? null),
      // ⭐ ADVANCED HERE AND NOWHERE ELSE — this is the only writer fed by a venue PUSH. Every
      // other writer carries the previous value forward untouched, which is what makes a silent
      // socket death visible instead of masked by the REST poller.
      lastWsMessageAtMs: now,
      // P-7k: `?? null` because a caller outside tsc (a test file) can omit the argument.
      markKind: markKind ?? null,
      ...carryLastTrade(existing, lastTradePrice, now),
      lastUpdatedAt: now,
    });
  }

  updateFromRest(symbol: string, price: number, markKind: CacheMarkKind | null, lastTradePrice: number | null): void {
    const now = Date.now();
    const existing = this.cache.get(symbol);
    this.cache.set(symbol, {
      symbol,
      price,
      ask: existing?.ask ?? price,
      bid: existing?.bid ?? price,
      volume24h: existing?.volume24h ?? 0,
      high24h: existing?.high24h ?? price,
      low24h: existing?.low24h ?? price,
      lastSource: 'kraken_rest',
      // ⛔⛔ PRESERVED, NEVER RE-STAMPED. `updateFromRest(symbol, price)` takes the MARK only and
      // carries the previous sides forward untouched. Dating them "now" would assert an
      // observation that never happened — W-3 rebuilt one line further down. I wrote `Date.now()`
      // here on the first pass and caught it; the sides keep the age they actually have.
      sidesCapturedAtMs: existing?.sidesCapturedAtMs ?? null,
      venueObservedAtMs: existing?.venueObservedAtMs ?? null,
      lastWsMessageAtMs: existing?.lastWsMessageAtMs ?? null,
      // P-7k: the caller decides the kind from the REST sides it read (`markKindOf`), and passes REST `c[0]` as the print.
      markKind: markKind ?? null,
      ...carryLastTrade(existing, lastTradePrice, now),
      lastUpdatedAt: now,
    });
  }

  get(symbol: string): CachedPrice | null {
    return this.cache.get(symbol) ?? null;
  }

  snapshot(): CachedPrice[] {
    return Array.from(this.cache.values());
  }

  clear(): void {
    this.cache.clear();
  }
}

export const priceCache = new UnifiedPriceCache();
