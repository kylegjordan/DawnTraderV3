#!/usr/bin/env python3
"""
B62 post-deploy analysis: how do high-DBS pairs flow through the system?
Answers: are filters letting them through, are strategies detecting them,
are gates rejecting them, and what's the outcome when they trade?
"""
import json, os, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

TELEMETRY_DIR = "/home/deploy/dawntrader/logs/phase15b_dbs_telemetry"
TRADES_DIR = "/home/deploy/dawntrader/logs/virtual_trades"
BOUNDARY = datetime(2026, 4, 16, 9, 15, 0, tzinfo=timezone.utc).timestamp() * 1000

def bucket_of(abs_dbs):
    if abs_dbs < 0.10: return "0.00-0.10 NEUTRAL"
    if abs_dbs < 0.30: return "0.10-0.30 WEAK"
    if abs_dbs < 0.50: return "0.30-0.50 MODERATE"
    if abs_dbs < 0.60: return "0.50-0.60 STRONG-M"
    return "0.60+ STRONG"

BUCKETS = ["0.00-0.10 NEUTRAL", "0.10-0.30 WEAK", "0.30-0.50 MODERATE", "0.50-0.60 STRONG-M", "0.60+ STRONG"]

# ===============================================================
# 1) Pair-cycle count by DBS bucket (from MCE telemetry)
# ===============================================================
cycle_count = Counter()
pairs_per_bucket = defaultdict(set)

for fn in ["2026-04-16.jsonl", "2026-04-17.jsonl", "2026-04-18.jsonl", "2026-04-19.jsonl"]:
    path = os.path.join(TELEMETRY_DIR, fn)
    if not os.path.exists(path): continue
    with open(path) as f:
        for line in f:
            try:
                obj = json.loads(line)
                if obj["ts"] < "2026-04-16T09:15": continue
                if obj["dbs"].get("sentinelZero"): continue
                abs_dbs = abs(obj["dbs"]["score"])
                b = bucket_of(abs_dbs)
                cycle_count[b] += 1
                pairs_per_bucket[b].add(obj["symbol"])
            except: continue

total_cycles = sum(cycle_count.values())

# ===============================================================
# 2) Trade outcomes by DBS bucket (from virtual_trades)
# ===============================================================
trade_stats = defaultdict(lambda: {
    "count": 0, "wins": 0, "losses": 0,
    "total_pnl": 0.0, "total_pnl_pct": 0.0,
    "strategies": Counter(), "regimes": Counter(),
    "result_types": Counter(), "durations_ms": [],
    "pairs": set()
})

for fn in ["2026-04-16.json", "2026-04-17.json", "2026-04-18.json", "2026-04-19.json"]:
    path = os.path.join(TRADES_DIR, fn)
    if not os.path.exists(path): continue
    try:
        with open(path) as f:
            data = json.load(f)
        trades = data if isinstance(data, list) else data.get("trades", [])
    except Exception as e:
        continue
    for t in trades:
        entry_ms = t.get("entryTime") or 0
        if entry_ms < BOUNDARY: continue
        if t.get("status") != "closed": continue
        dbs_score = t.get("pairDirectionalBiasScore", 0) or 0
        b = bucket_of(abs(dbs_score))
        s = trade_stats[b]
        s["count"] += 1
        net_pnl = t.get("netProfit", 0) or 0
        s["total_pnl"] += net_pnl
        if net_pnl > 0: s["wins"] += 1
        elif net_pnl < 0: s["losses"] += 1
        sig = t.get("signal", {})
        s["strategies"][sig.get("strategy", "?")] += 1
        s["regimes"][t.get("regime", "?")] += 1
        s["result_types"][t.get("resultType", "?")] += 1
        s["pairs"].add(t.get("signal", {}).get("symbol", "?"))
        exit_ms = t.get("exitTime") or 0
        if exit_ms > entry_ms:
            s["durations_ms"].append(exit_ms - entry_ms)

# ===============================================================
# 3) Open trades by DBS bucket (current state)
# ===============================================================
open_trades = defaultdict(lambda: {"count": 0, "pairs": set()})
open_path = "/home/deploy/dawntrader/logs/open_virtual_trades.json"
# Actually open trades are in the per-day files with status=open
for fn in ["2026-04-19.json"]:
    path = os.path.join(TRADES_DIR, fn)
    if not os.path.exists(path): continue
    try:
        with open(path) as f:
            data = json.load(f)
        trades = data if isinstance(data, list) else data.get("trades", [])
    except:
        continue
    for t in trades:
        if t.get("status") != "open": continue
        dbs = t.get("pairDirectionalBiasScore", 0) or 0
        b = bucket_of(abs(dbs))
        open_trades[b]["count"] += 1
        open_trades[b]["pairs"].add(t.get("signal", {}).get("symbol", "?"))

# ===============================================================
# OUTPUT
# ===============================================================
print("="*80)
print("HIGH-DBS PAIR FLOW ANALYSIS (post-B62, ~72h window)")
print("="*80)

print("\n## 1) PAIR-CYCLES BY DBS BUCKET (MCE evaluations)")
print(f"{'Bucket':<22} {'Cycles':>10} {'%':>7} {'Unique pairs':>14}")
for b in BUCKETS:
    c = cycle_count.get(b, 0)
    pct = 100*c/total_cycles if total_cycles else 0
    upairs = len(pairs_per_bucket[b])
    print(f"{b:<22} {c:>10,} {pct:>6.1f}% {upairs:>14}")

print(f"\nTotal pair-cycles evaluated by MCE: {total_cycles:,}")

print("\n## 2) CLOSED TRADES BY DBS BUCKET (at entry time)")
print(f"{'Bucket':<22} {'Trades':>8} {'Win%':>7} {'TotalP/L':>10} {'AvgP/L':>9} {'AvgDurH':>9} {'Pairs':>7}")
total_closed = 0
for b in BUCKETS:
    s = trade_stats.get(b, None)
    if not s or s["count"] == 0:
        print(f"{b:<22} {'0':>8} {'-':>7} {'-':>10} {'-':>9} {'-':>9} {'-':>7}")
        continue
    total_closed += s["count"]
    win_rate = 100*s["wins"]/s["count"]
    avg_pnl = s["total_pnl"]/s["count"]
    avg_dur_h = sum(s["durations_ms"])/len(s["durations_ms"])/3600000 if s["durations_ms"] else 0
    print(f"{b:<22} {s['count']:>8} {win_rate:>6.1f}% ${s['total_pnl']:>8.2f} ${avg_pnl:>7.4f} {avg_dur_h:>8.2f}h {len(s['pairs']):>7}")

print(f"\nTotal closed trades (post-B62): {total_closed}")

print("\n## 3) OPEN TRADES BY DBS BUCKET")
for b in BUCKETS:
    o = open_trades.get(b, {"count": 0, "pairs": set()})
    if o["count"] > 0:
        print(f"  {b}: {o['count']} open ({len(o['pairs'])} unique pairs)")

print("\n## 4) CONVERSION RATE: pair-cycles -> closed trades")
print("(Proxy: what fraction of eligible pair-cycles resulted in a completed trade cycle?)")
print(f"{'Bucket':<22} {'PairCycles':>12} {'ClosedTrades':>14} {'Conv%':>8}")
for b in BUCKETS:
    cc = cycle_count.get(b, 0)
    tc = trade_stats.get(b, {}).get("count", 0)
    conv = 100*tc/cc if cc else 0
    print(f"{b:<22} {cc:>12,} {tc:>14} {conv:>7.4f}%")

print("\n## 5) STRATEGY MIX FOR HIGH-DBS TRADES (|DBS| >= 0.30)")
high_dbs_strats = Counter()
high_dbs_count = 0
high_dbs_wins = 0
high_dbs_pnl = 0.0
for b in ["0.30-0.50 MODERATE", "0.50-0.60 STRONG-M", "0.60+ STRONG"]:
    s = trade_stats.get(b, None)
    if not s: continue
    for strat, n in s["strategies"].items():
        high_dbs_strats[strat] += n
    high_dbs_count += s["count"]
    high_dbs_wins += s["wins"]
    high_dbs_pnl += s["total_pnl"]

if high_dbs_count > 0:
    print(f"Total high-DBS trades: {high_dbs_count}")
    print(f"Win rate: {100*high_dbs_wins/high_dbs_count:.1f}%")
    print(f"Net P/L: ${high_dbs_pnl:.2f} (avg ${high_dbs_pnl/high_dbs_count:.4f}/trade)")
    print(f"Strategy mix:")
    for strat, n in high_dbs_strats.most_common():
        pct = 100*n/high_dbs_count
        print(f"  {strat}: {n} ({pct:.1f}%)")

print("\n## 6) COMPARISON: low-DBS vs high-DBS trade performance")
low_dbs_count = 0
low_dbs_wins = 0
low_dbs_pnl = 0.0
for b in ["0.00-0.10 NEUTRAL", "0.10-0.30 WEAK"]:
    s = trade_stats.get(b, None)
    if not s: continue
    low_dbs_count += s["count"]
    low_dbs_wins += s["wins"]
    low_dbs_pnl += s["total_pnl"]

print(f"{'':22} {'Trades':>8} {'Win%':>7} {'AvgPnL':>10} {'TotalPnL':>12}")
if low_dbs_count > 0:
    print(f"Low-DBS (|DBS|<0.30){'':2} {low_dbs_count:>8} {100*low_dbs_wins/low_dbs_count:>6.1f}% ${low_dbs_pnl/low_dbs_count:>8.4f} ${low_dbs_pnl:>10.2f}")
if high_dbs_count > 0:
    print(f"High-DBS (|DBS|>=0.30) {high_dbs_count:>8} {100*high_dbs_wins/high_dbs_count:>6.1f}% ${high_dbs_pnl/high_dbs_count:>8.4f} ${high_dbs_pnl:>10.2f}")

print("\n## 7) PER-STRATEGY: win rate and avg P/L (all DBS levels combined)")
strat_aggr = defaultdict(lambda: {"count": 0, "wins": 0, "pnl": 0.0})
for b, s in trade_stats.items():
    for strat, n in s["strategies"].items():
        pass  # need per-strategy stats
# Re-parse for per-strategy view
per_strat = defaultdict(lambda: {"count": 0, "wins": 0, "pnl": 0.0, "dbs_sum": 0.0})
for fn in ["2026-04-16.json", "2026-04-17.json", "2026-04-18.json", "2026-04-19.json"]:
    path = os.path.join(TRADES_DIR, fn)
    if not os.path.exists(path): continue
    try:
        with open(path) as f:
            data = json.load(f)
        trades = data if isinstance(data, list) else data.get("trades", [])
    except:
        continue
    for t in trades:
        entry_ms = t.get("entryTime") or 0
        if entry_ms < BOUNDARY: continue
        if t.get("status") != "closed": continue
        sig = t.get("signal", {})
        strat = sig.get("strategy", "?")
        dbs = t.get("pairDirectionalBiasScore", 0) or 0
        net_pnl = t.get("netProfit", 0) or 0
        s = per_strat[strat]
        s["count"] += 1
        if net_pnl > 0: s["wins"] += 1
        s["pnl"] += net_pnl
        s["dbs_sum"] += abs(dbs)

print(f"{'Strategy':<20} {'Trades':>8} {'Win%':>7} {'AvgPnL':>10} {'AvgAbsDBS':>11}")
for strat, s in sorted(per_strat.items(), key=lambda x: -x[1]["count"]):
    if s["count"] == 0: continue
    wr = 100*s["wins"]/s["count"]
    apnl = s["pnl"]/s["count"]
    adbs = s["dbs_sum"]/s["count"]
    print(f"{strat:<20} {s['count']:>8} {wr:>6.1f}% ${apnl:>8.4f} {adbs:>10.3f}")
