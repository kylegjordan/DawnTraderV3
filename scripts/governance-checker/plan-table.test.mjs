// The sprint plan's pre-sprint table and §4 rows — the live-plan checks the weekly census depends on.
// Re-homed from status-board.test.mjs when the phone status board was retired (B-STATUS-BOARD OBJ-10, Kyle KD-35;
// Langston r7 CHANGE-1, r8 BLOCKER): the subjects — mapStatus / STATUS_PREFIXES, presprintRows, the one-copy rule,
// the row pointers — SURVIVE, because census.mjs reads them; only the board's own legs died with it.
// Run: node scripts/governance-checker/plan-table.test.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { presprintRows, planRowsByBatch, mapStatus } from './checker.mjs';
import { PLAN_LINE } from './config.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL: ${name} ${extra}`); } };
const deMarkCell = (c) => String(c).replace(/[*`]/g, '').trim();
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every §4 row number in the plan text: rows with a batch id AND rows without one (both are real §4 rows). */
function s4RowNos(text) {
  const p = planRowsByBatch(text);
  const nos = new Set();
  for (const [, v] of p.rows) for (const r of v.s4) nos.add(String(r.rowNo));
  for (const r of p.unparsed || []) if (r.section === 4 && r.rowNo != null) nos.add(String(r.rowNo));
  return nos;
}
/** Pre-sprint items whose `plan row` pointer names no §4 row (the census would skip them silently, census.mjs `if (!r.rowBacked)`). */
function unresolvedPointers(text) {
  const nos = s4RowNos(text);
  return presprintRows(text).items.filter((i) => i.planRow && !nos.has(String(i.planRow))).map((i) => `${i.item}: ${i.planRow}`);
}

// ── FIXTURE legs: the pointer check must be able to FAIL, and must not mis-read suffixed row ids ──────────────────
const fixture = (pointer) => [
  '# plan',
  '## 0a. Pre-sprint',
  PLAN_LINE.s0aHeader,
  '|---|---|---|---|---|---|---|---|---|',
  `| 2 — exit | 1 | B-FIX-ONE | CC-C (Analyst Claude) | ${pointer} | | Kyle 2026-10-07 | row | nothing |`,
  '| 2 — exit | 2 | B-FIX-TWO | CC-A (Old Claude) | 183b | | Kyle 2026-10-07 | row | nothing |',
  '## 4. The plan',
  '### Wave 0 — NOW — urgent',
  '| # | item | batch / reference | owner | status | report | note |',
  '|---:|---|---|---|---|---|---|',
  '| 2a0 | a suffixed row | B-FIX-ONE | CC-C (Analyst Claude) | QUEUED | — | — |',
  '| 183b | another suffixed row | B-FIX-TWO | CC-A (Old Claude) | QUEUED | — | — |',
  '## 5. Running now', '| item | owner | closes | report |', '|---|---|---|---|',
].join('\n');
const green = unresolvedPointers(fixture('2a0'));
ok('PT-F1 GREEN: suffixed pointers 2a0 and 183b resolve to their §4 rows', green.length === 0, JSON.stringify(green));
const red = unresolvedPointers(fixture('77'));
ok('PT-F2 RED: a pointer to a row that does not exist is caught', red.length === 1 && red[0].startsWith('B-FIX-ONE'), JSON.stringify(red));

// ── THE LIVE PLAN ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const live = readFileSync(resolve(REPO, PLAN_LINE.path), 'utf8');
  const s4 = []; for (const [, v] of planRowsByBatch(live).rows) for (const r of v.s4) s4.push(r);
  const unmappedS4 = s4.filter((r) => mapStatus(r.status).state === 'unrecognised').map((r) => `${r.rowNo}: ${r.status.slice(0, 40)}`);
  ok('LIVE1 every §4 row with an id maps to a state', unmappedS4.length === 0, JSON.stringify(unmappedS4));
  let pre; try { pre = presprintRows(live); } catch (e) { pre = null; ok('LIVE0 the live plan carries the pre-sprint table', false, String(e.message).slice(0, 120)); }
  if (pre) {
    const unmappedPre = pre.items.filter((i) => i.status.trim().toLowerCase() !== 'row' && mapStatus(i.status).state === 'unrecognised').map((i) => `${i.item}: ${i.status}`);
    ok('LIVE2 every pre-sprint status maps to a state', unmappedPre.length === 0, JSON.stringify(unmappedPre));
    ok('LIVE4 the live pre-sprint table has no one-copy conflict and no unreadable row', pre.conflicts.length === 0 && pre.malformed.length === 0,
      JSON.stringify({ conflicts: pre.conflicts, malformed: pre.malformed }));
    const unresolved = unresolvedPointers(live);
    ok('LIVE6 every pre-sprint plan-row pointer resolves to a §4 row (the census skips row-backed items, so a dangling one would vanish)', unresolved.length === 0, JSON.stringify(unresolved));
    const so = new Map(); for (const i of pre.items) { const k = `${deMarkCell(i.stage)}|${deMarkCell(i.order)}`; so.set(k, (so.get(k) || 0) + 1); }
    const dupes = [...so].filter(([, n]) => n > 1).map(([k]) => k);
    ok('LIVE7 stage + order is unique in the pre-sprint table', dupes.length === 0, JSON.stringify(dupes));
  }
}

console.log(`\nPlan table tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
