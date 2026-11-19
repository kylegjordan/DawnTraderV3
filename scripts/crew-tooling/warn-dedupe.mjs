#!/usr/bin/env node
// B-TOKEN-ECONOMY P7 / OBJ-7 (PM Claude, 2026-11-19) — show each advisory warning KIND once per
// session, until the next start, resume or compaction.
//
// Used by the three WARN-ONLY guards: guard-measurement-shape (PreToolUse), guard-stale-fetch
// (PreToolUse) and guard-result-shape's rare legs (PostToolUse). Pre-audit A4: they warned on every
// matching command, so the same paragraph was re-read dozens of times a session.
//
// ⛔ WHAT THIS DOES NOT TOUCH:
//   - the guards' SINKS. Every guard still writes its sink row on every event, fired or not:
//     hook-selftest proves a hook is running only from its sink (A4). Dedupe acts on the TEXT only.
//   - any BLOCKING guard. Only warn-only text is ever suppressed.
//   - guard-result-shape's cap-bound leg, which keeps its own per-command dedupe file.
//
// Key: one state file per session_id, holding the kinds already shown. The SessionStart hook
// (`startup|resume|compact`) runs `--reset`, which deletes that session's file, so the first warning
// after a compaction is shown again (the compacted context no longer holds it). SessionStart with
// source `compact` was observed firing (B-TOKEN-ECONOMY canary, Observation 2 #3).
//
// Fail-open throughout: no session id, an unsafe id, or any read/write error ⇒ the warning SHOWS.
// Test runs (GUARD_SYNTHETIC=1) never dedupe and never write state, unless WARN_DEDUPE_DIR is set —
// which is how this module's own tests switch it on in a scratch folder.

import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const VERSION = 'warn-dedupe 1.0 (B-TOKEN-ECONOMY P7)';
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const SWEEP_DAYS = 7;

function dir() { return process.env.WARN_DEDUPE_DIR || join(homedir(), '.claude', 'cc-wake-state', 'warn-dedupe'); }
function active() { return !(process.env.GUARD_SYNTHETIC === '1' && !process.env.WARN_DEDUPE_DIR); }
function fileFor(sid) { return SAFE_ID.test(String(sid || '')) ? join(dir(), sid + '.json') : null; }

// Returns the subset of `kinds` NOT yet shown in this session, and records them as shown.
// Anything that goes wrong returns all of `kinds` (show everything).
export function unseen(sessionId, kinds) {
  const list = [...new Set(kinds)];
  if (!active()) return list;
  const f = fileFor(sessionId);
  if (!f) return list;
  try {
    let state = {};
    try { state = JSON.parse(readFileSync(f, 'utf8')) || {}; } catch { state = {}; }
    const fresh = list.filter((k) => !state[k]);
    if (fresh.length) {
      const now = new Date().toISOString();
      for (const k of fresh) state[k] = now;
      mkdirSync(dir(), { recursive: true });
      const tmp = f + '.' + process.pid + '.tmp';
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, f);
    }
    return fresh;
  } catch { return list; }
}

export const NOTE = '(each kind shown once per session until the next compaction)';

export function reset(sessionId) {
  const f = fileFor(sessionId);
  if (f) { try { unlinkSync(f); } catch { /* absent is fine */ } }
  // Housekeeping: files of sessions idle for a week.
  try {
    const cut = Date.now() - SWEEP_DAYS * 864e5;
    for (const n of readdirSync(dir())) {
      if (!n.endsWith('.json')) continue;
      const p = join(dir(), n);
      try { if (statSync(p).mtimeMs < cut) unlinkSync(p); } catch { /* */ }
    }
  } catch { /* no dir yet */ }
}

function selfTest() {
  const base = join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'warn-dedupe-selftest-' + process.pid);
  process.env.WARN_DEDUPE_DIR = base;
  const results = [];
  const check = (name, ok) => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check('first sight shows', eq(unseen('s1', ['a']), ['a']));
  check('identical repeat suppressed', eq(unseen('s1', ['a']), []));
  check('a different kind shows', eq(unseen('s1', ['a', 'b']), ['b']));
  check('another session is independent', eq(unseen('s2', ['a']), ['a']));
  reset('s1');
  check('after reset it shows again', eq(unseen('s1', ['a']), ['a']));
  check('reset left the other session alone', eq(unseen('s2', ['a']), []));
  check('no session id shows (fail-open)', eq(unseen(null, ['a']), ['a']) && eq(unseen(null, ['a']), ['a']));
  check('unsafe id shows and writes nothing', eq(unseen('../x', ['a']), ['a']) && eq(unseen('../x', ['a']), ['a']));
  writeFileSync(join(base, 's3.json'), '{not json');
  check('corrupt state shows (fail-open)', eq(unseen('s3', ['a']), ['a']));
  delete process.env.WARN_DEDUPE_DIR;
  const prev = process.env.GUARD_SYNTHETIC; process.env.GUARD_SYNTHETIC = '1';
  check('synthetic runs never dedupe', eq(unseen('s9', ['a']), ['a']) && eq(unseen('s9', ['a']), ['a']));
  if (prev === undefined) delete process.env.GUARD_SYNTHETIC; else process.env.GUARD_SYNTHETIC = prev;
  try { for (const n of readdirSync(base)) unlinkSync(join(base, n)); } catch { /* */ }
  const pass = results.filter(Boolean).length;
  console.log(`${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
}

const isMain = (() => {
  try {
    const a = resolve(fileURLToPath(import.meta.url)), b = resolve(process.argv[1] || '');
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch { return false; }
})();

if (isMain) {
  const arg = process.argv[2];
  if (arg === '--self-test') selfTest();
  else if (arg === '--reset') {
    try { reset((JSON.parse(readFileSync(0, 'utf8') || '{}') || {}).session_id); } catch { /* fail-open */ }
    process.exit(0);
  } else { console.log(VERSION + '\nusage: --reset (SessionStart, stdin) | --self-test'); process.exit(0); }
}
