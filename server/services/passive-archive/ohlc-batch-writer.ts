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
  cryptoPerpOhlc1m,
  type InsertEquitySpotOhlc1m,
} from '../../../shared/schema.js';

const BATCH_FLUSH_INTERVAL_MS = 5_000;
const POOL_SLOT_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_INSERTS = 2;

// B69: "Universe" → "AssetClass" rename. The actively-archived asset classes
// map to their respective Drizzle table objects for routing inserts.
// P19-B-PERPFEED OBJ-2: crypto_perp joins the family (capture-only leg).
export type ArchiveAssetClass = 'xstock_spot' | 'xstock_perp' | 'crypto_spot' | 'crypto_perp';

/** @deprecated Use ArchiveAssetClass. Kept for transition period. */
export type Universe = ArchiveAssetClass;

// EXPORTED for the #704 fence (p19-perpfeed-ohlc-upsert-constraint-fence.test.ts): the fence
// derives its subject from THIS map so a newly added asset class is carried automatically.
export const tableForAssetClass = {
  xstock_spot: xstockSpotOhlc1m,
  xstock_perp: xstockPerpOhlc1m,
  crypto_spot: cryptoSpotOhlc1m,
  crypto_perp: cryptoPerpOhlc1m,
} as const satisfies Record<ArchiveAssetClass, unknown>;

/** The flush subject, DERIVED from the table map so it can never drift from it (#704 rider).
 *  A new asset class is TS-forced into the map above (and into `buffers`), so it is buffered
 *  and constraint-fenced automatically — a hardcoded flush list would leave it NEVER FLUSHED
 *  with the fence still green: the #704 defect one layer up. */
const ALL_ARCHIVE_CLASSES = Object.keys(tableForAssetClass) as ArchiveAssetClass[];

// ══ F-G-1 / OBJ-9 — #705's THREE CONSTRAINTS, WHICH THAT ISSUE ALREADY SPECIFIED ═══════════
// #705 (RUNNING_ISSUES:2744-2746) names them: separate transient from permanent, BOUND the
// buffer, and ALERT. Its own words: "the naive re-buffer against a permanent error would have
// grown the crypto_perp buffer unbounded for 15 hours — an OOM instead of a data gap… the #704
// failure produced 4,802 stderr lines and zero alerts."
//
// ⛔ WHY THE DROP IS WORTH FIXING AT ALL, since the counts are small: it is not the count, it is
// the SHAPE. `:108` empties the buffer BEFORE the try and the catch re-adds nothing, so ANY
// persistent error becomes permanent, total, per-flush loss. #704 is the proof — 368,841 bars,
// 0 rows landed, ~15 hours — and it cost nothing ONLY because that leg was REST-replayable.
// #704 residual (b) states the boundary exactly: "acceptable for replayable REST bars and NOT
// for WS-only ones." The two WS legs (crypto_spot, xstock_spot) have NO re-fetch path at all.

/** Max rows held per class awaiting retry. Beyond this we shed OLDEST and say so. */
export const RETRY_BUFFER_MAX = 50_000;

/**
 * TRANSIENT vs PERMANENT — the distinction #705 requires, and it is the one that decides
 * whether re-buffering helps or turns a data gap into an OOM.
 *
 * PERMANENT means the same rows will fail identically forever: a missing constraint, a missing
 * column, a bad type. #704 was exactly this, and re-buffering it would have grown the buffer for
 * 15 hours. Those rows are DROPPED and an alert is raised — the drop is the correct action; the
 * silence was the defect.
 *
 * TRANSIENT means the same rows would likely succeed on a later attempt: a deadlock, a pool-slot
 * timeout, a dropped connection. Those are retried.
 *
 * ⚠️ UNKNOWN ERRORS ARE TREATED AS PERMANENT, deliberately. The opposite default retries an
 * unrecognised permanent fault forever, which is the OOM #705 warns about. A wrongly-dropped
 * transient batch costs one flush window; a wrongly-retained permanent one costs the process.
 */
export function isTransientWriteError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  // ⛔ NOT a bare `timeout` substring. Postgres emits "canceling statement due to statement
  // timeout" for a write that is PERMANENTLY too slow — a missing index, a bloated partition —
  // and that is message-indistinguishable from a transient one. A bare match would retry it
  // forever on the branch that raises NO ALERT, which is #704's exact signature: loud on stderr,
  // silent everywhere anyone looks. Match the transient timeouts specifically instead.
  if (m.includes('statement timeout') || m.includes('canceling statement')) return false;
  return m.includes('deadlock')
    || m.includes('pool slot timeout')
    || m.includes('connection terminated')
    || m.includes('connection reset')
    || m.includes('econnreset')
    || m.includes('etimedout')
    || m.includes('too many clients');
}

/** One alert per class per process — a per-flush alert would be its own flood. */
const _permanentAlerted: Partial<Record<ArchiveAssetClass, boolean>> = {};

export async function alertPermanentWriteFailure(writer: 'ohlc' | 'ticker', assetClass: ArchiveAssetClass, detail: string, dropped: number): Promise<void> {
  const _latchKey = `${writer}:${assetClass}` as ArchiveAssetClass;
  if (_permanentAlerted[_latchKey]) return;
  try {
    // ⛔ THE JSONL ALERT SYSTEM, NOT `storage.createSystemAlert`. My first version wrote to the
    // Postgres `system_alerts` table — a DIFFERENT system, served by a different route, which
    // the per-turn alert check does not read. `/var/log/dawntrader/system-alerts.jsonl` is the
    // one CLAUDE.md §10.5 has every session tail every turn, the one the dispatcher promotes and
    // the one the System Alerts page renders. An alert in the other store is an alert nobody
    // sees — which would have made this whole change ceremonial, since VISIBILITY is the entire
    // point: #704 produced 4,802 stderr lines and zero alerts, and ran 15 hours.
    // ⚠️ `category` must be an SSOT value — `addAlert` throws on an off-list one. 'breakage' is
    // the fit; 'critical' (my first choice) is a SEVERITY, not a category.
    const { addAlert } = await import('../system-alerts.js');
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'critical',
      title: `${writer.toUpperCase()} archive writer failing PERMANENTLY — ${assetClass}`,
      body: `${dropped} rows dropped and every further flush for this class will fail the same way `
        + `until it is fixed. This is the #704 shape: bars stop landing while stdout looks healthy, `
        + `because success logs to stdout and failure to stderr. Detail: ${detail}`,
      metadata: { assetClass, dropped, detail, source: `${writer}-batch-writer`, issue: '#705' },
    });
    // ⛔ LATCH ONLY AFTER A SUCCESSFUL RAISE. Setting it first — as I did — burns the one-shot
    // for the whole process even when the alert never actually got out.
    _permanentAlerted[_latchKey] = true;
  } catch (e) {
    console.error(`[B74][batch-writer] ${assetClass} FAILED TO RAISE ALERT for permanent write failure:`,
      e instanceof Error ? e.message : e);
  }
}

// Buffers keyed by asset class so each archiver has independent flush behavior.
const buffers: Record<ArchiveAssetClass, InsertEquitySpotOhlc1m[]> = {
  xstock_spot: [],
  xstock_perp: [],
  crypto_spot: [],
  crypto_perp: [],
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
  const rawRows = batch.splice(0, batch.length); // drain atomically

  // B-NEW-35 (2026-05-20): de-dupe the in-buffer batch by (symbol, interval_begin)
  // BEFORE the INSERT. Kraken WS sends multiple OHLC updates per minute as the
  // bar evolves with each tick; the archiver buffers all of them. With ON CONFLICT
  // DO UPDATE, PG throws "ON CONFLICT DO UPDATE command cannot affect row a
  // second time" when one INSERT contains multiple rows that target the same
  // unique constraint. Solution: keep only the LAST row per (symbol, interval_begin)
  // in the buffer — the last write IS the latest WS update IS the correct
  // cumulative OHLCV for that minute. Map insertion-order semantics give "last
  // wins" naturally.
  const dedupedMap = new Map<string, InsertEquitySpotOhlc1m>();
  for (const row of rawRows) {
    const ts = (row as any).intervalBegin instanceof Date
      ? (row as any).intervalBegin.toISOString()
      : String((row as any).intervalBegin);
    dedupedMap.set(`${row.symbol}::${ts}`, row);
  }
  const rows = Array.from(dedupedMap.values());
  try {
    await acquireSlot();
    try {
      const table = tableForAssetClass[assetClass];
      // Drizzle insert; PK includes auto-generated `id` so no realistic
      // conflict on the primary key. Partition routing is automatic via
      // PARTITION BY RANGE.
      // Cast to `any` per Langston cc-inbox #870 Q1: safe because all FOUR OHLC
      // tables share identical COLUMN shapes by design.
      // WARNING (#704): 'identical shape' means COLUMNS ONLY -- it does NOT cover
      // CONSTRAINTS, and this very sentence is the premise that let crypto_perp ship
      // without the UNIQUE (symbol, interval_begin) the ON CONFLICT below targets.
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
    const detail = err instanceof Error ? err.message : String(err);
    if (!isTransientWriteError(err)) {
      // PERMANENT — do NOT re-buffer. Retrying rows that will fail identically forever is the
      // OOM #705 warns about, and #704 is the measured case: 15 hours, 4,802 stderr lines, and
      // ZERO alerts. The drop stays; the SILENCE is what this fixes.
      console.error(
        `[B74][batch-writer] ${assetClass} PERMANENT flush failure (${rows.length} rows dropped, NOT retried):`,
        detail,
      );
      void alertPermanentWriteFailure('ohlc', assetClass, detail.slice(0, 300), rows.length);
      return;
    }
    // TRANSIENT — put the rows back for the next flush.
    // ⛔ RE-ADD AT THE FRONT, and this is decided TOGETHER with the eviction end (Langston's
    // rider) rather than separately. B-NEW-35's dedup keeps the LAST row per (symbol, minute)
    // because "the last write IS the latest WS update". That invariant is TEMPORAL, so appending
    // older retried rows would let a STALE row overwrite a fresher bar. Prepending preserves it:
    // older rows enter the Map first and any fresher row overwrites them, exactly as B-NEW-35
    // specifies — with no change to the dedup itself.
    const buf = buffers[assetClass];
    buf.unshift(...rows);
    // ⛔ AND THE BOUND EVICTS FROM THE SAME END WE RE-ADD TO — which sounds self-defeating and is
    // not. At the cap the retry is failing persistently, and shedding the OLDEST is the honest
    // policy. Langston's objection was that this makes the retry "silently stop working": it is
    // NOT silent, because the shed is counted and logged here. A bound that drops quietly is the
    // defect; a bound that drops loudly is the design.
    if (buf.length > RETRY_BUFFER_MAX) {
      const shed = buf.length - RETRY_BUFFER_MAX;
      buf.splice(0, shed);
      console.error(
        `[B74][batch-writer] ${assetClass} retry buffer at cap ${RETRY_BUFFER_MAX} — SHED ${shed} oldest rows. `
        + `The retry is not keeping up; this is data loss and it is being reported, not hidden.`,
      );
    }
    console.error(
      `[B74][batch-writer] ${assetClass} TRANSIENT flush failure (${rows.length} rows RETAINED for retry, `
      + `buffer=${buf.length}):`,
      detail,
    );
  }
}

let flushTimer: NodeJS.Timeout | null = null;

/** Start the periodic flush timer. Called once at bootstrap. */
export function startBatchWriter(): void {
  if (flushTimer) return; // already started
  flushTimer = setInterval(async () => {
    await Promise.all(ALL_ARCHIVE_CLASSES.map(flushAssetClass));
  }, BATCH_FLUSH_INTERVAL_MS);
  console.log(`[B74][batch-writer] started (flush every ${BATCH_FLUSH_INTERVAL_MS / 1000}s, max ${MAX_CONCURRENT_INSERTS} concurrent inserts)`);
}

/** Stop the periodic flush timer. Drains pending buffers first. */
export async function stopBatchWriter(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await Promise.all(ALL_ARCHIVE_CLASSES.map(flushAssetClass)); // derived, see the timer above
}

/**
 * #918 — THIS FUNCTION HAD ZERO CALLERS. `stopBatchWriter` is exported and its docstring says it
 * drains pending buffers, but nothing in the tree called it: the live shutdown handler
 * (`core/boot_orchestrator.ts`) called `stopVTSRunner()` and nothing else. So up to one flush
 * interval of buffered bars was discarded on EVERY restart and EVERY deploy, silently, with no
 * error line — because nothing threw.
 * ⚠️ MEASURED IMPACT NIL AT n=4: bar-continuity across four known restarts showed every restart
 * minute INSIDE its neighbour range, two of them ABOVE the neighbour average. The WS feed
 * re-sends the still-open minute on reconnect and the upsert fills it in. So this is a real
 * mechanism with no measured loss — it ships because wiring an existing function into the
 * shutdown path is trivial, NOT because it is load-bearing. It must not become OBJ-9's headline.
 */
export async function drainArchiveBuffersForShutdown(): Promise<void> {
  // ⛔⛔ BOTH WRITERS, AND THE TICKER ONE MATTERS MORE. My first version drained OHLC only —
  // fixing the leg whose measured impact is NIL (WS re-sends the open minute on reconnect) and
  // leaving the leg where loss is PERMANENT. `#705`'s own title records Langston correcting this
  // exact mis-sizing: *"I sized the risk on the OHLC writer, where it is recoverable, and the
  // UNRECOVERABLE instance is the ticker writer."* ⛔ THAT IS THE THIRD TIME IN THIS BATCH, and
  // the third was inside the commit whose own headline was the second.
  // ⇒ ROUTING SIGNAL, recorded because it clearly does not stick as a lesson: any change touching
  // the archive writers audits the TICKER leg last and separately, as its own step.
  // Independent: one failing drain must not skip the other.
  const { stopTickerWriter } = await import('./ticker-batch-writer.js');
  const results = await Promise.allSettled([stopBatchWriter(), stopTickerWriter()]);
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[B74][shutdown] archive drain leg FAILED:', r.reason);
    }
  }
}
