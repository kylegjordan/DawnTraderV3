# Phase 2: Strategy Deep-Dives — Version 3

> **Phase**: 2 of 11
> **Author**: Claude Code (System Cartographer)
> **Date**: 2026-02-16
> **Version**: 3 — Incorporates ChatGPT/Replit regime analysis: 4 regime engines identified, regime authority recommendation, MCP/ARE documented
> **Status**: COMPLETE — Kyle corrections applied (v2), ChatGPT/Replit feedback incorporated (v3)
> **Covers Replit Items**: #1 Strategy Engine, #2 Pattern Recognizer, #3 Hybrid Integration, #4 Dynamic Strategy Selector, #5 Strategy Filters, #6 Drift Detector, #7 Strategy Validator, #17 Strategy Signal Audit Engine, #18 Provenance Governance, #19 Strategy Features, #20 Strategy Analytics, #21 Strategy Alerts, #22 Strategy Sync

---

## ⚠️ CRITICAL: Current State vs Intended State

**The DSS is currently broken.** It imports `SYSTEM_GUARDS.STRATEGY_MAP` — a legacy 6-regime / 9-quant-only map that does not include pattern or hybrid strategies. This means:

- Only QUANT signals are generated and routed to trades
- Pattern strategies and Hybrid strategies are never selected
- The regime classification uses 6 legacy regimes instead of 5 canonical regimes

**The canonical source of truth** is `server/config/canonical-regime-strategy-map.ts` (Directive 11.7F), which defines 5 regimes and 17 strategies (9 quant + 3 pattern + 5 hybrid). The file exists, is comprehensive, and includes all the infrastructure needed (normalization, context-aware selection, validation) — but the DSS does not import or use it.

This section documents **the intended system** based on the canonical map, with the current (legacy) state clearly flagged where it differs. The transition from legacy to canonical is logged in CHANGES_AND_FIXES.md and LEGACY_DEPRECATION_PLAN.md.

---

## ⚠️ CRITICAL: Four Parallel Regime Classification Systems (BUG-008)

DawnTrader contains **four** independent regime classification systems operating simultaneously with **three different naming conventions** and **zero cross-referencing**. This is the deepest architectural fragmentation in the system.

### The Four Engines

#### Engine 1: DSS Legacy (Active Trading Path) — DEPRECATED
- **File**: `server/services/dynamic-strategy-selector.ts` (214 lines)
- **Input**: `volNoise` + `trendSlope` from analysis-utils (raw thresholds)
- **Output**: 6 legacy regimes (EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP)
- **Consumers**: Signal Orchestrator → active trades
- **Strategy Map**: `SYSTEM_GUARDS.STRATEGY_MAP` → 9 quant strategies only
- **Z-Scores**: Computed via RollingStats(300) but **IGNORED** for classification — raw thresholds used
- **Status**: LEGACY — must be replaced (BUG-006)

#### Engine 2: calculatePairRegime (VTS / Pair-Level) — CANONICAL CANDIDATE
- **File**: `server/core/metrics/market-regime.ts`
- **Input**: OHLC data → volatility (stddev returns), momentum (14-period % change), ADX (14-period)
- **Output**: 5 canonical regimes (BULL_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP, HIGH_VOL_IMPULSE, TRANSITION)
- **Consumers**: VTS Runner (heavy use), Diagnostic 11.4G
- **Thresholds**: Static, closely aligned with canonical map thresholds
- **Status**: ACTIVE — recommended as sole pair-level regime authority

#### Engine 3: getNormalizedRegime (Z-Score Advisory) — PRESERVE FOR ML
- **File**: `server/core/metrics/market-regime.ts` (same file as Engine 2)
- **Input**: Same as Engine 2, but Z-Score normalized through 300-period RollingStats buffers
- **Output**: 5 canonical regimes (same names as Engine 2)
- **Consumers**: VTS Runner (advisory logging only, Directive 11.5 Task 2)
- **Status**: ACTIVE — advisory only, not used for routing decisions. Preserve for Phase 12 ML retraining.

#### Engine 4: Market Condition Profiler / Adaptive Regime Engine (Market-Level) — LEGACY, REMOVE (Kyle Confirmed)
- **Files**: `server/services/market-profiler.ts` + `server/services/adaptive-regime.ts`
- **Directive**: 8.8.4-L12 (LOCKED — predecessor system, lock made it invisible during canonical evolution)
- **Built**: Dec 27, 2025. Immediately locked. The canonical regime map (Directive 11.7F) and DSS were built starting Jan 2026 to replace it, but MCP/ARE was never decommissioned.
- **Input**: Live price history + volume history → volatility (20-period std dev), trend strength (-1 to 1), volume z-score, ATR, cross-asset correlation
- **Output**: 5 regimes with **different taxonomy**: T1 (Trending Bull), T2 (Trending Bear), R1 (Range-Bound), V1 (High Volatility Chop), C1 (Calm Consolidation)
- **Consumers**: **14+ services** — market routes, health routes, autonomy-scheduler, action-executor, APR-SLE engine, MACO coordinator, GASP coordinator, experience-buffer, reward-evaluator, proactive-allocator, regime-performance tracker, regime archiver, regime-stability governance
- **Strategy Mix**: Own hardcoded `REGIME_STRATEGY_MATRIX` with percentage-weighted allocations (e.g., T1: breakout 45%, momentum 30%, DHMA 10%). Does NOT reference canonical map.
- **Exposure/Risk Multipliers**: `REGIME_EXPOSURE_MULTIPLIERS` (T1: 1.2×, T2: 0.7×) and `REGIME_RISK_MULTIPLIERS`
- **Stubbed Metrics** (RISK-019): `volume_z` hardcoded to `0`, `correlation` hardcoded to `0.5` — never computed from market data. Further evidence this system was never fully completed before being locked.
- **Timer**: Runs every 15 minutes via `checkInterval`
- **Status**: **LEGACY — Kyle confirmed 2026-02-16.** MCP/ARE was the predecessor regime system. The canonical map and DSS were built to replace it. It was never the intention to have two systems creating signals and making adjustments to signal generation. Must be removed entirely. 14+ consumer services must be migrated during removal.

### Why This Matters

| Problem | Impact |
|---------|--------|
| VTS learns from Engine #2, active trading uses Engine #1 | Any ML calibration from VTS data is computed against a different regime model than production. VTS predictions are suspect. |
| Engine #4 is a legacy predecessor still running | MCP/ARE was built before canonical map existed, was locked, then ignored. It continues applying its own strategy weights and exposure modifiers to 14+ services using a completely different regime model (RISK-016, RISK-020) |
| Three naming conventions (legacy 6 / canonical 5 / T1-C1) | No cross-reference mapping exists between any pair of taxonomies |
| Engine #4 uses stubbed metrics | `volume_z = 0` and `correlation = 0.5` are hardcoded — never computed from market data. System was locked before implementation was finished (RISK-019) |
| Two systems generating signals and adjustments simultaneously | Kyle confirmed this was never the intention. Canonical map and DSS were built to replace MCP/ARE, not coexist with it |

### Recommended Regime Architecture (Post-Fix)

**Layer 1 — Pair-Level Regime Authority (Strategy Routing):**
`calculatePairRegime()` from `market-regime.ts` → 5 canonical regime names → canonical strategy map lookup. This replaces DSS Engine #1. Both VTS and active trading call the same function. This is the **BUG-006 fix**.

**Layer 2 — Z-Score Normalized Regime (ML Advisory):**
`getNormalizedRegime()` from `market-regime.ts`. Advisory only. Preserved for Phase 12 ML retraining. Not used for routing.

**Layer 3 — Portfolio-Level Risk/Exposure Modulation (Post-MCP):**
When MCP/ARE is removed, any portfolio-level exposure/risk modulation it was providing must be absorbed by MCE or rebuilt as a lightweight module that consumes `calculatePairRegime()` canonical regime output. This is NOT a new parallel regime engine — it is a downstream consumer of the canonical regime, applying exposure multipliers and risk adjustments at the portfolio level.

**REMOVE — Two Systems:**
1. DSS volNoise/trendSlope classification → `SYSTEM_GUARDS.STRATEGY_MAP`. Remove in Wave 2 (pre-MCE).
2. MCP/ARE (`market-profiler.ts` + `adaptive-regime.ts`). Remove in Wave 6 (during/after MCE). 14+ consumer services must be migrated. Kyle confirmed legacy 2026-02-16.

---

## Overview: The Intended Strategy Architecture

```
Market Data → Regime Classifier (Canonical 5-Regime Model)
                ↓
            Canonical Strategy Map → Candidate Strategies (up to 5 per regime)
                ↓
    ┌───────────────────────────────┐
    │  QUANT Strategies (9)         │ → StrategySignal
    │  PATTERN Strategies (3)       │ → PatternSignal
    │  HYBRID Strategies (5)        │ → HybridSignal
    └───────────────────────────────┘
                ↓
    Context-Aware Selection (pattern detection → strategy preference)
                ↓
    Signal Orchestrator (Phase 3) → SQE Gate → Kernel → Trade Decision
```

**Three signal types, equal citizens:**
- **QUANT** (9 strategies): Technical indicator-based signals from OHLCV candle analysis
- **PATTERN** (3 strategies): Candlestick pattern-based signals using the 5 canonical patterns
- **HYBRID** (5 strategies): Confluence of quant indicators + pattern recognition

---

## 1. Canonical Regime-Strategy Map (Single Source of Truth)

**File**: `server/config/canonical-regime-strategy-map.ts` (680 lines)
**Directive**: 11.7F
**Schema Version**: regime-mapping/v1.4c (2026-01-23)
**Status**: DEFINED but NOT wired to DSS runtime

### 5 Canonical Regimes

| Regime | Momentum | ADX | Volatility | Description |
|--------|----------|-----|------------|-------------|
| **BULL_STABLE** | > 0.005 | > 25 | < 0.025 | Sustained uptrend, confirmed directional trend, stable volatility |
| **BEAR_VOLATILE** | < -0.005 | > 25 | > 0.03 | Downward impulse, strong bearish trend, high turbulence |
| **LOW_VOL_CHOP** | abs < 0.002 | < 20 | < 0.015 | Flat market, no directionality, narrow range |
| **HIGH_VOL_IMPULSE** | > 0.010 | > 30 | > 0.03 | Strong breakout, trend acceleration, violent expansion |
| **TRANSITION** | ±0.004 | 20-25 | 0.015-0.03 | Reversal zone, weakening trend, volatility uplift |

### Full Canonical Strategy Map (17 Strategies)

#### BULL_STABLE (3 strategies, riskMultiplier: 1.2, minConfidence: 0.65)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| VWAP Pullback | vwap_pullback | QUANT | — | VWAP deviation < −1σ, Momentum > 0 |
| Morning Star / Evening Star | morning_star | PATTERN | MORNING_STAR | 3-bar sequence, momentum flip > 0.3% |
| Pivot Shift | pivot_shift | HYBRID | MORNING_STAR | RSI 45–55, ADX slope > 0.5 |

#### BEAR_VOLATILE (4 strategies, riskMultiplier: 0.7, minConfidence: 0.75)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| Mean Reversion | mean_reversion | QUANT | — | RSI < 30 or > 70, Price deviation > 1σ |
| Reverse Impulse | reverse_impulse | HYBRID | PINBAR | Volume > 1.5× avg, Momentum spike < −0.5% |
| Defensive Hedge | defensive_hedge | HYBRID | ENGULFING | BTC Corr < 0.3, Vol Offset > 1σ |
| Inside Bar Reversal | inside_bar_reversal | PATTERN | ENGULFING | Parent > Child × 1.3, Breakout Volume > 1.5× avg |

#### LOW_VOL_CHOP (4 strategies, riskMultiplier: 0.9, minConfidence: 0.60)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| Range Trading | range_trade | QUANT | — | Bollinger Bandwidth < 0.14, RSI 45–55, ADX < 20 |
| Support Bounce | support_bounce | PATTERN | PINBAR | Price ≈ Local Min ± 1σ, Volume > 1.2× avg |
| ABCD Long | abcd_long | QUANT | — | AB:CD ≈ 1.0, Volume > 1.2× avg |
| Adaptive Flow | adaptive_flow | HYBRID | TRI_STAR | Momentum inversion ≥ 3, Volatility percentile > 70% |

#### HIGH_VOL_IMPULSE (5 strategies, riskMultiplier: 0.8, minConfidence: 0.70)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| SMA Trend Ride | sma_trend_ride | QUANT | — | SMA(50) > SMA(100), ADX > 25, RSI 55–70 |
| Breakout | breakout | QUANT | — | Momentum > +0.7%, Volume > 2× avg |
| VWAP Bounce | vwap_bounce | QUANT | — | VWAP deviation > +1σ, Momentum −0.3–−0.6% |
| Volatility Edge | volatility_edge | HYBRID | ABCD | Volatility Percentile > 80, Regime mismatch = True |
| DHMA | dhma | QUANT | — | HMA(9) cross HMA(21), ADX flat |

#### TRANSITION (3 strategies, riskMultiplier: 0.85, minConfidence: 0.55)

| Strategy | Key | Signal Type | Pattern | Secondary Metrics |
|----------|-----|-------------|---------|-------------------|
| Liquidity Trap | liquidity_trap | QUANT | — | Wick/Body > 2 or Depth Imbalance > 1.4 |
| Pivot Shift | pivot_shift | HYBRID | MORNING_STAR | RSI 45–55, ADX slope > 0.5 |
| Morning Star / Evening Star | morning_star | PATTERN | MORNING_STAR | 3-bar sequence, momentum flip > 0.3% |

**Note**: Pivot Shift and Morning Star appear in both BULL_STABLE and TRANSITION — they are cross-regime strategies.

### Ghost Regime Normalization (Legacy Bridge)

The canonical map includes a normalization layer for legacy regime names:

| Legacy Regime | Canonical Equivalent |
|---------------|---------------------|
| BULL_VOLATILE | HIGH_VOL_IMPULSE |
| BEAR_STABLE | BEAR_VOLATILE |
| EXTREME_NOISE | LOW_VOL_CHOP |
| HIGH_VOL_CHOP | HIGH_VOL_IMPULSE |
| MIXED_TRANSITION | TRANSITION |

### Context-Aware Strategy Selection (Directive 11.4G)

The canonical map provides `selectContextAwareStrategy()` which considers detected patterns when selecting strategies:

1. **Exact match**: If pattern recognizer detects a pattern that matches a HYBRID/PATTERN strategy in the current regime → select that strategy
2. **Hybrid fallback**: If pattern detected but no exact match → select any HYBRID strategy for the regime
3. **Pattern fallback**: If no HYBRID available → select any PATTERN strategy
4. **Diversity**: 25% of symbols (via symbol hash) get a non-primary strategy for natural diversity
5. **Primary**: Default to the first strategy in the regime's list

This selection logic ensures pattern and hybrid strategies are actively chosen when conditions warrant — but **only if the DSS is wired to use it**.

### Pattern-to-Canonical Mapping (Directive 11.4G)

The 5 pattern recognizer outputs are mapped to canonical pattern types:

| Detected Pattern | Canonical Type | Strategy Family |
|-----------------|----------------|-----------------|
| PINBAR | PINBAR | Reverse Impulse, Support Bounce |
| ENGULFING | ENGULFING | Defensive Hedge, Inside Bar Reversal |
| MORNING_STAR | MORNING_STAR | Morning Star, Pivot Shift |
| INSIDE_BAR | ENGULFING | (mapped to Engulfing family) |
| THREE_SOLDIERS | MORNING_STAR | (mapped to Morning Star family) |
| ABCD | ABCD | Volatility Edge |
| TRI_STAR | TRI_STAR | Adaptive Flow |

---

## 2. The Current DSS (Legacy — Must Be Replaced)

**File**: `server/services/dynamic-strategy-selector.ts` (214 lines)
**Directive**: 10.1
**Status**: ACTIVE but using **legacy regime/strategy mapping**

### What's Wrong

DSS currently imports `SYSTEM_GUARDS.STRATEGY_MAP` which defines:
- 6 legacy regimes (EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP)
- Only 9 QUANT strategies (no pattern, no hybrid)
- Different regime thresholds (volNoise/trendSlope) than the canonical model (momentum/ADX/volatility)

**Consequences**:
- Pattern strategies (morning_star, support_bounce, inside_bar_reversal) are never selected
- Hybrid strategies (pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge) are never selected
- Regime classification misaligns with the canonical model
- The canonical map's risk multipliers and min confidence thresholds are not applied

### What Needs to Change

DSS must be rewired to:
1. **Call `calculatePairRegime()` from `market-regime.ts`** instead of computing volNoise/trendSlope locally — this is the same function VTS already uses, which unifies regime classification between active trading and VTS
2. Import from `canonical-regime-strategy-map.ts` instead of `SYSTEM_GUARDS.STRATEGY_MAP`
3. Use `selectContextAwareStrategy()` for pattern-aware routing
4. Apply per-regime `riskMultiplier` and `minConfidence` from canonical map
5. Remove EXTREME_NOISE as a regime — the canonical model handles high volatility via HIGH_VOL_IMPULSE (not as an auto-veto)

**Note**: This is a short-term fix achievable pre-MCE. The Signal Orchestrator can call `calculatePairRegime()` directly for regime classification, then look up strategies via the canonical map. MCE will eventually centralize this, but the fix doesn't need to wait.

**Logged as BUG-006 in CHANGES_AND_FIXES.md.**

---

## 3. QUANT Strategies (9)

**File**: `server/services/strategy-engine.ts` (999 lines)
**Directive**: 8.8.3-B
**Status**: ACTIVE — strategy detection logic is correct, but regime routing is wrong

The 9 quant strategy implementations exist and are functional. Their detection logic, entry/exit rules, and signal generation are independent of the regime routing. The problem is only that DSS routes them via the wrong map.

### Strategy Parameters

All strategy parameters (pullback thresholds, volume multipliers, etc.) are backend-configured. No UI exposure for user editing was found in the client code. If any route previously exposed parameter editing, it has been removed or is inactive.

### 3.1 VWAP Pullback
**Canonical Regime**: BULL_STABLE
**Method**: `detectVWAPPullback(indicators, settings, priceHistory)`

Entry: Price above VWAP, within pullback threshold (2%), bullish reversal detected, volume ≥ 1.5× average.
Stop: min(VWAP × 0.997, low24h × 1.001). Target: max(high24h × 0.995, entry + 2R).
Confidence: 0.7–0.9 (variable based on reversal confirmation).
Strategy-Specific Exit: Price closes below current VWAP.

### 3.2 ABCD Long
**Canonical Regime**: LOW_VOL_CHOP
**Method**: `detectABCDLong(priceHistory, settings)`

Entry: 4-point pattern (Spike → Pullback → Higher Low → Breakout). Requires volume confirmation ≥ 1.5× spike volume.
Stop: C-low × 0.998. Target: entry × (1 + targetPercent, default 3%) or trailing 2R.
Confidence: 0.75 (static).
Strategy-Specific Exit: Price drops 0.5% below entry.

### 3.3 SMA Trend Ride
**Canonical Regime**: HIGH_VOL_IMPULSE
**Method**: `detectSMATrendRide(indicators, priceHistory, settings)`

Entry: Price above SMA + near SMA + bounce pattern + uptrend confirmed (above mode), or price crosses above SMA + uptrend (crossover mode).
Stop: min(5-bar swing low × 0.998, SMA × 0.995). Target: entry + trendStrength × 3% or 2R.
Confidence: 0.65 (static).
Strategy-Specific Exit: Price closes below current SMA.

### 3.4 Breakout
**Canonical Regime**: HIGH_VOL_IMPULSE
**Method**: `detectBreakout(priceHistory, params)`

Entry: Price breaks above consolidated range high × (1 + buffer, 1%), volume ≥ 2× average.
Stop: rangeLow × 0.998. Target: entry + rangeHeight (measured move).
Confidence: 0.75 (static).
Strategy-Specific Exit: Price closes below breakout level × 0.995.

### 3.5 Mean Reversion
**Canonical Regime**: BEAR_VOLATILE
**Method**: `detectMeanReversion(indicators, priceHistory, params)`

Entry: Price below mean (VWAP/SMA/range midpoint) by deviation threshold (2.5%), bullish reversal detected.
Stop: entry × (1 - 1%). Target: meanValue × 0.998.
Confidence: 0.70 (static).
Strategy-Specific Exit: None (stop/target only).

### 3.6 Range Trading
**Canonical Regime**: LOW_VOL_CHOP
**Key**: `range_trade` (note: canonical map uses `range_trade`, strategy engine uses `range_trading`)
**Method**: `detectRangeTrading(priceHistory, params)`

Entry: Price in entry zone near range support (between rangeLow and rangeLow + 0.5%).
Stop: rangeLow × (1 - 1%). Target: rangeHigh × 0.995.
Confidence: 0.72 (static).
Strategy-Specific Exit: Price breaks above resistance × 1.002.

### 3.7 VWAP Bounce
**Canonical Regime**: HIGH_VOL_IMPULSE
**Method**: `detectVWAPBounce(indicators, priceHistory, params)`

Entry: VWAP trending up (slope ≥ 0.3%), price near VWAP (within 0.5%), recently touched/went below, now above, volume ≥ 1.3× average.
Stop: VWAP × 0.997. Target: entry + 2R.
Confidence: 0.73 (static).
Strategy-Specific Exit: Price closes below current VWAP.

### 3.8 Liquidity Trap
**Canonical Regime**: TRANSITION
**Method**: `detectLiquidityTrap(priceHistory, params)`

Entry: False breakout above range detected (broke above, returned), trap extension ≤ 1.2%, volume reversal ≥ 1.5× breakout volume.
Stop: breakoutHigh × 1.005. Target: rangeLow × 1.002.
Confidence: 0.68 (static).
Strategy-Specific Exit: Price goes above trap level × 1.002.

### 3.9 DHMA (Dual-Horizon Microstructure Alpha)
**Canonical Regime**: HIGH_VOL_IMPULSE
**File**: `server/strategies/dhma.ts` (657 lines)

The most sophisticated strategy — uses Level-2 order book data, not OHLCV candles.

**Features**: OBI (Order Book Imbalance), Microprice Tilt, Signed Flow Ratio, Toxicity (VPIN), Arrival Rate.
**Dual Regime**: Burst (5-20 min signed flow) + Session (15 min+ VWAP slope).
**Entry**: Both regimes must agree + OBI/tilt thresholds + toxicity/spread filters.
**Sizing**: Risk-based with spread × toxicity deweighting.
**Coherency**: Calls `guardrailPolicy.validate()` before any signal.
**Note**: DHMA generates both long AND short signals. Short signals are forward-looking architecture — DawnTrader currently operates long-only on Kraken.

---

## 4. PATTERN Strategies (3)

**Pattern Recognition Service**: `server/services/pattern-recognizer.ts` (481 lines, Directive 10.2)

Pattern recognition is the **detection service** — it identifies candlestick formations in OHLCV data. The 3 pattern **strategies** are specific trading strategies that USE pattern detection as their primary entry signal.

### 5 Canonical Patterns (Detection Layer)

| Pattern | Detection Logic | Direction | Base Strength |
|---------|----------------|-----------|---------------|
| **PINBAR** | Wick > 2× body, wick opposite direction | BUY or SELL | 0.6 + wick ratio |
| **ENGULFING** | Body fully engulfs prior body | BUY or SELL | 0.65 + engulf ratio + volume bonus |
| **MORNING_STAR** | Bear → Doji → Bull, close > midpoint of bear | BUY only | 0.7 + recovery + gap bonus |
| **INSIDE_BAR** → mapped to ENGULFING | High < prevHigh AND Low > prevLow | Based on parent | 0.6 + compression |
| **THREE_SOLDIERS** → mapped to MORNING_STAR | 3 consecutive bullish, each closing higher | BUY only | 0.75 + total gain |

Timeframe weighting: 1h = 1.0, 15m = 0.8, 5m = 0.6.

### 4.1 Morning Star / Evening Star
**Canonical Regime**: BULL_STABLE, TRANSITION
**Key**: `morning_star`
**Signal Type**: PATTERN
**Pattern**: MORNING_STAR
**Secondary Metrics**: 3-bar sequence, momentum flip > 0.3%

Uses the Morning Star detection from pattern-recognizer.ts. Entry on completion of the 3-bar reversal sequence. Stop/target calculated from ATR (1.5× ATR stop, 2.5× ATR target).

### 4.2 Support Bounce
**Canonical Regime**: LOW_VOL_CHOP
**Key**: `support_bounce`
**Signal Type**: PATTERN
**Pattern**: PINBAR
**Secondary Metrics**: Price ≈ Local Min ± 1σ, Volume > 1.2× avg

Uses Pinbar detection near identified support levels. Requires price to be at or near a local minimum with volume confirmation.

### 4.3 Inside Bar Reversal
**Canonical Regime**: BEAR_VOLATILE
**Key**: `inside_bar_reversal`
**Signal Type**: PATTERN
**Pattern**: ENGULFING (canonical mapping)
**Secondary Metrics**: Parent > Child × 1.3, Breakout Volume > 1.5× avg

Uses Inside Bar / Engulfing detection in bearish volatile conditions. Looks for compression setups that break out with volume.

---

## 5. HYBRID Strategies (5)

**Hybrid Integration Service**: `server/services/hybrid-integration.ts` (239 lines, Directive 10.4)

Hybrid strategies are the confluence layer — they require BOTH a quant indicator condition AND a pattern formation to trigger. The Hybrid Integration Service is the "Intelligent Referee" that merges these signals.

### Ensemble Score Formula

```
HybridScore = quantConf × 0.4 + patternStrength × 0.4 + mlConf × 0.2
```

Minimum score: 0.65. Pattern decay: `effectiveStrength = strength × e^(-0.15 × Δt_candles)` with floor at 30%.

### 5.1 Pivot Shift
**Canonical Regime**: BULL_STABLE, TRANSITION
**Key**: `pivot_shift`
**Pattern**: MORNING_STAR
**Secondary Metrics**: RSI 45–55, ADX slope > 0.5

Quant confluence + Morning Star pattern at regime pivot points. Cross-regime strategy.

### 5.2 Reverse Impulse
**Canonical Regime**: BEAR_VOLATILE
**Key**: `reverse_impulse`
**Pattern**: PINBAR
**Secondary Metrics**: Volume > 1.5× avg, Momentum spike < −0.5%

Quant momentum reversal + Pinbar formation in bearish conditions.

### 5.3 Defensive Hedge
**Canonical Regime**: BEAR_VOLATILE
**Key**: `defensive_hedge`
**Pattern**: ENGULFING
**Secondary Metrics**: BTC Corr < 0.3, Vol Offset > 1σ

Quant decorrelation signal + Engulfing pattern. Defensive positioning when asset is decoupled from BTC.

### 5.4 Adaptive Flow
**Canonical Regime**: LOW_VOL_CHOP
**Key**: `adaptive_flow`
**Pattern**: TRI_STAR
**Secondary Metrics**: Momentum inversion ≥ 3, Volatility percentile > 70%

Quant flow analysis + Tri-Star/Doji pattern in sideways markets.

### 5.5 Volatility Edge
**Canonical Regime**: HIGH_VOL_IMPULSE
**Key**: `volatility_edge`
**Pattern**: ABCD
**Secondary Metrics**: Volatility Percentile > 80, Regime mismatch = True

Quant volatility breakout + ABCD pattern confirmation. Exploits volatility expansion.

### ⚠️ Current State: Hybrid Strategy Types in hybrid-integration.ts Are Legacy

The `selectHybridStrategy()` method in hybrid-integration.ts currently maps to legacy types: H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, H4_MOMENTUM_LINK. These do NOT match the canonical hybrid strategies (pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge). This mapping must be updated when DSS is rewired to the canonical map.

---

## 6. Strategy Filters (Shared Detection Library)

**File**: `server/services/strategy-filters.ts` (406 lines)
**Status**: ACTIVE — used by multiple strategies

| Filter | Used By | Purpose |
|--------|---------|---------|
| `detectRange()` | Breakout, Range Trading, Liquidity Trap | Find bounded price movements |
| `detectStopZone()` | Liquidity Trap | Identify stop-loss cluster levels |
| `isNearRoundNumber()` | General | Psychological price level proximity |
| `isConsolidating()` | Range Trading, Mean Reversion | Distinguish trending from ranging |

---

## 7. Drift Detection & Auto-Recalibration

**File**: `server/services/drift-detector.ts` (457 lines)
**Directive**: 8.8.4-L11
**Status**: ACTIVE-LOCKED

Monitors calibration parameter drift (α, β, σ) per strategy:

```
DriftScore = 0.6 × |Δβ| + 0.2 × |Δα| + 0.2 × |σ/σ_baseline - 1|
```

| Score | Status | Action |
|-------|--------|--------|
| < 0.15 | Stable | No action |
| 0.15 - 0.25 | Drifting | Warning + event log |
| > 0.25 | Recalibrating | Auto-recalibration via POST to localhost:5001 |

Check cycle: every 15 minutes. History: 10-snapshot rolling window. Persistence: disk-based JSON + event logs. Respects `retrainingFreezeController`.

---

## 8. Strategy Features (Enhancement Layer)

**File**: `server/services/strategy-features.ts` (371 lines)
**Directive**: REB 2.12D Part C
**Status**: ACTIVE

Three confidence adjustments applied to signals:

| Feature | Adjustment | Source |
|---------|-----------|--------|
| Multi-Timeframe Confirmation | ±10% | SMA5/SMA10 on 15m, 1h timeframes |
| Liquidity Factor | 0.8× penalty if score < 0.3 | Volume 24h, spread bps, depth |
| Volatility Weight | −10% to +5% | Realized vol regime (low/normal/high/extreme) |

---

## 9. Support Infrastructure

### Strategy Validator (509 lines)
Synthetic testing engine — generates test price patterns and validates strategy signal generation.

### Strategy Validators (149 lines)
Zod schema definitions for all 8 core strategy parameter sets with runtime bounds validation.

### Strategy Analytics (263 lines)
Per-strategy performance metrics: cumulative P/L, rolling Sharpe (7-day), max drawdown, win rate, trade frequency.

### Strategy Alerts (188 lines)
Event logging with severity levels (INFO/WARNING/CRITICAL). In-memory buffer, max 1000 alerts.

### Strategy Sync (111 lines)
Ensures all core strategies exist in strategy_settings on startup. **Note**: Currently syncs only the 8 quant strategies — does NOT include pattern or hybrid strategies. Must be updated when canonical map is wired.

### Strategy Signal Audit Engine (160 lines)
**⚠️ LEGACY**: Recomputes NGC/CWQI/DI using stale formulas that don't match the pipeline. Since NGC is legacy (Kyle-confirmed), this engine's purpose is questionable. See CHANGES_AND_FIXES.md RISK-011.

### Provenance Governance (564 lines)
Daily governance reporting: data freshness, provenance coverage, schema binding validation, learning alignment metrics.

### Pattern Recognition Preloader (66 lines)
VTS warm-up preloader — ensures pattern detection is initialized with ≥2000 candles before simulation.

---

## 10. Exit Condition Engine

**File**: `server/services/strategy-engine.ts`, `checkExitConditions()` method

| Strategy | Additional Exit Condition |
|----------|--------------------------|
| vwap_pullback | Price closes below current VWAP |
| abcd_long | Price drops 0.5% below entry |
| sma_trend_ride | Price closes below current SMA |
| breakout | Price closes below breakout level × 0.995 |
| mean_reversion | None (stop/target only) |
| range_trading | Price breaks above resistance × 1.002 |
| vwap_bounce | Price closes below current VWAP |
| liquidity_trap | Price goes above trap level × 1.002 |

**Note**: Exit logic currently only covers the 8 quant strategies. Pattern and hybrid strategies do not have strategy-specific exit conditions — they rely on stop/target only.

---

## Critical Findings

### BUG-006: DSS Uses Legacy SYSTEM_GUARDS.STRATEGY_MAP Instead of Canonical Map

**Location**: `server/services/dynamic-strategy-selector.ts` (line 180)
**Severity**: CRITICAL
**Problem**: DSS imports `SYSTEM_GUARDS.STRATEGY_MAP` — a legacy 6-regime / 9-quant-only map. The canonical source of truth (`canonical-regime-strategy-map.ts`, Directive 11.7F) defines 5 regimes and 17 strategies (9 quant + 3 pattern + 5 hybrid) but is NOT wired to DSS runtime.

**Consequences**:
- Pattern strategies (morning_star, support_bounce, inside_bar_reversal) are never generated
- Hybrid strategies (pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge) are never generated
- Only QUANT signals flow through the trading pipeline
- Regime classification uses wrong model (6 legacy regimes vs 5 canonical)
- Per-regime riskMultiplier and minConfidence from canonical map are not applied

**Fix**: Rewire DSS to import from `canonical-regime-strategy-map.ts`:
1. Replace `SYSTEM_GUARDS.STRATEGY_MAP` import with `CANONICAL_REGIME_STRATEGY_MAP`
2. Update regime classification to use canonical thresholds (momentum + ADX + volatility)
3. Use `selectContextAwareStrategy()` for pattern-aware routing
4. Apply canonical `riskMultiplier` and `minConfidence` per regime
5. Remove EXTREME_NOISE as a regime — canonical model uses HIGH_VOL_IMPULSE for high volatility

**Timing**: Pre-MCE — this is a foundational routing fix, not dependent on MCE.

### BUG-007: Hybrid Strategy Types in hybrid-integration.ts Are Legacy

**Location**: `server/services/hybrid-integration.ts`, `selectHybridStrategy()` method
**Severity**: HIGH
**Problem**: The method maps to legacy types (H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, H4_MOMENTUM_LINK) that don't exist in the canonical map. The canonical hybrids are: pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge.
**Fix**: Replace `selectHybridStrategy()` with canonical hybrid selection logic.
**Timing**: Concurrent with BUG-006 fix.

### RISK-011: Strategy Signal Audit Engine Uses Stale Metric Definitions

**Severity**: MEDIUM
**Problem**: Recomputes NGC/CWQI/DI using simplified formulas that don't match pipeline. NGC is legacy.
**Timing**: During MCE — remove or rebuild.

### RISK-012: Static Confidence Values Reduce FinalScore Discrimination

**Severity**: LOW
**Problem**: 7 of 9 quant strategies return hardcoded confidence (0.65–0.75). Only VWAP Pullback and DHMA produce variable confidence.
**Timing**: Post-MCE enhancement.

### RISK-013: Oversimplified Bullish Reversal Detection

**Severity**: LOW
**Problem**: Volume check is `volume > 0` — trivially true.
**Fix**: Compare volume to 1.5× average.
**Timing**: Pre-MCE (simple fix).

### RISK-014: Strategy Sync Only Covers 8 Quant Strategies

**Severity**: MEDIUM
**Problem**: `strategy-sync.ts` CORE_STRATEGIES list only includes 8 quant strategies. When canonical map is wired, the sync must include all 17 strategies (9 quant + 3 pattern + 5 hybrid).
**Fix**: Update CORE_STRATEGIES to match `getAllCanonicalStrategies()` from canonical map.
**Timing**: Concurrent with BUG-006 fix.

### RISK-015: strategy_key Mismatch: `range_trading` vs `range_trade`

**Severity**: LOW
**Problem**: Strategy engine uses `range_trading` as the strategy key, but canonical map uses `range_trade`. This mismatch could cause routing failures when canonical map is wired.
**Fix**: Reconcile naming — either update strategy engine or canonical map to use consistent key.
**Timing**: Concurrent with BUG-006 fix.

### BUG-008: Four Parallel Regime Classification Systems With No Cross-Reference

**Severity**: CRITICAL
**Locations**: `dynamic-strategy-selector.ts` (Engine 1), `market-regime.ts` (Engines 2 & 3), `market-profiler.ts` + `adaptive-regime.ts` (Engine 4)
**Problem**: Four independent regime classification systems use three naming conventions (legacy 6-regime, canonical 5-regime, T1-C1 taxonomy) with zero cross-referencing. VTS learns from Engine #2 while active trading uses Engine #1. Engine #4 (MCP/ARE) feeds 14+ services with its own strategy mix matrix that doesn't reference the canonical map. The system cannot agree on what market conditions it's trading in.
**Fix**: See "Recommended Regime Architecture" section above. Engine #2 (`calculatePairRegime`) becomes pair-level authority. Engine #4 (MCP) continues at market-level scope. Engine #1 (DSS legacy) is removed. Engine #3 (Z-Score) preserved for ML. A formal cross-reference mapping between T1-C1 and canonical 5-regime names should be created.
**Timing**: Pre-MCE — resolve regime authority BEFORE wiring canonical map.

### RISK-016: MCP/ARE Legacy System Creates Parallel Strategy Authority (Kyle Confirmed Legacy)

**Severity**: HIGH
**Location**: `server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`
**Problem**: MCP/ARE operates as a parallel regime-to-strategy system — a predecessor that was never decommissioned when the canonical map and DSS were built to replace it. Its strategy mix matrix, exposure/risk multipliers, and regime classifications all operate independently of and unaligned with the canonical system.
**Kyle Decision (2026-02-16)**: MCP/ARE is LEGACY. Must be removed entirely. 14+ consumer services must be migrated.
**Timing**: During/after MCE (Wave 6).

### RISK-019: MCP Uses Stubbed Metrics (Further Evidence of Legacy Status)

**Severity**: HIGH
**Location**: `server/services/market-profiler.ts`, `classifyRegime()` method
**Problem**: `volume_z = 0` and `correlation = 0.5` are hardcoded stubs — never computed from market data. The system was locked before implementation was finished. 2 of 5 input dimensions carry phantom values, creating false regime confidence for 14+ downstream services.
**Fix**: Remove MCP/ARE entirely (Kyle-confirmed legacy). Do NOT invest in fixing stubbed metrics for a system being removed.
**Timing**: During Wave 6 (MCP/ARE removal).

### RISK-020: MCP/ARE Is Legacy Predecessor, Never Decommissioned (Kyle Confirmed)

**Severity**: HIGH
**Location**: `server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`
**Historical Context**: Built Dec 27, 2025 under Directive 8.8.4-L12. Immediately locked. Canonical regime map (Jan 2026, Directive 11.7F) and DSS built to replace it. Lock made MCP/ARE invisible during architectural discussions. Left running in background feeding 14+ services while newer systems were built alongside it.
**Kyle Decision (2026-02-16)**: It was never the intention to have two systems creating signals and making adjustments to signal generation. MCP/ARE must be removed.
**Timing**: During/after MCE (Wave 6) — DANGEROUS due to 14+ active importers.

### RISK-017: Bridge JSON Staleness Risk

**Severity**: MEDIUM
**Location**: `bridge/canonical/mapping-regime-strategy.json` + `server/core/strategy-mapper.ts`
**Problem**: `mapping-regime-strategy.json` is generated by `sync-canonical-bridge.ts` from the canonical TS map. If the TS map is updated but the bridge sync script is not re-run, `strategy-mapper.ts` (which imports the JSON) serves stale data at runtime. No automated staleness check exists.
**Fix**: Either (a) add a hash/version comparison check at startup that warns if JSON is stale, or (b) have `strategy-mapper.ts` import directly from the TS file instead of JSON.
**Timing**: Concurrent with BUG-006 fix.

### RISK-018: Drift Detector Has No Calibration Baselines for Pattern/Hybrid Strategies

**Severity**: MEDIUM
**Location**: `server/services/drift-detector.ts`
**Problem**: Drift detector monitors α/β/σ calibration drift per strategy using a 10-snapshot rolling window. When canonical map is wired and 8 new strategies (3 pattern + 5 hybrid) start generating signals, the drift detector will have no historical baselines for these strategies. First drift check will either error, skip them, or report all as drifted (depending on null handling).
**Fix**: Initialize baseline snapshots for new strategies during the canonical wiring deployment. Consider a warm-up period where drift detection is advisory-only for newly added strategies.
**Timing**: Concurrent with BUG-006 fix.

---

## Active Files Documented

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| canonical-regime-strategy-map.ts | 680 | SSOT: 5 regimes, 17 strategies | DEFINED (not wired to DSS) |
| market-regime.ts | — | Engines #2 & #3: calculatePairRegime + getNormalizedRegime | ACTIVE (VTS only) |
| market-profiler.ts | — | Engine #4: MCP Market Condition Profiler (T1-C1) | LEGACY — Kyle confirmed, remove (Wave 6) |
| adaptive-regime.ts | — | Engine #4: ARE strategy mix + exposure multipliers | LEGACY — Kyle confirmed, remove (Wave 6) |
| mapping-regime-strategy.json | 42 | Bridge copy of canonical map | ACTIVE (staleness risk) |
| strategy-mapper.ts | 50 | Canonical enforcement layer | ACTIVE |
| dynamic-strategy-selector.ts | 214 | Engine #1: legacy regime classification + routing | LEGACY (must replace) |
| strategy-engine.ts | 999 | 8 core quant strategies | ACTIVE |
| dhma.ts | 657 | DHMA microstructure strategy | ACTIVE |
| pattern-recognizer.ts | 481 | 5 candlestick pattern detectors | ACTIVE-LOCKED |
| pattern-recognition.ts | 66 | Pattern preloader for VTS | ACTIVE |
| hybrid-integration.ts | 239 | Quant+Pattern confluence scoring | ACTIVE (legacy hybrid types) |
| strategy-filters.ts | 406 | Reusable detection filters | ACTIVE |
| drift-detector.ts | 457 | Calibration drift monitoring | ACTIVE-LOCKED |
| strategy-features.ts | 371 | MTF/liquidity/volatility enhancement | ACTIVE |
| strategy-validator.ts | 509 | Synthetic testing engine | ACTIVE |
| strategy-validators.ts | 149 | Zod parameter schema validation | ACTIVE |
| strategy-analytics.ts | 263 | Performance metrics | ACTIVE |
| strategy-alerts.ts | 188 | Event logging | ACTIVE |
| strategy-sync.ts | 111 | Strategy initialization (quant only) | ACTIVE (incomplete) |
| strategy-signal-audit-engine.ts | 160 | Signal metric verification | LEGACY |
| provenance-governance.ts | 564 | Governance reporting | ACTIVE |

**Total**: 22 files (~6,606+ lines for strategy files, plus regime engine files)

---

### Revision History

| Date | Version | Change | Trigger |
|------|---------|--------|---------|
| 2026-02-15 | v1 | Initial deep-dive | Phase 2 audit |
| 2026-02-16 | v2 | Complete rewrite: canonical map as SSOT, legacy DSS flagged as BUG-006, pattern/hybrid strategies documented as first-class, legacy hybrid types flagged as BUG-007 | Kyle review corrections |
| 2026-02-16 | v3 | Regime authority expansion: identified 4th regime engine (MCP/ARE), documented all 4 engines with consumers, added regime authority recommendation, added BUG-008/RISK-016/RISK-017/RISK-018, clarified BUG-006 fix path (use calculatePairRegime directly), verified ChatGPT's mlConf/NGC claim was incorrect | ChatGPT/Replit feedback incorporation |
| 2026-02-16 | v3.1 | MCP/ARE identified as legacy predecessor: stubbed metrics (RISK-019), pre-canonical design (RISK-020), parallel strategy authority (RISK-016). Initial decision was surgical re-scope. | ChatGPT MCP/ARE deep analysis |
| 2026-02-16 | v3.2 | MCP/ARE reclassified as LEGACY for full removal (Kyle confirmed). Engine 4 status changed from RE-SCOPE to REMOVE. Recommended architecture updated: Layer 2 changed from MCP re-scope to MCP removal + portfolio modulation absorbed by MCE. All RISK-016/019/020 updated to reflect removal not re-scope. Wave 6 in deprecation plan updated to full removal. | Kyle decision + Replit historical analysis |

---

*End of Phase 2: Strategy Deep-Dives — Version 3*
