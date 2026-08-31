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

// ---------------------------------------------------------------------------
// M. THE MANDATED-COMMAND FIXTURE — Langston's Q1 condition 1, and it ships as a TEST ARM
// rather than a review step, because a manual step measured at 75% compliance (#451) is the
// argument FOR a predicate, not a substitute for one.
//
// ⛔⛔ ON THIS SET THE FIRE RATE IS 100% AND THE PRECISION IS STRUCTURALLY 0%, FOREVER — the
// mistake lives in the USE and the predicate sees only the INSTRUMENT. These commands cannot
// become a claim, and the rules oblige every session to run them every turn.
//
// ⚠️ ENUMERATED FROM EVERY HOME, WITH `path:line`, BECAUSE THE SET IS NOT SINGLE-HOMED.
// Langston named two homes and there are THREE — the shared MEMORY.md mandates its own pair,
// and the three do not agree (`tail -50` vs `tail -n 30` vs unbounded `cat`; `root@` vs
// `deploy@`). Enumerating from one home under-counts, which is the #641 shape.
// ---------------------------------------------------------------------------
// ⛔⛔ r2 OF THIS FIXTURE — IT IS DERIVED FROM THE FILES AT TEST TIME, NOT HARDCODED.
// The first version was a literal list of eight strings copied out of the homes. A fresh reader
// named it exactly right: THAT ENFORCES THE GUARD AGAINST EIGHT STRINGS, NOT AGAINST THE
// MANDATED SET — reword any home and the suite still passes on the stale literal. It is the
// INVERSE of the #641 shape the fixture was written to invoke: two copies, nothing comparing
// them. And one of the eight was not even verbatim: the wake-watcher line had been abbreviated.
// ⇒ the commands are now EXTRACTED from the files themselves, so a reworded home is picked up.
console.log('\n=== M. MANDATED COMMANDS — EXTRACTED from each home at test time, ZERO fires ===');
function extractCommands(path, label) {
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch { return [{ site: label + ' (UNREADABLE)', cmd: null }]; }
  const out = [];
  text.split('\n').forEach((line, i) => {
    const at = label + ':' + (i + 1);
    // Markdown homes: a backticked span that reads like one of the mandated reads.
    let hit = false;
    for (const m of line.matchAll(/`([^`]*(?:tail|cat)\s[^`]*(?:system-alerts|cc-discord-inbox|cc-wake)[^`]*)`/g)) {
      out.push({ site: at, cmd: m[1].trim() }); hit = true;
    }
    // ⛔ FENCED BLOCKS. `CLAUDE.md:279` — the §6.6 mandated inbox read — lives inside a ```bash
    // fence, NOT backticks, so the pattern above never saw it. A home written as a fence was
    // invisible to a fixture whose whole point is that a reworded home gets picked up.
    // Reader-found.
    if (!hit && /^\s*(?:ssh|tail|cat)\b/.test(line)
        && /\b(?:tail|cat)\s/.test(line)
        && /(?:system-alerts|cc-discord-inbox|cc-wake)/.test(line)) {
      out.push({ site: at, cmd: line.trim() });
    }
    // ⛔ JSON ALLOWLIST HOME: entries are `"Bash(<command>)"`, NOT backticked — so the markdown
    // pattern above found NOTHING here and the aggregate control still passed on the other
    // homes' hits. A control that cannot fail for the case it was added for. Reader-found.
    // ⚠️ `(?:[^"\\]|\\.)*` NOT `[^"]*` — the allowlist's own entries contain ESCAPED quotes
    // (`"Bash(ssh h \"tail -20 …\")"`), and `[^"]*` stopped at the first `\"`, so two of the
    // four entries were invisible. THE SAME ESCAPING CLASS AS THE MISS THIS HOME WAS ADDED TO
    // FIX, one level in: the home was added because JSON isn't backticked, and inside it the
    // double-quoted entries were still being skipped. Reader-found.
    for (const m of line.matchAll(/"Bash\(((?:[^"\\]|\\.)*(?:tail|cat)\s(?:[^"\\]|\\.)*(?:system-alerts|cc-discord-inbox|cc-wake)(?:[^"\\]|\\.)*)\)"/g)) {
      out.push({ site: at, cmd: m[1].replace(/\\"/g, '"').replace(/:\*$/, '').trim() });
    }
  });
  return out;
}
const HOMES = [
  [join(ROOT, 'CLAUDE.md'), 'CLAUDE.md'],
  [join(ROOT, '.claude', 'memory', 'MEMORY.md'), 'MEMORY.md'],
  // ⚠️ The permission ALLOWLIST is a fourth site with its own forms, reader-found. It is not an
  // instruction, but it pins what a session may actually run — and one of its forms FIRED.
  [join(ROOT, '.claude', 'settings.local.json'), 'settings.local.json'],
];
// ⛔ THE CONTROL IS PER-HOME, NOT AGGREGATE. The first version required `total >= 5` and PASSED
// while finding ZERO in the allowlist home — the other homes carried it. An aggregate control
// over a heterogeneous population cannot fail for the one member that differs.
let extracted = [];
for (const [p, label] of HOMES) {
  const found = extractCommands(p, label);
  check('M0 extractor found commands in ' + label, found.length > 0 && found.every((f) => f.cmd),
        'found ' + found.length + ' — a home this cannot read contributes SILENCE, which reads as a pass');
  extracted = extracted.concat(found);
}
for (const { site, cmd } of extracted) {
  if (!cmd) { check('M ' + site, false, 'home unreadable'); continue; }
  const r = run(bash(cmd));
  check('M ' + site + ' silent', r.ctx === null, 'FIRED ' + String(r.ctx).slice(0, 50) + ' :: ' + cmd.slice(0, 70));
}
{
  // ⛔ THE ONE HOME THAT CANNOT BE DERIVED: Langston's own CLAUDE.md lives on the Helsinki box,
  // outside this repo, and a test must not depend on SSH. Pinned as a literal AND MARKED AS SUCH,
  // because a literal that is not labelled a literal is the defect this fixture just fixed.
  // Verified verbatim at /home/langston/CLAUDE.md:356 on 2026-09-01; re-verify when it changes.
  const r = run(bash(`ssh deploy@188.245.193.8 'cat /var/log/dawntrader/system-alerts.jsonl 2>/dev/null'`));
  check('M langston/CLAUDE.md:356 silent (PINNED LITERAL — off-repo, not derived)', r.ctx === null,
        'FIRED ' + String(r.ctx).slice(0, 55));
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

// ---------------------------------------------------------------------------
// K. THE FROZEN LIMITS. Langston: STOP HARDENING, no fourth round — a tokenizer is not the exit
// either, because a dependency in an always-run hook buys a new failure class to sharpen a
// warning that never blocks, and a false negative here is the cheapest failure in the batch.
// ⇒ these arms assert CURRENT behaviour, holes included, SO THE NEXT EDIT REOPENS THEM LOUDLY.
// They are not aspirations. If one starts failing, someone changed the elision or the splitter.
// ---------------------------------------------------------------------------
console.log('\n=== K. FROZEN LIMITS — asserting the KNOWN HOLES so an edit reopens them loudly ===');
{
  // K1: stages() is quote-unaware — a quoted `;` splits a stage that should not split.
  const r = run(bash(`grep ';' notes.md -c`));
  check('K1 KNOWN HOLE: a quoted separator defeats locality (silent today)', r.ctx === null,
        'this now FIRES — the splitter changed; re-read the frozen-limits note');
}
{
  // ⛔ K2 — I COULD NOT CONSTRUCT A CASE THAT ISOLATES THE SUBSTITUTION-SPLITTING HOLE with the
  // three shapes that exist, and my first attempt asserted a hole WITHOUT MEASURING whether it
  // was one: `$(grep pattern f | wc -c)` fires, but on `worktree-not-ref`, not because of any
  // splitting. The nearest silent case is silent because `wc -l` is not a matched token at all.
  // ⇒ the hole is STRUCTURAL (stages() splits inside `$( )`) and NOT DEMONSTRABLE today, so it
  // is recorded as such rather than asserted. Both nearest cases are pinned so an edit moves them.
  const a = run(bash('n=$(git grep pattern -- . | wc -l) ; echo $n'));
  check('K2a nearest silent case stays silent (wc -l is not a matched token)', a.ctx === null,
        'moved — re-derive whether the substitution hole is now demonstrable');
  const b = run(bash('n=$(grep pattern f.md | wc -c) && echo "$n"'));
  check('K2b and this fires on worktree-not-ref, NOT on splitting', !!b.ctx && b.ctx.includes('worktree-not-ref'),
        'moved — the reason this fires has changed');
}
{
  // ⛔ K4 — THE PINS THAT MAKE THE `KNOWN GAPS` HEADER TRUE. Its claim is that every listed gap
  // is pinned so an edit reopens or closes it LOUDLY. That was FALSE for two of them until these
  // existed: widening the log exemption and closing the sed gap both left the suite green.
  const widened = run(bash('head -50 /var/data/app.log | wc -l'));
  check('K4a a NON-/var/log truncation still fires (pins the exemption WIDTH)', !!widened.ctx,
        'silent — the exemption has been widened beyond /var/log/');
  const sedcase = run(bash("sed -n '1,50p' /tmp/f.txt | wc -l"));
  check('K4b KNOWN GAP: sed -n truncation is NOT caught (pins the gap)', sedcase.ctx === null,
        'this now FIRES — sed was added to the shape; update KNOWN GAPS 1c');
  const chained = run(bash('ssh h "tail -50 /var/log/dawntrader/system-alerts.jsonl" && git log -100 --grep=MISTAKE'));
  check('K4c an unrelated measurement in the same && chain STILL fires', !!chained.ctx,
        'silent — the exemption is whole-command again, not pipeline-scoped');

  // ⛔⛔ K3 — AND LANGSTON'S OWN EXAMPLE OF THE GAP IS COVERED. He wrote "nothing now catches
  // `tail -200 log | grep -c X`". MEASURED: it FIRES, on `count-from-search`, because the second
  // stage carries `grep -c` regardless of how the first stage truncated. My first version of
  // this arm asserted his example verbatim and failed — I had inherited the claim instead of
  // running it. The REAL gap is narrower and is pinned below.
  const covered = run(bash('tail -200 /var/log/app.log | grep -c ERROR'));
  check('K3a his stated gap example IS caught (by count-from-search)', !!covered.ctx && covered.ctx.includes('count-from-search'));
  const gap1 = run(bash('tail -200 /var/log/app.log | wc -l'));
  check('K3b KNOWN GAP: tail -N into a bare line-count is NOT caught', gap1.ctx === null,
        'this now FIRES — someone re-added tail; re-run the M fixture before keeping it');
  const gap2 = run(bash('tail -200 /var/log/app.log > /tmp/slice.txt'));
  check('K3c KNOWN GAP: tail -N into a file, counted later, is NOT caught', gap2.ctx === null,
        'this now FIRES — check the M fixture');
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
    // ⚠️ KEYED ON AN EXACT SOURCE STRING, so it breaks every time that line is edited — three
    // times so far. That is the DESIGN WORKING: it fails loudly ("patch did not change the
    // source") instead of silently passing and leaving the leg untested. Update it, never
    // loosen it into a regex that might match something else.
    ['remove locality (match whole command)', (s) => s.replace(
      'stages(stripped).some((st) => sh.test(st, sequenceOf(stripped, st)))', 'sh.test(stripped, stripped)')],
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
    // ⛔ ADDED r3, reader-found: KNOWN GAPS claims every gap is pinned so an edit "fails the
    // suite loudly". It was FALSE for two of them — WIDENING the log exemption and CLOSING the
    // sed gap both left the suite green. A gap nothing notices is not pinned, it is described.
    ['WIDEN the log exemption to /var/', (s) => s.replace('!/\\/var\\/log\\//.test(seq)', '!/\\/var\\//.test(seq)')],
    ['CLOSE the sed gap (add sed -n to the shape)', (s) => s.replace(
      "(/\\bhead\\s+-n?\\s*\\d+/.test(st)", "(/\\bsed\\s+-n/.test(st) || /\\bhead\\s+-n?\\s*\\d+/.test(st)")],
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
