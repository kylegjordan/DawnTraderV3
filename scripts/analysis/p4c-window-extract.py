#!/usr/bin/env python3
"""`B-PRICE-SIDE-BY-JOB` row `8a-P4c` — the window-close extract (plan §B4 + §C2 P6b; progress report §9.1, §9.6-§9.8).

Reads the VTS xStock decision-quote instrument's lines from PM2's `error.log` rotations and prints the pre-registered
readings per lane (rules A and B, the symbol floor) plus the controls that make those readings trustworthy.

TWO LINE KINDS, TWO CUTS — the difference is the point of increment 2's fix (Langston §9.8 correction 1):
  * `[8a-P4c][VTS_XS_TOUCH]` — one per resolve pass, emitted at the END of the pass ⇒ cut on its OWN timestamp.
  * `[8a-P4c][VTS_XS_SYM]`   — the per-(session, symbol) roll-up for an hour, flushed at the FIRST pass of the NEXT
    hour ⇒ its timestamp is ~5 s after the hour it describes. It is cut on its `hour=` field: inside the window
    ⇔ the hour it DESCRIBES overlaps [start, end). `--sym-cut stamp` restores the old (wrong) stamp cut, which is the
    NEGATIVE CONTROL: on the closed window it must reproduce the after-session gap vts 8,638 / shadow 6,825 exactly.

CONTROLS (Langston Step-2 BLOCKER-1 + CONDITION-2, 2026-09-30):
  (a) the negative control above — if the old cut does not reproduce the known gap, this script is not reading the
      corpus the original read did, and any equality below means nothing;
  (b) every rotation the date range requires is ENUMERATED and must OPEN — a missing or unreadable file is fatal, not a
      zero; `.gz` is opened explicitly; per-file line counts are printed;
  (c) the per-session look totals are published on both lanes — a zero-n segment is UNREADABLE, never "equal";
  (d) per-HOUR equality, SYM looks == TOUCH looks for every (lane, hour, session), over UNRESTARTED hours. TOUCH lines
      are assigned to an hour by STREAM ORDER (a lane's TOUCH lines before its flush of hour H belong to H), so a pass
      that straddles an hour boundary is counted where its looks were recorded. A PM2 restart drops the in-memory partial
      hour (`flushSymbols` runs only from `beginPass` on an hour change), so an hour holding a restart after the lane's
      first line is EXCLUDED BY NAME, with its count published. The predicate is fixed here; it is not relaxed at run time.

S1 (increment 3, plan §C3.7-§C3.8, pre-registered): per lane and session, `refusedLive / appliedLooks` from the LIVE
guard's own reasons (the pass line's `appliedLooks`, `refusedLive`, `live=[…]`, emitted from `93c6ed052`), judged against
the bracket re-derived from the window's OWN `ageOver` at 300 s and 15 s, with the frozen [0.44%, 2.32%] published beside
it. A window whose lines predate those fields reads `readable: false` — never a zero share.

Usage on staging (as root or deploy):
  python3 - [--dir /var/log/dawntrader] [--pm2-log /home/deploy/.pm2/pm2.log] [--sym-cut hour|stamp] < p4c-window-extract.py
Exit status: 0 = ran, controls reported (read them); 2 = a required input could not be read (nothing is printed as a result).
"""
import argparse
import glob
import gzip
import json
import os
import re
import sys
from contextlib import contextmanager
from datetime import datetime, time, timedelta, timezone

ap = argparse.ArgumentParser()
ap.add_argument('--dir', default='/var/log/dawntrader')
ap.add_argument('--pm2-log', default='/home/deploy/.pm2/pm2.log')
ap.add_argument('--start', default='2026-09-22T14:38:49.748Z')  # the instrument's deploy (progress report §9.1)
ap.add_argument('--end', default='2026-09-30T00:00:00.000Z')
ap.add_argument('--sym-cut', choices=['hour', 'stamp'], default='hour')
args = ap.parse_args()


def iso(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).astimezone(timezone.utc)


START, END = iso(args.start), iso(args.end)
START_S = START.replace(microsecond=0)  # line stamps have second resolution; the first pass ran 14:39:53Z
CANDS = [15, 30, 60, 120, 300]
LIVE_REASONS = ['ok', 'no_row', 'age_unknown', 'too_old', 'side_unusable', 'too_wide', 'knobs_unavailable']  # XS_LIVE_REASONS
S1_FROZEN_BRACKET = [0.0044, 0.0232]
TS = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \+00:00: ')
KV = re.compile(r'(\w+)=(\[[^\]]*\]|\S+)')
HOUR = timedelta(hours=1)
MIDNIGHT_FINAL_HOUR = END - HOUR if END.time() == time.min else None


def die(msg):
    print(f'FATAL: {msg}', file=sys.stderr)
    sys.exit(2)


def val(v):
    if v.startswith('['):
        return [int(x) for x in v[1:-1].split(',') if x != '']
    try:
        return int(v)
    except ValueError:
        return v


# ── (b) the rotations this range REQUIRES. `error__<D>_<HH-MM-SS>.log` is rotated at the first run after D 00:00Z and
# holds day D-1 (content day C is read from the rotation dated C+1), so the window needs the rotations dated
# day(start)+1 .. last_content+1, where last_content = day(end - 1 µs). The last one may not exist yet, in which case the
# live `error.log` holds it. A midnight END can put the last hour's rollup into the next content day's archive after that
# day rotates. Include that source separately, so one live file can still cover both days before the first rotation.
# B-DISK-FILE-TIERING P9: pm2-logrotate named every rotation `_00-00-00`; the system logrotate that replaced it names it
# with the real run instant and compresses it one rotation later (.log -> .log.gz). So a day is found by a date glob,
# keyed by its base name (.gz stripped, the plain file preferred while both exist).
# A SPLIT IS OF THE CONTENT DAY, NOT THE NAME DATE (Langston, Step-4 r2, measured on logrotate 3.21.0): a size-triggered
# rotation during content day C, at say 14:00, leaves TWO rotations dated C (the 00:0x one holding C-1, the 14:00 one
# holding C's first slice) and ONE dated C+1 (C's tail). Keyed on the name date alone, a window needing C read only the
# dated-C+1 file and silently got C's tail. So, for every content day C in the window: refuse when more than one
# rotation is dated C (C's head sits in a sub-daily rotation this window does not read), and refuse when more than one
# is dated C+1. The second check is CONSERVATIVE: it also refuses a whole C whose 00:0x source is complete, because the
# second dated-C+1 file is C+1's first slice. It refuses, never misreads; the selftest pins that behaviour (CASE F).
def bases(day):
    hits = glob.glob(os.path.join(args.dir, f'error__{day:%Y-%m-%d}_*.log')) + \
        glob.glob(os.path.join(args.dir, f'error__{day:%Y-%m-%d}_*.log.gz'))
    return sorted({h[:-3] if h.endswith('.gz') else h for h in hits})


def names(bs):
    return [os.path.basename(b) for b in bs]


required = []
live = os.path.join(args.dir, 'error.log')
c = START.date()
last_content = (END - timedelta(microseconds=1)).date()
while c <= last_content:
    nxt = c + timedelta(days=1)
    dated_c, dated_next = bases(c), bases(nxt)
    if len(dated_c) > 1:
        die(f'content day {c} is split: more than one rotation is dated {c} in {args.dir}: {names(dated_c)} — a '
            f'sub-daily rotation holds the first slice of {c}, which this window would not read')
    if len(dated_next) > 1:
        die(f'content day {c} is split: more than one rotation is dated {nxt} in {args.dir}: {names(dated_next)} — '
            f'refused rather than read part of {c}')
    if dated_next:
        p = dated_next[0] if os.path.exists(dated_next[0]) else dated_next[0] + '.gz'
    elif c == last_content and os.path.exists(live):
        p = live
    else:
        die(f'required rotation for {nxt} (content day {c}) is missing in {args.dir} (neither .log nor .log.gz)')
    required.append(p)
    c = nxt
if MIDNIGHT_FINAL_HOUR is not None:
    # The in-window loop already rejected competing rotations dated END. Apply the same split rule to END+1.
    midnight_predecessor = required[-1]
    midnight_successor = live
    following_day = END.date() + timedelta(days=1)
    following = bases(following_day)
    if len(following) > 1:
        die(f'content day {END.date()} is split: more than one rotation is dated {following_day} in {args.dir}: '
            f'{names(following)} — refused rather than read part of the midnight rollup source')
    if following:
        if live in required:
            die(f'required in-window rotation dated {END.date()} is missing in {args.dir}; '
                f'live cannot replace it after the {following_day} rotation')
        archived = following[0]
        midnight_successor = archived if os.path.exists(archived) else archived + '.gz'
        required.append(midnight_successor)
if live not in required:
    if not os.path.exists(live):
        die(f'{live} missing — it holds the flush of the window\'s final hour')
    required.append(live)


@contextmanager
def open_log(p):
    try:
        reader = gzip.open if p.endswith('.gz') else open
        with reader(p, 'rt', errors='replace') as fh:
            yield fh
    except (OSError, EOFError) as e:
        die(f'cannot read {p}: {e}')


# ── (b, continued) the window's FIRST content day is covered from START, judged on CONTENT (Langston, Step-4 r3).
# The rotation that closes day C-1 runs at the first timer pass after 00:00Z (RandomizedDelaySec, and unbounded after a
# Persistent=true catch-up), so the file dated C — not read for content day C — holds C's first minutes. For an INTERIOR
# day that file is already in the set (as C-1's source) and its lines are cut on their own stamps; for the window's FIRST
# day it is not. So: if the first stamped line of the first source is later than START, prepend the rotation dated
# day(START) (at most one exists — the split check above refused two) and require ITS first stamp to be at or before
# START; with no such rotation (never written, or aged out), refuse and name the unread span. A source holding no stamped
# line at all cannot show coverage and refuses — it never reads as covered. No delay constant appears here.
def first_stamp(p):
    with open_log(p) as fh:
        for line in fh:
            m = TS.match(line)
            if m:
                return datetime.strptime(m.group(1), '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
    return None


# Langston, r3 review: the prepended rotation's TAIL must reach START too. A rotation dated day(START) whose content stops
# before START (the intervening rotation deleted, moved, or lost to a one-time gzip or a restore) would otherwise read as
# covering [START, head). Narrow claim: exact contiguity is not decidable from content (a quiet log emits nothing).
def last_stamp(p):
    last = None
    with open_log(p) as fh:
        for line in fh:
            m = TS.match(line)
            if m:
                last = m.group(1)
    return datetime.strptime(last, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc) if last else None


head = first_stamp(required[0])
if head is None:
    die(f'{required[0]} holds no stamped line, so it cannot show the window start {START_S} is covered')
prepended = None
if head > START_S:
    dated_start = bases(START.date())
    if not dated_start:
        die(f'window start {START_S} is not covered: the first stamped line of {os.path.basename(required[0])} is {head}, '
            f'and no rotation dated {START.date()} exists in {args.dir} — the span [{START_S}, {head}) would go unread')
    prepended = dated_start[0] if os.path.exists(dated_start[0]) else dated_start[0] + '.gz'
    phead = first_stamp(prepended)
    if phead is None or phead > START_S:
        die(f'window start {START_S} is not covered: {os.path.basename(prepended)} starts at {phead} and '
            f'{os.path.basename(required[0])} at {head} — the span [{START_S}, {head}) would go unread')
    ptail = last_stamp(prepended)
    if ptail is not None and ptail < START_S:
        die(f'window start {START_S} is not covered: {os.path.basename(prepended)} ends at {ptail}, before the window '
            f'start, and {os.path.basename(required[0])} starts at {head} — a rotation between them is missing, so the '
            f'span [{START_S}, {head}) would go unread')
    required.insert(0, prepended)


# ── restarts: PM2's own record. Only a restart AFTER a lane's first instrument line can cut an hour short.
# Step-4 FINDING-3 (Langston): the restart source's REACH is asserted, not assumed — its first stamp must be at or before
# the window start, or a zero restart count is unreadable (the log could simply not go back that far).
restarts = []
pm2_first = None
pm2_starting_total = 0
if not os.path.exists(args.pm2_log):
    die(f'{args.pm2_log} missing — restarts cannot be enumerated, so hour-equality cannot be graded')
PM2_STAMP = re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}): ')
with open_log(args.pm2_log) as fh:
    for line in fh:
        if pm2_first is None:
            m0 = PM2_STAMP.match(line)
            if m0:
                pm2_first = datetime.fromisoformat(m0.group(1)).replace(tzinfo=timezone.utc)
        m = re.match(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}): PM2 log: App \[dawntrader:\d+\] starting', line)
        if m:
            pm2_starting_total += 1
            t = datetime.fromisoformat(m.group(1)).replace(tzinfo=timezone.utc)
            if START_S <= t < END + HOUR:
                restarts.append(t)
restarts.sort()
if pm2_first is None or pm2_first > START_S:
    die(f'{args.pm2_log} does not reach the window start (first stamp {pm2_first}, start {START_S}) — a zero restart '
        'count would be unreadable')

touch, sym = {}, {}
per_file = []
bad = 0
first_ts = last_ts = None
# (d) stream-order hour attribution, per lane
pend = {}          # lane -> {session: looks} since the lane's last flush
cur_flush = {}     # lane -> hour (datetime) of the flush block being read
touch_by_hour = {}  # (lane, hour, session) -> looks
sym_by_hour = {}   # (lane, hour, session) -> looks
first_line = {}    # lane -> first instrument-line stamp
excluded = set()   # (lane, hour) excluded by a restart
lost_touch = {}    # lane -> looks attributed to no hour (pending at a restart)
final_hour_looks = set()    # lane with positive in-window looks not assigned to a preceding hour
late_hour_looks = set()     # positive TOUCH in the boundary attribution interval may describe the final hour
final_hour_rollups = set()  # lanes whose exact final-hour rollup was read, independent of the optional stamp cut
midnight_source_bounds = {} # first/last complete stamped lines in the actual read of each boundary source
ri = 0


def apply_restart(t):
    for lane in list(pend):
        if first_line.get(lane) is not None and t > first_line[lane]:
            h = t.replace(minute=0, second=0, microsecond=0)
            excluded.add((lane, h))
            excluded.add((lane, h - HOUR))  # an hour whose flush was due at the restart's hour change is lost too
            lost_touch[lane] = lost_touch.get(lane, 0) + sum(pend[lane].values())
            pend[lane] = {}
            cur_flush.pop(lane, None)


def add_kv(a, kv, skip):
    for k, v in kv.items():
        if k in skip:
            continue
        if isinstance(v, list):
            cur = a.setdefault(k, [0] * len(v))
            a[k] = [x + y for x, y in zip(cur, v)]
        elif isinstance(v, int):
            a[k] = a.get(k, 0) + v


for f in required:
    n_lines = n_instr = n_in = n_before = n_after = 0
    check_midnight_source = MIDNIGHT_FINAL_HOUR is not None and f in (midnight_predecessor, midnight_successor)
    source_head = source_tail = None
    with open_log(f) as fh:
        for line in fh:
            n_lines += 1
            instrument_line = '[8a-P4c][VTS_XS_' in line
            if not instrument_line and not check_midnight_source:
                continue
            if check_midnight_source and not line.endswith('\n'):
                continue  # an incomplete final line cannot prove the end of this read or supply a rollup
            m = TS.match(line)
            if not m:
                if instrument_line:
                    n_instr += 1
                    bad += 1
                continue
            t = datetime.strptime(m.group(1), '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            if check_midnight_source:
                if source_head is None:
                    source_head = t
                source_tail = t
            if not instrument_line:
                continue
            n_instr += 1
            while ri < len(restarts) and restarts[ri] <= t:
                apply_restart(restarts[ri])
                ri += 1
            kv = {k: val(v) for k, v in KV.findall(line)}
            lane = kv.get('lane')
            if '[VTS_XS_TOUCH]' in line:
                if t >= START_S and t < END + HOUR:
                    first_line.setdefault(lane, t)
                    p = pend.setdefault(lane, {})
                    p[kv['session']] = p.get(kv['session'], 0) + kv['looks']
                    cur_flush.pop(lane, None)
                inside = START_S <= t < END
                if MIDNIGHT_FINAL_HOUR is not None and kv['looks'] > 0:
                    if inside and t >= MIDNIGHT_FINAL_HOUR:
                        final_hour_looks.add(lane)
                    elif END <= t < END + HOUR:
                        late_hour_looks.add(lane)
            elif '[VTS_XS_SYM]' in line:
                h = datetime.strptime(kv['hour'], '%Y-%m-%dT%HZ').replace(tzinfo=timezone.utc)
                if h + HOUR > START and h < END + HOUR:
                    first_line.setdefault(lane, t)
                    if cur_flush.get(lane) != h:  # first line of this lane's flush block for hour h
                        if MIDNIGHT_FINAL_HOUR is not None:
                            # A pass can finish just after the hour boundary, before the prior hour's flush.
                            if h < MIDNIGHT_FINAL_HOUR:
                                final_hour_looks.discard(lane)
                            elif h == MIDNIGHT_FINAL_HOUR:
                                final_hour_rollups.add(lane)
                        for s, n in pend.get(lane, {}).items():
                            touch_by_hour[(lane, h, s)] = touch_by_hour.get((lane, h, s), 0) + n
                        pend[lane] = {}
                        cur_flush[lane] = h
                    k = (lane, h, kv['session'])
                    sym_by_hour[k] = sym_by_hour.get(k, 0) + kv['looks']
                inside = (h + HOUR > START and h < END) if args.sym_cut == 'hour' else (START_S <= t < END)
            else:
                continue
            if not inside:
                if t < START_S:
                    n_before += 1
                else:
                    n_after += 1
                continue
            n_in += 1
            first_ts = t if first_ts is None or t < first_ts else first_ts
            last_ts = t if last_ts is None or t > last_ts else last_ts
            if '[VTS_XS_TOUCH]' in line:
                a = touch.setdefault((lane, kv['session']), {'passes': 0})
                a['passes'] += 1
                add_kv(a, kv, ('lane', 'session'))
            else:
                a = sym.setdefault((lane, kv['session'], kv['symbol']), {'lines': 0})
                a['lines'] += 1
                add_kv(a, kv, ('lane', 'session', 'symbol', 'hour'))
    if check_midnight_source:
        midnight_source_bounds[f] = (source_head, source_tail)
    per_file.append({'file': os.path.basename(f), 'lines': n_lines, 'instrument_lines': n_instr,
                     'in_window': n_in, 'before': n_before, 'after': n_after})
while ri < len(restarts):
    apply_restart(restarts[ri])
    ri += 1

if MIDNIGHT_FINAL_HOUR is not None:
    cutoff = END + HOUR
    before_head, before_tail = midnight_source_bounds[midnight_predecessor]
    after_head, after_tail = midnight_source_bounds[midnight_successor]
    spans_boundary = any(h is not None and h < END and t >= cutoff
                         for h, t in midnight_source_bounds.values())
    verified_pair = False
    if not spans_boundary and midnight_predecessor != midnight_successor:
        name = os.path.basename(midnight_predecessor)
        date_stamp = re.fullmatch(r'error__(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.log(?:\.gz)?', name)
        if date_stamp:
            try:
                cut = datetime.strptime(date_stamp.group(1), '%Y-%m-%d_%H-%M-%S').replace(tzinfo=timezone.utc)
            except ValueError:
                die(f'invalid midnight rotation time in {name}')
            verified_pair = (END <= cut < cutoff and before_head is not None and before_head < END
                             and after_head is not None and cut <= after_head < cutoff
                             and before_tail <= after_head and after_tail >= cutoff)
    if not (spans_boundary or verified_pair):
        bounds = [(os.path.basename(p), str(h), str(t)) for p, (h, t) in midnight_source_bounds.items()]
        die(f'midnight source coverage missing for [{END.isoformat()}, {cutoff.isoformat()}): '
            f'expected a spanning file or an exact opening-hour archive pair; read {bounds}')

    for lane in sorted((final_hour_looks | late_hour_looks) - final_hour_rollups):
        if (lane, MIDNIGHT_FINAL_HOUR) not in excluded:
            source_names = [os.path.basename(path) for path in required]
            die(f'final-hour rollup missing for {lane} at {MIDNIGHT_FINAL_HOUR.isoformat()} despite observed looks; '
                f'read {source_names}')

out = {'window': [START.isoformat(), END.isoformat()], 'sym_cut': args.sym_cut, 'first_line': str(first_ts),
       'last_line': str(last_ts), 'files': per_file, 'unparsed_ts': bad,
       'start_coverage': {'first_source_head': head.isoformat(), 'prepended': os.path.basename(prepended) if prepended else None},
       'restarts_in_range': [r.isoformat() for r in restarts],
       'restart_source': {'path': args.pm2_log, 'first_stamp': pm2_first.isoformat(), 'starting_lines_total': pm2_starting_total},
       'lanes': {}}
lanes = sorted({k[0] for k in touch} | {k[0] for k in sym})
for lane in lanes:
    L = {}
    L['touch_by_session'] = {s: touch[(ln, s)] for (ln, s) in touch if ln == lane}
    # (c) the published segment totals, and the window-level SYM-vs-TOUCH gap per session (the negative control reads this)
    sessions = sorted({s for (ln, s) in touch if ln == lane} | {k[1] for k in sym if k[0] == lane})
    L['looks_by_session'] = {}
    for s in sessions:
        t_n = touch.get((lane, s), {}).get('looks', 0)
        s_n = sum(v.get('looks', 0) for k, v in sym.items() if k[0] == lane and k[1] == s)
        L['looks_by_session'][s] = {'touch': t_n, 'sym': s_n, 'touch_minus_sym': t_n - s_n,
                                    'readable': t_n > 0 and s_n > 0}
    # (d) per-hour equality over unrestarted, fully in-window hours
    hours = sorted({k[1] for k in sym_by_hour if k[0] == lane and START <= k[1] and k[1] + HOUR <= END}
                   | {k[1] for k in touch_by_hour if k[0] == lane and START <= k[1] and k[1] + HOUR <= END})
    graded = [h for h in hours if (lane, h) not in excluded]
    mism = []
    n_cells = 0
    for h in graded:
        for s in sorted({k[2] for k in sym_by_hour if k[0] == lane and k[1] == h}
                        | {k[2] for k in touch_by_hour if k[0] == lane and k[1] == h}):
            n_cells += 1
            a, b = sym_by_hour.get((lane, h, s), 0), touch_by_hour.get((lane, h, s), 0)
            if a != b:
                mism.append({'hour': h.isoformat(), 'session': s, 'sym': a, 'touch': b})
    L['hour_equality'] = {'hours_in_window': len(hours), 'hours_excluded_by_restart': sorted(
        h.isoformat() for (ln, h) in excluded if ln == lane and h in hours), 'hours_graded': len(graded),
        'cells_graded': n_cells, 'cells_unequal': len(mism), 'first_mismatches': mism[:20],
        'touch_lost_at_restart': lost_touch.get(lane, 0), 'holds': n_cells > 0 and not mism}

    reg = touch.get((lane, 'regular'), {})
    looks = reg.get('looks', 0)
    L['fault_ageUnknown_all_sessions'] = sum(v.get('ageUnknown', 0) for (ln, s), v in touch.items() if ln == lane)
    L['regular_looks_touch'] = looks
    regsym = {k[2]: v for k, v in sym.items() if k[0] == lane and k[1] == 'regular'}
    L['regular_symbols_observed'] = len(regsym)
    L['regular_looks_sym'] = sum(v.get('looks', 0) for v in regsym.values())
    floor = {s: v for s, v in regsym.items() if v.get('looks', 0) >= 120}
    L['floor_symbols'] = len(floor)
    L['floor_clears'] = len(floor) >= 50

    def rule_b(looks_n, age_over):
        shares = [(age_over[i] / looks_n) if looks_n else None for i in range(len(CANDS))]
        cstar = next((CANDS[i] for i, sh in enumerate(shares) if sh is not None and sh <= 0.01), None)
        return shares, cstar

    fl_looks = sum(v['looks'] for v in floor.values())
    fl_age = [sum(v['ageOver'][i] for v in floor.values()) for i in range(len(CANDS))] if floor else [0] * len(CANDS)
    fl_ref = [sum(v['refused'][i] for v in floor.values()) for i in range(len(CANDS))] if floor else [0] * len(CANDS)
    sB_all, c_all = rule_b(looks, reg.get('ageOver', [0] * len(CANDS)))
    sB_fl, c_fl = rule_b(fl_looks, fl_age)
    L['ruleB_all'] = {'age_refusal_share_by_c': sB_all, 'c_star': c_all}
    L['ruleB_floor'] = {'looks': fl_looks, 'age_refusal_share_by_c': sB_fl, 'c_star': c_fl}
    for tag, cstar, looks_n, refused in (('all', c_all, looks, reg.get('refused', [0] * len(CANDS))),
                                         ('floor', c_fl, fl_looks, fl_ref)):
        ci = CANDS.index(cstar if cstar is not None else 300)
        U = refused[ci] / looks_n if looks_n else None
        K_syms = sorted(s for s, v in floor.items() if v['looks'] and v['refused'][ci] / v['looks'] > 0.5)
        L['ruleA_' + tag] = {'c_used': CANDS[ci], 'U': U, 'K': len(K_syms), 'K_symbols': K_syms}

    # S1 — the successor measurement (plan §C3.8). Per session; weekend looks are labelled and never read.
    L['S1'] = {}
    for (ln, s), v in sorted(touch.items()):
        if ln != lane or s == 'weekend':
            continue
        applied, refused_live, lk = v.get('appliedLooks', 0), v.get('refusedLive', 0), v.get('looks', 0)
        ao = v.get('ageOver', [0] * len(CANDS))
        live_v = v.get('live')
        L['S1'][s] = {
            'readable': applied > 0 and isinstance(live_v, list) and len(live_v) == len(LIVE_REASONS),
            'looks': lk, 'appliedLooks': applied, 'refusedLive': refused_live,
            'share': (refused_live / applied) if applied else None,
            'bracket_own_window': [(ao[CANDS.index(300)] / lk) if lk else None, (ao[CANDS.index(15)] / lk) if lk else None],
            'bracket_frozen': S1_FROZEN_BRACKET,
            'live_by_reason': dict(zip(LIVE_REASONS, live_v)) if isinstance(live_v, list) and len(live_v) == len(LIVE_REASONS) else None,
        }
    out['lanes'][lane] = L
print(json.dumps(out, indent=1, default=str))
