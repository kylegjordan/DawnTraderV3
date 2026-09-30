// B-PLAN-CURRENCY-CHECK P39 — OFFLINE PREVIEW of the plan-state check (`gov-planline`). Performs NO alert IO and
// NO fetch. Answers, BEFORE the flip: "what would an ENABLED tick open at this ref?" — so the first live tick's
// open set can be PRE-REGISTERED and compared (P61). It calls the SAME pure function the tick calls
// (poller.mjs decidePlanLineTick → checker.mjs planRowsByBatch / checkPlanState), with the flag treated as ON,
// over the same two reads the tick makes (the plan and the Batch Completion listing, both at ONE sha).
//
//   node scripts/governance-checker/plan-lines-preview.mjs [--ref <ref>] [--plan-file <path>] [--listing-empty]
//   node scripts/governance-checker/plan-lines-preview.mjs --fixtures
//
// --ref          the ref to read at (default: GOV_REF, config.mjs); resolved ONCE to a sha and printed as ref=.
// --plan-file    read the plan from a local file instead (a fixture); the listing is still read at --ref.
// --listing-empty  inject an empty listing (what the reader returns on ANY ls-tree error) — run 3 (b″) on a real ref.
// --fixtures     run 3: the synthetic fixtures below, each with its expected output stated IN THIS FILE, before
//                any run (the #744 rider); prints `ok`/`BAD` per case and exits 1 on any BAD.
//
// Printed: the liveness line exactly as an enabled tick prints it; every graded leg with its verdict and reasons;
// the malformed rows; and the keys a FRESH enabled tick (no alert open, no na-skip) would open.
// NOT replicated (stated, as ledger-rows-preview.mjs does): the tick's fetch, the rulebook read and its na-skip
// rows (grep GOVERNANCE_EXCEPTIONS.md for `| na-skip | plan_line` before pre-registering), the dedupe cache (an
// already-open key is not re-added), SHADOW's info downgrade, and the orphan sweep.
//
// ── PRE-REGISTERED RUNS (stated before any run; P39 as ruled: §10d run 3, §10g, §10h (1), §10j 3(b)) ──────────────
// Run 1 — the live control, at the commit that adds this file (this branch; the C′ §5 header and P4/P12/P9's plan
// texts are all in the plan there). `--ref <that commit>`:
//   §4: B-WS-SUBSCRIBE-CLASS-FILTER (row 35), B-RTB-REFRESH-CONSOLIDATE (row 55), B-COST-MATH-CONSOLIDATION
//       (row 87) are graded and PASS (P4/P12 wrote a non-default status and the report into each row).
//   §5: B-XSTOCK-FEE-CONTRACT is graded and FAILS on its report cell (`—`: C′ added the column, nobody has linked
//       the report yet). B-FEED-MISMATCH-FIX and B-INSTRUMENTS-OVER-RULES: not graded (HYPOTHESIS: no
//       completion-named file for either at the ref).
//   malformed: none (P13a removed row 138a's stray cell).
//   liveness: graded=4 legs=4 fail=1 malformed=0 rows5=3 (rows4 and ids are not pre-registered: not derived
//   independently of this code).
//   A fresh enabled tick would open EXACTLY: gov-planline:B-XSTOCK-FEE-CONTRACT:s5.
//   Any other difference is a defect in the code or in this expectation, investigated before Step 4.
// Run 2 — the PASS branch. At the same ref it coincides with run 1's §4 half (P4/P12 have landed on this branch).
//   §10h (1): a live §5 PASS is unreachable by construction (a line that stays has a running window), so the §5
//   PASS branch is shown ONLY by the synthetic fixture in run 3 ("pass-s5"), never pre-registered as live.
// Run 3 — the FAILURE branches and three controls (pass-s4, status-only, report-only) plus the synthetic §5 PASS:
//   `--fixtures`, expected outputs in FIXTURES below. Each of
//   the two unreadable keys has its OWN expected line (§10j 3(b)): gov-planline-unreadable for (a′), (b), (b′) and
//   the lone §5 header edit; gov-planline-listing-empty for (b″).
// Run 3 (b″) on the real ref: `--ref <that commit> --listing-empty` ⇒ opens EXACTLY gov-planline-listing-empty;
//   zero per-leg intents; liveness `... FROZEN (Batch Completion listing empty)`.
// Run 3 (b‴) on a real ref: `--ref e7d0d0517` (the parent of the C′ commit d6255cf01 — the plan still carries the
//   3-cell §5 header while this code reads PLAN_LINE.s5Header's 4-cell one) ⇒ opens EXACTLY gov-planline-unreadable;
//   zero per-leg intents; liveness `... FROZEN (plan unreadable)`. This is why C′'s two edits share ONE commit.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { decidePlanLineTick } from './poller.mjs';
import { showFileAt, lsTreeNamesAt, REPO_ROOT } from './checker.mjs';
import { PLAN_LINE, DOCS, GOV_REF } from './config.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };

function report(t) {
  console.log(t.liveness);
  for (const l of t.legs || []) {
    console.log(`${l.fail ? 'FAIL' : 'pass'}  ${`${l.bid}:${l.leg}`.padEnd(40)} ${l.leg === 's4' ? `row ${l.rowNos.join(',')}` : '§5'} ` +
      `line ${l.lineNos.join(',')}${l.why.length ? `  (${l.why.join('+')})` : ''}  reports: ${l.reports.join(', ')}`);
  }
  const mal = t.join ? t.join.malformed : [];
  console.log(`malformed: ${mal.length ? mal.map((m) => `§${m.section} ${m.rowNo ?? '-'} line ${m.lineNo} ${m.cellCount} cells`).join('; ') : 'none'}`);
  const opens = t.toOpen.map((a) => a.dedupeKey);
  console.log(`A FRESH ENABLED TICK WOULD OPEN (${opens.length}): ${opens.join(' · ') || 'none'}`);
}

// ── run 3: synthetic fixtures, expected output stated before any run ─────────────────────────────────────────
const H4 = PLAN_LINE.s4Header, H5 = PLAN_LINE.s5Header;
const SEP4 = '|---|---|---|---|---|---|---|', SEP5 = '|---|---|---|---|';
const rep = (bid) => `${bid.replace(/-/g, '_')}_COMPLETION_REPORT.md`;
const LISTING = [rep('B-XX'), rep('B-YY'), rep('B-WW'), 'B_ZZ_PROGRESS_REPORT.md'];
const row = (no, bid, status, report) => `| ${no} | item ${no} | ${bid} | CC-A | ${status} | ${report} | note |`;
const plan = ({ waveB = H4, s5 = [H5, SEP5], s4a = [], s4b = [], s5rows = [] } = {}) => [
  '# Plan', '', '## 4. The plan', '', '### Wave A', '', H4, SEP4,
  row('35', 'B-XX', 'QUEUED', '—'), row('36', '#506 — batch named at Step 1', 'QUEUED', '—'), ...s4a,
  '', '### Wave B', '', waveB, SEP4, row('40', 'B-ZZ', 'QUEUED', '—'), ...s4b,
  '', '## 5. Running now — observation windows', '', ...s5,
  '| B-WW | CC-B | 2026-10-10 | — |', ...s5rows, '', '## 6. Who owns what', '',
].join('\n');
const FIXTURES = [
  { name: '(a) malformed row — an 8-cell numbered §4 row', planText: plan({ s4b: ['| 138a | Decide | B-YY | CC-C | DONE | — | SUPERSEDED: | stray |'] }),
    expect: { opens: ['gov-planline:B-XX:s4', 'gov-planline:B-WW:s5', 'gov-planline-malformed'], malformed: '§4 138a line 17 8 cells', noLegFor: 'B-YY',
      bodyHas: { 'gov-planline-malformed': ['138a', 'line 17', '8 cells'] } } },
  { name: "(a′) one §4 wave header with an extra column → UNREADABLE", planText: plan({ waveB: `${H4} extra |` }),
    expect: { opens: ['gov-planline-unreadable'], legs: 0, frozen: true } },
  { name: '(b) plan absent at the ref (reader returns null) → UNREADABLE', planText: null,
    expect: { opens: ['gov-planline-unreadable'], legs: 0, frozen: true } },
  { name: "(b′) plan empty → UNREADABLE", planText: '',
    expect: { opens: ['gov-planline-unreadable'], legs: 0, frozen: true } },
  { name: '(b‴) a lone §5 header edit (the pre-C′ header) → UNREADABLE', planText: plan({ s5: ['| item | owner | closes |', '|---|---|---|'] }),
    expect: { opens: ['gov-planline-unreadable'], legs: 0, frozen: true } },
  { name: '(b″) the Batch Completion listing empty → LISTING-EMPTY (its own key)', planText: plan(), listing: [],
    expect: { opens: ['gov-planline-listing-empty'], legs: 0, frozen: true } },
  { name: '(c) an id in two §4 rows → s4 FAIL ambiguous, naming both rows', planText: plan({ s4b: [row('41', 'B-XX', 'DONE', rep('B-XX'))] }),
    expect: { opens: ['gov-planline:B-XX:s4', 'gov-planline:B-WW:s5'], leg: ['B-XX:s4', 'FAIL', 'ambiguous'], bodyHas: { 'gov-planline:B-XX:s4': ['rows 35, 41'] } } },
  { name: "(c′) an id on two §5 lines → s5 FAIL ambiguous", planText: plan({ s5rows: ['| B-WW | CC-B | 2026-11-01 | — |'] }),
    expect: { opens: ['gov-planline:B-XX:s4', 'gov-planline:B-WW:s5'], leg: ['B-WW:s5', 'FAIL', 'ambiguous'] } },
  { name: 'pass-s4 — row 35 DONE with its report named → PASS', planText: plan().replace(row('35', 'B-XX', 'QUEUED', '—'), row('35', 'B-XX', 'DONE — x', rep('B-XX'))),
    expect: { opens: ['gov-planline:B-WW:s5'], leg: ['B-XX:s4', 'pass', ''] } },
  { name: 'status-only — row 35 QUEUED with its report named → FAIL on the status test only', planText: plan().replace(row('35', 'B-XX', 'QUEUED', '—'), row('35', 'B-XX', 'QUEUED', rep('B-XX'))),
    expect: { opens: ['gov-planline:B-XX:s4', 'gov-planline:B-WW:s5'], leg: ['B-XX:s4', 'FAIL', 'status'] } },
  { name: 'report-only — row 35 DONE with report `—` → FAIL on the report test only', planText: plan().replace(row('35', 'B-XX', 'QUEUED', '—'), row('35', 'B-XX', 'DONE — x', '—')),
    expect: { opens: ['gov-planline:B-XX:s4', 'gov-planline:B-WW:s5'], leg: ['B-XX:s4', 'FAIL', 'report'] } },
  { name: 'pass-s5 — the SYNTHETIC §5 PASS fixture (§10h: never a live observation)', planText: plan().replace('| B-WW | CC-B | 2026-10-10 | — |', `| B-WW | CC-B | 2026-10-10 | \`Batch Completion/${rep('B-WW')}\` |`),
    expect: { opens: ['gov-planline:B-XX:s4'], leg: ['B-WW:s5', 'pass', ''] } },
];

function runFixtures() {
  let bad = 0;
  const sha = '0'.repeat(40);
  for (const f of FIXTURES) {
    const t = decidePlanLineTick({ enabled: true, refSha: sha, planText: f.planText, names: f.listing ?? LISTING, shadow: false });
    const e = f.expect, problems = [];
    const opens = t.toOpen.map((a) => a.dedupeKey).sort();
    if (opens.join() !== [...e.opens].sort().join()) problems.push(`opens ${JSON.stringify(opens)} ≠ ${JSON.stringify([...e.opens].sort())}`);
    if (e.legs !== undefined && (t.legs || []).length !== e.legs) problems.push(`legs ${(t.legs || []).length} ≠ ${e.legs}`);
    if (e.frozen) {
      if (!/ FROZEN \(/.test(t.liveness || '')) problems.push(`liveness not FROZEN: ${t.liveness}`);
      if (t.toResolveKeys.some((k) => k.startsWith('gov-planline:'))) problems.push('a per-leg key would be resolved on a frozen tick');
      if (t.verifyPlanLine('B-XX', 's4') !== false) problems.push('the orphan verifier does not keep an open per-leg key');
    }
    if (e.malformed) {
      const mal = (t.join?.malformed || []).map((m) => `§${m.section} ${m.rowNo ?? '-'} line ${m.lineNo} ${m.cellCount} cells`).join('; ');
      if (mal !== e.malformed) problems.push(`malformed "${mal}" ≠ "${e.malformed}"`);
    }
    if (e.noLegFor && (t.legs || []).some((l) => l.bid === e.noLegFor)) problems.push(`a leg exists for ${e.noLegFor}`);
    if (e.leg) {
      const [key, verdict, why] = e.leg;
      const l = (t.legs || []).find((x) => `${x.bid}:${x.leg}` === key);
      const got = l ? [l.fail ? 'FAIL' : 'pass', l.why.join('+')] : null;
      if (!got || got[0] !== verdict || got[1] !== why) problems.push(`${key} ${JSON.stringify(got)} ≠ ${JSON.stringify([verdict, why])}`);
    }
    for (const [key, parts] of Object.entries(e.bodyHas || {})) {
      const body = t.toOpen.find((a) => a.dedupeKey === key)?.body || '';
      for (const p of parts) if (!body.includes(p)) problems.push(`${key} body lacks "${p}"`);
    }
    console.log(`${problems.length ? 'BAD' : 'ok '} ${f.name}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`);
    if (problems.length) bad++;
  }
  console.log(`\nrun 3 fixtures: ${FIXTURES.length - bad} ok, ${bad} BAD`);
  process.exit(bad ? 1 : 0);
}

if (args.includes('--fixtures')) runFixtures();
else {
  const ref = opt('--ref') || GOV_REF;
  // ONE resolution, no fetch: both reads below are made at this sha, and it is printed as ref=.
  const sha = String(execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: REPO_ROOT, encoding: 'utf8' })).trim();
  const planFile = opt('--plan-file');
  const planText = planFile ? readFileSync(planFile, 'utf8') : showFileAt(sha, PLAN_LINE.path);
  const names = args.includes('--listing-empty') ? [] : lsTreeNamesAt(sha, DOCS.completion_report.dir);
  console.log(`ref ${ref} @ ${sha} · plan ${planFile ? `from file ${planFile}` : PLAN_LINE.path} · listing ${names.length} entries` +
    ` · PLAN_LINE.enabled in source: ${PLAN_LINE.enabled} (treated as ON here)\n`);
  report(decidePlanLineTick({ enabled: true, refSha: sha, planText, names, shadow: false }));
}
