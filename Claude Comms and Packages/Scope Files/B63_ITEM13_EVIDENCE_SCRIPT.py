#!/usr/bin/env python3
"""
B63 Item 13 — vwap_pullback lane-promotion evidence accumulator.

Purpose: for the 2026-04-28 decision gate (KEEP / TUNE / BUILD_DEDICATED), this
script prints the side-by-side performance of vwap_pullback trades in the
strong-trend lane (sourcePool='quant-strong_trend') versus the legacy
QUANT-TREND lane cohort from before the B63 Item 11 lane promotion.

Run this on the DawnTrader staging server (188.245.193.8) OR pull the logs
locally first. The script expects JSONL trade records at
`logs/virtual_trades/*.jsonl`.

Usage:
    python3 B63_ITEM13_EVIDENCE_SCRIPT.py [--logdir PATH] [--since ISO_DATE]

Example (on staging):
    ssh deploy@188.245.193.8 'cd /home/deploy/dawntrader && python3 \\
        /home/deploy/scripts/B63_ITEM13_EVIDENCE_SCRIPT.py --since 2026-04-22'

Decision-gate criteria (pre-registered):
    KEEP: strong-trend-lane cohort WR >= 50% AND AvgR >= 0.15
    TUNE: strong-trend-lane cohort WR in [35%, 50%) OR AvgR in [-0.15, 0.15)
    BUILD_DEDICATED: strong-trend-lane cohort WR < 35% OR AvgR < -0.15
    (Minimum cohort size for a binding verdict: n >= 15)
"""

import argparse
import json
import glob
import os
import sys
from datetime import datetime, timezone
from statistics import mean, median, stdev


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def load_trades(logdir, since):
    trades = []
    for path in sorted(glob.glob(os.path.join(logdir, "*.jsonl"))):
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                if r.get("strategy") != "vwap_pullback":
                    continue
                exit_ts = parse_ts(r.get("exitTime") or r.get("closedAt"))
                if since and exit_ts and exit_ts < since:
                    continue
                trades.append(r)
    return trades


def r_multiple(trade):
    """Approximate R-multiple from entry, exit, stop."""
    entry = trade.get("entryPrice") or trade.get("signal", {}).get("entryPrice")
    exit_p = trade.get("exitPrice")
    stop = trade.get("stopLoss") or trade.get("signal", {}).get("stopLoss")
    if not all(isinstance(x, (int, float)) and x > 0 for x in (entry, exit_p, stop)):
        return None
    risk = abs(entry - stop)
    if risk == 0:
        return None
    # LONG trades: profit = exit - entry; LONG-only assumption for vwap_pullback
    return (exit_p - entry) / risk


def summarize(name, trades):
    if not trades:
        print(f"\n=== {name} ===")
        print("  (no trades in cohort)")
        return

    n = len(trades)
    wins = [t for t in trades if (t.get("netProfit") or 0) > 0]
    wr = len(wins) / n * 100

    pct_nets = []
    for t in trades:
        np_pct = t.get("netProfitPercent")
        if isinstance(np_pct, (int, float)):
            pct_nets.append(np_pct)
        elif isinstance(np_pct, str):
            try:
                pct_nets.append(float(np_pct.replace("%", "")))
            except Exception:
                pass

    r_mults = [r for r in (r_multiple(t) for t in trades) if r is not None]

    print(f"\n=== {name} (n={n}) ===")
    print(f"  WR:           {wr:5.1f}%  ({len(wins)}/{n})")
    if pct_nets:
        print(f"  mean netPL%:  {mean(pct_nets):+6.3f}%")
        print(f"  median netPL%:{median(pct_nets):+6.3f}%")
        print(f"  sum netPL%:   {sum(pct_nets):+6.2f}%")
    if r_mults:
        print(f"  mean R:       {mean(r_mults):+6.3f}")
        print(f"  median R:     {median(r_mults):+6.3f}")
        if len(r_mults) > 1:
            print(f"  stdev R:      {stdev(r_mults):6.3f}")

    # Win/loss magnitude ratio (range_trade pathology check)
    wins_pct = [p for p in pct_nets if p > 0]
    losses_pct = [p for p in pct_nets if p <= 0]
    if wins_pct and losses_pct:
        w_avg = mean(wins_pct)
        l_avg = mean(losses_pct)
        ratio = w_avg / abs(l_avg) if l_avg != 0 else None
        break_even = len(losses_pct) / n
        print(f"  avg win %:    {w_avg:+6.3f}%   avg loss %: {l_avg:+6.3f}%")
        if ratio is not None:
            required = break_even / (1 - break_even) if break_even < 1 else float("inf")
            print(f"  W:L magnitude ratio: {ratio:.3f}  (break-even at this WR needs >= {required:.3f})")


def verdict(strong_lane_trades):
    n = len(strong_lane_trades)
    if n < 15:
        print(f"\nVERDICT: INCONCLUSIVE — cohort n={n} < 15. Need more data before a binding decision.")
        return

    wins = [t for t in strong_lane_trades if (t.get("netProfit") or 0) > 0]
    wr = len(wins) / n * 100
    r_mults = [r for r in (r_multiple(t) for t in strong_lane_trades) if r is not None]
    avg_r = mean(r_mults) if r_mults else 0

    if wr >= 50 and avg_r >= 0.15:
        v = "KEEP"
    elif wr >= 35 or -0.15 <= avg_r < 0.15:
        v = "TUNE"
    else:
        v = "BUILD_DEDICATED"

    print(f"\nVERDICT (n={n}): {v}  (WR={wr:.1f}%, AvgR={avg_r:+.3f})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--logdir", default="logs/virtual_trades", help="Path to JSONL trade logs")
    ap.add_argument("--since", default=None, help="ISO date, e.g. 2026-04-15. Filters by exitTime >= since.")
    args = ap.parse_args()

    since = None
    if args.since:
        try:
            since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)
        except Exception:
            print(f"Bad --since value: {args.since}", file=sys.stderr)
            sys.exit(2)

    if not os.path.isdir(args.logdir):
        print(f"logdir not found: {args.logdir}", file=sys.stderr)
        sys.exit(2)

    trades = load_trades(args.logdir, since)
    if not trades:
        print("No vwap_pullback trades found in window.")
        return

    strong_lane = [t for t in trades if t.get("sourcePool") == "quant-strong_trend"]
    legacy = [t for t in trades if t.get("sourcePool") in ("QUANT-TREND", "quant-trend")]

    print(f"Total vwap_pullback closed in window: {len(trades)}")
    print(f"  strong-trend lane (post B64a): {len(strong_lane)}")
    print(f"  legacy QUANT-TREND lane:       {len(legacy)}")

    summarize("STRONG-TREND LANE cohort (quant-strong_trend)", strong_lane)
    summarize("LEGACY QUANT-TREND lane cohort", legacy)

    verdict(strong_lane)

    print("\n--- Decision gate criteria (pre-registered) ---")
    print("  KEEP:            strong-lane WR >= 50% AND AvgR >= 0.15")
    print("  TUNE:            WR in [35%, 50%) OR AvgR in [-0.15, 0.15)")
    print("  BUILD_DEDICATED: WR < 35% OR AvgR < -0.15")
    print("  Minimum cohort n for binding verdict: 15")


if __name__ == "__main__":
    main()
