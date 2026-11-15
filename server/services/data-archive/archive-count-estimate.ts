/**
 * B-DB-SIZE-RELIEF Step-9 iterate (KD-80, Kyle 2026-11-14; Langston FOLD GRANTED, Discord 1571290937857151089) —
 * ESTIMATED row counts for the two Data Archive tables an exact count cannot serve.
 *
 * Measured 2026-11-14 on staging (design ask `B_DB_SIZE_RELIEF_archive_panel_counts_r1.md`): `count(*)` on
 * signal_eval_archive (35,150,911 rows, 30 daily leaves) takes 67 s and its 30-day window count 69 s; on
 * signal_eval_provenance (28,107,597 rows, monthly leaves) 53 s. The panel's statement bound is 25 s, so both rendered
 * QUERY TIMEOUT at EVERY window. This module replaces those two counts with labelled estimates:
 *   - a leaf wholly inside the window counts by its planner estimate (`pg_class.reltuples`);
 *   - a DAILY leaf the window cuts (the boundary) or still being written (the open leaf) is counted EXACTLY — one day,
 *     measured 0.2-4.6 s;
 *   - a NON-daily leaf the window cuts has its in-window slice counted EXACTLY under the same short bound
 *     (Langston's Step-4 fold, 2026-11-15); if that count does not complete, the leaf is EXCLUDED and named and the
 *     figure becomes a lower bound. NO PRORATION (Langston D): spreading a month's estimate by time fraction assumes a
 *     uniform write rate nobody measured;
 *   - a leaf holding data that has never been analysed (`reltuples < 0`) is never coerced to 0 and never summed as -1
 *     (Langston E1): it is excluded and named, and the figure becomes a lower bound;
 *   - a window that falls wholly inside excluded leaves is UNAVAILABLE, not 0.
 * A leaf with no heap pages holds no rows, so an unanalysed EMPTY leaf (the pre-created future days) contributes 0.
 *
 * THE PREMISE THE ESTIMATES REST ON (Langston, Step-4 record): rows leave these two tables only when a whole partition
 * is dropped (`DROP TABLE`, b75-retention-sweep.ts `dropPartition`), never by a row DELETE. No literal DELETE on either
 * table exists in server/ or scripts/, and the one table-name-variable DELETE that could reach them (b75-retention-sweep
 * `DELETE FROM ${spec.table}`) ranges only over PLAIN_RETENTION_TABLES (xstock_qd_probe_history, vts_open_trades,
 * closed_trades); both tables here are in its PARTITIONED list, the drop lane. An UPDATE does exist
 * (scripts/b79-0f-collision-backfill.sql, `UPDATE signal_eval_archive SET asset_class = ...`) and is immaterial: it
 * leaves the live-row count unchanged and does not touch `captured_at`, so no row moves between partitions.
 * So a leaf only grows after its last analyse, and `reltuples` reads LOW, never high: on 2026-11-15 all
 * 15 closed signal_eval_archive leaves had been analysed before their day ended, about 3.8% low in total. "≈" is
 * therefore a slight under-count. If row deletes or updates are ever added to these tables, this premise breaks and the
 * labels must be revisited.
 *
 * The planner is pure; the caller runs the exact counts it asks for and passes the results back (`assembleEstimate`).
 */

export type CountKind = 'exact' | 'estimate' | 'lower_bound' | 'unavailable';

export interface LeafInfo {
  /** schema-qualified, already quoted by Postgres (`c.oid::regclass::text`) */
  qname: string;
  /** pg_class.reltuples: -1 = never analysed */
  reltuples: number;
  heapBytes: number;
  /** partition bound in epoch ms, null when the bound is not a FROM/TO range (e.g. a DEFAULT partition) */
  fromMs: number | null;
  toMs: number | null;
  analyzedAt: string | null;
}

export interface ExactCountAsk {
  qname: string;
  /** null = count the whole leaf; an ISO instant = count rows with captured_at >= it */
  sinceIso: string | null;
}

export interface EstimatePlan {
  asks: ExactCountAsk[];
  /** reltuples sums over the leaves that need no exact count */
  windowEstimateSum: number;
  totalEstimateSum: number;
  windowKind: Exclude<CountKind, 'exact'> | 'exact';
  totalKind: Exclude<CountKind, 'exact'> | 'exact';
  /** human-readable, one clause per excluded or lagging leaf */
  windowNotes: string[];
  totalNotes: string[];
  /** window-intersecting leaves counted by their estimate (exact asks are counted when their results arrive) */
  windowEstimateLeaves: number;
  /** leaves counted into the total by their estimate (the open daily leaf's whole count arrives as an ask) */
  totalEstimateLeaves: number;
}

const DAY_MS = 86_400_000;

/** A leaf no longer than one day (UTC daily partitions are exactly 24 h). */
export function isDailyLeaf(l: LeafInfo): boolean {
  return l.fromMs !== null && l.toMs !== null && l.toMs - l.fromMs <= DAY_MS;
}

const rank: Record<CountKind, number> = { exact: 0, estimate: 1, lower_bound: 2, unavailable: 3 };
function worse(a: CountKind, b: CountKind): CountKind {
  return rank[a] >= rank[b] ? a : b;
}

/** Pure: which exact counts to run and what the estimate parts are, for one table at one window. */
export function planEstimate(leaves: LeafInfo[], windowStartMs: number, nowMs: number): EstimatePlan {
  const asks: ExactCountAsk[] = [];
  let windowEstimateSum = 0;
  let totalEstimateSum = 0;
  let windowKind: CountKind = 'exact';
  let totalKind: CountKind = 'exact';
  const windowNotes: string[] = [];
  const totalNotes: string[] = [];
  let windowEstimateLeaves = 0;
  let totalEstimateLeaves = 0;
  let windowAsks = 0;
  let dataBeforeWindow = false;
  const sinceIso = new Date(windowStartMs).toISOString();

  for (const l of leaves) {
    if (l.heapBytes <= 0) continue; // no pages, no rows — an unanalysed EMPTY leaf is 0, by construction
    const analysed = l.reltuples >= 0;
    const ranged = l.fromMs !== null && l.toMs !== null;
    const open = ranged && l.fromMs! <= nowMs && nowMs < l.toMs!;
    const daily = isDailyLeaf(l);

    // ── TOTAL ────────────────────────────────────────────────────────────────
    if (daily && open) {
      asks.push({ qname: l.qname, sinceIso: null }); // exact; may be shared with the window arm below
    } else if (analysed) {
      totalEstimateSum += l.reltuples;
      totalKind = worse(totalKind, 'estimate');
      totalEstimateLeaves += 1;
      if (open) totalNotes.push(`${l.qname} is still being written; its estimate is as of its last analyse (${l.analyzedAt ?? 'unknown'})`);
    } else {
      totalKind = worse(totalKind, 'lower_bound');
      totalNotes.push(`excludes ${l.qname} (holds data, never analysed)`);
    }

    // ── WINDOW ───────────────────────────────────────────────────────────────
    if (!ranged) {
      windowKind = worse(windowKind, 'lower_bound');
      windowNotes.push(`excludes ${l.qname} (no date range)`);
      continue;
    }
    if (l.fromMs! < windowStartMs) dataBeforeWindow = true; // some of this leaf's data predates the window
    if (l.toMs! <= windowStartMs) continue; // wholly before the window
    const boundary = l.fromMs! < windowStartMs;
    if (daily && (boundary || open)) {
      // exact: the open daily leaf whole (unless it is also the boundary), the boundary daily leaf from the window start
      if (boundary) asks.push({ qname: l.qname, sinceIso });
      windowAsks += 1;
      continue;
    }
    if (boundary) {
      // a NON-daily boundary leaf: its in-window slice counted exactly under the short bound (Langston's Step-4 fold).
      // If that count does not complete, assembleEstimate excludes the leaf and names it — a lower bound, never 0.
      asks.push({ qname: l.qname, sinceIso });
      windowAsks += 1;
      continue;
    }
    if (!analysed) {
      windowKind = worse(windowKind, 'lower_bound');
      windowNotes.push(`excludes ${l.qname} (holds data, never analysed)`);
      continue;
    }
    windowEstimateSum += l.reltuples;
    windowKind = worse(windowKind, 'estimate');
    windowEstimateLeaves += 1;
    if (open) windowNotes.push(`${l.qname} is still being written; its estimate is as of its last analyse (${l.analyzedAt ?? 'unknown'})`);
  }
  if (windowEstimateLeaves === 0 && windowAsks === 0) windowKind = 'unavailable';
  // Langston (Step-4 record, total-arm symmetry): when every partition holding data lies inside the window, the window
  // estimate IS the total — say so, or two identical "≈" figures read as the window arm having collapsed into the total.
  if (!dataBeforeWindow && windowKind === 'estimate') {
    windowNotes.push('every partition holding data lies inside this window, so it equals the total');
  }
  return { asks, windowEstimateSum, totalEstimateSum, windowKind, totalKind, windowNotes, totalNotes, windowEstimateLeaves, totalEstimateLeaves };
}

export interface EstimateResult {
  rowsInWindow: number;
  rowsInWindowKind: CountKind;
  totalRows: number;
  totalRowsKind: CountKind;
  countNote: string | null;
}

/**
 * Pure: fold the exact-count results into the plan. `exact` maps `${qname}|${sinceIso ?? ''}` to its count, or to
 * null when that count failed — a failed exact count EXCLUDES its leaf and makes the figure a lower bound (named).
 */
export function assembleEstimate(plan: EstimatePlan, exact: Map<string, number | null>): EstimateResult {
  let rowsInWindow = plan.windowEstimateSum;
  let totalRows = plan.totalEstimateSum;
  let windowKind: CountKind = plan.windowKind;
  let totalKind: CountKind = plan.totalKind;
  const windowNotes = [...plan.windowNotes];
  const totalNotes = [...plan.totalNotes];
  let windowContributed = plan.windowEstimateLeaves > 0;
  let totalContributed = plan.totalEstimateLeaves > 0; // the same rule as the window arm (Langston: total-arm symmetry)
  const boundaryLeaves = new Set(plan.asks.filter((a) => a.sinceIso !== null).map((a) => a.qname));

  for (const a of plan.asks) {
    const v = exact.get(`${a.qname}|${a.sinceIso ?? ''}`);
    const failed = v === null || v === undefined;
    if (a.sinceIso === null) {
      // the open daily leaf, counted whole: it serves the total, and the window unless it is also the boundary leaf
      if (failed) {
        totalKind = worse(totalKind, 'lower_bound');
        totalNotes.push(`excludes ${a.qname} (its exact count did not complete)`);
        if (!boundaryLeaves.has(a.qname)) {
          windowKind = worse(windowKind, 'lower_bound');
          windowNotes.push(`excludes ${a.qname} (its exact count did not complete)`);
        }
        continue;
      }
      totalRows += v!;
      totalContributed = true;
      if (!boundaryLeaves.has(a.qname)) { rowsInWindow += v!; windowContributed = true; }
    } else {
      if (failed) {
        windowKind = worse(windowKind, 'lower_bound');
        windowNotes.push(`excludes part of ${a.qname} (its exact count did not complete)`);
        continue;
      }
      rowsInWindow += v!;
      windowContributed = true;
    }
  }
  if (!windowContributed) windowKind = 'unavailable';
  if (!totalContributed) totalKind = 'unavailable'; // no leaf counted: never a confident 0 for the total either
  const notes = [
    ...windowNotes.map((n) => `rows in window: ${n}`),
    ...totalNotes.map((n) => `total: ${n}`),
  ];
  return {
    rowsInWindow: windowKind === 'unavailable' ? 0 : Math.round(rowsInWindow),
    rowsInWindowKind: windowKind,
    totalRows: totalKind === 'unavailable' ? 0 : Math.round(totalRows),
    totalRowsKind: totalKind,
    countNote: notes.length > 0 ? notes.join('; ') : null,
  };
}

/** One read per table: every leaf's estimate, heap size, range bound (epoch ms) and last analyse. */
export function leafInfoSql(table: string): string {
  return `SELECT c.oid::regclass::text AS qname,
       c.reltuples::float8 AS reltuples,
       pg_relation_size(c.oid)::bigint AS heap_bytes,
       (extract(epoch FROM substring(pg_get_expr(c.relpartbound, c.oid) FROM 'FROM \\(''([^'']+)''\\)')::timestamptz) * 1000)::float8 AS from_ms,
       (extract(epoch FROM substring(pg_get_expr(c.relpartbound, c.oid) FROM 'TO \\(''([^'']+)''\\)')::timestamptz) * 1000)::float8 AS to_ms,
       greatest(s.last_analyze, s.last_autoanalyze)::text AS analyzed_at
  FROM pg_partition_tree('${table}'::regclass) p
  JOIN pg_class c ON c.oid = p.relid
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
 WHERE p.isleaf`;
}

/** Postgres-quoted leaf names only: letters, digits, underscore, dot and double quotes. */
export const SAFE_QNAME = /^[A-Za-z0-9_."]+$/;

export function exactCountSql(a: ExactCountAsk): string {
  if (!SAFE_QNAME.test(a.qname)) throw new Error(`[archive-count-estimate] refusing unsafe leaf name ${a.qname}`);
  return a.sinceIso === null
    ? `SELECT count(*)::bigint AS n FROM ${a.qname}`
    : `SELECT count(*)::bigint AS n FROM ${a.qname} WHERE captured_at >= '${a.sinceIso}'`;
}

export function parseLeafRows(rows: Array<Record<string, unknown>>): LeafInfo[] {
  return rows.map((r) => ({
    qname: String(r.qname),
    reltuples: Number(r.reltuples),
    heapBytes: Number(r.heap_bytes),
    fromMs: r.from_ms === null || r.from_ms === undefined ? null : Number(r.from_ms),
    toMs: r.to_ms === null || r.to_ms === undefined ? null : Number(r.to_ms),
    analyzedAt: r.analyzed_at === null || r.analyzed_at === undefined ? null : String(r.analyzed_at),
  }));
}
