#!/usr/bin/env node
// P1d-6 tests (pre-audit section 9.3): slot-check.mjs, the binds resolver, Guard 1 (guard-pm-slot.mjs), Guard 2
// (guard-pm-decisions.mjs + reconcile-decisions.mjs --index). Scratch git repos (mkdtemp) for the git mechanics, crafted
// fixtures for EMPTY and binds, the live repo at a ref for the KD-13/KD-14 replay.
//   node scripts/pm/test-slot-check.mjs        (exit 0 = all PASS)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBinds, buildSections } from './slot-check.mjs';
import { PLAN_LINE } from '../governance-checker/config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SLOT_CHECK = join(HERE, 'slot-check.mjs');
const RECONCILE = join(HERE, 'reconcile-decisions.mjs');
const G1 = join(REPO, '.claude', 'hooks', 'guard-pm-slot.mjs');
const G2 = join(REPO, '.claude', 'hooks', 'guard-pm-decisions.mjs');
const LEDGER = '1-system-manual/pm/DECISIONS.md';
const REC = '1-system-manual/pm/slot-checks/20261105T000000Z_CC-A_fixture.md';

let failed = 0, total = 0;
function check(name, ok, detail = '') { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '\n      ' + String(detail).split('\n').slice(0, 6).join('\n      ') : ''}`); }
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const root = mkdtempSync(join(tmpdir(), 'pm-slot-test-'));
let seq = 0;
const fresh = (label) => { const d = join(root, `${label}-${++seq}`); mkdirSync(d, { recursive: true }); return d; };

// ── 1. THE binds RESOLVER ───────────────────────────────────────────────────────────────────────────────────
const live = readFileSync(join(REPO, LEDGER), 'utf8').split(/\r?\n/);
const hdr = live.find((l) => l.startsWith('| D | date |')).split('|').map((c) => c.trim());
const bindsOf = (kd) => { const r = live.find((l) => l.startsWith(`| ${kd} |`)); return r.split('|').map((c) => c.trim())[hdr.indexOf('binds')]; };
const ALL4 = ['CC-A', 'CC-B', 'CC-C', 'CC-INFRA'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const [kd, want, parties] of [
  ['KD-2', ALL4, []], ['KD-4', ALL4, []], ['KD-18', ['CC-A', 'CC-C'], []], ['KD-26', ['CC-A'], []],
  ['KD-24', ['CC-A'], ['Langston']], ['KD-25', ['CC-A'], []],
]) {
  const r = resolveBinds(bindsOf(kd));
  check(`binds ${kd} "${bindsOf(kd).slice(0, 50)}" -> ${want.join('+')}${parties.length ? ' + ' + parties.join() : ''}`, same(r.sessions, want) && same(r.parties, parties) && !r.unresolved, JSON.stringify(r));
}
{
  const r = resolveBinds('OLD Claude (NEW Claude has the adjacent row)');
  check('binds (B) "OLD Claude (NEW Claude has the adjacent row)" -> CC-A only (kills "ignore other parentheticals" if removed)', same(r.sessions, ['CC-A']), JSON.stringify(r));
  const r2 = resolveBinds('OLD Claude; Infra Claude (released)');
  check('binds (released) excludes: "OLD Claude; Infra Claude (released)" -> CC-A, released CC-INFRA', same(r2.sessions, ['CC-A']) && same(r2.released, ['CC-INFRA']), JSON.stringify(r2));
  const r3 = resolveBinds('PM Claude; the crew');
  check('binds "PM Claude; the crew" -> four coding + CC-PM', same(r3.sessions, [...ALL4, 'CC-PM']), JSON.stringify(r3));
  const r4 = resolveBinds('somebody over there');
  check('binds an unresolvable cell is UNRESOLVED, not dropped', r4.unresolved === true && r4.sessions.length === 0, JSON.stringify(r4));
  const r5 = resolveBinds('Coltrane; PM Codex; Kyle');
  check('binds non-session parties recognised, never UNRESOLVED', same(r5.parties, ['Coltrane', 'PM Codex', 'Kyle']) && !r5.unresolved, JSON.stringify(r5));
}

// ── 2. THE RECORD: replay of the 11-04 miss, DEGRADED/FRESH, EMPTY, UNPARSEABLE ────────────────────────────────
const sc = (args, cwd = REPO) => run(process.execPath, [SLOT_CHECK, ...args], { cwd });
const recPath = (r) => /^record: (.+)$/m.exec(r.stdout)?.[1];
const sectionOf = (text, n) => { const m = new RegExp(`^## ${n}\\..*$([\\s\\S]*?)(?=^## \\d\\.|$(?![\\s\\S]))`, 'm').exec(text); return m ? m[1] : ''; };
{
  const log = run('git', ['log', '--reverse', '--format=%H', '--', LEDGER], { cwd: REPO }).stdout.split(/\r?\n/).filter(Boolean);
  const has = (sha) => { const t = run('git', ['show', `${sha}:${LEDGER}`], { cwd: REPO }).stdout; return t.includes('| KD-13 |') && t.includes('| KD-14 |'); };
  const first = log.find(has);
  check('replay: found the commit that first carries KD-13 and KD-14', !!first, `ledger commits: ${log.length}`);
  if (first) {
    const parent = run('git', ['rev-parse', `${first}^`], { cwd: REPO }).stdout.trim();
    const out = fresh('replay'), out2 = fresh('replay');
    const a = sc(['--owner', 'CC-A', '--item', 'rows 18-19 after B-CLOSE-WRITER-COSTS', '--ref', first, '--no-fetch', '--out-dir', out]);
    const b = sc(['--owner', 'CC-A', '--item', 'rows 18-19 after B-CLOSE-WRITER-COSTS', '--ref', parent, '--no-fetch', '--out-dir', out2]);
    const ta = a.status === 0 && recPath(a) ? readFileSync(recPath(a), 'utf8') : '', tb = b.status === 0 && recPath(b) ? readFileSync(recPath(b), 'utf8') : '';
    const da = sectionOf(ta, 4), db = sectionOf(tb, 4);
    check(`replay at ${first.slice(0, 9)} (KD-13/14 present): decisions section lists KD-13 and KD-14 for CC-A`, /- KD-13 /.test(da) && /- KD-14 /.test(da), a.stderr + da.slice(0, 300));
    check(`replay at ${parent.slice(0, 9)} (before them): they are NOT listed (discriminates)`, tb !== '' && !/- KD-13 /.test(db) && !/- KD-14 /.test(db), b.stderr + db.slice(0, 300));
    check('replay records carry the ref sha in the header', ta.includes(`- ref-sha: ${first}`) && tb.includes(`- ref-sha: ${parent}`));
    check('replay with --no-fetch is stamped DEGRADED (a read not proven fresh)', /^- freshness: DEGRADED/m.test(ta));
  }
  const out = fresh('cc-b');
  const r = sc(['--owner', 'CC-B', '--item', 'unparseable control', '--ref', 'HEAD', '--no-fetch', '--out-dir', out]);
  const t = r.status === 0 && recPath(r) ? readFileSync(recPath(r), 'utf8') : '';
  check("CC_B's task list is emitted verbatim as task-list: UNPARSEABLE (<header row>)", t.includes('task-list: UNPARSEABLE (| batch | step | waiting on |)') && t.includes('| batch | step | waiting on |'), r.stderr + t.slice(0, 200));
  const rc = sc(['--owner', 'CC-A', '--item', 'parsed control', '--ref', 'HEAD', '--no-fetch', '--out-dir', out]);
  const tc = rc.status === 0 && recPath(rc) ? readFileSync(recPath(rc), 'utf8') : '';
  check("CC_A's section-00 table is parsed (no UNPARSEABLE line)", tc.includes('## 3. Task list (parsed') && !tc.includes('task-list: UNPARSEABLE'), rc.stderr);
}
{
  // EMPTY owner: a FIXTURE plan and ledger (every live owner has open rows)
  const plan = [
    '## 0a. Pre-sprint', '', PLAN_LINE.s0aHeader, '|---|---|---|---|---|---|---|---|---|',
    '| 00 | 1 | B-FIX-BEE | NEW Claude | none | #1 | Kyle | QUEUED | nothing |', '',
    '## 4. Plan', '', PLAN_LINE.s4Header, '|---|---|---|---|---|---|---|',
    '| 1 | a thing | B-FIX-BEE | CC-B (New Claude) | QUEUED | x | y |', '',
    '## 5. Running', '', PLAN_LINE.s5Header, '|---|---|---|---|', '',
  ].join('\n');
  const ledger = ['| D | date | decision | Kyle\'s words / source | binds | anchors | status | evidence | kind |', '|---|---|---|---|---|---|---|---|---|',
    '| KD-1 | 2026-11-04 | thing | w | NEW Claude | none | RELAYED | e | pre-guard |'].join('\n');
  const task = ['## 00. CURRENT ORDER', '', '| # | item | status | decision |', '|---|---|---|---|'].join('\n');
  const { body } = buildSections('CC-A', { planText: plan, ledgerText: ledger, taskText: task }, Date.parse('2026-11-05T12:00:00Z'));
  const empties = [1, 2, 3, 4, 5].map((n) => /EMPTY/.test(sectionOf(body, n)));
  check('owner with nothing open: every one of the five sections prints EMPTY (fixture plan, ledger, task list)', empties.every(Boolean), `${empties}\n${body}`);
  const other = buildSections('CC-B', { planText: plan, ledgerText: ledger, taskText: task }, Date.parse('2026-11-05T12:00:00Z')).body;
  check('control: the same fixture lists the row for its real owner (not blank by accident)', /B-FIX-BEE/.test(sectionOf(other, 1)) && /KD-1 /.test(sectionOf(other, 4)));
  const unread = buildSections('CC-A', { planText: { error: 'boom' }, ledgerText: ledger, taskText: task }, 0);
  check('an unreadable plan REFUSES (UNREADABLE), it is not printed as EMPTY', /UNREADABLE/.test(sectionOf(unread.body, 1)) && !/EMPTY/.test(sectionOf(unread.body, 1)) && unread.reasons.length > 0);
}
{
  // FRESH and DEGRADED against a scratch origin
  const base = fresh('origin');
  const sh = (cwd, ...a) => { const r = run('git', a, { cwd }); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };
  sh(base, 'init', '--bare', '-b', 'main', 'origin.git');
  sh(base, 'clone', '-q', 'origin.git', 'work');
  const w = join(base, 'work');
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) sh(w, 'config', k, v);
  mkdirSync(join(w, '1-system-manual', 'pm'), { recursive: true });
  const plan = ['## 0a. Pre-sprint', '', PLAN_LINE.s0aHeader, '|---|---|---|---|---|---|---|---|---|', '',
    '## 4. Plan', '', PLAN_LINE.s4Header, '|---|---|---|---|---|---|---|', '| 1 | a thing | B-FIX-ONE | CC-A (Old Claude) | QUEUED | x | y |', '',
    '## 5. Running', '', PLAN_LINE.s5Header, '|---|---|---|---|', ''].join('\n');
  writeFileSync(join(w, '1-system-manual', 'SPRINT_TO_LIVE_PLAN.md'), plan);
  writeFileSync(join(w, LEDGER), ['| D | date | decision | Kyle\'s words / source | binds | anchors | status | evidence | kind |', '|---|---|---|---|---|---|---|---|---|', '| KD-1 | 2026-11-04 | x | w | OLD Claude | none | RELAYED | e | pre-guard |', ''].join('\n'));
  writeFileSync(join(w, '1-system-manual', 'CC_A_SESSION_TASK_LIST.md'), '## 00. ORDER\n\n| # | item | status | decision |\n|---|---|---|---|\n| 1 | `B-FIX-ONE` | QUEUED | KD-1 |\n');
  sh(w, 'add', '-A'); sh(w, 'commit', '-q', '-m', 'c1'); sh(w, 'push', '-q', 'origin', 'main');
  const c1 = sh(w, 'rev-parse', 'HEAD');
  const out = fresh('fd');
  const a = sc(['--owner', 'CC-A', '--item', 'x', '--ref', 'origin/main', '--origin-ref', 'origin/main', '--out-dir', out], w);
  const ta = readFileSync(recPath(a), 'utf8');
  check('ref equal to origin head after the fetch is stamped FRESH, with both shas in the header', /^- freshness: FRESH/m.test(ta) && ta.includes(`- ref-sha: ${c1}`) && ta.includes(`- origin-head: ${c1}`), a.stderr + ta.slice(0, 400));
  check('the fixture owner row is listed (plan, pre-sprint, task list, decision, no disagreement)', /B-FIX-ONE/.test(sectionOf(ta, 1)) && /KD-1 /.test(sectionOf(ta, 4)) && /B-FIX-ONE/.test(sectionOf(ta, 3)), ta);
  writeFileSync(join(w, 'x.txt'), 'x'); sh(w, 'add', '-A'); sh(w, 'commit', '-q', '-m', 'c2'); sh(w, 'push', '-q', 'origin', 'main');
  const b = sc(['--owner', 'CC-A', '--item', 'x', '--ref', c1, '--origin-ref', 'origin/main', '--out-dir', out], w);
  const tb = readFileSync(recPath(b), 'utf8');
  check('a ref behind origin head is stamped DEGRADED (not at or ahead of origin head)', /^- freshness: DEGRADED/m.test(tb) && /not at or ahead of origin head/.test(tb), tb.slice(0, 500));
}

// ── 3. GUARD 1 ───────────────────────────────────────────────────────────────────────────────────────────────
const g1env = (over = {}) => { const d = fresh('g1'); return { dir: d, recs: join(d, 'recs'), miss: join(d, 'miss.log'), probe: join(d, 'probe.log'), proj: join(d, 'DawnTraderV3-pm'), ...over }; };
function hook(file, payload, env, raw) {
  return run(process.execPath, [file], { input: raw ?? JSON.stringify(payload), env: { ...process.env, ...env } });
}
const wrap = (ask, recap = '') => ({ tool_name: 'mcp__ccd_turn__wrap_up', tool_input: { ask, recap } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const SLOTQ = 'Should OLD Claude own rows 18 and 19, slotted straight after B-CLOSE-WRITER-COSTS?';
const writeRec = (dir, alias, { fresh: f = 'FRESH', ageH = 0, genAgeH = null } = {}) => {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `20261105T000000Z_${alias}_x.md`);
  const gen = genAgeH === null ? '' : `- generated: ${new Date(Date.now() - genAgeH * 3600e3).toISOString()}\n`;
  writeFileSync(p, `# PM slot check\n\n- ref-sha: abc1234\n- freshness: ${f}\n- owner: ${alias}\n- item: x\n${gen}`);
  if (ageH) { const t = new Date(Date.now() - ageH * 3600e3); utimesSync(p, t, t); }
  return p;
};
{
  const e = g1env(); mkdirSync(e.proj, { recursive: true });
  const env = { CLAUDE_PROJECT_DIR: e.proj, PM_SLOT_RECORD_DIR: e.recs, PM_SLOT_MISS_LOG: e.miss, PM_SLOT_PROBE_LOG: e.probe };
  let r = hook(G1, wrap(SLOTQ, 'recap'), env);
  check('Guard 1 refuses a slotting question naming OLD Claude with no record (exit 2, names the exact command)', r.status === 2 && /node scripts\/pm\/slot-check\.mjs --owner CC-A --item "/.test(r.stderr), `${r.status} ${r.stderr}`);
  r = hook(G1, bash(`ssh root@x 'cc-send --sender "PM Claude" --message "OLD Claude: you own rows 18-19, slotted after row 72"'`), env);
  check('Guard 1 refuses the same on a PM Discord order (cc-send --sender "PM Claude")', r.status === 2 && /--owner CC-A/.test(r.stderr), `${r.status} ${r.stderr}`);
  r = hook(G1, bash(`ssh root@x 'cc-send --sender "OLD Claude" --message "OLD Claude: you own rows 18-19, slotted after row 72"'`), env);
  check('Guard 1 ignores cc-send under another sender (not PM)', r.status === 0, `${r.status} ${r.stderr}`);
  // Langston Step-4 r4 items 1-2: the posted TEXT is judged, not the command around it.
  r = hook(G1, bash(`scp ~/x/pm-slot-probe.log root@x:/tmp/a && ssh root@x 'cc-send --sender "PM Claude" --message "OLD Claude, thanks for the update"'`), env);
  check('r4: a "slot" in a file PATH no longer makes a plain thank-you a slotting order (message text judged)', r.status === 0, `${r.status} ${r.stderr}`);
  r = hook(G1, bash(`scp ~/x/pm-slot-probe.log root@x:/tmp/a && ssh root@x 'cc-send --sender "PM Claude" --message "OLD Claude, you own row 19, slotted after row 72"'`), env);
  check('r4 control: the same command with slotting words in the MESSAGE is still refused', r.status === 2 && /--owner CC-A/.test(r.stderr), `${r.status} ${r.stderr}`);
  const body = join(e.dir, 'body.txt'); writeFileSync(body, 'OLD Claude: you own row 19, slotted after row 72');
  const bodyF = body.replace(/\\/g, '/');
  r = hook(G1, bash(`scp ${bodyF} root@x:/tmp/m.txt && ssh root@x 'cc-send --sender "PM Claude" --message "$(cat /tmp/m.txt)"'`), env);
  check('r4: a $(cat REMOTE) body is resolved to the scp LOCAL file and judged (slotting body refused)', r.status === 2 && /--owner CC-A/.test(r.stderr), `${r.status} ${r.stderr}`);
  const benign = join(e.dir, 'benign.txt'); writeFileSync(benign, 'OLD Claude, thanks, noted.');
  r = hook(G1, bash(`scp ${benign.replace(/\\/g, '/')} root@x:/tmp/n.txt && ssh root@x 'cc-send --sender "PM Claude" --message "$(cat /tmp/n.txt)"'`), env);
  check('r4 control: a benign $(cat) body is allowed (proves the file, not the command, was judged)', r.status === 0, `${r.status} ${r.stderr}`);
  r = hook(G1, bash(`ssh root@x 'cc-send --sender "PM Claude" --message "$(cat /tmp/nope-zz)"' # OLD Claude slotted after row 72`), env);
  check('r4: an UNRESOLVABLE $(cat) falls back to the whole command, so it is still checked (refused here)', r.status === 2, `${r.status} ${r.stderr}`);
  // Langston r4 CHANGES C-1..C-3
  r = hook(G1, bash(`ssh root@x 'cc-send --sender "PM Claude" --message "Kyle said \\"go\\" today so OLD Claude owns row 59g, slotted after 2" --channel general'`), env);
  check('r5 C-1: an escaped inner quote no longer truncates the body (slotting after the quote is refused)', r.status === 2 && /--owner CC-A/.test(r.stderr), `${r.status} ${r.stderr}`);
  r = hook(G1, bash(`ssh root@x 'cc-send --sender "PM Claude" --message "$(</root/pm-stage/b.md)"' # OLD Claude slotted after row 72`), env);
  check('r5 C-2: a $(<file) body is unresolved and falls back to the whole command (refused here)', r.status === 2, `${r.status} ${r.stderr}`);
  r = hook(G1, bash('ssh root@x \'cc-send --sender "PM Claude" --message "$BODY"\' # OLD Claude slotted after row 72'), env);
  check('r5 C-2: a $VAR body falls back to the whole command too (refused here)', r.status === 2, `${r.status} ${r.stderr}`);
  // Langston r5 CHANGES: file bytes are not scanned as shell; a separator straight after the closing quote is accepted
  const tick = join(e.dir, 'tick.md'); writeFileSync(tick, 'OLD Claude — `B-FOO` is slotted after row 3a1');
  r = hook(G1, bash(`scp ${tick.replace(/\\/g, '/')} root@x:/root/pm-stage/t.md && ssh root@x 'cc-send --sender "PM Claude" --message "$(cat /root/pm-stage/t.md)"'`), env);
  check('r6 C-2: a $(cat) body containing a backtick is still judged (slotting refused, not passed via fallback)', r.status === 2 && /--owner CC-A/.test(r.stderr), `${r.status} ${r.stderr}`);
  const dol = join(e.dir, 'dol.md'); writeFileSync(dol, 'OLD Claude owns row 19, slotted after $EV row 72');
  r = hook(G1, bash(`scp ${dol.replace(/\\/g, '/')} root@x:/root/pm-stage/d.md && ssh root@x 'cc-send --sender "PM Claude" --message "$(cat /root/pm-stage/d.md)"'`), env);
  check('r6 C-2: a $(cat) body containing a bare $WORD is still judged (slotting refused)', r.status === 2 && /--owner CC-A/.test(r.stderr), `${r.status} ${r.stderr}`);
  r = hook(G1, bash(`scp ~/x/pm-slot-probe.log root@x:/tmp/a && ssh root@x 'cc-send --sender "PM Claude" --message "OLD Claude, thanks for the update";echo done'`), env);
  check('r6 record item: a closing quote followed straight by ; is parsed (benign body allowed, not whole-command fallback)', r.status === 0, `${r.status} ${r.stderr}`);
  const srcLines = readFileSync(e.probe, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.kind === 'source');
  check('r5 C-3: every PM cc-send logs how its text was obtained (inline, cat-resolved and fallback-cmd all present)',
    ['inline', 'cat-resolved', 'fallback-cmd'].every((h) => srcLines.some((x) => x.how === h)), JSON.stringify(srcLines.map((x) => x.how)));
  writeRec(e.recs, 'CC-A');
  r = hook(G1, wrap(SLOTQ), env);
  check('Guard 1 allows it with a FRESH record for that owner', r.status === 0, `${r.status} ${r.stderr}`);
  r = hook(G1, wrap('Should NEW Claude own #1242, slotted after row 5?'), env);
  check('Guard 1 still refuses when the named owner is a different one (CC-B has no record)', r.status === 2 && /--owner CC-B/.test(r.stderr), `${r.status} ${r.stderr}`);
  r = hook(G1, wrap('Tests are green and the deploy finished. Nothing pending for any session.'), env);
  check('Guard 1 allows non-slotting text (negative control)', r.status === 0, `${r.status} ${r.stderr}`);
  r = hook(G1, wrap('Should we slot this after row 5?'), env);
  check('Guard 1 allows slotting wording that names no session', r.status === 0);
  const e2 = g1env(); mkdirSync(e2.proj, { recursive: true });
  const env2 = { ...env, PM_SLOT_RECORD_DIR: e2.recs, PM_SLOT_MISS_LOG: e2.miss };
  writeRec(e2.recs, 'CC-A', { ageH: 7 });
  check('Guard 1 refuses a record older than 6 hours', hook(G1, wrap(SLOTQ), env2).status === 2);
  // Langston Step-4 C3: age comes from the record's own generated header; mtime is only the fallback.
  const eGen7 = g1env(); mkdirSync(eGen7.proj, { recursive: true });
  writeRec(eGen7.recs, 'CC-A', { genAgeH: 7 }); // file mtime is now, header says 7 h old
  check('Guard 1 refuses a record whose generated header is 7 h old although its mtime is fresh (C3)', hook(G1, wrap(SLOTQ), { ...env, PM_SLOT_RECORD_DIR: eGen7.recs, PM_SLOT_MISS_LOG: eGen7.miss }).status === 2);
  const eGen1 = g1env(); mkdirSync(eGen1.proj, { recursive: true });
  writeRec(eGen1.recs, 'CC-A', { genAgeH: 1, ageH: 9 }); // header 1 h old, mtime 9 h old (a checkout rewrote it)
  check('Guard 1 allows a record whose generated header is 1 h old although its mtime is 9 h old (C3)', hook(G1, wrap(SLOTQ), { ...env, PM_SLOT_RECORD_DIR: eGen1.recs, PM_SLOT_MISS_LOG: eGen1.miss }).status === 0);
  // Langston Step-4 call 3: a bare "infra" no longer names CC-INFRA.
  check('Guard 1 treats a bare "infra" as no session (only Infra Claude / CC-INFRA bind)', hook(G1, wrap('The token-watch infra owns the storage queue now.'), env).status === 0);
  check('Guard 1 still binds "Infra Claude"', /--owner CC-INFRA/.test(hook(G1, wrap('Should Infra Claude own the birth-gap batch, slotted after #1241?'), env).stderr));
  const e3 = g1env(); mkdirSync(e3.proj, { recursive: true });
  writeRec(e3.recs, 'CC-A', { fresh: 'DEGRADED' });
  check('Guard 1 refuses a DEGRADED record (treated as absent)', hook(G1, wrap(SLOTQ), { ...env, PM_SLOT_RECORD_DIR: e3.recs, PM_SLOT_MISS_LOG: e3.miss }).status === 2);
  // hook fault: the record dir is a regular file -> ENOTDIR -> allow + miss-log line
  const e4 = g1env(); mkdirSync(e4.proj, { recursive: true }); writeFileSync(join(e4.dir, 'afile'), 'x');
  r = hook(G1, wrap(SLOTQ), { ...env, PM_SLOT_RECORD_DIR: join(e4.dir, 'afile'), PM_SLOT_MISS_LOG: e4.miss });
  check('Guard 1 allows on its own fault (exit 0) and writes a miss-log line', r.status === 0 && existsSync(e4.miss) && /fault/.test(readFileSync(e4.miss, 'utf8')), `${r.status} ${r.stderr}`);
  r = hook(G1, null, env, '{not json');
  check('Guard 1 allows an unparseable payload', r.status === 0);
  // scoping
  const e5 = g1env(); const old = join(e5.dir, 'DawnTraderV3-old'); mkdirSync(old, { recursive: true });
  r = hook(G1, wrap(SLOTQ), { ...env, CLAUDE_PROJECT_DIR: old, PM_SLOT_RECORD_DIR: e5.recs, PM_SLOT_MISS_LOG: e5.miss, PM_SLOT_PROBE_LOG: e5.probe });
  check('scoping: a mapped non-PM clone exits 0 silently (no stderr, no miss-log line)', r.status === 0 && r.stderr === '' && !existsSync(e5.miss), `${r.status} ${r.stderr}`);
  const e6 = g1env(); const unm = join(e6.dir, 'SomethingElse'); mkdirSync(unm, { recursive: true });
  r = hook(G1, wrap(SLOTQ), { ...env, CLAUDE_PROJECT_DIR: unm, PM_SLOT_RECORD_DIR: e6.recs, PM_SLOT_MISS_LOG: e6.miss, PM_SLOT_PROBE_LOG: e6.probe });
  check('scoping: an UNMAPPED directory exits 0 AND writes a miss-log line', r.status === 0 && existsSync(e6.miss) && /unmapped/.test(readFileSync(e6.miss, 'utf8')), `${r.status} ${r.stderr}`);
  r = hook(G1, wrap(SLOTQ), { ...env, CLAUDE_PROJECT_DIR: '', PM_SLOT_MISS_LOG: e6.miss + '2' });
  check('scoping: an UNREADABLE (empty) project dir exits 0 AND writes a miss-log line', r.status === 0 && existsSync(e6.miss + '2') && /unreadable/.test(readFileSync(e6.miss + '2', 'utf8')));
  const probe = existsSync(e.probe) ? readFileSync(e.probe, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  check('probe: each invocation logs tool_name and the basename of the project dir (control: Bash line, plus the wrap_up line)',
    probe.some((p) => p.tool_name === 'Bash' && p.project === 'DawnTraderV3-pm') && probe.some((p) => p.tool_name === 'mcp__ccd_turn__wrap_up' && p.project === 'DawnTraderV3-pm' && p.ask), JSON.stringify(probe.slice(0, 2)));
}

// ── 4. GUARD 2 + reconcile --index, in scratch repos ─────────────────────────────────────────────────────────
const HDR = "| D | date | decision | Kyle's words / source | binds | anchors | status | evidence | kind |";
const SEP = '|---|---|---|---|---|---|---|---|---|';
const row = (n, kind, ev = 'e') => `| KD-${n} | 2026-11-05 | a decision | w | OLD Claude | none — fixture | RELAYED | ${ev} | ${kind} |`;
const ledgerText = (...rows) => ['# fixture ledger', '', HDR, SEP, ...rows, ''].join('\n');
const gitIn = (cwd, ...a) => { const r = run('git', a, { cwd }); if (r.status !== 0) throw new Error(`git ${a.join(' ')} -> ${r.status}: ${r.stderr}`); return r.stdout.trim(); };
function mkRepo(name = 'DawnTraderV3-pm') {
  const d = join(fresh('g2'), name); mkdirSync(d, { recursive: true });
  gitIn(d, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.email', 't@t'], ['user.name', 't'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) gitIn(d, 'config', k, v);
  return d;
}
const put = (d, rel, text) => { const p = join(d, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };
const recText = (sha, fresh = 'FRESH') => `# PM slot check — CC-A\n\n- ref: x\n- ref-sha: ${sha}\n- origin-head: ${sha}\n- freshness: ${fresh}\n- owner: CC-A\n- item: fixture\n`;
const g2 = (d, command, ref, missLog = join(d, '..', 'miss.log')) => hook(G2, bash(command), { CLAUDE_PROJECT_DIR: d, PM_RECONCILE_REF: ref ?? '', PM_SLOT_MISS_LOG: missLog });
const cit = `slot-check: ${REC}`;

{
  // base commit: a valid ledger with one pre-guard row
  const d = mkRepo();
  put(d, 'README.md', 'x'); put(d, LEDGER, ledgerText(row(1, 'pre-guard')));
  gitIn(d, 'add', '-A'); gitIn(d, 'commit', '-q', '-m', 'base');
  const base = gitIn(d, 'rev-parse', 'HEAD');

  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'placement')));
  gitIn(d, 'add', LEDGER);
  let r = g2(d, 'git commit -m "x"', base);
  check('Guard 2: an uncited placement row is refused', r.status === 2 && /PLACEMENT: KD-29/.test(r.stderr), `${r.status} ${r.stderr}`);
  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'placement', 'no-slot-check: fixture reason')));
  r = g2(d, 'git commit -m "x"', base);
  check('Guard 2: reads the STAGED blob, not the working tree (working tree now carries no-slot-check, index does not)', r.status === 2, `${r.status} ${r.stderr}`);
  r = g2(d, 'git commit --amend --no-edit', base);
  check('Guard 2: an --amend carrying an uncited placement row is refused', r.status === 2, `${r.status} ${r.stderr}`);
  r = g2(d, 'CC_COMMIT_ATTESTED=1 git commit -m "x"', base);
  check('Guard 2: an attested commit carrying an uncited placement row is refused', r.status === 2, `${r.status} ${r.stderr}`);
  r = hook(G2, bash('git status'), { CLAUDE_PROJECT_DIR: d, PM_RECONCILE_REF: base, PM_SLOT_MISS_LOG: join(d, '..', 'm') });
  check('Guard 2: a command that is not a git commit is ignored', r.status === 0);

  // cited, the record committed in the same commit (resolves from the index; REF is the base, which lacks the record)
  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'placement', cit)));
  put(d, REC, recText(base)); gitIn(d, 'add', LEDGER, REC);
  r = g2(d, 'git commit -m "x"', base);
  check('Guard 2: a cited placement row passes, the record resolving from the INDEX (not yet at the ref)', r.status === 0, `${r.status} ${r.stderr}`);
  put(d, REC, recText(base, 'DEGRADED')); gitIn(d, 'add', REC);
  r = g2(d, 'git commit -m "x"', base);
  check('Guard 2: a record citing a DEGRADED slot check fails', r.status === 2 && /not FRESH|DEGRADED/.test(r.stderr), `${r.status} ${r.stderr}`);
  put(d, REC, recText(base)); gitIn(d, 'add', REC);

  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'other')));
  gitIn(d, 'add', LEDGER); gitIn(d, 'rm', '--cached', '-q', '--ignore-unmatch', REC);
  r = g2(d, 'git commit -m "x"', base);
  check('Guard 2: an `other` row passes', r.status === 0, `${r.status} ${r.stderr}`);
  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(30, 'pre-guard')));
  gitIn(d, 'add', LEDGER);
  r = g2(d, 'git commit -m "x"', base);
  check('Guard 2: a NEW row cannot claim pre-guard', r.status === 2 && /pre-guard/.test(r.stderr), `${r.status} ${r.stderr}`);
  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(31, '')));
  gitIn(d, 'add', LEDGER);
  r = g2(d, 'git commit -m "x"', base);
  check('Guard 2: a row with an empty kind cell is refused', r.status === 2, `${r.status} ${r.stderr}`);

  // non-ancestor sha
  gitIn(d, 'checkout', '-q', '-b', 'side'); put(d, 'side.txt', 's'); gitIn(d, 'add', 'side.txt'); gitIn(d, 'commit', '-q', '-m', 'side');
  const side = gitIn(d, 'rev-parse', 'HEAD'); gitIn(d, 'checkout', '-q', 'main');
  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'placement', cit))); put(d, REC, recText(side));
  gitIn(d, 'add', LEDGER, REC);
  r = g2(d, 'git commit -m "x"', base);
  check('Guard 2: a record whose header sha is not an ancestor of the ref fails', r.status === 2 && /not an ancestor/.test(r.stderr), `${r.status} ${r.stderr}`);

  // scoping on the same violating index
  gitIn(d, 'add', LEDGER); put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(32, 'placement'))); gitIn(d, 'add', LEDGER);
  const oldDir = join(fresh('nonpm'), 'DawnTraderV3-old');
  mkdirSync(oldDir, { recursive: true });
  const ml = join(d, '..', 'scope-miss.log');
  r = hook(G2, bash('git commit -m x'), { CLAUDE_PROJECT_DIR: oldDir, PM_RECONCILE_REF: base, PM_SLOT_MISS_LOG: ml });
  check('Guard 2 scoping: a mapped non-PM clone exits 0 silently', r.status === 0 && r.stderr === '' && !existsSync(ml));
  const unm = join(fresh('unm'), 'Elsewhere'); mkdirSync(unm, { recursive: true });
  r = hook(G2, bash('git commit -m x'), { CLAUDE_PROJECT_DIR: unm, PM_RECONCILE_REF: base, PM_SLOT_MISS_LOG: ml });
  check('Guard 2 scoping: an unmapped directory exits 0 and writes a miss-log line', r.status === 0 && existsSync(ml) && /unmapped/.test(readFileSync(ml, 'utf8')));
  const rr = run(process.execPath, [RECONCILE, '--index', `--ref=${base}`], { cwd: d, env: { ...process.env, PM_SLOT_MISS_LOG: ml } });
  check('reconcile prints the miss-log lines (the named reader)', /miss log/.test(rr.stdout) && /unmapped/.test(rr.stdout), rr.stdout);
}
{
  // (i) DECISIONS.md already in HEAD with an uncited placement row; only another file staged; amend -> refused
  const d = mkRepo();
  put(d, 'README.md', 'x'); put(d, LEDGER, ledgerText(row(1, 'pre-guard'))); gitIn(d, 'add', '-A'); gitIn(d, 'commit', '-q', '-m', 'base');
  const base = gitIn(d, 'rev-parse', 'HEAD');
  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'placement'))); gitIn(d, 'add', LEDGER); gitIn(d, 'commit', '-q', '-m', 'row, committed around the hook');
  put(d, 'other.txt', 'o'); gitIn(d, 'add', 'other.txt');
  const cachedOnly = gitIn(d, 'diff', '--cached', '--name-only');
  check('amend case (i) setup: `--cached` alone does NOT show DECISIONS.md (a --cached-only trigger would stay silent here)', cachedOnly === 'other.txt', cachedOnly);
  let r = g2(d, 'git commit --amend --no-edit', base);
  check('amend case (i): DECISIONS.md already in HEAD, only another file staged, `git commit --amend` -> refused', r.status === 2 && /PLACEMENT: KD-29/.test(r.stderr), `${r.status} ${r.stderr}`);
  r = g2(d, 'git commit --ame --no-edit', base);
  check('amend case (i) spelled `--ame` (git abbreviation) -> refused (no parsing of --amend)', r.status === 2, `${r.status} ${r.stderr}`);
}
{
  // (ii) a placement row committed with its record, then `git rm --cached <record>` + amend, REF pinned BEFORE the row commit
  const mk = () => {
    const d = mkRepo();
    put(d, 'README.md', 'x'); put(d, LEDGER, ledgerText(row(1, 'pre-guard'))); gitIn(d, 'add', '-A'); gitIn(d, 'commit', '-q', '-m', 'base');
    const base = gitIn(d, 'rev-parse', 'HEAD');
    put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'placement', cit))); put(d, REC, recText(base));
    gitIn(d, 'add', LEDGER, REC); gitIn(d, 'commit', '-q', '-m', 'row + record');
    return { d, base, c1: gitIn(d, 'rev-parse', 'HEAD') };
  };
  let { d, base, c1 } = mk();
  gitIn(d, 'rm', '--cached', '-q', REC);
  const still = existsSync(join(d, REC));
  let r = g2(d, 'git commit --amend --no-edit', base);
  check('amend case (ii) (A): `git rm --cached <record>` + amend, REF pinned before the row commit -> refused, the REF leg missing (record NOT FOUND, not "no commit")',
    r.status === 2 && /cited record .*NOT FOUND/.test(r.stderr), `${r.status} ${r.stderr}`);
  check('amend case (ii): refused even though the removed record is still in the working tree (C5-B1)', still === true && r.status === 2);
  r = g2(d, 'git commit --ame --no-edit', base);
  check('amend case (ii) spelled `--ame` -> refused', r.status === 2, `${r.status} ${r.stderr}`);
  r = g2(d, 'git commit --amend --no-edit', c1);
  check('control: the same state with REF = the row commit (which holds the record) resolves via the REF leg -> passes', r.status === 0, `${r.status} ${r.stderr}`);
  ({ d, base } = mk());
  r = g2(d, 'git commit --amend --no-edit', base);
  check('control: record still staged (index leg), REF pinned before the row commit -> passes', r.status === 0, `${r.status} ${r.stderr}`);
}
{
  // root commit + no HEAD: HEAD^ fails (exit 128) -> the whole index is the trigger set, never the fault exit
  const d = mkRepo();
  put(d, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'placement'))); gitIn(d, 'add', '-A'); gitIn(d, 'commit', '-q', '-m', 'root');
  put(d, 'other.txt', 'o'); gitIn(d, 'add', 'other.txt');
  const head = run('git', ['diff', '--cached', '--name-only', 'HEAD^'], { cwd: d });
  const ml = join(d, '..', 'root-miss.log');
  let r = g2(d, 'git commit --amend --no-edit', 'HEAD', ml);
  check('root-commit amend: `git diff --cached HEAD^` fails (128), the index fallback makes the whole index the trigger set -> refused, not a fault exit',
    head.status === 128 && r.status === 2 && /whole index/.test(r.stderr) && !existsSync(ml), `${head.status} ${r.status} ${r.stderr}`);
  const e = mkRepo();
  put(e, LEDGER, ledgerText(row(1, 'pre-guard'), row(29, 'placement'))); gitIn(e, 'add', LEDGER);
  r = g2(e, 'git commit -m first', 'HEAD', join(e, '..', 'nohead-miss.log'));
  check('no HEAD at all (first commit): the whole index is the trigger set -> an uncited placement row is refused', r.status === 2 && /PLACEMENT: KD-29/.test(r.stderr), `${r.status} ${r.stderr}`);
  const f = mkRepo();
  put(f, LEDGER, ledgerText(row(1, 'pre-guard'))); put(f, 'a.txt', 'a'); gitIn(f, 'add', '-A'); gitIn(f, 'commit', '-q', '-m', 'c0');
  put(f, 'a.txt', 'b'); gitIn(f, 'add', 'a.txt'); gitIn(f, 'commit', '-q', '-m', 'c1');
  put(f, 'z.txt', 'z'); gitIn(f, 'add', 'z.txt');
  r = g2(f, 'git commit -m x', 'HEAD');
  check('a commit whose trigger set lacks DECISIONS.md is left alone (exit 0)', r.status === 0, `${r.status} ${r.stderr}`);
}
{
  const t = readFileSync(join(REPO, '.claude', 'skills', 'pm-slotting', 'SKILL.md'), 'utf8');
  const desc = /^description:\s*(.*)$/m.exec(t)?.[1] ?? '';
  check('pm-slotting SKILL.md: description leads with "PM SLOTTING ONLY", states what it is NOT for, and has no colon-space', desc.startsWith('PM SLOTTING ONLY') && /NOT for/.test(desc) && !desc.includes(': '), desc);
}

{ // Langston Step-4 C2: the probe log has a named reader (reconcile prints its count and the wrap_up lines)
  // Langston Step-4 condition 1: the fixture is written by the PRODUCER (Guard 1 itself), never by a copy of its format.
  const e = g1env(); mkdirSync(e.proj, { recursive: true });
  const env = { CLAUDE_PROJECT_DIR: e.proj, PM_SLOT_RECORD_DIR: e.recs, PM_SLOT_MISS_LOG: e.miss, PM_SLOT_PROBE_LOG: e.probe };
  hook(G1, bash('git status'), env);                                   // invocation, Bash arm
  hook(G1, wrap('Tests are green; nothing pending.'), env);             // invocation, wrap_up arm, not slotting
  const refused = hook(G1, wrap(SLOTQ), env);                          // invocation + verdict refuse (no record)
  writeRec(e.recs, 'CC-A');
  hook(G1, wrap(SLOTQ), env);                                          // invocation + verdict allow
  check('Guard 1 refusal path ran for the verdict fixture', refused.status === 2, `${refused.status}`);
  const lines = readFileSync(e.probe, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const vs = lines.filter((o) => o.kind === 'verdict');
  check('Guard 1 persists its verdicts: one refuse and one allow, each with owners, the matched word and the text (condition 2)',
    vs.length === 2 && vs[0].verdict === 'refuse' && vs[1].verdict === 'allow' && vs[0].owners.includes('CC-A') && vs[0].missing.includes('CC-A') && !!vs[0].matched && /OLD Claude/.test(vs[0].text), JSON.stringify(vs));
  const r = run(process.execPath, [RECONCILE, '--ref=HEAD'], { cwd: REPO, env: { ...process.env, PM_SLOT_PROBE_LOG: e.probe, PM_SLOT_MISS_LOG: join(e.dir, 'none.log') } });
  check('reconcile reads the producer-written probe log: 4 invocations, 3 from wrap_up, 2 verdicts (1 refuse, 1 allow) (C2, condition 1)',
    /P1d probe log .*: 4 invocation line\(s\), 3 from mcp__ccd_turn__wrap_up; 2 Guard-1 verdict\(s\) \(1 refuse, 1 allow\)/.test(r.stdout), r.stdout.slice(-500));
  check('Guard 1 binds a bare lowercase "analyst" to no session (record item 1)', hook(G1, wrap('The analyst owns that queue.'), env).status === 0);
}

rmSync(root, { recursive: true, force: true });
console.log(`\n${total - failed}/${total} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
