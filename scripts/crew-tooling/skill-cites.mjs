#!/usr/bin/env node
// B-WORKFLOW-IMPROVE OBJ-11 (Q10) - the deletion census over the citing corpora (Langston Step-2 r2 condition 5).
// Lists every pinned skill-line citation (`workflow-NN...:<line>`, `workflow-hotfix:<line>`, `bug-investigation:<line>`,
// with or without /SKILL.md, plus the `L94` / `line 94` forms and bare `:91` continuations after a first citation)
// in the given corpora at a ref, and the text of the cited skill line at that ref, so a later move can prove each
// citation was re-pointed: run it at the pre-move ref (--json > before.json), move, then
// --check before.json --at <post-move ref> reports every citation whose cited line no longer holds the same text.
// A LEAD: a citation by heading or by prose ("the Step-2 skill's census paragraph") has no line and is not listed;
// a skill name the patterns do not spell is not listed. The output states the corpora and the patterns.
// Usage: node scripts/crew-tooling/skill-cites.mjs [--ref R] [--corpus DIR ...] [--json] [--check before.json --at R2] | --self-test
// Exit:  0 listed (or check clean), 1 none listed (or check found stale citations), 2 error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const many = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(2); };

// The --check comparison, kept pure so --self-test can drive it without git. A citation is keyed on the RESOLVED
// skill directory, not the name as written (Langston Step-4 gate 2 re-check, C-4 condition): re-pointing
// `workflow-10:5` to `workflow-10-governance:5` on the same line is the same citation, not one gone and one new.
// Limit, stated in --check output: the key is (file, skill dir, cited line), so two identical citations in one
// file collapse to one, and dropping one of them reports 0 DISAPPEARED; the before/after COUNT change is the tell.
function compare(beforeCites, nowCites) {
  const key = (c) => `${c.file}\u0000${c.skill_dir || c.skill}\u0000${c.cited_line}`;
  const beforeKeys = new Map(beforeCites.map((b) => [key(b), b])), nowKeys = new Set(nowCites.map(key));
  const stale = [], appeared = [];
  for (const c of nowCites) {
    const old = beforeKeys.get(key(c));
    if (!old) appeared.push(c); else if (old.cited_text !== c.cited_text) stale.push({ ...c, was: old.cited_text });
  }
  // Gate 2 C-4: a citation present before and absent after (file archived, or rewritten past the patterns)
  // matched nothing in the old loop and was silently uncounted. It is its own bucket.
  const disappeared = beforeCites.filter((b) => !nowKeys.has(key(b)));
  return { stale, appeared, disappeared };
}
const CHECK_NOT_COVERED = 'two identical citations (same file, skill, cited line) are one key, so dropping one of a pair reports 0 DISAPPEARED - a before/after count change with 0 DISAPPEARED and 0 new is the tell';

if (args.includes('--self-test')) {
  const c = (file, skill, skill_dir, cited_line, cited_text) => ({ file, line: 1, skill, skill_dir, cited_line, cited_text });
  const base = [c('a.md', 'workflow-10', 'workflow-10-governance', 5, 'T5'), c('a.md', 'workflow-02', 'workflow-02-audit-and-plan', 9, 'T9'), c('b.md', 'bug-investigation', 'bug-investigation', 3, 'T3')];
  const cases = [
    ['unchanged corpus: nothing reported', compare(base, base), { stale: 0, appeared: 0, disappeared: 0 }],
    ['all three removed: 3 DISAPPEARED (positive control)', compare(base, []), { stale: 0, appeared: 0, disappeared: 3 }],
    ['short name re-pointed to the full name, same line and text: 0 DISAPPEARED, 0 new', compare(base, [c('a.md', 'workflow-10-governance', 'workflow-10-governance', 5, 'T5'), base[1], base[2]]), { stale: 0, appeared: 0, disappeared: 0 }],
    ['cited line now holds other text: 1 stale', compare(base, [c('a.md', 'workflow-10', 'workflow-10-governance', 5, 'CHANGED'), base[1], base[2]]), { stale: 1, appeared: 0, disappeared: 0 }],
    ['re-pointed to another line: 1 DISAPPEARED and 1 new', compare(base, [c('a.md', 'workflow-10', 'workflow-10-governance', 6, 'T5'), base[1], base[2]]), { stale: 0, appeared: 1, disappeared: 1 }],
    ['one of two identical citations dropped: 0 DISAPPEARED (the stated limit)', compare([...base, base[0]], base), { stale: 0, appeared: 0, disappeared: 0 }],
  ];
  let pass = 0, failed = 0;
  for (const [name, got, want] of cases) {
    const ok = got.stale.length === want.stale && got.appeared.length === want.appeared && got.disappeared.length === want.disappeared;
    ok ? pass++ : failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (stale ${got.stale.length}, new ${got.appeared.length}, disappeared ${got.disappeared.length})`);
  }
  console.log(`self-test: PASS ${pass} FAIL ${failed}`);
  process.exit(failed ? 1 : 0);
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
// Under --check the skills are read at --at unless --ref is given, so --check never resolves a ref it does not use.
const REF = opt('--ref') || (args.includes('--check') ? opt('--at') : undefined) || 'origin/migration/aws-supabase';
const CORPORA = many('--corpus').length ? many('--corpus') : ['1-system-manual/', 'Claude Comms and Packages/'];
// Every ref read is printed with its resolved sha: a ref NAME is whatever this clone last fetched, and no fetch is done here.
const shaOf = (r) => { try { return git('rev-parse', '--verify', '--quiet', `${r}^{commit}`).trim(); } catch { fail(`ref ${r} does not resolve`); } };
const REF_SHA = shaOf(REF);

const SKILLS = git('ls-tree', '--name-only', `${REF}:.claude/skills`).split('\n').filter((s) => /^(workflow-|bug-investigation)/.test(s));
// A citation names a skill by its full directory name or its short `workflow-NN` form.
const SHORT = new Map(SKILLS.map((s) => [s.match(/^workflow-\d{2}|^workflow-hotfix|^bug-investigation/)?.[0], s]));
const NAME = String.raw`(workflow-\d{2}(?:-[a-z]+)*|workflow-hotfix|bug-investigation)`;
const FIRST = new RegExp(String.raw`${NAME}(?:/SKILL\.md)?\x60?'?s?(?::| L| lines? )(\d+)`, 'g');
const CONT = /^[^|]{0,12}?(?:,|and|&)\s*\x60?(?::|L)(\d+)/;

function skillDir(name) { return SKILLS.includes(name) ? name : SHORT.get(name.match(/^workflow-\d{2}|^workflow-hotfix|^bug-investigation/)?.[0]) || null; }
const skillCache = new Map();
function skillLine(ref, dir, n) {
  const k = `${ref}:${dir}`;
  if (!skillCache.has(k)) { try { skillCache.set(k, git('show', `${ref}:.claude/skills/${dir}/SKILL.md`).split('\n')); } catch { skillCache.set(k, null); } }
  const lines = skillCache.get(k);
  return lines ? (lines[n - 1] ?? null) : undefined;
}

function census(ref) {
  let raw = '';
  try { raw = git('grep', '-n', '-E', '(workflow-[0-9]{2}|workflow-hotfix|bug-investigation)', ref, '--', ...CORPORA); }
  catch (e) { if (e.status !== 1) fail(`git grep failed: ${e.message}`); }
  const out = [];
  for (const row of raw.split('\n').filter(Boolean)) {
    const m = row.match(/^[^:]+:(.+?):(\d+):(.*)$/); if (!m) continue;
    const [, file, line, text] = m;
    for (const f of text.matchAll(FIRST)) {
      const dir = skillDir(f[1]);
      // cite_state keeps the three null causes apart: no such skill, SKILL.md unreadable at the ref, line past its end.
      const push = (n) => { const got = dir ? skillLine(ref, dir, Number(n)) : null;
        out.push({ file, line: Number(line), skill: f[1], skill_dir: dir, cited_line: Number(n), cited_text: got ?? null,
          cite_state: !dir ? 'no_skill' : got === undefined ? 'skill_unreadable' : got === null ? 'past_end' : 'ok' }); };
      push(f[2]);
      let rest = text.slice(f.index + f[0].length), c;
      while ((c = rest.match(CONT))) { push(c[1]); rest = rest.slice(c.index + c[0].length); }
    }
  }
  return out;
}

if (args.includes('--check')) {
  const before = JSON.parse(readFileSync(opt('--check'), 'utf8'));
  const at = opt('--at'); if (!at) fail('--check needs --at <post-move ref>');
  const now = census(at);
  const { stale, appeared, disappeared } = compare(before.citations, now);
  console.log(`CHECK ${before.ref}${before.ref_sha ? ` (${before.ref_sha.slice(0, 12)})` : ''} -> ${at} (${shaOf(at).slice(0, 12)}; no fetch performed): ${before.citations.length} citations before, ${now.length} after; ${stale.length} now point at different text; ${disappeared.length} DISAPPEARED; ${appeared.length} new`);
  for (const s of stale) console.log(`  ${s.file}:${s.line} ${s.skill}:${s.cited_line}\n    was: ${String(s.was).slice(0, 110)}\n    now: ${String(s.cited_text).slice(0, 110)}`);
  for (const d of disappeared) console.log(`  DISAPPEARED ${d.file}:${d.line} ${d.skill}:${d.cited_line}
    was: ${String(d.cited_text).slice(0, 110)}`);
  console.log(`not covered: ${CHECK_NOT_COVERED}`);
  process.exit(stale.length || disappeared.length ? 1 : 0);
}

const cites = census(REF);
const result = { tool: 'skill-cites.mjs', tool_version: '1.2', ref: REF, ref_sha: REF_SHA, fetched: false, corpora: CORPORA, skills: SKILLS,
  counts: { citations: cites.length, files: new Set(cites.map((c) => c.file)).size, unresolved_skill: cites.filter((c) => !c.skill_dir).length, past_end: cites.filter((c) => c.cite_state === 'past_end').length, skill_unreadable: cites.filter((c) => c.cite_state === 'skill_unreadable').length },
  citations: cites,
  not_covered: ['citations by heading or prose, with no line number', 'skill names outside workflow-*, workflow-hotfix, bug-investigation', 'corpora not passed (default: 1-system-manual/ and Claude Comms and Packages/)'] };
if (args.includes('--json')) { console.log(JSON.stringify(result, null, 2)); process.exit(cites.length ? 0 : 1); }
console.log(`SKILL CITATIONS at ${REF} (${REF_SHA.slice(0, 12)}; no fetch performed) in ${CORPORA.join(', ')}: ${result.counts.citations} citations in ${result.counts.files} files; ${result.counts.unresolved_skill} name no existing skill; ${result.counts.past_end} cite a line past the skill's end; ${result.counts.skill_unreadable} name a skill whose SKILL.md is unreadable at the ref`);
const by = new Map(); for (const c of cites) by.set(c.skill_dir || c.skill, (by.get(c.skill_dir || c.skill) || 0) + 1);
for (const [k, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log(`not covered: ${result.not_covered.join('; ')}`);
process.exit(cites.length ? 0 : 1);
