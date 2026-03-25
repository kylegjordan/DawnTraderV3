# Filter Diagnostics — Outstanding Issues Tracker

**Created**: 2026-03-24
**Status**: Active investigation
**Context**: Kyle's comprehensive review of Filter Diagnostics tab identified these issues. All must be investigated and fixed before governance.

---

## STRUCTURAL ITEMS (Langston additions — 2026-03-25)

### A. Metric Semantics Contract
Define canonical labels for every counter stage: available → survived → sampled → evaluated → strategy-attempted → generated → rejected → opened. Every metric in the UI must map to exactly one of these stages. This prevents drift and label confusion.

### B. Source Mixing Policy
Do not mix FX5/filter counters and VTS counters in the same table without visual separation or stage labels. Currently the Filter Diagnostics tab mixes scanner diagnostics, VTS evaluation diagnostics, skipped-signal logger outputs, and hydrated history in ways that invite misinterpretation.

### C. Counter Versioning Policy
When counter shapes change (e.g., pool-agnostic → split-by-pool), either backfill from raw event logs or reset with explicit legacy/archive label. Never silently merge incompatible counter generations. For the current mismatch: **reset cleanly** — start new per-pool counters from zero, preserve old totals separately if needed.

---

## P0 — DATA TRUTH BUGS (dashboard is lying)

### 1. Counter time-window mismatch — old vs new counters in same table
- **Symptom**: Strategy Returned Null shows 88,890 in Quant Pool but Total Strategy Evaluations shows only 3,611 in Quant Pool. Impossible — nulls cannot exceed evaluations.
- **Root cause (UPDATED 2026-03-25)**: TWO problems compounding:
  - (a) Original: Old disk snapshots lacked Batch 24 per-pool fields, causing time-window mismatch. **FIXED in Batch 25** by deleting stale history files.
  - (b) NEW: Even after reset, nulls (288) > evaluations (264) for quant pool. The duplicate guard block (line ~1672) increments `quantStrategyNulls` WITHOUT first incrementing `quantStrategyEvaluations`. So duplicate rejections count as nulls but not as evaluations.
- **Fix needed**: Every code path that increments a null counter MUST also increment the corresponding evaluation counter. Evaluation counter must be the ceiling: evaluations >= nulls + signals always.
- **Status**: PARTIALLY FIXED (Batch 25 reset). STILL BROKEN — duplicate guard path doesn't increment evals.

### 2. Quant Signals Generated = 0 but open/closed trades show quant pool source
- **Symptom**: Signals Generated shows 0 in Quant Pool, 15 in Pattern Pool, 122 in Total. But open/closed trade tables show trades with "quant" as sourcePool.
- **Root cause**: Either `quantSignalsGenerated++` increment is not wired in the correct code path, or trades are being tagged with wrong sourcePool.
- **Fix needed**: Trace the quant signal generation path and verify the increment is placed correctly.
- **Status**: NOT INVESTIGATED

### 3. Pattern survivors (7,132) vs VTS pattern evaluated (3,221) mismatch
- **Symptom**: 7,132 pattern pairs survived all filters (24h rolling) but only 3,221 evaluated in VTS pattern pool.
- **Root cause**: NOT the FX5 scan count issue. Kyle clarified: survivors = pairs that passed ALL filters. These should all be evaluated unless something between filters and VTS drops them.
- **Fix needed**: Trace what happens between filter survivors and VTS evaluation. Find the 3,911 missing pairs.
- **Status**: NOT INVESTIGATED

### 4. No Strategy Returned Null for pattern pool
- **Symptom**: Pattern Pool column shows dash (—) for Strategy Returned Null, but pattern strategies DO return null.
- **Root cause**: Null counter likely only increments in quant path, not pattern path.
- **Fix needed**: Wire null counting in pattern strategy evaluation loop.
- **Status**: NOT INVESTIGATED

### 5. Quant pool Pattern Detection = 0 but quant-pool pattern trades exist
- **Symptom**: Pattern Detection shows 0 in Quant Pool, but open trades show quant-pool pairs with pattern strategies.
- **Root cause**: Pattern Detection counter only increments for sourcePool=pattern. But quant pairs CAN have pattern strategies (via hybrid confluence or direct pattern context).
- **Kyle's point**: If a pattern strategy runs on a quant pair, pattern detection must have fired. Counter should reflect that.
- **Fix needed**: Track pattern detection for quant pairs when pattern strategies are used.
- **Status**: EXPLAINED BUT NOT FIXED — Kyle says explanation is insufficient

### 6. Duplicate Position Max vanished from Signal Rejection Breakdown
- **Symptom**: Was 1,114+ before, now shows nothing (or just Net EV Below VTS Floor).
- **Root cause**: openVirtualTrades Map clears on restart. Logger IS working (confirmed 17 Net EV entries). Duplicate guard only fires when open trades exist — needs time to rebuild.
- **Additional issue**: Signal Rejection Breakdown hides zero-count categories.
- **Fix needed**: Show all rejection categories even at zero. Also investigate if SkipReason type mismatch contributes.
- **Status**: PARTIALLY FIXED (type added in Batch 24) but zero display NOT fixed for this section

### 7. LQ threshold — all zeros, is the filter doing anything?
- **Symptom**: LQ failures show 0 across all family paths. No pair is failing the LQ filter.
- **Root cause**: LQ threshold may be set too low in DB, or LQ calculations may all exceed the threshold.
- **Kyle's point**: If nothing fails LQ, why have it as a filter? Check the threshold is set correctly.
- **Fix needed**: Check DB LQ threshold values for all paths. Check actual LQ scores of pairs. Determine if threshold is too permissive.
- **Status**: NOT INVESTIGATED

### 8. DI threshold for pattern path — the original problem
- **Symptom**: 580 DI failures in pattern path (from earlier screenshot). The whole reason for Phase 14.6 was to fix the pattern path DI killing everything.
- **Root cause**: Family path DI thresholds were calibrated (Batch 23/23 HF) but the pattern path DI threshold was never addressed.
- **Fix needed**: Check and adjust pattern path DI threshold in screener_filters DB.
- **Status**: NOT INVESTIGATED

### 9. Benchmark Bypassed = 0 for pattern path
- **Symptom**: Benchmark Bypassed shows a value for quant but 0 for pattern.
- **Root cause**: Unknown — either pattern path doesn't have benchmark bypass logic, or it does but isn't being counted.
- **Fix needed**: Investigate whether pattern path has benchmark bypass and if zero is truthful.
- **Status**: NOT INVESTIGATED

### 10. 24h data persistence inconsistent across sections
- **Symptom**: Some sections survive server restart (Signal Rejection from disk), others don't (VTS eval was fixed in HF7 but FX5 rolling diagnostics still in-memory).
- **Root cause**: Different data sources use different storage (memory vs disk).
- **Fix needed**: Make all 24h sections consistently persist or clearly label which are in-memory-only.
- **Status**: PARTIALLY FIXED (VTS eval and skipped signals persist; FX5 rolling does not)

---

## P1 — ARCHITECTURE / SEMANTICS

### 11. Duplicate Position in Null Reason vs Signal Rejection — two different things?
- **Symptom**: "Duplicate Position" appears in both Null Reason Breakdown and Signal Rejection Breakdown with different counts.
- **Root cause**: These are two different data sources (VTS eval counters vs skipped signals logger). Confusing.
- **Fix needed**: Either merge into one display, or clearly differentiate with labels explaining the difference.
- **Status**: NOT ADDRESSED

### 12. DI: 0 failures for quant path — too permissive?
- **Symptom**: Quant path shows 0 DI failures after family threshold changes.
- **Root cause**: After lowering DI thresholds for trend/breakout families, quant path may have become too permissive.
- **Fix needed**: Check if quant path DI threshold is appropriate for the observed DI distribution.
- **Status**: NOT INVESTIGATED

---

## P2 — UI FLOW / DISPLAY

### 13. Pipeline Summary Table — new table at top of Filter Diagnostics
- **Symptom**: No high-level pipeline summary exists.
- **Kyle's mockup**: Pairs Scanned → Global Filters Rejected → Surviving Pairs → IMF Filters (Family 1-4 Rejected/Survived) → Total Rejected → Total Pairs Survived → Pairs Evaluated for Strategies → Avg Strategies per Pair → Total Strategies Evaluated → Null Strategies → Signals Generated → Signals Rejected → Simulated Trades Opened. Two columns: Quant and Pattern.
- **Fix needed**: Build this summary table and place it at the very top of Filter Diagnostics.
- **Status**: NOT STARTED

### 14. Signal Rejection Breakdown — show ALL categories even at zero
- **Symptom**: Only non-zero rejection reasons display. Zero-count categories are hidden.
- **Fix needed**: Show all SkipReason categories (Duplicate_Position_Max, Low_ROI, Net_EV_Negative, FinalScore_Low, RegimeWeight_Low, ADX_Guard, Duplicate_Position, BLOCKED_GOVERNANCE, LEARNING_DEFERRED, Confidence_Floor) even when count is 0.
- **Status**: NOT FIXED for Signal Rejection Breakdown (fixed for Null Reason Breakdown only)

### 15. Signal rejection + signals generated relationship display
- **Symptom**: 195 signals rejected + 61 signals generated = 256 total signals attempted. This relationship is not displayed.
- **Fix needed**: Show total signals attempted, then how many rejected vs generated. Make the math visible.
- **Status**: NOT ADDRESSED

### 16. Null Reason Breakdown — verify Langston's taxonomy + add bullet explanations
- **Symptom**: Categories may not match Langston's proposed taxonomy. No explanatory bullets under each category.
- **Langston agreed**: Each category should have indented bullet list of what's included.
- **Kyle agreed**: Category name + count on main row, bullets underneath explaining included conditions.
- **Fix needed**: Verify categories match Langston's taxonomy. Add bullet explanations under each.
- **Status**: NOT STARTED

### 17. Pattern path family columns — confusing display
- **Symptom**: Right side of family table shows "LQ:0 VN:8086 DI:17928" type annotations but these don't clearly relate to the family rows on the left.
- **Root cause**: Pattern path IMF failures are displayed inline with family rows but pattern path is NOT a family — it's a separate filter.
- **Fix needed**: Clarify or separate pattern path IMF results from family path results.
- **Status**: NOT ADDRESSED

---

## P3 — GOVERNANCE

### 18. Batch completion reports
- **Status**: Reports exist for Batches 20-24 + 22 HF in Scope Files/. But governance batch deployment is paused until P0 issues are resolved.

### 19. System manual updates
- **Status**: Architecture and math changes from Phase 14.6 not reflected in system manual. Deferred until P0/P2 fixes stabilize.

---

## PRIORITY ORDER (updated per Langston review 2026-03-25)

1. Fix #1 (counter time-window mismatch) — table is actively lying. **DECISION: Reset cleanly.**
2. Fix #2 (quant signals = 0 but trades exist) — table is actively lying
3. Fix #4 (pattern pool null counter) — **moved up per Langston** — active-lie, half the system is blind
4. Investigate #3 (survivor vs evaluated gap) — trace single pair through 6 checkpoints
5. Fix #6 + #14 (show all rejection categories at zero)
6. Fix #5 (quant pattern detection counter)
7. Investigate #7 (LQ threshold)
8. Investigate #8 (pattern path DI)
9. Apply structural items A, B, C (metric semantics, source separation, versioning policy)
10. Build #13 (Pipeline Summary Table per Kyle mockup)
11. Fix #15 (rejection + generated relationship)
12. Fix #16 (Langston taxonomy + bullets)
13. Address remaining items (9, 10, 11, 12, 17)
14. Governance (#18, #19)
