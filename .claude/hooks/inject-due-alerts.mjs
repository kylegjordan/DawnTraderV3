#!/usr/bin/env node
// OBJ-1 stage 2 — B-MEASURE-GATE leg 2 (#623). §10.5's per-turn alert check, converted from a
// rule every session must remember into a `UserPromptSubmit` hook that injects the due alerts.
//
// BUILT AGAINST THE OBSERVED SHAPE, not the documented one: stage 1 (observe-userpromptsubmit.mjs)
// recorded the live payload from three sessions on 2026-09-02 — keys session_id, transcript_path,
// cwd, scratchpad_dir, prompt_id, permission_mode, hook_event_name, prompt, session_title. No
// tool_input. That is the standing rule for any new event surface, applied.
//
// ⛔⛔ LANGSTON'S HARD REQUIREMENT, VERBATIM: "Must fail-open with a hard timeout — an SSH to
// Frankfurt on every turn is a new wedge surface." ⇒ TIMEOUT ≤3s, EXIT 0 ON ANY FAILURE, NEVER
// BLOCKS THE TURN. The timeout is enforced TWICE: `ssh -o ConnectTimeout` for the connect, and
// spawnSync's own timeout for the whole child, which KILLS it. Belt and braces, because the
// whole point is that nothing on this path can hang a session.
//
// ⛔⛔ THE DESIGN DECISION THAT MATTERS: A FAILED CHECK IS INJECTED AS A VISIBLE FAILURE, NEVER AS
// SILENCE. If this hook cannot reach staging and injects nothing, the session sees "no alerts" —
// which is EXACTLY the fail-open lookalike in the enforcement layer this batch exists to kill.
// So an unreachable staging injects one line saying so and telling the session to do the check
// by hand. "No alerts" and "could not check" are different facts and they stay different.
//
// ⛔ AND IT READS THE WHOLE FILE, FILTERED — NEVER A TAIL. #980, measured 2026-09-01: the mandated
// `tail -50` form saw 4 of 11 due alerts, because the file is append-ordered by mint time while
// due-ness is `triggers_at`, so the OLDEST due items are the ones a tail is most likely to miss.
// The filter runs ON STAGING (python3 there), so only the due rows cross the wire.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HOST = process.env.DT_ALERT_HOST || 'root@188.245.193.8';
const TIMEOUT_MS = 3000;

let SINK = null, SELF = null;
try {
  SINK = join(homedir(), '.claude', 'inject-due-alerts.jsonl');
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

function emit(text) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text },
    }));
  } catch { /* fail-open */ }
}

// Runs ON STAGING. Emits one line per due+active+unacked alert, then a COUNT line — the count is
// the positive control: a run that returns zero alert lines AND the count line is "no alerts";
// a run that returns nothing at all is "the filter did not run", and they must not be confused.
const REMOTE = [
  "import json,datetime",
  "now=datetime.datetime.now(datetime.timezone.utc); last={}",
  "for l in open('/var/log/dawntrader/system-alerts.jsonl'):",
  "    l=l.strip()",
  "    if not l: continue",
  "    try: a=json.loads(l)",
  "    except Exception: continue",
  "    last[a.get('id')]=a",
  "n=0",
  "for a in last.values():",
  "    if a.get('state')!='active' or a.get('acknowledged_at'): continue",
  "    t=a.get('triggers_at') or a.get('fired_at')",
  "    try:",
  "        if datetime.datetime.fromisoformat(str(t).replace('Z','+00:00'))>now: continue",
  "    except Exception: pass",
  "    n+=1",
  // r2, reader-found: a TITLE containing a newline forged ALERT lines and a fake COUNT on the
  // wire, defeating the positive control with file content. The remote now strips \r\n and the
  // field separator from every emitted string, so one file row can only ever be one wire line.
  "    def clean(s): return str(s or '').replace(chr(13),' ').replace(chr(10),' ').replace('|','/')[:110]",
  // The FULL id crosses the wire (Langston, Step 4): the CLI's ack/resolve no-op on a prefix —
  // "Alert <id> not found", exit 1 — so a line carrying only 8 chars cannot be acted on.
  "    print('ALERT|%s|%s|%s' % (clean(a.get('id')), clean(a.get('severity')), clean(a.get('title'))))",
  "print('COUNT|%d|%d' % (n, len(last)))",
].join('\n');
// Injected-count bound. The file holds ~770 ids and grows; a runaway queue must not become a
// runaway context injection. Everything past this is summarised as a count, never dropped silently.
const MAX_INJECT = 25;

function main() {
  const t0 = Date.now();
  let r;
  try {
    // The script travels on STDIN (`python3 -`), never as an argument. ssh joins argv with
    // spaces and the remote shell re-parses it, so a multi-line script passed via `-c` arrived
    // mangled and python exited 2 — the live path failed on first test while the unreachable
    // path passed. stdin needs no quoting at all, on either side.
    // StrictHostKeyChecking=yes, not accept-new — reader-found: the host is env-overridable, and
    // accept-new would TOFU-accept a stranger AND write ~/.ssh/known_hosts, which is not this
    // hook's sink. Staging has been in known_hosts for months; an unknown key now FAILS VISIBLY.
    r = spawnSync('ssh', [
      '-o', 'ConnectTimeout=3', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
      HOST, 'python3', '-',
    ], { encoding: 'utf8', input: REMOTE, timeout: TIMEOUT_MS, windowsHide: true });
  } catch (e) {
    r = { error: e };
  }
  const ms = Date.now() - t0;

  const failed = !r || r.error || r.status !== 0 || typeof r.stdout !== 'string';
  const lines = failed ? [] : r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  // The LAST count line: it is printed after every ALERT line, so a truncated stream cannot have
  // it, and (belt) a forged early one could not stand in for it.
  const countLine = [...lines].reverse().find((l) => l.startsWith('COUNT|'));
  const alerts = lines.filter((l) => l.startsWith('ALERT|'));

  if (failed || !countLine) {
    // ⛔ VISIBLE FAILURE. This is the branch that must never be silent.
    const why = r && r.error ? (r.error.code === 'ETIMEDOUT' || /ETIMEDOUT|timed out/i.test(String(r.error.message)) ? 'timeout' : String(r.error.code || r.error.message))
      : r && r.status !== 0 ? `ssh exit ${r.status}` : 'no COUNT line from the remote filter';
    note({ decided: false, reason: 'unreachable', why, ms });
    emit(`⚠️ ALERT CHECK COULD NOT RUN (${why}, ${ms}ms). This is NOT "no alerts" — it is "not checked". ` +
         `Do the §10.5 check by hand this turn: read the WHOLE alerts file filtered for active+unacked+due, never a tail (#980).`);
    return;
  }

  const [, due, total] = countLine.split('|');
  note({ decided: true, due: Number(due), total_ids: Number(total), ms });
  if (!alerts.length) return; // genuine "no alerts" — the COUNT line proves the filter ran.

  const shown = alerts.slice(0, MAX_INJECT);
  const body = shown.map((l) => {
    const [, id, sev, ...rest] = l.split('|');
    return `• ${id.slice(0, 8)}… [${sev}] ${rest.join('|')}  (full id: ${id})`;
  }).join('\n');
  const more = alerts.length > MAX_INJECT ? `\n… +${alerts.length - MAX_INJECT} more due alerts NOT shown (cap ${MAX_INJECT}) — read the file.` : '';
  emit(`§10.5 DUE ALERTS — ${due} active, unacknowledged, due now (whole file, ${total} ids; ${ms}ms):\n${body}${more}\n` +
       `Surface each in plain language; ack only what you own; resolve only when fixed — with the FULL id: the CLI no-ops on a prefix.`);
}

try { main(); } catch (e) {
  try { note({ decided: false, reason: 'main_threw', error: String(e && e.message) }); } catch { /* */ }
  emit('⚠️ ALERT CHECK HOOK THREW — not "no alerts". Do the §10.5 check by hand this turn.');
}
process.exit(0);
