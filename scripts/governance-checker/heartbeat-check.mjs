// B-GOV-2 OBJ-3 — dead-man heartbeat check (the "is the checker itself alive?" watcher).
// A checker can't report its own death, so this runs as a SEPARATE staging timer (sibling
// to the existing cron-fire-evidence verifier). It reads the poller's state.json lastTick;
// if it's stale beyond TICK_MINUTES × HEARTBEAT_MISS_LIMIT, it raises a low-sev
// `governance-checker-silent` alert into the §10.5 queue (and resolves it once ticks resume).
//
// Coverage (Langston Step-1): process-death of the poller → caught here; host-death of
// staging → already caught loudly by the live trading system's own monitoring.
//
// Run on staging via its own systemd timer: node scripts/governance-checker/heartbeat-check.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TICK_MINUTES, HEARTBEAT_MISS_LIMIT } from './config.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = process.env.GOV_STATE_FILE || join(SCRIPT_DIR, '.gov-checker-state.json');
const HB_STATE = process.env.GOV_HB_STATE || join(SCRIPT_DIR, '.gov-heartbeat-state.json');
const STAGING_REPO = process.env.GOV_STAGING_REPO || '/home/deploy/dawntrader';
const RUN_REMOTE = process.env.GOV_REMOTE === '1';
const STAGING = process.env.GOV_STAGING || 'deploy@188.245.193.8';

function runCli(cmd) {
  return RUN_REMOTE ? execFileSync('ssh', [STAGING, cmd], { encoding: 'utf8' })
                    : execFileSync('bash', ['-lc', cmd], { encoding: 'utf8' });
}
function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
function addAlert(severity, title, body, nowMs) {
  const meta = JSON.stringify({ dedupe_key: 'governance-checker-silent', source: 'governance-checker-heartbeat' });
  const cmd = `cd ${STAGING_REPO} && npm run -s system-alerts -- add --triggers-at ${new Date(nowMs).toISOString()} ` +
    `--category governance --severity ${severity} --title ${shq(title)} --body ${shq(body)} --metadata ${shq(meta)}`;
  const out = runCli(cmd);
  const m = out.match(/"id":\s*"([0-9a-f-]+)"/);
  return m ? m[1] : null;
}
function resolveAlert(id) {
  try { runCli(`cd ${STAGING_REPO} && npm run -s system-alerts -- resolve ${id} --by governance-checker-heartbeat`); } catch { /* terminal = fine */ }
}

export function checkHeartbeat(nowMs = Date.now()) {
  const staleMs = TICK_MINUTES * HEARTBEAT_MISS_LIMIT * 60 * 1000;
  const hb = existsSync(HB_STATE) ? JSON.parse(readFileSync(HB_STATE, 'utf8')) : { alertId: null };
  let lastTick = null;
  if (existsSync(STATE_FILE)) {
    try { lastTick = JSON.parse(readFileSync(STATE_FILE, 'utf8')).lastTick; } catch { /* unreadable → treat as silent */ }
  }
  const silent = lastTick == null || (nowMs - lastTick) > staleMs;
  if (silent && !hb.alertId) {
    const ageMin = lastTick == null ? 'never' : Math.round((nowMs - lastTick) / 60000) + 'm';
    hb.alertId = addAlert('warning',
      'governance-checker appears SILENT — no tick within the dead-man window',
      `The governance-checker poller has not written a heartbeat in over ${TICK_MINUTES * HEARTBEAT_MISS_LIMIT}m (last tick: ${ageMin} ago). It may be dead — enforcement is OFF until it resumes. Check the governance-checker.timer on staging.`,
      nowMs);
  } else if (!silent && hb.alertId) {
    resolveAlert(hb.alertId); hb.alertId = null;
  }
  writeFileSync(HB_STATE, JSON.stringify(hb, null, 2));
  return { silent, lastTick };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkHeartbeat();
  console.log(`[gov-heartbeat] silent=${r.silent} lastTick=${r.lastTick}`);
}
