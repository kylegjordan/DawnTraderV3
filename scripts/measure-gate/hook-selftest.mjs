#!/usr/bin/env node
// OBJ-5 — B-MEASURE-GATE leg 2 (#623). THE SELF-TEST.
//
// Langston's second non-negotiable, verbatim: "A fail-open hook that has silently stopped
// running is a lookalike failure in the enforcement layer itself — the exact bug we're fixing."
// Verification he set: DISABLE ONE HOOK DELIBERATELY → THE SELF-TEST NAMES IT.
//
// [r2] amendment: IT MUST REPORT PER SESSION, NOT ONLY PER HOOK. A hook can be alive in three
// clones and absent from a fourth, and CC-B's fifteen silent days at 747 commits behind are the
// case — a hook shipped that day would not have existed for it, AND NOTHING WOULD HAVE SAID SO.
//
// ⛔⛔ THE DISTINCTION THIS BATCH WAS BUILT AROUND, AND THE REASON THIS SCRIPT HAS FOUR COLUMNS
// INSTEAD OF ONE: REGISTERED ≠ PRESENT ≠ CURRENT ≠ RUNNING.
//   REGISTERED  it appears in settings.local.json
//   PRESENT     the file exists on disk in that clone
//   CURRENT     its content matches origin's blob (EOL-normalised — the worktree is CRLF and the
//               blob is LF, and comparing those two directly reported all five clones stale once)
//   RUNNING     it has actually EXECUTED, evidenced by a row it wrote itself
// ★ Every earlier version of "is the hook live?" in this project answered one of the first three
// and was read as answering the fourth. The July probe was REGISTERED and PRESENT for 24 days
// and had never run.
//
// ⛔ AND THE HONEST LIMIT, STATED IN THE OUTPUT AND NOT ONLY HERE: MOST HOOKS HAVE NO SINK, SO
// "RUNNING" IS UNKNOWABLE FOR THEM. This script prints `unknown`, never `no`, for those — an
// instrument that cannot observe a thing must not report its silence as absence (#453).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REPO = process.env.SELFTEST_REPO || process.cwd();
const REF = 'origin/migration/aws-supabase';
const HOME = homedir();

// Sinks a hook writes ITSELF. Only these can evidence RUNNING.
const SINKS = {
  'guard-measurement-shape.mjs': join(HOME, '.claude', 'measurement-shape.jsonl'),
  'probe-warn-delivery.mjs': join(HOME, '.claude', 'probe-warn-delivery.jsonl'),
  'log-instructions-loaded.mjs': join(HOME, '.claude', 'instructions-loaded.jsonl'),
  'guard-stale-fetch.mjs': join(HOME, '.claude', 'stale-fetch.jsonl'),
  'guard-ci-cited.mjs': join(HOME, '.claude', 'ci-cited.jsonl'),
  'observe-userpromptsubmit.mjs': join(HOME, '.claude', 'userpromptsubmit-observe.jsonl'),
  'inject-due-alerts.mjs': join(HOME, '.claude', 'inject-due-alerts.jsonl'),
};

const norm = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n');
const sha12 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

function git(args, cwd = REPO) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
  catch { return null; }
}

function registered(clone) {
  const p = join(clone, '.claude', 'settings.local.json');
  if (!existsSync(p)) return null;
  let d;
  try { d = JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
  const out = new Map();
  for (const [event, blocks] of Object.entries((d.hooks) || {})) {
    for (const b of blocks) for (const h of (b.hooks || [])) {
      const m = /([A-Za-z0-9._-]+\.mjs)/.exec(h.command || '');
      if (m) {
        const cur = out.get(m[1]) || { events: new Set(), matchers: new Set() };
        cur.events.add(event);
        if (b.matcher) cur.matchers.add(b.matcher);
        out.set(m[1], cur);
      }
    }
  }
  return out;
}

/** Last row a hook wrote to its own sink FROM THE GIVEN CLONE.
 * r2, reader-found: the sinks are USER-GLOBAL, and r1 accepted any row with a `ts` — so the
 * freshest row, written by -analyst, was credited to -old as "yes, 0.0h ago". A hook stale or
 * missing in the measured clone could show RUNNING off another clone's writes. ⛔ AND THE FIX
 * WAS SITTING UNUSED IN THE VERY ROWS BEING READ: every row carries `project_dir` and
 * `hook_sha`. Rows without `project_dir` are counted but attributed to nothing.
 * ⛔ 'NO' IS RETIRED. A user-global sink cannot prove a NEGATIVE about one clone — and the old
 * `NO (sink absent)` made the proof suite's CONTROL arm fail on a healthy fixture whenever the
 * machine profile carried no live sinks, which entangled an "offline" proof with live state. */
function lastRun(file, cloneDir) {
  const sink = SINKS[file];
  if (!sink) return { state: 'unknown', why: 'this hook writes no sink' };
  if (!existsSync(sink)) return { state: 'unknown', why: 'sink absent on THIS machine profile' };
  try {
    const size = statSync(sink).size;
    const buf = readFileSync(sink);
    const tail = buf.subarray(Math.max(0, size - 262144)).toString('utf8').trim().split('\n');
    const want = String(cloneDir).replace(/\\/g, '/').toLowerCase();
    let unattributed = 0;
    for (let i = tail.length - 1; i >= 0; i--) {
      let r;
      try { r = JSON.parse(tail[i]); } catch { continue; }
      if (!r.ts) continue;
      const pd = r.project_dir ? String(r.project_dir).replace(/\\/g, '/').toLowerCase() : null;
      if (pd === null) { unattributed++; continue; }
      if (pd !== want) continue;
      const ageH = (Date.now() - Date.parse(r.ts)) / 3.6e6;
      return { state: 'YES', ts: r.ts, ageH, hook_sha: r.hook_sha || null };
    }
    return { state: 'unknown',
      why: 'no row FROM THIS CLONE in the last 256KB' + (unattributed ? ` (${unattributed} rows carry no project_dir)` : '') };
  } catch (e) {
    return { state: 'unknown', why: 'sink unreadable: ' + e.message };
  }
}

const originBlobs = new Map();
for (const f of (git(['ls-tree', '--name-only', REF, '.claude/hooks/']) || '').split('\n').filter(Boolean)) {
  const raw = git(['show', `${REF}:${f}`]);
  if (raw !== null) originBlobs.set(basename(f), sha12(raw.replace(/\r\n/g, '\n') + '\n'));
}

const clones = (process.env.SELFTEST_CLONES || 'C:\\DawnTraderV3-old,C:\\DawnTraderV3-new,C:\\DawnTraderV3-analyst,C:\\DawnTraderV3-infra,C:\\DawnTraderV3')
  .split(',').filter((c) => existsSync(join(c, '.git')));

console.log('=== OBJ-5 HOOK SELF-TEST ===');
console.log('  REGISTERED != PRESENT != CURRENT != RUNNING. Read all four columns.');
console.log('  ref: %s   clones found: %d', REF, clones.length);

let problems = [];
for (const clone of clones) {
  const reg = registered(clone);
  const head = git(['rev-parse', '--short', 'HEAD'], clone) || '?';
  console.log('\n--- %s   HEAD %s ---', basename(clone), head);
  if (!reg) { console.log('    settings.local.json MISSING OR UNPARSEABLE'); problems.push(basename(clone) + ': no settings'); continue; }
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log('    ' + pad('hook',32) + pad('registered',22) + pad('present',9) + pad('current',9) + 'running');
  const seen = new Set();
  for (const [file, info] of reg) {
    seen.add(file);
    const p = join(clone, '.claude', 'hooks', file);
    const present = existsSync(p);
    let current = 'n/a';
    if (present && originBlobs.has(file)) {
      current = sha12(norm(readFileSync(p))) === originBlobs.get(file) ? 'yes' : 'STALE';
    }
    const run = lastRun(file, clone);
    // If the row names which VERSION ran, compare it to origin — a clone can be CURRENT on disk
    // while its last EXECUTION was a stale version (hooks load at pickup, not per call).
    let verTxt = '';
    if (run.state === 'YES' && run.hook_sha && originBlobs.has(file)) {
      verTxt = run.hook_sha === originBlobs.get(file) ? ' [current ver]' : ` [ver ${run.hook_sha} — NOT current]`;
    }
    const runTxt = run.state === 'YES' ? `yes, ${run.ageH.toFixed(1)}h ago${verTxt}`
      : `unknown (${run.why})`;
    console.log('    ' + pad(file,32) + pad([...info.events].join(','),22) + pad(present ? 'yes' : 'MISSING',9) + pad(current,9) + runTxt);
    if (!present) problems.push(`${basename(clone)}: ${file} REGISTERED BUT MISSING`);
    if (current === 'STALE') problems.push(`${basename(clone)}: ${file} stale vs origin`);
    // r2: no problems row for RUNNING — `unknown` is not a defect and `NO` is retired; a
    // user-global sink cannot prove a per-clone negative (#453).
  }
  // Present-but-unregistered: a hook file nobody invokes.
  for (const f of originBlobs.keys()) {
    if (!seen.has(f) && existsSync(join(clone, '.claude', 'hooks', f))) {
      console.log('    ' + pad(f,32) + pad('NOT REGISTERED',22) + pad('yes',9) + pad('-',9) + 'cannot run');
      problems.push(`${basename(clone)}: ${f} present but NOT REGISTERED`);
    }
  }
}

// Per-SESSION liveness — Langston's [r2] amendment. instructions-loaded.jsonl records each
// session start, which is when a clone picks up whatever hooks it then has.
console.log('\n--- PER-SESSION (when did each clone last START and therefore last pick up hooks?) ---');
const il = SINKS['log-instructions-loaded.mjs'];
if (!existsSync(il)) {
  console.log('    %s ABSENT — per-session liveness UNKNOWN, not "fine"', il);
  problems.push('instructions-loaded sink absent: per-session liveness unknown');
} else {
  const bySession = new Map();
  for (const line of readFileSync(il, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      const key = r.project_dir || r.cwd || r.session_id || 'unknown';
      const prev = bySession.get(key);
      if (!prev || (r.ts || '') > prev) bySession.set(key, r.ts || '');
    } catch { /* skip */ }
  }
  if (!bySession.size) console.log('    sink present but no parseable rows — liveness UNKNOWN');
  // ⛔ CLONE ROWS ONLY. The first version printed every key, which meant ~190 session UUIDs —
  // rows whose `project_dir` was absent so the session id was used as the fallback key. That is
  // an unreadable wall, and an unreadable report is an unread report: the two STALE clones in the
  // verdict were the finding, and they were buried under 190 lines of noise.
  // r2: the bare drive-letter filter also caught `~/.claude/projects/...` paths, printing
  // non-clones as clone rows. A clone is a directory that exists and holds a .git.
  const isClone = (k) => /^[A-Za-z]:\\/.test(k) && existsSync(join(k, '.git'));
  const clonesRows = [...bySession].filter(([k]) => isClone(k)).sort();
  const others = [...bySession].filter(([k]) => !isClone(k));
  for (const [k, ts] of clonesRows) {
    const ageH = ts ? (Date.now() - Date.parse(ts)) / 3.6e6 : null;
    console.log('    ' + String(k).padEnd(30) + ' last start ' + (ts || '?') +
      (ageH === null ? '' : `  (${ageH.toFixed(1)}h ago)`));
  }
  if (others.length) {
    const stamps = others.map(([, t]) => t).filter(Boolean).sort();
    console.log('    + %d rows keyed by session id rather than clone (no `project_dir` recorded), spanning %s .. %s',
      others.length, (stamps[0] || '?').slice(0, 10), (stamps[stamps.length - 1] || '?').slice(0, 10));
    console.log('      ⚠️ THOSE CANNOT BE ATTRIBUTED TO A CLONE, so this view is INCOMPLETE, not clean.');
  }
  // r2: the old line said "HAS NOT STARTED A SESSION" — an absolute its own output contradicted
  // two lines up, since rows without project_dir cannot be attributed to any clone.
  console.log('    ⛔ A clone absent from this list has NO EVIDENCED start — not proven dormant.');
}

console.log('\n=== VERDICT ===');
if (!problems.length) {
  console.log('  no problems detected');
  console.log('  ⛔ AND THAT IS NOT "EVERY HOOK IS WORKING". Hooks with no sink report `unknown`,');
  console.log('     never `no` — this cannot see a registered, present, current hook that silently');
  console.log('     does nothing. Its silence is non-evidential, exactly as the guard\'s is.');
} else {
  for (const p of problems) console.log('  ⛔ ' + p);
}
process.exit(0);
