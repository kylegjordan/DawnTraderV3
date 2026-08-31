#!/usr/bin/env node
// TEMPORARY PROBE (CC-A, B-MEASURE-GATE leg 2 pre-audit, #623). Measures ONE thing: does a
// PreToolUse hook's stderr reach the model when it exits 0 (warn, not block)?
// Fires ONLY on a distinctive sentinel so it is inert for every other command and session.
//
// r2 2026-08-31 — THE LIVENESS LEG, and it is the whole reason this probe could not terminate.
// As originally written the probe's ONLY output was stderr, so a silent result was ambiguous
// across three states that matter differently:
//   (a) the hook ran and warn-only stderr does NOT reach the model  <- the answer we want
//   (b) the hook ran and stderr reached nobody for another reason
//   (c) the hook NEVER RAN                                          <- indistinguishable from (a)
// An instrument whose silence cannot be told from its absence is exactly the class this batch
// exists to kill (rule 29(b) / #453), and it was sitting inside the batch's own gate.
// So it now leaves a trace: every fire appends one JSONL row to the sink below. Next session,
// a row present + no stderr seen => warn-only delivery does not surface (a real answer);
// no row at all => the hook did not run, and the probe says so instead of implying (a).
// FAIL-OPEN throughout: any error exits 0. This hook must never block a session.
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SINK = join(homedir(), '.claude', 'probe-warn-delivery.jsonl');

let cmd = '';
try { cmd = ((JSON.parse(readFileSync(0, 'utf8')).tool_input) || {}).command || ''; }
catch { process.exit(0); }

if (cmd.includes('CCA_HOOK_PROBE_9f3')) {
  try {
    appendFileSync(SINK, JSON.stringify({
      ts: new Date().toISOString(),
      fired: true,
      exit_code_about_to_be_used: 0,
      note: 'PreToolUse hook executed and is about to write to stderr then exit 0',
    }) + '\n', 'utf8');
  } catch { /* fail-open: a sink we cannot write must never block the session */ }
  process.stderr.write('PROBE-WARN-DELIVERY: this text was written to stderr by a PreToolUse hook that then exited 0.\n');
}
process.exit(0);
