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

// The places an MSYS/Git-Bash path can actually live on this laptop. Node is not MSYS: `/tmp/x`
// resolves to `C:\tmp\x` and `/c/Users/…` to `C:\c\Users\…`, neither of which exists.
function msysCandidates(p, cwd) {
  const out = [p];
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p);
  if (m) out.push(`${m[1].toUpperCase()}:/${m[2]}`);
  if (p.startsWith('/tmp/')) {
    const rest = p.slice(5);
    for (const t of [process.env.TMP, process.env.TEMP, process.env.TMPDIR]) if (t) out.push(join(t, rest));
    out.push(join('C:/Program Files/Git/tmp', rest));
  }
  if (cwd && !/^([a-zA-Z]:|\/)/.test(p)) out.push(join(cwd, p));
  return out;
}

function main() {
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); }
  catch { note({ decided: false, reason: 'parse_failed' }); return; }

  const cmd = ((payload && (payload.tool_input || payload.toolInput)) || {}).command;
  if (typeof cmd !== 'string' || !cmd) { note({ decided: false, reason: 'no_command' }); return; }
  // r3, reader-found: a sink row per Bash call, git or not, is an unrotated append on every
  // command. Non-commit commands are not this guard's population; they leave no row.
  if (!/\bgit\b[^\n;|&]*\bcommit\b/.test(cmd)) return;

  // The trigger: a git commit whose OWN STAGE names a completion-report path.
  // ⛔ r2 — LOCALITY, and it was proven necessary ONE MINUTE after wiring: the r1 trigger
  // matched `git commit` and `COMPLETION_REPORT` ANYWHERE in the command, and a compound
  // command that committed settings and then posted a crew notice MENTIONING completion
  // reports in a heredoc fired it. The exact use-vs-mention class OBJ-4 took four review
  // rounds over, reproduced in this guard on its first live command. Heredoc bodies are
  // elided first (same marker discipline: the marker must not contain `<<`), then the token
  // must sit in the SAME sequence element as the `git commit`.
  const elided = cmd
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm, ' [heredoc-elided] ')
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*$/m, ' [unterminated-heredoc-elided] ');
  // `git -C <dir> commit` / `git -c k=v commit` are the same commit (reader B3/B4).
  const stage = elided.split(/&&|\|\||[;\n]/).find((s) => /\bgit\b(?:\s+-[Cc]\s*(?:"[^"]*"|'[^']*'|\S+))*\s+commit\b/.test(s));
  if (!stage || !/COMPLETION_REPORT/i.test(stage)) {
    note({ decided: true, fired: false }); return;
  }
  const cmdStage = stage;

  // Where is the message? Tier-1 form: -F <msgfile>. Fallback: inline -m.
  // ⚠️ Read from the COMMIT'S OWN STAGE — an -F elsewhere in a compound command is not this
  // commit's message.
  // ⛔ r3 — READER-FOUND, LOAD-BEARING: this hook runs BEFORE the command, so a msgfile written
  // by the SAME command (`printf … > m.txt && git commit -F m.txt`) does not exist yet — 35 of 47
  // real closes since 07-23 take that form — and `-F -` fed by a heredoc had its body elided at
  // :59 before the read. Both read as "unreadable" and a CORRECTLY CITED close still warned; the
  // suite's "cited → silent" arm was proven only on a pre-existing Windows-absolute path (9/47).
  // Node also resolves MSYS `/tmp/x` to `C:\tmp\x` and `/c/…` to `C:\c\…` (14+1 of 47).
  // ⇒ the message is now taken from EVERY place it can live, and the RAW command text is the
  // fallback of record: when the file is created in-command, its content IS in the command.
  // KNOWN LIMIT (3): a run id anywhere in the raw command silences it — a commit command that
  // carries a 10-11 digit run number is, in this population, citing it.
  // ⛔ r4 — READER-FOUND, LOAD-BEARING, and it inverted r3's fix: in Git-Bash `/tmp` IS `$TEMP`
  // (measured: `cd /tmp && pwd -W` → C:/Users/kyleg/AppData/Local/Temp) and those files PERSIST,
  // while names are reused constantly (`/tmp/m2.txt` 9×, `/tmp/msg.txt` 7× across 3,948 commit
  // commands). So r3's "read the file first" read the PREVIOUS commit's message at hook time —
  // a reused name holding an old citation SILENCED an uncited close. ⇒ if the command itself
  // WRITES the msgfile (a `>`/`>>`/`tee` naming it in an earlier stage) the file on disk is
  // stale BY CONSTRUCTION and the command text is the only honest source. The file is read
  // only when nothing in the command writes it (authored earlier, e.g. by the Write tool).
  // The command-text source is the command UP TO AND INCLUDING the commit stage (plus a heredoc
  // feeding `-F -`): a run id in a LATER stage (`… && cc-send --message 'id 1525096267'`) is
  // not this commit's message. Inline -m and `-F -` need no branch of their own — both are
  // literally in that text, which is why r3's -m branch could be deleted with the suite green.
  const COMMIT_RE = /\bgit\b(?:\s+-[Cc]\s*(?:"[^"]*"|'[^']*'|\S+))*\s+commit\b/;
  const ci = cmd.search(COMMIT_RE);
  const post = cmd.slice(ci);
  const stageEnd = post.search(/&&|\|\|(?!\|)|;/);
  const commandText = cmd.slice(0, ci) + (stageEnd === -1 ? post : post.slice(0, stageEnd));

  let msg = null, msgSource = null;
  const fm = /(?:-F|--file)[\s=]+("([^"]+)"|'([^']+)'|(\S+))/.exec(cmdStage);
  if (fm) {
    const p = fm[2] || fm[3] || fm[4];
    const base = p.split(/[\\/]/).pop();
    const writtenInCommand = p === '-' || (base && new RegExp('(?:>{1,2}\\|?|\\btee\\b(?:\\s+-a)?)\\s*(?:"[^"]*"|\'[^\']*\'|\\S*)?' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(cmd.slice(0, ci)));
    if (writtenInCommand) { msgSource = 'written-in-command'; }
    else {
      for (const cand of msysCandidates(p, payload && payload.cwd)) {
        try { msg = readFileSync(cand, 'utf8'); msgSource = 'msgfile'; break; } catch { /* next */ }
      }
      if (msg === null) msgSource = 'msgfile-unreadable';
    }
  }
  if (msg === null) { msg = commandText; msgSource = (msgSource ? msgSource + '+' : '') + 'command-text'; }

  // A GitHub Actions run id is a 10-11 digit number. A commit sha is hex and will not match.
  const cited = /\b\d{10,11}\b/.test(msg);
  const fired = !cited;
  note({ decided: true, fired, msg_source: msgSource, cited });
  if (!fired) return;

  const why = /unreadable/.test(msgSource || '')
    ? 'its message file could not be read at hook time and the command text carries no CI run id (a 10-11 digit GitHub Actions run number)'
    : `the message (${msgSource}) contains no CI run id (a 10-11 digit GitHub Actions run number)`;
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
