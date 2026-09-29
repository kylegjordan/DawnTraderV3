#!/usr/bin/env node
// Derived sibling-coverage check (Langston, 2026-08-28).
// INVARIANT: every file that INSTRUCTS the fresh-context-reviewer mechanism must
// also carry the TERMINATION condition that governs it.
//
// The subject set is DERIVED FROM THE TREE BY PATH PATTERN, never a list of
// filenames. That is the whole point: a hardcoded four-name list passes green
// the day a fifth skill is added -- the same defect as a fence built from a
// literal list instead of Object.keys(). See B-PERPFEED.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// The MECHANISM marker is the reviewer's defining QUESTION, not any single
// phrasing of the instruction: the skills and the staged source word the
// instruction differently, so matching one wording silently excludes the other.
const MECHANISM   = 'what other states of the world are consistent';
const TERMINATION = 'it is a loop, not a one-shot';
// Langston 2026-08-28T07:15Z: the loop's TERMINATION CONDITION is an object round, not the heading.
// The heading alone passed while bug-investigation lacked his corrections (B-GOV-REPORTING r6).
const OBJECT_ROUND = 'termination requires an *object* round';

// Scope and completion documents QUOTE the mechanism while RECORDING a change to
// it. They are records, not instructions. Holding them to the invariant makes
// the check fire on correct work, which is how a check gets switched off.
const isInstruction = (f) =>
  /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f) ||
  /^1-system-manual\/_pending-skills\/.+\.md$/.test(f) ||
  // Langston 2026-08-28T07:38Z: the two always-loaded rule files are instruction files too.
  f === 'CLAUDE.md' || f === 'CONDUCT.md';

const tracked = execSync('git ls-files "*.md"', { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter(isInstruction);

const has = (f, s) => {
  try { return readFileSync(f, 'utf8').toLowerCase().includes(s); } catch { return false; }
};
const mech = tracked.filter((f) => has(f, MECHANISM));
const term = tracked.filter((f) => has(f, TERMINATION) && has(f, OBJECT_ROUND));
const missing = mech.filter((f) => !term.includes(f));
// Orphans are judged on EITHER marker (a reader found the AND weakened this: a loop heading with no mechanism went unreported).
const anyTerm = tracked.filter((f) => has(f, TERMINATION) || has(f, OBJECT_ROUND));
const orphan  = anyTerm.filter((f) => !mech.includes(f));

console.log(`instruction files: ${tracked.length}`);
console.log(`carrying mechanism: ${mech.length}`);
console.log(`carrying termination: ${term.length}`);

// POSITIVE CONTROL: the invariant is meaningless if the mechanism matched
// nothing. A tree-wide zero means the check broke, not that the tree is clean --
// silence is not evidence (#453).
if (mech.length === 0) {
  console.error('CONTROL FAILED: mechanism matched ZERO instruction files. The check is broken, not passing.');
  process.exit(2);
}
if (missing.length || orphan.length) {
  for (const f of missing) console.error(`  MISSING TERMINATION: ${f}`);
  for (const f of orphan)  console.error(`  TERMINATION WITHOUT MECHANISM: ${f}`);
  process.exit(1);
}
console.log('OK - every instruction file carrying the mechanism carries its termination condition.');
