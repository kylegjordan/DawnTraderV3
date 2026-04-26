#!/usr/bin/env python3
"""B65.6 Phase A Track 1 - test diagnostic candidate variables on 04-22 cohort.

Candidates to test (per Kyle directive 2026-04-26 — find the actual discriminator,
do not settle for the concentration workaround):

  1. DBS slope (rate of change over rolling window) — fresh vs exhausted
  2. DBS percentile rank vs pair's own rolling distribution — climactic vs mid-trend
  3. DBS components breakdown (slope/return/ema) — which sub-input dominates?
  4. ATR ratio (current vs pair-rolling-mean) — range expansion = climactic move signal

For each variable, compute it for every TFS-Path-B trade in post-B62 cohort.
Compare distributions for: 04-22 winners vs 04-22 losers vs clean-day winners vs clean-day losers.
A real discriminator should cleanly separate winners from losers.
"""
import json, glob, os, bisect
from collections import defaultdict, deque
from datetime import datetime, timezone

VTS_DIR = "/home/deploy/dawntrader/logs/virtual_trades"
TELEMETRY_DIR = "/home/deploy/dawntrader/logs/phase15b_dbs_telemetry"
POST_B62_CUTOFF_MS = 1776643200000
DAYS = ["2026-04-20","2026-04-21","2026-04-22","2026-04-23","2026-04-24","2026-04-25"]

def fmt_day(ms): return datetime.fromtimestamp(ms/1000, tz=timezone.utc).strftime("%Y-%m-%d")
def is_win(t): return (t.get("netProfit") or 0) > 0
def parse_iso_ms(iso): return int(datetime.fromisoformat(iso.replace("Z","+00:00")).timestamp() * 1000)

print("Loading telemetry (per-symbol time-indexed)...", flush=True)
tele = defaultdict(list)
for d in DAYS:
    path = f"{TELEMETRY_DIR}/{d}.jsonl"
    if not os.path.exists(path): continue
    with open(path) as fh:
        for line in fh:
            try:
                e = json.loads(line)
                ts_ms = parse_iso_ms(e["ts"])
                tele[e["symbol"]].append((ts_ms, e))
            except Exception: continue
for s in tele: tele[s].sort(key=lambda x: x[0])
print(f"Loaded {sum(len(v) for v in tele.values())} entries across {len(tele)} symbols", flush=True)

print("Loading trades + attaching telemetry...", flush=True)
trades=[]; seen=set()
for f in sorted(glob.glob(f"{VTS_DIR}/2026-04-*.json")):
    for t in json.load(open(f)):
        if t.get("status") != "closed": continue
        if t.get("entryTime", 0) < POST_B62_CUTOFF_MS: continue
        if t.get("id") in seen: continue
        seen.add(t.get("id")); trades.append(t)
for t in trades: t["_d"] = fmt_day(t.get("entryTime", 0))

LOOKUP_WINDOW_MS = 120_000
for t in trades:
    sym = t.get("signal", {}).get("symbol") or t.get("symbol")
    if not sym or sym not in tele: t["_tel"]=None; t["_tel_idx"]=None; continue
    arr = tele[sym]
    et = t.get("entryTime", 0)
    keys = [x[0] for x in arr]
    idx = bisect.bisect_right(keys, et) - 1
    if idx < 0: t["_tel"]=None; t["_tel_idx"]=None; continue
    ts, entry = arr[idx]
    if et - ts > LOOKUP_WINDOW_MS: t["_tel"]=None; t["_tel_idx"]=None; continue
    t["_tel"] = entry; t["_tel_idx"] = idx
have_tel = [t for t in trades if t.get("_tel")]
print(f"Attached {len(have_tel)}/{len(trades)} trades", flush=True)

# Day quality
day_wr = defaultdict(lambda: [0,0])
for t in trades:
    day_wr[t["_d"]][0] += 1
    if is_win(t): day_wr[t["_d"]][1] += 1
day_quality = {}
for d, (n, w) in day_wr.items():
    wr = w/n*100 if n else 0
    day_quality[d] = "HOSTILE" if wr < 25 else "CLEAN" if wr >= 35 else "MIXED"

def is_path_a(t):
    c = t["_tel"]["classifier"]; return c["mom"] > 0.003 and c["adx"] > 50
def is_path_b(t):
    return abs(t["_tel"]["dbs"]["score"]) >= 0.30

# Compute candidate diagnostic variables for each trade
SLOPE_WINDOW_CYCLES = 30  # ~30 min if cycles are ~60s
PCT_WINDOW_CYCLES = 720  # ~12h rolling distribution

for t in have_tel:
    sym = t["_tel"]["symbol"]
    arr = tele[sym]
    idx = t["_tel_idx"]
    # DBS slope: linear regression slope of last SLOPE_WINDOW_CYCLES dbs scores
    start = max(0, idx - SLOPE_WINDOW_CYCLES + 1)
    window = arr[start:idx+1]
    if len(window) >= 5:
        xs = list(range(len(window)))
        ys = [w[1]["dbs"]["score"] for w in window]
        n = len(xs)
        mx = sum(xs)/n; my = sum(ys)/n
        sxx = sum((x-mx)**2 for x in xs)
        sxy = sum((x-mx)*(y-my) for x,y in zip(xs,ys))
        slope = sxy/sxx if sxx != 0 else 0
        t["_dbs_slope"] = slope
        # First-vs-last comparison (simpler)
        t["_dbs_first"] = ys[0]
        t["_dbs_last"] = ys[-1]
        t["_dbs_delta"] = ys[-1] - ys[0]
    else:
        t["_dbs_slope"] = None; t["_dbs_first"]=None; t["_dbs_last"]=None; t["_dbs_delta"]=None

    # DBS percentile rank: where does current DBS fall in the rolling 12h distribution
    pct_start = max(0, idx - PCT_WINDOW_CYCLES + 1)
    pct_window = arr[pct_start:idx+1]
    if len(pct_window) >= 30:
        scores = sorted(abs(w[1]["dbs"]["score"]) for w in pct_window)
        cur = abs(t["_tel"]["dbs"]["score"])
        # Count how many scores are <= cur
        rank = bisect.bisect_right(scores, cur)
        t["_dbs_pct_rank"] = rank / len(scores) * 100
    else:
        t["_dbs_pct_rank"] = None

    # ATR expansion: current ATR vs rolling mean ATR
    atr_window = pct_window
    if len(atr_window) >= 30:
        atrs = [w[1].get("atr", 0) for w in atr_window]
        mean_atr = sum(atrs)/len(atrs)
        cur_atr = t["_tel"].get("atr", 0)
        t["_atr_ratio"] = cur_atr/mean_atr if mean_atr > 0 else None
    else:
        t["_atr_ratio"] = None

    # DBS components
    dbs = t["_tel"]["dbs"]
    t["_dbs_slope_comp"] = dbs.get("slopeComponent", 0)
    t["_dbs_return_comp"] = dbs.get("returnComponent", 0)
    t["_dbs_ema_comp"] = dbs.get("emaComponent", 0)

# Filter to TFS Path-B-only trades
all_tfs = [t for t in have_tel if t["_tel"]["classifier"]["regime"] == "TREND_FRIENDLY_STABLE"]
pb_only = [t for t in all_tfs if not is_path_a(t) and is_path_b(t)]
pb_22_lose = [t for t in pb_only if t["_d"] == "2026-04-22" and not is_win(t)]
pb_22_win  = [t for t in pb_only if t["_d"] == "2026-04-22" and is_win(t)]
pb_clean_win  = [t for t in pb_only if day_quality.get(t["_d"]) == "CLEAN" and is_win(t)]
pb_clean_lose = [t for t in pb_only if day_quality.get(t["_d"]) == "CLEAN" and not is_win(t)]
print(f"\nCohorts (Path-B-only TFS): 22L={len(pb_22_lose)} 22W={len(pb_22_win)} cleanW={len(pb_clean_win)} cleanL={len(pb_clean_lose)}", flush=True)

def quantile(xs, q):
    if not xs: return None
    xs = sorted(xs); idx = int(q*(len(xs)-1)); return xs[idx]
def describe(label, vals, fmt="{:>+9.5f}"):
    vals = [v for v in vals if v is not None]
    if not vals: print(f"  {label}: empty"); return
    p10 = quantile(vals, 0.10); p25 = quantile(vals, 0.25); p50 = quantile(vals, 0.50)
    p75 = quantile(vals, 0.75); p90 = quantile(vals, 0.90)
    mean = sum(vals)/len(vals)
    cells = [fmt.format(x) for x in [mean,p10,p25,p50,p75,p90]]
    print(f"  {label}: n={len(vals):>3} mean={cells[0]} p10={cells[1]} p25={cells[2]} p50={cells[3]} p75={cells[4]} p90={cells[5]}")

print()
print("=" * 78)
print("CANDIDATE 1: DBS SLOPE (fresh momentum vs flattening/exhaustion)")
print("=" * 78)
print("Positive slope = DBS rising (fresh trend); near-zero = peaked; negative = rolling over")
print()
for label, cohort in [("04-22 losers     ", pb_22_lose),("04-22 winners    ", pb_22_win),("Clean-day winners", pb_clean_win),("Clean-day losers ", pb_clean_lose)]:
    describe(label, [t["_dbs_slope"] for t in cohort])

print()
print("CANDIDATE 1b: DBS DELTA (last DBS minus first DBS in 30-cycle window)")
print()
for label, cohort in [("04-22 losers     ", pb_22_lose),("04-22 winners    ", pb_22_win),("Clean-day winners", pb_clean_win),("Clean-day losers ", pb_clean_lose)]:
    describe(label, [t["_dbs_delta"] for t in cohort])

print()
print("=" * 78)
print("CANDIDATE 2: DBS PERCENTILE RANK (climactic vs mid-trend)")
print("=" * 78)
print("Current |DBS| as percentile of pair's own last 12h |DBS| distribution")
print("Near 100 = climactic / unsustainable; near 50 = mid-trend; near 0 = early")
print()
for label, cohort in [("04-22 losers     ", pb_22_lose),("04-22 winners    ", pb_22_win),("Clean-day winners", pb_clean_win),("Clean-day losers ", pb_clean_lose)]:
    describe(label, [t["_dbs_pct_rank"] for t in cohort], fmt="{:>9.1f}")

print()
print("=" * 78)
print("CANDIDATE 3: ATR RATIO (current ATR vs rolling 12h mean ATR)")
print("=" * 78)
print("> 1.5 = range expansion (often climactic); < 0.7 = compression; ~1.0 = normal")
print()
for label, cohort in [("04-22 losers     ", pb_22_lose),("04-22 winners    ", pb_22_win),("Clean-day winners", pb_clean_win),("Clean-day losers ", pb_clean_lose)]:
    describe(label, [t["_atr_ratio"] for t in cohort], fmt="{:>9.3f}")

print()
print("=" * 78)
print("CANDIDATE 4: DBS SUB-COMPONENTS (slope/return/ema breakdown)")
print("=" * 78)
print("DBS = weighted sum of slope, return, and ema components.")
print("If one component dominates on losers vs winners, that points to the failure mode.")
print()
for cname, ckey in [("slope component", "_dbs_slope_comp"),("return component","_dbs_return_comp"),("ema component  ","_dbs_ema_comp")]:
    print(f"--- {cname} ---")
    for label, cohort in [("04-22 losers     ", pb_22_lose),("04-22 winners    ", pb_22_win),("Clean-day winners", pb_clean_win),("Clean-day losers ", pb_clean_lose)]:
        describe(label, [t[ckey] for t in cohort])
    print()

print("=" * 78)
print("DISCRIMINATION TEST: for each candidate, can we find a threshold that")
print("preferentially excludes losers without breaking winners?")
print("=" * 78)
print()

def discrim_test(label, lose_vals, win_vals, direction="below"):
    """Sweep thresholds; for each, compute losers-excluded% and winners-preserved%."""
    lose_vals = [v for v in lose_vals if v is not None]
    win_vals = [v for v in win_vals if v is not None]
    if not lose_vals or not win_vals:
        print(f"  {label}: insufficient data"); return
    all_vals = sorted(set(lose_vals + win_vals))
    print(f"  {label}: hostile L={len(lose_vals)} W={len(win_vals)}")
    print(f"    {'Threshold':<14} {'Losers excluded':>17} {'Winners preserved':>20} {'L%':>6} {'W%':>6}")
    # Test 5 thresholds at quantiles of the combined distribution
    for q in [0.20, 0.40, 0.50, 0.60, 0.80]:
        thresh = quantile(all_vals, q)
        if direction == "below":
            l_ex = sum(1 for v in lose_vals if v < thresh)
            w_pr = sum(1 for v in win_vals if v >= thresh)
        else:
            l_ex = sum(1 for v in lose_vals if v > thresh)
            w_pr = sum(1 for v in win_vals if v <= thresh)
        l_pct = l_ex/len(lose_vals)*100; w_pct = w_pr/len(win_vals)*100
        cmp = "<" if direction == "below" else ">"
        print(f"    {cmp}={thresh:>+10.4f}  {l_ex:>17} {w_pr:>20} {l_pct:>5.1f}% {w_pct:>5.1f}%")

print(">> If a candidate is a real discriminator, look for: high L% AND high W% at the same threshold.")
print(">> 'Below' = exclude trades where this variable is below the threshold (gates low values).")
print(">> 'Above' = exclude trades where this variable is above the threshold (gates high values).")
print()
print("--- DBS SLOPE (exclude trades where slope is BELOW threshold = exhausted/rolling) ---")
discrim_test("DBS slope BELOW", [t["_dbs_slope"] for t in pb_22_lose], [t["_dbs_slope"] for t in pb_22_win], direction="below")
print()
print("--- DBS PERCENTILE RANK (exclude trades where rank is ABOVE threshold = climactic) ---")
discrim_test("DBS pct rank ABOVE", [t["_dbs_pct_rank"] for t in pb_22_lose], [t["_dbs_pct_rank"] for t in pb_22_win], direction="above")
print()
print("--- ATR RATIO (exclude trades where ATR ratio is ABOVE threshold = range-expansion climax) ---")
discrim_test("ATR ratio ABOVE", [t["_atr_ratio"] for t in pb_22_lose], [t["_atr_ratio"] for t in pb_22_win], direction="above")
print()
print("--- DBS DELTA (exclude trades where delta is BELOW threshold = stale/peaking) ---")
discrim_test("DBS delta BELOW", [t["_dbs_delta"] for t in pb_22_lose], [t["_dbs_delta"] for t in pb_22_win], direction="below")
