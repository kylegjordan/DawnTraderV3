# Batch 26 Scope: Filter Diagnostics Counter Truth — Combined Scope + Pre-Implementation Audit

**Date**: 2026-03-25
**Phase**: 14.6 (Filter Diagnostics Data Truth)
**Author**: Claude Code
**Reviewers**: Langston, Kyle

---

## Purpose

Fix all P0 data truth bugs in the Filter Diagnostics counter system. The dashboard is currently lying — counters are missing increments, silently dropping evaluations, and double-counting signals. This batch makes the numbers trustworthy by ensuring every code path that touches a strategy evaluation or signal properly updates all relevant counters.

---

## Pre-Implementation Audit: Code-Path Trace Results

### File: `server/services/vts-runner.ts` (main evaluation loop, lines 1546-1762)

The strategy evaluation loop has **6 exit paths** from the inner `for (const stratDef of effectiveStrategies)` loop. Each must correctly increment counters. Here's what I found:

#### EXIT PATH 1: Family Filter Skip (lines 1656-1666)
```
Strategy family doesn't match pair's surviving families → continue
```
**BUG**: Increments ZERO counters. These evaluations vanish entirely.
**Impact**: Deflates totalStrategyEvaluations. Makes it appear fewer strategies were tried.

#### EXIT PATH 2: Duplicate Guard (lines 1668-1682)
```
Pair+strategy combo already has open trade → continue
```
**STATUS**: CORRECTLY counted. Increments totalStrategyEvaluations (1672), pool-specific evals (1673), pool-specific nulls (1675/1677), nullReasons.duplicatePosition (1679).
**Note**: Issue #1b from the issues list is STALE — this was already fixed in a prior batch.

#### EXIT PATH 3: ADX Guard (lines 1684-1688)
```
sma_trend_ride + ADX < 25 → continue
```
**BUG**: Only increments nullReasons.adxGuard (1686). Does NOT increment totalStrategyEvaluations, pool-specific evals, pool-specific nulls, or byStrategy counters.
**Impact**: These evaluations vanish from the total count but appear in null reasons — causing nullReasons to sum to more than total nulls.

#### EXIT PATH 4: generatePhase10Signal returns null (lines 1699-1708)
```
detect() returned null/undefined → continue
```
**STATUS**: CORRECTLY counted. Increments byStrategy.nulls (1700), pool-specific nulls (1702/1704), nullReasons.conditionsNotMet (1706).

#### EXIT PATH 5: Signal generated successfully (lines 1709-1711)
```
detect() returned a signal → proceed to trade creation
```
**STATUS**: CORRECTLY counted for signal generation. Increments byStrategy.signals (1709), signalsGenerated (1710), pool-specific signalsGenerated (1711).

#### EXIT PATH 6: Net EV Floor Rejection (lines 1716-1727)
```
Signal has netEV < VTS_NET_EV_FLOOR → continue
```
**BUG**: This fires AFTER signalsGenerated++ (line 1710) and byStrategy.signals++ (line 1709). The signal is counted as "generated" but then rejected and never becomes a trade. This inflates the signals generated count.
**Impact**: signalsGenerated includes signals that were subsequently rejected by the Net EV floor. The number is higher than actual trade-creating signals.

### Pair-Level Silent Drops (lines 1549-1561)

Before the strategy loop even runs, three conditions can skip a pair entirely:

| Check | Line | Counter Incremented | Bug? |
|-------|------|-------------------|------|
| maxOpenTrades | 1549-1551 | nullReasons.maxOpenTrades ++ | OK |
| No price data | 1553-1556 | NONE | **YES — silent drop** |
| OHLC < 10 candles | 1558-1561 | NONE | **YES — silent drop** |

**Impact on Issue #3**: These silent drops contribute to the 7,132 survivors vs 3,221 evaluated gap. Pairs that survive FX5 filters but have no price data or insufficient OHLC are never counted as evaluated OR as skipped.

### Pattern Path Pair-Level Drops (lines 1590-1610)

| Check | Line | Counter Incremented | Bug? |
|-------|------|-------------------|------|
| patternPairsEvaluated | 1591 | patternPairsEvaluated ++ | OK |
| No BUY pattern detected | 1605-1608 | patternNoDetection ++ | OK — but not a null counter |
| BUY pattern detected | 1610 | patternDetected ++ | OK |
| regimeNoStrategies (pattern) | 1633-1636 | nullReasons.regimeNoStrategies ++ | OK — but no pair-level skip counter |

### Quant Path Pair-Level (lines 1639-1650)

| Check | Line | Counter Incremented | Bug? |
|-------|------|-------------------|------|
| quantPairsEvaluated | 1640 | quantPairsEvaluated ++ | OK |
| regimeNoStrategies (quant) | 1644-1646 | nullReasons.regimeNoStrategies ++ | OK |

---

## Semantic Stage Contract (Structural Item A)

Per Langston's recommendation, every counter maps to exactly one stage:

| Stage | Definition | Counter(s) |
|-------|-----------|-----------|
| **Available** | Pairs in FX5 scan batch | Total from FX5 scanner |
| **Survived** | Passed all global + IMF filters | FX5 survivors (quant + pattern) |
| **Sampled** | Entered VTS evaluation loop (had price + OHLC) | quantPairsEvaluated + patternPairsEvaluated + silent drops |
| **Evaluated** | Had at least one strategy attempted | quantPairsEvaluated + patternPairsEvaluated (minus regimeNoStrategies, patternNoDetection) |
| **Strategy-Attempted** | Individual detect() calls (or equivalent guard) | totalStrategyEvaluations (MUST include all 6 exit paths) |
| **Generated** | Signal created and passed ALL post-generation guards | signalsGenerated (MUST exclude Net EV rejected) |
| **Rejected** | Signal created but failed post-generation guard | New counter needed: signalsRejected |
| **Opened** | Virtual trade actually created | Derived from phase10SessionTrades.length |

---

## Changes — Checklist

### FIX 1: ADX Guard counter gap (lines 1684-1688)
- [ ] Add `vtsEvalCounters.totalStrategyEvaluations++` before the ADX guard continue
- [ ] Add pool-specific eval increment (pattern vs quant)
- [ ] Add pool-specific null increment (pattern vs quant)
- [ ] Add `byStrategy[stratKey]` increment (evaluated + nulls)
- **Expected outcome**: ADX-guarded strategies appear in totalStrategyEvaluations and byStrategy table
- **Verification**: After restart, ADX guard count in null reasons <= totalStrategyEvaluations. byStrategy table shows sma_trend_ride evaluated count >= adxGuard count.

### FIX 2: Family filter skip counter gap (lines 1656-1666)
- [ ] Add `vtsEvalCounters.totalStrategyEvaluations++` before each family filter continue
- [ ] Add pool-specific eval increment
- [ ] Add pool-specific null increment
- [ ] Add `byStrategy[stratKey]` increment (evaluated + nulls)
- [ ] Add new nullReason: `familyFilterMismatch` (initialized at 0 in counter block, line ~1474)
- **Expected outcome**: Family-filtered strategies appear in totalStrategyEvaluations and null reasons
- **Verification**: New `familyFilterMismatch` count > 0 in Null Reason Breakdown. totalStrategyEvaluations increases.

### FIX 3: Net EV floor ordering + signalsRejected counter (lines 1709-1727)
- [ ] Move the Net EV floor check (lines 1716-1727) ABOVE the signalsGenerated increments (lines 1709-1711)
- [ ] When Net EV rejects, do NOT count as "generated" and do NOT count as "null" — count as **rejected**
- [ ] Add new counter: `signalsRejected` (initialized at 0 in counter block). Net EV rejection increments this.
- [ ] Add pool-specific: `quantSignalsRejected` and `patternSignalsRejected`
- [ ] Per Langston's review: a Net EV failure is a signal that was created but failed a post-generation guard. It is a rejection, not a null. Nulls = strategy didn't fire. Rejected = strategy fired but signal failed quality gate.
- **Expected outcome**: signalsGenerated only counts signals that actually become trades. signalsRejected tracks signals that were created but failed post-generation guards.
- **Verification**: signalsGenerated + signalsRejected = total signals attempted by detect(). signalsGenerated <= open + closed trades total.

### FIX 4: Silent pair-level drops (lines 1553-1561)
- [ ] Add new counters: `pairsSkippedNoPrice` and `pairsSkippedInsufficientOHLC` to vtsEvalCounters
- [ ] Initialize both at 0 in counter block (line ~1477)
- [ ] Increment `pairsSkippedNoPrice++` at line 1555
- [ ] Increment `pairsSkippedInsufficientOHLC++` at line 1560
- [ ] Add to aggregation in `getVtsEvalHistory()` (line ~228)
- [ ] Add to VTSEvalSnapshot type definition
- **Expected outcome**: The gap between FX5 survivors and VTS pairs evaluated is fully explained
- **Verification**: FX5 survivors = quantPairsEvaluated + patternPairsEvaluated + pairsSkippedNoPrice + pairsSkippedInsufficientOHLC + maxOpenTrades skips. If not equal, remaining gap is from FX5 duplicate parity tagging.

### FIX 5: Update Issue #1b status (documentation only)
- [ ] Update FILTER_DIAGNOSTICS_ISSUES.md: Issue #1b status from "STILL BROKEN" to "FIXED (duplicate guard correctly increments evals since Batch 25). NEW BUG: ADX guard and family filter skip don't increment evals — see Fixes 1 and 2."
- **Expected outcome**: Issues tracker reflects actual code state

### FIX 6: Show all rejection categories at zero — Signal Rejection Breakdown (#6/#14)
- [ ] In the frontend (machine-learning.tsx), ensure Signal Rejection Breakdown uses the ALL_REJECTION_REASONS constant (already exists from Batch 25 for Null Reason Breakdown)
- [ ] Apply same pattern: iterate ALL_REJECTION_REASONS, show 0 for missing keys
- **Expected outcome**: All SkipReason categories visible even at count 0
- **Verification**: After restart, all categories display with 0 counts. No hidden categories.

### FIX 7: Issue #2 — Quant Signals Generated = 0 investigation + fix
- [ ] Code-path trace shows `quantSignalsGenerated++` fires correctly at line 1711 when `pair.sourcePool !== 'pattern'`
- [ ] If quant trades are opening, this counter MUST be > 0 — so either: (a) the counter was reset by Batch 25 restart and hasn't had time to accumulate, OR (b) there's a frontend display or aggregation bug
- [ ] Check `getVtsEvalHistory()` aggregation (line 230) — does it correctly sum `quantSignalsGenerated` from snapshots?
- [ ] Check frontend `machine-learning.tsx` — does it correctly read `quantSignalsGenerated` from the API response?
- [ ] If the counter IS incrementing in the backend but not displaying, fix the display path
- [ ] If the counter is NOT incrementing despite trades opening, trace why `pair.sourcePool` might not be 'quant' for quant-pool trades
- **Expected outcome**: Quant Signals Generated > 0 when quant trades exist
- **Verification**: After 30 minutes, if quant trades show in open/closed tables, quantSignalsGenerated must be > 0

### FIX 8: Update Metrics Map with semantic contract + restart sensitivity
- [ ] Add Structural A stage labels to FILTER_DIAGNOSTICS_METRICS_MAP.md
- [ ] Add Structural D restart-sensitivity annotations
- [ ] Tighten wording per Langston's review (Signals Generated vs trades opened, Pattern Detection scope, Duplicate Position measurement surfaces)
- [ ] Document familyFilterMismatch as a pre-detect eligibility skip (not a "strategy returned null")

---

## Files Affected

| File | Changes |
|------|---------|
| `server/services/vts-runner.ts` | Fixes 1-4: counter increments for ADX guard, family filter, Net EV reorder, silent pair drops |
| `server/types/vts.ts` (or wherever VTSEvalSnapshot is defined) | Fix 4: add pairsSkippedNoPrice, pairsSkippedInsufficientOHLC fields + familyFilterMismatch null reason |
| `client/src/pages/machine-learning.tsx` | Fix 6: Signal Rejection zero-count display |
| `FILTER_DIAGNOSTICS_ISSUES.md` | Fix 5: status updates |
| `FILTER_DIAGNOSTICS_METRICS_MAP.md` | Fix 8: semantic contract + annotations |

---

## Invariants That Must Hold After Batch 26

1. **totalStrategyEvaluations >= totalStrategyNulls + signalsGenerated** (currently violated by ADX guard and family filter)
2. **quantStrategyEvaluations + patternStrategyEvaluations = totalStrategyEvaluations** (currently violated — ADX guard and family filter don't increment pool-specific)
3. **signalsGenerated + signalsRejected = total successful detect() calls** (currently violated — Net EV floor rejects inflate signalsGenerated)
3b. **signalsGenerated = signals that actually become trades** (currently violated — Net EV floor rejects counted as generated)
4. **FX5 survivors = pairsEvaluated + pairsSkippedNoPrice + pairsSkippedInsufficientOHLC + maxOpenTrades + FX5 duplicate parity overhead** (currently no accounting)
5. **All null reason categories sum <= totalStrategyNulls** (currently violated by ADX guard)
6. **All rejection categories visible at zero** (currently hidden for Signal Rejection)

---

## Verification Plan (Post-Deployment)

### Immediate (within 5 minutes of restart)
1. Navigate to Filter Diagnostics on preview site
2. Confirm all Signal Rejection categories display (even at 0)
3. Confirm new null reason `familyFilterMismatch` appears (at 0 initially)
4. Confirm new pair skip counters appear in VTS Evaluation section

### After 30 minutes of running
1. **Invariant 1**: totalStrategyEvaluations >= nulls + signals — check the numbers add up
2. **Invariant 2**: quant evals + pattern evals = total evals
3. **Invariant 5**: Sum of all null reasons <= total nulls
4. **ADX guard**: If sma_trend_ride shows evaluated > 0 in byStrategy table, and ADX guard > 0 in null reasons, then adxGuard <= sma_trend_ride evaluated
5. **Family filter**: familyFilterMismatch > 0 (expected because pairs survive multiple families but not all)
6. **Net EV**: signalsGenerated should be <= open trades + closed trades (no inflation)

### Gap accounting (Issue #3)
1. Record: FX5 quant survivors + FX5 pattern survivors
2. Record: quantPairsEvaluated + patternPairsEvaluated
3. Record: pairsSkippedNoPrice + pairsSkippedInsufficientOHLC + maxOpenTrades
4. Verify: survivors ≈ evaluated + skipped (remaining gap = FX5 duplicate parity overhead)

### What counts as failure
- Any invariant violated after 30 minutes → investigate and fix
- signalsGenerated > open + closed trades → Net EV reorder didn't work
- familyFilterMismatch = 0 after 30 minutes → counter not wired correctly
- pairsSkippedNoPrice + pairsSkippedInsufficientOHLC both = 0 → either counters not wired or all pairs have data (verify which)

### Iteration plan if verification fails
1. Claude Code identifies which invariant failed and traces the specific code path
2. Three-way discussion to agree on the fix
3. Hotfix batch (26 HF1) with targeted fix
4. Re-verify all invariants
5. Repeat until all invariants hold

---

## Risks / Dependencies

1. **VTSEvalSnapshot type**: Adding new fields requires updating the type definition. If the type is shared with frontend, frontend may need adjustment.
2. **Aggregation function**: `getVtsEvalHistory()` must aggregate the new fields, or they'll show 0 in 24h rolling.
3. **Disk persistence**: New counters must be included in the snapshot written to `logs/vts_eval_history/`. If the persistence logic uses the type, this should happen automatically. If it cherry-picks fields, we must add them.
4. **FX5 duplicate parity**: Pairs in both pools appear twice in scanBatch. This means FX5 survivor count will always be slightly higher than VTS pairs evaluated. This is expected, not a bug — but should be documented.

---

## What This Batch Does NOT Fix (Deferred)

- Issue #3 full resolution — this batch adds accounting counters to EXPLAIN the gap, but the gap itself may be legitimate (FX5 parity + data availability)
- Issue #5 (Quant pool Pattern Detection = 0) — by design, quant pairs don't run scanPatterns(). This is a semantic clarification, not a counter bug.
- Issue #7 (LQ thresholds) — requires DB threshold investigation, not a code fix
- Issue #8 (Pattern path DI) — requires DB threshold adjustment
- Issue #13 (Pipeline Summary Table) — UI work, deferred to Phase 4
- Issue #16 (Null Reason taxonomy + bullets) — UI work, deferred to Phase 4
- Structural B (Source Mixing Policy) — deferred until before #13
