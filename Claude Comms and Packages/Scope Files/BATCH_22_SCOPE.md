# Batch 22 — Architecture B: Family-Specific Filter Paths

**Date**: 2026-03-23
**Type**: Code batch (schema + server + client)
**Branch**: dawntrader-v4
**Phase**: 14.6
**Predecessor**: Batch 21 (telemetry scaffolding)

## Objective

Implement Architecture B (brute-force fan-out) from the Batch 20 audit. Add family-specific IMF filter paths so each strategy family gets thresholds tuned to its market environment preferences.

## Key Design Decisions

- **Architecture B selected** — all 200 global survivors run through ALL family filter paths in parallel
- **Multi-family survival is a FEATURE** — versatile pairs get evaluated by multiple strategy families
- **diMax column added** — reversal/oscillator families need DI ceiling (they want LOW DI)
- **Strategy-to-family mapping** — canonical, auditable, in canonical-regime-strategy-map.ts
- **Hybrid strategies inherit** from parent families via HYBRID_FAMILY_ELIGIBILITY mapping
- **Candidate thresholds** — will be calibrated using Batch 21 DI distribution telemetry

## Files Modified (7 + 1 new)

| File | Change |
|------|--------|
| shared/schema.ts | Add diMax column |
| canonical-regime-strategy-map.ts | Add STRATEGY_FAMILY_MAP, FILTER_FAMILIES, HYBRID_FAMILY_ELIGIBILITY |
| fx5-scanner.ts | Load family DB rows, run family IMF filters, store family diagnostics |
| active-filter-pool.ts | Add 8 family pool Maps + getFamilyPool() + addFamilyPoolSurvivors() |
| signal-orchestrator.ts | Read family pools, build symbolFamilies map, family-aware strategy filtering |
| vts-runner.ts | Import family mapping, family check before strategy evaluation |
| machine-learning.tsx | Family Path IMF Results section in filter diagnostics |
| seed-family-filters.ts (NEW) | DB seed for 8 new filter_path rows with candidate thresholds |

## Candidate Thresholds (from Batch 20 Audit Artifact 3)

| Family | VN Max | DI Min | DI Max | LQ Min |
|--------|--------|--------|--------|--------|
| Trend | 0.60 | 55 | 100 | 40 |
| Reversal | 0.85 | 0 | 35 | 25 |
| Breakout | 0.68 | 45 | 100 | 35 |
| Oscillator | 0.85 | 0 | 30 | 25 |
