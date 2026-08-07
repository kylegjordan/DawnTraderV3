#!/usr/bin/env node
// TEMPORARY PROBE (CC-A, B-MEASURE-GATE leg 2 pre-audit). Measures ONE thing: does a
// PreToolUse hook's stderr reach the model when it exits 0 (warn, not block)?
// Fires ONLY on a distinctive sentinel so it is inert for every other command and session.
import { readFileSync } from 'node:fs';
let cmd = '';
try { cmd = ((JSON.parse(readFileSync(0,'utf8')).tool_input)||{}).command || ''; }
catch { process.exit(0); }
if (cmd.includes('CCA_HOOK_PROBE_9f3')) {
  process.stderr.write('PROBE-WARN-DELIVERY: this text was written to stderr by a PreToolUse hook that then exited 0.\n');
}
process.exit(0);
