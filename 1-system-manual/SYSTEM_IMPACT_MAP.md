# DawnTrader System Impact Map

> **Author**: Claude Code (System Cartographer)
> **Created**: 2026-02-19
> **Last Updated**: 2026-04-19 (B62 CLOSED with verified 72h metrics — RBS drift 0.00% across 23,983 samples, TFS+IE 46.19%, 174k MCE samples + 359 trades. All §5.1 / §5.1b / §5.2.5 / §7.1 B62 changes verified operational.)
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
- **Batch 57**: Pattern-strategy mismatch fixed — `buildPatternInputForStrategy()` ensures each strategy receives only its matching pattern instead of the global best. Previously all strategies received the single globally-strongest pattern, causing massive "No Pattern Detected" nulls.

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

### 5.1 calculatePairRegime() — CANONICAL (ACTIVE, redesigned B62)
- **File**: `server/core/metrics/market-regime.ts`
- **What**: Canonical pair-level regime classification. **B62 Design B:** `calculatePairRegime()` now accepts `dbsScore` parameter as primary classification input. DBS-integrated classifier eliminates drift contamination (RBS 70% → 0%). 5 regimes (TREND_FRIENDLY_STABLE, HIGH_VOLATILITY_UNSTABLE, RANGE_BOUND_STABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION). Uses DBS score + volatility + momentum + DX. DX thresholds recalibrated for crypto in HF7 (25 to 45/50/55/60).
- **Upstream**: OHLC price data (60-min candles from both VTS and orchestrator — aligned in HF8), **DBS score (from directional-bias.ts via MCE — B62, new upstream feeder)**
- **Downstream**: VTS Runner (heavy use via MCE), Signal Orchestrator (via MCE — **WIRED**, Phase 13 Batch 14)
- **Execution**: Synchronous — called per pair via MCE. **MCE computes DBS before regime (B62 ordering swap).**
- **Blast Radius**: **HIGH** — regime determines strategy selection
- **Status**: **ACTIVE** — sole pair-level regime authority for both VTS and active trading (~~BUG-006~~ RESOLVED, Batch 13). DX thresholds recalibrated for crypto in HF7 (`64014bd2`). **Code freeze LIFTED (B62).** DBS-integrated classifier deployed to staging and **verified 2026-04-19** across 174k MCE samples: RBS drift contamination 0.00%, TFS+IE 46.19%, RBS 14.4%, IE 3.2%. Primary B62 objective met.
- **⚠ Phase 15b audit finding (2026-04-14):** The pre-B62 classifier used vol + ADX + momentum thresholds but had **no directional drift check**. Result: 54.5% of pairs labeled `RANGE_BOUND_STABLE` while only ~8% had truly neutral momentum — the other 47% were drift-contaminated false ranges, bleeding `range_trade` (76% loss rate). **B62 fix:** DBS score is now the primary classification input, eliminating drift contamination. RBS drift contamination 70% → 0%. TFS+IE share 14% → 36.5%.

### 5.1b calculateDBS() / getPairDirectionalBias() / getGlobalDirectionalBias() — LIVE (consumed by regime classifier, B62)
- **File**: `server/core/metrics/directional-bias.ts`, `server/types/directional-bias.types.ts`
- **What**: Directional Bias Score (DBS) — composite formula `0.40×slope + 0.35×return + 0.25×EMA_alignment`, ATR-normalized. 7 categories (UP_STRONG through DOWN_STRONG). Per-pair DBS plus global DBS (weighted median of pair DBS by 24h volume). `biasConfidenceModifier` defined in types file (aligned 1.05–1.15×, opposing 0.70–0.85×, neutral 1.0×).
- **Upstream**: OHLC candles (60-min), ATR (from MCE), EMA chain (from MCE)
- **Downstream consumer sites (corrected 2026-04-15 post-Phase-3a-grep, B61):** Two source references exist. Both were originally claimed as "orphan" but were re-classified by the Phase 3a consumer grep as **dormant wire** and **no-op half-wire**. Neither has ever applied DBS to a captured decision.
   - **`server/services/signal-orchestrator.ts:454` — DORMANT CONSUMER WIRE.** Imports `computeBiasConfidenceModifier` at L89. At L448–467 the code computes `dbsModifier`, multiplies `extendedMetrics.confidence` by it, and recomputes `finalScore`. Shipped 2026-03-05 22:08 UTC in commit `c28f0df`, same day as DBS module creation (commit `5bfa63b`, 11:56 UTC). **Never executed against any captured cycle** — active trading has been continuously OFF since at least 2026-01-12 (verified against zero rows in `trades`, `paper_trades`, `paper_sim_trades` and audit_log latest timestamp 2026-01-12 19:05 UTC, seven weeks before DBS integration). The L448 comment `// (parity with VTS path)` is doubly incorrect: VTS has no applying behavior to achieve parity with, and the orchestrator path has not run at all. See burial-pattern note below.
   - **`server/services/vts-runner.ts:877` — HALF-WIRED DEAD CODE.** Imports `computeBiasConfidenceModifier` at L67. At L875–877 computes `biasModifier = computeBiasConfidenceModifier(biasCategory)`; the result is never referenced again anywhere in the file. Every VTS-emitted trade across the 15-day B61 audit window has `biasModifier` computed and immediately discarded.
- **Other DBS references (pre-B62 Phase 3a grep, SUPERSEDED — see post-B63 status below):** `directional-bias.ts` + `directional-bias.types.ts` (emitters/types); `market-context-engine.ts` (PRE-B63: computed DBS; POST-B63: CONSUMES propagated DBS, no longer computes); `market-indicators.ts` L291–305 (reads MCE DBS, caches `globalDBS` category); `vts-runner.ts` (writes `pairDirectionalBias`/`globalDirectionalBias` into trade metadata — passthrough); `telemetry-repository.ts` (passthrough); `routes.ts`, `analytics.tsx`, `machine-learning.tsx` (UI display); `export-csv.ts`, `shared/schema.ts`, `frictionColor.ts` (metadata helpers).
- **B62 UPDATE (CONFIRMED LIVE):** Regime classifier (`calculatePairRegime(ohlcData, dbsScore)`) CONSUMES DBS as primary input. RBS requires |DBS|<0.10, TFS admits |DBS|≥0.30, IE admits |DBS|≥0.50 + vol. Prior "NOT consumed by regime classifier" text was pre-B62 and stale.
- **B63 UPDATE (CONFIRMED LIVE 2026-04-20):** DBS computation MOVED from MCE to FX5 scanner pre-filter. DBS is now a HARD PIPELINE CONTRACT — no fallback, no recompute. DBS is a ROUTING key (|DBS|≥0.35 positive routes exclusively to quant-strong_trend family / path 6). DBS is a STRATEGY entry gate (strong_bull_trend requires DBS≥0.35 + slope rising). DBS is a STRATEGY exclusion gate (morning_star, reverse_impulse, volatility_edge, defensive_hedge, vwap_pullback all self-exclude when dbs≥0.35 — belt-and-braces for Path D routing). DBS is a PATH-AWARE NET EV input (pWin = 0.40 + |DBS|/2 for quant-strong_trend sourcePool, replacing DI-based formula). **Not consumed by:** SQE FinalScore floor (path-blind confirmed in score-chain audit), PredictiveConfidence (regime×strategy winRate only), RegimeWeight (signal-level vol only), RTB ranking (pure FinalScore descending).
- **B63 Items 10-14 + 16 UPDATE (CONFIRMED LIVE 2026-04-21):** Five additional layers added on top of B63 core.
  - **Item 10 (counter-trend LONG guard)** — mirror of Item 6's positive-DBS exclusion. All 5 LONG-only strategies (morning_star, reverse_impulse, defensive_hedge, sma_trend_ride, vwap_pullback) now return null with reason `b63b_counter_trend_long_exclusion` when `dbsScore <= -0.35`. Eliminates the 94-trade mirror defect identified in BATCH_63_COUNTERFACTUAL_AUDIT.
  - **Item 11 (`vwap_pullback` strong-trend lane promotion + lane arbitration)** — NEW `MULTI_FAMILY_ELIGIBILITY` map in `server/config/canonical-regime-strategy-map.ts` makes `vwap_pullback` eligible in both `trend` (primary) and `strong_trend` (additional) families. Family-eligibility gate in vts-runner OR's primary + additional membership. First-claim-wins lane arbitration added in vts-runner (above Batch 19G duplicate guard): when `sourcePool === 'quant-strong_trend'` and another strong-trend-lane strategy already has a trade open on this pair, return null with reason `strong_trend_lane_conflict`.
  - **Item 12 (strong-trend geometry override plumbing)** — NEW optional `strongTrendGeometryOverride: { stopAtrMultiplier, targetAsRMultiple }` field on `TechnicalIndicators`. `vts-runner.ts` attaches `{ 4.0, 3.0 }` (Variant E per audit) at call site when `sourcePool === 'quant-strong_trend'`. `detectVWAPPullback` consumes the override to produce 4×ATR stop and 3R target. `strong_bull_trend` ignores the field (uses locked native constants). Contract test: `server/tests/unit/b63-item12-geometry-override.test.ts` (4 tests passing in CI).
  - **Item 14 (mode-overlay lane bypass)** — `vts-runner.ts` (~L1086) and `paper-execution-engine.ts` (~L2165) both now conditionally skip mode-overlay multipliers when `sourcePool === 'quant-strong_trend'`, using native stop/target distances. Fixes silent 2:1 → 1.33:1 (DEFENSIVE) or 0.8 (SURVIVAL) RR destruction on every pre-fix strong-trend trade. Reversal/continuation archetypes retain mode-overlay as designed — bypass is scoped to the strong-trend lane only.
  - **Item 16 (global DBS persistent store + atomic snapshot)** — see new §5.1c below. Pre-B63 computeGlobalBias (opportunistic cache read + 70% coverage gate) replaced with deterministic per-pair store + end-of-cycle atomic snapshot + fixed 20-pair floor + explicit 5-row behavior spec. MCE `computeGlobalBias()` now delegates to the store.
- **Execution**: Synchronous — `calculateDBS()` called per pair per MCE cycle (60s). Consumer sites execute only when their host paths run (signal-orchestrator: never during B61; vts-runner: every VTS strategy evaluation, result discarded).
- **Blast Radius**: **CURRENTLY ZERO applied.** Potential HIGH — once any consumer path is actually exercised with an applied modifier, DBS touches regime classification, strategy selection, filter layer, entry gates, exit triggers.
- **Status**: **LIVE — consumed by regime classifier (B62).** DBS is now the primary input to `calculatePairRegime()` via MCE. Both dead code paths removed: signal-orchestrator.ts:454 dormant wire REMOVED, vts-runner.ts:877 half-wire REMOVED. `sentinelZero` field added to DBS output (flags zero-volume pairs for coverage gating). VTS benchmark exclusion filter removed. Previously DORMANT-WIRE + HALF-WIRE through B61. Re-classified during Phase 3a codebase consumer grep (2026-04-15, B61). B62 completed the integration that B61 validated.
- **⚠ Governance framing (corrected 2026-04-15):** Not "DBS is orphaned" (ambiguous and partly false — imports existed). Not "DBS has been silently shaping signals" (also false — active trading has been off). The correct framing is **"dormant wire on orchestrator, no-op half-wire on VTS, both buried under ambiguous orphan language."** The governance failure is that the prior SIM entry said "NONE" and "never imported anywhere" — operationally true for captured decisions during the DBS era, but false as a code-path inventory claim. Every future review must check both runtime consumer behavior AND source-level imports, not conflate them.
- **⚠ Burial pattern — false parity claim (case study for future reviews).** The `signal-orchestrator.ts:448` comment `// (parity with VTS path)` asserts consistency with a sibling path that is itself dead code. The sibling (`vts-runner.ts:877`) computes the modifier and discards the result, so there is no "parity" to achieve — the parity claim is fictional. Future reviews should specifically flag comments that assert consistency with another code path without verifying the other path actually does what the comment claims. This is a named burial pattern: **false parity claim between two broken paths.**
- **Code freeze:** LIFTED (B62). `directional-bias.ts` and `market-regime.ts` both modified in B62 as part of DBS-integrated classifier redesign. Previous freeze was in effect through B61 audit.
- **Simulation evidence (2026-04-14):** DBS-based classifier redesign produces `TREND_FRIENDLY_STABLE` 19.3% → 55.7%, `RANGE_BOUND_STABLE` 54.5% → 3.4%. Live DBS distribution: 55.7% of pairs UP_MODERATE or stronger, only 4.5% NEUTRAL. See `Claude Comms and Packages/Scope Files/REGIME_DBS_STRATEGY_AUDIT_SCOPE_2026-04-14.md`.
- **✅ Operational takeaway:** The 15-day VTS audit window (2026-03-31 → 2026-04-14, ~960 closed VTS trades) is DBS-clean. No captured trade has been modified by DBS. The B59 `range_trade` investigation and the planned B61 A.1/A.2/A.4 Final measurements run against uncontaminated data. B61 measurement integrity is intact.

### 5.1c Directional Bias Store — (NEW, B63 Item 16, shipped 2026-04-21)
- **File**: `server/core/metrics/directional-bias-store.ts` (NEW, ~200 lines), singleton export `directionalBiasStore` + convenience accessor `getLatestGlobalDbsSnapshot()`.
- **What**: Persistent per-pair DBS store + end-of-cycle atomic snapshot + fixed 20-pair floor. Replaces the pre-B63 opportunistic-cache-read approach (MCE walked its own cache each call and applied a 70% coverage gate that could silently flip between NEUTRAL and computed values within a cycle).
- **Types**: `PairStoreEntry { score, timestamp, sentinelZero, volume }`; exported `GlobalDbsSnapshot { value, snapshotTime, coverage, isStale }`.
- **Constants**: `GLOBAL_DBS_MIN_SAMPLE_COUNT = 20` (exported); `PAIR_HARD_EXPIRY_MS = 5 * 60 * 1000` (internal).
- **Methods**:
  - `updatePair(symbol, score, sentinelZero, volume)` — called by MCE inside `computeContext` each time a pair's DBS is computed.
  - `publishSnapshot()` — sweeps hard-expired entries, applies 20-pair floor, computes + caches atomic snapshot. Implements all 5 behavior-spec rows. Returns `GlobalDbsSnapshot | null`.
  - `getLatestSnapshot()` — returns cached snapshot; `null` on cold start. Returns same object REFERENCE across multiple reads until next `publishSnapshot()`.
  - `getStoreSize()` — diagnostic.
  - `clear()` — tests only.
- **5-row behavior spec (exact semantics):**
  1. Empty store + no prior snapshot → `null` + log `[GlobalDBS][coldStart] snapshot unavailable, store has 0 pairs, floor 20; returning null`
  2. Below floor + prior snapshot exists → last good snapshot with `isStale: true` + log `[GlobalDBS][degradedCoverage] serving stale snapshot, liveStore=N, floor=20`
  3. Below floor + no prior snapshot (store has 1..19 pairs) → `null` + log `[GlobalDBS][noSnapshot] store below floor (N) and no prior snapshot; returning null`
  4. Non-finite compute (NaN) + prior snapshot → stale prior + log `[GlobalDBS][invalidCompute] kept prior snapshot (current compute produced non-finite score=X)`. Non-finite + no prior → `null` + same log family.
  5. Happy path (≥ 20 pairs + valid compute) → fresh snapshot with `isStale: false`; no log (normal operation).
- **Upstream**: MCE `computeContext` writes via `updatePair`.
- **Downstream consumers**: MCE `computeGlobalBias()` (reads via `publishSnapshot()`), `market-indicators.ts` (transitively through MCE), future UI endpoints exposing global DBS + stale flag.
- **Execution**: Per scan-cycle. `updatePair` is O(1) per pair. `publishSnapshot` sweeps expired entries + calls `computeGlobalDirectionalBias` under the hood.
- **Blast Radius**: **HIGH** — all global-DBS consumers read from this single source. But behavior is deterministic and explicitly fails (`null` / `isStale: true`) rather than silently degrading.
- **Status**: **LIVE** — shipped 2026-04-21 in commit `a4f5dbe0` (Stage 16). PM2 #81 restart. Cold-start log at T+3s; first valid snapshot at T+63s (pairs=33). Zero `degradedCoverage` / `noSnapshot` / `invalidCompute` / `Serving STALE` lines observed in 15+ minutes of normal operation post-warm-up.
- **In-memory only for B63** — DB-backed persistence deferred to B64+ per Langston's pre-audit resolution. Cold-start warmup is acceptable.
- **Tests**: `server/tests/unit/b63-item16-dbs-store.test.ts` — 11 contract tests, all passing. Includes fake-timer-driven Row 2 test (populate → publish → advance 6min → repopulate below floor → assert stale carry-forward with exact prior value + coverage + snapshotTime).
- **Governance principle**: `null` and `isStale: true` are DIFFERENT states. Consumers that need to distinguish "no snapshot available" from "stale snapshot" must handle both. Never substitute zero/default for `null`.
- **Reference**: `BATCH_63_SCOPE.md` Item 16; `BATCH_63_PRE_AUDIT.md` §13 Item 16; CHANGES_AND_FIXES `DBS-B63-ITEM16-001`.

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
- **Status**: **ACTIVE** — installed Batch 14 (`8f26369a`), extended Batch 19 (`getDominantRegime()`), extended B62 (DBS-before-regime ordering, `getCachedVolumes()`, coverage gate). Resolves RISK-002 (indicator duplication).
- **Tests**: Zero direct MCE test files yet. Validated via integration through signal-orchestrator and VTS.
- **B62 updates (2026-04-16):** MCE now computes DBS before regime classification (ordering swap). New `getCachedVolumes()` method provides 24h volume data for global DBS computation. Coverage gate added — global DBS requires minimum pair coverage before being treated as decision-grade. DBS score passed as parameter to `calculatePairRegime()`.
- **B63 Item 16 update (2026-04-21):** MCE no longer walks its own cache to compute global DBS. Instead: (a) `computeContext()` now calls `directionalBiasStore.updatePair(symbol, score, sentinelZero, volume24h)` after computing each pair's directionalBias. (b) `computeGlobalBias()` delegates to `directionalBiasStore.publishSnapshot()` and returns `snapshot.value` (or NEUTRAL/pairCount=0 on `null` for backward compat with legacy callers). Pre-B63 70%-coverage-gate constant renamed to `GLOBAL_DBS_MIN_COVERAGE_PCT_DEPRECATED` as rollback marker; no longer consulted. Legacy `volumes` parameter on `computeGlobalBias` retained as `_volumes` for back-compat (now ignored — volumes are tracked INSIDE the store via `updatePair`). See §5.1c for store details.
- **B61 Instrumentation (2026-04-15):** Three observational telemetry emitters added, feature-flagged on `DT_PHASE15B_DBS_TELEMETRY=1`: (1) MCE cycle-sampled emitter writes per-pair DBS + regime + indicators to `logs/phase15b_dbs_telemetry/YYYY-MM-DD.jsonl` every 60s cycle. (2) Signal-orchestrator dormant-wire emitter at L454 — **REMOVED in B62** (dead code path deleted). (3) VTS half-wire emitter at `vts-runner.ts:877` — **REMOVED in B62** (dead code path deleted). MCE cycle emitter (1) remains active.

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
- **Batch 57**: Pattern-strategy mismatch fixed — per-strategy pattern routing matches VTS behavior to signal-orchestrator fix. Pool-split null reason tracking added (quant pool vs pattern pool breakdown in null reason counters). adaptive-flow.ts THREE_SOLDIERS/MORNING_STAR canonicalization bug fixed.
- **B62**: Benchmark exclusion filter removed (VTS benchmarks unblocked). Half-wire at L877 (`biasModifier` computed and discarded) removed — dead code path deleted.
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
- **Upstream**: VTS trade outcomes per regime/strategy (via VTS Telemetry Aggregator — `vts-telemetry.ts`)
- **Downstream**: Future ML training data, drift analysis, rollback checkpoints, B60 Evidence Collector
- **Execution**: Weekly archive (scheduled), manual archive (on-demand)
- **B59 Fix**: `vts-telemetry.ts:148` field name mismatch fixed (netProfit → netProfitPercent conversion). Pre-existing pnl double-scaling at line 158 also fixed (Langston catch). Archive now receives real VTS win rates and P&L.
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

### 9.10 Canonical Bridge Sync (Batch 59)
- **File**: `server/scripts/sync-canonical-bridge.ts` + `server/services/autonomy-scheduler.ts` (daily task)
- **What**: Regenerates canonical bridge JSON and Markdown files from TypeScript source. **B59**: Added daily auto-sync scheduler task. Fixed ESM compatibility (`require.main === module` → typeof guard). Fixed hard-coded `updatedAt` timestamp — now uses fresh date on every sync.
- **Upstream**: `canonical-regime-strategy-map.ts` (TypeScript source of truth)
- **Downstream**: Mapping Drift UI tab (reads bridge JSON metadata), regime-strategy documentation
- **Blast Radius**: **LOW** — documentation/metadata sync only

### 9.11 Adjustment Registry (Batch 58b, updated B59)
- **File**: `server/config/adjustment-registry.ts`
- **What**: Parameter bounds definitions, validation functions, audit logging for all Tier 1/2 adjustable parameters per ADJUSTMENT_FRAMEWORK.md.
- **Upstream**: Boot Orchestrator (startup validation), SCORE_WEIGHTS, EXECUTION_CONFIG
- **Downstream**: routes.ts `/api/filters-v2` PUT handler (log-only validation on filter writes)
- **Mode**: Log-only (warn but don't block). Switch to enforce mode via `setValidationMode('enforce')` after verification.
- **Blast Radius**: **LOW** — read-only validation, never blocks in log-only mode

### 9.12 Authority Baseline Loader (Batch 58b)
- **File**: `server/config/authority-baseline.ts`
- **What**: Loads V1.0 authority baseline from `1-system-manual/authority-baseline-v1.json`. Provides comparison utilities for drift detection.
- **Upstream**: `authority-baseline-v1.json` (file read at startup)
- **Downstream**: Boot Orchestrator (loaded during initialize()), drift comparison utilities (available to any consumer)
- **Read-only**: Never modifies any values. Provides getBaselineFilterValue(), getBaselineStrategyParam(), compareFiltersToBaseline().
- **Blast Radius**: **LOW** — read-only, non-blocking, graceful degradation if file missing

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
| **Strategy Threshold Constants** | `server/strategies/*.ts` | Each strategy file defines threshold constants at top. B53 relaxations: IB_MAX_COMPRESSION 0.80→0.85, SB_PROXIMITY 2.5%→3.5%, VE VWAP tolerance 1%, VE volume 1.5→1.3, RI_RSI_MAX 38→40. B57 Fix 4: support_bounce and reverse_impulse volume gate converted from hard 1.2-1.3x gate to graduated confidence factor (>=2.0x: bonus, >=1.2x: small bonus, >=0.8x: neutral, <0.8x: penalty). Breakout strategies keep hard gates. Blast radius: MEDIUM (affects signal generation rate). |
| **DI Threshold (DB-driven)** | `screener_filters` table (Supabase), `server/db/update-di-thresholds.ts` | DI_MIN for family filters. B54: active_trend and vts_trend 12→10. Breakout already at 10/8. DB is sole authority — app reads per scan cycle, no restart needed. Blast radius: MEDIUM (affects which pairs qualify for trend family). |
| **ai-analyst (REMOVED)** | `server/services/ai-analyst.ts` (dead code), `server/routes.ts` | B54: Legacy Walter/OpenAI service fully removed. 8 route handlers return 501. Service file retained for reference. No runtime impact — was already null-stubbed since migration. Blast radius: NONE (dead code removal). |

## Recent Additions (B63 — Strong Bull Trend + 19-item audit)

| Component | Location | Impact |
|-----------|----------|--------|
| **strong_bull_trend Strategy** | `server/strategies/strong-bull-trend.ts`, `server/services/strategy-engine.ts` | New strategy introduced in B63. Fires when: pairDBS ≥ 0.35, regime ∈ {TFS, IE}, sourcePool promoted to `quant-strong_trend`. Uses Variant E geometry (4× ATR stop, 3R target). Routes through strong-trend lane; `sourcePool === 'quant-strong_trend'` triggers geometry-override AND mode-overlay bypass downstream. Blast radius: MEDIUM (new signal source, affects open-book volume). |
| **MULTI_FAMILY_ELIGIBILITY Map** | `server/config/canonical-regime-strategy-map.ts` | NEW map `Record<string, StrategyFamily[]>`. Currently: `vwap_pullback: ['strong_trend']`. Allows a primary-family strategy to ALSO qualify for additional family lanes (B63 Item 11). Consumed by `server/services/vts-runner.ts` in the family-eligibility gate: `primaryFamilyMismatch && !additionalFamilyMatch` suppresses the signal. Blast radius: HIGH — adding entries here activates lane promotion for new strategies. Changes here affect signal routing downstream. |
| **Strong-Trend Geometry Override** | `server/services/vts-runner.ts` (L1060-ish), `server/services/paper-execution-engine.ts` (L2140-ish) | When `sourcePool === 'quant-strong_trend'`, signal carries `strongTrendGeometryOverride: { stopAtrMultiplier: 4.0, targetAsRMultiple: 3.0 }`. Consumed by both VTS and paper engines. Upstream: `strategy-engine.ts` attaches on promotion; downstream: both execution engines read from signal. Blast radius: MEDIUM (affects trade geometry ONLY for strong-trend-lane trades). |
| **Mode-Overlay Lane Bypass** | `server/services/vts-runner.ts` (~L1086), `server/services/paper-execution-engine.ts` (~L2165) | When `sourcePool === 'quant-strong_trend'`, NORMAL/DEFENSIVE/SURVIVAL mode-overlay multipliers are bypassed; native geometry preserved. Prevents RR destruction on strong-trend trades during SURVIVAL mode. Mirrored across VTS + paper for parity. Blast radius: MEDIUM (geometry behavior differs from other lanes — any new lane must decide whether to honor or bypass). |
| **Counter-Trend LONG Guard (b63b)** | `server/strategies/morning-star.ts`, `server/strategies/reverse-impulse.ts`, `server/strategies/defensive-hedge.ts`, `server/services/strategy-engine.ts` (sma_trend_ride block) | When `dbsScore ≤ -0.35`, these 4 LONG strategies return null with null-reason `b63b_counter_trend_long_exclusion`. Upstream: `directional-bias-store` provides dbsScore via MCE. Downstream: null-reason tracker + strategy-engine skip. Blast radius: LOW (reduces signal generation in down-biased conditions; purely conservative). |
| **directional-bias-store** | `server/core/metrics/directional-bias-store.ts` (NEW) | Persistent Map<symbol, PairStoreEntry> with 5-row behavior spec: (1) cold-start, (2) below-floor-with-prior, (3) below-floor-no-prior, (4) invalid-compute, (5) happy-path. End-of-cycle atomic `publishSnapshot()`. Constants: `SNAPSHOT_HISTORY_MAX=96` (24h × 15-min cadence), `TRANSITION_HISTORY_MAX=50`, `GLOBAL_DBS_MIN_SAMPLE_COUNT=20`, `PAIR_HARD_EXPIRY_MS=300000` (5 min). Upstream: `market-context-engine.ts` calls `updatePair()` per MCE cycle then `publishSnapshot()` at cycle end. Downstream: `market-indicators.ts` reads `getLatestSnapshot()` + isStale flags; drift-dashboard-aggregator reads `getHistory()` + `getTransitions()`. Blast radius: HIGH (single source of truth for global DBS; 5-row spec governs what downstream gets). |
| **Global DBS isStale Surfacing** | `server/services/market-indicators.ts`, `client/src/pages/overview.tsx` (isStale badge) | `globalDBSIsStale: boolean` + `globalDBSSnapshotAgeSeconds: number` exposed on market-indicators response. UI badge on Overview tab renders when `isStale=true`. Upstream: directional-bias-store snapshot freshness check. Blast radius: LOW (observability). |

## Recent Additions (B64a — Regime & Strategy Drift Dashboard)

| Component | Location | Impact |
|-----------|----------|--------|
| **drift-dashboard-aggregator** | `server/services/drift-dashboard-aggregator.ts` (NEW) | Aggregates closed-trade performance from `logs/virtual_trades/` + regime telemetry from `logs/phase15b_dbs_telemetry/` + store history from `directional-bias-store`. 4 window modes: `rolling_24h`, `rolling_7d`, `rolling_30d`, `cohort_latest`. Produces per-regime strategy stats (N, Wins, WR, AvgNet$, AvgNet%, SumNet$, SumNet%), DBS distribution, family flicker %, RBS drift contamination %. Uses CANONICAL_REGIMES + REGIMES.* (no hardcoded regime strings — required for `regime_mapping_integrity.test.ts`). Blast radius: LOW (read-only analytics). |
| **Drift Dashboard Endpoint** | `server/routes.ts` (`/api/analytics/drift-dashboard`) | Exposes aggregator output with window query param. Blast radius: LOW (new endpoint). |
| **Drift Dashboard UI Tab** | `client/src/pages/analytics.tsx` (`DriftDashboardSection` + `GlobalDbsSparkline`) | 5th Analytics tab. Shows: trade counts, regime shares, DBS distribution, global DBS current + 24h sparkline + transitions, per-regime strategy performance table. Window toggle. Auto-refresh. Sparkline is inline-SVG (zero chart-lib dep). Blast radius: LOW (UI-only). |
| **24h Snapshot Ring Buffer** | `directional-bias-store.ts` internal | 96-entry ring buffer of `{timestamp, score, category, pairCount}` at 15-min cadence. Populated on every `publishSnapshot()`. Read by aggregator via `getHistory()`. Evicts oldest on push. Blast radius: LOW. |
| **Category Transitions Array** | `directional-bias-store.ts` internal | Last 50 category transitions of global DBS (from/to/timestamp). Populated only on FRESH snapshots (not degraded/stale). Read by aggregator via `getTransitions()`. Blast radius: LOW. |

## B63/B64a "If I Change X, Check Y" additions

- **If you edit `MULTI_FAMILY_ELIGIBILITY`** → check `vts-runner.ts` family-eligibility gate logic AND the canonical regime-strategy map narratives for the affected strategy. Adding a new entry activates lane promotion — verify the target lane's geometry and mode-overlay behavior is appropriate.
- **If you edit the strong-trend geometry override constants** → check BOTH `vts-runner.ts` AND `paper-execution-engine.ts` (mirrored). Also update System Manual §Strategy Geometry.
- **If you edit the mode-overlay bypass condition** → check sourcePool string matches exactly (`quant-strong_trend` — underscored). Any new lane that wants bypass must be added to both files.
- **If you edit `directional-bias-store` 5-row spec** → the spec is the authority over global DBS freshness/validity; changes cascade to `market-indicators.ts` isStale semantics AND to drift-dashboard-aggregator's freshness filters. Update System Manual §Global DBS Store.
- **If you edit the regime string constants** → ALL code paths must route through `CANONICAL_REGIMES` / `REGIMES.*` — no literals allowed. `regime_mapping_integrity.test.ts` enforces this. drift-dashboard-aggregator specifically was rewritten to satisfy this test.

---

*This map is a living document. Update it after any directive that changes component dependencies, adds new services, or removes legacy systems.*

---

## B65.1 — `module_constants` infrastructure (2026-04-23)

**New service:** `server/services/module-constants-service.ts`. 5-dim keying `(module_name, exchange, asset_class, strategy, regime, constant_name) → JSONB value`. Most-specific-wins resolution (regime weight 8, strategy 4, asset_class 2, exchange 1). 60s cache. Exports `getConstant`, `getModuleConstants`, `setConstant`, `invalidateModuleCache`, `clearModuleConstantsCache`.

**Schema additions:** `exchange` + `asset_class` columns on `watchlist_pairs`, `trading_signals`, `trades`, `paper_sim_trades`. `base_currency` NOT NULL on `trades` + `paper_sim_trades`.

**New deploy primitive:** `scripts/db-migrate.ts` + `npm run db:migrate`. Replaces drizzle-kit push (introspector breaks on PG ARRAY defaults — see CHANGES_AND_FIXES B65.1-FIX-001).

---

## B65.2 — Trailing-exit engine engaged (2026-04-23 + HF1-HF3 through 2026-04-24)

**Engaged:** `server/services/trailing-exit-controller.ts` was dormant since Phase 11; now called from BOTH the VTS exit loop and paper `checkExitConditions` via the new `server/services/tec-evaluator.ts` centralizer.

**Deleted (no deprecation):** `server/services/execution-controller.ts`, `server/config/execution-config.ts`, `server/types/trade-flow.ts`, 2 unit tests for those files.

**EXECUTION_CONFIG consumers migrated** to `module_constants` before deletion: dynamic-sizing-engine (`MAX_POSITION_RISK` → `risk_sizing.max_position_risk`), telemetry-aggregator (diagnostic mirror), boot-orchestrator + adjustment-registry (B65.2 version stamp), adaptive-manager (dead import removed), diagnostics-tab.tsx (narrative text).

**Schema:** `paper_sim_trades.trade_mode` column added (varchar 20, NOT NULL DEFAULT 'TARGET', CHECK `IN ('TARGET','TRAILING_TAKE')`).

**Stop writeback:** `paper_sim_open_positions.stop_loss` now updated on every engine ratchet (debounced 5s via `trade-safety.ts::persistTrailingStates`).

**SIGTERM handler:** `server/index.ts` shutdown handler synchronously flushes trailing-state persistence file.

**Engine state on UI:**
- `/api/vts/ml/open` extended with `tradeMode`, `breakEvenLatched`, `targetLatched`, `engineStopPrice`.
- `/api/vts/ml/closed` extended with `tradeMode` + raw `exitReason`.
- `client/src/pages/machine-learning.tsx` renders TEC State column on both Open + Closed Simulated Trades tables.
- `client/src/components/trading/trade-history-tab.tsx` renders updated close-reason badges (Trail / M.Cap / BE Protect / Stop / Target).

**Module-constants seed rows** (`trailing_exit` module): break_even_trigger_r=1.0, target_lock_r=1.5, trail_distance_atr_multiplier=1.0, persistence_debounce_ms=5000, moonbag_qualifying_strategies (4-strategy array), moonbag_qualifying_source_pools (vwap_pullback → quant-strong_trend only), moonbag_max_duration_ms=14400000, moonbag_cap_mode='reserved_slots', moonbag_reserved_slots=1. (`risk_sizing` module): max_position_risk=0.02.

**Exit-reason taxonomy after HF3:**
- `stop_hit` — entry-time stop hit, real loss
- `break_even_stop` — BE lock ratcheted stop hit before target. Near-breakeven protective exit.
- `target_hit` — static target hit, no trailing (non-qualifier or concurrency cap)
- `trailing_stop_hit` — moonbag (TRAILING_TAKE) trailing stop hit after target latch
- `moonbag_timeout` — moonbag held past 4h cap
- `timeout` / `stale_timeout` — VTS-only, MAX_HOLD_MS safety valve

**Cross-cutting impact:**
- **If you edit trailing-exit-controller.ts** → check tec-evaluator (caller), vts-runner exit loop, paper-execution-engine.checkExitConditions, parity test `b65-tec-parity.test.ts`. PositionUpdate now carries optional strategy/sourcePool/regime/callerMode/moonbagAllowed/moonbagQualified.
- **If you edit moonbag qualifier or caps** → values live in `module_constants` rows; engine reads via 60s cache. Tunable without redeploy.
- **If you edit exit-reason mapping in vts-service.ts** → check `export-csv.ts::getClosedVTSTradesFromLogs` mapping priority. Raw exitReason now wins over legacy resultType for B65.2 reasons. Inverting that ordering re-introduces FIX-002.

---

## Adaptive Market Response — concept anchor (2026-04-25)

**Status:** concept-document only. Existing skeleton: `server/core/governance/strategy-modes.ts` (Directive 11.7S) maps `RegimeStability` → `StrategyMode` → mode-overlay multipliers. Currently mostly dormant. Concept doc at `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`. Conditional Phase 19.5 in roadmap.

---

## B65.4 — Ladder trailing model (2026-04-25)

**Engine state extension:** `TrailingState` interface in `server/services/trailing-exit-controller.ts` adds three fields:
- `ladderRung: number` — 0 = no targets hit; 1+ = N target hits in moonbag mode
- `currentRungTarget: number` — the active target being aimed at; advances on each rung event
- `currentRungFloor: number` — locked-in stop floor (cost-aware) from previous rung's target

**Engine semantic change:** `updatePosition()` now ratchets BOTH stop AND target on each rung event (was: only stop ratcheted via HWM dynamic trail in pure-trail design). Loop processes any further rung crossings within the same cycle for multi-rung price gaps. After ladder advances, dynamic HWM trail is preserved as a SECONDARY floor: `newStopPrice = max(currentRungFloor, dynamic_HWM_trail)`.

**Engine return extension:** `TrailingUpdateResult.ladderRungsHit: number` — propagated to all downstream consumers so the closed-trade record can capture how far up the ladder the trade climbed.

**Backward compatibility:** `importStates()` migrates pre-B65.4 persisted states. `targetLatched=true` → `ladderRung=1`, `currentRungTarget=targetPrice`, `currentRungFloor=0`. Logged.

**Schema:** `paper_sim_trades.ladder_rungs_hit INTEGER NOT NULL DEFAULT 0` column added (migration `2026-04-25-b65-4-add-ladder-rungs.sql`). `shared/schema.ts :: paperSimTrades` updated.

**Surface changes:**
- `tec-evaluator.ts::TECExitDecision` includes `ladderRungsHit`. All return paths in trailing branch propagate.
- `vts-runner.ts`: `OpenVirtualTrade` interface gains `ladderRungsHit`. Exit loop writes back from decision. `getOpenVirtualTradesForML` returns it on `/api/vts/ml/open`.
- `vts-service.ts::persistRealPriceTrade` accepts `ladderRungsHit`, writes to JSON log.
- `paper-execution-engine.ts::closePosition` reads engine state for `finalLadderRung`, writes to closed-trade row.
- `export-csv.ts::getClosedVTSTradesFromLogs` surfaces `ladderRungsHit` on `/api/vts/ml/closed`.

**UI changes:**
- `client/src/pages/machine-learning.tsx`: TEC State column on both Open + Closed Simulated Trades renders `🌙 MB×N` for trades with ladder rung count. Tooltip explains the ratchet count.
- `client/src/components/trading/trade-history-tab.tsx`: close-reason cell renders the same `MB×N` chip on moonbag-ended trades.

**Tests:** `server/tests/unit/b65-tec-parity.test.ts` extended with 9 new scenarios (12-20) covering rung 1/2/3, multi-rung gap in single cycle, qualifier/cap rejects (no ladder), HWM dynamic floor between rungs, duration cap at rung > 1, backward-compat persistence migration, Langston Q5 ordering test (rung target hit cleanly above prior HWM).

**Cross-cutting impact:**
- **If you edit the rung-step computation** in `updatePosition` → check that `rungStepPrice = state.targetPrice - state.entryPrice` is still calculated from ORIGINAL entry-to-target distance (not from currentStopPrice which can be ratcheted by then).
- **If you edit `computeNetTargetFloor`** → both Stage-1.5 BE-trailing AND ladder rung-floor computation use it. Behavior changes there cascade.
- **If you change `module_constants.trailing_exit.target_lock_r`** → controls when target latch fires (rung 0 → 1) but does NOT control the rung step size. Step size always = original target distance from entry.
- **If you persist new fields on `TrailingState`** → update `importStates` migration to handle missing fields with sensible defaults.

**Concurrency cap counter:** unchanged from B65.2. Counter increments on rung 1 entry (modeChanged from TARGET → TRAILING_TAKE), decrements on `clearTrailingState`. Subsequent rungs (2, 3, ...) do NOT re-increment — each trade occupies one moonbag slot regardless of rung count.

**Duration cap:** unchanged from B65.2. Timer starts at first target latch (rung 1), fires on cap exceed regardless of current rung. `ladderRungsHit` is captured on the `moonbag_timeout` close.

---

## B65.4.1 — Cost-aware floor formula change (2026-04-26 hotfix)

**Trigger:** B65.4 ladder counterfactual analysis showed the original `computeNetTargetFloor` formula (`target * (1 - totalCost/2)`) placed the rung floor BELOW the just-hit target, allowing reversals to exit below the original target value. Across the first 5 closed laddered trades, the ladder lost ~$11 vs the just-take-target counterfactual.

**Change:** new formula `target * (1 + slippage * bufferMultiplier)` places floor ABOVE the target by exactly the per-pair slippage estimate × multiplier. Multi-rung ratcheting still works unchanged.

**Module constant:** `trailing_exit.rung_floor_slippage_buffer_multiplier` (seed 1.0). Tunable per `(asset_class, exchange, regime, strategy)` without code redeploy. Migration `2026-04-26-b65-4-1-rung-floor-buffer-seed.sql`.

**Cross-cutting impact:**
- **If you edit `computeNetTargetFloor`** → both initial target-latch floor placement AND ladder rung-floor computation use it. Verify the function still receives the multiplier parameter and applies it correctly. BE-latch path uses `computeNetBreakeven` (separate function, NOT affected by this change).
- **If you change the multiplier seed** → `module_constants` DB update only; no code change required.

---

## B65.4.2 — Ladder observability columns (2026-04-28 hotfix)

**Trigger:** B65.4.1 verification 2026-04-28 showed counterfactual analysis was unreadable on "anomaly" rows because the closed-trade CSV didn't expose latch-trigger price, original stop, or per-rung target history. Analyst had to grep PM2 entry logs to recover original stops.

**Engine state extension:** `TrailingState` interface in `server/services/trailing-exit-controller.ts` adds three optional observability fields:
- `originalStopPrice` (number) — captured at `initializeTrailingState`, never modified.
- `latchTriggerPrice` (number) — set ONCE when `targetLatched` first flips false→true. Records actual latch-trigger price (which can differ from `state.targetPrice` due to `target_lock_r` interaction).
- `rungTargetHistory` (number[]) — appended at each ratchet. Index 0 = original target (rung 1).

**Propagation:** the 3 fields flow through `TrailingUpdateResult` → `tec-evaluator.ts:TECExitDecision` → `vts-runner.ts:OpenVirtualTrade` → `vts-service.ts:persistRealPriceTrade` → JSON log + `paper-execution-engine.ts:closePosition` → `paper_sim_trades` row. Also surfaced through `getOpenVirtualTradesForML` for the open-trades API serializer.

**Schema:** `paper_sim_trades` adds three columns (migration `2026-04-28-b65-4-2-ladder-observability-columns.sql`):
- `original_stop_price` decimal(20,8) nullable
- `latch_trigger_price` decimal(20,8) nullable
- `rung_target_history` jsonb nullable

**Backward compatibility:** `importStates` initializes `rungTargetHistory: []` on migrated states. `originalStopPrice` and `latchTriggerPrice` remain undefined for trades whose state was persisted before B65.4.2 (cannot reconstruct).

**Cross-cutting impact:**
- **If you edit the closed-trade CSV export schema** → 3 new columns appear in both open + closed exports (`server/utils/export-csv.ts` updated).
- **If you edit `getOpenVirtualTradesForML`** → 3 new fields added to the return type, read from engine state with `trade.*` fallback.
- **If you ever reconstruct old trades for backtest** → `originalStopPrice`/`latchTriggerPrice` will be null for trades closed before 2026-04-28; cannot be backfilled.

---

## Master planning doc reference (2026-04-27)

The regime classifier overhaul + external data integration plan lives at `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md`. **Required pre-work before any B67-related implementation.** §11 contains 12 decisions queued for Kyle.

**Architecture decisions (Kyle-pending) that affect SIM downstream:**
- B67 confidence-modifier architecture means the regime classifier formula stays unchanged; macroAdjustment (0.85-1.05x) modulates the confidence number, propagates through stability detector → existing mode overlay → throttle on entry.
- Phase dimension EARLY/PRIME/LATE on existing 5 regimes (no new top-level regimes). Naming locked 2026-04-28.
- B67 expanded to 6 sub-deliverables (~3-4 weeks). All 12 §11 decisions resolved 2026-04-28.

---

## B67.0 — Telemetry & Ablation Framework (2026-04-28, commit `105d2b53`)

**New service:** `server/services/factor-ablation-emitter.ts`. Fire-and-forget `emitAblationRecord(source, pairSymbol, realDecision, alternates)` API with discriminated `AblationSource = { kind: 'active_signal'; signalId: number } | { kind: 'vts_trade'; vtsTradeId: string }` union. Gated on `module_constants.ablation_framework.b67_0_ablation_emit_enabled` (default true). Bulk insert one row per (source, factor); empty alternates short-circuits to no-op. Errors caught + logged; classifier never blocks on emit.

**New script:** `server/scripts/replay-ablation.ts`. Nightly cron at 04:00 UTC (npm script `b67:replay-ablation`). Skeleton at B67.0 ship — counts pending rows by source_type, runs 90-day retention sweep on `evaluated_at`. Active-path replay outcome lookup gated until B67.5 produces ablation rows joinable to `paper_sim_trades`. VTS path JSONL outcome reader gated until first B67.1+ factor producer needs it. Exported `classifyTradeOutcome(pnlUsd)` and `AblationOutcome` type for downstream factor producers.

**New table:** `regime_factor_alternates` (12 columns). XOR CHECK constraint: exactly one of `signal_id` (integer, for active path) or `vts_trade_id` (text, for VTS path) populated; `source_type IN ('active_signal','vts_trade')` discriminator. JSONB `real_decision` and `alternate_decision` permissive for forward-compat. `replay_outcome` + `replay_completed_at` populated by nightly job. 4 indexes: (factor_name, evaluated_at DESC), (signal_id WHERE NOT NULL), (vts_trade_id WHERE NOT NULL), (pair_symbol, evaluated_at DESC).

**New module_constants seeds (`ablation_framework` module):**
- `b67_0_ablation_emit_enabled` (bool, default `true`)
- `b67_0_alternates_retention_days` (int, default `90`)
- `b67_0_paper_replay_capital_threshold_pct` (float, default `0.80`)

**Wire-in sites (call hooks for B67.1+ factor producers):**
- `server/services/signal-orchestrator.ts` — emit hook after `readyToBuyService.queueSQESignal()` in the active-trading path. Today fires with empty alternates (no-op). When B67.1+ ships, each producer adds its `FactorAlternate` to the array.
- `server/services/vts-runner.ts` — emit hook before `return { signal, tradeRecord }` in the VTS-mirror path. Same empty-alternates pattern.

**New API endpoint:** `GET /api/analytics/ablation-comparison?window=...` (`server/routes.ts`). Reads `regime_factor_alternates` via the aggregator, returns per-factor counterfactual stats. Empty until B67.1+ producers ship.

**Aggregator extension:** `server/services/drift-dashboard-aggregator.ts` adds `computeAblationComparison(window)` exported function. GROUP BY factor_name with conditional JSONB aggregations from `replay_outcome` for the four-quadrant taxonomy (admit/admit, admit/reject, reject/admit, reject/reject). Lazy-imports DB to avoid coupling the file's existing JSONL paths to Drizzle/pg at module load.

**UI:** `AblationComparisonSection` component in `client/src/pages/analytics.tsx` Drift Dashboard tab. Renders below existing `DriftDashboardSection`. 60s refetch. Window toggle (24h / 7d / 30d / since-restart). Empty-state explainer when `totalRows === 0`; 8-column table when populated.

**Cross-cutting impact:**
- **If you edit the emitter API signature** → check both call sites (`signal-orchestrator.ts`, `vts-runner.ts`) AND every B67.1+ factor producer that accumulates alternates. The discriminated `AblationSource` union enforces source-type at the type level — the wire-in sites cannot pass a raw integer.
- **If you change the four-quadrant taxonomy in `replay-ablation.ts`** → update the aggregator's SQL CASE conditions in `drift-dashboard-aggregator.ts` and the UI's column labels. The `notes` and `alternateOutcome` discriminator strings flow through three files.
- **If you flip `b67_0_ablation_emit_enabled = false`** → emit becomes no-op globally. Useful as kill-switch if storage growth is unexpected. No code change needed.
- **If you change the retention window** → update `b67_0_alternates_retention_days` in `module_constants`; nightly job picks it up next run.
- **If you migrate trade outcome storage off paper_sim_trades + JSONL** → the replay job's outcome-lookup queries (gated for B67.1+) need a corresponding update.

**Blast Radius:** **MEDIUM** at B67.0 ship time (no factor producers yet, observation-only). Becomes **HIGH** as factor producers ship and the framework's outputs feed live calibration decisions.

**Status:** **ACTIVE** — shipped 2026-04-28 in commit `105d2b53`. PM2 restart #101. HTTP 200. 0 rows in table (expected at ship time). Step-7 first-pass verification clean. Step-8 Langston second-pass + Kyle UI ack pending.

**B67.x cross-references "If I Change X, Check Y":**
- **Edit `factor-ablation-emitter.ts`** → check both wire-in sites + every factor producer
- **Edit `regime_factor_alternates` schema** → update `shared/schema.ts` Drizzle table, migration + rollback files, aggregator SQL queries
- **Edit `replay-ablation.ts` outcome taxonomy** → update aggregator SQL discriminators AND UI column labels
- **Edit aggregator window translation** → both `drift-dashboard-aggregator.ts` (existing) and the new B67.0 `WINDOW_TO_MS` constant must agree; mismatched window semantics produce confusing dashboards
- **Add a new B67.x factor producer** → add the alternate computation at the wire-in sites in signal-orchestrator + vts-runner; do NOT modify the emitter API; new factor name strings should be `b67_X_<descriptor>` for consistency

**Independent safety gap (separate from B67.0 scope):** B67.0 V2 pre-audit found the kill-switch `dailyLossKillSwitchPct` is configured (10% per UI) but `tripKillSwitch()` is only called manually — no auto-trip code exists. Logged as `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 9 marked **BLOCKING for live-trading activation**.

---

## B67.1 — Macro Confidence Modifier (2026-04-28, commit `828f6d92`)

**New service:** `server/services/external-macro-feed.ts`. Singleton polling CoinGecko `/global` (BTC dominance + total mcap) and Binance `/fapi/v1/premiumIndex` (BTC + ETH 8h funding rates, OI-weighted 0.6/0.4). 60s cache + 720-sample in-memory rolling window for z-score normalization. Partial-feed graceful (one upstream fails → snapshot.partialFeed=true; both fail → stale snapshot retained). Loud `[B67.1][feed]` PM2 logging per cycle. Lifecycle: `initExternalMacroFeed()` at boot; `getLatestMacroSnapshot()` + `getLatestMacroBaseline()` sync read API.

**New pure function:** `server/core/metrics/macro-modifier.ts`. `computeMacroModifier(snapshot, baseline, config)` returns `{value, btcDomZ, fundingZ, mcapZ, fallbackActive, staleDataFlag}`. Cold-start floor: when any baseline has < `b67_1_zscore_min_sample_count` (default 48) samples → modifier=1.0 + fallbackActive=true. Stale-data floor: snapshot.ageSeconds > staleSeconds → modifier=1.0 + staleDataFlag=true. Sign convention: rising BTC dominance penalizes (alt confidence drops on "BTC season"); crowded funding penalizes (mean-revert risk); rising mcap momentum reinforces (broad-breadth confirmation). Exports `buildB67_1Alternate()` helper that produces the B67.0 ablation alternate row from a modulated confidence + modifier result via reverse-derivation `confidence_without = modulated / modifier.value`.

**Modified:** `server/core/metrics/market-regime.ts` `calculatePairRegime(ohlcData, dbsScore=0, macroModifier=1.0)` — accepts optional 3rd `macroModifier` parameter applied PRE-clamp. Confidence clamp upper bound raised 0.95 → 1.0 to accommodate post-modifier 0.95×1.05=0.9975. Verified zero callers asserted on prior 0.95 ceiling. Default 1.0 preserves pre-B67.1 behavior for callers that don't pass the arg.

**Modified:** `server/services/market-context-engine.ts` MCE adds `refreshMacroContext()` async timer started in `start()` (interval = `cacheTTLMs`, default 60s). Reads `module_constants.macro_modifier.*` for config, reads snapshot + baseline from feed singleton, computes modifier, caches result on instance. Sync accessor `getCurrentMacroContext()` exposes cached `MacroContext = { snapshot, modifier: MacroModifierResult | null }` for downstream consumers. `computeContext()` reads cached macro context, threads `modifier?.value ?? 1.0` into `calculatePairRegime` 3rd arg, attaches macro context to returned `MarketContext.macro` field. **Refresh is async outside per-pair hot path** — no latency impact on per-pair classification.

**Modified:** `server/services/signal-orchestrator.ts` (line ~638 emit hook) and `server/services/vts-runner.ts` (line ~1374 emit hook) — push `buildB67_1Alternate()` row onto `emitAblationRecord` alternates array when MCE has non-null modifier. In shadow mode (`b67_1_enabled=false`), MCE returns `{snapshot, modifier: null}` and the hook does NOT emit a B67.1 alternate. After flip, every signal evaluation emits the alternate with the agreed JSONB shape.

**Modified:** `server/services/market-snapshot.ts` reconciled per pre-audit §3.5. Pre-existing stub returned hardcoded values (`btcDominance: 54.2`); now thin wrapper around `external-macro-feed.ts` `getLatestMacroSnapshot()`. Single existing caller (`ai-market-analyzer.ts`) transparently inherits real values. New `fundingRate?: number` field on the `MarketSnapshot` type.

**Modified:** `server/services/autonomy-scheduler.ts` adds `initExternalMacroFeed()` at boot, alongside the existing `initMarketContextEngine()`. Fire-and-forget; errors logged.

**Modified:** `server/types/market-context.ts` adds `MacroContext` interface + optional `macro?: MacroContext` field on `MarketContext` (back-compat).

**New module_constants seeds (`macro_modifier` module, 11 rows):**
- `b67_1_enabled` (bool, default `false` shadow)
- `b67_1_btc_dominance_weight` / `funding_weight` / `mcap_momentum_weight` (floats, 0.40 / 0.35 / 0.25)
- `b67_1_modifier_min` / `modifier_max` (floats, 0.85 / 1.05)
- `b67_1_external_feed_cache_seconds` (60) / `b67_1_external_feed_stale_seconds` (300)
- `b67_1_btc_dominance_zscore_lookback_days` / `b67_1_funding_zscore_lookback_days` (30 / 30)
- `b67_1_zscore_min_sample_count` (48 — cold-start floor per Langston cc-inbox #844)

**Cross-cutting impact:**
- **If you edit `calculatePairRegime` upper-clamp** → upper bound is 1.0 post-B67.1 (was 0.95 pre-B67.1). Anything reading regime.confidence and asserting on a strict 0.95 ceiling breaks.
- **If you edit the MCE refresh cadence** → both the constants-read and the modifier compute happen on this timer. Per-pair `computeContext` reads the CACHED context synchronously; cadence change affects refresh staleness, not per-pair accuracy.
- **If you flip `b67_1_enabled = true`** → MCE refresh sets `modifier` to a non-null value; `calculatePairRegime` starts applying modulation; ablation hooks at orchestrator + vts-runner start emitting B67.1 alternate rows. No code redeploy required.
- **If you change the BTC + ETH 0.6/0.4 OI weighting** → this is intentionally hardcoded in `external-macro-feed.ts` (NOT in `module_constants`) per Langston cc-inbox #845 — changing it requires understanding OI structure, not knob-tuning.
- **If you persist the rolling baseline to DB** (B67.4 future) → see `external-macro-feed.ts` header — currently in-memory only; promote to `macro_feed_history` table only if calibration check requires restart-surviving baselines.
- **If you add a new factor producer (B67.2+)** → follow B67.1's pattern: pure function, MCE refresh-loop wire-up if global, sync accessor, ablation hook at both orchestrator + vts-runner. Do NOT modify emitter API.
- **If you reconcile `market-snapshot.ts` further** → 1 caller today (`ai-market-analyzer.ts`); type already extended with `fundingRate?` field. Shape changes need to consider that caller.

**Blast Radius:** Currently **LOW** — confidence is decorative pre-B67.5 (no consumer reads it as a gate; verified `isHighConfidenceRegime()` has zero callers). Becomes **HIGH** at B67.5 when consumers wire in.

**Status:** **SHIPPED** 2026-04-28 in commit `828f6d92`. PM2 restart #103. HTTP 200. Migration `2026-04-28-b67-1-macro-modifier.sql` applied cleanly. Feed alive (`[B67.1][feed]` per 60s). All 11 seeds verified. Shadow mode (`b67_1_enabled=false`). 18 unit tests pass at `b67-1-macro-modifier.test.ts`. Step-7 first-pass verification clean. Step-8 Langston second-pass acknowledged via cc-inbox #847.

**B67.1 cross-references "If I Change X, Check Y":**
- **Edit `macro-modifier.ts` formula** → unit test cases need refresh; ablation row reverse-derivation in `buildB67_1Alternate` may need adjustment if value semantics change
- **Edit `external-macro-feed.ts` upstream API URLs** → confirm response shape parsers; partial-feed handling triggers gracefully
- **Edit MCE refresh interval** → impacts both modifier staleness and the constants-cache hit ratio
- **Add a fundingRate consumer outside `external-macro-feed.ts`** → re-read via `getLatestMacroSnapshot().fundingRate`; do NOT poll Binance directly elsewhere
- **Promote rolling baseline to DB** → migration + rollback + state class refactor; B67.4 dependency

**B67.1 V2 pre-audit findings carry forward:**
- **defensive-hedge BTC correlation:** orthogonal to B67.1 (per-pair Spearman vs macro dominance). No double-count. Different decision points (strategy entry filter vs system-wide regime confidence). Documented `BATCH_67_1_PRE_AUDIT.md` §3.4.
- **`market-snapshot.ts` stub:** reconciled inline per `BATCH_67_1_PRE_AUDIT.md` §3.5. Single caller transparently upgrades. No parallel `MarketSnapshot` type created.
