/**
 * B-FILTER-DIAG-PAPER (OBJ-4) — per-strategy × per-stage attrition, CACHED.
 *
 * WHY A CACHE, MEASURED (Langston Step-2 rider 2 — "the cache fixes the client, not the database"):
 *   24h GROUP BY over `signal_eval_archive`  → 38,507 ms (EXPLAIN ANALYZE, 2,360,757 rows)
 *   6h  GROUP BY, same shape                 →    494 ms (600,706 rows)
 * The 78× drop is why the window is SIX HOURS, not 24: at 494 ms per 5-minute refresh the duty
 * cycle on the shared instance is ~0.16%, versus ~13% for the 24h version. The window is the
 * cheapening rider 2 asked for — evidence above, re-runnable from the same two statements.
 *
 * SEMANTICS THE TABS DEPEND ON:
 *  - `source` is the LANE DISCRIMINATOR, never `mode`. Since 2026-07-14 both pipelines stamp
 *    mode='paper', so a mode filter would blend the active path with VTS. Active-path sources are
 *    the orchestrator / active-execution-engine; VTS is vts-runner; the scanners are the SHARED
 *    scan feed that precedes both.
 *  - `admitted` is NEVER summed across sources: the orchestrator's admit (queued) and the engine's
 *    admit (opened) are different events on the same row taxonomy (P19-B5a's own SIM rule).
 *  - `strategy_internal` has no active-path writer at all — it is a VTS-only stage. A blank active
 *    cell there is correct, and the client says so rather than rendering a bare 0.
 *
 * FAILURE POSTURE: swap-on-success (the module-constants pattern). A failed refresh leaves the
 * previous tally serving with its ORIGINAL `computedAt` — the client renders staleness honestly
 * instead of an error or, worse, a confident zero.
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';

export const STAGE_ATTRITION_SCHEMA = 'stage-attrition/v1' as const;
export const STAGE_ATTRITION_WINDOW_HOURS = 6;
const REFRESH_MS = 5 * 60_000;

/** Sources that belong to the ACTIVE trading path (the #648 population). */
export const ACTIVE_PATH_SOURCES = ['signal-orchestrator', 'active-execution-engine'] as const;
/** Sources that belong to the VTS / passive-learning lane. */
export const VTS_PATH_SOURCES = ['vts-runner'] as const;
/** The shared scan feed that precedes BOTH lanes — neither lane owns these rows. */
export const SHARED_SCAN_SOURCES = ['market-scanner', 'fx5-scanner'] as const;

export interface StageAttritionRow {
  strategy: string;
  rejectStage: string;
  source: string;
  count: number;
}

export interface StageAttritionSnapshot {
  schema: typeof STAGE_ATTRITION_SCHEMA;
  windowHours: number;
  /** ISO stamp of the last SUCCESSFUL compute — the client renders this as "as of …". */
  computedAt: string;
  /** ms the last successful compute took (surfaced so a slowdown is visible, not inferred). */
  computeMs: number;
  rows: StageAttritionRow[];
  /** null until the first successful compute; a failed FIRST compute stays null (honest-absent,
   *  never an empty-rows snapshot that would read as "measured, found nothing"). */
  lastError: string | null;
}

let _snapshot: StageAttritionSnapshot | null = null;
let _lastError: string | null = null;
let _timer: NodeJS.Timeout | null = null;
let _inFlight = false;

async function computeSnapshot(): Promise<StageAttritionSnapshot> {
  const t0 = Date.now();
  const res: any = await db.execute(sql`
    SELECT strategy, reject_stage, source, count(*)::int AS n
    FROM signal_eval_archive
    WHERE captured_at >= now() - (${STAGE_ATTRITION_WINDOW_HOURS} || ' hours')::interval
    GROUP BY 1, 2, 3
  `);
  const raw = (res?.rows ?? res ?? []) as any[];
  const rows: StageAttritionRow[] = raw.map((r) => ({
    strategy: String(r.strategy ?? 'unknown'),
    rejectStage: String(r.reject_stage ?? 'unknown'),
    source: String(r.source ?? 'unknown'),
    count: Number(r.n ?? 0),
  }));
  return {
    schema: STAGE_ATTRITION_SCHEMA,
    windowHours: STAGE_ATTRITION_WINDOW_HOURS,
    computedAt: new Date().toISOString(),
    computeMs: Date.now() - t0,
    rows,
    lastError: null,
  };
}

/** Refresh once. Swap-on-success: on failure the previous snapshot keeps serving, unchanged. */
export async function refreshStageAttrition(): Promise<void> {
  if (_inFlight) return; // never stack refreshes — a slow query must not queue behind itself
  _inFlight = true;
  try {
    const next = await computeSnapshot();
    _snapshot = next;
    _lastError = null;
  } catch (err) {
    _lastError = err instanceof Error ? err.message : String(err);
    console.warn('[stage-attrition] refresh FAILED, serving previous snapshot:', _lastError);
  } finally {
    _inFlight = false;
  }
}

/** The served snapshot. `null` before the first success — the endpoint reports that state
 *  explicitly rather than fabricating an empty tally. */
export function getStageAttrition(): StageAttritionSnapshot | null {
  if (!_snapshot) return null;
  return { ..._snapshot, rows: _snapshot.rows.slice(), lastError: _lastError };
}

/** Start the background refresher. Idempotent. `unref` so it can never hold the process open. */
export function startStageAttritionRefresher(): void {
  if (_timer) return;
  void refreshStageAttrition();
  _timer = setInterval(() => { void refreshStageAttrition(); }, REFRESH_MS);
  if (typeof _timer.unref === 'function') _timer.unref();
}
