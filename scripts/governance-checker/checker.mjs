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
  extractBatchId, batchIdToFileRegex,
} from './config.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

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
    const text = showFile(join(SCOPE_DIR, name));
    if (text === null) continue;
    const m = text.match(CHANGE_CLASS_MARKER);
    if (m) {
      const cls = m[1].toLowerCase();
      if (VALID_CLASSES.includes(cls)) return { class: cls, declared: true, scopePath: join(SCOPE_DIR, name), reason: 'declared' };
      return { class: DEFAULT_CLASS, declared: false, scopePath: join(SCOPE_DIR, name), reason: `invalid-class:${cls}` };
    }
  }
  return { class: DEFAULT_CLASS, declared: false, scopePath: join(SCOPE_DIR, candidates[0]), reason: 'no-marker' };
}

// ── B-GOV-2 OBJ-2: path-heuristic under-declaration guard ──
// True if the batch's changed files touch a CORE ENGINE path. Pure (caller supplies the
// file list from the batch's commits) so it is unit-testable without git.
export function diffTouchesCoreEngine(files) {
  return files.some((f) => CORE_ENGINE_PATHS.some((p) => f.includes(p)));
}
