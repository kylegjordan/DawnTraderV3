# Directive 12.2.5 — Wave 4: Friction Model Unification

**Status**: COMPLETE
**Date Issued**: 2026-02-27
**Date Complete**: 2026-02-27
**Batch**: Batch 11 (combined with 12.2.6)
**Commit**: `b3a1526c`
**Review Cycles**: 1

---

## Problem

Directive 12.1.2 (Batch 2) established `computeTotalRoundTripCost()` in `cost-model.ts` as the canonical friction model, replacing the flat-rate `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` model. Three deprecated functions were retained in `analysis-utils.ts` for backward compatibility: `calculateFriction()`, `calculatePerUnitFriction()`, and `getFrictionRate()`. All runtime callers were supposed to have been migrated, but investigation found one active caller remaining in `vts-service.ts`.

## Resolution

1. **Migrated active caller**: `vts-service.ts` line 30 import changed from `calculateFriction` to `computeTotalRoundTripCost` + `getCachedCostMetrics` from `cost-model.ts`. Lines 317-320 replaced with canonical per-symbol cost model call.

2. **Removed 3 deprecated functions** from `analysis-utils.ts` (lines 327-365, ~39 lines): `calculateFriction`, `calculatePerUnitFriction`, `getFrictionRate`, plus deprecation comment block.

3. **Updated stale comment** in `expectancy.ts` line 423 to reference canonical `computeTotalRoundTripCost` instead of deleted `calculateFriction`.

## Impact

- **UNIFY-001 RESOLVED**: Friction model is now fully unified under `cost-model.ts`. Zero deprecated friction functions remain.
- **vts-service.ts upgraded**: Now uses symbol-specific fee/slippage/spread data via `getCachedCostMetrics(symbol)` instead of the flat 0.5% `BASE_FEE_SLIPPAGE` rate.
- **`BASE_FEE_SLIPPAGE` constant**: Retained in `SYSTEM_GUARDS` — still used by `retraining-freeze-controller.ts`, `system-guards.ts`, and `diagnostics-tab.tsx` for non-friction purposes.

## Files Changed

| File | Change |
|------|--------|
| `server/services/vts-service.ts` | Import migrated + friction calculation replaced (2 edits) |
| `server/utils/analysis-utils.ts` | 3 deprecated functions + comment block removed (~39 lines) |
| `server/core/calculations/expectancy.ts` | Comment updated (1 line) |

## Test Baseline

800 pass / 81 fail (881 total) — unchanged
