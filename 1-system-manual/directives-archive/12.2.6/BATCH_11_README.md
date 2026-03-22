# Batch 11 README — Directives 12.2.6 + 12.2.5

**Directives**: 12.2.6 (Goal Alignment Gate Removal) + 12.2.5 (Friction Model Deprecated Function Removal)
**Commit**: `b3a1526c`
**Date**: 2026-02-27
**Baseline**: `86aa8d79` (Batch 10B governance)
**Test Baseline**: 800/81 (881 total) — unchanged

## Summary

Combined batch removing the Phase 9.0 Goal Alignment Gate and completing friction model unification.

**12.2.6**: Deleted alignment-verifier.ts (379 lines) and strategic-policy-guard.ts (379 lines). Removed gate check from autonomy-controller.ts, 7 /alignment/* routes from routes.ts, strategicPolicyGuard references from 3 strategic routes, /strategic/compliance endpoint, 2 schema table definitions + 3 derived types, and AlignmentTab from enhanced-system-monitoring.tsx. ~1,400 lines removed. Phase 4 Goal Alignment (RISK-028, BUG-012) remains — separate system.

**12.2.5**: Migrated vts-service.ts from deprecated calculateFriction() to canonical computeTotalRoundTripCost() + getCachedCostMetrics(). Removed 3 deprecated functions from analysis-utils.ts (~39 lines). Updated stale comment in expectancy.ts. UNIFY-001 RESOLVED.

## Impact

| Metric | Value |
|--------|-------|
| Files deleted | 2 |
| Files surgically edited | 8 |
| Total lines removed | ~1,440 |
| Gates removed | 1 (Phase 9.0 Alignment Verification) |
| Active callers migrated | 1 (vts-service.ts) |
| Schema tables removed | 2 + 3 derived types |
| Frontend tabs removed | 1 (AlignmentTab) |

## Replit Implementation Notes

Replit correctly identified that removing the `alignmentAuditLog` table definition from schema.ts also required removing 3 derived type exports (`insertAlignmentAuditLogSchema`, `InsertAlignmentAuditLog`, `AlignmentAuditLog`) that referenced the deleted table. These were necessary cascading removals not included in the original instructions. Tests initially broke (622/82) due to schema compilation failure, then restored to 800/81 after the derived types were cleaned.
