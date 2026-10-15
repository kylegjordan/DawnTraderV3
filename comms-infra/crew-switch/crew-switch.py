#!/usr/bin/env python3
"""crew-switch — move the DawnTrader crew between Claude and Codex, turn single sessions on and off, and PROVE every
session got the order.  B-CODEX-FAILOVER (#1192, Kyle 2026-10-13).

Kyle types ONE line on Discord (either word order for names; case-insensitive; punctuation ignored):
  SWITCH TO CODEX / SWITCH TO CLAUDE     the whole crew. Langston is switched OFF / ON with it.
  LANGSTON ON / LANGSTON OFF             Langston alone (he costs Claude credit while on).
  OLD CLAUDE ON, CODEX NEW OFF, ...      one session. Turning a session ON hands its counterpart OFF: OLD Claude and
                                         OLD Codex share one folder, and two workers in one folder overwrite each other.
  Coltrane is never switched off: on a Codex shift he is the reviewer; on a Claude shift he is a second reviewer who
  works only when called by name.

A deterministic script — not a reviewer's judgement — then posts the order to each session BY NAME, keeps a checklist
(`crew-switch ack <id> "<name>"`), and `nag` (5-min timer) re-sends to every OUTGOING session that has not confirmed
(first at 15 min, then hourly) and pings Kyle with the missing names; after 24 h it closes the order EXPIRED.
HONEST LIMIT: nothing can wake a closed Claude window, and nothing can wake a Codex session — Kyle opens those. The
guarantee is CONFIRMATION + ESCALATION, never assumed delivery. Incoming sessions are tracked, never nagged.

State: /var/lib/crew-switch/state.json (the one record).  Subcommands: start <claude|codex> · session <name> <on|off>
· langston <on|off> · ack <id> <name> · status · nag · watch
"""
import fcntl, json, os, re, subprocess, sys, time
from datetime import datetime, timezone

STATE = '/var/lib/crew-switch/state.json'
INBOX = '/var/log/cc-discord-inbox.jsonl'
CC_SEND = '/usr/local/bin/cc-send'
SENDER = 'Crew switch'
KYLE_ENV = '/etc/dawntrader/discord-comms.env'
NAG_FIRST_S = 15 * 60          # first re-send after 15 min, then hourly
NAG_EVERY_S = 60 * 60
EXPIRE_S = 24 * 60 * 60        # B2 (Langston): an unconfirmed order stops nagging after 24 h and closes EXPIRED
# Kyle 2026-10-13: Langston must ACTUALLY stop on a switch to Codex — asking him does not work (each alert and each
# mention starts a fresh invoke). The only invoker on this box is this bridge (measured 2026-10-13, re-derived by
# Langston on five legs), so the switch stops AND disables it and reads BOTH back.
SYSTEMCTL = '/usr/bin/systemctl'
LANGSTON_UNIT = 'discord-langston-bridge.service'

CREWS = {
    'claude': ['OLD Claude', 'NEW Claude', 'ANALYST Claude', 'Infra Claude'],
    'codex':  ['OLD Codex', 'NEW Codex', 'ANALYST Codex', 'INFRA Codex'],
}
REVIEWER = {'claude': 'Langston', 'codex': 'Coltrane'}
COUNTERPART = {a: b for ca, cb in [('claude', 'codex'), ('codex', 'claude')] for a, b in zip(CREWS[ca], CREWS[cb])}
KIND = {n: k for k, names in CREWS.items() for n in names}

def _aliases():
    out = {}
    for names in CREWS.values():
        for n in names:
            role, kind = n.split(' ')   # every crew name is exactly TWO words; a third raises here, at import
            for k in (f'{role} {kind}', f'{kind} {role}', f'{role}-{kind}', f'{kind}-{role}'):
                out[k.lower()] = n
    return out
ALIASES = _aliases()
_NAME_ALT = '|'.join(sorted((re.escape(k).replace(r'\ ', r'[\s-]+') for k in ALIASES), key=len, reverse=True))

TRIGGER = re.compile(r'^\W*switch\s+(?:the\s+crew\s+)?(?:over\s+)?to\s+(codex|claude)\W*$', re.I)
ONOFF = re.compile(r'^\W*(langston|coltrane|' + _NAME_ALT + r')\s+(on|off)\W*$', re.I)
# A Kyle message that MENTIONS a command but is not the bare command gets a "not acted on" reply (Langston: never trade
# a self-announcing failure for a silent one). No phone ping: he is on Discord when he types it.
NEAR = re.compile(r'\bswitch\b.*\b(codex|claude)\b|\b(langston|' + _NAME_ALT + r')\s+(on|off)\b', re.I | re.S)

def now(): return time.time()
def iso(t=None): return datetime.fromtimestamp(t or now(), timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def load():
    try:
        with open(STATE) as f: st = json.load(f)
    except FileNotFoundError:
        st = {'mode': 'claude', 'mode_generation': 0, 'seq': 0, 'inbox_offset': None, 'history': []}
    # B-CODEX-FAILOVER: this is the ABA fence for reviewer authority.  The mode
    # alone cannot distinguish CODEX -> CLAUDE -> CODEX during one invocation.
    # Older state files predate the field and are initialized without claiming
    # that a new mode transition occurred.  Only start() advances it.
    st.setdefault('mode_generation', 0)
    if type(st['mode_generation']) is not int or st['mode_generation'] < 0:
        raise SystemExit('crew-switch: invalid mode_generation in state')
    st.setdefault('orders', {}); st.setdefault('history', [])
    st.setdefault('duty', {n: (KIND[n] == st['mode']) for n in KIND})
    return st

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

def post_all(msgs):
    """Langston finding 3: one failed post must not stop the next. Most important FIRST; raise only at the end."""
    failed = []
    for m, notify in msgs:
        try: post(m, notify)
        except BaseException as x:
            if isinstance(x, KeyboardInterrupt): raise
            failed.append(repr(x)[:120])
    if failed: raise SystemExit('crew-switch: ' + str(len(failed)) + ' post(s) failed: ' + '; '.join(failed))

def set_langston(on):
    """Stop+disable (on=False) or enable+start (on=True); read BOTH is-active and is-enabled back (Langston BLOCKER-2:
    stopped-but-enabled returns at the next boot). Never discards an error."""
    errs = []
    for v in (['enable', 'start'] if on else ['stop', 'disable']):
        # Condition 1 (Langston, r3): the timeout sits ABOVE the unit's own TimeoutStopUSec (1 min 30 s, measured), and a
        # timeout is recorded as an error rather than raised, so it can never suppress the read-back or the report.
        try:
            r = subprocess.run([SYSTEMCTL, v, LANGSTON_UNIT], capture_output=True, text=True, timeout=150)
            if r.returncode != 0: errs.append(f'{v} rc={r.returncode} {r.stderr.strip()[:120]}')
        except subprocess.TimeoutExpired:
            errs.append(f'{v} timed out after 150 s')
    return langston_state(on, errs)

def langston_state(on, errs=()):
    a = subprocess.run([SYSTEMCTL, 'is-active', LANGSTON_UNIT], capture_output=True, text=True, timeout=30).stdout.strip() or 'unknown'
    e = subprocess.run([SYSTEMCTL, 'is-enabled', LANGSTON_UNIT], capture_output=True, text=True, timeout=30).stdout.strip() or 'unknown'
    good = (a == 'active' and e == 'enabled') if on else (a in ('inactive', 'failed') and e == 'disabled')
    return good and not errs, f'{a}/{e}', list(errs)

def langston_msg(oid, on, good, state, errs):
    want = 'ON' if on else 'OFF'
    if good:
        return (f"{oid}: Langston is {want} (his Discord bridge reads `{state}`).", False)
    return (f"Kyle — {oid}: Langston should be {want} but his bridge reads `{state}`"
            f"{' (' + '; '.join(errs) + ')' if errs else ''}. Check `{LANGSTON_UNIT}` on the Helsinki box.", True)

def ack_cmd(oid):
    return f"ssh root@204.168.141.77 'crew-switch ack {oid} \"<your name>\"'"

def _new_order(st, kind, outgoing, incoming, note):
    st['seq'] += 1
    oid = f"S{st['seq']}"
    st['orders'][oid] = {'id': oid, 'kind': kind, 'note': note, 'started': iso(), 'started_t': now(),
                         'outgoing': outgoing, 'incoming': incoming, 'acks': {}, 'last_nag_t': None}
    return oid

def _close(st, oid, how):
    o = st['orders'].pop(oid)
    o.update(closed_as=how, completed=iso(), never_confirmed=[x for x in o['outgoing'] if x not in o['acks']])
    st['history'] = (st.get('history') or [])[-30:] + [o]
    return o

def _supersede(st, names):
    """Close every open order that hands over any of `names` (B2: never deadlock on a session that cannot confirm)."""
    closed = []
    for oid, o in list(st['orders'].items()):
        if set(o['outgoing']) & set(names) or set(o['incoming']) & set(names):
            closed.append(_close(st, oid, 'superseded'))
    return closed

def _open_for(st, names):
    return [o for o in st['orders'].values() if set(o['outgoing']) & set(names)]

def start(to, by='kyle'):
    to = to.lower()
    if to not in CREWS: raise SystemExit(f'crew-switch: unknown crew {to!r} (claude|codex)')
    frm = 'codex' if to == 'claude' else 'claude'
    with Lock():
        st = load()
        if st['mode'] == to:
            # BLOCKER-1 (Langston): a repeated command must NEVER close the open order or disarm the nag.
            # Report status, and reconcile Langston (finding 1) — unless Kyle set him by hand (condition 3).
            missing = sorted({x for o in _open_for(st, CREWS[frm]) for x in o['outgoing'] if x not in o['acks']})
            manual = st.get('langston') or {}
            already = True
        else:
            already = False
            superseded = _supersede(st, KIND.keys())
            oid = _new_order(st, 'crew', CREWS[frm], CREWS[to], f'crew {frm} -> {to}')
            st['mode_generation'] += 1
            st['mode'] = to
            for n in KIND: st['duty'][n] = (KIND[n] == to)
            st['langston'] = {'on': to == 'claude', 'at': iso(), 'by': 'crew switch'}
            save(st)
    if already:
        head = (f"Crew switch: the crew is already on {to.upper()}. "
                + (f"Still waiting on: {', '.join(missing)} — the reminders keep running." if missing
                   else 'Every outgoing session has handed over.'))
        if manual.get('by') == 'kyle' and manual.get('on') != (to == 'claude'):
            # Condition 3 (Langston): Kyle's own LANGSTON ON/OFF is never overridden by a re-sent SWITCH — reported.
            a, e = langston_state(True)[1].split('/')
            post_all([(head, False),
                      (f"Langston was turned {'ON' if manual.get('on') else 'OFF'} by you at {manual.get('at')} and is left "
                       f"that way (bridge `{a}/{e}`). Type LANGSTON {'OFF' if manual.get('on') else 'ON'} to change it.", False)])
            return
        good, state, errs = set_langston(on=(to == 'claude'))
        post_all([(head, False), langston_msg('Crew switch', to == 'claude', good, state, errs)])
        return
    # Condition 1 (Langston): the handover order and the on-duty notice go out BEFORE Langston is touched — neither
    # depends on him, and nothing that happens to his bridge may suppress them.
    msgs = [
        (f"{' / '.join(CREWS[frm])} — CREW SWITCH {oid}: Kyle is moving the crew from {frm.upper()} to {to.upper()}. "
         f"You are OUTGOING. Now: bring your work to a step boundary, push everything (git fetch, pull, push; the sync "
         f"gate reads 0 behind / 0 ahead), write your POSITION block in your MEMORY_CC_<X>.md (both copies) so your "
         f"{to.title()} counterpart resumes from it, then CONFIRM: {ack_cmd(oid)}. Until you confirm you will be named "
         f"again and Kyle is told you are missing.", False),
        (f"{' / '.join(CREWS[to])} / {REVIEWER[to]} — CREW SWITCH {oid}: you are ON DUTY from now ({to.upper()}). When "
         f"Kyle opens you: pull, read your POSITION block and any message addressed to you, then CONFIRM: "
         f"{ack_cmd(oid)}. {REVIEWER[to]} reviews and handles alerts for this shift.", False),
    ] + [(f"Order {o['id']} closed as SUPERSEDED by {oid}; never confirmed: {', '.join(o['never_confirmed']) or 'nobody'}.", False)
         for o in superseded]
    try:
        post_all(msgs)
    finally:
        good, state, errs = set_langston(on=(to == 'claude'))
        post_all([langston_msg(f'Crew switch {oid}', to == 'claude', good, state, errs)])

def session(name, on):
    n = ALIASES.get(re.sub(r'[\s-]+', ' ', name.strip().lower()))
    if not n: raise SystemExit(f'crew-switch: unknown session {name!r}')
    cp = COUNTERPART[n]
    with Lock():
        st = load()
        if on:
            superseded = _supersede(st, [n, cp])
            outgoing = [cp] if st['duty'].get(cp) else []
            oid = _new_order(st, 'session', outgoing, [n], f'{n} ON')
            st['duty'][n] = True; st['duty'][cp] = False
        else:
            superseded = _supersede(st, [n])
            oid = _new_order(st, 'session', [n], [], f'{n} OFF')
            st['duty'][n] = False
        no_handover = not st['orders'][oid]['outgoing']
        if no_handover:
            _close(st, oid, 'complete')              # nobody to hand over: nothing to chase, nothing to confirm
        save(st)
    msgs = []
    if on:
        if no_handover:
            # Condition 2 (Langston): the order is already closed, so no ack is asked for — it would be refused.
            msgs.append((f"{n} — ORDER {oid}: Kyle has put you ON DUTY ({cp} was not on duty, so there is no handover). "
                         f"Pull, read your POSITION block and carry on. Nothing to confirm.", False))
        else:
            msgs.append((f"{cp} — ORDER {oid}: Kyle has put {n} on duty in your folder. You are OUTGOING: step boundary, "
                         f"push everything, POSITION block, then CONFIRM: {ack_cmd(oid)}. Until you confirm, Kyle is told.", False))
            msgs.append((f"{n} — ORDER {oid}: Kyle has put you ON DUTY. Wait for {cp}'s handover confirmation in this channel "
                         f"(or `crew-switch status`), then pull, read your POSITION block, and CONFIRM: {ack_cmd(oid)}.", False))
    else:
        msgs.append((f"{n} — ORDER {oid}: Kyle has taken you OFF DUTY. Step boundary, push everything, POSITION block, then "
                     f"CONFIRM: {ack_cmd(oid)} and stop. Until you confirm, Kyle is told.", False))
    msgs += [(f"Order {o['id']} closed as SUPERSEDED by {oid}; never confirmed: {', '.join(o['never_confirmed']) or 'nobody'}.", False)
             for o in superseded]
    post_all(msgs)

def langston(on):
    good, state, errs = set_langston(on)
    with Lock():
        # Read by start()'s already-branch (condition 3): a manual setting is never overridden by a re-sent SWITCH.
        st = load(); st['langston'] = {'on': on, 'at': iso(), 'by': 'kyle', 'state': state}; save(st)
    post_all([langston_msg('Kyle asked', on, good, state, errs)])

def ack(oid, name):
    n = ALIASES.get(re.sub(r'[\s-]+', ' ', name.strip().lower()))
    if not n: raise SystemExit(f'crew-switch: unknown name {name!r}. Known: ' + ', '.join(sorted(set(ALIASES.values()))))
    with Lock():
        st = load(); o = st['orders'].get(oid)
        closed = False
        if not o:
            # Incoming sessions are deliberately tracked but never chased. The last outgoing handover closes an
            # order immediately, so an incoming session opened afterwards must be able to leave a late receipt on
            # the completed history row. Superseded/expired orders stay closed: a stale receipt must not revive them.
            o = next((x for x in reversed(st.get('history') or []) if x.get('id') == oid), None)
            if not o or o.get('closed_as') != 'complete' or n not in o.get('incoming', []):
                raise SystemExit(f"crew-switch: no open order {oid} (open: {', '.join(st['orders']) or 'none'}).")
            closed = True
        if n not in o['outgoing'] + o['incoming']:
            raise SystemExit(f'crew-switch: {n} is not part of order {oid}.')
        first = n not in o['acks']
        if first: o['acks'][n] = iso()
        side = 'handed over' if n in o['outgoing'] else 'on duty'
        done = [x for x in o['outgoing'] if x in o['acks']]
        total = len(o['outgoing'])
        completed = not closed and len(done) == total
        if completed: _close(st, oid, 'complete')
        if first: save(st)
    msgs = []
    if first: msgs.append((f"Order {oid}: {n} {side} ({len(done)}/{total} outgoing handed over).", False))
    if completed:
        inc = [x for x in o['incoming'] if x in o['acks']]
        msgs.append((f"Kyle — ORDER {oid} COMPLETE ({o['note']}): every outgoing session has handed over. "
                     f"On duty and confirmed so far: {', '.join(inc) or 'none yet — open the ones you want'}.", True))
    post_all(msgs)
    print(f'ok {oid} {n} {side}')

def status():
    st = load()
    print(f"crew mode: {st['mode'].upper()}")
    print(f"mode generation: {st['mode_generation']}")
    print('on duty: ' + ', '.join(n for n, v in st['duty'].items() if v))
    a, e = langston_state(True)[1].split('/')
    print(f'Langston bridge: {a}/{e}')
    if not st['orders']: print('no open orders')
    for o in st['orders'].values():
        print(f"open order {o['id']} ({o['note']}) started {o['started']}")
        print('  outgoing not yet handed over: ' + (', '.join(x for x in o['outgoing'] if x not in o['acks']) or 'none'))
        print('  incoming confirmed: ' + (', '.join(x for x in o['incoming'] if x in o['acks']) or 'none'))

def nag():
    t = now(); msgs = []
    with Lock():
        st = load()
        for oid, o in list(st['orders'].items()):
            missing = [x for x in o['outgoing'] if x not in o['acks']]
            if not missing: continue
            if t - o['started_t'] >= EXPIRE_S:
                _close(st, oid, 'expired')
                msgs.append((f"Kyle — order {oid} ({o['note']}) CLOSED AS EXPIRED after 24 h; never confirmed: "
                             f"{', '.join(missing)}. Open those sessions to hand over by hand.", True))
                continue
            last = o.get('last_nag_t')
            if (last is None and t - o['started_t'] >= NAG_FIRST_S) or (last is not None and t - last >= NAG_EVERY_S):
                o['last_nag_t'] = t
                mins = int((t - o['started_t']) / 60)
                msgs.append((f"{' / '.join(missing)} — ORDER {oid} ({o['note']}) STILL NOT CONFIRMED after {mins} min. "
                             f"Hand over now (step boundary, push, POSITION block), then: {ack_cmd(oid)}.", False))
                msgs.append((f"Kyle — order {oid} ({o['note']}): still waiting on {', '.join(missing)} ({mins} min). A Claude "
                             f"session that has not answered is probably closed or its watcher is down; a Codex session "
                             f"only answers when you open it.", True))
        save(st)
    if msgs: post_all(msgs)

def kyle_id():
    with open(KYLE_ENV) as f:
        for line in f:
            if line.startswith('KYLE_DISCORD_ID='): return int(line.split('=', 1)[1].strip())
    raise SystemExit('crew-switch: KYLE_DISCORD_ID not found')

def classify(text):
    m = TRIGGER.match(text)
    if m: return ('start', m.group(1).lower())
    m = ONOFF.match(text)
    if m:
        who, on = m.group(1).lower(), m.group(2).lower() == 'on'
        if who == 'langston': return ('langston', on)
        if who == 'coltrane': return ('coltrane', on)
        return ('session', (who, on))
    # Only a SHORT message can be a mistyped command; a long one that merely mentions "switch ... codex" or
    # "Langston on this ..." is conversation (Langston measured 1 long historical NEAR hit, a false one).
    if len(text) <= 60 and NEAR.search(text): return ('near', text[:80])
    return None

def safe(what, arg):
    """B1 (Langston): nothing a dispatch does may kill the watcher — every failure is logged and reported."""
    try:
        if what == 'start': start(arg)
        elif what == 'langston': langston(arg)
        elif what == 'session': session(*arg)
        elif what == 'coltrane':
            post('Kyle — Coltrane is always on and is not switched by these commands: on a Codex shift he is the reviewer; '
                 'on a Claude shift he is a second reviewer who works only when called by name. Nothing changed.')
        else:
            post(f'Kyle — I saw a message that looks like a crew command but did NOT act on it: "{arg}". Post the command '
                 f'on its own line, e.g. SWITCH TO CODEX, LANGSTON ON, OLD CLAUDE OFF.')
    except BaseException as x:
        if isinstance(x, KeyboardInterrupt): raise
        print(f'crew-switch: {what} failed: {x!r}', file=sys.stderr, flush=True)
        try:
            post(f'Kyle — crew switch: "{what} {arg}" did not complete ({type(x).__name__}). Check `crew-switch status` '
                 f'on the Helsinki box.', notify=True)
        except BaseException as y:
            if isinstance(y, KeyboardInterrupt): raise
            print(f'crew-switch: the report failed too: {y!r}', file=sys.stderr, flush=True)

def watch():
    """Follow the inbox log; act on Kyle's own messages only (author_id, discord-cc-bridge, text or voice)."""
    kid = kyle_id()
    while not os.path.exists(INBOX): time.sleep(5)                  # a missing log at start must not crash-loop the unit
    with Lock():
        st = load()
        if st.get('inbox_offset') is None:
            st['inbox_offset'] = os.path.getsize(INBOX); save(st)   # first run: never replay history
        off = st['inbox_offset']
    while True:
        try:
            size = os.path.getsize(INBOX)
        except OSError:
            time.sleep(5); continue                                 # rotated away mid-check: try again
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
                    # `source == 'discord-cc-bridge'` is the DEDUPE, not provenance (Langston, measured 2026-10-13: of Kyle's
                    # 149 rows only 82 message_ids are distinct — 60 logged by BOTH bridges, 22 by this one only, 0 by
                    # Langston's only). Widen it and every command fires twice. Provenance is the author_id.
                    if e.get('author_id') != kid or e.get('source') != 'discord-cc-bridge': continue
                    if e.get('kind') not in ('', 'voice_inbound'): continue
                    c = classify((e.get('text') or '').strip())
                    if c: found.append(c)
                # B1 (Langston): advance the offset BEFORE acting, so a failure can never replay or loop.
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
    elif c == 'session' and len(a) == 3: session(a[1], a[2].lower() == 'on')
    elif c == 'langston' and len(a) == 2: langston(a[1].lower() == 'on')
    elif c == 'ack' and len(a) == 3: ack(a[1], a[2])
    elif c == 'status': status()
    elif c == 'nag': nag()
    elif c == 'watch': watch()
    else: print(__doc__); sys.exit(2)
