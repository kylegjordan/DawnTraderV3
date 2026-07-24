#!/usr/bin/env node
/**
 * fresh-rules — SessionStart hook (Kyle directive 2026-07-24).
 *
 * THE PROBLEM IT SOLVES: each session loads CLAUDE.md from ITS OWN clone, so a session
 * obeys whatever its folder last pulled. Measured 2026-07-24: one session was 8 commits
 * behind and running a pre-slim rulebook. Nothing told it, and nothing told anyone else.
 *
 * WHY THIS EVENT: the root CLAUDE.md is re-read from disk and re-injected at COMPACTION,
 * not only at a fresh start — and Kyle reports compaction is where nearly all his reloads
 * happen. So the refresh must ride the same event, which is why this hook is registered
 * on startup|resume|compact alongside session-reminder.mjs.
 *
 * ★ WHY IT ALSO PRINTS, RATHER THAN JUST PULLING: whether this hook runs BEFORE or AFTER
 * the CLAUDE.md re-read at compaction is UNDOCUMENTED. Rather than assume an ordering, the
 * hook's stdout (which IS injected into context) TELLS the session what changed and to
 * re-read it. That makes the fix correct under either ordering instead of betting on one.
 *
 * ★ SCOPE IS DELIBERATELY FOUR PATHS (Kyle: "only for the 4 files we are discussing").
 * Not a general pull — a general pull at session start would drag in unrelated in-flight
 * work and surprise the session. See FILES below.
 *
 * ★★ SAFETY — IT WILL NEVER OVERWRITE UNCOMMITTED LOCAL WORK. If a target file has local
 * edits, it is REPORTED and LEFT ALONE. A hook that silently reverted a session's in-progress
 * edit to the rulebook would destroy work at the exact moment nobody is watching.
 *
 * FAIL-OPEN by construction: any error (offline, git missing, detached state) exits 0 and
 * silently does nothing. This must never be able to block a session from starting.
 */
import { execFileSync } from 'node:child_process';

const BRANCH = 'migration/aws-supabase';
const REMOTE_REF = `origin/${BRANCH}`;

// The must-be-current set. Each has a distinct reason:
const FILES = [
  ['CLAUDE.md', 'the binding rulebook — loaded at start and re-injected at compaction'],
  ['.claude/hooks', 'the guards themselves — a stale guard silently does not fire, which is worse than no guard'],
  ['.claude/settings.local.json', 'what registers the guards'],
  ['1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md', 'the rule narration — why each rule exists'],
  ['1-system-manual/BUILD_METHOD_PLAYBOOK.md', 'the portable build method'],
];

const run = (args) =>
  execFileSync('git', args, { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  // Refresh the remote-tracking ref. WITHOUT THIS the comparison below is against a stale
  // local pointer and reports "current" while being behind — the same false in-sync that
  // the batch-close sync gate hit on 2026-07-24 (behind 0 before fetch, behind 3 after).
  try { run(['fetch', '--quiet', 'origin', BRANCH]); } catch { process.exit(0); }

  const changed = [];
  const skippedDirty = [];

  for (const [path, why] of FILES) {
    let localDiff = '';
    try {
      // Does the working tree differ from the remote ref for this path?
      localDiff = run(['diff', '--name-only', REMOTE_REF, '--', path]);
    } catch { continue; }
    if (!localDiff) continue;

    // Is the difference LOCAL UNCOMMITTED WORK? If so, never touch it.
    let dirty = '';
    try { dirty = run(['status', '--porcelain', '--', path]); } catch { dirty = ''; }
    if (dirty) { skippedDirty.push([path, why]); continue; }

    try {
      run(['checkout', REMOTE_REF, '--', path]);
      changed.push([path, why]);
    } catch { /* leave it; reported below only if it actually moved */ }
  }

  if (changed.length === 0 && skippedDirty.length === 0) process.exit(0);

  let out = '[RULES FRESHNESS — this session was running an out-of-date copy]\n';
  if (changed.length) {
    out += 'REFRESHED from ' + REMOTE_REF + ' just now:\n';
    for (const [p, why] of changed) out += `  - ${p}  (${why})\n`;
    out += '★ ACT ON THIS: the file on disk changed AFTER your rules were loaded, so what you are\n' +
           '  holding may be stale. RE-READ CLAUDE.md (and any other file listed) with the Read tool\n' +
           '  BEFORE acting on any rule this turn. Do not rely on the copy already in your context.\n';
  }
  if (skippedDirty.length) {
    out += 'NOT refreshed — you have UNCOMMITTED local edits here, so they were left untouched:\n';
    for (const [p, why] of skippedDirty) out += `  - ${p}  (${why})\n`;
    out += '  Commit or push them; until then this session is intentionally diverged from the branch.\n';
  }
  process.stdout.write(out);
  process.exit(0);
} catch {
  process.exit(0); // fail-open, always
}
