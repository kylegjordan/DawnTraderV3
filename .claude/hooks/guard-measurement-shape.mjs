#!/usr/bin/env node
// OBJ-4 — B-MEASURE-GATE leg 2 (#623). Rule 29 measurement discipline, converted from prose
// into a PreToolUse check on the shape of a command BEFORE it runs.
//
// ⛔⛔ WARN-ONLY. IT NEVER BLOCKS. IT CANNOT BLOCK — there is no code path here that exits
// non-zero or emits a permissionDecision. That is a Langston ruling and a measured one:
//
//   MEASURED 2026-08-31, PreToolUse/Bash, identical payload across arms, one write call site:
//     stderr  exit 0, no block  -> NOT delivered
//     stderr  exit 1, no block  -> NOT delivered
//     stderr  exit 2, BLOCKS    -> delivered verbatim
//     stdout JSON additionalContext, exit 0, NO BLOCK -> DELIVERED
//   ⇒ a non-blocking hook CAN reach the model, so nothing here needs to block to be heard.
//   Population: n=1 per arm, ONE session, ONE harness build, ONE event, ONE matcher.
//   ⛔ NOT citable as "stderr never delivers on exit 0" and NOT citable for any other event —
//      availability is event-scoped and one event was measured.
//
//   Langston's boundary, recorded verbatim so it cannot drift: NON-BLOCKING IS THE DEFAULT,
//   NOT THE CEILING. A deterministic predicate with a measured near-zero FP rate remains
//   eligible to block. "No forced escalation" must not harden into "blocking retired."
//
// ⛔⛔ THE USE-vs-MENTION LEG IS NOT A REFINEMENT. IT IS LOAD-BEARING, AND IT EXISTS BECAUSE
// THIS HOOK'S PREDECESSOR BLOCKED THE POST THAT WAS WARNING THE CREW ABOUT IT.
//   A shape-matcher scanning a whole command fires on text ABOUT its trigger, not only on USE
//   of it. This project documents its own bad measurements for a living — MISTAKE_PATTERNS.md
//   is a file whose entire purpose is to quote them — so without this leg the guard would fire
//   on every scope, review and completion report that cites a bad shape. A guard against wrong
//   measurement that fires on documentation about wrong measurement is a banner-blindness
//   generator, which is the outcome the design exists to avoid.
//   ⚠️ It is a heuristic on top of a heuristic and it WILL be imperfect: a heredoc can carry a
//   command that is executed elsewhere. It is cheap, needs no model call, and removes the
//   largest false-positive source in this corpus. A self-referential fire COUNTS as a false
//   positive against the ≤2% bar and may not be excused post hoc.
//
// FAIL-OPEN by construction: every error path exits 0 emitting nothing. This hook must never
// break a session, and its silence must never be read as "the command was clean" — see the
// `decided` field in the sink, which distinguishes a clean verdict from a hook that bailed.
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SINK = join(homedir(), '.claude', 'measurement-shape.jsonl');

// OBJ-5 leg: the hook stamps its own hash on every row. Five clones on this machine have been
// measured running three different versions of one hook file, and HEAD does not tell you which
// — the estate is versioned by when each session last started, not by its commit. Without this
// the FP rate is computed over an unknown mixture of hook versions.
let SELF = null;
try {
  SELF = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
} catch { /* identity is diagnostic, never a precondition */ }

function note(row) {
  try {
    appendFileSync(SINK, JSON.stringify({ ts: new Date().toISOString(), hook_sha: SELF, ...row }) + '\n', 'utf8');
  } catch { /* a sink we cannot write must never affect the session */ }
}

/**
 * Remove the regions of a command where a measurement shape is being QUOTED rather than RUN:
 * heredoc bodies, and the payload side of a write redirection. Returns the executable remainder.
 * Conservative by design — when the structure cannot be parsed we return the whole command and
 * accept the false positive, because dropping text is how a guard goes silently blind.
 */
function executablePart(cmd) {
  let s = cmd;
  // Heredocs: <<EOF ... EOF and <<'EOF' ... EOF (and <<- variants). The delimiter is literal
  // text on the wire, which is what makes this detectable with no model call.
  const heredoc = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm;
  // ⚠️ THE MARKER MUST NOT CONTAIN `<<`. The first version did, and the unterminated-heredoc
  // pattern below then matched the MARKER ITSELF and ate the rest of the command — so a shape
  // that was genuinely executed after a closed heredoc went unreported. Caught by arm D of the
  // offline suite, and it is this leg's own class one level down: the elision text was mistaken
  // for the thing it was eliding.
  s = s.replace(heredoc, ' [heredoc-body-elided] ');
  // An unterminated heredoc (the body is still being written) — elide to end of command.
  s = s.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*$/m, ' [unterminated-heredoc-elided] ');
  return s;
}

/**
 * The shapes. Each is a rule-29 failure that is visible in the COMMAND ALONE, before execution,
 * with no model call and no inspection of any value. Deliberately few: a matcher that fires
 * often is a matcher that gets ignored, and Langston rejected a whole arm of this design on
 * exactly that ground.
 */
const SHAPES = [
  {
    id: 'count-is-not-a-set',
    // `grep -c` counts LINES CONTAINING a match, not occurrences and not distinct things.
    test: (s) => /\bgrep\b[^|;&\n]*\s-[A-Za-z]*c/.test(s),
    say: 'grep -c counts MATCHING LINES, not occurrences and not distinct items. If this number is about to become "N instances" or a denominator, name which of the three you mean and confirm the instrument returns that.',
  },
  {
    id: 'truncation-is-not-population',
    // `-n N`, `head -N`, `git log -N` read back as though N were the population.
    test: (s) => /\b(head|tail)\s+-n?\s*\d+/.test(s) || /\bgit\s+log\b[^|;&\n]*\s-\d+\b/.test(s),
    say: 'This read is TRUNCATED. A head/tail/-N slice is not the population — if the result becomes a count, a share or an absence claim, re-run it unbounded or state the truncation beside the number.',
  },
  {
    id: 'worktree-not-ref',
    // Byte/size/hash claims taken from the checkout instead of the object store. On this repo
    // the working tree is CRLF and the blobs are LF, so the two disagree by one byte per line.
    test: (s) => /\bwc\s+-[cm]\b/.test(s) || /\b(md5sum|sha1sum|sha256sum)\b/.test(s),
    say: 'Size/hash from the WORKING TREE. This repo stores LF and checks out CRLF, so a worktree byte-count or hash will not equal the object-store one — it differs by about one byte per line. If this is a cap check or a comparison against a ref, read the blob (git show <ref>:<path>) instead. BOTH SIDES OF A COMPARISON MUST COME FROM ONE SURFACE, and each side names its surface.',
  },
  {
    id: 'absence-without-control',
    // A search whose interesting outcome is zero, with no positive control alongside it.
    test: (s) => /\b(grep|rg|git\s+grep)\b/.test(s) && /(\|\s*wc\s+-l|-c\b|--count\b)/.test(s),
    say: 'If this returns ZERO you cannot yet call it an absence. Rule 29(b): show the instrument returning a KNOWN POSITIVE first, or its silence carries no information.',
  },
];

let raw = '';
try { raw = readFileSync(0, 'utf8'); }
catch (e) { note({ decided: false, reason: 'stdin_failed', error: String(e && e.message) }); process.exit(0); }

let payload;
try { payload = JSON.parse(raw); }
catch (e) { note({ decided: false, reason: 'parse_failed', raw_bytes: raw.length }); process.exit(0); }

const input = payload.tool_input || payload.toolInput || {};
const cmd = typeof input.command === 'string' ? input.command : '';
if (!cmd) { note({ decided: false, reason: 'no_command' }); process.exit(0); }

const exec = executablePart(cmd);
const elided = exec.length !== cmd.length;

let hits = [];
try {
  hits = SHAPES.filter((s) => s.test(exec));
} catch (e) {
  note({ decided: false, reason: 'matcher_threw', error: String(e && e.message) });
  process.exit(0);
}

// Recorded on EVERY invocation, fired or not — the denominator for the FP rate has to exist
// before the numerator means anything.
note({
  decided: true,
  tool: payload.tool_name || payload.toolName || null,
  cmd_bytes: cmd.length,
  mention_elided: elided,
  fired: hits.map((h) => h.id),
});

if (!hits.length) process.exit(0);

const body = hits.map((h) => `• ${h.id}: ${h.say}`).join('\n');
const text =
  'MEASUREMENT-SHAPE WARNING (rule 29, warn-only — nothing was blocked, and this hook cannot block):\n' +
  body +
  '\nIf the reading is not about to become a claim, ignore this.';

try {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text },
  }));
} catch { /* fail-open */ }
process.exit(0);
