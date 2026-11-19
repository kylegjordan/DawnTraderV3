#!/usr/bin/env node
// B-TOKEN-ECONOMY OBJ-6 / P6 (PM Claude, 2026-11-19): §10.5 alert injection BY CHANGE, with state rules.
//
// WHY: the UserPromptSubmit hook injected the full due list on 1,732 of 2,624 prompts in the baseline window
// (median 21 due; Change Lists/B_TOKEN_ECONOMY_BASELINE.md). An unchanged list repeated every prompt is pure cost.
//
// ONE shared script, three uses:
//   1. imported by .claude/hooks/inject-due-alerts.mjs: computeDelta / renderDelta / shadowStep (pure + state I/O);
//   2. `--reset` on SessionStart (startup|resume|compact): the session's NEXT prompt gets the full list again;
//   3. `--verify`: recompute every logged shadow delta from the logged sets and report PASS / mismatches.
//
// STATE RULES (scope OBJ-6, Langston Step-1 + Coltrane 11-19 condition 4):
//   - the first prompt after start, resume or compaction gets the FULL list (state reset);
//   - later prompts get changes only: new, owner, severity, title, gone (resolved, acked or no longer due);
//   - every prompt gets a count line that tells zero, unchanged and check-failed apart;
//   - the baseline advances ONLY after a complete successful read (the remote COUNT line was seen);
//   - SHADOW FIRST: the hook keeps injecting the full list and only LOGS the delta it would inject, until --verify
//     is PASS over >= 50 prompts or >= 3 days AND Langston has reviewed the log. Switching is a separate commit.
// FAIL-OPEN: every function here swallows its own errors; a state problem means "full list", never silence.
// Codex has no hooks; it keeps the full manual read (pre-audit PREVIOUSLY/NOW block 2).
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const VERSION = 'alert-delta 1.1 (B-TOKEN-ECONOMY P6, shadow)';
const BASE = () => process.env.ALERT_DELTA_DIR || join(homedir(), '.claude', 'cc-wake-state', 'alert-delta'); // env: tests only
const SHADOW_LOG = () => process.env.ALERT_DELTA_LOG || join(homedir(), '.claude', 'alert-delta-shadow.jsonl');
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
// Step-4 defect 3 (Langston): the shadow log is bounded. Past LOG_MAX_BYTES it rotates to `<log>.1` (one kept);
// --verify reads `.1` then the live file.
const LOG_MAX_BYTES = 5 * 1024 * 1024;
function appendLog(line, enc) {
  const f = SHADOW_LOG();
  try { if (statSync(f).size > LOG_MAX_BYTES) renameSync(f, f + '.1'); } catch { /* no log yet */ }
  appendFileSync(f, line, enc);
}

// alerts: [{id, sev, title}] (complete due set); owners: the wake filter's owner record or null.
export function currentSet(alerts, owners) {
  const out = {};
  for (const a of alerts) {
    if (!a || !a.id) continue;
    const rec = owners && Object.prototype.hasOwnProperty.call(owners, a.id) ? owners[a.id] : undefined;
    out[a.id] = { sev: String(a.sev || ''), title: String(a.title || ''), owner: rec && rec.owner ? String(rec.owner) : null };
  }
  return out;
}

// Pure: prev and cur are id -> {sev,title,owner}. prev === null means "no baseline": a full list is due.
export function computeDelta(prev, cur) {
  if (!prev) return { full: true, due: Object.keys(cur).length };
  const added = [], changed = [], gone = [];
  let unchanged = 0;
  for (const id of Object.keys(cur).sort()) {
    const p = prev[id], c = cur[id];
    if (!p) { added.push(id); continue; }
    const fields = ['sev', 'owner', 'title'].filter((f) => (p[f] ?? null) !== (c[f] ?? null));
    if (fields.length) changed.push({ id, fields, from: Object.fromEntries(fields.map((f) => [f, p[f] ?? null])) });
    else unchanged += 1;
  }
  for (const id of Object.keys(prev).sort()) if (!cur[id]) gone.push(id);
  return { full: false, due: Object.keys(cur).length, added, changed, gone, unchanged };
}

// visible: a Set of ids this session is shown (narrowed sessions), or null for "all". Hidden ids still count.
export function renderDelta(d, cur, prev, visible = null) {
  if (d.full) return null; // caller injects the full list
  const show = (id) => !visible || visible.has(id);
  const line = (id, a) => `• ${id.slice(0, 8)}… [${a.sev}] ${a.title}  (full id: ${id})`;
  const out = [];
  const nNew = d.added.length, nCh = d.changed.length, nGone = d.gone.length;
  if (d.due === 0 && nGone === 0) return '§10.5: 0 due alerts — the filter ran.';
  if (!nNew && !nCh && !nGone) return `§10.5: ${d.due} due, UNCHANGED since your last prompt (${d.unchanged} unchanged) — the filter ran.`;
  out.push(`§10.5 CHANGES since your last prompt — ${d.due} due: ${nNew} new, ${nCh} changed, ${nGone} gone, ${d.unchanged} unchanged.`);
  for (const id of d.added) if (show(id)) out.push(`NEW ${line(id, cur[id])}`);
  for (const c of d.changed) if (show(c.id)) out.push(`CHANGED (${c.fields.map((f) => `${f}: ${c.from[f] ?? '-'} → ${cur[c.id][f] ?? '-'}`).join('; ')}) ${line(c.id, cur[c.id])}`);
  for (const id of d.gone) out.push(`GONE • ${id.slice(0, 8)}… ${prev[id].title} (resolved, acknowledged or no longer due)  (full id: ${id})`);
  const hidden = [...d.added, ...d.changed.map((c) => c.id)].filter((id) => !show(id)).length;
  if (hidden) out.push(`${hidden} of the new or changed are routed to other sessions — not yours to raise.`);
  return out.join('\n');
}

function statePath(sessionId) {
  if (!SAFE_ID.test(String(sessionId || ''))) return null;
  return join(BASE(), `${sessionId}.json`);
}
export function loadState(sessionId) {
  const p = statePath(sessionId);
  if (!p) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
function saveState(sessionId, st) {
  const p = statePath(sessionId);
  if (!p) return false;
  try {
    mkdirSync(BASE(), { recursive: true });
    writeFileSync(`${p}.tmp`, JSON.stringify(st), 'utf8');
    renameSync(`${p}.tmp`, p); // atomic replace: a crash mid-write leaves the old baseline, never a half file
    return true;
  } catch { return false; }
}
const hashSet = (s) => createHash('sha256').update(JSON.stringify(Object.keys(s || {}).sort())).digest('hex').slice(0, 12);

// Called by the hook on EVERY prompt. ok=false (check failed) logs and never advances the baseline.
// Returns the text the delta path WOULD inject (null = full list), for the shadow log only.
export function shadowStep({ sessionId, alias, ok, why, alerts, owners, visible }) {
  try {
    const st = loadState(sessionId) || {};
    const ts = new Date().toISOString();
    if (!ok) {
      appendLog(JSON.stringify({ ts, v: VERSION, session_id: sessionId, alias, status: 'check_failed', why,
        would_inject: `ALERT CHECK COULD NOT RUN (${why}) — not "no alerts"; baseline kept.` }) + '\n', 'utf8');
      return;
    }
    const cur = currentSet(alerts, owners);
    const prev = st.reset || !st.baseline ? null : st.baseline;
    const d = computeDelta(prev, cur);
    const text = renderDelta(d, cur, prev, visible ? new Set(visible) : null);
    appendLog(JSON.stringify({ ts, v: VERSION, session_id: sessionId, alias, status: 'ok',
      prev_kind: st.reset ? `reset:${st.reset_source || '?'}` : (st.baseline ? 'baseline' : 'none'),
      prev_hash: prev ? hashSet(prev) : null, cur, delta: d, would_inject: text ?? 'FULL LIST' }) + '\n', 'utf8');
    saveState(sessionId, { baseline: cur, reset: false, updated_at: ts, v: VERSION }); // advances only here
  } catch { /* shadow only: never affects the session */ }
}

// SessionStart (startup|resume|compact): the next prompt gets the full list.
function reset() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin */ }
  let j = {};
  try { j = JSON.parse(raw || '{}'); } catch { /* fail-open */ }
  const st = loadState(j.session_id) || {};
  saveState(j.session_id, { ...st, reset: true, reset_source: String(j.source || 'unknown'), reset_at: new Date().toISOString() });
}

// Step-4 defects 1+2 (Langston): sufficiency counts VERIFIED DELTAS (rows that recompute a delta), not OK prompts,
// and there is no days leg (a quiet session measures nothing). Only PASS exits 0: FAIL 1, unreadable 2, NOT YET 3.
export function verdictOf(counts, mismatches, minDeltas) {
  if (mismatches) return { verdict: `FAIL (${mismatches} mismatches)`, code: 1 };
  if (counts.delta < minDeltas) return { verdict: `NOT YET (${counts.delta} of ${minDeltas} verified deltas)`, code: 3 };
  return { verdict: `PASS (${counts.delta} verified deltas, 0 mismatches)`, code: 0 };
}

// Recompute each logged delta: for a 'baseline' row the previous OK row of the same session must hash to
// prev_hash, and computeDelta(prevRow.cur, row.cur) must equal the logged delta.
function verify(argv) {
  const minDeltas = Number((argv.find((a) => a.startsWith('--min-deltas=')) || '=50').split('=')[1]);
  const files = [SHADOW_LOG() + '.1', SHADOW_LOG()].filter((f) => existsSync(f));
  if (!files.length) { console.log(`VERIFY: cannot read ${SHADOW_LOG()} (no log) — NOT a pass`); process.exit(2); }
  const rotated = files.length === 2;
  const rows = [];
  try {
    for (const [i, f] of files.entries()) {
      for (const l of readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean)) {
        let r; try { r = JSON.parse(l); } catch { r = { bad: l.slice(0, 80) }; }
        r._oldest = rotated && i === 0;
        rows.push(r);
      }
    }
  } catch (e) { console.log(`VERIFY: cannot read the log (${e.code}) — NOT a pass`); process.exit(2); }
  const last = {}, bad = [], counts = { ok: 0, check_failed: 0, full: 0, delta: 0, unanchored: 0, unparsed: 0 };
  for (const r of rows) {
    if (r.bad) { counts.unparsed += 1; bad.push(`unparsed: ${r.bad}`); continue; }
    if (r.status === 'check_failed') { counts.check_failed += 1; continue; }
    counts.ok += 1;
    if (r.prev_kind === 'baseline') {
      const p = last[r.session_id];
      // Limit, stated: in the rotated-out file a session's first baseline row may have its predecessor in a file
      // already dropped, so it is counted 'unanchored' (neither a mismatch nor a verified delta).
      if (!p && r._oldest) counts.unanchored += 1;
      else if (!p) bad.push(`${r.ts} ${r.session_id}: baseline row with no earlier OK row in the log`);
      else {
        counts.delta += 1;
        if (hashSet(p.cur) !== r.prev_hash) bad.push(`${r.ts} ${r.session_id}: prev_hash does not match the previous OK row`);
        const re = computeDelta(p.cur, r.cur);
        if (JSON.stringify(re) !== JSON.stringify(r.delta)) bad.push(`${r.ts} ${r.session_id}: recomputed delta differs`);
      }
    } else counts.full += 1;
    last[r.session_id] = r;
  }
  const ts = rows.filter((r) => r.ts).map((r) => Date.parse(r.ts));
  const days = ts.length ? (Math.max(...ts) - Math.min(...ts)) / 86400000 : 0;
  console.log(JSON.stringify({ v: VERSION, logs: files, rows: rows.length, counts, sessions: Object.keys(last).length,
    span_days: Number(days.toFixed(2)), mismatches: bad.length }, null, 1));
  for (const b of bad.slice(0, 20)) console.log(`MISMATCH ${b}`);
  const { verdict, code } = verdictOf(counts, bad.length, minDeltas);
  console.log(`VERDICT: ${verdict}`);
  process.exit(code);
}

function selfTest() {
  const A = { a1: { sev: 'warning', title: 'T1', owner: null }, a2: { sev: 'info', title: 'T2', owner: 'CC-A' } };
  const checks = [];
  const eq = (n, x, y) => checks.push([n, JSON.stringify(x) === JSON.stringify(y)]);
  eq('no baseline gives full', computeDelta(null, A), { full: true, due: 2 });
  const same = computeDelta(A, A);
  eq('unchanged queue', [same.added.length, same.changed.length, same.gone.length, same.unchanged], [0, 0, 0, 2]);
  checks.push(['unchanged is said, not silent', /UNCHANGED/.test(renderDelta(same, A, A))]);
  const B = { ...A, a3: { sev: 'critical', title: 'T3', owner: null } };
  const n = computeDelta(A, B);
  eq('seeded alert is new once', n.added, ['a3']);
  eq('then unchanged', computeDelta(B, B).added, []);
  const C = { a1: { sev: 'critical', title: 'T1', owner: 'CC-B' } };
  const c = computeDelta(A, C);
  eq('severity and owner change', c.changed[0].fields, ['sev', 'owner']);
  eq('gone', c.gone, ['a2']);
  checks.push(['zero is said', renderDelta(computeDelta({}, {}), {}, {}) === '§10.5: 0 due alerts — the filter ran.']);
  const hid = renderDelta(n, B, A, new Set(['a1']));
  checks.push(['hidden new is counted, not listed', /1 of the new or changed/.test(hid) && !/NEW .*a3/.test(hid)]);
  checks.push(['unsafe session id refused', statePath('../x') === null]);
  eq('zero verified deltas is NOT YET, exit 3', verdictOf({ ok: 1, delta: 0 }, 0, 50).code, 3);
  eq('OK prompts without deltas do not pass', verdictOf({ ok: 500, delta: 49 }, 0, 50).code, 3);
  eq('enough verified deltas pass, exit 0', verdictOf({ ok: 60, delta: 50 }, 0, 50).code, 0);
  eq('any mismatch fails, exit 1', verdictOf({ ok: 60, delta: 60 }, 1, 50).code, 1);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`${checks.length - failed}/${checks.length} passed`);
  process.exit(failed ? 1 : 0);
}

const isMain = (() => {
  try {
    const norm = (p) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
    return !!process.argv[1] && norm(process.argv[1]) === norm(fileURLToPath(import.meta.url));
  } catch { return false; }
})();
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--reset')) { try { reset(); } catch { /* fail-open */ } process.exit(0); }
  if (argv.includes('--verify')) verify(argv);
  else if (argv.includes('--self-test')) selfTest();
  else { console.log(`${VERSION}\nusage: --reset (SessionStart, stdin) | --verify [--min-deltas=50] | --self-test`); process.exit(0); }
}
