#!/usr/bin/env node
/**
 * guard-whole-fs-scan — PreToolUse guard against WHOLE-FILESYSTEM SCANS.
 *
 * WHY THIS EXISTS (2026-08-28, Infra Claude's find; Langston ruled it
 * unconditional and immediate):
 * The Helsinki box mounts Google Drive at /mnt/gdrive. When that mount wedges,
 * ANY scan that walks from / blocks forever in uninterruptible IO -- it cannot
 * be killed, it cannot time out, and the session that ran it looks IDLE while a
 * review sits queued behind it.
 *
 * MEASURED 2026-08-28 by CC-A before this hook was written:
 *   `timeout 8 ls /mnt/gdrive` -> exit 124. The mount was wedged, and had been
 *   for 20+ days per Infra's report.
 *
 * THE RULE ALREADY EXISTED AND COULD NOT REACH US -- THAT IS THE WHOLE POINT.
 * `/home/langston/CLAUDE.md:303` carries it verbatim as a Kyle directive dated
 * 2026-06-24: "NEVER run `find /` or any whole-filesystem scan ... it has hung
 * your worker 30+ min twice, making you look IDLE to Kyle while a review sits
 * queued." That file is LANGSTON'S. No CC session loads it. So a rule with a
 * measured two-incident history bound exactly one of five actors, and the other
 * four had no way to know it existed.
 *
 * WHY A HOOK AND NOT A LINE IN CONDUCT.md (rule 29, Langston's own standard):
 * "WHERE POSSIBLE, PREFER IMPOSSIBLE OVER INTERCEPTED." A line in an
 * always-loaded file is read once per session and competes with 184 KB of other
 * text at the moment it matters least. This fails at git-argument level, in the
 * second the command is typed. The CONDUCT.md line still lands -- a hook only
 * covers sessions that have restarted since it was added, and it only covers
 * THIS tool. Belt and braces, deliberately.
 *
 * FAIL-OPEN BY CONSTRUCTION: any parse problem exits 0. A guard that breaks a
 * session is worse than the hazard it prevents. Its silence is therefore NOT
 * evidence of compliance (#453).
 */
import { readFileSync } from 'node:fs';

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // fail open
}

const cmd = payload?.tool_input?.command;
if (typeof cmd !== 'string' || !cmd.trim()) process.exit(0);

// Roots that walk the entire filesystem, or the known-wedging mount directly.
// Deliberately NARROW: `find .`, `find src/`, `find /home/deploy/dawntrader`
// and friends are all fine and must stay fine -- a guard that fires on ordinary
// work is a guard that gets switched off.
// ⛔⛔ DELIBERATELY MATCHES ONLY AT THE VERY START OF THE COMMAND. THIS IS THE
// SECOND DESIGN, AND THE FIRST ONE'S FAILURE IS THE REASON.
//
// v1 scanned the whole command string for these patterns anywhere. It fired
// TWICE WITHIN MINUTES on my own correct work -- once on the `cat > file <<EOF`
// heredoc writing the ledger entry ABOUT this guard, and once on the test script
// containing the patterns as string literals. A regex cannot distinguish "a
// command" from "text that mentions a command", and trying harder (splitting on
// separators, matching command heads) still fired, because documentation and
// test fixtures legitimately contain both.
//
// ★ A GUARD THAT FIRES ON CORRECT WORK IS A GUARD THAT GETS SWITCHED OFF --
// the same end as no guard, reached more annoyingly. So this version accepts a
// KNOWN, STATED GAP in exchange for a near-zero false-positive rate:
//   COVERED:     a whole-filesystem scan typed as the command -- which is what
//                a session actually does when it reaches for one.
//   NOT COVERED: one buried mid-pipeline, inside a heredoc, or behind `&&`.
// The CONDUCT.md line covers the judgement; this covers the reflex.
// Its silence is NOT evidence of compliance (#453).
const SCANS = [
  /^(?:sudo\s+)?find\s+\/(?:\s|$)/,
  /^(?:sudo\s+)?(?:grep|rg|ag)\s+(?:-\S+\s+)*\/(?:\s|$)/,
  /^(?:sudo\s+)?du\s+(?:-\S+\s+)*\/(?:\s|$)/,
  /^(?:sudo\s+)?ls\s+-[a-zA-Z]*R[a-zA-Z]*\s+\/(?:\s|$)/,
  /^(?:sudo\s+)?(?:ls|find|du|cat|grep|rg)\s+(?:-\S+\s+)*\/mnt\/gdrive\b/,
];

const head = cmd.trim();
if (!SCANS.some((p) => p.test(head))) process.exit(0);

process.stderr.write(
  'BLOCKED - whole-filesystem scan guard.\n' +
  '\n' +
  'This command walks from / (or touches /mnt/gdrive). On the Helsinki box that\n' +
  'mount wedges: the scan then blocks in uninterruptible IO, cannot be killed,\n' +
  'and the session looks IDLE while work queues behind it. Measured wedged on\n' +
  '2026-08-28 (ls /mnt/gdrive -> exit 124), and 20+ days before that.\n' +
  '\n' +
  'FIX: scope the search. Name the directory you actually mean -\n' +
  '  git grep <pattern>                 (the repo, at a ref - usually what you want)\n' +
  '  find /home/deploy/dawntrader ...   (the app)\n' +
  '  find /var/log/dawntrader ...       (the logs)\n' +
  '  find /opt/discord-bridges ...      (the comms fabric)\n' +
  '\n' +
  'If you genuinely need the whole box, say so to Kyle first and run it with\n' +
  'timeout and -xdev so it cannot cross into the mount:\n' +
  '  timeout 60 find / -xdev -name ...\n' +
  '\n' +
  'Origin: the rule existed verbatim in /home/langston/CLAUDE.md:303 (Kyle,\n' +
  '2026-06-24) - a file no CC session loads. It bound one of five actors.\n'
);
process.exit(2);
