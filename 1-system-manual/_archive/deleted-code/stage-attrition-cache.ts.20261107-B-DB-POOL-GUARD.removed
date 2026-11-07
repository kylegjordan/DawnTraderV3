/**
 * B-FILTER-DIAG-PAPER (OBJ-4) — per-strategy × per-stage attrition, CACHED.
 *
 * WHY A CACHE, MEASURED (Langston Step-2 rider 2 — "the cache fixes the client, not the database"):
 *   24h GROUP BY over `signal_eval_archive`  → 38,507 ms (EXPLAIN ANALYZE, 2,360,757 rows)
 *   6h  GROUP BY (this query), WARM          →    467-472 ms (600,706 rows)
 *   6h  GROUP BY (this query), COLD          →  6,708-6,922 ms  ← first read after an idle gap
 * The window is the cheapening rider 2 asked for. At a 5-minute refresh the pages stay warm, so
 * STEADY STATE is ~470 ms ≈ 0.16% duty cycle; the first run after boot pays the ~7 s cold read
 * once. Versus ~13% duty cycle for the 24h version.
 *
 * ⚠ MEASUREMENT NOTE, kept because it nearly shipped as a wrong cause: adding `asset_class` as a
 * 4th GROUP BY column first timed at 6,708 ms and looked like the column's cost. It is not — an
 * interleaved A/B (3-col, 4-col, 3-col, 4-col in one session) reads 6,922 / 472 / 420 / 467 ms:
 * the 4th column costs ~nothing and the first number was COLD CACHE. The instrument's state was
 * leaking into the reading. Re-run the interleaved form before quoting any figure here.
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
  /** Step-4 BLOCKER-1: the 19 strategies are SHARED across classes, so omitting this blended
   *  crypto and xStock into one death profile — the exact question #648 asks, answered on the
   *  wrong population. The client filters on it per class panel. */
  assetClass: string;
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
    SELECT strategy, reject_stage, source, asset_class, count(*)::int AS n
    FROM signal_eval_archive
    WHERE captured_at >= now() - (${STAGE_ATTRITION_WINDOW_HOURS} || ' hours')::interval
    GROUP BY 1, 2, 3, 4
  `);
  const raw = (res?.rows ?? res ?? []) as any[];
  const rows: StageAttritionRow[] = raw.map((r) => ({
    strategy: String(r.strategy ?? 'unknown'),
    rejectStage: String(r.reject_stage ?? 'unknown'),
    source: String(r.source ?? 'unknown'),
    assetClass: String(r.asset_class ?? 'unknown'),
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
