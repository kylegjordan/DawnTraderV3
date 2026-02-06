# DawnTrader V3.1: Current State Reference Document
## Paper Trading Engine Architecture, Strategies, Guardrails & System Components

**Document Created:** December 12, 2025  
**Last Updated:** February 6, 2026  
**Purpose:** Comprehensive reference for the paper trading engine and all configurable components  
**Current Status:** Phase 11.8D1 Complete (Filter Authority Cleanup)

---

# Table of Contents

**Part I: Core Engine Architecture**
1. [Trading Engine Overview](#1-trading-engine-overview)
2. [Symbol Canonicalization](#2-symbol-canonicalization)
3. [Price Cache & Market Data](#3-price-cache--market-data)
4. [FX5 Scanner & Adaptive Scanning](#4-fx5-scanner--adaptive-scanning)
5. [Market Regime Detection](#5-market-regime-detection)
6. [Signal Orchestrator](#6-signal-orchestrator)
7. [Virtual Trade Simulator (VTS)](#7-virtual-trade-simulator-vts)
8. [RTB Refresh System](#8-rtb-refresh-system)
9. [Paper Execution Engine](#9-paper-execution-engine)

**Part II: Strategy & Regime System**
10. [5-Class Regime Model](#10-5-class-regime-model)
11. [17 Strategy Catalog](#11-17-strategy-catalog)
12. [Signal Types & Patterns](#12-signal-types--patterns)
13. [Dynamic Strategy Selector](#13-dynamic-strategy-selector)

**Part III: Risk & Configuration**
14. [Trade Safety Checks](#14-trade-safety-checks)
15. [Guardrails System](#15-guardrails-system)
16. [IMF Thresholds & Macro Adjustments](#16-imf-thresholds--macro-adjustments)
17. [Screener Filters](#17-screener-filters)

**Part IV: Telemetry & Learning**
18. [Telemetry Aggregator](#18-telemetry-aggregator)
19. [Adaptive Pool Management](#19-adaptive-pool-management)
20. [ML Calibration](#20-ml-calibration)

**Part V: UI & Monitoring**
21. [Dashboard Tabs](#21-dashboard-tabs)
22. [Analytics & Diagnostics](#22-analytics--diagnostics)

---

# PART I: CORE ENGINE ARCHITECTURE

---

# 1. Trading Engine Overview

## 1.1 What Is DawnTrader?

DawnTrader is a **long-only, spot-trading cryptocurrency day trading platform** for the Kraken exchange. It features:

- Real-time market scanning (1400+ pairs, 100 pairs/cycle)
- 17 trading strategies across 3 signal types
- 5-class market regime detection with Z-Score normalization
- Dual-pool adaptive scanning (Ideal + Rotational)
- Institutional Math Filters (IMF) with macro-state adjustments
- Paper and live trading modes
- AI-powered analysis and optimization

## 1.2 Current System Status

| Component | Status | Version |
|-----------|--------|---------|
| **Paper Trading Engine** | ✅ Production Ready | Phase 11.8C |
| **Live Trading Engine** | ✅ Ready for Testing | Phase 11.8C |
| **VTS (Virtual Simulator)** | ✅ Active | Phase 11.8C |
| **Z-Score Normalization** | ✅ Integrated | 11.5 |
| **Macro-State Detection** | ✅ Active | 11.5 |
| **Profitability Gate** | ✅ Enforced | 11.5 |
| **Net Expectancy Kernel** | ✅ Sole Authority | 11.8B-A |
| **Phase 11 Predictive Learning** | ✅ Sole Authority | 11.8 |
| **Regime Archive System** | ✅ Active | 11.7E |

## 1.3 Decommissioned Systems (Phase 11.8)

| System | Removal Date | Replacement |
|--------|--------------|-------------|
| LATTi/Heuristic Trader | 2026-02-03 | Phase 11 Predictive Learning |
| Goals ML Engine | 2026-02-04 | Phase 11 Predictive Learning |
| Adaptive Risk Advisor | 2026-02-04 | Manual guardrail configuration |
| DHMA Tuning Service | 2026-02-04 | Phase 11 ML Calibration |
| Strategy Presets | 2026-02-04 | Guardrails & Filters |
| Goals Presets | 2026-02-04 | Manual guardrail configuration |
| Purpose Tab | 2026-02-04 | Removed (decorative only) |
| updateScreeners() | 2026-02-06 | /api/filters-v2 (sole write path) |
| /api/screeners endpoints | 2026-02-06 | /api/filters-v2 (410 Gone) |
| NLAI screener liquidity action | 2026-02-06 | Deleted (no replacement) |
| Per-filter override system | 2026-02-06 | Removed (all filters manual) |

## 1.4 Authority Model

| Authority | Location | Scope |
|-----------|----------|-------|
| **Net Expectancy Kernel** | `server/core/calculations/net-expectancy-kernel.ts` | All EV calculations |
| **Phase 11 Predictive Learning** | `server/core/calibration/*` | All parameter adjustment |
| **System Guards** | `server/config/system-guards.ts` | Immutable thresholds |
| **Score Weights** | `server/config/score-weights.config.ts` | FinalScore coefficients |
| **Strategy Governance** | `server/config/strategy-governance.ts` | Strategy dependencies |
| **Filter Write Authority** | `PUT /api/filters-v2` | Sole screener filter write path |

## 1.5 Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| `SLIPPAGE_PERCENT` | 0.15% | `paper-execution-engine.ts` |
| `FEE_PERCENT` | 0.10% | `paper-execution-engine.ts` |
| `PAIRS_PER_SCAN` | 100 | `adaptive-scan-manager.ts` |
| `IDEAL_POOL_RATIO` | 60% | `adaptive-ratio-manager.ts` |
| `ROTATIONAL_POOL_RATIO` | 40% | `adaptive-ratio-manager.ts` |
| `FX5_SCAN_INTERVAL` | 30 seconds | `fx5-scanner.ts` |
| `RTB_BUCKET_INTERVAL` | 15 seconds | `rtb-refresh-service.ts` |
| `POSITION_MONITOR_INTERVAL` | 1.5 seconds | `paper-execution-engine.ts` |
| `VTS_CYCLE_INTERVAL` | 60 seconds | `vts-runner.ts` |
| `Z_SCORE_WINDOW` | 300 periods | `rolling-stats.ts` |
| `Z_SCORE_WARMUP` | 30 samples | `market-regime.ts` |

---

# 2. Symbol Canonicalization

## 2.1 Purpose

Ensures consistent symbol naming across all subsystems by translating between Kraken's exchange format and canonical BASE/QUOTE format.

**File:** `server/services/utils/symbol-canonicalizer.ts`

## 2.2 Format Translation

| Kraken Format | Canonical Format |
|---------------|------------------|
| `XXBTZUSD` | `BTC/USD` |
| `XETHZUSD` | `ETH/USD` |
| `SOLUSD` | `SOL/USD` |
| `XXDGZUSD` | `DOGE/USD` |

## 2.3 Usage

All subsystems must use canonical format. The canonicalizer is called at system boundaries (API ingestion, data storage, UI display).

---

# 3. Price Cache & Market Data

## 3.1 Unified Price Cache

**File:** `server/services/price-cache.ts`

Single source of truth for all price data with rate limiting.

### 3.1.1 Cache Buckets

| Bucket | Refresh | Purpose |
|--------|---------|---------|
| `openTrade` | 2s | Active position monitoring |
| `readyToBuy` | 15s | RTB signal refresh |
| `fx5Snapshot` | 30s | Scanner price data |
| `vtsSimulation` | 60s | VTS cache (isolated) |

### 3.1.2 Rate Limiting

- Max 10 weighted requests/second
- Token-bucket per symbol
- Automatic cooldown management

## 3.2 OHLC Cache

**File:** `server/core/cache/ohlc-cache.ts`

- 721 candles per symbol (5-minute intervals)
- Used for IMF and regime calculations
- TTL-based refresh (5 minutes)

---

# 4. FX5 Scanner & Adaptive Scanning

## 4.1 FX5 Scanner

**File:** `server/services/fx5-scanner.ts`

Runs every 30 seconds, scanning 100 pairs per cycle.

### 4.1.1 Scan Flow

1. Get batch from Adaptive Scan Manager
2. Calculate IMF metrics (LQ, VolNoise, DI, Sigma)
3. Apply filter thresholds (with macro adjustments)
4. Classify survivors vs filtered
5. Update Stage-3 cache
6. Trigger VTS if engine stopped

## 4.2 Adaptive Scan Manager

**File:** `server/services/adaptive-scan-manager.ts`

Manages dual-pool pair selection:

| Pool | Allocation | Criteria |
|------|------------|----------|
| **Ideal** | 60% (54-60 pairs) | Top telemetry performers |
| **Rotational** | 40% (40-46 pairs) | Diversity exploration |

### 4.2.1 Pair Failure Tracking

- Cooldown blacklist for failing pairs
- TTL-based expiry
- Automatic recovery

---

# 5. Market Regime Detection

## 5.1 5-Class Model

**File:** `server/core/metrics/market-regime.ts`

| Regime | Momentum | ADX | Volatility |
|--------|----------|-----|------------|
| `BULL_STABLE` | > 0.005 | > 25 | < 0.025 |
| `BEAR_VOLATILE` | < -0.005 | > 25 | > 0.03 |
| `LOW_VOL_CHOP` | |mom| < 0.002 | < 20 | < 0.015 |
| `HIGH_VOL_IMPULSE` | > 0.010 | > 30 | > 0.03 |
| `TRANSITION` | default | - | - |

## 5.2 Z-Score Normalization

**File:** `server/utils/rolling-stats.ts`

- 300-period rolling window
- Z-Score: `(value - mean) / stdDev`
- 30-sample warmup requirement
- Adaptive thresholds per pair

## 5.3 Macro-State Detection

**File:** `server/core/metrics/macro-state.ts`

Uses rolling Z-scores of aggregate market metrics (300-period window, 30-sample warmup):

| Condition | Z-Score Detection | IMF Adjustments |
|-----------|-------------------|-----------------|
| `NORMAL` | Default (no thresholds exceeded) | Standard thresholds |
| `VOLATILITY_EXPANSION` | avgVolatilityZ > 2 | LQ × 1.2, VolNoise × 0.8 |
| `LIQUIDITY_CRUNCH` | liquidityZ < -1 | LQ × 1.5 |
| `SPECULATIVE_SURGE` | correlationZ > 1.5 | LQ × 1.1, VolNoise × 0.7 |

---

# 6. Signal Orchestrator

**File:** `server/services/signal-orchestrator.ts`

Runs every 30 seconds, evaluating strategies for all pairs.

## 6.1 Signal Flow

1. Get pairs from scan batch
2. Calculate regime (Z-Score normalized)
3. Apply macro-state adjustments
4. Select strategies via DSS
5. Compute FinalScore
6. Validate profitability gate
7. Route to RTB queue

## 6.2 FinalScore Formula

```
FinalScore = (
  confidence × 0.35 +
  regimeWeight × 0.25 +
  liquidityScore × 0.20 +
  momentumScore × 0.15 +
  patternScore × 0.05
) × riskAdjustment
```

## 6.3 Profitability Gate

**File:** `server/core/calculations/expectancy.ts`

```
grossProfit = (targetPrice - entryPrice) / entryPrice
totalCost = (feeRate × 2) + (spread × 1.1) + slippage
REQUIRED: grossProfit > totalCost
```

---

# 7. Virtual Trade Simulator (VTS)

**Files:** `server/services/vts-runner.ts`, `server/services/vts-service.ts`

## 7.1 Purpose

Generates virtual trades during passive learning, feeding telemetry without affecting real trading.

## 7.2 VTS Cycle

- Triggered when engine is STOPPED
- 60-second simulation cycles
- Uses isolated cache bucket
- Writes to telemetry only

## 7.3 Strategy-Specific Guardrails

| Strategy | Guardrail |
|----------|-----------|
| `sma_trend_ride` | ADX > 25 required |

---

# 8. RTB Refresh System

**File:** `server/services/rtb-refresh-service.ts`

## 8.1 Architecture

| Property | Value |
|----------|-------|
| Micro-cycle | 15 seconds |
| Macro-cycle | 120 seconds (8 buckets) |
| Concurrency | Adaptive (3-10 workers) |

## 8.2 Adaptive Concurrency Tuner (ACT)

- Scale UP: avgCpu < 55% AND duration < 5000ms
- Scale DOWN: avgCpu > 60% OR duration > 8000ms
- Lag Protection: eventLoopLag > 2ms → force reduce

---

# 9. Paper Execution Engine

**File:** `server/services/paper-execution-engine.ts`

## 9.1 Entry Processing

1. Receive signal from RTB
2. Run 8-step safety checks
3. Apply entry slippage (0.15%)
4. Apply entry fee (0.10%)
5. Create trade + position records
6. Subscribe to price updates

## 9.2 Exit Monitoring (1.5s cycle)

1. Fetch live price
2. Check adaptive trailing stop
3. Check take-profit
4. Apply exit costs
5. Calculate P/L
6. Update records

---

# PART II: STRATEGY & REGIME SYSTEM

---

# 10. 5-Class Regime Model

## 10.1 Regime Definitions

| Regime | Description | Risk Multiplier | Min Confidence |
|--------|-------------|-----------------|----------------|
| `BULL_STABLE` | Sustained uptrend, low vol | 1.0 | 0.60 |
| `BEAR_VOLATILE` | Downtrend, high turbulence | 0.5 | 0.75 |
| `LOW_VOL_CHOP` | Range-bound, no direction | 0.8 | 0.65 |
| `HIGH_VOL_IMPULSE` | Breakout, violent expansion | 0.7 | 0.70 |
| `TRANSITION` | Reversal zone, weakening trend | 0.6 | 0.70 |

## 10.2 Regime Metrics

| Regime | Momentum | ADX | Volatility |
|--------|----------|-----|------------|
| `BULL_STABLE` | > 0.005 | > 25 | < 0.025 |
| `BEAR_VOLATILE` | < -0.005 | > 25 | > 0.03 |
| `LOW_VOL_CHOP` | |mom| < 0.002 | < 20 | < 0.015 |
| `HIGH_VOL_IMPULSE` | > 0.010 | > 30 | > 0.03 |
| `TRANSITION` | ±0.004 | 20-25 | 0.015-0.03 |

---

# 11. 17 Strategy Catalog

**File:** `server/config/canonical-regime-strategy-map.ts`

## 11.1 QUANT Strategies (8)

| Strategy | Key | Regime Affinity | Secondary Metrics |
|----------|-----|-----------------|-------------------|
| SMA Trend Ride | `sma_trend_ride` | HIGH_VOL_IMPULSE | ADX > 25, SMA(50) > SMA(100) |
| VWAP Pullback | `vwap_pullback` | BULL_STABLE | VWAP proximity |
| Breakout | `breakout` | HIGH_VOL_IMPULSE | Volume confirm |
| Mean Reversion | `mean_reversion` | LOW_VOL_CHOP | Bollinger width |
| Range Trade | `range_trade` | LOW_VOL_CHOP | S/R levels |
| Momentum Surge | `momentum_surge` | HIGH_VOL_IMPULSE | RSI, momentum |
| Volatility Breakout | `volatility_breakout` | HIGH_VOL_IMPULSE | ATR expansion |
| Trend Follow | `trend_follow` | BULL_STABLE | EMA alignment |

## 11.2 PATTERN Strategies (5)

| Strategy | Key | Pattern Types | Regime Affinity |
|----------|-----|---------------|-----------------|
| Support Bounce | `support_bounce` | PINBAR, ENGULFING | LOW_VOL_CHOP |
| Resistance Break | `resistance_break` | ENGULFING | HIGH_VOL_IMPULSE |
| Pivot Shift | `pivot_shift` | MORNING_STAR | TRANSITION |
| Morning Star | `morning_star` | MORNING_STAR | BEAR_VOLATILE |
| Engulfing Reversal | `engulfing_reversal` | ENGULFING | Any |

## 11.3 HYBRID Strategies (4)

| Strategy | Key | Description | Regime Affinity |
|----------|-----|-------------|-----------------|
| Adaptive Flow | `adaptive_flow` | Quant + Pattern | All |
| Momentum Pattern | `momentum_pattern` | Momentum + pattern confirm | BULL_STABLE |
| Volatility Pattern | `volatility_pattern` | Breakout + patterns | HIGH_VOL_IMPULSE |
| Regime Switch | `regime_switch` | Cross-regime | TRANSITION |

---

# 12. Signal Types & Patterns

## 12.1 Signal Types

| Type | Description | Strategy Count |
|------|-------------|----------------|
| `QUANT` | Quantitative indicators | 8 |
| `PATTERN` | Candlestick patterns | 5 |
| `HYBRID` | Combined Quant + Pattern | 4 |

## 12.2 Pattern Types

| Pattern | Canonical Name | Description |
|---------|----------------|-------------|
| Pin Bar | `PINBAR` | Rejection wick |
| Engulfing | `ENGULFING` | Full body engulf |
| Morning Star | `MORNING_STAR` | 3-candle reversal |
| ABCD | `ABCD` | Harmonic pattern |
| Tri-Star | `TRI_STAR` | Doji sequence |

## 12.3 Pattern Normalization

Raw patterns are normalized to canonical types:
- `INSIDE_BAR` → `MORNING_STAR` (consolidation)
- Various reversal patterns → appropriate canonical

---

# 13. Dynamic Strategy Selector

**File:** `server/services/dynamic-strategy-selector.ts`

## 13.1 Selection Logic

1. Get current market regime
2. Filter strategies by regime affinity
3. Check secondary metric requirements
4. Apply Z-Score adjusted thresholds
5. Return compatible strategies

## 13.2 Regime-Strategy Mapping

| Regime | Preferred Strategies |
|--------|---------------------|
| BULL_STABLE | sma_trend_ride, vwap_pullback, trend_follow, momentum_pattern |
| BEAR_VOLATILE | morning_star (reversal only), defensive only |
| LOW_VOL_CHOP | range_trade, mean_reversion, support_bounce |
| HIGH_VOL_IMPULSE | breakout, momentum_surge, volatility_breakout, resistance_break |
| TRANSITION | pivot_shift, regime_switch, adaptive_flow |

---

# PART III: RISK & CONFIGURATION

---

# 14. Trade Safety Checks

**File:** `server/services/trade-safety.ts`

## 14.1 8-Step Sequence

| Step | Check | Blocking Condition |
|------|-------|-------------------|
| 1 | Kill Switch | `killSwitchTripped = true` |
| 2 | Stop-Loss Required | Missing SL price |
| 3 | Stop-Loss Valid | SL invalid range |
| 4 | Max Per Asset | Already holding symbol |
| 5 | Symbol Cooldown | Recent trade on symbol |
| 6 | Position Size Cap | Exceeds max position % |
| 7 | LPCP Protection | Low-probability override |
| 8 | Max Open Trades | At max positions |

---

# 15. Guardrails System

**Table:** `guardrails_v2`

## 15.1 Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `portfolioRiskPerTradePct` | 2% | Max risk per trade |
| `maxPositionPercentPct` | 10% | Max position size |
| `maxOpenPositions` | 5 | Max concurrent trades |
| `symbolCooldownMinutes` | 60 | Minutes between trades on same symbol |
| `dailyLossKillSwitchPct` | 5% | Daily loss limit |
| `maxTotalExposurePct` | 50% | Max portfolio exposure |

---

# 16. IMF Thresholds & Macro Adjustments

## 16.1 Base IMF Thresholds

| Metric | Threshold | Purpose |
|--------|-----------|---------|
| LQ (Log-Liquidity) | ≥ 40 | Minimum liquidity |
| VolNoise | ≤ 0.6 | Maximum noise |
| DI (Directional Integrity) | ≥ 45 | Trend strength |

## 16.2 Macro-State Adjustments

| Condition | LQ Multiplier | VolNoise Multiplier |
|-----------|---------------|---------------------|
| NORMAL | 1.0 | 1.0 |
| VOLATILITY_EXPANSION | 1.2 | 0.8 |
| LIQUIDITY_CRUNCH | 1.5 | 1.0 |
| SPECULATIVE_SURGE | 1.1 | 0.7 |

---

# 17. Screener Filters

**Table:** `screener_filters`  
**Write Authority:** `PUT /api/filters-v2` (sole path)  
**Read:** `GET /api/filters-v2` (returns `FilterParamV2[]` without authority flags)  
**Deprecated:** `/api/screeners` returns 410 Gone

| Filter | Type | Description |
|--------|------|-------------|
| `minPrice` | number | Minimum asset price |
| `maxPrice` | number | Maximum asset price |
| `minVolume` | number | Minimum 24h volume |
| `minLiquidity` | number | Minimum liquidity |
| `maxBidAskSpread` | number | Maximum bid-ask spread |
| `minMarketCap` | number | Minimum market cap |
| `excludeStablecoins` | boolean | Skip stablecoin pairs |
| `allowRegulatedOnly` | boolean | Regulated pairs only |
| `universeSize` | number | Market universe size |
| `activeTimeframes` | string[] | Active scanning timeframes |
| `confidenceThreshold` | number | Signal confidence threshold |
| `minHistoryDays` | number | Minimum trading history |

DB columns `managedByLottie`, `manualOverrideEnabled`, `filterOverrides` are FROZEN (preserved but unused at runtime).

---

# PART IV: TELEMETRY & LEARNING

---

# 18. Telemetry Aggregator

**File:** `server/services/telemetry-aggregator.ts`

## 18.1 Data Collection

- 24-hour rolling window per pair
- Win rate, avg P/L, trade count
- Strategy-specific metrics
- Regime-tagged outcomes

## 18.2 Pool Metrics

```typescript
{
  pool: 'ideal' | 'rotational',
  winRate: number,
  samples: number,
  avgFinalScore: number
}
```

---

# 19. Adaptive Pool Management

## 19.1 Adaptive Ratio Manager

**File:** `server/services/adaptive-ratio-manager.ts`

Dynamically adjusts Ideal/Rotational split:

- Default: 60% Ideal / 40% Rotational
- Range: 50-70% Ideal / 30-50% Rotational
- Based on: regime, win rates, confidence

## 19.2 Pool Selection

| Pool | Selection Criteria |
|------|-------------------|
| Ideal | Top telemetry scores, proven performers |
| Rotational | Diversity sampling, exploration |

---

# 20. ML Calibration

**File:** `server/services/ml-calibration.ts`

## 20.1 Performance Score

```
score = winRate × 0.4 + avgNetPL × 0.3 + consistency × 0.2 + regimeAlign × 0.1
```

## 20.2 Learning Feedback

- Edge delta tracking (expected vs actual)
- Adjustment recommendations
- Per-strategy calibration

---

# PART V: UI & MONITORING

---

# 21. Dashboard Tabs

| Tab | Purpose |
|-----|---------|
| **Overview** | Market indicators, regime, favored strategies |
| **Active Trades** | Open positions with live P/L |
| **Trade History** | Closed trade records |
| **Ready to Buy** | Pending signals in RTB queue |
| **Filter Insights** | FX5 scan results and filtering |
| **Analytics** | Performance charts and metrics |
| **Diagnostics** | System health and regime breakdown |

---

# 22. Analytics & Diagnostics

## 22.1 Market Regime Display

- Current global regime
- Per-pair regime breakdown
- Z-Score visualization

## 22.2 Friction Tiers

| Tier | Color | Description |
|------|-------|-------------|
| LOW | Green | < 0.3% total cost |
| MODERATE | Yellow | 0.3-0.5% total cost |
| HIGH | Orange | 0.5-0.8% total cost |
| EXTREME | Red | > 0.8% total cost |

## 22.3 Trading Activities Feed

Real-time log of:
- Signal generation events
- Trade entries/exits
- Regime changes
- System health updates

---

# Document History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-12 | 1.0 | Initial creation |
| 2026-01-08 | 1.5 | Phase 10 additions |
| 2026-01-18 | 2.0 | Complete overhaul for Phase 11 |
| 2026-02-05 | 3.0 | Phase 11.8C update: Authority unification, legacy decommission, decommissioned systems table, authority model |

---

*This document serves as the current state reference for DawnTrader V3.1. Consult the System Architecture document for deeper technical details.*
