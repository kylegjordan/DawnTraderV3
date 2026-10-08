#!/usr/bin/env python3
"""
B-XSTOCK-BID-TRIGGER-RELAND increment 3a decision read (Kyle's spread_blown ON/OFF call) — BLIND TIME per open paper
xStock position, as the UNION of every reason the exit path did not act (Langston, 2026-10-08 00:28Z bounce of the
frame-only read).

WHY A TIMELINE AND NOT A FRAME COUNT: `[3n.q7][XS_FRAME]` lines exist only for ticks that cleared the EQUITY_MARK
freshness gate and the book-state guard; a stale-mark or hollow stretch emits NO frame, so counting runs of emitted
firing frames chops one blind episode into many short ones. This script lays every position's holding period on a time
line and labels each instant by the most recent event for that symbol:
  ok          — an XS_FRAME whose spread <= thr (the exit path acted)
  arm         — an XS_FRAME whose spread >  thr (what `spread_blown` ON would refuse; today it acts)
  arm_floor   — an XS_FRAME whose spread >  FLOOR (the UPPER bound under ON: thr = max(kRel*trail, floorPct/100) can
                never fall below the floor, so ON can never refuse a frame the floor passes)
  mark_skip   — `[EQUITY_MARK] … not actionable this tick`
  book_refuse — `[BOOK_STATE] <sym> REFUSE unvalidated`
  book_hollow — `[BOOK_STATE] <sym> SKIP hollow`
  unknown     — no event for that symbol within GAP_S of the instant
An event covers the time from its stamp to the next event for the symbol, capped at GAP_S; the rest is `unknown`.

BLIND TODAY  = mark_skip ∪ book_refuse ∪ book_hollow ∪ unknown
BLIND IF ON  = BLIND TODAY ∪ arm            (measured threshold — a LOWER bound, see Langston's finding 3)
BLIND IF ON, UPPER = BLIND TODAY ∪ arm_floor (the floor bound)

POPULATION: paper xStock positions from `closed_trades` (mode='paper', asset class xstock_spot, opened before the window
ends and not closed before it starts), one CSV row each: symbol,opened_at,closed_at (closed_at empty = still open, cut at
the window end). Positions are matched to log lines BY SYMBOL inside the holding period (the frame's `pos=` is an
`active_open_positions` id, which is deleted at close and cannot be joined back).

Market-closed time is EXCLUDED (--closed START/END, repeatable): the xStock weekend shutdown emits nothing by design and
would otherwise read as `unknown`.

Usage: xstock-blind-time.py --positions pos.csv --floor 0.01 --split 2026-10-06T15:45:00 --window-start … --window-end …
       [--closed 2026-10-03T00:00:00/2026-10-05T00:00:00] LOG [LOG ...]
Prints INTERIM summaries per split half. Timestamps are the PM2 line stamps (UTC).
"""
import argparse, bisect, csv, datetime as dt, re, sys
from collections import defaultdict

GAP_S = 5.0
UTC = dt.timezone.utc
TS = r'^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \+00:00: '
RX_FRAME = re.compile(TS + r'\[3n\.q7\]\[XS_FRAME\] (\S+) pos=\S+ .*? spread=(\S+) thr=(\S+)')
RX_MARK = re.compile(TS + r'\[P19-B8\.5e\]\[EQUITY_MARK\] (\S+): .*not actionable this tick')
RX_BOOK = re.compile(TS + r'\[B-XSTOCK-FEED-SANITY\]\[BOOK_STATE\] (\S+) (REFUSE unvalidated|SKIP hollow)')

def ts(s): return dt.datetime.strptime(s, '%Y-%m-%d %H:%M:%S').replace(tzinfo=UTC).timestamp()

def parse_logs(paths, floor):
    ev = defaultdict(list)  # symbol -> [(t, kind_today, is_arm, is_arm_floor)]
    for p in paths:
        with open(p, errors='replace') as f:
            for line in f:
                if '[XS_FRAME]' in line:
                    m = RX_FRAME.match(line)
                    if not m: continue
                    try: sp, th = float(m.group(3)), float(m.group(4))
                    except ValueError: continue
                    ev[m.group(2)].append((ts(m.group(1)), 'ok', sp > th, sp > floor))
                elif 'EQUITY_MARK' in line and 'not actionable' in line:
                    m = RX_MARK.match(line)
                    if m: ev[m.group(2)].append((ts(m.group(1)), 'mark_skip', False, False))
                elif '[BOOK_STATE]' in line:
                    m = RX_BOOK.match(line)
                    if m: ev[m.group(2)].append((ts(m.group(1)), 'book_refuse' if m.group(3).startswith('REFUSE') else 'book_hollow', False, False))
    for s in ev: ev[s].sort()
    return ev

def intervals(events, a, b):
    """Label [a, b) by the events; returns list of (start, end, kind, arm, arm_floor)."""
    out = []
    times = [e[0] for e in events]
    i = bisect.bisect_left(times, a)
    cur = a
    prev = events[i - 1] if i > 0 and a - events[i - 1][0] < GAP_S else None
    while cur < b:
        nxt = events[i][0] if i < len(events) else float('inf')
        seg_end = min(nxt, b)
        if prev is not None:
            cover_end = min(seg_end, prev[0] + GAP_S)
            if cover_end > cur: out.append((cur, cover_end, prev[1], prev[2], prev[3]))
            if seg_end > cover_end: out.append((max(cur, cover_end), seg_end, 'unknown', False, False))
        elif seg_end > cur:
            out.append((cur, seg_end, 'unknown', False, False))
        if nxt >= b: break
        cur = nxt; prev = events[i]; i += 1
    return out

def longest(ivs, pred):
    best = run = 0.0; last_end = None
    for s, e, k, arm, armf in ivs:
        if pred(k, arm, armf):
            run = run + (e - s) if last_end is not None and abs(s - last_end) < 1e-6 else (e - s)
            last_end = e; best = max(best, run)
        else:
            run = 0.0; last_end = None
    return best

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--positions', required=True)
    ap.add_argument('--floor', type=float, required=True)
    ap.add_argument('--split', required=True)
    ap.add_argument('--window-start', required=True)
    ap.add_argument('--window-end', required=True)
    ap.add_argument('--closed', action='append', default=[])
    ap.add_argument('logs', nargs='+')
    a = ap.parse_args()
    w0 = dt.datetime.fromisoformat(a.window_start).replace(tzinfo=UTC).timestamp()
    w1 = dt.datetime.fromisoformat(a.window_end).replace(tzinfo=UTC).timestamp()
    split = dt.datetime.fromisoformat(a.split).replace(tzinfo=UTC).timestamp()
    ev = parse_logs(a.logs, a.floor)
    closed = [tuple(dt.datetime.fromisoformat(x).replace(tzinfo=UTC).timestamp() for x in c.split('/')) for c in a.closed]
    def open_parts(o, c):
        parts = [(o, c)]
        for x0, x1 in closed:
            nxt = []
            for p0, p1 in parts:
                if p1 <= x0 or p0 >= x1: nxt.append((p0, p1)); continue
                if p0 < x0: nxt.append((p0, x0))
                if p1 > x1: nxt.append((x1, p1))
            parts = nxt
        return parts
    pos = []
    with open(a.positions) as f:
        for r in csv.DictReader(f):
            o = dt.datetime.fromisoformat(r['opened_at'].replace(' ', 'T')[:19]).replace(tzinfo=UTC).timestamp()
            c = dt.datetime.fromisoformat(r['closed_at'].replace(' ', 'T')[:19]).replace(tzinfo=UTC).timestamp() if r['closed_at'] else w1
            o, c = max(o, w0), min(c, w1)
            for p0, p1 in open_parts(o, c):
                if p1 > p0: pos.append((r['symbol'], p0, p1))
    today = lambda k, arm, armf: k in ('mark_skip', 'book_refuse', 'book_hollow', 'unknown')
    on = lambda k, arm, armf: today(k, arm, armf) or arm
    on_up = lambda k, arm, armf: today(k, arm, armf) or armf
    for label, lo, hi in (('before split', w0, split), ('after split', split, w1)):
        rows = []; frames = 0
        for sym, o, c in pos:
            o2, c2 = max(o, lo), min(c, hi)
            if c2 <= o2: continue
            ivs = intervals(ev.get(sym, []), o2, c2)
            held = c2 - o2
            dur = defaultdict(float)
            for s, e, k, arm, armf in ivs:
                dur[k] += e - s
                if k == 'ok' and arm: dur['arm'] += e - s
                if k == 'ok' and armf: dur['arm_floor'] += e - s
            frames += sum(1 for t, *_ in ev.get(sym, []) if o2 <= t < c2)
            rows.append((sym, held, dur, longest(ivs, today), longest(ivs, on), longest(ivs, on_up)))
        if not rows:
            print(f'== {label}: no positions'); continue
        H = sum(r[1] for r in rows)
        tot = lambda key: sum(r[2][key] for r in rows)
        blind_today = sum(r[2]['mark_skip'] + r[2]['book_refuse'] + r[2]['book_hollow'] + r[2]['unknown'] for r in rows)
        print(f'== {label} (INTERIM): position-segments={len(rows)} held_hours={H/3600:.1f} events_in_holds={frames} '
              f'expected_ticks@1.5s={H/1.5:.0f}')
        for key in ('ok', 'mark_skip', 'book_refuse', 'book_hollow', 'unknown', 'arm', 'arm_floor'):
            print(f'   {key:12s} {tot(key)/3600:8.2f} h  {100*tot(key)/H:6.2f}% of held time')
        print(f'   BLIND TODAY          {blind_today/3600:8.2f} h  {100*blind_today/H:6.2f}%')
        print(f'   BLIND IF ON (+arm)   {(blind_today+tot("arm"))/3600:8.2f} h  {100*(blind_today+tot("arm"))/H:6.2f}%')
        print(f'   BLIND IF ON (+floor) {(blind_today+tot("arm_floor"))/3600:8.2f} h  {100*(blind_today+tot("arm_floor"))/H:6.2f}%')
        touched = sum(1 for r in rows if r[2]['arm'] > 0); touched_f = sum(1 for r in rows if r[2]['arm_floor'] > 0)
        print(f'   positions the arm touches: {touched} of {len(rows)} (floor bound {touched_f})')
        for name, idx in (('today', 3), ('ON', 4), ('ON floor', 5)):
            top = sorted(rows, key=lambda r: -r[idx])[:5]
            print(f'   longest blind episode {name:8s}: ' + ', '.join(f'{r[0]} {r[idx]/60:.1f}m' for r in top))

if __name__ == '__main__':
    main()
