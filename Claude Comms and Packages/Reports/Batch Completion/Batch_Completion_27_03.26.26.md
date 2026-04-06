# Batch 27 Completion Report

**Date**: 2026-03-26
**Batch**: 27
**Phase**: 14.6
**Commit**: `d8317c02`
**Commit Message**: Batch 27: byStrategy dup guard fix + null pct denominator + logSkippedSignal key fix

---

## Executive Summary

Batch 27 fixes 3 counter bugs found during Batch 26 verification and resolves 3 investigation items as by-design. 4 surgical edits across 2 files.

## Changes Deployed

| Edit | File | Description |
|------|------|-------------|
| A | vts-runner.ts | Duplicate guard now increments byStrategy[stratKey].evaluated and .nulls — closes #22 |
| B | vts-runner.ts | logSkippedSignal key fixed: Net_EV_Below_VTS_Floor → Net_EV_Negative — closes #20 partially |
| C | machine-learning.tsx | Null reason % denominator: sum of all nullReason values instead of quantStrategyNulls only — closes #23 |
| D | machine-learning.tsx | Added familyFilterMismatch label to Null Reason Breakdown |

## Issues Resolved as By-Design
- **#7 LQ = 0**: Thresholds are 20-40, all Kraken pairs exceed them. Working correctly.
- **#9 Benchmark bypass pattern = 0**: Pattern path has no bypass by design. Zero is truthful.
- **#5 Quant pattern detection = 0**: Quant pairs don't run scanPatterns(). By design.

## Post-Implementation Audit
- Code review: All 4 edits verified in clone
- Git log: Clean fast-forward, commit d8317c02
- Zero remaining references to Net_EV_Below_VTS_Floor
- totalNulls denominator now uses Object.values(ve.nullReasons).reduce()
- familyFilterMismatch label present in labels map
- **Server needs restart for changes to take effect**

## Verification (post-restart)
1. byStrategy TOTAL should equal Total Strategy Evaluations
2. No null reason % should exceed 100%
3. Signal rejection byReason should show non-zero Net_EV_Negative counts
4. Family Filter Mismatch label should display in Null Reason Breakdown

## Next Steps
- Batch 28: Pattern-path DI threshold adjustment (DB investigation)
- Batch 29: UI layout + taxonomy + labeling
