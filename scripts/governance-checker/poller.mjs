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
  extractLeadingBatchId, DEADLINE_HOURS, OPEN_STATE_BACKSTOP_HOURS, OPEN_STATE_MAX_AGE_HOURS,
  DEFAULT_CLASS, SHADOW_MODE, ENFORCEMENT_CUTOFF_MS,
} from './config.mjs';
import {
  checkBatchDocset, classifyCommit, diffTouchesCoreEngine, readDeclaredClass,
  docPresent, completionReportCommitTime, scopeCommitTime,
} from './checker.mjs';

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
    // B-GOV-4 OBJ-1: grade only a LEADING-token batch-id. A mid-subject reference is contextual,
    // not the commit's own batch, and must not establish/refresh a gradable batch (#350a).
    const bid = extractLeadingBatchId(c.subject);
    if (!bid) {
      if (code && !housekeepingOnly) untaggedCode++; // C4: untagged CODE push = blind spot
      continue;
    }
    if (!states.has(bid)) {
      states.set(bid, { batchId: bid, firstCode: null, lastCode: null, hasGovernance: false, _files: new Set() });
    }
    const s = states.get(bid);
    const t = Date.parse(c.date);
    if (code) {
      if (s.firstCode === null || t < s.firstCode) s.firstCode = t;
      if (s.lastCode === null || t > s.lastCode) s.lastCode = t;
    }
    if (governance) s.hasGovernance = true;
    for (const f of c.files) s._files.add(f); // B-GOV-2 OBJ-2: accumulate changed files for the path heuristic
  }
  // materialize files (OBJ-2) and drop the Set
  const batches = [...states.values()].map((s) => ({ ...s, files: [...s._files], _files: undefined }));
  return { batches, untaggedCode };
}

// B-GOV-3 OBJ-1: GRANDFATHER CUTOFF (pure, exported for unit test). A batch is enforceable iff
// its code CLOSES at/after the cutoff — keyed on lastCode (NOT firstCode) so a straddler that
// started before go-live but closes after is STILL enforced (Langston Step-2); a batch with no
// determinable code-close (lastCode null = code aged out of the window / governance-only) is
// grandfathered. ★ Used ONLY by the live tick — the Obj-3 backtest never calls it, so it grades
// historical fixtures with the cutoff bypassed (Langston Catch #1).
export function applyCutoff(batches, cutoffMs) {
  return batches.filter((b) => b.lastCode !== null && b.lastCode >= cutoffMs);
}

// B-GOV-4 OBJ-3: pin a CLOSED-QUIESCENT batch's enforcement timestamp to its completion-report
// FIRST-ADD (the immutable close event), so a later commit that merely LEADS with the closed id
// (e.g. `B-NEW-40 soak finding: …` touching scripts/) can no longer refresh lastCode and
// un-grandfather it (the #350 root vector). A re-open (the batch's LATEST scope first-add — see
// scopeCommitTime/Math.max — STRICTLY after the report first-add, i.e. a NEW scope rev filed
// post-close) is NOT closed-quiescent → keeps its real recent lastCode → re-enrolls. Also surfaces
// `hasCompletionReport` — the OBJ-4 doc-set SENTINEL (same shared primitive, no split-brain).
// PURE: caller injects `completionAddTime`/`scopeAddTime` (git first-add ms) onto each batch, so
// this is unit-testable without git. No scope-file requirement (empirically many legitimately-
// closed batches have no in-repo scope → requiring one would cry-SILENCE them; pre-audit §5).
export function anchorClosedBatches(batches) {
  for (const b of batches) {
    const closed = b.completionAddTime != null;
    const reopened = closed && b.scopeAddTime != null && b.scopeAddTime > b.completionAddTime; // strict >
    b.hasCompletionReport = closed;
    if (closed && !reopened) b.lastCode = b.completionAddTime; // pin to the immutable close event
  }
  return batches;
}

// B-GOV-4 OBJ-4b: decide which ORPHANED doc-gap alerts to resolve vs keep. An alert opened while a
// batch was in-window gets stranded once the batch leaves the `-n300` window (decideAlerts no
// longer iterates it → its key never re-enters toResolveKeys → re-surfaces forever; the P19-B6.6
// symptom). Resolve such orphans — but RE-VERIFY first via the injected `verify(bid,doc)` (the live
// tick passes a whole-tree GOV_REF check), NEVER blind-resolve: a genuinely-missing doc on a closed
// batch that merely aged out must STAY surfaced (Langston Step-2 Finding 2 — no cry-silence). PURE.
export function decideOrphanSweep(openAlertKeys, enforceableIds, verify) {
  const resolve = [], keep = [];
  for (const key of openAlertKeys) {
    const m = /^gov-docgap:(.+):([^:]+)$/.exec(key);
    if (!m) continue;                          // only doc-gap orphans are swept here
    const bid = m[1], doc = m[2];
    if (enforceableIds.has(bid)) continue;     // still in-window → handled by decideAlerts
    (verify(bid, doc) ? resolve : keep).push(key);
  }
  return { resolve, keep };
}

// Decide which alerts to OPEN and which to RESOLVE, given batch states + declared
// exceptions (open/umbrella/na) + now. Pure: returns intents, performs no IO.
// `exceptions`: { open:Set<batchId>, openSince:Map<batchId,ms>, naConfirmed:Set<`batchId:doc`> }
export function decideAlerts(batchStates, exceptions, nowMs, opts = {}) {
  const deadlineMs = (opts.deadlineHours ?? DEADLINE_HOURS) * HOUR_MS;
  const backstopMs = (opts.backstopHours ?? OPEN_STATE_BACKSTOP_HOURS) * HOUR_MS;
  const maxAgeMs = (opts.maxOpenAgeHours ?? OPEN_STATE_MAX_AGE_HOURS) * HOUR_MS;
  const shadow = opts.shadow ?? SHADOW_MODE;            // OBJ-5d: shadow downgrades to info
  const coreCheck = opts.coreEngineCheck || diffTouchesCoreEngine; // OBJ-2 (injectable for tests)
  const sev = (level) => (shadow ? 'info' : level);
  const open = exceptions.open || new Set();
  const openSince = exceptions.openSince || new Map();
  const na = exceptions.naConfirmed || new Set();
  const toOpen = [];
  const toResolveKeys = [];

  for (const s of batchStates) {
    const declaredOpen = open.has(s.batchId);
    const klass = s.declaredClass || DEFAULT_CLASS;

    // (0a) OBJ-1: class undeclared → fail-closed to strictest + a low-sev flag.
    const classKey = `gov-classundeclared:${s.batchId}`;
    if (s.classDeclared === false) {
      toOpen.push({
        dedupeKey: classKey, severity: sev('info'),
        title: `Change-class undeclared for ${s.batchId} — defaulting to strictest (architecture)`,
        body: `Batch ${s.batchId} has no parseable change-class in its scope header; the checker is grading it against the architecture doc-set. Declare 'change-class:' in the scope header to grade it correctly.`,
      });
    } else if (s.classDeclared === true) {
      toResolveKeys.push(classKey);
    }

    // (0b) OBJ-2: path-heuristic under-declaration guard.
    const underKey = `gov-underdeclared:${s.batchId}`;
    if (klass !== 'architecture' && s.files && coreCheck(s.files)) {
      toOpen.push({
        dedupeKey: underKey, severity: sev('warning'),
        title: `Possible under-declared class: ${s.batchId} declared '${klass}' but its diff touches core engine paths`,
        body: `Batch ${s.batchId} is declared '${klass}', but its changed files touch core engine code (strategy-engine / MCE / SQE / TEC / regime / signal orchestrator). Confirm the class is right (it may need 'architecture' so SYSTEM_MANUAL + SIM are required) — Langston to judge.`,
      });
    } else {
      toResolveKeys.push(underKey);
    }

    // (1) Deadline alert (C8: clears on FIRST governance push).
    const deadlineKey = `gov-deadline:${s.batchId}`;
    if (s.hasGovernance) {
      toResolveKeys.push(deadlineKey); // first governance push clears the deadline obligation
    } else if (!declaredOpen && s.lastCode !== null && nowMs - s.lastCode > deadlineMs) {
      toOpen.push({
        dedupeKey: deadlineKey, severity: sev('warning'),
        title: `Governance overdue: ${s.batchId} code pushed ${Math.round((nowMs - s.lastCode) / HOUR_MS)}h ago, no governance push`,
        body: `Batch ${s.batchId} had a code push but no governance-bearing push within ${opts.deadlineHours ?? DEADLINE_HOURS}h. Either close it (push the completion report + doc updates) or declare it OPEN in GOVERNANCE_EXCEPTIONS.md.`,
      });
    }

    // (2) Stale-open route (C3 + OBJ-4c: OPEN can't be a silent permanent bypass).
    if (declaredOpen) {
      const since = openSince.get(s.batchId);
      const malKey = `gov-malformed-open:${s.batchId}`;
      if (since == null) {
        // OBJ-4c hole (Langston Step-4): an OPEN with no parseable since-date suspends the
        // deadline forever AND defeats both backstops silently. Surface it loudly instead of
        // letting a one-char date typo buy infinite suspension.
        toOpen.push({
          dedupeKey: malKey, severity: sev('warning'),
          title: `OPEN batch ${s.batchId} has no parseable 'open since' date — backstops cannot run`,
          body: `Batch ${s.batchId} is declared OPEN in GOVERNANCE_EXCEPTIONS.md but its open-since timestamp is missing/unparseable, so the 48h/7d backstops can never fire (a silent permanent bypass). Fix the date (ISO, e.g. 2026-06-18T12:00:00Z).`,
        });
      } else {
        toResolveKeys.push(malKey);
        if (nowMs - since > maxAgeMs) {
          toOpen.push({
            dedupeKey: `gov-openmaxage:${s.batchId}`, severity: sev('warning'),
            title: `Open batch ${s.batchId} has been OPEN > ${Math.round((opts.maxOpenAgeHours ?? OPEN_STATE_MAX_AGE_HOURS) / 24)}d — close it or re-justify`,
            body: `Batch ${s.batchId} has been declared OPEN past the max-age backstop. OPEN must not become a permanent bypass of the doc-set check — close the batch or explicitly re-justify in GOVERNANCE_EXCEPTIONS.md.`,
          });
        } else if (nowMs - since > backstopMs) {
          toOpen.push({
            dedupeKey: `gov-staleopen:${s.batchId}`, severity: sev('info'),
            title: `Open batch ${s.batchId} has been open > ${opts.backstopHours ?? OPEN_STATE_BACKSTOP_HOURS}h — still legitimately open?`,
            body: `Batch ${s.batchId} is declared OPEN (deadline suspended) but has been open over the backstop. Confirm it is still legitimately open or close it.`,
          });
        }
      }
    }

    // (3) Doc-set gap (C8: persists until verified per Obj-13). B-GOV-4 OBJ-4: trigger on the
    // COMPLETION-REPORT SENTINEL (`hasCompletionReport`), NOT first-governance-commit — the report
    // is the Step-11 close artifact (mandatory §4), so by construction it cannot exist before the
    // batch is genuinely closing, eliminating the close-before-docset race (#397). The deadline
    // (block 1) still keys on hasGovernance, so a no-report/abandoned batch is NOT silenced — it
    // surfaces via the deadline. Durability under a slightly-early report = order-independent
    // auto-resolve (this re-resolve loop + the OBJ-4b orphan sweep), NOT push-order convention.
    if (s.hasCompletionReport) {
      const check = (opts.docsetCheck || checkBatchDocset)(s.batchId, klass, { requiredOnly: true });
      // Iterate the FULL required set (not just the missing slice) so a doc-gap RESOLVES
      // when the doc later lands — resolve-on-verified-state, Obj-13 (Langston Step-4 a).
      for (const doc of Object.keys(check.required)) {
        const key = `gov-docgap:${s.batchId}:${doc}`;
        const present = check.required[doc] === true;
        if (present || na.has(`${s.batchId}:${doc}`)) { toResolveKeys.push(key); continue; }
        toOpen.push({
          dedupeKey: key, severity: sev('warning'),
          title: `Missing required governance doc: ${doc} for ${s.batchId}`,
          body: `Batch ${s.batchId} (class ${klass}) closed but required doc "${doc}" is absent or hollow. Update it, or mark it N/A (Langston-confirmed) in GOVERNANCE_EXCEPTIONS.md.`,
        });
      }
    }
  }
  return { toOpen, toResolveKeys };
}

// ── SIDE-EFFECT WRAPPERS (run only when deployed) ──────────────────────────────
// OBJ-5c: a failed fetch degrades to fetchOk=false (the tick then flags low-sev + skips
// evaluation, never a false RED off stale state).
function gitFetchAndLog(n = 300) {
  let fetchOk = true;
  try { execFileSync('git', ['fetch', '--quiet', 'origin'], { cwd: REPO_ROOT, timeout: 60000 }); }
  catch (e) { fetchOk = false; console.warn(`[gov-checker] git fetch failed (stale local clone): ${String(e.message).slice(0, 150)}`); }
  const out = execFileSync('git', ['log', BRANCH, `-n${n}`, '--pretty=COMMIT|%H|%cI|%s', '--name-only'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const commits = []; let cur = null;
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('COMMIT|')) { if (cur) commits.push(cur); const [, hash, date, subject] = line.split('|'); cur = { hash, date, subject, files: [] }; }
    else if (line.trim() && cur) cur.files.push(line.trim());
  }
  if (cur) commits.push(cur);
  return { commits, fetchOk };
}

// OBJ-5 host change: the checker runs ON STAGING, so the system-alerts CLI runs LOCALLY
// (no ssh per alert). GOV_REMOTE=1 falls back to ssh if ever run off-box.
const RUN_REMOTE = process.env.GOV_REMOTE === '1';
function runCli(cmd) {
  return RUN_REMOTE
    ? execFileSync('ssh', [STAGING, cmd], { encoding: 'utf8' })
    : execFileSync('bash', ['-lc', cmd], { encoding: 'utf8' });
}

function loadState() { return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { openAlerts: {}, lastTick: null }; }
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// B-GOV-3 OBJ-2: SHADOW = LOG-ONLY. In shadow mode the sink writes the intended alert to a
// local log and NEVER touches the §10.5 queue. Why at the SINK (the producer), not the §10.5
// reader: the reader surfaces even `info` severity (state=active, unacked) — so the old shadow,
// which only downgraded severity, still PAGED (the 2026-06-19 88-alert flood). Log-only makes a
// shadow run observable ONLY by deliberate inspection of this file, never a page. Fixing it at
// the one producer beats making every §10.5 reader filter `category=governance`.
const SHADOW_LOG = process.env.GOV_SHADOW_LOG || join(SCRIPT_DIR, '.gov-checker-shadow.log');
function appendShadowLog(entry) {
  try { writeFileSync(SHADOW_LOG, `${new Date().toISOString()} ${JSON.stringify(entry)}\n`, { flag: 'a' }); }
  catch (e) { console.warn(`[gov-checker] shadow-log write failed: ${String(e.message).slice(0, 150)}`); }
}

// Alert sink: reuse the existing system-alerts CLI on staging (schema-safe, race-safe).
// The CLI `add` prints the created alert as JSON (we parse .id); `resolve <id> --by`
// is ID-based. The logical dedupe_key rides in --metadata for forensics; the poller
// itself dedupes via state.openAlerts (logical-key → alert-id), so no CLI dedupe needed.
const alertSink = {
  add({ dedupeKey, severity, title, body }, nowMs) {
    // OBJ-2: shadow → log-only, no queue write. Return null so the tick does NOT record it in
    // state.openAlerts (there is no real alert id), and resolve() stays a no-op in shadow.
    if (SHADOW_MODE) { appendShadowLog({ phase: 'add', dedupeKey, severity, title, body }); return null; }
    const meta = JSON.stringify({ dedupe_key: dedupeKey, source: 'governance-checker' });
    const cmd = `cd ${STAGING_REPO} && npm run -s system-alerts -- add ` +
      `--triggers-at ${new Date(nowMs).toISOString()} --category governance --severity ${severity} ` +
      `--title ${shq(title)} --body ${shq(body)} --metadata ${shq(meta)}`;
    const out = runCli(cmd);
    const m = out.match(/"id":\s*"([0-9a-f-]+)"/);
    return m ? m[1] : null;
  },
  resolve(alertId) {
    // OBJ-2: nothing is queued in shadow, so resolve is a no-op (log-only for symmetry).
    if (SHADOW_MODE) { appendShadowLog({ phase: 'resolve', alertId }); return; }
    const cmd = `cd ${STAGING_REPO} && npm run -s system-alerts -- resolve ${alertId} --by governance-checker`;
    try { runCli(cmd); }
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
  const state = loadState();
  const { commits, fetchOk } = gitFetchAndLog();
  // OBJ-5c: if the fetch failed, do NOT evaluate off stale state — flag + exit. A PERSISTENT
  // blind streak escalates info → warning after 3 consecutive (Langston Step-4 c: a checker
  // alive-but-network-blind for hours mustn't look healthy behind one un-paged info alert).
  const FETCH_KEY = 'gov-fetch-failed';
  if (!fetchOk) {
    state.fetchFailStreak = (state.fetchFailStreak || 0) + 1;
    const want = state.fetchFailStreak >= 3 ? 'warning' : 'info';
    const payload = (sev) => ({ dedupeKey: FETCH_KEY, severity: sev,
      title: `governance-checker could not fetch origin (${state.fetchFailStreak} consecutive tick${state.fetchFailStreak > 1 ? 's' : ''})`,
      body: `git fetch failed; skipped evaluation to avoid false alarms off stale state. ${want === 'warning' ? 'Persistent — the checker has been network-blind across multiple ticks; enforcement is effectively paused. Investigate.' : 'Will retry next tick.'}` });
    if (!state.openAlerts[FETCH_KEY]) {
      const id = alertSink.add(payload(want), nowMs);
      if (id) { state.openAlerts[FETCH_KEY] = id; state.fetchFailSev = want; }
    } else if (state.fetchFailSev === 'info' && want === 'warning') {
      // escalate: resolve the info alert + reopen at warning
      alertSink.resolve(state.openAlerts[FETCH_KEY]); delete state.openAlerts[FETCH_KEY];
      const id = alertSink.add(payload('warning'), nowMs);
      if (id) { state.openAlerts[FETCH_KEY] = id; state.fetchFailSev = 'warning'; }
    }
    state.lastTick = nowMs; saveState(state);
    return { opened: 0, resolved: 0, untaggedCode: 0, fetchOk: false };
  }
  state.fetchFailStreak = 0; state.fetchFailSev = undefined;
  if (state.openAlerts[FETCH_KEY]) { alertSink.resolve(state.openAlerts[FETCH_KEY]); delete state.openAlerts[FETCH_KEY]; }
  const { batches, untaggedCode } = computeBatchStates(commits);
  // B-GOV-4 OBJ-3/4: enrich each batch with the shared close-detection primitive (git FIRST-ADD
  // commit time of its completion report + scope), then PIN closed-quiescent batches to their
  // immutable close event BEFORE the grandfather cutoff — so a later leading re-mention of a closed
  // id cannot refresh lastCode past the cutoff and re-grade it. Also sets hasCompletionReport (the
  // OBJ-4 doc-set sentinel). (Both git reads happen on-box at GOV_REF; the pure logic is in
  // anchorClosedBatches so it stays unit-testable.)
  for (const b of batches) {
    b.completionAddTime = completionReportCommitTime(b.batchId);
    b.scopeAddTime = scopeCommitTime(b.batchId);
  }
  anchorClosedBatches(batches);
  // B-GOV-3 OBJ-1: GRANDFATHER CUTOFF — enforce only on batches whose (now anchored) close is
  // at/after the cutoff (key on lastCode → a straddler that closes after go-live is still
  // enforced). Pre-cutoff batches are grandfathered (no retroactive flagging — the flood fix). A
  // batch with no determinable close (lastCode null) is grandfathered too. ★ This filter lives
  // ONLY in the live tick; the Obj-3 backtest tests docPresent/preAuditStructure directly and
  // applies no cutoff, so it grades historical fixtures with the cutoff bypassed (Langston Catch #1;
  // mechanism corrected B-GOV-4 Step-4 — the backtest calls neither computeBatchStates nor decideAlerts).
  const enforceable = applyCutoff(batches, ENFORCEMENT_CUTOFF_MS);
  // OBJ-1 (B-GOV-2): read each enforceable batch's declared change-class from its scope header.
  for (const b of enforceable) { const d = readDeclaredClass(b.batchId); b.declaredClass = d.class; b.classDeclared = d.declared; }
  const exceptions = loadExceptions();
  const { toOpen, toResolveKeys } = decideAlerts(enforceable, exceptions, nowMs);
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
  // B-GOV-4 OBJ-4b: orphan re-verify sweep. Resolve doc-gap alerts whose batch left the -n300
  // window (decideAlerts no longer iterates them, so their keys can't re-enter toResolveKeys and
  // they re-surface forever — the P19-B6.6 symptom) — but RE-VERIFY at GOV_REF first (whole-tree
  // docPresent/N-A, not the window), never blind-resolve, so a genuinely-missing aged-out doc
  // stays surfaced (Langston Step-2 Finding 2).
  const enforceableIds = new Set(enforceable.map((b) => b.batchId));
  const verifyDoc = (bid, doc) => docPresent(bid, doc) || exceptions.naConfirmed.has(`${bid}:${doc}`);
  const { resolve: orphanResolve, keep: orphanKeep } =
    decideOrphanSweep(Object.keys(state.openAlerts), enforceableIds, verifyDoc);
  for (const key of orphanResolve) {
    const id = state.openAlerts[key];
    if (id) { alertSink.resolve(id); delete state.openAlerts[key]; }
    console.warn(`[gov-checker] orphan-sweep RESOLVED ${key} (verified satisfied at ${BRANCH})`);
  }
  for (const key of orphanKeep) {
    console.warn(`[gov-checker] orphan-sweep KEPT ${key} (still missing out-of-window — real gap, not silenced)`);
  }
  if (untaggedCode > 0) console.warn(`[gov-checker] ${untaggedCode} untagged CODE commits in window (low-sev; see Obj-9)`);
  state.lastTick = nowMs;
  saveState(state);
  return { opened: toOpen.length, resolved: toResolveKeys.length + orphanResolve.length, untaggedCode };
}

// CLI entry (only when run directly on the box)
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = tick();
  console.log(`[gov-checker] tick: opened=${r.opened} resolved=${r.resolved} untaggedCode=${r.untaggedCode}`);
}
