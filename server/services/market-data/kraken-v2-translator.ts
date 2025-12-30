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
 * Output: { a: [ask], b: [bid], c: [close/markPrice], v: [volume] }
 * 
 * Directive 8.9.1: Uses Midpoint ((Bid + Ask) / 2) as Mark Price instead of
 * Last Trade price, ensuring continuous real-time updates from BBO feed
 * even on low-volume pairs where trades are infrequent.
 */
export function translateV2ToV1(update: KrakenV2TickerUpdate): V1TickerFormat {
  // 1. Extract raw values as numbers (safely defaulting to 0)
  const bid = Number(update.bid ?? update.b?.[0] ?? 0);
  const ask = Number(update.ask ?? update.a?.[0] ?? 0);
  const last = Number(update.last ?? update.close ?? update.c?.[0] ?? 0);
  
  // 2. Calculate Mark Price (Midpoint)
  // We prioritize Midpoint because 'Last' is often stale on low-volume pairs.
  // We only use 'Last' if the order book is empty (bid or ask is 0).
  let markPrice = last;
  
  if (bid > 0 && ask > 0) {
    markPrice = (bid + ask) / 2;
  }

  // 3. Return normalized v1 structure
  // 'c' field carries the Mark Price to the UI/Engine
  return {
    a: [String(ask), String(update.ask_qty ?? 0)],
    b: [String(bid), String(update.bid_qty ?? 0)],
    c: [String(markPrice)],
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
