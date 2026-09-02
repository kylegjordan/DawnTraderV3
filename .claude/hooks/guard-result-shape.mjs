#!/usr/bin/env node
// OBJ-6c — B-MEASURE-GATE leg 2 (#623). The AFFORDABLE half of result inspection: a deterministic
// `PostToolUse` hook on Bash, WARN-ONLY, no model call, no rate target. Its bar, verbatim from the
// scope: FIRES ON THE SHAPE, SILENT ON THE CONTROL.
//
// THE PREDICATE, as Langston ruled it at Step 1: escalate on A RESULT THAT COULD NOT HAVE
// ANSWERED THE REQUEST — a self-identifying property of the output contradicting the command
// that asked for it. Three binding constraints, pre-registered:
//   1. derivable from command + output with NO MODEL CALL (if it needs the CLAIM, that is 6d);
//   2. tuned for RECALL, measured by escalation RATE, never "each escalation is real";
//   3. it must NEVER fire on a value. A zero, a round number, an empty result are properties of
//      the result ALONE — the output-anomaly arm was rejected outright as a banner-blindness
//      generator. Every leg below needs BOTH a property of the command AND a property of the output.
//
// ⛔ BUILT AGAINST THE OBSERVED SHAPE, NOT THE DOCUMENTED ONE: observe-posttooluse.mjs recorded the
// live payload 2026-09-02 — tool_response is { stdout, stderr, interrupted, isImage,
// noOutputExpected }. THERE IS NO EXIT CODE. The scope wrote "command + exit code + output"; the
// harness hands over no exit code, so nothing here may depend on one.
//
// THE FOUR LEGS, each named for the recorded instance it is built from:
//   cap-bound       — the command carries a numeric cap (head -N, tail -N, git log -N, -m N,
//                     LIMIT N, --limit N) and the output has EXACTLY N lines ⇒ the cap did the
//                     filtering; the population is unbounded by the query. Instance 3
//                     (`git log -200 --grep` read as "of the last 200"). Floor: cap ≥ 5 — a cap
//                     of 1 equals its output constantly and would fire on every `head -1`.
//   error-consumed  — stderr carries a hard error signature (fatal:, No such file, Traceback,
//                     command not found, 404, ECONNREFUSED…) AND the command piped into a
//                     consumer (wc, grep -c, jq, sort, python…) or stdout's last line is a bare
//                     integer ⇒ an error was swallowed and then COUNTED. The #980/#732 shape:
//                     "0 breaches of 0 rows" from an endpoint that never answered.
//   html-not-json   — the command asked an API (curl/wget to /api/ or piped to jq) and the body
//                     is HTML ⇒ a login page or an error page was read as data. Instance 8.
//   other-document  — the command fetched or showed a path whose name carries a batch id, and
//                     the document's H1 names a DIFFERENT batch ⇒ the wrong file answered.
//                     Langston's own live instance: HTTP 200, 7,968 B, `# B-GOV-HYGIENE-ANALYST-1`
//                     — a different batch's scope, caught only because the H1 named it.
//
// SELF-REFERENCE: caps and consumers are read from the command with heredoc bodies ELIDED, the
// OBJ-4 discipline — a notice that MENTIONS `head -50` is not a command that runs it.
//
// ⛔ THE GUARD'S SILENCE IS NON-EVIDENTIAL. Four shapes are not the class; a result can fail to
// answer its request in every way not listed here. KNOWN GAPS: (1) an error swallowed by `2>&1`
// INTO the consumer leaves no stderr and a plausible number — invisible here; (2) a 404 body
// that parses as an empty list without a traceback — invisible; (3) `interrupted` results are
// skipped as undecided; (4) only the first and last 64 KB of stdout are inspected.
// FAIL-OPEN: every path exits 0. Sink: ~/.claude/result-shape.jsonl (GUARD_SYNTHETIC marks tests).
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CAP_FLOOR = 5;
const WINDOW = 64 * 1024;

let SINK = null, SELF = null;
try {
  SINK = join(homedir(), '.claude', 'result-shape.jsonl');
  SELF = createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex').slice(0, 12);
} catch { /* diagnostic only */ }

function note(row) {
  if (!SINK) return;
  try {
    appendFileSync(SINK, JSON.stringify({
      ts: new Date().toISOString(), hook_sha: SELF,
      synthetic: process.env.GUARD_SYNTHETIC === '1',
      project_dir: process.env.CLAUDE_PROJECT_DIR || null, ...row,
    }) + '\n', 'utf8');
  } catch { /* never affects the session */ }
}

function elide(cmd) {
  return cmd
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_-]*)\1[\s\S]*?^\s*\2\s*$/gm, ' [heredoc-elided] ')
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_-]*)\1[\s\S]*$/m, ' [unterminated-heredoc-elided] ');
}

/** Every numeric cap the command carries, with the stage it sits in. */
function caps(cmd) {
  const out = [];
  const pats = [
    /\bhead\s+(?:-n\s*|-)(\d+)\b/g, /\btail\s+(?:-n\s*|-)(\d+)\b/g,
    /\bgit\s+log\b[^|;&\n]*?\s-(\d+)\b/g, /\bgit\s+log\b[^|;&\n]*?\s(?:-n|--max-count)[\s=](\d+)\b/g,
    /\bgrep\b[^|;&\n]*?\s-m\s*(\d+)\b/g, /\bLIMIT\s+(\d+)\b/gi, /\s--limit[\s=](\d+)\b/g, /\bgh\b[^|;&\n]*?\s-L\s*(\d+)\b/g,
  ];
  for (const p of pats) { let m; while ((m = p.exec(cmd))) out.push(Number(m[1])); }
  return out;
}

const ERROR_SIG = /^(fatal|error|ERROR|Error):|No such file or directory|Traceback \(most recent call last\)|command not found|Permission denied|\b404\b|Not Found|Cannot GET|ECONNREFUSED|ETIMEDOUT|Connection refused|does not exist in|Could not resolve host|unknown revision or path/m;
const CONSUMER = /\|\s*(wc\b|grep\s+-c|grep\s+-[a-zA-Z]*c|jq\b|sort\b|uniq\b|awk\b|cut\b|python3?\b|node\b|sed\b|tr\b|head\b|tail\b)/;
const BATCH_ID = /\b(B-[A-Z0-9][A-Z0-9-]*[A-Z0-9]|P\d+-B[0-9][0-9a-z.]*)\b/;

function batchIdFromPath(cmd) {
  const m = /([A-Za-z0-9_.-]*?)(B_[A-Z0-9][A-Z0-9_]*[A-Z0-9]|P\d+_B[0-9][0-9a-z.]*)[A-Za-z0-9_.-]*\.md\b/.exec(cmd);
  return m ? m[2].replace(/_/g, '-') : null;
}

function shapes(cmd, stdout, stderr) {
  const hits = [];
  const ec = elide(cmd);
  const outLines = stdout.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const nLines = stdout.trim() === '' ? 0 : outLines.length;

  for (const cap of caps(ec)) {
    if (cap >= CAP_FLOOR && nLines === cap) {
      hits.push(['cap-bound', `the output is EXACTLY ${cap} lines and the command capped at ${cap} — the cap did the filtering, so this is the cap, not the population. The real count is ≥ ${cap}; re-run unbounded before it becomes a number.`]);
      break;
    }
  }

  const errLine = ERROR_SIG.exec(stderr) || (stderr === '' ? null : null);
  const lastOut = nLines ? outLines[nLines - 1].trim() : '';
  if (errLine && (CONSUMER.test(ec) || /^\d+$/.test(lastOut))) {
    hits.push(['error-consumed', `stderr carries "${errLine[0]}" and the pipeline went on to consume the result${/^\d+$/.test(lastOut) ? ` (last stdout line is the bare number ${lastOut})` : ''} — an error was swallowed and then counted. That number describes the failure, not the object.`]);
  }

  const asksApi = /\b(curl|wget|Invoke-WebRequest|iwr)\b/.test(ec) && (/\/api\//.test(ec) || /\|\s*jq\b/.test(ec) || /application\/json/.test(ec));
  const head = stdout.slice(0, 512).trimStart();
  if (asksApi && (/^<!DOCTYPE\s+html/i.test(head) || /^<html\b/i.test(head) || /<title>/i.test(head))) {
    hits.push(['html-not-json', 'the command asked an API for data and the body is HTML — a login page, a redirect or an error page was returned, not the data. Nothing parsed from it is about the object.']);
  }

  const wanted = batchIdFromPath(ec);
  if (wanted) {
    const h1 = /^#\s+(.+)$/m.exec(stdout.slice(0, 4096));
    const got = h1 && BATCH_ID.exec(h1[1]);
    if (got && !got[1].startsWith(wanted) && !wanted.startsWith(got[1])) {
      hits.push(['other-document', `the path asked for ${wanted} and the document's H1 names ${got[1]} — a different batch's file answered (HTTP 200 does not make it the right file).`]);
    }
  }
  return hits;
}

function main() {
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); }
  catch { note({ decided: false, reason: 'parse_failed' }); return; }
  if (!payload || payload.tool_name !== 'Bash') return;
  const cmd = (payload.tool_input || {}).command;
  const resp = payload.tool_response || {};
  if (typeof cmd !== 'string' || !cmd) { note({ decided: false, reason: 'no_command' }); return; }
  if (resp.interrupted) { note({ decided: false, reason: 'interrupted' }); return; }
  let stdout = typeof resp.stdout === 'string' ? resp.stdout : '';
  const stderr = typeof resp.stderr === 'string' ? resp.stderr : '';
  if (stdout.length > 2 * WINDOW) stdout = stdout.slice(0, WINDOW) + '\n' + stdout.slice(-WINDOW);

  const hits = shapes(cmd, stdout, stderr);
  note({ decided: true, fired: hits.length > 0, legs: hits.map((h) => h[0]), out_lines: stdout ? stdout.split('\n').length : 0 });
  if (!hits.length) return;
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          'RESULT-SHAPE WARNING (rule 29 — warn-only, after the fact; this hook cannot speak for what it does not list):\n' +
          hits.map(([leg, why]) => `• ${leg}: ${why}`).join('\n') +
          '\nIf this result is about to become a claim, it could not have answered the request as asked — re-run against the object.',
      },
    }));
  } catch { /* fail-open */ }
}

try { main(); } catch (e) { try { note({ decided: false, reason: 'main_threw', error: String(e && e.message) }); } catch { /* */ } }
process.exit(0);
