#!/usr/bin/env python3
"""B-XSTOCK-BID-TRIGGER-RELAND increment A, Step 2 r2 — the measurement for objective 1b (the ring-independent release
bound, homed by `8a-P4a` §A7: "IF AMC (or any held symbol) DOES NOT ESCAPE ... while its captured spread sits within the
bound" — `B_PRICE_SIDE_BY_JOB_8A_P4A_AUDIT_AND_PLAN.md:100`).

REPLACES `xstock-refusal-episodes.py`, whose "stranded" figure accrued only while `ratio <= kRel`. That is the set the
escape already handles, so the ring-independent population (ratio > kRel, ratio=none) scored ZERO by construction
(Langston, 2026-10-10 gate 1). This instrument judges the ABSOLUTE spread instead, per held POSITION.

OBJECT: the exit loop's own stderr `REFUSE unvalidated ... ratio=<r>` lines (PM2 `error*.log`; one per refused tick), each
joined AS-OF to the newest `xstock_spot_ticker_snap` row for its symbol at or before the line (same table the guard's
quote comes from), and to the active-path position holding that symbol at that moment (`closed_trades` with closed_at
set, plus `active_open_positions`).
TIME: each line owns min(gap to the next line on the symbol, GAP_S). SPREAD: (ask - bid) / mid of the as-of row; a row
older than MAX_SNAP_AGE_S, or one-sided, is `unknown` and never counted as within any ceiling.
UNIT: one HOLD = one position id (fragments = runs split by a gap > GAP_S, reported beside it). A refusal line with no
matching position is its own unit, keyed by symbol (reported, never merged).
OUTPUT (each population on its own line, never inside a total): refused hours by ratio class (none / <= kRel / > kRel),
by absolute-spread band; and per CEILING (swept, no default): the longest continuous refused run with spread <= ceiling,
per hold, and how many holds exceed 5 and 30 minutes.
POSITIVE CONTROL: --control SYMBOL prints that symbol's holds in full (HUT/USD 10-06/07 is the known long refusal).

Run on staging as deploy, with DATABASE_URL in the environment:
  python3 xstock-refusal-holds.py --krel 3 [--control HUT/USD] /var/log/dawntrader/error__2026-*.log /var/log/dawntrader/error.log
"""
import argparse, collections, csv, datetime as dt, os, re, subprocess, tempfile

GAP_S = 60.0
MAX_SNAP_AGE_S = 120.0
CEILINGS = [0.005, 0.01, 0.02, 0.03, 0.05, 0.10]
TS = r'^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \+00:00: '
RX_REF = re.compile(TS + r'\[B-XSTOCK-FEED-SANITY\]\[BOOK_STATE\] (\S+) REFUSE unvalidated state=(\S+) validated=\S+ framesSinceSeed=\S+ ratio=(\S+)')

SQL = r"""
create temp table r(ts timestamptz, sym text, state text, ratio text);
\copy r from '{csv}' with (format csv)
\copy (select r.ts, r.sym, r.state, r.ratio, s.captured_at, s.bid, s.ask, p.pid from r left join lateral (select captured_at, bid, ask from xstock_spot_ticker_snap x where x.symbol = r.sym and x.captured_at <= r.ts and x.captured_at >= r.ts - interval '30 minutes' order by x.captured_at desc limit 1) s on true left join lateral (select q.pid from (select id::text pid, symbol, opened_at, closed_at from closed_trades where closed_at is not null union all select id::text, symbol, opened_at, null from active_open_positions) q where q.symbol = r.sym and q.opened_at <= r.ts and (q.closed_at is null or q.closed_at >= r.ts) order by q.opened_at desc limit 1) p on true order by r.sym, r.ts) to '{out}' with (format csv)
"""


def ts(s): return dt.datetime.strptime(s, '%Y-%m-%d %H:%M:%S').replace(tzinfo=dt.timezone.utc)


def pts(s):
    s = s.replace(' ', 'T')
    if s.endswith('+00'): s += ':00'
    return dt.datetime.fromisoformat(s)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--krel', type=float, required=True); ap.add_argument('--control'); ap.add_argument('--simulate', type=float); ap.add_argument('--ring', type=int, default=20)
    ap.add_argument('logs', nargs='+'); a = ap.parse_args()
    seen = set(); rows = []
    for p in a.logs:
        for line in open(p, errors='replace'):
            if 'REFUSE unvalidated' not in line or line in seen: continue
            seen.add(line); m = RX_REF.match(line)
            if m: rows.append((ts(m.group(1)).isoformat(), m.group(2), m.group(3), m.group(4)))
    d = tempfile.mkdtemp(); fin = os.path.join(d, 'r.csv'); fout = os.path.join(d, 'j.csv')
    with open(fin, 'w', newline='') as f: csv.writer(f).writerows(rows)
    subprocess.run(['psql', os.environ['DATABASE_URL'], '-q', '-v', 'ON_ERROR_STOP=1'], input=SQL.format(csv=fin, out=fout), text=True, check=True)
    J = []
    for t, sym, state, ratio, cap, bid, ask, pid in csv.reader(open(fout)):
        t = pts(t); rv = None if ratio == 'none' else float(ratio)
        spread = None; q = None
        if cap and bid and ask:
            b, k = float(bid), float(ask)
            if b > 0 and k > 0 and (t - pts(cap)).total_seconds() <= MAX_SNAP_AGE_S: spread = (k - b) / ((k + b) / 2); q = (b, k)
        J.append((sym, t, state, rv, spread, pid or f'nopos:{sym}', q))
    J.sort(key=lambda x: (x[0], x[1]))
    # per-line owned seconds
    lines = []
    for i, (sym, t, state, rv, sp, unit, q) in enumerate(J):
        nxt = J[i + 1] if i + 1 < len(J) and J[i + 1][0] == sym else None
        own = min((nxt[1] - t).total_seconds(), GAP_S) if nxt else 0.0
        contiguous = bool(nxt) and (nxt[1] - t).total_seconds() <= GAP_S and nxt[5] == unit
        lines.append((sym, t, rv, sp, unit, own, contiguous, q))
    rc = lambda rv: 'ratio=none' if rv is None else ('ratio<=kRel' if rv <= a.krel else 'ratio>kRel')
    BANDS = [f'{lo*100:g}-{c*100:g}%' for lo, c in zip([0.0] + CEILINGS[:-1], CEILINGS)]
    band = lambda sp: 'unknown' if sp is None else next((BANDS[i] for i, c in enumerate(CEILINGS) if sp <= c), '> 10%')
    print(f'# lines {len(lines)} on {len({l[0] for l in lines})} symbols; units {len({l[4] for l in lines})} '
          f'(of which no-position {len({l[4] for l in lines if l[4].startswith("nopos:")})}); snapshot as-of max age {MAX_SNAP_AGE_S:.0f} s')
    tot = collections.Counter(); grid = collections.Counter()
    for sym, t, rv, sp, unit, own, _, _q in lines:
        tot[rc(rv)] += own; grid[(rc(rv), band(sp))] += own
    bands = BANDS + ['> 10%', 'unknown']
    print('# refused HOURS by ratio class x absolute-spread band (bands are EXCLUSIVE, not cumulative; each class on its own line; no total row):')
    print('class        ' + ' | '.join(f'{b:>8}' for b in bands) + ' | class total')
    for k in ('ratio=none', 'ratio<=kRel', 'ratio>kRel'):
        print(f'{k:<12} ' + ' | '.join(f'{grid[(k, b)]/3600:8.2f}' for b in bands) + f' | {tot[k]/3600:.2f}')
    # per unit, per ceiling: longest continuous run with spread <= ceiling
    units = collections.defaultdict(list)
    for l in lines: units[l[4]].append(l)
    print('# per CEILING: holds whose longest continuous refused run with spread <= ceiling exceeds 5 / 30 min, and the max')
    best = {}
    for c in CEILINGS:
        longest = {}
        for u, ls in units.items():
            run = mx = 0.0; at = None; cur_at = None
            for sym, t, rv, sp, unit, own, cont, _q in ls:
                if sp is not None and sp <= c:
                    if run == 0: cur_at = t
                    run += own
                    if run > mx: mx, at = run, cur_at
                else: run = 0.0
                if not cont: run = 0.0
            longest[u] = (mx, at, ls[0][0])
        best[c] = longest; v = sorted(longest.values(), key=lambda x: -x[0])
        print(f'ceiling {c*100:>4g}%: >5 min {sum(1 for x in v if x[0] > 300)}; >30 min {sum(1 for x in v if x[0] > 1800)}; '
              f'max {v[0][0]/60:.1f} min ({v[0][2]} from {v[0][1].strftime("%m-%d %H:%M") if v[0][1] else "-"})')
    print('# top 10 holds by total refused time: unit symbol first_line last_line refused_h fragments longest@1% longest@3% longest@5% (min)')
    summ = []
    for u, ls in units.items():
        frags = 1 + sum(1 for l in ls[:-1] if not l[6])
        summ.append((sum(l[5] for l in ls), u, ls[0][0], ls[0][1], ls[-1][1], frags))
    for refused, u, sym, t0, t1, frags in sorted(summ, reverse=True)[:10]:
        print(f'{u[:12]} {sym} {t0.strftime("%m-%d %H:%M")} {t1.strftime("%m-%d %H:%M")} {refused/3600:.2f} {frags} '
              f'{best[0.01][u][0]/60:.1f} {best[0.03][u][0]/60:.1f} {best[0.05][u][0]/60:.1f}')
    if a.control:
        print(f'# POSITIVE CONTROL {a.control}: every unit, with its refused time by ratio class and spread band')
        for refused, u, sym, t0, t1, frags in sorted(summ, reverse=True):
            if sym != a.control: continue
            sec = collections.Counter()
            for l in units[u]: sec[(rc(l[2]), band(l[3]))] += l[5]
            print(f'  {u} {t0.isoformat()} -> {t1.isoformat()} refused {refused/3600:.2f} h fragments {frags}; '
                  + '; '.join(f'{k[0]} {k[1]} {v/3600:.2f} h' for k, v in sorted(sec.items(), key=lambda x: -x[1]) if v > 0))

    if a.simulate:
        # The P1 release predicate (candidate C), replayed over each hold's refused ticks, each tick reading its as-of quote
        # as the guard's frame: (a) the trailing window of `--ring` frames is full and its median <= ceiling; (b) this frame
        # <= ceiling; (c) >= 2 moves within the current run of frames <= ceiling; (d) BOTH sides moved within that run.
        # An unknown spread breaks the run and enters the window as over-ceiling; a fragment break (gap > GAP_S) resets.
        c = a.simulate
        print(f'# SIMULATED RELEASE at ceiling {c*100:g}% (ring {a.ring}): per hold with >= 0.25 h refused — '
              'over-ceiling share of known-spread ticks, released y/n, WALL minutes from the hold's first refused tick to the simulated release (spans gaps between fragments), refused hours after it')
        rel_n = 0; saved = 0.0; considered = 0
        for refused, u, sym, t0, t1, frags in sorted(summ, reverse=True):
            ls = units[u]; known = [l for l in ls if l[3] is not None]
            over = sum(1 for l in known if l[3] > c)
            trail = []; run_moves = 0; bm = am = False; prevq = None; rel_at = None
            for l in ls:
                sym_, t, rv, sp, unit, own, cont, q = l
                ok = sp is not None and sp <= c
                trail.append(sp if sp is not None else float('inf'))
                if len(trail) > a.ring: trail.pop(0)
                if ok:
                    if prevq is not None and q is not None:
                        if q[0] != prevq[0]: bm = True
                        if q[1] != prevq[1]: am = True
                        if q != prevq: run_moves += 1
                else:
                    run_moves = 0; bm = am = False
                med = sorted(trail)[len(trail) // 2] if len(trail) == a.ring else None
                if ok and med is not None and med <= c and run_moves >= 2 and bm and am:
                    rel_at = t; break
                prevq = q
                if not cont: trail = []; run_moves = 0; bm = am = False; prevq = None
            after = sum(l[5] for l in ls if rel_at is not None and l[1] >= rel_at)
            if refused >= 900:
                considered += 1; rel_n += rel_at is not None; saved += after
                print(f'  {sym} {u[:8]} refused {refused/3600:.2f} h; over {c*100:g}%: {over}/{len(known)} '
                      f'({(over/len(known)*100 if known else 0):.1f}%); released {"y" if rel_at else "n"}'
                      + (f' after {(rel_at - t0).total_seconds()/60:.1f} min; refused after {after/3600:.2f} h' if rel_at else ''))
        print(f'# holds >= 0.25 h refused: {considered}; predicted released {rel_n}; refused hours after first release {saved/3600:.2f} '
              '(an UPPER bound on hours saved: a released chain can be refused again)')


if __name__ == '__main__':
    main()
