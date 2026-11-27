#!/usr/bin/env node
/**
 * B-STAGING-LIVENESS-WATCH (#512/#520) — the out-of-process staging watchdog.
 *
 * Runs from a systemd timer (User=deploy, every 5 min), PLAIN NODE by design:
 * shares only build-independent file primitives; runs even when the app build is broken —
 * the exact #512 scenario it exists to catch.
 *
 * Checks (each with a 2-consecutive-tick debounce, state persisted on disk):
 *   http    — GET APP_URL responds (<500)
 *   pm2     — `pm2 jlist` reports the app process online
 *   engine  — GET /api/health/liveness: engineExpected && !engineRunning is the
 *             silent-halt signature (#520). Only meaningful when http is OK.
 *   disk-warning / disk-critical — the SERVER's own `/` (B-DISK-FILE-TIERING #1233): nothing
 *             else on staging watches it; the database's disk-utilization-* alerts are Supabase.
 *   archival-health-ran — the archive watchdog (b-storage-archival-health.ts, root cron 0 5 * * *) both
 *             STARTED and FINISHED since its last scheduled 05:00Z (B-DISK-FILE-TIERING amendment 1, H-2):
 *             it watches the archive crons and nothing watched it.
 *
 * An occurrence is stored before either the CLI or the plain-Node fallback
 * commits its UUID to the shared ledger. A passing check saves a recovery
 * against the observed occurrence independently of ledger contention. The
 * CLI may clear its exact row after successful notification or a verified
 * terminal operator disposition. A qualified relapse keeps its own UUID.
 *
 * Detection-only: this script never restarts anything.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  commitWatchdogAttempt, enqueueWatchdogAlert, hasWatchdogReceipt,
  listPendingWatchdogKeys, readWatchdogHead, readWatchdogLastRecovery, recordWatchdogRecovery,
} from '../services/watchdog-alert-store.mjs';

const pExecFile = promisify(execFile);

const APP_URL = process.env.WATCHDOG_APP_URL || 'http://localhost:5000/';
const LIVENESS_URL = process.env.WATCHDOG_LIVENESS_URL || 'http://localhost:5000/api/health/liveness';
const APP_DIR = process.env.WATCHDOG_APP_DIR || '/home/deploy/dawntrader';
const ALERTS_FILE = process.env.SYSTEM_ALERTS_FILE || '/var/log/dawntrader/system-alerts.jsonl';
const STATE_FILE = process.env.WATCHDOG_STATE_FILE || '/home/deploy/.dawntrader-watchdog-state.json';
const PM2_APP_NAME = process.env.WATCHDOG_PM2_NAME || 'dawntrader';
const DEBOUNCE_TICKS = 2; // 2 × 5min — matches the pre-audit; safe post-#520 (resume completes in seconds)
const RUN_ID = crypto.randomUUID(); // logged at start; a resolve's evidence cites it (a re-derivable token)
// Server-disk thresholds (B-DISK-FILE-TIERING P7). Environment-overridable ONLY so the arming can be
// FORCED in a one-off run (Langston C1) — the watchdog has no database dependency.
const DISK_PATH = process.env.WATCHDOG_DISK_PATH || '/';
/** An override that is set must be a real number — a typo throws at load instead of silently comparing
 *  against NaN. The service unit sets no WATCHDOG_* variable, so in practice an override comes from a
 *  hand-run, where the operator sees the throw. (If one were ever added to the unit with a typo, the
 *  OnFailure self-fail run loads this same module and would throw too — no page, only journald and the
 *  weekly heartbeat's absence. Langston part 2 r2, record 2.) */
export function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`${name}=${JSON.stringify(raw)} is not a number`);
  return v;
}
/** True when any disk threshold is overridden — the forced arming run (Langston C1). Every row it
 *  mints says so, so a test page can never be read as a real one. */
const DISK_FORCED = ['WATCHDOG_DISK_PATH', 'WATCHDOG_DISK_WARN_PCT', 'WATCHDOG_DISK_CRIT_PCT', 'WATCHDOG_DISK_CRIT_FREE_BYTES']
  .some((k) => process.env[k] !== undefined && process.env[k] !== '');
const DISK_WARN_PCT = envNumber('WATCHDOG_DISK_WARN_PCT', 85);
const DISK_CRIT_PCT = envNumber('WATCHDOG_DISK_CRIT_PCT', 90);
// A level alert clears only below a margin under its line, so a disk hovering at the line keeps ONE
// long-lived row. Its re-surface count climbs on the dispatcher's TIME clock (computeResurfaceStale,
// escalating to Kyle at count >= 1); a resolve-then-remint would start a fresh row at count 0 and never
// get there (Langston Step 4 part 2, C3 — a dedupe hit itself writes nothing).
const DISK_CLEAR_MARGIN_PCT = 2;
// Critical also fires on an absolute floor (Langston Step 2 C4). On this 75 GB volume 90 % leaves about
// 7.5 GB, under the 8 GiB floor, so the FLOOR binds first and DISK_CRIT_PCT is inert here — tuning the
// percentage will move nothing. Runway at the floor, measured 2026-11-04: about 12 h at the day's average
// stdout rate (0.67 GiB/h), about 2.25 h at the observed peak (3.4 GiB/h); the 2-tick debounce costs 10 min.
const DISK_CRIT_FREE_BYTES = envNumber('WATCHDOG_DISK_CRIT_FREE_BYTES', 8 * 1024 ** 3);
const DISK_CLEAR_FREE_BYTES = DISK_CRIT_FREE_BYTES + 1024 ** 3;
const DISK_T = { warnPct: DISK_WARN_PCT, critPct: DISK_CRIT_PCT, critFreeBytes: DISK_CRIT_FREE_BYTES,
  clearMarginPct: DISK_CLEAR_MARGIN_PCT, clearFreeBytes: DISK_CLEAR_FREE_BYTES };

/** The disk band, pure (Langston part 2 r2, record 5 — pinned by tests): ok = not over the line;
 *  clear = far enough under it to resolve an open row. */
export function diskBand(d, t) {
  return {
    warnOk: d.usedPct < t.warnPct,
    warnClear: d.usedPct < t.warnPct - t.clearMarginPct,
    critOk: d.usedPct < t.critPct && d.freeBytes >= t.critFreeBytes,
    critClear: d.usedPct < t.critPct - t.clearMarginPct && d.freeBytes >= t.clearFreeBytes,
  };
}

/** A throw counts toward debounce. A check that ran without throwing resets the counter. */
export function throwStep(prevCount, threw, debounce) {
  if (!threw) return { count: 0, page: false };
  const count = (prevCount || 0) + 1;
  return { count, page: count >= debounce };
}

/**
 * Builds a fallback alert row shaped EXACTLY like system-alerts.ts addAlert()
 * output (schema_version 1). CI pins this shape against a real addAlert row —
 * see server/tests/unit/b-staging-liveness-watch.test.ts. Do not add/remove
 * fields here without that test in the same diff.
 */
export function buildFallbackAlert({ title, body, dedupeKey, metadata, severity = 'critical', category = 'breakage' }) {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    id: crypto.randomUUID(),
    created_at: now,
    triggers_at: now,
    fired_at: null,
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    resolved_by_claimed: null,
    resolved_by_transport: null,
    resolution_evidence: null,
    state: 'scheduled',
    category,
    severity,
    title,
    body,
    metadata: { ...metadata, source: 'staging-liveness-watchdog', emit_path: 'fallback_atomic' },
    recurrence_interval_seconds: null,
    dedupe_key: dedupeKey,
  };
}

/** Read the open ledger rows so a healthy check can recover a pre-rollout alert. */
export function openAlertRows(alertsFilePath) {
  // Each alert's LAST line wins (a row may be rewritten); a key is open if ANY of its alerts is unresolved
  // — the same rule addAlert's dedupe applies, so this never reads closed while the store still blocks.
  const latest = new Map();
  if (fs.existsSync(alertsFilePath)) {
    for (const line of fs.readFileSync(alertsFilePath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const row = JSON.parse(line); if (row.id) latest.set(row.id, row); } catch { /* torn line */ }
    }
  }
  const open = new Map();
  for (const row of latest.values()) {
    if (row.dedupe_key && row.state !== 'resolved' && !open.has(row.dedupe_key)) open.set(row.dedupe_key, row);
  }
  return open;
}

/** The JSON object the CLI printed, after npm's own preamble lines; null if there is none. */
export function cliJson(stdout) {
  const out = String(stdout || '');
  const start = out.startsWith('{') ? 0 : out.indexOf('\n{') + 1;
  if (start === 0 && !out.startsWith('{')) return null;
  try { return JSON.parse(out.slice(start)); } catch { return null; }
}

function queueAlert(options) {
  return enqueueWatchdogAlert(ALERTS_FILE, buildFallbackAlert(options));
}

function log(msg) {
  console.log(`[WATCHDOG] ${new Date().toISOString()} ${msg}`);
}

function recordRecovery(key, reading, oldRow) {
  return recordWatchdogRecovery(ALERTS_FILE, key, `watchdog run ${RUN_ID}: ${key} condition cleared (${reading})`, oldRow);
}

async function previousFailureCount(state, counters, check, dedupeKey) {
  const recovery = await readWatchdogLastRecovery(ALERTS_FILE, dedupeKey);
  if (recovery && state.recoverySeen[dedupeKey] !== recovery) {
    state.recoverySeen[dedupeKey] = recovery;
    return 0;
  }
  return counters[check] || 0;
}

async function watchdogCli(command, key, id, timeout) {
  const { stdout } = await pExecFile('npm', ['run', 'system-alerts', '--', `watchdog-${command}`,
    '--dedupe-key', key, '--id', id,
  ], { cwd: APP_DIR, timeout, env: { ...process.env, SYSTEM_ALERTS_FILE: path.resolve(ALERTS_FILE) } });
  const result = cliJson(stdout);
  if (!result || !Object.hasOwn(result, 'row') || (result.row && result.row.dedupe_key !== key)) {
    throw new Error(`Unverified watchdog CLI result for ${key}`);
  }
  return result.row;
}

async function retryPending(preferredKey) {
  const keys = await listPendingWatchdogKeys(ALERTS_FILE);
  if (preferredKey && keys.includes(preferredKey)) {
    keys.splice(keys.indexOf(preferredKey), 1);
    keys.unshift(preferredKey);
  }
  // Allow one slow primary call per run so one hung CLI cannot starve every
  // key's plain-Node retry. Recoveries use a shorter, independently bounded CLI.
  let primaryAvailable = true;
  for (const key of keys) {
    try {
      // Closing an old terminal row can make its immediate successor eligible.
      for (let pass = 0; pass < 2; pass++) {
        const head = await readWatchdogHead(ALERTS_FILE, key);
        if (!head) break;
        const id = head.row.id;
        let row;
        if (!head.matchedId && primaryAvailable) {
          primaryAvailable = false;
          try {
            row = await watchdogCli('commit', key, id, 60_000);
          } catch (error) {
            log(`CLI commit failed for ${key} attempt ${id}: ${error?.message?.slice(0, 200)}`);
          }
        }
        row ??= await commitWatchdogAttempt(ALERTS_FILE, key, id, 'fallback_atomic');
        if (row && !head.matchedId) log(`${key} attempt ${id} matched ledger row ${row.id} (${row.metadata?.emit_path ?? 'existing'})`);
        if (row && row.state !== 'resolved' && head.recovery && hasWatchdogReceipt(row)) {
          const closed = await watchdogCli('recover', key, id, 8_000);
          if (closed) log(`${key} attempt ${id} resolved ledger row ${closed.id}`);
        }
        if ((await readWatchdogHead(ALERTS_FILE, key))?.row.id === id) break;
      }
    } catch (error) {
      log(`Watchdog attempt for ${key} still pending: ${error?.message?.slice(0, 200)}`);
    }
  }
}

/** One `/` reading per run, shared by both disk checks (Langston r3 (b): one cached read, one latch each).
 *  Use% is df's: used / (used + available to unprivileged users). */
let diskReading = null;
export function diskUsage(statfs) {
  const used = (Number(statfs.blocks) - Number(statfs.bfree)) * Number(statfs.bsize);
  const avail = Number(statfs.bavail) * Number(statfs.bsize);
  return { usedPct: (used / (used + avail)) * 100, freeBytes: avail };
}
function readDisk() {
  if (!diskReading) diskReading = diskUsage(fs.statfsSync(DISK_PATH));
  return diskReading;
}
function diskText() {
  const d = readDisk();
  return `${DISK_PATH} ${d.usedPct.toFixed(1)}% used, ${(d.freeBytes / 1024 ** 3).toFixed(2)} GiB free`;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { streaks: {} }; }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

async function checkHttp() {
  try {
    const res = await fetch(APP_URL, { signal: AbortSignal.timeout(10_000) });
    return res.status < 500;
  } catch { return false; }
}

async function checkPm2() {
  try {
    const { stdout } = await pExecFile('pm2', ['jlist'], { timeout: 30_000 });
    const list = JSON.parse(stdout);
    return list.some((p) => p.name === PM2_APP_NAME && p.pm2_env?.status === 'online');
  } catch { return false; }
}

async function checkEngine() {
  // Only meaningful when the app answers; returns null (skip) when unreachable.
  try {
    const res = await fetch(LIVENESS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const j = await res.json();
    // The silent-halt signature: expected to run, not running.
    return !(j.engineExpected === true && j.engineRunning === false);
  } catch { return null; }
}

// ── B-DISK-FILE-TIERING amendment 1 (H-2, AP-3): the watcher of the archive watchdog. ──────────────────
// Its cron: `0 5 * * *` (root crontab; the Cron line at b-storage-archival-health.ts header — a test holds the two
// equal). Plain arithmetic, not cron-parser: this file imports nothing from the app or its packages by design.
// It reads the log's CONTENT, not its mtime (Langston C-1): the mtime advances on the start line, on a
// top-level `fatal:` write, on partial output before a hang, and on a logrotate `create` — none of which is a
// completed run. So: the LAST `started at <ISO>` line must be at or after the due fire, and a `DONE — all_ok=`
// line must follow it. A missing log is a FAIL (it pages), never a skip: "the log I watch is gone" IS the
// condition. The 30 min offset is slack around a ~0.4 s run, not a measurement; the DONE read is what detects.
const ARCHIVAL_HEALTH_LOG = process.env.WATCHDOG_ARCHIVAL_HEALTH_LOG || '/var/log/dawntrader/archival-health.log';
export const ARCHIVAL_HEALTH_FIRE_UTC = { hour: 5, minute: 0 };
const ARCHIVAL_HEALTH_OFFSET_MS = 30 * 60 * 1000;

/** The most recent daily HH:MM UTC fire at or before `atMs`. Pure. */
export function prevDailyFireUtcMs(atMs, hour, minute) {
  const d = new Date(atMs);
  let fire = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute, 0, 0);
  if (fire > atMs) fire -= 24 * 60 * 60 * 1000;
  return fire;
}

/** Did the archive watchdog start at/after its due fire AND finish? Pure, for tests. */
export function archivalHealthRan(text, nowMs) {
  const dueMs = prevDailyFireUtcMs(nowMs - ARCHIVAL_HEALTH_OFFSET_MS, ARCHIVAL_HEALTH_FIRE_UTC.hour, ARCHIVAL_HEALTH_FIRE_UTC.minute);
  const lines = String(text).split('\n');
  let startIdx = -1;
  let startMs = NaN;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /\[archival-health\] started at (\S+)/.exec(lines[i]);
    if (m) { startIdx = i; startMs = Date.parse(m[1]); break; }
  }
  if (startIdx < 0 || !Number.isFinite(startMs)) return { ok: false, dueMs, why: 'no start line' };
  if (startMs < dueMs) return { ok: false, dueMs, why: `last start ${new Date(startMs).toISOString()} is before the due run` };
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/\[archival-health\] DONE — all_ok=/.test(lines[i])) return { ok: true, dueMs, why: 'started and finished' };
  }
  return { ok: false, dueMs, why: `started ${new Date(startMs).toISOString()} with no DONE line after it (crash or hang)` };
}

let archivalReading = null;
async function checkArchivalHealthRan() {
  let text;
  try {
    text = fs.readFileSync(ARCHIVAL_HEALTH_LOG, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') { archivalReading = `${ARCHIVAL_HEALTH_LOG} is missing`; return false; }
    throw err; // unreadable for another reason: the throw path pages after DEBOUNCE_TICKS
  }
  const r = archivalHealthRan(text, Date.now());
  archivalReading = `${r.why}; due ${new Date(r.dueMs).toISOString()}`;
  return r.ok;
}

const CHECKS = [
  {
    key: 'http', run: checkHttp,
    title: 'STAGING DOWN — app not responding',
    body: `The staging app at ${APP_URL} has failed the HTTP check ${DEBOUNCE_TICKS} consecutive ticks (~10 min). The system-alerts dispatcher lives inside the app, so this alert came from the out-of-process watchdog. Investigate + restart; see the deploy runbook.`,
  },
  {
    key: 'pm2', run: checkPm2,
    title: 'STAGING DOWN — pm2 process not online',
    body: `pm2 does not report '${PM2_APP_NAME}' online (${DEBOUNCE_TICKS} consecutive ticks). Out-of-process watchdog detection.`,
  },
  {
    key: 'engine', run: checkEngine,
    title: 'ENGINE HALTED — expected running, not running',
    body: `The active engine is expected to be running (isEngineActive=true) but the process reports it stopped, ${DEBOUNCE_TICKS} consecutive ticks. This is the #520 silent-halt signature — post-fix it should not occur; investigate the session table + resume path. Detection-only: the watchdog restarts nothing.`,
  },
  {
    // B-DISK-FILE-TIERING P7 — the server's OWN disk. A level alert: it stays unresolved while the disk
    // is over the line (do NOT ack it — an ack silences the key that notices a drain not happening)
    // and resolves itself here once usage is back under the threshold.
    key: 'disk-warning', run: async () => diskBand(readDisk(), DISK_T).warnOk,
    clear: () => diskBand(readDisk(), DISK_T).warnClear,
    dedupeKey: 'server-disk-utilization-warning', category: 'health_check', severity: 'warning',
    reading: diskText, forced: DISK_FORCED,
    title: `${DISK_FORCED ? '[FORCED TEST] ' : ''}Server disk WARNING: staging ${DISK_PATH} over ${DISK_WARN_PCT}%`,
    body: () => `The staging server's own disk is at ${diskText()} (warning at ${DISK_WARN_PCT}%), ${DEBOUNCE_TICKS} consecutive ticks. This is the SERVER disk, not the Supabase database (that is disk-utilization-*). Where the space is: run du -sh on /var/log/dawntrader, /home/deploy/dawntrader/logs/* and /home/deploy/dawntrader/diagnostic-reports; the nightly disk-file tiering job (server/scripts/b-disk-file-tiering.ts, 02:45 UTC) moves old data files off this disk, and once it has run its log is /var/log/dawntrader/disk-file-tiering.log. Also /var/lib/token-watch (the token-launch study's store): du needs root there (as deploy it under-reads about 5x); its own token-watch store alert carries the true figure. Resolves itself when usage falls under ${DISK_WARN_PCT - DISK_CLEAR_MARGIN_PCT}%.`,
  },
  {
    key: 'disk-critical', run: async () => diskBand(readDisk(), DISK_T).critOk,
    clear: () => diskBand(readDisk(), DISK_T).critClear,
    dedupeKey: 'server-disk-utilization-critical', category: 'health_check', severity: 'critical',
    reading: diskText, forced: DISK_FORCED,
    title: `${DISK_FORCED ? '[FORCED TEST] ' : ''}Server disk CRITICAL: staging ${DISK_PATH} over ${DISK_CRIT_PCT}% or under ${(DISK_CRIT_FREE_BYTES / 1024 ** 3).toFixed(0)} GiB free`,
    body: () => `The staging server's own disk is at ${diskText()}, ${DEBOUNCE_TICKS} consecutive ticks — at the measured write rate that is hours of runway, not days. If the disk fills, the app cannot log and the archive jobs cannot stage files. Where the space is: run du -sh on /var/log/dawntrader, /home/deploy/dawntrader/logs/* and /home/deploy/dawntrader/diagnostic-reports; the nightly disk-file tiering job (server/scripts/b-disk-file-tiering.ts, 02:45 UTC) moves old data files off this disk, and once it has run its log is /var/log/dawntrader/disk-file-tiering.log. Also /var/lib/token-watch (the token-launch study's store): du needs root there (as deploy it under-reads about 5x); its own token-watch store alert carries the true figure. Resolves itself when usage is back under ${DISK_CRIT_PCT - DISK_CLEAR_MARGIN_PCT}% with at least ${(DISK_CLEAR_FREE_BYTES / 1024 ** 3).toFixed(0)} GiB free.`,
  },
  {
    // B-DISK-FILE-TIERING amendment 1 (H-2): see checkArchivalHealthRan above.
    key: 'archival-health-ran', run: checkArchivalHealthRan,
    dedupeKey: 'archival-health-not-run', category: 'health_check', severity: 'warning',
    reading: () => archivalReading || 'not read yet',
    title: 'Archive watchdog did not complete — nothing is watching the archive crons',
    body: () => `The archive watchdog (server/scripts/b-storage-archival-health.ts, root cron 0 5 * * * UTC) has not both started and finished since its last scheduled run: ${archivalReading}. It is the only thing that pages when the archive sweeps, the cold rotator, the liveness canary or the disk-file tiering job stop running, so while it is down those failures are silent. Look at ${ARCHIVAL_HEALTH_LOG} and the root crontab. Resolves itself when a run starts and finishes.`,
  },
];

async function main() {
  const state = loadState();
  state.streaks = state.streaks || {};
  delete state.alerted; // the old in-memory latch: the alerts FILE is the one authority now (Langston part 2 r3)
  state.throws = state.throws || {};
  state.recoverySeen = state.recoverySeen || {};
  log(`run ${RUN_ID} started${DISK_FORCED ? ' (FORCED disk thresholds)' : ''}`);
  const open = openAlertRows(ALERTS_FILE);
  for (const check of CHECKS) {
    const dedupeKey = check.dedupeKey || `watchdog-${check.key}`;
    const errKey = `watchdog-check-error-${check.key}`;
    let ok;
    try {
      ok = await check.run();
    } catch (err) {
      // A THROW is not a skip (Langston part 2, C2): one throw must not end the run for the other checks,
      // but a check that throws every tick must page, not log to journald forever.
      const prior = await previousFailureCount(state, state.throws, check.key, errKey);
      const t = throwStep(prior, true, DEBOUNCE_TICKS);
      const n = t.count;
      state.throws[check.key] = n;
      log(`${check.key}: CHECK-THREW (${n}/${DEBOUNCE_TICKS}): ${err?.message?.slice(0, 200)}`);
      if (t.page) {
        await queueAlert({
          title: `WATCHDOG CHECK BROKEN — the ${check.key} check throws every tick`,
          body: `The staging liveness watchdog's ${check.key} check has thrown ${n} consecutive ticks, so it is NOT watching what it is meant to watch. Last error: ${String(err?.message || err).slice(0, 300)}. Check journalctl -u dawntrader-watchdog.service. Resolves itself when the check runs without throwing.`,
          dedupeKey: errKey,
          metadata: { check: check.key, consecutive_throws: n },
          severity: 'warning',
        });
      }
      continue;
    }
    await recordRecovery(errKey, `${check.key} check ran without throwing`, open.get(errKey));
    state.throws[check.key] = throwStep(state.throws[check.key], false, DEBOUNCE_TICKS).count;
    if (ok === null) { log(`${check.key}: skipped (precondition unreachable)`); continue; }
    if (ok) {
      if (state.streaks[check.key] > 0) log(`${check.key}: recovered`);
      // A level check clears only past its margin (check.clear); between the line and the margin the row
      // stays open, so a re-crossing re-uses it and its time-driven re-surface count keeps climbing.
      const mayClear = check.clear ? check.clear() : true;
      if (mayClear) await recordRecovery(dedupeKey, check.reading ? check.reading() : `${check.key} check passed`, open.get(dedupeKey));
      state.streaks[check.key] = 0;
      continue;
    }
    const prior = await previousFailureCount(state, state.streaks, check.key, dedupeKey);
    state.streaks[check.key] = prior + 1;
    log(`${check.key}: FAIL (streak ${state.streaks[check.key]}/${DEBOUNCE_TICKS})`);
    if (state.streaks[check.key] >= DEBOUNCE_TICKS) {
      await queueAlert({
        title: check.title,
        body: typeof check.body === 'function' ? check.body() : check.body,
        dedupeKey,
        metadata: { check: check.key, streak: state.streaks[check.key], ...(check.reading ? { reading: check.reading() } : {}), ...(check.forced ? { forced: true } : {}) },
        ...(check.severity ? { severity: check.severity } : {}),
        ...(check.category ? { category: check.category } : {}),
      });
    }
  }
  saveState(state);
  await retryPending();
}

/**
 * --self-fail: invoked by the systemd OnFailure= hook when a watchdog RUN fails —
 * the watchdog reporting its own death through the fallback path (if the script
 * itself is unloadable, journald + the weekly heartbeat absence are the floor).
 * --heartbeat: weekly INFO alert proving the watchdog is alive — its ABSENCE is
 * the alarm (F10: a liveness loop cannot close inside its own failure domain).
 */
async function selfFail() {
  const dedupeKey = 'watchdog-self-fail';
  await queueAlert({
    title: 'WATCHDOG FAILED — staging liveness watchdog run errored',
    body: 'The staging liveness watchdog service run FAILED (systemd OnFailure hook). While it is down, app/engine outages go undetected on-box. Check `journalctl -u dawntrader-watchdog.service`.',
    dedupeKey,
    metadata: { check: 'self' },
  });
  await retryPending(dedupeKey);
}

async function heartbeat() {
  // The durable dedupe key is the scheduled heartbeat's UTC date. Sweeps may
  // resolve the info row without allowing a retry for that date to mint again.
  const dedupeKey = `watchdog-heartbeat-${new Date().toISOString().slice(0, 10)}`;
  await queueAlert({
    title: 'Watchdog weekly heartbeat — staging liveness watchdog alive',
    body: 'Routine weekly liveness proof from the staging watchdog (resolve on sight). If a week passes WITHOUT this alert, the watchdog itself is dead — that absence is the alarm.',
    dedupeKey,
    metadata: { check: 'heartbeat' },
    severity: 'info',
  });
  await retryPending(dedupeKey);
}

// Main guard: importable (CI shape test) AND executable (systemd).
const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isDirectRun) {
  const mode = process.argv[2];
  const run = mode === '--self-fail' ? selfFail : mode === '--heartbeat' ? heartbeat : main;
  fs.promises.mkdir(path.dirname(ALERTS_FILE), { recursive: true }).then(run)
    .catch((err) => { console.error('[WATCHDOG] run failed:', err); process.exitCode = 1; });
}
