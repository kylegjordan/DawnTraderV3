# Batch 44 Scope: Pattern-to-Strategy Routing Fix + Diagnostic Persistence

> **Date**: 2026-03-31
> **Baseline**: Commit `fa314df4` (Batch 43 governance)
> **Branch**: migration/aws-supabase
> **Approved by**: Kyle (directive), Langston (scope review pending)
> **Deferred from Batch 43**: Pattern detection loss, duplicate scanPatterns()

---

## Purpose

Two architecture problems:

**Problem A — Pattern-to-Strategy Routing Mismatch:** Upstream pattern detection has a HIGH detection rate. But downstream strategy detect() functions hard-gate on specific pattern types and return null when the detected pattern doesn't match. This happens because: (1) quant-pool pairs are evaluated against ALL regime strategies including pattern ones that require specific patterns, and (2) canonical pattern mapping (e.g., THREE_SOLDIERS → MORNING_STAR) normalizes for routing but strategy detect() checks the raw pattern name.

**Problem B — In-Memory Diagnostics Lost on Restart:** The entire Pipeline Summary 24h data, FX5 scan diagnostics, open virtual trades, and governance counters are in-memory only. Every restart clears them. Kyle wants all critical metrics to persist to disk so data survives restarts.

---

## Problem A: Pattern Routing — The Bug

### Current flow (broken):
```
Quant-pool pair enters VTS evaluation
  → regimeStrategies = ALL strategies for current regime (quant + pattern + hybrid)
  → For each strategy, evaluatePairForVTS() is called
  → Inside evaluatePairForVTS(), scanPatterns() detects actual pattern (e.g., ENGULFING)
  → morning_star.detect() checks: patternSignal.pattern !== 'MORNING_STAR' → returns NULL
  → Result: quant pairs generate massive null counts against pattern strategies they should never be routed to
```

### Canonical mapping bug:
```
THREE_SOLDIERS detected → normalizePatternToCanonical() → 'MORNING_STAR'
  → Routes to morning_star strategy
  → morning_star.detect() checks patternSignal.pattern !== 'MORNING_STAR'
  → But patternSignal.pattern = 'THREE_SOLDIERS' (raw detected name)
  → NULL — pattern was correctly identified and correctly routed but the detect() function rejects it
```

### Intended flow (fix):
```
Quant-pool pair enters VTS evaluation
  → regimeStrategies filtered: quant strategies ONLY (no pattern/hybrid unless pattern is detected)
  → Pattern strategies only run when matching pattern is detected
  → Canonical pattern names used consistently between routing and detect()
```

---

## Objectives

### Objective 1: Fix quant-pool pattern strategy routing
**What:** Quant-pool pairs should NOT be evaluated against pattern strategies unless a matching pattern was actually detected. In the multi-strategy outer loop (vts-runner.ts line ~1714), filter `regimeStrategies` to exclude pattern/hybrid strategies for quant-pool pairs that have no detected pattern, OR only include pattern strategies whose required pattern was actually detected.
**Why:** This is the primary source of the massive null rate — quant pairs being evaluated against strategies that require patterns they don't have.
**Verification:** Strategy null count for pattern strategies (morning_star, inside_bar_reversal, etc.) should drop dramatically for quant-pool evaluations. Pattern strategy evals should only happen when a matching pattern exists.

### Objective 2: Fix canonical pattern name mismatch in detect() functions
**What:** When `normalizePatternToCanonical()` maps `THREE_SOLDIERS` → `MORNING_STAR` for routing, the strategy's detect() function must accept both the raw pattern name AND the canonical name. Either: (a) pass the canonical name to the detect function, or (b) update detect functions to accept the canonical family, not just the exact pattern string.
**Why:** Correctly detected and correctly routed patterns are being rejected because detect() checks the raw name instead of the canonical name.
**Verification:** A detected THREE_SOLDIERS routed to morning_star should NOT be rejected by the pattern check.

### Objective 3: Remove duplicate scanPatterns() call for pattern-pool pairs
**What:** For pattern-pool pairs in VTS, scanPatterns() is called at line 1677 (outer loop for strategy selection) and again at line 673 (inside evaluatePairForVTS for pattern input construction). The second call is redundant — it operates on identical candle data and returns the same results. Pass the first call's results through to evaluatePairForVTS() instead of calling again.
**Why:** Wasteful duplication. Also source of the "113K→68K" confusion in diagnostic counts — patterns are being counted twice.
**Verification:** scanPatterns() is called exactly ONCE per pair per VTS cycle. Pattern detection counts in diagnostics are consistent.

### Objective 4: Persist FX5 scan diagnostics to disk
**What:** `scanDiagnosticsHistory` (the 24h rolling window that powers the Pipeline Summary) and `lastScanDiagnostics` must be written to disk and rehydrated on startup. Write to `logs/fx5_diagnostics/{date}.json` after each scan cycle. On startup, read back the 24h window.
**Why:** Currently in-memory only — every PM2 restart clears the Pipeline Summary. Kyle wants data to survive restarts.
**Verification:** After PM2 restart, Pipeline Summary (24h) shows data from before the restart (within 24h window).

### Objective 5: Persist VTS evaluation counters to disk
**What:** The `vtsEvalHistory` array is already persisted (logs/vts_eval_history/). But the per-cycle counters that feed the Pipeline Summary evaluation rows (quantStrategyEvaluations, patternStrategyEvaluations, quantSignalsGenerated, etc.) should also be included in the persisted snapshots and rehydrated. Verify the existing persistence mechanism is complete.
**Why:** VTS eval history is already hybrid (persisted + rehydrated), but some counters shown in the Pipeline Summary may not be included in what's persisted.
**Verification:** After PM2 restart, VTS evaluation rows in Pipeline Summary show data from before the restart.

---

## Files Affected

| File | Change Type |
|------|------------|
| `server/services/vts-runner.ts` | Major — fix routing, remove duplicate scanPatterns, pass detected patterns through |
| `server/services/fx5-scanner.ts` | Major — add disk persistence for scan diagnostics |
| `server/strategies/morning-star.ts` | Minor — accept canonical pattern names |
| `server/strategies/inside-bar-reversal.ts` | Minor — accept canonical pattern names |
| `server/config/canonical-regime-strategy-map.ts` | Reference — verify normalizePatternToCanonical mappings |
| `server/services/pattern-recognizer.ts` | Reference — no changes expected |

---

## Risks / Dependencies

1. **Routing change affects VTS evaluation counts:** Quant-pool pairs will no longer generate pattern strategy evaluations, so total strategy evaluation counts will DROP. This is expected and correct — the old counts were inflated by misrouted evaluations.
2. **Detect function changes:** Modifying pattern name checks in detect() functions must be precise — only accept canonically equivalent patterns, not weaken the filter.
3. **Disk I/O:** Adding persistence writes to each scan cycle adds I/O. Keep writes async and non-blocking.
4. **File format compatibility:** If diagnostics file format changes between versions, rehydration on startup must handle format mismatches gracefully.

---

## Verification Targets

### V1: Routing proof
Show that quant-pool pairs are no longer evaluated against pattern strategies unless a matching pattern was detected. Strategy null breakdown should show pattern strategies with dramatically fewer evaluations from quant pool.

### V2: Canonical pattern proof
Show that THREE_SOLDIERS detected → morning_star strategy → detect() does NOT return null on pattern check alone.

### V3: Single scanPatterns proof
Show that scanPatterns() is called exactly once per pair per VTS cycle (not twice for pattern-pool pairs).

### V4: Persistence proof
After PM2 restart, Pipeline Summary (24h) and VTS evaluation rows show pre-restart data within the 24h window.

### V5: No-regression proof
Pattern-pool pairs still correctly routed. Quant strategies unaffected. CI passes (build + Docker).
