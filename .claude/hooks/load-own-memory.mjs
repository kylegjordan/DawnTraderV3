#!/usr/bin/env node
// SessionStart hook (Kyle directive 2026-07-25): AUTO-LOAD THIS SESSION'S OWN per-session memory file.
//
// WHY THIS EXISTS: the harness natively auto-loads only the file named `MEMORY.md` from the project
// memory dir. Because the three sessions' project dirs are junctions onto ONE folder, that one
// MEMORY.md is necessarily SHARED — so per-session working state (MEMORY_CC_A/B/C.md) was NEVER
// auto-loaded; a session had to remember to read its own file, and after a compaction it usually
// didn't. This hook closes that gap: it identifies which session is running (by its clone folder),
// reads that session's own MEMORY_CC_<X>.md, and prints it so the harness injects it as context —
// on every startup, resume, AND compaction. That is the "each session auto-loads its own memory"
// behavior, achieved WITHOUT un-junctioning the shared folder.
//
// FAIL-OPEN BY CONSTRUCTION: any error, any unmapped folder, any missing file -> print nothing,
// exit 0. Worst case is "no auto-inject," which is strictly no worse than the old manual-read world.
// It can never corrupt state or block a session.

import { readFileSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';

// Map a clone folder -> (session name, per-session memory filename). The clone basename is the
// stable discriminator: old=Claude Old (CC-A), new=Claude New (CC-B), analyst=Claude Analyst (CC-C).
const CLONE_TO_SESSION = {
  'DawnTraderV3-old':     { name: 'Claude Old (CC-A)',      file: 'MEMORY_CC_A.md' },
  'DawnTraderV3-new':     { name: 'Claude New (CC-B)',      file: 'MEMORY_CC_B.md' },
  'DawnTraderV3-analyst': { name: 'Claude Analyst (CC-C)',  file: 'MEMORY_CC_C.md' },
};

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

try {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || '';
  const cloneKey = basename(projectDir);
  const session = CLONE_TO_SESSION[cloneKey];
  if (!session) process.exit(0); // unmapped clone -> inject nothing, never guess

  // Prefer the LIVE truth file in the user-cache memory dir (the same dir the harness auto-loads
  // MEMORY.md from). We locate it from the hook's stdin `transcript_path`, whose dirname IS that
  // project dir. If stdin lacks it, fall back to the in-clone git mirror (always present, synced).
  let memText = '';
  try {
    const input = JSON.parse(readStdin() || '{}');
    if (input && typeof input.transcript_path === 'string' && input.transcript_path) {
      const truthPath = join(dirname(input.transcript_path), 'memory', session.file);
      memText = readFileSync(truthPath, 'utf8');
    }
  } catch { /* fall through to mirror */ }
  if (!memText) {
    try {
      memText = readFileSync(join(projectDir, '.claude', 'memory', session.file), 'utf8');
    } catch { process.exit(0); } // no source available -> inject nothing
  }

  process.stdout.write(
    `[AUTO-LOADED — your own working memory: ${session.file} — ${session.name}]\n` +
    `This is YOUR per-session state (auto-injected on every start/resume/compaction). Shared rules ` +
    `are in CLAUDE.md; shared project truths are in MEMORY.md. Write working state ONLY to ${session.file}.\n\n` +
    memText + '\n'
  );
} catch {
  // absolute backstop — never break a session over a memory-load
}
process.exit(0);
