# Batch 44 Completion Report: Pattern-to-Strategy Routing Fix + Diagnostic Persistence

> **Date**: 2026-03-31
> **Commits**: `4ec0c173` (main), `1ebcf819` (debug cleanup)
> **Branch**: migration/aws-supabase
> **Reviewed by**: Langston (code review + second-pass verification)

---

## Executive Summary

Batch 44 fixed the pattern-to-strategy routing mismatch that caused massive null rates in VTS strategy evaluations. Quant-pool pairs were being sprayed against ALL regime strategies including pattern-specific ones that hard-gated on pattern types the pair didn't have. Additionally, canonical pattern name mapping (e.g., THREE_SOLDIERS → MORNING_STAR) was not carried through to strategy detect() functions. Both issues are now fixed. FX5 scan diagnostics now persist to disk and survive PM2 restarts.

---

## Scope Objectives Checklist

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Fix quant-pool pattern strategy routing | **YES** | Staging logs: quant pairs show `1 quant` or `2 quant` only. Pattern strategies added only when matching pattern detected (e.g., `TRUMP/USD: 2 quant + 1 pattern(support_bounce)`). No blind spray. |
| 2 | Fix canonical pattern name mismatch | **YES** | Pattern-pool pairs correctly routed: `ADA/EUR → Pattern-driven: volatility_edge(ABCD)`. `effectivePatternName` uses canonical name from strategyOverride.patternType. |
| 3 | Remove duplicate scanPatterns() call | **YES** | `outerLoopDetectedPatterns` cached in pattern-pool branch, passed through `preDetectedPatterns` parameter. `generatePhase10Signal` uses `preDetectedPatterns ?? scanPatterns()`. |
| 4 | Persist FX5 scan diagnostics to disk | **YES** | `diagnostics_2026-03-31.json` created (87KB). Rehydrated across 4 restarts (3→5→5→12→19→20 entries). API returns `lastScan=true, historyLen=20` after restart. |
| 5 | Verify VTS evaluation counter persistence | **YES** | VTSEvalSnapshot includes all Pipeline Summary counters. `hydrateVtsEvalHistory()` rehydrates from `logs/vts_eval_history/`. No changes needed — already complete from Batch 22 HF7. |

**Note:** VTS runs in passive/stopped mode (not active trading mode). Initial assessment incorrectly stated VTS was not running — this was corrected. All verification was completed in staging, not deferred.

---

## Persistence Inventory (Batch 44 status)

| Data Set | Before Batch 44 | After Batch 44 |
|----------|-----------------|----------------|
| FX5 scanDiagnosticsHistory | IN-MEMORY ONLY | **DISK-PERSISTED** (logs/fx5_diagnostics/) |
| VTS eval counters | DISK-PERSISTED | DISK-PERSISTED (no change needed) |
| Open virtual trades | IN-MEMORY ONLY | IN-MEMORY ONLY (not in scope) |
| Governance counters | IN-MEMORY ONLY | IN-MEMORY ONLY (not in scope) |
| fx5-24h-window | IN-MEMORY ONLY | IN-MEMORY ONLY (not in scope) |
| Telemetry cascade/pool | IN-MEMORY ONLY | IN-MEMORY ONLY (not in scope) |

---

## Carry-Forward Items

1. **Remaining in-memory metrics**: Open virtual trades, governance counters, fx5-24h-window, telemetry aggregates still lost on restart. Future batches if Kyle prioritizes.
2. **BUY-only pattern filter**: Quant-pool routing only checks BUY patterns. If bearish pattern strategies are added, the filter would need updating. Watchpoint noted by Langston.
3. **Strategy conversion rate**: With routing fix deployed, need to monitor whether the null rate actually drops and signal production improves.
4. **Remaining items from Langston's 17-item backlog**: Items 5-17 still open for future batches.

---

## Capacity Status

- **Claude Code**: ~500K tokens used of 1M context
- **Langston (main session)**: ~25K/272K tokens (~9% used — fresh session)
