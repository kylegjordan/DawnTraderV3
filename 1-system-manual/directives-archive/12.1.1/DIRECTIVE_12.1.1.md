# Directive 12.1.1: Fix DI Probability Divergence (BUG-004)

> **Phase**: Phase 12.1 — Critical Math & Security Fixes
> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Date**: 2026-02-22
> **Status**: APPROVED
> **Related**: BUG-004, UNIFY-003, RISK-009 (adjacent, not addressed here)

---

## Context & Motivation

**What this directive does**: Replaces the fake DI (Directional Integrity) calculation in the signal orchestrator's DSS evaluation path with the correct geometric DI calculated from actual price data.

**Why this change is needed**: The Net Expectancy Kernel uses DI to compute `Pwin = 0.40 + DI/200`. In the signal orchestrator's DSS evaluation path, DI is currently derived from NGC (blended confidence score) rather than from actual price geometry. This means:

- The DSS path's Pwin has **no mathematical relationship** to actual price movement consistency
- Two code paths compute different Pwin values for the same trade: the DSS path (fake DI from confidence) vs the Expectancy Gate path (real DI from price data)
- NetEV calculations in the DSS path are mathematically wrong — every trade's expected value is contaminated

**Current behavior** (with file paths and line numbers):
- In `server/services/signal-orchestrator.ts`, lines 1125-1128:
  ```typescript
  const rawConf = signal.confidence || 0;
  const normalizedConf = rawConf > 1 ? rawConf / 100 : rawConf;
  const DI = normalizedConf * 100; // Convert to DI scale (0-100) for kernel
  ```
  This takes the signal's confidence score (NGC), normalizes it to 0-1, then multiplies by 100 to create a fake "DI" value. There is no price geometry involved.

- In `server/core/calculations/expectancy.ts`, lines 507-509 (the CORRECT implementation):
  ```typescript
  if (tradeMeta.prices && tradeMeta.prices.length >= 3) {
    if (DI === undefined) {
      DI = calculateDirectionalIntegrity(tradeMeta.prices);
    }
  ```
  This correctly computes DI from price data using the geometric formula in `analysis-utils.ts`.

**Expected behavior after this directive**:
- The DSS evaluation path in the signal orchestrator uses `calculateDirectionalIntegrity(closePrices)` — the same geometric DI function used everywhere else
- Both code paths (DSS and Expectancy Gate) produce consistent Pwin and NetEV values
- DI reflects actual price movement consistency, not blended confidence

---

## Impact Analysis

**Consulted**: SYSTEM_IMPACT_MAP.md — Layer 1 (1.2 Net Expectancy Kernel, 1.4 DI Calculation), Layer 4 (4.1 Signal Orchestrator)

**Directly affected files**:
| File | Change Type | Description |
|------|-------------|-------------|
| `server/services/signal-orchestrator.ts` | MODIFY | Add `calculateDirectionalIntegrity` to import, replace fake DI with geometric DI |

**Upstream dependencies** (verify these still work):
- `analysis-utils.ts`: `calculateDirectionalIntegrity()` — already used elsewhere, no change needed. Already imported from this file (line 56), just need to add the function to the import list.

**Downstream consumers** (verify these still receive correct data):
- `computeNetExpectancyKernel()`: Receives DI as input. The interface accepts `DI?: number` with default 50. No change needed — it will now receive a geometrically-correct DI instead of a confidence-derived fake.
- `DSS.evaluate()`: Receives `strategyMetrics` which includes `netEV`. The netEV will now be computed with the correct DI. DSS does not use DI directly.
- `Paper Execution Engine`: Uses `evaluateTradeExpectancy()` which already calls `calculateDirectionalIntegrity(prices)` correctly. **Not affected by this change.**
- `VTS Runner`: Mirrors scoring logic. **Out of scope** — VTS has its own DI path. Will be addressed in a separate directive if needed.

**Background services affected**: None. This is a synchronous computation within the signal evaluation pipeline.

**Shared state / config affected**: None. DI is computed locally, not stored in shared state.

**Test files to verify**:
- `server/tests/unit/analysis-utils.test.ts`: Existing tests for `calculateDirectionalIntegrity()` — should continue to pass (function is unchanged)

---

## Scope

**Files to be modified**: `server/services/signal-orchestrator.ts`
**Files to be created**: None
**Files to be deleted**: None
**Files explicitly OUT OF SCOPE** (do not touch):
- `server/core/calculations/net-expectancy-kernel.ts` — kernel math is correct, only the input was wrong
- `server/core/calculations/expectancy.ts` — already uses correct DI
- `server/services/paper-execution-engine.ts` — already uses correct DI via `evaluateTradeExpectancy()`
- `server/utils/analysis-utils.ts` — `calculateDirectionalIntegrity()` function is correct as-is
- `server/services/dynamic-strategy-selector.ts` — DSS consumes netEV, does not compute DI

---

## Implementation Steps

### Step 1: Add `calculateDirectionalIntegrity` to the import

In `server/services/signal-orchestrator.ts`, line 56:

**REMOVE**:
```typescript
import { calculateEfficiencyRatio, calculateVolNoise, calculateTrendSlope } from '../utils/analysis-utils.js';
```

**REPLACE WITH**:
```typescript
import { calculateEfficiencyRatio, calculateVolNoise, calculateTrendSlope, calculateDirectionalIntegrity } from '../utils/analysis-utils.js';
```

### Step 2: Replace the fake DI calculation with geometric DI

In `server/services/signal-orchestrator.ts`, lines 1125-1128:

**REMOVE**:
```typescript
          // Note: confidence may be 0-1 (NGC) or 0-100 (raw) - normalize to 0-1 first
          const rawConf = signal.confidence || 0;
          const normalizedConf = rawConf > 1 ? rawConf / 100 : rawConf;
          const DI = normalizedConf * 100; // Convert to DI scale (0-100) for kernel
```

**REPLACE WITH**:
```typescript
          // Directive 12.1.1: Use geometric DI from price data (BUG-004 fix)
          // closePrices is already available in scope (line 780: ohlcData.map(c => parseFloat(c.close)))
          const DI = calculateDirectionalIntegrity(closePrices);
```

---

## Validation & Verification Requirements

Replit must provide evidence for ALL of the following:

- [ ] TypeScript compiles with zero new errors (`npx tsc --noEmit`)
- [ ] All existing tests pass (`npx vitest run` or `npm test`)
- [ ] `calculateDirectionalIntegrity` is correctly imported (paste the import line from the modified file)
- [ ] The old `normalizedConf * 100` line is completely gone from signal-orchestrator.ts (run `grep -n "normalizedConf \* 100" server/services/signal-orchestrator.ts` — should return no results)
- [ ] The new DI line references `closePrices` (paste lines 1125-1128 from the modified file)
- [ ] Console output from a server start showing signal evaluation running without errors (start the server briefly, let it run one evaluation cycle, paste the relevant `[37.A][SIGNAL]` log lines)

---

## Expected Outcomes

| Dimension | Before | After |
|-----------|--------|-------|
| DI source in DSS path | NGC confidence × 100 (fake) | `calculateDirectionalIntegrity(closePrices)` (geometric) |
| DI value range | 0-100 (driven by confidence) | 0-100 (driven by price path geometry) |
| Pwin in DSS path | Driven by blended confidence | Driven by actual price movement consistency |
| DSS vs Expectancy Gate consistency | Different Pwin for same trade | Same DI source, consistent Pwin |
| NetEV accuracy | Contaminated by fake DI | Mathematically correct |

**Behavioral note**: DI values will change for every signal evaluation. Previously, DI tracked confidence (typically 60-75 range). Now, DI will reflect actual price consistency:
- Strong trending pairs: DI > 70 (higher Pwin, more likely to pass EV gate)
- Choppy/ranging pairs: DI < 30 (lower Pwin, more likely to be filtered)
- This is the **correct** behavior — it means the EV gate now actually responds to market conditions

---

## Risks & Rollback

**What could go wrong**:
- **Signal volume change**: With real DI, some pairs that previously passed the EV gate (because fake DI was high from confidence) may now be filtered (because real DI is low from choppy price action). Conversely, strong trending pairs may now pass more easily. This is the CORRECT behavior, not a bug.
- **No signals generated**: Unlikely, but if DI is consistently very low (< 10) for all pairs, Pwin stays near 0.40 minimum, making the EV gate harder to pass. Monitor after deployment.

**Rollback procedure**: Revert the two changes (import line and DI calculation line) to restore the previous NGC-derived DI. This is a 2-line revert.

**Dependencies**: None. This directive can be implemented independently. No other directives depend on it or need to be completed first.

---

## References

- Roadmap phase: Phase 12.1 — Critical Math & Security Fixes
- Related bugs/risks: BUG-004 (DI Probability Divergence), UNIFY-003 (DI Source Consolidation)
- System Manual chapter: Chapter 1 (Core Math & Scoring)
- System Impact Map: Layer 1 — Net Expectancy Kernel (1.2), DI Calculation (1.4); Layer 4 — Signal Orchestrator (4.1)
- Prior directives: Directive 11.8B-A (Net Expectancy Kernel creation — established the kernel this fix feeds into)
