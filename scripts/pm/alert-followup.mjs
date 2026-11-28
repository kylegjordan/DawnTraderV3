#!/usr/bin/env node
// B-TOKEN-ECONOMY amendment 1, P8 (OBJ-14, KD-108(d)) — PM Claude's quiet hourly alert follow-up.
//
// Kyle, KD-108(d): PM checks alerts quietly on its hourly wake and speaks only for urgent follow-up — first
// whether the owner RECEIVED the alert, then whether the owner is ACTING. This replaces PM's per-prompt alert
// list (P7). Rule and repeat limit: B_TOKEN_ECONOMY_AMENDMENT_1_PRE_AUDIT.md §A7.
//
//   received = the owner's own wake-filter record (~/.claude/cc-wake-state/<ALIAS>.alert-owners.json) holds the id
//              with that owner
//   acting   = an ack/resolve (such a row is no longer due, so it never reaches this script), or, in the last 24 h,
//              a Discord post by the owner that cites the 8-character id prefix, or a commit on the review branch
//              that cites it
//   qualifies = every critical alert; any alert due for more than 24 h with no recorded action, unless its latest
//              marker says it waits on an event ("never ack", "held to … window", "keep the emit")
//   not here  = the governance open-batch classes (gov-openmaxage, gov-staleopen): the PM crew check carries them
//   repeat    = one follow-up per alert per 24 h, read from and written to 1-system-manual/pm/SESSION_LOG.md
//
// OUTPUT: always one COUNT line (the positive control: COUNT|<due>|<ids in file>|<follow-ups>), then one FOLLOWUP
// line per follow-up. A run that cannot read the due list prints CHECK FAILED and exits 2 — never silence, never
// "nothing due". `--record` appends one SESSION_LOG row per follow-up printed. `--self-test` runs the seeded cases.
//
// CANNOT SEE: posts older than the inbox window read (the last 8 MB, about a week) or made outside Discord; a commit
// not on origin/migration/aws-supabase; which session made a commit (any commit citing the prefix counts as acting);
// an owner who acts without citing the id. Each of these can produce a follow-up that was not needed, never a missed
// critical alert: the error runs toward speaking.
import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const VERSION = 'alert-followup 1.0 (B-TOKEN-ECONOMY amd-1 P8)';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOG = join(REPO, '1-system-manual', 'pm', 'SESSION_LOG.md');
const STAGING = process.env.DT_ALERT_HOST || 'root@188.245.193.8';
const HELSINKI = 'root@204.168.141.77';
const STATE_DIR = process.env.CC_WAKE_STATE_DIR || join(homedir(), '.claude', 'cc-wake-state');
const PM_ALIAS = 'CC-PM';
const SENDER_TO_ALIAS = {
  'OLD Claude': 'CC-A',
  'NEW Claude': 'CC-B',
  'ANALYST Claude': 'CC-C',
  'Infra Claude': 'CC-INFRA',
  'PM Claude': PM_ALIAS,
};
const SESSIONS = Object.values(SENDER_TO_ALIAS);
const DAY = 86400000;
const GOV = /^gov-(openmaxage|staleopen)/;
export const EVENT_WAIT = /never ack|held (to|until)\b|keep the emit|event[- ]wait|wait(s|ing)? (on|for) (the |an? )?(event|market|window|session)/i;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Runs ON STAGING (script on stdin). The whole file, filtered — never a tail (#980). Same filter as the per-prompt
// hook, plus the due time and the dedupe key, which the follow-up rule needs. The governance checker nests its key
// under metadata (no top-level dedupe_key on its rows), so the key is read from either place.
const REMOTE_ALERTS = [
  'import json,datetime',
  'now=datetime.datetime.now(datetime.timezone.utc); last={}',
  "for l in open('/var/log/dawntrader/system-alerts.jsonl'):",
  '    l=l.strip()',
  '    if not l: continue',
  '    try: a=json.loads(l)',
  '    except Exception: continue',
  "    last[a.get('id')]=a",
  'n=0',
  "def clean(s): return str(s or '').replace(chr(13),' ').replace(chr(10),' ').replace('|','/')[:110]",
  'for a in last.values():',
  "    if a.get('state')!='active' or a.get('acknowledged_at'): continue",
  "    t=a.get('triggers_at') or a.get('fired_at')",
  '    try:',
  "        if datetime.datetime.fromisoformat(str(t).replace('Z','+00:00'))>now: continue",
  '    except Exception: pass',
  '    n+=1',
  "    print('ALERT|%s|%s|%s|%s|%s' % (clean(a.get('id')), clean(a.get('severity')), clean(t), clean(a.get('dedupe_key') or (a.get('metadata') or {}).get('dedupe_key')), clean(a.get('title'))))",
  "print('COUNT|%d|%d' % (n, len(last)))",
].join('\n');

// Runs ON HELSINKI (script on stdin, due ids as argv). Bounded to the inbox's last 8 MB. Returns the latest
// [[ALERT id=… owner=…]] marker per id and the session posts of the last 24 h that cite an id prefix.
const REMOTE_INBOX = [
  'import json,re,sys,os,datetime',
  "ids=sys.argv[1:]; p='/var/log/cc-discord-inbox.jsonl'; sz=os.path.getsize(p); f=open(p,'rb')",
  'f.seek(max(0,sz-8*1024*1024)); data=f.read().decode("utf-8","replace").splitlines()',
  "cut=datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(hours=24)",
  "mk=re.compile(r'\\[\\[ALERT id=([0-9a-f-]{36}) owner=([A-Za-z-]+)(?: action=\"([^\"]*))?')",
  'markers={}; posts=[]',
  'for l in data:',
  '    try: d=json.loads(l)',
  '    except Exception: continue',
  "    t=d.get('text') or ''; ts=d.get('ts') or ''",
  '    for m in mk.finditer(t):',
  "        if m.group(1) in ids: markers[m.group(1)]={'owner':m.group(2),'action':m.group(3) or '','ts':ts}",
  "    if d.get('kind')=='cc_outbound':",
  '        try: recent=datetime.datetime.fromisoformat(ts.replace("Z","+00:00"))>=cut',
  '        except Exception: recent=False',
  '        if recent:',
  '            for i in ids:',
  "                if i[:8] in t: posts.append({'id':i,'sender':d.get('sender'),'ts':ts})",
  "print(json.dumps({'markers':markers,'posts':posts,'window_bytes':min(sz,8*1024*1024)}))",
].join('\n');

function ssh(host, input, args = []) {
  return spawnSync('ssh', ['-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', host, 'python3', '-', ...args],
    { encoding: 'utf8', input, timeout: 60000, windowsHide: true });
}

export function parseAlerts(stdout) {
  const lines = String(stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const count = [...lines].reverse().find((l) => l.startsWith('COUNT|'));
  if (!count) return null;
  const [, due, total] = count.split('|');
  const alerts = lines.filter((l) => l.startsWith('ALERT|')).map((l) => {
    const [, id, sev, dueAt, key, ...rest] = l.split('|');
    return { id, sev, dueAt, key, title: rest.join('|') };
  });
  return { due: Number(due), total: Number(total), alerts };
}

// The repeat limit: ids (8-char) followed up in the last 24 h, from SESSION_LOG rows written by --record.
export function recentFollowups(logText, now) {
  const out = new Set();
  for (const l of String(logText || '').split(/\r?\n/)) {
    const m = l.match(/^\| (\d{4}-\d\d-\d\dT[\d:]+Z) \| PM Claude \| [^|]+ \| alert-followup ([0-9a-f]{8}) /);
    if (m && now - Date.parse(m[1]) < DAY) out.add(m[2]);
  }
  return out;
}

// The pure rule (A7). records: { alias: {id: {owner, ts}} }. markers: {id: {owner, action, ts}}. posts: [{id, sender}].
export function decide({ alerts, records, markers, posts, commitText, recent, now }) {
  const follow = [];
  for (const a of alerts) {
    if (GOV.test(a.key || '')) continue;
    const critical = a.sev === 'critical';
    const dueMs = Date.parse(a.dueAt);
    const stale = Number.isFinite(dueMs) ? now - dueMs > DAY : true;   // an unreadable due time is treated as stale
    if (!critical && !stale) continue;
    const mk = markers[a.id];
    if (!critical && mk && EVENT_WAIT.test(mk.action || '')) continue;
    let owner = mk ? mk.owner : null;
    if (!owner) {
      let best = null;
      for (const al of SESSIONS) { const r = records[al] && records[al][a.id]; if (r && (!best || String(r.ts) > String(best.ts))) best = r; }
      owner = best ? best.owner : null;
    }
    const isSession = SESSIONS.includes(owner);
    const received = isSession && !!(records[owner] && records[owner][a.id] && records[owner][a.id].owner === owner);
    const acting = isSession && (posts.some((p) => p.id === a.id && SENDER_TO_ALIAS[p.sender] === owner) || String(commitText || '').includes(a.id.slice(0, 8)));
    if (received && acting) continue;
    if (recent.has(a.id.slice(0, 8))) continue;
    const ask = !owner ? 'unrouted' : !isSession ? 'owner-not-a-session' : !received ? 'received' : 'acting';
    follow.push({ id: a.id, owner: owner || 'none', ask, why: critical ? 'critical' : 'due over 24 h', title: a.title });
  }
  return follow;
}

const ASK_TEXT = {
  unrouted: 'no owner on record — ask Langston to route it',
  'owner-not-a-session': 'owner is not a building session — PM triages it (an ask to Kyle goes to Kyle)',
  received: 'owner has no record of it — ask the owner whether they received it',
  acting: 'owner received it but nothing cites it in 24 h — ask the owner what they are doing about it',
};

function readRecords() {
  const out = {}, why = [];
  for (const al of SESSIONS) {
    try { out[al] = JSON.parse(readFileSync(join(STATE_DIR, `${al}.alert-owners.json`), 'utf8')); }
    catch (e) { out[al] = {}; why.push(`${al} record ${e && e.code === 'ENOENT' ? 'missing' : 'unreadable'}`); }
  }
  return { records: out, why };
}

function run(record) {
  const r = ssh(STAGING, REMOTE_ALERTS);
  const parsed = !r.error && r.status === 0 ? parseAlerts(r.stdout) : null;
  if (!parsed) {
    console.log(`CHECK FAILED — the due-alert list could not be read (${r.error ? r.error.code || r.error.message : `ssh exit ${r.status}`}${r.stderr ? `: ${String(r.stderr).trim().slice(0, 200)}` : ''}). This is NOT "nothing due". Run scripts/due-alerts.py by hand.`);
    process.exit(2);
  }
  const notes = [];
  let markers = {}, posts = [];
  const ids = parsed.alerts.map((a) => a.id).filter((i) => ID.test(i));
  if (ids.length) {
    const h = ssh(HELSINKI, REMOTE_INBOX, ids);
    try { ({ markers, posts } = JSON.parse(h.stdout)); } catch { notes.push('inbox unreadable: markers and posts not used (every stale alert reads as not acting)'); }
  }
  const { records, why } = readRecords();
  notes.push(...why);
  let commitText = '';
  const g = spawnSync('git', ['-C', REPO, 'log', 'origin/migration/aws-supabase', '--since=24 hours ago', '--format=%B'], { encoding: 'utf8', windowsHide: true });
  if (g.status === 0) commitText = g.stdout; else notes.push('git log unreadable: commits not used');
  const now = Date.now();
  const recent = recentFollowups(existsSync(LOG) ? readFileSync(LOG, 'utf8') : '', now);
  const follow = decide({ alerts: parsed.alerts, records, markers, posts, commitText, recent, now });
  console.log(`COUNT|${parsed.due}|${parsed.total}|${follow.length}${notes.length ? `|${notes.join('; ')}` : ''}`);
  const stamp = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z');
  for (const f of follow) {
    const isPM = f.owner === PM_ALIAS;
    const ask = isPM ? `PM owns this alert — check ${f.ask === 'received' ? 'receipt' : 'action'} directly` : ASK_TEXT[f.ask];
    console.log(`FOLLOWUP|${f.owner}|${f.id}|${f.why}|${ask}|${f.title}`);
    if (record) {
      const cell = (s) => String(s).replace(/\|/g, '/');
      const next = isPM ? 'PM checks its own receipt or action' : 'message the owner: received first, acting second';
      appendFileSync(LOG, `| ${stamp} | PM Claude | ${cell(f.owner)} | alert-followup ${f.id.slice(0, 8)} | ${cell(f.title)} | ${f.why}; ask: ${f.ask} | ${next} | ${VERSION}; full id ${f.id} |\r\n`, 'utf8');
    }
  }
}

function selfTest() {
  let pass = 0, fail = 0;
  const t = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); ok ? pass++ : fail++; };
  const now = Date.parse('2026-11-21T12:00:00Z');
  const id = 'aaaaaaaa-1111-2222-3333-444444444444';
  const old = '2026-11-19T12:00:00Z', fresh = '2026-11-21T11:00:00Z';
  const base = { records: { 'CC-A': {}, 'CC-B': {}, 'CC-C': {}, 'CC-INFRA': {} }, markers: {}, posts: [], commitText: '', recent: new Set(), now };
  const stale = { id, sev: 'warning', dueAt: old, key: 'x', title: 'seeded stale alert' };
  const rec = { ...base.records, 'CC-C': { [id]: { owner: 'CC-C', ts: old } } };

  let f = decide({ ...base, alerts: [stale], records: rec });
  t('a seeded stale alert, received, nobody acting: exactly one follow-up, to its owner, asking about action', f.length === 1 && f[0].owner === 'CC-C' && f[0].ask === 'acting');
  const logRow = `| 2026-11-21T12:00:00Z | PM Claude | CC-C | alert-followup ${id.slice(0, 8)} | seeded | due over 24 h; ask: acting | x | y |`;
  f = decide({ ...base, alerts: [stale], records: rec, now: now + 3600000, recent: recentFollowups(logRow, now + 3600000) });
  t('the same alert an hour later: no follow-up (repeat limit read from SESSION_LOG)', f.length === 0);
  f = decide({ ...base, alerts: [stale], records: rec, now: now + DAY + 60000, recent: recentFollowups(logRow, now + DAY + 60000) });
  t('after 24 h the repeat limit lapses: one follow-up again', f.length === 1);
  t('a run with nothing due: no follow-up', decide({ ...base, alerts: [] }).length === 0);
  f = decide({ ...base, alerts: [stale], markers: { [id]: { owner: 'CC-C', action: '' } } });
  t('a marker owner with no record of the id: ask whether received', f.length === 1 && f[0].ask === 'received');
  t('received and acting (owner post cites the prefix): no follow-up',
    decide({ ...base, alerts: [stale], records: rec, posts: [{ id, sender: 'ANALYST Claude' }] }).length === 0);
  t('a post by ANOTHER session does not count as the owner acting',
    decide({ ...base, alerts: [stale], records: rec, posts: [{ id, sender: 'NEW Claude' }] }).length === 1);
  const pmRecords = { ...base.records, 'CC-PM': { [id]: { owner: 'CC-PM', ts: old } } };
  const pmMarker = { [id]: { owner: 'CC-PM', action: '' } };
  f = decide({ ...base, alerts: [stale], markers: pmMarker });
  t('a PM-owned marker without a wake record stays routed to PM and needs receipt checked',
    f.length === 1 && f[0].owner === 'CC-PM' && f[0].ask === 'received');
  f = decide({ ...base, alerts: [stale], records: pmRecords, posts: [{ id, sender: 'NEW Claude' }] });
  t('the PM wake record supplies the owner without a marker, and a builder post does not count as PM action',
    f.length === 1 && f[0].owner === 'CC-PM' && f[0].ask === 'acting');
  t('a PM Claude post plus its wake record suppresses repeat follow-up on that alert',
    decide({ ...base, alerts: [stale], records: pmRecords, posts: [{ id, sender: 'PM Claude' }] }).length === 0);
  t('a critical PM-owned marker still calls for follow-up when receipt is missing',
    (() => {
      const follow = decide({ ...base, alerts: [{ ...stale, sev: 'critical', dueAt: fresh }], markers: pmMarker });
      return follow.length === 1 && follow[0].owner === 'CC-PM' && follow[0].ask === 'received';
    })());
  t('a commit citing the prefix counts as acting', decide({ ...base, alerts: [stale], records: rec, commitText: `fix ${id.slice(0, 8)} done` }).length === 0);
  t('a fresh (under 24 h) warning: no follow-up', decide({ ...base, alerts: [{ ...stale, dueAt: fresh }], records: rec }).length === 0);
  t('a fresh critical alert with no owner: one follow-up, unrouted', (() => { const r = decide({ ...base, alerts: [{ ...stale, sev: 'critical', dueAt: fresh }] }); return r.length === 1 && r[0].ask === 'unrouted' && r[0].why === 'critical'; })());
  t('an event-wait marker ("never ack") exempts a stale warning',
    decide({ ...base, alerts: [stale], records: rec, markers: { [id]: { owner: 'CC-C', action: 'resolve on a measured fire, never ack' } } }).length === 0);
  t('an event-wait marker does NOT exempt a critical alert',
    decide({ ...base, alerts: [{ ...stale, sev: 'critical' }], records: rec, markers: { [id]: { owner: 'CC-C', action: 'never ack' } } }).length === 1);
  t('the governance open-batch classes stay with the crew check', decide({ ...base, alerts: [{ ...stale, key: 'gov-openmaxage:B-X' }], records: rec }).length === 0);
  t('an unreadable due time reads as stale (speaks rather than stays silent)', decide({ ...base, alerts: [{ ...stale, dueAt: 'None' }], records: rec }).length === 1);
  t('parseAlerts: no COUNT line is a failed read, never "nothing due"', parseAlerts('ALERT|a|b|c|d|e\n') === null);
  const p = parseAlerts(`ALERT|${id}|warning|${old}|k|t|with pipe\nCOUNT|1|9\n`);
  t('parseAlerts: fields and COUNT read', p && p.due === 1 && p.total === 9 && p.alerts[0].key === 'k' && p.alerts[0].title === 't|with pipe');
  t('the repeat-limit reader ignores rows older than 24 h', recentFollowups(logRow, now + DAY + 1).size === 0);
  console.log(`${pass}/${pass + fail} PASS`);
  process.exit(fail ? 1 : 0);
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();
else if (args.includes('--version')) console.log(VERSION);
else run(args.includes('--record'));
