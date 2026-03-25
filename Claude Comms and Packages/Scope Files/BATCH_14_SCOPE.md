# BATCH 14 SCOPE — Phase 13: MCE Installation + Full L-Series Removal

> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Date**: 2026-03-04 (v4 — incorporates peer review feedback)
> **Phase**: 13 (MCE Installation)
> **Batch**: 14 (single mega-batch for all of Phase 13)
> **Pre-Batch Snapshot**: SNAPSHOT-022 (from commit `589be749`, Batch 13B governance)
> **Baseline**: 791 pass / 90 fail (881 total)
> **Audit Status**: COMPLETE — Two-round deep audit + peer review incorporated

---

## Overview

Phase 13 installs the Market Context Engine (MCE) as the centralized market context provider for the DawnTrader trading pipeline, and **removes the entire L12-L20 legacy autonomy cluster** — 29 files comprising services, routes, and utilities that form a closed supervisory loop with zero connection to the active trading or passive learning paths.

This is a single mega-batch covering:
- **13.1** MCE Core Build (centralized indicator computation + regime classification)
- **13.2** Pipeline Integration (signal orchestrator + VTS wiring)
- **Full L-Series removal** (L12-L20 services, routes, utilities, plus orphaned M-series audit files)

**Deferred to a future batch**: Phase 13.3 PredictiveConfidence (strategy-specific confidence model). The deterministic confidence formula installed in Batch 13 (Directive 12.3.3) has zero paper-mode data collected. MCE ships with the existing deterministic formula centralized through it. PredictiveConfidence will be built in a later batch informed by actual observed strategy performance data.

---

## Pre-Implementation Audit Summary

Two rounds of deep auditing were completed, plus external peer review:

**Round 1** — File dependency tracing:
1. Core signal pipeline has ZERO L-series dependencies (signal-orchestrator, strategy-engine, DSS, quality_index, market-regime, expectancy)
2. VTS path completely independent of L-series (vts-runner uses `calculatePairRegime()` directly)
3. Frontend does NOT call any L-series API endpoints

**Round 2** — Legacy determination (Kyle's directive to verify each L12-L20 service):
4. **ALL L12-L20 services are legacy.** Every service was audited for: what it produces, what consumes it, and whether its output feeds into FinalScore, HybridScore, confidence, regime weighting, signal generation, SQE, RTB, or VTS. **None do.**
5. L12-L20 forms a **closed supervisory loop** — services read from each other but nothing in the active execution path or VTS reads their output
6. action-executor, maco-coordinator, apr-sle-engine are NOT "active services needing migration" — they are legacy services to be deleted
7. RegimeId (T1/T2/R1/V1/C1) is a legacy type used only by legacy services — canonical pipeline uses BULL_STABLE/BEAR_VOLATILE/etc.
8. health.ts root endpoint (`/api/health`) is bloated with L-series data but has NO frontend callers — frontend only calls `/api/health/summary`, `/api/health/recovery`, `/api/health/anomalies` (which contain no L-series data)
9. 8 L-series route files expose 52+ endpoints — none called by frontend

**Peer Review** — Additional findings incorporated:
10. `m3b-validation-service.ts` and `routes/m3b.ts` are legacy (audit-only, no frontend callers, no active path consumers) — added to deletion list
11. `paper_validation_engine.ts` has active pricing latency consumption but imports from DCE + GASP — needs L-series imports stripped
12. `server/services/index.ts` does not exist (no barrel file) — no action needed
13. `server/startup.ts` and `server/startup/trading-bootstrap.ts` have zero L-series imports — no action needed
14. No test files import from L-series modules
15. Rolling normalization infrastructure left in place (already bypassed, removal adds risk with zero benefit)

---

## What MCE Is

MCE is a **centralized market context service** that computes and caches all market-level calculations for a given symbol in a single pass, then provides a complete `MarketContext` object to all downstream consumers.

**MCE computes:**
- Standard indicators: VWAP, SMA (multiple periods), ATR, volume metrics
- Regime classification (calls `calculatePairRegime()` — same canonical math, centralized calling pattern)
- Volatility metrics (realized volatility, momentum, ADX — currently computed inside market-regime.ts, now exposed to all consumers via MCE)

**MCE does NOT:**
- Fetch OHLC data — it receives OHLC from the caller (signal orchestrator / VTS pass it in). All Kraken data continues to flow through the existing pricing service and KrakenService with its rate limiting.
- Generate signals — that remains the strategy engine's job
- Make trading decisions — that remains the orchestrator + SQE + RTB pipeline
- Add new math concepts (no strategy weight percentages, no exposure/risk multipliers — those don't exist in the current canonical pipeline and won't be injected)
- Compute PredictiveConfidence (deferred — see below)

**MCE's contract:**
```
Input:  symbol, ohlcData[], currentPrice, volume24h
Output: MarketContext {
  regime, regimeConfidence, regimeScore,
  indicators (vwap, sma, atr, volatility, momentum, adx),
  allowedStrategies (from CANONICAL_REGIME_STRATEGY_MAP — same as today)
}
```

**MCE initialization**: `initMarketContextEngine()` runs at startup and creates the singleton instance. No market data is needed at init time. `computeContext()` is called on-demand when the signal orchestrator or VTS fetches OHLC and passes it in. MCE does not fetch its own data — it waits to receive it.

---

## PredictiveConfidence — Deferred

The deterministic confidence formula (Directive 12.3.3, Batch 13) was installed one batch ago. Zero paper-mode data has been collected with it. Replacing it immediately with PredictiveConfidence means:
- No data to inform what strategy-specific weights should be
- The deterministic formula's lifespan would be a single batch — never validated

**Decision**: MCE ships with the existing deterministic formula. `quality_index.ts` continues to compute NGC via `calculateNGC()` exactly as today — the only change is that MCE provides pre-computed indicators to the orchestrator. PredictiveConfidence will be a future batch once paper-mode data informs the design.

**Rolling normalization infrastructure**: Left in place. It's already bypassed (Directive 12.3.3) and removing it adds risk with no benefit.

---

## What Gets Removed: The Entire L-Series Legacy Cluster

### Why It's All Legacy

The L12-L20 system was built under Directive 8.8.4 (December 2025) as an autonomy/reinforcement learning infrastructure. It was superseded in January 2026 by the canonical regime system (Directive 11.7F) but was never decommissioned due to its "LOCKED" designation. Every service in the cluster:

1. Uses the T1/T2/R1/V1/C1 taxonomy — not the canonical 5-regime model
2. Has stubbed or incomplete metrics — MCP's volumeZ=0, correlation=0.5
3. Forms a closed supervisory loop — services read from each other but nothing in the active execution path reads their output
4. Has no connection to the active trading path: Signal Orchestrator → SQE → RTB → Execution
5. Has no connection to VTS passive learning path: VTS Runner → calculatePairRegime → simulation

### Service-by-Service Determination

| Layer | Service | File | Why Legacy |
|:---:|:---|:---|:---|
| L12 | MarketProfiler (MCP) | `market-profiler.ts` | Stubbed metrics, T1-C1 taxonomy, Kyle confirmed legacy 2026-02-16 |
| L12 | AdaptiveRegime (ARE) | `adaptive-regime.ts` | Own REGIME_STRATEGY_MATRIX with exposure/risk multipliers, not in canonical pipeline |
| L13 | RegimePerformance | `regime-performance.ts` | Tracks T1-C1 stats, orphaned without MCP |
| L13 | ProactiveAllocator | `proactive-allocator.ts` | Predicts T1-C1 transitions, orphaned without MCP |
| L14 | ActionExecutor | `action-executor.ts` | Fetches ML policy, output is WebSocket/API only. Does NOT feed into FinalScore, signal gen, SQE, or RTB. |
| L14 | RewardEvaluator | `reward-evaluator.ts` | Per-strategy/regime rewards. Kyle Phase 6: "Observability-only. Not integrated." Uses T1-C1. |
| L14 | ExperienceBuffer | `experience-buffer.ts` | RL training tuples for ML microservice (legacy/optional). Uses T1-C1. |
| L15 | MACOCoordinator | `maco-coordinator.ts` | Multi-agent coordination. Output is API/events only — not in signal/scoring path. |
| L15 | ExplorationManager | `exploration-manager.ts` | Epsilon-greedy control. Only consumed by MACO and GASP. |
| L15 | PolicyConsensus | `policy-consensus.ts` | Federated gradient averaging. Only consumed by MACO route. |
| L16 | DCE (Decision Confidence) | `decision-confidence-engine.ts` | Computes DI from CWQI+NGC+ML+Regime+MACO. NOT imported by signal-orchestrator, quality_index, RTB, or VTS. |
| L17 | APR-SLE Engine | `apr-sle-engine.ts` | Adaptive TP/SL with hardcoded T1-C1 multiplier table. NOT used by trade execution. |
| L18 | PDC Engine | `pdc-engine.ts` | Predictive Drawdown Containment. Output NOT used by position sizing or execution. |
| L18 | ECS Controller | `ecs-controller.ts` | Equity Curve Smoothing. Output NOT used by actual position sizing. |
| L19 | MOF Orchestrator | `mof-orchestrator.ts` | Meta-weight evolution for L-series subsystems. Closed loop. |
| L20 | GASP Coordinator | `gasp-coordinator.ts` | System stability monitor. Closed supervisory loop with other L-series. |
| L20 | EquilibriumRestorer | `equilibrium-restorer.ts` | Recovery orchestrator for GASP. |
| M3B | M3B Validation | `m3b-validation-service.ts` | Audit-only. No frontend callers. Imports from DCE (being deleted). |

### Route Files — All Legacy, No Frontend Callers

| Route File | Endpoints | Frontend Callers |
|:---|:---:|:---:|
| `routes/market.ts` | 8 | None |
| `routes/rl.ts` | 5 | None |
| `routes/maco.ts` | 4 | None |
| `routes/dce.ts` | 5 | None |
| `routes/apr-sle.ts` | 5 | None |
| `routes/pdc-ecs.ts` | 6 | None |
| `routes/mof.ts` | 9 | None |
| `routes/gasp.ts` | 10 | None |
| `routes/m3b.ts` | 7 | None |

### Utility Files — Only Consumed by L-Series

| File | Purpose |
|:---|:---|
| `utils/stabilization-controller.ts` | Damping coefficients for MOF/MACO/ECS |
| `utils/performance-aggregator.ts` | KPI aggregation for MOF/GASP |

---

## Files NOT Being Deleted (Verified Active)

| File | Why Active |
|:---|:---|
| `routes/vts.ts` | VTS endpoints actively called by frontend (`/api/vts/ml/open`, `/api/vts/ml/closed`, etc.) |
| `drift-detector.ts` | Imported by `routes/vts.ts` |
| `regime-stability.ts` | Imported by `vts-runner.ts` (active passive learning path) |
| `context-bridge.ts` | 52+ importers, foundational WebSocket system |
| `routes/health.ts` | Frontend calls `/summary`, `/recovery`, `/anomalies` — root endpoint stripped of L-series data |
| `paper_validation_engine.ts` | `pricing.ts` uses `getRollingLatencyAverages()` — L-series imports stripped, latency function kept |

---

## Phase 13.1: MCE Core Build

### New Files

**`server/services/market-context-engine.ts`** (~600-800 lines)
- `MarketContextEngine` class
- Singleton via `getMarketContextEngine()` / `initMarketContextEngine()`
- Key methods:
  - `computeContext(symbol, ohlcData, currentPrice, volume24h)` — main computation, returns `MarketContext`
  - `getCurrentContext(symbol?)` — returns cached context from last computation
  - `getRegime(symbol?)` — shortcut to current regime name
  - `getAllowedStrategies(regime)` — lookup from `CANONICAL_REGIME_STRATEGY_MAP` (same map used today)
  - `start()` / `stop()` — lifecycle methods (no timer — MCE computes on demand when called by orchestrator/VTS)
- `initMarketContextEngine()` creates the instance at startup (no data needed). `computeContext()` called on-demand by callers who provide OHLC.

**`server/types/market-context.ts`** (~100-150 lines)
- `MarketContext` interface (the main output contract)
- `MarketIndicators` interface (VWAP, SMA, ATR, etc.)
- `RegimeContext` interface (regime, confidence, score, volatility, momentum, ADX)
- `CanonicalRegime` type (re-exported from market-regime.ts for single import point)

### Indicator Centralization

MCE computes all indicators in one pass per symbol:

| Indicator | Currently Computed In | MCE Takes Over |
|-----------|----------------------|:-:|
| Volatility (std dev of returns) | `market-regime.ts` → `computeVolatility()` | YES |
| Momentum (14-period) | `market-regime.ts` → `computeMomentum()` | YES |
| ADX (14-period) | `market-regime.ts` → `computeADX()` | YES |
| VWAP | `strategy-engine.ts` (per-strategy) | YES — computed once, shared |
| SMA (configurable period) | `strategy-engine.ts` (per-strategy) | YES — computed once, shared |
| ATR | `quality_index.ts` → `estimateExpectedDuration()` | YES — computed once, shared |
| Regime classification | `market-regime.ts` → `calculatePairRegime()` | YES — absorbed into MCE |
| Regime score | `market-regime.ts` → `calculateRegimeScore()` | YES — absorbed into MCE |

**Note**: `calculatePairRegime()` and related functions in `market-regime.ts` are *called by* MCE internally. The file itself is not deleted — MCE imports and uses its functions. This preserves the canonical math while centralizing the calling pattern.

---

## Phase 13.2: Pipeline Integration

### Signal Orchestrator Wiring

**Current flow** (signal-orchestrator.ts):
```
1. Fetch OHLC via kraken.getOHLCData(symbol, 60)
2. Convert to OHLCData format
3. Call calculatePairRegime(ohlcData) for regime
4. Call DSS.getRegimeInfoFromOHLC() for regime details
5. Evaluate each strategy independently (each computes own VWAP/SMA)
6. Call calculateExtendedSignalMetrics() for confidence/quality
7. Calculate FinalScore
8. SQE gate
```

**New flow with MCE:**
```
1. Fetch OHLC via kraken.getOHLCData(symbol, 60) [unchanged — through existing pricing service]
2. Convert to OHLCData format [unchanged]
3. Call mce.computeContext(symbol, ohlcData, price, volume) → MarketContext
4. Use context.regime, context.indicators, context.allowedStrategies
5. Pass context.indicators to strategy evaluation (strategies receive pre-computed indicators)
6. Call calculateExtendedSignalMetrics() for confidence/quality [unchanged — deterministic formula]
7. Calculate FinalScore [unchanged]
8. SQE gate [unchanged]
```

The orchestrator **stops computing indicators and regime independently** and instead consumes MCE's pre-computed context. Strategy evaluation receives `MarketIndicators` from MCE rather than computing VWAP/SMA internally.

### Strategy Engine Changes

`strategy-engine.ts` currently receives `TechnicalIndicators` (vwap, sma, currentPrice, volume, high24h, low24h). MCE's `MarketIndicators` is a superset of this. The strategy engine's interface is updated to accept `MarketIndicators` from MCE, which includes the same fields plus ATR, volatility, momentum, ADX.

Individual `detect*()` methods that currently compute their own VWAP/SMA will be updated to use the pre-computed values from MCE.

### VTS Runner Wiring

After MCE integration:
1. Fetches OHLC (unchanged — VTS uses 15-min interval, orchestrator uses 60-min)
2. Calls `mce.computeContext(symbol, ohlcData, price, volume)` for full context
3. Uses MCE context for regime, indicators, and strategy routing
4. Simulation stubs remain for now (replaced in Phase 14.1 per roadmap)

---

## Bugs/Risks Addressed

| ID | Description | Status |
|:---|:---|:---|
| BUG-008 | Four parallel regime classification systems | Engine #4 (MCP/ARE) REMOVED. Only canonical `calculatePairRegime()` remains (via MCE). |
| RISK-002 | OHLC Indicator Computation Duplication (VWAP/SMA computed independently in signal-orchestrator AND strategy-engine) | RESOLVED — MCE computes once per symbol, strategies receive pre-computed values. |
| RISK-006 | RegimeWeight defaults to 0.5 | RESOLVED — MCE provides real regime weights derived from canonical mapping. |
| RISK-007 | Confidence scale inconsistency (0-1 vs 0-100) | RESOLVED — MCE normalizes all values to [0, 1] range. |
| RISK-016 | MCP/ARE creates parallel strategy authority | MCP/ARE REMOVED. |
| RISK-019 | MCP uses stubbed metrics | MCP REMOVED. |
| RISK-020 | MCP/ARE never decommissioned | Entire L12-L20 cluster REMOVED. |
| UNIFY-002 | Confidence Authority Consolidation (NGC is legacy) | PARTIALLY ADDRESSED — NGC calling centralized through MCE. Full replacement deferred to PredictiveConfidence batch. |

**Note**: RISK-005 (HybridScore falls back to confidence) is NOT resolved by this batch since PredictiveConfidence is deferred. It remains open for a future batch.

---

## Complete Files Changed Summary

### New Files (2)
| File | Lines (est.) | Purpose |
|:---|:---:|:---|
| `server/services/market-context-engine.ts` | ~700 | MCE core service |
| `server/types/market-context.ts` | ~120 | MCE type definitions |

### Deleted Files (29)

**L-Series Services (17):**
| File | Layer |
|:---|:---:|
| `server/services/market-profiler.ts` | L12 |
| `server/services/adaptive-regime.ts` | L12 |
| `server/services/regime-performance.ts` | L13 |
| `server/services/proactive-allocator.ts` | L13 |
| `server/services/action-executor.ts` | L14 |
| `server/services/reward-evaluator.ts` | L14 |
| `server/services/experience-buffer.ts` | L14 |
| `server/services/maco-coordinator.ts` | L15 |
| `server/services/exploration-manager.ts` | L15 |
| `server/services/policy-consensus.ts` | L15 |
| `server/services/decision-confidence-engine.ts` | L16 |
| `server/services/apr-sle-engine.ts` | L17 |
| `server/services/pdc-engine.ts` | L18 |
| `server/services/ecs-controller.ts` | L18 |
| `server/services/mof-orchestrator.ts` | L19 |
| `server/services/gasp-coordinator.ts` | L20 |
| `server/services/equilibrium-restorer.ts` | L20 |

**L-Series Route Files (9):**
| File | Endpoints |
|:---|:---:|
| `server/routes/market.ts` | 8 |
| `server/routes/rl.ts` | 5 |
| `server/routes/maco.ts` | 4 |
| `server/routes/dce.ts` | 5 |
| `server/routes/apr-sle.ts` | 5 |
| `server/routes/pdc-ecs.ts` | 6 |
| `server/routes/mof.ts` | 9 |
| `server/routes/gasp.ts` | 10 |
| `server/routes/m3b.ts` | 7 |

**Orphaned M-Series (1):**
| File | Reason |
|:---|:---|
| `server/services/m3b-validation-service.ts` | Audit-only, no frontend callers, imports from DCE (being deleted) |

**L-Series Utilities (2):**
| File | Purpose |
|:---|:---|
| `server/utils/stabilization-controller.ts` | Damping coefficients for MOF/MACO/ECS |
| `server/utils/performance-aggregator.ts` | KPI aggregation for MOF/GASP |

**Total deleted: ~6,500-7,500 lines of legacy code across 29 files, 59 API endpoints removed**

### Modified Files (~10)
| File | Changes | Difficulty |
|:---|:---|:---:|
| `server/services/signal-orchestrator.ts` | Wire to MCE context instead of independent regime/indicator computation | HARD |
| `server/services/strategy-engine.ts` | Accept `MarketIndicators` from MCE, stop computing own VWAP/SMA | HARD |
| `server/services/vts-runner.ts` | Wire to MCE context for regime + indicators | MEDIUM |
| `server/services/dynamic-strategy-selector.ts` | Simplify — receives regime from MCE instead of computing | EASY |
| `server/services/autonomy-scheduler.ts` | Strip ALL L12-L20 initialization + scheduled tasks, add MCE init only | HARD |
| `server/routes/health.ts` | Strip all L-series imports and data from root `/api/health` endpoint. Keep `/summary`, `/recovery`, `/anomalies` unchanged. Specific surgery: remove imports of all 17 deleted services, remove code blocks that call them (lines ~308-691 in root endpoint). | MEDIUM |
| `server/routes.ts` | Remove 9 L-series route mounts (market, rl, maco, dce, apr-sle, pdc-ecs, mof, gasp, m3b) at lines 20167-20227. Keep VTS audit mount, health, status, and all other mounts. | EASY |
| `server/services/vts-service.ts` | Remove dead MCP/ARE imports | TRIVIAL |
| `server/services/paper_validation_engine.ts` | Strip imports of `decision-confidence-engine` and `gasp-coordinator`. Remove telemetry capture code that depends on DCE/GASP. Keep `getRollingLatencyAverages()` (used by pricing.ts). | EASY |
| `server/core/metrics/quality_index.ts` | No changes needed this batch — deterministic formula stays as-is. MCE provides indicators, quality_index continues computing NGC the same way. | NONE |

**Total: 2 new files, 29 deleted files, ~9 modified files**

---

## What This Batch Does NOT Do

- **PredictiveConfidence** — Deferred. MCE ships with existing deterministic formula. Future batch after paper-mode data collection.
- **Rolling normalization removal** — Left in place (bypassed, harmless).
- **VTS simulation stub replacement** (BUG-001) — Phase 14.1.
- **Directional Bias** — Phase 14.2.
- **Short Trading** — Phase 14.3.
- **SQE threshold recalibration** — Phase 15.
- **M-series audit services** (back_audit_engine, system-audit-engine) — Not touched this batch. They don't import from deleted L-series files.
- **context-bridge.ts** — Foundational WebSocket, 52+ importers. Separate evaluation.

---

## Test Expectations

**Expected test changes from this batch:**
- Tests importing from any of the 29 deleted files will fail until imports are cleaned. Based on our audit, no test files directly import L-series modules.
- Tests that exercise the signal orchestrator evaluation loop may see different indicator values due to MCE centralization (computed once instead of independently). Values should be identical but order-of-operations may differ slightly.
- Tests for VTS runner may similarly see minor differences in indicator delivery.

**Target**: Maintain or improve on 791/90 baseline. Document any test count changes with explanations.
**TSC compilation**: Must pass with no new errors beyond the pre-existing 20.

---

## Validation Checklist

1. `npx tsc --noEmit` — no new compilation errors
2. `npm test` — baseline maintained (791+/90- or better), any changes documented
3. Server starts successfully (`npm run dev` for 10 seconds)
4. No imports of ANY deleted L-series file remain in any non-deleted file
5. No L-series route mounts remain in `routes.ts`
6. Root `/api/health` endpoint returns valid response without L-series data
7. `/api/health/summary`, `/api/health/recovery`, `/api/health/anomalies` work unchanged
8. `/api/pricing/latency` still works (paper_validation_engine latency function intact)
9. MCE singleton initializes without error
10. Signal orchestrator evaluation cycle completes without error
11. EXTREME_NOISE veto still functions (volNoise > 0.6 blocks trading)
12. VTS runner cycle completes without error (when passive learning enabled)
13. Frontend loads without errors (no broken API calls)

---

## Approval Request

Kyle — please review and confirm:
1. **Scope**: MCE core + pipeline wiring + full L-series removal (29 files deleted), PredictiveConfidence deferred
2. **All L12-L20 confirmed legacy**: Kyle approved 2026-03-04
3. **M3B files**: m3b-validation-service.ts and routes/m3b.ts added to deletion list
4. **PredictiveConfidence deferred**: MCE ships with existing deterministic formula
5. **Batch number**: 14 (code) + 14B (governance)
6. **Any additions or changes** before implementation begins

---

*This scope document is the contract for Batch 14. Implementation begins after Kyle approval.*
