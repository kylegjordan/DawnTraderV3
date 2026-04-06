# Batch 51 Scope: Pipeline Transparency — FailureTracker Visibility + Pair-Pool Count Fix

> **Date**: 2026-04-04
> **Baseline**: Commit `907a1f60` (Batch 50)
> **Branch**: migration/aws-supabase
> **System Impact Map**: Review required. Layers 3 (Scanner/Batch Selection), 5 (UI/Filter Diagnostics), 7 (Rolling 24h Telemetry).
> **Trigger**: Kyle voice note feedback on survivors-to-evaluated gap. Three directives.

---

## Purpose

Fix two transparency issues identified by Kyle:
1. **PairFailureTracker cooldown is invisible** — pairs are silently excluded from VTS evaluation after scanner filter failures, but this is not visible anywhere in the UI. Kyle was unaware of this rule.
2. **Pairs Evaluated count is apples-to-oranges** — counts unique symbols, not pair-pool (pair+family) combinations. After family fan-out, survivors and evaluated counts use different bases, making reconciliation impossible.

Additionally: surface the cooldown policy details so Kyle can make an informed keep/remove decision.

---

## Objectives

### Objective 1: Surface FailureTracker cooldown in Filter Diagnostics UI
**Why:** Kyle directive — "if that is a rule, then it should be visible within our filters and screeners."
**Files:**
- `client/src/pages/machine-learning.tsx` — Add a "Cooldown Exclusions" section or row to Filter Diagnostics showing:
  - Number of pairs currently in cooldown
  - Cooldown duration (10 min standard, 30 min extended)
  - List of excluded pairs (or top N with count)
  - Last failure reason per pair
- `server/routes.ts` — Add cooldown state to the `/api/filter-diagnostics` or `/api/vts-telemetry` endpoint response
- `server/services/adaptive-scan-manager.ts` — Expose `getFailedPairs()` data through API

**Verification:** Filter Diagnostics shows cooldown exclusion count. Count + visible IMF survivors = total pairs entering VTS batch.

### Objective 2: Fix Pairs Evaluated to count pair-pool combinations (not unique symbols)
**Why:** Kyle directive — "the pair-pool combination should be the count, not just the pair."
**Files:**
- `server/services/vts-runner.ts` — Where `evaluatedCount` is tracked/incremented, change from unique symbol counting to pair+family counting. Each family evaluation of a symbol is a separate evaluation.
- `client/src/pages/machine-learning.tsx` — Update Pipeline Summary labels if needed to clarify "Pair-Pool Evaluations" vs "Unique Pairs"

**Verification:** Pairs Evaluated count should be >= unique symbols evaluated (higher when pairs appear in multiple families). Should reconcile cleanly with family-fanned IMF survivors minus cooldown exclusions.

### Objective 3: Document cooldown policy for Kyle's keep/remove decision
**Why:** Kyle needs to understand exactly what the cooldown does before deciding if it stays.
**Deliverable:** Add a clear note in the Batch 51 Completion Report with:
- What triggers a "failure" (scanner filter failure, not strategy null)
- Cooldown durations (10 min / 30 min extended after 3+ failures)
- How many pairs are typically affected per cycle (~300+ excluded per the current data)
- Recommendation with evidence

**No code change** — this is informational for Kyle's decision.

---

## Files Modified

| File | Change |
|------|--------|
| `server/routes.ts` | Expose cooldown state in API response |
| `server/services/adaptive-scan-manager.ts` | May need new method to get summary stats |
| `server/services/vts-runner.ts` | Fix evaluation counting to use pair+pool |
| `client/src/pages/machine-learning.tsx` | Add cooldown visibility section, update Pipeline Summary |

---

## Verification Criteria

1. Filter Diagnostics shows cooldown exclusion count with pair list
2. Pairs Evaluated count uses pair-pool combinations
3. Pipeline Summary numbers reconcile: IMF Survivors - Cooldown Exclusions = Pairs Entering VTS (approximately)
4. Completion report includes cooldown policy documentation for Kyle's decision

---

## Risk Assessment

- **Low risk**: UI additions are additive, no existing functionality changed
- **Medium risk**: Changing evaluation count basis may affect other downstream calculations that reference `evaluatedCount`. Need to trace all usages.
- **SYSTEM_IMPACT_MAP review**: Required before implementation to identify all consumers of `evaluatedCount`.
