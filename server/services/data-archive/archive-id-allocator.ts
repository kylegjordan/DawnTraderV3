/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-53 — Archive ID Allocator (amortized, hot-path-safe)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Hands out `signal_eval_archive.id` values to the archiver SYNCHRONOUSLY so a
 * base archive row and its 1:1 provenance row can share the same id without a
 * per-decision DB round-trip on the scan/decision hot path (Langston Step-2
 * condition C2).
 *
 * Mechanism: block allocation. A single query grabs a block of ids from the
 * EXISTING `signal_eval_archive_id_seq` (`SELECT nextval(seq) FROM
 * generate_series(1, N)` advances the sequence by N atomically and returns the
 * N values). They are buffered in memory and served by `takeArchiveId()`. When
 * the buffer runs low a background refill is kicked off — `takeArchiveId()`
 * itself never awaits.
 *
 * Drawing from `signal_eval_archive_id_seq` (not a separate namespace) means the
 * app-supplied ids can never collide with the DB-DEFAULT ids used by rows that
 * don't get provenance (crypto, or block-empty) — per Langston C2.
 *
 * Gaps are fine: this is a telemetry id, not a dense surrogate key. If the block
 * is momentarily empty (refill in flight), `takeArchiveId()` returns undefined,
 * the base row falls back to the DB DEFAULT, and that decision simply gets no
 * provenance row — exactly the <100%-coverage case C1 already accounts for.
 *
 * NOTE on bigint→Number: the sequence is ~1.4e7 today; JS Number is exact to
 * ~9e15 (Number.MAX_SAFE_INTEGER), so Number() is safe for the foreseeable life
 * of this table. Guarded below.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../../db.js';
import { sql } from 'drizzle-orm';

// Sizing (Langston Step-4 note): a scan cycle is ONE macrotask, and the archive
// hooks only `await import()` (a resolved-promise microtask) — they never yield
// to libuv's poll phase, so an in-flight `refill()` db.execute CANNOT land
// mid-cycle; it only lands in the gap BETWEEN cycles. So whatever is buffered at
// cycle start is the hard cap for that cycle, and if it drains mid-cycle the
// decisions that get `undefined` are deterministically the LAST in scan order —
// a biased, symbol-correlated coverage hole, worse for a calibration study than
// a random one. Measured xStock peak is ~1,000–1,500 decisions/cycle, so the
// block is sized to comfortably exceed worst-case per-cycle count and the buffer
// is kept well-topped between cycles → a normal cycle hits ~100% coverage; only
// a true >BLOCK_SIZE burst drops (and that drop is surfaced via coverage%).
const BLOCK_SIZE = 3_000; // ~1 DB round-trip per 3,000 ids; > worst-case per-cycle
const REFILL_THRESHOLD = 2_000; // refill early (between cycles) to stay topped
const MAX_BUFFERED = 6_000; // hard cap (2 blocks) so a stalled consumer can't unbounded-grow

let idBuffer: number[] = [];
let refilling = false;

async function refill(): Promise<void> {
  if (refilling) return;
  if (idBuffer.length >= MAX_BUFFERED) return;
  refilling = true;
  try {
    const res: any = await db.execute(
      sql`SELECT nextval('signal_eval_archive_id_seq')::bigint AS v FROM generate_series(1, ${BLOCK_SIZE})`,
    );
    const rows: any[] = Array.isArray(res) ? res : res?.rows ?? [];
    for (const r of rows) {
      const n = Number(r.v);
      if (Number.isSafeInteger(n)) idBuffer.push(n);
    }
  } catch (err) {
    // Best-effort: a refill failure just means provenance coverage dips until
    // the next attempt. Never throws to the hot path.
    console.warn(
      `[B-NEW-53][ID] id-block refill failed:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    refilling = false;
  }
}

/**
 * Synchronously take the next archive id, or undefined if the buffer is empty
 * (refill in flight). Triggers a background refill when running low. Hot-path
 * safe — never awaits, never throws.
 */
export function takeArchiveId(): number | undefined {
  if (idBuffer.length <= REFILL_THRESHOLD && !refilling) {
    void refill();
  }
  return idBuffer.shift();
}

/** Prime the buffer at boot so the first decisions get provenance. */
export function primeArchiveIdAllocator(): void {
  void refill();
}

/** Diagnostics for the dashboard / tests. */
export function getArchiveIdAllocatorStats(): { buffered: number; refilling: boolean } {
  return { buffered: idBuffer.length, refilling };
}

/** Test-only: reset internal state and inject a buffer. */
export function _setBufferForTests(ids: number[]): void {
  idBuffer = [...ids];
  refilling = false;
}
