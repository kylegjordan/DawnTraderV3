#!/usr/bin/env python3
"""Offline tests for crew-switch.py (B-CODEX-FAILOVER #1192). Linux only (fcntl). Runs in a temp dir with a fake
cc-send that records every post — nothing reaches Discord. Run: python3 test_crew_switch.py"""
import importlib.util, json, os, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('cs', os.path.join(HERE, 'crew-switch.py'))
cs = importlib.util.module_from_spec(spec); spec.loader.exec_module(cs)

d = tempfile.mkdtemp(); os.chmod(d, 0o700)
posts = os.path.join(d, 'posts.jsonl')
fake = os.path.join(d, 'cc-send')
with open(fake, 'w') as f:
    f.write('#!/usr/bin/env python3\nimport json,sys\nopen(%r,"a").write(json.dumps(sys.argv[1:])+"\\n")\n' % posts)
os.chmod(fake, 0o700)
cs.STATE = os.path.join(d, 'state', 'state.json')
cs.CC_SEND = fake; cs.INBOX = os.path.join(d, 'inbox.jsonl'); cs.KYLE_ENV = os.path.join(d, 'k.env')
open(cs.KYLE_ENV, 'w').write('KYLE_DISCORD_ID=42\n')
# A FAKE systemctl: start -> active, stop -> inactive, is-active prints the state. ⛔ The real one must NEVER run
# under test: a first draft of this file missed the fake and the suite stopped and disabled Langston's LIVE bridge on
# 2026-10-13 (restored within ~20 s). So the guard below refuses to run at all unless the fake is in place.
sysd = os.path.join(d, 'unit-state'); open(sysd, 'w').write('active')
fsc = os.path.join(d, 'systemctl')
GOOD_SC = '#!/bin/sh\nS=%s\ncase "$1" in start) echo active > $S;; stop) echo inactive > $S;; is-active) cat $S;; esac\nexit 0\n' % sysd
open(fsc, 'w').write(GOOD_SC); os.chmod(fsc, 0o700)
cs.SYSTEMCTL = fsc
assert cs.SYSTEMCTL.startswith(d), 'REFUSING TO RUN: the real systemctl would be called'

P = F = 0
def ok(name, cond):
    global P, F
    if cond: P += 1
    else: F += 1; print('  FAIL:', name)
def read_posts():
    return [json.loads(l) for l in open(posts)] if os.path.exists(posts) else []
def raises(fn, needle):
    try: fn(); return False
    except SystemExit as e: return needle in str(e)

# T1 trigger: exact phrase, either crew, punctuation and case tolerant; anything else ignored
for t, want in [('SWITCH TO CODEX', 'codex'), ('switch to claude.', 'claude'), ('Switch the crew over to Codex!', 'codex'),
                ('  switch to codex  ', 'codex')]:
    m = cs.TRIGGER.match(t.strip()); ok(f'T1 trigger {t!r}', bool(m) and m.group(1).lower() == want)
for t in ['should we switch to codex?', 'switch to codex tomorrow', 'Langston, switch to codex', 'switch to gemini']:
    ok(f'T1 non-trigger {t!r}', not cs.TRIGGER.match(t))

# T2 aliases: both word orders, case-insensitive, never cross-crew
ok('T2 codex old', cs.ALIASES['codex old'] == 'OLD Codex'); ok('T2 old codex', cs.ALIASES['old codex'] == 'OLD Codex')
ok('T2 claude infra', cs.ALIASES['claude infra'] == 'Infra Claude'); ok('T2 analyst-codex', cs.ALIASES['analyst-codex'] == 'ANALYST Codex')

# T3 start to codex: mode written, two posts naming every outgoing and incoming session
cs.start('codex'); st = cs.load(); p = read_posts()
ok('T3 mode codex (one record, state.json)', st['mode'] == 'codex' and not hasattr(cs, 'MODE_FILE'))
ok('T3 three posts (Langston state, order, on-duty)', len(p) == 3)
ok('T3 Langston OFF, read back', open(sysd).read().strip() == 'inactive' and 'Langston is OFF' in p[0][3])
p = p[1:]
ok('T3 outgoing order names all four Claude sessions', all(n in p[0][3] for n in cs.CREWS['claude']) and 'OUTGOING' in p[0][3])
ok('T3 on-duty notice names all four Codex sessions + Coltrane', all(n in p[1][3] for n in cs.CREWS['codex'] + ['Coltrane']))

# T4 acks: unknown name and wrong id refused; reversed name accepted; incoming does not complete
ok('T4 unknown name', raises(lambda: cs.ack('S1', 'Bob'), 'unknown name'))
ok('T4 wrong id', raises(lambda: cs.ack('S9', 'OLD Claude'), 'no open switch'))
cs.ack('S1', 'Codex Old')
ok('T4 incoming ack does not complete', not cs.load()['switch']['complete'])
for n in ['Claude Old', 'new claude', 'ANALYST CLAUDE']: cs.ack('S1', n)
ok('T4 three of four outgoing: still open', not cs.load()['switch']['complete'])

# T5 nag: not before 15 min; then names ONLY the missing session and pings Kyle; not again within the hour
n0 = len(read_posts()); cs.nag(); ok('T5 no nag before 15 min', len(read_posts()) == n0)
st = cs.load(); st['switch']['started_t'] -= 16 * 60; cs.save(st); cs.nag(); p = read_posts()[n0:]
ok('T5 nag posts twice (crew + Kyle)', len(p) == 2)
ok('T5 nag names only Infra Claude', 'Infra Claude' in p[0][3] and 'OLD Claude' not in p[0][3])
ok('T5 Kyle ping carries --notify', '--notify' in p[1])
n1 = len(read_posts()); cs.nag(); ok('T5 no second nag within the hour', len(read_posts()) == n1)

# T6 last outgoing ack completes the switch and notifies Kyle; then switching back works
cs.ack('S1', 'infra claude'); st = cs.load(); p = read_posts()
ok('T6 complete', st['switch']['complete'] is True)
ok('T6 completion notifies Kyle', '--notify' in p[-1] and 'COMPLETE' in p[-1][3])
cs.start('claude'); st = cs.load()
ok('T6 back to claude: outgoing is the Codex crew', st['switch']['outgoing'] == cs.CREWS['codex'] and st['mode'] == 'claude')
ok('T6 Langston ON again, read back', open(sysd).read().strip() == 'active')

# T7 already on the target: no switch, one 'already' post
st['switch']['complete'] = True; cs.save(st); n2 = len(read_posts()); cs.start('claude')
ok('T7 already-on posts once, no new switch', len(read_posts()) == n2 + 1 and cs.load()['seq'] == 2)

# T8 B2: a new switch SUPERSEDES an open one (no deadlock), naming who never confirmed
st = cs.load(); st['switch']['complete'] = True; st['mode'] = 'claude'; cs.save(st)
cs.start('codex'); s3 = cs.load()['switch']['id']; cs.ack(s3, 'OLD Claude')
n3 = len(read_posts()); cs.start('claude'); st = cs.load(); p = read_posts()[n3:]
old = [h for h in st['history'] if h['id'] == s3][-1]
ok('T8 superseded, not refused', old['closed_as'] == 'superseded' and st['switch']['id'] != s3 and st['mode'] == 'claude')
ok('T8 names who never confirmed', set(old['never_confirmed']) == {'NEW Claude', 'ANALYST Claude', 'Infra Claude'} and any('SUPERSEDED' in x[3] for x in p))

# T9 B2: after 24 h unconfirmed, nag closes it EXPIRED and tells Kyle once; then nags no more
st = cs.load(); st['switch']['started_t'] -= 25 * 3600; cs.save(st); n4 = len(read_posts()); cs.nag(); p = read_posts()[n4:]
ok('T9 expired', cs.load()['switch']['closed_as'] == 'expired' and len(p) == 1 and '--notify' in p[0] and 'EXPIRED' in p[0][3])
n5 = len(read_posts()); cs.nag(); ok('T9 no nag after expiry', len(read_posts()) == n5)

# T10 B1: a failing cc-send never kills the watcher's dispatch, and a near-miss gets a reply
bad = os.path.join(d, 'cc-send-bad'); open(bad, 'w').write('#!/bin/sh\nexit 1\n'); os.chmod(bad, 0o700)
good = cs.CC_SEND; cs.CC_SEND = bad
try: cs.safe('start', 'codex'); survived = True
except BaseException: survived = False
ok('T10 safe() survives a failing post', survived)
cs.CC_SEND = good; n6 = len(read_posts()); cs.safe('near', 'Langston, switch to codex please')
ok('T10 near-miss posts a not-acted-on note to Kyle', len(read_posts()) == n6 + 1 and 'did NOT act' in read_posts()[-1][3])
ok('T10 NEAR matches an addressed sentence, TRIGGER does not', bool(cs.NEAR.search('Langston, switch to codex')) and not cs.TRIGGER.match('Langston, switch to codex'))

# T12 a systemctl that cannot stop Langston is reported to Kyle, never assumed
open(fsc, 'w').write('#!/bin/sh\ncase "$1" in is-active) echo active;; esac\nexit 0\n')
st = cs.load(); st['switch']['complete'] = True; st['mode'] = 'claude'; cs.save(st); n7 = len(read_posts()); cs.start('codex')
p = read_posts()[n7:]
ok('T12 failed stop -> Kyle told, with the read-back state', any('--notify' in x and 'should be OFF' in x[3] and '`active`' in x[3] for x in p))
open(fsc, 'w').write(GOOD_SC)

# T11 B1: watch advances the offset BEFORE dispatching (a failed dispatch cannot replay)
open(cs.INBOX, 'w').write(json.dumps({'author_id': 42, 'source': 'discord-cc-bridge', 'kind': '', 'text': 'switch to codex'}) + '\n')
st = cs.load(); st['inbox_offset'] = 0; st['switch']['complete'] = True; cs.save(st); cs.CC_SEND = bad
import threading
th = threading.Thread(target=cs.watch, daemon=True); th.start(); time.sleep(3)
ok('T11 offset advanced past the line despite the failing post', cs.load()['inbox_offset'] == os.path.getsize(cs.INBOX))
ok('T11 the watcher thread is still alive', th.is_alive())
cs.CC_SEND = good

print(f'crew-switch tests: {P} passed, {F} failed')
import shutil; shutil.rmtree(d, ignore_errors=True)   # Langston: 'removed after' is now in the file
sys.exit(1 if F else 0)
