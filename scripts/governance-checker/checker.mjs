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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  DOCS, CLASS_DOCSET, DEFAULT_CLASS, HOLLOW_NET_LINE_FLOOR, REQUIRED_IF,
  CODE_PREFIXES, GOVERNANCE_PREFIXES, HOUSEKEEPING_ONLY_PATHS, HOUSEKEEPING_ONLY_BASENAMES,
  extractBatchId, batchIdToFileRegex,
} from './config.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

// ── git ──────────────────────────────────────────────────────────────────────
export function gitLog(n = 200) {
  const out = execFileSync('git', ['log', `-n${n}`, '--pretty=COMMIT|%H|%cI|%s', '--name-only'],
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
  const dir = join(REPO_ROOT, spec.dir);
  if (!existsSync(dir)) return [];
  const re = batchIdToFileRegex(batchId);
  return readdirSync(dir)
    .filter((name) => re.test(name) && spec.match.test(name))
    .map((name) => join(spec.dir, name));
}

// entry doc: does the batch-id appear inside the shared append-style doc?
export function findEntryDoc(batchId, docKey) {
  const spec = DOCS[docKey];
  const p = join(REPO_ROOT, spec.path);
  if (!existsSync(p)) return false;
  const content = readFileSync(p, 'utf8');
  return batchIdToFileRegex(batchId).test(content);
}

export function docPresent(batchId, docKey) {
  const spec = DOCS[docKey];
  if (spec.kind === 'file-glob') return findGlobDoc(batchId, docKey).length > 0;
  if (spec.kind === 'entry') return findEntryDoc(batchId, docKey);
  return false;
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
  const p = join(REPO_ROOT, relPath);
  if (!existsSync(p)) return true;
  return netContentLines(readFileSync(p, 'utf8')).length <= HOLLOW_NET_LINE_FLOOR;
}

// ── pre-audit structural check (Obj-4) ─────────────────────────────────────────
// Filed + cites SIM/System-Manual + carries code-level (file:line) markers.
const FILE_LINE = /[\w./-]+\.(ts|tsx|mjs|js|sql|md):\d+/;
const CITES_SIM = /SYSTEM_IMPACT_MAP|\bSIM\b/i;
const CITES_MANUAL = /SYSTEM_MANUAL|System Manual/i;
export function preAuditStructure(batchId) {
  const paths = findGlobDoc(batchId, 'pre_audit');
  if (paths.length === 0) return { filed: false };
  const text = readFileSync(join(REPO_ROOT, paths[0]), 'utf8');
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
