#!/usr/bin/env node
// SessionStart hook (B-CONDUCT-FILE, Kyle directive 2026-08-19): AUTO-LOAD THE CONDUCT FILE.
//
// WHY THIS EXISTS. Kyle's problem, in his words: sessions comment on every push and every wake,
// self-corrections run to "two or three, sometimes four paragraph" explanations, and "we're not
// learning from any of it, we're just complaining about the mistakes we're making and then making
// those mistakes again." The rules that govern that behaviour DID exist — they were buried inside a
// ~140 KB always-loaded rules file, below thousands of bytes of architecture and workflow. A rule
// that loads but sits below the point of use is not a rule that fires. This hook gives the
// behavioural rules their own slim, separately-loaded home so they arrive at the TOP of context.
//
// ⛔ DELIBERATELY NO CLONE GATE — THE ONE PLACE THIS DIFFERS FROM ITS SIBLING.
// `load-own-memory.mjs` maps a clone folder -> a per-session memory file, and MUST exit when the
// folder is unknown, because it cannot guess WHICH session's private state to load. Conduct has no
// such per-session variant: it is the SAME file for every session, so there is nothing to guess and
// nothing to get wrong. Copying the sibling's three-entry CLONE_TO_SESSION gate would mean the
// spare clone, a fresh clone, a worktree, or any future session silently loads NO conduct rules
// while presenting as a normal session — the exact absent-as-valid failure (#546/#568) that this
// codebase keeps paying for. Any repo copy carrying this file gets the rules.
//
// FAIL-OPEN BY CONSTRUCTION: unreadable file -> print a LOUD breadcrumb to stdout and exit 0.
// Never blocks a session. But note the asymmetry with the sibling: a missing memory file costs this
// session its own state, whereas a missing CONDUCT file costs Kyle the behaviour he asked for and
// the session cannot tell — which is why the absence is announced rather than passed over.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// CAP IS IN BYTES, NOT LINES — scope §6, and the reason is measured: the 200-line MEMORY cap is
// routinely breached because dense paragraphs stay under the line count (CC-A breached it 3x in one
// day while formally "under 200 lines"). 4k tokens is the budgeted allocation; 4 bytes/token is the
// standard English-prose approximation, so the cap is stated in the unit that is actually checkable.
const CAP_TOKENS = 4096;
const BYTES_PER_TOKEN = 4;
const CAP_BYTES = CAP_TOKENS * BYTES_PER_TOKEN; // 16384

try {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || '';
  const conductPath = join(projectDir, 'CONDUCT.md');

  let text = '';
  try {
    text = readFileSync(conductPath, 'utf8');
  } catch {
    // ANNOUNCED, NOT SILENT. SessionStart stderr is not injected into context, so the breadcrumb
    // must go to stdout where the model actually reads it (the same finding as the sibling's Q1).
    process.stdout.write(
      `[⚠️ CONDUCT.md COULD NOT BE LOADED from ${conductPath} — this session is running WITHOUT its ` +
      `behavioural rules (how to report, when to stay silent, how to correct a mistake). Read ` +
      `CONDUCT.md manually before reporting anything to Kyle; do NOT treat its absence as "no rules".]\n`
    );
    process.exit(0);
  }

  // OVER-CAP IS LOUD BUT NEVER FATAL (scope §6): still load, always. A cap that can silently drop
  // rules is worse than no cap. Scope §7(b) requires this line be PROVEN by deliberately exceeding
  // the cap — a warning never fired is not a warning.
  let sizeNote = '';
  try {
    const bytes = statSync(conductPath).size;
    if (bytes > CAP_BYTES) {
      sizeNote =
        `\n[⚠️⚠️ CONDUCT.md IS OVER ITS CAP: ${bytes} B vs ${CAP_BYTES} B (${CAP_TOKENS} tokens). ` +
        `It still loaded in full — the cap never drops rules. But this file is auto-loaded on every ` +
        `start AND every compaction for every session, so its cost is paid repeatedly. ` +
        `ONE-IN-ONE-OUT: before adding another rule here, move one out to a skill or a runbook.]\n`;
    }
  } catch { /* size unreadable -> skip the warning, still load the content */ }

  process.stdout.write(
    `[AUTO-LOADED — CONDUCT.md: how this session BEHAVES. Injected on every start/resume/compaction.]\n` +
    `These are the behavioural rules — how to report to Kyle, when to say nothing, how to correct a ` +
    `mistake. They sit here rather than in CLAUDE.md because they must arrive BEFORE you act, not be ` +
    `findable after. CLAUDE.md remains authoritative for workflow, architecture and governance.\n` +
    sizeNote + '\n' + text + '\n'
  );
} catch {
  // absolute backstop — never break a session over a conduct-load
}
process.exit(0);
