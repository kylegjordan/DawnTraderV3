/**
 * Phase 8.8.3-I7-MAP-AUTO: Automatic Kraken Symbol Mapping
 * 
 * Fetches Kraken AssetPairs metadata and builds a dynamic, verified mapping table.
 * Replaces manual static maps with auto-generated canonical mappings.
 */

import axios from 'axios';
import { KRAKEN_SYMBOL_MAP, KrakenPairMapping } from './kraken-symbol-map';
// P19-B6.5f (reorg-B1): push the live-discovered quote set into the shared recognition SSOT
// slot (shared/ never imports server/, so the server pushes). Called on every refresh().
import { setDiscoveredQuotes } from '../../shared/asset-classes.js';

const LOG_PREFIX = '[I7-MAP-AUTO]';

/**
 * Raw Kraken AssetPair metadata from API response
 */
export interface KrakenAssetPairRaw {
  altname: string;           // REST altname (e.g., "ADAUSD")
  wsname?: string;           // WebSocket name (e.g., "ADA/USD")
  aclass_base: string;       // Asset class of base (usually "currency")
  base: string;              // Base asset (e.g., "ADA")
  aclass_quote: string;      // Asset class of quote
  quote: string;             // Quote asset (e.g., "ZUSD")
  status: string;            // "online", "cancel_only", "post_only", etc.
  margin_call?: number;
  margin_stop?: number;
  ordermin?: string;
  costmin?: string;
  tick_size?: string;
  lot?: string;
  lot_decimals?: number;
  lot_multiplier?: number;
  pair_decimals?: number;
  leverage_buy?: number[];
  leverage_sell?: number[];
  fees?: Array<[number, number]>;
  fees_maker?: Array<[number, number]>;
  fee_volume_currency?: string;
  margin?: boolean;
}

/**
 * Confidence tier for mapping reliability
 */
export type MappingTier = 1 | 2 | 3;

/**
 * Auto-generated mapping entry
 */
export interface AutoMappingEntry {
  internalSymbol: string;     // Canonical format: "ADA/USD"
  krakenRestPair: string;     // Kraken REST: "ADAUSD"
  krakenWsPair: string;       // Kraken WebSocket: "ADA/USD"
  krakenPairKey: string;      // Original Kraken key (e.g., "ADAUSD")
  base: string;               // Normalized base: "ADA"
  quote: string;              // Normalized quote: "USD"
  rawBase: string;            // Original Kraken base
  rawQuote: string;           // Original Kraken quote
  isSpot: boolean;
  isMargin: boolean;
  isHalted: boolean;
  tier: MappingTier;          // Confidence tier
  tierReason: string;         // Why this tier was assigned
}

/**
 * Mapping summary statistics
 */
export interface MappingSummary {
  total: number;
  tier1: number;
  tier2: number;
  tier3: number;
  unmappable: number;
  collisions: number;
  staticMapSize: number;
  lastRefresh: string;
}

/**
 * Canonical asset normalization rules
 * Kraken uses various prefixes/suffixes that need standardization
 */
const ASSET_NORMALIZATION: Record<string, string> = {
  // Bitcoin
  'XBT': 'BTC',
  'XXBT': 'BTC',
  // Ethereum
  'XETH': 'ETH',
  // Fiat with Z prefix
  'ZUSD': 'USD',
  'ZEUR': 'EUR',
  'ZGBP': 'GBP',
  'ZCAD': 'CAD',
  'ZJPY': 'JPY',
  'ZAUD': 'AUD',
  'ZCHF': 'CHF',
  // Legacy crypto with X prefix
  'XLTC': 'LTC',
  'XXLM': 'XLM',
  'XXRP': 'XRP',
  'XXMR': 'XMR',
  'XZEC': 'ZEC',
  'XDOGE': 'DOGE',
  'XDG': 'DOGE',
  'XETC': 'ETC',
  'XREP': 'REP',
  'XMLN': 'MLN',
};

/**
 * Reverse normalization: Internal → Kraken WS format
 */
const WS_ASSET_REVERSE: Record<string, string> = {
  'BTC': 'XBT',
  'DOGE': 'XDG',
};

/**
 * Valid quote currencies for automatic detection
 */
// P19-B6.5f (reorg-B1): widened to the COMPLETE live quote set (Langston cond #2 — seed =
// fallback = complete, so the pre-first-refresh window is never narrow). Enumerated from live
// /0/public/AssetPairs 2026-06-19 (23 distinct legs). Keeps raw forms (XBT) alongside
// canonical (BTC) because parseAltname matches RAW altname suffixes (e.g. "ETHXBT").
const VALID_QUOTES = new Set([
  // fiat
  'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD',
  // USD-/EUR-likes + stablecoins (full live set)
  'USDT', 'USDC', 'PYUSD', 'DAI', 'EUROP', 'RLUSD', 'EURC', 'USD1',
  'AUSD', 'USDD', 'USDQ', 'USDR', 'FIDD',
  // crypto quote legs (canonical + raw form for altname suffix matching)
  'BTC', 'ETH', 'XBT', 'SOL',
]);

class KrakenAssetPairsService {
  private autoMap: Map<string, AutoMappingEntry> = new Map();
  private byRestPair: Map<string, AutoMappingEntry> = new Map();
  private byWsPair: Map<string, AutoMappingEntry> = new Map();
  private byKrakenKey: Map<string, AutoMappingEntry> = new Map();
  
  // I7-COMPACT-MAP: Map from compact symbol (e.g., 'MORPHOUSD', 'RUJIEUR') → pair info
  private compactSymbolMap: Map<string, AutoMappingEntry> = new Map();
  
  private unmappableSymbols: Array<{ symbol: string; reason: string }> = [];
  private conflicts: Array<{ symbol: string; details: string }> = [];
  private lastRefresh: Date | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  
  private refreshMutex = false;
  private dynamicQuotes: Set<string> = new Set(VALID_QUOTES);

  /**
   * Normalize a Kraken asset to canonical internal format
   */
  normalizeAsset(raw: string): string {
    const upper = raw.toUpperCase();
    return ASSET_NORMALIZATION[upper] || upper;
  }

  /**
   * Convert internal asset to Kraken WS format
   */
  toKrakenWsAsset(internal: string): string {
    const upper = internal.toUpperCase();
    return WS_ASSET_REVERSE[upper] || upper;
  }

  /**
   * Determine mapping tier based on validation
   */
  private determineTier(
    entry: AutoMappingEntry,
    staticMapping: KrakenPairMapping | undefined,
    raw: KrakenAssetPairRaw
  ): { tier: MappingTier; reason: string } {
    // Tier 1: Verified 1:1 match with static map
    if (staticMapping) {
      if (
        staticMapping.krakenRestPair.toUpperCase() === entry.krakenRestPair.toUpperCase() &&
        staticMapping.krakenWsPair.toUpperCase() === entry.krakenWsPair.toUpperCase()
      ) {
        return { tier: 1, reason: 'Verified: matches static map exactly' };
      }
      return { tier: 2, reason: `Static map exists but differs: REST=${staticMapping.krakenRestPair} WS=${staticMapping.krakenWsPair}` };
    }

    // Tier 2: Derived from base/quote via normalization
    // Check if wsname is available and matches our construction
    if (raw.wsname) {
      const expectedWs = `${entry.base}/${entry.quote}`;
      const krakenWsNormalized = this.normalizeWsPair(raw.wsname);
      if (krakenWsNormalized === expectedWs) {
        return { tier: 2, reason: 'Derived: wsname matches normalized format' };
      }
    }

    // Check if altname parsing is unambiguous
    const altUpper = raw.altname.toUpperCase();
    const parsedFromAlt = this.parseAltname(altUpper);
    if (parsedFromAlt && parsedFromAlt.base === entry.base && parsedFromAlt.quote === entry.quote) {
      return { tier: 2, reason: 'Derived: altname parsing matches normalized assets' };
    }

    // Tier 3: Uncertain - needs manual attention
    return { tier: 3, reason: 'Uncertain: could not verify mapping automatically' };
  }

  /**
   * Parse altname to extract base/quote
   * Uses dynamicQuotes (built from API metadata) with static fallback
   */
  private parseAltname(altname: string): { base: string; quote: string } | null {
    // Try dynamic quotes first (built from API metadata)
    for (const quote of this.dynamicQuotes) {
      if (altname.endsWith(quote) && altname.length > quote.length) {
        const base = altname.slice(0, -quote.length);
        return { base: this.normalizeAsset(base), quote: this.normalizeAsset(quote) };
      }
    }
    // Fallback to static quotes
    for (const quote of VALID_QUOTES) {
      if (altname.endsWith(quote) && altname.length > quote.length) {
        const base = altname.slice(0, -quote.length);
        return { base: this.normalizeAsset(base), quote: this.normalizeAsset(quote) };
      }
    }
    return null;
  }

  /**
   * Normalize Kraken WS pair (e.g., "XBT/USD" → "BTC/USD")
   */
  private normalizeWsPair(wsPair: string): string {
    if (!wsPair.includes('/')) return wsPair;
    const [base, quote] = wsPair.split('/');
    return `${this.normalizeAsset(base)}/${this.normalizeAsset(quote)}`;
  }

  /**
   * Build internal symbol from Kraken base/quote assets
   */
  private buildInternalSymbol(rawBase: string, rawQuote: string): string {
    const base = this.normalizeAsset(rawBase);
    const quote = this.normalizeAsset(rawQuote);
    return `${base}/${quote}`;
  }

  /**
   * Build Kraken WS pair from internal symbol
   */
  private buildWsPair(base: string, quote: string): string {
    const wsBase = this.toKrakenWsAsset(base);
    const wsQuote = this.toKrakenWsAsset(quote);
    return `${wsBase}/${wsQuote}`;
  }

  /**
   * Fetch Kraken AssetPairs and build auto-map
   * Protected by mutex to prevent concurrent refresh corruption
   */
  async refresh(): Promise<void> {
    if (this.refreshMutex) {
      console.log(`${LOG_PREFIX} Refresh already in progress, skipping`);
      return;
    }
    
    this.refreshMutex = true;
    console.log(`${LOG_PREFIX} Fetching Kraken AssetPairs...`);
    
    try {
      const response = await axios.get<{
        error: string[];
        result: Record<string, KrakenAssetPairRaw>;
      }>('https://api.kraken.com/0/public/AssetPairs', {
        timeout: 30000,
      });

      if (response.data.error && response.data.error.length > 0) {
        throw new Error(`Kraken API error: ${response.data.error.join(', ')}`);
      }

      const pairs = response.data.result;
      const pairCount = Object.keys(pairs).length;
      console.log(`${LOG_PREFIX} Received ${pairCount} asset pairs from Kraken`);

      // Build dynamic quotes from API metadata before clearing maps
      const newDynamicQuotes = new Set<string>(VALID_QUOTES);
      for (const [_, raw] of Object.entries(pairs)) {
        const quote = this.normalizeAsset(raw.quote);
        newDynamicQuotes.add(quote);
      }
      this.dynamicQuotes = newDynamicQuotes;
      console.log(`${LOG_PREFIX} Built dynamic quotes: ${newDynamicQuotes.size} unique quotes`);
      // P19-B6.5f (reorg-B1): push the freshly-rebuilt quote set into the shared recognition
      // SSOT slot on EVERY refresh (not just boot — Langston Step-3 condition), so a newly-
      // listed Kraken quote is recognized without a server restart. The curated 23-leg
      // KNOWN_QUOTE_CURRENCIES covers the pre-first-refresh + refresh-failure path.
      setDiscoveredQuotes(newDynamicQuotes);

      // Clear previous data
      this.autoMap.clear();
      this.byRestPair.clear();
      this.byWsPair.clear();
      this.byKrakenKey.clear();
      this.compactSymbolMap.clear(); // I7-COMPACT-MAP
      this.unmappableSymbols = [];
      this.conflicts = [];
      
      let skippedHalted = 0;
      let skippedMarginOnly = 0;

      // Build static map lookup for tier verification
      const staticByInternal = new Map<string, KrakenPairMapping>();
      for (const entry of KRAKEN_SYMBOL_MAP) {
        staticByInternal.set(entry.internalSymbol.toUpperCase(), entry);
      }

      // Process each pair
      for (const [krakenKey, raw] of Object.entries(pairs)) {
        try {
          // Skip darkpool pairs (contain ".d")
          if (krakenKey.includes('.d') || krakenKey.includes('.D')) {
            continue;
          }

          // Skip halted/offline pairs - these cannot be traded
          if (raw.status !== 'online') {
            skippedHalted++;
            continue;
          }
          
          // Skip margin-only pairs (no spot trading available)
          // Spot-capable pairs have aclass_base and aclass_quote === 'currency'
          // Non-currency asset classes indicate futures, margin-only, or other non-spot products
          const isSpotCapable = raw.aclass_base === 'currency' && raw.aclass_quote === 'currency';
          if (!isSpotCapable) {
            skippedMarginOnly++;
            continue;
          }

          const internalSymbol = this.buildInternalSymbol(raw.base, raw.quote);
          const base = this.normalizeAsset(raw.base);
          const quote = this.normalizeAsset(raw.quote);
          
          // Determine REST pair (use altname)
          const krakenRestPair = raw.altname || krakenKey;
          
          // Determine WS pair (prefer wsname, fallback to constructed)
          let krakenWsPair: string;
          if (raw.wsname) {
            krakenWsPair = raw.wsname;
          } else {
            krakenWsPair = this.buildWsPair(base, quote);
          }

          const entry: AutoMappingEntry = {
            internalSymbol,
            krakenRestPair,
            krakenWsPair,
            krakenPairKey: krakenKey,
            base,
            quote,
            rawBase: raw.base,
            rawQuote: raw.quote,
            isSpot: raw.aclass_base === 'currency',
            isMargin: !!raw.margin,
            isHalted: raw.status !== 'online',
            tier: 3,
            tierReason: '',
          };

          // Determine tier
          const staticMapping = staticByInternal.get(internalSymbol.toUpperCase());
          const tierResult = this.determineTier(entry, staticMapping, raw);
          entry.tier = tierResult.tier;
          entry.tierReason = tierResult.reason;

          // Check for collisions
          const existing = this.autoMap.get(internalSymbol.toUpperCase());
          if (existing) {
            // Keep the one with better tier, or prefer wsname availability
            if (entry.tier < existing.tier || (entry.tier === existing.tier && raw.wsname && !existing.krakenWsPair.includes('/'))) {
              this.conflicts.push({
                symbol: internalSymbol,
                details: `Collision: ${krakenKey} vs ${existing.krakenPairKey}, keeping ${krakenKey} (tier ${entry.tier})`,
              });
              this.autoMap.set(internalSymbol.toUpperCase(), entry);
              this.byKrakenKey.set(krakenKey.toUpperCase(), entry);
              // I7-COMPACT-MAP: Also update compact symbol map on collision resolution
              const compactSymbol = `${base}${quote}`.toUpperCase();
              this.compactSymbolMap.set(compactSymbol, entry);
            } else {
              this.conflicts.push({
                symbol: internalSymbol,
                details: `Collision: ${krakenKey} vs ${existing.krakenPairKey}, keeping ${existing.krakenPairKey} (tier ${existing.tier})`,
              });
            }
            continue;
          }

          // Add to maps
          this.autoMap.set(internalSymbol.toUpperCase(), entry);
          this.byRestPair.set(krakenRestPair.toUpperCase(), entry);
          this.byWsPair.set(krakenWsPair.toUpperCase(), entry);
          this.byKrakenKey.set(krakenKey.toUpperCase(), entry);
          
          // I7-COMPACT-MAP: Add compact symbol entry (e.g., "MORPHOUSD", "RUJIEUR", "ZUSDZJPY")
          // Use normalized base/quote to create compact key
          const compactSymbol = `${base}${quote}`.toUpperCase();
          if (!this.compactSymbolMap.has(compactSymbol)) {
            this.compactSymbolMap.set(compactSymbol, entry);
          }

        } catch (err) {
          this.unmappableSymbols.push({
            symbol: krakenKey,
            reason: err instanceof Error ? err.message : 'Unknown error during processing',
          });
        }
      }

      this.lastRefresh = new Date();
      this.isInitialized = true;

      const summary = this.getSummary();
      console.log(`${LOG_PREFIX}[STARTUP] Auto-map built successfully`);
      console.log(`${LOG_PREFIX}[STARTUP] mapped=${summary.total}, tier1=${summary.tier1}, tier2=${summary.tier2}, tier3=${summary.tier3}, unmappable=${summary.unmappable}`);
      console.log(`${LOG_PREFIX}[STARTUP] skipped: halted=${skippedHalted}, marginOnly=${skippedMarginOnly}, dynamicQuotes=${this.dynamicQuotes.size}`);
      console.log(`${LOG_PREFIX}[I7-COMPACT-MAP] compactSymbolMap size=${this.compactSymbolMap.size}`);
      
      if (this.conflicts.length > 0) {
        console.log(`${LOG_PREFIX}[STARTUP] collisions=${this.conflicts.length}`);
      }

    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to fetch Kraken AssetPairs:`, error);
      throw error;
    } finally {
      this.refreshMutex = false;
    }
  }

  /**
   * Initialize the service (safe to call multiple times)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.refresh().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  /**
   * P19-B6.5f (reorg-B1): public read of the live-discovered quote set (the recognition
   * SSOT source the shared slot is fed from). Returns a copy. Diagnostics / tests.
   */
  getDiscoveredQuotes(): Set<string> {
    return new Set(this.dynamicQuotes);
  }

  /**
   * Get mapping summary statistics
   */
  getSummary(): MappingSummary {
    let tier1 = 0, tier2 = 0, tier3 = 0;
    
    for (const entry of this.autoMap.values()) {
      switch (entry.tier) {
        case 1: tier1++; break;
        case 2: tier2++; break;
        case 3: tier3++; break;
      }
    }

    return {
      total: this.autoMap.size,
      tier1,
      tier2,
      tier3,
      unmappable: this.unmappableSymbols.length,
      collisions: this.conflicts.length,
      staticMapSize: KRAKEN_SYMBOL_MAP.length,
      lastRefresh: this.lastRefresh?.toISOString() || 'never',
    };
  }

  /**
   * Get unmappable symbols
   */
  getUnmappable(): Array<{ symbol: string; reason: string }> {
    return [...this.unmappableSymbols];
  }

  /**
   * Get conflicts
   */
  getConflicts(): Array<{ symbol: string; details: string }> {
    return [...this.conflicts];
  }

  /**
   * Resolve by internal symbol (e.g., "ADA/USD")
   */
  resolveByInternal(internal: string): AutoMappingEntry | undefined {
    return this.autoMap.get(internal.toUpperCase());
  }

  /**
   * Resolve by Kraken REST pair (e.g., "ADAUSD")
   */
  resolveByRestPair(restPair: string): AutoMappingEntry | undefined {
    return this.byRestPair.get(restPair.toUpperCase());
  }

  /**
   * Resolve by Kraken WS pair (e.g., "ADA/USD" or "XBT/USD")
   */
  resolveByWsPair(wsPair: string): AutoMappingEntry | undefined {
    return this.byWsPair.get(wsPair.toUpperCase());
  }

  /**
   * Resolve by Kraken pair key (e.g., "ADAUSD", "XXBTZUSD")
   */
  resolveByKrakenKey(krakenKey: string): AutoMappingEntry | undefined {
    return this.byKrakenKey.get(krakenKey.toUpperCase());
  }

  /**
   * I7-COMPACT-MAP: Resolve by compact symbol (e.g., "MORPHOUSD", "RUJIEUR", "APTEUR")
   * This is the primary entry point for FX5-emitted symbols
   */
  resolveByCompactSymbol(compact: string): AutoMappingEntry | undefined {
    if (!compact) return undefined;
    const key = compact.trim().toUpperCase();
    return this.compactSymbolMap.get(key);
  }

  /**
   * Convert internal symbol to Kraken REST pair
   * Only returns Tier 1 or 2 mappings (safe for use)
   */
  toKrakenRest(internal: string): string | null {
    const entry = this.autoMap.get(internal.toUpperCase());
    if (!entry) return null;
    if (entry.tier > 2) return null; // Tier 3 not safe for auto-use
    return entry.krakenRestPair;
  }

  /**
   * Convert internal symbol to Kraken WS pair
   * Only returns Tier 1 or 2 mappings (safe for use)
   */
  toKrakenWS(internal: string): string | null {
    const entry = this.autoMap.get(internal.toUpperCase());
    if (!entry) return null;
    if (entry.tier > 2) return null; // Tier 3 not safe for auto-use
    return entry.krakenWsPair;
  }

  /**
   * Convert Kraken WS pair to internal symbol
   */
  fromKrakenWS(wsPair: string): string | null {
    const entry = this.byWsPair.get(wsPair.toUpperCase());
    if (entry) return entry.internalSymbol;
    
    // Fallback: normalize the WS pair directly
    return this.normalizeWsPair(wsPair);
  }

  /**
   * Check if a symbol is mappable (Tier 1 or 2)
   */
  isMappable(internal: string): boolean {
    const entry = this.autoMap.get(internal.toUpperCase());
    if (!entry) return false;
    return entry.tier <= 2;
  }

  /**
   * Get mapping tier for a symbol
   */
  getTier(internal: string): MappingTier | null {
    const entry = this.autoMap.get(internal.toUpperCase());
    return entry?.tier ?? null;
  }

  /**
   * Get all mappings (for diagnostics)
   */
  getAllMappings(): AutoMappingEntry[] {
    return Array.from(this.autoMap.values());
  }

  /**
   * Get all Tier 1 mappings
   */
  getTier1Mappings(): AutoMappingEntry[] {
    return Array.from(this.autoMap.values()).filter(e => e.tier === 1);
  }

  /**
   * Get all Tier 2 mappings
   */
  getTier2Mappings(): AutoMappingEntry[] {
    return Array.from(this.autoMap.values()).filter(e => e.tier === 2);
  }

  /**
   * Get all Tier 3 mappings (uncertain)
   */
  getTier3Mappings(): AutoMappingEntry[] {
    return Array.from(this.autoMap.values()).filter(e => e.tier === 3);
  }

  /**
   * Check initialization status
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * I7-COMPACT-MAP: Resolve a symbol in any format (internal, REST, WS, compact)
   * Tries all lookup methods to find the mapping
   * Priority: canonical (has '/') → compact map (O(1)) → other maps → fallback parsing
   */
  resolveAny(symbol: string): AutoMappingEntry | undefined {
    if (!symbol) return undefined;
    const trimmed = symbol.trim();
    const upper = trimmed.toUpperCase();
    
    // 1) If it looks canonical (has '/'), use internal map first
    if (upper.includes('/')) {
      const entry = this.autoMap.get(upper);
      if (entry) return entry;
      
      // Also check WS pair map (some WS names differ slightly)
      const wsEntry = this.byWsPair.get(upper);
      if (wsEntry) return wsEntry;
    }
    
    // 2) I7-COMPACT-MAP: Try compact symbol map directly (O(1) lookup)
    // This is the primary path for FX5-emitted symbols like "MORPHOUSD", "RUJIEUR"
    const compactEntry = this.compactSymbolMap.get(upper);
    if (compactEntry) return compactEntry;
    
    // 3) Try REST pair (e.g., "ADAUSD" in altname format)
    let entry = this.byRestPair.get(upper);
    if (entry) return entry;
    
    // 4) Try Kraken key (e.g., "XXBTZUSD")
    entry = this.byKrakenKey.get(upper);
    if (entry) return entry;
    
    // 5) Fallback: Try normalizing compact format to internal (e.g., "FORTHUSD" → "FORTH/USD")
    // Use dynamicQuotes (built from API) for edge cases not in compactSymbolMap
    for (const quote of this.dynamicQuotes) {
      if (upper.endsWith(quote) && upper.length > quote.length) {
        const base = upper.slice(0, -quote.length);
        const normalizedBase = this.normalizeAsset(base);
        const normalizedQuote = this.normalizeAsset(quote);
        const internalCandidate = `${normalizedBase}/${normalizedQuote}`;
        entry = this.autoMap.get(internalCandidate);
        if (entry) return entry;
      }
    }
    
    return undefined;
  }

  /**
   * Audit active symbols for mapping coverage
   * Now supports symbols in any format (compact, internal, REST, WS)
   */
  auditSymbols(symbols: string[]): {
    total: number;
    mapped: number;
    tier1: number;
    tier2: number;
    tier3: number;
    unmapped: Array<{ symbol: string; reason: string }>;
  } {
    const result = {
      total: symbols.length,
      mapped: 0,
      tier1: 0,
      tier2: 0,
      tier3: 0,
      unmapped: [] as Array<{ symbol: string; reason: string }>,
    };

    for (const symbol of symbols) {
      // Use resolveAny to handle any symbol format
      const entry = this.resolveAny(symbol);
      if (!entry) {
        result.unmapped.push({ symbol, reason: 'Not found in auto-map (tried all formats)' });
        continue;
      }

      result.mapped++;
      switch (entry.tier) {
        case 1: result.tier1++; break;
        case 2: result.tier2++; break;
        case 3: result.tier3++; break;
      }
    }

    return result;
  }
}

// Singleton instance
export const krakenAssetPairsService = new KrakenAssetPairsService();
