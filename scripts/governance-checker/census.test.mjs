import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// B-PLAN-CURRENCY-CHECK P43 / P45 / P46 — the census and mistake-pass RULES on pinned fixture text (no git, no
// network, no filesystem). Each list has a positive and a negative control; the ruled fixtures of the Group-2 spec
// §1 (R1 widened, the self-contradicting sub-list, R2 + OWNER with `#696` excluded, R3-Q6's negatives) are here.
// Run: node scripts/governance-checker/census.test.mjs
import {
  statusWord, parseLedger, datedHomes, parsePlan, parseAfterLive, parseRoadmap, placement, cellClosed, listD, listE,
  listF, listA, planLines, recountS6, s6AlertDecision, runCensus, censusCounts, censusLists, censusMetadata, censusAlert,
  tallyMistakes, mistakePassAlert, ownerOfIssue, idsIn, hasId, headStatement, DATED_EXCLUSIONS, TITLE_MAX, gitReaders,
  historyStruck, parseHandover, HANDOVER_FILE_RE, tailStatusWord, recountAfterLive,
} from './census.mjs';
import { CENSUS_BODY_MAX } from './config.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL: ${name} ${extra}`); } };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };

// ── R1: the status word and the OPEN rule (pre-audit §1.1 R1) ──
{
  ok('R1 #1108 shape: a leading parenthetical is stripped → OPEN', statusWord(' (RENUMBERED from #668 on 2026-09-29) OPEN 2026-08-07 (CC-C; x)') === 'OPEN');
  ok('R1 leading emoji and bold are stripped → RESOLVED', statusWord(' ✅ RESOLVED 2026-07-02') === 'RESOLVED');
  ok('R1 nested parentheses are balanced', statusWord(' (a (b) c) CLOSED') === 'CLOSED');
  ok('R1 an unbalanced ( empties the word', statusWord(' (never closed OPEN') === '');
  const L = parseLedger([
    '### #1108 (RENUMBERED from #668 on 2026-09-29) OPEN 2026-08-07 (CC-C; audit) — x',
    '- **#482 ✅ RESOLVED 2026-07-01** by a batch',
    '- **#482 OPEN 2026-06-30 (CC-B)** the original',
    '### #906 OPEN (CC-A) x', '### #906 WITHDRAWN y', '### #906 CLOSED z',
    '### #570 OPEN 2026-07-19 (CC-A) — kept open',
    '- **#415 — [a title with no status word]** body',
  ].join('\n'));
  ok('R1 #1108 is OPEN', L.open.has(1108));
  ok('R1 #570 is OPEN', L.open.has(570));
  ok('R1 #482 (a RESOLVED head plus an OPEN head) is NOT OPEN', !L.open.has(482));
  ok('R1 #906 (OPEN, WITHDRAWN, CLOSED) is NOT OPEN', !L.open.has(906));
  ok("R1 '#415 — [...]' is neither OPEN nor widened", !L.open.has(415));
  ok('R1 self-check counts heads and numbers', L.heads.length === 8 && L.byNum.size === 5, `${L.heads.length}/${L.byNum.size}`);
}

// ── R1 widened (R2-Q7 (a)): S1 head-line tail, S2 next line; the self-contradicting sub-list ──
{
  const pad = ' filler'.repeat(40);  // pushes an early OPEN outside the last 150 characters
  const L = parseLedger([
    '- **#450 ✅ THE INSTANCE IS DISPOSITIONED (2026-07-10, CC-B) — the honest action was taken.** body **OPEN (homed).**',
    '- **#451 ⚠️ PREMISE REFUTED 2026-07-10 (CC-B) — THE ISSUE SURVIVES, NARROWER.** more **OPEN (homed).**',
    '- **#348 — Telegram decommission. ✅ RESOLVED 2026-07-02 by batch B-TELEGRAM-DECOMM (CC-A).** Bake **OPEN (dated).**',
    '- **#456 ⚠️ RETRACTED BY ITS AUTHOR 2026-07-10 AS FALSE AT THE PREMISE** — body **OPEN (homed).**',
    '- **#532 ⚠️ CORE DEFECT CLOSED 2026-07-22 (OBJ-1), ISSUE REMAINS OPEN for OBJ-2b.** Mechanism **OPEN (homed).**',
    '- **#374 — reorg-B2.2: tracker PERSISTENCE (Kyle + Langston 2026-06-21).** **OBJ-A** (✅ code DONE, committed) **OPEN (homed).**',
    '### #965 — THE SCANNER\'S "ALREADY HAS AN OPEN POSITION" CHECK READS A TABLE NOTHING WRITES',
    '',
    '**OPEN** · surfaced 2026-09-06',
    '### #965 AMENDMENT 1 — ✅ INVARIANT T2 IS ENFORCED',
    'the next line is prose, not OPEN',
    `- **#700 — title** OPEN early${pad}`,
    '- **#701 — title** CLOSED then **OPEN (homed).** and later CLOSED',
  ].join('\n'));
  ok('S1 #450 (`OPEN (homed).` at the tail) → OPEN', L.open.has(450) && L.s1.has(450));
  ok('S1 #348 (`OPEN (dated).`) → OPEN', L.open.has(348));
  ok('S1 #532 (Q27 subsumed) → OPEN', L.open.has(532));
  ok('S2 #965 (OPEN in the title; the next non-blank line is `**OPEN**`) → OPEN', L.s2.has(965) && L.open.has(965));
  ok('S1 negative: OPEN outside the last 150 characters does not widen', !L.open.has(700));
  ok('S1 negative: the LAST status word must be OPEN', !L.open.has(701));
  const sc = L.selfContradicting.map((x) => x.issue);
  ok('sub-list positive (ruled): #348, #450, #456', [348, 450, 456].every((n) => sc.includes(n)), sc.join());
  ok('sub-list positive: #532', sc.includes(532));
  ok('sub-list negative: #451 (PREMISE REFUTED … SURVIVES)', !sc.includes(451));
  ok("sub-list negative: #374 (the DONE is OBJ-A's, after the head's bold span)", !sc.includes(374));
  ok('sub-list members stay IN the widened OPEN set (listed AND counted)', L.open.has(348) && L.open.has(456));
  ok('sub-list rows carry issue, headLine, filer, reason', L.selfContradicting.every((x) => x.issue && x.headLine && 'filer' in x && x.reason));
  ok('headStatement reads the first bold span', headStatement('- **#1 a b** c **d**') === '#1 a b' && headStatement('### #2 x') === '### #2 x');
}

// ── Q28 (b): reused numbers — two or more OPEN-word heads — are listed every week ──
{
  const L = parseLedger(['### #559 OPEN (CC-A) one', '### #559 OPEN (CC-C) two', '### #560 OPEN (CC-A) only'].join('\n'));
  ok('Q28 a number with two OPEN heads is on the reused list; one with one is not', L.reused.includes(559) && !L.reused.includes(560));
}

// ── R2 + OWNER (R1-Q3), `#696` excluded by name (Q25), R3-Q6 (b) negatives ──
{
  const L = parseLedger([
    '### #738 OPEN (CC-B) x', 'HOME: B-X, DUE 2026-09-05', 'HOME: B-X, owner CC-B',
    '### #744 OPEN (CC-B) x', 'HOME: B-Y — this entry READ "DUE 2026-09-05" and is placed',
    '### #705 OPEN (CC-C) x', 'HOME: B-Z (`due 2026-09-05`)',
    '### #680 OPEN 2026-08-07 (CC-B) x', '**OWNER: CC-B. DUE: 2026-08-09.**',
    '### #696 OPEN 2026-08-19 (CC-C; owner ANALYST, due 2026-08-20) x',
    '### #592 OPEN (CC-B) x', 'HOME: B-Q — releases until 2026-08-30',
    '### #561 OPEN (CC-B) x', 'HOME: B-M — drizzle/migrations/2026-05-30_x.sql',
    '### #599 OPEN (CC-A) x', 'HOME: B-T. Must land before ~2026-08-09.',
    '### #907 OPEN (CC-A) x', '### #907 WITHDRAWN', 'HOME: B-W due 2026-09-05',
    '### #810 OPEN (CC-A) x', 'a line with neither gate word, due 2026-09-01',
    '### #811 OPEN (CC-A) x', '## a heading ends the span', 'HOME: B-V due 2026-09-01',
    // BLOCKER-1 (Langston): a REAL conversion note (RI :3647 form at 13fa6bbce) — struck through datedHomes, not the helper alone.
    '### #681 OPEN (CC-INFRA) x', '**`HOME: #681, owner CC-INFRA, placed at row 162, after row 161`.** This home READ "OWNER: CC-B. DUE: 2026-08-12" until 2026-09-30 (OBJ-8).',
  ].join('\n'));
  const c = datedHomes(L);
  ok('R2 #738 upper-case `DUE` on a HOME line is found', c.issues.includes(738));
  ok('R2 history WIRED (BLOCKER-1): a READ "… DUE: <date>" conversion note on a HOME line is NOT a dated home', !c.issues.includes(681));
  ok('R2 #744 quoted-struck (`"DUE`) excluded', !c.issues.includes(744));
  ok('R2 #705 backticked `due` excluded (the typographic reach limit)', !c.issues.includes(705));
  ok('R1-Q3 #680 an OWNER line with DUE is found', c.issues.includes(680));
  ok('Q25 #696 is EXCLUDED and LISTED with its reason', !c.issues.includes(696) && c.excluded.some((x) => x.issue === 696 && x.reason === DATED_EXCLUSIONS[696]));
  ok('Q25 #696 is found when the exclusion is off (both ways)', datedHomes(L, L.open, { exclusions: {} }).issues.includes(696));
  ok('R1-Q3 R2 as first written (HOME only) does not see #680', !datedHomes(L, L.open, { owner: false }).issues.includes(680));
  ok('R3-Q6 #592 `until <date>` not matched', !c.issues.includes(592));
  ok('R3-Q6 #561 a dated migration file name not matched', !c.issues.includes(561));
  ok('R3-Q6 #599 `before ~<date>` not matched (R2\'s named reach limit)', !c.issues.includes(599));
  ok('R2 #907 (a WITHDRAWN head) excluded', !c.issues.includes(907));
  ok('R2 a date on a line with neither HOME nor OWNER is not caught', !c.issues.includes(810));
  ok('R2 the span stops at a `## ` heading', !c.issues.includes(811));
  ok('R2 counts lines and matches', c.lineCount === 2 && c.matchCount === 2, `${c.lineCount}/${c.matchCount}`);
  ok('R2 `+48h gate` is not a dated home', !datedHomes(parseLedger('### #87 OPEN x\nHOME: B-G, +48h gate')).issues.includes(87));
}

// ── ids: config.mjs's grammar, token-bounded ──
{
  ok('ids: a full name, not its prefix', idsIn('HOME: B-GOV-REPORTING (CC-A)').join() === 'B-GOV-REPORTING');
  ok('ids: bare B-GOV does not match inside B-GOV-REPORTING', !hasId('B-GOV-REPORTING', 'B-GOV') && hasId('see B-GOV here', 'B-GOV'));
  ok('ids: B-RULES-1e and T-W20C-SCALAR-LEG parse (P31)', idsIn('B-RULES-1e and T-W20C-SCALAR-LEG').join() === 'B-RULES-1e,T-W20C-SCALAR-LEG');
  ok('ids: F-G-1 has no id (Q7: no F-G pattern)', idsIn('F-G-1 reopens').length === 0);
}

// ── the plan fixture ──
const PLAN = [
  '# plan',
  '## 0. Clear the plates',
  '| session | in flight now | disposition |',
  '|---|---|---|',
  '| CC-A (Old Claude) | B-GOV-REPORTING — ✅ CLOSED 2026-09-29 | ✅ done |',
  '| Infra Claude | B-CREDENTIALS-PRIVATE-REPO (#1023) — NEW: (4) OBJ-4a DONE 2026-09-29 | RUN NOW |',
  '| CC-C (Analyst Claude) | B-OPEN-THING — Step 7 | FINISH |',
  '## 4. The plan',
  '| # | item | batch / reference | owner | status | report | note |',
  '|---:|---|---|---|---|---|---|',
  '| 1 | first | B-ALPHA | CC-A (Old Claude) | QUEUED | — | + `#300`; mentions #301 in prose |',
  '| 2 | second | B-BETA (`#302`) | CC-B (New Claude) | DONE — report | x | after B-ALPHA; after `#302`; after row 1 |',
  '| 16 | F-G-1 reopens | F-G-1 | CC-C (Analyst Claude) | REOPENED — Step 3 | — | after B-LATER; after B-NOWHERE |',
  '| 32 | pointer | plan row 6 | CC-B (New Claude) | IN FLIGHT | — | after row:6 |',
  '| 107 | T-W20C-SCALAR-LEG | — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | after row 200 |',
  '| 108 | a queued unnamed row | `#628` — batch named at Step 1 | CC-A (Old Claude) | QUEUED | — | — |',
  '| 109 | closed unnamed row | — batch named at Step 1 | Infra Claude | ✅ DONE 2026-09-01 | — | — |',
  '| 160a | scan | `#1013` — batch named at Step 1 | Infra Claude | QUEUED | — | build after B-CREDENTIALS-PRIVATE-REPO OBJ-3; after §0 B-OPEN-THING; after §0 B-GONE |',
  '| 170 | later | B-LATER | Kyle | QUEUED | — | — |',
  '## 5. Running now',
  '| item | owner | closes | report |',
  '|---|---|---|---|',
  '| F-G-1 | CC-C | window closed 2026-09-04 — conversion owed; reopened | — |',
  '| B-WINDOW | CC-B | 2026-10-10 | — |',
  '## 6. Who owns what',
  '| session | group | items |',
  '|---|---|---:|',
  '| CC-A (Old Claude) | g | 2 |',
  '| CC-B (New Claude) | g | 3 |',
  '| CC-C (Analyst Claude) | g | 1 |',
  '| Infra Claude | g | 2 |',
  '**How the tally is counted:** each row once, for the first session named. Total 8.',
  '## 7. end',
].join('\n');
const plan = parsePlan(PLAN);

// ── R2-Q3 (b): the CLOSED test ──
{
  ok('CLOSED: a marker opening the cell', cellClosed('✅ done') && cellClosed('DONE — report') && cellClosed('**CLOSED** 2026-09-01'));
  ok('CLOSED: after a leading `<id> … — ` (B-GOV-REPORTING)', cellClosed('B-GOV-REPORTING — ✅ CLOSED 2026-09-29'));
  ok("CLOSED negative: F-G-1's §5 `window closed … — conversion owed; reopened`", !cellClosed('window closed 2026-09-04 — conversion owed; reopened'));
  ok("CLOSED negative: B-CREDENTIALS-PRIVATE-REPO's in-flight `… OBJ-4a DONE`", !cellClosed('B-CREDENTIALS-PRIVATE-REPO (#1023) — NEW: (4) OBJ-4a DONE 2026-09-29'));
  ok('CLOSED negative: NOT DONE', !cellClosed('NOT DONE yet'));
  ok('the plan parses §0/§4/§5/§6', plan.s0.length === 3 && plan.s4.length === 9 && plan.s5.length === 2 && plan.s6.length === 4,
    `${plan.s0.length}/${plan.s4.length}/${plan.s5.length}/${plan.s6.length}`);
  ok('a plan with no §4 rows REFUSES', throws(() => parsePlan('## 4. x\nno rows'), /ZERO §4 rows/));
}

// ── list (d) (R2-Q2: leg (1) dropped; leg (2) under (b)) ──
{
  const d = listD(plan), rows = d.rows.map((x) => x.row);
  ok('(d) the row-107 shape (item cell is exactly one batch id) is listed', rows.includes('107'));
  ok('(d) row 16 (F-G-1, no F-G pattern — Q7) is listed on its status leg', rows.includes('16'));
  ok('(d) a QUEUED unnamed row is not listed', !rows.includes('108'));
  ok('(d) a pointer row is EXCLUDED from the status leg, and recorded', !rows.includes('32') && d.excluded.some((x) => x.row === '32'));
  ok('(d) a closed unnamed row is EXCLUDED from the status leg, and recorded', !rows.includes('109') && d.excluded.some((x) => x.row === '109'));
  ok('(d) a row with an id is never listed', !rows.includes('1') && !rows.includes('2'));
}

// ── list (e) (R3, Q22 (i), the §0-reference rule) ──
{
  const e = listE(plan);
  const un = e.unmatched.map((x) => `${x.row}:${x.target}`);
  ok('(e) `after B-ALPHA` (an earlier row\'s batch cell) resolves', !un.includes('2:B-ALPHA'));
  ok('(e) a backticked `#302` is CAPTURED (Q22 (i)); it sits in row 2\'s OWN batch cell, not an earlier one, so it is unmatched',
    un.includes('2:#302'));
  ok('(e) `after B-LATER` (a LATER row) is unmatched, as later', e.unmatched.some((x) => x.row === '16' && x.target === 'B-LATER' && /later/.test(x.why)));
  ok('(e) `after B-NOWHERE` is unmatched, names no row', e.unmatched.some((x) => x.target === 'B-NOWHERE' && x.why === 'names no row'));
  ok('(e) `row:6` is NOT read as `row 6`', un.includes('32:row:6'));
  ok('(e) row 160a: `after B-CREDENTIALS-PRIVATE-REPO` resolves through §0 (positive control)', e.viaS0.some((x) => x.row === '160a' && x.target === 'B-CREDENTIALS-PRIVATE-REPO'));
  ok('(e) the explicit `after §0 B-OPEN-THING` form resolves', e.viaS0.some((x) => x.target === 'B-OPEN-THING'));
  ok('(e) `after §0 B-GONE` (no such §0 line) is unmatched', un.includes('160a:§0 B-GONE'));
  ok('(e) `after row 1` (earlier) resolves; `after row 200` does not', e.rowRefs === 2 && e.rowUnmatched.length === 1 && e.rowUnmatched[0].row === '107');
  const bt = listE(parsePlan(PLAN.replace('after B-ALPHA;', 'after `#300`;').replace('| 1 | first | B-ALPHA |', '| 1 | first | B-ALPHA (`#300`) |')));
  ok('(e) a backticked `#nnn` resolves through an EARLIER batch cell (rows 39a/97a/160a/166a shape)', !bt.unmatched.some((x) => x.target === '#300'));
}

// ── B-CENSUS-OWNERLESS-TRIAGE P1 (#1139): a row id deeper than one letter (2a0b) is a §4 row ──
{
  const DEEP = PLAN.replace('| 16 | F-G-1 reopens |',
    ['| 2a0b | deep | B-DEEP | CC-B (New Claude) | QUEUED | — | + `#320` |',
     '| 2a0c | deeper | B-DEEPER | CC-A (Old Claude) | QUEUED | — | after row 2a0b; after row 2a0b.v2; after row 9z9 |',
     '| 16 | F-G-1 reopens |'].join('\n'));
  const dp = parsePlan(DEEP);
  ok('P1 a `2a0b` row is a §4 row (control: the fixture without it has 9)', dp.s4.length === 11 && dp.s4.some((r) => r.rowNo === '2a0b'), String(dp.s4.length));
  ok('P1 the recount counts a deep row for its owner', recountS6(dp).recount['CC-B'] === recountS6(plan).recount['CC-B'] + 1);
  const L = parseLedger(['### #320 OPEN (CC-B) homed on a deep row', '### #321 OPEN (CC-B) homed nowhere'].join('\n'));
  const pls = parseAfterLive('## After live — 0');
  const rm = parseRoadmap('| 19-1 | a | b |');
  const pd = placement(L, dp, pls, rm, []);
  ok('P1 an issue named on a deep row places by number (positive control)', pd.get(320) === 'number');
  ok('P1 an issue not named there stays unplaced (negative control)', pd.get(321).startsWith('U'));
  const e = listE(dp);
  ok('P1 `after row 2a0b` is CAPTURED (3 new references counted) and resolves to the earlier deep row (Langston record C: discriminating)',
    e.rowRefs === listE(plan).rowRefs + 3 && !e.rowUnmatched.some((x) => x.target === 'row 2a0b'), `${e.rowRefs}`);
  ok('P1 a dotted `after row 2a0b.v2` keeps its suffix (Langston C1: no silent narrowing)', e.rowUnmatched.some((x) => x.target === 'row 2a0b.v2'), JSON.stringify(e.rowUnmatched));
  ok('P1 `after row 9z9` (no such row) is unmatched', e.rowUnmatched.some((x) => x.target === 'row 9z9'));
}

// ── lists (a) and (f) ──
{
  const names = ['B_BETA_COMPLETION_REPORT.md', 'B_ALPHA_COMPLETION_REPORT.md', 'B_OPEN_THING_COMPLETION_REPORT.md', 'B_ALPHA_SCOPE.md'];
  const f = listF(plan, names, null);
  ok('(f) a closed-less line with a report is listed (B-ALPHA row 1, §0 B-OPEN-THING)', f.all.includes('§4:1:B-ALPHA') && f.all.includes('§0:B-OPEN-THING'));
  ok('(f) a CLOSED line with a report is not (B-BETA row 2 is DONE)', !f.all.includes('§4:2:B-BETA'));
  ok('(f) an unchanged set gives NEW = 0', listF(plan, names, f.all).new.length === 0);
  ok('(f) one added line gives NEW = 1', listF(plan, names, f.all.filter((k) => k !== '§0:B-OPEN-THING')).new.length === 1);
  const a = listA(plan, ['B_ALPHA_COMPLETION_REPORT.md', 'B_BETA_COMPLETION_REPORT.md', 'B_NEW_ONE_COMPLETION_REPORT.md', 'B_ALPHA_SCOPE.md']);
  const v = Object.fromEntries(a.map((x) => [x.file, x.verdict]));
  ok('(a) a new report whose plan line is not closed → not-closed-in-plan', v['B_ALPHA_COMPLETION_REPORT.md'] === 'not-closed-in-plan');
  ok('(a) a new report whose plan line is closed → not listed', !('B_BETA_COMPLETION_REPORT.md' in v));
  ok('(a) a new report on no plan line → in-no-plan-line', v['B_NEW_ONE_COMPLETION_REPORT.md'] === 'in-no-plan-line');
  ok('(a) a non-completion file is ignored', !('B_ALPHA_SCOPE.md' in v));
  ok('plan lines read §4 batch, §0 in-flight and §5 item cells', planLines(plan).some((p) => p.key === '§5:B-WINDOW'));
}

// ── list (b): placement (Q9 (b), R1-Q13 (c), Q5) ──
{
  const L = parseLedger([
    '### #300 OPEN (CC-A) homed by the plan\'s note form', '### #301 OPEN (CC-A) a prose mention in a note only',
    '### #302 OPEN (CC-B) in a batch cell', '### #303 OPEN (CC-A) x', 'HOME: B-ALPHA (CC-A)',
    '### #304 OPEN (CC-A) parked', '### #305 OPEN (CC-A) x', 'HOME: B-NOT-A-REAL-BATCH',
    '### #306 OPEN (CC-A) x', 'HOME: B-GOV', '### #307 OPEN (CC-B) no home line at all',
    '### #308 OPEN (CC-A) x', 'HOME: B-DONE-ELSEWHERE (it has a report)', '### #309 OPEN (CC-A) x', 'HOME: POST_AUDIT_ROADMAP, in prose',
    '### #310 OPEN (CC-A) x', 'HOME: PHASE_19_PLAN row 4.8', '### #311 OPEN (CC-A) x', 'HOME: somewhere, no id',
    '### #312 OPEN (CC-A) x', 'HOME: POST_AUDIT_ROADMAP 19-1', '### #313 OPEN (CC-A) roadmap row carries it',
    '### #314 OPEN (CC-A) x', 'HOME: B-PARKED-ONE',
  ].join('\n'));
  const pls = parseAfterLive(['## After live — 1', '### theme', '- B-AFTER (CC-B) — x', '## Parked by Kyle — 2', '- #304 — parked by Kyle', '- B-PARKED-ONE — parked'].join('\n'));
  const rm = parseRoadmap('| 19-1 | a | b |\n| 19-2 | carries #313 | c |');
  const names = ['B_DONE_ELSEWHERE_COMPLETION_REPORT.md'];
  const p = placement(L, plan, pls, rm, names);
  ok('(b) `+ `#300`` in a note cell (a named homing form) places — R1-Q13 (c)', p.get(300) === 'number');
  ok('(b) a plain prose #301 in a note cell does NOT place under (c)', p.get(301) !== 'number');
  ok('(b) ...but does under (a), every note mention (the delta the dry run records)', placement(L, plan, pls, rm, names, { noteCells: 'any' }).get(301) === 'number');
  ok('(b) a #N in a batch cell places', p.get(302) === 'number');
  ok('(b) a HOME batch id in a §4 batch cell places (Q9 (b))', p.get(303) === 'homeBatch');
  ok('(b) a parked-list mention is placed, as its own sub-count', p.get(304) === 'parked' && p.get(314) === 'parked');
  ok('(b) a fake id is unplaced (U5)', p.get(305) === 'U5');
  ok('(b) a bare prefix B-GOV is unplaced (U5)', p.get(306) === 'U5');
  ok('(b) U1 no HOME line', p.get(307) === 'U1');
  ok('(b) U2 a HOME batch with a completion report', p.get(308) === 'U2');
  ok('(b) U3 roadmap prose only', p.get(309) === 'U3');
  ok('(b) U4 PHASE_19_PLAN / an id-less row', p.get(310) === 'U4');
  ok('(b) U6 a HOME line with no id', p.get(311) === 'U6');
  ok('(b) a HOME line citing the roadmap AND an existing row id is roadmap-positioned', p.get(312) === 'roadmap');
  ok('(b) a roadmap row carrying #N places it', p.get(313) === 'roadmap');
}

// ── R3-Q9: owners widened and labelled; the (CC-x head token is the FILER ──
{
  const L = parseLedger(['### #1 OPEN (CC-B) x', 'HOME: B-X (CC-A)', 'OWNER: CC-C.', '### #2 OPEN (CC-B) x', 'HOME: B-Y (CC-A)',
    '### #3 OPEN (CC-B) x', 'no home', '### #4 OPEN 2026-01-01 x', '### #5 OPEN (CC-C; owner ANALYST, due x) y'].join('\n'));
  const o = (n) => ownerOfIssue(L.byNum.get(n));
  ok('owner: an OWNER line wins', o(1).label === 'owner CC-C' && o(1).source === 'ownerLine');
  ok('owner: then a session on a HOME line', o(2).label === 'owner CC-A');
  ok('owner: a head token alone prints as `filer`', o(3).label === 'filer CC-B');
  ok('owner: nothing known → `owner ?`', o(4).label === 'owner ?');
  ok('owner: `owner ANALYST` → CC-C', o(5).label === 'owner CC-C');
  // #1167 (Langston Step-1 C3/C4): a LABELLED placing-line source, only when a ctx is passed
  ok('owner: no ctx → exactly as before (no placingLine key) — every existing caller is unchanged', !('placingLine' in o(4)) && o(4).source === 'unknown' && o(4).label === 'owner ?');
  const pc = { placingOwner: () => 'CC-B' };
  const p4 = ownerOfIssue(L.byNum.get(4), pc);
  ok('owner: with ctx, an issue with no owner of its own reads `placing-line CC-B`, never `owner CC-B`', p4.source === 'placingLine' && p4.label === 'placing-line CC-B' && p4.placingLine === 'CC-B');
  ok('owner: with ctx, the issue own owner still wins (ownerLine, homeLine, filer)', ownerOfIssue(L.byNum.get(1), pc).source === 'ownerLine' && ownerOfIssue(L.byNum.get(2), pc).source === 'homeLine' && ownerOfIssue(L.byNum.get(3), pc).source === 'filer');
  ok('owner: with ctx but no placing owner → `owner ?`', ownerOfIssue(L.byNum.get(4), { placingOwner: () => null }).source === 'unknown');
}

// ── R3-Q7: the §6 recount ──
{
  const rec = recountS6(plan);
  ok('§6 recount: first session in the owner cell; Kyle owns no rows', rec.recount['CC-A'] === 2 && rec.recount['CC-B'] === 3 && rec.recount['CC-INFRA'] === 2 && rec.recount['CC-C'] === 1, JSON.stringify(rec.recount));
  ok('§6 recount agrees with the fixture table', rec.agree);
  const off = PLAN.replace('| CC-B (New Claude) | g | 3 |', '| CC-B (New Claude) | g | 5 |');
  const recOff = recountS6(parsePlan(off));
  ok('§6 recount disagrees when the table is wrong', !recOff.agree && recOff.diffs[0].session === 'CC-B');
  const addRow = (t) => t.replace('| 170 | later |', '| 169 | new | B-NEW | CC-B (New Claude) | QUEUED | — | — |\n| 170 | later |');
  // the newest tally change ALSO touched §6 (to a wrong value) → no alert (row 1's rule)
  const touched = addRow(PLAN).replace('| CC-B (New Claude) | g | 3 |', '| CC-B (New Claude) | g | 6 |');
  ok('§6 not alerted when §6 was touched in the same commit as the §4 change',
    s6AlertDecision(recountS6(parsePlan(touched)), [{ sha: 'c2', text: touched }, { sha: null, text: PLAN }]).alert === false);
  const untouched = addRow(PLAN);
  const dec = s6AlertDecision(recountS6(parsePlan(untouched)), [{ sha: 'c2', text: untouched }, { sha: 'c1', text: PLAN }, { sha: null, text: PLAN }]);
  ok('§6 alerted when the §4 change left §6 untouched, naming that commit', dec.alert === true && dec.commit === 'c2' && dec.sameCommit === false);
  ok('§6 alerted when no tally change is found in the window (cannot be shown)', s6AlertDecision(recOff, [{ sha: 'c1', text: off }, { sha: null, text: off }]).alert === true);
  // Step 4 G7-3 CONDITION 1: the STATED Total (prose) against the SUM of the cells — its own diff, alerting on its own
  const tot = recountS6(plan);
  ok('C1: the fixture stated Total 8 agrees with its cells', tot.statedTotal === 8 && tot.cellSum === 8 && tot.totalAgree === true);
  const noTotal = recountS6(parsePlan(PLAN.replace(' Total 8.', '')));
  ok('C1: a missing Total does not agree (never read as fine)', noTotal.statedTotal === null && noTotal.totalAgree === false);
  const twoTotals = recountS6(parsePlan(PLAN.replace('## 6. Who owns what', '## 6. Who owns what\nAn older note said Total 8.')));
  ok('C1 nit: two "Total N." lines in §6 are ambiguous — not agreeing', twoTotals.statedTotal === null && twoTotals.totalAgree === false);
  const wrongTotal = recountS6(parsePlan(PLAN.replace('Total 8.', 'Total 7.')));
  ok('C1: a wrong Total with cells that match the recount: the cells agree, the Total does not', wrongTotal.agree === true && wrongTotal.totalAgree === false);
  const drift = parsePlan(addRow(PLAN).replace('| CC-B (New Claude) | g | 3 |', '| CC-B (New Claude) | g | 4 |'));
  const dr = recountS6(drift);
  ok('C1: the 2026-09-30 shape (a row added, its cell updated, the Total left): cells agree, Total 8 vs 9 disagrees', dr.agree && !dr.totalAgree && dr.cellSum === 9, JSON.stringify([dr.agree, dr.statedTotal, dr.cellSum]));
  // the live history reader (fakes injected): a failed read at a commit the log named refuses, never reads as ''
  // (as '' it would parse to no tally and report §6 as touched there — the alert above would be suppressed)
  const log = () => 'c2\nc1\n';
  const texts = { c2: untouched, c1: PLAN, 'c1^': null };
  const noParent = () => { throw new Error('unknown revision'); };
  const h = gitReaders.planHistory('r', 'plan.md', 20, { log, show: (sha) => texts[sha], revParse: noParent });
  ok('§6 history: newest first; the oldest one parent reads as empty ONLY when the parent commit does not exist', h.map((x) => x.sha).join() === 'c2,c1,' && h[2].text === '' && h[0].text === untouched);
  // Round 2 (Langston): the two legs above INJECT revParse; this leg does NOT — it runs the live `git rev-parse` against
  // THIS repository, so the branch the live wiring takes is the one tested. Class check first (his rider): the only
  // `io.X ?? live` defaults in the checker are census.mjs planHistory's show, log and revParse; this leg leaves revParse
  // and the parent-exists decision to live git (show and log stay injected so the texts are fixed).
  {
    // Round 3 (Langston): resolve against the SAME root planHistory uses (census.mjs REPO_ROOT, script-derived), not
    // process.cwd() — a divergence would make the root leg pass vacuously.
    const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const g = (a) => execFileSync('git', a, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const root = g(['rev-list', '--max-parents=0', 'HEAD']).split('\n')[0];
    const shallow = g(['rev-parse', '--is-shallow-repository']) === 'true';
    const hRoot = gitReaders.planHistory('r', 'plan.md', 20, { log: () => `${root}\n`, show: (sha) => (sha === root ? PLAN : null) });
    ok('C2 LIVE git: the ROOT commit has no parent, so its missing parent text reads as empty', hRoot.length === 2 && hRoot[1].text === '');
    if (!shallow) {
      const head = g(['rev-parse', 'HEAD']);
      ok('C2 LIVE git: a commit whose parent EXISTS but reads as nothing REFUSES',
        throws(() => gitReaders.planHistory('r', 'plan.md', 20, { log: () => `${head}\n`, show: (sha) => (sha === head ? PLAN : null) }), /though the parent exists/));
    } else console.log('  (C2 live existing-parent leg skipped: shallow clone — every parent is absent there)');
  }
  // Step 4 G7-9 CONDITION 2: a parent that EXISTS but reads as nothing refuses (it would suppress the §6 alert)
  ok('§6 history: an existing parent whose read failed REFUSES', throws(() => gitReaders.planHistory('r', 'plan.md', 20, { log, show: (sha) => texts[sha], revParse: () => 'p'.repeat(40) }), /though the parent exists/));
  ok('§6 history: a failed read at a logged commit REFUSES', throws(() => gitReaders.planHistory('r', 'plan.md', 20, { log, show: (sha) => (sha === 'c1' ? null : texts[sha]) }), /returned nothing at a commit that touched it/));
}

// ── runCensus refusals and a whole fixture run ──
const LEDGER = ['### #300 OPEN (CC-A) x', '### #400 OPEN (CC-B) x', 'HOME: B-ALPHA (CC-A), due 2026-09-05'].join('\n');
const WORLD = {
  [`1-system-manual/RUNNING_ISSUES.md`]: LEDGER, [`1-system-manual/SPRINT_TO_LIVE_PLAN.md`]: PLAN,
  [`Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md`]: '## After live — 1\n- B-AFTER — x\n## Parked by Kyle — 0\n',
  [`1-system-manual/POST_AUDIT_ROADMAP.md`]: '| 19-1 | a | b |',
};
const readers = (over = {}) => ({
  show: (ref, p) => (p in (over.files || {}) ? over.files[p] : WORLD[p]),
  names: (ref, dir) => (over.namesByDir && dir in over.namesByDir ? over.namesByDir[dir] : (over.names ?? ['B_BETA_COMPLETION_REPORT.md'])),
  added: (prev, ref) => { (over.calls || []).push(['added', prev, ref]); return over.added ?? []; },
  planHistory: () => [], refBefore: () => 'p'.repeat(40), bodies: () => [],
});
{
  const r = runCensus({ ref: 'a'.repeat(40), prevRef: 'b'.repeat(40), readers: readers() });
  ok('runCensus: self-check heads/numbers/OPEN', r.selfCheck.heads === 2 && r.selfCheck.numbers === 2 && r.selfCheck.open === 2);
  ok('runCensus: list (c) finds #400', r.c.issues.some((x) => x.n === 400));
  ok('runCensus: REFUSES on an empty ledger read', throws(() => runCensus({ ref: 'a', prevRef: 'b', readers: readers({ files: { '1-system-manual/RUNNING_ISSUES.md': null } }) }), /returned nothing/));
  ok('runCensus: REFUSES on zero heads', throws(() => runCensus({ ref: 'a', prevRef: 'b', readers: readers({ files: { '1-system-manual/RUNNING_ISSUES.md': 'no heads here' } }) }), /ZERO entry heads/));
  ok('runCensus: REFUSES on an empty Batch Completion listing', throws(() => runCensus({ ref: 'a', prevRef: 'b', readers: readers({ names: [] }) }), /EMPTY/));
  const calls = [];
  runCensus({ ref: 'R', prevRef: 'P', readers: readers({ calls }) });
  ok('runCensus: list (a) is windowed by REF (prevRef..ref), never by clock', calls.length === 1 && calls[0][1] === 'P' && calls[0][2] === 'R');
  // #1167 list (b′): #302 is placed by row 2's batch cell (owner CC-B) and has no owner of its own → listed as
  // `placing-line CC-B` (positive control); #300 is placed too but has a filer → not listed (negative control).
  const r2 = runCensus({ ref: 'a'.repeat(40), prevRef: 'b'.repeat(40), readers: readers({ files: { '1-system-manual/RUNNING_ISSUES.md': [LEDGER, '### #302 OPEN 2026-01-01 nobody took it'].join(String.fromCharCode(10)) } }) });
  ok('(b′) a placed issue with no owner of its own is listed, labelled by its placing line', r2.b.placedOwnerless.length === 1 && r2.b.placedOwnerless[0].n === 302 && r2.b.placedOwnerless[0].owner === 'placing-line CC-B', JSON.stringify(r2.b.placedOwnerless));
  ok('(b′) a placed issue with a filer is not listed', !r2.b.placedOwnerless.some((x) => x.n === 300));
  ok('(b′) counts carry po and the owner sources count placingLine', censusCounts(r2).po === 1 && r2.ownerSources.placingLine === 1 && censusLists(r2).po.join() === '302');
  ok('(b′) the alert body names it', /placed but ownerless 1/.test(censusAlert(r2, { week: '2026-W42', severity: 'info' }).body));
  // Langston Step-4 BLOCKER-2: the HOME-id leg of placingOwnerOf, reached for real (no stub). #303 has no owner of its own
  // and is placed ONLY through `HOME: B-ALPHA`, row 1's batch cell (owner CC-A) → `placing-line CC-A`. #304 is placed only
  // through a NOTE homing form (`with B-NOTEONLY` on row 107, owner CC-B) → `placing-line CC-B` (FINDING-1: the same rules
  // as placement(), noteHomesId included). Both FAIL on the shipped 8655a1bfd bytes, where `\b` in /\bHOME\b/ was 0x08.
  const NL = String.fromCharCode(10);
  const plan3 = PLAN.replace('| 107 | T-W20C-SCALAR-LEG | — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | after row 200 |',
    '| 107 | T-W20C-SCALAR-LEG | — batch named at Step 1 | CC-B (New Claude) | QUEUED | — | with B-NOTEONLY; after row 200 |');
  const r3 = runCensus({ ref: 'a'.repeat(40), prevRef: 'b'.repeat(40), readers: readers({ files: {
    '1-system-manual/RUNNING_ISSUES.md': [LEDGER, '### #303 OPEN 2026-01-01 homed by batch only', 'HOME: B-ALPHA',
      '### #304 OPEN 2026-01-01 homed by a note only', 'HOME: B-NOTEONLY'].join(NL),
    '1-system-manual/SPRINT_TO_LIVE_PLAN.md': plan3 } }) });
  const po3 = Object.fromEntries(r3.b.placedOwnerless.map((x) => [x.n, x.owner]));
  ok('(b′) HOME-id leg: an issue placed only by `HOME: <batch>` reads the batch row owner', po3[303] === 'placing-line CC-A', JSON.stringify(r3.b.placedOwnerless));
  ok('(b′) HOME-id leg via a note homing form (`with B-X`) reads that row owner', po3[304] === 'placing-line CC-B', JSON.stringify(r3.b.placedOwnerless));
}

// ── P45: body, title, metadata; the Discord render at maximum realistic sizes ──
// COPIES of scripts/system-alerts.ts formatAlertTextDiscord (:84-102) and frameResurface (:168-180), as P45 names.
function formatAlertTextDiscord(alert) {
  const meta = Object.keys(alert.metadata).length > 0 ? `\n_Metadata:_ \`${JSON.stringify(alert.metadata).slice(0, 300)}\`` : '';
  const header = alert.category === 'governance' ? `🏛️ **GOVERNANCE CHECK ISSUE — ${alert.severity.toUpperCase()}**` : `🚨 **SYSTEM ALERT — ${alert.severity.toUpperCase()}**`;
  const text = `${header}\n**${alert.title}**\n${alert.body}\n_Category:_ ${alert.category}  ·  _Alert ID:_ \`${alert.id}\`${meta}`;
  return text.length > 1900 ? text.slice(0, 1900) + '…' : text;
}
function frameResurface(alert, d, nowMs) {
  const hrs = Math.max(0, Math.round((nowMs - Date.parse(alert.fired_at)) / 3_600_000));
  const owner = alert.acknowledged_by ? `owned by ${alert.acknowledged_by}` : 'UNCLAIMED — nobody has acked it';
  const kyle = d.escalateToKyle ? `\n\nKyle — open ~${hrs}h with no resolution; please push it to closure or reassign.` : '';
  return { ...alert, title: `⏰ RE-SURFACE #${d.resurfaceCount} — STILL UNRESOLVED: ${alert.title}`,
    body: `${owner}, open ~${hrs}h. ${alert.body}\nClose it: resolve ${alert.id} --by <your canonical actor> --evidence <ref>.${kyle}` };
}
{
  const big = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const longId = 'B-A-VERY-LONG-BATCH-IDENTIFIER-THAT-GOES-ON-AND-ON-FOR-A-WHILE';
  const r = {
    ref: 'f'.repeat(40), selfCheck: { heads: 9999, numbers: 9999, open: 9999, openR1: 9999, s1: 9999, s2: 9999 },
    a: big(999, (i) => ({ file: `${longId}_${i}_COMPLETION_REPORT.md`, verdict: i % 2 ? 'in-no-plan-line' : 'not-closed-in-plan', owner: null })),
    b: { placed: { number: 9999, homeBatch: 9999, parked: 9999, roadmap: 9999 }, unplaced: big(999, (i) => ({ n: 10000 + i, code: 'U5', why: 'HOME batch in no list', owner: 'owner ?' })),
      byWhy: { U1: 9999, U2: 9999, U3: 9999, U4: 9999, U5: 9999, U6: 9999 }, selfContradicting: big(999, (i) => ({ issue: i })), reused: big(999, (i) => i),
      handover: { handed: 9999, stillUnplaced: big(999, (i) => i), placedSince: big(999, (i) => i), closedSince: big(999, (i) => i), vanishedSince: big(999, (i) => i) },
      // #1180 (Langston Step-1 condition 2): the fixture carries every key runCensus ships, or the slice it measures is
      // smaller than the live one. placedOwnerless was missing since #1167.
      placedOwnerless: big(999, (i) => ({ n: 30000 + i, owner: 'owner ?' })) },
    afterLive: { al: 9999, disagree: big(999, (i) => ({ line: i, heading: longId, stated: 9999, recount: 1 })),
      partialStrikes: big(999, (i) => i), bothMarked: big(999, (i) => i), orphans: big(999, (i) => i), unparseable: big(999, (i) => i),
      headline: { stated: 9999, recount: 1 }, summary: { line: 5, stated: 9999 }, themes: [] },
    c: { issues: big(999, (i) => ({ n: 20000 + i, lines: [1, 2], owner: 'filer CC-INFRA' })), lineCount: 9999, matchCount: 9999, excluded: [{ issue: 696 }] },
    d: { rows: big(999, (i) => ({ row: `${i}a`, why: 'item cell is one batch id', owner: 'CC-INFRA' })), excluded: big(999, (i) => ({ row: i })) },
    e: { refs: big(999, () => ({})), rowRefs: 999, unmatched: big(999, (i) => ({ row: `${i}`, target: longId, owner: 'CC-A' })), rowUnmatched: [], viaS0: [] },
    f: { all: big(999, (i) => `§4:${i}:${longId}`), ids: [], new: big(999, (i) => ({ key: `§4:${i}:${longId}`, where: `§4 row ${i}`, id: longId, owner: 'CC-B' })) },
    g: { agree: false, diffs: [{ session: 'CC-A', recount: 9999, table: 1 }, { session: 'CC-B', recount: 9999, table: 1 }, { session: 'CC-C', recount: 9999, table: 1 }, { session: 'CC-INFRA', recount: 9999, table: 1 }], alert: true, statedTotal: null, cellSum: 99999, totalAgree: false },
  };
  const week = '2026-W40';
  const t = censusAlert(r, { week, severity: 'warning', storeUnreadable: true });
  ok(`P45 title ≤ ${TITLE_MAX}`, t.title.length <= TITLE_MAX, String(t.title.length));
  ok(`P45 body ≤ ${CENSUS_BODY_MAX} at maximum sizes (examples dropped, counts kept)`, t.body.length <= CENSUS_BODY_MAX && /unplaced 999/.test(t.body), String(t.body.length));
  ok('P45 the body does not lead with Langston; it names owner CC-A and "do not ack"', !/^Langston/.test(t.body) && /owner=CC-A, do not ack\. action="run the weekly census worklist; resolve this row when the listed items are dispositioned"/.test(t.body));
  ok('P45 the unreadable-store sentence is in the body', /Alert store unreadable/.test(t.body));
  ok('P45 the last line names the metadata row and the box file', /metadata\.lists[\s\S]*box file \/var\/lib\/governance-checker\/census\/2026-W40\.json\.$/.test(t.body));
  const counts = censusCounts({ ...r, b: { ...r.b, unplaced: r.b.unplaced } });
  const nines = JSON.parse(JSON.stringify(counts), (k, v) => (typeof v === 'number' ? 9999 : v));
  const meta = censusMetadata({ counts: nines, dedupeKey: `gov-plancensus:${week}`, week, ref: r.ref, lists: censusLists(r) });
  const head = meta.slice(0, 300);
  let recovered = null;
  try { recovered = JSON.parse(head.slice(head.indexOf('{"h"'), head.indexOf('},"dedupe_key"') + 1)); } catch { /* not in the slice → FAIL below */ }
  ok('P45 the counts object, every count at 9,999, is recovered whole from the first 300 characters', JSON.stringify(recovered) === JSON.stringify(nines), head);
  // #1180: print both lengths every run — the body against CENSUS_BODY_MAX, the counts object against the 300 slice.
  console.log(`  P45 lengths: body ${t.body.length}/${CENSUS_BODY_MAX} · counts object ${JSON.stringify(nines).length} chars, ends at metadata char ${meta.indexOf('},"dedupe_key"') + 1}/300`);
  ok('P45 the counts carry al and po (#1180, the keys runCensus ships)', 'al' in counts && 'po' in counts, JSON.stringify(Object.keys(counts)));
  ok('P45 metadata key order: counts, dedupe_key, source, week, ref, lists', Object.keys(JSON.parse(meta)).join() === 'counts,dedupe_key,source,week,ref,lists');
  ok('P45 metadata ≤ 64 KB (lists cut with a stated marker when over)', Buffer.byteLength(meta) <= 65536 && (JSON.parse(meta).lists.truncated ? /box file/.test(JSON.parse(meta).lists.truncated) : true));
  const alert = { id: '12345678-aaaa-bbbb-cccc-1234567890ab', category: 'verification', severity: 'warning', title: t.title, body: t.body,
    metadata: JSON.parse(meta), fired_at: '2026-09-28T09:00:00Z', acknowledged_by: null };
  const fresh = formatAlertTextDiscord(alert);
  ok('P45 Discord render, fresh: ≤ 1,900 and the footer with the alert id survives the cut', fresh.length <= 1900 && fresh.includes(alert.id) && !fresh.endsWith('…'), String(fresh.length));
  const second = formatAlertTextDiscord(frameResurface(alert, { resurfaceCount: 2, escalateToKyle: true }, Date.parse('2026-10-01T09:00:00Z')));
  ok('P45 Discord render, 2nd re-surface: ≤ 1,900 and the footer survives', second.length <= 1900 && /_Alert ID:_ `12345678/.test(second) && !second.endsWith('…'), String(second.length));
}

// ── P46: the mistake pass ──
{
  const t = tallyMistakes(['fix x\n\nMISTAKE: wrong-object [B-X] — y\nCo-Authored-By: a', 'MISTAKE: skipped-the-gate [B-Y] — straight to build\nMISTAKE: wrong-object [B-Z] — w', 'plain']);
  ok('P46 trailer tally by slug (the positive control: 2 slugs)', t.slugs['wrong-object'] === 2 && t.slugs['skipped-the-gate'] === 1 && Object.keys(t.slugs).length === 2 && t.total === 3);
  ok('P46 skipped-the-gate counted; #754 tripwire hit lines counted', t.skippedGate === 1 && t.tripwire === 1, JSON.stringify(t));
  const none = tallyMistakes(['no trailer here', 'MISTAKES are mentioned mid-line: MISTAKE: not-a-trailer']);
  ok('P46 zero on none (a mid-line MISTAKE: is not a trailer)', none.total === 0 && none.tripwire === 0);
  const m = mistakePassAlert(t, { week: '2026-W40', ref: 'a'.repeat(40), prevRef: 'b'.repeat(40), severity: 'info' });
  ok('P46 body leads OLD Claude, carries the counts and the resolve instruction', /^OLD Claude — weekly mistake-pattern pass 2026-W40/.test(m.body) && /wrong-object 2/.test(m.body) && /resolve with the run-log commit sha/.test(m.body));
  ok('P46 metadata counts first', m.metadata.startsWith('{"counts":{"t":3,'));
  ok('P46 title ≤ 80', m.title.length <= TITLE_MAX);
}

// ── W40 finding (NEW Claude): a date inside OBJ-8's conversion HISTORY note is struck. The first four are real W40
// list-(c) lines (RUNNING_ISSUES at 13fa6bbce: :3629, :429, :3732, :5090) — all 13 hits of that census were this shape.
// The last three are the controls: a LIVE dated home, quoted or bracketed, must still hit.
{
  const at = (l, w) => historyStruck(l, l.indexOf(w));
  ok('R2 history: READ "OWNER: … DUE: <date>" is struck (#680 form)', at('This home READ "OWNER: CC-B. DUE: 2026-08-09" until 2026-09-30', 'DUE') === true);
  ok('R2 history: READ "(owner …, due <date>)" is struck (#455 form)', at('This home READ "(owner CC-B, due 2026-07-12)" until 2026-09-30', 'due') === true);
  ok('R2 history: (Was: "… due <date>" is struck (#705 form)', at('*(Was: "its own small batch after the #618 build — due 2026-09-05"; dated homes', 'due') === true);
  ok('R2 history: (Was `<id>`, due <date> is struck (#908 form)', at('*(Was `B-LIQUIDITY-UNIT-AUDIT`, due 2026-09-05 — that batch', 'due') === true);
  ok('R2 history control: a live HOME … due <date> still hits', at('HOME: B-X, owner CC-A, due 2026-10-05', 'due') === false);
  ok('R2 history control: a quoted live home (no READ/Was) still hits', at('HOME: "B-X, owner CC-A, due 2026-10-05"', 'due') === false);
  ok('R2 history control: a bracket that is not (Was …) still hits', at('(owner CC-A, due 2026-10-05)', 'due') === false);
}

// ── A2 (Langston, W40): handover records → three states per item ──
{
  const HO = ['# x', 'Every item above is **handed over 2026-09-30** — post id 1.', '## THE SETS', '### CC-B — 2', '| # | why |', '|---|---|',
    '| `#300` | U1 — no HOME line |', '| `#999` | U1 — no HOME line |', '## THE OTHER LISTS, BY ID', '| `#400` | 546 | owner CC-B |'].join('\n');
  const h = parseHandover(HO, 'fx');
  ok('A2 parseHandover: the date and ONLY the items under ## THE SETS (#400 in a later section is not an item)',
    h.date === '2026-09-30' && [...h.issues].sort().join() === '300,999');
  ok('A2 parseHandover REFUSES a record with no date', throws(() => parseHandover(HO.replace('handed over', 'given'), 'fx'), /no "handed over/));
  ok('A2 parseHandover REFUSES a record naming no items', throws(() => parseHandover(HO.replace(/\| `#\d+`/g, '| x'), 'fx'), /names no items/));
  ok('A2 the file pattern: a W40 record matches, the census JSON does not',
    HANDOVER_FILE_RE.test('B_PLAN_CURRENCY_CHECK_CENSUS_2026-W40_HANDOVER.md') && !HANDOVER_FILE_RE.test('B_PLAN_CURRENCY_CHECK_CENSUS_2026-W40.json'));
  const SF = 'Claude Comms and Packages/Scope Files';
  const hr = readers({ namesByDir: { [SF]: ['X_CENSUS_2026-W40_HANDOVER.md', 'PRE_LIVE_SPRINT.md'] }, files: { [`${SF}/X_CENSUS_2026-W40_HANDOVER.md`]: HO } });
  const r = runCensus({ ref: 'a'.repeat(40), prevRef: 'b'.repeat(40), readers: hr });
  const u300 = r.b.unplaced.find((x) => x.n === 300);
  ok('A2 runCensus: one record, two handed ITEMS; #999 is in no ledger entry, so it is VANISHED, not closed (FINDING-2)',
    r.b.handover.handed === 2 && r.b.handover.vanishedSince.join() === '999' && r.b.handover.closedSince.length === 0 && !r.b.unplaced.some((x) => x.n === 999));
  ok('A2 runCensus: #300 is either still unplaced WITH its handover date, or placed — never "never surfaced"',
    (u300 && u300.handedOver === '2026-09-30' && r.b.handover.stillUnplaced.includes(300)) || r.b.handover.placedSince.includes(300));
  ok('A2 runCensus: an item NOT in any record carries no handover date', r.b.unplaced.filter((x) => x.n !== 300).every((x) => x.handedOver === null));
  ok('A2 runCensus REFUSES an empty Scope Files listing (a failed read must not read as "never surfaced")',
    throws(() => runCensus({ ref: 'a', prevRef: 'b', readers: readers({ namesByDir: { [SF]: [] } }) }), /listing .* is EMPTY/));
  const txt = censusAlert(r, { week: '2026-W40', severity: 'info' });
  ok('A2 the body carries the handover clause at normal sizes', /handed over 2: \d+ unplaced, \d+ placed, 0 closed, 1 vanished/.test(txt.body), txt.body.slice(0, 400));
  ok('A2 nit: the bold date form `**handed over** 2026-09-30` parses', parseHandover(HO.replace('handed over 2026-09-30', '**handed over** 2026-09-30'), 'fx').date === '2026-09-30');
}

// ── B-LEDGER-TAIL-DISPOSITION (#1169): the TAIL leg of the self-contradicting list ──────────────────────────────
{
  const L = parseLedger([
    '- **#901 OPEN 2026-06-26 (x) — a fixed thing.** body text | RESOLVED (P19-B6.9)',          // (i) listed
    '- **#902 OPEN 2026-06-26 (x) — another.** body | CLOSED (by a commit)',                       // (ii) second hit, one parse
    '- **#903 OPEN 2026-06-26 (x) — quoted code.** see `pre_audit | RESOLVED` in the row',        // (iii) code span: not listed
    '- **#904 OPEN 2026-06-26 (x) — parked.** body | PARKED (re-trigger on telemetry)',          // (iv) PARKED: not a contradiction
    '- **#905 OPEN 2026-06-26 (x) — consistent.** body | OPEN (diagnosed, fix scoped)',            // (iv) OPEN: consistent
    '- **#906 OPEN 2026-06-26 (x) — reopened shape.** body | RESOLVED (old)',                     // (v) OPEN head + a later CLOSED head
    '### #906 ✅ CLOSED 2026-10-08 — closed in place',
    '- **#907 OPEN 2026-06-26 (x) — a cross-reference.** body | #386 RETRACTED its premise',      // C-6: a reference, not a state
    '- **#908 OPEN 2026-06-26 (x) — bold tail.** body | **DONE** (shipped)',                      // markup before the word
    '- **#909 OPEN 2026-06-26 (x) — own number.** body | #909 CLOSED 2026-10-08 (by a commit)',   // own number: its own state
  ].join('\n'));
  const tail = L.selfContradicting.filter((x) => x.leg === 'tail').map((x) => x.issue);
  ok('T1 an OPEN-headed entry ending `| RESOLVED (…)` is listed by the tail leg', tail.includes(901), tail.join());
  ok('T2 TWO tail hits in ONE parse are both listed (the stateful CONTRADICTS.test() trap would drop the second)', tail.includes(901) && tail.includes(902), tail.join());
  ok('T3 a ` | ` inside a code span is not a cell — #903 not listed', !tail.includes(903));
  ok('T3 control: the same tail without the code span IS read as RESOLVED', tailStatusWord('- **#903 OPEN x** see pre_audit | RESOLVED in the row') === 'RESOLVED');
  ok('T4 PARKED and OPEN tails are not contradictions — #904, #905 not listed', !tail.includes(904) && !tail.includes(905));
  ok('T5 an entry closed in place by a later head is not open, so not listed (C-1)', !L.openR1.has(906) && !tail.includes(906));
  ok('T6 a tail opening with an issue reference is not this entry\'s state — #907 not listed (C-6)', !tail.includes(907));
  ok('T6 control: without the `#386` the same cell reads RETRACTED', tailStatusWord('x | RETRACTED its premise') === 'RETRACTED');
  ok('T7 bold markup before the word still reads it — #908 listed', tail.includes(908), tail.join());
  ok('T8 the tail leg does not change open status: #901 stays in openR1', L.openR1.has(901));
  ok('T9 every row carries its leg', L.selfContradicting.every((x) => x.leg === 'tail' || x.leg === 'head'));
  ok('T10 no tail cell → ""', tailStatusWord('- **#1 OPEN x** no cell here') === '');
  ok('T12 a tail opening with the entry\'s OWN number is its own state — #909 listed (Langston Step-4 condition)', tail.includes(909), tail.join());
  ok('T12 control: the same cell with another number is not read', tailStatusWord('x | #386 CLOSED y', 909) === '' && tailStatusWord('x | #909 CLOSED y', 909) === 'CLOSED');
}
{
  // T11 the head leg is unchanged and labelled — its existing fixture shape still lists, now with leg 'head'.
  const pad = ' '.repeat(10);
  const L = parseLedger(['- **#348 — title RESOLVED, then** OPEN (dated).' + pad].join('\n'));
  const r = L.selfContradicting.find((x) => x.issue === 348);
  ok('T11 the head leg still lists #348, labelled leg=head', !!r && r.leg === 'head', JSON.stringify(r));
}

// ── B-AFTERLIVE-TOTAL-RULE (#1180): the after-live list re-counted by its own rule ───────────────────────────────
{
  const AL = (themeA, themeB, head, summary, extra = []) => [
    `**In the sprint (snapshot): 9** · **After live: ${summary}** (+1 moved)`,
    '',
    `## After live — ${head} after live (+1 moved to the sprint, +1 struck through, listed below)`,
    '',
    '> Counting rule: every `- ` line, less the lines marked ➡️ MOVED to the sprint and the struck lines.',   // D2: not a subtrahend
    '',
    `### Theme A — ${themeA} (+1 moved to the sprint)`,
    '- a1 (CC-A) — x',
    '- a2 (CC-A) — y',
    '- #9 (CC-B) — ➡️ MOVED to the sprint, row 9',
    `### Theme B — ${themeB} (+1 struck through)`,
    '- b1 (CC-A) — x',
    '- ~~b2 (CC-A)~~ — WITHDRAWN',
    ...extra,
    '',
    '## Next section',
    '- not counted',
  ].join('\n');
  const ok0 = recountAfterLive(AL(2, 1, 3, 3));
  ok('A1 a consistent file: al 0, headline 3 = rule 3 (the rule line containing ➡️ MOVED is not subtracted — D2)', ok0.al === 0 && ok0.headline.recount === 3, JSON.stringify(ok0.disagree));
  const t = recountAfterLive(AL(3, 1, 3, 3));
  ok('A2 a theme off by one is reported (positive control)', t.disagree.some((d) => d.stated === 3 && d.recount === 2), JSON.stringify(t.disagree));
  const h = recountAfterLive(AL(2, 1, 4, 3));
  ok('A3 the headline off by one is reported', h.disagree.some((d) => d.heading === 'After live (headline)' && d.stated === 4 && d.recount === 3));
  const s5 = recountAfterLive(AL(2, 1, 3, 7));
  ok('A4 the summary at the top off is reported', s5.disagree.some((d) => d.heading.startsWith('After live (summary') && d.stated === 7));
  ok('A5 the sum of the theme headings must equal the headline', recountAfterLive(AL(2, 2, 3, 3)).disagree.some((d) => d.heading === 'sum of the theme headings'));
  const both = recountAfterLive(AL(2, 1, 3, 3, ['- ~~b3 (CC-A) — ➡️ MOVED to the sprint~~']));
  ok('A6 a line both moved and struck is subtracted ONCE, listed, and raises al (D3)', both.bothMarked.length === 1 && both.headline.recount === 3 && both.al >= 1, JSON.stringify(both));
  const part = recountAfterLive(AL(2, 2, 4, 4, ['- b4 (CC-A) — a ~~partly struck~~ note']));
  ok('A7 a partial strike counts as live AND is shown (al raised)', part.partialStrikes.length === 1 && part.themes[1].recount === 2 && part.al === 1, JSON.stringify(part));
  const orphan = recountAfterLive(AL(2, 1, 3, 3).replace('> Counting rule', '- an orphan bullet (CC-A)\n> Counting rule'));
  ok('A8 a bullet before the first theme is an orphan: in no theme, raises al', orphan.orphans.length === 1 && orphan.al >= 1, JSON.stringify(orphan.orphans));
  const unp = recountAfterLive(AL(2, 1, 3, 3).replace('### Theme B — 1', '### Theme B — some'));
  ok('A9 an unparseable stated count is shown, never read as 0', unp.unparseable.length === 1 && unp.al >= 1);
  let threw = false; try { recountAfterLive('# no heading here'); } catch { threw = true; }
  ok('A10 no "## After live" heading refuses', threw);
}

console.log(`\nCensus rule tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
