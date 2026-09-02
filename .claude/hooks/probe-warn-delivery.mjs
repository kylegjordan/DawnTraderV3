#!/usr/bin/env node
// TEMPORARY PROBE (CC-A, B-MEASURE-GATE leg 2, #623). Measures what actually reaches the model
// from a PreToolUse hook, so no objective in this batch rests on an assumed channel.
//
// r7 2026-08-31, Langston's Q1 ruling. He refused the binary I offered ("additionalContext or
// block") on the grounds that the DELIVERY MECHANISM DOES NOT GET TO PICK THE RISK POSTURE: a
// measurement-shape predicate is a heuristic, it will false-positive, and a guard that
// false-blocks gets routed around and then trusted anyway. So non-blocking stands, and the
// third channel gets MEASURED rather than assumed — on the event OBJ-4 actually hooks
// (PreToolUse), with identical text across arms, "or you will have measured the adjacent
// object again."
//
// THE STDERR RESULT ALREADY IN HAND (r6, three arms, one write call site, identical payload):
//   exit 0 no block -> SILENT · exit 1 no block -> SILENT · exit 2 BLOCKS -> delivered verbatim.
//   ⇒ stderr is delivered only when the hook BLOCKS. Exit 2 is how a hook signals a block.
//   Population: n=1 per arm, one session, one build. NOT citable more broadly.
//
// THE JSON ARMS BELOW. The documented shape is hookSpecificOutput{hookEventName, ...} on
// STDOUT with exit 0 — treated here as a HYPOTHESIS ABOUT THE CONTRACT, not as evidence of
// delivery, which is the whole reason there is a positive control arm:
//   json_ac    additionalContext alone, exit 0, no block  <- the thing OBJ-4 needs
//   json_deny  permissionDecisionReason + deny, exit 0    <- POSITIVE CONTROL: documented to
//                                                            reach the model; if this is silent
//                                                            too, the JSON channel is not
//                                                            parsed at all and json_ac's
//                                                            silence says nothing about
//                                                            additionalContext specifically
//   json_both  both fields in one object                  <- isolates a dropped additionalContext
//                                                            from an unparsed object
//
// ⚠️ THE BLOCKING ARMS GENUINELY ABORT THEIR COMMAND. Every arm fires only on its own
// distinctive sentinel, so all of them are inert for any other command.
// ⛔ ABSENT `hook_sha` MEANS "PRE-r7, VERSION UNKNOWN" - IT DOES NOT MEAN "SAME VERSION AS THE
//    STAMPED ROWS" (Langston condition, 2026-08-31). Rows written before r7 carry no stamp, and
//    five clones on this machine ran three different versions of this file concurrently, so an
//    unstamped row cannot be attributed to a version AT ALL. A `SINK-NOTE` row carrying this text
//    and its own counts is appended to the sink itself, because the sink is what a later reader
//    opens - a caveat that lives only in source is a caveat the reader never sees. #546 shape:
//    an unstamped field invites absent to be read as uniform.
// FAIL-OPEN otherwise. Sink rows are written unconditionally, before any decision.
import { readFileSync, appendFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SINK = join(homedir(), '.claude', 'probe-warn-delivery.jsonl');

// Langston, Q2: project_dir is NOT sufficient. Stamping the hook file's own hash turns a
// one-time census into a STANDING READ-SITE — otherwise we measured the estate exactly once
// and asserted it thereafter, which is #978 shape A, the thing this batch is fixing at §4.1.
// FIVE clones currently run THREE versions of this file and HEAD does not tell you which.
let SELF = null;
try {
  // ⛔ NORMALISE LINE ENDINGS BEFORE HASHING — r8, found by the OBJ-5 self-test, which read this
  // probe's freshest row as "[ver … NOT current]" while the file on disk was current. The raw
  // bytes are CRLF in a checkout and LF in the blob, so the unnormalised hash gave one source
  // version two identities. Its sibling guard-measurement-shape was fixed for exactly this on
  // 08-31 and this file was not — the same defect, one file over, surviving the named fix.
  SELF = createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex').slice(0, 12);
} catch { /* fail-open: identity is diagnostic, never a precondition */ }

// stderr arms (r6, kept so the result stays reproducible)
const STDERR_ARMS = [
  ['CCA_HOOK_PROBE_2e7', 'block_exit2', 2],
  ['CCA_HOOK_PROBE_5b1', 'error_exit1', 1],
  ['CCA_HOOK_PROBE_9f3', 'warn_exit0', 0],
];
// stdout-JSON arms (r7)
const JSON_ARMS = [
  ['CCA_HOOK_PROBE_a11', 'json_ac'],
  ['CCA_HOOK_PROBE_b22', 'json_deny'],
  ['CCA_HOOK_PROBE_c33', 'json_both'],
];

// IDENTICAL across every arm and every channel. Nothing in it names the arm, so payload is
// constant and the channel is the only variable.
const TEXT = 'PROBE-DELIVERY: identical text, one payload; only the channel and exit code differ.';

function note(row) {
  try {
    appendFileSync(SINK, JSON.stringify({ ts: new Date().toISOString(), hook_sha: SELF, ...row }) + '\n', 'utf8');
  } catch { /* a sink we cannot write must never block the session */ }
}

let raw = '';
try { raw = readFileSync(0, 'utf8'); }
catch (e) { note({ stage: 'stdin_failed', error: String(e && e.message) }); process.exit(0); }

let payload;
try { payload = JSON.parse(raw); }
catch (e) { note({ stage: 'parse_failed', raw_bytes: raw.length, error: String(e && e.message) }); process.exit(0); }

const input = payload.tool_input || payload.toolInput || {};
const cmd = input.command || '';

const base = {
  stage: 'ran',
  tool: payload.tool_name || payload.toolName || null,
  spelling: payload.tool_input ? 'tool_input' : (payload.toolInput ? 'toolInput' : 'neither'),
  project_dir: process.env.CLAUDE_PROJECT_DIR || null,
};

const se = STDERR_ARMS.find(([s]) => cmd.includes(s));
if (se) {
  let bytes;
  try { bytes = writeSync(2, Buffer.from(TEXT + '\n', 'utf8')); }
  catch (e) { bytes = { error: String(e && e.message) }; }
  note({ ...base, channel: 'stderr', arm: se[1], bytes_written: bytes, exit_code: se[2] });
  process.exit(se[2]);
}

const js = JSON_ARMS.find(([s]) => cmd.includes(s));
if (js) {
  const hso = { hookEventName: 'PreToolUse' };
  if (js[1] === 'json_ac' || js[1] === 'json_both') hso.additionalContext = TEXT;
  if (js[1] === 'json_deny' || js[1] === 'json_both') {
    hso.permissionDecision = 'deny';
    hso.permissionDecisionReason = TEXT;
  }
  const out = JSON.stringify({ hookSpecificOutput: hso });
  let bytes;
  try { bytes = writeSync(1, Buffer.from(out, 'utf8')); }
  catch (e) { bytes = { error: String(e && e.message) }; }
  note({ ...base, channel: 'stdout_json', arm: js[1], fields: Object.keys(hso), bytes_written: bytes, exit_code: 0 });
  process.exit(0); // documented as the exit code for structured control
}

note({ ...base, channel: null, arm: null, exit_code: 0 });
process.exit(0);
