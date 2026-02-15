# DawnTrader System Manual v1.0

> **Version**: 1.0.0
> **Date**: 2026-02-15
> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Project Manager**: Kyle
> **Last Directive**: 11.8B-D1
> **Status**: Paper Trading (Pre-Live)

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Trading Pipeline Map](#2-trading-pipeline-map)
3. [Indicator Ownership & Computation Map](#3-indicator-ownership--computation-map)
4. [Regime Classification & Strategy Mapping](#4-regime-classification--strategy-mapping)
5. [Legacy Contamination Report & Deprecation Registry](#5-legacy-contamination-report--deprecation-registry)
6. [Known Bugs, Architecture Risks & Critical Findings](#6-known-bugs-architecture-risks--critical-findings)
7. [MCE Integration Blueprint](#7-mce-integration-blueprint)
8. [Governance Protocol & Directive System](#8-governance-protocol--directive-system)
9. [Replit Impact Reference Map](#9-replit-impact-reference-map)

---

## 1. System Overview & Architecture

### 1.1 What DawnTrader Is

DawnTrader is an autonomous cryptocurrency algorithmic trading system that connects to the **Kraken** exchange. It scans the market for tradable pairs, classifies market conditions (regimes), selects strategies appropriate to those conditions, generates trading signals, sizes positions, and executes trades.

### 1.2 Three Operating Modes

| Mode | Purpose | Flag | VTS Running? | Trading Active? |
|------|---------|------|-------------|-----------------|
| **Passive Learning (VTS)** | Autonomous simulation, data collection, ML training | `passiveLearning=true` | Yes | No |
| **Paper Trading** | Live market data, simulated execution, validation | `tradingActive=true (paper mode)` | No | Yes (paper) |
| **Live Trading** | Real money, real execution on Kraken | `tradingActive=true (live mode)` | No | Yes (live) |

**Current State**: Passive Learning / Paper Trading preparation.
**Engine has not run since**: End of Phase 8. Significant rework (Phases 9-11) has occurred without live testing.

### 1.3 Technology Stack

- **Backend**: Node.js / TypeScript (Express server)
- **Frontend**: React / TypeScript (Vite)
- **Database**: PostgreSQL (Drizzle ORM)
- **Exchange**: Kraken REST + WebSocket API
- **Shared Schema**: `shared/schema.ts` + `shared/diagnostic-schema.ts`
- **Config**: `server/config/system-guards.ts` (constants), `server/config/canonical-regime-strategy-map.ts` (regime-strategy mapping)

### 1.4 Three Signal Types

| Type | Source | Description | Strategy Count |
|------|--------|-------------|----------------|
| **QUANT** | Strategy Engine | Pure mathematical signals from price/volume analysis | 9 implemented |
| **PATTERN** | Pattern Recognizer | Candlestick pattern detection (Pinbar, Engulfing, etc.) | 3+ patterns |
| **HYBRID** | Hybrid Integration | Confluence of QUANT + PATTERN signals | Derived combinations |

### 1.5 Authority Model (Phase 11.8)

| Authority | File | Responsibility |
|-----------|------|---------------|
| **Net Expectancy Kernel** | `server/core/calculations/net-expectancy-kernel.ts` | Sole EV (Expected Value) computation authority |
| **Canonical Regime-Strategy Map** | `server/config/canonical-regime-strategy-map.ts` | Single source of truth for all regime, strategy, and signal type mappings |
| **System Guards** | `server/config/system-guards.ts` | Immutable mathematical constants, thresholds, and (legacy) strategy map |
| **Score Weights Config** | `server/config/score-weights.config.ts` | FinalScore formula weights |
| **Phase 11 Predictive Learning** | `server/core/calibration/*` | Sole parameter adjustment authority |

### 1.6 Core Scoring Formula

```
FinalScore = (HybridScore x 0.4) + (Confidence x 0.3) + (RegimeWeight x 0.2) - (DecayPenalty x 0.1)
```

- **HybridScore**: Combined quant + pattern ensemble score (0-1)
- **Confidence**: Signal quality / predictive confidence (0-1)
- **RegimeWeight**: Market regime alignment score (0-1)
- **DecayPenalty**: Signal age/freshness penalty (0-1)
- **Profitability Gate**: Trade only executes if `netEV > 0` (Physics First principle)

---

## 2. Trading Pipeline Map

### 2.1 Complete Signal Flow (Live/Paper Path)

```
KRAKEN EXCHANGE
    |
    v
[1] FX5 Scanner (server/services/fx5-scanner.ts)
    - Fetches all tradable pairs from Kraken
    - Applies volume, price, and liquidity filters
    - Outputs: Scan batch with pool assignment (ideal/rotational)
    |
    v
[2] Active Filter Pool (server/services/active-filter-pool.ts)
    - Stores FX5-verified pairs for signal generation
    - Dual-pool architecture: Ideal (60%) + Rotational (40%)
    - Failure tracking with cooldowns
    |
    v
[3] Signal Orchestrator (server/services/signal-orchestrator.ts)
    - Timer-based evaluation loop (default 30s interval)
    - For each eligible pair:
    |
    |   [3a] Price & OHLC Fetch
    |       - Gets current price from Kraken ticker
    |       - Gets OHLC candle data (1h bars)
    |       - Applies Adaptive Kalman Filter for smoothed price
    |
    |   [3b] Pre-Signal Math (server/utils/analysis-utils.ts)
    |       - Calculates: ER (Efficiency Ratio), VolNoise, TrendSlope
    |       - These feed into DSS regime detection
    |
    |   [3c] DSS Regime Check (server/services/dynamic-strategy-selector.ts)
    |       *** CRITICAL: Uses SYSTEM_GUARDS.STRATEGY_MAP (legacy 6-regime, 9 quant-only) ***
    |       *** NOT the canonical map (5-regime, 17 strategies) ***
    |       - Determines regime from volNoise + trendSlope
    |       - EXTREME_NOISE veto if volNoise > 0.6
    |       - Filters enabled strategies to regime-allowed set
    |
    |   [3d] Strategy Engine (server/services/strategy-engine.ts)
    |       - Runs each regime-allowed strategy against the pair
    |       - 9 QUANT strategies: vwap_pullback, abcd_long, sma_trend_ride,
    |         breakout, mean_reversion, range_trading, vwap_bounce,
    |         liquidity_trap, dhma
    |       - Each outputs: StrategySignal {entry, stop, target, confidence}
    |
    |   [3e] Pattern Recognizer (server/services/pattern-recognizer.ts)
    |       - Scans OHLC candles for candlestick patterns
    |       - Outputs: PatternSignal {pattern, direction, strength}
    |       - Multi-timeframe cascade: 1H -> 15m -> 5m (if enabled)
    |
    |   [3f] Hybrid Integration (server/services/hybrid-integration.ts)
    |       - Detects confluence between QUANT + PATTERN signals
    |       - Computes HybridScore with weighted ensemble
    |       - Pattern decay (Directive 10.5): lambda=0.15, floor=0.3
    |
    |   [3g] DSS Strategy Selection
    |       - Computes Net EV for each candidate signal
    |       - Selects BEST single strategy per pair (highest confidence + positive netEV)
    |       - Physics First: Vetoes all signals if no netEV > 0
    |
    v
[4] Position Sizing (server/services/paper-position-sizing.ts)
    - Centralized sizing: portfolio value x risk% / stop distance
    - Guardrails enforcement (max position size, daily loss limits)
    |
    v
[5] Signal Quality Evaluator / SQE (server/core/filters/signal_quality_evaluator.ts)
    - FinalScore >= 0.35 threshold
    - RegimeWeight >= 0.30 threshold
    - Regime-aware ROI gate
    - NO legacy metrics (NGC, CWQI purged)
    |
    v
[6] Ready-to-Buy / RTB Queue (server/core/rtb/ready_to_buy_service.ts)
    - Ranked by FinalScore
    - Per-signal rolling TTL (30s)
    - Central Clock synchronized
    |
    v
[7] Trade Candidate List / TCL (server/core/rtb/trade_candidate_list.ts)
    - Final selection from RTB queue
    - Capacity management
    |
    v
[8] Trade Execution Controller / TEC (server/services/execution-controller.ts)
    - Places orders on Kraken (paper or live)
    - Manages active trades: trailing stops, stop-loss, take-profit
    - NO indicator recomputation (clean consumptive logic)
    |
    v
[9] Trade Close -> P&L Calculation
    |
    v
[10] Telemetry & Predictive Learning
    - server/services/telemetry-aggregator.ts
    - server/core/calibration/*
    - ML pipeline for parameter adjustment
```

### 2.2 VTS Path (Passive Learning / Simulation)

```
KRAKEN EXCHANGE
    |
    v
[1] FX5 Scanner -> Active Filter Pool (same as live path)
    |
    v
[2] VTS Runner (server/services/vts-runner.ts)
    - 60-second autonomous simulation loop
    - For each pair from FX5 scan batch:
    |
    |   [2a] OHLC Fetch (15m candles, 50 max)
    |
    |   [2b] Pair-Level Regime (server/core/metrics/market-regime.ts)
    |       *** Uses canonical 5-regime model (OHLC-based) ***
    |       *** DIFFERENT calculation than live path DSS ***
    |
    |   [2c] Strategy Selection via selectContextAwareStrategy()
    |       *** Uses CANONICAL_REGIME_STRATEGY_MAP (17 strategies) ***
    |       *** Pattern detection -> exact match -> hybrid fallback -> primary ***
    |
    |   [2d] Directive 11.8C: Multi-Strategy Simulation
    |       - Simulates ALL strategies mapped to the regime (not just best)
    |       - Generates N trades per pair (one per strategy)
    |
    |   [2e] Signal Generation: simulateHybridScore() + simulateDecayPenalty()
    |       *** CRITICAL BUG: Uses generic random simulation, NOT strategy-specific ***
    |       *** Same calculation regardless of strategy selected ***
    |
    |   [2f] Governance Filters: eligibility, mode overlay, confidence floor
    |
    |   [2g] Net EV Gate: computeNetExpectancyKernel() -> netEV > 0 required
    |
    |   [2h] ROI Gate: isSignalProfitable() regime-aware minimum ROI
    |
    |   [2i] Position Sizing: risk-based with mode overlay multipliers
    |
    v
[3] Open Virtual Trades Registry (in-memory Map, max 300 trades)
    |
    v
[4] Resolution Loop (every 60s)
    - Checks real Kraken prices against open trades
    - Closes on: stop_hit, target_hit, timeout (24h max hold)
    - Persists results to VTS storage + ML pipeline
    |
    v
[5] Telemetry Aggregator + Predictive Learning
```

### 2.3 Pipeline Divergence Summary

| Aspect | Live/Paper Path | VTS Path | Impact |
|--------|----------------|----------|--------|
| **Regime Model** | DSS: 6 regimes (volNoise + trendSlope) | market-regime.ts: 5 regimes (OHLC momentum + ADX + volatility) | Different pairs get different regimes |
| **Strategy Map** | SYSTEM_GUARDS.STRATEGY_MAP (9 quant only) | CANONICAL_REGIME_STRATEGY_MAP (17 strategies) | VTS tests strategies the live path can never select |
| **Selection** | DSS picks ONE best strategy | All regime strategies simulated | VTS data doesn't reflect live behavior |
| **Signal Calc** | Strategy Engine with real indicators | simulateHybridScore() (random) | VTS signals don't validate strategy logic |
| **Signal Types** | QUANT + PATTERN + HYBRID | All types via canonical map | N/A (good) |

**This divergence is the #1 architectural risk. VTS is learning from simulated data that doesn't match how the live engine will behave.**

---

## 3. Indicator Ownership & Computation Map

### 3.1 Where Indicators Are Computed

| Indicator | Location | Used By | Notes |
|-----------|----------|---------|-------|
| **Volatility** (stddev of returns) | `server/core/metrics/market-regime.ts` → `computeVolatility()` | VTS pair-level regime | OHLC close prices |
| **Volatility** (high-low range) | `server/services/strategy-engine.ts` → `calculateVolatility()` | DHMA strategy only | Different formula from above |
| **Momentum** (14-period % change) | `server/core/metrics/market-regime.ts` → `computeMomentum()` | VTS pair-level regime | 14-period lookback |
| **ADX** (14-period) | `server/core/metrics/market-regime.ts` → `computeADX()` | VTS pair-level regime, strategy guards | Standard ADX calculation |
| **VolNoise** | `server/utils/analysis-utils.ts` → `calculateVolNoise()` | DSS regime detection (live path), Kalman filter | Analysis-utils computation |
| **TrendSlope** | `server/utils/analysis-utils.ts` → `calculateTrendSlope()` | DSS regime detection (live path) | Close price slope |
| **Efficiency Ratio** | `server/utils/analysis-utils.ts` → `calculateEfficiencyRatio()` | Kalman filter tuning | 20-period default |
| **VWAP** | `server/services/signal-orchestrator.ts` → `calculateVWAP()` | Strategy evaluation | Computed inline, not centralized |
| **VWAP** (duplicate) | `server/services/strategy-engine.ts` → `calculateVWAP()` | Strategy exit conditions | Duplicate computation |
| **SMA** | `server/services/signal-orchestrator.ts` → `calculateSMA()` | Strategy evaluation | Computed inline, not centralized |
| **SMA** (duplicate) | `server/services/strategy-engine.ts` → `calculateSMA()` | Mean reversion reference | Duplicate computation |
| **Z-Score Normalization** | `server/utils/rolling-stats.ts` → `RollingStats.zScore()` | DSS (own instance), market-regime (own instance) | 300-period rolling window |
| **Log Liquidity** | `server/utils/analysis-utils.ts` → `calculateLogLiquidity()` | Pre-signal IMF filtering | LQ 0-100 scale |
| **Directional Integrity** | `server/utils/analysis-utils.ts` → `calculateDirectionalIntegrity()` | Net expectancy kernel (DI input) | 0-100 scale |
| **Kalman Smoothed Price** | `server/utils/adaptive-kalman.ts` → `getSmoothedPrice()` | Signal orchestrator (live path) | Adaptive based on ER + VolNoise |

### 3.2 Duplication Issues (MCE Targets)

1. **Volatility computed in 2 different ways** in 2 different files with incompatible formulas
2. **VWAP computed independently** in both signal-orchestrator.ts AND strategy-engine.ts
3. **SMA computed independently** in both signal-orchestrator.ts AND strategy-engine.ts
4. **Rolling Stats has 3 separate instances**: DSS module-level, market-regime.ts module-level, and any future consumers would need their own
5. **No shared indicator cache** - every consumer re-fetches OHLC and recalculates from scratch

### 3.3 MCE Consolidation Opportunity

All indicators in section 3.1 should be computed once by the MCE and provided to all consumers via a shared cache. This eliminates:
- Duplicate OHLC fetches (Kraken API rate limit risk)
- Duplicate computations (CPU waste)
- Inconsistent results (same pair gets different indicator values depending on who computed them)
- Strategy-specific indicator needs (RSI, Bollinger Bands, etc. needed by canonical strategies that aren't yet implemented)

---

## 4. Regime Classification & Strategy Mapping

### 4.1 Two Competing Regime Systems

#### Canonical Regime Model (market-regime.ts + canonical-regime-strategy-map.ts)

**5 regimes** based on OHLC-derived metrics:

| Regime | Momentum | ADX | Volatility | Description |
|--------|----------|-----|------------|-------------|
| BULL_STABLE | >0.005 | >25 | <0.025 | Sustained uptrend, low volatility |
| BEAR_VOLATILE | <-0.005 | >25 | >0.03 | Strong bearish, high turbulence |
| LOW_VOL_CHOP | abs<0.002 | <20 | <0.015 | Flat, no directionality |
| HIGH_VOL_IMPULSE | >0.010 | >30 | >0.03 | Breakout with trend acceleration |
| TRANSITION | +/-0.004 | 20-25 | 0.015-0.03 | Reversal zone, weakening trend |

**This is the intended model.** 17 strategies mapped across all 5 regimes.

#### DSS Regime Model (dynamic-strategy-selector.ts + SYSTEM_GUARDS.STRATEGY_MAP)

**6 regimes** based on volNoise + trendSlope (Z-Score normalized):

| Regime | Condition | Notes |
|--------|-----------|-------|
| EXTREME_NOISE | volNoise > 0.6 | Auto-veto (no trading) |
| BULL_STABLE | trend > +0.05, vol < 0.3 | Maps to 5 quant strategies |
| BULL_VOLATILE | trend > +0.05, vol >= 0.3 | Maps to 3 quant strategies |
| BEAR_STABLE | trend < -0.05, vol < 0.3 | Maps to 2 quant strategies |
| BEAR_VOLATILE | trend < -0.05, vol >= 0.3 | Maps to 2 quant strategies |
| LOW_VOL_CHOP | abs(trend) <= 0.05 | Maps to 2 quant strategies |

**This is the LEGACY model currently running in the live signal orchestrator.** Only 9 quant strategies, no PATTERN or HYBRID, no TRANSITION regime, no HIGH_VOL_IMPULSE.

### 4.2 Strategy Mapping Comparison

#### Canonical Map (17 strategies, what SHOULD be used):

| Regime | Strategies |
|--------|-----------|
| BULL_STABLE | vwap_pullback (QUANT), morning_star (PATTERN), pivot_shift (HYBRID) |
| BEAR_VOLATILE | mean_reversion (QUANT), reverse_impulse (HYBRID), defensive_hedge (HYBRID), inside_bar_reversal (PATTERN) |
| LOW_VOL_CHOP | range_trade (QUANT), support_bounce (PATTERN), abcd_long (QUANT), adaptive_flow (HYBRID) |
| HIGH_VOL_IMPULSE | sma_trend_ride (QUANT), breakout (QUANT), vwap_bounce (QUANT), volatility_edge (HYBRID), dhma (QUANT) |
| TRANSITION | liquidity_trap (QUANT), pivot_shift (HYBRID), morning_star (PATTERN) |

#### DSS Map (9 strategies, what IS currently used in live path):

| Regime | Strategies |
|--------|-----------|
| BULL_STABLE | vwap_pullback, vwap_bounce, sma_trend_ride, abcd_long, dhma |
| BULL_VOLATILE | breakout, sma_trend_ride, liquidity_trap |
| BEAR_STABLE | mean_reversion, range_trading |
| BEAR_VOLATILE | mean_reversion, liquidity_trap |
| LOW_VOL_CHOP | mean_reversion, range_trading |

**Critical gaps**: No TRANSITION regime, no HIGH_VOL_IMPULSE regime, no PATTERN strategies, no HYBRID strategies.

### 4.3 Ghost Regime Normalization

The canonical map includes a `GHOST_REGIME_NORMALIZATION` mapping to handle DSS regime names:

```
BULL_VOLATILE   -> HIGH_VOL_IMPULSE
BEAR_STABLE     -> BEAR_VOLATILE
EXTREME_NOISE   -> LOW_VOL_CHOP
HIGH_VOL_CHOP   -> HIGH_VOL_IMPULSE
MIXED_TRANSITION -> TRANSITION
```

This suggests the canonical system was designed to absorb DSS outputs, but the DSS itself was never updated to use it.

### 4.4 Waterfall Strategy Selection Analysis

**Kyle's question**: Should the DSS rank strategies within a regime and waterfall (try next if first fails)?

**My recommendation**: **Yes, but with constraints.**

The waterfall approach makes sense architecturally because:
1. **Different strategies detect different market conditions** within the same regime - a BULL_STABLE market might show a VWAP pullback setup but not a morning star pattern
2. **It doesn't defeat regime mapping** - the regime narrows the strategy universe from 17 to 3-5; the waterfall only operates within that narrow set
3. **It maximizes signal generation without junk** - each strategy still must pass Net EV > 0 + SQE + ROI gates

**Proposed implementation**:
- Strategies within each regime are already ordered in the canonical map (index 0 = primary)
- The ordering should represent **preference** (most reliable first), not just alphabetical
- For each pair: try strategies in order until ONE generates a valid signal that passes all gates
- Do NOT generate signals for ALL strategies per pair (that's what VTS does for learning, not what live should do)
- Add a `maxStrategiesPerPair` guard (suggest: 3) to prevent excessive computation

**This differs from VTS behavior**: VTS simulates ALL strategies per pair (Directive 11.8C) for maximum learning data. Live should waterfall and stop at first valid signal.

### 4.5 TRANSITION Regime Support

The TRANSITION regime is defined in the canonical map with 3 strategies:
- liquidity_trap (QUANT)
- pivot_shift (HYBRID)
- morning_star (PATTERN)

The DSS currently cannot produce TRANSITION because its thresholds create a binary split (trend > 0.05 or < -0.05, with LOW_VOL_CHOP catching everything in between). To support TRANSITION, the DSS regime detection logic needs to be replaced with the canonical classification from `market-regime.ts`.

---

## 5. Legacy Contamination Report & Deprecation Registry

### 5.1 Contamination Summary

| Legacy System | Files Referencing | Description | Status |
|--------------|-------------------|-------------|--------|
| **Walter** | ~90 files | Former AI Officer / decision engine | Deprecated, code still present |
| **Bob** | Part of Walter refs | Walter's data layer | Deprecated |
| **LATTi** | ~12 files | Heuristic AI trader | Deprecated |
| **CWQI** (Confidence-Weighted Quality Index) | ~47 files | Old scoring metric | Purged from active path, references remain |
| **NGC** (Normalized Global Confidence) | ~283 files | Old confidence metric | Purged from active path, references remain heavily |
| **NGI** | Part of NGC refs | Old generation index | Deprecated |
| **Decision Confidence Engine (DCE)** | `server/services/decision-confidence-engine.ts` | Uses CWQI + NGC + ML + RC + MACO formula | NOT in trading path (routes only), safe to deprecate |
| **Adaptive Risk Advisor (ARA)** | Multiple files | UI tools + old metrics | Deprecated per Kyle, code likely remains |
| **Multi-User System** | Multiple files | Old multi-user architecture | Deprecated, single-user only now |
| **Strategy Presets** | Unknown count | Old strategy preset system | Deprecated |
| **Goals ML Engine** | Unknown count | Old ML goal system | Deprecated |
| **DHMA Tuning Service** | Unknown count | Old DHMA parameter tuning | Deprecated |
| **Purpose Tab** | UI components | Old UI tab | Deprecated |

### 5.2 Active Code Path Contamination

The following files are IN the active trading path and still contain legacy references:

1. **signal-orchestrator.ts** (line 102-107): `SizedStrategySignal` interface still has `ngc?`, `cwqi?`, `riskScore?`, `profitRate?` fields
2. **signal-orchestrator.ts** (line 420-424): ML service still receives `ngc` and `cwqi` fields for backward compatibility
3. **signal-orchestrator.ts** (line 1197): `getRegimeAllowedStrategies()` uses `SYSTEM_GUARDS.STRATEGY_MAP` (legacy)
4. **dynamic-strategy-selector.ts**: Entire module uses legacy 6-regime model with SYSTEM_GUARDS.STRATEGY_MAP
5. **system-guards.ts** (lines 33-39): `STRATEGY_MAP` contains legacy 5-regime mapping with 9 quant-only strategies

### 5.3 Safe-to-Remove Immediately

- **decision-confidence-engine.ts**: Only consumed by `routes/dce.ts` and `routes/health.ts` (monitoring only). Formula uses all deprecated metrics. Can be removed or stubbed.
- **SizedStrategySignal** legacy fields (`ngc?`, `cwqi?`, `riskScore?`, `profitRate?`): Optional fields, removing them won't break runtime.
- **SYSTEM_GUARDS.STRATEGY_MAP**: Once DSS is migrated to canonical map, this can be removed entirely.

### 5.4 Deprecation Action Plan

| Priority | Action | Impact | Blocked By |
|----------|--------|--------|-----------|
| **P0** | Migrate DSS to canonical regime-strategy map | Fixes live/VTS divergence | MCE implementation |
| **P1** | Remove SYSTEM_GUARDS.STRATEGY_MAP | Eliminates legacy regime mapping | DSS migration |
| **P1** | Remove DCE | Eliminates deprecated metrics from monitoring | Nothing |
| **P2** | Clean NGC/CWQI references from signal interfaces | Reduces confusion | Nothing |
| **P2** | Remove Walter/Bob/LATTi code files | Reduces codebase size | Audit of all references |
| **P3** | Remove ARA code | Eliminates dead UI code | UI audit |
| **P3** | Remove multi-user remnants | Simplifies auth model | Auth audit |

---

## 6. Known Bugs, Architecture Risks & Critical Findings

### 6.1 CRITICAL BUGS

#### BUG-001: VTS Signal Generation Is Generic (Not Strategy-Specific)
- **Location**: `server/services/vts-runner.ts` lines 280-299
- **Problem**: `simulateHybridScore()` and `simulatePredictiveConfidence()` generate random scores based only on regime, regardless of which strategy was selected. The `simulateDecayPenalty()` is purely random.
- **Impact**: VTS learns from meaningless data. Every strategy within a regime produces statistically identical signals. ML models trained on this data will not learn strategy-specific patterns.
- **Fix**: VTS signal generation should use the actual Strategy Engine + Pattern Recognizer to compute real signals, or use the MCE to provide the indicators needed for real strategy calculations.

#### BUG-002: Live Path Uses Legacy DSS Regime Model
- **Location**: `server/services/dynamic-strategy-selector.ts` entire file
- **Problem**: DSS uses `SYSTEM_GUARDS.STRATEGY_MAP` (6 regimes, 9 quant strategies) instead of `CANONICAL_REGIME_STRATEGY_MAP` (5 regimes, 17 strategies). This means the live path can never select PATTERN or HYBRID strategies, never trade in TRANSITION or HIGH_VOL_IMPULSE regimes, and uses different regime classification logic than VTS.
- **Impact**: 8 of 17 canonical strategies are unreachable in live trading. VTS data from these strategies is never validated.
- **Fix**: Replace DSS regime detection with canonical `calculatePairRegime()` and replace strategy lookup with `CANONICAL_REGIME_STRATEGY_MAP`.

#### BUG-003: Signal Orchestrator Gets Regime Strategies from SYSTEM_GUARDS
- **Location**: `server/services/signal-orchestrator.ts` line 1196-1199
- **Problem**: `getRegimeAllowedStrategies()` reads from `SYSTEM_GUARDS.STRATEGY_MAP`, duplicating the DSS legacy mapping issue. Even if DSS is fixed, this method would still filter to the legacy strategy set.
- **Impact**: Double-enforcement of the legacy strategy restriction.
- **Fix**: Replace with lookup from `CANONICAL_REGIME_STRATEGY_MAP`.

### 6.2 HIGH-RISK ARCHITECTURE ISSUES

#### RISK-001: VTS/Live Regime Math Drift
- **Problem**: VTS uses `calculatePairRegime()` (OHLC-based: momentum, ADX, volatility) while Live uses DSS (volNoise + trendSlope). The same pair at the same time will likely be classified into different regimes by each system.
- **Impact**: VTS performance data cannot predict live performance. Strategy calibration from VTS is unreliable.
- **Resolution**: Unified regime calculation via MCE.

#### RISK-002: No Centralized Indicator Cache (Kraken API Rate Limit)
- **Problem**: Signal Orchestrator, Strategy Engine, Pattern Recognizer, and VTS all independently fetch OHLC data from Kraken. The rate limit is 10 requests/second with 80% safety margin.
- **Impact**: At 100 pairs per cycle, each pair may trigger 3-4 separate OHLC requests (1H + cascade to 15m + 5m). This is 300-400 requests per cycle, potentially exceeding rate limits.
- **Resolution**: MCE should fetch OHLC once and cache for all consumers.

#### RISK-003: Strategy Engine Only Implements 9 of 17 Canonical Strategies
- **Problem**: The `StrategyEngine` class only has detect methods for 9 QUANT strategies. The canonical map defines 17 strategies including PATTERN and HYBRID types.
- **Missing strategies**: morning_star, pivot_shift, reverse_impulse, defensive_hedge, inside_bar_reversal, support_bounce, adaptive_flow, volatility_edge
- **Impact**: Even after DSS migration, the live path cannot generate signals for 8 canonical strategies because the detection logic doesn't exist.
- **Resolution**: Pattern strategies are handled by `pattern-recognizer.ts`, Hybrid by `hybrid-integration.ts`. But the strategy key mapping needs verification. Some canonical strategy keys (e.g., `range_trade` in canonical vs `range_trading` in strategy engine) may have mismatches.

#### RISK-004: Strategy Key Mismatches
- **Problem**: The canonical map uses `range_trade` as the strategyKey, but strategy-engine.ts uses `range_trading`. Signal orchestrator has `range_trading` in its enabled strategies set.
- **Impact**: A pair classified into LOW_VOL_CHOP regime looking for `range_trade` strategy will not match the strategy engine's `range_trading` method.
- **Resolution**: Audit all strategy keys for consistency. The `normalizeStrategy()` function in canonical-regime-strategy-map.ts may help, but it's not used in the DSS or strategy engine paths.

### 6.3 MEDIUM-RISK ISSUES

#### RISK-005: HybridScore Defaulting in Signal Orchestrator
- **Location**: `server/services/signal-orchestrator.ts` line 498
- **Problem**: `const hybridScore = (rawSignal as any).hybridScore ?? confidence;` - if the raw signal doesn't have a hybridScore field (and most won't from the strategy engine), it falls back to confidence. This means FinalScore treats hybridScore and confidence as the same value, making the 0.4 + 0.3 weighting effectively 0.7 * confidence.
- **Impact**: FinalScore is skewed - the hybrid/confidence distinction is lost.

#### RISK-006: RegimeWeight Hardcoded in Signal Orchestrator
- **Location**: `server/services/signal-orchestrator.ts` line 499
- **Problem**: `const regimeWeight = (rawSignal as any).regimeWeight ?? 0.5;` - raw strategy signals don't carry regime weight, so it always defaults to 0.5.
- **Impact**: RegimeWeight contributes a constant 0.5 * 0.2 = 0.1 to every FinalScore, negating its purpose of differentiating regime-aligned signals.

#### RISK-007: Confidence Scale Inconsistency
- **Location**: Multiple files
- **Problem**: Strategy engine outputs confidence as 0-1 (e.g., 0.7), but signal validation in `validateStrategySignal()` checks `confidence >= 0 && confidence <= 100`. The ML service receives confidence directly. Some code divides by 100, some doesn't.
- **Impact**: Signals with confidence 0.7 pass validation (0.7 < 100), but the semantic meaning is different from a confidence of 70.

#### RISK-008: Engine Not Run Since Phase 8
- **Problem**: Phases 9, 10, and 11 introduced massive changes to scoring, filtering, regime detection, governance, and the trading pipeline. None of this has been tested with a running engine.
- **Impact**: High probability of runtime errors, import failures, undefined references, and logic bugs when the engine is first activated.

### 6.4 Efficiency Improvement Suggestions

1. **OHLC Caching**: MCE should maintain a per-pair, per-timeframe OHLC cache with TTL matching the candle interval. All consumers subscribe to the cache instead of fetching independently.

2. **Indicator Compute-Once**: Indicators like VWAP, SMA, ATR, VolNoise, etc. should be computed once per pair per cycle and stored in the MCE cache. Currently VWAP is computed in both signal-orchestrator.ts AND strategy-engine.ts.

3. **Regime Compute-Once**: The regime for each pair should be computed once per cycle by the MCE and shared. Currently DSS computes it (live path) and market-regime.ts computes it (VTS path) independently with different logic.

4. **Eliminate simulateHybridScore()**: VTS should use real strategy calculations, not random simulations. This is both a bug fix and an efficiency improvement (removes meaningless computation).

5. **Batch Price Fetches**: The price cache already supports `getBatch()`. Ensure all consumers use batch operations instead of individual ticker calls.

---

## 7. MCE Integration Blueprint

### 7.1 What the MCE Is

The **Market Context Engine (MCE)** is a planned centralized computation layer that sits between the data sources (Kraken, Price Cache) and all consumers (DSS, Strategy Engine, VTS, Pattern Recognizer, Hybrid Integration).

### 7.2 MCE Responsibilities

1. **Fetch OHLC data once per pair per timeframe** and cache it
2. **Compute all technical indicators** (volatility, momentum, ADX, VWAP, SMA, RSI, Bollinger, etc.) once per pair per cycle
3. **Compute the canonical regime** for each pair using the unified calculation
4. **Provide an indicator bundle** to all consumers via a typed interface
5. **Compute secondary metrics** (Z-Scores, VolNoise, TrendSlope, Efficiency Ratio) once
6. **Support TRANSITION regime** with proper threshold detection
7. **Enable strategy-specific indicator requirements** (e.g., RSI for mean_reversion, Bollinger for range_trade)

### 7.3 MCE Architecture

```
                    ┌────────────────────────────────────────┐
                    │           Market Context Engine          │
                    │  server/core/mce/market-context-engine.ts │
                    │                                          │
                    │  ┌──────────────────────────────────┐   │
                    │  │      OHLC Cache (per-pair)         │   │
                    │  │  1H, 15m, 5m candles with TTL      │   │
                    │  └──────────────────────────────────┘   │
                    │                 │                         │
                    │  ┌──────────────────────────────────┐   │
                    │  │     Indicator Calculator           │   │
                    │  │  Volatility, Momentum, ADX,        │   │
                    │  │  VWAP, SMA, RSI, Bollinger,        │   │
                    │  │  VolNoise, TrendSlope, ER,         │   │
                    │  │  Kalman Smoothed Price              │   │
                    │  └──────────────────────────────────┘   │
                    │                 │                         │
                    │  ┌──────────────────────────────────┐   │
                    │  │     Regime Classifier              │   │
                    │  │  Canonical 5-regime model           │   │
                    │  │  Z-Score normalization              │   │
                    │  │  Regime score + confidence           │   │
                    │  └──────────────────────────────────┘   │
                    │                 │                         │
                    │  ┌──────────────────────────────────┐   │
                    │  │     MarketContext (output bundle)   │   │
                    │  │  { pair, regime, indicators,        │   │
                    │  │    zScores, secondaryMetrics }      │   │
                    │  └──────────────────────────────────┘   │
                    └────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                   │
                    v                 v                   v
           Signal Orchestrator    VTS Runner      Other Consumers
           (live/paper path)    (simulation)     (dashboard, etc.)
```

### 7.4 MCE Output Interface (Proposed)

```typescript
interface MarketContext {
  pair: string;
  timestamp: number;

  // Regime
  regime: CanonicalRegimeType;
  regimeScore: number;        // 0-100
  regimeWeight: number;       // 0-1
  regimeConfidence: number;   // 0-1

  // Core Indicators
  indicators: {
    volatility: number;       // stddev of returns
    momentum: number;         // 14-period % change
    adx: number;              // 14-period ADX
    vwap: number;             // Volume-weighted average price
    sma20: number;            // 20-period SMA
    sma50: number;            // 50-period SMA (if available)
    rsi14: number;            // 14-period RSI
    bollingerUpper: number;   // Upper Bollinger Band
    bollingerLower: number;   // Lower Bollinger Band
    bollingerWidth: number;   // Bandwidth
    atr14: number;            // 14-period ATR
  };

  // Secondary Metrics
  secondary: {
    volNoise: number;
    trendSlope: number;
    efficiencyRatio: number;
    logLiquidity: number;
    directionalIntegrity: number;
    kalmanSmoothedPrice: number;
  };

  // Z-Scores (rolling 300-period)
  zScores: {
    adxZ: number;
    volZ: number;
    momZ: number;
    isWarmedUp: boolean;
  };

  // OHLC Cache Reference
  ohlc: {
    '1h': OHLCData[];
    '15m'?: OHLCData[];
    '5m'?: OHLCData[];
  };

  // Pattern Detection Results (computed here for efficiency)
  patterns: PatternSignal[];
}
```

### 7.5 MCE Integration Points (File Changes Required)

| File | Current Behavior | After MCE |
|------|-----------------|-----------|
| `signal-orchestrator.ts` | Fetches OHLC, computes VWAP/SMA, calls DSS | Receives MarketContext, uses regime + indicators directly |
| `dynamic-strategy-selector.ts` | Computes own regime from volNoise/trendSlope | Reads regime from MarketContext (or is replaced entirely) |
| `strategy-engine.ts` | Receives pre-computed indicators | Receives MarketContext.indicators (same interface, richer data) |
| `vts-runner.ts` | Fetches OHLC, computes pair regime, simulates scores | Receives MarketContext, uses real indicators for signal generation |
| `market-regime.ts` | Standalone pair regime calculator | Functions move INTO MCE (becomes MCE's internal calculator) |
| `analysis-utils.ts` | Standalone pre-signal math | Functions move INTO MCE |
| `pattern-recognizer.ts` | Called separately with candles | Called by MCE with cached candles, results included in MarketContext |
| `hybrid-integration.ts` | Detects confluence post-hoc | Receives pattern results from MarketContext, simpler confluence detection |

### 7.6 MCE Implementation Phases

| Phase | Work | Priority |
|-------|------|----------|
| **MCE-1** | Create MCE module with OHLC cache + indicator calculator | CRITICAL |
| **MCE-2** | Integrate canonical regime classification into MCE | CRITICAL |
| **MCE-3** | Wire Signal Orchestrator to consume MarketContext instead of raw data | CRITICAL |
| **MCE-4** | Migrate DSS to use MCE regime (or replace DSS entirely) | CRITICAL |
| **MCE-5** | Wire VTS to consume MarketContext for real signal generation | HIGH |
| **MCE-6** | Add RSI, Bollinger, ATR to indicator calculator | HIGH |
| **MCE-7** | Pattern recognition integration | MEDIUM |
| **MCE-8** | Performance optimization (lazy computation, TTL management) | MEDIUM |

---

## 8. Governance Protocol & Directive System

### 8.1 Current State

The directive templates in `bridge/runtime/` were designed for formal governance but were never consistently used. The system does not enforce the lifecycle (DRAFT -> EXECUTED -> AWAITING_APPROVAL -> CANONICALIZED).

### 8.2 Practical Governance Protocol (Recommended)

Rather than strict template adherence, we recommend a lightweight but enforceable process:

#### For Every Code Change (Replit Directive):

1. **Pre-Implementation Review**
   - Claude Code (me) writes the directive with specific instructions, code snippets, and impact analysis
   - Kyle reviews and approves
   - Directive includes: objective, scope, exact files to modify, impact map, verification steps

2. **Implementation (Replit)**
   - Replit executes the directive
   - Produces: list of files changed, confirmation of scope adherence

3. **Post-Implementation Verification**
   - Claude Code reads the changes and verifies against the directive
   - Checks: scope adherence, no unintended side effects, tests pass (if applicable)
   - Reports findings to Kyle

4. **System Manual Update**
   - Claude Code updates the System Manual to reflect the change
   - Updates: pipeline map, indicator map, regime map, impact reference map as needed

#### Directive Format (Simplified):

```markdown
# Directive [ID]

## Objective
[One sentence: what this achieves]

## Scope
- Files to modify: [list]
- Files to NOT modify: [list]
- Dependencies affected: [list]

## Instructions
[Numbered steps with code snippets where helpful]

## Impact Map
[Which other systems need to be checked/updated]

## Verification
[How to confirm the change worked correctly]

## System Manual Updates Required
[What sections of the System Manual need updating]
```

### 8.3 Directive Naming Convention

Format: `[Phase].[SubPhase][Letter]-[Sequence]`

Examples:
- `12.0A` - MCE Phase 12, Sub-phase A
- `12.0A-D1` - MCE Phase 12A, Directive 1
- `12.0A-D1.R1` - Revision 1 of Directive 12.0A-D1

### 8.4 System Manual as Living Document

The System Manual is the source of truth for system architecture. It MUST be updated whenever:
- A new feature is implemented
- A pipeline path changes
- An indicator is added, moved, or removed
- A regime or strategy is modified
- Legacy code is removed

---

## 9. Replit Impact Reference Map

### 9.1 How to Use This Map

When Replit receives a directive to modify a file, it should check this map to understand what other files might be affected. This prevents changes that break dependencies.

### 9.2 Core File Dependencies

#### system-guards.ts (server/config/)
**Imported by**: 22+ files
**Key consumers**: dynamic-strategy-selector.ts, signal-orchestrator.ts, analysis-utils.ts, filter-engine.ts, imf-metrics.ts
**Impact**: Changing thresholds affects ALL regime detection, filtering, and scoring
**Risk**: HIGH - any threshold change cascades system-wide

#### canonical-regime-strategy-map.ts (server/config/)
**Imported by**: vts-runner.ts, signal-orchestrator.ts, strategy-analyzer.ts, telemetry-aggregator.ts, and 10+ other files
**Key consumers**: VTS regime-strategy selection, validation checks, display names
**Impact**: Adding/removing strategies or regimes affects the entire trading universe
**Risk**: HIGH - changes must be coordinated with strategy engine + pattern recognizer

#### market-regime.ts (server/core/metrics/)
**Imported by**: vts-runner.ts, strategy-analyzer.ts, diagnostic scripts
**Key consumers**: VTS pair-level regime calculation
**Impact**: Changes to regime thresholds alter VTS learning data
**Risk**: MEDIUM - isolated to VTS path currently

#### signal-orchestrator.ts (server/services/)
**Imports from**: strategy-engine, SQE, RTB, active-filter-pool, DSS, pattern-recognizer, hybrid-integration, multi-timeframe-scanner, net-expectancy-kernel, cost-model, canonical-regime-strategy-map, analysis-utils, adaptive-kalman, score-weights, and 10+ others
**Impact**: Central hub - changes here affect the entire live trading pipeline
**Risk**: CRITICAL - this is the main pipeline coordinator

#### strategy-engine.ts (server/services/)
**Imported by**: signal-orchestrator.ts
**Imports from**: strategy-filters.ts, telemetry-service.ts, strategy-features.ts
**Impact**: Changes to strategy detection logic directly affect signal generation
**Risk**: HIGH - each strategy method is independently callable

#### dynamic-strategy-selector.ts (server/services/)
**Imported by**: signal-orchestrator.ts, market-indicators.ts
**Imports from**: system-guards.ts, rolling-stats.ts
**Impact**: Changes to regime detection or strategy mapping affect all live signal generation
**Risk**: CRITICAL - this is the gatekeeper for live strategy selection

#### vts-runner.ts (server/services/)
**Imported by**: routes/vts.ts, routes/health.ts
**Imports from**: 25+ files (largest import tree in the system)
**Impact**: Changes affect all VTS simulation and learning data
**Risk**: HIGH - VTS is the primary data generation system during passive learning

#### signal_quality_evaluator.ts (server/core/filters/)
**Imported by**: signal-orchestrator.ts
**Imports from**: score-calculator.ts, expectancy.ts, skipped-signals-logger.ts
**Impact**: Changes to thresholds affect which signals pass to RTB
**Risk**: MEDIUM - thresholds are configurable via UI

#### ready_to_buy_service.ts (server/core/rtb/)
**Imported by**: signal-orchestrator.ts
**Impact**: Changes to ranking or TTL affect trade candidate selection
**Risk**: MEDIUM

#### execution-controller.ts (server/services/)
**Imported by**: trading pipeline terminus
**Impact**: Changes affect actual trade execution
**Risk**: CRITICAL for live mode, MEDIUM for paper

### 9.3 Change Impact Matrix

When modifying these systems, check these dependencies:

| If You Change... | Also Check... |
|-------------------|---------------|
| SYSTEM_GUARDS thresholds | DSS, analysis-utils, filter-engine, IMF |
| Canonical regime-strategy map | VTS runner, signal orchestrator, telemetry, all validation |
| Strategy engine detection methods | Signal orchestrator (which strategies are called), VTS |
| DSS regime logic | Signal orchestrator, market-indicators |
| Score weights | SQE thresholds, RTB ranking, VTS scoring |
| Net expectancy kernel | Signal orchestrator, VTS, any EV consumer |
| OHLC data format | market-regime, strategy-engine, pattern-recognizer, VTS |
| Price cache API | Signal orchestrator, VTS, execution controller |
| FX5 scanner | Active filter pool, signal orchestrator, VTS |

---

## Appendix A: File Index (Key Files)

### Config
- `server/config/system-guards.ts` - Mathematical constants, legacy strategy map
- `server/config/canonical-regime-strategy-map.ts` - Canonical regime-strategy mapping (SINGLE SOURCE OF TRUTH)
- `server/config/score-weights.config.ts` - FinalScore formula weights

### Core Pipeline
- `server/services/signal-orchestrator.ts` - Central signal pipeline coordinator
- `server/services/strategy-engine.ts` - 9 QUANT strategy implementations
- `server/services/dynamic-strategy-selector.ts` - Regime detection + strategy selection (LEGACY)
- `server/services/pattern-recognizer.ts` - Candlestick pattern detection
- `server/services/hybrid-integration.ts` - Quant + Pattern confluence detection
- `server/services/execution-controller.ts` - Trade execution (TEC)

### Filtering & Scoring
- `server/core/filters/signal_quality_evaluator.ts` - SQE (FinalScore + RegimeWeight gate)
- `server/core/rtb/ready_to_buy_service.ts` - RTB queue (ranked by FinalScore)
- `server/core/calculations/net-expectancy-kernel.ts` - Net EV computation (sole authority)
- `server/core/calculations/expectancy.ts` - ROI gates

### Regime & Indicators
- `server/core/metrics/market-regime.ts` - Pair-level regime (OHLC-based, canonical)
- `server/utils/analysis-utils.ts` - Pre-signal math (VolNoise, TrendSlope, ER, LQ, DI)
- `server/utils/rolling-stats.ts` - Z-Score normalization (300-period rolling window)
- `server/utils/adaptive-kalman.ts` - Kalman filter for price smoothing

### VTS (Virtual Trading Simulator)
- `server/services/vts-runner.ts` - Autonomous simulation engine
- `server/services/vts-service.ts` - VTS data persistence service

### Scanning & Filtering
- `server/services/fx5-scanner.ts` - Market scanner
- `server/services/active-filter-pool.ts` - Dual-pool pair management

### Governance
- `server/core/governance/governance-engine.ts` - Trade governance
- `server/core/governance/strategy-eligibility.ts` - Strategy eligibility checks
- `server/core/governance/regime-stability.ts` - Regime stability computation
- `server/core/governance/strategy-modes.ts` - Strategy mode modulation

---

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **ADX** | Average Directional Index - measures trend strength (0-100) |
| **ATR** | Average True Range - measures volatility in price units |
| **Canonical Map** | The CANONICAL_REGIME_STRATEGY_MAP in canonical-regime-strategy-map.ts - the single source of truth |
| **DCE** | Decision Confidence Engine - DEPRECATED, uses old metrics |
| **DSS** | Dynamic Strategy Selector - regime detection + strategy gatekeeper (currently uses legacy model) |
| **FinalScore** | Primary signal ranking metric (0-1) |
| **FX5** | Market scanner that filters pairs by volume, price, and liquidity |
| **Hybrid** | Signal type combining QUANT + PATTERN evidence |
| **MCE** | Market Context Engine - PLANNED centralized indicator computation layer |
| **Net EV** | Net Expected Value - profit expectation after all costs |
| **RTB** | Ready-to-Buy queue - ranked signal pool |
| **SQE** | Signal Quality Evaluator - final quality gate before RTB |
| **TCL** | Trade Candidate List - final selection from RTB |
| **TEC** | Trade Execution Controller - places and manages trades |
| **VTS** | Virtual Trading Simulator - autonomous simulation for passive learning |
| **Z-Score** | Standard deviations from rolling mean, used for adaptive thresholds |

---

## Appendix C: 42 System Invariants (from Canonical Docs)

The system defines 42 invariants that must always be true:

### Trading & Risk (7)
1. No trade without positive Net EV
2. Stop-loss on every position
3. Maximum position size = 25% of portfolio
4. Daily loss limit enforced
5. Maximum open positions enforced
6. Long-only trading (no shorts)
7. No trading during EXTREME_NOISE regime

### Financial (7)
8. P&L includes all friction costs (fees + slippage + spread)
9. Round-trip cost = 2x fee + 2x slippage + spread
10. Friction computed before Net EV check
11. Portfolio value tracked accurately
12. Risk per trade = configurable % of portfolio
13. Position sizing = risk-based with regime multiplier
14. No negative position sizes

### Architectural (8)
15. FinalScore is the sole ranking metric
16. Canonical map is the sole regime-strategy authority
17. Net Expectancy Kernel is the sole EV authority
18. Score weights are centralized in score-weights.config.ts
19. System Guards are immutable during runtime
20. Each engine has a single responsibility
21. No circular dependencies between core modules
22. All symbols normalized at data ingress

### Process & Change (8)
23. Every code change requires a directive
24. Directives must specify scope and impact
25. Post-implementation verification required
26. System Manual updated after every change
27. No modification of locked modules without architectural review
28. Pre-implementation review for all Replit directives
29. Legacy code removal requires audit
30. Test verification before approval

*Remaining 12 invariants cover AI governance (5), paper trading (4), and operational rules (3) as defined in the canonical documentation.*

---

*End of DawnTrader System Manual v1.0*
