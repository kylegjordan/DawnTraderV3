#!/usr/bin/env node
// TEMPORARY PROBE (CC-A, B-MEASURE-GATE leg 2 pre-audit, #623). Measures ONE thing: does a
// PreToolUse hook's stderr reach the model when it exits 0 (warn, not block)?
//
// r3 2026-08-31 — TWO DEFECTS FIXED, BOTH FOUND BY A FRESH READER AGAINST THIS FILE, AND THE
// SECOND ONE IS RECORDED IN A SIBLING HOOK'S OWN HEADER AS HAVING ALREADY HAPPENED ONCE.
//
// (1) THE INSTRUMENT HAD NO LIVENESS SIGNAL. Its only output was the very thing being measured,
//     so a silent run was equally consistent with "warn-only stderr does not reach the model"
//     and "the hook never ran". An instrument whose silence cannot be told from its absence is
//     not an instrument (rule 29(b), #453) — and it was sitting inside this batch's own gate.
//
// (2) r2's fix WAS NOT SUFFICIENT, and the reason is the whole point: it wrote its trace INSIDE
//     the sentinel branch, so every failure that happens BEFORE the match — no stdin, invalid
//     JSON, or the payload arriving under a spelling this file does not read — still produced
//     no row and no stderr, i.e. exactly the ambiguity (1) was meant to remove, one step earlier.
//     guard-push-tsc-baseline.mjs:63-69 records that failure happening for real: its first
//     revision read `process.env.CLAUDE_TOOL_INPUT`, which is never set, so a guard documented
//     fail-CLOSED was silently fail-OPEN on every push — "an inert hook and a satisfied hook
//     look identical from outside." And measured at the ref, the two working guards accept BOTH
//     `tool_input` and `toolInput`; this probe accepted only the first.
//
// ⇒ SO: the row is written UNCONDITIONALLY, on every invocation, BEFORE any decision — and it
//   records what was actually parsed. Absence of a row now means one thing only: the hook did
//   not run. Both spellings are accepted, mirroring the guards that work.
// FAIL-OPEN throughout: any error exits 0. This hook must never block a session.
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SINK = join(homedir(), '.claude', 'probe-warn-delivery.jsonl');

function note(row) {
  try {
    appendFileSync(SINK, JSON.stringify({ ts: new Date().toISOString(), ...row }) + '\n', 'utf8');
  } catch { /* a sink we cannot write must never block the session */ }
}

let raw = '';
try { raw = readFileSync(0, 'utf8'); }
catch (e) { note({ stage: 'stdin_failed', error: String(e && e.message) }); process.exit(0); }

let payload;
try { payload = JSON.parse(raw); }
catch (e) { note({ stage: 'parse_failed', raw_bytes: raw.length, error: String(e && e.message) }); process.exit(0); }

// Both spellings, as the two working guards do.
const input = payload.tool_input || payload.toolInput || {};
const cmd = input.command || '';
const matched = cmd.includes('CCA_HOOK_PROBE_9f3');

note({
  stage: 'ran',
  tool: payload.tool_name || payload.toolName || null,
  // which spelling actually carried the payload — the thing that was never checked
  spelling: payload.tool_input ? 'tool_input' : (payload.toolInput ? 'toolInput' : 'neither'),
  command_present: Boolean(cmd),
  matched_sentinel: matched,
  about_to_write_stderr: matched,
  exit_code: 0,
});

if (matched) {
  process.stderr.write('PROBE-WARN-DELIVERY: this text was written to stderr by a PreToolUse hook that then exited 0.\n');
}
process.exit(0);
