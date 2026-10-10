#!/usr/bin/env python3
"""B-XSTOCK-BID-TRIGGER-RELAND increment A, Step 2 — the measurement that decides whether the ring-independent release
bound (was row 66 / `3n.q5`, HOMED by `8a-P4a` §A7 with "REOPENS if the named arm's logged real ratios show a held symbol
stranded") must be built, and how much of the stranding the KKR reseed-resets-escape fix alone would cure.

OBJECT: the exit loop's own stderr lines (PM2 `error*.log`):
  `[B-XSTOCK-FEED-SANITY][BOOK_STATE] <SYM> REFUSE unvalidated state=<s> validated=<v> framesSinceSeed=<n> ratio=<r> reasons=<..>`
  `[8a-P4a][BOOK_STATE] <SYM> SEED_ESCAPED ...`
  `[B-XSTOCK-FEED-SANITY][BOOK_STATE] <SYM> COMPARATOR_CLEARED reason=<why> ...`
  `[B-XSTOCK-FEED-SANITY][BOOK_STATE] <SYM> SEED_IMPLAUSIBLE ...`
`ratio` = the chain's current trailing median spread ÷ the retained ring's median (`takeChainRefusalBasis`); `none` = no
ring or no full trailing window. kRel (live) = 3.

EPISODE: consecutive REFUSE lines on one symbol with no gap > GAP_S. For each: start, end, duration, its END EVENT (the
first SEED_ESCAPED / COMPARATOR_CLEARED on the symbol within END_S after the last line, else `none` — position closed,
log rotated, or still open at the window end), and the STRANDED time: the time the episode spent refusing while
`ratio <= kRel`, i.e. the book's own spread back within the band the escape uses, yet no escape. (The escape also needs
a FULL trailing ring and >= 2 moves in the plausible run; stranded time is therefore an UPPER bound on what a
ring-independent bound could release.)
A refusal with `state=two_sided` and `ratio=none` is the case the escape structurally cannot reach (no ring to judge
against) — counted separately.

Usage: python3 xstock-refusal-episodes.py --krel 3 LOG [LOG ...]   (pass error__*.log AND error.log; R2a)
"""
import argparse, collections, datetime as dt, re

GAP_S = 60.0
END_S = 10.0
TS = r'^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \+00:00: '
RX_REF = re.compile(TS + r'\[B-XSTOCK-FEED-SANITY\]\[BOOK_STATE\] (\S+) REFUSE unvalidated state=(\S+) validated=(\S+) framesSinceSeed=(\S+) ratio=(\S+)')
RX_ESC = re.compile(TS + r'\[8a-P4a\]\[BOOK_STATE\] (\S+) SEED_ESCAPED')
RX_CLR = re.compile(TS + r'\[B-XSTOCK-FEED-SANITY\]\[BOOK_STATE\] (\S+) COMPARATOR_CLEARED reason=(\S+)')
RX_IMP = re.compile(TS + r'\[B-XSTOCK-FEED-SANITY\]\[BOOK_STATE\] (\S+) SEED_IMPLAUSIBLE')


def ts(s): return dt.datetime.strptime(s, '%Y-%m-%d %H:%M:%S').replace(tzinfo=dt.timezone.utc).timestamp()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--krel', type=float, required=True); ap.add_argument('logs', nargs='+')
    a = ap.parse_args()
    refs = collections.defaultdict(list); ends = collections.defaultdict(list); imps = collections.Counter()
    seen = set()
    for p in a.logs:
        for line in open(p, errors='replace'):
            if 'BOOK_STATE]' not in line: continue
            if line in seen: continue          # rotated copies can overlap
            seen.add(line)
            m = RX_REF.match(line)
            if m:
                r = m.group(6); rv = float(r) if r not in ('none',) else None
                refs[m.group(2)].append((ts(m.group(1)), m.group(3), rv)); continue
            m = RX_ESC.match(line)
            if m: ends[m.group(2)].append((ts(m.group(1)), 'SEED_ESCAPED')); continue
            m = RX_CLR.match(line)
            if m: ends[m.group(2)].append((ts(m.group(1)), 'CLEARED:' + m.group(3))); continue
            m = RX_IMP.match(line)
            if m: imps[m.group(2)] += 1
    eps = []
    for sym, rs in refs.items():
        rs.sort(); cur = None
        for t, state, r in rs:
            if cur and t - cur['t1'] > GAP_S:
                eps.append(cur); cur = None
            if cur is None:
                cur = {'sym': sym, 't0': t, 't1': t, 'n': 0, 'strand_s': 0.0, 'none_two_sided': 0, 'last_t': t, 'last_r': r, 'ratios': []}
            # stranded time accrues between consecutive lines while the earlier line's ratio was <= kRel
            if cur['n'] > 0 and cur['last_r'] is not None and cur['last_r'] <= a.krel:
                cur['strand_s'] += min(t - cur['last_t'], GAP_S)
            if r is None and state == 'two_sided': cur['none_two_sided'] += 1
            if r is not None: cur['ratios'].append(r)
            cur['t1'] = t; cur['n'] += 1; cur['last_t'] = t; cur['last_r'] = r
        if cur: eps.append(cur)
    for e in eps:
        nxt = [(t, k) for t, k in ends.get(e['sym'], []) if e['t1'] - 2 <= t <= e['t1'] + END_S]
        e['end'] = nxt[0][1] if nxt else 'none'
    eps.sort(key=lambda e: e['t0'])
    tot = len(eps); dur = sorted(e['t1'] - e['t0'] for e in eps)
    print(f'# REFUSE-unvalidated episodes (gap > {GAP_S:.0f} s splits): {tot} on {len({e["sym"] for e in eps})} symbols; '
          f'lines {sum(e["n"] for e in eps)}; SEED_IMPLAUSIBLE lines {sum(imps.values())}')
    if not eps: return
    pct = lambda xs, q: xs[min(len(xs) - 1, int(q * (len(xs) - 1)))]
    print(f'# episode duration s: median {pct(dur,.5):.0f} p90 {pct(dur,.9):.0f} max {dur[-1]:.0f}')
    endc = collections.Counter(e['end'].split(':')[0] if e['end'].startswith('CLEARED') else e['end'] for e in eps)
    endr = collections.Counter(e['end'] for e in eps if e['end'].startswith('CLEARED'))
    print('# end events:', dict(endc), '| clear reasons:', dict(endr))
    st = sorted((e['strand_s'] for e in eps), reverse=True)
    print(f'# STRANDED time (refusing while ratio <= kRel {a.krel}): total {sum(st)/3600:.2f} h; episodes with > 5 min stranded: '
          f'{sum(1 for x in st if x > 300)}; > 30 min: {sum(1 for x in st if x > 1800)}')
    print('# episodes with state=two_sided ratio=none lines (unreachable by the escape):', sum(1 for e in eps if e['none_two_sided']))
    print('top 12 by stranded time: sym start(UTC) dur_min stranded_min end n_lines ratio_min ratio_med')
    for e in sorted(eps, key=lambda e: -e['strand_s'])[:12]:
        rr = sorted(e['ratios']); rmin = f'{rr[0]:.2f}' if rr else '-'; rmed = f'{rr[len(rr)//2]:.2f}' if rr else '-'
        print(f"{e['sym']} {dt.datetime.utcfromtimestamp(e['t0']).strftime('%m-%d %H:%M')} {(e['t1']-e['t0'])/60:.1f} "
              f"{e['strand_s']/60:.1f} {e['end']} {e['n']} {rmin} {rmed}")


if __name__ == '__main__':
    main()
