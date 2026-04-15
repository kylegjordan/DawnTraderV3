#!/usr/bin/env python3
"""
BATCH 61 — A.1 Provisional — Weight Sensitivity.

Recomputes the DBS score under alternate weight sets and reports:
  - 7-category mass shift per alternate weighting
  - Fraction of observations that change category under each alternate
  - Mean absolute score delta per alternate

The stored components are already weight-scaled (slopeComponent = raw_slope * 0.40,
etc.) so to recompute under alternate weights we must first unscale the component
by dividing out the original weight, then re-multiply by the alternate weight.

Original weights (from DEFAULT_DBS_WEIGHTS): slope=0.40, return=0.35, ema=0.25

Alternate weight sets to evaluate (from pre-audit §4 A.1 item 2):
  (0.50, 0.30, 0.20)  — slope-heavy
  (0.33, 0.33, 0.34)  — equal
  (0.40, 0.20, 0.40)  — slope-ema balanced, return demoted
  (0.40, 0.35, 0.25)  — current (control)

Category thresholds (unchanged): UP_STRONG >= 0.60, UP_MODERATE >= 0.30,
UP_WEAK >= 0.10, NEUTRAL (-0.10, 0.10), mirrored down.

Usage: python3 a1_weight_sensitivity.py <path-to-jsonl>
"""
import json
import sys
from collections import Counter

ORIGINAL = {"slope": 0.40, "return": 0.35, "ema": 0.25}

ALTERNATES = {
    "current (0.40/0.35/0.25)": {"slope": 0.40, "return": 0.35, "ema": 0.25},
    "slope-heavy (0.50/0.30/0.20)": {"slope": 0.50, "return": 0.30, "ema": 0.20},
    "equal (0.33/0.33/0.34)": {"slope": 0.33, "return": 0.33, "ema": 0.34},
    "slope-ema (0.40/0.20/0.40)": {"slope": 0.40, "return": 0.20, "ema": 0.40},
}

CATEGORY_ORDER = [
    "UP_STRONG", "UP_MODERATE", "UP_WEAK",
    "NEUTRAL",
    "DOWN_WEAK", "DOWN_MODERATE", "DOWN_STRONG"
]

def categorize(score):
    if score >= 0.60:
        return "UP_STRONG"
    if score >= 0.30:
        return "UP_MODERATE"
    if score >= 0.10:
        return "UP_WEAK"
    if score <= -0.60:
        return "DOWN_STRONG"
    if score <= -0.30:
        return "DOWN_MODERATE"
    if score <= -0.10:
        return "DOWN_WEAK"
    return "NEUTRAL"

def main(path):
    clean = []
    with open(path) as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj["dbs"]["sentinelZero"]:
                continue
            clean.append(obj)

    print(f"INPUT_SAMPLES: {len(clean)}")
    print()

    # Unscale stored components to recover raw (unweighted) inputs.
    raws = []
    for l in clean:
        d = l["dbs"]
        raw_slope = d["slopeComponent"] / ORIGINAL["slope"]
        raw_return = d["returnComponent"] / ORIGINAL["return"]
        raw_ema = d["emaComponent"] / ORIGINAL["ema"]
        raws.append((raw_slope, raw_return, raw_ema, d["score"], d["category"]))

    # Control: does unscale → rescale → sum reproduce the stored score exactly?
    max_err = 0.0
    for rs, rr, re, score, cat in raws:
        recomputed = (
            ORIGINAL["slope"] * rs
            + ORIGINAL["return"] * rr
            + ORIGINAL["ema"] * re
        )
        # clamp to [-1, 1]
        recomputed = max(-1.0, min(1.0, recomputed))
        err = abs(recomputed - score)
        if err > max_err:
            max_err = err
    print(f"ROUNDTRIP_CHECK max|recomputed-stored| = {max_err:.2e}")
    if max_err > 1e-9:
        print("WARNING: unscale/rescale roundtrip is not exact — components are clamped")
        print("at the individual component level before weighting, so unscaling throws")
        print("away the clamp history. Results below are still directionally correct but")
        print("over-estimate how much alternate weights can shift the score at extremes.")
    print()

    # Recompute under each alternate
    print("=== CATEGORY MASS UNDER ALTERNATE WEIGHTS ===")
    results = {}
    for label, weights in ALTERNATES.items():
        alt_scores = []
        for rs, rr, re, _, _ in raws:
            s = weights["slope"] * rs + weights["return"] * rr + weights["ema"] * re
            s = max(-1.0, min(1.0, s))
            alt_scores.append(s)
        alt_cats = [categorize(s) for s in alt_scores]
        results[label] = (alt_scores, alt_cats)

    # Print category distribution side-by-side
    header = f"{'CATEGORY':18s}"
    for label in ALTERNATES:
        header += f"  {label.split(' ')[0][:12]:>14s}"
    print(header)
    for cat in CATEGORY_ORDER:
        row = f"{cat:18s}"
        for label, (_, cats) in results.items():
            c = cats.count(cat)
            pct = 100.0 * c / len(cats)
            row += f"  {pct:13.2f}%"
        print(row)
    print()

    # Category change rate vs current
    print("=== CATEGORY CHANGE RATE vs CURRENT WEIGHTING ===")
    current_cats = results["current (0.40/0.35/0.25)"][1]
    for label, (_, cats) in results.items():
        if label.startswith("current"):
            continue
        changed = sum(1 for a, b in zip(current_cats, cats) if a != b)
        pct = 100.0 * changed / len(cats)
        print(f"  {label:32s} : {changed:6d}/{len(cats)} ({pct:5.2f}%) observations change category")
    print()

    # Mean absolute score delta
    print("=== MEAN ABSOLUTE SCORE DELTA vs CURRENT ===")
    current_scores = results["current (0.40/0.35/0.25)"][0]
    for label, (scores, _) in results.items():
        if label.startswith("current"):
            continue
        mad = sum(abs(a - b) for a, b in zip(current_scores, scores)) / len(scores)
        max_d = max(abs(a - b) for a, b in zip(current_scores, scores))
        print(f"  {label:32s} : mean|Δ|={mad:.4f}  max|Δ|={max_d:.4f}")
    print()

    # Interpretation hint
    print("Interpretation heuristic:")
    print("  - mean|Δ| < 0.05 and change rate < 10%: weights are on a PLATEAU —")
    print("    specific choice is not critical, the formula is robust.")
    print("  - mean|Δ| > 0.10 or change rate > 25%: weights are on a CLIFF —")
    print("    small weight changes produce big shifts, the formula is brittle.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "logs/phase15b_dbs_telemetry/2026-04-15.jsonl")
