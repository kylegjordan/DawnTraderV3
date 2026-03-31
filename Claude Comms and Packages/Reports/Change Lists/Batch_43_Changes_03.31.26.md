# Batch 43 — Change List

> **Date**: 2026-03-31
> **Commits**: `4396c105` (main), `4bab105b` (label fix), `799a4c1d` (governance), `aebe5d49` (governance)
> **Branch**: migration/aws-supabase

---

## Files Modified

### 1. `server/services/fx5-scanner.ts`
**Type:** Major architecture change

| Change | Detail |
|--------|--------|
| `ScanDiagnostics` interface (line 156) | Added `failedDI: number` to `quant.imf` type. Added `benchmarkBypassed: number` to `pattern.imf` type. |
| `getRolling24hDiagnostics()` (line 276) | Added `failedDI: 0` to empty-state quant IMF defaults. |
| Rolling aggregation loop (line 312) | Removed `as any` cast — `d.quant.imf.failedDI` now properly typed. |
| **DELETED: Global quant IMF stage** (old lines 918-944) | Removed `metricFilteredSurvivors` filter and `quantImfFailedLQ/VN/BenchmarkBypassed` diagnostic counters. Replaced with comment explaining architecture change. |
| **ADDED: `familyQualifiedUnion`** (after family fan-out) | New deduped union of all family-qualified survivors. Built from `familyPoolSurvivors` using Set-based dedup on symbol. |
| Diagnostic logging (lines ~1080-1100) | Replaced `metricFilteredCount`/`forceIncludedCount`/`benchmarkBypassedCount` with `familyRejectedCount`. Updated all log messages to use `[43]` tags and family-qualified terminology. |
| `activeFilterPool.addSurvivors()` (line ~1105) | Changed input from `metricFilteredSurvivors` to `familyQualifiedUnion`. |
| `scanDiag` construction (lines ~1130-1150) | `quant.imf.passed` = `totalFamilySurvivors` (fan-out total). `quant.imf.total` = `classifiedSurvivors.length * familyFilterPaths.length`. IMF failure counts = aggregated from `familyImfDiagnostics`. |
| `dataAggregator.capture()` (line ~1230) | Renamed fields: `metricFilteredSurvivors` → `familyQualifiedSurvivors`, `metricFilteredCount` → `familyRejectedCount`. |
| `vtsQuantSurvivors` (line ~1245) | Changed from `classifiedSurvivors.filter(passesMetricFilter)` to `familyQualifiedUnion.map()`. |
| `patternOnlyImfSurvivors` (line ~1258) | Removed `passesMetricFilter: false` property (no longer meaningful). |
| `quantSymbols` Set (line ~1270) | Changed source from `metricFilteredSurvivors` to `familyQualifiedUnion`. |

### 2. `client/src/pages/machine-learning.tsx`
**Type:** Major UI restructure

| Change | Detail |
|--------|--------|
| `ScanDiagnostics` interface (line 99) | Added `failedDI: number` to `quant.imf`. Added `benchmarkBypassed: number` to `pattern.imf`. |
| Pipeline Summary (24h) table header | Added 5th column: **Total**. |
| "IMF Passed" row | Renamed to **"Family IMF Passed (family-qualified entries)"**. Shows fan-out total as primary count. Percentage vs (Global Passed * 4 families). |
| **ADDED: Per-Family Breakdown sub-row** | Shows T:N R:N B:N O:N per-family survivor counts. |
| LQ/VN/DI rejection sub-row | Updated label from "global IMF" to "aggregate across families". Removed `as any` cast for `failedDI`. |
| **REMOVED: Separate "Family IMF Survivors" row** | Merged into the renamed "Family IMF Passed" row (they now show the same data). |
| Final Survivors row | Added Total column (quant + pattern). |
| Strategy Evaluations / Nulls / Signals rows | Added Total column. Added counting basis labels ("VTS counter, in-memory, 24h rolling"). |
| Universe Scanned row | Total shows "—" (same universe, not additive). |
| Last Scan — IMF section header | Changed from "IMF Metrics (Post-Global)" to **"FAMILY IMF METRICS (AGGREGATE ACROSS 4 FAMILIES)"**. |
| Last Scan — IMF Passed row | Changed from "IMF Passed" to **"Family IMF Passed (fan-out total)"**. Removed `as any` cast for `failedDI`. |
| Last Scan — Family Path header | Changed from "Family Path IMF Results (Batch 22)" to **"FAMILY PATH IMF BREAKDOWN (PER-FAMILY DETAIL)"**. |
| 24h Rolling Aggregates — IMF header | Changed to **"Family IMF Metrics (24h aggregate across families)"**. |
| 24h Rolling Aggregates — Failed DI row | Removed `as any` casts. |
| 24h Rolling Aggregates — Benchmark Bypassed row | Removed `as any` cast for `pattern.imf.benchmarkBypassed`. |

### 3. `Claude Comms and Packages/Scope Files/BATCH_43_SCOPE.md`
**Type:** New file (scope document)

### 4. `Claude Comms and Packages/Reports/Batch Completion/Batch_Completion_43_03.31.26.md`
**Type:** New file (completion report)

### 5. `1-system-manual/BATCH_CATALOG.md`
**Type:** Governance update — added Batches 41, 42, 43 entries

### 6. `1-system-manual/PHASE_HISTORY.md`
**Type:** Governance update — added Migration phase and Phase 14.7

### 7. `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md`
**Type:** Governance update — Non-Negotiable Rules updated to Post-Replit workflow, session ID fixed

---

## Files Deleted
None.

## Files Created
- `Claude Comms and Packages/Scope Files/BATCH_43_SCOPE.md`
- `Claude Comms and Packages/Reports/Batch Completion/Batch_Completion_43_03.31.26.md`
- `Claude Comms and Packages/Reports/Change Lists/Batch_43_Changes_03.31.26.md` (this file)
