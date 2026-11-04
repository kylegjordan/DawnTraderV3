#!/usr/bin/env node
// PM Claude — reconcile the decision ledger (1-system-manual/pm/DECISIONS.md) against the governed plans.
// Kyle 2026-11-04 (KD-6): "There needs to be a way to reconcile the decision log with the plans that are considered
// governance or canonical." READ-ONLY: it reads files at a git ref (default origin/migration/aws-supabase) and
// prints mismatches; it changes nothing. Exit 0 = reconciled, 1 = mismatches, 2 = could not read.
//
// THE CONTRACT IT CHECKS (method item 5 in DECISIONS.md):
//  (a) every decision's ANCHORS exist at the ref: each `file: token` pair in its "anchors" cell is searched for in
//      that file, on a line that is not struck through (e.g. `SPRINT_TO_LIVE_PLAN.md: KD-2`);
//  (b) every KD-number written anywhere in a governed file exists in the ledger (no orphan tags);
//  (c) a decision marked DONE has no plan line still carrying its anchor with an open status word.
// Governed files = the plans that set order and placement. Edit the list here, never per run.
import { execFileSync } from 'node:child_process';

const REF = process.argv.find((a) => a.startsWith('--ref='))?.slice(6) || 'origin/migration/aws-supabase';
const LEDGER = '1-system-manual/pm/DECISIONS.md';
const GOVERNED = {
  'SPRINT_TO_LIVE_PLAN.md': '1-system-manual/SPRINT_TO_LIVE_PLAN.md',
  'PRE_LIVE_SPRINT.md': 'Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md',
  'POST_AUDIT_ROADMAP.md': '1-system-manual/POST_AUDIT_ROADMAP.md',
  'RUNNING_ISSUES.md': '1-system-manual/RUNNING_ISSUES.md',
  'PM_CLAUDE_RULES.md': '1-system-manual/PM_CLAUDE_RULES.md',
};
const OPEN_WORDS = /\b(QUEUED|IN FLIGHT|OPEN|PARKED|row)\b/;
const STRUCK = /~~/;

function show(path) {
  // A failed read must refuse, never read as "absent" (CLAUDE.md rule 22).
  try { return execFileSync('git', ['show', `${REF}:${path}`], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
  catch (e) { console.error(`REFUSED: cannot read ${path} at ${REF}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
}

const ledger = show(LEDGER);
const lines = ledger.split(/\r?\n/);
const header = lines.find((l) => l.startsWith('| D | date |'));
if (!header) { console.error('REFUSED: ledger table header not found'); process.exit(2); }
const cols = header.split('|').map((c) => c.trim());
const iAnch = cols.indexOf('anchors');
const iStat = cols.indexOf('status');
if (iAnch < 0 || iStat < 0) { console.error('REFUSED: ledger header lacks "anchors" or "status"'); process.exit(2); }
const rows = lines.filter((l) => /^\| KD-\d+ \|/.test(l));
if (rows.length === 0) { console.error('REFUSED: ledger parsed to zero decisions'); process.exit(2); }

const files = Object.fromEntries(Object.entries(GOVERNED).map(([k, p]) => [k, show(p)]));
const problems = [];
const known = new Set();
for (const r of rows) {
  const c = r.split('|').map((x) => x.trim());
  const d = c[1];
  known.add(d);
  const status = c[iStat] || '';
  const anchors = (c[iAnch] || '').split(';').map((x) => x.trim()).filter(Boolean);
  if (anchors.length === 0) { problems.push(`${d}: empty anchors cell (write "none — <why>" if it changes no plan)`); continue; }
  for (const a of anchors) {
    if (/^none\b/i.test(a)) continue;
    const m = /^([\w.]+):\s*(.+)$/.exec(a);
    if (!m || !files[m[1]]) { problems.push(`${d}: anchor "${a}" names no governed file`); continue; }
    const tok = m[2].replace(/^`|`$/g, '');
    const live = files[m[1]].split(/\r?\n/).filter((l) => l.includes(tok) && !STRUCK.test(l));
    if (live.length === 0) problems.push(`${d}: anchor "${tok}" NOT FOUND on an unstruck line of ${m[1]} at ${REF}`);
    if (/^DONE\b/.test(status) && m[1] !== 'RUNNING_ISSUES.md'
        && live.some((l) => OPEN_WORDS.test(l.split('|').slice(-3).join('|'))))
      problems.push(`${d}: ledger says DONE but a ${m[1]} line carrying "${tok}" still reads open`);
  }
}
for (const [k, text] of Object.entries(files)) {
  for (const m of text.matchAll(/\bKD-(\d+)\b/g)) {
    const d = `KD-${m[1]}`;
    if (!known.has(d)) problems.push(`${k}: carries ${d}, which is not in the ledger`);
  }
}
const uniq = [...new Set(problems)];
console.log(`reconcile-decisions @ ${REF}: ${rows.length} decisions, ${Object.keys(files).length} governed files, ${uniq.length} mismatch(es)`);
for (const p of uniq) console.log('  - ' + p);
process.exit(uniq.length ? 1 : 0);
