// B-STATUS-BOARD (#1227) — the phone status board's data file.
//
// Every checker tick (both maybeRunWeekly sites in poller.mjs, never the fetch-fail return — there is no sha there)
// writes BOARD_FILE at the graded sha: the ONE pre-sprint table (presprintRows), the §4 sprint rows by wave, each
// item's owner-written description, the newest `Step-N` commit for its batch id, and — when the rulebook was
// readable — the reason a batch is held open in GOVERNANCE_EXCEPTIONS.md. The app's GET /api/status-board serves it.
//
// THE SPLIT, and why: buildBoard() is PURE (text in, object out) and carries every rule, so the tests drive it with
// fixture text; runStatusBoard() only reads the three git objects, calls buildBoard, writes the file atomically, and
// opens/resolves `gov-board-failed`. A failure here never leaves the tick: the caller wraps it (the weekly-leg pattern).
//
// LOAD: poller.mjs imports this module statically, so it is in DRIFT_LOADED_FILES (poller.mjs).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PLAN_LINE, BOARD_FILE, BOARD_DESCRIPTIONS_PATH, DESCRIPTION_MAX_CHARS, STATE_LABELS, WORK_RECORD_RECENT_MS, writeStateAtomic } from './config.mjs';
import { presprintRows, planRowsByBatch, mapStatus, mapWaiting, idsInCell, deMark, showFileAt, REPO_ROOT } from './checker.mjs';
import { firstSession } from './census.mjs';

export const BOARD_FAILED_KEY = 'gov-board-failed';
export const BOARD_SCHEMA = 1;

// ── descriptions: `### <key>` heading, text below until the next heading. Keyed by batch id; `row <N>` only for an
// item with no batch id (scope OBJ-2, Langston N3: row ids drift when items are slotted).
export function parseDescriptions(text) {
  const out = new Map();
  if (typeof text !== 'string') return out;
  let key = null, buf = [];
  const flush = () => { if (key) out.set(key, buf.join('\n').trim()); };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const h = /^### (.+?)\s*$/.exec(line);
    if (h) { flush(); key = deMark(h[1]); buf = []; continue; }
    if (/^#{1,2} /.test(line)) { flush(); key = null; buf = []; continue; }
    if (key) buf.push(line);
  }
  flush();
  return out;
}

// ── the newest Step-N commit for an id: ANCHORED — the id, whitespace, then `Step-N` at once (pre-audit A6; the loose
// form matched a later `Step-N` inside a subject). Subjects arrive newest first.
export function lastStepFor(id, subjects) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}\\s+Step-(\\d+)\\b`);
  for (const c of subjects) {
    const m = re.exec(c.subject);
    if (m) return { step: Number(m[1]), at: c.date, sha: c.hash.slice(0, 9) };
  }
  return null;
}

// ── the reason a batch is held open: cell 6 onward, REJOINED (a reason may carry `|`; Langston pre-audit condition 5),
// last row per batch wins (the same as openSince). Passed in already parsed by parseExceptionsLegacy.
function shortReason(text) {
  if (!text) return null;
  const t = deMark(text);
  const first = (t.match(/^.*?[.!?](?=\s|$)/) || [t])[0];
  return first.length > 200 ? first.slice(0, 199) + '…' : first;
}

// The wave each §4 row sits under (the `### ` heading above it inside §4).
function wavesByLine(planText) {
  const waves = []; let inS4 = false, wave = null;
  planText.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const h = /^## (\d+)\./.exec(line);
    if (h) { inS4 = h[1] === '4'; wave = null; return; }
    if (inS4 && /^### /.test(line)) wave = deMark(line.slice(4)).replace(/\s+—.*$/, '');
    waves[i + 1] = inS4 ? wave : null;
  });
  return waves;
}

// THE WORK RECORD OVERRIDES A STALE "QUEUED" (Kyle 2026-11-04): when the batch's own `<id> Step-N` commits show work has
// started but the plan line still reads QUEUED, the board shows the recorded step instead, labelled with where it came
// from and keeping the line's own words. ONLY queued is overridden; a person's call (parked, moved, done, watching data,
// waiting) stays as written. Not applied when the id sits on more than one board line (row 4 and its increment 2 share
// one id), because the commits cannot say which line they belong to; for the same reason no plan-behind mark shows
// there either (Step-9 r4, Langston) - the page's "Last recorded step" line still shows the commit.
// RECENT work only reads as in progress (WORK_RECORD_RECENT_MS, config.mjs, with its derivation): an older step (e.g. a
// scope written months ago and never taken further) stays QUEUED and says the work stopped, so old scopes never fill Now.
// The page already prints the recorded step and its date ("Last recorded step"), so the text carries only what that line
// cannot: the plan line's own words, and which line it is (Langston Step-9 r1 F2/F3).
export function fromWorkRecord(st, step, idShared, nowMs, where = 'plan') {
  if (st.state !== 'queued' || !step || idShared) return null;
  const at = Date.parse(step.at);
  if (!Number.isFinite(at) || nowMs - at > WORK_RECORD_RECENT_MS) {
    const days = Number.isFinite(at) ? Math.floor((nowMs - at) / 86400000) : null;
    return { state: 'queued', text: `${st.text} - work stopped: nothing recorded for ${days === null ? 'an unknown time' : `${days} days`}` };
  }
  return { state: 'in_progress', text: `the ${where} line still reads: ${st.text}` };
}
// The ids a line can be credited with for attribution: a STRUCK id (`~~X~~`, an alias kept for history) is not the line's
// own (Langston F5: row 135a's batch cell reads `plan row 2b (~~B-CROWDING-CRITERION-OBJECT~~, #1095)`).
export function idsForAttribution(cell) { return idsInCell(String(cell ?? '').replace(/~~[^~]*~~/g, '')); }
// PURE. Every count on the page is computed here from the data, never carried (pre-audit record item (ii)).
export function buildBoard({ planText, descText, subjects, openReason, rulebookReadable, ref, nowMs }) {
  const pre = presprintRows(planText);
  const plan = planRowsByBatch(planText);
  const s4ByRow = new Map();
  for (const [, v] of plan.rows) for (const r of v.s4) s4ByRow.set(r.rowNo, r);
  // rows with no leading id are not in plan.rows; collect them too, by scanning the map's unparsed list
  for (const r of plan.unparsed) if (r.section === 4) s4ByRow.set(r.rowNo, r);
  const waves = wavesByLine(planText);
  const desc = parseDescriptions(descText);
  const descFor = (ids, rowNo) => {
    for (const id of ids) if (desc.has(id)) return desc.get(id);
    if (rowNo && desc.has(`row ${rowNo}`)) return desc.get(`row ${rowNo}`);
    return null;
  };
  // How many board lines (table items and sprint rows) carry each id - a shared id cannot be attributed by commits.
  const idLines = new Map();
  for (const it of pre.items) for (const id of new Set(it.ids)) idLines.set(id, (idLines.get(id) || 0) + 1);
  // A MOVED / withdrawn sprint row and a struck id are history, not a second owner of the id (Langston F5).
  for (const r of s4ByRow.values()) {
    if (mapStatus(r.status).state === 'moved') continue;
    for (const id of new Set(idsForAttribution(r.batch))) idLines.set(id, (idLines.get(id) || 0) + 1);
  }
  const items = pre.items.map((it, idx) => {
    const ids = it.ids;
    const row = it.planRow ? s4ByRow.get(it.planRow) : null;
    const statusCell = it.planRow ? (row ? row.status : '') : it.status;
    const st = it.planRow && !row ? { state: 'unrecognised', text: `plan row ${it.planRow} not found` } : mapStatus(statusCell);
    const step = ids.length ? lastStepFor(ids[0], subjects) : null;
    // A row-backed item's id is counted on its table line AND its own sprint row: that is one item, not a shared id.
    const shared = ids.length ? (idLines.get(ids[0]) || 0) > (it.planRow ? 2 : 1) : false;
    const base = it.planRow ? `§4 row ${it.planRow}` : 'pre-sprint table';
    const wr = fromWorkRecord(st, step, shared, nowMs, base);
    // An item with neither a batch id nor a plan row is keyed by its item text (its board key).
    const description = descFor(ids, it.planRow) ?? (!ids.length && !it.planRow ? desc.get(deMark(it.item)) ?? null : null);
    const reasonFull = rulebookReadable && ids.length ? (openReason?.get(ids[0]) ?? null) : null;
    const conflict = pre.conflicts.find((c) => c.lineNo === it.lineNo)?.why ?? null;
    return {
      key: ids[0] || (it.planRow ? `row ${it.planRow}` : deMark(it.item)),
      position: idx, stage: deMark(it.stage), order: deMark(it.order), item: deMark(it.item), ids,
      owner: deMark(it.owner), session: firstSession(it.owner), planRow: it.planRow, issue: deMark(it.issue), agreed: deMark(it.agreed),
      state: (wr || st).state, stateLabel: STATE_LABELS[(wr || st).state], statusText: (wr || st).text,
      statusSource: wr ? `work record + ${base}` : base,
      waiting: mapWaiting(it.waitingOn), lastStep: step,
      // Once the work record has spoken (either arm) the old "plan has not caught up" line would contradict it (F2).
      // An id on more than one board line is not attributed (OBJ-9), so the work record cannot say THIS line is behind either.
      planBehind: Boolean(step && st.state === 'queued' && !wr && !shared),
      description, descriptionTooLong: Boolean(description && description.length > DESCRIPTION_MAX_CHARS),
      openReason: shortReason(reasonFull), openReasonFull: reasonFull ? deMark(reasonFull) : null,
      conflict,
    };
  });
  const inTable = new Set(items.flatMap((i) => i.ids).concat(items.filter((i) => i.planRow).map((i) => `row ${i.planRow}`)));
  const rest = [...s4ByRow.values()]
    .filter((r) => !inTable.has(`row ${r.rowNo}`) && !idsInCell(r.batch).some((id) => inTable.has(id)))
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((r) => {
      const st0 = mapStatus(r.status); const ids = idsInCell(r.batch);
      const step = ids.length ? lastStepFor(ids[0], subjects) : null;
      const wr = fromWorkRecord(st0, step, ids.length ? (idLines.get(ids[0]) || 0) > 1 : false, nowMs, `§4 row ${r.rowNo}`);
      const st = wr || st0;
      const description = descFor(ids, r.rowNo);
      return { key: ids[0] || `row ${r.rowNo}`, planRow: r.rowNo, wave: waves[r.lineNo] || null, item: deMark(r.item), ids,
        owner: deMark(r.owner), session: firstSession(r.owner), state: st.state, stateLabel: STATE_LABELS[st.state], statusText: st.text,
        lastStep: step, fromWorkRecord: Boolean(wr), description, descriptionTooLong: Boolean(description && description.length > DESCRIPTION_MAX_CHARS) };
    });
  const count = (arr, k) => arr.reduce((m, x) => (m[x[k]] = (m[x[k]] || 0) + 1, m), {});
  return {
    schema: BOARD_SCHEMA, generated_at: new Date(nowMs).toISOString(), ref, rulebook: rulebookReadable ? 'read' : 'unreadable',
    items, rest,
    couldNotRead: pre.malformed.map((m) => ({ lineNo: m.lineNo, why: `${m.cellCount} cells, expected 9` })),
    conflicts: pre.conflicts,
    counts: { items: items.length, rest: rest.length, byState: count(items, 'state'), restByState: count(rest, 'state'),
      unrecognised: items.filter((i) => i.state === 'unrecognised').length + rest.filter((r) => r.state === 'unrecognised').length,
      descriptionsOwed: items.filter((i) => !i.description).length, conflicts: pre.conflicts.length, couldNotRead: pre.malformed.length },
  };
}

// ── side effects ─────────────────────────────────────────────────────────────────────────────────────────────
export function allSubjects(ref) {
  const out = execFileSync('git', ['log', ref, '--format=%H%x1f%cI%x1f%s'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\n').filter(Boolean).map((l) => { const [hash, date, subject] = l.split('\x1f'); return { hash, date, subject: subject ?? '' }; });
}
// Called from both maybeRunWeekly sites. `openReason` is null when the rulebook could not be read.
export function runStatusBoard(state, nowMs, gradedRefSha, openReason, deps = {}) {
  const d = { show: showFileAt, subjects: allSubjects, write: writeStateAtomic, file: BOARD_FILE, ...deps };
  try {
    const planText = d.show(gradedRefSha, PLAN_LINE.path);
    if (!planText) throw new Error(`the plan is unreadable at ${gradedRefSha}`);
    const board = buildBoard({ planText, descText: d.show(gradedRefSha, BOARD_DESCRIPTIONS_PATH) || '', subjects: d.subjects(gradedRefSha),
      openReason, rulebookReadable: Boolean(openReason), ref: gradedRefSha, nowMs });
    mkdirSync(dirname(d.file), { recursive: true });
    d.write(d.file, board);
    if (state.openAlerts[BOARD_FAILED_KEY] && d.sink) { d.sink.resolve(state.openAlerts[BOARD_FAILED_KEY]); delete state.openAlerts[BOARD_FAILED_KEY]; }
    return { ok: true, items: board.items.length };
  } catch (e) {
    const msg = String(e.message || e).slice(0, 300);
    console.error(`[gov-checker] status board NOT written this tick: ${msg}`);
    if (d.sink && !state.openAlerts[BOARD_FAILED_KEY]) {
      const id = d.sink.add({ dedupeKey: BOARD_FAILED_KEY, severity: 'warning', title: 'governance-checker could not write the status board',
        body: `The status board file was not written at ${gradedRefSha}: ${msg}. The page keeps the last good file and shows its age. Grading is unaffected. Clears itself on the next good write.` }, nowMs);
      if (id) state.openAlerts[BOARD_FAILED_KEY] = id;
    }
    return { ok: false, error: msg };
  }
}
