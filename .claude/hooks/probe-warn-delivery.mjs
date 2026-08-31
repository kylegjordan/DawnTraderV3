#!/usr/bin/env node
// TEMPORARY PROBE (CC-A, B-MEASURE-GATE leg 2, #623). Measures what gates delivery of a
// PreToolUse hook's stderr to the model.
//
// r5 2026-08-31 — a fresh reader refuted "everything else was held constant" in the r4 pair,
// on two counts that both had to be fixed rather than caveated:
//   (1) THE TWO ARMS WROTE DIFFERENT TEXT (139 vs 140 bytes — the arm name was interpolated
//       into the message), so payload varied alongside exit code. ⇒ the text is now IDENTICAL
//       across arms; the arm is recorded in the sink only.
//   (2) EXIT CODE CO-VARIED WITH BLOCKED/NOT-BLOCKED. Exit 2 aborts the tool call; exit 0 lets
//       it run. So "the exit code gates delivery" and "a hook that BLOCKS gets its stderr shown
//       as the block reason" fit the same two rows, and the pair could not separate them.
//       ⇒ a THIRD arm at exit 1: non-zero, but NON-blocking. It splits them —
//         exit 1 delivers  ⇒ blocking is not the gate; non-zero is.
//         exit 1 silent    ⇒ blocking (or exit-2 specifically) is the gate, not merely non-zero.
//       Either result is an answer, which is the only reason to run it.
//
// ⚠️ THE EXIT-2 ARM GENUINELY BLOCKS ITS COMMAND — that is what it is for — and every arm fires
// only on its own distinctive sentinel, so all three are inert for any other command.
// FAIL-OPEN otherwise. Sink rows are written unconditionally, before any decision, so an absent
// row means the hook did not run — subject to the stated limit that note() swallows write errors.
import { readFileSync, appendFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SINK = join(homedir(), '.claude', 'probe-warn-delivery.jsonl');
const ARMS = [
  ['CCA_HOOK_PROBE_2e7', 'block_exit2', 2],  // non-zero, blocking
  ['CCA_HOOK_PROBE_5b1', 'error_exit1', 1],  // non-zero, NON-blocking — the discriminator
  ['CCA_HOOK_PROBE_9f3', 'warn_exit0', 0],   // zero, non-blocking
];

// IDENTICAL for every arm. Nothing in it identifies which arm wrote it, so payload is constant.
const TEXT = 'PROBE-WARN-DELIVERY: identical text, one shared write call site; only the exit code differs.\n';

function note(row) {
  try {
    appendFileSync(SINK, JSON.stringify({ ts: new Date().toISOString(), ...row }) + '\n', 'utf8');
  } catch { /* a sink we cannot write must never block the session */ }
}

// THE ONE WRITE CALL SITE. Returns bytes accepted by the write(2) syscall.
function emit(text) {
  try { return writeSync(2, Buffer.from(text, 'utf8')); }
  catch (e) { return { error: String(e && e.message) }; }
}

let raw = '';
try { raw = readFileSync(0, 'utf8'); }
catch (e) { note({ stage: 'stdin_failed', error: String(e && e.message) }); process.exit(0); }

let payload;
try { payload = JSON.parse(raw); }
catch (e) { note({ stage: 'parse_failed', raw_bytes: raw.length, error: String(e && e.message) }); process.exit(0); }

const input = payload.tool_input || payload.toolInput || {};
const cmd = input.command || '';
const hit = ARMS.find(([sentinel]) => cmd.includes(sentinel));

const base = {
  stage: 'ran',
  tool: payload.tool_name || payload.toolName || null,
  spelling: payload.tool_input ? 'tool_input' : (payload.toolInput ? 'toolInput' : 'neither'),
  command_present: Boolean(cmd),
  arm: hit ? hit[1] : null,
  // which clone this hook copy is executing from — five clones hold three different versions
  // of this file, and HEAD does not tell you which (see the pre-audit's clone census).
  project_dir: process.env.CLAUDE_PROJECT_DIR || null,
};

if (!hit) { note({ ...base, exit_code: 0 }); process.exit(0); }

const bytes_written = emit(TEXT);
note({ ...base, bytes_intended: Buffer.byteLength(TEXT, 'utf8'), bytes_written, exit_code: hit[2] });
process.exit(hit[2]);
