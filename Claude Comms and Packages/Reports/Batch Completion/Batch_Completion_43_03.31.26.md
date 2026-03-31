# Batch 43 Completion Report: Quant Architecture Fix

> **Date**: 2026-03-31
> **Commits**: `4396c105` (main), `4bab105b` (label fix)
> **Branch**: migration/aws-supabase
> **Reviewed by**: Langston (code review + second-pass verification)
> **Approved by**: Kyle (directive), Langston (scope + code + verification)

---

## Executive Summary

Batch 43 removed the redundant global quant IMF stage from `fx5-scanner.ts` that was double-filtering quant pairs on LQ and VN before they reached the family fan-out. The family fan-out (trend/reversal/breakout/oscillator) is now the sole operative quant IMF gate. The Pipeline Summary UI was restructured to show the correct architecture with a new Total column and family-qualified entry counts.

---

## Scope Objectives Checklist

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Remove redundant global quant IMF stage | **YES** | `metricFilteredSurvivors` deleted. No global LQ/VN filter between classifiedSurvivors and family fan-out. Confirmed in logs: `[43][ScanFlow] Global: 36 | Family-qualified (unique): 36 | Family-qualified (sum): 104` |
| 2 | Rebuild active pool + VTS batch from family-qualified survivors | **YES** | Active pool receives `familyQualifiedUnion` (deduped, symbol-level). VTS batch preserves family-qualified identity via `symbolFamilyMap` tagging. Confirmed in staging UI: 166 quant + 11 pattern = 177 VTS batch. |
| 3 | Update Pipeline Summary UI to reflect real architecture | **YES** | "IMF Passed" renamed to "Family IMF Passed (family-qualified entries)". Per-family breakdown sub-row added. Last Scan IMF header: "FAMILY IMF METRICS (AGGREGATE ACROSS 4 FAMILIES)". No row implies a standalone generic quant IMF stage. |
| 4 | Unify diagnostic storage basis | **PARTIAL** | Source separation clarified and presented truthfully. FX5 diagnostics = pipeline funnel source. VTS counters = evaluation source. Counting basis labels added to every row. Full storage unification (single source for all rows) remains future work. |
| 5 | Add Quant/Pattern/Total columns | **YES** | Total column added to Pipeline Summary (24h). Totals only where additive (Global, IMF, Survivors, Evals, Nulls, Signals). Universe shows dash (same set enters both). |

---

## Per-Commit Details

### Commit `4396c105` — Main implementation
**Files changed:** 3 (246 insertions, 124 deletions)
- `server/services/fx5-scanner.ts` — Removed global quant IMF stage, built familyQualifiedUnion, updated scanDiag to use family aggregates, rebuilt VTS batch from family-qualified survivors
- `client/src/pages/machine-learning.tsx` — Pipeline Summary restructured with Total column, family-qualified entry labels, per-family breakdown, counting basis labels, removed `as any` casts
- `Claude Comms and Packages/Scope Files/BATCH_43_SCOPE.md` — Formal scope document

### Commit `4bab105b` — Label fix
**Files changed:** 1 (1 insertion, 1 deletion)
- `client/src/pages/machine-learning.tsx` — Last Scan IMF Passed label: "unique pairs" → "fan-out total"

---

## Architecture Change

**Before (broken):**
```
classifiedSurvivors → metricFilteredSurvivors (global LQ/VN) → active pool/VTS batch
                   ↘ family fan-out (LQ/VN/DI per family) → diagnostics only
DOUBLE FILTER: pairs must pass LQ/VN globally AND per-family
```

**After (correct):**
```
classifiedSurvivors → family fan-out (LQ/VN/DI per family) → familyQualifiedUnion → active pool
                                                            → family-tagged VTS batch
SINGLE FILTER: family IMF is the sole quant IMF gate
```

---

## Verification Evidence

- **V1 (Architecture)**: Log output shows direct flow from global to family fan-out. `metricFilteredSurvivors` no longer exists in server code.
- **V2 (Family-total)**: Pipeline Summary 24h: T:157+R:375+B:180+O:375=1,087. Last Scan: T:24+R:57+B:28+O:57=166. Math verified.
- **V3 (Summary truth)**: No standalone quant IMF row. All rows labeled with counting basis. Total column present.
- **V4 (No regression)**: Pattern path 89/11 survivors. All 4 families producing. Build+Docker succeeded. HTTP 200.

---

## Governance Updates

| Document | Updated |
|----------|---------|
| BATCH_CATALOG.md | Pending |
| MEMORY.md | Pending |
| CCPI | No changes needed (workflow unchanged) |
| SYSTEM_MANUAL | Pending (architecture section) |

---

## Carry-Forward Items

1. **Full storage unification** — FX5 in-memory diagnostics and VTS in-memory counters still use separate storage. Current batch clarified the split with labels; full unification is future work.
2. **Batch 44 — Pattern detection loss** — 113K→68K pattern detection loss and duplicate `scanPatterns()` deferred from Batch 43.
3. **Pre-existing CI failures** — TypeScript Check (11 annotations) and Test Suite (2 annotations) fail consistently across Batches 41-43. Build and Docker succeed. Non-blocking but should be addressed.

---

## Capacity Status

- **Claude Code**: Fresh session, ~250K tokens used of 1M context
- **Langston (topic 21)**: ~180K/272K tokens (~66% used at start, higher now after Batch 43 discussion)
