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
/** An override that is set must be a real number — a typo throws at load (so the run fails and the
 *  systemd OnFailure self-fail page fires) instead of silently comparing against NaN. */
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
// row (which re-surfaces and escalates to Kyle) instead of minting a fresh row each crossing
// (Langston Step 4 part 2, C3: a resolve resets the row's resurface count).
const DISK_CLEAR_MARGIN_PCT = 2;
// 90 % of this 75 GB volume leaves 7.5 GB — about 14 hours of stdout at the measured rate — so
// critical also fires on an absolute floor (Langston Step 2 C4).
const DISK_CRIT_FREE_BYTES = envNumber('WATCHDOG_DISK_CRIT_FREE_BYTES', 8 * 1024 ** 3);
const DISK_CLEAR_FREE_BYTES = DISK_CRIT_FREE_BYTES + 1024 ** 3;

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
  } catch (err) {
    log(`resolve of ${dedupeKey} FAILED (${err?.message?.slice(0, 200)}) — retried next tick while the row stays open`);
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
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { streaks: {}, alerted: {} }; }
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
    key: 'disk-warning', run: async () => readDisk().usedPct < DISK_WARN_PCT,
    clear: () => readDisk().usedPct < DISK_WARN_PCT - DISK_CLEAR_MARGIN_PCT,
    dedupeKey: 'server-disk-utilization-warning', category: 'health_check', severity: 'warning',
    reading: diskText, forced: DISK_FORCED,
    title: `${DISK_FORCED ? '[FORCED TEST] ' : ''}Server disk WARNING: staging ${DISK_PATH} over ${DISK_WARN_PCT}%`,
    body: () => `The staging server's own disk is at ${diskText()} (warning at ${DISK_WARN_PCT}%), ${DEBOUNCE_TICKS} consecutive ticks. This is the SERVER disk, not the Supabase database (that is disk-utilization-*). Where the space is: run du -sh on /var/log/dawntrader, /home/deploy/dawntrader/logs/* and /home/deploy/dawntrader/diagnostic-reports; the nightly disk-file tiering job (server/scripts/b-disk-file-tiering.ts, 02:45 UTC) moves old data files off this disk, and once it has run its log is /var/log/dawntrader/disk-file-tiering.log. Resolves itself when usage falls under ${DISK_WARN_PCT - DISK_CLEAR_MARGIN_PCT}%.`,
  },
  {
    key: 'disk-critical', run: async () => { const d = readDisk(); return d.usedPct < DISK_CRIT_PCT && d.freeBytes >= DISK_CRIT_FREE_BYTES; },
    clear: () => { const d = readDisk(); return d.usedPct < DISK_CRIT_PCT - DISK_CLEAR_MARGIN_PCT && d.freeBytes >= DISK_CLEAR_FREE_BYTES; },
    dedupeKey: 'server-disk-utilization-critical', category: 'health_check', severity: 'critical',
    reading: diskText, forced: DISK_FORCED,
    title: `${DISK_FORCED ? '[FORCED TEST] ' : ''}Server disk CRITICAL: staging ${DISK_PATH} over ${DISK_CRIT_PCT}% or under ${(DISK_CRIT_FREE_BYTES / 1024 ** 3).toFixed(0)} GiB free`,
    body: () => `The staging server's own disk is at ${diskText()}, ${DEBOUNCE_TICKS} consecutive ticks — at the measured write rate that is hours of runway, not days. If the disk fills, the app cannot log and the archive jobs cannot stage files. Where the space is: run du -sh on /var/log/dawntrader, /home/deploy/dawntrader/logs/* and /home/deploy/dawntrader/diagnostic-reports; the nightly disk-file tiering job (server/scripts/b-disk-file-tiering.ts, 02:45 UTC) moves old data files off this disk, and once it has run its log is /var/log/dawntrader/disk-file-tiering.log. Resolves itself when usage is back under ${DISK_CRIT_PCT - DISK_CLEAR_MARGIN_PCT}% with at least ${(DISK_CLEAR_FREE_BYTES / 1024 ** 3).toFixed(0)} GiB free.`,
  },
];

async function main() {
  const state = loadState();
  state.streaks = state.streaks || {};
  state.alerted = state.alerted || {};
  state.throws = state.throws || {};
  log(`run ${RUN_ID} started${DISK_FORCED ? ' (FORCED disk thresholds)' : ''}`);
  for (const check of CHECKS) {
    const dedupeKey = check.dedupeKey || `watchdog-${check.key}`;
    let ok;
    try {
      ok = await check.run();
    } catch (err) {
      // A THROW is not a skip (Langston part 2, C2): one throw must not end the run for the other checks,
      // but a check that throws every tick must page, not log to journald forever.
      const n = (state.throws[check.key] || 0) + 1;
      state.throws[check.key] = n;
      log(`${check.key}: CHECK-THREW (${n}/${DEBOUNCE_TICKS}): ${err?.message?.slice(0, 200)}`);
      const errKey = `watchdog-check-error-${check.key}`;
      if (n >= DEBOUNCE_TICKS && !fileHasOpenDedupeKey(ALERTS_FILE, errKey)) {
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
    if (state.throws[check.key]) {
      state.throws[check.key] = 0;
      const errKey = `watchdog-check-error-${check.key}`;
      if (fileHasOpenDedupeKey(ALERTS_FILE, errKey)) await resolveKey(errKey, `${check.key} check ran without throwing`);
    }
    if (ok === null) { log(`${check.key}: skipped (precondition unreachable)`); continue; }
    if (ok) {
      if (state.streaks[check.key] > 0) log(`${check.key}: recovered`);
      state.streaks[check.key] = 0;
      state.alerted[check.key] = false; // recovery re-arms the latch for the NEXT outage
      // ... and the STORE is cleared too, or the next outage is deduped into this row (P7 clear edge).
      // A level check clears only past its margin (check.clear); between the line and the margin the row
      // stays open, so a re-crossing re-uses it and its re-surface count keeps climbing toward Kyle.
      const mayClear = check.clear ? check.clear() : true;
      if (mayClear && fileHasOpenDedupeKey(ALERTS_FILE, dedupeKey)) await resolveKey(dedupeKey, check.reading ? check.reading() : `${check.key} check passed`);
      continue;
    }
    state.streaks[check.key] = (state.streaks[check.key] || 0) + 1;
    log(`${check.key}: FAIL (streak ${state.streaks[check.key]}/${DEBOUNCE_TICKS})`);
    if (state.streaks[check.key] >= DEBOUNCE_TICKS && !state.alerted[check.key]) {
      const emitPath = await emitAlert({
        title: check.title,
        body: typeof check.body === 'function' ? check.body() : check.body,
        dedupeKey,
        metadata: { check: check.key, streak: state.streaks[check.key], ...(check.reading ? { reading: check.reading() } : {}), ...(check.forced ? { forced: true } : {}) },
        ...(check.severity ? { severity: check.severity } : {}),
        ...(check.category ? { category: check.category } : {}),
      });
      state.alerted[check.key] = emitPath !== 'error';
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
