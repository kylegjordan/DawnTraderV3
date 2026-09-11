// B-GOV governance-checker — deterministic mechanical core.
// Pure presence/emptiness/citation checks over the repo tree + git history.
// NO LLM, NO network beyond `git`. The live poller (next increment) wraps this with
// the deadline timer, the systemd tick, and the alert-queue wiring.
//
// 🚨 SCAFFOLDING NOTE (§9.1): this module proves the DETECTION CORE only. It does NOT
//    yet run as a live watcher, does NOT write to the §10.5 alert queue, and does NOT
//    dispatch to Langston. Those are the next B-GOV increment. Until then the checker
//    is INERT in production — it only runs on demand (the backtest harness).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  DOCS, CLASS_DOCSET, DEFAULT_CLASS, HOLLOW_NET_LINE_FLOOR, REQUIRED_IF,
  CODE_PREFIXES, GOVERNANCE_PREFIXES, HOUSEKEEPING_ONLY_PATHS, HOUSEKEEPING_ONLY_BASENAMES,
  SCOPE_DIR, CHANGE_CLASS_MARKER, VALID_CLASSES, CORE_ENGINE_PATHS,
  extractBatchId, batchIdToFileRegex, LEDGER_ROWS,
} from './config.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
// OBJ-5 (B-GOV-ORPHAN-CLASS): git object paths are FORWARD-SLASH only. `path.join` emits
// backslashes off-Linux (Windows-side runs/tests), so a git path built with join() breaks the
// `git show ${GOV_REF}:${relPath}` read → null → no-marker → wrong architecture default. Use this
// posix join for anything fed to a git ref read; keep node's `join` only for real filesystem paths.
const sjoin = (...parts) => parts.join('/');

// ── git ──────────────────────────────────────────────────────────────────────
// Kyle 2026-06-24 fix: GRADE AGAINST THE PUSHED BRANCH REF, not the working tree. Staging lags origin
// between deploys, so reading doc files from the working tree made the checker see new batch commits but
// MISS their (existing) doc files → a flood of false "missing doc" alerts. All commit + file reads now go
// through GOV_REF after a fetch, so the checker always grades the actual pushed state, never a stale copy.
const GOV_REF = process.env.GOV_REF || process.env.GOV_BRANCH || 'origin/migration/aws-supabase';
let _fetchedThisRun = false;
function ensureFetched() {
  if (_fetchedThisRun) return;
  _fetchedThisRun = true;
  try {
    const slash = GOV_REF.indexOf('/');
    const remote = slash > 0 ? GOV_REF.slice(0, slash) : 'origin';
    const branch = slash > 0 ? GOV_REF.slice(slash + 1) : GOV_REF;
    execFileSync('git', ['fetch', '--quiet', remote, branch],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
  } catch { /* offline / fetch fail → grade against whatever GOV_REF currently points at */ }
}
// list basenames of files directly under `dir` AT GOV_REF; [] if the dir is absent at the ref.
export function lsTreeNames(dir) {
  ensureFetched();
  try {
    const out = execFileSync('git', ['ls-tree', '--name-only', GOV_REF, `${dir.replace(/\/+$/, '')}/`],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\n').filter(Boolean).map((p) => p.split('/').pop());
  } catch { return []; }
}
// read a file's content AT GOV_REF; null if the file is absent at the ref.
export function showFile(relPath) {
  ensureFetched();
  try {
    return execFileSync('git', ['show', `${GOV_REF}:${relPath}`],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
}
export function gitLog(n = 200) {
  ensureFetched();
  const out = execFileSync('git', ['log', GOV_REF, `-n${n}`, '--pretty=COMMIT|%H|%cI|%s', '--name-only'],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const commits = [];
  let cur = null;
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('COMMIT|')) {
      if (cur) commits.push(cur);
      const [, hash, date, subject] = line.split('|');
      cur = { hash, date, subject, files: [] };
    } else if (line.trim() && cur) {
      cur.files.push(line.trim());
    }
  }
  if (cur) commits.push(cur);
  return commits;
}

export function classifyCommit(files) {
  const code = files.some((f) => CODE_PREFIXES.some((p) => f.startsWith(p)));
  const governance = files.some((f) => GOVERNANCE_PREFIXES.some((p) => f.startsWith(p)));
  const housekeepingOnly = files.length > 0 && files.every((f) =>
    HOUSEKEEPING_ONLY_PATHS.some((p) => f.startsWith(p)) ||
    HOUSEKEEPING_ONLY_BASENAMES.some((b) => f === b || f.endsWith('/' + b)));
  return { code, governance, housekeepingOnly };
}

// ── presence ─────────────────────────────────────────────────────────────────
// file-glob doc: does a file in `dir` whose name matches BOTH the batch-id and the
// doc's `match` pattern exist? Returns the matching path(s).
export function findGlobDoc(batchId, docKey) {
  const spec = DOCS[docKey];
  const re = batchIdToFileRegex(batchId);
  return lsTreeNames(spec.dir)
    .filter((name) => re.test(name) && spec.match.test(name))
    .map((name) => join(spec.dir, name));
}

// entry doc: does the batch-id appear inside the shared append-style doc?
export function findEntryDoc(batchId, docKey) {
  const spec = DOCS[docKey];
  const content = showFile(spec.path);
  if (content === null) return false;
  return batchIdToFileRegex(batchId).test(content);
}

export function docPresent(batchId, docKey) {
  const spec = DOCS[docKey];
  if (spec.kind === 'file-glob') return findGlobDoc(batchId, docKey).length > 0;
  if (spec.kind === 'entry') return findEntryDoc(batchId, docKey);
  return false;
}

// ── B-GOV-4 OBJ-3/4: shared closed-detection primitive (git FIRST-ADD commit time) ───────────
// The SINGLE source of truth for "when did this batch close / re-open", consumed by BOTH the
// OBJ-3 closed-quiescent anchor and the OBJ-4 doc-set sentinel (no split-brain on "closed").
// Anchored on the FIRST-ADD commit of the doc (`git log --diff-filter=A --reverse … | head -1`),
// NOT `-1`/latest-touch: a later governance-backfill or doc-reorg EDIT to a closed batch's report
// must NOT drag the close event forward and re-un-grandfather it (Langston Step-2 #1 — the
// B-NEW-40 bug through a different door). The first-add is immutable once the file exists.
// (Delete+re-add at the same path anchors on the ORIGINAL add = the real first close, which is the
// intended close semantics — Langston Step-3; correct-by-construction on the linear branch history,
// no ancestor-guard needed.) Reuses findGlobDoc → the same id↔filename mapping as everywhere else.
function gitPath(p) { return p.replace(/\\/g, '/'); } // forward slashes for git (cross-platform)
function firstAddCommitMs(relPath) {
  ensureFetched();
  try {
    const out = execFileSync('git',
      ['log', GOV_REF, '--diff-filter=A', '--reverse', '--format=%cI', '--', gitPath(relPath)],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const first = out.split('\n').find(Boolean); // --reverse ⇒ oldest ADD first
    return first ? Date.parse(first) : null;
  } catch { return null; }
}
// Earliest first-add time across the batch's matching doc(s); null if the doc is absent at GOV_REF.
export function completionReportCommitTime(batchId) {
  const times = findGlobDoc(batchId, 'completion_report').map(firstAddCommitMs).filter((t) => t !== null);
  return times.length ? Math.min(...times) : null;
}

// ── B-TASK-LIST-SLOT (#1009) P1: a Tier-1 LEDGER ROW, graded inside the completion report ──────────────
// The DOCS table sees whether a DOCUMENT exists; it cannot see a ROW inside one. Measured 2026-09-09: a
// session writing a completion report COPIES THE PREVIOUS REPORT rather than opening
// workflow-10-governance, so a row added to the skill reaches nobody who copies a predecessor — 1 of 3
// reports since the task-list row landed carried it, and the one that did was written after Kyle asked.
// PURE: does `text` carry the Tier-1 LEDGER ROW for `spec`, filled in with the owning session's ✅?
//   A LEDGER ROW is a markdown table line (≤3 spaces indent, optionally inside `>` blockquote markers), OUTSIDE a
//   CommonMark fenced code block, that NAMES the row (`spec.names`) AND carries its tier marker — a cell beginning
//   `T1`, exactly as workflow-10-governance's ledger template does. The tier marker is what separates the ledger
//   row from an objectives row that happens to mention the task lists (object-round reader r2, finding 5).
//   VERDICT CELLS are the cells that BEGIN with a ledger token (`✅`, `N/A`, `❌`), other than the FIRST cell that names
//   the row — so a name cell that starts with ✅ is never the verdict, while a verdict cell that mentions a list's
//   FILENAME still counts (CC-C's real row, B_EXIT_BOOK_AGE_STAMP:90, does exactly that; r3 alerted on it).
//   PASS iff the FIRST verdict cell does not begin with ❌ AND some verdict cell has a segment (split on / · , ;)
//   beginning with ✅. r4: the T1 marker must be the FIRST cell; the excluded name cell must sit in the document
//   position (cell 0 or 1); ★/⭐ are stripped; names match on text with * and ` removed.
//   ⇒ `✅ mine / N/A ×3`, `N/A ×3 / ✅ mine`, and `N/A for CC-B | ✅ mine` PASS;
//   ⇒ `❌ | ✅ (note)`, `❌ not done (should be ✅)`, `N/A — not ✅ yet`, `⚠️ ✅ partial` FAIL (⚠️ is not a token);
//   ⇒ prose, an objectives row, the skill's template row left empty, and a row inside a fence FAIL.
//   Fences follow CommonMark: an opener is ≥3 backticks or tildes with ≤3 spaces indent (a backtick info string
//   may not contain a backtick, so ```x``` at a line start is inline code); it closes only on the same character,
//   at least as long, with nothing after it; an UNCLOSED fence runs to the end of the file, as it renders.
const LEDGER_TOKEN = /^(✅|N\/A|❌)/i;
const TIER_CELL = /^T1\b/i;
// r4 (reader r3): names are matched on DE-MARKED text so `**session** task lists` still names the row.
const nameText = (s) => s.replace(/[*`]/g, '').replace(/\u00a0/g, ' ');
export function ledgerRowInText(text, spec) {
  if (typeof text !== 'string') return false;
  let fence = null, comment = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    // r5 (Langston Step 4, finding 1a): strip blockquote markers FIRST, so a fence inside a blockquote is seen.
    const body = line.replace(/^ {0,3}(> ?)+/, '');
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(body);
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && f[2].trim() === '') fence = null;
      continue;
    }
    if (f && !(f[1][0] === '`' && f[2].includes('`'))) { fence = { ch: f[1][0], len: f[1].length }; continue; }
    // r5 (finding 1b): an HTML comment does not render, so a row inside one does not count.
    if (comment) { if (body.includes('-->')) comment = false; continue; }
    if (/^ {0,3}<!--/.test(body)) { if (!body.slice(body.indexOf('<!--') + 4).includes('-->')) comment = true; continue; }
    // r5 (finding 2): GFM allows a row with no LEADING pipe; the first cell is then the text before the first pipe.
    // Such a row needs at least two pipes, so a prose sentence that starts "T1 …" and contains one pipe is not a row.
    if (!body.includes('|') || !spec.names.test(nameText(body))) continue;
    const lead = /^ {0,3}\|/.test(body);
    if (!lead && body.split('|').length < 3) continue;
    const rawCells = lead ? body.split('|').slice(1) : body.split('|');
    const cells = rawCells.map((c) => c.replace(/[*`_\[\]★⭐]/g, '').trim());
    // r4: the tier marker must be the FIRST cell — `T1` at the start of a notes cell does not make a row a ledger row.
    if (!TIER_CELL.test(cells[0] || '')) continue;
    // r4: only a naming cell in the DOCUMENT position (cell 0 merged with the tier, or cell 1) is excluded from the
    // verdicts; a verdict cell further right that mentions a list's filename still counts.
    const nameIdx = rawCells.findIndex((c) => spec.names.test(nameText(c)));
    const verdicts = cells.filter((c, i) => !(i === nameIdx && i <= 1) && LEDGER_TOKEN.test(c));
    // r4: only the FIRST verdict cell can veto with ❌, so a later notes cell such as `❌ none outstanding` does not.
    if (verdicts.length && verdicts[0].startsWith('❌')) continue;
    if (verdicts.some((c) => c.split(/[\/·,;]/).some((seg) => seg.trim().startsWith('✅')))) return true;
  }
  return false;
}

// Per batch: { <row>: true | false | null }. null = NOT GRADED — no completion report at GOV_REF, or the
// report was first added before the row existed (LEDGER_ROWS[row].sinceMs). Any one of the batch's
// reports carrying the row satisfies it. A converted PROGRESS report counts from its conversion commit:
// the rename reads as an ADD to firstAddCommitMs's path-limited `--diff-filter=A` (verified 2026-09-11 on
// B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md → status A at 8e7e1ba9c). Progress reports themselves are
// outside the population on purpose: the row's trigger is a batch CLOSE, and a progress report is open.
// `io` is injectable so the date gate and the read-failure path are unit-testable without git; the live
// callers pass nothing and get the real readers. KNOWN EDGES, stated: a batch's date is its EARLIEST report
// (a re-opened batch whose first report predates `sinceMs` is not graded); a failed `git show` reads as a
// missing row (⇒ alert, the same failure direction as docPresent), while a failed `git ls-tree` reads as
// no report (⇒ not graded) — tick() aborts before grading when its own fetch fails. A failed `git log` in
// firstAddCommitMs ALSO returns null ⇒ not graded ⇒ an OPEN alert RESOLVES — the opposite direction from a failed
// `git show`; it shows as a flap plus a spurious governance-checker resolve, not a silent loss (Langston Step 4, c4).
// INHERITED EDGE (reader r2): the
// report list comes from findGlobDoc → batchIdToFileRegex (config.mjs), which accepts a separator-led suffix, so
// a batch id can match a NEIGHBOUR's report (`B-DISCORD` ↔ `B_DISCORD_<X>_COMPLETION_REPORT.md`): the earliest
// of them sets the date and any of them can carry the row. Every doc-set check shares this; not changed here.
export function checkLedgerRows(batchId, io = { findGlobDoc, completionReportCommitTime, showFile }) {
  const out = {};
  const reports = io.findGlobDoc(batchId, 'completion_report');
  const addedMs = reports.length ? io.completionReportCommitTime(batchId) : null;
  for (const [row, spec] of Object.entries(LEDGER_ROWS)) {
    if (addedMs === null || addedMs < spec.sinceMs) { out[row] = null; continue; }
    out[row] = reports.some((p) => ledgerRowInText(io.showFile(gitPath(p)), spec));
  }
  return out;
}
// LATEST scope first-add (Math.MAX, not min) — Langston Step-4 Finding 1. The re-open signal is a
// NEW scope rev filed AFTER the completion report; Math.min would always collapse to the original
// Step-1 scope (< completion) and the re-open branch would be inert (cry-silence on a genuine
// re-open). Math.max keys on the newest scope add, so a post-close scope rev trips re-open. Its only
// false-positive — a doc-reorg RENAME re-adding a CLOSED batch's scope post-completion → reads as a
// re-open → re-grades — is HARMLESS: a properly-closed batch has a complete doc-set, so re-grading
// fires no doc-gap (deadline already resolved, class declared). LIMITATION (§11): detection requires
// a new scope FILE; an IN-PLACE edit to the existing scope is a modify, invisible to --diff-filter=A
// (acceptable — a real re-open files a new scope rev or, by convention, uses a new (sub-)batch id).
export function scopeCommitTime(batchId) {
  const times = findGlobDoc(batchId, 'scope').map(firstAddCommitMs).filter((t) => t !== null);
  return times.length ? Math.max(...times) : null;
}

// ── emptiness (Obj-3 / C7 / C10) ──────────────────────────────────────────────
// Strip whitespace-only, pure-date-bump, TOC-reorder, and heading-only lines, then
// count remaining net content lines. A file at/under HOLLOW_NET_LINE_FLOOR is hollow.
const DATE_ONLY = /^[-*\s>|]*\d{4}-\d{2}-\d{2}[\s.,:)\]]*$/;
const HEADING_ONLY = /^#{1,6}\s/;
const TOC_LINE = /^\s*[-*]\s*\[.*\]\(#.*\)\s*$/;
export function netContentLines(text) {
  return text.split('\n').map((l) => l.trim()).filter((l) =>
    l && !DATE_ONLY.test(l) && !HEADING_ONLY.test(l) && !TOC_LINE.test(l) &&
    !/^[-=_*]{3,}$/.test(l));
}
export function isHollowFile(relPath) {
  const content = showFile(relPath);
  if (content === null) return true;
  return netContentLines(content).length <= HOLLOW_NET_LINE_FLOOR;
}

// ── pre-audit structural check (Obj-4) ─────────────────────────────────────────
// Filed + cites SIM/System-Manual + carries code-level (file:line) markers.
const FILE_LINE = /[\w./-]+\.(ts|tsx|mjs|js|sql|md):\d+/;
const CITES_SIM = /SYSTEM_IMPACT_MAP|\bSIM\b/i;
const CITES_MANUAL = /SYSTEM_MANUAL|System Manual/i;
export function preAuditStructure(batchId) {
  const paths = findGlobDoc(batchId, 'pre_audit');
  if (paths.length === 0) return { filed: false };
  const text = showFile(paths[0]) || '';
  const fileLineCount = (text.match(new RegExp(FILE_LINE, 'g')) || []).length;
  return {
    filed: true,
    path: paths[0],
    citesSim: CITES_SIM.test(text),
    citesManual: CITES_MANUAL.test(text),
    fileLineCitations: fileLineCount,
  };
}

// ── per-batch mechanical doc-set check ─────────────────────────────────────────
export function checkBatchDocset(batchId, klass = DEFAULT_CLASS, { requiredOnly = false } = {}) {
  const set = CLASS_DOCSET[klass] || CLASS_DOCSET[DEFAULT_CLASS];
  // effective required = class-required ∪ predicate-required (REQUIRED_IF, e.g. phase_19_plan
  // for P19-* batches — Langston Step-4 d).
  const effectiveRequired = [...new Set([
    ...set.required,
    ...Object.keys(REQUIRED_IF).filter((doc) => REQUIRED_IF[doc](batchId)),
  ])];
  const out = { batchId, klass, required: {}, conditional: {}, missingRequired: [] };
  for (const doc of effectiveRequired) {
    const present = docPresent(batchId, doc);
    out.required[doc] = present;
    if (!present) out.missingRequired.push(doc);
  }
  if (!requiredOnly) {
    for (const doc of set.conditional) {
      if (doc in out.required) continue; // promoted to required by predicate
      out.conditional[doc] = docPresent(batchId, doc);
    }
  }
  return out;
}

// recent distinct batch-ids from git history (most-recent first)
export function recentBatchIds(n = 200) {
  const seen = new Map();
  for (const c of gitLog(n)) {
    const bid = extractBatchId(c.subject);
    if (bid && !seen.has(bid)) seen.set(bid, c.date);
  }
  return [...seen.keys()];
}

// ── B-GOV-2 OBJ-1: read a batch's DECLARED change-class from its scope-file header ──
// Resolves the scope file from SCOPE_DIR (filename contains the batch-id), parses the
// `change-class:` marker. Returns { class, declared, scopePath } — class falls back to
// DEFAULT_CLASS (strictest) when undeclared/missing/unparseable (fail-closed, Langston).
export function readDeclaredClass(batchId) {
  const re = batchIdToFileRegex(batchId);
  // prefer a file whose name has the batch-id AND looks like a scope (not pre-audit/change-list)
  // .sort() for deterministic selection when a batch has multiple scope files (Langston Step-4 a).
  const candidates = lsTreeNames(SCOPE_DIR).filter((n) => re.test(n) && /SCOPE/i.test(n)).sort();
  if (candidates.length === 0) return { class: DEFAULT_CLASS, declared: false, scopePath: null, reason: 'no-scope-file' };
  for (const name of candidates) {
    const text = showFile(sjoin(SCOPE_DIR,name));
    if (text === null) continue;
    const m = text.match(CHANGE_CLASS_MARKER);
    if (m) {
      const cls = m[1].toLowerCase();
      if (VALID_CLASSES.includes(cls)) return { class: cls, declared: true, scopePath: sjoin(SCOPE_DIR,name), reason: 'declared' };
      return { class: DEFAULT_CLASS, declared: false, scopePath: sjoin(SCOPE_DIR,name), reason: `invalid-class:${cls}` };
    }
  }
  return { class: DEFAULT_CLASS, declared: false, scopePath: sjoin(SCOPE_DIR,candidates[0]), reason: 'no-marker' };
}

// ── B-GOV-2 OBJ-2: path-heuristic under-declaration guard ──
// True if the batch's changed files touch a CORE ENGINE path. Pure (caller supplies the
// file list from the batch's commits) so it is unit-testable without git.
export function diffTouchesCoreEngine(files) {
  return files.some((f) => CORE_ENGINE_PATHS.some((p) => f.includes(p)));
}
