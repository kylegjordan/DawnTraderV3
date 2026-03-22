# Directive 13.1: MCE Installation + L12-L20 Legacy Removal

> **Phase**: 13 (MCE Installation)
> **Status**: COMPLETE
> **Date Issued**: 2026-03-04
> **Date Complete**: 2026-03-04
> **Batch**: 14 (code) + 14-hotfix (enum fix) + 14B (governance)
> **Commits**: `8f26369a` (Batch 14), `db521adc` (Batch 14-hotfix)
> **Snapshot**: SNAPSHOT-022 (pre-batch freeze at `589be749`)

---

## Objective

Install the Market Context Engine (MCE) as a centralized service for market indicator computation and regime classification, replacing duplicated inline calculations across the signal-orchestrator and VTS-runner. Simultaneously complete the full removal of the L12-L20 autonomy/RL cluster (29 files), which was confirmed as a closed supervisory loop with zero downstream impact on the active trading path.

---

## What Was Done

### 1. MCE Core Build (2 new files)

Created `server/services/market-context-engine.ts` and `server/types/market-context.ts`:

- **MCE computes**: VWAP, SMA (configurable period), ATR (14-period True Range), regime classification via `calculatePairRegime()`, regime weight lookup, allowed strategies lookup
- **MCE does NOT**: Fetch OHLC data (callers provide it), generate signals, add new math formulas
- **Architecture**: Singleton service via `getMarketContextEngine()`/`initMarketContextEngine()`, 60-second cache TTL per symbol
- **Types**: `MarketIndicators` (superset of `TechnicalIndicators`), `RegimeContext`, `MarketContext`, `MCEConfig`

### 2. Pipeline Wiring — Active Trading Path

Signal orchestrator (`signal-orchestrator.ts`) rewired:
- Replaced DSS regime call + inline VWAP/SMA computation with `MCE.computeContext()`
- EXTREME_NOISE veto preserved inline (`volNoise > SYSTEM_GUARDS.MAX_VOL_NOISE`)
- Strategy filtering now uses `mceContext.regime.allowedStrategies`
- ATR from MCE pre-computed value instead of inline computation

### 3. Pipeline Wiring — Passive Learning Path

VTS runner (`vts-runner.ts`) rewired:
- Main loop: `calculatePairRegime(ohlcData)` → `mce.computeContext(symbol, ohlcData, price, 0)`
- `generatePhase10Signal`: Same replacement, uses `mceContext.raw` for Z-score normalization
- MCE caching prevents double-computation within same cycle

### 4. L12-L20 Legacy Removal (29 files deleted)

Entire autonomy/RL cluster confirmed as closed supervisory loop:

- **17 L-Series Services**: market-profiler, adaptive-regime, regime-performance, proactive-allocator, action-executor, reward-evaluator, experience-buffer, maco-coordinator, exploration-manager, policy-consensus, decision-confidence-engine, apr-sle-engine, pdc-engine, ecs-controller, mof-orchestrator, gasp-coordinator, equilibrium-restorer
- **9 Route Files**: market, rl, maco, dce, apr-sle, pdc-ecs, mof, gasp, m3b
- **1 M-Series Service**: m3b-validation-service
- **2 Utilities**: stabilization-controller, performance-aggregator

### 5. Consumer File Updates (7 files modified)

- **autonomy-scheduler.ts**: Removed 20 L-series imports, L12-L20 init blocks, 10 scheduled tasks. Added MCE init.
- **health.ts**: Removed 15 L-series imports, stripped L-series data from health endpoint, removed 7 helper functions.
- **routes.ts**: Removed 8 L-series route mounts + 1 M3B mount.
- **paper_validation_engine.ts**: Removed DCE/GASP imports, stubbed with deterministic defaults.
- **vts-service.ts**: Removed 3 dead imports.

### 6. Hotfix: Strategy Enum Expansion

`shared/schema.ts` and new migration `0002_batch14_strategy_enum_expansion.sql`:
- PostgreSQL `strategy_type` enum expanded 9 → 18 values
- Added `range_trade` (canonical rename from `range_trading`) + 8 new Directive 12.3.2 strategies
- Fixed `syncGlobalStrategies()` startup crash

---

## Bugs & Risks Resolved

| ID | Title | Resolution |
|----|-------|------------|
| BUG-002 | Active Trading Path Uses Legacy DSS Regime Model | Signal orchestrator uses MCE with canonical map |
| BUG-003 | Signal Orchestrator Legacy Strategy Map | MCE provides `allowedStrategies` from canonical map |
| BUG-008 | Four Parallel Regime Systems | Engine #4 (MCP/ARE) removed. Only canonical + advisory remain |
| RISK-002 | OHLC Indicator Computation Duplication | MCE centralizes VWAP/SMA/ATR computation |
| RISK-016 | MCP/ARE Parallel Strategy Authority | MCP/ARE and all consumers deleted |
| RISK-019 | MCP Stubbed Metrics | MCP/ARE deleted — stubbed metrics no longer feed any system |
| RISK-020 | MCP/ARE Never Decommissioned | Fully decommissioned — entire L12-L20 cluster removed |

---

## What Did NOT Change

- **strategy-engine.ts**: Internal VWAP/SMA operate on different data subsets. No changes needed.
- **dynamic-strategy-selector.ts**: DSS bypassed at orchestrator level. Not modified in this batch.
- **FinalScore formula**: Unchanged.
- **EXTREME_NOISE veto**: Preserved as inline check in signal-orchestrator.
- **Deterministic confidence (NGC replacement)**: Unchanged from Batch 13.
- **PredictiveConfidence**: DEFERRED to a future batch.

---

## Validation Results

- **TSC**: Pre-existing env errors only. Zero new errors.
- **Import scan**: Zero remaining imports of any deleted file.
- **Tests**: 791 pass / 90 fail (881 total) — baseline restored after hotfix.
- **Server**: Boots cleanly, MCE initializes, `syncGlobalStrategies()` completes.
- **Net change**: ~-8,200 lines across 39 files (2 new + 7 modified + 29 deleted + 1 snapshot).
