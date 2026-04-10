# Batch 55 Scope — FULL Walter/CWQI/NGC Purge + CI Green

> **Date:** 2026-04-10 (updated from 2026-04-09 initial draft)
> **Directive:** Kyle directive — remove ALL Walter, CWQI, and NGC legacy code. Full purge. No deferrals.
> **Branch:** migration/aws-supabase
> **Scope:** WIDE — ~50+ active files across server, client, shared, and tests
> **Risk:** MEDIUM — touches active trading path (quality_index.ts, signal-orchestrator, RTB)

---

## Background

Kyle was told in Batches 5-7B (Feb 2026) that Walter was "fully removed" and in Batch 13 that "NGC was removed." Neither was true:
- Walter service FILES were deleted, but ~23 server files and ~7 client files still contain active Walter code (schema, storage, routes, diagnostics, permissions, provenance)
- NGC function was internally changed to deterministic math but still called `calculateNGC()` — CWQI was never even targeted for removal
- UNIFY-002 (Kyle's directive from Feb 15) was marked "PARTIALLY ADDRESSED" and never revisited

This batch completes what should have been done in Phase 12.

---

## Objectives

### Objective 1: Delete Dead Files (13 files) ✅ DONE (prior session)
Already deleted in prior B55 session: 8 scripts, 3 server services, 2 client AI components.

### Objective 2: Clean Frontend Walter Code (8 files) ✅ DONE (prior session)
Already cleaned: settings.tsx, enhanced-system-monitoring.tsx, top-bar.tsx, auto-resolved-widget.tsx, recent-actions-timeline.tsx, ai-transparency.tsx, ai-opportunities-tab.tsx, InteractiveNotification.tsx.

### Objective 3: Clean RTB + Frontend CWQI→FinalScore (5 files) ✅ DONE (prior session)
Already cleaned: ready_to_buy_service.ts, active-trades-v2.tsx, ready-to-buy-table.tsx, filter-insights.tsx, filters-with-override.tsx.

### Objective 4: Gut quality_index.ts — Remove CWQI/NGC, Keep Active Helpers
**File:** `server/core/metrics/quality_index.ts`

This file is ~850 lines. ~50% is legacy CWQI/NGC infrastructure, ~50% is still-needed signal metric helpers.

**KEEP (rename where needed):**
- `calculateExtendedSignalMetrics()` — called by signal-orchestrator on EVERY signal
- `calculateExpectedReturn()`, `calculateRiskScore()`, `estimateVolatility()`, `estimateExpectedDuration()`, `calculateProfitRate()` — active helper functions
- `calculateNGC()` → RENAME to `calculateDeterministicConfidence()` — the deterministic confidence formula (Directive 12.3.3)
- `MIN_QUEUE_CONFIDENCE` constant (0.55) — used by RTB

**DELETE:**
- `calculateCWQI()`, `calculateCWQIWithPrecomputedMetrics()`, `calculateCWQIFromSignal()` — all three CWQI functions
- `CWQIComponents`, `ExtendedCWQIComponents`, `CWQIResult` interfaces
- CWQI weights: `NGC_WEIGHT`, `RISK_WEIGHT`, `EXPECTED_RETURN_WEIGHT`, `PROFIT_RATE_WEIGHT`
- `compareCWQI()`, `getCWQITier()`, `MIN_QUEUE_CWQI`, `CWQI_FLOOR`
- `SQE_THRESHOLDS` export (SQE has its own in signal_quality_evaluator.ts)
- `RollingNormalizer` class and all rolling normalization infrastructure
- `updateAdaptiveRelevance()`, `getAdaptiveRelevance()`, `resetRollingNormalizers()` — dead code (never imported)
- Adaptive relevance state objects and M3B system
- MetricsConfig / loadMetricsConfig / config/metrics.json loader
- CWQI_DECAY_RATE env var usage
- Remove `cwqi` from the return value of `calculateExtendedSignalMetrics()`

**DELETE ENTIRELY:**
- `server/core/metrics/signal_metrics_calculator.ts` — zero importers, dead code

**Verification:** `grep -c "cwqi\|CWQI\|calculateNGC" server/core/metrics/quality_index.ts` returns 0.

### Objective 5: Clean CWQI/NGC from All Server Consumer Files (~20 files)

| # | File | What to Remove/Change |
|---|------|----------------------|
| 1 | `server/services/signal-orchestrator.ts` | Remove `cwqi` from SizedStrategySignal interface and metric passing |
| 2 | `server/services/paper-execution-engine.ts` | Remove cwqi fallbacks, cwqi parsing, cwqi field assignments |
| 3 | `server/services/paper_validation_engine.ts` | Remove cwqi interface field, cwqi computation, `computeCWQIVariance()` |
| 4 | `server/services/data-aggregator.ts` | Remove avgNGC/avgCWQI from interface and queries |
| 5 | `server/services/validation-session-service.ts` | Remove avgNGC/avgCWQI, CWQI/PnL correlation analysis |
| 6 | `server/services/vts-live-comparison-audit.ts` | Remove CWQI/NGC diff calculations |
| 7 | `server/services/system-audit-engine.ts` | Remove calculateCWQI/calculateNGC imports, `auditCWQINGC()` method |
| 8 | `server/services/strategy-signal-audit-engine.ts` | Remove NGC/CWQI recompute logic |
| 9 | `server/services/back_audit_engine.ts` | Remove `checkCWQI()`, `checkNGC()`, weight validation |
| 10 | `server/services/ml-service-client.ts` | Remove `ngc` from PredictionInput, cache key |
| 11 | `server/services/filter-insights.service.ts` | Remove 'CWQI Gate' from deprecated filters |
| 12 | `server/core/diagnostics/trace_service.ts` | Remove `ngc` from trace metrics |
| 13 | `server/lib/event-bus.ts` | Remove `cwqi` from PromotionEvent interface |
| 14 | `server/routes.ts` | Remove CWQI in FinalRank formula comments, cwqi parsing in routes |
| 15 | `server/routes/vts.ts` | Remove `avgCWQIDiff` from response |
| 16 | `server/legacy/metrics_archive.ts` | Evaluate for deletion — may be entirely dead |
| 17 | `server/services/context-refresh-coordinator.ts` | Remove `updateWalterMemory()` method (~200 lines) |
| 18 | `.eslintrc.json` | Remove CWQI/NGC lint rules (no longer needed) |

**Verification:** `grep -ri "cwqi\|calculateNGC\|calculateCWQI" --include="*.ts" server/` returns 0 hits.

### Objective 6: Full Walter Purge from Schema, Storage, Config (~10 files)

| # | File | What to Remove |
|---|------|----------------|
| 1 | `shared/schema.ts` | 7 Walter enums, 9 Walter tables, 3 settings fields, Walter relations, 13 Walter type exports, insert schemas |
| 2 | `shared/diagnostic-schema.ts` | `'walter_initiated'` trigger type, `'walter'` component type |
| 3 | `server/storage.ts` | ~25 Walter storage methods from IStorage interface + DatabaseStorage implementations |
| 4 | `server/routes.ts` | Active Walter approval code (lines ~15895-15964), Walter audit entries |
| 5 | `server/config/index.ts` | `WALTER_DISABLED` config |
| 6 | `server/config/permissions.ts` | Walter permission types and role definitions |
| 7 | `server/startup.ts` | `WALTER_DISABLED` check |
| 8 | `server/routes/status.ts` | `walterDisabled` in status response |
| 9 | `server/index.ts` | `WALTER_DISABLED` check, conditional ai-opportunities import |

**Verification:** `grep -ri "walter" --include="*.ts" --include="*.tsx" server/ client/src/ shared/` returns 0 active code hits (comments documenting removal are acceptable).

### Objective 7: Clean Remaining Walter Server Code (~12 files)

| # | File | What to Remove |
|---|------|----------------|
| 1 | `server/services/context-refresh-coordinator.ts` | `updateWalterMemory()` method |
| 2 | `server/services/diagnostic-controller.ts` | `triggerWalterDiagnostic()` method |
| 3 | `server/services/provenance-logger.ts` | `'walter'` service layer, `logCortexToWalter()`, `logWalterToUI()`, Walter freshness |
| 4 | `server/services/provenance-governance.ts` | Walter freshness monitoring |
| 5 | `server/services/semantic-correlation.ts` | walterMemory imports and queries |
| 6 | `server/services/context-loader.ts` | `createWalterMemory()` call |
| 7 | `server/services/alert-action-handler.ts` | `'walter_approval'` case |
| 8 | `server/services/autonomy-controller.ts` | `participants.push('Walter')` |
| 9 | `server/services/reasoning-bus.ts` | `agentId: 'Walter'` |
| 10 | `server/services/reasoning-orchestrator.ts` | `targetService: 'walter'` |
| 11 | `server/services/pre-execution-validator.ts` | `targetService: 'walter'` |
| 12 | `server/services/expert-context.ts` | walter_chats reference |
| 13 | `server/diagnostics/analyzer.ts` | Walter diagnostic imports and snapshot |
| 14 | `server/diagnostics/expert-insights-metrics.ts` | Walter usage stats |
| 15 | `server/scripts/duplicate-live-to-paper.ts` | Walter table duplication |

### Objective 8: Clean Remaining Frontend Walter Code (~5 files)

| # | File | What to Remove |
|---|------|----------------|
| 1 | `client/src/components/DailyBriefCard.tsx` | Walter auto-resolved API call and UI section |
| 2 | `client/src/components/system-health-summary.tsx` | "Walter System Activity" label |
| 3 | `client/src/lib/alert-utils.ts` | `'walter_approval'` action type |
| 4 | `client/src/components/trading/ready-to-buy-table.tsx` | NGC column, ngc interface field, ngc sort |
| 5 | `client/src/App.tsx` | Any remaining Walter references |
| 6 | `client/src/components/layout/sidebar.tsx` | Any remaining Walter references |

### Objective 9: Fix Tests Referencing Removed Code

| # | File | Action |
|---|------|--------|
| 1 | `server/tests/diagnostic-system.test.ts` | Remove Test 3 (triggerWalterDiagnostic) |
| 2 | `server/tests/unit/vts-modernization.test.ts` | Verify assertions still valid |
| 3 | `server/tests/unit/directive-11.0E.2.test.ts` | Verify legacy field assertions |
| 4 | `server/tests/unit/tco-tec-tcl.test.ts` | Verify cwqi assertion |
| 5 | `server/tests/integration/schema_v1_5.test.ts` | Update for removed Walter tables |
| 6 | All other failing tests | Fix per CI error output |

**Verification:** `npx vitest run` — 0 failures.

### Objective 10: CI Green
- `npx tsc --noEmit` — no new errors
- `npx vitest run` — 0 failures
- `npm run build` — passes
- All 4 GitHub Actions jobs green

---

## Blast Radius Assessment

| Component | Impact | Risk |
|-----------|--------|------|
| quality_index.ts | GUT — remove CWQI/NGC, keep helpers | **MEDIUM** — active trading path |
| signal-orchestrator.ts | Remove cwqi from metric output | **MEDIUM** — active trading path |
| paper-execution-engine.ts | Remove cwqi fallbacks | **MEDIUM** — active trading path |
| shared/schema.ts | Remove ~150 lines of Walter tables | LOW — tables unused |
| server/storage.ts | Remove ~200 lines of Walter methods | LOW — methods uncalled |
| server/routes.ts | Remove Walter approval code | LOW — dead path |
| All other files | Remove references | LOW |

**Overall Risk: MEDIUM.** The quality_index.ts gut and signal-orchestrator/paper-execution-engine cleanup touch the active signal processing pipeline. Must verify VTS and RTB still function correctly post-deploy.

---

## SYSTEM_IMPACT_MAP Components Affected
- **Signal Metrics Pipeline** (quality_index.ts → signal-orchestrator → SQE → RTB)
- **Paper Execution Engine** (trade insertion and scoring)
- **Schema Layer** (Drizzle ORM table definitions)
- **Storage Layer** (IStorage interface)
- **Diagnostics Subsystem** (analyzer, metrics, controller)
- **Provenance System** (logger, governance)
- **Config/Permissions** (role definitions, startup checks)

---

## Implementation Order
1. ~~Delete dead files~~ ✅ DONE
2. ~~Clean frontend Walter code~~ ✅ DONE
3. ~~Clean RTB + frontend CWQI→FinalScore~~ ✅ DONE
4. Gut quality_index.ts (Objective 4)
5. Clean CWQI/NGC from server consumers (Objective 5)
6. Full Walter purge: schema, storage, config (Objective 6)
7. Clean remaining Walter server code (Objective 7)
8. Clean remaining frontend Walter code (Objective 8)
9. Fix tests (Objective 9)
10. Verify CI green (Objective 10)
11. Langston code review of full diff
12. Push + deploy + staging verification

---

## Non-Goals
- No changes to trading logic, strategy thresholds, or filter parameters
- No changes to VTS, FX5 scanner behavior
- No database migration (Walter DB tables remain — can be DROP'd separately via SQL)
- No changes to docs/archives that mention Walter/CWQI historically
- Comments documenting "B55: removed" are acceptable
