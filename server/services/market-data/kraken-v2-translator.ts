/**
 * Directive 8.9.0-B: Kraken WebSocket v2 Translation Utility
 * 
 * Translates Kraken v2 verbose objects into the compact v1 format
 * expected by Dawn Trader's internal pricing adapters.
 * 
 * This ensures both WebSocket adapters (execution & analytics) translate
 * data identically, preventing data drift between systems.
 */

export interface KrakenV2TickerUpdate {
  symbol: string;
  ask?: number;
  ask_qty?: number;
  bid?: number;
  bid_qty?: number;
  last?: number;
  close?: number;
  volume?: number;
  vwap?: number;
  low?: number;
  high?: number;
  change?: number;
  change_pct?: number;
  a?: string[];
  b?: string[];
  c?: string[];
  v?: string[];
}

export interface V1TickerFormat {
  a: string[];
  b: string[];
  c: string[];
  v?: string[];
}

/**
 * Translates Kraken v2 verbose objects into the compact v1 format
 * Output: { a: [ask], b: [bid], c: [close], v: [volume] }
 */
export function translateV2ToV1(update: KrakenV2TickerUpdate): V1TickerFormat {
  return {
    a: [String(update.ask ?? update.a?.[0] ?? 0), String(update.ask_qty ?? 0)],
    b: [String(update.bid ?? update.b?.[0] ?? 0), String(update.bid_qty ?? 0)],
    c: [String(update.last ?? update.close ?? update.c?.[0] ?? 0)],
    v: update.volume !== undefined ? [String(update.volume)] : update.v
  };
}

/**
 * Extract the symbol from a v2 update in a normalized format
 * v2 uses "BTC/USD" format which matches our internal format
 */
export function extractV2Symbol(update: KrakenV2TickerUpdate): string {
  return update.symbol;
}

/**
 * Validates that a v2 ticker update has the minimum required fields
 */
export function isValidV2TickerUpdate(update: any): update is KrakenV2TickerUpdate {
  return (
    update &&
    typeof update === 'object' &&
    typeof update.symbol === 'string' &&
    (typeof update.bid === 'number' || typeof update.ask === 'number' || typeof update.last === 'number')
  );
}
