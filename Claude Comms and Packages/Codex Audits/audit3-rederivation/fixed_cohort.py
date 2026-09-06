"""
THE CONFOUND TEST.

The reproduced curve is computed over a DIFFERENT symbol universe at each horizon:
379 symbols at 5 min, 200 at 15, 75 at 60, 19 at 240. A 240-minute window needs a
symbol to print a bar every minute for four hours, which only the most liquid names
do. So "longer horizons clear more often" may be a LIQUIDITY effect and not a
HORIZON effect - the row compares different populations.

This holds the cohort FIXED at the symbols that survive the longest horizon, and
re-runs every horizon on that same set. If the curve survives, the horizon effect
is real. If it flattens, the original curve was measuring the universe, not the clock.
"""
import csv
from datetime import datetime, timezone

SRC = r"C:/DawnTrader-Codex-Data/tape_1m_crypto.csv"
HORIZONS = [5, 15, 60, 240]
def hb(fi, fo): return ((1.0 + fi) / (1.0 - fo) - 1.0) * 10000.0
SCEN = {"TT": hb(.008, .008), "MT": hb(.004, .008), "MM": hb(.004, .004)}

series = {}
with open(SRC, "r", newline="", encoding="utf-8") as fh:
    for row in csv.DictReader(fh):
        try:
            t = datetime.strptime(row["interval_begin"][:19], "%Y-%m-%d %H:%M:%S")
            m = int(t.replace(tzinfo=timezone.utc).timestamp() // 60)
            hi = float(row["high"]); cl = float(row["close"])
            if not (hi > 0 and cl > 0): continue
        except Exception:
            continue
        series.setdefault(row["symbol"], []).append((m, hi, cl))
for v in series.values():
    v.sort(key=lambda r: r[0])

def windows(rows, H):
    n = len(rows)
    for i in range(n - H):
        if rows[i + H][0] - rows[i][0] != H:
            continue
        yield rows[i], rows[i + 1:i + H + 1]

cohort = set()
for s, rows in series.items():
    for _ in windows(rows, 240):
        cohort.add(s)
        break
print("FIXED COHORT: %d symbols that sustain a continuous 240-minute run" % len(cohort))
print("  " + ", ".join(sorted(cohort)))
print()

for label, universe in (("ALL symbols (as reported)", set(series)), ("FIXED cohort", cohort)):
    print(label)
    header = "  %7s %9s %5s %8s   " % ("horizon", "origins", "syms", "up_p50")
    header += "  ".join("%s>%.0f" % (k, v) for k, v in SCEN.items())
    print(header)
    for H in HORIZONS:
        origins = 0; syms = set(); ups = []; clears = {k: 0 for k in SCEN}
        for sym in universe:
            for o, win in windows(series[sym], H):
                c0 = o[2]
                mx = 0.0
                for w in win:
                    if w[1] > mx: mx = w[1]
                up = (mx - c0) / c0 * 10000.0
                origins += 1; syms.add(sym); ups.append(up)
                for k, h in SCEN.items():
                    if up > h: clears[k] += 1
        if not origins:
            print("  %7d  none" % H); continue
        ups.sort()
        cells = "  ".join("%6.1f%%" % (100.0 * clears[k] / origins) for k in SCEN)
        print("  %7d %9d %5d %8.1f   %s" % (H, origins, len(syms), ups[len(ups)//2], cells))
    print()
