#!/usr/bin/env node
// PM Claude — THE SLOT CHECK GATHERER (scope OBJ-9, KD-28; pre-audit section 9, P1d-2). DETERMINISTIC: no model tokens.
//   node scripts/pm/slot-check.mjs --owner <CC-A|CC-B|CC-C|CC-INFRA> --item "<what is being slotted>"
//        [--ref=<git ref, default origin/migration/aws-supabase>] [--origin-ref=<default origin/migration/aws-supabase>]
//        [--out-dir=<dir, default 1-system-manual/pm/slot-checks>] [--no-fetch] [--now=<ISO time>]
// Fetches first (C1: reconcile-decisions has no fetch, so copying it would rebuild the 11-04 stale-queue miss, #449),
// reads the plan, pre-sprint table, the owner's task list and DECISIONS.md AT THE REF, and writes one dated record.
// The record header states the ref sha, the origin head sha and FRESH or DEGRADED. DEGRADED = the ref is behind origin,
// the fetch failed or was skipped, or a required section could not be read. Guard 1 treats a DEGRADED record as absent.
// Open/closed uses the checker's own predicates (C2, #448): cellClosed + mapStatus. No third definition.
// An unreadable or unparseable source REFUSES in the record (UNREADABLE / UNPARSEABLE), it is never printed as EMPTY (#453).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planRowsByBatch, presprintRows, mapStatus, idsInCell } from '../governance-checker/checker.mjs';
import { cellClosed } from '../governance-checker/census.mjs';

export const DEFAULT_REF = 'origin/migration/aws-supabase';
export const CODING = ['CC-A', 'CC-B', 'CC-C', 'CC-INFRA'];
const ORDER = [...CODING, 'CC-PM'];
const PLAN = '1-system-manual/SPRINT_TO_LIVE_PLAN.md';
const LEDGER = '1-system-manual/pm/DECISIONS.md';
const TASKLISTS = {
  'CC-A': '1-system-manual/CC_A_SESSION_TASK_LIST.md',
  'CC-B': '1-system-manual/CC_B_SESSION_TASK_LIST.md',
  'CC-C': '1-system-manual/CC_C_SESSION_TASK_LIST.md',
  'CC-INFRA': '1-system-manual/CC_INFRA_SESSION_TASK_LIST.md',
};

// ── THE NAMED BINDS NORMALISATION TABLE (P1d-2; NOT firstSession, which drops owners, D2b) ──────────────────────
// Order of operations matters: (1) `(released)` becomes a marker, (2) EVERY other parenthetical is removed whole
// (a note, even when it names another session, e.g. `OLD Claude (NEW Claude has the adjacent row)`), (3) tokens.
const MARK = '⟦R⟧';
const PARTIES = { langston: 'Langston', coltrane: 'Coltrane', kyle: 'Kyle', 'pm codex': 'PM Codex' };
const TOKEN = new RegExp(`\\b(CC-(?:A|B|C|INFRA|PM)|PM Codex|PM Claude|Langston|Coltrane|Kyle|all sessions|all four|the crew|Claude (?:Old|New|Analyst)|(?:OLD|NEW|ANALYST|INFRA)(?: Claude)?)\\b(\\s*${MARK})?`, 'gi');
function sessionOfToken(t) {
  const u = t.toUpperCase();
  if (u === 'CC-A' || u === 'OLD' || u === 'OLD CLAUDE' || u === 'CLAUDE OLD') return 'CC-A';
  if (u === 'CC-B' || u === 'NEW' || u === 'NEW CLAUDE' || u === 'CLAUDE NEW') return 'CC-B';
  if (u === 'CC-C' || u === 'ANALYST' || u === 'ANALYST CLAUDE' || u === 'CLAUDE ANALYST') return 'CC-C';
  if (u === 'CC-INFRA' || u === 'INFRA' || u === 'INFRA CLAUDE') return 'CC-INFRA';
  if (u === 'CC-PM' || u === 'PM CLAUDE') return 'CC-PM';
  return null;
}
export function resolveBinds(cell) {
  let s = String(cell ?? '').replace(/[*`]/g, '').replace(/\(\s*released\s*\)/gi, ` ${MARK} `);
  for (let i = 0; i < 6 && /\([^()]*\)/.test(s); i++) s = s.replace(/\([^()]*\)/g, ' ');
  const sessions = new Set(), released = new Set(), parties = new Set();
  let all = false, recognised = 0;
  for (const m of s.matchAll(TOKEN)) {
    const tok = m[1], low = tok.toLowerCase(), marked = !!m[2];
    if (/^(all sessions|all four|the crew)$/.test(low)) { all = true; recognised++; continue; }
    if (PARTIES[low]) { parties.add(PARTIES[low]); recognised++; continue; }
    // A bare OLD / NEW / ANALYST is a name only in capitals (or `Infra`), so the prose words "old", "new" never bind.
    if (!/ claude$/i.test(tok) && !/^CC-/i.test(tok) && !/^claude /i.test(tok) && tok !== tok.toUpperCase() && tok !== 'Infra') continue;
    const sess = sessionOfToken(tok);
    if (!sess) continue;
    recognised++;
    (marked ? released : sessions).add(sess);
  }
  if (all) for (const c of CODING) sessions.add(c);
  const rest = s.split(MARK).join('').trim();
  const empty = rest === '' || /^(none|n\/a|[—–-])/i.test(rest);
  return {
    sessions: ORDER.filter((x) => sessions.has(x)),
    released: ORDER.filter((x) => released.has(x) && !sessions.has(x)),
    parties: [...parties],
    unresolved: recognised === 0 && !empty,
  };
}
const owns = (cell, owner) => resolveBinds(cell).sessions.includes(owner);

// ── git readers ────────────────────────────────────────────────────────────────────────────────────────────────
function git(args, cwd) { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] }); }
function readAt(cwd, ref, path) {
  try { return { ok: true, text: git(['show', `${ref}:${path}`], cwd) }; }
  catch (e) { return { ok: false, err: String(e.stderr || e.message).split('\n')[0] }; }
}

// ── tables ────────────────────────────────────────────────────────────────────────────────────────────────────
const cellsOf = (line) => { let s = line.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|')) s = s.slice(0, -1); return s.split('|').map((c) => c.trim()); };
const isSep = (l) => /^\|[\s:|-]+\|?\s*$/.test(l.trim());
function firstTableAfter(lines, from) {
  let i = from;
  while (i < lines.length && !lines[i].trim().startsWith('|')) i++;
  const out = [];
  while (i < lines.length && lines[i].trim().startsWith('|')) out.push(lines[i++]);
  return out;
}
const T = (s, n = 160) => { const x = String(s).replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n - 1) + '…' : x; };
const closedStatus = (cell) => cellClosed(cell) || ['done', 'moved'].includes(mapStatus(cell).state);

// Parse CC-A's `## 00.` order table; the other three lists are emitted verbatim, UNPARSEABLE (C3).
function parseTaskList(owner, text) {
  const lines = text.split(/\r?\n/);
  if (owner === 'CC-A') {
    const h = lines.findIndex((l) => /^## 00\./.test(l));
    if (h >= 0) {
      const tbl = firstTableAfter(lines, h + 1);
      const want = ['#', 'item', 'status', 'decision'];
      if (tbl.length >= 2 && JSON.stringify(cellsOf(tbl[0]).map((c) => c.toLowerCase())) === JSON.stringify(want)) {
        const rows = tbl.slice(1).filter((l) => !isSep(l)).map((l) => { const c = cellsOf(l); return { n: c[0], item: c[1] || '', status: c[2] || '', decision: c[3] || '' }; });
        return { parsed: true, rows };
      }
    }
  }
  const tbl = firstTableAfter(lines, 0);
  return { parsed: false, header: tbl[0] ? tbl[0].trim() : '(no table found)', verbatim: tbl };
}

// ── THE RECORD BODY (pure over texts, so fixtures can drive it) ─────────────────────────────────────────────────
// src = { planText, ledgerText, taskText }: each a string or { error }. Returns { body, reasons }.
const S_DEC = '4. Decisions binding the owner and not DONE (newest first; last 48 h flagged)';
export function buildSections(owner, src, nowMs) {
  const out = [], reasons = [];
  const section = (title, lines) => { out.push(`## ${title}`, ''); out.push(...(lines.length ? lines : ['EMPTY']), ''); };
  const bad = (title, what, err) => { reasons.push(`${what} unreadable`); out.push(`## ${title}`, '', `UNREADABLE (${what}): ${err} — this is a refusal, not an empty queue`, ''); };

  let plan = null, ps = null;
  if (typeof src.planText !== 'string') {
    const err = src.planText?.error ?? 'no plan text';
    bad('1. Open plan rows (plan order)', 'plan', err); bad('2. Pre-sprint rows', 'plan', err);
  } else {
    try { plan = planRowsByBatch(src.planText); } catch (e) { bad('1. Open plan rows (plan order)', 'plan section 4/5', e.message); }
    try { ps = presprintRows(src.planText); } catch (e) { bad('2. Pre-sprint rows', 'plan section 0a', e.message); }
  }
  const s4ByNo = new Map();
  if (plan) {
    const all = [];
    for (const v of plan.rows.values()) all.push(...v.s4, ...v.s5);
    all.push(...plan.unparsed);
    for (const r of all) if (r.section === 4 && r.rowNo) s4ByNo.set(String(r.rowNo), r);
    const mine = all.filter((r) => owns(r.owner, owner) && !closedStatus(r.section === 4 ? r.status : r.closes)).sort((a, b) => a.lineNo - b.lineNo);
    section('1. Open plan rows (plan order)', mine.map((r) => r.section === 4
      ? `- section 4 row ${r.rowNo} (line ${r.lineNo}) [${mapStatus(r.status).state}] ${T(r.batch, 60)} — ${T(r.item)} — status: ${T(r.status, 80)}`
      : `- section 5 (line ${r.lineNo}) ${T(r.item)} — closes: ${T(r.closes, 80)}`));
  }
  if (ps) {
    const mine = ps.items.filter((r) => {
      if (!owns(r.owner, owner)) return false;
      if (r.planRow) { const row = s4ByNo.get(String(r.planRow)); return !(row && closedStatus(row.status)); }
      return !closedStatus(r.status);
    });
    const lines = mine.map((r) => `- stage ${T(r.stage, 50)} order ${r.order} (line ${r.lineNo}) ${T(r.item, 90)}${r.planRow ? ` — plan row ${r.planRow}${s4ByNo.has(String(r.planRow)) ? '' : ' (NOT FOUND in section 4)'}` : ''} — status: ${T(r.status, 40)} — waiting on: ${T(r.waitingOn, 60)}`);
    if (ps.malformed.length) lines.push(`- NOTE: ${ps.malformed.length} malformed pre-sprint line(s) the reader could not place: ${ps.malformed.map((m) => m.lineNo).join(', ')}`);
    section('2. Pre-sprint rows', lines);
  }

  // task list
  let tl = null;
  if (typeof src.taskText !== 'string') bad('3. Task list', 'task list', src.taskText?.error ?? 'no text');
  else {
    tl = parseTaskList(owner, src.taskText);
    if (tl.parsed) section('3. Task list (parsed: CC-A section 00 order table)', tl.rows.map((r) => `- ${r.n}. ${T(r.item, 140)} — status: ${T(r.status, 80)}${closedStatus(r.status) ? ' [closed]' : ''} — decision: ${T(r.decision, 50)}`));
    else out.push('## 3. Task list', '', `task-list: UNPARSEABLE (${tl.header})`, '', 'First table, verbatim:', '', ...(tl.verbatim.length ? tl.verbatim : ['(none)']), '');
  }

  // decisions
  if (typeof src.ledgerText !== 'string') bad(S_DEC, 'DECISIONS.md', src.ledgerText?.error ?? 'no text');
  else {
    const lines = src.ledgerText.split(/\r?\n/);
    const header = lines.find((l) => l.startsWith('| D | date |'));
    const cols = header ? header.split('|').map((c) => c.trim()) : [];
    const ix = Object.fromEntries(['date', 'decision', 'binds', 'status'].map((k) => [k, cols.indexOf(k)]));
    if (!header || Object.values(ix).some((v) => v < 0)) bad(S_DEC, 'DECISIONS.md', 'ledger header not found or lacks date/decision/binds/status');
    else {
      const rows = lines.filter((l) => /^\| KD-\d+ \|/.test(l)).map((l) => { const c = l.split('|').map((x) => x.trim()); return { id: c[1], num: Number(c[1].slice(3)), date: c[ix.date], decision: c[ix.decision], binds: c[ix.binds], status: c[ix.status] }; });
      const picked = rows.map((r) => ({ ...r, b: resolveBinds(r.binds) }))
        .filter((r) => !/^DONE\b/i.test(r.status.replace(/[*`]/g, '')) && (r.b.sessions.includes(owner) || r.b.unresolved))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.num - a.num));
      section(S_DEC, picked.map((r) => {
        const recent = nowMs - Date.parse(`${r.date}T23:59:59Z`) <= 48 * 3600e3;
        const note = r.b.unresolved ? ` [binds UNRESOLVED: "${T(r.binds, 60)}"]` : '';
        const par = r.b.parties.length ? ` [also: ${r.b.parties.join(', ')}]` : '';
        return `- ${r.id} (${r.date})${recent ? ' [LAST 48 H]' : ''} status ${T(r.status, 30)}${note}${par} — ${T(r.decision, 200)}`;
      }));
    }
  }

  // plan vs task list
  const dis = [];
  if (plan && tl?.parsed) {
    const listed = new Set();
    for (const t of tl.rows) {
      const tClosed = closedStatus(t.status);
      for (const id of idsInCell(t.item)) {
        listed.add(id);
        const e = plan.rows.get(id);
        if (!e) { if (!tClosed && !(ps?.items || []).some((r) => r.ids.includes(id))) dis.push(`- task-list item ${t.n} names ${id}, which is in no plan row and no pre-sprint row`); continue; }
        const planRows = [...e.s4, ...e.s5];
        const planClosed = planRows.every((r) => closedStatus(r.section === 4 ? r.status : r.closes));
        if (!tClosed && planClosed) dis.push(`- task-list item ${t.n} (${id}) reads open (${T(t.status, 40)}); every plan row for it reads closed`);
        if (tClosed && !planClosed) dis.push(`- task-list item ${t.n} (${id}) reads closed; a plan row for it is still open`);
      }
    }
    for (const [id, e] of plan.rows) {
      const rowsOwned = [...e.s4, ...e.s5].filter((r) => owns(r.owner, owner) && !closedStatus(r.section === 4 ? r.status : r.closes));
      if (rowsOwned.length && !listed.has(id)) dis.push(`- plan row ${rowsOwned[0].rowNo ?? '(section 5)'} (${id}) is open for ${owner} and is on no line of the task-list order table`);
    }
    section('5. Plan vs task list disagreements', dis);
  } else if (plan && tl && !tl.parsed) {
    out.push('## 5. Plan vs task list disagreements', '', 'NOT COMPARABLE: the task list is UNPARSEABLE, so nothing was compared (this is not an agreement).', '');
  } else {
    out.push('## 5. Plan vs task list disagreements', '', 'NOT COMPARABLE: the plan or the task list was unreadable.', '');
  }
  return { body: out.join('\n'), reasons };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────
function arg(name, argv) {
  const p = `--${name}=`;
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(p));
  if (i < 0) return undefined;
  return argv[i].startsWith(p) ? argv[i].slice(p.length) : argv[i + 1];
}
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
const stampOf = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function main(argv = process.argv.slice(2)) {
  const ownerArg = arg('owner', argv), item = arg('item', argv);
  if (!ownerArg || !item) { console.error('usage: slot-check.mjs --owner <CC-A|CC-B|CC-C|CC-INFRA> --item "<text>" [--ref=] [--origin-ref=] [--out-dir=] [--no-fetch] [--now=]'); return 2; }
  const rb = resolveBinds(ownerArg);
  if (rb.sessions.length !== 1 || !CODING.includes(rb.sessions[0])) { console.error(`REFUSED: --owner "${ownerArg}" is not exactly one coding session`); return 2; }
  const owner = rb.sessions[0];
  const ref = arg('ref', argv) || DEFAULT_REF;
  const originRef = arg('origin-ref', argv) || (ref.startsWith('origin/') ? ref : DEFAULT_REF);
  const now = arg('now', argv) ? new Date(arg('now', argv)) : new Date();
  const cwd = process.cwd();
  const reasons = [];
  let top = cwd;
  try { top = git(['rev-parse', '--show-toplevel'], cwd).trim(); } catch { /* not a repo: the reads below refuse */ }
  if (!argv.includes('--no-fetch')) {
    try {
      const slash = originRef.indexOf('/');
      git(['fetch', '--quiet', slash > 0 ? originRef.slice(0, slash) : 'origin', slash > 0 ? originRef.slice(slash + 1) : originRef], cwd);
    } catch (e) { reasons.push(`fetch failed (${String(e.stderr || e.message).split('\n')[0]})`); }
  } else reasons.push('fetch skipped (--no-fetch)');
  let refSha = null, originSha = null;
  try { refSha = git(['rev-parse', '--verify', `${ref}^{commit}`], cwd).trim(); } catch { reasons.push(`ref ${ref} does not resolve`); }
  try { originSha = git(['rev-parse', '--verify', `${originRef}^{commit}`], cwd).trim(); } catch { reasons.push(`origin head ${originRef} does not resolve`); }
  if (refSha && originSha && refSha !== originSha) {
    let ahead = false;
    try { git(['merge-base', '--is-ancestor', originSha, refSha], cwd); ahead = true; } catch { /* origin head is not an ancestor of the ref */ }
    if (!ahead) reasons.push('ref is behind origin head');
  }
  const rd = (p) => { if (!refSha) return { error: 'ref unresolved' }; const r = readAt(cwd, refSha, p); return r.ok ? r.text : { error: r.err }; };
  const sections = buildSections(owner, { planText: rd(PLAN), ledgerText: rd(LEDGER), taskText: rd(TASKLISTS[owner]) }, now.getTime());
  reasons.push(...sections.reasons);
  const degraded = reasons.length > 0;
  const head = [
    `# PM slot check — ${owner}`,
    '',
    `- ref: ${ref}`,
    `- ref-sha: ${refSha ?? 'UNRESOLVED'}`,
    `- origin-head: ${originSha ?? 'UNRESOLVED'}`,
    `- freshness: ${degraded ? 'DEGRADED' : 'FRESH'}`,
    ...(degraded ? [`- degraded-because: ${reasons.join('; ')}`] : []),
    `- owner: ${owner}`,
    `- item: ${String(item).replace(/\s+/g, ' ')}`,
    `- generated: ${now.toISOString()}`,
    '',
  ].join('\n');
  const dir = resolve(top, arg('out-dir', argv) || '1-system-manual/pm/slot-checks');
  mkdirSync(dir, { recursive: true });
  let file = join(dir, `${stampOf(now)}_${owner}_${slugOf(item)}.md`);
  for (let n = 2; existsSync(file); n++) file = join(dir, `${stampOf(now)}_${owner}_${slugOf(item)}-${n}.md`); // never overwrite a record
  writeFileSync(file, head + '\n' + sections.body + '\n');
  console.log(`slot-check ${owner} @ ${ref} (${refSha ? refSha.slice(0, 9) : '?'}): ${degraded ? 'DEGRADED' : 'FRESH'}`);
  console.log(`record: ${file}`);
  for (const r of reasons) console.log(`  ! ${r}`);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(main());
