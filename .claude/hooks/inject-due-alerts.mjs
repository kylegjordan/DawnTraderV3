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
import { appendFileSync, readFileSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { splitAlerts, capBuckets, lostRoutings, lostReport, CLONE_TO_ALIAS, CHURN_HOURS } from './alert-split.mjs';

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
const LOST_TAIL_BYTES = 64 * 1024;   // #1142 (Langston C5): the lost-routing record is read from its tail only

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

  // Langston Step-4 r2 CONDITION 1: the owner record and the lost-routing read are LOCAL and independent of both the
  // alert count and staging, so they run BEFORE every emit. "No alerts", "not checked" and "a routing was lost" are
  // three facts: a lost FLIP leaves the old owner on record, so a quiet or unreachable window must not swallow it.
  // B-TOKEN-BURN-CUT amendment 1, OBJ-6 (Kyle 2026-09-30): a session is shown ITS OWN due alerts, the not-yet-routed
  // ones and any critical one — the rest is a count. The owner record is written by this session's wake filter.
  // FAIL-OPEN: an unmapped clone or an unreadable owner record shows the full list, exactly as before.
  const alias = CLONE_TO_ALIAS[basename(process.env.CLAUDE_PROJECT_DIR || '')] || null;
  let owners = null, readWhy = null;
  if (alias) {
    try {
      const dir = process.env.CC_WAKE_STATE_DIR || join(homedir(), '.claude', 'cc-wake-state'); // env: tests only
      owners = JSON.parse(readFileSync(join(dir, `${alias}.alert-owners.json`), 'utf8'));
    } catch (e) {
      owners = null;
      // (a) (Langston): a missing record is the normal state before the seed, not a fault — say so.
      readWhy = e && e.code === 'ENOENT' ? 'owner record not seeded yet' : `owner record unreadable (${e && e.code || 'parse error'})`;
    }
  }
  // B-WAKE-OWNER-LOSS-VISIBLE (#1142): routings THIS session's wake filter failed to save. Its OWN try/catch — a
  // failure here drops only this line of output and never touches narrowing (Langston C6). The read is BOUNDED to the
  // file's last 64 KB (C5): the condition that makes a save fail can append on every marker line until it clears.
  let lost = null, lostWhy = null;
  // Langston Step-4 BLOCKER-1: gated on the alias ONLY. An unreadable owner record is exactly the load failure the filter
  // now records, and it is also what makes `narrowed` false — gating on `narrowed` hid the loss in its own case.
  if (alias) {
    let fd = null;
    try {
      const dir = process.env.CC_WAKE_STATE_DIR || join(homedir(), '.claude', 'cc-wake-state'); // env: tests only
      fd = openSync(join(dir, `${alias}.alert-owners.lost.jsonl`), 'r');
      const size = fstatSync(fd).size, want = Math.min(size, LOST_TAIL_BYTES), buf = Buffer.alloc(want);
      readSync(fd, buf, 0, want, size - want);
      lost = lostRoutings(buf.toString('utf8').split(/\r?\n/), owners, Date.now(), size > want);
    } catch (e) {
      if (!(e && e.code === 'ENOENT')) lostWhy = `the lost-routing record could not be read (${e && e.code || 'error'})`;
    } finally {
      if (fd !== null) { try { closeSync(fd); } catch { /* nothing to do */ } }
    }
  }
  const lostText = lostReport(lost, lostWhy);   // '' when there is nothing to say

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
         `Do the §10.5 check by hand this turn: read the WHOLE alerts file filtered for active+unacked+due, never a tail (#980).` + (lostText ? `\n${lostText}` : ''));
    return;
  }

  const [, due, total] = countLine.split('|');
  note({ decided: true, due: Number(due), total_ids: Number(total), ms });
  // Genuine "no alerts" — the COUNT line proves the filter ran. It is SAID, not left silent
  // (B-GOV-REPORTING r6): §10.5 treats hook silence as "did not run", so zero must be visible.
  if (!alerts.length) {
    emit(`§10.5: 0 due alerts (whole file, ${total} ids; ${ms}ms) — the filter ran.` + (lostText ? `\n${lostText}` : ''));
    return;
  }

  const parsed = alerts.map((l) => { const [, id, sev, ...rest] = l.split('|'); return { id, sev, title: rest.join('|') }; });
  const line = (a) => `• ${a.id.slice(0, 8)}… [${a.sev}] ${a.title}  (full id: ${a.id})`;
  const cap = (list) => {
    const shown = list.slice(0, MAX_INJECT).map(line).join('\n');
    return list.length > MAX_INJECT ? `${shown}\n… +${list.length - MAX_INJECT} more NOT shown (cap ${MAX_INJECT}) — read the file.` : shown;
  };
  const CLOSE = 'ack only what you own; resolve only when fixed — with the FULL id: the CLI no-ops on a prefix.';

  const s = splitAlerts(parsed, owners, alias);
  if (!s.narrowed) {
    const why = readWhy || s.why;
    note({ decided: true, due: Number(due), total_ids: Number(total), ms, narrowed: false, why });
    emit(`§10.5 DUE ALERTS — ${due} active, unacknowledged, due now (whole file, ${total} ids; ${ms}ms; full list — ${why}):\n${cap(parsed)}\n` +
         `Surface each in plain language; ${CLOSE}` + (lostText ? `\n${lostText}` : ''));
    return;
  }
  note({ decided: true, due: Number(due), total_ids: Number(total), ms, narrowed: true, alias,
    mine: s.mine.length, unrouted: s.unrouted.length, critical: s.critical.length, others: s.others });
  // One cap, priority order critical → unrouted → yours (round 3 BLOCKER-2); the pure logic is capBuckets, tested.
  const c = capBuckets(s, MAX_INJECT);
  const parts = [];
  if (c.mine.length) parts.push(`YOURS:\n${c.mine.map(line).join('\n')}`);
  if (c.unrouted.length) parts.push(`NOT YET ROUTED — shown to every session until Langston routes it (or its owner has changed within ${CHURN_HOURS} h):\n${c.unrouted.map(line).join('\n')}`);
  if (c.critical.length) parts.push(`CRITICAL — shown to every session:\n${c.critical.map((a) => `• ${a.id.slice(0, 8)}… [critical] ${a.title} — owner ${a.owner}  (full id: ${a.id})`).join('\n')}`);
  if (c.cutTotal) parts.push(`… +${c.cutTotal} more NOT shown (cap ${MAX_INJECT} in total: ${Object.entries(c.cut).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}) — read the file.`);
  // Round 3 BLOCKER-3: the churn goes to the one who makes it — Langston — via CC-A, like the rejects.
  if (alias === 'CC-A' && s.churning.length) parts.push(`⚠ ${s.churning.length} due alert(s) changed owner within ${CHURN_HOURS} h, so they read as unrouted — tell Langston, leading with his name: `
    + s.churning.map((a) => `${a.id.slice(0, 8)} (now ${a.owner}, ${a.flips} changes)`).join(', '));
  // (c) (Langston): markers he wrote that could not be recorded reach someone who can tell him — ONE session, the
  // owner of this mechanism (CC-A), not all four; the last 24 h only.
  const rejects = (alias === 'CC-A' && owners._meta && Array.isArray(owners._meta.rejects))
    ? owners._meta.rejects.filter((r) => Date.now() - Date.parse(r.ts || 0) < 86400000) : [];
  if (rejects.length) parts.push(`⚠ ${rejects.length} alert marker(s) Langston wrote in the last 24 h could not be recorded (no 36-char id, or an owner outside the set) — tell him, leading with his name. Latest: ${rejects[rejects.length - 1].marker}`);
  if (lostText) parts.push(lostText);
  const rest = s.others ? `${s.others} other due alert${s.others === 1 ? ' is' : 's are'} routed to other sessions or to Kyle — not yours to raise.` : '';
  if (!parts.length) {
    emit(`§10.5 (${alias}): ${due} due alerts, none of them yours — ${rest || 'all routed elsewhere.'} (whole file, ${total} ids; ${ms}ms — the filter ran.)`);
    return;
  }
  emit(`§10.5 DUE ALERTS for ${alias} — ${due} due in total (whole file, ${total} ids; ${ms}ms):\n${parts.join('\n')}` +
       `${rest ? `\n${rest}` : ''}\nSurface these in plain language; ${CLOSE}`);
}

try { main(); } catch (e) {
  try { note({ decided: false, reason: 'main_threw', error: String(e && e.message) }); } catch { /* */ }
  emit('⚠️ ALERT CHECK HOOK THREW — not "no alerts". Do the §10.5 check by hand this turn.');
}
process.exit(0);
