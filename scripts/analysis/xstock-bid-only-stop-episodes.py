"""B-XSTOCK-BID-TRIGGER-RELAND (row 3n.q7) — the 21-day window's decision read, taken at day 7 (Kyle 2026-10-09).

QUESTION: if the xStock STOP trigger read the BID instead of the mark, would the extra stops it fires be REAL (the market
actually traded at or through the stop) or FAKE (a thin/stub bid with no trade anywhere near it)?

OBJECT: `[3n.q7][XS_FRAME]` lines where `bidWouldFire=stop` AND `markExit=n` — the frames where the bid trigger would have
closed the position and today's mark trigger did not. Frames are grouped per position (`pos=`) into EPISODES: a new
episode starts when the gap to the previous qualifying frame exceeds GAP_S, or a restart/deploy boundary lies between.

CLASSIFICATION per episode (same print definition as `xs_frame_false_hollow.py`):
  REAL   a PRINT inside the episode or within episode end + horizon is at or below the frame's `sl=` (the last frame's);
  FAKE   prints exist in that horizon and none reaches the stop — the bid said "stop" and nobody traded there;
  NOT_COMPUTABLE  no print in the horizon.
A PRINT is a ticker snapshot whose `volume_24h` rose strictly over the previous snapshot of the symbol; price = `last`.
Primary horizon 90 s; +5 min and +30 min are SENSITIVITY only.

ALSO, per episode: did the MARK trigger exit the same position later (a `markExit=y` frame within +30 min of the episode
end)? If so the bid trigger only fired EARLIER; if not, it fired a stop the mark never fired.

⛔ BIASES (printed with the read):
  (i)  a drop-off leaving the 24 h window can mask a volume rise => missed print => toward NOT_COMPUTABLE;
  (ii) `last` is only the final trade in a ~4-5 s snapshot interval, so a print through the stop that recovers inside the
       interval is invisible => toward FAKE (i.e. toward NOT moving the trigger);
  (iii) later horizons over-count REAL: a print through the stop minutes later is a later stop, not this one.

Usage: python3 xstock-bid-only-stop-episodes.py --frames <file|glob>... --snaps snaps.csv [--boundaries <boundaries.log>]
       python3 xstock-bid-only-stop-episodes.py --self-test
"""
import bisect, collections, csv, glob, gzip, re, sys
from datetime import datetime, timezone

GAP_S = 120.0
PRIMARY_S = 90.0
SENS_S = (300.0, 1800.0)
MARK_LATER_S = 1800.0

LINE_RE = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \+00:00: .*?\[3n\.q7\]\[XS_FRAME\] (\S+) pos=(\S+) (.*)$')
KV_RE = re.compile(r'(\w+)=(\S+)')
PM2_RE = re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}): PM2 log: App \[dawntrader:\d+\] (starting|online|exited)')
REFLOG_RE = re.compile(r'^([0-9a-f]{7,40}) ([0-9a-f]{7,40}) .*? (\d{9,11}) [+-]\d{4}\t(.*)$')


def ts(s):
    return datetime.strptime(s, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).timestamp()


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def session(t):
    """cash = US regular hours 13:30-20:00Z Mon-Fri; h2015 / h0015 = the 20:15Z and 00:15Z handoffs (+-15 min); off = rest."""
    m = int((t % 86400) // 60)
    wd = datetime.fromtimestamp(t, timezone.utc).weekday()
    if 1200 <= m < 1230:
        return 'h2015'
    if 0 <= m < 30:
        return 'h0015'
    if wd < 5 and 810 <= m < 1200:
        return 'cash'
    return 'off'


def read_lines(paths):
    for pat in paths:
        for p in sorted(glob.glob(pat)) or [pat]:
            op = gzip.open if p.endswith('.gz') else open
            with op(p, 'rt', errors='replace') as f:
                yield from f


def read_frames(lines):
    stop, mark_exit = [], collections.defaultdict(list)
    for line in lines:
        if '[XS_FRAME]' not in line:
            continue
        m = LINE_RE.match(line.strip())
        if not m:
            continue
        kv = dict(KV_RE.findall(m.group(4)))
        t, sym, pos = ts(m.group(1)), m.group(2), m.group(3)
        if kv.get('markExit') == 'y':
            mark_exit[pos].append(t)
        if kv.get('bidWouldFire') == 'stop' and kv.get('markExit') == 'n':
            stop.append({'t': t, 'sym': sym, 'pos': pos, 'sl': num(kv.get('sl')), 'bid': num(kv.get('bid')), 'frame': kv.get('frame')})
    stop.sort(key=lambda r: (r['pos'], r['t']))
    for v in mark_exit.values():
        v.sort()
    return stop, mark_exit


def read_boundaries(path):
    b = []
    if path:
        for line in open(path, errors='replace'):
            m = PM2_RE.match(line)
            if m:
                b.append(datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc).timestamp())
                continue
            m = REFLOG_RE.match(line.rstrip('\n'))
            if m:
                b.append(float(m.group(3)))
    return sorted(b)


def episodes(frames, boundaries):
    out, cur = [], None
    for r in frames:
        if cur is not None:
            crossed = bisect.bisect_right(boundaries, cur['t1']) != bisect.bisect_right(boundaries, r['t'])
            if r['pos'] != cur['pos'] or r['t'] - cur['t1'] > GAP_S or crossed:
                out.append(cur); cur = None
        if cur is None:
            cur = {'pos': r['pos'], 'sym': r['sym'], 't0': r['t'], 't1': r['t'], 'n': 0, 'sl': r['sl'], 'gaps': []}
        cur['t1'] = r['t']; cur['n'] += 1
        if r['sl'] and r.get('bid') is not None:
            cur['gaps'].append((r['sl'] - r['bid']) / r['sl'])  # how far the top bid sits below the stop, as a fraction
        if r['sl'] is not None:
            cur['sl'] = r['sl']
    if cur is not None:
        out.append(cur)
    return out


def read_prints(snaps_path=None, rows=None):
    raw = collections.defaultdict(list)
    for row in (rows if rows is not None else csv.reader(open(snaps_path))):
        if len(row) != 4:
            continue
        s, t, last, vol = row
        raw[s].append((float(t), num(last), num(vol)))
    prints = {}
    for s, xs in raw.items():
        xs.sort()
        prints[s] = [(t1, l1) for (t0, _, v0), (t1, l1, v1) in zip(xs, xs[1:])
                     if v0 is not None and v1 is not None and l1 is not None and v1 > v0]
    return prints


def classify(ep, prints, horizon):
    xs = prints.get(ep['sym'], [])
    lo = bisect.bisect_left(xs, (ep['t0'], float('-inf')))
    hi = bisect.bisect_right(xs, (ep['t1'] + horizon, float('inf')))
    window = [p for _, p in xs[lo:hi]]
    if not window:
        return 'NOT_COMPUTABLE'
    return 'REAL' if ep['sl'] is not None and min(window) <= ep['sl'] else 'FAKE'


def mark_later(ep, mark_exit):
    """Seconds from the episode's first bid-only frame to the mark's first exit frame, or None if the mark did not exit
    within MARK_LATER_S of the episode end."""
    ts_ = mark_exit.get(ep['pos'], [])
    i = bisect.bisect_left(ts_, ep['t0'])
    return ts_[i] - ep['t0'] if i < len(ts_) and ts_[i] <= ep['t1'] + MARK_LATER_S else None


def report(frames, mark_exit, prints, boundaries):
    eps = episodes(frames, boundaries)
    syms = {e['sym'] for e in eps}; poss = {e['pos'] for e in eps}
    print(f'# bid-only STOP frames (bidWouldFire=stop markExit=n): {len(frames)} -> {len(eps)} episodes (gap > {GAP_S:.0f} s '
          f'or a restart/deploy splits), {len(syms)} symbols, {len(poss)} positions; snapshot symbols with prints: '
          f'{sum(1 for s in syms if prints.get(s))} of {len(syms)}')
    print('# biases: (i) masked volume rise -> toward NOT_COMPUTABLE; (ii) print-and-recover inside one ~4-5 s snapshot is '
          'invisible -> toward FAKE; (iii) later horizons over-count REAL (a later stop, not this one).')
    groups = collections.defaultdict(list)
    for e in eps:
        groups[session(e['t0'])].append(e)
    groups['ALL'] = eps
    print('session episodes frames primary90s(REAL/FAKE/NC) +5min(REAL/FAKE/NC) +30min(REAL/FAKE/NC) '
          'mark_exited_within_30min median_lead_s episode_median_s episode_p90_s')
    for key in ('cash', 'h2015', 'h0015', 'off', 'ALL'):
        es = groups.get(key, [])
        if not es:
            print(f'{key} 0'); continue
        c = {h: collections.Counter(classify(e, prints, h) for e in es) for h in (PRIMARY_S,) + SENS_S}
        f = lambda cn: f"{cn['REAL']}/{cn['FAKE']}/{cn['NOT_COMPUTABLE']}"
        durs = sorted(e['t1'] - e['t0'] for e in es)
        leads = sorted(x for x in (mark_later(e, mark_exit) for e in es) if x is not None)
        lead = f'{leads[len(leads) // 2]:.0f}' if leads else '-'
        print(f"{key} {len(es)} {sum(e['n'] for e in es)} {f(c[PRIMARY_S])} {f(c[SENS_S[0]])} {f(c[SENS_S[1]])} "
              f"{len(leads)} {lead} {durs[len(durs) // 2]:.0f} {durs[int(0.9 * (len(durs) - 1))]:.0f}")
    return eps


def gap_report(eps, prints):
    """Collar sizing (Langston 2026-10-09): per episode, the top bid's distance below the stop — `min` over its frames
    (the closest the bid came to the stop: a collar k refuses the WHOLE episode only if k < this) and `first` (the first
    frame). Top-of-book only: a size-walk fills at or below it, so these are upper bounds on the fill price."""
    def pct(xs, q):
        return xs[min(len(xs) - 1, int(q * (len(xs) - 1)))] if xs else float('nan')
    print('# collar sizing: per-episode (stop - top bid)/stop, %; min = closest approach (refuse-all needs k below it)')
    print('session class episodes min_of_min p10_min p50_min p50_first p90_first max_first')
    for key in ('cash', 'h2015', 'h0015', 'off'):
        for cls in ('REAL', 'FAKE', 'NOT_COMPUTABLE'):
            es = [e for e in eps if session(e['t0']) == key and e['gaps'] and classify(e, prints, PRIMARY_S) == cls]
            if not es:
                continue
            mins = sorted(100 * min(e['gaps']) for e in es); firsts = sorted(100 * e['gaps'][0] for e in es)
            print(f'{key} {cls} {len(es)} {mins[0]:.3f} {pct(mins, .1):.3f} {pct(mins, .5):.3f} '
                  f'{pct(firsts, .5):.3f} {pct(firsts, .9):.3f} {firsts[-1]:.3f}')


def self_test():
    def line(t, sym, pos, sl, fire, mark='n'):
        return (f"{t} +00:00: [3n.q7][XS_FRAME] {sym} pos={pos} frame=ok spread=0.01 thr=0.02 sl={sl} tp=200 "
                f"bidWouldFire={fire} markExit={mark} exitReason=none")
    lines = [
        line('2026-10-05 15:00:00', 'AAA/USD', 'p1', 100, 'stop'),
        line('2026-10-05 15:00:05', 'AAA/USD', 'p1', 100, 'stop'),
        line('2026-10-05 15:10:00', 'AAA/USD', 'p1', 100, 'stop'),   # gap 595 s -> second episode
        line('2026-10-05 15:20:00', 'AAA/USD', 'p1', 100, 'no', 'y'),  # the mark exits later
        line('2026-10-05 15:00:00', 'BBB/USD', 'p2', 50, 'stop'),
        line('2026-10-05 15:00:00', 'CCC/USD', 'p3', 10, 'stop'),
        line('2026-10-05 15:00:00', 'DDD/USD', 'p4', 10, 'stop', 'y'),  # mark also exits -> excluded
    ]
    frames, mark_exit = read_frames(lines)
    assert len(frames) == 5, frames  # DDD excluded: the mark also exits
    t0 = ts('2026-10-05 15:00:00')
    rows = [
        ['AAA/USD', str(t0 - 10), '101', '10'], ['AAA/USD', str(t0 + 30), '99.5', '11'],   # print through the stop
        ['AAA/USD', str(t0 + 595), '101', '11'], ['AAA/USD', str(t0 + 640), '100.5', '12'],  # print above stop only
        ['BBB/USD', str(t0 - 10), '51', '5'], ['BBB/USD', str(t0 + 20), '49', '5'],         # last moved, NO volume rise
        ['CCC/USD', str(t0 - 10), '11', '1'],
    ]
    prints = read_prints(rows=rows)
    eps = episodes(frames, [])
    assert len(eps) == 4, eps
    got = {(e['pos'], e['t0']): classify(e, prints, PRIMARY_S) for e in eps}
    assert got[('p1', t0)] == 'REAL', got
    assert got[('p1', t0 + 600)] == 'FAKE', got
    assert got[('p2', t0)] == 'NOT_COMPUTABLE', got   # a `last` without a volume rise is not a print
    assert got[('p3', t0)] == 'NOT_COMPUTABLE', got
    assert mark_later(eps[0], mark_exit) == 1200 and mark_later(eps[1], mark_exit) == 600
    assert mark_later(eps[2], mark_exit) is None
    # a restart between two frames splits the episode
    assert len(episodes(frames[:2], [t0 + 2])) == 2
    assert eps[0]['gaps'] == [], eps[0]  # the self-test lines carry no bid=
    print('self-test OK')
    return 0


def main(argv):
    if '--self-test' in argv:
        return self_test()

    def many(flag):
        out = []
        for i, a in enumerate(argv):
            if a == flag:
                for b in argv[i + 1:]:
                    if b.startswith('--'):
                        break
                    out.append(b)
        return out
    frames, mark_exit = read_frames(read_lines(many('--frames')))
    bounds = read_boundaries((many('--boundaries') or [None])[0])
    prints = read_prints(many('--snaps')[0])
    eps = report(frames, mark_exit, prints, bounds)
    if '--gaps' in argv:
        gap_report(eps, prints)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
