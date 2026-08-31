#!/usr/bin/env node
// OFFLINE proof for guard-measurement-shape.mjs. Runs the hook as a real child process with real
// stdin payloads. Nothing is wired, nothing live, no session touched. (#761: prove it offline on
// real inputs first.)
//
// ⛔⛔ r2 — A FRESH READER SHOWED THE r1 SUITE PASSED FOR THE WRONG REASONS, TWICE:
//   (1) Its only use-vs-mention case was written AS A HEREDOC, so it was consistent with the
//       write-redirection leg never having existed — which it did not. The motivating incident
//       (a crew post quoting a shape in a --message argument) still false-positived.
//   (2) Its "mutation arms" MUTATED NOTHING. F1/F2 fed different inputs to the unmodified hook.
//       They were vacuity controls on the matcher, not evidence the suite can fail.
// ⇒ r2 adds the missed mention forms, a locality arm, and REAL mutations: each patches a copy of
//   the hook, re-runs the whole suite against it, and asserts the suite FAILS. A fence that has
//   not been shown able to fail is not evidence.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const HOOK = process.env.GUARD_UNDER_TEST || join(ROOT, '.claude', 'hooks', 'guard-measurement-shape.mjs');

function run(payload) {
  // GUARD_SYNTHETIC marks every row this suite produces. Its payloads are CHOSEN to fire, so
  // mixing them with real session traffic makes the fire rate a measurement of the test suite —
  // which is exactly what happened on the first reading.
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8',
    env: { ...process.env, GUARD_SYNTHETIC: '1' },
  });
  let json = null;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { json = 'UNPARSEABLE'; }
  const ctx = json && json.hookSpecificOutput ? json.hookSpecificOutput.additionalContext : null;
  return { status: r.status, ctx, json };
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  <- ' + detail : '')); }
};

console.log('=== A. NEVER BLOCKS, AND NEVER EXITS NON-ZERO ===');
for (const c of ['wc -c CLAUDE.md', 'git log -200 --grep=X', 'grep -c foo bar', 'echo hello']) {
  const r = run(bash(c));
  check('exit 0: ' + c.slice(0, 30), r.status === 0, 'exit=' + r.status);
  const blocks = r.json && r.json.hookSpecificOutput && 'permissionDecision' in r.json.hookSpecificOutput;
  check('no permissionDecision: ' + c.slice(0, 22), !blocks);
}

console.log('\n=== B. FIRES ON EACH SHAPE ===');
for (const [id, c] of [
  ['worktree-not-ref', 'wc -c CLAUDE.md'],
  ['worktree-not-ref', 'md5sum .claude/hooks/fresh-rules.mjs'],
  ['truncation-is-not-population', 'git log -200 --grep=MISTAKE'],
  ['count-from-search', 'grep -c "wrong-object" MISTAKE_PATTERNS.md'],
]) {
  const r = run(bash(c));
  check(id + ' on: ' + c.slice(0, 28), !!r.ctx && r.ctx.includes(id), 'ctx=' + String(r.ctx).slice(0, 50));
}

console.log('\n=== C. NEGATIVE CONTROL ===');
for (const c of ['git status --porcelain', 'node scripts/foo.mjs', 'git commit -F m.txt -- a.md']) {
  const r = run(bash(c));
  check('silent: ' + c.slice(0, 32), r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 60));
}

console.log('\n=== D. USE-vs-MENTION — every quoting form the corpus actually uses ===');
{
  const r = run(bash("cat > /tmp/n.txt <<'EOF'\nnever report grep -c as a count, nor wc -c from a working copy\nEOF"));
  check('D1 heredoc body does not fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 70));
}
{
  // ⛔ THE MOTIVATING INCIDENT. r1 asserted this was covered; it was not, and it fired.
  const r = run(bash(`ssh root@h 'cc-send --sender "OLD Claude" --message "the guard fires on grep -c, heads up"'`));
  check('D2 a --message payload quoting a shape does not fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 70));
}
{
  const r = run(bash('echo "never use grep -c as a count" > /tmp/note.txt'));
  check('D3 an echo>file payload does not fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 70));
}
{
  const r = run(bash('printf %s "wc -c CLAUDE.md is wrong" >> notes.md'));
  check('D4 a printf>>file payload does not fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 70));
}
{
  const r = run(bash('grep -c wrong-object MISTAKE_PATTERNS.md'));
  check('D5 the same shape EXECUTED still fires', !!r.ctx);
}
{
  const r = run(bash("cat > /tmp/x <<'EOF'\nwc -c file\nEOF\ngrep -c foo bar"));
  check('D6 quoted elided, executed still caught', !!r.ctx && r.ctx.includes('count-from-search') && !r.ctx.includes('worktree-not-ref'),
        'ctx=' + String(r.ctx).slice(0, 70));
}

console.log('\n=== E. LOCALITY — tokens must co-occur in ONE pipeline stage ===');
{
  // ⛔⛔ E1 IS THE ARM THE MUTATION CAUGHT. Its first version used the author's own flagged
  // command — but that command stopped firing because the PREDICATE was narrowed (r1 also
  // accepted `| wc -l` as the count token; r2 does not), NOT because of locality. So the
  // "remove locality" mutation left the suite green, and the arm was testing nothing.
  // ⇒ this case puts the two halves of ONE shape in DIFFERENT stages: `grep` in stage 1,
  // a bare `-c` flag in stage 2. Whole-command matching fires; per-stage matching does not.
  const r = run(bash("grep -v skip notes.md | tail -c 200"));
  check('E1 same-shape halves in DIFFERENT stages do NOT fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 70));
}
{
  // And the author's own flagged command, kept because r1 credited it as a true positive and it
  // was not one — the fire came from an unrelated conjunct across three stages.
  const r = run(bash(`n=$(git diff --numstat origin/main -- a.mjs | wc -l) && git diff --cached | grep '^[+-]' | cut -c1-90`));
  check('E1b the author\'s own mis-credited command does NOT fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 70));
}
{
  const r = run(bash('git grep -c PostToolUse -- .claude/'));
  check('E2 same-stage search+count DOES fire', !!r.ctx && r.ctx.includes('count-from-search'));
}

console.log('\n=== F. FAIL-OPEN ===');
for (const [name, p] of [
  ['invalid JSON', 'not json'], ['empty stdin', ''], ['no tool_input', { tool_name: 'Bash' }],
  ['command not a string', { tool_name: 'Bash', tool_input: { command: 42 } }],
  ['toolInput spelling', { toolName: 'Bash', toolInput: { command: 'echo hi' } }],
]) {
  const r = run(p);
  check(name + ' -> exit 0, silent', r.status === 0 && !r.ctx, 'exit=' + r.status);
}

// ---------------------------------------------------------------------------
// G. REAL MUTATIONS. Each patches a COPY of the hook, re-runs this whole suite against it, and
// requires the suite to FAIL. If a mutation passes, the arm it breaks is not being tested.
// ---------------------------------------------------------------------------
if (!process.env.GUARD_UNDER_TEST) {
  console.log('\n=== G. MUTATION ARMS — break a leg, the suite must NOTICE ===');
  const src = readFileSync(HOOK, 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'guardmut-'));
  const MUTS = [
    ['remove mention-elision', (s) => s.replace('function stripMentions(cmd) {', 'function stripMentions(cmd) { return cmd;')],
    ['remove locality (match whole command)', (s) => s.replace('stages(stripped).some((st) => sh.test(st))', 'sh.test(stripped)')],
    ['drop the worktree-not-ref shape', (s) => s.replace(/\{\s*\n\s*id: 'worktree-not-ref',[\s\S]*?\n\s*\},\n/, '')],
    ['make it block (exit 2)', (s) => s.replace(/process\.exit\(0\);\s*$/, 'process.exit(2);')],
  ];
  for (const [name, mut] of MUTS) {
    const p = join(dir, 'm' + Math.abs(name.length * 7) + '.mjs');
    const mutated = mut(src);
    if (mutated === src) { check('G mutation applied: ' + name, false, 'patch did not change the source'); continue; }
    writeFileSync(p, mutated, 'utf8');
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      encoding: 'utf8', env: { ...process.env, GUARD_UNDER_TEST: p },
    });
    check('G "' + name + '" makes the suite FAIL', r.status !== 0,
          'mutated suite exited ' + r.status + ' — that leg is untested');
  }
}

console.log('\n' + '='.repeat(64));
console.log('  PASS ' + pass + '   FAIL ' + fail);
process.exit(fail ? 1 : 0);
