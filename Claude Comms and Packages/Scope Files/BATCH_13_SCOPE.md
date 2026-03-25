# Batch 13 Scope — Phase 12.3 Pipeline Unification (Mega-Batch)

**Date**: 2026-03-03
**Directives**: 12.3.1 + 12.3.3 + 12.3.2 (implementation)
**Type**: Mega-batch — entire Phase 12.3 in one batch
**Baseline Commit**: `a86b7fb6` (after Batch 12B governance)
**Test Baseline**: 800 pass / 81 fail (881 total)

---

## Strategic Context

Kyle and Claude Code agreed to shift from per-directive batching to per-phase mega-batching to accelerate development. This is the first mega-batch. All three remaining Phase 12.3 directives are combined into a single code batch.

### Acceleration Plan (Agreed 2026-03-03)

| Session | Phase | Batch | Description |
|---------|-------|-------|-------------|
| **Next** | 12.3 | Batch 13 | Pipeline Unification mega-batch (THIS SCOPE) |
| 2 | 13 | Batch 14 | MCE Installation mega-batch |
| 3 | 14.1 | Batch 15 | VTS Real Calculations mega-batch |
| — | — | — | **FIRST TEST POINT** — paper mode produces real signals |
| 4+ | 14.2+ | Batch 16+ | Feature additions with testing after each |

Governance batches follow each code batch (13B, 14B, 15B).

---

## Directive 12.3.1: Regime Authority Resolution (BUG-006, BUG-008)

### What It Does
- Rewire DSS to call `calculatePairRegime()` — unify regime classification
- Replace `SYSTEM_GUARDS.STRATEGY_MAP` with `CANONICAL_REGIME_STRATEGY_MAP`
- Signal Orchestrator uses canonical regime from `calculatePairRegime()`

### Key Files to Read
- `server/services/signal-orchestrator.ts` — main pipeline orchestration
- `server/core/calculations/regime-calculator.ts` or equivalent — `calculatePairRegime()`
- `server/services/strategy-engine.ts` — strategy selection
- `server/core/dss/` — Dynamic Strategy Selection
- `server/config/system-guards.ts` — STRATEGY_MAP location

### Expected Changes
- ~500-800 lines of modifications across 3-5 files

---

## Directive 12.3.3: Confidence Authority Cleanup (NGC Removal)

### What It Does
- Replace NGC (legacy confidence carrier) with interim deterministic confidence
- Remove NGC-to-DI conversion (already partially fixed in 12.1.1)
- Remove quality_index.ts NGC computation
- Remove rolling normalization infrastructure

### Key Files to Read
- `server/core/calculations/quality_index.ts` — NGC computation
- `server/services/signal-orchestrator.ts` — NGC usage in pipeline
- Files that consume NGC confidence values

### Expected Changes
- ~300-500 lines of modifications across 5-6 files

---

## Directive 12.3.2: Strategy Routing Expansion (Implementation — Phase C)

### What It Does
- Implement all 8 new strategy modules from the vetted specification
- Wire into strategy-engine via `selectContextAwareStrategy()`
- Replace legacy hybrid types (H1-H4) with canonical definitions
- Update strategy-sync.ts to include all 17 canonical strategies
- Initialize drift detector baselines for 8 new strategies

### Specification
- **Location**: `1-system-manual/directives/12.3.2/STRATEGY_SPECIFICATION_12.3.2_FINAL.md`
- **Strategies**: morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge
- **All math, constants, entry/exit/confidence formulas** are in the spec — vetted by 4 LLMs

### Key Files to Read
- `1-system-manual/directives/12.3.2/STRATEGY_SPECIFICATION_12.3.2_FINAL.md` — THE SPEC
- `server/strategies/` — existing strategy module directory (pattern to follow)
- `server/services/strategy-engine.ts` — strategy registration and selection
- `server/services/strategy-sync.ts` — strategy synchronization
- `server/core/dss/` — dynamic strategy selection routing

### Expected Output
- 8 new strategy module files (~500-600 lines each, ~4,000-5,000 total)
- Modifications to strategy-engine.ts, strategy-sync.ts, DSS routing
- Drift detector baseline initialization

---

## Implementation Sequence (Within Session)

The order matters because of dependencies:

1. **First**: 12.3.1 (Regime Authority) — establishes canonical regime that strategies need
2. **Second**: 12.3.3 (NGC Cleanup) — establishes deterministic confidence that strategies use
3. **Third**: 12.3.2 (Strategy Implementation) — writes the 8 strategy modules using the regime and confidence from steps 1-2

---

## Files to Read at Session Start

### Must-Read (Architecture Understanding)
1. `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` — current state
2. `1-system-manual/directives/12.3.2/STRATEGY_SPECIFICATION_12.3.2_FINAL.md` — strategy math spec
3. `server/services/signal-orchestrator.ts` — main pipeline
4. `server/services/strategy-engine.ts` — strategy registration/selection
5. `server/strategies/` — existing strategy modules (pick 2-3 to understand pattern)

### Should-Read (Implementation Details)
6. `server/core/dss/` — Dynamic Strategy Selection
7. `server/core/calculations/quality_index.ts` — NGC to remove
8. `server/config/system-guards.ts` — STRATEGY_MAP
9. `server/services/strategy-sync.ts` — strategy sync
10. `server/services/vts-service.ts` — VTS (reads regime/confidence)

---

## Validation

After Replit applies the batch:
```bash
bash REPLIT_VALIDATION.sh "BATCH_13"
```

Expected: Test baseline may shift (new strategy modules may add tests or change existing behavior). Any compilation errors must be fixed. The 81 pre-existing failures should not increase.

## Push Command
```bash
bash REPLIT_PUSH_SCRIPT.sh "Batch 13: Phase 12.3 Pipeline Unification — Directives 12.3.1 + 12.3.3 + 12.3.2 implementation. Regime authority resolved (BUG-006, BUG-008). NGC removed, deterministic confidence. 8 new strategy modules (morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge)."
```

---

## Notes

- This is the first mega-batch under the accelerated plan
- All 8 strategy implementations follow the vetted STRATEGY_SPECIFICATION_12.3.2_FINAL.md
- No testing is expected at this phase — testing begins after Phase 14.1 (VTS Real Calculations)
- Governance batch (13B) follows after code is verified
