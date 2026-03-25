# Batch 22 — Architecture B: Family-Specific Filter Paths
## Batch Completion Report

**Date**: 2026-03-23
**Commit**: `c5fa3286`
**Branch**: dawntrader-v4
**Phase**: 14.6
**Type**: Code batch (schema + server + client)
**Actors**: Claude Code (implementor), Langston (reviewer)

---

## 1. Changes Implemented

| Edit | File | Change | Status |
|------|------|--------|--------|
| 1 | schema.ts | Add diMax column for DI ceiling (reversal/oscillator) | ✅ |
| 2 | canonical-regime-strategy-map.ts | STRATEGY_FAMILY_MAP (17 strategies), FILTER_FAMILIES, HYBRID_FAMILY_ELIGIBILITY | ✅ |
| 3 | fx5-scanner.ts | Load family DB rows, run 4 family IMF filters in parallel, store diagnostics with survivor symbols | ✅ |
| 4 | active-filter-pool.ts | 8 family pool Maps + getFamilyPool() + addFamilyPoolSurvivors() + clearPool() | ✅ |
| 5 | signal-orchestrator.ts | Read family pools, build symbolFamilies map, family-aware strategy filtering (explicit, no hidden fallback) | ✅ |
| 6 | vts-runner.ts | Read actual family filter results from FX5 diagnostics, family check before strategy eval | ✅ |
| 7 | machine-learning.tsx | Family Path IMF Results section in filter diagnostics | ✅ |
| 8 | seed-family-filters.ts (NEW) | DB seed for 8 filter_path rows with candidate thresholds | ✅ |

## 2. Langston Review

- Initial review: 2 blockers found (VTS placeholder logic, hidden all-families fallback)
- Fix 1: VTS family tags sourced from actual FX5 family filter results via diagnostics
- Fix 2: Signal orchestrator only applies family filtering when family data exists
- Re-review: Approved

## 3. Post-Implementation Audit (Code Review)

7/7 validation checks passed. All files verified via grep:
- diMax in schema ✅
- STRATEGY_FAMILY_MAP with 17 entries ✅
- Family filter execution in fx5-scanner ✅
- Family pool methods in active-filter-pool ✅
- Family-aware selection in signal-orchestrator ✅
- VTS family tagging from diagnostics ✅
- UI Family Path IMF Results ✅

## 4. Architecture Decisions

- **Architecture B (brute-force fan-out)** — all global survivors run through ALL family IMF filters in parallel
- **Multi-family survival preserved** — pair+strategy dedup handles multi-path
- **No hidden fallback** — symbols without family data use regime-only selection (explicit)
- **VTS uses actual filter results** — not sourcePool-based inference
- **Candidate thresholds** — will be calibrated from Batch 21 DI distribution telemetry

## 5. UI Verification (Preview Site)

Filter Diagnostics tab on Machine Learning page verified on live preview site. Family Path IMF Results section renders correctly showing all 4 families with real data:

| Family | Survivors / Total | Failures |
|--------|------------------|----------|
| Trend | 0 / 63 | LQ:0 VN:12 DI:51 |
| Reversal | 61 / 63 | LQ:0 VN:2 DI:0 |
| Breakout | 0 / 63 | LQ:0 VN:5 DI:58 |
| Oscillator | 61 / 63 | LQ:0 VN:2 DI:0 |

**Key observation**: Trend and Breakout families get 0 survivors — DI failures dominate (51 and 58 pairs). This confirms the Batch 20 audit finding: DI thresholds (≥55 trend, ≥45 breakout) are too strict for current crypto conditions where most pairs have DI in the 15-40 range. Reversal/Oscillator families (which want LOW DI) get 61/63 survivors.

**Implication**: DI threshold calibration is the critical next step. The candidate thresholds need empirical adjustment based on observed DI distribution data from Batch 21 telemetry.

## 6. Hotfix: DB Seed Import + Migration

- **Batch 22 HF** (commits `00484524`, `eb31183f`, `0306c263`): Fixed seed import path (../../db.js → ../db.js), added auto-execute call, ran Drizzle migration to add di_max column to PostgreSQL, seeded 8 family filter rows successfully.
