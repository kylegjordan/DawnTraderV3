// B-GOV governance-checker — live poller (the always-on watcher layer).
// Runs as a systemd TIMER tick (NOT a while-true daemon — Item 4). Each tick:
//   fetch → classify new commits → update open-batch state → decide alerts → write/resolve
//   via the existing system-alerts CLI on staging → persist state → exit.
//
// 🚨 SCAFFOLDING / ACTIVATION NOTE (§9.1): the DECISION LOGIC below (computeBatchStates,
//    decideAlerts) is pure + unit-tested. The SIDE-EFFECT wrappers (gitFetch, alertSink,
//    state IO) only run once DEPLOYED to a LOCAL clone on the box with the systemd unit
//    installed. Until deployed + Langston Step-4 approved, this poller is INERT.
//
// DEPLOY CONSTRAINTS (Langston conditions):
//   C6  — repo MUST be a plain local clone (NOT the gdrive FUSE mount) or pure GitHub API.
//   C5  — open-batch STATE (this file's state json) is the source of truth for "closed",
//         never alert.acknowledged_at (ack ≠ resolve).
//   Item4 — own systemd unit/timer, isolated from the dawntrader node event loop.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  extractBatchId, DEADLINE_HOURS, OPEN_STATE_BACKSTOP_HOURS, DEFAULT_CLASS,
} from './config.mjs';
import { checkBatchDocset, classifyCommit } from './checker.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const BRANCH = process.env.GOV_BRANCH || 'origin/migration/aws-supabase';
const STATE_FILE = process.env.GOV_STATE_FILE || join(SCRIPT_DIR, '.gov-checker-state.json');
const STAGING = process.env.GOV_STAGING || 'deploy@188.245.193.8';
const STAGING_REPO = process.env.GOV_STAGING_REPO || '/home/deploy/dawntrader';

const HOUR_MS = 3600 * 1000;

// ── PURE DECISION LOGIC (unit-tested; no IO) ───────────────────────────────────

// Group classified commits into per-batch states.
// `commits`: [{ date:ISO, subject, files:[] }] newest-first or any order.
export function computeBatchStates(commits) {
  const states = new Map();
  let untaggedCode = 0;
  for (const c of commits) {
    const { code, governance, housekeepingOnly } = classifyCommit(c.files);
    const bid = extractBatchId(c.subject);
    if (!bid) {
      if (code && !housekeepingOnly) untaggedCode++; // C4: untagged CODE push = blind spot
      continue;
    }
    if (!states.has(bid)) {
      states.set(bid, { batchId: bid, firstCode: null, lastCode: null, hasGovernance: false });
    }
    const s = states.get(bid);
    const t = Date.parse(c.date);
    if (code) {
      if (s.firstCode === null || t < s.firstCode) s.firstCode = t;
      if (s.lastCode === null || t > s.lastCode) s.lastCode = t;
    }
    if (governance) s.hasGovernance = true;
  }
  return { batches: [...states.values()], untaggedCode };
}

// Decide which alerts to OPEN and which to RESOLVE, given batch states + declared
// exceptions (open/umbrella/na) + now. Pure: returns intents, performs no IO.
// `exceptions`: { open:Set<batchId>, openSince:Map<batchId,ms>, naConfirmed:Set<`batchId:doc`> }
export function decideAlerts(batchStates, exceptions, nowMs, opts = {}) {
  const deadlineMs = (opts.deadlineHours ?? DEADLINE_HOURS) * HOUR_MS;
  const backstopMs = (opts.backstopHours ?? OPEN_STATE_BACKSTOP_HOURS) * HOUR_MS;
  const open = exceptions.open || new Set();
  const openSince = exceptions.openSince || new Map();
  const na = exceptions.naConfirmed || new Set();
  const toOpen = [];
  const toResolveKeys = [];

  for (const s of batchStates) {
    const declaredOpen = open.has(s.batchId);

    // (1) Deadline alert (C8: clears on FIRST governance push).
    const deadlineKey = `gov-deadline:${s.batchId}`;
    if (s.hasGovernance) {
      toResolveKeys.push(deadlineKey); // first governance push clears the deadline obligation
    } else if (!declaredOpen && s.lastCode !== null && nowMs - s.lastCode > deadlineMs) {
      toOpen.push({
        dedupeKey: deadlineKey, severity: 'warning',
        title: `Governance overdue: ${s.batchId} code pushed ${Math.round((nowMs - s.lastCode) / HOUR_MS)}h ago, no governance push`,
        body: `Batch ${s.batchId} had a code push but no governance-bearing push within ${opts.deadlineHours ?? DEADLINE_HOURS}h. Either close it (push the completion report + doc updates) or declare it OPEN in GOVERNANCE_EXCEPTIONS.md.`,
      });
    }

    // (2) Stale-open route (C3: open can't be an infinite mute).
    if (declaredOpen) {
      const since = openSince.get(s.batchId);
      if (since != null && nowMs - since > backstopMs) {
        toOpen.push({
          dedupeKey: `gov-staleopen:${s.batchId}`, severity: 'info',
          title: `Open batch ${s.batchId} has been open > ${opts.backstopHours ?? OPEN_STATE_BACKSTOP_HOURS}h — still legitimately open?`,
          body: `Batch ${s.batchId} is declared OPEN (deadline suspended) but has been open over the backstop. Confirm it is still legitimately open or close it.`,
        });
      }
    }

    // (3) Doc-set gap (C8: persists until verified per Obj-13). Only meaningful once closed.
    if (s.hasGovernance) {
      const klass = s.declaredClass || DEFAULT_CLASS;
      const check = (opts.docsetCheck || checkBatchDocset)(s.batchId, klass, { requiredOnly: true });
      // Iterate the FULL required set (not just the missing slice) so a doc-gap RESOLVES
      // when the doc later lands — resolve-on-verified-state, Obj-13 (Langston Step-4 a).
      for (const doc of Object.keys(check.required)) {
        const key = `gov-docgap:${s.batchId}:${doc}`;
        const present = check.required[doc] === true;
        if (present || na.has(`${s.batchId}:${doc}`)) { toResolveKeys.push(key); continue; }
        toOpen.push({
          dedupeKey: key, severity: 'warning',
          title: `Missing required governance doc: ${doc} for ${s.batchId}`,
          body: `Batch ${s.batchId} (class ${klass}) closed but required doc "${doc}" is absent or hollow. Update it, or mark it N/A (Langston-confirmed) in GOVERNANCE_EXCEPTIONS.md.`,
        });
      }
    }
  }
  return { toOpen, toResolveKeys };
}

// ── SIDE-EFFECT WRAPPERS (run only when deployed) ──────────────────────────────
function gitFetchAndLog(n = 300) {
  execFileSync('git', ['fetch', '--quiet', 'origin'], { cwd: REPO_ROOT });
  const out = execFileSync('git', ['log', BRANCH, `-n${n}`, '--pretty=COMMIT|%H|%cI|%s', '--name-only'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const commits = []; let cur = null;
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('COMMIT|')) { if (cur) commits.push(cur); const [, hash, date, subject] = line.split('|'); cur = { hash, date, subject, files: [] }; }
    else if (line.trim() && cur) cur.files.push(line.trim());
  }
  if (cur) commits.push(cur);
  return commits;
}

function loadState() { return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { openAlerts: {}, lastTick: null }; }
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// Alert sink: reuse the existing system-alerts CLI on staging (schema-safe, race-safe).
// The CLI `add` prints the created alert as JSON (we parse .id); `resolve <id> --by`
// is ID-based. The logical dedupe_key rides in --metadata for forensics; the poller
// itself dedupes via state.openAlerts (logical-key → alert-id), so no CLI dedupe needed.
const alertSink = {
  add({ dedupeKey, severity, title, body }, nowMs) {
    const meta = JSON.stringify({ dedupe_key: dedupeKey, source: 'governance-checker' });
    const cmd = `cd ${STAGING_REPO} && npm run -s system-alerts -- add ` +
      `--triggers-at ${new Date(nowMs).toISOString()} --category governance --severity ${severity} ` +
      `--title ${shq(title)} --body ${shq(body)} --metadata ${shq(meta)}`;
    const out = execFileSync('ssh', [STAGING, cmd], { encoding: 'utf8' });
    const m = out.match(/"id":\s*"([0-9a-f-]+)"/);
    return m ? m[1] : null;
  },
  resolve(alertId) {
    const cmd = `cd ${STAGING_REPO} && npm run -s system-alerts -- resolve ${alertId} --by governance-checker`;
    try { execFileSync('ssh', [STAGING, cmd], { encoding: 'utf8' }); }
    catch (e) {
      // An already-terminal / not-found resolve is benign; anything else is a REAL failure —
      // a silently-swallowed resolve = an alert we think we cleared but didn't (Langston Step-4 c).
      const msg = String(e.stderr || e.stdout || e.message || '');
      if (!/not found|already|terminal|resolved/i.test(msg)) {
        console.warn(`[gov-checker] resolve ${alertId} FAILED (non-terminal): ${msg.slice(0, 200)}`);
      }
    }
  },
};
function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }

// Read declared exceptions from the in-repo ledger (open/umbrella/na).
function loadExceptions() {
  const open = new Set(), openSince = new Map(), naConfirmed = new Set();
  const p = join(REPO_ROOT, '1-system-manual', 'GOVERNANCE_EXCEPTIONS.md');
  if (!existsSync(p)) return { open, openSince, naConfirmed };
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 7) continue;
    const [, ts, bid, type, value, confirmedBy] = cells;
    if (!bid || bid.startsWith('_')) continue;
    if (type === 'open' && confirmedBy && confirmedBy !== 'pending') { open.add(bid); const m = value.match(/\d{4}-\d{2}-\d{2}T[\d:]+Z/); if (m) openSince.set(bid, Date.parse(m[0])); }
    if (type === 'na-skip' && confirmedBy && confirmedBy !== 'pending') naConfirmed.add(`${bid}:${value}`);
  }
  return { open, openSince, naConfirmed };
}

export function tick(nowMs = Date.now()) {
  const commits = gitFetchAndLog();
  const { batches, untaggedCode } = computeBatchStates(commits);
  const exceptions = loadExceptions();
  const { toOpen, toResolveKeys } = decideAlerts(batches, exceptions, nowMs);
  const state = loadState();
  // dedupe via own state (logical key → alert id); only add if not already open.
  for (const a of toOpen) {
    if (!state.openAlerts[a.dedupeKey]) {
      const id = alertSink.add(a, nowMs);
      if (id) state.openAlerts[a.dedupeKey] = id;
    }
  }
  for (const k of toResolveKeys) {
    const id = state.openAlerts[k];
    if (id) { alertSink.resolve(id); delete state.openAlerts[k]; }
  }
  if (untaggedCode > 0) console.warn(`[gov-checker] ${untaggedCode} untagged CODE commits in window (low-sev; see Obj-9)`);
  state.lastTick = nowMs;
  saveState(state);
  return { opened: toOpen.length, resolved: toResolveKeys.length, untaggedCode };
}

// CLI entry (only when run directly on the box)
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = tick();
  console.log(`[gov-checker] tick: opened=${r.opened} resolved=${r.resolved} untaggedCode=${r.untaggedCode}`);
}
