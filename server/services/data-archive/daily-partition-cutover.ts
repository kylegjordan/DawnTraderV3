/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-STORAGE-HARDEN Wave D (OBJ-3) — daily-partition cutover registry
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * `xstock_spot_ticker_snap` transitions from MONTHLY to DAILY RANGE partitions at
 * a MONTH-BOUNDARY cutover so the hot window can be reclaimed one DAY at a time
 * (a true rolling ~30 d) instead of one month at a time (monthly DROP can only
 * free whole months → up to ~60 d hot). This module is the SINGLE source of
 * truth for:
 *   - which tables are daily-partitioned, and
 *   - the UTC month-boundary date at/after which each table's partitions are DAILY.
 *
 * Consumed by BOTH partition creators so they never collide on the seam:
 *   - the DAILY creator (`b74-create-daily-partitions.ts`) makes `…_YYYY_MM_DD`
 *     children FROM the cutover forward;
 *   - the MONTHLY creator (`b74-create-monthly-partitions.ts`) EXCLUDES these
 *     tables for any month AT/AFTER the cutover, so a monthly `…_YYYY_MM` child
 *     is never created for a range the daily children own (an overlapping RANGE
 *     partition makes attach/insert fail — Langston Wave-D req #2).
 *
 * Transition-forward: months BEFORE the cutover stay monthly and age out under
 * the existing sweep; NO existing partition is repartitioned (the live ~63 GB
 * table is never rewritten). The cutover migration additionally drops any EMPTY
 * pre-created future monthly partitions at/after the cutover (the monthly
 * creator's 12-month look-ahead may already have made them).
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface DailyPartitionCutover {
  table: string;
  /** UTC month-boundary 'YYYY-MM-01'. Partitions are DAILY for days >= this. */
  cutoverDate: string;
}

export const DAILY_PARTITION_CUTOVERS: DailyPartitionCutover[] = [
  // Cutover = the first clean month-start after the Wave-D deploy (deploy
  // 2026-07-08 → cutover 2026-08-01). July-2026 + earlier stay monthly.
  { table: 'xstock_spot_ticker_snap', cutoverDate: '2026-08-01' },
];

/** The cutover Date (UTC midnight) for a table, or null if it is not daily-partitioned. */
export function cutoverForTable(table: string): Date | null {
  const row = DAILY_PARTITION_CUTOVERS.find((c) => c.table === table);
  return row ? new Date(`${row.cutoverDate}T00:00:00.000Z`) : null;
}

/**
 * True if `table` is daily-partitioned for the UTC month starting at `monthStart`
 * (i.e. `monthStart` is at/after the table's cutover). Drives the monthly
 * creator's exclusion so it never overlaps the daily children.
 */
export function isDailyPartitionedForMonth(table: string, monthStart: Date): boolean {
  const cutover = cutoverForTable(table);
  return cutover !== null && monthStart.getTime() >= cutover.getTime();
}
