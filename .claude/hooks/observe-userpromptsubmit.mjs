#!/usr/bin/env node
// OBJ-1 stage 1 — B-MEASURE-GATE leg 2 (#623). A PAYLOAD-LOGGING NO-OP on `UserPromptSubmit`.
//
// ⛔ THIS IS NOT THE ALERT INJECTOR. It builds nothing, injects nothing, contacts no network.
// It exists because of the standing rule this batch's own audit set for ANY new event surface:
//   "a payload-logging no-op ships FIRST and its observed shape is recorded, before any matcher
//    is written against it. Reasoning from the documented PreToolUse contract to an UNREAD event
//    is precisely wrong-object — assuming an adjacent thing behaves like the one you read."
// `UserPromptSubmit` has never been used by this project (measured: 0 occurrences under .claude/
// at the ref, against PreToolUse=11 as the control), so its payload shape, its timing and even
// whether it fires in this harness build are all UNKNOWN until observed.
//
// WHAT GETS RECORDED, and why exactly this: the top-level KEYS and the type of each value —
// enough to write a correct reader against, without logging the prompt text itself. The user's
// words do not belong in a diagnostic sink.
//
// FAIL-OPEN: every path exits 0 wrapped in try/catch. This hook must never delay a turn — the
// eventual injector carries Langston's hard requirement (timeout ≤3s, exit 0 on any failure),
// and its no-op predecessor must obviously not be worse.
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

try {
  const SINK = join(homedir(), '.claude', 'userpromptsubmit-observe.jsonl');
  let SELF = null;
  try {
    SELF = createHash('sha256')
      .update(readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'))
      .digest('hex').slice(0, 12);
  } catch { /* identity is diagnostic, never a precondition */ }

  let raw = '';
  let parsed = null, parseError = null;
  try { raw = readFileSync(0, 'utf8'); } catch (e) { parseError = 'stdin: ' + e.message; }
  if (raw && parseError === null) {
    try { parsed = JSON.parse(raw); } catch (e) { parseError = 'json: ' + e.message; }
  }

  const shape = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      // types only — never the prompt text.
      shape[k] = Array.isArray(v) ? 'array(' + v.length + ')'
        : v === null ? 'null'
        : typeof v === 'object' ? 'object{' + Object.keys(v).join(',') + '}'
        : typeof v + (typeof v === 'string' ? '(' + v.length + 'ch)' : '');
    }
  }

  appendFileSync(SINK, JSON.stringify({
    ts: new Date().toISOString(),
    hook_sha: SELF,
    project_dir: process.env.CLAUDE_PROJECT_DIR || null,
    raw_bytes: raw.length,
    parse_error: parseError,
    top_level_shape: shape,
  }) + '\n', 'utf8');
} catch { /* fail-open, always */ }
process.exit(0);
