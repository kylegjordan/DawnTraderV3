# DawnTrader: Legacy & Deprecation Removal Plan

> **Author**: Claude Code (System Cartographer)
> **Created**: 2026-02-15
> **Purpose**: Tracks all legacy, deprecated, and dead code identified during audit. Each item includes removal difficulty, dependency risks, and recommended removal order.
> **This is NOT the System Manual.** This is the removal roadmap.

---

## How This Document Is Used

- Items are added during each audit phase as legacy code is identified
- Each item gets a difficulty rating (EASY/MODERATE/HARD/DANGEROUS)
- Items marked EASY can be batched into a single cleanup directive
- Items marked HARD or DANGEROUS need individual directives with careful testing
- Kyle approves removal order and timing

---

## Difficulty Ratings

| Rating | Meaning |
|--------|---------|
| **EASY** | No active importers, no downstream effects. Safe to delete. |
| **MODERATE** | Has importers but they are also legacy, or imports can be trivially removed. |
| **HARD** | Has active importers that need refactoring before removal. |
| **DANGEROUS** | Deeply integrated, removal could silently break active functionality. |

---

## CONFIRMED DEAD SYSTEMS

### Walter/Bob AI System (Including Cortex)
- **File Count**: ~96 files (~90 Walter/Bob + 6 Cortex)
- **Location**: `server/services/walter-*.ts`, `server/services/bob-*.ts`, `server/services/bobs/*`, `server/services/cortex/`
- **Difficulty**: MODERATE — Large surface area but believed to be disconnected from trading pipeline
- **Risk**: Some Walter files are lazy-loaded in `server/index.ts` (e.g., `walter-health-monitor`). The **Cortex system** (see below) is ACTIVE at runtime and must be removed as part of this wave. Need to verify no initialization side effects.
- **Recommended**: Batch removal in a single directive after verifying no active imports. Cortex removal must be included.
- **Status**: Dead per Kyle
- **Phase Found**: Pre-audit (Cortex discovered post-audit 2026-02-17)

### Cortex System — Active Walter/Bob Dependency (MUST Remove with Wave 3)
- **File Count**: 6 files
- **Location**: `server/services/cortex/cortex-core.ts` (393 lines), `cortex-config.yaml` (20 lines), `cortex-memory.json`, `cortex-registry.json`, `analytics-scheduler.ts` (250 lines)
- **What**: In-memory caching/orchestration layer between Bob modules and Walter. Maintains TTL-based memory cache, performs snapshot syncs, runs 15-minute analytics cycle. Data flow: Bob Services → Cortex → Walter.
- **API Endpoints**: 4 endpoints to remove — `/api/cortex/status`, `/api/cortex/snapshot`, `/api/cortex/flush`, `/api/cortex/force-sync`
- **Consuming Services (9+)**: `config-change-handler.ts`, `context-refresh-coordinator.ts`, `contextual-nlai-interpreter.ts`, `corpus-domain-service.ts`, `phase-8.6.5-enhancements.ts`, `purpose-layer.ts`, `bob-config.ts`, `autonomy-controller.ts`, `system-truth-diagnostic.ts`
- **Difficulty**: MODERATE — 6 files are self-contained, but 9+ consuming services must be audited and decoupled. Active at runtime (initialized via lazy-loader.ts at startup).
- **Risk**: If Walter/Bob are removed without Cortex, it will continue running silently — consuming memory, executing analytics cycles, maintaining stale data with no consumers.
- **Recommended**: Remove Cortex files, 4 API routes, and decouple all 9+ consuming services as part of Wave 3 Walter/Bob removal.
- **Status**: ACTIVE system, architectural dependency on Walter/Bob — must be removed together
- **Phase Found**: Post-audit investigation (2026-02-17)

### LATTi
- **File Count**: ~12 files
- **Difficulty**: EASY — believed fully disconnected
- **Status**: Dead per Kyle
- **Phase Found**: Pre-audit

### ARA (Adaptive Risk Advisor)
- **File Count**: Multiple
- **Difficulty**: TBD — needs importer audit
- **Status**: Dead per Kyle
- **Phase Found**: Pre-audit

### Multi-User System
- **File Count**: Multiple
- **Difficulty**: TBD
- **Status**: Dead — single-user only now
- **Phase Found**: Pre-audit

### Strategy Presets
- **Difficulty**: TBD
- **Status**: Dead
- **Phase Found**: Pre-audit

### Goals ML Engine
- **Difficulty**: TBD
- **Status**: Dead
- **Phase Found**: Pre-audit

### MCP/ARE (Market Condition Profiler / Adaptive Regime Engine) — Kyle Confirmed Legacy
- **File Count**: 2 core files + 14+ consumer services that import from them
- **Location**: `server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`
- **Directive**: 8.8.4-L12 (LOCKED)
- **Difficulty**: DANGEROUS — 14+ active importers including autonomy-scheduler, action-executor, APR-SLE engine, MACO coordinator, GASP coordinator, experience-buffer, reward-evaluator, proactive-allocator, market routes, health routes, regime-performance tracker, regime archiver, regime-stability governance
- **Historical Context**: Built Dec 27, 2025 as original regime-to-strategy system. Immediately locked. Canonical regime map (Directive 11.7F, Jan 2026) and DSS were built to replace it. Lock made MCP/ARE invisible during architectural evolution — left running in background while newer systems were built alongside it. Has its own regime taxonomy (T1/T2/R1/V1/C1), its own hardcoded strategy mix matrix, its own exposure/risk multipliers, and stubbed metrics (`volume_z = 0`, `correlation = 0.5`). None of these reference or align with the canonical map.
- **Kyle Decision (2026-02-16)**: "It was never the intention to have two systems creating signals and making adjustments to signal generation." MCP/ARE must be removed entirely.
- **Risk**: 14+ consumer services must be migrated to consume `calculatePairRegime()` output or MCE output. Any portfolio-level exposure/risk modulation must be absorbed by MCE or rebuilt as a lightweight module consuming canonical regime output. Regime-performance tracker, regime archiver, and regime-stability governance all use MCP's T1-C1 taxonomy and must be updated.
- **Recommended**: Full removal during/after MCE install (Wave 6). Requires staged migration: (1) audit all 14+ consumers, (2) build replacement exposure/risk module on canonical regimes, (3) migrate consumers, (4) remove MCP/ARE files.
- **Status**: Legacy per Kyle (2026-02-16)
- **Phase Found**: Phase 2

### DHMA Tuning Service
- **Difficulty**: TBD
- **Status**: Dead
- **Phase Found**: Pre-audit

### Goal Alignment Logic — Kyle Confirmed Deprecated (ALL Locations, ALL References)
- **Location 1**: `server/services/pre-execution-validator.ts` — goal alignment gate (gate #2 of 3)
- **Location 2**: `server/services/trading-engine.ts` lines 128-254 — `calculateGoalAlignmentScore()` method
- **What**: Computes alignment score based on user-set `profitability_vs_consistency` goal (1-10 scale). Only 3 of 17 strategies have risk profiles; rest default to 0.5/0.5. Legacy from Walter-era Goals system.
- **Kyle Decision (2026-02-16)**: Formally deprecated. Goals tab already removed from UI. Must be **REMOVED entirely** — not defaulted, not skipped, DELETED.
- **Kyle Expanded Scope (Phase 5 Addendum)**: System should not reference daily return targets, weekly targets, win rate targets, or conversational goals. These are Walter-era features and no longer part of DawnTrader architecture.
- **Difficulty**: EASY — both locations are self-contained
- **Removal scope**: `computeGoalAlignmentScore()` in pre-execution-validator.ts, `calculateGoalAlignmentScore()` in trading-engine.ts, `strategyRiskProfile` maps, goal alignment gate logic, Walter/Bob provenance references, `goalAlignmentScore` field in TradeSignal interface, `profitability_vs_consistency` field in system_context (if no other consumers).
- **Status**: Formally deprecated per Kyle (2026-02-16, expanded in Phase 5 Addendum)
- **Phase Found**: Phase 4 Addendum (Location 1), Phase 5 (Location 2 — BUG-012)

### NLAI System (Natural Language Action Interpreter) — Kyle Confirmed Deprecated
- **File Count**: 5+ core files + routes + event handlers
- **Location**: `server/services/nlai-interpreter.ts`, `contextual-nlai-interpreter.ts`, `nlai-execution-broker.ts`, `nlai-action-registry.ts`, `execution-policy-controller.ts`
- **What**: NLAI was Walter AI's command bridge. It parsed chat commands, routed them through the execution broker, called the same service functions UI buttons call (guardrails, goals, watchlist, start/stop trading), and published events.
- **What NLAI did NOT do**: Did not inject signals, modify scoring, alter VTS, or override execution math. Architecturally safe and scoped.
- **Why deprecated**: Walter has been deprecated. Conversational goal system removed. Goals tab removed. System now operates via deterministic UI and services. NLAI is legacy conversational control infrastructure, no longer aligned with system direction.
- **Kyle Decision (2026-02-16)**: Formally deprecated. Remove entirely.
- **Removal scope**:
  - `nlai-interpreter.ts` — core interpreter
  - `contextual-nlai-interpreter.ts` — contextual variant
  - `nlai-execution-broker.ts` — action dispatch
  - `nlai-action-registry.ts` — action registry
  - `execution-policy-controller.ts` — approval hooks (NLAI-only consumer)
  - NLAI-related cluster bus events
  - NLAI-related API routes
  - Goal-update command handlers
  - Residual Walter-specific context logic
- **Difficulty**: EASY to MODERATE — files are scoped. ExecutionPolicyController must be verified as NLAI-only before removal.
- **Future note**: ML integration may reintroduce command routing, but will be deliberate and redesigned.
- **Status**: Formally deprecated per Kyle (2026-02-16)
- **Phase Found**: Phase 5 Addendum

---

## ACTIVE CODE PATH CONTAMINATION (Legacy Fields in Active Code)

### signal-orchestrator.ts Legacy Fields
- `SizedStrategySignal` interface: `ngc?`, `cwqi?`, `riskScore?`, `profitRate?` fields
- **Difficulty**: EASY — remove optional interface fields
- **Risk**: UI/logging may reference these fields. Audit consumers first.
- **Phase Found**: Pre-audit

### signal-orchestrator.ts Legacy Strategy Map
- `getRegimeAllowedStrategies()` uses `SYSTEM_GUARDS.STRATEGY_MAP`
- **Difficulty**: HARD — replacing this is MCE work, not a simple deletion
- **Phase Found**: Pre-audit

### system-guards.ts STRATEGY_MAP
- Contains legacy 5-regime mapping with 9 quant-only strategies
- **Difficulty**: HARD — 22+ importers of system-guards.ts. STRATEGY_MAP removal must be coordinated with MCE migration.
- **Phase Found**: Pre-audit

### RiskManager Class — Deprecated but Not Removed (Replit LSP Audit Finding)
- **File**: `server/services/risk-manager.ts`
- **Deprecated since**: Phase 8.8.3-H4
- **Replacement**: `checkGuardrailRisk()` from `trade-safety.ts`
- **12 import locations across 7 files**:
  - `server/routes.ts` (lines 13, 88, 12793, 12796)
  - `server/test-guardrails.ts` (lines 14, 34)
  - `server/services/paper-sim-diagnostic.ts` (lines 8, 69, 74)
  - `server/services/heuristic-trader.ts` (lines 124-125 — dynamic import)
  - `server/services/behavioral-template.ts` (lines 3, 5)
  - `server/services/trading-state-sync.ts` (lines 211-212 — dynamic import)
  - `server/services/daily-brief.ts` (lines 2, 39, 42)
- **Difficulty**: MODERATE — 12 locations across 7 files. Replace each with `checkGuardrailRisk()` or equivalent V2 API, then delete `risk-manager.ts`.
- **Timing**: Pre-MCE or during Wave 3 cleanup
- **Phase Found**: Replit LSP audit (Dec 2025), cross-referenced Feb 2026

---

## AUDIT-REQUIRED SYSTEMS

### DCE (Decision Confidence Engine)
- **File**: `server/services/decision-confidence-engine.ts`
- **Importer Count**: 12
- **Difficulty**: DANGEROUS
- **Key Risk**: APR-SLE Engine imports `getDecisionConfidenceEngine()` and uses `dce.getStatus().meanDI` for adaptive exit calculations. Removal would silently degrade exit behavior to fallback defaults (di=0.5).
- **Full Dependency List**: gasp-coordinator, pdc-engine, autonomy-scheduler, paper_validation_engine, back_audit_engine, m3b-validation-service, performance-aggregator, routes/dce, routes/health, routes/m3b, apr-sle-engine
- **Recommended**: Full trace of all 12 importers required before any deprecation. APR-SLE dependency must be resolved first.
- **Phase Found**: Pre-audit, deepened in Phase 1

---

## PHASE 1 LEGACY FINDINGS

### NGC / quality_index.ts — Entire System Is Legacy (Kyle Confirmed)
- **What**: NGC is a legacy metric that was NOT fully removed when it should have been. Kyle confirmed: "Anywhere where we have NGC in the code is a mistake. NGC is not a calculation that we want to be using anymore."
- **File**: `server/core/metrics/quality_index.ts`
- **Difficulty**: HARD — NGC is deeply wired into the active pipeline:
  - Flows as `confidence` carrier in signal-orchestrator.ts (line 497)
  - Feeds FinalScore via `hybridScore ?? confidence` fallback
  - Gets converted to fake DI at line 1128 (`DI = normalizedConf * 100`) feeding the kernel
  - Contains rolling normalization infrastructure (3 instances, VTS-coupled)
  - Called by `calculateExtendedSignalMetrics()` during signal generation
- **Importer Audit Needed**: signal-orchestrator.ts, SQE, RTB refresh, VTS, and any other consumers of NGC
- **Timing**: During MCE — replace with PredictiveConfidence as sole confidence authority
- **Phase Found**: Phase 1 (Kyle-confirmed 2026-02-15)

### Rolling Normalization Infrastructure — Legacy (Part of NGC System)
- **What**: Three RollingNormalizer instances (NGC, ProfitRate, ExpectedReturn) in quality_index.ts with stateful 500-sample/60-minute sliding windows. Smoothing driven by VTS learning parameters.
- **Difficulty**: MODERATE — contained within quality_index.ts but the adaptive relevance linkage reaches into VTS
- **Why It's Legacy**: Serves NGC, which is legacy. Introduces temporal drift, distribution compression, and reproducibility issues.
- **Timing**: Remove alongside NGC. If ProfitRate/ExpectedReturn normalization still needed, use deterministic fixed boundaries.
- **Phase Found**: Phase 1 (Kyle-confirmed 2026-02-15)

### CWQI Gating Logic (Already Removed from SQE)
- **What**: CWQI was removed from SQE gating per Directive 11.0E
- **Remaining**: quality_index.ts still computes CWQI, and the `SQE_THRESHOLDS` object still exports `MIN_CWQI`, `MIN_NGC`, `MAX_RISK`, `MIN_PROFIT_RATE`. These exported constants are not enforced.
- **Difficulty**: EASY — remove unused threshold exports
- **Phase Found**: Phase 1

### Strategy Signal Audit Engine — Uses Legacy NGC/CWQI/DI Definitions
- **What**: `strategy-signal-audit-engine.ts` recomputes NGC, CWQI, and DI using simplified formulas that do not match the actual pipeline. Since NGC is legacy (Kyle-confirmed), this entire audit engine's purpose of verifying NGC/CWQI/DI coherence is questionable.
- **Difficulty**: EASY — remove or rebuild when NGC is removed
- **Timing**: During MCE — rebuild to validate PredictiveConfidence instead
- **Phase Found**: Phase 2

### SYSTEM_GUARDS.BASE_FEE_SLIPPAGE — Incorrect Friction Model (Kyle Confirmed)
- **What**: `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE = 0.005` (flat 0.5%) is used by `calculateFriction()` in analysis-utils.ts and at signal-orchestrator.ts line 1122. This is an incorrect friction model.
- **Correct model**: `computeTotalRoundTripCost()` from cost-model.ts: `(fee × 2) + (slippage × 2) + spread`
- **Difficulty**: MODERATE — multiple consumers of BASE_FEE_SLIPPAGE need migration to cost-model
- **Files Affected**: analysis-utils.ts (`calculateFriction`, `calculatePerUnitFriction`, `getFrictionRate`), signal-orchestrator.ts (line 1122), potentially others
- **Timing**: During MCE or pre-MCE if standalone fix is feasible
- **Phase Found**: Phase 1 (Kyle-confirmed 2026-02-15)

## PHASE 2 LEGACY FINDINGS

### DSS Legacy Regime Classification (Engine #1) — Must Be Replaced
- **What**: `dynamic-strategy-selector.ts` uses `volNoise` + `trendSlope` raw thresholds to classify into 6 legacy regimes, then routes via `SYSTEM_GUARDS.STRATEGY_MAP` (9 quant strategies only). Z-Scores are computed via RollingStats(300) but **IGNORED** for classification.
- **Consequence**: Only QUANT signals are generated. Pattern and Hybrid strategies are dead code. VTS and active trading classify regimes using completely different math.
- **Difficulty**: MODERATE — replace regime classification with `calculatePairRegime()` call, replace strategy map import with canonical map
- **Files Affected**: dynamic-strategy-selector.ts, signal-orchestrator.ts (any regime-dependent logic)
- **Timing**: Pre-MCE — foundational fix (BUG-006)
- **Phase Found**: Phase 2 (Kyle-confirmed 2026-02-16)

### SYSTEM_GUARDS.STRATEGY_MAP — Legacy Regime/Strategy Routing (Kyle Confirmed)
- **What**: The legacy strategy map used by DSS. 6 regimes, 9 quant strategies, wrong thresholds.
- **Difficulty**: HARD — 22+ importers of system-guards.ts. STRATEGY_MAP removal must be coordinated with DSS rewiring.
- **Timing**: Pre-MCE — remove alongside DSS rewiring (Wave 2)
- **Phase Found**: Phase 2 (Kyle-confirmed 2026-02-16)

### Legacy Hybrid Strategy Types in hybrid-integration.ts
- **What**: `selectHybridStrategy()` maps to H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, H4_MOMENTUM_LINK — these don't exist in the canonical map
- **Canonical replacements**: pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge
- **Difficulty**: MODERATE — method needs rewrite to use canonical definitions
- **Timing**: Concurrent with DSS rewiring
- **Phase Found**: Phase 2

### Strategy Sync Missing Pattern/Hybrid Strategies
- **What**: `strategy-sync.ts` CORE_STRATEGIES only includes 8 quant strategies, missing 3 pattern + 5 hybrid
- **Difficulty**: EASY — update array to use `getAllCanonicalStrategies()` from canonical map
- **Timing**: Concurrent with DSS rewiring
- **Phase Found**: Phase 2

### MCP/ARE — Legacy Predecessor System, Full Removal Required (Kyle Confirmed)
- **What**: MCP/ARE is the predecessor regime-to-strategy system (Directive 8.8.4-L12, Dec 27, 2025) that was never decommissioned when the canonical map (Directive 11.7F, Jan 2026) was built to replace it. The LOCK designation made it invisible during architectural evolution. Multiple issues confirm its legacy status:

  1. **Own strategy mix matrix** (`REGIME_STRATEGY_MATRIX`) applies independent weighting that conflicts with canonical strategy selection (RISK-016)
  2. **Stubbed metrics**: `volume_z = 0` and `correlation = 0.5` — never computed, system locked before implementation finished (RISK-019)
  3. **Taxonomy divergence**: T1/T2/R1/V1/C1 names have no mapping to canonical 5-regime names (RISK-020)
- **Kyle Decision (2026-02-16)**: MCP/ARE is LEGACY. It was never the intention to have two systems creating signals and making adjustments to signal generation. Must be removed entirely.
- **Difficulty**: DANGEROUS — 14+ active importers requiring staged migration
- **Files Affected**: `market-profiler.ts`, `adaptive-regime.ts`, plus 14+ consumer services
- **Timing**: During/after MCE (Wave 6)
- **Phase Found**: Phase 2 (Claude Code deep trace, ChatGPT/Replit verification, Kyle-confirmed legacy 2026-02-16)

---

## PHASE 4 LEGACY FINDINGS

### SafetyGuardrails Service — DEPRECATED Wrapper (Phase 8.8.3-H8)
- **What**: The `SafetyGuardrailsService` class in `server/services/safety-guardrails.ts` was the original safety enforcement layer. All runtime authority was migrated to `guardrails_v2` table + `trade-safety.ts` + `guardrail-policy.ts` in Phase 8.8.3-H4/H8.
- **Current state**: All methods are marked `@deprecated`. Kill switch methods (`getKillSwitchStatus`, `toggleKillSwitch`) now delegate to `guardrailPolicy`. `evaluateAction()` still queries the legacy `safetyPolicy` table but should NOT be used for runtime decisions.
- **Why it persists**: Kept for backward compatibility with admin API routes (`/api/safety/*`).
- **Difficulty**: MODERATE — admin API routes need migration to call `guardrailPolicy` directly
- **Timing**: During API cleanup (Phase 8 audit will reveal exact routes)
- **Phase Found**: Phase 4

### GASP Coordinator — LEGACY (L-Series Autonomy Cluster, Kyle Confirmed 2026-02-16)
- **What**: `gasp-coordinator.ts` was originally classified as ACTIVE with legacy dependency risk (RISK-027). Kyle's Phase 4 Addendum confirmed GASP itself is legacy — part of the L-Series Autonomy Cluster.
- **Why it's legacy**: GASP supervises MOF/MACO/ECS, computes GSI, and applies dampening. But it does NOT touch the active trade flow — it has no connection to Signal Orchestrator, TradeSafety, DSE, VTS, or Execution Engine. It forms a closed supervisory loop with other L-Series systems.
- **Previous concern (RISK-027 — SUPERSEDED)**: The original concern was about GASP's metric sources degrading when legacy systems were removed. This is now moot — GASP and all its sources will be removed together.
- **Difficulty**: MODERATE — part of coordinated L-Series cluster removal
- **Timing**: During L-Series cluster removal wave
- **Phase Found**: Phase 4 (reclassified by Phase 4 Addendum)

### PDC Engine — LEGACY (If Autonomy-Bound, L-Series Cluster)
- **What**: `pdc-engine.ts` computes Drawdown Risk Score (DRS) from equity slope, volatility ratio, and DI decay. Depends on DCE for DI data and feeds DRS to GASP.
- **Why potentially legacy**: Kyle listed "PDC (if still autonomy-bound)" in the L-Series cluster. PDC's primary consumers appear to be GASP (which is legacy) and the autonomy scheduler. If no active execution path (SO, TradeSafety, DSE, VTS) consumes DRS directly, PDC is confirmed legacy.
- **Verification needed**: Grep for PDC/DRS imports in active execution path files before confirming.
- **Difficulty**: MODERATE — part of coordinated L-Series cluster removal
- **Timing**: During L-Series cluster removal wave
- **Phase Found**: Phase 4 (flagged by Phase 4 Addendum)

### L-Series Autonomy Cluster — Entire System Confirmed Legacy (Kyle, 2026-02-16)
- **What**: The entire L-Series autonomy cluster (~13 systems) has been confirmed as architecturally inert. These systems form a closed supervisory loop that does NOT feed into any active execution component (Signal Orchestrator, TradeSafety, DSE, VTS, Execution Engine).
- **Systems included**: MCP, ARE, GASP, MOF, MACO, ECS, DCE, Experience Buffer, Reward Evaluator, Proactive Allocator, Equilibrium Restorer, APR-SLE, PDC (if autonomy-bound)
- **Historical context**: Built under Directive 8.8.4-L12 and subsequent L-series directives (Dec 2025 - Jan 2026). Superseded by canonical regime map (Directive 11.7F) and DSS. Never decommissioned — LOCK designations made these systems invisible during architectural evolution.
- **Why one wave**: Kyle directed that all L-Series systems must be removed together in a coordinated wave (not scattered across Waves 5-7 as originally planned). Before removal: (1) confirm no hidden execution paths, (2) confirm no Signal Orchestrator imports, (3) confirm no DB migration dependencies.
- **Difficulty**: DANGEROUS — 14+ consumer services of MCP/ARE alone, plus cross-dependencies between L-Series systems
- **Timing**: Dedicated L-Series removal wave (see updated removal order)
- **Phase Found**: Phase 4 Addendum

### Goal Alignment Logic — Formally Deprecated (Kyle, 2026-02-16) — TWO LOCATIONS
- **What**: Goal alignment gate computes alignment score from user goals. Only 3 of 17 strategies have profiles. Legacy from Walter-era Goals system.
- **Kyle directive**: Must be REMOVED entirely — not defaulted, not expanded, DELETED. Goals tab already removed from UI.
- **Location 1**: `server/services/pre-execution-validator.ts` — goal alignment gate (gate #2 of 3)
  - Removal scope: `computeGoalAlignmentScore()`, `strategyRiskProfile` map, goal alignment gate logic
  - Difficulty: EASY — self-contained
- **Location 2 (PHASE 5 DISCOVERY)**: `server/services/trading-engine.ts` lines 128-254
  - Contains independent `calculateGoalAlignmentScore()` method (100+ lines)
  - Applied at line 249: `signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3)`
  - Only covers 3 strategy profiles: vwap_pullback, abcd_long, sma_trend_ride
  - Removal scope: `calculateGoalAlignmentScore()` method, finalScore computation, `goalAlignmentScore` field usage
  - Difficulty: EASY — self-contained
- **Total difficulty**: EASY — both locations are self-contained
- **Timing**: Pre-MCE or during MCE — **both locations must be removed together**
- **Phase Found**: Phase 4 Addendum (Location 1), Phase 5 (Location 2 — BUG-012)

---

## PHASE 3 LEGACY FINDINGS

### MarketScanner Class (10-Minute Scanner) — ACTIVELY RUNNING (BUG-009)
- **What**: The `MarketScanner` class (lines 385-1013 of `market-scanner.ts`) is the original 10-minute market scanner that was supposed to be superseded by the FX5 30-second batch scanner. File comments state "TODO: Remove in Phase 8.12" — but removal was never executed.
- **CRITICAL**: This is NOT dead code. Code verification confirms:
  - `server/routes.ts` line 87: `const marketScanner = new MarketScanner();` — instantiated at module scope
  - `server/routes.ts` line 371: `marketScanner.startHourlyScanning()` — actively started during boot
  - `server/startup.ts` lines 36, 57: Listed as core initialized service in health checks
- **Result**: DawnTrader runs TWO parallel scanning systems (FX5 30s + MarketScanner 10m) with double Kraken API load, conflicting signal generation through separate pipelines, and conflicting cleanup operations.
- **Key legacy patterns (still actively executing)**:
  - 10-minute interval (vs FX5's 30-second)
  - Per-user watchlist management (legacy multi-user architecture)
  - Direct strategy engine calls (generates signals through StrategyEngine, bypassing Signal Orchestrator)
  - Only evaluates 8 quant strategies (not 17 canonical)
  - Auto-start paper simulation (disabled: Phase 41F-L.E2E-PURGE, but scanner still runs)
  - Sequential OHLC fetch per pair (vs FX5's batch approach)
  - Own cleanup routines (expire signals, clean stale pairs, archive old trades)
- **Difficulty**: MODERATE — remove instantiation from `routes.ts`, remove from `startup.ts` service list. The `collectAdaptiveBatch()` function in the same file is ACTIVE and must NOT be removed. The REB diagnostic buffer exports imported by `routes.ts` must also be preserved.
- **Timing**: Pre-MCE — standalone fix, high priority (BUG-009)
- **Phase Found**: Phase 3 (ChatGPT review correction — initial audit incorrectly classified as dead code)

### REB 2.10/2.11 Diagnostic Infrastructure — API-Exposed Development Tooling
- **What**: Extensive diagnostic type definitions, buffer management, and stress test infrastructure in `market-scanner.ts` (lines 1-341). Includes:
  - REB 2.10: Passive Learning Deep Tests (20-entry buffer)
  - REB 2.11: Pool stability validation with drift, integrity, timing, stress, mismatch buffers
  - REB 2.11A: Active Pool audit for already-active counting accuracy
  - REB 2.11B: Symbol mapping trace (format resolution tracking)
  - Stress test config (`REB_2_11_STRESS` environment variable): synthetic load testing with 10-40ms artificial latency
- **API exposure verified**: All diagnostic buffers are actively served via API routes in `server/routes.ts` (lines 6463-6607). Also imported by `reb-2-12-test-harness.ts` and `reb-2-15-certification.ts`.
- **Memory**: Buffers are FIFO-capped (20 entries for most, 100 for mismatches, 400 for symbol traces). Memory growth is bounded.
- **Risk**: Stress test mode (`REB_2_11_STRESS`) injects 10-40ms artificial latency into scan cycles. Must ensure this env var is never set in production.
- **Difficulty**: MODERATE — API routes import these buffers directly. Removal requires API route cleanup.
- **Decision needed**: Retain for future validation or remove as dead weight? If MarketScanner class is removed (BUG-009), these buffers and their API routes should be evaluated separately since some may still be useful for FX5 diagnostics.
- **Timing**: TBD — needs decision from Kyle
- **Phase Found**: Phase 3

---

## PHASE 5 LEGACY FINDINGS

### TradingEngine Goal Alignment — Second Location of Deprecated Logic (BUG-012)
- **What**: `trading-engine.ts` contains a completely independent implementation of Goal Alignment computation. The `calculateGoalAlignmentScore()` method (lines 128-226) reads user goals, computes risk/reward alignment, strategy profile alignment, and confidence alignment with the same 3-strategy profile limitation as pre-execution-validator.ts.
- **Why it's legacy**: Goal Alignment is formally deprecated per Kyle (Phase 4 Addendum). The TradingEngine applies it at 30% weight to FinalScore, overriding canonical FinalScore from SQE.
- **Difficulty**: EASY — `calculateGoalAlignmentScore()` method is self-contained. Remove the method, remove the call at line 247-249, and pass `signal.finalScore` through unchanged (or use confidence directly).
- **Timing**: Pre-MCE — bundled with Wave 4.5 Goal Alignment removal
- **Phase Found**: Phase 5

### NLAI System — Formally Deprecated (Kyle, Phase 5 Addendum, 2026-02-16)
- **What**: NLAI (Natural Language Action Interpreter) was the Walter AI command bridge. It parsed chat commands, routed them through the execution broker, and called service functions for guardrails, goals, watchlist, and start/stop trading.
- **Why it's legacy**: Walter has been deprecated. Conversational goal system removed. Goals tab removed. System now operates via deterministic UI and services. NLAI is legacy conversational control infrastructure, no longer aligned with system direction.
- **Files to remove**:
  - `nlai-interpreter.ts` — core interpreter
  - `contextual-nlai-interpreter.ts` — contextual variant
  - `nlai-execution-broker.ts` — action dispatch (~477 lines)
  - `nlai-action-registry.ts` — action registry
  - `execution-policy-controller.ts` — approval hooks (~309 lines, NLAI-only consumer)
  - NLAI-related cluster bus events
  - NLAI-related API routes
  - Goal-update command handlers
  - Residual Walter-specific context logic
- **Safety note**: NLAI does NOT inject signals, modify scoring, alter VTS, or override execution math. Removal is architecturally safe.
- **Difficulty**: EASY to MODERATE
- **Timing**: Pre-MCE or during MCE
- **Phase Found**: Phase 5 Addendum

### TradingEngine Placeholder Code — Deferred (Kyle, Phase 5 Addendum)
- **What**: `trading-engine.ts` contains placeholder code that simulates real exchange behavior using `Math.random()`:
  1. **Partial fills** (lines 346-388): `Math.random() < 0.1` decides if a fill is partial
  2. **Entry slippage** (line 392): `Math.random() * 0.1` for random slippage
  3. **Entry fees** (line 393): Hardcoded 0.26% taker fee
  4. **Exit slippage** (line 648): `Math.random() * 0.1` on exit side
- **Classification**: NOT legacy — this is **unfinished implementation**. The comments explicitly state these are placeholders.
- **Kyle Decision (Phase 5 Addendum)**: TradingEngine deferred. Live mode not in scope. Paper mode is authoritative. Future strategic fork: (A) Refactor TradingEngine to mirror paper core, or (B) Delete and rebuild live engine from paper core. No action required now.
- **Difficulty**: MODERATE — requires implementing actual Kraken order status queries and fill response parsing
- **Timing**: Deferred until live mode refactor (BUG-010, BUG-011, RISK-036 — informational only)
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

---

## REMOVAL ORDER (Proposed)

### Wave 1: Safe Deletions (EASY, no active importers)
- LATTi files
- Strategy Presets files
- Goals ML Engine files
- DHMA Tuning Service files
- Unused SQE threshold exports (MIN_CWQI, MIN_NGC, MAX_RISK, MIN_PROFIT_RATE)
- Legacy interface fields in SizedStrategySignal
- REB 2.10/2.11 diagnostic infrastructure (lines 1-341 of `market-scanner.ts`) — pending Kyle decision on retention

### Wave 1.5: MarketScanner Class Removal (MODERATE, pre-MCE — BUG-009)
- Stop instantiating `MarketScanner` class in `server/routes.ts` (remove line 87 and line 371)
- Remove `'MarketScanner'` from `server/startup.ts` service list (lines 36, 57)
- Do NOT remove the `collectAdaptiveBatch()` function or REB diagnostic buffer exports from `market-scanner.ts`
- Verify no other boot sequence code depends on MarketScanner class methods
- Test that FX5 Scanner continues functioning independently after removal

### Wave 2: Regime Authority Resolution + DSS + Hybrid Rewiring (MODERATE, pre-MCE — HIGHEST PRIORITY)

**Prerequisites** (must be decided BEFORE implementation):
- Formally designate `calculatePairRegime()` as the sole pair-level regime authority (BUG-008)
- Decide whether `getNormalizedRegime()` (Z-Score engine) is preserved for Phase 12 ML or removed

**Note on MCP/ARE**: MCP/ARE is legacy (Kyle confirmed 2026-02-16) and targeted for full removal in Wave 6 (during/after MCE). Wave 2 does NOT touch MCP/ARE — it remains running during the DSS rewiring. The key constraint is that MCP/ARE's strategy influence must not interfere with the newly wired canonical routing. Since MCP/ARE's `REGIME_STRATEGY_MATRIX` feeds downstream services (not the Signal Orchestrator directly), this is expected to be safe. Full MCP/ARE removal is deferred to Wave 6 when MCE can absorb its portfolio-level responsibilities.

**Implementation**:
- Rewire DSS to call `calculatePairRegime()` from `market-regime.ts` for regime classification (same function VTS uses — unifies regime models)
- Replace `SYSTEM_GUARDS.STRATEGY_MAP` import with `CANONICAL_REGIME_STRATEGY_MAP` from `canonical-regime-strategy-map.ts`
- Use `selectContextAwareStrategy()` for pattern-aware routing
- Replace `selectHybridStrategy()` legacy types (H1-H4) with canonical hybrid definitions
- Update `strategy-sync.ts` to include all 17 canonical strategies
- Initialize drift detector baselines for 8 new strategies (3 pattern + 5 hybrid) (RISK-018)
- Reconcile `range_trading` vs `range_trade` key mismatch (RISK-015)
- Add bridge JSON staleness check or switch `strategy-mapper.ts` to import from TS directly (RISK-017)

### Wave 3: Walter/Bob Ecosystem (MODERATE, large batch)
- All walter-*.ts files
- All bob-*.ts files
- All bobs/*.ts files
- Verify no lazy-load side effects in index.ts first
- **Phase 8 additions — API layer cleanup**:
  - Remove `server/middleware/bob-routing.ts` (transparent Bob interception — endpoints fall through to original handlers when Bob disabled)
  - Remove `server/middleware/chat-logging.ts` (Walter conversation persistence)
  - Remove Walter/Bob inline endpoints from `routes.ts` (~20+ endpoints at `/api/walter/*`, `/api/goals-learning/*`)
  - Remove `server/routes/phase-8.6.5.ts` (Walter enhancements — 13 endpoints, or retain learning alignment features per Kyle decision)
  - Remove `server/routes/provenance-debug.ts` (Walter provenance debug — 12 unauthenticated endpoints)
  - Remove phase-8.6.5/provenance registration from `server/index.ts` (~lines 356-363)
  - Remove Walter-related service imports from top of `routes.ts`

### Wave 4: Friction Model Unification (MODERATE, pre-MCE candidate)
- Replace `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` usage with `computeTotalRoundTripCost()` from cost-model.ts
- Remove/deprecate `calculateFriction()`, `calculatePerUnitFriction()`, `getFrictionRate()` from analysis-utils.ts
- Replace signal-orchestrator.ts line 1122 flat friction with cost-model call

### Wave 4.5: Goal Alignment Removal — ALL LOCATIONS, ALL REFERENCES (EASY, pre-MCE — Phase 4/5 Addendums)

**Location 1: pre-execution-validator.ts** (Phase 4 Addendum):
- Delete `computeGoalAlignmentScore()` method
- Delete `strategyRiskProfile` map (3-strategy risk profiles)
- Delete goal alignment gate logic (gate #2 of 3)
- Remove Walter/Bob provenance references
- Pre-Execution Validator becomes a two-gate system (risk checks + fee-aware profitability)

**Location 2: trading-engine.ts** (Phase 5 — BUG-012):
- Delete `calculateGoalAlignmentScore()` method (lines 128-226)
- Delete Goal Alignment computation from `processSignal()` (lines 247-254)
- Use `signal.finalScore` or `signal.confidence` directly without 70/30 reweighting
- Remove `goalAlignmentScore` optional field from `TradeSignal` interface (line 18)

**System-wide cleanup** (Phase 5 Addendum — Kyle expanded scope):
- System should NOT reference: daily return targets, weekly targets, win rate targets, conversational goals
- These are Walter-era features and no longer part of DawnTrader architecture
- Check `profitability_vs_consistency` field in system_context for other consumers — remove if none
- Search for any remaining goal-related fields, interfaces, or database references
- **Kyle directive (2026-02-16)**: Must be REMOVED entirely, not defaulted

### Wave 4.7: NLAI System Removal (EASY-MODERATE, pre-MCE — Phase 5 Addendum)

> **Phase 5 Addendum (Kyle, 2026-02-16)**: NLAI is formally deprecated as legacy conversational control infrastructure. Walter is deprecated, goals removed, system operates via deterministic UI. Future ML may reintroduce command routing but will be redesigned.

**Files to remove**:
- `nlai-interpreter.ts` — core NLAI interpreter
- `contextual-nlai-interpreter.ts` — contextual variant
- `nlai-execution-broker.ts` — action dispatch through policy controller
- `nlai-action-registry.ts` — registered action definitions
- `execution-policy-controller.ts` — approval hooks (verified NLAI-only consumer)

**Supporting cleanup**:
- Remove NLAI-related cluster bus events
- Remove NLAI-related API routes (audit `server/routes.ts` for NLAI endpoints)
- Remove goal-update command handlers
- Remove residual Walter-specific context logic
- Verify no active service imports from ExecutionPolicyController outside NLAI

**Safety**: NLAI does NOT inject signals, modify scoring, alter VTS, or override execution math. Removal is architecturally safe — no risk to canonical execution path.

### Wave 5: NGC/quality_index.ts Removal (HARD, during MCE)
- Replace NGC with PredictiveConfidence as sole confidence authority
- Remove quality_index.ts NGC computation + rolling normalization
- Remove NGC-to-DI conversion in signal-orchestrator.ts (BUG-004)
- Remove adaptive relevance VTS linkage
- ARA removal
- Multi-User system removal
- Remove `SYSTEM_GUARDS.STRATEGY_MAP` entirely (after DSS rewiring in Wave 2)
- Strategy Signal Audit Engine removal or rebuild for PredictiveConfidence

### Wave 6: L-Series Autonomy Cluster Full Removal (DANGEROUS, during/after MCE — Kyle Confirmed Legacy 2026-02-16)

> **Phase 4 Addendum**: This wave consolidates what was previously scattered across Waves 5-7 as incremental GASP metric source updates. Kyle's directive (2026-02-16) confirms the entire L-Series cluster is architecturally inert and should be removed together. No intermediate metric source migration is needed — the entire closed loop is removed at once.

**Included systems** (~13 systems forming closed supervisory loop):
- MCP (Market Condition Profiler) — `market-profiler.ts`
- ARE (Adaptive Regime Engine) — `adaptive-regime.ts`
- GASP (Global Adaptive Stability Protocol) — `gasp-coordinator.ts`
- MOF (Multi-Objective Framework) — `mof-orchestrator.ts`
- MACO (Multi-Agent Coordination) — `maco-coordinator.ts`
- ECS (Evolutionary Competition System) — `ecs-manager.ts`
- DCE (Decision Confidence Engine) — `decision-confidence-engine.ts`
- Experience Buffer — `experience-buffer.ts`
- Reward Evaluator — `reward-evaluator.ts`
- Proactive Allocator — `proactive-allocator.ts`
- Equilibrium Restorer — TBD (Phase 6 audit)
- APR-SLE (Adaptive Performance Rating) — `apr-sle-engine.ts`
- PDC (Predictive Drawdown Containment) — `pdc-engine.ts` (if autonomy-bound)
- Autonomy Scheduler — `autonomy-scheduler.ts` (the orchestrator for L-Series)

**Pre-removal checklist** (Kyle directive):
1. ✅ Confirm no hidden execution paths exist — grep for L-Series imports in SO, DSE, TradeSafety, VTS, Execution Engine
2. ✅ Confirm no Signal Orchestrator imports from L-Series systems
3. ✅ Confirm no database migration dependencies
4. Catalog all consumer services (14+ for MCP/ARE alone)

**Step 1: Consumer Audit** (14+ importers of MCP/ARE, 12 importers of DCE):
- Catalog every service that imports from any L-Series module
- For each consumer, determine: (a) is it itself an L-Series system? (remove with cluster), (b) is it an active system that needs replacement data? (build replacement), (c) is it purely diagnostic/archival? (remove or rewire)

**Step 2: Build Replacement Module** (for any active consumers that need portfolio-level data):
- If MCE is available, MCE absorbs MCP's portfolio-level responsibilities (exposure/risk modulation)
- If MCE is not yet available, build a lightweight portfolio-risk module that:
  - Consumes `calculatePairRegime()` canonical regime output
  - Provides exposure multipliers and risk multipliers per canonical regime
  - Has NO strategy mix matrix (canonical map is sole strategy selector)
  - Uses real computed metrics (no stubs)

**Step 3: Migrate Non-L-Series Consumers**:
- Update regime-performance tracker, regime archiver, and regime-stability governance to use canonical 5-regime names instead of T1-C1
- Migrate any active service that consumed DCE/DI to use MCE confidence or `calculatePairRegime()` output
- APR-SLE dependency on DCE resolved by removing both (both are L-Series)

**Step 4: Remove Entire L-Series Cluster**:
- Delete all L-Series service files (see list above)
- Remove all L-Series initialization from `autonomy-scheduler.ts` (or remove autonomy-scheduler entirely)
- Clean up unused type exports, interfaces, and T1-C1 taxonomy references
- Remove boot sequence initialization of GASP/PDC
- Verify no lazy-load side effects in `server/index.ts`
- **Phase 8 addition**: Remove L-Series route files and their mount registrations:
  - Delete `server/routes/dce.ts`, `gasp.ts`, `mof.ts`, `maco.ts`, `pdc-ecs.ts`, `apr-sle.ts`, `rl.ts`
  - Delete `server/routes/m3b.ts`, `server/routes/tlva.ts` (L-Series monitoring tools — lose purpose when L-Series removed)
  - Remove dynamic import + `apiRouter.use()` entries in `routes.ts` (~lines 22499-22540)
  - This removes ~52 endpoints (including unauthenticated destructive operations in gasp, mof, pdc-ecs, apr-sle)

### Wave 7: Post-L-Series Cleanup (MODERATE, after MCE)
- SafetyGuardrails service removal — admin API routes migrated to `guardrailPolicy` directly
- Any remaining L-Series consumer cleanup not caught in Wave 6
- Final verification that no fallback paths reference removed L-Series modules

### Wave 8: Walter-Era Learning System Removal (EASY-MODERATE, pre-MCE or during MCE — Phase 6 Discovery + Phase 6 Addendum)

> **Phase 6 Discovery (2026-02-16)**: Five Walter-era learning services operate independently of the canonical VTS/ML pipeline. They manage AI agent behavioral weights (CognitiveWeights), not trading strategy parameters, and have zero connection to the authoritative execution path.
>
> **Phase 6 Addendum (Kyle, 2026-02-16)**: Confirmed as "legacy autonomy-era artifacts." These do not feed VTS, TelemetryAggregator, MLCalibrationService, StrategyEngine, or PaperExecutionEngine. "Mark for removal in cleanup wave."

**Status**: ❌ **CONFIRMED LEGACY** — Kyle confirmed removal (Phase 6 Addendum).

**Files to remove**:
- `server/services/continuous-learning.ts` (~389 lines) — Manages CognitiveWeights (reasoning, exploration, exploitation, riskAversion, adaptability) for AI agents. Uses `learningWeightProfile` and `experienceMemoryLog` database tables. Broadcasts via contextBridge (Walter).
- `server/services/learning-cycle-service.ts` (~350+ lines) — Generates Cognitive Summary Reports from Learning Bob fragments. 24-hour analysis cycle for Walter's conversational improvement. Imports from `learning-bob` and `phase-8.6.5-enhancements`.
- `server/services/learning-coordinator.ts` (~269 lines) — Phase 18.0 multi-node learning delta coordination via cluster bus. Uses `agentLearningDelta` database table. Subscribes to `learning_delta` events and fans out `model_sync` events. **No cluster exists** in production.
- `server/services/learning-bridge.ts` (~286 lines) — Phase 9.7 inter-agent learning feedback. Records agent accuracy and consensus alignment. Uses `agentLearningFeedback` database table. Tracks agent (not trading) performance trends.
- `server/services/learning-gate-validator.ts` (~250+ lines) — Phase 18.0 ethical gate chain (Safety → Federated Ethics → Ethical Reasoner → Knowledge). Only imported by LearningCoordinator. Validates learning operations through AI ethics framework.

**Supporting cleanup**:
- Remove related database tables: `learningWeightProfile`, `experienceMemoryLog`, `agentLearningDelta`, `agentLearningFeedback`
- Remove `server/routes/learning.ts` (~180 lines, 8 endpoints) — **unmounted dead route file** (Phase 8 discovery: not imported anywhere in codebase). Phase 18.0 learning delta/model sync endpoints serving dead cluster infrastructure.
- Remove `server/services/bob-modules/learning-bob.ts` — BOB module consumed by LearningCycleService
- Remove `server/services/phase-8.6.5-enhancements.ts` — Paper→Live knowledge transfer service consumed by LearningCycleService
- Remove `server/core/governance/learning-cooldown.ts` Walter-specific consumers (if any; note: the cooldown itself serves the canonical pipeline)
- Verify no active service imports from any of these 5 files

**Safety**: These services do NOT affect signal generation, scoring, VTS simulation, ML calibration, drift detection, or any canonical execution path. They manage Walter/Bob AI agent behavioral tendencies exclusively. Removal is architecturally safe.

**Dependency chain**: LearningGateValidator → LearningCoordinator → ClusterBus → (nothing active). LearningCycleService → LearningBob → (Walter). ContinuousLearningEngine → ContextBridge → (Walter). All chains terminate in Walter-era infrastructure.

---

## PHASE 6 LEGACY FINDINGS

### VTS Runner Deprecated Methods
- `captureSignalForVTS()` is explicitly marked DEPRECATED in source code (line 1263: "use autonomous simulation instead"). This is a dead method that should be removed during VTS cleanup.
- `simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()` — these are **active but problematic** simulation methods (BUG-001 + RISK-043). They are NOT legacy; they require **replacement with real strategy-specific calculations**, not removal. Kyle (Phase 6 Addendum): "Each strategy must have unique entry logic, unique stop logic, unique target logic, unique confidence modeling."

### VTS Service Deprecated Methods
- `createVirtualTrade()` — deprecated by Directive 11.6D (legacy random simulation)
- `closeTrade()` — deprecated by Directive 11.6D (legacy random exits)
- Both replaced by `resolveOpenVirtualTrades()` in vts-runner.ts
- These should be removed as dead code during VTS cleanup

### Retraining Freeze Stale Artifact
- `activatePhase10Freeze()` in retraining-freeze-controller.ts constructor — stale one-time deployment measure that runs on every restart. Kyle (Phase 6 Addendum): confirmed for removal, convert to manual trigger or remove auto-activation (BUG-014).

### ML Service Client Schema Drift
- `PredictionInput` interface in `ml-service-client.ts` still references `ngc` and `cwqi` — both removed in Phase 10. Kyle (Phase 6 Addendum): confirmed outdated, remove deprecated fields, align with canonical metrics (finalScore, hybridScore, predictiveConfidence, regimeWeight).

---

## PHASE 6 ADDENDUM — CONFIRMED DEAD SYSTEMS

### Walter-Era Learning Stack (5 files — Kyle confirmed legacy, Phase 6 Addendum)

Added to Confirmed Dead Systems and Wave 8 removal plan above. These are "legacy autonomy-era artifacts" per Kyle:
- ContinuousLearningEngine → manages CognitiveWeights for Walter/Bob agents
- LearningCycleService → Walter's conversational improvement cycle
- LearningCoordinator → multi-node learning delta coordination (no cluster exists)
- LearningBridge → inter-agent learning feedback tracking
- LearningGateValidator → 4-gate ethical validation chain (only imported by LearningCoordinator)

All 5 have zero connection to VTS, ML Calibration, Telemetry, Strategy Weights, or any canonical execution component.

---

## PHASE 7 LEGACY FINDINGS

### Phase 17.0 Cluster System — FLAGGED FOR POST-AUDIT INVESTIGATION

**Files:** `server/services/task-router.ts` (~428 lines), `server/services/task-worker.ts` (~407 lines)
**Directive:** Phase 17.0, 17.5, 17.6
**Kyle Decision (Phase 7 Addendum):** Not deprecated immediately. Flagged for post-audit cleanup investigation.

**Evidence of non-use:**
- **TaskRouter** queries `cluster_node` table for healthy nodes with heartbeats within 2 minutes, but no cluster node registration is performed anywhere in the startup sequence (`server/index.ts`). The TaskRouter depends on `cluster-bus.ts` and `cluster-registry.ts` for multi-node coordination.
- **TaskWorker** has a full gate pipeline (Circuit Breaker → Safety → Federated Ethics → Ethical Reasoner → Knowledge Acquisition → Execution) but every gate is simulated — `simulateGateExecution()` always returns `true`. All task type handlers return placeholder responses (e.g., `{ signal: "processed" }`).
- Neither TaskRouter nor TaskWorker appear in the startup sequence of `server/index.ts`.
- DawnTrader operates as a single-node system. No evidence of multi-node cluster deployment.
- These use separate schema tables (`cluster_task_queue`, `cluster_node`, `cluster_result_log`, `cluster_audit_log`) from the active `reasoning_queue` table used by the working `task-queue.ts`.

**Relationship to other legacy:**
- The TaskWorker imports from `circuit-breaker.ts` and `cluster-registry.ts` — both likely Phase 17.0 cluster infrastructure.
- The ethical gate chain in TaskWorker mirrors the LearningGateValidator gates (already confirmed legacy in Phase 6).

**If confirmed legacy during post-audit review, add to Wave 6 (L-Series Cluster Removal):** These are part of the same architectural era as the L-Series autonomy cluster. TaskRouter/TaskWorker are the execution infrastructure for the L-Series command dispatch system.

### CLE/CWA Scheduler Tasks — FLAGGED FOR POST-AUDIT INVESTIGATION

**Referenced in:** `server/index.ts` (scheduler registry registration, steps 5 and 6 of 13 registered tasks)
**Files:** TBD — would need to audit `cle-task.ts` and `cwa-task.ts`
**Kyle Decision (Phase 7 Addendum):** Not deprecated immediately. Part of broader scheduler over-provisioning investigation.

**Evidence of non-use:**
- "CLE" = Continuous Learning Engine, "CWA" = Cognitive Weight Adjustment — these are Walter-era learning concepts.
- If the Walter-era learning stack is confirmed dead (5 services in Wave 8), these scheduler tasks may be executing against dead or disconnected systems.
- They are registered and will execute on schedule, potentially producing log noise or database writes to tables that serve no active consumer.

**Post-audit investigation:** Determine if these support core paper trading, are autonomy-era infrastructure, or are observational only. If confirmed legacy, remove from scheduler registry and add to Wave 8.

### Ethical Principles Seeder — FLAGGED FOR POST-AUDIT INVESTIGATION

**File:** `server/startup/ethical-principles-seeder.ts` (~92 lines)
**Directive:** Phase 13.0
**Kyle Decision (Phase 7 Addendum):** Not deprecated immediately. Post-audit investigation required.

**Evidence of potential non-use:**
- Seeds 5 ethical principles (transparency, harm_prevention, fairness, autonomy_bounds, accountability) to `ethicalPrinciple` database table.
- These principles reference autonomous AI decision-making concepts: "require_reasoning_log", "prohibit_manipulation", "prohibit_front_running", "balanced decision-making in market analysis".
- If the Walter/Bob AI system is dead (confirmed), and the ethical gate chains are dead (confirmed Phase 6), the consumers of these principles may not exist.
- However, the principles may serve as compliance documentation or future-proofing for re-enabled AI features.

**Post-audit investigation:** Verify active consumers. If legacy, remove seeder and table. If retained, mark as "compliance data only."

---

## PHASE 8 LEGACY FINDINGS

### L-Series Route Files — API Surface for Dead Backend Systems

**Files (8 route files exposing L-Series endpoints):**
- `server/routes/dce.ts` (~123 lines, 5 endpoints) — DCE routes, no auth
- `server/routes/gasp.ts` (~183 lines, 10 endpoints) — GASP routes, no auth, destructive operations (reset/rollback/recalibrate)
- `server/routes/mof.ts` (~163 lines, 9 endpoints) — MOF routes, no auth, destructive operations
- `server/routes/maco.ts` (~203 lines, 4 endpoints) — MACO routes, JWT auth, LOCKED
- `server/routes/pdc-ecs.ts` (~162 lines, 6 endpoints) — PDC-ECS routes, no auth
- `server/routes/apr-sle.ts` (~122 lines, 5 endpoints) — APR-SLE routes, no auth
- `server/routes/rl.ts` (~186 lines, 5 endpoints) — RL routes, JWT auth, LOCKED
- `server/routes/m3b.ts` (~160 lines, 7 endpoints) — M3B validation audit (monitors L-Series)
- `server/routes/tlva.ts` (~166 lines, 6 endpoints) — TLVA training audit (monitors L-Series)

**Why legacy**: These route files expose the L-Series autonomy cluster confirmed legacy in Phase 4 (Kyle, 2026-02-16). They mount at `/api/dce`, `/api/gasp`, `/api/mof`, `/api/maco`, `/api/pdc-ecs`, `/api/apr-sle`, `/api/rl`. Combined: ~52 endpoints serving dead backend systems.

**Difficulty**: EASY — route file removal is straightforward. Remove dynamic import + `apiRouter.use()` in routes.ts (~lines 22499-22520), then delete route files.

**Security concern**: 5 of 8 L-Series route files have **no authentication** and expose destructive operations (reset, rollback, recalibrate, evolve). While the backend systems are legacy, these endpoints are actively mounted and reachable.

**Timing**: Remove with Wave 6 (L-Series cluster removal). Route files should be removed **in the same wave** as backend services.

**Phase Found**: Phase 8

### Walter/Bob Middleware — bob-routing.ts and chat-logging.ts

**Files:**
- `server/middleware/bob-routing.ts` (~101 lines) — Transparent interception for `/api/system/health` and `/api/paper-sim/status` via BobCore/MetricsBob
- `server/middleware/chat-logging.ts` (~317 lines) — Walter conversation persistence (file-based JSON logs, summaries, chat index)

**Why legacy**: Both serve the Walter/Bob AI ecosystem confirmed dead by Kyle.

**bob-routing.ts**: Intercepts 2 high-frequency endpoints and routes through BobCore caching layer. When Bob is removed, these endpoints will fall through to original handlers automatically (middleware checks `bobCore.isEnabled()` first). However, the middleware itself should be removed to avoid dead code.

**chat-logging.ts**: File-based chat storage for Walter conversations. Creates directories at `logs/chats/` and `logs/chat_summaries/`. Singleton `chatLogging` is imported by Walter chat routes.

**Difficulty**: EASY — both are scoped. bob-routing.ts just needs removal from middleware registration. chat-logging.ts removal requires verifying no active imports outside Walter routes.

**Timing**: Wave 3 (Walter/Bob ecosystem removal)

**Phase Found**: Phase 8

### Walter/Bob Inline Endpoints in routes.ts (~20+ endpoints)

**Location**: `server/routes.ts`
**Endpoint groups**:
- `/api/walter/*` — Chat sessions, messages, memory, summaries, search
- `/api/goals-learning/*` — Goals ML learning triggers (2 endpoints)
- `/api/walter/secure-core/*` (via phase-8.6.5.ts registered on app) — Secure-Core mode toggle
- `/api/walter/corpus-domain/*` (via phase-8.6.5.ts) — Corpus domain management

**Why legacy**: All serve the Walter/Bob AI system confirmed dead by Kyle. The goals-learning endpoints serve the Goals ML system also confirmed deprecated.

**Difficulty**: MODERATE — endpoints are inline in the 23,349-line routes.ts file. Removal requires careful extraction to avoid breaking surrounding code. Walter imports at the top of routes.ts must also be removed.

**Timing**: Wave 3 (Walter/Bob ecosystem removal)

**Phase Found**: Phase 8

### Unmounted Route File — learning.ts (Phase 18.0)

**File**: `server/routes/learning.ts` (~180 lines, 8 endpoints)
**Directive**: Phase 18.0

**What**: Route file defining 8 endpoints for learning delta synchronization, model sync, and ethical gate validation. Uses Phase 18.0 learning coordinator, learning gate validator, and cluster bus — all Walter-era infrastructure.

**Why dead**: File exists but is **not imported or mounted anywhere** in the codebase. Not in routes.ts, not in index.ts. Dead code.

**Notable**: Only route file that correctly imports authentication from centralized middleware (`../middleware/auth`).

**Difficulty**: EASY — file is completely disconnected
**Timing**: Wave 8 (Walter-era learning system removal) or anytime
**Phase Found**: Phase 8

### Phase 8.6.5 Enhancement Routes — Walter-Adjacent

**Files**:
- `server/routes/phase-8.6.5.ts` (~277 lines, 13 endpoints) — Registered directly on Express app
- `server/routes/provenance-debug.ts` (~293 lines, 12 endpoints) — Registered directly on Express app, **no auth on any endpoint**

**What**: Walter learning enhancements (Secure-Core mode, learning alignment, paper-to-live promotion, corpus domains) and provenance debugging (data lineage tracing, Walter memory search, Bob trace logs).

**Why potentially legacy**: Serve Walter/Bob learning and provenance infrastructure. When Walter is removed, these endpoints lose their purpose. However, learning alignment concepts (paper-to-live promotion) may be architecturally reusable.

**Difficulty**: EASY — registered directly on app in index.ts (~lines 356-363). Remove import + registration.
**Timing**: TBD — needs Kyle decision on whether learning alignment features survive Walter removal
**Phase Found**: Phase 8

### Dual Shutdown Handler Artifact

**Files:** `server/index.ts` (lines 1228-1259), `server/core/boot_orchestrator.ts` (lines 51-73)
**Kyle Decision (Phase 7 Addendum):** Post-audit investigation. No immediate change required.

The boot orchestrator registers its own SIGTERM/SIGINT handlers independently of the main shutdown handler in index.ts. This is not legacy per se, but is a **structural defect** (BUG-015) that should be consolidated. The ML service and VTS Runner shutdown logic should be moved to the main shutdown handler in index.ts, and the boot orchestrator should expose shutdown methods rather than registering its own signal handlers.

### Health Monitor Placeholder Recovery Actions

**File:** `server/services/health-monitor.ts` — Phase 41F-G auto-recovery framework
**Kyle Decision (Phase 7 Addendum):** Post-audit investigation.

The auto-recovery framework (cooldown, circuit breaker, recovery planning, dry-run mode) is fully implemented as infrastructure but contains zero actual recovery actions. All handlers are placeholders that log warnings and return `success = true`. This is not legacy — it is incomplete implementation. Tracked as RISK-046.

---

## PHASE 7 ADDENDUM — POST-AUDIT INFRASTRUCTURE REVIEW (Kyle Directive)

> **Kyle (Phase 7 Addendum):** "Phase 7 does not indicate instability. It indicates architectural accumulation. These items must be revisited during the structured cleanup phase after the audit is complete. They are not emergency defects. They are hygiene candidates. Architectural simplification is required. This will be handled as a deliberate cleanup phase, not as reactive removal."

### Post-Audit Infrastructure Investigation List

The following systems are flagged for formal investigation after audit completion:

| # | System | Investigation Questions |
|---|--------|----------------------|
| 1 | Background scheduler tasks (15+ tasks unrelated to core trading) | Does it directly support core paper trading? Is it autonomy-era? Observational only? Can it be disabled in "Core Trading Mode"? Should it be deprecated or removed? |
| 2 | MicroExecutionService | Is it referenced by paper or live execution engines? Is it purely experimental? Is it safe to disable at boot? Should it be deprecated pending future micro-coin strategy work? |
| 3 | AutonomyScheduler | Does it mutate guardrails? Adjust parameters? Or operate read-only? |
| 4 | AwarenessScheduler | Does it mutate trading config? Modify risk settings? Or purely analytical? |
| 5 | LearningCycleService | Should it remain active during ML refactor? Be temporarily disabled? Or rebuilt after strategy-specific VTS correction? |
| 6 | LATTI/Coherence residual flags (`lattiManaged`, `lockedByUser`, `manualOverride`) | If LATTI is fully removed, do these fields still serve any purpose? |
| 7 | CLE/CWA Scheduler Tasks | Walter-era learning concepts. Are they executing against dead systems? |
| 8 | Ethical Principles Seeder | Are there active consumers? Compliance data or dead code? |
| 9 | Phase 17.0 Cluster System (TaskRouter + TaskWorker) | Dead infrastructure — no cluster nodes registered. Formal decision required. |

### Investigation Protocol (per Kyle)

Each system will undergo:
1. **Scope verification** — What does this system actually do?
2. **Dependency tracing** — What imports it? What does it import?
3. **Mutation impact review** — Does it modify any trading state, configuration, or risk parameters?
4. **Performance impact review** — Does it consume meaningful CPU/memory/database resources?
5. **Final decision:** Retain | Disable | Refactor | Deprecate | Remove

### Criteria for Retention

Any service not directly tied to:
- Signal generation
- Risk management
- Execution
- Telemetry
- Calibration

...is a candidate for this review. Services may be retained if they serve legitimate observational, diagnostic, or compliance purposes.

---

## PHASE 8 CHANGELOG

**Phase 8 additions (2026-02-17)**:
- **L-Series route files**: 8 route files (~52 endpoints) serving dead L-Series backend systems added to Wave 6 removal plan (Step 4). Includes `dce.ts`, `gasp.ts`, `mof.ts`, `maco.ts`, `pdc-ecs.ts`, `apr-sle.ts`, `rl.ts`, plus monitoring tools `m3b.ts` and `tlva.ts`.
- **Walter/Bob middleware**: `bob-routing.ts` and `chat-logging.ts` added to Wave 3 removal plan.
- **Walter/Bob inline routes**: ~20+ Walter endpoints in routes.ts and phase-8.6.5.ts/provenance-debug.ts added to Wave 3.
- **Unmounted learning.ts**: Dead route file (Phase 18.0) discovered — not imported anywhere. Added to Wave 8.
- **Phase 8.6.5 routes**: `phase-8.6.5.ts` and `provenance-debug.ts` flagged as Walter-adjacent, pending Kyle decision on learning alignment feature retention.
- **Security findings**: 13 unauthenticated route files, hardcoded JWT fallback secrets (9 files), auth bypass headers (4 files), inconsistent JWT secret in regime-archive.ts. Tracked in CHANGES_AND_FIXES.md as RISK-049 through RISK-053 and BUG-016/BUG-017.

**Phase 8 Addendum (2026-02-17) — Kyle directives**:
- Kyle's position: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk."
- **ADD-1**: RBAC enforcement inconsistency — auth consolidation required. All copy-pasted `requireAuth` middleware must be replaced with centralized RBAC-enforcing middleware. Affects removal planning: auth consolidation should happen BEFORE or concurrent with Wave 3/Wave 6 removals to ensure remaining routes have proper auth.
- **ADD-2**: JWT fallback secrets must be removed entirely (fail-hard if not defined). Affects 10 route files. If auth is consolidated per ADD-1, this becomes a single-point fix.
- **ADD-3**: `x-internal-audit` header bypass must be removed and replaced with proper internal auth. Affects 4 route files.
- **ADD-4**: API versioning (`/api/v1/`) to be introduced during post-audit routes.ts refactoring.
- **ADD-5**: Phase 9 frontend audit must include endpoint census — cross-reference frontend usage against all ~750 endpoints to identify dead API surface for removal.

### Auth Consolidation Sequencing Note

Kyle's ADD-1/ADD-2/ADD-3 directives create a **pre-removal dependency**: the auth layer should be consolidated before Wave 3 and Wave 6 removals so that surviving route files have proper centralized authentication with RBAC enforcement. Recommended sequence:

1. **Auth consolidation** (ADD-1/ADD-2/ADD-3): Create centralized auth middleware, remove fallback secrets, remove header bypasses, add RBAC to all mutating endpoints
2. **Wave 3** (Walter/Bob): Remove Walter routes, middleware, inline endpoints — surviving routes already have proper auth
3. **Wave 6** (L-Series): Remove L-Series route files — no auth concerns since they're being deleted entirely

This consolidation work is tracked as RISK-053 (duplicated middleware), RISK-055 (RBAC gap), RISK-049 (JWT fallbacks), and RISK-051 (header bypasses) in CHANGES_AND_FIXES.md.

---

## PHASE 9 LEGACY FINDINGS — Frontend Dead Code & Dead Pages

### Dead/Unrouted Frontend Pages (7 pages, 2,771 lines)

These pages are NOT referenced in the App.tsx route table. They represent the "tab consolidation" evolution — standalone pages whose functionality was absorbed into tabs within active pages.

| File | Lines | Superseded By | Difficulty |
|------|-------|---------------|-----------|
| `client/src/pages/walter-approvals.tsx` | 366 | Walter Approvals tab in `settings.tsx` | EASY |
| `client/src/pages/history.tsx` | 253 | Trade History tab in `active-trades.tsx` | EASY |
| `client/src/pages/admin.tsx` | 303 | Users tab in `settings.tsx` | EASY |
| `client/src/pages/search.tsx` | 187 | Search & Analysis tab in `watchlist.tsx` | EASY |
| `client/src/pages/command-center.tsx` | 901 | Absorbed into `ai-transparency.tsx` | EASY |
| `client/src/pages/analysis.tsx` | 512 | Never wired into router | EASY |
| `client/src/pages/settings-old-backup.tsx` | 249 | Current `settings.tsx` | EASY |

**Difficulty**: EASY — all 7 files are completely disconnected from the router. No active component imports any of these pages. Safe to delete.

**Special case — `history.tsx`**: Imported in App.tsx (line 7) but never rendered. The import itself is dead code (BUG-018).

**Timing**: Anytime — standalone cleanup, no dependencies.

### Dead Hook File

| File | Lines | Superseded By | Difficulty |
|------|-------|---------------|-----------|
| `client/src/hooks/use-biometric-auth.ts` | 82 | `client/src/hooks/useBiometricAuth.ts` (used by login.tsx) | EASY |

Two biometric auth hooks exist. Grep confirmed only `useBiometricAuth.ts` (PascalCase) is imported anywhere (by `login.tsx`). The `use-biometric-auth.ts` (kebab-case) file is a dead placeholder that was never wired in.

**Difficulty**: EASY — no importers, safe to delete.

### Dead Imports in Active Files

| File | Import | Issue | Difficulty |
|------|--------|-------|-----------|
| `App.tsx` line 7 | `History` from `@/pages/history` | Imported but never rendered | EASY |
| `active-trades.tsx` line 4 | `Watchlist` from `@/components/trading/watchlist` | Imported but never rendered | EASY |
| `active-trades.tsx` | `useQuery` from `@tanstack/react-query` | Imported but never called | EASY |

### Orphaned Route

- `client/src/pages/register.tsx` (191 lines) — Route exists in App.tsx (`/register`) but the login page no longer links to it (link commented out). Only reachable via direct URL navigation. Public registration was replaced with admin-only user creation in `settings.tsx`.

**Recommendation**: Either remove the route and the page, or keep it gated behind an admin flag. Currently it allows anyone with the URL to create accounts.

### Dead Variables in Active Components

| File | Variable(s) | Notes | Difficulty |
|------|-------------|-------|-----------|
| `portfolio-value-widget.tsx` lines 67-68 | `availableForTrading`, `inOpenTrades` | Computed but never used in JSX | EASY |
| `alert-banner.tsx` line 32 | `user` from localStorage | Defined but never referenced | EASY |
| `portfolio-chart.tsx` lines 33-38 | `formatDate` branches | Identical branches — dead conditional | EASY |

### Walter Frontend Files — Require Coordinated Cleanup (Wave 3.1)

When the Walter backend is removed in Wave 3, the following frontend files will break or become non-functional. These should be cleaned up in a coordinated frontend wave (Wave 3.1):

| File | Lines | Walter Integration | Action Required |
|------|-------|-------------------|----------------|
| `pages/walter.tsx` | 1,386 | **Entire page is Walter chat** | Remove or replace with placeholder |
| `components/walter-floating-assistant.tsx` | 501 | **Entire component is Walter chat** | Remove |
| `components/layout/top-bar.tsx` | 1,042 | Walter approvals notification bell | Remove bell + pending approvals query |
| `pages/settings.tsx` | 1,122 | Walter Approvals tab, Walter memory config | Remove Walter tab + memory settings |
| `components/DailyBriefCard.tsx` | 332 | `/api/walter/auto-resolved-today` | Remove Walter auto-maintenance section |
| `components/ai/InteractiveNotification.tsx` | 315 | Walter approval workflow | Remove or repurpose for non-Walter approvals |
| `pages/ai-transparency.tsx` | 2,074 | "Walter Command"/"Walter Action" log categories | Remove Walter-specific log filtering |
| `hooks/useWalterPreferences.tsx` | 38 | Walter preference management | Remove entirely |

**Difficulty**: MODERATE — requires careful extraction from large files (top-bar.tsx at 1,042 lines, settings.tsx at 1,122 lines). Pure Walter files (walter.tsx, walter-floating-assistant.tsx, useWalterPreferences.tsx) are EASY to delete.

**Timing**: Must be concurrent with or immediately after Wave 3 (Walter/Bob backend removal). If backend is removed without frontend cleanup, users will see broken UI.

### Speculative/Aspirational Endpoints in enhanced-system-monitoring.tsx

**File**: `client/src/components/system/enhanced-system-monitoring.tsx`

This component references ~60 API endpoints across speculative namespaces that likely never had backend implementations:

- `/api/ethics/*` — AI ethics endpoints
- `/api/collaboration/*` — Multi-agent collaboration
- `/api/federation/*` — Federated learning
- `/api/knowledge/*` — Knowledge management
- `/api/oversight/*` — System oversight
- `/api/alignment/*` — AI alignment
- `/api/introspection/*` — Self-analysis
- `/api/reasoning/*` — Reasoning chain endpoints

**Difficulty**: MODERATE — the component is large and these endpoints are interspersed throughout. May require significant refactoring or complete rewrite of the component.

**Recommendation**: Audit which endpoints actually exist on the server. Remove references to non-existent endpoints. Consider whether this component needs a ground-up rewrite to match actual system capabilities.

**Kyle Directive (Phase 9 Addendum ADD-4)**: Clean `enhanced-system-monitoring.tsx`. Remove the ~60 speculative/aspirational API endpoints that generate unnecessary 404 network requests. Simplify the component to match actual system capabilities.

**Timing**: Post-audit cleanup

### Monolithic Pages Flagged for Component Decomposition (Phase 9 Addendum ADD-2)

**Kyle Directive (Phase 9 Addendum ADD-2)**: The following pages exceed 1,000 lines and are flagged for component decomposition into smaller, maintainable sub-components:

| File | Lines | Decomposition Candidates |
|------|-------|-------------------------|
| `client/src/pages/ai-transparency.tsx` | 2,074 | Tab panels, log filtering, Walter log categories |
| `client/src/pages/machine-learning.tsx` | 1,985 | ML model cards, training panels, metric views |
| `client/src/pages/analytics.tsx` | 1,939 | Chart panels, metric cards, filter sections |
| `client/src/components/layout/top-bar.tsx` | 1,042 | Notification bell, mode selector, user menu, alert displays |

**Decomposition strategy**: Each major section (tab, panel, data view) should be extracted into a standalone component with clear props/data contracts. This is a maintainability improvement, not a functional change.

**Difficulty**: MODERATE — large files require careful extraction. Each component needs clear interface boundaries. TypeScript types can help enforce clean contracts.

**Timing**: Post-audit cleanup — can be bundled with Wave 9 frontend cleanup or done incrementally.

---

## UPDATED REMOVAL ORDER

### Updated Wave 3: Walter/Bob Ecosystem (MODERATE, large batch)

**Backend removal** (existing Wave 3 scope):
- All walter-*.ts files
- All bob-*.ts files
- All bobs/*.ts files
- Verify no lazy-load side effects in index.ts first
- Walter/Bob middleware, inline endpoints, and route files (as detailed in existing Wave 3)

**NEW — Wave 3.1: Frontend Walter Cleanup** (concurrent with Wave 3):
- Delete `client/src/pages/walter.tsx` (1,386 lines) — or replace with "Feature removed" placeholder
- Delete `client/src/components/walter-floating-assistant.tsx` (501 lines)
- Delete `client/src/hooks/useWalterPreferences.tsx` (38 lines)
- Remove Walter Approvals tab and Walter memory config from `client/src/pages/settings.tsx`
- Remove Walter approvals notification bell from `client/src/components/layout/top-bar.tsx`
- Remove Walter auto-maintenance section from `client/src/components/DailyBriefCard.tsx`
- Remove or repurpose Walter approval workflow in `client/src/components/ai/InteractiveNotification.tsx`
- Remove "Walter Command"/"Walter Action" log filtering in `client/src/pages/ai-transparency.tsx`
- Remove `/walter` route from `client/src/App.tsx`
- Remove `WalterFloatingAssistant` render from `client/src/App.tsx`
- Remove Walter-related sidebar navigation item from `client/src/components/layout/sidebar.tsx`

### NEW — Wave 9: Frontend Dead Code Cleanup (EASY, anytime)

**Dead pages** (7 files, 2,771 lines):
- Delete `client/src/pages/walter-approvals.tsx` (366 lines)
- Delete `client/src/pages/history.tsx` (253 lines)
- Delete `client/src/pages/admin.tsx` (303 lines)
- Delete `client/src/pages/search.tsx` (187 lines)
- Delete `client/src/pages/command-center.tsx` (901 lines)
- Delete `client/src/pages/analysis.tsx` (512 lines)
- Delete `client/src/pages/settings-old-backup.tsx` (249 lines)

**Dead hook**:
- Delete `client/src/hooks/use-biometric-auth.ts` (82 lines)

**Dead imports** (in active files):
- Remove `History` import from `client/src/App.tsx` line 7
- Remove `Watchlist` and `useQuery` imports from `client/src/pages/active-trades.tsx`

**Dead variables** (in active files):
- Remove `availableForTrading` and `inOpenTrades` from `portfolio-value-widget.tsx`
- Remove `user` variable from `alert-banner.tsx`
- Fix `formatDate` dead conditional in `portfolio-chart.tsx`

**Console.log cleanup** (123 statements):
- Replace all `console.log` debug statements with conditional dev-mode logging or remove entirely
- Priority files: `top-bar.tsx` (30), `api.ts` (16), `performance-profiler.ts` (12), `use-websocket.tsx` (11)

**Speculative endpoint cleanup** (Phase 9 Addendum ADD-4):
- Clean `enhanced-system-monitoring.tsx` — remove ~60 speculative/aspirational API endpoint references (ethics, collaboration, federation, knowledge, oversight, alignment, introspection, reasoning namespaces)
- Simplify component to match actual system capabilities
- Can be bundled with ADD-2 monolithic page decomposition

**Monolithic page decomposition** (Phase 9 Addendum ADD-2):
- Decompose `ai-transparency.tsx` (2,074 lines), `machine-learning.tsx` (1,985 lines), `analytics.tsx` (1,939 lines), `top-bar.tsx` (1,042 lines) into smaller sub-components
- Each major section → standalone component with clear props/data contracts

**Centralized polling policy** (Phase 9 Addendum ADD-3):
- Create `POLLING_TIERS` constant in `lib/` with standard intervals: Critical (5s), Semi-critical (15–30s), Informational (60s+)
- Migrate all ad-hoc `refetchInterval` values to use centralized constants
- Not a removal, but an architectural standardization needed during cleanup

**Difficulty**: EASY (dead code, console.logs) to MODERATE (decomposition, speculative endpoints).
**Timing**: Anytime — recommend bundling into a single cleanup directive.

---

## PHASE 9 CHANGELOG

**Phase 9 additions (2026-02-17)**:
- **7 dead/unrouted frontend pages** identified (2,771 total lines): walter-approvals.tsx, history.tsx, admin.tsx, search.tsx, command-center.tsx, analysis.tsx, settings-old-backup.tsx. All superseded by tab consolidation into active pages.
- **1 dead hook file**: `use-biometric-auth.ts` (82 lines) — duplicate, never imported.
- **3 dead imports in active files**: History in App.tsx, Watchlist/useQuery in active-trades.tsx.
- **Dead variables**: 3 locations in active components (portfolio-value-widget, alert-banner, portfolio-chart).
- **Wave 3.1 (Frontend Walter Cleanup)**: Added as companion to existing Wave 3 — 8+ frontend files with Walter dependencies requiring coordinated removal. Includes entire walter.tsx page (1,386 lines), floating assistant (501 lines), TopBar notification bell, settings Walter tab, and more.
- **Wave 9 (Frontend Dead Code Cleanup)**: New wave for safe dead code removal — 7 dead pages, 1 dead hook, dead imports, dead variables, 123 console.log statements.
- **Speculative endpoint references**: enhanced-system-monitoring.tsx references ~60 API endpoints across speculative namespaces (ethics, collaboration, federation, knowledge, oversight, alignment, introspection, reasoning) that likely never existed on the server.
- **ADD-5 Endpoint Census completed**: ~291 frontend endpoints referenced vs ~750 server endpoints — ~460 server endpoints with no frontend consumer. Census data should be used during Wave 3/6/8 removals to identify dead API surface.
- **Orphaned register.tsx**: Route exists but UI link commented out. Public registration still accessible via direct URL.

**Phase 9 Addendum applied (2026-02-17)**:
- **ADD-2 (Monolithic Page Decomposition)**: 4 frontend files >1,000 lines flagged for component decomposition: ai-transparency.tsx (2,074), machine-learning.tsx (1,985), analytics.tsx (1,939), top-bar.tsx (1,042). Added to Phase 9 Legacy Findings and Wave 9 scope.
- **ADD-3 (Centralized Polling Policy)**: Directive to create `POLLING_TIERS` constants and migrate ad-hoc refetch intervals. Added to Wave 9 scope as architectural standardization.
- **ADD-4 (Speculative Endpoint Cleanup)**: Kyle directive to clean enhanced-system-monitoring.tsx of ~60 aspirational API endpoint references. Linked to existing speculative endpoints finding. Added to Wave 9 scope.
- **ADD-1 (Token Security) and ADD-5 (Simulated Price)**: These are tracked in CHANGES_AND_FIXES.md as RISK-063 and BUG-020 respectively — not deprecation/removal items, so not added to this document.

---

## POST-AUDIT: FRONTEND TAB CATALOG — Legacy Tabs Within Active Pages

**Audit date**: 2026-02-17
**Method**: Automated codebase scan for all `<Tabs>`, `<TabsTrigger>`, `<TabsContent>` patterns

### Tab Inventory Summary

| Scope | Tab Count |
|-------|-----------|
| Pages (11 pages with tabs) | 48 |
| Components (5 components with tabs) | 43 |
| **Total tab "sub-pages"** | **91** |
| Pages without tabs | 14 |

### Legacy Tabs in Active Pages (Require Wave 3.1 Cleanup)

| Page | Tab | Value | Issue | Action |
|------|------|-------|-------|--------|
| `settings.tsx` | Walter Approvals | `walter-approvals` | Walter dependency — entire tab queries Walter backend | Remove during Wave 3.1 |
| `settings.tsx` | General tab | Walter memory settings section | Contains Walter memory configuration within an otherwise active tab | Extract Walter section during Wave 3.1 |
| `enhanced-system-monitoring.tsx` | Walter Activity | `walter-activity` | Walter-specific monitoring tab | Remove during Wave 3.1 |
| `ai-transparency.tsx` | Log category labels | `walter_command`, `walter_action` | Walter-specific log categories in filter UI | Remove filter options during Wave 3.1 |

### BUG: Duplicate Tab Value in enhanced-system-monitoring.tsx

`enhanced-system-monitoring.tsx` has **27 tabs** (making it the most complex tabbed page in the app at 4,528 lines). Two of these tabs share the `value="learning"` attribute. In Radix UI Tabs, duplicate values cause the second tab to be unreachable — clicking it activates the first tab's content panel. This is tracked as **BUG-022** in CHANGES_AND_FIXES.md.

### Dead/Placeholder Tabs

| Page/Component | Tab | Issue |
|----------------|------|-------|
| `system-monitoring-panel.tsx` | Validation Reports | Dead placeholder — content area appears empty or stub |

### Complexity Hotspots (Not Legacy, but Flagged)

| Page | Tab Count | Lines | Note |
|------|-----------|-------|------|
| `enhanced-system-monitoring.tsx` | 27 | 4,528 | Most complex page in app. Tab decomposition recommended (RISK-064). |
| `ai-transparency.tsx` | 13 | 2,074 | AI audit/log viewer with Walter-specific categories |
| `system-monitoring-panel.tsx` | 7 | — | Monitoring dashboards |
| `settings.tsx` | 6 | 1,122 | User settings with Walter Approvals legacy tab |
| `active-trades.tsx` | 5 | — | Trade management |

### Wave 3.1 Frontend Cleanup — Tab-Specific Additions

Add to existing Wave 3.1 scope:
- Remove `walter-approvals` tab from `settings.tsx`
- Extract Walter memory settings from `settings.tsx` General tab
- Remove `walter-activity` tab from `enhanced-system-monitoring.tsx`
- Remove `walter_command` / `walter_action` log filter categories from `ai-transparency.tsx`
- Fix duplicate `value="learning"` tab in `enhanced-system-monitoring.tsx` (BUG-022 — can be done anytime)

---

## PHASE 10 LEGACY FINDINGS — Stale Tests & Legacy Test Infrastructure

### Test Files for Deprecated Walter/Bob Systems (Will Break on Wave 3 Removal)

| File | Lines | Legacy Imports | Action |
|------|-------|---------------|--------|
| `server/tests/diagnostic-system.test.ts` | 466 | `diagnostic-controller`, `bob-inspector`, `walter-patch-analyst` | Remove or rewrite during Wave 3 |
| `server/tests/phase-6.0-simulations.test.ts` | 229 | `walter-expert-corpus`, `walter-reasoning-templates`, `walter-knowledge-refresh`, `walter-purpose`, `bob-inspector` | Remove during Wave 3 |

**Difficulty**: EASY — these are standalone test files with no active consumers. Delete during Wave 3 (Walter removal).

### Runtime Validation Services Referencing Legacy L-Series Systems

| Service | Lines | Legacy References | Action |
|---------|-------|-------------------|--------|
| `paper_validation_engine.ts` | 468 | DCE (Decision Confidence Engine), GASP (Global Adaptive Stability Protocol) | Update validation metrics to remove DCE/GASP references during Wave 6 |
| `auto_test_harness.ts` | 386 | NLAI action registry, NLAI execution broker, intent parser | Remove NLAI test scenarios during Wave 4.7 (NLAI removal) |
| `m3b-validation-service.ts` | 250 | DCE (Decision Confidence Engine) | Update to remove DCE coupling during Wave 6 |

**Difficulty**: MODERATE — these services are actively used for runtime validation. Legacy metric sources must be replaced with canonical alternatives (MCE/VTS metrics) rather than simply deleted.

### Stale Schema Version Test

| File | Asserts | Current | Risk |
|------|---------|---------|------|
| `server/tests/integration/schema_v1_5.test.ts` | v1.5.0 | v1.5.8 (per `cost_cache.test.ts`) | Test likely fails — needs update or removal |

**Difficulty**: EASY — update version assertion or remove the test if `schema_v1_5_1.test.ts` supersedes it.

---

### Updated Wave 3: Walter/Bob Ecosystem — Test Cleanup Addition

Add to existing Wave 3 scope:
- Delete `server/tests/diagnostic-system.test.ts` (466 lines — Walter diagnostic tests)
- Delete `server/tests/phase-6.0-simulations.test.ts` (229 lines — Walter corpus/Bob tests)
- Remove Walter-related test scenarios from `server/services/auto_test_harness.ts` (scenarios 2-4 reference NLAI)

### Updated Wave 4.7: NLAI Removal — Test Cleanup Addition

Add to existing Wave 4.7 scope:
- Remove NLAI-referencing test scenarios from `auto_test_harness.ts`

### Updated Wave 6: L-Series Removal — Validation Service Cleanup

Add to existing Wave 6 scope:
- Update `paper_validation_engine.ts` to remove DCE/GASP metric sources
- Update `m3b-validation-service.ts` to remove DCE coupling

---

## PHASE 10 CHANGELOG

**Phase 10 additions (2026-02-17)**:
- **2 stale test files** identified for deprecated Walter/Bob systems: `diagnostic-system.test.ts` (466 lines) and `phase-6.0-simulations.test.ts` (229 lines). Both import Walter/Bob services that will fail on Wave 3 removal.
- **3 runtime validation services** reference legacy L-Series systems: `paper_validation_engine.ts` (DCE, GASP), `auto_test_harness.ts` (NLAI), `m3b-validation-service.ts` (DCE). These need updates during respective removal waves.
- **1 stale schema version test**: `schema_v1_5.test.ts` asserts v1.5.0 while current schema is v1.5.8.
- **Test cleanup actions** added to Wave 3, Wave 4.7, and Wave 6 scopes.
- **No new removal waves created** — all Phase 10 findings slot into existing wave scopes.

**Phase 10 Addendum applied (2026-02-17)**:
- **ADD-1 (Legacy Test Suite Audit)**: Kyle directive to systematically audit all tests referencing Walter, Bob, DCE, NGC, CWQI, NLAI. Per-test decision: remove / archive / refactor / keep behind legacy flag. Strengthens existing Phase 10 legacy test findings. **Important distinction per Kyle**: tests that assert legacy metrics are _absent_ (anti-regression guards like `directive-11.0E.2.test.ts`) are _positive architectural guards_ and should be KEPT. Only tests that _import and exercise_ deprecated services should be removed/refactored.
- **ADD-2 through ADD-5**: These are improvement directives (test runner scripts, frontend test plan, documentation, property-based testing) tracked in CHANGES_AND_FIXES.md — not removal items, so not added to this document.

---

## PHASE 11 LEGACY FINDINGS — Database Schema Dead Surface

### Legacy Table Inventory by Removal Wave

Phase 11 identified **~71 legacy tables (~44% of ~160 total)** in `shared/schema.ts`. These tables should be dropped during their respective removal waves, after confirming zero rows:

#### Wave 3 (Walter/Bob) — 10 tables to drop

| Table | Purpose |
|-------|---------|
| `walter_chats` | Chat sessions |
| `walter_pending_approvals` | Approval queue |
| `walter_chat_logs` | Messages |
| `walter_approvals_audit` | Approval history |
| `walter_execution_log` | Action execution |
| `walter_purpose` | Purpose config |
| `walter_memory` | Memory store |
| `walter_user_preferences` | UI preferences |
| `walter_actions` | Autonomous actions |
| `execution_config` | Auto-execution config |

Also drop 3 Walter-specific enums: `walterActionTypeEnum`, `walterActionStatusEnum`, `walterActionCategoryEnum`.

Also remove Walter-related methods from `server/storage.ts` (4,580 lines).

#### Wave 6 (L-Series Cognitive) — ~32 tables to drop

All tables from Phases 8.6–10.0 (L-Series cognitive architecture):
- Phase 8.6.3: `data_lineage`, `bob_trace_log`
- Phase 8.7: `intent_audit_log`, `context_bridge_log`
- Phase 8.8: `reasoning_trace`, `reasoning_queue`, `memory_audit_log`, `cognitive_tuning_log`
- Phase 8.9: `autonomy_audit_log`, `meta_reasoning_log`, `awareness_state_log`
- Phase 9.0: `experience_memory_log`, `alignment_policies`, `alignment_audit_log`, `goal_alignment_profile`
- Phase 9.2: `strategic_plan_log`, `learning_weight_profile`
- Phase 9.3: `strategic_simulation_log`, `decision_trace_log`, `strategic_memory_snapshot`
- Phase 9.4: `reflection_log`, `decision_quality_audit`
- Phase 9.5: `value_alignment_matrix`
- Phase 9.6: `collaboration_sessions`, `collaboration_messages`, `consensus_snapshots`
- Phase 9.7: `agent_learning_feedback`
- Phase 9.8: `meta_cognition_log`
- Phase 9.9: `strategic_memory_archive`, `model_calibration_log`
- Phase 10.0: `cognitive_core_state`, `agent_registry`

Also drop ~25 associated L-Series enums (collaboration, consensus, reflection, alignment, bias, knowledge, etc.).

#### Wave 6 (L-Series continued) — ~16 ethics/governance tables to drop

Phases 11–16 ethics, safety, and governance framework:
- Phase 11.0: `safety_policy`, `safety_event_log`, `kill_switch` (Phase 11 — NOT the active `kill_switch_events`)
- Phase 13.0: `ethical_principle`, `ethical_violation_log`
- Phase 14.0: `federated_ethics_state`, `cross_agent_ethics_session`, `ethics_conflict_register`, `ethics_propagation_journal`
- Phase 15.0: `bias_observation_log`, `confidence_drift_log`, `introspection_report`, `bias_correction_log`
- Phase 16.0: `knowledge_retrieval_log`, `knowledge_cache`, `knowledge_trust_record`

Also drop ~15 associated governance enums.

#### Wave 6 (L-Series continued) — 9 distributed cluster tables to drop

Phases 17–18 distributed cluster framework:
- Phase 17.0: `cluster_node`, `cluster_task_queue`, `cluster_result_log`, `cluster_bus_event`
- Phase 17.5: `cluster_circuit_breaker`
- Phase 17.6: `cluster_audit_log`
- Phase 18: `agent_learning_delta`, `model_consistency_snapshot`, `cross_node_alignment_log`

Also drop associated cluster enums.

#### Wave 10 (New — Database Cleanup) — 4 tables to drop

Paper-specific duplicate tables and superseded V1 tables:
- `paper_trades` (explicitly marked legacy, line 1226)
- `paper_daily_briefs` (duplicate of mode-aware `daily_briefs`)
- `paper_ai_reports` (duplicate of mode-aware `ai_reports`)
- `guardrails` (V1, superseded by `guardrails_v2`)

**Difficulty**: EASY — these are simple `DROP TABLE` operations after confirming zero active consumers. Must be done AFTER dropping FK references and BEFORE dropping enums.

### Legacy Table Pre-Drop Audit Requirement (ChatGPT Correction)

**Important**: Not all "legacy" tables are fully inert. Some may still have active writers from background services or lazy-loaded modules. Before dropping any table:

1. **Verify zero active writers**: Check storage.ts and all service files for INSERT/UPDATE operations on the table
2. **Classify**: "Inert — Safe to Drop" (zero writers confirmed) vs. "Deprecated — Removal Required" (active writers that must be disconnected first)
3. **Safe removal order**: Modularize storage.ts → Remove legacy storage methods → Drop tables from schema.ts → Drop tables from database

### Migration Infrastructure Cleanup (Phase D)

- Consolidate `migrations/` and `drizzle/migrations/` into a single directory
- Ensure all migration files are tracked in the Drizzle Kit journal
- **Migration rebaseline** (ChatGPT recommendation): Generate a fresh baseline migration from current schema.ts state. This becomes the new `0000`, capturing the full current schema. Archive all previous migration files. This addresses RISK-080 (schema not reconstructable from migration history).
- Switch from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate` for controlled, reviewable migrations

### storage.ts Cleanup (Phase B — Must Come BEFORE Table Drops)

**Critical ordering constraint**: storage.ts must be modularized BEFORE legacy tables are dropped. If tables are dropped while storage methods still reference them, runtime errors will occur.

**Phase B order**:
1. Split `storage.ts` (4,580 lines) into domain-specific modules:
   - `trading-storage.ts` — core trading CRUD
   - `walter-storage.ts` — Walter methods (marked for Wave 3 deletion)
   - `telemetry-storage.ts` — telemetry/audit CRUD
   - `ai-storage.ts` — AI reports, conversations, transparency
   - `goals-storage.ts` — Goals presets and learning
   - `system-storage.ts` — Config, context, diagnostics
2. Delete `walter-storage.ts` during Wave 3
3. Delete L-Series, ethics, cluster methods from relevant modules during Wave 6
4. Delete paper duplicate and V1 guardrails methods during Wave 10

### Index & Retention Hygiene (Phase E)

- Run `pg_stat_user_indexes` audit to identify unused indexes across ~200+ index definitions
- Drop zero-scan indexes (especially on legacy tables that will be dropped anyway)
- Implement time-based retention policies for append-only tables (RISK-082):
  - Hot tier (0–30 days): Full fidelity
  - Warm tier (30–90 days): Aggregate summaries
  - Cold tier (90+ days): Archive or delete
- Consider time-based partitioning for high-volume tables: `telemetry_history`, `paper_sim_trade_logs`, `execution_attempt_audit`, `safety_telemetry`, `error_logs` (RISK-079)

### LATTI Residual Fields — system_context Cleanup

The `system_context` table contains deprecated LATTI (Latent Attention Through Transparent Intent) fields for coherence tracking and attention management. These fields have default values maintained by the system but serve no active purpose. Audit system_context columns and remove LATTI-specific fields during Wave 6 or dedicated cleanup pass (RISK-081).

### Database Cleanup Strategy — 5-Phase Approach (ChatGPT Endorsed)

The full database cleanup should follow this phased approach, which aligns with and extends the existing wave-based deprecation plan:

| Phase | Name | Scope | Depends On |
|-------|------|-------|-----------|
| **A** | Isolation | Confirm which legacy tables still have active writers. Tag each as "inert" or "deprecated-with-writers." | Nothing — can start immediately |
| **B** | Modularization | Split storage.ts into domain modules. Decouple storage from schema before removals. | Phase A (need writer inventory) |
| **C** | Schema Simplification | Drop legacy tables in wave order (3 → 6 → 10). Remove ~40 legacy enums. Clean dead schema.ts definitions. | Phase B (storage decoupled) |
| **D** | Migration Rebaseline | Generate fresh baseline migration. Archive old files. Switch to generate+migrate workflow. | Phase C (schema simplified) |
| **E** | Index & Retention Hygiene | Audit index usage. Drop unused indexes. Implement retention policies. Consider partitioning. | Phase C (legacy tables gone) |

**This 5-phase approach maps to the existing wave system**: Phase A is pre-work for all waves. Phase B happens before Wave 3. Phase C IS Waves 3/6/10 (table drops). Phases D and E are post-wave cleanup.

### Wave 3: Cortex System Addition

Add to existing Wave 3 scope:
- Remove `server/services/cortex/cortex-core.ts` (393 lines)
- Remove `server/services/cortex/cortex-config.yaml` (20 lines)
- Remove `server/services/cortex/cortex-memory.json`
- Remove `server/services/cortex/cortex-registry.json`
- Remove `server/services/cortex/analytics-scheduler.ts` (250 lines)
- Remove 4 Cortex API endpoints (`/api/cortex/status`, `/api/cortex/snapshot`, `/api/cortex/flush`, `/api/cortex/force-sync`)
- Audit and decouple 9+ consuming services: `config-change-handler.ts`, `context-refresh-coordinator.ts`, `contextual-nlai-interpreter.ts`, `corpus-domain-service.ts`, `phase-8.6.5-enhancements.ts`, `purpose-layer.ts`, `bob-config.ts`, `autonomy-controller.ts`, `system-truth-diagnostic.ts`

---

## PHASE 11 CHANGELOG

**Phase 11 additions (2026-02-17)**:
- **~71 legacy tables identified** (~44% of ~160 total): 10 Walter tables (Wave 3), 32 L-Series cognitive tables (Wave 6), 16 ethics/governance tables (Wave 6), 9 distributed cluster tables (Wave 6), 3 paper-specific duplicates + 1 V1 guardrails (new Wave 10).
- **~40 legacy enum definitions** associated with legacy tables — must be dropped after table drops.
- **Wave 10 (Database Cleanup)** created: Drop paper duplicate tables and superseded guardrails V1.
- **Migration cleanup** flagged: dual directories, untracked files, push-based workflow.
- **storage.ts cleanup** added to Wave 3/6/10 scopes — remove dead storage methods after table drops.
- **Database table drops** added to Wave 3, Wave 6 scopes.

**Phase 11 Addendum applied (2026-02-17)** — ChatGPT feedback + Cortex/Tab audit:
- **Legacy table nuance**: Not all ~71 legacy tables are inert — some have active writers. Added pre-drop audit requirement (verify zero writers before dropping). Safe order: modularize storage → remove methods → drop schema → drop tables.
- **Migration rebaseline**: Added recommendation to generate fresh baseline migration from current schema.ts (RISK-080). Archive old migration files. Switch to generate+migrate workflow.
- **Index & retention hygiene**: Added Phase E for `pg_stat_user_indexes` audit, unused index removal, time-based retention policies, and table partitioning consideration (RISK-078, RISK-079, RISK-082).
- **LATTI residual fields**: Added system_context cleanup for deprecated LATTI fields (RISK-081).
- **5-phase database cleanup strategy**: Endorsed from ChatGPT — Phase A (Isolation) → B (Modularization) → C (Schema Simplification) → D (Migration Rebaseline) → E (Index & Retention Hygiene). Maps to existing wave system.
- **Cortex system added to Wave 3**: 6 files, 4 API endpoints, 9+ consuming services. ACTIVE at runtime — must be removed with Walter/Bob (RISK-083).
- **Frontend tab catalog completed**: 91 total tab "sub-pages" across 11 pages and 5 components. Legacy Walter tabs identified in settings.tsx, enhanced-system-monitoring.tsx, ai-transparency.tsx — added to Wave 3.1 scope. BUG-022 (duplicate tab value) discovered.

---

**AUDIT COMPLETE**: All 11 phases of the systematic repository audit are now finished. Post-audit addendum applied with ChatGPT database feedback, Cortex investigation, and frontend tab catalog. The Legacy Deprecation Plan tracks removal of: dead services/files across 10 waves, ~71 legacy database tables, ~40 legacy enum definitions, Cortex system (6 files), 91 frontend tab sub-pages cataloged (4 legacy tabs identified), and coordinated cleanup of storage methods, test files, migration infrastructure, and index/retention hygiene.

---

*Registry closed. All items tracked across Phases 1–11 plus post-audit addendum.*
