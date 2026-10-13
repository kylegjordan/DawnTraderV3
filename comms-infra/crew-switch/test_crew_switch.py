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
cs.STATE = os.path.join(d, 'state', 'state.json'); cs.MODE_FILE = os.path.join(d, 'crew-mode.env')
cs.CC_SEND = fake; cs.INBOX = os.path.join(d, 'inbox.jsonl'); cs.KYLE_ENV = os.path.join(d, 'k.env')
open(cs.KYLE_ENV, 'w').write('KYLE_DISCORD_ID=42\n')

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
ok('T3 mode codex', st['mode'] == 'codex' and 'CREW=codex' in open(cs.MODE_FILE).read())
ok('T3 two posts', len(p) == 2)
ok('T3 outgoing order names all four Claude sessions', all(n in p[0][3] for n in cs.CREWS['claude']) and 'OUTGOING' in p[0][3])
ok('T3 on-duty notice names all four Codex sessions + Coltrane', all(n in p[1][3] for n in cs.CREWS['codex'] + ['Coltrane']))
ok('T3 a second start is refused while open', raises(lambda: cs.start('claude'), 'still open'))

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

# T7 already on the target: no switch, one 'already' post
st['switch']['complete'] = True; cs.save(st); n2 = len(read_posts()); cs.start('claude')
ok('T7 already-on posts once, no new switch', len(read_posts()) == n2 + 1 and cs.load()['seq'] == 2)

print(f'crew-switch tests: {P} passed, {F} failed')
sys.exit(1 if F else 0)
