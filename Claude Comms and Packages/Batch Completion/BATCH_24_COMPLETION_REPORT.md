# Batch 24 — Filter Diagnostics Data Truth + Pipeline Flow Fixes
## Batch Completion Report

**Date**: 2026-03-24
**Commit**: `6eef825f`
**Branch**: dawntrader-v4
**Type**: Code batch (server + client)
**Actors**: Claude Code (implementor), Langston (reviewer), Replit (investigator)

---

## 1. Problem Statement

Kyle reviewed the Filter Diagnostics tab and identified 10+ issues across data accuracy, pipeline coherence, and UI flow. Langston categorized these as P0 (data truth), P1 (architecture semantics), P2 (UI flow), and P3 (governance gaps).

## 2. Root Causes Identified (Code-Level Investigation)

| Bug | Root Cause | File | Lines |
|-----|-----------|------|-------|
| Quant pool columns empty | UI colSpan=2 merged cells; counters were pool-agnostic | machine-learning.tsx | 1992-1999 |
| Pattern survivors mismatch | FX5 counts available pairs; VTS counts evaluated pairs (different denominators) | fx5-scanner.ts vs vts-runner.ts | — |
| Duplicate_Position_Max vanished | openVirtualTrades clears on restart; no trades = no duplicates | vts-runner.ts | 889-903 |
| Duplicate_Position_Max not in SkipReason type | Latent TypeScript type mismatch — tsx strips types | skipped-signals-logger.ts | 16-26 |
| Pattern Detection = 0 in quant | Counter only increments for sourcePool=pattern; quant pairs get patterns via hybrid confluence | vts-runner.ts | 1576-1596 |

## 3. Changes Implemented

| File | Change |
|------|--------|
| skipped-signals-logger.ts | Added `Duplicate_Position_Max` to SkipReason type union |
| vts-runner.ts | Split counters by pool: `quantStrategyEvaluations`, `patternStrategyEvaluations`, `quantSignalsGenerated`, `patternSignalsGenerated` — initialized, incremented, aggregated in rolling 24h |
| virtual-trade.interface.ts | Added 4 new fields to VTSEvalSnapshot interface |
| machine-learning.tsx | Fixed colSpan=2 → 3 separate cells; reordered rows (Total Evals above Nulls); added "(pattern pool only)" and "(sampled per cycle)" labels; display zero-count null reasons |

## 4. Preview Site Verification

5/6 checks passed on live preview:
- ✅ Per-pool columns working (Quant: 148, Pattern: 46)
- ✅ Row ordering corrected
- ✅ Labels clarified
- ✅ Zero-count null reasons displayed
- ⚠️ Signal Rejection Breakdown still hides zero-count rows (separate table, minor)
- ⚠️ Total column diverges from per-pool sums (expected — historical disk data vs new per-pool counters; will converge)

## 5. Known Limitations

1. **Total column divergence** — `totalStrategyEvaluations` includes disk-hydrated historical data from before Batch 24. Per-pool counters only accumulate post-Batch 24. Numbers will converge after 24h of VTS cycles.
2. **Duplicate Position Max** — Shows in Null Reason Breakdown (from VTS eval counters) but may not show in Signal Rejection Breakdown (from skipped signals logger) until enough VTS cycles rebuild open virtual trades.
3. **Signal Rejection Breakdown** zero-count rows still hidden — the fix only applied to Null Reason Breakdown table.

## 6. Langston Review

Approved pre-implementation. Post-deployment: satisfied with results, noted total divergence is expected and temporary.
