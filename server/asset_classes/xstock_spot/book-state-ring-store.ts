/**
 * `3n.q8` `B-BOOK-STATE-RESTART-DURABLE` (#1066) — THE DURABLE STORE FOR THE xSTOCK BOOK-STATE GUARD'S
 * RETAINED SPREAD RINGS (SIM S25b).
 *
 * WHY IT EXISTS. The guard judges each new reference chain's FIRST frame against the symbol's retained ring,
 * the one datum from outside the new chain. The ring lived only in memory, so every restart emptied it and
 * the first frame after a restart seeded VACUOUSLY PLAUSIBLE — the permissive direction. MEASURED 2026-09-19:
 * ANET/USD's seed spread 0.32368 was refused at 00:16:30 against a retained median of 0.00415 (ratio 78.03)
 * and accepted unjudged at 00:54:15 one restart later; it closed `stop_hit` 12 s after that (a false stop).
 * Evidence: `Scope Files/B_BOOK_STATE_RESTART_DURABLE_CONTROL_2026-09-19.txt`.
 *
 * WHAT IT DOES (Step-2 plan P3-P7, Langston-approved):
 *   - SNAPSHOT every 30 s and on graceful shutdown: `snapshotRetainableRings()` — "the ring a clear would leave
 *     behind right now" — upserted, and every row not in the snapshot deleted, in ONE transaction.
 *   - RESTORE at boot, BEFORE `resumeActiveEngines()` (`server/index.ts`), so no exit loop runs before the
 *     rings are back. Only S25b is restored; chains re-seed fresh and are judged.
 *
 * ⛔ FAILURE RULES (Langston Step-1 Q2, conditions (a) and (b)):
 *   - A single invalid ROW is SKIPPED and COUNTED; the rest load. One bad row must never discard good rings.
 *   - The WHOLE store unreadable (query fails, or the guard's own config cannot be read) ⇒ empty maps, which is
 *     exactly today's behaviour, PLUS an alert keyed `book-state-ring-restore-failed`. That alert is RESOLVED,
 *     never ACKED — an ack silences the dedupe key and every future boot failure with it.
 *   - It NEVER fails closed. Refusing every xStock exit because a table is unreadable would turn a durability
 *     feature into a trading halt. This is the OPPOSITE of the trailing-state load's hard-fail, deliberately:
 *     a lost trailing state is a wrong exit state; a lost ring is today's behaviour.
 *   - A failed SNAPSHOT write logs, counts, and never throws into its caller.
 *
 * WHAT IT IS NOT: a standing yardstick. A restored ring is consumed at the first plausible seed exactly like a
 * clear-written one (Langston, Step-1 condition 5).
 */
import { sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { snapshotRetainableRings, restoreRetainedRings, type RingSnapshotEntry } from './book-state-tracker.js';
import { resolveBookStateConfigSync } from './book-state-config.js';

/** Step-2 Q2 (Langston): crash loss is bounded by this; the shutdown flush is the normal path. A persistence
 *  cadence, not a trading setting. */
export const RING_SNAPSHOT_INTERVAL_MS = 30_000;
/** How long the shutdown flush may hold the exit. */
export const RING_SHUTDOWN_FLUSH_TIMEOUT_MS = 5_000;
export const RING_RESTORE_ALERT_KEY = 'book-state-ring-restore-failed';

let _timer: ReturnType<typeof setInterval> | null = null;
const _stats = { snapshotsOk: 0, snapshotsFailed: 0, lastOkAtMs: null as number | null, lastError: null as string | null };

/** Read-only view of the writer's counters (observability; the counters are the writer's own). */
export function getRingStoreStats(): Readonly<typeof _stats> { return { ..._stats }; }

/** Persist one snapshot: upsert what is present, delete what is absent — one transaction. */
export async function persistRingSnapshot(nowMs: number = Date.now()): Promise<{ written: number; deleted: number }> {
  const entries: RingSnapshotEntry[] = snapshotRetainableRings();
  const symbols = entries.map((e) => e.symbol);
  let deleted = 0;
  await db.transaction(async (tx) => {
    for (const e of entries) {
      await tx.execute(sql`
        INSERT INTO xstock_book_state_rings (symbol, spreads, seed_basis, source, written_at, persisted_at)
        VALUES (${e.symbol}, ${JSON.stringify(e.spreads)}::jsonb, ${e.seedBasis}, ${e.source},
                to_timestamp(${e.writtenAtMs}::double precision / 1000.0), to_timestamp(${nowMs}::double precision / 1000.0))
        ON CONFLICT (symbol) DO UPDATE SET
          spreads = EXCLUDED.spreads, seed_basis = EXCLUDED.seed_basis, source = EXCLUDED.source,
          written_at = EXCLUDED.written_at, persisted_at = EXCLUDED.persisted_at
      `);
    }
    const res = await tx.execute(sql`
      DELETE FROM xstock_book_state_rings
      WHERE symbol NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(symbols)}::jsonb))
    `);
    deleted = Number(res.rowCount ?? 0);
  });
  return { written: entries.length, deleted };
}

async function snapshotTick(): Promise<void> {
  try {
    await persistRingSnapshot();
    _stats.snapshotsOk++;
    _stats.lastOkAtMs = Date.now();
  } catch (err) {
    _stats.snapshotsFailed++;
    _stats.lastError = err instanceof Error ? err.message : String(err);
    console.warn(`[3n.q8][RING_STORE] SNAPSHOT_FAILED failures=${_stats.snapshotsFailed} error=${_stats.lastError}`);
  }
}

/** Start the 30 s snapshot. Idempotent. `unref` so it never holds the process open on its own. */
export function startRingSnapshots(): void {
  if (_timer) return;
  _timer = setInterval(() => { void snapshotTick(); }, RING_SNAPSHOT_INTERVAL_MS);
  _timer.unref();
  console.log(`[3n.q8][RING_STORE] snapshots started every ${RING_SNAPSHOT_INTERVAL_MS} ms`);
}

/** Graceful-shutdown flush, bounded so it can never hold the exit. Never throws. */
export async function flushRingSnapshotOnShutdown(): Promise<void> {
  if (_timer) { clearInterval(_timer); _timer = null; }
  const timeout = new Promise<'timeout'>((resolve) => {
    const t = setTimeout(() => resolve('timeout'), RING_SHUTDOWN_FLUSH_TIMEOUT_MS);
    t.unref();
  });
  try {
    const r = await Promise.race([persistRingSnapshot(), timeout]);
    if (r === 'timeout') console.warn(`[3n.q8][RING_STORE] SHUTDOWN_FLUSH_TIMEOUT after ${RING_SHUTDOWN_FLUSH_TIMEOUT_MS} ms`);
    else console.warn(`[3n.q8][RING_STORE] SHUTDOWN_FLUSH written=${r.written} deleted=${r.deleted}`);
  } catch (err) {
    console.warn(`[3n.q8][RING_STORE] SHUTDOWN_FLUSH_FAILED error=${err instanceof Error ? err.message : String(err)}`);
  }
}

/** One stored row, as the query returns it: columns `symbol`, `spreads`, `seed_basis`, `written_at`, `persisted_at`,
 *  every value UNTRUSTED until `validateRingRows` has read it. */
export type RingStoreRow = Record<string, unknown>;

export interface ValidatedRings {
  entries: Array<{ symbol: string; spreads: number[]; seedBasis: 'judged' | 'vacuous'; writtenAtMs: number; persistedAtMs: number }>;
  skippedInvalid: number;
  skipReasons: Record<string, number>;
}

function toMs(v: unknown): number | null {
  if (v instanceof Date) { const t = v.getTime(); return Number.isFinite(t) ? t : null; }
  if (typeof v === 'string' || typeof v === 'number') { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; }
  return null;
}

/**
 * ⛔ PER-ROW validation (Langston Step-1 Q2 (a)): an invalid row is skipped and counted, never fatal.
 * `ringCap` is the guard's own ring size (`max(5, trailingSpreadWindowSnaps)`), read from its config.
 */
export function validateRingRows(rows: ReadonlyArray<RingStoreRow>, ringCap: number): ValidatedRings {
  const out: ValidatedRings = { entries: [], skippedInvalid: 0, skipReasons: {} };
  const skip = (why: string) => { out.skippedInvalid++; out.skipReasons[why] = (out.skipReasons[why] ?? 0) + 1; };
  for (const row of rows) {
    const symbol = typeof row.symbol === 'string' ? row.symbol.trim() : '';
    if (!symbol) { skip('symbol'); continue; }
    let spreads: unknown = row.spreads;
    if (typeof spreads === 'string') { try { spreads = JSON.parse(spreads); } catch { skip('spreads_unparseable'); continue; } }
    if (!Array.isArray(spreads) || spreads.length < 1 || spreads.length > ringCap) { skip('spreads_length'); continue; }
    if (!spreads.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) { skip('spreads_value'); continue; }
    if (row.seed_basis !== 'judged' && row.seed_basis !== 'vacuous') { skip('seed_basis'); continue; }
    const writtenAtMs = toMs(row.written_at);
    const persistedAtMs = toMs(row.persisted_at);
    if (writtenAtMs === null || persistedAtMs === null) { skip('timestamps'); continue; }
    out.entries.push({ symbol, spreads: spreads as number[], seedBasis: row.seed_basis, writtenAtMs, persistedAtMs });
  }
  return out;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

/**
 * Load the validated rows into the tracker and print the one boot line OBJ-4 and P9 read. Separated from the
 * query so tests drive the real tracker without a database.
 */
export function applyRestoredRings(v: ValidatedRings, nowMs: number = Date.now()): number {
  const loaded = restoreRetainedRings(v.entries);
  const judged = v.entries.filter((e) => e.seedBasis === 'judged').length;
  const ages = v.entries.map((e) => (nowMs - e.writtenAtMs) / 60_000).sort((a, b) => a - b);
  const newestPersist = v.entries.reduce<number | null>((m, e) => (m === null || e.persistedAtMs > m ? e.persistedAtMs : m), null);
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : 'none');
  console.warn(
    `[3n.q8][BOOK_STATE] RING_RESTORED n=${loaded} skippedInvalid=${v.skippedInvalid} ` +
    `skipReasons=${JSON.stringify(v.skipReasons)} judged=${judged} vacuous=${v.entries.length - judged} ` +
    `ringAgeMin p50=${f(pct(ages, 0.5))} p90=${f(pct(ages, 0.9))} max=${f(ages.length ? ages[ages.length - 1] : NaN)} ` +
    `downtimeMin=${newestPersist === null ? 'none' : f((nowMs - newestPersist) / 60_000)}`,
  );
  return loaded;
}

async function raiseRestoreFailedAlert(reason: string): Promise<void> {
  try {
    const { addAlert } = await import('../../services/system-alerts.js');
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'warning',
      title: 'xStock book-state rings NOT restored at boot — first seeds are unjudged',
      body:
        `The durable store of the xStock book-state guard's retained spread rings could not be read at boot (${reason}). ` +
        `The guard is running exactly as it did before 3n.q8: every first frame after this restart seeds without a judgement, ` +
        `which is the permissive direction (#1066). Snapshots continue, so the NEXT restart will have rings if the store is healthy. ` +
        `DISPOSITION: RESOLVE this row with evidence, do not ACK it — an ack silences this key and every future boot failure with it.`,
      dedupe_key: RING_RESTORE_ALERT_KEY,
    });
  } catch (alertErr) {
    console.error('[3n.q8][RING_STORE] failed to raise the restore alert:', alertErr);
  }
}

/**
 * ⭐ The boot restore. Called from `server/index.ts` BEFORE `resumeActiveEngines()`. Never throws, never fails
 * closed. Returns the number of rings loaded (0 on a whole-store failure).
 */
export async function restoreRingsAtBoot(): Promise<number> {
  let ringCap: number;
  try {
    ringCap = Math.max(5, resolveBookStateConfigSync().trailingSpreadWindowSnaps);
  } catch (err) {
    const reason = `guard config unreadable: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`[3n.q8][BOOK_STATE] RING_RESTORE_FAILED ${reason}`);
    await raiseRestoreFailedAlert(reason);
    return 0;
  }
  let rows: RingStoreRow[];
  try {
    const res = await db.execute(sql`SELECT symbol, spreads, seed_basis, written_at, persisted_at FROM xstock_book_state_rings`);
    rows = res.rows;
  } catch (err) {
    const reason = `store unreadable: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`[3n.q8][BOOK_STATE] RING_RESTORE_FAILED ${reason}`);
    await raiseRestoreFailedAlert(reason);
    return 0;
  }
  return applyRestoredRings(validateRingRows(rows, ringCap));
}
