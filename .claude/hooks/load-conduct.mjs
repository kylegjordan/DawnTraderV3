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
// ★ RAISED 4096 → 6144 on 2026-08-20, KYLE'S DECISION, and it is EXPLICITLY TEMPORARY.
// The 4k cap was hit within a day of the file existing: §6 (his report format) + §13 (the
// mistake short list) pushed it 101 B over, and by the §13 rule a live rule may NOT be
// dropped to make room. His call: pay the tokens now, and REVISIT THE WHOLE ALLOCATION
// across all four auto-loaded files ONCE `CLAUDE.md` HAS BEEN SLIMMED and we can see how
// small it actually gets. ⚠️ DO NOT treat 6144 as settled — it is a deliberate deferral
// of a trade-off (rules that help vs rules nobody reads vs token cost), not a new budget.

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ CHUNKED DELIVERY — THE WHOLE REASON THIS FILE IS NOT ONE WRITE (B-CONDUCT-DELIVERY, 2026-08-24)
//
// A SessionStart hook whose stdout exceeds ~10 KB IS NOT DELIVERED. The harness persists the
// output to a file on disk and injects only a ~2 KB PREVIEW plus the path. It logs
// "SessionStart:compact hook success" either way — SO THE FAILURE IS COMPLETELY SILENT, and the
// success line reports the hook's EXIT CODE, not whether anything arrived.
//
// MEASURED 2026-08-24, binary-searched with real outputs rather than assumed:
//   ⚠️ FIRST MEASUREMENT WAS WRONG AND IS CORRECTED HERE. I binary-searched with BASH TOOL
//   output (11,000 and 12,500 B delivered whole) and applied that number to HOOKS. THEY ARE
//   DIFFERENT LIMITS. The very next session start proved it: chunks of 11.0/10.7/10.4 KB were
//   STILL persisted, while 9,986 B and 1,627 B arrived whole.
//   => THE HOOK CEILING SITS BETWEEN 9,986 AND 10,400 B. CHUNK_LIMIT is 7,000 for real margin
//   (headers add ~400 B, and the limit may be TOKEN-based, so bytes are a proxy, not the unit).
//
// CONSEQUENCE, and it is the reason this was worth a batch: CONDUCT.md is ~23 KB and
// MEMORY_CC_*.md ~21 KB. BOTH FILES ENGINEERED SPECIFICALLY TO ARRIVE FIRST HAVE BEEN ARRIVING AT
// ROUGHLY ONE-TENTH OF THEMSELVES ON EVERY START, RESUME AND COMPACTION. Of 140 persisted hook
// outputs on this machine, EVERY SINGLE ONE is CONDUCT (57) or a memory file (83). The report
// format lives in §6, which begins ~4x past the cutoff — so the rule Kyle kept asking for had
// never once reached a session.
//
// ★ THE LIMIT IS PER HOOK OUTPUT, NOT PER TURN — proven: the 804 B session-reminder arrives whole
// in the same turn a 23 KB conduct file is truncated. THAT is why chunking works: N hooks, each
// under the ceiling, all delivered.
//
// ⚠️ DO NOT "SIMPLIFY" THIS BACK TO ONE WRITE. It will appear to work — the hook exits 0 and the
// log says success — while silently delivering 8% of the rules.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const CHUNK_LIMIT = 7000;                       // bytes of BODY per chunk; proven-deliverable
const CHUNK_INDEX = Number(process.argv[2] || 0); // which slice this invocation emits
const CHUNK_COUNT = Number(process.argv[3] || 1); // how many slices are registered in settings

const CAP_TOKENS = 6144;
const BYTES_PER_TOKEN = 4;
const CAP_BYTES = CAP_TOKENS * BYTES_PER_TOKEN; // 24576 — ⚠️ KEEP THIS IN STEP WITH CAP_TOKENS.
// It read `// 16384` after the 4096→6144 raise: a durable comment asserting a retired ceiling.
// Same family as the two Langston caught elsewhere the same day — a comment claiming more than
// the code delivers. A stale constant in a comment is read by humans as the live value.

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
      `[⚠️ CONDUCT.md COULD NOT BE LOADED from ${conductPath}${projectDir ? '' : ' (CLAUDE_PROJECT_DIR unset — resolved against cwd)'} — this session is running WITHOUT its ` +
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

  // Slice on a LINE boundary so no rule is cut mid-sentence.
  const lines = text.split('\n');
  const slices = [];
  let cur = [], curLen = 0;
  for (const ln of lines) {
    const b = Buffer.byteLength(ln, 'utf8') + 1;
    if (curLen + b > CHUNK_LIMIT && cur.length) { slices.push(cur.join('\n')); cur = []; curLen = 0; }
    cur.push(ln); curLen += b;
  }
  if (cur.length) slices.push(cur.join('\n'));

  // ⛔ ANNOUNCED, NEVER SILENT: if the file needs more slices than are registered, say so LOUDLY
  // in every slice. The whole defect this fixes was a silent shortfall.
  const shortfall = slices.length > CHUNK_COUNT
    ? `\n[⚠️⚠️ CONDUCT.md NEEDS ${slices.length} CHUNKS BUT ONLY ${CHUNK_COUNT} ARE REGISTERED IN ` +
      `.claude/settings.local.json — SECTIONS AFTER CHUNK ${CHUNK_COUNT} ARE NOT REACHING YOU. ` +
      `FIX: add a load-conduct entry with args "${CHUNK_COUNT}" "${slices.length}" AND change the SECOND arg on ` +
      `every existing entry to "${slices.length}" — bumping only the new one leaves the others still ` +
      `reporting a shortfall that no longer exists (Langston, hotfix gate). Or trim the file. ` +
      `READ CONDUCT.md IN FULL before reporting anything.]\n`
    : '';

  const body = slices[CHUNK_INDEX];
  if (body === undefined) process.exit(0);   // nothing for this slice — stay silent

  // ⛔ MANIFEST FIRST — Langston's condition, hotfix gate 2026-08-24. The FIRST LINE of EVERY chunk
  // declares which chunk this is, how many there are, and the byte size of each. WHY IT IS THE FIRST
  // LINE: when a chunk IS truncated the harness injects a HEAD-SHAPED preview (verified 2026-08-24 —
  // a persisted output begins with the emitted text), so the manifest survives its own truncation.
  // ⇒ A READER CAN COUNT ARRIVALS AGAINST A DECLARED TOTAL AND KNOW WHAT IT DID NOT RECEIVE.
  // That is the instrument this fix was missing: CHUNK_LIMIT stops being a bet on which unit the
  // harness counts and becomes a tuning parameter you can observe.
  const sizes = slices.map((x) => Buffer.byteLength(x, 'utf8'));
  const manifest = `[CONDUCT ${CHUNK_INDEX + 1}/${slices.length} · ${sizes[CHUNK_INDEX]} B · ${sizes.join('/')}]\n`;

  // ⛔ sizeNote AND shortfall ride EVERY chunk (Langston condition 2): chunk 0 is the LARGEST and so
  // the likeliest to be lost — putting the over-cap warning only there loses it exactly when it matters.
  const header = CHUNK_INDEX === 0
    ? manifest +
      `[AUTO-LOADED — CONDUCT.md: how this session BEHAVES. Injected on every start/resume/compaction.]\n` +
      `These are the behavioural rules — how to report to Kyle, when to say nothing, how to correct a ` +
      `mistake. They sit here rather than in CLAUDE.md because they must arrive BEFORE you act, not be ` +
      `findable after. CLAUDE.md remains authoritative for workflow, architecture and governance.\n` +
      sizeNote + shortfall
    : manifest + `[AUTO-LOADED — CONDUCT.md continued.]\n` + sizeNote + shortfall;

  process.stdout.write(header + '\n' + body + '\n');
} catch {
  // absolute backstop — never break a session over a conduct-load
}
process.exit(0);
