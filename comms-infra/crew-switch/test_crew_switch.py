#!/usr/bin/env python3
"""Offline tests for crew-switch.py (B-CODEX-FAILOVER #1192). Linux only (fcntl). Runs in a private temp dir with a
FAKE cc-send (records every post) and a FAKE systemctl — nothing reaches Discord or a real service.
⛔ A first draft of this file missed the fake systemctl and stopped+disabled Langston's LIVE bridge (2026-10-13,
restored in ~20 s). Two guards now: the fake must be in place (assert), AND the unit name is a fake (Langston,
finding 2), so even a real systemctl could only fail harmlessly.  Run: python3 test_crew_switch.py"""
import importlib.util, json, os, shutil, sys, tempfile, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('cs', os.path.join(HERE, 'crew-switch.py'))
cs = importlib.util.module_from_spec(spec); spec.loader.exec_module(cs)

d = tempfile.mkdtemp(); os.chmod(d, 0o700)
cs.LANGSTON_UNIT = 'crew-switch-test-fake.service'
posts = os.path.join(d, 'posts.jsonl')
fake = os.path.join(d, 'cc-send')
open(fake, 'w').write('#!/usr/bin/env python3\nimport json,sys\nopen(%r,"a").write(json.dumps(sys.argv[1:])+"\\n")\n' % posts)
os.chmod(fake, 0o700)
cs.STATE = os.path.join(d, 'state', 'state.json'); cs.CC_SEND = fake
cs.INBOX = os.path.join(d, 'inbox.jsonl'); cs.KYLE_ENV = os.path.join(d, 'k.env')
open(cs.KYLE_ENV, 'w').write('KYLE_DISCORD_ID=42\n')
act = os.path.join(d, 'active'); ena = os.path.join(d, 'enabled')
open(act, 'w').write('active'); open(ena, 'w').write('enabled')
fsc = os.path.join(d, 'systemctl')
GOOD_SC = ('#!/bin/sh\nA=%s\nE=%s\ncase "$1" in start) echo active > $A;; stop) echo inactive > $A;; '
           'enable) echo enabled > $E;; disable) echo disabled > $E;; is-active) cat $A;; is-enabled) cat $E;; esac\nexit 0\n') % (act, ena)
def set_sc(body): open(fsc, 'w').write(body); os.chmod(fsc, 0o700)
set_sc(GOOD_SC); cs.SYSTEMCTL = fsc
if not (cs.SYSTEMCTL.startswith(d) and cs.LANGSTON_UNIT.startswith('crew-switch-test')):   # not `assert`: -O strips it
    raise SystemExit('REFUSING TO RUN: a real service could be touched')

P = F = 0
def ok(name, cond):
    global P, F
    if cond: P += 1
    else: F += 1; print('  FAIL:', name)
def read_posts(): return [json.loads(l) for l in open(posts)] if os.path.exists(posts) else []
def since(n): return read_posts()[n:]
def raises(fn, needle):
    try: fn(); return False
    except SystemExit as e: return needle in str(e)
def lang(): return open(act).read().strip() + '/' + open(ena).read().strip()
def text(p): return p[3]

# T1 classify: commands, near-misses (short only), conversation ignored
C = cs.classify
ok('T1 switch', C('SWITCH TO CODEX') == ('start', 'codex') and C('switch the crew over to Claude.') == ('start', 'claude'))
ok('T1 langston on/off', C('Langston ON') == ('langston', True) and C('langston off!') == ('langston', False))
ok('T1 session either order', C('OLD CLAUDE ON') == ('session', ('old claude', True)) and C('codex new off') == ('session', ('codex new', False)))
ok('T1 coltrane', C('Coltrane off')[0] == 'coltrane')
ok('T1 near (short)', C('Langston, switch to codex please')[0] == 'near' and C('turn langston on now')[0] == 'near')
ok('T1 long conversation ignored', C('Langston on this issue I think we should look again at how the switch to codex handles alerts') is None)
ok('T1 unrelated ignored', C('hello there') is None)

# T2 crew switch to codex: Langston OFF and DISABLED, read back; handover order is the FIRST post (finding 3)
n = len(read_posts()); cs.start('codex'); st = cs.load(); p = since(n)
ok('T2 mode + duty', st['mode'] == 'codex' and st['duty']['OLD Codex'] and not st['duty']['OLD Claude'])
ok('T2 Langston inactive/disabled', lang() == 'inactive/disabled')
ok('T2 first post is the handover order naming all four Claude sessions', 'OUTGOING' in text(p[0]) and all(x in text(p[0]) for x in cs.CREWS['claude']))
ok('T2 on-duty notice names the Codex crew + Coltrane', all(x in text(p[1]) for x in cs.CREWS['codex'] + ['Coltrane']))
ok('T2 Langston OFF reported', any('Langston is OFF' in text(x) and 'inactive/disabled' in text(x) for x in p))
s1 = [o for o in st['orders'].values()][0]['id']

# T3 BLOCKER-1: a repeated SWITCH TO CODEX keeps the order open and the nag armed, and reports who is missing
cs.ack(s1, 'Claude Old'); n = len(read_posts()); cs.start('codex'); st = cs.load(); p = since(n)
ok('T3 order still open', s1 in st['orders'])
ok('T3 reports already-on + who is missing', 'already on CODEX' in text(p[0]) and 'NEW Claude' in text(p[0]) and 'OLD Claude' not in text(p[0]))
st['orders'][s1]['started_t'] -= 16 * 60; cs.save(st); n = len(read_posts()); cs.nag(); p = since(n)
ok('T3 nag still fires after the repeat', len(p) == 2 and 'NEW Claude' in text(p[0]) and '--notify' in p[1])

# T4 BLOCKER-2: stop ok but disable FAILS -> not good, Kyle pinged, the error named
set_sc(GOOD_SC.replace('disable) echo disabled > $E;;', 'disable) exit 1;;'))
open(act, 'w').write('active'); open(ena, 'w').write('enabled')
good, state, errs = cs.set_langston(on=False)
ok('T4 stopped-but-enabled is NOT good', not good and state == 'inactive/enabled' and any('disable' in e for e in errs))
m, notify = cs.langston_msg('x', False, good, state, errs)
ok('T4 Kyle pinged with the failed disable', notify and 'disable' in m and 'inactive/enabled' in m)
set_sc(GOOD_SC.replace('enable) echo enabled > $E;;', 'enable) exit 1;;'))
open(act, 'w').write('inactive'); open(ena, 'w').write('disabled')
good, state, errs = cs.set_langston(on=True)
ok('T4 started-but-disabled is NOT good', not good and state == 'active/disabled')
set_sc(GOOD_SC)

# T5 acks complete the crew order; Kyle notified; then crew back to claude turns Langston ON
for x in ['new claude', 'ANALYST CLAUDE', 'claude infra']: cs.ack(s1, x)
st = cs.load(); p = read_posts()
ok('T5 complete + Kyle notified', s1 not in st['orders'] and 'COMPLETE' in text(p[-1]) and '--notify' in p[-1])
cs.start('claude'); ok('T5 Langston active/enabled', lang() == 'active/enabled' and cs.load()['mode'] == 'claude')

# T6 LANGSTON OFF / ON alone (the crew stays as it is)
n = len(read_posts()); cs.langston(False); p = since(n)
ok('T6 LANGSTON OFF', lang() == 'inactive/disabled' and 'Langston is OFF' in text(p[0]) and cs.load()['mode'] == 'claude')
cs.langston(True); ok('T6 LANGSTON ON', lang() == 'active/enabled')

# T7 single session ON hands its counterpart OFF (one worker per folder); counterpart OFF-duty -> no handover
st = cs.load(); [cs._close(st, o, 'test') for o in list(st['orders'])]; cs.save(st)
n = len(read_posts()); cs.session('OLD CODEX', True); st = cs.load(); p = since(n)
ok('T7 OLD Codex on, OLD Claude off', st['duty']['OLD Codex'] and not st['duty']['OLD Claude'])
oid = [o for o in st['orders'].values() if o['note'] == 'OLD Codex ON'][0]['id']
ok('T7 OLD Claude gets the handover order', text(p[0]).startswith('OLD Claude') and 'OUTGOING' in text(p[0]))
cs.ack(oid, 'OLD Claude'); ok('T7 completes on the counterpart ack', oid not in cs.load()['orders'])
n = len(read_posts()); cs.session('codex old', True); p = since(n)
ok('T7 already on duty, counterpart off: no handover order and NO ack asked for (condition 2)',
   'no handover' in text(p[0]) and 'crew-switch ack' not in text(p[0]) and 'Nothing to confirm' in text(p[0]))

# T8 session OFF: the session gets a stand-down order; nag chases it
n = len(read_posts()); cs.session('NEW CLAUDE', False); st = cs.load(); p = since(n)
ok('T8 NEW Claude off duty + ordered to stand down', not st['duty']['NEW Claude'] and 'OFF DUTY' in text(p[0]))

# T9 B2: a crew switch supersedes open orders (no deadlock) and names who never confirmed
n = len(read_posts()); cs.start('codex'); p = since(n)
ok('T9 superseded reported', any('SUPERSEDED' in text(x) and 'NEW Claude' in text(x) for x in p))

# T10 B2 expiry after 24 h, one Kyle ping, then silence
st = cs.load()
for o in st['orders'].values(): o['started_t'] -= 25 * 3600
cs.save(st); n = len(read_posts()); cs.nag(); p = since(n)
ok('T10 expired + Kyle pinged', not cs.load()['orders'] and any('EXPIRED' in text(x) and '--notify' in x for x in p))
n = len(read_posts()); cs.nag(); ok('T10 silent after expiry', len(read_posts()) == n)

# T11 B1: a failing cc-send never kills dispatch; watch advances the offset first and its thread survives
bad = os.path.join(d, 'cc-send-bad'); open(bad, 'w').write('#!/bin/sh\nexit 1\n'); os.chmod(bad, 0o700)
cs.CC_SEND = bad
try: cs.safe('start', 'claude'); survived = True
except BaseException: survived = False
ok('T11 safe() survives a failing post', survived)
cs.CC_SEND = fake
open(cs.INBOX, 'w').write(json.dumps({'author_id': 42, 'source': 'discord-cc-bridge', 'kind': '', 'text': 'switch to codex'}) + '\n')
st = cs.load(); st['inbox_offset'] = 0; cs.save(st); cs.CC_SEND = bad
th = threading.Thread(target=cs.watch, daemon=True); th.start(); time.sleep(3)
ok('T11 offset advanced past the line despite the failing post', cs.load()['inbox_offset'] == os.path.getsize(cs.INBOX))
ok('T11 watcher thread alive', th.is_alive())
cs.CC_SEND = fake

# T13 condition 3: Kyle's LANGSTON ON during a Codex shift survives a re-sent SWITCH TO CODEX, and is reported
st = cs.load(); [cs._close(st, o, 'test') for o in list(st['orders'])]; st['mode'] = 'claude'; cs.save(st)
cs.start('codex'); cs.langston(True)
n = len(read_posts()); cs.start('codex'); p = since(n)
ok('T13 Langston stays ON after the re-sent switch', lang() == 'active/enabled')
ok('T13 the override is reported, not corrected', any('turned ON by you' in text(x) and 'LANGSTON OFF' in text(x) for x in p))
cs.langston(False)

# T14 condition 1: a stop that times out cannot suppress the handover order (sent first) and is reported
st = cs.load(); [cs._close(st, o, 'test') for o in list(st['orders'])]; st['mode'] = 'claude'; cs.save(st)
cs.langston(True)
import subprocess as _sp
real_run = cs.subprocess.run
def slow_run(cmd, *a, **k):
    if len(cmd) > 1 and cmd[1] == 'stop': raise _sp.TimeoutExpired(cmd, 150)
    return real_run(cmd, *a, **k)
cs.subprocess.run = slow_run
n = len(read_posts()); cs.start('codex'); p = since(n)
cs.subprocess.run = real_run
ok('T14 handover order still the first post', 'OUTGOING' in text(p[0]))
ok('T14 the timed-out stop is reported to Kyle', any('timed out' in text(x) and '--notify' in x for x in p))

# T12 refusals
ok('T12 unknown session', raises(lambda: cs.session('Bob', True), 'unknown session'))
ok('T12 ack of a closed order', raises(lambda: cs.ack('S1', 'OLD Claude'), 'no open order'))

print(f'crew-switch tests: {P} passed, {F} failed')
shutil.rmtree(d, ignore_errors=True)
sys.exit(1 if F else 0)
