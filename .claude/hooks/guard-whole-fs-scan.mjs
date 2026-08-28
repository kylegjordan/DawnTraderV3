#!/usr/bin/env node
/**
 * guard-whole-fs-scan — PreToolUse guard against WHOLE-FILESYSTEM SCANS ON HELSINKI.
 *
 * ============================================================================
 * V4. THE FIRST THREE VERSIONS GUARDED THE WRONG MACHINE. Read this before
 * editing, because the mistake is not obvious and it was made three times.
 * ============================================================================
 *
 * THE HAZARD IS ON HELSINKI (204.168.141.77), not on the laptop.
 * That box has Google Drive mounted at /mnt/gdrive. The mount is WEDGED --
 * measured 2026-08-28: `timeout 8 ls /mnt/gdrive` -> exit 124, and per Infra
 * Claude it had been wedged 20+ days. A scan that walks from / there blocks in
 * uninterruptible IO: unkillable, no timeout, and the session that ran it looks
 * IDLE while a review queues behind it. It has hung Langston's worker twice
 * (Kyle directive 2026-06-24, /home/langston/CLAUDE.md:303).
 *
 * ⛔ A CC SESSION CANNOT REACH THAT MOUNT LOCALLY. It reaches it only by
 * sending a command over ssh. v1-v3 matched the command as typed on THIS
 * machine, which produced the exact inversion a fresh reviewer measured:
 *
 *     ssh root@204.168.141.77 'find / -name x'   -> ALLOWED   (the real hazard)
 *     find / -name x                             -> BLOCKED   (a Windows laptop
 *                                                   with no such mount: harmless)
 *
 * So it blocked the safe case and allowed the dangerous one. v4 inverts that:
 * the ssh-wrapped form is what gets blocked.
 *
 * ⚠️ WHAT IS DELIBERATELY *NOT* GUARDED, and why:
 *  - Local scans. There is no wedging mount on the laptop; `find /` over MSYS
 *    is slow at worst. Blocking it was noise, and it fired on my own work twice
 *    in the first ten minutes.
 *  - Langston himself. He runs on Helsinki out of /home/langston and does not
 *    load this repo's settings, so no hook here can bind him. His own
 *    CLAUDE.md:303 carries the rule; that is the only thing that reaches him.
 *  - Anything not routed through this session's Bash tool.
 * ⇒ THIS GUARD BINDS CC SESSIONS SENDING SCANS TO HELSINKI. That is one path,
 *   named, and it is the one this session can actually take.
 *
 * FAIL-OPEN BY CONSTRUCTION: any parse problem exits 0. Its silence is NOT
 * evidence of compliance (#453). Controls live in test/guard-whole-fs-scan.test.mjs
 * and are committed -- v3's ledger claimed controls that were never committed.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// ⛔ v4 REQUIRED THE HOST IN THE FIRST TOKEN AFTER `ssh`, so `ssh -o
// ConnectTimeout=15 root@…` slipped -- and that is THIS PROJECT'S OWN
// documented form (shared MEMORY.md §4.5's wake-watcher command). It also
// missed the real hostname `dawntrader-agent` and bare ssh_config aliases,
// which are demonstrably in use here (`ssh staging`). Now: a remote-exec verb
// anywhere, plus a host token anywhere.
export const REMOTE = /\b(?:ssh|rsync|scp)\b/;
export const HOST = /(?:204\.168\.141\.77|dawntrader-agent|helsinki|langston@|\blangston\b)/i;

// A scan rooted at bare `/` or at `/*`. Anchored to the VERB so a stray later
// `/` cannot drag an unrelated command in -- v4's `[^'"]*` spanned arbitrary
// distance and blocked `ls /opt/… && cd / && pwd`.
// Flags AND up to two non-flag words may precede the path, because grep/rg take
// the PATTERN first (`grep -rn foo /`). Tightening this to flags-only re-created
// v3's hole while fixing v4's — the two constraints pull against each other, so
// the bound is explicit rather than accidental.
export const ROOT_SCAN = /\b(?:find|grep|rg|ag|du|ls|tree|rsync)\b(?:\s+(?:-{1,2}\S+|\S+)){0,4}?\s+\/[*]?(?:\s|['"]|$)/;

// The mount, or `/mnt` used as an EXACT path (`find /mnt` walks into it).
// ⛔ Matching `/mnt` as a PREFIX blocked the sibling `/mnt/gdrive-backup`, so
// the parent case requires a terminator, not a slash.
export const MOUNT = /\/mnt\/gdrive(?:\/|\s|['"]|$)|\/mnt(?:\s|['"]|$)/;

// `timeout N` bounds the hang, so it is the sanctioned way to probe the mount.
// ⛔ v4 BLOCKED `ssh <h> 'timeout 8 ls /mnt/gdrive'` -- the exact command this
// file cites as its own evidence. A guard that forbids re-verifying its own
// premise cannot be checked by anyone.
export const BOUNDED = /\btimeout\s+\d+/;

// `-xdev` cannot cross a filesystem boundary. ⛔ v4 tested it against the WHOLE
// command, so `find /home -xdev; du -sh /` passed on the strength of an -xdev
// belonging to a different command. Now per segment. NOTE it is find-only: `du`
// uses `-x` and grep/rg/ls/tree/rsync have no equivalent, so it is not a
// general escape hatch and the refusal text must not offer it as one.
const SEGMENTS = (c) => c.split(/;|&&|\|\||\||\n/);

export function verdict(command) {
  if (!REMOTE.test(command) || !HOST.test(command)) return 'allow'; // not aimed at that box
  if (BOUNDED.test(command)) return 'allow';                        // hang is bounded
  for (const seg of SEGMENTS(command)) {
    const findXdev = /\bfind\b/.test(seg) && /\s-xdev\b/.test(seg);
    if (findXdev) continue;                    // this segment cannot cross into the mount
    if (MOUNT.test(seg)) return 'block';
    if (ROOT_SCAN.test(seg)) return 'block';
  }
  return 'allow';
}

// ⛔ ONLY run the guard when INVOKED as a hook, never on import -- the test file
// imports `verdict`, and a module that reads stdin at import time hangs it.
// ⛔ v4 used `endsWith(basename)` — a SUFFIX test, so any entry script whose
// name is a suffix of this one (`scan.mjs`, `fs-scan.mjs`) that imported this
// module would make it believe it was invoked directly: it would read fd 0 and
// call process.exit, SILENTLY KILLING THE HOST PROGRAM. Equality on the
// resolved URL is the correct test.
const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (!invokedDirectly) {
  // imported for testing: export only
} else {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const cmd = payload?.tool_input?.command;
  if (typeof cmd !== 'string' || !cmd.trim()) process.exit(0);
  if (verdict(cmd) === 'allow') process.exit(0);
  refuse();
}

function refuse() {
process.stderr.write(
  'BLOCKED - whole-filesystem scan aimed at Helsinki.\n' +
  '\n' +
  'That box has a WEDGED Google Drive mount at /mnt/gdrive (measured 2026-08-28:\n' +
  'ls returned a timeout). A scan walking from / there blocks in uninterruptible\n' +
  'IO - it cannot be killed and has no timeout - and your session reads as IDLE\n' +
  'while work queues behind it. It has hung Langston twice.\n' +
  '\n' +
  'FIX - name the directory you actually mean:\n' +
  '  /home/deploy/dawntrader     the app\n' +
  '  /var/log/dawntrader         the logs\n' +
  '  /opt/discord-bridges        the comms fabric\n' +
  '  /home/langston              his working directory\n' +
  '\n' +
  'If you genuinely need the whole box, -xdev cannot cross into the mount and is\n' +
  'allowed:  ssh <host> "timeout 60 find / -xdev -name ..."\n' +
  '\n' +
  'NOT GUARDED, so do not read silence as safety: local scans (no such mount\n' +
  'here), and Langston himself (he does not load this repo settings - his own\n' +
  'CLAUDE.md:303 carries the rule).\n'
);
process.exit(2);
}
