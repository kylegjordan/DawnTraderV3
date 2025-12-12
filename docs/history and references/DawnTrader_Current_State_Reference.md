# DawnTrader V3: Current State Reference Document
## Strategies, Guardrails, Filters, Coherency Rules, Goals Presets & Control Modes

**Document Created:** December 12, 2025  
**Purpose:** Comprehensive reference for all configurable system components  
**Current Status:** Phase 8.8.3 (Trading Pipeline Functional)

---

# Table of Contents

1. [Trading Strategies](#1-trading-strategies)
2. [Guardrails System](#2-guardrails-system)
3. [LPCP Module](#3-lpcp-module-low-priced-coin-protection)
4. [Screener Filters](#4-screener-filters)
5. [Coherency Rules](#5-coherency-rules)
6. [Goals Presets](#6-goals-presets)
7. [LATTi vs Manual Control](#7-latti-vs-manual-control)
8. [Trade Safety Checks](#8-trade-safety-checks)

---

# 1. Trading Strategies

## 1.1 Strategy Overview

DawnTrader V3 implements **9 trading strategies**. All strategies are currently:
- ✅ **ACTIVE** in the trading engine
- ✅ **HEALTHY** (verified in Phase 8.8.3-A audit)
- ✅ **GUARDRAIL-COMPATIBLE**

All 9 strategies are evaluated every 30 seconds by the Signal Orchestrator.

## 1.2 Strategy Catalog

### Strategy 1: VWAP Pullback (`vwap_pullback`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | 0.70 - 0.90 |
| **Description** | Identifies VWAP pullback opportunities when price retraces to VWAP in trending markets |
| **Entry Logic** | Price above VWAP, pullback to VWAP within threshold, bullish reversal pattern, volume confirmation |
| **Exit Logic** | Price closes below VWAP |
| **Required Indicators** | `vwap`, `currentPrice`, `high24h`, `low24h`, `volume` |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `vwapPullbackThreshold` | 2.0% | Max deviation from VWAP for entry |
| `vwapVolumeMultiplier` | 1.5x | Volume must exceed average × multiplier |
| `vwapMaxHoldingPeriod` | 24 bars | Maximum holding period |

---

### Strategy 2: ABCD Long (`abcd_long`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | 0.75 |
| **Description** | Detects ABCD harmonic pattern for long entries with Fibonacci-based targets |
| **Entry Logic** | A=spike, B=pullback, C=higher low above VWAP, D=breakout above C high |
| **Exit Logic** | Fixed target or trailing stop (configurable) |
| **Required Indicators** | `currentPrice`, `high24h`, `low24h`, `volume` |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `abcdMinConsolidation` | 10 bars | Minimum consolidation period |
| `abcdBreakoutThreshold` | 1.5% | Breakout threshold above C high |
| `abcdVolumeMultiplier` | 1.5x | Volume confirmation multiplier |
| `abcdExitType` | "target" | Exit type: "target" or "trailing" |
| `abcdTargetPercent` | 3.0% | Fixed target percentage |
| `abcdTrailingStopPercent` | 2.0% | Trailing stop percentage |

---

### Strategy 3: SMA Trend Ride (`sma_trend_ride`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | 0.65 |
| **Description** | Trend-following strategy using SMA crossovers with ATR-based stops |
| **Entry Logic** | Price above SMA in uptrend, either crossover or bounce pattern |
| **Exit Logic** | Price closes below SMA or trailing stop hit |
| **Required Indicators** | `sma`, `currentPrice`, `volume` |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `smaLength` | 20 | SMA period length |
| `smaEntryCondition` | "above" | Entry: "above" or "crossover" |
| `smaExitCondition` | "break" | Exit: "break" or "trailing" |
| `smaTrailingStopPercent` | 2.0% | Trailing stop percentage |

---

### Strategy 4: Breakout (`breakout`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | 0.75 |
| **Description** | Identifies breakouts from consolidation with volume confirmation |
| **Entry Logic** | Price breaks above resistance after consolidation, volume spike |
| **Exit Logic** | Price returns below breakout level |
| **Required Indicators** | `currentPrice`, `high24h`, `low24h`, `volume` |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `minConsolidationBars` | 10 | Minimum consolidation period |
| `maxRangeWidth` | 3% | Maximum consolidation range width |
| `breakoutBuffer` | 1% | Buffer above resistance for entry |
| `volumeMultiplier` | 2x | Volume spike requirement |
| `maxHoldingHours` | 12 | Maximum holding period |

---

### Strategy 5: Mean Reversion (`mean_reversion`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | 0.70 |
| **Description** | Mean reversion trades when price deviates significantly from VWAP or SMA |
| **Entry Logic** | Price oversold (below mean by threshold), bullish reversal detected |
| **Exit Logic** | Price returns to mean |
| **Required Indicators** | `vwap`, `currentPrice`, `sma` |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `meanType` | "vwap" | Mean reference: "vwap", "sma", or "midpoint" |
| `smaLength` | 20 | SMA period (if meanType = "sma") |
| `deviationThreshold` | 2.5% | Minimum deviation for oversold |
| `partialExitPercent` | 50% | Partial profit-taking percentage |
| `stopLossBuffer` | 1% | Stop-loss buffer below entry |

---

### Strategy 6: Range Trading (`range_trading`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | 0.72 |
| **Description** | Range-bound trading between support and resistance levels |
| **Entry Logic** | Price near support in established range |
| **Exit Logic** | Price breaks above resistance (range invalidated) |
| **Required Indicators** | `currentPrice`, `high24h`, `low24h` |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `minRangeDurationHours` | 12 | Minimum range establishment time |
| `minRangeWidth` | 3% | Minimum range width percentage |
| `minBoundaryTouches` | 3 | Required touches at support/resistance |
| `entryZoneWidth` | 0.5% | Entry zone near support |
| `stopLossBeyond` | 1% | Stop-loss below support |

---

### Strategy 7: VWAP Bounce (`vwap_bounce`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | 0.73 |
| **Description** | Bounce trades off VWAP support/resistance with momentum confirmation |
| **Entry Logic** | VWAP trending up, price touched/bounced off VWAP, volume confirmation |
| **Exit Logic** | Price closes below VWAP (trend broken) |
| **Required Indicators** | `vwap`, `currentPrice`, `volume` |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `vwapProximity` | 0.5% | Maximum distance from VWAP for entry |
| `minVWAPSlope` | 0.3% | Minimum VWAP uptrend slope |
| `volumeMultiplier` | 1.3x | Volume confirmation multiplier |
| `maxPullbackBars` | 5 | Maximum bars for pullback |
| `partialExitR` | 1.5R | Partial profit-taking level |

---

### Strategy 8: Liquidity Trap (`liquidity_trap`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | 0.68 |
| **Description** | Detects liquidity traps and false breakouts for contrarian entries |
| **Entry Logic** | False breakout above resistance, quick return to range, volume reversal |
| **Exit Logic** | Price returns above trap level (setup invalidated) |
| **Required Indicators** | `currentPrice`, `high24h`, `low24h`, `volume` |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxTrapExtension` | 1.2% | Maximum extension above resistance |
| `trapReturnBars` | 2 | Maximum bars to return to range |
| `minStopZoneSize` | "medium" | Stop zone size: "small", "medium", "large" |
| `minLevelTouches` | 3 | Required resistance touches |
| `volumeRatio` | 1.5x | Reversal volume ratio |

---

### Strategy 9: DHMA - Dual-Horizon Microstructure Alpha (`dhma`)

| Attribute | Value |
|-----------|-------|
| **Status** | ✅ ACTIVE |
| **Confidence** | Variable (microstructure-adjusted) |
| **Description** | Dynamic Hull Moving Average strategy with multi-timeframe confirmation and microstructure analysis |
| **Entry Logic** | OBI > threshold, low toxicity, VWAP confirmation, multi-timeframe alignment |
| **Exit Logic** | Microstructure conditions reverse |
| **Required Indicators** | `currentPrice`, `volume`, `vwap`, `sma`, `high24h`, `low24h` |

**Special Features:**
| Feature | Description |
|---------|-------------|
| Multi-timeframe Confirmation | ±10% confidence adjustment based on timeframe alignment |
| Liquidity Factor Scoring | Dynamic scoring based on order book depth |
| Volatility Weighting | ATR-based volatility normalization |
| Microstructure Analysis | OBI, microprice tilt, signed flow ratio, toxicity detection |

**Configurable Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `theta_OBI` | 0.3 | Order Book Imbalance threshold |
| `epsilon_micro` | 0.2 | Microprice tilt threshold |
| `tau_toxicity` | 0.7 | Maximum toxicity threshold |
| `maxSpread` | 5 | Maximum spread filter |
| `k_tp` | 1.5 | Take-profit multiplier |
| `N_flow` | 50 | Signed flow lookback candles |
| `N_burst` | 10 | Burst regime candles |
| `window_session` | 20 | Session regime window |

**DHMA Tuning Service:**
- Located at `server/services/dhma-tuning-service.ts`
- Performs intelligent adaptive parameter optimization
- LATTi-managed when `dhmaTuningEnabled = true`

---

## 1.3 Strategy Signal Flow

```
FX5 Scanner (30s cycle)
    ↓
Active Filter Pool (filtered pairs)
    ↓
Signal Orchestrator (server/services/signal-orchestrator.ts)
    ├── Fetches tradeable pairs
    ├── Calculates indicators (VWAP, SMA, price levels)
    ├── Evaluates ALL 9 strategies via StrategyEngine
    ├── Filters by confidence threshold
    └── Applies guardrail validation
    ↓
Paper Execution Engine / Live Execution Engine
    ↓
Trade Creation → Position Monitoring → Trade Closure
```

---

# 2. Guardrails System

## 2.1 Guardrails Overview

The guardrails system (`guardrails_v2` table) provides **mode-isolated risk parameters** with coherency enforcement. Each mode (paper/live) has exactly one guardrails record.

**Source of Truth:** `server/services/guardrail-policy.ts`

## 2.2 Core Four Guardrails

| Guardrail | Column | Default (Paper) | Range | Description |
|-----------|--------|-----------------|-------|-------------|
| **Portfolio Risk per Trade %** | `portfolio_risk_per_trade_pct` | 1.50% | 0.10% - 5.00% | Percentage of portfolio risked per trade |
| **Symbol Cooldown** | `symbol_cooldown_minutes` | 15 min | 0 - 90 min | Cooldown before re-trading same symbol |
| **Max Open Positions** | `max_open_positions` | 5 | 1 - 20 | Maximum concurrent open positions |
| **Daily Loss Kill Switch %** | `daily_loss_kill_switch_pct` | 7.00% | 1.00% - 25.00% | Portfolio loss % triggering auto-shutdown |

## 2.3 Extended Guardrails

| Guardrail | Column | Default | Range | Description |
|-----------|--------|---------|-------|-------------|
| **Max Position %** | `max_position_percent_pct` | 30.00% | 1.00% - 100.00% | Maximum size of any single position as % of portfolio |
| **Max Total Exposure %** | `max_total_exposure_pct` | 25.00% | 10.00% - 100.00% | Maximum % of portfolio invested across all positions |

## 2.4 Kill Switch

| Field | Type | Description |
|-------|------|-------------|
| `kill_switch_tripped` | Boolean | Circuit breaker state (true = tripped) |
| `kill_switch_reason` | Text | Reason for kill switch activation |
| `kill_switch_tripped_at` | Timestamp | When kill switch was triggered |

**Kill Switch Behavior:**
- Automatically trips when daily loss exceeds `daily_loss_kill_switch_pct`
- Blocks all new trades until manually reset via trading toggle
- Persisted in database (survives server restart)
- Single source of truth (no legacy secondary kill switches)

## 2.5 Guardrails Location

- **Schema Definition:** `shared/schema.ts` (lines 300-361)
- **Policy Service:** `server/services/guardrail-policy.ts`
- **Trade Safety:** `server/services/trade-safety.ts`
- **Coherency Rules:** `audit/coherency_rules.yaml`

---

# 3. LPCP Module (Low-Priced Coin Protection)

## 3.1 Current Status

| State | Value |
|-------|-------|
| **Active in Trading** | ❌ **DORMANT** |
| **Structure Preserved** | ✅ Yes |
| **UI Displayed** | ✅ Yes (shows 0 blocks) |

**LPCP was made dormant in Phase 8.8.3-AJ8.** The `checkLowPricedCoinProtection()` function immediately returns `{ ok: true }` without executing any blocking logic. This preserves the interface for future phases.

## 3.2 LPCP Parameters (Schema Only)

| Parameter | Column | Default | Description |
|-----------|--------|---------|-------------|
| **Min Stop ATR Multiple** | `low_price_min_stop_atr_mult` | 3.0 | Minimum stop distance as ATR multiple |
| **Min Position Notional** | `low_price_min_position_notional` | $25.00 | Minimum USD value for low-priced trades |
| **Low Price Threshold** | `low_price_threshold` | $0.50 | Price threshold activating LPCP rules |

## 3.3 LPCP Block Reasons (Displayed but inactive)

| Reason Code | Description |
|-------------|-------------|
| `LPCP_LOW_PRICE` | Coin price below threshold |
| `LPCP_MIN_NOTIONAL` | Trade value below minimum |

---

# 4. Screener Filters

## 4.1 Filters Overview

Screener filters (`screener_filters` table) define **mode-isolated screening criteria** for the FX5 scanner. Each mode has exactly one filter configuration.

**Source of Truth:** `server/services/filtered-pairs-service.ts`

## 4.2 Filter Parameters

### Price & Volume Filters

| Filter | Column | Default | Description |
|--------|--------|---------|-------------|
| **Min Volume** | `min_volume` | $1,000,000 | Minimum 24h trading volume |
| **Min Price** | `min_price` | $0.01 | Minimum coin price |
| **Max Price** | `max_price` | $10,000 | Maximum coin price |
| **Min Liquidity** | `min_liquidity` | $500,000 | Minimum liquidity requirement |
| **Min Market Cap** | `min_market_cap` | $100,000,000 | Minimum market cap |

### Technical Filters

| Filter | Column | Default | Description |
|--------|--------|---------|-------------|
| **Max Bid-Ask Spread** | `max_bid_ask_spread` | 1.00% | Maximum spread percentage |
| **RSI Min** | `rsi_min` | 30 | RSI oversold threshold |
| **RSI Max** | `rsi_max` | 70 | RSI overbought threshold |
| **Volatility Min** | `volatility_min` | 0.50% | Minimum volatility |
| **Volatility Max** | `volatility_max` | 5.00% | Maximum volatility |

### Data Quality Filters

| Filter | Column | Default | Description |
|--------|--------|---------|-------------|
| **Min History Days** | `min_history_days` | 30 | Minimum trading history (30/60/90/180) |
| **Exclude Stablecoins** | `exclude_stablecoins` | true | Filter out stablecoins |
| **Allow Regulated Only** | `allow_regulated_only` | false | Only regulated pairs |

### Universe & Signal Controls (Phase 27.F.14)

| Filter | Column | Default | Description |
|--------|--------|---------|-------------|
| **Universe Size** | `universe_size` | 100 | Market universe size (25-150 pairs) |
| **Quote Currencies** | `quote_currencies` | ["USD"] | Allowed quote currencies |
| **Active Timeframes** | `active_timeframes` | ["5m", "15m", "1h"] | Trading timeframes |
| **Confidence Threshold** | `confidence_threshold` | 60% | Minimum signal confidence (40-90%) |

## 4.3 Filter Override Controls

| Field | Column | Default | Description |
|-------|--------|---------|-------------|
| **Managed by LATTi** | `managed_by_lottie` | true | LATTi manages filters globally |
| **Manual Override** | `manual_override_enabled` | false | User manual control enabled |
| **Locked by User** | `locked_by_user` | {} | Per-filter lock status (JSON) |
| **Filter Overrides** | `filter_overrides` | {} | Per-filter manual values (JSON) |
| **Last Updated By** | `last_updated_by` | null | "latti", "system", or user ID |

## 4.4 FX5 Scanner Architecture

- **Scan Interval:** 30 seconds
- **Batch Size:** 60 pairs (Top-N + Tier-B rotation)
- **Active Pool:** Survivors feed strategy evaluation
- **Passive Learning:** Pool stays empty when `passiveLearning=true`

---

# 5. Coherency Rules

## 5.1 Coherency Overview

Coherency rules (`audit/coherency_rules.yaml`) define validation rules ensuring **guardrail values remain mathematically consistent**. Rules are enforced on every guardrail update.

**Current Version:** v2.2-phase28efinal

## 5.2 Active Rules

| Rule ID | Name | Severity | Condition |
|---------|------|----------|-----------|
| **RULE_001** | Risk ≤ 50% × KillSwitch | ERROR | `portfolio_risk_per_trade_pct <= daily_loss_kill_switch_pct * 0.5` |
| **RULE_002** | Total Exposure ≤ 50% Cap | ERROR | `max_open_positions * portfolio_risk_per_trade_pct <= 50` |
| **RULE_003** | Cooldown ≥ 0 minutes | ERROR | `symbol_cooldown_minutes >= 0` |
| **RULE_004** | Cooldown Maximum | WARN | `symbol_cooldown_minutes <= 90` |
| **RULE_005** | Manual Override Exclusivity | ERROR | `NOT (is_manual_override AND tuned_by_latti)` |
| **RULE_006** | Portfolio Risk Range | ERROR | `portfolio_risk_per_trade_pct >= 0.10 AND <= 5.00` |
| **RULE_007** | Kill Switch ≤ 25% | ERROR | `daily_loss_kill_switch_pct >= 1.00 AND <= 25.00` |
| **RULE_008** | Max Positions Range | ERROR | `max_open_positions >= 1 AND <= 20` |
| **RULE_009** | Mode Isolation | ERROR | Exactly one guardrails record per mode |
| **RULE_010** | Learning Safety Caps | ERROR | Learning-adjusted values within caps |

## 5.3 Safety Caps (RULE_010)

| Parameter | Maximum Cap |
|-----------|-------------|
| `portfolio_risk_per_trade_pct` | 5.00% |
| `daily_loss_kill_switch_pct` | 25.00% |
| `symbol_cooldown_minutes` | 90 min |
| `max_open_positions` | 20 |

---

# 6. Goals Presets

## 6.1 Presets Overview

Goals presets (`goals_presets` table) provide **predefined risk profiles** for quick configuration. Each mode can have multiple presets with one active at a time.

## 6.2 Available Presets

| Preset Name | Description |
|-------------|-------------|
| **conservative** | Low risk, fewer trades, wider stops |
| **baseline** | Balanced risk/reward (default) |
| **optimistic** | Higher risk tolerance, more positions |
| **maximum** | Aggressive parameters (advanced users) |
| **custom** | User-defined values |

## 6.3 Preset Fields

| Field | Description |
|-------|-------------|
| `portfolio_risk_per_trade_pct` | Risk % per trade |
| `daily_loss_kill_switch_pct` | Kill switch threshold |
| `symbol_cooldown_minutes` | Symbol cooldown |
| `max_open_positions` | Position limit |
| `trades_per_day_est` | Estimated daily trades |
| `target_daily_avg_earning_pct` | Target daily return |
| `is_active` | Active preset for mode |
| `learning_active` | Whether learning engine manages this preset |

## 6.4 Adaptive Learning (Phase 6)

The **Goals Learning Engine** (`server/services/goals-learning-engine.ts`) automatically adjusts preset boundaries:

**Trigger Condition:** 30-day average return ≥ 80% of target ceiling  
**Expansion Rate:** 5% increase per adjustment  
**Safety Caps:** Enforced per RULE_010  
**Throttle:** Maximum 3 changes per 24 hours (normal mode)

---

# 7. LATTi vs Manual Control

## 7.1 Control Mode Overview

DawnTrader supports **dual control modes** for guardrails and filters:

| Mode | Owner | Behavior |
|------|-------|----------|
| **LATTi-Managed** | LATTi (system) | Automatic optimization based on performance |
| **Manual Override** | User | User controls all values directly |

## 7.2 Current Default State

| Component | Default Mode | LATTi Active | Manual Override |
|-----------|--------------|--------------|-----------------|
| **Guardrails** | LATTi-managed | ✅ `tuned_by_latti = true` | ❌ `is_manual_override = false` |
| **Filters** | LATTi-managed | ✅ `managed_by_lottie = true` | ❌ `manual_override_enabled = false` |

## 7.3 Control Fields (Guardrails)

| Field | Column | Default | Description |
|-------|--------|---------|-------------|
| **Is Manual Override** | `is_manual_override` | false | User has taken control |
| **Tuned by LATTi** | `tuned_by_latti` | true | LATTi manages values |
| **Locked by User** | `locked_by_user` | {} | Per-parameter lock status |
| **Managed by LATTi** | `managed_by_lottie` | true | LATTi manages entire set |
| **Manual Override Enabled** | `manual_override_enabled` | false | Manual control enabled |
| **Last Updated By** | `last_updated_by` | null | Actor: "latti", "system", or user |

## 7.4 Mutual Exclusivity (RULE_005)

**Critical Constraint:** A parameter CANNOT be both manual override AND LATTi-managed simultaneously.

```
is_manual_override = true  → tuned_by_latti = false (user controls)
is_manual_override = false → tuned_by_latti = true  (LATTi controls)
```

Violating this rule triggers a coherency ERROR.

## 7.5 LATTi's Current State

**LATTi is currently PASSIVE-ONLY by design (Phase 8.8.3):**

| Capability | Status |
|------------|--------|
| Observe telemetry | ✅ Active |
| Record outcomes | ✅ Active |
| Collect passive learning data | ✅ Active |
| Track 24h statistics | ✅ Active |
| Open/close trades | ❌ Disabled until Phase 10/11 |
| Change guardrails autonomously | ❌ Disabled |
| Make autonomous decisions | ❌ Disabled |

## 7.6 Adaptive Guardrails Service

- **Location:** `server/services/adaptive-guardrails.ts`
- **Learning Modes:** slow, normal, aggressive, disabled
- **Throttle:** Max 3 changes per 24 hours (normal mode)
- **Adjustment Range:** ±1-5% micro-adjustments within coherency bounds

---

# 8. Trade Safety Checks

## 8.1 Pre-Trade Validation

All trades must pass through `checkGuardrailRisk()` in `server/services/trade-safety.ts`. This is the **single gate** for trade approval.

## 8.2 Check Sequence

| Order | Check | Block Code | Description |
|-------|-------|------------|-------------|
| 1 | Kill Switch | `KILL_SWITCH` | Trading suspended check |
| 2 | Stop-Loss Required | `NO_STOP_LOSS` | Stop-loss must be present |
| 3 | Stop-Loss Valid | `INVALID_STOP_LOSS` | Stop must be below entry |
| 4 | Max Positions Per Asset | `POSITION_LIMIT` | Max 1 position per symbol |
| 5 | Symbol Cooldown | `COOLDOWN` | Respect cooldown period |
| 6 | Position Size Cap | `MAX_POSITION` | Position within % limit |
| 7 | LPCP Protection | `LPCP_*` | (Dormant - always passes) |
| 8 | Max Open Trades | `MAX_TRADES` | Respect position limit |

## 8.3 All Block Reason Codes

| Code | Description | Currently Active |
|------|-------------|------------------|
| `KILL_SWITCH` | Kill switch tripped | ✅ Yes |
| `NO_STOP_LOSS` | Stop-loss required | ✅ Yes |
| `INVALID_STOP_LOSS` | Stop must be below entry | ✅ Yes |
| `POSITION_LIMIT` | Already have position in symbol | ✅ Yes |
| `COOLDOWN` | Symbol in cooldown period | ✅ Yes |
| `MAX_POSITION` | Position exceeds size cap | ✅ Yes |
| `LPCP_LOW_PRICE` | Low-priced coin blocked | ❌ Dormant |
| `LPCP_MIN_NOTIONAL` | Trade value too small | ❌ Dormant |
| `FX_CONVERSION_FAILED` | Currency conversion error | ✅ Yes |
| `PORTFOLIO_RISK` | Exceeds portfolio risk limit | ✅ Yes |
| `INSUFFICIENT_BALANCE` | Not enough balance | ✅ Yes |
| `MAX_EXPOSURE` | Exceeds exposure limit | ✅ Yes |
| `MAX_TOTAL_EXPOSURE` | Total portfolio exposure exceeded | ✅ Yes |
| `MAX_TRADES` | At maximum open trades | ✅ Yes |
| `ENGINE_STOPPING` | Engine in shutdown sequence | ✅ Yes |

---

# Appendix: Key File Locations

## Strategy Files
| Component | File |
|-----------|------|
| Strategy Engine | `server/services/strategy-engine.ts` |
| Signal Orchestrator | `server/services/signal-orchestrator.ts` |
| Paper Execution Engine | `server/services/paper-execution-engine.ts` |
| DHMA Tuning Service | `server/services/dhma-tuning-service.ts` |

## Guardrail Files
| Component | File |
|-----------|------|
| Guardrail Policy | `server/services/guardrail-policy.ts` |
| Trade Safety | `server/services/trade-safety.ts` |
| Adaptive Guardrails | `server/services/adaptive-guardrails.ts` |
| Coherency Rules | `audit/coherency_rules.yaml` |

## Filter Files
| Component | File |
|-----------|------|
| FX5 Scanner | `server/services/fx5-scanner.ts` |
| Filtered Pairs Service | `server/services/filtered-pairs-service.ts` |
| Active Filter Pool | `server/services/active-filter-pool.ts` |
| Market Scanner | `server/services/market-scanner.ts` |

## Goals & Learning Files
| Component | File |
|-----------|------|
| Goals Learning Engine | `server/services/goals-learning-engine.ts` |
| LATTi Manager | `server/services/latti-manager.ts` |

## Schema
| Component | File |
|-----------|------|
| Database Schema | `shared/schema.ts` |

---

**Document Status:** Complete  
**Last Updated:** December 12, 2025  
**Version:** 1.0
