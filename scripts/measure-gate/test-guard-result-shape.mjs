#!/usr/bin/env node
// OFFLINE proof for guard-result-shape.mjs (OBJ-6c) before it is wired (#761's rule). Payloads
// use the OBSERVED PostToolUse shape (observe-posttooluse.mjs, 2026-09-02): tool_response =
// { stdout, stderr, interrupted } — no exit code exists on the wire, so none is passed.
// Its bar: FIRES ON THE SHAPE, SILENT ON THE CONTROL. Every positive arm has a paired control
// that differs in the ONE property the leg keys on; the mutation arms (arm-wears-the-gap's-name)
// each remove one leg's discriminator and must fail the suite.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const GUARD = process.env.GUARD6C_UNDER_TEST || join(ROOT, '.claude', 'hooks', 'guard-result-shape.mjs');
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (d ? '  <- ' + d : ''))); };

function run(command, stdout, stderr = '', extra = {}) {
  const r = spawnSync(process.execPath, [GUARD], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, tool_response: { stdout, stderr, interrupted: false, ...extra } }),
    encoding: 'utf8', env: { ...process.env, GUARD_SYNTHETIC: '1' },
  });
  let ctx = null;
  try { const j = r.stdout.trim() ? JSON.parse(r.stdout) : null; ctx = j && j.hookSpecificOutput ? j.hookSpecificOutput.additionalContext : null; }
  catch { ctx = 'UNPARSEABLE'; }
  return { status: r.status, ctx, raw: r.stdout };
}
const lines = (n, p = 'row') => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`).join('\n') + '\n';

console.log('=== cap-bound (instance 3: the cap did the filtering) ===');
check('git log -20 returning exactly 20 lines FIRES', /cap-bound/.test(run('git log --oneline -20 --grep=MISTAKE', lines(20)).ctx || ''));
check('git log -20 returning 7 lines is SILENT (the query bounded it)', run('git log --oneline -20 --grep=MISTAKE', lines(7)).ctx === null);
check('head -50 returning 50 lines FIRES', /cap-bound/.test(run('grep -n foo x.log | head -50', lines(50)).ctx || ''));
check('head -1 returning 1 line is SILENT (floor: a cap of 1 always equals its output)', run('git log -1 --format=%H', 'abc123\n').ctx === null);
check('LIMIT 100 returning 100 rows FIRES', /cap-bound/.test(run('psql -c "select id from trades where closed_at > now() - interval \'30 days\' LIMIT 100"', lines(100)).ctx || ''));
check('a heredoc MENTIONING head -50 with 50 lines of unrelated output is SILENT', run("cat > /tmp/n.txt <<'EOF'\nreminder: never trust head -50 as a population\nEOF\ncat /tmp/list.txt", lines(50)).ctx === null,
      'fired: ' + String(run("cat > /tmp/n.txt <<'EOF'\nreminder: never trust head -50 as a population\nEOF\ncat /tmp/list.txt", lines(50)).ctx).slice(0, 60));

console.log('\n=== error-consumed (#732/#980 shape: an error swallowed then counted) ===');
check('git show ref:path | wc -l with fatal on stderr and "0" on stdout FIRES', /error-consumed/.test(run('git show origin/x:1-system-manual/FOO.md | wc -l', '0\n', "fatal: path '1-system-manual/FOO.md' does not exist in 'origin/x'\n").ctx || ''));
check('the same fatal with NO consumer and NO number is SILENT (the session can see the error)', run('git show origin/x:1-system-manual/FOO.md', '', "fatal: path '1-system-manual/FOO.md' does not exist in 'origin/x'\n").ctx === null);
check('a Traceback on stderr with a bare count on stdout FIRES', /error-consumed/.test(run('curl -s http://localhost:5000/api/trades/closed | python3 -c "import json,sys; print(len(json.load(sys.stdin)))"', '0\n', 'Traceback (most recent call last):\n  File "<string>", line 1\njson.decoder.JSONDecodeError: Expecting value\n').ctx || ''));
check('a clean count with empty stderr is SILENT (never fire on a value)', run('psql -c "select count(*) from trades"', '0\n').ctx === null);
check('an empty stdout with empty stderr is SILENT (never fire on a value)', run('grep -c breach /var/log/x.log', '').ctx === null);

console.log('\n=== html-not-json (instance 8: a page read as data) ===');
check('curl to /api/ returning an HTML document FIRES', /html-not-json/.test(run('curl -s http://188.245.193.8/api/vts/filter-diagnostics | head -c 400', '<!DOCTYPE html>\n<html><head><title>Sign in</title></head><body>…</body></html>\n').ctx || ''));
check('curl to /api/ returning JSON is SILENT', run('curl -s http://188.245.193.8/api/vts/filter-diagnostics | head -c 400', '{"ok":true,"rows":[]}\n').ctx === null);
check('curl to a NON-api page returning HTML is SILENT (HTML was the request)', run('curl -s https://docs.claude.com/en/hooks | head -c 400', '<!DOCTYPE html><html><title>Hooks</title></html>\n').ctx === null);

console.log('\n=== other-document (Langston live: the wrong file answered with HTTP 200) ===');
const RAW = 'curl -s https://raw.githubusercontent.com/kylegjordan/DawnTraderV3/abc123/Claude%20Comms%20and%20Packages/Scope%20Files/B_MEASURE_GATE_LEG2_SCOPE.md | head -40';
check('path asks for B_MEASURE_GATE, H1 says B-GOV-HYGIENE-ANALYST-1 → FIRES', /other-document/.test(run(RAW, '# B-GOV-HYGIENE-ANALYST-1 — scope\n\nbody…\n' + lines(3)).ctx || ''));
check('path asks for B_MEASURE_GATE, H1 says B-MEASURE-GATE leg 2 → SILENT', run(RAW, '# B-MEASURE-GATE leg 2 — scope (r5)\n\nbody…\n' + lines(3)).ctx === null);
check('git show of a batch file whose H1 carries no batch id is SILENT', run('git show origin/migration/aws-supabase:"Claude Comms and Packages/Scope Files/B_MEASURE_GATE_LEG2_SCOPE.md"', '# Scope\n\nbody…\n').ctx === null);

console.log('\n=== invariants ===');
{
  const r = run('git log --oneline -20', lines(20));
  check('it NEVER blocks: exit 0 even when firing', r.status === 0, 'exit=' + r.status);
  // Read the RAW hook output — the extracted context string could never carry the field, and
  // the mutation arm caught exactly that: a check that could not come out differently.
  check('and emits no permissionDecision', /additionalContext/.test(r.raw) && !/permissionDecision/.test(r.raw));
}
check('an interrupted result is SILENT (undecided, not clean)', run('git log --oneline -20', lines(20), '', { interrupted: true }).ctx === null);
check('a non-Bash payload is SILENT', (() => {
  const r = spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ tool_name: 'Read', tool_input: {}, tool_response: {} }), encoding: 'utf8', env: { ...process.env, GUARD_SYNTHETIC: '1' } });
  return r.status === 0 && r.stdout.trim() === '';
})());

// Mutation arms — patch a copy, re-run this suite, require FAILURE.
if (!process.env.GUARD6C_UNDER_TEST) {
  console.log('\n=== MUTATION ARMS ===');
  const dir = mkdtempSync(join(tmpdir(), 'mut6c-'));
  const MUTS = [
    ['drop the cap floor (fires on head -1)', (s) => s.replace('const CAP_FLOOR = 5;', 'const CAP_FLOOR = 1;')],
    ['drop the heredoc elision (fires on a MENTION of head -50)', (s) => s.replace('const ec = elide(cmd);', 'const ec = cmd;')],
    ['make error-consumed fire on the error ALONE (no consumer, no number)', (s) => s.replace("if (errLine && (CONSUMER.test(ec) || /^\\d+$/.test(lastOut)))", 'if (errLine)')],
    ['drop the API condition (fires on any HTML)', (s) => s.replace("const asksApi = /\\b(curl|wget|Invoke-WebRequest|iwr)\\b/.test(ec) && (", 'const asksApi = true || (')],
    ['drop the H1 comparison (other-document never fires)', (s) => s.replace("if (got && !got[1].startsWith(wanted) && !wanted.startsWith(got[1]))", 'if (false)')],
    ['make it emit a permission decision', (s) => s.replace("hookEventName: 'PostToolUse',", "hookEventName: 'PostToolUse', permissionDecision: 'deny',")],
    ['make it block (exit 2)', (s) => s.replace(/process\.exit\(0\);\s*$/, 'process.exit(2);')],
  ];
  let mi = 0;
  for (const [name, mut] of MUTS) {
    const src = readFileSync(GUARD, 'utf8');
    const mutated = mut(src);
    if (mutated === src) { check('mutation applies: ' + name, false, 'patch did not change the source'); continue; }
    const p = join(dir, 'm' + (mi++) + '.mjs');
    writeFileSync(p, mutated);
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', env: { ...process.env, GUARD6C_UNDER_TEST: p } });
    check('"' + name + '" makes the suite FAIL', r.status !== 0, 'mutated suite exited ' + r.status);
  }
}

console.log('\n' + '='.repeat(58));
console.log('  PASS ' + pass + '   FAIL ' + fail);
process.exit(fail ? 1 : 0);
