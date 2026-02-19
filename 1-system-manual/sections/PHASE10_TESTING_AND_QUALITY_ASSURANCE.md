# Phase 10: Testing & Quality Assurance

> **Author**: Claude Code (System Cartographer)
> **Date**: 2026-02-17
> **Scope**: Test frameworks, test suites, runtime validation services, diagnostic infrastructure, code quality tooling, coverage analysis
> **Status**: Complete

---

## 1. Testing Infrastructure Overview

DawnTrader uses a **multi-layered quality assurance architecture** spanning compile-time, build-time, runtime, and operational-time validation. The system does NOT rely solely on traditional unit tests — it combines formal test suites with an extensive runtime validation and diagnostic infrastructure.

### Test Frameworks

| Framework | Version | Purpose | Config File |
|-----------|---------|---------|-------------|
| **Vitest** | ^3.2.4 | Server-side unit & integration tests | `vitest.config.ts` |
| **Playwright** | ^1.56.1 | End-to-end browser tests | `playwright.config.ts` |
| **@vitest/ui** | ^3.2.4 | Vitest visual dashboard | (via vitest) |

### What Is NOT Present

- **No frontend component tests** — zero `*.test.tsx` or `*.spec.tsx` files exist under `client/`
- **No @testing-library** — React Testing Library is not installed
- **No Jest** — not configured, not installed
- **No CI/CD pipelines** — no `.github/workflows/`, `.gitlab-ci.yml`, or `Jenkinsfile`
- **No test scripts in package.json** — no `"test"`, `"test:unit"`, or `"test:e2e"` scripts defined
- **No Prettier** — no `.prettierrc` configuration
- **No Husky** — no `.husky/` directory or pre-commit hooks
- **No lint-staged** — no pre-commit lint enforcement
- **No dedicated mock/fixture directories** — no `__mocks__/`, `fixtures/`, or `test-utils/` directories
- **No coverage reports on disk** — no `coverage/` directory or `lcov.info` files exist

---

## 2. Vitest Configuration

**File**: `vitest.config.ts` (19 lines)

```
- globals: true (no explicit vitest imports required)
- environment: 'node'
- include: ['server/**/*.test.ts']
- coverage reporters: text, json, html
- coverage exclude: node_modules/, dist/
- alias: @shared → shared/
```

**Key characteristics**:
- Tests are server-only — the glob pattern `server/**/*.test.ts` excludes all client code
- The `globals: true` setting allows tests to use `describe`, `it`, `expect` without importing from vitest (explains why `symbol-canonicalizer.test.ts` has no vitest import)
- Coverage is configured but no coverage reports exist on disk, suggesting coverage has never been run or reports are gitignored
- No setup files, no global mocks, no test environment customization

---

## 3. Playwright Configuration

**File**: `playwright.config.ts` (31 lines)

```
- testDir: './e2e'
- fullyParallel: false (sequential execution)
- workers: 1 (single worker)
- retries: 2 in CI, 0 locally
- forbidOnly: true in CI
- reporter: html
- trace: 'on' (always capture)
- video: 'on' (always record)
- screenshot: 'on' (always capture)
- baseURL: http://localhost:5000
- browser: Chromium only (Desktop Chrome)
- webServer: expects already-running server (reuseExistingServer: true)
```

**Key characteristics**:
- Sequential execution (not parallel) — appropriate for tests that modify system state
- Full artifact capture (trace, video, screenshot) even in non-CI mode
- Requires a manually-started server — Playwright does not start the application
- Only Chromium is configured — no cross-browser testing

---

## 4. Test Suite Inventory

### 4.1 Total Test File Count

| Category | Location | Count | Lines (approx) |
|----------|----------|-------|-----------------|
| Server Unit Tests | `server/tests/unit/` | 31 | ~7,100 |
| Server Integration Tests | `server/tests/integration/` | 13 | ~2,500 |
| Server System Tests | `server/tests/system/` | 2 | ~640 |
| Server Invariant Tests | `server/tests/invariants/` | 1 | ~70 |
| Server Root Tests | `server/tests/*.test.ts` + `*.ts` | 6 | ~1,930 |
| Server __tests__ | `server/__tests__/` | 3 | ~530 |
| Server Colocated | `server/services/utils/` | 1 | ~75 |
| E2E Tests | `e2e/` | 2 | ~750 |
| Root Tests | `tests/` | 1 | ~140 |
| **TOTAL (active codebase)** | | **60** | **~13,735** |
| Training/Docs (stale copies) | `docs/training/Walter_Learning_Files/` | 3 | (copies of server tests) |

### 4.2 Server Unit Tests (31 files in `server/tests/unit/`)

Tests are organized by directive number, reflecting the phased development history:

| File | Lines | Directive | What It Tests |
|------|-------|-----------|--------------|
| `adaptive-kalman.test.ts` | 384 | 9.3 | Kalman filter cold start, ER calculator, adaptive R/Q, filter registry, state persistence |
| `adaptive-scan-manager.test.ts` | 200 | 10.8 | Dual-pool scheduler (60/40 split), PairFailureTracker cooldown, batch generation |
| `analysis-utils.test.ts` | 186 | 9.1.H | Core metric functions: LQ, DI, VolNoise, Sigma, filter thresholds, volume classification |
| `canonical-validation.test.ts` | 159 | 11.4F.1 | Trade validation middleware: ghost regime normalization, legacy strategy normalization, violation levels |
| `canonical_source_lock.test.ts` | 116 | 11.4F.1B | Codebase scan: no legacy `regime-strategy-map.ts` imports; canonical file exports all 15 required items |
| `covariance-engine.test.ts` | 321 | 9.4 | Covariance matrix symmetry, correlation bounds, portfolio variance, numerical stability |
| `directive-11.0E.2.test.ts` | 345 | 11.0E.2 | VTS pipeline isolation: Phase-10 metrics, legacy removal from VTS interfaces, cache sandboxing |
| `directive-11.4B.2-R1.test.ts` | 252 | 11.4B.2-R1 | Adaptive scanning: ideal pool flush, 100-pair cycle guarantee, underflow protection |
| `directive-11.4C-R2.test.ts` | 222 | 11.4C-R2 | Top batch UI: retry logic, getRankedPairs format, no legacy pool references |
| `directive-11.4C.3-harmonization.test.ts` | 216 | 11.4F.1 | Strategy/regime harmonization: snake_case naming, legacy mapping, hybrid integrity |
| `directive-11.7R-E-enforcement.test.ts` | 198 | 11.7R-E | Enforcement regression: UNSTABLE + vwap_pullback blocked pre-score, HIGH dependency blocking |
| `directive-11.7R-governance.test.ts` | 267 | 11.7R | Regime transition governance: STABLE/TRANSITION/UNSTABLE classification, multipliers, cooldowns |
| `directive-11.7S-strategy-modes.test.ts` | 257 | 11.7S | Strategy mode modulation: NORMAL/DEFENSIVE/SURVIVAL overlays, confidence floors, mode stats |
| `execution-config.test.ts` | 54 | 11.0D | EXECUTION_CONFIG immutability, adaptive sizing params, trailing stop params |
| `filter-insights.test.ts` | 441 | 10.9C | Filter insights service: 9 active filters, schema v1.3.1, rolling 24h window, telemetry |
| `finalscore-equivalence.test.ts` | 201 | 11.0E | FinalScore formula: canonical weights, fallback, clamping, NaN detection, idempotency |
| `hybrid-integration.test.ts` | 385 | 10.4 | Ensemble scoring, confluence detection, strategy selection, pattern decay, timeframe guard |
| `ml-calibration.test.ts` | 173 | 10.6 | ML learning loop: weight adjustment recs (INCREASE/DECREASE/HOLD), pattern grouping |
| `multi-timeframe.test.ts` | 507 | 10.7 | Fractal vision: timeframe config, weight hierarchy, rate limiter, cascade criteria, decay lambda |
| `pattern-recognizer.test.ts` | 249 | 10.2 | Candlestick patterns: PINBAR, ENGULFING, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR |
| `recalibration_integrity.test.ts` | 361 | 11.7D.1 | Predictive adjustments: file locking, log schema, telemetry integrity validation |
| `regime_mapping_integrity.test.ts` | 147 | 11.7F | Codebase scan: no hardcoded regime strings outside /config/ — must use REGIMES.* constants |
| `runtime_signal_consistency.test.ts` | 123 | 11.4F.1 | SignalType consistency: all 17 strategies → canonical type, uppercase enforcement |
| `score-weights.test.ts` | 253 | 10.9A | SCORE_WEIGHTS: immutability, version v1.0.1, inline FinalScore calculation consistency |
| `signal_mapping_integrity.test.ts` | 168 | 11.4F.1 | Signal mapping: 17 strategies → signalType, legacy normalization chain, ISO timestamps |
| `sqe-config-dynamic.test.ts` | 139 | 11.0D | SQE dynamic config: FinalScore backfill, RegimeWeight calculation from trend/volatility |
| `tco-tec-tcl.test.ts` | 400 | 11.0B | Component boundaries: TCL methods, SQE thresholds, TEC monitoring/trailing, TCO file removed |
| `telemetry-aggregator.test.ts` | 207 | 10.8 | Telemetry aggregator: pair recording, composite score, top/rotational pairs, cascade efficiency |
| `trailing-exit.test.ts` | 239 | 9.2.H | Trailing exit controller: dynamic stop distance (K'), break-even trigger, target lock, persistence |
| `vn_parity.test.ts` | 114 | 11.7H | VN parity: IMF vs canonical analysis-utils produce identical VolNoise values |
| `vts-modernization.test.ts` | 320 | 11.0E.1 | VTS modernization: regime calculator, strategy mapping, pattern preloader, Phase-10 record structure |

### 4.3 Server Integration Tests (13 files in `server/tests/integration/`)

| File | Lines | Directive | What It Tests |
|------|-------|-----------|--------------|
| `adaptive_scanning.test.ts` | 209 | 11.2 R1 | AdaptiveRatioManager, pool score computation, scan batch generation |
| `config-provenance.test.ts` | ~150 | Phase 27 | Config snapshot provenance metadata and sources |
| `cost_cache.test.ts` | 215 | 11.3B | Exchange defaults, in-memory cost cache (TTL, clamping, performance <0.1ms/lookup) |
| `cost_telemetry.test.ts` | ~160 | 11.3 | Cost model telemetry persistence and retrieval |
| `dss.test.ts` | 177 | 10.1.E | DSS regime detection (6 regimes), veto behavior, strategy selection by confidence + NetEV |
| `dynamic_sizing.test.ts` | ~180 | 11.0 | Dynamic position sizing: expand/contract multipliers, risk limits |
| `market_indicators_narrative.test.ts` | ~200 | 10.8 | Market narrative generation from indicators |
| `net_expectancy.test.ts` | 231 | 11.3A | Net expectancy: canonical cost model, net geometry, conditional refresh logic |
| `schema_v1_5.test.ts` | 119 | 11.0F | Schema v1.5.0: metric engine version, FinalScore weights, legacy metric removal |
| `schema_v1_5_1.test.ts` | ~120 | 11.0F | Schema v1.5.1: incremental schema validation |
| `telemetry_persistence_sql.test.ts` | 206 | 11.1A | SHA-256 checksums, environment guard, true mode provenance |
| `telemetry_provenance_patch.test.ts` | ~150 | 11.1 | Telemetry provenance patching and migration |
| `telemetry_rehydration_e2e.test.ts` | ~200 | 11.1 | Telemetry cache rehydration from SQL storage |

### 4.4 Server System Tests (2 files in `server/tests/system/`)

| File | Lines | Directive | What It Tests |
|------|-------|-----------|--------------|
| `mapping_drift_integrity.test.ts` | 294 | 11.7F | DriftScore computation, EMA smoothing, bridge JSON/Markdown validation, schema version `v1.4c` |
| `predictive_diagnostics_integrity.test.ts` | 345 | 11.7G | Predictive diagnostics: filter descriptions, status colors, telemetry stats, decision cap (100), pass rate |

### 4.5 Server Invariant Tests (1 file in `server/tests/invariants/`)

| File | Lines | What It Tests |
|------|-------|--------------|
| `guardrails-deprecation.test.ts` | 71 | Legacy `getGuardrails()` throws `[9.7] Deprecated`; V2 methods work; legacy method available for debug |

### 4.6 Server Root Tests (6 files in `server/tests/`)

These are a mix of Vitest tests and standalone scripts:

| File | Lines | Framework | What It Tests |
|------|-------|-----------|--------------|
| `diagnostic-system.test.ts` | 466 | **Standalone script** | Phase 5.9: 11 diagnostic scenarios (Walter, Bob, log search, schema verify, patch proposal) |
| `phase-6.0-simulations.test.ts` | 229 | Vitest | Phase 6.0: Walter expert corpus, Bob identity, UX templates, knowledge refresh |
| `live-pricing-validation.ts` | 414 | **Standalone script** | Phase 27.F.15.D: Live pricing adapter lifecycle, mock price generation, TTL, multi-symbol |
| `system-verify.ts` | 242 | **Standalone script** | System sync: health endpoint, paper trading start/stop, goals creation, dashboard resync |
| `test-force-trade.ts` | 157 | **Standalone script** | Phase 27.F.14: PAPER_FORCE_TRADE_SYMBOL feature, DB query verification |
| `metrics-core-msi-validation.ts` | ~200 | **Standalone script** | Metrics core MSI validation |

### 4.7 Server __tests__ (3 files in `server/__tests__/`)

| File | Lines | What It Tests |
|------|-------|--------------|
| `smoke.test.ts` | 21 | Basic sanity: logger exists, date formatting, P/L percentage math |
| `config-snapshot-api.test.ts` | 412 | Phase 27.G: Config Snapshot API (HTTP integration, auth, schema, provenance, legacy compliance) |
| `friction-mapping.test.ts` | 97 | Directive 11.4B: 4-tier friction color mapping boundary tests |

### 4.8 E2E Tests (2 files in `e2e/`)

| File | Lines | Framework | What It Tests |
|------|-------|-----------|--------------|
| `config-snapshot.spec.ts` | 248 | Playwright | Phase 27.G: Config Snapshot Viewer UI — tabs, schema hash, clipboard, refresh, legacy badge |
| `phase-41F-L-e2e-validate-flow.spec.ts` | 505 | Playwright | Phase 41F-L: Full pipeline validation — login, kill switch, engine start, Kraken load, filter insights, RTB signals, trade execution, portfolio update, backend lineage verification. Generates markdown report + NDJSON lineage trace |

### 4.9 Root Tests (1 file in `tests/`)

| File | Lines | Framework | What It Tests |
|------|-------|-----------|--------------|
| `phase-41F-L-simulation.spec.ts` | 138 | Playwright | Phase 41F-L: Three-trade paper simulation (BTC, ETH, BTC sell), portfolio state verification |

### 4.10 Colocated Test (1 file)

| File | Lines | What It Tests |
|------|-------|--------------|
| `server/services/utils/symbol-canonicalizer.test.ts` | 75 | Symbol canonicalization: Kraken ID ↔ canonical (BTC/USD) conversion |

---

## 5. Test Characteristics and Patterns

### 5.1 Testing Approach: Real Imports, No Mocking

A defining characteristic of DawnTrader's test suite is that **virtually no tests use mocking frameworks**. Tests import and test against **real service code**:

- No `jest.mock()`, no `vi.mock()`, no Sinon
- No mock objects or test doubles for service dependencies
- Some tests use `vi.spyOn(console, 'log')` for telemetry output verification
- `vi.resetModules()` used once (for environment variable isolation in telemetry tests)
- Two tests use filesystem scanning to enforce codebase-wide invariants

This approach means:
- Tests are high-fidelity (testing real behavior, not mock behavior)
- Tests are tightly coupled to implementations (fragile to internal refactoring)
- Tests cannot run in isolation from the database/server for integration tests
- Constructor/initialization failures cascade across test suites

### 5.2 Directive-Linked Tests

Tests are systematically linked to specific development directives:

| Directive Range | Phase | Domain |
|----------------|-------|--------|
| 9.1 – 9.4 | Phase 9 | Core math (metrics, Kalman, trailing exits, covariance) |
| 10.1 – 10.9 | Phase 10 | Trading infrastructure (DSS, patterns, hybrid, multi-timeframe, telemetry, filters) |
| 11.0 – 11.7 | Phase 11 | Architecture modernization (VTS pipeline, component boundaries, governance, enforcement) |
| Phase 27 | — | Config snapshot, live pricing |
| Phase 41F | — | Health monitoring, E2E validation |

This provides traceability from tests back to the specifications they verify.

### 5.3 Codebase Scanning Tests

Two unit tests use filesystem scanning to enforce architectural rules:

1. **`regime_mapping_integrity.test.ts`**: Recursively walks `server/` looking for hardcoded regime strings (`BULL_STABLE`, etc.) outside of `/config/` and `/tests/`. Ensures all regime references use `REGIMES.*` constants.

2. **`canonical_source_lock.test.ts`**: Scans all `.ts` files for imports from the legacy `regime-strategy-map.ts` (only `canonical-regime-strategy-map.ts` is allowed). Verifies the legacy file does not exist on disk.

These are architectural invariant tests — they prevent regression at the source code level rather than at runtime.

### 5.4 Governance Invariant System

Tests reference specific **M-numbered governance invariants** (audit checkpoints):

| Invariant Range | Domain |
|----------------|--------|
| M45 – M49 | Trade record structure, regime calculation |
| M50 – M54 | VTS data pipeline isolation |
| M63 – M64 | Adaptive scanning pool management |
| M65 – M67 | UI integration, legacy cleanup |

### 5.5 Schema Version Assertions

Multiple tests assert specific schema versions, creating **version lock contracts**:

| Schema | Version | Test File |
|--------|---------|-----------|
| Backend | v1.4.3 | `tco-tec-tcl.test.ts` |
| Schema | v1.5.0 | `schema_v1_5.test.ts` |
| Schema | v1.5.2 | `telemetry_persistence_sql.test.ts` |
| Schema | v1.5.7 | `net_expectancy.test.ts` |
| Schema | v1.5.8 | `cost_cache.test.ts` |
| VTS Pipeline | v1.6.7 | `directive-11.0E.2.test.ts` |
| Regime Mapping | v1.4c | `mapping_drift_integrity.test.ts` |
| Filter | v1.3.1 | `filter-insights.test.ts` |
| Score Weights | v1.0.1 | `score-weights.test.ts` |
| Predictive Diagnostics | v1.0 | `predictive_diagnostics_integrity.test.ts` |
| Governance | v1.0/v1.1 | governance tests |
| Strategy Modes | v1.0 | `directive-11.7S-strategy-modes.test.ts` |
| Predictive Adjustments | v1.0 | `recalibration_integrity.test.ts` |

**Risk**: If any schema version is bumped without updating the corresponding test, that test fails. Multiple tests may pin different schema versions (e.g., `schema_v1_5.test.ts` asserts v1.5.0 while `cost_cache.test.ts` asserts v1.5.8), creating a version staleness gradient.

---

## 6. Standalone Test Scripts (Non-Framework)

Four test files in `server/tests/` are NOT Vitest tests — they are standalone scripts with custom test runners:

| File | Lines | Execution | Requires |
|------|-------|-----------|----------|
| `diagnostic-system.test.ts` | 466 | `import.meta.url` self-invoke | Running server + database |
| `live-pricing-validation.ts` | 414 | Exported `runLivePricingValidation()` | Kraken adapter (mock mode) |
| `system-verify.ts` | 242 | `main()` → `process.exit()` | Running server at localhost:5000 |
| `test-force-trade.ts` | 157 | Shebang (`#!/usr/bin/env tsx`) | Running server + database |

These scripts:
- Cannot be discovered or run by Vitest (no `describe`/`it` blocks for most)
- Require manual invocation (`tsx server/tests/system-verify.ts`)
- Have custom pass/fail counting with no standard exit codes (except `system-verify.ts`)
- Mix Vitest-compatible naming (`*.test.ts`) with non-Vitest execution patterns

---

## 7. Runtime Validation Services (Operational QA)

Beyond the formal test suite, DawnTrader has an extensive **runtime validation layer** — services that run during live/paper operation to continuously validate system correctness.

### 7.1 REB (Runtime Evaluation Buffer) Infrastructure

| Service | Lines | What It Validates |
|---------|-------|-------------------|
| **REB 2.12 Test Harness** (`reb-2-12-test-harness.ts`) | 879 | 15 deterministic filter validation tests: volume, liquidity, price, volatility, spreads, stablecoins, regulated assets, universe sizing, multi-filter interaction. Bypasses 30s scan interval for controlled testing. |
| **REB 2.14 Historical Test** (`reb-2-14-historical-test.ts`) | ~300 | Historical data integrity verification |
| **REB 2.15 Certification** (`reb-2-15-certification.ts`) | 605 | Multi-cycle FX5 pipeline certification (default 6 cycles). Analyzes drift (CV >30% = significant), survivor consistency (>70% = consistent), pool behavior (phantom/duplicate detection), REB 2.10 coupling. PASS criteria: no errors, no significant drift, healthy pool. |

### 7.2 Paper Validation Engine

**File**: `paper_validation_engine.ts` (468 lines)
**Directive**: 8.8.4-M5

Captures adaptive metrics at 10-second intervals during paper-trading sessions (up to 60 minutes). Validates:

| Criterion | Threshold | Pass Condition |
|-----------|-----------|----------------|
| Feed latency | 100ms | Average < 100ms |
| Cache window | 200 entries | >= 200 latency records |
| ARA updates | 3 | >= 3 updates |
| Adaptive relevance variance | 0.01 | Range > 0.01 |
| CWQI/NGC drift | 10% | Max step-to-step drift < 10% |
| VTS mode switch delay | 1 | Always passes (placeholder) |

Writes validation reports to `reports/ValidationRun_<timestamp>.json`.

### 7.3 M3B Validation Service

**File**: `m3b-validation-service.ts` (250 lines)
**Directive**: 8.8.4-M3B

Validates adaptive coupling integrity:
1. Static decay removed (ARA formula: `relevance = learningRate * (gsi + 0.15)`)
2. ARA linked to VTS/DCE (contextStability > 0, learningRate > 0)
3. Adaptive risk working (suggested risk/exposure > 0)
4. CWQI variance healthy (range [0, 0.5])
5. NGC average healthy (placeholder — always passes)
6. Pearson correlation between CWQI variance and exposure > 0.3

Report: PASS (6/6), PARTIAL (≥3/6), or FAIL (<3/6).

### 7.4 Verification Test Protocol

**File**: `verification-test-protocol.ts` (493 lines)
**Directive**: 8.9.4-VTP

Validates Mini-Book, Sentinel, WebSocket, and REST systems during trading:

| Check | Pass Criteria |
|-------|--------------|
| WS Feed Integrity | ≥95% ticks from WebSocket (not REST fallback) |
| Sentinel Health | <1 reset per hour |
| Price Drift | Max WS-vs-REST divergence ≤0.2% |
| UI Sync | <1% mismatch events |

### 7.5 Auto Test Harness

**File**: `auto_test_harness.ts` (386 lines)
**Phase**: 24

Automates 4 operational test scenarios (13 steps total):
1. Paper Simulation Start/Stop (3 steps)
2. Multi-Intent Command Execution (2 steps)
3. Simulation Heartbeat Monitoring (2 steps)
4. Live Trading Activation Flow (4 steps — requires approval workflow)

Generates markdown and JSON reports.

---

## 8. Canonical Validation Middleware

**File**: `server/middleware/canonical-validation.ts` (214 lines)
**Directive**: 11.4F.1

Runtime middleware that validates every trade against canonical rules before execution:

| Violation Level | Trigger | Trade Outcome |
|----------------|---------|---------------|
| **WARN** | Ghost regime normalized (e.g., BULL_VOLATILE → HIGH_VOL_IMPULSE) | Trade proceeds with normalized values |
| **WARN** | Legacy strategy normalized (e.g., TrendFlow → sma_trend_ride) | Trade proceeds with normalized values |
| **ERROR** | SignalType mismatch for strategy | **Trade rejected** |
| **CRITICAL** | Non-canonical regime/strategy/signalType combination | **Trade rejected** |

Violations logged to `audit/logs/canonical_violation.log`. Stats queryable by level and source.

---

## 9. Schema Validation

### 9.1 Bootstrap Schema Validator

**File**: `server/bootstrap/schema-validator.ts` (98 lines)
**Directive**: 11.7F

Runs at server startup:
- Reads `bridge/canonical/mapping-regime-strategy.json`
- Compares bridge schema version against expected `regime-mapping/v1.4b`
- `validateSchemaVersionsStrict()` throws on mismatch (production mode)
- Minor version differences (within v1.4 family) produce warnings only

### 9.2 Zod Strategy Validators

**File**: `server/services/strategy-validators.ts` (149 lines)

Defines Zod schemas for all 8 strategy parameter sets with numeric constraints:

| Strategy | Key Constraints |
|----------|----------------|
| VWAP Pullback | vwapLookbackMin 1-120, pullbackPct 0.1%-5% |
| ABCD Long | minAtoBStrength 0.1-5, cPullbackPctMax 1%-30% |
| SMA Trend Ride | fastSma 3-50, slowSma 10-200, trendStrengthMin 0-1 |
| Breakout | minConsolidationBars 5-30, breakoutBuffer 0.5-2% |
| Mean Reversion | deviationThreshold 1.5-4%, minRangeTouches 2-4 |
| Range Trading | minRangeDurationHours 4-48, minRangeWidth 2-8% |
| VWAP Bounce | vwapProximity 0.2-1%, volumeMultiplier 1.2-2.0 |
| Liquidity Trap | maxTrapExtension 0.5-2%, trapReturnBars 1-3 |

All strategies share a base schema: `maxConcurrentPositions` (0-20), `riskPerTrade` (0.05%-5%), `takeProfitR` (0.2-10), `stopLossR` (0.1-10), `cooldownMinutes` (0-240).

### 9.3 Drizzle-Zod Database Schema

**File**: `shared/schema.ts`

Uses `createInsertSchema` from `drizzle-zod` for automatic database input validation. Covers 100+ domain-specific enums (trading modes, strategy types, trade status, safety/alignment/policy enums).

---

## 10. Health Monitoring & Diagnostics

### 10.1 Unified Health Monitor

**File**: `server/services/health-monitor.ts`
**Directive**: Phase 41F-C

5-second heartbeat cycle with 250-entry ring buffer (~21 minutes of history):

| Component | Key Metrics |
|-----------|-------------|
| Paper Queue | depth, executing job age, dedup listener count |
| Live Queue | depth, executing job age |
| Paper Engine | isRunning, lastTickAge, lastSignalAge, lastTradeAge, sessionId |
| Live Engine | isRunning, lastTickAge, lastSignalAge |
| Market Data | websocketStatus, lastMessageAge, restFallbackActive |
| SSOT Cache | hits, misses, TTL, activeFilterHash |
| Database | pool (active/idle/total), slowQueries |
| Broadcast Bus | lastEventType, lastLatency, averageLatency |
| External Connectivity | krakenLastSuccess, krakenLastError |

**Alert thresholds**:
- Heartbeat latency: warn 200ms, critical 400ms
- Queue depth: warn 5, critical 10
- Job age: warn 15s, critical 30s
- Broadcast latency: warn 120ms, critical 200ms

### 10.2 Diagnostic Services (15+ files)

Specialized diagnostic modules provide deep inspection of specific subsystems:

| Service | What It Inspects |
|---------|-----------------|
| `diagnostic-controller.ts` | Central diagnostic orchestration |
| `aj16-rtb-diagnostic.ts` | Ready-to-Brief pipeline diagnostics |
| `aj17-diagnostic-runner.ts` | Phase AJ17 diagnostic flows |
| `aj18/19-diagnostic.ts` | Advanced phase diagnostics |
| `b4-diagnostics.ts` | B4 trading diagnostics |
| `c5-financial-diagnostics.ts` | Financial metric diagnostics |
| `i1-rtb-diagnostics-service.ts` | I1 Ready-to-Brief pipeline |
| `paper-sim-diagnostic.ts` | Paper simulation diagnostics |
| `system-truth-diagnostic.ts` | Ground truth verification |
| `task-queue-diagnostics.ts` | Task queue health |

### 10.3 Diagnostic Report Archive

The `diagnostic-reports/` directory contains **80+ archived reports** from various development phases:
- Phase 34-41F validation reports
- Burn-in stability tests (NDJSON logs)
- E2E validation results (JSON, markdown)
- Shell scripts for manual test execution
- Trace files (NDJSON lineage traces)

These represent a comprehensive history of QA activities performed during development, but are point-in-time artifacts rather than continuously-run regression tests.

---

## 11. Code Quality Tooling

### 11.1 ESLint Configuration

**File**: `.eslintrc.json` (34 lines)

Extends `eslint:recommended` with three custom rules:

| Rule | Type | What It Enforces |
|------|------|-----------------|
| No Hardcoded UUIDs | `no-restricted-syntax` (error) | Phase 31.I: UUIDs must come from resolvers/env/config, not inline strings |
| No Legacy Metric Imports | `no-restricted-imports` (error) | Directive 11.0E: Blocks `calculateCWQI`, `calculateNGC`, `computeProfitRate` imports |
| Quality Index Warning | `no-restricted-imports` (warn) | Warns on `**/quality_index*` imports, suggests `score-calculator.ts` instead |

**Not configured**: No React-specific ESLint rules, no TypeScript ESLint plugin, no import ordering rules, no Prettier integration.

### 11.2 TypeScript Configuration

**Root `tsconfig.json`**:
- `"strict": true` — enables all strict type-checking options
- `"target": "ES2020"`, `"module": "ESNext"`
- `"skipLibCheck": true` — does not type-check `node_modules`
- Explicitly **excludes** `**/*.test.ts` from compilation
- Path aliases: `@/*` → `client/src/*`, `@shared/*` → `shared/*`

**Server `server/tsconfig.json`**:
- Extends root, overrides to `"target": "ES2022"`, `"moduleResolution": "bundler"`
- `"noUnusedLocals": false`, `"noUnusedParameters": false` — strict mode but unused variable checks disabled

### 11.3 Build Pipeline

- **Vite** builds the client (`vite build`)
- **esbuild** bundles the server (`esbuild server/index.ts`)
- **`tsc`** available via `npm run check` but not enforced pre-commit
- No build-time test execution — build and test are fully decoupled

---

## 12. Coverage Analysis — What Is Tested vs. What Is Not

### 12.1 Well-Tested Areas

| Domain | Coverage Quality | Key Tests |
|--------|-----------------|-----------|
| **Canonical regime/strategy mapping** | Strong | 5+ tests validate mapping integrity, source lock, signal consistency, drift |
| **FinalScore calculation** | Strong | Equivalence test, score weights, SQE config |
| **Governance enforcement** | Strong | Regime transition, enforcement regression, strategy modes |
| **Cost model** | Strong | Cache, exchange defaults, net expectancy, friction mapping |
| **Telemetry pipeline** | Strong | Persistence, provenance, rehydration, aggregator |
| **Filter pipeline (FX5)** | Strong | REB 2.12 (15 deterministic tests), filter insights, adaptive scanning |
| **Mathematical utilities** | Strong | Kalman filter, covariance engine, analysis-utils, trailing exits, VolNoise parity |
| **E2E paper trading flow** | Strong | Full pipeline validation with lineage tracing (Phase 41F-L) |

### 12.2 Untested Areas

| Domain | Coverage Gap | Risk |
|--------|-------------|------|
| **Frontend (React components)** | **Zero test files** — no component tests, no integration tests, no snapshot tests | HIGH — 189 frontend files with zero test coverage |
| **Signal Orchestrator** | No direct unit tests for the 1,200+ line signal orchestrator | HIGH — core execution path untested |
| **Paper Execution Engine** | No unit tests — only validated through E2E flows | MEDIUM — relies on E2E tests for correctness |
| **WebSocket layer** | No tests for the WebSocket singleton, reconnection logic, or heartbeat | MEDIUM |
| **Authentication/JWT** | No tests for token refresh, singleton lock, backward compatibility | MEDIUM |
| **API routes** | Only 1 API integration test (config-snapshot). 23,349-line routes.ts has no route-level tests | HIGH — massive untested API surface |
| **Database migrations** | No migration tests. Schema validated at startup only | LOW-MEDIUM |
| **Error handling/recovery** | Health monitor tested at schema level but recovery actions are all placeholders | LOW |
| **Cross-browser compatibility** | Playwright only runs Chromium | LOW |

### 12.3 Legacy System Tests

Two test files test systems that have been confirmed as legacy:

| File | Tests | Legacy Status |
|------|-------|--------------|
| `diagnostic-system.test.ts` | Walter diagnostics, Bob inspection | Walter/Bob confirmed dead |
| `phase-6.0-simulations.test.ts` | Walter corpus, Bob identity, UX templates, knowledge refresh | Walter/Bob confirmed dead |

These tests are stale — they test deprecated systems and will either fail (if services are removed) or provide false confidence (if they pass by testing disconnected code).

---

## 13. Staleness Risk Assessment

### Schema Version Conflicts

Multiple tests pin specific schema versions. If the shared `SCHEMA_VERSION` constant has been bumped, older tests will fail:

| Test | Asserts | Risk |
|------|---------|------|
| `schema_v1_5.test.ts` | v1.5.0 | **HIGH** — other tests assert v1.5.2, v1.5.7, v1.5.8 |
| `cost_cache.test.ts` | v1.5.8 | LOW (likely current) |
| `net_expectancy.test.ts` | v1.5.7 | LOW-MEDIUM |
| `telemetry_persistence_sql.test.ts` | v1.5.2 | MEDIUM |

### Test Quality Concerns

| Issue | Files Affected | Impact |
|-------|---------------|--------|
| Re-defines validation logic inline instead of importing | `recalibration_integrity.test.ts` | Tests validate mock logic, not real code |
| Dynamic imports (`await import()`) | `tco-tec-tcl.test.ts`, `net_expectancy.test.ts`, others | Import path correctness only validated at runtime |
| Tests for deprecated Walter/Bob systems | `diagnostic-system.test.ts`, `phase-6.0-simulations.test.ts` | Will fail when Walter is removed |
| Auto test harness imports NLAI | `auto_test_harness.ts` | References deprecated NLAI system |
| Paper validation engine references DCE/GASP | `paper_validation_engine.ts` | References L-Series legacy systems |

---

## 14. Production Concerns

### 14.1 No Test Scripts in package.json

There are no `"test"` scripts defined. To run tests, a developer must know to invoke:
- `npx vitest` (unit/integration)
- `npx playwright test` (E2E)
- `tsx server/tests/system-verify.ts` (standalone scripts)

This means:
- New team members have no obvious entry point for running tests
- Build pipelines cannot use `npm test`
- No single command runs the full test suite

### 14.2 No CI/CD Integration

Without CI/CD pipelines, tests are not automatically run on:
- Pull requests
- Merge to main
- Pre-deployment
- Scheduled regression runs

Tests only run when a developer manually invokes them.

### 14.3 Test-Production Coupling

Since tests import real services (no mocks), integration and system tests require:
- A running PostgreSQL database with proper schema
- A running server at localhost:5000 (for HTTP tests and E2E)
- Network access to Kraken (for some validation scripts)

This makes tests difficult to run in isolation or in CI environments.

### 14.4 Diagnostic Reports as QA Artifacts

The 80+ diagnostic reports in `diagnostic-reports/` represent valuable QA history but are:
- Point-in-time artifacts (not regression tests)
- Not automatically re-generated
- Not verified against current code

---

## 15. Summary Statistics

| Metric | Value |
|--------|-------|
| Total test files | 60 |
| Total test lines (approx) | ~13,735 |
| Unit tests | 31 |
| Integration tests | 13 |
| System tests | 2 |
| Invariant tests | 1 |
| E2E tests | 3 (Playwright) |
| Standalone scripts | 4 |
| Other server tests | 6 |
| Frontend tests | **0** |
| Runtime validation services | 5 (REB 2.12, REB 2.15, Paper Validation, M3B, VTP) |
| Diagnostic services | 15+ |
| Diagnostic reports on disk | 80+ |
| Test frameworks | 2 (Vitest, Playwright) |
| Mocking framework usage | None |
| CI/CD pipelines | **0** |
| Test scripts in package.json | **0** |
| Code coverage reports | **0** (configured but never generated) |
| Pre-commit hooks | **0** |
| Frontend test coverage | **0%** |

---

## 16. Phase 10 Addendum — Kyle's Directives (2026-02-17)

> **Kyle's Final Verdict**: "Claude's Phase 10 audit is: Accurate. Grounded. Technically strong. Well-cataloged. Not inflated. But: It slightly overstates backend execution risk. It understates frontend blind spot. It understates legacy test contamination. It does not address unified QA architecture. Your backend math QA is elite-tier. Your frontend and API QA are light. Your runtime validation systems are extensive but fragmented."

### ADD-1: Legacy Test Suite Audit Required

**Directive**: Identify and tag all tests that reference deprecated systems: Walter, Bob, DCE, NGC, CWQI, NLAI.

**Decision required per test**: Remove / Archive / Refactor / Keep behind legacy flag.

**Rationale**: The current test suite has legacy contamination that will cause cascading failures when deprecated systems are removed in Waves 3, 4.7, and 6. A systematic audit should precede removal waves to prevent CI pipeline blockage (once CI is established per ADD-2).

**Affected test categories**:
- Walter/Bob direct imports: `diagnostic-system.test.ts`, `phase-6.0-simulations.test.ts`
- NLAI references: `auto_test_harness.ts`
- DCE/GASP references: `paper_validation_engine.ts`, `m3b-validation-service.ts`
- NGC/CWQI legacy metric assertions: tests that assert these fields do NOT exist (these are actually healthy — they're anti-regression tests)

**Important distinction**: Tests that assert legacy metrics are _absent_ (e.g., `directive-11.0E.2.test.ts` confirming NGC/CWQI removed from VTS interfaces) are **positive architectural guards**, not legacy contamination. These should be KEPT. Only tests that _import and exercise_ deprecated services should be removed/refactored.

### ADD-2: Create Unified Test Runner Script

**Directive**: Add standard test scripts to `package.json`:

```
"test:unit": "vitest run"
"test:e2e": "playwright test"
"test:all": "npm run test:unit && npm run test:e2e"
```

**Rationale**: Even without CI, standardize the entry point so developers can run `npm run test:unit` instead of discovering `npx vitest` themselves. This is a prerequisite for future CI integration.

### ADD-3: Frontend Test Introduction Plan

**Directive**: Establish minimum frontend test coverage for critical paths:

| Priority | Test Target | Why |
|----------|------------|-----|
| 1 | Auth token refresh flow | Core security — untested refresh singleton, backward compatibility |
| 2 | TradingModeContext | Cross-tab sync, query cache invalidation, mode persistence |
| 3 | `use-websocket` reconnection | WebSocket singleton, exponential backoff, heartbeat |
| 4 | TopBar start/stop flow | Primary user interaction with trading engine |

**Framework**: Install `@testing-library/react` + `@testing-library/jest-dom`. Configure Vitest for client-side tests (add `environment: 'jsdom'` config for `client/**/*.test.tsx`).

### ADD-4: Mark Standalone Scripts as QA Tools

**Directive**: Clarify in documentation that the 4 standalone test scripts (`diagnostic-system.test.ts`, `live-pricing-validation.ts`, `system-verify.ts`, `test-force-trade.ts`) are **operational validation tools**, not regression tests.

**Rationale**: These scripts require a running server and database. They serve a different purpose than framework-discoverable regression tests. Renaming or documenting them prevents confusion about what `vitest run` will and won't execute.

### ADD-5: Property-Based Testing for Core Math (Optional, High ROI)

**Directive**: Consider adding property-based tests (e.g., `fast-check`) for core mathematical invariants:

| Property | Invariant |
|----------|-----------|
| FinalScore | Always in [0, 1], deterministic for same inputs |
| VolNoise | Monotonic with respect to price variance |
| Covariance matrix | Positive semi-definite for all inputs |
| Regime classification | Deterministic — same metrics always produce same regime |

**Rationale**: The existing 7 math utility tests are strong but use fixed test vectors. Property-based testing would exercise edge cases and boundary conditions automatically across thousands of random inputs, catching subtle numerical issues.

---

*Phase 10 complete. Next: Phase 11 (Database Schema & Migrations).*
