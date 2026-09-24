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
 * WHAT IT DOES (Step-2 plan P3-P7, Langston-approved; Step-4 r2 and r3 folded):
 *   - SNAPSHOT every 30 s: `snapshotRetainableRings()` — "the ring a clear would leave behind right now" —
 *     UPSERTED in ONE statement. ⛔⛔ THE STORE NEVER DELETES (Step-4 r3, see below).
 *   - A SHUTDOWN FLUSH, attempted and bounded (5 s). ⚠️ It is NOT established as "the normal path": it runs LAST
 *     in the shutdown handler, after work with no timeout of its own, inside pm2's `kill_timeout` 10 s
 *     (`ecosystem.config.cjs`). **Until a real restart logs `SHUTDOWN_FLUSH written=`, the honest crash bound
 *     is the 30 s snapshot** (Langston Step-4 FINDING-1; verified at Step 7/8).
 *   - RESTORE at boot, BEFORE `resumeActiveEngines()` (`server/index.ts`), so no exit loop runs before the
 *     rings are back. Only S25b is restored; chains re-seed fresh and are judged.
 *
 * ⛔⛔ UPSERT-ONLY — THE STORE HAS NO DELETE PATH AT ALL (Step-4 r3, Langston's FINDING on the sweep).
 *   r1/r2 deleted every row absent from the snapshot. That is an EVICTION, and it evicts in the PERMISSIVE
 *   direction: a ring consumed by a plausible seed left the snapshot, its row was deleted, and a restart in the
 *   gap between that consumption and the new chain's first movement then seeded the symbol VACUOUSLY, where
 *   the kept row would have judged it. "Consumed by this process" is a fact about chain lifecycle, not about
 *   the evidence's quality; the provenance gate is `retainsRing` at WRITE time either way (SIM S25b: staleness
 *   is not the hazard, provenance is). A delete path was also the whole BLOCKER-1 class (a failed read
 *   followed by a sweep wiped the store) — with no delete, that class cannot exist.
 *   ⚠️ WHAT THIS COSTS, STATED: (1) a row lives until its symbol's next retained ring OVERWRITES it, so a ring a
 *   process consumed can be restored again after a later restart — it judges ONE seed per process (condition 5
 *   holds in-process) but it is not single-use ACROSS restarts; (2) rows for symbols that leave the universe are
 *   never removed. The table is one row per xStock symbol ever held, so (2) is bounded and inert (a symbol that
 *   is no longer traded never seeds). Langston offered a universe-membership sweep; it buys almost nothing here
 *   and needs a universe source this module does not have, so it is not built — recorded for Step 10.
 *
 * ⛔ FAILURE RULES (Langston Step-1 Q2 (a)(b); Step-4 r3 conditions 1-2):
 *   - A single invalid ROW is SKIPPED and COUNTED; the rest load. An OVER-LONG ring is TRUNCATED to its last
 *     `ringCap` values (mirroring the tracker's own `spreads.shift()`), never skipped.
 *   - The WHOLE store unreadable — the query fails, the guard's config cannot be read, the tracker's boot-only
 *     fence refuses, or EVERY stored row is invalid — ⇒ empty maps (exactly today's behaviour) PLUS the alert
 *     `book-state-ring-restore-failed`, RESOLVED never ACKED.
 *   - A SNAPSHOT that keeps failing raises `book-state-ring-snapshot-failing` after
 *     `RING_SNAPSHOT_FAIL_ALERT_AFTER` consecutive failures (once per failure streak): the steady-state write
 *     failure is what silently rots the store between restarts, so it must not live only in a log.
 *   - It NEVER fails closed, and a failed write never throws into its caller.
 *
 * WHAT IT IS NOT: a standing yardstick within a process. A restored ring is consumed at the first plausible
 * seed exactly like a clear-written one (Langston, Step-1 condition 5).
 */
import { sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { snapshotRetainableRings, restoreRetainedRings, type RingSnapshotEntry } from './book-state-tracker.js';
import { resolveBookStateConfigSync } from './book-state-config.js';
import { medianOf } from './book-state.js';

/** Step-2 Q2 (Langston): the crash-loss bound. A persistence cadence, not a trading setting. */
export const RING_SNAPSHOT_INTERVAL_MS = 30_000;
/** How long the shutdown flush may hold the exit. */
export const RING_SHUTDOWN_FLUSH_TIMEOUT_MS = 5_000;
/** Consecutive failed snapshots before the write-failure alert: 10 × 30 s = 5 minutes of a rotting store. */
export const RING_SNAPSHOT_FAIL_ALERT_AFTER = 10;
export const RING_RESTORE_ALERT_KEY = 'book-state-ring-restore-failed';
export const RING_SNAPSHOT_ALERT_KEY = 'book-state-ring-snapshot-failing';

let _timer: ReturnType<typeof setInterval> | null = null;
let _firstSnapshotLogged = false;
/** Read by `snapshotTick` to decide the write-failure alert; reset on any success. */
let _consecutiveSnapshotFailures = 0;
let _snapshotAlertRaisedThisStreak = false;

/** Test-only: reset the module's state between cases. */
export function _resetRingStoreForTest(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
  _firstSnapshotLogged = false;
  _consecutiveSnapshotFailures = 0;
  _snapshotAlertRaisedThisStreak = false;
}

/**
 * Persist one snapshot: every ring UPSERTED in a SINGLE statement (one round trip however many symbols).
 * ⛔ No delete — see the header. A row lives until its symbol's next retained ring overwrites it.
 */
export async function persistRingSnapshot(nowMs: number = Date.now()): Promise<{ written: number; durationMs: number }> {
  const t0 = Date.now();
  const entries: RingSnapshotEntry[] = snapshotRetainableRings();
  if (entries.length > 0) {
    const payload = JSON.stringify(entries.map((e) => ({
      symbol: e.symbol, spreads: e.spreads, seed_basis: e.seedBasis, source: e.source, written_at_ms: e.writtenAtMs,
    })));
    await db.execute(sql`
      INSERT INTO xstock_book_state_rings (symbol, spreads, seed_basis, source, written_at, persisted_at)
      SELECT x.symbol, x.spreads, x.seed_basis, x.source,
             to_timestamp(x.written_at_ms / 1000.0), to_timestamp(${nowMs}::double precision / 1000.0)
      FROM jsonb_to_recordset(${payload}::jsonb)
           AS x(symbol text, spreads jsonb, seed_basis text, source text, written_at_ms double precision)
      ON CONFLICT (symbol) DO UPDATE SET
        spreads = EXCLUDED.spreads, seed_basis = EXCLUDED.seed_basis, source = EXCLUDED.source,
        written_at = EXCLUDED.written_at, persisted_at = EXCLUDED.persisted_at
    `);
  }
  return { written: entries.length, durationMs: Date.now() - t0 };
}

async function raiseSnapshotFailingAlert(failures: number, lastError: string): Promise<void> {
  try {
    const { addAlert } = await import('../../services/system-alerts.js');
    await addAlert({
      triggers_at: new Date(),
      category: 'breakage',
      severity: 'warning',
      title: `xStock book-state ring snapshots failing — ${failures} in a row`,
      body:
        `The 30 s snapshot of the xStock book-state guard's retained spread rings has failed ${failures} times in a row ` +
        `(last error: ${lastError}). Nothing is lost in memory, but the durable store is going stale: a restart now would ` +
        `restore rings from before the failures began, or none for names first held since. (#1066, 3n.q8) ` +
        `DISPOSITION: RESOLVE this row with evidence once snapshots succeed again, do not ACK it — an ack silences this key.`,
      dedupe_key: RING_SNAPSHOT_ALERT_KEY,
    });
  } catch (alertErr) {
    console.error('[3n.q8][RING_STORE] failed to raise the snapshot-failing alert:', alertErr);
  }
}

/** One snapshot tick. Exported for tests; production calls it from the 30 s timer. Never throws. */
export async function snapshotTick(): Promise<void> {
  try {
    const r = await persistRingSnapshot();
    _consecutiveSnapshotFailures = 0;
    _snapshotAlertRaisedThisStreak = false;
    // One line per process, `console.warn` so it survives: the measured row count and duration against the
    // 5 s flush budget (Step-4 nit).
    if (!_firstSnapshotLogged) {
      _firstSnapshotLogged = true;
      console.warn(`[3n.q8][RING_STORE] FIRST_SNAPSHOT written=${r.written} durationMs=${r.durationMs}`);
    }
  } catch (err) {
    _consecutiveSnapshotFailures++;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[3n.q8][RING_STORE] SNAPSHOT_FAILED consecutive=${_consecutiveSnapshotFailures} error=${msg}`);
    if (_consecutiveSnapshotFailures >= RING_SNAPSHOT_FAIL_ALERT_AFTER && !_snapshotAlertRaisedThisStreak) {
      _snapshotAlertRaisedThisStreak = true;
      await raiseSnapshotFailingAlert(_consecutiveSnapshotFailures, msg);
    }
  }
}

/** Start the 30 s snapshot. Idempotent. `unref` so it never holds the process open on its own. */
export function startRingSnapshots(): void {
  if (_timer) return;
  _timer = setInterval(() => { void snapshotTick(); }, RING_SNAPSHOT_INTERVAL_MS);
  _timer.unref();
  console.warn(`[3n.q8][RING_STORE] snapshots started every ${RING_SNAPSHOT_INTERVAL_MS} ms (upsert-only)`);
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
    else console.warn(`[3n.q8][RING_STORE] SHUTDOWN_FLUSH written=${r.written} durationMs=${r.durationMs}`);
  } catch (err) {
    console.warn(`[3n.q8][RING_STORE] SHUTDOWN_FLUSH_FAILED error=${err instanceof Error ? err.message : String(err)}`);
  }
}

/** One stored row, as the query returns it: columns `symbol`, `spreads`, `seed_basis`, `source`, `written_at`,
 *  `persisted_at`, every value UNTRUSTED until `validateRingRows` has read it. */
export type RingStoreRow = Record<string, unknown>;

export interface ValidatedRing {
  symbol: string; spreads: number[]; seedBasis: 'judged' | 'vacuous'; source: 'live' | 'retained';
  writtenAtMs: number; persistedAtMs: number;
}
export interface ValidatedRings {
  entries: ValidatedRing[];
  skippedInvalid: number;
  skipReasons: Record<string, number>;
  /** Over-long rings kept as their last `ringCap` values (not skipped). */
  truncated: number;
}

function toMs(v: unknown): number | null {
  if (v instanceof Date) { const t = v.getTime(); return Number.isFinite(t) ? t : null; }
  if (typeof v === 'string' || typeof v === 'number') { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; }
  return null;
}

/**
 * ⛔ PER-ROW validation (Langston Step-1 Q2 (a)): an invalid row is skipped and counted, never fatal.
 * `ringCap` is the guard's own ring size (`max(5, trailingSpreadWindowSnaps)`), read from its config.
 * ⛔ An over-long ring is TRUNCATED to its last `ringCap` values, exactly as the tracker trims a live chain —
 * so `spreads_length` means genuine corruption (an empty ring) and nothing else (Step-4 BLOCKER-1 (b)).
 * ⛔ A ring whose median is 0 (a locked book) is VALID and is NOT skipped: uninformative is not malformed
 * (Step-4 answer C). The restore line counts it separately as `cannotJudge`.
 */
export function validateRingRows(rows: ReadonlyArray<RingStoreRow>, ringCap: number): ValidatedRings {
  const out: ValidatedRings = { entries: [], skippedInvalid: 0, skipReasons: {}, truncated: 0 };
  const skip = (why: string) => { out.skippedInvalid++; out.skipReasons[why] = (out.skipReasons[why] ?? 0) + 1; };
  for (const row of rows) {
    const symbol = typeof row.symbol === 'string' ? row.symbol.trim() : '';
    if (!symbol) { skip('symbol'); continue; }
    let spreads: unknown = row.spreads;
    if (typeof spreads === 'string') { try { spreads = JSON.parse(spreads); } catch { skip('spreads_unparseable'); continue; } }
    if (!Array.isArray(spreads) || spreads.length < 1) { skip('spreads_length'); continue; }
    if (!spreads.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)) { skip('spreads_value'); continue; }
    let ring = spreads as number[];
    if (ring.length > ringCap) { ring = ring.slice(ring.length - ringCap); out.truncated++; }
    if (row.seed_basis !== 'judged' && row.seed_basis !== 'vacuous') { skip('seed_basis'); continue; }
    const source = row.source === 'live' || row.source === 'retained' ? row.source : null;
    if (source === null) { skip('source'); continue; }
    const writtenAtMs = toMs(row.written_at);
    const persistedAtMs = toMs(row.persisted_at);
    if (writtenAtMs === null || persistedAtMs === null) { skip('timestamps'); continue; }
    out.entries.push({ symbol, spreads: ring, seedBasis: row.seed_basis, source, writtenAtMs, persistedAtMs });
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
 * ⛔ Every count in the line is derived from what ACTUALLY LOADED (Step-4 nit): `n` and the breakdowns share
 * one population, and `notLoaded` says how many valid rows the tracker declined.
 */
export function applyRestoredRings(v: ValidatedRings, nowMs: number = Date.now()): number {
  const loadedSymbols = new Set(restoreRetainedRings(v.entries));
  const loaded = v.entries.filter((e) => loadedSymbols.has(e.symbol.toUpperCase()));
  const judged = loaded.filter((e) => e.seedBasis === 'judged').length;
  const live = loaded.filter((e) => e.source === 'live').length;
  const cannotJudge = loaded.filter((e) => { const m = medianOf(e.spreads); return !(m !== null && m > 0); }).length;
  // ⚠️ MIXED CLOCKS, STATED (Step-4 nit): the ring's last frame is FEED time; `now` is the WALL clock here.
  const ages = loaded.map((e) => (nowMs - e.writtenAtMs) / 60_000).sort((a, b) => a - b);
  const newestPersist = loaded.reduce<number | null>((m, e) => (m === null || e.persistedAtMs > m ? e.persistedAtMs : m), null);
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : 'none');
  console.warn(
    `[3n.q8][BOOK_STATE] RING_RESTORED n=${loaded.length} notLoaded=${v.entries.length - loaded.length} ` +
    `skippedInvalid=${v.skippedInvalid} skipReasons=${JSON.stringify(v.skipReasons)} truncated=${v.truncated} ` +
    `judged=${judged} vacuous=${loaded.length - judged} cannotJudge=${cannotJudge} live=${live} retained=${loaded.length - live} ` +
    `ringAgeMin(wallNow-lastFeedFrame) p50=${f(pct(ages, 0.5))} p90=${f(pct(ages, 0.9))} max=${f(ages.length ? ages[ages.length - 1] : NaN)} ` +
    `downtimeMin(wallNow-newestPersist)=${newestPersist === null ? 'none' : f((nowMs - newestPersist) / 60_000)}`,
  );
  return loaded.length;
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
        `The durable store of the xStock book-state guard's retained spread rings could not be used at boot (${reason}). ` +
        `The guard is running exactly as it did before 3n.q8: every first frame after this restart seeds without a judgement, ` +
        `which is the permissive direction (#1066). The store is upsert-only and never deletes, so the rings already stored ` +
        `are kept for the next boot. ` +
        `DISPOSITION: RESOLVE this row with evidence, do not ACK it — an ack silences this key and every future boot failure with it.`,
      dedupe_key: RING_RESTORE_ALERT_KEY,
    });
  } catch (alertErr) {
    console.error('[3n.q8][RING_STORE] failed to raise the restore alert:', alertErr);
  }
}

async function restoreFailed(reason: string): Promise<0> {
  console.warn(`[3n.q8][BOOK_STATE] RING_RESTORE_FAILED ${reason}`);
  await raiseRestoreFailedAlert(reason);
  return 0;
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
    return restoreFailed(`guard config unreadable: ${err instanceof Error ? err.message : String(err)}`);
  }
  let rows: RingStoreRow[];
  try {
    const res = await db.execute(sql`SELECT symbol, spreads, seed_basis, source, written_at, persisted_at FROM xstock_book_state_rings`);
    rows = res.rows;
  } catch (err) {
    return restoreFailed(`store unreadable: ${err instanceof Error ? err.message : String(err)}`);
  }
  const v = validateRingRows(rows, ringCap);
  // ⛔ Step-4 r3 condition 1: a store with rows the reader could not parse AT ALL is a whole-store failure, not an
  // empty store — it must alert, not read as "nothing to restore".
  if (rows.length > 0 && v.entries.length === 0) {
    return restoreFailed(`every stored row is invalid (${rows.length} rows; reasons ${JSON.stringify(v.skipReasons)})`);
  }
  try {
    return applyRestoredRings(v);
  } catch (err) {
    // The tracker's boot-only fence (live chains already exist) — a caller error, not a store fault.
    return restoreFailed(`restore refused by the tracker: ${err instanceof Error ? err.message : String(err)}`);
  }
}
