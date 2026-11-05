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
//  (c) a decision marked DONE has no plan line still carrying its anchor with an open status word;
//  (d) (P1d, KD-28 / Guard 2) a row whose `kind` is `placement` cites its slot-check record, `slot-check: <path>`,
//      or states `no-slot-check: <reason>`. A cited record must exist, must not be DEGRADED, and its header sha must be an
//      ancestor of the ref (`git merge-base --is-ancestor`). Problems of this kind print as `PLACEMENT: ...`.
// FLAGS:  --ref=<ref>   --index
//  --index reads the STAGED ledger blob (`git show :path`) instead of the ref's, and resolves a cited record
//  index -> ref ONLY (never the working tree: `git rm --cached <record>` leaves the file on disk, so a working-tree leg
//  would let a citation resolve after the record left the commit, r6 C5-B1). Governed plan files are still read at the
//  ref; in --index mode an unreadable one is a WARN line, not exit 2 (the commit hook blocks only on PLACEMENT lines).
//  Without --index (by hand) a cited record resolves ref -> working tree.
// It also prints the Guard-1 miss log (~/.claude/pm-slot-guard-misses.log, or $PM_SLOT_MISS_LOG), its named reader.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const REF = process.argv.find((a) => a.startsWith('--ref='))?.slice(6) || 'origin/migration/aws-supabase';
const INDEX = process.argv.includes('--index');
const LEDGER = '1-system-manual/pm/DECISIONS.md';
const RECORD_DIR = '1-system-manual/pm/slot-checks/';
const KINDS = new Set(['placement', 'other', 'pre-guard']);
const PRE_GUARD_MAX = 28; // KD-1..KD-28 were backfilled `pre-guard`; a newer row may not claim it.
const GOVERNED = {
  'SPRINT_TO_LIVE_PLAN.md': '1-system-manual/SPRINT_TO_LIVE_PLAN.md',
  'PRE_LIVE_SPRINT.md': 'Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md',
  'POST_AUDIT_ROADMAP.md': '1-system-manual/POST_AUDIT_ROADMAP.md',
  'RUNNING_ISSUES.md': '1-system-manual/RUNNING_ISSUES.md',
  'PM_CLAUDE_RULES.md': '1-system-manual/PM_CLAUDE_RULES.md',
};
const OPEN_WORDS = /\b(QUEUED|IN FLIGHT|OPEN|PARKED|row)\b/;
const STRUCK = /~~/;

const gitOut = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
const firstLine = (e) => String(e.stderr || e.message).split('\n')[0];

function show(path, spec = `${REF}:${path}`) {
  // A failed read must refuse, never read as "absent" (CLAUDE.md rule 22).
  try { return gitOut(['show', spec]); }
  catch (e) { console.error(`REFUSED: cannot read ${path} at ${spec.split(':')[0] || 'the index'}: ${firstLine(e)}`); process.exit(2); }
}
function tryShow(spec) { try { return gitOut(['show', spec]); } catch { return null; } }

const ledger = INDEX ? show(LEDGER, `:${LEDGER}`) : show(LEDGER);
const lines = ledger.split(/\r?\n/);
const header = lines.find((l) => l.startsWith('| D | date |'));
if (!header) { console.error('REFUSED: ledger table header not found'); process.exit(2); }
const cols = header.split('|').map((c) => c.trim());
const iAnch = cols.indexOf('anchors');
const iStat = cols.indexOf('status');
const iKind = cols.indexOf('kind');
if (iAnch < 0 || iStat < 0) { console.error('REFUSED: ledger header lacks "anchors" or "status"'); process.exit(2); }
const rows = lines.filter((l) => /^\| KD-\d+ \|/.test(l));
if (rows.length === 0) { console.error('REFUSED: ledger parsed to zero decisions'); process.exit(2); }

const warns = [];
const files = {};
for (const [k, p] of Object.entries(GOVERNED)) {
  if (!INDEX) { files[k] = show(p); continue; }
  const t = tryShow(`${REF}:${p}`);
  if (t === null) warns.push(`WARN: governed file ${p} unreadable at ${REF}; its anchor checks were skipped`); else files[k] = t;
}
const problems = []; // { kind: 'placement' | 'anchor', msg }
const add = (kind, msg) => problems.push({ kind, msg });
const known = new Set();

// ── (d) placement citations ─────────────────────────────────────────────────────────────────────────────────
function resolveRecord(path) {
  if (INDEX) {
    const a = tryShow(`:${path}`); if (a !== null) return { text: a, leg: 'index' };
    const b = tryShow(`${REF}:${path}`); if (b !== null) return { text: b, leg: 'ref' };
    return null;
  }
  const b = tryShow(`${REF}:${path}`); if (b !== null) return { text: b, leg: 'ref' };
  const w = resolve(process.cwd(), path);
  if (existsSync(w)) return { text: readFileSync(w, 'utf8'), leg: 'working tree (by hand only)' };
  return null;
}
function checkPlacement(d, kind, rowText) {
  if (!kind || !KINDS.has(kind)) { add('placement', `${d}: kind "${kind}" is missing or not one of placement | other | pre-guard`); return; }
  const num = Number(d.slice(3));
  if (kind === 'pre-guard') { if (num > PRE_GUARD_MAX) add('placement', `${d}: kind pre-guard is only for KD-1..KD-${PRE_GUARD_MAX}; a newer row is placement or other`); return; }
  if (kind !== 'placement') return;
  const no = /(?<![-\w])no-slot-check:\s*([^|;]*\S)/.exec(rowText);
  if (no) return;
  const cite = /(?<![-\w])slot-check:\s*`?([^\s`;|]+)`?/.exec(rowText);
  if (!cite) { add('placement', `${d}: a placement decision needs "slot-check: <record path>" or "no-slot-check: <reason>"`); return; }
  const path = cite[1].replace(/\\/g, '/').replace(/[.,]+$/, '');
  if (!path.startsWith(RECORD_DIR) || path.includes('..')) { add('placement', `${d}: cited record "${path}" is not under ${RECORD_DIR}`); return; }
  const rec = resolveRecord(path);
  if (!rec) { add('placement', `${d}: cited record ${path} NOT FOUND (${INDEX ? 'index, then ' + REF : REF + ', then the working tree'}); commit it in the same commit as the row`); return; }
  const fresh = /^- freshness:\s*(\S+)/m.exec(rec.text)?.[1];
  const sha = /^- ref-sha:\s*([0-9a-f]{7,40})\b/m.exec(rec.text)?.[1];
  if (fresh !== 'FRESH') { add('placement', `${d}: cited record ${path} is ${fresh || 'of unknown freshness'}, not FRESH`); return; }
  if (!sha) { add('placement', `${d}: cited record ${path} has no ref-sha in its header`); return; }
  try { execFileSync('git', ['merge-base', '--is-ancestor', sha, REF], { stdio: 'ignore' }); }
  catch (e) {
    if (e.status === 1) add('placement', `${d}: cited record ${path} was read at ${sha.slice(0, 9)}, which is not an ancestor of ${REF}`);
    else { console.error(`REFUSED: cannot check ancestry of ${sha} against ${REF}`); process.exit(2); }
  }
}

for (const r of rows) {
  const c = r.split('|').map((x) => x.trim());
  const d = c[1];
  known.add(d);
  if (iKind >= 0) checkPlacement(d, c[iKind] || '', r);
  const status = c[iStat] || '';
  const anchors = (c[iAnch] || '').split(';').map((x) => x.trim()).filter(Boolean);
  if (anchors.length === 0) { add('anchor', `${d}: empty anchors cell (write "none — <why>" if it changes no plan)`); continue; }
  for (const a of anchors) {
    if (/^none\b/i.test(a)) continue;
    const m = /^([\w.]+):\s*(.+)$/.exec(a);
    if (!m || !GOVERNED[m[1]]) { add('anchor', `${d}: anchor "${a}" names no governed file`); continue; }
    if (files[m[1]] === undefined) continue; // unreadable in --index mode: already a WARN
    const tok = m[2].replace(/^`|`$/g, '');
    const live = files[m[1]].split(/\r?\n/).filter((l) => l.includes(tok) && !STRUCK.test(l));
    if (live.length === 0) add('anchor', `${d}: anchor "${tok}" NOT FOUND on an unstruck line of ${m[1]} at ${REF}`);
    if (/^DONE\b/.test(status) && m[1] !== 'RUNNING_ISSUES.md'
        && live.some((l) => OPEN_WORDS.test(l.split('|').slice(-3).join('|'))))
      add('anchor', `${d}: ledger says DONE but a ${m[1]} line carrying "${tok}" still reads open`);
  }
}
for (const [k, text] of Object.entries(files)) {
  for (const m of text.matchAll(/\bKD-(\d+)\b/g)) {
    const d = `KD-${m[1]}`;
    if (!known.has(d)) add('anchor', `${k}: carries ${d}, which is not in the ledger`);
  }
}
const seen = new Set();
const uniq = problems.filter((p) => { const k = p.kind + p.msg; if (seen.has(k)) return false; seen.add(k); return true; });
console.log(`reconcile-decisions @ ${REF}${INDEX ? ' (--index: staged ledger)' : ''}: ${rows.length} decisions, ${Object.keys(files).length} governed files, ${uniq.length} mismatch(es)${iKind < 0 ? ' [no kind column at this ref: placement check skipped]' : ''}`);
for (const p of uniq) console.log('  - ' + (p.kind === 'placement' ? 'PLACEMENT: ' : '') + p.msg);
for (const w of warns) console.log('  ' + w);
// Guard 1's miss log has a named reader: this one.
const missLog = process.env.PM_SLOT_MISS_LOG || join(homedir(), '.claude', 'pm-slot-guard-misses.log');
try {
  if (existsSync(missLog)) {
    const ml = readFileSync(missLog, 'utf8').split(/\r?\n/).filter(Boolean);
    console.log(`Guard-1/2 miss log ${missLog}: ${ml.length} line(s)`);
    for (const l of ml.slice(-20)) console.log('  | ' + l);
  }
} catch (e) { console.log(`  WARN: miss log unreadable: ${firstLine(e)}`); }
// The P1d-1 probe log (does the app run PreToolUse on its own MCP tool?) has a named reader too: this one (Langston Step-4 C2).
const probeLog = process.env.PM_SLOT_PROBE_LOG || join(homedir(), '.claude', 'pm-slot-probe.log');
try {
  if (existsSync(probeLog)) {
    // Parsed as JSON, never matched as a substring, so a key reorder in the producer cannot produce a silent zero (Langston Step-4 condition 1).
    const pl = readFileSync(probeLog, 'utf8').split(/\r?\n/).filter(Boolean);
    const rows = pl.map((l) => { try { return { l, o: JSON.parse(l) }; } catch { return { l, o: null }; } });
    const bad = rows.filter((r) => !r.o).length;
    const inv = rows.filter((r) => r.o && r.o.kind !== 'verdict');
    const wrap = inv.filter((r) => r.o.tool_name === 'mcp__ccd_turn__wrap_up');
    const ver = rows.filter((r) => r.o && r.o.kind === 'verdict');
    const refused = ver.filter((r) => r.o.verdict === 'refuse').length;
    console.log(`P1d probe log ${probeLog}: ${inv.length} invocation line(s), ${wrap.length} from mcp__ccd_turn__wrap_up; ${ver.length} Guard-1 verdict(s) (${refused} refuse, ${ver.length - refused} allow)${bad ? `; ${bad} unparseable line(s)` : ''}`);
    for (const r of wrap.slice(-5)) console.log('  | ' + r.l);
    for (const r of ver.slice(-5)) console.log('  v ' + r.l);
  } else console.log(`P1d probe log ${probeLog}: absent (no PM-clone hook invocation recorded yet)`);
} catch (e) { console.log(`  WARN: probe log unreadable: ${firstLine(e)}`); }
process.exit(uniq.length ? 1 : 0);
