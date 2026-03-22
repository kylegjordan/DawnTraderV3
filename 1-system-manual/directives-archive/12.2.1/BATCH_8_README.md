# Batch 8 — Directive 12.2.1: Wave 1 Safe Deletions

**Date**: 2026-02-27
**Directive**: 12.2.1 — Wave 1: Safe Deletions
**Baseline Commit**: `e74e4646` (Batch 7B governance)
**Code Commit**: `8086264c`
**Test Baseline**: 800 pass / 81 fail (881 total) — unchanged

---

## Summary

Removed ~1,254 lines of dead code across 13 files in 4 categories:
- **2 file deletions** (~962 lines): Orphaned `dhma.ts` (656 lines) + standalone `latti-safety-monitor.tsx` (306 lines)
- **3 server surgery files** (~230 lines): `routes.ts` (handleLATTITargets function + comment), `index.ts` (LATTI audit references → systemManaged), `schema.ts` (lattiBaselineHistory table + 3 systemContext fields)
- **7 client surgery files** (~60 lines): LATTi text references replaced with "system" across goal components. `target-daily-goals.tsx` fully rewritten to use static pace defaults instead of LATTI query.
- **1 interface cleanup** (~2 lines): `expectedDuration` removed from `SizedStrategySignal` interface + write site in `signal-orchestrator.ts`

## Files Modified

| # | File | Action |
|---|------|--------|
| 1 | `client/src/components/system/latti-safety-monitor.tsx` | DELETED (306 lines) |
| 2 | `server/strategies/dhma.ts` | DELETED (656 lines) |
| 3 | `server/routes.ts` | Surgery: removed handleLATTITargets (~137 lines) + LATTI route comment (3 lines) |
| 4 | `server/index.ts` | Surgery: removed LATTI comment/log + renamed lattiManaged→systemManaged |
| 5 | `shared/schema.ts` | Surgery: removed lattiBaselineHistory table + 3 systemContext LATTI fields |
| 6 | `client/src/components/system/enhanced-system-monitoring.tsx` | Surgery: removed LATTISafetyMonitor import + render |
| 7 | `client/src/components/goals/target-daily-goals.tsx` | Full replacement: LATTI query removed, static pace defaults |
| 8 | `client/src/components/goals/coherency-rules-tab.tsx` | Text: 9 "LATTI" → "system" |
| 9 | `client/src/components/goals/goals-table.tsx` | Text: 3 "LATTI" → generic |
| 10 | `client/src/components/goals/guardrails-tab.tsx` | Text: "LATTI Baseline Status" → "Paper Baseline Status" |
| 11 | `client/src/components/goals/copy-to-live-modal.tsx` | Text: "LATTI-optimized" → "optimized" |
| 12 | `client/src/components/goals/core-four-guardrails.tsx` | JSDoc: removed LATTi authority reference |
| 13 | `server/services/signal-orchestrator.ts` | Interface: removed expectedDuration field + write site |

## Key Decisions

- **`target-daily-goals.tsx` full rewrite**: The component had 41 LATTI references deeply intertwined with initialization logic. A surgical edit would have been error-prone. Full rewrite preserves all non-LATTI functionality (goal saving, validation, projections, pace display) while replacing LATTI-dependent initialization with a simple saved-goals-or-pace-default pattern.
- **`lattiManaged` → `systemManaged` rename** (not removal): The coherence audit telemetry in `index.ts` tracks system-managed vs manual-override field counts. The concept is valid — only the LATTI branding needed removal.
- **DB column names preserved**: `tunedByLatti`, `managedByLottie` etc. are physical DB column names. Renaming would require a migration. Not in scope.

---

*Batch documentation created as part of Batch 8B governance update.*
