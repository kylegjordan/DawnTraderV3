#!/usr/bin/env node
// OFFLINE proof for hook-selftest.mjs — Langston's OBJ-5 verification, in his words:
// "DISABLE ONE HOOK DELIBERATELY → THE SELF-TEST NAMES IT."
//
// ⛔ RUN AGAINST SCRATCH FIXTURES, NEVER THE LIVE CLONES. Deliberately disabling a real hook to
// prove a detector works is testing in production, which is #761's lesson at a cost of four
// minutes of dead comms. Each arm builds a throwaway directory shaped like a clone.
//
// THREE WAYS A HOOK CAN BE DEAD, and they are NOT the same failure — a detector that catches one
// and is silent on the others would read as covered:
//   A. registered in settings, FILE MISSING         -> "REGISTERED BUT MISSING"
//   B. file present, NOT registered                 -> "present but NOT REGISTERED"  (the July probe)
//   C. registered and present but content STALE     -> "stale vs origin"
// ★ ARM B IS THE ONE THAT MATTERS MOST HISTORICALLY: the warn-delivery probe sat present and
// unregistered for 24 days while a governance document recorded it as armed and waiting.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const SELFTEST = join(ROOT, 'scripts', 'measure-gate', 'hook-selftest.mjs');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? '  <- ' + d : ''))); };

/** A throwaway directory shaped like a clone; `mutate(settings, hooksDir)` breaks one thing. */
function fixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'selftest-'));
  mkdirSync(join(dir, '.git'), { recursive: true });
  const hooks = join(dir, '.claude', 'hooks');
  mkdirSync(hooks, { recursive: true });
  for (const f of readdirSync(join(ROOT, '.claude', 'hooks'))) {
    copyFileSync(join(ROOT, '.claude', 'hooks', f), join(hooks, f));
  }
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.local.json'), 'utf8'));
  mutate(settings, hooks);
  writeFileSync(join(dir, '.claude', 'settings.local.json'), JSON.stringify(settings, null, 2));
  return dir;
}

function runSelftest(dir) {
  try {
    return execFileSync(process.execPath, [SELFTEST], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, SELFTEST_CLONES: dir },
    });
  } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); }
}

console.log('=== OBJ-5 SELF-TEST PROOF — three ways a hook can be dead ===');
console.log('  NOTE: each fixture has a placeholder .git, so git prints "not a git repository"');
console.log('  once per arm and the self-test reports HEAD as ?. That noise is EXPECTED and is');
console.log('  NOT suppressed — hiding a git error to tidy output is how a real failure gets');
console.log('  hidden with it (rule 22). The arms judge the VERDICT text, not HEAD.');

// A. registered, file deleted.
{
  const dir = fixture((_s, hooks) => {
    try { execFileSync(process.platform === 'win32' ? 'cmd' : 'rm',
      process.platform === 'win32' ? ['/c', 'del', join(hooks, 'guard-bare-commit.mjs')] : ['-f', join(hooks, 'guard-bare-commit.mjs')]); }
    catch { /* fall through — the assertion below is what judges it */ }
  });
  const out = runSelftest(dir);
  check('A registered-but-MISSING is named', /guard-bare-commit\.mjs REGISTERED BUT MISSING/.test(out),
        'verdict did not name it');
}

// B. file present, removed from settings — the July probe's actual state.
{
  const dir = fixture((s) => {
    for (const blocks of Object.values(s.hooks || {})) {
      for (const b of blocks) b.hooks = (b.hooks || []).filter((h) => !/guard-governed-read\.mjs/.test(h.command || ''));
    }
  });
  const out = runSelftest(dir);
  check('B present-but-NOT-REGISTERED is named', /guard-governed-read\.mjs present but NOT REGISTERED/.test(out),
        'verdict did not name it — this is the state the July probe sat in for 24 days');
}

// C. registered and present, content altered.
{
  const dir = fixture((_s, hooks) => {
    const p = join(hooks, 'session-reminder.mjs');
    writeFileSync(p, readFileSync(p, 'utf8') + '\n// drift\n');
  });
  const out = runSelftest(dir);
  check('C stale-vs-origin is named', /session-reminder\.mjs stale vs origin/.test(out), 'verdict did not name it');
}

// D. THE CONTROL. An unmutated fixture must report NO problems — otherwise A/B/C prove nothing,
// because a detector that always complains names the disabled hook by accident.
{
  const dir = fixture(() => {});
  const out = runSelftest(dir);
  const clean = /no problems detected/.test(out);
  check('D CONTROL: an untouched fixture reports NO problems', clean,
        'it complains about a healthy clone, so A/B/C are not evidence');
  check('D2 ...and still prints that its silence is non-evidential', /silence is non-evidential/.test(out));
}

console.log('\n' + '='.repeat(58));
console.log('  PASS ' + pass + '   FAIL ' + fail);
process.exit(fail ? 1 : 0);
