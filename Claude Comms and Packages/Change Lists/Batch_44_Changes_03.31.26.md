# Batch 44 — Change List

> **Date**: 2026-03-31
> **Commits**: `4ec0c173` (main), `1ebcf819` (debug cleanup)
> **Branch**: migration/aws-supabase

---

## Files Modified

### 1. `server/services/vts-runner.ts`
**Type:** Major — pattern routing fix + duplicate scanPatterns removal

| Change | Detail |
|--------|--------|
| `generatePhase10Signal` signature (line 639) | Added `preDetectedPatterns?: any[]` parameter — receives cached patterns from outer loop to avoid duplicate scanPatterns() call. |
| `scanPatterns` call inside `generatePhase10Signal` (line 673) | Changed from `scanPatterns(candles, symbol)` to `preDetectedPatterns ?? scanPatterns(candles, symbol)`. Uses cached result when available. |
| `effectivePatternName` variable (line 747) | **NEW.** When `strategyOverride.patternType` exists AND a pattern was detected, uses the canonical name (e.g., `MORNING_STAR`) instead of raw detected name (e.g., `THREE_SOLDIERS`). |
| `stratPatternInput.pattern` (line 755) | Changed from `bestDetectedPattern.pattern` to `effectivePatternName!` — carries canonical name to strategy detect() functions. |
| `outerLoopDetectedPatterns` variable (line 1674) | **NEW.** Declared in outer loop to cache scanPatterns result for pattern-pool pairs. |
| Pattern-pool branch (line 1687) | Added `outerLoopDetectedPatterns = detectedPatterns` — caches result after scanPatterns call. |
| Quant-pool branch (lines 1725-1765) | **MAJOR REWRITE.** Previously: `effectiveStrategies = regimeStrategies` (all strategies). Now: split into `quantOnlyStrategies` (signalType QUANT) + `quantPairPatternStrategies` (PATTERN/HYBRID only when matching canonical pattern detected). Pattern strategies no longer blindly sprayed at quant pairs. |
| `generatePhase10Signal` call site (line 1839) | Added `outerLoopDetectedPatterns` as final argument. |

### 2. `server/services/fx5-scanner.ts`
**Type:** Major — diagnostic persistence

| Change | Detail |
|--------|--------|
| Imports (line 24-25) | **ADDED** `import fs from 'fs'` and `import path from 'path'`. |
| `DIAG_DIR` static property (line 237) | **NEW.** `path.join(process.cwd(), 'logs', 'fx5_diagnostics')`. |
| Constructor (line 244) | **ADDED** call to `this.rehydrateDiagnostics()`. |
| `persistDiagnostics()` method (lines 248-264) | **NEW.** Writes `{lastScan, history, persistedAt}` to `logs/fx5_diagnostics/diagnostics_{date}.json`. Creates directory if missing. Filters history to 24h window before writing. |
| `rehydrateDiagnostics()` method (lines 267-312) | **NEW.** Reads today + yesterday diagnostic files on startup. Deduplicates by timestamp. Filters to 24h cutoff. Sorts chronologically. Sets `lastScanDiagnostics` from latest entry. |
| After `scanDiagnosticsHistory.push` (line 1293) | **ADDED** `this.persistDiagnostics()` call after each scan cycle. |

### 3. `Claude Comms and Packages/Scope Files/BATCH_44_SCOPE.md`
**Type:** New file (scope document)

---

## Files Created
- `Claude Comms and Packages/Scope Files/BATCH_44_SCOPE.md`
- `Claude Comms and Packages/Reports/Batch Completion/Batch_Completion_44_03.31.26.md`
- `Claude Comms and Packages/Reports/Change Lists/Batch_44_Changes_03.31.26.md` (this file)

## Files Deleted
None.
