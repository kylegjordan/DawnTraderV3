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
  DEFAULT_CLASS, VALID_CLASSES, SHADOW_MODE, ENFORCEMENT_CUTOFF_MS,
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
export function decideOrphanSweep(openAlertKeys, enforceableIds, verify, isClassDeclared = () => false) {
  const resolve = [], keep = [];
  for (const key of openAlertKeys) {
    const docgap = /^gov-docgap:(.+):([^:]+)$/.exec(key);
    if (docgap) {
      const bid = docgap[1], doc = docgap[2];
      if (enforceableIds.has(bid)) continue;   // still in-window → handled by decideAlerts
      (verify(bid, doc) ? resolve : keep).push(key);
      continue;
    }
    // OBJ-2 (B-GOV-ORPHAN-CLASS): classundeclared orphans (out-of-window) — previously skipped here,
    // so a reclassified/parent-ride batch re-minted gov-classundeclared forever once it aged past the
    // window. Resolve when the batch's class IS declared (scope header OR a confirmed class-override);
    // keep it when genuinely undeclared (no cry-silence).
    const cls = /^gov-classundeclared:(.+)$/.exec(key);
    if (cls) {
      const bid = cls[1];
      if (enforceableIds.has(bid)) continue;   // still in-window → handled by decideAlerts
      (isClassDeclared(bid) ? resolve : keep).push(key);
      continue;
    }
    // other orphan key types are not swept here
  }
  return { resolve, keep };
}

// OBJ-4 (B-GOV-ORPHAN-CLASS) pure core: given the openAlerts dedup cache (dedupeKey→alertId) and the
// set of alert-ids that are still LIVE in the store (active/scheduled), return the cache keys whose id
// is no longer live and must be dropped. `liveIds === null` (store unreadable) → drop NOTHING
// (FAIL-OPEN: a store hiccup must never blind-prune a genuinely-open alert). PURE — the tick wraps it.
export function decideStaleOpenAlertDrops(openAlerts, liveIds) {
  if (!liveIds) return [];
  return Object.entries(openAlerts).filter(([, id]) => !liveIds.has(id)).map(([k]) => k);
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
  const confirmedOverride = opts.confirmedOverride || (() => false); // B-GOV-ORPHAN-CLASS OBJ-1 (injectable)
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
    // OBJ-1 (B-GOV-ORPHAN-CLASS) suppress-at-source: a confirmed class-override IS Langston answering
    // "is this class right?", so it must NOT re-open underdeclared. Guard the OPEN condition (do NOT
    // push to toResolveKeys downstream — that add-then-resolves every tick and flaps). The existing
    // `else` resolves it. (Langston Step-2 correction.)
    if (klass !== 'architecture' && s.files && coreCheck(s.files) && !confirmedOverride(s.batchId)) {
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

// B-GOV-INTEGRITY-1 seam (Layer-B, checker side): the resolve CLI now HARD-REQUIRES
// re-derivable evidence (isValidResolutionEvidence). The checker only ever resolves a
// doc-gap it has VERIFIED satisfied at the graded ref (docPresent / na-skip / condition-
// cleared), so it genuinely HAS evidence — it just has to pass it. The honest, universal,
// re-derivable token is the graded-ref sha: a reader does `git show <sha>:<doc>` (or parses
// the na-skip row at <sha>) to re-confirm exactly what the checker saw. gradedRefSha is set
// once per tick after the fetch; if it can't be computed, resolve falls back to the sanctioned
// `NO-EVIDENCE-GIVEN` sentinel — an HONEST admission, never a fabricated reference (#447).
let gradedRefSha = null;
function checkerResolveEvidence() {
  return (gradedRefSha && /^[0-9a-f]{7,40}$/i.test(gradedRefSha)) ? gradedRefSha : 'NO-EVIDENCE-GIVEN';
}
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
    const cmd = `cd ${STAGING_REPO} && npm run -s system-alerts -- resolve ${alertId} --by governance-checker --evidence ${checkerResolveEvidence()}`;
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
  // OBJ-4 (B-GOV-ORPHAN-CLASS): the set of alert-ids that are still LIVE in the store — i.e. every
  // NON-TERMINAL state. The lifecycle (server/services/system-alerts.ts:45) is scheduled → active →
  // acknowledged → resolved; only `resolved` is terminal. `acknowledged` is CLAIMED-but-unfixed work
  // and is STILL LIVE (OLD Claude Step-4 catch) — omitting it would drop the openAlerts key for an
  // acked alert and re-mint a DUPLICATE of claimed work. Used by tick() to reconcile state.openAlerts
  // (a dedup cache) against the store (the SSOT). Returns null on ANY read problem so the caller FAILS
  // OPEN (skips the prune) — a store-read hiccup must never blind-prune a genuinely-open alert.
  liveAlertIds() {
    if (SHADOW_MODE) return null;                 // shadow writes nothing → nothing to reconcile
    try {
      const ids = new Set();
      for (const st of ['active', 'acknowledged', 'scheduled']) {  // all non-resolved states
        const out = runCli(`cd ${STAGING_REPO} && npm run -s system-alerts -- list --state ${st}`);
        // FORMAT DEPENDENCY (Langston Step-4 watch-item): parses `id=<uuid>` from the system-alerts
        // `list` line format. The throw-based fail-open above covers a FAILED read; it does NOT cover a
        // successful exit-0 read whose OUTPUT FORMAT later drifts (that would yield an empty set → mass-
        // prune). If `system-alerts list` output ever changes, THIS regex is the blast site — keep in sync.
        for (const m of out.matchAll(/id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g)) ids.add(m[1]);
      }
      return ids;
    } catch { return null; }                      // FAIL-OPEN
  },
};
function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }

// Read the exceptions ledger from the GRADED REF, never the working tree. This is the #449
// root-cause fix: reading join(REPO_ROOT, …) let a stale checkout honour 1 na-skip row while
// origin carried 10, so every exception filed after the box's last redeploy was invisible and
// the checker manufactured a flood of false doc-gap alerts. checker.mjs:28 already declares the
// invariant — "all reads go through GOV_REF after a fetch, never a stale copy" — and docPresent
// honours it; loadExceptions was the one place that violated it. origin is fetched by
// gitFetchAndLog() earlier this tick, so `git show BRANCH:<path>` sees the pushed state.
// FAIL-LOUD: an unreadable/empty rulebook must THROW, never fall back to an empty exception set —
// that silent-{} default is the original defect in a new mask (no suppressions ⇒ false-alarm flood,
// or, if the grader ever trusted it, silent under-enforcement). tick() catches the throw, raises a
// critical alert, and refuses to grade rather than grade permissively.
function readGovernedExceptions() {
  const relPath = '1-system-manual/GOVERNANCE_EXCEPTIONS.md';
  const raw = execFileSync('git', ['show', `${BRANCH}:${relPath}`],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (!raw || !raw.trim()) {
    throw new Error(`governed read of ${relPath} at ${BRANCH} returned empty — refusing to grade with no rulebook (#449 fail-loud)`);
  }
  return raw;
}

function loadExceptions() {
  const open = new Set(), openSince = new Map(), naConfirmed = new Set(), classOverride = new Map();
  // ONE confirmed-semantics predicate, reused by every row type (Langston B-GOV-ORPHAN-CLASS Step-1):
  // a disposition counts only when a real confirmer signed it (not the literal 'pending' placeholder).
  const isConfirmed = (by) => Boolean(by) && by !== 'pending';
  for (const line of readGovernedExceptions().split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 7) continue;
    const [, ts, bid, type, value, confirmedBy] = cells;
    if (!bid || bid.startsWith('_')) continue;
    if (type === 'open' && isConfirmed(confirmedBy)) { open.add(bid); const m = value.match(/\d{4}-\d{2}-\d{2}T[\d:]+Z/); if (m) openSince.set(bid, Date.parse(m[0])); }
    if (type === 'na-skip' && isConfirmed(confirmedBy)) naConfirmed.add(`${bid}:${value}`);
    // OBJ-1 (B-GOV-ORPHAN-CLASS): a CONFIRMED class-override row DECLARES the batch's class, so a
    // parent-ride sub-batch with no scope-header (B8.2b/c, B8.4b) stops re-minting gov-classundeclared.
    // value shape: `declared:<class> heuristic:<class>`. FAIL-CLOSED: an unconfirmed/pending row, or a
    // declared value that is not a VALID_CLASSES member, is IGNORED → the batch stays undeclared.
    if (type === 'class-override' && isConfirmed(confirmedBy)) {
      const m = value.match(/declared:(\w+)/);
      if (m && VALID_CLASSES.includes(m[1].toLowerCase())) classOverride.set(bid, m[1].toLowerCase());
    }
  }
  return { open, openSince, naConfirmed, classOverride };
}

// #490 recurrence guard ("who checks the checker"): detect when the DEPLOYED checker CODE has
// drifted from origin. #449 recurred once because the box silently fell 388 commits behind and
// nobody noticed — a manual git pull was a patch, not a fix. Compare the checker's OWN LOADED code
// (the exact files `node poller.mjs` executes) against origin's; if they differ, the box is running
// logic that no longer matches what was reviewed and pushed. Scoped to the loaded files ONLY (NOT the
// whole repo, NOT even the whole checker subtree) so a routine governance-doc push never trips it — the
// checker's code changes ~5×/90d, docs push thousands of times (#490: grade the code, not the repo
// count; and grade what the process LOADS, not what sits beside it). origin is already fetched this
// tick. A rev-parse failure is NOT drift — don't manufacture a false alarm.
// Narrowed per Langston's drift-guard ruling (2026-07-11): hash ONLY the files the poller process
// actually LOADS, not the whole subtree. `ExecStart=node poller.mjs`; poller imports `./config.mjs`
// + `./checker.mjs`; checker imports `./config.mjs`; config imports nothing local — so the complete
// graded-logic closure is exactly {poller.mjs, checker.mjs, config.mjs}. The other files in the dir
// (README.md, poller.test.mjs, backtest/heartbeat scripts, the .service/.timer units) are NOT the
// enforcer, so a docs/test/unit-only push must NOT flip the drift signal (that was the surviving
// false-positive in the subtree predicate). ★ CONSCIOUSLY ACCEPTED (Langston Step-4, 2026-07-11): a
// `.service`/`.timer` change (e.g. a changed `ExecStart`, or the auto-redeploy drop-in itself) is now
// OUT OF SCOPE for THIS check — it is the unit that STARTS poller, not logic poller RUNS. Deploy-config
// drift is a separate concern (the drop-in is box-side config, not repo-graded); this guard answers
// only "is the running GRADING LOGIC current?". rev-parse failure → drifted:false (fail-open, never a
// manufactured false STALE — a git hiccup can't disable the enforcer).
const DRIFT_LOADED_FILES = ['poller.mjs', 'checker.mjs', 'config.mjs'];
function checkerCodeDrift() {
  try {
    const hashAt = (ref) => DRIFT_LOADED_FILES
      .map(f => execFileSync('git', ['rev-parse', `${ref}:scripts/governance-checker/${f}`],
        { cwd: REPO_ROOT, encoding: 'utf8' }).trim())
      .join('|');
    const local = hashAt('HEAD');
    const origin = hashAt(BRANCH);
    return { drifted: local !== origin, local, origin };
  } catch (e) {
    return { drifted: false, error: String(e.message || e) };
  }
}

export function tick(nowMs = Date.now()) {
  const state = loadState();
  // OBJ-0 (auto-redeploy auditability, Langston Step-4 add #1): emit a POSITIVE per-tick record of
  // which deployed code version is running, so correctness doesn't lean solely on F9's canary FIRING
  // (a negative signal). The ExecStartPre ff-only pull keeps this current; this line makes it auditable.
  try {
    const runningSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    console.log(`[gov-checker] poller running at deployed HEAD ${runningSha}`);
  } catch { /* non-fatal: a rev-parse failure must never abort a tick */ }
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
  // Layer-B evidence seam (#447): capture the exact ref sha this tick grades at, so every resolve
  // the checker issues carries a re-derivable reference (`git show <sha>:<doc>`) that Layer-A can
  // shape-validate. Set only after a confirmed fetch; if it can't be computed, checkerResolveEvidence()
  // falls back to the sanctioned NO-EVIDENCE-GIVEN sentinel rather than fabricate one.
  try {
    gradedRefSha = execFileSync('git', ['rev-parse', BRANCH], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch { gradedRefSha = null; }
  if (state.openAlerts[FETCH_KEY]) { alertSink.resolve(state.openAlerts[FETCH_KEY]); delete state.openAlerts[FETCH_KEY]; }
  // OBJ-4 (B-GOV-ORPHAN-CLASS): per-tick store-reconcile. state.openAlerts is only a dedup cache; the
  // alert STORE is the SSOT. Snapshot the live (active+scheduled) id set ONCE here — BEFORE the drift/
  // exceptions/decideAlerts adds so the prune can't race this tick's own writes (Langston Step-2) — and
  // drop any cached key whose id is no longer live (resolved out-of-band). Otherwise the stale key
  // SUPPRESSES a legitimate re-open via the dedup guard and openAlerts silently re-accumulates (#352).
  // FAIL-OPEN: liveAlertIds() returns null on any read problem → skip the prune this tick.
  const liveIds = alertSink.liveAlertIds();
  for (const k of decideStaleOpenAlertDrops(state.openAlerts, liveIds)) delete state.openAlerts[k];
  // #490 recurrence guard: warn if the deployed checker code has drifted from origin, so a silent
  // redeploy gap can never again let the box grade with stale logic the way #449 hid for two weeks.
  const DRIFT_KEY = 'gov-code-drift';
  const drift = checkerCodeDrift();
  if (drift.drifted) {
    if (!state.openAlerts[DRIFT_KEY]) {
      const id = alertSink.add({ dedupeKey: DRIFT_KEY, severity: 'warning',
        title: 'governance-checker code is STALE vs origin — redeploy the checker box',
        body: `Deployed checker loaded-code (poller.mjs|checker.mjs|config.mjs) ${drift.local} differs from origin ${drift.origin}. The box is ` +
          `running governance logic that no longer matches what was reviewed and pushed; grading may be wrong. ` +
          `Redeploy scripts/governance-checker/ (git pull on the checker box) and this clears. (#490 recurrence guard.)` }, nowMs);
      if (id) state.openAlerts[DRIFT_KEY] = id;
    }
  } else if (state.openAlerts[DRIFT_KEY]) {
    alertSink.resolve(state.openAlerts[DRIFT_KEY]); delete state.openAlerts[DRIFT_KEY];
  }
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
  // #449 fail-loud: loadExceptions now reads the ledger at the graded ref and THROWS on an empty/
  // unreadable rulebook. An enforcer that cannot read its suppressions must refuse to grade, not
  // grade permissively — grading with an empty exception set would re-open every legitimately-
  // dispositioned batch. Mirror the fetch-fail contract: raise a critical alert, persist, exit the
  // tick with zero opens/resolves so nothing is mis-graded off a rulebook we could not read.
  let exceptions;
  try {
    exceptions = loadExceptions();
  } catch (e) {
    const EXC_KEY = 'gov-exceptions-unreadable';
    const body = `The governance checker could not read GOVERNANCE_EXCEPTIONS.md at ${BRANCH}: ${String(e.message || e).slice(0, 300)}. ` +
      `Refusing to grade this tick — grading with no rulebook would re-open every dispositioned batch (#449). No alerts opened or resolved. Investigate the checker's git access to the ref.`;
    if (!state.openAlerts[EXC_KEY]) {
      const id = alertSink.add({ dedupeKey: EXC_KEY, severity: 'critical',
        title: `governance-checker cannot read its rulebook at ${BRANCH} — grading paused`, body }, nowMs);
      if (id) state.openAlerts[EXC_KEY] = id;
    }
    state.lastTick = nowMs; saveState(state);
    return { opened: 0, resolved: 0, untaggedCode: 0, fetchOk: true, rulebookUnreadable: true };
  }
  // rulebook read cleanly — clear any prior unreadable alert.
  if (state.openAlerts['gov-exceptions-unreadable']) {
    alertSink.resolve(state.openAlerts['gov-exceptions-unreadable']);
    delete state.openAlerts['gov-exceptions-unreadable'];
  }
  // OBJ-1 (B-GOV-ORPHAN-CLASS): apply confirmed class-overrides here — AFTER loadExceptions (the
  // readDeclaredClass loop at :466 ran before the ledger was read) and BEFORE decideAlerts. PRECEDENCE:
  // a confirmed override WINS over the in-header change-class (the override is the Langston-confirmed
  // human disposition, gated on confirmed_by; the header is a self-authored mechanical declaration).
  // The supersede log goes to stdout → journald (durable, not console-scroll — Langston Step-2).
  for (const b of enforceable) {
    const ovr = exceptions.classOverride.get(b.batchId);
    if (!ovr) continue;
    if (b.classDeclared && b.declaredClass && b.declaredClass !== ovr) {
      console.log(`[gov-checker] class-override ${b.batchId} supersedes header ${b.declaredClass} -> ${ovr} (confirmed)`);
    }
    b.declaredClass = ovr;
    b.classDeclared = true;
  }
  const confirmedOverride = (bid) => exceptions.classOverride.has(bid);
  const { toOpen, toResolveKeys } = decideAlerts(enforceable, exceptions, nowMs, { confirmedOverride });
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
  // OBJ-1/2/3 (B-GOV-ORPHAN-CLASS): resolve an out-of-window batch's EFFECTIVE class — a confirmed
  // class-override WINS over the scope header (same precedence as the in-window path at :492).
  const classFor = (bid) => exceptions.classOverride.get(bid) || readDeclaredClass(bid).class;
  const isClassDeclared = (bid) => exceptions.classOverride.has(bid) || readDeclaredClass(bid).declared;
  // OBJ-3: class-aware verifyDoc — an aged-out doc-gap resolves when the doc is present, na-confirmed,
  // OR NOT REQUIRED for the batch's class. Reuse checkBatchDocset's effectiveRequired (class.required ∪
  // REQUIRED_IF) so a P19 hotfix STILL requires phase_19_plan and a genuinely-missing required doc stays
  // surfaced (no cry-silence — Langston's prior Step-2 Finding 2 preserved).
  const verifyDoc = (bid, doc) => {
    if (docPresent(bid, doc) || exceptions.naConfirmed.has(`${bid}:${doc}`)) return true;
    const required = checkBatchDocset(bid, classFor(bid), { requiredOnly: true }).required;
    return !(doc in required); // doc not in the effective required set for this class → not owed
  };
  const { resolve: orphanResolve, keep: orphanKeep } =
    decideOrphanSweep(Object.keys(state.openAlerts), enforceableIds, verifyDoc, isClassDeclared);
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
