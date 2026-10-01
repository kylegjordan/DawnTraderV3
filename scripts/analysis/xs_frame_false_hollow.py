"""B-XSTOCK-BID-TRIGGER-RELAND (row 3n.q7) increment 2 OBJ-2 / P5 — THE FALSE-HOLLOW CLASSIFIER FOR WOULD-REFUSE RUNS.

Reads the `[3n.q7][XS_FRAME]` lines (increment 1, stderr — from the P4 archive, `.gz` or plain) and the xStock ticker
snapshots, and classifies every WOULD-REFUSE RUN — consecutive `frame=ok` lines on one position whose `spread` exceeds
its `thr` (the `spread_blown` arm, §L (V), which ships OFF: this measures what it WOULD have refused).

A run ENDS at: a `frame=none` line, a frame back inside the threshold, the position's last frame (its close), a gap in
that position's frames longer than GAP_S, or a process restart / deploy between two frames (a restart vacates the
comparator, `#1066`, so a run is never merged across one).

CLASSIFICATION — for a run whose frames say `bidWouldFire=stop` (the target leg is symmetric, `>= tp`):
  FALSE HOLLOW   a PRINT inside the run or within run end + 90 s is at or below the frame's `sl=` (per-frame stop, NOT
                 the closed row's) — refusing withheld a stop the market actually printed;
  TRUE HOLLOW    prints exist in that horizon and none reaches the stop;
  NOT COMPUTABLE no print in the horizon.
A PRINT is a snapshot whose `volume_24h` rose strictly over the previous snapshot of the symbol; its price is that
snapshot's `last`. The snapshot table has no trade timestamp, so a `last` with no volume rise is NOT evidence.
+5 min and +30 min are SENSITIVITY only; a split whose majority class differs between the primary and +5 min is
flagged INCONCLUSIVE.

⛔ BIASES, printed with every read (Langston inc-2 C3):
  (i)  a drop-off leaving the 24 h window can mask a rise => a missed print => toward NOT COMPUTABLE;
  (ii) `last` is only the FINAL trade in a ~4-5 s snapshot interval, so a print through the stop that recovers inside
       the same interval is invisible => toward TRUE HOLLOW, i.e. toward supporting the refusal (toward shipping);
  (iii) later horizons over-count FALSE: a print past the stop after a recovery means the refusal DELAYED, not withheld.
`volume_24h` is in units, not trades, so it cannot bound how many trades an interval held.
⛔ SEQUENCING (Langston N2): `tb=`/`trail=`/`ret=` exist only on lines emitted after the inc-1 amendment deployed; a line
without them is counted under `tb=none` and never folded into `j`/`v`.

Usage:
  python3 xs_frame_false_hollow.py --frames <file|glob>... --snaps snaps.csv [--boundaries <archive>/boundaries.log]
                                   [--pm2log ~/.pm2/pm2.log] [--deploy-record ~/dawntrader-deploy.record] [--lock-flip ISO ...]
  python3 xs_frame_false_hollow.py --self-test
snaps.csv rows: symbol,epoch_seconds,last,volume_24h — exported by `xs_frame_false_hollow_snaps.sql`.
"""
import bisect, collections, csv, glob, gzip, re, sys
from datetime import datetime, timezone

GAP_S = 10.0          # ~7 ticks of the ~1.5 s exit loop
PRIMARY_S = 90.0
SENS_S = (300.0, 1800.0)

LINE_RE = re.compile(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \+00:00: .*?\[3n\.q7\]\[XS_FRAME\] (\S+) pos=(\S+) (.*)$')
KV_RE = re.compile(r'(\w+)=(\S+)')


def ts(s):
    return datetime.strptime(s, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).timestamp()


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def segment(t):
    m = int((t % 86400) // 60)
    wd = datetime.fromtimestamp(t, timezone.utc).weekday()
    if wd < 5 and 810 <= m < 825:
        return 'open'          # 13:30-13:45Z, the open window condition (1) splits out
    if wd < 5 and 810 <= m < 1200:
        return 'rth'
    return 'off'


def read_frames(paths):
    out = []
    for pat in paths:
        for p in sorted(glob.glob(pat)) or [pat]:
            op = gzip.open if p.endswith('.gz') else open
            with op(p, 'rt', errors='replace') as f:
                for line in f:
                    m = LINE_RE.match(line.strip())
                    if not m:
                        continue
                    kv = dict(KV_RE.findall(m.group(4)))
                    out.append({
                        't': ts(m.group(1)), 'sym': m.group(2), 'pos': m.group(3),
                        'ok': kv.get('frame') == 'ok', 'spread': num(kv.get('spread')), 'thr': num(kv.get('thr')),
                        'sl': num(kv.get('sl')), 'tp': num(kv.get('tp')), 'fire': kv.get('bidWouldFire', 'no'),
                        'tb': kv.get('tb', 'none'), 'markExit': kv.get('markExit') == 'y',
                    })
    out.sort(key=lambda r: (r['pos'], r['t']))
    return out


def read_boundaries(pm2log, deploy_record):
    b = []
    if pm2log:
        rx = PM2_RE  # one constant for both readers (Langston inc-2 Step-4 nit)
        with open(pm2log, errors='replace') as f:
            for line in f:
                m = rx.match(line)
                if m:
                    b.append(datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc).timestamp())
    if deploy_record:
        for line in open(deploy_record):
            if line.startswith('deployed_at='):
                b.append(datetime.strptime(line.strip().split('=', 1)[1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp())
    return sorted(b)


REFLOG_RE = re.compile(r'^([0-9a-f]{7,40}) ([0-9a-f]{7,40}) .*? (\d{9,11}) [+-]\d{4}\t(.*)$')
PM2_RE = re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}): PM2 log: App \[dawntrader:\d+\] (starting|online|exited)')  # the extractor's alternation


def read_boundary_archive(path):
    """The extractor's boundaries.log (P4): pm2 restart markers + reflog lines. Returns (times, reflog_entries).
    Langston P4 r4 rider: the reflog lines chain `old_sha -> new_sha`, so the archive is SELF-CONTIGUOUS — assert the chain
    instead of trusting the extractor's byte offsets (that also catches a rewrite-and-regrow inside one cadence)."""
    times, reflog = [], []
    for line in open(path, errors='replace'):
        line = line.rstrip('\n')
        m = PM2_RE.match(line)
        if m:
            times.append(datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc).timestamp())
            continue
        m = REFLOG_RE.match(line)
        if m:
            reflog.append((m.group(1), m.group(2), float(m.group(3)), m.group(4)))
            times.append(float(m.group(3)))
    return sorted(times), reflog


def reflog_chain_breaks(reflog):
    """Indices i where entry i's OLD sha is not entry i-1's NEW sha (duplicates from a re-read are skipped first)."""
    seen, uniq = set(), []
    for e in reflog:
        if e in seen:
            continue
        seen.add(e); uniq.append(e)
    uniq.sort(key=lambda e: e[2])
    return [i for i in range(1, len(uniq)) if uniq[i][0] != uniq[i - 1][1]], uniq


def build_runs(frames, boundaries):
    runs = []
    by_pos = collections.defaultdict(list)
    for r in frames:
        by_pos[r['pos']].append(r)
    for pos, fr in by_pos.items():
        cur = None
        for i, r in enumerate(fr):
            wr = r['ok'] and r['spread'] is not None and r['thr'] is not None and r['spread'] > r['thr']
            if cur is not None:
                prev = fr[i - 1]
                crossed = bisect.bisect_right(boundaries, prev['t']) != bisect.bisect_right(boundaries, r['t'])
                if (not wr) or (r['t'] - prev['t'] > GAP_S) or crossed:
                    runs.append(cur); cur = None
            if wr:
                if cur is None:
                    cur = {'pos': pos, 'sym': r['sym'], 't0': r['t'], 'frames': [], 'seg': segment(r['t'])}
                cur['frames'].append(r)
        if cur is not None:
            runs.append(cur)
    for run in runs:
        fr = run['frames']
        run['t1'] = fr[-1]['t']
        run['leg'] = 'stop' if any(f['fire'] == 'stop' for f in fr) else 'target' if any(f['fire'] == 'target' for f in fr) else 'none'
        run['sl'] = fr[-1]['sl']; run['tp'] = fr[-1]['tp']
        tbs = {f['tb'] for f in fr}
        run['tb'] = 'v' if 'v' in tbs else 'j' if 'j' in tbs else 'none'
    return runs


def read_prints(snaps_path=None, rows=None):
    """symbol -> sorted [(t, price)] of snapshots where volume_24h rose strictly."""
    raw = collections.defaultdict(list)
    it = rows if rows is not None else csv.reader(open(snaps_path))
    for row in it:
        if len(row) != 4:
            continue  # psql command tags (e.g. `SET`) if run without -q
        s, t, last, vol = row
        raw[s].append((float(t), num(last), num(vol)))
    prints = {}
    for s, xs in raw.items():
        xs.sort()
        out = []
        for (t0, _, v0), (t1, l1, v1) in zip(xs, xs[1:]):
            if v0 is not None and v1 is not None and l1 is not None and v1 > v0:
                out.append((t1, l1))
        prints[s] = out
    return prints


def merge_episodes(runs, boundaries):
    """Langston inc-2 Step-4 attack (2): a book OSCILLATING around the threshold fragments into many one-frame runs whose
    +90 s horizons overlap, so one print gets counted against many of them (measured: 60 frames -> 30 runs, one print
    below the stop -> 25 of 30 FALSE). Runs of one position are merged into one EPISODE when the next run starts inside
    the previous run's primary horizon (<= PRIMARY_S after its end) and no restart/deploy boundary lies between them.
    Episodes, not runs, are classified; both counts are published."""
    eps = []
    by_pos = collections.defaultdict(list)
    for r in runs:
        by_pos[r['pos']].append(r)
    for pos, rs in by_pos.items():
        rs.sort(key=lambda r: r['t0'])
        cur = None
        for r in rs:
            crossed = cur is not None and bisect.bisect_right(boundaries, cur['t1']) != bisect.bisect_right(boundaries, r['t0'])
            if cur is not None and r['t0'] - cur['t1'] <= PRIMARY_S and not crossed:
                cur['frames'] = cur['frames'] + r['frames']; cur['t1'] = r['t1']; cur['n_runs'] += 1
            else:
                if cur is not None:
                    eps.append(cur)
                cur = dict(r); cur['frames'] = list(r['frames']); cur['n_runs'] = 1
        if cur is not None:
            eps.append(cur)
    for e in eps:
        fr = e['frames']
        e['leg'] = 'stop' if any(f['fire'] == 'stop' for f in fr) else 'target' if any(f['fire'] == 'target' for f in fr) else 'none'
        e['sl'] = fr[-1]['sl']; e['tp'] = fr[-1]['tp']
        tbs = {f['tb'] for f in fr}
        e['tb'] = 'v' if 'v' in tbs else 'j' if 'j' in tbs else 'none'
    return eps


def classify(run, prints, horizon):
    xs = prints.get(run['sym'], [])
    lo = bisect.bisect_left(xs, (run['t0'], float('-inf')))
    hi = bisect.bisect_right(xs, (run['t1'] + horizon, float('inf')))
    window = [p for _, p in xs[lo:hi]]
    if not window:
        return 'NOT_COMPUTABLE'
    if run['leg'] == 'stop':
        return 'FALSE' if run['sl'] is not None and any(p <= run['sl'] for p in window) else 'TRUE'
    return 'FALSE' if run['tp'] is not None and any(p >= run['tp'] for p in window) else 'TRUE'


def report(runs, prints, lock_flips, boundaries=()):
    episodes = merge_episodes(runs, list(boundaries))
    print(f"# XS_FRAME would-refuse EPISODES (runs merged when the next starts inside the previous run's +90 s horizon): "
          f"{len(episodes)} episodes from {len(runs)} runs — FALSE / TRUE / NOT_COMPUTABLE per split (primary horizon: inside the episode or <= +90 s)")
    print('# biases: (i) masked print -> toward NOT_COMPUTABLE; (ii) intra-interval print-and-recover invisible -> toward TRUE (supports refusing);'
          ' (iii) later horizons over-count FALSE (delayed, not withheld); (iv) RESIDUAL after episode merging: the +5/+30 min sensitivity'
          ' horizons of adjacent episodes can still share a print -> toward FALSE in those columns only. volume_24h is units, not a trade count.')
    if lock_flips:
        print(f'# lock flips in window at {lock_flips}: the stop leg is a LOWER BOUND after each; splits below are before/after')
    groups = collections.defaultdict(list)
    for r in episodes:
        era = sum(1 for f in lock_flips if r['t0'] >= f)
        groups[(r['seg'], r['tb'], r['leg'], era)].append(r)
    print('split(seg,tb,leg,era) episodes frames primary(F/T/NC) +5min(F/T/NC) +30min(F/T/NC) flips_primary_to_5min verdict')
    for key in sorted(groups):
        rs = groups[key]
        nfr = sum(len(r['frames']) for r in rs)
        if key[2] == 'none':
            print(f'{key} {len(rs)} {nfr} — (no stop/target would have fired; nothing withheld)')
            continue
        cls = {h: [classify(r, prints, h) for r in rs] for h in (PRIMARY_S,) + SENS_S}
        c = {h: collections.Counter(v) for h, v in cls.items()}
        flips = sum(1 for a, b in zip(cls[PRIMARY_S], cls[SENS_S[0]]) if a != b)

        def maj(cn):
            return 'FALSE' if cn['FALSE'] > cn['TRUE'] else 'TRUE' if cn['TRUE'] > cn['FALSE'] else 'TIE'
        verdict = 'INCONCLUSIVE' if maj(c[PRIMARY_S]) != maj(c[SENS_S[0]]) else maj(c[PRIMARY_S])
        f = lambda cn: f"{cn['FALSE']}/{cn['TRUE']}/{cn['NOT_COMPUTABLE']}"
        print(f'{key} {len(rs)} {nfr} {f(c[PRIMARY_S])} {f(c[SENS_S[0]])} {f(c[SENS_S[1]])} {flips} {verdict}')


def self_test():
    ok = True

    def line(t, sym, pos, spread, thr, sl, fire, frame='ok', tb='j'):
        return (f"{datetime.fromtimestamp(t, timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} +00:00: [3n.q7][XS_FRAME] {sym} pos={pos} "
                f"frame={frame} basis=raw_guarded mark=400 sl={sl} tp=500 bid=1 ask=2 spread={spread} thr={thr} trail=0.00460 ret=0.00460 "
                f"tb={tb} bidWouldFire={fire} markExit=n exitReason=none")
    T = datetime(2026, 9, 21, 0, 15, tzinfo=timezone.utc).timestamp()   # a Monday 00:15Z — off-hours
    lines = []
    for k in range(4):   # (a) MDB-shaped stub: blown for 4 ticks, the market trades 385-400, stop 354.79
        lines.append(line(T + 1.5 * k, 'MDB/USD', 'p-mdb', 0.3246, 0.0138, 354.79, 'stop'))
    for k in range(4):   # (b) a real move: prints go through the stop inside the run
        lines.append(line(T + 1.5 * k, 'REAL/USD', 'p-real', 0.05, 0.012, 100.0, 'stop'))
    for k in range(4):   # (c) frozen last, no volume rise: nothing traded
        lines.append(line(T + 1.5 * k, 'FRZ/USD', 'p-frz', 0.05, 0.012, 100.0, 'stop'))
    import tempfile, os
    fd, path = tempfile.mkstemp(suffix='.log'); os.write(fd, ('\n'.join(lines) + '\n').encode()); os.close(fd)
    frames = read_frames([path]); os.unlink(path)
    runs = build_runs(frames, [])
    snaps = []
    for k in range(6):
        snaps.append(('MDB/USD', T - 5 + 5 * k, 386.0 + k, 1000 + k))       # trades at 386-391, never <= 354.79
        snaps.append(('REAL/USD', T - 5 + 5 * k, 101.0 - 1.0 * k, 500 + k))  # trades 101 -> 96, through the 100 stop
        snaps.append(('FRZ/USD', T - 5 + 5 * k, 95.0, 700))                  # last BELOW the stop but NO volume rise
    prints = read_prints(rows=[(s, t, l, v) for s, t, l, v in snaps])
    got = {r['sym']: classify(r, prints, PRIMARY_S) for r in runs}
    want = {'MDB/USD': 'TRUE', 'REAL/USD': 'FALSE', 'FRZ/USD': 'NOT_COMPUTABLE'}
    for k, v in want.items():
        status = 'ok ' if got.get(k) == v else 'FAIL'
        ok &= got.get(k) == v
        print(f'{status} {k}: expected {v}, got {got.get(k)}')
    # run termination: a restart boundary between two frames splits a run
    split = build_runs(frames, [T + 2.0])
    n_mdb = sum(1 for r in split if r['sym'] == 'MDB/USD')
    print(f"{'ok ' if n_mdb == 2 else 'FAIL'} a restart between frames splits the run (MDB runs: {n_mdb}, expected 2)")
    ok &= n_mdb == 2
    # the reflog chain (Langston P4 r4 rider): an intact chain has no breaks; a missing deploy line is a break
    good = [('a', 'b', 1.0, 'reset: moving to b'), ('b', 'c', 2.0, 'reset: moving to c'), ('b', 'c', 2.0, 'reset: moving to c')]
    gapped = [('a', 'b', 1.0, 'x'), ('c', 'd', 3.0, 'x')]
    b_good, _ = reflog_chain_breaks(good); b_gap, _ = reflog_chain_breaks(gapped)
    print(f"{'ok ' if b_good == [] else 'FAIL'} an intact reflog chain (with a re-read duplicate) has no breaks")
    print(f"{'ok ' if b_gap == [1] else 'FAIL'} a missing reflog line is flagged as a chain break")
    ok &= b_good == [] and b_gap == [1]
    # oscillation (Langston attack 2): 60 frames alternating across thr -> 30 one-frame runs; one print below the stop must
    # count ONCE (one episode), not against 25 of 30 runs
    osc = [line(T + 1.5 * k, 'OSC/USD', 'p-osc', 0.05 if k % 2 == 0 else 0.005, 0.012, 100.0, 'stop') for k in range(60)]
    fd, path = tempfile.mkstemp(suffix='.log'); os.write(fd, ('\n'.join(osc) + '\n').encode()); os.close(fd)
    osc_runs = build_runs(read_frames([path]), []); os.unlink(path)
    osc_eps = merge_episodes(osc_runs, [])
    oprints = read_prints(rows=[('OSC/USD', T + 10, 101.0, 1), ('OSC/USD', T + 15, 99.0, 2)])
    n_false = sum(1 for e in osc_eps if classify(e, oprints, PRIMARY_S) == 'FALSE')
    got = (len(osc_runs), len(osc_eps), n_false)
    print(f"{'ok ' if got == (30, 1, 1) else 'FAIL'} an oscillating book: {got[0]} runs -> {got[1]} episode, the one print counts {got[2]} time (want 30, 1, 1)")
    ok &= got == (30, 1, 1)
    split_eps = merge_episodes(osc_runs, [T + 30.0])
    print(f"{'ok ' if len(split_eps) == 2 else 'FAIL'} a restart inside the horizon keeps two episodes (got {len(split_eps)})")
    ok &= len(split_eps) == 2
    print('SELF-TEST', 'PASS' if ok else 'FAIL')
    return 0 if ok else 1


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
    frames = read_frames(many('--frames'))
    bounds = read_boundaries((many('--pm2log') or [None])[0], (many('--deploy-record') or [None])[0])
    for path in many('--boundaries'):
        t, rl = read_boundary_archive(path)
        bounds = sorted(set(bounds) | set(t))
        breaks, uniq = reflog_chain_breaks(rl)
        print(f'# boundary archive {path}: {len(t)} boundary times, {len(uniq)} reflog entries, chain breaks: {len(breaks)}'
              + (' — spans after a break are NOT sha-attributable: ' + ', '.join(
                  datetime.fromtimestamp(uniq[i][2], timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ') for i in breaks) if breaks else ''))
    flips = sorted(datetime.fromisoformat(x.replace('Z', '+00:00')).timestamp() for x in many('--lock-flip'))
    runs = build_runs(frames, bounds)
    print(f'# frames read: {len(frames)} (frame=ok {sum(1 for f in frames if f["ok"])}), positions: {len({f["pos"] for f in frames})},'
          f' restart/deploy boundaries: {len(bounds)}, runs: {len(runs)}')
    report(runs, read_prints(many('--snaps')[0]), flips, bounds)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
