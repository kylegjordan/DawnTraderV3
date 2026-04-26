#!/usr/bin/env python3
"""B65.6 — Global metrics analysis: what telemetry-derived signals predict hostile days?

For each day in the post-B62 window, compute candidate global metrics from telemetry:
  - Cross-pair regime concentration (TFS share, TFS+IE share)
  - Cross-pair |DBS| median + variance (system-wide directional bias)
  - DBS sign uniformity (% of pairs with same sign)
  - Cross-pair ATR distribution (median + spread)
  - Cross-pair classifier confidence dispersion

For each day, compute system-wide WR from VTS trade logs.
Then ask: which global metrics correlate with day-quality (hostile vs clean)?
And critically: which metrics show the signal BEFORE the bad outcomes happen
(i.e., can we detect a hostile day in its first hour rather than after the fact)?
"""
import json, glob, os, statistics
from collections import defaultdict
from datetime import datetime, timezone

VTS_DIR = "/home/deploy/dawntrader/logs/virtual_trades"
TELEMETRY_DIR = "/home/deploy/dawntrader/logs/phase15b_dbs_telemetry"
DAYS = ["2026-04-15","2026-04-16","2026-04-17","2026-04-18","2026-04-19",
        "2026-04-20","2026-04-21","2026-04-22","2026-04-23","2026-04-24","2026-04-25"]

def fmt_day(ms): return datetime.fromtimestamp(ms/1000, tz=timezone.utc).strftime("%Y-%m-%d")
def is_win(t): return (t.get("netProfit") or 0) > 0

# Load WR per day from VTS logs
print("Computing per-day WR from VTS logs...", flush=True)
wr = defaultdict(lambda:[0,0])
seen=set()
for f in sorted(glob.glob(f"{VTS_DIR}/2026-*.json")):
    try:
        if os.path.getsize(f) < 10000: continue
        for t in json.load(open(f)):
            if t.get("status") != "closed": continue
            if t.get("id") in seen: continue
            seen.add(t.get("id"))
            d = fmt_day(t.get("entryTime", 0))
            wr[d][0] += 1
            if is_win(t): wr[d][1] += 1
    except Exception: continue

# Load telemetry per day, compute global metrics
print("Loading telemetry + computing global metrics per day...", flush=True)
day_metrics = {}

for d in DAYS:
    path = f"{TELEMETRY_DIR}/{d}.jsonl"
    if not os.path.exists(path):
        continue

    # All entries for the day
    all_entries = []
    with open(path) as fh:
        for line in fh:
            try: all_entries.append(json.loads(line))
            except Exception: pass

    if not all_entries: continue

    # Group by hour for hourly evolution metrics
    by_hour = defaultdict(list)
    for e in all_entries:
        ts = datetime.fromisoformat(e["ts"].replace("Z","+00:00"))
        by_hour[ts.hour].append(e)

    # Day-aggregate metrics
    regimes = defaultdict(int)
    dbs_scores = []
    atrs = []
    for e in all_entries:
        regimes[e["classifier"]["regime"]] += 1
        dbs_scores.append(e["dbs"]["score"])
        atrs.append(e.get("atr", 0))

    n_total = len(all_entries)
    tfs_share = regimes["TREND_FRIENDLY_STABLE"] / n_total * 100
    ie_share  = regimes["IMPULSE_EXPANSION"] / n_total * 100
    tfs_ie_share = tfs_share + ie_share

    abs_dbs = [abs(s) for s in dbs_scores]
    mean_abs_dbs = sum(abs_dbs) / len(abs_dbs)
    median_abs_dbs = sorted(abs_dbs)[len(abs_dbs)//2]
    pos_share = sum(1 for s in dbs_scores if s > 0.10) / len(dbs_scores) * 100
    neg_share = sum(1 for s in dbs_scores if s < -0.10) / len(dbs_scores) * 100
    sign_uniformity = max(pos_share, neg_share)  # higher = more one-sided

    # Hourly evolution: peak hourly TFS+IE share (when did concentration peak?)
    peak_tfs_ie = 0
    peak_hour = None
    early_tfs_ie = None  # first 4 hours (00-04 UTC)
    for h in sorted(by_hour):
        h_entries = by_hour[h]
        h_n = len(h_entries)
        h_tfs_ie = sum(1 for e in h_entries if e["classifier"]["regime"] in ("TREND_FRIENDLY_STABLE","IMPULSE_EXPANSION")) / h_n * 100
        if h_tfs_ie > peak_tfs_ie:
            peak_tfs_ie = h_tfs_ie
            peak_hour = h
        if h <= 3:
            if early_tfs_ie is None: early_tfs_ie = []
            early_tfs_ie.append(h_tfs_ie)
    early_tfs_ie_mean = sum(early_tfs_ie)/len(early_tfs_ie) if early_tfs_ie else None

    day_metrics[d] = {
        "n_telemetry": n_total,
        "tfs_share": tfs_share,
        "ie_share": ie_share,
        "tfs_ie_share": tfs_ie_share,
        "mean_abs_dbs": mean_abs_dbs,
        "median_abs_dbs": median_abs_dbs,
        "pos_dbs_share": pos_share,
        "neg_dbs_share": neg_share,
        "sign_uniformity": sign_uniformity,
        "peak_hourly_tfs_ie": peak_tfs_ie,
        "peak_hour": peak_hour,
        "early_tfs_ie_mean": early_tfs_ie_mean,  # average TFS+IE share in first 4 UTC hours
    }

# Display results
print("\n" + "=" * 110)
print("GLOBAL METRICS BY DAY — sorted by WR (worst hostile to best clean)")
print("=" * 110)

day_rows = []
for d in sorted(day_metrics):
    n_trades, n_wins = wr.get(d, [0,0])
    day_wr = n_wins / n_trades * 100 if n_trades > 0 else 0
    quality = "HOSTILE" if day_wr < 25 else "CLEAN" if day_wr >= 35 else "MIXED" if n_trades >= 20 else "small-n"
    day_rows.append((d, day_wr, quality, n_trades, day_metrics[d]))

# Sort by WR ascending
day_rows.sort(key=lambda x: x[1])

print(f"{'Day':<12} {'WR':>6} {'Q':<8} {'nTrd':>5} | {'TFS%':>6} {'TFS+IE%':>8} {'meanDBS':>8} {'medDBS':>8} {'signUni':>8} {'peakTFS+IE':>11} {'peakH':>6} {'earlyTFS+IE':>13}")
for d, wrv, q, nt, m in day_rows:
    print(f"  {d:<10} {wrv:>5.1f}% {q:<8} {nt:>5} | {m['tfs_share']:>5.1f}% {m['tfs_ie_share']:>7.1f}% {m['mean_abs_dbs']:>+8.3f} {m['median_abs_dbs']:>+8.3f} {m['sign_uniformity']:>7.1f}% {m['peak_hourly_tfs_ie']:>10.1f}% {str(m['peak_hour']):>6} {m['early_tfs_ie_mean']:>12.1f}%" if m['early_tfs_ie_mean'] is not None else f"  {d:<10} {wrv:>5.1f}% {q:<8} {nt:>5} | {m['tfs_share']:>5.1f}% {m['tfs_ie_share']:>7.1f}% {m['mean_abs_dbs']:>+8.3f} {m['median_abs_dbs']:>+8.3f} {m['sign_uniformity']:>7.1f}% {m['peak_hourly_tfs_ie']:>10.1f}% {str(m['peak_hour']):>6} N/A")

print()
print("=" * 110)
print("LEADING-INDICATOR ANALYSIS: which metrics, measured EARLY in the day,")
print("would have predicted the day's outcome BEFORE most trades fired?")
print("=" * 110)
print()
print("Specifically: for each day, what was the TFS+IE share in hours 00-03 UTC?")
print("Hostile days should show elevated early-day concentration if it's a leading indicator.")
print()
print(f"{'Day':<12} {'WR':>6} {'Q':<8} {'early TFS+IE':>13} {'peak TFS+IE':>12} {'peak hour':>10}")
for d, wrv, q, nt, m in day_rows:
    e = f"{m['early_tfs_ie_mean']:.1f}%" if m['early_tfs_ie_mean'] is not None else "N/A"
    print(f"  {d:<10} {wrv:>5.1f}% {q:<8} {e:>13} {m['peak_hourly_tfs_ie']:>11.1f}% {str(m['peak_hour']):>10}")

print()
print("=" * 110)
print("CORRELATION SUMMARY")
print("=" * 110)
def correl(xs, ys):
    n = len(xs)
    if n < 3: return None
    mx = sum(xs)/n; my = sum(ys)/n
    sxx = sum((x-mx)**2 for x in xs)
    syy = sum((y-my)**2 for y in ys)
    sxy = sum((x-mx)*(y-my) for x,y in zip(xs,ys))
    if sxx == 0 or syy == 0: return None
    return sxy / (sxx**0.5 * syy**0.5)

# Only consider days with substantial trade volume (skip small-n)
substantial = [(d,wrv,q,nt,m) for d,wrv,q,nt,m in day_rows if nt >= 20]
wrs = [r[1] for r in substantial]
print(f"\nUsing {len(substantial)} days with n>=20 trades.\n")
print(f"{'Metric':<35} {'Pearson r vs WR':>16}")
for label, key in [
    ("TFS share",          "tfs_share"),
    ("TFS+IE share (concentration)", "tfs_ie_share"),
    ("mean |DBS|",         "mean_abs_dbs"),
    ("median |DBS|",       "median_abs_dbs"),
    ("sign uniformity %",  "sign_uniformity"),
    ("peak hourly TFS+IE", "peak_hourly_tfs_ie"),
    ("early TFS+IE (00-03 UTC)", "early_tfs_ie_mean"),
]:
    vals = [r[4][key] for r in substantial if r[4][key] is not None]
    matched_wrs = [r[1] for r in substantial if r[4][key] is not None]
    r = correl(vals, matched_wrs)
    sign = "(higher = worse WR)" if r is not None and r < -0.3 else ("(higher = better WR)" if r is not None and r > 0.3 else "")
    print(f"  {label:<35} {r:>16.3f}  {sign}" if r is not None else f"  {label:<35} {'undef':>16}")
