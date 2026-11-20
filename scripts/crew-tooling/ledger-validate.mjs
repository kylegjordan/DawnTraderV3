#!/usr/bin/env node
// B-WORKFLOW-IMPROVE OBJ-1 (Q1) - check a batch traceability ledger against ledger-schema.json.
// DRAFT, non-blocking until the OBJ-9 pilot: nothing calls this as a gate yet.
// Usage:  node scripts/crew-tooling/ledger-validate.mjs <ledger.json>
//         node scripts/crew-tooling/ledger-validate.mjs --self-test
// Exit:   0 valid, 1 invalid (each defect printed with its code), 2 unreadable input or schema.
// Plain Node, no dependencies, so it runs the same from a Claude or a Codex session.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, 'ledger-schema.json');

function loadSchema() {
  try { return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')); }
  catch (e) { console.error(`UNREADABLE schema ${SCHEMA_PATH}: ${e.message}`); process.exit(2); }
}

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export function validate(ledger, S) {
  const defects = [];
  const add = (code, where, msg) => defects.push({ code, where, msg });
  if (typeof ledger !== 'object' || ledger === null || Array.isArray(ledger)) {
    add('not-an-object', '$', 'ledger must be a JSON object');
    return defects;
  }
  for (const f of S.top_level_required) {
    if (isBlank(ledger[f])) add(f === 'actor' || f === 'role' ? 'missing-actor' : 'missing-field', `$.${f}`, `required top-level field "${f}" is missing or empty`);
  }
  if (!isBlank(ledger.change_class) && !S.change_classes.includes(ledger.change_class)) add('bad-enum', '$.change_class', `"${ledger.change_class}" is not one of ${S.change_classes.join(' | ')}`);
  if (!isBlank(ledger.crew_mode) && !S.crew_modes.includes(ledger.crew_mode)) add('bad-enum', '$.crew_mode', `"${ledger.crew_mode}" is not one of ${S.crew_modes.join(' | ')}`);
  const objs = Array.isArray(ledger.objectives) ? ledger.objectives : [];
  const seen = new Set();
  objs.forEach((o, i) => {
    const w = `$.objectives[${i}]${o && o.id ? ` (${o.id})` : ''}`;
    if (typeof o !== 'object' || o === null) { add('not-an-object', w, 'objective must be an object'); return; }
    for (const f of S.objective_required) if (isBlank(o[f])) add(f === 'plan_item' ? 'missing-link' : 'missing-field', `${w}.${f}`, `required objective field "${f}" is missing or empty`);
    if (o.id) { if (seen.has(o.id)) add('duplicate-id', w, `objective id ${o.id} appears twice`); seen.add(o.id); }
    if (!isBlank(o.status) && !S.statuses.includes(o.status)) add('bad-enum', `${w}.status`, `"${o.status}" is not one of ${S.statuses.join(' | ')}`);
    (Array.isArray(o.readers) ? o.readers : []).forEach((r, k) => {
      for (const f of S.reader_required) if (isBlank(r?.[f])) add('missing-field', `${w}.readers[${k}].${f}`, `reader field "${f}" is missing (meaning, and missing/error/stale/concurrency behaviour, are all required)`);
    });
    for (const p of ['step7_proof', 'step8_challenge']) {
      if (o[p] === undefined) continue;
      for (const f of S.proof_required) if (isBlank(o[p]?.[f])) add(f === 'actor' ? 'missing-actor' : 'missing-field', `${w}.${p}.${f}`, `proof field "${f}" is missing`);
      if (!isBlank(o[p]?.result) && !S.proof_results.includes(o[p].result)) add('bad-enum', `${w}.${p}.result`, `"${o[p].result}" is not one of ${S.proof_results.join(' | ')}`);
    }
    if (o.status === 'done') {
      if (isBlank(o.diff)) add('missing-link', `${w}.diff`, 'status done but no diff is linked');
      if (o.step7_proof?.result !== 'pass') add('done-while-unproven', `${w}.step7_proof`, `status done but the Step-7 proof is ${o.step7_proof ? `"${o.step7_proof.result}"` : 'absent'} - use closed-unproven with its home instead`);
      if (o.step8_challenge?.result !== 'pass') add('done-while-unproven', `${w}.step8_challenge`, `status done but the Step-8 challenge is ${o.step8_challenge ? `"${o.step8_challenge.result}"` : 'absent'}`);
    }
    if (o.status === 'closed-unproven') {
      for (const f of S.unproven_required) if (isBlank(o.unproven?.[f])) add('missing-field', `${w}.unproven.${f}`, `closed-unproven needs "${f}" (workflow-09: owner, placed home, closing and failure condition)`);
    }
    if (o.status === 'withdrawn') {
      for (const f of S.withdrawn_required) if (isBlank(o[f])) add('missing-field', `${w}.${f}`, 'a withdrawal carries the citation that dissolves it');
    }
  });
  if (Array.isArray(ledger.objectives) && objs.length === 0) add('missing-field', '$.objectives', 'objectives is empty');
  // Langston Step-4 gate 2 fold-in: {} (or any non-array) used to pass with zero objectives checked.
  else if (ledger.objectives !== undefined && !Array.isArray(ledger.objectives)) add('bad-type', '$.objectives', 'objectives must be an array');
  return defects;
}

function sample() {
  const proof = (actor) => ({ actor, ref: 'abc1234', instrument: 'unit test at the ref', result: 'pass' });
  return {
    batch: 'B-SAMPLE', change_class: 'non_architecture', actor: 'PM Claude', role: 'implementer',
    crew_mode: 'CLAUDE', generation: 3, ref: 'abc1234', time: '2026-11-19T22:10:00Z',
    objectives: [
      { id: 'OBJ-1', intent: 'the checker rejects a broken ledger', components: ['crew tooling'], entry_points: ['CLI'],
        readers: [{ name: 'workflow-11 close-out', meaning: 'objective state', on_missing: 'refuse', on_error: 'refuse', on_stale: 'refuse', concurrency: 'single writer' }],
        plan_item: 'Q1', diff: [{ path: 'scripts/crew-tooling/ledger-validate.mjs', ref: 'abc1234' }],
        tests: [{ name: '--self-test', ref: 'abc1234', result: 'pass' }],
        step7_proof: proof('PM Claude'), step8_challenge: proof('Langston'), status: 'done' },
      { id: 'OBJ-2', intent: 'crew rollout', plan_item: 'Q2', status: 'closed-unproven',
        unproven: { owner: 'PM Claude', home: 'B-SAMPLE-2, after B-SAMPLE', closing_condition: 'each session reads the value', failure_condition: 'any session reads another value' } },
    ],
  };
}

function selfTest(S) {
  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  <- ${extra}` : ''}`); };
  const codes = (l) => validate(l, S).map((d) => d.code);
  const good = codes(sample());
  check('sample ledger is valid', good.length === 0, good.join(','));
  const seeded = [
    ['seeded missing link (done, no diff)', (l) => { delete l.objectives[0].diff; }, 'missing-link'],
    ['seeded missing link (no plan item)', (l) => { l.objectives[1].plan_item = ''; }, 'missing-link'],
    ['seeded missing actor (top level)', (l) => { delete l.actor; }, 'missing-actor'],
    ['seeded missing actor (Step-8 proof)', (l) => { delete l.objectives[0].step8_challenge.actor; }, 'missing-actor'],
    ['seeded done-while-unproven (Step-7 unproven)', (l) => { l.objectives[0].step7_proof.result = 'unproven'; }, 'done-while-unproven'],
    ['seeded done-while-unproven (no Step-8)', (l) => { delete l.objectives[0].step8_challenge; }, 'done-while-unproven'],
    ['closed-unproven without a home', (l) => { delete l.objectives[1].unproven.home; }, 'missing-field'],
    ['reader without stale behaviour', (l) => { delete l.objectives[0].readers[0].on_stale; }, 'missing-field'],
    ['objectives given as an object, not an array', (l) => { l.objectives = {}; }, 'bad-type'],
  ];
  for (const [name, mutate, want] of seeded) {
    const l = sample(); mutate(l);
    const got = codes(l);
    check(name, got.includes(want), `got [${got.join(',')}] want ${want}`);
  }
  console.log(`self-test: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

const S = loadSchema();
const arg = process.argv[2];
if (arg === '--self-test') selfTest(S);
else if (!arg) { console.error('usage: ledger-validate.mjs <ledger.json> | --self-test'); process.exit(2); }
else {
  let ledger;
  try { ledger = JSON.parse(readFileSync(arg, 'utf8')); }
  catch (e) { console.error(`UNREADABLE ledger ${arg}: ${e.message}`); process.exit(2); }
  const d = validate(ledger, S);
  for (const x of d) console.log(`  ${x.code.padEnd(20)} ${x.where}  ${x.msg}`);
  console.log(d.length ? `INVALID: ${d.length} defect(s) in ${arg}` : `VALID: ${arg} (${ledger.objectives.length} objectives)`);
  process.exit(d.length ? 1 : 0);
}
