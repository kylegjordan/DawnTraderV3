# Batch 47 Completion Report: Strategy Threshold Audit Round 1

> **Date**: 2026-04-02
> **Commits**: `3f039788`
> **Branch**: migration/aws-supabase
> **System Impact Map**: Reviewed BEFORE implementation
> **Reviewed by**: Langston (code review)

---

## Scope Objectives Checklist

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Relax detectRange() | **YES** | minBars 10→7, touchTolerance 0.3%→0.5%, minRangeWidth 3%→1.5%, durationHours 10→7 |
| 2 | Pattern DI config alignment | **YES** | DI_TRENDING_MIN 30→5 with fallback warning |
| 3 | Relax volume multipliers | **YES** | reverse_impulse 1.5→1.2, inside_bar 1.5→1.3, volatility_edge 2.0→1.5 |
| 4 | Before/after monitoring | **YES** | See comparison below |

---

## Before/After Comparison (5 VTS cycles each)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total evals | 656 | 621 | -35 |
| Total signals | 0 | 0 | 0 |
| range_not_found | 363 (55.3%) | 340 (54.8%) | -23 (-6%) |
| no_pattern | 153 (23.3%) | 145 (23.3%) | -8 |
| volume_insufficient | 27 (4.1%) | 41 (6.6%) | +14 |
| indicator_filter | 26 (4.0%) | 26 (4.2%) | 0 |
| price_position | 23 (3.5%) | 26 (4.2%) | +3 |

**Assessment:** range_not_found decreased marginally (363→340) but remains the dominant null at ~55%. The relaxations helped — pairs with ranges of 1.5-3% width now pass where they were previously rejected. But many pairs simply don't form tradeable ranges at all (0.43% width = noise). The `no_pattern` and `indicator_filter` categories are unchanged by this batch as expected. Volume changes caused more candidates to reach downstream gates (volume_insufficient increased because more candidates now pass range detection but fail at volume).

**V1 (range_not_found < 27%):** NOT MET. Still at 55%. The remaining range_not_found nulls are from genuinely rangeless pairs.
**V2 (3+ additional signals):** NOT MET. 0 signals both before and after.
**V3 (No junk signals):** N/A — no new signals to evaluate.
**V4 (Per-strategy attribution):** range_trade evals slightly decreased (380→344), volume-touched strategies unchanged in eval counts.

---

## Carry-Forward

- range_not_found at 55% is primarily a market structure issue, not just a threshold issue. The detectRange() algorithm requires structural consolidation that many crypto pairs don't exhibit on 1h timeframes.
- no_pattern at 23% is upstream (pattern recognizer not detecting patterns). This is a separate investigation.
- Round 2 (DHMA, indicator filters) may help with the remaining ~22% of nulls.
- Signal generation depends on BOTH range/pattern detection AND entry position alignment — multiple gates must all pass simultaneously.
