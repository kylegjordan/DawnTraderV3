#!/usr/bin/env node
// OFFLINE proof for guard-result-shape.mjs (OBJ-6c) before it is wired (#761's rule). Payloads
// use the OBSERVED PostToolUse wire, r2: tool_response = { stdout, stderr, interrupted } where
// STDERR IS EMPTY and the child's stderr arrives merged into stdout (75,739 real results replayed
// by the r2 reader: the only non-empty stderr ever seen was the harness's own cwd notice). Every
// error arm below therefore puts the error ON STDOUT and passes stderr as ''. No exit code exists.
// Its bar: FIRES ON THE SHAPE, SILENT ON THE CONTROL. Every positive arm has a paired control
// differing in the ONE property the leg keys on; the mutation arms (arm-wears-the-gap's-name)
// each remove one discriminator and must fail the suite.
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
const fires = (leg, r) => new RegExp('• ' + leg + ':').test(r.ctx || '');

console.log('=== cap-bound (instance 3: the cap MAY have done the filtering) ===');
check('git log -20 returning exactly 20 lines FIRES', fires('cap-bound', run('git log --oneline -20 --grep=MISTAKE', lines(20))));
check('git log -20 returning 7 lines is SILENT (the query bounded it)', run('git log --oneline -20 --grep=MISTAKE', lines(7)).ctx === null);
check('git log -20 returning 22 lines is SILENT (more than the cap: not the cap\'s doing)', run('git log --oneline -20', lines(22)).ctx === null);
check('head -50 at the end of one pipeline returning 50 lines FIRES', fires('cap-bound', run('grep -n foo x.log | head -50', lines(50))));
check('a leading cd && before the capped pipeline still FIRES', fires('cap-bound', run('cd "C:/DawnTraderV3-old" && git log --oneline -20', lines(20))));
check('head -1 returning 1 line is SILENT (floor: a cap of 1 always equals its output)', run('git log -1 --format=%H', 'abc123\n').ctx === null);
check('LIMIT 100 returning 100 rows FIRES', fires('cap-bound', run('psql -c "select id from trades LIMIT 100"', lines(100))));
check('a MULTI-STAGE command (echo hdr; grep | head -20) with 20 total lines is SILENT (the count is not the pipeline\'s)', run('echo header; grep foo x | head -20', lines(20)).ctx === null,
      'fired: ' + String(run('echo header; grep foo x | head -20', lines(20)).ctx).slice(0, 60));
check('a heredoc MENTIONING head -50 with 50 lines of unrelated output is SILENT', run("cat > /tmp/n.txt <<'EOF'\nnever trust head -50 as a population\nEOF\ncat /tmp/list.txt", lines(50)).ctx === null);
check('a commit message QUOTING head -50 with 50 lines of output is SILENT', run('git commit -m "the head -50 read was wrong" -- a.md', lines(50)).ctx === null,
      'fired: ' + String(run('git commit -m "the head -50 read was wrong" -- a.md', lines(50)).ctx).slice(0, 60));

console.log('\n=== error-counted (the merged wire: an error printed, then a number anyway) ===');
const FATAL = "fatal: path '1-system-manual/FOO.md' does not exist in 'origin/x'\n";
check('git show ref:path | wc -l → "fatal: …" then "0" ON STDOUT (stderr empty) FIRES', fires('error-counted', run('git show origin/x:1-system-manual/FOO.md | wc -l', FATAL + '0\n', '')));
check('grep -c on a missing file → "grep: … No such file" then "0" FIRES', fires('error-counted', run('grep -c breach /tmp/dtlog.txt', 'grep: /tmp/dtlog.txt: No such file or directory\n0\n', '')));
check('the same fatal with NO counter stage and NO number is SILENT (the session can see the error)', run('git show origin/x:1-system-manual/FOO.md', FATAL, '').ctx === null);
check('a fatal followed by a number but NO counting stage in the command is SILENT', run('git show origin/x:FOO.md', FATAL + '0\n', '').ctx === null);
check('a counter with a clean number and no error signature is SILENT (never fire on a value)', run('cat f.txt | wc -l', '3\n', '').ctx === null);
check('a clean count with empty stderr is SILENT (never fire on a value)', run('psql -c "select count(*) from trades"', '0\n').ctx === null);
check('an empty stdout is SILENT (never fire on a value)', run('grep -c breach /var/log/x.log', '').ctx === null);
check('an error arriving on a SEPARATE stderr (a future harness) is still seen', fires('error-counted', run('git show origin/x:FOO.md | wc -l', '0\n', FATAL)));
check('the harness cwd notice on stderr is not an error', run('cat f.txt | wc -l', '3\n', 'Shell cwd was reset to C:/x\n').ctx === null);

console.log('\n=== html-not-json (a page read as data) ===');
check('curl to /api/ returning an HTML document FIRES', fires('html-not-json', run('curl -s http://188.245.193.8/api/vts/filter-diagnostics | head -c 400', '<!DOCTYPE html>\n<html><head><title>Sign in</title></head><body>…</body></html>\n')));
check('curl to /api/ returning JSON is SILENT', run('curl -s http://188.245.193.8/api/vts/filter-diagnostics | head -c 400', '{"ok":true,"rows":[]}\n').ctx === null);
check('curl to a NON-api page returning HTML is SILENT (HTML was the request)', run('curl -s https://docs.claude.com/en/hooks | head -c 400', '<!DOCTYPE html><html><title>Hooks</title></html>\n').ctx === null);
// ⛔ KNOWN GAP pinned as a control, so nobody claims it: #732 as it actually occurred.
check('KNOWN GAP (instance 8 as it occurred): a JSON 404 body parsed cleanly to "0 of 0" is SILENT', run('curl -s http://localhost:5000/api/trades/closed?limit=200 | python3 -c "import json,sys; d=json.load(sys.stdin); print(\'rows: 0 of 0 closed\')"', 'trailing_stop_hit rows: 0 of 0 closed\nTRIPWIRE breaches (net_pnl<0): 0\n').ctx === null);

console.log('\n=== other-document (Langston live: the wrong file answered with HTTP 200) ===');
const RAW = 'curl -s https://raw.githubusercontent.com/kylegjordan/DawnTraderV3/abc123/Claude%20Comms%20and%20Packages/Scope%20Files/B_MEASURE_GATE_LEG2_SCOPE.md | head -40';
check('path asks for B_MEASURE_GATE, H1 says B-GOV-HYGIENE-ANALYST-1 (no word in common) → FIRES', fires('other-document', run(RAW, '# B-GOV-HYGIENE-ANALYST-1 — scope\n\nbody…\n' + lines(3))));
check('path asks for B_MEASURE_GATE, H1 says B-MEASURE-GATE leg 2 → SILENT', run(RAW, '# B-MEASURE-GATE leg 2 — scope (r5)\n\nbody…\n' + lines(3)).ctx === null);
check('a RENAMED batch sharing a word (B_EXIT_GRID_REPRESENTABILITY → # F-G-1 — B-GRID-REPRESENTABILITY) is SILENT', run('head -8 "Claude Comms and Packages/Scope Files/B_EXIT_GRID_REPRESENTABILITY_SCOPE.md"', '# F-G-1 — B-GRID-REPRESENTABILITY scope\n' + lines(3)).ctx === null,
      'fired');
check('a parent scope answering a sub-batch path (B_GOV_4_SCOPE → # B-GOV) is SILENT', run('head -5 B_GOV_4_SCOPE.md', '# B-GOV governance batch\n' + lines(3)).ctx === null);
check('a MULTI-STAGE command reading two files (first H1 belongs to the other file) is SILENT', run('head -8 GOVERNANCE_EXCEPTIONS.md; head -3 B_REPO_RELOCATE_MIGRATION_PLAN.md', '# (B-GOV) exceptions\n' + lines(7) + '# B-REPO-RELOCATE plan\n' + lines(2)).ctx === null);
check('an H1 past the first 20 lines is not compared (SILENT)', run(RAW, lines(25) + '# B-GOV-HYGIENE-ANALYST-1\n').ctx === null);
check('a batch file whose H1 carries no batch id is SILENT', run('git show origin/migration/aws-supabase:"Claude Comms and Packages/Scope Files/B_MEASURE_GATE_LEG2_SCOPE.md"', '# Scope\n\nbody…\n').ctx === null);

console.log('\n=== invariants ===');
{
  const r = run('git log --oneline -20', lines(20));
  check('it NEVER blocks: exit 0 even when firing', r.status === 0, 'exit=' + r.status);
  check('and emits no permissionDecision', /additionalContext/.test(r.raw) && !/permissionDecision/.test(r.raw));
}
check('an interrupted result is SILENT (undecided, not clean)', run('git log --oneline -20', lines(20), '', { interrupted: true }).ctx === null);
check('a non-Bash payload is SILENT', (() => {
  const r = spawnSync(process.execPath, [GUARD], { input: JSON.stringify({ tool_name: 'Read', tool_input: {}, tool_response: {} }), encoding: 'utf8', env: { ...process.env, GUARD_SYNTHETIC: '1' } });
  return r.status === 0 && r.stdout.trim() === '';
})());

if (!process.env.GUARD6C_UNDER_TEST) {
  console.log('\n=== MUTATION ARMS ===');
  const dir = mkdtempSync(join(tmpdir(), 'mut6c-'));
  const MUTS = [
    ['drop the cap floor (fires on head -1)', (s) => s.replace('const CAP_FLOOR = 5;', 'const CAP_FLOOR = 1;')],
    ['fire on AT LEAST the cap instead of EXACTLY (fires on 22 lines)', (s) => s.replace('if (cap >= CAP_FLOOR && nLines === cap)', 'if (cap >= CAP_FLOOR && nLines >= cap)')],
    ['drop the single-pipeline requirement for cap-bound', (s) => s.replace('  if (pipe) {\n    for (const cap of caps(pipe))', '  if (true) {\n    for (const cap of caps(ec))')],
    ['drop the heredoc and quoted-prose elision (fires on a MENTION of head -50)', (s) => s.replace('const ec = elide(cmd);', 'const ec = cmd;')],
    ['key the error leg on stderr again (zero reachable inputs on this wire)', (s) => s.replace('const sig = ERROR_SIG.exec(stdout);', "const sig = ERROR_SIG.exec(typeof resp === 'undefined' ? '' : '');")],
    ['let ANY output count as an error signature', (s) => s.replace('const sig = ERROR_SIG.exec(stdout);', 'const sig = /./.exec(stdout);')],
    ['drop the counting-stage condition (fires on any error + number)', (s) => s.replace('if (sig && /^\\d+$/.test(lastOut) && COUNTER.test(ec))', 'if (sig && /^\\d+$/.test(lastOut))')],
    ['drop the API condition (fires on any HTML)', (s) => s.replace("const asksApi = /\\b(curl|wget|Invoke-WebRequest|iwr)\\b/.test(ec) && (", 'const asksApi = true || (')],
    ['drop the shared-word tolerance (renamed batches fire)', (s) => s.replace('if (gw.size && !shared)', 'if (gw.size)')],
    ['drop the H1 line window', (s) => s.replace('const H1_LINES = 20;', 'const H1_LINES = 1e9;')],
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
