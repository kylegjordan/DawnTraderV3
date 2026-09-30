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


def corpus():
    lines, hour, count = [], None, 0
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
                     'ageOver=[0,0,0,0,0] refused=[0,0,0,0,0]')
        t += timedelta(minutes=10)
    return lines


def run(pm2_lines):
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, 'error__2026-01-06_00-00-00.log'), 'w') as f:
            f.write('\n'.join(corpus()) + '\n')
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

code, out, err = run(['2026-01-05T11:00:00: PM2 log: App [dawntrader:0] starting in -fork mode-'])
check('C exit 2 on a PM2 log that starts inside the window', code == 2 and 'does not reach the window start' in err,
      (code, err.strip()[-160:]))

print('SELFTEST ' + ('FAILED: ' + ', '.join(fails) if fails else 'OK — all expectations met'))
sys.exit(1 if fails else 0)
