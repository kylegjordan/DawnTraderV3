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
import gzip
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


# The rotation dated 01-05 ran at 00:01:40, so the dated-01-06 file's content starts then: a non-instrument line stamped
# 00:01:41 stands for that (the extractor skips non-instrument lines, so no count below moves). `head=False` drops it,
# leaving the first stamp at 10:40:01 — after START — which is the Step-4 r3 start-coverage case (CASE H).
HEAD = '2026-01-05 00:01:41 +00:00: [boot] unrelated process output'


def run(pm2_lines, s1=False, name='error__2026-01-06_00-00-00.log', extra=(), head=True, files=None, lines=None,
        live_lines=(), window=(START, END), sym_cut='hour', live_fragment=''):
    with tempfile.TemporaryDirectory() as d:
        src = corpus(s1) if lines is None else lines
        body = ('\n'.join(([HEAD] if head and lines is None else []) + src) + '\n').encode()
        if name:
            open_file = gzip.open if name.endswith('.gz') else open
            with open_file(os.path.join(d, name), 'wb') as f:
                f.write(body)
        for x in extra:  # further rotation files, empty: only their NAMES matter to the cases that use them
            open(os.path.join(d, x), 'w').close()
        for x, xl in (files or {}).items():  # further rotation files WITH content (CASE H-prepend)
            open_file = gzip.open if x.endswith('.gz') else open
            with open_file(os.path.join(d, x), 'wt', encoding='utf-8') as f:
                f.write('\n'.join(xl) + '\n')
        with open(os.path.join(d, 'error.log'), 'w', encoding='utf-8') as f:
            f.writelines(line + '\n' for line in live_lines)
            f.write(live_fragment)
        pm2 = os.path.join(d, 'pm2.log')
        with open(pm2, 'w') as f:
            f.write('\n'.join(pm2_lines) + '\n')
        r = subprocess.run([sys.executable, EXTRACT, '--dir', d, '--pm2-log', pm2,
                            '--start', window[0], '--end', window[1], '--sym-cut', sym_cut],
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

# B-DISK-FILE-TIERING P9 (stated before the first run): the system logrotate names a rotation with its real run instant
# and compresses it one rotation later. CASE E — CASE A's corpus as `error__2026-01-06_00-01-37.log.gz`: EXPECTED the same
# result as CASE A (exit 0, 2 cells, 0 unequal, holds). CASE F — CASE A's corpus plus a second rotation for the same day
# (`error__2026-01-06_13-00-00.log`): EXPECTED exit 2, FATAL "more than one rotation" (the day's content is split).
RS = RESTART.strftime('%Y-%m-%dT%H:%M:%S') + ': PM2 log: App [dawntrader:0] starting in -fork mode-'
code, out, err = run([BOOT, RS], name='error__2026-01-06_00-01-37.log.gz')
he = json.loads(out)['lanes'].get('vts', {}).get('hour_equality', {}) if code == 0 else {}  # no lane = the day was missed
check('E a real-time-named .gz rotation reads like CASE A', (code, he.get('cells_graded'), he.get('cells_unequal'),
      he.get('holds')) == (0, 2, 0, True), (code, he.get('cells_graded'), he.get('cells_unequal'), he.get('holds'), err[-200:]))
code, out, err = run([BOOT, RS], extra=('error__2026-01-06_13-00-00.log',))
# Step-4 r2 (ANALYST's pin): F is the CONSERVATIVE refusal — content day 01-05 is whole in the 00:00 file, the second
# dated-01-06 file is 01-06's first slice; it still refuses, and the message names the dated day 2026-01-06.
check('F exit 2 on two rotations dated C+1, naming 2026-01-06', code == 2 and 'more than one rotation is dated 2026-01-06'
      in err, (code, err.strip()[-200:]))

# B-DISK-FILE-TIERING P9, Step-4 r2 (Langston, stated before the first run): the measured asymmetric split. A size rotation
# at 14:00 on content day 01-05 leaves TWO rotations dated 01-05 (00:01:40 = 01-04, 14:00 = 01-05's first slice) and ONE
# dated 01-06 (01-05's tail, here the corpus). CASE G — EXPECTED exit 2, FATAL naming content day 2026-01-05 as split by
# the rotations dated 2026-01-05. The pre-fix predicate read the dated-01-06 file alone and graded 01-05's tail silently.
# CASE G0 (control) — the same with only the 00:01:40 rotation dated 01-05: EXPECTED the CASE-A result (exit 0, 2 cells,
# 0 unequal, holds), so G refuses on the second dated-C file and not on the presence of any dated-C file.
code, out, err = run([BOOT, RS], name='error__2026-01-06_00-01-40.log',
                     extra=('error__2026-01-05_00-01-40.log', 'error__2026-01-05_14-00-00.log'))
check('G exit 2 on two rotations dated C, naming content day 2026-01-05',
      code == 2 and 'content day 2026-01-05 is split' in err and 'more than one rotation is dated 2026-01-05' in err,
      (code, err.strip()[-200:]))
code, out, err = run([BOOT, RS], name='error__2026-01-06_00-01-40.log', extra=('error__2026-01-05_00-01-40.log',))
he = json.loads(out)['lanes'].get('vts', {}).get('hour_equality', {}) if code == 0 else {}
check('G0 one rotation dated C reads like CASE A', (code, he.get('cells_graded'), he.get('cells_unequal'),
      he.get('holds')) == (0, 2, 0, True), (code, he.get('cells_graded'), he.get('cells_unequal'), he.get('holds'), err[-200:]))

# B-DISK-FILE-TIERING P9, Step-4 r3 (Langston; every expectation stated here BEFORE the first run — the #744 rider). The
# rotation that closes day C-1 runs at the first timer pass after 00:00Z on C, so the file dated C holds C's first minutes;
# for the window's FIRST content day that file is not otherwise read. Every case uses CASE A's PM2 log ([BOOT, RS]).
# CASE H — `head=False` (the dated-01-06 file's first stamp is 10:40:01, after START 10:30:00) and no rotation dated 01-05.
#   EXPECTED exit 2, FATAL "window start 2026-01-05 10:30:00+00:00 is not covered", naming "no rotation dated 2026-01-05"
#   and the unread span "[2026-01-05 10:30:00+00:00, 2026-01-05 10:40:01+00:00)".
# CASE H-prepend — the same, plus `error__2026-01-05_10-40-00.log` (a catch-up rotation that ran at 10:40 on 01-05)
#   holding a non-instrument line at 2026-01-04 10:40:05 and ONE in-window touch line at 10:30:01 (looks=2). EXPECTED
#   exit 0; start_coverage = {first_source_head 2026-01-05T10:40:01+00:00, prepended that file}; files[0] is that file
#   with in_window 1; regular touch passes 27 (CASE A's 26 + 1); grading unchanged from CASE A (2 cells, 0 unequal,
#   holds) because the extra look falls in hour 10, which starts before START and is never graded.
# CASE H-stale — `head=False` plus an EMPTY `error__2026-01-05_00-01-40.log`. EXPECTED exit 2, "is not covered", naming
#   the span — a dated-day(START) rotation that does not itself reach START never reads as covering it.
# CASE H-empty — the dated-01-06 file holds only an unstamped line. EXPECTED exit 2, "holds no stamped line" — a source
#   that cannot show coverage refuses; it never reads as covered.
# CASE H-gap (Langston, r3 review — expectation written before the check existed) — `head=False` plus
#   `error__2026-01-05_00-01-40.log` holding 2026-01-04 00:01:45 and 2026-01-05 00:01:39 (head <= START, but content
#   stops before START: the intervening rotation that held [00:01:40, 10:40) is missing). EXPECTED exit 2, "is not
#   covered", "ends at 2026-01-05 00:01:39+00:00", "missing", naming the span. Narrow claim only: exact contiguity is not
#   decidable from content (a quiet log emits nothing); this stops a rotation whose content ends before START reading as
#   covering [START, head).
HS ='[2026-01-05 10:30:00+00:00, 2026-01-05 10:40:01+00:00)'
code, out, err = run([BOOT, RS], head=False)
check('H exit 2: start not covered, no rotation dated 2026-01-05, span named',
      code == 2 and 'window start 2026-01-05 10:30:00+00:00 is not covered' in err
      and 'no rotation dated 2026-01-05' in err and HS in err, (code, err.strip()[-260:]))
PRE = 'error__2026-01-05_10-40-00.log'
code, out, err = run([BOOT, RS], head=False, files={PRE: [
    '2026-01-04 10:40:05 +00:00: [boot] unrelated process output',
    '2026-01-05 10:30:01 +00:00: [8a-P4c][VTS_XS_TOUCH] lane=vts session=regular looks=2 ageOver=[0,0,0,0,0] refused=[0,0,0,0,0]']})
o = json.loads(out) if code == 0 else {}
he = o.get('lanes', {}).get('vts', {}).get('hour_equality', {})
check('H-prepend exit 0, prepended the dated-01-05 rotation', (code, o.get('start_coverage')) == (0, {
      'first_source_head': '2026-01-05T10:40:01+00:00', 'prepended': PRE}), (code, o.get('start_coverage'), err[-200:]))
check('H-prepend reads it first: files[0] in_window 1, regular passes 27',
      code == 0 and (o['files'][0]['file'], o['files'][0]['in_window'],
                     o['lanes']['vts']['touch_by_session']['regular']['passes']) == (PRE, 1, 27),
      (o['files'][0], o['lanes']['vts']['touch_by_session']['regular']['passes']) if code == 0 else None)
check('H-prepend grading unchanged from CASE A', (he.get('cells_graded'), he.get('cells_unequal'), he.get('holds'))
      == (2, 0, True), (he.get('cells_graded'), he.get('cells_unequal'), he.get('holds')))
code, out, err = run([BOOT, RS], head=False, extra=('error__2026-01-05_00-01-40.log',))
check('H-stale exit 2: a dated-day(START) rotation that starts after START does not cover it',
      code == 2 and 'is not covered' in err and HS in err, (code, err.strip()[-260:]))
code, out, err = run([BOOT, RS], lines=['no stamp on this line'])
check('H-empty exit 2: no stamped line refuses', code == 2 and 'holds no stamped line' in err, (code, err.strip()[-200:]))
code, out, err = run([BOOT, RS], head=False, files={'error__2026-01-05_00-01-40.log': [
    '2026-01-04 00:01:45 +00:00: [boot] unrelated process output',
    '2026-01-05 00:01:39 +00:00: [boot] unrelated process output']})
check('H-gap exit 2: a prepended rotation whose content ends before START does not cover it',
      code == 2 and 'is not covered' in err and 'ends at 2026-01-05 00:01:39+00:00' in err and 'missing' in err
      and HS in err, (code, err.strip()[-300:]))

# #1250: move an identical final-hour rollup between the three legitimate file layouts. A surviving UTC date stamp,
# a different lane's final rollup and this lane's later rollup must not stand in for the required final-hour evidence.
MIDNIGHT_WINDOW = ('2026-01-05T22:00:00Z', '2026-01-06T00:00:00Z')
MIDNIGHT_HEAD = '2026-01-05 21:59:59 +00:00: [boot] evidence starts before the window'
BOUNDARY_STAMP = '2026-01-06 00:00:01 +00:00: [boot] unrelated post-boundary line'
OPENING_STAMP = '2026-01-06 00:00:08 +00:00: [boot] first stamped line after the normal cut'
COMPLETE_STAMP = '2026-01-06 01:00:00 +00:00: [boot] attribution interval complete'
LATER_HEAD = '2026-01-07 00:01:00 +00:00: [boot] later live file'
BOUNDARY_ARCHIVE = 'error__2026-01-06_00-00-05.log'
LATE_ARCHIVE = 'error__2026-01-07_00-00-03.log.gz'
ZEROES = 'ageOver=[0,0,0,0,0] refused=[0,0,0,0,0]'


def midnight_touch(receipt, looks):
    return f'{receipt} +00:00: [8a-P4c][VTS_XS_TOUCH] lane=vts session=regular looks={looks} {ZEROES}'


def midnight_sym(receipt, hour, looks, lane='vts'):
    return (f'{receipt} +00:00: [8a-P4c][VTS_XS_SYM] lane={lane} hour={hour} session=regular '
            f'symbol=AAA/USD looks={looks} {ZEROES}')


EARLY_TOUCH = midnight_touch('2026-01-05 22:01:00', 4)
EARLY_ROLLUP = midnight_sym('2026-01-05 23:00:06', '2026-01-05T22Z', 4)
FINAL_TOUCH = midnight_touch('2026-01-05 23:02:00', 9)
FINAL_ROLLUP = midnight_sym('2026-01-06 00:00:06', '2026-01-05T23Z', 9)
COMPLETE_ROLLUP = [FINAL_ROLLUP, COMPLETE_STAMP]
COMPLETE_QUIET = [OPENING_STAMP, COMPLETE_STAMP]
PRE_BOUNDARY = [MIDNIGHT_HEAD, EARLY_TOUCH, EARLY_ROLLUP, FINAL_TOUCH, BOUNDARY_STAMP]


def check_midnight(name, result, expected_files, cells=2, gap=0):
    code, out, err = result
    if code == 0:
        report = json.loads(out)
        lane = report['lanes']['vts']
        equality = lane['hour_equality']
        got = (code, [f['file'] for f in report['files']], equality['hours_in_window'], equality['cells_graded'],
               equality['holds'], lane['looks_by_session']['regular']['touch_minus_sym'])
    else:
        got = (code, err.strip())
    check(name, got == (0, expected_files, cells, cells, True, gap), got)


check_midnight('M-live one unrotated file spans midnight',
               run([BOOT], name=None, live_lines=PRE_BOUNDARY + COMPLETE_ROLLUP, window=MIDNIGHT_WINDOW),
               ['error.log'])
check_midnight('M-delayed final rollup in the dated-END rotation',
               run([BOOT], name='error__2026-01-06_00-01-30.log', lines=PRE_BOUNDARY + [FINAL_ROLLUP],
                   live_lines=['2026-01-06 00:01:31 +00:00: [boot] delayed successor', COMPLETE_STAMP],
                   window=MIDNIGHT_WINDOW),
               ['error__2026-01-06_00-01-30.log', 'error.log'])
check_midnight('M-gzip final rollup in next-day archive',
               run([BOOT], name=BOUNDARY_ARCHIVE, lines=PRE_BOUNDARY, files={LATE_ARCHIVE: COMPLETE_ROLLUP},
                   live_lines=[LATER_HEAD], window=MIDNIGHT_WINDOW),
               [BOUNDARY_ARCHIVE, LATE_ARCHIVE, 'error.log'])
late_plain = LATE_ARCHIVE.removesuffix('.gz')
check_midnight('M-alias matching plain and gzip copies are read once',
               run([BOOT], name=BOUNDARY_ARCHIVE, lines=PRE_BOUNDARY,
                   files={late_plain: COMPLETE_ROLLUP, LATE_ARCHIVE: COMPLETE_ROLLUP},
                   live_lines=[LATER_HEAD], window=MIDNIGHT_WINDOW),
               [BOUNDARY_ARCHIVE, late_plain, 'error.log'])
check_midnight('M-stamp control keeps source coverage and exposes the nine-look selection gap',
               run([BOOT], name=BOUNDARY_ARCHIVE, lines=PRE_BOUNDARY, files={LATE_ARCHIVE: COMPLETE_ROLLUP},
                   live_lines=[LATER_HEAD], window=MIDNIGHT_WINDOW, sym_cut='stamp'),
               [BOUNDARY_ARCHIVE, LATE_ARCHIVE, 'error.log'], gap=9)

code, out, err = run([BOOT], name=BOUNDARY_ARCHIVE, lines=PRE_BOUNDARY,
                     live_lines=COMPLETE_QUIET, window=MIDNIGHT_WINDOW)
check('M-missing exit 2 with no output when a date stamp survives but the final rollup is lost',
      code == 2 and not out and 'final-hour rollup' in err and 'vts' in err, (code, bool(out), err.strip()))

shadow_final = midnight_sym('2026-01-06 00:00:06', '2026-01-05T23Z', 9, lane='shadow')
vts_next_hour = midnight_sym('2026-01-06 01:00:06', '2026-01-06T00Z', 9)
code, out, err = run([BOOT], name=BOUNDARY_ARCHIVE, lines=PRE_BOUNDARY,
                     live_lines=[shadow_final, vts_next_hour], window=MIDNIGHT_WINDOW)
check('M-wrong-rollups exit 2 with no output despite sibling-lane and later-hour rollups',
      code == 2 and not out and 'final-hour rollup' in err and 'vts' in err, (code, bool(out), err.strip()))

code, out, err = run([BOOT], name=BOUNDARY_ARCHIVE, lines=PRE_BOUNDARY,
                     files={LATE_ARCHIVE: [FINAL_ROLLUP]}, extra=('error__2026-01-07_01-00-00.log',),
                     live_lines=[LATER_HEAD], window=MIDNIGHT_WINDOW)
check('M-split exit 2 on multiple distinct next-day rotations',
      code == 2 and not out and 'more than one rotation is dated 2026-01-07' in err, (code, bool(out), err.strip()))

code, out, err = run([BOOT], name=None, files={LATE_ARCHIVE: [FINAL_ROLLUP]},
                     live_lines=[LATER_HEAD], window=MIDNIGHT_WINDOW)
check('M-missing-window refuses the lost in-window day even when the following archive is present',
      code == 2 and not out and 'required in-window rotation dated 2026-01-06 is missing' in err,
      (code, bool(out), err.strip()))

midnight_restart = '2026-01-06T00:00:03: PM2 log: App [dawntrader:0] starting in -fork mode-'
check_midnight('M-restart exclusion legitimately needs no final rollup',
               run([BOOT, midnight_restart], name=BOUNDARY_ARCHIVE, lines=PRE_BOUNDARY,
                   live_lines=COMPLETE_QUIET, window=MIDNIGHT_WINDOW),
               [BOUNDARY_ARCHIVE, 'error.log'], cells=1, gap=9)
check_midnight('M-quiet earlier activity does not require a final rollup',
               run([BOOT], name=BOUNDARY_ARCHIVE, lines=[MIDNIGHT_HEAD, EARLY_TOUCH, EARLY_ROLLUP, BOUNDARY_STAMP],
                   live_lines=COMPLETE_QUIET, window=MIDNIGHT_WINDOW),
               [BOUNDARY_ARCHIVE, 'error.log'], cells=1)
straddled = midnight_touch('2026-01-05 23:00:02', 4)
check_midnight('M-straddle earlier pass stamped in final hour is attributed to its earlier flush',
               run([BOOT], name=BOUNDARY_ARCHIVE, lines=[MIDNIGHT_HEAD, straddled, EARLY_ROLLUP, BOUNDARY_STAMP],
                   live_lines=COMPLETE_QUIET, window=MIDNIGHT_WINDOW),
               [BOUNDARY_ARCHIVE, 'error.log'], cells=1)


def check_midnight_refusal(name, result, reason='midnight source coverage missing'):
    code, out, err = result
    check(name, code == 2 and not out and reason in err, (code, bool(out), err.strip()))


# Only after the selected source finishes the first hour can a late TOUCH be attributed. March the same snapshot
# through an early prefix, a completed source with unresolved activity, and restored final-hour evidence.
pre_quiet = [MIDNIGHT_HEAD, EARLY_TOUCH, EARLY_ROLLUP, BOUNDARY_STAMP]
late_touch = midnight_touch('2026-01-06 00:00:09', 9)
late_rollup = midnight_sym('2026-01-06 00:00:12', '2026-01-05T23Z', 9)


def run_opening(lines, **kwargs):
    return run([BOOT], name=BOUNDARY_ARCHIVE, lines=pre_quiet, live_lines=lines, window=MIDNIGHT_WINDOW, **kwargs)


check_midnight_refusal('R5 early snapshot without a completed first hour', run_opening([OPENING_STAMP]))
check_midnight_refusal('R5 an unterminated cutoff line cannot prove the hour',
                       run_opening([OPENING_STAMP], live_fragment=COMPLETE_STAMP))
check_midnight_refusal('R5 late TOUCH with source coverage still needs its own lane rollup',
                       run_opening([OPENING_STAMP, late_touch, COMPLETE_STAMP]), 'final-hour rollup missing for vts')
check_midnight('R5 the exact late rollup restores both cells with a minus-nine stamp gap',
               run_opening([OPENING_STAMP, late_touch, late_rollup, COMPLETE_STAMP]),
               [BOUNDARY_ARCHIVE, 'error.log'], gap=-9)
after_rollup = midnight_touch('2026-01-06 00:00:14', 3)
check_midnight('R5 late activity after its own final rollup does not change the previous hour',
               run_opening([OPENING_STAMP, late_touch, late_rollup, after_rollup, COMPLETE_STAMP]),
               [BOUNDARY_ARCHIVE, 'error.log'], gap=-9)

same_day_tail = ['2026-01-06 14:00:01 +00:00: [boot] surviving size-rotated tail']
check_midnight_refusal('R5 later same-day live tail cannot stand in for missing opening slice', run_opening(same_day_tail))
check_midnight_refusal('R5 identical later same-day gzip tail cannot supply opening coverage',
                       run_opening([LATER_HEAD], files={LATE_ARCHIVE: same_day_tail}))
size_cut = 'error__2026-01-06_14-00-00.log.gz'
check_midnight_refusal('R5 restored size slice exposes the explicit split rather than grading only the tail',
                       run_opening(same_day_tail, files={size_cut: [OPENING_STAMP, late_touch, late_rollup, COMPLETE_STAMP]}),
                       'more than one rotation is dated 2026-01-06')
check_midnight('R5 intact live file with the same late records grades both cells',
               run([BOOT], name=None, live_lines=pre_quiet + [late_touch, late_rollup, COMPLETE_STAMP],
                   window=MIDNIGHT_WINDOW), ['error.log'], gap=-9)

# Use a multi-day report so the independent start-coverage check does not decide the missing END archive case.
previous_day = 'error__2026-01-05_00-00-05.log.gz'
window = ('2026-01-04T23:00:00Z', MIDNIGHT_WINDOW[1])
earlier_archives = {previous_day: [
    '2026-01-04 22:59:59 +00:00: [boot] start coverage',
    midnight_touch('2026-01-04 23:01:00', 4),
    midnight_sym('2026-01-05 00:00:01', '2026-01-04T23Z', 4),
]}
same_second_cut = 'error__2026-01-06_00-00-00.log'
same_second_head = '2026-01-06 00:00:00 +00:00: [boot] successor in rotation second'
same_second_live = [same_second_head, COMPLETE_STAMP]
head_before_rollover = [MIDNIGHT_HEAD, midnight_touch('2026-01-06 00:00:00', 9),
                        midnight_sym('2026-01-06 00:00:00', '2026-01-05T23Z', 9)]
check_midnight_refusal('R5 same-second successor without its END archive is unreadable',
                       run([BOOT], name=None, files=earlier_archives,
                           live_lines=same_second_live, window=window))
check_midnight('R5 restored END archive permits successor equality at the stamped cut',
               run([BOOT], name=same_second_cut, files=earlier_archives, lines=head_before_rollover,
                   live_lines=same_second_live, window=window),
               [previous_day, same_second_cut, 'error.log'], gap=-9)
check_midnight('R5 one file starting strictly before END needs no artificial pair',
               run([BOOT], name=None, files=earlier_archives, live_lines=head_before_rollover + same_second_live,
                   window=window), [previous_day, 'error.log'], gap=-9)
check_midnight_refusal('R5 successor starting before the predecessor tail is reversed',
                       run([BOOT], name=same_second_cut, files=earlier_archives,
                           lines=head_before_rollover + [OPENING_STAMP], live_lines=same_second_live, window=window))

print('SELFTEST ' + ('FAILED: ' + ', '.join(fails) if fails else 'OK — all expectations met'))
sys.exit(1 if fails else 0)
