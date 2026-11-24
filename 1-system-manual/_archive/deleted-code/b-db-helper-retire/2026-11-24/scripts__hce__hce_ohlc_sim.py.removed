#!/usr/bin/env python3
"""
HCE P2 — OHLC managed-exit reconstruction + validation (Gate (c)).
================================================================================
Validates the OHLC first-hit managed-exit simulator against ADMITTED trades whose
realized `netProfit` we KNOW, so we can trust the SAME simulator on REJECTED
signals (which were never taken and have no realized outcome). Per Langston Q2:
P1->P2->P3 is mandatory ordering; P2 is a HARD GO/NO-GO gate; the pass bar is
PRE-REGISTERED below (set before running — no goalpost-moving).

SIMULATOR: for a BUY at entry E with stop S (= `originalStopPrice`, the true entry
stop, sane <E) and target T (= `signal.takeProfit`, >E), scan forward 1-min OHLC
bars from entryTime; first bar with low<=S -> stop exit at S; first bar with
high>=T -> target exit at T; if a single bar straddles both -> assume STOP first
(conservative). This is a PURE stop/target sim — it does NOT model break-even or
trailing (those exit between S and T early). So for the rejected arm it yields a
CONSERVATIVE lower bound on realized EV (real BE/trailing would only improve it).

PRE-REGISTERED P2 PASS BAR (proposed to Langston 2026-06-05, BEFORE running):
  Evaluated on the held-out ADMITTED CLEAN-EXIT subset (logged exitReason in
  {target_hit, stop_hit} — the exits this pure sim can reproduce exactly):
    (i)  PRIMARY (sign / no-bias): sim win/loss SIGN matches observed on >=85%,
         AND sim aggregate win-rate within +/-5pp of observed win-rate.
    (ii) SECONDARY (magnitude): median |sim_net - obs_net| <= 0.30% (abs return).
    (iii) no-hit rate (sim finds neither level by logged exitTime+buffer) <=15%
         on the clean-exit subset (a high no-hit rate = OHLC-gap fidelity problem).
  GO if (i) holds (with (ii) as a carried error band per Langston Q3.3). NO-GO if
  sign-match <85% or a systematic win-rate bias >5pp. BE/trailing/timeout trades
  are reported separately as the known sim limitation, NOT counted in the bar.

USAGE (on staging as deploy; reads .env for DATABASE_URL, candidates from /tmp):
  su - deploy -c 'cd /home/deploy/dawntrader && python3 scripts/hce/hce_ohlc_sim.py \
     --cands /tmp/gatec_cands.jsonl'
"""
import json, os, subprocess, collections, statistics, datetime, argparse

TABLE = {'crypto_spot': 'crypto_spot_ohlc_1m', 'xstock_spot': 'xstock_spot_ohlc_1m'}


def get_dburl(envfile):
    for l in open(envfile):
        if l.startswith('DATABASE_URL='):
            return l.strip().split('=', 1)[1]
    raise SystemExit('no DATABASE_URL in ' + envfile)


def iso(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).isoformat()


def psql_ohlc(dburl, table, symbol, t0ms, t1ms):
    """Return sorted [(ts_ms, high, low)] for symbol in [t0,t1]."""
    sym = symbol.replace("'", "''")
    q = ("SELECT (extract(epoch from interval_begin)*1000)::bigint, high, low "
         "FROM %s WHERE symbol='%s' AND interval_begin BETWEEN '%s' AND '%s' "
         "ORDER BY interval_begin") % (table, sym, iso(t0ms), iso(t1ms))
    r = subprocess.run(['psql', dburl, '-At', '-F', '\t', '-c', q],
                       capture_output=True, text=True)
    bars = []
    for line in r.stdout.splitlines():
        p = line.split('\t')
        if len(p) >= 3:
            try:
                bars.append((int(p[0]), float(p[1]), float(p[2])))
            except Exception:
                pass
    return bars


def simulate(entry, stop, target, bars, t_start, t_end):
    """Pure stop/target first-hit over bars in [t_start, t_end]. Returns
    (outcome, exit_price): outcome in {stop, target, none}."""
    for ts, hi, lo in bars:
        if ts < t_start:
            continue
        if ts > t_end:
            break
        hit_stop = lo <= stop
        hit_tgt = hi >= target
        if hit_stop:           # conservative: stop wins a straddle
            return ('stop', stop)
        if hit_tgt:
            return ('target', target)
    return ('none', None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cands', default='/tmp/gatec_cands.jsonl')
    ap.add_argument('--envfile', default='/home/deploy/dawntrader/.env')
    ap.add_argument('--buffer-min', type=int, default=120, help='sim horizon = exitTime + buffer')
    ap.add_argument('--max-symbols', type=int, default=0, help='0 = all')
    args = ap.parse_args()
    dburl = get_dburl(args.envfile)

    cands = [json.loads(l) for l in open(args.cands) if l.strip()]
    # group by (ac, symbol) so we query OHLC once per symbol
    bysym = collections.defaultdict(list)
    for c in cands:
        bysym[(c['ac'], c['symbol'])].append(c)
    keys = sorted(bysym, key=lambda k: -len(bysym[k]))
    if args.max_symbols:
        keys = keys[:args.max_symbols]
    print('candidates=%d | symbols=%d | querying OHLC per symbol...' % (len(cands), len(keys)))

    results = []
    for i, (ac, sym) in enumerate(keys):
        rows = bysym[(ac, sym)]
        table = TABLE.get(ac)
        if not table:
            continue
        t0 = min(c['entryTime'] for c in rows) - 5 * 60000
        t1 = max(c['exitTime'] for c in rows) + args.buffer_min * 60000
        bars = psql_ohlc(dburl, table, sym, t0, t1)
        for c in rows:
            outcome, xp = simulate(c['entry'], c['stop'], c['target'], bars,
                                   c['entryTime'], c['exitTime'] + args.buffer_min * 60000)
            sim_gross = ((xp - c['entry']) / c['entry']) if xp is not None else None
            # use the trade's own friction (net=gross-friction); friction = obs gross - obs net
            obs_gross = (c['exitPrice'] - c['entry']) / c['entry']
            friction = obs_gross - c['net']
            sim_net = (sim_gross - friction) if sim_gross is not None else None
            results.append(dict(ac=ac, sym=sym, reason=c['reason'], strat=c['strat'],
                                obs_net=c['net'], obs_win=1 if c['net'] > 0 else 0,
                                sim_outcome=outcome,
                                sim_net=sim_net,
                                sim_win=(1 if (sim_net is not None and sim_net > 0) else 0) if outcome != 'none' else None,
                                nbars=len(bars)))
        if (i + 1) % 100 == 0:
            print('  ...%d/%d symbols' % (i + 1, len(keys)))

    # ---- evaluate against the PRE-REGISTERED bar ----
    clean = [r for r in results if r['reason'] in ('target_hit', 'stop_hit')]
    other = [r for r in results if r['reason'] not in ('target_hit', 'stop_hit')]

    def block(label, rs):
        if not rs:
            print('  %s: (none)' % label); return
        hit = [r for r in rs if r['sim_outcome'] != 'none']
        nohit = len(rs) - len(hit)
        sign_match = sum(1 for r in hit if r['sim_win'] == r['obs_win'])
        obs_wr = 100.0 * sum(r['obs_win'] for r in rs) / len(rs)
        sim_wr = 100.0 * sum(1 for r in hit if r['sim_win'] == 1) / len(hit) if hit else 0
        maglist = [abs(r['sim_net'] - r['obs_net']) for r in hit if r['sim_net'] is not None]
        medmag = 100.0 * statistics.median(maglist) if maglist else float('nan')
        print('  %s: N=%d  hit=%d nohit=%d (%.0f%% nohit)' % (label, len(rs), len(hit), nohit, 100.0 * nohit / len(rs)))
        print('      sign-match(on hit)=%.1f%%  obs-winrate=%.1f%%  sim-winrate=%.1f%% (bias=%+.1fpp)  median|net-err|=%.3f%%'
              % (100.0 * sign_match / len(hit) if hit else 0, obs_wr, sim_wr, sim_wr - obs_wr, medmag))
        return dict(n=len(rs), nohit_pct=100.0 * nohit / len(rs),
                    sign=100.0 * sign_match / len(hit) if hit else 0,
                    bias=sim_wr - obs_wr, medmag=medmag)

    print('\n' + '=' * 80)
    print('P2 VALIDATION — pure stop/target sim vs admitted realized outcomes')
    print('=' * 80)
    print('\n[CLEAN-EXIT subset = the pass-bar population]')
    cstat = block('clean(target_hit+stop_hit)', clean)
    print('\n[OTHER exits = known sim limitation, NOT in pass bar]')
    block('be/trailing/timeout', other)
    # per asset class on clean
    print('\n[clean by asset class]')
    for ac in ('crypto_spot', 'xstock_spot'):
        block('  ' + ac, [r for r in clean if r['ac'] == ac])

    print('\n' + '=' * 80)
    if cstat:
        go = (cstat['sign'] >= 85.0 and abs(cstat['bias']) <= 5.0 and cstat['nohit_pct'] <= 15.0)
        print('PRE-REGISTERED BAR: sign>=85%% (got %.1f%%), |winrate-bias|<=5pp (got %+.1f), nohit<=15%% (got %.1f%%)'
              % (cstat['sign'], cstat['bias'], cstat['nohit_pct']))
        print('VERDICT: %s' % ('GO — reconstruction validated; P3 may proceed' if go
                               else 'NO-GO — reconstruction not faithful enough; P3 reported as caveated/blocked'))
        print('  (secondary magnitude error band median|net-err|=%.3f%% carried into P3 as the delta error bar)' % cstat['medmag'])
    print('=' * 80)


if __name__ == '__main__':
    main()
