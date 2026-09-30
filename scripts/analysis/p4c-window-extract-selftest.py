#!/usr/bin/env python3
"""Self-test for `p4c-window-extract.py` — exercises the RESTART arm on a synthetic corpus (Langston Step-4 FINDING-2).

The closed window's only restart was its own start, which the `first_line` guard skips, so the exclusion arm
(`excluded`, `lost_touch`, `hours_excluded_by_restart`) had never run. Every later window will hold a restart (the held
deploy), so it is exercised here before it grades one. The EXPECTED output is stated below and in the plan (§C2.4)
BEFORE the first run (the two-clause rider on #744).

A synthetic instrument, one lane (`vts`), one symbol, 2 looks per pass, a pass every 10 minutes from 10:40Z to 15:00Z on
2026-01-05; window [10:30Z, 15:00Z). It flushes the previous hour's roll-up at the first pass of a new hour, exactly as
`XsVtsInstrument.beginPass` does, and a restart wipes its in-memory hour and roll-up.

CASE A — a restart at 12:25Z. EXPECTED: restarts_in_range = [12:25]; hours excluded BY NAME = {11:00, 12:00} (the restart's
  hour and the one before it — over-exclusive by design); touch_lost_at_restart = 6 (the 12:00, 12:10, 12:20 passes);
  hours graded = {13:00, 14:00} ⇒ 2 cells, 0 unequal; holds = true. Hour 10 is partial (starts before 10:40) ⇒ ungraded.
CASE B — the SAME corpus with the restart line removed from the PM2 log (the negative control: restart handling off).
  EXPECTED: 0 restarts, 0 excluded, the lost looks leak into hour 12 ⇒ hour 12 cell: sym 6, touch 12 ⇒ 1 unequal;
  holds = false. ⇒ the exclusion arm is what keeps a restarted hour from reading as a broken reader.
CASE C — a PM2 log whose first stamp is AFTER the window start. EXPECTED: exit 2, FATAL "does not reach the window start".
CASE D (S1, increment 3; stated before the first run) — the CASE-B corpus with the increment-3 fields on every pass line:
  `appliedLooks=2 refusedLive=1 live=[1,0,0,1,0,0,0] ageOver=[2,1,1,1,1]`. The window holds the passes 10:40 … 14:50 = 26
  lines (the 15:00:01 line is at/after the end). EXPECTED regular: looks 52, appliedLooks 52, refusedLive 26, share 0.5,
  bracket_own_window [26/52, 52/52] = [0.5, 1.0], live_by_reason ok 26 / too_old 26 / the rest 0, readable true.
  And CASE B's own S1 (lines WITHOUT the fields): readable false, share None — an old corpus never reads as a zero share.
"""
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
EXTRACT = os.path.join(HERE, 'p4c-window-extract.py')
START, END = '2026-01-05T10:30:00Z', '2026-01-05T15:00:00Z'
Z = timezone.utc
RESTART = datetime(2026, 1, 5, 12, 25, 0, tzinfo=Z)


def stamp(t):
    return t.strftime('%Y-%m-%d %H:%M:%S') + ' +00:00: '


def corpus(s1=False):
    lines, hour, count = [], None, 0
    extra = ' appliedLooks=2 refusedLive=1 live=[1,0,0,1,0,0,0]' if s1 else ''
    age = '[2,1,1,1,1]' if s1 else '[0,0,0,0,0]'
    t = datetime(2026, 1, 5, 10, 40, 0, tzinfo=Z)
    restarted = False
    while t <= datetime(2026, 1, 5, 15, 0, 0, tzinfo=Z):
        if not restarted and t > RESTART:
            hour, count, restarted = None, 0, True  # the process restart: in-memory hour + roll-up lost
        h = t.replace(minute=0, second=0)
        if hour is not None and h != hour:
            lines.append(stamp(t) + f'[8a-P4c][VTS_XS_SYM] lane=vts hour={hour:%Y-%m-%dT%H}Z session=regular symbol=AAA/USD '
                         f'looks={count} ageOver=[0,0,0,0,0] refused=[0,0,0,0,0]')
            count = 0
        hour = h
        count += 2
        lines.append(stamp(t + timedelta(seconds=1)) + '[8a-P4c][VTS_XS_TOUCH] lane=vts session=regular looks=2 '
                     f'ageOver={age} refused=[0,0,0,0,0]{extra}')
        t += timedelta(minutes=10)
    return lines


def run(pm2_lines, s1=False):
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, 'error__2026-01-06_00-00-00.log'), 'w') as f:
            f.write('\n'.join(corpus(s1)) + '\n')
        open(os.path.join(d, 'error.log'), 'w').close()
        pm2 = os.path.join(d, 'pm2.log')
        with open(pm2, 'w') as f:
            f.write('\n'.join(pm2_lines) + '\n')
        r = subprocess.run([sys.executable, EXTRACT, '--dir', d, '--pm2-log', pm2, '--start', START, '--end', END],
                           capture_output=True, text=True)
        return r.returncode, r.stdout, r.stderr


BOOT = '2026-01-01T00:00:00: PM2 log: App [dawntrader:0] starting in -fork mode-'
fails = []


def check(name, cond, got):
    print(('PASS ' if cond else 'FAIL ') + name + ' :: ' + str(got))
    if not cond:
        fails.append(name)


code, out, err = run([BOOT, RESTART.strftime('%Y-%m-%dT%H:%M:%S') + ': PM2 log: App [dawntrader:0] starting in -fork mode-'])
check('A exit 0', code == 0, (code, err[-200:]))
he = json.loads(out)['lanes']['vts']['hour_equality'] if code == 0 else {}
check('A restarts_in_range', code == 0 and json.loads(out)['restarts_in_range'] == ['2026-01-05T12:25:00+00:00'],
      json.loads(out)['restarts_in_range'] if code == 0 else None)
check('A excluded by name', he.get('hours_excluded_by_restart') == ['2026-01-05T11:00:00+00:00', '2026-01-05T12:00:00+00:00'],
      he.get('hours_excluded_by_restart'))
check('A touch lost at restart = 6', he.get('touch_lost_at_restart') == 6, he.get('touch_lost_at_restart'))
check('A graded 2 hours / 2 cells, 0 unequal, holds', (he.get('hours_graded'), he.get('cells_graded'), he.get('cells_unequal'),
      he.get('holds')) == (2, 2, 0, True), (he.get('hours_graded'), he.get('cells_graded'), he.get('cells_unequal'), he.get('holds')))

code, out, err = run([BOOT])
he = json.loads(out)['lanes']['vts']['hour_equality'] if code == 0 else {}
check('B exit 0', code == 0, (code, err[-200:]))
check('B nothing excluded', he.get('hours_excluded_by_restart') == [], he.get('hours_excluded_by_restart'))
check('B hour 12 unequal: sym 6 vs touch 12', he.get('first_mismatches') == [
    {'hour': '2026-01-05T12:00:00+00:00', 'session': 'regular', 'sym': 6, 'touch': 12}], he.get('first_mismatches'))
check('B does not hold', he.get('holds') is False, he.get('holds'))
s1b = json.loads(out)['lanes']['vts']['S1'].get('regular', {}) if code == 0 else {}
check('B S1 unreadable on lines without the fields (never a zero share)',
      (s1b.get('readable'), s1b.get('share'), s1b.get('live_by_reason')) == (False, None, None),
      (s1b.get('readable'), s1b.get('share'), s1b.get('live_by_reason')))

code, out, err = run([BOOT], s1=True)
s1d = json.loads(out)['lanes']['vts']['S1'].get('regular', {}) if code == 0 else {}
check('D exit 0', code == 0, (code, err[-200:]))
check('D S1 regular: 52 looks, 52 applied, 26 refused, share 0.5',
      (s1d.get('looks'), s1d.get('appliedLooks'), s1d.get('refusedLive'), s1d.get('share')) == (52, 52, 26, 0.5),
      (s1d.get('looks'), s1d.get('appliedLooks'), s1d.get('refusedLive'), s1d.get('share')))
check('D bracket from the window\'s own ageOver = [0.5, 1.0]; frozen published beside it',
      (s1d.get('bracket_own_window'), s1d.get('bracket_frozen')) == ([0.5, 1.0], [0.0044, 0.0232]),
      (s1d.get('bracket_own_window'), s1d.get('bracket_frozen')))
check('D live_by_reason: ok 26, too_old 26, the rest 0; readable',
      (s1d.get('live_by_reason'), s1d.get('readable')) == ({'ok': 26, 'no_row': 0, 'age_unknown': 0, 'too_old': 26,
                                                            'side_unusable': 0, 'too_wide': 0, 'knobs_unavailable': 0}, True),
      (s1d.get('live_by_reason'), s1d.get('readable')))

code, out, err = run(['2026-01-05T11:00:00: PM2 log: App [dawntrader:0] starting in -fork mode-'])
check('C exit 2 on a PM2 log that starts inside the window', code == 2 and 'does not reach the window start' in err,
      (code, err.strip()[-160:]))

print('SELFTEST ' + ('FAILED: ' + ', '.join(fails) if fails else 'OK — all expectations met'))
sys.exit(1 if fails else 0)
