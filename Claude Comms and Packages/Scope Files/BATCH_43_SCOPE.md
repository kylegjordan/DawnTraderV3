# Batch 43 Scope: Quant Architecture Fix — Remove Redundant Global IMF + Unify Data Consistency

> **Date**: 2026-03-31
> **Baseline**: Commit `8f083695` (Batch 42: Filter Diagnostics UI fixes)
> **Branch**: migration/aws-supabase
> **Type**: Architecture correction + data consistency
> **Approved by**: Kyle (directive), Langston (scope review)
> **Deferred to Batch 44**: Pattern detection loss (113K->68K), duplicate scanPatterns()

---

## Purpose

The quant pipeline has a redundant global IMF stage (`metricFilteredSurvivors`) that double-filters quant pairs on LQ and VN before they reach the family fan-out. The family fan-out already applies LQ, VN, and DI per-family. This means pairs that would pass a family's thresholds can be rejected by a stricter global check, or the global check is pure waste when family thresholds are stricter. Kyle has identified this as the #1 architecture issue.

Additionally, the Pipeline Summary UI shows numbers from two different storage systems (in-memory FX5 diagnostics vs disk-persisted VTS counters) that don't reconcile, causing confusion about what the pipeline is actually doing.

---

## The Bug (Confirmed)

**Current flow (broken):**
```
classifiedSurvivors (quant global filter passed, IMF metrics computed)
    |
    +---> metricFilteredSurvivors = filter on LQ >= dbLqMin, VN <= dbVnMax  [REDUNDANT]
    |         |
    |         +---> activeFilterPool.addSurvivors()
    |         +---> vtsQuantSurvivors (for VTS batch)
    |
    +---> Family fan-out (trend/reversal/breakout/oscillator)
              Each checks: LQ >= family.LQ_MIN, VN <= family.VN_MAX, DI in range
              Input: classifiedSurvivors (unfiltered)
              Output: familyPoolSurvivors[family]
```

The VTS batch tagging (lines 1314-1346) requires BOTH:
- Pair is in `vtsQuantSurvivors` (passed global LQ/VN)
- Pair has at least one family tag from `symbolFamilyMap`

This is the double-filter: global LQ/VN AND family LQ/VN/DI.

**Intended flow (fix):**
```
classifiedSurvivors (quant global filter passed, IMF metrics computed)
    |
    +---> Family fan-out (trend/reversal/breakout/oscillator)
              Each checks: LQ >= family.LQ_MIN, VN <= family.VN_MAX, DI in range
              Input: classifiedSurvivors
              Output: familyPoolSurvivors[family]
    |
    +---> Union of all family-qualified survivors = quant IMF survivors
              |
              +---> activeFilterPool.addSurvivors()
              +---> VTS quant batch
```

---

## Objectives

### Objective 1: Remove redundant global quant IMF stage
**What:** Delete the `metricFilteredSurvivors` filtering logic (fx5-scanner.ts lines 918-927) and its diagnostic counters (lines 929-944). Remove the `passesCoreMetricFilters` flag and all downstream references to `metricFilteredSurvivors`.
**Why:** This is the double-filter bug. The family fan-out is the correct and sufficient IMF gate for quant pairs.
**Verification:** `metricFilteredSurvivors` no longer exists in codebase. No global LQ/VN filter between `classifiedSurvivors` and family fan-out.

### Objective 2: Rebuild active pool + VTS batch construction from family-qualified survivors
**What:** Replace all uses of `metricFilteredSurvivors` with the union of family-qualified survivors. The active trading pool and VTS quant batch should be built from pairs that passed at least one family IMF filter.
**Why:** Necessary consequence of Objective 1. The source of quant survivors must be the family fan-out output.
**Verification:** `activeFilterPool.addSurvivors()` receives family-qualified survivors. VTS quant batch is built from family-qualified survivors. A pair that passes any single family filter is included.

### Objective 3: Update Pipeline Summary UI to reflect real architecture
**What:** Remove or restructure the misleading standalone "IMF Passed" row for quant. The pipeline summary should show:
- Quant global filters (from collectAdaptiveBatch)
- Family fan-out results (per-family survivors)
- Total quant-family survivors
No row should imply a standalone quant IMF stage exists.
**Why:** The UI currently tells the wrong story about the pipeline architecture.
**Verification:** Pipeline Summary shows quant global filters -> family breakdown -> total. No standalone "IMF Passed" row for quant that doesn't correspond to actual architecture.

### Objective 4: Unify diagnostic storage basis for Pipeline Summary
**What:** Identify every row in the Pipeline Summary and document whether it currently comes from:
- In-memory FX5 diagnostics (scanDiagnosticsHistory, 24h rolling window)
- Disk-persisted data aggregator (logs/data_aggregates/)
- In-memory VTS counters (vtsEvaluation)

Then unify so that rows which are supposed to reconcile use the same storage source. The specific approach: make FX5 scan-cycle diagnostics the single source of truth for the pipeline funnel (global filters -> family IMF -> survivors), and VTS counters the single source for evaluation metrics (strategy evals, signals, rejections).
**Why:** Kyle's #1 complaint. Different storage methods create misaligned numbers that make the summary untrustworthy.
**Verification:** Pipeline Summary rows that represent the same pipeline stage show consistent numbers. No contradictions between adjacent rows. Document which source feeds which row.

### Objective 5: Add Quant / Pattern / Total columns to Pipeline Summary
**What:** Where mathematically meaningful, show separate Quant and Pattern columns plus a Total. Only add totals to rows that are genuinely additive (e.g., total pairs evaluated = quant + pattern). Do not add totals mechanically to rows where the counting basis differs.
**Why:** Improves readability and makes it clear how quant and pattern paths contribute to totals.
**Verification:** Total column present where additive. No misleading totals on non-additive rows. Counting basis disclosed in row labels or tooltips where ambiguous.

---

## Files Affected

| File | Change Type |
|------|------------|
| `server/services/fx5-scanner.ts` | Major — remove global quant IMF, rebuild survivor flow |
| `server/services/fx5-24h-window.ts` | Modify — update rolling diagnostics structure |
| `client/src/pages/machine-learning.tsx` | Major — Pipeline Summary UI restructure |
| `server/routes.ts` | Minor — update diagnostics API response shape if needed |
| `server/services/vts-runner.ts` | Minor — verify VTS batch consumption matches new source |

---

## Risks / Dependencies

1. **Active trading pool change**: Removing the global LQ/VN gate means the active pool will contain all family-qualified survivors, which could be a larger or smaller set depending on relative thresholds. This is the intended behavior (family thresholds are the correct gate).
2. **VTS batch size change**: Same as above — VTS batch may change size. This is correct and expected.
3. **No-regression on pattern path**: Pattern path is not touched by this batch. Must verify pattern IMF still functions independently.
4. **Diagnostic counter removal**: The global quant IMF counters (quantImfFailedLQ, quantImfFailedVN, etc.) will be removed. Their information is subsumed by the family-level counters.

---

## Verification Targets (per Langston's requirements)

### V1: Quant architecture proof
After the change, show that quant global-filter survivors feed directly into family IMF with no intermediate global IMF stage.

### V2: Family-total proof
Show that total quant IMF survivors = sum of family-qualified survivors (with dedup if a pair passes multiple families for the union used in active pool/VTS).

### V3: Summary truth proof
Pipeline Summary no longer implies a generic quant IMF stage. Uses consistent storage basis for rows that reconcile. Totals only where meaningful.

### V4: No-regression proof
Pattern path still works. Family fan-out still works. Active pool and VTS batch still populate correctly. CI passes (typecheck + build).
