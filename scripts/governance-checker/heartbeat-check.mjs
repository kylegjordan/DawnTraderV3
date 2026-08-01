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
import { TICK_MINUTES, HEARTBEAT_MISS_LIMIT, resolveEvidenceOrSentinel } from './config.mjs';

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
// #637: was `resolve <id> --by …` with NO `--evidence`. `scripts/system-alerts.ts`
// made that flag MANDATORY at B-GOV-INTEGRITY-1 (2026-07-10) and exits 1 without
// it — so this ALREADY throws on every call, the catch swallows it, and the
// caller then discarded the id unconditionally. Net effect: the dead-man alert
// could never be cleared and nothing retained the handle to retry.
// Returns TRUE only on a confirmed clear.
// ⚠️ The catch is LOAD-BEARING in the good case (CC-A): a genuinely ALREADY-TERMINAL
// alert must not blow up the heartbeat run. So distinguish the two rather than
// removing it — terminal is benign, anything else is a real failure and must be loud.
function resolveAlert(id, evidence) {
  const ev = resolveEvidenceOrSentinel(evidence);
  try {
    runCli(`cd ${STAGING_REPO} && npm run -s system-alerts -- resolve ${id} --by governance-checker-heartbeat --evidence ${ev}`);
    return true;
  } catch (err) {
    const out = `${err?.stdout ?? ''}${err?.stderr ?? ''}${err?.message ?? ''}`;
    if (/not found|already resolved|terminal/i.test(out)) return true; // benign: nothing left to clear
    console.error(`[gov-heartbeat] resolve FAILED for ${id} (id RETAINED for retry): ${out.slice(0, 300)}`);
    return false;
  }
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
    // #637: null the handle ONLY on a confirmed clear. Discarding it on failure
    // was the half that made this unrecoverable — the alert stayed open AND the
    // only id that could close it was thrown away in the same statement.
    let gradedRefSha = null;
    if (existsSync(STATE_FILE)) {
      try { gradedRefSha = JSON.parse(readFileSync(STATE_FILE, 'utf8')).gradedRefSha; } catch { /* sentinel below */ }
    }
    if (resolveAlert(hb.alertId, gradedRefSha)) hb.alertId = null;
  }
  writeFileSync(HB_STATE, JSON.stringify(hb, null, 2));
  return { silent, lastTick };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkHeartbeat();
  console.log(`[gov-heartbeat] silent=${r.silent} lastTick=${r.lastTick}`);
}
