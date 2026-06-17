// B-GOV governance-checker — backtest / calibration GATE (Obj-11).
// Replays the deterministic detector over recent batches from git history and asserts:
//   A) it does NOT false-alarm on known-good clean closes;
//   B) it correctly FLAGS B3b's known missing pre-audit (the headline motivating gap);
//   C) the emptiness detector flags a hollow doc and clears a substantial one.
// If any assertion fails, the checker is NOT ready to ship. Run: node scripts/governance-checker/backtest.mjs

import {
  recentBatchIds, docPresent, preAuditStructure, netContentLines, isHollowFile, REPO_ROOT,
} from './checker.mjs';

// Per-batch file docs that reliably carry the batch-id in their name/entry (backtest-verifiable).
const CHECK_DOCS = ['scope', 'pre_audit', 'completion_report', 'batch_catalog', 'phase_history'];
const MARK = (b) => (b ? '✓' : '·');

const bids = recentBatchIds(200);
console.log(`B-GOV backtest — ${bids.length} distinct batch-ids over last 200 commits\n`);
console.log(`${'batch'.padEnd(14)}${CHECK_DOCS.map((d) => d.slice(0, 9).padStart(10)).join('')}   pre-audit`);

const rows = [];
for (const bid of bids.slice(0, 20)) {
  const present = {};
  for (const d of CHECK_DOCS) present[d] = docPresent(bid, d);
  const pa = preAuditStructure(bid);
  rows.push({ bid, present, pa });
  const paNote = pa.filed
    ? `filed cites[SIM:${pa.citesSim ? 'y' : 'n'} Man:${pa.citesManual ? 'y' : 'n'}] file:line×${pa.fileLineCitations}`
    : 'NOT FILED';
  console.log(`${bid.padEnd(14)}${CHECK_DOCS.map((d) => MARK(present[d]).padStart(10)).join('')}   ${paNote}`);
}

// ── GATE ASSERTIONS ───────────────────────────────────────────────────────────
const results = [];
function assert(name, cond, detail) { results.push({ name, pass: !!cond, detail }); }

// A) No false alarm on a known-good clean close (P19-B6 was a full, properly-closed batch).
const good = rows.find((r) => r.bid === 'P19-B6');
assert('A: known-good P19-B6 has scope+completion+catalog present (no false alarm)',
  good && good.present.scope && good.present.completion_report && good.present.batch_catalog,
  good ? JSON.stringify(good.present) : 'P19-B6 not found in window');

// B) Catches B3b's known missing pre-audit (filed under its own name = false).
const b3b = preAuditStructure('P19-B3b');
assert('B: P19-B3b pre-audit correctly detected as NOT FILED (the known gap)',
  b3b.filed === false,
  b3b.filed ? `unexpectedly found ${b3b.path}` : 'no P19-B3b pre-audit file — gap caught');

// C) Emptiness detector: flags hollow, clears substantial.
const hollowSample = '# Title\n\n## TOC\n- [x](#x)\n\n2026-06-17\n\n---\n';
const hollowFlagged = netContentLines(hollowSample).length <= 3;
const manualSubstantial = !isHollowFile('1-system-manual/SYSTEM_MANUAL.md');
assert('C: emptiness detector flags a hollow doc AND clears a substantial real doc',
  hollowFlagged && manualSubstantial,
  `hollow→${hollowFlagged ? 'flagged' : 'MISSED'}, SYSTEM_MANUAL→${manualSubstantial ? 'substantial' : 'WRONGLY-HOLLOW'}`);

console.log('\n── GATE ──');
let allPass = true;
for (const r of results) {
  console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}\n         ${r.detail}`);
  if (!r.pass) allPass = false;
}
console.log(`\nOBJ-11 GATE: ${allPass ? 'PASS — detector validated on real history' : 'FAIL — not ready to ship'}`);
process.exit(allPass ? 0 : 1);
