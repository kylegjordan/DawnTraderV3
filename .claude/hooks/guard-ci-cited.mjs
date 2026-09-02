#!/usr/bin/env node
// OBJ-3 — B-MEASURE-GATE leg 2 (#623). Rule 19's CI-green gate, keyed on the event Langston
// corrected it to: "the event isn't 'close'" — it is THE COMMIT THAT ADDS A COMPLETION-REPORT
// PATH. That commit is the close's carrier, and rule 19 requires all four CI jobs green with the
// run cited, not asserted.
//
// ⛔ WARN-ONLY, NEVER BLOCKS. Delivery via additionalContext (measured channel).
// WHAT IT ASKS FOR: a CI RUN ID cited in the commit message — a long digit run (GitHub Actions
// run ids are 10-11 digits). It checks the message via the `-F <msgfile>` the Tier-1 commit form
// mandates, reading that file from disk. An inline -m message is checked in the command string.
// ⚠️ KNOWN LIMITS, stated not implied: (1) a cited run id is not a GREEN run id — this checks
// the citation EXISTS, which is the checkable half; whether it is green stays Step-5 work.
// (2) CANNOT SEE THE STAGED INDEX — it keys on the COMMAND naming a completion-report path, so
// `git add <report> && git commit` in two separate turns is invisible to it. The command-visible
// case is the mandated Tier-1 form (`git commit -F <msg> -- <paths>`), which names its paths.
// FAIL-OPEN: every path exits 0.
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

let SINK = null, SELF = null;
try {
  SINK = join(homedir(), '.claude', 'ci-cited.jsonl');
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

function main() {
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); }
  catch { note({ decided: false, reason: 'parse_failed' }); return; }

  const cmd = ((payload && (payload.tool_input || payload.toolInput)) || {}).command;
  if (typeof cmd !== 'string' || !cmd) { note({ decided: false, reason: 'no_command' }); return; }

  // The trigger: a git commit whose COMMAND names a completion-report path.
  if (!/\bgit\s+commit\b/.test(cmd) || !/COMPLETION_REPORT/i.test(cmd)) {
    note({ decided: true, fired: false }); return;
  }

  // Where is the message? Tier-1 form: -F <msgfile>. Fallback: inline -m.
  let msg = null, msgSource = null;
  const fm = /-F\s+("([^"]+)"|'([^']+)'|(\S+))/.exec(cmd);
  if (fm) {
    const p = fm[2] || fm[3] || fm[4];
    try { msg = readFileSync(p, 'utf8'); msgSource = 'msgfile'; }
    catch { msgSource = 'msgfile-unreadable'; }
  } else {
    const im = /-m\s+("([^"]*)"|'([^']*)')/.exec(cmd);
    if (im) { msg = im[2] || im[3] || ''; msgSource = 'inline'; }
  }

  // A GitHub Actions run id is a 10-11 digit number. A commit sha is hex and will not match.
  const cited = msg !== null && /\b\d{10,11}\b/.test(msg);
  const fired = !cited;
  note({ decided: true, fired, msg_source: msgSource, cited });
  if (!fired) return;

  const why = msg === null
    ? `the commit message could not be read (${msgSource || 'no -F or -m found'})`
    : 'the message contains no CI run id (a 10-11 digit GitHub Actions run number)';
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext:
          `CI-CITATION WARNING (rule 19, warn-only — nothing was blocked): this commit adds a COMPLETION REPORT and ${why}. ` +
          `Rule 19 requires ALL FOUR jobs green on the branch head with the run CITED, not asserted — and with three sessions ` +
          `pushing, verify the PER-JOB conclusion, never the run-level summary: cancelled is not failure is not success. ` +
          `Cite the run id in the message, or say explicitly why CI does not apply to this close.`,
      },
    }));
  } catch { /* fail-open */ }
}

try { main(); } catch (e) { try { note({ decided: false, reason: 'main_threw', error: String(e && e.message) }); } catch { /* */ } }
process.exit(0);
