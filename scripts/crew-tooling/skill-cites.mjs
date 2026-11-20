#!/usr/bin/env node
// B-WORKFLOW-IMPROVE OBJ-11 (Q10) - the deletion census over the citing corpora (Langston Step-2 r2 condition 5).
// Lists every pinned skill-line citation (`workflow-NN...:<line>`, `workflow-hotfix:<line>`, `bug-investigation:<line>`,
// with or without /SKILL.md, plus the `L94` / `line 94` forms and bare `:91` continuations after a first citation)
// in the given corpora at a ref, and the text of the cited skill line at that ref, so a later move can prove each
// citation was re-pointed: run it at the pre-move ref (--json > before.json), move, then
// --check before.json --at <post-move ref> reports every citation whose cited line no longer holds the same text.
// A LEAD: a citation by heading or by prose ("the Step-2 skill's census paragraph") has no line and is not listed;
// a skill name the patterns do not spell is not listed. The output states the corpora and the patterns.
// Usage: node scripts/crew-tooling/skill-cites.mjs [--ref R] [--corpus DIR ...] [--json] [--check before.json --at R2]
// Exit:  0 listed (or check clean), 1 none listed (or check found stale citations), 2 error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const many = (k) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(2); };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const REF = opt('--ref') || 'origin/migration/aws-supabase';
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
  const stale = [], appeared = [];
  const now = census(at);
  const key = (c) => `${c.file}\u0000${c.skill}\u0000${c.cited_line}`;
  const beforeKeys = new Map(before.citations.map((b) => [key(b), b])), nowKeys = new Set(now.map(key));
  for (const c of now) {
    const old = beforeKeys.get(key(c));
    if (!old) appeared.push(c); else if (old.cited_text !== c.cited_text) stale.push({ ...c, was: old.cited_text });
  }
  // Langston Step-4 gate 2 C-4: a citation present before and absent after (file archived, or rewritten past the
  // patterns) matched nothing in the old loop and was silently uncounted. It is its own bucket now.
  const disappeared = before.citations.filter((b) => !nowKeys.has(key(b)));
  console.log(`CHECK ${before.ref}${before.ref_sha ? ` (${before.ref_sha.slice(0, 12)})` : ''} -> ${at} (${shaOf(at).slice(0, 12)}; no fetch performed): ${before.citations.length} citations before, ${now.length} after; ${stale.length} now point at different text; ${disappeared.length} DISAPPEARED; ${appeared.length} new`);
  for (const s of stale) console.log(`  ${s.file}:${s.line} ${s.skill}:${s.cited_line}\n    was: ${String(s.was).slice(0, 110)}\n    now: ${String(s.cited_text).slice(0, 110)}`);
  for (const d of disappeared) console.log(`  DISAPPEARED ${d.file}:${d.line} ${d.skill}:${d.cited_line}
    was: ${String(d.cited_text).slice(0, 110)}`);
  process.exit(stale.length || disappeared.length ? 1 : 0);
}

const cites = census(REF);
const result = { tool: 'skill-cites.mjs', tool_version: '1.1', ref: REF, ref_sha: REF_SHA, fetched: false, corpora: CORPORA, skills: SKILLS,
  counts: { citations: cites.length, files: new Set(cites.map((c) => c.file)).size, unresolved_skill: cites.filter((c) => !c.skill_dir).length, past_end: cites.filter((c) => c.cite_state === 'past_end').length, skill_unreadable: cites.filter((c) => c.cite_state === 'skill_unreadable').length },
  citations: cites,
  not_covered: ['citations by heading or prose, with no line number', 'skill names outside workflow-*, workflow-hotfix, bug-investigation', 'corpora not passed (default: 1-system-manual/ and Claude Comms and Packages/)'] };
if (args.includes('--json')) { console.log(JSON.stringify(result, null, 2)); process.exit(cites.length ? 0 : 1); }
console.log(`SKILL CITATIONS at ${REF} (${REF_SHA.slice(0, 12)}; no fetch performed) in ${CORPORA.join(', ')}: ${result.counts.citations} citations in ${result.counts.files} files; ${result.counts.unresolved_skill} name no existing skill; ${result.counts.past_end} cite a line past the skill's end; ${result.counts.skill_unreadable} name a skill whose SKILL.md is unreadable at the ref`);
const by = new Map(); for (const c of cites) by.set(c.skill_dir || c.skill, (by.get(c.skill_dir || c.skill) || 0) + 1);
for (const [k, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log(`not covered: ${result.not_covered.join('; ')}`);
process.exit(cites.length ? 0 : 1);
