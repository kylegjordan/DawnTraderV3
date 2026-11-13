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
 *   - STALE   — the log file was not written at or after the cron's most recent
 *               scheduled fire (cadence-aware since B-DISK-FILE-TIERING amendment 1,
 *               `server/services/archival-cadence.ts`; it was a fixed grace).
 *   - NOT_STARTED — no run started at/after that fire: the last start line is older (a job that
 *               refused before printing it) or absent (amendment 2, AP-7).
 *   - INCOMPLETE — the last run started but has no completion line after its start.
 *   - FAILED  — the completion line AFTER the last start reports failed>0.
 *   - MISCONFIGURED — a check's in-repo schedule does not parse: it pages, never skips.
 *   - SCHEDULE_DRIFT / NOT_SCHEDULED — the root crontab disagrees with the in-repo schedule,
 *               or carries no active line for the job (read every run).
 * Each fires a §10.5 alert (warning), deduped per-cron-per-reason. archival-health never resolves
 * its own rows: a standing row suppresses a later one on the same key, so hand-resolve is the
 * only clearing instrument.
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
import { execFileSync } from 'node:child_process';
import { cadenceVerdict } from '../services/archival-cadence.js';
import { computePrevFire } from '../services/cron-next-fire.js';
import {
  ARCHIVAL_TAIL_CAP_BYTES,
  UNVERIFIED_MARKER,
  UNVERIFIED_PAGE_AFTER_RUNS,
  evaluateRun,
  normaliseSchedule,
  selectCrontabLine,
  tailText,
  unverifiedStreak,
} from '../services/archival-run-check.js';
import {
  DAILY_PARTITION_CUTOVERS,
  cutoverForTable,
} from '../services/data-archive/daily-partition-cutover.js';

// Step-7 plants (AP-7 plan item 7): three overrides, all unset in production — a log folder holding planted copies,
// a planted crontab file instead of `sudo -n crontab -l`, and a dry flag that logs each alert instead of raising it.
const LOG_DIR = process.env.ARCHIVAL_HEALTH_LOG_DIR || '/var/log/dawntrader';
const CRONTAB_FILE = process.env.ARCHIVAL_HEALTH_CRONTAB_FILE || '';
const DRY = process.env.ARCHIVAL_HEALTH_DRY === '1';

/** Every alert goes through here, so the dry flag cannot miss one. */
async function raise(input: Parameters<typeof addAlert>[0]): Promise<void> {
  if (DRY) {
    console.log(`[archival-health] DRY — would raise ${input.dedupe_key}: ${input.title}`);
    return;
  }
  await addAlert(input);
}
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
  /**
   * The subject cron's expression, UTC, copied from the `Cron line` in that script's header comment — a
   * test holds the two equal (a typo fence: two in-repo strings). Since amendment 2 (AP-7) every run ALSO reads
   * the root crontab (`sudo -n crontab -l` as deploy works — measured 2026-11-13) and compares this with the
   * job's active line: a mismatch pages `schedule_drift` and the run is graded on the BOX's expression (the box
   * decides when the job fires); no active line pages `not_scheduled`. That closes the silent direction the old
   * comment named (an expression here looser than the box's). If the crontab cannot be read, the run logs
   * `schedule_unverified`, grades on this string, and pages on the 3rd consecutive unverified run.
   */
  schedule: string;
  /** regex whose capture groups are the `failed` counts on the completion line (summed); null = staleness-only */
  donePattern: RegExp | null;
  /**
   * regex matching the subject's own start line; its FIRST capture group is the start's ISO timestamp. Required
   * whenever `donePattern` is set (AP-7): the DONE must follow a start at/after the scheduled fire.
   */
  startPattern: RegExp | null;
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
    schedule: '15 2 * * *',
    // three failure counters, all summed (Langston Step 4 F2): partitions, the plain lane, the snapshot lane
    donePattern: /DONE .*\bfailed=(\d+)\b.*\bplain_failed=(\d+)\b.*\bsnapshot_failed=(\d+)\b/,
    startPattern: /\[B75 sweep\] started at (\S+) run_id=/,
    onMissing: 'alert',
  },
  {
    name: 'b75-cold-rotator',
    label: 'B75 warm→cold rotator (monthly, 1st 03:00 UTC)',
    logFile: 'b75-cold-rotator.log',
    schedule: '0 3 1 * *',
    donePattern: /DONE candidates=\d+ rotated=\d+ failed=(\d+)/,
    startPattern: /\[B75 rotator\] started at (\S+) /,
    onMissing: 'skip', // first run is the OBJ-1 manual proof; monthly thereafter
  },
  {
    name: 'b75-cold-liveness',
    label: 'B75 cold-path liveness canary (weekly, Mon 04:00 UTC)',
    logFile: 'b75-cold-liveness.log',
    schedule: '0 4 * * 1',
    donePattern: null, // the canary self-alerts on failure; watchdog only catches "didn't run"
    startPattern: null,
    onMissing: 'skip',
  },
  {
    // B-DISK-FILE-TIERING (#1233, pre-audit P7): this IS the job's page (no second key). It was 'skip' until
    // its first good run; that run is recorded (2026-11-05 02:45-03:03Z: `DONE moved=1709 failed=0`, all 1,709
    // manifest rows warm/active with checksums, one day restored byte-exact), so it is now 'alert' (O1): a
    // missing log means the job never ran. (Stale and failed runs already page whenever the log exists.)
    // Its old 20 h grace (O1 CHANGE-1) is superseded by the cadence test: a missed 02:45Z is caught at the next 05:00Z.
    name: 'disk-file-tiering',
    label: 'Disk-file tiering — dated app data files to warm storage (daily 02:45 UTC)',
    logFile: 'disk-file-tiering.log',
    schedule: '45 2 * * *',
    donePattern: /DONE moved=\d+ failed=(\d+)/,
    startPattern: /\[disk-tiering\] (\S+) started run /,
    onMissing: 'alert',
  },
];

async function fire(
  spec: CheckSpec,
  reason:
    | 'stale' | 'failed' | 'missing' | 'incomplete' | 'misconfigured' | 'errored'
    | 'not_started' | 'schedule_drift' | 'not_scheduled',
  detail: string,
): Promise<void> {
  try {
    await raise({
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

/** One page for the whole run, on its own key (not per check): this watchdog could not read the root crontab. */
async function fireUnverified(runs: number, why: string): Promise<void> {
  try {
    await raise({
      triggers_at: new Date(),
      category: 'health_check',
      severity: 'warning',
      title: 'Archival watchdog cannot read the root crontab',
      body:
        `The archival watchdog could not read the root crontab (\`sudo -n crontab -l\` as deploy) on ${runs} consecutive ` +
        `runs (${why}). It still grades every archival cron on the schedules written in b-storage-archival-health.ts, ` +
        `but it can no longer tell whether the box runs them on those schedules. Restore the deploy user's read of the crontab.`,
      metadata: { source: 'b-storage-archival-health', batch: 'B-DISK-FILE-TIERING', check: 'crontab', reason: 'schedule_unverified', runs },
      dedupe_key: 'archival-health-crontab-schedule_unverified',
    });
    console.log(`[archival-health] ALERT crontab/schedule_unverified: ${runs} consecutive runs`);
  } catch (err) {
    console.error('[archival-health] failed to raise the schedule_unverified alert:', err);
  }
}

/** The root crontab as text, or why it could not be read. */
function readCrontab(): { text: string } | { text: null; why: string } {
  try {
    if (CRONTAB_FILE) return { text: fs.readFileSync(CRONTAB_FILE, 'utf-8') };
    return { text: execFileSync('sudo', ['-n', 'crontab', '-l'], { encoding: 'utf-8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (err) {
    // The reason sudo gives is on stderr ("sudo: a password is required"); message's first line only names the
    // command (Langston Step 4 F1), so the page carries both.
    const e = err as Error & { stderr?: string | Buffer };
    const head = String(e?.message ?? err).split('\n')[0];
    const cause = e?.stderr ? String(e.stderr).trim().split('\n')[0] : '';
    return { text: null, why: (cause ? `${head} — ${cause}` : head).slice(0, 200) };
  }
}

/** The root crontab, read once per run in main() (AP-7); null = unreadable (`schedule_unverified`). */
let CRONTAB: string | null = null;

/** The last `min(size, maxBytes)` of a file as text, in one pass (C-4); '' when the file is absent. */
function readTail(path: string, maxBytes: number = ARCHIVAL_TAIL_CAP_BYTES): string {
  let fd: number;
  try {
    fd = fs.openSync(path, 'r');
  } catch {
    return '';
  }
  try {
    const size = fs.fstatSync(fd).size;
    const n = Math.min(size, maxBytes);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    return tailText(buf, size);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The expression this run grades the check on (AP-7 r3 B2): the box's when it disagrees with the in-repo one (the
 * box decides when the job fires), the in-repo one otherwise. Each disagreement pages on its own key.
 */
async function effectiveSchedule(spec: CheckSpec): Promise<string> {
  if (CRONTAB === null) return spec.schedule;
  const sel = selectCrontabLine(CRONTAB, spec.logFile);
  if (sel.kind === 'none') {
    await fire(
      spec,
      'not_scheduled',
      `The root crontab has no active line appending to ${spec.logFile} (commented-out lines are ignored) — the job is not scheduled on the box. Graded on the in-repo schedule "${spec.schedule}".`,
    );
    return spec.schedule;
  }
  if (sel.kind === 'many') {
    await fire(
      spec,
      'schedule_drift',
      `The root crontab has ${sel.lines.length} active lines appending to ${spec.logFile}: ${sel.lines.map((l) => `"${l.slice(0, 160)}"`).join('; ')}. Graded on the in-repo schedule "${spec.schedule}".`,
    );
    return spec.schedule;
  }
  if (computePrevFire(sel.schedule, 'UTC', new Date()) === null) {
    await fire(
      spec,
      'schedule_drift',
      `The root crontab's expression "${sel.schedule}" for ${spec.logFile} does not parse. Graded on the in-repo schedule "${spec.schedule}".`,
    );
    return spec.schedule;
  }
  if (normaliseSchedule(sel.schedule) !== normaliseSchedule(spec.schedule)) {
    await fire(
      spec,
      'schedule_drift',
      `The root crontab runs it at "${sel.schedule}" UTC but b-storage-archival-health.ts says "${spec.schedule}". Graded on the crontab's expression (the box decides when it fires); fix whichever is wrong.`,
    );
    return sel.schedule;
  }
  return spec.schedule;
}

async function runCheck(spec: CheckSpec, nowMs: number): Promise<boolean> {
  const path = `${LOG_DIR}/${spec.logFile}`;
  const schedule = await effectiveSchedule(spec);
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
  const cadence = cadenceVerdict(schedule, stat.mtimeMs, nowMs);
  if (cadence.kind === 'misconfigured') {
    await fire(
      spec,
      'misconfigured',
      `Its schedule "${schedule}" does not parse, so this watchdog cannot tell whether the cron ran — fix the schedule in b-storage-archival-health.ts.`,
    );
    return false;
  }
  if (cadence.kind === 'stale') {
    await fire(
      spec,
      'stale',
      `Its log was last written ${(ageMs / HOUR_MS).toFixed(1)}h ago, before its scheduled run at ${new Date(cadence.dueMs).toISOString()} (cron "${schedule}" UTC) — the cron did not run.`,
    );
    return false;
  }

  if (spec.donePattern) {
    if (!spec.startPattern) {
      await fire(spec, 'misconfigured', `It has a completion pattern but no start pattern, so a run cannot be tied to its own start (AP-7).`);
      return false;
    }
    // AP-7: the LAST start must be at/after the scheduled fire and a DONE must follow it; failures come from that DONE.
    const verdict = evaluateRun({
      live: readTail(path),
      rotated: readTail(`${path}.1`),
      startPattern: spec.startPattern,
      donePattern: spec.donePattern,
      dueMs: cadence.dueMs,
    });
    if (verdict.kind === 'not_started') {
      await fire(
        spec,
        'not_started',
        `No run started at or after its scheduled time ${verdict.dueIso} (cron "${schedule}" UTC): ${verdict.lastStartIso ? `the last start was ${verdict.lastStartIso}` : `no start line in ${spec.logFile} or its .1`}. The log's last line: "${verdict.lastLine.trim().slice(0, 300)}".`,
      );
      return false;
    }
    if (verdict.kind === 'incomplete') {
      await fire(
        spec,
        'incomplete',
        `Its run that started at ${verdict.startIso} has no completion line after its start — it crashed or is still hung. The log's last line: "${verdict.lastLine.trim().slice(0, 300)}".`,
      );
      return false;
    }
    if (verdict.failedTotal > 0) {
      await fire(
        spec,
        'failed',
        `Its last run reported failed=${verdict.failedTotal}. Data was NOT dropped/lost (the sweep is fail-safe) but items did not archive: "${verdict.doneLine.trim()}".`,
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
    await raise({
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
  const startIso = new Date(nowMs).toISOString();
  console.log(`[archival-health] started at ${startIso}`);
  let allOk = true;
  // AP-7: read the root crontab once; every check compares its schedule with the box's line.
  const crontab = readCrontab();
  CRONTAB = crontab.text;
  if (crontab.text === null) {
    // Logged every run; pages on the 3rd consecutive (Langston r2 (b)) — counted from this script's own log and its .1
    // (C-r4-1), excluding this run, whose own lines are already in the file.
    console.log(`${UNVERIFIED_MARKER} ${crontab.why}`);
    const previous = unverifiedStreak({
      live: readTail(`${LOG_DIR}/archival-health.log`, 16 * 1024),
      rotated: readTail(`${LOG_DIR}/archival-health.log.1`, 16 * 1024),
      currentStartIso: startIso,
    });
    if (previous + 1 >= UNVERIFIED_PAGE_AFTER_RUNS) await fireUnverified(previous + 1, crontab.why);
  }
  for (const spec of CHECKS) {
    // One check's throw must not end the run for the others (Langston C-2): it pages as its own reason.
    let ok = false;
    try {
      ok = await runCheck(spec, nowMs);
    } catch (err) {
      await fire(spec, 'errored', `The check itself threw: ${String((err as Error)?.message ?? err).slice(0, 300)}.`);
    }
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
