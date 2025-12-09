/**
 * Phase 8.8.3-I7 / I7-MAP-FIX: Kraken Symbol Resolver
 * 
 * Single source of truth for symbol translation.
 * All components use this resolver - no custom formatting elsewhere.
 * 
 * I7-MAP-FIX: Enhanced with dynamic fallback for symbols not in static map.
 */

import { KRAKEN_SYMBOL_MAP, KrakenPairMapping } from "./kraken-symbol-map";

const mapByInternal = new Map<string, KrakenPairMapping>();
const mapByRestPair = new Map<string, KrakenPairMapping>();
const mapByWsPair = new Map<string, KrakenPairMapping>();
const mapByCompact = new Map<string, KrakenPairMapping>();

for (const entry of KRAKEN_SYMBOL_MAP) {
  mapByInternal.set(entry.internalSymbol.toUpperCase(), entry);
  mapByRestPair.set(entry.krakenRestPair.toUpperCase(), entry);
  mapByWsPair.set(entry.krakenWsPair.toUpperCase(), entry);
  const compact = entry.internalSymbol.replace("/", "").toUpperCase();
  mapByCompact.set(compact, entry);
}

/**
 * I7-MAP-FIX: Special asset translations for Kraken
 * Kraken uses XBT instead of BTC in WebSocket
 */
const ASSET_TRANSLATIONS: Record<string, string> = {
  'BTC': 'XBT',  // Kraken uses XBT for Bitcoin
};

const REVERSE_ASSET_TRANSLATIONS: Record<string, string> = {
  'XBT': 'BTC',
};

/**
 * Valid Kraken quote currencies for dynamic resolution
 */
const VALID_QUOTES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'USDT', 'USDC', 'ETH', 'XBT'];

/**
 * Resolve by internal symbol (BASE/QUOTE format)
 * Example: "AVAX/USD" → mapping
 */
export function resolveByInternalSymbol(internal: string): KrakenPairMapping | undefined {
  return mapByInternal.get(internal.toUpperCase());
}

/**
 * Resolve by Kraken REST API pair format
 * Example: "XAVAXZUSD" → mapping
 */
export function resolveByKrakenRestPair(restPair: string): KrakenPairMapping | undefined {
  return mapByRestPair.get(restPair.toUpperCase());
}

/**
 * Resolve by Kraken WebSocket pair format
 * Example: "AVAX/USD" → mapping
 */
export function resolveByKrakenWsPair(wsPair: string): KrakenPairMapping | undefined {
  return mapByWsPair.get(wsPair.toUpperCase());
}

/**
 * Resolve by compact format (no slash)
 * Example: "AVAXUSD" → mapping for "AVAX/USD"
 */
export function resolveByCompactSymbol(compact: string): KrakenPairMapping | undefined {
  return mapByCompact.get(compact.toUpperCase());
}

/**
 * I7-MAP-FIX: Normalize any raw symbol to internal BASE/QUOTE format
 */
export function normalizeInternal(raw: string): string {
  const upper = raw.toUpperCase().trim();
  
  // Already in BASE/QUOTE format
  if (upper.includes("/")) {
    // Translate XBT back to BTC if present
    const [base, quote] = upper.split("/");
    const normalizedBase = REVERSE_ASSET_TRANSLATIONS[base] || base;
    return `${normalizedBase}/${quote}`;
  }
  
  // Try to find in maps
  const byRest = mapByRestPair.get(upper);
  if (byRest) return byRest.internalSymbol;
  
  const byCompact = mapByCompact.get(upper);
  if (byCompact) return byCompact.internalSymbol;
  
  // Dynamic parsing for compact format (e.g., "BERAUSD" → "BERA/USD")
  for (const quote of VALID_QUOTES) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      const base = upper.slice(0, -quote.length);
      const normalizedBase = REVERSE_ASSET_TRANSLATIONS[base] || base;
      return `${normalizedBase}/${quote}`;
    }
  }
  
  return upper;
}

/**
 * Normalize any symbol format to internal canonical format
 * Handles: "AVAXUSD", "AVAX/USD", "XAVAXZUSD", etc.
 * Returns the canonical internal symbol or the input if no match found
 */
export function normalizeToInternalSymbol(raw: string): string {
  return normalizeInternal(raw);
}

/**
 * I7-MAP-FIX: Convert internal symbol to Kraken REST format
 * Conservative: Only returns value if found in static map
 */
export function toKrakenRest(internalSymbol: string): string | null {
  const normalized = normalizeInternal(internalSymbol).toUpperCase();
  
  // Only trust static map - no dynamic fallback to prevent invalid Kraken pair names
  const mapping = mapByInternal.get(normalized);
  if (mapping) return mapping.krakenRestPair;
  
  // I7-MAP-FIX: Conservative - do not guess, return null
  console.warn(`[I7-MAP-FIX][WARN] No static mapping for REST: ${internalSymbol} (normalized: ${normalized})`);
  return null;
}

/**
 * I7-MAP-FIX: Convert internal symbol to Kraken WebSocket format
 * Conservative: Only returns value if found in static map
 */
export function toKrakenWS(internalSymbol: string): string | null {
  const normalized = normalizeInternal(internalSymbol).toUpperCase();
  
  // Only trust static map - no dynamic fallback to prevent invalid Kraken pair names
  const mapping = mapByInternal.get(normalized);
  if (mapping) return mapping.krakenWsPair;
  
  // I7-MAP-FIX: Conservative - do not guess, return null
  console.warn(`[I7-MAP-FIX][WARN] No static mapping for WS: ${internalSymbol} (normalized: ${normalized})`);
  return null;
}

/**
 * I7-MAP-FIX: Convert Kraken WS pair to internal format
 */
export function mapKrakenPairToInternal(wsPair: string): string | null {
  const upper = wsPair.toUpperCase().trim();
  
  // Check static map first
  const mapping = mapByWsPair.get(upper);
  if (mapping) return mapping.internalSymbol;
  
  // Dynamic fallback: translate XBT → BTC
  if (upper.includes("/")) {
    const [base, quote] = upper.split("/");
    const internalBase = REVERSE_ASSET_TRANSLATIONS[base] || base;
    return `${internalBase}/${quote}`;
  }
  
  return null;
}

/**
 * I7-MAP-FIX: Check if a symbol can be mapped to Kraken formats
 * Conservative: Only returns true if found in static map (verified mappings)
 */
export function isMappable(symbol: string): boolean {
  const normalized = normalizeInternal(symbol).toUpperCase();
  
  // I7-MAP-FIX: Conservative - only trust static map entries
  // Dynamic resolution can produce invalid Kraken pair names
  return mapByInternal.has(normalized);
}

/**
 * I7-MAP-FIX: List unmappable symbols from a given list
 * Conservative: Only considers symbols in static map as mappable
 */
export function listUnmappableSymbols(symbols: string[]): Array<{ symbol: string; reason: string }> {
  const unmappable: Array<{ symbol: string; reason: string }> = [];
  
  for (const symbol of symbols) {
    const normalized = normalizeInternal(symbol).toUpperCase();
    
    // I7-MAP-FIX: Only trust static map entries
    if (mapByInternal.has(normalized)) {
      continue; // This symbol is mappable
    }
    
    // Symbol not in static map - determine reason
    if (!normalized.includes("/")) {
      unmappable.push({ symbol, reason: "not in BASE/QUOTE format" });
    } else {
      unmappable.push({ symbol, reason: "not in static symbol map (add to KRAKEN_SYMBOL_MAP)" });
    }
  }
  
  return unmappable;
}

/**
 * Get the Kraken REST pair for a given internal symbol
 * Falls back to compact format if no mapping found
 */
export function getKrakenRestPair(internalSymbol: string): string {
  const result = toKrakenRest(internalSymbol);
  if (result) return result;
  return internalSymbol.replace("/", "").toUpperCase();
}

/**
 * Get the Kraken WebSocket pair for a given internal symbol
 * I7-MAP-FIX: Now uses dynamic resolution
 */
export function getKrakenWsPair(internalSymbol: string): string {
  const result = toKrakenWS(internalSymbol);
  if (result) return result;
  return internalSymbol.toUpperCase();
}

/**
 * Check if a symbol is in our known mappings
 */
export function isKnownSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return mapByInternal.has(upper) || 
         mapByRestPair.has(upper) || 
         mapByWsPair.has(upper) || 
         mapByCompact.has(upper);
}

/**
 * Get all known internal symbols
 */
export function getAllInternalSymbols(): string[] {
  return Array.from(mapByInternal.keys());
}

/**
 * Get mapping count for diagnostics
 */
export function getMappingCount(): number {
  return KRAKEN_SYMBOL_MAP.length;
}

/**
 * Phase 8.8.3-I7: Diagnostic - dump all mappings
 */
export function dumpMappings(): void {
  console.log(`[I7][SYMBOL_MAP] Total mappings: ${KRAKEN_SYMBOL_MAP.length}`);
  for (const entry of KRAKEN_SYMBOL_MAP) {
    console.log(`[I7][MAPPING] ${entry.internalSymbol} → REST:${entry.krakenRestPair} WS:${entry.krakenWsPair}`);
  }
}

/**
 * I7-MAP-FIX: Get detailed mapping info for a symbol
 */
export function getSymbolMappingDetails(symbol: string): {
  symbol: string;
  internal: string;
  rest_pair: string | null;
  ws_pair: string | null;
  mappable: boolean;
  in_static_map: boolean;
  reason_if_unmappable: string | null;
} {
  const normalized = normalizeInternal(symbol);
  const restPair = toKrakenRest(symbol);
  const wsPair = toKrakenWS(symbol);
  const mappable = isMappable(symbol);
  const inStaticMap = mapByInternal.has(normalized.toUpperCase());
  
  let reason: string | null = null;
  if (!mappable) {
    if (!normalized.includes("/")) {
      reason = "not in BASE/QUOTE format";
    } else {
      const [base, quote] = normalized.split("/");
      if (!base) reason = "empty base asset";
      else if (!VALID_QUOTES.includes(quote)) reason = `unknown quote currency: ${quote}`;
      else reason = "unknown";
    }
  }
  
  return {
    symbol,
    internal: normalized,
    rest_pair: restPair,
    ws_pair: wsPair,
    mappable,
    in_static_map: inStaticMap,
    reason_if_unmappable: reason
  };
}
