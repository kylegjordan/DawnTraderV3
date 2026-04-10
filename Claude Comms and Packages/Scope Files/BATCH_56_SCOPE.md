# Batch 56 Scope — CI Green: Fix All TypeScript Errors + Test Failures

> **Date:** 2026-04-10
> **Directive:** Kyle directive — get all 4 CI checks green so every future push has a clean baseline
> **Branch:** migration/aws-supabase
> **Scope:** WIDE — ~99 files with TS errors, 30 test files with 77 failures
> **Risk:** LOW-MEDIUM — mostly type annotations, test assertion updates, and dead code deletion. No trading logic changes.

---

## Current CI Status (post-B55)
- **Build:** PASS
- **Docker Build:** PASS
- **TypeScript Check:** FAIL (314 errors across 99 files) — `continue-on-error: true` but still fails
- **Test Suite:** FAIL (77 failures across 30 files, 606 passing, 15 skipped)

## Goal
All 4 CI jobs GREEN after this batch. Every future push starts from a clean baseline.

---

## Objective 1: Delete Dead Code (8 files)

These files have zero importers — nothing in the codebase references them. Confirmed via `grep -r` across all .ts/.tsx files.

| # | File | Why Dead | System Impact Map |
|---|------|---------|-------------------|
| 1 | `server/services/market-analysis-scheduler.ts` | 0 importers. Legacy Walter-era scheduling. | Not in impact map |
| 2 | `server/services/paper-daily-brief.ts` | 0 importers. Walter daily brief service. | Not in impact map |
| 3 | `server/services/task-worker.ts` | 0 importers. Autonomy task worker. | Not in impact map |
| 4 | `server/services/database-query.ts` | 0 importers. Unused DB helper. | Not in impact map |
| 5 | `server/services/stage-c-validator.ts` | 0 importers. Stage-B is used, C is not. | Not in impact map |
| 6 | `server/startup.ts` | 0 importers. Superseded by `server/startup/` directory. | Not in impact map (startup/ dir is in Layer 9) |
| 7 | `server/routes/learning.ts` | Not mounted. Not registered in routes.ts or index.ts. | Not in impact map |
| 8 | `server/services/market-context-engine.ts` | VERIFY — audit says 3 importers but they may be from dead files | Layer 5.5 in impact map — CHECK |

**Verification:** `grep -r "from.*<filename>" --include="*.ts" server/ client/ shared/` returns 0 for each.

## Objective 2: Delete Stale Standalone Scripts/Tests (11 files)

These are standalone entry points (not imported by anything) with broken imports. They were one-off scripts or manual tests that are no longer functional.

| # | File | Why Stale |
|---|------|----------|
| 1 | `server/scripts/audit_regime_entropy.ts` | Standalone diagnostic, broken imports |
| 2 | `server/scripts/diagnostic-11.4G-3.ts` | Standalone diagnostic, broken imports |
| 3 | `server/scripts/migrate-symbol-canonicalization.ts` | Migration complete, script no longer needed |
| 4 | `server/test-guardrails.ts` | Manual test, broken imports |
| 5 | `server/test-resilience-phase1.ts` | Manual test, broken imports |
| 6 | `server/test-resilience-phase2.ts` | Manual test, broken imports |
| 7 | `server/tests/live-pricing-validation.ts` | Manual test requiring live server |
| 8 | `server/tests/test-force-trade.ts` | Manual test, broken imports |
| 9 | `server/migrations/goals-canonicalization-backfill.ts` | Migration complete |
| 10 | `server/migrations/verify-goals-canonicalization.ts` | Migration complete |
| 11 | `server/scripts/duplicate-live-to-paper.ts` | Walter table references, broken |

**Verification:** None of these are imported by anything.

## Objective 3: Delete Superseded Test Files (5 files)

Tests that validate old schema versions or dead features. They will never pass because they check for v1.5.0, v1.5.1, etc. when the current schema is v1.6.3.

| # | Test File | Why Delete |
|---|-----------|-----------|
| 1 | `server/__tests__/config-snapshot-api.test.ts` | Integration test requiring running server — not a unit test |
| 2 | `server/tests/diagnostic-system.test.ts` | Manual script, not a vitest test. Calls removed Walter methods. |
| 3 | `server/tests/integration/config-provenance.test.ts` | Tests v1.4.5 schema, current is v1.6.3 |
| 4 | `server/tests/integration/schema_v1_5.test.ts` | Tests v1.5.0 schema |
| 5 | `server/tests/integration/schema_v1_5_1.test.ts` | Tests v1.5.1 schema |

## Objective 4: Fix Test Assertion Mismatches (22 test files, ~72 failures)

### 4a: Schema Version Updates (Low effort — one-line fixes)
Tests that hardcode old SCHEMA_VERSION values:

| Test File | Expected | Actual | Fix |
|-----------|----------|--------|-----|
| `cost_cache.test.ts` | v1.5.8 | v1.6.3 | Update assertion |
| `cost_telemetry.test.ts` | v1.5.9 / 11.3C | v1.6.3 / 11.4C.1 | Update assertions |
| `net_expectancy.test.ts` | v1.5.7 / 11.3A | v1.6.3 / 11.4C.1 | Update assertions |
| `telemetry_persistence_sql.test.ts` | v1.5.2 / 11.1A | v1.6.3 / 11.4C.1 | Update assertions |
| `telemetry_rehydration_e2e.test.ts` | v1.5.3 / 11.1B | v1.6.3 / 11.4C.1 | Update assertions |
| `recalibration_integrity.test.ts` | v1.0 | v1.1 | Update assertion |

### 4b: Friction/Narrative Updates (Medium effort — 3-tier mapping)
| Test File | Root Cause | Fix |
|-----------|-----------|-----|
| `friction-mapping.test.ts` (9 failures) | Changed from 4-tier to 3-tier friction mapping | Update all boundary values and colors |
| `market_indicators_narrative.test.ts` | Same 3-tier friction change + schema version | Update narrative expectations |

### 4c: API/Interface Mismatch Updates (Medium-High effort)
| Test File | Root Cause | Fix |
|-----------|-----------|-----|
| `tco-tec-tcl.test.ts` (16 failures) | CriteriaLimiter/SQE interface evolved | Update method/property expectations |
| `dynamic_sizing.test.ts` (14 failures) | DSE API return shape changed | Update property assertions |
| `cost_telemetry.test.ts` (14 failures) | Cost drift monitor exports differ | Update constant/method expectations |
| `adaptive-scan-manager.test.ts` | TelemetryAggregatorService API changed | Update call signatures |
| `telemetry-aggregator.test.ts` | Method signatures changed (float→int, etc.) | Update call parameters |
| `directive-11.4B.2-R1.test.ts` | getTopPairs return shape changed | Update assertions |
| `directive-11.4C-R2.test.ts` | getRankedPairs return shape changed | Update assertions |

### 4d: Small Fixes (Low effort — 1-2 lines each)
| Test File | Root Cause | Fix |
|-----------|-----------|-----|
| `symbol-canonicalizer.test.ts` (2) | Expected XXBTZZUSD vs actual XXBTZUSD | Update expected values |
| `analysis-utils.test.ts` (2) | Filter threshold boundary shifted | Update boundary expectations |
| `canonical-validation.test.ts` (2) | Regime/strategy normalization map changed | Update expected normalized values |
| `execution-config.test.ts` (1) | Adaptive position size formula tweaked | Update expected calculation |
| `finalscore-equivalence.test.ts` (1) | NaN handling: throw vs clamp | Update to match current behavior |
| `ml-calibration.test.ts` (1) | signalType casing (Hybrid vs HYBRID) | Fix casing |
| `trailing-exit.test.ts` (1) | Stop price boundary value shifted | Update expected value |
| `sqe-config-dynamic.test.ts` | DB dependency on first call | Add mock or env setup |
| `guardrails-deprecation.test.ts` | Needs DB mock | Add storage mock |
| `telemetry_provenance_patch.test.ts` | Import side effects | Investigate and fix |

## Objective 5: Fix TypeScript Errors in Active Files (~83 files)

Most TS errors fall into these categories:

### 5a: Type Strictness (most common — ~200 errors)
- `'unknown' type` — add proper type annotations or `as` casts
- `possibly null` / `possibly undefined` — add null checks or optional chaining
- `implicit any` — add type annotations to parameters

### 5b: Missing Names/Imports (~50 errors)
- `Cannot find name 'OpenAI'` — dead AI code paths in routes.ts
- `Cannot find name 'semanticMemory'` — removed service reference
- `Cannot find name 'dailyBriefService'` — removed service reference
- Various other dead code references that need cleanup

### 5c: Missing Modules (~10 errors)
- `Cannot find module './orchestrator/orchestrator'` — deleted module
- `Cannot find module './use-baseline-status'` — missing hook

### 5d: Property Mismatches (~50 errors)
- Properties like `stepId`, `bobDomain`, `action`, `params` on task objects — schema evolved
- `getAIErrorLogs` → `getErrorLogs` — method renamed
- `ethicalAuditLog` — table removed from schema
- `tradingMode` on user type — not in schema

---

## SYSTEM_IMPACT_MAP Consultation

Components affected by this batch:

| Impact Map Component | What We're Doing | Risk |
|---------------------|------------------|------|
| Layer 4: Signal Orchestrator | TS fixes only (type annotations) | LOW |
| Layer 6: Paper Execution Engine | TS fixes only | LOW |
| Layer 6: Trading Engine | TS fixes only | LOW |
| Layer 7: VTS Runner/Service | TS fixes only | LOW |
| Layer 9: Boot/Startup | Deleting dead startup.ts (superseded by startup/ dir) | LOW |
| Layer 10: Routes | Dead code cleanup in routes.ts (OpenAI refs, etc.) | LOW |
| Layer 11: Legacy | Deleting more dead legacy files | LOW |

**No trading logic, scoring, filtering, or execution behavior changes.**

---

## Implementation Order
1. Delete dead files (Objectives 1-3)
2. Fix easy test assertions — schema versions (Objective 4a)
3. Fix medium test assertions — friction, API shapes (Objectives 4b-4c)
4. Fix small test assertion mismatches (Objective 4d)
5. Fix TypeScript errors in active files (Objective 5)
6. Verify: `npx tsc --noEmit` exits 0, `npx vitest run` — 0 failures
7. Langston code review
8. Push + CI verification — all 4 green

---

## Non-Goals
- No trading logic changes
- No filter parameter changes
- No schema migrations
- No new features
