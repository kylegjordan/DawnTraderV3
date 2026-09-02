#!/usr/bin/env node
// OBJ-6c stage 1 — B-MEASURE-GATE leg 2 (#623). A NO-OP OBSERVER for the `PostToolUse` event,
// same discipline as observe-userpromptsubmit.mjs: record the SHAPE of the live payload before
// anything is built against it. The UserPromptSubmit payload differed from the documented one
// (no tool_input; extra scratchpad_dir/prompt_id/session_title), so the documented PostToolUse
// shape is a hypothesis until this sink holds rows from a real session.
//
// RECORDS KEYS AND TYPES ONLY — never the command, never the output. For a Bash tool_response
// it additionally records the keys of the response object, the typeof each, and the byte length
// of any string field, because 6c's predicate must be derivable from (command, exit code,
// output) and this is how we learn which of those the harness actually hands over.
// Exits 0 on every path, emits nothing, cannot affect the session.
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

let SINK = null, SELF = null;
try {
  SINK = join(homedir(), '.claude', 'posttooluse-observe.jsonl');
  SELF = createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex').slice(0, 12);
} catch { /* diagnostic only */ }

function shape(v, depth = 0) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'string') return `string(${Buffer.byteLength(v, 'utf8')}B)`;
  if (typeof v === 'object') {
    if (depth >= 2) return 'object';
    const o = {};
    for (const k of Object.keys(v)) o[k] = shape(v[k], depth + 1);
    return o;
  }
  return typeof v;
}

try {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const row = {
    ts: new Date().toISOString(), hook_sha: SELF,
    synthetic: process.env.GUARD_SYNTHETIC === '1',
    project_dir: process.env.CLAUDE_PROJECT_DIR || null,
    event: payload && payload.hook_event_name, tool: payload && payload.tool_name,
    shape: shape(payload),
  };
  if (SINK) appendFileSync(SINK, JSON.stringify(row) + '\n', 'utf8');
} catch { /* never affects the session */ }
process.exit(0);
