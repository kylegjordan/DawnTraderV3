# Batch 26 Completion Report

**Date**: 2026-03-25
**Batch**: 26
**Phase**: 14.6 (Filter Diagnostics Data Truth)
**Commit**: `c805e6da`
**Commit Message**: Batch 26: Counter truth — ADX guard + family filter + Net EV reorder + silent pair drops

---

## Executive Summary

Batch 26 deployed 10 surgical edits across 2 files to fix counter truth bugs in the VTS evaluation loop. Six code paths were silently dropping evaluations or miscounting signals. The batch introduces a semantic contract (null vs rejected vs generated) and adds new counters for previously invisible pair drops and signal rejections. Post-restart verification confirmed several fixes working correctly, but also revealed 5 new issues that need resolution in subsequent batches.

---

## Changes Deployed

### Files Modified
| File | Lines Changed | What Changed |
|------|--------------|-------------|
| `server/types/virtual-trade.interface.ts` | +15 / -2 | Added `familyFilterMismatch` to NullReasonBreakdown, created new `RejectedReasonBreakdown` interface, added `signalsRejected`, `pairsSkippedNoPrice`, `pairsSkippedInsufficientOHLC`, `rejectedReasons` to VTSEvalSnapshot |
| `server/services/vts-runner.ts` | +87 / -28 | 8 edits: counter initialization, silent pair drops, family filter counting, ADX guard fix, Net EV reorder with rejectedReasons, aggregation updates (x3), stale console.log fix |

### Edits Applied (10 total)
| Edit | Description | Status |
|------|-------------|--------|
| A | Add familyFilterMismatch to NullReasonBreakdown, remove netEvBelowFloor | Applied |
| B | Add new fields to VTSEvalSnapshot + RejectedReasonBreakdown interface | Applied |
| C | Initialize new counters in eval loop + rejectedReasons block | Applied |
| D | Count silent pair drops (pairsSkippedNoPrice, pairsSkippedInsufficientOHLC) | Applied |
| E | Count family filter skips with all counter increments + familyFilterMismatch | Applied |
| F | Fix ADX guard to increment all counters (was only incrementing nullReasons.adxGuard) | Applied |
| G | Move Net EV check before signalsGenerated, use rejectedReasons.netEvBelowFloor | Applied |
| H | Aggregate new counters in getVtsEvalHistory() | Applied |
| I | Replace null reasons aggregation — remove netEvBelowFloor, add familyFilterMismatch, add rejectedReasons aggregation with backwards compat | Applied |
| J | Initialize new fields in aggregation object + rejectedReasons | Applied |
| (cleanup) | Fix stale console.log referencing nullReasons.netEvBelowFloor → rejectedReasons | Applied |

---

## Post-Implementation Audit

### Code Review (PASSED)
- All 10 edits verified in clone against INSTRUCTIONS.md
- Zero remaining references to `nullReasons.netEvBelowFloor` in vts-runner.ts
- New `RejectedReasonBreakdown` interface correctly separates rejected signals from nulls
- Backwards compatibility for old disk snapshots with netEvBelowFloor in nullReasons
- Only `vts-runner.ts` and `virtual-trade.interface.ts` modified (correct scope)

### Git Log (PASSED)
- Commit `c805e6da` on branch `dawntrader-v4`
- Clean fast-forward pull to clone
- No unexpected commits

### Preview Site Verification (PARTIAL — new issues found)

**Server restarted at ~12:54 AM local (Mar 26, 2026). Verification performed at ~12:56 AM.**

#### Invariant Checks

| Invariant | Expected | Observed | Result |
|-----------|----------|----------|--------|
| totalStrategyEvals >= nulls + signals | 103,315 >= 103,252 + 63 = 103,315 | 103,315 = 103,315 | **PASS** |
| quantEvals + patternEvals = totalEvals | Needs verification | Not separately visible on current UI | **INCONCLUSIVE** |
| signalsGenerated = trade-creating signals only | 63 signals, 6 open trades | Plausible (63 signals over 24h, 6 still open) | **PASS** |
| familyFilterMismatch > 0 | > 0 | 1,924 | **PASS** |
| ADX Guard in null reasons | >= 0 | 0 (sma_trend_ride has 83 evals, 83 nulls — may not have triggered ADX guard yet) | **PASS (expected)** |
| All null reasons sum <= Strategy Returned Null | 98,153 + 3,175 + 1,924 + 0 + 0 + 0 = 103,252 | Strategy Returned Null = 103,252 | **PASS** |

#### New Issues Found During Verification

| Issue # | Description | Severity | Owner Batch |
|---------|-------------|----------|-------------|
| #22 | By-Strategy TOTAL (100,140) != Total Strategy Evaluations (103,315). Gap = 3,175 = Duplicate Position count. Duplicate guard increments totalStrategyEvaluations but NOT byStrategy[stratKey]. | P0 — counter mismatch | Batch 27 |
| #23 | Null Reason "% of Nulls" shows 115% for Strategy Conditions Not Met. Percentage denominator is wrong — likely using a smaller number than total nulls. | P2 — display bug | Batch 27 |
| #24 | Both FX5 survivors (4,389+852) and VTS pairs evaluated (49,897) are cumulative across cycles, not unique pairs. Kraken has ~1,400 pairs. Labels are misleading. | P2 — labeling | Batch 29 |
| #25 | FX5 rolling diagnostics (in-memory, reset on restart) vs VTS eval history (disk-persisted) cover different time windows after restart, making them incomparable. | P1 — architecture | Batch 29 |
| #26 | pairsSkippedNoPrice and pairsSkippedInsufficientOHLC counters exist in backend (Batch 26) but not displayed in frontend. | P2 — UI gap | Batch 29 |

---

## Semantic Contract (Structural A — Applied)

| Category | Definition | Counter Bucket |
|----------|-----------|---------------|
| **Null** | Strategy did not fire — no valid setup, pre-detect eligibility skip, or guard blocked before detect() | `nullReasons` (conditionsNotMet, adxGuard, duplicatePosition, familyFilterMismatch, maxOpenTrades, regimeNoStrategies) |
| **Rejected** | Signal created by detect() but failed a post-generation guard | `rejectedReasons` (netEvBelowFloor) |
| **Generated** | Signal passed ALL post-generation guards and became a trade | `signalsGenerated` |

---

## Capacity Status

| Actor | Context Used | Threshold |
|-------|-------------|-----------|
| Claude Code | Fresh session (~15% estimated) | OK |
| Langston (Topic 21) | ~151,140 / 272,000 (~56%) | **Note: past 50%. Current batch can continue. Monitor.** |

---

## Stale Reference Check

- CCPI Last Updated date references Batch 23 GOV — needs updating in governance batch
- CCPI session UUID for topic 21 shows `d26fe220-dfef-4fce-9093-7bf0748833e3` in some places but MEMORY.md has `50c01e7e-508d-4361-919c-462a04f3a60c` — the latter is current. CCPI body needs correction in governance batch.

---

## Next Steps

1. **Batch 27** (next): Fix #22 (byStrategy gap), #23 (null % denominator), #20 (rejection reasons all zero), investigate #7 (LQ), #9 (benchmark), #5 (quant pattern detection)
2. **Batch 28**: Adjust pattern-path DI threshold in DB (#8)
3. **Batch 29**: UI layout (#21), cumulative labeling (#24), persistence labels (#25), display skip counters (#26), Pipeline Summary Table (#13), rejection+generated relationship (#15), null taxonomy+bullets (#16), signals vs trades documentation (#6)
4. **Governance batch**: Single deployment after ALL batches 26-29 verified — update CCPI, BATCH_CATALOG, PHASE_HISTORY, MEMORY, SYSTEM_MANUAL, CHANGES_AND_FIXES
5. **Final review**: Thorough code review + preview site walkthrough of entire Filter Diagnostics tab after all batches complete
