#!/usr/bin/env node
// TEMPORARY PROBE (CC-A, B-MEASURE-GATE leg 2, #623). Measures whether a PreToolUse hook's
// stderr reaches the model, and — from r4 — whether the EXIT CODE is what gates it.
//
// r4 2026-08-31, Langston condition D1. The r3 answer (matched, wrote, exited 0, nothing
// surfaced) had two instrument gaps he would not let it rest on:
//
//   (1) `about_to_write_stderr` RECORDED INTENT, NOT COMPLETION. A lost flush and a
//       non-delivering channel are indistinguishable from that field. ⇒ we now record
//       BYTES ACTUALLY WRITTEN, from the return of a synchronous write to fd 2. Note that
//       process.stderr.write() returns a BACKPRESSURE BOOLEAN, not a byte count — which is
//       why it could never have closed this gap; writeSync returns the count.
//
//   (2) THE CONTROL WAS NOT CONTROLLED. The exit-2 deliveries that made the comparison came
//       from OTHER hooks — guard-governed-read and guard-push-tsc-baseline — i.e. different
//       files and different write call sites. So the pair varied exit code AND writer, and
//       isolated neither. ⇒ this file now carries BOTH arms itself: one sentinel exits 0,
//       the other exits 2, and they share ONE write call site (`emit()` below). Everything
//       is held constant except the exit code, which is the variable under test.
//
// ⚠️ THE EXIT-2 ARM GENUINELY BLOCKS ITS COMMAND. That is the point — it is what a delivering
// hook does — and it fires only on its own distinctive sentinel, so it is inert otherwise.
// FAIL-OPEN otherwise: any error exits 0. Sink rows are written unconditionally, before any
// decision, so an absent row means one thing only: the hook did not run.
import { readFileSync, appendFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SINK = join(homedir(), '.claude', 'probe-warn-delivery.jsonl');
const SENTINEL_WARN = 'CCA_HOOK_PROBE_9f3';   // arm A: write, then exit 0
const SENTINEL_BLOCK = 'CCA_HOOK_PROBE_2e7';  // arm B: write, then exit 2 — same call site

function note(row) {
  try {
    appendFileSync(SINK, JSON.stringify({ ts: new Date().toISOString(), ...row }) + '\n', 'utf8');
  } catch { /* a sink we cannot write must never block the session */ }
}

// THE ONE WRITE CALL SITE. Both arms go through here; only the caller's exit code differs.
function emit(text) {
  try {
    return writeSync(2, Buffer.from(text, 'utf8')); // returns bytes actually written
  } catch (e) {
    return { error: String(e && e.message) };
  }
}

let raw = '';
try { raw = readFileSync(0, 'utf8'); }
catch (e) { note({ stage: 'stdin_failed', error: String(e && e.message) }); process.exit(0); }

let payload;
try { payload = JSON.parse(raw); }
catch (e) { note({ stage: 'parse_failed', raw_bytes: raw.length, error: String(e && e.message) }); process.exit(0); }

const input = payload.tool_input || payload.toolInput || {};
const cmd = input.command || '';
const arm = cmd.includes(SENTINEL_BLOCK) ? 'block_exit2'
          : cmd.includes(SENTINEL_WARN) ? 'warn_exit0'
          : null;

const base = {
  stage: 'ran',
  tool: payload.tool_name || payload.toolName || null,
  spelling: payload.tool_input ? 'tool_input' : (payload.toolInput ? 'toolInput' : 'neither'),
  command_present: Boolean(cmd),
  arm,
};

if (!arm) { note({ ...base, exit_code: 0 }); process.exit(0); }

const text = `PROBE-WARN-DELIVERY [${arm}]: written to stderr by a PreToolUse hook at one shared call site; only the exit code differs between arms.\n`;
const bytes_written = emit(text);
const exit_code = arm === 'block_exit2' ? 2 : 0;

// Recorded AFTER the write returns, so this is completion, not intent.
note({ ...base, bytes_intended: Buffer.byteLength(text, 'utf8'), bytes_written, exit_code });
process.exit(exit_code);
