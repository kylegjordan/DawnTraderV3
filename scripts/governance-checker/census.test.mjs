// B-PLAN-CURRENCY-CHECK P43 / P45 / P46 — the census and mistake-pass RULES on pinned fixture text (no git, no
// network, no filesystem). Each list has a positive and a negative control; the ruled fixtures of the Group-2 spec
// §1 (R1 widened, the self-contradicting sub-list, R2 + OWNER with `#696` excluded, R3-Q6's negatives) are here.
// Run: node scripts/governance-checker/census.test.mjs
import {
  statusWord, parseLedger, datedHomes, parsePlan, parseAfterLive, parseRoadmap, placement, cellClosed, listD, listE,
  listF, listA, planLines, recountS6, s6AlertDecision, runCensus, censusCounts, censusLists, censusMetadata, censusAlert,
  tallyMistakes, mistakePassAlert, ownerOfIssue, idsIn, hasId, headStatement, DATED_EXCLUSIONS, TITLE_MAX, gitReaders,
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
  ].join('\n'));
  const c = datedHomes(L);
  ok('R2 #738 upper-case `DUE` on a HOME line is found', c.issues.includes(738));
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
  names: () => over.names ?? ['B_BETA_COMPLETION_REPORT.md'],
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
      byWhy: { U1: 9999, U2: 9999, U3: 9999, U4: 9999, U5: 9999, U6: 9999 }, selfContradicting: big(999, (i) => ({ issue: i })), reused: big(999, (i) => i) },
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

console.log(`\nCensus rule tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
