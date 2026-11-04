/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-DISK-FILE-TIERING (#1233, pre-audit P6) — the Drift Dashboard can tell "moved to
 * warm storage" from "no data".
 *
 * The dashboard's telemetry reader (`streamTelemetryLines`, drift-dashboard-aggregator.ts)
 * lists the folder and reads what is PRESENT; it never selects a day, so a day the daily
 * disk-file job has moved is simply missing from its list and the numbers are computed
 * without it, silently (Langston Step 2 B3). This check derives the EXPECTED day set from
 * the window bounds, subtracts the days on disk, and asks the manifest about the rest:
 * a day that is expected, in the manifest and not on disk raises one alert per window.
 *
 * Today only `cohort_latest` can reach past the 35-day hot window (its start is the app's
 * own start time), and only once the app has run about 34 days without a restart.
 * Inside the hot window nothing is missing and NO query runs.
 *
 * Fire-and-forget from the (synchronous) dashboard computation; throttled; never throws
 * into the request. The alert resolves itself, in-process, when a later check of the
 * same window finds no moved day (transport `engine`, actor `drift-dashboard-moved-day`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { addAlert, resolveAlertsByDedupeKey } from '../system-alerts.js';

const DAY_MS = 86_400_000;
export const TELEMETRY_SOURCE_TABLE = 'disk_file.phase15b_dbs_telemetry';
export const MOVED_DAY_ACTOR = 'drift-dashboard-moved-day';
const THROTTLE_MS = 10 * 60 * 1000;
const lastCheck = new Map<string, number>();

/** The file names (`YYYY-MM-DD.jsonl`) the window [startMs, endMs] would select — the same day
 *  arithmetic as the reader's filter (a day is kept when dayStart + 1 day >= startMs and
 *  dayStart <= endMs). */
export function expectedDayFiles(startMs: number, endMs: number): string[] {
  const out: string[] = [];
  for (let day = Math.floor(startMs / DAY_MS) * DAY_MS; day <= endMs; day += DAY_MS) {
    if (day + DAY_MS < startMs) continue;
    out.push(`${new Date(day).toISOString().slice(0, 10)}.jsonl`);
  }
  return out;
}

/** Expected names that are not on disk. */
export function missingFromDisk(expected: string[], present: Iterable<string>): string[] {
  const have = new Set(present);
  return expected.filter((n) => !have.has(n));
}

export function movedDayKey(window: string): string {
  return `disk-tiering-moved-day:phase15b_dbs_telemetry:${window}`;
}

/** Called by computeDriftDashboard; returns at once. */
export function checkMovedTelemetryDays(telemetryDir: string, window: string, startMs: number, endMs: number): void {
  const now = Date.now();
  if (now - (lastCheck.get(window) ?? 0) < THROTTLE_MS) return;
  lastCheck.set(window, now);
  void runCheck(telemetryDir, window, startMs, endMs).catch((err) => {
    console.error(`[moved-day-check] ${window}: check failed (dashboard unaffected): ${err instanceof Error ? err.message : String(err)}`);
  });
}

async function runCheck(telemetryDir: string, window: string, startMs: number, endMs: number): Promise<void> {
  const present = fs.existsSync(telemetryDir) ? fs.readdirSync(telemetryDir) : [];
  const missing = missingFromDisk(expectedDayFiles(startMs, endMs), present);
  const key = movedDayKey(window);
  let moved: string[] = [];
  if (missing.length > 0) {
    const res: any = await db.execute(sql`
      SELECT partition_label FROM data_archive_manifest
       WHERE source_table = ${TELEMETRY_SOURCE_TABLE}
         AND state IN ('verified', 'active', 'migrating', 'migrated')
         AND partition_label = ANY(${missing})`);
    const rows: Array<{ partition_label: string }> = res?.rows ?? res ?? [];
    moved = [...new Set(rows.map((r) => r.partition_label))].sort();
  }
  if (moved.length === 0) {
    // Nothing moved inside this window: clear an earlier alert for it, if one is open.
    const checkId = crypto.randomUUID();
    const resolved = await resolveAlertsByDedupeKey(key, MOVED_DAY_ACTOR,
      `moved-day check ${checkId}: window ${window} re-checked at ${new Date().toISOString()}, no moved day inside it`,
      'engine');
    if (resolved.length > 0) console.log(`[moved-day-check] ${checkId} ${window}: resolved ${resolved.join(', ')}`);
    return;
  }
  const from = moved[0].slice(0, 10);
  const to = moved[moved.length - 1].slice(0, 10);
  await addAlert({
    triggers_at: new Date(),
    category: 'health_check',
    severity: 'warning',
    title: `Drift Dashboard ${window}: ${moved.length} day(s) of regime telemetry are in warm storage, not on disk`,
    body: `The Drift Dashboard's ${window} window covers ${moved.length} day(s) whose regime telemetry the daily disk-file job moved to warm storage (${from} to ${to}). The dashboard's regime numbers for this window are computed WITHOUT those days. To read them, restore the files: npx tsx server/scripts/b75-rehydrate.ts --table ${TELEMETRY_SOURCE_TABLE} --disk-file --from ${from} --to ${to} --out <dir>. This resolves itself when the window no longer reaches a moved day (B-DISK-FILE-TIERING #1233).`,
    metadata: { source: 'moved-day-check', window, moved, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() },
    dedupe_key: key,
  });
}
