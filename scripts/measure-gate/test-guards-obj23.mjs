#!/usr/bin/env node
// OFFLINE proof for guard-stale-fetch.mjs (OBJ-2) and guard-ci-cited.mjs (OBJ-3), before either
// is wired. #761's rule: prove it offline on real inputs first.
// Mutation arms per the standing convention (arm-wears-the-gap's-name): each arm that pins a
// behaviour ships with the mutation that would change it, and that mutation must fail the suite.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const FETCH_GUARD = process.env.GUARD2_UNDER_TEST || join(ROOT, '.claude', 'hooks', 'guard-stale-fetch.mjs');
const CI_GUARD = process.env.GUARD3_UNDER_TEST || join(ROOT, '.claude', 'hooks', 'guard-ci-cited.mjs');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? '  <- ' + d : ''))); };

function run(hook, command, projectDir) {
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8',
    env: { ...process.env, GUARD_SYNTHETIC: '1', CLAUDE_PROJECT_DIR: projectDir || ROOT },
  });
  let ctx = null;
  try {
    const j = r.stdout.trim() ? JSON.parse(r.stdout) : null;
    ctx = j && j.hookSpecificOutput ? j.hookSpecificOutput.additionalContext : null;
  } catch { ctx = 'UNPARSEABLE'; }
  return { status: r.status, ctx };
}

/** A scratch "repo" whose FETCH_HEAD mtime we control exactly. */
function repoWithFetchAge(minutes) {
  const dir = mkdtempSync(join(tmpdir(), 'fetchage-'));
  mkdirSync(join(dir, '.git'), { recursive: true });
  if (minutes !== null) {
    const p = join(dir, '.git', 'FETCH_HEAD');
    writeFileSync(p, 'x');
    const t = new Date(Date.now() - minutes * 60000);
    utimesSync(p, t, t);
  }
  return dir;
}

console.log('=== OBJ-2 guard-stale-fetch ===');
{
  const r = run(FETCH_GUARD, 'git commit -F m.txt -- a.md', repoWithFetchAge(120));
  check('stale fetch (120min) fires on git commit', !!r.ctx && /STALE-FETCH/.test(r.ctx));
}
{
  const r = run(FETCH_GUARD, 'git push origin migration/aws-supabase', repoWithFetchAge(45));
  check('stale fetch (45min) fires on git push', !!r.ctx);
}
{
  const r = run(FETCH_GUARD, 'git commit -F m.txt -- a.md', repoWithFetchAge(5));
  check('fresh fetch (5min) is silent', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 60));
}
{
  const r = run(FETCH_GUARD, 'git commit -F m.txt -- a.md', repoWithFetchAge(null));
  check('NEVER fetched WARNS (the case the rule exists for)', !!r.ctx && /NEVER been fetched/.test(r.ctx));
}
{
  const r = run(FETCH_GUARD, 'git fetch origin && git commit -F m.txt -- a.md', repoWithFetchAge(120));
  check('a command doing the fetch itself is silent', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 60));
}
{
  const r = run(FETCH_GUARD, 'git status --porcelain', repoWithFetchAge(999));
  check('non-gated git commands are silent', r.ctx === null);
}
{
  const r = run(FETCH_GUARD, 'git commit -F m.txt -- a.md', repoWithFetchAge(120));
  check('it NEVER blocks: exit 0 even when firing', r.status === 0, 'exit=' + r.status);
}

console.log('\n=== OBJ-3 guard-ci-cited ===');
const scratch = mkdtempSync(join(tmpdir(), 'cimsg-'));
const withRun = join(scratch, 'with.txt');
const without = join(scratch, 'without.txt');
writeFileSync(withRun, 'B-X close.\nCI all 4 green, run 26730239909.\n');
writeFileSync(without, 'B-X close.\nCI is green, trust me.\n');
{
  const r = run(CI_GUARD, `git commit -F ${without} -- "Claude Comms and Packages/Batch Completion/B_X_COMPLETION_REPORT.md"`);
  check('completion-report commit WITHOUT a run id warns', !!r.ctx && /CI-CITATION/.test(r.ctx));
}
{
  const r = run(CI_GUARD, `git commit -F ${withRun} -- "Claude Comms and Packages/Batch Completion/B_X_COMPLETION_REPORT.md"`);
  check('WITH a cited run id, silent', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 60));
}
{
  const r = run(CI_GUARD, 'git commit -F m.txt -- server/index.ts');
  check('a non-completion-report commit is silent', r.ctx === null);
}
{
  const r = run(CI_GUARD, `git commit -m "close without citation" -- reports/B_Y_COMPLETION_REPORT.md`);
  check('inline -m without a run id warns', !!r.ctx);
}
{
  const r = run(CI_GUARD, `git commit -F /nonexistent/path.txt -- docs/B_Z_COMPLETION_REPORT.md`);
  check('unreadable msgfile WARNS (cannot verify is not verified)', !!r.ctx && /could not be read/.test(r.ctx));
}
{
  const r = run(CI_GUARD, `git commit -F ${without} -- reports/B_X_COMPLETION_REPORT.md`);
  check('it NEVER blocks: exit 0 even when firing', r.status === 0, 'exit=' + r.status);
}

// Mutation arms — the convention: each patches a copy, re-runs this suite, requires FAILURE.
if (!process.env.GUARD2_UNDER_TEST && !process.env.GUARD3_UNDER_TEST) {
  console.log('\n=== MUTATION ARMS ===');
  const dir = mkdtempSync(join(tmpdir(), 'mut23-'));
  const MUTS = [
    ['obj2: make it block (exit 2)', FETCH_GUARD, 'GUARD2_UNDER_TEST',
      (s) => s.replace(/process\.exit\(0\);\s*$/, 'process.exit(2);')],
    ['obj2: silence the never-fetched case', FETCH_GUARD, 'GUARD2_UNDER_TEST',
      (s) => s.replace("ageMin = Infinity; // never fetched — the exact case the rule exists for", 'return;')],
    ['obj3: drop the msgfile read (message never checked)', CI_GUARD, 'GUARD3_UNDER_TEST',
      (s) => s.replace("try { msg = readFileSync(p, 'utf8'); msgSource = 'msgfile'; }", "try { msg = '99999999999'; msgSource = 'msgfile'; }")],
    ['obj3: make it block (exit 2)', CI_GUARD, 'GUARD3_UNDER_TEST',
      (s) => s.replace(/process\.exit\(0\);\s*$/, 'process.exit(2);')],
  ];
  let mi = 0;
  for (const [name, target, envKey, mut] of MUTS) {
    const src = readFileSync(target, 'utf8');
    const mutated = mut(src);
    if (mutated === src) { check('mutation applies: ' + name, false, 'patch did not change the source'); continue; }
    const p = join(dir, 'm' + (mi++) + '.mjs');
    writeFileSync(p, mutated);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      encoding: 'utf8', env: { ...process.env, [envKey]: p },
    });
    check('"' + name + '" makes the suite FAIL', r.status !== 0, 'mutated suite exited ' + r.status);
  }
}

console.log('\n' + '='.repeat(58));
console.log('  PASS ' + pass + '   FAIL ' + fail);
process.exit(fail ? 1 : 0);
