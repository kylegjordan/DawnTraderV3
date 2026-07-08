/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-STORAGE-HARDEN OBJ-5 — Archival-Health Watchdog
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Archival is now load-bearing against a fixed disk ceiling: if a retention/
 * rotation cron silently stops running, hot data piles up until the disk fills.
 * The sweeps already raise a §10.5 alert when they RUN and hit an error — but a
 * cron that never STARTS cannot alert on itself. This watchdog closes that gap.
 *
 * For each archival cron it checks:
 *   - STALE   — the log file's mtime is older than the cadence + grace (the cron
 *               didn't run when it should have), OR the tail has no completion
 *               line (a run started but never finished — crash/hang).
 *   - FAILED  — the last completion line reports failed>0.
 * Either fires a §10.5 alert (warning), deduped per-cron-per-reason.
 *
 * Disk-usage thresholds are NOT re-checked here — DatabaseMonitor owns that and
 * (as of B-STORAGE-HARDEN OBJ-5) wires warning/critical straight into §10.5.
 *
 * The B70 analytics sweep is intentionally SKIPPED while it is paused
 * (B-STORAGE-HARDEN Wave A). It is re-added to this watchdog when OBJ-2 re-enables
 * the B70 cron — do NOT remove that line silently.
 *
 * Cron line (root crontab on staging — daily 05:00 UTC, after the 02:xx sweeps):
 *   0 5 * * * su - deploy -c "cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b-storage-archival-health.ts" >> /var/log/dawntrader/archival-health.log 2>&1
 *
 * Reference: B_STORAGE_HARDEN_SCOPE.md OBJ-5 + B_STORAGE_HARDEN_PRE_AUDIT.md §3.4
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
import { addAlert } from '../services/system-alerts.js';
import {
  DAILY_PARTITION_CUTOVERS,
  cutoverForTable,
} from '../services/data-archive/daily-partition-cutover.js';

const LOG_DIR = '/var/log/dawntrader';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// B-STORAGE-HARDEN Wave D (OBJ-3, Langston Step-4 Finding-2): a daily-partitioned
// table needs its forward daily partitions provisioned ahead of the write head or
// inserts fail the day the pre-created runway runs out. This watchdog runs in a
// SEPARATE process from the daily creator (a dead creator cannot alert on itself),
// so it catches a stalled creator BEFORE the insert-failure cliff — fire when the
// furthest-provisioned daily partition is fewer than this many days ahead.
const MIN_RUNWAY_DAYS = 4;

interface CheckSpec {
  /** short stable id (used in the dedupe key) */
  name: string;
  /** human label for the alert body */
  label: string;
  /** log filename under LOG_DIR */
  logFile: string;
  /** how stale (ms) before STALE fires — cadence + grace */
  graceMs: number;
  /** regex whose FIRST capture group is the `failed` count on the completion line; null = staleness-only */
  donePattern: RegExp | null;
  /** when the log file is absent: 'skip' (not scheduled yet / bootstrapping) or 'alert' */
  onMissing: 'skip' | 'alert';
}

// NOTE: b70-retention.log is deliberately ABSENT while the B70 sweep is paused
// (Wave A). Re-add it at OBJ-2 when the B70 cron is re-enabled.
const CHECKS: CheckSpec[] = [
  {
    name: 'b75-retention',
    label: 'B75 hot→warm retention sweep (daily 02:15 UTC)',
    logFile: 'b75-retention.log',
    graceMs: 26 * HOUR_MS,
    donePattern: /DONE .*\bfailed=(\d+)\b.*\bplain_failed=(\d+)\b/,
    onMissing: 'alert',
  },
  {
    name: 'b75-cold-rotator',
    label: 'B75 warm→cold rotator (monthly, 1st 03:00 UTC)',
    logFile: 'b75-cold-rotator.log',
    graceMs: 33 * DAY_MS,
    donePattern: /DONE candidates=\d+ rotated=\d+ failed=(\d+)/,
    onMissing: 'skip', // first run is the OBJ-1 manual proof; monthly thereafter
  },
  {
    name: 'b75-cold-liveness',
    label: 'B75 cold-path liveness canary (weekly, Mon 04:00 UTC)',
    logFile: 'b75-cold-liveness.log',
    graceMs: 8 * DAY_MS,
    donePattern: null, // the canary self-alerts on failure; watchdog only catches "didn't run"
    onMissing: 'skip',
  },
];

async function fire(
  spec: CheckSpec,
  reason: 'stale' | 'failed' | 'missing' | 'incomplete',
  detail: string,
): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'health_check',
      severity: 'warning',
      title: `Archival cron ${reason.toUpperCase()}: ${spec.label}`,
      body:
        `The archival watchdog found a problem with "${spec.label}". ${detail} ` +
        `Archival is load-bearing against the fixed disk ceiling — a stopped or failing sweep lets hot ` +
        `data accumulate until the disk fills. Investigate the ${spec.logFile} cron on staging.`,
      metadata: {
        source: 'b-storage-archival-health',
        batch: 'B-STORAGE-HARDEN',
        check: spec.name,
        reason,
      },
      dedupe_key: `archival-health-${spec.name}-${reason}`,
    });
    console.log(`[archival-health] ALERT ${spec.name}/${reason}: ${detail}`);
  } catch (err) {
    console.error(`[archival-health] failed to raise alert for ${spec.name}:`, err);
  }
}

function tail(content: string, n: number): string[] {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  return lines.slice(Math.max(0, lines.length - n));
}

async function runCheck(spec: CheckSpec, nowMs: number): Promise<boolean> {
  const path = `${LOG_DIR}/${spec.logFile}`;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(path);
  } catch {
    if (spec.onMissing === 'alert') {
      await fire(spec, 'missing', `Its log file ${spec.logFile} does not exist — the cron has never produced output.`);
      return false;
    }
    console.log(`[archival-health] ${spec.name}: log absent (onMissing=skip) — OK`);
    return true;
  }

  const ageMs = nowMs - stat.mtimeMs;
  if (ageMs > spec.graceMs) {
    await fire(
      spec,
      'stale',
      `Its log has not been written for ${(ageMs / HOUR_MS).toFixed(1)}h (grace ${(spec.graceMs / HOUR_MS).toFixed(0)}h) — the cron likely did not run.`,
    );
    return false;
  }

  if (spec.donePattern) {
    const lines = tail(fs.readFileSync(path, 'utf-8'), 60);
    let doneLine: string | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (spec.donePattern.test(lines[i])) {
        doneLine = lines[i];
        break;
      }
    }
    if (!doneLine) {
      await fire(
        spec,
        'incomplete',
        `Its log was written recently but has no completion line in the last 60 lines — a run may have crashed or hung mid-sweep.`,
      );
      return false;
    }
    const m = spec.donePattern.exec(doneLine);
    // Sum every numeric capture group (b75-retention has failed + plain_failed).
    let failedTotal = 0;
    if (m) for (let g = 1; g < m.length; g++) failedTotal += Number(m[g] || 0);
    if (failedTotal > 0) {
      await fire(
        spec,
        'failed',
        `Its last run reported failed=${failedTotal}. Data was NOT dropped/lost (the sweep is fail-safe) but items did not archive: "${doneLine.trim()}".`,
      );
      return false;
    }
  }

  console.log(`[archival-health] ${spec.name}: OK (age ${(ageMs / HOUR_MS).toFixed(1)}h)`);
  return true;
}

/** Fire a §10.5 alert for a short/absent daily-partition runway (deduped per table). */
async function fireRunway(table: string, detail: string): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'health_check',
      severity: 'warning',
      title: `Daily-partition runway short: ${table}`,
      body:
        `The daily-partition creator (b74-create-daily-partitions.ts, cron 0 1 * * *) for "${table}" is not keeping ` +
        `enough forward daily partitions provisioned. ${detail} When the runway reaches 0, inserts into ${table} FAIL. ` +
        `Check the daily creator cron on staging and re-run it to self-heal forward coverage.`,
      metadata: {
        source: 'b-storage-archival-health',
        batch: 'B-STORAGE-HARDEN',
        check: 'daily-runway',
        table,
      },
      dedupe_key: `archival-health-daily-runway-${table}`,
    });
    console.log(`[archival-health] ALERT daily-runway/${table}: ${detail}`);
  } catch (err) {
    console.error(`[archival-health] failed to raise daily-runway alert for ${table}:`, err);
  }
}

/**
 * Daily-partition forward-coverage check (Langston Step-4 Finding-2). For each
 * daily-partitioned table that is AT/AFTER its cutover, find the furthest-forward
 * `…_YYYY_MM_DD` child and alert if it is fewer than MIN_RUNWAY_DAYS ahead of
 * today (or if NONE exist — creator never ran / migration missing). Pre-cutover
 * tables are skipped (their days are still monthly).
 */
async function checkDailyPartitionRunway(nowMs: number): Promise<boolean> {
  const now = new Date(nowMs);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!process.env.DATABASE_URL) {
    console.log('[archival-health] daily-runway: DATABASE_URL unset — skip');
    return true;
  }
  let ok = true;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    // connect INSIDE the try (Langston Step-4 addendum note): a DB-unreachable at
    // 05:00 must NOT throw uncaught out of this function and kill the whole
    // watchdog run — the log-file checks already ran, and a DB-down is
    // independently surfaced by DatabaseMonitor. Treat as inconclusive-OK, log it.
    await client.connect();
    for (const { table } of DAILY_PARTITION_CUTOVERS) {
      const cutover = cutoverForTable(table)!;
      if (today.getTime() < cutover.getTime()) {
        console.log(
          `[archival-health] daily-runway ${table}: pre-cutover (${cutover.toISOString().slice(0, 10)}) — skip`,
        );
        continue;
      }
      const r = await client.query(
        `SELECT child.relname AS child
           FROM pg_inherits
           JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
           JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
          WHERE parent.relname = $1
            AND child.relname ~ '_[0-9]{4}_[0-9]{2}_[0-9]{2}$'`,
        [table],
      );
      let maxDay: Date | null = null;
      for (const row of r.rows) {
        const m = /_(\d{4})_(\d{2})_(\d{2})$/.exec(row.child);
        if (!m) continue;
        const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        if (!maxDay || d.getTime() > maxDay.getTime()) maxDay = d;
      }
      if (!maxDay) {
        await fireRunway(
          table,
          `NO daily partitions exist at/after the ${cutover.toISOString().slice(0, 10)} cutover — the creator is not provisioning days.`,
        );
        ok = false;
        continue;
      }
      const daysAhead = Math.floor((maxDay.getTime() - today.getTime()) / DAY_MS);
      if (daysAhead < MIN_RUNWAY_DAYS) {
        await fireRunway(
          table,
          `the furthest-provisioned daily partition is only ${daysAhead} day(s) ahead (min ${MIN_RUNWAY_DAYS}).`,
        );
        ok = false;
      } else {
        console.log(`[archival-health] daily-runway ${table}: OK (${daysAhead} days ahead)`);
      }
    }
  } catch (err) {
    console.error('[archival-health] daily-runway check errored (DB unreachable?) — inconclusive, not crashing the watchdog:', err);
  } finally {
    await client.end().catch(() => {});
  }
  return ok;
}

async function main(): Promise<void> {
  const nowMs = Date.now();
  console.log(`[archival-health] started at ${new Date(nowMs).toISOString()}`);
  let allOk = true;
  for (const spec of CHECKS) {
    const ok = await runCheck(spec, nowMs);
    if (!ok) allOk = false;
  }
  // Wave D (OBJ-3): daily-partition forward-coverage check.
  const runwayOk = await checkDailyPartitionRunway(nowMs);
  if (!runwayOk) allOk = false;
  console.log(`[archival-health] DONE — all_ok=${allOk} checks=${CHECKS.length + 1}`);
  // Exit 0 regardless (alerts are the signal); non-zero would just noise the cron log.
}

main().catch((err) => {
  console.error('[archival-health] fatal:', err);
  process.exit(1);
});
