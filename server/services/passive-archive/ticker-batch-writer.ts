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
  xstockSpotTickerSnap,
  xstockPerpTickerSnap,
  cryptoSpotTickerSnap,
  type InsertEquitySpotTickerSnap,
} from '../../../shared/schema.js';
import type { ArchiveAssetClass } from './ohlc-batch-writer.js';

const BATCH_FLUSH_INTERVAL_MS = 5_000;
const POOL_SLOT_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_INSERTS = 2;
const DEFAULT_THROTTLE_MS = 1_000;

// B69: renamed from tickerTableForUniverse. Drizzle table objects retain legacy
// names (xstockSpotTickerSnap etc., post-B79.0e) and the routing key is the asset class ID.
const tickerTableForAssetClass = {
  xstock_spot: xstockSpotTickerSnap,
  xstock_perp: xstockPerpTickerSnap,
  crypto_spot: cryptoSpotTickerSnap,
} as const;

const tickerBuffers: Record<ArchiveAssetClass, InsertEquitySpotTickerSnap[]> = {
  xstock_spot: [],
  xstock_perp: [],
  crypto_spot: [],
};

// Throttle: track last-captured timestamp per (assetClass:symbol)
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
 * Buffer a ticker snapshot. Throttled per-(assetClass:symbol) so successive
 * snapshots within the throttle window are dropped.
 */
export function bufferTickerSnap(assetClass: ArchiveAssetClass, row: InsertEquitySpotTickerSnap): boolean {
  const key = `${assetClass}:${row.symbol}`;
  const now = Date.now();
  const lastTs = lastCaptured.get(key) ?? 0;
  if (now - lastTs < throttleMs) {
    return false; // throttled — skip
  }
  lastCaptured.set(key, now);
  tickerBuffers[assetClass].push(row);
  return true;
}

async function flushTickerAssetClass(assetClass: ArchiveAssetClass): Promise<void> {
  const batch = tickerBuffers[assetClass];
  if (batch.length === 0) return;
  const rows = batch.splice(0, batch.length);
  try {
    await acquireSlot();
    try {
      const table = tickerTableForAssetClass[assetClass];
      // Cast safe per Langston cc-inbox #870 Q1; ticker_snap tables share
      // IDENTICAL column shapes. Chunked insert (CHUNK_SIZE=1000) protects
      // against Postgres 65,535-parameter bind limit (B74.1 verification:
      // ticker rows have ~17 columns → 3,855-row max per insert; 1,000
      // gives comfortable headroom).
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const slice = rows.slice(i, i + CHUNK_SIZE);
        await db.insert(table as any).values(slice as any);
      }
      console.log(`[B74][ticker-writer] ${assetClass} flushed ${rows.length} rows`);
    } finally {
      releaseSlot();
    }
  } catch (err) {
    console.error(
      `[B74][ticker-writer] ${assetClass} flush failed (${rows.length} rows dropped):`,
      err instanceof Error ? err.message : err,
    );
  }
}

let flushTimer: NodeJS.Timeout | null = null;

export function startTickerWriter(): void {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    await Promise.all([
      flushTickerAssetClass('xstock_spot'),
      flushTickerAssetClass('xstock_perp'),
      flushTickerAssetClass('crypto_spot'),
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
    flushTickerAssetClass('xstock_spot'),
    flushTickerAssetClass('xstock_perp'),
    flushTickerAssetClass('crypto_spot'),
  ]);
}
