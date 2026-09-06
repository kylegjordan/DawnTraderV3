"""
INDEPENDENT RE-DERIVATION of the crypto cost-hurdle curve.

Written from the brief's own estimand, NOT by re-running the advisor's script:
"what fraction of available moves on the tape clears a round-trip cost hurdle."
The advisor's measure_q3.py is deliberately not read or imported.

METHOD, stated so it can be attacked:
  - population: every 1-minute bar that has a CONTINUOUS run of H following bars
    (consecutive minutes, no gap). Gapped origins are DROPPED, not bridged.
  - origin price: the bar's CLOSE. Entry is assumed at the origin close.
  - up_excursion  = (max HIGH over the next H bars - close_0) / close_0
  - endpoint      = (close_H - close_0) / close_0
  - hurdle: MULTIPLICATIVE round trip. To break even buying at P and selling at
    P(1+r) with entry fee f_in on notional and exit fee f_out:
        (1+r)(1-f_out) = (1+f_in)  =>  r = (1+f_in)/(1-f_out) - 1
    NOT f_in + f_out. At 0.008/0.008 that is 161.29 bps, not 160.
  - counts a clear as STRICTLY GREATER than the hurdle.

Reported as fractions with their denominators. No opportunity claim is made:
a move that clears a hurdle is not a trade we could have captured.
"""
import csv, sys, os
from datetime import datetime, timezone

SRC = r"C:/DawnTrader-Codex-Data/tape_1m_crypto.csv"
HORIZONS = [5, 15, 60, 240]

def hurdle_bps(f_in, f_out):
    return ((1.0 + f_in) / (1.0 - f_out) - 1.0) * 10000.0

SCEN = {
    "TT": hurdle_bps(0.0080, 0.0080),   # taker in, taker out   - rung 1
    "MT": hurdle_bps(0.0040, 0.0080),   # maker in, taker out
    "MM": hurdle_bps(0.0040, 0.0040),   # maker both legs
}

# ── load ────────────────────────────────────────────────────────────────────
series = {}          # symbol -> list of (epoch_min, high, close)
bad = 0
with open(SRC, "r", newline="", encoding="utf-8") as fh:
    for row in csv.DictReader(fh):
        try:
            t = datetime.strptime(row["interval_begin"][:19], "%Y-%m-%d %H:%M:%S")
            m = int(t.replace(tzinfo=timezone.utc).timestamp() // 60)
            hi = float(row["high"]); cl = float(row["close"])
            if not (hi > 0 and cl > 0):
                bad += 1; continue
        except Exception:
            bad += 1; continue
        series.setdefault(row["symbol"], []).append((m, hi, cl))

total_bars = sum(len(v) for v in series.values())
print(f"loaded          {total_bars} bars / {len(series)} symbols  (unparseable or non-positive: {bad})")

# ── measure ─────────────────────────────────────────────────────────────────
print()
print(f"{'horizon':>8} {'origins':>10} {'symbols':>8} {'up_p50':>8} {'up_p90':>9}   "
      + "  ".join(f"{k}>{v:.0f}bps" for k, v in SCEN.items()))

for H in HORIZONS:
    origins = 0; syms = set(); ups = []
    clears = {k: 0 for k in SCEN}
    end_clears = {k: 0 for k in SCEN}
    for sym, rows in series.items():
        rows.sort(key=lambda r: r[0])
        n = len(rows)
        for i in range(n - H):
            # continuity: the window must be H consecutive minutes
            if rows[i + H][0] - rows[i][0] != H:
                continue
            c0 = rows[i][2]
            mx = 0.0
            for j in range(i + 1, i + H + 1):
                if rows[j][1] > mx: mx = rows[j][1]
            up = (mx - c0) / c0 * 10000.0
            ep = (rows[i + H][2] - c0) / c0 * 10000.0
            origins += 1; syms.add(sym); ups.append(up)
            for k, h in SCEN.items():
                if up > h: clears[k] += 1
                if ep > h: end_clears[k] += 1
    if not origins:
        print(f"{H:>8} {0:>10}  (no continuous windows)"); continue
    ups.sort()
    p50 = ups[len(ups)//2]; p90 = ups[int(len(ups)*0.9)]
    cells = "  ".join(f"{100.0*clears[k]/origins:9.1f}%" for k in SCEN)
    print(f"{H:>8} {origins:>10} {len(syms):>8} {p50:8.1f} {p90:9.1f}   {cells}")

print()
print("hurdles used (multiplicative round trip):")
for k, v in SCEN.items():
    print(f"   {k}  {v:8.2f} bps")
print()
print("POSITIVE CONTROL — a hurdle of 0 bps must clear on nearly every origin;")
print("if it does not, the excursion calculation is broken and the numbers above are meaningless.")
H = 15; ok = 0; tot = 0
for sym, rows in series.items():
    rows.sort(key=lambda r: r[0])
    for i in range(len(rows) - H):
        if rows[i + H][0] - rows[i][0] != H: continue
        c0 = rows[i][2]
        mx = max(rows[j][1] for j in range(i + 1, i + H + 1))
        tot += 1
        if (mx - c0) / c0 * 10000.0 > 0: ok += 1
print(f"   15-min, hurdle 0 bps: {100.0*ok/tot:.1f}% of {tot} origins clear")
