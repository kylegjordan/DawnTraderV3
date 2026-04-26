#!/usr/bin/env python3
"""B65.6 Phase A Track 2 Step 1 - find historical hostile days from VTS logs.

For each day with substantive VTS data (Jan 17 onward), compute system-wide WR.
Flag days with WR < 25% as hostile candidates. Cross-reference with strategy
composition (was one strategy bombing, or all strategies?).
"""
import json, glob, os
from collections import defaultdict
from datetime import datetime, timezone

VTS_DIR = "/home/deploy/dawntrader/logs/virtual_trades"

def fmt_day(ms): return datetime.fromtimestamp(ms/1000, tz=timezone.utc).strftime("%Y-%m-%d")
def is_win(t): return (t.get("netProfit") or 0) > 0

print("Loading all VTS trades...", flush=True)
trades=[]; seen=set()
files = sorted(glob.glob(f"{VTS_DIR}/2026-*.json"))
print(f"Files to scan: {len(files)}", flush=True)

for f in files:
    try:
        sz = os.path.getsize(f)
        if sz < 10000: continue  # skip empty/tiny files
        for t in json.load(open(f)):
            if t.get("status") != "closed": continue
            if t.get("id") in seen: continue
            seen.add(t.get("id")); trades.append(t)
    except Exception as e:
        print(f"  skip {f}: {e}", flush=True)

for t in trades: t["_d"] = fmt_day(t.get("entryTime", 0))
print(f"Loaded {len(trades)} closed trades total", flush=True)

# Per-day metrics
by_day = defaultdict(list)
for t in trades:
    by_day[t["_d"]].append(t)

print()
print("=" * 90)
print("PER-DAY SYSTEM-WIDE WR + STRATEGY COMPOSITION (full history)")
print("=" * 90)
print()
print(f"{'Day':<12} {'n':>5} {'WR':>7} {'sumNet':>9} {'flag':<10} {'top strategies (n / WR%)'}")

hostile_days = []
mixed_days = []
clean_days = []

for d in sorted(by_day):
    sub = by_day[d]
    n = len(sub)
    if n < 20: continue  # need decent sample
    w = sum(1 for t in sub if is_win(t))
    wr = w/n*100
    s = sum((t.get("netProfit") or 0) for t in sub)

    if wr < 25: flag = "HOSTILE"; hostile_days.append(d)
    elif wr >= 35: flag = "CLEAN"; clean_days.append(d)
    else: flag = "MIXED"; mixed_days.append(d)

    by_strat = defaultdict(lambda: [0,0])
    for t in sub:
        st = t.get("strategy") or "?"
        by_strat[st][0] += 1
        if is_win(t): by_strat[st][1] += 1
    top3 = sorted(by_strat.items(), key=lambda x: -x[1][0])[:3]
    top3_str = ", ".join(f"{s}({n_}/{w_/n_*100:.0f}%)" for s, (n_, w_) in top3)

    print(f"  {d:<10} {n:>5} {wr:>5.1f}% ${s:>7.2f} {flag:<10} {top3_str}")

print()
print("=" * 90)
print(f"SUMMARY: {len(hostile_days)} HOSTILE days, {len(mixed_days)} MIXED, {len(clean_days)} CLEAN")
print("=" * 90)
print()
print(f"Hostile days: {hostile_days}")
print(f"Mixed days:   {mixed_days}")
print(f"Clean days:   {clean_days}")

# Hostile-day analysis: was it all strategies losing or one specific?
print()
print("=" * 90)
print("HOSTILE DAY DEEP DIVE: per-strategy WR on each hostile day")
print("=" * 90)
print()
for d in hostile_days:
    sub = by_day[d]
    n = len(sub); w = sum(1 for t in sub if is_win(t))
    wr = w/n*100
    print(f"\n--- {d} (n={n}, WR={wr:.1f}%) ---")
    by_strat = defaultdict(lambda: [0,0])
    by_pool = defaultdict(lambda: [0,0])
    for t in sub:
        st = t.get("strategy") or "?"
        sp = t.get("sourcePool") or "?"
        by_strat[st][0] += 1
        by_pool[sp][0] += 1
        if is_win(t):
            by_strat[st][1] += 1
            by_pool[sp][1] += 1
    print("  By strategy:")
    for st, (n_, w_) in sorted(by_strat.items(), key=lambda x: -x[1][0]):
        if n_ >= 3:
            print(f"    {st:<30} n={n_:>3} WR={w_/n_*100:>5.1f}%")
    print("  By source pool:")
    for sp, (n_, w_) in sorted(by_pool.items(), key=lambda x: -x[1][0]):
        if n_ >= 3:
            print(f"    {sp:<30} n={n_:>3} WR={w_/n_*100:>5.1f}%")
    # Was the whole day uniform? Check hour-by-hour WR
    hr_wr = defaultdict(lambda: [0,0])
    for t in sub:
        h = datetime.fromtimestamp(t["entryTime"]/1000, tz=timezone.utc).hour
        hr_wr[h][0] += 1
        if is_win(t): hr_wr[h][1] += 1
    print("  Hourly WR (UTC, hours with >=3 trades):")
    for h in sorted(hr_wr):
        n_, w_ = hr_wr[h]
        if n_ >= 3:
            print(f"    {h:02d}:00 UTC  n={n_:>3} WR={w_/n_*100:>5.1f}%")
