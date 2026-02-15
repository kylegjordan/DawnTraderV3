# DawnTrader System Manual v1.1

> **Version**: 1.1.0
> **Date**: 2026-02-15
> **Author**: Claude Code (System Cartographer & Lead Architect)
> **Project Manager**: Kyle
> **Last Directive**: 11.8B-D1
> **Status**: Passive Learning (Paper Mode, Pre-Active Trading)

---

## IMPORTANT: How This Document Is Used

This file is the **SYSTEM MANUAL** for the DawnTrader project -- the single source of architectural truth for all agents.

**Replit (Execution Agent):**
- MUST read this file at the start of every implementation session
- After every directive implementation, verify changes against this manual
- If changes conflict with what this manual describes, FLAG the conflict rather than silently resolving
- After implementation, report: (1) Files changed, (2) Scope adherence, (3) Test results, (4) Deviations from directive

**Claude Code (Analysis Agent):**
- Will update this manual after every implementation to reflect changes
- Updates: pipeline map, indicator map, regime map, impact reference map as needed

**Kyle (Project Manager):**
- Reviews and approves all directives before implementation
- Final authority on architectural decisions

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
10. [Market Data & Pricing Infrastructure](#10-market-data--pricing-infrastructure)
11. [Symbol Canonicalization Layer](#11-symbol-canonicalization-layer)
12. [Trade Execution & Lifecycle Layer](#12-trade-execution--lifecycle-layer)
13. [RTB Refresh & Signal Lifecycle](#13-rtb-refresh--signal-lifecycle)
14. [Central Clock](#14-central-clock)
15. [Governance Layer](#15-governance-layer)
16. [Macro-State Detection](#16-macro-state-detection)
17. [Telemetry & Learning Infrastructure](#17-telemetry--learning-infrastructure)
18. [Active vs Legacy Execution Boundary](#18-active-vs-legacy-execution-boundary)
19. [DI Naming Disambiguation](#19-di-naming-disambiguation)

---

## 1. System Overview & Architecture

### 1.1 What DawnTrader Is

DawnTrader is an autonomous cryptocurrency algorithmic trading system connected to the **Kraken** exchange. It scans the market for tradable pairs, classifies market conditions (regimes), selects strategies appropriate to those conditions, generates trading signals, sizes positions, and executes trades.

### 1.2 Modes and States

DawnTrader has **two modes** and **two states**:

**Modes** (how execution works):

| Mode | Description |
|------|-------------|
| **Paper Mode** | Simulated execution -- no real money, trades are virtual |
| **Live Mode** | Real money execution on Kraken |

**States** (whether the engine is running):

| State | Description | VTS Running? | Engine Running? |
|-------|-------------|:------------:|:---------------:|
| **Active Trading** | Trading engine is running, generating and executing signals | No | Yes |
| **Passive Learning** | Engine is stopped, VTS runs autonomous simulations | Yes | No |

**Combinations:**

| Mode + State | Description |
|-------------|-------------|
| Paper Mode + Active Trading | Paper trading with simulated execution |
| Paper Mode + Passive Learning | VTS simulation only, no trades (**CURRENT STATE**) |
| Live Mode + Active Trading | Real money trading on Kraken |
| Live Mode + Passive Learning | VTS simulation only, no trades |

**IMPORTANT TERMINOLOGY**: "Live" means Live Mode (real money). Do NOT use "live" to mean "active trading." Say "active trading" or "engine running" instead.

**Current State**: Paper Mode + Passive Learning.
**Engine has not been in Active Trading since**: End of Phase 8. Significant rework (Phases 9-11) has occurred without integration testing.

### 1.3 Technology Stack

- **Backend**: Node.js / TypeScript (Express server)
- **Frontend**: React / TypeScript (Vite)
- **Database**: PostgreSQL (Drizzle ORM)
- **Exchange**: Kraken REST + WebSocket v2 API
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
FinalScore = (HybridScore x W1) + (Confidence x W2) + (RegimeWeight x W3) - (DecayPenalty x W4)
```

**Weights are loaded from `server/config/score-weights.config.ts`** and are NOT hardcoded. Current defaults: W1=0.4, W2=0.3, W3=0.2, W4=0.1.

- **HybridScore**: Combined quant + pattern ensemble score (0-1)
- **Confidence**: Signal quality / predictive confidence (0-1)
- **RegimeWeight**: Market regime alignment score (0-1)
- **DecayPenalty**: Signal age/freshness penalty (0-1)
- **Profitability Gate**: Trade only executes if `netEV > 0` (Physics First principle)

**NOTE**: The canonical docs reference an alternative formula: `confidence x 0.35 + regimeWeight x 0.25 + liquidityScore x 0.20 + momentumScore x 0.15 + patternScore x 0.05 x riskAdjustment`. This may represent a planned or historical version. The score-weights.config.ts file is the runtime authority -- verify which formula is actually executing.

---

## 2. Trading Pipeline Map

### 2.1 Complete Signal Flow (Active Trading Path)

```
KRAKEN EXCHANGE
    |
    v
[1] FX5 Scanner (server/services/fx5-scanner.ts)
    - Triggered every 30 ticks by Central Clock
    - Fetches all tradable pairs from Kraken
    - Applies volume, price, and liquidity filters (global + IMF)
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
    |       - Gets current price from Unified Price Cache
    |       - Gets OHLC candle data (1h bars) from Kraken
    |       - Applies Adaptive Kalman Filter for smoothed price
    |
    |   [3b] Pre-Signal Math (server/utils/analysis-utils.ts)
    |       - Calculates: ER (Efficiency Ratio), VolNoise, TrendSlope
    |       - These feed into DSS regime detection
    |
    |   [3c] DSS Regime Check (server/services/dynamic-strategy-selector.ts)
    |       *** KNOWN ISSUE: Uses SYSTEM_GUARDS.STRATEGY_MAP (legacy 6-regime, 9 quant-only) ***
    |       *** NOT the canonical map (5-regime, 17 strategies) ***
    |       - Determines regime from volNoise + trendSlope (Z-Score normalized)
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
[4] Governance Engine (server/core/governance/governance-engine.ts)
    - Regime stability check (STABLE/TRANSITION/UNSTABLE)
    - Strategy eligibility + mode overlay
    - Outcomes: ALLOWED, THROTTLED, BLOCKED_GOVERNANCE
    |
    v
[5] Position Sizing (server/services/paper-position-sizing.ts + dynamic-sizing-engine.ts)
    - Centralized sizing: portfolio value x risk% / stop distance
    - Dynamic Sizing Engine: baseSize x f(edge, volatility, cost, confidence), bounded 0.3-1.2
    - Guardrails enforcement (max position size, daily loss limits)
    |
    v
[6] Signal Quality Evaluator / SQE (server/core/filters/signal_quality_evaluator.ts)
    - FinalScore >= 0.35 threshold
    - RegimeWeight >= 0.30 threshold
    - Regime-aware ROI gate
    - NO legacy metrics (NGC, CWQI purged)
    |
    v
[7] Ready-to-Buy / RTB Queue (server/core/rtb/ready_to_buy_service.ts)
    - Ranked by FinalScore
    - Per-signal rolling TTL (30s)
    - Central Clock synchronized
    - RTB Refresh Service: 15s micro-cycle, recomputes FinalScore + DecayPenalty
    |
    v
[8] Trade Criteria Limiter / TCL (server/core/rtb/tcl_watchdog.ts)
    - Final promotion criteria from RTB queue
    - Capacity management, elapsed time checks
    |
    v
[9] Trade Execution Controller / TEC (server/services/execution-controller.ts)
    - Places orders on Kraken (paper or live)
    - Manages active trades: trailing stops, stop-loss, take-profit
    - NO indicator recomputation (consumptive logic only)
    |
    v
[10] Trailing Exit Controller (server/services/trailing-exit-controller.ts)
    - Two-stage latch: Break-Even (1xATR gain) -> Target Lock -> TRAILING_TAKE
    - Cost-aware floors (net breakeven, net target floor)
    - DI + VolNoise driven dynamic stop distance
    |
    v
[11] Trade Close -> P&L Calculation
    |
    v
[12] Telemetry & Predictive Learning
    - server/services/telemetry-aggregator.ts (24h rolling)
    - server/core/calibration/* (ML pipeline)
```

### 2.2 VTS Path (Passive Learning / Simulation)

```
KRAKEN EXCHANGE
    |
    v
[1] FX5 Scanner (same scan engine as active trading path)
    - Pairs pass global filters and IMF filters
    - *** VTS does NOT use the Active Filter Pool ***
    - Pairs go directly from FX5 filtering to VTS Runner
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
    |       *** DIFFERENT calculation path than active trading DSS ***
    |
    |   [2c] Strategy Selection via CANONICAL_REGIME_STRATEGY_MAP
    |       *** Uses the canonical map (17 strategies) ***
    |
    |   [2d] Multi-Strategy Simulation
    |       - Creates signals for ALL strategies within the calculated regime
    |       - Generates N signals per pair (one per strategy in the regime)
    |       - This maximizes learning data for predictive learning / ML
    |
    |   [2e] Signal Generation
    |       *** KNOWN ISSUE: simulateHybridScore() + simulateDecayPenalty() ***
    |       *** Uses generic random simulation, NOT strategy-specific calculations ***
    |       *** Same calculation regardless of strategy selected ***
    |
    |   [2f] Governance Filters: eligibility, mode overlay, confidence floor
    |
    |   [2g] Net EV Gate: computeNetExpectancyKernel() -> netEV > 0 required
    |
    |   [2h] ROI Gate: isSignalProfitable() regime-aware minimum ROI
    |
    |   [2i] Position Sizing: $250 per trade, coin count = $250 / coin price
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

| Aspect | Active Trading Path | VTS Path | Impact |
|--------|-------------------|----------|--------|
| **Pair Source** | FX5 -> Active Filter Pool | FX5 (direct, no AFP) | VTS gets broader pair set |
| **Regime Model** | DSS: 6 regimes (volNoise + trendSlope) | market-regime.ts: 5 regimes (OHLC) | Same pair may get different regimes |
| **Strategy Map** | SYSTEM_GUARDS.STRATEGY_MAP (9 quant only) | CANONICAL_REGIME_STRATEGY_MAP (17 all types) | VTS tests strategies the active path can never select |
| **Selection** | DSS picks ONE best strategy | ALL strategies within regime simulated | VTS generates more signals for learning |
| **Signal Calc** | Strategy Engine with real indicators | simulateHybridScore() (generic/random) | VTS signals don't validate strategy logic |
| **Position Sizing** | Risk-based % of portfolio | Fixed $250 per trade | Different sizing models |

**This divergence is the #1 architectural risk. VTS learns from simulated data that doesn't match how the active trading engine will behave.**

---

## 3. Indicator Ownership & Computation Map

### 3.1 Where Indicators Are Computed

| Indicator | Location | Used By | Notes |
|-----------|----------|---------|-------|
| **Volatility** (stddev of returns) | `market-regime.ts` -> `computeVolatility()` | VTS pair-level regime | OHLC close prices |
| **Volatility** (high-low range) | `strategy-engine.ts` -> `calculateVolatility()` | DHMA strategy only | Different semantic definition |
| **Momentum** (14-period % change) | `market-regime.ts` -> `computeMomentum()` | VTS pair-level regime | 14-period lookback |
| **ADX** (14-period) | `market-regime.ts` -> `computeADX()` | VTS pair-level regime | Standard ADX calculation |
| **VolNoise** | `analysis-utils.ts` -> `calculateVolNoise()` | DSS regime (active path), Kalman filter | Pre-signal math |
| **TrendSlope** | `analysis-utils.ts` -> `calculateTrendSlope()` | DSS regime (active path) | Close price slope |
| **Efficiency Ratio** | `analysis-utils.ts` -> `calculateEfficiencyRatio()` | Kalman filter tuning | 20-period default |
| **VWAP** | `signal-orchestrator.ts` -> inline | Strategy evaluation | Not centralized |
| **VWAP** (duplicate) | `strategy-engine.ts` -> inline | Strategy exit conditions | Duplicate computation |
| **SMA** | `signal-orchestrator.ts` -> inline | Strategy evaluation | Not centralized |
| **SMA** (duplicate) | `strategy-engine.ts` -> inline | Mean reversion reference | Duplicate computation |
| **Z-Score** | `rolling-stats.ts` -> `RollingStats.zScore()` | DSS, market-regime (separate instances) | 300-period window |
| **Log Liquidity** | `analysis-utils.ts` -> `calculateLogLiquidity()` | Pre-signal IMF filtering | LQ 0-100 |
| **Directional Integrity** | `analysis-utils.ts` -> `calculateDirectionalIntegrity()` | Net expectancy, trailing exits | 0-100 (NOT related to DCE "DI") |
| **Kalman Smoothed Price** | `adaptive-kalman.ts` -> `getSmoothedPrice()` | Signal orchestrator (active path) | Adaptive based on ER + VolNoise |

### 3.2 Duplication & Ownership Issues (MCE Targets)

1. **Volatility**: Two separate definitions with no centralized ownership boundary -- stddev of returns (regime classification) and high-low range (DHMA strategy). Both are valid for their use cases, but there is no single authority for "volatility."
2. **VWAP computed independently** in both signal-orchestrator.ts AND strategy-engine.ts
3. **SMA computed independently** in both signal-orchestrator.ts AND strategy-engine.ts
4. **Rolling Stats has 3 separate instances**: DSS module-level, market-regime.ts module-level, and any future consumers would need their own
5. **No shared OHLC indicator cache** -- while raw prices are cached by the Unified Price Cache (see Section 10), computed indicators are not cached. Every consumer that needs indicators re-fetches OHLC and recalculates.

---

## 4. Regime Classification & Strategy Mapping

### 4.1 Canonical Regime Model (INTENDED)

**File**: `server/config/canonical-regime-strategy-map.ts` + `server/core/metrics/market-regime.ts`

**5 regimes** based on OHLC-derived metrics:

| Regime | Momentum | ADX | Volatility | Description |
|--------|----------|-----|------------|-------------|
| BULL_STABLE | >0.005 | >25 | <0.025 | Sustained uptrend, low volatility |
| BEAR_VOLATILE | <-0.005 | >25 | >0.03 | Strong bearish, high turbulence |
| LOW_VOL_CHOP | abs<0.002 | <20 | <0.015 | Flat, no directionality |
| HIGH_VOL_IMPULSE | >0.010 | >30 | >0.03 | Breakout with trend acceleration |
| TRANSITION | +/-0.004 | 20-25 | 0.015-0.03 | Reversal zone, weakening trend |

### 4.2 DSS Regime Model (LEGACY, Currently Used in Active Trading)

**File**: `server/services/dynamic-strategy-selector.ts` + `server/config/system-guards.ts`

**6 regimes** based on volNoise + trendSlope (Z-Score normalized):

| Regime | Condition |
|--------|-----------|
| EXTREME_NOISE | volNoise > 0.6 (auto-veto) |
| BULL_STABLE | trend > +0.05, vol < 0.3 |
| BULL_VOLATILE | trend > +0.05, vol >= 0.3 |
| BEAR_STABLE | trend < -0.05, vol < 0.3 |
| BEAR_VOLATILE | trend < -0.05, vol >= 0.3 |
| LOW_VOL_CHOP | abs(trend) <= 0.05 |

**Critical gaps vs canonical**: No TRANSITION, no HIGH_VOL_IMPULSE, only 9 quant strategies, no PATTERN/HYBRID.

### 4.3 Strategy Selection (Active Trading)

The intended behavior (post-MCE):
1. MCE computes regime + secondary metrics for each pair
2. Secondary metrics combined with regime determine which strategies qualify
3. Multiple strategies may qualify if their secondary metrics are in range
4. Strategies within each regime are **ranked by preference** (most reliable first) in the canonical map
5. If multiple strategies qualify, the system defaults to the **highest-ranked qualifying strategy**
6. Only ONE signal is generated per pair in active trading

### 4.4 Strategy Selection (VTS)

VTS creates signals for **ALL strategies** within the calculated regime for each pair. This maximizes learning data for predictive learning and ML. If VTS is currently only creating one signal per pair, that needs to be changed.

### 4.5 Ghost Regime Normalization

The canonical map includes `GHOST_REGIME_NORMALIZATION` to absorb DSS regime outputs:
```
BULL_VOLATILE   -> HIGH_VOL_IMPULSE
BEAR_STABLE     -> BEAR_VOLATILE
EXTREME_NOISE   -> LOW_VOL_CHOP
```

### 4.6 TRANSITION Regime Support

TRANSITION is defined in the canonical map with 3 strategies (liquidity_trap, pivot_shift, morning_star). The DSS currently cannot produce TRANSITION. Requires MCE migration.

---

## 5. Legacy Contamination Report & Deprecation Registry

### 5.1 Contamination Summary

| Legacy System | Files Referencing | Status |
|--------------|-------------------|--------|
| **Walter/Bob** | ~90 files | DEAD -- code still present |
| **LATTi** | ~12 files | DEAD -- code still present |
| **CWQI** | ~47 files | DEAD -- purged from active path, references remain |
| **NGC** | ~283 files | DEAD -- purged from active path, references remain heavily |
| **DCE** | 12 importing files | AUDIT REQUIRED -- believed not in active signal path but imported by apr-sle-engine, gasp-coordinator, pdc-engine, autonomy-scheduler, paper_validation_engine, back_audit_engine, m3b-validation-service, performance-aggregator, routes/dce, routes/health, routes/m3b |
| **ARA** (Adaptive Risk Advisor) | Multiple files | DEAD per Kyle |
| **Multi-User System** | Multiple files | DEAD -- single-user only now |
| **Strategy Presets** | Various files | DEAD |
| **Goals ML Engine** | Various files | DEAD |
| **DHMA Tuning Service** | Various files | DEAD |

### 5.2 Active Code Path Contamination

1. **signal-orchestrator.ts**: `SizedStrategySignal` interface has `ngc?`, `cwqi?`, `riskScore?`, `profitRate?` fields
2. **signal-orchestrator.ts**: `getRegimeAllowedStrategies()` uses `SYSTEM_GUARDS.STRATEGY_MAP` (legacy)
3. **dynamic-strategy-selector.ts**: Entire module uses legacy 6-regime model
4. **system-guards.ts**: `STRATEGY_MAP` contains legacy 5-regime mapping with 9 quant-only strategies

### 5.3 DCE Deprecation Status

**DO NOT declare DCE safe to remove.** It is imported by 12 files. While believed not to be in the active signal generation path, the APR-SLE Engine (which IS in the active trade lifecycle) imports `getDecisionConfidenceEngine` from DCE. Full dependency audit required before removal.

---

## 6. Known Bugs, Architecture Risks & Critical Findings

### 6.1 CRITICAL BUGS

#### BUG-001: VTS Signal Generation Is Generic
- **Location**: `server/services/vts-runner.ts` -- `simulateHybridScore()`, `simulateDecayPenalty()`
- **Problem**: Generates random regime-adjusted scores instead of real strategy-specific calculations. Same calculation regardless of strategy selected.
- **Impact**: VTS learns from statistically meaningless data. ML cannot learn strategy-specific patterns.
- **Fix**: Use real Strategy Engine + Pattern Recognizer calculations, or MCE-provided indicators.

#### BUG-002: Active Trading Path Uses Legacy DSS Regime Model
- **Location**: `server/services/dynamic-strategy-selector.ts`
- **Problem**: Uses `SYSTEM_GUARDS.STRATEGY_MAP` (6 regimes, 9 quant) instead of `CANONICAL_REGIME_STRATEGY_MAP` (5 regimes, 17 strategies).
- **Impact**: 8 of 17 canonical strategies unreachable. No TRANSITION/HIGH_VOL_IMPULSE regimes.
- **Fix**: Replace DSS with canonical regime classification + canonical map lookup.

#### BUG-003: Signal Orchestrator Also Uses Legacy Strategy Map
- **Location**: `signal-orchestrator.ts` -- `getRegimeAllowedStrategies()`
- **Problem**: Reads from `SYSTEM_GUARDS.STRATEGY_MAP`, double-enforcing the legacy restriction.
- **Fix**: Replace with `CANONICAL_REGIME_STRATEGY_MAP` lookup.

### 6.2 HIGH-RISK ISSUES

#### RISK-001: VTS/Active Trading Regime Math Drift
- VTS uses `calculatePairRegime()` (OHLC-based) while active trading uses DSS (volNoise + trendSlope). Same pair gets different regimes.

#### RISK-002: OHLC Indicator Computation Duplication
- **NOTE**: Raw price data IS already cached by the Unified Price Cache (4-bucket, rate-governed -- see Section 10). The risk is specifically that computed indicators (VWAP, SMA, volatility, etc.) are not cached and are recomputed independently by multiple consumers.

#### RISK-003: DSS Gating Prevents Access to PATTERN and HYBRID Strategies
- Strategy detection logic exists across three modules: `strategy-engine.ts` (QUANT), `pattern-recognizer.ts` (PATTERN), `hybrid-integration.ts` (HYBRID). The implementations exist. The issue is that the DSS only gates to 9 quant strategies, preventing access to PATTERN and HYBRID modules.

#### RISK-004: Strategy Key Mismatches
- Canonical map uses `range_trade`, strategy engine uses `range_trading`. Consider updating the canonical map to use `range_trading` for consistency (audit all references first).

#### RISK-005: HybridScore Falls Back to Confidence
- When no hybrid score exists, `hybridScore ?? confidence` makes the 0.4 + 0.3 weighting effectively 0.7 x confidence.

#### RISK-006: RegimeWeight Defaults to 0.5
- Raw strategy signals don't carry regime weight, so it always defaults to 0.5, negating regime differentiation in FinalScore.

#### RISK-007: Confidence Scale Inconsistency
- Strategy engine outputs 0-1, validation checks 0-100 range. Canonical scale needs to be defined and enforced.

#### RISK-008: Engine Not Integration-Tested Since Phase 8
- Significant structural changes have not been integration-tested in runtime conditions. Runtime errors are expected when the engine is first reactivated.

---

## 7. MCE Integration Blueprint

### 7.1 What the MCE Is

The **Market Context Engine (MCE)** is a planned centralized computation layer. It sits between the data sources (Kraken via Unified Price Cache) and all consumers.

**MCE is a context COMPUTATION layer. It does NOT decide trade validity.** MCE computes metrics. Other modules (DSS, SQE, Governance) decide what to do with them.

### 7.2 MCE Responsibilities

1. Fetch OHLC data once per pair per timeframe via the existing Unified Price Cache
2. Compute all technical indicators once per pair per cycle
3. Compute the canonical regime for each pair
4. Provide a typed MarketContext bundle to all consumers
5. Compute secondary metrics (Z-Scores, VolNoise, TrendSlope, ER) once
6. Support TRANSITION regime detection
7. Enable strategy-specific indicator needs (RSI, Bollinger, ATR)

### 7.3 MCE Output Interface (Proposed)

```typescript
interface MarketContext {
  pair: string;
  timestamp: number;
  regime: CanonicalRegimeType;
  regimeScore: number;
  regimeWeight: number;
  regimeConfidence: number;
  indicators: {
    volatility: number;
    momentum: number;
    adx: number;
    vwap: number;
    sma20: number;
    sma50: number;
    rsi14: number;
    bollingerUpper: number;
    bollingerLower: number;
    bollingerWidth: number;
    atr14: number;
  };
  secondary: {
    volNoise: number;
    trendSlope: number;
    efficiencyRatio: number;
    logLiquidity: number;
    directionalIntegrity: number;
    kalmanSmoothedPrice: number;
  };
  zScores: { adxZ: number; volZ: number; momZ: number; isWarmedUp: boolean; };
  ohlc: { '1h': OHLCData[]; '15m'?: OHLCData[]; '5m'?: OHLCData[]; };
  patterns: PatternSignal[];
}
```

### 7.4 MCE Integration Points

| File | Current | After MCE |
|------|---------|-----------|
| `signal-orchestrator.ts` | Fetches OHLC, computes VWAP/SMA, calls DSS | Receives MarketContext |
| `dynamic-strategy-selector.ts` | Own regime from volNoise/trendSlope | Reads regime from MCE (or replaced) |
| `strategy-engine.ts` | Pre-computed indicators | MarketContext.indicators |
| `vts-runner.ts` | Fetches OHLC, simulates scores | Real indicators from MCE |
| `market-regime.ts` | Standalone calculator | Becomes MCE internal |
| `analysis-utils.ts` | Standalone pre-signal math | Becomes MCE internal |

### 7.5 MCE Implementation Phases

| Phase | Work | Priority |
|-------|------|----------|
| MCE-1 | Create module with OHLC cache + indicator calculator | CRITICAL |
| MCE-2 | Integrate canonical regime classification | CRITICAL |
| MCE-3 | Wire Signal Orchestrator to consume MarketContext | CRITICAL |
| MCE-4 | Migrate DSS to MCE regime (or replace) | CRITICAL |
| MCE-5 | Wire VTS for real signal generation | HIGH |
| MCE-6 | Add RSI, Bollinger, ATR | HIGH |
| MCE-7 | Pattern recognition integration | MEDIUM |
| MCE-8 | Performance optimization | MEDIUM |

---

## 8. Governance Protocol & Directive System

### 8.1 Practical Process

1. **Pre-Implementation**: Claude Code writes directive -> Kyle approves
2. **Implementation**: Replit executes -> reports files changed + scope adherence
3. **Verification**: Claude Code verifies against directive
4. **Manual Update**: Claude Code updates this System Manual

### 8.2 Directive Format

```markdown
# Directive [Phase.SubPhase-Sequence]
## Objective: [one sentence]
## Scope: Files to modify, files NOT to modify, dependencies
## Instructions: [numbered steps with code]
## Impact Map: [cascading effects]
## Verification: [how to confirm success]
## System Manual Updates: [sections to update]
```

### 8.3 Replit Post-Implementation Requirements

After every implementation, Replit must:
1. List all files changed
2. Confirm scope adherence (nothing outside directive scope was modified)
3. Run applicable tests
4. Note any deviations from the directive
5. Flag any conflicts with this System Manual

---

## 9. Replit Impact Reference Map

### 9.1 Core File Dependencies

| File | Risk | Key Consumers |
|------|------|--------------|
| `system-guards.ts` | HIGH | DSS, analysis-utils, filter-engine, IMF (22+ importers) |
| `canonical-regime-strategy-map.ts` | HIGH | VTS, signal orchestrator, telemetry (10+ importers) |
| `signal-orchestrator.ts` | CRITICAL | Central pipeline hub (imports 20+ modules) |
| `dynamic-strategy-selector.ts` | CRITICAL | Live strategy gating (imported by orchestrator, market-indicators) |
| `strategy-engine.ts` | HIGH | Signal generation (imported by orchestrator) |
| `vts-runner.ts` | HIGH | Imports 25+ files, largest import tree |
| `price-cache.ts` | HIGH | All price consumers, rate limiting |
| `central-clock.ts` | CRITICAL | All timed subsystems (LOCKED MODULE) |

### 9.2 Change Impact Matrix

| If You Change... | Also Check... |
|-------------------|---------------|
| SYSTEM_GUARDS thresholds | DSS, analysis-utils, filter-engine, IMF |
| Canonical map | VTS, orchestrator, telemetry, validation, UI regime display |
| Strategy engine methods | Orchestrator, VTS |
| DSS regime logic | Orchestrator, market-indicators |
| Score weights | SQE thresholds, RTB ranking, VTS scoring |
| Net expectancy kernel | Orchestrator, VTS, all EV consumers |
| Price cache API | Orchestrator, VTS, execution controller |
| FX5 scanner | Active filter pool, orchestrator, VTS |
| Central Clock | ALL timed subsystems (requires architectural review) |

---

## 10. Market Data & Pricing Infrastructure

### 10.1 Unified Price Cache

**File**: `server/services/price-cache.ts` (LOCKED MODULE)

4-bucket rate-governed cache:

| Bucket | Refresh Interval | Purpose |
|--------|-----------------|---------|
| openTrade | 2 seconds | Active position monitoring |
| readyToBuy | 15 seconds | RTB signal refresh |
| fx5Snapshot | 30 seconds | Scanner price data |
| vtsSimulation | 60 seconds | VTS isolated cache |

- Rate limit: 10 weighted requests/second to Kraken
- Batch size: 100 symbols per request
- VTS data isolated to prevent contamination of active trading cache

### 10.2 Live Pricing Adapter

**File**: `server/services/live-pricing-adapter.ts`

- Dual-source: Kraken WebSocket (primary), Kraken REST (fallback)
- Staleness thresholds: fresh <= 2s, warning >= 10s, REST fallback >= 25s
- Broadcast throttle: 150ms per symbol
- Fallback chain: kraken_ws -> kraken_rest -> binance -> coingecko -> last_known_good

### 10.3 Kraken WebSocket v2 Adapter

**File**: `server/services/kraken-websocket-adapter.ts`

- Connects to `wss://ws.kraken.com/v2` for real-time BBO (best-bid-offer) updates
- Snapshot on subscribe for immediate price data
- Auto-reconnection with exponential backoff
- Volume classification by tier (high/medium/low volume pairs)

### 10.4 MCE Data Source

The MCE should call INTO this existing pricing infrastructure (especially the Price Cache and Kraken service for OHLC data), not replace it. The MCE adds an indicator computation layer on top of existing price data.

---

## 11. Symbol Canonicalization Layer

**File**: `server/markets/kraken-symbol-resolver.ts` (LOCKED MODULE)

### 11.1 Purpose

Kraken uses multiple naming formats for the same pair. The symbol resolver translates between all formats and normalizes to internal BASE/QUOTE format.

### 11.2 Resolution Tiers

| Tier | Source | Trust Level |
|------|--------|-------------|
| 0 | Static map (`kraken-symbol-map.ts`) | Highest -- manually verified |
| 1 | Auto-map verified (matches static) | High |
| 2 | Auto-map derived (API normalization) | Medium |
| 3 | Auto-map uncertain | Low -- not safe for auto-use |

### 11.3 Key Translations

- Kraken uses **XBT** for Bitcoin (not BTC) in WebSocket feeds
- REST API uses X/Z prefixes (e.g., `XAVAXZUSD`)
- WebSocket uses slash format (e.g., `AVAX/USD`)
- Internal format: `BASE/QUOTE` (e.g., `AVAX/USD`)

### 11.4 Functions

| Function | Purpose |
|----------|---------|
| `normalizeToInternalSymbol()` | Any format -> internal BASE/QUOTE |
| `toKrakenWS()` | Internal -> Kraken WebSocket format |
| `resolveByKrakenRestPair()` | REST pair -> mapping |
| `getKrakenRestPair()` | Internal -> REST format |

ALL subsystems MUST use canonical BASE/QUOTE format internally.

---

## 12. Trade Execution & Lifecycle Layer

### 12.1 Paper Execution Engine

**File**: `server/services/paper-execution-engine.ts`

- Processes entry signals through 8-step safety checks
- Simulated execution with slippage (0.15%) and fees (0.10%)
- Position monitoring every 1.5 seconds
- Evaluates SL/TP against live prices from Kraken WebSocket

### 12.2 Trailing Exit Controller

**File**: `server/services/trailing-exit-controller.ts`

Two-stage latch system:
- **Stage 1 (Break-Even)**: When price gains 1xATR from entry, stop moves to **net breakeven** (cost-aware)
- **Stage 2 (Target Lock)**: When price hits target, stop locks to **net target floor**, mode switches to TRAILING_TAKE ("moonbag mode")
- Dynamic stop distance uses DI (Directional Integrity) + VolNoise
- Cost-aware floors account for fees and slippage

### 12.3 APR-SLE Engine

**File**: `server/services/apr-sle-engine.ts`

Adaptive Profit Realization & Stop-Loss Evolution:
- Regime multipliers: T1 Bull +15% TP/-10% SL, V1 High Vol -20% TP/+25% SL
- Uses DI momentum and volatility conditions
- **NOTE**: Imports from `decision-confidence-engine.ts` (legacy dependency -- audit needed)

### 12.4 Dynamic Sizing Engine

**File**: `server/core/risk/dynamic-sizing-engine.ts`

- Formula: `positionSize = baseSize x f(expectedEdge, volatility, costFactor, confidence)`
- Multiplier bounded: 0.3 to 1.2
- Base size scales with portfolio balance
- Hard cap from Trade Safety Service

### 12.5 Architectural Invariant

**The trade lifecycle layer is indicator-CONSUMPTIVE only.** No indicator recomputation occurs below the strategy layer. ATR and DI are consumed as inputs, not recalculated.

---

## 13. RTB Refresh & Signal Lifecycle

### 13.1 RTB Refresh Service

**File**: `server/services/rtb-refresh-service.ts` (LOCKED MODULE)

- **Micro-cycle**: 15 seconds (one bucket refresh)
- **Macro-cycle**: 120 seconds (full coverage of all 8 buckets)
- During refresh: FinalScore recomputed, DecayPenalty recalculated, netExpectedEdge recalculated
- **Adaptive Concurrency Tuner (ACT)**: 3-10 workers, scales based on CPU/duration/event loop lag
- All pricing from Unified Price Cache (NO direct Kraken calls)
- Central Clock synchronized

### 13.2 Signal Lifecycle

```
Signal Orchestrator -> SQE -> RTB Queue -> TCL (Trade Criteria Limiter) -> TEC -> Order Management
```

At each stage, signals can be rejected: SQE (score gates), RTB (TTL expiry), TCL (capacity), TEC (safety checks).

---

## 14. Central Clock

**File**: `server/services/central-clock.ts` (LOCKED MODULE -- Directive 8.8.4)

### 14.1 Overview

1-second tick interval, EventEmitter-based. Single shared timing source for all engine subsystems.

### 14.2 Subscribers

| Subscriber | Interval | Purpose |
|------------|----------|---------|
| FX5 Scanner | 30 ticks (30s) | Market scan cycle |
| RTB Refresh | 15 ticks (15s) | Signal freshness |
| TCL | Elapsed time check | Promotion timing |
| Health Monitor | 60 ticks (60s) | System health log |

### 14.3 Features

- Drift monitoring: 100ms threshold warning
- Auto-start failsafe: clock starts when any module subscribes
- Health logging every 60 seconds

---

## 15. Governance Layer

### 15.1 Governance Engine

**File**: `server/core/governance/governance-engine.ts`

Execution order: Signal -> Regime -> Stability -> Deterministic Filters -> **GOVERNANCE** -> Scoring -> Execution -> Learning

Outcomes: ALLOWED, THROTTLED, BLOCKED_GOVERNANCE

Constrains **influence** (what trades execute), not **data collection** (what VTS simulates).

### 15.2 Regime Stability Classification

**File**: `server/core/governance/regime-stability.ts`

| State | Meaning |
|-------|---------|
| STABLE | Full strategy access |
| TRANSITION | Reduced strategy access |
| UNSTABLE | Minimal strategy access |

Based on: DriftScore, VolZ, Regime Confidence, Flip Rate (7-day). Computed ONCE per scan cycle, cached to prevent intra-cycle thrashing.

---

## 16. Macro-State Detection

**File**: `server/core/metrics/macro-state.ts`

| Condition | Trigger | Effect |
|-----------|---------|--------|
| NORMAL | Default | No adjustments |
| VOLATILITY_EXPANSION | avgVolatilityZ > 2 | Tighter thresholds |
| LIQUIDITY_CRUNCH | liquidityZ < -1 | Higher liquidity requirements |
| SPECULATIVE_SURGE | correlationZ > 1.5 | Higher confidence floors |

Uses 300-period rolling Z-scores of aggregate market metrics.

---

## 17. Telemetry & Learning Infrastructure

- **Telemetry Aggregator** (`telemetry-aggregator.ts`): 24h rolling window per pair
- **ML Calibration** (`ml-calibration.ts`): Performance scoring, edge delta tracking
- **Predictive Learning** (`server/core/calibration/*`): Sole parameter adjustment authority
- **Regime Archive** (`regime-archiver.ts`): Weekly archival, Sunday 00:45 UTC

---

## 18. Active vs Legacy Execution Boundary

| Module | Active | Legacy/Dead | Audit Needed | Notes |
|--------|:------:|:-----------:|:------------:|-------|
| Signal Orchestrator | YES | | | Central hub |
| Strategy Engine | YES | | | 9 QUANT strategies |
| Pattern Recognizer | YES | | | PATTERN signals |
| Hybrid Integration | YES | | | QUANT+PATTERN |
| DSS | YES | | | Legacy regime model |
| FX5 Scanner | YES | | | Market scanning |
| Active Filter Pool | YES | | | Pair management |
| SQE | YES | | | Quality gate |
| RTB Service | YES | | | Signal queue |
| TCL Watchdog | YES | | | Trade Criteria Limiter |
| Execution Controller | YES | | | Trade execution |
| Paper Execution Engine | YES | | | Paper trades |
| Trailing Exit Controller | YES | | | Two-stage exits |
| VTS Runner | YES | | | Simulation |
| Net Expectancy Kernel | YES | | | Sole EV authority |
| Governance Engine | YES | | | Trade authorization |
| Central Clock | YES | | | LOCKED |
| Price Cache | YES | | | LOCKED |
| Symbol Resolver | YES | | | LOCKED |
| APR-SLE Engine | YES | | YES | Imports DCE |
| Dynamic Sizing Engine | YES | | | Position sizing |
| DCE | | | YES | 12 importers |
| Walter/Bob | | DEAD | | ~90 refs |
| LATTi | | DEAD | | ~12 refs |
| CWQI/NGC | | DEAD | | ~330 refs |
| ARA | | DEAD | | Per Kyle |

---

## 19. DI Naming Disambiguation

**DI (Directional Integrity)** in `analysis-utils.ts` and `trailing-exit-controller.ts` = Active metric, measures price movement consistency (0-100).

**DI (Decision Index)** in legacy DCE = Deprecated metric from old scoring formula.

These are **completely different calculations**. Do not confuse them.

---

## Appendix A: File Index

*(See Core System Files Reference: `bridge/canonical/DawnTrader_Core_System_Files_Reference.md` for the complete 73+ file index organized by category.)*

Key files: system-guards.ts, canonical-regime-strategy-map.ts, signal-orchestrator.ts, strategy-engine.ts, dynamic-strategy-selector.ts, vts-runner.ts, price-cache.ts, central-clock.ts, kraken-symbol-resolver.ts, paper-execution-engine.ts, trailing-exit-controller.ts, governance-engine.ts, regime-stability.ts, rtb-refresh-service.ts, tcl_watchdog.ts, net-expectancy-kernel.ts, market-regime.ts, macro-state.ts, analysis-utils.ts, rolling-stats.ts, adaptive-kalman.ts, dynamic-sizing-engine.ts, telemetry-aggregator.ts.

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **Active Trading** | State where engine is running (paper or live) |
| **DI (Directional Integrity)** | Price movement consistency (0-100). NOT related to DCE Decision Index |
| **DSS** | Dynamic Strategy Selector -- currently uses legacy regime model |
| **FinalScore** | Primary ranking metric (0-1), weights from score-weights.config.ts |
| **Live Mode** | Real money mode. Does NOT mean "engine running" |
| **MCE** | Market Context Engine -- planned computation layer |
| **Paper Mode** | Simulated execution mode |
| **Passive Learning** | Engine stopped, VTS running |
| **TCL** | Trade Criteria Limiter (file: tcl_watchdog.ts) |

## Appendix C: System Invariants (Key Selections)

1. No trade without positive Net EV
2. Stop-loss on every position
3. Long-only trading (no shorts)
4. High-volatility noise guard: VolNoise > 0.6 triggers pre-filter veto. (NOTE: Was originally "EXTREME_NOISE regime" from legacy DSS. Once migrated to canonical model, enforce as pre-filter condition, not regime.)
5. FinalScore is the sole ranking metric
6. Canonical map is the sole regime-strategy authority
7. Net Expectancy Kernel is the sole EV authority
8. Score weights centralized in score-weights.config.ts (not hardcoded)
9. System Guards immutable during runtime
10. All symbols normalized at data ingress
11. No circular dependencies between core modules (to be verified)
12. Trade lifecycle layer is indicator-consumptive only
13. Every code change requires a directive
14. System Manual updated after every change
15. No modification of locked modules without architectural review

---

*End of DawnTrader System Manual v1.1*
