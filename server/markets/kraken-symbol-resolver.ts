/**
 * Phase 8.8.3-I7 / I7-MAP-FIX / I7-MAP-AUTO: Kraken Symbol Resolver
 * 
 * Single source of truth for symbol translation.
 * All components use this resolver - no custom formatting elsewhere.
 * 
 * I7-MAP-FIX: Enhanced with dynamic fallback for symbols not in static map.
 * I7-MAP-AUTO: Now integrates with auto-generated Kraken AssetPairs mapping.
 * 
 * Resolution order (tiered):
 * - Tier 0: Static map (KRAKEN_SYMBOL_MAP) - highest trust, manually verified
 * - Tier 1: Auto-map verified (matches static map)
 * - Tier 2: Auto-map derived (from Kraken API normalization)
 * - Tier 3: Auto-map uncertain (not safe for auto-use)
 */

import { KRAKEN_SYMBOL_MAP, KrakenPairMapping } from "./kraken-symbol-map";
import { krakenAssetPairsService } from "./kraken-asset-pairs-service.js";

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
 * I7-COMPACT-MAP: Convert any symbol format to Kraken REST format
 * Resolution order: Static map (Tier 0) → Auto-map resolveAny (compact-aware)
 * Now supports compact symbols (e.g., "MORPHOUSD", "RUJIEUR") directly
 */
export function toKrakenRest(internalSymbol: string): string | null {
  if (!internalSymbol) return null;
  const s = internalSymbol.trim().toUpperCase();
  
  // Tier 0: Static map has highest priority (manually verified)
  // Check both internal format and compact format
  let staticMapping = mapByInternal.get(s);
  if (staticMapping) return staticMapping.krakenRestPair;
  
  staticMapping = mapByCompact.get(s);
  if (staticMapping) return staticMapping.krakenRestPair;
  
  // I7-COMPACT-MAP: Use resolveAny which handles all formats (compact, internal, REST, WS)
  if (krakenAssetPairsService.isReady()) {
    const entry = krakenAssetPairsService.resolveAny(s);
    if (entry && entry.tier <= 2) {
      return entry.krakenRestPair;
    }
  }
  
  // No mapping found
  console.warn(`[I7-COMPACT-MAP][WARN] No mapping for REST: ${internalSymbol}`);
  return null;
}

/**
 * I7-COMPACT-MAP: Convert any symbol format to Kraken WebSocket format
 * Resolution order: Static map (Tier 0) → Auto-map resolveAny (compact-aware)
 * Now supports compact symbols (e.g., "MORPHOUSD", "RUJIEUR") directly
 */
export function toKrakenWS(internalSymbol: string): string | null {
  if (!internalSymbol) return null;
  const s = internalSymbol.trim().toUpperCase();
  
  // Tier 0: Static map has highest priority (manually verified)
  // Check both internal format and compact format
  let staticMapping = mapByInternal.get(s);
  if (staticMapping) return staticMapping.krakenWsPair;
  
  staticMapping = mapByCompact.get(s);
  if (staticMapping) return staticMapping.krakenWsPair;
  
  // I7-COMPACT-MAP: Use resolveAny which handles all formats (compact, internal, REST, WS)
  if (krakenAssetPairsService.isReady()) {
    const entry = krakenAssetPairsService.resolveAny(s);
    if (entry && entry.tier <= 2) {
      return entry.krakenWsPair;
    }
  }
  
  // No mapping found
  console.warn(`[I7-COMPACT-MAP][WARN] No mapping for WS: ${internalSymbol}`);
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
 * I7-COMPACT-MAP: Check if a symbol can be mapped to Kraken formats
 * Returns true if found in static map OR auto-map (Tier 1/2)
 * Now supports compact symbols directly
 */
export function isMappable(symbol: string): boolean {
  if (!symbol) return false;
  const s = symbol.trim().toUpperCase();
  
  // Tier 0: Static map is always trusted (check internal + compact formats)
  if (mapByInternal.has(s)) return true;
  if (mapByCompact.has(s)) return true;
  
  // I7-COMPACT-MAP: Use resolveAny to check any format (Tier 1/2)
  if (krakenAssetPairsService.isReady()) {
    const entry = krakenAssetPairsService.resolveAny(s);
    return !!entry && entry.tier <= 2;
  }
  
  return false;
}

/**
 * I7-COMPACT-MAP: List unmappable symbols from a given list
 * Checks static map and auto-map using resolveAny (supports compact symbols)
 */
export function listUnmappableSymbols(symbols: string[]): Array<{ symbol: string; reason: string }> {
  const unmappable: Array<{ symbol: string; reason: string }> = [];
  
  for (const symbol of symbols) {
    // Use isMappable which now supports all formats including compact
    if (isMappable(symbol)) {
      continue; // Mapped
    }
    
    // Symbol not mappable - determine reason
    const s = symbol.trim().toUpperCase();
    if (krakenAssetPairsService.isReady()) {
      const entry = krakenAssetPairsService.resolveAny(s);
      if (entry && entry.tier === 3) {
        unmappable.push({ symbol, reason: "Tier 3 (uncertain) - needs manual verification" });
      } else {
        unmappable.push({ symbol, reason: "not found in static map or auto-map" });
      }
    } else {
      unmappable.push({ symbol, reason: "not in static map (auto-map not ready)" });
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
 * I7-COMPACT-MAP: Get detailed mapping info for a symbol
 * Includes tier information from auto-map
 * Now supports compact symbols directly via resolveAny
 */
export function getSymbolMappingDetails(symbol: string): {
  symbol: string;
  internal: string;
  rest_pair: string | null;
  ws_pair: string | null;
  mappable: boolean;
  in_static_map: boolean;
  in_auto_map: boolean;
  tier: number | null;
  tier_reason: string | null;
  reason_if_unmappable: string | null;
} {
  const s = symbol.trim().toUpperCase();
  const restPair = toKrakenRest(symbol);
  const wsPair = toKrakenWS(symbol);
  const mappable = isMappable(symbol);
  
  // Check static maps (both internal and compact formats)
  const inStaticMapInternal = mapByInternal.has(s);
  const inStaticMapCompact = mapByCompact.has(s);
  const inStaticMap = inStaticMapInternal || inStaticMapCompact;
  
  // Check auto-map using resolveAny (handles all formats)
  let inAutoMap = false;
  let tier: number | null = null;
  let tierReason: string | null = null;
  let resolvedInternal = s;
  
  if (krakenAssetPairsService.isReady()) {
    const autoEntry = krakenAssetPairsService.resolveAny(s);
    if (autoEntry) {
      inAutoMap = true;
      tier = autoEntry.tier;
      tierReason = autoEntry.tierReason;
      resolvedInternal = autoEntry.internalSymbol;
    }
  }
  
  // Determine effective tier (static map = Tier 0)
  if (inStaticMap) {
    tier = 0;
    tierReason = "Static map (manually verified)";
  }
  
  let reason: string | null = null;
  if (!mappable) {
    if (tier === 3) {
      reason = "Tier 3 (uncertain) - needs manual verification";
    } else {
      reason = "not found in any mapping source";
    }
  }
  
  return {
    symbol,
    internal: resolvedInternal,
    rest_pair: restPair,
    ws_pair: wsPair,
    mappable,
    in_static_map: inStaticMap,
    in_auto_map: inAutoMap,
    tier,
    tier_reason: tierReason,
    reason_if_unmappable: reason
  };
}
