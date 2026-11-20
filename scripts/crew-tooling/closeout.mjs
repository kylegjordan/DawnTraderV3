#!/usr/bin/env node
// B-WORKFLOW-IMPROVE OBJ-7 (Q6) - the Step-10 close-out matrix, generated from the governance checker's own
// tables (scripts/governance-checker/config.mjs: DOCS, CLASS_DOCSET, REQUIRED_IF, LEDGER_ROWS, PLAN_LINE).
// It IMPORTS them, never copies them, so the matrix and the checker cannot drift apart. Rows the checker does
// not hold (the hotfix overlays from workflow-hotfix, the memory and task-list rows) are in OVERLAY below,
// each with its source.
// For a real batch it fills the verdict cell of every row from the repo at --head:
//   file documents: a file in the DOCS dir whose name carries the batch-id (the checker's batchIdToFileRegex);
//   entry documents: the batch-id in the document at --head, and whether base..head touched it.
// A REQUIRED row with nothing found is MISSING. A judged row not updated needs a stated reason; the tool
// prints REASON REQUIRED and, where the diff or the census gives one, a hint (deleted files -> the
// deleted-components log; code under server/ or shared/ -> System Manual and SIM).
// The diff alone misses an omitted update (it is silent), so --census (census.mjs --json output) and
// --ledger (the batch ledger, ledger-schema.json) add what they know. A LEAD for Step 10, never its verdict.
// Usage: node scripts/crew-tooling/closeout.mjs --class <c> [--batch ID --base REF --head REF]
//          [--census file.json] [--ledger file.json] [--json]
//        node scripts/crew-tooling/closeout.mjs --compare   (matrix vs workflow-10's table, row by row)
// Exit:  0 nothing MISSING (and, for --compare, every row equal), 1 a MISSING row or a compare difference, 2 error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const cfg = await import(pathToFileURL(join(ROOT, 'scripts/governance-checker/config.mjs')).href);
const { DOCS, CLASS_DOCSET, REQUIRED_IF, LEDGER_ROWS, PLAN_LINE, batchIdToFileRegex, CHANGE_CLASS_MARKER } = cfg;

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const fail = (m) => { console.error(`ERROR: ${m}`); process.exit(2); };
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const CLASSES = Object.keys(CLASS_DOCSET);

// The workflow-10 row order and labels; key = the DOCS key, or an overlay key.
const ROWS = [
  ['scope', 'the batch `SCOPE`'], ['pre_audit', 'the batch `PRE_AUDIT`'], ['completion_report', '`COMPLETION_REPORT`'],
  ['batch_catalog', '`BATCH_CATALOG.md`'], ['phase_history', '`PHASE_HISTORY.md`'], ['system_manual', '`SYSTEM_MANUAL.md`'],
  ['sim', '`SYSTEM_IMPACT_MAP.md`'], ['changes_and_fixes', '`CHANGES_AND_FIXES.md`'], ['running_issues', '`RUNNING_ISSUES.md`'],
  ['roadmap', '`POST_AUDIT_ROADMAP.md`'], ['deleted_log', '`DELETED_COMPONENTS_LOG.md`'], ['adjustment_framework', '`ADJUSTMENT_FRAMEWORK.md`'],
  ['phase_19_plan', '`PHASE_19_PLAN.md`'], ['plan_line', `the ACTIVE plan - \`${PLAN_LINE.path.split('/').pop()}\`: your row`],
  ['memory', 'shared `MEMORY.md` + your own memory file + Langston\'s `MEMORY.md`'], ['task_lists', 'your own session task list'],
  ['other', 'every other row in the ledger'],
];
// Requirements that come from a skill, not from config.mjs. Source cited per entry.
const OVERLAY = {
  hotfix: { scope: { req: 'REQUIRED', src: 'workflow-hotfix §2.35' }, batch_catalog: { req: 'REQUIRED', src: 'workflow-hotfix §5' } },
};

function cell(cls, key, batchId) {
  const ds = CLASS_DOCSET[cls];
  if (key === 'plan_line') return { req: 'REQUIRED if the batch has a row there', tag: 'plan line' };
  if (key === 'memory') return { req: 'REQUIRED', tag: '—', src: 'workflow-10 Tier-1 (no instrument)' };
  if (key === 'task_lists') return { req: 'REQUIRED', tag: 'ledger row', src: `config LEDGER_ROWS.task_lists` };
  if (key === 'other') return { req: 'judged', tag: '—' };
  if (key === 'phase_19_plan') {
    const p19 = batchId ? REQUIRED_IF.phase_19_plan(batchId) : null;
    return p19 === null
      ? { req: 'REQUIRED for a P19-* batch (R); REQUIRED to finish an in-flight row (—); else N/A — no row there', tag: 'predicate' }
      : p19 ? { req: 'REQUIRED', tag: 'R', src: 'REQUIRED_IF' } : { req: 'REQUIRED only to finish an in-flight row there, else N/A — no row there', tag: '—' };
  }
  const tag0 = ds.required.includes(key) ? 'R' : ds.conditional.includes(key) ? 'c' : '—';
  // R*: a missing scope makes the class undeclared, graded as the default class, where the scope is required.
  const tag = key === 'scope' && !ds.required.includes(key) && CLASS_DOCSET[cfg.DEFAULT_CLASS].required.includes('scope') ? 'R*' : tag0;
  const ov = OVERLAY[cls]?.[key];
  return { req: ov ? 'REQUIRED' : ds.required.includes(key) ? 'REQUIRED' : 'judged', tag, src: ov ? ov.src : null };
}

// ---- --compare: the generated matrix against workflow-10's table, at the working tree ------------
if (args.includes('--compare')) {
  const md = readFileSync(join(ROOT, '.claude/skills/workflow-10-governance/SKILL.md'), 'utf8').split('\n');
  const hdr = md.findIndex((l) => /^\| document \| architecture \| non_architecture \| sub_batch \| hotfix \|/.test(l));
  if (hdr < 0) fail('workflow-10 class-matrix header not found');
  const rows = []; for (let i = hdr + 2; i < md.length && md[i].startsWith('|'); i++) rows.push({ line: i + 1, cells: md[i].split('|').slice(1, -1).map((c) => c.trim()) });
  const norm = (c) => {
    const plain = c.replace(/\*\*|`/g, '').replace(/\([^)]*\)/g, '').replace(/⛔/g, '').trim();
    const req = /^REQUIRED if the batch has a row/i.test(plain) ? 'REQUIRED if the batch has a row there' : /^REQUIRED\b/.test(plain) ? 'REQUIRED' : /^judged\b/.test(plain) ? 'judged' : /^same$/.test(plain) ? 'same' : plain.slice(0, 40);
    const m = plain.match(/·\s*(R\*|R|c|—|ledger row|plan line)(?=\s|$)/);
    return { req, tag: m ? m[1] : null };
  };
  let diffs = 0;
  console.log(`COMPARE generated matrix vs workflow-10-governance/SKILL.md:${hdr + 1} (${rows.length} rows; generator has ${ROWS.length})`);
  if (rows.length !== ROWS.length) { diffs++; console.log(`  ROW COUNT differs: table ${rows.length}, generator ${ROWS.length}`); }
  ROWS.forEach(([key, label], r) => {
    const t = rows[r]; if (!t) return;
    if (key === 'phase_19_plan') { console.log(`  :${t.line} ${label}: predicate row - compared by its rule, not its cells (REQUIRED_IF P19-*; in-flight row; else N/A)`); return; }
    const out = [];
    CLASSES.forEach((cls, k) => {
      let want = norm(t.cells[k + 1]);
      if (want.req === 'same') want = norm(t.cells[1]);
      const got = cell(cls, key, null);
      if (key === 'memory' || key === 'task_lists' || key === 'other' || key === 'plan_line') { if (want.req !== got.req || (want.tag && want.tag !== got.tag)) out.push(`${cls}: table ${want.req}·${want.tag} gen ${got.req}·${got.tag}`); return; }
      if (want.req !== got.req || want.tag !== got.tag) out.push(`${cls}: table ${want.req}·${want.tag} gen ${got.req}·${got.tag}`);
    });
    if (out.length) { diffs++; console.log(`  :${t.line} ${label}: DIFFERS - ${out.join('; ')}`); } else console.log(`  :${t.line} ${label}: equal`);
  });
  console.log(diffs ? `COMPARE: ${diffs} row(s) differ` : 'COMPARE: every row equal');
  process.exit(diffs ? 1 : 0);
}

// ---- the matrix for one class, optionally filled for one batch -----------------------------------
let cls = opt('--class');
let classSource = cls ? '--class' : null;
const batchId = opt('--batch');
const base = opt('--base'); const head = opt('--head') || (batchId ? 'origin/migration/aws-supabase' : null);
let changed = null, deleted = [], headFiles = null, baseSha = null, headSha = null;
if (batchId) {
  if (!base) fail('--batch needs --base (the commit before the batch began)');
  // The resolved shas are kept and printed: a ref NAME is whatever this clone last fetched, and no fetch is done here.
  try { baseSha = git('rev-parse', '--verify', '--quiet', `${base}^{commit}`).trim(); headSha = git('rev-parse', '--verify', '--quiet', `${head}^{commit}`).trim(); } catch { fail(`--base ${base} or --head ${head} does not resolve`); }
  const ns = git('diff', '--name-status', '--no-renames', base, head).split('\n').filter(Boolean).map((l) => l.split('\t'));
  changed = new Set(ns.map(([, p]) => p)); deleted = ns.filter(([s]) => s === 'D').map(([, p]) => p);
  headFiles = git('ls-tree', '-r', '--name-only', head).split('\n').filter(Boolean);
  // The declared class, read from the scope header with the checker's own marker (imported, never copied); undeclared -> the default class, flagged.
  const re = batchIdToFileRegex(batchId);
  // Scope selection follows the checker's readDeclaredClass (checker.mjs:570-585): names carrying the batch-id and
  // SCOPE, sorted, the first whose text holds the marker. That loop is MIRRORED here because the checker's version
  // reads at its own fetched ref, not at --head; the marker itself is imported.
  const cands = headFiles.filter((f) => f.startsWith(`${DOCS.scope.dir}/`) && re.test(f.split('/').pop()) && /SCOPE/i.test(f.split('/').pop())).map((f) => f.split('/').pop()).sort();
  let scope = cands.length ? `${DOCS.scope.dir}/${cands[0]}` : null, m = null;
  for (const n of cands) { const hit = git('show', `${head}:${DOCS.scope.dir}/${n}`).match(CHANGE_CLASS_MARKER); if (hit) { scope = `${DOCS.scope.dir}/${n}`; m = hit; break; } }
  const declared = m && CLASSES.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
  if (cls && declared && cls !== declared) console.log(`WARNING: --class ${cls} differs from the scope's declared class ${declared} (${scope}); grading --class as asked`);
  if (!cls) { cls = declared || cfg.DEFAULT_CLASS; classSource = declared ? `declared in ${scope}` : `UNDECLARED${scope ? ` in ${scope}` : ' (no scope file)'} - graded as the default class, as the checker does`; }
}
if (!CLASSES.includes(cls)) fail(`--class must be one of ${CLASSES.join(' | ')} (or pass --batch so it is read from the scope)`);
const readJson = (p) => { if (!p) return null; try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { fail(`unreadable ${p}: ${e.message}`); } };
const census = readJson(opt('--census')); const ledger = readJson(opt('--ledger'));
const codeTouched = changed ? [...changed].filter((p) => /^(server|shared)\//.test(p) && !/\.test\.ts$|\/tests\//.test(p)) : [];

function verdict(key, c) {
  if (!batchId) return null;
  const re = batchIdToFileRegex(batchId);
  const d = DOCS[key];
  if (d && d.kind === 'file-glob') {
    const hits = headFiles.filter((f) => f.startsWith(`${d.dir}/`) && d.match.test(f.split('/').pop()) && re.test(f.split('/').pop()));
    if (hits.length) return { state: 'UPDATED', evidence: hits.join(', ') };
  } else if (d && d.kind === 'entry') {
    let txt = ''; try { txt = git('show', `${head}:${d.path}`); } catch (e) { return { state: 'UNREADABLE', evidence: `${d.path} at ${head}: ${e.message.split('\n')[0]}` }; }
    const n = txt.split('\n').filter((l) => re.test(l)).length;
    const touched = changed.has(d.path);
    if (n && touched) return { state: 'UPDATED', evidence: `${n} line(s) carry the id at ${head}; touched in ${base}..${head}` };
    if (n) return { state: 'CITED, NOT TOUCHED', evidence: `${n} line(s) carry the id but ${base}..${head} did not change the file - an entry from before the range?` };
  } else if (key === 'task_lists') {
    // The checker's own ledger-row pattern (LEDGER_ROWS.task_lists.names), looked for in the batch's completion report.
    const reports = headFiles.filter((f) => f.startsWith(`${DOCS.completion_report.dir}/`) && re.test(f.split('/').pop()));
    const hit = reports.find((f) => git('show', `${head}:${f}`).replace(/[*`]/g, '').replace(/ /g, ' ').split('\n').some((l) => LEDGER_ROWS.task_lists.names.test(l)));
    return hit ? { state: 'LEDGER ROW PRESENT', evidence: `${hit} carries a session-task-list row (the row's content is the author's attestation)` }
      : { state: reports.length ? 'MISSING' : 'NO REPORT YET', evidence: reports.length ? `no session-task-list row in ${reports.join(', ')}` : 'no completion report carries the batch-id at head' };
  } else if (key === 'plan_line' || key === 'memory' || key === 'other') {
    return { state: 'NOT GRADED HERE', evidence: key === 'plan_line' ? 'gov-planline grades it' : key === 'other' ? 'judged row by row in the ledger; this tool lists only the documents above' : 'local state - only the author can attest' };
  }
  const hint = [];
  if (key === 'deleted_log' && deleted.length) hint.push(`diff deletes ${deleted.length} file(s): ${deleted.slice(0, 5).join(', ')}`);
  if ((key === 'system_manual' || key === 'sim') && codeTouched.length) hint.push(`diff changes ${codeTouched.length} server/shared file(s)`);
  if ((key === 'system_manual' || key === 'sim') && census) hint.push(`census: ${census.counts?.files_using ?? '?'} files use the target, ${census.counts?.entry_points ?? '?'} entry points`);
  if (key === 'running_issues' && ledger) { const u = (ledger.objectives || []).filter((o) => o.status === 'closed-unproven').length; if (u) hint.push(`ledger: ${u} closed-unproven objective(s) need a home here`); }
  return c.req === 'REQUIRED' ? { state: 'MISSING', evidence: 'nothing carrying the batch-id found', hint } : { state: 'REASON REQUIRED', evidence: 'not updated - write N/A with its reason, or update it', hint };
}

const matrix = ROWS.map(([key, label]) => { const c = cell(cls, key, batchId); return { key, label, ...c, verdict: verdict(key, c) }; });
const missing = matrix.filter((m) => m.verdict?.state === 'MISSING').length;
const out = { tool: 'closeout.mjs', tool_version: '1.0', class: cls, class_source: classSource, batch: batchId || null, base: base || null, head, base_sha: baseSha, head_sha: headSha, fetched: false, source: 'scripts/governance-checker/config.mjs (imported) + OVERLAY', rows: matrix, missing,
  not_covered: ['whether an UPDATED entry says the right thing (content, not presence)', 'local-state rows (memory, task lists) - the author attests', 'a judged row the diff gives no hint for'] };
if (args.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(missing ? 1 : 0); }
console.log(`CHANGE-CLASS: ${cls} (${classSource})${batchId ? `   batch ${batchId}, ${base} (${baseSha.slice(0, 12)})..${head} (${headSha.slice(0, 12)}); no fetch performed, refs as this clone last fetched them` : ''}`);
console.log('| document | requirement · checker | verdict | evidence |');
console.log('|---|---|---|---|');
for (const m of matrix) console.log(`| ${m.label} | ${m.req} · ${m.tag}${m.src ? ` (${m.src})` : ''} | ${m.verdict ? m.verdict.state : '-'} | ${m.verdict ? m.verdict.evidence + (m.verdict.hint?.length ? `; hint: ${m.verdict.hint.join('; ')}` : '') : ''} |`);
console.log(`not covered: ${out.not_covered.join('; ')}`);
process.exit(missing ? 1 : 0);
