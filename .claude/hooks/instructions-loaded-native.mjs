#!/usr/bin/env node
// B-RULES-1c — the NATIVE InstructionsLoaded hook (Langston Step-1 r3: available at
// v2.1.69, BELOW both measured binaries, so it needs no version gate and does not
// wait on the rules rollout).
//
// WHY THIS EXISTS ALONGSIDE log-instructions-loaded.mjs (OBJ-1's hand-built one):
// the hand-built instrument STATS A CANDIDATE LIST and says so honestly — it cannot
// prove the harness loaded anything. THIS hook is fired BY the harness when it loads
// a CLAUDE.md or .claude/rules/*.md file, so its rows are GROUND TRUTH. Both run for
// one cycle deliberately: candidate-set vs actually-loaded is itself a measurement.
//
// ★ IT IS ALSO THE DETECTOR FOR THE 2.1.198 SILENT NON-LOAD: below that version a
// path-scoped rule reached via a symlinked path simply does not load and nothing says
// so. A rule that never appears in this log while its file was read IS that failure.
//
// ⚠️ POSITIVE CONTROL REQUIRED BEFORE TRUSTING SILENCE (Langston, rule 29b): an empty
// sink from a hook that never fires at our version is INDISTINGUISHABLE from "nothing
// loaded." Fire it against a known-loading file and SEE the row before any conclusion
// rests on its silence.
//
// FAIL-OPEN: any error -> exit 0, no output. Never blocks a session.
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

try {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin is fine */ }

  const row = {
    ts: new Date().toISOString(),
    side: 'cc',
    source: 'native-InstructionsLoaded',
    measures: 'GROUND TRUTH — the harness fired this because it loaded these instruction files (contrast log-instructions-loaded.mjs, which stats a candidate set and cannot prove loading)',
    event: input.hook_event_name || 'InstructionsLoaded',
    session_id: input.session_id ?? null,
    cwd: input.cwd ?? null,
    // The payload shape is whatever the harness sends; capture it VERBATIM rather than
    // cherry-picking fields we assume exist — an assumed field name that isn't there
    // reads as absent, which is the class this whole programme keeps catching.
    payload: input,
  };

  appendFileSync(join(homedir(), '.claude', 'instructions-loaded.jsonl'), JSON.stringify(row) + '\n');
} catch { /* fail-open */ }
process.exit(0);
