#!/usr/bin/env node
// OBJ-4 — B-MEASURE-GATE leg 2 (#623). Rule 29 measurement discipline as a PreToolUse check on
// the SHAPE of a command, before it runs.
//
// ⛔⛔ WARN-ONLY. It emits `additionalContext` and nothing else; the string `permissionDecision`
// does not appear in this file. Every written exit is `process.exit(0)`.
// ⚠️ "CANNOT BLOCK" IS A CLAIM ABOUT UNREACHABILITY THAT THE FILE'S STRUCTURE DOES NOT BY ITSELF
// ESTABLISH — an uncaught throw exits 1, not 0. r2 therefore wraps EVERY stage, including the
// top-level identity computation, so no throw can escape. Exit 1 would still not block (measured
// below), but the honest statement is "no reachable path exits non-zero", not "none exists".
//
//   MEASURED 2026-08-31, PreToolUse/Bash, identical payload across arms, one write call site:
//     stderr exit 0 no block -> NOT delivered · exit 1 no block -> NOT delivered
//     stderr exit 2 BLOCKS   -> delivered verbatim
//     stdout JSON additionalContext, exit 0, NO BLOCK -> DELIVERED
//   Population: n=1 per arm, ONE session, ONE build, ONE event, ONE matcher.
//   ⛔ NOT citable as "stderr never delivers on exit 0", and NOT citable for any other event.
//   Langston's boundary, verbatim: NON-BLOCKING IS THE DEFAULT, NOT THE CEILING.
//
// ⛔⛔ r2 — A FRESH READER REFUTED TWO CLAIMS THE r1 FILE MADE ABOUT ITSELF. Both are fixed here,
// and both were the kind that read as covered:
//
//   (1) THE WRITE-REDIRECTION ELISION LEG DID NOT EXIST. r1's docstring and its commit message
//       both asserted that redirection payloads were elided. `executablePart()` elided heredocs
//       and nothing else. ⇒ THE MOTIVATING INCIDENT STILL FALSE-POSITIVED: a crew post warning
//       about the guard (`cc-send --message "...grep -c..."`) fired it, which is the exact case
//       the leg was written for. The suite passed because its only mention case WAS a heredoc.
//
//   (2) THE MATCHERS HAD NO LOCALITY. `absence-without-control` required a search token and a
//       count token ANYWHERE in the command. In the author's own flagged command the `| wc -l`
//       belonged to `git diff --numstat` and the `grep` was an unrelated later stage feeding
//       `cut` — so the fire was a right answer from an UNRELATED CONJUNCT, and the same
//       erroneous instrument had already run twice, silently, earlier in the session.
//       ⇒ r2 matches PER PIPELINE STAGE, so a token pair must occur in one stage to count.
//
// FAIL-OPEN by construction. `decided:false` in the sink distinguishes "clean" from "bailed" —
// without it a fail-open hook's silence reads as a pass, which is the lookalike failure in the
// enforcement layer that this batch exists to prevent.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ KNOWN GAPS — WHAT THIS GUARD DOES **NOT** CATCH. READ THIS BEFORE TRUSTING ITS SILENCE.
//
// Stated as its own block on Langston's condition, because these previously lived inside
// justification comments and A JUSTIFICATION READS AS "HANDLED". Its silence is not a clean bill
// of health; these are the cases where it is quiet BY CONSTRUCTION. Each is pinned by an arm in
// scripts/measure-gate/test-guard-measurement-shape.mjs §K, asserting CURRENT behaviour, so an
// edit that changes one fails the suite loudly instead of silently widening or closing a hole.
//
//  1. `tail` WAS DELIBERATELY REMOVED FROM THE TRUNCATION SHAPE, AND THAT SOLD COVERAGE.
//     `tail -200 log | wc -l` and `tail -200 log > slice` are NOT caught. The trade bought
//     freedom from a permanent false-positive floor (see the shape's own note) and it is a real
//     loss, not a clean win. ⚠️ `tail -200 log | grep -c X` IS still caught — by
//     `count-from-search`, not by the truncation shape.
//  2. `stages()` IS QUOTE-UNAWARE: a quoted separator (`grep ';' f -c`) splits a stage that
//     should not split, so locality is defeated and the command goes silent.
//  3. `stages()` IS SUBSTITUTION-UNAWARE: a pipe inside `$( )` splits one instrument into two.
//     STRUCTURAL, but NOT demonstrable with the three shapes that exist today — recorded as
//     unproven rather than asserted, because the first attempt to assert it was itself wrong.
//  4. THE MENTION LEG IS REGEX, NOT A PARSER. Three rounds produced three new blind spots, each
//     found by the next reader. ⛔ FROZEN ON LANGSTON'S RULING — no fourth round: a tokenizer
//     buys a new failure class in an always-run hook to sharpen a warning that never blocks, and
//     a false negative here is the cheapest failure in the batch.
//  5. IT SEES THE INSTRUMENT, NEVER THE USE. Whether a reading is about to become a claim is not
//     visible before execution. That is the objective's central open question, not a bug.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

let SINK = null, SELF = null;
try {
  SINK = join(homedir(), '.claude', 'measurement-shape.jsonl');
  // The hook stamps its own hash: five clones have been measured running three versions of one
  // hook concurrently, and HEAD does not say which. Without it an FP rate is computed over an
  // unknown mixture of versions — the sink already holds three distinct hook_sha values.
  // ⛔⛔ NORMALISE LINE ENDINGS BEFORE HASHING. Hashing the file as it sits on disk gave the LF
  // blob and the CRLF checkout TWO DIFFERENT IDENTITIES for ONE source version — so the live
  // hook stamped one sha while a document filtered its table on the other, and measured the
  // wrong population. That is this hook's own `worktree-not-ref` shape landing on the hook's own
  // identity field, found by a fresh reader. `hook_sha` must identify SOURCE, not checkout form.
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  SELF = createHash('sha256').update(src).digest('hex').slice(0, 12);
} catch { /* identity is diagnostic, never a precondition */ }

function note(row) {
  if (!SINK) return;
  try {
    // ⛔ STAMPED HERE so it reaches EVERY row including the bail paths. r2 set it only on the
    // decided row, so the suite's own fail-open arm wrote four rows labelled REAL — contaminating
    // `decided:false`, which is the fail-open health signal this file relies on. And it is written
    // explicitly rather than left undefined: an absent key must not be ambiguous between "real
    // traffic" and "written by a hook version that predates the marker". Both reader-found.
    const synthetic = process.env.GUARD_SYNTHETIC === '1';
    appendFileSync(SINK, JSON.stringify({ ts: new Date().toISOString(), hook_sha: SELF, synthetic, ...row }) + '\n', 'utf8');
  } catch { /* a sink we cannot write must never affect the session */ }
}

/**
 * Strip the regions where a shape is being QUOTED rather than RUN. Conservative: when structure
 * cannot be parsed we keep the text and accept a false positive, because dropping text silently
 * is how a guard goes blind.
 */
function stripMentions(cmd) {
  let s = cmd;
  // ⛔⛔ ORDER IS LOAD-BEARING: THE QUOTED-ARGUMENT RULES RUN FIRST.
  // With heredoc-elision first, a `<<` appearing inside MESSAGE TEXT reached the unterminated-
  // heredoc rule and ate everything to end of command — so `cc-send --message "cat <<EOF ..."
  // && wc -c CLAUDE.md` went silent on a real instrument. Eliding the quoted region first means
  // that `<<` is already gone before the heredoc rules see it. Reader-found, suite arm D11.
  s = stripQuotedProse(s);
  // Heredoc bodies. The delimiter is literal text on the wire, which is what makes this
  // detectable with no model call.
  // ⚠️ THE MARKER MUST NOT CONTAIN `<<` — r1's did, the unterminated pattern below then matched
  // the MARKER and ate the rest of the command, so a shape executed after a closed heredoc went
  // unreported. This leg's own class, one level down: the elision text mistaken for its target.
  s = s.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, ' [heredoc-elided] ');
  s = s.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*$/m, ' [unterminated-heredoc-elided] ');
  return s;
}

/** A quoted argument is PROSE unless the quote itself is running something. */
function stripQuotedProse(cmd) {
  // ⛔⛔ THE `execRe` GUARD IS THE MOST IMPORTANT LINE IN THIS FILE, BECAUSE OVER-ELISION IS WORSE
  // THAN UNDER-ELISION: a missed mention is noise; A SWALLOWED INSTRUMENT IS A BLIND GUARD THAT
  // READS AS A CLEAN ONE. r2 elided the whole quoted region including any `$( )` inside it, so
  //   cc-send --message "count: $(grep -c MISTAKE file)"
  // ran the instrument, fed the result straight into a crew post AS A CLAIM, and was SILENT.
  // ⇒ a quoted region containing a command substitution or a backtick is NOT prose. Leave it.
  const execRe = /\$\(|`/;
  let s = cmd;
  // `--message=` as well as `--message ` — r2 required whitespace, and the motivating incident
  // recurred verbatim with an `=`. Reader-found.
  s = s.replace(/(--message|--body|--text|--note|-m)(\s+|=)(['"])([\s\S]*?)\3/g,
    // ⛔⛔ THE `execRe` BRANCH MUST STILL NEUTRALISE `<<`, OR THE TWO r3 FIXES CANCEL EACH OTHER.
    // Ordering was changed so the quoted region is gone before the heredoc rules run — but that
    // only holds on the branch where it IS elided. On the KEPT branch a `<<` in message text
    // survived into the unterminated-heredoc rule and ate to end of command, so
    //   cc-send --message "cat <<EOF then $(date)" && wc -c CLAUDE.md
    // went SILENT — precisely when the message contains a running instrument, which is the
    // condition execRe exists to protect. Same command without the substitution fired.
    // ⇒ keep the region for matching, but blind the heredoc rules to its `<<`. Reader-found;
    // neither half was covered because no arm combined `<<` with `$(`.
    (m, _f, _sep, _q, body) => (execRe.test(body) ? m.replace(/<</g, '[lt-lt]') : ' [quoted-message-elided] '));
  // Payload side of a write redirection. ⚠️ ANCHORED WITHIN ONE STAGE: r2's was unanchored and
  // backtracked until it found a `>`, so a second quote later let it swallow every stage in
  // between — `echo "a" ; grep -c TODO f ; echo "b" > log` went silent on a real instrument.
  s = s.replace(/\b(echo|printf)\b[^|;&\n]*?(['"])([^'"\n]*?)\2\s*(>>?)/g,
    (m, _c, _q, body, redir) => (execRe.test(body) ? m : ' [write-payload-elided] ' + redir));
  return s;
}

/**
 * Split into stages so a token pair must co-occur in ONE stage.
 * ⚠️ SINGLE `&` IS A SEPARATOR TOO — r2 omitted it, and background chains are the single most
 * likely place for unrelated commands to sit side by side. Reader-found.
 * ⛔ STATED LIMIT, not a claim to have solved shell parsing: this split is quote- and
 * substitution-unaware. A quoted `;` splits a stage that should not split, and a pipe inside
 * `$( )` splits one instrument into two. Both directions are known and neither is handled.
 */
function stages(s) {
  return s.split(/\|\||&&|[|;&\n]/).map((x) => x.trim()).filter(Boolean);
}

/**
 * Each shape is a rule-29 failure visible in one command stage, with no model call, never firing
 * on a value. Deliberately few — a matcher that fires often is a matcher that gets ignored.
 */
const SHAPES = [
  {
    id: 'worktree-not-ref',
    // Size/hash taken from a CRLF checkout and compared against LF blobs. Measured three times
    // in one day by this file's author, including once across all five clones at once.
    test: (st) => /\bwc\s+-[cm]\b/.test(st) || /\b(md5sum|sha1sum|sha256sum)\b/.test(st),
    say: 'Size/hash from the WORKING TREE. This repo stores LF and checks out CRLF, so a worktree byte-count or hash will not equal the object-store one. If this is a cap check or a comparison against a ref, read the blob (git show <ref>:<path>). BOTH SIDES OF A COMPARISON MUST COME FROM ONE SURFACE, and each side names its surface.',
  },
  {
    id: 'truncation-is-not-population',
    // ⛔⛔ `tail` IS DELIBERATELY NOT IN THIS SHAPE, AND THE REASON IS A PERMANENT FLOOR RATHER
    // THAN A JUDGEMENT CALL. Governance MANDATES a tail on every turn — CLAUDE.md §10.5 requires
    // `tail -50 …/system-alerts.jsonl` BEFORE RESPONDING TO ANY USER MESSAGE, and MEMORY.md item
    // 4 requires `tail -30 …/cc-discord-inbox.jsonl` at session start. Both matched, both fired,
    // on a shape that CAN NEVER BECOME A CLAIM. ⇒ unlike batch-session contamination this never
    // washes out: it scales with turn count, in every session, forever. A guard that fires on a
    // command the rules oblige you to run every turn is a banner-blindness generator by
    // construction. Reader-found; `head` and `git log -N` are kept because neither is mandated.
    test: (st) => /\bhead\s+-n?\s*\d+/.test(st) || /\bgit\s+log\b[^\n]*\s-\d+\b/.test(st),
    say: 'This read is TRUNCATED. A head/-N slice is not the population — if the result becomes a count, a share or an absence claim, re-run it unbounded or state the truncation beside the number.',
  },
  {
    id: 'count-from-search',
    // r2: ONE shape, not two. r1 had `count-is-not-a-set` and `absence-without-control` as
    // separate entries; measured over 54 fires, the first NEVER fired alone and the second fired
    // alone once. They were one detector wearing two names, and presenting them as two overstated
    // the coverage. Now locality-scoped: the count must belong to the SAME stage as the search.
    test: (st) => /\b(grep|rg|git\s+grep)\b/.test(st) && /(-c\b|--count\b)/.test(st),
    say: 'grep -c counts MATCHING LINES — not occurrences, not distinct items. And if it returns ZERO that is not yet an absence: rule 29(b) wants the instrument shown returning a KNOWN POSITIVE first, or its silence carries no information.',
  },
];

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); }
  catch (e) { note({ decided: false, reason: 'stdin_failed', error: String(e && e.message) }); return; }

  let payload;
  try { payload = JSON.parse(raw); }
  catch { note({ decided: false, reason: 'parse_failed', raw_bytes: raw.length }); return; }

  const input = (payload && (payload.tool_input || payload.toolInput)) || {};
  const cmd = typeof input.command === 'string' ? input.command : '';
  if (!cmd) { note({ decided: false, reason: 'no_command' }); return; }

  const stripped = stripMentions(cmd);
  const hits = [];
  for (const sh of SHAPES) {
    if (stages(stripped).some((st) => sh.test(st))) hits.push(sh);
  }

  // Written on EVERY decided invocation, fired or not: the denominator has to exist before the
  // numerator means anything.
  // ⛔⛔ SYNTHETIC MARKER. The offline suite runs this hook as a child process with payloads
  // CHOSEN to fire, and every one of those rows lands in the same sink as real session traffic.
  // r2's first fire-rate reading was computed over the mixture and was therefore meaningless —
  // it measured the test suite. The suite sets GUARD_SYNTHETIC=1, so the two populations can be
  // separated at read time. Without this the denominator is not the thing the bar is about.
  note({
    decided: true,
    tool: (payload && (payload.tool_name || payload.toolName)) || null,
    cmd_bytes: cmd.length,
    mention_elided: stripped.length !== cmd.length,
    stages: stages(stripped).length,
    fired: hits.map((h) => h.id),
  });

  if (!hits.length) return;
  const text =
    // ⚠️ SCOPED TO THIS HOOK. r2 said "nothing was blocked", which is a claim about the whole
    // PreToolUse decision — and a SIBLING hook is registered on the same Bash matcher that CAN
    // exit non-zero. This file can only speak for itself. Reader-found.
    'MEASUREMENT-SHAPE WARNING (rule 29 — THIS hook is warn-only and did not block; it cannot speak for other hooks):\n' +
    hits.map((h) => '• ' + h.id + ': ' + h.say).join('\n') +
    '\nIf the reading is not about to become a claim, ignore this.';
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text },
    }));
  } catch { /* fail-open */ }
}

// Nothing may escape. An uncaught throw would exit 1 — which does not block, but does make the
// "no reachable non-zero exit" property untrue.
try { main(); } catch (e) { try { note({ decided: false, reason: 'main_threw', error: String(e && e.message) }); } catch { /* */ } }
process.exit(0);
