#!/usr/bin/env python3
"""B65.6 Phase A - input-space characterization.

Cohort: post-B62 only (2026-04-20 onward).
Goals (per Langston-approved scope):
  Q5: confidence-vs-outcome inversion across ALL 5 regimes (not just TFS)
  Main: characterize TFS-tagged false-positive (04-22 losers) vs true-positive (clean-day winners) inputs
  Path A vs Path B: of TFS-tagged trades, which path fired? Where does Path B dominate?
"""
import json, glob, os, bisect
from collections import defaultdict
from datetime import datetime, timezone

VTS_DIR = "/home/deploy/dawntrader/logs/virtual_trades"
TELEMETRY_DIR = "/home/deploy/dawntrader/logs/phase15b_dbs_telemetry"
POST_B62_CUTOFF_MS = 1776643200000  # 2026-04-20 00:00 UTC
DAYS = ["2026-04-20","2026-04-21","2026-04-22","2026-04-23","2026-04-24","2026-04-25"]

def fmt_day(ms): return datetime.fromtimestamp(ms/1000, tz=timezone.utc).strftime("%Y-%m-%d")
def is_win(t): return (t.get("netProfit") or 0) > 0
def parse_iso_ms(iso):
    return int(datetime.fromisoformat(iso.replace("Z","+00:00")).timestamp() * 1000)

print("Loading telemetry...", flush=True)
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
            except Exception:
                continue
for s in tele: tele[s].sort(key=lambda x: x[0])
print(f"Loaded {sum(len(v) for v in tele.values())} telemetry entries across {len(tele)} symbols", flush=True)

trades=[]; seen=set()
for f in sorted(glob.glob(f"{VTS_DIR}/2026-04-*.json")):
    for t in json.load(open(f)):
        if t.get("status") != "closed": continue
        if t.get("entryTime", 0) < POST_B62_CUTOFF_MS: continue
        if t.get("id") in seen: continue
        seen.add(t.get("id")); trades.append(t)
for t in trades: t["_d"] = fmt_day(t.get("entryTime", 0))
print(f"Loaded {len(trades)} post-B62 closed trades", flush=True)

LOOKUP_WINDOW_MS = 120_000
attached = 0; missing = 0
for t in trades:
    sym = t.get("signal", {}).get("symbol") or t.get("symbol")
    if not sym or sym not in tele:
        t["_tel"] = None; missing += 1; continue
    arr = tele[sym]
    et = t.get("entryTime", 0)
    keys = [x[0] for x in arr]
    idx = bisect.bisect_right(keys, et) - 1
    if idx < 0:
        t["_tel"] = None; missing += 1; continue
    ts, entry = arr[idx]
    if et - ts > LOOKUP_WINDOW_MS:
        t["_tel"] = None; missing += 1; continue
    t["_tel"] = entry; attached += 1
print(f"Attached classifier inputs to {attached}/{len(trades)} trades ({missing} missing)", flush=True)

day_wr = defaultdict(lambda: [0,0])
for t in trades:
    day_wr[t["_d"]][0] += 1
    if is_win(t): day_wr[t["_d"]][1] += 1
day_quality = {}
for d, (n, w) in day_wr.items():
    wr = w/n*100 if n else 0
    day_quality[d] = "HOSTILE" if wr < 25 else "CLEAN" if wr >= 35 else "MIXED"

print()
print("=" * 78)
print("Q5 INVERSION CHECK: WR by per-pair regime (at entry, post-B62)")
print("=" * 78)
print()
print(f"{'Day':<13} {'Regime':<26} {'n':>5} {'WR':>7} {'meanADX':>8} {'meanDBS':>8} {'meanMom':>9}")
have_tel = [t for t in trades if t.get("_tel")]
for d in sorted(set(t["_d"] for t in have_tel)):
    sub = [t for t in have_tel if t["_d"] == d]
    by_reg = defaultdict(list)
    for t in sub:
        by_reg[t["_tel"]["classifier"]["regime"]].append(t)
    for reg in ["TREND_FRIENDLY_STABLE","IMPULSE_EXPANSION","RANGE_BOUND_STABLE","STRUCTURAL_TRANSITION","HIGH_VOLATILITY_UNSTABLE"]:
        ts_ = by_reg.get(reg, [])
        if not ts_: continue
        n = len(ts_); w = sum(1 for t in ts_ if is_win(t))
        adx_v = sum(t["_tel"]["classifier"]["adx"] for t in ts_)/n
        dbs_v = sum(t["_tel"]["dbs"]["score"] for t in ts_)/n
        mom_v = sum(t["_tel"]["classifier"]["mom"] for t in ts_)/n
        print(f"  {d:<11} {reg:<26} {n:>5} {w/n*100:>6.1f}% {adx_v:>8.1f} {dbs_v:>+8.3f} {mom_v:>+9.4f}")

print()
print("=" * 78)
print("TFS PATH A vs PATH B firing breakdown")
print("=" * 78)
print()
print("Path A: mom > 0.003 AND adx > 50  (sustained directional pressure)")
print("Path B: |DBS| >= 0.30 alone  (recent direction, no sustainability check)")
print("Both: matches Path A AND Path B")
print()
print(f"{'Day':<13} {'PathA-only':>12} {'PathB-only':>12} {'Both':>8} {'Total TFS':>10}")
for d in sorted(set(t["_d"] for t in have_tel)):
    tfs = [t for t in have_tel if t["_d"] == d and t["_tel"]["classifier"]["regime"] == "TREND_FRIENDLY_STABLE"]
    a_only=0; b_only=0; both=0
    for t in tfs:
        c = t["_tel"]["classifier"]
        d_score = abs(t["_tel"]["dbs"]["score"])
        a = c["mom"] > 0.003 and c["adx"] > 50
        b = d_score >= 0.30
        if a and b: both += 1
        elif a and not b: a_only += 1
        elif b and not a: b_only += 1
    print(f"  {d:<11} {a_only:>12} {b_only:>12} {both:>8} {len(tfs):>10}")

print()
print("=" * 78)
print("TFS WR BY FIRING PATH (the central question)")
print("=" * 78)
print()
print(f"{'Path':<22} {'n':>5} {'WR':>7} {'sumNet':>10}")
all_tfs = [t for t in have_tel if t["_tel"]["classifier"]["regime"] == "TREND_FRIENDLY_STABLE"]
def is_path_a(t):
    c = t["_tel"]["classifier"]; return c["mom"] > 0.003 and c["adx"] > 50
def is_path_b(t):
    return abs(t["_tel"]["dbs"]["score"]) >= 0.30
for label, filt in [
    ("Path A only", lambda t: is_path_a(t) and not is_path_b(t)),
    ("Path B only", lambda t: not is_path_a(t) and is_path_b(t)),
    ("Both A and B", lambda t: is_path_a(t) and is_path_b(t)),
]:
    sub = [t for t in all_tfs if filt(t)]
    if not sub: continue
    n = len(sub); w = sum(1 for t in sub if is_win(t))
    s = sum((t.get("netProfit") or 0) for t in sub)
    print(f"  {label:<22} {n:>5} {w/n*100:>6.1f}% ${s:>9.2f}")

print()
print("=" * 78)
print("TFS PATH B INPUT DISTRIBUTION: 04-22 LOSING vs CLEAN-DAY WINNING")
print("=" * 78)
print()
def quantile(xs, q):
    if not xs: return None
    xs = sorted(xs); idx = int(q*(len(xs)-1)); return xs[idx]
def describe(label, vals):
    if not vals: print(f"  {label}: empty"); return
    p10 = quantile(vals, 0.10); p25 = quantile(vals, 0.25); p50 = quantile(vals, 0.50)
    p75 = quantile(vals, 0.75); p90 = quantile(vals, 0.90)
    mean = sum(vals)/len(vals)
    print(f"  {label}: n={len(vals)} mean={mean:>+8.4f} p10={p10:>+8.4f} p25={p25:>+8.4f} p50={p50:>+8.4f} p75={p75:>+8.4f} p90={p90:>+8.4f}")

b_22_lose = [t for t in all_tfs if t["_d"] == "2026-04-22" and not is_win(t) and not is_path_a(t) and is_path_b(t)]
b_22_win  = [t for t in all_tfs if t["_d"] == "2026-04-22" and is_win(t)     and not is_path_a(t) and is_path_b(t)]
b_clean_win  = [t for t in all_tfs if day_quality.get(t["_d"]) == "CLEAN" and is_win(t)     and not is_path_a(t) and is_path_b(t)]
b_clean_lose = [t for t in all_tfs if day_quality.get(t["_d"]) == "CLEAN" and not is_win(t) and not is_path_a(t) and is_path_b(t)]
print(f"Cohorts (Path-B-only TFS firings):  hostile-day losers={len(b_22_lose)}  hostile-day winners={len(b_22_win)}  clean-day winners={len(b_clean_win)}  clean-day losers={len(b_clean_lose)}")
print()
for label, key in [("ADX (the sustainability candidate)", "adx"), ("DBS score (abs)", "dbs"), ("Momentum", "mom"), ("Volatility", "vol")]:
    print(f"--- {label} ---")
    def pull(cohort, k):
        if k == "dbs": return [abs(t["_tel"]["dbs"]["score"]) for t in cohort]
        return [t["_tel"]["classifier"][k] for t in cohort]
    describe("04-22 losers (Path-B TFS)   ", pull(b_22_lose, key))
    describe("04-22 winners (Path-B TFS)  ", pull(b_22_win, key))
    describe("Clean-day wins (Path-B TFS) ", pull(b_clean_win, key))
    describe("Clean-day loses (Path-B TFS)", pull(b_clean_lose, key))
    print()

print("=" * 78)
print("ADX-FLOOR HYPOTHESIS PREVIEW: what if Path B required ADX >= threshold?")
print("=" * 78)
print()
print(f"{'Variant':<35} {'TFS-tagged':>12} {'WR':>7} {'sumNet':>10}")
pb_only = [t for t in all_tfs if not is_path_a(t) and is_path_b(t)]
n_pb = len(pb_only)
w_pb = sum(1 for t in pb_only if is_win(t))
s_pb = sum((t.get("netProfit") or 0) for t in pb_only)
print(f"  {'Current Path B (DBS alone)':<35} {n_pb:>12} {w_pb/max(n_pb,1)*100:>6.1f}% ${s_pb:>9.2f}")
for thresh in [30, 35, 40, 45]:
    kept = [t for t in pb_only if t["_tel"]["classifier"]["adx"] >= thresh]
    excluded = [t for t in pb_only if t["_tel"]["classifier"]["adx"] < thresh]
    if not kept:
        print(f"  Path B AND ADX>={thresh}: empty"); continue
    n = len(kept); w = sum(1 for t in kept if is_win(t)); s = sum((t.get("netProfit") or 0) for t in kept)
    nx = len(excluded); wx = sum(1 for t in excluded if is_win(t)) if excluded else 0
    sx = sum((t.get("netProfit") or 0) for t in excluded) if excluded else 0
    label = f"Path B AND ADX>={thresh}"
    suffix = f"  (excluded {nx} trades, WR {wx/max(nx,1)*100:.1f}%, ${sx:.2f})"
    print(f"  {label:<35} {n:>12} {w/n*100:>6.1f}% ${s:>9.2f}{suffix}")

print()
print("04-22 IMPACT OF ADX FLOOR")
print()
all_22 = [t for t in have_tel if t["_d"] == "2026-04-22"]
tfs_22 = [t for t in all_22 if t["_tel"]["classifier"]["regime"] == "TREND_FRIENDLY_STABLE"]
pb_only_22 = [t for t in tfs_22 if not is_path_a(t) and is_path_b(t)]
print(f"04-22 total trades w/ telemetry: {len(all_22)}")
print(f"04-22 TFS-tagged trades: {len(tfs_22)} ({len(tfs_22)/max(len(all_22),1)*100:.1f}%)")
print(f"04-22 TFS Path-B-only trades: {len(pb_only_22)}")
for thresh in [30, 35, 40, 45]:
    kept = [t for t in pb_only_22 if t["_tel"]["classifier"]["adx"] >= thresh]
    excluded = [t for t in pb_only_22 if t["_tel"]["classifier"]["adx"] < thresh]
    if kept:
        kept_wr = sum(1 for t in kept if is_win(t))/len(kept)*100
        kept_sum = sum((t.get("netProfit") or 0) for t in kept)
    else:
        kept_wr = 0; kept_sum = 0
    if excluded:
        ex_wr = sum(1 for t in excluded if is_win(t))/len(excluded)*100
        ex_sum = sum((t.get("netProfit") or 0) for t in excluded)
    else:
        ex_wr = 0; ex_sum = 0
    new_tfs_share = (len(tfs_22) - len(excluded)) / max(len(all_22),1) * 100
    print(f"  ADX>={thresh}: excluded {len(excluded)} trades (WR {ex_wr:.1f}%, ${ex_sum:.2f}); kept {len(kept)} (WR {kept_wr:.1f}%, ${kept_sum:.2f}); new TFS share = {new_tfs_share:.1f}% (was 100% of TFS)")
