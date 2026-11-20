#!/usr/bin/env node
// B-WORKFLOW-IMPROVE OBJ-6 (Q5) - the per-component history list for a provenance read.
// Given a path (or a symbol, resolved to its declaring file by code-refs.mjs), list:
//   every commit touching it through renames (former names collected), the batch-id in each subject,
//   unattributed commits apart, each batch's scope / pre-audit / completion files, and the
//   RUNNING_ISSUES, pm/DECISIONS and DELETED_COMPONENTS_LOG entries citing the file or a former name.
// A LEAD, never a verdict: a batch named only in a commit body, or an issue citing a component by
// prose name rather than file name, is not found. The output says so.
// Usage: node scripts/crew-tooling/history.mjs <path | --symbol NAME> [--ref <git ref>] [--json]
// Exit:  0 history found, 1 no commits for the path, 2 error.
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const REF = opt('--ref') || 'origin/migration/aws-supabase';
const asJson = args.includes('--json');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(2); };

let target = args.find((a, i) => !a.startsWith('--') && !['--ref', '--symbol'].includes(args[i - 1]));
const sym = opt('--symbol');
if (sym) {
  const here = dirname(fileURLToPath(import.meta.url));
  let o;
  try { o = JSON.parse(execFileSync('node', [join(here, 'code-refs.mjs'), sym], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })); }
  catch (e) { try { o = JSON.parse(e.stdout); } catch { fail(`code-refs failed for ${sym}`); } }
  if (!o.declaration) fail(`symbol ${sym}: ${o.error || 'no declaration'}`);
  target = o.declaration.file;
}
if (!target) fail('usage: history.mjs <path | --symbol NAME> [--ref <git ref>] [--json]');
// The resolved sha is kept and printed: the ref NAME is whatever this clone last fetched, and no fetch is done here.
let REF_SHA;
try { REF_SHA = git('rev-parse', '--verify', '--quiet', `${REF}^{commit}`).trim(); } catch { fail(`ref ${REF} does not resolve`); }

// 1. Commits through renames.
const SEP = '\u001f';
let raw;
try { raw = git('log', REF, '--follow', '--name-status', `--format=@@${SEP}%h${SEP}%ad${SEP}%s`, '--date=short', '--', target); }
catch (e) { fail(`git log failed: ${e.message}`); }
const commits = [];
const names = new Set([target]);
for (const block of raw.split('@@').slice(1)) {
  const [head, ...rest] = block.split('\n');
  const [, sha, date, subject] = head.split(SEP);
  for (const l of rest) {
    const m = l.match(/^R\d*\t(.+)\t(.+)$/);
    if (m) { names.add(m[1]); names.add(m[2]); }
  }
  const b = subject.match(/^(P\d+-B[\w.]+|B-[A-Z0-9][A-Z0-9.-]*[A-Z0-9]|B\d+[\w.]*)/);
  commits.push({ sha, date, subject, batch: b ? b[1] : null });
}
if (commits.length === 0) { console.log(`NO COMMITS for ${target} at ${REF} (path never existed there, or misspelled)`); process.exit(1); }

// 2. Batch documents.
const docFiles = git('ls-tree', '-r', '--name-only', REF, '--', 'Claude Comms and Packages/').split('\n').filter(Boolean);
const batches = [...new Set(commits.map((c) => c.batch).filter(Boolean))];
// Q8 pilot fix (2026-11-20): numbered batches before ~B80 filed their documents as BATCH_<n>_*.md, so "B55" also
// looks for BATCH_55_. A sub-batch with no documents of its own (B74.1, B64a) falls back to its parent's, and the
// output labels those "parent B74", so a parent document is never shown as the sub-batch's own.
const docKeys = (id) => {
  const key = id.replace(/-/g, '_').replace(/\./g, '_').toUpperCase();
  const m = key.match(/^B(\d.*)$/);
  return m ? [key, 'BATCH_' + m[1]] : [key];
};
const docsMatching = (id) => docFiles.filter((f) => /SCOPE|PRE_AUDIT|COMPLETION|PROGRESS/i.test(basename(f))
  && docKeys(id).some((k) => basename(f).toUpperCase().replace(/[-.]/g, '_').startsWith(k + '_')));
const docsFor = (id) => {
  const own = docsMatching(id);
  const pm = id.match(/^(B\d+)[a-z.]/i);
  if (own.length || !pm) return own;
  const parent = pm[1];
  return docsMatching(parent).map((f) => 'parent ' + parent + ': ' + f);
};

// 3. Ledger entries citing the file or a former name (by basename, which is how entries cite files).
const bases = [...new Set([...names].map((n) => basename(n)))];
function entriesCiting(path, headingRe) {
  let text;
  try { text = git('show', `${REF}:${path}`); } catch (e) { return { path, error: `UNREADABLE at ${REF}: ${e.message.split('\n')[0]}` }; }
  const lines = text.split('\n');
  const hits = new Map();
  let heading = null;
  lines.forEach((l, i) => {
    if (headingRe.test(l)) heading = { line: i + 1, text: l.slice(0, 140) };
    if (heading && bases.some((b) => l.includes(b))) hits.set(heading.line, heading.text);
  });
  return { path, entries: [...hits].map(([line, text]) => ({ line, text })) };
}
const ledgers = [
  entriesCiting('1-system-manual/RUNNING_ISSUES.md', /^(### #\d+|- \*\*#\d+)/),
  entriesCiting('1-system-manual/pm/DECISIONS.md', /^(#{2,4} |\| *KD-\d+|- \*\*KD-\d+)/),
  entriesCiting('1-system-manual/DELETED_COMPONENTS_LOG.md', /^#{2,4} /),
];

const result = {
  tool: 'history.mjs', tool_version: '1.2', ref: REF, ref_sha: REF_SHA, fetched: false, target, former_names: [...names].filter((n) => n !== target),
  counts: { commits: commits.length, attributed: commits.filter((c) => c.batch).length, unattributed: commits.filter((c) => !c.batch).length, batches: batches.length },
  batches: batches.map((id) => ({ id, commits: commits.filter((c) => c.batch === id).map((c) => c.sha), documents: docsFor(id) })),
  unattributed: commits.filter((c) => !c.batch),
  ledgers,
  not_covered: ['batch-ids only in commit bodies', 'issues citing the component by prose name, not file name', 'history before the first commit of the path',
    'phase-scoped sub-batch ids (e.g. P19-B8.5l): the parent-document fallback matches only B<number> ids',
    'ledger rows are matched by BASENAME, so a duplicated basename (index.ts, types.ts, friction.ts and others) cites every file of that name',
    'former names are proven by one rename (paper-portfolio-manager.ts); multi-hop renames are not tested'],
};
if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
console.log(`HISTORY ${target} at ${REF} (${REF_SHA.slice(0, 12)}; no fetch performed): ${result.counts.commits} commits, ${result.counts.attributed} attributed to ${batches.length} batches, ${result.counts.unattributed} unattributed`);
if (result.former_names.length) console.log(`former names: ${result.former_names.join(', ')}`);
for (const b of result.batches) console.log(`  ${b.id}  [${b.commits.join(' ')}]  docs: ${b.documents.length ? b.documents.map((d) => d.startsWith('parent ') ? d.replace(/: .*\//, ': ') : basename(d)).join(', ') : 'NONE FOUND'}`);
console.log(`unattributed (${result.unattributed.length}):`);
for (const c of result.unattributed.slice(0, 40)) console.log(`  ${c.sha} ${c.date} ${c.subject.slice(0, 100)}`);
if (result.unattributed.length > 40) console.log(`  ... ${result.unattributed.length - 40} more (use --json for all)`);
for (const l of ledgers) {
  if (l.error) { console.log(`${l.path}: ${l.error}`); continue; }
  console.log(`${l.path}: ${l.entries.length} entr${l.entries.length === 1 ? 'y' : 'ies'} cite ${bases.join(' / ')}`);
  for (const e of l.entries) console.log(`  :${e.line} ${e.text}`);
}
console.log(`not covered: ${result.not_covered.join('; ')}`);
