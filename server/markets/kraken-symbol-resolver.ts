/**
 * Phase 8.8.3-I7: Kraken Symbol Resolver
 * 
 * Single source of truth for symbol translation.
 * All components use this resolver - no custom formatting elsewhere.
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
 * Normalize any symbol format to internal canonical format
 * Handles: "AVAXUSD", "AVAX/USD", "XAVAXZUSD", etc.
 * Returns the canonical internal symbol or the input if no match found
 */
export function normalizeToInternalSymbol(raw: string): string {
  const upper = raw.toUpperCase();
  
  if (upper.includes("/")) {
    const mapping = mapByInternal.get(upper) || mapByWsPair.get(upper);
    if (mapping) return mapping.internalSymbol;
    return upper;
  }
  
  const byRest = mapByRestPair.get(upper);
  if (byRest) return byRest.internalSymbol;
  
  const byCompact = mapByCompact.get(upper);
  if (byCompact) return byCompact.internalSymbol;
  
  return upper;
}

/**
 * Get the Kraken REST pair for a given internal symbol
 * Falls back to compact format if no mapping found
 */
export function getKrakenRestPair(internalSymbol: string): string {
  const mapping = resolveByInternalSymbol(internalSymbol);
  if (mapping) return mapping.krakenRestPair;
  return internalSymbol.replace("/", "").toUpperCase();
}

/**
 * Get the Kraken WebSocket pair for a given internal symbol
 * Falls back to the internal symbol if no mapping found
 */
export function getKrakenWsPair(internalSymbol: string): string {
  const mapping = resolveByInternalSymbol(internalSymbol);
  if (mapping) return mapping.krakenWsPair;
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
