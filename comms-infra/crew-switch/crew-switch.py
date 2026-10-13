#!/usr/bin/env python3
"""crew-switch — move the DawnTrader crew between Claude and Codex, and PROVE every session got the order.

B-CODEX-FAILOVER (#1192, Kyle 2026-10-13). Kyle types ONE message on Discord:  SWITCH TO CODEX  or  SWITCH TO CLAUDE.
A deterministic script — not a reviewer's judgement — then:
  1. records the crew mode and a numbered switch in ONE place, /var/lib/crew-switch/state.json (read: `status`);
  2. posts a HANDOVER ORDER to each outgoing session BY NAME (Claude watchers wake on their names) and an ON-DUTY
     notice to each incoming session;
  3. keeps a checklist: each session confirms with `crew-switch ack <id> "<its name>"`;
  4. `nag` (a 15-minute timer) re-sends to every OUTGOING session that has not confirmed and pings Kyle's phone with
     the missing names — so nothing is silently missed: Kyle always learns who did not get it.

HONEST LIMIT: nothing can wake a closed Claude window, and nothing can wake a Codex session at all — Kyle opens those.
The guarantee is CONFIRMATION + ESCALATION, never assumed delivery. Incoming sessions are tracked but never nagged
(Kyle: he may not open all of them). The switch is COMPLETE when every outgoing session has handed over.

Subcommands:  start <claude|codex> [--by kyle]   ack <id> <name>   status   nag   watch
"""
import fcntl, json, os, re, subprocess, sys, time
from datetime import datetime, timezone

STATE = '/var/lib/crew-switch/state.json'   # the ONE record of the crew mode (Langston (d): no second, unread copy)
INBOX = '/var/log/cc-discord-inbox.jsonl'
CC_SEND = '/usr/local/bin/cc-send'
SENDER = 'Crew switch'
KYLE_ENV = '/etc/dawntrader/discord-comms.env'
# Kyle 2026-10-13: Langston must ACTUALLY stop on a switch to Codex — asking him does not work (each alert and each
# mention starts a fresh invoke, so a told-to-stop Langston still answered). The only thing on this box that invokes
# him is this bridge (measured 2026-10-13: no timer or cron calls langston-call), so the switch stops AND disables
# it, and reads the state back. Switching to Claude enables and starts it again.
SYSTEMCTL = '/usr/bin/systemctl'
LANGSTON_UNIT = 'discord-langston-bridge.service'
NAG_FIRST_S = 15 * 60          # first re-send after 15 min, then hourly
NAG_EVERY_S = 60 * 60
EXPIRE_S = 24 * 60 * 60        # B2 (Langston): an unconfirmed switch stops nagging after 24 h and closes as EXPIRED

CREWS = {
    'claude': ['OLD Claude', 'NEW Claude', 'ANALYST Claude', 'Infra Claude'],
    'codex':  ['OLD Codex', 'NEW Codex', 'ANALYST Codex', 'INFRA Codex'],
}
REVIEWER = {'claude': 'Langston', 'codex': 'Coltrane'}
OTHER = {'claude': 'codex', 'codex': 'claude'}

def _aliases():
    out = {}
    for crew, names in CREWS.items():
        for n in names:
            role, kind = n.split(' ')   # every crew name is exactly TWO words; a third raises here, at import
            for k in (f'{role} {kind}', f'{kind} {role}', f'{role}-{kind}', f'{kind}-{role}'):
                out[k.lower()] = n
    return out
ALIASES = _aliases()

# A Kyle message that MENTIONS switching but is not the bare command gets a "not acted on" reply (Langston, Step 4:
# never trade a self-announcing failure for a silent one).
NEAR = re.compile(r'\bswitch\b.*\b(codex|claude)\b', re.I | re.S)
TRIGGER = re.compile(r'^\W*switch\s+(?:the\s+crew\s+)?(?:over\s+)?to\s+(codex|claude)\W*$', re.I)

def now(): return time.time()
def iso(t=None): return datetime.fromtimestamp(t or now(), timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def load():
    try:
        with open(STATE) as f: return json.load(f)
    except FileNotFoundError:
        return {'mode': 'claude', 'seq': 0, 'switch': None, 'inbox_offset': None, 'history': []}

def save(st):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    tmp = STATE + '.tmp'
    with open(tmp, 'w') as f: json.dump(st, f, indent=1)
    os.replace(tmp, STATE)

class Lock:
    def __enter__(self):
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        self.f = open(STATE + '.lock', 'w'); fcntl.flock(self.f, fcntl.LOCK_EX); return self
    def __exit__(self, *a): fcntl.flock(self.f, fcntl.LOCK_UN); self.f.close()

def post(msg, notify=False):
    cmd = [CC_SEND, '--sender', SENDER, '--message', msg] + (['--notify'] if notify else [])
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise SystemExit(f'crew-switch: post FAILED rc={r.returncode}: {r.stderr.strip()[:300]}')

def set_langston(on):
    """Stop+disable (on=False) or enable+start (on=True) Langston's bridge; return the state READ BACK, never assumed."""
    verbs = (['enable', 'start'] if on else ['stop', 'disable'])
    errs = []
    for v in verbs:
        r = subprocess.run([SYSTEMCTL, v, LANGSTON_UNIT], capture_output=True, text=True, timeout=60)
        if r.returncode != 0: errs.append(f'{v} rc={r.returncode} {r.stderr.strip()[:120]}')
    r = subprocess.run([SYSTEMCTL, 'is-active', LANGSTON_UNIT], capture_output=True, text=True, timeout=30)
    state = r.stdout.strip() or 'unknown'
    good = (state == 'active') if on else (state in ('inactive', 'failed'))
    return good, state, errs

def ack_cmd(sid):
    return f"ssh root@204.168.141.77 'crew-switch ack {sid} \"<your name>\"'"

def start(to, by='kyle'):
    to = to.lower()
    if to not in CREWS: raise SystemExit(f'crew-switch: unknown crew {to!r} (claude|codex)')
    with Lock():
        st = load()
        sw = st.get('switch')
        superseded = None
        if sw and not sw.get('complete'):
            # B2 (Langston, Step 4): a session that can never confirm (a closed window) must not deadlock the next
            # switch. Kyle's new command IS the decision: close the open one as SUPERSEDED, naming who never confirmed.
            missing = [x for x in sw['outgoing'] if x not in sw['acks']]
            sw.update(complete=True, completed=iso(), closed_as='superseded', never_confirmed=missing)
            st['history'] = (st.get('history') or [])[-20:] + [dict(sw)]
            superseded = (sw['id'], missing)
            save(st)
        if st['mode'] == to:
            post(f'Crew switch: the crew is ALREADY on {to.upper()} — nothing to do. (Kyle\'s message was read; no order sent.)')
            return
        st['seq'] += 1
        sid = f"S{st['seq']}"
        frm = st['mode']
        st['switch'] = {'id': sid, 'from': frm, 'to': to, 'by': by, 'started': iso(), 'started_t': now(),
                        'outgoing': CREWS[frm], 'incoming': CREWS[to], 'acks': {}, 'last_nag_t': None,
                        'complete': False}
        st['mode'] = to
        save(st)
    out, inc = CREWS[frm], CREWS[to]
    good, state, errs = set_langston(on=(to == 'claude'))
    want = 'ON' if to == 'claude' else 'OFF'
    if good:
        post(f"Crew switch {sid}: Langston is {want} (his Discord bridge reads `{state}`).")
    else:
        post(f"Kyle — crew switch {sid}: Langston should be {want} but his bridge reads `{state}`"
             f"{' (' + '; '.join(errs) + ')' if errs else ''}. Check `{LANGSTON_UNIT}` on the Helsinki box.", notify=True)
    if superseded:
        post(f"Crew switch {superseded[0]} closed as SUPERSEDED by {sid}; never confirmed: "
             f"{', '.join(superseded[1]) or 'nobody'}.")
    post(f"{' / '.join(out)} — CREW SWITCH {sid}: Kyle is moving the crew from {frm.upper()} to {to.upper()}. "
         f"You are OUTGOING. Now: bring your work to a step boundary, push everything (git fetch, pull, push; the sync "
         f"gate reads 0 behind / 0 ahead), write your POSITION block in your MEMORY_CC_<X>.md (both copies) so your "
         f"{to.title()} counterpart resumes from it, then CONFIRM: {ack_cmd(sid)}. Until you confirm you will be named "
         f"again and Kyle is told you are missing.")
    post(f"{' / '.join(inc)} / {REVIEWER[to]} — CREW SWITCH {sid}: you are ON DUTY from now ({to.upper()}). When Kyle "
         f"opens you: pull, read your POSITION block and any message addressed to you, then CONFIRM: {ack_cmd(sid)}. "
         f"{REVIEWER[to]} reviews and triages alerts for this shift.")

def ack(sid, name):
    n = ALIASES.get(name.strip().lower())
    if not n: raise SystemExit(f'crew-switch: unknown name {name!r}. Known: ' + ', '.join(sorted(set(ALIASES.values()))))
    with Lock():
        st = load(); sw = st.get('switch')
        if not sw or sw['id'] != sid:
            raise SystemExit(f"crew-switch: no open switch {sid} (current: {sw['id'] if sw else 'none'}).")
        if n not in sw['outgoing'] + sw['incoming']:
            raise SystemExit(f'crew-switch: {n} is not part of switch {sid}.')
        first = n not in sw['acks']
        sw['acks'][n] = iso()
        side = 'handed over' if n in sw['outgoing'] else 'on duty'
        out_done = [x for x in sw['outgoing'] if x in sw['acks']]
        just_completed = not sw['complete'] and len(out_done) == len(sw['outgoing'])
        if just_completed:
            sw['complete'] = True; sw['completed'] = iso()
            st['history'] = (st.get('history') or [])[-20:] + [dict(sw)]
        save(st)
    if first:
        post(f"Crew switch {sid}: {n} {side} ({len(out_done)}/{len(sw['outgoing'])} outgoing handed over).")
    if just_completed:
        inc = [x for x in sw['incoming'] if x in sw['acks']]
        post(f"Kyle — CREW SWITCH {sid} COMPLETE: every {sw['from'].title()} session has handed over; the crew is on "
             f"{sw['to'].upper()}. On duty and confirmed so far: {', '.join(inc) or 'none yet — open the ones you want'}.",
             notify=True)
    print(f'ok {sid} {n} {side}')

def status():
    st = load(); sw = st.get('switch')
    print(f"crew mode: {st['mode'].upper()}")
    if not sw: print('no switch yet'); return
    missing_out = [x for x in sw['outgoing'] if x not in sw['acks']]
    print(f"switch {sw['id']} {sw['from']}->{sw['to']} started {sw['started']} "
          f"{(sw.get('closed_as') or 'complete').upper() + ' ' + sw.get('completed', '') if sw['complete'] else 'OPEN'}")
    print('  outgoing not yet handed over: ' + (', '.join(missing_out) or 'none'))
    print('  incoming confirmed: ' + (', '.join(x for x in sw['incoming'] if x in sw['acks']) or 'none'))

def nag():
    with Lock():
        st = load(); sw = st.get('switch')
        if not sw or sw['complete']: return
        missing = [x for x in sw['outgoing'] if x not in sw['acks']]
        t = now(); last = sw.get('last_nag_t')
        if missing and t - sw['started_t'] >= EXPIRE_S:
            sw.update(complete=True, completed=iso(), closed_as='expired', never_confirmed=missing)
            st['history'] = (st.get('history') or [])[-20:] + [dict(sw)]
            save(st)
            expired = True
        else:
            expired = False
            due = (last is None and t - sw['started_t'] >= NAG_FIRST_S) or (last is not None and t - last >= NAG_EVERY_S)
            if not missing or not due: return
            sw['last_nag_t'] = t; save(st)
    if expired:
        post(f"Kyle — crew switch {sw['id']} to {sw['to'].upper()} CLOSED AS EXPIRED after 24 h; never confirmed: "
             f"{', '.join(missing)}. The crew stays on {sw['to'].upper()}; open those sessions to hand over by hand.",
             notify=True)
        return
    mins = int((t - sw['started_t']) / 60)
    post(f"{' / '.join(missing)} — CREW SWITCH {sw['id']} STILL NOT CONFIRMED after {mins} min. Hand over now "
         f"(step boundary, push, POSITION block), then: {ack_cmd(sw['id'])}.")
    post(f"Kyle — crew switch {sw['id']} to {sw['to'].upper()}: still waiting on {', '.join(missing)} ({mins} min). "
         f"A Claude session that has not answered is probably closed or its watcher is down; a Codex session only "
         f"answers when you open it.", notify=True)

def kyle_id():
    with open(KYLE_ENV) as f:
        for line in f:
            if line.startswith('KYLE_DISCORD_ID='): return int(line.split('=', 1)[1].strip())
    raise SystemExit('crew-switch: KYLE_DISCORD_ID not found')

def safe(what, arg):
    """B1 (Langston, Step 4): nothing a dispatch does may kill the watcher — a refusal, a failed post or a timeout
    is logged to the journal and reported, never raised."""
    try:
        if what == 'start':
            start(arg)
        else:
            post(f'Kyle — I saw a message about switching the crew but did NOT act on it: "{arg}". To switch, post '
                 f'exactly SWITCH TO CODEX or SWITCH TO CLAUDE on its own.', notify=True)
    except BaseException as x:          # SystemExit (refusal / failed post), subprocess.TimeoutExpired, anything
        if isinstance(x, KeyboardInterrupt): raise
        print(f'crew-switch: {what} failed: {x!r}', file=sys.stderr, flush=True)
        try:
            post(f'Kyle — crew switch: "{what} {arg}" did not complete ({type(x).__name__}). '
                 f'Check `crew-switch status` on the Helsinki box.', notify=True)
        except BaseException as y:
            if isinstance(y, KeyboardInterrupt): raise
            print(f'crew-switch: the report failed too: {y!r}', file=sys.stderr, flush=True)

def watch():
    """Follow the inbox log; a message FROM KYLE that is exactly 'switch to codex|claude' starts a switch."""
    kid = kyle_id()
    with Lock():
        st = load()
        if st.get('inbox_offset') is None:
            st['inbox_offset'] = os.path.getsize(INBOX); save(st)   # first run: never replay history
        off = st['inbox_offset']
    while True:
        size = os.path.getsize(INBOX)
        if size < off: off = 0                                      # rotated
        if size > off:
            with open(INBOX, 'rb') as f:
                f.seek(off); chunk = f.read(size - off)
            last_nl = chunk.rfind(b'\n')
            if last_nl >= 0:
                found = []
                for raw in chunk[:last_nl].split(b'\n'):
                    try: e = json.loads(raw)
                    except Exception: continue
                    if e.get('author_id') != kid or e.get('source') != 'discord-cc-bridge': continue
                    if e.get('kind') not in ('', 'voice_inbound'): continue
                    text = (e.get('text') or '').strip()
                    m = TRIGGER.match(text)
                    if m: found.append(('start', m.group(1)))
                    elif NEAR.search(text): found.append(('near', text[:80]))
                # B1 (Langston, Step 4): advance the offset BEFORE acting, so a failure can never replay or loop.
                off += last_nl + 1
                with Lock():
                    st = load(); st['inbox_offset'] = off; save(st)
                for what, arg in found:
                    safe(what, arg)
        time.sleep(5)

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(2)
    c = a[0]
    if c == 'start' and len(a) >= 2: start(a[1])
    elif c == 'ack' and len(a) == 3: ack(a[1], a[2])
    elif c == 'status': status()
    elif c == 'nag': nag()
    elif c == 'watch': watch()
    else: print(__doc__); sys.exit(2)
