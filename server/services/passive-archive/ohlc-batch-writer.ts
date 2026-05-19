/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — OHLC Batch Writer (shared helper)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Buffers OHLC bar inserts and flushes in 5-second batches via a 2-slot
 * counting semaphore so passive archive cannot starve VTS / signal-orchestrator
 * / B73 hook DB writes.
 *
 * Per Langston cc-inbox #869 Q1: wrapper-layer semaphore (NOT Drizzle pool
 * config) — scoped, testable, no global side effects.
 *
 * Per Langston cc-inbox #869 claim challenge #3: 2-slot cap + 5s batches
 * leaves ample headroom for VTS / signal-orchestrator (which write at ~0.002/s).
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1 §A.2 + §C.2
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db.js';
import {
  xstockSpotOhlc1m,
  xstockPerpOhlc1m,
  cryptoSpotOhlc1m,
  type InsertEquitySpotOhlc1m,
} from '../../../shared/schema.js';

const BATCH_FLUSH_INTERVAL_MS = 5_000;
const POOL_SLOT_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_INSERTS = 2;

// B69: "Universe" → "AssetClass" rename. The 3 actively-archived asset classes
// map to their respective Drizzle table objects for routing inserts.
export type ArchiveAssetClass = 'xstock_spot' | 'xstock_perp' | 'crypto_spot';

/** @deprecated Use ArchiveAssetClass. Kept for transition period. */
export type Universe = ArchiveAssetClass;

const tableForAssetClass = {
  xstock_spot: xstockSpotOhlc1m,
  xstock_perp: xstockPerpOhlc1m,
  crypto_spot: cryptoSpotOhlc1m,
} as const;

// Buffers keyed by asset class so each archiver has independent flush behavior.
const buffers: Record<ArchiveAssetClass, InsertEquitySpotOhlc1m[]> = {
  xstock_spot: [],
  xstock_perp: [],
  crypto_spot: [],
};

// Counting semaphore (max 2 concurrent inserts across all 3 archivers)
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
      reject(new Error('ohlc-batch-writer: pool slot timeout (5s)'));
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

/** Buffer a single OHLC bar for the given asset class. Flushed automatically. */
export function bufferOhlcBar(assetClass: ArchiveAssetClass, row: InsertEquitySpotOhlc1m): void {
  buffers[assetClass].push(row);
}

/** Flush a single asset class buffer. Called by the periodic timer or on shutdown. */
async function flushAssetClass(assetClass: ArchiveAssetClass): Promise<void> {
  const batch = buffers[assetClass];
  if (batch.length === 0) return;
  const rows = batch.splice(0, batch.length); // drain atomically
  try {
    await acquireSlot();
    try {
      const table = tableForAssetClass[assetClass];
      // Drizzle insert; PK includes auto-generated `id` so no realistic
      // conflict on the primary key. Partition routing is automatic via
      // PARTITION BY RANGE.
      // Cast to `any` per Langston cc-inbox #870 Q1: safe because all 3 OHLC
      // tables share IDENTICAL column shapes by design.
      //
      // CHUNKING: Postgres has a hard limit of 65,535 parameters per query.
      // OHLC row has ~12 columns → max 5,461 rows per single INSERT before
      // bind-message overflow. Use 1,000 rows per chunk for headroom.
      // Without chunking, the equity-perp REST initial poll backfilled
      // 20,000 historical bars at once → bind overflow → entire batch
      // dropped silently (B74.1 verification 2026-04-30).
      // B-NEW-35 (2026-05-19): UPSERT instead of plain INSERT to eliminate
      // the 18-56× row-per-minute duplication that was burning Supabase
      // disk-IO budget on writes AND blowing query timeouts on every
      // downstream read path (aggregator DISTINCT ON, snapshot pre-warm,
      // scanner per-cycle batched live overlay). Each Kraken WS bar-update
      // now refreshes the in-progress minute's row instead of inserting
      // a new row per tick. Latest WS update IS the correct cumulative
      // OHLCV for that minute per Kraken WS contract — `onConflictDoUpdate`
      // replaces evolving fields (open/high/low/close/volume/vwap/trade_count
      // + captured_at touch); preserves id/asset_class/exchange (invariants).
      //
      // Requires UNIQUE constraint on (symbol, interval_begin) per partitioned
      // table — added by Phase 2 migration. Phase 1 cleanup dedupes the
      // existing rows first; Phase 3 (this code change) deploys after both.
      //
      // Reference: B_NEW_35_SCOPE.md §2 + Langston Step 1 Q4 ACK.
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const slice = rows.slice(i, i + CHUNK_SIZE);
        await db.insert(table as any).values(slice as any)
          .onConflictDoUpdate({
            target: [(table as any).symbol, (table as any).intervalBegin],
            set: {
              open:       sql`EXCLUDED.open`,
              high:       sql`EXCLUDED.high`,
              low:        sql`EXCLUDED.low`,
              close:      sql`EXCLUDED.close`,
              volume:     sql`EXCLUDED.volume`,
              vwap:       sql`EXCLUDED.vwap`,
              tradeCount: sql`EXCLUDED.trade_count`,
              capturedAt: sql`NOW()`,
            },
          });
      }
      console.log(`[B74][batch-writer] ${assetClass} upserted ${rows.length} rows`);
    } finally {
      releaseSlot();
    }
  } catch (err) {
    console.error(
      `[B74][batch-writer] ${assetClass} flush failed (${rows.length} rows dropped):`,
      err instanceof Error ? err.message : err,
    );
  }
}

let flushTimer: NodeJS.Timeout | null = null;

/** Start the periodic flush timer. Called once at bootstrap. */
export function startBatchWriter(): void {
  if (flushTimer) return; // already started
  flushTimer = setInterval(async () => {
    await Promise.all([
      flushAssetClass('xstock_spot'),
      flushAssetClass('xstock_perp'),
      flushAssetClass('crypto_spot'),
    ]);
  }, BATCH_FLUSH_INTERVAL_MS);
  console.log(`[B74][batch-writer] started (flush every ${BATCH_FLUSH_INTERVAL_MS / 1000}s, max ${MAX_CONCURRENT_INSERTS} concurrent inserts)`);
}

/** Stop the periodic flush timer. Drains pending buffers first. */
export async function stopBatchWriter(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await Promise.all([
    flushAssetClass('xstock_spot'),
    flushAssetClass('xstock_perp'),
    flushAssetClass('crypto_spot'),
  ]);
}
