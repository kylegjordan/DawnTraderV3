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
  extractBatchId, batchIdToFileRegex, LEDGER_ROWS, GOV_REF, PLAN_LINE, extractLeadingBatchId,
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
// GOV_REF is resolved ONCE, in config.mjs (B-PLAN-CURRENCY-CHECK P58 (6)); GOV_BRANCH is its alias.
//
// ── B-PLAN-CURRENCY-CHECK N8 / P58 — ONE FETCH POINT, ONE SHA (Langston §10g N8, §10i P58 (1)-(6)) ──
// Before this, the poller fetched and captured its graded sha, and then the FIRST checker read ran a
// SECOND fetch here (ensureFetched), so a push landing between the two made every later read — and the
// evidence sha the poller stamps on a resolve — disagree. Now the poller calls resolveGovRefSha() IN PLACE
// OF its own fetch: it fetches `origin` once, REPORTS a failure (the poller's gov-fetch-failed path still
// fires), sets `_fetchedThisRun` so ensureFetched never fetches again in this process, and caches the sha
// in `_resolvedRef`. Every symbolic reader below reads `_resolvedRef ?? GOV_REF`, so every read lands on
// that one sha BY CONSTRUCTION. A process that never calls the resolver (the heartbeat, the backtest, the
// previews) keeps the symbolic GOV_REF and ensureFetched's own fetch, exactly as before.
let _fetchedThisRun = false;
let _resolvedRef = null;
let _resolution = null;
// Every git call in this module goes through `_git`, so a test can see the ref each read used without a
// repo or a network (__setGitExecForTest). The live value is execFileSync, called exactly as before.
let _exec = execFileSync;
const _git = (args, opts = {}) => _exec('git', args, { cwd: REPO_ROOT, ...opts });
const readRef = () => _resolvedRef ?? GOV_REF;
// TEST SEAM ONLY: swap the git exec (null restores execFileSync) and forget this process's fetch and
// resolution, so each test starts from a fresh process's state. Returns the previous exec.
export function __setGitExecForTest(fn) {
  const prev = _exec;
  _exec = fn || execFileSync;
  _fetchedThisRun = false; _resolvedRef = null; _resolution = null;
  return prev;
}
function ensureFetched() {
  if (_fetchedThisRun) return;
  _fetchedThisRun = true;
  try {
    const slash = GOV_REF.indexOf('/');
    const remote = slash > 0 ? GOV_REF.slice(0, slash) : 'origin';
    const branch = slash > 0 ? GOV_REF.slice(slash + 1) : GOV_REF;
    _git(['fetch', '--quiet', remote, branch], { encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
  } catch { /* offline / fetch fail → grade against whatever GOV_REF currently points at */ }
}
// THE one fetch point for a poller tick. Returns { fetchOk, fetchError, sha }, cached for the process.
// (1) fetches `origin`, as the poller's own fetch did (stderr is not captured, so it reaches the journal);
// (2) a failed fetch is RETURNED, not swallowed — fetchOk:false, sha:null, nothing resolved, and the reads
//     keep the symbolic GOV_REF (the poller grades nothing on a failed fetch);
// (3) sets `_fetchedThisRun` (no second fetch) and `_resolvedRef`;
// after a good fetch the sha is `rev-parse --verify GOV_REF^{commit}`, and a failure there THROWS out of
// the tick (fail-closed: there is no ref to grade at; the heartbeat's dead-man then fires).
// Pure (tested): the reason to refuse `ref`, or null. Refuse when its first path segment is a configured remote other
// than `origin` — the resolver fetches origin only, so any other remote's tracking ref would be graded stale.
export function govRefRemoteRefusal(ref, remotes) {
  const slash = String(ref).indexOf('/');
  const first = slash > 0 ? ref.slice(0, slash) : null;
  if (!first || first === 'origin' || !remotes.includes(first)) return null;
  return `GOV_REF ${JSON.stringify(ref)} names remote ${JSON.stringify(first)}; the checker fetches only origin — `
    + 'refusing rather than grading a stale remote-tracking ref';
}
export function resolveGovRefSha() {
  if (_resolution) return _resolution;
  // Step 4 G6-5 CONDITION 2 (Langston, 2026-09-30): this fetches `origin` only and then marks the process fetched, which
  // also stops ensureFetched's remote-aware fetch. A GOV_REF on ANOTHER remote would therefore be graded at whatever
  // stale sha that remote-tracking ref holds, with no warning (#449's shape). Silent-stale is the one outcome not
  // allowed, so such a GOV_REF is REFUSED outright: the tick throws (fail-closed; the heartbeat's dead-man fires).
  // Only a first segment that IS a configured remote counts — a local branch name that holds a slash is not a remote.
  let remotes = [];
  try { remotes = String(_git(['remote'], { encoding: 'utf8' })).split(/\s+/).filter(Boolean); } catch { remotes = []; }
  const refusal = govRefRemoteRefusal(GOV_REF, remotes);
  if (refusal) throw new Error(refusal);
  _fetchedThisRun = true;
  let fetchOk = true, fetchError = null;
  try { _git(['fetch', '--quiet', 'origin'], { timeout: 60000 }); }
  catch (e) { fetchOk = false; fetchError = String(e.message || e); }
  let sha = null;
  if (fetchOk) {
    sha = String(_git(['rev-parse', '--verify', `${GOV_REF}^{commit}`], { encoding: 'utf8' })).trim();
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error(`rev-parse ${GOV_REF}: not a commit sha: ${JSON.stringify(sha.slice(0, 80))}`);
    _resolvedRef = sha;
  }
  _resolution = { fetchOk, fetchError, sha };
  return _resolution;
}
// list basenames of files directly under `dir` AT `ref`; [] if the dir is absent at the ref. No fetch:
// the caller names the ref (the poller passes the resolved sha).
export function lsTreeNamesAt(ref, dir) {
  try {
    const out = _git(['ls-tree', '--name-only', ref, `${dir.replace(/\/+$/, '')}/`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return out.split('\n').filter(Boolean).map((p) => p.split('/').pop());
  } catch { return []; }
}
// read a file's content AT `ref`; null if the file is absent at the ref. No fetch (as lsTreeNamesAt).
export function showFileAt(ref, relPath) {
  try {
    return _git(['show', `${ref}:${relPath}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
}
// list basenames of files directly under `dir` AT GOV_REF (the resolved sha once the poller has resolved it).
export function lsTreeNames(dir) {
  ensureFetched();
  return lsTreeNamesAt(readRef(), dir);
}
// read a file's content AT GOV_REF (the resolved sha once resolved); null if the file is absent at the ref.
export function showFile(relPath) {
  ensureFetched();
  return showFileAt(readRef(), relPath);
}
export function gitLog(n = 200) {
  ensureFetched();
  const out = _git(['log', readRef(), `-n${n}`, '--pretty=COMMIT|%H|%cI|%s', '--name-only'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
// `names` (B-PLAN-CURRENCY-CHECK P34, Langston §10g C1): a listing the caller has ALREADY read — the plan rule
// reads the Batch Completion listing ONCE per tick and threads it through here, so one filter implementation
// serves both paths and no per-id ls-tree runs. Omitted, it is read here exactly as before.
export function findGlobDoc(batchId, docKey, names = lsTreeNames(DOCS[docKey].dir)) {
  const spec = DOCS[docKey];
  const re = batchIdToFileRegex(batchId);
  return names
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
    const out = _git(['log', readRef(), '--diff-filter=A', '--reverse', '--format=%cI', '--', gitPath(relPath)],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
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
// ── B-PLAN-CURRENCY-CHECK OBJ-1 (P33, P34; the re-cut's §1) — the PLAN-STATE check ─────────────────────────
// Grades the active plan's own obligation (its §3: "The owner updates its row at every batch close (status +
// report link)") as a STATE at the graded ref — no diff, no bound, no window (Langston §10d). PURE: text in, rows
// and legs out; the tick does the two reads (the plan and the Batch Completion listing, both at ONE resolved sha).
//
// planRowsByBatch — the exported plan-row JOIN (Langston Step-1 Q7: B-SLOT-PLACEMENT-CHECK's named input).
//   Lines are split on \n with one trailing \r stripped, numbered from 1. `## N.` starts section N; only §4 and
//   §5 are read (§0 and §6 are never graded). A table line is one whose trimmed text starts with `|`; its cells are
//   the trimmed line less ONE leading and ONE trailing `|`, split on every `|`, each trimmed (the plan carries no
//   `\|` escapes). §4: a line whose first cell is `#` is a header and must equal PLAN_LINE.s4Header after a
//   right-trim — EVERY such header, so a column added to one wave table fails closed instead of dropping that
//   wave (R1-Q12 (iii)); a separator is skipped; a line whose first cell is a row number (`35`, `138a`) is a row
//   when it has exactly the header's cell count, and otherwise goes to `malformed` with its line number and cell
//   count. §5: exactly ONE line equal to PLAN_LINE.s5Header (right-trimmed); its rows are the table lines after
//   it up to the first non-table line, separators skipped, the header's cell count exactly or `malformed`.
//   The id is extract(deMark(cell)) on the §4 BATCH cell or the §5 ITEM cell (the leading-token rule, so
//   `#628 — batch named at Step 1`, `plan row 6` and `F-G-1 (venue price grid)` have none: `unparsed`).
//   THROWS — never a partial join — on empty text, no §4 header, any §4 header that differs, or a §5 header
//   count other than one; the tick turns a throw into `gov-planline-unreadable` and grades nothing.
export function deMark(s) { return String(s ?? '').replace(/[*`]/g, '').replace(/\u00a0/g, ' ').trim(); }
function planCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}
const PLAN_SEPARATOR = /^\|[\s:|-]+\|?\s*$/;
const PLAN_ROW_NO = /^\d+[a-z]?$/;
export function planRowsByBatch(planText, extract = extractLeadingBatchId) {
  if (typeof planText !== 'string' || planText.trim() === '') throw new Error('the plan text is empty or absent');
  const s4Width = planCells(PLAN_LINE.s4Header).length, s5Width = planCells(PLAN_LINE.s5Header).length;
  const rows = new Map(), unparsed = [], malformed = [];
  const s4Headers = [], badHeaders = [], s5Headers = [];
  let rows4 = 0, rows5 = 0, section = null, inS5Table = false;
  const add = (row) => {
    if (!row.id) { unparsed.push(row); return; }
    if (!rows.has(row.id)) rows.set(row.id, { s4: [], s5: [] });
    rows.get(row.id)[row.section === 4 ? 's4' : 's5'].push(row);
  };
  planText.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, ''), lineNo = i + 1;
    const h = /^## (\d+)\./.exec(line);
    if (h) { section = Number(h[1]); inS5Table = false; return; }
    if (!line.trim().startsWith('|')) { inS5Table = false; return; }
    const cells = planCells(line);
    if (section === 4) {
      if (cells[0] === '#') { s4Headers.push(lineNo); if (line.trimEnd() !== PLAN_LINE.s4Header) badHeaders.push(lineNo); return; }
      if (PLAN_SEPARATOR.test(line.trim()) || !PLAN_ROW_NO.test(cells[0])) return;
      if (cells.length !== s4Width) { malformed.push({ section: 4, rowNo: cells[0], lineNo, cellCount: cells.length }); return; }
      rows4++;
      const [rowNo, item, batch, owner, status, report, note] = cells;
      add({ section: 4, rowNo, item, batch, owner, status, report, note, lineNo, id: extract(deMark(batch)) });
    } else if (section === 5) {
      if (line.trimEnd() === PLAN_LINE.s5Header) { s5Headers.push(lineNo); inS5Table = true; return; }
      if (!inS5Table || PLAN_SEPARATOR.test(line.trim())) return;
      if (cells.length !== s5Width) { malformed.push({ section: 5, rowNo: null, lineNo, cellCount: cells.length }); return; }
      rows5++;
      const [item, owner, closes, report] = cells;
      add({ section: 5, rowNo: null, item, owner, closes, report, lineNo, id: extract(deMark(item)) });
    }
  });
  if (s4Headers.length === 0) throw new Error(`no §4 table header (${PLAN_LINE.s4Header})`);
  if (badHeaders.length) throw new Error(`a §4 table header differs from PLAN_LINE.s4Header at line(s) ${badHeaders.join(', ')}`);
  if (s5Headers.length !== 1) {
    throw new Error(`the §5 header (${PLAN_LINE.s5Header}) appears ${s5Headers.length} times${s5Headers.length ? ` (lines ${s5Headers.join(', ')})` : ''}; exactly one is required`);
  }
  return { rows, unparsed, malformed, rows4, rows5 };
}

// The STATUS test — fail on the machine default only (Langston §10g N6): FAIL iff deMark(status) is EMPTY or
// matches /^queued\b/i. Empty = nothing left after markup is stripped and whitespace (NBSP included) and dash
// characters (- ‒ – — ― −) are removed: the plan's placeholder for an empty cell. Any other text passes — no
// terminal token (DONE, CLOSED, ✅) is ever looked for; the REPORT test is the real gate (R2).
// Nit (Langston G6-4): U+2010, U+2011 and U+FF0D are dashes too — a placeholder typed with one must read as EMPTY.
const PLAN_EMPTY_CELL = /^[\s\u2010-\u2015\u2212\uFF0D-]*$/;
export function statusIsDefault(cell) {
  const d = deMark(cell);
  return PLAN_EMPTY_CELL.test(d) || /^queued\b/i.test(d);
}
// The REPORT test — does the cell NAME `basename`? A basename match on the de-marked cell: the character before
// it is not a name character or `.` (so OLD_B_X_… and a path's `/` are told apart), and after it comes neither
// a name character nor a `.` that is followed by one — a sentence-final `.` is punctuation, `.bak` / `.md.2`
// are other files (re-cut §1.4, r2). A full path, a `Batch Completion/`-relative path, a bare name and a
// markdown link all pass.
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function cellNamesFile(cell, basename) {
  return new RegExp(`(?<![A-Za-z0-9_.-])${escRe(basename)}(?![A-Za-z0-9_-])(?!\\.[A-Za-z0-9_-])`).test(deMark(cell));
}
// checkPlanState(join, reportsFor) — the predicate (Langston §10g C1, C3, N6; §10j 3(a)). `reportsFor(bid)` →
// the basenames findGlobDoc resolves for the batch's completion report (INJECTED: the tick threads the ONE
// listing it read; nothing here calls completionReportCommitTime, C1). A batch is GRADED once it has a report
// and its id is in the plan. PER SECTION the id is in: 2+ rows FAIL as ambiguous; exactly one row is graded; 0
// rows = that leg is not required (no leg). The §4 row FAILs on the status test OR the report test; the §5 row
// (C′: its `report` column) on the report test. Returns { legs, graded }, one leg per REQUIRED leg:
//   { bid, leg: 's4'|'s5', fail, why: ('ambiguous'|'status'|'report')[], rowNos, lineNos, reports }.
export function checkPlanState(join, reportsFor) {
  const legs = [], graded = [];
  for (const [bid, sections] of join.rows) {
    const reports = reportsFor(bid) || [];
    if (reports.length === 0) continue;
    graded.push(bid);
    const named = (cell) => reports.some((n) => cellNamesFile(cell, n));
    for (const leg of ['s4', 's5']) {
      const rs = sections[leg];
      if (rs.length === 0) continue;
      const base = { bid, leg, rowNos: rs.map((r) => r.rowNo), lineNos: rs.map((r) => r.lineNo), reports };
      if (rs.length > 1) { legs.push({ ...base, fail: true, why: ['ambiguous'] }); continue; }
      const r = rs[0], why = [];
      if (leg === 's4' && statusIsDefault(r.status)) why.push('status');
      if (!named(r.report)) why.push('report');
      legs.push({ ...base, fail: why.length > 0, why });
    }
  }
  return { legs, graded };
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
