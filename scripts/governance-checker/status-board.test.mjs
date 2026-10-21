// B-STATUS-BOARD (#1227) — the board's rules on fixture text, its failure fence, the exceptions reason, and the
// LIVE plan: every status cell in §4 and in the pre-sprint table maps to a state (a new word fails this file).
// Run: node scripts/governance-checker/status-board.test.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, parseDescriptions, lastStepFor, runStatusBoard, BOARD_FAILED_KEY } from './status-board.mjs';
import { parseExceptionsLegacy, runStatusBoardSafely, DRIFT_LOADED_FILES } from './poller.mjs';
import { presprintRows, planRowsByBatch, mapStatus, mapWaiting, idsInCell } from './checker.mjs';
import { PLAN_LINE, BOARD_DESCRIPTIONS_PATH } from './config.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL: ${name} ${extra}`); } };
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PLAN = [
  '# plan',
  '## 0. Clear the plates', 'moved into the pre-sprint table',
  '## 0a. Pre-sprint',
  PLAN_LINE.s0aHeader,
  '|---|---|---|---|---|---|---|---|---|',
  '| CC-B list | 1 | B-ENTRY-GATE | CC-B (New Claude) | none | #1224 | Kyle 2026-10-20 | IN FLIGHT — Step 1 | Kyle (both-sided or adverse-only) |',
  '| CC-B list | 2 | B-PRICE-FEED-COVERAGE | CC-B (New Claude) | none | #1222 | Kyle 2026-10-20 | QUEUED | CC-B |',
  '| 2 — exit | 1 | B-XSTOCK-BID-TRIGGER-RELAND | CC-C (Analyst Claude) | 2 | | Kyle 2026-10-07 | row | data — three trading sessions to 2026-10-23 |',
  '| 0 — clear the plates | 1 | B-TOKEN-WATCH | Infra Claude | none | | Kyle 2026-09-28 | PARKED (research, after live) | Kyle |',
  '| 0 — clear the plates | 2 | B-ODD | CC-A (Old Claude) | none | | Kyle 2026-09-28 | REOPENED | me |',
  '| 0 — clear the plates | 3 | B-CONFLICT | CC-A (Old Claude) | 9 | | Kyle 2026-09-28 | QUEUED | nothing |',
  '| short | row |',
  '### history', '| stage | rows (owner) |', '|---|---|', '| 0 | B-HISTORY-ONLY (CC-A) |',
  '## 4. The plan',
  '### Wave 0 — NOW — urgent',
  '| # | item | batch / reference | owner | status | report | note |',
  '|---:|---|---|---|---|---|---|',
  '| 2 | the xStock realism batch | B-XSTOCK-BID-TRIGGER-RELAND | CC-C (Analyst Claude) | ⏳ IN OBSERVATION 2026-10-17 | — | — |',
  '| 9 | sizing | B-SIZING-DEC-RESTORE | CC-C (Analyst Claude) | ✅ CLOSED 2026-10-09 | r.md | — |',
  '### Wave B4 — TRACK B · Go-live preparation — last',
  '| # | item | batch / reference | owner | status | report | note |',
  '|---:|---|---|---|---|---|---|',
  '| 197a | the token-watch login | B-TOKEN-WATCH-AUTH (`#1228`) | Infra Claude | QUEUED | — | — |',
  '| 198 | the go-live switch | roadmap 19-17b — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | — |',
  '## 5. Running now', '| item | owner | closes | report |', '|---|---|---|---|',
  '## 6. Who', '| session | group | items |', '|---|---|---:|',
].join('\n');
const DESC = ['# descriptions', '### B-ENTRY-GATE', 'Refuse an entry whose price has moved too far from the plan.', '',
  '### row 198', 'The final switch to live mode.', '### B-PRICE-FEED-COVERAGE', 'x'.repeat(800)].join('\n');
const SUBJECTS = [
  { hash: 'c'.repeat(40), date: '2026-10-21T01:00:00Z', subject: 'B-ENTRY-GATE Step-1: scope r1' },
  { hash: 'b'.repeat(40), date: '2026-10-20T01:00:00Z', subject: 'B-XSTOCK-BAR-AVAILABILITY tsc baseline sync after Step-7 notes' },
  { hash: 'a'.repeat(40), date: '2026-10-19T01:00:00Z', subject: 'B-XSTOCK-BID-TRIGGER-RELAND Step-7: first-pass read PASS' },
];
const NOW = Date.parse('2026-10-21T02:00:00Z');
const reasons = new Map([['B-XSTOCK-BID-TRIGGER-RELAND', 'Waiting on three trading sessions of the venue-quiet read. More text follows here.']]);
const board = buildBoard({ planText: PLAN, descText: DESC, subjects: SUBJECTS, openReason: reasons, rulebookReadable: true, ref: 'f'.repeat(40), nowMs: NOW });
const by = (k) => board.items.find((i) => i.key === k);

// the table and the seven states
ok('SB1 six table items read, one row it could not read, one one-copy conflict', board.items.length === 6 && board.couldNotRead.length === 1 && board.conflicts.length === 1,
  `${board.items.length}/${board.couldNotRead.length}/${board.conflicts.length}`);
ok('SB2 a table status maps (IN FLIGHT → in progress; PARKED → parked)', by('B-ENTRY-GATE').state === 'in_progress' && by('B-TOKEN-WATCH').state === 'parked');
ok('SB3 a row-backed item takes its §4 row status (one copy): watching data', by('B-XSTOCK-BID-TRIGGER-RELAND').state === 'observation' && by('B-XSTOCK-BID-TRIGGER-RELAND').statusSource === '§4 row 2');
ok('SB4 an unknown word is `unrecognised` with its text, and counted', by('B-ODD').state === 'unrecognised' && by('B-ODD').statusText === 'REOPENED' && board.counts.unrecognised >= 1);
ok('SB5 waiting-on: a data window, a declared word, and `me` is unrecognised', by('B-XSTOCK-BID-TRIGGER-RELAND').waiting.waiting === 'data'
  && by('B-ENTRY-GATE').waiting.waiting === 'Kyle' && by('B-ODD').waiting.waiting === 'unrecognised');
ok('SB6 the one-copy conflict is a per-item mark, and the item still reads', Boolean(by('B-CONFLICT').conflict) && by('B-CONFLICT').state !== undefined);
// last recorded step: anchored
ok('SB7 the last recorded step comes from the anchored subject', by('B-ENTRY-GATE').lastStep?.step === 1);
ok('SB8 a later `Step-N` inside a subject is NOT taken (anchored)', lastStepFor('B-XSTOCK-BAR-AVAILABILITY', SUBJECTS) === null);
ok('SB9 an item with no Step commit has a null step (the page shows `no recorded step`)', by('B-TOKEN-WATCH').lastStep === null);
// descriptions
ok('SB10 a description keyed by batch id is found; a missing one is null (the page shows `description owed`)', by('B-ENTRY-GATE').description.startsWith('Refuse') && by('B-TOKEN-WATCH').description === null);
ok('SB11 an over-long description is marked, not dropped', by('B-PRICE-FEED-COVERAGE').descriptionTooLong === true && by('B-PRICE-FEED-COVERAGE').description.length === 800);
ok('SB12 `row N` is the key for an item with no batch id', board.rest.find((r) => r.planRow === '198')?.description === 'The final switch to live mode.');
{
  const b2 = buildBoard({ planText: PLAN.replace('| B-ODD |', '| P-8e split |'), descText: `${DESC}\n### P-8e split\nThe split.`, subjects: SUBJECTS,
    openReason: reasons, rulebookReadable: true, ref: 'f'.repeat(40), nowMs: NOW });
  ok('SB12b an item with no batch id and no plan row is keyed by its item text', b2.items.find((i) => i.key === 'P-8e split')?.description === 'The split.');
}
ok('SB13 parseDescriptions stops a section at the next heading', parseDescriptions(DESC).get('B-ENTRY-GATE') === 'Refuse an entry whose price has moved too far from the plan.');
// the rest of the plan, exact membership
ok('SB14 the rest of the plan is the §4 rows not in the table (row 9 is named by a table item, row 2 is row-backed), in plan order, with their wave',
  board.rest.map((r) => r.planRow).join(',') === '197a,198' && board.rest[0].wave === 'Wave B4', JSON.stringify(board.rest.map((r) => [r.planRow, r.wave])));
ok('SB15 B-TOKEN-WATCH in the table does NOT pull row 197a (B-TOKEN-WATCH-AUTH) out of the rest (exact set membership)',
  board.rest.some((r) => r.planRow === '197a'));
ok('SB15b row 9 left the rest because a table item names it, and row 2 because it is row-backed', !board.rest.some((r) => r.planRow === '9' || r.planRow === '2'));
// the open reason
ok('SB16 the open reason is shortened to its first sentence, the full text kept', by('B-XSTOCK-BID-TRIGGER-RELAND').openReason === 'Waiting on three trading sessions of the venue-quiet read.'
  && by('B-XSTOCK-BID-TRIGGER-RELAND').openReasonFull.endsWith('follows here.'));
const noRules = buildBoard({ planText: PLAN, descText: DESC, subjects: SUBJECTS, openReason: null, rulebookReadable: false, ref: 'f'.repeat(40), nowMs: NOW });
ok('SB17 with the rulebook unreadable the board still builds, says so, and shows no reasons', noRules.rulebook === 'unreadable' && noRules.items.every((i) => i.openReason === null));
ok('SB18 counts are computed from the data', board.counts.items === 6 && board.counts.byState.in_progress === 1 && board.counts.descriptionsOwed === 4, JSON.stringify(board.counts));
ok('SB19 the history table is not read', !board.items.some((i) => i.ids.includes('B-HISTORY-ONLY')));

// the exceptions reason (P5): cells 6.. rejoined, last row wins, no trailing pipe assumed, existing outputs unchanged
const EXC = [
  '| ts | batch | input-type | value | confirmed_by | reason |',
  '| 2026-10-17T12:20:00Z | B-ONE | open | open since 2026-10-17T11:44:52Z | cc-a | first reason |',
  '| 2026-10-18T12:20:00Z | B-ONE | open | open since 2026-10-18T11:44:52Z | cc-a | second reason, with a | pipe inside |',
  '| 2026-10-18T12:20:00Z | B-TWO | open | open since 2026-10-18T11:44:52Z | cc-b | no trailing pipe',
  '| 2026-10-18T12:20:00Z | B-THREE | open | open since 2026-10-18T11:44:52Z | pending | unconfirmed |',
].join('\n');
const ex = parseExceptionsLegacy(EXC);
ok('SB20 openReason: last row wins and a `|` inside the reason is kept', ex.openReason.get('B-ONE') === 'second reason, with a | pipe inside');
ok('SB21 openReason: a row with no trailing pipe keeps its whole reason', ex.openReason.get('B-TWO') === 'no trailing pipe');
ok('SB22 openReason: an unconfirmed row gives no reason, and the existing outputs are unchanged',
  !ex.openReason.has('B-THREE') && ex.open.has('B-ONE') && ex.open.has('B-TWO') && !ex.open.has('B-THREE') && ex.openSince.get('B-ONE') === Date.parse('2026-10-18T11:44:52Z'));

// the failure fence: a failure writes nothing, opens one alert, never throws; the next good write resolves it
{
  const calls = []; const sink = { add: (p) => { calls.push(['add', p.dedupeKey]); return 'id1'; }, resolve: (id) => calls.push(['resolve', id]) };
  const state = { openAlerts: {} };
  const bad = runStatusBoard(state, NOW, 'f'.repeat(40), new Map(), { show: () => null, subjects: () => [], write: () => calls.push(['write']), sink, file: '/tmp/x.json' });
  ok('SB23 an unreadable plan writes nothing, opens gov-board-failed once, and returns', bad.ok === false && !calls.some((c) => c[0] === 'write') && state.openAlerts[BOARD_FAILED_KEY] === 'id1');
  runStatusBoard(state, NOW, 'f'.repeat(40), new Map(), { show: () => null, subjects: () => [], write: () => {}, sink, file: '/tmp/x.json' });
  ok('SB24 ...and does not open a second alert on the next failing tick', calls.filter((c) => c[0] === 'add').length === 1);
  const written = [];
  const good = runStatusBoard(state, NOW, 'f'.repeat(40), new Map(), { show: (_r, p) => (p === PLAN_LINE.path ? PLAN : DESC), subjects: () => SUBJECTS,
    write: (f, b) => written.push([f, b]), sink, file: 'C:/no-such-dir-needed/board.json' });
  ok('SB25 the next good write resolves it', good.ok === true && written.length === 1 && calls.some((c) => c[0] === 'resolve' && c[1] === 'id1') && !state.openAlerts[BOARD_FAILED_KEY]);
  const s2 = { openAlerts: {} };
  const threwSink = { add: () => { throw new Error('sink down'); }, resolve: () => {} };
  let escaped = false; try { runStatusBoardSafely(s2, NOW, null, { show: () => null, subjects: () => [], write: () => {}, sink: threwSink }); } catch { escaped = true; }
  ok('SB26 even a failing failure-alert add does not escape the tick', escaped === false);
}
// Every config.mjs id form is read in a table cell (Langston, Step-2 r5 fold: the B79.0n form was missing).
ok('SB28 idsInCell reads every config id form, plus F-G-* and PAPER-RESET-*', ['P19-B6.5a', 'B-NEW-53a', 'B79.0n', 'B-RULES-1e', 'B-TEC-SELFHEAL', 'T-W20C-SCALAR-LEG', 'F-G-1', 'PAPER-RESET-3000']
  .every((id) => idsInCell(`see ${id} here`).join() === id), JSON.stringify(['B79.0n', 'P19-B6.5a'].map((id) => idsInCell(`see ${id} here`))));
ok('SB27 status-board.mjs is in DRIFT_LOADED_FILES (poller imports it)', DRIFT_LOADED_FILES.includes('status-board.mjs'));

// THE LIVE PLAN (scope OBJ-3 verified-by; Langston's PROCEED fold 1): every status cell in §4 AND in the pre-sprint
// table maps under the stated normaliser. A new leading word fails here, before it reaches Kyle's page.
{
  const live = readFileSync(resolve(REPO, PLAN_LINE.path), 'utf8');
  const s4 = []; for (const [, v] of planRowsByBatch(live).rows) for (const r of v.s4) s4.push(r);
  const unmappedS4 = s4.filter((r) => mapStatus(r.status).state === 'unrecognised').map((r) => `${r.rowNo}: ${r.status.slice(0, 40)}`);
  ok('LIVE1 every §4 row with an id maps to a state', unmappedS4.length === 0, JSON.stringify(unmappedS4));
  let pre; try { pre = presprintRows(live); } catch (e) { pre = null; ok('LIVE0 the live plan carries the pre-sprint table', false, String(e.message).slice(0, 120)); }
  if (pre) {
  const unmappedPre = pre.items.filter((i) => i.status.trim().toLowerCase() !== 'row' && mapStatus(i.status).state === 'unrecognised').map((i) => `${i.item}: ${i.status}`);
  const badWaiting = pre.items.filter((i) => mapWaiting(i.waitingOn).waiting === 'unrecognised').map((i) => `${i.item}: ${i.waitingOn}`);
  ok('LIVE2 every pre-sprint status maps to a state', unmappedPre.length === 0, JSON.stringify(unmappedPre));
  ok('LIVE3 every pre-sprint `waiting on` is a declared word or a data window', badWaiting.length === 0, JSON.stringify(badWaiting));
  ok('LIVE4 the live pre-sprint table has no one-copy conflict and no unreadable row', pre.conflicts.length === 0 && pre.malformed.length === 0,
    JSON.stringify({ conflicts: pre.conflicts, malformed: pre.malformed }));
  // Every description heading names something on the board, so a typo in a heading cannot sit unseen as an owed one.
  const descText = readFileSync(resolve(REPO, BOARD_DESCRIPTIONS_PATH), 'utf8');
  const lb = buildBoard({ planText: live, descText, subjects: [], openReason: null, rulebookReadable: false, ref: 'f'.repeat(40), nowMs: NOW });
  const keys = new Set([...lb.items, ...lb.rest].flatMap((x) => [x.key, ...x.ids, ...(x.planRow ? [`row ${x.planRow}`] : [])]));
  const orphans = [...parseDescriptions(descText).keys()].filter((k) => !keys.has(k));
  ok('LIVE5 every description heading names an item on the board', orphans.length === 0, JSON.stringify(orphans));
  }
}

console.log(`\nStatus board tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
