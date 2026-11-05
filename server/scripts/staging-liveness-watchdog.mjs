#!/usr/bin/env node
/**
 * B-STAGING-LIVENESS-WATCH (#512/#520) — the out-of-process staging watchdog.
 *
 * Runs from a systemd timer (User=deploy, every 5 min), PLAIN NODE by design:
 * zero imports from the app, so it runs even when the app build is broken —
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
 * CLEAR EDGE (B-DISK-FILE-TIERING P7, Langston Step 2 C4/B2): when a check passes and the
 * alerts file still holds an unresolved row for its key, the watchdog resolves it through the
 * CLI `resolve-key` verb as actor `staging-liveness-watchdog` (transport `cli`). Before this a
 * recovered outage left its row open, and the store's dedupe then swallowed the NEXT outage
 * while the CLI exited 0. Resolving goes through the CLI only — no direct-write fallback — and
 * a missed clear is retried on the next tick because the FILE, not the latch, gates it.
 *
 * Alert emit: PRIMARY = the app's alerts CLI (validates via addAlert; carries
 * --dedupe-key). FALLBACK = direct schema-valid append to the alerts jsonl —
 * load-bearing exactly when the app/CLI is broken. Both paths use the SAME
 * dedupe_key; the fallback additionally scans the file for a non-resolved row
 * with that key before appending (idempotent against file contents). A CI test
 * asserts the fallback template's shape equals a real addAlert row (drift
 * breaks the BUILD, not the outage report).
 *
 * Detection-only: this script never restarts anything.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const pExecFile = promisify(execFile);

const APP_URL = process.env.WATCHDOG_APP_URL || 'http://localhost:5000/';
const LIVENESS_URL = process.env.WATCHDOG_LIVENESS_URL || 'http://localhost:5000/api/health/liveness';
const APP_DIR = process.env.WATCHDOG_APP_DIR || '/home/deploy/dawntrader';
const ALERTS_FILE = process.env.SYSTEM_ALERTS_FILE || '/var/log/dawntrader/system-alerts.jsonl';
const STATE_FILE = process.env.WATCHDOG_STATE_FILE || '/home/deploy/.dawntrader-watchdog-state.json';
const PM2_APP_NAME = process.env.WATCHDOG_PM2_NAME || 'dawntrader';
const DEBOUNCE_TICKS = 2; // 2 × 5min — matches the pre-audit; safe post-#520 (resume completes in seconds)
const WATCHDOG_ACTOR = 'staging-liveness-watchdog';
const RUN_ID = crypto.randomUUID(); // logged at start; a resolve's evidence cites it (a re-derivable token)
// Server-disk thresholds (B-DISK-FILE-TIERING P7). Environment-overridable ONLY so the arming can be
// FORCED in a one-off run (Langston C1) — the watchdog has zero app imports, so it cannot read the DB.
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

/** One tick of a check's throw counter, pure: a throw counts up and pages once it reaches the debounce;
 *  a run that did not throw resets it. Clearing the page is gated on the FILE, never on this counter. */
/** Whether a failing check mints its page, pure: only at or past the debounce, and only when the alerts
 *  file holds no unresolved row for its key. The file is the single authority for "a page is up". */
export function shouldMint(streak, debounce, rowOpen) {
  return (streak || 0) >= debounce && !rowOpen;
}

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
    metadata: { source: 'staging-liveness-watchdog', emit_path: 'fallback_direct_append', ...metadata },
    recurrence_interval_seconds: null,
    dedupe_key: dedupeKey,
  };
}

/** Non-resolved row with this dedupe_key already in the file? (same semantic addAlert applies) */
/** Every dedupe key with a non-resolved row, from ONE read of the file (the run reads it once, not per check). */
export function openDedupeKeys(alertsFilePath) {
  // Each alert's LAST line wins (a row may be rewritten); a key is open if ANY of its alerts is unresolved
  // — the same rule addAlert's dedupe applies, so this never reads closed while the store still blocks.
  const latest = new Map();
  if (fs.existsSync(alertsFilePath)) {
    for (const line of fs.readFileSync(alertsFilePath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const row = JSON.parse(line); if (row.id) latest.set(row.id, row); } catch { /* torn line */ }
    }
  }
  const open = new Set();
  for (const row of latest.values()) if (row.dedupe_key && row.state !== 'resolved') open.add(row.dedupe_key);
  return open;
}

export function fileHasOpenDedupeKey(alertsFilePath, dedupeKey) {
  if (!fs.existsSync(alertsFilePath)) return false;
  const lines = fs.readFileSync(alertsFilePath, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.dedupe_key === dedupeKey && row.state !== 'resolved') return true;
    } catch { /* tolerate a torn line; the CLI validates real rows */ }
  }
  return false;
}

/** The JSON object the CLI printed, after npm's own preamble lines; null if there is none. */
export function cliJson(stdout) {
  const out = String(stdout || '');
  const start = out.startsWith('{') ? 0 : out.indexOf('\n{') + 1;
  if (start === 0 && !out.startsWith('{')) return null;
  try { return JSON.parse(out.slice(start)); } catch { return null; }
}

async function emitAlert({ title, body, dedupeKey, metadata, severity = 'critical', category = 'breakage' }) {
  // PRIMARY: the app's CLI (full validation + the same B-NEW-51 dedup).
  const sentTriggersAt = new Date().toISOString();
  try {
    const { stdout } = await pExecFile('npm', ['run', 'system-alerts', '--', 'add',
      '--triggers-at', sentTriggersAt,
      '--category', category, '--severity', severity,
      '--title', title, '--body', body,
      '--metadata', JSON.stringify({ source: 'staging-liveness-watchdog', emit_path: 'cli', ...metadata }),
      '--dedupe-key', dedupeKey,
    ], { cwd: APP_DIR, timeout: 60_000 });
    // On a dedupe, addAlert returns the EXISTING row, so its triggers_at is not the one just sent
    // (system-alerts.ts, the non-terminal dedupe check; Langston Step 2 r4 C4). Say so, never "emitted".
    const row = cliJson(stdout);
    if (row && row.dedupe_key === dedupeKey && row.triggers_at !== sentTriggersAt) {
      log(`CLI deduped (dedupe_key=${dedupeKey}): unresolved row ${row.id} already holds the key — no new alert`);
      return 'deduped';
    }
    log(`alert emitted via CLI (dedupe_key=${dedupeKey}${row ? `, id=${row.id}` : ', CLI output not parsed'})`);
    return 'cli';
  } catch (cliErr) {
    log(`CLI emit failed (${cliErr?.message?.slice(0, 200)}) — using direct-append fallback`);
  }
  // FALLBACK: direct append (the app/CLI is broken — the #512 case).
  if (fileHasOpenDedupeKey(ALERTS_FILE, dedupeKey)) {
    log(`fallback: non-resolved ${dedupeKey} row already present — not appending`);
    return 'deduped';
  }
  const row = buildFallbackAlert({ title, body, dedupeKey, metadata, severity, category });
  fs.mkdirSync(path.dirname(ALERTS_FILE), { recursive: true });
  fs.appendFileSync(ALERTS_FILE, JSON.stringify(row) + '\n');
  log(`alert appended directly (dedupe_key=${dedupeKey})`);
  return 'fallback';
}

function log(msg) {
  console.log(`[WATCHDOG] ${new Date().toISOString()} ${msg}`);
}

/** Resolve every unresolved row for `dedupeKey` through the CLI (gated by the caller on the file). */
async function resolveKey(dedupeKey, reading) {
  try {
    const { stdout } = await pExecFile('npm', ['run', 'system-alerts', '--', 'resolve-key', dedupeKey,
      '--by', WATCHDOG_ACTOR,
      '--evidence', `watchdog run ${RUN_ID}: ${dedupeKey} condition cleared (${reading})`,
    ], { cwd: APP_DIR, timeout: 60_000 });
    const out = cliJson(stdout);
    log(`resolved ${dedupeKey}: ${out ? JSON.stringify(out.resolved) : 'CLI output not parsed'}`);
    return true;
  } catch (err) {
    log(`resolve of ${dedupeKey} FAILED (${err?.message?.slice(0, 200)}) — retried next tick while the row stays open`);
    return false;
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
  log(`run ${RUN_ID} started${DISK_FORCED ? ' (FORCED disk thresholds)' : ''}`);
  const open = openDedupeKeys(ALERTS_FILE); // one read per run; kept current as this run resolves
  for (const check of CHECKS) {
    const dedupeKey = check.dedupeKey || `watchdog-${check.key}`;
    let ok;
    try {
      ok = await check.run();
    } catch (err) {
      // A THROW is not a skip (Langston part 2, C2): one throw must not end the run for the other checks,
      // but a check that throws every tick must page, not log to journald forever.
      const t = throwStep(state.throws[check.key], true, DEBOUNCE_TICKS);
      const n = t.count;
      state.throws[check.key] = n;
      log(`${check.key}: CHECK-THREW (${n}/${DEBOUNCE_TICKS}): ${err?.message?.slice(0, 200)}`);
      const errKey = `watchdog-check-error-${check.key}`;
      if (t.page && !open.has(errKey)) {
        await emitAlert({
          title: `WATCHDOG CHECK BROKEN — the ${check.key} check throws every tick`,
          body: `The staging liveness watchdog's ${check.key} check has thrown ${n} consecutive ticks, so it is NOT watching what it is meant to watch. Last error: ${String(err?.message || err).slice(0, 300)}. Check journalctl -u dawntrader-watchdog.service. Resolves itself when the check runs without throwing.`,
          dedupeKey: errKey,
          metadata: { check: check.key, consecutive_throws: n },
          severity: 'warning',
        });
      }
      continue;
    }
    state.throws[check.key] = throwStep(state.throws[check.key], false, DEBOUNCE_TICKS).count;
    // Gated on the FILE alone, so a failed resolve is retried next tick (Langston part 2 r2 blocker: the
    // old counter gate zeroed first and never retried).
    const errKey = `watchdog-check-error-${check.key}`;
    if (open.has(errKey) && await resolveKey(errKey, `${check.key} check ran without throwing`)) open.delete(errKey);
    if (ok === null) { log(`${check.key}: skipped (precondition unreachable)`); continue; }
    if (ok) {
      if (state.streaks[check.key] > 0) log(`${check.key}: recovered`);
      state.streaks[check.key] = 0;
      // ... and the STORE is cleared too, or the next outage is deduped into this row (P7 clear edge).
      // A level check clears only past its margin (check.clear); between the line and the margin the row
      // stays open, so a re-crossing re-uses it and its time-driven re-surface count keeps climbing.
      const mayClear = check.clear ? check.clear() : true;
      if (mayClear && open.has(dedupeKey) && await resolveKey(dedupeKey, check.reading ? check.reading() : `${check.key} check passed`)) open.delete(dedupeKey);
      continue;
    }
    state.streaks[check.key] = (state.streaks[check.key] || 0) + 1;
    log(`${check.key}: FAIL (streak ${state.streaks[check.key]}/${DEBOUNCE_TICKS})`);
    // Mint gated on the FILE, like the clear: an open row means a page is already up; no open row means
    // mint — even if a person resolved the row while the condition still holds (Langston part 2 r3).
    if (shouldMint(state.streaks[check.key], DEBOUNCE_TICKS, open.has(dedupeKey))) {
      const emitPath = await emitAlert({
        title: check.title,
        body: typeof check.body === 'function' ? check.body() : check.body,
        dedupeKey,
        metadata: { check: check.key, streak: state.streaks[check.key], ...(check.reading ? { reading: check.reading() } : {}), ...(check.forced ? { forced: true } : {}) },
        ...(check.severity ? { severity: check.severity } : {}),
        ...(check.category ? { category: check.category } : {}),
      });
      if (emitPath !== 'deduped') open.add(dedupeKey);
    }
  }
  saveState(state);
}

/**
 * --self-fail: invoked by the systemd OnFailure= hook when a watchdog RUN fails —
 * the watchdog reporting its own death through the fallback path (if the script
 * itself is unloadable, journald + the weekly heartbeat absence are the floor).
 * --heartbeat: weekly INFO alert proving the watchdog is alive — its ABSENCE is
 * the alarm (F10: a liveness loop cannot close inside its own failure domain).
 */
async function selfFail() {
  await emitAlert({
    title: 'WATCHDOG FAILED — staging liveness watchdog run errored',
    body: 'The staging liveness watchdog service run FAILED (systemd OnFailure hook). While it is down, app/engine outages go undetected on-box. Check `journalctl -u dawntrader-watchdog.service`.',
    dedupeKey: 'watchdog-self-fail',
    metadata: { check: 'self' },
  });
}

async function heartbeat() {
  // No dedupe key ON PURPOSE: one fresh info row per week is the liveness proof;
  // §10.5 sweeps resolve it routinely. A missing week = the watchdog is dead.
  await emitAlert({
    title: 'Watchdog weekly heartbeat — staging liveness watchdog alive',
    body: 'Routine weekly liveness proof from the staging watchdog (resolve on sight). If a week passes WITHOUT this alert, the watchdog itself is dead — that absence is the alarm.',
    dedupeKey: `watchdog-heartbeat-${new Date().toISOString().slice(0, 10)}`,
    metadata: { check: 'heartbeat' },
    severity: 'info',
  });
}

// Main guard: importable (CI shape test) AND executable (systemd).
const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isDirectRun) {
  const mode = process.argv[2];
  const run = mode === '--self-fail' ? selfFail : mode === '--heartbeat' ? heartbeat : main;
  run().catch((err) => { console.error('[WATCHDOG] run failed:', err); process.exitCode = 1; });
}
