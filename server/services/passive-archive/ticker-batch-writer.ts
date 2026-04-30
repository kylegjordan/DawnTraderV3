/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Ticker Snapshot Batch Writer (shared helper)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Same architecture as ohlc-batch-writer: 5s flush window + 2-slot semaphore.
 * Per-symbol throttle to b74_ticker_snapshot_min_interval_ms (default 1000ms)
 * so we don't spam ticker rows on hot pairs (Kraken WS sends multiple
 * updates per second on majors).
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + Langston cc-inbox #867 Q2.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import {
  equitySpotTickerSnap,
  equityPerpTickerSnap,
  cryptoSpotTickerSnap,
  type InsertEquitySpotTickerSnap,
} from '../../../shared/schema.js';
import type { Universe } from './ohlc-batch-writer.js';

const BATCH_FLUSH_INTERVAL_MS = 5_000;
const POOL_SLOT_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_INSERTS = 2;
const DEFAULT_THROTTLE_MS = 1_000;

const tickerTableForUniverse = {
  equity_spot: equitySpotTickerSnap,
  equity_perp: equityPerpTickerSnap,
  crypto_spot: cryptoSpotTickerSnap,
} as const;

const tickerBuffers: Record<Universe, InsertEquitySpotTickerSnap[]> = {
  equity_spot: [],
  equity_perp: [],
  crypto_spot: [],
};

// Throttle: track last-captured timestamp per (universe:symbol)
const lastCaptured: Map<string, number> = new Map();

let throttleMs = DEFAULT_THROTTLE_MS;
export function setTickerThrottle(ms: number): void {
  throttleMs = ms > 0 ? ms : DEFAULT_THROTTLE_MS;
}

// Counting semaphore (separate from OHLC writer's so the two universes don't
// block each other beyond the global pool's natural limits)
let activeInserts = 0;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeInserts < MAX_CONCURRENT_INSERTS) {
    activeInserts++;
    return;
  }
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const idx = waitQueue.indexOf(resolveOnce);
      if (idx >= 0) waitQueue.splice(idx, 1);
      reject(new Error('ticker-batch-writer: pool slot timeout (5s)'));
    }, POOL_SLOT_TIMEOUT_MS);

    let resolved = false;
    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      activeInserts++;
      resolve();
    };
    waitQueue.push(resolveOnce);
  });
}

function releaseSlot(): void {
  activeInserts--;
  const next = waitQueue.shift();
  if (next) next();
}

/**
 * Buffer a ticker snapshot. Throttled per-(universe:symbol) so successive
 * snapshots within the throttle window are dropped.
 */
export function bufferTickerSnap(universe: Universe, row: InsertEquitySpotTickerSnap): boolean {
  const key = `${universe}:${row.symbol}`;
  const now = Date.now();
  const lastTs = lastCaptured.get(key) ?? 0;
  if (now - lastTs < throttleMs) {
    return false; // throttled — skip
  }
  lastCaptured.set(key, now);
  tickerBuffers[universe].push(row);
  return true;
}

async function flushTickerUniverse(universe: Universe): Promise<void> {
  const batch = tickerBuffers[universe];
  if (batch.length === 0) return;
  const rows = batch.splice(0, batch.length);
  try {
    await acquireSlot();
    try {
      const table = tickerTableForUniverse[universe];
      // Cast to `any` per Langston cc-inbox #870 Q1: safe because all 3
      // ticker_snap tables share IDENTICAL column shapes by design. Revisit
      // if a per-universe column ever diverges.
      await db.insert(table as any).values(rows as any);
      console.log(`[B74][ticker-writer] ${universe} flushed ${rows.length} rows`);
    } finally {
      releaseSlot();
    }
  } catch (err) {
    console.error(
      `[B74][ticker-writer] ${universe} flush failed (${rows.length} rows dropped):`,
      err instanceof Error ? err.message : err,
    );
  }
}

let flushTimer: NodeJS.Timeout | null = null;

export function startTickerWriter(): void {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    await Promise.all([
      flushTickerUniverse('equity_spot'),
      flushTickerUniverse('equity_perp'),
      flushTickerUniverse('crypto_spot'),
    ]);
  }, BATCH_FLUSH_INTERVAL_MS);
  console.log(`[B74][ticker-writer] started (flush every ${BATCH_FLUSH_INTERVAL_MS / 1000}s, throttle=${throttleMs}ms)`);
}

export async function stopTickerWriter(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await Promise.all([
    flushTickerUniverse('equity_spot'),
    flushTickerUniverse('equity_perp'),
    flushTickerUniverse('crypto_spot'),
  ]);
}
