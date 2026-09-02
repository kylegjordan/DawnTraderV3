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
// ⛔ BUILT AGAINST THE OBSERVED WIRE, NOT THE DOCUMENTED ONE. Two measurements, both load-bearing:
//   (a) observe-posttooluse.mjs, 2026-09-02: tool_response is { stdout, stderr, interrupted,
//       isImage, noOutputExpected }. THERE IS NO EXIT CODE.
//   (b) r2 reader, 75,739 real Bash results replayed: STDERR IS STRUCTURALLY EMPTY. The harness
//       merges the child's stderr INTO stdout — 46 `fatal:` lines from git show, an index.lock
//       failure with no 2>&1, all arrived on stdout; the only non-empty stderr ever seen was the
//       harness's own "Shell cwd was reset" notice. r1 keyed the error leg on stderr and had
//       ZERO reachable inputs. Every leg now reads stdout only.
//
// THE LEGS, each named for the recorded instance it is built from, each on a SINGLE-PIPELINE
// command (r2): the harness returns the whole command's stdout, so a cap or an H1 can only be
// compared against it when the command IS one pipeline (leading `cd`/`export` stages allowed).
// On `echo hdr; grep | head -20` the count includes the header and the leg INVERTS — 65% of r1's
// replayed cap-bound fires were on multi-stage commands, where it was wrong both ways.
//   cap-bound       — one pipeline carrying a numeric cap N ≥ 5 (head/tail -N, git log -N,
//                     grep -m N, LIMIT N, --limit N) and stdout has EXACTLY N lines. Instance 3
//                     (`git log -200 --grep` read as "of the last 200"). ⚠️ HONEST WORDING: the cap
//                     MAY have bounded it — a 50-line file under `tail -50` also has 50 lines; the
//                     count is not evidence either way, which is exactly why it must be re-run.
//                     Floor 5: a cap of 1 equals its output constantly.
//   error-counted   — ONE pipeline whose LAST stage is a real counter (wc, grep -c, uniq -c,
//                     jq length), stdout carries a hard error signature (fatal:, No such file,
//                     Traceback, command not found, HTTP 404…) AND its last line is a bare
//                     integer ⇒ an error was printed and the count was produced anyway — the
//                     number describes the failure (`grep: /tmp/x: No such file` → `0`).
//                     r3: the r2 version allowed any stage and any "python"/"sort" — 60 replayed
//                     fires, 0 on a single pipeline, every number a value or another stage's
//                     count. That was a value leg wearing an error leg's name.
//   html-not-json   — the command asked an API (curl/wget to /api/ or piped to jq) and the body
//                     is HTML ⇒ a login page or an error page was read as data.
//   other-document  — one pipeline that fetches/shows ONE path whose name carries a batch id, and
//                     the document's H1 (within its first 20 lines) names a batch that shares NO
//                     word with the path's ⇒ the wrong file answered. Langston's live instance:
//                     HTTP 200, `# B-GOV-HYGIENE-ANALYST-1` for a B_MEASURE_GATE path. Renamed or
//                     sub-batch files (`# F-G-1 — B-GRID-REPRESENTABILITY` for B_EXIT_GRID_…) share
//                     a word and stay silent — all 7 of r1's replayed fires were of that kind.
//
// SELF-REFERENCE: heredoc bodies AND quoted message strings (-m/--message/echo "…") are elided
// before caps are read — a commit message that MENTIONS `head -50` is not a command that runs it.
//
// ⛔ THE GUARD'S SILENCE IS NON-EVIDENTIAL. Four shapes are not the class. KNOWN GAPS, stated:
//   (1) ★ INSTANCE 8 AS IT ACTUALLY OCCURRED IS NOT CAUGHT: `/api/trades/closed` returned a JSON
//       404 body `{"error":"Not Found"}`, python parsed it cleanly and printed "0 of 0 closed" —
//       no signature, no HTML, no traceback. Nothing in the output identifies it; that is 6d's
//       job (re-execute against the object), not a shape's.
//   (2) an error swallowed inside a consumer that prints only a number (no signature reaches
//       stdout) is invisible; (3) multi-stage commands are outside cap-bound and other-document
//       by design; (4) `interrupted` results are skipped as undecided; (5) only the first and
//       last 64 KB of stdout are inspected; (6) a real `tail -50` that genuinely overflowed fires
//       every time — ~10/day at current cadence — and that is the predicate, not a defect.
// FAIL-OPEN: every path exits 0. Sink: ~/.claude/result-shape.jsonl (GUARD_SYNTHETIC marks tests).
import { readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CAP_FLOOR = 5;
const WINDOW = 64 * 1024;
const H1_LINES = 20;

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
    // r3: keep the heredoc's OWN first line (`cat <<'EOF' | head -20` carries a cap there);
    // elide from the newline after the tag to the terminator.
    // The retained start line must not still read as a heredoc opener, or the unterminated pass
    // below re-matches it and elides every later stage (found by a mutation arm, r3).
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_-]*)\1([^\n]*)\n[\s\S]*?^\s*\2\s*$/gm, '[heredoc $2]$3 [heredoc-elided] ')
    .replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_-]*)\1([^\n]*)\n[\s\S]*$/m, '[heredoc $2]$3 [unterminated-heredoc-elided] ')
    .replace(/(?:-m\s+|--message(?:=|\s+)|\becho\s+(?:-[a-zA-Z]+\s+)?)("[^"]*"|'[^']*')/g, ' [quoted-prose-elided] ');
}

/** Quote-aware stage split: `;`, `&&`, `||`, newline OUTSIDE quotes. r3, reader-found: the r2
 *  split was quote-blind, so `psql -c "select 1; select 2 LIMIT 20"` read as two stages and
 *  65 genuine exact-cap results in the replay were silenced. */
function splitStages(s) {
  const out = []; let q = null, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    const two = s.slice(i, i + 2);
    if (two === '&&' || two === '||') { out.push(s.slice(start, i)); start = i + 2; i++; continue; }
    if (c === ';' || c === '\n') { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** The single pipeline the harness's stdout belongs to, or null if the command is multi-stage.
 *  A remote/sub-shell wrapper (`ssh host '…'`, `sh -c '…'`, `su - x -c '…'`) is single only if
 *  its quoted payload is single too — the payload's stages produce the stdout. */
function singlePipeline(ec, depth = 0) {
  const body = splitStages(ec).filter((s) => !/^(cd|export|set|source|pushd|popd)\b/.test(s));
  if (body.length !== 1) return null;
  const one = body[0];
  // r4 (round-3 reader): 8,091 of 15,293 real wrapper stages carry text AFTER the closing quote
  // (`2>&1`, `2>/dev/null`, `| tail -N`); anchoring on the quote let those fall through as one
  // pipeline whose INNER multi-stage caps were read — 40 replayed fires on an inner cap. The
  // trailing text may be redirections and a final head/tail; the payload must still be single.
  const w = /^(?:ssh\b[^"']*|(?:bash|sh|su\b[^"']*)\s+(?:-l?c|-c)\s*)("([^"]*)"|'([^']*)')((?:\s*\d?>[>&]?\S*)*(?:\s*\|\s*(?:head|tail)\s+(?:-n\s*|-)\d+\b\S*)?)\s*$/.exec(one);
  if (w && depth < 2) {
    const inner = singlePipeline(w[2] !== undefined ? w[2] : w[3], depth + 1);
    if (inner === null) return null;
    return w[4] && w[4].trim() ? one : inner; // trailing outer cap counts too, so keep the outer stage
  }
  return one;
}

/** Every numeric cap the pipeline carries. */
function caps(p) {
  const out = [];
  const pats = [
    /\bhead\s+(?:-n\s*|-)(\d+)\b/g, /\btail\s+(?:-n\s*|-)(\d+)\b/g,
    /\bgit\s+log\b[^|]*?\s-(\d+)\b/g, /\bgit\s+log\b[^|]*?\s(?:-n|--max-count)[\s=](\d+)\b/g,
    /\bgrep\b[^|]*?\s-m\s*(\d+)\b/g, /\bLIMIT\s+(\d+)\b/gi, /\s--limit[\s=](\d+)\b/g, /\bgh\b[^|]*?\s-L\s*(\d+)\b/g,
  ];
  for (const re of pats) { let m; while ((m = re.exec(p))) out.push(Number(m[1])); }
  return out;
}

// r3: `\b404\b` alone matched issue "#404" in governance text (4 false fires); the HTTP form is
// required. `python3` was removed from the counters — it was matching the program that THREW
// the traceback, not a counter (26 of 41 replayed fires).
const ERROR_SIG = /^(fatal|error|ERROR|Error):|No such file or directory|Traceback \(most recent call last\)|command not found|Permission denied|HTTP\S*\s+404\b|\b404 Not Found\b|\bNot Found\b|Cannot GET|ECONNREFUSED|ETIMEDOUT|Connection refused|does not exist in|Could not resolve host|unknown revision or path/m;
// A real counter as the LAST stage of the (single) pipeline — the number is then that count.
const COUNTER_LAST = /(?:^|\|)\s*(wc\b|grep\s+(?:-[a-zA-Z]*)?c\b[^|]*|uniq\s+-c\b|jq\s+(?:-r\s+)?'?\.?(?:length|\|\s*length)'?)[^|]*$/;
const BATCH_ID = /\b(B-[A-Z0-9][A-Z0-9-]*[A-Z0-9]|P\d+-B[0-9][0-9A-Za-z.]*)\b/;
const STOP_WORDS = new Set(['B', 'P', 'SCOPE', 'PRE', 'AUDIT', 'PLAN', 'REPORT', 'COMPLETION', 'LEG', 'LEG1', 'LEG2', 'LEG3', 'RESULT', 'ENUMERATION', 'MD', 'R1', 'R2', 'R3', 'R4', 'R5', 'SUB', 'BATCH', 'PROGRESS']);

function words(id) {
  return new Set(id.toUpperCase().split(/[-_.\s]+/).filter((w) => w && !STOP_WORDS.has(w) && !/^\d+[A-Z]?$/.test(w)));
}

function pathIdWords(p) {
  const m = /([A-Za-z0-9_.-]*?)((?:B_[A-Z0-9][A-Z0-9_]*)|(?:P\d+_B[0-9][0-9A-Za-z._]*))\.md\b/.exec(p);
  return m ? words(m[2]) : null;
}

function shapes(cmd, stdout) {
  const hits = [];
  const ec = elide(cmd);
  const pipe = singlePipeline(ec);
  const outLines = stdout.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const nLines = stdout.trim() === '' ? 0 : outLines.length;

  if (pipe) {
    for (const cap of caps(pipe)) {
      if (cap >= CAP_FLOOR && nLines === cap) {
        hits.push(['cap-bound', `the output is EXACTLY ${cap} lines and the command capped at ${cap}. The cap MAY have done the filtering — the count is not evidence either way, so this is not yet the population. If it becomes a count, a share or an absence, re-run it unbounded first.`]);
        break;
      }
    }
  }

  // r3: SINGLE PIPELINE ONLY, counter LAST. The r2 leg fired 60 times in the replay, 0 of them
  // on a single pipeline: every trailing integer was a value (a max issue number, a file mode)
  // or a count from a LATER stage — error-anywhere + integer-anywhere. That is a value leg.
  const lastOut = nLines ? outLines[nLines - 1].trim() : '';
  const sig = ERROR_SIG.exec(stdout);
  if (pipe && sig && /^\d+$/.test(lastOut) && COUNTER_LAST.test(pipe)) {
    hits.push(['error-counted', `the output carries "${sig[0]}" and still ends in the bare number ${lastOut} — an error was printed and a count was produced anyway. That number describes the failure, not the object.`]);
  }

  const asksApi = /\b(curl|wget|Invoke-WebRequest|iwr)\b/.test(ec) && (/\/api\//.test(ec) || /\|\s*jq\b/.test(ec) || /application\/json/.test(ec));
  const head = stdout.slice(0, 512).trimStart();
  if (asksApi && (/^<!DOCTYPE\s+html/i.test(head) || /^<html\b/i.test(head) || /<title>/i.test(head))) {
    hits.push(['html-not-json', 'the command asked an API for data and the body is HTML — a login page, a redirect or an error page was returned, not the data. Nothing parsed from it is about the object.']);
  }

  if (pipe) {
    const wanted = pathIdWords(pipe);
    if (wanted && wanted.size) {
      const h1 = /^#\s+(.+)$/m.exec(outLines.slice(0, H1_LINES).join('\n'));
      const got = h1 && BATCH_ID.exec(h1[1]);
      if (got) {
        const gw = words(got[1]);
        const shared = [...gw].some((w) => wanted.has(w));
        if (gw.size && !shared) {
          hits.push(['other-document', `the path asked for a ${[...wanted].join('-')} file and the document's H1 names ${got[1]} — no word in common: a different batch's file answered (HTTP 200 does not make it the right file).`]);
        }
      }
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
  // stderr is merged into stdout on the wire (measured); if a future harness ever separates
  // them, an error on stderr must not vanish — so the two are joined here, stderr first.
  // r3, reader-found: every one of the 4,359 real notices begins with a NEWLINE ("\nShell cwd was
  // reset to …"), so r2's `^Shell cwd` matched 0 of them and the notice was joined as two lines —
  // 85 spurious cap-bound fires (cap−2 outputs) and 241 silenced exact-cap results. The notice
  // is stripped WHEREVER it sits and the remainder joined only if anything is left.
  const rawErr = typeof resp.stderr === 'string' ? resp.stderr : '';
  const errRest = rawErr.replace(/^\s*Shell cwd was reset[^\n]*\n?/gm, '').trim();
  let stdout = (errRest ? errRest + '\n' : '') + (typeof resp.stdout === 'string' ? resp.stdout : '');
  if (stdout.length > 2 * WINDOW) stdout = stdout.slice(0, WINDOW) + '\n' + stdout.slice(-WINDOW);

  const hits = shapes(cmd, stdout);
  note({ decided: true, fired: hits.length > 0, legs: hits.map((h) => h[0]), out_lines: stdout ? stdout.split('\n').length : 0 });
  if (!hits.length) return;
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          'RESULT-SHAPE WARNING (rule 29 — warn-only, after the fact; this hook cannot speak for what it does not list):\n' +
          hits.map(([leg, why]) => `• ${leg}: ${why}`).join('\n') +
          '\nIf this result is about to become a claim, it may not have answered the request as asked — re-run against the object.',
      },
    }));
  } catch { /* fail-open */ }
}

try { main(); } catch (e) { try { note({ decided: false, reason: 'main_threw', error: String(e && e.message) }); } catch { /* */ } }
process.exit(0);
