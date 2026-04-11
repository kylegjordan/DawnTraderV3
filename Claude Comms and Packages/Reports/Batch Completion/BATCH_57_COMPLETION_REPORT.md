# Batch 57 Completion Report — Pattern-Strategy Fix + Pool-Split Null Reasons

> **Date:** 2026-04-10 to 2026-04-11
> **Commits:** fb15bd34, 442115f6, 1992d5de, b2822a3f, ce5378f6
> **Branch:** migration/aws-supabase
> **Langston Review:** Logic/design approved for all changes. Stale Google Drive mount prevented direct file verification.

---

## Scope Objectives

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Add quant/pattern pool split to null reason tracking | YES | Quant Pool / Pattern Pool columns visible in staging UI |
| 2 | Fix pattern-strategy mismatch in VTS (vts-runner.ts) | YES | "No Pattern Detected" dropped from 99%+ to <1% of pattern-path nulls |
| 3 | Fix pattern-strategy mismatch in active path (signal-orchestrator.ts) | YES | Per-strategy buildPatternInputForStrategy() replaces shared patternInput |
| 4 | Fix adaptive-flow.ts THREE_SOLDIERS canonicalization | YES | Now accepts both THREE_SOLDIERS and MORNING_STAR |
| 5 | Convert volume gate to soft confidence factor for support_bounce + reverse_impulse | YES | Graduated factor: >=2.0x: bonus, >=1.2x: small bonus, >=0.8x: neutral, <0.8x: penalty |

## Stats
- Files changed: 7 (vts-runner.ts, signal-orchestrator.ts, adaptive-flow.ts, virtual-trade.interface.ts, machine-learning.tsx, support-bounce.ts, reverse-impulse.ts)
- Pattern fix impact: "No Pattern Detected" null reason dropped from #1 cause (38%) to negligible in new post-fix data

## Key Findings
1. Pattern-strategy mismatch was present in BOTH VTS and active trading path — active path was worse (no strategy filtering at all)
2. The bug caused ~125K "No Pattern Detected" nulls per 24h — each strategy was receiving the single globally-strongest pattern instead of its matching pattern
3. adaptive-flow.ts had a pre-existing bug: THREE_SOLDIERS canonicalizes to MORNING_STAR but the strategy only accepted THREE_SOLDIERS
4. Pool-split null reasons revealed that "Volume Confirmation Failed" is the #1 pattern-path null reason post-fix (302 pattern vs 42 quant)
5. Volume Confirmation Failed was #1 pattern-path null reason (1,460 vs 304 quant). Root cause: all 8 pattern strategies had hard volume gates while quant strategies (mean_reversion, range_trading) had none. Pattern pool admits lower-liquidity pairs via relaxed FX5 filters, which then hit the 1.2-1.3x per-candle volume gate. Consensus with Langston: breakout strategies keep hard gates, reversal strategies use soft graduated factor.

## Governance Updates
Files modified in this governance batch:
1. BATCH_CATALOG.md — B57 entry
2. PHASE_HISTORY.md — B57 note
3. CCPI — Current state updated to B57
4. CHANGES_AND_FIXES.md — Pattern-strategy mismatch entry added (BUG-029), marked RESOLVED
5. SYSTEM_IMPACT_MAP.md — Notes added to Layer 4.1, 7.1, and Strategy Threshold Constants (volume soft gate)
6. CHANGES_AND_FIXES.md — PERF-001 added (volume gate too strict, RESOLVED)
7. BATCH_57_COMPLETION_REPORT.md — This file
