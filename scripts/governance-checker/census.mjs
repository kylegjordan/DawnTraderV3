// B-PLAN-CURRENCY-CHECK OBJ-3 / OBJ-8 (P43, P45) and OBJ-4 (P46) — the weekly plan census and the weekly
// mistake-pattern pass: the RULES and the ALERT TEXT. PURE over text, with the git readers injected, so every
// rule is unit-tested on fixtures (census.test.mjs) and the offline dry run (P44) reads the same code.
//
// ⛔ DORMANT: nothing here runs unless poller.mjs's maybeRunWeekly is reached with WEEKLY_CENSUS_ENABLED or
// MISTAKE_PASS_ENABLED true (config.mjs — read the values there; this comment states none). The flags guard the RUN, not the
// LOAD: poller.mjs imports this module statically, so this file lands in (or before) the commit whose
// poller.mjs imports it (P40 round 2), and it is in DRIFT_LOADED_FILES (P29).
//
// Rules as ruled (pre-audit §1.1 R1-R3 and §6 P43; scope §10e, §10h; the Group-2 spec §1). Where a ruling
// left a reading open, the reading is stated at the rule and put to Step 4 in the change list.
//   R1 widened (R2-Q7 (a), Q27 subsumed) · R2 + OWNER lines, `#696` excluded by name (R1-Q3, Q25) and R2 not
//   widened to `by/before/until` (R3-Q6 (b)) · R3 with the backtick widening and the §0-reference rule
//   (Q22 (i)) · list (d) leg (1) dropped, leg (2) under (b) with its excluded set (R2-Q2) · the CLOSED test
//   read at the cell's start or after a leading `<id> … — ` (R2-Q3 (b)) · list (b)'s note cells only in the
//   named homing forms (R1-Q13 (c)) · every batch id on a HOME line places, "Parked by Kyle" counts as placed
//   as its own sub-count (Q9 (b)) · reused numbers listed every week (Q28 (b)) · owners widened and LABELLED,
//   a `(CC-x` head token printed as `filer` (R3-Q9) · the §6 recount (R3-Q7) · list (a)'s first window is the
//   branch as of 7 days before the first fire (R1-Q14 (b)) · no F-G pattern (Q7: the grammar is config.mjs's).
//
// Every read is `git show <ref>:<path>` at the ONE sha the tick graded (gradedRefSha); a null or empty read
// REFUSES (throws), as does a ledger with zero heads, a plan with zero §4 rows or an empty Batch Completion
// listing. A throw is the census's failure — maybeRunWeekly turns it into `gov-census-failed` and does not
// record the week, so the next tick retries.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BATCH_ID_PATTERNS, extractLeadingBatchId, batchIdToFileRegex, DOCS, CENSUS_BODY_MAX, isoWeek } from './config.mjs';
import { findGlobDoc, showFileAt, lsTreeNamesAt } from './checker.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');

export const CENSUS_SOURCES = {
  ledger: '1-system-manual/RUNNING_ISSUES.md',
  plan: '1-system-manual/SPRINT_TO_LIVE_PLAN.md',
  afterLive: 'Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md',
  roadmap: '1-system-manual/POST_AUDIT_ROADMAP.md',
  reportsDir: DOCS.completion_report.dir,
  // A2 (Langston, W40): the committed handover records — one per census week that handed items to their owners.
  handoverDir: 'Claude Comms and Packages/Scope Files',
};
export const HANDOVER_FILE_RE = /_CENSUS_\d{4}-W\d\d_HANDOVER\.md$/;
export const CENSUS_KEY_PREFIX = 'gov-plancensus:';
export const MISTAKEPASS_KEY_PREFIX = 'gov-mistakepass:';
export const CENSUS_FAILED_KEY = 'gov-census-failed';
export const MISTAKEPASS_FAILED_KEY = 'gov-mistakepass-failed';
// The full lists are also written to the box before the add (§10e Q19); env-overridable so a test or an
// off-box run writes elsewhere. The metadata copy is capped (METADATA_MAX_BYTES) with a stated marker.
export const CENSUS_BOX_DIR = process.env.GOV_CENSUS_DIR || '/var/lib/governance-checker/census';
export const METADATA_MAX_BYTES = 64 * 1024;
export const TITLE_MAX = 80;
export const CENSUS_OWNER = 'CC-A';
export const CENSUS_ACTION = 'run the weekly census worklist; resolve this row when the listed items are dispositioned';
// Q25 (scope §10h): `#696`'s `due 2026-08-20` is the date of a data read — a length-is-the-content date, not a
// deadline. Excluded BY NAME and listed with this reason, never silently dropped.
export const DATED_EXCLUSIONS = { 696: 'length-is-the-content date (the date of a data read, not a deadline), Langston Q25, scope §10h' };

const DAY_MS = 86400000;
const lines = (text) => text.split('\n').map((l) => l.replace(/\r$/, ''));
const deMark = (s) => String(s ?? '').replace(/[*`]/g, '').replace(/\u00a0/g, ' ').trim();
const cpLen = (s) => Array.from(s).length;           // code points, so an emoji counts once
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── batch ids: config.mjs's grammar, IMPORTED (P43 round-1 correction (3)), token-bounded ─────────────────
// No letter, digit or hyphen before; no letter, digit, underscore, `-<alnum>` or `.<digit>` after.
const ID_BODY = BATCH_ID_PATTERNS.map((re) => `(?:${re.source})`).join('|');
const ID_RE = new RegExp(`(?<![A-Za-z0-9-])(?:${ID_BODY})(?![A-Za-z0-9_])(?!-[A-Za-z0-9])(?!\\.\\d)`, 'g');
export function idsIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(ID_RE)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}
export function hasId(text, id) {
  return new RegExp(`(?<![A-Za-z0-9-])${esc(id)}(?![A-Za-z0-9_])(?!-[A-Za-z0-9])(?!\\.\\d)`).test(String(text ?? ''));
}
const hasNum = (text, n) => new RegExp(`#${n}(?!\\d)`).test(String(text ?? ''));

// ── sessions (owner display; the §6 recount) ─────────────────────────────────────────────────────────────
const SESSION_RE = /\b(CC-(?:A|B|C|INFRA)|OLD Claude|NEW Claude|ANALYST(?: Claude)?|Infra Claude)\b/i;
const SESSION_RE_G = new RegExp(SESSION_RE.source, 'gi');
export function sessionOf(token) {
  const t = String(token).toUpperCase();
  if (t === 'CC-A' || t === 'OLD CLAUDE') return 'CC-A';
  if (t === 'CC-B' || t === 'NEW CLAUDE') return 'CC-B';
  if (t === 'CC-C' || t.startsWith('ANALYST')) return 'CC-C';
  if (t === 'CC-INFRA' || t === 'INFRA CLAUDE') return 'CC-INFRA';
  return null;
}
// The FIRST session named in a cell (the plan's owner cells read "CC-A (Old Claude)", "Infra Claude").
export function firstSession(cell) {
  const m = SESSION_RE.exec(String(cell ?? ''));
  return m ? sessionOf(m[1]) : null;
}

// ══ THE LEDGER — R1 widened ══════════════════════════════════════════════════════════════════════════════
export const HEAD_RE = /^(?:#{2,4} |- \*\*|\*\*)#(\d+)\b(.*)$/;
const CLOSING = new Set(['CLOSED', 'RESOLVED', 'WITHDRAWN', 'DONE', 'FIXED']);
const S1_WORD = /\b(OPEN|CLOSED|RESOLVED|WITHDRAWN|DONE|FIXED)\b/g;
// The self-contradicting detector (R2-Q7 (a); Group-2 spec §1.1, which asks Group 7 to state its own): an S1 head
// line that ALSO carries a closing, retraction or disposition word BEFORE its final OPEN, INSIDE THE HEAD'S OWN
// STATEMENT — for a `- **` / `**` head, the first bold span (the leading `**` to the next `**`); for a `### ` head,
// the whole line. Hand-checked at c6751f5b3 against the crude "anywhere on the line" rule's 8: it keeps #348, #450,
// #456, #532 (the ruled fixtures) and #1098 (`✅ CLOSED` in its head); it drops #374 (`✅ code DONE` is OBJ-A's),
// #385 (`#386 RETRACTED` is another issue's) and #408 (a retracted sub-claim) — each word sits in body prose after
// the head's bold span. #451 (PREMISE REFUTED … THE ISSUE SURVIVES) is not listed under either rule.
const CONTRADICTS = /\b(RESOLVED|CLOSED|WITHDRAWN|RETRACTED|DISPOSITIONED|DONE|FIXED)\b/g;
export function headStatement(line) {
  const m = /^(?:- )?\*\*(.*?)\*\*/.exec(line);
  return m ? m[1] : line;
}

// R1's status word: repeat — delete the leading run of [^A-Za-z(]; if the text then starts with `(`, delete
// through the matching balanced `)` — until nothing changes; the first [A-Za-z]+ run, upper-cased.
export function statusWord(text) {
  let s = String(text ?? '');
  for (;;) {
    const before = s;
    s = s.replace(/^[^A-Za-z(]+/, '');
    if (s.startsWith('(')) {
      let depth = 0, cut = -1;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') { depth--; if (depth === 0) { cut = i; break; } }
      }
      s = cut === -1 ? '' : s.slice(cut + 1);
    }
    if (s === before) break;
  }
  const m = /^[A-Za-z]+/.exec(s);
  return m ? m[0].toUpperCase() : '';
}

// S1 on one head line: after deleting every `*`, the LAST status word is OPEN and it starts within the line's
// last 150 characters (code points). Returns the line with `*` deleted and the OPEN's index, or null.
function s1OnLine(line) {
  const l = line.replace(/\*/g, '');
  const ms = [...l.matchAll(S1_WORD)];
  if (ms.length === 0) return null;
  const last = ms[ms.length - 1];
  if (last[1] !== 'OPEN') return null;
  if (cpLen(l.slice(0, last.index)) < cpLen(l) - 150) return null;
  return { text: l, openAt: last.index };
}

export function parseLedger(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error(`census: ${CENSUS_SOURCES.ledger} read is empty or absent — refusing`);
  const L = lines(text);
  const heads = [];
  L.forEach((l, i) => { const m = HEAD_RE.exec(l); if (m) heads.push({ i, n: Number(m[1]), rest: m[2], word: statusWord(m[2]) }); });
  if (heads.length === 0) throw new Error(`census: ${CENSUS_SOURCES.ledger} has ZERO entry heads — refusing (the parse, not the ledger, is wrong)`);
  const headLines = new Set(heads.map((h) => h.i));
  const byNum = new Map();
  heads.forEach((h, k) => {
    if (!byNum.has(h.n)) byNum.set(h.n, { n: h.n, heads: [], words: new Set(), block: [] });
    const e = byNum.get(h.n);
    const end = k + 1 < heads.length ? heads[k + 1].i : L.length;
    e.heads.push({ ...h, end });
    e.words.add(h.word);
    for (let j = h.i; j < end; j++) e.block.push({ line: j + 1, text: L[j] });
  });
  const openR1 = new Set(), s1 = new Set(), s2 = new Set(), selfContradicting = [], reused = [];
  for (const e of byNum.values()) {
    const closed = [...e.words].some((w) => CLOSING.has(w));
    if (e.words.has('OPEN') && !closed) openR1.add(e.n);
    if (e.heads.filter((h) => h.word === 'OPEN').length >= 2) reused.push(e.n);
    if (e.words.has('OPEN') || closed) continue;           // the widening applies only to numbers with no status head
    // Step 4 G7-2 (Langston): the self-contradicting detector below also runs ONLY on these no-status-head entries, so its
    // count (5 at c6751f5b3) is a count of THAT subset — never a ledger-wide figure.
    for (const h of e.heads) {
      const hit = s1OnLine(L[h.i]);
      if (hit) {
        s1.add(e.n);
        const stmt = headStatement(L[h.i]).replace(/\*/g, '');
        const stmtAt = hit.text.indexOf(stmt);          // the statement's offset in the `*`-free line
        const earlier = stmtAt === -1 ? null
          : [...stmt.matchAll(CONTRADICTS)].find((m) => stmtAt + m.index < hit.openAt);
        if (earlier && !selfContradicting.some((x) => x.issue === e.n)) {
          selfContradicting.push({ issue: e.n, headLine: h.i + 1, filer: filerOf(e), reason: `head carries "${earlier[1]}" before its final OPEN` });
        }
      }
      let k = h.i + 1;
      while (k < L.length && L[k].trim() === '') k++;
      if (k < L.length && !headLines.has(k) && statusWord(L[k]) === 'OPEN') s2.add(e.n);
    }
  }
  const open = new Set([...openR1, ...s1, ...s2]);
  return { lines: L, heads, byNum, openR1, s1, s2, open, selfContradicting, reused: reused.sort((a, b) => a - b) };
}

// The `(CC-x` head token — the FILER, not the owner (R3-Q9).
function filerOf(e) {
  for (const h of e.heads) { const m = /\((CC-(?:A|B|C|INFRA))\b/.exec(h.rest); if (m) return m[1]; }
  return null;
}

// R3-Q9: owners widened, measured and LABELLED. Sources, in display precedence: a session on an OWNER line
// of the issue's text (`owner` case-insensitive; the first session within 30 characters after it); a session
// named on a HOME line; else the head's `(CC-x` token printed as `filer`; else `owner ?`.
export function ownerOfIssue(e) {
  let ownerLine = null, homeLine = null;
  for (const { text } of e.block) {
    if (!ownerLine) {
      const m = /\bOWNER\b(.{0,30})/i.exec(text);
      const s = m && SESSION_RE.exec(m[1]);
      if (s) ownerLine = sessionOf(s[1]);
    }
    if (!homeLine && /\bHOME\b/.test(text)) { const s = SESSION_RE.exec(text); if (s) homeLine = sessionOf(s[1]); }
  }
  const filer = filerOf(e);
  if (ownerLine) return { label: `owner ${ownerLine}`, source: 'ownerLine', ownerLine, homeLine, filer };
  if (homeLine) return { label: `owner ${homeLine}`, source: 'homeLine', ownerLine, homeLine, filer };
  if (filer) return { label: `filer ${filer}`, source: 'filer', ownerLine, homeLine, filer };
  return { label: 'owner ?', source: 'unknown', ownerLine, homeLine, filer };
}

// ══ A2 — handover records (Langston, W40) ═════════════════════════════════════════════════════════════
// A handover record names, by id, the items a census week handed to their owners. It states its date as
// `handed over <YYYY-MM-DD>`, and its items as `| \`#N\` |` table rows under `## THE SETS` (up to the next `## `).
// A record with no date or no items is refused: a record that names nothing would make every item read as never
// surfaced, which is the absent-as-valid shape this exists to prevent.
export function parseHandover(text, name = 'handover record') {
  const dm = /handed over\**\s*\**\s*(\d{4}-\d\d-\d\d)/.exec(text || '');   // bold around the words or the date
  if (!dm) throw new Error(`census: ${name} states no "handed over <date>" — refusing`);
  const L = lines(text), issues = new Set();
  let on = false;
  for (const l of L) {
    if (/^## /.test(l)) on = /^## THE SETS\b/.test(l);
    else if (on) { const m = /^\|\s*`#(\d+)`\s*\|/.exec(l); if (m) issues.add(Number(m[1])); }
  }
  if (issues.size === 0) throw new Error(`census: ${name} names no items under "## THE SETS" — refusing`);
  return { date: dm[1], issues };
}

// ══ R2 — dated homes (list (c)) ══════════════════════════════════════════════════════════════════════════
const DUE_RE = /\bdue\b\W{0,3}(20\d\d-\d\d-\d\d)/gi;
// HISTORY-STRUCK (W40, NEW Claude's finding, measured: all 13 list-(c) lines were this): OBJ-8's conversion form records
// the old home as a history note — `This home READ "<old text>" until <date>` or `(Was: "<old>"` / `(Was <old>, due …` —
// and the old text carries the old due date. A match is struck when it sits inside a double-quoted span whose opening
// quote directly follows `READ` or `Was` (`:` optional), or inside a parenthetical that opens with `Was`. Narrow on
// purpose: a live `HOME: … due <date>`, quoted or not, still hits. RESIDUALS (Langston, named not fixed): the match is
// case-insensitive, so lowercase prose `was "…"` strikes too; and the parenthetical arm needs only NO `)` before the date,
// so an UNCLOSED `(Was …` strikes a live `due` later on the same line; and the quote test is a PARITY scan that assumes
// balanced quotes before the match, so one stray earlier `"` flips it — striking a live date or missing a struck one.
// None of the three shapes occurs among the 13 lines at 13fa6bbce. ⚠️ LIMIT: after this fix the corpus holds NO live dated
// home, so list (c)'s ability to fire is proven on fixtures only — a future 0 does not prove itself (#546).
export function historyStruck(line, idx) {
  let q = -1;
  for (let k = 0; k < idx; k++) if (line[k] === '"') q = q === -1 ? k : -1;   // q = the opening quote idx is inside, or -1
  if (q !== -1 && /\b(READ|Was):?\s*$/i.test(line.slice(0, q))) return true;
  const open = line.lastIndexOf('(', idx);
  if (open !== -1 && !line.slice(open, idx).includes(')') && /^\(\s*Was\b/i.test(line.slice(open))) return true;
  return false;
}
// For each OPEN issue: its SPAN is every line from each head to the line before the next head, stopping early at
// a `# ` or `## ` heading. A span line qualifies on `\bHOME\b` (case-SENSITIVE) or `\bOWNER\b` (case-INSENSITIVE,
// R1-Q3). A match is `due` + up to 3 non-word characters + an ISO date, unless the character right before `due`
// is `"` or `` ` `` (QUOTED-STRUCK), or it is HISTORY-STRUCK (`historyStruck`, above). `opts.owner=false` gives R2 as first
// written; `opts.exclusions` the Q25 set.
export function datedHomes(ledger, openSet = ledger.open, opts = {}) {
  const owner = opts.owner ?? true, exclusions = opts.exclusions ?? DATED_EXCLUSIONS;
  const L = ledger.lines, found = new Map(), excluded = [];
  for (const e of ledger.byNum.values()) {
    if (!openSet.has(e.n)) continue;
    const hits = [];
    for (const h of e.heads) {
      for (let j = h.i; j < h.end; j++) {
        if (j > h.i && (L[j].startsWith('# ') || L[j].startsWith('## '))) break;
        if (!(/\bHOME\b/.test(L[j]) || (owner && /\bOWNER\b/i.test(L[j])))) continue;
        for (const m of L[j].matchAll(DUE_RE)) {
          if (m.index > 0 && '"`'.includes(L[j][m.index - 1])) continue;
          if (historyStruck(L[j], m.index)) continue;
          hits.push({ line: j + 1, date: m[1] });
        }
      }
    }
    if (hits.length === 0) continue;
    if (exclusions[e.n]) excluded.push({ issue: e.n, lines: [...new Set(hits.map((h) => h.line))], reason: exclusions[e.n] });
    else found.set(e.n, hits);
  }
  const issues = [...found.keys()].sort((a, b) => a - b);
  const lineCount = [...found.values()].reduce((s, hs) => s + new Set(hs.map((h) => h.line)).size, 0);
  const matchCount = [...found.values()].reduce((s, hs) => s + hs.length, 0);
  return { issues, byIssue: found, lineCount, matchCount, excluded };
}

// ══ THE PLAN ═════════════════════════════════════════════════════════════════════════════════════════════
function tableCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}
const SEPARATOR = /^\|[\s:|-]+\|?\s*$/;
export function parsePlan(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error(`census: ${CENSUS_SOURCES.plan} read is empty or absent — refusing`);
  const L = lines(text);
  const s0 = [], s4 = [], s5 = [], s6 = [];
  const sec = { 0: [], 4: [], 5: [], 6: [] };
  let section = null;
  L.forEach((line, i) => {
    const h = /^## (\d+)\./.exec(line);
    if (h) { section = Number(h[1]); return; }
    if (section in sec) sec[section].push(line);
    if (!line.trim().startsWith('|') || SEPARATOR.test(line.trim())) return;
    const c = tableCells(line), lineNo = i + 1;
    if (section === 0 && c.length === 3 && c[0] !== 'session') s0.push({ lineNo, session: c[0], inFlight: c[1], disposition: c[2] });
    else if (section === 4 && c.length === 7 && /^\d+[a-z0-9]*$/.test(c[0])) {   // ids like 2a0b (#1139 P1)
      const [rowNo, item, batch, owner, status, report, note] = c;
      s4.push({ lineNo, rowNo, item, batch, owner, status, report, note });
    } else if (section === 5 && c.length >= 3 && c[0] !== 'item') s5.push({ lineNo, item: c[0], owner: c[1], closes: c[2], report: c[3] ?? '' });
    else if (section === 6 && c.length === 3 && c[0] !== 'session') s6.push({ lineNo, session: c[0], group: c[1], items: c[2] });
  });
  if (s4.length === 0) throw new Error(`census: ${CENSUS_SOURCES.plan} has ZERO §4 rows — refusing`);
  return { s0, s4, s5, s6, s6Text: sec[6].join('\n') };
}

// R2-Q3 (b): a cell reads CLOSED only when the marker (✅, CLOSED or DONE) OPENS the cell, or directly follows a
// leading `<id> … — ` (the first em dash after the cell's leading batch id).
export function cellClosed(cell) {
  const d = deMark(cell);
  const MARK = /^(?:✅|(?:CLOSED|DONE)\b)/i;
  if (MARK.test(d)) return true;
  const id = extractLeadingBatchId(d);
  if (!id) return false;
  const dash = d.indexOf('—', id.length);
  return dash !== -1 && MARK.test(d.slice(dash + 1).trimStart());
}
const s0Closed = (r) => cellClosed(r.inFlight) || cellClosed(r.disposition);

export function parseAfterLive(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error(`census: ${CENSUS_SOURCES.afterLive} read is empty or absent — refusing`);
  const afterLive = [], parked = [];
  let where = null;
  for (const line of lines(text)) {
    if (/^## /.test(line)) { where = line.startsWith('## After live') ? afterLive : line.startsWith('## Parked by Kyle') ? parked : null; continue; }
    if (where && line.startsWith('- ')) where.push(line);
  }
  return { afterLive, parked };
}

const RM_ROW = /^\|\s*(\d{1,2}(?:[-.]\d+[a-z]?)+)\s*\|/;
export function parseRoadmap(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error(`census: ${CENSUS_SOURCES.roadmap} read is empty or absent — refusing`);
  const rows = lines(text).filter((l) => RM_ROW.test(l));
  return { rows, ids: new Set(rows.map((l) => RM_ROW.exec(l)[1])) };
}

// ══ LIST (b) — OPEN issues with no placement ═════════════════════════════════════════════════════════════
// R1-Q13 (c): a §4 row places by its ITEM and BATCH cells always; its NOTE cell only in a named homing form —
// `+ #N`, `carries #N`, `this row IS #N`, `with #N` (target optionally backticked). Read here for a HOME batch
// id in the same forms as for `#N` (the ruling names the forms, not the target kind — put to Step 4).
const HOMING_FORM = '(?:\\+|\\bcarries|\\bthis row IS|\\bwith)\\s+`?';
function noteHomesNum(note, n) { return new RegExp(`${HOMING_FORM}#${n}(?!\\d)`, 'i').test(note); }
function noteHomesId(note, id) { return new RegExp(`${HOMING_FORM}${esc(id)}(?![A-Za-z0-9_])(?!-[A-Za-z0-9])(?!\\.\\d)`, 'i').test(note); }

export const UNPLACED_WHY = {
  U1: 'no HOME line', U2: 'a HOME batch has a completion report', U3: 'HOME cites the roadmap in prose only',
  U4: 'HOME cites PHASE_19_PLAN or a row with no id', U5: 'HOME batch in no list', U6: 'HOME line with no id',
};
// `noteCells`: 'named' (the ruled rule, (c)) or 'any' (the as-built rule, (a)) — the dry run reports both.
export function placement(ledger, plan, pls, roadmap, reportNames, opts = {}) {
  const noteCells = opts.noteCells ?? 'named';
  const res = new Map();
  const inRow = (r, test, noteTest) => test(r.item) || test(r.batch) || (noteCells === 'any' ? test(r.note) : noteTest(r.note));
  for (const n of [...ledger.open].sort((a, b) => a - b)) {
    const e = ledger.byNum.get(n);
    const homeLines = e.block.map((b) => b.text).filter((t) => /\bHOME\b/.test(t));
    const homeIds = [...new Set(homeLines.flatMap(idsIn))];
    const numIn = (t) => hasNum(t, n);
    if (plan.s4.some((r) => inRow(r, numIn, (note) => noteHomesNum(note, n))) || pls.afterLive.some(numIn)) { res.set(n, 'number'); continue; }
    if (homeIds.some((id) => plan.s4.some((r) => inRow(r, (t) => hasId(t, id), (note) => noteHomesId(note, id))) || pls.afterLive.some((l) => hasId(l, id)))) { res.set(n, 'homeBatch'); continue; }
    if (pls.parked.some(numIn) || homeIds.some((id) => pls.parked.some((l) => hasId(l, id)))) { res.set(n, 'parked'); continue; }
    const rmNum = roadmap.rows.some(numIn);
    const rmHome = homeLines.some((l) => /POST_AUDIT_ROADMAP|roadmap/i.test(l) &&
      [...l.matchAll(/\b\d{1,2}(?:[-.]\d+[a-z]?)+\b/g)].some((m) => roadmap.ids.has(m[0])));
    if (rmNum || rmHome) { res.set(n, 'roadmap'); continue; }
    if (homeLines.length === 0) { res.set(n, 'U1'); continue; }
    if (homeIds.some((id) => findGlobDoc(id, 'completion_report', reportNames).length > 0)) { res.set(n, 'U2'); continue; }
    if (homeLines.some((l) => /POST_AUDIT_ROADMAP|roadmap/i.test(l))) { res.set(n, 'U3'); continue; }
    if (homeIds.length === 0 && homeLines.some((l) => /PHASE_19_PLAN|\bplan row\b|\brow \d/i.test(l))) { res.set(n, 'U4'); continue; }
    res.set(n, homeIds.length ? 'U5' : 'U6');
  }
  return res;
}

// ══ LIST (d) — §4 rows with no parseable batch-cell id (R2-Q2: leg (1) dropped; leg (2) under (b)) ═══════════
// Listed when the batch cell has no leading id AND (the status is not QUEUED — pointer rows (`plan row N`) and
// rows whose status reads closed are EXCLUDED from this leg — OR the item cell is exactly one batch id).
export function listD(plan) {
  const out = [], excluded = [];
  for (const r of plan.s4) {
    if (extractLeadingBatchId(deMark(r.batch))) continue;
    const item = deMark(r.item), itemIsId = extractLeadingBatchId(item) === item && item !== '';
    const notQueued = !/^queued\b/i.test(deMark(r.status));
    const pointer = /^plan row \d/i.test(deMark(r.batch)), closed = cellClosed(r.status);
    const statusLeg = notQueued && !pointer && !closed;
    if (statusLeg || itemIsId) { out.push({ row: r.rowNo, why: itemIsId ? 'item cell is one batch id' : `status "${deMark(r.status).slice(0, 40)}"`, owner: firstSession(r.owner) }); continue; }
    if (notQueued) excluded.push({ row: r.rowNo, reason: pointer ? 'pointer row (plan row N)' : 'status reads closed' });
  }
  return { rows: out, excluded };
}

// ══ LIST (e) — `after X` references that name no earlier row (R3; Q22 (i); the §0-reference rule) ════════════
const AFTER_I = /\bafter `?([#A-Za-z0-9:._-]*[#:A-Z0-9][#A-Za-z0-9:._-]*)`?/g;
const AFTER_ROW = /\bafter row (\d+[a-z0-9]*(?:\.[a-z0-9]+)?)\b/g;   // deeper ids AND the dotted suffix (#1139 P1, Langston C1)
const AFTER_S0 = /\bafter §0 `?([#A-Za-z0-9:._-]*[#:A-Z0-9][#A-Za-z0-9:._-]*)`?/g;
const batchTokens = (cell) => new Set((String(cell).replace(/[*`]/g, '').match(/[#A-Za-z0-9._-]+/g) || []).map((t) => t.replace(/\.+$/, '')));
export function listE(plan) {
  const rows = plan.s4, s0Ids = new Set(plan.s0.flatMap((r) => idsIn(r.inFlight)));
  const refs = [], unmatched = [], viaS0 = [];
  let rowRefs = 0; const rowUnmatched = [];
  const earlierHas = (i, x) => rows.slice(0, i).some((e) => e.rowNo === x || batchTokens(e.batch).has(x));
  rows.forEach((r, i) => {
    for (const m of r.note.matchAll(AFTER_I)) {
      const x = m[1].replace(/[.:,]+$/, '');
      refs.push({ row: r.rowNo, target: x });
      if (earlierHas(i, x)) continue;
      if (s0Ids.has(x)) { viaS0.push({ row: r.rowNo, target: x }); continue; }
      const later = rows.slice(i + 1).find((e) => e.rowNo === x || batchTokens(e.batch).has(x));
      unmatched.push({ row: r.rowNo, target: x, why: later ? `later (row ${later.rowNo})` : 'names no row', owner: firstSession(r.owner) });
    }
    for (const m of r.note.matchAll(AFTER_S0)) {
      const x = m[1].replace(/[.:,]+$/, '');
      refs.push({ row: r.rowNo, target: `§0 ${x}` });
      if (s0Ids.has(x)) viaS0.push({ row: r.rowNo, target: x });
      else unmatched.push({ row: r.rowNo, target: `§0 ${x}`, why: 'names no §0 line', owner: firstSession(r.owner) });
    }
    for (const m of r.note.matchAll(AFTER_ROW)) {
      rowRefs++;
      if (!rows.slice(0, i).some((e) => e.rowNo === m[1])) rowUnmatched.push({ row: r.rowNo, target: `row ${m[1]}`, why: 'names no earlier row', owner: firstSession(r.owner) });
    }
  });
  return { refs, unmatched, viaS0, rowRefs, rowUnmatched };
}

// ══ PLAN LINES WITH A REPORT — lists (a) and (f) ═════════════════════════════════════════════════════════
// Plan lines: §4 batch cells, §0 in-flight cells, §5 item cells; each id on them (config.mjs grammar).
export function planLines(plan) {
  const out = [];
  for (const r of plan.s4) for (const id of idsIn(r.batch)) out.push({ key: `§4:${r.rowNo}:${id}`, id, closed: cellClosed(r.status), owner: firstSession(r.owner), where: `§4 row ${r.rowNo}` });
  for (const r of plan.s0) for (const id of idsIn(r.inFlight)) out.push({ key: `§0:${id}`, id, closed: s0Closed(r), owner: firstSession(r.session), where: '§0' });
  for (const r of plan.s5) for (const id of idsIn(r.item)) out.push({ key: `§5:${id}`, id, closed: cellClosed(r.closes), owner: firstSession(r.owner), where: '§5' });
  return out;
}
// (f): closed-less lines whose id has a completion-named file. NEW = not in the previous census's set (condition 3).
export function listF(plan, reportNames, prevF) {
  const all = planLines(plan).filter((p) => !p.closed && findGlobDoc(p.id, 'completion_report', reportNames).length > 0);
  const prev = new Set(prevF || []);
  const keys = [...new Set(all.map((p) => p.key))];
  return { all: keys, ids: [...new Set(all.map((p) => p.id))], new: all.filter((p) => !prev.has(p.key)) };
}
// (a): completion-named files first added between the previous census's ref and this ref. Each is matched against
// the plan lines' ids; none → in-no-plan-line; some, none closed → not-closed-in-plan; one closed → not listed.
// Step 4 G7-5 (Langston): "one closed → not listed" is deliberate, NOT a gap — (f) is (a)'s complement: a batch with one
// closed line and one stale open line is not reported here, and the stale line lands in (f). Coverage is complete with no
// double report; do not "fix" this into one list.
export function listA(plan, addedNames) {
  const pls = planLines(plan), out = [];
  for (const name of addedNames) {
    if (!DOCS.completion_report.match.test(name)) continue;
    const hit = pls.filter((p) => batchIdToFileRegex(p.id).test(name));
    if (hit.length === 0) out.push({ file: name, verdict: 'in-no-plan-line', owner: null });
    else if (!hit.some((p) => p.closed)) out.push({ file: name, verdict: 'not-closed-in-plan', where: [...new Set(hit.map((p) => p.where))], owner: hit[0].owner });
  }
  return out;
}

// ══ THE §6 RECOUNT (R3-Q7) ═══════════════════════════════════════════════════════════════════════════════
// Each §4 row counted once, for the FIRST session named in its owner cell; Langston, Coltrane and Kyle own no
// rows. Compared with §6's `items` column per session.
export function recountS6(plan) {
  const recount = {}, table = {};
  for (const r of plan.s4) { const s = firstSession(r.owner); if (s) recount[s] = (recount[s] || 0) + 1; }
  for (const r of plan.s6) { const s = firstSession(r.session); const v = Number(deMark(r.items)); if (s) table[s] = (table[s] || 0) + (Number.isFinite(v) ? v : NaN); }
  const keys = [...new Set([...Object.keys(recount), ...Object.keys(table)])].sort();
  const diffs = keys.filter((k) => recount[k] !== table[k]).map((k) => ({ session: k, recount: recount[k] ?? 0, table: table[k] ?? 0 }));
  // Step 4 G7-3 CONDITION 1 (Langston): the STATED Total lives in §6's prose ("Total N."), not in the table cells, so a
  // recount that only compares cells goes quiet with a wrong Total in the doc (2026-09-30: Total 234 vs cells 236). The
  // stated Total is parsed and compared with the SUM of the cells — its own diff, which alerts on its own (not subject to
  // the same-commit rule below: fixing the cells and leaving the Total is exactly the miss it exists to catch).
  const cellSum = Object.values(table).reduce((a, v) => a + v, 0);
  // Nit (Langston): exactly ONE "Total N." in §6 — a second one would make "the stated Total" ambiguous, read as not agreeing.
  const tms = [...(plan.s6Text || '').matchAll(/\bTotal (\d+)\./g)];
  const statedTotal = tms.length === 1 ? Number(tms[0][1]) : null;
  const totalAgree = statedTotal !== null && statedTotal === cellSum;
  return { recount, table, agree: diffs.length === 0, diffs, cellSum, statedTotal, totalAgree };
}
// The alert condition: §6 and the recount disagree AND §6 was NOT touched in the same commit as the newest §4
// change that moved the tally (row 1's rule, not a new tolerance). `history` is [{sha, text}] of the plan at the
// commits that touched it, newest first, the oldest's PARENT text appended as the last element (sha null).
// A tally change not found in the window reads as "not the same commit" — it cannot be shown, so it alerts.
export function s6AlertDecision(rec, history) {
  if (rec.agree) return { alert: false, commit: null, sameCommit: null };
  const tally = (t) => { try { return JSON.stringify(recountS6(parsePlan(t)).recount); } catch { return null; } };
  const six = (t) => { try { return parsePlan(t).s6Text; } catch { return null; } };
  for (let k = 0; k + 1 < history.length; k++) {
    const cur = history[k], prev = history[k + 1];
    if (tally(cur.text) !== tally(prev.text)) {
      const same = six(cur.text) !== six(prev.text);
      return { alert: !same, commit: cur.sha, sameCommit: same };
    }
  }
  return { alert: true, commit: null, sameCommit: null };
}

// ══ THE CENSUS ═══════════════════════════════════════════════════════════════════════════════════════════
// readers: { show(ref, path) → text|null, names(ref, dir) → basenames[], added(prevRef, ref, dir) → basenames[],
//            planHistory(ref, path, n) → [{sha, text}] } — the live ones are gitReaders below.
export function runCensus({ ref, prevRef, readers, prevF = null, historyDepth = 20, openScope = null }) {
  if (!ref) throw new Error('census: no graded ref — refusing');
  const read = (p) => {
    const t = readers.show(ref, p);
    if (typeof t !== 'string' || t.trim() === '') throw new Error(`census: git show ${ref}:${p} returned nothing — refusing`);
    return t;
  };
  const ledger = parseLedger(read(CENSUS_SOURCES.ledger));
  // DRY RUN ONLY (Step 4 G7-8, Langston's same-ref control): `openScope: 'r1'` restricts OPEN to the audit's R1 set, so
  // placement at the audit's ref can be compared like-for-like with its 352/117 and 354/115. The live tick never sets it.
  if (openScope === 'r1') ledger.open = new Set(ledger.openR1);
  const plan = parsePlan(read(CENSUS_SOURCES.plan));
  const pls = parseAfterLive(read(CENSUS_SOURCES.afterLive));
  const roadmap = parseRoadmap(read(CENSUS_SOURCES.roadmap));
  const names = readers.names(ref, CENSUS_SOURCES.reportsDir);
  if (!Array.isArray(names) || names.length === 0) throw new Error(`census: the ${CENSUS_SOURCES.reportsDir} listing at ${ref} is EMPTY — refusing (the read failed; the directory is never empty)`);
  if (!prevRef) throw new Error('census: no previous ref for list (a) — refusing');
  const added = readers.added(prevRef, ref, CENSUS_SOURCES.reportsDir);

  // A2: the handover records at the ref. The Scope Files listing is never empty, so an empty read is a FAILED read.
  const sfNames = readers.names(ref, CENSUS_SOURCES.handoverDir);
  if (!Array.isArray(sfNames) || sfNames.length === 0) throw new Error(`census: the ${CENSUS_SOURCES.handoverDir} listing at ${ref} is EMPTY — refusing (a failed read would mark every item never surfaced)`);
  const handedOn = new Map();                                    // n → the EARLIEST handover date
  for (const f of sfNames.filter((x) => HANDOVER_FILE_RE.test(x)).sort()) {
    const h = parseHandover(read(`${CENSUS_SOURCES.handoverDir}/${f}`), f);
    for (const n of h.issues) if (!handedOn.has(n) || h.date < handedOn.get(n)) handedOn.set(n, h.date);
  }

  const owner = (n) => ownerOfIssue(ledger.byNum.get(n));
  const place = placement(ledger, plan, pls, roadmap, names);
  const unplaced = [...place].filter(([, v]) => v.startsWith('U')).map(([n, v]) => ({ n, code: v, why: UNPLACED_WHY[v], owner: owner(n).label, handedOver: handedOn.get(n) ?? null }));
  // The three states (Langston A2): never surfaced / handed over, still unplaced / placed. A handed item that is no
  // longer OPEN is reported apart as closed — neither a placement nor an ignored handover.
  // `handed` counts handed ITEMS (not record files). FINDING-2 (Langston): an id no longer OPEN is split — `closedSince` if the
  // ledger still carries it (stamped closed or withdrawn), `vanishedSince` if it is gone from the ledger entirely (a renumbered
  // or removed entry, e.g. the #594→#648 history), so a renumbering never reads as a close.
  const handover = { handed: handedOn.size, stillUnplaced: unplaced.filter((x) => x.handedOver).map((x) => x.n),
    placedSince: [...handedOn.keys()].filter((n) => place.has(n) && !place.get(n).startsWith('U')).sort((a, b) => a - b),
    closedSince: [...handedOn.keys()].filter((n) => !ledger.open.has(n) && ledger.byNum.has(n)).sort((a, b) => a - b),
    vanishedSince: [...handedOn.keys()].filter((n) => !ledger.byNum.has(n)).sort((a, b) => a - b) };
  const tallyOf = (v) => [...place.values()].filter((x) => x === v).length;
  const c = datedHomes(ledger);
  const d = listD(plan), e = listE(plan), f = listF(plan, names, prevF), a = listA(plan, added);
  const rec = recountS6(plan);
  const g0 = { ...rec, ...(rec.agree ? { alert: false } : s6AlertDecision(rec, readers.planHistory(ref, CENSUS_SOURCES.plan, historyDepth))) };
  const g = { ...g0, alert: g0.alert || !rec.totalAgree };   // C1: a stated Total that is missing or wrong alerts on its own
  const ownerSources = { ownerLine: 0, homeLine: 0, filer: 0, unknown: 0 };
  for (const n of ledger.open) ownerSources[owner(n).source]++;
  return {
    ref, prevRef,
    selfCheck: { heads: ledger.heads.length, numbers: ledger.byNum.size, open: ledger.open.size, openR1: ledger.openR1.size, s1: ledger.s1.size, s2: ledger.s2.size },
    a,
    b: { placed: { number: tallyOf('number'), homeBatch: tallyOf('homeBatch'), parked: tallyOf('parked'), roadmap: tallyOf('roadmap') },
      unplaced, handover, byWhy: Object.fromEntries(Object.keys(UNPLACED_WHY).map((k) => [k, tallyOf(k)])),
      selfContradicting: ledger.selfContradicting, reused: ledger.reused },
    c: { issues: c.issues.map((n) => ({ n, lines: [...new Set(c.byIssue.get(n).map((h) => h.line))], owner: owner(n).label })), lineCount: c.lineCount, matchCount: c.matchCount, excluded: c.excluded },
    d, e, f, g, ownerSources, _ledger: ledger,
  };
}

// The terse counts object — FIRST in the metadata so the 300-character slice Discord shows is the counts (P45
// round 3). h heads · n numbers · o OPEN · a [not-closed-in-plan, in-no-plan-line] · b [placed, unplaced, by
// number, by HOME batch, parked, roadmap, U1..U6] · c [issues, lines, matches] · cx excluded dated · d rows · dx excluded d rows ·
// e [refs, unmatched] · f [new, total] · g §6 alert (0/1) · sc self-contradicting · r reused numbers.
export function censusCounts(r) {
  const p = r.b.placed, placed = p.number + p.homeBatch + p.parked + p.roadmap;
  return {
    h: r.selfCheck.heads, n: r.selfCheck.numbers, o: r.selfCheck.open,
    a: [r.a.filter((x) => x.verdict === 'not-closed-in-plan').length, r.a.filter((x) => x.verdict === 'in-no-plan-line').length],
    b: [placed, r.b.unplaced.length, p.number, p.homeBatch, p.parked, p.roadmap, ...Object.values(r.b.byWhy)],
    c: [r.c.issues.length, r.c.lineCount, r.c.matchCount], cx: r.c.excluded.length,
    d: r.d.rows.length, dx: r.d.excluded.length, e: [r.e.refs.length, r.e.unmatched.length + r.e.rowUnmatched.length],
    f: [r.f.new.length, r.f.all.length], g: r.g.alert ? 1 : 0,
    sc: r.b.selfContradicting.length, r: r.b.reused.length,
    // A2: [handed ITEMS, still unplaced, placed since, closed since, vanished since].
    ...(r.b.handover ? { hv: [r.b.handover.handed, r.b.handover.stillUnplaced.length, r.b.handover.placedSince.length, r.b.handover.closedSince.length, r.b.handover.vanishedSince.length] } : {}),
  };
}

// The full lists, ids only (the box file carries the reasons and owners too).
export function censusLists(r) {
  return {
    a: r.a.map((x) => x.file),
    b: r.b.unplaced.map((x) => (x.handedOver ? [x.n, x.code, x.handedOver] : [x.n, x.code])),
    hv: r.b.handover ? { placed: r.b.handover.placedSince, closed: r.b.handover.closedSince, vanished: r.b.handover.vanishedSince } : null,
    sc: r.b.selfContradicting.map((x) => x.issue), reused: r.b.reused,
    c: r.c.issues.map((x) => x.n), cx: r.c.excluded.map((x) => x.issue),
    d: r.d.rows.map((x) => x.row), dx: r.d.excluded.map((x) => x.row),
    e: [...r.e.unmatched, ...r.e.rowUnmatched].map((x) => [x.row, x.target]),
    f: { new: r.f.new.map((x) => x.key), all: r.f.all },
    g: r.g.agree ? null : { diffs: r.g.diffs, commit: r.g.commit, sameCommit: r.g.sameCommit },
  };
}

// Metadata JSON, key order counts → dedupe_key → source → week → ref → lists (P45). Over METADATA_MAX_BYTES the
// lists are cut with a stated marker, never the counts.
export function censusMetadata({ counts, dedupeKey, week, ref, lists }) {
  const build = (l) => JSON.stringify({ counts, dedupe_key: dedupeKey, source: 'governance-checker', week, ref, lists: l });
  let out = build(lists);
  if (Buffer.byteLength(out) <= METADATA_MAX_BYTES) return out;
  out = build({ truncated: `lists exceed ${METADATA_MAX_BYTES} bytes and are omitted here; the box file ${CENSUS_BOX_DIR}/${week}.json holds them in full` });
  if (Buffer.byteLength(out) > METADATA_MAX_BYTES) throw new Error('census: metadata over the cap even without lists — refusing');
  return out;
}

// ── the alert text (P45 as AMENDED: owner CC-A, no ack, CC-A resolves; "body leads Langston" dropped) ─────────
const item = (s) => s.replace(/\s+/g, ' ');
export function censusAlert(r, { week, severity, storeUnreadable = false, boxPath = `${CENSUS_BOX_DIR}/${week}.json` }) {
  const sha7 = String(r.ref).slice(0, 7);
  const title = `Weekly plan census ${week}: sprint plan vs ledger (owner ${CENSUS_OWNER})`;
  if (title.length > TITLE_MAX) throw new Error(`census: title over ${TITLE_MAX} characters`);
  const qCount = (xs, f) => xs.filter((x) => f(x) === 'owner ?' || f(x) == null).length;
  const planOwner = (o) => (o ? o : 'owner ?');
  const lineFor = (k, withHandover = true) => {
    const top = (xs, fmt) => (k === 0 || xs.length === 0 ? '' : ' — ' + xs.slice(0, k).map(fmt).join('; '));
    const p = r.b.placed, placed = p.number + p.homeBatch + p.parked + p.roadmap;
    const eAll = [...r.e.unmatched, ...r.e.rowUnmatched];
    return [
      `Weekly plan census ${week} at ${sha7}. owner=${CENSUS_OWNER}, do not ack. action="${CENSUS_ACTION}".` +
        (storeUnreadable ? ' Alert store unreadable: whether an earlier week is still open is unknown.' : ''),
      `(a) new reports: ${r.a.filter((x) => x.verdict === 'not-closed-in-plan').length} not closed in plan, ${r.a.filter((x) => x.verdict === 'in-no-plan-line').length} in no plan line [owner ? ${qCount(r.a, (x) => x.owner)}]` +
        top(r.a, (x) => `${x.file} (${x.verdict}, ${planOwner(x.owner)})`),
      `(b) OPEN ${r.selfCheck.open}: placed ${placed} (by # ${p.number}, HOME batch ${p.homeBatch}, parked ${p.parked}, roadmap ${p.roadmap}), unplaced ${r.b.unplaced.length} [owner ? ${qCount(r.b.unplaced, (x) => x.owner)}]` +
        (withHandover && r.b.handover && r.b.handover.handed ? `; handed over ${r.b.handover.handed}: ${r.b.handover.stillUnplaced.length} unplaced, ${r.b.handover.placedSince.length} placed, ${r.b.handover.closedSince.length} closed` + (r.b.handover.vanishedSince.length ? `, ${r.b.handover.vanishedSince.length} vanished` : '') : '') +
        top(r.b.unplaced, (x) => `#${x.n} ${x.why} (${x.owner})`) +
        `; self-contradicting ${r.b.selfContradicting.length}, reused ${r.b.reused.length}`,
      `(c) dated homes: ${r.c.issues.length} issues / ${r.c.lineCount} lines (excluded by name ${r.c.excluded.length}) [owner ? ${qCount(r.c.issues, (x) => x.owner)}]` +
        top(r.c.issues, (x) => `#${x.n} (${x.owner})`),
      `(d) id-less plan rows: ${r.d.rows.length} (excluded ${r.d.excluded.length}) [owner ? ${qCount(r.d.rows, (x) => x.owner)}]` +
        top(r.d.rows, (x) => `row ${x.row} ${x.why} (${planOwner(x.owner)})`),
      `(e) after-references: ${r.e.refs.length + r.e.rowRefs}, ${eAll.length} name no earlier row [owner ? ${qCount(eAll, (x) => x.owner)}]` +
        top(eAll, (x) => `row ${x.row} after ${x.target} (${planOwner(x.owner)})`),
      `(f) not-closed plan lines with a report: ${r.f.new.length} NEW of ${r.f.all.length} [owner ? ${qCount(r.f.new, (x) => x.owner)}]` +
        top(r.f.new, (x) => `${x.where} ${x.id} (${planOwner(x.owner)})`),
      // C1 kept inside the 1,000-char body at maximum sizes (the worst case was 991 before it): the Total clause is terse
      // and the recount clause's suffix was shortened to pay for it.
      '(g) ' + (!r.g.totalAgree ? `Total ${r.g.statedTotal ?? '—'}≠${r.g.cellSum}; ` : '') +
      (r.g.agree ? `§6 recount agrees with the table` :
        `§6 recount vs table: ${r.g.diffs.map((x) => `${x.session} ${x.recount}/${x.table}`).join(', ')}${r.g.alert ? '; not recounted with §4' : '; recounted with §4, no alert'}`),
      `Full lists: metadata.lists of this row (read by id in /var/log/dawntrader/system-alerts.jsonl); box file ${boxPath}.`,
    ].map(item).join('\n');
  };
  // Examples are dropped first (3 → 2 → 1 → 0 per list), then the A2 handover clause; the list counts never. The handover
  // split is never lost: every unplaced item carries `handedOver` and `b.handover` holds the three sets, in metadata and
  // in the box file (A2: at maximum sizes the clause did not fit — the worst case was 992 before it).
  for (const k of [3, 2, 1, 0]) { const body = lineFor(k); if (body.length <= CENSUS_BODY_MAX) return { title, body, severity }; }
  { const body = lineFor(0, false); if (body.length <= CENSUS_BODY_MAX) return { title, body, severity }; }
  throw new Error(`census: the body is over ${CENSUS_BODY_MAX} characters with every example dropped — refusing`);
}

// ══ THE MISTAKE PASS (P46 as AMENDED; §10j P49) ═══════════════════════════════════════════════════════════
// The #754 tripwire's pattern, as MISTAKE_PATTERNS.md states it (the SECOND TRIPWIRE section).
export const STEP_SKIP_RE = /skipped step|step [0-9]+ was not|no pre-?audit|straight to (build|implementation)/i;
// bodies: the %B of every commit in <prevRef>..<ref>. A trailer is a line `MISTAKE: <slug> …`; the slug is its
// first token. Returns the per-slug tally, the tripwire's hit-line count and the skipped-the-gate count.
export function tallyMistakes(bodies) {
  const slugs = {};
  let tripwire = 0;
  for (const b of bodies) {
    for (const l of lines(b)) {
      const m = /^MISTAKE:\s*(\S+)/.exec(l);
      if (m) slugs[m[1]] = (slugs[m[1]] || 0) + 1;
      if (STEP_SKIP_RE.test(l)) tripwire++;
    }
  }
  const total = Object.values(slugs).reduce((s, v) => s + v, 0);
  return { slugs, total, tripwire, skippedGate: slugs['skipped-the-gate'] || 0, commits: bodies.length };
}
export function mistakePassAlert(t, { week, ref, prevRef, severity, storeUnreadable = false }) {
  const s = (x) => String(x).slice(0, 7);
  const title = `Weekly mistake-pattern pass ${week} (owner ${CENSUS_OWNER})`;
  if (title.length > TITLE_MAX) throw new Error(`mistake pass: title over ${TITLE_MAX} characters`);
  const slugs = Object.entries(t.slugs).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const body = [
    `OLD Claude — weekly mistake-pattern pass ${week}, commits ${s(prevRef)}..${s(ref)} (${t.commits}). ${CENSUS_OWNER} owns it: do not ack.` +
      (storeUnreadable ? ' Alert store unreadable: whether an earlier week is still open is unknown.' : ''),
    `MISTAKE: trailers by slug: ${slugs.length ? slugs.map(([k, v]) => `${k} ${v}`).join(', ') : 'none'} (total ${t.total}; skipped-the-gate ${t.skippedGate}).`,
    `#754 step-skip tripwire grep: ${t.tripwire} hit line(s). It sees commits only, so zero is weak evidence. Whether a new slug names a workflow step is CC-A's judgement and is not counted here.`,
    `Run THE WEEKLY PASS in MISTAKE_PATTERNS.md, write the run-log row, resolve with the run-log commit sha.`,
  ].join('\n');
  const slugList = Object.fromEntries(slugs);
  const metadata = JSON.stringify({ counts: { t: t.total, s: slugs.length, g: t.skippedGate, w: t.tripwire, c: t.commits },
    dedupe_key: `${MISTAKEPASS_KEY_PREFIX}${week}`, source: 'governance-checker', week, ref, prev: prevRef, slugs: slugList });
  if (Buffer.byteLength(metadata) > METADATA_MAX_BYTES) throw new Error('mistake pass: metadata over the cap — refusing');
  return { title, body, severity, metadata };
}

// ══ THE LIVE GIT READERS (not used by the tests; each throws or returns null/[] as documented) ═══════════════
const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
export const gitReaders = {
  show: showFileAt,                                       // null on a failed read → runCensus refuses
  names: lsTreeNamesAt,                                   // [] on a failed read → runCensus refuses
  // Top-level files ADDED between the two refs (no rename detection, so a rename reads as an add — the same
  // reading as checker.mjs's first-add). Throws on a failed diff.
  added(prevRef, ref, dir) {
    const d = dir.replace(/\/+$/, '');
    return git(['diff', '--no-renames', '--name-status', prevRef, ref, '--', `${d}/`]).split('\n')
      .map((l) => l.split('\t')).filter(([st, p]) => st === 'A' && p && p.startsWith(`${d}/`) && !p.slice(d.length + 1).includes('/'))
      .map(([, p]) => p.slice(d.length + 1));
  },
  // The branch as of a moment: the newest commit on `ref` whose committer time is at or before `ms`. Throws when
  // there is none (R1-Q14 (b)'s first window cannot be formed — the census refuses rather than read everything).
  refBefore(ref, ms) {
    const sha = git(['rev-list', '-1', `--before=${new Date(ms).toISOString()}`, ref]).trim();
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error(`no commit on ${ref} at or before ${new Date(ms).toISOString()}`);
    return sha;
  },
  // The plan at each commit that touched it, newest first, plus the oldest one's parent (sha null). A failed read
  // at a commit the log NAMED throws (the census refuses): read as '' it would parse to no tally, place the tally
  // change at that commit and report §6 as touched there, SUPPRESSING the §6 alert off a read that failed. Only the
  // parent may be absent, and only when the parent COMMIT does not exist (see below). A commit in the window that DELETED the file
  // refuses too (fail-closed; the census cannot tell that from a failed read). `io` is injectable for the tests.
  planHistory(ref, path, n, io = {}) {
    const show = io.show ?? showFileAt, log = io.log ?? git;
    const shas = log(['log', `-n${n}`, '--format=%H', ref, '--', path]).split('\n').filter(Boolean);
    const out = shas.map((sha) => {
      const text = show(sha, path);
      if (typeof text !== 'string') throw new Error(`census: git show ${sha}:${path} returned nothing at a commit that touched it — refusing`);
      return { sha, text };
    });
    if (shas.length) {
      // Step 4 G7-9 CONDITION 2 (Langston): '' is tolerated ONLY when the parent commit itself does not exist (the
      // repository's first commit). A parent that EXISTS but whose read returned nothing — a failed read, a shallow
      // clone — would parse to no tally, report §6 as touched and SUPPRESS the alert, so it refuses instead. (A file
      // CREATED inside the 20-commit window therefore refuses too; for this plan that window never reaches its creation.)
      const oldest = shas[shas.length - 1];
      const text = show(`${oldest}^`, path);
      if (typeof text === 'string') out.push({ sha: null, text });
      else {
        const revParse = io.revParse ?? ((s) => git(['rev-parse', '--verify', '--quiet', s]));
        let parentExists = true;
        // Round 2 (Langston): `<sha>^{commit}` is git's PEEL syntax — it resolves the commit to ITSELF, so the first build
        // always found a "parent" and always refused. `<sha>^` asks for the parent; execFileSync throws when there is none.
        try { revParse(`${oldest}^`); } catch { parentExists = false; }
        if (parentExists) throw new Error(`census: git show ${oldest}^:${path} returned nothing though the parent exists — refusing (a failed read must not suppress the §6 alert)`);
        out.push({ sha: null, text: '' });
      }
    }
    return out;
  },
  // The %B of every commit in prevRef..ref. Throws on a failed log.
  bodies(prevRef, ref) {
    return git(['log', '--format=%B%x1e', `${prevRef}..${ref}`]).split('\x1e').map((b) => b.replace(/^\n+/, '')).filter((b) => b.trim() !== '');
  },
};

// The box copy of the full lists, written BEFORE the add (§10e Q19). Throws on failure — the census then fails
// and the week is not recorded, rather than minting a row whose "box file" line points at nothing.
export function writeCensusBoxFile(week, payload, dir = CENSUS_BOX_DIR) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${week}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}

// ══ P44 — THE DRY RUN (offline; writes nothing; its figures are Langston's to rule, never a governed doc's) ═══
function dryRun(argv) {
  const arg = (k) => { const i = argv.indexOf(k); return i === -1 ? null : argv[i + 1]; };
  const ref = arg('--ref');
  if (!ref) { console.error('usage: node scripts/governance-checker/census.mjs --ref <sha> [--prev <sha>] [--dry-run] [--mistake-pass]'); process.exit(2); }
  const now = Date.parse(git(['show', '-s', '--format=%cI', ref]).trim());
  const prevRef = arg('--prev') || gitReaders.refBefore(ref, now - 7 * DAY_MS);
  const r = runCensus({ ref, prevRef, readers: gitReaders, openScope: argv.includes('--open-r1') ? 'r1' : null });
  const L = r._ledger;
  const out = (s) => console.log(s);
  out(`census dry run at ${ref} (list (a) window ${prevRef}..${ref}; week of the ref ${isoWeek(now)})`);
  out(`self-check: heads ${r.selfCheck.heads} · numbers ${r.selfCheck.numbers} · OPEN ${r.selfCheck.open} (R1 ${r.selfCheck.openR1}; widened S1 ${r.selfCheck.s1}, S2 ${r.selfCheck.s2})`);
  const p = r.b.placed;
  out(`(b) placed ${p.number + p.homeBatch + p.parked + p.roadmap} (number ${p.number} · HOME batch ${p.homeBatch} · parked ${p.parked} · roadmap ${p.roadmap}) · unplaced ${r.b.unplaced.length} ${JSON.stringify(r.b.byWhy)}`);
  const names = gitReaders.names(ref, CENSUS_SOURCES.reportsDir);
  const plan = parsePlan(gitReaders.show(ref, CENSUS_SOURCES.plan)), pls = parseAfterLive(gitReaders.show(ref, CENSUS_SOURCES.afterLive)), rm = parseRoadmap(gitReaders.show(ref, CENSUS_SOURCES.roadmap));
  const asBuilt = placement(L, plan, pls, rm, names, { noteCells: 'any' });
  const ruled = placement(L, plan, pls, rm, names);
  const moved = [...asBuilt].filter(([n, v]) => v !== ruled.get(n));
  out(`    R1-Q13 (a)↔(c) delta: ${moved.length} issue(s) place differently when every note-cell mention counts: ${moved.map(([n, v]) => `#${n}→${v}`).join(' ')}`);
  out(`    self-contradicting sub-list (${r.b.selfContradicting.length}): ${r.b.selfContradicting.map((x) => `#${x.issue}@L${x.headLine} (${x.reason}; filer ${x.filer ?? '?'})`).join(' · ')}`);
  out(`    reused numbers (${r.b.reused.length}): ${r.b.reused.map((n) => '#' + n).join(' ')}`);
  for (const [name, set, owner, ex] of [['R1 × R2', L.openR1, false, {}], ['R1w × R2', L.open, false, {}], ['R1 × R2+OWNER', L.openR1, true, {}],
    ['R1w × R2+OWNER, #696 counted', L.open, true, {}], ['R1w × R2+OWNER, #696 excluded (Q25)', L.open, true, DATED_EXCLUSIONS]]) {
    const c = datedHomes(L, set, { owner, exclusions: ex });
    out(`(c) ${name}: ${c.issues.length} issues / ${c.lineCount} lines / ${c.matchCount} matches${c.excluded.length ? ` (excluded ${c.excluded.map((x) => '#' + x.issue).join(' ')})` : ''}`);
  }
  out(`    list (c) as ruled: ${r.c.issues.map((x) => '#' + x.n).join(' ')}`);
  out(`(d) ${r.d.rows.length} rows: ${r.d.rows.map((x) => `${x.row} (${x.why})`).join('; ')} · excluded ${r.d.excluded.length}: ${r.d.excluded.map((x) => `${x.row} (${x.reason})`).join('; ')}`);
  out(`(e) type (i)+§0 refs ${r.e.refs.length} · unmatched ${r.e.unmatched.length} · resolved via §0 ${r.e.viaS0.length} (${r.e.viaS0.map((x) => `${x.row}→${x.target}`).join(', ')}) · "after row N" ${r.e.rowRefs}, unmatched ${r.e.rowUnmatched.length}`);
  out(`    unmatched: ${r.e.unmatched.map((x) => `${x.row}:${x.target}`).join(' ')}`);
  out(`(f) ${r.f.all.length} lines / ${r.f.ids.length} ids: ${r.f.all.join(' ')}`);
  out(`(a) ${r.a.length}: ${r.a.map((x) => `${x.file} (${x.verdict})`).join('; ')}`);
  out(`(g) §6: recount ${JSON.stringify(r.g.recount)} · table ${JSON.stringify(r.g.table)} · ${r.g.agree ? 'agree' : `DISAGREE, alert=${r.g.alert}, commit ${r.g.commit}`} · stated Total ${r.g.statedTotal ?? 'NOT FOUND'} vs cells ${r.g.cellSum} (${r.g.totalAgree ? 'agree' : 'DISAGREE'})`);
  out(`owner sources over the ${L.open.size} OPEN issues (shown-as): ${JSON.stringify(r.ownerSources)}`);
  const src = { ownerLine: [], homeLine: [], filer: [] };
  for (const n of [...L.open].sort((a, b) => a - b)) { const o = ownerOfIssue(L.byNum.get(n)); for (const k of Object.keys(src)) if (o[k] && src[k].length < 10) src[k].push(`#${n}=${o[k]}`); }
  const perSource = Object.fromEntries(Object.keys(src).map((k) => [k, [...L.open].filter((n) => ownerOfIssue(L.byNum.get(n))[k]).length]));
  out(`owner per-source counts (overlapping): ${JSON.stringify(perSource)}`);
  for (const k of Object.keys(src)) out(`    10-item hand-check sample, ${k}: ${src[k].join(' ')}`);
  const counts = censusCounts(r);
  const week = isoWeek(now);
  const alert = censusAlert(r, { week, severity: 'info' });
  out(`counts ${JSON.stringify(counts)}`);
  out(`title (${alert.title.length}): ${alert.title}`);
  out(`body (${alert.body.length}):\n${alert.body}`);
  if (argv.includes('--mistake-pass')) {
    const t = tallyMistakes(gitReaders.bodies(prevRef, ref));
    const m = mistakePassAlert(t, { week, ref, prevRef, severity: 'info' });
    out(`mistake pass: ${JSON.stringify(t)}\n${m.title}\n${m.body}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) dryRun(process.argv.slice(2));
