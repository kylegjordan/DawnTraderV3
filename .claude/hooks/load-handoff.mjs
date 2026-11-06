#!/usr/bin/env node
// SessionStart hook (B-TRANSCRIPT-ARCHIVE P8, scope OBJ-5, design §4-§5): run the RESTART-HANDOFF GUARD for this
// session and inject its banner, its drift lines and the latest handoff - before the session acts.
//
// Identifies the session by its CLONE FOLDER (the load-own-memory.mjs pattern; pre-audit A5: never the roster's ids).
// An unmapped folder, or a session that has never written a handoff -> prints nothing, exit 0.
// FAIL-OPEN, BUT NEVER SILENT WHEN A HANDOFF EXISTS: if the guard cannot run, the injected first line is
// `GUARD FAILED — the handoff guard could not run (<reason>)`, so a dead guard never reads as all-clear (design §5).
//
// ⛔ ONE OUTPUT UNDER ~7 KB: a SessionStart hook's stdout over ~10 KB is NOT delivered (persisted, a ~2 KB preview
// injected, "hook success" still logged - measured, see load-conduct.mjs). The banner and drift lines go first; the
// handoff text follows only as far as the budget allows, then `TRUNCATED — read <path>`. The guard is not sliced
// across several registrations because hooks of one event run in parallel and each slice would re-run every leg.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';

const BUDGET = 7000;
const CLONE_TO_ALIAS = {
  'DawnTraderV3-old': 'CC-A', 'DawnTraderV3-new': 'CC-B', 'DawnTraderV3-analyst': 'CC-C',
  'DawnTraderV3-infra': 'CC-INFRA', 'DawnTraderV3-pm': 'CC-PM',
};

export function clip(text, path) {
  const b = Buffer.from(text, 'utf8');
  if (b.length <= BUDGET) return text;
  const tail = `\n... TRUNCATED to stay under the hook delivery limit — read the whole handoff: ${path}\n`;
  const keep = BUDGET - Buffer.byteLength(tail, 'utf8');
  let cut = b.subarray(0, keep).toString('utf8');
  if (cut.endsWith('�')) cut = cut.slice(0, -1);       // never leave half a character
  return cut + tail;
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || '';
  const alias = CLONE_TO_ALIAS[basename(projectDir)];
  if (!alias) return '';
  const root = process.env.DT_ARCHIVE_ROOT || join(homedir(), '.claude', 'transcript-archive');
  const hdir = join(root, 'handoff', alias);
  if (!existsSync(hdir) || readdirSync(hdir).filter((f) => f.endsWith('.md')).length === 0) return '';
  const latest = join(hdir, readdirSync(hdir).filter((f) => f.endsWith('.md')).sort().pop());
  const guardPy = join(projectDir, 'comms-infra', 'laptop', 'transcript-archive', 'dt_handoff.py');
  let out;
  try {
    out = execFileSync(process.env.DT_PYTHON || 'python3', ['-I', guardPy, 'guard', '--alias', alias, '--repo', projectDir,
      '--root', root], { timeout: 170000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const why = e && e.code === 'ETIMEDOUT' ? 'timed out' : (e && e.status != null ? `exit ${e.status}` : String(e && e.message || e).slice(0, 120));
    return `GUARD FAILED — the handoff guard could not run (${why}); the handoff counts as STALE: ${latest}\n`;
  }
  if (!out || !out.trim()) {
    return `GUARD FAILED — the handoff guard printed nothing (a missing banner counts as STALE): ${latest}\n`;
  }
  return clip(`[HANDOFF GUARD — ${alias}] ` + out, latest);
}

try {
  const s = main();
  if (s) process.stdout.write(s);
} catch (e) {
  // fail-open: never block a session start
}
process.exit(0);
