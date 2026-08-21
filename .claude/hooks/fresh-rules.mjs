#!/usr/bin/env node
/**
 * fresh-rules — runs automatically every time a session STARTS, RESUMES, or COMPACTS.
 *
 * WHAT IT IS, in plain terms: a small script the app runs by itself at those three moments.
 * Nobody triggers it. It refreshes the few files a session must never be stale on, then TELLS
 * the session what changed.
 *
 * THE PROBLEM IT SOLVES: each session loads its rules from ITS OWN folder, so a session obeys
 * whatever its folder last pulled. Measured 2026-07-24: one session sat 8 commits behind,
 * running a pre-slim rulebook. Nothing told it, and nothing told anyone else.
 *
 * ★ WHY PULLING IS THE HALF THAT MATTERS (Kyle asked how this differs from just telling a
 * session to reload): telling a session to re-read a STALE file hands back the stale file. The
 * reload is worthless without a current file underneath it. Pulling cannot be replaced by an
 * instruction; the instruction is the cheap second half.
 *
 * ★ WHY IT ALSO PRINTS: whether this runs BEFORE or AFTER the rules are re-read at compaction
 * is UNDOCUMENTED. Rather than bet on an ordering, its output (which IS injected into context)
 * tells the session to re-read. Correct under either ordering instead of correct if I guessed.
 *
 * ★★ THE FOUR PROTECTED THINGS (Kyle 2026-07-24 — CORRECTED; I had wrongly substituted the
 * build playbook for the issues file):
 *   1. CLAUDE.md          — the instructions. The ONLY one auto-loaded into context.
 *   2. .claude/hooks + the settings registering them — EXECUTED from disk, never in context;
 *      a stale copy means a guard silently does not fire, which is worse than no guard.
 *   3. RUNNING_ISSUES.md  — two sessions on stale copies claim the SAME next issue number.
 *   4. CLAUDE_MD_RULE_HISTORY.md — the rule narration; a rule without its origin gets argued away.
 * The build playbook is deliberately NOT here — a reference read on demand, not something a
 * session must be current on to act correctly.
 *
 * ★★ SAFETY — NEVER OVERWRITES UNCOMMITTED LOCAL WORK. A file with local edits is REPORTED and
 * LEFT ALONE. A hook that silently reverted a session's in-progress edit at compaction would
 * destroy work at the exact moment nobody is watching. (Verified by test — and then I proved
 * the point the hard way by destroying my own uncommitted copy of THIS file with a
 * `git reset --hard`. The hook protected it; I did not.)
 *
 * ★ LOGGING: every run appends one line to ~/.claude/dt-fresh-rules.jsonl. Without it, "is the
 * system working?" is unanswerable — which is the state I first shipped this in. All three
 * sessions write the same file, so it doubles as the cross-session record the monitoring
 * routine reads.
 *
 * FAIL-OPEN by construction: any error exits 0 and does nothing. It must never block a session.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

const BRANCH = 'migration/aws-supabase';
const REMOTE_REF = `origin/${BRANCH}`;
const LOG = join(homedir(), '.claude', 'dt-fresh-rules.jsonl');

const FILES = [
  ['CLAUDE.md', 'the instructions — the only one auto-loaded into context'],
  ['.claude/hooks', 'the guards themselves — a stale guard silently does not fire'],
  ['.claude/settings.local.json', 'what registers the guards'],
  ['1-system-manual/RUNNING_ISSUES.md', 'stale copies make two sessions claim the same issue number'],
  ['1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md', 'the rule narration — why each rule exists'],
];

const CWD = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const run = (args) =>
  execFileSync('git', args, { cwd: CWD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const record = (obj) => {
  try {
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), clone: basename(CWD), ...obj }) + '\n');
  } catch { /* logging must never break the hook */ }
};

// The app passes context on stdin; capture the event if present, never depend on it.
let event = 'unknown';
try {
  const j = JSON.parse(readFileSync(0, 'utf8'));
  event = j.source || j.matcher || j.hook_event_name || 'unknown';
} catch { /* no stdin or not JSON — fine */ }

try {
  // Refresh the remote pointer FIRST. Without this, the comparison runs against a stale local
  // pointer and reports "current" while behind — the same false in-sync the batch-close gate
  // hit on 2026-07-24 (behind 0 before fetch, behind 3 after).
  try { run(['fetch', '--quiet', 'origin', BRANCH]); }
  catch { record({ event, result: 'fetch_failed' }); process.exit(0); }

  let behind = null;
  try { behind = parseInt(run(['rev-list', '--count', `HEAD..${REMOTE_REF}`]), 10); } catch { }

  const changed = [];
  const skippedDirty = [];
  const skippedUnpushed = [];

  for (const [path, why] of FILES) {
    let differs = '';
    try { differs = run(['diff', '--name-only', REMOTE_REF, '--', path]); } catch { continue; }
    if (!differs) continue;

    // (a) UNCOMMITTED local edits — never overwrite.
    let dirty = '';
    try { dirty = run(['status', '--porcelain', '--', path]); } catch { dirty = ''; }
    if (dirty) { skippedDirty.push([path, why]); continue; }

    // (b) ★ COMMITTED-BUT-NOT-YET-PUSHED work — also never overwrite. THIS WAS MISSING IN THE
    // FIRST CUT AND THE HOOK PROVED IT BY EATING ITS OWN IMPROVEMENT (2026-07-24): I committed a
    // corrected version locally, had not pushed it, and the next run checked the path out from
    // origin and reverted my commit's content in the working tree. Nothing was LOST — the commit
    // was still in history — but "differs from origin" is NOT the same question as "is stale".
    // A local commit ahead of origin is the newest version, not an out-of-date one.
    let unpushed = '';
    try { unpushed = run(['rev-list', `${REMOTE_REF}..HEAD`, '--', path]); } catch { unpushed = ''; }
    if (unpushed) { skippedUnpushed.push([path, why]); continue; }

    // ⛔ `git checkout <ref> -- <path>` WRITES THE INDEX AS WELL AS THE WORKING TREE. That is
    // documented git behaviour, not a bug in git — but it made THIS hook silently stage every file
    // it refreshed, holding ORIGIN's content (i.e. OTHER SESSIONS' work) in MY index under a path
    // I recognised as mine. MEASURED TWICE: 2026-08-09 (stash `CC-C-685-not-mine`) and 2026-08-21
    // (CC-C's #736/#737 sitting staged in CC-A's index, one `git commit` away from being published
    // under the wrong author). Rule 25.c is EXACTLY this shape — the path is right, so the
    // explicit-path habit that protects against the wrong FILE cannot see the wrong CONTENT — and
    // both incidents were misread as another session writing into this clone. It was never that.
    // THE RESET IS THE FIX: the refresh still lands in the working tree, but the index is left
    // untouched, so a later `git add <my paths>` can no longer sweep in a refreshed governance file.
    try {
      run(['checkout', REMOTE_REF, '--', path]);
      try { run(['reset', '--quiet', '--', path]); } catch { /* nothing staged to clear */ }
      changed.push([path, why]);
    } catch { }
  }

  record({
    event,
    behind,
    refreshed: changed.map(([p]) => p),
    skipped_dirty: skippedDirty.map(([p]) => p),
    skipped_unpushed: skippedUnpushed.map(([p]) => p),
    quiet: changed.length === 0 && skippedDirty.length === 0 && skippedUnpushed.length === 0,
  });

  if (changed.length === 0 && skippedDirty.length === 0 && skippedUnpushed.length === 0) process.exit(0);

  let out = '[RULES FRESHNESS — this session was running an out-of-date copy]\n';
  if (changed.length) {
    out += `REFRESHED from ${REMOTE_REF} just now:\n`;
    for (const [p, why] of changed) out += `  - ${p}  (${why})\n`;
    out += '★ ACT ON THIS: the file on disk changed AFTER your rules were loaded, so what you are\n' +
           '  holding may be stale. RE-READ CLAUDE.md (and any other file listed) with the Read tool\n' +
           '  BEFORE acting on any rule this turn. Do not rely on the copy already in your context.\n';
  }
  if (skippedUnpushed.length) {
    out += 'NOT refreshed — you have LOCAL COMMITS here not yet pushed (yours is NEWER, not stale):\n';
    for (const [p, why] of skippedUnpushed) out += `  - ${p}  (${why})\n`;
    out += '  PUSH them so the other sessions get them.\n';
  }
  if (skippedDirty.length) {
    out += 'NOT refreshed — you have UNCOMMITTED local edits here, so they were left untouched:\n';
    for (const [p, why] of skippedDirty) out += `  - ${p}  (${why})\n`;
    out += '  Commit and push them; until then this session is intentionally diverged from the branch.\n';
  }
  process.stdout.write(out);
  process.exit(0);
} catch {
  record({ event, result: 'error' });
  process.exit(0);
}
