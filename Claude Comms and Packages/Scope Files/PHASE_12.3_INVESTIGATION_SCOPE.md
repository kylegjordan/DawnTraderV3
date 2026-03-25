# Phase 12.3 Pipeline Unification — Investigation Scope

> **Date**: 2026-02-27
> **Author**: Claude Code (System Cartographer)
> **Baseline**: Commit `2064d5c9` | Tests: 800/81 (881 total) | Phase 12.2 Dead Code Purge COMPLETE
> **Purpose**: Blast radius analysis, dependency mapping, safe ordering, and batching recommendations for all remaining Phase 12 directives.

---

## Remaining Directives

| Directive | Title | Risk | Category |
|-----------|-------|------|----------|
| **12.3.1** | Regime Authority Resolution (BUG-006, BUG-008) | HIGH | Pipeline Unification |
| **12.3.2** | Strategy Routing Expansion (17 canonical strategies) | HIGH | Pipeline Unification |
| **12.3.3** | Confidence Authority Cleanup (NGC removal) | HIGH | Pipeline Unification |
| **12.1.6** | LSP Error Triage (RISK-085) | LOW | Technical Debt |

---

## 1. Directive 12.3.1 — Regime Authority Resolution

### Problem
Four parallel regime classification systems with no cross-reference (BUG-008). The active trading path (Signal Orchestrator) uses DSS legacy (Engine 1: 6 regimes, 9 strategies via `SYSTEM_GUARDS.STRATEGY_MAP`) instead of the canonical `calculatePairRegime()` (Engine 2: 5 regimes, 17 strategies). This means pattern and hybrid strategies are never generated (BUG-006).

### The Four Engines

| Engine | File | Regimes | Status | Action |
|--------|------|---------|--------|--------|
| 1 — DSS Legacy | `dynamic-strategy-selector.ts` (213 lines) | 6 (incl. EXTREME_NOISE, BULL_VOLATILE, BEAR_STABLE) | ACTIVE (Signal Orchestrator) | **Deprecate for trading** |
| 2 — calculatePairRegime | `market-regime.ts` (383 lines) | 5 canonical | VTS only | **Promote to sole authority** |
| 3 — getNormalizedRegime | `market-regime.ts` | 5 (Z-Score) | ML advisory | **Preserve** |
| 4 — MCP/ARE | `market-profiler.ts` + `adaptive-regime.ts` | 5 (T1/T2/R1/V1/C1) | Legacy (14+ consumers) | **Do NOT touch** (future removal) |

### Blast Radius

**Direct changes (MUST MODIFY):**

| File | Lines | Change | Risk |
|------|-------|--------|------|
| `signal-orchestrator.ts` | ~1,248 | Replace DSS regime call (line 789) with `calculatePairRegime()`. Replace `getRegimeAllowedStrategies()` (line 1196) to read from canonical map instead of `SYSTEM_GUARDS.STRATEGY_MAP`. Update imports. | CRITICAL — active trading decision path |

**Secondary changes (SHOULD MODIFY):**

| File | Lines | Change | Risk |
|------|-------|--------|------|
| `system-guards.ts` | ~204 | Deprecate `STRATEGY_MAP` with comment (do NOT delete — other consumers reference it) | LOW |
| `dynamic-strategy-selector.ts` | ~213 | Add deprecation header. Leave functional for telemetry/diagnostics. | LOW |

**Test impact:**

| Test File | Impact |
|-----------|--------|
| `dss.test.ts` (13 tests) | Tests legacy DSS behavior — update to validate canonical map OR mark as legacy tests |
| `canonical-validation.test.ts` | Already validates canonical map integrity — no changes needed |
| `vts-modernization.test.ts` | Already tests `calculatePairRegime()` — no changes needed |

**No impact (already correct):**
- `vts-runner.ts` — already uses `calculatePairRegime()`
- `trading-engine.ts` — goal alignment is orthogonal (RISK-028/BUG-012 separate)
- `market-profiler.ts` / `adaptive-regime.ts` — Engine 4 not touched by 12.3.1

### Key Technical Detail
Signal Orchestrator currently receives `MarketRegime` enum (6 values) from DSS. The canonical map uses `CanonicalRegimeType` (5 values). The type boundary conversion happens in Signal Orchestrator — it calls `calculatePairRegime()` which returns `CanonicalRegimeType`, then uses `getStrategiesForRegime()` from the canonical map. No global type rename needed.

### OHLC Data Availability
`calculatePairRegime()` requires OHLC data as input. Signal Orchestrator already has OHLC data available at the point where DSS is called (line 789 context). The VTS runner's usage pattern at lines 308/1097 confirms the function works with the OHLC format already in the pipeline.

### Estimated Effort
- Code changes: ~50-80 lines modified in signal-orchestrator.ts
- Test updates: ~20-30 lines in dss.test.ts
- Governance: Deprecation comments in 2 files
- **Total: MEDIUM effort, HIGH impact**

---

## 2. Directive 12.3.2 — Strategy Routing Expansion

### Problem
The canonical regime-strategy map defines 17 strategies (9 quant + 3 pattern + 5 hybrid), but only 9 quant strategies have complete executable implementations wired into the Signal Orchestrator.

### Strategy Implementation Status

| # | Strategy | Type | Implementation | Wired in Signal Orch | Wired in VTS |
|---|----------|------|---------------|---------------------|-------------|
| 1 | vwap_pullback | QUANT | `strategy-engine.ts:29-128` | YES | YES |
| 2 | vwap_bounce | QUANT | `strategy-engine.ts:575-657` | YES | YES |
| 3 | sma_trend_ride | QUANT | `strategy-engine.ts:238-340` | YES | YES |
| 4 | breakout | QUANT | `strategy-engine.ts:341-418` | YES | YES |
| 5 | mean_reversion | QUANT | `strategy-engine.ts:419-497` | YES | YES |
| 6 | range_trade | QUANT | `strategy-engine.ts:498-574` | YES | YES |
| 7 | abcd_long | QUANT | `strategy-engine.ts:129-237` | YES | YES |
| 8 | liquidity_trap | QUANT | `strategy-engine.ts:658-868` | YES | YES |
| 9 | dhma | QUANT | `strategy-engine.ts:1001+` | YES | YES |
| 10 | morning_star | PATTERN | `pattern-recognizer.ts:305-369` (detection only) | PARTIAL (generic) | YES (via loop) |
| 11 | support_bounce | PATTERN | **NOT IMPLEMENTED** | NO | YES (via loop) |
| 12 | inside_bar_reversal | PATTERN | `pattern-recognizer.ts:225-263` (detection only) | PARTIAL (generic) | YES (via loop) |
| 13 | pivot_shift | HYBRID | **NOT IMPLEMENTED** | NO | YES (via loop) |
| 14 | reverse_impulse | HYBRID | **NOT IMPLEMENTED** | NO | YES (via loop) |
| 15 | defensive_hedge | HYBRID | **NOT IMPLEMENTED** | NO | YES (via loop) |
| 16 | adaptive_flow | HYBRID | **NOT IMPLEMENTED** | NO | YES (via loop) |
| 17 | volatility_edge | HYBRID | **NOT IMPLEMENTED** | NO | YES (via loop) |

### Current Routing Issues
1. **Pattern signals use hardcoded 'breakout' for sizing** (signal-orchestrator.ts line 1034) — patterns are detected via `patternRecognizer.scanPatterns()` but converted to signals generically, not as named strategies.
2. **Hybrid signals are generic** — `HybridIntegrationService.detectConfluence()` produces unnamed "HYBRID" signals, not the 5 named hybrid strategies.
3. **VTS runner already loops all 17** via `getStrategiesForRegime()` (line 1099), but execution depends on implementation existence. Missing implementations likely fail silently or return null.
4. **StrategySignal type union** only includes 9 quant strategies — needs 8 additions.

### Blast Radius (If Implemented)

**New code required:**

| Component | Est. Lines | Files |
|-----------|-----------|-------|
| 3 pattern strategy trade rules | 800-1,200 | `strategy-engine.ts` or new `pattern-strategies.ts` |
| 5 hybrid strategy scoring | 2,000-3,000 | New `hybrid-strategies.ts` |
| Signal Orchestrator routing | 400-600 | `signal-orchestrator.ts` |
| StrategySignal type update | 50-100 | `strategy-engine.ts`, consumers |
| Governance dependency profiles | 150-200 | `strategy-eligibility.ts` |
| Tests | 500+ | New test files |
| **TOTAL** | **3,900-5,700** | |

### Critical Finding
**12.3.2 is NOT a cleanup/unification directive — it's a feature implementation directive.** Writing 8 new strategy implementations (3 pattern + 5 hybrid) is substantial new functionality (~4,000-5,000 lines). This is fundamentally different from the surgical cleanup work of Phase 12.2 and the rewiring work of 12.3.1/12.3.3.

### Recommendation
**Split 12.3.2 into sub-phases** or defer the implementation portion to Phase 13+. The routing infrastructure update (type expansion, Signal Orchestrator wiring) can be done alongside 12.3.1, but the strategy implementations themselves are feature work that belongs in a later phase.

What CAN be done now:
- Expand `StrategySignal` type union to include all 17 names
- Update Signal Orchestrator to route pattern signals with proper strategy names (instead of hardcoded 'breakout')
- Ensure VTS runner handles missing implementations gracefully

What should be DEFERRED:
- Writing 5 hybrid strategy implementations from scratch
- Potentially writing `support_bounce` pattern strategy
- Full test coverage for new strategies

---

## 3. Directive 12.3.3 — Confidence Authority Cleanup (NGC Removal)

### Problem
NGC (Normalized Global Confidence) is a legacy stateful confidence metric that Kyle explicitly confirmed is "a mistake." It flows as the confidence carrier through Signal Orchestrator despite PredictiveConfidence being the intended replacement. Related to UNIFY-002.

### NGC Production & Consumption

**Producer:**
- `quality_index.ts` — `calculateExtendedSignalMetrics()` computes NGC using rolling normalization (stateful, session-dependent, no regime awareness)

**Consumers (8 files):**

| File | Usage | Severity |
|------|-------|----------|
| `signal-orchestrator.ts:405-425` | Calls `calculateExtendedSignalMetrics()`, passes NGC as "confidence" to ML service, RTB queue, SQE | **CRITICAL** — active pipeline |
| `ready_to_buy_service.ts:1039,1492` | `MIN_QUEUE_CONFIDENCE` threshold check (= NGC's `SQE_THRESHOLDS.MIN_NGC` = 0.55) | **MEDIUM** — filters signals |
| `system-audit-engine.ts:213,224` | Imports `calculateCWQI`, `calculateNGC` for validation | **LOW** — diagnostic only |
| `m3b-validation-service.ts:14` | Imports adaptive relevance functions | **LOW** — validation only |
| `paper_validation_engine.ts:18` | Imports adaptive relevance functions | **LOW** — validation only |
| `signal_metrics_calculator.ts:110` | Dynamic import of NGC functions | **LOW** — unused in active flow |
| `m3b.ts (route):10` | Adaptive relevance sync endpoints | **LOW** — manual API only |
| `back_audit_engine.ts` | Diagnostic validation | **LOW** — diagnostic only |

### The Replacement: PredictiveConfidence

**Source:** `server/core/utils/score-calculator.ts` — `getPredictiveConfidence(symbol, regime, strategy)`
- Deterministic (from VTS telemetry winRate)
- Regime-aware and strategy-specific
- Already used by VTS Runner (line 1127+) and ML Calibration
- Formula: `(winRate / 100) * 0.8 + 0.2` (bounded [0.2, 1.0])

### Database Schema Impact
`shared/schema.ts` lines 1249-1252 define NGC/CWQI/profitRate columns on the `ready_to_buy` table. These are deprecated but not yet dropped. Column removal requires a migration.

### Blast Radius

**Code removal scope:**

| File | Changes | Risk |
|------|---------|------|
| `quality_index.ts` (~830 lines) | Remove NGC computation, CWQI, rolling normalizers, adaptive relevance, SQE_THRESHOLDS. Keep `estimateVolatility()` and `calculateRiskScore()` if still consumed. | **HIGH** — largest removal target |
| `signal-orchestrator.ts` | Replace NGC confidence source with `getPredictiveConfidence()`. Remove `calculateExtendedSignalMetrics()` call. | **CRITICAL** — active pipeline |
| `ready_to_buy_service.ts` | Remove `MIN_QUEUE_CONFIDENCE` import and threshold check. FinalScore filter is downstream. | **MEDIUM** |
| `system-audit-engine.ts` | Remove NGC/CWQI imports and validation logic | **LOW** |
| `m3b-validation-service.ts` | Remove adaptive relevance imports | **LOW** |
| `paper_validation_engine.ts` | Remove adaptive relevance imports | **LOW** |
| `signal_metrics_calculator.ts` | Remove dynamic import of NGC functions | **LOW** |
| `m3b.ts` (route) | Remove adaptive relevance endpoints | **LOW** |
| `shared/schema.ts` | Remove NGC/CWQI/profitRate column definitions | **MEDIUM** (requires migration) |

### Key Risk: Signal Orchestrator Confidence Flow
The critical change is in Signal Orchestrator. Currently:
```
calculateExtendedSignalMetrics() → ngc → passed as "confidence" → ML blending → RTB queue
```
After 12.3.3:
```
getPredictiveConfidence(symbol, regime, strategy) → passed as "confidence" → ML blending → RTB queue
```

This requires `regime` and `strategy` to be known at the point where confidence is computed. With 12.3.1 done first (canonical regime available), this is straightforward. **Without 12.3.1, the Signal Orchestrator doesn't have a canonical regime value to pass to `getPredictiveConfidence()`.**

### Estimated Effort
- Code removal: ~600-800 lines across 8 files
- Confidence rewiring: ~30-50 lines in signal-orchestrator.ts
- Schema migration: ~20 lines SQL
- Test updates: Minimal (NGC has no direct unit tests)
- **Total: MEDIUM effort, HIGH impact**

---

## 4. Directive 12.1.6 — LSP Error Triage

### Current State
- Original audit: ~620 TypeScript errors (Jan 2, 2026)
- Estimated after Phase 12.2 purge: **~380-420 errors** (130-200 eliminated by dead code removal)
- Concentrated in `routes.ts` (~211 errors, 20,899 lines) and `storage.ts` (~66 errors, 4,497 lines)
- Primary categories: type annotation gaps, `any` overrides (645 instances in routes.ts), null/undefined parameter issues

### Root Cause
Monolithic file architecture (RISK-048: routes.ts, RISK-076: storage.ts). Fixing type annotations in a 20k-line file is whack-a-mole without decomposition.

### Validation Script Note
`REPLIT_VALIDATION.sh` runs `npx tsc --noEmit` but does NOT require zero errors for batch pass. It only tail -50's the output. This means new errors introduced during batches could be missed.

### Recommendation: DEFER
1. Phase 12.2 already eliminated ~130-200 of the original errors
2. Phase 12.3 will introduce structural changes (regime rewiring, NGC removal) that may create or resolve additional type errors
3. The real fix is routes.ts/storage.ts decomposition (RISK-048/RISK-076), which is Phase 13+ work
4. Pre-existing errors are not blocking development (strict mode catches new errors)

**If Kyle wants partial triage now**: A targeted null/undefined pass on non-monolith files could reduce count by ~40-60 errors with 2-3 hours effort.

---

## 5. Dependency Analysis & Safe Ordering

### Dependency Graph

```
12.3.1 (Regime Authority)
  │
  │  12.3.3 REQUIRES 12.3.1:
  │  getPredictiveConfidence() needs canonical regime
  │  from calculatePairRegime() to compute confidence.
  │  Without canonical regime in Signal Orchestrator,
  │  confidence replacement has no regime input.
  ▼
12.3.3 (NGC Removal)
  │
  │  12.3.2 is INDEPENDENT but benefits from 12.3.1:
  │  Strategy routing expansion needs canonical regime
  │  to be active. The routing infrastructure update
  │  (type expansion) can parallel 12.3.1, but new
  │  strategy implementations are deferred.
  │
12.3.2 (Strategy Routing — routing infra only)

12.1.6 (LSP Triage) — INDEPENDENT, no dependencies, DEFER
```

### Critical Ordering Constraint
**12.3.3 MUST come after 12.3.1.** The replacement for NGC (`getPredictiveConfidence()`) requires three parameters: `symbol`, `regime`, `strategy`. The `regime` parameter must come from `calculatePairRegime()` — which 12.3.1 wires into Signal Orchestrator. Without 12.3.1, there is no canonical regime value available at the confidence computation point in Signal Orchestrator.

### Safe Ordering

```
BATCH 12  ──→  12.3.1 (Regime Authority Resolution)
               Prerequisite for 12.3.3. Medium effort, surgical.
               Resolves BUG-006 and BUG-008 (Engine 1→2 migration).

BATCH 13  ──→  12.3.3 (NGC Removal)
               Depends on 12.3.1. Medium effort, 8 files.
               Resolves UNIFY-002. Removes legacy confidence carrier.

BATCH 14  ──→  12.3.2 (Strategy Routing — infrastructure only)
               Benefits from 12.3.1. Type expansion + routing updates.
               Defer strategy implementations to Phase 13+.

DEFER     ──→  12.1.6 (LSP Error Triage)
               No dependencies. Low priority. Better after Phase 13.
```

---

## 6. Batching Recommendations

### Can 12.3.1 and 12.3.3 be batched together?

**No. Recommended against.**

Rationale:
1. **Different blast radius centers.** 12.3.1 touches the regime classification path (DSS → canonical). 12.3.3 touches the confidence computation path (NGC → PredictiveConfidence). Both converge in Signal Orchestrator, but modifying two critical subsystems simultaneously makes debugging failures harder.
2. **Sequential validation.** After 12.3.1, we can verify regime classification is correct before changing confidence. If both break simultaneously, root cause isolation is difficult.
3. **Test baseline preservation.** Each batch should be independently verifiable against the 800/81 test baseline.
4. **Signal Orchestrator is the highest-risk file in the system.** Every signal flows through it. Making one set of changes, validating, then making the next set is safer than a combined rewrite.

### Can 12.3.2 routing infrastructure be batched with 12.3.1?

**Partially — the type expansion can be included, but not the routing wiring.**

The `StrategySignal` type union expansion (adding 8 new strategy names) is a safe, non-behavioral change. But the Signal Orchestrator routing updates for pattern/hybrid signals should wait until regime authority is verified working.

### Recommended Batch Plan

| Batch | Directives | Focus | Est. Files Changed | Risk |
|-------|-----------|-------|-------------------|------|
| **Batch 12** | 12.3.1 | Regime Authority: Replace DSS with `calculatePairRegime()` in Signal Orchestrator. Deprecate `SYSTEM_GUARDS.STRATEGY_MAP`. | 3-4 files | HIGH (active trading path) |
| **Batch 12B** | — | Governance updates for 12.3.1 | Governance docs | LOW |
| **Batch 13** | 12.3.3 | NGC Removal: Replace NGC confidence with PredictiveConfidence. Remove quality_index NGC functions. Clean 8 consumer files. Schema migration. | 8-10 files | HIGH (confidence pipeline) |
| **Batch 13B** | — | Governance updates for 12.3.3 | Governance docs | LOW |
| **Batch 14** | 12.3.2 (partial) | Strategy Routing Infrastructure: Expand StrategySignal types. Fix pattern signal naming. Update Signal Orchestrator pattern routing. | 3-5 files | MEDIUM |
| **Batch 14B** | — | Governance updates for 12.3.2 | Governance docs | LOW |
| **DEFER** | 12.1.6 | LSP Error Triage | — | — |
| **DEFER** | 12.3.2 (full) | Strategy implementations (8 new strategies) | Phase 13+ feature work | — |

---

## 7. RISK-028 / BUG-012 (Goal Alignment) — Status Check

The Phase 4 Goal Alignment code is **still present** in two files:
- `pre-execution-validator.ts` — `computeGoalAlignmentScore()`, strategyRiskProfile map, goal alignment gate
- `trading-engine.ts` lines 128-254 — `calculateGoalAlignmentScore()`, 30% weight on FinalScore

Note: The Phase 9.0 Goal Alignment system (alignment-verifier.ts, strategic-policy-guard.ts) was removed in Batch 11 (Directive 12.2.6). The Phase 4 code is a **separate, older system** that remains.

**Interaction with 12.3.x:** Goal alignment is orthogonal to regime authority and NGC confidence. It does not block or depend on any 12.3.x directive. It could be removed as a standalone cleanup at any point. Trading Engine is currently DORMANT (no live trades executing), so the BUG-012 impact is theoretical.

**Recommendation:** Bundle RISK-028/BUG-012 removal with a future batch (potentially Batch 14 alongside 12.3.2) or defer to Phase 13. Not urgent.

---

## 8. Summary Decision Points for Kyle

1. **Safe ordering confirmed:** 12.3.1 → 12.3.3 → 12.3.2 (infrastructure) → 12.1.6 (defer)

2. **12.3.1 first?** This is the logical starting point — prerequisite for 12.3.3, medium effort, surgical changes in Signal Orchestrator.

3. **12.3.2 scope reduction?** Full strategy implementation (~5,000 lines) is feature work. Recommend limiting 12.3.2 to routing infrastructure (type expansion + pattern signal naming fix) and deferring strategy implementations to Phase 13+.

4. **12.1.6 defer?** Recommend defer until after Phase 12.3 and routes.ts decomposition. Phase 12.2 already reduced error count by ~130-200.

5. **RISK-028/BUG-012 timing?** Goal alignment removal is standalone and low urgency. Bundle opportunistically or defer.

6. **MCP/ARE (Engine 4) — NOT in scope.** Engine 4 has 14+ consumer services and requires MCE-era removal. Kyle confirmed this is future work. 12.3.1 only touches Engine 1→2 migration.

---

*Prepared for Kyle's review before any implementation begins. Awaiting approval to begin Batch 12 (Directive 12.3.1).*
