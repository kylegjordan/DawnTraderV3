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
import { addAlert } from '../services/system-alerts.js';

const LOG_DIR = '/var/log/dawntrader';
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

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

async function main(): Promise<void> {
  const nowMs = Date.now();
  console.log(`[archival-health] started at ${new Date(nowMs).toISOString()}`);
  let allOk = true;
  for (const spec of CHECKS) {
    const ok = await runCheck(spec, nowMs);
    if (!ok) allOk = false;
  }
  console.log(`[archival-health] DONE — all_ok=${allOk} checks=${CHECKS.length}`);
  // Exit 0 regardless (alerts are the signal); non-zero would just noise the cron log.
}

main().catch((err) => {
  console.error('[archival-health] fatal:', err);
  process.exit(1);
});
