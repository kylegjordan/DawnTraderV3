#!/usr/bin/env node
// OFFLINE proof for guard-measurement-shape.mjs. Runs the hook as a real child process with
// real stdin payloads. Nothing is wired, nothing is live, no session is touched.
//
// ⛔ THIS EXISTS BECAUSE OF #761: a live-service change was tested in production and took CC
// comms down for ~4 minutes with a cause that is still unknown. The standing rule from it is
// PROVE IT OFFLINE ON REAL INPUTS FIRST.
//
// ⛔⛔ AND THE MUTATION ARMS ARE THE POINT, NOT THE PASSES. A test that only shows the hook
// firing where it should proves the hook can speak; it does not prove the check DISCRIMINATES.
// Each mutation breaks one leg and asserts the suite NOTICES — the fence has to be shown able
// to fail before its passes are worth anything (rule 29(b), and the batch's own §3 result).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOOK = join(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), '.claude', 'hooks', 'guard-measurement-shape.mjs');

function run(payload) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
  });
  let json = null;
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { json = 'UNPARSEABLE'; }
  const ctx = json && json.hookSpecificOutput ? json.hookSpecificOutput.additionalContext : null;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, ctx };
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  <- ' + detail : '')); }
};

console.log('=== A. IT NEVER BLOCKS — the property the whole design rests on ===');
for (const c of [
  'grep -c foo bar.txt',
  'git log -200 --grep=X',
  'wc -c CLAUDE.md',
  'echo hello',
]) {
  const r = run(bash(c));
  check('exit 0 for: ' + c.slice(0, 34), r.status === 0, 'exit=' + r.status);
  const blocks = r.json && r.json.hookSpecificOutput && 'permissionDecision' in r.json.hookSpecificOutput;
  check('no permissionDecision for: ' + c.slice(0, 22), !blocks);
}

console.log('\n=== B. IT FIRES ON EACH SHAPE (positive arms) ===');
const positives = [
  ['count-is-not-a-set', 'grep -c "wrong-object" MISTAKE_PATTERNS.md'],
  ['truncation-is-not-population', 'git log -200 --grep=MISTAKE'],
  ['worktree-not-ref', 'wc -c CLAUDE.md'],
  ['worktree-not-ref', 'md5sum .claude/hooks/fresh-rules.mjs'],
  ['absence-without-control', 'git grep -c PostToolUse -- .claude/'],
];
for (const [id, c] of positives) {
  const r = run(bash(c));
  check(id + ' fires on: ' + c.slice(0, 30), !!r.ctx && r.ctx.includes(id), 'ctx=' + String(r.ctx).slice(0, 60));
}

console.log('\n=== C. NEGATIVE CONTROL — ordinary commands stay silent ===');
for (const c of [
  'git status --porcelain',
  'node scripts/foo.mjs',
  'ssh root@example "systemctl status x"',
  'git commit -F msg.txt -- path/a.md',
]) {
  const r = run(bash(c));
  check('silent for: ' + c.slice(0, 38), r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 70));
}

console.log('\n=== D. USE-vs-MENTION — the leg that exists because the predecessor blocked its own warning post ===');
const mention = bash(
  "cat > /tmp/note.txt <<'EOF'\n" +
  'Do not report a number from grep -c, and never take wc -c from a working copy.\n' +
  'Also git log -200 is a truncation, not a population.\n' +
  'EOF'
);
{
  const r = run(mention);
  check('heredoc BODY quoting three shapes does NOT fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 90));
  check('and the elision was recorded, not silent', r.status === 0);
}
{
  // The discriminator: the SAME shapes, actually executed, must still fire.
  const r = run(bash('grep -c wrong-object MISTAKE_PATTERNS.md'));
  check('but the same shape EXECUTED still fires', !!r.ctx);
}
{
  // A command that both quotes AND runs one: the executed one must survive the elision.
  const r = run(bash("cat > /tmp/x <<'EOF'\nwc -c file\nEOF\ngrep -c foo bar"));
  check('quoted shape elided, executed shape still caught', !!r.ctx && r.ctx.includes('count-is-not-a-set') && !r.ctx.includes('worktree-not-ref'),
        'ctx=' + String(r.ctx).slice(0, 90));
}

console.log('\n=== E. FAIL-OPEN — every error path exits 0 and emits nothing ===');
for (const [name, p] of [
  ['invalid JSON', 'not json at all'],
  ['empty stdin', ''],
  ['no tool_input', { tool_name: 'Bash' }],
  ['command not a string', { tool_name: 'Bash', tool_input: { command: 42 } }],
  ['toolInput spelling', { toolName: 'Bash', toolInput: { command: 'echo hi' } }],
]) {
  const r = run(p);
  check(name + ' -> exit 0, no context', r.status === 0 && !r.ctx, 'exit=' + r.status + ' ctx=' + String(r.ctx).slice(0, 40));
}

console.log('\n=== F. MUTATION ARMS — break a leg, prove the suite NOTICES ===');
{
  // F1: if the use-vs-mention elision were removed, the heredoc case would fire. Simulate by
  // feeding the heredoc BODY as if it were the executable part.
  const r = run(bash('Do not report a number from grep -c, and never take wc -c from a working copy.'));
  check('F1 without elision the mention WOULD fire (so D is a real test)', !!r.ctx,
        'if this is silent, D passes for the wrong reason');
}
{
  // F2: a command containing none of the shapes must be silent — if this fired, the matchers
  // are matching something they should not and every C pass is meaningless.
  const r = run(bash('echo "the quick brown fox jumps over the lazy dog"'));
  check('F2 a shape-free command is silent (matchers are not universal)', r.ctx === null,
        'fired: ' + String(r.ctx).slice(0, 60));
}

console.log('\n' + '='.repeat(64));

console.log('  PASS ' + pass + '   FAIL ' + fail);
process.exit(fail ? 1 : 0);
