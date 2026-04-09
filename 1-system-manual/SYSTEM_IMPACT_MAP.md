# DawnTrader System Impact Map

> **Author**: Claude Code (System Cartographer)
> **Created**: 2026-02-19
> **Last Updated**: 2026-04-09 (Batch 54 — Hardcoded defaults removed, DB sole authority for filter thresholds)
> **Purpose**: Component dependency reference for directive authoring. Before writing any directive, consult this map to identify all upstream, downstream, and shared-state impacts of the proposed change.
> **Usage**: Claude Code looks up every affected component BEFORE writing a directive. The directive's Impact Analysis section must reference this map.

---

## How to Use This Map

1. Identify which component(s) the directive will modify
2. Look up each component below
3. Check all UPSTREAM dependencies (will they still feed correct data?)
4. Check all DOWNSTREAM consumers (will they still receive what they expect?)
5. Check SHARED STATE (will config/state changes ripple elsewhere?)
6. Check BACKGROUND EXECUTION (does the change affect timers, intervals, or startup?)
7. Check RELATED TESTS (which tests validate this behavior?)
8. Note the BLAST RADIUS rating in the directive's Impact Analysis

### Blast Radius Ratings

| Rating | Meaning |
|--------|---------|
| **LOW** | Change is isolated. Few or no downstream consumers. Safe to modify independently. |
| **MEDIUM** | Change affects 2-5 other components. Moderate testing required. |
| **HIGH** | Change affects many components or a critical pipeline path. Thorough testing required. |
| **CRITICAL** | Change affects the core trading signal path. Every downstream component must be verified. |

---

## Layer 1: Core Math & Scoring

### 1.1 FinalScore Kernel
- **File**: `server/core/signal-orchestrator.ts` (scoring section)
- **What**: Computes FinalScore using `SCORE_WEIGHTS.FINAL_SCORE` adaptive weights. Volatility-adjusted via `adjustWeightsForVolatility()`.
- **Upstream**: HybridScore, PredictiveConfidence, DecayPenalty, RegimeWeight, PatternStrength
- **Downstream**: SQE (FinalScore threshold), RTB (ranking), TCL (selection), Paper Execution Engine, VTS Runner (mirrors this logic)
- **Shared State**: `SCORE_WEIGHTS` config object
- **Execution**: Synchronous — computed per signal during orchestration
- **Blast Radius**: **CRITICAL** — FinalScore is THE ranking authority for every trade decision
- **Contamination**: Receives simulated inputs from VTS (BUG-001). Real in active trading path.
- **Tests**: `finalScore-kernel.test.ts`, `signal-scoring.test.ts`, `runtime_signal_consistency.test.ts`

### 1.2 Net Expectancy Kernel
- **File**: `server/core/signal-orchestrator.ts` (`computeNetExpectancyKernel()`), mirrored in `paper-execution-engine.ts`
- **What**: EV gate. Computes Net Expected Value using Pwin, reward/risk ratio, and friction. Trades with negative NetEV are blocked.
- **Upstream**: DI (Directional Integrity), cost-model friction, reward/risk estimates
- **Downstream**: Paper Execution Engine (EV gate), VTS Runner (mirrors gate)
- **Shared State**: DI calculation (~~BUG-004~~ **RESOLVED** — Directive 12.1.1)
- **Execution**: Synchronous — computed per signal
- **Blast Radius**: **CRITICAL** — blocks or allows every trade
- **Contamination**: ~~DI derived from NGC (BUG-004)~~ **RESOLVED** — DI now sourced from geometric price data via `calculateDirectionalIntegrity(closePrices)`
- **Tests**: `expectancy-kernel.test.ts`, `net-ev-validation.test.ts`

### 1.3 Cost Model
- **File**: `server/core/cost-model.ts`
- **What**: Computes real round-trip trading costs (spread + slippage + Kraken fees). Single source of truth for friction.
- **Upstream**: Kraken spread data (via Price Cache / Cost Cache), fee schedule
- **Downstream**: Signal Orchestrator (friction in EV gate), Paper Execution Engine, FX5 Scanner (cost filtering)
- **Shared State**: None — self-contained calculation
- **Execution**: Synchronous — called per signal/trade
- **Blast Radius**: **HIGH** — affects EV calculations and filter thresholds
- **Contamination**: ~~Bypassed by `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` in some paths (RISK-009)~~ **RESOLVED** — Directive 12.1.2. All friction consumers now use `getCachedCostMetrics()` + `computeTotalRoundTripCost()`.
- **Tests**: `cost-model.test.ts`

### 1.4 DI Calculation (Directional Integrity)
- **File**: `server/services/signal-orchestrator.ts` (line ~1127)
- **What**: Computes DI from price geometry. `DI = calculateDirectionalIntegrity(closePrices)` — geometric ratio of net price movement to total path length (0-100).
- **Upstream**: OHLC close prices (via `ohlcData.map(c => parseFloat(c.close))`)
- **Downstream**: Net Expectancy Kernel (Pwin), Paper Execution Engine, VTS Runner
- **Blast Radius**: **CRITICAL** — DI feeds into every EV calculation
- **Contamination**: ~~BUG-004~~ **RESOLVED** — Directive 12.1.1 (2026-02-22). NGC-derived DI eliminated.
- **Tests**: `analysis-utils.test.ts` validates `calculateDirectionalIntegrity()` function

### 1.5 rankingScore — NEW (Phase 14.5, Batch 19)
- **File**: `server/config/ranking-weights.ts` (~110 lines)
- **What**: Cross-family signal desirability score for RTB queue ordering. Formula: `rankingScore = FinalScore * qualityWeight + normalizedNetReturn * returnWeight - frictionPenalty * frictionWeight + contextBonus`. Three weight profiles: QUANT (quality-heavy), PATTERN (context-heavy, higher friction penalty), HYBRID (balanced). FinalScore gap safety rule: if quality gap > 0.10, FinalScore wins. Context bonus/penalty for pair-global regime agreement (±0.06/0.04) and BTC confirmation (±0.03/0.02). Net return normalized to 0-1 (5% ceiling).
- **Upstream**: FinalScore (from SQE), net return (from cost model), friction (from cost model), regime data (from MCE global regime)
- **Downstream**: RTB `getTopSignal()` (queue ordering), RTB metadata persistence
- **Shared State**: RANKING_WEIGHTS config object, CONTEXT_BONUS config
- **Execution**: Synchronous — computed per signal during RTB insertion
- **Blast Radius**: **HIGH** — determines which signal gets selected for execution when multiple are queued
- **Tests**: None yet (new component, validated via integration)

### 1.6 Pattern Filter Profile — (Phase 14.5, Batch 19; updated Batch 19C; partially superseded Batch 19G)
- **File**: `server/config/pattern-filter-profile.ts` (~120 lines)
- **What**: Configuration for the pattern pool pipeline. Defines: PATTERN_POOL_GUARDRAILS (elevated FinalScore floor 0.45, max position 15%), PATTERN_POOL_STRATEGIES (3 pattern + 5 hybrid = 8 strategies), SourcePool/AssetClass types. **Batch 19G**: PATTERN_POOL_THRESHOLDS and REGIME_PATTERN_THRESHOLDS are now **superseded by DB** — `screener_filters` table rows with `filter_path='active_pattern'` and `filter_path='vts_pattern'` provide these values. The file still exports guardrails and strategy list constants (not in DB). `getPatternPoolThresholds()` function may still be called as fallback but DB is primary source.
- **Upstream**: None — static configuration (guardrails/strategies), DB `screener_filters` table (thresholds — Batch 19G)
- **Downstream**: FX5 Scanner (pattern pool filtering — now via DB since Batch 19G), SQE (elevated FinalScore floor), Paper Position Sizing (15% cap), Signal Orchestrator (strategy list), VTS Runner (PATTERN_POOL_STRATEGIES for dual-path — Batch 19C)
- **Shared State**: None — exported constants and pure function
- **Execution**: Synchronous — imported at module load
- **Blast Radius**: **MEDIUM** — affects pattern pool pipeline thresholds and constraints

### 1.7 Hybrid Compatibility Registry — NEW (Phase 14.5, Batch 19G)
- **File**: `server/config/hybrid-compatibility-registry.ts`
- **What**: Shared registry mapping hybrid strategy names to their required quant + pattern constituent strategies. Used by both signal orchestrator (active trading) and VTS runner (passive learning) for hybrid confluence detection.
- **Upstream**: None — static configuration
- **Downstream**: Signal Orchestrator (hybrid confluence checking), VTS Runner (hybrid confluence buffer)
- **Shared State**: None — exported constants
- **Execution**: Synchronous — imported at module load
- **Blast Radius**: **LOW** — configuration only, consumed by two services

---

## Layer 2: Market Data & Price Feeds

### 2.1 Kraken WebSocket Adapter
- **File**: `server/services/kraken.ts` (WebSocket section), `server/services/live-pricing-adapter.ts`
- **What**: Real-time price feed from Kraken exchange. Maintains persistent WebSocket connection with heartbeat (30s) and staleness detection (2s threshold).
- **Upstream**: Kraken exchange (external)
- **Downstream**: Price Cache (primary data source), MicroExecutionService, frontend WebSocket layer
- **Shared State**: WebSocket connection state, subscription list
- **Execution**: **Persistent connection** — event-driven, always running while server is up
- **Blast Radius**: **HIGH** — all real-time pricing depends on this
- **Tests**: None specific (external integration)

### 2.2 Price Cache
- **File**: `server/services/price-cache.ts` (~448 lines)
- **What**: Multi-bucket unified price management. Separate buckets for regular trading, paper simulation, VTS simulation. 2-second stale threshold with REST fallback. Signal Orchestrator migrated from per-symbol `getTicker()` to `getCachedPrice()` (Batch 18 — eliminates ~4,800 redundant API calls/hr).
- **Upstream**: Kraken WebSocket (primary), Kraken REST API (fallback)
- **Downstream**: Paper Execution Engine, VTS Runner, Signal Orchestrator (ticker data via `getCachedPrice()` — Batch 18), Dynamic Sizing Engine, MicroExecutionService, frontend price display
- **Shared State**: In-memory price map with bucket isolation
- **Execution**: **Event-driven** — updates on WebSocket messages, polled on REST fallback
- **Blast Radius**: **CRITICAL** — every component that uses price data reads from this cache
- **Tests**: None specific

### 2.3 Symbol Normalization
- **File**: `server/services/kraken.ts` (symbol resolution functions)
- **What**: Translates between DawnTrader internal format and Kraken formats (REST: `XAVAXZUSD`, WebSocket: `AVAX/USD`). BTC ↔ XBT translation.
- **Upstream**: None — utility functions
- **Downstream**: FX5 Scanner, Cost Cache, WebSocket subscriptions, all Kraken API calls
- **Shared State**: None — stateless translation
- **Execution**: Synchronous — on-demand
- **Blast Radius**: **HIGH** — incorrect symbol translation breaks all Kraken communication
- **Tests**: Symbol resolution tests

### 2.4 Market Data REST Polling
- **File**: `server/services/kraken.ts` (REST API section)
- **What**: Periodic REST calls for ticker, OHLC, asset pairs, depth, trades. Tier A symbols (BTC, ETH, SOL, XRP) updated every 30 seconds. Cache TTLs: 60s (most), 24h (history), 5min (cost metrics).
- **Upstream**: Kraken REST API (external)
- **Downstream**: Volume cache, cost cache, OHLC data for regime classification and analysis
- **Execution**: **Timer-based** — 30s for Tier A, on-demand with caching for others
- **Blast Radius**: **MEDIUM** — affects data freshness but has fallback caching

### 2.5 Cost Cache
- **File**: `server/services/cost-cache.ts`
- **What**: Lightweight volume lookup and friction coefficient cache. TTL: 5 minutes. Fallback when FX5 metadata unavailable at order creation.
- **Upstream**: FX5 Scanner (populates during scans), Kraken REST API
- **Downstream**: Cost Model friction calculations, execution sizing
- **Execution**: **Passive** — populated by FX5, read on-demand
- **Blast Radius**: **LOW** — fallback cache, not primary data path

### 2.6 OHLC Cache (Batch 18 — NEW)
- **File**: `server/services/ohlc-cache.ts`
- **What**: Centralized OHLC data cache with 5-minute TTL. Wraps `KrakenService.getOHLCData()` with in-memory cache keyed by `symbol:interval`. Bypasses cache for paginated/historical fetches. Periodic cleanup every 10 minutes.
- **Upstream**: Kraken REST API (via KrakenService)
- **Downstream**: Signal Orchestrator (OHLC for regime/indicator computation), VTS Runner (OHLC for strategy detection + BTC candles for defensive_hedge)
- **Shared State**: In-memory cache map, singleton instance (`ohlcCache`)
- **Execution**: **Passive** — populated on first fetch, cached for 5 minutes
- **Blast Radius**: **MEDIUM** — all OHLC consumers route through this cache. Cache miss falls through to Kraken API transparently.
- **Tests**: None specific (validated via integration through signal-orchestrator and VTS)

---

## Layer 3: Scanning & Filtering

### 3.1 Central Clock
- **File**: Core infrastructure (referenced in Phase 3 / Phase 7)
- **What**: 1-second tick source. Emits `ClockTick` events with monotonic counter, timestamp, and drift measurement.
- **Upstream**: System timer
- **Downstream**: FX5 Scanner (every 30 ticks), RTB Refresh (every tick), TCL Watchdog
- **Execution**: **Continuous 1-second interval**
- **Blast Radius**: **HIGH** — all time-dependent subsystems synchronize to this

### 3.2 FX5 Scanner
- **File**: `server/services/market-scanner.ts` (`collectAdaptiveBatch()` function) + `server/services/fx5-scanner.ts`
- **What**: Always-on 30-second market scanner. Multi-stage filtering pipeline: Stage 1 (volume/price), Stage 2 (cost/liquidity), Stage 3 (IMF adaptive), Stage 4 (regime compatibility). Drives pair selection. **Phase 14.5**: Pairs rejected by quant metric filters are re-evaluated against relaxed pattern thresholds and routed to the pattern pool via `activeFilterPool.addPatternPoolSurvivors()`. **Batch 19G**: All filter thresholds now read from DB `screener_filters` table (8 rows: active_quant, active_pattern, vts_quant, vts_pattern per mode). Hardcoded `PATTERN_POOL_THRESHOLDS` config and `pattern-global-filters.ts` no longer used as primary source. **Batch 19G HF1**: Pre-fetches OHLC data for pattern-only pairs that lack cached data, fixing DI=0 rejection at pattern IMF stage.
- **Upstream**: Central Clock (trigger), Kraken REST API (market data), Price Cache, Telemetry Aggregator (performance data for adaptive ratio), DB `screener_filters` table (4-path filter thresholds — Batch 19G), OHLC Cache (pattern-only pair pre-fetch — Batch 19G HF1)
- **Downstream**: Active Filter Pool (quant qualifying pairs + pattern pool pairs — Phase 14.5), Signal Orchestrator (indirectly via both pools), Cost Cache (populates during scan), Stage-3 Emitter (WebSocket events), Data Aggregator (async logging)
- **Shared State**: Screener filter thresholds (from DB `screener_filters` table — 8 rows with columns: filter_path, lq_min, vn_max, corr_max, di_min — Batch 19G)
- **Execution**: **30-second interval** — triggered by Central Clock
- **Blast Radius**: **CRITICAL** — determines which pairs enter the trading pipeline
- **Tests**: Scanner-related tests, filter validation tests

### 3.3 Active Filter Pool
- **File**: `server/services/active-filter-pool.ts` (rewritten in Phase 14.5, Batch 19)
- **What**: In-memory dual-pool staging area. **Quant pool**: pairs passing all FX5 metric filters (5-minute temporal windowing). **Pattern pool** (Phase 14.5): pairs rejected by quant metrics but passing relaxed PATTERN_POOL_THRESHOLDS (volume $250K, LQ≥20, VN≤0.98, DI≥30). Methods: `addSurvivors()` (quant), `addPatternPoolSurvivors()` (pattern), `getPatternPool()`, `getPatternPoolSize()`. Only populated when trading engine is active.
- **Upstream**: FX5 Scanner (populates both pools — quant via `addSurvivors()`, pattern via `addPatternPoolSurvivors()`), Adaptive Ratio Manager (pool split logic)
- **Downstream**: Signal Orchestrator (pulls quant pairs via `getFilteredPairs()`, pattern pairs via `getPatternPool()`)
- **Execution**: **Event-driven** — updated on each scan cycle
- **Blast Radius**: **HIGH** — controls what the Signal Orchestrator can see for both quant and pattern evaluation

### 3.4 IMF Metrics (Adaptive Filters)
- **File**: Computed within FX5 Scanner pipeline
- **What**: Liquidity Quality (LQ), Volume Noise (VN), Correlation, Directional Integrity (DI) metrics. Stage 3 filtering. LQ uses Formula B (log10-based, per-candle OHLC volume — Batch 18G/18J). **Batch 19G**: Filter thresholds now DB-driven — 4 paths per mode (active_quant, active_pattern, vts_quant, vts_pattern) with distinct lq_min, vn_max, corr_max, di_min columns. Previous hardcoded three-tier thresholds in system-guards.ts are DEPRECATED. Pattern IMF uses hybrid architecture: DB defaults for base thresholds + code-driven regime overrides for dynamic adjustment. `system-guards.ts` constants (ACTIVE_IMF_THRESHOLDS, VTS_IMF_THRESHOLDS, PASSIVE_IMF_THRESHOLDS) retained as guardrails only, not primary filter source. **Batch 19G VN**: `calculateVolNoise()` in `analysis-utils.ts` revised from absolute-diff CV (stddev/mean of |close[i]-close[i-1]|) to log-returns MAD/median (median absolute deviation / median of |ln(close[i]/close[i-1])|). VN distribution shifted from ~0.15 center (non-discriminating) to ~0.64 center (meaningful spread). Thresholds calibrated empirically from 300-pair scan: active_quant 0.60, active_pattern 0.68, vts_quant 0.72, vts_pattern 0.80 (updated in DB). VN is compute-time only — not persisted in trade records. Frontend hardcoded VN values removed from diagnostics-tab.tsx and filter-insights.tsx (now read from DB). Downstream consumers (Kalman filter, trailing exit, expectancy kernel) all call the same `calculateVolNoise()` function, so they now receive values on the new 0.5-0.8 scale instead of the old 0.1-0.25 scale.
- **Upstream**: Market data (volume, spread, trading activity), OHLC Cache (per-candle volume for LQ), DB `screener_filters` table (threshold values — Batch 19G)
- **Downstream**: FX5 Stage 3 filtering gate (LQ ≥ threshold, VN ≤ threshold, DI ≥ threshold)
- **Execution**: Synchronous — per-pair during scan
- **Blast Radius**: **MEDIUM** — affects pair eligibility

### 3.5 Adaptive Ratio Manager
- **File**: `server/services/adaptive-ratio-manager.ts` (~298 lines)
- **What**: Dual-pool scheduling — ideal pool (top VTS performers) vs rotational pool (exploration). Typically 60/40 split.
- **Upstream**: Telemetry Aggregator (VTS performance data)
- **Downstream**: Active Filter Pool (pool composition)
- **Execution**: Runs during FX5 scan cycles
- **Blast Radius**: **MEDIUM** — affects pair selection bias

### 3.6 Pair Failure Tracker
- **File**: `server/services/adaptive-ratio-manager.ts`
- **What**: Cooldown blacklist for pairs that failed filters. Normal and extended cooldowns.
- **Upstream**: FX5 filter failure events
- **Downstream**: FX5 scan cycle (excluded pairs)
- **Execution**: Updated on failures, consulted on scans
- **Blast Radius**: **LOW** — affects individual pair eligibility

---

## Layer 4: Signal Generation & Qualification

### 4.1 Signal Orchestrator
- **File**: `server/services/signal-orchestrator.ts`
- **What**: Primary signal generation engine. **Dual-path** (Phase 14.5): (1) Quant path — pulls pairs from Active Filter Pool quant pool, generates signals using all regime-compatible strategies. (2) Pattern path — pulls pairs from Active Filter Pool pattern pool, evaluates PATTERN + HYBRID strategies only via PatternRecognizer.scanPatterns(). Both paths apply exposure/correlation/cooldown checks, compute FinalScore and EV gate. Passes `sourcePool`, `signalType`, `assetClass` to SQE and RTB.
- **Upstream**: Active Filter Pool (quant pairs + pattern pairs — Phase 14.5), Market Regime (regime classification via `calculatePairRegime()`), Cost Model (friction), quality_index (deterministic confidence — NGC replaced), SYSTEM_GUARDS config, OHLC Cache (60-min candles via `ohlcCache.getOHLCData()` — Batch 18), Price Cache (ticker data via `priceCache.getCachedPrice()` — Batch 18), PATTERN_POOL_STRATEGIES config (Phase 14.5), ranking-weights.ts (Phase 14.5)
- **Downstream**: SQE (scored signals with sourcePool metadata), RTB Queue (qualified signals with rankingScore + identity tuple), VTS Runner (mirrors scoring logic), Telemetry (signal metadata)
- **Shared State**: SYSTEM_GUARDS config, DI calculation (~~BUG-004~~ **RESOLVED**), deterministic confidence (~~NGC contamination~~ **RESOLVED** — Directive 12.3.3)
- **Execution**: **Event-driven** — triggered when pairs enter Active Filter Pool
- **Blast Radius**: **CRITICAL** — every signal in the system flows through here
- **Contamination**: ~~NGC→DI (BUG-004)~~ **RESOLVED**, ~~dual friction (RISK-009)~~ **RESOLVED**, ~~legacy DSS routing (BUG-006)~~ **RESOLVED** (Directive 12.3.1)
- **Tests**: `signal-scoring.test.ts`, `runtime_signal_consistency.test.ts`, `finalScore-kernel.test.ts`

### 4.2 Signal Quality Evaluator (SQE)
- **File**: `server/core/filters/signal_quality_evaluator.ts`
- **What**: Final signal gatekeeper before RTB. Evaluates FinalScore, RegimeWeight (≥ 0.30), regime-aware ROI check, and confidence floor (Phase 14.1 HF8). **Phase 14.5**: FinalScore threshold is now sourcePool-aware — quant signals use 0.35 (default), pattern-pool signals use elevated 0.45 (PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR). `sourcePool` field added to SQEInput interface. VTS signals skip confidence floor via `skipConfidenceFloor` option (cold-start bypass). SQE is sole FinalScore authority.
- **Upstream**: Signal Orchestrator (scored signals with `sourcePool` metadata — Phase 14.5), PATTERN_POOL_GUARDRAILS config
- **Downstream**: RTB Service (only passing signals enter queue)
- **Execution**: Synchronous — per signal
- **Blast Radius**: **HIGH** — controls which signals can become trades

### 4.3 RTB Service (Ready-to-Buy Queue)
- **File**: `server/core/rtb/ready_to_buy_service.ts`
- **What**: Signal queue with 30-second TTL. Refreshes every 1 second to check TTL expiration. Promotes ready signals to TCL. **Phase 14.5**: `getTopSignal()` now ranks by `rankingScore` (from metadata) instead of FinalScore alone. FinalScore gap safety rule: if gap > 0.10 between two signals, FinalScore wins (prevents return-magnitude gaming). Signal insertion enriches metadata with `sourcePool`, `signalType`, `assetClass`, `rankingScore` identity tuple. SQESignalInput interface extended with Phase 14.5 fields.
- **Upstream**: SQE (qualified signals), Central Clock (1-second refresh), ranking-weights.ts (FINAL_SCORE_GAP_OVERRIDE — Phase 14.5)
- **Downstream**: TCL (promoted signals with enriched metadata)
- **Execution**: **1-second interval** via Central Clock
- **Blast Radius**: **MEDIUM** — affects signal aging, selection timing, and cross-family ranking

### 4.4 TCL Watchdog (Trade Candidate List)
- **File**: `server/startup/trading-bootstrap.ts`
- **What**: Ranks candidates by FinalScore. Triggers on 2-minute timeout or 15-signal accumulation. 1.5-second monitoring loop.
- **Upstream**: RTB Service (promoted signals), TRADE_CLOSED events
- **Downstream**: Paper Execution Engine (ranked candidates)
- **Execution**: **1.5-second loop** + event-driven + 2-minute failsafe
- **Blast Radius**: **MEDIUM** — affects trade selection timing

---

## Layer 5: Regime Classification

### 5.1 calculatePairRegime() — CANONICAL (ACTIVE)
- **File**: `server/core/metrics/market-regime.ts`
- **What**: Canonical pair-level regime classification. 5 regimes (TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION). Uses volatility, momentum, DX (raw, not smoothed ADX). DX thresholds recalibrated for crypto in HF7 (25 to 45/50/55/60).
- **Upstream**: OHLC price data (60-min candles from both VTS and orchestrator — aligned in HF8)
- **Downstream**: VTS Runner (heavy use via MCE), Signal Orchestrator (via MCE — **WIRED**, Phase 13 Batch 14)
- **Execution**: Synchronous — called per pair via MCE
- **Blast Radius**: **HIGH** — regime determines strategy selection
- **Status**: **ACTIVE** — sole pair-level regime authority for both VTS and active trading (~~BUG-006~~ RESOLVED, Batch 13). DX thresholds recalibrated for crypto in HF7 (`64014bd2`).

### ~~5.2 DSS~~ — **DELETED** (Batch 17, HF9 `f9fa56c6`)
- **File**: ~~`server/services/dynamic-strategy-selector.ts`~~ **FILE DELETED**
- **What**: ~~Legacy classifier.~~ Was rewired to canonical map in Batch 13, then **fully deleted** in Batch 17 (HF9). Superseded by MCE regime filtering + StrategyEngine detect functions.
- ~~**Upstream**: OHLC price data~~
- ~~**Downstream**: Signal Orchestrator~~
- **Blast Radius**: **ZERO** — completely removed. Signal orchestrator uses inline NetEV > 0 filter. All DSS imports purged from signal-orchestrator, telemetry-aggregator, market-events.
- **Status**: **DELETED** — ~~BUG-006~~ RESOLVED (Batch 13 rewire → Batch 17 deletion)

### 5.2.5 Market Context Engine (MCE) — (Phase 13, Batch 14; updated Phase 14.5, Batch 19)
- **Files**: `server/services/market-context-engine.ts` (~320 lines), `server/types/market-context.ts` (~80 lines)
- **What**: Centralized market indicator and regime computation service. Computes VWAP, SMA, ATR, volatility, momentum, ADX and regime classification in a single pass per symbol. Singleton with 60-second cache TTL. Does NOT fetch data — callers provide OHLC. **Phase 14.5**: New `getDominantRegime()` method aggregates per-pair regimes across all cached symbols via majority vote, returning dominant regime, average score, pair count, and percentage. Used by market-indicators.ts for mode-aware global regime sourcing.
- **Upstream**: OHLC data (provided by callers), `calculatePairRegime()` from market-regime.ts, `CANONICAL_REGIME_STRATEGY_MAP`
- **Downstream**: Signal Orchestrator (active trading path — indicators + regime + allowed strategies + pattern pool evaluation — Phase 14.5), VTS Runner (passive learning path — regime + raw Z-score data), market-indicators.ts `getMarketIndicators()` (global dominant regime — Phase 14.5)
- **Shared State**: Per-symbol context cache (60s TTL), singleton instance
- **Execution**: Synchronous — called per symbol per cycle by orchestrator (60s) and VTS (60s). `getDominantRegime()` iterates cache on-demand.
- **Blast Radius**: **HIGH** — all regime classification and indicator data flows through MCE. Global regime now derived from MCE cache population.
- **Status**: **ACTIVE** — installed Batch 14 (`8f26369a`), extended Batch 19 (`getDominantRegime()`). Resolves RISK-002 (indicator duplication).
- **Tests**: Zero direct MCE test files yet. Validated via integration through signal-orchestrator and VTS.

### 5.3 ~~MCP/ARE~~ — **REMOVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Files**: ~~`server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`~~ DELETED
- **What**: ~~Predecessor regime system. Own T1-C1 taxonomy, strategy mix matrix, exposure/risk multipliers. Feeds 14+ services.~~ Removed along with all 14+ L12-L20 consumer services. Replaced by MCE.
- **Blast Radius**: **NONE** — completely removed
- **Status**: COMPLETE — entire L12-L20 cluster deleted (17 services + 9 routes + 2 utilities)

### 5.4 getNormalizedRegime() — Advisory
- **File**: `server/core/metrics/market-regime.ts` (same file as 5.1)
- **What**: Z-score normalized regime classification. Advisory only, not used for routing. Preserved for future ML.
- **Downstream**: VTS Runner (advisory logging)
- **Blast Radius**: **LOW** — advisory only

### 5.5 getMarketIndicators() — Global Regime Sourcing (Updated Phase 14.5, Batch 19)
- **File**: `server/services/market-indicators.ts`
- **What**: Returns current market indicators including dominant regime. **Phase 14.5**: Now mode-aware — uses MCE `getDominantRegime()` when MCE cache has ≥5 pairs (active mode or warm cache), falls back to VTS telemetry `getDominantRegime()` when MCE is cold (passive mode). Previously always used VTS telemetry.
- **Upstream**: MCE singleton (Phase 14.5 — primary), Telemetry Aggregator (fallback)
- **Downstream**: Signal Orchestrator (market indicators), ranking context bonus computation
- **Blast Radius**: **MEDIUM** — affects global regime determination which influences ranking context bonuses

---

## Layer 6: Execution

### 6.1 Paper Execution Engine — PRIMARY
- **File**: `server/services/paper-execution-engine.ts` (~2,308 lines)
- **What**: Authoritative execution engine. Handles order lifecycle, position management, exit logic (trailing stop, target, stop loss, max hold). **Batch 19E**: Persists `sourcePool` from signal metadata on trade creation and position opening (written to `paper_sim_trades.source_pool` and `paper_sim_open_positions.source_pool` DB columns).
- **Upstream**: TCL (ranked candidates), Price Cache (current prices), Guardrails V2, Pre-Execution Validator, Net Expectancy Kernel, Signal metadata (sourcePool — Batch 19E)
- **Downstream**: Portfolio state (DB — including sourcePool column, Batch 19E), trade history (DB — including sourcePool column, Batch 19E), Telemetry, WebSocket broadcasts, TRADE_CLOSED events
- **Shared State**: Portfolio position tracking, open trade state
- **Execution**: **1.5-second monitoring loop** + signal-driven entry
- **Blast Radius**: **CRITICAL** — this executes every paper trade

### 6.2 Trading Engine (Live) — DORMANT
- **File**: `server/services/trading-engine.ts` (~766 lines)
- **What**: Live-capable engine with placeholder code. Contains simulated fills (Math.random), goal alignment, legacy signal orchestration.
- **Status**: DORMANT — defer rebuild until paper mode stable
- **Blast Radius**: **LOW** (currently not executing trades)

### 6.3 Dynamic Sizing Engine (DSE) / Paper Position Sizing
- **Files**: Referenced throughout Phase 5; `server/services/paper-position-sizing.ts` (concrete implementation)
- **What**: Position sizing based on edge, confidence, ATR, volatility. Hard cap: MAX_POSITION_RISK = 0.02 (2%). **Phase 14.5**: Pattern-pool signals capped at 15% max portfolio per trade (PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT) vs 25% quant default. sourcePool read from signal metadata.
- **Upstream**: VTS learning repository, Price Cache, volatility metrics, PATTERN_POOL_GUARDRAILS config (Phase 14.5)
- **Downstream**: Paper Execution Engine (size determination)
- **Blast Radius**: **HIGH** — determines how much capital is at risk per trade

### 6.4 Pre-Execution Validator / Trade Safety
- **File**: `server/services/pre-execution-validator.ts`, `server/services/trade-safety.ts`
- **What**: Final gate before trade execution. Currently a three-gate system (guardrails + EV + goal alignment). Goal alignment to be removed (Wave 4.5) → becomes two-gate.
- **Upstream**: Guardrails V2 policies, portfolio state, position history
- **Downstream**: Paper Execution Engine (allow/deny)
- **Blast Radius**: **HIGH** — blocks or allows every trade

### 6.5 Trailing Exit Controller
- **File**: Referenced in Phase 5 (Directive 9.2.A)
- **What**: Two-stage latch: Break-Even → Target Lock. Cost-aware floors (Directive 11.3A). Dynamic trailing: K' from DI + VolNoise.
- **Upstream**: DI calculation, VolNoise, cost model
- **Downstream**: Paper Execution Engine (exit decisions)
- **Blast Radius**: **MEDIUM** — affects exit timing and P&L

### 6.6 MicroExecutionService — EXPERIMENTAL
- **File**: `server/services/micro-execution-service.ts`
- **What**: Paper-mode only high-frequency check between monitoring cycles. 8s recheck, 0.30% delta trigger. `triggerSymbolCheck()` is TODO stub.
- **Upstream**: Price Cache (1-second forwarding loop)
- **Downstream**: None (cannot act — TODO stub)
- **Execution**: **1-second price updates**, 8-second recheck loop
- **Blast Radius**: **LOW** — cannot execute trades (incomplete)
- **Status**: Experimental, dormant per Kyle acceptance

---

## Layer 7: Learning & Calibration

### 7.1 VTS Runner
- **File**: `server/services/vts-runner.ts` (~1,850 lines)
- **What**: Autonomous virtual trading simulator. 60-second cycles. **Dual-path** (Batch 19C, extended Batch 19E, improved Batch 19G): (1) Quant path — evaluates FX5 quant-pool pairs with all regime-compatible strategies. (2) Pattern path — fetches pattern pool pairs via `activeFilterPool.getPatternPool('paper')` alongside quant pool (Batch 19E), evaluates with PATTERN + HYBRID strategies only (filtered via `PATTERN_POOL_STRATEGIES`). `sourcePool` metadata tagged on VTS trade records. Uses real market data with real scoring pipeline. **Batch 19G**: Hybrid confluence buffer integrated (via hybrid-compatibility-registry.ts) for cross-signal detection. Dedup changed from 3 to 1 per symbol+strategy combination. Pattern path parity — scanPatterns now drives strategy selection instead of regime, matching the signal orchestrator's active trading behavior.
- **Upstream**: Price Cache (VTS bucket), MCE (regime + indicators via `computeContext()`), Pattern Recognition, OHLC Cache (60-min candles, 100-candle lookback via `ohlcCache.getOHLCData()` — Batch 18), BTC OHLC via OHLC Cache (for defensive_hedge Spearman correlation — HF8), Active Filter Pool (quant pool + pattern pool pairs — Batch 19C/19E), PATTERN_POOL_STRATEGIES config (Batch 19C), hybrid-compatibility-registry.ts (Batch 19G)
- **Downstream**: VTS Service (trade storage), Telemetry Aggregator (M70: only VTS writes telemetry), ML Calibration (trade outcomes)
- **Execution**: **60-second interval** (passive learning mode)
- **Blast Radius**: **HIGH** — all learning data flows through VTS
- **Contamination**: ~~`simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()` — BUG-001 (CRITICAL)~~ **REPLACED** (HF6) with real score computation: `computeRealHybridScore()`, `getPredictiveConfidence()`, `computeRealDecayPenalty()`. Strategy-specific entry/stop/target from StrategyEngine detect functions. BUG-001 PARTIALLY RESOLVED.
- **Batch 44**: Quant-pool pairs no longer sprayed against pattern strategies. Pattern routing uses normalizePatternToCanonical() as single source of truth. Duplicate scanPatterns() removed for pattern-pool pairs. FX5 scan diagnostics persist to `logs/fx5_diagnostics/`.
- **Batch 45**: Bearish strategies disabled in long-only VTS: `liquidity_trap` (bearish by design), `DHMA` short branch, `inside_bar_reversal` SELL path. 5-min post-close re-entry cooldown prevents runaway loops. `sourcePool` propagated to closed trades. `expectedEdge` stored on open trade and used in API (replaces `predictiveConfidence` default).
- **Batch 46**: Governance state persistence loaded via import (`governance-persistence.ts`).
- **Tests**: `vts-modernization.test.ts`, `vts-signal-generation.test.ts`

### 7.2 VTS Service
- **File**: `server/services/vts-service.ts` (~500+ lines)
- **What**: Trade storage (in-memory), calibration interface, ML trigger (every 10 HYBRID trades), session metrics.
- **Upstream**: VTS Runner (trade outcomes)
- **Downstream**: ML Calibration Service (trigger), calibration history
- **Blast Radius**: **MEDIUM** — data pipeline between VTS and calibration

### 7.3 ML Calibration Service
- **File**: `server/services/ml-calibration.ts` (~232 lines)
- **What**: Phase-10 ML training loop. Analyzes VTS outcomes, generates learning recommendations.
- **Upstream**: VTS Service (trade data, 10-HYBRID trigger)
- **Downstream**: Python ML microservice, calibration coefficient persistence (`logs/vts_calibration.json`)
- **Execution**: **Triggered** — every 10 HYBRID trades
- **Blast Radius**: **MEDIUM** — affects learning parameter adjustments

### 7.4 Python ML Microservice
- **File**: `services/ml_service.py` (~73KB), client: `server/services/ml-service-client.ts` (~245 lines)
- **What**: Parameter optimization, learning rate adjustments, performance prediction.
- **Upstream**: ML Calibration Service (HTTP calls to localhost:5001)
- **Downstream**: Drift Detector, strategy parameter tuning
- **Execution**: **Separate Python process** — HTTP API on localhost:5001
- **Blast Radius**: **MEDIUM** — isolated microservice with defined API

### 7.5 Drift Detector
- **File**: `server/services/drift-detector.ts` (~400-457 lines)
- **What**: Monitors calibration parameter drift (α, β, σ) per strategy. 10-snapshot rolling window. Auto-recalibrates when thresholds exceeded.
- **Upstream**: VTS trade outcomes, parameter history
- **Downstream**: ML microservice (recalibration trigger)
- **Execution**: **15-minute interval**
- **Blast Radius**: **MEDIUM** — affects when recalibration occurs

### 7.6 Telemetry Aggregator
- **File**: `server/services/telemetry-aggregator.ts` (~200+ lines)
- **What**: Per-pair/per-pool performance tracking. Single source of truth for win rates and average edge. M70 enforcement: only VTS writes. **Batch 46**: `cascadeHistory` and `poolAggregates` now persist to `logs/telemetry_state/aggregator_state.json` (60s cadence) and rehydrate on startup. `pairTelemetry` remains DB-backed only (NOT file-persisted).
- **Upstream**: VTS Runner (trade outcomes — exclusive writer)
- **Downstream**: Adaptive Ratio Manager (pool performance), FX5 scanning (pair ranking)
- **Blast Radius**: **MEDIUM** — affects pair selection bias

### 7.7 Retraining Freeze Controller
- **What**: Prevents calibration during stabilization. Auto-activates 1-hour freeze on restart (BUG-014).
- **Blast Radius**: **LOW** — gates calibration timing only

### 7.8 Learning Cooldown Governance
- **File**: `server/core/governance/learning-cooldown.ts` (~160+ lines)
- **What**: Regime-aware learning update gating. Prevents bursty parameter changes. **Batch 46**: `regimeHistory` (7-day flip rate) and governance counters now persist to `logs/governance_state/governance_state.json` via `governance-persistence.ts` (60s cadence). Rehydrated on startup — critical for regime stability classification continuity.
- **Blast Radius**: **LOW** — gates update frequency only

---

## Layer 8: Predictive Learning Stack

### 8.1 Predictive Adjustments (Micro/Fast)
- **What**: Short-horizon pattern → outcome learning. Modifies pattern confidence contributions to hybrid score. Does NOT change position sizing, stops, or entry logic.
- **Upstream**: Individual closed trades, pattern identifiers, win/loss outcomes
- **Downstream**: Hybrid score composition (pattern weight adjustments)
- **Status**: OBSERVATIONAL ONLY (as of Phase 11.8B-D1). Will become EXECUTABLE after Phase 11.8C (Authority Baseline).
- **Blast Radius**: **MEDIUM** (when executable) — affects signal scoring

### 8.2 Learning Calibration (Medium/Batch)
- **What**: Batch learning across many trades. Produces recommendations for canonical weight changes. Does not mutate live weights directly.
- **Upstream**: Groups of closed trades, aggregated performance
- **Downstream**: Canonical Weights (recommendations), learning audit trail
- **Status**: Recommendations only — no direct mutation
- **Blast Radius**: **LOW** (currently) — becomes MEDIUM when executable

### 8.3 Regime Archive (Long-Horizon Memory)
- **What**: Historical regime × strategy × outcome snapshots. Immutable (checksummed). Does not change anything directly.
- **Upstream**: VTS trade outcomes per regime/strategy
- **Downstream**: Future ML training data, drift analysis, rollback checkpoints
- **Execution**: Weekly archive (scheduled), manual archive (on-demand)
- **Blast Radius**: **LOW** — memory and audit, not action

### 8.4 Canonical Weights (Bridge Artifact)
- **File**: `bridge/canonical/phase9_predictive-learning.json`
- **What**: Authoritative snapshot of learned knowledge across patterns, regimes, confidence modifiers.
- **Upstream**: Learning Calibration (produces), Predictive Adjustments (consumes)
- **Downstream**: Predictive model baseline
- **Blast Radius**: **MEDIUM** — represents current learned state

---

## Layer 9: Infrastructure & Monitoring

### 9.1 Boot Orchestrator
- **File**: `server/core/boot_orchestrator.ts` (~348 lines)
- **What**: Manages Python ML microservice lifecycle. Auto-spawn, health polling, graceful shutdown. Initializes VTS Runner.
- **Execution**: During server startup, then **30-second health monitoring**
- **Blast Radius**: **HIGH** — controls service initialization order

### 9.2 Startup Sequence (server/index.ts)
- **File**: `server/index.ts` (~1,260 lines, monolithic)
- **What**: Single async IIFE boot sequence. ~40+ service initializations. Degraded-mode-first (all try/catch). Only hard-stop: single-tenant DB invariant.
- **Blast Radius**: **HIGH** — controls what starts and in what order
- **Note**: Any new service needs initialization wired here

### 9.3 Lazy Loader
- **File**: `server/startup/lazy-loader.ts` (~189 lines)
- **What**: Loads non-critical services after main startup. Parallel Promise.all for critical, setTimeout for low-priority.
- **Blast Radius**: **MEDIUM** — controls deferred service loading
- **Note**: Walter/Cortex services removed from lazy loader (Phases 12-13, HF9). Remaining deferred loads are non-legacy utility services.

### 9.4 Trading Bootstrap
- **File**: `server/startup/trading-bootstrap.ts` (~99 lines)
- **What**: Reinitializes trading engines on restart if they were active. Restarts RTB + TCL.
- **Blast Radius**: **MEDIUM** — controls trading engine recovery

### 9.5 FX5 Scanner Bootstrap
- **File**: `server/startup/fx5-scanner-bootstrap.ts` (~33 lines)
- **What**: Subscribes FX5 to Central Clock. Prevents double-initialization.
- **Blast Radius**: **MEDIUM** — controls scanner lifecycle

### 9.6 System Health Monitor (3-Tier)
- **Files**: `system-health.ts` (~147 lines), `system-health-monitor.ts` (~437 lines), `health-monitor.ts` (~1,495 lines)
- **What**: CPU load, memory, event loop lag, uptime, scheduler health. Ring buffer of 250 heartbeats (~21 min).
- **Execution**: **5-second heartbeat** + 1-minute logging
- **Blast Radius**: **LOW** — monitoring only, no control actions

### 9.7 Circuit Breaker
- **File**: `server/services/circuit-breaker.ts` (~336 lines)
- **What**: Prevents cascading failures. CLOSED → OPEN → HALF_OPEN state transitions.
- **Downstream**: Trading engine gating
- **Blast Radius**: **MEDIUM** — can halt trading on sustained failures

### 9.8 Scheduler Registry
- **File**: `server/services/scheduler-registry.ts` (~134 lines)
- **What**: Registry for all scheduled tasks. Manages task queues and health.
- **Blast Radius**: **LOW** — administrative tracking

### 9.9 Stage-3 Emitter
- **File**: `server/services/stage3-emitter.ts` (~100+ lines)
- **What**: WebSocket events during scanning: `scan_tick`, `scanner_breakdown`.
- **Downstream**: Frontend (Filter Insights widget)
- **Blast Radius**: **LOW** — diagnostic/display only

---

## Layer 10: Frontend & Communication

### 10.1 WebSocket Broadcast Layer
- **What**: Bi-directional communication for real-time updates (prices, scan events, trade events, health status).
- **Upstream**: Multiple backend services (scanning, execution, health, pricing)
- **Downstream**: All frontend real-time displays
- **Blast Radius**: **MEDIUM** — affects frontend real-time updates

### 10.2 REST API Routes
- **File**: `server/routes.ts` (~23,349 lines — monolithic)
- **What**: ~750 endpoints (of which ~460 have no frontend consumer). Express.js route handlers.
- **Blast Radius**: **MEDIUM** — large surface area but most endpoints are isolated
- **Note**: Decomposition into domain-specific route files planned for Phase 20
- **Security**: ~~Hardcoded JWT fallback secrets in 12 route files~~ **RESOLVED** (Directive 12.1.3). ~~Auth bypass headers in 4 files~~ **RESOLVED** (Directive 12.1.3). All route files now require valid JWT; server fails to start without JWT_SECRET env var.

### 10.3 Frontend Pages & Tabs
- **What**: 25 pages (14 active, 7 dead), 91 tab sub-pages. React SPA.
- **Blast Radius**: **LOW** per component — frontend changes are isolated from backend logic
- **Note**: 7 dead pages and Walter-related tabs to be removed (Phase 12.2)
- **Batch 19E updates**:
  - `client/src/pages/active-trades-v2.tsx`: Source Pool column with colored badges (blue QUANT / purple PATTERN) added to open simulated trades table.
  - `client/src/pages/trade-history-tab.tsx`: Source Pool column with colored badges added to closed simulated trades table.
- **Batch 19G updates**:
  - `client/src/pages/filters-with-override.tsx`: Redesigned to show 4-column Dual-Path Filter Thresholds table (Active Quant | Active Pattern | VTS Quant | VTS Pattern), reading from DB `screener_filters` table via API. Legacy filter override UI inputs REMOVED — all filter configuration now managed through DB. Screeners tab is now a read-only display of DB-driven filter values.

### 10.4 TradingModeContext
- **What**: Paper/Live mode toggle. Controls which execution engine receives signals.
- **Blast Radius**: **HIGH** — determines paper vs live execution path

---

## Layer 11: Legacy (Active but Pending Removal)

### 11.1 ~~MarketScanner Class~~ — REMOVED (Directive 12.2.2, Batch 9)
- **File**: `server/services/market-scanner.ts` — class **REMOVED** (commit `8b6bb540`)
- **What**: Legacy 10-minute scanner. Was started via `startHourlyScanning()` in routes.ts.
- **Blast Radius**: **NONE** — removed. `collectAdaptiveBatch()` and diagnostic buffers preserved.
- **Status**: COMPLETE — BUG-009 RESOLVED. Only FX5 Scanner runs now.

### 11.2 NGC / Rolling Normalization — ~~CONTAMINATION SOURCE~~ **REPLACED** (Directive 12.3.3)
- **File**: `server/core/metrics/quality_index.ts`
- **What**: ~~NGC flows as confidence carrier throughout pipeline.~~ NGC computation replaced with deterministic confidence formula (Directive 12.3.3, Batch 13). Formula: `(stratConf * 0.60) + ((1-vol) * 0.20) + ((1-risk) * 0.20)`. Rolling normalization infrastructure preserved but bypassed. Function signatures maintained for backward compatibility.
- **Blast Radius**: ~~**CRITICAL**~~ **LOW** — deterministic, no contamination path
- **Removal**: ~~Phase 12.3.3~~ **NGC REPLACED**. Full file removal deferred to MCE (PredictiveConfidence replaces entire quality_index.ts).

### 11.3 ~~Walter~~/Bob/Cortex — ~70 FILES (was ~96; Walter fully removed in Sub-Batches A+B)
- **What**: AI assistant ecosystem. Cortex is ACTIVE (in-memory cache, 15-min analytics). **Walter fully removed** (Sub-Batches A+B: 19 Walter backend files + 1 middleware + 5 frontend files + ancillary docs deleted, 13 consuming files surgically modified, 28 Walter route handlers excised from routes.ts). corpus-domain-service.ts stubbed pending Cortex cleanup. Bob modules + Cortex remain.
- **Blast Radius**: **LOW** to trading pipeline (mostly disconnected), but Cortex still consumes memory
- **Removal**: Phase 12.2.3 Sub-Batch C (Bob+Cortex). Wave 3.1 (12.2.4) COMPLETE — absorbed into Batch 6.

### 11.4 ~~NLAI~~ — REMOVED (Directive 12.2.7)
- **What**: ~~Natural Language Action Interpreter. Event handlers active.~~ REMOVED — All 5 files deleted, 6 consumer files cleaned. Commit `5d5c2051` (2026-02-24).
- **Blast Radius**: **ZERO** — completely removed
- **Status**: COMPLETE. No NLAI code remains in server/.

### 11.5 Goal Alignment — PARTIALLY REMOVED (Directive 12.2.6)
- **What**: ~~Daily/weekly targets in pre-execution-validator.ts and trading-engine.ts.~~ **Phase 9.0 alignment verification system REMOVED** (Batch 11, commit `b3a1526c`): alignment-verifier.ts, strategic-policy-guard.ts deleted; /alignment routes, AlignmentTab UI, autonomy-controller gate check all removed.
- **Remaining**: Phase 4 Goal Alignment in pre-execution-validator.ts (RISK-028) and trading-engine.ts calculateGoalAlignmentScore (BUG-012) — separate system, not yet removed.
- **Blast Radius**: **LOW** (Phase 9.0 removed, Phase 4 targets are isolated)
- **Removal**: Phase 4 targets: future directive (pre-execution-validator.ts gate + trading-engine.ts calculateGoalAlignmentScore)

### 11.6 Walter-Era Learning Services — 5+ FILES
- **What**: continuous-learning.ts, learning-cycle-service.ts, etc. Lazy-loaded, orphaned.
- **Blast Radius**: **LOW** — not connected to trading/VTS pipeline
- **Removal**: Phase 12.2.8 (Wave 8)

### 11.7 ~~L-Series Systems~~ — **SERVICE FILES REMOVED** (Phase 13, Batch 14)
- **What**: ~~14+ MCP/ARE importers, 12+ DCE importers, ~57 tables, ~40 enums.~~ All 17 L-series services, 9 route files, 1 M-series service, 2 utilities DELETED (Batch 14, `8f26369a`). ~57 database tables + ~40 enums remain as inert DB artifacts.
- **Blast Radius**: **NONE** (service layer) — DB artifacts are orphaned, harmless
- **Status**: COMPLETE (service layer). DB cleanup is a future migration task.

---

## Quick Lookup: "If I Change X, Check Y"

| If You Change... | Also Check... |
|-------------------|---------------|
| **Signal Orchestrator** | VTS Runner (mirrors scoring), SQE (thresholds), Paper Execution Engine (EV gate), Cost Model, Price Cache, OHLC Cache, all signal tests |
| **FinalScore weights** | SQE thresholds, VTS Runner, TCL ranking, all scoring tests |
| **DI calculation** | Net Expectancy Kernel (Pwin), Paper Execution Engine, VTS Runner, Trailing Exit Controller |
| **Cost Model** | Signal Orchestrator (EV gate), Paper Execution Engine, FX5 Scanner (cost filtering) |
| **Market Context Engine (MCE)** | Signal Orchestrator (active trading + pattern pool), VTS Runner (passive learning), calculatePairRegime(), canonical regime map, market-indicators.ts (getDominantRegime — Phase 14.5), ranking context bonus |
| **calculatePairRegime()** | MCE (calls it internally), VTS Runner (via MCE), Signal Orchestrator (via MCE), canonical regime map, drift detector baselines |
| **Price Cache** | Paper Execution Engine, VTS Runner, Signal Orchestrator (ticker via `getCachedPrice()` — Batch 18), FX5 Scanner, MicroExecutionService, all frontend price displays |
| **OHLC Cache** | Signal Orchestrator (OHLC data), VTS Runner (OHLC data + BTC candles), KrakenService (wrapped by cache) |
| **FX5 Scanner** | Active Filter Pool (quant + pattern pools), Signal Orchestrator, Cost Cache, Telemetry Aggregator, Stage-3 Emitter, screener_filters DB table (8 rows, 4-path — Batch 19G), OHLC Cache (pattern-only pre-fetch — Batch 19G HF1) |
| **Paper Execution Engine** | Portfolio state, Guardrails V2, Pre-Execution Validator, WebSocket broadcasts, trade history DB |
| **VTS Runner** | VTS Service, ML Calibration, Telemetry Aggregator, Drift Detector, Adaptive Ratio Manager |
| **Guardrails V2** | Pre-Execution Validator, Paper Execution Engine, Kill Switch |
| **Pre-Execution Validator** | Paper Execution Engine, Trading Engine (live), Goal Alignment (Phase 4 — RISK-028, still active) |
| **Boot sequence (index.ts)** | Lazy Loader, Trading Bootstrap, FX5 Bootstrap, Portfolio Initializer, all services initialized there |
| **Kraken WebSocket** | Price Cache, Live Pricing Adapter, MicroExecutionService, Symbol Normalization |
| **Any database schema** | storage.ts, all queries referencing that table, frontend consuming those endpoints. **Batch 19E**: `paper_sim_trades` and `paper_sim_open_positions` gained `source_pool` column (via schema.ts migration). Paper Execution Engine writes it; active-trades-v2.tsx and trade-history-tab.tsx display it. **Batch 19G**: `screener_filters` table gained columns `filter_path`, `lq_min`, `vn_max`, `corr_max`, `di_min` and expanded to 8 rows (4 per mode). FX5 scanner reads; filters-with-override.tsx displays. |
| **Any API endpoint** | Frontend components consuming it, WebSocket events, other routes referencing it |
| **Predictive Adjustments** | Hybrid score composition, canonical weights, learning governance |
| **ML Calibration** | Python microservice, drift detector, retraining freeze, VTS service |
| **Pattern Filter Profile** | FX5 Scanner (pattern pool thresholds — now DB-driven, Batch 19G), SQE (elevated FinalScore floor), Paper Position Sizing (15% cap), Signal Orchestrator (PATTERN_POOL_STRATEGIES list), VTS Runner (pattern pool fetch — Batch 19E), Paper Execution Engine (sourcePool persistence — Batch 19E). **Batch 37**: sourcePool is now family-qualified (`quant-trend`, `quant-reversal`, `quant-breakout`, `quant-oscillation`, `pattern`). Total quant survivors = sum of family survivors (not deduplicated). |
| **Ranking Weights** | RTB getTopSignal() (queue ordering), Signal Orchestrator (context bonus computation), FINAL_SCORE_GAP_OVERRIDE safety rule |
| **Active Filter Pool (pattern pool)** | FX5 Scanner (populates), Signal Orchestrator (reads pattern pool), pattern-filter-profile.ts config |
| **screener_filters DB table** | FX5 Scanner (reads 8 rows for 4-path filtering — Batch 19G), filters-with-override.tsx (displays 4-column table — Batch 19G). **Columns**: id, mode, filter_path, volume_min, spread_max, history_days, lq_min, vn_max, corr_max, di_min. **Rows**: 8 total (active_quant, active_pattern, vts_quant, vts_pattern per paper/live mode). Replaces hardcoded configs in pattern-global-filters.ts (DELETED) and system-guards.ts (DEPRECATED for filters, guardrails kept). |
| **Hybrid Compatibility Registry** | Signal Orchestrator (hybrid confluence), VTS Runner (hybrid confluence buffer — Batch 19G) |

---

---

## Infrastructure Dependencies (Batch 40 — Post-Replit Migration)

| Component | Dependencies | Notes |
|-----------|-------------|-------|
| **Hetzner Staging Server** | 188.245.193.8, Ubuntu 24.04, Node 20, PM2, nginx, deploy user, Python 3 venv for ML | Primary runtime environment. Replaces Replit. |
| **Supabase PostgreSQL** | db.vqqyisaudwenrdhnmjwt.supabase.co:5432, Frankfurt region | Database host. Replaces Neon serverless. Standard `pg` driver via `server/db.ts`. |
| **nginx** | Reverse proxy on port 80, upstream to localhost:5000. WebSocket upgrade for `/ws`. Rate limiting on `/api/`. | SSL-ready (certbot). Config at `/etc/nginx/sites-available/dawntrader`. |
| **PM2** | Process manager for `dist/index.js` as `dawntrader` process under `deploy` user. | Logs at `/home/deploy/.pm2/logs/`. Ecosystem config at `ecosystem.config.cjs`. |
| **GitHub Actions CI** | `.github/workflows/ci.yml` — typecheck, build, Docker build on push to migration branch. | Deploy-staging workflow is a template (not active until secrets configured). |
| **Docker** | `Dockerfile` (multi-stage: Node 20 + Python 3 for ML). `.dockerignore`. `docker-compose.yml`. | Available for containerized deployments but PM2 is primary on staging. |
| **Langston Server** | 204.168.141.77 (Hetzner, Helsinki). OpenClaw gateway, Telegram bot, cc-inbox, Google Drive mount. | Separate from staging. NOT moved during migration. |
| **Replit (FROZEN)** | replit.com/@kylegjordan/The-Dawn-Trader. Branch: dawntrader-v4. Last commit: 892d7f24. | No updates. FX5 scanner runs temporarily. Backup only. |
| **server/db.ts** | `pg` package (node-postgres), `drizzle-orm/node-postgres`, `DATABASE_URL` env var pointing to Supabase. | Changed from `@neondatabase/serverless` in Batch 40. All Drizzle ORM queries unchanged. |
| **vite.config.ts** | React plugin only. Replit plugins removed in Batch 40. | No longer depends on `REPL_ID` or `@replit/vite-plugin-*`. |
| **screener_filters DB table** | Now 24 rows: 4 base paths + 4 family paths x 2 modes (paper/live). Columns include `filter_path`, `lq_min`, `vn_max`, `corr_max`, `di_min`, `di_max`. | Expanded from 8 rows (Batch 19G) to 24 rows (Batch 40 — family-specific profiles added). |

---

## Recent Additions (B52-B53)

| Component | Location | Impact |
|-----------|----------|--------|
| **Filter Diagnostics UI** | `client/src/pages/machine-learning.tsx` | Machine Learning tab — displays VTS pipeline data: 24h Rolling Aggregates, Last Scan VTS Signal Funnel, By Strategy table (Evaluated/True Nulls/Null%/Signals/Rejected/Trades), Pre-Evaluation Skips, Post-Signal Rejections, Setup Nulls breakdown. Reads from `/api/vts/filter-diagnostics`. Blast radius: LOW (UI only). |
| **VTS Entry Validation Guard** | `server/services/vts-runner.ts` (B53 Fix 2) | Before opening a trade, verifies current market price is above stop and below target with minimum viable distance (2× friction). Prevents zero-duration trades. Logs `[B53][ENTRY_GUARD]`. Blast radius: MEDIUM (affects signal→trade conversion rate). |
| **VTS byStrategy Counters** | `server/services/vts-runner.ts`, `server/types/virtual-trade.interface.ts` | Per-strategy tracking of evaluated, nulls, signals, preRejectionSignals, rejected. Aggregated in 24h rolling window via `getVTSEvalRolling24h()`. Persisted to `logs/vts_eval_history/`. Blast radius: LOW (observability only). |
| **Null Reason Tracker** | `server/utils/null-reason-tracker.ts` | Global state: `setNullReason()` / `getNullReason()` / `resetNullReason()`. Reset before each strategy call. Used by all 17 strategies to classify why detect() returned null. Blast radius: LOW (diagnostic only). |
| **Pattern Recognizer** | `server/services/pattern-recognizer.ts` | Detects 6 pattern types: PINBAR, ENGULFING, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR, ABCD. Called by FX5 scanner (outer loop) and VTS (per-pair). B53: ABCD Fibonacci 0.350-0.820, min candles 12. B54: PINBAR wick 2×→1.5× body, INSIDE_BAR 0.1% tolerance, THREE_SOLDIERS 0.25% opens-in-body, MORNING_STAR body/range 0.4→0.3. Blast radius: MEDIUM (upstream of all pattern strategies). |
| **Strategy Threshold Constants** | `server/strategies/*.ts` | Each strategy file defines threshold constants at top. B53 relaxations: IB_MAX_COMPRESSION 0.80→0.85, SB_PROXIMITY 2.5%→3.5%, VE VWAP tolerance 1%, VE volume 1.5→1.3, RI_RSI_MAX 38→40. Blast radius: MEDIUM (affects signal generation rate). |
| **DI Threshold (DB-driven)** | `screener_filters` table (Supabase), `server/db/update-di-thresholds.ts` | DI_MIN for family filters. B54: active_trend and vts_trend 12→10. Breakout already at 10/8. DB is sole authority — app reads per scan cycle, no restart needed. Blast radius: MEDIUM (affects which pairs qualify for trend family). |
| **ai-analyst (REMOVED)** | `server/services/ai-analyst.ts` (dead code), `server/routes.ts` | B54: Legacy Walter/OpenAI service fully removed. 8 route handlers return 501. Service file retained for reference. No runtime impact — was already null-stubbed since migration. Blast radius: NONE (dead code removal). |

*This map is a living document. Update it after any directive that changes component dependencies, adds new services, or removes legacy systems.*
