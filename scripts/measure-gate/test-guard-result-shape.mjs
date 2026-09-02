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
// cap-bound is delivered as ONE terse line (no bullet) — the two-channel rule; the other legs as bullets.
const fires = (leg, r) => new RegExp('(^|• )' + leg + ':').test(r.ctx || '');

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
// r3 arms — quote-aware split, wrapper recursion, each cap form, heredoc start line, the real notice.
check('a ";" INSIDE a quoted argument keeps it one pipeline (psql -c "…; … LIMIT 20") → FIRES', fires('cap-bound', run('psql -c "select 1; select id from t LIMIT 20"', lines(20))));
check('ssh host \'tail -50 file\' (single remote stage) with 50 lines FIRES', fires('cap-bound', run("ssh root@188.245.193.8 'tail -50 /var/log/dawntrader/system-alerts.jsonl'", lines(50))));
check('ssh host "a; b | tail -20" (multi-stage remote payload) with 20 lines is SILENT', run('ssh root@x "echo hdr; grep foo f | tail -20"', lines(20)).ctx === null);
check('…and STILL silent with trailing 2>&1 after the quote (r4: 40 replayed fires on an inner cap)', run('ssh root@x "echo hdr; grep foo f | tail -20" 2>&1', lines(20)).ctx === null, 'fired');
check('ssh host \'single\' 2>&1 | tail -18 with 18 lines FIRES on the OUTER cap', fires('cap-bound', run("ssh root@x 'wc -l MEMORY.md' 2>&1 | tail -18", lines(18))));
check('su - deploy -c \'multi; stage | head -5\' inside ssh with 5 lines is SILENT', run("ssh root@x \"su - deploy -c 'ls x | head -5 && grep y z | tail -8'\"", lines(5)).ctx === null);
check('two commands split by a NEWLINE with 20 total lines is SILENT', run('echo hdr\ngrep foo x | head -20', lines(20)).ctx === null);
check('a cap on the heredoc START line (cat <<EOF | head -20) with 20 lines FIRES', fires('cap-bound', run("cat <<'EOF' | head -20\nline\nEOF", lines(20))));
check('a stage AFTER a terminated heredoc is still seen (heredoc; then grep | head -20 with 20 lines is multi-stage → SILENT, and its cap is not lost: same with the heredoc removed FIRES)',
      run("cat > /tmp/x.txt <<'EOF'\nbody\nEOF\ngrep foo f | head -20", lines(20)).ctx === null && fires('cap-bound', run('grep foo f | head -20', lines(20))));
check('tail -50 at exactly 50 lines FIRES', fires('cap-bound', run('tail -50 /var/log/x.log', lines(50))));
check('grep -m 10 at exactly 10 lines FIRES', fires('cap-bound', run('grep -m 10 foo x.log', lines(10))));
check('--limit 30 at exactly 30 lines FIRES', fires('cap-bound', run('gh run list --limit 30', lines(30))));
check('gh -L 12 at exactly 12 lines FIRES', fires('cap-bound', run('gh pr list -L 12', lines(12))));
check('git log -n 15 at exactly 15 lines FIRES', fires('cap-bound', run('git log -n 15 --oneline', lines(15))));
check('the REAL cwd notice ("\\nShell cwd was reset…") on stderr does not shift the count: head -20 with 20 rows FIRES', fires('cap-bound', run('grep foo x | head -20', lines(20), '\nShell cwd was reset to G:\\My Drive\\x\n')));
check('…and with 18 rows is SILENT (the notice must not pad it to 20)', run('grep foo x | head -20', lines(18), '\nShell cwd was reset to G:\\My Drive\\x\n').ctx === null);

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
check('the REAL harness cwd notice ("\\nShell cwd was reset…") on stderr is not an error', run('cat f.txt | wc -l', '3\n', '\nShell cwd was reset to G:\\My Drive\\x\n').ctx === null);
// r3 arms — the replayed false fires, each pinned silent.
check('MULTI-STAGE: a python Traceback then a later "grep -c" count is SILENT (python is not a counter; the count is another stage\'s)',
      run("python3 - <<'PY'\nraise SystemExit(1)\nPY\nnpx tsc --noEmit | grep -c 'error TS'", 'Traceback (most recent call last):\n  File "<stdin>", line 1\nSystemExit: 1\n384\n').ctx === null);
check('"error:" then a max issue number from sort -n | tail -1 is SILENT (a value, multi-stage)', run("git pull -q; grep -oE '#[0-9]+' RUNNING_ISSUES.md | sort -n | tail -1", 'error: cannot pull with rebase\n#915\n'.replace('#915', '915')).ctx === null);
check('issue "#404" in governance text is not an HTTP 404 (SILENT)', run('grep -c "#430" 1-system-manual/RUNNING_ISSUES.md', 'see #404 for the prior\n3\n').ctx === null);
check('"HTTP/1.1 404 Not Found" then a jq length of 0 FIRES', fires('error-counted', run("curl -si http://x/api/rows | jq 'length'", 'HTTP/1.1 404 Not Found\n0\n')));

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
check('an H1 on line 10 (inside the window) IS compared → FIRES', fires('other-document', run(RAW, lines(9, 'front-matter') + '# B-GOV-HYGIENE-ANALYST-1\n' + lines(3))));
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
    ['drop the counter-last condition (fires on any error + number)', (s) => s.replace('if (pipe && sig && /^\\d+$/.test(lastOut) && COUNTER_LAST.test(pipe))', 'if (pipe && sig && /^\\d+$/.test(lastOut))')],
    ['let error-counted fire on MULTI-STAGE commands again', (s) => s.replace('if (pipe && sig && /^\\d+$/.test(lastOut) && COUNTER_LAST.test(pipe))', 'if (sig && /^\\d+$/.test(lastOut) && COUNTER_LAST.test(ec))')],
    ['make the stage split quote-BLIND again', (s) => s.replace("if (c === '\"' || c === \"'\") { q = c; continue; }", '')],
    ['stop recursing into ssh/sh -c payloads', (s) => s.replace('if (w && depth < 2)', 'if (false)')],
    ['stop recursing into NESTED wrappers (ssh → su -c)', (s) => s.replace('if (w && depth < 2)', 'if (w && depth < 1)')],
    ['reject wrappers with trailing text after the quote (inner caps read again)', (s) => s.replace("((?:\\s*\\d?>[>&]?\\S*)*(?:\\s*\\|\\s*(?:head|tail)\\s+(?:-n\\s*|-)\\d+\\b\\S*)?)\\s*$/", '()\\s*$/')],
    ['drop the cwd-notice stripping (the notice pads every count by two)', (s) => s.replace("const errRest = rawErr.replace(/^\\s*Shell cwd was reset[^\\n]*\\n?/gm, '').trim();", 'const errRest = rawErr.trim();')],
    ['match a bare 404 again (issue #404 fires)', (s) => s.replace('HTTP\\S*\\s+404\\b|\\b404 Not Found\\b|\\bNot Found\\b', '\\b404\\b|\\bNot Found\\b')],
    ['drop the tail cap', (s) => s.replace('/\\btail\\s+(?:-n\\s*|-)(\\d+)\\b/g,', '')],
    ['swallow the heredoc start line again', (s) => s.replace("/<<-?\\s*(['\"]?)([A-Za-z_][A-Za-z0-9_-]*)\\1([^\\n]*)\\n[\\s\\S]*?^\\s*\\2\\s*$/gm, '[heredoc $2]$3 [heredoc-elided] '", "/<<-?\\s*(['\"]?)([A-Za-z_][A-Za-z0-9_-]*)\\1[\\s\\S]*?^\\s*\\2\\s*$/gm, ' [heredoc-elided] '")],
    // NOT an arm: "let the unterminated pass re-match a terminated heredoc" was tried and leaves the
    // suite GREEN — the re-match only ever makes the guard MORE silent (later stages vanish → one
    // stage with no cap), and every arm where that happens is silent already. It was found
    // through the multi-stage error-counted mutation, which is the arm that pins it.
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
