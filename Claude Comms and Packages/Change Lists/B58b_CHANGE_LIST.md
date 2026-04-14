# Batch 58b Change List — Phase 11 Finalization (Code Implementation)

> **Date:** 2026-04-11
> **Type:** Code implementation + governance updates
> **Purpose:** Implement parameter registry, baseline loader, audit logging, and log-only validation per ADJUSTMENT_FRAMEWORK.md
> **Prerequisite:** B58a governance docs approved by Langston (#731-733)
> **Review Requested:** Langston code-level review before GitHub push

---

## Files Created (2 code files)

### 1. `server/config/adjustment-registry.ts` (NEW — ~180 lines)

**Purpose:** Parameter bounds definitions, validation functions, and audit logging for all Tier 1/2 adjustable parameters.

**Contents:**
- `GovernanceTier` type + `ParameterSpec` interface
- `FILTER_BOUNDS` — bounds/stepSize/cadence for all screener_filters columns (vn_max, di_min, di_max, min_volume, lq_min, corr_max, min_price, final_score_min, regime_weight_min, rsi, volatility, spread)
- `validateFilterChange()` — validates a single filter threshold change against bounds. In log-only mode: warns but returns valid=true. In enforce mode: returns valid=false for violations.
- `validateFilterBatch()` — validates multiple changes at once
- `logAdjustmentEvent()` — structured audit logging (parameter, path, old/new, mode, approver, evidence, baseline version)
- `validateStartupConfig()` — checks score weights sum to ~1.0, execution config version, MAX_POSITION_RISK bounds
- `setValidationMode()` / `getValidationMode()` — toggle between log-only and enforce

**Design decisions:**
- Log-only by default — never blocks legitimate writes until explicitly switched to enforce
- Unknown parameters logged but not blocked
- Step size validated with 1% float tolerance
- Startup validation is always log-only (never blocks boot)

**Review focus:** Are FILTER_BOUNDS ranges reasonable? Is the validation logic correct?

---

### 2. `server/config/authority-baseline.ts` (NEW — ~150 lines)

**Purpose:** Loads V1.0 authority baseline JSON and provides comparison utilities.

**Contents:**
- `loadBaseline()` — loads from `1-system-manual/authority-baseline-v1.json` at startup. Tries multiple path candidates (dev/prod). Graceful degradation if file missing.
- `getBaseline()` — returns loaded baseline or null
- `getBaselineFilterValue()` — gets specific filter threshold from baseline (checks differentiating first, then uniform)
- `getBaselineStrategyParam()` — gets strategy parameter from baseline
- `getBaselineSharedConfig()` — gets shared config value
- `compareFiltersToBaseline()` — drift detection: compares current filter values against baseline, returns list of drifted parameters with absolute and percentage drift
- `getBaselineVersion()` — for audit trail

**Design decisions:**
- Read-only — never modifies any values
- Singleton pattern — loads once, cached for session
- Multiple path candidates for dev vs prod environments
- Drift detection available but not automatically triggered (consumer must call)

**Review focus:** Are path resolution candidates correct? Is drift detection logic sound?

---

## Files Modified (4)

### 3. `server/routes.ts` (MODIFIED — 2 changes)

**Change 1 — Import (line ~67):**
```typescript
import { validateFilterChange, logAdjustmentEvent } from './config/adjustment-registry.js';
```

**Change 2 — Validation before upsert (PUT /api/filters-v2 handler):**
Added ~20 lines between filter value update and `storage.upsertScreenerFilters()` call:
- Maps camelCase filter names to DB column names (e.g., `vnMax` -> `vn_max`)
- Calls `validateFilterChange()` for numeric filter updates
- Calls `logAdjustmentEvent()` for audit trail
- Validation is log-only — warns but never blocks the write

**Review focus:** Is the camelCase-to-snake_case mapping complete? Does the validation placement avoid interfering with the existing audit log?

---

### 4. `server/core/boot_orchestrator.ts` (MODIFIED — 2 changes)

**Change 1 — Imports (line ~19):**
```typescript
import { loadBaseline } from '../config/authority-baseline';
import { validateStartupConfig } from '../config/adjustment-registry';
import { SCORE_WEIGHTS } from '../config/score-weights.config';
import { EXECUTION_CONFIG } from '../config/execution-config';
```

**Change 2 — Startup validation (inside `initialize()`, before ML service start):**
- Calls `loadBaseline()` — logs version if loaded, warns if not found
- Calls `validateStartupConfig()` with SCORE_WEIGHTS and EXECUTION_CONFIG
- Logs warning count if any issues
- Non-blocking — never prevents startup

**Review focus:** Does this add a circular dependency risk? (Boot orchestrator already had circular dep issue in B52 — these imports are from config/, not services/, so should be safe)

---

### 5. `1-system-manual/SYSTEM_IMPACT_MAP.md` (MODIFIED)

**Changes:**
- Updated "Last Updated" header to B58b
- Added Layer 9.10 (Adjustment Registry) — file, upstream/downstream, blast radius LOW
- Added Layer 9.11 (Authority Baseline Loader) — file, upstream/downstream, blast radius LOW

---

### 6. `1-system-manual/CHANGES_AND_FIXES.md` (MODIFIED)

**Changes:**
- Added INFRA-001 entry: Adjustment Registry + Authority Baseline implementation summary

---

## What This Batch Does NOT Do

- No trading logic changes
- No threshold value changes
- No strategy constant migration from code to DB
- Validation is **log-only** — never blocks any write
- Startup validation is **non-blocking** — never prevents boot
- Baseline loader is **read-only** — never modifies any values
- Does NOT yet switch to enforce mode (that's a future decision)

---

## Langston Review Checklist

- [ ] `adjustment-registry.ts` — FILTER_BOUNDS ranges reasonable
- [ ] `adjustment-registry.ts` — validation logic correct (bounds + step size)
- [ ] `adjustment-registry.ts` — audit logging format adequate
- [ ] `authority-baseline.ts` — path resolution candidates correct
- [ ] `authority-baseline.ts` — drift detection logic sound
- [ ] `routes.ts` — camelCase-to-snake_case mapping complete
- [ ] `routes.ts` — validation placement doesn't interfere with existing audit
- [ ] `boot_orchestrator.ts` — no circular dependency risk from new imports
- [ ] `boot_orchestrator.ts` — startup validation non-blocking confirmed
- [ ] `SYSTEM_IMPACT_MAP.md` — new entries accurate
- [ ] `CHANGES_AND_FIXES.md` — INFRA-001 entry accurate
- [ ] Overall: no trading logic impact, no threshold changes

---

## Summary of All B58 Changes (a + b combined)

| # | File | Type | Sub-Batch |
|---|------|------|-----------|
| 1 | `1-system-manual/ADJUSTMENT_FRAMEWORK.md` | NEW governance | B58a |
| 2 | `1-system-manual/AUTHORITY_BASELINE.md` | NEW governance | B58a |
| 3 | `1-system-manual/authority-baseline-v1.json` | NEW data | B58a |
| 4 | `server/config/adjustment-registry.ts` | NEW code | B58b |
| 5 | `server/config/authority-baseline.ts` | NEW code | B58b |
| 6 | `server/routes.ts` | MODIFIED code | B58b |
| 7 | `server/core/boot_orchestrator.ts` | MODIFIED code | B58b |
| 8 | `1-system-manual/BATCH_CATALOG.md` | MODIFIED governance | B58a |
| 9 | `1-system-manual/PHASE_HISTORY.md` | MODIFIED governance | B58a |
| 10 | `1-system-manual/SYSTEM_IMPACT_MAP.md` | MODIFIED governance | B58b |
| 11 | `1-system-manual/CHANGES_AND_FIXES.md` | MODIFIED governance | B58b |
