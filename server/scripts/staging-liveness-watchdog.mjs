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

/**
 * Builds a fallback alert row shaped EXACTLY like system-alerts.ts addAlert()
 * output (schema_version 1). CI pins this shape against a real addAlert row —
 * see server/tests/unit/b-staging-liveness-watch.test.ts. Do not add/remove
 * fields here without that test in the same diff.
 */
export function buildFallbackAlert({ title, body, dedupeKey, metadata, severity = 'critical' }) {
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
    category: 'breakage',
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

async function emitAlert({ title, body, dedupeKey, metadata, severity = 'critical' }) {
  // PRIMARY: the app's CLI (full validation + the same B-NEW-51 dedup).
  try {
    await pExecFile('npm', ['run', 'system-alerts', '--', 'add',
      '--triggers-at', new Date().toISOString(),
      '--category', 'breakage', '--severity', severity,
      '--title', title, '--body', body,
      '--metadata', JSON.stringify({ source: 'staging-liveness-watchdog', emit_path: 'cli', ...metadata }),
      '--dedupe-key', dedupeKey,
    ], { cwd: APP_DIR, timeout: 60_000 });
    log(`alert emitted via CLI (dedupe_key=${dedupeKey})`);
    return 'cli';
  } catch (cliErr) {
    log(`CLI emit failed (${cliErr?.message?.slice(0, 200)}) — using direct-append fallback`);
  }
  // FALLBACK: direct append (the app/CLI is broken — the #512 case).
  if (fileHasOpenDedupeKey(ALERTS_FILE, dedupeKey)) {
    log(`fallback: non-resolved ${dedupeKey} row already present — not appending`);
    return 'deduped';
  }
  const row = buildFallbackAlert({ title, body, dedupeKey, metadata, severity });
  fs.mkdirSync(path.dirname(ALERTS_FILE), { recursive: true });
  fs.appendFileSync(ALERTS_FILE, JSON.stringify(row) + '\n');
  log(`alert appended directly (dedupe_key=${dedupeKey})`);
  return 'fallback';
}

function log(msg) {
  console.log(`[WATCHDOG] ${new Date().toISOString()} ${msg}`);
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
];

async function main() {
  const state = loadState();
  state.streaks = state.streaks || {};
  state.alerted = state.alerted || {};
  for (const check of CHECKS) {
    const ok = await check.run();
    if (ok === null) { log(`${check.key}: skipped (precondition unreachable)`); continue; }
    if (ok) {
      if (state.streaks[check.key] > 0) log(`${check.key}: recovered`);
      state.streaks[check.key] = 0;
      state.alerted[check.key] = false; // recovery re-arms the latch for the NEXT outage
      continue;
    }
    state.streaks[check.key] = (state.streaks[check.key] || 0) + 1;
    log(`${check.key}: FAIL (streak ${state.streaks[check.key]}/${DEBOUNCE_TICKS})`);
    if (state.streaks[check.key] >= DEBOUNCE_TICKS && !state.alerted[check.key]) {
      const emitPath = await emitAlert({
        title: check.title,
        body: check.body,
        dedupeKey: `watchdog-${check.key}`,
        metadata: { check: check.key, streak: state.streaks[check.key] },
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
