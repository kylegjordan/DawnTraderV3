#!/usr/bin/env python3
"""
BATCH 61 — A.2 Provisional — DBS Threshold & Category Review.

Runs TWO cross-tabulations:

1. VTS 15-day window (trade-sampled): for each trade, pair `pairDirectionalBias`
   category string with the `regime` field. Answers: among trades that fired,
   which DBS categories ended up in which regimes?

2. Full-universe MCE telemetry (cycle-sampled): for each clean cycle sample,
   pair `dbs.category` with `classifier.regime`. Answers: across every pair
   at every cycle, which DBS categories coexist with which regime labels?

Key questions the cross-tab answers:
  a) Drift-contamination: what fraction of RANGE_BOUND_STABLE-labeled pairs
     have non-NEUTRAL DBS? (B59 found ~47% in the 88-pair snapshot.)
  b) Starving strategies: how many strong-DBS pairs are getting locked out
     of trend strategies by regime mislabeling? (Kyle's strategy-discovery
     question from the 2026-04-15 discussion.)
  c) Category mass comparison: does the trade-sampled distribution differ
     from the full-universe distribution? (Selection bias check.)

Usage:
  python3 a2_threshold_review.py <vts_dir> <mce_jsonl>
"""
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime

CATEGORY_ORDER = [
    "UP_STRONG", "UP_MODERATE", "UP_WEAK",
    "NEUTRAL",
    "DOWN_WEAK", "DOWN_MODERATE", "DOWN_STRONG"
]

REGIME_ORDER = [
    "TREND_FRIENDLY_STABLE",
    "IMPULSE_EXPANSION",
    "HIGH_VOLATILITY_UNSTABLE",
    "STRUCTURAL_TRANSITION",
    "RANGE_BOUND_STABLE",
]

STRONG_CATEGORIES = {"UP_STRONG", "UP_MODERATE", "DOWN_MODERATE", "DOWN_STRONG"}
NON_NEUTRAL = {c for c in CATEGORY_ORDER if c != "NEUTRAL"}
TREND_PERMISSIVE_REGIMES = {"TREND_FRIENDLY_STABLE", "IMPULSE_EXPANSION"}


def print_crosstab(title, crosstab, row_order, col_order, row_label="DBS"):
    print(f"=== {title} ===")
    total = sum(crosstab[r][c] for r in crosstab for c in crosstab[r])
    if total == 0:
        print("  (no data)")
        return
    print(f"{row_label:16s}", end="")
    for col in col_order:
        short = col.replace("_", " ")[:12]
        print(f"  {short:>14s}", end="")
    print(f"  {'TOTAL':>8s}  {'%':>7s}")
    for row in row_order:
        print(f"{row:16s}", end="")
        rtotal = 0
        for col in col_order:
            v = crosstab[row].get(col, 0)
            rtotal += v
            print(f"  {v:>14d}", end="")
        rpct = 100.0 * rtotal / total
        print(f"  {rtotal:>8d}  {rpct:>6.2f}%")
    # column totals
    print(f"{'TOTAL':16s}", end="")
    for col in col_order:
        ctotal = sum(crosstab[r].get(col, 0) for r in crosstab)
        print(f"  {ctotal:>14d}", end="")
    print(f"  {total:>8d}  100.00%")
    print()
    # column %
    print(f"{'col %':16s}", end="")
    for col in col_order:
        ctotal = sum(crosstab[r].get(col, 0) for r in crosstab)
        cpct = 100.0 * ctotal / total
        print(f"  {cpct:>13.2f}%", end="")
    print()


def main(vts_dir, mce_path):
    # --- 1. VTS trade-sampled cross-tab ---
    vts_ct = defaultdict(lambda: defaultdict(int))
    vts_total = 0
    vts_dbs_era_start = datetime(2026, 3, 5)  # DBS added commit 5bfa63b
    for fname in sorted(os.listdir(vts_dir)):
        if not fname.endswith(".json"):
            continue
        # Parse date from filename
        try:
            fdate = datetime.strptime(fname.replace(".json", ""), "%Y-%m-%d")
        except ValueError:
            continue
        if fdate < vts_dbs_era_start:
            continue
        with open(os.path.join(vts_dir, fname)) as fp:
            data = json.load(fp)
        for t in data:
            cat = t.get("pairDirectionalBias")
            reg = t.get("regime")
            if cat and reg:
                vts_ct[cat][reg] += 1
                vts_total += 1

    print(f"=== VTS WINDOW (DBS ERA: 2026-03-05 → today) ===")
    print(f"Total DBS-era VTS trades: {vts_total}")
    print()
    print_crosstab("VTS: DBS category × classifier regime (trade-sampled)",
                   vts_ct, CATEGORY_ORDER, REGIME_ORDER)

    # --- 2. MCE cycle-sampled cross-tab ---
    mce_ct = defaultdict(lambda: defaultdict(int))
    mce_total = 0
    with open(mce_path) as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj["dbs"]["sentinelZero"]:
                continue
            cat = obj["dbs"]["category"]
            reg = obj["classifier"]["regime"]
            mce_ct[cat][reg] += 1
            mce_total += 1
    print(f"=== MCE CYCLE-SAMPLED (early window, ~12h) ===")
    print(f"Total clean cycle samples: {mce_total}")
    print()
    print_crosstab("MCE: DBS category × classifier regime (full universe)",
                   mce_ct, CATEGORY_ORDER, REGIME_ORDER)

    # --- 3. Key derived numbers ---
    def sum_ct(ct, cats, regimes):
        return sum(ct[c].get(r, 0) for c in cats for r in regimes)

    print("=== KEY FINDINGS ===")

    # VTS findings
    print(f"\n-- VTS TRADE-SAMPLED (n={vts_total}) --")
    if vts_total > 0:
        # Of RANGE_BOUND_STABLE-labeled trades, what fraction have non-NEUTRAL DBS?
        rbs_all = sum(vts_ct[c].get("RANGE_BOUND_STABLE", 0) for c in CATEGORY_ORDER)
        rbs_non_neutral = sum(vts_ct[c].get("RANGE_BOUND_STABLE", 0) for c in NON_NEUTRAL)
        if rbs_all > 0:
            pct = 100.0 * rbs_non_neutral / rbs_all
            print(f"  Drift-contamination: {rbs_non_neutral}/{rbs_all} ({pct:.2f}%) of RANGE_BOUND_STABLE-labeled trades have non-NEUTRAL DBS")
            print(f"  (B59 snapshot showed ~47%; reproduction check)")

        # Of strong-DBS trades, what fraction are in trend-permissive regimes?
        strong_all = sum(
            sum(vts_ct[c].values())
            for c in STRONG_CATEGORIES
        )
        strong_trend = sum(
            vts_ct[c].get(r, 0)
            for c in STRONG_CATEGORIES
            for r in TREND_PERMISSIVE_REGIMES
        )
        strong_rbs = sum(vts_ct[c].get("RANGE_BOUND_STABLE", 0) for c in STRONG_CATEGORIES)
        if strong_all > 0:
            pct_trend = 100.0 * strong_trend / strong_all
            pct_rbs = 100.0 * strong_rbs / strong_all
            print(f"  Strong-DBS trades (UP/DOWN MODERATE or STRONG): {strong_all}")
            print(f"    In trend-permissive regimes (TFS/IE): {strong_trend} ({pct_trend:.2f}%)")
            print(f"    In RANGE_BOUND_STABLE:                  {strong_rbs} ({pct_rbs:.2f}%)")
            print(f"    => {pct_rbs:.0f}% of strong-DBS trades are 'locked out' of trend strategies by regime mislabeling")

        # Total trades by DBS category in VTS
        cat_vts = Counter()
        for c in CATEGORY_ORDER:
            cat_vts[c] = sum(vts_ct[c].values())
        print(f"\n  VTS DBS category mass:")
        for c in CATEGORY_ORDER:
            n = cat_vts[c]
            pct = 100.0 * n / vts_total
            bar = "#" * int(50 * n / vts_total)
            print(f"    {c:16s} {n:6d}  ({pct:5.2f}%)  {bar}")

    # MCE findings
    print(f"\n-- MCE CYCLE-SAMPLED (n={mce_total}) --")
    if mce_total > 0:
        rbs_all = sum(mce_ct[c].get("RANGE_BOUND_STABLE", 0) for c in CATEGORY_ORDER)
        rbs_non_neutral = sum(mce_ct[c].get("RANGE_BOUND_STABLE", 0) for c in NON_NEUTRAL)
        if rbs_all > 0:
            pct = 100.0 * rbs_non_neutral / rbs_all
            print(f"  Drift-contamination: {rbs_non_neutral}/{rbs_all} ({pct:.2f}%) of RANGE_BOUND_STABLE-labeled pair-cycles have non-NEUTRAL DBS")

        strong_all = sum(
            sum(mce_ct[c].values())
            for c in STRONG_CATEGORIES
        )
        strong_trend = sum(
            mce_ct[c].get(r, 0)
            for c in STRONG_CATEGORIES
            for r in TREND_PERMISSIVE_REGIMES
        )
        strong_rbs = sum(mce_ct[c].get("RANGE_BOUND_STABLE", 0) for c in STRONG_CATEGORIES)
        if strong_all > 0:
            pct_trend = 100.0 * strong_trend / strong_all
            pct_rbs = 100.0 * strong_rbs / strong_all
            print(f"  Strong-DBS pair-cycles: {strong_all}")
            print(f"    In trend-permissive regimes (TFS/IE): {strong_trend} ({pct_trend:.2f}%)")
            print(f"    In RANGE_BOUND_STABLE:                  {strong_rbs} ({pct_rbs:.2f}%)")
            print(f"    => {pct_rbs:.0f}% of strong-DBS pair-cycles would be 'locked out' of trend strategies")
        print()

    # Selection bias check
    if vts_total > 0 and mce_total > 0:
        print(f"\n-- SELECTION BIAS (VTS vs MCE category mass) --")
        cat_vts = Counter()
        for c in CATEGORY_ORDER:
            cat_vts[c] = sum(vts_ct[c].values())
        cat_mce = Counter()
        for c in CATEGORY_ORDER:
            cat_mce[c] = sum(mce_ct[c].values())
        print(f"  {'category':16s}  {'VTS %':>10s}  {'MCE %':>10s}  {'delta':>10s}")
        for c in CATEGORY_ORDER:
            v = 100.0 * cat_vts[c] / vts_total
            m = 100.0 * cat_mce[c] / mce_total
            d = v - m
            marker = " *" if abs(d) >= 3 else ""
            print(f"  {c:16s}  {v:>9.2f}%  {m:>9.2f}%  {d:>+9.2f}%{marker}")
        print(f"  (* = |delta| >= 3pp, suggesting selection bias where VTS trades over/under-represent a category)")

    print()
    print("=== FULL-UNIVERSE CLASSIFIER REGIME DISTRIBUTION ===")
    regime_count = Counter()
    for c in CATEGORY_ORDER:
        for r in REGIME_ORDER:
            regime_count[r] += mce_ct[c].get(r, 0)
    for r in REGIME_ORDER:
        n = regime_count[r]
        pct = 100.0 * n / mce_total if mce_total > 0 else 0
        bar = "#" * int(50 * n / mce_total) if mce_total > 0 else ""
        print(f"  {r:26s} {n:6d}  ({pct:5.2f}%)  {bar}")

if __name__ == "__main__":
    vts_dir = sys.argv[1] if len(sys.argv) > 1 else "logs/virtual_trades"
    mce_path = sys.argv[2] if len(sys.argv) > 2 else "logs/phase15b_dbs_telemetry/2026-04-15.jsonl"
    main(vts_dir, mce_path)
