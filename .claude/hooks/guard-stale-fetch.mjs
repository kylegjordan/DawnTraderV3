#!/usr/bin/env node
// OBJ-2 — B-MEASURE-GATE leg 2 (#623). §7.1's sync-gate step 0, converted from prose to a check.
//
// THE RULE IT MECHANISES: "git fetch origin FIRST — the gate is INVALID without it. origin/<branch>
// is a local cached pointer, refreshed only by a fetch. Without step 0 the gate compares you
// against your own stale copy and reports 'behind 0' while you are genuinely behind" — measured
// 2026-07-24: reported behind 0, after a fetch reported behind 3.
//
// ⛔ WARN-ONLY, NEVER BLOCKS — scope requirement verbatim: "a blocked commit at the wrong moment
// costs more than a stale compare." Delivery via additionalContext (measured channel).
//
// READ-SITE: .git/FETCH_HEAD's mtime — written by every fetch/pull. THRESHOLD: 30 minutes,
// stated here because the scope fixes none; with three sessions pushing minutes apart, a
// half-hour-old picture of origin is routinely wrong.
// ⚠️ KNOWN LIMIT: FETCH_HEAD mtime says WHEN you last fetched, not WHETHER origin has moved
// since. Fresh-fetch-then-origin-moves is invisible here — that race is what §7.1's push
// rejection catches, and this guard does not claim to.
// FAIL-OPEN: every path exits 0; a missing FETCH_HEAD (fresh clone, never fetched) WARNS,
// because "never fetched" is the case the rule exists for — but an unreadable one is `decided:
// false` in the sink, not a warning, because an instrument error is not evidence of staleness.
import { readFileSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const THRESHOLD_MIN = 30;

let SINK = null, SELF = null;
try {
  SINK = join(homedir(), '.claude', 'stale-fetch.jsonl');
  SELF = createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex').slice(0, 12);
} catch { /* diagnostic only */ }

function note(row) {
  if (!SINK) return;
  try {
    appendFileSync(SINK, JSON.stringify({
      ts: new Date().toISOString(), hook_sha: SELF,
      synthetic: process.env.GUARD_SYNTHETIC === '1',
      project_dir: process.env.CLAUDE_PROJECT_DIR || null, ...row,
    }) + '\n', 'utf8');
  } catch { /* never affects the session */ }
}

function main() {
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); }
  catch { note({ decided: false, reason: 'parse_failed' }); return; }

  const cmd = ((payload && (payload.tool_input || payload.toolInput)) || {}).command;
  if (typeof cmd !== 'string' || !cmd) { note({ decided: false, reason: 'no_command' }); return; }

  // Fires only on the two operations the sync gate governs. `git fetch`/`git pull` in the same
  // command means the session is doing step 0 right now — silent.
  const gated = /\bgit\s+(commit|push)\b/.test(cmd);
  const fetching = /\bgit\s+(fetch|pull)\b/.test(cmd);
  if (!gated || fetching) { note({ decided: true, fired: false, gated, fetching }); return; }

  const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let ageMin = null;
  try {
    ageMin = (Date.now() - statSync(join(repo, '.git', 'FETCH_HEAD')).mtimeMs) / 60000;
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      ageMin = Infinity; // never fetched — the exact case the rule exists for
    } else {
      note({ decided: false, reason: 'fetch_head_unreadable', error: String(e && e.message) });
      return;
    }
  }

  const fired = ageMin > THRESHOLD_MIN;
  note({ decided: true, fired, age_min: ageMin === Infinity ? 'never' : Math.round(ageMin) });
  if (!fired) return;

  const ageTxt = ageMin === Infinity ? 'NEVER been fetched in this clone' : `last fetched ~${Math.round(ageMin)} min ago`;
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext:
          `STALE-FETCH WARNING (§7.1 step 0, warn-only — nothing was blocked): origin was ${ageTxt}. ` +
          `origin/<branch> is a LOCAL CACHED POINTER — without a fresh fetch, "behind 0" can be reported while genuinely behind ` +
          `(measured 2026-07-24: behind 0 before fetch, behind 3 after). Run git fetch origin before trusting any compare against origin.`,
      },
    }));
  } catch { /* fail-open */ }
}

try { main(); } catch (e) { try { note({ decided: false, reason: 'main_threw', error: String(e && e.message) }); } catch { /* */ } }
process.exit(0);
