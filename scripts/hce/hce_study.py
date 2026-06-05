#!/usr/bin/env python3
"""
Hidden-Contextual-Edge (HCE) Study — re-runnable analysis engine.
================================================================================
Kyle directive 2026-06-04; plan: Claude Comms and Packages/Scope Files/
HIDDEN_CONTEXTUAL_EDGE_STUDY_PLAN.md (Langston-approved v2).

GOAL: for EVERY strategy, BULLISH-ONLY, find the contextual conditions
(regime, DBS, continuation-vs-reversal, confidence, phase, ...) under which its
WINNERS cluster, so each strategy can be gated to its favorable context to lift
BOTH win-rate AND per-trade expectancy. Identify-only (no system tuning).

This is the re-runnable engine for the periodic ML drift-scan (plan S6). It reads
the VTS daily JSON trade logs (all context is embedded in each record) + a dumped
xStock-universe symbol list (for asset-class resolution). Stdlib only — runs on
the staging box's python3 with no extra deps.

METHODOLOGY (S1-verified 2026-06-05, see HCE_S1_FINDINGS_AND_METHODOLOGY_rev1.md):
  - Gate(a) PASS: outcome = realized `netProfit` (mechanically net-of-friction at
    source; net=gross-frictionCost holds on all 22,810 rows, max_dev 0.0). We use
    netProfit directly; we do NOT re-derive admitted outcomes from geometry (D1).
  - NEVER pool crypto + xStock (different friction/microstructure). Resolver =
    explicit assetClass -> collision-set->crypto -> xstock-universe->xstock ->
    temporal-guard(pre-2026-04-30 = crypto) -> crypto default.
  - Data-quality: `signal.stopLoss >= entryPrice` (impossible for a bullish long)
    flags a corrupt-stop cohort whose sim outcome may be inflated. We report every
    grid twice: ALL vs ok-geometry-only (D2), so the artifact is always visible.
  - Calibration-robustness (plan 1a): continuation derived from RAW DBS sign;
    DBS binned in FIXED ABSOLUTE bands (not quantiles); dose-response reported.
  - Stats: expectancy t-stat (mean/(sd/sqrt(N))), profit-factor, win-rate, AUC
    (Mann-Whitney, feature-vs-win), hard floor min-cell (default 50), BH-FDR q=0.10.

USAGE (on staging, where the logs live):
  python3 scripts/hce/hce_study.py \
      --logs-dir /home/deploy/dawntrader/logs/virtual_trades \
      --xstock-universe /tmp/xs_univ.txt \
      --section all --min-cell 50

Output is a plain-text report to stdout (capture to a file).
"""
import argparse, json, os, glob, math, datetime
from collections import Counter, defaultdict

# ── asset-class resolution constants (mirror shared/asset-classes.ts) ──────────
COLLISION = {
    'BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD',
    'CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR',
}
# xStock OHLC + onboarding begins 2026-04-30; nothing before that can be an xStock.
XSTOCK_ONBOARD_MS = datetime.datetime(2026, 4, 30, tzinfo=datetime.timezone.utc).timestamp() * 1000
# DBS absolute bands (fixed units, NOT quantiles — calibration-robust per plan 1a.2)
DBS_BANDS = [(-9, -0.30, 'strong_down'), (-0.30, -0.10, 'weak_down'),
             (-0.10, 0.10, 'neutral'), (0.10, 0.30, 'weak_up'), (0.30, 9, 'strong_up')]
CONF_BANDS = [(-9, 0.20, 'conf_lo'), (0.20, 0.35, 'conf_mid'), (0.35, 9, 'conf_hi')]

isnum = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)


def band(value, bands):
    if not isnum(value):
        return None
    for lo, hi, name in bands:
        if lo <= value < hi:
            return name
    return None


# ── loaders ───────────────────────────────────────────────────────────────────
def load_xstock_universe(path):
    if not path or not os.path.exists(path):
        return set()
    return set(l.strip() for l in open(path) if l.strip())


def load_trades(logs_dir):
    trades, bad = [], []
    for f in sorted(glob.glob(os.path.join(logs_dir, '*.json'))):
        try:
            d = json.loads(open(f).read())
            if isinstance(d, dict):
                d = [d]
            trades.extend(d)
        except Exception as e:
            bad.append((os.path.basename(f), str(e)[:50]))
    closed = [t for t in trades if t.get('status') == 'closed' and isnum(t.get('netProfit'))]
    return closed, bad


def symbol_of(t):
    s = (t.get('signal') or {}).get('symbol')
    if s:
        return s
    i = t.get('id', '')
    p = i.split('_')
    return (p[1] + '/' + p[2]) if len(p) >= 3 else '?'


def resolve_asset_class(t, xuniv):
    ac = t.get('assetClass')
    if ac:
        return ac
    s = symbol_of(t)
    et = t.get('entryTime') or t.get('exitTime') or 0
    if et and et < XSTOCK_ONBOARD_MS:
        return 'crypto_spot'          # temporal guard
    if s in COLLISION:
        return 'crypto_spot'          # collision -> crypto (resolver semantics)
    if s in xuniv:
        return 'xstock_spot'
    return 'crypto_spot'


def month_of(t):
    ts = t.get('exitTime') or t.get('entryTime')
    return datetime.datetime.fromtimestamp(ts / 1000, datetime.timezone.utc).strftime('%Y-%m') if ts else '??'


def geom_ok(t):
    """False ONLY for the units-bug cohort: (stopLoss-entry)/entry > 0.5 (e.g. STX
    stop=818 on a $0.25 entry) — an unreachable stop whose recorded sim exit is an
    artifact. S1 verify 2026-06-05: signal.stopLoss >= entry by a NORMAL magnitude
    is NOT corruption — it is the FINAL trailed/break-even stop of a WINNING trade
    (94% of that cohort exit above entry via break_even_stop/target/trailing;
    `originalStopPrice` holds the true entry stop, sane below entry). Conditioning
    on stopLoss>=entry would be OUTCOME-conditioning (winners trail their stop up),
    so we exclude ONLY the ~25 units-bugs and keep every trailed-stop winner.
    USE `originalStopPrice` (not signal.stopLoss) for entry geometry in Gate (c)."""
    sg = t.get('signal') or {}
    e, s = sg.get('entryPrice'), sg.get('stopLoss')
    if isnum(e) and isnum(s) and e > 0 and (s - e) / e > 0.5:
        return False
    return True


def derive(t, xuniv):
    sg = t.get('signal') or {}
    dbs = t.get('pairDirectionalBiasScore')
    gdbs = t.get('globalDirectionalBiasScore')
    net = t.get('netProfit')
    cont = None
    if isnum(dbs):
        cont = 'continuation' if dbs > 0 else ('reversal' if dbs < 0 else 'neutral')
    return {
        'ac': resolve_asset_class(t, xuniv),
        'strategy': t.get('strategy') or '?',
        'regime': t.get('regime') or '?',
        'gregime': t.get('globalRegime'),
        'net': net,
        'gross': t.get('grossProfit'),
        'win': 1 if net > 0 else 0,
        'month': month_of(t),
        'entry_ms': t.get('entryTime') or t.get('exitTime') or 0,
        'geom_ok': geom_ok(t),
        'dbs': dbs,
        'gdbs': gdbs,
        'continuation': cont,
        'dbs_band': band(dbs, DBS_BANDS),
        'gdbs_band': band(gdbs, DBS_BANDS),
        'conf': t.get('predictiveConfidence'),
        'conf_band': band(t.get('predictiveConfidence'), CONF_BANDS),
        'phase': t.get('phase'),
        'signalType': t.get('signalType'),
        'pool': t.get('pool'),
        'symbol': symbol_of(t),
        'exitReason': t.get('exitReason') or t.get('resultType'),
    }


# ── stats ──────────────────────────────────────────────────────────────────────
def mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def sd(xs):
    if len(xs) < 2:
        return 0.0
    m = mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def tstat(xs):
    if len(xs) < 2:
        return 0.0
    s = sd(xs)
    return (mean(xs) / (s / math.sqrt(len(xs)))) if s > 0 else 0.0


def pf(nets):
    pos = sum(n for n in nets if n > 0)
    neg = -sum(n for n in nets if n < 0)
    return (pos / neg) if neg > 1e-12 else float('inf')


def auc_win(values, wins):
    """AUC of `value` predicting win (Mann-Whitney). values aligned with wins(0/1)."""
    pairs = [(v, w) for v, w in zip(values, wins) if isnum(v)]
    if not pairs:
        return None
    pairs.sort(key=lambda x: x[0])
    # average ranks
    ranks = [0.0] * len(pairs)
    i = 0
    while i < len(pairs):
        j = i
        while j + 1 < len(pairs) and pairs[j + 1][0] == pairs[i][0]:
            j += 1
        r = (i + j) / 2.0 + 1
        for k in range(i, j + 1):
            ranks[k] = r
        i = j + 1
    npos = sum(w for _, w in pairs)
    nneg = len(pairs) - npos
    if npos == 0 or nneg == 0:
        return None
    sum_pos = sum(ranks[k] for k in range(len(pairs)) if pairs[k][1] == 1)
    auc = (sum_pos - npos * (npos + 1) / 2.0) / (npos * nneg)
    return auc


def bh_fdr(pvals, q=0.10):
    """Benjamini-Hochberg: return set of indices that pass at level q."""
    idx = sorted(range(len(pvals)), key=lambda i: pvals[i])
    m = len(pvals)
    passed = set()
    kmax = -1
    for rank, i in enumerate(idx, start=1):
        if pvals[i] <= q * rank / m:
            kmax = rank
    for rank, i in enumerate(idx, start=1):
        if rank <= kmax:
            passed.add(i)
    return passed


def p_from_t(t, n):
    """Two-sided p from t via normal approx (n>30 fine here)."""
    z = abs(t)
    # survival of standard normal *2
    return 2.0 * 0.5 * math.erfc(z / math.sqrt(2))


def cell(rows):
    nets = [r['net'] for r in rows]
    n = len(nets)
    w = sum(r['win'] for r in rows)
    return dict(n=n, win=100.0 * w / n if n else 0, exp=100.0 * mean(nets),
               pf=pf(nets), t=tstat(nets), med=100.0 * sorted(nets)[n // 2] if n else 0)


def fmt_cell(label, c, floor):
    flag = '' if c['n'] >= floor else '  (<%d LOW-N)' % floor
    pfs = ('%.2f' % c['pf']) if c['pf'] != float('inf') else 'inf'
    return '%-46s N=%6d win=%5.1f%% exp=%+7.4f%% PF=%5s t=%+5.1f%s' % (
        label[:46], c['n'], c['win'], c['exp'], pfs, c['t'], flag)


# ── sections ────────────────────────────────────────────────────────────────────
def S2(rows, floor, out):
    out('\n' + '=' * 90)
    out('S2 — HEADLINE GRID  (asset_class x regime x strategy)   [ALL vs units-bug-excluded; trailed-stop winners KEPT]')
    out('=' * 90)
    for ac in ['crypto_spot', 'xstock_spot']:
        acr = [r for r in rows if r['ac'] == ac]
        ok = [r for r in acr if r['geom_ok']]
        out('\n### %s — N=%d (kept %d, units-bug %d)' % (ac, len(acr), len(ok), len(acr) - len(ok)))
        out('  -- class summary --')
        out('   ALL          ' + fmt_cell('', cell(acr), floor))
        out('   units-bug-ex ' + fmt_cell('', cell(ok), floor))
        out('  -- by regime (units-bug-excluded) --')
        byr = defaultdict(list)
        for r in ok:
            byr[r['regime']].append(r)
        for rg in sorted(byr, key=lambda k: -len(byr[k])):
            out('   ' + fmt_cell(rg, cell(byr[rg]), floor))
        out('  -- by strategy (units-bug-excluded) --')
        bys = defaultdict(list)
        for r in ok:
            bys[r['strategy']].append(r)
        for s in sorted(bys, key=lambda k: -len(bys[k])):
            out('   ' + fmt_cell(s, cell(bys[s]), floor))
        out('  -- regime x strategy cells (units-bug-excluded, N>=floor), best+worst by exp --')
        cells = []
        rs = defaultdict(list)
        for r in ok:
            rs[(r['regime'], r['strategy'])].append(r)
        for (rg, s), rws in rs.items():
            c = cell(rws)
            if c['n'] >= floor:
                cells.append(('%s | %s' % (rg, s), c))
        cells.sort(key=lambda x: -x[1]['exp'])
        for lab, c in cells[:8]:
            out('   BEST  ' + fmt_cell(lab, c, floor))
        for lab, c in cells[-5:]:
            out('   WORST ' + fmt_cell(lab, c, floor))


def single_dim(rows, feat, floor, out, label=None):
    by = defaultdict(list)
    for r in rows:
        v = r.get(feat)
        if v is None:
            continue
        by[v].append(r)
    keys = [k for k in by if len(by[k]) >= floor]
    if not keys:
        return
    out('   [%s]' % (label or feat))
    for k in sorted(keys, key=lambda k: -cell(by[k])['exp']):
        out('     ' + fmt_cell(str(k), cell(by[k]), floor))


def S3(rows, floor, out):
    out('\n' + '=' * 90)
    out('S3 — SINGLE-DIM + INTERACTION SCANS + WINNER-VS-LOSER  (units-bug-excluded)')
    out('=' * 90)
    feats = ['regime', 'gregime', 'continuation', 'dbs_band', 'gdbs_band',
             'conf_band', 'phase', 'signalType', 'pool']
    for ac in ['crypto_spot', 'xstock_spot']:
        ok = [r for r in rows if r['ac'] == ac and r['geom_ok']]
        out('\n### %s — single-dimension feature scans (each vs win/exp) ###' % ac)
        for f in feats:
            single_dim(ok, f, floor, out)
        # continuation x volatility-ish (regime) interaction
        out('   [continuation x regime]')
        inter = defaultdict(list)
        for r in ok:
            if r['continuation'] and r['regime']:
                inter[(r['continuation'], r['regime'])].append(r)
        for k in sorted(inter, key=lambda k: -cell(inter[k])['exp']):
            c = cell(inter[k])
            if c['n'] >= floor:
                out('     ' + fmt_cell('%s | %s' % k, c, floor))
        # AUC of continuous features predicting win
        out('   [AUC feature->win, deep-context subset]')
        for f in ['dbs', 'gdbs', 'conf']:
            vals = [r[f] for r in ok]
            wins = [r['win'] for r in ok]
            a = auc_win(vals, wins)
            nn = sum(1 for v in vals if isnum(v))
            if a is not None:
                out('     %-10s AUC=%.3f  (n=%d)' % (f, a, nn))
        # winner-vs-loser profile per top strategies
        out('   [winner-vs-loser profile per strategy (top vs bottom net quintile)]')
        bys = defaultdict(list)
        for r in ok:
            bys[r['strategy']].append(r)
        for s in sorted(bys, key=lambda k: -len(bys[k]))[:8]:
            rws = sorted(bys[s], key=lambda r: r['net'])
            if len(rws) < 5 * 2:
                continue
            q = len(rws) // 5
            lo, hi = rws[:q], rws[-q:]
            def prof(g):
                cont = mean([1 for r in g if r['continuation'] == 'continuation']) if g else 0
                contp = 100.0 * sum(1 for r in g if r['continuation'] == 'continuation') / max(1, sum(1 for r in g if r['continuation']))
                dbsm = mean([r['dbs'] for r in g if isnum(r['dbs'])])
                confm = mean([r['conf'] for r in g if isnum(r['conf'])])
                return contp, dbsm, confm
            wc, wd, wf = prof(hi)
            lc, ld, lf = prof(lo)
            out('     %-20s WIN: cont%%=%.0f dbs=%+.3f conf=%.3f | LOSE: cont%%=%.0f dbs=%+.3f conf=%.3f'
                % (s[:20], wc, wd, wf, lc, ld, lf))


def S4(rows, floor, out):
    out('\n' + '=' * 90)
    out('S4 — BEST-GATE HUNT  (strategy + 1-2 context conditions, FDR-controlled)')
    out('=' * 90)
    out('  A tradeable-candidate gate needs: exp>0 (net-positive after friction),')
    out('  t-stat |t|>2, N>=floor, and FDR-significant. 3-way suppressed unless N>=floor.')
    for ac in ['crypto_spot', 'xstock_spot']:
        ok = [r for r in rows if r['ac'] == ac and r['geom_ok']]
        out('\n### %s ###' % ac)
        gates = []  # (label, cell)
        bys = defaultdict(list)
        for r in ok:
            bys[r['strategy']].append(r)
        ctx_feats = ['regime', 'continuation', 'dbs_band', 'conf_band', 'phase', 'gregime']
        for s, rws in bys.items():
            if len(rws) < floor:
                continue
            # 1-context gates
            for f in ctx_feats:
                by = defaultdict(list)
                for r in rws:
                    if r.get(f) is not None:
                        by[r[f]].append(r)
                for v, g in by.items():
                    c = cell(g)
                    if c['n'] >= floor:
                        gates.append(('%s + %s=%s' % (s, f, v), c))
            # 2-context gates (regime x continuation, regime x conf, continuation x conf)
            for fa, fb in [('regime', 'continuation'), ('regime', 'conf_band'), ('continuation', 'conf_band'), ('regime', 'dbs_band')]:
                by = defaultdict(list)
                for r in rws:
                    if r.get(fa) is not None and r.get(fb) is not None:
                        by[(r[fa], r[fb])].append(r)
                for v, g in by.items():
                    c = cell(g)
                    if c['n'] >= floor:
                        gates.append(('%s + %s=%s & %s=%s' % (s, fa, v[0], fb, v[1]), c))
        # FDR across all gate t-tests
        if gates:
            pvals = [p_from_t(c['t'], c['n']) for _, c in gates]
            passed = bh_fdr(pvals, 0.10)
            ranked = sorted(range(len(gates)), key=lambda i: -gates[i][1]['exp'])
            out('  -- TOP candidate gates by expectancy (✓=FDR-sig q0.10) --')
            shown = 0
            for i in ranked:
                lab, c = gates[i]
                if c['exp'] <= 0:
                    break
                sig = '✓' if i in passed else ' '
                out('   %s ' % sig + fmt_cell(lab, c, floor))
                shown += 1
                if shown >= 20:
                    break
            if shown == 0:
                out('   (no net-positive gates cleared the floor — every strategy stays net-negative even when sliced)')
            out('  -- WORST 5 gates (contexts to AVOID) --')
            for i in ranked[-5:]:
                lab, c = gates[i]
                out('   ✗ ' + fmt_cell(lab, c, floor))


def S5(rows, floor, out):
    out('\n' + '=' * 90)
    out('S5 — ROBUSTNESS: temporal stability of top gates (split-half by time)')
    out('=' * 90)
    out('  A gate is temporally stable if its expectancy sign holds in BOTH halves.')
    for ac in ['crypto_spot', 'xstock_spot']:
        ok = sorted([r for r in rows if r['ac'] == ac and r['geom_ok']], key=lambda r: r['entry_ms'])
        if len(ok) < 4 * floor:
            out('\n### %s — insufficient N for split-half (N=%d) ###' % (ac, len(ok)))
            continue
        mid = ok[len(ok) // 2]['entry_ms']
        h1 = [r for r in ok if r['entry_ms'] < mid]
        h2 = [r for r in ok if r['entry_ms'] >= mid]
        out('\n### %s — split at %s (h1=%d, h2=%d) ###' % (
            ac, datetime.datetime.fromtimestamp(mid / 1000, datetime.timezone.utc).strftime('%Y-%m-%d'), len(h1), len(h2)))
        bys = defaultdict(list)
        for r in ok:
            bys[r['strategy']].append(r)
        # test (strategy + continuation) gates as the canonical robustness probe
        for s in sorted(bys, key=lambda k: -len(bys[k]))[:10]:
            for cval in ['continuation', 'reversal']:
                g1 = [r for r in h1 if r['strategy'] == s and r['continuation'] == cval]
                g2 = [r for r in h2 if r['strategy'] == s and r['continuation'] == cval]
                if len(g1) >= floor and len(g2) >= floor:
                    c1, c2 = cell(g1), cell(g2)
                    stable = 'STABLE' if (c1['exp'] > 0) == (c2['exp'] > 0) else 'UNSTABLE'
                    out('   %-28s h1 exp=%+7.4f%% (N%d) | h2 exp=%+7.4f%% (N%d)  -> %s'
                        % ('%s+%s' % (s, cval), c1['exp'], c1['n'], c2['exp'], c2['n'], stable))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--logs-dir', default='/home/deploy/dawntrader/logs/virtual_trades')
    ap.add_argument('--xstock-universe', default='/tmp/xs_univ.txt')
    ap.add_argument('--min-cell', type=int, default=50)
    ap.add_argument('--section', default='all')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    lines = []
    def out(s=''):
        lines.append(s)
        print(s)

    xuniv = load_xstock_universe(args.xstock_universe)
    closed, bad = load_trades(args.logs_dir)
    rows = [derive(t, xuniv) for t in closed]
    out('HCE STUDY — %d closed trades | xStock-universe %d syms | bad-files %d %s'
        % (len(rows), len(xuniv), len(bad), bad[:3]))
    fin = Counter(r['ac'] for r in rows)
    out('asset-class: ' + str(dict(fin)) + '  |  min-cell floor=%d' % args.min_cell)
    okc = sum(1 for r in rows if r['geom_ok'])
    out('geometry: units-bug-excluded=%d (stopLoss ratio>0.5, unreachable-stop artifact); kept=%d. '
        'NOTE stopLoss>=entry by NORMAL magnitude = trailed/BE stop of WINNERS (outcome, not corruption) -> KEPT.'
        % (len(rows) - okc, okc))
    bym = Counter(r['month'] for r in rows)
    out('by month: ' + str(dict(sorted(bym.items()))))

    sec = args.section.lower()
    if sec in ('all', 's2'):
        S2(rows, args.min_cell, out)
    if sec in ('all', 's3'):
        S3(rows, args.min_cell, out)
    if sec in ('all', 's4'):
        S4(rows, args.min_cell, out)
    if sec in ('all', 's5'):
        S5(rows, args.min_cell, out)

    if args.out:
        open(args.out, 'w').write('\n'.join(lines))


if __name__ == '__main__':
    main()
