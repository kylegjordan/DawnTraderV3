# Batch 22 Hotfixes (HF through HF7) — Completion Report

**Date**: 2026-03-23
**Branch**: dawntrader-v4
**Phase**: 14.6
**Type**: Post-deployment hotfixes for Architecture B implementation

---

## Hotfix Summary

| HF | Commit | Description |
|----|--------|-------------|
| HF | `0306c263` | DB seed import path fix (../../db.js → ../db.js), auto-execute call, Drizzle migration for di_max column, 8 family filter rows seeded |
| HF2 | `2b119866` | Family Path IMF Results 24-hour rolling aggregation — extended filter diagnostics to show family data in both last-scan and 24h sections |
| HF3 | (included in HF4) | Unique duplicate combos tracking — added blockedDupCombos Set to vts-runner.ts, uniqueDuplicateCombos to NullReasonBreakdown |
| HF4 | `b6bf4422` | UI: TOTAL row in by-strategy table + Unique Combos Blocked sub-row under Duplicate Position Max in Signal Rejection Breakdown |
| HF5 | `2dab3808` | Moved unique combos computation from in-memory vtsEvaluation to disk-persisted skipped signals logger — survives server restarts |
| HF6 | `dd4ff646` | Fixed reason key mismatch: `Duplicate_Position` → also matches `Duplicate_Position_Max` in skipped-signals-logger.ts |
| HF7 | `33c8225f` | VTS eval history disk persistence (logs/vts_eval_history/) + skipped signals immediate flush (prevents data loss on crash) |

## Key Issues Resolved

1. **di_max column missing from PostgreSQL** — Drizzle migration created it, seed populated 8 rows
2. **Family diagnostics only in last-scan** — Extended to 24h rolling aggregation
3. **Duplicate rejection count stuck at 1,114** — Root cause: skipped signals logger buffer not flushing before EADDRINUSE crashes. Fixed with immediate flush.
4. **VTS eval data lost on restart** — Now persisted to disk at logs/vts_eval_history/<date>.json, hydrated on startup
5. **Unique combos blocked not showing** — Reason key mismatch fixed (Duplicate_Position vs Duplicate_Position_Max)

## Known Remaining Issues

1. **Signal Rejection Breakdown not updating** — Duplicate Position Max count may still be stale. The immediate flush fix (HF7) should resolve this going forward, but needs verification after server stability.
2. **DI thresholds too strict for Trend/Breakout** — 0 survivors for both families. DI ≥ 55 (trend) and ≥ 45 (breakout) are too high for current crypto DI distribution (15-40 range). Calibration needed in next batch.
3. **EADDRINUSE recurring crashes** — Server process conflicts causing repeated restarts. Not a code issue — Replit environment concern.

## Actors

- **Claude Code**: Implemented all hotfixes
- **Langston**: Reviewed Batch 22 code and governance
- **Replit Agent**: Applied edits, ran validations
- **Kyle**: Identified UI issues via preview site, directed fixes
