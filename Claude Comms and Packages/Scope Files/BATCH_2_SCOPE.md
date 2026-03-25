# Batch 2 Scope: Fix Dual Friction Models (Directive 12.1.2, RISK-009)

> **Directive**: 12.1.2
> **Bug/Risk**: RISK-009 (HIGH severity)
> **Baseline Snapshot**: SNAPSHOT-002 (commit `dc17cfd6`)
> **Batch Type**: Code change (single file affected in runtime path)

---

## Problem Statement

The signal orchestrator's DSS evaluation path uses `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100` (a flat 0.5% approximation) as its friction model. This is **incorrect**. The correct friction model is `computeTotalRoundTripCost(fee, slippage, spread)` from `cost-model.ts`, which computes real component-separated costs: `(fee × 2) + (slippage × 2) + spread`.

The same pair gets different cost calculations depending on which code path evaluates it. The DSS path produces incorrect friction estimates because it ignores actual spread, actual slippage, and actual fee data — using a hardcoded flat percentage instead.

Additionally, `analysis-utils.ts` contains a `calculateFriction()` function (lines ~329-357) that also uses `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE`. This is a second incorrect friction consumer that needs to be addressed.

---

## What Kyle Has Confirmed

- `computeTotalRoundTripCost()` is the **correct and canonical** friction model
- `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` is **incorrect** and must be replaced everywhere it's used for friction calculation
- The formula `(fee × 2) + (slippage × 2) + spread` correctly accounts for fees and slippage on both entry AND exit legs, with spread charged once at entry

---

## Known Locations of Incorrect Friction

1. **`server/services/signal-orchestrator.ts` line ~1122**: `const frictionPct = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100;` followed by `const frictionPerUnit = 2 * frictionPct * entry;` — this feeds directly into the net expectancy kernel call
2. **`server/utils/analysis-utils.ts` lines ~329-357**: `calculateFriction()` function uses `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` as its cost rate
3. **`server/config/system-guards.ts` line 16**: Definition of `BASE_FEE_SLIPPAGE: 0.005` — the constant itself (may still be referenced by non-friction consumers like the config logging on line 200)

---

## Approach Guidelines

Before writing any code changes, you MUST:

1. **Read the actual source files** — `signal-orchestrator.ts`, `analysis-utils.ts`, `cost-model.ts`, and `system-guards.ts` — to understand the current state of the code
2. **Trace the data flow** — understand where `costMetrics` (fee, slippage, spread) are available in the DSS evaluation path and how to get them there if they're not
3. **Search for ALL consumers** of `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` and `calculateFriction` — there may be more than the known locations
4. **Verify `computeTotalRoundTripCost` signature and return type** — understand exactly what it expects and returns
5. **Check that `getCachedCostMetrics()` or equivalent** is available in the DSS evaluation scope — the correct friction model needs real fee/slippage/spread data, not a constant

Present your full plan of changes (every file, every line, every modification) BEFORE writing any code. Kyle will relay this plan for review before approving execution.

---

## Constraints

- Do NOT remove `BASE_FEE_SLIPPAGE` from `system-guards.ts` unless you've confirmed it has zero remaining consumers
- Do NOT modify the `computeTotalRoundTripCost()` function itself — it is correct
- Do NOT change any code paths outside of the friction calculation replacement
- The `calculateFriction()` function in analysis-utils.ts may have its own callers — trace them before modifying or removing it
- If `costMetrics` data is not in scope at the DSS evaluation path, document what's needed to get it there — don't hack around it

---

## Expected Deliverables

Following the established batch workflow:
1. Modified file(s) staged in `DT_Staged_Changes/BATCH_2/` with repo-relative paths
2. `INSTRUCTIONS.md` for Replit (file placement, validation commands, push instructions)
3. `README.md` documenting all changes
4. Updated `REPLIT_VALIDATION.sh` section 5 with batch-specific checks (old friction code removed, correct friction call present)

---

## Validation Criteria

- `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` no longer used for any friction calculation in signal-orchestrator.ts
- The DSS evaluation path uses `computeTotalRoundTripCost()` (or equivalent component-separated calculation) for friction
- `calculateFriction()` in analysis-utils.ts either updated to use correct model or flagged for removal if no callers remain
- TypeScript compilation passes (pre-existing errors in legacy tests OK)
- Existing test suite results unchanged (816+ pass, same pre-existing failures)
- Server starts without errors

---

*This scope was agreed upon between Kyle and Claude Code (System Cartographer session). The new Claude Code window should present its detailed implementation plan before writing any code.*
