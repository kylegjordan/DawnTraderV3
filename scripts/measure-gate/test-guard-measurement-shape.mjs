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

console.log('\n=== D7-D12. OVER-ELISION — a swallowed instrument is worse than a missed mention ===');
{
  // ⛔ THE HIGHEST-STAKES CASE, reader-found: the instrument RUNS inside the quoted argument and
  // its output goes straight into a crew post as a claim. r2 elided the whole quote and was silent.
  const r = run(bash(`cc-send --sender "OLD Claude" --message "count: $(grep -c MISTAKE file.md)"`));
  check('D7 a command substitution INSIDE a message still fires', !!r.ctx, 'SILENT — the guard is blind here');
}
{
  const r = run(bash(`ssh root@h 'cc-send --message "CLAUDE.md is $(wc -c CLAUDE.md) bytes"'`));
  check('D8 substitution inside a quoted remote message still fires', !!r.ctx, 'SILENT');
}
{
  // r2's write-payload regex was unanchored and backtracked to the next `>`, swallowing every
  // stage in between.
  const r = run(bash('echo "starting" ; grep -c TODO server/index.ts ; echo "done" > /tmp/log.txt'));
  check('D9 elision does not swallow stages between two quotes', !!r.ctx, 'SILENT');
}
{
  const r = run(bash('echo "a" && wc -c CLAUDE.md && echo "b" > out.txt'));
  check('D10 same, with && separators', !!r.ctx, 'SILENT');
}
{
  // `<<` inside message TEXT re-created the marker bug the comment says was fixed.
  const r = run(bash(`cc-send --message "paste this: cat <<EOF ... EOF" && wc -c CLAUDE.md`));
  check('D11 a `<<` inside message text does not eat the next stage', !!r.ctx, 'SILENT');
}
{
  // ⛔ THE PRODUCT CASE. D11 had `<<` without a substitution; D7/D8 had a substitution without a
  // `<<`. Each half was covered and the COMBINATION was not — and it is the combination that
  // went silent, because execRe kept the region and the `<<` then reached the heredoc rule.
  const r = run(bash(`cc-send --message "cat <<EOF then $(date)" && wc -c CLAUDE.md`));
  check('D11b `<<` AND a substitution together still fires', !!r.ctx, 'SILENT — the two fixes cancel');
}
{
  const r = run(bash('cc-send --message "the count is $(grep -c X f.md) -- paste with cat <<EOF" && wc -c CLAUDE.md && grep -c TODO server/index.ts'));
  check('D11c later stages survive a message holding both', !!r.ctx && r.ctx.includes('worktree-not-ref'),
        'ctx=' + String(r.ctx).slice(0, 70));
}
{
  // ⛔ GOVERNANCE MANDATES THESE EVERY TURN. A guard that fires on them is unshippable.
  const r = run(bash('ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"'));
  check('D13 the §10.5 per-turn alert read does NOT fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 60));
}
{
  const r = run(bash('ssh root@204.168.141.77 "tail -30 /var/log/cc-discord-inbox.jsonl"'));
  check('D14 the session-start inbox read does NOT fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 60));
}
{
  const r = run(bash('git log -200 --grep=MISTAKE'));
  check('D15 but git log -N still fires (not mandated)', !!r.ctx && r.ctx.includes('truncation'));
}
{
  // UNDER-elision: the motivating incident with `=` instead of a space.
  const r = run(bash(`cc-send --sender "OLD Claude" --message="the guard fires on grep -c, heads up"`));
  check('D12 the --message= form does not fire', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 60));
}

console.log('\n=== E. LOCALITY — tokens must co-occur in ONE pipeline stage ===');
{
  // Single `&` was not a separator in r2, and background chains are where unrelated commands
  // most plausibly sit side by side.
  const r = run(bash('grep -v skip notes.md & tail -c 200 notes.md'));
  check('E0 single & separates stages', r.ctx === null, 'fired: ' + String(r.ctx).slice(0, 60));
}
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
  // ⛔ r3, all reader-found: the drop-arm covered ONE of three shapes; the "make it block" arm
  // proved only that the suite notices a non-zero EXIT, never that it notices a hook emitting a
  // permission decision — the leg the file's own headline claim rests on; and two mutant copies
  // collided on one filename because it was derived from `name.length`.
  const dropShape = (id) => (s) => {
    const i = s.indexOf("id: '" + id + "',");
    if (i < 0) return s;
    const start = s.lastIndexOf('{', i);
    const end = s.indexOf('\n  },', i);
    return end < 0 ? s : s.slice(0, start) + s.slice(end + 5);
  };
  const MUTS = [
    ['remove mention-elision', (s) => s.replace('function stripMentions(cmd) {', 'function stripMentions(cmd) { return cmd;')],
    ['remove locality (match whole command)', (s) => s.replace('stages(stripped).some((st) => sh.test(st))', 'sh.test(stripped)')],
    ['drop shape worktree-not-ref', dropShape('worktree-not-ref')],
    ['drop shape truncation-is-not-population', dropShape('truncation-is-not-population')],
    ['drop shape count-from-search', dropShape('count-from-search')],
    ['make it exit non-zero', (s) => s.replace(/process\.exit\(0\);\s*$/, 'process.exit(2);')],
    // The one that tests the headline claim rather than the exit code.
    ['make it emit a permission decision', (s) => s.replace(
      "hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text },",
      "hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text, permissionDecision: 'deny', permissionDecisionReason: text },")],
    // Over-elision is worse than under-elision: a swallowed instrument is a BLIND guard that
    // reads as a clean one. This mutation removes the execRe guard that keeps `$( )` alive.
    ['let elision swallow command substitutions', (s) => s.replace('const execRe = /\\$\\(|`/;', 'const execRe = /$^/;')],
  ];
  let mi = 0;
  for (const [name, mut] of MUTS) {
    const p = join(dir, 'm' + (mi++) + '.mjs');
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
