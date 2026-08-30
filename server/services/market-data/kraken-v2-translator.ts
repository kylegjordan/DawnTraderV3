import { markKindOf } from './mark-kind.js';

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
  /**
   * B-EXIT-BOOK-AGE-STAMP P2 — WHAT KIND OF NUMBER `c[0]` ACTUALLY IS, decided here where it is
   * built. `c` is nominally "last trade closed" and this function OVERWRITES it with a midpoint
   * whenever both sides exist (#952), so every consumer downstream was reading a mid under a
   * print's name — including a variable literally called `lastPrice`.
   * REQUIRED, not optional: an optional field lets a future producer omit it, and that absence
   * is indistinguishable from a missed stamp (#546) — the same rule `PriceProducer` carries.
   * Do NOT re-derive this from `a`/`b` at a consumer. It round-trips exactly TODAY because both
   * are written from the same locals below, but that is an unstated invariant of a function
   * neither end owns; the moment `a`/`b` come from anywhere else the derivation drifts silently.
   */
  markKind: 'mid' | 'last';
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
  // B-EXIT-BOOK-AGE-STAMP P1: the predicate has ONE home now (`markKindOf`). The arithmetic and
  // the 8.9.1 policy above are unchanged — only the mid-or-last TEST moved, and it moved because
  // it was written out in four files with no two sharing a line.
  const markKind = markKindOf(bid, ask);
  const markPrice = markKind === 'mid' ? (bid + ask) / 2 : last;

  // 3. Return normalized v1 structure
  // 'c' field carries the Mark Price to the UI/Engine
  return {
    a: [String(ask), String(update.ask_qty ?? 0)],
    b: [String(bid), String(update.bid_qty ?? 0)],
    c: [String(markPrice)],
    markKind,
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
